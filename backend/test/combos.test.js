// Combos de verdad (hist. §203): un combo con precio fijo por mes (BJJ + MMA
// a $80.000, aunque sumen $110.000) y uno que baja solo algunos de sus planes
// si el socio tiene alguno de otros (el funcional a mitad de precio si además
// hace una marcial, sin tocar la marcial).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

let servidor;
let admin;
const planes = {};
const mensual = (plan) => ({ opcion_id: plan.opciones.find((o) => o.meses === 1).id });

before(async () => {
  servidor = await levantarServidor();
  admin = await registrarEmpresa(servidor, { empresa: 'Dojo Combos', usuario: 'dojocombos' });
  for (const [nombre, precio] of [['BJJ', 60000], ['MMA', 50000], ['Kickboxing', 45000], ['Funcional', 40000]]) {
    const r = await admin.post('/api/planes-socio', { nombre, opciones: [{ meses: 1, precio }, { meses: 3, precio: precio * 3 }] });
    assert.equal(r.status, 201, r.texto);
    planes[nombre] = r.json;
  }
});

after(async () => {
  await servidor?.cerrar();
});

const cotizar = async (...nombres) => (await admin.post('/api/socios/cotizacion', { planes: nombres.map((n) => mensual(planes[n])) })).json;

test('un combo con precio fijo cobra justo ese precio por mes', async () => {
  const combo = { nombre: 'Promo BJJ + MMA', aplica: 'combo', planes: [planes.BJJ.id, planes.MMA.id], precio_combo: 80000 };
  assert.equal((await admin.post('/api/descuentos-socio', { ...combo, precio_combo: 110000 })).status, 400, 'no más caro que los planes');
  assert.equal((await admin.post('/api/descuentos-socio', { ...combo, precio_combo: 0 })).status, 400);
  const r = await admin.post('/api/descuentos-socio', combo);
  assert.equal(r.status, 201, r.texto);
  assert.equal(r.json.precio_combo, 80000);
  const c = await cotizar('BJJ', 'MMA');
  assert.equal(c.total, 80000);
  // Solo uno de los dos: precio de lista.
  assert.equal((await cotizar('BJJ')).total, 60000);
  // Si sube un plan, el combo sigue costando lo mismo.
  await admin.patch(`/api/planes-socio/${planes.BJJ.id}`, { opciones: [{ meses: 1, precio: 66000 }, { meses: 3, precio: 198000 }] });
  assert.equal((await cotizar('BJJ', 'MMA')).total, 80000);
});

test('un combo puede bajar solo un plan si el socio tiene alguno de otros', async () => {
  const funcional = {
    nombre: 'Funcional sumado a una marcial',
    aplica: 'combo',
    porcentaje: 50,
    planes: [planes.Funcional.id],
    alguno: [planes.BJJ.id, planes.MMA.id, planes.Kickboxing.id]
  };
  assert.equal((await admin.post('/api/descuentos-socio', { ...funcional, planes: [] })).status, 400, 'alguno tiene que bajar');
  assert.equal((await admin.post('/api/descuentos-socio', { ...funcional, alguno: [planes.Funcional.id] })).status, 400, 'un plan en los dos lados');
  const r = await admin.post('/api/descuentos-socio', funcional);
  assert.equal(r.status, 201, r.texto);
  assert.deepEqual(
    r.json.planes.map((p) => [p.nombre, p.rol]).sort(),
    [['BJJ', 'alguno'], ['Funcional', 'baja'], ['Kickboxing', 'alguno'], ['MMA', 'alguno']]
  );
  // Con Kickboxing: el funcional a la mitad, el kick a precio de lista.
  const c = await cotizar('Funcional', 'Kickboxing');
  assert.deepEqual(c.lineas.map((l) => [l.plan, l.precio]), [['Funcional', 20000], ['Kickboxing', 45000]]);
  // Solo funcional: sin descuento.
  assert.equal((await cotizar('Funcional')).total, 40000);
  // BJJ + MMA + Funcional: el combo de precio fijo y el funcional a la mitad.
  assert.equal((await cotizar('BJJ', 'MMA', 'Funcional')).total, 100000);
});

test('el socio paga lo del combo en sus cuotas', async () => {
  const alta = await admin.post('/api/socios', {
    cliente: { nombre: 'Socio Combo', documento: '30999111' },
    planes: [mensual(planes.BJJ), mensual(planes.MMA)]
  });
  assert.equal(alta.status, 201, alta.texto);
  assert.equal(alta.json.deuda, 80000);
});

// "No vienen" (hist. §203): de un socio que ya venía se carga la última vez
// que vino, y queda como su último ingreso.
test('el alta de un socio que ya venía guarda la última vez que vino', async () => {
  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });
  const dias = (n) => {
    const d = new Date(`${hoy}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const cuerpo = { cliente: { nombre: 'Tomás Marcos' }, planes: [mensual(planes.MMA)], fecha_alta: dias(-120) };
  assert.equal((await admin.post('/api/socios', { ...cuerpo, ultima_vez: dias(1) })).status, 400, 'no a futuro');
  assert.equal((await admin.post('/api/socios', { ...cuerpo, ultima_vez: dias(-200) })).status, 400, 'no antes del alta');
  const r = await admin.post('/api/socios', { ...cuerpo, ultima_vez: dias(-60) });
  assert.equal(r.status, 201, r.texto);
  const socio = (await admin.get('/api/socios')).json.find((s) => s.id === r.json.id);
  assert.equal(socio.ultimo_ingreso.slice(0, 10), dias(-60));
});
