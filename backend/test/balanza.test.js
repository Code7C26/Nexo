// Etiquetas de balanza (hist. §132): el PLU de cada producto, el formato de la
// etiqueta del negocio y la lectura (frontend/js/core/balanza.js, puro). Va
// aparte porque cada archivo levanta su servidor.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

const balanza = await import('../../frontend/js/core/balanza.js');

let servidor;
let admin;
let empleado;
let otro;

before(async () => {
  servidor = await levantarServidor();
  admin = await registrarEmpresa(servidor, { empresa: 'Carnicería Don Pepe', usuario: 'donpepe' });
  empleado = await crearEmpleado(servidor, admin, { usuario: 'cajeropepe' });
  otro = await registrarEmpresa(servidor, { empresa: 'Otra Carnicería', usuario: 'otracarne' });
});

after(async () => {
  await servidor?.cerrar();
});

// Una etiqueta con su dígito verificador: los 12 primeros números y el último.
const etiqueta = (doce) => doce + balanza.digitoVerificador(doce);

test('la etiqueta: se lee con su formato, y el formato se deduce de una etiqueta real', () => {
  const formato = { prefijo: '20', plu_digitos: 5, valor: 'peso', decimales: 3 };
  const codigo = etiqueta('200012301250');
  assert.deepEqual(balanza.leerEtiqueta(codigo, formato), { plu: 123, valor: 1.25 });
  // Mal leída (el verificador no cierra) o de otro prefijo: no es una etiqueta.
  assert.equal(balanza.leerEtiqueta(codigo.slice(0, 12) + ((Number(codigo[12]) + 1) % 10), formato), null);
  assert.equal(balanza.leerEtiqueta(etiqueta('210012301250'), formato), null);

  // "20" + "00123" y "2" + "000123" leen igual: cuentan como uno.
  assert.deepEqual(balanza.deducirFormatos({ codigo, plu: 123, peso: 1.25 }), [formato]);
  // Con el importe en vez del peso.
  assert.deepEqual(balanza.deducirFormatos({ codigo: etiqueta('210004501250'), plu: 45, importe: 1250 }), [
    { prefijo: '21', plu_digitos: 5, valor: 'importe', decimales: 0 }
  ]);
  // Lo impreso no coincide con ningún formato.
  assert.deepEqual(balanza.deducirFormatos({ codigo, plu: 124, peso: 1.25 }), []);

  // Cuánto se vende: el peso en la unidad del producto, o el importe ÷ el precio de hoy.
  const lectura = { plu: 123, valor: 1.25 };
  assert.equal(balanza.cantidadDeEtiqueta(lectura, formato, { unidad: 'kg', precio: 9000 }), 1.25);
  assert.equal(balanza.cantidadDeEtiqueta(lectura, formato, { unidad: 'g', precio: 9 }), 1250);
  const porImporte = { ...formato, valor: 'importe', decimales: 0 };
  assert.equal(balanza.cantidadDeEtiqueta({ plu: 45, valor: 4500 }, porImporte, { unidad: 'kg', precio: 9000 }), 0.5);
  assert.equal(balanza.cantidadDeEtiqueta({ plu: 45, valor: 4500 }, porImporte, { unidad: 'kg', precio: 0 }), null);
  assert.equal(balanza.cantidadDeEtiqueta(lectura, formato, { unidad: 'unidad', precio: 100 }), null);
});

test('el PLU del producto: sin ceros adelante, único por negocio y en el catálogo del mostrador', async () => {
  const nalga = await admin.post('/api/productos', { nombre: 'Nalga', precio_venta: 9000, unidad: 'kg', plu: '00123' });
  assert.equal(nalga.status, 201, nalga.texto);
  const leido = (await admin.get('/api/productos')).json.find((p) => p.id === nalga.json.id);
  assert.equal(leido.plu, 123);

  const repetido = await admin.post('/api/productos', { nombre: 'Peceto', precio_venta: 9500, unidad: 'kg', plu: 123 });
  assert.equal(repetido.status, 400);
  assert.match(repetido.json.error, /Nalga/);
  for (const plu of ['abc', 0, 1234567, 1.5]) {
    assert.equal((await admin.post('/api/productos', { nombre: `Mal ${plu}`, precio_venta: 1, plu })).status, 400, String(plu));
  }
  // Otro negocio puede usar el mismo número.
  assert.equal((await otro.post('/api/productos', { nombre: 'Vacío', precio_venta: 8000, unidad: 'kg', plu: 123 })).status, 201);

  // Editarlo, y sacárselo.
  const peceto = (await admin.post('/api/productos', { nombre: 'Peceto', precio_venta: 9500, unidad: 'kg', plu: 124 })).json.id;
  assert.equal((await admin.patch(`/api/productos/${peceto}`, { plu: 123 })).status, 400);
  assert.equal((await admin.patch(`/api/productos/${peceto}`, { plu: 125 })).status, 200);
  const catalogo = (await empleado.get('/api/pos/catalogo')).json;
  assert.equal(catalogo.find((i) => i.producto_id === peceto).plu, 125);
  assert.equal((await admin.patch(`/api/productos/${peceto}`, { plu: null })).status, 200);
  assert.equal((await admin.get('/api/productos')).json.find((p) => p.id === peceto).plu, null);
});

test('el formato de la etiqueta: lo guarda el admin, lo leen los dos y se valida', async () => {
  assert.equal((await admin.get('/api/negocio')).json.balanza, null);
  const formato = { prefijo: '20', plu_digitos: 5, valor: 'peso', decimales: 3 };
  const guardado = await admin.put('/api/negocio/balanza', { formato: { ...formato, otra_cosa: 'x' } });
  assert.equal(guardado.status, 200, guardado.texto);
  assert.deepEqual(guardado.json.balanza, formato);
  assert.deepEqual((await empleado.get('/api/negocio')).json.balanza, formato);
  assert.equal((await otro.get('/api/negocio')).json.balanza, null);

  const malos = [
    { ...formato, prefijo: '30' },
    { ...formato, plu_digitos: 8 },
    { ...formato, valor: 'precio' },
    { ...formato, decimales: 1 },
    { ...formato, prefijo: '2', plu_digitos: 3 },
    'peso'
  ];
  for (const malo of malos) {
    assert.equal((await admin.put('/api/negocio/balanza', { formato: malo })).status, 400, JSON.stringify(malo));
  }
  assert.equal((await empleado.put('/api/negocio/balanza', { formato })).status, 403);
  assert.deepEqual((await admin.get('/api/negocio')).json.balanza, formato);

  // Dejar de usarla.
  assert.equal((await admin.put('/api/negocio/balanza', { formato: null })).json.balanza, null);
  assert.equal((await admin.get('/api/negocio')).json.balanza, null);
});
