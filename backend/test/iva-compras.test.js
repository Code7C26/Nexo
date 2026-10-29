// IVA de la etapa C, tercer paso (hist. §114): las compras y el reporte de
// IVA. Va aparte de iva.test.js porque cada archivo levanta su servidor, y el
// alta de empresas tiene un tope de intentos por IP.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

let servidor;

before(async () => {
  servidor = await levantarServidor();
});

after(async () => {
  await servidor?.cerrar();
});

// Solo la factura A a un negocio inscripto discrimina: ese IVA es crédito
// fiscal y sale del costo, así que el margen y la ganancia también se miden
// sin IVA.
test('inscripto: la compra con factura A deja el IVA como crédito y el costo sin IVA', async () => {
  const n = await registrarEmpresa(servidor, { empresa: 'Almacén RI', usuario: 'almacenri' });
  assert.equal((await n.put('/api/negocio', { condicion_iva: 'responsable_inscripto' })).status, 200);
  const proveedor = async (nombre, condicion_iva) => {
    const r = await n.post('/api/proveedores', { nombre, condicion_iva, documento: '30-71234567-8' });
    assert.equal(r.status, 201, r.texto);
    return r.json.id;
  };
  const mayoristaId = await proveedor('Mayorista SA', 'responsable_inscripto');
  await proveedor('Pedro Mono', 'monotributo');
  assert.equal((await n.get(`/api/proveedores/${mayoristaId}`)).json.condicion_iva, 'responsable_inscripto');
  assert.equal((await n.post('/api/proveedores', { nombre: 'Malo', condicion_iva: 'inventada' })).status, 400);

  const yerba = (await n.post('/api/productos', { nombre: 'Yerba', precio_venta: 3630 })).json.id;
  const comprarYRecibir = async (cuerpo) => {
    const r = await n.post('/api/compras', cuerpo);
    assert.equal(r.status, 201, r.texto);
    assert.equal((await n.post(`/api/compras/${r.json.id}/confirmar`, {})).status, 200);
    const recibida = await n.patch(`/api/compras/${r.json.id}/estado-envio`, { estado_envio: 'recibido' });
    assert.equal(recibida.status, 200, recibida.texto);
    return (await n.get(`/api/compras/${r.json.id}`)).json;
  };

  // Del inscripto, A sola: 10 × $ 1.210 = $ 1.000 de costo + $ 210 de IVA.
  const conA = await comprarYRecibir({
    proveedor: 'Mayorista SA',
    items: [{ producto: 'Yerba', cantidad: 10, precio_unitario: 1210 }],
    comprobante_numero: ' 0001-00000123 '
  });
  assert.equal(conA.comprobante_letra, 'A');
  assert.equal(conA.comprobante_numero, '0001-00000123');
  assert.deepEqual([conA.items[0].alicuota_iva, conA.items[0].iva, conA.items[0].costo_real_unitario], ['21', 2100, 1000]);
  assert.equal(conA.iva, 2100);
  assert.equal(conA.total, 12100, 'la deuda con el proveedor es lo pagado, con IVA');

  // El margen del producto se mide sobre el precio sin IVA: $ 3.000 contra $ 1.000.
  const producto = (await n.get('/api/productos')).json.find((p) => p.id === yerba);
  assert.equal(producto.precio_costo, 1000);
  assert.equal(Math.round(producto.margen * 100) / 100, 66.67);

  // Del monotributista, C: el IVA queda en el costo.
  const conC = await comprarYRecibir({ proveedor: 'Pedro Mono', items: [{ producto: 'Yerba', cantidad: 10, precio_unitario: 1210 }] });
  assert.equal(conC.comprobante_letra, 'C');
  assert.deepEqual([conC.items[0].alicuota_iva, conC.items[0].iva, conC.items[0].costo_real_unitario], [null, 0, 1210]);

  // La venta: $ 3.630 con $ 630 de IVA y costo promedio $ 1.105 → gana $ 1.895.
  const cliente = (await n.post('/api/clientes', { nombre: 'Juan' })).json.id;
  const venta = await n.post('/api/ventas', { cliente_id: cliente, items: [{ producto_id: yerba, cantidad: 1, precio_unitario: 3630 }] });
  assert.equal(venta.status, 201, venta.texto);
  const vista = (await n.get(`/api/ventas/${venta.json.id}`)).json;
  assert.equal(vista.iva, 630);
  assert.equal(vista.costo_total, 1105);
  assert.equal(vista.margen, 1895);
  assert.equal(vista.items[0].ganancia, 1895);
  const enLista = (await n.get('/api/ventas')).json.find((v) => v.id === venta.json.id);
  assert.deepEqual([enLista.margen, enLista.costo_total], [1895, 1105]);
  const resumen = (await n.get('/api/resumen')).json;
  assert.deepEqual([resumen.ventas, resumen.ganancia_bruta], [3000, 1895]);
  assert.equal((await n.post(`/api/ventas/${venta.json.id}/facturar`, { condicion: 'efectivo' })).status, 201);

  // Devolver 2 de la compra A resta $ 420 de crédito.
  const devolucion = await n.post('/api/devoluciones-proveedor', {
    compra_id: conA.id,
    items: [{ compra_item_id: conA.items[0].id, cantidad: 2 }],
    motivo: 'Vencida'
  });
  assert.equal(devolucion.status, 201, devolucion.texto);

  const reporte = (await n.get('/api/reportes/iva')).json;
  assert.equal(reporte.discrimina, true);
  assert.deepEqual(reporte.totales, { debito: 630, credito: 1680, saldo: -1050 });
  assert.deepEqual(reporte.ventas.map((f) => [f.letra, f.neto, f.iva]), [['B', 3000, 630]]);
  assert.deepEqual(
    reporte.compras.map((f) => [f.tipo, f.letra, f.iva, f.proveedor_documento]),
    // Por fecha y, en el mismo día, la nota de crédito al lado de su compra.
    [['factura', 'A', 2100, '30-71234567-8'], ['nota_credito', 'A', -420, '30-71234567-8'], ['factura', 'C', 0, '30-71234567-8']]
  );

  const malo = await n.post('/api/compras', { proveedor: 'Mayorista SA', items: [{ producto: 'Yerba', cantidad: 1, precio_unitario: 1 }], comprobante_letra: 'X' });
  assert.equal(malo.status, 400, malo.texto);
});

test('sin ser inscripto, ni una factura A discrimina el IVA de la compra', async () => {
  const n = await registrarEmpresa(servidor, { empresa: 'Kiosco Mono', usuario: 'kioscomono' });
  assert.equal((await n.put('/api/negocio', { condicion_iva: 'monotributo' })).status, 200);
  await n.post('/api/productos', { nombre: 'Galletitas', precio_venta: 2000 });
  const r = await n.post('/api/compras', {
    proveedor: 'Distribuidora',
    items: [{ producto: 'Galletitas', cantidad: 5, precio_unitario: 1210 }],
    comprobante_letra: 'A'
  });
  assert.equal(r.status, 201, r.texto);
  const compra = (await n.get(`/api/compras/${r.json.id}`)).json;
  assert.equal(compra.comprobante_letra, 'A');
  assert.deepEqual([compra.items[0].iva, compra.items[0].costo_real_unitario], [0, 1210]);
  assert.equal((await n.get('/api/reportes/iva')).json.discrimina, false);
});
