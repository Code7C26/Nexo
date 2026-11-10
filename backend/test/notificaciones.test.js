// Las notificaciones (Web Push, hist. §146), contra un servicio de push falso
// que hace de navegador: guarda su par de claves, verifica la firma VAPID de
// cada aviso y lo descifra (RFC 8291), así el test ve lo que vería el
// celular. Va aparte porque cada archivo levanta su servidor, y el alta de
// empresas tiene un tope de intentos por IP.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createDecipheriv, createECDH, createPublicKey, hkdfSync, randomBytes, verify } from 'node:crypto';

import { crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

/* ---------- El servicio de push falso ---------- */

const recibidos = [];
// Las direcciones que el "navegador" ya no tiene: el servicio contesta 410.
const vencidas = new Set();
const navegadores = new Map();
let falso;
let base;

function descifrar(cuerpo, { ecdh, auth }) {
  const sal = cuerpo.subarray(0, 16);
  const largoClave = cuerpo[20];
  const publicaNexo = cuerpo.subarray(21, 21 + largoClave);
  const cifrado = cuerpo.subarray(21 + largoClave);
  const compartido = ecdh.computeSecret(publicaNexo);
  const info = Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), publicaNexo]);
  const ikm = Buffer.from(hkdfSync('sha256', compartido, auth, info, 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, sal, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, sal, Buffer.from('Content-Encoding: nonce\0'), 12));
  const descifrador = createDecipheriv('aes-128-gcm', cek, nonce);
  descifrador.setAuthTag(cifrado.subarray(cifrado.length - 16));
  const claro = Buffer.concat([descifrador.update(cifrado.subarray(0, cifrado.length - 16)), descifrador.final()]);
  assert.equal(claro.at(-1), 2, 'el último registro termina en 0x02');
  return JSON.parse(claro.subarray(0, -1).toString());
}

// La firma ES256 del JWT, con la clave pública que viene en "k".
function vapidValido(encabezado) {
  const [, t, k] = /^vapid t=([^,]+), k=(.+)$/.exec(encabezado ?? '') ?? [];
  if (!t) return false;
  const [cabeza, datos, firma] = t.split('.');
  const punto = Buffer.from(k, 'base64url');
  const llave = createPublicKey({
    key: { kty: 'EC', crv: 'P-256', x: punto.subarray(1, 33).toString('base64url'), y: punto.subarray(33).toString('base64url') },
    format: 'jwk'
  });
  const reclamos = JSON.parse(Buffer.from(datos, 'base64url'));
  return (
    verify('sha256', Buffer.from(`${cabeza}.${datos}`), { key: llave, dsaEncoding: 'ieee-p1363' }, Buffer.from(firma, 'base64url')) &&
    reclamos.aud === base &&
    reclamos.exp > Date.now() / 1000
  );
}

function atender(req, res) {
  const partes = [];
  req.on('data', (p) => partes.push(p));
  req.on('end', () => {
    const endpoint = `${base}${req.url}`;
    if (vencidas.has(endpoint)) return res.writeHead(410).end();
    const navegador = navegadores.get(endpoint);
    if (!navegador || !vapidValido(req.headers.authorization) || req.headers['content-encoding'] !== 'aes128gcm') {
      return res.writeHead(401).end();
    }
    recibidos.push({ endpoint, aviso: descifrar(Buffer.concat(partes), navegador) });
    res.writeHead(201).end();
  });
}

// Un "navegador" nuevo: su dirección en el servicio falso y sus claves.
function navegador(nombre) {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = randomBytes(16);
  const endpoint = `${base}/push/${nombre}`;
  navegadores.set(endpoint, { ecdh, auth });
  return { endpoint, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } };
}

