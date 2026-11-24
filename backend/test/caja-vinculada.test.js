// La caja vinculada y los empleados con PIN (hist. §199, decisión del usuario
// del 17 de noviembre): la compu del mostrador tiene su cuenta, que el admin
// vincula desde la suya; los empleados no tienen cuenta y ponen su PIN para
// atender (la venta queda a su nombre) y para fichar. La compu solo usa el
// mostrador de su caja, y bloqueada solo pide el PIN.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearCliente, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

let servidor;
let admin;
let compu;
let caja;
let otraCaja;
let ana;
let beto;
let servicio;
let turno;

before(async () => {
  servidor = await levantarServidor();
  admin = await registrarEmpresa(servidor, { empresa: 'Almacén Caja', usuario: 'almacencaja' });
  caja = (await admin.get('/api/cuentas-tesoreria')).json.find((c) => c.tipo === 'efectivo');
  otraCaja = (await admin.post('/api/cuentas-tesoreria', { nombre: 'Caja 2', tipo: 'efectivo' })).json;
  servicio = (await admin.post('/api/productos', { nombre: 'Carga SUBE', precio_venta: 1000, tipo: 'servicio' })).json.id;
  ana = (await admin.post('/api/empleados', { nombre: 'Ana', pin: '1234' })).json;
  beto = (await admin.post('/api/empleados', { nombre: 'Beto', pin: '9876', encargado: true })).json;
  await admin.post('/api/empleados', { nombre: 'Sin PIN' });

  // El dueño entra en la compu del local, la vincula y sale: queda la caja.
  compu = crearCliente(servidor.url);
  assert.equal((await compu.post('/api/auth/login', { email: 'almacencaja@nexo.test', password: 'clave-segura-1' })).status, 200);
  const vinculo = await compu.post(`/api/cajas/${caja.id}/vincular`);
  assert.equal(vinculo.status, 201, vinculo.texto);
  assert.equal((await compu.post('/api/auth/logout')).status, 204);
});

after(async () => {
  await servidor?.cerrar();
});

test('los empleados se cargan con su PIN, que nunca vuelve', async () => {
  assert.equal(ana.tiene_pin, true);
  assert.equal(ana.pin_hash, undefined);
  assert.equal((await admin.post('/api/empleados', { nombre: 'ana', pin: '1111' })).status, 400, 'dos activos con el mismo nombre no');
  assert.equal((await admin.post('/api/empleados', { nombre: 'Carla', pin: '12' })).status, 400, 'el PIN va de 4 a 6 números');
  // La cuenta de la caja no es una persona del negocio.
  const usuarios = (await admin.get('/api/usuarios')).json;
  assert.equal(usuarios.length, 1);
});

test('la compu vinculada arranca como la caja, bloqueada, y solo usa el mostrador', async () => {
  const estado = (await compu.get('/api/auth/estado')).json;
  assert.equal(estado.autenticado, true);
  assert.equal(estado.usuario.caja.id, caja.id);
  assert.equal(estado.usuario.caja.atiende, null);

  const enCaja = (await compu.get('/api/caja')).json;
  assert.deepEqual(
    enCaja.empleados.map((e) => e.nombre),
    ['Ana', 'Beto'],
    'solo los que tienen PIN'
  );
  // Fuera del mostrador, nada; bloqueada, no escribe.
  const productos = await compu.get('/api/productos');
  assert.equal(productos.status, 403);
  assert.equal(productos.json.codigo, 'solo_caja');
  const abrir = await compu.post('/api/turnos-caja', { cuenta_tesoreria_id: caja.id, contado: 0 });
  assert.equal(abrir.status, 403);
  assert.equal(abrir.json.codigo, 'caja_bloqueada');
  // El admin no puede usar las rutas de la caja desde su cuenta.
  assert.equal((await admin.get('/api/caja')).status, 403);
});

test('atiende quien pone su PIN, y el PIN tiene tope de intentos', async () => {
  assert.equal((await compu.post('/api/caja/atender', { empleado_id: beto.id, pin: '0000' })).status, 403);
  for (let i = 0; i < 4; i++) await compu.post('/api/caja/atender', { empleado_id: beto.id, pin: '0000' });
  assert.equal((await compu.post('/api/caja/atender', { empleado_id: beto.id, pin: '9876' })).status, 429, 'cinco errores lo traban');

  const r = await compu.post('/api/caja/atender', { empleado_id: ana.id, pin: '1234' });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.atiende.nombre, 'Ana');
});

