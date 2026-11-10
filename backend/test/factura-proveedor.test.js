// La compra desde la foto de la factura del proveedor (hist. §151). Con
// NEXO_INTERPRETE=stub, la "imagen" es el JSON de la lectura en base64: se
// prueba todo lo que hace Nexo con lo leído (buscar los productos, pasar los
// packs a unidades, sumar el IVA, recordar lo confirmado) sin gastar la IA.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearCliente, crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';
import { buscarEnCatalogo, enUnidades, nombreSugerido, normalizarLectura, quitarBulto, similitud, totalDelRenglon } from '../factura-proveedor.js';

let servidor;
let tienda;

const CUIT_SUR = '30-71234567-8';

before(async () => {
  servidor = await levantarServidor();
  tienda = await registrarEmpresa(servidor, { empresa: 'Almacén Factura', usuario: 'factura' });
  for (const producto of [
    { nombre: 'Coca-Cola 2,25 L', precio_venta: 3500 },
    { nombre: 'Coca-Cola 1,5 L', precio_venta: 2500 },
    { nombre: 'Yerba Playadito 1 kg', codigo_barras: '7790387000154', precio_venta: 6000 }
  ]) {
    const r = await tienda.post('/api/productos', producto);
    assert.equal(r.status, 201, r.texto);
  }
});

after(async () => {
  await servidor?.cerrar();
});

const imagen = (lectura) => ({ tipo: 'image/jpeg', datos: Buffer.from(JSON.stringify(lectura)).toString('base64') });
const leer = (cliente, ...lecturas) => cliente.post('/api/compras/leer-comprobante', { imagenes: lecturas.map(imagen) });

const FACTURA_A = {
  es_comprobante: true,
  proveedor: { nombre: 'Distribuidora Sur SA', cuit: CUIT_SUR },
  letra: 'A',
  numero: '0003-00012345',
  fecha: '2026-11-09',
  precios_sin_iva: true,
  renglones: [
    // 3 packs de 8 a $8.000 el pack, con 10 % de bonificación, + 21 % de IVA.
    { codigo: 'CC225', descripcion: 'COCA COLA 2.25LT X8 PET', cantidad: 3, unidades_por_bulto: 8, precio_unitario: 8000, bonificacion: 10, alicuota_iva: 21 },
    { codigo: '7790387000154', descripcion: 'YERBA PLAYADITO 1KG', cantidad: 10, precio_unitario: 5000, alicuota_iva: 21 },
    { codigo: null, descripcion: 'AGUA VILLAVICENCIO 2L X6', cantidad: 2, unidades_por_bulto: 6, precio_unitario: '6.000,00', alicuota_iva: 21 },
    { descripcion: 'FLETE', cantidad: 1, precio_unitario: 1000, es_envio: true }
  ],
  percepciones: 500,
  // 26.136 + 60.500 + 14.520 + 1.210 + 500 de percepciones.
  total: 102866
};

test('lee la factura: busca cada producto, pasa los packs a unidades y suma el IVA', async () => {
  const r = await leer(tienda, FACTURA_A);
  assert.equal(r.status, 200, r.texto);
  const f = r.json;
  assert.deepEqual(f.proveedor, { id: null, nombre: 'Distribuidora Sur SA', cuit: '30712345678', nuevo: true });
  assert.equal(f.letra, 'A');
  assert.equal(f.numero, '0003-00012345');
  assert.equal(f.fecha, '2026-11-09');
  assert.equal(f.costo_envio, 1210);
  assert.equal(f.diferencia, null);
  assert.equal(f.items.length, 3);

  const [coca, yerba, agua] = f.items;
  assert.equal(coca.coincidencia, 'parecido');
  assert.equal(coca.producto.nombre, 'Coca-Cola 2,25 L');
  assert.equal(coca.cantidad, 24);
  assert.equal(coca.unidades_por_bulto, 8);
  assert.equal(coca.total, 26136);
  assert.equal(coca.precio_unitario, 1089);

  assert.equal(yerba.coincidencia, 'codigo');
  assert.equal(yerba.producto.nombre, 'Yerba Playadito 1 kg');
  assert.equal(yerba.cantidad, 10);
  assert.equal(yerba.precio_unitario, 6050);

  assert.equal(agua.coincidencia, 'nuevo');
  assert.equal(agua.producto, null);
  assert.equal(agua.nombre_nuevo, 'Agua Villavicencio 2l');
  assert.equal(agua.cantidad, 12);
  assert.equal(agua.precio_unitario, 1210);
});

