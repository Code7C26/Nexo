// Gmail del negocio (hist. §187): las facturas salen desde la casilla del
// negocio y no desde la de Nexo. Sin dependencias, como google.js.
//
// 1. urlDeAutorizacion(): a Google con el permiso de mandar mails
//    (gmail.send, el único: no deja leer ni borrar nada), `state` firmado con
//    el negocio y la persona, y PKCE. access_type=offline para que Google dé
//    un refresh token, y prompt=consent para que lo dé aunque ya lo haya dado.
// 2. canjearCodigo(): el código por el refresh token y el mail de la cuenta.
//    Google deja destildar el permiso en su pantalla: si no vino, no se
//    conecta.
// 3. mandarMensaje(): pide un token de acceso con el refresh token (dura una
//    hora; se guarda en memoria) y sube el mensaje MIME tal cual lo arma
//    mail.js, por el endpoint de subida (hasta 35 MB, sin pasarlo a base64).
//
// Usa el mismo cliente de Google que "Entrar con Google" (GOOGLE_CLIENT_ID y
// GOOGLE_CLIENT_SECRET); la dirección de vuelta /api/gmail/vuelta se suma en
// la consola de Google Cloud (docs/proyecto/verificacion-google.md).
// GMAIL_API_URL, GOOGLE_AUTH_URL y GOOGLE_TOKEN_URL solo cambian en los tests.

import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

import { googleConfigurado, leerIdToken } from './google.js';

export const PERMISO_GMAIL = 'https://www.googleapis.com/auth/gmail.send';

const clienteId = () => process.env.GOOGLE_CLIENT_ID || '';
const secreto = () => process.env.GOOGLE_CLIENT_SECRET || '';
const urlAuth = () => process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth';
const urlToken = () => process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const urlRevocar = () => process.env.GOOGLE_REVOKE_URL || 'https://oauth2.googleapis.com/revoke';
const urlApi = () => (process.env.GMAIL_API_URL || 'https://gmail.googleapis.com').replace(/\/+$/, '');

export const gmailConfigurado = googleConfigurado;

// `revocado`: Google ya no le da permiso a Nexo (el negocio lo sacó desde su
// cuenta, cambió la contraseña o venció en el modo de prueba). Hay que
// conectar de nuevo; reintentar no sirve.
export class GmailError extends Error {
  constructor(mensaje, { revocado = false } = {}) {
    super(mensaje);
    this.revocado = revocado;
  }
}

/* ---------- El pedido (state y PKCE) ---------- */

// Como en Mercado Pago: el `state` lleva el negocio y la persona, con
// vencimiento, firmado con el secreto; el code_verifier sale del mismo state.
const ESTADO_DURACION_MS = 15 * 60 * 1000;
const firmar = (texto) => createHmac('sha256', secreto()).update(`gmail:estado:${texto}`).digest('base64url');
const verificadorDe = (estado) => createHmac('sha256', secreto()).update(`gmail:pkce:${estado}`).digest('base64url');

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
  if (typeof estado !== 'string' || !gmailConfigurado()) return null;
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

export function urlDeAutorizacion(estado, vuelta, { mail } = {}) {
  const url = new URL(urlAuth());
  url.search = new URLSearchParams({
    client_id: clienteId(),
    redirect_uri: vuelta,
    response_type: 'code',
    scope: `openid email ${PERMISO_GMAIL}`,
    state: estado,
    code_challenge: createHash('sha256').update(verificadorDe(estado)).digest('base64url'),
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent select_account',
    ...(mail ? { login_hint: mail } : {})
  }).toString();
  return url.href;
}

async function pedirToken(parametros) {
  let res;
  try {
    res = await fetch(urlToken(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ client_id: clienteId(), client_secret: secreto(), ...parametros }),
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    throw new GmailError('No se pudo hablar con Google.');
  }
  const json = await res.json().catch(() => null);
  return { ok: res.ok, json: json ?? {} };
}

// { direccion, nombre, refresh }.
export async function canjearCodigo(codigo, estado, vuelta) {
  const { ok, json } = await pedirToken({
    code: codigo,
    redirect_uri: vuelta,
    grant_type: 'authorization_code',
    code_verifier: verificadorDe(estado)
  });
  if (!ok || typeof json.id_token !== 'string') throw new GmailError(`Google no aceptó el código (${json.error ?? 'sin respuesta'}).`);
  const permisos = String(json.scope ?? '').split(' ');
  if (!permisos.includes(PERMISO_GMAIL)) throw new GmailError('sin-permiso');
  if (typeof json.refresh_token !== 'string' || !json.refresh_token) throw new GmailError('Google no dio el permiso para seguir mandando.');
  const persona = leerIdToken(json.id_token);
  if (typeof json.access_token === 'string') {
    tokens.set(claveDe(json.refresh_token), {
      token: json.access_token,
      vence: Date.now() + (Number(json.expires_in) || 3600) * 1000
    });
  }
  return { direccion: persona.email, nombre: persona.nombre, refresh: json.refresh_token };
}

