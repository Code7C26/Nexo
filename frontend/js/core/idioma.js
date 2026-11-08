/**
 * core/idioma.js
 * El idioma de la interfaz para los módulos. Lo decide traductor.js (script
 * clásico del <head>, que también traduce la pantalla): acá solo se lee.
 */
// globalThis y no window: el servidor también importa core/manual.js (las
// respuestas por WhatsApp), y ahí no hay traductor: castellano.
const api = globalThis.nexoIdioma ?? { idioma: "es", locale: "es-AR", t: (texto) => texto, cambiar() {} };

export const idioma = api.idioma;
// Para toLocaleString y toLocaleDateString: fechas y números en el formato
// del idioma ("11 de noviembre" o "November 11").
export const LOCALE = api.locale;
// La traducción de un texto que no pasa por la pantalla.
export const t = api.t;
// Un texto armado con huecos, ya traducido: formatear("{0}: {1} en {2}",
// dia, plata, ventas). Para los que son muy cortos para que traductor.js los
// reconozca en pantalla; la plantilla es la clave de idioma/en.js.
export const formatear = (plantilla, ...valores) =>
  (api.plantilla?.(plantilla) ?? plantilla).replace(/\{(\d+)\}/g, (_, i) => t(String(valores[i] ?? "")));
export const cambiarIdioma = (nuevo) => api.cambiar(nuevo);
