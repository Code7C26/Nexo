// El mail de la cuenta (hist. §102, docs/investigacion-login-legal.md sección
// 5): se crea con el mail ya confirmado por el código (hist. §108; el código
// en sí se prueba en codigo-mail.test.js), se entra con él, una cuenta de
// antes sin confirmar usa el enlace de un solo uso, y una de antes de §102 lo
// tiene que sumar antes de operar.
// Los mails no salen: el arnés corre con NEXO_MAIL=stub y los lee de la
// carpeta del servidor.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { ACEPTA, codigoDelMail, crearCliente, crearEmpleado, levantarServidor, registrarEmpresa, ultimoEnlace } from './servidor-de-prueba.js';

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

// Una cuenta de antes de §102, como la dejaba POST /api/usuarios: sin mail y
// con la contraseña que eligió el admin, que se cambia al entrar.
function crearCuentaVieja(organizacionId, usuario, password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password.normalize('NFKC'), salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const base = new DatabaseSync(path.join(servidor.dir, 'nexo.db'));
  try {
    const { lastInsertRowid: id } = base
      .prepare(
        `INSERT INTO usuarios (organizacion_id, usuario, nombre, password_hash, password_salt, debe_cambiar_password)
         VALUES (?, ?, ?, ?, ?, 1)`
      )
      .run(organizacionId, usuario, usuario[0].toUpperCase() + usuario.slice(1), hash.toString('hex'), salt.toString('hex'));
    base.prepare("INSERT INTO usuario_organizaciones (usuario_id, organizacion_id, rol) VALUES (?, ?, 'empleado')").run(id, organizacionId);
  } finally {
    base.close();
  }
}

test('el alta crea la cuenta con el mail ya confirmado, y se entra con él', async () => {
  ana = await registrarEmpresa(servidor, { empresa: 'Almacén Ana', usuario: 'ana', email: 'Ana@Ejemplo.com' });
  const cuenta = await estado(ana);
  assert.equal(cuenta.email, 'ana@ejemplo.com', 'el mail se guarda en minúsculas');
  assert.equal(cuenta.email_verificado, true, 'lo confirmó con el código antes de crearla (hist. §108)');

  // Le llegó solo el código: no hace falta un enlace aparte.
  const mails = servidor.leerMails('ana@ejemplo.com');
  assert.equal(mails.length, 1);
  assert.match(mails[0].asunto, /^\d{6} es tu código de Nexo$/);
  assert.equal(ultimoEnlace(servidor, 'ana@ejemplo.com'), null);

  // Se entra con el mail, sin importar las mayúsculas.
  const login = await crearCliente(servidor.url).post('/api/auth/login', { email: 'ANA@ejemplo.com', password: 'clave-segura-1' });
  assert.equal(login.status, 200, login.texto);
  assert.equal(login.json.usuario.email, 'ana@ejemplo.com');
  const mal = await crearCliente(servidor.url).post('/api/auth/login', { email: 'ana@ejemplo.com', password: 'otra-clave-1' });
  assert.equal(mal.status, 401);
  assert.equal(mal.json.error, 'Mail o contraseña incorrectos.');
});

test('el alta rechaza un mail inválido o sin confirmar', async () => {
  const base = { empresa: 'Repetida', nombre: 'Otro', password: 'clave-segura-1' };
  const invalido = await crearCliente(servidor.url).post('/api/auth/registro', { ...ACEPTA, ...base, email_cuenta: 'sin-arroba' });
  assert.equal(invalido.status, 400, invalido.texto);
  const sinCodigo = await crearCliente(servidor.url).post('/api/auth/registro', { ...ACEPTA, ...base, email_cuenta: 'nuevo@nexo.test' });
  assert.equal(sinCodigo.status, 400, sinCodigo.texto);
  assert.equal(sinCodigo.json.codigo, 'mail_sin_confirmar');
});

// Una cuenta sin confirmar es de antes de hist. §108 (desde ahí el alta y el
// cambio de mail confirman con el código): sigue usando el enlace.
function comoCuentaDeAntes(email) {
  const base = new DatabaseSync(path.join(servidor.dir, 'nexo.db'));
  try {
    base.prepare('UPDATE usuarios SET email_verificado = NULL WHERE email = ?').run(email);
  } finally {
    base.close();
  }
}

test('una cuenta de antes sin confirmar usa el enlace: vale el último, vence y verifica una vez', async () => {
  const beto = await registrarEmpresa(servidor, { empresa: 'Kiosco Beto', usuario: 'beto' });
  comoCuentaDeAntes('beto@nexo.test');
  assert.equal((await estado(beto)).email_verificado, false);

  assert.equal((await beto.post('/api/auth/email/reenviar')).status, 204);
  const primero = ultimoEnlace(servidor, 'beto@nexo.test');
  assert.match(servidor.leerMails('beto@nexo.test').at(-1).asunto, /Confirmá tu mail/);
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

  assert.equal((await beto.post('/api/auth/email/reenviar')).status, 204);
  const tercero = ultimoEnlace(servidor, 'beto@nexo.test');
  assert.equal(await tocarEnlace(tercero), '/app?mail=verificado');
  assert.equal((await estado(beto)).email_verificado, true);
  // Volver a tocarlo (o que lo haya abierto antes el antivirus del mail) sigue
  // diciendo "verificado", sin escribir de nuevo.
  assert.equal(await tocarEnlace(tercero), '/app?mail=verificado');
  assert.equal(await tocarEnlace('cualquier-cosa'), '/app?mail=invalido');
  assert.equal((await fetch(`${servidor.url}/verificar-mail`, { redirect: 'manual' })).headers.get('location'), '/app?mail=invalido');
});

