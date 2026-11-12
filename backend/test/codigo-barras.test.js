// Código de barras del producto y de la variante, aparte del SKU (CLAUDE.md
// §4; docs/investigaciones/investigacion-praxia.md §4): se guarda sin espacios, es único por
// empresa entre productos y variantes, queda en la auditoría y llega al
// catálogo del punto de venta, que lo busca antes que el SKU. Va aparte
// porque cada archivo levanta su servidor, y el alta de empresas tiene un
// tope de intentos por IP.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

let servidor;
let a;
let b;

before(async () => {
  servidor = await levantarServidor();
  a = await registrarEmpresa(servidor, { empresa: 'Almacén Rosa', usuario: 'almacenrosa' });
  b = await registrarEmpresa(servidor, { empresa: 'Kiosco Beto', usuario: 'kioscobeto' });
});

after(async () => {
  await servidor?.cerrar();
});

const productoDe = async (cliente, id) => (await cliente.get('/api/productos')).json.find((p) => p.id === id);

// Una remera con dos talles, para los tests de variantes.
async function remeraConTalles(cliente, nombre) {
  const remera = (await cliente.post('/api/productos', { nombre, precio_venta: 15000 })).json.id;
  const talle = (await cliente.post(`/api/productos/${remera}/atributos`, { nombre: 'Talle' })).json.id;
  const variantes = [];
  for (const valor of ['S', 'M']) {
    const v = (await cliente.post(`/api/productos/${remera}/atributos/${talle}/valores`, { valor })).json.id;
    variantes.push({ talle, valor: v });
  }
  return { remera, variantes };
}

test('el producto guarda su código sin espacios, y vacío es sin código', async () => {
  const alta = await a.post('/api/productos', { nombre: 'Yerba 1 kg', sku: 'YER-1', codigo_barras: ' 7 790387 000154 ', precio_venta: 4000 });
  assert.equal(alta.status, 201, alta.texto);
  assert.equal((await productoDe(a, alta.json.id)).codigo_barras, '7790387000154');

  const sinCodigo = await a.patch(`/api/productos/${alta.json.id}`, { codigo_barras: '   ' });
  assert.equal(sinCodigo.status, 200, sinCodigo.texto);
  assert.equal((await productoDe(a, alta.json.id)).codigo_barras, null);

  const vuelve = await a.patch(`/api/productos/${alta.json.id}`, { codigo_barras: '7790387000154' });
  assert.equal(vuelve.status, 200, vuelve.texto);
  // La edición que no lo toca lo deja como estaba.
  await a.patch(`/api/productos/${alta.json.id}`, { precio_venta: 4200 });
  assert.equal((await productoDe(a, alta.json.id)).codigo_barras, '7790387000154');
});

test('un código raro o demasiado largo no se acepta', async () => {
  for (const codigo of ['779ñ', 'x'.repeat(49), 1234]) {
    const alta = await a.post('/api/productos', { nombre: `Raro ${String(codigo).slice(0, 5)}`, codigo_barras: codigo, precio_venta: 1 });
    assert.equal(alta.status, 400, `${codigo}: ${alta.texto}`);
    assert.match(alta.json.error, /código de barras/);
  }
});

