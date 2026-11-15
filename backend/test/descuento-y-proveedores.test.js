// Lo que planteó una contadora probando la demo (hist. §175): el descuento a
// mano del mostrador (frontend/js/core/descuento.js y POST /api/pos/ventas) y
// que un proveedor tipeado distinto no se duplique. Va aparte porque cada
// archivo levanta su servidor.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';
import { fechaDeHoy } from '../fecha.js';

const { aplicarDescuento } = await import('../../frontend/js/core/descuento.js');

let servidor;
let n;
let caja;
let turno;

before(async () => {
  servidor = await levantarServidor();
  n = await registrarEmpresa(servidor, { empresa: 'Tienda Descuentos', usuario: 'tiendadescuentos' });
  caja = (await n.get('/api/cuentas-tesoreria')).json.find((c) => c.tipo === 'efectivo');
  turno = (await n.post('/api/turnos-caja', { cuenta_tesoreria_id: caja.id, contado: 0 })).json;
});

after(async () => {
  await servidor?.cerrar();
});

const total = (r, renglones) => Math.round(renglones.reduce((acc, x, i) => acc + x.cantidad * r.renglones[i].precio, 0) * 100) / 100;

test('el reparto: por porcentaje o por monto, según el valor de cada renglón, y al centavo', () => {
  const renglones = [
    { cantidad: 1, precio: 36900 },
    { cantidad: 2, precio: 42900 }
  ];
  const porciento = aplicarDescuento(renglones, { tipo: 'porcentaje', valor: 10 });
  assert.equal(porciento.monto, 12270);
  assert.deepEqual(porciento.renglones, [
    { precio: 33210, descuento: 3690 },
    { precio: 38610, descuento: 4290 }
  ]);

  // $1.000 no se reparte justo: el renglón de una unidad absorbe el centavo.
  const monto = aplicarDescuento(renglones, { tipo: 'monto', valor: 1000 });
  assert.equal(monto.monto, 1000);
  assert.equal(total(monto, renglones), 121700);

  // Sin un renglón de una unidad, el de más valor; puede quedar a un centavo.
  const pesados = [
    { cantidad: 1.235, precio: 9999 },
    { cantidad: 3, precio: 2500 }
  ];
  const kilos = aplicarDescuento(pesados, { tipo: 'monto', valor: 777 });
  assert.ok(Math.abs(kilos.monto - 777) <= 0.02, String(kilos.monto));

  // El 100 % deja todo en 0; sin descuento, nada cambia.
  assert.equal(aplicarDescuento(renglones, { tipo: 'porcentaje', valor: 100 }).monto, 122700);
  assert.deepEqual(aplicarDescuento(renglones, null).renglones.map((r) => r.precio), [36900, 42900]);

  // Lo que no se puede.
  assert.ok(aplicarDescuento(renglones, { tipo: 'porcentaje', valor: 101 }).error);
  assert.ok(aplicarDescuento(renglones, { tipo: 'monto', valor: 200000 }).error);
  assert.ok(aplicarDescuento(renglones, { tipo: 'monto', valor: 0 }).error);
  assert.ok(aplicarDescuento(renglones, { tipo: 'monto', valor: 'mucho' }).error);
  assert.ok(aplicarDescuento(renglones, { tipo: 'regalo', valor: 5 }).error);
});

