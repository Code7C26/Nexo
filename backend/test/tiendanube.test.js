// Tienda Nube (etapa G, CLAUDE.md §32), contra un Tienda Nube falso en la
// misma máquina: el permiso con el `state` firmado, publicar productos, el
// stock y el precio que se mandan solos, y los pedidos que pasan a ser ventas
// una sola vez. También que la tienda no se cruza entre negocios.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { crearCliente, crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

const SECRETO = 'secreto-de-prueba';
const TIENDA = '777';
const TOKEN = 'token-de-la-tienda';

/* ---------- El Tienda Nube falso ---------- */

const falso = {
  pedidosRecibidos: [],
  webhooks: [],
  productos: new Map(),
  pedidos: new Map(),
  siguienteId: 1000
};

function atender(req, res) {
  let cuerpo = '';
  req.on('data', (parte) => (cuerpo += parte));
  req.on('end', () => {
    const url = new URL(req.url, 'http://falso');
    const datos = cuerpo ? JSON.parse(cuerpo) : undefined;
    falso.pedidosRecibidos.push({ metodo: req.method, ruta: url.pathname, datos });
    const responder = (status, json) => {
      res.writeHead(status, { 'content-type': 'application/json', 'x-rate-limit-remaining': '39', 'x-rate-limit-reset': '0' });
      res.end(json === undefined ? '' : JSON.stringify(json));
    };
    if (req.method === 'POST' && url.pathname === '/apps/authorize/token') {
      if (datos.client_secret !== SECRETO || datos.code !== 'codigo-bueno') {
        return responder(400, { error_description: 'Código inválido' });
      }
      return responder(200, { access_token: TOKEN, token_type: 'bearer', scope: 'write_products,read_orders', user_id: Number(TIENDA) });
    }
    const base = `/2025-03/${TIENDA}`;
    if (!url.pathname.startsWith(base)) return responder(404, { description: 'Tienda equivocada' });
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return responder(401, { description: 'Sin permiso' });
    const ruta = url.pathname.slice(base.length);
    if (req.method === 'GET' && ruta === '/store') {
      return responder(200, { name: { es: 'Tienda Demo' }, original_domain: 'demo.mitiendanube.com' });
    }
    if (ruta === '/webhooks' && req.method === 'GET') return responder(200, falso.webhooks);
    if (ruta === '/webhooks' && req.method === 'POST') {
      const w = { id: falso.siguienteId++, ...datos };
      falso.webhooks.push(w);
      return responder(201, w);
    }
    if (ruta.startsWith('/webhooks/') && req.method === 'DELETE') {
      falso.webhooks = falso.webhooks.filter((w) => String(w.id) !== ruta.split('/')[2]);
      return responder(200, {});
    }
    if (ruta === '/products' && req.method === 'POST') {
      const producto = { id: falso.siguienteId++, ...datos, variants: datos.variants.map((v) => ({ ...v, id: falso.siguienteId++ })) };
      falso.productos.set(producto.id, producto);
      return responder(201, producto);
    }
    if (ruta === '/products/stock-price' && req.method === 'PATCH') {
      return responder(200, datos.map((p) => ({ id: p.id, variants: p.variants.map((v) => ({ id: v.id, success: true })) })));
    }
    if (ruta.startsWith('/orders/') && req.method === 'GET') {
      const pedido = falso.pedidos.get(ruta.split('/')[2]);
      return pedido ? responder(200, pedido) : responder(404, { description: 'Not Found' });
    }
    if (ruta === '/orders' && req.method === 'GET') {
      // Como Tienda Nube: una página vacía es un 404.
      const lista = [...falso.pedidos.values()];
      return url.searchParams.get('page') === '1' && lista.length ? responder(200, lista) : responder(404, { description: 'Last page is 0' });
    }
    responder(404, { description: `No existe ${req.method} ${ruta}` });
  });
}

let servidorFalso;
let servidor;
let admin;
let otro;

const enviados = (metodo, ruta) => falso.pedidosRecibidos.filter((p) => p.metodo === metodo && p.ruta.endsWith(ruta));
const firmar = (cuerpo) => createHmac('sha256', SECRETO).update(cuerpo).digest('hex');
const estadoDe = async (cliente) => (await cliente.get('/api/integraciones/tiendanube')).json;

