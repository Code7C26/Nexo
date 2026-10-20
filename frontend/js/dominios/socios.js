/**
 * dominios/socios.js
 * Socios, planes, descuentos, cuotas e ingreso (CLAUDE.md §29, hist. §74 y
 * §75): el módulo `socios`, que cualquier negocio puede prender y que el
 * gimnasio trae prendido.
 *
 * Pantallas sobre las rutas de server.js, sección "Socios, planes y cuotas":
 * - Ingreso (#/ingreso): la recepción busca al que llega. Al día, el ingreso
 *   se anota solo; si debe, se ve cuánto y se cobra ahí o se lo deja pasar.
 * - Socios (#/socios): la lista, y el alta como página aparte (#/socios/nuevo),
 *   con uno o varios planes y la duración de cada uno.
 * - La ficha de un socio: sus planes (duración, dejar, reactivar, sumar otro),
 *   su descuento a mano, el cobro, sus cuotas y sus ingresos.
 * - Planes (#/planes-socio, solo admin): cada plan con sus duraciones y
 *   precios, y en otra pestaña (#/planes-socio/descuentos) los descuentos y
 *   combos. Estaban en Configuración; se mudaron al menú (hist. §76).
 *
 * No hay circuito propio: cada cuota es una venta del servicio del plan, así
 * que después de cobrar o dar de alta se recargan ventas, caja y cuentas
 * corrientes como en cualquier otra venta. Los descuentos los calcula el
 * servidor: la pantalla pide una cotización antes de confirmar.
 */

import { ICONO_TACHO, badge, botonEditarFila, camposFicha, esAdmin, esc, fechaAR, fechaHoraAR, hoyISO, money } from "../core/formato.js";
import { avisar, confirmar, filaVacia, tablaCargando } from "../core/ui.js";
import { api, refrescar } from "../core/api.js";
import { icono } from "../core/iconos.js";
import { alEntrarEnVista, invocar, recargar } from "../core/registro.js";
import { mostrarVista } from "../core/router.js";
import { limpiarError, limpiarErrores, marcarError } from "../core/campos.js";

const MAX_RESULTADOS = 8;
const MAX_MESES = 36;
const ICONO_TIPO_CUENTA = { efectivo: "banknote", banco: "building-2", mercadopago: "wallet", otro: "wallet" };
// Los mismos nombres que nombreDuracion() de server.js, para lo que se está
// escribiendo en el formulario y todavía no se guardó.
const NOMBRES_DURACION = { 1: "Mensual", 2: "Bimestral", 3: "Trimestral", 4: "Cuatrimestral", 6: "Semestral", 12: "Anual" };
// Lo que propone "Agregar otra duración", en este orden, si no está.
const DURACIONES_SUGERIDAS = [1, 3, 6, 12, 2, 4];

// Cómo se ve la situación de un socio (conSituacion() en server.js): verde lo
// resuelto, rojo lleno lo urgente, azul lo que todavía no empezó y gris la baja.
const SITUACION = {
  al_dia: { texto: "Al día", clase: "status-cobrado" },
  debe: { texto: "Debe", clase: "status-vencido" },
  por_empezar: { texto: "Por empezar", clase: "status-info" },
  baja: { texto: "De baja", clase: "" }
};

let socios = [];
let planes = [];
let descuentos = [];
let cuentas = [];
let clientesLibres = [];
let ingresosHoy = [];
let filtro = "activos";
let fichaSocio = null;

const conMouse = () => window.matchMedia("(pointer: fine)").matches;
const normalizar = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
const soloDigitos = (s) => String(s ?? "").replace(/\D/g, "");
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const horaDe = (fechaHora) => fechaHoraAR(fechaHora).slice(-5);
const porcentaje = (n) => `${n.toLocaleString("es-AR")}%`;
const duracionDe = (meses) => NOMBRES_DURACION[meses] ?? (meses % 12 === 0 ? `${meses / 12} años` : `${meses} meses`);
const planesActivos = (s) => s.planes.filter((p) => p.estado === "activa");
const opcionesActivas = (plan) => plan.opciones.filter((o) => o.activo);
const planesOfrecidos = () => planes.filter((p) => p.activo && opcionesActivas(p).length > 0);
const valorDescuento = (select) => (select.value ? Number(select.value) : null);

// Mientras se espera al servidor el control queda deshabilitado: un doble
// click en "Cobrar" no puede cobrar dos veces.
async function enviando(control, fn) {
  control.disabled = true;
  try {
    return await fn();
  } finally {
    control.disabled = false;
  }
}

/* ---------- Fechas de los períodos (espejo de server.js) ---------- */

// La misma fecha n meses después, o el último día del mes si no lo tiene:
// sumarMeses() de server.js, para anticipar qué período se va a cobrar.
function sumarMeses(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m + n, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + n, Math.min(d, ultimo))).toISOString().slice(0, 10);
}

