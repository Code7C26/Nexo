// IVA de la etapa C. Primer paso (hist. §112): la alícuota del producto (21 %
// si no se elige) y la condición del cliente frente al IVA (vacía = consumidor
// final). Segundo (hist. §113): cada renglón guarda su alícuota y su IVA, y la
// letra del comprobante sale de la condición del negocio y la del cliente.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';
import { ivaIncluido, letraQueCorresponde } from '../iva.js';

let servidor;
let admin;

before(async () => {
  servidor = await levantarServidor();
  admin = await registrarEmpresa(servidor, { empresa: 'Kiosco IVA', usuario: 'iva' });
});

after(async () => {
  await servidor?.cerrar();
});

const productoEnLista = async (id) => (await admin.get('/api/productos')).json.find((p) => p.id === id);

test('un producto nace en 21 % y se puede cambiar de alícuota', async () => {
  const creado = await admin.post('/api/productos', { nombre: 'Yerba', precio_venta: 3000 });
  assert.equal(creado.status, 201, creado.texto);
  assert.equal((await productoEnLista(creado.json.id)).alicuota_iva, '21');

  const libro = await admin.post('/api/productos', { nombre: 'Libro', precio_venta: 9000, alicuota_iva: 'exento' });
  assert.equal(libro.status, 201, libro.texto);
  assert.equal((await productoEnLista(libro.json.id)).alicuota_iva, 'exento');

  const editado = await admin.patch(`/api/productos/${creado.json.id}`, { alicuota_iva: '10.5' });
  assert.equal(editado.status, 200, editado.texto);
  assert.equal((await productoEnLista(creado.json.id)).alicuota_iva, '10.5');

  // Editar otro campo no la toca.
  await admin.patch(`/api/productos/${creado.json.id}`, { precio_venta: 3200 });
  assert.equal((await productoEnLista(creado.json.id)).alicuota_iva, '10.5');

  for (const alicuota_iva of ['22', 'mucho', 21.5]) {
    const r = await admin.patch(`/api/productos/${creado.json.id}`, { alicuota_iva });
    assert.equal(r.status, 400, `alícuota ${alicuota_iva}: ${r.texto}`);
  }
});

test('el cliente guarda su condición frente al IVA', async () => {
  const creado = await admin.post('/api/clientes', { nombre: 'Ferretería Sur', condicion_iva: 'responsable_inscripto' });
  assert.equal(creado.status, 201, creado.texto);
  const id = creado.json.id;
  assert.equal((await admin.get(`/api/clientes/${id}`)).json.condicion_iva, 'responsable_inscripto');

  // Una edición que no la manda la deja como estaba; vacía, vuelve a
  // consumidor final.
  assert.equal((await admin.patch(`/api/clientes/${id}`, { nombre: 'Ferretería del Sur' })).status, 200);
  assert.equal((await admin.get(`/api/clientes/${id}`)).json.condicion_iva, 'responsable_inscripto');
  assert.equal((await admin.patch(`/api/clientes/${id}`, { nombre: 'Ferretería del Sur', condicion_iva: '' })).status, 200);
  assert.equal((await admin.get(`/api/clientes/${id}`)).json.condicion_iva, null);

  const malo = await admin.post('/api/clientes', { nombre: 'Otro', condicion_iva: 'inventada' });
  assert.equal(malo.status, 400, malo.texto);
});

test('el IVA sale de adentro del precio final, y la letra de las dos condiciones', () => {
  assert.equal(ivaIncluido(1210, '21'), 210);
  assert.equal(ivaIncluido(1105, '10.5'), 105);
  assert.equal(ivaIncluido(100, '21'), 17.36);
  for (const alicuota of ['0', 'exento', 'no_gravado']) assert.equal(ivaIncluido(500, alicuota), 0);

  assert.equal(letraQueCorresponde('responsable_inscripto', 'responsable_inscripto'), 'A');
  assert.equal(letraQueCorresponde('responsable_inscripto', 'monotributo'), 'A', 'RG 5003: A al monotributista');
  assert.equal(letraQueCorresponde('responsable_inscripto', null), 'B');
  assert.equal(letraQueCorresponde('responsable_inscripto', 'exento'), 'B');
  assert.equal(letraQueCorresponde('monotributo', 'responsable_inscripto'), 'C');
  assert.equal(letraQueCorresponde('exento', null), 'C');
  assert.equal(letraQueCorresponde(null, 'responsable_inscripto'), null, 'sin condición del negocio, a mano');
});