async function webhook(datos, firma) {
  const cuerpo = JSON.stringify(datos);
  const res = await fetch(`${servidor.url}/api/integraciones/tiendanube/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-linkedstore-hmac-sha256': firma ?? firmar(cuerpo) },
    body: cuerpo
  });
  return res.status;
}

async function urlDelPermiso(cliente) {
  return (await cliente.post('/api/integraciones/tiendanube/conectar')).json.url;
}

// El callback del permiso, como lo haría el navegador al volver de Tienda Nube.
// Devuelve adónde lo manda: la página de la integración, con el resultado.
async function volverDeTiendaNube(cliente, { code = 'codigo-bueno', state }) {
  const consulta = `code=${code}${state === undefined ? '' : `&state=${encodeURIComponent(state)}`}`;
  const r = await cliente.pedir('GET', `/api/integraciones/tiendanube/callback?${consulta}`, undefined, {}, { redirect: 'manual' });
  assert.equal(r.status, 302);
  const destino = new URL(r.headers.get('location'), 'http://nexo');
  assert.equal(destino.hash, '#/configuracion/tienda-nube');
  return { resultado: destino.searchParams.get('tiendanube'), clave: destino.searchParams.get('clave') };
}
const stateDe = (url) => new URL(url).searchParams.get('state');

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(condicion, intentos = 40) {
  for (let i = 0; i < intentos; i++) {
    if (await condicion()) return true;
    await esperar(100);
  }
  return false;
}

before(async () => {
  servidorFalso = createServer(atender);
  await new Promise((r) => servidorFalso.listen(0, '127.0.0.1', r));
  const urlFalso = `http://127.0.0.1:${servidorFalso.address().port}`;
  servidor = await levantarServidor({
    env: {
      TIENDANUBE_APP_ID: '49947',
      TIENDANUBE_CLIENT_SECRET: SECRETO,
      TIENDANUBE_AUTH_URL: urlFalso,
      TIENDANUBE_API_URL: urlFalso,
      NEXO_URL_PUBLICA: 'https://nexo.test'
    }
  });
  admin = await registrarEmpresa(servidor, { empresa: 'Ropa Sur', usuario: 'ropa' });
  otro = await registrarEmpresa(servidor, { empresa: 'Kiosco Norte', usuario: 'kiosco' });
});

after(async () => {
  await servidor?.cerrar();
  servidorFalso?.close();
});

test('sin conectar: la integración se ofrece, y el empleado no la ve', async () => {
  const estado = await admin.get('/api/integraciones/tiendanube');
  assert.equal(estado.status, 200);
  assert.deepEqual(estado.json, { disponible: true, conectada: false, plan_lo_incluye: true });
  const empleado = await crearEmpleado(servidor, admin, { usuario: 'vendedora' });
  assert.equal((await empleado.get('/api/integraciones/tiendanube')).status, 403);
  assert.equal((await empleado.post('/api/integraciones/tiendanube/conectar')).status, 403);
});

test('el permiso: la URL lleva un state firmado, y uno trucho, ajeno o sin sesión no conecta', async () => {
  const url = await urlDelPermiso(admin);
  assert.match(url, /\/apps\/49947\/authorize\?state=/);

  // Sin sesión (otro navegador), con el state bueno.
  assert.equal((await volverDeTiendaNube(crearCliente(servidor.url), { state: stateDe(url) })).resultado, 'error');
  // El state de un negocio, con la sesión de otro.
  assert.equal((await volverDeTiendaNube(otro, { state: stateDe(url) })).resultado, 'error');
  // Un state alterado no cae al negocio de la sesión.
  const trucho = await volverDeTiendaNube(admin, { state: `${stateDe(url).split('.')[0]}.firma-trucha` });
  assert.equal(trucho.resultado, 'error');
  // Un código que Tienda Nube rechaza.
  assert.equal((await volverDeTiendaNube(admin, { code: 'codigo-malo', state: stateDe(url) })).resultado, 'error');

  assert.equal((await estadoDe(admin)).conectada, false);
  assert.equal((await estadoDe(otro)).conectada, false);
  assert.equal(enviados('POST', '/apps/authorize/token').length, 1, 'solo el código malo llegó a Tienda Nube');
});

