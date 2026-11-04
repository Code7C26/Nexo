// WhatsApp como canal del asistente (CLAUDE.md §36, hist. §134). Como
// mercadopago.js, este archivo solo habla con WhatsApp (la Cloud API de Meta):
// - la firma de los avisos (X-Hub-Signature-256, HMAC del cuerpo crudo con el
//   secreto de la app) y el saludo de verificación del webhook;
// - mandar un texto, o un texto con botones de respuesta (hasta 3);
// - bajar un audio (nota de voz) que mandó alguien.
//
// Qué hacer con cada mensaje lo decide server.js: el número tiene que estar
// vinculado a una cuenta de Nexo, y la frase sigue el mismo camino que la del
// asistente de la web, con la misma confirmación (CLAUDE.md §21).
//
// Las variables: WHATSAPP_TOKEN (el token de acceso), WHATSAPP_PHONE_NUMBER_ID
// (el número de Nexo en la API), WHATSAPP_APP_SECRET (firma de los avisos),
// WHATSAPP_VERIFY_TOKEN (el saludo del webhook, lo inventa quien lo configura)
// y WHATSAPP_NUMERO (el número de Nexo como lo marca una persona, para el
// enlace wa.me). WHATSAPP_API_URL cambia la dirección: los tests la apuntan a
// un WhatsApp falso en la misma máquina. WHATSAPP_API_VERSION, la versión de
// la API de Meta.
import { createHmac, timingSafeEqual } from 'node:crypto';

const ESPERA_MAXIMA_MS = 20_000;
// WhatsApp corta el texto de un botón a 20 letras y el cuerpo a 1024.
const LARGO_BOTON = 20;
const LARGO_CUERPO = 1024;
const LARGO_TEXTO = 4096;

export class WhatsAppError extends Error {
  // status: el HTTP de Meta, si contestó. transitorio: no hubo respuesta o fue
  // un 5xx/429.
  constructor(mensaje, { status = null, transitorio = false } = {}) {
    super(mensaje);
    this.status = status;
    this.transitorio = transitorio;
  }
}

const token = () => process.env.WHATSAPP_TOKEN;
const numeroId = () => process.env.WHATSAPP_PHONE_NUMBER_ID;
const secretoApp = () => process.env.WHATSAPP_APP_SECRET;
const version = () => process.env.WHATSAPP_API_VERSION || 'v25.0';
const urlApi = () => (process.env.WHATSAPP_API_URL || 'https://graph.facebook.com').replace(/\/+$/, '');

// Sin las claves no hay canal: Mi cuenta no lo ofrece.
export const whatsAppConfigurado = () =>
  Boolean(token() && numeroId() && secretoApp() && process.env.WHATSAPP_VERIFY_TOKEN && process.env.WHATSAPP_NUMERO);

// El número de Nexo solo con dígitos, para wa.me.
export const numeroDeNexo = () => String(process.env.WHATSAPP_NUMERO ?? '').replace(/\D/g, '');

