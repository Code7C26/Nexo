// Mercado Libre (etapa G, CLAUDE.md §32), contra un Mercado Libre falso en la
// misma máquina: el permiso con `state` firmado y PKCE, vincular publicaciones
// con productos de Nexo, el stock y el precio que manda Nexo, las ventas que
// pasan a Nexo una sola vez y la renovación del token, que no puede pisarse.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

import { crearCliente, crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

const APP = '1234567890123456';
const SECRETO = 'secreto-de-prueba-ml';
const VENDEDOR = 4242;
const VUELTA = 'https://nexo.test/api/integraciones/mercadolibre/callback';

/* ---------- El Mercado Libre falso ---------- */

const falso = {
  pedidosRecibidos: [],
  // Cada token vale hasta que el vendedor saque el permiso; cada refresh
  // token, una sola vez.
  tokens: new Set(),
  refreshes: new Set(),
  ultimoToken: null,
  ultimoRefresh: null,
  // Cuánto dura el token que da: con 600 segundos, Nexo lo toma como vencido
  // (deja 10 minutos de margen) y lo renueva en cada uso.
  duracion: 21600,
  renovaciones: 0,
  emitidos: 0,
  desafios: new Map(),
  items: new Map(),
  ventas: new Map()
};

function emitirToken() {
  falso.emitidos++;
  falso.ultimoToken = `token-${falso.emitidos}`;
  falso.ultimoRefresh = `refresh-${falso.emitidos}`;
  falso.tokens.add(falso.ultimoToken);
  falso.refreshes.add(falso.ultimoRefresh);
  return { access_token: falso.ultimoToken, refresh_token: falso.ultimoRefresh, expires_in: falso.duracion, user_id: VENDEDOR };
}

function itemDeEjemplo(id, cambios = {}) {
  return { id, seller_id: VENDEDOR, title: id, status: 'active', price: 1000, available_quantity: 1, permalink: `https://ml.test/${id}`, ...cambios };
}

function atender(req, res) {
  let cuerpo = '';
  req.on('data', (parte) => (cuerpo += parte));
  req.on('end', () => {
    const url = new URL(req.url, 'http://falso');
    const esForm = String(req.headers['content-type']).startsWith('application/x-www-form-urlencoded');
    const datos = !cuerpo ? undefined : esForm ? Object.fromEntries(new URLSearchParams(cuerpo)) : JSON.parse(cuerpo);
    falso.pedidosRecibidos.push({ metodo: req.method, ruta: url.pathname, datos, query: url.searchParams });
    const responder = (status, json) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(json === undefined ? '' : JSON.stringify(json));
    };
    if (req.method === 'POST' && url.pathname === '/oauth/token') {
      if (datos.client_id !== APP || datos.client_secret !== SECRETO) return responder(400, { error: 'invalid_client' });
      if (datos.grant_type === 'authorization_code') {
        // PKCE: el verificador tiene que ser el del desafío de la URL.
        const desafio = createHash('sha256').update(datos.code_verifier ?? '').digest('base64url');
        if (datos.code !== 'codigo-bueno' || datos.redirect_uri !== VUELTA || !falso.desafios.has(desafio)) {
          return responder(400, { error: 'invalid_grant', error_description: 'Código inválido' });
        }
        return responder(200, emitirToken());
      }
      if (datos.grant_type === 'refresh_token') {
        // El refresh token sirve una sola vez.
        if (!falso.refreshes.delete(datos.refresh_token)) return responder(400, { error: 'invalid_grant', error_description: 'already used' });
        falso.renovaciones++;
        return responder(200, emitirToken());
      }
      return responder(400, { error: 'unsupported_grant_type' });
    }
    if (!falso.tokens.has(String(req.headers.authorization).replace(/^Bearer /, ''))) {
      return responder(401, { message: 'invalid access token' });
    }
    const ruta = url.pathname;
    if (req.method === 'GET' && ruta === '/users/me') {
      return responder(200, { id: VENDEDOR, nickname: 'ROPASUR', permalink: 'https://perfil.ml.test/ROPASUR' });
    }
    if (req.method === 'GET' && ruta === `/users/${VENDEDOR}/items/search`) {
      const ids = [...falso.items.keys()];
      return responder(200, { results: ids, paging: { total: ids.length, offset: 0, limit: 50 } });
    }
    if (req.method === 'GET' && ruta === '/items') {
      const ids = url.searchParams.get('ids').split(',');
      return responder(200, ids.map((id) => (falso.items.has(id) ? { code: 200, body: falso.items.get(id) } : { code: 404, body: {} })));
    }
    if (ruta.startsWith('/items/')) {
      const item = falso.items.get(ruta.split('/')[2]);
      if (!item) return responder(404, { message: 'not_found' });
      if (req.method === 'GET') return responder(200, item);
      if (req.method === 'PUT') {
        if (datos.price !== undefined) item.price = datos.price;
        if (datos.available_quantity !== undefined) item.available_quantity = datos.available_quantity;
        for (const cambio of datos.variations ?? []) {
          const variacion = item.variations.find((v) => v.id === cambio.id);
          if (cambio.price !== undefined) variacion.price = cambio.price;
          if (cambio.available_quantity !== undefined) variacion.available_quantity = cambio.available_quantity;
        }
        return responder(200, item);
      }
    }
    if (req.method === 'GET' && ruta.startsWith('/orders/') && ruta !== '/orders/search') {
      const venta = falso.ventas.get(ruta.split('/')[2]);
      return venta ? responder(200, venta) : responder(404, { message: 'not_found' });
    }
    if (req.method === 'GET' && ruta === '/orders/search') {
      return responder(200, { results: [...falso.ventas.values()], paging: { total: falso.ventas.size } });
    }
    responder(404, { message: `No existe ${req.method} ${ruta}` });
  });
}