test('guardar la compra recuerda cada renglón para ese proveedor, y la próxima factura sale sola', async () => {
  const { json: f } = await leer(tienda, FACTURA_A);
  // La persona corrige: el agua viene de a 4, no de a 6.
  const items = f.items.map((i) => {
    const unidades = i.clave.includes('villavicencio') ? 4 : i.unidades_por_bulto;
    return {
      producto: i.producto?.nombre ?? i.nombre_nuevo,
      variante_id: i.producto?.variante_id ?? null,
      cantidad: i.cantidad_factura * unidades,
      precio_unitario: Math.round((i.total / (i.cantidad_factura * unidades)) * 100) / 100,
      factura: { clave: i.clave, descripcion: i.descripcion, unidades_por_bulto: unidades }
    };
  });
  const compra = await tienda.post('/api/compras', {
    proveedor: f.proveedor.nombre,
    proveedor_documento: f.proveedor.cuit,
    fecha: f.fecha,
    costo_envio: f.costo_envio,
    comprobante_numero: f.numero,
    items
  });
  assert.equal(compra.status, 201, compra.texto);

  const ficha = (await tienda.get(`/api/compras/${compra.json.id}`)).json;
  assert.deepEqual(
    ficha.items.map((i) => [i.producto, i.cantidad]),
    [['Coca-Cola 2,25 L', 24], ['Yerba Playadito 1 kg', 10], ['Agua Villavicencio 2l', 8]]
  );

  // Otra factura del mismo proveedor, con otro nombre: lo encuentra por CUIT.
  const otra = await leer(tienda, { ...FACTURA_A, proveedor: { nombre: 'DISTRIB. SUR', cuit: CUIT_SUR }, total: null });
  assert.equal(otra.status, 200, otra.texto);
  assert.equal(otra.json.proveedor.nuevo, false);
  assert.equal(otra.json.proveedor.nombre, 'Distribuidora Sur SA');
  assert.deepEqual(
    otra.json.items.map((i) => [i.coincidencia, i.producto?.nombre, i.unidades_por_bulto, i.cantidad]),
    [
      ['recordado', 'Coca-Cola 2,25 L', 8, 24],
      ['recordado', 'Yerba Playadito 1 kg', 1, 10],
      ['recordado', 'Agua Villavicencio 2l', 4, 8]
    ]
  );
});

test('si lo cargado no da el total de la factura, avisa la diferencia', async () => {
  const r = await leer(tienda, { ...FACTURA_A, total: 90000 });
  assert.equal(r.status, 200, r.texto);
  // 102.366 cargados contra 90.000 − 500 de percepciones.
  assert.equal(r.json.diferencia, 12866);
});

test('lo que no es una factura, o llega mal, no se lee', async () => {
  assert.equal((await leer(tienda, { es_comprobante: false, renglones: [] })).status, 422);
  assert.equal((await leer(tienda, { renglones: [{ descripcion: 'Total', cantidad: 0, precio_unitario: 10 }] })).status, 422);
  assert.equal((await tienda.post('/api/compras/leer-comprobante', {})).status, 400);
  assert.equal((await tienda.post('/api/compras/leer-comprobante', { imagenes: [{ tipo: 'text/html', datos: 'aG9sYQ==' }] })).status, 400);
  assert.equal((await tienda.post('/api/compras/leer-comprobante', { imagenes: [{ tipo: 'image/png', datos: '<script>' }] })).status, 400);
  const cinco = Array.from({ length: 5 }, () => FACTURA_A);
  assert.equal((await leer(tienda, ...cinco)).status, 400);
});

test('una foto de varios MB entra, aunque el resto de la API siga con su límite de siempre', async () => {
  const grande = { tipo: 'image/jpeg', datos: 'A'.repeat(3 * 1024 * 1024) };
  const r = await tienda.post('/api/compras/leer-comprobante', { imagenes: [imagen(FACTURA_A), grande] });
  assert.equal(r.status, 200, r.texto);
  assert.equal((await tienda.post('/api/compras', { proveedor: 'x'.repeat(200 * 1024), items: [] })).status, 413);
});