function sumarDias(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// El primer período que se cobra: el que contiene la fecha de alta o, si el
// alta es de antes, el de hoy (cobrar_desde en schema.sql).
function primerPeriodo(alta, meses, hoy) {
  const cobrarDesde = alta > hoy ? alta : hoy;
  for (let k = 0; k < 400 * meses; k += meses) {
    const hasta = sumarDias(sumarMeses(alta, k + meses), -1);
    if (hasta >= cobrarDesde) return { desde: sumarMeses(alta, k), hasta };
  }
  return null;
}

/* ---------- Cargas ---------- */

async function cargarSocios() {
  socios = await api("/api/socios", { error: "No se pudieron cargar los socios." });
}

async function cargarPlanes() {
  planes = await api("/api/planes-socio", { error: "No se pudieron cargar los planes." });
}

async function cargarDescuentos() {
  descuentos = await api("/api/descuentos-socio", { error: "No se pudieron cargar los descuentos." });
}

// Las cuentas donde puede entrar la plata de una cuota, para los botones de
// cobro. Se traen acá y no de core/maestros.js: Caja las carga al arrancar,
// pero un deep-link a #/ingreso puede llegar antes.
async function cargarCuentas() {
  const todas = await api("/api/cuentas-tesoreria", { error: "No se pudieron cargar las cuentas." });
  cuentas = todas.filter((c) => c.activa !== 0 && c.activa !== false);
}

async function cargarIngresosHoy() {
  ingresosHoy = await api("/api/socios/ingresos", { error: "No se pudieron cargar los ingresos de hoy." });
}

// Lo que cambia en el resto de Nexo cuando se cobra o se da de alta: la cuota
// es una venta en la cuenta corriente del cliente, y el cobro entra a caja.
const recargarOtrasVistas = () => recargar("ventas", "caja", "clientes", "cuentasCorrientes");

/* ---------- Textos compartidos ---------- */

// Los planes que hace (o hacía, si está de baja), para la lista y la recepción.
function nombresDePlanes(s) {
  const activos = planesActivos(s);
  return (activos.length ? activos : s.planes).map((p) => p.plan).join(", ");
}

function duracionesDePlanes(s) {
  const activos = planesActivos(s);
  return (activos.length ? activos : s.planes).map((p) => p.duracion).join(" · ");
}

// La línea de la cuota que acompaña a la situación, en la lista y en la ficha.
function textoCuota(s) {
  if (s.situacion === "baja") return s.fecha_baja ? `De baja desde el ${fechaAR(s.fecha_baja)}` : "De baja";
  if (s.situacion === "debe") return s.debe_desde === hoyISO() ? "Vence hoy" : `Vencida el ${fechaAR(s.debe_desde)}`;
  if (s.situacion === "por_empezar") return `Empieza el ${fechaAR(s.empieza)}`;
  return s.al_dia_hasta ? `Hasta el ${fechaAR(s.al_dia_hasta)}` : "—";
}

const badgeSituacion = (s) => badge(SITUACION[s.situacion].clase, SITUACION[s.situacion].texto).html;

// Un precio con su descuento: el de lista tachado, el final y de dónde sale.
function precioConDescuento(lista, precio, descuento) {
  if (!descuento) return `<span class="cotizacion-precio"><strong class="mono">${money(precio)}</strong></span>`;
  const etiqueta = `−${porcentaje(descuento.porcentaje)} · ${descuento.nombre}`;
  return `
    <span class="cotizacion-precio">
      <s class="mono">${money(lista)}</s> <strong class="mono">${money(precio)}</strong>
      <span class="cotizacion-descuento">${esc(etiqueta)}</span>
    </span>`;
}

// Las líneas de una cotización (POST /api/socios/cotizacion): cada plan con su
// duración, su primer período y su precio con descuento, y los planes que ya
// tenía y cambian de descuento (un combo que se completa).
function lineasCotizacion(cotizacion, desde) {
  const hoy = hoyISO();
  const lineas = cotizacion.lineas.map((l) => {
    const periodo = desde ? primerPeriodo(desde, l.meses, hoy) : null;
    const meta = periodo ? `${l.duracion}, del ${fechaAR(periodo.desde)} al ${fechaAR(periodo.hasta)}` : l.duracion;
    const precio = precioConDescuento(l.precio_lista, l.precio, l.descuento);
    return `
    <li class="cotizacion-linea">
      <span class="cotizacion-plan">${esc(l.plan)}<span class="cotizacion-meta">${esc(meta)}</span></span>
      ${precio}
    </li>`;
  });
  const cambian = cotizacion.cambian.map((c) => {
    const texto = c.descuento
      ? `Desde su próxima cuota tiene ${porcentaje(c.descuento.porcentaje)} (${c.descuento.nombre})`
      : "Desde su próxima cuota deja de tener descuento";
    return `
    <li class="cotizacion-linea cotizacion-cambia">
      <span class="cotizacion-plan">${esc(c.plan)}<span class="cotizacion-meta">${esc(texto)}</span></span>
      <span class="cotizacion-precio"><strong class="mono">${money(c.precio)}</strong></span>
    </li>`;
  });
  return [...lineas, ...cambian].join("");
}

function opcionesDescuento(lista) {
  const opciones = lista.map((d) => `<option value="${d.id}">${esc(d.nombre)} (${esc(porcentaje(d.porcentaje))})</option>`);
  return `<option value="">Sin descuento</option>${opciones.join("")}`;
}

/* ---------- Búsqueda (lista e ingreso) ---------- */

// Con números: el número de socio exacto o el DNI. Con letras: cada palabra
// tiene que estar en el nombre, sin importar acentos ni mayúsculas.
function coincide(socio, consulta) {
  const q = normalizar(consulta).trim();
  if (!q) return true;
  if (/^[\d\s.-]+$/.test(q)) {
    const digitos = soloDigitos(q);
    return String(socio.numero) === digitos || soloDigitos(socio.documento).includes(digitos);
  }
  const nombre = normalizar(socio.nombre);
  return q.split(/\s+/).every((palabra) => nombre.includes(palabra));
}

// Primero el número exacto y los nombres que empiezan con lo escrito.
function ordenarCoincidencias(lista, consulta) {
  const q = normalizar(consulta).trim();
  const peso = (s) => {
    if (String(s.numero) === soloDigitos(q)) return 0;
    if (normalizar(s.nombre).startsWith(q)) return 1;
    return s.situacion === "baja" ? 3 : 2;
  };
  return [...lista].sort((a, b) => peso(a) - peso(b) || a.nombre.localeCompare(b.nombre, "es"));
}

/* ---------- Lista de socios ---------- */

const sociosBuscar = document.getElementById("sociosBuscar");
const sociosFiltro = document.getElementById("sociosFiltro");

// "Deben" es todo el que tiene deuda, también si está de baja: lo que debe
// sigue en su cuenta, y si no la cifra de arriba no cerraría con la lista.
const FILTROS = {
  activos: (s) => s.situacion !== "baja",
  debe: (s) => s.deuda > 0,
  al_dia: (s) => s.situacion === "al_dia",
  baja: (s) => s.situacion === "baja"
};

function renderLista() {
  const activos = socios.filter((s) => s.situacion !== "baja");
  document.getElementById("sociosActivos").textContent = activos.length;
  document.getElementById("sociosAlDia").textContent = activos.filter((s) => s.situacion === "al_dia").length;
  document.getElementById("sociosDeben").textContent = socios.filter((s) => s.deuda > 0).length;
  document.getElementById("sociosDeuda").textContent = money(socios.reduce((acc, s) => acc + s.deuda, 0));

  const body = document.getElementById("sociosBody");
  if (socios.length === 0) {
    const texto =
      planes.length > 0 || !esAdmin()
        ? "Todavía no hay socios."
        : "Todavía no hay socios. Primero creá un plan en Socios → Planes y después dalos de alta acá.";
    body.innerHTML = filaVacia(6, texto, { accionTexto: "+ Nuevo socio", accionId: "btnNuevoSocio" });
    return;
  }
  const consulta = sociosBuscar.value.trim();
  const filtrados = socios.filter((s) => FILTROS[filtro](s) && coincide(s, consulta));
  const visibles = consulta ? ordenarCoincidencias(filtrados, consulta) : filtrados;
  if (visibles.length === 0) {
    body.innerHTML = filaVacia(6, "Ningún socio con esa búsqueda.");
    return;
  }
  body.innerHTML = visibles
    .map(
      (s) => `
    <tr class="fila-clickeable" data-id="${s.id}">
      <td data-label="N°" class="mono">${esc(s.numero)}</td>
      <td data-label="Socio">
        <span class="celda-principal">${esc(s.nombre)}</span>
        ${s.documento ? `<span class="celda-meta">DNI ${esc(s.documento)}</span>` : ""}
      </td>
      <td data-label="Planes">${esc(nombresDePlanes(s) || "—")}<span class="celda-meta">${esc(duracionesDePlanes(s))}</span></td>
      <td data-label="Estado">${badgeSituacion(s)}</td>
      <td data-label="Cuota">${esc(textoCuota(s))}</td>
      <td data-label="Debe" class="align-right mono">${s.deuda > 0 ? money(s.deuda) : "—"}</td>
    </tr>`
    )
    .join("");
}

document.getElementById("sociosBody").addEventListener("click", (e) => {
  const fila = e.target.closest("tr[data-id]");
  if (fila) abrirFicha(Number(fila.dataset.id));
});
sociosBuscar.addEventListener("input", renderLista);
sociosFiltro.addEventListener("click", (e) => {
  const boton = e.target.closest(".segmento");
  if (!boton) return;
  filtro = boton.dataset.filtro;
  for (const b of sociosFiltro.querySelectorAll(".segmento")) b.setAttribute("aria-pressed", String(b === boton));
  renderLista();
});

/* ---------- Alta (#/socios/nuevo) ---------- */

const formAlta = document.getElementById("formSocioAlta");
const altaQuien = document.getElementById("socioAltaQuien");
const altaPlanes = document.getElementById("socioAltaPlanes");
const altaCotizacion = document.getElementById("socioAltaCotizacion");
const altaDescuento = document.getElementById("socioAltaDescuento");
let quien = "nuevo";
let cotizacionAlta = 0;

const etiquetaCliente = (c) => (c.documento ? `${c.nombre} — DNI ${c.documento}` : c.nombre);

function pintarQuien() {
  for (const b of altaQuien.querySelectorAll(".segmento")) b.setAttribute("aria-pressed", String(b.dataset.quien === quien));
  document.getElementById("socioAltaNuevo").hidden = quien !== "nuevo";
  document.getElementById("socioAltaCliente").hidden = quien !== "cliente";
}

altaQuien.addEventListener("click", (e) => {
  const boton = e.target.closest(".segmento");
  if (!boton) return;
  quien = boton.dataset.quien;
  limpiarErrores(formAlta);
  pintarQuien();
  (quien === "nuevo" ? formAlta.nombre : formAlta.cliente).focus();
});

function textoDesde(plan) {
  const opciones = opcionesActivas(plan);
  if (opciones.length === 1) return `${opciones[0].duracion}, ${money(opciones[0].precio)}`;
  return `${opciones.length} duraciones, desde ${money(Math.min(...opciones.map((o) => o.precio)))}`;
}

// Cada plan es una tarjeta con su casilla; al marcarla aparecen sus duraciones
// para elegir una (la más corta, de entrada).
function pintarPlanesAlta() {
  const ofrecidos = planesOfrecidos();
  if (ofrecidos.length === 0) {
    altaPlanes.innerHTML = esAdmin()
      ? `<p class="opciones-cargando">Todavía no hay planes. <a class="btn-link" href="#/planes-socio">Creá el primero</a> y volvé.</p>`
      : `<p class="opciones-cargando">Todavía no hay planes: pedile a un administrador que los cargue en Socios → Planes.</p>`;
    return;
  }
  altaPlanes.innerHTML = ofrecidos
    .map((p) => {
      const chips = opcionesActivas(p)
        .map(
          (o, i) => `
        <label class="duracion-chip">
          <input type="radio" name="opcion-${p.id}" value="${o.id}"${i === 0 ? " checked" : ""} />
          <span class="duracion-chip-nombre">${esc(o.duracion)}</span>
          <span class="duracion-chip-precio mono">${money(o.precio)}</span>
        </label>`
        )
        .join("");
      return `
      <div class="plan-elegir">
        <label class="plan-elegir-cabeza">
          <input type="checkbox" name="plan" value="${p.id}"${ofrecidos.length === 1 ? " checked" : ""} />
          <span class="plan-elegir-icono">${icono("calendar-clock")}</span>
          <span class="plan-elegir-texto">
            <span class="plan-elegir-nombre">${esc(p.nombre)}</span>
            <span class="plan-elegir-desde">${esc(textoDesde(p))}</span>
          </span>
          <span class="opcion-tarjeta-check">${icono("check")}</span>
        </label>
        <div class="plan-elegir-duraciones" role="radiogroup" aria-label="Duración de ${esc(p.nombre)}">${chips}</div>
      </div>`;
    })
    .join("");
}

function planesElegidos() {
  return [...altaPlanes.querySelectorAll('input[name="plan"]:checked')]
    .map((casilla) => {
      const plan = planes.find((p) => p.id === Number(casilla.value));
      const opcionId = Number(altaPlanes.querySelector(`input[name="opcion-${plan.id}"]:checked`)?.value);
      return { plan, opcion: plan.opciones.find((o) => o.id === opcionId) };
    })
    .filter((elegido) => elegido.opcion);
}

// Lo que va a pasar, dicho antes de apretar: qué día vence cada cuota, qué
// período se cobra primero y cuánto, con los descuentos que le tocan.
async function pintarResumenAlta() {
  const elegidos = planesElegidos();
  const alta = formAlta.fecha_alta.value;
  const nota = document.getElementById("socioAltaVencimiento");
  const resumen = document.getElementById("socioAltaResumen");
  const pedido = ++cotizacionAlta;
  if (elegidos.length === 0 || !alta) {
    nota.textContent = "";
    altaCotizacion.hidden = true;
    resumen.textContent = elegidos.length ? "Elegí desde cuándo es socio." : "Elegí al menos un plan para ver la primera cuota.";
    return;
  }
  const dia = Number(alta.slice(8));
  const finDeMes = dia > 28 ? " (o el último día del mes, si no lo tiene)" : "";
  const cada = elegidos.every((e) => e.opcion.meses === 1) ? "mes" : "período";
  nota.textContent = `${elegidos.length > 1 ? "Las cuotas vencen" : "La cuota vence"} el día ${dia}${finDeMes} de cada ${cada}.`;
  let cotizacion;
  try {
    cotizacion = await api("/api/socios/cotizacion", {
      method: "POST",
      body: { planes: elegidos.map((e) => ({ opcion_id: e.opcion.id })), descuento_id: valorDescuento(altaDescuento) },
      error: "No se pudo calcular la primera cuota."
    });
  } catch {
    return;
  }
  if (pedido !== cotizacionAlta) return;
  altaCotizacion.innerHTML = lineasCotizacion(cotizacion, alta);
  altaCotizacion.hidden = false;
  const hoy = hoyISO();
  const yaVenia = alta < hoy && elegidos.some((e) => primerPeriodo(alta, e.opcion.meses, hoy)?.desde !== alta);
  resumen.textContent =
    `${elegidos.length > 1 ? "Primer pago" : "Primera cuota"}: ${money(cotizacion.total)}.` +
    (yaVenia ? " Ya venía: se cobra el período que corre, no los anteriores." : "");
}

altaPlanes.addEventListener("change", () => {
  limpiarError(altaPlanes);
  pintarResumenAlta();
});
formAlta.fecha_alta.addEventListener("change", pintarResumenAlta);
altaDescuento.addEventListener("change", pintarResumenAlta);

async function abrirAlta() {
  document.getElementById("sociosLista").hidden = true;
  document.getElementById("socioAlta").hidden = false;
  formAlta.reset();
  limpiarErrores(formAlta);
  quien = "nuevo";
  pintarQuien();
  formAlta.fecha_alta.value = hoyISO();
  altaPlanes.innerHTML = `<p class="opciones-cargando">Cargando planes…</p>`;
  altaCotizacion.hidden = true;
  const [, , , clientes] = await Promise.all([
    cargarPlanes(),
    cargarDescuentos(),
    cargarSocios(),
    api("/api/clientes", { error: "No se pudieron cargar los clientes." })
  ]);
  // Después del primer await: el router pone el título de la vista ("Socios")
  // recién después de llamar a este handler.
  document.getElementById("vistaTitulo").textContent = "Nuevo socio";
  document.title = "Nuevo socio · Nexo";
  // Los que ya son socios no se ofrecen, ni el cliente genérico del mostrador.
  const yaSocios = new Set(socios.map((s) => s.cliente_id));
  clientesLibres = clientes.filter((c) => !yaSocios.has(c.id) && c.nombre !== "Consumidor final");
  document.getElementById("socioAltaClientes").innerHTML = clientesLibres
    .map((c) => `<option value="${esc(etiquetaCliente(c))}"></option>`)
    .join("");
  const manuales = descuentos.filter((d) => d.activo && d.aplica === "manual");
  document.getElementById("socioAltaDescuentoCampo").hidden = manuales.length === 0;
  altaDescuento.innerHTML = opcionesDescuento(manuales);
  pintarPlanesAlta();
  pintarResumenAlta();
  if (conMouse()) formAlta.nombre.focus();
}

formAlta.addEventListener("submit", async (e) => {
  e.preventDefault();
  limpiarErrores(formAlta);
  const elegidos = planesElegidos();
  const cuerpo = {
    planes: elegidos.map((elegido) => ({ opcion_id: elegido.opcion.id })),
    fecha_alta: formAlta.fecha_alta.value,
    descuento_id: valorDescuento(altaDescuento)
  };
  if (quien === "nuevo") {
    const nombre = formAlta.nombre.value.trim();
    if (!nombre) {
      marcarError(formAlta.nombre, "Escribí el nombre y apellido del socio.");
      formAlta.nombre.focus();
      return;
    }
    cuerpo.cliente = {
      nombre,
      documento: formAlta.documento.value.trim(),
      telefono: formAlta.telefono.value.trim(),
      email: formAlta.email.value.trim()
    };
  } else {
    const cliente = clientesLibres.find((c) => etiquetaCliente(c) === formAlta.cliente.value.trim());
    if (!cliente) {
      marcarError(formAlta.cliente, "Elegí el cliente de la lista que aparece al escribir.");
      formAlta.cliente.focus();
      return;
    }
    cuerpo.cliente_id = cliente.id;
  }
  if (elegidos.length === 0) {
    marcarError(altaPlanes, "Elegí al menos un plan.");
    altaPlanes.querySelector("input")?.focus();
    return;
  }
  if (!cuerpo.fecha_alta) {
    marcarError(formAlta.fecha_alta, "Elegí desde cuándo es socio.");
    formAlta.fecha_alta.focus();
    return;
  }

  const boton = formAlta.querySelector('button[type="submit"]');
  const socio = await enviando(boton, () =>
    api("/api/socios", { method: "POST", body: cuerpo, error: "No se pudo dar de alta al socio." })
  );
  await refrescar([cargarSocios(), recargarOtrasVistas()]);
  avisar(`Alta lista: N° ${socio.numero}, ${socio.nombre}.`, "ok");
  // La ficha no cambia el hash: sin esto, un F5 volvería a abrir el alta.
  history.replaceState(null, "", "#/socios");
  await mostrarFicha(socio);
});

/* ---------- Ficha del socio ---------- */

function badgeCuota(c) {
  if (c.estado === "pagada") return badge("status-cobrado", "Pagada").html;
  if (c.estado === "bonificada") return badge("", "Bonificada").html;
  if (c.estado === "sin_cargo") return badge("", "Sin cargo").html;
  if (c.estado === "parcial") return badge("status-pendiente", `Falta ${money(c.saldo)}`).html;
  return c.desde === hoyISO() ? badge("status-pendiente", "Vence hoy").html : badge("status-vencido", "Vencida").html;
}

// Un botón por cuenta: cobrar es un toque, sin modal. La de efectivo va
// primero y resaltada, que es lo más común en una recepción. El monto ya está
// en el título de al lado y en la confirmación.
function botonesCobro() {
  const orden = [...cuentas].sort((a, b) => Number(b.tipo === "efectivo") - Number(a.tipo === "efectivo"));
  return orden
    .map(
      (c, i) => `
    <button type="button" class="btn ${i === 0 ? "btn-primary" : "btn-secundario"}" data-cobrar="${c.id}">
      ${icono(ICONO_TIPO_CUENTA[c.tipo] ?? "wallet")} Cobrar en ${esc(c.nombre)}
    </button>`
    )
    .join("");
}

function pintarCobroFicha(s) {
  const panel = document.getElementById("fichaSocioCobro");
  panel.hidden = s.deuda <= 0;
  if (s.deuda <= 0) return;
  document.getElementById("fichaSocioCobroTitulo").textContent = `Debe ${money(s.deuda)}`;
  const otras = s.saldo_cuenta - s.deuda;
  document.getElementById("fichaSocioCobroNota").textContent =
    `${plural(s.cuotas_impagas, "cuota sin pagar", "cuotas sin pagar")}, desde el ${fechaAR(s.debe_desde)}.` +
    (otras > 0.005 ? ` Además debe ${money(otras)} de otras compras, que se cobran desde Cuentas corrientes.` : "");
  document.getElementById("fichaSocioCobroCuentas").innerHTML = botonesCobro();
}

// Qué pasa con un plan: cuándo es su próxima cuota, cuándo empieza o desde
// cuándo lo dejó.
function estadoDelPlan(p) {
  const hoy = hoyISO();
  if (p.estado === "baja") return `${p.duracion} · lo dejó el ${fechaAR(p.fecha_baja)}`;
  if (!(p.cubierto_hasta >= hoy) && p.ciclo_desde > hoy) return `${p.duracion} · empieza el ${fechaAR(p.ciclo_desde)}`;
  if (p.cubierto_hasta) return `${p.duracion} · próxima cuota el ${fechaAR(sumarDias(p.cubierto_hasta, 1))}`;
  return p.duracion;
}

// Las duraciones a las que puede pasar: las que se ofrecen, y la suya aunque
// ya no se ofrezca.
function selectDuracion(p) {
  const plan = planes.find((x) => x.id === p.plan_id);
  const opciones = (plan?.opciones ?? []).filter((o) => o.activo || o.id === p.opcion_id);
  const lista = opciones.length ? opciones : [{ id: p.opcion_id, duracion: p.duracion, precio: p.precio_lista, activo: false }];
  const items = lista.map(
    (o) => `<option value="${o.id}"${o.id === p.opcion_id ? " selected" : ""}>${esc(o.duracion)}, ${money(o.precio)}${o.activo ? "" : " (ya no se ofrece)"}</option>`
  );
  return `
    <label class="visualmente-oculto" for="socioDuracion${p.id}">Duración de ${esc(p.plan)}</label>
    <select class="select-inline" id="socioDuracion${p.id}" data-duracion="${p.id}">${items.join("")}</select>`;
}

function pintarPlanesFicha(s) {
  const lista = document.getElementById("fichaSocioPlanes");
  if (s.planes.length === 0) {
    lista.innerHTML = `<li class="socio-planes-vacio">Todavía no tiene planes.</li>`;
    return;
  }
  lista.innerHTML = s.planes
    .map((p) => {
      const activo = p.estado === "activa";
      const precio = activo
        ? precioConDescuento(p.precio_lista, p.precio, p.descuento)
        : `<span class="cotizacion-precio"><span class="mono">${money(p.precio_lista)}</span></span>`;
      const acciones = activo
        ? `${selectDuracion(p)}<button type="button" class="btn-link" data-dejar="${p.id}">Dejar</button>`
        : `<button type="button" class="btn-link" data-reactivar="${p.id}">Reactivar</button>`;
      return `
    <li class="socio-plan${activo ? "" : " is-baja"}">
      <div class="socio-plan-texto">
        <p class="socio-plan-nombre">${esc(p.plan)}</p>
        <p class="socio-plan-meta">${esc(estadoDelPlan(p))}</p>
      </div>
      ${precio}
      <div class="socio-plan-acciones">${acciones}</div>
    </li>`;
    })
    .join("");
}

const formDescuentoSocio = document.getElementById("formSocioDescuento");
const fichaDescuento = document.getElementById("fichaSocioDescuento");

// Se ve si hay descuentos a mano para elegir, o si ya tiene uno.
function pintarDescuentoFicha(s) {
  const lista = descuentos.filter((d) => d.aplica === "manual" && (d.activo || d.id === s.descuento_id));
  formDescuentoSocio.hidden = lista.length === 0;
  fichaDescuento.innerHTML = opcionesDescuento(lista);
  fichaDescuento.value = s.descuento_id ? String(s.descuento_id) : "";
  formDescuentoSocio.querySelector('button[type="submit"]').disabled = true;
}

function pintarFicha(s) {
  fichaSocio = s;
  document.getElementById("fichaSocioNombre").textContent = s.nombre;
  const datos = [
    ["N° de socio", String(s.numero)],
    ["Estado", badge(SITUACION[s.situacion].clase, SITUACION[s.situacion].texto)],
    ["Socio desde", fechaAR(s.fecha_alta)],
    ["DNI", s.documento],
    ["Teléfono", s.telefono],
    ["Descuento a mano", s.descuento ? `${s.descuento} (${porcentaje(s.descuento_porcentaje)})` : "Ninguno"],
    ["Último ingreso", s.ultimo_ingreso ? fechaHoraAR(s.ultimo_ingreso) : "Todavía no vino"]
  ];
  if (s.situacion === "baja" && s.fecha_baja) datos.push(["De baja desde", fechaAR(s.fecha_baja)]);
  document.getElementById("fichaSocioDatos").innerHTML = camposFicha(datos);

  document.getElementById("btnSocioEstado").innerHTML =
    s.situacion === "baja" ? `${icono("undo-2")} Reactivar` : `${icono("log-out")} Dar de baja`;

  let alDia = "—";
  if (s.situacion === "por_empezar") alDia = `Empieza el ${fechaAR(s.empieza)}`;
  else if (s.al_dia_hasta) alDia = fechaAR(s.al_dia_hasta);
  document.getElementById("fichaSocioAlDia").textContent = alDia;
  document.getElementById("fichaSocioDeuda").textContent = money(s.deuda);
  const haceUnMes = sumarDias(hoyISO(), -30);
  document.getElementById("fichaSocioIngresos").textContent = s.ingresos.filter((i) => i.fecha.slice(0, 10) >= haceUnMes).length;

  pintarCobroFicha(s);
  pintarPlanesFicha(s);
  pintarDescuentoFicha(s);
  cerrarSumar();

  const sinCuotas = s.situacion === "por_empezar" ? `La primera cuota se genera el ${fechaAR(s.empieza)}.` : "Todavía no tiene cuotas.";
  document.getElementById("fichaSocioCuotas").innerHTML =
    s.cuotas.length === 0
      ? filaVacia(5, sinCuotas)
      : s.cuotas
          .map((c) => {
            const detalle = c.descuento_pct ? `${c.duracion} · −${porcentaje(c.descuento_pct)} ${c.descuento ?? ""}` : c.duracion;
            return `
    <tr>
      <td data-label="Período">${esc(fechaAR(c.desde))} al ${esc(fechaAR(c.hasta))}</td>
      <td data-label="Plan">${esc(c.plan)}<span class="celda-meta">${esc(detalle)}</span></td>
      <td data-label="Importe" class="align-right mono">${money(c.importe)}</td>
      <td data-label="Estado">${badgeCuota(c)}</td>
      <td data-label="Venta"><button type="button" class="btn-link" data-venta="${c.venta_id}">#${c.venta_id}</button></td>
    </tr>`;
          })
          .join("");

  document.getElementById("fichaSocioIngresosBody").innerHTML =
    s.ingresos.length === 0
      ? filaVacia(3, "Todavía no registró ningún ingreso.")
      : s.ingresos
          .map(
            (i) => `
    <tr>
      <td data-label="Cuándo">${esc(fechaHoraAR(i.fecha))}</td>
      <td data-label="Cómo estaba">${i.al_dia ? badge("status-cobrado", "Al día").html : badge("status-vencido", `Debía ${money(i.deuda)}`).html}</td>
      <td data-label="Lo atendió">${esc(i.usuario)}</td>
    </tr>`
          )
          .join("");
}

async function cobrar(socio, cuentaId, boton) {
  const cuenta = cuentas.find((c) => c.id === cuentaId);
  const ok = await confirmar({
    titulo: "Cobrar cuotas",
    cuerpo: `¿Cobrarle ${money(socio.deuda)} a ${socio.nombre} en ${cuenta.nombre}? Salda ${plural(socio.cuotas_impagas, "cuota", "cuotas")}.`,
    aceptar: `Cobrar ${money(socio.deuda)}`
  });
  if (!ok) return null;
  const resultado = await enviando(boton, () =>
    api(`/api/socios/${socio.id}/cobros`, {
      method: "POST",
      body: { cuenta_tesoreria_id: cuentaId },
      error: "No se pudo registrar el cobro."
    })
  );
  avisar(`Cobrado ${money(resultado.cobrado)} en ${cuenta.nombre}.`, "ok");
  await refrescar([cargarSocios(), recargarOtrasVistas()]);
  return { ...resultado, cuenta };
}

document.getElementById("fichaSocioCobroCuentas").addEventListener("click", async (e) => {
  const boton = e.target.closest("[data-cobrar]");
  if (!boton || !fichaSocio) return;
  const resultado = await cobrar(fichaSocio, Number(boton.dataset.cobrar), boton);
  if (resultado) pintarFicha(resultado.socio);
});

// Un cambio en un plan del socio (duración, dejar, reactivar).
async function cambiarPlanDelSocio(inscripcionId, cuerpo, aviso, control) {
  const socio = await enviando(control, () =>
    api(`/api/socios/${fichaSocio.id}/planes/${inscripcionId}`, { method: "PATCH", body: cuerpo, error: "No se pudo cambiar el plan." })
  );
  await refrescar([cargarSocios(), recargarOtrasVistas()]);
  pintarFicha(socio);
  avisar(aviso, "ok");
}

const fichaPlanes = document.getElementById("fichaSocioPlanes");

fichaPlanes.addEventListener("change", async (e) => {
  const select = e.target.closest("[data-duracion]");
  if (!select || !fichaSocio) return;
  const plan = fichaSocio.planes.find((p) => p.id === Number(select.dataset.duracion));
  if (Number(select.value) === plan.opcion_id) return;
  const opcion = planes.find((x) => x.id === plan.plan_id)?.opciones.find((o) => o.id === Number(select.value));
  const ok = await confirmar({
    titulo: "Cambiar duración",
    cuerpo: `¿Pasar ${plan.plan} a ${opcion.duracion.toLowerCase()} (${money(opcion.precio)}, antes de descuentos) desde la próxima cuota? La de ahora no cambia.`,
    aceptar: "Cambiar"
  });
  if (!ok) {
    select.value = String(plan.opcion_id);
    return;
  }
  await cambiarPlanDelSocio(plan.id, { opcion_id: opcion.id }, `${plan.plan} pasa a ${opcion.duracion.toLowerCase()} desde la próxima cuota.`, select);
});

fichaPlanes.addEventListener("click", async (e) => {
  const boton = e.target.closest("[data-dejar], [data-reactivar]");
  if (!boton || !fichaSocio) return;
  const id = Number(boton.dataset.dejar ?? boton.dataset.reactivar);
  const plan = fichaSocio.planes.find((p) => p.id === id);
  const deja = boton.dataset.dejar !== undefined;
  const ultimo = deja && planesActivos(fichaSocio).length === 1;
  const ok = await confirmar(
    deja
      ? {
          titulo: `Dejar ${plan.plan}`,
          cuerpo:
            `${plan.plan} deja de generar cuotas. Lo que ya debe sigue en su cuenta corriente.` +
            (ultimo ? ` Es su único plan: ${fichaSocio.nombre} queda de baja.` : ""),
          aceptar: "Dejar",
          destructivo: true
        }
      : {
          titulo: `Reactivar ${plan.plan}`,
          cuerpo: "Vuelve a generar cuotas desde hoy, o desde que termine el período que ya tenía pagado. Los meses de baja no se cobran.",
          aceptar: "Reactivar"
        }
  );
  if (!ok) return;
  await cambiarPlanDelSocio(id, { estado: deja ? "baja" : "activa" }, deja ? `Dejó ${plan.plan}.` : `Volvió a ${plan.plan}.`, boton);
});

/* Sumar un plan desde la ficha */

const formSumar = document.getElementById("formSocioSumarPlan");
const botonSumar = document.getElementById("btnSocioSumarPlan");
const sumarPlan = document.getElementById("socioSumarPlan");
const sumarDuracion = document.getElementById("socioSumarDuracion");
const sumarCotizacion = document.getElementById("socioSumarCotizacion");
let cotizacionSumar = 0;

function cerrarSumar() {
  formSumar.hidden = true;
  botonSumar.hidden = false;
  sumarCotizacion.hidden = true;
}

function pintarDuracionesSumar() {
  const plan = planes.find((p) => p.id === Number(sumarPlan.value));
  sumarDuracion.innerHTML = opcionesActivas(plan)
    .map((o) => `<option value="${o.id}">${esc(o.duracion)}, ${money(o.precio)}</option>`)
    .join("");
}

async function cotizarSumar() {
  const pedido = ++cotizacionSumar;
  let cotizacion;
  try {
    cotizacion = await api("/api/socios/cotizacion", {
      method: "POST",
      body: { planes: [{ opcion_id: Number(sumarDuracion.value) }], socio_id: fichaSocio.id },
      error: "No se pudo calcular la primera cuota."
    });
  } catch {
    return;
  }
  if (pedido !== cotizacionSumar) return;
  sumarCotizacion.innerHTML = lineasCotizacion(cotizacion, formSumar.fecha_alta.value || hoyISO());
  sumarCotizacion.hidden = false;
}

botonSumar.addEventListener("click", () => {
  if (!fichaSocio) return;
  const ya = new Set(planesActivos(fichaSocio).map((p) => p.plan_id));
  const disponibles = planesOfrecidos().filter((p) => !ya.has(p.id));
  if (disponibles.length === 0) {
    avisar(
      planesOfrecidos().length ? "Ya tiene todos los planes que se ofrecen." : "Todavía no hay planes: crealos en Socios → Planes.",
      "atencion"
    );
    return;
  }
  sumarPlan.innerHTML = disponibles.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join("");
  pintarDuracionesSumar();
  formSumar.fecha_alta.value = hoyISO();
  formSumar.hidden = false;
  botonSumar.hidden = true;
  sumarPlan.focus();
  cotizarSumar();
});

sumarPlan.addEventListener("change", () => {
  pintarDuracionesSumar();
  cotizarSumar();
});
sumarDuracion.addEventListener("change", cotizarSumar);
formSumar.fecha_alta.addEventListener("change", cotizarSumar);
document.getElementById("btnSocioSumarCancelar").addEventListener("click", () => {
  cerrarSumar();
  botonSumar.focus();
});

formSumar.addEventListener("submit", async (e) => {
  e.preventDefault();
  const plan = planes.find((p) => p.id === Number(sumarPlan.value));
  const socio = await enviando(formSumar.querySelector('button[type="submit"]'), () =>
    api(`/api/socios/${fichaSocio.id}/planes`, {
      method: "POST",
      body: { opcion_id: Number(sumarDuracion.value), fecha_alta: formSumar.fecha_alta.value },
      error: "No se pudo sumar el plan."
    })
  );
  await refrescar([cargarSocios(), recargarOtrasVistas()]);
  pintarFicha(socio);
  avisar(`Sumó ${plan.nombre}.`, "ok");
});

/* Descuento a mano y baja del socio entero */

fichaDescuento.addEventListener("change", () => {
  formDescuentoSocio.querySelector('button[type="submit"]').disabled = valorDescuento(fichaDescuento) === (fichaSocio?.descuento_id ?? null);
});

formDescuentoSocio.addEventListener("submit", async (e) => {
  e.preventDefault();
  const socio = await enviando(formDescuentoSocio.querySelector('button[type="submit"]'), () =>
    api(`/api/socios/${fichaSocio.id}`, {
      method: "PATCH",
      body: { descuento_id: valorDescuento(fichaDescuento) },
      error: "No se pudo cambiar el descuento."
    })
  );
  await refrescar([cargarSocios()]);
  pintarFicha(socio);
  avisar(socio.descuento ? `Desde la próxima cuota tiene "${socio.descuento}".` : "Ya no tiene descuento a mano.", "ok");
});

document.getElementById("btnSocioEstado").addEventListener("click", async (e) => {
  const s = fichaSocio;
  if (!s) return;
  const boton = e.currentTarget;
  const darDeBaja = s.situacion !== "baja";
  const ok = await confirmar(
    darDeBaja
      ? {
          titulo: "Dar de baja",
          cuerpo:
            `${s.nombre} deja todos sus planes: no genera más cuotas y no va a poder entrar.` +
            (s.deuda > 0 ? ` Lo que debe (${money(s.deuda)}) sigue en su cuenta corriente.` : ""),
          aceptar: "Dar de baja",
          destructivo: true
        }
      : {
          titulo: "Reactivar",
          cuerpo: `${s.nombre} vuelve con los planes que tenía, desde hoy o desde que termine lo que ya tenía pagado. Los meses de baja no se cobran.`,
          aceptar: "Reactivar"
        }
  );
  if (!ok) return;
  const socio = await enviando(boton, () =>
    api(`/api/socios/${s.id}`, {
      method: "PATCH",
      body: { estado: darDeBaja ? "baja" : "activo" },
      error: darDeBaja ? "No se pudo dar de baja." : "No se pudo reactivar."
    })
  );
  await refrescar([cargarSocios(), recargarOtrasVistas()]);
  pintarFicha(socio);
  avisar(darDeBaja ? `${socio.nombre} quedó de baja.` : `${socio.nombre} volvió a estar activo.`, "ok");
});

document.getElementById("btnSocioContacto").addEventListener("click", () => {
  if (fichaSocio) invocar("abrirFicha:cliente", fichaSocio.cliente_id);
});
document.getElementById("fichaSocioCuotas").addEventListener("click", (e) => {
  const boton = e.target.closest("[data-venta]");
  if (boton) invocar("abrirFicha:venta", Number(boton.dataset.venta));
});
document.getElementById("btnVolverSocios").addEventListener("click", () => mostrarVista("socios"));

// Planes y descuentos se traen cada vez: pudieron cambiar en su pantalla.
async function mostrarFicha(socio) {
  await Promise.all([cargarPlanes(), cargarDescuentos(), cuentas.length ? null : cargarCuentas()]);
  pintarFicha(socio);
  mostrarVista("socio-detalle", { titulo: socio.nombre });
  window.scrollTo(0, 0);
}

async function abrirFicha(id) {
  await mostrarFicha(await api(`/api/socios/${id}`, { error: "No se pudo cargar el socio." }));
}

/* ---------- Ingreso (#/ingreso) ---------- */

const ingresoBuscar = document.getElementById("ingresoBuscar");
const ingresoResultados = document.getElementById("ingresoResultados");
const ingresoTarjeta = document.getElementById("ingresoTarjeta");
const ingresoInicio = document.getElementById("ingresoInicio");
const ICONO_TONO = { ok: "circle-check", debe: "circle-alert", aviso: "info", baja: "lock" };
let resultados = [];
let marcado = -1;
let tarjetaSocio = null;

function enfocarBusqueda() {
  if (conMouse()) requestAnimationFrame(() => ingresoBuscar.focus());
}

function cerrarResultados() {
  ingresoResultados.hidden = true;
  ingresoBuscar.setAttribute("aria-expanded", "false");
  ingresoBuscar.removeAttribute("aria-activedescendant");
  resultados = [];
  marcado = -1;
}

function marcar(indice) {
  marcado = indice;
  ingresoResultados.querySelectorAll(".ingreso-opcion").forEach((li, i) => li.setAttribute("aria-selected", String(i === indice)));
  if (indice >= 0) {
    ingresoBuscar.setAttribute("aria-activedescendant", `ingresoOpcion${indice}`);
    document.getElementById(`ingresoOpcion${indice}`)?.scrollIntoView({ block: "nearest" });
  }
}

function pintarResultados() {
  const consulta = ingresoBuscar.value;
  if (!consulta.trim()) {
    cerrarResultados();
    return;
  }
  resultados = ordenarCoincidencias(socios.filter((s) => coincide(s, consulta)), consulta).slice(0, MAX_RESULTADOS);
  ingresoResultados.hidden = false;
  ingresoBuscar.setAttribute("aria-expanded", "true");
  ingresoResultados.innerHTML =
    resultados.length === 0
      ? `<li class="ingreso-sin-resultados">Nadie con ese nombre, DNI o número. ¿Es nuevo? <a class="btn-link" href="#/socios/nuevo">Darlo de alta</a></li>`
      : resultados
          .map(
            (s, i) => `
    <li class="ingreso-opcion" role="option" id="ingresoOpcion${i}" data-indice="${i}" aria-selected="false">
      <span class="ingreso-opcion-texto">
        <span class="ingreso-opcion-nombre">${esc(s.nombre)}</span>
        <span class="ingreso-opcion-meta">N° ${esc(s.numero)}${s.documento ? ` · DNI ${esc(s.documento)}` : ""} · ${esc(nombresDePlanes(s))}</span>
      </span>
      ${badgeSituacion(s)}
    </li>`
          )
          .join("");
  marcar(resultados.length ? 0 : -1);
}

ingresoBuscar.addEventListener("input", pintarResultados);
ingresoBuscar.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" && resultados.length) {
    e.preventDefault();
    marcar((marcado + 1) % resultados.length);
  } else if (e.key === "ArrowUp" && resultados.length) {
    e.preventDefault();
    marcar((marcado - 1 + resultados.length) % resultados.length);
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (resultados[marcado]) elegir(resultados[marcado]);
  } else if (e.key === "Escape") {
    ingresoBuscar.value = "";
    cerrarResultados();
  }
});
// Que el click en un resultado no le saque el foco a la búsqueda antes de elegir.
ingresoResultados.addEventListener("mousedown", (e) => e.preventDefault());
ingresoResultados.addEventListener("click", (e) => {
  const opcion = e.target.closest(".ingreso-opcion");
  if (opcion) elegir(resultados[Number(opcion.dataset.indice)]);
});

