// La lista de precios del proveedor (18 de noviembre de 2026): el mensaje, la
// planilla o el PDF se leen sin IA (lista-proveedor.js); la foto, con la IA
// (con NEXO_INTERPRETE=stub, la "imagen" es el JSON de la lectura). Cada
// renglón se busca en el catálogo, la persona lo revisa y se guarda como una
// lista con su fecha, sin tocar el costo de los productos.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearCliente, crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';
import { asociarRenglones, bultoDeDescripcion, leerImporte, leerLista, normalizarLecturaDeLista } from '../lista-proveedor.js';

let servidor;
let tienda;
let proveedor;
const ids = {};

before(async () => {
  servidor = await levantarServidor();
  tienda = await registrarEmpresa(servidor, { empresa: 'Almacén Listas', usuario: 'listas' });
  for (const producto of [
    { nombre: 'Coca-Cola 2,25 L', precio_venta: 3500 },
    { nombre: 'Yerba Playadito 1 kg', codigo_barras: '7790387000154', precio_venta: 6000 },
    { nombre: 'Fideos Lucchetti 500 g', precio_venta: 1800 }
  ]) {
    const r = await tienda.post('/api/productos', producto);
    assert.equal(r.status, 201, r.texto);
    ids[producto.nombre] = r.json.id;
  }
  const p = await tienda.post('/api/proveedores', { nombre: 'Distribuidora Sur' });
  assert.equal(p.status, 201, p.texto);
  proveedor = p.json.id;
});

after(async () => {
  await servidor?.cerrar();
});

const MENSAJE = `Buen día! Precios actualizados 17/11 🔥
• Coca Cola 2,25 L x8 ........ $ 21.600
• Yerba Playadito 1 kg = $5.200
- Fideos Lucchetti 500g: 1.250,50
Galletitas Oreo 118 g $ 980
Saludos`;

const leer = (cliente, cuerpo, id = proveedor) => cliente.post(`/api/proveedores/${id}/lista/leer`, cuerpo);
const guardar = (cliente, cuerpo, id = proveedor) => cliente.post(`/api/proveedores/${id}/listas`, cuerpo);

test('el mensaje se lee sin IA: cada renglón con su producto, y lo que no está queda sin producto', async () => {
  const r = await leer(tienda, { texto: MENSAJE });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.descartadas, 2);
  const [coca, yerba, fideos, oreo] = r.json.renglones;
  assert.equal(coca.producto.nombre, 'Coca-Cola 2,25 L');
  assert.equal(coca.precio, 21600);
  assert.equal(coca.unidades_por_bulto, 8);
  assert.equal(yerba.producto.id, ids['Yerba Playadito 1 kg']);
  assert.equal(fideos.precio, 1250.5);
  assert.equal(oreo.producto, null);
  assert.equal(oreo.coincidencia, null);
  // El catálogo, para elegir a mano lo que no se encontró.
  assert.ok(r.json.catalogo.some((e) => e.nombre === 'Fideos Lucchetti 500 g' && e.alicuota === 21));
});