// Un negocio nuevo con su condición, tres servicios (sin stock) de distinta
// alícuota y un cliente de cada condición.
async function negocioConCatalogo(empresa, condicion_iva) {
  const nuevo = await registrarEmpresa(servidor, { empresa, usuario: empresa.toLowerCase().replace(/\W/g, '') });
  if (condicion_iva) assert.equal((await nuevo.put('/api/negocio', { condicion_iva })).status, 200);
  const servicio = async (nombre, precio_venta, alicuota_iva) =>
    (await nuevo.post('/api/productos', { nombre, precio_venta, alicuota_iva, tipo: 'servicio' })).json.id;
  const cliente = async (nombre, condicion) =>
    (await nuevo.post('/api/clientes', { nombre, condicion_iva: condicion })).json.id;
  return {
    admin: nuevo,
    general: await servicio('Instalación', 1210, '21'),
    reducida: await servicio('Flete', 1105, '10.5'),
    exento: await servicio('Curso', 500, 'exento'),
    final: await cliente('Juan', ''),
    inscripto: await cliente('Ferretería SA', 'responsable_inscripto'),
    monotributista: await cliente('Pedro Mono', 'monotributo')
  };
}

async function vender(n, cliente_id, items) {
  const r = await n.admin.post('/api/ventas', { cliente_id, items });
  assert.equal(r.status, 201, r.texto);
  return r.json.id;
}

async function facturar(n, ventaId, cuerpo = {}) {
  const r = await n.admin.post(`/api/ventas/${ventaId}/facturar`, { condicion: 'efectivo', ...cuerpo });
  assert.equal(r.status, 201, r.texto);
  return (await n.admin.get(`/api/facturas/${r.json.id}`)).json;
}

test('inscripto: cada renglón guarda su IVA, y la letra sale sola', async () => {
  const n = await negocioConCatalogo('Inscripto SRL', 'responsable_inscripto');
  const ventaId = await vender(n, n.final, [
    { producto_id: n.general, cantidad: 2, precio_unitario: 1210 },
    { producto_id: n.reducida, cantidad: 1, precio_unitario: 1105 },
    { producto_id: n.exento, cantidad: 1, precio_unitario: 500 }
  ]);
  const venta = (await n.admin.get(`/api/ventas/${ventaId}`)).json;
  assert.deepEqual(
    venta.items.map((i) => [i.alicuota_iva, i.iva]),
    [['21', 420], ['10.5', 105], ['exento', 0]]
  );
  assert.equal(venta.iva, 525);

  // Al consumidor final, B aunque se pida A.
  const b = await facturar(n, ventaId, { letra: 'A' });
  assert.equal(b.letra, 'B');
  assert.equal(b.neto, 4025);
  assert.equal(b.iva, 525);

  const aInscripto = await facturar(n, await vender(n, n.inscripto, [{ producto_id: n.general, cantidad: 1, precio_unitario: 1210 }]));
  assert.equal(aInscripto.letra, 'A');
  assert.equal(aInscripto.iva, 210);
  assert.equal(aInscripto.numero, 1, 'la A tiene su propia numeración');
  const aMono = await facturar(n, await vender(n, n.monotributista, [{ producto_id: n.general, cantidad: 1, precio_unitario: 1210 }]));
  assert.equal(aMono.letra, 'A');
  assert.equal(aMono.numero, 2);

  // La alícuota queda congelada: cambiar la del producto no toca la venta.
  await n.admin.patch(`/api/productos/${n.general}`, { alicuota_iva: '27' });
  assert.equal((await n.admin.get(`/api/ventas/${ventaId}`)).json.items[0].alicuota_iva, '21');

  // El presupuesto también guarda el suyo.
  const presupuesto = await n.admin.post('/api/presupuestos', {
    cliente_id: n.final,
    items: [{ producto_id: n.reducida, cantidad: 2, precio_unitario: 1105 }]
  });
  assert.equal(presupuesto.status, 201, presupuesto.texto);
  const cotizado = (await n.admin.get(`/api/presupuestos/${presupuesto.json.id}`)).json;
  assert.equal(cotizado.items[0].alicuota_iva, '10.5');
  assert.equal(cotizado.iva, 210);

  // La factura suelta, sin renglones: 21 % si no se elige.
  const suelta = await n.admin.post('/api/facturas', {
    cliente: 'Ferretería SA',
    concepto: 'Asesoría',
    neto: 2420,
    condicion: 'efectivo'
  });
  assert.equal(suelta.status, 201, suelta.texto);
  const sueltaVista = (await n.admin.get(`/api/facturas/${suelta.json.id}`)).json;
  assert.equal(sueltaVista.letra, 'A');
  assert.equal(sueltaVista.iva, 420);
});