test('la venta y el turno quedan a nombre de quien atiende, y solo de su caja', async () => {
  assert.equal((await compu.post('/api/turnos-caja', { cuenta_tesoreria_id: otraCaja.id, contado: 0 })).status, 403, 'otra caja no');
  const abierto = await compu.post('/api/turnos-caja', { cuenta_tesoreria_id: caja.id, contado: 0 });
  assert.equal(abierto.status, 201, abierto.texto);
  turno = abierto.json;
  assert.equal(turno.abierto_por_nombre, 'Ana');

  const venta = await compu.post('/api/pos/ventas', {
    turno_caja_id: turno.id,
    items: [{ producto_id: servicio, cantidad: 1, precio_unitario: 1000 }],
    cobros: [{ cuenta_tesoreria_id: caja.id, importe: 1000 }]
  });
  assert.equal(venta.status, 201, venta.texto);
  const detalle = (await compu.get(`/api/turnos-caja/${turno.id}/detalle`)).json;
  assert.equal(detalle.ventas[0].atendio, 'Ana');

  // Anular: Ana no es encargada, y su PIN no autoriza.
  const sinPermiso = await compu.post(`/api/pos/ventas/${venta.json.id}/anular`, { motivo: 'Se equivocó' });
  assert.equal(sinPermiso.status, 403);
  const conAna = await compu.post(`/api/pos/ventas/${venta.json.id}/anular`, {
    motivo: 'Se equivocó',
    autoriza_empleado_id: ana.id,
    autoriza_pin: '1234'
  });
  assert.equal(conAna.status, 404, 'el PIN tiene que ser de un encargado');
});

test('fichar es aparte de atender, y la salida deja la caja bloqueada', async () => {
  const entrada = await compu.post('/api/caja/fichar', { empleado_id: ana.id, pin: '1234', tipo: 'entrada' });
  assert.equal(entrada.status, 201, entrada.texto);
  assert.equal(entrada.json.caja.empleados.find((e) => e.id === ana.id).adentro, true);
  assert.equal(entrada.json.caja.atiende.nombre, 'Ana', 'fichar no cambia quién atiende');
  assert.equal((await compu.post('/api/caja/fichar', { empleado_id: ana.id, pin: '1234', tipo: 'entrada' })).status, 409);

  const salida = await compu.post('/api/caja/fichar', { empleado_id: ana.id, pin: '1234', tipo: 'salida' });
  assert.equal(salida.status, 200, salida.texto);
  assert.equal(salida.json.caja.atiende, null);

  const informe = (await admin.get('/api/fichajes/informe')).json;
  const deAna = informe.personas.find((p) => p.nombre === 'Ana');
  assert.equal(deAna.dias[0].fichajes.length, 1);
  assert.equal(deAna.turnos_caja, 1);
});

test('el dueño entra con su cuenta en la compu de la caja y, al salir, vuelve la caja', async () => {
  assert.equal((await compu.post('/api/auth/login', { email: 'almacencaja@nexo.test', password: 'clave-segura-1' })).status, 200);
  assert.equal((await compu.get('/api/productos')).status, 200, 'manda la sesión de la persona');
  await compu.post('/api/auth/logout');
  assert.equal((await compu.get('/api/productos')).status, 403);
  assert.equal((await compu.get('/api/auth/estado')).json.usuario.caja.id, caja.id);
});

test('el dueño, con su cuenta en la compu de la caja, deja de usar solo esa compu como caja', async () => {
  // Otra compu de la misma caja, que tiene que seguir siéndolo.
  const otraCompu = crearCliente(servidor.url);
  await otraCompu.post('/api/auth/login', { email: 'almacencaja@nexo.test', password: 'clave-segura-1' });
  assert.equal((await otraCompu.post(`/api/cajas/${caja.id}/vincular`)).status, 201);
  await otraCompu.post('/api/auth/logout');

  const login = await compu.post('/api/auth/login', { email: 'almacencaja@nexo.test', password: 'clave-segura-1' });
  assert.deepEqual(login.json.usuario.esta_compu, { id: caja.id, nombre: caja.nombre });
  assert.deepEqual((await compu.get('/api/auth/estado')).json.usuario.esta_compu, { id: caja.id, nombre: caja.nombre });
  assert.equal((await admin.get('/api/auth/estado')).json.usuario.esta_compu, null, 'una compu sin vincular no es caja');

  const r = await compu.del('/api/cajas/esta-compu');
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.desvinculada, true);
  assert.equal((await compu.get('/api/auth/estado')).json.usuario.esta_compu, null);
  await compu.post('/api/auth/logout');
  assert.equal((await compu.get('/api/auth/estado')).json.autenticado, false, 'al salir pide entrar, no quién atiende');
  assert.equal((await otraCompu.get('/api/auth/estado')).json.usuario.caja.id, caja.id, 'la otra compu sigue siendo la caja');
});

test('el admin ve las compus vinculadas y las desvincula', async () => {
  const compus = (await admin.get('/api/cajas/compus')).json;
  assert.equal(compus.find((c) => c.id === caja.id).compus, 1);
  assert.equal(compus.find((c) => c.id === otraCaja.id).compus, 0);
  const r = await admin.del(`/api/cajas/${caja.id}/vinculo`);
  assert.equal(r.json.desvinculadas, 1);
  assert.equal((await compu.get('/api/caja')).status, 401);
  assert.equal((await compu.get('/api/auth/estado')).json.autenticado, false);
});
