/**
 * dominios/ayuda.js
 * El manual de uso (hist. §118): la vista #/ayuda/<sección>, con un buscador
 * y el índice a la izquierda (en el celular, uno o el otro, como
 * Configuración), y las respuestas del asistente a "¿cómo hago…?", que salen
 * de este mismo manual sin llamar a la IA.
 *
 * El contenido vive en core/manual.js y la búsqueda en core/buscar-ayuda.js.
 * Lo que se muestra tiene en cuenta a quien mira: si la sección es de una
 * función apagada o solo de administradores, lo dice.
 */

import { GRUPOS, SECCIONES } from "../core/manual.js";
import { buscarEnManual, PUNTAJE_DUDOSO, PUNTAJE_SEGURO } from "../core/buscar-ayuda.js";
import { esAdmin, esc } from "../core/formato.js";
import { moduloActivo } from "../core/negocio.js";
import { alEntrarEnVista } from "../core/registro.js";

const POR_ID = new Map(SECCIONES.map((s) => [s.id, s]));

// Los nombres de las funciones opcionales, como en Configuración › Funciones.
const NOMBRE_MODULO = {
  pos: "Punto de venta",
  crm: "Consultas (CRM)",
  presupuestos: "Presupuestos",
  trabajos: "Trabajos",
  abonos: "Abonos",
  compras: "Compras",
  stock: "Stock",
  socios: "Socios"
};

/* ---------- Pintar una sección ---------- */

// Texto propio del manual: se escapa igual, y **así** pasa a negrita.
const enLinea = (texto) => esc(texto).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

export function htmlDeBloques(bloques) {
  return bloques
    .map((b) => {
      if (typeof b === "string") return `<p>${enLinea(b)}</p>`;
      if (b.pasos) return `<ol class="ayuda-pasos">${b.pasos.map((p) => `<li>${enLinea(p)}</li>`).join("")}</ol>`;
      if (b.lista) return `<ul class="ayuda-lista">${b.lista.map((p) => `<li>${enLinea(p)}</li>`).join("")}</ul>`;
      return `<p class="ayuda-nota"><svg class="ico" aria-hidden="true"><use href="/img/iconos.svg#info"></use></svg><span>${enLinea(b.nota)}</span></p>`;
    })
    .join("");
}

// Lo que cambia para quien mira: una función apagada, o algo de administradores.
function avisosPara(seccion) {
  const avisos = [];
  if (seccion.modulo && !moduloActivo(seccion.modulo)) {
    avisos.push(
      `Tu negocio tiene apagada la función ${NOMBRE_MODULO[seccion.modulo]}: se prende en Configuración › Funciones.`
    );
  }
  if (seccion.admin && !esAdmin()) avisos.push("Esto lo hace quien administra el negocio.");
  return avisos.map((a) => `<p class="ayuda-aviso">${esc(a)}</p>`).join("");
}

// "Ir a Ventas", si quien mira puede entrar.
function botonPantalla(seccion, clase = "btn btn-secundario") {
  if (!seccion.pantalla) return "";
  if (seccion.admin && !esAdmin()) return "";
  if (seccion.modulo && !moduloActivo(seccion.modulo)) return "";
  const [hash, nombre] = seccion.pantalla;
  return `<a class="${clase}" href="${esc(hash)}">Ir a ${esc(nombre)}</a>`;
}

const enlaceSeccion = (s) => `<a href="#/ayuda/${s.id}">${esc(s.titulo)}</a>`;

/* ---------- La respuesta del asistente ---------- */

// resultados: lo que devuelve buscarEnManual (o clasificarFrase), de más a
// menos. Devuelve el HTML de la respuesta, para el turno del hilo.
export function respuestaDeAyuda(resultados) {
  const [mejor, ...otros] = resultados;
  const ayudaGeneral = `<p class="form-note">Si querías cargar algo, contámelo como algo que ya pasó: "vendí…", "compré…", "pagué…".</p>`;

  if (!mejor || mejor.puntaje < PUNTAJE_DUDOSO) {
    return `<div class="asistente-ayuda">
      <p>No encontré eso en el manual.</p>
      <p class="asistente-ayuda-acciones"><a class="btn-link" href="#/ayuda">Ver el manual</a><a class="btn-link" href="#/configuracion/problema">Avisar un problema</a></p>
      ${ayudaGeneral}
    </div>`;
  }

  if (mejor.puntaje < PUNTAJE_SEGURO) {
    const opciones = resultados.filter((r) => r.puntaje >= PUNTAJE_DUDOSO);
    return `<div class="asistente-ayuda">
      <p>No estoy seguro de haberte entendido. ¿Es alguna de estas?</p>
      <ul class="ayuda-lista">${opciones.map((r) => `<li>${enlaceSeccion(r.seccion)}</li>`).join("")}</ul>
      ${ayudaGeneral}
    </div>`;
  }

  const { seccion } = mejor;
  const relacionados = otros.filter((r) => r.puntaje >= PUNTAJE_SEGURO).map((r) => enlaceSeccion(r.seccion));
  return `<div class="asistente-ayuda">
    <p class="asistente-ayuda-origen"><svg class="ico" aria-hidden="true"><use href="/img/iconos.svg#notebook-tabs"></use></svg> Del manual</p>
    <h3>${esc(seccion.titulo)}</h3>
    ${htmlDeBloques(seccion.bloques)}
    ${avisosPara(seccion)}
    <p class="asistente-ayuda-acciones">${botonPantalla(seccion, "btn btn-secundario btn-chico")}<a class="btn-link" href="#/ayuda/${seccion.id}">Ver en el manual</a></p>
    ${relacionados.length ? `<p class="form-note">También puede servirte: ${relacionados.join(" · ")}</p>` : ""}
  </div>`;
}

