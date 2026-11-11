// Mercado Pago (hist. §130), contra un Mercado Pago falso en la misma máquina:
// el permiso con `state` firmado y PKCE, el link de pago de una venta, el
// cobro que entra solo una vez con la comisión y las cuotas como gastos de la
// venta, lo que no se cobra (de más, de otra cuenta, de otro negocio), el pago
// devuelto, "Ya me pagó" y la renovación del token, que no puede pisarse.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash, createHmac } from 'node:crypto';

import { crearCliente, crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

const APP = '7777777777777777';
const SECRETO = 'secreto-de-prueba-mp';
const CLAVE_AVISOS = 'clave-de-avisos-mp';
const CUENTA = 3131;
const VUELTA = 'https://nexo.test/api/integraciones/mercadopago/callback';

/* ---------- El Mercado Pago falso ---------- */

const falso = {
  pedidosRecibidos: [],
  tokens: new Set(),
  refreshes: new Set(),
  ultimoToken: null,
  ultimoRefresh: null,
  // Con 600 segundos, Nexo lo toma como vencido (deja una semana de margen) y
  // lo renueva en cada uso.
  duracion: 15_552_000,
  renovaciones: 0,
  emitidos: 0,
  desafios: new Map(),
  links: [],
  pagos: new Map(),
  // El QR de la caja (hist. §147): las órdenes, y si la API de Orders
  // contesta (false: como una app que no tiene permiso para usarla).
  ordenes: new Map(),
  ordenesPermitidas: true
};

function emitirToken() {
  falso.emitidos++;
  falso.ultimoToken = `APP_USR-token-${falso.emitidos}`;
  falso.ultimoRefresh = `TG-refresh-${falso.emitidos}`;
  falso.tokens.add(falso.ultimoToken);
  falso.refreshes.add(falso.ultimoRefresh);
  return {
    access_token: falso.ultimoToken,
    token_type: 'Bearer',
    expires_in: falso.duracion,
    scope: 'offline_access read write',
    user_id: CUENTA,
    refresh_token: falso.ultimoRefresh,
    public_key: 'APP_USR-publica',
    live_mode: true
  };
}

// Un pago aprobado de $30.000 en 3 cuotas sin interés: $1.500 de comisión,
// $2.000 de cuotas y $500 de retenciones (acredita $26.000).
function pagoDeEjemplo(id, ventaId, cambios = {}) {
  return {
    id,
    status: 'approved',
    status_detail: 'accredited',
    collector_id: CUENTA,
    external_reference: `nexo-venta-${ventaId}`,
    transaction_amount: 30000,
    installments: 3,
    payment_type_id: 'credit_card',
    payment_method_id: 'visa',
    payer: { email: 'compradora@mail.test', first_name: 'Ana', last_name: 'Gómez' },
    fee_details: [
      { type: 'mercadopago_fee', amount: 1500, fee_payer: 'collector' },
      { type: 'financing_fee', amount: 2000, fee_payer: 'collector' }
    ],
    transaction_details: { net_received_amount: 26000, total_paid_amount: 30000 },
    date_approved: '2026-11-03T12:00:00.000-03:00',
    money_release_date: '2026-11-17T12:00:00.000-03:00',
    date_last_updated: '2026-11-03T12:00:00.000-03:00',
    ...cambios
  };
}

function atender(req, res) {
  let cuerpo = '';
  req.on('data', (parte) => (cuerpo += parte));
  req.on('end', () => {
    const url = new URL(req.url, 'http://falso');
    const datos = cuerpo ? JSON.parse(cuerpo) : undefined;
    falso.pedidosRecibidos.push({ metodo: req.method, ruta: url.pathname, datos, query: url.searchParams, headers: req.headers });
    const responder = (status, json) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(json === undefined ? '' : JSON.stringify(json));
    };
    if (req.method === 'POST' && url.pathname === '/oauth/token') {
      if (!String(req.headers['content-type']).startsWith('application/json')) return responder(400, { error: 'invalid_request' });
      if (datos.client_id !== APP || datos.client_secret !== SECRETO) return responder(400, { error: 'invalid_client' });
      if (datos.grant_type === 'authorization_code') {
        const desafio = createHash('sha256').update(datos.code_verifier ?? '').digest('base64url');
        if (datos.code !== 'codigo-bueno' || datos.redirect_uri !== VUELTA || !falso.desafios.has(desafio)) {
          return responder(400, { error: 'invalid_grant', message: 'Código inválido' });
        }
        return responder(200, emitirToken());
      }
      if (datos.grant_type === 'refresh_token') {
        if (!falso.refreshes.delete(datos.refresh_token)) return responder(400, { error: 'invalid_grant', message: 'already used' });
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
      return responder(200, { id: CUENTA, nickname: 'ROPASUR.MP', email: 'ropa@mail.test' });
    }
    if (req.method === 'POST' && ruta === '/checkout/preferences') {
      falso.links.push({ datos, idempotencia: req.headers['x-idempotency-key'] });
      const id = `pref-${falso.links.length}`;
      return responder(201, { id, init_point: `https://mp.test/checkout?pref_id=${id}`, external_reference: datos.external_reference });
    }
    if (req.method === 'POST' && ruta === `/users/${CUENTA}/stores`) {
      if (!datos?.name || !datos?.location?.street_name) return responder(400, { error: 'validation_error', message: 'Name must be defined' });
      return responder(200, { id: 1234567, name: datos.name, external_id: datos.external_id });
    }
    if (req.method === 'POST' && ruta === '/pos') {
      if (!/^[A-Za-z0-9]+$/.test(datos?.external_id ?? '')) return responder(400, { error: 'INVALID_EXTERNAL_ID' });
      return responder(200, {
        id: 2711382,
        external_id: datos.external_id,
        store_id: datos.store_id,
        status: 'active',
        qr: { image: 'https://mp.test/qr/2711382.png', template_document: 'https://mp.test/qr/2711382.pdf', template_image: 'https://mp.test/qr/2711382-cartel.png' }
      });
    }
    if (req.method === 'POST' && ruta === '/v1/orders') {
      if (!falso.ordenesPermitidas) return responder(403, { error: 'forbidden', message: 'Application not allowed' });
      if (!req.headers['x-idempotency-key']) return responder(400, { error: 'empty_required_header' });
      const id = `ORD${falso.ordenes.size + 1}`;
      const orden = {
        id,
        type: 'qr',
        status: 'created',
        external_reference: datos.external_reference,
        total_amount: datos.total_amount,
        config: datos.config,
        transactions: { payments: [{ id: `PAY${id}`, amount: datos.total_amount, status: 'created' }] },
        type_response: { qr_data: `00020101021243650016COM.MERCADOLIBRE${id}` }
      };
      falso.ordenes.set(id, orden);
      return responder(201, orden);
    }
    if (req.method === 'GET' && ruta.startsWith('/v1/orders/')) {
      const orden = falso.ordenes.get(ruta.split('/')[3]);
      return orden ? responder(200, orden) : responder(404, { message: 'Order not found' });
    }
    if (req.method === 'POST' && /^\/v1\/orders\/[^/]+\/cancel$/.test(ruta)) {
      const orden = falso.ordenes.get(ruta.split('/')[3]);
      if (!orden || orden.status !== 'created') return responder(409, { message: 'cannot cancel' });
      orden.status = 'canceled';
      return responder(200, orden);
    }
    if (req.method === 'GET' && ruta === '/v1/payments/search') {
      const referencia = url.searchParams.get('external_reference');
      const pagos = [...falso.pagos.values()].filter((p) => !referencia || p.external_reference === referencia);
      return responder(200, { results: pagos, paging: { total: pagos.length, limit: 50, offset: 0 } });
    }
    if (req.method === 'GET' && ruta.startsWith('/v1/payments/')) {
      const pago = falso.pagos.get(ruta.split('/')[3]);
      return pago ? responder(200, pago) : responder(404, { message: 'Payment not found' });
    }
    responder(404, { message: `No existe ${req.method} ${ruta}` });
  });
}

let servidorFalso;
let servidor;
let admin;
let otro;
let empleado;
let remera;

const enviados = (metodo, ruta) => falso.pedidosRecibidos.filter((p) => p.metodo === metodo && p.ruta === ruta);
const estadoDe = async (cliente) => (await cliente.get('/api/integraciones/mercadopago')).json;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(condicion, intentos = 60) {
  for (let i = 0; i < intentos; i++) {
    if (await condicion()) return true;
    await esperar(100);
  }
  return false;
}

async function urlDelPermiso(cliente) {
  const url = new URL((await cliente.post('/api/integraciones/mercadopago/conectar')).json.url);
  falso.desafios.set(url.searchParams.get('code_challenge'), true);
  return url;
}
async function volverDeMercadoPago(cliente, { code = 'codigo-bueno', state }) {
  const consulta = new URLSearchParams({ code, ...(state === undefined ? {} : { state }) });
  const r = await cliente.pedir('GET', `/api/integraciones/mercadopago/callback?${consulta}`, undefined, {}, { redirect: 'manual' });
  assert.equal(r.status, 302);
  const destino = new URL(r.headers.get('location'), 'http://nexo');
  assert.equal(destino.hash, '#/configuracion/mercado-pago');
  return destino.searchParams.get('mercadopago');
}

// Un aviso como lo manda Mercado Pago (formato webhook), firmado con la clave
// de avisos salvo que se pida otra cosa.
async function aviso(pagoId, { cuenta = CUENTA, firmar = true } = {}) {
  const ts = String(Date.now());
  const pedidoId = `req-${pagoId}-${ts}`;
  const v1 = createHmac('sha256', firmar ? CLAVE_AVISOS : 'otra-clave').update(`id:${pagoId};request-id:${pedidoId};ts:${ts};`).digest('hex');
  const res = await fetch(`${servidor.url}/api/integraciones/mercadopago/notificaciones?data.id=${pagoId}&type=payment&cuenta=${cuenta}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': pedidoId },
    body: JSON.stringify({ action: 'payment.created', type: 'payment', data: { id: String(pagoId) }, user_id: cuenta, live_mode: true })
  });
  return res.status;
}

const nuevaVenta = async (cliente, precio = 30000, producto = remera) =>
  (await cliente.post('/api/ventas', { cliente: 'Consumidor final', items: [{ producto_id: producto, cantidad: 1, precio_unitario: precio }] })).json.id;
const cobrosDe = async (ventaId) => (await admin.get(`/api/ventas/${ventaId}/cobros`)).json;

before(async () => {
  servidorFalso = createServer(atender);
  await new Promise((r) => servidorFalso.listen(0, '127.0.0.1', r));
  const urlFalso = `http://127.0.0.1:${servidorFalso.address().port}`;
  servidor = await levantarServidor({
    env: {
      MERCADOPAGO_APP_ID: APP,
      MERCADOPAGO_CLIENT_SECRET: SECRETO,
      MERCADOPAGO_WEBHOOK_SECRET: CLAVE_AVISOS,
      MERCADOPAGO_AUTH_URL: urlFalso,
      MERCADOPAGO_API_URL: urlFalso,
      NEXO_URL_PUBLICA: 'https://nexo.test'
    }
  });
  admin = await registrarEmpresa(servidor, { empresa: 'Ropa Sur', usuario: 'ropa' });
  otro = await registrarEmpresa(servidor, { empresa: 'Kiosco Norte', usuario: 'kiosco' });
  empleado = await crearEmpleado(servidor, admin, { usuario: 'vendedora' });
  remera = (await admin.post('/api/productos', { nombre: 'Remera', precio_venta: 30000, tipo: 'servicio' })).json.id;
});

after(async () => {
  await servidor?.cerrar();
  servidorFalso?.close();
});

test('sin conectar: se ofrece al admin, el empleado no lo ve, y no hay link', async () => {
  assert.deepEqual(await estadoDe(admin), { disponible: true, conectada: false, plan_lo_incluye: true });
  assert.equal((await empleado.get('/api/integraciones/mercadopago')).status, 403);
  assert.equal((await empleado.post('/api/integraciones/mercadopago/conectar')).status, 403);
  assert.equal((await admin.get('/api/negocio')).json.mercado_pago.conectado, false);
  const venta = await nuevaVenta(admin);
  const link = await admin.post(`/api/ventas/${venta}/link-de-pago`);
  assert.equal(link.status, 409);
  assert.match(link.json.error, /conectar Mercado Pago/);
});

test('el permiso: la URL lleva platform_id, state, PKCE y la vuelta exacta; un state trucho o ajeno no conecta', async () => {
  const url = await urlDelPermiso(admin);
  assert.equal(url.pathname, '/authorization');
  assert.equal(url.searchParams.get('client_id'), APP);
  assert.equal(url.searchParams.get('platform_id'), 'mp');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('redirect_uri'), VUELTA);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  const state = url.searchParams.get('state');

  assert.equal(await volverDeMercadoPago(crearCliente(servidor.url), { state }), 'sin-sesion');
  assert.equal(await volverDeMercadoPago(otro, { state }), 'error');
  assert.equal(await volverDeMercadoPago(admin, { state: `${state.split('.')[0]}.firma-trucha` }), 'error');
  assert.equal(await volverDeMercadoPago(admin, { code: 'codigo-malo', state }), 'error');
  assert.equal((await estadoDe(admin)).conectada, false);
});

