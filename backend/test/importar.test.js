// Importar desde una planilla (hist. §211): productos, clientes y proveedores
// desde el Excel o el CSV que el negocio ya tenía. Revisar no escribe nada,
// guardar hace lo mismo que mostró, y una celda vacía no borra.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';

import { levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';
import {
  adivinarColumnas,
  armarTabla,
  interpretarFila,
  leerAlicuota,
  leerCondicionIva,
  leerNumero,
  leerXlsx,
  separarTexto
} from '../../frontend/js/core/planilla.js';

let servidor;

before(async () => {
  servidor = await levantarServidor();
});

after(async () => {
  await servidor?.cerrar();
});

/* ---------- Leer la planilla ---------- */

test('los números como los escribe un negocio argentino', () => {
  assert.equal(leerNumero('$ 1.234,50'), 1234.5);
  assert.equal(leerNumero('1.500'), 1500);
  assert.equal(leerNumero('1,5'), 1.5);
  assert.equal(leerNumero('10.25'), 10.25);
  assert.equal(leerNumero('1,234.50'), 1234.5);
  assert.equal(leerNumero(12000), 12000);
  assert.equal(leerNumero(''), null);
  assert.ok(Number.isNaN(leerNumero('consultar')));
  assert.equal(leerAlicuota('21 %'), '21');
  assert.equal(leerAlicuota('10,5'), '10.5');
  assert.equal(leerAlicuota(0.105), '10.5');
  assert.equal(leerAlicuota('Exento'), 'exento');
  assert.equal(leerAlicuota('19'), undefined);
  assert.equal(leerCondicionIva('Resp. Inscripto'), 'responsable_inscripto');
  assert.equal(leerCondicionIva('Monotributista'), 'monotributo');
  assert.equal(leerCondicionIva('CF'), 'consumidor_final');
  assert.equal(leerCondicionIva('cualquiera'), undefined);
});

test('adivina las columnas por su título, y la descripción es el nombre si no hay otro', () => {
  assert.deepEqual(adivinarColumnas('productos', ['Cód.', 'Descripción', 'Precio de venta $', 'Precio de costo', 'Stock', 'Cód. barras', 'Otra cosa']), [
    'sku', 'nombre', 'precio_venta', 'costo', 'stock', 'codigo_barras', null
  ]);
  assert.deepEqual(adivinarColumnas('clientes', ['Nombre', 'Apellido', 'CUIT/DNI', 'Mail', 'Cel']), ['nombre', 'apellido', 'documento', 'email', 'telefono']);
  const { datos } = interpretarFila('clientes', { nombre: 'Ana', apellido: 'Gómez', direccion: 'Mitre 10', localidad: 'Quilmes', email: 'ANA@MAIL.COM' });
  assert.deepEqual(datos, { nombre: 'Ana Gómez', direccion: 'Mitre 10, Quilmes', email: 'ana@mail.com' });
});

test('el CSV de Excel con punto y coma, comillas, y los títulos debajo del nombre del negocio', () => {
  const filas = separarTexto('\ufeffMates Tosi;;\nCodigo;Producto;Precio\nM1;"Mate ""imperial""";12.000\n\nM2;Bombilla;3500,5\n');
  const tabla = armarTabla('productos', filas);
  assert.deepEqual(tabla.encabezados, ['Codigo', 'Producto', 'Precio']);
  assert.deepEqual(tabla.filas, [
    { numero: 3, celdas: ['M1', 'Mate "imperial"', '12.000'] },
    { numero: 5, celdas: ['M2', 'Bombilla', '3500,5'] }
  ]);
  // Lo copiado de Excel y pegado viene con tabuladores.
  assert.deepEqual(separarTexto('Nombre\tPrecio\r\nYerba\t2000'), [['Nombre', 'Precio'], ['Yerba', '2000']]);
});

// Un .xlsx de verdad: un zip con la hoja, los textos compartidos y el libro.
function zip(archivos) {
  const locales = [];
  const directorio = [];
  let desplazamiento = 0;
  for (const [nombre, contenido] of Object.entries(archivos)) {
    const datos = deflateRawSync(Buffer.from(contenido, 'utf8'));
    const nombreBytes = Buffer.from(nombre, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(datos.length, 18);
    local.writeUInt16LE(nombreBytes.length, 26);
    locales.push(local, nombreBytes, datos);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(datos.length, 20);
    central.writeUInt16LE(nombreBytes.length, 28);
    central.writeUInt32LE(desplazamiento, 42);
    directorio.push(central, nombreBytes);
    desplazamiento += 30 + nombreBytes.length + datos.length;
  }
  const tamanio = directorio.reduce((n, b) => n + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(Object.keys(archivos).length, 8);
  fin.writeUInt16LE(Object.keys(archivos).length, 10);
  fin.writeUInt32LE(tamanio, 12);
  fin.writeUInt32LE(desplazamiento, 16);
  return new Uint8Array(Buffer.concat([...locales, ...directorio, fin]));
}

test('lee la primera hoja de un .xlsx: textos compartidos, números y celdas salteadas', async () => {
  const bytes = zip({
    'xl/workbook.xml': '<workbook><sheets><sheet name="Lista" sheetId="1" r:id="rId3"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId3" Type="x" Target="worksheets/hoja.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>Producto</t></si><si><t>Precio</t></si><si><r><t>Mate </t></r><r><t>&amp; bombilla</t></r></si></sst>',
    'xl/worksheets/hoja.xml':
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" s="1"/><c r="C2"><v>15000.5</v></c></row>' +
      '<row r="3"><c r="A3" t="inlineStr"><is><t>Yerba</t></is></c><c r="C3"><v>0.30000000000000004</v></c></row></sheetData></worksheet>'
  });
  assert.deepEqual(await leerXlsx(bytes), [
    ['Producto', null, 'Precio'],
    ['Mate & bombilla', null, 15000.5],
    ['Yerba', null, 0.3]
  ]);
});

/* ---------- Productos ---------- */

const fila = (numero, campos) => ({ numero, campos });

test('productos: revisar no escribe, guardar crea y actualiza, y una celda vacía no borra', async () => {
  const n = await registrarEmpresa(servidor, { empresa: 'Planilla Mates', usuario: 'planillamates' });
  const mate = (await n.post('/api/productos', { nombre: 'Mate calabaza', sku: 'M1', precio_venta: 10000 })).json.id;
  await n.post('/api/productos', { nombre: 'Yerba 1 kg', precio_venta: 4000 });

  const filas = [
    fila(2, { sku: 'm1', nombre: 'Mate calabaza', precio_venta: '12.000', stock: '10', costo: '6.000,50' }),
    fila(3, { nombre: 'yerba 1 KG', precio_venta: '4000', categoria: 'Almacén' }),
    fila(4, { nombre: 'Bombilla', sku: 'B1', precio_venta: 3500, stock: 20, costo: 1500, categoria: 'almacén', codigo_barras: '779 1234' }),
    fila(5, { nombre: 'Termo', precio_venta: 'consultar' }),
    fila(6, { nombre: 'Bombilla', precio_venta: 3600 }),
    fila(7, { sku: 'NO-EXISTE' })
  ];
  const revision = await n.post('/api/importar/productos', { filas });
  assert.equal(revision.status, 200, revision.texto);
  assert.deepEqual(revision.json.resumen, { crear: 1, actualizar: 2, igual: 0, error: 3 });
  const [r2, r3, r4, r5, r6, r7] = revision.json.filas;
  assert.deepEqual([r2.accion, r2.cambios.map((c) => c.campo)], ['actualizar', ['precio_venta', 'stock', 'costo']]);
  assert.deepEqual([r3.accion, r3.cambios.map((c) => c.campo)], ['actualizar', ['categoria']], 'el precio igual no cuenta');
  assert.equal(r4.accion, 'crear');
  assert.match(r5.error, /no es un número/);
  assert.match(r6.error, /renglón 4/);
  assert.match(r7.error, /sin nombre no se puede crear/);
  assert.equal((await n.get('/api/productos')).json.length, 2, 'revisar no escribe nada');

  const guardado = await n.post('/api/importar/productos', { filas, guardar: true });
  assert.equal(guardado.status, 200, guardado.texto);
  assert.deepEqual(guardado.json.resumen, { crear: 1, actualizar: 2, igual: 0, error: 3 });
  const productos = (await n.get('/api/productos')).json;
  const delMate = productos.find((p) => p.id === mate);
  assert.deepEqual([delMate.precio_venta, delMate.stock, delMate.precio_costo], [12000, 10, 6000.5]);
  const bombilla = productos.find((p) => p.nombre === 'Bombilla');
  assert.deepEqual([bombilla.sku, bombilla.codigo_barras, bombilla.stock, bombilla.precio_costo, bombilla.tipo], ['B1', '7791234', 20, 1500, 'producto']);
  const categorias = (await n.get('/api/categorias')).json;
  assert.deepEqual(categorias.map((c) => c.nombre), ['Almacén'], 'una sola categoría para "Almacén" y "almacén"');
  assert.equal(productos.find((p) => p.nombre === 'Yerba 1 kg').categoria_id, categorias[0].id);

  // Otra vez la misma planilla: todo igual. Y una celda vacía no borra el precio.
  const otraVez = await n.post('/api/importar/productos', { filas: filas.slice(0, 3) });
  assert.deepEqual(otraVez.json.resumen, { crear: 0, actualizar: 0, igual: 3, error: 0 });
  await n.post('/api/importar/productos', { filas: [fila(2, { sku: 'M1', precio_venta: '', stock: '8' })], guardar: true });
  const despues = (await n.get('/api/productos')).json.find((p) => p.id === mate);
  assert.deepEqual([despues.precio_venta, despues.stock, despues.precio_costo], [12000, 8, 6000.5]);

  // El stock es trazable: el ajuste de 10 a 8 es un movimiento de stock inicial.
  const movimiento = (await n.get('/api/movimientos-stock')).json.find((m) => m.producto_id === mate && m.cantidad === -2);
  assert.equal(movimiento.origen, 'stock_inicial');
});

test('productos: un nombre que ya existe con otro código no se pisa, y la planilla tiene que ser válida', async () => {
  const n = await registrarEmpresa(servidor, { empresa: 'Planilla Codigos', usuario: 'planillacodigos' });
  await n.post('/api/productos', { nombre: 'Remera', sku: 'R-1', precio_venta: 9000 });
  const r = await n.post('/api/importar/productos', { filas: [fila(2, { sku: 'R-2', nombre: 'Remera', precio_venta: 9500 })] });
  assert.match(r.json.filas[0].error, /otro código \(R-1\)/);
  assert.equal((await n.post('/api/importar/inventos', { filas: [fila(2, {})] })).status, 404);
  assert.equal((await n.post('/api/importar/productos', { filas: [{ numero: 2, campos: { nombre: { malo: 1 } } }] })).status, 400);
});

/* ---------- Clientes y proveedores ---------- */

test('clientes: por CUIT, mail o nombre; dos con el mismo nombre y distinto DNI son dos', async () => {
  const n = await registrarEmpresa(servidor, { empresa: 'Planilla Clientes', usuario: 'planillaclientes' });
  const juan = (await n.post('/api/clientes', { nombre: 'Juan Pérez', documento: '20-30111222-3' })).json.id;
  const filas = [
    fila(2, { nombre: 'Juan Perez', documento: '20301112223', telefono: '11 5555-1234', condicion_iva: 'Resp. Inscripto' }),
    fila(3, { nombre: 'Juan Pérez', documento: '27-40999888-1' }),
    fila(4, { nombre: 'Lucía', apellido: 'Gómez', email: 'lucia@mail.com', condicion_iva: 'cualquiera' }),
    fila(5, { nombre: 'Lucía', apellido: 'Gómez', email: 'lucia@mail.com' }),
    fila(6, { email: 'lucia@mail.com', telefono: '11 4444' })
  ];
  const r = await n.post('/api/importar/clientes', { filas, guardar: true });
  assert.equal(r.status, 200, r.texto);
  const [a, b, c, d, e] = r.json.filas;
  assert.deepEqual([a.accion, a.cambios.map((x) => x.campo)], ['actualizar', ['condicion_iva', 'telefono']], 'el CUIT con guiones es el mismo');
  assert.equal(b.accion, 'crear');
  assert.match(c.error, /no es una frente al IVA/);
  assert.equal(d.accion, 'crear');
  assert.match(e.error, /renglón 5/);
  const clientes = (await n.get('/api/clientes')).json;
  assert.equal(clientes.filter((x) => x.nombre === 'Juan Pérez').length, 2);
  assert.equal(clientes.find((x) => x.id === juan).condicion_iva, 'responsable_inscripto');
  assert.equal(clientes.find((x) => x.nombre === 'Lucía Gómez').email, 'lucia@mail.com');
});

test('proveedores: el nombre no se repite', async () => {
  const n = await registrarEmpresa(servidor, { empresa: 'Planilla Proveedores', usuario: 'planillaprov' });
  await n.post('/api/proveedores', { nombre: 'Distribuidora Sur', documento: '30-11111111-1' });
  const r = await n.post('/api/importar/proveedores', {
    filas: [
      fila(2, { nombre: 'Distribuidora Sur', documento: '30-22222222-2' }),
      fila(3, { nombre: 'Yerbatera Norte', email: 'ventas@norte.com' }),
      fila(4, { nombre: 'yerbatera norte' })
    ],
    guardar: true
  });
  const [a, b, c] = r.json.filas;
  assert.match(a.error, /otro CUIT/);
  assert.equal(b.accion, 'crear');
  assert.match(c.error, /renglón 3/);
  assert.equal((await n.get('/api/proveedores')).json.length, 2);
});