// La tarjeta grande de la recepción. Sin `registrado` es la pregunta (debe,
// todavía no empezó o está de baja); con él, el ingreso ya quedó anotado.
function pintarTarjeta(s, registrado = null) {
  tarjetaSocio = s;
  ingresoInicio.hidden = true;
  ingresoTarjeta.hidden = false;
  let tono;
  let estado;
  let meta;
  let acciones = "";
  if (registrado) {
    ({ tono, estado, meta } = registrado);
    meta += ` Ingreso anotado a las ${registrado.hora}.`;
  } else if (s.situacion === "debe") {
    tono = "debe";
    estado = `Debe ${money(s.deuda)}`;
    meta = `${plural(s.cuotas_impagas, "cuota sin pagar", "cuotas sin pagar")}, desde el ${fechaAR(s.debe_desde)}.`;
    const cobros = botonesCobro();
    acciones = `${cobros}<button type="button" class="btn btn-secundario" data-accion="pasar">Dejar pasar igual</button>`;
  } else if (s.situacion === "por_empezar") {
    tono = "aviso";
    estado = "Todavía no empezó";
    meta = `Su plan empieza el ${fechaAR(s.empieza)}.`;
    acciones = `<button type="button" class="btn btn-secundario" data-accion="pasar">Dejar pasar igual</button>`;
  } else {
    tono = "baja";
    estado = "Está de baja";
    meta = `${s.fecha_baja ? `Desde el ${fechaAR(s.fecha_baja)}. ` : ""}Para que vuelva, reactivalo desde su ficha.`;
  }
  ingresoTarjeta.className = `ingreso-tarjeta ingreso-tarjeta-${tono}`;
  ingresoTarjeta.innerHTML = `
    <div class="ingreso-tarjeta-cuerpo">
      <span class="ingreso-tarjeta-icono">${icono(ICONO_TONO[tono])}</span>
      <div class="ingreso-tarjeta-texto">
        <p class="ingreso-tarjeta-estado">${esc(estado)}</p>
        <p class="ingreso-tarjeta-nombre">${esc(s.nombre)}</p>
        <p class="ingreso-tarjeta-meta">N° ${esc(s.numero)} · ${esc(nombresDePlanes(s))}. ${esc(meta)}</p>
      </div>
    </div>
    <div class="ingreso-tarjeta-acciones">
      ${acciones}
      <button type="button" class="btn-link" data-accion="ficha">Ver ficha</button>
    </div>`;
  // Lo que pide una decisión toma el foco; lo que ya pasó lo devuelve a la búsqueda.
  if (acciones) ingresoTarjeta.querySelector(".btn")?.focus();
  else enfocarBusqueda();
}