test('conectar: guarda la tienda con el token cifrado y activa los avisos', async () => {
  const r = await volverDeTiendaNube(admin, { state: stateDe(await urlDelPermiso(admin)) });
  assert.equal(r.resultado, 'conectada');
  const estado = await estadoDe(admin);
  assert.equal(estado.conectada, true);
  assert.equal(estado.tienda.nombre, 'Tienda Demo');
  assert.equal(estado.tienda.url, 'https://demo.mitiendanube.com');
  assert.ok(estado.cuenta_tesoreria_id, 'lo cobrado entra en una cuenta de entrada');
  assert.ok(!JSON.stringify(estado).includes(TOKEN));

  const eventos = falso.webhooks.map((w) => w.event).sort();
  assert.deepEqual(eventos, ['app/uninstalled', 'order/cancelled', 'order/created', 'order/paid', 'product/deleted']);
  assert.ok(falso.webhooks.every((w) => w.url === 'https://nexo.test/api/integraciones/tiendanube/webhook'));

  // Ni la descarga de datos del negocio trae el token, en claro ni cifrado.
  const exportado = await admin.get('/api/negocio/exportar');
  assert.equal(exportado.status, 200);
  assert.ok(!exportado.texto.includes(TOKEN));
  assert.ok(!exportado.texto.includes('"token"'));

  // Otro negocio no puede conectar la misma tienda.
  const enOtro = await volverDeTiendaNube(otro, { state: stateDe(await urlDelPermiso(otro)) });
  assert.equal(enOtro.resultado, 'en-otro-negocio');
  assert.equal((await estadoDe(otro)).conectada, false);
});

let remera;
let gorra;
let enLaTienda;

test('publicar: crea el producto en la tienda con su precio y su stock, y lo vincula', async () => {
  remera = (await admin.post('/api/productos', { nombre: 'Remera lisa', sku: 'REM-1', precio_venta: 15000 })).json.id;
  gorra = (await admin.post('/api/productos', { nombre: 'Gorra', sku: 'GOR-1', precio_venta: 9000 })).json.id;
  assert.equal((await admin.post('/api/stock/ajuste', { producto_id: remera, cantidad: 10 })).status, 201);

  const r = await admin.post('/api/integraciones/tiendanube/publicar', { producto_ids: [remera] });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.publicados, 1);
  const [alta] = enviados('POST', '/products');
  assert.deepEqual(alta.datos.name, { es: 'Remera lisa' });
  assert.deepEqual(alta.datos.variants, [{ price: 15000, sku: 'REM-1', stock: 10 }]);
  [enLaTienda] = falso.productos.values();

  const productos = (await admin.get('/api/integraciones/tiendanube/productos')).json;
  assert.equal(productos.find((p) => p.id === remera).publicado, true);
  assert.equal(productos.find((p) => p.id === gorra).publicado, false);

  // Publicar dos veces lo mismo no lo duplica.
  await admin.post('/api/integraciones/tiendanube/publicar', { producto_ids: [remera] });
  assert.equal(enviados('POST', '/products').length, 1);
});

test('publicar con variantes: cada variante va con su talle, su precio y su SKU', async () => {
  const buzo = (await admin.post('/api/productos', { nombre: 'Buzo', precio_venta: 30000 })).json.id;
  const talle = (await admin.post(`/api/productos/${buzo}/atributos`, { nombre: 'Talle' })).json.id;
  for (const [valor, sku, precio] of [['S', 'BUZ-S', null], ['XL', 'BUZ-XL', 32000]]) {
    const v = (await admin.post(`/api/productos/${buzo}/atributos/${talle}/valores`, { valor })).json.id;
    const alta = await admin.post(`/api/productos/${buzo}/variantes`, {
      valores: [{ atributo_id: talle, valor_id: v }],
      sku,
      ...(precio ? { precio_venta: precio } : {})
    });
    assert.equal(alta.status, 201, alta.texto);
  }
  const r = await admin.post('/api/integraciones/tiendanube/publicar', { producto_ids: [buzo] });
  assert.equal(r.json.publicados, 1, JSON.stringify(r.json));
  const alta = enviados('POST', '/products').at(-1).datos;
  assert.deepEqual(alta.attributes, [{ es: 'Talle' }]);
  assert.deepEqual(alta.variants, [
    { price: 30000, sku: 'BUZ-S', stock: 0, values: [{ es: 'S' }] },
    { price: 32000, sku: 'BUZ-XL', stock: 0, values: [{ es: 'XL' }] }
  ]);
  assert.equal((await estadoDe(admin)).productos_publicados, 2);
});