test('la nota de crédito lleva la letra de la factura y el IVA de lo devuelto', async () => {
  const n = await negocioConCatalogo('Devoluciones SA', 'responsable_inscripto');
  const ventaId = await vender(n, n.inscripto, [{ producto_id: n.general, cantidad: 3, precio_unitario: 1210 }]);
  assert.equal((await facturar(n, ventaId)).letra, 'A');

  const venta = (await n.admin.get(`/api/ventas/${ventaId}`)).json;
  const devolucion = await n.admin.post('/api/devoluciones', {
    venta_id: ventaId,
    items: [{ venta_item_id: venta.items[0].id, cantidad: 1, vuelve_stock: false }],
    motivo: 'No se hizo'
  });
  assert.equal(devolucion.status, 201, devolucion.texto);

  const nota = await n.admin.post(`/api/devoluciones/${devolucion.json.id}/nota-credito`, { letra: 'B' });
  assert.equal(nota.status, 201, nota.texto);
  const vista = (await n.admin.get(`/api/facturas/${nota.json.id}`)).json;
  assert.equal(vista.tipo, 'nota_credito');
  assert.equal(vista.letra, 'A');
  assert.equal(vista.neto, 1210);
  assert.equal(vista.iva, 210);
});

test('monotributo factura C sin IVA; sin condición, la letra se elige a mano', async () => {
  const mono = await negocioConCatalogo('Mono Kiosco', 'monotributo');
  const ventaMono = await vender(mono, mono.inscripto, [{ producto_id: mono.general, cantidad: 1, precio_unitario: 1210 }]);
  const venta = (await mono.admin.get(`/api/ventas/${ventaMono}`)).json;
  assert.equal(venta.items[0].alicuota_iva, null);
  assert.equal(venta.items[0].iva, 0);
  const c = await facturar(mono, ventaMono, { letra: 'A' });
  assert.equal(c.letra, 'C');
  assert.equal(c.iva, 0);

  const sin = await negocioConCatalogo('Sin Datos', null);
  const ventaSin = await vender(sin, sin.final, [{ producto_id: sin.general, cantidad: 1, precio_unitario: 1210 }]);
  const elegida = await facturar(sin, ventaSin, { letra: 'A' });
  assert.equal(elegida.letra, 'A');
  assert.equal(elegida.iva, 0);

  // Ya inscripto, la venta nueva discrimina.
  assert.equal((await sin.admin.put('/api/negocio', { condicion_iva: 'responsable_inscripto' })).status, 200);
  const nueva = await vender(sin, sin.final, [{ producto_id: sin.general, cantidad: 1, precio_unitario: 1210 }]);
  assert.equal((await sin.admin.get(`/api/ventas/${nueva}`)).json.items[0].alicuota_iva, '21');
});
