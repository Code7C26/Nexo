// Entrar con Google (hist. §149), contra un Google falso: la ida con state y
// PKCE, la vuelta que canjea el código, quien ya tiene cuenta (entra), quien
// no (sigue al alta con el mail confirmado y sin contraseña) y lo que no se
// acepta. Va aparte porque cada archivo levanta su servidor, y el alta de
// empresas tiene un tope de intentos por IP.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

import { ACEPTA, crearCliente, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

const CLIENTE = 'nexo-test.apps.googleusercontent.com';
const SECRETO = 'secreto-de-google';

/* ---------- El Google falso ---------- */

// Cada código que "da" Google es de una persona (y puede venir trucho).
const codigos = new Map();
const canjes = [];
let falso;
let base;

const b64 = (objeto) => Buffer.from(JSON.stringify(objeto)).toString('base64url');
const idToken = (datos) => `${b64({ alg: 'RS256', kid: 'x' })}.${b64(datos)}.firma`;

function atender(req, res) {
  let cuerpo = '';
  req.on('data', (p) => (cuerpo += p));
  req.on('end', () => {
    if (req.method === 'POST' && req.url === '/token') {
      const datos = Object.fromEntries(new URLSearchParams(cuerpo));
      canjes.push(datos);
      const pedido = codigos.get(datos.code);
      const ok =
        pedido &&
        datos.client_id === CLIENTE &&
        datos.client_secret === SECRETO &&
        datos.grant_type === 'authorization_code' &&
        createHash('sha256').update(datos.code_verifier ?? '').digest('base64url') === pedido.desafio;
      res.writeHead(ok ? 200 : 400, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(ok ? { id_token: idToken(pedido.persona), access_token: 'x' } : { error: 'invalid_grant' }));
    }
    res.writeHead(404).end();
  });
}

/* ---------- Nexo ---------- */

let servidor;

before(async () => {
  falso = createServer(atender);
  await new Promise((r) => falso.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${falso.address().port}`;
  servidor = await levantarServidor({
    env: { GOOGLE_CLIENT_ID: CLIENTE, GOOGLE_CLIENT_SECRET: SECRETO, GOOGLE_AUTH_URL: `${base}/auth`, GOOGLE_TOKEN_URL: `${base}/token` }
  });
  await registrarEmpresa(servidor, { empresa: 'Kiosco Google', usuario: 'kiosco', email: 'kiosco@nexo.test' });
});

after(async () => {
  await servidor?.cerrar();
  falso?.close();
});

const sinSeguir = { redirect: 'manual' };

// La ida a Google: devuelve el cliente (con la cookie del pedido) y el state.
async function irAGoogle() {
  const cliente = crearCliente(servidor.url);
  const r = await cliente.pedir('GET', '/api/auth/google', undefined, {}, sinSeguir);
  assert.equal(r.status, 302);
  const destino = new URL(r.headers.get('location'));
  return { cliente, destino, state: destino.searchParams.get('state') };
}

// Google "devuelve" a esta persona con un código propio.
async function volver({ cliente, destino, state }, persona, { stateDeVuelta = state } = {}) {
  const code = `codigo-${codigos.size + 1}`;
  codigos.set(code, { persona, desafio: destino.searchParams.get('code_challenge') });
  return cliente.pedir('GET', `/api/auth/google/vuelta?${new URLSearchParams({ code, state: stateDeVuelta })}`, undefined, {}, sinSeguir);
}

const persona = (email, cambios = {}) => ({
  iss: 'https://accounts.google.com',
  aud: CLIENTE,
  exp: Math.floor(Date.now() / 1000) + 3600,
  email,
  email_verified: true,
  name: 'Lucía Pérez',
  ...cambios
});

test('el login lo ofrece, y la ida lleva el cliente, la vuelta exacta, el state y PKCE', async () => {
  assert.equal((await crearCliente(servidor.url).get('/api/auth/estado')).json.google, true);
  const { destino, state } = await irAGoogle();
  assert.equal(destino.origin + destino.pathname, `${base}/auth`);
  assert.equal(destino.searchParams.get('client_id'), CLIENTE);
  assert.equal(destino.searchParams.get('redirect_uri'), `${servidor.url}/api/auth/google/vuelta`);
  assert.equal(destino.searchParams.get('scope'), 'openid email profile');
  assert.equal(destino.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(state && state.length > 20);
});

test('con cuenta, entra directo a su negocio', async () => {
  const ida = await irAGoogle();
  const r = await volver(ida, persona('Kiosco@Nexo.test'));
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/app');
  const estado = (await ida.cliente.get('/api/auth/estado')).json;
  assert.equal(estado.autenticado, true);
  assert.equal(estado.usuario.email, 'kiosco@nexo.test');
  assert.equal(canjes.at(-1).redirect_uri, `${servidor.url}/api/auth/google/vuelta`);
});

test('sin cuenta, sigue al alta con el mail confirmado, y la cuenta nace sin contraseña', async () => {
  const ida = await irAGoogle();
  const r = await volver(ida, persona('lucia@nexo.test'));
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/app#/crear-cuenta');
  const cookie = r.headers.getSetCookie().find((c) => c.startsWith('nexo_google_alta='));
  assert.ok(cookie, 'deja los datos para el alta');
  const datos = JSON.parse(Buffer.from(cookie.split(';')[0].slice('nexo_google_alta='.length), 'base64url'));
  assert.deepEqual([datos.email, datos.nombre], ['lucia@nexo.test', 'Lucía Pérez']);
  assert.equal((await ida.cliente.get('/api/auth/estado')).json.autenticado, false, 'todavía sin sesión');

  const alta = {
    empresa: 'Almacén de Lucía',
    email_cuenta: datos.email,
    nombre: datos.nombre,
    comprobante_email: datos.comprobante,
    ...ACEPTA
  };
  // Sin el comprobante de Google, sin contraseña no hay cuenta.
  assert.equal((await crearCliente(servidor.url).post('/api/auth/registro', { ...alta, comprobante_email: 'otro' })).status, 400);
  const creada = await ida.cliente.post('/api/auth/registro', alta);
  assert.equal(creada.status, 201, creada.texto);
  assert.equal(creada.json.usuario.email, 'lucia@nexo.test');
  // El comprobante sirve una sola vez.
  assert.equal((await crearCliente(servidor.url).post('/api/auth/registro', { ...alta, empresa: 'Otro' })).status, 400);
  // Y la próxima vez entra directo con Google.
  const otraVez = await irAGoogle();
  assert.equal((await volver(otraVez, persona('lucia@nexo.test'))).headers.get('location'), '/app');
});

test('lo que no se acepta: state trucho, cancelar en Google, mail sin verificar, otro cliente o vencido', async () => {
  const trucho = await irAGoogle();
  assert.equal((await volver(trucho, persona('kiosco@nexo.test'), { stateDeVuelta: 'otro' })).headers.get('location'), '/app?google=error');
  const cancelado = await irAGoogle();
  const r = await cancelado.cliente.pedir(
    'GET',
    `/api/auth/google/vuelta?error=access_denied&state=${cancelado.state}`,
    undefined,
    {},
    sinSeguir
  );
  assert.equal(r.headers.get('location'), '/app?google=cancelado');
  for (const mala of [
    persona('kiosco@nexo.test', { email_verified: false }),
    persona('kiosco@nexo.test', { aud: 'otro-cliente' }),
    persona('kiosco@nexo.test', { iss: 'https://otro.example' }),
    persona('kiosco@nexo.test', { exp: Math.floor(Date.now() / 1000) - 10 })
  ]) {
    const ida = await irAGoogle();
    assert.equal((await volver(ida, mala)).headers.get('location'), '/app?google=error', JSON.stringify(mala));
    assert.equal((await ida.cliente.get('/api/auth/estado')).json.autenticado, false);
  }
  // Sin la cookie de la ida, la vuelta no sirve.
  const sinCookie = await crearCliente(servidor.url).pedir('GET', '/api/auth/google/vuelta?code=x&state=y', undefined, {}, sinSeguir);
  assert.equal(sinCookie.headers.get('location'), '/app?google=error');
});