test('una cuenta sin mail no opera hasta sumarlo, y sigue entrando con su usuario', async () => {
  ceci = await registrarEmpresa(servidor, { empresa: 'Ferretería Ceci', usuario: 'ceci' });
  // Un empleado creado como antes de §102: usuario y contraseña elegidos por
  // el admin, sin mail. Desde hist. §104 ese alta ya no existe (se invita por
  // mail), así que la cuenta se escribe directo en la base de prueba, con el
  // mismo scrypt que server.js.
  crearCuentaVieja((await ceci.get('/api/negocio')).json.id, 'dani', 'clave-temporal-1');
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
  const pedido = await dani.post('/api/auth/email', { email: 'dani@nexo.test' });
  assert.equal(pedido.status, 202, pedido.texto);
  // Hasta que llega el código sigue sin mail (hist. §108).
  assert.equal((await dani.get('/api/productos')).json.codigo, 'falta_email');
  const suma = await dani.post('/api/auth/email/confirmar', { codigo: codigoDelMail(servidor, 'dani@nexo.test') });
  assert.equal(suma.status, 200, suma.texto);
  assert.equal(suma.json.usuario.email, 'dani@nexo.test');
  assert.equal(suma.json.usuario.email_verificado, true);
  // Después del mail, los términos (etapa 8b, Fase 3): es una cuenta de antes.
  assert.equal((await dani.get('/api/productos')).json.codigo, 'faltan_terminos');
  assert.equal((await dani.post('/api/auth/terminos', ACEPTA)).status, 200);
  assert.equal((await dani.get('/api/productos')).status, 200);

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
      ['ceci@nexo.test', true],
      ['dani@nexo.test', true]
    ]
  );
});

test('cambiar el mail pide la contraseña y el código del mail nuevo, y avisa al anterior', async () => {
  assert.equal((await ana.post('/api/auth/email', { email: 'ana@otro.com' })).status, 400, 'sin contraseña');
  assert.equal((await ana.post('/api/auth/email', { email: 'ana@otro.com', password: 'mala-clave-1' })).status, 401);
  assert.equal((await ana.post('/api/auth/email', { email: 'ana@ejemplo.com', password: 'clave-segura-1' })).status, 400, 'el mismo');
  const pedido = await ana.post('/api/auth/email', { email: 'ana@otro.com', password: 'clave-segura-1' });
  assert.equal(pedido.status, 202, pedido.texto);
  assert.equal(pedido.json.pendiente, 'ana@otro.com');

  // Hasta el código, la cuenta sigue con el mail de antes y entra con él.
  assert.equal((await estado(ana)).email, 'ana@ejemplo.com');
  const codigo = codigoDelMail(servidor, 'ana@otro.com');
  assert.ok(codigo, 'el código llega al mail nuevo');
  const mal = await ana.post('/api/auth/email/confirmar', { codigo: codigo === '000000' ? '111111' : '000000' });
  assert.equal(mal.status, 400);
  assert.match(mal.json.error, /quedan 4 intentos/);

  const cambio = await ana.post('/api/auth/email/confirmar', { codigo });
  assert.equal(cambio.status, 200, cambio.texto);
  assert.equal(cambio.json.usuario.email, 'ana@otro.com');
  assert.equal(cambio.json.usuario.email_verificado, true);
  assert.equal((await ana.post('/api/auth/email/confirmar', { codigo })).status, 400, 'el código ya se usó');

  const aviso = servidor.leerMails('ana@ejemplo.com').at(-1);
  assert.match(aviso.asunto, /Cambió el mail/);
  assert.match(aviso.texto, /ana@otro\.com/);

  // Ya no entra con el mail viejo, sí con el nuevo.
  assert.equal((await crearCliente(servidor.url).post('/api/auth/login', { email: 'ana@ejemplo.com', password: 'clave-segura-1' })).status, 401);
  assert.equal((await crearCliente(servidor.url).post('/api/auth/login', { email: 'ana@otro.com', password: 'clave-segura-1' })).status, 200);
});

test('un empleado que entra por invitación ya tiene el mail confirmado, y los envíos tienen tope', async () => {
  const admin = ceci;
  // El enlace de la invitación llegó a ese mail (hist. §104): no hace falta
  // otro para confirmarlo.
  const empleado = await crearEmpleado(servidor, admin, { usuario: 'gise' });
  assert.equal((await estado(empleado)).email, 'gise@nexo.test');
  assert.equal((await estado(empleado)).email_verificado, true);
  assert.equal(ultimoEnlace(servidor, 'gise@nexo.test'), null, 'no le llega una verificación aparte');
  assert.equal((await empleado.post('/api/auth/email/reenviar')).status, 400, 'ya está verificado');

  // Cinco envíos por hora y por cuenta, entre altas de mail y reenvíos (el
  // alta de la empresa no cuenta: es otro tope).
  comoCuentaDeAntes('ceci@nexo.test');
  const respuestas = [];
  for (let i = 0; i < 6; i++) respuestas.push((await admin.post('/api/auth/email/reenviar')).status);
  assert.deepEqual(respuestas, [204, 204, 204, 204, 204, 429]);
});
