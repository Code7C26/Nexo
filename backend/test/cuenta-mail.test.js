// El mail de la cuenta (hist. §102, docs/investigacion-login-legal.md sección
// 5): se crea con el mail, se entra con él, se verifica con un enlace de un
// solo uso, y una cuenta de antes de §102 lo tiene que sumar antes de operar.
// Los mails no salen: el arnés corre con NEXO_MAIL=stub y los lee de la
// carpeta del servidor.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { crearCliente, crearEmpleado, levantarServidor, registrarEmpresa, ultimoEnlace } from './servidor-de-prueba.js';

let servidor;
// El alta tiene un tope de 5 por hora y por IP: los últimos tests reusan las
// cuentas de los primeros.
let ana;
let ceci;

before(async () => {
  servidor = await levantarServidor();
});

after(async () => {
  await servidor?.cerrar();
});

// El enlace del mail, sin seguir la redirección: lo que importa es a dónde
// manda.
async function tocarEnlace(token) {
  const r = await fetch(`${servidor.url}/verificar-mail?token=${token}`, { redirect: 'manual' });
  assert.equal(r.status, 302);
  return r.headers.get('location');
}

const estado = async (cliente) => (await cliente.get('/api/auth/estado')).json.usuario;

test('el alta crea la cuenta con el mail, manda la verificación y el enlace la verifica una vez', async () => {
  ana = await registrarEmpresa(servidor.url, { empresa: 'Almacén Ana', usuario: 'ana', email: 'Ana@Ejemplo.com' });
  const cuenta = await estado(ana);
  assert.equal(cuenta.email, 'ana@ejemplo.com', 'el mail se guarda en minúsculas');
  assert.equal(cuenta.email_verificado, false);

  const mails = servidor.leerMails('ana@ejemplo.com');
  assert.equal(mails.length, 1);
  assert.match(mails[0].asunto, /Confirmá tu mail/);
  const token = ultimoEnlace(servidor, 'ana@ejemplo.com');
  assert.ok(token, 'el mail trae el enlace');

  assert.equal(await tocarEnlace(token), '/app?mail=verificado');
  assert.equal((await estado(ana)).email_verificado, true);
  // Volver a tocarlo (o que lo haya abierto antes el antivirus del mail) sigue
  // diciendo "verificado", sin escribir de nuevo.
  assert.equal(await tocarEnlace(token), '/app?mail=verificado');
  assert.equal(await tocarEnlace('cualquier-cosa'), '/app?mail=invalido');
  assert.equal((await fetch(`${servidor.url}/verificar-mail`, { redirect: 'manual' })).headers.get('location'), '/app?mail=invalido');

  // Se entra con el mail, sin importar las mayúsculas.
  const login = await crearCliente(servidor.url).post('/api/auth/login', { email: 'ANA@ejemplo.com', password: 'clave-segura-1' });
  assert.equal(login.status, 200, login.texto);
  assert.equal(login.json.usuario.email, 'ana@ejemplo.com');
  const mal = await crearCliente(servidor.url).post('/api/auth/login', { email: 'ana@ejemplo.com', password: 'otra-clave-1' });
  assert.equal(mal.status, 401);
  assert.equal(mal.json.error, 'Mail o contraseña incorrectos.');
});

test('el alta rechaza un mail inválido o que ya usa otra cuenta', async () => {
  const base = { empresa: 'Repetida', nombre: 'Otro', password: 'clave-segura-1' };
  const invalido = await crearCliente(servidor.url).post('/api/auth/registro', { ...base, email_cuenta: 'sin-arroba' });
  assert.equal(invalido.status, 400, invalido.texto);
  const repetido = await crearCliente(servidor.url).post('/api/auth/registro', { ...base, email_cuenta: 'ANA@ejemplo.com' });
  assert.equal(repetido.status, 409, repetido.texto);
});

test('un enlace vencido no verifica, y uno viejo deja de servir cuando llega otro', async () => {
  const beto = await registrarEmpresa(servidor.url, { empresa: 'Kiosco Beto', usuario: 'beto' });
  const primero = ultimoEnlace(servidor, 'beto@nexo.test');
  assert.equal((await beto.post('/api/auth/email/reenviar')).status, 204);
  const segundo = ultimoEnlace(servidor, 'beto@nexo.test');
  assert.notEqual(primero, segundo);
  assert.equal(await tocarEnlace(primero), '/app?mail=invalido', 'el reenvío reemplaza al enlace anterior');

  // Vencido: se adelanta el vencimiento en la base de prueba.
  const base = new DatabaseSync(path.join(servidor.dir, 'nexo.db'));
  try {
    base.prepare("UPDATE tokens_cuenta SET vence = datetime('now', '-1 minute') WHERE email = ?").run('beto@nexo.test');
  } finally {
    base.close();
  }
  assert.equal(await tocarEnlace(segundo), '/app?mail=invalido');
  assert.equal((await estado(beto)).email_verificado, false);
});

