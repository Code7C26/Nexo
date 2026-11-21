// Gastos fijos que se repiten (hist. §214): el alquiler se anota solo cada mes,
// la luz queda para cargar, y ninguna vez se anota dos veces. Va aparte porque
// cada archivo levanta su servidor.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';
import { fechaDeHoy } from '../fecha.js';

let servidor;
let local;
let otro;
let empleado;
let categoria;
let caja;

// Las mismas cuentas que el servidor: la misma fecha n meses o días después
// (el 31 da el último día de los meses más cortos).
const iso = (d) => d.toISOString().slice(0, 10);
const sumarDias = (fecha, n) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const sumarMeses = (fecha, n) => {
  const [y, m, d] = fecha.split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(y, m - 1 + n, Math.min(d, ultimo), 12)));
};

const gastosDe = async (n, fijoId) => (await n.get('/api/gastos')).json.filter((g) => g.gasto_fijo_id === fijoId);
const fijoDe = async (n, id) => (await n.get('/api/gastos-fijos')).json.find((f) => f.id === id);
const saldoDe = async (n, cuentaId) => (await n.get('/api/tesoreria')).json.cuentas.find((c) => c.id === cuentaId).saldo;

before(async () => {
  servidor = await levantarServidor();
  local = await registrarEmpresa(servidor, { empresa: 'Local Fijos', usuario: 'localfijos' });
  otro = await registrarEmpresa(servidor, { empresa: 'Otro Fijos', usuario: 'otrofijos' });
  empleado = await crearEmpleado(servidor, local, { usuario: 'cajerafijos' });
  categoria = (await local.post('/api/categorias-gasto', { nombre: 'Alquiler', tipo: 'operativo' })).json.id;
  caja = (await local.get('/api/cuentas-tesoreria')).json.find((c) => c.tipo === 'efectivo');
});

after(async () => {
  await servidor?.cerrar();
});

test('el alquiler se anota solo cada mes, desde la primera vez, sin repetirse', async () => {
  const hoy = fechaDeHoy();
  const desde = sumarMeses(hoy, -2);
  const antes = await saldoDe(local, caja.id);
  const r = await local.post('/api/gastos-fijos', {
    categoria_id: categoria,
    cuenta_tesoreria_id: caja.id,
    importe: 300000,
    descripcion: 'Alquiler del local',
    fecha: desde,
    cada: 1,
    unidad: 'mes',
    modo: 'solo'
  });
  assert.equal(r.status, 201, r.texto);
  const veces = [desde, sumarMeses(desde, 1), sumarMeses(desde, 2)].filter((f) => f <= hoy);
  assert.equal(r.json.anotados, veces.length);
  assert.equal(r.json.proxima, sumarMeses(desde, veces.length));

  const gastos = await gastosDe(local, r.json.id);
  assert.deepEqual(gastos.map((g) => g.periodo).sort(), veces);
  assert.ok(gastos.every((g) => g.importe === 300000 && g.fecha === g.periodo && g.descripcion === 'Alquiler del local'));
  // Cada uno sale de la caja.
  assert.equal(await saldoDe(local, caja.id), antes - 300000 * veces.length);

  // Mirar de nuevo no anota nada más; anular una vez es "esa vez no".
  assert.equal((await gastosDe(local, r.json.id)).length, veces.length);
  assert.equal((await local.post(`/api/gastos/${gastos[0].id}/anular`, {})).status, 200);
  assert.equal((await gastosDe(local, r.json.id)).filter((g) => g.estado === 'activo').length, veces.length - 1);
  assert.equal((await gastosDe(local, r.json.id)).length, veces.length);

  // Editar cambia lo que viene, no lo anotado.
  const editado = await local.put(`/api/gastos-fijos/${r.json.id}`, {
    categoria_id: categoria,
    cuenta_tesoreria_id: caja.id,
    importe: 350000,
    descripcion: 'Alquiler del local',
    modo: 'solo'
  });
  assert.equal(editado.status, 200, editado.texto);
  assert.equal(editado.json.importe, 350000);
  assert.ok((await gastosDe(local, r.json.id)).every((g) => g.importe === 300000));

  // La baja: no toca más.
  const baja = await local.post(`/api/gastos-fijos/${r.json.id}/baja`, {});
  assert.equal(baja.status, 200, baja.texto);
  assert.equal(baja.json.estado, 'baja');
  assert.equal(baja.json.proxima, null);
});