function pintarIngresosHoy() {
  document.getElementById("ingresosHoyCantidad").textContent = ingresosHoy.length ? plural(ingresosHoy.length, "ingreso", "ingresos") : "";
  document.getElementById("ingresosHoy").innerHTML =
    ingresosHoy.length === 0
      ? `<li class="ingreso-lista-vacia">Todavía no entró nadie hoy.</li>`
      : ingresosHoy
          .map(
            (i) => `
    <li class="ingreso-fila">
      <span class="ingreso-fila-hora mono">${esc(horaDe(i.fecha))}</span>
      <span class="ingreso-fila-texto">
        <button type="button" class="btn-link" data-socio="${i.socio_id}">${esc(i.nombre)}</button>
        <span class="ingreso-fila-meta">N° ${esc(i.numero)} · lo atendió ${esc(i.usuario)}</span>
      </span>
      ${i.al_dia ? badge("status-cobrado", "Al día").html : badge("status-vencido", `Debía ${money(i.deuda)}`).html}
    </li>`
          )
          .join("");
}

async function registrarIngreso(socio, { tono, estado, detalle }) {
  const ingreso = await api(`/api/socios/${socio.id}/ingresos`, {
    method: "POST",
    error: "No se pudo registrar el ingreso."
  });
  const s = ingreso.socio;
  if (ingreso.al_dia) {
    pintarTarjeta(s, { tono, estado, meta: detalle ?? `Al día hasta el ${fechaAR(s.al_dia_hasta)}.`, hora: horaDe(ingreso.fecha) });
  } else {
    pintarTarjeta(s, { tono: "debe", estado: "Entró debiendo", meta: `Debe ${money(s.deuda)}.`, hora: horaDe(ingreso.fecha) });
  }
  await refrescar([cargarIngresosHoy(), cargarSocios()]);
  pintarIngresosHoy();
}

