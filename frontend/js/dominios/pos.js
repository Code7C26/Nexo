/**
 * dominios/pos.js
 * Punto de venta y turno de caja (CLAUDE.md §30, Etapa D). Es la pantalla de
 * mostrador sobre las rutas de server.js, sección "Punto de venta y turno de
 * caja" (hist. §67): no tiene circuito de datos propio, cada venta es una
 * venta común con sus cobros, colgada del turno abierto de la caja.
 */

import { camposFicha, esc, fechaHoraAR, money, numero } from "../core/formato.js";
import { avisar, confirmar, filaVacia } from "../core/ui.js";
import { api, refrescar } from "../core/api.js";
import { icono } from "../core/iconos.js";
import { alEntrarEnVista, recargar } from "../core/registro.js";

const CONSUMIDOR_FINAL = "Consumidor final";
const MAX_RESULTADOS = 40;
const CENTAVO = 0.005;
const CLAVE_CAJA = "nexo.pos.caja";
const ICONO_TIPO_CUENTA = { efectivo: "banknote", banco: "building-2", mercadopago: "wallet", otro: "wallet" };

let cuentas = []; // todas las cuentas de tesorería, con saldo
let cajas = []; // las de tipo efectivo: un turno es de una de ellas
let cajaId = null;
let turno = null; // resumen del turno abierto de la caja elegida
let catalogo = [];
let porClave = new Map();
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

