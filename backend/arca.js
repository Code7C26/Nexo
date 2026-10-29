// ARCA (ex AFIP): factura electrónica, etapa E (CLAUDE.md §16, §33).
//
// Son dos servicios web por SOAP:
// - WSAA, el login: un "ticket de acceso" (token y sign) que dura 12 horas,
//   pedido con un CMS firmado con el certificado de quien factura;
// - WSFEv1, la factura: el último número autorizado, pedir el CAE y consultar
//   un comprobante ya emitido.
//
// Sin dependencias, como el SMTP de mail.js. La firma del ticket es un CMS
// (PKCS#7) que node:crypto no arma, pero son unas pocas estructuras DER y la
// firma RSA sí la hace node:crypto. No se usa AfipSDK: su producción pasa por
// una nube paga. El XML se arma con plantillas y se lee con expresiones
// regulares: las respuestas de ARCA son chicas y de forma fija.
//
// Este archivo no toca la base: el ticket lo guarda quien lo llama (server.js),
// con el `almacen` que pasa a clienteArca().
//
// NEXO_ARCA=stub no sale a la red: simula a ARCA en memoria, con CAE de
// mentira. Es lo que usan los tests, y la última red de la demo si los
// servidores de prueba de ARCA se caen.
import https from 'node:https';
import { existsSync, readFileSync } from 'node:fs';
import { X509Certificate, createHash, createPrivateKey, randomInt, sign } from 'node:crypto';

export class ArcaError extends Error {
  // codigo: el de ARCA, si lo dio. transitorio: no hubo respuesta (red caída,
  // servidor de ARCA caído); el comprobante queda pendiente y se reintenta.
  constructor(mensaje, { codigo = null, transitorio = false } = {}) {
    super(mensaje);
    this.codigo = codigo;
    this.transitorio = transitorio;
  }
}

const URLS = {
  homologacion: {
    wsaa: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx'
  },
  produccion: {
    wsaa: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx'
  }
};

// homologacion (el ambiente de prueba de ARCA, por defecto), produccion o
// simulado (NEXO_ARCA=stub). Se lee en cada llamada: los tests la cambian.
export function ambienteArca() {
  if (process.env.NEXO_ARCA === 'stub') return 'simulado';
  return process.env.NEXO_ARCA_AMBIENTE === 'produccion' ? 'produccion' : 'homologacion';
}

/* ---------- DER mínimo para el CMS ---------- */

