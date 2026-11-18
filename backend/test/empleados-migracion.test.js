// La migración de arranque de hist. §199: horarios y fichajes eran de la
// cuenta (hist. §196) y pasan a ser del empleado. Cada cuenta con horario o
// fichajes en un negocio pasa a ser un empleado de ese negocio, vinculado a su
// cuenta, y sus filas siguen con los mismos id. Se prueba rearmando las dos
// tablas como estaban y reabriendo la base, como un arranque con datos de
// antes. Va aparte porque levanta dos servidores.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

test('los horarios y fichajes de cada cuenta pasan a su empleado', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'nexo-mig-'));
  const dbPath = path.join(dir, 'nexo.db');
  try {
    const primero = await levantarServidor({ dbPath });
    await registrarEmpresa(primero, { empresa: 'Kiosco Viejo', usuario: 'kioscoviejo', nombre: 'Dueña' });
    await primero.cerrar();

    // Las dos tablas como eran en hist. §196, con un horario y dos fichajes.
    const base = new DatabaseSync(dbPath);
    const { id: usuarioId, organizacion_id: orgId } = base.prepare("SELECT id, organizacion_id FROM usuarios WHERE nombre = 'Dueña'").get();
    base.exec(`
      DROP TABLE horarios;
      DROP TABLE fichajes;
      CREATE TABLE horarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
        organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id),
        dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
        desde TEXT NOT NULL,
        hasta TEXT NOT NULL,
        CHECK (hasta > desde)
      );
      CREATE TABLE fichajes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
        organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id),
        entrada TEXT NOT NULL,
        salida TEXT,
        corregido_por INTEGER REFERENCES usuarios(id),
        CHECK (salida IS NULL OR salida > entrada)
      );
      CREATE UNIQUE INDEX idx_fichajes_abierto ON fichajes(usuario_id, organizacion_id) WHERE salida IS NULL;
    `);
    base.prepare("INSERT INTO horarios (id, usuario_id, organizacion_id, dia_semana, desde, hasta) VALUES (7, ?, ?, 0, '09:00', '13:00')").run(usuarioId, orgId);
    base.prepare("INSERT INTO fichajes (id, usuario_id, organizacion_id, entrada, salida) VALUES (4, ?, ?, '2026-11-17 12:00:00', '2026-11-17 16:00:00')").run(usuarioId, orgId);
    base.prepare("INSERT INTO fichajes (id, usuario_id, organizacion_id, entrada) VALUES (5, ?, ?, '2026-11-18 12:00:00')").run(usuarioId, orgId);
    base.close();

    const segundo = await levantarServidor({ dbPath });
    await segundo.cerrar();

    const despues = new DatabaseSync(dbPath);
    const empleados = despues.prepare('SELECT id, nombre, usuario_id FROM empleados WHERE organizacion_id = ?').all(orgId);
    assert.equal(empleados.length, 1);
    assert.equal(empleados[0].nombre, 'Dueña');
    assert.equal(empleados[0].usuario_id, usuarioId);
    assert.deepEqual(
      despues.prepare('SELECT id, empleado_id FROM horarios').all().map((f) => ({ ...f })),
      [{ id: 7, empleado_id: empleados[0].id }]
    );
    assert.deepEqual(
      despues.prepare('SELECT id, empleado_id, salida IS NULL AS abierto FROM fichajes ORDER BY id').all().map((f) => ({ ...f })),
      [
        { id: 4, empleado_id: empleados[0].id, abierto: 0 },
        { id: 5, empleado_id: empleados[0].id, abierto: 1 }
      ]
    );
    assert.ok(!despues.prepare('PRAGMA table_info(fichajes)').all().some((c) => c.name === 'usuario_id'));
    // Sigue habiendo una sola abierta por empleado.
    assert.throws(() =>
      despues.prepare("INSERT INTO fichajes (empleado_id, organizacion_id, entrada) VALUES (?, ?, '2026-11-18 13:00:00')").run(empleados[0].id, orgId)
    );
    despues.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