test('guardar la lista: el precio de hoy, cuánto cambió contra la anterior, y el costo del producto no se toca', async () => {
  const primera = await guardar(tienda, {
    fecha: '2026-11-01',
    origen: 'mensaje',
    renglones: [
      { producto_id: ids['Coca-Cola 2,25 L'], precio: 2500, descripcion: 'Coca Cola 2,25 L x8', clave: 'txt:coca cola 2.25 l x 8', unidades_por_bulto: 8 },
      { producto_id: ids['Yerba Playadito 1 kg'], precio: 5000 }
    ]
  });
  assert.equal(primera.status, 201, primera.texto);
  assert.equal(primera.json.cantidad, 2);

  const segunda = await guardar(tienda, {
    fecha: '2026-11-17',
    origen: 'mensaje',
    renglones: [
      { producto_id: ids['Coca-Cola 2,25 L'], precio: 2700 },
      // Repetido: vale el último.
      { producto_id: ids['Fideos Lucchetti 500 g'], precio: 1200 },
      { producto_id: ids['Fideos Lucchetti 500 g'], precio: 1250.5 }
    ]
  });
  assert.equal(segunda.status, 201, segunda.texto);
  assert.equal(segunda.json.cantidad, 2);

  const { precios, listas } = (await tienda.get(`/api/proveedores/${proveedor}/precios`)).json;
  assert.equal(listas.length, 2);
  assert.equal(listas[0].fecha, '2026-11-17');
  const coca = precios.find((p) => p.producto_id === ids['Coca-Cola 2,25 L']);
  assert.equal(coca.precio, 2700);
  assert.deepEqual(coca.anterior, { precio: 2500, fecha: '2026-11-01' });
  // La yerba no vino en la última: sigue valiendo la de antes.
  assert.equal(precios.find((p) => p.producto_id === ids['Yerba Playadito 1 kg']).precio, 5000);
  assert.equal(precios.find((p) => p.producto_id === ids['Fideos Lucchetti 500 g']).precio, 1250.5);

  const producto = (await tienda.get('/api/productos')).json.find((p) => p.id === ids['Coca-Cola 2,25 L']);
  assert.equal(producto.precio_costo, 0);

  // Lo confirmado se recuerda: la próxima lista lo encuentra por lo que es, con su bulto.
  const otra = await leer(tienda, { texto: 'Coca Cola 2,25 L x8 $22.000' });
  assert.equal(otra.json.renglones[0].coincidencia, 'recordado');
  assert.equal(otra.json.renglones[0].unidades_por_bulto, 8);
  assert.deepEqual(otra.json.renglones[0].anterior, { precio: 2700, fecha: '2026-11-17' });

  // El producto dice cuánto le cobra cada proveedor.
  const porProducto = (await tienda.get(`/api/productos/${ids['Coca-Cola 2,25 L']}/precios-proveedores`)).json;
  assert.deepEqual(porProducto.map((p) => [p.proveedor, p.precio]), [['Distribuidora Sur', 2700]]);
});

test('borrar una lista cargada por error: vuelve a valer la anterior, y queda en la auditoría', async () => {
  const { listas } = (await tienda.get(`/api/proveedores/${proveedor}/precios`)).json;
  const ultima = listas[0];
  assert.equal((await tienda.del(`/api/proveedores/${proveedor}/listas/${ultima.id}`)).status, 200);
  const { precios } = (await tienda.get(`/api/proveedores/${proveedor}/precios`)).json;
  assert.equal(precios.find((p) => p.producto_id === ids['Coca-Cola 2,25 L']).precio, 2500);
  assert.equal(precios.find((p) => p.producto_id === ids['Fideos Lucchetti 500 g']), undefined);
  assert.equal((await tienda.del(`/api/proveedores/${proveedor}/listas/${ultima.id}`)).status, 404);
  const auditoria = (await tienda.get('/api/auditoria?entidad=proveedor')).json;
  const filas = auditoria.filas ?? auditoria;
  assert.ok(filas.some((f) => /Borró la lista de precios de Distribuidora Sur/.test(f.detalle)));
});

test('lo que llega mal no se guarda', async () => {
  const coca = ids['Coca-Cola 2,25 L'];
  assert.equal((await guardar(tienda, { renglones: [] })).status, 400);
  assert.equal((await guardar(tienda, { fecha: '17/11/2026', renglones: [{ producto_id: coca, precio: 1 }] })).status, 400);
  assert.equal((await guardar(tienda, { origen: 'whatsapp', renglones: [{ producto_id: coca, precio: 1 }] })).status, 400);
  assert.equal((await guardar(tienda, { renglones: [{ producto_id: coca, precio: -1 }] })).status, 400);
  assert.equal((await guardar(tienda, { renglones: [{ producto_id: coca, precio: null }] })).status, 400);
  assert.equal((await guardar(tienda, { renglones: [{ producto_id: 999999, precio: 1 }] })).status, 400);
  assert.equal((await leer(tienda, { texto: '' })).status, 400);
  assert.equal((await leer(tienda, { texto: 'Hola, ¿cómo andás?\nMañana te paso la lista.' })).status, 422);
  assert.equal((await leer(tienda, { texto: MENSAJE }, 999999)).status, 404);
});