function largoDer(n) {
  if (n < 0x80) return Buffer.from([n]);
  const bytes = [];
  for (let v = n; v > 0; v = Math.floor(v / 256)) bytes.unshift(v % 256);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
const tlv = (tag, ...partes) => {
  const contenido = Buffer.concat(partes);
  return Buffer.concat([Buffer.from([tag]), largoDer(contenido.length), contenido]);
};
const secuencia = (...partes) => tlv(0x30, ...partes);
// DER pide los elementos de un SET ordenados por sus bytes.
const conjunto = (...partes) => tlv(0x31, ...[...partes].sort(Buffer.compare));
const contexto0 = (...partes) => tlv(0xa0, ...partes);
const octetos = (bytes) => tlv(0x04, bytes);
const entero1 = tlv(0x02, Buffer.from([1]));
const nulo = Buffer.from([0x05, 0x00]);
function oid(texto) {
  const [a, b, ...resto] = texto.split('.').map(Number);
  const bytes = [40 * a + b];
  for (const n of resto) {
    const grupo = [n & 0x7f];
    for (let v = n >>> 7; v > 0; v >>>= 7) grupo.unshift((v & 0x7f) | 0x80);
    bytes.push(...grupo);
  }
  return tlv(0x06, Buffer.from(bytes));
}
// UTCTime: AAMMDDHHMMSSZ.
const horaUtc = (fecha) => tlv(0x17, Buffer.from(`${fecha.toISOString().replace(/[-:T]/g, '').slice(2, 14)}Z`));

function leerDer(buf, pos) {
  let largo = buf[pos + 1];
  let inicio = pos + 2;
  if (largo & 0x80) {
    const n = largo & 0x7f;
    largo = 0;
    for (let i = 0; i < n; i++) largo = largo * 256 + buf[inicio + i];
    inicio += n;
  }
  return { tag: buf[pos], inicio, fin: inicio + largo, crudo: buf.subarray(pos, inicio + largo) };
}
function hijosDer(buf, nodo) {
  const hijos = [];
  for (let p = nodo.inicio; p < nodo.fin; ) {
    const hijo = leerDer(buf, p);
    hijos.push(hijo);
    p = hijo.fin;
  }
  return hijos;
}

// El emisor y el número de serie del certificado, tal cual sus bytes: el CMS
// identifica con ellos a quien firma.
function emisorYSerie(certDer) {
  const tbs = hijosDer(certDer, leerDer(certDer, 0))[0];
  const campos = hijosDer(certDer, tbs);
  const i = campos[0].tag === 0xa0 ? 1 : 0; // [0] versión, opcional
  return { serie: campos[i].crudo, emisor: campos[i + 2].crudo };
}

const OID = {
  data: '1.2.840.113549.1.7.1',
  signedData: '1.2.840.113549.1.7.2',
  sha256: '2.16.840.1.101.3.4.2.1',
  rsa: '1.2.840.113549.1.1.1',
  contentType: '1.2.840.113549.1.9.3',
  messageDigest: '1.2.840.113549.1.9.4',
  signingTime: '1.2.840.113549.1.9.5'
};

// CMS SignedData (RFC 5652) con el contenido adentro, SHA-256 y RSA: lo
// mismo que arma `openssl cms -sign -nodetach`, que es lo que pide WSAA. En
// base64.
export function firmarCms(contenido, certificadoPem, clavePem, ahora = new Date()) {
  const certDer = new X509Certificate(certificadoPem).raw;
  const { emisor, serie } = emisorYSerie(certDer);
  const datos = Buffer.from(contenido, 'utf8');
  const sha256 = secuencia(oid(OID.sha256));
  const atributos = conjunto(
    secuencia(oid(OID.contentType), conjunto(oid(OID.data))),
    secuencia(oid(OID.signingTime), conjunto(horaUtc(ahora))),
    secuencia(oid(OID.messageDigest), conjunto(octetos(createHash('sha256').update(datos).digest())))
  );
  // Se firman los atributos como SET; en el CMS van con la etiqueta [0].
  const firma = sign('sha256', atributos, createPrivateKey(clavePem));
  const firmante = secuencia(
    entero1,
    secuencia(emisor, serie),
    sha256,
    Buffer.concat([Buffer.from([0xa0]), atributos.subarray(1)]),
    secuencia(oid(OID.rsa), nulo),
    octetos(firma)
  );
  const signedData = secuencia(
    entero1,
    conjunto(sha256),
    secuencia(oid(OID.data), contexto0(octetos(datos))),
    contexto0(certDer),
    conjunto(firmante)
  );
  return secuencia(oid(OID.signedData), contexto0(signedData)).toString('base64');
}

// Revisa un certificado de ARCA y su clave antes de usarlos: que sean pareja,
// que no esté vencido y de qué CUIT es (ARCA lo pone en el serialNumber del
// sujeto: "CUIT 20123456789").
export function revisarCertificado(certificadoPem, clavePem) {
  let certificado;
  let clave;
  try {
    certificado = new X509Certificate(certificadoPem);
  } catch {
    throw new ArcaError('El certificado no se pudo leer: tiene que ser el archivo .crt que dio ARCA.');
  }
  try {
    clave = createPrivateKey(clavePem);
  } catch {
    throw new ArcaError('La clave privada no se pudo leer: tiene que ser el archivo .key, sin contraseña.');
  }
  if (!certificado.checkPrivateKey(clave)) {
    throw new ArcaError('La clave privada no es la de este certificado.');
  }
  const vence = new Date(certificado.validTo);
  if (vence.getTime() < Date.now()) {
    throw new ArcaError(`El certificado venció el ${vence.toISOString().slice(0, 10)}.`);
  }
  const cuit = /serialNumber=CUIT (\d{11})/.exec(certificado.subject)?.[1] ?? null;
  const homologacion = /Computadores Test/.test(certificado.issuer);
  return { cuit, vence: vence.toISOString().slice(0, 10), homologacion };
}

/* ---------- SOAP ---------- */

const desescaparXml = (texto) =>
  texto
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

// El contenido de la primera etiqueta con ese nombre, con o sin prefijo de
// espacio de nombres; null si no está.
function etiqueta(xml, nombre) {
  if (xml == null) return null;
  const encontrada = new RegExp(`<(?:[\\w-]+:)?${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${nombre}>`).exec(xml);
  return encontrada ? encontrada[1] : null;
}
function etiquetas(xml, nombre) {
  if (xml == null) return [];
  return [...xml.matchAll(new RegExp(`<(?:[\\w-]+:)?${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${nombre}>`, 'g'))].map((m) => m[1]);
}

const ESPERA_MS = 30_000;

function postSoap(url, accion, sobre) {
  return new Promise((resolver, rechazar) => {
    const cuerpo = Buffer.from(sobre, 'utf8');
    const pedido = https.request(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: accion, 'Content-Length': cuerpo.length },
        timeout: ESPERA_MS
      },
      (respuesta) => {
        const partes = [];
        respuesta.on('data', (parte) => partes.push(parte));
        respuesta.on('end', () => {
          const xml = Buffer.concat(partes).toString('utf8');
          const falla = etiqueta(xml, 'faultstring');
          if (falla != null) {
            const codigo = etiqueta(xml, 'faultcode');
            return rechazar(new ArcaError(desescaparXml(falla).trim(), { codigo: codigo?.replace(/^.*:/, '') ?? null }));
          }
          if (respuesta.statusCode >= 500) {
            return rechazar(new ArcaError(`ARCA respondió con un error (${respuesta.statusCode}).`, { transitorio: true }));
          }
          resolver(xml);
        });
      }
    );
    pedido.on('timeout', () => pedido.destroy(new Error('se agotó la espera')));
    pedido.on('error', (err) =>
      rechazar(new ArcaError(`No se pudo conectar con ARCA (${err.code ?? err.message}).`, { transitorio: true }))
    );
    pedido.end(cuerpo);
  });
}