/* ---------- La vista del manual ---------- */

const ayuda = document.getElementById("ayuda");
const indice = document.getElementById("ayudaIndice");
const contenido = document.getElementById("ayudaContenido");
const buscador = document.getElementById("ayudaBuscar");
const celular = window.matchMedia("(max-width: 860px)");

const itemDeIndice = (s) => `<a class="config-item" href="#/ayuda/${s.id}" data-seccion="${s.id}">
    <span class="config-item-texto"><span class="config-item-nombre">${esc(s.titulo)}</span></span>
    <svg class="ico config-item-chevron" aria-hidden="true"><use href="/img/iconos.svg#chevron-right"></use></svg>
  </a>`;

function pintarIndice() {
  const texto = buscador.value.trim();
  if (texto) {
    const resultados = buscarEnManual(texto, { maximo: 8 }).filter((r) => r.puntaje >= 0.15);
    indice.innerHTML = resultados.length
      ? `<div class="config-grupo"><p class="config-grupo-titulo">Resultados</p>${resultados.map((r) => itemDeIndice(r.seccion)).join("")}</div>`
      : `<p class="ayuda-sin-resultados">No encontré nada con eso. Probá con otras palabras, o preguntale al asistente.</p>`;
  } else {
    indice.innerHTML = GRUPOS.map(
      (grupo) =>
        `<div class="config-grupo"><p class="config-grupo-titulo">${esc(grupo)}</p>${SECCIONES.filter((s) => s.grupo === grupo)
          .map(itemDeIndice)
          .join("")}</div>`
    ).join("");
  }
  marcarActiva();
}

function marcarActiva() {
  for (const item of indice.querySelectorAll(".config-item")) {
    const activo = item.dataset.seccion === ayuda.dataset.pagina;
    item.classList.toggle("is-active", activo);
    if (activo) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  }
}

function pintarSeccion(seccion) {
  const ver = (seccion.ver ?? []).map((id) => POR_ID.get(id)).filter(Boolean);
  contenido.innerHTML = `
    <a class="btn-link config-volver" href="#/ayuda"><svg class="ico" aria-hidden="true"><use href="/img/iconos.svg#chevron-left"></use></svg> Manual</a>
    <article class="ayuda-articulo">
      <p class="ayuda-grupo">${esc(seccion.grupo)}</p>
      <h2 tabindex="-1">${esc(seccion.titulo)}</h2>
      ${avisosPara(seccion)}
      ${htmlDeBloques(seccion.bloques)}
      ${botonPantalla(seccion) ? `<p class="ayuda-ir">${botonPantalla(seccion)}</p>` : ""}
      ${ver.length ? `<div class="ayuda-ver"><p class="config-grupo-titulo">Relacionado</p>${ver.map(itemDeIndice).join("")}</div>` : ""}
    </article>
    <p class="ayuda-pie">¿No encontraste lo que buscabas? <a href="#/asistente">Preguntale al asistente</a> o <a href="#/configuracion/problema">avisanos</a>.</p>`;
}

function abrir(subruta) {
  if (!indice.childElementCount) pintarIndice();
  let seccion = POR_ID.get(subruta ?? "");
  // Sin sección: en el celular se ve el índice; en la compu, la primera.
  if (!seccion && !celular.matches) seccion = SECCIONES[0];
  if (subruta && !POR_ID.has(subruta)) {
    history.replaceState(null, "", seccion ? `#/ayuda/${seccion.id}` : "#/ayuda");
  }
  ayuda.dataset.pagina = seccion?.id ?? "";
  marcarActiva();
  if (!seccion) return;
  pintarSeccion(seccion);
  window.scrollTo(0, 0);
  if (subruta) contenido.querySelector("h2")?.focus({ preventScroll: true });
}

buscador.addEventListener("input", pintarIndice);
// Enter en el buscador abre el primer resultado.
buscador.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  indice.querySelector(".config-item")?.click();
});
celular.addEventListener("change", () => {
  if (!ayuda.closest(".view").hidden && !ayuda.dataset.pagina) abrir(null);
});

alEntrarEnVista("ayuda", abrir);
