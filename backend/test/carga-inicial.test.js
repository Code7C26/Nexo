// Carga inicial (handoff 8c): un negocio que ya venía funcionando carga su
// stock con el costo, lo que le deben, lo que debe y sus ventas de antes, sin
// inventar compras ni ventas. Va aparte porque cada archivo levanta su
// servidor, y el alta de empresas tiene un tope de intentos por IP.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

let servidor;

before(async () => {
  servidor = await levantarServidor();
});

after(async () => {
  await servidor?.cerrar();
});

// Las fechas del día de la Argentina (UTC-3), como fechaDeHoy() del servidor.
const haceDias = (n) => new Date(Date.now() - 3 * 3600 * 1000 - n * 86400000).toISOString().slice(0, 10);
const hoy = () => haceDias(0);

test('el alta guarda si el negocio ya venía funcionando, y la guía suma el paso', async () => {
  const n = await registrarEmpresa(servidor, { empresa: 'Mates Tosi', usuario: 'mates', extra: { ya_funcionaba: true } });
  const pasos = (await n.get('/api/negocio/primeros-pasos')).json;
  assert.deepEqual([pasos.ya_funcionaba, pasos.carga_inicial], [true, false]);
  assert.equal((await n.get('/api/carga-inicial')).json.ya_funcionaba, 1);

  // "Agregar negocio" también lo pregunta; crearlo pasa la sesión a él.
  const deCero = await n.post('/api/negocios', { nombre: 'Kiosco', ya_funcionaba: false });
  assert.equal(deCero.status, 201, deCero.texto);
  assert.equal((await n.get('/api/negocio/primeros-pasos')).json.ya_funcionaba, false);
  assert.equal((await n.get('/api/carga-inicial')).json.ya_funcionaba, 0);
});