/* ---------- WSAA: el ticket de acceso ---------- */

// Un pedido de ticket a la vez por certificado: ARCA rechaza un segundo login
// mientras el primero sigue vigente, así que dos facturas al mismo tiempo
// esperan el mismo ticket.
const ticketsEnCurso = new Map();

async function pedirTicket(credenciales, ambiente, servicio) {
  const ahora = Date.now();
  const tra =
    '<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header>' +
    `<uniqueId>${Math.floor(ahora / 1000)}</uniqueId>` +
    `<generationTime>${new Date(ahora - 600_000).toISOString()}</generationTime>` +
    `<expirationTime>${new Date(ahora + 600_000).toISOString()}</expirationTime>` +
    `</header><service>${servicio}</service></loginTicketRequest>`;
  const cms = firmarCms(tra, credenciales.certificado, credenciales.clave);
  let xml;
  try {
    xml = await postSoap(
      URLS[ambiente].wsaa,
      '',
      '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">' +
        `<soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`
    );
  } catch (err) {
    // El ticket anterior se perdió (no quedó guardado) y ARCA no da otro
    // hasta que venza: como mucho, 12 horas.
    if (err.codigo === 'alreadyAuthenticated' || /ya posee un TA valido/i.test(err.message)) {
      throw new ArcaError(
        'ARCA ya le dio un permiso a este certificado hace menos de 12 horas y no quedó guardado en Nexo. Va a poder pedir otro cuando venza.',
        { codigo: 'alreadyAuthenticated', transitorio: true }
      );
    }
    if (!err.transitorio) throw new ArcaError(`ARCA no aceptó el certificado: ${err.message}`, { codigo: err.codigo });
    throw err;
  }
  const ticket = etiqueta(xml, 'loginCmsReturn');
  if (ticket == null) throw new ArcaError('ARCA no devolvió el permiso de acceso.', { transitorio: true });
  const ta = desescaparXml(ticket);
  return { token: etiqueta(ta, 'token'), sign: etiqueta(ta, 'sign'), vence: etiqueta(ta, 'expirationTime') };
}

