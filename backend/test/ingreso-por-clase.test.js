// El ingreso por clase (hist. §228): al entrar, el socio elige a qué clase
// viene (varias, si se queda a la siguiente); el profe se anota en la misma
// pantalla, con su PIN o, si también es socio, con su DNI. Un alumno que da
// una clase queda como el que la dio.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

const ZONA = 'America/Argentina/Buenos_Aires';
const dia = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString('sv-SE', { timeZone: ZONA });
const hoy = dia(0);
const diaSemana = (fecha) => (new Date(`${fecha}T12:00:00Z`).getUTCDay() + 6) % 7;

let servidor;
let admin;
let recepcion;
let otro;
let juan;
let clase7;
let clase8;
let manana;
let plan;

before(async () => {
  servidor = await levantarServidor();
  admin = await registrarEmpresa(servidor, { empresa: 'Dojo Por Clase', usuario: 'dojoporclase' });
  recepcion = await crearEmpleado(servidor, admin, { usuario: 'recepcionporclase', nombre: 'Recepción' });
  otro = await registrarEmpresa(servidor, { empresa: 'Otro Dojo Por Clase', usuario: 'otroporclase' });
  juan = (await admin.post('/api/empleados', { nombre: 'Juan Profe', pin: '4321' })).json.id;
  const bjj = (await admin.post('/api/actividades', { nombre: 'BJJ', color: 'violeta' })).json.id;
  const nogi = (await admin.post('/api/actividades', { nombre: 'No-Gi', color: 'rojo' })).json.id;
  // Las dos de todo el día, para que sean "de ahora" a cualquier hora en que
  // corra el test; la de mañana no.
  clase7 = (await admin.post('/api/clases', { actividad_id: bjj, dias: [diaSemana(hoy)], desde: '00:00', hasta: '23:59', profes: [juan] })).json[0].id;
  clase8 = (await admin.post('/api/clases', { actividad_id: nogi, dias: [diaSemana(hoy)], desde: '00:01', hasta: '23:59' })).json[0].id;
  manana = (await admin.post('/api/clases', { actividad_id: bjj, dias: [diaSemana(dia(1))], desde: '00:00', hasta: '23:59' })).json[0].id;
  plan = (await admin.post('/api/planes-socio', { nombre: 'BJJ', opciones: [{ meses: 1, precio: 30000 }] })).json;
});

after(async () => {
  await servidor?.cerrar();
});

// Un socio al día (pagó hasta la semana que viene) o uno que debe.
async function socio(nombre, documento, { debe = false } = {}) {
  const r = await admin.post('/api/socios', {
    cliente: { nombre, documento },
    planes: [{ opcion_id: plan.opciones[0].id }],
    fecha_alta: dia(-60),
    proxima_cuota: debe ? dia(-3) : dia(7)
  });
  assert.equal(r.status, 201, r.texto);
  return r.json;
}

const lista = async (claseId) => (await recepcion.get(`/api/clases/${claseId}/fechas/${hoy}`)).json;

test('al entrar ve las clases de ahora y se anota en las dos (la de las 7 y la de las 8)', async () => {
  await socio('Lucía Gómez', '30222111');
  const entra = await recepcion.post('/api/socios/entrada', { codigo: '30222111' });
  assert.equal(entra.json.entra, true, entra.texto);
  assert.deepEqual(entra.json.clases.map((c) => c.id), [clase7, clase8], 'la de mañana no');
  assert.equal(entra.json.da_clases, false);
  const r = await recepcion.post('/api/socios/entrada/clases', { codigo: '30222111', clases: [clase7, clase8] });
  assert.equal(r.status, 201, r.texto);
  assert.deepEqual(r.json.vengo, ['BJJ de las 00:00', 'No-Gi de las 00:01']);
  const bjj = await lista(clase7);
  assert.deepEqual(bjj.asistentes.map((a) => [a.nombre, a.por_pantalla]), [['Lucía Gómez', true]]);
  assert.equal((await lista(clase8)).asistentes.length, 1);
  // Vuelve a poner su DNI: ya está anotada, y no se repite.
  const otraVez = await recepcion.post('/api/socios/entrada', { codigo: '30222111' });
  assert.ok(otraVez.json.clases.every((c) => c.anotado));
  assert.equal((await recepcion.post('/api/socios/entrada/clases', { codigo: '30222111', clases: [clase8] })).status, 201);
  assert.equal((await lista(clase8)).asistentes.length, 1);
});

test('el que debe no se anota solo, y una clase que no es de ahora no se elige', async () => {
  await socio('Pedro Díaz', '30222333', { debe: true });
  assert.equal((await recepcion.post('/api/socios/entrada/clases', { codigo: '30222333', clases: [clase7] })).status, 403);
  await socio('Marta Ruiz', '30222444');
  for (const clases of [[manana], [999999], []]) {
    const r = await recepcion.post('/api/socios/entrada/clases', { codigo: '30222444', clases });
    assert.equal(r.status, 400, JSON.stringify(clases));
  }
  assert.equal((await recepcion.post('/api/socios/entrada/clases', { codigo: '99999999', clases: [clase7] })).status, 404);
});