async function llegaA(endpoint, condicion = () => true, ms = 3000) {
  const hasta = Date.now() + ms;
  while (Date.now() < hasta) {
    const aviso = recibidos.find((r) => r.endpoint === endpoint && condicion(r.aviso));
    if (aviso) return aviso.aviso;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

/* ---------- Nexo ---------- */

let servidor;
let admin;
let empleado;

before(async () => {
  falso = createServer(atender);
  await new Promise((r) => falso.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${falso.address().port}`;
  servidor = await levantarServidor({ env: { NEXO_PUSH_HOSTS: new URL(base).host } });
  admin = await registrarEmpresa(servidor, { empresa: 'Gimnasio Avisos', usuario: 'gimavisos' });
  empleado = await crearEmpleado(servidor, admin, { usuario: 'recepcion' });
});

after(async () => {
  await servidor?.cerrar();
  falso?.close();
});

test('la clave pública es una y la misma; sin suscripción no hay prueba, y una suscripción trucha no se guarda', async () => {
  const { clave_publica: clave } = (await admin.get('/api/notificaciones')).json;
  assert.equal(Buffer.from(clave, 'base64url').length, 65);
  assert.equal((await empleado.get('/api/notificaciones')).json.clave_publica, clave);
  assert.equal((await admin.post('/api/notificaciones/probar')).status, 409);

  const buena = navegador('admin');
  const truchas = [
    { ...buena, endpoint: 'https://una-direccion-interna.local/push/1' },
    { ...buena, endpoint: 'http://127.0.0.1:1/push/1' },
    { ...buena, keys: { ...buena.keys, auth: 'corta' } },
    { ...buena, keys: { ...buena.keys, p256dh: Buffer.alloc(10).toString('base64url') } }
  ];
  for (const s of truchas) assert.equal((await admin.post('/api/notificaciones/suscripcion', s)).status, 400, JSON.stringify(s));
});

test('la de prueba llega cifrada y firmada, y la descifra el navegador', async () => {
  const s = navegador('admin-prueba');
  assert.equal((await admin.post('/api/notificaciones/suscripcion', s)).status, 201);
  // Volver a anotar la misma dirección no la duplica.
  assert.equal((await admin.post('/api/notificaciones/suscripcion', s)).status, 201);
  assert.deepEqual((await admin.post('/api/notificaciones/probar')).json, { aparatos: 1 });
  const aviso = await llegaA(s.endpoint);
  assert.ok(aviso, 'llegó la de prueba');
  assert.equal(aviso.titulo, '¡Listo! Las notificaciones andan');
  assert.equal(aviso.url, '/app#/configuracion/notificaciones');
});

test('el stock que llega al mínimo avisa al admin una vez', async () => {
  const s = navegador('admin-stock');
  await admin.post('/api/notificaciones/suscripcion', s);
  const proteina = (await admin.post('/api/productos', { nombre: 'Proteína 1 kg', precio_venta: 48000, stock_minimo: 3, tipo: 'producto' })).json.id;
  await admin.post('/api/carga-inicial/stock', { filas: [{ producto_id: proteina, cantidad: 5, costo: 30000 }] });
  const vender = () =>
    admin.post('/api/ventas', { cliente: 'Consumidor final', items: [{ producto_id: proteina, cantidad: 1, precio_unitario: 48000 }] });
  await vender();
  assert.equal(await llegaA(s.endpoint, (a) => a.titulo.includes('Proteína'), 500), null, 'con 4 todavía no');
  await vender();
  const aviso = await llegaA(s.endpoint, (a) => a.titulo === 'Stock bajo: Proteína 1 kg');
  assert.ok(aviso, 'con 3 avisa');
  assert.equal(aviso.cuerpo, 'Gimnasio Avisos · Quedan 3 (el mínimo es 3).');
  assert.equal(aviso.url, '/app#/stock');
  await vender();
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(recibidos.filter((r) => r.endpoint === s.endpoint && r.aviso.titulo.includes('Proteína')).length, 1, 'no repite');
});

test('quien espera en la entrada avisa a los dos roles; cerrar sesión apaga el aparato', async () => {
  const delAdmin = navegador('admin-entrada');
  const delEmpleado = navegador('empleado-entrada');
  await admin.post('/api/notificaciones/suscripcion', delAdmin);
  await empleado.post('/api/notificaciones/suscripcion', delEmpleado);
  const plan = (await admin.post('/api/planes-socio', { nombre: 'Pase libre', opciones: [{ meses: 1, precio: 30000 }] })).json;
  await admin.post('/api/socios', { cliente: { nombre: 'Ana López', documento: '30444555' }, planes: [{ opcion_id: plan.opciones[0].id }] });

  await empleado.post('/api/socios/entrada', { codigo: '30444555' });
  for (const s of [delAdmin, delEmpleado]) {
    const aviso = await llegaA(s.endpoint, (a) => a.titulo === 'Ana López espera en la entrada');
    assert.ok(aviso, s.endpoint);
    assert.equal(aviso.cuerpo, 'Gimnasio Avisos · Debe $ 30.000.');
  }

  // El empleado cierra sesión: su aparato deja de recibir.
  assert.equal((await empleado.post('/api/auth/logout')).status, 204);
  const antes = recibidos.length;
  await admin.post('/api/socios/entrada', { codigo: '30444555' });
  await llegaA(delAdmin.endpoint, () => recibidos.length > antes);
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(!recibidos.slice(antes).some((r) => r.endpoint === delEmpleado.endpoint), 'sin sesión no le llega');
});

test('una dirección que el navegador ya no tiene se borra, y apagar la saca', async () => {
  const vieja = navegador('vieja');
  await admin.post('/api/notificaciones/suscripcion', vieja);
  vencidas.add(vieja.endpoint);
  await admin.post('/api/notificaciones/probar');
  await new Promise((r) => setTimeout(r, 500));
  const quedan = (await admin.post('/api/notificaciones/probar')).json.aparatos;

  const apagada = navegador('apagada');
  await admin.post('/api/notificaciones/suscripcion', apagada);
  assert.equal((await admin.post('/api/notificaciones/probar')).json.aparatos, quedan + 1);
  assert.equal((await admin.post('/api/notificaciones/apagar', { endpoint: apagada.endpoint })).status, 204);
  assert.equal((await admin.post('/api/notificaciones/probar')).json.aparatos, quedan);
  assert.ok(!(await llegaA(vieja.endpoint, () => true, 200)), 'a la vencida no le llega nada');
});
