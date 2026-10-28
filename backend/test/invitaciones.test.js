// Invitaciones a un negocio y cuentas sin negocio (hist. §104,
// docs/investigacion-login-legal.md §5): el admin invita a un mail con un rol,
// y la persona crea su cuenta desde el enlace o, si ya tiene, acepta desde
// Nexo con su mail confirmado. Los mails no salen: el arnés corre con
// NEXO_MAIL=stub y los lee de la carpeta del servidor.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { ACEPTA, crearCliente, levantarServidor, registrarEmpresa, tokenDeInvitacion, ultimoEnlace } from './servidor-de-prueba.js';

let servidor;
let admin;
let negocioId;
// El registro tiene un tope de 5 por hora y por IP: los tests reusan cuentas.
let otraAdmin;

before(async () => {
  servidor = await levantarServidor();
  admin = await registrarEmpresa(servidor.url, { empresa: 'Kiosco Lucía', usuario: 'lucia', nombre: 'Lucía' });
  negocioId = (await admin.get('/api/negocio')).json.id;
  otraAdmin = await registrarEmpresa(servidor.url, { empresa: 'Taller Otro', usuario: 'otra', nombre: 'Otra' });
});

after(async () => {
  await servidor?.cerrar();
});

const estado = async (cliente) => (await cliente.get('/api/auth/estado')).json.usuario;
const verInvitacion = (token) => crearCliente(servidor.url).post('/api/auth/invitacion', { token });

function enLaBase(sql, ...valores) {
  const base = new DatabaseSync(path.join(servidor.dir, 'nexo.db'));
  try {
    return base.prepare(sql).run(...valores);
  } finally {
    base.close();
  }
}

test('invitar a un mail sin cuenta: crea la cuenta desde el enlace y entra al negocio con su rol', async () => {
  const r = await admin.post('/api/invitaciones', { email: 'Mati@Nexo.test', rol: 'empleado' });
  assert.equal(r.status, 201, r.texto);

  const [mail] = servidor.leerMails('mati@nexo.test');
  assert.match(mail.asunto, /Lucía te invitó a Kiosco Lucía/);
  assert.match(mail.texto, /creá tu cuenta/);
  const token = tokenDeInvitacion(servidor, 'mati@nexo.test');
  assert.ok(token);

  const info = await verInvitacion(token);
  assert.equal(info.status, 200, info.texto);
  assert.deepEqual(
    { ...info.json },
    { negocio: 'Kiosco Lucía', invito: 'Lucía', email: 'mati@nexo.test', rol: 'empleado', estado: 'pendiente', tiene_cuenta: false }
  );

  // El admin la ve pendiente.
  const pendientes = (await admin.get('/api/invitaciones')).json;
  assert.deepEqual(
    pendientes.map((i) => [i.email, i.rol, i.estado]),
    [['mati@nexo.test', 'empleado', 'pendiente']]
  );

  const mati = crearCliente(servidor.url);
  assert.equal((await mati.post('/api/auth/invitacion/cuenta', { ...ACEPTA, token, nombre: 'Mati', password: 'corta' })).status, 400);
  const cuenta = await mati.post('/api/auth/invitacion/cuenta', { ...ACEPTA, token, nombre: 'Mati', password: 'clave-segura-3' });
  assert.equal(cuenta.status, 201, cuenta.texto);
  assert.equal(cuenta.json.usuario.rol, 'empleado');
  assert.equal(cuenta.json.usuario.organizacion_id, negocioId);
  assert.equal(cuenta.json.usuario.email_verificado, true, 'el enlace llegó a ese mail');

  // Ya trabaja: vende, y no ve lo del admin.
  assert.equal((await mati.get('/api/productos')).status, 200);
  assert.equal((await mati.get('/api/invitaciones')).status, 403);

  // Y entra con el mail.
  const login = await crearCliente(servidor.url).post('/api/auth/login', { email: 'mati@nexo.test', password: 'clave-segura-3' });
  assert.equal(login.status, 200, login.texto);

  // El enlace ya no sirve, y la invitación sale de pendientes.
  assert.equal((await verInvitacion(token)).json.estado, 'aceptada');
  assert.equal((await mati.post('/api/auth/invitacion/cuenta', { ...ACEPTA, token, nombre: 'Mati', password: 'clave-segura-3' })).status, 410);
  assert.deepEqual((await admin.get('/api/invitaciones')).json, []);
  assert.ok((await admin.get('/api/usuarios')).json.some((u) => u.email === 'mati@nexo.test' && u.rol === 'empleado'));

  // Queda en la auditoría del negocio: quién invitó y quién aceptó.
  const auditoria = (await admin.get('/api/auditoria')).json.map((f) => f.detalle);
  assert.ok(auditoria.includes('Invitó a mati@nexo.test como empleado'));
  assert.ok(auditoria.includes('Mati (mati@nexo.test) aceptó la invitación y se sumó como empleado'));

  // Ya trabaja ahí: invitarla de nuevo es 409.
  assert.equal((await admin.post('/api/invitaciones', { email: 'mati@nexo.test' })).status, 409);
});