test('stock inicial: cantidad y costo por depósito, alta en la misma planilla, y el costo entra al promedio', async () => {
  const n = await registrarEmpresa(servidor, { empresa: 'Mates Stock', usuario: 'matesstock' });
  const mate = (await n.post('/api/productos', { nombre: 'Mate calabaza', precio_venta: 12000 })).json.id;
  const servicio = (await n.post('/api/productos', { nombre: 'Grabado', precio_venta: 3000, tipo: 'servicio' })).json.id;

  const planilla = (await n.get('/api/carga-inicial/stock')).json;
  assert.ok(planilla.deposito.id);
  assert.deepEqual(planilla.filas.map((f) => f.nombre), ['Mate calabaza'], 'los servicios no tienen stock');
  assert.deepEqual([planilla.filas[0].stock, planilla.filas[0].cargado], [0, false]);

  const guardado = await n.post('/api/carga-inicial/stock', {
    filas: [{ producto_id: mate, cantidad: 10, costo: 5000 }],
    nuevos: [{ nombre: 'Bombilla', precio_venta: 4000, cantidad: 20, costo: 1500 }]
  });
  assert.equal(guardado.status, 200, guardado.texto);
  assert.deepEqual(guardado.json, { cambiados: 2, creados: 1 });

  const productos = (await n.get('/api/productos')).json;
  const delMate = productos.find((p) => p.id === mate);
  const bombilla = productos.find((p) => p.nombre === 'Bombilla');
  assert.deepEqual([delMate.precio_costo, delMate.stock], [5000, 10]);
  assert.deepEqual([bombilla.precio_costo, bombilla.stock, bombilla.precio_venta], [1500, 20, 4000]);
  const movimiento = (await n.get('/api/movimientos-stock')).json.find((m) => m.producto_id === mate);
  assert.deepEqual([movimiento.origen, movimiento.cantidad], ['stock_inicial', 10]);
  assert.equal((await n.get('/api/carga-inicial/stock')).json.filas.find((f) => f.producto_id === mate).cargado, true);

  // No genera deuda ni toca la caja.
  const cc = (await n.get('/api/cuentas-corrientes')).json;
  assert.deepEqual([cc.totales.por_cobrar, cc.totales.por_pagar], [0, 0]);

  // Volver a declarar el depósito reemplaza: hay 8, a $ 6.000.
  assert.equal((await n.post('/api/carga-inicial/stock', { filas: [{ producto_id: mate, cantidad: 8, costo: 6000 }] })).status, 200);
  const otraVez = (await n.get('/api/productos')).json.find((p) => p.id === mate);
  assert.deepEqual([otraVez.precio_costo, otraVez.stock], [6000, 8]);

  // Una compra después se promedia con el stock inicial: 8 × 6.000 + 2 × 9.000 = 6.600.
  const compra = await n.post('/api/compras', { proveedor: 'Mayorista', items: [{ producto: 'Mate calabaza', cantidad: 2, precio_unitario: 9000 }] });
  assert.equal(compra.status, 201, compra.texto);
  assert.equal((await n.post(`/api/compras/${compra.json.id}/confirmar`, {})).status, 200);
  assert.equal((await n.patch(`/api/compras/${compra.json.id}/estado-envio`, { estado_envio: 'recibido' })).status, 200);
  assert.equal((await n.get('/api/productos')).json.find((p) => p.id === mate).precio_costo, 6600);
  // Editar esa compra reconstruye el costo desde el historial, con el stock
  // inicial adentro: el stock inicial deja 8 a 6.000, la compra lo lleva a
  // 6.600, su reversión es una salida (no toca el costo) y la compra nueva
  // entra a 3.000: 8 × 6.600 + 2 × 3.000 = 5.880.
  const editada = await n.put(`/api/compras/${compra.json.id}`, {
    proveedor: 'Mayorista',
    items: [{ producto: 'Mate calabaza', cantidad: 2, precio_unitario: 3000 }]
  });
  assert.equal(editada.status, 200, editada.texto);
  assert.equal((await n.get('/api/productos')).json.find((p) => p.id === mate).precio_costo, 5880);

  // La venta toma ese costo.
  const venta = await n.post('/api/ventas', { cliente: 'Juan', items: [{ producto_id: mate, cantidad: 1, precio_unitario: 12000 }] });
  assert.equal(venta.status, 201, venta.texto);
  assert.equal((await n.get(`/api/ventas/${venta.json.id}`)).json.costo_total, 5880);

  // Lo que no vale.
  assert.equal((await n.post('/api/carga-inicial/stock', { filas: [{ producto_id: servicio, cantidad: 1, costo: 1 }] })).status, 400);
  assert.equal((await n.post('/api/carga-inicial/stock', { filas: [{ producto_id: mate, cantidad: -1, costo: 1 }] })).status, 400);
  assert.equal((await n.post('/api/carga-inicial/stock', { filas: [] })).status, 400);
  assert.equal((await n.post('/api/carga-inicial/stock', { nuevos: [{ nombre: ' ', cantidad: 1, costo: 1 }] })).status, 400);
  assert.ok((await n.get('/api/carga-inicial')).json.stock.cantidad >= 2);
});

