// Factura electrónica con ARCA (etapa E, CLAUDE.md §33). Las cuentas del
// comprobante y la firma del ticket se prueban sueltas; la emisión, contra
// ARCA simulado (NEXO_ARCA=stub), que numera y da CAE en memoria. Las fallas
// de ARCA (red caída, respuesta perdida, rechazo, falta de delegación) se
// provocan escribiendo el archivo de NEXO_ARCA_FALLA.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';
import { documentoReceptor, firmarCms, importesDelComprobante, revisarCertificado, TIPOS_CBTE } from '../arca.js';

/* ---------- Las cuentas ---------- */

test('C: todo es neto, sin IVA', () => {
  assert.deepEqual(importesDelComprobante('C', [{ importe: 1210, alicuota: '21' }, { importe: 500.5, alicuota: 'exento' }]), {
    total: 1710.5,
    neto: 1710.5,
    iva: 0,
    exento: 0,
    noGravado: 0,
    alicuotas: []
  });
});

test('A y B: el IVA por alícuota, exento y no gravado aparte, y la suma cierra con el total', () => {
  const importes = importesDelComprobante('B', [
    { importe: 1210, alicuota: '21' },
    { importe: 2420, alicuota: '21' },
    { importe: 1105, alicuota: '10.5' },
    { importe: 500, alicuota: 'exento' },
    { importe: 300, alicuota: 'no_gravado' },
    { importe: 100, alicuota: '0' }
  ]);
  assert.deepEqual(importes.alicuotas, [
    { id: 3, base: 100, importe: 0 },
    { id: 4, base: 1000, importe: 105 },
    { id: 5, base: 3000, importe: 630 }
  ]);
  assert.equal(importes.neto, 4100);
  assert.equal(importes.iva, 735);
  assert.equal(importes.exento, 500);
  assert.equal(importes.noGravado, 300);
  assert.equal(importes.total, 5635);

  // Con centavos que no dan justo: base + IVA es el total de la alícuota.
  const raro = importesDelComprobante('A', [{ importe: 0.333 * 1234.5, alicuota: '21' }]);
  assert.equal(raro.total, 411.09);
  assert.equal(Math.round((raro.neto + raro.iva) * 100) / 100, raro.total);
});

test('el documento del receptor y el código del comprobante', () => {
  assert.deepEqual(documentoReceptor('20-11111111-2'), { docTipo: 80, docNro: 20111111112 });
  assert.deepEqual(documentoReceptor('30.123.456'), { docTipo: 96, docNro: 30123456 });
  assert.deepEqual(documentoReceptor(''), { docTipo: 99, docNro: 0 });
  assert.equal(TIPOS_CBTE.factura.B, 6);
  assert.equal(TIPOS_CBTE.nota_credito.C, 13);
});

/* ---------- La firma del ticket (con openssl, si está) ---------- */

let openssl = true;
try {
  execFileSync('openssl', ['version'], { stdio: 'ignore' });
} catch {
  openssl = false;
}

