/**
 * dominios/plataforma.js
 * El panel de la plataforma (hist. §111): lo que ve quien administra Nexo de
 * toda la instalación. Tres pestañas por subruta (#/plataforma/resumen,
 * /cuentas y /negocios), como Trabajos.
 *
 * Solo lee (GET /api/plataforma/*). Los datos son de todos los negocios, así
 * que el backend lo cierra con soloPlataforma (NEXO_ADMIN_PLATAFORMA) y de
 * cada negocio da conteos, nunca sus datos. Cambiar un plan sigue siendo
 * `npm run plan` en el servidor.
 */

import { api } from "../core/api.js";
import { celdaMovil, esc, esPlataforma, fechaAR, fechaHoraAR, numero } from "../core/formato.js";
import { filaVacia, tablaCargando } from "../core/ui.js";
import { alEntrarEnVista } from "../core/registro.js";

const PESTANAS = ["resumen", "cuentas", "negocios"];
const ROL = { admin: "Administrador", empleado: "Empleado" };

let pestana = "resumen";
let cuentas = [];
let negocios = [];

// Un momento UTC de datetime('now') ("AAAA-MM-DD hh:mm:ss", con o sin
// milésimas), como Date.
const comoFecha = (utc) => new Date(`${utc.replace(" ", "T").slice(0, 19)}Z`);

// El día local de un momento UTC, "dd/mm/aaaa".
const diaLocal = (utc) => (utc ? fechaHoraAR(utc).slice(0, 10) : "—");

// "Hace 3 h", "Ayer", "Hace 5 días"; lo de hace más de un mes, con la fecha.
function haceCuanto(utc) {
  if (!utc) return "Nunca";
  const minutos = Math.max(0, Math.round((Date.now() - comoFecha(utc).getTime()) / 60000));
  if (minutos < 2) return "Recién";
  if (minutos < 60) return `Hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `Hace ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias === 1) return "Ayer";
  if (dias <= 30) return `Hace ${dias} días`;
  return diaLocal(utc);
}

const usadoEnLaSemana = (utc) => !!utc && Date.now() - comoFecha(utc).getTime() <= 7 * 86_400_000;

/* ---------- Resumen ---------- */

async function cargarResumen() {
  tablaCargando("platPlanesBody", 2, 2);
  tablaCargando("platSemanasBody", 3);
  const r = await api("/api/plataforma/resumen", { error: "No se pudo cargar el resumen de la plataforma." });
  const { cuentas: c, negocios: n } = r;
  document.getElementById("platCuentas").textContent = numero(c.total);
  document.getElementById("platCuentasNota").textContent =
    c.confirmadas === c.total ? "Todas con el mail confirmado" : `${numero(c.confirmadas)} con el mail confirmado`;
  document.getElementById("platCuentasNuevas").textContent = numero(c.nuevas_7_dias);
  document.getElementById("platCuentasActivas").textContent = numero(c.activas_7_dias);
  document.getElementById("platNegocios").textContent = numero(n.total);
  document.getElementById("platNegociosNota").textContent = n.en_baja
    ? `${numero(n.en_baja)} más en baja`
    : n.borrados
      ? `${numero(n.borrados)} ya borrados`
      : "";
  document.getElementById("platNegociosActivos").textContent = numero(n.activos_7_dias);
  document.getElementById("platNegociosActivosNota").textContent = `${numero(n.activos_30_dias)} en 30 días`;

  document.getElementById("platPlanesBody").innerHTML = n.por_plan
    .map(
      (p) => `
      <tr>
        <td data-label="Plan" class="m-titulo">${esc(p.nombre)}</td>
        <td data-label="Negocios" class="align-right mono m-valor">${numero(p.negocios)}</td>
      </tr>`
    )
    .join("");

  // De la semana que termina hoy hacia atrás.
  document.getElementById("platSemanasBody").innerHTML = r.semanas
    .map(
      (s, i) => `
      <tr>
        <td data-label="Semana" class="m-titulo">${i === 0 ? "Últimos 7 días" : `${esc(fechaAR(s.desde).slice(0, 5))} al ${esc(fechaAR(s.hasta).slice(0, 5))}`}</td>
        ${celdaMovil(`${numero(s.cuentas)} cuentas nuevas`, `${numero(s.negocios)} negocios nuevos`)}
        <td data-label="Cuentas nuevas" class="align-right mono">${numero(s.cuentas)}</td>
        <td data-label="Negocios nuevos" class="align-right mono">${numero(s.negocios)}</td>
      </tr>`
    )
    .join("");
}

