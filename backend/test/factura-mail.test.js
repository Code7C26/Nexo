// Mandar la factura por mail (hist. §186): el PDF lo arma el navegador y el
// servidor lo manda adjunto desde el Gmail del negocio, con un texto fijo. Sin
// Gmail conectado no sale (hist. §218): la casilla de Nexo no manda facturas.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { armarMensaje } from '../mail.js';
import { crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';
import { conectarGmail, levantarGoogleFalso } from './google-falso.js';

let google;
let servidor;
let admin;
let otro;
let producto;

// Lo mínimo que empieza como un PDF; el servidor no lo abre, solo mira que lo sea.
const PDF = Buffer.from('%PDF-1.4\n% factura de prueba\n').toString('base64');

before(async () => {
  google = await levantarGoogleFalso();
  servidor = await levantarServidor({ env: google.env });
  admin = await registrarEmpresa(servidor, { empresa: 'Librería Mail', usuario: 'libmail' });
  otro = await registrarEmpresa(servidor, { empresa: 'Otro Negocio', usuario: 'otromail' });
  await admin.put('/api/negocio', { email: 'hola@libreria.test' });
  await conectarGmail(google, otro, 'otro@gmail.test');
  producto = (await admin.post('/api/productos', { nombre: 'Cuaderno', precio_venta: 5000, tipo: 'servicio' })).json.id;
});

after(async () => {
  await servidor?.cerrar();
  google?.cerrar();
});

async function facturar(cliente) {
  const cliente_id = (await admin.post('/api/clientes', cliente)).json.id;
  const venta = await admin.post('/api/ventas', {
    cliente_id,
    items: [{ producto_id: producto, cantidad: 1, precio_unitario: 5000 }]
  });
  assert.equal(venta.status, 201, venta.texto);
  const r = await admin.post(`/api/ventas/${venta.json.id}/facturar`, { condicion: 'efectivo' });
  assert.equal(r.status, 201, r.texto);
  return { facturaId: r.json.id, clienteId: cliente_id };
}

test('sin el Gmail del negocio conectado, la factura no sale: tampoco desde Nexo', async () => {
  const { facturaId } = await facturar({ nombre: 'Sin Gmail', email: 'singmail@nexo.test' });
  const r = await admin.post(`/api/facturas/${facturaId}/mail`, { para: 'singmail@nexo.test', pdf: PDF });
  assert.equal(r.status, 409, r.texto);
  assert.equal(r.json.codigo, 'gmail_sin_conectar');
  assert.equal(google.mandadosA('singmail@nexo.test').length, 0);
  assert.equal(servidor.leerMails('singmail@nexo.test').length, 0);
  assert.equal((await admin.get(`/api/facturas/${facturaId}`)).json.mail_enviado_a, null);

  // Desde acá, Librería Mail tiene su Gmail conectado.
  await conectarGmail(google, admin, 'libreria@gmail.test');
});

test('la factura sale por mail con el PDF adjunto, desde el Gmail del negocio, y queda anotada', async () => {
  const { facturaId } = await facturar({ nombre: 'Marta', email: 'marta@nexo.test' });
  const r = await admin.post(`/api/facturas/${facturaId}/mail`, { para: 'marta@nexo.test', pdf: PDF });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.mail_enviado_a, 'marta@nexo.test');
  assert.equal(r.json.desde, 'libreria@gmail.test');

  const mail = google.mandadosA('marta@nexo.test').at(-1);
  assert.match(mail.asunto, /^Factura [ABC] 0001-\d{8} de Librería Mail$/);
  assert.equal(mail.de, 'Librería Mail<libreria@gmail.test>');
  assert.equal(mail.responderA, null, 'la respuesta ya le llega a su Gmail');
  assert.match(mail.texto, /Hola, Marta\. Te mandamos la factura .+ de Librería Mail, por \$ 5\.000\./);
  assert.equal(mail.adjuntos.length, 1);
  assert.equal(mail.adjuntos[0].tipo, 'application/pdf');
  assert.match(mail.adjuntos[0].nombre, /^factura-[ABC]-0001-\d{8}\.pdf$/);
  assert.equal(mail.adjuntos[0].comienzo, '%PDF-1.4');

  const factura = (await admin.get(`/api/facturas/${facturaId}`)).json;
  assert.equal(factura.mail_enviado_a, 'marta@nexo.test');
  assert.ok(factura.mail_enviado_en);
  const listado = (await admin.get('/api/facturas')).json.find((f) => f.id === facturaId);
  assert.equal(listado.mail_enviado_a, 'marta@nexo.test');
});

test('el mail que se escribe al mandarla queda en la ficha del cliente si se pide', async () => {
  const { facturaId, clienteId } = await facturar({ nombre: 'Julio' });
  const r = await admin.post(`/api/facturas/${facturaId}/mail`, {
    para: 'julio@nexo.test',
    pdf: PDF,
    guardar_en_cliente: true
  });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.guardado_en_cliente, true);
  assert.equal((await admin.get(`/api/clientes/${clienteId}`)).json.email, 'julio@nexo.test');

  // Uno que ya tenía mail no se pisa.
  const { facturaId: otra, clienteId: conMail } = await facturar({ nombre: 'Rosa', email: 'rosa@nexo.test' });
  const r2 = await admin.post(`/api/facturas/${otra}/mail`, { para: 'contadora@nexo.test', pdf: PDF, guardar_en_cliente: true });
  assert.equal(r2.json.guardado_en_cliente, false);
  assert.equal((await admin.get(`/api/clientes/${conMail}`)).json.email, 'rosa@nexo.test');
});

