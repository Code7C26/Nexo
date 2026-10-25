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

// Producto con una variante de talle `valor` y SKU `sku`; devuelve la respuesta del alta.
async function crearVariante(admin, productoId, valor, sku) {
  const atributos = await admin.get(`/api/productos/${productoId}/atributos`);
  let talle = atributos.json.find((a) => a.nombre === 'Talle');
  if (!talle) {
    const alta = await admin.post(`/api/productos/${productoId}/atributos`, { nombre: 'Talle' });
    assert.equal(alta.status, 201, `atributo: ${alta.texto}`);
    talle = alta.json;
  }
  const v = await admin.post(`/api/productos/${productoId}/atributos/${talle.id}/valores`, { valor });
  assert.equal(v.status, 201, `valor: ${v.texto}`);
  return admin.post(`/api/productos/${productoId}/variantes`, { valores: [{ atributo_id: talle.id, valor_id: v.json.id }], sku });
}

test('el SKU de producto y de variante es único por empresa, no en todo Nexo (hist. §64)', async () => {
  const mismoQueA = await adminB.post('/api/productos', { nombre: 'Otra remera', sku: 'SKU-A1', precio_venta: 100 });
  assert.equal(mismoQueA.status, 201, `B puede usar un SKU de A: ${mismoQueA.texto}`);
  const repetido = await adminB.post('/api/productos', { nombre: 'Tercera remera', sku: 'SKU-A1', precio_venta: 100 });
  assert.equal(repetido.status, 400, repetido.texto);
  assert.match(repetido.json.error, /SKU/);

  // Productos propios: con variantes, los de las demás pruebas ya no se venden sin elegir una.
  const gorraA = await crearProducto(adminA, 'Gorra A', null, 0);
  const gorraB = await crearProducto(adminB, 'Gorra B', null, 0);
  const varianteA = await crearVariante(adminA, gorraA, 'S', 'VAR-1');
  assert.equal(varianteA.status, 201, varianteA.texto);
  const varianteB = await crearVariante(adminB, gorraB, 'S', 'VAR-1');
  assert.equal(varianteB.status, 201, `B puede usar un SKU de variante de A: ${varianteB.texto}`);
  const varianteRepetida = await crearVariante(adminB, gorraB, 'M', 'VAR-1');
  assert.equal(varianteRepetida.status, 400, varianteRepetida.texto);
  assert.match(varianteRepetida.json.error, /SKU/);
});

test('una factura suelta con datos fuera de lo válido responde 400, no 500', async () => {
  const base = { cliente: 'Juan', concepto: 'Servicio', neto: 1000, condicion: 'efectivo' };
  const casos = [
    { condicion: 'cheque' },
    { tipo: 'recibo' },
    { letra: 'Z' },
    { neto: 0 },
    { neto: '1000' },
    { concepto: '' },
    { punto_venta: 1.5 },
    { cliente: '' }
  ];
  for (const caso of casos) {
    const r = await empleadoA.post('/api/facturas', { ...base, ...caso });
    assert.equal(r.status, 400, `${JSON.stringify(caso)}: ${r.texto}`);
  }
  const ok = await empleadoA.post('/api/facturas', base);
  assert.equal(ok.status, 201, ok.texto);
});

test('una venta sin cliente, o con un cliente de otra empresa, responde 400 y no se crea', async () => {
  const items = [{ producto_id: productoA, cantidad: 1, precio_unitario: 100 }];
  const clienteB = await adminB.post('/api/clientes', { nombre: 'Cliente de B' });
  assert.equal(clienteB.status, 201, clienteB.texto);
  const ventasAntes = (await adminA.get('/api/ventas')).json.length;
  const stockAntes = await stockDe(adminA, productoA);
  for (const cuerpo of [{ items }, { cliente: '   ', items }, { cliente_id: clienteB.json.id, items }]) {
    const r = await empleadoA.post('/api/ventas', cuerpo);
    assert.equal(r.status, 400, `${JSON.stringify(cuerpo)}: ${r.texto}`);
    assert.ok(!r.texto.includes('Cliente de B'));
  }
  assert.equal((await adminA.get('/api/ventas')).json.length, ventasAntes);
  assert.equal(await stockDe(adminA, productoA), stockAntes);
});

