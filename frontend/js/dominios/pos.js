/**
 * dominios/pos.js
 * Punto de venta y turno de caja (CLAUDE.md §30, Etapa D). Es la pantalla de
 * mostrador sobre las rutas de server.js, sección "Punto de venta y turno de
 * caja" (hist. §67): no tiene circuito de datos propio, cada venta es una
 * venta común con sus cobros, colgada del turno abierto de la caja.
 */

import { camposFicha, cantidad, esFraccionable, esc, fechaHoraAR, hoyISO, money, numero } from "../core/formato.js";
import { avisar, confirmar, filaVacia } from "../core/ui.js";
import { api, refrescar } from "../core/api.js";
import { icono } from "../core/iconos.js";
import { crearConsumos } from "../core/al-vender.js";
import { cantidadDeEtiqueta, leerEtiqueta } from "../core/balanza.js";
import { mejorOferta, proximaPromocion } from "../core/ofertas.js";
import { negocio } from "../core/negocio.js";
import { cargarQr } from "../core/comprobante.js";
import { alEntrarEnVista, recargar } from "../core/registro.js";

const CONSUMIDOR_FINAL = "Consumidor final";
const MAX_RESULTADOS = 40;
const CENTAVO = 0.005;
// Por negocio (hist. §77): la caja elegida en uno no es una caja del otro.
const CLAVE_CAJA = `nexo.pos.caja.${document.documentElement.dataset.organizacion}`;
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
let catalogo = [];
let porClave = new Map();
// Las ofertas del negocio (hist. §133): el precio de cada renglón es el de la
// que gana hoy con esa cantidad, como lo calcula el servidor al anotarla.
let ofertas = [];
let clientes = [];
// Venta en curso: [{ clave, cantidad }]. Precio y stock salen del catálogo.
let carrito = [];
let ultimaAgregada = null;

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
    : `No hay stock de "${item.nombre}".`;
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
  const [abiertos, tesoreria, items, listaClientes] = await Promise.all([
    api("/api/turnos-caja?estado=abierto", { error: "No se pudo consultar la caja." }),
    api("/api/tesoreria", { error: "No se pudieron cargar las cuentas de tesorería." }),
    api("/api/pos/catalogo", { error: "No se pudo cargar el catálogo." }),
    api("/api/clientes", { error: "No se pudieron cargar los clientes." }),
    consumosPos.cargar(),
    api("/api/ofertas", { error: "No se pudieron cargar las ofertas." }).then((lista) => (ofertas = lista)),
    api("/api/medios-cobro?activos=1", { error: "No se pudieron cargar los medios de cobro." }).then((lista) => (medios = lista))
  ]);
  cuentas = tesoreria.cuentas;
  cajas = cuentas.filter((c) => c.tipo === "efectivo");
  fijarCatalogo(items);
  // "Consumidor final" es el cliente de las ventas sin cliente: elegirlo a
  // mano no cambia nada, y a ese cliente no se le fía.
  clientes = listaClientes.filter((c) => c.nombre !== CONSUMIDOR_FINAL);
  document.getElementById("posClientes").innerHTML = clientes
    .map((c) => `<option value="${esc(c.nombre)}"></option>`)
    .join("");

  // La caja se recuerda por dispositivo: la PC del mostrador opera siempre la
  // misma. Si no hay recuerdo, la que ya tiene un turno abierto.
  const ids = cajas.map((c) => c.id);
  const recordada = Number(leerGuardado(localStorage, CLAVE_CAJA));
  cajaId = ids.includes(recordada)
    ? recordada
    : (abiertos.find((t) => ids.includes(t.cuenta_tesoreria_id))?.cuenta_tesoreria_id ?? ids[0] ?? null);
  turno = abiertos.find((t) => t.cuenta_tesoreria_id === cajaId) ?? null;
  if (turno) leerCarrito();
  else carrito = [];
  render();
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
  elegir.hidden = cajas.length < 2;
  document.getElementById("posCaja").innerHTML = cajas
    .map((c) => `<option value="${c.id}" ${c.id === cajaId ? "selected" : ""}>${esc(c.nombre)}</option>`)
    .join("");

  posApertura.hidden = !cajaId || !!turno;
  posMostrador.hidden = !turno;
  if (!cajaId) return;
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
  document.getElementById("posTurnoCaja").textContent = turno.cuenta;
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
      const stock =
        i.stock === null ? "Servicio" : i.stock > 0 ? `${cantidad(redondearCantidad(i.stock - enCarrito), i.unidad)} disp.` : "Sin stock";
      return `
        <button type="button" class="pos-item" data-clave="${esc(i.clave)}" ${hayStock(i) ? "" : "disabled"}>
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
  if (boton && !boton.disabled) agregar(boton.dataset.clave);
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

function guardarCarrito() {
  if (turno) guardar(sessionStorage, claveCarrito(), carrito.length ? JSON.stringify(carrito) : null);
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
    .map((r) => ({ clave: r.clave, cantidad: Math.min(r.cantidad, tope(porClave.get(r.clave))) }));
}

// El precio de un renglón con su cantidad: el de la oferta que gana hoy, o el
// de lista. promo es la promoción por cantidad que se gana llevando más.
function precioDelRenglon(r) {
  const item = porClave.get(r.clave);
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
    return { producto_id: item.producto_id, variante_id: item.variante_id, cantidad: r.cantidad, precio_unitario: precioDelRenglon(r).precio };
  });

const totalCarrito = () => redondear(carrito.reduce((acc, r) => acc + r.cantidad * precioDelRenglon(r).precio, 0));
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
        const { precio, oferta, promo } = precioDelRenglon(r);
        const nuevo = r.clave === ultimaAgregada ? " pos-renglon-nuevo" : "";
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
  document.getElementById("btnPosCobrar").disabled = carrito.length === 0;
  document.getElementById("btnPosBarraCobrar").disabled = carrito.length === 0;
}

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

function resolverCliente() {
  const nombre = posCliente.value.trim();
  if (!nombre || nombre.toLowerCase() === CONSUMIDOR_FINAL.toLowerCase()) return { cliente: null };
  const cliente = clientes.find((c) => c.nombre.trim().toLowerCase() === nombre.toLowerCase());
  return cliente ? { cliente } : { error: `No hay un cliente «${nombre}». Elegilo de la lista, o dejá el campo vacío para vender a consumidor final.` };
}

function abrirCobro() {
  if (!turno || carrito.length === 0) return;
  const { cliente, error } = resolverCliente();
  if (error) {
    avisar(error, "atencion");
    posCliente.focus();
    return;
  }
  if (medios.length === 0) {
    avisar("No hay medios de cobro activos. El administrador los arma en Configuración → Medios de cobro.", "atencion");
    return;
  }
  const total = totalCarrito();
  // Arranca en efectivo: es lo que más se usa, y un toque lo cambia.
  const inicial = medioEfectivo() ?? medios[0];
  cobro = { total, cliente, filas: [{ medio_id: inicial.id, cuotas: cuotasIniciales(inicial), importe: total }] };

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
      const dias = medio?.dias_acreditacion ?? 0;
      const textoAcredita = dias === 1 ? "Se acredita en 1 día" : `Se acredita en ${dias} días`;
      const acredita = dias > 0 ? `<span class="pos-cobro-acredita">${esc(textoAcredita)}</span>` : "";
      return `
        <div class="pos-cobro-fila" data-indice="${i}">
          <div class="pos-cobro-medio">
            <select class="pos-cobro-medio-select" aria-label="Medio de pago">
              ${medios.map((m) => `<option value="${m.id}" ${m.id === f.medio_id ? "selected" : ""}>${esc(m.nombre)}</option>`).join("")}
            </select>
            ${cuotas}${acredita}
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
  document.getElementById("formPosCobroSubmit").disabled = !!error;
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
    // Cambia lo que muestra la fila (cuotas, acreditación): se dibuja de nuevo.
    renderFilasCobro();
  } else if (e.target.classList.contains("pos-cobro-cuotas")) {
    datos.cuotas = Number(e.target.value);
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
  const { falta } = calcularCobro();
  if (falta < CENTAVO && cobro.filas.length === 1) {
    cobro.filas[0] = { medio_id: medioId, cuotas, importe: cobro.total };
  } else {
    cobro.filas.push({ medio_id: medioId, cuotas, importe: falta });
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
    const clave = `${f.medio_id}:${f.cuotas ?? ""}`;
    porMedio.set(clave, { medio_id: f.medio_id, cuotas: f.cuotas, importe: redondear((porMedio.get(clave)?.importe ?? 0) + f.importe) });
  }
  if (vuelto > 0) {
    const enEfectivo = [...porMedio.values()].find((c) => c.medio_id === efectivoId);
    if (enEfectivo) enEfectivo.importe = redondear(enEfectivo.importe - vuelto);
  }
  return [...porMedio.values()]
    .filter((c) => c.importe >= CENTAVO)
    .map(({ medio_id, cuotas, importe }) => ({ medio_cobro_id: medio_id, ...(cuotas ? { cuotas } : {}), importe }));
}

