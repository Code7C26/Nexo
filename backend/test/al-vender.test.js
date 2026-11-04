// Lo que se usa al vender (Etapa J, hist. §126): la caja, la bolsa, el
// frasquito que se gastan al vender sin venderse. Nexo propone lo de siempre,
// quien vende lo cambia, y lo que quedó sale del stock y entra al costo de la
// venta. Va aparte porque cada archivo levanta su servidor, y el alta de
// empresas tiene un tope de intentos por IP.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

let servidor;
let n;
let negocio;

before(async () => {
  servidor = await levantarServidor();
  n = negocio = await registrarEmpresa(servidor, { empresa: 'Mafaldas Ana', usuario: 'mafaldasana' });
});

after(async () => {
  await servidor?.cerrar();
});

// Mafaldas para vender, cajas (una por unidad) y bolsas (una por venta), con
// stock y costo. `tanda` distingue los nombres de cada test.
async function catalogo(tanda, { cajas = 20, bolsas = 10 } = {}, n = negocio) {
  const mafalda = (await n.post('/api/productos', { nombre: `Mafalda ${tanda}`, precio_venta: 900 })).json.id;
  const caja = (await n.post('/api/productos', { nombre: `Caja ${tanda}`, precio_venta: 0 })).json.id;
  const bolsa = (await n.post('/api/productos', { nombre: `Bolsa ${tanda}`, precio_venta: 0 })).json.id;
  const stock = await n.post('/api/carga-inicial/stock', {
    filas: [
      { producto_id: mafalda, cantidad: 30, costo: 300 },
      ...(cajas ? [{ producto_id: caja, cantidad: cajas, costo: 50 }] : []),
      ...(bolsas ? [{ producto_id: bolsa, cantidad: bolsas, costo: 20 }] : [])
    ]
  });
  assert.equal(stock.status, 200, stock.texto);
  const config = await n.put(`/api/productos/${mafalda}/componentes-venta`, {
    componentes: [
      { producto_id: caja, cantidad: 1 },
      { producto_id: bolsa, cantidad: 1, por_venta: true }
    ]
  });
  assert.equal(config.status, 200, config.texto);
  return { mafalda, caja, bolsa };
}

const stockDe = async (cliente, id) => (await cliente.get('/api/productos')).json.find((p) => p.id === id).stock;
const vender = (cliente, mafalda, cantidad, extra = {}) =>
  cliente.post('/api/ventas', { cliente: 'Consumidor final', items: [{ producto_id: mafalda, cantidad, precio_unitario: 900 }], ...extra });

test('lo que lleva cada producto: se guarda, se lee y se valida', async () => {
  const { mafalda, caja, bolsa } = await catalogo('A');
  const leido = (await n.get(`/api/productos/${mafalda}/componentes-venta`)).json;
  assert.deepEqual(
    leido.componentes.map((c) => [c.nombre, c.cantidad, c.por_venta]),
    [
      ['Caja A', 1, false],
      ['Bolsa A', 1, true]
    ]
  );
  const todos = (await n.get('/api/componentes-venta')).json;
  assert.ok(todos.some((t) => t.producto_id === mafalda && t.componentes.length === 2));

  const mal = [
    [{ producto_id: mafalda, cantidad: 1 }],
    [{ producto_id: caja, cantidad: 0 }],
    [
      { producto_id: caja, cantidad: 1 },
      { producto_id: caja, cantidad: 2 }
    ]
  ];
  for (const componentes of mal) {
    const r = await n.put(`/api/productos/${mafalda}/componentes-venta`, { componentes });
    assert.equal(r.status, 400, JSON.stringify(componentes));
  }
  const servicio = (await n.post('/api/productos', { nombre: 'Envoltorio de regalo', precio_venta: 100, tipo: 'servicio' })).json.id;
  assert.equal((await n.put(`/api/productos/${mafalda}/componentes-venta`, { componentes: [{ producto_id: servicio, cantidad: 1 }] })).status, 400);
  // Lo que falló no tocó lo guardado.
  assert.equal((await n.get(`/api/productos/${mafalda}/componentes-venta`)).json.componentes.length, 2);

  // Una lista vacía lo deja sin nada.
  assert.equal((await n.put(`/api/productos/${bolsa}/componentes-venta`, { componentes: [] })).status, 200);
  assert.equal((await n.put(`/api/productos/${mafalda}/componentes-venta`, { componentes: [] })).status, 200);
  assert.deepEqual((await n.get(`/api/productos/${mafalda}/componentes-venta`)).json.componentes, []);
});

