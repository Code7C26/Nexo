/**
 * core/router.js
 * Router por hash: vistas, permisos de vista por rol, nav y título.
 * Movido tal cual desde app.js (CLAUDE.md §31, Etapa B / F2).
 */

import { esAdmin } from "./formato.js";
import { entrarEnVista } from "./registro.js";

// Un título y un dominio por vista, para que la topbar diga siempre
// dónde está el usuario (antes su <h1> era la fecha de hoy en las 14
// pantallas). El dominio es el mismo agrupamiento por el que ya está
// ordenado el <nav>: Resumen -> Maestros -> embudo de venta -> embudo de
// compra -> Stock -> Finanzas -> Papelera.
//
// Las vistas de ficha (no están en el nav, se abren desde una fila de
// tabla) llevan además "nav" — qué ítem del menú se marca activo — y
// "esFicha", que le dice a mostrarVista() que no actualice el hash: el
// nombre de la vista solo no alcanza para reconstruir cuál registro
// mostrar, así que no tiene sentido ofrecerla como deep-link. Su título
// genérico ("Venta") lo reemplaza abrirFicha*() por el real ("Venta #37")
// apenas sabe qué registro es.
const VISTAS_CONSTRUIDAS = {
  dashboard: { titulo: "Resumen", dominio: "Resumen" },
  productos: { titulo: "Productos", dominio: "Maestros" },
  clientes: { titulo: "Clientes", dominio: "Maestros" },
  proveedores: { titulo: "Proveedores", dominio: "Maestros" },
  presupuestos: { titulo: "Presupuestos", dominio: "Embudo de venta" },
  ventas: { titulo: "Ventas", dominio: "Embudo de venta" },
  devoluciones: { titulo: "Devoluciones", dominio: "Embudo de venta" },
  facturas: { titulo: "Facturas", dominio: "Embudo de venta" },
  compras: { titulo: "Compras", dominio: "Embudo de compra" },
  "devoluciones-proveedor": { titulo: "Devoluciones a proveedor", dominio: "Embudo de compra" },
  stock: { titulo: "Stock", dominio: "Stock" },
  "reportes-stock": { titulo: "Reportes de stock", dominio: "Stock" },
  caja: { titulo: "Caja", dominio: "Finanzas" },
  "cuentas-corrientes": { titulo: "Cuentas corrientes", dominio: "Finanzas" },
  gastos: { titulo: "Gastos", dominio: "Finanzas" },
  papelera: { titulo: "Papelera", dominio: "Papelera" },
  auditoria: { titulo: "Auditoría", dominio: "Auditoría" },
  usuarios: { titulo: "Usuarios", dominio: "Administración" },

  "venta-detalle": { titulo: "Venta", dominio: "Embudo de venta", nav: "ventas", esFicha: true },
  "presupuesto-detalle": { titulo: "Presupuesto", dominio: "Embudo de venta", nav: "presupuestos", esFicha: true },
  "devolucion-detalle": { titulo: "Devolución", dominio: "Embudo de venta", nav: "devoluciones", esFicha: true },
  "factura-detalle": { titulo: "Factura", dominio: "Embudo de venta", nav: "facturas", esFicha: true },
  "compra-detalle": { titulo: "Compra", dominio: "Embudo de compra", nav: "compras", esFicha: true },
  "devolucion-proveedor-detalle": {
    titulo: "Devolución a proveedor",
    dominio: "Embudo de compra",
    nav: "devoluciones-proveedor",
    esFicha: true
  },
  "producto-detalle": { titulo: "Producto", dominio: "Maestros", nav: "productos", esFicha: true },
  "cliente-detalle": { titulo: "Cliente", dominio: "Maestros", nav: "clientes", esFicha: true },
  "proveedor-detalle": { titulo: "Proveedor", dominio: "Maestros", nav: "proveedores", esFicha: true },

  placeholder: { titulo: "Próximamente", dominio: "Nexo", esFicha: true }
};

// Vistas cuyo contenido depende de al menos un endpoint admin-only
// (permisos.js): Usuarios (administración), dashboard (Estadísticas:
// GET /api/resumen), reportes-stock (GET /api/reportes/stock), papelera
// (mezcla compras/devoluciones a proveedor, ya admin, con ventas/gastos),
// todo el circuito de compras y sus devoluciones a proveedor, fichas
// incluidas, y auditoria (GET /api/auditoria, admin desde la Etapa A de
// multi-tenant — ver permisos.js). Un deep-link escrito a mano por un
// empleado (el nav-item ya está oculto por CSS, pero el hash se puede
// tipear igual) cae al mismo destino que un click normal — es solo UI, el
// servidor responde 403 igual si se llama al endpoint directo.
const VISTAS_SOLO_ADMIN = new Set([
  "usuarios",
  "dashboard",
  "reportes-stock",
  "papelera",
  "compras",
  "compra-detalle",
  "devoluciones-proveedor",
  "devolucion-proveedor-detalle",
  "auditoria"
]);

