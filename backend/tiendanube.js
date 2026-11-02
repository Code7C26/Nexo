// Tienda Nube: la primera integración con un canal de venta (etapa G,
// CLAUDE.md §32). Lo que hace este archivo es solo hablar con Tienda Nube:
// - el permiso del negocio (OAuth: la URL para autorizar y el canje del código
//   por el token, que no vence);
// - la API de la tienda (productos, stock y precio, pedidos, webhooks), con el
//   límite de pedidos que pone Tienda Nube;
// - la firma de los webhooks y la del `state` del permiso;
// - el cifrado del token antes de guardarlo.
//
// Como arca.js, no toca la base: qué se publica, qué se vincula y cómo un
// pedido pasa a ser una venta lo decide server.js, por la misma lógica que una
// venta cargada a mano.
//
// TIENDANUBE_AUTH_URL y TIENDANUBE_API_URL cambian las direcciones: los tests
// las apuntan a un Tienda Nube falso en la misma máquina.
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

const VERSION_API = '2025-03';
// Tienda Nube rechaza un pedido sin User-Agent: pide el nombre de la app y un
// contacto.
const USER_AGENT = 'Nexo (nexosystem.app@gmail.com)';
// Lo que se le pide a Tienda Nube no espera más que esto: un pedido colgado no
// puede trabar la sincronización de los demás negocios.
const ESPERA_MAXIMA_MS = 20_000;

export class TiendaNubeError extends Error {
  // status: el HTTP de Tienda Nube, si contestó. transitorio: no hubo
  // respuesta o fue un 5xx/429; se reintenta en la próxima pasada.
  constructor(mensaje, { status = null, transitorio = false } = {}) {
    super(mensaje);
    this.status = status;
    this.transitorio = transitorio;
  }
}

const appId = () => process.env.TIENDANUBE_APP_ID;
const secreto = () => process.env.TIENDANUBE_CLIENT_SECRET;
const urlAuth = () => (process.env.TIENDANUBE_AUTH_URL || 'https://www.tiendanube.com').replace(/\/+$/, '');
const urlApi = () => (process.env.TIENDANUBE_API_URL || 'https://api.tiendanube.com').replace(/\/+$/, '');

// Sin las dos credenciales de la app de Nexo, la integración no se ofrece.
export const tiendaNubeConfigurada = () => Boolean(appId() && secreto());

/* ---------- El permiso (OAuth) ---------- */

// El `state` lleva el negocio y la persona que pidieron conectar, con
// vencimiento, firmado con el secreto de la app: sin guardar nada en el
// servidor, el callback sabe a qué negocio va la tienda y que nadie lo armó.
const ESTADO_DURACION_MS = 15 * 60 * 1000;
const firmar = (texto) => createHmac('sha256', secreto()).update(`estado:${texto}`).digest('base64url');

