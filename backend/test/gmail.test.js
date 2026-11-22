// El Gmail del negocio (hist. §187), contra un Google y un Gmail falsos:
// conectar con el permiso de mandar (y no conectar si se destildó), que la
// factura salga desde ahí y nunca desde Nexo, el mail de prueba, Google que
// deja de dar el permiso y desconectar (hist. §218: sin Gmail no sale).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';
import { conectarGmail, levantarGoogleFalso, PERMISO } from './google-falso.js';

const PDF = Buffer.from('%PDF-1.4\n% factura de prueba\n').toString('base64');

let google;
let servidor;
let admin;
let producto;

before(async () => {
  google = await levantarGoogleFalso();
  servidor = await levantarServidor({ env: google.env });
  admin = await registrarEmpresa(servidor, { empresa: 'Perfumería Lola', usuario: 'lolagmail' });
  producto = (await admin.post('/api/productos', { nombre: 'Perfume', precio_venta: 30000, tipo: 'servicio' })).json.id;
});

after(async () => {
  await servidor?.cerrar();
  google?.cerrar();
});

const sinSeguir = { redirect: 'manual' };
const conectar = (email, opciones) => conectarGmail(google, admin, email, opciones);

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
  assert.equal(destino.origin + destino.pathname, `${google.base}/auth`);
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

  const enviado = google.enviados.at(-1);
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
  assert.ok(google.enviados.at(-1).mensaje.split('\r\n').includes('To: <lola@gmail.test>'));
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
  for (const clave of google.refrescos.keys()) google.refrescos.set(clave, false);
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

test('desconectar suelta el permiso en Google, y sin Gmail las facturas no salen ni desde Nexo', async () => {
  const r = await admin.post('/api/gmail/desconectar');
  assert.equal(r.status, 200);
  assert.ok(google.revocados.at(-1)?.startsWith('refresh-'));
  assert.equal((await admin.get('/api/gmail')).json.conectado, false);

  const facturaId = await factura({ nombre: 'Dani' });
  const enviadosAntes = google.enviados.length;
  const m = await admin.post(`/api/facturas/${facturaId}/mail`, { para: 'dani@cliente.test', pdf: PDF });
  assert.equal(m.status, 409, m.texto);
  assert.equal(m.json.codigo, 'gmail_sin_conectar');
  assert.match(m.json.error, /Configuración → Gmail/);
  assert.equal(google.enviados.length, enviadosAntes);
  assert.equal(servidor.leerMails('dani@cliente.test').length, 0, 'la casilla de Nexo no manda facturas');
  assert.equal((await admin.get(`/api/facturas/${facturaId}`)).json.mail_enviado_a, null);
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
    const enviadosAntes = google.enviados.length;
    const m = await admin.post(`/api/facturas/${facturaId}/mail`, { para: 'eli@cliente.test', pdf: PDF });
    assert.equal(m.status, 403);
    assert.match(m.json.error, /Emprendedor/);
    assert.equal(google.enviados.length, enviadosAntes);
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
