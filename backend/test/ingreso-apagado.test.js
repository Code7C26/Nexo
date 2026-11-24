// El ingreso de socios como función aparte (hist. §233): un dojo sin compu en
// la puerta no anota quién entra. Con el ingreso apagado no se avisa "Parece
// que dejó" (todos parecerían no venir) y los cinturones no cuentan clases:
// el paso pide solo los meses. A los negocios que ya tenían socios se les
// prende una vez, al arrancar, y si el admin lo apaga queda apagado.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

const ZONA = 'America/Argentina/Buenos_Aires';
const dia = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString('sv-SE', { timeZone: ZONA });
const diaSemana = (fecha) => (new Date(`${fecha}T12:00:00Z`).getUTCDay() + 6) % 7;

let servidor;
let admin;
let negocio;

before(async () => {
  servidor = await levantarServidor();
  admin = await registrarEmpresa(servidor, { empresa: 'Dojo Sin Puerta', usuario: 'dojosinpuerta' });
  negocio = (await admin.get('/api/negocio')).json;
});

after(async () => {
  await servidor?.cerrar();
});

const funciones = async (...modulos) => {
  const r = await admin.put('/api/negocio', { nombre: negocio.nombre, modulos });
  assert.equal(r.status, 200, r.texto);
  return (await admin.get('/api/negocio')).json.modulos;
};

test('el ingreso va con socios: sin socios se apaga con ellos', async () => {
  assert.deepEqual(await funciones('socios', 'ingreso', 'grados'), ['socios', 'ingreso', 'grados']);
  assert.deepEqual(await funciones('ingreso'), []);
});

test('sin el ingreso no se avisa quién parece que dejó', async () => {
  await funciones('socios', 'ingreso');
  const plan = (await admin.post('/api/planes-socio', { nombre: 'Kick', opciones: [{ meses: 1, precio: 30000 }] })).json;
  const alta = await admin.post('/api/socios', { cliente: { nombre: 'Hace Mucho' }, planes: [{ opcion_id: plan.opciones[0].id }], fecha_alta: dia(-200), ultima_vez: dia(-60) });
  assert.equal(alta.status, 201, alta.texto);
  const marcado = async () => (await admin.get('/api/socios')).json.find((s) => s.id === alta.json.id).parece_que_dejo;
  assert.ok(await marcado(), 'con el ingreso: hace 60 días que no entra y debe');
  await funciones('socios');
  assert.equal(await marcado(), null, 'sin el ingreso no se sabe si viene');
  assert.equal((await admin.get('/api/reportes/socios')).json.asistencia.parece_que_dejaron, 0);
  assert.equal((await admin.patch(`/api/socios/${alta.json.id}`, { estado: 'baja', bonificar_sin_venir: true })).status, 400);
});

