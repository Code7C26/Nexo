// Notificaciones en el celular y la compu (Web Push, hist. §146), sin
// dependencias: el navegador da una dirección de su servicio de push (la de
// Google en Chrome, la de Apple en un iPhone con Nexo instalado, la de Mozilla
// en Firefox) y dos claves. Nexo le manda ahí el aviso cifrado para ese
// navegador (RFC 8291, aes128gcm) y firmado con su par de claves VAPID
// (RFC 8292, ES256), todo con node:crypto.
//
// Las claves VAPID son de la instalación, no de cada negocio: el navegador las
// recuerda al suscribirse, así que cambiarlas deja mudas todas las
// suscripciones. server.js las guarda en la base (ajustes_servidor) la primera
// vez que hacen falta.

import { createCipheriv, createECDH, createPrivateKey, generateKeyPairSync, hkdfSync, randomBytes, sign } from 'node:crypto';

const b64url = (buffer) => Buffer.from(buffer).toString('base64url');
const deB64url = (texto) => Buffer.from(texto, 'base64url');

// Un par nuevo, como JWK (d, x, y). La pública que se le da al navegador es
// el punto sin comprimir: 0x04 || x || y.
export function clavesVapidNuevas() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const { d, x, y } = privateKey.export({ format: 'jwk' });
  return { d, x, y };
}
export const clavePublicaVapid = ({ x, y }) => b64url(Buffer.concat([Buffer.from([4]), deB64url(x), deB64url(y)]));

// El permiso para el servicio de push: un JWT ES256 por origen, que vale
// 12 horas (el máximo es 24).
function encabezadoVapid(endpoint, claves, contacto) {
  const encabezado = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const datos = b64url(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: contacto }));
  const llave = createPrivateKey({ key: { kty: 'EC', crv: 'P-256', ...claves }, format: 'jwk' });
  const firma = sign('sha256', Buffer.from(`${encabezado}.${datos}`), { key: llave, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${encabezado}.${datos}.${b64url(firma)}, k=${clavePublicaVapid(claves)}`;
}

// El aviso cifrado para un navegador (RFC 8291): un registro solo, con la
// clave pública efímera de Nexo en el encabezado.
export function cifrarAviso(texto, { p256dh, auth }) {
  const delNavegador = deB64url(p256dh);
  const efimera = createECDH('prime256v1');
  efimera.generateKeys();
  const publicaNexo = efimera.getPublicKey();
  const compartido = efimera.computeSecret(delNavegador);
  const info = Buffer.concat([Buffer.from('WebPush: info\0'), delNavegador, publicaNexo]);
  const ikm = Buffer.from(hkdfSync('sha256', compartido, deB64url(auth), info, 32));
  const sal = randomBytes(16);
  const cek = Buffer.from(hkdfSync('sha256', ikm, sal, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, sal, Buffer.from('Content-Encoding: nonce\0'), 12));
  const cifrador = createCipheriv('aes-128-gcm', cek, nonce);
  // 0x02: el delimitador del último (y único) registro.
  const cifrado = Buffer.concat([cifrador.update(Buffer.concat([Buffer.from(texto), Buffer.from([2])])), cifrador.final(), cifrador.getAuthTag()]);
  const tamano = Buffer.alloc(4);
  tamano.writeUInt32BE(4096);
  return Buffer.concat([sal, tamano, Buffer.from([publicaNexo.length]), publicaNexo, cifrado]);
}

// Los servicios de push de los navegadores. Una dirección de otro lado no se
// usa: si no, cualquiera con una cuenta haría que el servidor le pegue a una
// dirección interna. NEXO_PUSH_HOSTS suma otros (los tests, con uno falso).
const HOSTS_PUSH = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
export function direccionDePushValida(endpoint) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  const extra = (process.env.NEXO_PUSH_HOSTS || '').split(',').map((h) => h.trim()).filter(Boolean);
  if (extra.includes(url.host)) return true;
  return url.protocol === 'https:' && HOSTS_PUSH.some((patron) => patron.test(url.hostname));
}

// Manda un aviso. Devuelve 'ok', 'vencida' (el navegador ya no la tiene: se
// borra) o 'error'. Nunca tira: un aviso que no sale no frena lo que lo causó.
export async function mandarAviso(suscripcion, aviso, { claves, contacto }) {
  try {
    const res = await fetch(suscripcion.endpoint, {
      method: 'POST',
      headers: {
        Authorization: encabezadoVapid(suscripcion.endpoint, claves, contacto),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '86400',
        Urgency: aviso.urgente ? 'high' : 'normal'
      },
      body: cifrarAviso(JSON.stringify(aviso), suscripcion),
      signal: AbortSignal.timeout(10000)
    });
    if (res.status === 404 || res.status === 410) return 'vencida';
    return res.ok ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}