test('sin decir nada, va lo de siempre: una caja por unidad y una bolsa por venta, al costo de la venta', async () => {
  const { mafalda, caja, bolsa } = await catalogo('B');
  const resumenAntes = (await n.get('/api/resumen')).json;
  const venta = await vender(n, mafalda, 6);
  assert.equal(venta.status, 201, venta.texto);
  assert.equal(await stockDe(n, caja), 14);
  assert.equal(await stockDe(n, bolsa), 9);

  const ficha = (await n.get(`/api/ventas/${venta.json.id}`)).json;
  assert.deepEqual(
    ficha.consumos.map((c) => [c.nombre, c.cantidad, c.costo_unitario_historico]),
    [
      ['Caja B', 6, 50],
      ['Bolsa B', 1, 20]
    ]
  );
  // 6 × 300 de mafaldas + 6 × 50 de cajas + 20 de la bolsa.
  assert.equal(ficha.costo_total, 2120);
  assert.equal(ficha.margen, 5400 - 2120);
  const enLista = (await n.get('/api/ventas')).json.find((v) => v.id === venta.json.id);
  assert.deepEqual([enLista.costo_total, enLista.margen], [2120, 3280]);
  const resumen = (await n.get('/api/resumen')).json;
  assert.equal(resumen.costo_mercaderia - resumenAntes.costo_mercaderia, 2120);

  const movimientos = (await n.get('/api/movimientos-stock')).json.filter((m) => m.venta_id === venta.json.id);
  assert.deepEqual(movimientos.map((m) => m.origen).sort(), ['consumo', 'consumo', 'venta']);
});

test('quien vende lo cambia: dos bolsas y ninguna caja', async () => {
  const { mafalda, caja, bolsa } = await catalogo('C');
  const venta = await vender(n, mafalda, 3, { consumos: [{ producto_id: bolsa, cantidad: 2 }] });
  assert.equal(venta.status, 201, venta.texto);
  assert.equal(await stockDe(n, caja), 20);
  assert.equal(await stockDe(n, bolsa), 8);

  // Una lista vacía: esta vez no se usó nada.
  const sinNada = await vender(n, mafalda, 1, { consumos: [] });
  assert.equal(sinNada.status, 201, sinNada.texto);
  assert.deepEqual((await n.get(`/api/ventas/${sinNada.json.id}`)).json.consumos, []);
});

test('lo elegido sin stock frena la venta; lo de siempre sin stock no la frena', async () => {
  const { mafalda, caja, bolsa } = await catalogo('D', { cajas: 2, bolsas: 0 });
  const ventasAntes = (await n.get('/api/ventas')).json.length;

  const elegida = await vender(n, mafalda, 3, { consumos: [{ producto_id: caja, cantidad: 3 }] });
  assert.equal(elegida.status, 400);
  assert.match(elegida.json.error, /No alcanza "Caja D"/);
  // Nada a mitad de camino: ni la venta ni el stock.
  assert.equal((await n.get('/api/ventas')).json.length, ventasAntes);
  assert.equal(await stockDe(n, mafalda), 30);
  assert.equal(await stockDe(n, caja), 2);

  // Lo de siempre va hasta donde alcanza: dos cajas, ninguna bolsa.
  const sola = await vender(n, mafalda, 3);
  assert.equal(sola.status, 201, sola.texto);
  assert.deepEqual(
    (await n.get(`/api/ventas/${sola.json.id}`)).json.consumos.map((c) => [c.nombre, c.cantidad]),
    [['Caja D', 2]]
  );
  assert.equal(await stockDe(n, caja), 0);
  assert.equal(await stockDe(n, bolsa), 0);
});