test('quien ya tiene cuenta la ve en Nexo con su mail confirmado, y al aceptar pasa a ese negocio', async () => {
  // La admin de otro negocio, todavía sin confirmar su mail. El enlace de
  // verificación se toma antes: después, su último mail es la invitación.
  const verificacion = ultimoEnlace(servidor, 'otra@nexo.test');
  const r = await admin.post('/api/invitaciones', { email: 'otra@nexo.test', rol: 'admin' });
  assert.equal(r.status, 201, r.texto);
  assert.match(servidor.leerMails('otra@nexo.test').at(-1).texto, /Entrá con tu cuenta/);
  const token = tokenDeInvitacion(servidor, 'otra@nexo.test');
  assert.equal((await verInvitacion(token)).json.tiene_cuenta, true);

  // Sin el mail confirmado no la ve, ni la acepta por id.
  assert.deepEqual((await otraAdmin.get('/api/auth/invitaciones')).json, []);
  const id = (await admin.get('/api/invitaciones')).json[0].id;
  assert.equal((await otraAdmin.post(`/api/auth/invitaciones/${id}/aceptar`)).status, 404);

  // Confirma el mail con su enlace, y aparece.
  assert.equal((await fetch(`${servidor.url}/verificar-mail?token=${verificacion}`, { redirect: 'manual' })).status, 302);
  const solicitudes = (await otraAdmin.get('/api/auth/invitaciones')).json;
  assert.deepEqual(
    solicitudes.map((s) => [s.negocio, s.invito, s.rol]),
    [['Kiosco Lucía', 'Lucía', 'admin']]
  );

  // Otro negocio no la ve ni la toca.
  assert.equal((await otraAdmin.post(`/api/invitaciones/${id}/cancelar`)).status, 404);

  const acepta = await otraAdmin.post(`/api/auth/invitaciones/${id}/aceptar`);
  assert.equal(acepta.status, 200, acepta.texto);
  assert.equal(acepta.json.organizacion_id, negocioId);
  const ahora = await estado(otraAdmin);
  assert.equal(ahora.organizacion_id, negocioId, 'la sesión pasa al negocio que la invitó');
  assert.equal(ahora.rol, 'admin');
  assert.equal((await otraAdmin.get('/api/negocios')).json.length, 2);
  assert.deepEqual((await otraAdmin.get('/api/auth/invitaciones')).json, []);
});

