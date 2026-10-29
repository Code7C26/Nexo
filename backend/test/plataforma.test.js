// El panel de la plataforma (hist. §111): lo ve solo una cuenta de
// NEXO_ADMIN_PLATAFORMA con el mail confirmado, da los totales, las cuentas y
// los negocios, y de cada negocio solo conteos. Para cualquier otra cuenta no
// existe (404), sea admin de su negocio o no.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { crearCliente, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';
import { PASSWORD_ADMIN, sembrar } from '../../scripts/seed.mjs';

const RUTAS = ['/api/plataforma/resumen', '/api/plataforma/cuentas', '/api/plataforma/negocios'];
let servidor;
let duenio;
let uno;

before(async () => {
  // Con espacios y mayúsculas, como puede quedar escrita a mano en el .env.
  servidor = await levantarServidor({ env: { NEXO_ADMIN_PLATAFORMA: ' Duenio@Nexo.test , otra@nexo.test' } });
  duenio = await registrarEmpresa(servidor, { empresa: 'Nexo', usuario: 'duenio' });
  uno = await sembrar(servidor.url, { empresa: 'Almacén Uno', prefijo: 'uno', leerMails: servidor.leerMails });
});

after(async () => {
  await servidor?.cerrar();
});

function enBase(fn) {
  const base = new DatabaseSync(path.join(servidor.dir, 'nexo.db'));
  try {
    return fn(base);
  } finally {
    base.close();
  }
}

test('la sesión dice quién administra la plataforma', async () => {
  assert.equal((await duenio.get('/api/auth/estado')).json.usuario.plataforma, true);
  assert.equal((await uno.admin.get('/api/auth/estado')).json.usuario.plataforma, false);
  assert.equal((await uno.empleado.get('/api/auth/estado')).json.usuario.plataforma, false);
});

test('para cualquier otra cuenta el panel no existe', async () => {
  for (const ruta of RUTAS) {
    for (const cliente of [uno.admin, uno.empleado]) {
      const r = await cliente.get(ruta);
      assert.equal(r.status, 404, ruta);
      assert.deepEqual(r.json, { error: 'Ruta no encontrada.' });
    }
    assert.equal((await crearCliente(servidor.url).get(ruta)).status, 401, ruta);
  }
});

test('el resumen cuenta cuentas, negocios y planes', async () => {
  const r = await duenio.get('/api/plataforma/resumen');
  assert.equal(r.status, 200);
  const { cuentas, negocios, semanas } = r.json;
  // duenio, uno-admin1 y uno-emp1, todas con el mail confirmado y de hoy.
  assert.deepEqual(cuentas, { total: 3, confirmadas: 3, nuevas_7_dias: 3, activas_7_dias: 3, dadas_de_baja: 0 });
  assert.equal(negocios.total, 2);
  assert.equal(negocios.activos_7_dias, 2);
  assert.equal(negocios.en_baja, 0);
  assert.equal(negocios.por_plan.find((p) => p.clave === 'pro').negocios, 2);
  assert.ok(negocios.por_plan.every((p) => p.nombre));
  assert.equal(semanas.length, 8);
  assert.equal(semanas[0].cuentas, 3);
  assert.equal(semanas[0].negocios, 2);
  assert.ok(semanas.slice(1).every((s) => s.cuentas === 0 && s.negocios === 0));
});

test('las cuentas traen sus negocios y nunca la contraseña', async () => {
  const r = await duenio.get('/api/plataforma/cuentas');
  assert.equal(r.status, 200);
  const admin = r.json.find((c) => c.email === 'uno-admin1@nexo.test');
  assert.ok(admin.ultimo_uso, 'tiene que tener un último uso');
  assert.ok(admin.email_verificado);
  assert.deepEqual(
    admin.negocios.map(({ nombre, rol, activo }) => ({ nombre, rol, activo })),
    [{ nombre: 'Almacén Uno', rol: 'admin', activo: true }]
  );
  assert.deepEqual(Object.keys(admin).sort(), [
    'baja',
    'edad',
    'email',
    'email_verificado',
    'fecha_alta',
    'id',
    'negocios',
    'nombre',
    'ultimo_uso'
  ]);
  assert.doesNotMatch(r.texto, /password|salt/);
});

test('los negocios traen conteos, no los datos del negocio', async () => {
  const r = await duenio.get('/api/plataforma/negocios');
  assert.equal(r.status, 200);
  const almacen = r.json.find((n) => n.nombre === 'Almacén Uno');
  assert.ok(almacen.productos > 0);
  assert.ok(almacen.ventas > 0);
  assert.equal(almacen.personas, 2);
  assert.equal(almacen.plan_vigente, 'pro');
  assert.equal(almacen.tipo, 'Comercio general');
  assert.equal(almacen.se_borra, null);
  assert.ok(almacen.ultimo_uso);
  assert.deepEqual(Object.keys(almacen).sort(), [
    'baja_pedida',
    'fecha_alta',
    'id',
    'nombre',
    'personas',
    'plan',
    'plan_nombre',
    'plan_vence',
    'plan_vigente',
    'productos',
    'rubro',
    'se_borra',
    'tipo',
    'ultima_venta',
    'ultimo_uso',
    'ventas',
    'ventas_30_dias'
  ]);
});

test('no depende del negocio que muestra la pestaña', async () => {
  const r = await duenio.pedir('GET', '/api/plataforma/resumen', undefined, { 'X-Nexo-Negocio': '999999' });
  assert.equal(r.status, 200);
});

test('un negocio en baja sale con la fecha en que se borra', async () => {
  const baja = await uno.admin.post('/api/negocio/baja', { nombre: 'Almacén Uno', password: PASSWORD_ADMIN });
  assert.equal(baja.status, 200, baja.texto);
  try {
    const negocios = (await duenio.get('/api/plataforma/negocios')).json;
    assert.match(negocios.find((n) => n.nombre === 'Almacén Uno').se_borra, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal((await duenio.get('/api/plataforma/resumen')).json.negocios.en_baja, 1);
  } finally {
    await uno.admin.post('/api/negocio/baja/cancelar');
  }
});

test('con el mail sin confirmar, la cuenta de la lista tampoco entra', async () => {
  enBase((base) => base.prepare("UPDATE usuarios SET email_verificado = NULL WHERE email = 'duenio@nexo.test'").run());
  try {
    assert.equal((await duenio.get('/api/plataforma/resumen')).status, 404);
    assert.equal((await duenio.get('/api/auth/estado')).json.usuario.plataforma, false);
  } finally {
    enBase((base) =>
      base.prepare("UPDATE usuarios SET email_verificado = datetime('now') WHERE email = 'duenio@nexo.test'").run()
    );
  }
});