test('saldos anteriores: lo que te deben y lo que debés se cobran, pagan, vencen y se anulan', async () => {
  const n = await registrarEmpresa(servidor, { empresa: 'Mates Saldos', usuario: 'matessaldos' });
  const fecha = haceDias(40);
  const deben = await n.post('/api/carga-inicial/saldos', { tipo: 'cliente', nombre: 'Juana', importe: 20000, fecha, vencimiento: haceDias(10) });
  assert.equal(deben.status, 201, deben.texto);
  const debo = await n.post('/api/carga-inicial/saldos', { tipo: 'proveedor', nombre: 'Yerbatera', importe: 50000, fecha });
  assert.equal(debo.status, 201, debo.texto);

  const cc = (await n.get('/api/cuentas-corrientes')).json;
  assert.deepEqual([cc.totales.por_cobrar, cc.totales.por_pagar], [20000, 50000]);
  assert.equal(cc.por_cobrar[0].dias_max, 10, 'vence en la fecha que se cargó');

  // No es venta del período ni compra.
  const resumen = (await n.get('/api/resumen')).json;
  assert.deepEqual([resumen.ventas, resumen.costo_mercaderia], [0, 0]);
  const enLista = (await n.get('/api/ventas')).json.find((v) => v.id === deben.json.id);
  assert.deepEqual([enLista.total, enLista.saldo_inicial, enLista.costo_total, enLista.estado_cobro], [20000, 20000, 0, 'pendiente']);
  const compra = (await n.get(`/api/compras/${debo.json.id}`)).json;
  assert.deepEqual([compra.total, compra.estado], [50000, 'activa']);

  // Se cobra con el circuito de siempre, y la plata entra a la caja.
  const efectivo = (await n.get('/api/cuentas-tesoreria')).json.find((c) => c.tipo === 'efectivo');
  assert.equal((await n.post(`/api/ventas/${deben.json.id}/cobros`, { importe: 25000, cuenta_tesoreria_id: efectivo.id })).status, 400);
  assert.equal((await n.post(`/api/ventas/${deben.json.id}/cobros`, { importe: 5000, cuenta_tesoreria_id: efectivo.id })).status, 201);
  assert.equal((await n.post(`/api/compras/${debo.json.id}/pagos`, { importe: 50000, cuenta_tesoreria_id: efectivo.id })).status, 201);
  const despues = (await n.get('/api/cuentas-corrientes')).json;
  assert.deepEqual([despues.totales.por_cobrar, despues.totales.por_pagar], [15000, 0]);

  // No se factura; con un cobro que entró a la caja ya no se anula.
  assert.equal((await n.post(`/api/ventas/${deben.json.id}/facturar`, { condicion: 'efectivo' })).status, 400);
  assert.equal((await n.post(`/api/ventas/${deben.json.id}/anular`, {})).status, 400);

  // Uno sin cobros se anula, su deuda se va, y vuelve al restaurarlo.
  const otro = await n.post('/api/carga-inicial/saldos', { tipo: 'cliente', nombre: 'Pedro', importe: 3000 });
  assert.equal((await n.post(`/api/ventas/${otro.json.id}/anular`, {})).status, 200);
  assert.equal((await n.get('/api/cuentas-corrientes')).json.totales.por_cobrar, 15000);
  assert.equal((await n.post(`/api/ventas/${otro.json.id}/restaurar`, {})).status, 200);
  assert.equal((await n.get('/api/cuentas-corrientes')).json.totales.por_cobrar, 18000);

  const saldos = (await n.get('/api/carga-inicial/saldos')).json;
  assert.deepEqual(saldos.clientes.map((s) => [s.nombre, s.importe, s.cancelado]), [['Pedro', 3000, 0], ['Juana', 20000, 5000]]);
  assert.deepEqual(saldos.proveedores.map((s) => [s.nombre, s.cancelado]), [['Yerbatera', 50000]]);

  // Lo que no vale.
  assert.equal((await n.post('/api/carga-inicial/saldos', { tipo: 'cliente', nombre: 'X', importe: 0 })).status, 400);
  assert.equal((await n.post('/api/carga-inicial/saldos', { tipo: 'otro', nombre: 'X', importe: 1 })).status, 400);
  assert.equal((await n.post('/api/carga-inicial/saldos', { tipo: 'cliente', nombre: 'X', importe: 1, fecha: '2999-01-01' })).status, 400);
  assert.equal((await n.post('/api/carga-inicial/saldos', { tipo: 'cliente', nombre: 'X', importe: 1, fecha, vencimiento: haceDias(50) })).status, 400);
});