test('anular devuelve lo usado, restaurar lo vuelve a sacar y editar lo reemplaza', async () => {
  const { mafalda, caja, bolsa } = await catalogo('E');
  const venta = await vender(n, mafalda, 4);
  assert.equal(venta.status, 201, venta.texto);
  assert.deepEqual([await stockDe(n, caja), await stockDe(n, bolsa)], [16, 9]);

  assert.equal((await n.post(`/api/ventas/${venta.json.id}/anular`)).status, 200);
  assert.deepEqual([await stockDe(n, caja), await stockDe(n, bolsa)], [20, 10]);
  const restaurada = await n.post(`/api/ventas/${venta.json.id}/restaurar`);
  assert.equal(restaurada.status, 200, restaurada.texto);
  assert.deepEqual([await stockDe(n, caja), await stockDe(n, bolsa)], [16, 9]);

  // Editar: 5 mafaldas con lo de siempre, y después con tres bolsas.
  const items = [{ producto_id: mafalda, cantidad: 5, precio_unitario: 900 }];
  const edicion = await n.put(`/api/ventas/${venta.json.id}`, { cliente: 'Consumidor final', items });
  assert.equal(edicion.status, 200, edicion.texto);
  assert.deepEqual([await stockDe(n, caja), await stockDe(n, bolsa)], [15, 9]);
  const otra = await n.put(`/api/ventas/${venta.json.id}`, { cliente: 'Consumidor final', items, consumos: [{ producto_id: bolsa, cantidad: 3 }] });
  assert.equal(otra.status, 200, otra.texto);
  assert.deepEqual([await stockDe(n, caja), await stockDe(n, bolsa)], [20, 7]);
  assert.equal((await n.get(`/api/ventas/${venta.json.id}`)).json.consumos.length, 1);

  // Sin bolsas para tanto, la edición no se guarda y queda la de antes.
  const demas = await n.put(`/api/ventas/${venta.json.id}`, { cliente: 'Consumidor final', items, consumos: [{ producto_id: bolsa, cantidad: 30 }] });
  assert.equal(demas.status, 400);
  assert.deepEqual([await stockDe(n, caja), await stockDe(n, bolsa)], [20, 7]);
  assert.equal(await stockDe(n, mafalda), 25);
});

test('en el punto de venta, el empleado cambia lo que se usa y no ve su costo', async () => {
  const { mafalda, caja, bolsa } = await catalogo('F');
  const empleado = await crearEmpleado(servidor, n, { usuario: 'cajera' });
  const efectivo = (await n.get('/api/cuentas-tesoreria')).json.find((c) => c.tipo === 'efectivo');
  const turno = await empleado.post('/api/turnos-caja', { cuenta_tesoreria_id: efectivo.id, contado: 0 });
  assert.equal(turno.status, 201, turno.texto);

  assert.ok((await empleado.get('/api/componentes-venta')).json.some((t) => t.producto_id === mafalda));
  assert.equal((await empleado.put(`/api/productos/${mafalda}/componentes-venta`, { componentes: [] })).status, 403);

  const venta = await empleado.post('/api/pos/ventas', {
    turno_caja_id: turno.json.id,
    items: [{ producto_id: mafalda, cantidad: 2, precio_unitario: 900 }],
    cobros: [{ cuenta_tesoreria_id: efectivo.id, importe: 1800 }],
    consumos: [
      { producto_id: caja, cantidad: 2 },
      { producto_id: bolsa, cantidad: 2 }
    ]
  });
  assert.equal(venta.status, 201, venta.texto);
  assert.deepEqual([await stockDe(n, caja), await stockDe(n, bolsa)], [18, 8]);
  const ficha = (await empleado.get(`/api/ventas/${venta.json.id}`)).json;
  assert.equal(ficha.consumos.length, 2);
  assert.equal(ficha.consumos[0].costo_unitario_historico, undefined);
  await empleado.post(`/api/turnos-caja/${turno.json.id}/cerrar`, { contado: 1800 });
});

