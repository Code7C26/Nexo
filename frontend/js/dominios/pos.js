/**
 * dominios/pos.js
 * Punto de venta y turno de caja (CLAUDE.md §30, Etapa D). Es la pantalla de
 * mostrador sobre las rutas de server.js, sección "Punto de venta y turno de
 * caja" (hist. §67): no tiene circuito de datos propio, cada venta es una
 * venta común con sus cobros, colgada del turno abierto de la caja.
 */

import { camposFicha, cantidad, enCaja, esAdmin, esFraccionable, esc, fechaHoraAR, hoyISO, money, numero } from "../core/formato.js";
import { avisar, confirmar, filaVacia } from "../core/ui.js";
import { api, refrescar } from "../core/api.js";
import { icono } from "../core/iconos.js";
import { crearConsumos } from "../core/al-vender.js";
import { cantidadDeEtiqueta, leerEtiqueta } from "../core/balanza.js";
import { mejorOferta, proximaPromocion } from "../core/ofertas.js";
import { aplicarDescuento } from "../core/descuento.js";
import { aplicarPremios, textoPuntos } from "../core/puntos.js";
import { enlaceWhatsApp, llenarMensaje, textoDe } from "../core/mensajes.js";
import { pesosMensaje } from "../core/recordar.js";
import { moduloActivo, negocio } from "../core/negocio.js";
import {
  CONDICIONES_FISCALES,
  condicionFiscal,
  errorCuit,
  esCondicionFiscal,
  formatearCuit,
  letraPrevista,
  opcionesSelect
} from "../core/fiscal.js";
import { limpiarError, limpiarErrores, marcarError } from "../core/campos.js";
import { armarHojaFactura, armarReciboPago, cargarQr, imprimirComprobante, imprimirTicket, imprimirTicketDeVenta } from "../core/comprobante.js";
import { alEntrarEnVista, recargar } from "../core/registro.js";
import { formatear, t } from "../core/idioma.js";

const CONSUMIDOR_FINAL = "Consumidor final";
const MAX_RESULTADOS = 40;
const CENTAVO = 0.005;
// Por negocio (hist. §77): la caja elegida en uno no es una caja del otro.
const CLAVE_CAJA = `nexo.pos.caja.${document.documentElement.dataset.organizacion}`;
// Si este mostrador factura y si imprime el ticket: un local lo hace siempre
// igual, así que queda como se dejó la última vez.
const CLAVE_FACTURAR = `nexo.pos.facturar.${document.documentElement.dataset.organizacion}`;
const CLAVE_TICKET = `nexo.pos.ticket.${document.documentElement.dataset.organizacion}`;
const ICONO_TIPO_MEDIO = {
  efectivo: "banknote",
  debito: "credit-card",
  credito: "credit-card",
  transferencia: "arrow-right-left",
  billetera: "wallet",
  otro: "wallet"
};

let cuentas = []; // todas las cuentas de tesorería, con saldo
let cajas = []; // las de tipo efectivo: un turno es de una de ellas
// Los medios de cobro activos (hist. §171): lo que se ofrece al cobrar. Cada
// uno sabe a qué cuenta entra la plata; el punto de venta no elige cuentas.
let medios = [];
let cajaId = null;
let turno = null; // resumen del turno abierto de la caja elegida
// En la compu vinculada a una caja (hist. §199): la caja, quién atiende y
// quiénes pueden atender (GET /api/caja). null en una cuenta de persona.
let cajaVinculada = null;
let elegido = null; // el empleado que va a poner su PIN
// Los accesos rápidos de la caja (hist. §195): claves del catálogo, en orden.
let accesos = [];
let armando = false;
let catalogo = [];
let porClave = new Map();
// Las ofertas del negocio (hist. §133): el precio de cada renglón es el de la
// que gana hoy con esa cantidad, como lo calcula el servidor al anotarla.
let ofertas = [];
let clientes = [];
// Venta en curso: [{ clave, cantidad }]. Precio y stock salen del catálogo.
let carrito = [];
let ultimaAgregada = null;
// El descuento a mano sobre toda la venta (hist. §175): { tipo, valor } o null.
let descuento = null;
let editandoDescuento = false;
// El tipo elegido se recuerda aunque todavía no haya un número.
let tipoDescuento = "porcentaje";
// Puntos y premios (hist. §223): el programa con sus premios activos
// (GET /api/premios), los puntos del cliente elegido ({ id, saldo }) y los
// premios que se canjean en esta venta (ids, en el orden en que se eligieron).
let programaPuntos = { prendido: false, premios: [] };
let puntosCliente = null;
let canjes = [];

const vista = document.querySelector('section.view[data-view="pos"]');
const posApertura = document.getElementById("posApertura");
const posMostrador = document.getElementById("posMostrador");
const posBuscar = document.getElementById("posBuscar");
const posItems = document.getElementById("posItems");
const posRenglones = document.getElementById("posRenglones");
const posCliente = document.getElementById("posCliente");
const modalPosCobro = document.getElementById("modalPosCobro");
const modalPosCierre = document.getElementById("modalPosCierre");
const modalPosCamara = document.getElementById("modalPosCamara");
// Lo que se usa al vender (hist. §126): la bolsa, la caja, que se cambian acá.
const consumosPos = crearConsumos(document.getElementById("posConsumos"));

const redondear = (n) => Math.round(n * 100) / 100;
const redondearCantidad = (n) => Math.round(n * 1000) / 1000;
// Un servicio no tiene tope de stock: el catálogo lo manda con stock null.
const tope = (item) => item.stock ?? Infinity;
const hayStock = (item) => tope(item) > 0;
// Lo que no se vende por unidad (kg, litro, metro, gramo) pide cuánto: el
// peso o el importe.
const pideCantidad = (item) => Boolean(item.unidad) && item.unidad !== "unidad";
// Cuánto suma o resta el − y el + de un renglón.
const paso = (item) => (esFraccionable(item.unidad) ? 0.1 : item.unidad === "g" || item.unidad === "ml" ? 100 : 1);
const porUnidad = (item) => (pideCantidad(item) ? `/ ${item.unidad}` : "c/u");
const sinStock = (item) =>
  item.stock > 0
    ? `No hay más stock de "${item.nombre}" (disponible: ${cantidad(item.stock, item.unidad)}).`
    : `No hay stock de "${item.nombre}"${dondeHay(item)}.`;
// En qué otras sucursales hay, para mandar al cliente (hist. §193).
const dondeHay = (item) =>
  item.en_otras?.length
    ? `: hay en ${item.en_otras.map((o) => `${o.sucursal} (${cantidad(o.cantidad, item.unidad)})`).join(", ")}`
    : "";
const claveDe = (item) => `${item.producto_id}:${item.variante_id ?? ""}`;
const normalizar = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
const palabrasDe = (s) => normalizar(s).split(/[^a-z0-9]+/).filter(Boolean);
// En el celular, enfocar la búsqueda abre el teclado y tapa la pantalla: el
// foco automático es solo para mouse (con un lector físico al lado).
const conMouse = () => window.matchMedia("(pointer: fine)").matches;

// localStorage y sessionStorage pueden fallar (modo privado, cuota llena):
// sin ellos se pierde la comodidad de recordar, no la venta.
function leerGuardado(almacen, clave) {
  try {
    return almacen.getItem(clave);
  } catch {
    return null;
  }
}

function guardar(almacen, clave, valor) {
  try {
    if (valor === null) almacen.removeItem(clave);
    else almacen.setItem(clave, valor);
  } catch {}
}

function textoDiferencia(d) {
  if (Math.abs(d) < CENTAVO) return "Sin diferencia";
  return d > 0 ? `Sobran ${money(d)}` : `Faltan ${money(-d)}`;
}

// Cuadrar es lo resuelto (verde); que falte plata es lo urgente (rojo); que
// sobre tampoco está bien, pero no es urgente: va en tinta.
function claseDiferencia(d) {
  if (Math.abs(d) < CENTAVO) return "ledger-ok";
  return d < 0 ? "ledger-danger" : "";
}

// Mientras se espera al servidor el botón queda deshabilitado: en un
// mostrador, un doble Enter no puede registrar la venta dos veces.
async function enviando(boton, fn) {
  boton.disabled = true;
  try {
    return await fn();
  } finally {
    boton.disabled = false;
  }
}

function enfocarBusqueda() {
  if (!conMouse()) return;
  // Después del observer de core/ui.js, que devuelve el foco al cerrar un modal.
  requestAnimationFrame(() => posBuscar.focus());
}

/* ---------- Carga y estados de la pantalla ---------- */

async function cargarTodo() {
  const [abiertos, tesoreria, listaClientes] = await Promise.all([
    api("/api/turnos-caja?estado=abierto", { error: "No se pudo consultar la caja." }),
    api("/api/tesoreria", { error: "No se pudieron cargar las cuentas de tesorería." }),
    api("/api/clientes", { error: "No se pudieron cargar los clientes." }),
    consumosPos.cargar(),
    api("/api/ofertas", { error: "No se pudieron cargar las ofertas." }).then((lista) => (ofertas = lista)),
    api("/api/medios-cobro?activos=1", { error: "No se pudieron cargar los medios de cobro." }).then((lista) => (medios = lista)),
    moduloActivo("puntos")
      ? api("/api/premios", { error: "No se pudieron cargar los premios." }).then((p) => (programaPuntos = p))
      : (programaPuntos = { prendido: false, premios: [] })
  ]);
  cuentas = tesoreria.cuentas;
  // Solo las cajas de las sucursales donde trabaja esta persona (hist. §193).
  cajas = cuentas.filter((c) => c.tipo === "efectivo" && c.habilitada !== false);
  fijarClientes(listaClientes);

  // La caja se recuerda por dispositivo: la PC del mostrador opera siempre la
  // misma. Si no hay recuerdo, la que ya tiene un turno abierto. La compu
  // vinculada (hist. §199) es siempre la suya.
  const ids = cajas.map((c) => c.id);
  const recordada = enCaja() ? window.nexoCaja.id : Number(leerGuardado(localStorage, CLAVE_CAJA));
  cajaId = ids.includes(recordada)
    ? recordada
    : (abiertos.find((t) => ids.includes(t.cuenta_tesoreria_id))?.cuenta_tesoreria_id ?? ids[0] ?? null);
  if (enCaja()) cajaVinculada = await api("/api/caja", { error: "No se pudo cargar la caja." });
  turno = abiertos.find((t) => t.cuenta_tesoreria_id === cajaId) ?? null;
  try {
    accesos = JSON.parse(cuentas.find((c) => c.id === cajaId)?.accesos_rapidos ?? "[]");
  } catch {
    accesos = [];
  }
  armando = false;
  // El stock es el del depósito de la sucursal de la caja.
  fijarCatalogo(
    cajaId ? await api(`/api/pos/catalogo?caja=${cajaId}`, { error: "No se pudo cargar el catálogo." }) : []
  );
  if (turno) leerCarrito();
  else carrito = [];
  render();
}

// "Consumidor final" es el cliente de las ventas sin cliente: elegirlo a mano
// no cambia nada, y a ese cliente no se le fía.
function fijarClientes(lista) {
  clientes = lista.filter((c) => c.nombre !== CONSUMIDOR_FINAL);
  document.getElementById("posClientes").innerHTML = clientes
    .map((c) => `<option value="${esc(c.nombre)}"></option>`)
    .join("");
}

function fijarCatalogo(items) {
  // Las palabras del nombre, la categoría y el SKU, más el SKU entero (así
  // "gor-01-m" también se encuentra tal cual se tipea) y el código de barras.
  catalogo = items.map((i) => ({
    ...i,
    clave: claveDe(i),
    palabras: [
      ...palabrasDe(`${i.nombre} ${i.categoria ?? ""} ${i.sku ?? ""}`),
      normalizar(i.sku).trim(),
      normalizar(i.codigo_barras).trim()
    ].filter(Boolean)
  }));
  porClave = new Map(catalogo.map((i) => [i.clave, i]));
}

function render() {
  document.getElementById("posSinCajas").hidden = cajas.length > 0;
  const elegir = document.getElementById("posElegirCaja");
  elegir.hidden = enCaja() || cajas.length < 2;
  document.getElementById("posCaja").innerHTML = cajas
    .map((c) => `<option value="${c.id}" ${c.id === cajaId ? "selected" : ""}>${esc(c.nombre)}${c.sucursal ? ` · ${esc(c.sucursal)}` : ""}</option>`)
    .join("");

  // La compu de la caja, sin nadie atendiendo: solo "¿Quién atiende?".
  const bloqueada = enCaja() && !cajaVinculada?.atiende;
  document.getElementById("posQuien").hidden = !bloqueada;
  document.getElementById("posAtiende").hidden = !enCaja() || bloqueada;
  posApertura.hidden = bloqueada || !cajaId || !!turno;
  posMostrador.hidden = bloqueada || !turno;
  if (enCaja()) renderQuien();
  else refrescar([renderCompu()]);
  if (!cajaId || bloqueada) return;
  if (turno) {
    renderTurno();
    renderCatalogo();
    renderTicket();
  } else {
    renderApertura();
  }
}

async function entrarAlPos() {
  await cargarTodo();
  if (turno) enfocarBusqueda();
}

document.getElementById("posCaja").addEventListener("change", (e) => {
  guardar(localStorage, CLAVE_CAJA, e.target.value);
  refrescar([entrarAlPos()]);
});

/* ---------- Apertura de caja ---------- */

function renderApertura() {
  const caja = cajas.find((c) => c.id === cajaId);
  document.getElementById("posAperturaTitulo").textContent = `Abrir caja: ${caja.nombre}`;
  document.getElementById("posAperturaSaldo").textContent = `Según el sistema hay ${money(caja.saldo)}.`;
  refrescar([cargarCierres()]);
}

document.getElementById("btnPosCoincide").addEventListener("click", () => {
  const caja = cajas.find((c) => c.id === cajaId);
  document.getElementById("posAperturaContado").value = String(redondear(caja.saldo));
});

document.getElementById("formPosApertura").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const contado = Number(form.contado.value);
  if (!Number.isFinite(contado) || contado < 0) {
    avisar("Cargá cuánto efectivo hay en la caja.", "atencion");
    return;
  }
  const nota = form.nota.value.trim();
  const abierto = await enviando(form.querySelector('[type="submit"]'), () =>
    api("/api/turnos-caja", {
      method: "POST",
      body: { cuenta_tesoreria_id: cajaId, contado, ...(nota ? { nota } : {}) },
      error: "No se pudo abrir la caja."
    })
  );
  form.reset();
  if (Math.abs(abierto.diferencia_apertura) < CENTAVO) avisar("Caja abierta.", "ok");
  else avisar(`Caja abierta. ${textoDiferencia(abierto.diferencia_apertura)} contra el sistema: quedó registrado.`, "atencion");
  // Una diferencia de apertura es un movimiento de la caja.
  refrescar([recargar("caja")]);
  await refrescar([entrarAlPos()]);
});

// "19/10/2026, 09:00 a 18:30", o con las dos fechas si el turno pasó la
// medianoche.
function rangoTurno(t) {
  const [desdeFecha, desdeHora] = fechaHoraAR(t.abierto_en).split(" ");
  const [hastaFecha, hastaHora] = fechaHoraAR(t.cerrado_en).split(" ");
  return desdeFecha === hastaFecha
    ? `${desdeFecha}, ${desdeHora} a ${hastaHora}`
    : `${desdeFecha} ${desdeHora} a ${hastaFecha} ${hastaHora}`;
}