test('la foto la lee la IA: con su IVA y sus bultos', async () => {
  const lectura = {
    precios_sin_iva: true,
    renglones: [
      { codigo: '7790387000154', descripcion: 'YERBA PLAYADITO 1KG', precio: 4800 },
      { codigo: null, descripcion: '', precio: 100 }
    ]
  };
  const r = await leer(tienda, { imagenes: [{ tipo: 'image/jpeg', datos: Buffer.from(JSON.stringify(lectura)).toString('base64') }] });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.precios_sin_iva, true);
  assert.equal(r.json.descartadas, 1);
  assert.equal(r.json.renglones[0].coincidencia, 'codigo');
  assert.equal((await leer(tienda, { imagenes: [] })).status, 400);
});

test('es del admin, la foto es del plan con asistente, y cada negocio ve solo lo suyo', async () => {
  const empleado = await crearEmpleado(servidor, tienda, { usuario: 'listas-empleado' });
  assert.equal((await leer(empleado, { texto: MENSAJE })).status, 403);
  assert.equal((await empleado.get(`/api/proveedores/${proveedor}/precios`)).status, 403);
  assert.equal((await guardar(empleado, { renglones: [{ producto_id: ids['Coca-Cola 2,25 L'], precio: 1 }] })).status, 403);
  assert.equal((await leer(crearCliente(servidor.url), { texto: MENSAJE })).status, 401);

  // Sin el plan con asistente, el texto se lee igual; la foto no.
  const gratis = await registrarEmpresa(servidor, { empresa: 'Kiosco Gratis Listas', usuario: 'listas-gratis', plan: 'gratis' });
  const suyo = (await gratis.post('/api/proveedores', { nombre: 'Mayorista' })).json.id;
  await gratis.post('/api/productos', { nombre: 'Coca-Cola 2,25 L', precio_venta: 3500 });
  assert.equal((await leer(gratis, { texto: MENSAJE }, suyo)).status, 200);
  const foto = await leer(gratis, { imagenes: [{ tipo: 'image/jpeg', datos: Buffer.from('{}').toString('base64') }] }, suyo);
  assert.equal(foto.status, 403);
  assert.equal(foto.json.codigo, 'limite_plan');

  // Otro negocio no ve ni usa el proveedor ni los productos del primero.
  assert.equal((await gratis.get(`/api/proveedores/${proveedor}/precios`)).status, 404);
  assert.equal((await guardar(gratis, { renglones: [{ producto_id: ids['Coca-Cola 2,25 L'], precio: 1 }] }, suyo)).status, 400);
  assert.equal((await gratis.get(`/api/productos/${ids['Coca-Cola 2,25 L']}/precios-proveedores`)).status, 404);
});

test('unir dos proveedores: las listas pasan al que queda', async () => {
  const repetido = (await tienda.post('/api/proveedores', { nombre: 'Distribuidora Sur SRL' })).json.id;
  await guardar(tienda, { fecha: '2026-11-18', renglones: [{ producto_id: ids['Yerba Playadito 1 kg'], precio: 5100 }] }, repetido);
  const unir = await tienda.post(`/api/proveedores/${proveedor}/unir`, { ids: [repetido] });
  assert.equal(unir.status, 200, unir.texto);
  const { precios } = (await tienda.get(`/api/proveedores/${proveedor}/precios`)).json;
  assert.equal(precios.find((p) => p.producto_id === ids['Yerba Playadito 1 kg']).precio, 5100);
});

/* ---------- El lector, sin servidor ---------- */

test('los precios como se escriben en la Argentina', () => {
  assert.equal(leerImporte('12.500'), 12500);
  assert.equal(leerImporte('12.500,50'), 12500.5);
  assert.equal(leerImporte('$ 1250'), 1250);
  assert.equal(leerImporte('4200.00'), 4200);
  assert.equal(leerImporte('1,5'), 1.5);
  assert.equal(leerImporte('1,234,567'), 1234567);
  assert.equal(leerImporte('hola'), null);
});

