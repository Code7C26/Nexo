// El Gmail del negocio (hist. §187), contra un Google y un Gmail falsos:
// conectar con el permiso de mandar (y no conectar si se destildó), que la
// factura salga desde ahí y no desde Nexo, el mail de prueba, Google que deja
// de dar el permiso (no se pasa a Nexo solo) y desconectar.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

const CLIENTE = 'nexo-test.apps.googleusercontent.com';
const SECRETO = 'secreto-de-google';
const PERMISO = 'https://www.googleapis.com/auth/gmail.send';
const PDF = Buffer.from('%PDF-1.4\n% factura de prueba\n').toString('base64');

/* ---------- Google y Gmail falsos ---------- */

const codigos = new Map();
const refrescos = new Map(); // refresh token → si sigue valiendo
const enviados = [];
const revocados = [];
let falso;
let base;

const b64 = (objeto) => Buffer.from(JSON.stringify(objeto)).toString('base64url');
const idToken = (email) =>
  `${b64({ alg: 'RS256' })}.${b64({ iss: 'https://accounts.google.com', aud: CLIENTE, exp: Math.floor(Date.now() / 1000) + 3600, email, email_verified: true, name: 'Lola' })}.firma`;

// Cada token de acceso sale de un refresh token: deja de servir con él.
const accesoDe = (refresh) => `acceso:${refresh}`;

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

/* ---------- Nexo ---------- */

let servidor;
let admin;
let producto;

