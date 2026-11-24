// Grados y cinturones (hist. §230): la lista de cada actividad (un cinturón
// con sus rayas por fila; en la pantalla, sus grados), el historial de cada alumno, el grado de los que
// ya venían con las clases que llevaban, quién llegó a lo que pide el paso que
// sigue (las clases del cinturón repartidas, o el tiempo; hist. §234) y graduar a varios
// juntos. La lista y los ascensos son del admin; un negocio no ve ni toca los
// de otro.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';
import { PLANTILLAS_GRADOS, clasesDelPaso, desdeElCinturon, estaListo, mesesEntre, proximoPaso, revisarGrados } from '../../frontend/js/core/grados.js';

const ZONA = 'America/Argentina/Buenos_Aires';
const dia = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString('sv-SE', { timeZone: ZONA });
const diaSemana = (fecha) => (new Date(`${fecha}T12:00:00Z`).getUTCDay() + 6) % 7;

let servidor;
let admin;
let recepcion;
let otro;
let bjj;
let judo;
// El horario de BJJ de cada día de la semana (0 = lunes).
const bjjDel = {};
let lucia;
let pedro;
let marta;
let tomas;
let grados; // los de BJJ, por nombre

before(async () => {
  servidor = await levantarServidor();
  admin = await registrarEmpresa(servidor, { empresa: 'Dojo Grados', usuario: 'dojogrados' });
  recepcion = await crearEmpleado(servidor, admin, { usuario: 'recepciongrados', nombre: 'Recepción' });
  otro = await registrarEmpresa(servidor, { empresa: 'Otro Dojo Grados', usuario: 'otrogrados' });
  bjj = (await admin.post('/api/actividades', { nombre: 'BJJ', color: 'violeta' })).json.id;
  judo = (await admin.post('/api/actividades', { nombre: 'Judo', color: 'azul' })).json.id;
  for (const c of (await admin.post('/api/clases', { actividad_id: bjj, dias: [0, 1, 2, 3, 4, 5, 6], desde: '19:00', hasta: '20:30' })).json) {
    bjjDel[c.dia_semana] = c.id;
  }
  const plan = (await admin.post('/api/planes-socio', { nombre: 'BJJ', opciones: [{ meses: 1, precio: 30000 }] })).json;
  const alta = async (nombre, documento) =>
    (await recepcion.post('/api/socios', { cliente: { nombre, documento }, planes: [{ opcion_id: plan.opciones[0].id }] })).json.id;
  lucia = await alta('Lucía Gómez', '30222111');
  pedro = await alta('Pedro Díaz', '30222333');
  marta = await alta('Marta Ruiz', '30222444');
  tomas = await alta('Tomás Paz', '30222555');
});

after(async () => {
  await servidor?.cerrar();
});

const vino = async (socioId, fecha) => {
  const r = await recepcion.post(`/api/clases/${bjjDel[diaSemana(fecha)]}/fechas/${fecha}/asistencias`, { socio_id: socioId });
  assert.equal(r.status, 201, r.texto);
};
const alumno = async (socioId, actividadId = bjj) =>
  (await recepcion.get('/api/grados')).json.alumnos.find((a) => a.socio_id === socioId && a.actividad_id === actividadId);