const quienesTurno = (t) =>
  t.abierto_por_nombre === t.cerrado_por_nombre ? t.abierto_por_nombre : `${t.abierto_por_nombre} y ${t.cerrado_por_nombre}`;

async function cargarCierres() {
  const cerrados = await api("/api/turnos-caja?estado=cerrado", { error: "No se pudieron cargar los cierres." });
  const body = document.getElementById("posCierresBody");
  if (cerrados.length === 0) {
    body.innerHTML = filaVacia(6, "Todavía no se cerró ningún turno.");
    return;
  }
  body.innerHTML = cerrados
    .slice(0, 10)
    .map((t) => {
      const clase = claseDiferencia(t.diferencia_cierre);
      return `
        <tr>
          <td data-label="Caja">${esc(t.cuenta)}</td>
          <td data-label="Turno">${esc(rangoTurno(t))}<span class="pos-celda-detalle">${esc(quienesTurno(t))}</span></td>
          <td data-label="Vendido" class="align-right"><span class="mono">${money(t.ventas.total)}</span><span class="pos-celda-detalle">${numero(t.ventas.cantidad)} ${t.ventas.cantidad === 1 ? "venta" : "ventas"}</span></td>
          <td data-label="Esperado" class="align-right mono">${money(t.esperado_cierre)}</td>
          <td data-label="Contado" class="align-right mono">${money(t.contado_cierre)}</td>
          <td data-label="Diferencia" class="align-right mono ${clase}">${esc(textoDiferencia(t.diferencia_cierre))}</td>
        </tr>`;
    })
    .join("");
}

/* ---------- Mostrador ---------- */

function renderTurno() {
  document.getElementById("posTurnoCaja").textContent = turno.sucursal ? `${turno.cuenta} · ${turno.sucursal}` : turno.cuenta;
  document.getElementById("posTurnoMeta").textContent =
    `Desde ${fechaHoraAR(turno.abierto_en)} · ${turno.abierto_por_nombre}`;
  document.getElementById("posTurnoVentas").textContent = numero(turno.ventas.cantidad);
  document.getElementById("posTurnoVendido").textContent = money(turno.ventas.total);
  document.getElementById("posTurnoEsperado").textContent = money(turno.esperado);
  document.getElementById("btnPosCamara").hidden = !("BarcodeDetector" in window && navigator.mediaDevices?.getUserMedia);
}

// Cada palabra buscada tiene que ser el comienzo de una palabra del producto,
// en cualquier orden y sin importar acentos ni mayúsculas: "rem m neg"
// encuentra "Remera — Talle: M / Color: Negra". Por el comienzo y no en
// cualquier parte: si no, la "m" de un talle aparece adentro de casi todo.
function filtrar(consulta) {
  const buscadas = normalizar(consulta)
    .split(/\s+/)
    .map((p) => p.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""))
    .filter(Boolean);
  return catalogo.filter((i) => buscadas.every((b) => i.palabras.some((p) => p.startsWith(b))));
}

const cantidadEnCarrito = (clave) => carrito.find((r) => r.clave === clave)?.cantidad ?? 0;

function renderCatalogo() {
  renderAccesos();
  const consulta = posBuscar.value.trim();
  // Lo que se puede vender primero; el orden alfabético del backend se
  // mantiene dentro de cada grupo (sort es estable).
  const lista = filtrar(consulta).sort((a, b) => hayStock(b) - hayStock(a));
  const mas = document.getElementById("posItemsMas");
  mas.hidden = lista.length <= MAX_RESULTADOS;
  mas.textContent = `Y ${numero(lista.length - MAX_RESULTADOS)} más: refiná la búsqueda.`;

  if (catalogo.length === 0) {
    posItems.innerHTML = `<p class="pos-vacio">Todavía no hay productos activos para vender.</p>`;
    return;
  }
  if (lista.length === 0) {
    posItems.innerHTML = `<p class="pos-vacio">Nada coincide con «${esc(consulta)}».</p>`;
    return;
  }
  posItems.innerHTML = lista
    .slice(0, MAX_RESULTADOS)
    .map((i) => {
      const enCarrito = cantidadEnCarrito(i.clave);
      // Lo que no hay acá no se vende acá, pero se avisa dónde hay (hist. §193).
      const enOtra = i.en_otras?.[0];
      const stock =
        i.stock === null
          ? "Servicio"
          : i.stock > 0
            ? `${cantidad(redondearCantidad(i.stock - enCarrito), i.unidad)} disp.`
            : enOtra
              ? `Sin stock · hay en ${enOtra.sucursal}${i.en_otras.length > 1 ? ` y ${i.en_otras.length - 1} más` : ""}`
              : "Sin stock";
      // Armando los accesos rápidos se puede marcar cualquiera, con stock o sin.
      const clases = armando && accesos.includes(i.clave) ? "pos-item es-acceso" : "pos-item";
      return `
        <button type="button" class="${clases}" data-clave="${esc(i.clave)}" ${hayStock(i) || armando ? "" : "disabled"}>
          <span class="pos-item-nombre">${esc(i.nombre)}</span>
          <span class="pos-item-meta">${esc([i.sku, i.categoria].filter(Boolean).join(" · "))}</span>
          <span class="pos-item-pie">
            <span class="pos-item-precio mono">${money(i.precio)}${pideCantidad(i) ? `<small> / ${esc(i.unidad)}</small>` : ""}</span>
            <span class="pos-item-stock">${esc(stock)}</span>
          </span>
          ${enCarrito ? `<span class="pos-item-en-venta mono" aria-label="En la venta">${numero(enCarrito)}</span>` : ""}
        </button>`;
    })
    .join("");
}

// Un solo listener para toda la grilla: se vuelve a dibujar con cada tecla
// de la búsqueda, y atar uno por botón en cada dibujo no suma nada.
posItems.addEventListener("click", (e) => {
  const boton = e.target.closest(".pos-item");
  if (!boton || boton.disabled) return;
  if (armando) alternarAcceso(boton.dataset.clave);
  else agregar(boton.dataset.clave);
});

/* ---------- Accesos rápidos (hist. §195) ---------- */

// La botonera de los productos de siempre de esta caja, arriba del catálogo.
// La arma el cajero: "Armar" pasa la grilla a modo de marcar, y "Listo" la
// guarda en la caja. Un acceso a un producto que ya no está, no se muestra.
const posAccesos = document.getElementById("posAccesos");

function renderAccesos() {
  const items = accesos.map((clave) => porClave.get(clave)).filter(Boolean);
  const botones = items.map(
    (i) => `
      <button type="button" class="pos-acceso" data-acceso="${esc(i.clave)}" ${hayStock(i) ? "" : "disabled"}>
        <span>${esc(i.nombre)}</span><small class="mono">${money(i.precio)}</small>
      </button>`
  );
  const armar = armando
    ? ""
    : `<button type="button" class="pos-acceso pos-acceso-armar" data-armar>${items.length ? "Cambiar los accesos" : "Armar accesos rápidos"}</button>`;
  posAccesos.innerHTML = botones.join("") + armar;
  document.getElementById("posArmando").hidden = !armando;
}

function alternarAcceso(clave) {
  accesos = accesos.includes(clave) ? accesos.filter((c) => c !== clave) : [...accesos, clave];
  renderAccesos();
  renderCatalogo();
}

posAccesos.addEventListener("click", (e) => {
  const acceso = e.target.closest("[data-acceso]");
  if (acceso && !acceso.disabled && !armando) agregar(acceso.dataset.acceso);
  if (e.target.closest("[data-armar]")) {
    armando = true;
    posBuscar.value = "";
    renderAccesos();
    renderCatalogo();
  }
});

document.getElementById("btnPosArmadoListo").addEventListener("click", async (e) => {
  const { claves } = await enviando(e.currentTarget, () =>
    api(`/api/cajas/${cajaId}/accesos`, { method: "PUT", body: { claves: accesos }, error: "No se pudieron guardar los accesos rápidos." })
  );
  accesos = claves;
  const caja = cuentas.find((c) => c.id === cajaId);
  if (caja) caja.accesos_rapidos = JSON.stringify(claves);
  armando = false;
  renderAccesos();
  renderCatalogo();
  avisar(claves.length ? "Accesos rápidos guardados en esta caja." : "Sin accesos rápidos en esta caja.", "ok");
});

posBuscar.addEventListener("input", renderCatalogo);

// Enter es lo que manda el lector de código de barras al final de cada
// lectura (y lo que aprieta quien tipeó un SKU a mano).
posBuscar.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const consulta = posBuscar.value.trim();
  if (consulta) agregarPorCodigo(consulta);
});

// Gana el código de barras exacto (sin espacios, como lo guarda Nexo), después
// la etiqueta de la balanza y el SKU exacto; si no, sirve un único resultado
// que se pueda vender. Si hay varios, la grilla queda filtrada para elegir con
// el dedo.
function agregarPorCodigo(codigo) {
  const buscado = codigo.toLowerCase();
  const sinEspacios = buscado.replace(/\s+/g, "");
  const delEnvase = catalogo.find((i) => i.codigo_barras && i.codigo_barras.toLowerCase() === sinEspacios);
  if (!delEnvase && agregarEtiqueta(sinEspacios)) {
    // La grilla quedó filtrada por los números de la etiqueta.
    posBuscar.value = "";
    renderCatalogo();
    return;
  }
  const exacto = delEnvase ?? catalogo.find((i) => i.sku && i.sku.trim().toLowerCase() === buscado);
  const candidatos = exacto ? [exacto] : filtrar(codigo).filter(hayStock);
  if (candidatos.length === 1) {
    posBuscar.value = "";
    agregar(candidatos[0].clave);
    return;
  }
  if (candidatos.length === 0) {
    avisar(`No se encontró «${codigo}».`, "atencion");
    // Seleccionado, así la próxima lectura lo reemplaza en vez de sumarse.
    posBuscar.select();
  }
  renderCatalogo();
}

// La etiqueta de la balanza (hist. §132): el renglón entra con el peso que
// trae, al precio de hoy (nunca el de la etiqueta). Devuelve si el código era
// una etiqueta, aunque no se haya podido sumar (ya avisó por qué).
function agregarEtiqueta(codigo) {
  const formato = negocio.balanza;
  const lectura = formato ? leerEtiqueta(codigo, formato) : null;
  if (!lectura) return false;
  const item = catalogo.find((i) => i.plu === lectura.plu);
  if (!item) {
    avisar(`La etiqueta es del código de balanza ${lectura.plu}, y ningún producto lo tiene. Cargalo en el producto.`, "atencion");
    return true;
  }
  const cuanto = cantidadDeEtiqueta(lectura, formato, item);
  if (!(cuanto > 0)) {
    avisar(
      item.precio > 0
        ? `"${item.nombre}" no se vende por peso: cambiá su unidad para leer la etiqueta.`
        : `"${item.nombre}" no tiene precio: sin él no se sabe cuánto pesa.`,
      "atencion"
    );
    return true;
  }
  sumar(item.clave, cuanto);
  return true;
}

// Tocar un producto o leer su código: por unidad suma uno; por peso, volumen
// o largo pregunta cuánto.
function agregar(clave) {
  const item = porClave.get(clave);
  if (!item) return;
  if (pideCantidad(item)) abrirCantidad(item);
  else sumar(clave, 1);
}

function sumar(clave, delta) {
  const item = porClave.get(clave);
  const renglon = carrito.find((r) => r.clave === clave);
  const nueva = redondearCantidad((renglon?.cantidad ?? 0) + delta);
  if (nueva > tope(item)) {
    avisar(sinStock(item), "atencion");
    return;
  }
  if (renglon) renglon.cantidad = nueva;
  else carrito.push({ clave, cantidad: nueva });
  ultimaAgregada = clave;
  cambioElCarrito();
}

function fijarCantidad(clave, valor) {
  const item = porClave.get(clave);
  const renglon = carrito.find((r) => r.clave === clave);
  if (!item || !renglon) return;
  const nueva = redondearCantidad(valor);
  if (!(nueva > 0)) {
    carrito = carrito.filter((r) => r.clave !== clave);
  } else if (nueva > tope(item)) {
    avisar(sinStock(item), "atencion");
    renglon.cantidad = item.stock;
  } else {
    renglon.cantidad = nueva;
  }
  cambioElCarrito();
}

/* --- Cuánto de un producto por peso, volumen o largo --- */

const modalPosCantidad = document.getElementById("modalPosCantidad");
const posCantidadValor = document.getElementById("posCantidadValor");
const posCantidadImporte = document.getElementById("posCantidadImporte");
let itemCantidad = null;

function abrirCantidad(item) {
  itemCantidad = item;
  document.getElementById("modalPosCantidadTitulo").textContent = item.nombre;
  document.getElementById("posCantidadPrecio").textContent = `${money(item.precio)} ${porUnidad(item)}`;
  document.getElementById("posCantidadEtiqueta").textContent = `Cantidad (${item.unidad})`;
  posCantidadValor.step = esFraccionable(item.unidad) ? "0.001" : "1";
  document.getElementById("formPosCantidad").reset();
  modalPosCantidad.hidden = false;
}

// Se carga uno y se calcula el otro: "$5.000 de asado" o "0,750 kg".
posCantidadValor.addEventListener("input", () => {
  const valor = Number(posCantidadValor.value);
  posCantidadImporte.value = valor > 0 ? String(redondear(valor * itemCantidad.precio)) : "";
});
posCantidadImporte.addEventListener("input", () => {
  const importe = Number(posCantidadImporte.value);
  if (!(importe > 0) || !(itemCantidad.precio > 0)) return;
  const valor = importe / itemCantidad.precio;
  posCantidadValor.value = String(esFraccionable(itemCantidad.unidad) ? redondearCantidad(valor) : Math.round(valor));
});

document.getElementById("formPosCantidad").addEventListener("submit", (e) => {
  e.preventDefault();
  const valor = Number(posCantidadValor.value);
  if (!(valor > 0)) {
    avisar("Cargá cuánto llevás.", "atencion");
    return;
  }
  modalPosCantidad.hidden = true;
  sumar(itemCantidad.clave, valor);
  enfocarBusqueda();
});
document.getElementById("modalPosCantidadClose").addEventListener("click", () => {
  modalPosCantidad.hidden = true;
});
modalPosCantidad.addEventListener("click", (e) => {
  if (e.target === modalPosCantidad) modalPosCantidad.hidden = true;
});

function cambioElCarrito() {
  guardarCarrito();
  renderTicket();
  renderCatalogo();
}

/* ---------- Ticket (venta en curso) ---------- */

// El carrito se guarda en la pestaña, por turno: un F5 en medio de una
// venta no la pierde. Se guardan claves y cantidades; precio y stock se
// vuelven a tomar del catálogo, que pudo cambiar.
const claveCarrito = () => `nexo.pos.carrito.${turno.id}`;
const claveDescuento = () => `nexo.pos.descuento.${turno.id}`;

function guardarCarrito() {
  // Sin productos no queda descuento: es de esta venta, no de la próxima.
  if (carrito.length === 0) {
    descuento = null;
    editandoDescuento = false;
  }
  if (!turno) return;
  guardar(sessionStorage, claveCarrito(), carrito.length ? JSON.stringify(carrito) : null);
  guardar(sessionStorage, claveDescuento(), descuento ? JSON.stringify(descuento) : null);
}