test('es del admin, del plan con asistente, y cada negocio ve solo lo suyo', async () => {
  const empleado = await crearEmpleado(servidor, tienda, { usuario: 'factura-empleado' });
  assert.equal((await leer(empleado, FACTURA_A)).status, 403);
  assert.equal((await leer(crearCliente(servidor.url), FACTURA_A)).status, 401);

  const gratis = await registrarEmpresa(servidor, { empresa: 'Kiosco Gratis', usuario: 'factura-gratis', plan: 'gratis' });
  const sinPlan = await leer(gratis, FACTURA_A);
  assert.equal(sinPlan.status, 403);
  assert.equal(sinPlan.json.codigo, 'limite_plan');

  // Otro negocio con el mismo proveedor: no ve el proveedor ni lo recordado
  // del primero, ni sus productos.
  const otro = await registrarEmpresa(servidor, { empresa: 'Almacén Vecino', usuario: 'factura-vecino' });
  const r = await leer(otro, FACTURA_A);
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.proveedor.nuevo, true);
  assert.ok(r.json.items.every((i) => i.coincidencia === 'nuevo' && i.producto === null));
});

/* ---------- Las piezas, sin servidor ---------- */

test('el bulto sale del nombre, pero el tamaño no', () => {
  assert.equal(quitarBulto('COCA COLA 2.25LT X8 PET'), 'COCA COLA 2.25LT PET');
  assert.equal(quitarBulto('Fernet 750cc CJ X 6'), 'Fernet 750cc');
  assert.equal(quitarBulto('Galletitas Oreo x 118 gr'), 'Galletitas Oreo x 118 gr');
  assert.equal(quitarBulto('Agua 500 ml pack 12 u'), 'Agua 500 ml');
  assert.equal(nombreSugerido('ACEITE NATURA 1.5L X12'), 'Aceite Natura 1.5l');
});

test('un parecido solo por el tamaño no cuenta, y entre dos casi iguales elige la persona', () => {
  const catalogo = [
    { producto_id: 1, nombre: 'Coca-Cola 2,25 L' },
    { producto_id: 2, nombre: 'Sprite 2,25 L' },
    { producto_id: 3, nombre: 'Remera negra M' },
    { producto_id: 4, nombre: 'Remera blanca M' }
  ];
  assert.equal(similitud('SPRITE 2.25 X8', 'Coca-Cola 2,25 L'), 0);
  assert.equal(buscarEnCatalogo({ descripcion: 'SPRITE 2.25LT X 8' }, catalogo).entrada.producto_id, 2);
  assert.equal(buscarEnCatalogo({ descripcion: 'REMERA NEGRA T.M' }, catalogo).entrada.producto_id, 3);
  assert.equal(buscarEnCatalogo({ descripcion: 'REMERA ALGODON M' }, catalogo), null);
  assert.equal(buscarEnCatalogo({ descripcion: 'AGUA MINERAL 2L' }, catalogo), null);
});

test('lo leído se limpia: números argentinos, letras y fechas raras, renglones vacíos', () => {
  const l = normalizarLectura({
    proveedor: { nombre: '  Sur  ', cuit: '30-7123' },
    letra: 'b',
    fecha: '2026-02-30',
    renglones: [
      { descripcion: 'Arroz', cantidad: '2', precio_unitario: '1.234,50', unidades_por_bulto: 1, alicuota_iva: 22 },
      { descripcion: 'Subtotal', cantidad: null, precio_unitario: 100 },
      { descripcion: 'Fideos', cantidad: 4, importe: 1000 }
    ]
  });
  assert.equal(l.proveedor.nombre, 'Sur');
  assert.equal(l.proveedor.cuit, null);
  assert.equal(l.letra, 'B');
  assert.equal(l.fecha, null);
  assert.equal(l.precios_sin_iva, false);
  assert.deepEqual(
    l.renglones.map((r) => [r.descripcion, r.cantidad, r.precio_unitario, r.unidades_por_bulto, r.alicuota_iva]),
    [['Arroz', 2, 1234.5, null, null], ['Fideos', 4, 250, null, null]]
  );
});

test('el costo por unidad: bonificación, IVA y bulto', () => {
  const renglon = { cantidad: 2, precio_unitario: 1200, bonificacion: 25 };
  assert.equal(totalDelRenglon(renglon, { preciosSinIva: false, alicuota: 21 }), 1800);
  assert.equal(totalDelRenglon(renglon, { preciosSinIva: true, alicuota: 10.5 }), 1989);
  assert.deepEqual(enUnidades(renglon, 12, 1800), { cantidad: 24, precio_unitario: 75 });
});