function iguales(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function firmarEstado({ usuarioId, organizacionId }, ahora = Date.now()) {
  const datos = Buffer.from(JSON.stringify({ u: usuarioId, o: organizacionId, e: ahora + ESTADO_DURACION_MS })).toString(
    'base64url'
  );
  return `${datos}.${firmar(datos)}`;
}

export function leerEstado(estado, ahora = Date.now()) {
  if (typeof estado !== 'string' || !tiendaNubeConfigurada()) return null;
  const [datos, firma] = estado.split('.');
  if (!datos || !firma || !iguales(firma, firmar(datos))) return null;
  try {
    const { u, o, e } = JSON.parse(Buffer.from(datos, 'base64url').toString('utf8'));
    if (!Number.isInteger(u) || !Number.isInteger(o) || !(e > ahora)) return null;
    return { usuarioId: u, organizacionId: o };
  } catch {
    return null;
  }
}

export const urlDeAutorizacion = (estado) =>
  `${urlAuth()}/apps/${encodeURIComponent(appId())}/authorize?state=${encodeURIComponent(estado)}`;

// El código que manda Tienda Nube al callback vence a los 5 minutos y sirve
// una sola vez. user_id es el id de la tienda.
export async function canjearCodigo(codigo) {
  const { json } = await llamar(`${urlAuth()}/apps/authorize/token`, {
    method: 'POST',
    body: { client_id: appId(), client_secret: secreto(), grant_type: 'authorization_code', code: codigo }
  });
  if (!json?.access_token || json.user_id == null) {
    throw new TiendaNubeError(json?.error_description || 'Tienda Nube no dio el permiso.');
  }
  return { token: json.access_token, tiendaId: String(json.user_id), permisos: json.scope ?? '' };
}

/* ---------- Firma de los webhooks ---------- */

// HMAC-SHA256 del cuerpo tal cual llegó, con el secreto de la app, en hex.
export const firmaDelCuerpo = (cuerpoCrudo) => createHmac('sha256', secreto()).update(cuerpoCrudo).digest('hex');
export const firmaValida = (cuerpoCrudo, firma) =>
  Boolean(cuerpoCrudo && firma && tiendaNubeConfigurada()) &&
  iguales(String(firma).toLowerCase(), firmaDelCuerpo(cuerpoCrudo));

/* ---------- El token, cifrado en la base ---------- */

// El token deja escribir en la tienda del negocio: no se guarda en claro. La
// clave sale del secreto de la app (sin una variable nueva que configurar).
// Si el secreto cambia, el token viejo no se puede leer y el negocio vuelve a
// conectar: es lo mismo que pasa en Tienda Nube.
const claveDelToken = () => Buffer.from(hkdfSync('sha256', secreto(), 'nexo', 'tiendanube:token', 32));

export function cifrarToken(token) {
  const iv = randomBytes(12);
  const cifrador = createCipheriv('aes-256-gcm', claveDelToken(), iv);
  const cifrado = Buffer.concat([cifrador.update(token, 'utf8'), cifrador.final()]);
  return ['v1', iv.toString('base64url'), cifrador.getAuthTag().toString('base64url'), cifrado.toString('base64url')].join(
    '.'
  );
}

export function descifrarToken(texto) {
  const [version, iv, etiqueta, cifrado] = String(texto ?? '').split('.');
  if (version !== 'v1' || !iv || !etiqueta || !cifrado || !tiendaNubeConfigurada()) return null;
  try {
    const descifrador = createDecipheriv('aes-256-gcm', claveDelToken(), Buffer.from(iv, 'base64url'));
    descifrador.setAuthTag(Buffer.from(etiqueta, 'base64url'));
    return Buffer.concat([descifrador.update(Buffer.from(cifrado, 'base64url')), descifrador.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/* ---------- La API de la tienda ---------- */

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

async function llamar(url, { method = 'GET', body, headers = {} } = {}) {
  let respuesta;
  try {
    respuesta = await fetch(url, {
      method,
      headers: {
        'User-Agent': USER_AGENT,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(ESPERA_MAXIMA_MS)
    });
  } catch (err) {
    const motivo = err.name === 'TimeoutError' ? 'no contestó a tiempo' : err.message;
    throw new TiendaNubeError(`No se pudo hablar con Tienda Nube (${motivo}).`, { transitorio: true });
  }
  const texto = await respuesta.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    /* sin JSON: queda el texto para el mensaje */
  }
  if (!respuesta.ok) {
    const detalle = json?.description || json?.message || json?.error_description || json?.error || texto.slice(0, 200);
    const err = new TiendaNubeError(
      `Tienda Nube respondió ${respuesta.status}${detalle ? `: ${typeof detalle === 'string' ? detalle : JSON.stringify(detalle)}` : ''}.`,
      { status: respuesta.status, transitorio: respuesta.status === 429 || respuesta.status >= 500 }
    );
    err.espera = Number(respuesta.headers.get('x-rate-limit-reset')) || 0;
    throw err;
  }
  return { json, headers: respuesta.headers };
}

// Un cliente por tienda. El límite de Tienda Nube es un balde de 40 pedidos
// que se vacía a 2 por segundo: con poco margen se espera a que baje, y un 429
// se reintenta hasta 3 veces con la espera que indica.
export function clienteTiendaNube({ tiendaId, token }) {
  let margen = 40;
  let vaciaEn = 0;

  async function pedir(metodo, ruta, cuerpo) {
    for (let intento = 0; ; intento++) {
      if (margen <= 2) await esperar(Math.min(Math.max(vaciaEn - Date.now(), 500), 5000));
      try {
        const { json, headers } = await llamar(`${urlApi()}/${VERSION_API}/${encodeURIComponent(tiendaId)}${ruta}`, {
          method: metodo,
          body: cuerpo,
          // La documentación vieja usa "Authentication" y la nueva
          // "Authorization": van las dos, Tienda Nube ignora la que no lee.
          headers: { Authentication: `bearer ${token}`, Authorization: `Bearer ${token}` }
        });
        margen = headers.has('x-rate-limit-remaining') ? Number(headers.get('x-rate-limit-remaining')) : 40;
        vaciaEn = Date.now() + (Number(headers.get('x-rate-limit-reset')) || 0);
        return json;
      } catch (err) {
        if (err.status === 429 && intento < 3) {
          await esperar(Math.min(Math.max(err.espera, 1000), 10_000));
          continue;
        }
        throw err;
      }
    }
  }

  return {
    tienda: () => pedir('GET', '/store'),
    crearProducto: (producto) => pedir('POST', '/products', producto),
    // Hasta 50 variantes por pedido (límite de Tienda Nube).
    actualizarStockYPrecio: (lote) => pedir('PATCH', '/products/stock-price', lote),
    pedido: (id) => pedir('GET', `/orders/${encodeURIComponent(id)}`),
    pedidos: (filtros) => pedir('GET', `/orders?${new URLSearchParams(filtros)}`),
    webhooks: () => pedir('GET', '/webhooks'),
    crearWebhook: (evento, url) => pedir('POST', '/webhooks', { event: evento, url }),
    borrarWebhook: (id) => pedir('DELETE', `/webhooks/${encodeURIComponent(id)}`)
  };
}

// Los textos de Tienda Nube vienen por idioma ({"es": "...", "pt": "..."}),
// o como texto suelto en algunos campos.
export function textoEnCastellano(valor) {
  if (valor == null) return '';
  if (typeof valor === 'string') return valor;
  return valor.es ?? Object.values(valor).find((v) => typeof v === 'string' && v) ?? '';
}
