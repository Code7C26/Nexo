// Ventas en cuotas (hist. §216): el producto tiene planes ("2 pagos de
// $65.000", "3 de $50.000"), la venta toma el precio del plan, lo que falta
// queda en la cuenta corriente del cliente con una cuota por mes, y lo vencido
// es solo lo que ya venció. Va aparte porque cada archivo levanta su servidor.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';
import { fechaDeHoy } from '../fecha.js';

let servidor;
let admin;
let empleado;
let otro;
let conjunto;
let remera;
let caja;

const sumarMeses = (fecha, n) => {
  const [y, m, d] = fecha.split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + n, Math.min(d, ultimo), 12)).toISOString().slice(0, 10);
};

before(async () => {
  servidor = await levantarServidor();
  admin = await registrarEmpresa(servidor, { empresa: 'Dojo Cuotas', usuario: 'dojocuotas' });
  empleado = await crearEmpleado(servidor, admin, { usuario: 'profecuotas' });
  otro = await registrarEmpresa(servidor, { empresa: 'Otro Cuotas', usuario: 'otrocuotas' });
  conjunto = (await admin.post('/api/productos', { nombre: 'Conjunto', precio_venta: 100000, tipo: 'servicio' })).json.id;
  remera = (await admin.post('/api/productos', { nombre: 'Remera', precio_venta: 10000, tipo: 'servicio' })).json.id;
  caja = (await admin.get('/api/cuentas-tesoreria')).json.find((c) => c.tipo === 'efectivo');
});

after(async () => {
  await servidor?.cerrar();
});

test('los planes del producto: se cargan, se validan y son del admin', async () => {
  const ruta = `/api/productos/${conjunto}/planes-pago`;
  for (const planes of [[{ cuotas: 1, importe_cuota: 100 }], [{ cuotas: 2, importe_cuota: 0 }], [{ cuotas: 2, importe_cuota: 5 }, { cuotas: 2, importe_cuota: 6 }], 'tres']) {
    assert.equal((await admin.put(ruta, { planes })).status, 400, JSON.stringify(planes));
  }
  assert.equal((await empleado.put(ruta, { planes: [] })).status, 403);
  assert.equal((await otro.put(ruta, { planes: [] })).status, 404);

  const r = await admin.put(ruta, { planes: [{ cuotas: 3, importe_cuota: 50000 }, { cuotas: 2, importe_cuota: 65000 }] });
  assert.equal(r.status, 200, r.texto);
  const enLaLista = (await empleado.get('/api/productos')).json.find((p) => p.id === conjunto);
  assert.deepEqual(enLaLista.planes_pago, [
    { cuotas: 2, importe_cuota: 65000 },
    { cuotas: 3, importe_cuota: 50000 }
  ]);
});

test('vendido en 3 cuotas: el precio es el del plan y la deuda vence de a una por mes', async () => {
  const hoy = fechaDeHoy();
  // Sin cliente, no: lo que falta no tiene a quién quedarle.
  const sinCliente = await empleado.post('/api/ventas', { items: [{ producto_id: conjunto, cantidad: 1, precio_unitario: 1, plan_cuotas: 3 }] });
  assert.equal(sinCliente.status, 400, sinCliente.texto);
  // Un plan que el producto no tiene, tampoco.
  assert.equal((await empleado.post('/api/ventas', { cliente: 'Peludo', items: [{ producto_id: conjunto, cantidad: 1, precio_unitario: 1, plan_cuotas: 4 }] })).status, 400);

  // El precio que manda la pantalla no cuenta: manda el del plan.
  const venta = await empleado.post('/api/ventas', { cliente: 'Peludo', items: [{ producto_id: conjunto, cantidad: 1, precio_unitario: 1, plan_cuotas: 3 }] });
  assert.equal(venta.status, 201, venta.texto);
  const ficha = (await admin.get(`/api/ventas/${venta.json.id}`)).json;
  assert.equal(ficha.total, 150000);
  assert.equal(ficha.items[0].plan_cuotas, 3);
  assert.equal(ficha.condicion_pago, 'cuotas');
  assert.equal(ficha.fecha_vencimiento, sumarMeses(hoy, 2));
  assert.deepEqual(
    ficha.cuotas.map((c) => [c.numero, c.vencimiento, c.importe, c.pendiente]),
    [
      [1, hoy, 50000, 50000],
      [2, sumarMeses(hoy, 1), 50000, 50000],
      [3, sumarMeses(hoy, 2), 50000, 50000]
    ]
  );

  // Paga la primera al llevárselo.
  assert.equal((await empleado.post(`/api/ventas/${venta.json.id}/cobros`, { importe: 50000, cuenta_tesoreria_id: caja.id })).status, 201);
  const despues = (await admin.get(`/api/ventas/${venta.json.id}`)).json;
  assert.deepEqual(despues.cuotas.map((c) => c.pendiente), [0, 50000, 50000]);

  // En la cuenta corriente: debe 100.000, en dos cuotas que todavía no vencen.
  const cc = (await admin.get('/api/cuentas-corrientes')).json;
  const peludo = cc.por_cobrar.find((e) => e.nombre === 'Peludo');
  assert.equal(peludo.saldo, 100000);
  const operaciones = peludo.operaciones.filter((o) => o.id === venta.json.id);
  assert.deepEqual(
    operaciones.map((o) => [o.cuota, o.cuotas, o.vencimiento, o.pendiente]),
    [
      [2, 3, sumarMeses(hoy, 1), 50000],
      [3, 3, sumarMeses(hoy, 2), 50000]
    ]
  );
  assert.ok(operaciones.every((o) => o.dias < 0), 'ninguna venció');
  // El Resumen: nada vencido, aunque la venta "vence" en dos meses.
  const tablero = (await admin.get('/api/reportes/tablero')).json;
  assert.equal(tablero.pendiente.por_cobrar.vencido, 0);

  // No se edita: el cronograma sale de los renglones.
  const editar = await admin.put(`/api/ventas/${venta.json.id}`, { cliente: 'Peludo', items: [{ producto_id: conjunto, cantidad: 1, precio_unitario: 150000 }] });
  assert.equal(editar.status, 400);
});

test('con un renglón en cuotas y otro al contado, lo de contado va en la primera', async () => {
  const hoy = fechaDeHoy();
  const venta = await admin.post('/api/ventas', {
    cliente: 'Franco',
    items: [
      { producto_id: conjunto, cantidad: 1, precio_unitario: 0, plan_cuotas: 2 },
      { producto_id: remera, cantidad: 2, precio_unitario: 10000 }
    ]
  });
  assert.equal(venta.status, 201, venta.texto);
  const ficha = (await admin.get(`/api/ventas/${venta.json.id}`)).json;
  assert.equal(ficha.total, 150000);
  assert.deepEqual(
    ficha.cuotas.map((c) => [c.numero, c.vencimiento, c.importe]),
    [
      [1, hoy, 85000],
      [2, sumarMeses(hoy, 1), 65000]
    ]
  );
  // Una venta sin plan no tiene cuotas: vence entera, como siempre.
  const comun = await admin.post('/api/ventas', { cliente: 'Franco', items: [{ producto_id: remera, cantidad: 1, precio_unitario: 10000 }] });
  assert.deepEqual((await admin.get(`/api/ventas/${comun.json.id}`)).json.cuotas, []);
});
