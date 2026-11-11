// Planes de Nexo (hist. §98): qué paga cada negocio y hasta dónde llega. Viven
// acá, como los tipos de negocio en perfiles.js, para que server.js, la
// migración de db/index.js y scripts/plan.mjs lean la misma lista. La landing y
// el alta la piden por GET /api/auth/planes: un precio se cambia solo acá.
//
// Los planes se separan por los topes, y por dos grupos de funciones:
// - `asistente` (cargar por texto, voz o WhatsApp, y la compra desde la foto
//   de la factura), solo en Pro: decisión del usuario del 8 de noviembre,
//   porque la IA tiene un cupo que se paga y es lo que más vale; las
//   respuestas del manual, que no usan IA, son de todos;
// - `integraciones` (Tienda Nube, Mercado Libre, Mercado Pago y la factura
//   electrónica de ARCA), desde Emprendedor: decisión del usuario del 10 de
//   noviembre. Los comprobantes internos son de todos. Un negocio que baja a
//   Gratis no pierde lo conectado: queda en pausa hasta que vuelva a un plan
//   que lo incluya (planPermite en server.js).
// Los topes son por
// negocio. `null` es sin tope. Qué cuenta en cada uno lo decide usoDelPlan()
// en server.js:
// - usuarios: los activos en el negocio;
// - negocios: si se pueden sumar negocios desde este (solo Pro);
// - productos: los activos, servicios incluidos;
// - ventas_mes: las ventas del mes, sin anular, que cargó una persona (las
//   cuotas de socios y abonos que se generan solas no cuentan, ni las de
//   antes de empezar con Nexo, handoff 8c).
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
      'Punto de venta, stock, caja, cuentas corrientes y CRM',
      'Comprobantes en PDF, con la marca de Nexo',
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
    marca: true,
    asistente: false,
    integraciones: false
  },
  emprendedor: {
    nombre: 'Emprendedor',
    precio: 19900,
    descripcion: 'Para el negocio que ya vende todos los días.',
    incluye: [
      'Todo lo de Gratis',
      'Productos y ventas sin tope',
      'Hasta 3 usuarios, cada uno con su rol',
      'Factura electrónica con CAE de ARCA (por ahora emite facturas de prueba)',
      'Tienda Nube, Mercado Libre y Mercado Pago conectados',
      'Comprobantes sin la marca de Nexo'
    ],
    muy_pronto: [],
    usuarios: 3,
    negocios: 1,
    productos: null,
    ventas_mes: null,
    marca: false,
    asistente: false,
    integraciones: true
  },
  pro: {
    nombre: 'Pro',
    precio: 34900,
    descripcion: 'Para la pyme con equipo o con más de un local.',
    incluye: [
      'Todo lo de Emprendedor',
      'Asistente con IA: cargá ventas, compras y gastos por texto o voz',
      'Compras cargadas desde la foto de la factura del proveedor',
      'Usuarios sin tope',
      'Varios negocios con la misma cuenta'
    ],
    // WhatsApp está hecho pero espera la app de Meta (handoff): hasta que un
    // negocio lo pueda vincular de verdad, va como "muy pronto".
    muy_pronto: ['El asistente por WhatsApp'],
    usuarios: null,
    negocios: null,
    productos: null,
    ventas_mes: null,
    marca: false,
    asistente: true,
    integraciones: true
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