// El ticket vigente: el guardado si le quedan más de 5 minutos, o uno nuevo.
// almacen: { leer(clave) → { token, sign, vence } | null, guardar(clave, ticket) }.
async function ticketDeAcceso(credenciales, ambiente, almacen, servicio = 'wsfe') {
  const clave = `${ambiente}:${servicio}:${createHash('sha256').update(credenciales.certificado.trim()).digest('hex')}`;
  const guardado = almacen.leer(clave);
  if (guardado && Date.parse(guardado.vence) - Date.now() > 5 * 60_000) return guardado;
  if (!ticketsEnCurso.has(clave)) {
    ticketsEnCurso.set(
      clave,
      pedirTicket(credenciales, ambiente, servicio)
        .then((ticket) => {
          almacen.guardar(clave, ticket);
          return ticket;
        })
        .finally(() => ticketsEnCurso.delete(clave))
    );
  }
  return ticketsEnCurso.get(clave);
}

/* ---------- Lo que se le manda a WSFEv1 ---------- */

// El código de ARCA de cada comprobante: tipo y letra.
export const TIPOS_CBTE = {
  factura: { A: 1, B: 6, C: 11 },
  nota_debito: { A: 2, B: 7, C: 12 },
  nota_credito: { A: 3, B: 8, C: 13 }
};

// La alícuota de cada renglón, con su código de ARCA. Exento y no gravado no
// llevan IVA: van en sus propios importes.
const ID_ALICUOTA = { 0: 3, 10.5: 4, 21: 5, 27: 6, 5: 8, 2.5: 9 };

// Condición del receptor frente al IVA (obligatoria desde la RG 5616). Un
// cliente sin condición es consumidor final.
const CONDICION_RECEPTOR = { responsable_inscripto: 1, exento: 4, consumidor_final: 5, monotributo: 6 };
export const condicionReceptor = (condicion) => CONDICION_RECEPTOR[condicion] ?? 5;

// El documento del receptor, desde lo que se cargó en el cliente: 11 números es
// CUIT (80), 7 u 8 es DNI (96). Sin documento, consumidor final sin
// identificar (99, número 0).
export function documentoReceptor(documento) {
  const digitos = String(documento ?? '').replace(/\D/g, '');
  if (digitos.length === 11) return { docTipo: 80, docNro: Number(digitos) };
  if (digitos.length === 7 || digitos.length === 8) return { docTipo: 96, docNro: Number(digitos) };
  return { docTipo: 99, docNro: 0 };
}

const redondear2 = (n) => Math.round(n * 100) / 100;

// Los importes que pide ARCA, desde los renglones del comprobante
// ({ importe: el final, con IVA; alicuota: '21', 'exento', ... }).
// - C (monotributo, exento): todo es neto, sin IVA.
// - A y B: el IVA de cada alícuota se saca del total de esa alícuota, no
//   sumando el de cada renglón: así base × tasa da el importe que se informa,
//   que es lo que ARCA controla. Exento y no gravado van aparte.
// La suma cierra al centavo con el total: base + IVA es el total de cada
// alícuota redondeado.
export function importesDelComprobante(letra, renglones) {
  const total = redondear2(renglones.reduce((suma, r) => suma + r.importe, 0));
  if (letra === 'C') return { total, neto: total, iva: 0, exento: 0, noGravado: 0, alicuotas: [] };
  const porAlicuota = new Map();
  let exento = 0;
  let noGravado = 0;
  for (const { importe, alicuota } of renglones) {
    const clave = alicuota ?? '21';
    if (clave === 'exento') exento += importe;
    else if (clave === 'no_gravado') noGravado += importe;
    else porAlicuota.set(clave, (porAlicuota.get(clave) ?? 0) + importe);
  }
  const alicuotas = [...porAlicuota]
    .map(([clave, importe]) => {
      const totalAlicuota = redondear2(importe);
      const tasa = Number(clave);
      const iva = redondear2(totalAlicuota - totalAlicuota / (1 + tasa / 100));
      return { id: ID_ALICUOTA[tasa], base: redondear2(totalAlicuota - iva), importe: iva };
    })
    .sort((a, b) => a.id - b.id);
  exento = redondear2(exento);
  noGravado = redondear2(noGravado);
  const neto = redondear2(alicuotas.reduce((s, a) => s + a.base, 0));
  const iva = redondear2(alicuotas.reduce((s, a) => s + a.importe, 0));
  return { total: redondear2(neto + iva + exento + noGravado), neto, iva, exento, noGravado, alicuotas };
}