test('conectar: guarda la cuenta con el permiso cifrado; otro negocio no puede usar la misma', async () => {
  const url = await urlDelPermiso(admin);
  assert.equal(await volverDeMercadoPago(admin, { state: url.searchParams.get('state') }), 'conectada');
  const estado = await estadoDe(admin);
  assert.equal(estado.conectada, true);
  assert.equal(estado.cuenta.nombre, 'ROPASUR.MP');
  assert.equal(estado.cuenta.id, String(CUENTA));
  // Lo cobrado entra, de entrada, en la cuenta "Mercado Pago" de Caja.
  const cuentas = (await admin.get('/api/cuentas-tesoreria')).json;
  assert.equal(cuentas.find((c) => c.id === estado.cuenta_tesoreria_id)?.tipo, 'mercadopago');
  assert.ok(!JSON.stringify(estado).includes(falso.ultimoToken));
  const exportado = await admin.get('/api/negocio/exportar');
  assert.ok(!exportado.texto.includes(falso.ultimoToken));
  assert.ok(!exportado.texto.includes(falso.ultimoRefresh));
  // Los dos roles saben que se puede cobrar con link.
  assert.equal((await empleado.get('/api/negocio')).json.mercado_pago.conectado, true);

  const urlOtro = await urlDelPermiso(otro);
  assert.equal(await volverDeMercadoPago(otro, { state: urlOtro.searchParams.get('state') }), 'en-otro-negocio');
  assert.equal((await estadoDe(otro)).conectada, false);
  // Conectar Mercado Pago no es vender online: la guía no lo da por hecho.
  assert.equal((await admin.get('/api/negocio/primeros-pasos')).json.venta_online, false);
});