test('sin el ingreso los cinturones avisan solo lo que sube por tiempo', async () => {
  await funciones('socios', 'ingreso', 'grados');
  const bjj = (await admin.post('/api/actividades', { nombre: 'BJJ', color: 'violeta' })).json.id;
  const clases = (await admin.post('/api/clases', { actividad_id: bjj, dias: [0, 1, 2, 3, 4, 5, 6], desde: '19:00', hasta: '20:30' })).json;
  const claseDel = Object.fromEntries(clases.map((c) => [c.dia_semana, c.id]));
  const r = await admin.put(`/api/actividades/${bjj}/grados`, {
    grados: [
      { nombre: 'Blanco', color: 'blanco', rayas: 4, clases_cinturon: 150 },
      { nombre: 'Azul', color: 'azul', rayas: 4, por: 'tiempo', meses_paso: 6 },
      { nombre: 'Violeta', color: 'violeta', rayas: 0 }
    ]
  });
  assert.equal(r.status, 200, r.texto);
  const [blanco, azul] = r.json.grados;
  const plan = (await admin.post('/api/planes-socio', { nombre: 'BJJ', opciones: [{ meses: 1, precio: 30000 }] })).json;
  const alta = async (nombre) => (await admin.post('/api/socios', { cliente: { nombre }, planes: [{ opcion_id: plan.opciones[0].id }] })).json.id;
  const ana = await alta('Ana Rayas');
  const beto = await alta('Beto Cuatro');
  // Ana: blanco con un grado y 29 clases (el blanco pide 150, 30 por paso);
  // Beto: azul desde hace 8 meses y 10 clases (el azul, un grado cada 6 meses).
  const pasos = await admin.post('/api/grados/pasos', {
    pasos: [
      { socio_id: ana, grado_id: blanco.id, raya: 1, fecha: dia(-5), clases_antes: 29 },
      { socio_id: beto, grado_id: azul.id, raya: 0, fecha: dia(-240), clases_antes: 10 }
    ]
  });
  assert.equal(pasos.status, 201, pasos.texto);
  const fecha = dia(-1);
  assert.equal((await admin.post(`/api/clases/${claseDel[diaSemana(fecha)]}/fechas/${fecha}/asistencias`, { socio_id: ana })).status, 201);
  const alumno = async (id) => (await admin.get('/api/grados')).json.alumnos.find((a) => a.socio_id === id);

  let a = await alumno(ana);
  let b = await alumno(beto);
  assert.deepEqual([a.clases, a.siguiente.clases, a.listo], [30, 30, true], 'con el ingreso cuentan las clases');
  assert.deepEqual([b.clases, b.siguiente.clases, b.siguiente.meses, b.listo], [10, null, 6, true], 'el azul sube por tiempo');
  assert.equal((await admin.get('/api/reportes/socios')).json.para_graduar, 2);

  await funciones('socios', 'grados');
  a = await alumno(ana);
  b = await alumno(beto);
  assert.deepEqual([a.clases, a.siguiente.clases, a.listo], [null, null, false], 'el grado lo decide el profe');
  assert.deepEqual([b.clases, b.siguiente.clases, b.siguiente.meses, b.listo], [null, null, 6, true], 'el azul, por tiempo, avisa igual');
  const ficha = (await admin.get(`/api/socios/${beto}`)).json;
  assert.equal(ficha.grados.find((x) => x.actividad.id === bjj).situacion.clases, null);
});

test('a los negocios con socios se les prende una vez al arrancar, y apagado queda apagado', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'nexo-ingreso-'));
  const dbPath = path.join(dir, 'nexo.db');
  try {
    const primero = await levantarServidor({ dbPath });
    await registrarEmpresa(primero, { empresa: 'Gimnasio Viejo', usuario: 'gimviejo' });
    await registrarEmpresa(primero, { empresa: 'Kiosco Viejo', usuario: 'kioscoviejo' });
    await primero.cerrar();

    const modulos = (base, nombre) => base.prepare('SELECT modulos FROM organizaciones WHERE nombre = ?').get(nombre).modulos;
    let base = new DatabaseSync(dbPath);
    base.prepare("UPDATE organizaciones SET modulos = 'pos socios grados' WHERE nombre = 'Gimnasio Viejo'").run();
    base.prepare("UPDATE organizaciones SET modulos = 'pos stock' WHERE nombre = 'Kiosco Viejo'").run();
    base.exec('PRAGMA user_version = 2');
    base.close();

    const segundo = await levantarServidor({ dbPath });
    await segundo.cerrar();
    base = new DatabaseSync(dbPath);
    assert.equal(modulos(base, 'Gimnasio Viejo'), 'pos socios ingreso grados');
    assert.equal(modulos(base, 'Kiosco Viejo'), 'pos stock');
    assert.ok(base.prepare('PRAGMA user_version').get().user_version >= 3);
    // El admin lo apaga: el próximo arranque no lo vuelve a prender.
    base.prepare("UPDATE organizaciones SET modulos = 'pos socios grados' WHERE nombre = 'Gimnasio Viejo'").run();
    base.close();

    const tercero = await levantarServidor({ dbPath });
    await tercero.cerrar();
    base = new DatabaseSync(dbPath);
    assert.equal(modulos(base, 'Gimnasio Viejo'), 'pos socios grados');
    base.close();
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