// AAAA-MM-DD ↔ AAAAMMDD.
export const fechaArca = (fecha) => fecha.replaceAll('-', '');
export const fechaDeArca = (texto) => (texto ? `${texto.slice(0, 4)}-${texto.slice(4, 6)}-${texto.slice(6, 8)}` : null);

const importeXml = (n) => Number(n).toFixed(2);

// El detalle de un comprobante, con los campos en el orden del WSDL (es una
// secuencia y el orden cuenta).
// d: { concepto, docTipo, docNro, numero, fecha (AAAAMMDD), importes,
//      condicionReceptor, asociado?: { tipo, puntoVenta, numero, cuit, fecha },
//      periodo?: { desde, hasta } }
function xmlDetalle(d) {
  const campo = (nombre, valor) => (valor == null ? '' : `<ar:${nombre}>${valor}</ar:${nombre}>`);
  const { importes } = d;
  // Un servicio (concepto 2 o 3) pide el período y el vencimiento del pago:
  // el día del comprobante.
  const servicio = d.concepto !== 1;
  return [
    campo('Concepto', d.concepto),
    campo('DocTipo', d.docTipo),
    campo('DocNro', d.docNro),
    campo('CbteDesde', d.numero),
    campo('CbteHasta', d.numero),
    campo('CbteFch', d.fecha),
    campo('ImpTotal', importeXml(importes.total)),
    campo('ImpTotConc', importeXml(importes.noGravado)),
    campo('ImpNeto', importeXml(importes.neto)),
    campo('ImpOpEx', importeXml(importes.exento)),
    campo('ImpTrib', '0.00'),
    campo('ImpIVA', importeXml(importes.iva)),
    servicio ? campo('FchServDesde', d.fecha) + campo('FchServHasta', d.fecha) + campo('FchVtoPago', d.fecha) : '',
    campo('MonId', 'PES'),
    campo('MonCotiz', '1'),
    campo('CondicionIVAReceptorId', d.condicionReceptor),
    d.asociado
      ? campo(
          'CbtesAsoc',
          campo(
            'CbteAsoc',
            campo('Tipo', d.asociado.tipo) +
              campo('PtoVta', d.asociado.puntoVenta) +
              campo('Nro', d.asociado.numero) +
              campo('Cuit', d.asociado.cuit) +
              campo('CbteFch', d.asociado.fecha)
          )
        )
      : '',
    importes.alicuotas.length
      ? campo(
          'Iva',
          importes.alicuotas
            .map((a) => campo('AlicIva', campo('Id', a.id) + campo('BaseImp', importeXml(a.base)) + campo('Importe', importeXml(a.importe))))
            .join('')
        )
      : '',
    d.periodo ? campo('PeriodoAsoc', campo('FchDesde', d.periodo.desde) + campo('FchHasta', d.periodo.hasta)) : ''
  ].join('');
}

const erroresDe = (resultado, grupo = 'Errors', item = 'Err') =>
  etiquetas(etiqueta(resultado, grupo), item).map((e) => ({
    codigo: Number(etiqueta(e, 'Code')),
    mensaje: desescaparXml(etiqueta(e, 'Msg') ?? '').trim()
  }));

// Errores de ARCA que dicen que este certificado no puede facturar por ese
// CUIT: falta la delegación (o la autorización del certificado).
export const ERRORES_DE_PERMISO = [600, 601];

function lanzarErrores(errores) {
  const [primero] = errores;
  throw new ArcaError(`ARCA: ${primero.mensaje} (código ${primero.codigo})`, { codigo: primero.codigo });
}

/* ---------- El cliente ---------- */