test('sin un PDF de verdad o sin un mail válido no sale nada', async () => {
  const { facturaId } = await facturar({ nombre: 'Pedro' });
  const antes = google.mandadosA('pedro@nexo.test').length;

  const sinPdf = await admin.post(`/api/facturas/${facturaId}/mail`, { para: 'pedro@nexo.test' });
  assert.equal(sinPdf.status, 400);
  const otroArchivo = await admin.post(`/api/facturas/${facturaId}/mail`, {
    para: 'pedro@nexo.test',
    pdf: Buffer.from('<html>hola</html>').toString('base64')
  });
  assert.equal(otroArchivo.status, 400);
  assert.match(otroArchivo.json.error, /PDF/);
  const mailMalo = await admin.post(`/api/facturas/${facturaId}/mail`, { para: 'pedro@nexo.test\r\nBcc: x@y.com', pdf: PDF });
  assert.equal(mailMalo.status, 400);

  assert.equal(google.mandadosA('pedro@nexo.test').length, antes);
});

test('un PDF grande pasa (no lo corta el límite general de 100 KB)', async () => {
  const { facturaId } = await facturar({ nombre: 'Grande' });
  const grande = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(600 * 1024, 0x41)]).toString('base64');
  const r = await admin.post(`/api/facturas/${facturaId}/mail`, { para: 'grande@nexo.test', pdf: grande });
  assert.equal(r.status, 200, r.texto);
  assert.ok(google.mandadosA('grande@nexo.test').at(-1).adjuntos[0].bytes > 600 * 1024);
});

test('otro negocio no puede mandar una factura ajena', async () => {
  const { facturaId } = await facturar({ nombre: 'Ajena' });
  const r = await otro.post(`/api/facturas/${facturaId}/mail`, { para: 'ajena@nexo.test', pdf: PDF });
  assert.equal(r.status, 404);
  assert.equal(google.mandadosA('ajena@nexo.test').length, 0);
});

test('en Gratis no se mandan facturas por mail: es desde Emprendedor, como la factura electrónica', async () => {
  const gratis = await registrarEmpresa(servidor, { empresa: 'Medialunas Mail', usuario: 'medialunasmail', plan: 'gratis' });
  const prod = (await gratis.post('/api/productos', { nombre: 'Docena', precio_venta: 6000, tipo: 'servicio' })).json.id;
  const cliente_id = (await gratis.post('/api/clientes', { nombre: 'Vecina', email: 'vecina@nexo.test' })).json.id;
  const venta = await gratis.post('/api/ventas', { cliente_id, items: [{ producto_id: prod, cantidad: 1, precio_unitario: 6000 }] });
  const facturaId = (await gratis.post(`/api/ventas/${venta.json.id}/facturar`, { condicion: 'efectivo' })).json.id;
  const r = await gratis.post(`/api/facturas/${facturaId}/mail`, { para: 'vecina@nexo.test', pdf: PDF });
  assert.equal(r.status, 403);
  assert.equal(r.json.codigo, 'limite_plan');
  assert.equal(google.mandadosA('vecina@nexo.test').length, 0);
});

test('el empleado también la puede mandar', async () => {
  const empleado = await crearEmpleado(servidor, admin, { usuario: 'cajeramail' });
  const { facturaId } = await facturar({ nombre: 'Lucía' });
  const r = await empleado.post(`/api/facturas/${facturaId}/mail`, { para: 'lucia@nexo.test', pdf: PDF });
  assert.equal(r.status, 200, r.texto);
});

// El From, con sus líneas de continuación y los trozos en base64 decodificados.
function fromDecodificado(mensaje) {
  const lineas = mensaje.split('\r\n');
  const desde = lineas.findIndex((l) => l.startsWith('From: '));
  let crudo = lineas[desde].slice(6);
  for (let i = desde + 1; lineas[i].startsWith(' '); i++) crudo += lineas[i].trim();
  return crudo.replace(/=\?UTF-8\?B\?([^?]+)\?=\s*/g, (_, b64) => Buffer.from(b64, 'base64').toString());
}

test('el mensaje con adjunto va en multipart/mixed, con el negocio en el From y el Reply-To', () => {
  const mensaje = armarMensaje({
    de: 'nexo@ejemplo.com',
    nombre: 'Kiosco "El Sol"\r\nBcc: x@y.com',
    responderA: 'sol@ejemplo.com',
    para: 'ana@ejemplo.com',
    asunto: 'Factura',
    texto: 'hola',
    html: '<p>hola</p>',
    adjuntos: [{ nombre: 'factura B 0001.pdf', tipo: 'application/pdf', contenido: Buffer.from('%PDF-1.4 x') }]
  });
  const lineas = mensaje.split('\r\n');
  assert.equal(lineas.filter((l) => /^Bcc:/i.test(l)).length, 0, 'el nombre del negocio no mete encabezados');
  assert.equal(fromDecodificado(mensaje), 'Kiosco El Sol Bcc: x@y.com vía Nexo<nexo@ejemplo.com>');
  assert.ok(lineas.includes('Reply-To: <sol@ejemplo.com>'));
  assert.ok(mensaje.includes('Content-Type: multipart/mixed'));
  assert.ok(mensaje.includes('Content-Type: multipart/alternative'));
  assert.ok(lineas.includes('Content-Disposition: attachment; filename="factura-B-0001.pdf"'));
  assert.ok(mensaje.includes(Buffer.from('%PDF-1.4 x').toString('base64')));

  // Sin nombre de negocio sale como siempre, de Nexo.
  const deNexo = armarMensaje({ de: 'nexo@ejemplo.com', para: 'ana@ejemplo.com', asunto: 'x', texto: 'hola' });
  assert.ok(deNexo.split('\r\n').includes('From: Nexo <nexo@ejemplo.com>'));
});
