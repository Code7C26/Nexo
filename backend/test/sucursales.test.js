// Sucursales (hist. §193): cada local con su depósito, sus cajas y su gente.
// La caja vende del depósito de su sucursal (lo que no hay ahí no se vende
// ahí, aunque otra lo tenga), quien trabaja en una sucursal solo abre sus
// cajas, y el cierre del día suma todas las cajas de todas las sucursales.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

let servidor;
let admin;
let empleado;
let empleadoId;
let producto;
let centro;
let norte;

before(async () => {
  servidor = await levantarServidor();
  admin = await registrarEmpresa(servidor, { empresa: 'Cadena Sucursales', usuario: 'cadena' });
  empleado = await crearEmpleado(servidor, admin, { usuario: 'cajeronorte', nombre: 'Cajero Norte' });
  empleadoId = (await admin.get('/api/usuarios')).json.find((u) => u.nombre === 'Cajero Norte').id;
  producto = (await admin.post('/api/productos', { nombre: 'Yerba', precio_venta: 2000 })).json.id;
});

after(async () => {
  await servidor?.cerrar();
});

const cajaPorNombre = async (nombre) => (await admin.get('/api/tesoreria')).json.cuentas.find((c) => c.nombre === nombre);

test('una sucursal nueva crea su depósito y su caja, y valida lo que recibe', async () => {
  const predeterminado = (await admin.get('/api/depositos')).json.find((d) => d.es_predeterminado);
  const efectivo = (await admin.get('/api/cuentas-tesoreria')).json.find((c) => c.tipo === 'efectivo');
  const r = await admin.post('/api/sucursales', {
    nombre: 'Centro',
    direccion: 'San Martín 100',
    deposito_id: predeterminado.id,
    cajas: [efectivo.id]
  });
  assert.equal(r.status, 201, r.texto);
  centro = r.json;
  assert.equal(centro.deposito_id, predeterminado.id);
  assert.deepEqual(centro.cajas.map((c) => c.id), [efectivo.id]);

  const n = await admin.post('/api/sucursales', { nombre: 'Norte', caja_nueva: true, personas: [empleadoId] });
  assert.equal(n.status, 201, n.texto);
  norte = n.json;
  assert.equal(norte.deposito, 'Norte', 'el depósito nuevo lleva el nombre de la sucursal');
  assert.deepEqual(norte.cajas.map((c) => c.nombre), ['Caja Norte']);
  assert.deepEqual(norte.personas.map((p) => p.nombre), ['Cajero Norte']);

  const banco = (await admin.get('/api/cuentas-tesoreria')).json.find((c) => c.tipo === 'banco');
  const malos = [
    [{ nombre: '' }, /nombre/],
    [{ nombre: 'Centro' }, /Ya hay una sucursal/],
    [{ nombre: 'Sur', deposito_id: predeterminado.id }, /ya es de la sucursal "Centro"/],
    [{ nombre: 'Sur', cajas: [banco.id] }, /no es una caja de efectivo/],
    [{ nombre: 'Sur', personas: [99999] }, /no trabaja en este negocio/],
    [{ nombre: 'Norte 2', caja_nueva: true, deposito_id: 99999 }, /no existe/]
  ];
  for (const [cuerpo, error] of malos) {
    const malo = await admin.post('/api/sucursales', cuerpo);
    assert.equal(malo.status, 400, JSON.stringify(cuerpo));
    assert.match(malo.json.error, error);
  }
  assert.equal((await empleado.post('/api/sucursales', { nombre: 'Sur' })).status, 403);
  assert.equal((await empleado.get('/api/sucursales')).json.length, 2, 'verlas es de los dos roles');
});