let servidorFalso;
let servidor;
let admin;
let otro;

const enviados = (metodo, ruta) => falso.pedidosRecibidos.filter((p) => p.metodo === metodo && p.ruta === ruta);
const estadoDe = async (cliente) => (await cliente.get('/api/integraciones/mercadolibre')).json;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(condicion, intentos = 60) {
  for (let i = 0; i < intentos; i++) {
    if (await condicion()) return true;
    await esperar(100);
  }
  return false;
}

// El permiso, como lo haría el navegador: pide la URL en Nexo, "autoriza" en
// Mercado Libre (el falso anota el desafío) y vuelve al callback.
async function urlDelPermiso(cliente) {
  const url = new URL((await cliente.post('/api/integraciones/mercadolibre/conectar')).json.url);
  falso.desafios.set(url.searchParams.get('code_challenge'), true);
  return url;
}
async function volverDeMercadoLibre(cliente, { code = 'codigo-bueno', state }) {
  const consulta = new URLSearchParams({ code, ...(state === undefined ? {} : { state }) });
  const r = await cliente.pedir('GET', `/api/integraciones/mercadolibre/callback?${consulta}`, undefined, {}, { redirect: 'manual' });
  assert.equal(r.status, 302);
  const destino = new URL(r.headers.get('location'), 'http://nexo');
  assert.equal(destino.hash, '#/configuracion/mercado-libre');
  return destino.searchParams.get('mercadolibre');
}

async function aviso(datos) {
  const res = await fetch(`${servidor.url}/api/integraciones/mercadolibre/notificaciones`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ application_id: Number(APP), user_id: VENDEDOR, attempts: 1, ...datos })
  });
  return res.status;
}

