// Cambiar el nombre de la cuenta (hist. §225): cada persona el suyo, con el
// mismo tope que al crearla, y queda en la auditoría. Va aparte porque cada
// archivo levanta su servidor.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

let servidor;
let dueno;
let empleado;

before(async () => {
  servidor = await levantarServidor();
  dueno = await registrarEmpresa(servidor, { empresa: 'Comercio Nombre', usuario: 'duenonombre', nombre: 'Ana' });
  empleado = await crearEmpleado(servidor, dueno, { usuario: 'cajeronombre' });
});

after(async () => {
  await servidor?.cerrar();
});

test('cada persona cambia su nombre, y queda en la auditoría', async () => {
  const r = await dueno.put('/api/auth/nombre', { nombre: '  Ana   María Gómez ' });
  assert.equal(r.status, 200, r.texto);
  assert.deepEqual(r.json, { nombre: 'Ana María Gómez' });
  assert.equal((await dueno.get('/api/auth/estado')).json.usuario.nombre, 'Ana María Gómez');

  // El del empleado no cambia.
  const delEmpleado = (await empleado.get('/api/auth/estado')).json.usuario.nombre;
  assert.notEqual(delEmpleado, 'Ana María Gómez');

  const auditoria = (await dueno.get('/api/auditoria')).json;
  const filas = auditoria.filas ?? auditoria.items ?? auditoria;
  const cambio = filas.find((f) => f.detalle === 'Cambió su nombre');
  assert.ok(cambio, 'el cambio de nombre no quedó en la auditoría');

  // El empleado también cambia el suyo.
  const propio = await empleado.put('/api/auth/nombre', { nombre: 'Lucas' });
  assert.equal(propio.status, 200, propio.texto);
});

test('el nombre no puede quedar vacío ni pasar de 120 letras', async () => {
  for (const malo of [{}, { nombre: '' }, { nombre: '   ' }, { nombre: 5 }, { nombre: 'a'.repeat(121) }]) {
    const r = await dueno.put('/api/auth/nombre', malo);
    assert.equal(r.status, 400, JSON.stringify(malo));
  }
  assert.equal((await dueno.get('/api/auth/estado')).json.usuario.nombre, 'Ana María Gómez');
});
