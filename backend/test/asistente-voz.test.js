// La voz del asistente (hist. §117): el servidor pasa el audio a texto y la
// app lo manda a interpretar como si se hubiera tipeado. Con NEXO_INTERPRETE=
// stub, el "audio" es la frase misma en bytes, así se prueba sin red.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearCliente, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

let servidor;
let tienda;

before(async () => {
  servidor = await levantarServidor();
  tienda = await registrarEmpresa(servidor, { empresa: 'Tienda Voz', usuario: 'voz' });
});

after(async () => {
  await servidor?.cerrar();
});

const dictar = (cliente, cuerpo, tipo = 'audio/webm;codecs=opus') =>
  cliente.pedir('POST', '/api/asistente/transcribir', cuerpo, { 'content-type': tipo });

test('con la voz configurada, la app lo sabe y el audio vuelve como texto', async () => {
  const capacidades = await tienda.get('/api/asistente/capacidades');
  assert.equal(capacidades.status, 200);
  assert.equal(capacidades.json.voz, true);

  const r = await dictar(tienda, 'Pagué 25 mil de luz en efectivo');
  assert.equal(r.status, 200);
  assert.equal(r.json.texto, 'Pagué 25 mil de luz en efectivo');
});

test('sin audio, o con algo que no es audio, responde 400', async () => {
  assert.equal((await dictar(tienda, '')).status, 400);
  assert.equal((await dictar(tienda, { texto: 'hola' }, 'application/json')).status, 400);
});

test('un audio de más de 4 MB se rechaza', async () => {
  const r = await dictar(tienda, 'a'.repeat(5 * 1024 * 1024));
  assert.equal(r.status, 413);
});

test('sin sesión no se puede dictar', async () => {
  const anonimo = crearCliente(servidor.url);
  assert.equal((await dictar(anonimo, 'Vendí algo')).status, 401);
});

test('cada persona tiene un tope de dictados por hora', async () => {
  const otra = await registrarEmpresa(servidor, { empresa: 'Tienda Tope', usuario: 'tope' });
  for (let i = 0; i < 40; i++) assert.equal((await dictar(otra, `frase ${i}`)).status, 200);
  const r = await dictar(otra, 'una más');
  assert.equal(r.status, 429);
  // El tope es de esa persona: otra cuenta sigue dictando.
  assert.equal((await dictar(tienda, 'sigo yo')).status, 200);
});