const btnPosACuenta = document.getElementById("btnPosACuenta");

document.getElementById("formPosCobro").addEventListener("submit", (e) => {
  e.preventDefault();
  const { vuelto, falta, error } = calcularCobro();
  if (error) return;
  registrarVenta({ cobros: cobrosParaEnviar(vuelto), vuelto, falta });
});

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
  registrarVenta({ cobros: [], vuelto: 0, falta: cobro.total });
});

async function registrarVenta({ cobros, vuelto, falta }) {
  const submit = document.getElementById("formPosCobroSubmit");
  const body = {
    turno_caja_id: turno.id,
    ...(cobro.cliente ? { cliente_id: cobro.cliente.id } : {}),
    items: itemsDelCarrito(),
    consumos: consumosPos.leer(),
    cobros
  };
  // Los dos botones quedan apagados: un toque en cada uno no son dos ventas.
  btnPosACuenta.disabled = true;
  const venta = await enviando(submit, () =>
    api("/api/pos/ventas", { method: "POST", body, error: "No se pudo registrar la venta." })
  )
    .catch((err) => {
      // El stock o la caja pudieron cambiar desde otro puesto: se vuelve a
      // leer todo para que lo que se ve sea lo que hay.
      refrescar([cargarTodo()]);
      throw err;
    })
    .finally(() => {
      btnPosACuenta.disabled = false;
    });

  mostrarExito({ id: venta.id, vuelto, falta, cliente: cobro.cliente, ahorro: ahorroCarrito() });
  ventaHecha();
}

