/**
 * core/menu.js
 * El menú de cada persona (hist. §224): qué secciones van arriba de todo y en
 * qué orden, y cuáles esconde. Lo comparten el navegador (dominios/menu.js) y
 * el servidor, que lo guarda por persona y negocio (GET/PUT/DELETE /api/menu).
 *
 * Arriba de todo, sin grupo, va lo de todos los días, como en Shopify y
 * Tiendanube (docs/investigaciones/investigacion-menu.md): el Resumen, el
 * asistente, el catálogo y los clientes. Reemplaza al grupo "Maestros", que
 * era una palabra de sistema contable. Cada persona sube ahí las secciones que
 * más usa y esconde las que no; lo escondido queda en "Más secciones", al
 * final del menú, como en Linear.
 */

// Las de arriba de siempre: no tienen grupo, así que se esconden pero no bajan.
export const ARRIBA_DE_SIEMPRE = ["dashboard", "asistente", "productos", "clientes", "puntos"];

// Las que viven en un grupo del menú (Ventas, Compras, Stock…): se pueden subir
// arriba de todo. Configuración y Plataforma no se tocan: Configuración es
// donde se vuelve a armar el menú.
export const EN_GRUPOS = [
  "pos",
  "presupuestos",
  "trabajos",
  "abonos",
  "ventas",
  "venta-online",
  "devoluciones",
  "facturas",
  "ingreso",
  "socios",
  "cuotas",
  "clases",
  "planes-socio",
  "compras",
  "proveedores",
  "devoluciones-proveedor",
  "stock",
  "reportes-stock",
  "produccion",
  "caja",
  "cuentas-corrientes",
  "gastos",
  "horarios",
  "papelera",
  "auditoria"
];

const SECCIONES = new Set([...ARRIBA_DE_SIEMPRE, ...EN_GRUPOS]);

export const menuDeSiempre = () => ({ arriba: [...ARRIBA_DE_SIEMPRE], ocultas: [] });

// Si es una lista de secciones válidas, sin repetir. Es lo que acepta el PUT.
export const esListaDeSecciones = (valor) =>
  Array.isArray(valor) &&
  valor.length <= SECCIONES.size &&
  valor.every((v) => typeof v === "string" && SECCIONES.has(v)) &&
  new Set(valor).size === valor.length;

// Lo guardado, en limpio: sin secciones que ya no existen, y con las de arriba
// de siempre que falten (una sección nueva de arriba aparece al final).
export function normalizarMenu(guardado) {
  const limpia = (valor) => (Array.isArray(valor) ? [...new Set(valor.filter((v) => SECCIONES.has(v)))] : []);
  const arriba = limpia(guardado?.arriba);
  for (const vista of ARRIBA_DE_SIEMPRE) if (!arriba.includes(vista)) arriba.push(vista);
  return { arriba, ocultas: limpia(guardado?.ocultas) };
}
