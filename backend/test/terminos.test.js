// Términos, privacidad y edad (etapa 8b, Fase 3; docs/investigacion-login-legal.md,
// 2.3 a 2.5): el alta de una cuenta exige la casilla y la edad, de 13 a 17
// años solo en Gratis, una cuenta sin los términos vigentes no opera hasta
// aceptarlos, y las páginas públicas salen con los datos del titular.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { ACEPTA, confirmarMailDeAlta, crearCliente, levantarServidor, registrarEmpresa, tokenDeInvitacion } from './servidor-de-prueba.js';
import { TERMINOS_VERSION } from '../legal.js';

let servidor;
let ana;

before(async () => {
  servidor = await levantarServidor({
    // Detrás de un proxy simulado, para que cada alta venga de otra IP: el
    // registro tiene un tope de 5 por hora y por IP.
    env: {
      NEXO_TRUST_PROXY: '1',
      NEXO_TITULAR_NOMBRE: 'Titular <de> Prueba',
      NEXO_TITULAR_CUIL: '20-11111111-2',
      NEXO_TITULAR_DOMICILIO: ''
    }
  });
  ana = await registrarEmpresa(servidor, { empresa: 'Almacén Ana', usuario: 'ana' });
});

after(async () => {
  await servidor?.cerrar();
});

function enBase(fn) {
  const base = new DatabaseSync(path.join(servidor.dir, 'nexo.db'));
  try {
    return fn(base);
  } finally {
    base.close();
  }
}

let ipDePrueba = 0;
const alta = (cuerpo) =>
  crearCliente(servidor.url).pedir(
    'POST',
    '/api/auth/registro',
    { empresa: 'Negocio', nombre: 'Persona', password: 'clave-segura-1', ...cuerpo },
    { 'x-forwarded-for': `10.0.0.${++ipDePrueba}` }
  );
// La que tiene que crear la cuenta lleva antes el mail confirmado (hist. §108).
const altaConfirmada = async (cuerpo) =>
  alta({ ...cuerpo, comprobante_email: await confirmarMailDeAlta(servidor, cuerpo.email_cuenta) });