function leerCarrito() {
  let guardado;
  try {
    guardado = JSON.parse(leerGuardado(sessionStorage, claveCarrito()) ?? "[]");
  } catch {
    guardado = [];
  }
  carrito = (Array.isArray(guardado) ? guardado : [])
    .filter((r) => porClave.has(r.clave) && hayStock(porClave.get(r.clave)) && r.cantidad > 0)
    .map((r) => ({
      clave: r.clave,
      cantidad: Math.min(r.cantidad, tope(porClave.get(r.clave))),
      // El plan en cuotas (hist. §216), si el producto lo sigue teniendo.
      ...(planDelRenglon({ clave: r.clave, plan: r.plan }) ? { plan: r.plan } : {})
    }));
  try {
    descuento = carrito.length ? JSON.parse(leerGuardado(sessionStorage, claveDescuento()) ?? "null") : null;
  } catch {
    descuento = null;
  }
  editandoDescuento = Boolean(descuento);
  if (descuento) tipoDescuento = descuento.tipo;
  document.getElementById("posDescuentoValor").value = descuento?.valor ?? "";
}

// El plan en cuotas elegido para un renglón (hist. §216), o null.
function planDelRenglon(r) {
  if (!r.plan) return null;
  return porClave.get(r.clave)?.planes_pago?.find((p) => p.cuotas === r.plan) ?? null;
}

// Lo que se paga hoy: la primera cuota de lo que va en cuotas, más lo demás.
const primeraCuota = () =>
  redondear(
    carrito.reduce((acc, r) => {
      const plan = planDelRenglon(r);
      return acc + r.cantidad * (plan ? plan.importe_cuota : precioDelRenglon(r).precio);
    }, 0) - montoDescuento()
  );
const hayCuotas = () => carrito.some((r) => planDelRenglon(r));

// El precio de un renglón con su cantidad: el de la oferta que gana hoy, o el
// de lista; en cuotas, el del plan. promo es la promoción por cantidad que se
// gana llevando más.
function precioDelRenglon(r) {
  const item = porClave.get(r.clave);
  const plan = planDelRenglon(r);
  if (plan) return { precio: redondear(plan.cuotas * plan.importe_cuota), oferta: null, promo: null, plan };
  const renglon = {
    producto_id: item.producto_id,
    categoria_id: item.categoria_id,
    lista_id: item.lista_precio_id,
    cantidad: r.cantidad,
    precio_lista: item.precio
  };
  const hoy = hoyISO();
  const mejor = mejorOferta(ofertas, renglon, hoy);
  return { precio: mejor?.precio ?? item.precio, oferta: mejor?.oferta ?? null, promo: proximaPromocion(ofertas, renglon, hoy) };
}

const itemsDelCarrito = () =>
  carrito.map((r) => {
    const item = porClave.get(r.clave);
    const plan = planDelRenglon(r);
    return {
      producto_id: item.producto_id,
      variante_id: item.variante_id,
      cantidad: r.cantidad,
      precio_unitario: precioDelRenglon(r).precio,
      ...(plan ? { plan_cuotas: plan.cuotas } : {})
    };
  });

const subtotalCarrito = () => redondear(carrito.reduce((acc, r) => acc + r.cantidad * precioDelRenglon(r).precio, 0));
// Los premios canjeados en esta venta (hist. §223), los que siguen activos.
const premiosElegidos = () => canjes.map((id) => programaPuntos.premios.find((p) => p.id === id)).filter(Boolean);
const premiosDeDescuento = () => premiosElegidos().filter((p) => p.tipo !== "producto");
const puntosElegidos = () => premiosElegidos().reduce((acc, p) => acc + p.puntos, 0);
// Los premios de descuento bajan primero, con las reglas del servidor
// (core/puntos.js): { renglones: [{ precio }], montos } o { error }.
function premiosDelCarrito() {
  const renglones = carrito.map((r) => ({ cantidad: r.cantidad, precio: precioDelRenglon(r).precio }));
  const premios = premiosDeDescuento();
  if (!premios.length) return { renglones, montos: [] };
  if (!carrito.length) return { error: t("Sumá algo a la venta para usar un premio de descuento.") };
  return aplicarPremios(renglones, premios);
}
const montoPremios = () => redondear((premiosDelCarrito().montos ?? []).reduce((acc, m) => acc + m, 0));
// El descuento repartido entre los renglones, con las reglas del servidor:
// { monto } o { error } (más que el total, 0…), o null sin descuento. Va sobre
// lo que dejaron los premios.
function descuentoDelCarrito() {
  if (!descuento || !carrito.length) return null;
  const conPremios = premiosDelCarrito();
  if (conPremios.error) return null;
  return aplicarDescuento(
    carrito.map((r, i) => ({ cantidad: r.cantidad, precio: conPremios.renglones[i].precio })),
    descuento
  );
}
const montoDescuento = () => descuentoDelCarrito()?.monto ?? 0;
const totalCarrito = () => redondear(subtotalCarrito() - montoPremios() - montoDescuento());
// Un premio de producto (hist. §223) es una venta aunque no haya nada más.
const hayParaCobrar = () => carrito.length > 0 || premiosElegidos().some((p) => p.tipo === "producto");
// Lo que viaja con la venta: los precios sin el descuento y el descuento
// aparte, que el servidor vuelve a repartir.
const descuentoParaEnviar = () => (montoDescuento() > 0 ? { descuento } : {});
// Lo que bajaron las ofertas en toda la venta.
const ahorroCarrito = () =>
  redondear(carrito.reduce((acc, r) => acc + r.cantidad * (porClave.get(r.clave).precio - precioDelRenglon(r).precio), 0));

function renderTicket() {
  const total = totalCarrito();

  if (carrito.length === 0) {
    posRenglones.innerHTML = `<li class="pos-ticket-vacio">Buscá un producto o pasá el lector para empezar.</li>`;
  } else {
    posRenglones.innerHTML = carrito
      .map((r) => {
        const item = porClave.get(r.clave);
        const { precio, oferta, promo, plan } = precioDelRenglon(r);
        const nuevo = r.clave === ultimaAgregada ? " pos-renglon-nuevo" : "";
        // En cuotas (hist. §216): si el producto tiene planes, se elige acá.
        const planes = item.planes_pago ?? [];
        const comoPaga = planes.length
          ? `<select class="pos-renglon-plan" aria-label="Cómo paga ${esc(item.nombre)}">
              <option value="">${esc(t("1 pago"))}</option>
              ${planes
                .map((p) => `<option value="${esc(p.cuotas)}" ${plan?.cuotas === p.cuotas ? "selected" : ""}>${esc(formatear("{0} cuotas de {1}", p.cuotas, money(p.importe_cuota)))}</option>`)
                .join("")}
            </select>`
          : "";
        const tachado = oferta ? `<s class="precio-tachado">${money(item.precio)}</s> ` : "";
        const etiqueta = oferta ? `<span class="oferta-etiqueta">${esc(oferta.nombre)}</span>` : "";
        // La promoción por cantidad, antes de llegar a ella.
        const proxima = promo
          ? `<span class="oferta-proxima">Llevando ${esc(cantidad(promo.oferta.cantidad_minima, item.unidad))} o más: ${money(promo.precio)} ${esc(porUnidad(item))}</span>`
          : "";
        return `
          <li class="pos-renglon${nuevo}" data-clave="${esc(r.clave)}">
            <div class="pos-renglon-info">
              <span class="pos-renglon-nombre">${esc(item.nombre)}${etiqueta}</span>
              <span class="pos-renglon-precio mono">${tachado}${money(precio)} ${esc(porUnidad(item))}</span>
              ${proxima}
              ${comoPaga}
            </div>
            <div class="pos-cantidad">
              <button type="button" class="pos-cantidad-btn" data-accion="menos" aria-label="Menos">${icono("minus")}</button>
              <input type="number" class="pos-cantidad-input" value="${Number(r.cantidad)}" min="0" step="any" inputmode="decimal" aria-label="Cantidad de ${esc(item.nombre)}" />
              <button type="button" class="pos-cantidad-btn" data-accion="mas" aria-label="Más">${icono("plus")}</button>
            </div>
            <span class="pos-renglon-subtotal mono">${money(r.cantidad * precio)}</span>
            <button type="button" class="btn-icon pos-renglon-quitar" data-accion="quitar" aria-label="Quitar ${esc(item.nombre)}">${icono("trash-2")}</button>
          </li>`;
      })
      .join("");
  }
  ultimaAgregada = null;
  if (carrito.length === 0) consumosPos.reiniciar();
  else consumosPos.proponer(itemsDelCarrito());

  renderDescuento();
  renderPuntos();
  document.getElementById("posTotal").textContent = money(total);
  const ahorro = ahorroCarrito();
  const posAhorro = document.getElementById("posAhorro");
  posAhorro.hidden = !(ahorro >= CENTAVO);
  posAhorro.textContent = ahorro >= CENTAVO ? `Ahorra ${money(ahorro)} con las ofertas` : "";
  document.getElementById("posBarraTotal").textContent = money(total);
  // Se cuentan renglones, no unidades: 0,750 kg de asado es un producto.
  document.getElementById("posBarraCantidad").textContent =
    carrito.length === 0 ? "Sin productos" : `${numero(carrito.length)} ${carrito.length === 1 ? "producto" : "productos"}`;
  document.getElementById("btnPosVaciar").hidden = carrito.length === 0;
  document.getElementById("btnPosCobrar").disabled = !hayParaCobrar();
  document.getElementById("btnPosBarraCobrar").disabled = !hayParaCobrar();
}

/* ---------- Puntos y premios (hist. §223) ---------- */

const posPuntos = document.getElementById("posPuntos");
const posPremios = document.getElementById("posPremios");

// "Medialuna de regalo" ya dice lo que es: no se repite abajo.
const mismoTexto = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

// El cliente del campo, si es uno de la lista (no "Consumidor final").
const clienteDelCampo = () => resolverCliente().cliente ?? null;

// Los puntos del cliente elegido. Cambiar de cliente saca los premios elegidos:
// eran de los puntos del otro.
async function cargarPuntosDelCliente() {
  const cliente = programaPuntos.prendido ? clienteDelCampo() : null;
  if (cliente?.id === puntosCliente?.id) return;
  canjes = [];
  puntosCliente = null;
  posPremios.hidden = true;
  if (cliente) {
    const puntos = await api(`/api/clientes/${cliente.id}/puntos`, { error: "No se pudieron cargar sus puntos." });
    // Si mientras tanto se eligió otro, este ya no va.
    if (clienteDelCampo()?.id === cliente.id) puntosCliente = { id: cliente.id, saldo: puntos.saldo, proximo: puntos.proximo };
  }
  renderTicket();
}

function renderPuntos() {
  posPuntos.hidden = !programaPuntos.prendido || !puntosCliente;
  if (posPuntos.hidden) return;
  const quedan = puntosCliente.saldo - puntosElegidos();
  document.getElementById("posPuntosSaldo").textContent = canjes.length
    ? formatear("Le quedan {0}", textoPuntos(quedan))
    : formatear("Tiene {0}", textoPuntos(Math.max(0, puntosCliente.saldo)));
  const canjeables = programaPuntos.premios.length > 0;
  const boton = document.getElementById("btnPosCanjear");
  boton.hidden = !canjeables;
  boton.setAttribute("aria-expanded", String(!posPremios.hidden));

  const montos = premiosDelCarrito().montos ?? [];
  let deDescuento = 0;
  document.getElementById("posCanjes").innerHTML = premiosElegidos()
    .map((p) => {
      const efecto = p.tipo === "producto" ? t("de regalo") : `− ${money(montos[deDescuento++] ?? 0)}`;
      return `
        <li class="pos-canje" data-premio="${p.id}">
          <span class="pos-canje-nombre">${esc(p.nombre)}<small>${esc(textoPuntos(p.puntos))}</small></span>
          <span class="pos-canje-efecto mono">${esc(efecto)}</span>
          <button type="button" class="btn-icon" data-quitar-premio="${p.id}" aria-label="${esc(formatear("Sacar {0}", p.nombre))}">${icono("x")}</button>
        </li>`;
    })
    .join("");

  // Lo que le alcanza: cada premio una vez por venta, y el de producto si hay stock.
  posPremios.innerHTML = programaPuntos.premios
    .map((p) => {
      const elegido = canjes.includes(p.id);
      const regalo = p.tipo === "producto" ? porClave.get(`${p.producto_id}:${p.variante_id ?? ""}`) : null;
      const motivo =
        elegido ? t("Ya está en la venta")
        : p.puntos > quedan ? formatear("Le faltan {0}", textoPuntos(p.puntos - quedan))
        : p.tipo === "producto" && !(regalo && hayStock(regalo)) ? t("No hay stock")
        : p.tipo !== "producto" && hayCuotas() ? t("No va con algo en cuotas")
        : "";
      return `
        <button type="button" class="pos-premio" data-premio="${p.id}" ${motivo ? "disabled" : ""}>
          <span class="pos-premio-nombre">${esc(p.nombre)}${mismoTexto(p.nombre, p.descripcion) ? "" : `<small>${esc(p.descripcion)}</small>`}</span>
          <span class="pos-premio-puntos mono">${esc(motivo || textoPuntos(p.puntos))}</span>
        </button>`;
    })
    .join("");

  const error = document.getElementById("posPuntosError");
  const conPremios = premiosDelCarrito();
  error.hidden = !conPremios.error;
  error.textContent = conPremios.error ?? "";
}

posCliente.addEventListener("change", () => refrescar([cargarPuntosDelCliente()]));
posCliente.addEventListener("input", () => {
  // Al elegir de la lista llega un input con el nombre entero.
  if (clienteDelCampo()?.id !== puntosCliente?.id) refrescar([cargarPuntosDelCliente()]);
});

document.getElementById("btnPosCanjear").addEventListener("click", () => {
  posPremios.hidden = !posPremios.hidden;
  renderPuntos();
});

posPremios.addEventListener("click", (e) => {
  const boton = e.target.closest("[data-premio]");
  if (!boton || boton.disabled) return;
  canjes.push(Number(boton.dataset.premio));
  posPremios.hidden = true;
  renderTicket();
});

document.getElementById("posCanjes").addEventListener("click", (e) => {
  const boton = e.target.closest("[data-quitar-premio]");
  if (!boton) return;
  canjes = canjes.filter((id) => id !== Number(boton.dataset.quitarPremio));
  renderTicket();
});

// Lo que viaja con la venta: los premios elegidos, y el servidor vuelve a
// aplicarlos con las mismas reglas.
const canjesParaEnviar = () => (canjes.length ? { canjes: premiosElegidos().map((p) => p.id) } : {});

/* ---------- Descuento a mano (hist. §175) ---------- */

const posDescuentoValor = document.getElementById("posDescuentoValor");

function renderDescuento() {
  const conDescuento = descuentoDelCarrito();
  document.getElementById("posDescuento").hidden = carrito.length === 0;
  document.getElementById("btnPosDescuento").hidden = editandoDescuento;
  document.getElementById("posDescuentoEditor").hidden = !editandoDescuento;
  for (const boton of document.querySelectorAll("#posDescuentoEditor [data-tipo]")) {
    boton.setAttribute("aria-pressed", String(boton.dataset.tipo === tipoDescuento));
  }
  posDescuentoValor.placeholder = tipoDescuento === "porcentaje" ? "10" : "1000";
  document.getElementById("posDescuentoMonto").textContent = conDescuento?.monto ? `− ${money(conDescuento.monto)}` : "";
  const error = document.getElementById("posDescuentoError");
  error.hidden = !conDescuento?.error;
  error.textContent = conDescuento?.error ?? "";
}

function leerDescuento() {
  const texto = posDescuentoValor.value.trim();
  descuento = texto === "" ? null : { tipo: tipoDescuento, valor: Number(texto) };
  guardarCarrito();
  renderTicket();
}