// Elegido el socio, se lo vuelve a pedir: la lista puede tener horas y el
// período pudo haber cambiado. Al día pasa solo; lo demás espera a la
// recepción.
async function elegir(socio) {
  ingresoBuscar.value = "";
  cerrarResultados();
  const actual = await api(`/api/socios/${socio.id}`, { error: "No se pudo consultar al socio." });
  if (actual.situacion === "al_dia") await registrarIngreso(actual, { tono: "ok", estado: "Puede pasar" });
  else pintarTarjeta(actual);
}

ingresoTarjeta.addEventListener("click", async (e) => {
  const boton = e.target.closest("button");
  if (!boton || !tarjetaSocio) return;
  const socio = tarjetaSocio;
  if (boton.dataset.accion === "ficha") {
    abrirFicha(socio.id);
  } else if (boton.dataset.accion === "pasar") {
    const detalle = socio.situacion === "por_empezar" ? `Su plan empieza el ${fechaAR(socio.empieza)}.` : undefined;
    await enviando(boton, () => registrarIngreso(socio, { tono: "aviso", estado: "Puede pasar", detalle }));
  } else if (boton.dataset.cobrar) {
    const resultado = await cobrar(socio, Number(boton.dataset.cobrar), boton);
    if (!resultado) return;
    await registrarIngreso(resultado.socio, {
      tono: "ok",
      estado: "Puede pasar",
      detalle: `Pagó ${money(resultado.cobrado)} en ${resultado.cuenta.nombre}. Al día hasta el ${fechaAR(resultado.socio.al_dia_hasta)}.`
    });
  }
});

