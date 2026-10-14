/**
 * core/iconos.js
 * Íconos de la interfaz: un sprite SVG propio (frontend/img/iconos.svg, con
 * los íconos de Lucide que usa Nexo) en vez de una librería o un CDN. Sin
 * dependencia ni build step, y el navegador lo cachea una sola vez.
 *
 * El ícono es decorativo (aria-hidden): el botón o el texto que lo acompaña
 * es el que lleva el nombre accesible. Un botón que solo tiene ícono
 * necesita su propio aria-label.
 */

export const SPRITE_ICONOS = "/img/iconos.svg";

// `nombre` es siempre un literal del código (el id de un <symbol> del
// sprite), nunca un dato del usuario: por eso no pasa por esc().
export function icono(nombre, clase = "") {
  const clases = clase ? `ico ${clase}` : "ico";
  return `<svg class="${clases}" aria-hidden="true" focusable="false"><use href="${SPRITE_ICONOS}#${nombre}"></use></svg>`;
}
