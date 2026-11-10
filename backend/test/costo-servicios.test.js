// El costo de los servicios (hist. §143): la mano de obra de cada servicio
// (un fijo, o por hora) y sus materiales, que se corrigen al terminar el
// trabajo. Los dos entran al costo congelado de la venta, y "adónde fue la
// plata" separa la mano de obra de los materiales. Va aparte porque cada
// archivo levanta su servidor, y el alta de empresas tiene un tope de
// intentos por IP.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

let servidor;
let n;

before(async () => {
  servidor = await levantarServidor();
  n = await registrarEmpresa(servidor, { empresa: 'Clima Test', usuario: 'climatest' });
});

after(async () => {
  await servidor?.cerrar();
});

const productoDe = async (id) => (await n.get('/api/productos')).json.find((p) => p.id === id);

test('la mano de obra se guarda, se valida y mide el margen del servicio', async () => {
  const carga = await n.post('/api/productos', {
    nombre: 'Carga de gas',
    precio_venta: 40000,
    tipo: 'servicio',
    mano_obra: 12000,
    mano_obra_por: 'servicio'
  });
  assert.equal(carga.status, 201, carga.texto);
  const leido = await productoDe(carga.json.id);
  assert.deepEqual([leido.mano_obra, leido.mano_obra_por, leido.costo_mano_obra], [12000, 'servicio', 12000]);
  assert.equal(Math.round(leido.margen), 70);

  // Por hora: la tarifa por lo que dura, o por cada hora si se vende por hora.
  const instalacion = await n.post('/api/productos', {
    nombre: 'Instalación split',
    precio_venta: 90000,
    tipo: 'servicio',
    duracion_minutos: 180,
    mano_obra: 8000,
    mano_obra_por: 'hora'
  });
  assert.equal(instalacion.status, 201, instalacion.texto);
  assert.equal((await productoDe(instalacion.json.id)).costo_mano_obra, 24000);
  const porHora = await n.post('/api/productos', {
    nombre: 'Hora técnica',
    precio_venta: 15000,
    tipo: 'servicio',
    unidad: 'hora',
    mano_obra: 7000,
    mano_obra_por: 'hora'
  });
  assert.equal((await productoDe(porHora.json.id)).costo_mano_obra, 7000);

  const mal = [
    { mano_obra: -1 },
    { mano_obra: 'mucho' },
    { mano_obra: 100, mano_obra_por: 'dia' },
    { mano_obra: 100, mano_obra_por: 'hora', duracion_minutos: null }
  ];
  for (const cambios of mal) {
    const r = await n.patch(`/api/productos/${carga.json.id}`, cambios);
    assert.equal(r.status, 400, JSON.stringify(cambios));
  }
  // Un producto nunca tiene mano de obra: se ignora.
  const filtro = await n.post('/api/productos', { nombre: 'Filtro', precio_venta: 100, mano_obra: 50 });
  assert.equal((await productoDe(filtro.json.id)).mano_obra, null);
  // Vaciarla la saca.
  assert.equal((await n.patch(`/api/productos/${porHora.json.id}`, { mano_obra: null })).status, 200);
  assert.equal((await productoDe(porHora.json.id)).costo_mano_obra, 0);
});

