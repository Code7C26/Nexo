// La asistencia por clase (hist. §226): cada horario de la grilla en una
// fecha, con quién la dio de verdad (el suplente) y quién vino. La lista la
// toman los dos roles, de hoy para atrás; cuenta las clases de cada socio por
// actividad, y un negocio no ve ni toca la de otro.
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
let ana;
let bjj;
let nogi;
let musculacion;
// El horario de BJJ de cada día de la semana (0 = lunes).
const bjjDel = {};
let libreDeHoy;
let sparringDeHoy;
let lucia;
let pedro;
let marta;

before(async () => {
  servidor = await levantarServidor();
  admin = await registrarEmpresa(servidor, { empresa: 'Dojo Asistencia', usuario: 'dojoasistencia' });
  recepcion = await crearEmpleado(servidor, admin, { usuario: 'recepcionasistencia', nombre: 'Recepción' });
  otro = await registrarEmpresa(servidor, { empresa: 'Otro Dojo Asistencia', usuario: 'otroasistencia' });
  juan = (await admin.post('/api/empleados', { nombre: 'Juan' })).json.id;
  ana = (await admin.post('/api/empleados', { nombre: 'Ana' })).json.id;
  bjj = (await admin.post('/api/actividades', { nombre: 'BJJ', color: 'violeta' })).json.id;
  nogi = (await admin.post('/api/actividades', { nombre: 'No-Gi', color: 'rojo' })).json.id;
  musculacion = (await admin.post('/api/actividades', { nombre: 'Musculación', horario: 'libre', color: 'gris' })).json.id;
  const todos = [0, 1, 2, 3, 4, 5, 6];
  for (const c of (await admin.post('/api/clases', { actividad_id: bjj, dias: todos, desde: '19:00', hasta: '20:30', profes: [juan] })).json) {
    bjjDel[c.dia_semana] = c.id;
  }
  libreDeHoy = (await admin.post('/api/clases', { actividad_id: musculacion, dias: [diaSemana(hoy)], desde: '07:00', hasta: '23:00' })).json[0].id;
  sparringDeHoy = (await admin.post('/api/clases', { actividades: [bjj, nogi], dias: [diaSemana(hoy)], desde: '21:00', hasta: '22:00', profes: [ana] })).json[0].id;
  const plan = (await admin.post('/api/planes-socio', { nombre: 'BJJ', opciones: [{ meses: 1, precio: 30000 }] })).json;
  const alta = async (nombre, documento) =>
    (await recepcion.post('/api/socios', { cliente: { nombre, documento }, planes: [{ opcion_id: plan.opciones[0].id }] })).json.id;
  lucia = await alta('Lucía Gómez', '30111222');
  pedro = await alta('Pedro Díaz', '30111333');
  marta = await alta('Marta Ruiz', '30111444');
});

after(async () => {
  await servidor?.cerrar();
});

const url = (claseId, fecha) => `/api/clases/${claseId}/fechas/${fecha}`;

test('la fecha tiene que caer el día de la clase, y la lista se toma de hoy para atrás', async () => {
  const deHoy = bjjDel[diaSemana(hoy)];
  assert.equal((await admin.get(url(deHoy, dia(1)))).status, 400, 'otro día de la semana');
  assert.equal((await admin.get(url(deHoy, '2026-13-01'))).status, 400);
  assert.equal((await admin.get(url(libreDeHoy, hoy))).status, 400, 'una actividad libre no tiene clases');
  assert.equal((await admin.post(`${url(deHoy, dia(7))}/asistencias`, { socio_id: lucia })).status, 400, 'la de la semana que viene todavía no');
  assert.equal((await admin.put(url(deHoy, dia(21)), { estado: 'suspendida' })).status, 400, 'más de dos semanas adelante');
  // Sin nada anotado, la clase muestra los profes de la grilla.
  const r = await recepcion.get(url(deHoy, hoy));
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.anotada, false);
  assert.deepEqual(r.json.profes.map((p) => [p.nombre, p.suplente]), [['Juan', false]]);
  assert.deepEqual(r.json.asistentes, []);
});

test('la recepción corrige la lista desde la clase, y nadie se anota dos veces', async () => {
  const deHoy = bjjDel[diaSemana(hoy)];
  // Ya no se sugiere por "entraron ese día" (hist. §228): la lista es la de
  // los que se anotaron en la clase.
  assert.equal((await recepcion.post(`/api/socios/${lucia}/ingresos`, {})).status, 201);
  const antes = (await recepcion.get(url(deHoy, hoy))).json;
  assert.equal(antes.entraron, undefined);
  assert.equal((await recepcion.post(`${url(deHoy, hoy)}/asistencias`, {})).status, 400);
  const r = await recepcion.post(`${url(deHoy, hoy)}/asistencias`, { socios: [lucia, pedro] });
  assert.equal(r.status, 201, r.texto);
  assert.equal(r.json.anotada, true);
  assert.deepEqual(r.json.asistentes.map((a) => a.nombre), ['Lucía Gómez', 'Pedro Díaz']);
  assert.ok(r.json.asistentes.every((a) => a.por_pantalla === false), 'los anotó la recepción');
  const otraVez = await recepcion.post(`${url(deHoy, hoy)}/asistencias`, { socio_id: lucia });
  assert.equal(otraVez.json.asistentes.length, 2);
});