const redondear = (n) => Math.round(n * 100) / 100;
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
    api("/api/clientes", { error: "No se pudieron cargar los clientes." })
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
  // "gor-01-m" también se encuentra tal cual se tipea).
  catalogo = items.map((i) => ({
    ...i,
    clave: claveDe(i),
    palabras: [...palabrasDe(`${i.nombre} ${i.categoria ?? ""} ${i.sku ?? ""}`), normalizar(i.sku).trim()].filter(Boolean)
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
  document.getElementById("posAperturaSaldo").textContent =
    `Según el sistema, en ${caja.nombre} hay ${money(caja.saldo)}. Contá el efectivo y cargá lo que hay: ` +
    "si no coincide, la diferencia queda registrada.";
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
  const lista = filtrar(consulta).sort((a, b) => (b.stock > 0) - (a.stock > 0));
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
      const disponible = i.stock - enCarrito;
      return `
        <button type="button" class="pos-item" data-clave="${esc(i.clave)}" ${i.stock > 0 ? "" : "disabled"}>
          <span class="pos-item-nombre">${esc(i.nombre)}</span>
          <span class="pos-item-meta">${esc([i.sku, i.categoria].filter(Boolean).join(" · "))}</span>
          <span class="pos-item-pie">
            <span class="pos-item-precio mono">${money(i.precio)}</span>
            <span class="pos-item-stock">${i.stock > 0 ? `${numero(disponible)} disp.` : "Sin stock"}</span>
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

// El SKU exacto gana; si no, sirve un único resultado que se pueda vender.
// Si hay varios, la grilla queda filtrada para elegir con el dedo.
function agregarPorCodigo(codigo) {
  const buscado = codigo.toLowerCase();
  const exacto = catalogo.find((i) => i.sku && i.sku.trim().toLowerCase() === buscado);
  const candidatos = exacto ? [exacto] : filtrar(codigo).filter((i) => i.stock > 0);
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

function agregar(clave) {
  const item = porClave.get(clave);
  if (!item) return;
  const renglon = carrito.find((r) => r.clave === clave);
  const cantidad = (renglon?.cantidad ?? 0) + 1;
  if (cantidad > item.stock) {
    avisar(
      item.stock > 0
        ? `No hay más stock de "${item.nombre}" (disponible: ${numero(item.stock)}).`
        : `No hay stock de "${item.nombre}".`,
      "atencion"
    );
    return;
  }
  if (renglon) renglon.cantidad = cantidad;
  else carrito.push({ clave, cantidad });
  ultimaAgregada = clave;
  cambioElCarrito();
}

function fijarCantidad(clave, cantidad) {
  const item = porClave.get(clave);
  const renglon = carrito.find((r) => r.clave === clave);
  if (!item || !renglon) return;
  if (!(cantidad > 0)) {
    carrito = carrito.filter((r) => r.clave !== clave);
  } else if (cantidad > item.stock) {
    avisar(`No hay más stock de "${item.nombre}" (disponible: ${numero(item.stock)}).`, "atencion");
    renglon.cantidad = item.stock;
  } else {
    renglon.cantidad = cantidad;
  }
  cambioElCarrito();
}

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
    .filter((r) => porClave.get(r.clave)?.stock > 0 && r.cantidad > 0)
    .map((r) => ({ clave: r.clave, cantidad: Math.min(r.cantidad, porClave.get(r.clave).stock) }));
}

const totalCarrito = () =>
  redondear(carrito.reduce((acc, r) => acc + r.cantidad * porClave.get(r.clave).precio, 0));

function renderTicket() {
  const total = totalCarrito();
  const unidades = carrito.reduce((acc, r) => acc + r.cantidad, 0);

  if (carrito.length === 0) {
    posRenglones.innerHTML = `<li class="pos-ticket-vacio">Buscá un producto o pasá el lector para empezar.</li>`;
  } else {
    posRenglones.innerHTML = carrito
      .map((r) => {
        const item = porClave.get(r.clave);
        const nuevo = r.clave === ultimaAgregada ? " pos-renglon-nuevo" : "";
        return `
          <li class="pos-renglon${nuevo}" data-clave="${esc(r.clave)}">
            <div class="pos-renglon-info">
              <span class="pos-renglon-nombre">${esc(item.nombre)}</span>
              <span class="pos-renglon-precio mono">${money(item.precio)} c/u</span>
            </div>
            <div class="pos-cantidad">
              <button type="button" class="pos-cantidad-btn" data-accion="menos" aria-label="Uno menos">${icono("minus")}</button>
              <input type="number" class="pos-cantidad-input" value="${Number(r.cantidad)}" min="0" step="any" inputmode="decimal" aria-label="Cantidad de ${esc(item.nombre)}" />
              <button type="button" class="pos-cantidad-btn" data-accion="mas" aria-label="Uno más">${icono("plus")}</button>
            </div>
            <span class="pos-renglon-subtotal mono">${money(r.cantidad * item.precio)}</span>
            <button type="button" class="btn-icon pos-renglon-quitar" data-accion="quitar" aria-label="Quitar ${esc(item.nombre)}">${icono("trash-2")}</button>
          </li>`;
      })
      .join("");
  }
  ultimaAgregada = null;

  document.getElementById("posTotal").textContent = money(total);
  document.getElementById("posBarraTotal").textContent = money(total);
  document.getElementById("posBarraCantidad").textContent =
    unidades === 0 ? "Sin productos" : `${numero(unidades)} ${unidades === 1 ? "unidad" : "unidades"}`;
  document.getElementById("btnPosVaciar").hidden = carrito.length === 0;
  document.getElementById("btnPosCobrar").disabled = carrito.length === 0;
  document.getElementById("btnPosBarraCobrar").disabled = carrito.length === 0;
}

posRenglones.addEventListener("click", (e) => {
  const boton = e.target.closest("[data-accion]");
  if (!boton) return;
  const clave = boton.closest(".pos-renglon").dataset.clave;
  const actual = cantidadEnCarrito(clave);
  if (boton.dataset.accion === "mas") agregar(clave);
  if (boton.dataset.accion === "menos") fijarCantidad(clave, actual - 1);
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

// filas: [{ cuenta_id, importe }]. El efectivo es siempre la caja del turno:
// un cobro en efectivo a otra cuenta no entraría en el arqueo.
let cobro = null;

const cuentasDeCobro = () => [
  ...cuentas.filter((c) => c.id === turno.cuenta_tesoreria_id),
  ...cuentas.filter((c) => c.tipo !== "efectivo")
];

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
  const total = totalCarrito();
  cobro = { total, cliente, filas: [{ cuenta_id: turno.cuenta_tesoreria_id, importe: total }] };

  document.getElementById("formPosCobro").hidden = false;
  document.getElementById("posExito").hidden = true;
  document.getElementById("posCobroCliente").textContent = cliente ? cliente.nombre : CONSUMIDOR_FINAL;
  document.getElementById("posCobroTotal").textContent = money(total);
  document.getElementById("posMedios").innerHTML = cuentasDeCobro()
    .map(
      (c) =>
        `<button type="button" class="pos-medio" data-cuenta="${c.id}">${icono(ICONO_TIPO_CUENTA[c.tipo] ?? "wallet")} ${esc(c.nombre)}</button>`
    )
    .join("");
  renderFilasCobro();
  actualizarCobro();
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
  const opciones = cuentasDeCobro();
  document.getElementById("posCobros").innerHTML = cobro.filas
    .map(
      (f, i) => `
        <div class="pos-cobro-fila" data-indice="${i}">
          <select class="pos-cobro-cuenta" aria-label="Medio de pago">
            ${opciones.map((c) => `<option value="${c.id}" ${c.id === f.cuenta_id ? "selected" : ""}>${esc(c.nombre)}</option>`).join("")}
          </select>
          <input type="number" class="pos-cobro-importe" value="${f.importe ? Number(f.importe) : ""}" step="0.01" min="0" inputmode="decimal" placeholder="0.00" aria-label="Importe" />
          ${cobro.filas.length > 1 ? `<button type="button" class="btn-icon pos-cobro-quitar" aria-label="Quitar este medio">${icono("x")}</button>` : ""}
        </div>`
    )
    .join("");
}

function calcularCobro() {
  const efectivoId = turno.cuenta_tesoreria_id;
  const pagado = redondear(cobro.filas.reduce((acc, f) => acc + f.importe, 0));
  const enEfectivo = redondear(cobro.filas.filter((f) => f.cuenta_id === efectivoId).reduce((acc, f) => acc + f.importe, 0));
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
  if (!fila || !e.target.classList.contains("pos-cobro-cuenta")) return;
  cobro.filas[Number(fila.dataset.indice)].cuenta_id = Number(e.target.value);
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
  const cuentaId = Number(boton.dataset.cuenta);
  const existente = cobro.filas.findIndex((f) => f.cuenta_id === cuentaId);
  if (existente >= 0) {
    enfocarImporte(existente);
    return;
  }
  const { falta } = calcularCobro();
  if (falta < CENTAVO && cobro.filas.length === 1) {
    cobro.filas[0] = { cuenta_id: cuentaId, importe: cobro.total };
  } else {
    cobro.filas.push({ cuenta_id: cuentaId, importe: falta });
  }
  renderFilasCobro();
  actualizarCobro();
  enfocarImporte(cobro.filas.findIndex((f) => f.cuenta_id === cuentaId));
});

// El backend no acepta cobros por más que el total: el vuelto se descuenta
// del efectivo antes de mandar, y las filas de una misma cuenta se juntan.
function cobrosParaEnviar(vuelto) {
  const efectivoId = turno.cuenta_tesoreria_id;
  const porCuenta = new Map();
  for (const f of cobro.filas) {
    if (f.importe > 0) porCuenta.set(f.cuenta_id, redondear((porCuenta.get(f.cuenta_id) ?? 0) + f.importe));
  }
  if (vuelto > 0) porCuenta.set(efectivoId, redondear(porCuenta.get(efectivoId) - vuelto));
  return [...porCuenta]
    .filter(([, importe]) => importe >= CENTAVO)
    .map(([cuenta_tesoreria_id, importe]) => ({ cuenta_tesoreria_id, importe }));
}

document.getElementById("formPosCobro").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { vuelto, falta, error } = calcularCobro();
  if (error) return;
  const submit = document.getElementById("formPosCobroSubmit");
  const body = {
    turno_caja_id: turno.id,
    ...(cobro.cliente ? { cliente_id: cobro.cliente.id } : {}),
    items: carrito.map((r) => {
      const item = porClave.get(r.clave);
      return { producto_id: item.producto_id, variante_id: item.variante_id, cantidad: r.cantidad, precio_unitario: item.precio };
    }),
    cobros: cobrosParaEnviar(vuelto)
  };
  const venta = await enviando(submit, () =>
    api("/api/pos/ventas", { method: "POST", body, error: "No se pudo registrar la venta." })
  ).catch((err) => {
    // El stock o la caja pudieron cambiar desde otro puesto: se vuelve a
    // leer todo para que lo que se ve sea lo que hay.
    refrescar([cargarTodo()]);
    throw err;
  });

  mostrarExito({ id: venta.id, vuelto, falta, cliente: cobro.cliente });
  carrito = [];
  guardarCarrito();
  posCliente.value = "";
  posBuscar.value = "";
  refrescar([cargarTodo()]);
  // El resto de Nexo se entera sin frenar la venta siguiente.
  refrescar([recargar("ventas", "stock", "productos", "clientes", "caja", "cuentasCorrientes", "panelResumen", "reporteStock")]);
});

function mostrarExito({ id, vuelto, falta, cliente }) {
  document.getElementById("formPosCobro").hidden = true;
  document.getElementById("posExito").hidden = false;
  document.getElementById("posExitoTitulo").textContent = `Venta #${id} registrada`;
  document.getElementById("posExitoVueltoWrap").hidden = vuelto <= 0;
  document.getElementById("posExitoVuelto").textContent = money(vuelto);
  const nota = document.getElementById("posExitoNota");
  nota.hidden = !(falta >= CENTAVO);
  nota.textContent = falta >= CENTAVO ? `Quedaron ${money(falta)} en la cuenta corriente de ${cliente.nombre}.` : "";
  document.getElementById("btnPosNuevaVenta").focus();
}

function cerrarCobro() {
  modalPosCobro.hidden = true;
  enfocarBusqueda();
}

document.getElementById("btnPosNuevaVenta").addEventListener("click", cerrarCobro);
document.getElementById("modalPosCobroClose").addEventListener("click", cerrarCobro);
modalPosCobro.addEventListener("click", (e) => {
  if (e.target === modalPosCobro) cerrarCobro();
});
document.getElementById("btnPosCobrar").addEventListener("click", abrirCobro);
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
  modalPosCierre.hidden = false;
});

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
      body: { contado, ...(nota ? { nota } : {}) },
      error: "No se pudo cerrar la caja."
    })
  );
  carrito = [];
  guardarCarrito();
  modalPosCierre.hidden = true;
  const sinDiferencia = Math.abs(cerrado.diferencia_cierre) < CENTAVO;
  avisar(`Caja cerrada. ${textoDiferencia(cerrado.diferencia_cierre)}.`, sinDiferencia ? "ok" : "atencion");
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
