// El código de 6 números que confirma el mail antes de usarlo (hist. §108):
// nadie crea una cuenta con un mail que no es suyo. El cambio de mail de una
// cuenta, que usa el mismo código, se prueba en cuenta-mail.test.js.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { ACEPTA, codigoDelMail, crearCliente, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

let servidor;

before(async () => {
  // Detrás de un proxy simulado, para que cada pedido venga de otra IP: el
  // código y el alta tienen topes por IP.
  servidor = await levantarServidor({ env: { NEXO_TRUST_PROXY: '1' } });
});

after(async () => {
  await servidor?.cerrar();
});

let ip = 0;
const desdeOtraIp = () => ({ 'x-forwarded-for': `10.1.0.${++ip}` });
const pedirCodigo = (email) => crearCliente(servidor.url).pedir('POST', '/api/auth/registro/codigo', { email }, desdeOtraIp());
const verificar = (email, codigo) =>
  crearCliente(servidor.url).pedir('POST', '/api/auth/registro/verificar', { email, codigo }, desdeOtraIp());
const alta = (email, comprobante) =>
  crearCliente(servidor.url).pedir(
    'POST',
    '/api/auth/registro',
    { ...ACEPTA, empresa: 'Negocio', nombre: 'Persona', password: 'clave-segura-1', email_cuenta: email, comprobante_email: comprobante },
    desdeOtraIp()
  );

function enBase(sql, ...parametros) {
  const base = new DatabaseSync(path.join(servidor.dir, 'nexo.db'));
  try {
    base.prepare(sql).run(...parametros);
  } finally {
    base.close();
  }
}

// Un código que seguro no es el que llegó.
const otroCodigo = (codigo) => (codigo === '000000' ? '111111' : '000000');

test('el código llega al mail, y acertarlo da el comprobante que crea la cuenta ya confirmada', async () => {
  const invalido = await pedirCodigo('sin-arroba');
  assert.equal(invalido.status, 400, invalido.texto);

  assert.equal((await pedirCodigo('Rosa@Nexo.test')).status, 204);
  const [mail] = servidor.leerMails('rosa@nexo.test');
  const codigo = codigoDelMail(servidor, 'rosa@nexo.test');
  assert.match(codigo, /^\d{6}$/);
  assert.match(mail.texto, new RegExp(`\\b${codigo}\\b`), 'el código va también en el cuerpo');
  assert.match(mail.texto, /15 minutos/);

  // Sin comprobante, o con uno inventado, no hay cuenta.
  assert.equal((await alta('rosa@nexo.test')).json.codigo, 'mail_sin_confirmar');
  assert.equal((await alta('rosa@nexo.test', 'inventado')).json.codigo, 'mail_sin_confirmar');

  // Pegado del mail con un espacio en el medio también sirve.
  const r = await verificar('ROSA@nexo.test', `${codigo.slice(0, 3)} ${codigo.slice(3)}`);
  assert.equal(r.status, 200, r.texto);
  assert.ok(r.json.comprobante);

  // El comprobante es de ese mail: no sirve para crear otra cuenta.
  assert.equal((await alta('otra@nexo.test', r.json.comprobante)).json.codigo, 'mail_sin_confirmar');

  const creada = await alta('rosa@nexo.test', r.json.comprobante);
  assert.equal(creada.status, 201, creada.texto);
  assert.equal(creada.json.usuario.email, 'rosa@nexo.test');
  assert.equal(creada.json.usuario.email_verificado, true);
  // Y se gasta: no crea una segunda.
  assert.equal((await alta('rosa@nexo.test', r.json.comprobante)).json.codigo, 'mail_sin_confirmar');
});