test('ventas de antes: no mueven stock ni caja, cuentan en los reportes y la deuda queda', async () => {
  const n = await registrarEmpresa(servidor, { empresa: 'Mates Ventas', usuario: 'matesventas' });
  const mate = (await n.post('/api/productos', { nombre: 'Mate', precio_venta: 10000 })).json.id;
  await n.post('/api/carga-inicial/stock', { filas: [{ producto_id: mate, cantidad: 5, costo: 4000 }] });
  const efectivo = (await n.get('/api/cuentas-tesoreria')).json.find((c) => c.tipo === 'efectivo');
  const saldoCaja = async () => (await n.get('/api/tesoreria')).json.cuentas.find((c) => c.id === efectivo.id).saldo;
  const cajaAntes = await saldoCaja();
  assert.equal(typeof cajaAntes, 'number');

  const cobrada = await n.post('/api/carga-inicial/ventas', {
    fecha: haceDias(3),
    items: [{ producto_id: mate, cantidad: 2, precio_unitario: 10000 }],
    cobrada: true,
    cuenta_tesoreria_id: efectivo.id
  });
  assert.equal(cobrada.status, 201, cobrada.texto);
  const fiada = await n.post('/api/carga-inicial/ventas', {
    fecha: haceDias(2),
    cliente: 'Marta',
    items: [{ producto_id: mate, cantidad: 1, precio_unitario: 10000 }],
    cobrada: false,
    vencimiento: hoy()
  });
  assert.equal(fiada.status, 201, fiada.texto);

  assert.equal((await n.get('/api/productos')).json.find((p) => p.id === mate).stock, 5, 'el stock cargado ya es el de hoy');
  assert.equal(await saldoCaja(), cajaAntes, 'la plata cargada ya es la de hoy');
  const resumen = (await n.get('/api/resumen')).json;
  assert.deepEqual([resumen.ventas, resumen.costo_mercaderia], [30000, 12000]);
  assert.equal((await n.get('/api/cuentas-corrientes')).json.totales.por_cobrar, 10000);
  const enLista = (await n.get('/api/ventas')).json.find((v) => v.id === cobrada.json.id);
  assert.deepEqual([enLista.carga_inicial, enLista.estado_cobro, enLista.cliente], [true, 'cobrado', 'Consumidor final']);
  assert.equal((await n.get('/api/carga-inicial/ventas')).json.length, 2);

  // No se edita; anular no devuelve stock, y lo cobrado antes no la frena.
  const editar = await n.put(`/api/ventas/${cobrada.json.id}`, { cliente: 'X', items: [{ producto_id: mate, cantidad: 1, precio_unitario: 1 }] });
  assert.equal(editar.status, 400);
  assert.equal((await n.post(`/api/ventas/${cobrada.json.id}/anular`, {})).status, 200);
  assert.equal((await n.get('/api/productos')).json.find((p) => p.id === mate).stock, 5);
  assert.equal((await n.get('/api/cuentas-corrientes')).json.totales.por_cobrar, 10000);
  assert.equal((await n.post(`/api/ventas/${cobrada.json.id}/restaurar`, {})).status, 200);
  assert.equal((await n.get('/api/productos')).json.find((p) => p.id === mate).stock, 5);
  assert.equal((await n.get('/api/cuentas-corrientes')).json.totales.por_cobrar, 10000);

  // Lo que no vale: sin cobrar y sin cliente, sin fecha, con fecha futura.
  const item = [{ producto_id: mate, cantidad: 1, precio_unitario: 1 }];
  assert.equal((await n.post('/api/carga-inicial/ventas', { fecha: hoy(), items: item, cobrada: false })).status, 400);
  assert.equal((await n.post('/api/carga-inicial/ventas', { items: item, cobrada: true, cuenta_tesoreria_id: efectivo.id })).status, 400);
  const futura = await n.post('/api/carga-inicial/ventas', { fecha: '2999-01-01', items: item, cobrada: true, cuenta_tesoreria_id: efectivo.id });
  assert.equal(futura.status, 400);
});

// Dos negocios de la misma cuenta: crear el segundo pasa la sesión a él.
test('la carga inicial es de cada negocio', async () => {
  const n = await registrarEmpresa(servidor, { empresa: 'Negocio A', usuario: 'negocioa' });
  const deA = (await n.post('/api/productos', { nombre: 'Termo', precio_venta: 1 })).json.id;
  const saldoA = (await n.post('/api/carga-inicial/saldos', { tipo: 'cliente', nombre: 'Z', importe: 10 })).json.id;
  assert.equal((await n.post('/api/negocios', { nombre: 'Negocio B' })).status, 201);
  assert.equal((await n.post('/api/carga-inicial/stock', { filas: [{ producto_id: deA, cantidad: 1, costo: 1 }] })).status, 400);
  assert.equal((await n.get('/api/carga-inicial/saldos')).json.clientes.length, 0);
  assert.equal((await n.get('/api/carga-inicial/stock')).json.filas.length, 0);
  assert.equal((await n.post(`/api/ventas/${saldoA}/anular`, {})).status, 404);
});
