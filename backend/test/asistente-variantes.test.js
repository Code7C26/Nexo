// Variantes en el asistente (hist. §168): "vendí un buzo talle L" tiene que
// encontrar la variante, y si falta o es dudosa, ofrecer las opciones en vez de
// frenar con un "tiene variantes" sin salida. Con NEXO_INTERPRETE=stub el renglón
// va como "item=producto,cantidad,precio,variante".
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

let servidor;
let admin;
let buzo;
let varianteGorra;

const interpretar = (texto) => admin.post('/api/asistente/interpretar', { texto });
const ejecutar = (mensajeId, tipo, propuesta) => admin.post('/api/asistente/ejecutar', { mensaje_id: mensajeId, tipo, propuesta });
const variantesDe = async (productoId) => (await admin.get(`/api/productos/${productoId}/variantes`)).json;
const stockDe = async (productoId, combinacion) => (await variantesDe(productoId)).find((v) => v.combinacion === combinacion).stock;

before(async () => {
  servidor = await levantarServidor();
  admin = await registrarEmpresa(servidor, { empresa: 'Ropa Variantes', usuario: 'variantes' });

  buzo = (await admin.post('/api/productos', { nombre: 'Buzo canguro', precio_venta: 30000 })).json.id;
  const talle = (await admin.post(`/api/productos/${buzo}/atributos`, { nombre: 'Talle' })).json.id;
  const color = (await admin.post(`/api/productos/${buzo}/atributos`, { nombre: 'Color' })).json.id;
  const valor = async (atributo, v) => (await admin.post(`/api/productos/${buzo}/atributos/${atributo}/valores`, { valor: v })).json.id;
  const [s, m, l] = [await valor(talle, 'S'), await valor(talle, 'M'), await valor(talle, 'L')];
  const [negro, gris] = [await valor(color, 'negro'), await valor(color, 'gris')];
  for (const [t, c] of [[s, negro], [m, negro], [l, negro], [l, gris]]) {
    const r = await admin.post(`/api/productos/${buzo}/variantes`, {
      valores: [{ atributo_id: talle, valor_id: t }, { atributo_id: color, valor_id: c }]
    });
    assert.equal(r.status, 201, r.texto);
  }

  // Otro producto con variantes: su variante no puede colarse en una venta de buzos.
  const gorra = (await admin.post('/api/productos', { nombre: 'Gorra', precio_venta: 9000 })).json.id;
  const talleGorra = (await admin.post(`/api/productos/${gorra}/atributos`, { nombre: 'Talle' })).json.id;
  const unico = (await admin.post(`/api/productos/${gorra}/atributos/${talleGorra}/valores`, { valor: 'Unico' })).json.id;
  varianteGorra = (await admin.post(`/api/productos/${gorra}/variantes`, { valores: [{ atributo_id: talleGorra, valor_id: unico }] })).json.id;
});

after(async () => {
  await servidor?.cerrar();
});

test('una compra con la variante dicha la encuentra, entra su stock y no mezcla las demás', async () => {
  const r = await interpretar('compra: proveedor=Textil Norte; item=Buzo canguro,10,12000,talle L negro');
  assert.equal(r.status, 200, r.texto);
  assert.deepEqual(r.json.problemas, []);
  const [item] = r.json.propuesta.items;
  assert.equal(item.variante.estado, 'resuelto');
  assert.equal(item.variante.nombre_resuelto, 'Talle: L / Color: negro');

  const hecha = await ejecutar(r.json.mensaje_id, 'compra', r.json.propuesta);
  assert.equal(hecha.status, 201, hecha.texto);
  assert.equal(await stockDe(buzo, 'Talle: L / Color: negro'), 10);
  assert.equal(await stockDe(buzo, 'Talle: L / Color: gris'), 0);

  for (const dicho of ['M negro', 'L gris']) {
    const otra = await interpretar(`compra: proveedor=Textil Norte; item=Buzo canguro,5,12000,${dicho}`);
    assert.equal((await ejecutar(otra.json.mensaje_id, 'compra', otra.json.propuesta)).status, 201);
  }
});

test('una venta con el talle dicho se resuelve y descuenta el stock de esa variante', async () => {
  const r = await interpretar('venta: cliente=Camila; item=Buzo canguro,2,28000,M negro');
  assert.equal(r.status, 200, r.texto);
  assert.deepEqual(r.json.problemas, []);
  assert.equal(r.json.ejecutable, true);
  const [item] = r.json.propuesta.items;
  assert.equal(item.variante.estado, 'resuelto');
  assert.equal(item.variante.nombre_resuelto, 'Talle: M / Color: negro');

  const hecha = await ejecutar(r.json.mensaje_id, 'venta', r.json.propuesta);
  assert.equal(hecha.status, 201, hecha.texto);
  assert.equal(await stockDe(buzo, 'Talle: M / Color: negro'), 3);
  const venta = (await admin.get(`/api/ventas/${hecha.json.id}`)).json;
  assert.equal(venta.total, 56000);
});

