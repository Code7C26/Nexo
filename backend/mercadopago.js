// Mercado Pago: cobrar con un link y que el cobro entre solo (CLAUDE.md §32,
// hist. §130). Como mercadolibre.js, este archivo solo habla con Mercado Pago:
// - el permiso del negocio (OAuth con PKCE): la URL para autorizar, el canje
//   del código y la renovación del token;
// - la API (la cuenta, crear el link de pago, leer y buscar pagos);
// - la firma del `state` del permiso, el cifrado del token y la firma de los
//   avisos;
// - el desglose de un pago: lo cobrado, la comisión, el costo de las cuotas
//   sin interés y las retenciones.
//
// A diferencia de Mercado Libre, el token dura 180 días; el refresh token
// cambia igual en cada renovación, así que server.js renueva de a uno por vez.
//
// El aviso de un pago es solo un "andá a mirar": server.js pide el pago a la
// API con el token del negocio y usa lo que devuelve. Si la app tiene clave de
// avisos (MERCADOPAGO_WEBHOOK_SECRET), además se descarta el aviso sin firma.
//
// MERCADOPAGO_AUTH_URL y MERCADOPAGO_API_URL cambian las direcciones: los
// tests las apuntan a un Mercado Pago falso en la misma máquina.
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

const ESPERA_MAXIMA_MS = 20_000;

export class MercadoPagoError extends Error {
  // status: el HTTP de Mercado Pago, si contestó. transitorio: no hubo
  // respuesta o fue un 5xx/429. codigo: el `error` de su respuesta.
  constructor(mensaje, { status = null, transitorio = false, codigo = null } = {}) {
    super(mensaje);
    this.status = status;
    this.transitorio = transitorio;
    this.codigo = codigo;
  }
}

const appId = () => process.env.MERCADOPAGO_APP_ID;
const secreto = () => process.env.MERCADOPAGO_CLIENT_SECRET;
const claveDeAvisos = () => process.env.MERCADOPAGO_WEBHOOK_SECRET;
const urlAuth = () => (process.env.MERCADOPAGO_AUTH_URL || 'https://auth.mercadopago.com').replace(/\/+$/, '');
const urlApi = () => (process.env.MERCADOPAGO_API_URL || 'https://api.mercadopago.com').replace(/\/+$/, '');

export const mercadoPagoConfigurado = () => Boolean(appId() && secreto());

/* ---------- El permiso (OAuth) ---------- */

// Igual que en Mercado Libre: el `state` lleva el negocio y la persona, con
// vencimiento, firmado con el secreto de la app, y el code_verifier de PKCE
// sale del mismo `state`.
const ESTADO_DURACION_MS = 15 * 60 * 1000;
const firmar = (texto) => createHmac('sha256', secreto()).update(`estado:${texto}`).digest('base64url');
const verificadorDe = (estado) => createHmac('sha256', secreto()).update(`pkce:${estado}`).digest('base64url');

function iguales(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function firmarEstado({ usuarioId, organizacionId }, ahora = Date.now()) {
  const datos = Buffer.from(JSON.stringify({ u: usuarioId, o: organizacionId, e: ahora + ESTADO_DURACION_MS })).toString(
    'base64url'
  );
  return `${datos}.${firmar(datos)}`;
}

export function leerEstado(estado, ahora = Date.now()) {
  if (typeof estado !== 'string' || !mercadoPagoConfigurado()) return null;
  const [datos, firma] = estado.split('.');
  if (!datos || !firma || !iguales(firma, firmar(datos))) return null;
  try {
    const { u, o, e } = JSON.parse(Buffer.from(datos, 'base64url').toString('utf8'));
    if (!Number.isInteger(u) || !Number.isInteger(o) || !(e > ahora)) return null;
    return { usuarioId: u, organizacionId: o };
  } catch {
    return null;
  }
}

// La dirección de vuelta tiene que ser idéntica a la cargada en la app de
// Mercado Pago: la arma server.js con la dirección pública de Nexo.
export function urlDeAutorizacion(estado, redireccion) {
  const desafio = createHash('sha256').update(verificadorDe(estado)).digest('base64url');
  const params = new URLSearchParams({
    client_id: appId(),
    response_type: 'code',
    platform_id: 'mp',
    state: estado,
    redirect_uri: redireccion,
    code_challenge: desafio,
    code_challenge_method: 'S256'
  });
  return `${urlAuth()}/authorization?${params}`;
}

// Lo que devuelve Mercado Pago al dar o renovar el permiso. `vence` deja una
// semana de margen: se renueva bastante antes de que deje de servir.
function permisoDe(json) {
  if (!json?.access_token || !json.refresh_token || json.user_id == null) {
    throw new MercadoPagoError(json?.message || json?.error_description || 'Mercado Pago no dio el permiso.');
  }
  const duracion = (Number(json.expires_in) || 15_552_000) * 1000;
  return {
    token: json.access_token,
    refresh: json.refresh_token,
    vence: Date.now() + duracion - 7 * 24 * 60 * 60 * 1000,
    usuarioId: String(json.user_id)
  };
}

async function pedirToken(campos) {
  const { json } = await llamar(`${urlApi()}/oauth/token`, {
    method: 'POST',
    body: { client_id: appId(), client_secret: secreto(), ...campos }
  });
  return permisoDe(json);
}

// El código que manda Mercado Pago al callback sirve una sola vez, por 10
// minutos.
export const canjearCodigo = (codigo, estado, redireccion) =>
  pedirToken({ grant_type: 'authorization_code', code: codigo, redirect_uri: redireccion, code_verifier: verificadorDe(estado) });

// Un invalid_grant es que el permiso ya no vale: se marca como 401, que
// desconecta la integración.
export async function renovarPermiso(refresh) {
  try {
    return await pedirToken({ grant_type: 'refresh_token', refresh_token: refresh });
  } catch (err) {
    if (err.codigo === 'invalid_grant' || err.status === 401) {
      throw new MercadoPagoError('Mercado Pago ya no le da permiso a Nexo: volvé a conectar tu cuenta.', { status: 401 });
    }
    throw err;
  }
}

/* ---------- El permiso, cifrado en la base ---------- */

const claveDelToken = () => Buffer.from(hkdfSync('sha256', secreto(), 'nexo', 'mercadopago:token', 32));

export function cifrarPermiso({ token, refresh, vence }) {
  const iv = randomBytes(12);
  const cifrador = createCipheriv('aes-256-gcm', claveDelToken(), iv);
  const texto = JSON.stringify({ t: token, r: refresh, v: vence });
  const cifrado = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()]);
  return ['v1', iv.toString('base64url'), cifrador.getAuthTag().toString('base64url'), cifrado.toString('base64url')].join(
    '.'
  );
}