test('otra empresa no ve ni usa lo de esta', async () => {
  const { mafalda, caja } = await catalogo('G');
  const otra = await registrarEmpresa(servidor, { empresa: 'Otra Mafaldería', usuario: 'otramaf' });
  assert.deepEqual((await otra.get('/api/componentes-venta')).json, []);
  assert.equal((await otra.get(`/api/productos/${mafalda}/componentes-venta`)).status, 404);
  assert.equal((await otra.put(`/api/productos/${mafalda}/componentes-venta`, { componentes: [] })).status, 404);

  const suyo = (await otra.post('/api/productos', { nombre: 'Medialuna', precio_venta: 500 })).json.id;
  assert.equal((await otra.put(`/api/productos/${suyo}/componentes-venta`, { componentes: [{ producto_id: caja, cantidad: 1 }] })).status, 400);
  await otra.post('/api/carga-inicial/stock', { filas: [{ producto_id: suyo, cantidad: 5, costo: 100 }] });
  const ajena = await otra.post('/api/ventas', {
    cliente: 'Consumidor final',
    items: [{ producto_id: suyo, cantidad: 1, precio_unitario: 500 }],
    consumos: [{ producto_id: caja, cantidad: 1 }]
  });
  assert.equal(ajena.status, 400);
  assert.equal(await stockDe(n, caja), 20);
});

// Adónde fue la plata de la venta (hist. §131): cada costo con su porcentaje
// y el promedio del negocio, para ver qué está raro. Va en un negocio aparte
// para que las ventas de los otros tests no muevan el promedio.
test('adónde fue la plata: el packaging con su porcentaje, contra el promedio del negocio', async () => {
  const otro = await registrarEmpresa(servidor, { empresa: 'Mafaldas Desglose', usuario: 'mafdesglose' });
  const { mafalda, bolsa } = await catalogo('H', {}, otro);
  // Tres ventas de lo de siempre: una mafalda de $900, caja $50 y bolsa $20.
  for (let i = 0; i < 3; i += 1) assert.equal((await vender(otro, mafalda, 1)).status, 201);
  const normal = (await otro.get(`/api/ventas/${(await vender(otro, mafalda, 1)).json.id}`)).json.desglose_costos;
  assert.equal(normal.base, 900);
  const packaging = normal.filas.find((f) => f.clave === 'consumos');
  assert.equal(packaging.importe, 70);
  assert.ok(Math.abs(packaging.promedio_pct - 70 / 900) < 1e-9);
  assert.equal(packaging.alto, false);
  const mercaderia = normal.filas.find((f) => f.clave === 'mercaderia');
  assert.equal(mercaderia.importe, 300);
  assert.equal(normal.quedo.importe, 900 - 300 - 70);
  assert.equal(normal.quedo.bajo, false);

  // Una venta con cinco bolsas más: el packaging sale más que lo normal.
  const rara = await vender(otro, mafalda, 1, { consumos: [{ producto_id: bolsa, cantidad: 6 }] });
  assert.equal(rara.status, 201, rara.texto);
  const desglose = (await otro.get(`/api/ventas/${rara.json.id}`)).json.desglose_costos;
  assert.equal(desglose.filas.find((f) => f.clave === 'consumos').alto, true);
  assert.equal(desglose.quedo.importe, 900 - 300 - 120);
});