test('las reglas puras: la próxima raya o el próximo cinturón, y lo que pide su cinturón', () => {
  const lista = [
    { id: 1, orden: 0, rayas: 4, por: 'clases', clases_cinturon: 150, meses_paso: null, activo: true },
    { id: 2, orden: 1, rayas: 4, por: 'clases', clases_cinturon: 202, meses_paso: null, activo: true },
    { id: 3, orden: 2, rayas: 0, por: 'clases', clases_cinturon: 80, meses_paso: null, activo: false },
    { id: 4, orden: 3, rayas: 6, por: 'tiempo', clases_cinturon: null, meses_paso: 36, activo: true }
  ];
  // Las clases del cinturón se reparten entre sus 4 grados y el salto al
  // siguiente: 150 son 30 por paso.
  assert.deepEqual(proximoPaso(lista, { grado_id: 1, raya: 2 }), { grado_id: 1, raya: 3, clases: 30, meses: null });
  assert.deepEqual(proximoPaso(lista, { grado_id: 1, raya: 4 }), { grado_id: 2, raya: 0, clases: 30, meses: null }, 'el salto lo pide el cinturón de hoy');
  // 202 no da justo: unos piden una más, y entre todos suman 202.
  const del2 = [0, 1, 2, 3].map((raya) => proximoPaso(lista, { grado_id: 2, raya }).clases);
  assert.deepEqual(del2, [40, 41, 40, 41]);
  assert.equal([1, 2, 3, 4, 5].reduce((suma, n) => suma + clasesDelPaso(202, 5, n), 0), 202);
  assert.deepEqual(proximoPaso(lista, { grado_id: 2, raya: 4 }), { grado_id: 4, raya: 0, clases: 40, meses: null }, 'el dado de baja se saltea');
  // El negro, por tiempo: un grado cada 36 meses, y no salta a ninguno.
  assert.deepEqual(proximoPaso(lista, { grado_id: 4, raya: 0 }), { grado_id: 4, raya: 1, clases: null, meses: 36 });
  assert.equal(proximoPaso(lista, { grado_id: 4, raya: 6 }), null, 'el último');
  // Un tiempo distinto en cada grado (hist. §235), como lo guarda la base.
  const negroPorGrado = [{ id: 9, orden: 0, rayas: 6, por: 'tiempo', meses_paso: null, meses_pasos: '36 36 36 36 60 60', activo: true }];
  assert.deepEqual([0, 3, 4, 5].map((raya) => proximoPaso(negroPorGrado, { grado_id: 9, raya }).meses), [36, 36, 60, 60]);
  assert.match(revisarGrados([{ nombre: 'Negro', color: 'negro', rayas: 6, por: 'tiempo', meses_pasos: [36, 60] }]).error, /6 pasos/);
  assert.equal(mesesEntre('2026-03-03', '2026-04-02'), 0);
  assert.equal(mesesEntre('2026-03-03', '2026-04-03'), 1);
  assert.equal(mesesEntre('2024-01-31', '2026-02-28'), 24);
  const historial = [
    { grado_id: 1, fecha: '2025-01-01' },
    { grado_id: 2, fecha: '2025-06-01' },
    { grado_id: 2, fecha: '2025-09-01' }
  ];
  assert.equal(desdeElCinturon(historial), '2025-06-01', 'las rayas no cambian desde cuándo tiene el cinturón');
  assert.equal(estaListo({ clases: 50, meses: 24 }, 50, 23), false);
  assert.equal(estaListo({ clases: 50, meses: 24 }, 50, 24), true);
  assert.equal(estaListo({ clases: null, meses: null }, 500, 500), false, 'sin requisitos lo decide el profe');
  assert.match(revisarGrados([{ nombre: 'Azul', color: 'celeste' }]).error, /color/);
  assert.match(revisarGrados([{ nombre: 'Azul', color: 'azul' }, { nombre: 'azul', color: 'negro' }]).error, /dos veces/);
  assert.match(revisarGrados([{ nombre: 'Azul', color: 'azul', rayas: 11 }]).error, /grados/);
  assert.match(revisarGrados([{ nombre: 'Azul', color: 'azul', rayas: 2, clases_cinturon: 0 }]).error, /clases/);
  assert.match(revisarGrados([{ nombre: 'Azul', color: 'azul', rayas: 2, por: 'edad' }]).error, /por clases o por tiempo/);
  assert.match(
    revisarGrados([{ nombre: 'Blanco', color: 'blanco', rayas: 4, clases_cinturon: 3 }, { nombre: 'Azul', color: 'azul' }]).error,
    /5 pasos.*al menos 5 clases/
  );
  // El último sin grados no pide nada; lo que no es de su forma no se guarda.
  const { grados: limpios } = revisarGrados([{ nombre: ' Blanco ', color: 'blanco', rayas: 0, clases_cinturon: 30 }]);
  assert.deepEqual(limpios[0], { id: null, nombre: 'Blanco', color: 'blanco', color2: null, rayas: 0, por: 'clases', clases_cinturon: null, meses_paso: null, meses_pasos: null, orden: 0 });
  const { grados: negro } = revisarGrados([{ nombre: 'Negro', color: 'negro', rayas: 6, por: 'tiempo', meses_paso: 36, clases_cinturon: 100 }]);
  assert.deepEqual([negro[0].por, negro[0].clases_cinturon, negro[0].meses_paso], ['tiempo', null, 36]);
});

