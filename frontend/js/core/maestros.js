/**
 * core/maestros.js
 * Maestros que leen varios dominios (cuentas de tesorería, proveedores).
 * Movido tal cual desde app.js (CLAUDE.md §31, Etapa B / F5).
 */

// Mismo criterio que core/negocio.js: un binding importado no se puede
// reasignar desde otro módulo, así que cada dueño fija el suyo con fijarX()
// y los demás lo leen importándolo.

/* ---------- Cuentas de tesorería ---------- */

// Las llena cargarCaja() con fijarCuentasTesoreria(): ese endpoint devuelve
// las cuentas con su saldo, que es un superconjunto de lo que necesitan los
// selects de Cobrar, Pagar y Gastos, así que alcanza con una carga.
export let cuentasTesoreria = [];

export function fijarCuentasTesoreria(lista) {
  cuentasTesoreria = lista;
}

export function poblarSelectCuentas(select, seleccionada = null) {
  select.innerHTML = cuentasTesoreria.map((c) => `<option value="${c.id}">${c.nombre}</option>`).join("");
  if (seleccionada !== null) select.value = seleccionada;
}

/* ---------- Proveedores ---------- */

// Los llena cargarProveedores() con fijarProveedores().
export let proveedores = [];

export function fijarProveedores(lista) {
  proveedores = lista;
}