// Lo que sigue a una venta registrada: el carrito vacío y el resto de Nexo al
// día.
function ventaHecha() {
  carrito = [];
  guardarCarrito();
  posCliente.value = "";
  posBuscar.value = "";
  refrescar([cargarTodo()]);
  // El resto de Nexo se entera sin frenar la venta siguiente.
  refrescar([recargar("ventas", "stock", "productos", "clientes", "caja", "cuentasCorrientes", "panelResumen", "reporteStock")]);
}

function mostrarExito({ id, vuelto, falta, cliente, ahorro }) {
  document.getElementById("formPosCobro").hidden = true;
  document.getElementById("posExito").hidden = false;
  document.getElementById("posExitoTitulo").textContent = `Venta #${id} registrada`;
  document.getElementById("posExitoVueltoWrap").hidden = vuelto <= 0;
  document.getElementById("posExitoVuelto").textContent = money(vuelto);
  const nota = document.getElementById("posExitoNota");
  const notas = [
    ahorro >= CENTAVO ? `Ahorró ${money(ahorro)} con las ofertas.` : "",
    falta >= CENTAVO ? `Quedaron ${money(falta)} en la cuenta corriente de ${cliente.nombre}.` : ""
  ].filter(Boolean);
  nota.hidden = notas.length === 0;
  nota.textContent = notas.join(" ");
  document.getElementById("btnPosNuevaVenta").focus();
}

function cerrarCobro() {
  // Con un QR esperando, la venta ya existe: se cancela o se cobra.
  if (esperandoQr) {
    avisar("Está esperando el pago del QR. Si no pagó, tocá «No pagó: cobrar de otra forma».", "atencion");
    return;
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
// dirección pública). Si no paga, se anula y se cobra de otra forma.
const btnPosQr = document.getElementById("btnPosQr");
const posQr = document.getElementById("posQr");
const SEGUNDOS_SONDEO_QR = 3;
const SONDEOS_POR_PREGUNTA = 5;
// { id, cliente, ahorro, vueltas, sondeo }
let esperandoQr = null;

btnPosQr.addEventListener("click", async () => {
  const body = {
    turno_caja_id: turno.id,
    ...(cobro.cliente ? { cliente_id: cobro.cliente.id } : {}),
    items: itemsDelCarrito(),
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
  posQr.hidden = false;
  esperandoQr = { id: venta.id, cliente: cobro.cliente, ahorro: ahorroCarrito(), vueltas: 0 };
  esperandoQr.sondeo = setInterval(() => revisarQr(), SEGUNDOS_SONDEO_QR * 1000);
});

// Sin api(): mientras espera no tiene que llenar la pantalla de avisos.
async function revisarQr({ preguntar = false } = {}) {
  const actual = esperandoQr;
  if (!actual) return false;
  actual.vueltas += 1;
  if (preguntar || actual.vueltas % SONDEOS_POR_PREGUNTA === 0) {
    await fetch(`/api/ventas/${actual.id}/revisar-pagos`, { method: "POST" }).catch(() => {});
  }
  const venta = await fetch(`/api/ventas/${actual.id}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  if (!venta || esperandoQr !== actual || venta.cobrado < venta.neto - CENTAVO) return false;
  terminarQr();
  mostrarExito({ id: actual.id, vuelto: 0, falta: 0, cliente: actual.cliente, ahorro: actual.ahorro });
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
  const res = await enviando(e.currentTarget, () => fetch(`/api/pos/ventas/${id}/cancelar-qr`, { method: "POST" }));
  if (res.status === 409) {
    // El pago entró justo: no se cancela, se cobró.
    await revisarQr({ preguntar: true });
    return;
  }
  terminarQr();
  document.getElementById("formPosCobro").hidden = false;
  avisar(res.ok ? `Venta #${id} anulada: cobrala con otro medio.` : "No se pudo anular la venta del QR: avisale al administrador.", res.ok ? "ok" : "error");
  refrescar([cargarTodo()]);
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

// Se carga al entrar en la vista (ver mostrarVista en core/router.js).
alEntrarEnVista("pos", entrarAlPos);