test('stock y precio: una venta en Nexo se manda sola a la tienda, y solo lo que cambió', async () => {
  const venta = await admin.post('/api/ventas', {
    cliente: 'Mostrador',
    items: [{ producto_id: remera, cantidad: 3, precio_unitario: 15000 }]
  });
  assert.equal(venta.status, 201, venta.texto);
  // La pasada que programa el movimiento de stock sale a los pocos segundos.
  assert.ok(await hasta(() => enviados('PATCH', '/products/stock-price').length > 0, 80), 'mandó el stock nuevo');
  const [cambio] = enviados('PATCH', '/products/stock-price');
  assert.deepEqual(cambio.datos, [
    { id: enLaTienda.id, variants: [{ id: enLaTienda.variants[0].id, price: 15000, inventory_levels: [{ stock: 7 }] }] }
  ]);

  // Sin cambios, la pasada no manda nada.
  assert.equal((await admin.post('/api/integraciones/tiendanube/sincronizar')).status, 200);
  assert.equal(enviados('PATCH', '/products/stock-price').length, 1);
});

function pedidoDeLaTienda(id, cambios = {}) {
  return {
    id,
    number: 100 + id,
    status: 'open',
    payment_status: 'paid',
    created_at: new Date().toISOString(),
    paid_at: new Date().toISOString(),
    discount: '0.00',
    shipping_cost_customer: '0.00',
    customer: { name: 'Lucía Gómez', email: 'Lucia@Correo.test', phone: '351555', identification: '30.111.222' },
    products: [{ product_id: enLaTienda.id, variant_id: enLaTienda.variants[0].id, name: 'Remera lisa', price: '15000.00', quantity: 2 }],
    ...cambios
  };
}

test('un webhook sin firma válida no hace nada', async () => {
  falso.pedidos.set('1', pedidoDeLaTienda(1));
  assert.equal(await webhook({ store_id: Number(TIENDA), event: 'order/paid', id: 1 }, 'firma-trucha'), 401);
  await esperar(300);
  assert.equal((await estadoDe(admin)).pedidos_importados, 0);
});

test('un pedido pagado pasa a ser una venta con su cobro, una sola vez', async () => {
  assert.equal(await webhook({ store_id: Number(TIENDA), event: 'order/paid', id: 1 }), 200);
  assert.ok(await hasta(async () => (await estadoDe(admin)).pedidos_importados === 1));
  // El mismo aviso otra vez, el de "creado" y la pasada: nada nuevo.
  await webhook({ store_id: Number(TIENDA), event: 'order/paid', id: 1 });
  await webhook({ store_id: Number(TIENDA), event: 'order/created', id: 1 });
  await admin.post('/api/integraciones/tiendanube/sincronizar');
  await esperar(300);

  const estado = await estadoDe(admin);
  assert.equal(estado.pedidos_importados, 1);
  const pedido = estado.pedidos.find((p) => p.externo_id === '1');
  assert.equal(pedido.estado, 'importado');
  assert.equal(pedido.numero, '101');

  const venta = (await admin.get(`/api/ventas/${pedido.venta_id}`)).json;
  assert.equal(venta.cliente, 'Lucía Gómez');
  const cobros = (await admin.get(`/api/ventas/${pedido.venta_id}/cobros`)).json;
  assert.equal(cobros.reduce((a, c) => a + c.importe, 0), 30000);

  const stock = (await admin.get('/api/stock')).json.find((s) => s.producto_id === remera);
  assert.equal(stock.stock_total, 5);

  // Un segundo pedido de la misma persona (mismo mail) no duplica el cliente.
  falso.pedidos.set('2', pedidoDeLaTienda(2, { customer: { name: 'Lucía G.', email: 'lucia@correo.test' } }));
  await webhook({ store_id: Number(TIENDA), event: 'order/paid', id: 2 });
  assert.ok(await hasta(async () => (await estadoDe(admin)).pedidos_importados === 2));
  const clientes = (await admin.get('/api/clientes')).json;
  assert.equal(clientes.filter((c) => /luc/i.test(c.nombre)).length, 1);
});

