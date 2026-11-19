// La grilla de clases (hist. §200): las actividades del gimnasio, sus horarios
// en la semana y los profes de cada uno. La arma el admin y la ve la
// recepción; un profe no puede estar en dos clases a la vez, y un negocio no
// ve ni toca la grilla de otro.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

let servidor;
let admin;
let recepcion;
let otro;
let bjj;
let musculacion;
let juan;
let ana;

before(async () => {
  servidor = await levantarServidor();
  admin = await registrarEmpresa(servidor, { empresa: 'Dojo Grilla', usuario: 'dojogrilla' });
  recepcion = await crearEmpleado(servidor, admin, { usuario: 'recepciongrilla', nombre: 'Recepción' });
  otro = await registrarEmpresa(servidor, { empresa: 'Otro Gimnasio Grilla', usuario: 'otrogrilla' });
  juan = (await admin.post('/api/empleados', { nombre: 'Juan' })).json.id;
  ana = (await admin.post('/api/empleados', { nombre: 'Ana' })).json.id;
});

after(async () => {
  await servidor?.cerrar();
});

test('el admin carga las actividades y se validan', async () => {
  for (const malo of [{ nombre: '' }, { nombre: 'Yoga', horario: 'a veces' }, { nombre: 'Yoga', color: 'fucsia' }]) {
    assert.equal((await admin.post('/api/actividades', malo)).status, 400, JSON.stringify(malo));
  }
  const r = await admin.post('/api/actividades', { nombre: 'BJJ', color: 'violeta' });
  assert.equal(r.status, 201, r.texto);
  assert.equal(r.json.horario, 'fijo');
  bjj = r.json.id;
  musculacion = (await admin.post('/api/actividades', { nombre: 'Musculación', horario: 'libre', color: 'gris' })).json.id;
  assert.equal((await admin.post('/api/actividades', { nombre: 'bjj' })).status, 400, 'dos con el mismo nombre no');
  assert.equal((await recepcion.post('/api/actividades', { nombre: 'Yoga' })).status, 403);
});

test('martes y jueves a las 19 se cargan de una vez, con sus profes', async () => {
  const malos = [
    { actividad_id: bjj, dias: [], desde: '19:00', hasta: '20:30' },
    { actividad_id: bjj, dias: [7], desde: '19:00', hasta: '20:30' },
    { actividad_id: bjj, dias: [1], desde: '7:00', hasta: '20:30' },
    { actividad_id: bjj, dias: [1], desde: '20:30', hasta: '19:00' },
    { actividad_id: bjj, dias: [1], desde: '19:00', hasta: '20:30', cupo: 0 },
    { actividad_id: 999999, dias: [1], desde: '19:00', hasta: '20:30' }
  ];
  for (const malo of malos) assert.equal((await admin.post('/api/clases', malo)).status, 400, JSON.stringify(malo));
  const r = await admin.post('/api/clases', {
    actividad_id: bjj,
    dias: [1, 3],
    desde: '19:00',
    hasta: '20:30',
    detalle: 'Adultos',
    cupo: 20,
    profes: [juan, ana]
  });
  assert.equal(r.status, 201, r.texto);
  assert.equal(r.json.length, 2);
  assert.deepEqual(r.json.map((c) => c.dia_semana), [1, 3]);
  assert.deepEqual(r.json[0].profes.map((p) => p.nombre), ['Ana', 'Juan']);
  // Musculación, abierta de lunes a viernes: sin cupo aunque se lo manden.
  const libre = await admin.post('/api/clases', { actividad_id: musculacion, dias: [0, 1, 2, 3, 4], desde: '07:00', hasta: '23:00', cupo: 30 });
  assert.equal(libre.status, 201, libre.texto);
  assert.equal(libre.json[0].cupo, null);
  // La recepción la ve, pero no la toca.
  const grilla = (await recepcion.get('/api/grilla')).json;
  assert.equal(grilla.clases.length, 7);
  assert.equal(grilla.actividades.length, 2);
  assert.ok(grilla.profes.some((p) => p.nombre === 'Juan'));
  assert.equal((await recepcion.post('/api/clases', { actividad_id: bjj, dias: [5], desde: '10:00', hasta: '11:00' })).status, 403);
});

test('un profe no puede dar dos clases a la vez, pero dos clases sí pueden ser a la misma hora', async () => {
  const muay = (await admin.post('/api/actividades', { nombre: 'Muay Thai', color: 'rojo' })).json.id;
  const pisa = await admin.post('/api/clases', { actividad_id: muay, dias: [1], desde: '20:00', hasta: '21:00', profes: [juan] });
  assert.equal(pisa.status, 400);
  assert.match(pisa.json.error, /Juan ya está en BJJ el martes de 19:00 a 20:30/);
  // A la misma hora, con otro profe, sí.
  const sola = await admin.post('/api/clases', { actividad_id: muay, dias: [1], desde: '19:00', hasta: '20:00' });
  assert.equal(sola.status, 201, sola.texto);
  // Pegada a la de BJJ no se pisa.
  const despues = await admin.post('/api/clases', { actividad_id: muay, dias: [1], desde: '20:30', hasta: '21:30', profes: [juan] });
  assert.equal(despues.status, 201, despues.texto);
});

