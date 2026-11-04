// WhatsApp como canal del asistente (hist. §134), contra un WhatsApp falso en
// la misma máquina: el saludo del webhook, la firma de los avisos, vincular el
// teléfono con el código de Mi cuenta, y una frase (escrita o en audio) que
// vuelve como propuesta con botones y se registra recién al confirmar, con
// las mismas reglas que el asistente de la web. Va aparte porque cada archivo
// levanta su servidor.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';

import { crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

const NUMERO_ID = 'num-nexo';
const SECRETO_APP = 'secreto-de-la-app';
const TOKEN_SALUDO = 'saludo-de-prueba';
const TELEFONO_ADMIN = '5493511111111';
const TELEFONO_EMPLEADO = '5493512222222';
const TELEFONO_DESCONOCIDO = '5493513333333';

let servidor;
let servidorFalso;
let admin;
let empleado;
let otro;
// Lo que Nexo mandó a WhatsApp: { para, tipo, texto, botones }.
const enviados = [];
// Los audios que sirve el WhatsApp falso: su "contenido" es la frase (el
// intérprete de prueba transcribe leyendo los bytes como texto).
const audios = new Map();

function atender(req, res) {
  let cuerpo = '';
  req.on('data', (d) => (cuerpo += d));
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    if (req.headers.authorization !== 'Bearer token-de-prueba') {
      res.writeHead(401).end('{}');
      return;
    }
    if (req.method === 'POST' && url.pathname === `/v25.0/${NUMERO_ID}/messages`) {
      const m = JSON.parse(cuerpo);
      enviados.push({
        para: m.to,
        tipo: m.type,
        texto: m.type === 'text' ? m.text.body : m.interactive.body.text,
        botones: m.type === 'interactive' ? m.interactive.action.buttons.map((b) => b.reply) : []
      });
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ messages: [{ id: 'wamid.salida' }] }));
      return;
    }
    const media = /^\/v25\.0\/(audio-[\w-]+)$/.exec(url.pathname);
    if (media && audios.has(media[1])) {
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({ url: `http://${req.headers.host}/archivo/${media[1]}`, mime_type: 'audio/ogg' })
      );
      return;
    }
    const archivo = /^\/archivo\/(audio-[\w-]+)$/.exec(url.pathname);
    if (archivo && audios.has(archivo[1])) {
      res.writeHead(200, { 'content-type': 'audio/ogg' }).end(audios.get(archivo[1]));
      return;
    }
    res.writeHead(404).end('{}');
  });
}

let numeroDeMensaje = 0;
// Un aviso de Meta con un mensaje, firmado (o no) con el secreto de la app.
async function avisar(de, mensaje, { firmar = true, id = `wamid.${++numeroDeMensaje}` } = {}) {
  const cuerpo = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          { field: 'messages', value: { metadata: { phone_number_id: NUMERO_ID }, messages: [{ id, from: de, ...mensaje }] } }
        ]
      }
    ]
  });
  const firma = createHmac('sha256', firmar ? SECRETO_APP : 'otro-secreto').update(cuerpo).digest('hex');
  const res = await fetch(`${servidor.url}/api/integraciones/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${firma}` },
    body: cuerpo
  });
  assert.equal(res.status, 200);
  return id;
}
const texto = (body) => ({ type: 'text', text: { body } });
const boton = (id) => ({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id, title: 'x' } } });

// Espera a que Nexo mande `cuantos` mensajes más a WhatsApp, y los devuelve.
async function respuestas(desde, cuantos = 1) {
  for (let i = 0; i < 100 && enviados.length < desde + cuantos; i += 1) await new Promise((r) => setTimeout(r, 30));
  assert.equal(enviados.length, desde + cuantos, `respuestas: ${JSON.stringify(enviados.slice(desde))}`);
  return enviados.slice(desde);
}
// Manda un mensaje y espera las respuestas que genera.
async function conversar(de, mensaje, cuantos = 1) {
  const antes = enviados.length;
  await avisar(de, mensaje);
  return respuestas(antes, cuantos);
}

async function vincular(cliente, telefono) {
  const pedido = await cliente.post('/api/whatsapp/vincular');
  assert.equal(pedido.status, 200, pedido.texto);
  const [respuesta] = await conversar(telefono, texto(`NEXO ${pedido.json.codigo}`));
  assert.match(respuesta.texto, /quedó vinculado/);
  return pedido.json;
}