test('un pedido de algo sin vincular queda pendiente, y lo que hay que revisar va arriba', async () => {
  falso.pedidos.set(
    '3',
    pedidoDeLaTienda(3, { products: [{ product_id: 1, variant_id: 99999, name: 'Algo que no es de Nexo', price: '500', quantity: 1 }] })
  );
  await webhook({ store_id: Number(TIENDA), event: 'order/created', id: 3 });
  assert.ok(await hasta(async () => (await estadoDe(admin)).pedidos.some((p) => p.externo_id === '3')));
  const { pedidos } = await estadoDe(admin);
  const pendiente = pedidos.find((p) => p.externo_id === '3');
  assert.equal(pendiente.estado, 'pendiente');
  assert.match(pendiente.error, /no está vinculado/);
  assert.equal(pedidos[0].externo_id, '3');

  const r = await admin.post(`/api/integraciones/tiendanube/pedidos/${pendiente.id}/reintentar`);
  assert.equal(r.status, 200);
  assert.equal(r.json.estado, 'pendiente');
});

const stockEnNexo = async () => (await admin.get('/api/stock')).json.find((s) => s.producto_id === remera).stock_total;
const ultimoStockPublicado = () => enviados('PATCH', '/products/stock-price').at(-1)?.datos[0].variants[0].inventory_levels?.[0].stock;

test('pago online sin terminar: no es venta, pero reserva sus unidades en la tienda; al pagarse, es venta', async () => {
  const antes = await stockEnNexo();
  falso.pedidos.set('4', pedidoDeLaTienda(4, { payment_status: 'pending', gateway: 'pago-nube', products: [{ ...pedidoDeLaTienda(4).products[0], quantity: 2 }] }));
  await webhook({ store_id: Number(TIENDA), event: 'order/created', id: 4 });
  assert.ok(await hasta(async () => (await estadoDe(admin)).pedidos.some((p) => p.externo_id === '4' && p.estado === 'esperando_pago')));
  assert.equal(await stockEnNexo(), antes, 'en Nexo no se vendió nada');
  assert.ok(await hasta(() => ultimoStockPublicado() === antes - 2, 80), 'la tienda publica 2 menos');

  falso.pedidos.set('4', { ...falso.pedidos.get('4'), payment_status: 'paid' });
  await webhook({ store_id: Number(TIENDA), event: 'order/paid', id: 4 });
  assert.ok(await hasta(async () => (await estadoDe(admin)).pedidos.some((p) => p.externo_id === '4' && p.estado === 'importado')));
  assert.equal(await stockEnNexo(), antes - 2);
  const pedido = (await estadoDe(admin)).pedidos.find((p) => p.externo_id === '4');
  assert.equal(pedido.por_cobrar, 0, 'cobrado online');
});

test('pago manual: entra como venta por cobrar, y al pagarse en la tienda se cobra solo lo que falta', async () => {
  assert.equal((await admin.post('/api/stock/ajuste', { producto_id: remera, cantidad: 20 })).status, 201);
  const antes = await stockEnNexo();
  falso.pedidos.set('5', pedidoDeLaTienda(5, { payment_status: 'pending', gateway: 'offline', gateway_name: 'Transferencia bancaria' }));
  await webhook({ store_id: Number(TIENDA), event: 'order/created', id: 5 });
  assert.ok(await hasta(async () => (await estadoDe(admin)).pedidos.some((p) => p.externo_id === '5' && p.estado === 'importado')));
  let pedido = (await estadoDe(admin)).pedidos.find((p) => p.externo_id === '5');
  assert.equal(pedido.por_cobrar, 30000);
  assert.equal(await stockEnNexo(), antes - 2, 'ya es venta: baja el stock');
  assert.equal((await admin.get(`/api/ventas/${pedido.venta_id}/cobros`)).json.length, 0);

  // El negocio cobra una parte en Nexo; después lo marca pagado en Tienda Nube.
  const { cuenta_tesoreria_id } = await estadoDe(admin);
  const cobro = await admin.post(`/api/ventas/${pedido.venta_id}/cobros`, { importe: 10000, cuenta_tesoreria_id });
  assert.equal(cobro.status, 201, cobro.texto);
  falso.pedidos.set('5', { ...falso.pedidos.get('5'), payment_status: 'paid', gateway: 'internal' });
  await webhook({ store_id: Number(TIENDA), event: 'order/paid', id: 5 });
  assert.ok(await hasta(async () => (await estadoDe(admin)).pedidos.find((p) => p.externo_id === '5').por_cobrar === 0));
  const cobros = (await admin.get(`/api/ventas/${pedido.venta_id}/cobros`)).json;
  assert.deepEqual(cobros.map((c) => c.importe).sort((a, b) => a - b), [10000, 20000]);

  // El mismo aviso otra vez no cobra de nuevo.
  await webhook({ store_id: Number(TIENDA), event: 'order/paid', id: 5 });
  await esperar(300);
  assert.equal((await admin.get(`/api/ventas/${pedido.venta_id}/cobros`)).json.length, 2);
  pedido = (await estadoDe(admin)).pedidos.find((p) => p.externo_id === '5');
  assert.equal(pedido.estado, 'importado');
});