export function descifrarPermiso(texto) {
  const [version, iv, etiqueta, cifrado] = String(texto ?? '').split('.');
  if (version !== 'v1' || !iv || !etiqueta || !cifrado || !mercadoPagoConfigurado()) return null;
  try {
    const descifrador = createDecipheriv('aes-256-gcm', claveDelToken(), Buffer.from(iv, 'base64url'));
    descifrador.setAuthTag(Buffer.from(etiqueta, 'base64url'));
    const { t, r, v } = JSON.parse(
      Buffer.concat([descifrador.update(Buffer.from(cifrado, 'base64url')), descifrador.final()]).toString('utf8')
    );
    return t && r ? { token: t, refresh: r, vence: Number(v) || 0 } : null;
  } catch {
    return null;
  }
}

/* ---------- La firma de los avisos ---------- */

// x-signature trae "ts=…,v1=…": v1 es el HMAC-SHA256 (en hex), con la clave de
// avisos de la app, de "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" (lo
// que falte no va). Sin clave configurada no hay con qué comparar: vale igual,
// porque el pago se lee siempre de la API.
export function avisoFirmado({ firma, pedidoId, dataId }) {
  const clave = claveDeAvisos();
  if (!clave) return true;
  const partes = Object.fromEntries(
    String(firma ?? '')
      .split(',')
      .map((p) => p.trim().split('='))
      .filter(([k, v]) => k && v)
  );
  if (!partes.ts || !partes.v1) return false;
  const id = /^[a-z0-9]+$/i.test(String(dataId ?? '')) ? String(dataId).toLowerCase() : String(dataId ?? '');
  const manifiesto = `${id ? `id:${id};` : ''}${pedidoId ? `request-id:${pedidoId};` : ''}ts:${partes.ts};`;
  return iguales(createHmac('sha256', clave).update(manifiesto).digest('hex'), partes.v1);
}

/* ---------- La API ---------- */

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

async function llamar(url, { method = 'GET', body, token, idempotencia } = {}) {
  let respuesta;
  try {
    respuesta = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(idempotencia ? { 'X-Idempotency-Key': idempotencia } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' })
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(ESPERA_MAXIMA_MS)
    });
  } catch (err) {
    const motivo = err.name === 'TimeoutError' ? 'no contestó a tiempo' : err.message;
    throw new MercadoPagoError(`No se pudo hablar con Mercado Pago (${motivo}).`, { transitorio: true });
  }
  const texto = await respuesta.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    /* sin JSON: queda el texto para el mensaje */
  }
  if (!respuesta.ok) {
    const causa = Array.isArray(json?.cause) ? json.cause.map((c) => c?.description).filter(Boolean).join(' ') : '';
    const detalle = causa || json?.message || json?.error_description || json?.error || texto.slice(0, 200);
    throw new MercadoPagoError(`Mercado Pago respondió ${respuesta.status}${detalle ? `: ${detalle}` : ''}.`, {
      status: respuesta.status,
      transitorio: respuesta.status === 429 || respuesta.status >= 500,
      codigo: typeof json?.error === 'string' ? json.error : null
    });
  }
  return { json };
}