test('armar los grados de una actividad: el admin, desde una plantilla, y la recepción los ve', async () => {
  assert.equal((await recepcion.put(`/api/actividades/${bjj}/grados`, { grados: [] })).status, 403);
  assert.equal((await otro.put(`/api/actividades/${bjj}/grados`, { grados: [] })).status, 404, 'la actividad de otro negocio');
  assert.equal((await admin.put(`/api/actividades/${bjj}/grados`, { grados: [{ nombre: 'Azul' }] })).status, 400);
  // La plantilla de BJJ, con las clases que pide el profe en cada cinturón: el
  // blanco, 200 (40 por paso); los otros, 150 (30 por paso). El negro va por
  // tiempo.
  const lista = PLANTILLAS_GRADOS.bjj.grados.map((g) => ({ ...g, clases_cinturon: g.nombre === 'Blanco' ? 200 : 150 }));
  const r = await admin.put(`/api/actividades/${bjj}/grados`, { grados: lista });
  assert.equal(r.status, 200, r.texto);
  assert.deepEqual(r.json.grados.map((g) => [g.nombre, g.rayas]), [['Blanco', 4], ['Azul', 4], ['Violeta', 4], ['Marrón', 4], ['Negro', 6]]);
  grados = Object.fromEntries(r.json.grados.map((g) => [g.nombre, g]));
  assert.deepEqual([grados.Azul.por, grados.Azul.clases_cinturon], ['clases', 150]);
  assert.deepEqual(
    [grados.Negro.por, grados.Negro.clases_cinturon, grados.Negro.meses_paso, grados.Negro.meses_pasos],
    ['tiempo', null, null, [36, 36, 36, 36, 60, 60]],
    'cada 3 años hasta el 4.º, cada 5 desde el 5.º'
  );
  const pagina = (await recepcion.get('/api/grados')).json;
  assert.deepEqual(pagina.actividades.find((a) => a.id === judo).grados, [], 'Judo todavía no tiene');
  assert.equal(pagina.actividades.find((a) => a.id === bjj).grados.length, 5);
  assert.deepEqual((await otro.get('/api/grados')).json.alumnos, []);
});

test('los que ya venían: su cinturón con las clases que llevaban, y cuándo llegan a la próxima raya', async () => {
  // Lucía es azul con dos rayas desde hace 10 días, y ya llevaba 25 clases.
  assert.equal((await recepcion.post('/api/grados/pasos', { pasos: [{ socio_id: lucia, grado_id: grados.Azul.id, raya: 2 }] })).status, 403);
  const r = await admin.post('/api/grados/pasos', {
    pasos: [
      { socio_id: lucia, grado_id: grados.Azul.id, raya: 2, fecha: dia(-10), clases_antes: 25 },
      { socio_id: pedro, grado_id: grados.Blanco.id, raya: 4, fecha: dia(-10), clases_antes: 38 }
    ]
  });
  assert.equal(r.status, 201, r.texto);
  let l = await alumno(lucia);
  assert.deepEqual([l.nombre, l.clases, l.listo], ['Azul · 2 grados', 25, false]);
  assert.deepEqual([l.siguiente.nombre, l.siguiente.clases], ['Azul · 3 grados', 30]);
  // La clase del mismo día del paso no cuenta (la hizo con el grado de antes).
  await vino(lucia, dia(-10));
  for (const n of [-9, -7, -5, -3]) await vino(lucia, dia(n));
  l = await alumno(lucia);
  assert.deepEqual([l.clases, l.listo], [29, false]);
  await vino(lucia, dia(-1));
  l = await alumno(lucia);
  assert.deepEqual([l.clases, l.listo], [30, true]);
  // Pedro tiene las 4 rayas de blanco: lo que sigue es el azul, y el último
  // tramo del blanco pide 40.
  const p = await alumno(pedro);
  assert.deepEqual([p.siguiente.nombre, p.siguiente.clases, p.listo], ['Azul', 40, false]);
});