test('si el talle coincide con más de una variante, las ofrece y la venta no se puede confirmar', async () => {
  const r = await interpretar('venta: cliente=Camila; item=Buzo canguro,1,30000,L');
  const [{ variante }] = r.json.propuesta.items;
  assert.equal(variante.estado, 'ambiguo');
  assert.deepEqual(variante.candidatos.map((c) => c.nombre), ['Talle: L / Color: negro', 'Talle: L / Color: gris']);
  assert.equal(r.json.ejecutable, false);
  assert.match(r.json.problemas[0], /más de una variante de "Buzo canguro".*L/);
});

test('sin variante dicha ofrece todas, y lo que no existe también', async () => {
  const sin = await interpretar('venta: cliente=Camila; item=Buzo canguro,1,30000');
  const [{ variante }] = sin.json.propuesta.items;
  assert.equal(variante.estado, 'no_dado');
  assert.equal(variante.candidatos.length, 4);
  assert.match(sin.json.problemas[0], /Falta elegir la variante de "Buzo canguro"/);

  const noExiste = await interpretar('venta: cliente=Camila; item=Buzo canguro,1,30000,XXL');
  assert.equal(noExiste.json.propuesta.items[0].variante.estado, 'no_encontrado');
  assert.match(noExiste.json.problemas[0], /no tiene la variante "XXL"/);

  // La "S" encuentra solo la S, no la "M" ni las "L".
  const soloS = await interpretar('venta: cliente=Camila; item=Buzo canguro,1,30000,S');
  assert.equal(soloS.json.propuesta.items[0].variante.nombre_resuelto, 'Talle: S / Color: negro');
});

test('el talle pegado al nombre ("Buzo canguro gris L") también se encuentra', async () => {
  const r = await interpretar('venta: cliente=Camila; item=Buzo canguro gris L,1,30000');
  const [item] = r.json.propuesta.items;
  assert.equal(item.producto.nombre_resuelto, 'Buzo canguro');
  assert.equal(item.variante.nombre_resuelto, 'Talle: L / Color: gris');
  assert.equal(r.json.ejecutable, true, r.json.problemas.join(' · '));
});

test('sin precio en la frase toma el de lista, y marca que lo sugirió Nexo', async () => {
  const r = await interpretar('venta: cliente=Camila; item=Buzo canguro,1,,L negro');
  const [item] = r.json.propuesta.items;
  assert.equal(item.precio_sugerido, true);
  assert.ok(Number(item.precio_unitario) >= 0);
});

test('confirmar sin elegir variante, o con la de otro producto, se rechaza', async () => {
  const r = await interpretar('venta: cliente=Camila; item=Buzo canguro,1,30000,L');
  const sinElegir = await ejecutar(r.json.mensaje_id, 'venta', r.json.propuesta);
  assert.equal(sinElegir.status, 400);
  assert.match(sinElegir.json.error, /tiene variantes/);

  const ajena = structuredClone(r.json.propuesta);
  ajena.items[0].variante = { id: varianteGorra };
  const conAjena = await ejecutar(r.json.mensaje_id, 'venta', ajena);
  assert.equal(conAjena.status, 400);
  assert.match(conAjena.json.error, /no existe o no le pertenece/);

  // Elegida a mano entre las que ofreció, anda.
  const elegida = structuredClone(r.json.propuesta);
  elegida.items[0].variante = { id: r.json.propuesta.items[0].variante.candidatos[0].id };
  const bien = await ejecutar(r.json.mensaje_id, 'venta', elegida);
  assert.equal(bien.status, 201, bien.texto);
  assert.equal(await stockDe(buzo, 'Talle: L / Color: negro'), 9);
});

test('un producto sin variantes sigue igual: la variante dicha de más se ignora', async () => {
  const sinVariantes = (await admin.post('/api/productos', { nombre: 'Medias', precio_venta: 3000 })).json.id;
  await admin.post('/api/stock/ajuste', { producto_id: sinVariantes, cantidad: 10 });
  const r = await interpretar('venta: cliente=Camila; item=Medias,2,3000,rojas');
  assert.equal(r.json.propuesta.items[0].variante, null);
  assert.equal(r.json.ejecutable, true, r.json.problemas.join(' · '));
  assert.equal((await ejecutar(r.json.mensaje_id, 'venta', r.json.propuesta)).status, 201);
});
