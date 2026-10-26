// Tipos de negocio (CLAUDE.md §29): cada uno es un preset de datos —con qué
// unidad y tipo nace un producto nuevo, y qué módulos trae al crearse—, nunca
// un camino de código propio. Los módulos son las secciones opcionales del
// menú; el núcleo (productos, clientes, ventas, caja, cuentas corrientes,
// gastos) se ve siempre. Ocultar un módulo es de la interfaz: los permisos
// siguen siendo los de permisos.js.
//
// Viven acá y no en server.js para que db/index.js también los lea: la
// migración de hist. §88 deja guardados los módulos de cada empresa.
//
// `descripcion` e `icono` (id del sprite del frontend) son lo que muestran las
// tarjetas del alta guiada y de Configuración: viven acá para que la lista de
// tipos esté en un solo lugar. `catalogo` es cómo se llama la sección de lo que
// se vende mientras no hay nada cargado (hist. §78, §88); sin él, "productos".
// `etapas_crm` son las etapas abiertas con que nace el embudo de consultas
// (hist. §89); Ganada y Perdida son comunes a todos y no se listan.
export const MODULOS = ['pos', 'crm', 'presupuestos', 'trabajos', 'abonos', 'compras', 'stock', 'socios'];
export const MODULOS_INFO = {
  pos: { nombre: 'Punto de venta', descripcion: 'Cobrá en el mostrador, con lector de códigos y turno de caja.', icono: 'scan-barcode' },
  crm: { nombre: 'Consultas', descripcion: 'Los que preguntan y todavía no compraron: de dónde llegaron, en qué quedó y qué falta hacer.', icono: 'funnel' },
  presupuestos: { nombre: 'Presupuestos', descripcion: 'Armá presupuestos y pasalos a venta cuando te los aceptan.', icono: 'file-text' },
  trabajos: { nombre: 'Trabajos', descripcion: 'Lo que tenés que hacer para cada cliente: cuándo, quién y, al terminar, la venta.', icono: 'clipboard-list' },
  abonos: { nombre: 'Abonos', descripcion: 'Servicios que tus clientes pagan todos los meses, con la cuota que se arma sola.', icono: 'repeat' },
  compras: { nombre: 'Compras', descripcion: 'Lo que le comprás a tus proveedores y lo que les debés.', icono: 'truck' },
  stock: { nombre: 'Stock', descripcion: 'Cuánto tenés de cada producto, en uno o en varios depósitos.', icono: 'warehouse' },
  socios: { nombre: 'Socios y cuotas', descripcion: 'Planes, cuotas que se generan solas y control de ingreso en la recepción.', icono: 'id-card' }
};
export const PERFILES_RUBRO = {
  comercio: {
    nombre: 'Comercio general',
    descripcion: 'Ropa, ferretería, librería o regalería: productos con talles, colores y códigos.',
    icono: 'store',
    unidad_defecto: 'unidad',
    tipo_defecto: 'producto',
    modulos: ['pos', 'crm', 'presupuestos', 'compras', 'stock'],
    etapas_crm: ['Consulta', 'Presupuesto enviado', 'Negociación']
  },
  carniceria: {
    nombre: 'Carnicería',
    descripcion: 'Cortes y fiambres por kilo, con venta rápida en el mostrador.',
    icono: 'beef',
    unidad_defecto: 'kg',
    tipo_defecto: 'producto',
    modulos: ['pos', 'compras', 'stock'],
    etapas_crm: ['Consulta', 'Presupuesto enviado', 'Negociación']
  },
  verduleria: {
    nombre: 'Verdulería',
    descripcion: 'Frutas y verduras por kilo o por unidad.',
    icono: 'carrot',
    unidad_defecto: 'kg',
    tipo_defecto: 'producto',
    modulos: ['pos', 'compras', 'stock'],
    etapas_crm: ['Consulta', 'Presupuesto enviado', 'Negociación']
  },
  kiosco: {
    nombre: 'Kiosco / almacén',
    descripcion: 'Golosinas, bebidas y almacén, cobrando rápido con el lector.',
    icono: 'cup-soda',
    unidad_defecto: 'unidad',
    tipo_defecto: 'producto',
    modulos: ['pos', 'compras', 'stock'],
    etapas_crm: ['Consulta', 'Presupuesto enviado', 'Negociación']
  },
  servicios: {
    nombre: 'Servicios',
    descripcion: 'Presupuestos, agenda de trabajos y abonos mensuales, sin manejar stock.',
    icono: 'briefcase',
    unidad_defecto: 'unidad',
    tipo_defecto: 'servicio',
    catalogo: { plural: 'servicios', singular: 'servicio' },
    modulos: ['crm', 'presupuestos', 'trabajos', 'abonos'],
    etapas_crm: ['Consulta', 'Visita o relevamiento', 'Presupuesto enviado']
  },
  // Un gimnasio también compra y vende productos (hist. §71): es un comercio
  // al que se le suman los socios y sus cuotas (hist. §74).
  gimnasio: {
    nombre: 'Gimnasio',
    descripcion: 'Socios con planes, cuotas e ingreso en la recepción, y venta de suplementos, bebidas y ropa.',
    icono: 'dumbbell',
    unidad_defecto: 'unidad',
    tipo_defecto: 'producto',
    modulos: ['pos', 'crm', 'compras', 'stock', 'socios'],
    etapas_crm: ['Consulta', 'Clase de prueba', 'Seguimiento']
  }
};
export const RUBRO_POR_DEFECTO = 'comercio';
export const CATALOGO_POR_DEFECTO = { plural: 'productos', singular: 'producto' };
// Se muestran en el alta con "Próximamente", pero no se pueden elegir: cada uno
// espera su módulo (turnos, mesas y comandas), que se va a poder sumar a
// cualquier negocio (CLAUDE.md §29).
export const RUBROS_PROXIMAMENTE = {
  peluqueria: { nombre: 'Barbería / peluquería', descripcion: 'Turnos con calendario y recordatorios a tus clientes.', icono: 'scissors' },
  restaurante: { nombre: 'Restaurante / bar', descripcion: 'Mesas, comandas y pedidos a la cocina.', icono: 'utensils' }
};

// Los módulos del tipo, como se guardan en organizaciones.modulos (en el orden
// de MODULOS, separados por espacios). Un tipo desconocido es comercio, igual
// que en perfilDeEmpresa() de server.js.
export function modulosDelPreset(rubro) {
  const perfil = PERFILES_RUBRO[Object.hasOwn(PERFILES_RUBRO, rubro ?? '') ? rubro : RUBRO_POR_DEFECTO];
  return MODULOS.filter((m) => perfil.modulos.includes(m)).join(' ');
}

// Las etapas abiertas con que nace el embudo de consultas de un negocio de
// ese tipo (hist. §89). Un tipo desconocido es comercio.
export function etapasCrmDelPreset(rubro) {
  return PERFILES_RUBRO[Object.hasOwn(PERFILES_RUBRO, rubro ?? '') ? rubro : RUBRO_POR_DEFECTO].etapas_crm;
}