test('una cuenta sin mail no opera hasta sumarlo, y sigue entrando con su usuario', async () => {
  ceci = await registrarEmpresa(servidor.url, { empresa: 'Ferretería Ceci', usuario: 'ceci' });
  // Un empleado creado como antes de §102: usuario y contraseña, sin mail.
  const alta = await ceci.post('/api/usuarios', { usuario: 'dani', nombre: 'Dani', password: 'clave-temporal-1' });
  assert.equal(alta.status, 201, alta.texto);
  const dani = crearCliente(servidor.url);
  const login = await dani.post('/api/auth/login', { usuario: 'dani', password: 'clave-temporal-1' });
  assert.equal(login.status, 200, login.texto);
  assert.equal(login.json.usuario.email, null);

  // Primero la contraseña (sigue igual), después el mail.
  assert.equal((await dani.get('/api/productos')).status, 403);
  assert.equal((await dani.post('/api/auth/cambiar-password', { actual: 'clave-temporal-1', nueva: 'clave-segura-2' })).status, 204);
  const sinMail = await dani.get('/api/productos');
  assert.equal(sinMail.status, 403);
  assert.equal(sinMail.json.codigo, 'falta_email');
  assert.equal((await dani.post('/api/auth/email/reenviar')).status, 403, 'sin mail no hay qué reenviar');

  // Sumarlo no pide la contraseña, y no puede ser el mail de otra cuenta.
  assert.equal((await dani.post('/api/auth/email', { email: 'ceci@nexo.test' })).status, 409);
  assert.equal((await dani.post('/api/auth/email', { email: 'no es un mail' })).status, 400);
  const suma = await dani.post('/api/auth/email', { email: 'dani@nexo.test' });
  assert.equal(suma.status, 200, suma.texto);
  assert.equal(suma.json.usuario.email, 'dani@nexo.test');
  assert.equal((await dani.get('/api/productos')).status, 200);
  assert.ok(ultimoEnlace(servidor, 'dani@nexo.test'), 'le llega la verificación');

  // Entra con el mail y también con el usuario de antes.
  for (const cuerpo of [{ email: 'dani@nexo.test' }, { usuario: 'dani' }]) {
    const r = await crearCliente(servidor.url).post('/api/auth/login', { ...cuerpo, password: 'clave-segura-2' });
    assert.equal(r.status, 200, r.texto);
  }

  // El admin lo ve en Usuarios con su mail.
  const lista = (await ceci.get('/api/usuarios')).json;
  assert.deepEqual(
    lista.map((u) => [u.email, !!u.email_verificado]).sort(),
    [
      ['ceci@nexo.test', false],
      ['dani@nexo.test', false]
    ]
  );
});

test('cambiar el mail pide la contraseña, avisa al anterior y deja sin verificar', async () => {
  // Ana ya verificó su mail en el primer test.
  const enlaceViejo = ultimoEnlace(servidor, 'ana@ejemplo.com');

  assert.equal((await ana.post('/api/auth/email', { email: 'ana@otro.com' })).status, 400, 'sin contraseña');
  assert.equal((await ana.post('/api/auth/email', { email: 'ana@otro.com', password: 'mala-clave-1' })).status, 401);
  assert.equal((await ana.post('/api/auth/email', { email: 'ana@ejemplo.com', password: 'clave-segura-1' })).status, 400, 'el mismo');
  const cambio = await ana.post('/api/auth/email', { email: 'ana@otro.com', password: 'clave-segura-1' });
  assert.equal(cambio.status, 200, cambio.texto);
  assert.equal(cambio.json.usuario.email_verificado, false);

  const aviso = servidor.leerMails('ana@ejemplo.com').at(-1);
  assert.match(aviso.asunto, /Cambió el mail/);
  assert.match(aviso.texto, /ana@otro\.com/);
  assert.ok(ultimoEnlace(servidor, 'ana@otro.com'));
  // El enlace del mail anterior ya no es de esta cuenta.
  assert.equal(await tocarEnlace(enlaceViejo), '/app?mail=invalido');

  // Ya no entra con el mail viejo, sí con el nuevo.
  assert.equal((await crearCliente(servidor.url).post('/api/auth/login', { email: 'ana@ejemplo.com', password: 'clave-segura-1' })).status, 401);
  assert.equal((await crearCliente(servidor.url).post('/api/auth/login', { email: 'ana@otro.com', password: 'clave-segura-1' })).status, 200);
});

test('un empleado suma y verifica su propio mail, y los envíos tienen tope', async () => {
  const admin = ceci;
  const empleado = await crearEmpleado(servidor.url, admin, { usuario: 'gise' });
  assert.equal((await estado(empleado)).email, 'gise@nexo.test');
  assert.equal(await tocarEnlace(ultimoEnlace(servidor, 'gise@nexo.test')), '/app?mail=verificado');
  assert.equal((await estado(empleado)).email_verificado, true);
  assert.equal((await empleado.post('/api/auth/email/reenviar')).status, 400, 'ya está verificado');

  // Cinco envíos por hora y por cuenta, entre altas de mail y reenvíos (el
  // alta de la empresa no cuenta: es otro tope).
  const respuestas = [];
  for (let i = 0; i < 6; i++) respuestas.push((await admin.post('/api/auth/email/reenviar')).status);
  assert.deepEqual(respuestas, [204, 204, 204, 204, 204, 429]);
});
