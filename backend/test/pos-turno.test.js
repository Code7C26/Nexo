// Lo de Praxia en el mostrador (hist. §194): cobrar a cuenta (el cliente paga
// su deuda sin llevarse nada), ver lo que pasó en el turno (ventas, cobros a
// cuenta y gastos de la caja) y anular una venta del turno con motivo, con la
// contraseña de un administrador si la pide un empleado.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

let servidor;
let admin;
let empleado;
let caja;
let turno;
let servicio;
let cliente;

before(async () => {
  servidor = await levantarServidor();
  admin = await registrarEmpresa(servidor, { empresa: 'Kiosco Turno', usuario: 'kioscoturno' });
  empleado = await crearEmpleado(servidor, admin, { usuario: 'cajerokiosco', nombre: 'Cajero' });
  caja = (await admin.get('/api/cuentas-tesoreria')).json.find((c) => c.tipo === 'efectivo');
  servicio = (await admin.post('/api/productos', { nombre: 'Carga SUBE', precio_venta: 1000, tipo: 'servicio' })).json.id;
  cliente = (await admin.post('/api/clientes', { nombre: 'Marta' })).json.id;
  turno = (await empleado.post('/api/turnos-caja', { cuenta_tesoreria_id: caja.id, contado: 0 })).json;
});

after(async () => {
  await servidor?.cerrar();
});

const esperado = async () => (await empleado.get(`/api/turnos-caja/${turno.id}`)).json.esperado;
const vender = (cliente_id, total, cobrado) =>
  empleado.post('/api/pos/ventas', {
    turno_caja_id: turno.id,
    cliente_id,
    items: [{ producto_id: servicio, cantidad: 1, precio_unitario: total }],
    cobros: cobrado ? [{ cuenta_tesoreria_id: caja.id, importe: cobrado }] : []
  });

test('cobrar a cuenta salda las deudas de la más vieja a la más nueva, sin pasarse', async () => {
  // Marta se lleva dos cosas sin pagar: 3.000 y 2.000.
  const primera = (await vender(cliente, 3000, 0)).json.id;
  const segunda = (await vender(cliente, 2000, 0)).json.id;
  const antes = await esperado();

  const malo = await empleado.post('/api/pos/cobro-a-cuenta', {
    turno_caja_id: turno.id,
    cliente_id: cliente,
    cobros: [{ cuenta_tesoreria_id: caja.id, importe: 6000 }]
  });
  assert.equal(malo.status, 400);
  assert.match(malo.json.error, /debe 5000/);

  const r = await empleado.post('/api/pos/cobro-a-cuenta', {
    turno_caja_id: turno.id,
    cliente_id: cliente,
    cobros: [{ cuenta_tesoreria_id: caja.id, importe: 4000 }]
  });
  assert.equal(r.status, 201, r.texto);
  assert.equal(r.json.saldo, 1000);
  assert.deepEqual(
    r.json.cobros.map((c) => [c.venta_id, c.importe]),
    [
      [primera, 3000],
      [segunda, 1000]
    ]
  );
  assert.equal(await esperado(), antes + 4000, 'la plata entra a la caja del turno');

  const detalle = (await empleado.get(`/api/turnos-caja/${turno.id}/detalle`)).json;
  assert.equal(detalle.a_cuenta.length, 0, 'las ventas son del mismo turno: no es un cobro a cuenta de antes');

  // Sin cliente, o con un cliente que no debe, no.
  const sinDeuda = (await admin.post('/api/clientes', { nombre: 'Sin deuda' })).json.id;
  for (const cliente_id of [null, sinDeuda]) {
    const nada = await empleado.post('/api/pos/cobro-a-cuenta', {
      turno_caja_id: turno.id,
      cliente_id,
      cobros: [{ cuenta_tesoreria_id: caja.id, importe: 100 }]
    });
    assert.equal(nada.status, 400);
  }
});