function iguales(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

// El saludo con que Meta confirma el webhook: devuelve el `challenge` si el
// token es el nuestro, o null.
export function saludoDelWebhook({ modo, tokenRecibido, desafio }) {
  const esperado = process.env.WHATSAPP_VERIFY_TOKEN;
  if (modo !== 'subscribe' || !esperado || !iguales(tokenRecibido ?? '', esperado)) return null;
  return String(desafio ?? '');
}

// Si el aviso lo mandó Meta: la firma es el HMAC del cuerpo tal cual llegó.
export function avisoFirmado(cuerpoCrudo, firma) {
  if (!secretoApp() || !Buffer.isBuffer(cuerpoCrudo) || typeof firma !== 'string' || !firma.startsWith('sha256=')) return false;
  const esperada = createHmac('sha256', secretoApp()).update(cuerpoCrudo).digest('hex');
  return iguales(firma.slice('sha256='.length), esperada);
}

// Los mensajes que trae un aviso, en limpio: { id, de, tipo, texto, audio,
// boton }. tipo es 'texto', 'audio', 'boton' u 'otro'. Los avisos de estado
// (entregado, leído) no traen mensajes y quedan afuera.
export function mensajesDelAviso(cuerpo) {
  const mensajes = [];
  for (const entrada of Array.isArray(cuerpo?.entry) ? cuerpo.entry : []) {
    for (const cambio of Array.isArray(entrada?.changes) ? entrada.changes : []) {
      const valor = cambio?.value;
      // Solo los que llegan al número de Nexo.
      if (numeroId() && valor?.metadata?.phone_number_id && String(valor.metadata.phone_number_id) !== String(numeroId())) continue;
      for (const m of Array.isArray(valor?.messages) ? valor.messages : []) {
        if (typeof m?.id !== 'string' || typeof m?.from !== 'string') continue;
        const base = { id: m.id, de: m.from.replace(/\D/g, '') };
        if (m.type === 'text') mensajes.push({ ...base, tipo: 'texto', texto: String(m.text?.body ?? '') });
        else if (m.type === 'audio') mensajes.push({ ...base, tipo: 'audio', audio: { id: String(m.audio?.id ?? ''), mime: m.audio?.mime_type ?? null } });
        else if (m.type === 'interactive' && m.interactive?.type === 'button_reply') {
          mensajes.push({ ...base, tipo: 'boton', boton: String(m.interactive.button_reply?.id ?? '') });
        } else if (m.type === 'button') mensajes.push({ ...base, tipo: 'boton', boton: String(m.button?.payload ?? '') });
        else mensajes.push({ ...base, tipo: 'otro' });
      }
    }
  }
  return mensajes;
}

async function pedir(ruta, { metodo = 'GET', cuerpo, crudo = false } = {}) {
  let respuesta;
  try {
    respuesta = await fetch(ruta.startsWith('http') ? ruta : `${urlApi()}/${version()}${ruta}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${token()}`, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: AbortSignal.timeout(ESPERA_MAXIMA_MS)
    });
  } catch (err) {
    throw new WhatsAppError(`WhatsApp no contestó: ${err.message}`, { transitorio: true });
  }
  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => '');
    throw new WhatsAppError(`WhatsApp contestó ${respuesta.status}: ${detalle.slice(0, 300)}`, {
      status: respuesta.status,
      transitorio: respuesta.status >= 500 || respuesta.status === 429
    });
  }
  if (crudo) return { buffer: Buffer.from(await respuesta.arrayBuffer()), tipo: respuesta.headers.get('content-type') };
  return respuesta.json();
}

const cortar = (texto, largo) => (texto.length > largo ? `${texto.slice(0, largo - 1)}…` : texto);

export function mandarTexto(para, texto) {
  return pedir(`/${numeroId()}/messages`, {
    metodo: 'POST',
    cuerpo: { messaging_product: 'whatsapp', to: para, type: 'text', text: { body: cortar(String(texto), LARGO_TEXTO) } }
  });
}

// Un texto con botones de respuesta: [{ id, titulo }], hasta 3. El id vuelve en
// el aviso cuando la persona toca el botón.
export function mandarBotones(para, texto, botones) {
  return pedir(`/${numeroId()}/messages`, {
    metodo: 'POST',
    cuerpo: {
      messaging_product: 'whatsapp',
      to: para,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: cortar(String(texto), LARGO_CUERPO) },
        action: {
          buttons: botones.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id, title: cortar(b.titulo, LARGO_BOTON) } }))
        }
      }
    }
  });
}

// El audio de una nota de voz: primero la dirección (vence a los 5 minutos),
// después el archivo, los dos con el token.
export async function bajarAudio(mediaId) {
  const media = await pedir(`/${encodeURIComponent(mediaId)}`);
  if (typeof media?.url !== 'string') throw new WhatsAppError('WhatsApp no dio la dirección del audio.');
  const { buffer, tipo } = await pedir(media.url, { crudo: true });
  return { buffer, mime: media.mime_type ?? tipo ?? 'audio/ogg' };
}