before(async () => {
  servidorFalso = createServer(atender);
  await new Promise((r) => servidorFalso.listen(0, '127.0.0.1', r));
  const urlFalso = `http://127.0.0.1:${servidorFalso.address().port}`;
  servidor = await levantarServidor({
    env: {
      MERCADOLIBRE_APP_ID: APP,
      MERCADOLIBRE_CLIENT_SECRET: SECRETO,
      MERCADOLIBRE_AUTH_URL: urlFalso,
      MERCADOLIBRE_API_URL: urlFalso,
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
  const estado = await admin.get('/api/integraciones/mercadolibre');
  assert.equal(estado.status, 200);
  assert.deepEqual(estado.json, { disponible: true, conectada: false, plan_lo_incluye: true });
  // Tienda Nube no está configurada en este servidor: no se ofrece.
  assert.equal((await admin.get('/api/integraciones/tiendanube')).json.disponible, false);
  const empleado = await crearEmpleado(servidor, admin, { usuario: 'vendedora' });
  assert.equal((await empleado.get('/api/integraciones/mercadolibre')).status, 403);
  assert.equal((await empleado.post('/api/integraciones/mercadolibre/conectar')).status, 403);
});

test('el permiso: la URL lleva state, PKCE y la vuelta exacta; un state trucho, ajeno o sin sesión no conecta', async () => {
  const url = await urlDelPermiso(admin);
  assert.equal(url.pathname, '/authorization');
  assert.equal(url.searchParams.get('client_id'), APP);
  assert.equal(url.searchParams.get('redirect_uri'), VUELTA);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  const state = url.searchParams.get('state');

  assert.equal(await volverDeMercadoLibre(crearCliente(servidor.url), { state }), 'sin-sesion');
  assert.equal(await volverDeMercadoLibre(otro, { state }), 'error');
  assert.equal(await volverDeMercadoLibre(admin, { state: `${state.split('.')[0]}.firma-trucha` }), 'error');
  assert.equal(await volverDeMercadoLibre(admin, {}), 'error');
  assert.equal(await volverDeMercadoLibre(admin, { code: 'codigo-malo', state }), 'error');
  assert.equal((await estadoDe(admin)).conectada, false);
  assert.equal(enviados('POST', '/oauth/token').length, 1, 'solo el código malo llegó a Mercado Libre');
});

test('conectar: guarda el vendedor con el permiso cifrado, y otro negocio no puede usar la misma cuenta', async () => {
  const url = await urlDelPermiso(admin);
  assert.equal(await volverDeMercadoLibre(admin, { state: url.searchParams.get('state') }), 'conectada');
  const estado = await estadoDe(admin);
  assert.equal(estado.conectada, true);
  assert.equal(estado.tienda.nombre, 'ROPASUR');
  assert.equal(estado.tienda.id, String(VENDEDOR));
  assert.ok(estado.cuenta_tesoreria_id, 'lo cobrado entra en una cuenta de entrada');
  assert.ok(!JSON.stringify(estado).includes(falso.ultimoToken));

  const exportado = await admin.get('/api/negocio/exportar');
  assert.ok(!exportado.texto.includes(falso.ultimoToken));
  assert.ok(!exportado.texto.includes(falso.ultimoRefresh));

  const urlOtro = await urlDelPermiso(otro);
  assert.equal(await volverDeMercadoLibre(otro, { state: urlOtro.searchParams.get('state') }), 'en-otro-negocio');
  assert.equal((await estadoDe(otro)).conectada, false);
});

let remera;
let buzo;
let buzoS;
let buzoXL;

test('publicaciones: se listan con su variación y su SKU, con la sugerencia de Nexo por SKU', async () => {
  remera = (await admin.post('/api/productos', { nombre: 'Remera lisa', sku: 'REM-1', precio_venta: 15000 })).json.id;
  buzo = (await admin.post('/api/productos', { nombre: 'Buzo', precio_venta: 30000 })).json.id;
  const talle = (await admin.post(`/api/productos/${buzo}/atributos`, { nombre: 'Talle' })).json.id;
  const variantes = [];
  for (const [valor, sku, precio] of [['S', 'BUZ-S', null], ['XL', 'BUZ-XL', 32000]]) {
    const v = (await admin.post(`/api/productos/${buzo}/atributos/${talle}/valores`, { valor })).json.id;
    const alta = await admin.post(`/api/productos/${buzo}/variantes`, {
      valores: [{ atributo_id: talle, valor_id: v }],
      sku,
      ...(precio ? { precio_venta: precio } : {})
    });
    assert.equal(alta.status, 201, alta.texto);
    variantes.push(alta.json.id);
  }
  [buzoS, buzoXL] = variantes;

  falso.items.set('MLA1', itemDeEjemplo('MLA1', { title: 'Remera lisa algodón', price: 18000, available_quantity: 4, attributes: [{ id: 'SELLER_SKU', value_name: 'REM-1' }] }));
  falso.items.set(
    'MLA2',
    itemDeEjemplo('MLA2', {
      title: 'Buzo canguro',
      price: 35000,
      variations: [
        { id: 501, price: 35000, available_quantity: 2, attribute_combinations: [{ name: 'Talle', value_name: 'S' }], attributes: [{ id: 'SELLER_SKU', value_name: 'BUZ-S' }] },
        { id: 502, price: 35000, available_quantity: 3, attribute_combinations: [{ name: 'Talle', value_name: 'XL' }], attributes: [] }
      ]
    })
  );
  falso.items.set('MLA3', itemDeEjemplo('MLA3', { status: 'closed' }));

  const r = await admin.get('/api/integraciones/mercadolibre/publicaciones');
  assert.equal(r.status, 200, r.texto);
  const { publicaciones, opciones } = r.json;
  assert.deepEqual(
    publicaciones.map((p) => [p.externo_producto_id, p.externo_variante_id, p.titulo, p.sku]),
    [
      ['MLA1', 'MLA1', 'Remera lisa algodón', 'REM-1'],
      ['MLA2', '501', 'Buzo canguro (Talle: S)', 'BUZ-S'],
      ['MLA2', '502', 'Buzo canguro (Talle: XL)', '']
    ],
    'la finalizada no aparece'
  );
  assert.deepEqual(publicaciones[0].sugerencia, { producto_id: remera, variante_id: null });
  assert.deepEqual(publicaciones[1].sugerencia, { producto_id: buzo, variante_id: buzoS });
  assert.equal(publicaciones[2].sugerencia, null);
  // En Nexo se elige el producto, o la variante si tiene: el buzo no va solo.
  assert.ok(opciones.some((o) => o.producto_id === remera && o.variante_id === null));
  assert.ok(!opciones.some((o) => o.producto_id === buzo && o.variante_id === null));
  assert.equal(opciones.find((o) => o.variante_id === buzoXL).nombre, 'Buzo (Talle: XL)');
});

test('vincular: con el stock de Mercado Libre se ajusta Nexo, y después manda Nexo', async () => {
  const r = await admin.post('/api/integraciones/mercadolibre/vincular', {
    vinculos: [{ externo_producto_id: 'MLA1', externo_variante_id: 'MLA1', producto_id: remera, variante_id: null, traer_stock: true }]
  });
  assert.equal(r.status, 200, r.texto);
  assert.deepEqual(r.json, { vinculados: 1, errores: [] });

  // El stock de Nexo pasó a ser el de Mercado Libre, con su movimiento.
  const stock = (await admin.get('/api/stock')).json.find((s) => s.producto_id === remera);
  assert.equal(stock.stock_total, 4);
  const movimientos = (await admin.get('/api/movimientos-stock')).json.filter((m) => m.producto_id === remera);
  assert.match(movimientos[0].nota, /Mercado Libre/);

  // El precio de Nexo pisa el de la publicación; el stock ya coincide.
  assert.ok(await hasta(() => enviados('PUT', '/items/MLA1').length > 0), 'mandó el precio de Nexo');
  assert.deepEqual(enviados('PUT', '/items/MLA1')[0].datos, { price: 15000, available_quantity: 4 });

  // Lo mismo otra vez, o algo que no es del vendedor, no se vincula.
  falso.items.set('MLA9', itemDeEjemplo('MLA9', { seller_id: 999 }));
  const otraVez = await admin.post('/api/integraciones/mercadolibre/vincular', {
    vinculos: [
      { externo_producto_id: 'MLA1', externo_variante_id: 'MLA1', producto_id: remera },
      { externo_producto_id: 'MLA9', externo_variante_id: 'MLA9', producto_id: remera }
    ]
  });
  assert.equal(otraVez.json.vinculados, 0);
  assert.deepEqual(otraVez.json.errores.map((e) => e.error), ['Ya está vinculada.', 'No es una publicación activa de tu cuenta.']);
  falso.items.delete('MLA9');

  // Un producto con variantes pide la variante.
  const sinVariante = await admin.post('/api/integraciones/mercadolibre/vincular', {
    vinculos: [{ externo_producto_id: 'MLA2', externo_variante_id: '501', producto_id: buzo }]
  });
  assert.match(sinVariante.json.errores[0].error, /variante/);
  // Y otro negocio no ve nada de esto.
  assert.equal((await otro.get('/api/integraciones/mercadolibre/publicaciones')).status, 400);
});

test('variaciones: Mercado Libre usa un precio por publicación; con precios distintos en Nexo va solo el stock', async () => {
  const r = await admin.post('/api/integraciones/mercadolibre/vincular', {
    vinculos: [
      { externo_producto_id: 'MLA2', externo_variante_id: '501', producto_id: buzo, variante_id: buzoS },
      { externo_producto_id: 'MLA2', externo_variante_id: '502', producto_id: buzo, variante_id: buzoXL }
    ]
  });
  assert.deepEqual(r.json, { vinculados: 2, errores: [] });
  assert.ok(await hasta(() => enviados('PUT', '/items/MLA2').length > 0));
  assert.deepEqual(enviados('PUT', '/items/MLA2')[0].datos, {
    variations: [
      { id: 501, available_quantity: 0 },
      { id: 502, available_quantity: 0 }
    ]
  });
  const { actividad, publicaciones_vinculadas } = await estadoDe(admin);
  assert.equal(publicaciones_vinculadas, 2);
  assert.ok(actividad.some((a) => a.resultado === 'error' && /precios distintos/.test(a.detalle)));
});

function ventaDeMercadoLibre(id, cambios = {}) {
  return {
    id: Number(id),
    status: 'paid',
    date_created: new Date().toISOString(),
    date_closed: new Date().toISOString(),
    buyer: { id: 55, nickname: 'COMPRADOR55', first_name: 'Ana', last_name: 'Paz' },
    order_items: [{ item: { id: 'MLA1', variation_id: null, title: 'Remera lisa algodón' }, quantity: 2, unit_price: 18000, sale_fee: 2000 }],
    ...cambios
  };
}

test('una venta pagada pasa a Nexo con su cobro, una sola vez, y el comprador no se duplica', async () => {
  falso.ventas.set('9001', ventaDeMercadoLibre(9001));
  // Un aviso de otra app no hace nada.
  assert.equal(await aviso({ application_id: 1, topic: 'orders_v2', resource: '/orders/9001' }), 200);
  await esperar(300);
  assert.equal((await estadoDe(admin)).pedidos_importados, 0);

  assert.equal(await aviso({ topic: 'orders_v2', resource: '/orders/9001' }), 200);
  assert.ok(await hasta(async () => (await estadoDe(admin)).pedidos_importados === 1));
  await aviso({ topic: 'orders_v2', resource: '/orders/9001' });
  await admin.post('/api/integraciones/mercadolibre/sincronizar');
  await esperar(300);

  const estado = await estadoDe(admin);
  assert.equal(estado.pedidos_importados, 1);
  const pedido = estado.pedidos.find((p) => p.externo_id === '9001');
  const venta = (await admin.get(`/api/ventas/${pedido.venta_id}`)).json;
  assert.equal(venta.cliente, 'Ana Paz');
  const cobros = (await admin.get(`/api/ventas/${pedido.venta_id}/cobros`)).json;
  assert.equal(cobros.reduce((a, c) => a + c.importe, 0), 36000);
  assert.ok(estado.actividad.some((a) => /comisión de Mercado Libre \(\$4000\) quedó como gasto/.test(a.detalle)));
  // La comisión es un gasto de la venta (hist. §129), y baja la ganancia de
  // Mercado Libre en el reporte por canal.
  assert.deepEqual(
    venta.costos_de_vender.map((c) => [c.categoria, c.importe]),
    [['Comisiones de venta', 4000]]
  );
  assert.equal(venta.canal, 'mercadolibre');
  const porCanal = (await admin.get('/api/reportes/ventas')).json.canales.find((c) => c.canal === 'mercadolibre');
  assert.equal(porCanal.ganancia, Math.round((36000 - venta.costo_total - 4000) * 100) / 100);
  assert.equal((await admin.get('/api/stock')).json.find((s) => s.producto_id === remera).stock_total, 2);

  // Otra compra del mismo comprador: mismo cliente.
  falso.ventas.set('9002', ventaDeMercadoLibre(9002, { order_items: [{ item: { id: 'MLA1', title: 'Remera' }, quantity: 1, unit_price: 18000 }] }));
  await aviso({ topic: 'orders_v2', resource: '/orders/9002' });
  assert.ok(await hasta(async () => (await estadoDe(admin)).pedidos_importados === 2));
  const clientes = (await admin.get('/api/clientes')).json;
  assert.equal(clientes.filter((c) => /Ana Paz/.test(c.nombre)).length, 1);
});

test('una venta sin pagar reserva sus unidades; cancelada, las libera', async () => {
  const antes = enviados('PUT', '/items/MLA1').length;
  falso.ventas.set('9003', ventaDeMercadoLibre(9003, { status: 'payment_required', order_items: [{ item: { id: 'MLA1', title: 'Remera' }, quantity: 1, unit_price: 18000 }] }));
  await aviso({ topic: 'orders_v2', resource: '/orders/9003' });
  assert.ok(await hasta(async () => (await estadoDe(admin)).pedidos.some((p) => p.externo_id === '9003' && p.estado === 'esperando_pago')));
  // Nexo tiene 1: publica 0 mientras se espera el pago.
  assert.ok(await hasta(() => enviados('PUT', '/items/MLA1').length > antes, 80));
  assert.equal(enviados('PUT', '/items/MLA1').at(-1).datos.available_quantity, 0);

  falso.ventas.set('9003', { ...falso.ventas.get('9003'), status: 'cancelled' });
  await aviso({ topic: 'orders_v2', resource: '/orders/9003' });
  assert.ok(await hasta(async () => (await estadoDe(admin)).pedidos.some((p) => p.externo_id === '9003' && p.estado === 'cancelado')));
  assert.ok(await hasta(() => enviados('PUT', '/items/MLA1').at(-1).datos.available_quantity === 1, 80), 'liberó la reserva');
});

test('Nexo manda: si cambian el precio en Mercado Libre, se vuelve a poner el de Nexo', async () => {
  falso.items.get('MLA1').price = 99999;
  const antes = enviados('PUT', '/items/MLA1').length;
  await aviso({ topic: 'items', resource: '/items/MLA1' });
  assert.ok(
    await hasta(async () => {
      await admin.post('/api/integraciones/mercadolibre/sincronizar');
      return enviados('PUT', '/items/MLA1').length > antes;
    }, 30)
  );
  assert.equal(enviados('PUT', '/items/MLA1').at(-1).datos.price, 15000);
  // El aviso del cambio propio no vuelve a mandar nada.
  const despues = enviados('PUT', '/items/MLA1').length;
  await aviso({ topic: 'items', resource: '/items/MLA1' });
  await esperar(300);
  await admin.post('/api/integraciones/mercadolibre/sincronizar');
  assert.equal(enviados('PUT', '/items/MLA1').length, despues);
});

test('el token vencido se renueva una sola vez aunque lo pidan dos a la par', async () => {
  // Se vuelve a conectar con un token que nace vencido (y los que da al
  // renovar, también): Nexo renueva antes de cada uso.
  falso.duracion = 600;
  const url = await urlDelPermiso(admin);
  assert.equal(await volverDeMercadoLibre(admin, { state: url.searchParams.get('state') }), 'conectada');
  const antes = falso.renovaciones;
  const [a, b] = await Promise.all([
    admin.get('/api/integraciones/mercadolibre/publicaciones'),
    admin.get('/api/integraciones/mercadolibre/publicaciones')
  ]);
  assert.equal(a.status, 200, a.texto);
  assert.equal(b.status, 200, b.texto);
  assert.ok(falso.renovaciones > antes);
  assert.equal((await estadoDe(admin)).conectada, true, 'ninguna usó un refresh token gastado');
  falso.duracion = 21600;
  await admin.get('/api/integraciones/mercadolibre/publicaciones');
});

test('si Mercado Libre ya no da permiso, queda desconectada; desvincular y desconectar', async () => {
  const { publicaciones } = (await admin.get('/api/integraciones/mercadolibre/publicaciones')).json;
  const vinculo = publicaciones.find((p) => p.externo_producto_id === 'MLA1').vinculo;
  assert.equal((await admin.post('/api/integraciones/mercadolibre/desvincular', { id: vinculo.id })).status, 200);
  assert.equal((await estadoDe(admin)).publicaciones_vinculadas, 1);

  // El vendedor sacó el permiso: el token deja de valer.
  falso.tokens.clear();
  falso.refreshes.clear();
  assert.equal((await admin.get('/api/integraciones/mercadolibre/publicaciones')).status, 409);
  await admin.post('/api/integraciones/mercadolibre/sincronizar');
  assert.equal((await estadoDe(admin)).conectada, false);
  // Las ventas que ya llegaron quedan.
  assert.equal((await estadoDe(admin)).pedidos_importados, 2);
});