test('punto de venta: turno de caja con arqueo, cobro mixto y aislamiento (hist. §67)', async () => {
  const cuentas = (await adminA.get('/api/cuentas-tesoreria')).json;
  const efectivo = cuentas.find((c) => c.tipo === 'efectivo');
  const banco = cuentas.find((c) => c.tipo === 'banco');
  const item = { producto_id: productoA, cantidad: 1, precio_unitario: 100 };

  // Sin turno no se vende; el turno es solo para cuentas de efectivo.
  assert.equal((await empleadoA.post('/api/pos/ventas', { items: [item], cobros: [] })).status, 400);
  assert.equal((await empleadoA.post('/api/turnos-caja', { cuenta_tesoreria_id: banco.id, contado: 0 })).status, 400);

  // Apertura con $100 de más: queda registrada la diferencia y el saldo pasa a lo contado.
  const previo = await empleadoA.post('/api/turnos-caja', { cuenta_tesoreria_id: efectivo.id, contado: 0 });
  assert.equal(previo.status, 201, previo.texto);
  const saldoInicial = previo.json.esperado_apertura + previo.json.diferencia_apertura;
  assert.equal(saldoInicial, 0);
  await empleadoA.post(`/api/turnos-caja/${previo.json.id}/cerrar`, { contado: 0 });
  const abierto = await empleadoA.post('/api/turnos-caja', { cuenta_tesoreria_id: efectivo.id, contado: 100 });
  assert.equal(abierto.status, 201, abierto.texto);
  const turno = abierto.json;
  assert.equal(turno.diferencia_apertura, 100);
  assert.equal(turno.esperado, 100);
  const otro = await empleadoA.post('/api/turnos-caja', { cuenta_tesoreria_id: efectivo.id, contado: 100 });
  assert.equal(otro.status, 400, 'un solo turno abierto por caja');

  // Catálogo: los productos de la empresa, con precio y stock; nada de la otra.
  const catalogo = (await empleadoA.get('/api/pos/catalogo')).json;
  assert.ok(catalogo.some((c) => c.producto_id === productoA && c.precio === 100));
  assert.ok(!catalogo.some((c) => c.producto_id === productoB));

  // Cobro mixto: $60 efectivo + $40 banco, sin cliente → Consumidor final.
  const stockAntes = await stockDe(adminA, productoA);
  const mixta = await empleadoA.post('/api/pos/ventas', {
    turno_caja_id: turno.id,
    items: [item],
    cobros: [
      { cuenta_tesoreria_id: efectivo.id, importe: 60 },
      { cuenta_tesoreria_id: banco.id, importe: 40 }
    ]
  });
  assert.equal(mixta.status, 201, mixta.texto);
  assert.equal(await stockDe(adminA, productoA), stockAntes - 1);
  const venta = (await adminA.get(`/api/ventas/${mixta.json.id}`)).json;
  assert.equal(venta.cliente ?? venta.cliente_nombre, 'Consumidor final');

  // Más de lo que vale: 400. Menos sin cliente: 400. Menos con cliente: el resto queda a cuenta.
  const cobrosDeMas = [{ cuenta_tesoreria_id: efectivo.id, importe: 150 }];
  assert.equal((await empleadoA.post('/api/pos/ventas', { turno_caja_id: turno.id, items: [item], cobros: cobrosDeMas })).status, 400);
  const parcial = [{ cuenta_tesoreria_id: efectivo.id, importe: 30 }];
  assert.equal((await empleadoA.post('/api/pos/ventas', { turno_caja_id: turno.id, items: [item], cobros: parcial })).status, 400);
  const conIdDeConsumidorFinal = { turno_caja_id: turno.id, cliente_id: venta.cliente_id, items: [item], cobros: parcial };
  assert.ok(venta.cliente_id);
  assert.equal((await empleadoA.post('/api/pos/ventas', conIdDeConsumidorFinal)).status, 400, 'tampoco se le fía con su id');
  const cliente = await empleadoA.post('/api/clientes', { nombre: 'Cliente POS' });
  const fiado = await empleadoA.post('/api/pos/ventas', { turno_caja_id: turno.id, cliente_id: cliente.json.id, items: [item], cobros: parcial });
  assert.equal(fiado.status, 201, fiado.texto);

  // Resumen: 2 ventas por $200; a la caja entraron $90 en efectivo.
  const resumen = (await empleadoA.get(`/api/turnos-caja/${turno.id}`)).json;
  assert.deepEqual(resumen.ventas, { cantidad: 2, total: 200 });
  assert.equal(resumen.movimientos.cobros, 90);
  assert.equal(resumen.esperado, 190);

  // La otra empresa no ve el turno, no vende con él y no abre caja en una cuenta ajena.
  assert.equal((await adminB.get(`/api/turnos-caja/${turno.id}`)).status, 404);
  assert.equal((await adminB.post('/api/pos/ventas', { turno_caja_id: turno.id, items: [{ ...item, producto_id: productoB }], cobros: [] })).status, 400);
  assert.equal((await adminB.post('/api/turnos-caja', { cuenta_tesoreria_id: efectivo.id, contado: 0 })).status, 400);
  assert.equal((await adminB.post(`/api/turnos-caja/${turno.id}/cerrar`, { contado: 0 })).status, 404);

  // Cierre con $10 de menos: la diferencia queda registrada y el turno no admite más ventas.
  const cierre = await empleadoA.post(`/api/turnos-caja/${turno.id}/cerrar`, { contado: 180 });
  assert.equal(cierre.status, 200, cierre.texto);
  assert.equal(cierre.json.estado, 'cerrado');
  assert.equal(cierre.json.diferencia_cierre, -10);
  assert.equal((await empleadoA.post(`/api/turnos-caja/${turno.id}/cerrar`, { contado: 180 })).status, 400);
  assert.equal((await empleadoA.post('/api/pos/ventas', { turno_caja_id: turno.id, items: [item], cobros: [] })).status, 400);
  const nuevo = await empleadoA.post('/api/turnos-caja', { cuenta_tesoreria_id: efectivo.id, contado: 180 });
  assert.equal(nuevo.json.esperado_apertura, 180, 'después del arqueo, el saldo de la caja es lo contado');
  await empleadoA.post(`/api/turnos-caja/${nuevo.json.id}/cerrar`, { contado: 180 });
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

test('unidades con decimales, servicios sin stock y tipo de negocio (hist. §70)', async () => {
  // Por kg: se vende con decimales y el stock baja en kg.
  const vacio = await adminA.post('/api/productos', { nombre: 'Vacío', precio_venta: 8000, unidad: 'kg' });
  assert.equal(vacio.status, 201, vacio.texto);
  assert.equal((await adminA.post('/api/productos', { nombre: 'Huevos', unidad: 'docena' })).status, 400);
  await adminA.post('/api/stock/ajuste', { producto_id: vacio.json.id, cantidad: 10 });
  const porKilo = await empleadoA.post('/api/ventas', venta([{ producto_id: vacio.json.id, cantidad: 1.25, precio_unitario: 8000 }]));
  assert.equal(porKilo.status, 201, porKilo.texto);
  assert.equal(await stockDe(adminA, vacio.json.id), 8.75);

  // Un servicio se vende sin stock y no lo mueve; no se compra ni se ajusta.
  const clase = await adminA.post('/api/productos', { nombre: 'Clase suelta', precio_venta: 5000, tipo: 'servicio' });
  assert.equal(clase.status, 201, clase.texto);
  const deServicio = await empleadoA.post('/api/ventas', venta([{ producto_id: clase.json.id, cantidad: 2, precio_unitario: 5000 }]));
  assert.equal(deServicio.status, 201, deServicio.texto);
  assert.equal(await stockDe(adminA, clase.json.id), 0);
  assert.equal((await adminA.post(`/api/ventas/${deServicio.json.id}/anular`, {})).status, 200);
  assert.equal(await stockDe(adminA, clase.json.id), 0, 'anular un servicio tampoco mueve stock');
  assert.equal((await adminA.post('/api/stock/ajuste', { producto_id: clase.json.id, cantidad: 1 })).status, 400);
  const compra = await adminA.post('/api/compras', {
    proveedor: 'Proveedor servicios',
    items: [{ producto: 'Clase suelta', cantidad: 1, precio_unitario: 100 }]
  });
  assert.equal(compra.status, 400, compra.texto);
  // Con stock no se pasa a servicio: se perdería de vista.
  assert.equal((await adminA.patch(`/api/productos/${vacio.json.id}`, { tipo: 'servicio' })).status, 400);

  // Tipo de negocio: preset de unidad para lo que se da de alta. Cambiarlo no
  // toca los módulos (hist. §88): siguen los que tenía.
  const negocio = (await adminA.get('/api/negocio')).json;
  assert.equal(negocio.rubro, 'comercio');
  assert.deepEqual(negocio.modulos, ['pos', 'presupuestos', 'compras', 'stock']);
  const comoCarniceria = await adminA.put('/api/negocio', { nombre: negocio.nombre, rubro: 'carniceria' });
  assert.equal(comoCarniceria.status, 200, comoCarniceria.texto);
  const carniceria = (await empleadoA.get('/api/negocio')).json;
  assert.deepEqual(carniceria.modulos, ['pos', 'presupuestos', 'compras', 'stock']);
  assert.equal(carniceria.unidad_defecto, 'kg');
  const asado = await adminA.post('/api/productos', { nombre: 'Asado', precio_venta: 9000 });
  assert.equal((await adminA.get('/api/productos')).json.find((p) => p.id === asado.json.id).unidad, 'kg');
  await adminA.put('/api/negocio', { nombre: negocio.nombre, modulos: ['pos'] });
  assert.deepEqual((await adminA.get('/api/negocio')).json.modulos, ['pos']);
  assert.equal((await adminA.put('/api/negocio', { nombre: negocio.nombre, rubro: 'astronauta' })).status, 400);
  assert.equal((await adminA.put('/api/negocio', { nombre: negocio.nombre, modulos: ['naves'] })).status, 400);
  assert.equal((await empleadoA.put('/api/negocio', { nombre: negocio.nombre, rubro: 'comercio' })).status, 403);
  // Volver a comercio tampoco los toca, y apagarlos todos es un valor válido.
  await adminA.put('/api/negocio', { nombre: negocio.nombre, rubro: 'comercio' });
  assert.deepEqual((await adminA.get('/api/negocio')).json.modulos, ['pos']);
  await adminA.put('/api/negocio', { modulos: [] });
  assert.deepEqual((await adminA.get('/api/negocio')).json.modulos, []);
  await adminA.put('/api/negocio', { modulos: ['pos', 'presupuestos', 'compras', 'stock'] });
});

test('datos del negocio: actualización parcial, CUIT y condición fiscal (hist. §73)', async () => {
  const completo = await adminB.put('/api/negocio', {
    nombre: 'Empresa B',
    documento: '20 12345678 6',
    condicion_iva: 'monotributo',
    direccion: 'Av. Siempreviva 742',
    telefono: '11 5555-0000',
    email: 'hola@empresab.com.ar',
    pie_comprobante: 'Gracias por su compra'
  });
  assert.equal(completo.status, 200, completo.texto);
  // Cada página de Configuración manda solo lo suyo: antes, lo que no venía se
  // borraba.
  assert.equal((await adminB.put('/api/negocio', { telefono: '11 4444-0000' })).status, 200);
  const negocio = (await adminB.get('/api/negocio')).json;
  assert.equal(negocio.telefono, '11 4444-0000');
  assert.equal(negocio.nombre, 'Empresa B');
  assert.equal(negocio.documento, '20-12345678-6', 'el CUIT se guarda con guiones');
  assert.equal(negocio.condicion_iva, 'monotributo');
  assert.equal(negocio.direccion, 'Av. Siempreviva 742');
  assert.equal(negocio.pie_comprobante, 'Gracias por su compra');
  await adminB.put('/api/negocio', { pie_comprobante: '  ' });
  assert.equal((await adminB.get('/api/negocio')).json.pie_comprobante, null, 'vaciar un campo lo pasa a NULL');

  for (const [cuerpo, motivo] of [
    [{ documento: '20-12345678-5' }, 'dígito verificador malo'],
    [{ documento: '20-1234567-6' }, 'CUIT corto'],
    [{ condicion_iva: 'Responsable Inscripto' }, 'condición fuera de la lista'],
    [{ email: 'sin-arroba' }, 'email'],
    [{ nombre: '' }, 'nombre vacío'],
    [{ nombre: 'x'.repeat(121) }, 'nombre largo'],
    [{ direccion: { calle: 'Falsa' } }, 'tipo inválido'],
    [{ rubro: 'constructor' }, 'clave del prototipo'],
    [{ rubro: ['comercio'] }, 'array'],
    [{ rubro: 'peluqueria' }, 'tipo "Próximamente"']
  ]) {
    assert.equal((await adminB.put('/api/negocio', cuerpo)).status, 400, motivo);
  }
  assert.equal((await adminB.get('/api/negocio')).json.documento, '20-12345678-6', 'un PUT rechazado no cambia nada');

  // Un gimnasio también compra y vende (hist. §71): sus productos nacen como
  // producto, no como servicio.
  // Los módulos del tipo nuevo se suman a mano (hist. §88).
  await adminB.put('/api/negocio', { rubro: 'gimnasio', modulos: ['pos', 'compras', 'stock', 'socios'] });
  const gimnasio = (await adminB.get('/api/negocio')).json;
  assert.deepEqual(gimnasio.modulos, ['pos', 'compras', 'stock', 'socios']);
  assert.equal(gimnasio.tipo_defecto, 'producto');
  assert.ok(gimnasio.perfiles.tipos.some((t) => t.clave === 'gimnasio' && t.icono && t.descripcion));
  await adminB.put('/api/negocio', { rubro: 'comercio' });
});

test('socios: planes con duraciones, cuotas sin cron, cobro, ingreso, baja y aislamiento (hist. §74 y §75)', async () => {
  const hoy = new Date().toLocaleDateString('sv-SE');
  const haceDias = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toLocaleDateString('sv-SE');
  };
  const opcion = (plan, meses) => plan.opciones.find((o) => o.meses === meses);

  // El plan es admin y nace con su servicio y sus duraciones.
  const pedido = { nombre: 'Pase libre', opciones: [{ meses: 1, precio: 30000 }, { meses: 3, precio: 81000 }] };
  assert.equal((await empleadoA.post('/api/planes-socio', pedido)).status, 403);
  for (const cuerpo of [
    { nombre: '', opciones: [{ meses: 1, precio: 30000 }] },
    { nombre: 'Sin duraciones', opciones: [] },
    { nombre: 'Gratis', opciones: [{ meses: 1, precio: 0 }] },
    { nombre: 'Larguísimo', opciones: [{ meses: 37, precio: 1000 }] },
    { nombre: 'Medio mes', opciones: [{ meses: 0.5, precio: 1000 }] },
    { nombre: 'Repetido', opciones: [{ meses: 2, precio: 1000 }, { meses: 2, precio: 1500 }] },
    { nombre: 'Texto', opciones: [{ meses: 1, precio: '30000' }] }
  ]) {
    assert.equal((await adminA.post('/api/planes-socio', cuerpo)).status, 400, JSON.stringify(cuerpo));
  }
  const pase = (await adminA.post('/api/planes-socio', pedido)).json;
  assert.deepEqual(pase.opciones.map((o) => o.duracion), ['Mensual', 'Trimestral']);
  assert.equal((await adminA.post('/api/planes-socio', { ...pedido, nombre: 'pase libre' })).status, 400, 'nombre repetido');
  const funcional = (await adminA.post('/api/planes-socio', { nombre: 'Funcional', opciones: [{ meses: 1, precio: 20000 }, { meses: 2, precio: 38000 }] })).json;
  const productos = (await adminA.get('/api/productos')).json;
  const servicio = productos.find((p) => p.id === pase.producto_id);
  assert.equal(servicio.tipo, 'servicio');
  assert.equal(servicio.precio_venta, 30000, 'el catálogo muestra el precio de la duración más corta');
  // El servicio de un plan no pasa a tener stock ni cambia de precio desde Productos.
  assert.equal((await adminA.patch(`/api/productos/${pase.producto_id}`, { tipo: 'producto' })).status, 400);
  assert.equal((await adminA.patch(`/api/productos/${pase.producto_id}`, { precio_venta: 1 })).status, 400);
  assert.equal((await adminA.patch(`/api/productos/${pase.producto_id}`, { nombre: 'Pase libre', precio_venta: 30000 })).status, 200);
  assert.ok(!(await empleadoA.get('/api/pos/catalogo')).json.some((i) => i.producto_id === pase.producto_id));

  // Editar las duraciones: una nueva, otra que cambia de precio y una que se
  // saca (queda pausada, no se borra).
  const editado = await adminA.patch(`/api/planes-socio/${pase.id}`, {
    opciones: [{ meses: 1, precio: 32000 }, { meses: 12, precio: 300000 }]
  });
  assert.equal(editado.status, 200, editado.texto);
  assert.deepEqual(editado.json.opciones.map((o) => [o.meses, o.precio, o.activo]), [[1, 32000, true], [3, 81000, false], [12, 300000, true]]);
  await adminA.patch(`/api/planes-socio/${pase.id}`, { opciones: [{ meses: 1, precio: 32000 }, { meses: 3, precio: 85000 }, { meses: 12, precio: 300000 }] });
  const planes = (await empleadoA.get('/api/planes-socio')).json;
  const paseLibre = planes.find((p) => p.id === pase.id);

  // Descuentos: combo, por cantidad y a mano. Son admin.
  const combo = { nombre: 'Combo pase + funcional', porcentaje: 15, aplica: 'combo', planes: [pase.id, funcional.id] };
  assert.equal((await empleadoA.post('/api/descuentos-socio', combo)).status, 403);
  for (const cuerpo of [
    { ...combo, planes: [pase.id] },
    { ...combo, planes: [pase.id, pase.id] },
    { ...combo, porcentaje: 0 },
    { ...combo, porcentaje: 101 },
    { nombre: 'Muchos', porcentaje: 10, aplica: 'cantidad', minimo_planes: 1 },
    { nombre: 'Raro', porcentaje: 10, aplica: 'siempre' }
  ]) {
    assert.equal((await adminA.post('/api/descuentos-socio', cuerpo)).status, 400, JSON.stringify(cuerpo));
  }
  assert.equal((await adminA.post('/api/descuentos-socio', combo)).status, 201);
  const familiar = (await adminA.post('/api/descuentos-socio', { nombre: 'Familiar', porcentaje: 20, aplica: 'manual' })).json;

  // Alta con dos planes: el combo baja las dos cuotas, y la cotización dice
  // lo mismo antes de confirmar.
  const planesDeLucia = [{ opcion_id: opcion(paseLibre, 1).id }, { opcion_id: opcion(funcional, 2).id }];
  const cotizacion = (await empleadoA.post('/api/socios/cotizacion', { planes: planesDeLucia })).json;
  assert.deepEqual(cotizacion.lineas.map((l) => [l.precio, l.descuento?.porcentaje]), [[27200, 15], [32300, 15]]);
  assert.equal(cotizacion.total, 59500);
  const alta = await empleadoA.post('/api/socios', {
    cliente: { nombre: 'Lucía Gómez', documento: '30111222', telefono: '341 555-0101' },
    planes: planesDeLucia
  });
  assert.equal(alta.status, 201, alta.texto);
  const socio = alta.json;
  assert.equal(socio.numero, 1);
  assert.equal(socio.situacion, 'debe');
  assert.equal(socio.deuda, 59500);
  assert.equal(socio.planes.length, 2);
  assert.deepEqual(socio.cuotas.map((c) => c.desde), [hoy, hoy]);
  assert.ok(socio.cuotas.every((c) => c.descuento_pct === 15));
  assert.equal(socio.saldo_cuenta, 59500, 'las cuotas son ventas en su cuenta corriente');

  // Mirarlo muchas veces no genera cuotas de más.
  await empleadoA.get('/api/socios');
  await empleadoA.get('/api/socios');
  assert.equal((await empleadoA.get(`/api/socios/${socio.id}`)).json.cuotas.length, 2);

  // Rechazos del alta: mismo documento, ya es socio, el mismo plan dos veces,
  // sin planes y un plan de otra empresa.
  const otraVez = (cuerpo) => empleadoA.post('/api/socios', { cliente: { nombre: 'Otra' }, ...cuerpo });
  assert.equal((await otraVez({ cliente: { nombre: 'Otra', documento: '30111222' }, planes: planesDeLucia })).status, 400);
  assert.equal((await empleadoA.post('/api/socios', { cliente_id: socio.cliente_id, planes: planesDeLucia })).status, 400);
  assert.equal((await otraVez({ planes: [{ opcion_id: opcion(paseLibre, 1).id }, { opcion_id: opcion(paseLibre, 3).id }] })).status, 400);
  assert.equal((await otraVez({ planes: [] })).status, 400);
  const planB = (await adminB.post('/api/planes-socio', { nombre: 'Plan B', opciones: [{ meses: 1, precio: 1000 }] })).json;
  assert.equal((await otraVez({ planes: [{ opcion_id: planB.opciones[0].id }] })).status, 400);

  // Entra debiendo (lo dejan pasar igual), después paga y entra al día.
  const entra = await empleadoA.post(`/api/socios/${socio.id}/ingresos`, {});
  assert.equal(entra.status, 201, entra.texto);
  assert.equal(entra.json.al_dia, false);
  const efectivo = (await adminA.get('/api/cuentas-tesoreria')).json.find((c) => c.tipo === 'efectivo');
  const cobro = await empleadoA.post(`/api/socios/${socio.id}/cobros`, { cuenta_tesoreria_id: efectivo.id });
  assert.equal(cobro.status, 201, cobro.texto);
  assert.equal(cobro.json.cobrado, 59500);
  assert.equal(cobro.json.socio.situacion, 'al_dia');
  assert.ok(cobro.json.socio.al_dia_hasta > hoy);
  assert.equal(cobro.json.socio.saldo_cuenta, 0);
  assert.equal((await empleadoA.post(`/api/socios/${socio.id}/cobros`, { cuenta_tesoreria_id: efectivo.id })).status, 400, 'no debe nada');
  assert.equal((await empleadoA.post(`/api/socios/${socio.id}/ingresos`, {})).json.al_dia, true);
  assert.deepEqual((await empleadoA.get('/api/socios/ingresos')).json.map((i) => i.al_dia), [true, false]);

  // Cambiar la duración de un plan rige desde la próxima cuota: la de hoy no cambia.
  const planPase = socio.planes.find((p) => p.plan_id === pase.id);
  const cambio = await empleadoA.patch(`/api/socios/${socio.id}/planes/${planPase.id}`, { opcion_id: opcion(paseLibre, 3).id });
  assert.equal(cambio.status, 200, cambio.texto);
  assert.equal(cambio.json.planes.find((p) => p.id === planPase.id).duracion, 'Trimestral');
  assert.equal(cambio.json.cuotas.length, 2);
  assert.equal(cambio.json.deuda, 0);

  // Dejar un plan corta el combo para el otro; sumar uno que ya tiene activo
  // no se puede.
  const deja = await empleadoA.patch(`/api/socios/${socio.id}/planes/${planPase.id}`, { estado: 'baja' });
  assert.equal(deja.json.planes.find((p) => p.plan_id === funcional.id).descuento, null);
  assert.equal(deja.json.situacion, 'al_dia');
  assert.equal((await empleadoA.post(`/api/socios/${socio.id}/planes`, { opcion_id: opcion(funcional, 1).id })).status, 400, 'ya tiene funcional');

  // Descuento a mano: el mayor gana, nunca la suma.
  const conFamiliar = await empleadoA.patch(`/api/socios/${socio.id}`, { descuento_id: familiar.id });
  assert.equal(conFamiliar.status, 200, conFamiliar.texto);
  assert.equal(conFamiliar.json.planes.find((p) => p.plan_id === funcional.id).descuento.porcentaje, 20);
  const vuelvePase = await empleadoA.patch(`/api/socios/${socio.id}/planes/${planPase.id}`, { estado: 'activa' });
  assert.equal(vuelvePase.status, 200, vuelvePase.texto);
  const activos = vuelvePase.json.planes.filter((p) => p.estado === 'activa');
  assert.ok(activos.every((p) => p.descuento.porcentaje === 20), 'familiar 20% le gana al combo 15%');
  assert.equal(vuelvePase.json.cuotas.length, 2, 'no le cobra de nuevo el período que ya pagó');
  assert.equal((await empleadoA.patch(`/api/socios/${socio.id}`, { descuento_id: 999999 })).status, 400);

  // Por cantidad: 2 planes o más, 25%, le gana a los otros dos.
  await adminA.post('/api/descuentos-socio', { nombre: 'Dos o más', porcentaje: 25, aplica: 'cantidad', minimo_planes: 2 });
  const conCantidad = (await empleadoA.get(`/api/socios/${socio.id}`)).json;
  assert.ok(conCantidad.planes.every((p) => p.descuento.nombre === 'Dos o más'));

  // Un socio que ya venía: se cobra el período de hoy, no los meses de antes.
  const viejo = await empleadoA.post('/api/socios', {
    cliente: { nombre: 'Martín Ruiz' },
    planes: [{ opcion_id: opcion(paseLibre, 1).id }],
    fecha_alta: haceDias(75)
  });
  assert.equal(viejo.status, 201, viejo.texto);
  assert.equal(viejo.json.cuotas.length, 1);
  assert.ok(viejo.json.cuotas[0].desde <= hoy && viejo.json.cuotas[0].hasta >= hoy, JSON.stringify(viejo.json.cuotas[0]));
  for (const fecha of ['1999-12-31', '2026-13-01', 'mañana']) {
    const r = await otraVez({ planes: [{ opcion_id: opcion(paseLibre, 1).id }], fecha_alta: fecha });
    assert.equal(r.status, 400, fecha);
  }

  // Baja del socio entero: no entra, y vuelve con los mismos planes.
  const baja = await empleadoA.patch(`/api/socios/${socio.id}`, { estado: 'baja' });
  assert.equal(baja.status, 200, baja.texto);
  assert.equal(baja.json.situacion, 'baja');
  assert.equal((await empleadoA.post(`/api/socios/${socio.id}/ingresos`, {})).status, 400);
  const vuelve = await empleadoA.patch(`/api/socios/${socio.id}`, { estado: 'activo' });
  assert.equal(vuelve.status, 200, vuelve.texto);
  assert.equal(vuelve.json.planes.filter((p) => p.estado === 'activa').length, 2);
  assert.equal(vuelve.json.situacion, 'al_dia');

  // Plan pausado: no se ofrece a socios nuevos.
  assert.equal((await adminA.patch(`/api/planes-socio/${pase.id}`, { activo: false })).status, 200);
  assert.equal((await otraVez({ planes: [{ opcion_id: opcion(paseLibre, 1).id }] })).status, 400);
  await adminA.patch(`/api/planes-socio/${pase.id}`, { activo: true });

  // Otra empresa no ve ni toca nada de esto.
  assert.equal((await adminB.get(`/api/socios/${socio.id}`)).status, 404);
  assert.equal((await adminB.post(`/api/socios/${viejo.json.id}/cobros`, { cuenta_tesoreria_id: efectivo.id })).status, 404);
  assert.equal((await adminB.post(`/api/socios/${socio.id}/ingresos`, {})).status, 404);
  assert.equal((await adminB.patch(`/api/socios/${socio.id}/planes/${planPase.id}`, { estado: 'baja' })).status, 404);
  assert.equal((await adminB.patch(`/api/planes-socio/${pase.id}`, { nombre: 'Robado' })).status, 404);
  assert.equal((await adminB.patch(`/api/descuentos-socio/${familiar.id}`, { activo: false })).status, 404);
  assert.deepEqual((await adminB.get('/api/socios')).json, []);
  assert.equal((await adminB.post('/api/descuentos-socio', { ...combo, nombre: 'Ajeno' })).status, 400, 'combo con planes de otra empresa');
  const efectivoB = (await adminB.get('/api/cuentas-tesoreria')).json.find((c) => c.tipo === 'efectivo');
  assert.equal((await empleadoA.post(`/api/socios/${viejo.json.id}/cobros`, { cuenta_tesoreria_id: efectivoB.id })).status, 400);
});

// Va último a propósito: bloquea la IP local durante la ventana del límite.
test('varios negocios por cuenta: crear, cambiar, aislamiento y quién cambia la contraseña (hist. §77)', async () => {
  const idDe = async (cliente) => (await cliente.get('/api/auth/estado')).json.usuario;
  const orgA = (await idDe(adminA)).organizacion_id;
  const orgB = (await idDe(adminB)).organizacion_id;
  assert.ok(orgA && orgB && orgA !== orgB);

  // El empleado no crea negocios, y un tipo inválido no crea nada.
  assert.equal((await empleadoA.post('/api/negocios', { nombre: 'Kiosco del empleado' })).status, 403);
  const invalido = await adminA.post('/api/negocios', { nombre: 'Sin tipo', rubro: 'constructor' });
  assert.equal(invalido.status, 400, invalido.texto);
  assert.equal((await adminA.get('/api/negocios')).json.length, 1);

  // adminA crea un gimnasio: la sesión pasa a él, con el preset y sus catálogos.
  const alta = await adminA.post('/api/negocios', { nombre: 'Gimnasio A', rubro: 'gimnasio' });
  assert.equal(alta.status, 201, alta.texto);
  const orgG = alta.json.id;
  const negocio = await adminA.get('/api/negocio');
  assert.equal(negocio.json.id, orgG);
  assert.equal(negocio.json.nombre, 'Gimnasio A');
  assert.ok(negocio.json.modulos.includes('socios'));
  assert.equal((await idDe(adminA)).organizacion_id, orgG);
  assert.ok((await adminA.get('/api/depositos')).json.length >= 1);
  const lista = (await adminA.get('/api/negocios')).json;
  assert.equal(lista.length, 2);
  assert.deepEqual(
    lista.find((n) => n.id === orgG),
    { id: orgG, nombre: 'Gimnasio A', rubro: 'gimnasio', tipo: 'Gimnasio', rol: 'admin', actual: true }
  );
  assert.equal(lista.find((n) => n.id === orgA).actual, false);

  // En el negocio nuevo no hay nada de A: ni productos ni usuarios.
  assert.deepEqual((await adminA.get('/api/productos')).json, []);
  assert.deepEqual((await adminA.get('/api/usuarios')).json.map((u) => u.usuario), ['admin-a']);

  // De vuelta en A se ven sus productos.
  assert.equal((await adminA.post(`/api/negocios/${orgA}/entrar`)).status, 204);
  assert.ok((await adminA.get('/api/productos')).json.some((p) => p.id === productoA));

  // Un negocio ajeno o inexistente es 404, y la sesión sigue donde estaba.
  assert.equal((await adminA.post(`/api/negocios/${orgB}/entrar`)).status, 404);
  assert.equal((await adminA.post('/api/negocios/999999/entrar')).status, 404);
  assert.equal((await adminA.get('/api/negocio')).json.id, orgA);
  assert.equal((await empleadoA.post(`/api/negocios/${orgG}/entrar`)).status, 404);
  assert.equal((await empleadoA.get('/api/negocio')).json.id, orgA);
  assert.deepEqual((await empleadoA.get('/api/negocios')).json.map((n) => n.id), [orgA]);

  // El login entra al último negocio usado.
  assert.equal((await adminA.post(`/api/negocios/${orgG}/entrar`)).status, 204);
  const login = await crearCliente(servidor.url).post('/api/auth/login', { usuario: 'admin-a', password: 'clave-segura-1' });
  assert.equal(login.status, 200, login.texto);
  assert.equal(login.json.usuario.organizacion_id, orgG);
  assert.equal((await adminA.post(`/api/negocios/${orgA}/entrar`)).status, 204);

  // Pestaña vieja: el negocio que muestra no es el de la sesión.
  const vieja = await adminA.pedir('POST', '/api/clientes', { nombre: 'Cliente de la pestaña vieja' }, { 'X-Nexo-Negocio': String(orgG) });
  assert.equal(vieja.status, 409, vieja.texto);
  assert.equal(vieja.headers.get('x-nexo-negocio-cambiado'), '1');
  assert.ok(!(await adminA.get('/api/clientes')).json.some((c) => c.nombre === 'Cliente de la pestaña vieja'));
  assert.equal((await adminA.pedir('GET', '/api/clientes', undefined, { 'X-Nexo-Negocio': String(orgA) })).status, 200);
  // Lo que no depende del negocio activo no se corta.
  assert.equal((await adminA.pedir('GET', '/api/negocios', undefined, { 'X-Nexo-Negocio': String(orgG) })).status, 200);
  assert.equal((await adminA.pedir('POST', `/api/negocios/${orgA}/entrar`, {}, { 'X-Nexo-Negocio': String(orgG) })).status, 204);

  // Y es admin de A y se arma su propio negocio C.
  const y = await crearEmpleado(servidor.url, adminA, { usuario: 'y-a', nombre: 'Ye', rol: 'admin' });
  const yId = (await idDe(y)).id;
  const altaC = await y.post('/api/negocios', { nombre: 'Negocio de Ye', rubro: 'kiosco' });
  assert.equal(altaC.status, 201, altaC.texto);
  const orgC = altaC.json.id;

  // adminA no le cambia la contraseña ni el nombre: con eso entraría a C.
  const reset = await adminA.post(`/api/usuarios/${yId}/resetear-password`, { password: 'otra-clave-123' });
  assert.equal(reset.status, 409, reset.texto);
  assert.equal((await adminA.patch(`/api/usuarios/${yId}`, { nombre: 'Otro nombre' })).status, 409);
  assert.equal((await crearCliente(servidor.url).post('/api/auth/login', { usuario: 'y-a', password: 'clave-segura-2' })).status, 200);

  // El rol y la baja en A son solo de A: en C sigue siendo admin y trabajando.
  assert.equal((await adminA.patch(`/api/usuarios/${yId}`, { rol: 'empleado' })).status, 204);
  assert.equal((await y.get('/api/usuarios')).status, 200);
  assert.equal((await adminA.patch(`/api/usuarios/${yId}`, { activo: false })).status, 204);
  assert.equal((await y.get('/api/negocio')).json.id, orgC);
  assert.equal((await y.post(`/api/negocios/${orgA}/entrar`)).status, 404);
  assert.deepEqual((await y.get('/api/negocios')).json.map((n) => n.id), [orgC]);
  const loginY = await crearCliente(servidor.url).post('/api/auth/login', { usuario: 'y-a', password: 'clave-segura-2' });
  assert.equal(loginY.json?.usuario.organizacion_id, orgC, loginY.texto);

  // El último admin activo se cuenta por negocio: en A queda solo adminA.
  const yo = (await idDe(adminA)).id;
  assert.equal((await adminA.patch(`/api/usuarios/${yo}`, { rol: 'empleado' })).status, 409);
});

test('servicios: catálogo por hora, trabajos desde un presupuesto y terminar en venta (hist. §78)', async () => {
  // Un servicio por hora, con qué incluye y cuánto tarda.
  const servicio = await adminA.post('/api/productos', {
    nombre: 'Service de aire',
    precio_venta: 15000,
    tipo: 'servicio',
    unidad: 'hora',
    descripcion: 'Limpieza de filtros y carga de gas',
    duracion_minutos: 90
  });
  assert.equal(servicio.status, 201, servicio.texto);
  const enLista = (await adminA.get('/api/productos')).json.find((p) => p.id === servicio.json.id);
  assert.equal(enLista.unidad, 'hora');
  assert.equal(enLista.duracion_minutos, 90);
  assert.equal(enLista.descripcion, 'Limpieza de filtros y carga de gas');
  for (const duracion_minutos of [0, 1.5, 'mucho', 20000]) {
    const r = await adminA.patch(`/api/productos/${servicio.json.id}`, { duracion_minutos });
    assert.equal(r.status, 400, `duración ${duracion_minutos}: ${r.texto}`);
  }

  // El tipo Servicios llama "servicios" a su catálogo (mientras está vacío,
  // hist. §88) y sus trabajos se suman con el cambio de tipo.
  const nombreB = (await adminB.get('/api/negocio')).json.nombre;
  await adminB.put('/api/negocio', { nombre: nombreB, rubro: 'servicios', modulos: ['presupuestos', 'trabajos', 'abonos'] });
  const servicios = (await adminB.get('/api/negocio')).json;
  assert.deepEqual(servicios.catalogo, { plural: 'servicios', singular: 'servicio' });
  assert.deepEqual(servicios.modulos, ['presupuestos', 'trabajos', 'abonos']);
  await adminB.put('/api/negocio', { nombre: nombreB, rubro: 'comercio' });
  assert.deepEqual((await adminB.get('/api/negocio')).json.catalogo, { plural: 'productos', singular: 'producto' });

  // Del presupuesto sale el trabajo: el presupuesto queda aceptado y ya no se
  // convierte directo, ni se le programa un segundo trabajo.
  const presupuesto = await empleadoA.post('/api/presupuestos', {
    cliente: 'Lucía',
    items: [{ producto_id: servicio.json.id, cantidad: 2, precio_unitario: 15000 }]
  });
  assert.equal(presupuesto.status, 201, presupuesto.texto);
  const idEmpleado = (await empleadoA.get('/api/auth/estado')).json.usuario.id;
  assert.ok((await empleadoA.get('/api/trabajos/responsables')).json.some((r) => r.id === idEmpleado));
  const trabajo = await empleadoA.post('/api/trabajos', {
    presupuesto_id: presupuesto.json.id,
    fecha: '2026-11-02',
    hora: '10:30',
    responsable_id: idEmpleado
  });
  assert.equal(trabajo.status, 201, trabajo.texto);
  const programado = (await empleadoA.get(`/api/trabajos/${trabajo.json.id}`)).json;
  assert.equal(programado.titulo, 'Service de aire');
  assert.equal(programado.total, 30000);
  assert.equal(programado.items.length, 1);
  const presupuestoAceptado = (await empleadoA.get(`/api/presupuestos/${presupuesto.json.id}`)).json;
  assert.equal(presupuestoAceptado.estado, 'aceptado');
  assert.equal(presupuestoAceptado.trabajo_id, trabajo.json.id);
  assert.equal((await empleadoA.post(`/api/presupuestos/${presupuesto.json.id}/convertir`)).status, 400);
  assert.equal((await empleadoA.post('/api/trabajos', { presupuesto_id: presupuesto.json.id })).status, 400);

  // Validación: hora sin día, un responsable de otro negocio, un producto ajeno.
  const base = { cliente: 'Pedro', titulo: 'Revisar caldera' };
  const idAdminB = (await adminB.get('/api/auth/estado')).json.usuario.id;
  assert.equal((await empleadoA.post('/api/trabajos', { ...base, hora: '09:00' })).status, 400);
  assert.equal((await empleadoA.post('/api/trabajos', { ...base, responsable_id: idAdminB })).status, 400);
  const ajeno = { ...base, items: [{ producto_id: productoB, cantidad: 1, precio_unitario: 1 }] };
  assert.equal((await empleadoA.post('/api/trabajos', ajeno)).status, 400);
  assert.equal((await empleadoA.post('/api/trabajos', { cliente: 'Pedro' })).status, 400, 'sin título');

  // Otro negocio no lo ve ni lo toca.
  assert.equal((await adminB.get(`/api/trabajos/${trabajo.json.id}`)).status, 404);
  assert.equal((await adminB.patch(`/api/trabajos/${trabajo.json.id}/estado`, { estado: 'cancelado' })).status, 404);
  assert.equal((await adminB.post(`/api/trabajos/${trabajo.json.id}/terminar`)).status, 404);
  assert.ok(!(await adminB.get('/api/trabajos')).json.some((t) => t.id === trabajo.json.id));

  // Se corrigen las horas reales, se empieza y se termina: la venta es por lo
  // del trabajo y el presupuesto queda convertido en esa misma venta.
  const corregido = await empleadoA.put(`/api/trabajos/${trabajo.json.id}`, {
    titulo: 'Service de aire, dos equipos',
    fecha: '2026-11-02',
    hora: '10:30',
    responsable_id: idEmpleado,
    items: [{ producto_id: servicio.json.id, cantidad: 2.5, precio_unitario: 15000 }]
  });
  assert.equal(corregido.status, 200, corregido.texto);
  // La agenda (hist. §80): lo que se cobra por hora dura esas horas.
  assert.equal((await empleadoA.get(`/api/trabajos/${trabajo.json.id}`)).json.duracion_estimada, 150);
  assert.equal((await empleadoA.patch(`/api/trabajos/${trabajo.json.id}/estado`, { estado: 'en_curso' })).status, 200);
  assert.equal((await empleadoA.patch(`/api/trabajos/${trabajo.json.id}/estado`, { estado: 'terminado' })).status, 400);
  const terminado = await empleadoA.post(`/api/trabajos/${trabajo.json.id}/terminar`);
  assert.equal(terminado.status, 201, terminado.texto);
  const ventaDelTrabajo = (await empleadoA.get(`/api/ventas/${terminado.json.venta_id}`)).json;
  assert.equal(ventaDelTrabajo.cliente, 'Lucía');
  assert.equal(ventaDelTrabajo.items.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0), 37500);
  const convertido = (await empleadoA.get(`/api/presupuestos/${presupuesto.json.id}`)).json;
  assert.equal(convertido.estado, 'convertido');
  assert.equal(convertido.venta_id, terminado.json.venta_id);
  assert.equal((await empleadoA.post(`/api/trabajos/${trabajo.json.id}/terminar`)).status, 400);
  assert.equal((await empleadoA.patch(`/api/trabajos/${trabajo.json.id}/estado`, { estado: 'pendiente' })).status, 400);
  assert.equal((await empleadoA.put(`/api/trabajos/${trabajo.json.id}`, { titulo: 'Otro' })).status, 400);

  // Un trabajo sin renglones no se termina; cancelado no se edita, y se retoma.
  const suelto = await empleadoA.post('/api/trabajos', base);
  assert.equal(suelto.status, 201, suelto.texto);
  assert.equal((await empleadoA.post(`/api/trabajos/${suelto.json.id}/terminar`)).status, 400);
  assert.equal((await empleadoA.patch(`/api/trabajos/${suelto.json.id}/estado`, { estado: 'cancelado' })).status, 200);
  assert.equal((await empleadoA.put(`/api/trabajos/${suelto.json.id}`, base)).status, 400);
  assert.equal((await empleadoA.post(`/api/trabajos/${suelto.json.id}/terminar`)).status, 400);
  assert.equal((await empleadoA.patch(`/api/trabajos/${suelto.json.id}/estado`, { estado: 'pendiente' })).status, 200);
});