let ventaA;

test('el link de pago: por lo que falta cobrar, con la venta como referencia y el aviso a Nexo', async () => {
  ventaA = await nuevaVenta(admin);
  const link = await empleado.post(`/api/ventas/${ventaA}/link-de-pago`);
  assert.equal(link.status, 200, link.texto);
  assert.equal(link.json.importe, 30000);
  assert.match(link.json.url, /^https:\/\/mp\.test\/checkout/);
  const { datos, idempotencia } = falso.links.at(-1);
  assert.equal(datos.external_reference, `nexo-venta-${ventaA}`);
  assert.equal(datos.items[0].unit_price, 30000);
  assert.equal(datos.items[0].currency_id, 'ARS');
  assert.equal(datos.notification_url, `https://nexo.test/api/integraciones/mercadopago/notificaciones?cuenta=${CUENTA}`);
  assert.ok(idempotencia, 'cada link lleva su clave de idempotencia');

  // Una seña: menos que lo que falta, nunca más.
  assert.equal((await admin.post(`/api/ventas/${ventaA}/link-de-pago`, { importe: 10000 })).json.importe, 10000);
  assert.equal((await admin.post(`/api/ventas/${ventaA}/link-de-pago`, { importe: 40000 })).status, 400);
  assert.equal((await admin.post(`/api/ventas/${ventaA}/link-de-pago`, { importe: -5 })).status, 400);
  // La venta de otro negocio no existe para este.
  const ajena = await nuevaVenta(otro, 1000, (await otro.post('/api/productos', { nombre: 'Alfajor', precio_venta: 1000, tipo: 'servicio' })).json.id);
  assert.equal((await admin.post(`/api/ventas/${ajena}/link-de-pago`)).status, 404);
  // Crear el link no cobra nada.
  assert.deepEqual(await cobrosDe(ventaA), []);
});