document.getElementById("ingresosHoy").addEventListener("click", (e) => {
  const boton = e.target.closest("[data-socio]");
  if (boton) abrirFicha(Number(boton.dataset.socio));
});

async function entrarAIngreso() {
  await refrescar([cargarSocios(), cargarCuentas(), cargarIngresosHoy()]);
  pintarIngresosHoy();
  // Sin socios todavía, la búsqueda no tiene a quién encontrar: se dice.
  document.getElementById("ingresoInicioTexto").innerHTML =
    socios.length === 0
      ? `Todavía no hay socios. <a class="btn-link" href="#/socios/nuevo">Dá de alta al primero</a> y después buscalo acá.`
      : "Escribí su nombre, DNI o número de socio. Si está al día, el ingreso queda anotado solo; si debe, te avisamos antes.";
  if (ingresoTarjeta.hidden) ingresoInicio.hidden = false;
  enfocarBusqueda();
}

/* ---------- Planes (#/planes-socio) ---------- */

const formPlanSocio = document.getElementById("formPlanSocio");
const botonPlan = document.getElementById("formPlanSocioSubmit");
const cancelarPlan = document.getElementById("formPlanSocioCancelar");
const duracionesPlan = document.getElementById("planDuraciones");
const CABEZA_DURACIONES = `<div class="plan-duraciones-cabeza" aria-hidden="true"><span>Meses</span><span>Precio</span></div>`;