// credenciales: { certificado, clave } en PEM; cuit: el que factura (el del
// negocio, o el de Nexo en homologación).
export function clienteArca({ credenciales, cuit, almacen, ambiente = ambienteArca() }) {
  if (ambiente === 'simulado') return clienteSimulado(cuit);

  async function llamar(metodo, cuerpo, { conAuth = true } = {}) {
    let auth = '';
    if (conAuth) {
      const ticket = await ticketDeAcceso(credenciales, ambiente, almacen);
      auth = `<ar:Auth><ar:Token>${ticket.token}</ar:Token><ar:Sign>${ticket.sign}</ar:Sign><ar:Cuit>${cuit}</ar:Cuit></ar:Auth>`;
    }
    const xml = await postSoap(
      URLS[ambiente].wsfe,
      `http://ar.gov.afip.dif.FEV1/${metodo}`,
      '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">' +
        `<soap:Body><ar:${metodo}>${auth}${cuerpo}</ar:${metodo}></soap:Body></soap:Envelope>`
    );
    const resultado = etiqueta(xml, `${metodo}Result`);
    if (resultado == null) throw new ArcaError('ARCA devolvió una respuesta que Nexo no entiende.', { transitorio: true });
    return resultado;
  }

  return {
    ambiente,
    cuit,

    // Si los tres servidores de ARCA andan. No pide ticket.
    async estado() {
      const r = await llamar('FEDummy', '', { conAuth: false });
      return { app: etiqueta(r, 'AppServer'), db: etiqueta(r, 'DbServer'), auth: etiqueta(r, 'AuthServer') };
    },

    async ultimoAutorizado(puntoVenta, cbteTipo) {
      const r = await llamar('FECompUltimoAutorizado', `<ar:PtoVta>${puntoVenta}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo>`);
      const errores = erroresDe(r);
      if (errores.length) lanzarErrores(errores);
      return Number(etiqueta(r, 'CbteNro'));
    },

    // Los puntos de venta habilitados para web services. En homologación ARCA
    // no tiene ninguno cargado y acepta cualquiera: lista vacía.
    async puntosDeVenta() {
      const r = await llamar('FEParamGetPtosVenta', '');
      const errores = erroresDe(r);
      if (errores.some((e) => e.codigo === 602)) return []; // "Sin resultados"
      if (errores.length) lanzarErrores(errores);
      return etiquetas(r, 'PtoVenta').map((p) => ({
        numero: Number(etiqueta(p, 'Nro')),
        emision: etiqueta(p, 'EmisionTipo'),
        bloqueado: etiqueta(p, 'Bloqueado') === 'S',
        baja: /^\d{8}$/.test(etiqueta(p, 'FchBaja') ?? '') ? fechaDeArca(etiqueta(p, 'FchBaja')) : null
      }));
    },

    // Un comprobante ya emitido, o null si ARCA no lo tiene.
    async consultar(puntoVenta, cbteTipo, numero) {
      const r = await llamar(
        'FECompConsultar',
        `<ar:FeCompConsReq><ar:CbteTipo>${cbteTipo}</ar:CbteTipo><ar:CbteNro>${numero}</ar:CbteNro><ar:PtoVta>${puntoVenta}</ar:PtoVta></ar:FeCompConsReq>`
      );
      const errores = erroresDe(r);
      if (errores.some((e) => e.codigo === 602)) return null;
      if (errores.length) lanzarErrores(errores);
      const g = etiqueta(r, 'ResultGet');
      return {
        resultado: etiqueta(g, 'Resultado'),
        cae: etiqueta(g, 'CodAutorizacion'),
        caeVence: fechaDeArca(etiqueta(g, 'FchVto')),
        total: Number(etiqueta(g, 'ImpTotal')),
        docNro: Number(etiqueta(g, 'DocNro')),
        fecha: fechaDeArca(etiqueta(g, 'CbteFch'))
      };
    },

    // Pide el CAE de un comprobante. Devuelve { resultado: 'A' | 'R', cae,
    // caeVence, observaciones, errores }; no lanza por un rechazo, sí por un
    // problema de permiso o de red.
    async solicitarCae(puntoVenta, cbteTipo, detalle) {
      const r = await llamar(
        'FECAESolicitar',
        '<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg>' +
          `<ar:PtoVta>${puntoVenta}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo></ar:FeCabReq>` +
          `<ar:FeDetReq><ar:FECAEDetRequest>${xmlDetalle(detalle)}</ar:FECAEDetRequest></ar:FeDetReq></ar:FeCAEReq>`
      );
      const errores = erroresDe(r);
      if (errores.some((e) => ERRORES_DE_PERMISO.includes(e.codigo))) lanzarErrores(errores);
      const det = etiqueta(r, 'FECAEDetResponse');
      const resultado = etiqueta(det, 'Resultado') ?? etiqueta(etiqueta(r, 'FeCabResp'), 'Resultado') ?? 'R';
      return {
        resultado,
        cae: resultado === 'A' ? etiqueta(det, 'CAE') : null,
        caeVence: resultado === 'A' ? fechaDeArca(etiqueta(det, 'CAEFchVto')) : null,
        observaciones: erroresDe(det, 'Observaciones', 'Obs'),
        errores
      };
    }
  };
}