test('el pago aprobado entra una sola vez: cobro, comisión y cuotas como gastos, retenciones aparte', async () => {
  falso.pagos.set('9001', pagoDeEjemplo(9001, ventaA));
  // Sin firma válida, el aviso se ignora.
  assert.equal(await aviso(9001, { firmar: false }), 200);
  await esperar(300);
  assert.deepEqual(await cobrosDe(ventaA), []);

  assert.equal(await aviso(9001), 200);
  assert.ok(await hasta(async () => (await cobrosDe(ventaA)).length === 1), 'el cobro entra solo');
  // Mercado Pago repite los avisos: no cobra dos veces.
  await aviso(9001);
  await aviso(9001);
  await esperar(300);
  const cobros = await cobrosDe(ventaA);
  assert.equal(cobros.length, 1);
  assert.equal(cobros[0].importe, 30000);
  assert.equal(cobros[0].cuenta, 'Mercado Pago');
  assert.equal(cobros[0].nota, 'Mercado Pago, pago 9001 (tarjeta de crédito en 3 cuotas)');

  const venta = (await admin.get(`/api/ventas/${ventaA}`)).json;
  assert.equal(venta.estado_cobro, 'cobrado');
  const costos = venta.costos_de_vender.map((c) => [c.categoria, c.importe]).sort();
  assert.deepEqual(costos, [['Comisiones de venta', 1500], ['Cuotas sin interés', 2000]]);
  // La descripción dice qué parte del pago se llevó (hist. §131).
  assert.deepEqual(venta.costos_de_vender.map((c) => c.descripcion.match(/\((.+) del pago\)/)[1]).sort(), ['5\u00a0%', '6,67\u00a0%']);
  // Adónde fue la plata: cada costo con su porcentaje de la venta, y lo que quedó.
  const desglose = venta.desglose_costos;
  assert.equal(desglose.base, 30000);
  const comision = desglose.filas.find((f) => f.nombre === 'Comisiones de venta');
  assert.equal(comision.importe, 1500);
  assert.equal(comision.pct, 0.05);
  assert.equal(desglose.filas.find((f) => f.nombre === 'Cuotas sin interés').importe, 2000);
  const costosTotales = desglose.filas.reduce((acc, f) => acc + f.importe, 0);
  assert.equal(desglose.quedo.importe, 30000 - costosTotales);
  // El empleado no ve los costos de vender ni el desglose.
  const deEmpleado = (await empleado.get(`/api/ventas/${ventaA}`)).json;
  assert.equal(deEmpleado.costos_de_vender, undefined);
  assert.equal(deEmpleado.desglose_costos, undefined);

  const estado = await estadoDe(admin);
  assert.equal(estado.cobrados, 1);
  const pago = estado.pagos.find((p) => p.externo_id === '9001');
  assert.equal(pago.estado, 'cobrado');
  assert.equal(pago.venta_id, ventaA);
  assert.equal(pago.retenciones, 500);
  assert.equal(pago.neto, 26000);
  assert.equal(pago.libera_en, '2026-11-17T12:00:00.000-03:00');
  assert.ok(estado.actividad.some((a) => a.tipo === 'pago' && /retuvo además \$500/.test(a.detalle)));

  // La caja: entra lo cobrado y salen la comisión y las cuotas ($26.500; las
  // retenciones no se registran).
  const { cuentas } = (await admin.get('/api/tesoreria')).json;
  assert.equal(cuentas.find((c) => c.id === estado.cuenta_tesoreria_id).saldo, 26500);
});