function filaDuracion(meses = "", precio = "") {
  return `
  <div class="plan-duracion">
    <input type="number" class="plan-duracion-meses" min="1" max="${MAX_MESES}" step="1" inputmode="numeric" value="${esc(meses)}" aria-label="Cuántos meses dura" />
    <input type="number" class="plan-duracion-precio" min="0" step="0.01" inputmode="decimal" placeholder="0,00" value="${esc(precio)}" aria-label="Precio" />
    <p class="plan-duracion-info"></p>
    <button type="button" class="btn-icon-danger plan-duracion-quitar" title="Quitar esta duración" aria-label="Quitar esta duración">${ICONO_TACHO}</button>
  </div>`;
}

const filasDuracion = () => [...duracionesPlan.querySelectorAll(".plan-duracion")];
function leerFila(fila) {
  const meses = fila.querySelector(".plan-duracion-meses");
  const precio = fila.querySelector(".plan-duracion-precio");
  return { meses: Number(meses.value), precio: Number(precio.value), inputMeses: meses, inputPrecio: precio };
}

// Debajo de cada duración, cómo se llama y cuánto sale por mes, comparado con
// el mensual: lo que ayuda a poner el precio de una duración larga.
function actualizarDuraciones() {
  const filas = filasDuracion();
  const mensual = filas.map(leerFila).find((f) => f.meses === 1 && f.precio > 0);
  for (const fila of filas) {
    const { meses, precio } = leerFila(fila);
    const info = fila.querySelector(".plan-duracion-info");
    if (!Number.isInteger(meses) || meses < 1 || meses > MAX_MESES) {
      info.textContent = "";
      continue;
    }
    const partes = [duracionDe(meses)];
    if (meses > 1 && precio > 0) {
      const porMes = precio / meses;
      partes.push(`${money(porMes)} por mes`);
      if (mensual && porMes < mensual.precio - 0.005) partes.push(`${Math.round((1 - porMes / mensual.precio) * 100)}% menos que el mensual`);
    }
    info.textContent = partes.join(" · ");
  }
  for (const boton of duracionesPlan.querySelectorAll(".plan-duracion-quitar")) boton.disabled = filas.length === 1;
}

function pintarDuracionesPlan(opciones) {
  const filas = opciones.length ? opciones.map((o) => filaDuracion(o.meses, o.precio)) : [filaDuracion(1)];
  duracionesPlan.innerHTML = CABEZA_DURACIONES + filas.join("");
  actualizarDuraciones();
}

function limpiarFormPlan() {
  formPlanSocio.reset();
  formPlanSocio.id.value = "";
  limpiarErrores(formPlanSocio);
  pintarDuracionesPlan([]);
  document.getElementById("formPlanSocioTitulo").textContent = "Nuevo plan";
  botonPlan.textContent = "Agregar plan";
  cancelarPlan.hidden = true;
}

function renderPlanes() {
  const body = document.getElementById("planesSocioBody");
  if (planes.length === 0) {
    body.innerHTML = filaVacia(5, "Todavía no hay planes. Creá el primero acá abajo: por ejemplo, un pase libre mensual y trimestral.");
    return;
  }
  body.innerHTML = planes
    .map((p) => {
      const duraciones = opcionesActivas(p)
        .map((o) => `<span class="duracion-etiqueta">${esc(o.duracion)} <span class="mono">${money(o.precio)}</span></span>`)
        .join("");
      return `
    <tr class="${p.activo ? "" : "fila-pausada"}">
      <td data-label="Plan"><span class="celda-principal">${esc(p.nombre)}</span></td>
      <td data-label="Duraciones y precios" class="celda-wrap"><div class="duraciones-lista">${duraciones}</div></td>
      <td data-label="Socios" class="align-right mono">${esc(p.socios_activos)}</td>
      <td data-label="Estado">${p.activo ? badge("status-cobrado", "Activo").html : badge("", "Pausado").html}</td>
      <td data-label=""><div class="fila-acciones">
        ${botonEditarFila("btn-editar-plan", p.id, "plan")}
        <button type="button" class="btn-link btn-pausar-plan" data-id="${p.id}">${p.activo ? "Pausar" : "Activar"}</button>
      </div></td>
    </tr>`;
    })
    .join("");
}

