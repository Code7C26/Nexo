// Recuperar la contraseña por mail (hist. §105, docs/investigacion-login-legal.md
// Fase 2): un enlace de un solo uso que vence a los 30 minutos, pedirlo
// responde lo mismo exista o no la cuenta, y usarlo cierra todas las sesiones,
// confirma el mail y avisa. Los mails no salen: el arnés corre con
// NEXO_MAIL=stub y los lee de la carpeta del servidor.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { crearCliente, crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

let servidor;
let ana;

before(async () => {
  servidor = await levantarServidor();
  ana = await registrarEmpresa(servidor, { empresa: 'Almacén Ana', usuario: 'ana' });
});

after(async () => {
  await servidor?.cerrar();
});

// El token del último enlace de recuperación que le llegó a ese mail.
function tokenDeRecuperacion(para) {
  const texto = servidor.leerMails(para).at(-1)?.texto ?? '';
  return texto.match(/#\/restablecer\/([A-Za-z0-9_-]+)/)?.[1] ?? null;
}

function enBase(fn) {
  const base = new DatabaseSync(path.join(servidor.dir, 'nexo.db'));
  try {
    return fn(base);
  } finally {
    base.close();
  }
}

const pedir = (email) => crearCliente(servidor.url).post('/api/auth/recuperar', { email });

test('pedir el enlace responde lo mismo exista o no la cuenta, y solo le llega a la que existe', async () => {
  const noExiste = await pedir('nadie@nexo.test');
  assert.equal(noExiste.status, 204, noExiste.texto);
  assert.equal(servidor.leerMails('nadie@nexo.test').length, 0);

  const existe = await pedir('ANA@nexo.test');
  assert.equal(existe.status, 204, existe.texto);
  assert.equal(existe.texto, noExiste.texto, 'la respuesta no dice si la cuenta existe');
  const mail = servidor.leerMails('ana@nexo.test').at(-1);
  assert.match(mail.asunto, /Recuperá tu cuenta/);
  assert.ok(tokenDeRecuperacion('ana@nexo.test'), 'el mail trae el enlace');

  assert.equal((await pedir('no es un mail')).status, 400);
});

test('el enlace cambia la contraseña una sola vez, cierra las sesiones, confirma el mail y avisa', async () => {
  // Una cuenta de antes de hist. §108, que nacía con el mail sin confirmar.
  enBase((base) => base.prepare("UPDATE usuarios SET email_verificado = NULL WHERE email = 'ana@nexo.test'").run());
  assert.equal((await ana.get('/api/auth/estado')).json.usuario.email_verificado, false);
  await pedir('ana@nexo.test');
  const token = tokenDeRecuperacion('ana@nexo.test');

  const enlace = await crearCliente(servidor.url).post('/api/auth/restablecer/enlace', { token });
  assert.equal(enlace.status, 200, enlace.texto);
  assert.equal(enlace.json.email, 'ana@nexo.test');
  assert.equal((await crearCliente(servidor.url).post('/api/auth/restablecer/enlace', { token: 'cualquier-cosa' })).status, 410);

  const corta = await crearCliente(servidor.url).post('/api/auth/restablecer', { token, password: 'corta' });
  assert.equal(corta.status, 400, 'una contraseña corta no gasta el enlace');

  const ok = await crearCliente(servidor.url).post('/api/auth/restablecer', { token, password: 'clave-nueva-123' });
  assert.equal(ok.status, 200, ok.texto);
  assert.equal(ok.json.email, 'ana@nexo.test');

  // La sesión que tenía abierta se cerró.
  assert.equal((await ana.get('/api/productos')).status, 401);
  const vieja = await crearCliente(servidor.url).post('/api/auth/login', { email: 'ana@nexo.test', password: 'clave-segura-1' });
  assert.equal(vieja.status, 401);
  ana = crearCliente(servidor.url);
  const nueva = await ana.post('/api/auth/login', { email: 'ana@nexo.test', password: 'clave-nueva-123' });
  assert.equal(nueva.status, 200, nueva.texto);
  assert.equal(nueva.json.usuario.email_verificado, true, 'el enlace llegó a su mail: queda confirmado');

  // Usado, no sirve más.
  assert.equal((await crearCliente(servidor.url).post('/api/auth/restablecer', { token, password: 'otra-clave-123' })).status, 410);
  assert.match(servidor.leerMails('ana@nexo.test').at(-1).asunto, /Cambió la contraseña/);

  // Queda en la auditoría de su negocio, sin la contraseña.
  const auditoria = (await ana.get('/api/auditoria')).json;
  const detalles = auditoria.map((a) => a.detalle);
  assert.ok(detalles.includes('Pidió recuperar su contraseña por mail'));
  assert.ok(detalles.includes('Eligió una contraseña nueva con el enlace del mail'));
  assert.ok(!JSON.stringify(auditoria).includes('clave-nueva-123'));
});

// Con otra cuenta: Ana ya pidió dos, y el tope es de tres por hora.
test('un enlace vencido no sirve, y pedir otro deja sin efecto el anterior', async () => {
  await registrarEmpresa(servidor, { empresa: 'Kiosco Beto', usuario: 'beto' });
  await pedir('beto@nexo.test');
  const primero = tokenDeRecuperacion('beto@nexo.test');
  await pedir('beto@nexo.test');
  const segundo = tokenDeRecuperacion('beto@nexo.test');
  assert.notEqual(primero, segundo);
  assert.equal((await crearCliente(servidor.url).post('/api/auth/restablecer/enlace', { token: primero })).status, 410);

  enBase((base) =>
    base.prepare("UPDATE tokens_cuenta SET vence = datetime('now', '-1 minute') WHERE tipo = 'recuperar' AND usado IS NULL").run()
  );
  const vencido = await crearCliente(servidor.url).post('/api/auth/restablecer', { token: segundo, password: 'otra-clave-123' });
  assert.equal(vencido.status, 410);
  const login = await crearCliente(servidor.url).post('/api/auth/login', { email: 'beto@nexo.test', password: 'clave-segura-1' });
  assert.equal(login.status, 200, 'la contraseña sigue siendo la de antes');
});

test('un mail no recibe más de tres enlaces por hora', async () => {
  for (let i = 0; i < 3; i++) assert.equal((await pedir('tope@nexo.test')).status, 204);
  const cuarto = await pedir('tope@nexo.test');
  assert.equal(cuarto.status, 429, cuarto.texto);
});

test('el admin ya no resetea la contraseña de quien confirmó su mail, y sí la de una cuenta sin mail', async () => {
  const empleado = await crearEmpleado(servidor, ana, { usuario: 'bruno' });
  const brunoId = (await empleado.get('/api/auth/estado')).json.usuario.id;
  const reset = await ana.post(`/api/usuarios/${brunoId}/resetear-password`, { password: 'temporal-123' });
  assert.equal(reset.status, 409, reset.texto);

  // Una cuenta de antes de §102: sin mail, no tiene por dónde recuperarla.
  const organizacionId = (await ana.get('/api/negocio')).json.id;
  const salt = randomBytes(16);
  const hash = scryptSync('clave-vieja-1', salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const viejaId = enBase((base) => {
    const { lastInsertRowid: id } = base
      .prepare(
        `INSERT INTO usuarios (organizacion_id, usuario, nombre, password_hash, password_salt, debe_cambiar_password)
         VALUES (?, 'dani', 'Dani', ?, ?, 0)`
      )
      .run(organizacionId, hash.toString('hex'), salt.toString('hex'));
    base.prepare("INSERT INTO usuario_organizaciones (usuario_id, organizacion_id, rol) VALUES (?, ?, 'empleado')").run(id, organizacionId);
    return Number(id);
  });
  assert.equal((await ana.post(`/api/usuarios/${viejaId}/resetear-password`, { password: 'temporal-123' })).status, 204);
});

test('cambiar la contraseña desde adentro también avisa por mail', async () => {
  const antes = servidor.leerMails('ana@nexo.test').length;
  const cambio = await ana.post('/api/auth/cambiar-password', { actual: 'clave-nueva-123', nueva: 'clave-final-123' });
  assert.equal(cambio.status, 204, cambio.texto);
  const mails = servidor.leerMails('ana@nexo.test');
  assert.equal(mails.length, antes + 1);
  assert.match(mails.at(-1).asunto, /Cambió la contraseña/);
});