test('lo que no se cobra solo: de más, de otra cuenta y de otro negocio', async () => {
  // Otro pago sobre la misma venta, ya cobrada: queda sin asignar.
  falso.pagos.set('9002', pagoDeEjemplo(9002, ventaA, { transaction_amount: 5000, fee_details: [], transaction_details: { net_received_amount: 5000 } }));
  await aviso(9002);
  let estado;
  assert.ok(
    await hasta(async () => {
      estado = await estadoDe(admin);
      return estado.pagos.some((p) => p.externo_id === '9002');
    })
  );
  const deMas = estado.pagos.find((p) => p.externo_id === '9002');
  assert.equal(deMas.estado, 'sin_asignar');
  assert.match(deMas.motivo, /ya estaba cobrada/);
  assert.equal(estado.pagos[0].externo_id, '9002', 'lo que pide atención va primero');
  assert.equal((await cobrosDe(ventaA)).length, 1);
  // Marcarlo como visto.
  assert.equal((await empleado.post(`/api/integraciones/mercadopago/pagos/${deMas.id}/revisado`)).status, 403);
  assert.equal((await admin.post(`/api/integraciones/mercadopago/pagos/${deMas.id}/revisado`)).status, 200);
  assert.ok((await estadoDe(admin)).pagos.find((p) => p.id === deMas.id).revisado_en);
  const cobrado = (await estadoDe(admin)).pagos.find((p) => p.externo_id === '9001');
  assert.equal((await admin.post(`/api/integraciones/mercadopago/pagos/${cobrado.id}/revisado`)).status, 404);

  // Un pago de otra cuenta de Mercado Pago (collector_id ajeno) no se toca.
  const ventaB = await nuevaVenta(admin);
  falso.pagos.set('9003', pagoDeEjemplo(9003, ventaB, { collector_id: 999 }));
  await aviso(9003);
  // La referencia a una venta de otro negocio: no se cobra en ninguno.
  const productoOtro = (await otro.post('/api/productos', { nombre: 'Chicle', precio_venta: 30000, tipo: 'servicio' })).json.id;
  const ventaDelOtro = await nuevaVenta(otro, 30000, productoOtro);
  falso.pagos.set('9004', pagoDeEjemplo(9004, ventaDelOtro));
  await aviso(9004);
  assert.ok(await hasta(async () => (await estadoDe(admin)).pagos.some((p) => p.externo_id === '9004')));
  estado = await estadoDe(admin);
  assert.ok(!estado.pagos.some((p) => p.externo_id === '9003'));
  const ajeno = estado.pagos.find((p) => p.externo_id === '9004');
  assert.equal(ajeno.estado, 'sin_asignar');
  assert.equal(ajeno.venta_id, null);
  assert.match(ajeno.motivo, /no existe en este negocio/);
  assert.deepEqual(await cobrosDe(ventaB), []);
  assert.deepEqual((await otro.get(`/api/ventas/${ventaDelOtro}/cobros`)).json, []);

  // Pendiente: todavía no hay plata, no se anota nada.
  falso.pagos.set('9005', pagoDeEjemplo(9005, ventaB, { status: 'pending', status_detail: 'pending_waiting_payment' }));
  await aviso(9005);
  await esperar(300);
  assert.ok(!(await estadoDe(admin)).pagos.some((p) => p.externo_id === '9005'));
});