test('el Resumen cuenta a los que están listos, solo con el módulo prendido', async () => {
  assert.equal((await admin.get('/api/reportes/socios')).json.para_graduar, null);
  const negocio = (await admin.get('/api/negocio')).json;
  // Con el ingreso: las clases cuentan (sin él, solo los meses; hist. §233).
  const conGrados = [...new Set([...negocio.modulos, 'socios', 'ingreso', 'grados'])];
  const r = await admin.put('/api/negocio', { nombre: negocio.nombre, modulos: conGrados });
  assert.equal(r.status, 200, r.texto);
  assert.equal((await admin.get('/api/reportes/socios')).json.para_graduar, 1);
  // Sin socios, los grados se apagan con ellos.
  const sinSocios = await admin.put('/api/negocio', { nombre: negocio.nombre, modulos: conGrados.filter((m) => m !== 'socios') });
  assert.equal(sinSocios.status, 200, sinSocios.texto);
  assert.ok(!(await admin.get('/api/negocio')).json.modulos.includes('grados'));
  await admin.put('/api/negocio', { nombre: negocio.nombre, modulos: conGrados });
});

test('graduar: varios juntos, todo o nada, y la fecha va desde el último paso', async () => {
  const mal = [
    [{ socio_id: lucia, grado_id: grados.Azul.id, raya: 2 }, /ya tiene/],
    [{ socio_id: lucia, grado_id: grados.Azul.id, raya: 3, fecha: dia(-20) }, /último paso/],
    [{ socio_id: lucia, grado_id: grados.Azul.id, raya: 3, fecha: dia(1) }, /hoy para atrás/],
    [{ socio_id: lucia, grado_id: grados.Azul.id, raya: 5 }, /4 grados/],
    [{ socio_id: 999999, grado_id: grados.Azul.id }, /socios no existe/]
  ];
  for (const [paso, error] of mal) {
    const r = await admin.post('/api/grados/pasos', { pasos: [paso] });
    assert.equal(r.status, 400, r.texto);
    assert.match(r.json.error, error);
  }
  const dosVeces = await admin.post('/api/grados/pasos', {
    pasos: [
      { socio_id: lucia, grado_id: grados.Azul.id, raya: 3 },
      { socio_id: lucia, grado_id: grados.Azul.id, raya: 4 }
    ]
  });
  assert.match(dosVeces.json.error, /dos veces/);
  // Uno mal frena a todos.
  const unoMal = await admin.post('/api/grados/pasos', {
    pasos: [
      { socio_id: pedro, grado_id: grados.Azul.id },
      { socio_id: lucia, grado_id: grados.Azul.id, raya: 2 }
    ]
  });
  assert.equal(unoMal.status, 400);
  assert.equal((await alumno(pedro)).nombre, 'Blanco · 4 grados');
  // El examen: Lucía a su tercera raya y Pedro a azul, con una nota.
  const r = await admin.post('/api/grados/pasos', {
    pasos: [
      { socio_id: lucia, grado_id: grados.Azul.id, raya: 3, nota: 'Muy buena guardia' },
      { socio_id: pedro, grado_id: grados.Azul.id, raya: 0 }
    ]
  });
  assert.equal(r.status, 201, r.texto);
  const l = await alumno(lucia);
  assert.deepEqual([l.nombre, l.clases, l.listo, l.desde_cinturon], ['Azul · 3 grados', 0, false, dia(-10)]);
  assert.equal((await alumno(pedro)).nombre, 'Azul');
  const auditoria = (await admin.get('/api/auditoria')).json;
  const filas = Array.isArray(auditoria) ? auditoria : (auditoria.filas ?? auditoria.registros ?? []);
  assert.ok(filas.some((f) => /Lucía Gómez: Azul · 3 grados en BJJ .*antes, Azul · 2 grados.*Muy buena guardia/.test(f.detalle ?? '')));
});

