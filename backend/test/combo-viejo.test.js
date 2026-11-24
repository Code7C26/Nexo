// Los combos de precio fijo de antes de hist. §208 (hist. §232): cada plan del
// combo iba en su venta, y la ficha y Socios → Cuotas mostraban el precio
// repartido ($43.636,36 + $36.363,64). Las cuotas del mismo socio, combo y
// período van en un cobro: una fila con el precio del combo, que se cobra de
// una vez. El test arma uno partiendo la venta de un combo de ahora, como
// quedaron las de Morro.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

import { levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

const carpeta = mkdtempSync(path.join(tmpdir(), 'nexo-combo-viejo-'));
const dbPath = path.join(carpeta, 'nexo.db');
let servidor;
let admin;
let socio;
let ventas;
const mensual = (plan) => ({ opcion_id: plan.opciones.find((o) => o.meses === 1).id });

before(async () => {
  servidor = await levantarServidor({ dbPath });
  admin = await registrarEmpresa(servidor, { empresa: 'Dojo Combo Viejo', usuario: 'dojocomboviejo' });
  const planes = {};
  for (const [nombre, precio] of [['BJJ', 60000], ['MMA', 50000]]) {
    planes[nombre] = (await admin.post('/api/planes-socio', { nombre, opciones: [{ meses: 1, precio }] })).json;
  }
  const combo = await admin.post('/api/descuentos-socio', {
    nombre: 'Promo BJJ + MMA',
    aplica: 'combo',
    planes: [planes.BJJ.id, planes.MMA.id],
    precio_combo: 80000
  });
  assert.equal(combo.status, 201, combo.texto);
  const alta = await admin.post('/api/socios', {
    cliente: { nombre: 'Combo Viejo', documento: '30222111' },
    planes: [mensual(planes.BJJ), mensual(planes.MMA)]
  });
  assert.equal(alta.status, 201, alta.texto);
  socio = alta.json;

  // Como antes de §208: MMA pasa a su propia venta, con su renglón y su cuota.
  const base = new DatabaseSync(dbPath);
  const ventaBjj = socio.cuotas[0].venta_id;
  const mma = socio.cuotas.find((c) => c.plan === 'MMA');
  const columnas = base
    .prepare('PRAGMA table_info(ventas)')
    .all()
    .map((c) => c.name)
    .filter((c) => c !== 'id')
    .join(', ');
  const ventaMma = Number(base.prepare(`INSERT INTO ventas (${columnas}) SELECT ${columnas} FROM ventas WHERE id = ?`).run(ventaBjj).lastInsertRowid);
  base
    .prepare(
      `UPDATE venta_items SET venta_id = ?
        WHERE venta_id = ? AND producto_id = (SELECT producto_id FROM planes_socio WHERE id = ?)`
    )
    .run(ventaMma, ventaBjj, planes.MMA.id);
  base.prepare('UPDATE cuotas_socio SET venta_id = ? WHERE id = ?').run(ventaMma, mma.id);
  base.close();
  ventas = [ventaBjj, ventaMma];
});

after(async () => {
  await servidor?.cerrar();
  rmSync(carpeta, { recursive: true, force: true });
});

test('la ficha: las dos cuotas del combo son un cobro, y debe una cuota de $ 80.000', async () => {
  const ficha = (await admin.get(`/api/socios/${socio.id}`)).json;
  assert.deepEqual(new Set(ficha.cuotas.map((c) => c.venta_id)), new Set(ventas), 'siguen siendo dos ventas');
  assert.deepEqual(
    ficha.cuotas.map((c) => c.cobro),
    [Math.min(...ventas), Math.min(...ventas)],
    'un solo cobro'
  );
  assert.equal(ficha.deuda, 80000);
  assert.equal(ficha.cuotas_impagas, 1);
});

test('Socios → Cuotas: una fila con el precio del combo, que se cobra de una vez', async () => {
  const fila = (await admin.get('/api/socios/cuotas')).json.cuotas.find((c) => c.socio_id === socio.id);
  assert.deepEqual(
    [fila.planes, fila.ventas.sort(), fila.importe, fila.saldo, fila.estado],
    [['BJJ', 'MMA'], [...ventas].sort(), 80000, 80000, 'pendiente']
  );
  const cuenta = (await admin.get('/api/cuentas-tesoreria')).json[0];
  const cobro = await admin.post(`/api/socios/${socio.id}/cobros`, { cuenta_tesoreria_id: cuenta.id, venta_ids: fila.ventas });
  assert.equal(cobro.status, 201, cobro.texto);
  assert.equal(cobro.json.cobrado, 80000);
  assert.equal(cobro.json.socio.deuda, 0);
  const pagada = (await admin.get('/api/socios/cuotas')).json.cuotas.find((c) => c.socio_id === socio.id);
  assert.deepEqual([pagada.estado, pagada.saldo, pagada.cobrado], ['pagada', 0, 80000]);
});