test('un pago devuelto después de cobrado: se avisa y el cobro no se toca', async () => {
  falso.pagos.set('9001', pagoDeEjemplo(9001, ventaA, { status: 'refunded', status_detail: 'refunded' }));
  assert.equal((await admin.post('/api/integraciones/mercadopago/sincronizar')).status, 200);
  const estado = await estadoDe(admin);
  const devuelto = estado.pagos.find((p) => p.externo_id === '9001');
  assert.equal(devuelto.estado, 'devuelto');
  assert.ok(estado.actividad.some((a) => a.resultado === 'error' && /se devolvió en Mercado Pago/.test(a.detalle)));
  assert.equal((await cobrosDe(ventaA)).length, 1);
  // Volver a pasar no lo repite.
  await admin.post('/api/integraciones/mercadopago/sincronizar');
  const avisos = (await estadoDe(admin)).actividad.filter((a) => /9001 de la venta .* se devolvió/.test(a.detalle));
  assert.equal(avisos.length, 1);
});

test('"Ya me pagó": busca los pagos de la venta aunque no haya llegado el aviso', async () => {
  const venta = await nuevaVenta(admin, 12000);
  falso.pagos.set(
    '9010',
    pagoDeEjemplo(9010, venta, { transaction_amount: 12000, installments: 1, payment_type_id: 'account_money', fee_details: [{ type: 'mercadopago_fee', amount: 700, fee_payer: 'collector' }], transaction_details: { net_received_amount: 11300 } })
  );
  const r = await empleado.post(`/api/ventas/${venta}/revisar-pagos`);
  assert.equal(r.status, 200, r.texto);
  assert.deepEqual(r.json, { cobrados: 1, sin_asignar: 0 });
  assert.equal((await cobrosDe(venta))[0].nota, 'Mercado Pago, pago 9010 (dinero en Mercado Pago)');
  // Otra vez: ya estaba.
  assert.deepEqual((await empleado.post(`/api/ventas/${venta}/revisar-pagos`)).json, { cobrados: 0, sin_asignar: 0 });
  assert.equal((await cobrosDe(venta)).length, 1);
});