test('volver a invitar reenvía con un enlace nuevo; cancelar y vencer lo dejan sin efecto', async () => {
  const primera = await admin.post('/api/invitaciones', { email: 'nico@nexo.test', rol: 'empleado' });
  assert.equal(primera.status, 201, primera.texto);
  const tokenViejo = tokenDeInvitacion(servidor, 'nico@nexo.test');

  // Mismo mail: es la misma invitación, con el rol nuevo y otro enlace.
  const segunda = await admin.post('/api/invitaciones', { email: 'nico@nexo.test', rol: 'admin' });
  assert.equal(segunda.status, 200, segunda.texto);
  assert.equal(segunda.json.id, primera.json.id);
  const tokenNuevo = tokenDeInvitacion(servidor, 'nico@nexo.test');
  assert.notEqual(tokenNuevo, tokenViejo);
  assert.equal((await verInvitacion(tokenViejo)).status, 404, 'solo vale el último enlace');
  assert.equal((await verInvitacion(tokenNuevo)).json.rol, 'admin');

  // Vencida: a los 14 días de mandada.
  enLaBase("UPDATE invitaciones SET enviada = datetime('now', '-15 days') WHERE id = ?", primera.json.id);
  assert.equal((await verInvitacion(tokenNuevo)).json.estado, 'vencida');
  assert.equal((await admin.get('/api/invitaciones')).json.find((i) => i.id === primera.json.id).estado, 'vencida');
  const tarde = await crearCliente(servidor.url).post('/api/auth/invitacion/cuenta', { ...ACEPTA, token: tokenNuevo, nombre: 'Nico', password: 'clave-segura-4' });
  assert.equal(tarde.status, 410);

  // Reenviarla la renueva.
  assert.equal((await admin.post(`/api/invitaciones/${primera.json.id}/reenviar`)).status, 204);
  const renovado = tokenDeInvitacion(servidor, 'nico@nexo.test');
  assert.equal((await verInvitacion(renovado)).json.estado, 'pendiente');

  // Cancelada: el enlace la muestra así y ya no crea la cuenta.
  assert.equal((await admin.post(`/api/invitaciones/${primera.json.id}/cancelar`)).status, 204);
  assert.equal((await verInvitacion(renovado)).json.estado, 'cancelada');
  const cancelada = await crearCliente(servidor.url).post('/api/auth/invitacion/cuenta', { ...ACEPTA, token: renovado, nombre: 'Nico', password: 'clave-segura-4' });
  assert.equal(cancelada.status, 410);
  assert.equal((await admin.post(`/api/invitaciones/${primera.json.id}/cancelar`)).status, 404, 'ya no está pendiente');

  // Mal formadas.
  assert.equal((await admin.post('/api/invitaciones', { email: 'no es un mail' })).status, 400);
  assert.equal((await admin.post('/api/invitaciones', { email: 'x@nexo.test', rol: 'dueño' })).status, 400);
  assert.equal((await verInvitacion('inventado')).status, 404);
});

test('aceptar desde el enlace con la sesión abierta: tiene que ser su mail, y lo deja confirmado', async () => {
  // Una cuenta con negocio propio y el mail sin confirmar.
  const pablo = await registrarEmpresa(servidor.url, { empresa: 'Verdulería Pablo', usuario: 'pablo', nombre: 'Pablo' });
  assert.equal((await admin.post('/api/invitaciones', { email: 'pablo@nexo.test' })).status, 201);
  const token = tokenDeInvitacion(servidor, 'pablo@nexo.test');

  // Con otra cuenta, no.
  const ajena = await otraAdmin.post('/api/auth/invitacion/aceptar', { token });
  assert.equal(ajena.status, 403);
  assert.equal(ajena.json.codigo, 'otro_mail');

  // Crear una cuenta nueva con ese mail tampoco: ya tiene.
  assert.equal((await crearCliente(servidor.url).post('/api/auth/invitacion/cuenta', { ...ACEPTA, token, nombre: 'P', password: 'clave-segura-5' })).status, 409);

  const acepta = await pablo.post('/api/auth/invitacion/aceptar', { token });
  assert.equal(acepta.status, 200, acepta.texto);
  const ahora = await estado(pablo);
  assert.equal(ahora.email_verificado, true);
  assert.equal(ahora.organizacion_id, negocioId);
  assert.equal(ahora.rol, 'empleado');
});

test('rechazar: la solicitud se va y el negocio lo ve en la auditoría', async () => {
  const pablo = crearCliente(servidor.url);
  assert.equal((await pablo.post('/api/auth/login', { email: 'pablo@nexo.test', password: 'clave-segura-1' })).status, 200);
  // Lo invita también el negocio de Otra, desde ese negocio.
  const taller = (await otraAdmin.get('/api/negocios')).json.find((n) => n.nombre === 'Taller Otro');
  assert.equal((await otraAdmin.post(`/api/negocios/${taller.id}/entrar`)).status, 204);
  assert.equal((await otraAdmin.post('/api/invitaciones', { email: 'pablo@nexo.test' })).status, 201);
  const [solicitud] = (await pablo.get('/api/auth/invitaciones')).json;
  assert.equal(solicitud.negocio, 'Taller Otro');
  assert.equal((await pablo.post(`/api/auth/invitaciones/${solicitud.id}/rechazar`)).status, 204);
  assert.deepEqual((await pablo.get('/api/auth/invitaciones')).json, []);
  assert.deepEqual((await otraAdmin.get('/api/invitaciones')).json, []);
  assert.ok((await otraAdmin.get('/api/auditoria')).json.some((f) => f.detalle === 'pablo@nexo.test rechazó la invitación'));
});

