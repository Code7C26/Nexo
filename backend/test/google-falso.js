// Un Google y un Gmail falsos para los tests (hist. §187): el permiso con
// PKCE, el refresh token, el envío y la revocación. Las facturas por mail
// salen solo desde el Gmail del negocio (hist. §218), así que todo test que
// las manda conecta uno con conectarGmail().
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

export const CLIENTE = 'nexo-test.apps.googleusercontent.com';
const SECRETO = 'secreto-de-google';
export const PERMISO = 'https://www.googleapis.com/auth/gmail.send';

const b64 = (objeto) => Buffer.from(JSON.stringify(objeto)).toString('base64url');
const idToken = (email) =>
  `${b64({ alg: 'RS256' })}.${b64({ iss: 'https://accounts.google.com', aud: CLIENTE, exp: Math.floor(Date.now() / 1000) + 3600, email, email_verified: true, name: 'Lola' })}.firma`;

// Cada token de acceso sale de un refresh token: deja de servir con él.
const accesoDe = (refresh) => `acceso:${refresh}`;

// Levanta el falso. `env` va a levantarServidor; `refrescos` dice qué permiso
// sigue valiendo (ponerlo en false es Google que lo saca); `enviados` son los
// mensajes crudos que llegaron a Gmail.
export async function levantarGoogleFalso() {
  const codigos = new Map();
  const refrescos = new Map();
  const enviados = [];
  const revocados = [];

  function atender(req, res) {
    let cuerpo = '';
    req.on('data', (p) => (cuerpo += p));
    req.on('end', () => {
      const responder = (status, json) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(json));
      };
      if (req.method === 'POST' && req.url === '/token') {
        const datos = Object.fromEntries(new URLSearchParams(cuerpo));
        if (datos.client_id !== CLIENTE || datos.client_secret !== SECRETO) return responder(401, { error: 'invalid_client' });
        if (datos.grant_type === 'authorization_code') {
          const pedido = codigos.get(datos.code);
          const pkce = createHash('sha256').update(datos.code_verifier ?? '').digest('base64url') === pedido?.desafio;
          if (!pedido || !pkce) return responder(400, { error: 'invalid_grant' });
          const refresh = `refresh-${datos.code}`;
          refrescos.set(refresh, true);
          return responder(200, {
            id_token: idToken(pedido.email),
            access_token: accesoDe(refresh),
            expires_in: 3599,
            refresh_token: refresh,
            scope: pedido.conPermiso ? `openid ${PERMISO} https://www.googleapis.com/auth/userinfo.email` : 'openid https://www.googleapis.com/auth/userinfo.email'
          });
        }
        if (datos.grant_type === 'refresh_token') {
          if (!refrescos.get(datos.refresh_token)) return responder(400, { error: 'invalid_grant' });
          return responder(200, { access_token: accesoDe(datos.refresh_token), expires_in: 3599 });
        }
        return responder(400, { error: 'unsupported_grant_type' });
      }
      if (req.method === 'POST' && req.url === '/revoke') {
        revocados.push(new URLSearchParams(cuerpo).get('token'));
        return responder(200, {});
      }
      if (req.method === 'POST' && req.url === '/upload/gmail/v1/users/me/messages/send?uploadType=media') {
        const token = (req.headers.authorization ?? '').replace('Bearer ', '');
        if (!refrescos.get(token.replace(/^acceso:/, ''))) return responder(401, { error: { message: 'Invalid Credentials' } });
        enviados.push({ tipo: req.headers['content-type'], mensaje: cuerpo });
        return responder(200, { id: `msg-${enviados.length}` });
      }
      res.writeHead(404).end();
    });
  }

  const servidor = createServer(atender);
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  return {
    base,
    codigos,
    refrescos,
    enviados,
    revocados,
    env: {
      GOOGLE_CLIENT_ID: CLIENTE,
      GOOGLE_CLIENT_SECRET: SECRETO,
      GOOGLE_AUTH_URL: `${base}/auth`,
      GOOGLE_TOKEN_URL: `${base}/token`,
      GOOGLE_REVOKE_URL: `${base}/revoke`,
      GMAIL_API_URL: base
    },
    // Los mensajes que salieron para `para`, ya leídos (leerMensaje).
    mandadosA: (para) => enviados.filter((e) => e.mensaje.split('\r\n').includes(`To: <${para}>`)).map((e) => leerMensaje(e.mensaje)),
    cerrar: () => servidor.close()
  };
}

// Conectar el Gmail de `cliente` (un admin): la ida (POST /api/gmail/conectar)
// y la vuelta de Google con un código de esta cuenta.
export async function conectarGmail(google, cliente, email, { conPermiso = true } = {}) {
  const ida = await cliente.post('/api/gmail/conectar');
  assert.equal(ida.status, 200, ida.texto);
  const destino = new URL(ida.json.url);
  const code = `codigo-${google.codigos.size + 1}`;
  google.codigos.set(code, { email, conPermiso, desafio: destino.searchParams.get('code_challenge') });
  const vuelta = await cliente.pedir(
    'GET',
    `/api/gmail/vuelta?${new URLSearchParams({ code, state: destino.searchParams.get('state') })}`,
    undefined,
    {},
    { redirect: 'manual' }
  );
  return { destino, vuelta };
}

// Un encabezado con sus líneas de continuación y los trozos en base64
// decodificados.
function encabezado(lineas, nombre) {
  const desde = lineas.findIndex((l) => l.startsWith(`${nombre}: `));
  if (desde === -1) return null;
  let crudo = lineas[desde].slice(nombre.length + 2);
  for (let i = desde + 1; lineas[i]?.startsWith(' '); i++) crudo += lineas[i].trim();
  return crudo.replace(/=\?UTF-8\?B\?([^?]+)\?=\s*/g, (_, b) => Buffer.from(b, 'base64').toString());
}

const base64DeParte = (bloque) => Buffer.from(bloque.replace(/\r\n/g, ''), 'base64');

// El mensaje crudo de mail.js (armarMensaje), con lo que miran los tests.
export function leerMensaje(mensaje) {
  const lineas = mensaje.split('\r\n');
  const texto = mensaje.match(/Content-Type: text\/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n(?:--|$)/);
  const adjuntos = [
    ...mensaje.matchAll(
      /Content-Type: ([^;\r\n]+); name="[^"]*"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename="([^"]*)"\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/g
    )
  ].map(([, tipo, nombre, contenido]) => {
    const bytes = base64DeParte(contenido);
    return { nombre, tipo, bytes: bytes.length, comienzo: bytes.subarray(0, 8).toString('latin1') };
  });
  return {
    crudo: mensaje,
    de: encabezado(lineas, 'From'),
    responderA: encabezado(lineas, 'Reply-To'),
    asunto: encabezado(lineas, 'Subject'),
    texto: texto ? base64DeParte(texto[1]).toString('utf8') : '',
    adjuntos
  };
}
