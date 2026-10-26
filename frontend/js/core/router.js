/**
 * core/router.js
 * Router por hash: vistas, permisos de vista por rol, nav y título.
 * Movido tal cual desde app.js (CLAUDE.md §31, Etapa B / F2).
 */

import { esAdmin } from "./formato.js";
import { moduloActivo, termino } from "./negocio.js";
import { entrarEnVista } from "./registro.js";

// Vistas que pertenecen a un módulo opcional del tipo de negocio (CLAUDE.md
// §29, PERFILES_RUBRO en backend/perfiles.js): con el módulo apagado no se entra.
const MODULO_DE_VISTA = {
  pos: "pos",
  "consulta-detalle": "crm",
  presupuestos: "presupuestos",
  "presupuesto-detalle": "presupuestos",
  trabajos: "trabajos",
  "trabajo-detalle": "trabajos",
  abonos: "abonos",
  "abono-detalle": "abonos",
  compras: "compras",
  "compra-detalle": "compras",
  "devoluciones-proveedor": "compras",
  "devolucion-proveedor-detalle": "compras",
  stock: "stock",
  "reportes-stock": "stock",
  ingreso: "socios",
  socios: "socios",
  "socio-detalle": "socios",
  "planes-socio": "socios"
};

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
  productos: { titulo: "Productos", termino: "Plural", dominio: "Maestros" },
  // Con el módulo crm, la página de clientes es el CRM (hist. §91).
  clientes: { titulo: "Clientes", tituloConModulo: ["crm", "CRM"], dominio: "Maestros" },
  proveedores: { titulo: "Proveedores", dominio: "Maestros" },
  pos: { titulo: "Punto de venta", dominio: "Embudo de venta" },
  presupuestos: { titulo: "Presupuestos", dominio: "Embudo de venta" },
  trabajos: { titulo: "Trabajos", dominio: "Embudo de venta" },
  abonos: { titulo: "Abonos", dominio: "Embudo de venta" },
  ventas: { titulo: "Ventas", dominio: "Embudo de venta" },
  devoluciones: { titulo: "Devoluciones", dominio: "Embudo de venta" },
  facturas: { titulo: "Facturas", dominio: "Embudo de venta" },
  ingreso: { titulo: "Ingreso", dominio: "Socios" },
  socios: { titulo: "Socios", dominio: "Socios" },
  "planes-socio": { titulo: "Planes", dominio: "Socios" },
  compras: { titulo: "Compras", dominio: "Embudo de compra" },
  "devoluciones-proveedor": { titulo: "Devoluciones a proveedor", dominio: "Embudo de compra" },
  stock: { titulo: "Stock", dominio: "Stock" },
  "reportes-stock": { titulo: "Reportes de stock", dominio: "Stock" },
  caja: { titulo: "Caja", dominio: "Finanzas" },
  "cuentas-corrientes": { titulo: "Cuentas corrientes", dominio: "Finanzas" },
  gastos: { titulo: "Gastos", dominio: "Finanzas" },
  papelera: { titulo: "Papelera", dominio: "Papelera" },
  auditoria: { titulo: "Auditoría", dominio: "Auditoría" },
  configuracion: { titulo: "Configuración", dominio: "Administración" },

  "venta-detalle": { titulo: "Venta", dominio: "Embudo de venta", nav: "ventas", esFicha: true },
  "presupuesto-detalle": { titulo: "Presupuesto", dominio: "Embudo de venta", nav: "presupuestos", esFicha: true },
  "consulta-detalle": { titulo: "Consulta", dominio: "Maestros", nav: "clientes", esFicha: true },
  "trabajo-detalle": { titulo: "Trabajo", dominio: "Embudo de venta", nav: "trabajos", esFicha: true },
  "abono-detalle": { titulo: "Abono", dominio: "Embudo de venta", nav: "abonos", esFicha: true },
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
  "socio-detalle": { titulo: "Socio", dominio: "Socios", nav: "socios", esFicha: true },

  placeholder: { titulo: "Próximamente", dominio: "Nexo", esFicha: true }
};

// Vistas cuyo contenido depende de al menos un endpoint admin-only
// (permisos.js): dashboard (Estadísticas: GET /api/resumen), reportes-stock (GET /api/reportes/stock), papelera
// (mezcla compras/devoluciones a proveedor, ya admin, con ventas/gastos),
// todo el circuito de compras y sus devoluciones a proveedor, fichas
// incluidas, y auditoria (GET /api/auditoria, admin desde la Etapa A de
// multi-tenant — ver permisos.js). Un deep-link escrito a mano por un
// empleado (el nav-item ya está oculto por CSS, pero el hash se puede
// tipear igual) cae al mismo destino que un click normal — es solo UI, el
// servidor responde 403 igual si se llama al endpoint directo.
// Configuración no está: el empleado entra a Mi cuenta y Apariencia, y las de
// admin las filtra dominios/configuracion.js.
const VISTAS_SOLO_ADMIN = new Set([
  "dashboard",
  "reportes-stock",
  "papelera",
  "compras",
  "compra-detalle",
  "devoluciones-proveedor",
  "devolucion-proveedor-detalle",
  "auditoria",
  "planes-socio"
]);