test('una cuenta sin ningún negocio entra igual, solo alcanza su cuenta y puede crear el suyo', async () => {
  assert.equal((await admin.post('/api/invitaciones', { email: 'sol@nexo.test' })).status, 201);
  const sol = crearCliente(servidor.url);
  const cuenta = await sol.post('/api/auth/invitacion/cuenta', { ...ACEPTA,
    token: tokenDeInvitacion(servidor, 'sol@nexo.test'),
    nombre: 'Sol',
    password: 'clave-segura-6'
  });
  assert.equal(cuenta.status, 201, cuenta.texto);

  // La dan de baja en su único negocio: la sesión se corta.
  assert.equal((await admin.patch(`/api/usuarios/${cuenta.json.usuario.id}`, { activo: false })).status, 204);
  assert.equal((await sol.get('/api/productos')).status, 401);

  // Vuelve a entrar: sin negocio.
  const login = await sol.post('/api/auth/login', { email: 'sol@nexo.test', password: 'clave-segura-6' });
  assert.equal(login.status, 200, login.texto);
  assert.equal(login.json.usuario.organizacion_id, null);
  assert.equal(login.json.usuario.rol, null);
  const productos = await sol.get('/api/productos');
  assert.equal(productos.status, 403);
  assert.equal(productos.json.codigo, 'sin_negocio');
  assert.equal((await sol.get('/api/negocio')).status, 403);
  assert.equal((await sol.get('/api/auth/invitaciones')).status, 200);
  assert.deepEqual((await sol.get('/api/negocios')).json, []);

  // La vuelven a invitar: la acepta y vuelve, con el rol nuevo.
  assert.equal((await admin.post('/api/invitaciones', { email: 'sol@nexo.test', rol: 'admin' })).status, 201);
  const [solicitud] = (await sol.get('/api/auth/invitaciones')).json;
  assert.equal((await sol.post(`/api/auth/invitaciones/${solicitud.id}/aceptar`)).status, 200);
  assert.equal((await estado(sol)).rol, 'admin');
  assert.equal((await sol.get('/api/productos')).status, 200);

  // De nuevo sin negocio, crea el suyo: nace en Gratis y la sesión pasa a él.
  assert.equal((await admin.patch(`/api/usuarios/${cuenta.json.usuario.id}`, { activo: false })).status, 204);
  assert.equal((await sol.post('/api/auth/login', { email: 'sol@nexo.test', password: 'clave-segura-6' })).status, 200);
  const propio = await sol.post('/api/negocios', { nombre: 'Kiosco de Sol', rubro: 'kiosco' });
  assert.equal(propio.status, 201, propio.texto);
  const ahora = await estado(sol);
  assert.equal(ahora.organizacion_id, propio.json.id);
  assert.equal(ahora.rol, 'admin');
  const negocio = (await sol.get('/api/negocio')).json;
  assert.equal(negocio.nombre, 'Kiosco de Sol');
  assert.equal(negocio.plan.clave, 'gratis');
  // Y no ve nada del negocio que la dio de baja.
  assert.deepEqual((await sol.get('/api/productos')).json, []);
});

test('un empleado no invita ni crea negocios, y el alta con usuario y contraseña ya no existe', async () => {
  const mati = crearCliente(servidor.url);
  assert.equal((await mati.post('/api/auth/login', { email: 'mati@nexo.test', password: 'clave-segura-3' })).status, 200);
  assert.equal((await mati.post('/api/invitaciones', { email: 'z@nexo.test' })).status, 403);
  assert.equal((await mati.post('/api/negocios', { nombre: 'Lo mío', rubro: 'kiosco' })).status, 403);
  assert.equal((await admin.post('/api/usuarios', { usuario: 'viejo', nombre: 'Viejo', password: 'clave-temporal-1' })).status, 404);
});

test('en Gratis no se invita: el plan es de un solo usuario', async () => {
  const solo = await registrarEmpresa(servidor.url, { empresa: 'Medialunas', usuario: 'tomi', plan: 'gratis' });
  const r = await solo.post('/api/invitaciones', { email: 'ayuda@nexo.test' });
  assert.equal(r.status, 403, r.texto);
  assert.equal(r.json.codigo, 'limite_plan');
  assert.equal(servidor.leerMails('ayuda@nexo.test').length, 0, 'no sale ningún mail');
});