document.getElementById("btnPosDescuento").addEventListener("click", () => {
  editandoDescuento = true;
  posDescuentoValor.value = "";
  renderTicket();
  posDescuentoValor.focus();
});

document.getElementById("posDescuentoEditor").addEventListener("click", (e) => {
  const boton = e.target.closest("[data-tipo]");
  if (!boton) return;
  tipoDescuento = boton.dataset.tipo;
  leerDescuento();
  posDescuentoValor.focus();
});

posDescuentoValor.addEventListener("input", leerDescuento);
// Enter cobra, como el resto del mostrador.
posDescuentoValor.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  abrirCobro();
});

document.getElementById("btnPosDescuentoQuitar").addEventListener("click", () => {
  descuento = null;
  editandoDescuento = false;
  posDescuentoValor.value = "";
  guardarCarrito();
  renderTicket();
  enfocarBusqueda();
});

posRenglones.addEventListener("click", (e) => {
  const boton = e.target.closest("[data-accion]");
  if (!boton) return;
  const clave = boton.closest(".pos-renglon").dataset.clave;
  const actual = cantidadEnCarrito(clave);
  const item = porClave.get(clave);
  if (boton.dataset.accion === "mas") sumar(clave, paso(item));
  if (boton.dataset.accion === "menos") fijarCantidad(clave, actual - paso(item));
  if (boton.dataset.accion === "quitar") fijarCantidad(clave, 0);
});

posRenglones.addEventListener("change", (e) => {
  const plan = e.target.closest(".pos-renglon-plan");
  if (plan) {
    const renglon = carrito.find((r) => r.clave === plan.closest(".pos-renglon").dataset.clave);
    if (!renglon) return;
    if (plan.value) renglon.plan = Number(plan.value);
    else delete renglon.plan;
    // El descuento a mano no va con algo en cuotas: el precio es el del plan.
    if (renglon.plan && descuento) {
      descuento = null;
      editandoDescuento = false;
      avisar(t("Con algo en cuotas no va el descuento a mano: lo saqué."), "atencion");
    }
    cambioElCarrito();
    return;
  }
  const input = e.target.closest(".pos-cantidad-input");
  if (input) fijarCantidad(input.closest(".pos-renglon").dataset.clave, Number(input.value));
});

document.getElementById("btnPosVaciar").addEventListener("click", async () => {
  const ok = await confirmar({
    titulo: "Vaciar venta",
    cuerpo: "Se quitan todos los productos de la venta en curso.",
    aceptar: "Vaciar",
    destructivo: true
  });
  if (!ok) return;
  carrito = [];
  canjes = [];
  cambioElCarrito();
});

document.getElementById("posBarraResumen").addEventListener("click", () => {
  document.getElementById("posTicket").scrollIntoView({ behavior: "smooth", block: "start" });
});

/* ---------- Cobro ---------- */

// filas: [{ medio_id, cuotas, importe }]. Cada medio de cobro (hist. §171) sabe
// a qué cuenta entra la plata. El efectivo es siempre la caja del turno: un
// cobro en efectivo a otra cuenta no entraría en el arqueo.
let cobro = null;

const medioPorId = (id) => medios.find((m) => m.id === id);
const medioEfectivo = () => medios.find((m) => m.tipo === "efectivo");
const textoCuotas = (cuotas) => (cuotas === 1 ? "1 pago" : `${cuotas} cuotas`);
// Un crédito arranca en un solo pago si lo ofrece, y si no, en su primer plan.
function cuotasIniciales(medio) {
  if (medio?.tipo !== "credito" || !medio.planes.length) return null;
  return (medio.planes.find((p) => p.cuotas === 1) ?? medio.planes[0]).cuotas;
}

// Una transferencia cae en la cuenta que se elige al cobrar (el banco, Mercado
// Pago…): cualquiera menos la caja. Arranca en la del medio (hist. §172).
const cuentasDeTransferencia = () => cuentas.filter((c) => c.tipo !== "efectivo");
function cuentaInicial(medio) {
  if (medio?.tipo !== "transferencia") return null;
  const posibles = cuentasDeTransferencia();
  return (posibles.find((c) => c.id === medio.cuenta_tesoreria_id) ?? posibles[0])?.id ?? null;
}

function resolverCliente() {
  const nombre = posCliente.value.trim();
  if (!nombre || nombre.toLowerCase() === CONSUMIDOR_FINAL.toLowerCase()) return { cliente: null };
  const cliente = clientes.find((c) => c.nombre.trim().toLowerCase() === nombre.toLowerCase());
  return cliente ? { cliente } : { error: `No hay un cliente «${nombre}». Elegilo de la lista, o dejá el campo vacío para vender a consumidor final.` };
}

function abrirCobro() {
  if (!turno || !hayParaCobrar()) return;
  const { cliente, error } = resolverCliente();
  if (error) {
    avisar(error, "atencion");
    posCliente.focus();
    return;
  }
  const errorPremios = premiosDelCarrito().error;
  if (errorPremios) {
    avisar(errorPremios, "atencion");
    return;
  }
  const errorDescuento = descuentoDelCarrito()?.error;
  if (errorDescuento) {
    avisar(errorDescuento, "atencion");
    posDescuentoValor.focus();
    return;
  }
  if (medios.length === 0) {
    avisar("No hay medios de cobro activos. El administrador los arma en Configuración → Medios de cobro.", "atencion");
    return;
  }
  // En cuotas (hist. §216), lo que falta queda en la cuenta del cliente: tiene
  // que haber uno. Se propone cobrar la primera cuota.
  if (hayCuotas() && !cliente) {
    avisar(t("Para vender en cuotas, elegí el cliente: lo que falta pagar queda en su cuenta corriente."), "atencion");
    posCliente.focus();
    return;
  }
  const total = totalCarrito();
  const hoyPaga = hayCuotas() ? primeraCuota() : total;
  // Arranca en efectivo: es lo que más se usa, y un toque lo cambia.
  const inicial = medioEfectivo() ?? medios[0];
  cobro = {
    total,
    cliente,
    facturar: sePuedeFacturar() && leerGuardado(localStorage, CLAVE_FACTURAR) === "1",
    filas: [{ medio_id: inicial.id, cuotas: cuotasIniciales(inicial), cuenta_id: cuentaInicial(inicial), importe: hoyPaga }]
  };

  document.getElementById("formPosCobro").hidden = false;
  document.getElementById("posExito").hidden = true;
  document.getElementById("posCobroCliente").textContent = cliente ? cliente.nombre : CONSUMIDOR_FINAL;
  document.getElementById("posCobroTotal").textContent = money(total);
  document.getElementById("posMedios").innerHTML = medios
    .map(
      (m) =>
        `<button type="button" class="pos-medio" data-medio="${m.id}">${icono(ICONO_TIPO_MEDIO[m.tipo] ?? "wallet")} ${esc(m.nombre)}</button>`
    )
    .join("");
  renderFilasCobro();
  cerrarClienteCuit();
  renderComprobante();
  actualizarCobro();
  btnPosQr.hidden = !negocio.mercado_pago?.conectado;
  posQr.hidden = true;
  modalPosCobro.hidden = false;
  // Seleccionado: tipear "20000" es "paga con 20.000".
  requestAnimationFrame(() => enfocarImporte(0));
}

function enfocarImporte(indice) {
  const input = document.querySelectorAll("#posCobros .pos-cobro-importe")[indice];
  input?.focus();
  input?.select();
}

function renderFilasCobro() {
  document.getElementById("posCobros").innerHTML = cobro.filas
    .map((f, i) => {
      const medio = medioPorId(f.medio_id);
      // El crédito pide en cuántas cuotas; el que tarda en acreditarse lo avisa.
      const cuotas =
        medio?.tipo === "credito" && medio.planes.length
          ? `<select class="pos-cobro-cuotas" aria-label="Cuotas">${medio.planes
              .map((p) => `<option value="${esc(p.cuotas)}" ${p.cuotas === f.cuotas ? "selected" : ""}>${esc(textoCuotas(p.cuotas))}</option>`)
              .join("")}</select>`
          : "";
      // La transferencia pregunta en qué cuenta cayó, si hay más de una.
      const destinos = medio?.tipo === "transferencia" ? cuentasDeTransferencia() : [];
      const cuenta =
        destinos.length > 1
          ? `<select class="pos-cobro-cuenta" aria-label="Cuenta donde cae">${destinos
              .map((c) => `<option value="${c.id}" ${c.id === f.cuenta_id ? "selected" : ""}>${esc(c.nombre)}</option>`)
              .join("")}</select>`
          : "";
      const dias = medio?.dias_acreditacion ?? 0;
      const textoAcredita = dias === 1 ? "Se acredita en 1 día" : `Se acredita en ${dias} días`;
      const acredita = dias > 0 ? `<span class="pos-cobro-acredita">${esc(textoAcredita)}</span>` : "";
      return `
        <div class="pos-cobro-fila" data-indice="${i}">
          <div class="pos-cobro-medio">
            <select class="pos-cobro-medio-select" aria-label="Medio de pago">
              ${medios.map((m) => `<option value="${m.id}" ${m.id === f.medio_id ? "selected" : ""}>${esc(m.nombre)}</option>`).join("")}
            </select>
            ${cuotas}${cuenta}${acredita}
          </div>
          <input type="number" class="pos-cobro-importe" value="${f.importe ? Number(f.importe) : ""}" step="0.01" min="0" inputmode="decimal" placeholder="0.00" aria-label="Importe" />
          ${cobro.filas.length > 1 ? `<button type="button" class="btn-icon pos-cobro-quitar" aria-label="Quitar este medio">${icono("x")}</button>` : ""}
        </div>`;
    })
    .join("");
}

function calcularCobro() {
  const efectivoId = medioEfectivo()?.id;
  const pagado = redondear(cobro.filas.reduce((acc, f) => acc + f.importe, 0));
  const enEfectivo = redondear(cobro.filas.filter((f) => f.medio_id === efectivoId).reduce((acc, f) => acc + f.importe, 0));
  const diferencia = redondear(pagado - cobro.total);
  const vuelto = diferencia > 0 ? diferencia : 0;
  const falta = diferencia < 0 ? -diferencia : 0;
  let error = null;
  if (vuelto > enEfectivo + CENTAVO) {
    error = "El vuelto se da solo en efectivo: lo cobrado con otros medios no puede pasar del total.";
  } else if (falta >= CENTAVO && !cobro.cliente) {
    error = `Faltan ${money(falta)}. Para dejar saldo en cuenta corriente, elegí un cliente antes de cobrar.`;
  }
  return { pagado, vuelto, falta, error };
}

function actualizarCobro() {
  const { pagado, vuelto, falta, error } = calcularCobro();
  document.getElementById("posCobroPagado").textContent = money(pagado);
  const resto = document.querySelector(".pos-cobro-resto");
  resto.classList.toggle("pos-cobro-vuelto", vuelto > 0);
  document.getElementById("posCobroRestoEtiqueta").textContent = vuelto > 0 ? "Vuelto" : "Falta";
  document.getElementById("posCobroResto").textContent = money(vuelto > 0 ? vuelto : falta);

  const nota = document.getElementById("posCobroNota");
  const aCuenta = falta >= CENTAVO && cobro.cliente;
  nota.hidden = !error && !aCuenta;
  nota.classList.toggle("pos-nota-error", !!error);
  nota.textContent = error ?? (aCuenta ? `Quedan ${money(falta)} en la cuenta corriente de ${cobro.cliente.nombre}.` : "");
  document.getElementById("formPosCobroSubmit").disabled = !!error || !!errorDeFactura();
}

/* ---------- El comprobante de la venta ---------- */

// Al cobrar se elige si la venta sale con factura. Es la misma factura que se
// hace desde Ventas (POST /api/ventas/:id/facturar), pedida apenas se registra
// la venta: la letra la pone el servidor con la condición del negocio y la del
// cliente, y acá se anticipa cuál va a ser.
const posImprimirTicket = document.getElementById("posImprimirTicket");
posImprimirTicket.checked = leerGuardado(localStorage, CLAVE_TICKET) === "1";
posImprimirTicket.addEventListener("change", () => {
  guardar(localStorage, CLAVE_TICKET, posImprimirTicket.checked ? "1" : null);
});

// Con la factura electrónica en pausa (el plan no la trae) no se emite nada.
const sePuedeFacturar = () => !negocio.factura_electronica?.en_pausa;
// null si el negocio no cargó su condición frente al IVA: sale una B.
const letraDelCobro = () => letraPrevista(negocio.condicion_iva, cobro.cliente?.condicion_iva || "consumidor_final");

// Un inscripto hace la A o la B según el cliente; los demás, siempre la misma
// (la C, o una sin letra si el negocio no cargó su condición).
const haceAyB = () => negocio.condicion_iva === "responsable_inscripto";

// Lo que frena la venta, dicho antes de cobrar: la A pedida con los datos del
// cliente sin confirmar, y lo que ARCA rechazaría seguro (una factura A sin el
// CUIT del cliente; errorParaArca en server.js).
function errorDeFactura() {
  if (cobro.pidiendoA) return "Confirmá los datos del cliente para la factura A, o elegí otra opción.";
  if (!cobro.facturar || !negocio.factura_electronica?.activa || letraDelCobro() !== "A") return null;
  const cuit = String(cobro.cliente?.documento ?? "").replace(/\D/g, "");
  return cuit.length === 11 ? null : `Para la factura A falta el CUIT de ${cobro.cliente.nombre}: tocá «Factura A» y cargalo, o cobrá sin factura.`;
}

// Las opciones se marcan según lo que va a salir: la letra no se elige, sale
// de la condición del negocio y la del cliente. Tocar la A es decir a quién.
function renderComprobante() {
  const opciones = document.getElementById("posComprobanteOpciones");
  opciones.hidden = !sePuedeFacturar();
  const letra = letraDelCobro();
  const letras = haceAyB() ? ["A", "B"] : [letra ?? ""];
  const marcada = cobro.pidiendoA ? "A" : cobro.facturar ? (letra ?? "") : "no";
  const boton = (valor, texto, extra = "") =>
    `<button type="button" class="segmento" data-letra="${valor}" aria-pressed="${marcada === valor}"${extra}>${esc(texto)}</button>`;
  opciones.innerHTML = [
    boton("no", "Sin factura"),
    ...letras.map((l) =>
      boton(l, l ? `Factura ${l}` : "Factura", l === "B" && letra === "A" ? ` aria-disabled="true"` : "")
    )
  ].join("");

  // Con los datos del cliente abiertos, lo que falta lo dice el formulario.
  const error = cobro.pidiendoA ? null : errorDeFactura();
  let texto = error ?? "";
  if (!error && cobro.facturar && !cobro.pidiendoA) {
    texto = negocio.factura_electronica?.activa
      ? "Al confirmar, Nexo le pide el CAE a ARCA."
      : "La factura electrónica no está activada: sale un comprobante interno, que no vale como factura. Se activa en Configuración › Factura electrónica.";
  }
  const nota = document.getElementById("posComprobanteNota");
  nota.hidden = !texto;
  nota.classList.toggle("pos-nota-error", !!error);
  nota.textContent = texto;
}

document.getElementById("posComprobanteOpciones").addEventListener("click", (e) => {
  const boton = e.target.closest(".segmento");
  if (!boton) return;
  const pedida = boton.dataset.letra;
  if (pedida === "A" && !(letraDelCobro() === "A" && tieneCuit(cobro.cliente))) {
    abrirClienteCuit({ paraA: true });
    return;
  }
  if (pedida === "B" && letraDelCobro() === "A") {
    const { nombre, condicion_iva } = cobro.cliente;
    avisar(`A ${nombre} le corresponde la factura A: es ${condicionFiscal(condicion_iva)}. Para una B, cobrale a otro cliente.`, "atencion");
    return;
  }
  cobro.facturar = pedida !== "no";
  guardar(localStorage, CLAVE_FACTURAR, cobro.facturar ? "1" : null);
  cerrarClienteCuit();
  renderComprobante();
  actualizarCobro();
});

