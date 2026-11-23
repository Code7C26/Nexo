/**
 * dominios/menu.js
 * -----------------------------------------------------------
 * El menú de cada persona (hist. §224, core/menu.js): las secciones que subió
 * arriba de todo, en su orden, y las que escondió, que quedan en "Más
 * secciones" al final del menú. Lo guarda el servidor por persona y negocio
 * (GET/PUT/DELETE /api/menu), así sigue igual en el celular y en la compu; se
 * arma en Configuración → Menú.
 *
 * Armarlo es mover los <a class="nav-item"> de siempre entre los grupos del
 * menú: los clicks del router y la barra de abajo del celular siguen andando
 * igual, porque son los mismos elementos. Lo último que se armó queda en este
 * aparato ("nexo.menu"), para no ver el menú de siempre un instante al entrar.
 *
 * No da permisos: una sección de admin o de un módulo apagado la sigue
 * ocultando el CSS, esté donde esté.
 */

import { api } from "../core/api.js";
import { ordenarArrastrando } from "../core/arrastrar.js";
import { esc } from "../core/formato.js";
import { icono } from "../core/iconos.js";
import { ARRIBA_DE_SIEMPRE, EN_GRUPOS, menuDeSiempre, normalizarMenu } from "../core/menu.js";
import { registrar } from "../core/registro.js";
import { avisar } from "../core/ui.js";

const CLAVE = "nexo.menu";

const sidebar = document.getElementById("sidebar");
const arriba = document.getElementById("navArriba");
const mas = document.getElementById("navMas");
const masItems = document.getElementById("navMasItems");

// Cada sección con su grupo del HTML: ahí vuelve al sacarla de arriba o al
// dejar de esconderla. Fuera de su grupo sigue al módulo del grupo (Stock,
// Socios y Producción se apagan enteros), así que se lo lleva puesto.
const items = [...sidebar.querySelectorAll(".nav-item[data-view]")];
const grupoDe = new Map(items.map((item) => [item.dataset.view, item.parentElement]));
for (const item of items) {
  const modulo = item.parentElement.dataset.modulo;
  if (modulo && !item.dataset.modulo) item.dataset.modulo = modulo;
}
const itemDe = (vista) => items.find((item) => item.dataset.view === vista);

// Si la sección es para esta persona en este negocio: el CSS ya oculta la de
// un módulo apagado o de admin, esté donde esté.
const aplica = (vista) => {
  const item = itemDe(vista);
  return Boolean(item) && getComputedStyle(item).display !== "none";
};

let menu = menuDeSiempre();
let personalizado = false;

function aplicar() {
  // Todas a su grupo, en el orden del HTML; después, arriba en el orden de la
  // persona y las escondidas en "Más secciones".
  for (const item of items) grupoDe.get(item.dataset.view).append(item);
  for (const vista of menu.arriba) {
    const item = itemDe(vista);
    if (item) arriba.append(item);
  }
  for (const vista of menu.ocultas) {
    const item = itemDe(vista);
    if (item) masItems.append(item);
  }
  marcarMas();
}

// "Más secciones" se ve si tiene alguna que aplique, y se abre sola si la
// pantalla que se está mirando es una de ellas.
function marcarMas() {
  mas.hidden = !menu.ocultas.some(aplica);
  if (masItems.querySelector(".nav-item.is-active")) mas.open = true;
}

function fijar({ arriba: deArriba, ocultas, personalizado: esPropio }) {
  menu = normalizarMenu({ arriba: deArriba, ocultas });
  personalizado = esPropio;
  try {
    if (esPropio) localStorage.setItem(CLAVE, JSON.stringify(menu));
    else localStorage.removeItem(CLAVE);
  } catch {
    // Sin storage, el menú llega igual del servidor; solo tarda un instante.
  }
  aplicar();
}

// El de la última vez en este aparato, antes de que conteste el servidor.
try {
  const guardado = JSON.parse(localStorage.getItem(CLAVE) ?? "null");
  if (guardado) {
    menu = normalizarMenu(guardado);
    aplicar();
  }
} catch {
  // Uno roto o sin storage: queda el de siempre hasta que llegue el del servidor.
}

registrar("cargar:menu", async () => fijar(await api("/api/menu", { error: "No se pudo cargar tu menú." })));

// Los módulos y el rol cambian qué secciones aplican (y el router, cuál está
// activa).
new MutationObserver(marcarMas).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-modulos", "data-rol"]
});
window.addEventListener("hashchange", () => requestAnimationFrame(marcarMas));

/* ---------- Configuración → Menú ---------- */
//
// Arriba, las secciones de arriba de todo, que se ordenan arrastrando; abajo,
// cada grupo con las suyas. Cada una con su tilde para mostrarla o esconderla,
// y "Poner arriba" o "Sacar de arriba". Se trabaja sobre una copia: nada
// cambia hasta Guardar.

const listaArriba = document.getElementById("menuArriba");
const listaGrupos = document.getElementById("menuGrupos");
let borrador = null;

