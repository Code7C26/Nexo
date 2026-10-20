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
// También pone el nombre del catálogo del tipo ("Servicios" en vez de
// "Productos", hist. §78) en cada [data-termino] del HTML.
export function fijarNegocio(datos) {
  negocio = datos;
  document.documentElement.dataset.modulos = (datos.modulos ?? []).join(" ");
  document.querySelectorAll("[data-termino]").forEach((el) => {
    el.textContent = termino(el.dataset.termino);
  });
}

// Cómo se llama lo que vende el negocio (PERFILES_RUBRO.catalogo en
// server.js). La clave en mayúscula da la palabra en mayúscula: "Plural" es
// "Servicios" y "singular", "servicio".
const CATALOGO_POR_DEFECTO = { plural: "productos", singular: "producto" };
export function termino(clave) {
  const palabra = (negocio.catalogo ?? CATALOGO_POR_DEFECTO)[clave.toLowerCase()] ?? clave;
  return clave[0] === clave[0].toUpperCase() ? palabra[0].toUpperCase() + palabra.slice(1) : palabra;
}

export const moduloActivo = (modulo) => {
  const modulos = document.documentElement.dataset.modulos;
  // Todavía sin cargar: no se bloquea nada (el router corre antes que el fetch).
  return modulos === undefined || modulos.split(" ").includes(modulo);
};