/* ---------- Alta rápida de un cliente con CUIT (hist. §188) ---------- */

// Una factura A necesita un cliente con CUIT y condición frente al IVA. Se
// carga acá, sin ir a Clientes: tocando "Factura A" (o, en un negocio que hace
// la C, desde el enlace), se busca por CUIT entre los del negocio y, si no
// está, se crea. No se elige la letra: sigue saliendo de la condición del
// negocio y la del cliente.
const btnPosClienteCuit = document.getElementById("btnPosClienteCuit");
const posClienteCuit = document.getElementById("posClienteCuit");
const posClienteCuitNumero = document.getElementById("posClienteCuitNumero");
const posClienteCuitNombre = document.getElementById("posClienteCuitNombre");
const posClienteCuitCondicion = document.getElementById("posClienteCuitCondicion");
const posClienteCuitNota = document.getElementById("posClienteCuitNota");
// Para la A, solo las condiciones que la dan.
const CONDICIONES_DE_LA_A = {
  responsable_inscripto: CONDICIONES_FISCALES.responsable_inscripto,
  monotributo: CONDICIONES_FISCALES.monotributo
};
const hayCondicion = (valor) => [...posClienteCuitCondicion.options].some((o) => o.value === valor);

const digitosDe = (texto) => String(texto ?? "").replace(/\D/g, "");
const tieneCuit = (cliente) => digitosDe(cliente?.documento).length === 11;
const clientePorCuit = (cuit) => clientes.find((c) => digitosDe(c.documento) === cuit);
// Lo que el PATCH de clientes espera: pisa con vacío lo que no viene, así que
// va la ficha entera con lo que cambia.
const fichaDelCliente = (c, cambios) => ({
  nombre: c.nombre,
  email: c.email,
  telefono: c.telefono,
  direccion: c.direccion,
  documento: c.documento,
  notas: c.notas,
  lista_precio_id: c.lista_precio_id,
  condicion_pago: c.condicion_pago,
  condicion_iva: c.condicion_iva,
  ...cambios
});

// El enlace es para el negocio que hace la C (en el inscripto, la A ya abre
// esto), y solo si el cliente es consumidor final o le falta el CUIT o la
// condición.
function renderClienteCuit() {
  const completo = tieneCuit(cobro.cliente) && esCondicionFiscal(cobro.cliente?.condicion_iva);
  btnPosClienteCuit.hidden = haceAyB() || !posClienteCuit.hidden || !sePuedeFacturar() || completo;
}

// Cerrarlo sin confirmar deja el comprobante como estaba antes de tocar la A.
function cerrarClienteCuit() {
  posClienteCuit.hidden = true;
  cobro.pidiendoA = false;
  limpiarErrores(posClienteCuit);
  renderClienteCuit();
}

function notaClienteCuit(texto) {
  posClienteCuitNota.hidden = !texto;
  posClienteCuitNota.textContent = texto;
}

// Arranca con lo que ya se sabe del cliente del cobro, si hay uno.
function abrirClienteCuit({ paraA = false } = {}) {
  cobro.pidiendoA = paraA;
  opcionesSelect(posClienteCuitCondicion, paraA ? CONDICIONES_DE_LA_A : CONDICIONES_FISCALES);
  const actual = cobro.cliente;
  posClienteCuitNumero.value = tieneCuit(actual) ? formatearCuit(actual.documento) : "";
  posClienteCuitNombre.value = actual?.nombre ?? "";
  posClienteCuitCondicion.value = hayCondicion(actual?.condicion_iva) ? actual.condicion_iva : "responsable_inscripto";
  document.getElementById("posClienteCuitTitulo").textContent = paraA ? "¿A quién le hacés la factura A?" : "¿A quién se le factura?";
  limpiarErrores(posClienteCuit);
  notaClienteCuit("");
  posClienteCuit.hidden = false;
  renderClienteCuit();
  renderComprobante();
  actualizarCobro();
  (posClienteCuitNumero.value ? posClienteCuitNombre : posClienteCuitNumero).focus();
}

btnPosClienteCuit.addEventListener("click", () => abrirClienteCuit());

document.getElementById("btnPosClienteCuitCancelar").addEventListener("click", () => {
  cerrarClienteCuit();
  renderComprobante();
  actualizarCobro();
  (haceAyB() ? document.querySelector('#posComprobanteOpciones [data-letra="A"]') : btnPosClienteCuit).focus();
});

// Con el CUIT completo, si ya es un cliente se avisa y se trae lo suyo.
posClienteCuitNumero.addEventListener("input", () => {
  limpiarError(posClienteCuitNumero);
  const existente = clientePorCuit(digitosDe(posClienteCuitNumero.value));
  notaClienteCuit(existente ? `Ya está en tus clientes: ${existente.nombre}.` : "");
  if (!existente) return;
  posClienteCuitNombre.value = existente.nombre;
  if (hayCondicion(existente.condicion_iva)) posClienteCuitCondicion.value = existente.condicion_iva;
});

posClienteCuitNumero.addEventListener("blur", () => {
  const error = errorCuit(posClienteCuitNumero.value);
  if (error) marcarError(posClienteCuitNumero, error);
  else posClienteCuitNumero.value = formatearCuit(posClienteCuitNumero.value);
});

posClienteCuitNombre.addEventListener("input", () => limpiarError(posClienteCuitNombre));

// Enter en un campo de acá guarda el cliente, no confirma la venta.
posClienteCuit.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.target.tagName === "BUTTON") return;
  e.preventDefault();
  document.getElementById("btnPosClienteCuitGuardar").click();
});

document.getElementById("btnPosClienteCuitGuardar").addEventListener("click", (e) => {
  enviando(e.currentTarget, guardarClienteCuit);
});

// El cliente al que se le factura, o null si falta un dato o no se confirmó.
async function clienteParaFacturar() {
  limpiarErrores(posClienteCuit);
  const cuit = digitosDe(posClienteCuitNumero.value);
  const error = cuit ? errorCuit(posClienteCuitNumero.value) : "Escribí el CUIT del cliente.";
  if (error) {
    marcarError(posClienteCuitNumero, error);
    posClienteCuitNumero.focus();
    return null;
  }
  const nombre = posClienteCuitNombre.value.trim();
  const condicion = posClienteCuitCondicion.value;
  const documento = formatearCuit(cuit);

  // La lista de ahora, no la de cuando se abrió el mostrador: otro puesto pudo
  // cargarlo, y no se duplica.
  fijarClientes(await api("/api/clientes", { error: "No se pudieron cargar los clientes." }));
  const existente = clientePorCuit(cuit);
  if (existente) {
    if (existente.condicion_iva === condicion) return existente;
    const cuerpo = esCondicionFiscal(existente.condicion_iva)
      ? `${existente.nombre} figura como ${condicionFiscal(existente.condicion_iva)}. ¿Lo pasás a ${condicionFiscal(condicion)}?`
      : `${existente.nombre} ya está en tus clientes, pero sin la condición frente al IVA. ¿Le guardás ${condicionFiscal(condicion)}?`;
    if (!(await confirmar({ titulo: "Completar el cliente", cuerpo, aceptar: "Guardar" }))) return null;
    await api(`/api/clientes/${existente.id}`, {
      method: "PATCH",
      body: fichaDelCliente(existente, { condicion_iva: condicion }),
      error: "No se pudo guardar el cliente."
    });
    return existente;
  }

  if (!nombre) {
    marcarError(posClienteCuitNombre, "Escribí el nombre o la razón social.");
    posClienteCuitNombre.focus();
    return null;
  }
  // El cliente del cobro, si es el mismo nombre, se completa: cargarlo de
  // nuevo lo duplicaría.
  const actual = cobro.cliente ? clientes.find((c) => c.id === cobro.cliente.id) : null;
  if (actual && actual.nombre.trim().toLowerCase() === nombre.toLowerCase()) {
    const cuerpo = `¿Le guardás a ${actual.nombre} el CUIT ${documento} y ${condicionFiscal(condicion)}?`;
    if (!(await confirmar({ titulo: "Completar el cliente", cuerpo, aceptar: "Guardar" }))) return null;
    await api(`/api/clientes/${actual.id}`, {
      method: "PATCH",
      body: fichaDelCliente(actual, { documento, condicion_iva: condicion }),
      error: "No se pudo guardar el cliente."
    });
    return actual;
  }

  const { id } = await api("/api/clientes", {
    method: "POST",
    body: { nombre, documento, condicion_iva: condicion },
    error: "No se pudo crear el cliente."
  });
  return { id };
}

async function guardarClienteCuit() {
  const elegido = await clienteParaFacturar();
  if (!elegido) return;
  fijarClientes(await api("/api/clientes", { error: "No se pudieron cargar los clientes." }));
  const cliente = clientes.find((c) => c.id === elegido.id);
  if (!cliente) return;
  // Queda también en el campo del mostrador: si se cierra el cobro, sigue.
  cobro.cliente = cliente;
  posCliente.value = cliente.nombre;
  document.getElementById("posCobroCliente").textContent = cliente.nombre;
  cobro.facturar = true;
  guardar(localStorage, CLAVE_FACTURAR, "1");
  cerrarClienteCuit();
  renderComprobante();
  actualizarCobro();
  refrescar([recargar("clientes")]);
  avisar(`La factura sale a nombre de ${cliente.nombre}.`, "ok");
  enfocarImporte(0);
}

// Lo que la factura dice de cómo se pagó. Con varios medios, manda el de más
// plata; sin cobros, quedó todo en cuenta corriente.
const CONDICION_VENTA_DEL_MEDIO = {
  efectivo: "contado",
  debito: "tarjeta_debito",
  credito: "tarjeta_credito",
  transferencia: "transferencia"
};
function condicionesDeFactura(cobros) {
  const mayor = [...cobros].sort((a, b) => b.importe - a.importe)[0];
  if (!mayor) return { condicion: "efectivo", condicion_venta: "cuenta_corriente" };
  const tipo = medioPorId(mayor.medio_cobro_id)?.tipo;
  return { condicion: tipo === "efectivo" ? "efectivo" : "transferencia", condicion_venta: CONDICION_VENTA_DEL_MEDIO[tipo] ?? "otra" };
}
const FACTURA_CON_QR = { condicion: "mercadopago", condicion_venta: "otra" };