before(async () => {
  servidorFalso = createServer(atender);
  await new Promise((r) => servidorFalso.listen(0, '127.0.0.1', r));
  servidor = await levantarServidor({
    env: {
      WHATSAPP_TOKEN: 'token-de-prueba',
      WHATSAPP_PHONE_NUMBER_ID: NUMERO_ID,
      WHATSAPP_APP_SECRET: SECRETO_APP,
      WHATSAPP_VERIFY_TOKEN: TOKEN_SALUDO,
      WHATSAPP_NUMERO: '+1 555 010 0100',
      WHATSAPP_API_URL: `http://127.0.0.1:${servidorFalso.address().port}`
    }
  });
  admin = await registrarEmpresa(servidor, { empresa: 'Ropa del Centro', usuario: 'ropacentro' });
  empleado = await crearEmpleado(servidor, admin, { usuario: 'vendedorcentro' });
  otro = await registrarEmpresa(servidor, { empresa: 'Otro Negocio', usuario: 'otronegocio' });
  await admin.post('/api/productos', { nombre: 'Remera', precio_venta: 9000, tipo: 'servicio' });
});

after(async () => {
  await servidor?.cerrar();
  servidorFalso?.close();
});

test('el saludo del webhook: solo con el token de Nexo', async () => {
  const bien = await fetch(
    `${servidor.url}/api/integraciones/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${TOKEN_SALUDO}&hub.challenge=12345`
  );
  assert.equal(bien.status, 200);
  assert.equal(await bien.text(), '12345');
  const mal = await fetch(`${servidor.url}/api/integraciones/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=1`);
  assert.equal(mal.status, 403);
});

test('vincular: con el código de Mi cuenta, y sin firma no se atiende nada', async () => {
  assert.deepEqual((await admin.get('/api/whatsapp')).json, { disponible: true, numero: '15550100100', vinculo: null });

  // Un número sin vincular recibe cómo hacerlo.
  const [desconocido] = await conversar(TELEFONO_DESCONOCIDO, texto('Hola'));
  assert.match(desconocido.texto, /no está vinculado/);

  const pedido = await admin.post('/api/whatsapp/vincular');
  assert.equal(pedido.status, 200);
  assert.match(pedido.json.codigo, /^\d{6}$/);
  assert.equal(pedido.json.enlace, `https://wa.me/15550100100?text=NEXO%20${pedido.json.codigo}`);

  // Un aviso sin la firma de Meta no hace nada.
  const antes = enviados.length;
  await avisar(TELEFONO_ADMIN, texto(`NEXO ${pedido.json.codigo}`), { firmar: false });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(enviados.length, antes);

  // Un código que no es: no vincula.
  const [mal] = await conversar(TELEFONO_ADMIN, texto(pedido.json.codigo === '000000' ? '111111' : '000000'));
  assert.match(mal.texto, /no sirve/);

  const [bien] = await conversar(TELEFONO_ADMIN, texto(`nexo ${pedido.json.codigo}`));
  assert.match(bien.texto, /quedó vinculado a Ropa del Centro/);
  const { vinculo } = (await admin.get('/api/whatsapp')).json;
  assert.equal(vinculo.telefono, TELEFONO_ADMIN);
  assert.equal(vinculo.negocio, 'Ropa del Centro');
  // El código ya se usó.
  const [repetido] = await conversar(TELEFONO_EMPLEADO, texto(`NEXO ${pedido.json.codigo}`));
  assert.match(repetido.texto, /no sirve/);

  const auditoria = (await admin.get('/api/auditoria')).json;
  assert.ok((auditoria.filas ?? auditoria).some((a) => a.operacion_tipo === 'whatsapp' && /vinculado \(terminado en 1111\)/.test(a.detalle)));
});

