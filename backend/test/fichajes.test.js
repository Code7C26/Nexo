// Horarios y fichaje (hist. §196): cada persona ficha su entrada y su salida,
// el admin carga el horario por día de la semana, corrige un fichaje olvidado
// y ve el informe con horas, llegadas tarde, faltas y turnos de caja.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

let servidor;
let admin;
let empleado;
let empleadoId;
let otroId;
// El día de la semana de hoy en la Argentina, 0 = lunes, como el servidor.
const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });
const diaHoy = (new Date(`${hoy}T12:00:00Z`).getUTCDay() + 6) % 7;

before(async () => {
  servidor = await levantarServidor();
  admin = await registrarEmpresa(servidor, { empresa: 'Almacén Horarios', usuario: 'almacenhorarios' });
  empleado = await crearEmpleado(servidor, admin, { usuario: 'cajerahorarios', nombre: 'Cajera' });
  await crearEmpleado(servidor, admin, { usuario: 'repositor', nombre: 'Repositor' });
  const usuarios = (await admin.get('/api/usuarios')).json;
  empleadoId = usuarios.find((u) => u.nombre === 'Cajera').id;
  otroId = usuarios.find((u) => u.nombre === 'Repositor').id;
});

after(async () => {
  await servidor?.cerrar();
});

test('el admin carga el horario de cada uno y se valida', async () => {
  const malos = [
    [{ dia_semana: 7, desde: '09:00', hasta: '13:00' }],
    [{ dia_semana: 0, desde: '9:00', hasta: '13:00' }],
    [{ dia_semana: 0, desde: '13:00', hasta: '09:00' }],
    [
      { dia_semana: 0, desde: '09:00', hasta: '13:00' },
      { dia_semana: 0, desde: '12:00', hasta: '18:00' }
    ]
  ];
  for (const franjas of malos) {
    assert.equal((await admin.put(`/api/horarios/${empleadoId}`, { franjas })).status, 400, JSON.stringify(franjas));
  }
  // Horario cortado hoy, y el repositor también trabaja hoy.
  const r = await admin.put(`/api/horarios/${empleadoId}`, {
    franjas: [
      { dia_semana: diaHoy, desde: '00:01', hasta: '04:00' },
      { dia_semana: diaHoy, desde: '05:00', hasta: '23:59' }
    ]
  });
  assert.equal(r.status, 200, r.texto);
  await admin.put(`/api/horarios/${otroId}`, { franjas: [{ dia_semana: diaHoy, desde: '00:01', hasta: '23:59' }] });
  const horarios = (await admin.get('/api/horarios')).json;
  assert.equal(horarios.find((p) => p.id === empleadoId).franjas.length, 2);
  assert.equal((await empleado.put(`/api/horarios/${empleadoId}`, { franjas: [] })).status, 403);
  assert.equal((await empleado.get('/api/fichajes/informe')).status, 403);
});

test('cada uno ficha su entrada y su salida', async () => {
  assert.equal((await empleado.post('/api/fichajes/salida')).status, 409, 'sin entrada no hay salida');
  const entrada = await empleado.post('/api/fichajes');
  assert.equal(entrada.status, 201, entrada.texto);
  assert.equal((await empleado.post('/api/fichajes')).status, 409, 'dos entradas seguidas no');
  const mio = (await empleado.get('/api/fichajes/mio')).json;
  assert.equal(mio.abierto.id, entrada.json.id);
  assert.equal(mio.horario_hoy.length, 2);
  const salida = await empleado.post('/api/fichajes/salida');
  assert.equal(salida.status, 200, salida.texto);
  assert.ok(salida.json.hora_salida);
  assert.equal((await empleado.get('/api/fichajes/mio')).json.abierto, null);
});

test('el admin corrige el fichaje y el informe cuenta horas, llegadas tarde y faltas', async () => {
  const id = (await empleado.get('/api/fichajes/mio')).json.hoy[0].id;
  assert.equal((await admin.patch(`/api/fichajes/${id}`, { entrada: '9:00' })).status, 400);
  assert.equal((await admin.patch(`/api/fichajes/${id}`, { entrada: '10:00', salida: '09:00' })).status, 400);
  assert.equal((await empleado.patch(`/api/fichajes/${id}`, { entrada: '00:30' })).status, 403);
  // Entró 00:30 (29 minutos tarde) y salió 08:30: 8 horas.
  const r = await admin.patch(`/api/fichajes/${id}`, { entrada: '00:30', salida: '08:30' });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.hora_entrada, '00:30');

  const informe = await admin.get('/api/fichajes/informe');
  assert.equal(informe.status, 200, informe.texto);
  const cajera = informe.json.personas.find((p) => p.id === empleadoId);
  assert.equal(cajera.minutos_trabajados, 480);
  assert.equal(cajera.llegadas_tarde, 1);
  assert.equal(cajera.minutos_tarde, 29);
  assert.equal(cajera.faltas, 0);
  assert.equal(cajera.dias[0].fichajes[0].corregido, true);
  const repositor = informe.json.personas.find((p) => p.id === otroId);
  assert.equal(repositor.faltas, 1, 'tenía horario hoy y no fichó');
  // Un período al revés o muy largo, no.
  assert.equal((await admin.get('/api/fichajes/informe?desde=2026-02-01&hasta=2026-01-01')).status, 400);
  assert.equal((await admin.get('/api/fichajes/informe?desde=2026-01-01&hasta=2026-06-01')).status, 400);
});
