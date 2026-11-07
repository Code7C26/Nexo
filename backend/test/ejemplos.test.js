// "Probar sin registrarse": un negocio de ejemplo por visitante, armado en el
// momento (la reserva arranca en 0 fuera de producción), aislado de los
// demás, sin poder tocar lo que pide una cuenta de verdad, fuera del panel de
// la plataforma, y borrado entero al vencer.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

import { crearCliente, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

const carpeta = mkdtempSync(path.join(tmpdir(), 'nexo-ejemplos-'));
const dbPath = path.join(carpeta, 'nexo.db');
const ENV = { NEXO_ADMIN_PLATAFORMA: 'duenio@nexo.test' };
let servidor;
let duenio;
let visitante;
let otro;

before(async () => {
  servidor = await levantarServidor({ dbPath, env: ENV });
  duenio = await registrarEmpresa(servidor, { empresa: 'Negocio Real', usuario: 'duenio' });
  visitante = crearCliente(servidor.url);
  otro = crearCliente(servidor.url);
});

after(async () => {
  await servidor?.cerrar();
  rmSync(carpeta, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

function enBase(fn) {
  const base = new DatabaseSync(dbPath);
  try {
    return fn(base);
  } finally {
    base.close();
  }
}

// Reinicia sobre la misma base y el mismo puerto, así los clientes logueados
// siguen apuntando a él (como en baja.test.js).
async function reiniciar(env = {}) {
  const { url } = servidor;
  await servidor.cerrar();
  servidor = { ...(await levantarServidor({ dbPath, env: { ...ENV, ...env, PORT: new URL(url).port } })), url };
}

test('el login sabe que se puede probar, y la lista trae los cinco negocios', async () => {
  assert.equal((await crearCliente(servidor.url).get('/api/auth/estado')).json.ejemplos, true);
  const r = await crearCliente(servidor.url).get('/api/ejemplos');
  assert.equal(r.status, 200);
  assert.equal(r.json.disponible, true);
  assert.deepEqual(
    r.json.negocios.map((n) => n.clave),
    ['lola', 'mafaldas', 'gimnasio', 'clima', 'carniceria']
  );
  assert.ok(r.json.negocios.every((n) => n.nombre && n.tipo && n.muestra && n.listo === false));
});

test('un tipo que no existe no arma nada', async () => {
  const r = await crearCliente(servidor.url).post('/api/ejemplos', { negocio: 'restaurante' });
  assert.equal(r.status, 400);
});

test('entrar a probar: un negocio armado con su historia, sin términos que aceptar', async () => {
  const r = await visitante.post('/api/ejemplos', { negocio: 'clima' });
  assert.equal(r.status, 201, r.texto);
  const { usuario } = r.json;
  assert.equal(usuario.rol, 'admin');
  assert.equal(usuario.terminos_al_dia, true);
  assert.equal(usuario.ejemplo.negocio, 'Clima Sur');
  assert.ok(usuario.ejemplo.vence);

  const estado = await visitante.get('/api/auth/estado');
  assert.equal(estado.json.usuario.ejemplo.negocio, 'Clima Sur');
  const ventas = await visitante.get('/api/ventas');
  assert.equal(ventas.status, 200);
  assert.ok(ventas.json.length > 10, 'tiene que traer semanas de ventas');
  // Puede cargar cosas como cualquier admin.
  const cliente = await visitante.post('/api/clientes', { nombre: 'Cliente del visitante' });
  assert.equal(cliente.status, 201, cliente.texto);
});

test('cada visitante tiene el suyo: no ve lo que cargó otro', async () => {
  const r = await otro.post('/api/ejemplos', { negocio: 'clima' });
  assert.equal(r.status, 201, r.texto);
  assert.notEqual(r.json.usuario.organizacion_id, (await visitante.get('/api/auth/estado')).json.usuario.organizacion_id);
  const clientes = (await otro.get('/api/clientes')).json;
  assert.ok(!clientes.some((c) => c.nombre === 'Cliente del visitante'));
});

test('lo que pide una cuenta de verdad se rechaza', async () => {
  for (const [ruta, cuerpo] of [
    ['/api/invitaciones', { email: 'alguien@nexo.test', rol: 'empleado' }],
    ['/api/negocios', { nombre: 'Otro', rubro: 'comercio' }],
    ['/api/auth/email', { email: 'mio@nexo.test' }],
    ['/api/auth/cambiar-password', { actual: 'x', nueva: 'clave-nueva-123' }],
    ['/api/negocio/baja', { nombre: 'Clima Sur', password: 'x' }],
    ['/api/whatsapp/vincular', {}]
  ]) {
    const r = await visitante.post(ruta, cuerpo);
    assert.equal(r.status, 403, `${ruta}: ${r.texto}`);
    assert.equal(r.json.codigo, 'solo_con_cuenta', ruta);
  }
  // Leer, sí.
  assert.equal((await visitante.get('/api/negocio')).status, 200);
});

test('el panel de la plataforma no cuenta los negocios de ejemplo', async () => {
  const resumen = (await duenio.get('/api/plataforma/resumen')).json;
  assert.equal(resumen.negocios.total, 1);
  assert.equal(resumen.cuentas.total, 1);
  assert.equal(resumen.pruebas.abiertas, 2);
  const negocios = (await duenio.get('/api/plataforma/negocios')).json;
  assert.deepEqual(
    negocios.map((n) => n.nombre),
    ['Negocio Real']
  );
  assert.equal((await duenio.get('/api/plataforma/cuentas')).json.length, 1);
});

test('al vencer se borra entero: datos, cuenta y negocio, sin tocar los demás', async () => {
  const orgId = (await visitante.get('/api/auth/estado')).json.usuario.organizacion_id;
  const realAntes = (await duenio.get('/api/productos')).json;
  enBase((base) => base.prepare("UPDATE organizaciones SET ejemplo_vence = datetime('now', '-1 minute') WHERE id = ?").run(orgId));
  await reiniciar();
  enBase((base) => {
    assert.equal(base.prepare('SELECT COUNT(*) AS n FROM organizaciones WHERE id = ?').get(orgId).n, 0);
    assert.equal(base.prepare('SELECT COUNT(*) AS n FROM usuarios WHERE organizacion_id = ?').get(orgId).n, 0);
    assert.equal(base.prepare('SELECT COUNT(*) AS n FROM ventas WHERE organizacion_id = ?').get(orgId).n, 0);
  });
  assert.equal((await visitante.get('/api/ventas')).status, 401);
  // El del otro visitante sigue, y el negocio real también.
  assert.equal((await otro.get('/api/ventas')).status, 200);
  assert.deepEqual((await duenio.get('/api/productos')).json, realAntes);
});

test('con NEXO_EJEMPLOS=off no se puede probar', async () => {
  await reiniciar({ NEXO_EJEMPLOS: 'off' });
  const anonimo = crearCliente(servidor.url);
  assert.equal((await anonimo.get('/api/auth/estado')).json.ejemplos, false);
  assert.equal((await anonimo.post('/api/ejemplos', { negocio: 'lola' })).status, 403);
});