test('el QR del mostrador (hist. §145): sin cobros a consumidor final, el pago la cobra, y la que no se pagó la cancela quien vende', async () => {
  const caja = (await admin.get('/api/cuentas-tesoreria')).json.find((c) => c.tipo === 'efectivo');
  const saldo = (await admin.get('/api/tesoreria')).json.cuentas.find((c) => c.id === caja.id).saldo;
  const turno = (await empleado.post('/api/turnos-caja', { cuenta_tesoreria_id: caja.id, contado: saldo })).json.id;
  const items = [{ producto_id: remera, cantidad: 1, precio_unitario: 30000 }];
  // Sin QR, a "Consumidor final" no se le deja saldo; con QR, todo va por el QR.
  assert.equal((await empleado.post('/api/pos/ventas', { turno_caja_id: turno, items, cobros: [] })).status, 400);
  const mezclado = { turno_caja_id: turno, items, cobros: [{ cuenta_tesoreria_id: caja.id, importe: 1000 }], qr_mercadopago: true };
  assert.equal((await empleado.post('/api/pos/ventas', mezclado)).status, 400);

  const conQr = await empleado.post('/api/pos/ventas', { turno_caja_id: turno, items, cobros: [], qr_mercadopago: true });
  assert.equal(conQr.status, 201, conQr.texto);
  const link = await empleado.post(`/api/ventas/${conQr.json.id}/link-de-pago`);
  assert.equal(link.json.importe, 30000);
  falso.pagos.set('9020', pagoDeEjemplo(9020, conQr.json.id));
  assert.equal(await aviso(9020), 200);
  assert.ok(await hasta(async () => (await cobrosDe(conQr.json.id)).length === 1), 'el pago del QR la cobra');
  // Ya cobrada: no se cancela.
  assert.equal((await empleado.post(`/api/pos/ventas/${conQr.json.id}/cancelar-qr`)).status, 409);

  // La que no se pagó se anula, y una sola vez.
  const sinPagar = (await empleado.post('/api/pos/ventas', { turno_caja_id: turno, items, cobros: [], qr_mercadopago: true })).json.id;
  const cancelada = await empleado.post(`/api/pos/ventas/${sinPagar}/cancelar-qr`);
  assert.equal(cancelada.status, 200, cancelada.texto);
  assert.equal((await admin.get(`/api/ventas/${sinPagar}`)).json.estado, 'anulada');
  assert.equal((await empleado.post(`/api/pos/ventas/${sinPagar}/cancelar-qr`)).status, 404);
  // Una venta que no espera un QR no se anula por acá, ni la de otro negocio.
  assert.equal((await empleado.post(`/api/pos/ventas/${await nuevaVenta(admin, 5000)}/cancelar-qr`)).status, 404);
  const otraQr = (await empleado.post('/api/pos/ventas', { turno_caja_id: turno, items, cobros: [], qr_mercadopago: true })).json.id;
  assert.equal((await otro.post(`/api/pos/ventas/${otraQr}/cancelar-qr`)).status, 404);
  assert.equal((await empleado.post(`/api/pos/ventas/${otraQr}/cancelar-qr`)).status, 200);
});