test('editar un horario, sacarlo y dar de baja una actividad', async () => {
  const grilla = (await admin.get('/api/grilla')).json;
  const martes = grilla.clases.find((c) => c.actividad_id === bjj && c.dia_semana === 1);
  // Moverla al sábado a la mañana, solo con Ana y sin cupo.
  const r = await admin.patch(`/api/clases/${martes.id}`, {
    actividad_id: bjj,
    dia_semana: 5,
    desde: '10:00',
    hasta: '11:30',
    detalle: 'Principiantes',
    cupo: '',
    profes: [ana]
  });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.dia_semana, 5);
  assert.equal(r.json.cupo, null);
  assert.deepEqual(r.json.profes.map((p) => p.nombre), ['Ana']);
  // Editarla consigo misma no choca.
  assert.equal(
    (await admin.patch(`/api/clases/${martes.id}`, { actividad_id: bjj, dia_semana: 5, desde: '10:30', hasta: '11:30', profes: [ana] })).status,
    200
  );
  assert.equal((await admin.patch(`/api/clases/${martes.id}`, { activo: false })).status, 200);
  assert.equal((await admin.patch(`/api/clases/${martes.id}`, { activo: false })).status, 404, 'ya no está');
  // Dar de baja BJJ saca el jueves de la grilla; volver a darla de alta lo trae.
  assert.equal((await admin.patch(`/api/actividades/${bjj}`, { activo: false })).status, 200);
  assert.ok(!(await admin.get('/api/grilla')).json.clases.some((c) => c.actividad_id === bjj));
  assert.equal((await admin.patch(`/api/actividades/${bjj}`, { activo: true })).status, 200);
  assert.equal((await admin.get('/api/grilla')).json.clases.filter((c) => c.actividad_id === bjj).length, 1);
  assert.equal((await admin.patch(`/api/actividades/${musculacion}`, { color: 'verde' })).status, 200);
});

test('una clase compartida es de varias actividades a la vez (hist. §202)', async () => {
  const boxeo = (await admin.post('/api/actividades', { nombre: 'Boxeo', color: 'amarillo' })).json.id;
  const kick = (await admin.post('/api/actividades', { nombre: 'Kickboxing', color: 'naranja' })).json.id;
  // Una libre no se junta con otras.
  assert.equal((await admin.post('/api/clases', { actividades: [boxeo, musculacion], dias: [4], desde: '19:00', hasta: '20:00' })).status, 400);
  const r = await admin.post('/api/clases', { actividades: [boxeo, kick], dias: [4], desde: '19:00', hasta: '20:00', detalle: 'Sparring', profes: [ana] });
  assert.equal(r.status, 201, r.texto);
  const [sparring] = r.json;
  assert.deepEqual(sparring.actividades, [boxeo, kick]);
  assert.equal(sparring.actividad_id, boxeo);
  // Ana ya está en el sparring: el choque nombra las dos actividades.
  const pisa = await admin.post('/api/clases', { actividad_id: bjj, dias: [4], desde: '19:30', hasta: '20:30', profes: [ana] });
  assert.match(pisa.json.error, /Ana ya está en Boxeo \+ Kickboxing el viernes/);
  // Kickboxing no puede pasar a libre mientras comparta clases.
  assert.equal((await admin.patch(`/api/actividades/${kick}`, { horario: 'libre' })).status, 400);
  // Sin Boxeo, la clase sigue con Kickboxing.
  await admin.patch(`/api/actividades/${boxeo}`, { activo: false });
  const sigue = (await admin.get('/api/grilla')).json.clases.find((c) => c.id === sparring.id);
  assert.deepEqual(sigue.actividades, [kick]);
  await admin.patch(`/api/actividades/${boxeo}`, { activo: true });
  // Editarla para que sea solo de Boxeo.
  const editada = await admin.patch(`/api/clases/${sparring.id}`, { actividades: [boxeo], dia_semana: 4, desde: '19:00', hasta: '20:00', profes: [] });
  assert.deepEqual(editada.json.actividades, [boxeo]);
});

test('un negocio no ve ni toca la grilla de otro', async () => {
  const ajena = (await otro.get('/api/grilla')).json;
  assert.equal(ajena.clases.length, 0);
  assert.equal(ajena.actividades.length, 0);
  const clase = (await admin.get('/api/grilla')).json.clases[0];
  assert.equal((await otro.patch(`/api/clases/${clase.id}`, { activo: false })).status, 404);
  assert.equal((await otro.patch(`/api/actividades/${bjj}`, { nombre: 'Robada' })).status, 404);
  assert.equal((await otro.post('/api/clases', { actividad_id: bjj, dias: [0], desde: '10:00', hasta: '11:00' })).status, 400);
  const suya = (await otro.post('/api/actividades', { nombre: 'Yoga' })).json.id;
  assert.equal((await otro.post('/api/clases', { actividad_id: suya, dias: [0], desde: '10:00', hasta: '11:00', profes: [juan] })).status, 400);
});