test('la luz queda para cargar: avisa en el Resumen, se carga una vez y se puede saltear', async () => {
  const hoy = fechaDeHoy();
  const desde = sumarDias(hoy, -14);
  const r = await local.post('/api/gastos-fijos', {
    categoria_id: categoria,
    cuenta_tesoreria_id: caja.id,
    importe: 40000,
    descripcion: 'Luz',
    fecha: desde,
    cada: 1,
    unidad: 'semana',
    modo: 'aviso'
  });
  assert.equal(r.status, 201, r.texto);
  // La primera es la que se estaba cargando; las otras dos quedan para cargar.
  assert.equal(r.json.anotados, 1);
  assert.deepEqual(r.json.pendientes, [sumarDias(desde, 7), hoy]);
  assert.equal(r.json.proxima, sumarDias(hoy, 7));

  const avisos = (await local.get('/api/reportes/tablero')).json.revisar.filter((a) => a.clave === 'gasto_fijo');
  assert.deepEqual(avisos, [
    { clave: 'gasto_fijo', id: r.json.id, nombre: 'Luz', fecha: sumarDias(desde, 7), importe: 40000 },
    { clave: 'gasto_fijo', id: r.json.id, nombre: 'Luz', fecha: hoy, importe: 40000 }
  ]);

  // La carga cualquiera, con el importe que vino; dos veces, no.
  const vez = { categoria_id: categoria, cuenta_tesoreria_id: caja.id, importe: 43500, fecha: hoy, gasto_fijo_id: r.json.id, periodo: sumarDias(desde, 7) };
  const cargado = await empleado.post('/api/gastos', vez);
  assert.equal(cargado.status, 201, cargado.texto);
  assert.equal((await empleado.post('/api/gastos', vez)).status, 400);
  // Una fecha que no es de la serie, tampoco.
  assert.equal((await local.post('/api/gastos', { ...vez, periodo: sumarDias(hoy, -1) })).status, 400);

  // Saltear es del admin.
  assert.equal((await empleado.post(`/api/gastos-fijos/${r.json.id}/saltear`, { periodo: hoy })).status, 403);
  const salteado = await local.post(`/api/gastos-fijos/${r.json.id}/saltear`, { periodo: hoy });
  assert.equal(salteado.status, 200, salteado.texto);
  assert.deepEqual(salteado.json.pendientes, []);
  assert.deepEqual((await local.get('/api/reportes/tablero')).json.revisar.filter((a) => a.clave === 'gasto_fijo'), []);

  const fijo = await fijoDe(local, r.json.id);
  assert.equal(fijo.anotados, 2);
  // La próxima se propone con lo que se pagó la última vez, no con el de la primera.
  assert.equal(fijo.ultimo_importe, 43500);
});

test('pasar de aviso a "anotarlo solo" anota lo que había quedado para cargar', async () => {
  const hoy = fechaDeHoy();
  const r = await local.post('/api/gastos-fijos', {
    categoria_id: categoria,
    cuenta_tesoreria_id: caja.id,
    importe: 9000,
    descripcion: 'Internet',
    fecha: sumarDias(hoy, -7),
    cada: 1,
    unidad: 'semana',
    modo: 'aviso'
  });
  assert.deepEqual(r.json.pendientes, [hoy]);
  const editado = await local.put(`/api/gastos-fijos/${r.json.id}`, {
    categoria_id: categoria,
    cuenta_tesoreria_id: caja.id,
    importe: 9000,
    descripcion: 'Internet',
    modo: 'solo'
  });
  assert.equal(editado.status, 200, editado.texto);
  assert.equal(editado.json.anotados, 2);
});

test('una primera vez a futuro no anota nada todavía', async () => {
  const hoy = fechaDeHoy();
  const r = await local.post('/api/gastos-fijos', {
    categoria_id: categoria,
    cuenta_tesoreria_id: caja.id,
    importe: 120000,
    descripcion: 'Seguro',
    fecha: sumarDias(hoy, 10),
    cada: 3,
    unidad: 'mes',
    modo: 'solo'
  });
  assert.equal(r.status, 201, r.texto);
  assert.equal(r.json.anotados, 0);
  assert.equal(r.json.proxima, sumarDias(hoy, 10));
});

test('validaciones, permisos y aislamiento', async () => {
  const hoy = fechaDeHoy();
  const base = { categoria_id: categoria, cuenta_tesoreria_id: caja.id, importe: 1000, fecha: hoy, cada: 1, unidad: 'mes', modo: 'solo' };
  assert.equal((await local.post('/api/gastos-fijos', { ...base, unidad: 'dia' })).status, 400);
  assert.equal((await local.post('/api/gastos-fijos', { ...base, cada: 0 })).status, 400);
  assert.equal((await local.post('/api/gastos-fijos', { ...base, modo: 'otro' })).status, 400);
  assert.equal((await local.post('/api/gastos-fijos', { ...base, fecha: sumarDias(hoy, -400) })).status, 400);
  // Darlo de alta es del admin.
  assert.equal((await empleado.post('/api/gastos-fijos', base)).status, 403);
  // El empleado los ve; el otro negocio, no.
  assert.ok((await empleado.get('/api/gastos-fijos')).json.length > 0);
  assert.deepEqual((await otro.get('/api/gastos-fijos')).json, []);
  const uno = (await local.get('/api/gastos-fijos')).json[0];
  assert.equal((await otro.post(`/api/gastos-fijos/${uno.id}/baja`, {})).status, 404);
  // Una categoría de otro negocio da el mismo error que una que no existe.
  const ajena = (await otro.post('/api/categorias-gasto', { nombre: 'Alquiler', tipo: 'operativo' })).json.id;
  assert.equal((await local.post('/api/gastos-fijos', { ...base, categoria_id: ajena })).status, 400);
});
