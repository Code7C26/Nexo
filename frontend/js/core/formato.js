/**
 * core/formato.js
 * Formato, rol y helpers de presentación compartidos por todas las vistas.
 * Movido tal cual desde app.js (CLAUDE.md §31, Etapa B / F2).
 */

// Guarda contra `null`/`undefined`: con el filtrado de campos sensibles por
// rol (permisos por rol, backend/server.js) un empleado puede recibir un
// producto sin `precio_costo` o una venta sin `margen` — sin este chequeo
// `n.toLocaleString` explota adentro del template literal que arma la fila
// de la tabla, y la excepción se lleva puesto el render entero (no queda
// "vacío", no se dibuja nada). Con la guarda degrada a un guion.
export const money = (n) =>
  n == null
    ? "—"
    : n.toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });

export const numero = (n) => (n == null ? "—" : n.toLocaleString("es-AR"));

// sesion.js escribe data-rol en <html> antes de inyectar este archivo (ver
// escribirDatosUsuario en sesion.js), así que ya está disponible en la
// primera línea que corre acá. Es la misma fuente que ya usa styles.css
// (:root:not([data-rol="admin"])) para esconder por CSS — esta función es
// el equivalente en JS, para las decisiones que no se pueden resolver con
// una regla de CSS (no hacer el fetch, no emitir el link, elegir la vista
// de fallback).
export const esAdmin = () => document.documentElement.dataset.rol === "admin";

// Los CSV son datos armados en JS, no DOM: `.col-admin` no les sirve. Las
// columnas de costo/margen de un array COLUMNAS_CSV_X se marcan con
// `admin: true`, y esto filtra esa marca al momento de exportar (no antes:
// el rol puede no estar listo todavía si se evaluara al definir el array a
// nivel de módulo). Sin este filtro un empleado se exporta una columna con
// el valor real igual — el filtrado del backend (permisos por rol) no
// interviene acá porque el array ya vive en el objeto que llegó por fetch.
export const columnasVisibles = (columnas) => (esAdmin() ? columnas : columnas.filter((c) => !c.admin));

export const hoyISO = () => new Date().toLocaleDateString("sv-SE"); // formato AAAA-MM-DD, para <input type="date">

// Versión abreviada de money(), para las etiquetas del eje del gráfico de
// evolución: "$450.000,00" no entra en la canaleta angosta del eje.
// Conserva el signo.
export function moneyCorto(n) {
  const signo = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${signo}$${(abs / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 })}M`;
  if (abs >= 1e3) return `${signo}$${Math.round(abs / 1e3)}k`;
  return `${signo}$${Math.round(abs)}`;
}

export const ICONO_TACHO =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/>' +
  '<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
  '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>' +
  '<line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

const ICONO_LAPIZ =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M12 20h9"/>' +
  '<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

// Botón de editar que va en una fila de tabla. Se usa igual en Productos,
// Clientes y Proveedores para que sea una sola convención: el click en la
// fila abre la ficha completa, el lápiz va directo al modal de edición.
export const botonEditarFila = (clase, id, que) =>
  `<button type="button" class="btn-icon ${clase}" data-id="${id}" title="Editar ${que}" aria-label="Editar ${que}">${ICONO_LAPIZ}</button>`;

// Escapa lo que va al HTML de la hoja. Los datos vienen de la base (nombres de
// cliente, productos, notas del negocio), así que un nombre con "<" rompería
// el markup si se interpolara crudo.
export function esc(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
