// La factura de un proveedor, leída de una foto, pasada a los renglones de una
// compra de Nexo (hist. §151). Sin base y sin IA: la lectura la hace
// interprete.js (el único que sabe que existe un proveedor de IA) y server.js
// trae el catálogo y lo recordado; acá solo se limpia lo leído, se busca cada
// renglón en el catálogo y se calcula cuánto costó cada unidad.
//
// Quién relaciona el renglón con el producto es este código, no la IA, y en
// este orden: lo que ese proveedor ya tiene recordado (proveedor_articulos),
// el código de barras o el SKU exacto, y un nombre parecido, que la persona
// revisa. Nada se carga sin que alguien lo mire y guarde (CLAUDE.md §21).

const MAX_RENGLONES = 150;
const ALICUOTAS = [0, 2.5, 5, 10.5, 21, 27];

const redondear = (n) => Math.round(n * 100) / 100;

// La IA devuelve números, pero si se le escapa un "1.234,56" se entiende igual.
function numero(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  let s = String(valor).replace(/[$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function texto(valor, max) {
  if (typeof valor !== 'string' && typeof valor !== 'number') return null;
  return String(valor).replace(/\s+/g, ' ').trim().slice(0, max) || null;
}

function fechaValida(valor) {
  const s = texto(valor, 10);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
}

// El importe impreso del renglón manda sobre la bonificación leída: el modelo
// a veces la inventa (25 % donde la columna está vacía) o la pierde, y el
// importe es lo más fácil de leer bien. Si el importe es mayor que cantidad ×
// precio (viene con IVA, por ejemplo), no sirve para controlar y queda lo leído.
function bonificacionSegunImporte({ cantidad, precio, bonificacion, importe }) {
  const bruto = cantidad * precio;
  if (!(importe > 0) || !(bruto > 0) || importe > bruto * 1.005) return bonificacion;
  const deducida = redondear((1 - importe / bruto) * 100);
  if (deducida < 0.5) return null;
  // La leída gana si coincide: conserva sus decimales tal cual figuran.
  return bonificacion !== null && Math.abs(bonificacion - deducida) < 0.5 ? bonificacion : deducida;
}

// Lo que devolvió la lectura, con la forma que espera el resto: los números
// como números, lo que no tiene sentido como null, y fuera los renglones que no
// son productos (sin descripción, sin cantidad o sin precio).
export function normalizarLectura(cruda) {
  const r = cruda && typeof cruda === 'object' ? cruda : {};
  const letra = texto(r.letra, 1)?.toUpperCase();
  const cuit = String(r.proveedor?.cuit ?? '').replace(/\D/g, '');

  const renglones = (Array.isArray(r.renglones) ? r.renglones : []).slice(0, MAX_RENGLONES).map((x) => {
    const cantidad = numero(x?.cantidad);
    const importe = numero(x?.importe);
    let precio = numero(x?.precio_unitario);
    if (precio === null && importe !== null && cantidad > 0) precio = importe / cantidad;
    const leida = numero(x?.bonificacion);
    const bonificacion = bonificacionSegunImporte({
      cantidad,
      precio,
      bonificacion: leida > 0 && leida < 100 ? leida : null,
      importe
    });
    const bulto = numero(x?.unidades_por_bulto);
    const alicuota = numero(x?.alicuota_iva);
    return {
      codigo: texto(x?.codigo, 40),
      descripcion: texto(x?.descripcion, 200),
      cantidad,
      precio_unitario: precio,
      bonificacion,
      unidades_por_bulto: bulto > 1 && bulto <= 10000 ? bulto : null,
      alicuota_iva: ALICUOTAS.includes(alicuota) ? alicuota : null,
      es_envio: x?.es_envio === true
    };
  });

  return {
    es_comprobante: r.es_comprobante !== false,
    proveedor: { nombre: texto(r.proveedor?.nombre, 120), cuit: cuit.length === 11 ? cuit : null },
    letra: ['A', 'B', 'C'].includes(letra) ? letra : null,
    numero: texto(r.numero, 30),
    fecha: fechaValida(r.fecha),
    // Sin el dato, lo normal: la A muestra los precios sin IVA, la B y la C con.
    precios_sin_iva: typeof r.precios_sin_iva === 'boolean' ? r.precios_sin_iva : letra === 'A',
    percepciones: numero(r.percepciones) > 0 ? numero(r.percepciones) : null,
    total: numero(r.total) > 0 ? numero(r.total) : null,
    renglones: renglones.filter((x) => x.descripcion && x.cantidad > 0 && x.precio_unitario !== null && x.precio_unitario >= 0)
  };
}

/* ---------- Comparar nombres ---------- */

// Minúsculas, sin tildes, "2,25" como "2.25" y el número despegado de su
// unidad ("2.25lt" → "2.25 lt").
export function normalizarTexto(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/[^a-z0-9ñ.]+/g, ' ')
    .replace(/(^|\s)\.+|\.+(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// "x12", "x 6 u", "pack 6", "caja x 24", "fardo de 6": cuántas trae el bulto,
// que no es parte del nombre del producto. "x 200 g" no: eso es el tamaño.
const BULTO = /\b(?:(?:pack|caja|cj|bulto|fardo|display|blister|paquete|pq)\s*(?:x|de|por)?\s*\d+|x\s*\d+(?![\d.]*\s*(?:g|gr|grs|gramos|kg|kgs|kilo|kilos|ml|cc|l|lt|lts|litro|litros|cm|mm|m|mts|metros|w)\b))\s*(?:u|un|uni|unid|unidades)?\b/gi;

export const quitarBulto = (s) => String(s ?? '').replace(BULTO, ' ').replace(/\s+/g, ' ').trim();

const UNIDADES = {
  lt: 'l', lts: 'l', litro: 'l', litros: 'l',
  gr: 'g', grs: 'g', gramos: 'g',
  kgs: 'kg', kilo: 'kg', kilos: 'kg',
  cc: 'ml',
  mts: 'm', metros: 'm'
};
const VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'sin', 'y', 'en', 'por', 'x', 'u', 'un', 'uni', 'unid', 'unidades']);

function palabras(s) {
  return normalizarTexto(quitarBulto(normalizarTexto(s)))
    .split(' ')
    .map((p) => UNIDADES[p] ?? p)
    .filter((p) => p && !VACIAS.has(p));
}

const esNumero = (p) => /^\d+(\.\d+)?$/.test(p);
const MEDIDAS = new Set(['l', 'ml', 'g', 'kg', 'm', 'cm', 'mm', 'w']);
// El tamaño ("2.25", "l") pesa la mitad que una palabra: dos gaseosas de 2,25 L
// distintas no se parecen por el tamaño.
const peso = (p) => (esNumero(p) || MEDIDAS.has(p) ? 0.5 : 1);
const sumaPesos = (lista) => lista.reduce((acc, p) => acc + peso(p), 0);
// Dos palabras son la misma si son iguales o, las dos de 4 letras o más,
// empiezan igual ("galletitas" y "galletas"). Los números, solo iguales.
const igual = (a, b) => a === b || (!esNumero(a) && !esNumero(b) && a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4));

// Cuánto se parece la descripción de la factura al nombre del producto, de 0
// a 1. Pesa sobre todo cuánto del nombre aparece en la descripción: la factura
// suele traer de más (códigos, "PET", el envase), y el nombre de Nexo es corto.
export function similitud(descripcion, nombre) {
  const a = palabras(descripcion);
  const b = palabras(nombre);
  if (!a.length || !b.length) return 0;
  const enA = b.filter((p) => a.some((q) => igual(p, q)));
  // Sin ninguna palabra de verdad en común, no se parecen.
  if (!enA.some((p) => peso(p) === 1)) return 0;
  const cobertura = sumaPesos(enA) / sumaPesos(b);
  const dice = (2 * sumaPesos(enA)) / (sumaPesos(a) + sumaPesos(b));
  let puntaje = 0.7 * cobertura + 0.3 * dice;
  // Los dos dicen un tamaño y no es el mismo: "2.25 l" no es "1.5 l".
  const numerosA = a.filter(esNumero);
  const numerosB = b.filter(esNumero);
  if (numerosA.length && numerosB.length && !numerosB.some((n) => numerosA.includes(n))) puntaje *= 0.5;
  return puntaje;
}

const PARECIDO_MINIMO = 0.6;
const VENTAJA_MINIMA = 0.1;

const normalizarCodigo = (c) => String(c ?? '').replace(/\s+/g, '').toUpperCase();

// catalogo: [{ producto_id, variante_id, nombre, sku, codigo_barras }], con una
// entrada por variante activa en los productos que tienen (una compra de esos
// necesita la variante). Devuelve { entrada, coincidencia } o null.
export function buscarEnCatalogo(renglon, catalogo) {
  const codigo = normalizarCodigo(renglon.codigo);
  if (codigo) {
    const porCodigo = catalogo.filter(
      (e) => normalizarCodigo(e.codigo_barras) === codigo || normalizarCodigo(e.sku) === codigo
    );
    if (porCodigo.length === 1) return { entrada: porCodigo[0], coincidencia: 'codigo' };
  }
  const puntuados = catalogo
    .map((entrada) => ({ entrada, puntaje: similitud(renglon.descripcion, entrada.nombre) }))
    .filter((x) => x.puntaje >= PARECIDO_MINIMO)
    .sort((x, y) => y.puntaje - x.puntaje);
  if (!puntuados.length) return null;
  const [mejor, segundo] = puntuados;
  // Dos que se parecen casi igual: que elija la persona, no la suerte.
  if (segundo && mejor.puntaje - segundo.puntaje < VENTAJA_MINIMA) return null;
  return { entrada: mejor.entrada, coincidencia: 'parecido' };
}

// La clave con que se recuerda el renglón para ese proveedor: su código si
// tiene, y si no la descripción normalizada.
export function claveDeRenglon({ codigo, descripcion }) {
  const c = normalizarCodigo(codigo);
  return (c ? `cod:${c}` : `txt:${normalizarTexto(descripcion)}`).slice(0, 200);
}

// El nombre con que nace un producto que todavía no está en Nexo: la
// descripción sin el bulto, y sin las mayúsculas sostenidas de las facturas.
export function nombreSugerido(descripcion) {
  const limpio = quitarBulto(descripcion).replace(/\s+/g, ' ').trim() || String(descripcion ?? '').trim();
  if (limpio !== limpio.toUpperCase()) return limpio.slice(0, 120);
  return limpio
    .toLowerCase()
    .replace(/(^|\s)(\p{L})/gu, (m, espacio, letra) => espacio + letra.toUpperCase())
    .slice(0, 120);
}

/* ---------- Costos ---------- */

// La alícuota con que se suma el IVA a un renglón que vino sin: la del
// producto si ya está en Nexo, o la general.
export function alicuotaNumerica(alicuotaProducto) {
  if (alicuotaProducto === 'exento' || alicuotaProducto === 'no_gravado') return 0;
  const n = Number(alicuotaProducto);
  return ALICUOTAS.includes(n) ? n : 21;
}

// Lo que se pagó por el renglón entero, con IVA: es lo que Nexo guarda como
// precio de compra (crearCompra discrimina el IVA después, si corresponde).
export function totalDelRenglon(renglon, { preciosSinIva, alicuota }) {
  const neto = renglon.cantidad * renglon.precio_unitario * (1 - (renglon.bonificacion ?? 0) / 100);
  return redondear(preciosSinIva ? neto * (1 + alicuota / 100) : neto);
}

// "3 packs de 8 a $8.000 el pack" son 24 unidades a $1.000. La cantidad que
// entra a stock y el costo de cada unidad.
export function enUnidades(renglon, unidadesPorBulto, totalRenglon) {
  const cantidad = Math.round(renglon.cantidad * (unidadesPorBulto || 1) * 1000) / 1000;
  return { cantidad, precio_unitario: redondear(totalRenglon / cantidad) };
}

// Si lo que se cargó no da el total de la factura (menos las percepciones,
// que no son costo de la mercadería), algo se leyó mal: se avisa. Un margen
// chico por los centavos de redondear cada precio por unidad.
export function diferenciaConElTotal({ total, percepciones }, suma, cantidadRenglones) {
  if (!total) return null;
  const esperado = total - (percepciones ?? 0);
  const tolerancia = Math.max(1, cantidadRenglones * 0.05 + total * 0.001);
  const diferencia = redondear(suma - esperado);
  return Math.abs(diferencia) > tolerancia ? diferencia : null;
}