// El nombre como se ve en el menú: el del catálogo según lo que tiene cargado,
// y "CRM" o "Clientes" según el módulo.
function nombreDe(item) {
  return [...item.childNodes]
    .filter((nodo) => nodo.nodeType === Node.TEXT_NODE || (nodo.localName === "span" && getComputedStyle(nodo).display !== "none"))
    .map((nodo) => nodo.textContent)
    .join("")
    .trim();
}

function fila(vista, enArriba) {
  const item = itemDe(vista);
  const nombre = nombreDe(item);
  const visible = !borrador.ocultas.includes(vista);
  let mover = "";
  if (!enArriba) mover = `<button type="button" class="btn-link menu-mover" data-subir>Poner arriba</button>`;
  else if (!ARRIBA_DE_SIEMPRE.includes(vista)) mover = `<button type="button" class="btn-link menu-mover" data-bajar>Sacar de arriba</button>`;
  const arrastrar = enArriba
    ? `<button type="button" class="btn-icon tablero-arrastrar" data-arrastrar aria-label="Mover ${esc(nombre)}: arrastrala o usá las flechas"
        aria-describedby="menuAyudaMover" title="Arrastrá para cambiarla de lugar">${icono("menu")}</button>`
    : "";
  return `
    <li class="tablero-fila${visible ? "" : " is-oculta"}" data-vista="${esc(vista)}">
      <label class="tablero-elegir menu-elegir">
        <input type="checkbox" ${visible ? "checked" : ""} />
        <svg class="ico" aria-hidden="true"><use href="${esc(item.querySelector("use")?.getAttribute("href") ?? "")}"></use></svg>
        <strong>${esc(nombre)}</strong>
      </label>
      ${mover}
      ${arrastrar}
    </li>`;
}

function pintarPagina() {
  listaArriba.innerHTML = borrador.arriba
    .filter(aplica)
    .map((vista) => fila(vista, true))
    .join("");
  // Los grupos en el orden del menú, cada uno con lo suyo que no está arriba.
  const grupos = [...sidebar.querySelectorAll(".nav-seccion:has(> .nav-grupo)")].filter(
    (seccion) => !seccion.classList.contains("nav-seccion-plataforma")
  );
  listaGrupos.innerHTML = grupos
    .map((seccion) => {
      const suyas = EN_GRUPOS.filter((vista) => grupoDe.get(vista) === seccion && !borrador.arriba.includes(vista) && aplica(vista));
      if (!suyas.length) return "";
      return `
        <h3 class="menu-subtitulo">${esc(seccion.querySelector(".nav-grupo").textContent)}</h3>
        <ul class="tablero-lista">${suyas.map((vista) => fila(vista, false)).join("")}</ul>`;
    })
    .join("");
  document.getElementById("btnMenuDeSiempre").hidden = !personalizado;
}

// El orden de arriba es el de la pantalla. Las que no aplican (un módulo
// apagado) quedan al final, en el orden que tenían, por si se vuelve a prender.
function leerOrden() {
  const enPantalla = [...listaArriba.querySelectorAll("[data-vista]")].map((li) => li.dataset.vista);
  borrador.arriba = [...enPantalla, ...borrador.arriba.filter((vista) => !aplica(vista))];
}
ordenarArrastrando(listaArriba, { fila: "[data-vista]", alCambiar: leerOrden });

const pagina = document.querySelector('.config-pagina[data-seccion="menu"]');

pagina.addEventListener("change", (e) => {
  const li = e.target.closest("[data-vista]");
  if (!li || e.target.type !== "checkbox") return;
  const vista = li.dataset.vista;
  borrador.ocultas = e.target.checked ? borrador.ocultas.filter((v) => v !== vista) : [...borrador.ocultas, vista];
  li.classList.toggle("is-oculta", !e.target.checked);
});

pagina.addEventListener("click", (e) => {
  const boton = e.target.closest("[data-subir], [data-bajar]");
  if (!boton) return;
  const vista = boton.closest("[data-vista]").dataset.vista;
  borrador.arriba = boton.hasAttribute("data-subir") ? [...borrador.arriba, vista] : borrador.arriba.filter((v) => v !== vista);
  pintarPagina();
  // El foco, en la misma sección en su lugar nuevo.
  pagina.querySelector(`[data-vista="${CSS.escape(vista)}"] input`)?.focus();
});

document.getElementById("btnMenuGuardar").addEventListener("click", async () => {
  fijar(await api("/api/menu", { method: "PUT", body: borrador, error: "No se pudo guardar el menú." }));
  avisar("Listo: el menú quedó como lo armaste.", "ok");
  borrador = { arriba: [...menu.arriba], ocultas: [...menu.ocultas] };
  pintarPagina();
});

document.getElementById("btnMenuDeSiempre").addEventListener("click", async () => {
  fijar(await api("/api/menu", { method: "DELETE", error: "No se pudo volver al menú de siempre." }));
  avisar("Volvió el menú de siempre.", "ok");
  borrador = { arriba: [...menu.arriba], ocultas: [...menu.ocultas] };
  pintarPagina();
});

registrar("pintar:menu", () => {
  borrador = { arriba: [...menu.arriba], ocultas: [...menu.ocultas] };
  pintarPagina();
});
