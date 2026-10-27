// Planes de Nexo (hist. §98): qué paga cada negocio y hasta dónde llega. Viven
// acá, como los tipos de negocio en perfiles.js, para que server.js, la
// migración de db/index.js y scripts/plan.mjs lean la misma lista. La landing y
// el alta la piden por GET /api/auth/planes: un precio se cambia solo acá.
//
// Todos los planes tienen todas las funciones: los separan los topes, nunca
// un módulo apagado. Los topes son por negocio. `null` es sin tope. Qué cuenta en cada uno lo
// decide usoDelPlan() en server.js:
// - usuarios: los activos en el negocio;
// - negocios: si se pueden sumar negocios desde este (solo Pro);
// - productos: los activos, servicios incluidos;
// - ventas_mes: las ventas del mes, sin anular, que cargó una persona (las
//   cuotas de socios y abonos que se generan solas no cuentan).
//
// Decisión del usuario del 27 de octubre de 2026: Gratis, Emprendedor a
// $ 19.900 y Pro a $ 34.900 por mes. Los topes de Emprendedor y la prueba de
// 14 días son un default del mercado, anotados en handoff.md para revisar.
// `muy_pronto` es lo que el plan va a incluir y todavía no existe: la landing
// lo muestra aparte, para no prometer algo que no está hecho.
export const PLANES = {
  gratis: {
    nombre: 'Gratis',
    precio: 0,
    descripcion: 'Para empezar: anotá lo que vendés y mirá cuánto ganás.',
    incluye: [
      'Todas las funciones: ventas, caja, stock, CRM y punto de venta',
      'Hasta 100 productos o servicios',
      'Hasta 300 ventas por mes',
      'Un usuario',
      'En el celular y en la compu'
    ],
    muy_pronto: [],
    usuarios: 1,
    negocios: 1,
    productos: 100,
    ventas_mes: 300,
    marca: true
  },
  emprendedor: {
    nombre: 'Emprendedor',
    precio: 19900,
    descripcion: 'Para el negocio que ya vende todos los días.',
    incluye: [
      'Todo lo de Gratis',
      'Productos y ventas sin tope',
      'Hasta 3 usuarios, cada uno con su rol',
      'Comprobantes sin la marca de Nexo'
    ],
    muy_pronto: [],
    usuarios: 3,
    negocios: 1,
    productos: null,
    ventas_mes: null,
    marca: false
  },
  pro: {
    nombre: 'Pro',
    precio: 34900,
    descripcion: 'Para la pyme con equipo o con más de un local.',
    incluye: ['Todo lo de Emprendedor', 'Usuarios sin tope', 'Varios negocios con la misma cuenta'],
    muy_pronto: ['Factura electrónica de ARCA', 'Mercado Libre y Tienda Nube'],
    usuarios: null,
    negocios: null,
    productos: null,
    ventas_mes: null,
    marca: false
  }
};
export const PLAN_POR_DEFECTO = 'gratis';
export const DIAS_PRUEBA = 14;

export const esPlan = (clave) => Object.hasOwn(PLANES, clave ?? '');

// El plan que rige hoy: el guardado mientras no venza, y Gratis después. Una
// clave desconocida es Gratis. `hoy` es AAAA-MM-DD (fechaDeHoy()), comparable
// como texto con plan_vence.
export function planEfectivo({ plan, plan_vence }, hoy) {
  if (!esPlan(plan)) return PLAN_POR_DEFECTO;
  if (plan_vence && plan_vence < hoy) return PLAN_POR_DEFECTO;
  return plan;
}

// El primer plan, en orden de precio, que permite más de `cantidad` de
// `recurso`: lo nombra el aviso cuando se llega a un tope.
export function planQuePermite(recurso, cantidad) {
  return Object.keys(PLANES).find((clave) => PLANES[clave][recurso] === null || PLANES[clave][recurso] > cantidad);
}