test('cancelado sin cobros: la venta se anula sola, el stock vuelve y el envío que pagó el negocio también', async () => {
  const antes = await stockEnNexo();
  // El cliente paga $1.500 de envío, y al negocio el envío le cuesta $900
  // (hist. §129).
  falso.pedidos.set(
    '6',
    pedidoDeLaTienda(6, { payment_status: 'pending', gateway: 'not-provided', shipping_cost_customer: '1500.00', shipping_cost_owner: '900.00' })
  );
  await webhook({ store_id: Number(TIENDA), event: 'order/created', id: 6 });
  assert.ok(await hasta(async () => (await estadoDe(admin)).pedidos.some((p) => p.externo_id === '6' && p.estado === 'importado')));
  const { venta_id } = (await estadoDe(admin)).pedidos.find((p) => p.externo_id === '6');
  assert.equal(await stockEnNexo(), antes - 2);
  const venta = (await admin.get(`/api/ventas/${venta_id}`)).json;
  assert.deepEqual(
    venta.items.map((i) => [i.producto, i.precio_unitario]),
    [
      ['Remera lisa', 15000],
      ['Envío', 1500]
    ]
  );
  assert.equal(venta.total, 31500);
  assert.equal(venta.canal, 'tiendanube');
  assert.deepEqual(
    venta.costos_de_vender.map((c) => [c.categoria, c.importe]),
    [['Envíos', 900]]
  );
  const gastoEnvio = () => fetchGastos().then((gastos) => gastos.find((g) => g.id === venta.costos_de_vender[0].id));
  assert.equal((await gastoEnvio()).estado, 'activo');

  falso.pedidos.set('6', { ...falso.pedidos.get('6'), status: 'cancelled' });
  await webhook({ store_id: Number(TIENDA), event: 'order/cancelled', id: 6 });
  assert.ok(await hasta(async () => (await estadoDe(admin)).pedidos.some((p) => p.externo_id === '6' && p.estado === 'cancelado')));
  const pedido = (await estadoDe(admin)).pedidos.find((p) => p.externo_id === '6');
  assert.equal(pedido.error, null, 'no queda nada para revisar');
  assert.equal((await admin.get(`/api/ventas/${venta_id}`)).json.estado, 'anulada');
  assert.equal(await stockEnNexo(), antes);
  // El gasto del envío se anuló con la venta, y vuelve si se restaura.
  assert.equal((await gastoEnvio()).estado, 'anulado');
  assert.equal((await admin.post(`/api/ventas/${venta_id}/restaurar`)).status, 200);
  assert.equal((await gastoEnvio()).estado, 'activo');
  assert.equal((await admin.post(`/api/ventas/${venta_id}/anular`)).status, 200);
  assert.equal((await gastoEnvio()).estado, 'anulado');
});

const fetchGastos = async () => (await admin.get('/api/gastos')).json;

test('cancelado en la tienda después de ser venta: queda marcado y la venta no se toca', async () => {
  const antes = (await estadoDe(admin)).pedidos.find((p) => p.externo_id === '1');
  falso.pedidos.set('1', pedidoDeLaTienda(1, { status: 'cancelled', payment_status: 'refunded' }));
  await webhook({ store_id: Number(TIENDA), event: 'order/cancelled', id: 1 });
  assert.ok(await hasta(async () => (await estadoDe(admin)).pedidos.some((p) => p.externo_id === '1' && p.estado === 'cancelado')));
  const pedido = (await estadoDe(admin)).pedidos.find((p) => p.externo_id === '1');
  assert.equal(pedido.venta_id, antes.venta_id);
  assert.match(pedido.error, /devolución/);
  assert.equal((await admin.get(`/api/ventas/${antes.venta_id}`)).json.estado, 'activa');

  assert.equal((await admin.post(`/api/integraciones/tiendanube/pedidos/${pedido.id}/revisado`)).status, 200);
  assert.equal((await estadoDe(admin)).pedidos.find((p) => p.externo_id === '1').error, null);
});