/* ---------- El permiso, cifrado en la base ---------- */

// El refresh token deja mandar mails como el negocio: no se guarda en claro.
// La clave sale del secreto de Google, como en Tienda Nube y Mercado Libre.
const claveDelToken = () => Buffer.from(hkdfSync('sha256', secreto(), 'nexo', 'gmail:token', 32));

export function cifrarPermiso(refresh) {
  const iv = randomBytes(12);
  const cifrador = createCipheriv('aes-256-gcm', claveDelToken(), iv);
  const cifrado = Buffer.concat([cifrador.update(refresh, 'utf8'), cifrador.final()]);
  return ['v1', iv.toString('base64url'), cifrador.getAuthTag().toString('base64url'), cifrado.toString('base64url')].join(
    '.'
  );
}

export function descifrarPermiso(texto) {
  const [version, iv, etiqueta, cifrado] = String(texto ?? '').split('.');
  if (version !== 'v1' || !iv || !etiqueta || !cifrado || !gmailConfigurado()) return null;
  try {
    const descifrador = createDecipheriv('aes-256-gcm', claveDelToken(), Buffer.from(iv, 'base64url'));
    descifrador.setAuthTag(Buffer.from(etiqueta, 'base64url'));
    return Buffer.concat([descifrador.update(Buffer.from(cifrado, 'base64url')), descifrador.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/* ---------- Mandar ---------- */

// El token de acceso de cada cuenta, en memoria: dura una hora y pedirlo de
// nuevo en cada mail sería un viaje más a Google. Un reinicio lo pierde, y se
// pide otro.
const tokens = new Map();
const claveDe = (refresh) => createHash('sha256').update(refresh).digest('hex');

async function tokenDeAcceso(refresh) {
  const guardado = tokens.get(claveDe(refresh));
  if (guardado && guardado.vence > Date.now() + 60_000) return guardado.token;
  const { ok, json } = await pedirToken({ refresh_token: refresh, grant_type: 'refresh_token' });
  if (!ok || typeof json.access_token !== 'string') {
    if (json.error === 'invalid_grant' || json.error === 'unauthorized_client') {
      throw new GmailError('Google ya no le da permiso a Nexo para mandar desde ese Gmail.', { revocado: true });
    }
    throw new GmailError(`Google no dio el permiso para mandar (${json.error ?? 'sin respuesta'}).`);
  }
  tokens.set(claveDe(refresh), { token: json.access_token, vence: Date.now() + (Number(json.expires_in) || 3600) * 1000 });
  return json.access_token;
}

export function olvidarToken(refresh) {
  if (refresh) tokens.delete(claveDe(refresh));
}

// `mensaje` es el texto MIME completo (mail.armarMensaje). Gmail pone como
// remitente la cuenta conectada, sea cual sea el From.
export async function mandarMensaje(refresh, mensaje) {
  const enviar = async (token) => {
    try {
      return await fetch(`${urlApi()}/upload/gmail/v1/users/me/messages/send?uploadType=media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'message/rfc822' },
        body: mensaje,
        signal: AbortSignal.timeout(30000)
      });
    } catch {
      throw new GmailError('No se pudo hablar con Gmail.');
    }
  };
  let res = await enviar(await tokenDeAcceso(refresh));
  // Un token que Google dio por vencido antes de hora: se pide otro, una vez.
  if (res.status === 401) {
    olvidarToken(refresh);
    res = await enviar(await tokenDeAcceso(refresh));
  }
  if (res.ok) return (await res.json().catch(() => ({}))).id ?? null;
  const json = await res.json().catch(() => null);
  const motivo = json?.error?.message ?? `HTTP ${res.status}`;
  if (res.status === 401 || res.status === 403) {
    throw new GmailError(`Gmail no dejó mandar: ${motivo}`, { revocado: res.status === 401 || /insufficient|scope/i.test(motivo) });
  }
  throw new GmailError(`Gmail no mandó el mail: ${motivo}`);
}

// Al desconectar, se le avisa a Google que suelte el permiso. Si no contesta,
// igual queda desconectado en Nexo (el token ya no se guarda).
export async function revocar(refresh) {
  olvidarToken(refresh);
  try {
    await fetch(urlRevocar(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: refresh }),
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    // Queda en la cuenta de Google hasta que el negocio lo saque de ahí.
  }
}
