/**
 * core/barra-inferior.js
 * La barra de abajo del celular (hist. §95, docs/investigacion-celular.md):
 * cuatro secciones de uso diario y "Más", que abre el menú completo (el
 * cajón de siempre, con el selector de negocio y todas las secciones).
 *
 * Los destinos salen del menú lateral: de PRIORIDAD, los primeros que ese
 * menú muestra para el negocio y el rol (módulos apagados y pantallas de
 * admin ya están ocultos ahí). No mira el tipo de negocio (CLAUDE.md §29): un
 * comercio que prende Socios ve Socios. Tocar un destino es tocar su ítem
 * del menú, así que navega exactamente igual.
 *
 * En la compu la barra no se ve (styles.css) y no se pinta.
 */

import { esc } from "./formato.js";
import { icono } from "./iconos.js";

// Quedan así: comercio, Resumen · Vender · Ventas · Productos; gimnasio,
// Resumen · Ingreso · Socios · Vender; servicios, Resumen · Trabajos · Ventas
// · Servicios. El empleado no tiene Resumen y entra el siguiente.
const PRIORIDAD = ["dashboard", "ingreso", "socios", "pos", "trabajos", "ventas", "productos", "clientes"];
const LUGARES = 4;
// En la barra entra una palabra: "Punto de venta" se dice "Vender", y el
// catálogo con productos y servicios, "Catálogo".
const CORTOS = { pos: "Vender" };

const barra = document.getElementById("barraInferior");
const sidebar = document.getElementById("sidebar");
const celular = window.matchMedia("(max-width: 860px)");

function texto(item) {
  if (CORTOS[item.dataset.view]) return CORTOS[item.dataset.view];
  // innerText respeta lo oculto por CSS (CRM o Clientes, según el módulo).
  const largo = item.innerText.trim();
  return item.dataset.view === "productos" && largo.includes(" ") ? "Catálogo" : largo;
}

function visible(item) {
  return item.checkVisibility ? item.checkVisibility() : item.offsetParent !== null;
}

let firma = "";

function pintar() {
  if (!celular.matches) return;
  const items = PRIORIDAD.map((v) => sidebar.querySelector(`.nav-item[data-view="${v}"]`))
    .filter((item) => item && visible(item))
    .slice(0, LUGARES);
  const destinos = items.map((item) => ({
    vista: item.dataset.view,
    texto: texto(item),
    icono: item.querySelector("use")?.getAttribute("href") ?? ""
  }));
  // Se vuelve a armar solo si cambiaron los destinos (el observer de abajo
  // salta por cualquier cambio del menú). Lo activo se marca aparte, sin
  // rearmar: así "Más" no pierde el foco al abrir el cajón.
  const nueva = JSON.stringify(destinos);
  if (nueva !== firma) {
    firma = nueva;
    barra.innerHTML =
      destinos
        .map(
          (d) => `<a href="#/${esc(d.vista)}" class="barra-inferior-item" data-view="${esc(d.vista)}">
            <svg class="ico" aria-hidden="true"><use href="${esc(d.icono)}"></use></svg><span>${esc(d.texto)}</span>
          </a>`
        )
        .join("") +
      `<button type="button" class="barra-inferior-item" id="barraMas" aria-controls="sidebar" aria-expanded="false">
        ${icono("menu")}<span>Más</span>
      </button>`;
  }

  const abierto = sidebar.classList.contains("is-open");
  const activo = abierto ? null : sidebar.querySelector(".nav-item.is-active")?.dataset.view;
  for (const enlace of barra.querySelectorAll("a.barra-inferior-item")) {
    const es = enlace.dataset.view === activo;
    enlace.classList.toggle("is-active", es);
    if (es) enlace.setAttribute("aria-current", "page");
    else enlace.removeAttribute("aria-current");
  }
  const mas = document.getElementById("barraMas");
  mas.classList.toggle("is-active", abierto);
  mas.setAttribute("aria-expanded", String(abierto));
}

barra.addEventListener("click", (e) => {
  const destino = e.target.closest(".barra-inferior-item");
  if (!destino) return;
  e.preventDefault();
  if (destino.id === "barraMas") {
    sidebar.classList.toggle("is-open");
    return;
  }
  // El click del ítem del menú: cierra el cajón y navega con su subruta.
  [...sidebar.querySelectorAll(".nav-item")].find((item) => item.dataset.view === destino.dataset.view)?.click();
});

// Con el cajón abierto, tocar afuera lo cierra (y ese toque no hace nada más:
// era para cerrar). El menú de negocios se muda al <body> (dominios/
// negocios.js) y los modales que se abren desde el cajón no cuentan como afuera.
document.addEventListener(
  "click",
  (e) => {
    if (!celular.matches || !sidebar.classList.contains("is-open")) return;
    if (e.target.closest("#sidebar, #barraMas, #navToggle, .negocio-menu, .modal")) return;
    e.preventDefault();
    e.stopPropagation();
    sidebar.classList.remove("is-open");
  },
  true
);

// Cambian los destinos con los módulos, el rol, el nombre del catálogo y la
// sección activa (todo eso vive en el menú o en <html>).
let pendiente = false;
function repintar() {
  if (pendiente) return;
  pendiente = true;
  requestAnimationFrame(() => {
    pendiente = false;
    pintar();
  });
}
new MutationObserver(repintar).observe(sidebar, {
  subtree: true,
  childList: true,
  characterData: true,
  attributes: true,
  attributeFilter: ["class"]
});
new MutationObserver(repintar).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-modulos", "data-rol"]
});
celular.addEventListener("change", () => {
  firma = "";
  pintar();
});
pintar();
