/**
 * core/negocio.js
 * Datos del negocio en memoria (membrete de los comprobantes).
 * Movido tal cual desde app.js (CLAUDE.md §31, Etapa B / F2).
 */

// Los carga cargarNegocio() (Configuración) y los lee core/comprobante.js para
// el membrete. Un binding importado no se puede reasignar desde otro módulo,
// así que el dueño del dato lo fija con fijarNegocio().
export let negocio = {};

export function fijarNegocio(datos) {
  negocio = datos;
}
