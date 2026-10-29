// La baja (etapa 8b, Fase 4, hist. §109): descargar los datos del negocio,
// darlo de baja (cerrado 30 días, se puede cancelar, y después se borra sin
// tocar a los demás negocios), dar de baja una cuenta y cerrar el alta
// pública con NEXO_REGISTRO=off. Los dos negocios se siembran con el seed,
// así el borrado pasa por todas las tablas que el seed llena.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

import { crearCliente, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';
import { PASSWORD_ADMIN, PASSWORD_EMPLEADO, sembrar } from '../../scripts/seed.mjs';

// La base vive fuera de la carpeta del servidor: el borrado se prueba
// reiniciándolo sobre la misma base, como pasa al arrancar.
const carpeta = mkdtempSync(path.join(tmpdir(), 'nexo-baja-'));
const dbPath = path.join(carpeta, 'nexo.db');
let servidor;
let uno;
let dos;

before(async () => {
  servidor = await levantarServidor({ dbPath });
  uno = await sembrar(servidor.url, { empresa: 'Almacén Uno', prefijo: 'uno', leerMails: servidor.leerMails });
  dos = await sembrar(servidor.url, { empresa: 'Kiosco Dos', prefijo: 'dos', leerMails: servidor.leerMails });
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

// Reinicia el servidor sobre la misma base y en el mismo puerto, así los
// clientes ya logueados siguen apuntando a él. El arnés devuelve la URL del
// puerto que eligió él, no del que se le pasó: se conserva la de antes.
async function reiniciar() {
  const { url } = servidor;
  await servidor.cerrar();
  servidor = { ...(await levantarServidor({ dbPath, env: { PORT: new URL(url).port } })), url };
}

const idDe = async (cliente) => (await cliente.get('/api/negocio')).json.id;

// Lo que ve un negocio en sus listados: no tiene que cambiar cuando se borra
// otro.
const LISTADOS = ['/api/productos', '/api/clientes', '/api/proveedores', '/api/ventas', '/api/compras', '/api/presupuestos', '/api/gastos', '/api/cuentas-tesoreria', '/api/usuarios'];
async function fotoDe(cliente) {
  const foto = {};
  for (const ruta of LISTADOS) foto[ruta] = (await cliente.get(ruta)).json;
  return foto;
}

test('descargar los datos: todo lo del negocio y nada de otro, sin secretos, solo el admin', async () => {
  const unoId = await idDe(uno.admin);
  const r = await uno.admin.get('/api/negocio/exportar');
  assert.equal(r.status, 200, r.texto);
  assert.match(r.headers.get('content-disposition'), /attachment; filename="nexo-almacen-uno-\d{4}-\d{2}-\d{2}\.json"/);
  const { formato, negocio, equipo, tablas } = r.json;
  assert.equal(formato, 'nexo-datos-del-negocio');
  assert.equal(negocio.nombre, 'Almacén Uno');
  assert.deepEqual(equipo.map((p) => p.rol).sort(), ['admin', 'empleado']);
  for (const tabla of ['productos', 'ventas', 'venta_items', 'cobros', 'compras', 'compra_items', 'movimientos_stock', 'auditoria']) {
    assert.ok(tablas[tabla]?.length, `falta ${tabla}`);
  }
  for (const [tabla, filas] of Object.entries(tablas)) {
    for (const fila of filas) {
      if ('organizacion_id' in fila) assert.equal(fila.organizacion_id, unoId, `${tabla} trae una fila de otro negocio`);
    }
  }
  assert.equal(tablas.sesiones, undefined, 'las sesiones no salen');
  assert.doesNotMatch(r.texto, /token_hash|password_hash|password_salt/);

  assert.equal((await uno.empleado.get('/api/negocio/exportar')).status, 403);
});

test('dar de baja pide el nombre y la contraseña, cierra el negocio para todos y se puede cancelar', async () => {
  const pedir = (cuerpo) => uno.admin.post('/api/negocio/baja', cuerpo);
  assert.equal((await pedir({ nombre: 'Otro nombre', password: PASSWORD_ADMIN })).status, 400);
  assert.equal((await pedir({ nombre: 'almacén uno', password: 'mala-clave-1' })).status, 401);
  assert.equal((await uno.empleado.post('/api/negocio/baja', { nombre: 'Almacén Uno', password: PASSWORD_EMPLEADO })).status, 403);

  const baja = await pedir({ nombre: '  almacén uno ', password: PASSWORD_ADMIN });
  assert.equal(baja.status, 200, baja.texto);
  assert.equal(baja.json.usuario.negocio_en_baja.nombre, 'Almacén Uno');
  assert.match(baja.json.usuario.negocio_en_baja.se_borra, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(servidor.leerMails(`${uno.usuarios.admin}@nexo.test`).at(-1).asunto, /Se pidió la baja de Almacén Uno/);

  // Cerrado para los dos roles; queda la cuenta, el cambio de negocio, y
  // para el admin, cancelar y descargar.
  for (const cliente of [uno.admin, uno.empleado]) {
    const r = await cliente.get('/api/productos');
    assert.equal(r.status, 403);
    assert.equal(r.json.codigo, 'negocio_en_baja');
    assert.equal((await cliente.get('/api/auth/estado')).json.usuario.negocio_en_baja.nombre, 'Almacén Uno');
    assert.equal((await cliente.get('/api/negocios')).status, 200);
  }
  assert.ok((await uno.admin.get('/api/negocios')).json[0].se_borra);
  assert.equal((await uno.admin.get('/api/negocio/exportar')).status, 200);
  assert.equal((await uno.empleado.post('/api/negocio/baja/cancelar')).status, 403);

  // El otro negocio, igual que siempre.
  assert.equal((await dos.admin.get('/api/productos')).status, 200);

  const cancelar = await uno.admin.post('/api/negocio/baja/cancelar');
  assert.equal(cancelar.status, 200, cancelar.texto);
  assert.equal(cancelar.json.usuario.negocio_en_baja, null);
  assert.equal((await uno.empleado.get('/api/productos')).status, 200);
  assert.match(servidor.leerMails(`${uno.usuarios.admin}@nexo.test`).at(-1).asunto, /Se canceló la baja/);
  const auditoria = (await uno.admin.get('/api/auditoria')).json.map((f) => f.detalle);
  assert.ok(auditoria.some((d) => /Pidió la baja del negocio/.test(d ?? '')));
  assert.ok(auditoria.some((d) => /Canceló la baja/.test(d ?? '')));
});

test('a los 30 días se borra todo lo del negocio, y el otro queda igual', async () => {
  const unoId = await idDe(uno.admin);
  const fotoDos = await fotoDe(dos.admin);
  assert.equal((await uno.admin.post('/api/negocio/baja', { nombre: 'Almacén Uno', password: PASSWORD_ADMIN })).status, 200);

  // A los 29 días todavía no: reiniciar no lo borra.
  enBase((base) => base.prepare("UPDATE organizaciones SET baja_pedida = datetime('now', '-29 days') WHERE id = ?").run(unoId));
  await reiniciar();
  assert.equal((await uno.admin.get('/api/auth/estado')).json.usuario.negocio_en_baja.nombre, 'Almacén Uno');

  enBase((base) => base.prepare("UPDATE organizaciones SET baja_pedida = datetime('now', '-30 days', '-1 minute') WHERE id = ?").run(unoId));
  await reiniciar();
  assert.match(servidor.salida(), new RegExp(`Negocio #${unoId} dado de baja: se borraron \\d+ filas`));

  enBase((base) => {
    // Ninguna tabla con organizacion_id guarda algo del negocio, salvo las
    // cuentas, que son de las personas.
    const tablas = base
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((t) => t.name)
      .filter((t) => base.prepare(`PRAGMA table_info(${t})`).all().some((c) => c.name === 'organizacion_id'));
    for (const tabla of tablas.filter((t) => t !== 'usuarios')) {
      assert.equal(base.prepare(`SELECT COUNT(*) AS n FROM ${tabla} WHERE organizacion_id = ?`).get(unoId).n, 0, tabla);
    }
    // Y ninguna hija quedó huérfana (los renglones, los cobros): se fueron con
    // sus padres.
    assert.deepEqual(base.prepare('PRAGMA foreign_key_check').all(), []);
    const fila = base.prepare('SELECT nombre, documento, baja_hecha FROM organizaciones WHERE id = ?').get(unoId);
    assert.equal(fila.nombre, 'Negocio dado de baja');
    assert.ok(fila.baja_hecha);
    const rastro = base.prepare("SELECT detalle FROM auditoria WHERE organizacion_id IS NULL AND entidad = 'organizacion' AND entidad_id = ?").get(unoId);
    assert.match(rastro.detalle, /Se borraron los datos del negocio/);
  });

  assert.deepEqual(await fotoDe(dos.admin), fotoDos, 'el otro negocio no cambió');

  // Las cuentas siguen: entran, sin ningún negocio.
  assert.equal((await uno.admin.get('/api/productos')).status, 401, 'las sesiones del negocio se cerraron');
  const login = await crearCliente(servidor.url).post('/api/auth/login', { email: `${uno.usuarios.admin}@nexo.test`, password: PASSWORD_ADMIN });
  assert.equal(login.status, 200, login.texto);
  assert.equal(login.json.usuario.organizacion_id, null);
});

test('dar de baja la cuenta: no deja un negocio sin admin, y saca el nombre, el mail y la contraseña', async () => {
  const mailEmpleado = `${dos.usuarios.empleado}@nexo.test`;
  assert.equal((await dos.empleado.post('/api/auth/baja-cuenta', { password: 'mala-clave-1' })).status, 401);
  const unico = await dos.admin.post('/api/auth/baja-cuenta', { password: PASSWORD_ADMIN });
  assert.equal(unico.status, 409, unico.texto);
  assert.equal(unico.json.codigo, 'unico_admin');
  assert.deepEqual(unico.json.negocios, ['Kiosco Dos']);

  const baja = await dos.empleado.post('/api/auth/baja-cuenta', { password: PASSWORD_EMPLEADO });
  assert.equal(baja.status, 204, baja.texto);
  assert.match(servidor.leerMails(mailEmpleado).at(-1).asunto, /Diste de baja tu cuenta/);
  assert.equal((await dos.empleado.get('/api/auth/estado')).json.autenticado, false);
  const login = await crearCliente(servidor.url).post('/api/auth/login', { email: mailEmpleado, password: PASSWORD_EMPLEADO });
  assert.equal(login.status, 401);

  const usuarios = (await dos.admin.get('/api/usuarios')).json;
  const ex = usuarios.find((u) => u.nombre === 'Cuenta dada de baja');
  assert.ok(ex, 'sigue en la lista, sin su nombre');
  assert.equal(ex.email, null);
  const auditoria = JSON.stringify((await dos.admin.get('/api/auditoria')).json);
  assert.ok(!auditoria.includes(mailEmpleado), 'la auditoría ya no tiene su mail');
  assert.match(auditoria, /Dio de baja su cuenta/);

  // El mail queda libre para una cuenta nueva.
  await registrarEmpresa(servidor, { empresa: 'Vuelve', usuario: dos.usuarios.empleado });
});

test('el campo trampa del alta no manda nada', async () => {
  const r = await crearCliente(servidor.url).post('/api/auth/registro/codigo', { email: 'bot@nexo.test', sitio: 'http://spam' });
  assert.equal(r.status, 204);
  assert.equal(servidor.leerMails('bot@nexo.test').length, 0);
});

test('con NEXO_REGISTRO=off solo se crea la primera cuenta, y después se entra por invitación', async () => {
  const cerrado = await levantarServidor({ env: { NEXO_REGISTRO: 'off' } });
  try {
    assert.equal((await crearCliente(cerrado.url).get('/api/auth/estado')).json.requiere_bootstrap, true);
    const primera = await registrarEmpresa(cerrado, { empresa: 'Único', usuario: 'unico' });
    assert.equal((await primera.get('/api/auth/estado')).json.registro_abierto, false);
    const otra = await crearCliente(cerrado.url).post('/api/auth/registro/codigo', { email: 'otra@nexo.test' });
    assert.equal(otra.status, 403);
    assert.equal(otra.json.codigo, 'registro_cerrado');
    assert.equal((await crearCliente(cerrado.url).post('/api/auth/registro', {})).json.codigo, 'registro_cerrado');
  } finally {
    await cerrado.cerrar();
  }
});