test('una venta escrita: propone con botones, registra al confirmar y una sola vez', async () => {
  const [propuesta] = await conversar(TELEFONO_ADMIN, texto('venta: cliente=Juan Pérez; item=Remera,2,9000'));
  assert.equal(propuesta.tipo, 'interactive');
  assert.match(propuesta.texto, /Venta a Juan Pérez/);
  assert.match(propuesta.texto, /2 × Remera/);
  assert.match(propuesta.texto, /¿Lo registro\?/);
  const [si, no] = propuesta.botones;
  assert.deepEqual([si.title, no.title], ['Confirmar', 'Cancelar']);

  // Nada se registró todavía.
  const ventasAntes = (await admin.get('/api/ventas')).json.length;

  // Meta reintenta el mismo aviso: no se procesa dos veces.
  const antes = enviados.length;
  const id = await avisar(TELEFONO_ADMIN, boton(si.id));
  await avisar(TELEFONO_ADMIN, boton(si.id), { id });
  const [listo] = await respuestas(antes, 1);
  assert.match(listo.texto, /Listo: registré la venta #\d+/);
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(enviados.length, antes + 1);

  const ventas = (await admin.get('/api/ventas')).json;
  assert.equal(ventas.length, ventasAntes + 1);
  const ventaId = Number(/#(\d+)/.exec(listo.texto)[1]);
  const venta = (await admin.get(`/api/ventas/${ventaId}`)).json;
  assert.equal(venta.cliente, 'Juan Pérez');
  assert.equal(venta.total, 18000);
  const auditoria = (await admin.get('/api/auditoria')).json;
  assert.ok((auditoria.filas ?? auditoria).some((a) => a.entidad === 'venta' && a.entidad_id === ventaId && a.actor === 'asistente'));

  // Otro toque en Confirmar (un mensaje nuevo): ya está.
  const [otraVez] = await conversar(TELEFONO_ADMIN, boton(si.id));
  assert.match(otraVez.texto, /ya se confirmó/);
});

test('cancelar, lo que falta y lo que no es una operación', async () => {
  const [propuesta] = await conversar(TELEFONO_ADMIN, texto('venta: cliente=Ana; item=Remera,1,9000'));
  const [cancelado] = await conversar(TELEFONO_ADMIN, boton(propuesta.botones[1].id));
  assert.match(cancelado.texto, /no registré nada/);
  const [despues] = await conversar(TELEFONO_ADMIN, boton(propuesta.botones[0].id));
  assert.match(despues.texto, /ya se confirmó o se canceló/);

  // Un producto que no existe: dice qué falta, sin botones.
  const [falta] = await conversar(TELEFONO_ADMIN, texto('venta: cliente=Ana; item=Campera,1,50000'));
  assert.equal(falta.tipo, 'text');
  assert.match(falta.texto, /Para registrarlo me falta/);

  const [charla] = await conversar(TELEFONO_ADMIN, texto('¿qué tal?'));
  assert.match(charla.texto, /Contame lo que vendiste/);
});

test('una nota de voz: se transcribe, se muestra qué entendió y propone igual', async () => {
  audios.set('audio-1', Buffer.from('venta: cliente=Luis; item=Remera,1,9000'));
  const [entendi, propuesta] = await conversar(TELEFONO_ADMIN, { type: 'audio', audio: { id: 'audio-1', mime_type: 'audio/ogg' } }, 2);
  assert.match(entendi.texto, /Entendí: "venta: cliente=Luis/);
  assert.match(propuesta.texto, /Venta a Luis/);
  assert.equal(propuesta.botones.length, 2);
});

test('el empleado opera con su rol, y nadie confirma una propuesta ajena', async () => {
  await vincular(empleado, TELEFONO_EMPLEADO);
  const [compra] = await conversar(TELEFONO_EMPLEADO, texto('compra: proveedor=Textil SA; item=Remera,10,4000'));
  const [rechazo] = await conversar(TELEFONO_EMPLEADO, boton(compra.botones[0].id));
  assert.match(rechazo.texto, /No lo pude registrar: Necesitás ser administrador/);

  // Una propuesta del admin, tocada desde el teléfono del empleado.
  const [delAdmin] = await conversar(TELEFONO_ADMIN, texto('venta: cliente=Ana; item=Remera,1,9000'));
  const [ajena] = await conversar(TELEFONO_EMPLEADO, boton(delAdmin.botones[0].id));
  assert.match(ajena.texto, /No encontré esa propuesta/);

  // Otro negocio no ve el vínculo de este.
  assert.equal((await otro.get('/api/whatsapp')).json.vinculo, null);
});

test('desvincular: el número deja de operar', async () => {
  assert.equal((await admin.del('/api/whatsapp/vinculo')).status, 204);
  assert.equal((await admin.get('/api/whatsapp')).json.vinculo, null);
  const [respuesta] = await conversar(TELEFONO_ADMIN, texto('venta: cliente=Ana; item=Remera,1,9000'));
  assert.match(respuesta.texto, /no está vinculado/);
  assert.equal((await admin.del('/api/whatsapp/vinculo')).status, 404);
});