test('cinco errores y el código no sirve más, aunque después se acierte', async () => {
  await pedirCodigo('tano@nexo.test');
  const codigo = codigoDelMail(servidor, 'tano@nexo.test');
  const errores = [];
  for (let i = 0; i < 5; i++) errores.push((await verificar('tano@nexo.test', otroCodigo(codigo))).json.error);
  assert.match(errores[0], /quedan 4 intentos/);
  assert.match(errores[3], /queda 1 intento/);
  assert.match(errores[4], /Pedí uno nuevo/);
  const tarde = await verificar('tano@nexo.test', codigo);
  assert.equal(tarde.status, 400);
  assert.match(tarde.json.error, /demasiadas veces/);

  // Uno nuevo vuelve a andar, y reemplaza al anterior.
  await pedirCodigo('tano@nexo.test');
  const nuevo = codigoDelMail(servidor, 'tano@nexo.test');
  if (nuevo !== codigo) assert.equal((await verificar('tano@nexo.test', codigo)).status, 400, 'el viejo ya no vale');
  assert.equal((await verificar('tano@nexo.test', nuevo)).status, 200);
});

test('un código vencido no sirve', async () => {
  await pedirCodigo('vera@nexo.test');
  const codigo = codigoDelMail(servidor, 'vera@nexo.test');
  enBase("UPDATE codigos_mail SET vence = datetime('now', '-1 minute') WHERE email = ?", 'vera@nexo.test');
  const r = await verificar('vera@nexo.test', codigo);
  assert.equal(r.status, 400);
  assert.match(r.json.error, /venció/);
});

test('con un mail que ya tiene cuenta responde igual, y a su dueño le llega un aviso en vez del código', async () => {
  await registrarEmpresa(servidor, { empresa: 'Almacén Uma', usuario: 'uma' });
  const antes = servidor.leerMails('uma@nexo.test').length;

  const r = await pedirCodigo('uma@nexo.test');
  assert.equal(r.status, 204, 'lo mismo que con un mail libre: el alta no dice quién usa Nexo');
  const mails = servidor.leerMails('uma@nexo.test');
  assert.equal(mails.length, antes + 1);
  assert.equal(mails.at(-1).asunto, 'Ya tenés una cuenta en Nexo');
  assert.equal(codigoDelMail(servidor, 'uma@nexo.test'), null);
  assert.equal((await verificar('uma@nexo.test', '123456')).status, 400);
});

test('pedir otro código para un mail ya confirmado no le corta el alta a quien lo confirmó', async () => {
  await pedirCodigo('ines@nexo.test');
  const { comprobante } = (await verificar('ines@nexo.test', codigoDelMail(servidor, 'ines@nexo.test'))).json;
  await pedirCodigo('ines@nexo.test');
  assert.equal((await alta('ines@nexo.test', comprobante)).status, 201);
});

test('el comprobante vence, y los códigos de un mail tienen tope', async () => {
  await pedirCodigo('leo@nexo.test');
  const { comprobante } = (await verificar('leo@nexo.test', codigoDelMail(servidor, 'leo@nexo.test'))).json;
  enBase("UPDATE codigos_mail SET vence = datetime('now', '-1 minute') WHERE email = ?", 'leo@nexo.test');
  assert.equal((await alta('leo@nexo.test', comprobante)).json.codigo, 'mail_sin_confirmar');

  // Cinco por hora y por mail, aunque vengan de IPs distintas (ya pidió uno).
  const respuestas = [];
  for (let i = 0; i < 5; i++) respuestas.push((await pedirCodigo('leo@nexo.test')).status);
  assert.deepEqual(respuestas, [204, 204, 204, 204, 429]);
});

test('sin el mail configurado, fuera de producción, el código sale en la consola', async () => {
  const sinMail = await levantarServidor({ env: { NEXO_MAIL: '', NEXO_SMTP_USUARIO: '', NEXO_SMTP_CLAVE: '' } });
  try {
    const r = await crearCliente(sinMail.url).post('/api/auth/registro/codigo', { email: 'pablo@nexo.test' });
    assert.equal(r.status, 204, r.texto);
    const codigo = sinMail.salida().match(/pablo@nexo\.test: código (\d{6})/)?.[1];
    assert.ok(codigo, sinMail.salida());
    assert.equal((await crearCliente(sinMail.url).post('/api/auth/registro/verificar', { email: 'pablo@nexo.test', codigo })).status, 200);
  } finally {
    await sinMail.cerrar();
  }
});
