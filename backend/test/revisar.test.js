// "Para revisar" en el Resumen (hist. §213): lo que salió raro en la última
// semana, cada aviso con sus datos. Va aparte porque cada archivo levanta su
// servidor.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';
import { fechaDeHoy } from '../fecha.js';

let servidor;
let kiosco;
let otro;
let yerba;
let caja;

const hace = (dias) => {
  const d = new Date(`${fechaDeHoy()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
};
const revisar = async (n) => {
  const r = await n.get('/api/reportes/tablero');
  assert.equal(r.status, 200, r.texto);
  return r.json.revisar;
};
const comprar = async (costo, fecha) => {
  const r = await kiosco.post('/api/compras', { proveedor: 'Mayorista', fecha, items: [{ producto: 'Yerba', cantidad: 10, precio_unitario: costo }] });
  assert.equal(r.status, 201, r.texto);
  assert.equal((await kiosco.post(`/api/compras/${r.json.id}/confirmar`, {})).status, 200);
};

before(async () => {
  servidor = await levantarServidor();
  kiosco = await registrarEmpresa(servidor, { empresa: 'Kiosco Revisar', usuario: 'kioscorevisar', extra: { rubro: 'kiosco' } });
  otro = await registrarEmpresa(servidor, { empresa: 'Otro Revisar', usuario: 'otrorevisar', extra: { rubro: 'kiosco' } });
  yerba = (await kiosco.post('/api/productos', { nombre: 'Yerba', precio_venta: 2000 })).json.id;
  caja = (await kiosco.get('/api/cuentas-tesoreria')).json.find((c) => c.tipo === 'efectivo');
});

after(async () => {
  await servidor?.cerrar();
});

test('sin nada raro, no hay avisos', async () => {
  assert.deepEqual(await revisar(kiosco), []);
});

test('el costo subió y el precio no, hasta que se toca el precio', async () => {
  await comprar(1000, hace(12));
  // Menos del 5 %: no avisa.
  await comprar(1040, hace(1));
  assert.deepEqual(await revisar(kiosco), []);

  await comprar(1240, fechaDeHoy());
  const [aviso] = await revisar(kiosco);
  // Lo de la última semana, ponderado: (1040 + 1240) / 2 = 1140, un 14 % más.
  assert.deepEqual(aviso, { clave: 'costo', id: yerba, nombre: 'Yerba', costo_antes: 1000, costo_nuevo: 1140, suba: 14 });

  // Un cambio de otra cosa no cuenta; uno del precio, sí.
  assert.equal((await kiosco.patch(`/api/productos/${yerba}`, { stock_minimo: 3 })).status, 200);
  assert.equal((await revisar(kiosco)).length, 1);
  assert.equal((await kiosco.patch(`/api/productos/${yerba}`, { precio_venta: 2300 })).status, 200);
  assert.deepEqual(await revisar(kiosco), []);
  // Es de este negocio: el otro no ve nada.
  assert.deepEqual(await revisar(otro), []);
});

test('la caja: abrir con otra plata, un faltante grande y una caja que nadie cerró', async () => {
  const hoy = fechaDeHoy();
  // Abre con $30.000 cuando la caja estaba en cero.
  const turno = (await kiosco.post('/api/turnos-caja', { cuenta_tesoreria_id: caja.id, contado: 30000 })).json;
  // Cierra con $10.000 menos de lo que tenía que haber: menos que el umbral.
  assert.equal((await kiosco.post(`/api/turnos-caja/${turno.id}/cerrar`, { contado: 20000 })).status, 200);
  assert.deepEqual(await revisar(kiosco), [{ clave: 'apertura', caja: caja.nombre, fecha: hoy, importe: 30000 }]);

  // Otro turno el mismo día, con $16.000 de faltante: el día ya suma $26.000.
  const segundo = (await kiosco.post('/api/turnos-caja', { cuenta_tesoreria_id: caja.id, contado: 20000 })).json;
  assert.equal((await kiosco.post(`/api/turnos-caja/${segundo.id}/cerrar`, { contado: 4000 })).status, 200);
  const avisos = await revisar(kiosco);
  assert.deepEqual(avisos.find((a) => a.clave === 'faltante'), { clave: 'faltante', caja: caja.nombre, fecha: hoy, importe: 26000 });

  // Una caja que quedó abierta desde anteayer.
  const tercero = (await kiosco.post('/api/turnos-caja', { cuenta_tesoreria_id: caja.id, contado: 4000 })).json;
  const base = new DatabaseSync(path.join(servidor.dir, 'nexo.db'));
  try {
    base.prepare("UPDATE turnos_caja SET abierto_en = datetime('now', '-2 days') WHERE id = ?").run(tercero.id);
  } finally {
    base.close();
  }
  const abierta = (await revisar(kiosco)).find((a) => a.clave === 'abierta');
  assert.equal(abierta.caja, caja.nombre);
  assert.ok(abierta.fecha < hoy, abierta.fecha);
  assert.deepEqual(await revisar(otro), []);
});