test('el código es de una sola cosa en la empresa: ni dos productos, ni un producto y una variante', async () => {
  const fideos = (await a.post('/api/productos', { nombre: 'Fideos', codigo_barras: '7790070318', precio_venta: 1500 })).json.id;
  const repetido = await a.post('/api/productos', { nombre: 'Fideos otros', codigo_barras: '7790070318', precio_venta: 1500 });
  assert.equal(repetido.status, 400);
  assert.match(repetido.json.error, /ya es de "Fideos"/);

  const arroz = (await a.post('/api/productos', { nombre: 'Arroz', precio_venta: 1800 })).json.id;
  const editado = await a.patch(`/api/productos/${arroz}`, { codigo_barras: '7790070318' });
  assert.equal(editado.status, 400);
  // Volver a guardar el propio no choca consigo mismo.
  assert.equal((await a.patch(`/api/productos/${fideos}`, { codigo_barras: '7790070318', precio_venta: 1600 })).status, 200);

  const { remera, variantes } = await remeraConTalles(a, 'Remera lisa');
  const [s, m] = variantes;
  const conCodigoAjeno = await a.post(`/api/productos/${remera}/variantes`, {
    valores: [{ atributo_id: s.talle, valor_id: s.valor }],
    codigo_barras: '7790070318'
  });
  assert.equal(conCodigoAjeno.status, 400);
  assert.match(conCodigoAjeno.json.error, /ya es de "Fideos"/);

  const varianteS = await a.post(`/api/productos/${remera}/variantes`, {
    valores: [{ atributo_id: s.talle, valor_id: s.valor }],
    codigo_barras: 'REM0001S'
  });
  assert.equal(varianteS.status, 201, varianteS.texto);
  const varianteM = (
    await a.post(`/api/productos/${remera}/variantes`, { valores: [{ atributo_id: m.talle, valor_id: m.valor }] })
  ).json.id;
  const chocaConS = await a.patch(`/api/productos/${remera}/variantes/${varianteM}`, { codigo_barras: 'REM0001S' });
  assert.equal(chocaConS.status, 400);
  assert.match(chocaConS.json.error, /Remera lisa — Talle: S/);
  // Un producto tampoco puede tomar el de una variante.
  const productoConCodigoDeVariante = await a.patch(`/api/productos/${arroz}`, { codigo_barras: 'REM0001S' });
  assert.equal(productoConCodigoDeVariante.status, 400);

  // La variante editada guarda el suyo, y la que no lo toca lo conserva.
  assert.equal((await a.patch(`/api/productos/${remera}/variantes/${varianteM}`, { codigo_barras: 'REM 0001 M' })).status, 200);
  await a.patch(`/api/productos/${remera}/variantes/${varianteS.json.id}`, { precio_venta: 16000 });
  const leidas = (await a.get(`/api/productos/${remera}/variantes`)).json;
  assert.deepEqual(
    leidas.map((v) => v.codigo_barras),
    ['REM0001S', 'REM0001M']
  );

  // Otra empresa usa el mismo código sin problema (CLAUDE.md §28).
  const enOtra = await b.post('/api/productos', { nombre: 'Fideos', codigo_barras: '7790070318', precio_venta: 1500 });
  assert.equal(enOtra.status, 201, enOtra.texto);
});

test('el cambio de código queda en la auditoría', async () => {
  const galletitas = (await a.post('/api/productos', { nombre: 'Galletitas', precio_venta: 900 })).json.id;
  await a.patch(`/api/productos/${galletitas}`, { codigo_barras: '7790040929' });
  const auditoria = (await a.get('/api/auditoria')).json;
  const filas = Array.isArray(auditoria) ? auditoria : (auditoria.filas ?? auditoria.items ?? []);
  const edicion = filas.find((f) => f.entidad === 'producto' && f.entidad_id === galletitas && f.accion === 'editar');
  assert.ok(edicion, 'falta la edición en la auditoría');
  assert.match(JSON.stringify(edicion.valor_nuevo), /7790040929/);
});

test('el catálogo del punto de venta trae el código del producto y el de cada variante', async () => {
  const leche = (await b.post('/api/productos', { nombre: 'Leche', sku: 'LEC', codigo_barras: '7790742000', precio_venta: 1200 })).json.id;
  const { remera, variantes } = await remeraConTalles(b, 'Remera Beto');
  const [s] = variantes;
  await b.post(`/api/productos/${remera}/variantes`, { valores: [{ atributo_id: s.talle, valor_id: s.valor }], codigo_barras: 'RB-S' });
  const catalogo = (await b.get('/api/pos/catalogo')).json;
  assert.equal(catalogo.find((i) => i.producto_id === leche).codigo_barras, '7790742000');
  assert.equal(catalogo.find((i) => i.producto_id === remera).codigo_barras, 'RB-S');
});
