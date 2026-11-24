// Los socios que ya venían (hist. §227): "Lo que ya tenías" › Tus socios. El
// alta de siempre con la próxima cuota y lo que debe aparte: si la próxima
// cuota es más adelante, queda al día hasta el día anterior sin inventar una
// venta; si ya pasó, se arman las cuotas que debe desde ahí.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

let servidor;
let admin;
let recepcion;
const planes = {};
const mensual = (plan) => ({ opcion_id: plan.opciones.find((o) => o.meses === 1).id });

// Las fechas del día de la Argentina (UTC-3), como fechaDeHoy() del servidor.
const haceDias = (n) => new Date(Date.now() - 3 * 3600 * 1000 - n * 86400000).toISOString().slice(0, 10);
const sumarDias = (iso, n) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);
const hoy = () => haceDias(0);

before(async () => {
  servidor = await levantarServidor();
  admin = await registrarEmpresa(servidor, { empresa: 'Dojo Que Ya Venía', usuario: 'dojoyavenia' });
  recepcion = await crearEmpleado(servidor, admin, { usuario: 'recepcionyavenia', nombre: 'Recepción' });
  for (const [nombre, precio] of [['BJJ', 60000], ['MMA', 50000]]) {
    const r = await admin.post('/api/planes-socio', { nombre, opciones: [{ meses: 1, precio }] });
    assert.equal(r.status, 201, r.texto);
    planes[nombre] = r.json;
  }
});

after(async () => {
  await servidor?.cerrar();
});

const alta = (nombre, datos) => admin.post('/api/socios', { cliente: { nombre }, planes: [mensual(planes.BJJ)], ...datos });

test('si pagó, queda al día hasta el día antes de su próxima cuota, sin ninguna venta', async () => {
  const proxima = haceDias(-10);
  const r = await alta('Ana Pagó', { fecha_alta: haceDias(200), proxima_cuota: proxima });
  assert.equal(r.status, 201, r.texto);
  assert.equal(r.json.situacion, 'al_dia');
  assert.equal(r.json.al_dia_hasta, sumarDias(proxima, -1));
  assert.equal(r.json.deuda, 0);
  assert.equal(r.json.cuotas.length, 0, 'lo de antes no es una venta');
  const [plan] = r.json.planes;
  assert.deepEqual([plan.fecha_alta, plan.ciclo_desde], [haceDias(200), proxima], 'socio desde su alta, el ciclo desde la próxima cuota');
  assert.equal((await admin.get('/api/carga-inicial')).json.socios.cantidad, 1);
});

test('si la próxima cuota ya pasó, se arman las cuotas que debe desde ahí', async () => {
  const proxima = haceDias(40);
  const r = await alta('Bruno Debe', { fecha_alta: haceDias(300), proxima_cuota: proxima });
  assert.equal(r.status, 201, r.texto);
  assert.equal(r.json.situacion, 'debe');
  assert.equal(r.json.debe_desde, proxima);
  assert.equal(r.json.cuotas_impagas, 2, 'la de hace 40 días y la del mes siguiente');
  assert.equal(r.json.deuda, 120000);
  assert.ok(r.json.planes[0].cubierto_hasta >= hoy(), 'el período de hoy ya está armado');
});

test('lo que debe aparte va a su cuenta corriente como saldo anterior', async () => {
  const r = await alta('Carla Aparte', { fecha_alta: haceDias(90), proxima_cuota: haceDias(-5), deuda_anterior: 15000 });
  assert.equal(r.status, 201, r.texto);
  assert.equal(r.json.situacion, 'al_dia', 'las cuotas están al día');
  assert.equal(r.json.saldo_cuenta, 15000);
  const saldos = (await admin.get('/api/carga-inicial/saldos')).json.clientes;
  assert.ok(saldos.some((s) => s.nombre === 'Carla Aparte' && s.importe === 15000));
});

test('las fechas que no cierran y el empleado se frenan', async () => {
  const casos = [
    [{ fecha_alta: haceDias(30), proxima_cuota: haceDias(40) }, /antes de que empezara/],
    [{ fecha_alta: haceDias(30), proxima_cuota: haceDias(-45) }, /demasiado adelante/],
    [{ fecha_alta: haceDias(900), proxima_cuota: haceDias(500) }, /más de un año/],
    [{ fecha_alta: haceDias(30), proxima_cuota: '2026-02-31' }, /no es válida/],
    [{ fecha_alta: haceDias(30), proxima_cuota: haceDias(-5), deuda_anterior: -3 }, /número/]
  ];
  for (const [datos, error] of casos) {
    const r = await alta('No Entra', datos);
    assert.equal(r.status, 400, JSON.stringify(datos));
    assert.match(r.json.error, error);
  }
  const r = await recepcion.post('/api/socios', {
    cliente: { nombre: 'Por La Recepción' },
    planes: [mensual(planes.BJJ)],
    fecha_alta: haceDias(30),
    proxima_cuota: haceDias(-5)
  });
  assert.equal(r.status, 403, r.texto);
});

test('un plan que se suma después va en la misma cuota que lo pagado antes', async () => {
  const proxima = haceDias(-10);
  const r = await alta('Dani Suma', { fecha_alta: haceDias(120), proxima_cuota: proxima });
  assert.equal(r.status, 201, r.texto);
  const suma = await admin.post(`/api/socios/${r.json.id}/planes`, { ...mensual(planes.MMA), fecha_alta: hoy() });
  assert.equal(suma.status, 201, suma.texto);
  const [mma] = suma.json.cuotas;
  assert.deepEqual([mma.desde, mma.hasta], [hoy(), sumarDias(proxima, -1)], 'los días hasta su próxima cuota');
  assert.ok(mma.importe > 0 && mma.importe < 50000, `${mma.importe}`);
  assert.equal(suma.json.planes.find((p) => p.plan === 'MMA').ciclo_desde, proxima, 'después, el mismo día que BJJ');
});

test('de baja y de vuelta, lo pagado antes no se vuelve a cobrar', async () => {
  const proxima = haceDias(-12);
  const r = await alta('Eli Vuelve', { fecha_alta: haceDias(60), proxima_cuota: proxima });
  assert.equal(r.status, 201, r.texto);
  assert.equal((await admin.patch(`/api/socios/${r.json.id}`, { estado: 'baja' })).status, 200);
  const vuelta = await admin.patch(`/api/socios/${r.json.id}`, { estado: 'activo' });
  assert.equal(vuelta.status, 200, vuelta.texto);
  assert.equal(vuelta.json.planes.find((p) => p.estado === 'activa').ciclo_desde, proxima);
  assert.equal(vuelta.json.deuda, 0);
  assert.equal(vuelta.json.situacion, 'al_dia');
});