function editarPlan(plan) {
  limpiarErrores(formPlanSocio);
  formPlanSocio.id.value = plan.id;
  formPlanSocio.nombre.value = plan.nombre;
  pintarDuracionesPlan(opcionesActivas(plan));
  document.getElementById("formPlanSocioTitulo").textContent = `Editar "${plan.nombre}"`;
  botonPlan.textContent = "Guardar cambios";
  cancelarPlan.hidden = false;
  formPlanSocio.nombre.focus();
  formPlanSocio.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

async function pausarOActivarPlan(plan) {
  if (plan.activo) {
    const siguen =
      plan.socios_activos > 0
        ? ` ${plural(plan.socios_activos, "socio que ya lo tiene lo sigue", "socios que ya lo tienen lo siguen")} pagando.`
        : "";
    const ok = await confirmar({ titulo: "Pausar plan", cuerpo: `"${plan.nombre}" deja de ofrecerse en las altas.${siguen}`, aceptar: "Pausar" });
    if (!ok) return;
  }
  await api(`/api/planes-socio/${plan.id}`, { method: "PATCH", body: { activo: !plan.activo }, error: "No se pudo cambiar el plan." });
  await refrescar([cargarPlanes(), recargar("productos")]);
  renderPlanes();
  avisar(plan.activo ? `"${plan.nombre}" quedó pausado.` : `"${plan.nombre}" volvió a ofrecerse.`, "ok");
}

document.getElementById("planesSocioBody").addEventListener("click", (e) => {
  const boton = e.target.closest(".btn-editar-plan, .btn-pausar-plan");
  if (!boton) return;
  const plan = planes.find((p) => p.id === Number(boton.dataset.id));
  if (boton.classList.contains("btn-editar-plan")) editarPlan(plan);
  else pausarOActivarPlan(plan);
});

duracionesPlan.addEventListener("input", (e) => {
  if (e.target.matches("input")) limpiarError(e.target);
  actualizarDuraciones();
});
duracionesPlan.addEventListener("click", (e) => {
  const quitar = e.target.closest(".plan-duracion-quitar");
  if (!quitar || filasDuracion().length === 1) return;
  quitar.closest(".plan-duracion").remove();
  actualizarDuraciones();
  filasDuracion().at(-1)?.querySelector(".plan-duracion-precio").focus();
});
document.getElementById("btnAgregarDuracion").addEventListener("click", () => {
  const usados = new Set(filasDuracion().map((f) => leerFila(f).meses));
  const sugerida = DURACIONES_SUGERIDAS.find((m) => !usados.has(m)) ?? "";
  duracionesPlan.insertAdjacentHTML("beforeend", filaDuracion(sugerida));
  actualizarDuraciones();
  const fila = filasDuracion().at(-1);
  fila.querySelector(sugerida ? ".plan-duracion-precio" : ".plan-duracion-meses").focus();
});
cancelarPlan.addEventListener("click", limpiarFormPlan);

formPlanSocio.addEventListener("submit", async (e) => {
  e.preventDefault();
  limpiarErrores(formPlanSocio);
  const nombre = formPlanSocio.nombre.value.trim();
  if (!nombre) {
    marcarError(formPlanSocio.nombre, "Ponele un nombre al plan: es lo que se ve en la recepción.");
    formPlanSocio.nombre.focus();
    return;
  }
  const opciones = [];
  for (const fila of filasDuracion()) {
    const { meses, precio, inputMeses, inputPrecio } = leerFila(fila);
    let error = null;
    let control = inputMeses;
    if (!Number.isInteger(meses) || meses < 1 || meses > MAX_MESES) error = `Escribí cuántos meses dura: de 1 a ${MAX_MESES}.`;
    else if (opciones.some((o) => o.meses === meses)) error = `Ya hay otra duración de ${plural(meses, "mes", "meses")}.`;
    else if (!(precio > 0)) {
      error = "El precio tiene que ser mayor a 0.";
      control = inputPrecio;
    }
    if (error) {
      marcarError(control, error);
      control.focus();
      return;
    }
    opciones.push({ meses, precio });
  }
  const editandoId = formPlanSocio.id.value;
  await enviando(botonPlan, () =>
    api(editandoId ? `/api/planes-socio/${editandoId}` : "/api/planes-socio", {
      method: editandoId ? "PATCH" : "POST",
      body: { nombre, opciones },
      error: "No se pudo guardar el plan."
    })
  );
  // El plan es un servicio del catálogo: Productos también cambió.
  await refrescar([cargarPlanes(), recargar("productos")]);
  renderPlanes();
  limpiarFormPlan();
  avisar(editandoId ? `Plan "${nombre}" actualizado.` : `Plan "${nombre}" creado.`, "ok");
});


/* ---------- Descuentos y combos (#/planes-socio/descuentos) ---------- */

const formDescuento = document.getElementById("formDescuentoSocio");
const botonDescuento = document.getElementById("formDescuentoSocioSubmit");
const cancelarDescuento = document.getElementById("formDescuentoSocioCancelar");
const descuentoCombo = document.getElementById("descuentoCombo");
const descuentoCantidad = document.getElementById("descuentoCantidad");
const descuentoPlanes = document.getElementById("descuentoPlanes");

function textoCuandoSeAplica(d) {
  if (d.aplica === "combo") return `Al combinar ${d.planes.map((p) => p.nombre).join(" + ")}`;
  if (d.aplica === "cantidad") return `Desde ${plural(d.minimo_planes, "plan", "planes")}`;
  return "A mano, a quien se lo elijas";
}

const aplicaElegido = () => formDescuento.querySelector('input[name="aplica"]:checked').value;

function pintarAplica() {
  const aplica = aplicaElegido();
  descuentoCombo.hidden = aplica !== "combo";
  descuentoCantidad.hidden = aplica !== "cantidad";
}

function pintarPlanesCombo(marcados = []) {
  const lista = planes.filter((p) => p.activo || marcados.includes(p.id));
  descuentoPlanes.innerHTML =
    lista.length < 2
      ? `<p class="opciones-nota">Para un combo hacen falta al menos dos planes. <a class="btn-link" href="#/planes-socio">Crealos en la pestaña Planes</a>.</p>`
      : lista
          .map(
            (p) => `
        <label class="chip-elegir">
          <input type="checkbox" name="plan" value="${p.id}"${marcados.includes(p.id) ? " checked" : ""} />
          <span>${esc(p.nombre)}</span>
        </label>`
          )
          .join("");
}

function limpiarFormDescuento() {
  formDescuento.reset();
  formDescuento.id.value = "";
  limpiarErrores(formDescuento);
  pintarAplica();
  pintarPlanesCombo();
  document.getElementById("formDescuentoSocioTitulo").textContent = "Nuevo descuento";
  botonDescuento.textContent = "Agregar descuento";
  cancelarDescuento.hidden = true;
}

function renderDescuentos() {
  const body = document.getElementById("descuentosSocioBody");
  if (descuentos.length === 0) {
    body.innerHTML = filaVacia(5, "Todavía no hay descuentos. Armá el primero acá abajo: por ejemplo, un combo de dos actividades.");
    return;
  }
  body.innerHTML = descuentos
    .map(
      (d) => `
    <tr class="${d.activo ? "" : "fila-pausada"}">
      <td data-label="Descuento"><span class="celda-principal">${esc(d.nombre)}</span></td>
      <td data-label="Cuándo se aplica" class="celda-wrap">${esc(textoCuandoSeAplica(d))}</td>
      <td data-label="Porcentaje" class="align-right mono">${esc(porcentaje(d.porcentaje))}</td>
      <td data-label="Estado">${d.activo ? badge("status-cobrado", "Activo").html : badge("", "Pausado").html}</td>
      <td data-label=""><div class="fila-acciones">
        ${botonEditarFila("btn-editar-descuento", d.id, "descuento")}
        <button type="button" class="btn-link btn-pausar-descuento" data-id="${d.id}">${d.activo ? "Pausar" : "Activar"}</button>
      </div></td>
    </tr>`
    )
    .join("");
}

function editarDescuento(d) {
  limpiarErrores(formDescuento);
  formDescuento.id.value = d.id;
  formDescuento.nombre.value = d.nombre;
  formDescuento.porcentaje.value = d.porcentaje;
  for (const radio of formDescuento.querySelectorAll('input[name="aplica"]')) radio.checked = radio.value === d.aplica;
  formDescuento.minimo_planes.value = d.minimo_planes ?? 2;
  pintarAplica();
  pintarPlanesCombo(d.planes.map((p) => p.id));
  document.getElementById("formDescuentoSocioTitulo").textContent = `Editar "${d.nombre}"`;
  botonDescuento.textContent = "Guardar cambios";
  cancelarDescuento.hidden = false;
  formDescuento.nombre.focus();
  formDescuento.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

async function pausarOActivarDescuento(d) {
  if (d.activo) {
    const ok = await confirmar({
      titulo: "Pausar descuento",
      cuerpo: `"${d.nombre}" deja de aplicarse desde la próxima cuota de cada socio. Las cuotas que ya se generaron no cambian.`,
      aceptar: "Pausar"
    });
    if (!ok) return;
  }
  await api(`/api/descuentos-socio/${d.id}`, { method: "PATCH", body: { activo: !d.activo }, error: "No se pudo cambiar el descuento." });
  await cargarDescuentos();
  renderDescuentos();
  avisar(d.activo ? `"${d.nombre}" quedó pausado.` : `"${d.nombre}" volvió a aplicarse.`, "ok");
}

document.getElementById("descuentosSocioBody").addEventListener("click", (e) => {
  const boton = e.target.closest(".btn-editar-descuento, .btn-pausar-descuento");
  if (!boton) return;
  const d = descuentos.find((x) => x.id === Number(boton.dataset.id));
  if (boton.classList.contains("btn-editar-descuento")) editarDescuento(d);
  else pausarOActivarDescuento(d);
});

document.getElementById("descuentoAplica").addEventListener("change", () => {
  limpiarErrores(formDescuento);
  pintarAplica();
});
descuentoPlanes.addEventListener("change", () => limpiarError(descuentoPlanes));
cancelarDescuento.addEventListener("click", limpiarFormDescuento);

formDescuento.addEventListener("submit", async (e) => {
  e.preventDefault();
  limpiarErrores(formDescuento);
  const nombre = formDescuento.nombre.value.trim();
  const valor = Number(formDescuento.porcentaje.value);
  const aplica = aplicaElegido();
  const error = (control, texto) => {
    marcarError(control, texto);
    (control.matches("input") ? control : control.querySelector("input"))?.focus();
  };
  if (!nombre) return error(formDescuento.nombre, "Ponele un nombre: es lo que se ve en la ficha del socio.");
  if (!(valor > 0) || valor > 100) return error(formDescuento.porcentaje, "El porcentaje tiene que ser de más de 0 y hasta 100.");
  const cuerpo = { nombre, porcentaje: valor, aplica };
  if (aplica === "combo") {
    cuerpo.planes = [...descuentoPlanes.querySelectorAll('input[name="plan"]:checked')].map((c) => Number(c.value));
    if (cuerpo.planes.length < 2) return error(descuentoPlanes, "Elegí al menos dos planes para el combo.");
  }
  if (aplica === "cantidad") {
    cuerpo.minimo_planes = Number(formDescuento.minimo_planes.value);
    if (!Number.isInteger(cuerpo.minimo_planes) || cuerpo.minimo_planes < 2) {
      return error(formDescuento.minimo_planes, "Tiene que ser desde 2 planes o más.");
    }
  }
  const editandoId = formDescuento.id.value;
  await enviando(botonDescuento, () =>
    api(editandoId ? `/api/descuentos-socio/${editandoId}` : "/api/descuentos-socio", {
      method: editandoId ? "PATCH" : "POST",
      body: cuerpo,
      error: "No se pudo guardar el descuento."
    })
  );
  await cargarDescuentos();
  renderDescuentos();
  limpiarFormDescuento();
  avisar(editandoId ? `Descuento "${nombre}" actualizado.` : `Descuento "${nombre}" creado.`, "ok");
});

/* ---------- La vista Planes y sus pestañas ---------- */

// Cada pestaña trae lo suyo al entrar: los descuentos necesitan los planes
// para armar los combos.
async function abrirPlanes(subruta) {
  const pestana = subruta === "descuentos" ? "descuentos" : "planes";
  // Una subruta que no existe no queda en la barra de direcciones.
  if (subruta && subruta !== pestana) history.replaceState(null, "", "#/planes-socio");
  for (const seccion of document.querySelectorAll(".planes-pestana")) seccion.hidden = seccion.dataset.pestana !== pestana;
  for (const enlace of document.querySelectorAll(".planes-menu .segmento")) {
    if (enlace.dataset.pestana === pestana) enlace.setAttribute("aria-current", "page");
    else enlace.removeAttribute("aria-current");
  }
  if (pestana === "planes") {
    limpiarFormPlan();
    tablaCargando("planesSocioBody", 5, 2);
    await cargarPlanes();
    renderPlanes();
  } else {
    tablaCargando("descuentosSocioBody", 5, 2);
    await Promise.all([cargarPlanes(), cargarDescuentos()]);
    limpiarFormDescuento();
    renderDescuentos();
  }
}

/* ---------- Vistas ---------- */

alEntrarEnVista("ingreso", entrarAIngreso);
alEntrarEnVista("planes-socio", abrirPlanes);

alEntrarEnVista("socios", async (subruta) => {
  if (subruta === "nuevo") {
    await abrirAlta();
    return;
  }
  // Una subruta que no existe no queda en la barra de direcciones.
  if (subruta) history.replaceState(null, "", "#/socios");
  document.getElementById("socioAlta").hidden = true;
  document.getElementById("sociosLista").hidden = false;
  tablaCargando("sociosBody", 6);
  await refrescar([cargarSocios(), cargarPlanes()]);
  renderLista();
});