test('cada caja vende del depósito de su sucursal y avisa en cuál otra hay', async () => {
  // 5 en Centro, nada en Norte.
  await admin.post('/api/stock/ajuste', { producto_id: producto, cantidad: 5, deposito_id: centro.deposito_id, motivo: 'inicial' });
  const cajaNorte = await cajaPorNombre('Caja Norte');

  const catalogo = (await admin.get(`/api/pos/catalogo?caja=${cajaNorte.id}`)).json.find((i) => i.producto_id === producto);
  assert.equal(catalogo.stock, 0);
  assert.deepEqual(catalogo.en_otras, [{ sucursal: 'Centro', cantidad: 5 }]);
  const enCentro = (await admin.get(`/api/pos/catalogo?caja=${centro.cajas[0].id}`)).json.find((i) => i.producto_id === producto);
  assert.equal(enCentro.stock, 5);
  assert.deepEqual(enCentro.en_otras, []);

  // El cajero de Norte no abre la caja de Centro, y en la suya no vende lo que no hay.
  assert.equal((await empleado.post('/api/turnos-caja', { cuenta_tesoreria_id: centro.cajas[0].id, contado: 0 })).status, 403);
  const habilitadas = (await empleado.get('/api/tesoreria')).json.cuentas.filter((c) => c.habilitada).map((c) => c.nombre);
  assert.deepEqual(habilitadas, ['Caja Norte']);
  const turnoNorte = (await empleado.post('/api/turnos-caja', { cuenta_tesoreria_id: cajaNorte.id, contado: 0 })).json;
  assert.equal(turnoNorte.sucursal, 'Norte');
  const venta = (turno) => ({
    turno_caja_id: turno.id,
    items: [{ producto_id: producto, cantidad: 2, precio_unitario: 2000 }],
    cobros: [{ cuenta_tesoreria_id: turno.cuenta_tesoreria_id, importe: 4000 }]
  });
  const sinStock = await empleado.post('/api/pos/ventas', venta(turnoNorte));
  assert.equal(sinStock.status, 400);
  assert.match(sinStock.json.error, /stock/i);

  // En Centro sí, y sale de su depósito.
  const turnoCentro = (await admin.post('/api/turnos-caja', { cuenta_tesoreria_id: centro.cajas[0].id, contado: 0 })).json;
  const vendida = await admin.post('/api/pos/ventas', venta(turnoCentro));
  assert.equal(vendida.status, 201, vendida.texto);
  const despues = (await admin.get(`/api/pos/catalogo?caja=${centro.cajas[0].id}`)).json.find((i) => i.producto_id === producto);
  assert.equal(despues.stock, 3);

  // Una caja con el turno abierto no cambia de sucursal, ni se borra la sucursal.
  const mover = await admin.patch(`/api/sucursales/${norte.id}`, { nombre: 'Norte', cajas: [], personas: [empleadoId] });
  assert.equal(mover.status, 400);
  assert.match(mover.json.error, /turno abierto/);
  assert.equal((await admin.del(`/api/sucursales/${centro.id}`)).status, 400);

  await empleado.post(`/api/turnos-caja/${turnoNorte.id}/cerrar`, { contado: 0 });
  // Se esperaban 4.000 y se contaron 3.900: faltan 100 en Centro.
  await admin.post(`/api/turnos-caja/${turnoCentro.id}/cerrar`, { contado: 3900 });
});

test('el cierre del día suma todas las cajas, por sucursal, y aparte lo que no pasó por una caja', async () => {
  // Una venta desde Ventas: no está en ningún cajón.
  const servicio = (await admin.post('/api/productos', { nombre: 'Envío', precio_venta: 1500, tipo: 'servicio' })).json.id;
  const suelta = await admin.post('/api/ventas', { cliente: 'Juan', items: [{ producto_id: servicio, cantidad: 1, precio_unitario: 1500 }] });
  assert.equal(suelta.status, 201, suelta.texto);

  const cierre = await admin.get('/api/cierre-caja');
  assert.equal(cierre.status, 200, cierre.texto);
  const { totales, sucursales, dias } = cierre.json;
  assert.equal(totales.turnos, 2);
  assert.equal(totales.abiertos, 0);
  assert.deepEqual(totales.ventas, { cantidad: 1, total: 4000 });
  assert.equal(totales.diferencias, -100);
  assert.deepEqual(totales.sin_caja, { cantidad: 1, total: 1500 });
  assert.equal(totales.cobros_por_medio.reduce((acc, m) => acc + m.importe, 0), 4000);
  assert.deepEqual(
    sucursales.map((s) => [s.nombre, s.turnos, s.ventas.total, s.diferencias]),
    [
      ['Centro', 1, 4000, -100],
      ['Norte', 1, 0, 0]
    ]
  );
  assert.equal(sucursales[0].cajas[0].turnos.length, 1);
  assert.equal(dias.length, 1);

  // Otro período, vacío; y uno al revés no vale.
  const vacio = (await admin.get('/api/cierre-caja?desde=2020-01-01&hasta=2020-01-31')).json;
  assert.equal(vacio.totales.turnos, 0);
  assert.equal((await admin.get('/api/cierre-caja?desde=2020-02-01&hasta=2020-01-01')).status, 400);
  assert.equal((await empleado.get('/api/cierre-caja')).status, 403);
});

test('borrar una sucursal deja su depósito y sus cajas como antes', async () => {
  const r = await admin.del(`/api/sucursales/${norte.id}`);
  assert.equal(r.status, 200, r.texto);
  const caja = await cajaPorNombre('Caja Norte');
  assert.equal(caja.sucursal_id, null);
  assert.ok((await admin.get('/api/depositos')).json.some((d) => d.nombre === 'Norte'));
  // Sin sucursal asignada, el cajero vuelve a poder abrir cualquier caja.
  const habilitadas = (await empleado.get('/api/tesoreria')).json.cuentas.filter((c) => c.habilitada && c.tipo === 'efectivo');
  assert.equal(habilitadas.length, 2);
});
