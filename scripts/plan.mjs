// Ver y cambiar el plan de un negocio (hist. §98): `npm run plan` desde la raíz.
//
//   npm run plan                                   lista los negocios con su plan
//   npm run plan -- --ver 3                        el plan del negocio 3
//   npm run plan -- --negocio 3 --plan pro --hasta 2026-12-31
//   npm run plan -- --negocio 3 --plan gratis      (sin --hasta: no vence)
//
// Es la administración de la plataforma mientras no haya un panel ni cobro
// online: quien paga un plan se activa a mano en el servidor. No es una ruta
// de la API a propósito: ningún negocio puede cambiarse el plan a sí mismo, y
// nadie con una sesión puede tocar el de otro (CLAUDE.md §28).
//
// Abre la base directo (NEXO_DB_PATH o backend/db/nexo.db) y no importa
// db/index.js: así no corre las migraciones ni el respaldo mientras el servidor
// sigue andando. El cambio queda en la auditoría del negocio, con actor
// "sistema".
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import path from 'node:path';

import { rutasDeRespaldo } from '../backend/db/respaldo.js';
import { PLANES, esPlan, planEfectivo } from '../backend/planes.js';
import { fechaDeHoy } from '../backend/fecha.js';

const { values } = parseArgs({
  options: {
    negocio: { type: 'string' },
    plan: { type: 'string' },
    hasta: { type: 'string' },
    ver: { type: 'string' }
  }
});

function salir(mensaje) {
  console.error(mensaje);
  process.exit(1);
}

const dirDb = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'backend', 'db');
const { dbPath } = rutasDeRespaldo(dirDb);
if (!existsSync(dbPath)) salir(`No hay base en ${dbPath}.`);
const db = new DatabaseSync(dbPath);
// El servidor puede estar escribiendo: se espera en vez de fallar al toque.
db.exec('PRAGMA busy_timeout = 5000');

const hoy = fechaDeHoy();

function describir(fila) {
  const rige = planEfectivo(fila, hoy);
  const vence = fila.plan_vence ? `hasta el ${fila.plan_vence}` : 'sin vencimiento';
  const aviso = rige !== fila.plan ? ` (venció: rige ${PLANES[rige].nombre})` : '';
  return `#${fila.id} ${fila.nombre} — ${PLANES[fila.plan]?.nombre ?? fila.plan}, ${vence}${aviso}`;
}

const buscar = db.prepare('SELECT id, nombre, plan, plan_vence FROM organizaciones WHERE id = ?');

if (values.ver) {
  const fila = buscar.get(Number(values.ver));
  if (!fila) salir(`No existe el negocio #${values.ver}.`);
  console.log(describir(fila));
} else if (values.negocio) {
  const fila = buscar.get(Number(values.negocio));
  if (!fila) salir(`No existe el negocio #${values.negocio}.`);
  if (!esPlan(values.plan)) salir(`Plan inválido. Los planes son: ${Object.keys(PLANES).join(', ')}.`);
  const hasta = values.hasta ?? null;
  if (hasta !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(hasta) || Number.isNaN(Date.parse(hasta)))) {
    salir('--hasta tiene que ser una fecha AAAA-MM-DD.');
  }
  const anterior = { plan: fila.plan, plan_vence: fila.plan_vence };
  const nuevo = { plan: values.plan, plan_vence: hasta };
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE organizaciones SET plan = ?, plan_vence = ? WHERE id = ?').run(nuevo.plan, nuevo.plan_vence, fila.id);
    db.prepare(
      `INSERT INTO auditoria (actor, accion, entidad, entidad_id, valor_anterior, valor_nuevo, detalle, organizacion_id)
       VALUES ('sistema', 'editar', 'organizacion', ?, ?, ?, ?, ?)`
    ).run(
      fila.id,
      JSON.stringify(anterior),
      JSON.stringify(nuevo),
      `Plan cambiado a ${PLANES[nuevo.plan].nombre}${hasta ? ` hasta el ${hasta}` : ' sin vencimiento'}`,
      fila.id
    );
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  console.log(describir(buscar.get(fila.id)));
} else {
  for (const fila of db.prepare('SELECT id, nombre, plan, plan_vence FROM organizaciones ORDER BY id').all()) {
    console.log(describir(fila));
  }
}
db.close();
