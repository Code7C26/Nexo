/**
 * core/fiscal.js
 * Datos fiscales del negocio: condición frente al IVA y CUIT. Valida lo mismo
 * que validarDatosNegocio() en server.js; acá es para marcar el campo antes de
 * mandar. La Etapa C (IVA, CLAUDE.md §33) crece desde acá.
 */

// Lista fija desde hist. §73 (CONDICIONES_IVA en server.js).
export const CONDICIONES_FISCALES = {
  responsable_inscripto: "Responsable inscripto",
  monotributo: "Monotributo",
  exento: "Exento"
};

export const esCondicionFiscal = (valor) => Object.hasOwn(CONDICIONES_FISCALES, valor ?? "");

// La etiqueta de una condición guardada. Un texto libre anterior a la lista
// fija, que db/index.js no supo pasar a clave, se muestra tal cual.
export const condicionFiscal = (valor) => (esCondicionFiscal(valor) ? CONDICIONES_FISCALES[valor] : valor ?? "");

const digitosCuit = (texto) => String(texto ?? "").replace(/[\s.-]/g, "");

// Dígito verificador (módulo 11): el mismo cálculo que cuitValido() en
// server.js. Un resto de 1 da 9 (prefijos 23 y 33).
function cuitValido(digitos) {
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((total, peso, i) => total + peso * Number(digitos[i]), 0);
  const resto = suma % 11;
  const verificador = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto;
  return verificador === Number(digitos[10]);
}

// El error para mostrar debajo del campo, o "" si está bien. Vacío vale: el
// CUIT es opcional.
export function errorCuit(texto) {
  const digitos = digitosCuit(texto);
  if (!digitos) return "";
  if (!/^\d{11}$/.test(digitos)) return "El CUIT tiene que tener 11 números.";
  return cuitValido(digitos) ? "" : "El CUIT no es válido: revisá el último número.";
}

// Con guiones si tiene los 11 números; si no, como lo escribió el usuario.
export function formatearCuit(texto) {
  const digitos = digitosCuit(texto);
  if (!/^\d{11}$/.test(digitos)) return String(texto ?? "").trim();
  return `${digitos.slice(0, 2)}-${digitos.slice(2, 10)}-${digitos.slice(10)}`;
}

// Alícuotas de IVA de un producto (ALICUOTAS_IVA en server.js). El precio de
// venta ya la incluye: es el precio final.
export const ALICUOTAS_IVA = {
  "21": "21 %",
  "10.5": "10,5 %",
  "27": "27 %",
  "5": "5 %",
  "2.5": "2,5 %",
  "0": "0 %",
  exento: "Exento",
  no_gravado: "No gravado"
};
export const alicuotaIva = (valor) => ALICUOTAS_IVA[valor ?? "21"] ?? valor;

// La del cliente (CONDICIONES_IVA_CLIENTE en server.js): sin cargar, es
// consumidor final.
export const condicionIvaCliente = (valor) =>
  !valor || valor === "consumidor_final" ? "Consumidor final" : condicionFiscal(valor);

export function opcionesSelect(select, opciones) {
  select.innerHTML = Object.entries(opciones)
    .map(([valor, etiqueta]) => `<option value="${valor}">${etiqueta}</option>`)
    .join("");
}
