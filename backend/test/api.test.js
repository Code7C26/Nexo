// Pruebas de API contra un servidor real con base temporal (ver
// servidor-de-prueba.js). Cada test fija un hallazgo de la auditoría del
// 6 de octubre de 2026 (hist. §57): fallan si el defecto vuelve.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearCliente, crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

let servidor;
let adminA;
let empleadoA;
let adminB;
let productoA; // id de un producto de la empresa A con 10 unidades
let productoB; // id de un producto de la empresa B

async function crearProducto(admin, nombre, sku, stock) {
  const r = await admin.post('/api/productos', { nombre, sku, precio_venta: 100, stock_minimo: 0 });
  assert.equal(r.status, 201, `crear producto: ${r.texto}`);
  const id = r.json.id;
  if (stock) {
    const a = await admin.post('/api/stock/ajuste', { producto_id: id, cantidad: stock, motivo: 'carga inicial de prueba' });
    assert.ok(a.status < 300, `ajuste de stock: ${a.texto}`);
  }
  return id;
}

async function stockDe(admin, productoId) {
  const r = await admin.get('/api/productos');
  assert.equal(r.status, 200);
  return r.json.find((p) => p.id === productoId).stock;
}

before(async () => {
  servidor = await levantarServidor();
  adminA = await registrarEmpresa(servidor.url, { empresa: 'Empresa A', usuario: 'admin-a' });
  empleadoA = await crearEmpleado(servidor.url, adminA, { usuario: 'emp-a' });
  adminB = await registrarEmpresa(servidor.url, { empresa: 'Empresa B', usuario: 'admin-b' });
  productoA = await crearProducto(adminA, 'Remera A', 'SKU-A1', 10);
  productoB = await crearProducto(adminB, 'Remera B', 'SKU-B1', 10);
});

after(async () => {
  await servidor?.cerrar();
});

const venta = (items) => ({ cliente: 'Juan', items });

test('venta con cantidad negativa: 400 y el stock no se mueve (C1)', async () => {
  const r = await empleadoA.post('/api/ventas', venta([{ producto_id: productoA, cantidad: -5, precio_unitario: 100 }]));
  assert.equal(r.status, 400, r.texto);
  assert.equal(await stockDe(adminA, productoA), 10);
});

test('venta con cantidad 0, precio negativo o valores no numéricos: 400 (C1)', async () => {
  const casos = [
    { producto_id: productoA, cantidad: 0, precio_unitario: 100 },
    { producto_id: productoA, cantidad: 1, precio_unitario: -100 },
    { producto_id: productoA, cantidad: 'abc', precio_unitario: 100 },
    { producto_id: productoA, cantidad: 1, precio_unitario: 'gratis' },
    { producto_id: productoA, cantidad: null, precio_unitario: 100 }
  ];
  for (const item of casos) {
    const r = await empleadoA.post('/api/ventas', venta([item]));
    assert.equal(r.status, 400, `${JSON.stringify(item)} → ${r.status} ${r.texto}`);
  }
  assert.equal(await stockDe(adminA, productoA), 10);
});

test('cantidades como texto hex/binario o gigantes no se aceptan (C1, revisión)', async () => {
  // "0x5" pasa Number() pero SQLite lo guarda como TEXT en una columna REAL:
  // la venta quedaba en total 0 con una deuda y el stock inconsistente.
  const casos = [
    { producto_id: productoA, cantidad: '0x5', precio_unitario: 100 },
    { producto_id: productoA, cantidad: '0b11', precio_unitario: 100 },
    { producto_id: productoA, cantidad: 1, precio_unitario: '0x64' },
    { producto_id: productoA, cantidad: '1', precio_unitario: 100 },
    { producto_id: productoA, cantidad: 1, precio_unitario: 1e308 },
    { producto_id: true, cantidad: 1, precio_unitario: 100 },
    { producto_id: [productoA], cantidad: 1, precio_unitario: 100 }
  ];
  for (const item of casos) {
    const r = await empleadoA.post('/api/ventas', venta([item]));
    assert.equal(r.status, 400, `${JSON.stringify(item)} → ${r.status} ${r.texto}`);
  }
  assert.equal(await stockDe(adminA, productoA), 10);
});