test('un alumno que da clases se anota como el que la da, y reemplaza al de la grilla', async () => {
  const tomas = await socio('Tomás Alumno', '30222555');
  assert.equal((await recepcion.put(`/api/socios/${tomas.id}/da-clases`, { da_clases: true })).status, 403, 'lo marca el admin');
  const marcado = await admin.put(`/api/socios/${tomas.id}/da-clases`, { da_clases: true });
  assert.equal(marcado.status, 200, marcado.texto);
  assert.equal(marcado.json.da_clases, true);
  assert.equal((await recepcion.post('/api/socios/entrada', { codigo: '30222555' })).json.da_clases, true);
  const mal = await recepcion.post('/api/socios/entrada/clases', { codigo: '30222555', clases: [clase7], doy: [clase7] });
  assert.equal(mal.status, 400, 'la da o la toma, no las dos');
  // Da la de las 7 y entrena en la de las 8.
  const r = await recepcion.post('/api/socios/entrada/clases', { codigo: '30222555', clases: [clase8], doy: [clase7] });
  assert.equal(r.status, 201, r.texto);
  assert.deepEqual([r.json.doy, r.json.vengo], [['BJJ de las 00:00'], ['No-Gi de las 00:01']]);
  const bjj = await lista(clase7);
  assert.deepEqual(bjj.profes.map((p) => [p.nombre, p.suplente, p.alumno]), [['Tomás Alumno', true, true]], 'Juan, de la grilla, no la dio');
  assert.ok(!bjj.asistentes.some((a) => a.nombre === 'Tomás Alumno'));
  assert.ok((await lista(clase8)).asistentes.some((a) => a.nombre === 'Tomás Alumno'));
});

test('el profe se anota con su PIN en la misma pantalla, y se suma al que ya la da', async () => {
  const profes = (await recepcion.get('/api/socios/entrada/profes')).json;
  assert.deepEqual(profes.map((p) => p.nombre), ['Juan Profe'], 'solo los que tienen PIN');
  assert.equal((await recepcion.post('/api/socios/entrada/profe', { empleado_id: juan, pin: '0000' })).status, 403);
  const ver = await recepcion.post('/api/socios/entrada/profe', { empleado_id: juan, pin: '4321' });
  assert.equal(ver.status, 200, ver.texto);
  assert.deepEqual(ver.json.clases.map((c) => [c.id, c.la_doy]), [[clase7, false], [clase8, false]]);
  const r = await recepcion.post('/api/socios/entrada/profe', { empleado_id: juan, pin: '4321', doy: [clase7] });
  assert.equal(r.status, 201, r.texto);
  const bjj = await lista(clase7);
  assert.deepEqual(bjj.profes.map((p) => [p.nombre, p.suplente]), [['Juan Profe', false], ['Tomás Alumno', true]]);
  const auditoria = (await admin.get('/api/auditoria')).json;
  const filas = Array.isArray(auditoria) ? auditoria : (auditoria.filas ?? auditoria.registros ?? []);
  assert.ok(filas.some((f) => /Tomás Alumno se anotó en la entrada como el que la da \(suplente\)/.test(f.detalle ?? '')));
});

test('el profe que también es alumno es la misma persona, y dejar de dar clases no borra nada', async () => {
  const juanSocio = await socio('Juan Profe', '30222666');
  const marcado = await admin.put(`/api/socios/${juanSocio.id}/da-clases`, { da_clases: true });
  assert.equal(marcado.status, 200, marcado.texto);
  const empleados = (await admin.get('/api/empleados')).json;
  assert.equal(empleados.filter((e) => e.nombre === 'Juan Profe').length, 1, 'usa al empleado que ya estaba');
  // Juan tiene PIN: al sacarlo sigue siendo empleado, solo deja de ser el socio.
  const sacado = await admin.put(`/api/socios/${juanSocio.id}/da-clases`, { da_clases: false });
  assert.equal(sacado.json.da_clases, false);
  assert.ok((await admin.get('/api/empleados')).json.some((e) => e.nombre === 'Juan Profe' && e.activo));
  // Tomás no tenía PIN: queda inactivo, y ya no puede anotarse para darla.
  const tomas = (await recepcion.post('/api/socios/entrada', { codigo: '30222555' })).json;
  assert.equal((await admin.put(`/api/socios/${tomas.socio_id}/da-clases`, { da_clases: false })).status, 200);
  assert.equal((await recepcion.post('/api/socios/entrada/clases', { codigo: '30222555', doy: [clase8] })).status, 403);
  assert.ok((await lista(clase7)).profes.some((p) => p.nombre === 'Tomás Alumno'), 'la clase que dio queda');
});

test('un negocio no ve las clases ni los profes de otro en su entrada', async () => {
  assert.equal((await otro.post('/api/socios/entrada/clases', { codigo: '30222111', clases: [clase7] })).status, 404);
  assert.deepEqual((await otro.get('/api/socios/entrada/profes')).json, []);
  assert.equal((await otro.post('/api/socios/entrada/profe', { empleado_id: juan, pin: '4321' })).status, 404);
});
