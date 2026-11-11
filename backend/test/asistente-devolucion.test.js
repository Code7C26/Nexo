// Devoluciones desde el asistente (hist. §119): "Juan, le quedó chica la
// remera y quiere devolverla". Con NEXO_INTERPRETE=stub la frase va en la
// mini-sintaxis "devolucion: cliente=…; item=producto,cantidad". El servidor
// busca la venta del cliente y la ejecución pasa por registrarDevolucion,
// la misma de POST /api/devoluciones.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

let servidor;
let admin;
let remera;
let gorra;
let juan;
let ventaVieja;
let ventaNueva;

const stockDe = async (productoId) => (await admin.get('/api/stock')).json.find((s) => s.producto_id === productoId).stock_total;
const saldoDe = async (cuentaId) => (await admin.get('/api/tesoreria')).json.cuentas.find((c) => c.id === cuentaId).saldo;

before(async () => {
  servidor = await levantarServidor();
  admin = await registrarEmpresa(servidor, { empresa: 'Ropa Juan', usuario: 'ropa' });
  remera = (await admin.post('/api/productos', { nombre: 'Remera negra', precio_venta: 15000 })).json.id;
  gorra = (await admin.post('/api/productos', { nombre: 'Gorra', precio_venta: 9000 })).json.id;
  for (const id of [remera, gorra]) await admin.post('/api/stock/ajuste', { producto_id: id, cantidad: 20 });
  juan = (await admin.post('/api/clientes', { nombre: 'Juan Pérez' })).json.id;
  const vender = async (items) => {
    const r = await admin.post('/api/ventas', { cliente_id: juan, items });
    assert.equal(r.status, 201, r.texto);
    return r.json.id;
  };
  ventaVieja = await vender([{ producto_id: remera, cantidad: 1, precio_unitario: 14000 }]);
  ventaNueva = await vender([
    { producto_id: remera, cantidad: 2, precio_unitario: 15000 },
    { producto_id: gorra, cantidad: 1, precio_unitario: 9000 }
  ]);
});

after(async () => {
  await servidor?.cerrar();
});

const interpretar = (texto) => admin.post('/api/asistente/interpretar', { texto });
const ejecutar = (mensajeId, propuesta) =>
  admin.post('/api/asistente/ejecutar', { mensaje_id: mensajeId, tipo: 'devolucion', propuesta });

test('propone la devolución sobre la venta más nueva del cliente que tiene el producto', async () => {
  const r = await interpretar('devolucion: cliente=Juan; item=Remera,1; motivo=Le quedó chica');
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.tipo, 'devolucion');
  assert.deepEqual(r.json.problemas, []);
  const { cliente, ventas, motivo } = r.json.propuesta;
  assert.equal(cliente.id, juan);
  assert.equal(motivo, 'Le quedó chica');
  assert.deepEqual(ventas.map((v) => v.id), [ventaNueva, ventaVieja], 'la más nueva primero, la otra para elegir');
  const [item] = ventas[0].items;
  assert.equal(item.nombre, 'Remera negra');
  assert.equal(item.cantidad, 1);
  assert.equal(item.disponible, 2);
  assert.equal(item.precio_unitario, 15000);
});

test('confirmada, devuelve el stock, queda en Devoluciones y no se confirma dos veces', async () => {
  const antes = await stockDe(remera);
  const { json } = await interpretar('devolucion: cliente=Juan; item=Remera,1; motivo=Le quedó chica');
  const [venta] = json.propuesta.ventas;
  const propuesta = {
    venta_id: venta.id,
    items: [{ venta_item_id: venta.items[0].venta_item_id, cantidad: 1, vuelve_stock: true }],
    cuenta_tesoreria_id: null,
    motivo: 'Le quedó chica'
  };
  const r = await ejecutar(json.mensaje_id, propuesta);
  assert.equal(r.status, 201, r.texto);
  assert.equal(r.json.tipo, 'devolucion');
  assert.equal(await stockDe(remera), antes + 1);
  const devolucion = (await admin.get('/api/devoluciones')).json.find((d) => d.id === r.json.id);
  assert.equal(devolucion.venta_id, venta.id);
  assert.equal(devolucion.motivo, 'Le quedó chica');

  assert.equal((await ejecutar(json.mensaje_id, propuesta)).status, 404, 'el mensaje ya se confirmó');
});