// Un cliente por negocio. `token()` lo da server.js: devuelve uno vigente y lo
// renueva si hace falta. Un 429 se reintenta hasta 3 veces.
export function clienteMercadoPago({ token }) {
  async function pedir(metodo, ruta, cuerpo, idempotencia) {
    for (let intento = 0; ; intento++) {
      try {
        const { json } = await llamar(`${urlApi()}${ruta}`, { method: metodo, body: cuerpo, token: await token(), idempotencia });
        return json;
      } catch (err) {
        if (err.status === 429 && intento < 3) {
          await esperar(1000 * 2 ** intento);
          continue;
        }
        throw err;
      }
    }
  }

  return {
    yo: () => pedir('GET', '/users/me'),
    // El link de pago (Checkout Pro): devuelve `init_point`, la página de
    // Mercado Pago donde se paga.
    crearLink: (preferencia, idempotencia) => pedir('POST', '/checkout/preferences', preferencia, idempotencia),
    pago: (id) => pedir('GET', `/v1/payments/${encodeURIComponent(id)}`),
    buscarPagos: (filtros) => pedir('GET', `/v1/payments/search?${new URLSearchParams(filtros)}`),
    // El QR de la caja (hist. §147): la sucursal y la caja se crean una vez, y
    // cada cobro es una orden de la API de Orders en modo híbrido, que trae
    // en type_response.qr_data el texto del QR por ese importe.
    crearSucursal: (usuario, sucursal) => pedir('POST', `/users/${encodeURIComponent(usuario)}/stores`, sucursal),
    crearCaja: (caja) => pedir('POST', '/pos', caja),
    crearOrden: (orden, idempotencia) => pedir('POST', '/v1/orders', orden, idempotencia),
    orden: (id) => pedir('GET', `/v1/orders/${encodeURIComponent(id)}`),
    cancelarOrden: (id, idempotencia) => pedir('POST', `/v1/orders/${encodeURIComponent(id)}/cancel`, undefined, idempotencia)
  };
}

/* ---------- Lo que se lee de un pago ---------- */

// La referencia que Nexo le pone a cada link: el número de la venta. Lo que
// no tiene esta forma no salió de Nexo.
const PREFIJO_REFERENCIA = 'nexo-venta-';
export const referenciaDeVenta = (ventaId) => `${PREFIJO_REFERENCIA}${ventaId}`;
export function ventaDeLaReferencia(referencia) {
  const texto = String(referencia ?? '');
  if (!texto.startsWith(PREFIJO_REFERENCIA)) return null;
  const id = Number(texto.slice(PREFIJO_REFERENCIA.length));
  return Number.isInteger(id) && id > 0 ? id : null;
}

const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;

// El desglose de un pago aprobado:
// - importe: lo que pagó el cliente por la venta (sin el interés de las
//   cuotas, que paga él y se queda Mercado Pago);
// - comision: lo que le cobra Mercado Pago al negocio (fee_details que paga
//   el vendedor, salvo el de financiación);
// - financiacion: el costo de las cuotas sin interés, que paga el negocio;
// - retenciones: lo que falta para llegar a lo que acredita (impuestos que
//   retiene Mercado Pago). Se muestra aparte: no es un gasto hasta definirlo
//   con un contador (CLAUDE.md, reglas a confirmar);
// - neto: lo que le queda en la cuenta.
export function desgloseDelPago(pago) {
  const importe = redondear(pago?.transaction_amount);
  let comision = 0;
  let financiacion = 0;
  for (const cargo of Array.isArray(pago?.fee_details) ? pago.fee_details : []) {
    if (cargo?.fee_payer === 'payer') continue;
    const monto = redondear(cargo?.amount);
    if (!(monto > 0)) continue;
    if (/financ/i.test(String(cargo?.type ?? ''))) financiacion += monto;
    else comision += monto;
  }
  comision = redondear(comision);
  financiacion = redondear(financiacion);
  const netoInformado = pago?.transaction_details?.net_received_amount;
  const neto = netoInformado == null ? null : redondear(netoInformado);
  const retenciones = neto == null ? 0 : Math.max(0, redondear(importe - comision - financiacion - neto));
  return {
    importe,
    comision,
    financiacion,
    retenciones,
    neto,
    cuotas: Number.isInteger(pago?.installments) ? pago.installments : null,
    medio: String(pago?.payment_type_id ?? pago?.payment_method_id ?? '') || null,
    pagador: [pago?.payer?.first_name, pago?.payer?.last_name].filter(Boolean).join(' ') || pago?.payer?.email || null,
    aprobadoEn: pago?.date_approved ?? null,
    liberaEn: pago?.money_release_date ?? null
  };
}

// Cómo se llama cada medio, para mostrarlo.
export const NOMBRE_MEDIO = {
  credit_card: 'tarjeta de crédito',
  debit_card: 'tarjeta de débito',
  prepaid_card: 'tarjeta prepaga',
  account_money: 'dinero en Mercado Pago',
  bank_transfer: 'transferencia',
  ticket: 'efectivo (Rapipago, Pago Fácil)',
  atm: 'cajero',
  digital_currency: 'Mercado Crédito',
  digital_wallet: 'billetera'
};