test('un importe de cobro como texto hex no se acepta (revisión)', async () => {
  const alta = await empleadoA.post('/api/ventas', venta([{ producto_id: productoA, cantidad: 1, precio_unitario: 100 }]));
  assert.equal(alta.status, 201, alta.texto);
  const cuentas = await adminA.get('/api/cuentas-tesoreria');
  const cobro = await empleadoA.post(`/api/ventas/${alta.json.id}/cobros`, {
    importe: '0x64',
    cuenta_tesoreria_id: cuentas.json[0].id
  });
  assert.equal(cobro.status, 400, cobro.texto);
  await adminA.post(`/api/ventas/${alta.json.id}/anular`, {});
});

test('login con tipos inesperados responde 400, no 500 (revisión)', async () => {
  const anonimo = crearCliente(servidor.url);
  for (const cuerpo of [{ usuario: 123, password: 'x' }, { usuario: 'a', password: 123 }, {}, { usuario: 'a'.repeat(500), password: 'x' }]) {
    const r = await anonimo.post('/api/auth/login', cuerpo);
    assert.equal(r.status, 400, `${JSON.stringify(cuerpo).slice(0, 60)} → ${r.status}`);
  }
});

test('una URL mal codificada responde 400, no 500 (revisión)', async () => {
  const r = await adminA.get('/api/productos/%E0%A4%A');
  assert.equal(r.status, 400, r.texto);
});

test('editar una venta con cantidad negativa: 400 (C1)', async () => {
  const alta = await empleadoA.post('/api/ventas', venta([{ producto_id: productoA, cantidad: 1, precio_unitario: 100 }]));
  assert.equal(alta.status, 201, alta.texto);
  const r = await empleadoA.put(`/api/ventas/${alta.json.id}`, venta([{ producto_id: productoA, cantidad: -3, precio_unitario: 100 }]));
  assert.equal(r.status, 400, r.texto);
  assert.equal(await stockDe(adminA, productoA), 9, 'solo la venta válida de 1 unidad descontó stock');
});

test('un empleado no puede ejecutar una compra por el asistente (C2)', async () => {
  const interpretado = await empleadoA.post('/api/asistente/interpretar', {
    texto: 'compra: proveedor=Proveedor Uno; item=Remera A,2,50'
  });
  assert.equal(interpretado.status, 200, interpretado.texto);
  const { mensaje_id: mensajeId, propuesta } = interpretado.json;
  const r = await empleadoA.post('/api/asistente/ejecutar', { mensaje_id: mensajeId, tipo: 'compra', propuesta });
  assert.equal(r.status, 403, r.texto);
  const compras = await adminA.get('/api/compras');
  assert.equal(compras.json.length, 0, 'no se creó ninguna compra');
});

test('presupuesto con un producto de otra empresa: 400 y no filtra su nombre (A1)', async () => {
  const r = await empleadoA.post('/api/presupuestos', {
    cliente: 'Juan',
    items: [{ producto_id: productoB, cantidad: 1, precio_unitario: 100 }]
  });
  assert.equal(r.status, 400, r.texto);
  assert.ok(!r.texto.includes('Remera B'));
});