test('los avisos de privacidad piden firma, y borrar un cliente borra sus pedidos guardados', async () => {
  const cuerpo = JSON.stringify({ store_id: Number(TIENDA), customer: { id: 1 }, orders_to_redact: [2] });
  const ruta = `${servidor.url}/api/integraciones/tiendanube/privacidad/borrar-cliente`;
  const sinFirma = await fetch(ruta, { method: 'POST', headers: { 'content-type': 'application/json' }, body: cuerpo });
  assert.equal(sinFirma.status, 401);
  const r = await fetch(ruta, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-linkedstore-hmac-sha256': firmar(cuerpo) },
    body: cuerpo
  });
  assert.equal(r.status, 200);
  const { actividad } = await estadoDe(admin);
  assert.match(actividad[0].detalle, /se borraron 1 pedido/);
});

// Desde el plan Emprendedor (decisión del usuario del 10 de noviembre): en
// Gratis lo conectado queda en pausa, y al volver a un plan pago la pasada
// trae lo que se perdió. El plan se cambia con el script del dueño de Nexo.
function cambiarPlan(cliente, plan) {
  return cliente.get('/api/negocio').then(({ json }) => {
    const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
    const r = spawnSync(process.execPath, ['scripts/plan.mjs', '--negocio', String(json.id), '--plan', plan], {
      cwd: raiz,
      env: { ...process.env, NEXO_DB_PATH: path.join(servidor.dir, 'nexo.db') },
      encoding: 'utf8'
    });
    assert.equal(r.status, 0, r.stderr);
  });
}

test('en Gratis queda en pausa: el pedido no entra, y al volver a un plan pago la pasada lo trae', async () => {
  const antes = (await estadoDe(admin)).pedidos_importados;
  await cambiarPlan(admin, 'gratis');
  assert.equal((await estadoDe(admin)).plan_lo_incluye, false);
  falso.pedidos.set('9', pedidoDeLaTienda(9));
  assert.equal(await webhook({ store_id: Number(TIENDA), event: 'order/paid', id: 9 }), 200);
  await esperar(300);
  assert.equal((await estadoDe(admin)).pedidos_importados, antes);
  const sincronizar = await admin.post('/api/integraciones/tiendanube/sincronizar');
  assert.equal(sincronizar.status, 403);
  assert.equal(sincronizar.json.codigo, 'limite_plan');

  await cambiarPlan(admin, 'emprendedor');
  assert.ok((await admin.post('/api/integraciones/tiendanube/sincronizar')).status < 300);
  assert.ok(await hasta(async () => (await estadoDe(admin)).pedidos_importados === antes + 1));
});

test('desinstalar la app desde Tienda Nube desconecta, y el otro negocio nunca vio nada', async () => {
  assert.equal(await webhook({ store_id: Number(TIENDA), event: 'app/uninstalled', id: Number(TIENDA) }), 200);
  assert.ok(await hasta(async () => (await estadoDe(admin)).conectada === false));
  assert.equal((await admin.post('/api/integraciones/tiendanube/sincronizar')).status, 400);
  assert.deepEqual(await estadoDe(otro), { disponible: true, conectada: false, plan_lo_incluye: true });

  // Ahora que quedó libre, el otro negocio la instala desde Tienda Nube (sin
  // state): no se conecta sola, pide confirmarla viendo el nombre.
  const { resultado, clave } = await volverDeTiendaNube(otro, {});
  assert.equal(resultado, 'confirmar');
  assert.equal((await estadoDe(otro)).conectada, false);
  assert.equal((await admin.get(`/api/integraciones/tiendanube/pendiente?clave=${clave}`)).status, 404, 'solo quien volvió');
  assert.equal((await otro.get(`/api/integraciones/tiendanube/pendiente?clave=${clave}`)).json.nombre, 'Tienda Demo');
  assert.equal((await otro.post('/api/integraciones/tiendanube/confirmar', { clave })).status, 200);
  assert.equal((await otro.post('/api/integraciones/tiendanube/confirmar', { clave })).status, 404, 'una sola vez');
  const delOtro = await estadoDe(otro);
  assert.equal(delOtro.conectada, true);
  assert.equal(delOtro.productos_publicados, 0);
  assert.equal(delOtro.pedidos.length, 0);
});
