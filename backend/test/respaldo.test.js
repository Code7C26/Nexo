// Respaldo automático de la base (CLAUDE.md §35). Todo corre sobre bases
// temporales: este test nunca toca backend/db/nexo.db.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { respaldarBase } from '../db/respaldo.js';

function carpetaTemporal() {
  return mkdtempSync(path.join(tmpdir(), 'nexo-respaldo-'));
}

function crearBase(dir, filas = 1) {
  const archivo = path.join(dir, 'origen.db');
  const base = new DatabaseSync(archivo);
  base.exec('CREATE TABLE cosas (id INTEGER PRIMARY KEY, nombre TEXT)');
  for (let i = 0; i < filas; i++) base.prepare('INSERT INTO cosas (nombre) VALUES (?)').run(`c${i}`);
  base.close();
  return archivo;
}

const unSegundoDespues = (n) => new Date(Date.UTC(2026, 9, 6, 12, 0, n));

test('no hay nada que respaldar si la base todavía no existe (primer arranque)', () => {
  const dir = carpetaTemporal();
  try {
    const r = respaldarBase({ dbPath: path.join(dir, 'no-existe.db'), dir: path.join(dir, 'resp') });
    assert.equal(r.creado, false);
    assert.equal(r.motivo, 'sin-base');
    assert.equal(existsSync(path.join(dir, 'no-existe.db')), false, 'no debe crear la base');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('respalda una base existente y el respaldo se puede abrir con los mismos datos', () => {
  const dir = carpetaTemporal();
  try {
    const dbPath = crearBase(dir, 3);
    const r = respaldarBase({ dbPath, dir: path.join(dir, 'resp'), ahora: unSegundoDespues(0) });
    assert.equal(r.creado, true);
    const copia = new DatabaseSync(r.archivo, { readOnly: true });
    assert.equal(copia.prepare('SELECT COUNT(*) AS n FROM cosas').get().n, 3);
    copia.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('si la base no cambió desde el último respaldo, no crea otro', () => {
  const dir = carpetaTemporal();
  try {
    const dbPath = crearBase(dir);
    const resp = path.join(dir, 'resp');
    respaldarBase({ dbPath, dir: resp, ahora: unSegundoDespues(0) });
    const r = respaldarBase({ dbPath, dir: resp, ahora: unSegundoDespues(1) });
    assert.equal(r.creado, false);
    assert.equal(r.motivo, 'sin-cambios');
    assert.equal(readdirSync(resp).length, 1, 'no deja temporales ni duplicados');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('si la base cambió, crea un respaldo nuevo', () => {
  const dir = carpetaTemporal();
  try {
    const dbPath = crearBase(dir);
    const resp = path.join(dir, 'resp');
    respaldarBase({ dbPath, dir: resp, ahora: unSegundoDespues(0) });
    const base = new DatabaseSync(dbPath);
    base.prepare('INSERT INTO cosas (nombre) VALUES (?)').run('nueva');
    base.close();
    const r = respaldarBase({ dbPath, dir: resp, ahora: unSegundoDespues(1) });
    assert.equal(r.creado, true);
    assert.equal(readdirSync(resp).length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('recrear una vista (lo que hace db/index.js en cada arranque) no cuenta como cambio', () => {
  const dir = carpetaTemporal();
  try {
    const dbPath = crearBase(dir);
    const resp = path.join(dir, 'resp');
    const recrearVista = () => {
      const base = new DatabaseSync(dbPath);
      base.exec('DROP VIEW IF EXISTS vista_cosas; CREATE VIEW vista_cosas AS SELECT id FROM cosas');
      base.close();
    };
    recrearVista();
    respaldarBase({ dbPath, dir: resp, ahora: unSegundoDespues(0) });
    recrearVista();
    recrearVista();
    const r = respaldarBase({ dbPath, dir: resp, ahora: unSegundoDespues(1) });
    assert.equal(r.creado, false);
    assert.equal(r.motivo, 'sin-cambios');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('dos respaldos en el mismo segundo no se pisan entre sí', () => {
  const dir = carpetaTemporal();
  try {
    const dbPath = crearBase(dir);
    const resp = path.join(dir, 'resp');
    const ahora = unSegundoDespues(0);
    respaldarBase({ dbPath, dir: resp, ahora });
    const base = new DatabaseSync(dbPath);
    base.prepare('INSERT INTO cosas (nombre) VALUES (?)').run('otra');
    base.close();
    const r = respaldarBase({ dbPath, dir: resp, ahora });
    assert.equal(r.creado, true);
    assert.equal(readdirSync(resp).length, 2, 'el primero sigue ahí');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('conserva solo los últimos N respaldos y borra los más viejos', () => {
  const dir = carpetaTemporal();
  try {
    const dbPath = crearBase(dir);
    const resp = path.join(dir, 'resp');
    for (let i = 0; i < 4; i++) {
      const base = new DatabaseSync(dbPath);
      base.prepare('INSERT INTO cosas (nombre) VALUES (?)').run(`v${i}`);
      base.close();
      respaldarBase({ dbPath, dir: resp, conservar: 2, ahora: unSegundoDespues(i) });
    }
    const quedan = readdirSync(resp).sort();
    assert.equal(quedan.length, 2);
    assert.match(quedan[0], /120002/);
    assert.match(quedan[1], /120003/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('si el reloj retrocede, la rotación no borra el respaldo que acaba de crear', () => {
  const dir = carpetaTemporal();
  try {
    const dbPath = crearBase(dir);
    const resp = path.join(dir, 'resp');
    for (const n of [10, 11]) {
      const base = new DatabaseSync(dbPath);
      base.prepare('INSERT INTO cosas (nombre) VALUES (?)').run(`v${n}`);
      base.close();
      respaldarBase({ dbPath, dir: resp, conservar: 2, ahora: unSegundoDespues(n) });
    }
    const base = new DatabaseSync(dbPath);
    base.prepare('INSERT INTO cosas (nombre) VALUES (?)').run('reloj-atrasado');
    base.close();
    const r = respaldarBase({ dbPath, dir: resp, conservar: 2, ahora: new Date(Date.UTC(2000, 0, 1)) });
    assert.equal(r.creado, true);
    assert.ok(existsSync(r.archivo), 'el respaldo nuevo tiene que existir');
    assert.equal(readdirSync(resp).length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('si no se puede borrar un respaldo viejo, el respaldo nuevo igual se crea', () => {
  const dir = carpetaTemporal();
  try {
    const dbPath = crearBase(dir);
    const resp = path.join(dir, 'resp');
    // Un directorio con nombre de respaldo no se puede borrar sin recursive:
    // rmSync tira, igual que con un archivo bloqueado por otro proceso en Windows.
    const imborrable = path.join(resp, 'nexo-20200101-000000.db');
    mkdirSync(imborrable, { recursive: true });
    writeFileSync(path.join(imborrable, 'x'), 'x');
    const r = respaldarBase({ dbPath, dir: resp, conservar: 1, ahora: unSegundoDespues(0) });
    assert.equal(r.creado, true);
    assert.ok(existsSync(r.archivo));
    assert.deepEqual(r.noEliminados, ['nexo-20200101-000000.db']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('si la base viva está dentro de la carpeta de respaldos, no se compara ni se rota a sí misma', () => {
  const dir = carpetaTemporal();
  try {
    const resp = path.join(dir, 'resp');
    mkdirSync(resp);
    const viva = path.join(resp, 'nexo-20200101-000000.db');
    const base = new DatabaseSync(viva);
    base.exec('CREATE TABLE cosas (id INTEGER PRIMARY KEY)');
    base.close();
    const r = respaldarBase({ dbPath: viva, dir: resp, conservar: 1, ahora: unSegundoDespues(0) });
    assert.equal(r.creado, true, 'no puede darse por "sin cambios" contra sí misma');
    assert.ok(existsSync(viva), 'la base viva no se borra');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('un respaldo anterior truncado o vacío no bloquea el siguiente', () => {
  const dir = carpetaTemporal();
  try {
    const dbPath = crearBase(dir);
    const resp = path.join(dir, 'resp');
    mkdirSync(resp);
    writeFileSync(path.join(resp, 'nexo-20200101-000000.db'), '');
    const r = respaldarBase({ dbPath, dir: resp, ahora: unSegundoDespues(0) });
    assert.equal(r.creado, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('la rotación no toca archivos ajenos que viven en la misma carpeta', () => {
  const dir = carpetaTemporal();
  try {
    const dbPath = crearBase(dir);
    const resp = path.join(dir, 'resp');
    respaldarBase({ dbPath, dir: resp, conservar: 1, ahora: unSegundoDespues(0) });
    writeFileSync(path.join(resp, 'notas.txt'), 'no me borres');
    const base = new DatabaseSync(dbPath);
    base.prepare('INSERT INTO cosas (nombre) VALUES (?)').run('otra');
    base.close();
    respaldarBase({ dbPath, dir: resp, conservar: 1, ahora: unSegundoDespues(1) });
    assert.ok(existsSync(path.join(resp, 'notas.txt')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('un archivo que no es una base SQLite falla en voz alta y no deja temporales', () => {
  const dir = carpetaTemporal();
  try {
    const dbPath = path.join(dir, 'roto.db');
    writeFileSync(dbPath, 'esto no es sqlite, ni cerca');
    const resp = path.join(dir, 'resp');
    assert.throws(() => respaldarBase({ dbPath, dir: resp }));
    assert.deepEqual(existsSync(resp) ? readdirSync(resp) : [], []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