test('por tiempo: el negro da un grado cada 3 años, contados desde el último paso', async () => {
  const r = await admin.post('/api/grados/pasos', { pasos: [{ socio_id: marta, grado_id: grados.Negro.id, fecha: dia(-1110) }] });
  assert.equal(r.status, 201, r.texto);
  let m = await alumno(marta);
  assert.ok(m.meses >= 36);
  assert.deepEqual([m.siguiente.nombre, m.siguiente.clases, m.siguiente.meses, m.listo], ['Negro · 1 grado', null, 36, true], 'no pide clases: alcanza el tiempo');
  await admin.post('/api/grados/pasos', { pasos: [{ socio_id: marta, grado_id: grados.Negro.id, raya: 1, fecha: dia(-400) }] });
  m = await alumno(marta);
  assert.equal(m.desde_cinturon, dia(-1110), 'los grados no cambian desde cuándo tiene el cinturón');
  assert.deepEqual([m.siguiente.nombre, m.meses < 36, m.listo], ['Negro · 2 grados', true, false], 'el tiempo corre desde el último grado');
});

test('la ficha del socio: su cinturón, el historial y deshacer solo el último', async () => {
  const ficha = (await recepcion.get(`/api/socios/${lucia}`)).json;
  const enBjj = ficha.grados.find((g) => g.actividad.id === bjj);
  assert.equal(enBjj.situacion.nombre, 'Azul · 3 grados');
  assert.deepEqual(enBjj.historial.map((h) => [h.nombre, h.ultimo]), [['Azul · 3 grados', true], ['Azul · 2 grados', false]]);
  assert.equal(enBjj.historial[1].clases_antes, 25);
  assert.equal(enBjj.clases_total, 6);
  assert.ok(!ficha.grados.some((g) => g.actividad.id === judo), 'Judo no tiene grados');
  const [ultimo, anterior] = enBjj.historial;
  assert.equal((await recepcion.del(`/api/socios/${lucia}/grados/${ultimo.id}`)).status, 403);
  assert.equal((await admin.del(`/api/socios/${lucia}/grados/${anterior.id}`)).status, 400, 'solo el último');
  assert.equal((await otro.del(`/api/socios/${lucia}/grados/${ultimo.id}`)).status, 404);
  const r = await admin.del(`/api/socios/${lucia}/grados/${ultimo.id}`);
  assert.equal(r.status, 200, r.texto);
  const vuelta = r.json.grados.find((g) => g.actividad.id === bjj).situacion;
  assert.deepEqual([vuelta.nombre, vuelta.clases, vuelta.listo], ['Azul · 2 grados', 30, true], 'vuelve con sus clases');
});

test('los que vienen sin grado, y sacar un grado de la lista', async () => {
  await vino(tomas, dia(-2));
  const pagina = (await admin.get('/api/grados')).json;
  assert.deepEqual(
    pagina.sin_grado.map((s) => [s.nombre, s.actividad_id, s.clases]),
    [['Tomás Paz', bjj, 1]]
  );
  assert.ok(pagina.socios.some((s) => s.id === tomas), 'los socios para cargarles el grado');
  // Violeta no lo tiene nadie y se borra; Blanco lo tuvo Pedro y queda en su historial.
  const sinBlancoNiVioleta = pagina.actividades.find((a) => a.id === bjj).grados.filter((g) => !['Blanco', 'Violeta'].includes(g.nombre));
  const r = await admin.put(`/api/actividades/${bjj}/grados`, { grados: sinBlancoNiVioleta });
  assert.equal(r.status, 200, r.texto);
  assert.deepEqual(r.json.grados.map((g) => g.nombre), ['Azul', 'Marrón', 'Negro']);
  const historialPedro = (await admin.get(`/api/socios/${pedro}`)).json.grados.find((g) => g.actividad.id === bjj).historial;
  assert.deepEqual(historialPedro.map((h) => h.nombre), ['Azul', 'Blanco · 4 grados']);
  // El dado de baja vuelve si se lo pone de nuevo; el borrado ya no es de la actividad.
  assert.equal((await admin.put(`/api/actividades/${bjj}/grados`, { grados: [{ id: grados.Blanco.id, nombre: 'Blanco', color: 'blanco' }] })).status, 200);
  assert.equal((await admin.put(`/api/actividades/${bjj}/grados`, { grados: [{ id: grados.Violeta.id, nombre: 'Violeta', color: 'violeta' }] })).status, 400);
});