// `subruta` es lo que va después de la vista en el hash (#/configuracion/negocio):
// la recibe el handler de alEntrarEnVista y queda en el deep-link.
export function mostrarVista(viewId, { titulo, actualizarHash = true, subruta = null } = {}) {
  // El fallback ya no puede ser "dashboard": pasó a ser admin-only (arriba).
  // "ventas" es donde arranca un empleado al loguearse (ver el boot, más
  // abajo), así que es el destino natural también acá.
  if (VISTAS_SOLO_ADMIN.has(viewId) && !esAdmin()) {
    viewId = "ventas";
  }
  if (MODULO_DE_VISTA[viewId] && !moduloActivo(MODULO_DE_VISTA[viewId])) {
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
  entrarEnVista(viewId, subruta);

  const info = VISTAS_CONSTRUIDAS[viewId];
  // `termino`: el título es el nombre del catálogo del tipo de negocio. Con un
  // deep-link el negocio llega después: el data-termino del título hace que
  // fijarNegocio() lo corrija.
  const conTermino = !titulo && info?.termino;
  const conModulo = info?.tituloConModulo && moduloActivo(info.tituloConModulo[0]);
  const tituloFinal = titulo ?? (conTermino ? termino(info.termino) : conModulo ? info.tituloConModulo[1] : info?.titulo);
  // El texto chico "RESUMEN"/"ADMINISTRACIÓN" sobre el título se sacó del
  // HTML por decisión de diseño. El campo `dominio` de VISTAS_CONSTRUIDAS se
  // conserva igual: documenta a qué dominio pertenece cada vista.
  if (tituloFinal) {
    const h1 = document.getElementById("vistaTitulo");
    h1.textContent = tituloFinal;
    if (conTermino) h1.dataset.termino = info.termino;
    else delete h1.dataset.termino;
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
    const hash = subruta ? `#/${viewId}/${subruta}` : `#/${viewId}`;
    if (location.hash !== hash) history.pushState(null, "", hash);
  }
}

// Vistas que existieron con otro nombre y se fusionaron/renombraron: un
// bookmark o un link viejo a "reportes-ventas" debe abrir Resumen en vez
// de quedar muerto. Usuarios pasó a ser una página de Configuración, y los
// planes y descuentos de socios salieron de ahí a su propia vista (hist. §76).
const VISTAS_RENOMBRADAS = {
  "reportes-ventas": "dashboard",
  usuarios: "configuracion/usuarios",
  "configuracion/planes-socio": "planes-socio",
  "configuracion/descuentos-socio": "planes-socio/descuentos",
  // "Tipo de negocio y secciones" pasó a Funciones (hist. §88).
  "configuracion/tipo": "configuracion/funciones",
  // Consultas pasó a ser parte del CRM, junto con los clientes (hist. §91).
  consultas: "clientes/consultas",
  "consultas/embudo": "clientes/consultas",
  "consultas/hoy": "clientes/hoy",
  "consultas/dejaron": "clientes/dejaron",
  "consultas/numeros": "clientes/numeros"
};

function rutaDesdeHash() {
  const ruta = (location.hash || "").replace(/^#\/?/, "");
  const [id, ...resto] = (VISTAS_RENOMBRADAS[ruta] ?? ruta).split("/");
  return { id, subruta: resto.join("/") || null };
}

// Vuelve del hash a una vista válida (no de ficha, que no alcanza para
// reconstruir cuál registro mostrar), o null si no hay nada aprovechable.
export function vistaDesdeHash() {
  const { id } = rutaDesdeHash();
  return VISTAS_CONSTRUIDAS[id] && !VISTAS_CONSTRUIDAS[id].esFicha ? id : null;
}

export const subrutaDesdeHash = () => rutaDesdeHash().subruta;

// Botón Atrás/Adelante del navegador entre vistas del nav, y los enlaces
// <a href="#/vista/subruta"> de adentro de una vista.
window.addEventListener("hashchange", () => {
  const view = vistaDesdeHash();
  if (view) mostrarVista(view, { actualizarHash: false, subruta: subrutaDesdeHash() });
});

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("sidebar").classList.remove("is-open");
    const view = item.dataset.view;
    mostrarVista(VISTAS_CONSTRUIDAS[view] ? view : "placeholder", { subruta: item.dataset.subruta ?? null });
  });
});