before(async () => {
  falso = createServer(atender);
  await new Promise((r) => falso.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${falso.address().port}`;
  servidor = await levantarServidor({
    env: {
      GOOGLE_CLIENT_ID: CLIENTE,
      GOOGLE_CLIENT_SECRET: SECRETO,
      GOOGLE_AUTH_URL: `${base}/auth`,
      GOOGLE_TOKEN_URL: `${base}/token`,
      GOOGLE_REVOKE_URL: `${base}/revoke`,
      GMAIL_API_URL: base
    }
  });
  admin = await registrarEmpresa(servidor, { empresa: 'Perfumería Lola', usuario: 'lolagmail' });
  producto = (await admin.post('/api/productos', { nombre: 'Perfume', precio_venta: 30000, tipo: 'servicio' })).json.id;
});

after(async () => {
  await servidor?.cerrar();
  falso?.close();
});

const sinSeguir = { redirect: 'manual' };

// Conectar: la ida (POST /api/gmail/conectar) y la vuelta de Google con un
// código de esta cuenta.
async function conectar(email, { conPermiso = true } = {}) {
  const ida = await admin.post('/api/gmail/conectar');
  assert.equal(ida.status, 200, ida.texto);
  const destino = new URL(ida.json.url);
  const code = `codigo-${codigos.size + 1}`;
  codigos.set(code, { email, conPermiso, desafio: destino.searchParams.get('code_challenge') });
  const vuelta = await admin.pedir(
    'GET',
    `/api/gmail/vuelta?${new URLSearchParams({ code, state: destino.searchParams.get('state') })}`,
    undefined,
    {},
    sinSeguir
  );
  return { destino, vuelta };
}

async function factura(cliente) {
  const cliente_id = (await admin.post('/api/clientes', cliente)).json.id;
  const venta = await admin.post('/api/ventas', { cliente_id, items: [{ producto_id: producto, cantidad: 1, precio_unitario: 30000 }] });
  const r = await admin.post(`/api/ventas/${venta.json.id}/facturar`, { condicion: 'efectivo' });
  assert.equal(r.status, 201, r.texto);
  return r.json.id;
}

// El From con sus trozos en base64 decodificados.
function from(mensaje) {
  const linea = mensaje.split('\r\n').find((l) => l.startsWith('From: ')).slice(6);
  return linea.replace(/=\?UTF-8\?B\?([^?]+)\?=\s*/g, (_, b) => Buffer.from(b, 'base64').toString());
}

test('la ida pide solo el permiso de mandar, con refresh token, PKCE y la vuelta exacta', async () => {
  const ida = await admin.post('/api/gmail/conectar');
  const destino = new URL(ida.json.url);
  assert.equal(destino.origin + destino.pathname, `${base}/auth`);
  assert.equal(destino.searchParams.get('scope'), `openid email ${PERMISO}`);
  assert.equal(destino.searchParams.get('access_type'), 'offline');
  assert.match(destino.searchParams.get('prompt'), /consent/);
  assert.equal(destino.searchParams.get('redirect_uri'), `${servidor.url}/api/gmail/vuelta`);
  assert.equal(destino.searchParams.get('code_challenge_method'), 'S256');
});

test('si en Google se destilda el permiso, no se conecta', async () => {
  const { vuelta } = await conectar('lola@gmail.test', { conPermiso: false });
  assert.equal(vuelta.status, 302);
  assert.equal(vuelta.headers.get('location'), '/app?gmail=sin-permiso#/configuracion/gmail');
  assert.equal((await admin.get('/api/gmail')).json.conectado, false);
});

test('una vuelta con un state trucho no conecta nada', async () => {
  const r = await admin.pedir('GET', '/api/gmail/vuelta?code=x&state=trucho.firma', undefined, {}, sinSeguir);
  assert.equal(r.headers.get('location'), '/app?gmail=error#/configuracion/gmail');
});

test('conectado, la factura sale desde el Gmail del negocio, a su nombre y sin pasar por Nexo', async () => {
  const { vuelta } = await conectar('lola@gmail.test');
  assert.equal(vuelta.headers.get('location'), '/app?gmail=conectado#/configuracion/gmail');
  const estado = (await admin.get('/api/gmail')).json;
  assert.equal(estado.conectado, true);
  assert.equal(estado.direccion, 'lola@gmail.test');
  assert.equal((await admin.get('/api/negocio')).json.gmail.direccion, 'lola@gmail.test');

  const facturaId = await factura({ nombre: 'Ana', email: 'ana@cliente.test' });
  const r = await admin.post(`/api/facturas/${facturaId}/mail`, { para: 'ana@cliente.test', pdf: PDF });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.desde, 'lola@gmail.test');

  const enviado = enviados.at(-1);
  assert.equal(enviado.tipo, 'message/rfc822');
  assert.equal(from(enviado.mensaje), 'Perfumería Lola<lola@gmail.test>');
  const lineas = enviado.mensaje.split('\r\n');
  assert.ok(lineas.includes('To: <ana@cliente.test>'));
  assert.ok(!lineas.some((l) => l.startsWith('Reply-To:')), 'la respuesta ya llega a su Gmail');
  assert.ok(enviado.mensaje.includes('Content-Type: application/pdf'));
  assert.equal(servidor.leerMails('ana@cliente.test').length, 0, 'no salió desde Nexo');
});

test('el mail de prueba llega a la misma casilla', async () => {
  const r = await admin.post('/api/gmail/prueba');
  assert.equal(r.status, 200, r.texto);
  assert.ok(enviados.at(-1).mensaje.split('\r\n').includes('To: <lola@gmail.test>'));
});

test('el empleado no conecta ni ve la página, pero sus facturas salen desde el Gmail', async () => {
  const empleado = await crearEmpleado(servidor, admin, { usuario: 'cajeragmail' });
  assert.equal((await empleado.post('/api/gmail/conectar')).status, 403);
  assert.equal((await empleado.get('/api/gmail')).status, 403);
  const facturaId = await factura({ nombre: 'Bruno' });
  const r = await empleado.post(`/api/facturas/${facturaId}/mail`, { para: 'bruno@cliente.test', pdf: PDF });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.desde, 'lola@gmail.test');
});

test('si Google deja de dar el permiso, la factura no sale desde Nexo: pide reconectar', async () => {
  for (const clave of refrescos.keys()) refrescos.set(clave, false);
  const facturaId = await factura({ nombre: 'Carla' });
  const r = await admin.post(`/api/facturas/${facturaId}/mail`, { para: 'carla@cliente.test', pdf: PDF });
  assert.equal(r.status, 409, r.texto);
  assert.equal(r.json.codigo, 'gmail_desconectado');
  assert.equal(servidor.leerMails('carla@cliente.test').length, 0, 'tampoco salió desde Nexo');
  const estado = (await admin.get('/api/gmail')).json;
  assert.equal(estado.conectado, false);
  assert.equal(estado.desconectado_por_google, true);
  assert.equal((await admin.get(`/api/facturas/${facturaId}`)).json.mail_enviado_a, null);

  // La próxima, sin preguntarle a Google, tampoco sale.
  assert.equal((await admin.post(`/api/facturas/${facturaId}/mail`, { para: 'carla@cliente.test', pdf: PDF })).status, 409);

  // Reconectar lo arregla.
  await conectar('lola@gmail.test');
  const otra = await admin.post(`/api/facturas/${facturaId}/mail`, { para: 'carla@cliente.test', pdf: PDF });
  assert.equal(otra.status, 200, otra.texto);
});

test('desconectar suelta el permiso en Google y las facturas vuelven a salir desde Nexo', async () => {
  const r = await admin.post('/api/gmail/desconectar');
  assert.equal(r.status, 200);
  assert.ok(revocados.at(-1)?.startsWith('refresh-'));
  assert.equal((await admin.get('/api/gmail')).json.conectado, false);

  const facturaId = await factura({ nombre: 'Dani' });
  const enviadosAntes = enviados.length;
  const m = await admin.post(`/api/facturas/${facturaId}/mail`, { para: 'dani@cliente.test', pdf: PDF });
  assert.equal(m.status, 200, m.texto);
  assert.equal(m.json.desde, null);
  assert.equal(enviados.length, enviadosAntes);
  assert.equal(servidor.leerMails('dani@cliente.test').at(-1).nombre, 'Perfumería Lola');
});

// Pasa el negocio a otro plan con scripts/plan.mjs, como planes.test.js.
function ponerPlan(negocioId, plan) {
  const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const r = spawnSync(process.execPath, ['scripts/plan.mjs', '--negocio', String(negocioId), '--plan', plan], {
    cwd: raiz,
    env: { ...process.env, NEXO_DB_PATH: path.join(servidor.dir, 'nexo.db') },
    encoding: 'utf8'
  });
  assert.equal(r.status, 0, r.stderr);
}

test('en Gratis queda en pausa: no conecta ni manda, pero se puede desconectar', async () => {
  await conectar('lola@gmail.test');
  const negocioId = (await admin.get('/api/negocio')).json.id;
  ponerPlan(negocioId, 'gratis');
  try {
    const estado = (await admin.get('/api/gmail')).json;
    assert.equal(estado.plan_lo_incluye, false);
    assert.equal(estado.en_pausa, true);
    const conectarSinPlan = await admin.post('/api/gmail/conectar');
    assert.equal(conectarSinPlan.status, 403);
    assert.equal(conectarSinPlan.json.codigo, 'limite_plan');
    assert.equal((await admin.post('/api/gmail/prueba')).status, 403);
    const facturaId = await factura({ nombre: 'Eli' });
    const enviadosAntes = enviados.length;
    const m = await admin.post(`/api/facturas/${facturaId}/mail`, { para: 'eli@cliente.test', pdf: PDF });
    assert.equal(m.status, 403);
    assert.match(m.json.error, /Emprendedor/);
    assert.equal(enviados.length, enviadosAntes);
    assert.equal(servidor.leerMails('eli@cliente.test').length, 0);
  } finally {
    ponerPlan(negocioId, 'pro');
  }
});

test('el permiso no sale en la descarga de datos del negocio', async () => {
  await conectar('lola@gmail.test');
  const descarga = await admin.get('/api/negocio/exportar');
  assert.equal(descarga.status, 200);
  assert.ok(descarga.texto.includes('lola@gmail.test'), 'la cuenta sí');
  assert.ok(!descarga.texto.includes('v1.'), 'el token cifrado no');
});
