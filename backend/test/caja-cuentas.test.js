// El cierre de la caja en todas las cuentas (hist. §150): además del efectivo
// contado, cada cuenta que tuvo cobros en el turno (el banco del posnet,
// Mercado Pago) se controla contra lo que dice el posnet o la app. La
// diferencia queda anotada y no mueve el saldo. Va aparte porque cada archivo
// levanta su servidor, y el alta de empresas tiene un tope de intentos por IP.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

let servidor;
let n;
let cuentas;

before(async () => {
  servidor = await levantarServidor();
  n = await registrarEmpresa(servidor, { empresa: 'Kiosco Caja', usuario: 'kioscocaja' });
  cuentas = Object.fromEntries((await n.get('/api/cuentas-tesoreria')).json.map((c) => [c.tipo, c]));
});

after(async () => {
  await servidor?.cerrar();
});

const saldoDe = async (cuenta) => (await n.get('/api/tesoreria')).json.cuentas.find((c) => c.id === cuenta.id).saldo;

test('al cerrar, las otras cuentas se controlan y la diferencia queda anotada sin tocar el saldo', async () => {
  const turno = (await n.post('/api/turnos-caja', { cuenta_tesoreria_id: cuentas.efectivo.id, contado: 0 })).json;
  const servicio = (await n.post('/api/productos', { nombre: 'Recarga', precio_venta: 1000, tipo: 'servicio' })).json.id;
  const vender = (cobros) =>
    n.post('/api/pos/ventas', {
      turno_caja_id: turno.id,
      items: [{ producto_id: servicio, cantidad: 1, precio_unitario: cobros.reduce((acc, c) => acc + c.importe, 0) }],
      cobros
    });
  assert.equal((await vender([{ cuenta_tesoreria_id: cuentas.efectivo.id, importe: 5000 }])).status, 201);
  assert.equal((await vender([{ cuenta_tesoreria_id: cuentas.banco.id, importe: 8000 }])).status, 201);
  assert.equal((await vender([{ cuenta_tesoreria_id: cuentas.mercadopago.id, importe: 3000 }])).status, 201);

  const abierto = (await n.get(`/api/turnos-caja/${turno.id}`)).json;
  assert.deepEqual(
    abierto.cobros_por_cuenta.map((c) => [c.tipo, c.importe]).sort(),
    [
      ['banco', 8000],
      ['efectivo', 5000],
      ['mercadopago', 3000]
    ]
  );

  // Lo que no se puede declarar: la caja (eso es lo contado), una cuenta sin
  // cobros en el turno, la misma dos veces o un número que no es.
  const malos = [
    [{ cuenta_tesoreria_id: cuentas.efectivo.id, declarado: 5000 }],
    [{ cuenta_tesoreria_id: 99999, declarado: 1 }],
    [
      { cuenta_tesoreria_id: cuentas.banco.id, declarado: 1 },
      { cuenta_tesoreria_id: cuentas.banco.id, declarado: 2 }
    ],
    [{ cuenta_tesoreria_id: cuentas.banco.id, declarado: -1 }],
    'no'
  ];
  for (const otras of malos) {
    assert.equal((await n.post(`/api/turnos-caja/${turno.id}/cerrar`, { contado: 5000, otras })).status, 400, JSON.stringify(otras));
  }

  const bancoAntes = await saldoDe(cuentas.banco);
  // El posnet dice 7.000 (faltan 1.000); Mercado Pago no se controla.
  const cerrado = await n.post(`/api/turnos-caja/${turno.id}/cerrar`, {
    contado: 5000,
    otras: [{ cuenta_tesoreria_id: cuentas.banco.id, declarado: 7000 }]
  });
  assert.equal(cerrado.status, 200, cerrado.texto);
  assert.equal(cerrado.json.diferencia_cierre, 0);
  assert.deepEqual(
    cerrado.json.arqueos.map((a) => [a.cuenta, a.esperado, a.declarado, a.diferencia]),
    [[cuentas.banco.nombre, 8000, 7000, -1000]]
  );
  assert.equal(await saldoDe(cuentas.banco), bancoAntes, 'la diferencia no mueve el saldo');
  // Queda en el turno cerrado.
  assert.equal((await n.get(`/api/turnos-caja/${turno.id}`)).json.arqueos.length, 1);
});
