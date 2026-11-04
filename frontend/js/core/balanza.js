// Etiquetas de balanza (hist. §132): la balanza imprime un código de barras
// EAN-13 con el PLU del producto (su código corto en la balanza) y el peso o
// el importe. El lector la pasa como cualquier código y el renglón entra
// pesado. El precio es siempre el del catálogo de hoy, nunca el de la
// etiqueta, que puede estar viejo: de una etiqueta con importe sale el peso
// (importe ÷ precio).
//
// El formato cambia según la balanza, y se guarda por negocio:
//   { prefijo: "20", plu_digitos: 5, valor: "peso", decimales: 3 }
// es "20" + 5 dígitos de PLU + el peso en gramos + el dígito verificador.
// Los dígitos del valor son lo que queda: 12 - prefijo - PLU.
//
// Puro, sin DOM: lo usan el punto de venta, Configuración → Balanza y los
// tests del backend.

export const LARGO_ETIQUETA = 13;
export const VALORES_ETIQUETA = { peso: "Peso", importe: "Importe" };
const DECIMALES = { peso: [3, 2], importe: [0, 2, 1] };

export const digitosDelValor = (formato) => LARGO_ETIQUETA - 1 - formato.prefijo.length - formato.plu_digitos;

// El dígito verificador de un EAN-13, sobre los 12 primeros.
export function digitoVerificador(doce) {
  let suma = 0;
  for (let i = 0; i < 12; i += 1) suma += Number(doce[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (suma % 10)) % 10;
}

export const esEan13 = (codigo) =>
  /^\d{13}$/.test(codigo) && digitoVerificador(codigo) === Number(codigo[12]);

// Devuelve el error o null. Las balanzas usan los códigos internos del EAN,
// que empiezan con 2.
export function errorDeFormato(formato) {
  if (!formato || typeof formato !== "object") return "El formato de la etiqueta no es válido.";
  const { prefijo, plu_digitos, valor, decimales } = formato;
  if (typeof prefijo !== "string" || !/^2\d?$/.test(prefijo)) return "El código de la balanza empieza con 2 y uno o dos números.";
  if (!Number.isInteger(plu_digitos) || plu_digitos < 3 || plu_digitos > 6) return "El PLU tiene que tener de 3 a 6 números.";
  if (!Object.hasOwn(VALORES_ETIQUETA, valor)) return "La etiqueta trae el peso o el importe.";
  if (!DECIMALES[valor].includes(decimales)) return "Los decimales del valor no son válidos.";
  const digitos = digitosDelValor(formato);
  if (digitos < 4 || digitos > 7) return "El prefijo, el PLU y el valor no suman los 13 números de la etiqueta.";
  return null;
}

// Lee una etiqueta: { plu, valor } (el valor en kilos o en pesos), o null si
// el código no es de este formato o está mal leído.
export function leerEtiqueta(codigo, formato) {
  const limpio = String(codigo ?? "").replace(/\s+/g, "");
  if (!formato || errorDeFormato(formato) || !esEan13(limpio) || !limpio.startsWith(formato.prefijo)) return null;
  const desde = formato.prefijo.length;
  const plu = Number(limpio.slice(desde, desde + formato.plu_digitos));
  const crudo = Number(limpio.slice(desde + formato.plu_digitos, 12));
  return { plu, valor: crudo / 10 ** formato.decimales };
}

// Cuánto se vende de un producto con su etiqueta: el peso, en la unidad del
// producto (gramos si se vende por g), o el importe ÷ el precio de hoy. Null
// si no se puede (sin precio, o un producto que no se pesa).
export function cantidadDeEtiqueta(lectura, formato, { unidad, precio }) {
  const kilos = formato.valor === "peso" ? lectura.valor : precio > 0 ? lectura.valor / precio : null;
  if (!(kilos > 0)) return null;
  if (unidad === "kg" || unidad === "l") return Math.round(kilos * 1000) / 1000;
  if (unidad === "g" || unidad === "ml") return Math.round(kilos * 1000);
  return null;
}

// Los formatos que explican una etiqueta real: su código y lo que tiene
// impreso (el PLU y el peso en kilos o el importe). Dos formatos que leen
// igual cualquier PLU que entre en la etiqueta cuentan como uno, y gana el
// prefijo largo ("20" + "0123" y "2" + "00123" son la misma balanza). Si
// queda más de uno, hace falta otra etiqueta para decidir.
export function deducirFormatos({ codigo, plu, peso = null, importe = null }) {
  const limpio = String(codigo ?? "").replace(/\s+/g, "");
  if (!esEan13(limpio) || limpio[0] !== "2") return [];
  const esperado = { peso, importe };
  const encontrados = [];
  for (const prefijo of [limpio.slice(0, 2), limpio[0]]) {
    for (let plu_digitos = 3; plu_digitos <= 6; plu_digitos += 1) {
      for (const valor of Object.keys(VALORES_ETIQUETA)) {
        if (!(esperado[valor] > 0)) continue;
        for (const decimales of DECIMALES[valor]) {
          const formato = { prefijo, plu_digitos, valor, decimales };
          if (errorDeFormato(formato)) continue;
          const lectura = leerEtiqueta(limpio, formato);
          // El valor impreso, con la precisión que lleva la etiqueta.
          if (lectura.plu === Number(plu) && Math.abs(lectura.valor - esperado[valor]) < 10 ** -decimales / 2) {
            encontrados.push(formato);
          }
        }
      }
    }
  }
  // Mismo final del PLU y mismo valor: la misma lectura.
  const unicos = new Map();
  for (const f of encontrados) {
    const clave = `${f.prefijo.length + f.plu_digitos}|${f.valor}|${f.decimales}`;
    if (!unicos.has(clave)) unicos.set(clave, f);
  }
  return [...unicos.values()];
}

// "20 + PLU de 5 + peso en gramos": para mostrar el formato elegido.
export function describirFormato(formato) {
  const unidad =
    formato.valor === "peso"
      ? { 3: "en gramos", 2: "en decenas de gramos" }[formato.decimales]
      : { 0: "en pesos", 1: "en pesos con un decimal", 2: "en pesos con centavos" }[formato.decimales];
  return `${formato.prefijo} + PLU de ${formato.plu_digitos} + ${VALORES_ETIQUETA[formato.valor].toLowerCase()} ${unidad} (${digitosDelValor(formato)} números) + verificador`;
}