// La factura de una venta recién registrada: { emitida } o { error }. Sin
// api(): si no sale, la venta ya está hecha y el motivo va a la pantalla de
// éxito, donde dice cómo seguir, y no a un aviso suelto.
async function facturarVenta(ventaId, condiciones) {
  try {
    const res = await fetch(`/api/ventas/${ventaId}/facturar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(condiciones)
    });
    const datos = await res.json().catch(() => ({}));
    return res.ok ? { emitida: datos } : { error: datos.error || "No se pudo generar la factura." };
  } catch {
    return { error: "Sin conexión con el servidor." };
  }
}

// Cómo le fue a la factura, para la pantalla de éxito.
function textoDeFactura(factura) {
  if (!factura) return { texto: "", mal: false };
  if (factura.error) {
    return { texto: `La venta quedó registrada, pero la factura no salió: ${factura.error} Hacela desde Ventas.`, mal: true };
  }
  const { arca_estado: estado, arca_error: motivo, comprobante } = factura.emitida;
  if (estado === "autorizado") return { texto: `Factura ${comprobante} autorizada por ARCA.`, mal: false };
  if (estado === "pendiente") {
    return { texto: "La factura quedó guardada, pero ARCA no respondió y todavía no tiene CAE. Pedilo de nuevo desde Facturas.", mal: true };
  }
  if (estado === "rechazado") {
    return { texto: `ARCA rechazó la factura: ${motivo}. Corregí el dato y pedí el CAE de nuevo desde Facturas, o descartala.`, mal: true };
  }
  return { texto: `Comprobante ${comprobante} generado.`, mal: false };
}

document.getElementById("posCobros").addEventListener("input", (e) => {
  const fila = e.target.closest(".pos-cobro-fila");
  if (!fila || !e.target.classList.contains("pos-cobro-importe")) return;
  const valor = Number(e.target.value);
  cobro.filas[Number(fila.dataset.indice)].importe = Number.isFinite(valor) && valor > 0 ? redondear(valor) : 0;
  actualizarCobro();
});

document.getElementById("posCobros").addEventListener("change", (e) => {
  const fila = e.target.closest(".pos-cobro-fila");
  if (!fila) return;
  const datos = cobro.filas[Number(fila.dataset.indice)];
  if (e.target.classList.contains("pos-cobro-medio-select")) {
    datos.medio_id = Number(e.target.value);
    datos.cuotas = cuotasIniciales(medioPorId(datos.medio_id));
    datos.cuenta_id = cuentaInicial(medioPorId(datos.medio_id));
    // Cambia lo que muestra la fila (cuotas, cuenta, acreditación): se dibuja de nuevo.
    renderFilasCobro();
  } else if (e.target.classList.contains("pos-cobro-cuotas")) {
    datos.cuotas = Number(e.target.value);
  } else if (e.target.classList.contains("pos-cobro-cuenta")) {
    datos.cuenta_id = Number(e.target.value);
  } else {
    return;
  }
  actualizarCobro();
});

document.getElementById("posCobros").addEventListener("click", (e) => {
  const quitar = e.target.closest(".pos-cobro-quitar");
  if (!quitar) return;
  cobro.filas.splice(Number(quitar.closest(".pos-cobro-fila").dataset.indice), 1);
  renderFilasCobro();
  actualizarCobro();
});

// Un medio que ya está en la lista se enfoca. Si no falta nada y hay un solo
// medio, se reemplaza (un toque en "Mercado Pago" es "todo con Mercado
// Pago"); si falta, se suma una fila por lo que falta.
document.getElementById("posMedios").addEventListener("click", (e) => {
  const boton = e.target.closest(".pos-medio");
  if (!boton) return;
  const medioId = Number(boton.dataset.medio);
  const existente = cobro.filas.findIndex((f) => f.medio_id === medioId);
  if (existente >= 0) {
    enfocarImporte(existente);
    return;
  }
  const cuotas = cuotasIniciales(medioPorId(medioId));
  const cuenta_id = cuentaInicial(medioPorId(medioId));
  const { falta } = calcularCobro();
  if (falta < CENTAVO && cobro.filas.length === 1) {
    cobro.filas[0] = { medio_id: medioId, cuotas, cuenta_id, importe: cobro.total };
  } else {
    cobro.filas.push({ medio_id: medioId, cuotas, cuenta_id, importe: falta });
  }
  renderFilasCobro();
  actualizarCobro();
  enfocarImporte(cobro.filas.findIndex((f) => f.medio_id === medioId));
});

// El backend no acepta cobros por más que el total: el vuelto se descuenta
// del efectivo antes de mandar, y las filas de un mismo medio (y plan de
// cuotas) se juntan.
function cobrosParaEnviar(vuelto) {
  const efectivoId = medioEfectivo()?.id;
  const porMedio = new Map();
  for (const f of cobro.filas) {
    if (!(f.importe > 0)) continue;
    const clave = `${f.medio_id}:${f.cuotas ?? ""}:${f.cuenta_id ?? ""}`;
    porMedio.set(clave, {
      medio_id: f.medio_id,
      cuotas: f.cuotas,
      cuenta_id: f.cuenta_id,
      importe: redondear((porMedio.get(clave)?.importe ?? 0) + f.importe)
    });
  }
  if (vuelto > 0) {
    const enEfectivo = [...porMedio.values()].find((c) => c.medio_id === efectivoId);
    if (enEfectivo) enEfectivo.importe = redondear(enEfectivo.importe - vuelto);
  }
  return [...porMedio.values()]
    .filter((c) => c.importe >= CENTAVO)
    .map(({ medio_id, cuotas, cuenta_id, importe }) => ({
      medio_cobro_id: medio_id,
      ...(cuotas ? { cuotas } : {}),
      ...(cuenta_id ? { cuenta_tesoreria_id: cuenta_id } : {}),
      importe
    }));
}

const btnPosACuenta = document.getElementById("btnPosACuenta");

document.getElementById("formPosCobro").addEventListener("submit", (e) => {
  e.preventDefault();
  const { vuelto, falta, error } = calcularCobro();
  if (error || errorDeFactura()) return;
  registrarVenta({ cobros: cobrosParaEnviar(vuelto), vuelto, falta });
});

// Los botones que no son el de confirmar avisan por qué no siguen.
function facturaConError() {
  const error = errorDeFactura();
  if (error) avisar(error, "atencion");
  return !!error;
}

// Fiar todo de un toque, sin borrar el importe: la venta va sin cobros y el
// total queda en la cuenta corriente del cliente. A "Consumidor final" no se
// le fía, así que sin cliente se vuelve a elegirlo.
btnPosACuenta.addEventListener("click", () => {
  if (!cobro.cliente) {
    avisar("Para dejarlo en cuenta corriente, elegí el cliente.", "atencion");
    cerrarCobro();
    posCliente.focus();
    return;
  }
  if (facturaConError()) return;
  registrarVenta({ cobros: [], vuelto: 0, falta: cobro.total });
});

async function registrarVenta({ cobros, vuelto, falta }) {
  const submit = document.getElementById("formPosCobroSubmit");
  const body = {
    turno_caja_id: turno.id,
    ...(cobro.cliente ? { cliente_id: cobro.cliente.id } : {}),
    items: itemsDelCarrito(),
    ...descuentoParaEnviar(),
    ...canjesParaEnviar(),
    consumos: consumosPos.leer(),
    cobros
  };
  // Los dos botones quedan apagados: un toque en cada uno no son dos ventas.
  // Y siguen apagados mientras sale la factura, que con ARCA puede tardar.
  btnPosACuenta.disabled = true;
  const { venta, factura } = await enviando(submit, async () => {
    // La venta del QR que no se pagó (hist. §197) ya existe: se cobra esa.
    const registrada = ventaSinQr
      ? await api(`/api/pos/ventas/${ventaSinQr.id}/cobrar`, { method: "POST", body: { cobros }, error: "No se pudo cobrar la venta." })
      : await api("/api/pos/ventas", { method: "POST", body, error: "No se pudo registrar la venta." });
    ventaSinQr = null;
    if (!cobro.facturar) return { venta: registrada, factura: null };
    if (negocio.factura_electronica?.activa) {
      const nota = document.getElementById("posComprobanteNota");
      nota.hidden = false;
      nota.textContent = "Venta registrada. Pidiendo el CAE a ARCA…";
    }
    return { venta: registrada, factura: await facturarVenta(registrada.id, condicionesDeFactura(cobros)) };
  })
    .catch((err) => {
      // El stock o la caja pudieron cambiar desde otro puesto: se vuelve a
      // leer todo para que lo que se ve sea lo que hay.
      refrescar([cargarTodo()]);
      throw err;
    })
    .finally(() => {
      btnPosACuenta.disabled = false;
    });

  mostrarExito({
    id: venta.id,
    vuelto,
    falta,
    cliente: cobro.cliente,
    ahorro: ahorroCarrito(),
    descontado: montoDescuento(),
    factura,
    puntos: venta.puntos ?? null,
    premios: premiosElegidos().map((p) => p.nombre),
    total: venta.total ?? cobro.total
  });
  ventaHecha();
}

// Lo que sigue a una venta registrada: el carrito vacío y el resto de Nexo al
// día.
function ventaHecha() {
  carrito = [];
  canjes = [];
  puntosCliente = null;
  guardarCarrito();
  posCliente.value = "";
  posBuscar.value = "";
  refrescar([cargarTodo()]);
  // El resto de Nexo se entera sin frenar la venta siguiente.
  refrescar([recargar("ventas", "stock", "productos", "clientes", "caja", "cuentasCorrientes", "panelResumen", "reporteStock")]);
}

// La última venta hecha, para imprimir su ticket y su factura desde la pantalla
// de éxito: { id, vuelto, facturaId }.
let ultimaVenta = null;

document.getElementById("btnPosTicket").addEventListener("click", (e) => {
  enviando(e.currentTarget, () => imprimirTicketDeVenta(ultimaVenta.id, { vuelto: ultimaVenta.vuelto }));
});

// La hoja A4 de la factura, la misma que sale desde Facturas.
document.getElementById("btnPosFactura").addEventListener("click", (e) => {
  enviando(e.currentTarget, async () => {
    const factura = await api(`/api/facturas/${ultimaVenta.facturaId}`, { error: "No se pudo cargar la factura." });
    await cargarQr().catch(() => {});
    imprimirComprobante(armarHojaFactura(factura));
  });
});

// Lo que sumó con los puntos (hist. §223) y, si tiene teléfono, el mensaje de
// la compra listo para mandarle (Configuración › Mensajes de WhatsApp).
function pintarPuntosDeLaVenta({ cliente, puntos, premios, total }) {
  const caja = document.getElementById("posExitoPuntos");
  caja.hidden = !puntos || !cliente;
  if (caja.hidden) return;
  const partes = [
    premios.length ? formatear("Canjeó {0}.", premios.join(", ")) : "",
    puntos.ganados > 0
      ? formatear("{0} sumó {1} y ahora tiene {2}.", cliente.nombre, textoPuntos(puntos.ganados), textoPuntos(Math.max(0, puntos.saldo)))
      : formatear("{0} tiene {1}.", cliente.nombre, textoPuntos(Math.max(0, puntos.saldo)))
  ].filter(Boolean);
  document.getElementById("posExitoPuntosTexto").textContent = partes.join(" ");
  const texto = llenarMensaje(textoDe("compra", negocio.mensajes_whatsapp), {
    nombre: cliente.nombre,
    negocio: negocio.nombre,
    total: pesosMensaje(total),
    ganados: textoPuntos(puntos.ganados),
    puntos: textoPuntos(Math.max(0, puntos.saldo))
  });
  const enlace = cliente.telefono ? enlaceWhatsApp(cliente.telefono, texto) : null;
  const boton = document.getElementById("btnPosExitoWhatsApp");
  boton.hidden = !enlace;
  if (enlace) boton.href = enlace;
}

function mostrarExito({ id, vuelto, falta, cliente, ahorro, descontado = 0, factura = null, puntos = null, premios = [], total = 0 }) {
  pintarPuntosDeLaVenta({ cliente, puntos, premios, total });
  // Una factura que ARCA rechazó no existe: no hay hoja para imprimir.
  const emitida = factura?.emitida && factura.emitida.arca_estado !== "rechazado" ? factura.emitida : null;
  ultimaVenta = { id, vuelto, facturaId: emitida?.id ?? null };
  const { texto: textoFactura, mal } = textoDeFactura(factura);
  const notaFactura = document.getElementById("posExitoFactura");
  notaFactura.hidden = !textoFactura;
  notaFactura.classList.toggle("pos-nota-error", mal);
  notaFactura.textContent = textoFactura;
  document.getElementById("btnPosFactura").hidden = !emitida;
  // El ticket sale solo si el mostrador lo tiene tildado, con la pantalla ya
  // dibujada (el diálogo de impresión frena todo lo demás).
  if (posImprimirTicket.checked) {
    setTimeout(() => imprimirTicketDeVenta(id, { vuelto }).catch(() => {}), 0);
  }

  document.getElementById("formPosCobro").hidden = true;
  document.getElementById("posExito").hidden = false;
  document.getElementById("posExitoTitulo").textContent = `Venta #${id} registrada`;
  document.getElementById("posExitoVueltoWrap").hidden = vuelto <= 0;
  document.getElementById("posExitoVuelto").textContent = money(vuelto);
  const nota = document.getElementById("posExitoNota");
  const notas = [
    ahorro >= CENTAVO ? `Ahorró ${money(ahorro)} con las ofertas.` : "",
    descontado >= CENTAVO ? `Le hiciste ${money(descontado)} de descuento.` : "",
    falta >= CENTAVO ? `Quedaron ${money(falta)} en la cuenta corriente de ${cliente.nombre}.` : ""
  ].filter(Boolean);
  nota.hidden = notas.length === 0;
  nota.textContent = notas.join(" ");
  document.getElementById("btnPosNuevaVenta").focus();
}

async function cerrarCobro() {
  // Con un QR esperando, la venta ya existe: se cancela o se cobra.
  if (esperandoQr) {
    avisar("Está esperando el pago del QR. Si no pagó, tocá «No pagó: cobrar de otra forma».", "atencion");
    return;
  }
  // La venta del QR que no se pagó (hist. §197): si no se cobra de otra forma,
  // no se hizo, y recién ahí se anula (vuelve el stock).
  if (ventaSinQr) {
    const ok = await confirmar({
      titulo: "Descartar la venta",
      cuerpo: `La venta #${ventaSinQr.id} no se cobró. Si la descartás, se anula y vuelve el stock; el carrito sigue acá.`,
      aceptar: "Descartar",
      destructivo: true
    });
    if (!ok) return;
    const { id } = ventaSinQr;
    const res = await fetch(`/api/pos/ventas/${id}/cancelar-qr`, { method: "POST" });
    ventaSinQr = null;
    if (!res.ok) avisar("No se pudo descartar la venta: avisale al administrador.", "error");
    refrescar([cargarTodo()]);
  }
  modalPosCobro.hidden = true;
  enfocarBusqueda();
}

document.getElementById("btnPosNuevaVenta").addEventListener("click", cerrarCobro);
document.getElementById("modalPosCobroClose").addEventListener("click", cerrarCobro);
modalPosCobro.addEventListener("click", (e) => {
  if (e.target === modalPosCobro) cerrarCobro();
});
document.getElementById("btnPosCobrar").addEventListener("click", abrirCobro);

/* ---------- El QR de Mercado Pago (hist. §145) ---------- */

// La venta nace sin cobros y se muestra el QR del link de pago por el total.
// La pantalla espera: el cobro entra solo con el aviso de Mercado Pago, y cada
// tanto se le pregunta, por si el aviso no puede llegar (en la compu, sin
// dirección pública). Si no paga, se cancela el QR y la misma venta se cobra
// de otra forma (hist. §197).
const btnPosQr = document.getElementById("btnPosQr");
const posQr = document.getElementById("posQr");
const SEGUNDOS_SONDEO_QR = 3;
const SONDEOS_POR_PREGUNTA = 5;
// { id, cliente, ahorro, vueltas, sondeo }
let esperandoQr = null;
// La venta del QR que no se pagó y se cobra con otro medio (hist. §197): { id }.
let ventaSinQr = null;

// El texto va después del punto que late.
function estadoQr(texto) {
  document.getElementById("posQrEstado").lastChild.textContent = ` ${texto}`;
}

btnPosQr.addEventListener("click", async () => {
  if (facturaConError()) return;
  if (ventaSinQr) {
    avisar(`El QR de la venta #${ventaSinQr.id} ya se canceló: cobrala con otro medio.`, "atencion");
    return;
  }
  const body = {
    turno_caja_id: turno.id,
    ...(cobro.cliente ? { cliente_id: cobro.cliente.id } : {}),
    items: itemsDelCarrito(),
    ...descuentoParaEnviar(),
    ...canjesParaEnviar(),
    consumos: consumosPos.leer(),
    cobros: [],
    qr_mercadopago: true
  };
  let venta;
  let link;
  try {
    venta = await enviando(btnPosQr, () => api("/api/pos/ventas", { method: "POST", body, error: "No se pudo registrar la venta." }));
    // El de la caja (comisión más baja) o, si no hay o no se puede, el del
    // link (hist. §147).
    link = await api(`/api/ventas/${venta.id}/qr`, { method: "POST", error: "No se pudo crear el QR de Mercado Pago." }).catch(
      async (err) => {
        await fetch(`/api/pos/ventas/${venta.id}/cancelar-qr`, { method: "POST" }).catch(() => {});
        throw err;
      }
    );
  } catch {
    refrescar([cargarTodo()]);
    return;
  }
  const imagen = document.getElementById("posQrCodigo");
  try {
    await cargarQr();
    const codigo = window.qrcode(0, "M");
    codigo.addData(link.qr ?? link.url);
    codigo.make();
    imagen.src = codigo.createDataURL(6, 2);
  } catch {
    imagen.removeAttribute("src");
  }
  document.getElementById("posQrImporte").textContent = money(link.importe);
  // El de la caja solo lo lee la app de Mercado Pago (o una billetera); el
  // del link, también la cámara.
  document.getElementById("posQrTitulo").textContent = link.qr
    ? "Escaneá con la app de Mercado Pago o tu billetera"
    : "Escaneá con la app de Mercado Pago o la cámara";
  document.getElementById("formPosCobro").hidden = true;
  estadoQr("Esperando el pago…");
  posQr.hidden = false;
  esperandoQr = {
    id: venta.id,
    cliente: cobro.cliente,
    ahorro: ahorroCarrito(),
    descontado: montoDescuento(),
    facturar: cobro.facturar,
    vueltas: 0
  };
  esperandoQr.sondeo = setInterval(() => revisarQr(), SEGUNDOS_SONDEO_QR * 1000);
});

// Sin api(): mientras espera no tiene que llenar la pantalla de avisos.
async function revisarQr({ preguntar = false } = {}) {
  const actual = esperandoQr;
  if (!actual) return false;
  // Ya pagó y se está haciendo la factura: no se pregunta de nuevo.
  if (actual.cobrada) return true;
  actual.vueltas += 1;
  if (preguntar || actual.vueltas % SONDEOS_POR_PREGUNTA === 0) {
    await fetch(`/api/ventas/${actual.id}/revisar-pagos`, { method: "POST" }).catch(() => {});
  }
  const venta = await fetch(`/api/ventas/${actual.id}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  if (!venta || esperandoQr !== actual || venta.cobrado < venta.neto - CENTAVO) return false;
  if (actual.cobrada) return true;
  actual.cobrada = true;
  // La factura se pide recién ahora: una venta que nadie pagó se anula.
  let factura = null;
  if (actual.facturar) {
    estadoQr("Pago recibido. Haciendo la factura…");
    factura = await facturarVenta(actual.id, FACTURA_CON_QR);
  }
  terminarQr();
  mostrarExito({ id: actual.id, vuelto: 0, falta: 0, cliente: actual.cliente, ahorro: actual.ahorro, descontado: actual.descontado, factura });
  document.getElementById("posExitoTitulo").textContent = `Venta #${actual.id} cobrada con Mercado Pago`;
  ventaHecha();
  return true;
}

function terminarQr() {
  clearInterval(esperandoQr?.sondeo);
  esperandoQr = null;
  posQr.hidden = true;
}

document.getElementById("btnPosQrRevisar").addEventListener("click", async (e) => {
  const pago = await enviando(e.currentTarget, () => revisarQr({ preguntar: true }));
  if (!pago) avisar("Todavía no llegó el pago. Si en el celular del cliente dice aprobado, esperá unos segundos.", "atencion");
});

document.getElementById("btnPosQrCancelar").addEventListener("click", async (e) => {
  if (!esperandoQr) return;
  const { id } = esperandoQr;
  // La venta no se anula (hist. §197): se cancela el QR en Mercado Pago y la
  // misma venta se cobra con otro medio.
  const res = await enviando(e.currentTarget, () => fetch(`/api/pos/ventas/${id}/soltar-qr`, { method: "POST" }));
  if (res.status === 409) {
    // El pago entró justo: no se cancela, se cobró.
    await revisarQr({ preguntar: true });
    return;
  }
  terminarQr();
  document.getElementById("formPosCobro").hidden = false;
  if (res.ok) {
    ventaSinQr = { id };
    avisar(`QR cancelado: cobrá la venta #${id} con otro medio.`, "ok");
  } else {
    avisar("No se pudo cancelar el QR: avisale al administrador.", "error");
    refrescar([cargarTodo()]);
  }
});
document.getElementById("btnPosBarraCobrar").addEventListener("click", abrirCobro);

/* ---------- Cierre de caja ---------- */

document.getElementById("btnPosCerrarCaja").addEventListener("click", async () => {
  if (carrito.length > 0) {
    const ok = await confirmar({
      titulo: "Cerrar caja",
      cuerpo: "Hay una venta en curso sin cobrar. Si cerrás la caja, se descarta.",
      aceptar: "Seguir con el cierre",
      destructivo: true
    });
    if (!ok) return;
  }
  // El resumen en vivo: pudo haber cobros o gastos en efectivo desde otra pantalla.
  turno = await api(`/api/turnos-caja/${turno.id}`, { error: "No se pudo leer el turno." });
  const cobrado = turno.cobros_por_cuenta.reduce((acc, c) => acc + c.importe, 0);
  const aCuenta = redondear(turno.ventas.total - cobrado);

  document.getElementById("posCierreDatos").innerHTML = camposFicha([
    ["Abrió", `${fechaHoraAR(turno.abierto_en)} · ${turno.abierto_por_nombre}`],
    ["Contado al abrir", money(turno.contado_apertura)],
    ["Ventas", `${numero(turno.ventas.cantidad)} por ${money(turno.ventas.total)}`],
    ["Cobros en efectivo", money(turno.movimientos.cobros)],
    ["Otros ingresos", money(turno.movimientos.otros_ingresos)],
    ["Egresos", money(turno.movimientos.egresos)]
  ]);
  const medios = turno.cobros_por_cuenta
    .map((c) => `<li><span>${esc(c.cuenta)}</span><span class="mono">${money(c.importe)}</span></li>`)
    .join("");
  const fiado = aCuenta >= CENTAVO ? `<li><span>A cuenta corriente</span><span class="mono">${money(aCuenta)}</span></li>` : "";
  document.getElementById("posCierreMedios").innerHTML =
    (medios || fiado ? `<p class="pos-cierre-subtitulo">Lo vendido, por medio de cobro</p><ul class="pos-cierre-lista">${medios}${fiado}</ul>` : "") +
    `<div class="pos-cierre-esperado"><span>Tendría que haber en la caja</span><strong class="mono">${money(turno.esperado)}</strong></div>`;
  document.getElementById("formPosCierre").reset();
  renderDiferenciaCierre();
  pintarOtrasCuentas();
  modalPosCierre.hidden = false;
});

/* --- El cierre en las otras cuentas (hist. §150) --- */

// El efectivo se cuenta; lo cobrado con débito, crédito, transferencia o
// Mercado Pago se controla contra el cierre de lote del posnet o la app. La
// diferencia queda anotada y no mueve el saldo.
const otrasCuentasDelTurno = () => turno.cobros_por_cuenta.filter((c) => c.cuenta_tesoreria_id !== turno.cuenta_tesoreria_id);

function pintarOtrasCuentas() {
  const otras = otrasCuentasDelTurno();
  const contenedor = document.getElementById("posCierreOtras");
  contenedor.hidden = otras.length === 0;
  contenedor.innerHTML = otras.length
    ? `<p class="pos-cierre-subtitulo">Las otras cuentas</p>
       <p class="form-note">Lo que dice el cierre de lote del posnet o la app de cada una. Si no lo tenés a mano, dejalo vacío.</p>
       ${otras
         .map(
           (c) => `
       <div class="pos-cierre-otra" data-cuenta="${c.cuenta_tesoreria_id}">
         <label>${esc(c.cuenta)} <span class="pos-cierre-segun">según Nexo ${money(c.importe)}</span>
           <input type="number" class="pos-cierre-declarado" step="0.01" min="0" inputmode="decimal" placeholder="${esc(String(c.importe))}" />
         </label>
         <p class="pos-diferencia" aria-live="polite"></p>
       </div>`
         )
         .join("")}
       <p class="form-note pos-cierre-cruce" id="posCierreCruce" hidden></p>`
    : "";
}

// Lo cargado en cada otra cuenta, con su diferencia.
function leerOtrasCuentas() {
  return otrasCuentasDelTurno()
    .map((c) => {
      const input = document.querySelector(`#posCierreOtras [data-cuenta="${c.cuenta_tesoreria_id}"] .pos-cierre-declarado`);
      if (!input || input.value === "") return null;
      const declarado = Number(input.value);
      return { ...c, declarado, diferencia: redondear(declarado - c.importe) };
    })
    .filter(Boolean);
}

document.getElementById("posCierreOtras").addEventListener("input", () => {
  const cargadas = leerOtrasCuentas();
  for (const fila of document.querySelectorAll("#posCierreOtras .pos-cierre-otra")) {
    const dato = cargadas.find((c) => c.cuenta_tesoreria_id === Number(fila.dataset.cuenta));
    const el = fila.querySelector(".pos-diferencia");
    el.textContent = dato ? textoDiferencia(dato.diferencia) : "";
    el.className = `pos-diferencia ${dato ? claseDiferencia(dato.diferencia) : ""}`;
  }
  // Lo que sobra en una y falta en otra (o en la caja) suele ser un cobro
  // cargado en la cuenta equivocada.
  const efectivo = document.getElementById("posCierreContado").value;
  const todas = [
    ...cargadas,
    ...(efectivo === "" ? [] : [{ cuenta: "la caja", diferencia: redondear(Number(efectivo) - turno.esperado) }])
  ].filter((c) => Math.abs(c.diferencia) >= CENTAVO);
  const sobra = todas.find((c) => c.diferencia > 0 && todas.some((o) => Math.abs(o.diferencia + c.diferencia) < CENTAVO));
  const falta = sobra && todas.find((o) => Math.abs(o.diferencia + sobra.diferencia) < CENTAVO);
  const cruce = document.getElementById("posCierreCruce");
  cruce.hidden = !sobra;
  if (sobra) {
    cruce.textContent = `Sobran ${money(sobra.diferencia)} en ${sobra.cuenta} y faltan en ${falta.cuenta}: ¿un cobro quedó cargado en la cuenta equivocada?`;
  }
});
document.getElementById("posCierreContado").addEventListener("input", () =>
  document.getElementById("posCierreOtras").dispatchEvent(new Event("input"))
);

function renderDiferenciaCierre() {
  const el = document.getElementById("posCierreDiferencia");
  const valor = document.getElementById("posCierreContado").value;
  if (valor === "") {
    el.textContent = "";
    el.className = "pos-diferencia";
    return;
  }
  const d = redondear(Number(valor) - turno.esperado);
  el.textContent = textoDiferencia(d);
  el.className = `pos-diferencia ${claseDiferencia(d)}`;
}

document.getElementById("posCierreContado").addEventListener("input", renderDiferenciaCierre);

document.getElementById("modalPosCierreClose").addEventListener("click", () => {
  modalPosCierre.hidden = true;
});
modalPosCierre.addEventListener("click", (e) => {
  if (e.target === modalPosCierre) modalPosCierre.hidden = true;
});

document.getElementById("formPosCierre").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const contado = Number(form.contado.value);
  if (form.contado.value === "" || !Number.isFinite(contado) || contado < 0) {
    avisar("Cargá cuánto efectivo hay en la caja.", "atencion");
    return;
  }
  const nota = form.nota.value.trim();
  const cerrado = await enviando(document.getElementById("formPosCierreSubmit"), () =>
    api(`/api/turnos-caja/${turno.id}/cerrar`, {
      method: "POST",
      body: {
        contado,
        otras: leerOtrasCuentas().map((c) => ({ cuenta_tesoreria_id: c.cuenta_tesoreria_id, declarado: c.declarado })),
        ...(nota ? { nota } : {})
      },
      error: "No se pudo cerrar la caja."
    })
  );
  carrito = [];
  guardarCarrito();
  modalPosCierre.hidden = true;
  const conDiferencia = cerrado.arqueos.filter((a) => Math.abs(a.diferencia) >= CENTAVO);
  const sinDiferencia = Math.abs(cerrado.diferencia_cierre) < CENTAVO && conDiferencia.length === 0;
  const otras = conDiferencia.map((a) => ` ${a.cuenta}: ${textoDiferencia(a.diferencia).toLowerCase()}.`).join("");
  avisar(`Caja cerrada. ${textoDiferencia(cerrado.diferencia_cierre)}.${otras}`, sinDiferencia ? "ok" : "atencion");
  refrescar([recargar("caja")]);
  await refrescar([cargarTodo()]);
});

/* ---------- Lector con la cámara ---------- */

const video = document.getElementById("posCamaraVideo");
let camara = null;
let proximaLectura = null;

function apagarCamara() {
  clearTimeout(proximaLectura);
  camara?.getTracks().forEach((pista) => pista.stop());
  camara = null;
  video.srcObject = null;
}

document.getElementById("btnPosCamara").addEventListener("click", async () => {
  modalPosCamara.hidden = false;
  try {
    camara = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
  } catch {
    modalPosCamara.hidden = true;
    avisar("No se pudo abrir la cámara. Revisá el permiso del navegador.", "error");
    return;
  }
  // Si se cerró el modal mientras el navegador pedía permiso.
  if (modalPosCamara.hidden) return apagarCamara();
  video.srcObject = camara;
  await video.play().catch(() => {});
  const detector = new window.BarcodeDetector();
  const leer = async () => {
    if (!camara) return;
    try {
      const [codigo] = await detector.detect(video);
      if (codigo?.rawValue) {
        modalPosCamara.hidden = true;
        agregarPorCodigo(codigo.rawValue.trim());
        return;
      }
    } catch {
      // Un cuadro que todavía no está listo: se prueba con el siguiente.
    }
    proximaLectura = setTimeout(leer, 250);
  };
  leer();
});

// Se cierre como se cierre (✕, Escape, click afuera o una lectura), la
// cámara se apaga.
new MutationObserver(() => {
  if (modalPosCamara.hidden) apagarCamara();
}).observe(modalPosCamara, { attributes: true, attributeFilter: ["hidden"] });

document.getElementById("modalPosCamaraClose").addEventListener("click", () => {
  modalPosCamara.hidden = true;
});
modalPosCamara.addEventListener("click", (e) => {
  if (e.target === modalPosCamara) modalPosCamara.hidden = true;
});

/* ---------- Atajos de teclado ---------- */

document.addEventListener("keydown", (e) => {
  if (vista.hidden || posMostrador.hidden || document.querySelector(".modal:not([hidden])")) return;
  if (e.key === "F2") {
    e.preventDefault();
    posBuscar.focus();
    posBuscar.select();
    return;
  }
  if (e.key === "F9") {
    e.preventDefault();
    abrirCobro();
    return;
  }
  // El lector de código de barras "tipea". Si el foco quedó fuera de un
  // campo (por ejemplo, después de tocar un producto), la lectura va a la
  // búsqueda en vez de perderse. El espacio queda para los botones.
  const enCampo = e.target.closest?.("input, select, textarea");
  if (!enCampo && e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey) posBuscar.focus();
});

/* ---------- Lo de Praxia: el turno, cobrar a cuenta y gastos (hist. §194) ---------- */

const modalPosTurno = document.getElementById("modalPosTurno");
const modalPosACuenta = document.getElementById("modalPosACuenta");
const modalPosGasto = document.getElementById("modalPosGasto");
const formAnular = document.getElementById("formPosAnular");
const formACuenta = document.getElementById("formPosACuenta");
const formGasto = document.getElementById("formPosGasto");
let detalleTurno = null;
let anulando = null;

// Las tres ventanas se cierran igual que las otras del mostrador.
for (const [modal, boton] of [
  [modalPosTurno, "modalPosTurnoClose"],
  [modalPosACuenta, "modalPosACuentaClose"],
  [modalPosGasto, "modalPosGastoClose"]
]) {
  document.getElementById(boton).addEventListener("click", () => (modal.hidden = true));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.hidden = true;
  });
}

