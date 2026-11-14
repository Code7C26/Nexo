// Lo que el asistente contesta por WhatsApp sin llamar a la IA (hist. §168):
// las dudas de uso ("¿cómo anulo una venta?"), la charla y "llevame a…". Es lo
// mismo que hace la web en el navegador (frontend/js/dominios/ayuda.js), con el
// mismo manual y la misma búsqueda (core/manual.js y core/buscar-ayuda.js, que
// no usan el DOM), pero en texto de WhatsApp: *negrita*, y sin enlaces ni botones.
//
// Solo lee el manual: no abre la base ni escribe nada (CLAUDE.md §21, §36).
import { PUNTAJE_DUDOSO, PUNTAJE_SEGURO, buscarEnManual, clasificarFrase } from '../frontend/js/core/buscar-ayuda.js';

// Lo que entra en un mensaje cómodo de leer en el celular (WhatsApp corta en 4096).
const LARGO_MAXIMO = 1400;

// El manual escribe **así** la negrita; WhatsApp, *así*.
const aWhatsApp = (texto) => String(texto).replace(/\*\*(.+?)\*\*/g, '*$1*');

function textoDeBloques(bloques) {
  return bloques
    .map((b) => {
      if (typeof b === 'string') return aWhatsApp(b);
      if (b.pasos) return b.pasos.map((p, i) => `${i + 1}. ${aWhatsApp(p)}`).join('\n');
      if (b.lista) return b.lista.map((p) => `• ${aWhatsApp(p)}`).join('\n');
      return `ℹ️ ${aWhatsApp(b.nota)}`;
    })
    .join('\n\n');
}

// Una sección del manual como mensaje. Si es muy larga, se corta en el último
// bloque que entra y se manda a leer el resto en la app.
export function seccionParaWhatsApp(seccion) {
  let cuerpo = textoDeBloques(seccion.bloques);
  const entero = cuerpo.length <= LARGO_MAXIMO;
  if (!entero) {
    const corte = cuerpo.lastIndexOf('\n\n', LARGO_MAXIMO);
    cuerpo = cuerpo.slice(0, corte > 200 ? corte : LARGO_MAXIMO).trimEnd();
  }
  const donde = seccion.pantalla ? `\n\n📍 En Nexo: *${seccion.pantalla[1]}*.` : '';
  const mas = entero ? '' : '\n\n📖 El manual completo está en Nexo, en *Ayuda*.';
  return `📖 *${seccion.titulo}*\n\n${cuerpo}${donde}${mas}`;
}

const CHARLAS = {
  saludo: (capacidades) => `¡Hola! 👋 Contame qué pasó en el negocio o preguntame lo que necesites.\n\n${capacidades}`,
  gracias: () => '¡De nada! 🙌 Si necesitás algo más, acá estoy.',
  despedida: () => '¡Hasta luego! 👋 Cuando vuelvas, acá estoy.',
  capacidades: (capacidades) => capacidades
};

// resultados: lo que devuelve buscarEnManual. Con un resultado seguro, la
// sección; con dudas, las opciones; sin nada, qué sí puede hacer.
export function respuestaDelManual(resultados, capacidades) {
  const [mejor, ...otros] = resultados;
  if (!mejor || mejor.puntaje < PUNTAJE_DUDOSO) {
    return `🤔 Eso no lo sé: estoy para ayudarte con tu negocio en Nexo.\n\n${capacidades}`;
  }
  if (mejor.puntaje < PUNTAJE_SEGURO) {
    const opciones = resultados.filter((r) => r.puntaje >= PUNTAJE_DUDOSO).map((r) => `• ${r.seccion.titulo}`);
    return `🤔 No estoy seguro de haberte entendido. ¿Es alguna de estas?\n${opciones.join('\n')}\n\nProbá con otras palabras, o mirá el manual en Nexo, en *Ayuda*.`;
  }
  const relacionados = otros.filter((r) => r.puntaje >= PUNTAJE_SEGURO).map((r) => r.seccion.titulo);
  const tambien = relacionados.length ? `\n\n➕ También puede servirte: ${relacionados.join(' · ')}.` : '';
  return `${seccionParaWhatsApp(mejor.seccion)}${tambien}`;
}

// La respuesta a una frase que no es una operación, o null si lo es (y va a la
// IA). `capacidades` es lo que sabe hacer, para saludos y para lo que no tiene
// respuesta: nadie queda sin saber qué probar.
export function respuestaDeAyuda(texto, capacidades) {
  const frase = clasificarFrase(texto);
  if (frase.tipo === 'operacion') return null;
  if (frase.tipo === 'charla') return (CHARLAS[frase.charla] ?? CHARLAS.capacidades)(capacidades);
  if (frase.tipo === 'navegar') {
    return `📍 Eso lo abrís desde la app: *${frase.pantalla.nombre}*, en el menú de Nexo.\n\n${capacidades}`;
  }
  return respuestaDelManual(frase.resultados, capacidades);
}

// Lo que la IA no tomó como operación pero el manual sí tiene (con seguridad):
// como en la web, "no es algo que pueda cargar, pero esto te puede servir".
export function ayudaSeguraDelManual(texto) {
  const [mejor] = buscarEnManual(texto);
  if (!(mejor?.puntaje >= PUNTAJE_SEGURO)) return null;
  return `No es algo que pueda cargar, pero esto del manual te puede servir:\n\n${seccionParaWhatsApp(mejor.seccion)}`;
}