test('el CMS que firma Nexo lo verifica openssl, y el certificado dice su CUIT', { skip: !openssl && 'sin openssl' }, () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'nexo-arca-'));
  // En Windows, Git Bash convierte "/CN=..." en una ruta si no se le dice.
  const env = { ...process.env, MSYS_NO_PATHCONV: '1' };
  try {
    const crt = path.join(dir, 'prueba.crt');
    const key = path.join(dir, 'prueba.key');
    execFileSync(
      'openssl',
      ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-keyout', key, '-out', crt, '-subj', '/CN=prueba/serialNumber=CUIT 20111111112'],
      { stdio: 'ignore', env }
    );
    const certificado = readFileSync(crt, 'utf8');
    const clave = readFileSync(key, 'utf8');
    assert.equal(revisarCertificado(certificado, clave).cuit, '20111111112');

    const tra = '<loginTicketRequest version="1.0"><service>wsfe</service></loginTicketRequest>';
    const cms = path.join(dir, 'tra.p7');
    writeFileSync(cms, Buffer.from(firmarCms(tra, certificado, clave), 'base64'));
    const contenido = execFileSync('openssl', ['cms', '-verify', '-inform', 'DER', '-in', cms, '-noverify'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      env
    });
    assert.equal(contenido.toString(), tra);

    // Una clave que no es la del certificado no pasa.
    const otra = path.join(dir, 'otra.key');
    execFileSync('openssl', ['genpkey', '-algorithm', 'RSA', '-out', otra], { stdio: 'ignore', env });
    assert.throws(() => revisarCertificado(certificado, readFileSync(otra, 'utf8')), /no es la de este certificado/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ---------- La emisión, contra ARCA simulado ---------- */

let servidor;
let archivoFalla;
const fallar = (tipo) => writeFileSync(archivoFalla, tipo);

before(async () => {
  archivoFalla = path.join(mkdtempSync(path.join(tmpdir(), 'nexo-arca-falla-')), 'falla');
  servidor = await levantarServidor({ env: { NEXO_ARCA: 'stub', NEXO_ARCA_FALLA: archivoFalla } });
});

after(async () => {
  await servidor?.cerrar();
  if (archivoFalla) rmSync(path.dirname(archivoFalla), { recursive: true, force: true });
});

// Un negocio inscripto, con un servicio, un consumidor final y un cliente
// inscripto con CUIT.
async function negocioInscripto(empresa, cuit) {
  const admin = await registrarEmpresa(servidor, { empresa, usuario: empresa.toLowerCase().replace(/\W/g, '') });
  const datos = await admin.put('/api/negocio', { condicion_iva: 'responsable_inscripto', documento: cuit });
  assert.equal(datos.status, 200, datos.texto);
  const producto = (await admin.post('/api/productos', { nombre: 'Instalación', precio_venta: 1210, tipo: 'servicio' })).json.id;
  const final = (await admin.post('/api/clientes', { nombre: 'Juan' })).json.id;
  const inscripto = (
    await admin.post('/api/clientes', { nombre: 'Ferretería SA', condicion_iva: 'responsable_inscripto', documento: '30-71234567-1' })
  ).json.id;
  return { admin, producto, final, inscripto };
}

async function vender(n, cliente_id, precio = 1210) {
  const r = await n.admin.post('/api/ventas', { cliente_id, items: [{ producto_id: n.producto, cantidad: 1, precio_unitario: precio }] });
  assert.equal(r.status, 201, r.texto);
  return r.json.id;
}

const facturar = (n, ventaId) => n.admin.post(`/api/ventas/${ventaId}/facturar`, { condicion: 'efectivo' });

async function activar(n, punto_venta = 5) {
  assert.equal((await n.admin.put('/api/factura-electronica', { punto_venta })).status, 200);
  const verificado = await n.admin.post('/api/factura-electronica/verificar');
  assert.equal(verificado.status, 200, verificado.texto);
}

test('sin activar no cambia nada; verificar pide CUIT, condición y punto de venta', async () => {
  const admin = await registrarEmpresa(servidor, { empresa: 'Sin Datos SA', usuario: 'sindatos' });
  const config = (await admin.get('/api/factura-electronica')).json;
  assert.equal(config.ambiente, 'simulado');
  assert.equal(config.disponible, true);
  assert.equal(config.activa, false);
  assert.equal(config.cuit_nexo, null, 'el CUIT de Nexo solo se muestra en producción');

  const sinCuit = await admin.post('/api/factura-electronica/verificar');
  assert.equal(sinCuit.status, 400);
  assert.match(sinCuit.json.error, /CUIT/);
});

// En simulado (como en homologación) todos los negocios emiten con el CUIT de
// Nexo y comparten la serie de cada punto de venta: cada negocio de estos
// tests usa el suyo, así sus números arrancan en 1.

test('verificada, cada comprobante sale con el número y el CAE de ARCA', async (t) => {
  const n = await negocioInscripto('Electrónica SA', '30-71000000-6');
  await activar(n, 5);
  assert.equal((await n.admin.get('/api/negocio')).json.factura_electronica.activa, true);

  await t.test('factura B, con su QR', async () => {
    const primera = await facturar(n, await vender(n, n.final));
    assert.equal(primera.status, 201, primera.texto);
    assert.equal(primera.json.arca_estado, 'autorizado');
    assert.equal(primera.json.comprobante, 'B 0005-00000001');
    assert.match(primera.json.cae, /^\d{14}$/);

    const vista = (await n.admin.get(`/api/facturas/${primera.json.id}`)).json;
    assert.equal(vista.arca_ambiente, 'simulado');
    assert.match(vista.cae_vencimiento, /^\d{4}-\d{2}-\d{2}$/);
    const qr = JSON.parse(Buffer.from(new URL(vista.arca_qr).searchParams.get('p'), 'base64').toString());
    assert.equal(qr.ptoVta, 5);
    assert.equal(qr.tipoCmp, 6);
    assert.equal(qr.nroCmp, 1);
    assert.equal(qr.importe, 1210);
    assert.equal(qr.codAut, Number(vista.cae));
  });

  await t.test('factura A a un inscripto con CUIT, con su propia numeración', async () => {
    const a = await facturar(n, await vender(n, n.inscripto));
    assert.equal(a.json.comprobante, 'A 0005-00000001');
  });

  await t.test('una factura A sin el CUIT del cliente no se guarda', async () => {
    const sinCuit = (await n.admin.post('/api/clientes', { nombre: 'Mono', condicion_iva: 'monotributo' })).json.id;
    const ventaId = await vender(n, sinCuit);
    const r = await facturar(n, ventaId);
    assert.equal(r.status, 400);
    assert.match(r.json.error, /CUIT del cliente/);
    assert.equal((await n.admin.get(`/api/ventas/${ventaId}`)).json.facturada, false);
  });

  await t.test('un rechazo de ARCA se puede descartar, y la venta se vuelve a facturar', async () => {
    const ventaId = await vender(n, n.final);
    fallar('rechazo');
    const rechazada = await facturar(n, ventaId);
    fallar('');
    assert.equal(rechazada.json.arca_estado, 'rechazado');
    assert.match(rechazada.json.arca_error, /Rechazo simulado/);

    assert.equal((await n.admin.del(`/api/facturas/${rechazada.json.id}`)).status, 200);
    const nueva = await facturar(n, ventaId);
    assert.equal(nueva.json.arca_estado, 'autorizado');
    assert.equal(nueva.json.comprobante, 'B 0005-00000002', 'el rechazo no consumió número');
    assert.equal((await n.admin.del(`/api/facturas/${nueva.json.id}`)).status, 400, 'una autorizada no se descarta');
  });

  await t.test('la nota de crédito de una devolución sale electrónica', async () => {
    const ventaId = await vender(n, n.final);
    assert.equal((await facturar(n, ventaId)).json.arca_estado, 'autorizado');
    const venta = (await n.admin.get(`/api/ventas/${ventaId}`)).json;
    const devolucion = await n.admin.post('/api/devoluciones', {
      venta_id: ventaId,
      items: [{ venta_item_id: venta.items[0].id, cantidad: 1, vuelve_stock: false }],
      motivo: 'No se hizo'
    });
    assert.equal(devolucion.status, 201, devolucion.texto);
    const nota = await n.admin.post(`/api/devoluciones/${devolucion.json.id}/nota-credito`, {});
    assert.equal(nota.status, 201, nota.texto);
    assert.equal(nota.json.arca_estado, 'autorizado');
    assert.equal(nota.json.comprobante, 'B 0005-00000001');
  });
});

test('si ARCA no contesta queda pendiente, y el reintento no duplica el número', async () => {
  const n = await negocioInscripto('Reintentos SA', '30-71000002-2');
  await activar(n, 7);

  fallar('red');
  const caida = await facturar(n, await vender(n, n.final));
  assert.equal(caida.status, 201, caida.texto);
  assert.equal(caida.json.arca_estado, 'pendiente');
  assert.match(caida.json.arca_error, /No se pudo conectar/);
  assert.equal(caida.json.comprobante, null);
  assert.match((await n.admin.get(`/api/facturas/${caida.json.id}`)).json.comprobante, /sin número/);

  // El libro IVA no cuenta lo que no tiene CAE.
  assert.equal((await n.admin.get('/api/reportes/iva')).json.ventas.length, 0);

  fallar('');
  const reintento = await n.admin.post(`/api/facturas/${caida.json.id}/autorizar`);
  assert.equal(reintento.status, 200, reintento.texto);
  assert.equal(reintento.json.comprobante, 'B 0007-00000001');

  // ARCA autoriza pero la respuesta se pierde: el reintento encuentra ese
  // mismo número en ARCA y lo toma, sin pedir otro.
  fallar('perder');
  const perdida = await facturar(n, await vender(n, n.final, 2420));
  assert.equal(perdida.json.arca_estado, 'pendiente');
  fallar('');
  const recuperada = await n.admin.post(`/api/facturas/${perdida.json.id}/autorizar`);
  assert.equal(recuperada.json.arca_estado, 'autorizado');
  assert.equal(recuperada.json.comprobante, 'B 0007-00000002');
  const siguiente = await facturar(n, await vender(n, n.final));
  assert.equal(siguiente.json.comprobante, 'B 0007-00000003');

  assert.equal((await n.admin.get('/api/reportes/iva')).json.ventas.length, 3);
  const otraVez = await n.admin.post(`/api/facturas/${recuperada.json.id}/autorizar`);
  assert.equal(otraVez.status, 400, 'una autorizada no se vuelve a pedir');

  // Otro CUIT es otra delegación: hay que volver a verificar.
  assert.equal((await n.admin.put('/api/negocio', { documento: '30-71000006-5' })).status, 200);
  assert.equal((await n.admin.get('/api/factura-electronica')).json.activa, false);
});

test('el punto de venta no puede tener comprobantes internos, y sin la delegación verificar lo dice', async () => {
  const n = await negocioInscripto('Internos SA', '30-71000007-3');
  const interna = await facturar(n, await vender(n, n.final));
  assert.equal(interna.json.arca_estado, null);
  assert.equal(interna.json.comprobante, 'B 0001-00000001');
  const r = await n.admin.put('/api/factura-electronica', { punto_venta: 1 });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /comprobantes internos/);
  assert.deepEqual((await n.admin.get('/api/factura-electronica')).json.puntos_internos, [1]);

  assert.equal((await n.admin.put('/api/factura-electronica', { punto_venta: 3 })).status, 200);
  fallar('permiso');
  const sin = await n.admin.post('/api/factura-electronica/verificar');
  fallar('');
  assert.equal(sin.status, 400);
  assert.match(sin.json.error, /delegación/);
  assert.equal((await n.admin.get('/api/factura-electronica')).json.activa, false);
});