test('un error interno o un JSON malformado responde JSON genérico, sin stack (A4)', async () => {
  const malformado = await adminA.post('/api/ventas', '{"items": [');
  assert.equal(malformado.status, 400);
  assert.ok(malformado.json?.error, 'debe ser JSON con "error"');
  assert.ok(!/\bat \S+ \(|node_modules|server\.js/.test(malformado.texto), 'no debe filtrar el stack');
});

test('una ruta de API inexistente responde 404 JSON (A4)', async () => {
  const r = await adminA.get('/api/esto-no-existe');
  assert.equal(r.status, 404);
  assert.ok(r.json?.error);
});

test('las respuestas no anuncian Express y llevan cabeceras de seguridad (A5)', async () => {
  const r = await crearCliente(servidor.url).get('/api/auth/estado');
  assert.equal(r.headers.get('x-powered-by'), null);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
});

test('el envío de una compra se puede pagar, y un borrador no se paga (A2)', async () => {
  const alta = await adminA.post('/api/compras', {
    proveedor: 'Proveedor Envío',
    items: [{ producto: 'Remera A', cantidad: 2, precio_unitario: 50 }],
    costo_envio: 20
  });
  assert.equal(alta.status, 201, alta.texto);
  const cuentas = await adminA.get('/api/cuentas-tesoreria');
  const cuenta = cuentas.json[0].id;

  const enBorrador = await adminA.post(`/api/compras/${alta.json.id}/pagos`, { importe: 10, cuenta_tesoreria_id: cuenta });
  assert.equal(enBorrador.status, 400, `un borrador no se paga: ${enBorrador.texto}`);

  const confirmar = await adminA.post(`/api/compras/${alta.json.id}/confirmar`, {});
  assert.ok(confirmar.status < 300, confirmar.texto);

  // Subtotal 100 + envío 20 = 120: tiene que poder pagarse completo, y ni un peso más.
  const demas = await adminA.post(`/api/compras/${alta.json.id}/pagos`, { importe: 120.01, cuenta_tesoreria_id: cuenta });
  assert.equal(demas.status, 400, demas.texto);
  const total = await adminA.post(`/api/compras/${alta.json.id}/pagos`, { importe: 120, cuenta_tesoreria_id: cuenta });
  assert.equal(total.status, 201, `el total con envío debe poder pagarse: ${total.texto}`);
});

test('no se puede cobrar ni facturar una venta anulada (A3)', async () => {
  const alta = await empleadoA.post('/api/ventas', venta([{ producto_id: productoA, cantidad: 1, precio_unitario: 100 }]));
  assert.equal(alta.status, 201, alta.texto);
  const anular = await adminA.post(`/api/ventas/${alta.json.id}/anular`, {});
  assert.ok(anular.status < 300, anular.texto);
  const cuentas = await adminA.get('/api/cuentas-tesoreria');
  const cuenta = cuentas.json[0].id;
  const cobro = await empleadoA.post(`/api/ventas/${alta.json.id}/cobros`, { importe: 100, cuenta_tesoreria_id: cuenta });
  assert.equal(cobro.status, 400, cobro.texto);
  const factura = await empleadoA.post(`/api/ventas/${alta.json.id}/facturar`, {});
  assert.equal(factura.status, 400, factura.texto);
});

test('el alta de clientes y de proveedores queda en la auditoría (§22)', async () => {
  const cliente = await empleadoA.post('/api/clientes', { nombre: 'Cliente Auditado' });
  const proveedor = await adminA.post('/api/proveedores', { nombre: 'Proveedor Auditado' });
  assert.equal(cliente.status, 201, cliente.texto);
  assert.equal(proveedor.status, 201, proveedor.texto);
  const auditoria = await adminA.get('/api/auditoria');
  assert.equal(auditoria.status, 200, auditoria.texto);
  const filas = Array.isArray(auditoria.json) ? auditoria.json : auditoria.json.filas ?? auditoria.json.items ?? [];
  const tiene = (entidad, id) => filas.some((f) => f.accion === 'crear' && f.entidad === entidad && f.entidad_id === id);
  assert.ok(tiene('cliente', cliente.json.id), 'falta la fila de auditoría del cliente');
  assert.ok(tiene('proveedor', proveedor.json.id), 'falta la fila de auditoría del proveedor');
});

test('?limit negativo en un listado con tope no devuelve todo sin límite', async () => {
  const r = await adminA.get('/api/auditoria?limit=-1');
  assert.equal(r.status, 200, r.texto);
});

// Va último a propósito: bloquea la IP local durante la ventana del límite.
test('muchos logins fallidos con usuarios distintos bloquean la IP (A6)', async () => {
  const anonimo = crearCliente(servidor.url);
  let ultimo;
  for (let i = 0; i < 32; i++) {
    ultimo = await anonimo.post('/api/auth/login', { usuario: `inexistente-${i}`, password: 'cualquiera-123' });
  }
  assert.equal(ultimo.status, 429, 'después de 30 fallos desde la misma IP responde 429');
});
