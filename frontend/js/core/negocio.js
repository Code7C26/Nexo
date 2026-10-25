/**
 * core/negocio.js
 * Datos del negocio en memoria (membrete de los comprobantes).
 * Movido tal cual desde app.js (CLAUDE.md §31, Etapa B / F2).
 */

// Los carga cargarNegocio() (Configuración) y los lee core/comprobante.js para
// el membrete. Un binding importado no se puede reasignar desde otro módulo,
// así que el dueño del dato lo fija con fijarNegocio().
export let negocio = {};

// Los módulos activos del tipo de negocio (CLAUDE.md §29) van también a
// <html data-modulos>, que es lo que lee el CSS para ocultar secciones del
// menú y el router para no entrar a una vista apagada.
//
// También pone el nombre del catálogo en cada [data-termino] del HTML.
export function fijarNegocio(datos) {
  negocio = datos;
  document.documentElement.dataset.modulos = (datos.modulos ?? []).join(" ");
  pintarTerminos();
}

// Qué tipos hay cargados en el catálogo ("producto", "servicio"): los fija
// app.js cada vez que trae los productos.
let tiposDelCatalogo = new Set();
export function fijarTiposDelCatalogo(tipos) {
  tiposDelCatalogo = new Set(tipos);
  pintarTerminos();
}

// Avisa con "nexo:catalogo", por si alguien arma textos con termino() fuera
// de un [data-termino] (las pestañas de Productos).
function pintarTerminos() {
  document.querySelectorAll("[data-termino]").forEach((el) => {
    el.textContent = termino(el.dataset.termino);
  });
  document.dispatchEvent(new CustomEvent("nexo:catalogo"));
}

// Cómo se llama lo que vende el negocio (hist. §88): sale de lo que tiene
// cargado, para que nada se renombre por tocar una opción. Solo productos o
// solo servicios, esa palabra; los dos, "productos y servicios". Con el
// catálogo vacío, el nombre que trae el tipo de negocio
// (PERFILES_RUBRO.catalogo en backend/perfiles.js). La clave en mayúscula da
// la palabra en mayúscula: "Plural" es "Servicios" y "singular", "servicio".
const CATALOGO_POR_DEFECTO = { plural: "productos", singular: "producto" };
const CATALOGOS = {
  producto: CATALOGO_POR_DEFECTO,
  servicio: { plural: "servicios", singular: "servicio" },
  mixto: { plural: "productos y servicios", singular: "producto o servicio" }
};
export const catalogoMixto = () => tiposDelCatalogo.size > 1;

function catalogo() {
  if (catalogoMixto()) return CATALOGOS.mixto;
  if (tiposDelCatalogo.size === 1) return CATALOGOS[[...tiposDelCatalogo][0]] ?? CATALOGO_POR_DEFECTO;
  return negocio.catalogo ?? CATALOGO_POR_DEFECTO;
}

function palabraDe(catalogoElegido, clave) {
  const palabra = catalogoElegido[clave.toLowerCase()] ?? clave;
  return clave[0] === clave[0].toUpperCase() ? palabra[0].toUpperCase() + palabra.slice(1) : palabra;
}

export const termino = (clave) => palabraDe(catalogo(), clave);

// La palabra de un tipo puntual ("producto" o "servicio"), para lo que es de
// uno solo: las pestañas de Productos, el modal de un servicio.
export const terminoDeTipo = (tipo, clave = "singular") => palabraDe(CATALOGOS[tipo] ?? CATALOGO_POR_DEFECTO, clave);

export const moduloActivo = (modulo) => {
  const modulos = document.documentElement.dataset.modulos;
  // Todavía sin cargar: no se bloquea nada (el router corre antes que el fetch).
  return modulos === undefined || modulos.split(" ").includes(modulo);
};