test('el suplente: otro profe dio la clase, y queda en la grilla y en la auditoría', async () => {
  const deHoy = bjjDel[diaSemana(hoy)];
  assert.equal((await recepcion.put(url(deHoy, hoy), { profes: [999999] })).status, 400);
  const r = await recepcion.put(url(deHoy, hoy), { profes: [ana], nota: 'Juan, enfermo' });
  assert.equal(r.status, 200, r.texto);
  assert.deepEqual(r.json.profes.map((p) => [p.nombre, p.suplente]), [['Ana', true]]);
  assert.deepEqual(r.json.profes_grilla.map((p) => p.nombre), ['Juan'], 'la grilla no cambia');
  assert.equal(r.json.nota, 'Juan, enfermo');
  const grilla = (await recepcion.get('/api/grilla')).json;
  const anotada = grilla.semana.anotadas.find((f) => f.clase_id === deHoy && f.fecha === hoy);
  assert.deepEqual([anotada.asistentes, anotada.con_suplente, anotada.estado], [2, true, 'dada']);
  const auditoria = (await admin.get('/api/auditoria')).json;
  const filas = Array.isArray(auditoria) ? auditoria : (auditoria.filas ?? auditoria.registros ?? []);
  assert.ok(filas.some((f) => /la dio Ana \(suplente\)/.test(f.detalle ?? '')), 'el cambio de profe se audita');
});

test('suspender una clase: no con alumnos anotados; sacar a alguien de la lista se audita', async () => {
  const deHoy = bjjDel[diaSemana(hoy)];
  assert.equal((await admin.put(url(deHoy, hoy), { estado: 'suspendida' })).status, 400);
  const sacado = await recepcion.del(`${url(deHoy, hoy)}/asistencias/${pedro}`);
  assert.equal(sacado.status, 200, sacado.texto);
  assert.deepEqual(sacado.json.asistentes.map((a) => a.nombre), ['Lucía Gómez']);
  assert.equal((await recepcion.del(`${url(deHoy, hoy)}/asistencias/${pedro}`)).status, 404, 'ya no estaba');
  // La de mañana (el feriado) se suspende de antemano, y no se le toma lista.
  const manana = bjjDel[diaSemana(dia(1))];
  const feriado = await admin.put(url(manana, dia(1)), { estado: 'suspendida', nota: 'Feriado' });
  assert.equal(feriado.status, 200, feriado.texto);
  assert.equal(feriado.json.estado, 'suspendida');
});

test('la lista de un día pasado se carga desde la clase', async () => {
  const deHoy = bjjDel[diaSemana(hoy)];
  // Marta y Lucía vinieron la semana pasada a esta misma clase.
  const pasada = await admin.post(`${url(deHoy, dia(-7))}/asistencias`, { socios: [marta, lucia] });
  assert.equal(pasada.status, 201, pasada.texto);
  assert.deepEqual(pasada.json.asistentes.map((s) => s.nombre), ['Lucía Gómez', 'Marta Ruiz']);
});

test('las clases de cada socio por actividad, y una compartida cuenta para las dos', async () => {
  assert.equal((await recepcion.post(`${url(sparringDeHoy, hoy)}/asistencias`, { socio_id: lucia })).status, 201);
  const ficha = (await recepcion.get(`/api/socios/${lucia}`)).json;
  assert.equal(ficha.clases.total, 3);
  assert.deepEqual(
    ficha.clases.por_actividad.map((a) => [a.nombre, a.cantidad]),
    [['BJJ', 3], ['No-Gi', 1]]
  );
  assert.equal(ficha.clases.ultimas[0].actividad, 'BJJ + No-Gi');
});

test('el informe: quién dio cada clase y cuántas como suplente', async () => {
  const r = await admin.get(`/api/asistencia?desde=${dia(-10)}&hasta=${dia(1)}`);
  assert.equal(r.status, 200, r.texto);
  assert.deepEqual(r.json.total, { dadas: 3, suspendidas: 1, asistencias: 4 });
  const deAnaResumen = r.json.por_profe.find((p) => p.nombre === 'Ana');
  assert.deepEqual([deAnaResumen.clases, deAnaResumen.suplente], [2, 1], 'el sparring es suyo; la de BJJ, de suplente');
  const deAna = (await admin.get(`/api/asistencia?desde=${dia(-10)}&hasta=${dia(1)}&profe=${ana}`)).json;
  assert.equal(deAna.clases.length, 2);
  assert.equal((await admin.get(`/api/asistencia?desde=${hoy}&hasta=${dia(-1)}`)).status, 400);
});

test('un negocio no ve ni toca la asistencia de otro', async () => {
  const deHoy = bjjDel[diaSemana(hoy)];
  assert.equal((await otro.get(url(deHoy, hoy))).status, 404);
  assert.equal((await otro.post(`${url(deHoy, hoy)}/asistencias`, { socio_id: lucia })).status, 404);
  assert.equal((await otro.put(url(deHoy, hoy), { estado: 'suspendida' })).status, 404);
  assert.equal((await otro.del(`${url(deHoy, hoy)}/asistencias/${lucia}`)).status, 404);
  assert.equal((await otro.get('/api/asistencia')).json.clases.length, 0);
  // Ni anotar a un socio ajeno en una clase propia.
  const suya = (await otro.post('/api/actividades', { nombre: 'Judo' })).json.id;
  const clase = (await otro.post('/api/clases', { actividad_id: suya, dias: [diaSemana(hoy)], desde: '10:00', hasta: '11:00' })).json[0].id;
  assert.equal((await otro.post(`${url(clase, hoy)}/asistencias`, { socio_id: lucia })).status, 404);
  assert.equal((await otro.put(url(clase, hoy), { profes: [juan] })).status, 400);
});
