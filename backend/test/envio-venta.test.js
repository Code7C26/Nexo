// El envío que paga el negocio (hist. §180): entra como costo de la venta, se
// ve en "Adónde fue la plata", sale de la cuenta elegida y se anula con la
// venta. Solo el admin lo suma, y nunca a la venta de otro negocio. Va aparte
// porque cada archivo levanta su servidor.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { levantarServidor, registrarEmpresa, crearEmpleado } from './servidor-de-prueba.js';

let servidor;
let admin;
let otro;
let empleado;
let caja;
let ventaId;

before(async () => {
  servidor = await levantarServidor();
  admin = await registrarEmpresa(servidor, { empresa: 'Ropa Envíos', usuario: 'ropaenvios' });
  otro = await registrarEmpresa(servidor, { empresa: 'Otro Envíos', usuario: 'otroenvios' });
  empleado = await crearEmpleado(servidor, admin, { usuario: 'vendedorenvios' });
  const producto = (await admin.post('/api/productos', { nombre: 'Buzo', precio_venta: 40000 })).json.id;
  const stock = await admin.post('/api/carga-inicial/stock', { filas: [{ producto_id: producto, cantidad: 10, costo: 18000 }] });
  assert.equal(stock.status, 200, stock.texto);
  caja = (await admin.get('/api/cuentas-tesoreria')).json.find((c) => c.tipo === 'efectivo');
  const venta = await admin.post('/api/ventas', { cliente: 'Consumidor final', items: [{ producto_id: producto, cantidad: 1, precio_unitario: 40000 }] });
  assert.equal(venta.status, 201, venta.texto);
  ventaId = venta.json.id;
});

after(async () => {
  await servidor?.cerrar();
});

const saldoCaja = async () => (await admin.get('/api/tesoreria')).json.cuentas.find((c) => c.id === caja.id).saldo;

test('el envío entra como costo de la venta y sale de la cuenta elegida', async () => {
  const antes = await saldoCaja();
  const res = await admin.post(`/api/ventas/${ventaId}/envio`, { importe: 6500, cuenta_tesoreria_id: caja.id, descripcion: 'Moto a Carlos Paz' });
  assert.equal(res.status, 201, res.texto);
  assert.equal(await saldoCaja(), antes - 6500);

  const venta = (await admin.get(`/api/ventas/${ventaId}`)).json;
  const envio = venta.desglose_costos.filas.find((f) => f.nombre === 'Envíos');
  assert.equal(envio.importe, 6500);
  assert.deepEqual(envio.detalle, ['Moto a Carlos Paz']);
  assert.equal(venta.desglose_costos.quedo.importe, 40000 - 18000 - 6500);
});

test('valida el importe, la cuenta y la venta', async () => {
  assert.equal((await admin.post(`/api/ventas/${ventaId}/envio`, { importe: 0, cuenta_tesoreria_id: caja.id })).status, 400);
  assert.equal((await admin.post(`/api/ventas/${ventaId}/envio`, { importe: 100, cuenta_tesoreria_id: 999999 })).status, 400);
  assert.equal((await admin.post('/api/ventas/999999/envio', { importe: 100, cuenta_tesoreria_id: caja.id })).status, 404);
});

test('el empleado no lo suma, y otro negocio no ve la venta', async () => {
  assert.equal((await empleado.post(`/api/ventas/${ventaId}/envio`, { importe: 100, cuenta_tesoreria_id: caja.id })).status, 403);
  const cajaOtro = (await otro.get('/api/cuentas-tesoreria')).json.find((c) => c.tipo === 'efectivo');
  assert.equal((await otro.post(`/api/ventas/${ventaId}/envio`, { importe: 100, cuenta_tesoreria_id: cajaOtro.id })).status, 404);
});

test('al anular la venta, el envío se anula con ella y la plata vuelve', async () => {
  const antes = await saldoCaja();
  const anulada = await admin.post(`/api/ventas/${ventaId}/anular`, {});
  assert.equal(anulada.status, 200, anulada.texto);
  assert.equal(await saldoCaja(), antes + 6500);
  assert.equal((await admin.post(`/api/ventas/${ventaId}/envio`, { importe: 100, cuenta_tesoreria_id: caja.id })).status, 400);
});