test('abonos: la cuota del período, alta hacia atrás, precio desde la siguiente, baja y aislamiento (hist. §79)', async () => {
  const hoy = new Date().toLocaleDateString('sv-SE');
  const haceDias = (n) => new Date(Date.now() - n * 86400000).toLocaleDateString('sv-SE');
  const mantenimiento = await adminA.post('/api/productos', { nombre: 'Mantenimiento mensual', precio_venta: 20000, tipo: 'servicio' });
  assert.equal(mantenimiento.status, 201, mantenimiento.texto);
  const base = { cliente: 'Estudio Ríos', producto_id: mantenimiento.json.id, precio: 20000, meses: 1 };

  // Validación: solo servicios, de 1 a 12 meses, precio no negativo, y es admin.
  assert.equal((await adminA.post('/api/abonos', { ...base, producto_id: productoA })).status, 400, 'un producto con stock');
  assert.equal((await adminA.post('/api/abonos', { ...base, producto_id: productoB })).status, 400, 'un servicio ajeno');
  for (const meses of [0, 13, 1.5]) assert.equal((await adminA.post('/api/abonos', { ...base, meses })).status, 400);
  assert.equal((await adminA.post('/api/abonos', { ...base, precio: -1 })).status, 400);
  assert.equal((await empleadoA.post('/api/abonos', base)).status, 403);

  // El alta de hoy genera la cuota del período que empieza hoy, una sola vez.
  const abono = await adminA.post('/api/abonos', base);
  assert.equal(abono.status, 201, abono.texto);
  await empleadoA.get('/api/abonos');
  const recien = (await empleadoA.get(`/api/abonos/${abono.json.id}`)).json;
  assert.equal(recien.cuotas.length, 1);
  assert.equal(recien.cuotas[0].desde, hoy);
  assert.equal(recien.deuda, 20000);
  assert.ok(recien.proxima > hoy);

  // Un alta hacia atrás cobra el período que corre, no los anteriores.
  const viejo = await adminA.post('/api/abonos', { ...base, cliente: 'Consorcio Sur', fecha_alta: haceDias(75) });
  assert.equal(viejo.status, 201, viejo.texto);
  const deAntes = (await adminA.get(`/api/abonos/${viejo.json.id}`)).json;
  assert.equal(deAntes.cuotas.length, 1);
  assert.ok(deAntes.cuotas[0].desde <= hoy && deAntes.cuotas[0].hasta >= hoy, JSON.stringify(deAntes.cuotas[0]));

  // El precio nuevo rige desde la cuota siguiente; la cuota se cobra como venta.
  assert.equal((await adminA.patch(`/api/abonos/${abono.json.id}`, { precio: 25000 })).status, 200);
  const conPrecioNuevo = (await adminA.get(`/api/abonos/${abono.json.id}`)).json;
  assert.equal(conPrecioNuevo.precio, 25000);
  assert.equal(conPrecioNuevo.cuotas[0].importe, 20000);
  const efectivo = (await adminA.get('/api/cuentas-tesoreria')).json.find((c) => c.tipo === 'efectivo');
  const cobro = await empleadoA.post(`/api/ventas/${conPrecioNuevo.cuotas[0].venta_id}/cobros`, { importe: 20000, cuenta_tesoreria_id: efectivo.id });
  assert.ok(cobro.status < 300, cobro.texto);
  assert.equal((await adminA.get(`/api/abonos/${abono.json.id}`)).json.deuda, 0);

  // Baja y reactivar: no se cobran los meses de baja ni se duplica la cuota.
  assert.equal((await adminA.patch(`/api/abonos/${abono.json.id}`, { estado: 'baja' })).status, 200);
  const deBaja = (await adminA.get(`/api/abonos/${abono.json.id}`)).json;
  assert.equal(deBaja.estado, 'baja');
  assert.equal(deBaja.proxima, null);
  assert.equal((await adminA.patch(`/api/abonos/${abono.json.id}`, { estado: 'activo' })).status, 200);
  const reactivado = (await adminA.get(`/api/abonos/${abono.json.id}`)).json;
  assert.equal(reactivado.estado, 'activo');
  assert.equal(reactivado.cuotas.length, 1);
  assert.equal((await empleadoA.patch(`/api/abonos/${abono.json.id}`, { precio: 1 })).status, 403);

  // Cobrar todo lo que debe un abono de una vez (hist. §84), de los dos roles.
  assert.equal((await adminB.post(`/api/abonos/${viejo.json.id}/cobros`, { cuenta_tesoreria_id: efectivo.id })).status, 404);
  assert.equal((await empleadoA.post(`/api/abonos/${viejo.json.id}/cobros`, { cuenta_tesoreria_id: 999999 })).status, 400);
  const todo = await empleadoA.post(`/api/abonos/${viejo.json.id}/cobros`, { cuenta_tesoreria_id: efectivo.id });
  assert.equal(todo.status, 201, todo.texto);
  assert.equal(todo.json.cobrado, 20000);
  assert.equal((await adminA.get(`/api/abonos/${viejo.json.id}`)).json.deuda, 0);
  assert.equal((await empleadoA.post(`/api/abonos/${viejo.json.id}/cobros`, { cuenta_tesoreria_id: efectivo.id })).status, 400);

  // Otro negocio no lo ve ni lo toca.
  assert.equal((await adminB.get(`/api/abonos/${abono.json.id}`)).status, 404);
  assert.equal((await adminB.patch(`/api/abonos/${abono.json.id}`, { estado: 'baja' })).status, 404);
  assert.ok(!(await adminB.get('/api/abonos')).json.some((a) => a.id === abono.json.id));
});