test('al terminar el trabajo, la mano de obra y los materiales que se usaron entran al costo de la venta', async () => {
  const gas = (await n.post('/api/productos', { nombre: 'Gas R410A (kg)', unidad: 'kg', precio_venta: 0 })).json.id;
  const cano = (await n.post('/api/productos', { nombre: 'Caño de cobre (m)', unidad: 'm', precio_venta: 0 })).json.id;
  const stock = await n.post('/api/carga-inicial/stock', {
    filas: [
      { producto_id: gas, cantidad: 10, costo: 9000 },
      { producto_id: cano, cantidad: 30, costo: 2500 }
    ]
  });
  assert.equal(stock.status, 200, stock.texto);
  const service = (
    await n.post('/api/productos', { nombre: 'Service completo', precio_venta: 60000, tipo: 'servicio', mano_obra: 15000 })
  ).json.id;
  const materiales = await n.put(`/api/productos/${service}/componentes-venta`, { componentes: [{ producto_id: gas, cantidad: 1 }] });
  assert.equal(materiales.status, 200, materiales.texto);
  // El margen del servicio ya cuenta el gas con el costo de hoy.
  const conMateriales = await productoDe(service);
  assert.equal(conMateriales.costo_materiales, 9000);
  assert.equal(Math.round(conMateriales.margen), Math.round(((60000 - 24000) / 60000) * 100));

  const trabajo = await n.post('/api/trabajos', {
    cliente: 'Marta',
    titulo: 'Service en lo de Marta',
    items: [{ producto_id: service, cantidad: 1, precio_unitario: 60000 }]
  });
  assert.equal(trabajo.status, 201, trabajo.texto);
  // Se usó 1,5 kg de gas y 2 m de caño, no lo de siempre.
  const terminado = await n.post(`/api/trabajos/${trabajo.json.id}/terminar`, {
    consumos: [
      { producto_id: gas, cantidad: 1.5 },
      { producto_id: cano, cantidad: 2 }
    ]
  });
  assert.equal(terminado.status, 201, terminado.texto);
  assert.equal((await productoDe(gas)).stock, 8.5);
  assert.equal((await productoDe(cano)).stock, 28);

  const venta = (await n.get(`/api/ventas/${terminado.json.venta_id}`)).json;
  // 15.000 de mano de obra + 1,5 × 9.000 de gas + 2 × 2.500 de caño.
  assert.equal(venta.costo_total, 15000 + 13500 + 5000);
  const filas = Object.fromEntries(venta.desglose_costos.filas.map((f) => [f.clave, [f.nombre, f.importe]]));
  assert.deepEqual(filas.mano_obra, ['Mano de obra', 15000]);
  assert.deepEqual(filas.consumos, ['Materiales', 18500]);
  assert.equal(filas.mercaderia, undefined);
  assert.equal(venta.desglose_costos.quedo.importe, 60000 - 33500);

  // Cambiar la mano de obra después no toca lo vendido: quedó congelada.
  await n.patch(`/api/productos/${service}`, { mano_obra: 30000 });
  assert.equal((await n.get(`/api/ventas/${terminado.json.venta_id}`)).json.costo_total, 33500);

  // Sin decir nada, va lo de siempre.
  const otro = await n.post('/api/trabajos', {
    cliente: 'Marta',
    titulo: 'Otro service',
    items: [{ producto_id: service, cantidad: 1, precio_unitario: 60000 }]
  });
  const otroTerminado = await n.post(`/api/trabajos/${otro.json.id}/terminar`);
  assert.equal(otroTerminado.status, 201, otroTerminado.texto);
  assert.equal((await productoDe(gas)).stock, 7.5);
});

test('el empleado no ve la mano de obra ni el costo de los materiales', async () => {
  const empleado = await crearEmpleado(servidor, n, { usuario: 'tecnico' });
  const servicio = (await n.post('/api/productos', { nombre: 'Visita técnica', precio_venta: 20000, tipo: 'servicio', mano_obra: 5000 }))
    .json.id;
  const visto = (await empleado.get('/api/productos')).json.find((p) => p.id === servicio);
  for (const clave of ['mano_obra', 'costo_mano_obra', 'costo_materiales', 'margen']) assert.equal(clave in visto, false, clave);
  const venta = await empleado.post('/api/ventas', {
    cliente: 'Consumidor final',
    items: [{ producto_id: servicio, cantidad: 1, precio_unitario: 20000 }]
  });
  assert.equal(venta.status, 201, venta.texto);
  const ficha = (await empleado.get(`/api/ventas/${venta.json.id}`)).json;
  assert.equal('desglose_costos' in ficha, false);
  assert.ok(ficha.items.every((i) => !('costo_mano_obra' in i)));
  // El admin sí la ve, en su renglón.
  const delAdmin = (await n.get(`/api/ventas/${venta.json.id}`)).json;
  assert.deepEqual(
    delAdmin.desglose_costos.filas.map((f) => f.clave),
    ['mano_obra']
  );
});
