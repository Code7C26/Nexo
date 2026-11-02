// Avisar un problema (handoff.md, "Orden", punto 2): el aviso cae en el CRM de
// NEXO_NEGOCIO_VENTAS, una consulta abierta por persona con una tarea por
// aviso, y no toca el negocio de quien avisa. Con su propio servidor, para
// tener la variable definida.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearCliente, crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

let servidor;
let ventas;
let tienda;

before(async () => {
  servidor = await levantarServidor({ env: { NEXO_NEGOCIO_VENTAS: '1' } });
  ventas = await registrarEmpresa(servidor, { empresa: 'Nexo', usuario: 'nexo-ventas' });
  tienda = await registrarEmpresa(servidor, { empresa: 'Tienda Rosa', usuario: 'rosa', nombre: 'Rosa' });
});

after(async () => {
  await servidor?.cerrar();
});

const lista = (r) => (Array.isArray(r.json) ? r.json : r.json.oportunidades ?? []);

test('un aviso crea una consulta con una tarea en el negocio de ventas, y el siguiente suma otra tarea', async () => {
  const aviso = {
    mensaje: 'Quise cobrar una venta y el botón no hacía nada.',
    pantalla: 'Ventas (#/ventas)',
    navegador: 'Chrome 130 en Android, pantalla de 390×844',
    errores: ['Aviso: No se pudo guardar el cobro.']
  };
  assert.equal((await tienda.post('/api/problema', aviso)).status, 201);
  assert.equal((await tienda.post('/api/problema', { mensaje: 'Otra cosa: no encuentro los gastos.' })).status, 201);

  const consultas = lista(await ventas.get('/api/crm/oportunidades'));
  assert.equal(consultas.length, 1, 'una sola consulta por persona');
  const [consulta] = consultas;
  assert.equal(consulta.nombre, 'Rosa');
  assert.equal(consulta.email, 'rosa@nexo.test');
  assert.equal(consulta.interes, 'Avisos de problemas en Nexo ("Tienda Rosa")');

  const { actividades } = (await ventas.get(`/api/crm/oportunidades/${consulta.id}`)).json;
  assert.equal(actividades.length, 2);
  assert.ok(actividades.every((a) => a.tipo === 'tarea'));
  const primera = actividades.find((a) => a.descripcion.includes('botón'));
  assert.match(primera.descripcion, /^Problema: "Quise cobrar/);
  assert.match(primera.descripcion, /Pantalla: Ventas \(#\/ventas\)/);
  assert.match(primera.descripcion, /Negocio: Tienda Rosa/);
  assert.match(primera.descripcion, /Navegador: Chrome 130/);
  assert.match(primera.descripcion, /Errores: Aviso: No se pudo guardar el cobro\./);

  // El negocio de quien avisa no recibe nada.
  assert.equal(lista(await tienda.get('/api/crm/oportunidades')).length, 0);
});

test('el empleado también puede avisar, y queda como otra persona', async () => {
  const empleado = await crearEmpleado(servidor, tienda, { usuario: 'cajero', nombre: 'Cajero' });
  assert.equal((await empleado.post('/api/problema', { mensaje: 'No me deja abrir la caja.' })).status, 201);
  const nombres = lista(await ventas.get('/api/crm/oportunidades')).map((o) => o.nombre).sort();
  assert.deepEqual(nombres, ['Cajero', 'Rosa']);
});

test('sin texto, con datos raros o sin sesión, no se guarda nada', async () => {
  assert.equal((await tienda.post('/api/problema', { mensaje: '   ' })).status, 400);
  assert.equal((await tienda.post('/api/problema', { mensaje: 'x'.repeat(801) })).status, 400);
  assert.equal((await tienda.post('/api/problema', { mensaje: 'Hola', pantalla: { no: 'texto' } })).status, 400);
  assert.equal((await crearCliente(servidor.url).post('/api/problema', { mensaje: 'Hola' })).status, 401);
});

test('lo técnico se recorta y no pasa del largo de una actividad', async () => {
  const otra = await registrarEmpresa(servidor, { empresa: 'Kiosco', usuario: 'kiosco', nombre: 'Kiosco' });
  const r = await otra.post('/api/problema', {
    mensaje: 'y'.repeat(800),
    pantalla: 'p'.repeat(500),
    navegador: 'n'.repeat(500),
    errores: Array.from({ length: 20 }, (_, i) => `error ${i} ${'e'.repeat(400)}`)
  });
  assert.equal(r.status, 201);
  const consulta = lista(await ventas.get('/api/crm/oportunidades')).find((o) => o.nombre === 'Kiosco');
  const [actividad] = (await ventas.get(`/api/crm/oportunidades/${consulta.id}`)).json.actividades;
  assert.ok(actividad.descripcion.length <= 1000, `largo ${actividad.descripcion.length}`);
  assert.doesNotMatch(actividad.descripcion, /error 0 /, 'solo van los últimos errores');
});

test('sin NEXO_NEGOCIO_VENTAS los avisos responden 503', async () => {
  const sinVentas = await levantarServidor();
  try {
    const cliente = await registrarEmpresa(sinVentas, { empresa: 'Solo', usuario: 'solo' });
    assert.equal((await cliente.post('/api/problema', { mensaje: 'Hola' })).status, 503);
  } finally {
    await sinVentas.cerrar();
  }
});