test('primeros pasos: cuenta lo cargado del negocio, sin planes de socios, y es de admin (hist. §81)', async () => {
  const r = await adminA.get('/api/negocio/primeros-pasos');
  assert.equal(r.status, 200, r.texto);
  const productos = (await adminA.get('/api/productos')).json.filter((p) => p.activo);
  const planes = new Set((await adminA.get('/api/planes-socio')).json.map((p) => p.producto_id));
  assert.ok(planes.size > 0, 'el caso de socios dejó planes');
  assert.equal(r.json.catalogo, productos.filter((p) => !planes.has(p.id)).length);
  assert.ok(r.json.ventas > 0 && r.json.clientes > 0 && r.json.usuarios >= 2 && r.json.trabajos > 0 && r.json.abonos > 0);
  // Otro negocio cuenta lo suyo, no lo de A.
  const deB = (await adminB.get('/api/negocio/primeros-pasos')).json;
  assert.equal(deB.trabajos, 0);
  assert.equal(deB.abonos, 0);
  assert.equal((await empleadoA.get('/api/negocio/primeros-pasos')).status, 403);
});

test('muchos logins fallidos con usuarios distintos bloquean la IP (A6)', async () => {
  const anonimo = crearCliente(servidor.url);
  let ultimo;
  for (let i = 0; i < 32; i++) {
    ultimo = await anonimo.post('/api/auth/login', { usuario: `inexistente-${i}`, password: 'cualquiera-123' });
  }
  assert.equal(ultimo.status, 429, 'después de 30 fallos desde la misma IP responde 429');
});
