// Entrar con Google (hist. §149), sin dependencias: el flujo de OpenID Connect
// con código de autorización y PKCE, del lado del servidor.
//
// 1. urlDeAutorizacion(): a Google con `state` y el desafío PKCE; los dos
//    quedan en una cookie httpOnly del navegador (server.js).
// 2. canjearCodigo(): Google vuelve con un código, que se canjea por el
//    id_token con la clave secreta, servidor a servidor por HTTPS.
// 3. leerIdToken(): los datos de la persona. La firma no se verifica: Google
//    dice que un id_token recibido directo de su endpoint de tokens por HTTPS
//    ya es auténtico. Sí se controla para quién es (aud), quién lo dio (iss),
//    que no venció y que el mail está verificado.
//
// GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET los da la consola de Google Cloud;
// GOOGLE_AUTH_URL y GOOGLE_TOKEN_URL solo cambian en los tests.

import { createHash, randomBytes } from 'node:crypto';

const clienteId = () => process.env.GOOGLE_CLIENT_ID || '';
const secreto = () => process.env.GOOGLE_CLIENT_SECRET || '';
const urlAuth = () => process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth';
const urlToken = () => process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const EMISORES = ['https://accounts.google.com', 'accounts.google.com'];

export const googleConfigurado = () => Boolean(clienteId() && secreto());

export class GoogleError extends Error {}

// Lo que se guarda en la cookie mientras la persona está en Google.
export function nuevoPedido() {
  return { state: randomBytes(24).toString('base64url'), verificador: randomBytes(32).toString('base64url') };
}

export function urlDeAutorizacion({ state, verificador }, vuelta) {
  const url = new URL(urlAuth());
  url.search = new URLSearchParams({
    client_id: clienteId(),
    redirect_uri: vuelta,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: createHash('sha256').update(verificador).digest('base64url'),
    code_challenge_method: 'S256',
    // Que pueda elegir la cuenta, aunque tenga una sola abierta.
    prompt: 'select_account'
  }).toString();
  return url.href;
}

export async function canjearCodigo(codigo, verificador, vuelta) {
  let res;
  try {
    res = await fetch(urlToken(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        code: codigo,
        client_id: clienteId(),
        client_secret: secreto(),
        redirect_uri: vuelta,
        grant_type: 'authorization_code',
        code_verifier: verificador
      }),
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    throw new GoogleError('No se pudo hablar con Google.');
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || typeof json?.id_token !== 'string') throw new GoogleError(`Google no aceptó el código (${json?.error ?? res.status}).`);
  return json.id_token;
}

// La persona del id_token: { email, nombre }.
export function leerIdToken(idToken, ahora = Date.now()) {
  const partes = idToken.split('.');
  if (partes.length !== 3) throw new GoogleError('Google devolvió un id_token que no se entiende.');
  let datos;
  try {
    datos = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
  } catch {
    throw new GoogleError('Google devolvió un id_token que no se entiende.');
  }
  const audiencia = Array.isArray(datos.aud) ? datos.aud : [datos.aud];
  if (!audiencia.includes(clienteId())) throw new GoogleError('El id_token no es para Nexo.');
  if (!EMISORES.includes(datos.iss)) throw new GoogleError('El id_token no lo dio Google.');
  if (!(Number(datos.exp) * 1000 > ahora)) throw new GoogleError('El id_token venció.');
  if (typeof datos.email !== 'string' || datos.email_verified !== true) throw new GoogleError('Google no tiene ese mail verificado.');
  const nombre = typeof datos.name === 'string' && datos.name.trim() ? datos.name.trim() : datos.email.split('@')[0];
  return { email: datos.email.trim().toLowerCase(), nombre: nombre.slice(0, 120) };
}