/* ---------- Cuentas ---------- */

function estadoDeCuenta(c) {
  if (c.baja) return '<span class="status">Dada de baja</span>';
  if (!c.email) return '<span class="status status-pendiente">Sin mail</span>';
  if (!c.email_verificado) return '<span class="status status-pendiente">Sin confirmar</span>';
  return '<span class="status status-cobrado">Confirmado</span>';
}

function negociosDeCuenta(c) {
  if (!c.negocios.length) return '<span class="celda-meta">Sin negocio</span>';
  return `<div class="plat-negocios">${c.negocios
    .map(
      (n) =>
        `<span>${esc(n.nombre)}<span class="status">${esc(ROL[n.rol] ?? n.rol)}</span>${
          n.activo ? "" : '<span class="status">Ya no está</span>'
        }</span>`
    )
    .join("")}</div>`;
}

function pintarCuentas() {
  const texto = document.getElementById("platCuentasBuscar").value.trim().toLocaleLowerCase("es");
  const lista = texto
    ? cuentas.filter((c) =>
        [c.nombre, c.email, ...c.negocios.map((n) => n.nombre)].some((v) => (v ?? "").toLocaleLowerCase("es").includes(texto))
      )
    : cuentas;
  const body = document.getElementById("platCuentasBody");
  if (!lista.length) {
    body.innerHTML = filaVacia(5, texto ? "Ninguna cuenta coincide con la búsqueda." : "Todavía no hay cuentas.");
    return;
  }
  body.innerHTML = lista
    .map(
      (c) => `
      <tr class="${c.baja ? "fila-anulada" : ""}">
        <td data-label="Cuenta" class="m-titulo">
          <span class="celda-principal">${esc(c.nombre)}</span>
          <span class="celda-meta">${esc(c.email ?? "Sin mail")}</span>
        </td>
        ${celdaMovil(c.email ?? "Sin mail", c.negocios.map((n) => n.nombre).join(", ") || "Sin negocio", haceCuanto(c.ultimo_uso))}
        <td data-label="Negocios">${negociosDeCuenta(c)}</td>
        <td data-label="Creada">${esc(diaLocal(c.fecha_alta))}</td>
        <td data-label="Último uso" title="${esc(c.ultimo_uso ? fechaHoraAR(c.ultimo_uso) : "")}">${esc(haceCuanto(c.ultimo_uso))}</td>
        <td data-label="Mail" class="m-estado">${estadoDeCuenta(c)}</td>
      </tr>`
    )
    .join("");
}

async function cargarCuentas() {
  tablaCargando("platCuentasBody", 5);
  cuentas = await api("/api/plataforma/cuentas", { error: "No se pudieron cargar las cuentas." });
  pintarCuentas();
}

/* ---------- Negocios ---------- */

// El plan que rige, y por qué si no es el guardado (venció la prueba).
function planDeNegocio(n) {
  const nombre = `<span class="celda-principal">${esc(n.plan_nombre)}</span>`;
  if (n.plan !== n.plan_vigente) return `${nombre}<span class="celda-meta">Venció el ${esc(fechaAR(n.plan_vence))}</span>`;
  if (n.plan_vence) return `${nombre}<span class="celda-meta">Hasta el ${esc(fechaAR(n.plan_vence))}</span>`;
  return nombre;
}