test('el mostrador guarda la venta con el descuento repartido, y la auditoría lo cuenta', async () => {
  const buzo = (await n.post('/api/productos', { nombre: 'Buzo', precio_venta: 36900, tipo: 'servicio' })).json.id;
  const jean = (await n.post('/api/productos', { nombre: 'Jean', precio_venta: 42900, tipo: 'servicio' })).json.id;
  const items = [
    { producto_id: buzo, cantidad: 1, precio_unitario: 36900 },
    { producto_id: jean, cantidad: 2, precio_unitario: 42900 }
  ];

  // Cobrar el total sin descuento con el descuento puesto se pasa.
  const pasada = await n.post('/api/pos/ventas', {
    turno_caja_id: turno.id,
    items,
    descuento: { tipo: 'porcentaje', valor: 10 },
    cobros: [{ cuenta_tesoreria_id: caja.id, importe: 122700 }]
  });
  assert.equal(pasada.status, 400);

  const r = await n.post('/api/pos/ventas', {
    turno_caja_id: turno.id,
    items,
    descuento: { tipo: 'porcentaje', valor: 10 },
    cobros: [{ cuenta_tesoreria_id: caja.id, importe: 110430 }]
  });
  assert.equal(r.status, 201, r.texto);
  assert.equal(r.json.total, 110430);

  const venta = (await n.get(`/api/ventas/${r.json.id}`)).json;
  assert.deepEqual(
    venta.items.map((i) => [i.producto, i.precio_unitario, i.descuento]),
    [
      ['Buzo', 33210, 3690],
      ['Jean', 38610, 4290]
    ]
  );
  assert.equal(venta.total, 110430);
  assert.equal(venta.estado_cobro, 'cobrado');

  const auditoria = (await n.get('/api/auditoria')).json;
  const filas = Array.isArray(auditoria) ? auditoria : auditoria.filas ?? auditoria.items ?? [];
  assert.ok(
    filas.some((f) => f.detalle === `Venta #${r.json.id} desde el punto de venta (turno #${turno.id}), con $12270 de descuento (10%)`),
    'la auditoría anota el descuento'
  );

  // Un descuento que no se puede no deja venta.
  const mal = await n.post('/api/pos/ventas', { turno_caja_id: turno.id, items, descuento: { tipo: 'monto', valor: 999999 }, cobros: [] });
  assert.equal(mal.status, 400);
  assert.match(mal.json.error, /no puede pasar del total/);
});

test('con una oferta abajo, la venta la sigue reconociendo y el descuento va aparte', async () => {
  const remera = (await n.post('/api/productos', { nombre: 'Remera lisa', precio_venta: 10000, tipo: 'servicio' })).json.id;
  const oferta = await n.post('/api/ofertas', {
    nombre: 'Semana de remeras',
    tipo: 'porcentaje',
    valor: 20,
    alcance: 'productos',
    productos: [remera],
    desde: fechaDeHoy()
  });
  assert.equal(oferta.status, 201, oferta.texto);

  const r = await n.post('/api/pos/ventas', {
    turno_caja_id: turno.id,
    items: [{ producto_id: remera, cantidad: 1, precio_unitario: 8000 }],
    descuento: { tipo: 'monto', valor: 500 },
    cobros: [{ cuenta_tesoreria_id: caja.id, importe: 7500 }]
  });
  assert.equal(r.status, 201, r.texto);
  const [renglon] = (await n.get(`/api/ventas/${r.json.id}`)).json.items;
  assert.equal(renglon.precio_unitario, 7500);
  assert.equal(renglon.descuento, 500);
  assert.equal(renglon.oferta, 'Semana de remeras');
  assert.equal(renglon.precio_lista, 10000);
});

test('un proveedor tipeado con otras mayúsculas, tildes o espacios es el mismo', async () => {
  await n.post('/api/productos', { nombre: 'Medias', precio_venta: 3000 });
  const textil = (await n.post('/api/proveedores', { nombre: 'Textil Álamos' })).json.id;

  for (const tipeado of ['textil alamos', '  Textil   Álamos ', 'TEXTIL ÁLAMOS']) {
    const compra = await n.post('/api/compras', { proveedor: tipeado, items: [{ producto: 'Medias', cantidad: 1, precio_unitario: 1000 }] });
    assert.equal(compra.status, 201, compra.texto);
    assert.equal((await n.get(`/api/compras/${compra.json.id}`)).json.proveedor_id, textil, tipeado);
  }
  const proveedores = (await n.get('/api/proveedores')).json.filter((p) => p.nombre.toLowerCase().includes('textil'));
  assert.equal(proveedores.length, 1);

  // Y a mano tampoco se repite, ni al crearlo ni al renombrar otro.
  assert.equal((await n.post('/api/proveedores', { nombre: 'textil álamos' })).status, 409);
  const otro = (await n.post('/api/proveedores', { nombre: 'Denim Sur' })).json.id;
  assert.equal((await n.patch(`/api/proveedores/${otro}`, { nombre: 'Textil Alamos' })).status, 409);
  assert.equal((await n.patch(`/api/proveedores/${textil}`, { nombre: 'Textil Álamos SRL' })).status, 200);
});