// Después de cobrar, gastar o anular: las cifras del turno al día.
async function refrescarTurno() {
  turno = await api(`/api/turnos-caja/${turno.id}`, { error: "No se pudo leer el turno." });
  renderTurno();
  refrescar([recargar("caja")]);
}

const horaDe = (utc) => (utc ? fechaHoraAR(utc).split(" ")[1] : "");

function notaDeVenta(v) {
  if (v.estado === "anulada") return "Anulada";
  if (v.facturada) return "Con factura";
  return v.cobrado < v.total - CENTAVO ? `Debe ${money(v.total - v.cobrado)}` : "";
}

async function pintarDetalleTurno() {
  detalleTurno = await api(`/api/turnos-caja/${turno.id}/detalle`, { error: "No se pudo cargar el turno." });
  const { ventas, a_cuenta: aCuenta, gastos, total_gastos: totalGastos } = detalleTurno;
  const filaVenta = (v) => {
    const anulada = v.estado === "anulada";
    const quien = v.cliente === CONSUMIDOR_FINAL ? "" : ` · ${esc(v.cliente)}`;
    return `
      <li class="${anulada ? "fila-anulada" : ""}">
        <span class="pos-turno-quien">Venta #${v.id}${quien}<small>${esc([horaDe(v.creada), v.atendio, notaDeVenta(v)].filter(Boolean).join(" · "))}</small></span>
        <strong class="mono">${money(v.total)}</strong>
        <button type="button" class="btn btn-secundario btn-chico" data-reimprimir="${v.id}">Reimprimir</button>
        ${anulada || v.facturada ? "" : `<button type="button" class="btn btn-secundario btn-chico" data-anular="${v.id}">Anular</button>`}
      </li>`;
  };
  const filaACuenta = (c) =>
    `<li><span class="pos-turno-quien">${esc(c.cliente)}<small>${esc(c.medio)}</small></span><strong class="mono">${money(c.importe)}</strong></li>`;
  const filaGasto = (g) =>
    `<li><span class="pos-turno-quien">${esc(g.descripcion ?? g.categoria)}<small>${esc(g.categoria)}</small></span><strong class="mono">${money(g.importe)}</strong></li>`;
  document.getElementById("posTurnoDetalle").innerHTML = `
    ${ventas.length ? `<ul class="pos-turno-lista">${ventas.map(filaVenta).join("")}</ul>` : `<p class="form-note">Todavía no hay ventas en este turno.</p>`}
    ${aCuenta.length ? `<p class="pos-cierre-subtitulo">Cobros a cuenta</p><ul class="pos-turno-lista">${aCuenta.map(filaACuenta).join("")}</ul>` : ""}
    ${gastos.length ? `<p class="pos-cierre-subtitulo">Gastos de la caja: ${money(totalGastos)}</p><ul class="pos-turno-lista">${gastos.map(filaGasto).join("")}</ul>` : ""}`;
}