function estadoDeNegocio(n) {
  if (n.se_borra) return `<span class="status status-pendiente">Se borra el ${esc(fechaAR(n.se_borra))}</span>`;
  if (usadoEnLaSemana(n.ultimo_uso)) return '<span class="status status-cobrado">En uso</span>';
  return '<span class="status">Sin uso esta semana</span>';
}

function pintarNegocios() {
  const texto = document.getElementById("platNegociosBuscar").value.trim().toLocaleLowerCase("es");
  const lista = texto
    ? negocios.filter((n) => [n.nombre, n.tipo].some((v) => (v ?? "").toLocaleLowerCase("es").includes(texto)))
    : negocios;
  const body = document.getElementById("platNegociosBody");
  if (!lista.length) {
    body.innerHTML = filaVacia(8, texto ? "Ningún negocio coincide con la búsqueda." : "Todavía no hay negocios.");
    return;
  }
  body.innerHTML = lista
    .map(
      (n) => `
      <tr class="${n.se_borra ? "fila-anulada" : ""}">
        <td data-label="Negocio" class="m-titulo">
          <span class="celda-principal">${esc(n.nombre)}</span>
          <span class="celda-meta">${esc(n.tipo)}</span>
        </td>
        ${celdaMovil(n.plan_nombre, `${numero(n.ventas_30_dias)} ventas en 30 días`, haceCuanto(n.ultimo_uso))}
        <td data-label="Plan">${planDeNegocio(n)}</td>
        <td data-label="Productos" class="align-right mono">${numero(n.productos)}</td>
        <td data-label="Ventas" class="align-right">
          <span class="celda-principal mono">${numero(n.ventas)}</span>
          <span class="celda-meta">${numero(n.ventas_30_dias)} en 30 días</span>
        </td>
        <td data-label="Personas" class="align-right mono">${numero(n.personas)}</td>
        <td data-label="Creado">${esc(diaLocal(n.fecha_alta))}</td>
        <td data-label="Último uso" title="${esc(n.ultimo_uso ? fechaHoraAR(n.ultimo_uso) : "")}">${esc(haceCuanto(n.ultimo_uso))}</td>
        <td data-label="Estado" class="m-estado">${estadoDeNegocio(n)}</td>
      </tr>`
    )
    .join("");
}

async function cargarNegocios() {
  tablaCargando("platNegociosBody", 8);
  negocios = await api("/api/plataforma/negocios", { error: "No se pudieron cargar los negocios." });
  pintarNegocios();
}

/* ---------- Pestañas ---------- */

const CARGAR = { resumen: cargarResumen, cuentas: cargarCuentas, negocios: cargarNegocios };

// Sin subruta (el menú), la pestaña que estaba abierta. Cada vez que se
// entra se vuelve a pedir: es una consulta ocasional, como Auditoría.
async function entrarAPlataforma(subruta) {
  if (!esPlataforma()) return;
  const elegida = PESTANAS.includes(subruta) ? subruta : pestana;
  if (subruta !== elegida) history.replaceState(null, "", `#/plataforma/${elegida}`);
  pestana = elegida;
  for (const seccion of document.querySelectorAll(".plataforma-pestana")) {
    seccion.hidden = seccion.dataset.pestana !== pestana;
  }
  for (const enlace of document.querySelectorAll("#plataformaMenu .segmento")) {
    if (enlace.dataset.pestana === pestana) enlace.setAttribute("aria-current", "page");
    else enlace.removeAttribute("aria-current");
  }
  await CARGAR[pestana]();
}

document.getElementById("platCuentasBuscar").addEventListener("input", pintarCuentas);
document.getElementById("platNegociosBuscar").addEventListener("input", pintarNegocios);
for (const boton of document.querySelectorAll("[data-plat-actualizar]")) {
  boton.addEventListener("click", () => CARGAR[pestana]());
}

alEntrarEnVista("plataforma", entrarAPlataforma);