test('el QR de la caja (hist. §147): se arma una vez con su cartel, cobra con una orden y, si Mercado Pago no la deja, cae al link', async () => {
  const turno = (await admin.get('/api/turnos-caja?estado=abierto')).json[0]?.id;
  assert.ok(turno, 'hay un turno abierto del test anterior');
  const items = [{ producto_id: remera, cantidad: 1, precio_unitario: 30000 }];
  const ventaQr = async () => (await empleado.post('/api/pos/ventas', { turno_caja_id: turno, items, cobros: [], qr_mercadopago: true })).json.id;

  // Sin caja, el QR es el del link.
  const sinCaja = await empleado.post(`/api/ventas/${await ventaQr()}/qr`);
  assert.equal(sinCaja.status, 200, sinCaja.texto);
  assert.match(sinCaja.json.url, /^https:\/\/mp\.test\/checkout/);

  // Armar la caja es del admin, y pide la dirección del local.
  const direccion = { calle: 'Rivera Indarte', numero: '182', ciudad: 'Córdoba', provincia: 'Córdoba' };
  assert.equal((await empleado.post('/api/integraciones/mercadopago/caja', direccion)).status, 403);
  assert.equal((await admin.post('/api/integraciones/mercadopago/caja', { ...direccion, numero: '' })).status, 400);
  const armada = await admin.post('/api/integraciones/mercadopago/caja', direccion);
  assert.equal(armada.status, 200, armada.texto);
  const conCaja = await estadoDe(admin);
  assert.equal(conCaja.qr_caja, true);
  // El cartel del QR fijo, para imprimir.
  assert.deepEqual(conCaja.qr_cartel, { pdf: 'https://mp.test/qr/2711382.pdf', imagen: 'https://mp.test/qr/2711382-cartel.png' });
  assert.equal(enviados('POST', '/pos').at(-1).datos.store_id, '1234567');

  // Con caja: una orden dinámica por el total, con la venta como referencia.
  const venta = await ventaQr();
  const qr = await empleado.post(`/api/ventas/${venta}/qr`);
  assert.equal(qr.status, 200, qr.texto);
  assert.equal(qr.json.tipo, 'caja');
  assert.match(qr.json.qr, /^0002010102/);
  const pedido = enviados('POST', '/v1/orders').at(-1);
  // Híbrido: lo cobran el QR de la pantalla y el cartel impreso de la caja.
  assert.equal(pedido.datos.config.qr.mode, 'hybrid');
  assert.equal(pedido.datos.total_amount, '30000.00');
  assert.equal(pedido.datos.external_reference, `nexo-venta-${venta}`);
  assert.ok(pedido.headers['x-idempotency-key']);

  // Todavía sin pagar: "Ya me pagó" no cobra nada.
  assert.deepEqual((await empleado.post(`/api/ventas/${venta}/revisar-pagos`)).json, { cobrados: 0, sin_asignar: 0 });
  // Se paga: la orden pasa a processed y el pago, sin la referencia, se cobra
  // igual en esa venta, con su comisión.
  const orden = [...falso.ordenes.values()].at(-1);
  orden.status = 'processed';
  orden.transactions.payments[0].reference = { id: '9030' };
  falso.pagos.set('9030', pagoDeEjemplo(9030, venta, { external_reference: null, installments: 1, payment_type_id: 'account_money' }));
  assert.equal((await empleado.post(`/api/ventas/${venta}/revisar-pagos`)).json.cobrados, 1);
  assert.equal((await cobrosDe(venta)).length, 1);

  // La que no se pagó: cancelar anula la venta y cancela la orden.
  const otraVenta = await ventaQr();
  await empleado.post(`/api/ventas/${otraVenta}/qr`);
  assert.equal((await empleado.post(`/api/pos/ventas/${otraVenta}/cancelar-qr`)).status, 200);
  assert.equal([...falso.ordenes.values()].at(-1).status, 'canceled');

  // Si Mercado Pago no deja usar la API de Orders, cae al link sin frenar.
  falso.ordenesPermitidas = false;
  const conLink = await empleado.post(`/api/ventas/${await ventaQr()}/qr`);
  assert.equal(conLink.status, 200, conLink.texto);
  assert.ok(conLink.json.url && !conLink.json.qr);
  falso.ordenesPermitidas = true;
});

test('el token vencido se renueva de a uno, aunque lo pidan dos a la vez', async () => {
  // El próximo token que dé el falso dura 600 segundos: Nexo lo toma por
  // vencido y lo renueva en cada uso. Se fuerza con un permiso nuevo.
  falso.duracion = 600;
  const url = await urlDelPermiso(admin);
  assert.equal(await volverDeMercadoPago(admin, { state: url.searchParams.get('state') }), 'conectada');
  const antes = falso.renovaciones;
  const venta = await nuevaVenta(admin, 5000);
  const [a, b] = await Promise.all([
    admin.post(`/api/ventas/${venta}/link-de-pago`),
    empleado.post(`/api/ventas/${venta}/link-de-pago`)
  ]);
  assert.equal(a.status, 200, a.texto);
  assert.equal(b.status, 200, b.texto);
  assert.equal(falso.renovaciones, antes + 1, 'una sola renovación para los dos pedidos');
  assert.equal((await estadoDe(admin)).conectada, true);
  falso.duracion = 15_552_000;
});

test('desconectar: los links dejan de ofrecerse y los avisos ya no entran', async () => {
  assert.equal((await empleado.post('/api/integraciones/mercadopago/desconectar')).status, 403);
  assert.equal((await admin.post('/api/integraciones/mercadopago/desconectar')).status, 200);
  assert.equal((await estadoDe(admin)).conectada, false);
  assert.equal((await admin.get('/api/negocio')).json.mercado_pago.conectado, false);
  const venta = await nuevaVenta(admin);
  assert.equal((await admin.post(`/api/ventas/${venta}/link-de-pago`)).status, 409);
  falso.pagos.set('9020', pagoDeEjemplo(9020, venta));
  const pedidosAntes = enviados('GET', '/v1/payments/9020').length;
  await aviso(9020);
  await esperar(300);
  assert.equal(enviados('GET', '/v1/payments/9020').length, pedidosAntes, 'sin conexión no se pide el pago');
  assert.deepEqual(await cobrosDe(venta), []);
});