test('no deja devolver más de lo que queda, con el mismo mensaje que el alta de siempre', async () => {
  const { json } = await interpretar('devolucion: cliente=Juan; item=Remera,5');
  const venta = json.propuesta.ventas.find((v) => v.id === ventaNueva);
  assert.equal(venta.items[0].disponible, 1, 'ya se devolvió una de las dos');
  assert.equal(venta.items[0].cantidad, 1, 'lo propuesto no pasa de lo que queda');
  const r = await ejecutar(json.mensaje_id, {
    venta_id: venta.id,
    items: [{ venta_item_id: venta.items[0].venta_item_id, cantidad: 5 }]
  });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /No se puede devolver más de lo vendido de "Remera negra" \(disponible: 1\)/);
});

test('con reintegro, la plata sale de la cuenta elegida', async () => {
  const { json } = await interpretar('devolucion: cliente=Juan; item=Gorra,1; reintegro=Efectivo');
  assert.equal(json.propuesta.reintegro.cuenta.estado, 'resuelto');
  const cuentaId = json.propuesta.reintegro.cuenta.id;
  const [venta] = json.propuesta.ventas;
  const antes = await saldoDe(cuentaId);
  const r = await ejecutar(json.mensaje_id, {
    venta_id: venta.id,
    items: [{ venta_item_id: venta.items[0].venta_item_id, cantidad: 1 }],
    cuenta_tesoreria_id: cuentaId
  });
  assert.equal(r.status, 201, r.texto);
  assert.equal(await saldoDe(cuentaId), antes - 9000);
});

test('sin venta para devolver, o con un cliente que no existe, lo dice y no se puede confirmar', async () => {
  const sinVenta = await interpretar('devolucion: cliente=Juan; item=Gorra,1');
  assert.equal(sinVenta.json.propuesta.ventas.length, 0, 'la única gorra ya se devolvió');
  assert.equal(sinVenta.json.ejecutable, false);
  assert.match(sinVenta.json.problemas.join(' '), /No encontré una venta a Juan Pérez con Gorra/);

  const desconocido = await interpretar('devolucion: cliente=Martina; item=Remera,1');
  assert.equal(desconocido.json.ejecutable, false);
  assert.match(desconocido.json.problemas.join(' '), /No encontré al cliente "Martina"/);
});

test('una venta anulada no se ofrece para devolver', async () => {
  const sole = (await admin.post('/api/clientes', { nombre: 'Sole' })).json.id;
  const venta = (
    await admin.post('/api/ventas', { cliente_id: sole, items: [{ producto_id: remera, cantidad: 1, precio_unitario: 15000 }] })
  ).json.id;
  assert.equal((await admin.post(`/api/ventas/${venta}/anular`)).status, 200);
  const { json } = await interpretar('devolucion: cliente=Sole; item=Remera,1');
  assert.equal(json.propuesta.ventas.length, 0);
});

test('el alta de siempre responde igual que antes de pasar a registrarDevolucion', async () => {
  const noExiste = await admin.post('/api/devoluciones', { venta_id: 999999, items: [{ venta_item_id: 1, cantidad: 1 }] });
  assert.equal(noExiste.status, 404);
  assert.equal(noExiste.json.error, 'Venta no encontrada.');
  const vacia = await admin.post('/api/devoluciones', { venta_id: ventaVieja, items: [] });
  assert.equal(vacia.status, 400);
  assert.equal(vacia.json.error, 'La devolución necesita al menos un item.');
});

test('una venta sin precio en la frase toma el de lista del producto', async () => {
  // "Vendí dos gorras a Juan": con el precio obligatorio, la IA no proponía nada.
  const r = await interpretar('venta: cliente=Juan; item=Gorra,2; cobro_cuenta=Efectivo');
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.tipo, 'venta');
  assert.deepEqual(r.json.problemas, []);
  assert.equal(r.json.propuesta.items[0].precio_unitario, 9000);

  const hecha = await admin.post('/api/asistente/ejecutar', { mensaje_id: r.json.mensaje_id, tipo: 'venta', propuesta: r.json.propuesta });
  assert.equal(hecha.status, 201, hecha.texto);
  const venta = (await admin.get(`/api/ventas/${hecha.json.venta_id ?? hecha.json.id}`)).json;
  assert.equal(venta.total, 18000);
});