document.getElementById("btnPosTurnoDetalle").addEventListener("click", async () => {
  formAnular.hidden = true;
  await pintarDetalleTurno();
  modalPosTurno.hidden = false;
});

document.getElementById("posTurnoDetalle").addEventListener("click", (e) => {
  const reimprimir = e.target.closest("[data-reimprimir]");
  const anular = e.target.closest("[data-anular]");
  if (reimprimir) enviando(reimprimir, () => imprimirTicketDeVenta(Number(reimprimir.dataset.reimprimir)));
  if (anular) {
    anulando = detalleTurno.ventas.find((v) => v.id === Number(anular.dataset.anular));
    formAnular.reset();
    document.getElementById("posAnularTitulo").textContent = `Anular la venta #${anulando.id} (${money(anulando.total)})`;
    document.getElementById("posAnularNota").textContent =
      anulando.cobrado > CENTAVO
        ? `Vuelve el stock y sale de la caja lo cobrado: ${money(anulando.cobrado)}. Devolvéselo al cliente.`
        : "Vuelve el stock y la venta queda en la papelera.";
    // En la caja vinculada (hist. §199) autoriza un encargado con su PIN; con
    // una cuenta de empleado, un admin con su contraseña.
    const conPin = enCaja() && !cajaVinculada?.atiende?.encargado;
    document.getElementById("posAnularAutoriza").hidden = enCaja() || esAdmin();
    document.getElementById("posAnularPin").hidden = !conPin;
    if (conPin) {
      const encargados = cajaVinculada.empleados.filter((x) => x.encargado);
      formAnular.autoriza_empleado_id.innerHTML = encargados.length
        ? encargados.map((x) => `<option value="${x.id}">${esc(x.nombre)}</option>`).join("")
        : `<option value="">No hay encargados con PIN</option>`;
    }
    formAnular.hidden = false;
    formAnular.motivo.focus();
  }
});

document.getElementById("btnPosAnularCancelar").addEventListener("click", () => {
  formAnular.hidden = true;
});

formAnular.addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = { motivo: formAnular.motivo.value.trim() };
  if (!body.motivo) {
    avisar("Escribí por qué se anula.", "atencion");
    return;
  }
  if (enCaja()) {
    if (!cajaVinculada.atiende?.encargado) {
      body.autoriza_empleado_id = Number(formAnular.autoriza_empleado_id.value) || null;
      body.autoriza_pin = formAnular.autoriza_pin.value;
    }
  } else if (!esAdmin()) {
    body.autoriza_email = formAnular.autoriza_email.value.trim();
    body.autoriza_password = formAnular.autoriza_password.value;
  }
  const r = await enviando(document.getElementById("formPosAnularSubmit"), () =>
    api(`/api/pos/ventas/${anulando.id}/anular`, { method: "POST", body, error: "No se pudo anular la venta." })
  );
  formAnular.hidden = true;
  avisar(r.devuelto > CENTAVO ? `Venta #${anulando.id} anulada: devolvé ${money(r.devuelto)}.` : `Venta #${anulando.id} anulada.`, "ok");
  await Promise.all([pintarDetalleTurno(), refrescarTurno()]);
  // Volvió el stock: el catálogo, de nuevo.
  fijarCatalogo(await api(`/api/pos/catalogo?caja=${cajaId}`, { error: "No se pudo cargar el catálogo." }));
  renderCatalogo();
});

/* --- Cobrar a cuenta --- */

const clienteACuenta = () => clientes.find((c) => c.nombre === formACuenta.cliente.value.trim());

function pintarDeudaACuenta() {
  const cliente = clienteACuenta();
  let texto = "";
  if (cliente) texto = cliente.deuda > CENTAVO ? `Debe ${money(cliente.deuda)}.` : `${cliente.nombre} no debe nada.`;
  document.getElementById("posACuentaDeuda").textContent = texto;
  if (cliente?.deuda > CENTAVO && !formACuenta.importe.value) formACuenta.importe.value = String(redondear(cliente.deuda));
}

document.getElementById("btnPosCobrarACuenta").addEventListener("click", async () => {
  // La deuda de cada uno, al día: pudo haber cobros desde otra pantalla.
  fijarClientes(await api("/api/clientes", { error: "No se pudieron cargar los clientes." }));
  document.getElementById("posClientesDeuda").innerHTML = clientes
    .filter((c) => c.deuda > CENTAVO)
    .map((c) => `<option value="${esc(c.nombre)}">${esc(money(c.deuda))}</option>`)
    .join("");
  formACuenta.reset();
  formACuenta.imprimir.checked = true;
  formACuenta.medio.innerHTML = medios.map((m) => `<option value="${m.id}">${esc(m.nombre)}</option>`).join("");
  pintarDeudaACuenta();
  modalPosACuenta.hidden = false;
  formACuenta.cliente.focus();
});

formACuenta.cliente.addEventListener("input", pintarDeudaACuenta);
formACuenta.cliente.addEventListener("change", pintarDeudaACuenta);

formACuenta.addEventListener("submit", async (e) => {
  e.preventDefault();
  const cliente = clienteACuenta();
  const importe = Number(formACuenta.importe.value);
  if (!cliente) {
    avisar("Elegí el cliente de la lista.", "atencion");
    return;
  }
  if (!(importe > 0)) {
    avisar("Cargá cuánto paga.", "atencion");
    return;
  }
  const medio = medios.find((m) => m.id === Number(formACuenta.medio.value));
  const cobro = medio ? { medio_cobro_id: medio.id, importe } : { cuenta_tesoreria_id: turno.cuenta_tesoreria_id, importe };
  const r = await enviando(document.getElementById("formPosACuentaSubmit"), () =>
    api("/api/pos/cobro-a-cuenta", {
      method: "POST",
      body: { turno_caja_id: turno.id, cliente_id: cliente.id, cobros: [cobro] },
      error: "No se pudo cobrar."
    })
  );
  modalPosACuenta.hidden = true;
  avisar(
    r.saldo > CENTAVO ? `${r.cliente} pagó ${money(r.pagado)}: le quedan ${money(r.saldo)}.` : `${r.cliente} pagó ${money(r.pagado)}: quedó al día.`,
    "ok"
  );
  if (formACuenta.imprimir.checked) {
    imprimirTicket(armarReciboPago({ cliente: r.cliente, pagado: r.pagado, saldo: r.saldo, medio: medio?.nombre }));
  }
  await refrescarTurno();
});

/* --- Gasto de caja --- */

document.getElementById("btnPosGasto").addEventListener("click", async () => {
  formGasto.reset();
  const detalle = await api(`/api/turnos-caja/${turno.id}/detalle`, { error: "No se pudo cargar el turno." });
  const n = detalle.gastos.length;
  document.getElementById("posGastoTotal").textContent = n
    ? `En este turno ya salieron ${money(detalle.total_gastos)} en ${numero(n)} ${n === 1 ? "gasto" : "gastos"}.`
    : "";
  modalPosGasto.hidden = false;
  formGasto.descripcion.focus();
});

formGasto.addEventListener("submit", async (e) => {
  e.preventDefault();
  const descripcion = formGasto.descripcion.value.trim();
  const importe = Number(formGasto.importe.value);
  if (!descripcion || !(importe > 0)) {
    avisar("Cargá en qué se gastó y cuánto.", "atencion");
    return;
  }
  await enviando(document.getElementById("formPosGastoSubmit"), () =>
    api("/api/pos/gastos", {
      method: "POST",
      body: { turno_caja_id: turno.id, descripcion, importe },
      error: "No se pudo anotar el gasto."
    })
  );
  modalPosGasto.hidden = true;
  avisar(`Gasto anotado: ${money(importe)} salieron de la caja.`, "ok");
  refrescar([recargar("gastos")]);
  await refrescarTurno();
});

/* ---------- La caja vinculada (hist. §199) ---------- */
//
// Decidido por el usuario el 17 de noviembre, como Praxia: la compu del
// mostrador tiene su cuenta, no el empleado. El admin la vincula desde acá
// ("Usar esta compu como Caja 1"); después, sin su cuenta, la compu arranca
// en el mostrador, bloqueada: cada empleado toca su nombre y pone su PIN para
// atender (las ventas quedan a su nombre), y fichar es otro botón, así el
// relevo del almuerzo no ensucia los horarios.

const posQuienLista = document.getElementById("posQuienLista");
const formPosPin = document.getElementById("formPosPin");

function renderQuien() {
  const caja = cajaVinculada;
  if (!caja) return;
  document.getElementById("posQuienCaja").textContent = [caja.nombre, caja.sucursal, caja.negocio].filter(Boolean).join(" · ");
  document.getElementById("posAtiendeNombre").textContent = caja.atiende?.nombre ?? "";
  if (elegido && !caja.empleados.some((e) => e.id === elegido.id)) elegido = null;
  posQuienLista.innerHTML = caja.empleados.length
    ? caja.empleados
        .map(
          (e) => `
          <button type="button" class="pos-quien-persona${elegido?.id === e.id ? " es-elegido" : ""}" data-empleado="${e.id}" aria-pressed="${elegido?.id === e.id}">
            <span>${esc(e.nombre)}</span>
            <small>${e.adentro ? "Adentro" : "Sin fichar"}${e.encargado ? " · encargado" : ""}</small>
          </button>`
        )
        .join("")
    : `<p class="pos-vacio">Todavía no hay empleados con PIN. El dueño los carga desde su cuenta, en Empleados.</p>`;
  formPosPin.hidden = !elegido;
  if (elegido) {
    document.getElementById("posPinEtiqueta").textContent = `PIN de ${elegido.nombre}`;
    document.getElementById("btnPosFichar").textContent = elegido.adentro ? "Fichar la salida" : "Fichar la entrada";
  }
}

posQuienLista.addEventListener("click", (e) => {
  const boton = e.target.closest("[data-empleado]");
  if (!boton) return;
  elegido = cajaVinculada.empleados.find((x) => x.id === Number(boton.dataset.empleado));
  formPosPin.reset();
  renderQuien();
  document.getElementById("posPin").focus();
});

function leerPin() {
  const pin = formPosPin.pin.value.trim();
  if (!/^\d{4,6}$/.test(pin)) {
    avisar("El PIN va de 4 a 6 números.", "atencion");
    return null;
  }
  return pin;
}

formPosPin.addEventListener("submit", async (e) => {
  e.preventDefault();
  const pin = leerPin();
  if (!pin) return;
  const boton = formPosPin.querySelector('[type="submit"]');
  try {
    cajaVinculada = await enviando(boton, () =>
      api("/api/caja/atender", { method: "POST", body: { empleado_id: elegido.id, pin }, error: "No se pudo empezar a atender." })
    );
  } finally {
    formPosPin.reset();
  }
  avisar(`Atiende ${cajaVinculada.atiende.nombre}.`, "ok");
  elegido = null;
  await entrarAlPos();
});

document.getElementById("btnPosFichar").addEventListener("click", async (e) => {
  const pin = leerPin();
  if (!pin) return;
  const tipo = elegido.adentro ? "salida" : "entrada";
  let r;
  try {
    r = await enviando(e.currentTarget, () =>
      api("/api/caja/fichar", { method: "POST", body: { empleado_id: elegido.id, pin, tipo }, error: "No se pudo fichar." })
    );
  } finally {
    formPosPin.reset();
  }
  avisar(
    tipo === "entrada"
      ? `${elegido.nombre} fichó la entrada a las ${r.fichaje.hora_entrada}.`
      : `${elegido.nombre} fichó la salida a las ${r.fichaje.hora_salida}.`,
    "ok"
  );
  cajaVinculada = r.caja;
  elegido = null;
  render();
});

// Bloquear deja la caja como está (el turno sigue abierto, la venta en curso
// también) y pide el PIN de quien sigue: el relevo del almuerzo.
document.getElementById("btnPosBloquear").addEventListener("click", async (e) => {
  cajaVinculada = await enviando(e.currentTarget, () => api("/api/caja/bloquear", { method: "POST", error: "No se pudo bloquear la caja." }));
  elegido = null;
  render();
});

// Otra pestaña, o el admin, la bloqueó (sesion.js lo avisa).
document.addEventListener("nexo:caja-bloqueada", async () => {
  if (!enCaja()) return;
  cajaVinculada = await api("/api/caja", { error: "No se pudo cargar la caja." });
  render();
});

document.getElementById("btnPosEntrarCuenta").addEventListener("click", () => window.nexoEntrarConCuenta?.());

// Para el admin, con su cuenta: dejar esta compu como la caja elegida, o
// desvincular las compus que ya lo son.
let compus = [];
async function renderCompu() {
  const panel = document.getElementById("posCompu");
  if (!esAdmin() || !cajaId) {
    panel.hidden = true;
    return;
  }
  compus = await api("/api/cajas/compus", { error: "No se pudieron cargar las compus de las cajas." });
  const caja = compus.find((c) => c.id === cajaId);
  if (!caja) {
    panel.hidden = true;
    return;
  }
  document.getElementById("posCompuTexto").textContent = caja.compus
    ? `${caja.compus === 1 ? "Una compu es" : `${numero(caja.compus)} compus son`} la caja «${caja.nombre}», sin una cuenta: ahí cada uno atiende con su PIN.`
    : `¿Esta es la compu del mostrador? Dejala como la caja «${caja.nombre}»: sin tu cuenta, solo se vende y cada uno atiende con su PIN.`;
  document.getElementById("btnPosVincular").textContent = "Usar esta compu como caja";
  document.getElementById("btnPosDesvincular").hidden = !caja.compus;
  panel.hidden = false;
}

document.getElementById("btnPosVincular").addEventListener("click", async (e) => {
  const boton = e.currentTarget;
  const caja = compus.find((c) => c.id === cajaId);
  const ok = await confirmar({
    titulo: `¿Usar esta compu como la caja «${caja.nombre}»?`,
    cuerpo:
      "Queda vinculada a la caja: cuando salgas de tu cuenta, solo se usa el mostrador y cada empleado atiende y ficha con su PIN. Nadie vende desde su casa. La desvinculás cuando quieras, desde acá.",
    aceptar: "Usar esta compu"
  });
  if (!ok) return;
  await enviando(boton, () => api(`/api/cajas/${cajaId}/vincular`, { method: "POST", error: "No se pudo vincular la compu." }));
  const salir = await confirmar({
    titulo: `Listo: esta compu es la caja «${caja.nombre}»`,
    cuerpo: "Salí de tu cuenta y queda lista para atender. Si volvés a entrar en esta compu, manda tu cuenta hasta que salgas.",
    aceptar: "Salir de mi cuenta"
  });
  if (salir) window.nexoCerrarSesion?.();
  else await renderCompu();
});

document.getElementById("btnPosDesvincular").addEventListener("click", async (e) => {
  const boton = e.currentTarget;
  const caja = compus.find((c) => c.id === cajaId);
  const ok = await confirmar({
    titulo: `¿Desvincular las compus de la caja «${caja.nombre}»?`,
    cuerpo: "Dejan de ser la caja: para volver a usarlas, alguien entra con su cuenta.",
    aceptar: "Desvincular",
    destructivo: true
  });
  if (!ok) return;
  await enviando(boton, () => api(`/api/cajas/${cajaId}/vinculo`, { method: "DELETE", error: "No se pudo desvincular." }));
  avisar(`La caja «${caja.nombre}» ya no tiene compus vinculadas.`, "ok");
  await renderCompu();
});

// Se carga al entrar en la vista (ver mostrarVista en core/router.js).
alEntrarEnVista("pos", entrarAlPos);
