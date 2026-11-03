// Mercado Libre: la segunda integración con un canal de venta (etapa G,
// CLAUDE.md §32), sobre la misma base que Tienda Nube. Como tiendanube.js,
// este archivo solo habla con Mercado Libre:
// - el permiso del vendedor (OAuth con PKCE): la URL para autorizar, el canje
//   del código y la renovación del token;
// - la API (el vendedor, sus publicaciones, stock y precio, ventas);
// - la firma del `state` del permiso y el cifrado de los tokens.
//
// La diferencia con Tienda Nube que más pesa: el token dura 6 horas y se
// renueva con un refresh token que sirve una sola vez (cada renovación da uno
// nuevo). Por eso server.js guarda los dos juntos, cifrados, y renueva de a
// uno por vez: dos renovaciones a la par harían que una use un refresh token
// ya gastado, y el vendedor tendría que volver a conectar.
//
// Mercado Libre no firma sus avisos: server.js contesta enseguida y se fía
// solo de lo que devuelve la API con el token del vendedor.
//
// MERCADOLIBRE_AUTH_URL y MERCADOLIBRE_API_URL cambian las direcciones: los
// tests las apuntan a un Mercado Libre falso en la misma máquina.
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

const ESPERA_MAXIMA_MS = 20_000;

export class MercadoLibreError extends Error {
  // status: el HTTP de Mercado Libre, si contestó. transitorio: no hubo
  // respuesta o fue un 5xx/429. codigo: el `error` de su respuesta
  // (invalid_grant, por ejemplo).
  constructor(mensaje, { status = null, transitorio = false, codigo = null } = {}) {
    super(mensaje);
    this.status = status;
    this.transitorio = transitorio;
    this.codigo = codigo;
  }
}

const appId = () => process.env.MERCADOLIBRE_APP_ID;
const secreto = () => process.env.MERCADOLIBRE_CLIENT_SECRET;
const urlAuth = () => (process.env.MERCADOLIBRE_AUTH_URL || 'https://auth.mercadolibre.com.ar').replace(/\/+$/, '');
const urlApi = () => (process.env.MERCADOLIBRE_API_URL || 'https://api.mercadolibre.com').replace(/\/+$/, '');

export const mercadoLibreConfigurada = () => Boolean(appId() && secreto());
export const esNuestraApp = (id) => String(id ?? '') === String(appId() ?? '');

/* ---------- El permiso (OAuth) ---------- */

// El `state` lleva el negocio y la persona que pidieron conectar, con
// vencimiento, firmado con el secreto de la app (como en Tienda Nube). El
// code_verifier de PKCE sale del mismo `state`: no hay que guardarlo en ningún
// lado, y solo el servidor lo puede calcular.
const ESTADO_DURACION_MS = 15 * 60 * 1000;
const firmar = (texto) => createHmac('sha256', secreto()).update(`estado:${texto}`).digest('base64url');
const verificadorDe = (estado) => createHmac('sha256', secreto()).update(`pkce:${estado}`).digest('base64url');

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
  if (typeof estado !== 'string' || !mercadoLibreConfigurada()) return null;
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

// La dirección de vuelta tiene que ser idéntica a la cargada en la app de
// Mercado Libre: la arma server.js con la dirección pública de Nexo.
export function urlDeAutorizacion(estado, redireccion) {
  const desafio = createHash('sha256').update(verificadorDe(estado)).digest('base64url');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: appId(),
    redirect_uri: redireccion,
    state: estado,
    code_challenge: desafio,
    code_challenge_method: 'S256'
  });
  return `${urlAuth()}/authorization?${params}`;
}

// Lo que devuelve Mercado Libre al dar o renovar el permiso. `vence` deja 10
// minutos de margen: un token a punto de vencer se renueva antes de usarlo.
function permisoDe(json) {
  if (!json?.access_token || !json.refresh_token || json.user_id == null) {
    throw new MercadoLibreError(json?.error_description || 'Mercado Libre no dio el permiso.');
  }
  const duracion = (Number(json.expires_in) || 21600) * 1000;
  return {
    token: json.access_token,
    refresh: json.refresh_token,
    vence: Date.now() + duracion - 10 * 60 * 1000,
    usuarioId: String(json.user_id)
  };
}

async function pedirToken(campos) {
  const { json } = await llamar(`${urlApi()}/oauth/token`, {
    method: 'POST',
    form: { client_id: appId(), client_secret: secreto(), ...campos }
  });
  return permisoDe(json);
}

// El código que manda Mercado Libre al callback sirve una sola vez.
export const canjearCodigo = (codigo, estado, redireccion) =>
  pedirToken({ grant_type: 'authorization_code', code: codigo, redirect_uri: redireccion, code_verifier: verificadorDe(estado) });

// Un invalid_grant acá es que el permiso ya no vale (lo sacó el vendedor, o el
// refresh token ya se usó): se marca como 401, que desconecta la integración.
export async function renovarPermiso(refresh) {
  try {
    return await pedirToken({ grant_type: 'refresh_token', refresh_token: refresh });
  } catch (err) {
    if (err.codigo === 'invalid_grant' || err.status === 401) {
      throw new MercadoLibreError('Mercado Libre ya no le da permiso a Nexo: volvé a conectar tu cuenta.', { status: 401 });
    }
    throw err;
  }
}

/* ---------- El permiso, cifrado en la base ---------- */

// El token y el refresh token van juntos y cifrados, con su vencimiento: con
// ellos se publica en la cuenta del vendedor. La clave sale del secreto de la
// app, como en Tienda Nube.
const claveDelToken = () => Buffer.from(hkdfSync('sha256', secreto(), 'nexo', 'mercadolibre:token', 32));