test('el alta sin la casilla o sin la edad no crea nada', async () => {
  const sinCasilla = await alta({ email_cuenta: 't1@nexo.test', edad: 'mayor' });
  assert.equal(sinCasilla.status, 400, sinCasilla.texto);
  assert.match(sinCasilla.json.error, /términos/);
  // La casilla tiene que ser un true de verdad, no un "sí".
  assert.equal((await alta({ email_cuenta: 't1@nexo.test', acepta_terminos: 'true', edad: 'mayor' })).status, 400);
  const sinEdad = await alta({ email_cuenta: 't2@nexo.test', acepta_terminos: true });
  assert.equal(sinEdad.status, 400, sinEdad.texto);
  assert.equal((await alta({ email_cuenta: 't2@nexo.test', acepta_terminos: true, edad: 'menor' })).status, 400);
  const cuentas = enBase((base) => base.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE email IN ('t1@nexo.test', 't2@nexo.test')").get().n);
  assert.equal(cuentas, 0);
});

test('el alta guarda la versión, la fecha y la edad, y lo deja en la auditoría', async () => {
  const r = await altaConfirmada({ ...ACEPTA, email_cuenta: 'lu@nexo.test' });
  assert.equal(r.status, 201, r.texto);
  assert.equal(r.json.usuario.terminos_al_dia, true);
  assert.equal(r.json.usuario.edad, 'mayor');
  const fila = enBase((base) =>
    base.prepare("SELECT terminos_version, terminos_aceptados, edad FROM usuarios WHERE email = 'lu@nexo.test'").get()
  );
  assert.equal(fila.terminos_version, TERMINOS_VERSION);
  assert.ok(fila.terminos_aceptados);
  assert.equal(fila.edad, 'mayor');
  const lu = crearCliente(servidor.url);
  await lu.post('/api/auth/login', { email: 'lu@nexo.test', password: 'clave-segura-1' });
  const auditoria = (await lu.get('/api/auditoria')).json;
  assert.ok(auditoria.some((f) => /Aceptó los términos .*versión .*18 años o más/.test(f.detalle ?? '')));
});

test('de 13 a 17 años se entra solo en Gratis', async () => {
  const pago = await alta({ ...ACEPTA, edad: 'menor_autorizado', email_cuenta: 'teo@nexo.test', plan: 'pro' });
  assert.equal(pago.status, 400, pago.texto);
  assert.match(pago.json.error, /Gratis/);
  const gratis = await altaConfirmada({ ...ACEPTA, edad: 'menor_autorizado', email_cuenta: 'teo@nexo.test', plan: 'gratis' });
  assert.equal(gratis.status, 201, gratis.texto);
  assert.equal(gratis.json.usuario.edad, 'menor_autorizado');
  const plan = enBase((base) => base.prepare('SELECT plan FROM organizaciones WHERE id = ?').get(gratis.json.usuario.organizacion_id).plan);
  assert.equal(plan, 'gratis');
});

test('la cuenta que nace de una invitación también acepta los términos', async () => {
  assert.equal((await ana.post('/api/invitaciones', { email: 'mia@nexo.test', rol: 'empleado' })).status, 201);
  const token = tokenDeInvitacion(servidor, 'mia@nexo.test');
  const mia = crearCliente(servidor.url);
  const sin = await mia.post('/api/auth/invitacion/cuenta', { token, nombre: 'Mía', password: 'clave-segura-2' });
  assert.equal(sin.status, 400, sin.texto);
  const con = await mia.post('/api/auth/invitacion/cuenta', { token, nombre: 'Mía', password: 'clave-segura-2', ...ACEPTA });
  assert.equal(con.status, 201, con.texto);
  assert.equal(con.json.usuario.terminos_al_dia, true);
  assert.equal((await mia.get('/api/productos')).status, 200);
});

test('una cuenta sin los términos vigentes no opera hasta aceptarlos', async () => {
  // Una cuenta de antes de esta fase: con mail, sin términos ni edad.
  const organizacionId = (await ana.get('/api/negocio')).json.id;
  const salt = randomBytes(16);
  const hash = scryptSync('clave-vieja-1', salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  enBase((base) => {
    const { lastInsertRowid: id } = base
      .prepare(
        `INSERT INTO usuarios (organizacion_id, usuario, nombre, password_hash, password_salt, debe_cambiar_password, email)
         VALUES (?, 'vieja@nexo.test', 'Vieja', ?, ?, 0, 'vieja@nexo.test')`
      )
      .run(organizacionId, hash.toString('hex'), salt.toString('hex'));
    base.prepare("INSERT INTO usuario_organizaciones (usuario_id, organizacion_id, rol) VALUES (?, ?, 'empleado')").run(id, organizacionId);
  });
  const vieja = crearCliente(servidor.url);
  const login = await vieja.post('/api/auth/login', { email: 'vieja@nexo.test', password: 'clave-vieja-1' });
  assert.equal(login.status, 200, login.texto);
  assert.equal(login.json.usuario.terminos_al_dia, false);
  assert.equal(login.json.usuario.edad, null);

  const frenada = await vieja.get('/api/productos');
  assert.equal(frenada.status, 403);
  assert.equal(frenada.json.codigo, 'faltan_terminos');
  // Salir y cambiar la contraseña sí puede.
  assert.equal((await vieja.post('/api/auth/cambiar-password', { actual: 'clave-vieja-1', nueva: 'clave-vieja-2' })).status, 204);

  // Sin edad declarada, la pide.
  assert.equal((await vieja.post('/api/auth/terminos', { acepta_terminos: true })).status, 400);
  const acepta = await vieja.post('/api/auth/terminos', ACEPTA);
  assert.equal(acepta.status, 200, acepta.texto);
  assert.equal(acepta.json.usuario.terminos_al_dia, true);
  assert.equal((await vieja.get('/api/productos')).status, 200);
});

test('cuando cambian los términos, se aceptan de nuevo sin volver a preguntar la edad', async () => {
  const id = (await ana.get('/api/auth/estado')).json.usuario.id;
  enBase((base) => base.prepare("UPDATE usuarios SET terminos_version = '2000-01-01' WHERE id = ?").run(id));
  assert.equal((await ana.get('/api/auth/estado')).json.usuario.terminos_al_dia, false);
  assert.equal((await ana.get('/api/productos')).json.codigo, 'faltan_terminos');
  // La edad ya la declaró: alcanza la casilla, y la edad no cambia.
  const r = await ana.post('/api/auth/terminos', { acepta_terminos: true, edad: 'menor_autorizado' });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.usuario.edad, 'mayor');
  assert.equal((await ana.get('/api/productos')).status, 200);
});

test('términos y privacidad salen con los datos del titular, escapados, y lo que falta se ve', async () => {
  const cliente = crearCliente(servidor.url);
  for (const pagina of ['/terminos', '/privacidad']) {
    const r = await cliente.get(pagina);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /html/);
    assert.ok(r.texto.includes('Titular &lt;de&gt; Prueba'), pagina);
    assert.ok(r.texto.includes('20-11111111-2'), pagina);
    assert.ok(r.texto.includes('dato a completar'), `${pagina}: el domicilio vacío`);
    assert.ok(!/%[A-Z_]+%/.test(r.texto), `${pagina} quedó con un %…% sin completar`);
  }
  const sitemap = await cliente.get('/sitemap.xml');
  assert.match(sitemap.texto, /\/terminos<\/loc>/);
});
