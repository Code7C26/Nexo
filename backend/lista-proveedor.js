// La lista de precios de un proveedor (pedido del usuario, 18 de noviembre de
// 2026): el mensaje que manda por WhatsApp, la planilla que se copia y pega o
// el PDF de su catálogo, pasados a renglones con descripción y precio, y cada
// renglón buscado entre los productos del negocio. Sin base y sin IA: el texto
// se lee acá con reglas (no gasta cupo, y una lista puede tener miles de
// renglones); una foto la lee interprete.js. server.js trae el catálogo y lo
// recordado, y nada se guarda sin que la persona lo revise (CLAUDE.md §21).
//
// El renglón se relaciona con el producto como en la factura del proveedor
// (factura-proveedor.js, hist. §151), y con lo mismo que ya se aprendió de él:
// lo recordado de ese proveedor, el código y un nombre parecido.

import { buscarEnCatalogo, claveDeRenglon, palabras, quitarBulto } from './factura-proveedor.js';

export const RENGLONES_MAX = 5000;
const DESCRIPCION_MAX = 200;

const redondear = (n) => Math.round(n * 100) / 100;

// "12.500", "12.500,50", "1250", "4200.00", "1,5": cómo se escriben los precios
// en la Argentina. El punto con tres cifras atrás es de miles; la coma, la de
// los decimales. Devuelve null si no es un número.
export function leerImporte(s) {
  let t = String(s ?? '').replace(/[$\s]/g, '');
  if (!/^\d[\d.,]*$/.test(t)) return null;
  t = t.replace(/[.,]+$/, '');
  if (t.includes(',') && t.includes('.')) {
    // El que va último es el de los decimales.
    t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (t.includes(',')) {
    t = /^\d{1,3}(,\d{3}){2,}$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, '');
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Después de un número, lo que dice que es un tamaño o una cantidad, no un
// precio: "500 g", "2,25 L", "12 u".
const UNIDAD_DESPUES = /^\s*(?:g|gr|grs|gramos|kg|kgs|kilo|kilos|ml|cc|l|lt|lts|litro|litros|cm|mm|m|mts|metros|w|u|un|uni|unid|unidades|%|"|cm3|oz)(?![\p{L}])/iu;
// El "$" puede ir separado del número; el número, nunca de lo anterior.
const NUMERO = /\$\s*\d[\d.,]*|\d[\d.,]*/g;

// El precio de un renglón: el último número con "$" o, si no hay, el último
// número que no es un tamaño, un bulto ni parte de una fecha o un código.
// Devuelve { precio, desde, hasta } (lo que ocupa en el texto) o null.
function precioDelRenglon(linea) {
  const candidatos = [];
  for (const m of linea.matchAll(NUMERO)) {
    const crudo = m[0].trim();
    const antes = linea.slice(0, m.index);
    const despues = linea.slice(m.index + m[0].length);
    const conPesos = crudo.startsWith('$') || /\$\s*$/.test(antes);
    if (!conPesos) {
      // Parte de una fecha ("17/11"), de un código ("A-123", "B12") o de una palabra.
      if (/[/]$/.test(antes) || /^[/]/.test(despues)) continue;
      if (/\p{L}$/u.test(antes) || /^\p{L}/u.test(despues) && !UNIDAD_DESPUES.test(despues)) continue;
      if (UNIDAD_DESPUES.test(despues)) continue;
      // "x12", "pack 6", "caja x 24": cuántas trae, no cuánto sale.
      if (/(?:\bx|pack|caja|cj|bulto|fardo|display|\bde|\bpor)\s*$/i.test(antes)) continue;
    }
    const precio = leerImporte(crudo.replace('$', ''));
    if (precio === null || precio <= 0) continue;
    // Diez cifras o más sin "$" es un código de barras.
    if (!conPesos && /\d{10,}/.test(crudo)) continue;
    candidatos.push({ precio, desde: m.index, hasta: m.index + m[0].length, conPesos });
  }
  if (!candidatos.length) return null;
  const conPesos = candidatos.filter((c) => c.conPesos);
  return (conPesos.length ? conPesos : candidatos).at(-1);
}

// Un código al principio del renglón: el código de barras o el del
// proveedor ("1234 - Fideos…", "AB-120 Yerba…").
const CODIGO_AL_PRINCIPIO = /^\s*(?:cod(?:igo)?\.?\s*:?\s*)?(\d{3,14}|[a-z]{1,4}-?\d{2,10})\s*[-–:|.)]?\s+(?=\S)/i;

// Lo que adorna un mensaje: viñetas, emojis, puntos suspensivos, guiones de
// relleno y el "$" o "c/u" que queda suelto.
function limpiarDescripcion(s) {
  return String(s)
    .replace(/\p{Extended_Pictographic}|️|‍/gu, ' ')
    .replace(/(^|\s)c\/u(?=\s|$)/gi, ' ')
    .replace(/[•·*►▪➡→=|_]+/g, ' ')
    .replace(/\.{2,}|-{2,}/g, ' ')
    .replace(/(^|\s)(?:precio|valor|final)\s*:?\s*$/i, ' ')
    .replace(/^[\s\-–:.,;)]+|[\s\-–:.,;($]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Un renglón de la planilla pegada (columnas con tabulador o punto y coma):
// el precio es la última columna con un importe, la descripción la columna
// con más letras y el código una columna corta antes de la descripción.
function renglonDeColumnas(celdas) {
  const limpias = celdas.map((c) => c.trim());
  let iPrecio = -1;
  for (let i = limpias.length - 1; i >= 0; i--) {
    if (leerImporte(limpias[i]) > 0) {
      iPrecio = i;
      break;
    }
  }
  if (iPrecio < 0) return null;
  const letras = (s) => (s.match(/\p{L}/gu) ?? []).length;
  let iDescripcion = -1;
  limpias.forEach((c, i) => {
    if (i !== iPrecio && letras(c) > (iDescripcion < 0 ? 1 : letras(limpias[iDescripcion]))) iDescripcion = i;
  });
  if (iDescripcion < 0) return null;
  const codigo = limpias.slice(0, iDescripcion).find((c) => /^[a-z0-9-]{3,20}$/i.test(c) && /\d/.test(c)) ?? null;
  return { codigo, descripcion: limpiarDescripcion(limpias[iDescripcion]), precio: leerImporte(limpias[iPrecio]) };
}

function renglonDeTexto(linea) {
  const encontrado = precioDelRenglon(linea);
  if (!encontrado) return null;
  let resto = `${linea.slice(0, encontrado.desde)} ${linea.slice(encontrado.hasta)}`;
  let codigo = null;
  const conCodigo = resto.match(CODIGO_AL_PRINCIPIO);
  // Un número al principio que es un tamaño ("500 g de…") no es un código.
  if (conCodigo && !UNIDAD_DESPUES.test(resto.slice(resto.indexOf(conCodigo[1]) + conCodigo[1].length))) {
    codigo = conCodigo[1];
    resto = resto.slice(conCodigo[0].length);
  }
  // "c/u", "por unidad": el precio ya es de cada una, aunque diga "x 6".
  const porUnidad = /(^|\s)c\/u(?=\s|$)|\b(?:cada una?|por unidad|x unidad)\b/i.test(linea);
  return { codigo, descripcion: limpiarDescripcion(resto), precio: encontrado.precio, porUnidad };
}

// Cuántas trae el bulto según la descripción ("x12", "pack 6"), o null.
export function bultoDeDescripcion(descripcion) {
  const m = String(descripcion ?? '').match(
    /\b(?:(?:pack|caja|cj|bulto|fardo|display|blister|paquete|pq)\s*(?:x|de|por)?\s*(\d+)|x\s*(\d+)(?![\d.,]*\s*(?:g|gr|grs|gramos|kg|kgs|kilo|kilos|ml|cc|l|lt|lts|litro|litros|cm|mm|m|mts|metros|w)\b))/i
  );
  const n = Number(m?.[1] ?? m?.[2]);
  return n > 1 && n <= 10000 ? n : null;
}

const conLetras = (s) => (String(s).match(/\p{L}/gu) ?? []).length >= 2;

// El texto entero de la lista, pasado a renglones. Lo que no tiene un precio o
// una descripción con letras (títulos, fechas, saludos) queda afuera y se
// cuenta.
export function leerLista(texto) {
  const lineas = String(texto ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((l) => l.trim());
  const renglones = [];
  let descartadas = Math.max(0, lineas.length - RENGLONES_MAX);
  for (const linea of lineas.slice(0, RENGLONES_MAX)) {
    const celdas = linea.split(/\t|;/);
    const renglon = celdas.length > 1 ? renglonDeColumnas(celdas) : renglonDeTexto(linea);
    if (!renglon || !(renglon.precio > 0) || !conLetras(renglon.descripcion)) {
      descartadas++;
      continue;
    }
    renglones.push({
      codigo: renglon.codigo,
      descripcion: renglon.descripcion.slice(0, DESCRIPCION_MAX),
      precio: redondear(renglon.precio),
      unidades_por_bulto: renglon.porUnidad ? null : bultoDeDescripcion(renglon.descripcion)
    });
  }
  return { renglones, descartadas };
}

// Lo que devolvió la lectura de una foto (interprete.js), con la misma forma
// que leerLista: lo que no tiene descripción o precio, afuera.
export function normalizarLecturaDeLista(cruda) {
  const r = cruda && typeof cruda === 'object' ? cruda : {};
  const renglones = [];
  let descartadas = 0;
  for (const x of (Array.isArray(r.renglones) ? r.renglones : []).slice(0, RENGLONES_MAX)) {
    const descripcion = typeof x?.descripcion === 'string' ? limpiarDescripcion(x.descripcion).slice(0, DESCRIPCION_MAX) : '';
    const precio = typeof x?.precio === 'number' ? x.precio : leerImporte(x?.precio);
    if (!conLetras(descripcion) || !(precio > 0)) {
      descartadas++;
      continue;
    }
    const bulto = Number(x?.unidades_por_bulto);
    const codigo = typeof x?.codigo === 'string' || typeof x?.codigo === 'number' ? String(x.codigo).trim().slice(0, 40) : '';
    renglones.push({
      codigo: codigo || null,
      descripcion,
      precio: redondear(precio),
      unidades_por_bulto: bulto > 1 && bulto <= 10000 ? bulto : bultoDeDescripcion(descripcion)
    });
  }
  return { renglones, descartadas, precios_sin_iva: typeof r.precios_sin_iva === 'boolean' ? r.precios_sin_iva : null };
}

/* ---------- Buscar en el catálogo ---------- */

const esNumero = (p) => /^\d+(\.\d+)?$/.test(p);
const MEDIDAS = new Set(['l', 'ml', 'g', 'kg', 'm', 'cm', 'mm', 'w']);
// La llave de una palabra para el índice: las de 4 letras o más se parecen
// por el principio (como en similitud), las cortas solo iguales. Los números
// y las medidas no sirven para encontrar candidatos (similitud pide una
// palabra de verdad en común), y los tienen casi todos.
const llave = (p) => (esNumero(p) || MEDIDAS.has(p) ? null : p.length >= 4 ? p.slice(0, 4) : p);
const normalizarCodigo = (c) => String(c ?? '').replace(/\s+/g, '').toUpperCase();
// Con cuántos productos se compara cada renglón, como mucho.
const CANDIDATOS_MAX = 30;

// Un buscador para muchos renglones contra el mismo catálogo: cada renglón se
// compara solo con los productos que comparten más palabras con él, pesando
// más las raras (la marca dice más que "galletitas"). Con los que no comparten
// ninguna, similitud da 0. Así una lista de miles de renglones no tarda.
function buscadorDeCatalogo(catalogo) {
  const porLlave = new Map();
  const porCodigo = new Map();
  for (const entrada of catalogo) {
    for (const p of new Set(palabras(entrada.nombre).map(llave).filter(Boolean))) {
      if (!porLlave.has(p)) porLlave.set(p, []);
      porLlave.get(p).push(entrada);
    }
    for (const c of new Set([entrada.sku, entrada.codigo_barras].map(normalizarCodigo).filter(Boolean))) {
      if (!porCodigo.has(c)) porCodigo.set(c, []);
      porCodigo.get(c).push(entrada);
    }
  }
  return (renglon) => {
    const conEseCodigo = renglon.codigo ? porCodigo.get(normalizarCodigo(renglon.codigo)) : null;
    if (conEseCodigo?.length === 1) return { entrada: conEseCodigo[0], coincidencia: 'codigo' };
    const puntos = new Map();
    for (const p of new Set(palabras(quitarBulto(renglon.descripcion)).map(llave).filter(Boolean))) {
      const conEsa = porLlave.get(p) ?? [];
      const rareza = Math.log(1 + catalogo.length / (conEsa.length || 1));
      for (const entrada of conEsa) puntos.set(entrada, (puntos.get(entrada) ?? 0) + rareza);
    }
    if (!puntos.size) return null;
    const candidatos = [...puntos]
      .sort((a, b) => b[1] - a[1])
      .slice(0, CANDIDATOS_MAX)
      .map(([entrada]) => entrada);
    return buscarEnCatalogo({ descripcion: renglon.descripcion, codigo: null }, candidatos);
  };
}

// Cada renglón con su producto: lo recordado de ese proveedor primero
// (proveedor_articulos, lo mismo que aprende la factura), después el código y
// un nombre parecido. recordados: Map clave → { producto_id, variante_id,
// unidades_por_bulto }.
export function asociarRenglones(renglones, catalogo, recordados) {
  const buscar = buscadorDeCatalogo(catalogo);
  return renglones.map((renglon) => {
    const clave = claveDeRenglon(renglon);
    const recordado = recordados.get(clave);
    const entradaRecordada =
      recordado && catalogo.find((e) => e.producto_id === recordado.producto_id && e.variante_id === (recordado.variante_id ?? null));
    const encontrado = entradaRecordada ? { entrada: entradaRecordada, coincidencia: 'recordado' } : buscar(renglon);
    return {
      ...renglon,
      clave,
      unidades_por_bulto: entradaRecordada ? recordado.unidades_por_bulto : (renglon.unidades_por_bulto ?? 1),
      coincidencia: encontrado?.coincidencia ?? null,
      entrada: encontrado?.entrada ?? null
    };
  });
}