export function cifrarPermiso({ token, refresh, vence }) {
  const iv = randomBytes(12);
  const cifrador = createCipheriv('aes-256-gcm', claveDelToken(), iv);
  const texto = JSON.stringify({ t: token, r: refresh, v: vence });
  const cifrado = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()]);
  return ['v1', iv.toString('base64url'), cifrador.getAuthTag().toString('base64url'), cifrado.toString('base64url')].join(
    '.'
  );
}

export function descifrarPermiso(texto) {
  const [version, iv, etiqueta, cifrado] = String(texto ?? '').split('.');
  if (version !== 'v1' || !iv || !etiqueta || !cifrado || !mercadoLibreConfigurada()) return null;
  try {
    const descifrador = createDecipheriv('aes-256-gcm', claveDelToken(), Buffer.from(iv, 'base64url'));
    descifrador.setAuthTag(Buffer.from(etiqueta, 'base64url'));
    const { t, r, v } = JSON.parse(
      Buffer.concat([descifrador.update(Buffer.from(cifrado, 'base64url')), descifrador.final()]).toString('utf8')
    );
    return t && r ? { token: t, refresh: r, vence: Number(v) || 0 } : null;
  } catch {
    return null;
  }
}

/* ---------- La API ---------- */

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

async function llamar(url, { method = 'GET', body, form, token } = {}) {
  let respuesta;
  try {
    respuesta = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' })
      },
      body: form ? new URLSearchParams(form).toString() : body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(ESPERA_MAXIMA_MS)
    });
  } catch (err) {
    const motivo = err.name === 'TimeoutError' ? 'no contestó a tiempo' : err.message;
    throw new MercadoLibreError(`No se pudo hablar con Mercado Libre (${motivo}).`, { transitorio: true });
  }
  const texto = await respuesta.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    /* sin JSON: queda el texto para el mensaje */
  }
  if (!respuesta.ok) {
    // Mercado Libre explica el rechazo de un cambio en `cause` (una lista).
    const causa = Array.isArray(json?.cause) ? json.cause.map((c) => c?.message).filter(Boolean).join(' ') : '';
    const detalle = causa || json?.message || json?.error_description || json?.error || texto.slice(0, 200);
    throw new MercadoLibreError(`Mercado Libre respondió ${respuesta.status}${detalle ? `: ${detalle}` : ''}.`, {
      status: respuesta.status,
      transitorio: respuesta.status === 429 || respuesta.status >= 500,
      codigo: typeof json?.error === 'string' ? json.error : null
    });
  }
  return { json };
}

// Un cliente por vendedor. `token()` lo da server.js: devuelve uno vigente y
// lo renueva si hace falta. Un 429 (demasiados pedidos) se reintenta hasta 3
// veces, esperando cada vez un poco más.
export function clienteMercadoLibre({ token }) {
  async function pedir(metodo, ruta, cuerpo) {
    for (let intento = 0; ; intento++) {
      try {
        const { json } = await llamar(`${urlApi()}${ruta}`, { method: metodo, body: cuerpo, token: await token() });
        return json;
      } catch (err) {
        if (err.status === 429 && intento < 3) {
          await esperar(1000 * 2 ** intento);
          continue;
        }
        throw err;
      }
    }
  }

  return {
    yo: () => pedir('GET', '/users/me'),
    // Los ids de las publicaciones del vendedor, de a 50 (el tope de la API).
    publicaciones: (vendedorId, { offset = 0, estado } = {}) =>
      pedir(
        'GET',
        `/users/${encodeURIComponent(vendedorId)}/items/search?${new URLSearchParams({
          limit: '50',
          offset: String(offset),
          ...(estado ? { status: estado } : {})
        })}`
      ),
    // Hasta 20 publicaciones por pedido, con los atributos de las variaciones
    // (de ahí sale el SKU de cada una).
    variasPublicaciones: (ids) =>
      pedir('GET', `/items?${new URLSearchParams({ ids: ids.join(','), include_attributes: 'all' })}`),
    publicacion: (id) => pedir('GET', `/items/${encodeURIComponent(id)}?include_attributes=all`),
    actualizarPublicacion: (id, cambios) => pedir('PUT', `/items/${encodeURIComponent(id)}`, cambios),
    venta: (id) => pedir('GET', `/orders/${encodeURIComponent(id)}`),
    ventas: (filtros) => pedir('GET', `/orders/search?${new URLSearchParams(filtros)}`)
  };
}

/* ---------- Lo que se lee de una publicación ---------- */

// El SKU del vendedor: el atributo SELLER_SKU (el que Mercado Libre muestra en
// las ventas), o el campo viejo seller_custom_field si no lo cargó.
export function skuDe(objeto) {
  const atributo = (objeto?.attributes ?? []).find((a) => a?.id === 'SELLER_SKU');
  const valor = atributo?.value_name ?? atributo?.values?.[0]?.name ?? objeto?.seller_custom_field ?? '';
  return String(valor ?? '').trim();
}

// "Remera (Color: Negro, Talle: M)": el nombre de una variación para mostrar.
export function nombreDeVariacion(titulo, variacion) {
  const valores = (variacion?.attribute_combinations ?? [])
    .map((c) => (c?.name && c?.value_name ? `${c.name}: ${c.value_name}` : c?.value_name))
    .filter(Boolean);
  return valores.length ? `${titulo} (${valores.join(', ')})` : titulo;
}