test('el precio es el último número con "$", o el que no es un tamaño, un bulto, una fecha ni un código', () => {
  const { renglones, descartadas } = leerLista(
    [
      'LISTA 17/11/2026',
      '7790895000997 Agua Villavicencio 1,5L 1200',
      'AB-120 Galletitas Oreo 118 g $ 980,00',
      'Alfajor Jorgito x 6 u $3.900 c/u',
      'Aceite Natura 900 ml ... 2.350',
      '556\tArroz Gallo Oro 1kg\t1.890,00',
      '557;Azúcar Ledesma 1 kg;$ 1.100'
    ].join('\n')
  );
  assert.equal(descartadas, 1);
  assert.deepEqual(
    renglones.map((r) => [r.codigo, r.descripcion, r.precio, r.unidades_por_bulto]),
    [
      ['7790895000997', 'Agua Villavicencio 1,5L', 1200, null],
      ['AB-120', 'Galletitas Oreo 118 g', 980, null],
      // "c/u": el precio ya es de cada uno.
      [null, 'Alfajor Jorgito x 6 u', 3900, null],
      [null, 'Aceite Natura 900 ml', 2350, null],
      ['556', 'Arroz Gallo Oro 1kg', 1890, null],
      ['557', 'Azúcar Ledesma 1 kg', 1100, null]
    ]
  );
});

test('el bulto sale del nombre; el tamaño no es un bulto', () => {
  assert.equal(bultoDeDescripcion('Coca Cola 2,25 L x8'), 8);
  assert.equal(bultoDeDescripcion('Yerba pack 10'), 10);
  assert.equal(bultoDeDescripcion('Fideos x 500 g'), null);
});

test('la foto: lo que no tiene descripción o precio queda afuera', () => {
  const r = normalizarLecturaDeLista({
    precios_sin_iva: false,
    renglones: [{ descripcion: 'Yerba', precio: '4.800,50' }, { descripcion: 'x', precio: 10 }, { descripcion: 'Arroz', precio: 0 }]
  });
  assert.deepEqual(r.renglones.map((x) => [x.descripcion, x.precio]), [['Yerba', 4800.5]]);
  assert.equal(r.descartadas, 2);
  assert.equal(r.precios_sin_iva, false);
});

test('una lista larga contra un catálogo grande no tarda', () => {
  const catalogo = Array.from({ length: 3000 }, (_, i) => ({
    producto_id: i + 1,
    variante_id: null,
    nombre: `Producto ${['Arroz', 'Fideos', 'Yerba', 'Aceite', 'Galletitas'][i % 5]} marca${i} ${i % 7} kg`,
    sku: `SKU${i}`,
    codigo_barras: null
  }));
  // Todos comparten "marca" y "producto": el peor caso para elegir candidatos.
  const renglones = Array.from({ length: 1000 }, (_, i) => ({ codigo: null, descripcion: `Galletitas marca${i} rellenas`, precio: 100 + i }));
  const desde = Date.now();
  const asociados = asociarRenglones(renglones, catalogo, new Map());
  // Con margen: la suite corre en paralelo. Comparando contra todo, tardaba minutos.
  assert.ok(Date.now() - desde < 10000, `tardó ${Date.now() - desde} ms`);
  assert.equal(asociados.length, 1000);
});

test('una lista grande pasa: la ruta tiene su propio límite y el parser global no la corta en 100 KB (hist. §207)', async () => {
  // 3000 renglones son unos 150 KB: antes daba 413 sin llegar a leerse.
  const texto = Array.from({ length: 3000 }, (_, i) => `Artículo de prueba número ${i + 1} ........ $ ${1000 + i}`).join('\n');
  assert.ok(Buffer.byteLength(JSON.stringify({ texto })) > 100_000);
  const r = await leer(tienda, { texto });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.renglones.length, 3000);
});