export function mostrarVista(viewId, { titulo, actualizarHash = true } = {}) {
  // El fallback ya no puede ser "dashboard": pasó a ser admin-only (arriba).
  // "ventas" es donde arranca un empleado al loguearse (ver el boot, más
  // abajo), así que es el destino natural también acá.
  if (VISTAS_SOLO_ADMIN.has(viewId) && !esAdmin()) {
    viewId = "ventas";
  }

  document.querySelectorAll(".view").forEach((sec) => {
    sec.hidden = sec.dataset.view !== viewId;
  });

  // Excepción deliberada al patrón "todo se carga una vez al bootear"
  // (ver la cadena de Promise.all al final de este archivo): Auditoría
  // cambia con CUALQUIER mutación del sistema (~40 puntos distintos), así
  // que engancharla a cada una ensuciaría demasiado. Al ser una vista de
  // consulta ocasional (no un panel que se mira mientras se opera), se
  // carga al entrar en vez de al bootear — cubre nav click, deep-link
  // (F5) y el botón Atrás/Adelante porque los tres pasan por acá. El
  // botón "Actualizar" del panel (ver activarAuditoria) cubre lo que
  // cambió mientras la vista ya estaba abierta.
  // Misma excepción y mismo motivo que Auditoría arriba: es
  // administración ocasional, no un panel que se mira mientras se opera.
  // No entra en la cadena de Promise.all del boot (más abajo en este
  // archivo) a propósito — un empleado recibiría 403 en cada arranque si
  // estuviera ahí.
  // Qué vistas cargan al entrar lo registra app.js con alEntrarEnVista().
  entrarEnVista(viewId);

  const info = VISTAS_CONSTRUIDAS[viewId];
  const tituloFinal = titulo ?? info?.titulo;
  // El elemento #vistaEyebrow (el texto chico "RESUMEN"/"ADMINISTRACIÓN"
  // sobre el título) se sacó del HTML por decisión de diseño. El campo
  // `dominio` de VISTAS_CONSTRUIDAS se conserva igual: sigue documentando
  // a qué dominio pertenece cada vista, aunque ya no se pinte en pantalla.
  // El optional chaining evita romper acá si el elemento no existe.
  if (info) {
    const eyebrow = document.getElementById("vistaEyebrow");
    if (eyebrow) eyebrow.textContent = info.dominio;
  }
  if (tituloFinal) {
    document.getElementById("vistaTitulo").textContent = tituloFinal;
    document.title = `${tituloFinal} · Nexo`;
  }

  // El nav marca activo el ítem de la vista, o el de la lista de la que
  // salió una ficha (ver "nav" en VISTAS_CONSTRUIDAS): mirando la ficha
  // de una venta, "Ventas" se mantiene resaltado en vez de apagarse.
  const navObjetivo = info?.nav ?? viewId;
  document.querySelectorAll(".nav-item").forEach((item) => {
    const activo = item.dataset.view === navObjetivo;
    item.classList.toggle("is-active", activo);
    if (activo) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });

  // Deep-link: F5 o el botón Atrás vuelven a esta misma pantalla. Las
  // fichas quedan afuera (ver "esFicha" arriba); actualizarHash en false
  // lo pasa quien ya está respondiendo a un cambio de hash, para no
  // generar un loop de escritura.
  if (actualizarHash && info && !info.esFicha) {
    const hash = `#/${viewId}`;
    if (location.hash !== hash) history.pushState(null, "", hash);
  }
}

// Vistas que existieron con otro nombre y se fusionaron/renombraron: un
// bookmark o un link viejo a "reportes-ventas" debe abrir Resumen en vez
// de quedar muerto.
const VISTAS_RENOMBRADAS = { "reportes-ventas": "dashboard" };

// Vuelve del hash a una vista válida (no de ficha, que no alcanza para
// reconstruir cuál registro mostrar), o null si no hay nada aprovechable.
export function vistaDesdeHash() {
  const id = (location.hash || "").replace(/^#\/?/, "");
  const idResuelto = VISTAS_RENOMBRADAS[id] ?? id;
  return VISTAS_CONSTRUIDAS[idResuelto] && !VISTAS_CONSTRUIDAS[idResuelto].esFicha ? idResuelto : null;
}

// Botón Atrás/Adelante del navegador entre vistas del nav.
window.addEventListener("hashchange", () => {
  const view = vistaDesdeHash();
  if (view) mostrarVista(view, { actualizarHash: false });
});

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("sidebar").classList.remove("is-open");
    const view = item.dataset.view;
    mostrarVista(VISTAS_CONSTRUIDAS[view] ? view : "placeholder");
  });
});