/* ---------- ARCA simulado (NEXO_ARCA=stub) ---------- */

// Numeración y comprobantes en memoria, por CUIT, punto de venta y tipo.
// Para los tests, NEXO_ARCA_FALLA es la ruta de un archivo que dice qué falla
// (los tests corren el servidor en otro proceso y lo escriben mientras anda):
// 'red' (el pedido de CAE no llega), 'perder' (ARCA autoriza pero la respuesta
// no vuelve), 'rechazo' (ARCA lo rechaza) o 'permiso' (falta la delegación).
const simulados = new Map();

function clienteSimulado(cuit) {
  const serie = (pv, tipo) => {
    const clave = `${cuit}:${pv}:${tipo}`;
    if (!simulados.has(clave)) simulados.set(clave, []);
    return simulados.get(clave);
  };
  const falla = () => {
    const archivo = process.env.NEXO_ARCA_FALLA;
    const tipo = archivo && existsSync(archivo) ? readFileSync(archivo, 'utf8').trim() : '';
    if (tipo === 'permiso') throw new ArcaError('ARCA: CUIT representada no incluida en Token (código 601)', { codigo: 601 });
    return tipo;
  };
  return {
    ambiente: 'simulado',
    cuit,
    async estado() {
      return { app: 'OK', db: 'OK', auth: 'OK' };
    },
    async ultimoAutorizado(pv, tipo) {
      falla();
      return serie(pv, tipo).length;
    },
    async puntosDeVenta() {
      falla();
      return [];
    },
    async consultar(pv, tipo, numero) {
      const c = serie(pv, tipo)[numero - 1];
      return c ? { resultado: 'A', ...c } : null;
    },
    async solicitarCae(pv, tipo, detalle) {
      const modo = falla();
      if (modo === 'red') throw new ArcaError('No se pudo conectar con ARCA (simulado).', { transitorio: true });
      if (modo === 'rechazo') {
        return { resultado: 'R', cae: null, caeVence: null, observaciones: [], errores: [{ codigo: 10015, mensaje: 'Rechazo simulado' }] };
      }
      const lista = serie(pv, tipo);
      if (detalle.numero !== lista.length + 1) {
        const mensaje = 'El numero o fecha del comprobante no se corresponde con el proximo a autorizar.';
        return { resultado: 'R', cae: null, caeVence: null, observaciones: [], errores: [{ codigo: 10016, mensaje }] };
      }
      const vence = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
      const comprobante = {
        cae: String(randomInt(10 ** 13, 10 ** 14)),
        caeVence: vence,
        total: detalle.importes.total,
        docNro: detalle.docNro,
        fecha: fechaDeArca(detalle.fecha)
      };
      lista.push(comprobante);
      if (modo === 'perder') throw new ArcaError('Se agotó la espera (simulado).', { transitorio: true });
      return { resultado: 'A', cae: comprobante.cae, caeVence: vence, observaciones: [], errores: [] };
    }
  };
}

// El QR que la RG 4892 pide en todo comprobante electrónico impreso: un link a
// ARCA con los datos del comprobante en JSON, en base64.
export function urlQr({ fecha, cuit, puntoVenta, cbteTipo, numero, total, docTipo, docNro, cae }) {
  const datos = {
    ver: 1,
    fecha,
    cuit: Number(cuit),
    ptoVta: puntoVenta,
    tipoCmp: cbteTipo,
    nroCmp: numero,
    importe: Number(total),
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: docTipo,
    nroDocRec: docNro,
    tipoCodAut: 'E',
    codAut: Number(cae)
  };
  return `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(datos)).toString('base64')}`;
}