test('el detalle del turno muestra sus ventas y los gastos pagados con la caja', async () => {
  const gasto = await empleado.post('/api/pos/gastos', { turno_caja_id: turno.id, importe: 300, descripcion: 'Bolsas' });
  assert.equal(gasto.status, 201, gasto.texto);
  assert.equal((await empleado.post('/api/pos/gastos', { turno_caja_id: turno.id, importe: 300 })).status, 400, 'sin decir en qué, no');
  const detalle = (await empleado.get(`/api/turnos-caja/${turno.id}/detalle`)).json;
  assert.equal(detalle.ventas.length, 2);
  assert.deepEqual(
    detalle.gastos.map((g) => [g.descripcion, g.importe, g.categoria]),
    [['Bolsas', 300, 'Gastos de caja']]
  );
  assert.equal(detalle.total_gastos, 300);
});

test('anular una venta del turno devuelve lo cobrado y pide la autorización de un admin al empleado', async () => {
  const venta = (await vender(null, 1500, 1500)).json.id;
  const antes = await esperado();

  assert.equal((await empleado.post(`/api/pos/ventas/${venta}/anular`, {})).status, 400, 'sin motivo no');
  const sinPermiso = await empleado.post(`/api/pos/ventas/${venta}/anular`, { motivo: 'Se equivocó de producto' });
  assert.equal(sinPermiso.status, 403);
  const malaClave = await empleado.post(`/api/pos/ventas/${venta}/anular`, {
    motivo: 'Se equivocó de producto',
    autoriza_email: 'kioscoturno@nexo.test',
    autoriza_password: 'otra-clave'
  });
  assert.equal(malaClave.status, 403);
  // Un empleado no autoriza a otro.
  const otroEmpleado = await empleado.post(`/api/pos/ventas/${venta}/anular`, {
    motivo: 'Se equivocó de producto',
    autoriza_email: 'cajerokiosco@nexo.test',
    autoriza_password: 'clave-segura-2'
  });
  assert.equal(otroEmpleado.status, 403);

  const ok = await empleado.post(`/api/pos/ventas/${venta}/anular`, {
    motivo: 'Se equivocó de producto',
    autoriza_email: 'kioscoturno@nexo.test',
    autoriza_password: 'clave-segura-1'
  });
  assert.equal(ok.status, 200, ok.texto);
  assert.equal(ok.json.devuelto, 1500);
  assert.equal(await esperado(), antes - 1500, 'la plata sale de la caja');
  assert.equal((await admin.get(`/api/ventas/${venta}`)).json.estado, 'anulada');
  const auditoria = (await admin.get('/api/auditoria')).json;
  const fila = (auditoria.filas ?? auditoria).find((a) => a.entidad === 'venta' && a.entidad_id === venta && a.accion === 'anular');
  assert.match(fila.detalle, /Motivo: Se equivocó de producto\. Autorizó: Admin\. Se devolvió \$1500/);

  // El admin anula sin pedir nada; una venta de otro turno, no.
  const otra = (await vender(null, 800, 800)).json.id;
  assert.equal((await admin.post(`/api/pos/ventas/${otra}/anular`, { motivo: 'Prueba' })).status, 200);
  const vieja = (await vender(null, 700, 700)).json.id;
  await empleado.post(`/api/turnos-caja/${turno.id}/cerrar`, { contado: 0 });
  const cerrada = await admin.post(`/api/pos/ventas/${vieja}/anular`, { motivo: 'Tarde' });
  assert.equal(cerrada.status, 400);
  assert.match(cerrada.json.error, /desde Ventas/);
});

test('un cobro a cuenta de una deuda de otro turno queda en el turno donde se cobró', async () => {
  const nuevo = (await admin.post('/api/turnos-caja', { cuenta_tesoreria_id: caja.id, contado: 0 })).json;
  const r = await admin.post('/api/pos/cobro-a-cuenta', {
    turno_caja_id: nuevo.id,
    cliente_id: cliente,
    cobros: [{ cuenta_tesoreria_id: caja.id, importe: 1000 }]
  });
  assert.equal(r.status, 201, r.texto);
  assert.equal(r.json.saldo, 0);
  const detalle = (await admin.get(`/api/turnos-caja/${nuevo.id}/detalle`)).json;
  assert.deepEqual(
    detalle.a_cuenta.map((c) => [c.cliente, c.importe]),
    [['Marta', 1000]]
  );
  const resumen = (await admin.get(`/api/turnos-caja/${nuevo.id}`)).json;
  assert.equal(resumen.cobros_por_cuenta.find((c) => c.cuenta_tesoreria_id === caja.id).importe, 1000);
});
