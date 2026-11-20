// Un cobro por socio y por período (hist. §208): los planes de un socio que
// empiezan el mismo día van en una sola venta, un renglón por plan, como en
// los sistemas de gimnasios. Un plan que se suma a mitad de período paga los
// días hasta el vencimiento de los otros, y después va en la misma cuota.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

let servidor;
let admin;
const planes = {};
const mensual = (plan) => ({ opcion_id: plan.opciones.find((o) => o.meses === 1).id });

// Las fechas del día de la Argentina (UTC-3), como fechaDeHoy() del servidor.
const haceDias = (n) => new Date(Date.now() - 3 * 3600 * 1000 - n * 86400000).toISOString().slice(0, 10);
const dias = (desde, hasta) => (Date.parse(hasta) - Date.parse(desde)) / 86400000 + 1;

before(async () => {
  servidor = await levantarServidor();
  admin = await registrarEmpresa(servidor, { empresa: 'Dojo Una Cuota', usuario: 'dojounacuota' });
  for (const [nombre, precio] of [['BJJ', 60000], ['MMA', 50000]]) {
    const r = await admin.post('/api/planes-socio', { nombre, opciones: [{ meses: 1, precio }, { meses: 3, precio: precio * 3 }] });
    assert.equal(r.status, 201, r.texto);
    planes[nombre] = r.json;
  }
  const combo = await admin.post('/api/descuentos-socio', {
    nombre: 'Promo BJJ + MMA',
    aplica: 'combo',
    planes: [planes.BJJ.id, planes.MMA.id],
    precio_combo: 80000
  });
  assert.equal(combo.status, 201, combo.texto);
});

after(async () => {
  await servidor?.cerrar();
});

test('un combo es una sola cuota: una venta con un renglón por plan, y un solo cobro', async () => {
  const alta = await admin.post('/api/socios', {
    cliente: { nombre: 'Peludo', documento: '30111222' },
    planes: [mensual(planes.BJJ), mensual(planes.MMA)]
  });
  assert.equal(alta.status, 201, alta.texto);
  const socio = alta.json;
  assert.equal(socio.deuda, 80000);
  assert.equal(socio.cuotas_impagas, 1, 'una cuota, no una por plan');
  assert.equal(socio.cuotas.length, 2, 'cada plan sigue teniendo su fila');
  const [ventaId] = new Set(socio.cuotas.map((c) => c.venta_id));
  assert.ok(socio.cuotas.every((c) => c.venta_id === ventaId), 'las dos en la misma venta');
  assert.equal(socio.cuotas.reduce((acc, c) => acc + c.importe, 0), 80000);

  const venta = (await admin.get(`/api/ventas/${ventaId}`)).json;
  assert.deepEqual(venta.items.map((i) => i.producto).sort(), ['BJJ', 'MMA']);

  const cuenta = (await admin.get('/api/cuentas-tesoreria')).json[0];
  const cobro = await admin.post(`/api/socios/${socio.id}/cobros`, { cuenta_tesoreria_id: cuenta.id });
  assert.equal(cobro.status, 201, cobro.texto);
  assert.deepEqual([cobro.json.cobrado, cobro.json.cuotas], [80000, 1]);
  assert.equal(cobro.json.socio.deuda, 0);
  assert.ok(cobro.json.socio.cuotas.every((c) => c.estado === 'pagada'));
  // El total una sola vez: cobrar el saldo de la venta por cada plan daría 160.000.
  assert.equal((await admin.get(`/api/ventas/${ventaId}`)).json.cobrado, 80000);
});

test('un plan que se suma a mitad de período paga los días hasta el vencimiento del otro', async () => {
  const alta = await admin.post('/api/socios', {
    cliente: { nombre: 'Franco', documento: '30111333' },
    planes: [mensual(planes.BJJ)],
    fecha_alta: haceDias(40)
  });
  assert.equal(alta.status, 201, alta.texto);
  const [bjj] = alta.json.cuotas;
  assert.ok(bjj.desde < haceDias(5) && bjj.hasta >= haceDias(0), 'el período de hoy');

  const suma = await admin.post(`/api/socios/${alta.json.id}/planes`, { ...mensual(planes.MMA), fecha_alta: haceDias(5) });
  assert.equal(suma.status, 201, suma.texto);
  const mma = suma.json.cuotas.find((c) => c.plan === 'MMA');
  assert.deepEqual([mma.desde, mma.hasta], [haceDias(5), bjj.hasta], 'hasta el vencimiento de BJJ');
  // Con los dos, el combo: MMA vale su parte de los $ 80.000, por los días que le tocan.
  const precioMes = 80000 * (50000 / 110000);
  assert.ok(Math.abs(mma.importe - (precioMes * dias(haceDias(5), bjj.hasta)) / dias(bjj.desde, bjj.hasta)) < 0.02, `${mma.importe}`);
  assert.notEqual(mma.venta_id, bjj.venta_id, 'la parte de los días va aparte');
  // Desde el próximo período, los dos empiezan el mismo día.
  const plan = suma.json.planes.find((p) => p.plan === 'MMA');
  const proximo = new Date(Date.parse(bjj.hasta) + 86400000).toISOString().slice(0, 10);
  assert.equal(plan.ciclo_desde, proximo);
});

test('dar de baja al que dejó de venir anula su cuota una sola vez, aunque tenga dos planes', async () => {
  const alta = await admin.post('/api/socios', {
    cliente: { nombre: 'Se fue', documento: '30111444' },
    planes: [mensual(planes.BJJ), mensual(planes.MMA)],
    fecha_alta: haceDias(70)
  });
  assert.equal(alta.status, 201, alta.texto);
  const socio = (await admin.get(`/api/socios/${alta.json.id}`)).json;
  assert.ok(socio.parece_que_dejo, 'no vino nunca y debe');
  assert.equal(socio.parece_que_dejo.cuotas.length, 1, 'una cuota con los dos planes');
  assert.equal(socio.parece_que_dejo.cuotas[0].plan, 'BJJ y MMA');

  const baja = await admin.patch(`/api/socios/${socio.id}`, { estado: 'baja', bonificar_sin_venir: true });
  assert.equal(baja.status, 200, baja.texto);
  assert.equal(baja.json.deuda, 0);
  assert.ok(baja.json.cuotas.every((c) => c.estado === 'bonificada'));
});
