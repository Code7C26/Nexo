// Tienda online y el canal de cada venta (hist. §128): el tipo "Tienda
// online" trae el módulo Venta online; cada venta guarda por dónde entró (el
// punto de venta pone 'local', el alta lo que elige quien vende), y el
// reporte de ventas suma por canal, con lo que se usó al vender en el costo.
// Va aparte porque cada archivo levanta su servidor, y el alta de empresas
// tiene un tope de intentos por IP.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

let servidor;
let tienda;
let local;
let remera;
let bolsa;

before(async () => {
  servidor = await levantarServidor();
  tienda = await registrarEmpresa(servidor, { empresa: 'Remeras Online', usuario: 'remerasonline', extra: { rubro: 'ecommerce' } });
  local = await registrarEmpresa(servidor, { empresa: 'Kiosco Pepe', usuario: 'kioscopepe', extra: { rubro: 'kiosco' } });
  remera = (await tienda.post('/api/productos', { nombre: 'Remera', precio_venta: 10000 })).json.id;
  bolsa = (await tienda.post('/api/productos', { nombre: 'Bolsa de envío', precio_venta: 0 })).json.id;
  const stock = await tienda.post('/api/carga-inicial/stock', {
    filas: [
      { producto_id: remera, cantidad: 50, costo: 4000 },
      { producto_id: bolsa, cantidad: 50, costo: 300 }
    ]
  });
  assert.equal(stock.status, 200, stock.texto);
  // Cada venta lleva una bolsa de envío (hist. §126).
  const config = await tienda.put(`/api/productos/${remera}/componentes-venta`, {
    componentes: [{ producto_id: bolsa, cantidad: 1, por_venta: true }]
  });
  assert.equal(config.status, 200, config.texto);
});

after(async () => {
  await servidor?.cerrar();
});

const vender = (cantidad, extra = {}) =>
  tienda.post('/api/ventas', { cliente: 'Consumidor final', items: [{ producto_id: remera, cantidad, precio_unitario: 10000 }], ...extra });

test('el tipo Tienda online trae Venta online, consultas, compras, stock y producción, sin punto de venta', async () => {
  const negocio = (await tienda.get('/api/negocio')).json;
  assert.equal(negocio.rubro, 'ecommerce');
  assert.deepEqual(negocio.modulos, ['canales', 'crm', 'compras', 'stock', 'produccion']);
  // Un kiosco no lo trae, y lo puede sumar.
  assert.ok(!(await local.get('/api/negocio')).json.modulos.includes('canales'));
  const sumado = await local.put('/api/negocio', { modulos: ['pos', 'canales', 'compras', 'stock'] });
  assert.equal(sumado.status, 200, sumado.texto);
  assert.ok((await local.get('/api/negocio')).json.modulos.includes('canales'));
});

test('la venta guarda por dónde entró; la edición sin canal conserva el que tenía', async () => {
  const pasosAntes = (await tienda.get('/api/negocio/primeros-pasos')).json;
  assert.equal(pasosAntes.venta_online, false);

  const porInstagram = await vender(1, { canal: 'instagram' });
  assert.equal(porInstagram.status, 201, porInstagram.texto);
  const id = porInstagram.json.id;
  assert.equal((await tienda.get(`/api/ventas/${id}`)).json.canal, 'instagram');
  assert.equal((await tienda.get('/api/ventas')).json.find((v) => v.id === id).canal, 'instagram');
  // Una venta por internet da por hecho el paso de la guía.
  assert.equal((await tienda.get('/api/negocio/primeros-pasos')).json.venta_online, true);

  const items = [{ producto_id: remera, cantidad: 2, precio_unitario: 10000 }];
  assert.equal((await tienda.put(`/api/ventas/${id}`, { cliente: 'Consumidor final', items })).status, 200);
  assert.equal((await tienda.get(`/api/ventas/${id}`)).json.canal, 'instagram');
  assert.equal((await tienda.put(`/api/ventas/${id}`, { cliente: 'Consumidor final', items, canal: 'whatsapp' })).status, 200);
  assert.equal((await tienda.get(`/api/ventas/${id}`)).json.canal, 'whatsapp');
  assert.equal((await tienda.put(`/api/ventas/${id}`, { cliente: 'Consumidor final', items, canal: '' })).status, 200);
  assert.equal((await tienda.get(`/api/ventas/${id}`)).json.canal, null);

  const rara = await vender(1, { canal: 'tiktok' });
  assert.equal(rara.status, 400);
  assert.match(rara.json.error, /canal/);
  assert.equal((await tienda.put(`/api/ventas/${id}`, { cliente: 'Consumidor final', items, canal: 'constructor' })).status, 400);
});

test('la venta del punto de venta es del local', async () => {
  await tienda.put('/api/negocio', { modulos: ['pos', 'canales', 'crm', 'compras', 'stock', 'produccion'] });
  const efectivo = (await tienda.get('/api/cuentas-tesoreria')).json.find((c) => c.tipo === 'efectivo');
  const turno = await tienda.post('/api/turnos-caja', { cuenta_tesoreria_id: efectivo.id, contado: 0 });
  assert.equal(turno.status, 201, turno.texto);
  const venta = await tienda.post('/api/pos/ventas', {
    turno_caja_id: turno.json.id,
    items: [{ producto_id: remera, cantidad: 1, precio_unitario: 10000 }],
    cobros: [{ cuenta_tesoreria_id: efectivo.id, importe: 10000 }],
    // Ni la bolsa: en el mostrador no se usó.
    consumos: [],
    canal: 'instagram'
  });
  assert.equal(venta.status, 201, venta.texto);
  assert.equal((await tienda.get(`/api/ventas/${venta.json.id}`)).json.canal, 'local');
  await tienda.post(`/api/turnos-caja/${turno.json.id}/cerrar`, { contado: 10000 });
});

test('el reporte de ventas suma por canal, con la bolsa del envío en el costo', async () => {
  await vender(3, { canal: 'mercadolibre' });
  const reporte = (await tienda.get('/api/reportes/ventas')).json;
  const porCanal = Object.fromEntries(reporte.canales.map((c) => [c.nombre, c]));
  // Mercado Libre: 3 × 10.000, costo 3 × 4.000 + una bolsa de 300.
  assert.equal(porCanal['Mercado Libre'].cantidad_ventas, 1);
  assert.equal(porCanal['Mercado Libre'].ventas, 30000);
  assert.equal(porCanal['Mercado Libre'].ganancia, 30000 - 12000 - 300);
  // El local, sin bolsa.
  assert.equal(porCanal['En el local'].ganancia, 10000 - 4000);
  // La que quedó sin indicar (2 remeras y su bolsa).
  assert.equal(porCanal['Sin indicar'].ganancia, 20000 - 8000 - 300);
  assert.equal(reporte.canales[0].nombre, 'Mercado Libre');
  const suma = reporte.canales.reduce((acc, c) => acc + c.ventas, 0);
  assert.equal(suma, reporte.totales.ventas_netas);

  // Otro negocio no ve nada de esto (CLAUDE.md §28).
  assert.deepEqual((await local.get('/api/reportes/ventas')).json.canales, []);
});
