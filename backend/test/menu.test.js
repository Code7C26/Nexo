// El menú de cada persona (hist. §224): qué sube arriba de todo y qué esconde.
// Es de la persona en su negocio, de los dos roles, y solo acepta secciones
// que existen. Va aparte porque cada archivo levanta su servidor.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';
import { ARRIBA_DE_SIEMPRE, normalizarMenu } from '../../frontend/js/core/menu.js';

let servidor;
let dueno;
let empleado;
let otro;

before(async () => {
  servidor = await levantarServidor();
  dueno = await registrarEmpresa(servidor, { empresa: 'Comercio Menú', usuario: 'duenomenu' });
  empleado = await crearEmpleado(servidor, dueno, { usuario: 'cajeromenu' });
  otro = await registrarEmpresa(servidor, { empresa: 'Otro Menú', usuario: 'otromenu' });
});

after(async () => {
  await servidor?.cerrar();
});

test('sin armar es el de siempre, y cada persona guarda el suyo', async () => {
  const deSiempre = { arriba: ARRIBA_DE_SIEMPRE, ocultas: [], personalizado: false };
  assert.deepEqual((await dueno.get('/api/menu')).json, deSiempre);

  // Sube la caja, esconde la papelera y deja el Resumen al final.
  const arriba = ['caja', 'productos', 'clientes', 'asistente', 'puntos', 'dashboard'];
  const guardado = await dueno.put('/api/menu', { arriba, ocultas: ['papelera'] });
  assert.equal(guardado.status, 200, guardado.texto);
  assert.deepEqual(guardado.json, { arriba, ocultas: ['papelera'], personalizado: true });
  assert.deepEqual((await dueno.get('/api/menu')).json, guardado.json);

  // El empleado del mismo negocio y el de otro negocio siguen con el suyo.
  assert.deepEqual((await empleado.get('/api/menu')).json, deSiempre);
  assert.deepEqual((await otro.get('/api/menu')).json, deSiempre);

  // El empleado también arma el suyo.
  const delEmpleado = await empleado.put('/api/menu', { arriba: ['pos', ...ARRIBA_DE_SIEMPRE], ocultas: [] });
  assert.equal(delEmpleado.status, 200, delEmpleado.texto);
  assert.equal(delEmpleado.json.arriba[0], 'pos');

  // Volver al de siempre.
  assert.deepEqual((await dueno.del('/api/menu')).json, deSiempre);
});

test('las de arriba de siempre no se pueden bajar, solo esconder', async () => {
  // Sin "productos" en arriba, vuelve al final: no tiene otro lugar.
  const r = await dueno.put('/api/menu', { arriba: ['dashboard', 'asistente', 'clientes', 'puntos'], ocultas: ['productos'] });
  assert.equal(r.status, 200, r.texto);
  assert.deepEqual(r.json.arriba, ['dashboard', 'asistente', 'clientes', 'puntos', 'productos']);
  assert.deepEqual(r.json.ocultas, ['productos']);
  await dueno.del('/api/menu');
});

test('solo acepta secciones que existen, sin repetir', async () => {
  for (const malo of [
    {},
    { arriba: 'dashboard', ocultas: [] },
    { arriba: ['dashboard', 'inventada'], ocultas: [] },
    { arriba: ['dashboard', 'dashboard'], ocultas: [] },
    { arriba: ARRIBA_DE_SIEMPRE, ocultas: ['configuracion'] },
    { arriba: ARRIBA_DE_SIEMPRE, ocultas: [1] }
  ]) {
    const r = await dueno.put('/api/menu', malo);
    assert.equal(r.status, 400, JSON.stringify(malo));
  }
  assert.equal((await dueno.get('/api/menu')).json.personalizado, false);
});

test('normalizarMenu limpia lo guardado que ya no existe', () => {
  assert.deepEqual(normalizarMenu({ arriba: ['caja', 'vieja'], ocultas: ['vieja', 'gastos', 'gastos'] }), {
    arriba: ['caja', ...ARRIBA_DE_SIEMPRE],
    ocultas: ['gastos']
  });
  assert.deepEqual(normalizarMenu(null), { arriba: ARRIBA_DE_SIEMPRE, ocultas: [] });
});
