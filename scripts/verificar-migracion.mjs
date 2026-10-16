// Arnés de migraciones (hist. §48): `npm run verificar-migracion`.
//
// Corre backend/db/index.js tres veces sobre cada caso:
//   - una base nueva (instalar desde cero);
//   - una copia de backend/db/nexo.db (la real);
//   - una copia de cada backend/db/nexo.db.backup-* (bases de etapas viejas);
//   - y las que se pasen con --base <ruta> (se puede repetir).
// y controla, por caso:
//   1. el primer arranque no falla;
//   2. el segundo y el tercero no cambian nada: misma huella de esquema y de
//      datos (salvo `sesiones`, que el arranque limpia);
//   3. integrity_check da ok y foreign_key_check no da filas;
//   4. el esquema final es idéntico al de la base nueva: columnas, índices,
//      claves foráneas, CHECK, vistas y triggers. El bug de hist. §48 fue un
//      CHECK de schema.sql atrasado respecto del último rebuild;
//   5. en una base con datos, ninguna tabla pierde filas al migrar (salvo
//      `sesiones`): un rebuild que se olvida filas se ve acá.
// Y un control aparte sobre schema.sql (regla de hist. §48): la definición de
// cada tabla (columnas, claves foráneas, CHECK y UNIQUE) tiene que ser la
// final. Si un CHECK está atrasado, una base nueva dispara rebuilds viejos
// para llegar: hoy terminan bien, pero el cuerpo de un rebuild es una foto de
// la tabla del día en que se escribió, y el control 4 no lo vería. Una columna
// que solo suma un ALTER deja a schema.sql describiendo una tabla que no
// existe. Quedan afuera los CREATE INDEX y las vistas: varios referencian
// columnas que una base vieja recibe por ALTER, así que en schema.sql (que
// corre antes) fallarían con "no such column"; viven en db/index.js y los
// cubre el control 4.
//
// Todo pasa en una carpeta temporal: las bases de origen se copian de solo
// lectura (scripts/lib/base-real.mjs) y el md5 de la real se compara al final.
// Si algún caso falla, la carpeta queda para inspeccionarla.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { DatabaseSync } from 'node:sqlite';

import { copiarBase, md5, raiz, rutaBaseReal } from './lib/base-real.mjs';

const dirDb = path.join(raiz, 'backend', 'db');
const moduloDb = pathToFileURL(path.join(dirDb, 'index.js')).href;
const SIN_CONTROL_DE_DATOS = new Set(['sesiones']);

const { values: op } = parseArgs({ options: { base: { type: 'string', multiple: true, default: [] } } });

// --- Huella de una base --------------------------------------------------------

const sinEspacios = (sql) => (sql ?? '').replace(/--[^\n]*/g, '').replace(/\s+/g, '').toLowerCase();

// Cada CHECK (...) del CREATE TABLE, con sus paréntesis balanceados.
function checks(sql) {
  const limpio = sinEspacios(sql);
  const encontrados = [];
  for (let i = limpio.indexOf('check('); i !== -1; i = limpio.indexOf('check(', i + 1)) {
    let nivel = 0;
    let j = i + 5;
    do {
      if (limpio[j] === '(') nivel++;
      else if (limpio[j] === ')') nivel--;
      j++;
    } while (nivel > 0 && j < limpio.length);
    encontrados.push(limpio.slice(i, j));
  }
  return encontrados.sort();
}

const porNombre = (a, b) => String(a.clave ?? a.name).localeCompare(String(b.clave ?? b.name));
const sha = (valor) => createHash('sha256').update(JSON.stringify(valor)).digest('hex');

function tablasDe(db) {
  return db
    .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all();
}

function esquemaDe(db) {
  const tablas = {};
  for (const { name, sql } of tablasDe(db)) {
    const t = JSON.stringify(name);
    // Por nombre y no por posición: una columna sumada por ALTER queda al
    // final y en una base nueva no, y eso no es una diferencia de esquema.
    const columnas = db
      .prepare(`PRAGMA table_info(${t})`)
      .all()
      .map((c) => ({ name: c.name, tipo: String(c.type).toUpperCase(), notnull: c.notnull, dflt: sinEspacios(c.dflt_value), pk: c.pk }))
      .sort(porNombre);
    // Los índices automáticos (UNIQUE/PK) se identifican por sus columnas: su
    // nombre (sqlite_autoindex_x_N) depende del orden en que se declararon.
    const indices = db
      .prepare(`PRAGMA index_list(${t})`)
      .all()
      .map((ix) => {
        const cols = db.prepare(`PRAGMA index_info(${JSON.stringify(ix.name)})`).all().map((c) => c.name);
        const def = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?").get(ix.name);
        return {
          clave: ix.origin === 'c' ? ix.name : `${ix.origin}:${cols.join(',')}`,
          origen: ix.origin,
          unique: ix.unique,
          cols,
          sql: sinEspacios(def?.sql)
        };
      })
      .sort(porNombre);
    const fks = db
      .prepare(`PRAGMA foreign_key_list(${t})`)
      .all()
      .map((f) => ({ clave: `${f.from}->${f.table}.${f.to}`, on_update: f.on_update, on_delete: f.on_delete }))
      .sort(porNombre);
    tablas[name] = { columnas, indices, fks, checks: checks(sql) };
  }
  const otros = db
    .prepare("SELECT type, name, sql FROM sqlite_master WHERE type IN ('view', 'trigger') ORDER BY type, name")
    .all()
    .map((o) => ({ ...o, sql: sinEspacios(o.sql) }));
  return { tablas, otros };
}

function datosDe(db) {
  const datos = {};
  for (const { name } of tablasDe(db)) {
    const filas = db.prepare(`SELECT * FROM ${JSON.stringify(name)} ORDER BY rowid`).all();
    const ordenadas = filas.map((f) => Object.keys(f).sort().map((k) => [k, f[k]]));
    datos[name] = { filas: filas.length, hash: sha(ordenadas) };
  }
  return datos;
}

function huella(ruta) {
  const db = new DatabaseSync(ruta, { readOnly: true });
  try {
    return {
      esquema: esquemaDe(db),
      datos: datosDe(db),
      integridad: db.prepare('PRAGMA integrity_check').all().map((r) => r.integrity_check).join('; '),
      fks: db.prepare('PRAGMA foreign_key_check').all().length
    };
  } finally {
    db.close();
  }
}

function filasPorTabla(ruta) {
  const db = new DatabaseSync(ruta, { readOnly: true });
  try {
    return Object.fromEntries(
      tablasDe(db).map(({ name }) => [name, db.prepare(`SELECT COUNT(*) AS n FROM ${JSON.stringify(name)}`).get().n])
    );
  } finally {
    db.close();
  }
}

// --- Comparaciones (devuelven las diferencias, vacías si no hay) -------------

function diferenciasDeEsquema(a, b) {
  const nombres = [...new Set([...Object.keys(a.tablas), ...Object.keys(b.tablas)])].sort();
  const difs = nombres.filter((n) => sha(a.tablas[n] ?? null) !== sha(b.tablas[n] ?? null)).map((n) => {
    if (!a.tablas[n] || !b.tablas[n]) return `tabla ${n}: está en una sola de las dos`;
    const partes = ['columnas', 'indices', 'fks', 'checks'].filter((k) => sha(a.tablas[n][k]) !== sha(b.tablas[n][k]));
    return `tabla ${n}: difieren ${partes.join(', ')}`;
  });
  if (sha(a.otros) !== sha(b.otros)) difs.push('vistas o triggers distintos');
  return difs;
}

// Lo que declara el CREATE TABLE: todo menos los CREATE INDEX (origen 'c').
function diferenciasDeDefinicion(soloSchema, final) {
  const definicion = (t) => t && { ...t, indices: t.indices.filter((ix) => ix.origen !== 'c') };
  return Object.keys(final.tablas)
    .sort()
    .map((n) => {
      const [a, b] = [definicion(soloSchema.tablas[n]), definicion(final.tablas[n])];
      if (!a) return `tabla ${n}: no está`;
      const partes = ['columnas', 'fks', 'checks', 'indices'].filter((k) => sha(a[k]) !== sha(b[k]));
      return partes.length ? `tabla ${n}: difieren ${partes.join(', ').replace('indices', 'UNIQUE/PK')}` : null;
    })
    .filter(Boolean);
}

function diferenciasDeDatos(a, b) {
  const nombres = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return nombres.filter((n) => !SIN_CONTROL_DE_DATOS.has(n) && a[n]?.hash !== b[n]?.hash);
}

// --- Correr db/index.js ---------------------------------------------------------

function arrancar(ruta) {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(moduloDb)});`], {
    env: { ...process.env, NEXO_DB_PATH: ruta, NEXO_BACKUP: 'off' },
    encoding: 'utf8'
  });
  return r.status === 0 ? null : (r.stderr || r.stdout || `código ${r.status}`).trim().split('\n').slice(0, 6).join('\n');
}

function verificarCaso({ ruta, conDatos }, esquemaNuevo) {
  const errores = [];
  const antes = conDatos ? filasPorTabla(ruta) : null;

  const fallo = arrancar(ruta);
  if (fallo) return { errores: [`el 1er arranque falla:\n${fallo}`] };
  const h1 = huella(ruta);

  for (const vuelta of [2, 3]) {
    const falloN = arrancar(ruta);
    if (falloN) {
      errores.push(`el arranque ${vuelta} falla:\n${falloN}`);
      break;
    }
    const hN = huella(ruta);
    const esquema = diferenciasDeEsquema(h1.esquema, hN.esquema);
    const datos = diferenciasDeDatos(h1.datos, hN.datos);
    if (esquema.length) errores.push(`el arranque ${vuelta} cambió el esquema: ${esquema.join('; ')}`);
    if (datos.length) errores.push(`el arranque ${vuelta} cambió datos de: ${datos.join(', ')}`);
  }

  if (h1.integridad !== 'ok') errores.push(`integrity_check: ${h1.integridad}`);
  if (h1.fks) errores.push(`foreign_key_check: ${h1.fks} fila(s) huérfana(s)`);

  if (esquemaNuevo) {
    const difs = diferenciasDeEsquema(esquemaNuevo, h1.esquema);
    if (difs.length) errores.push(`el esquema final no es el de una base nueva: ${difs.join('; ')}`);
  }

  if (antes) {
    const perdidas = Object.entries(antes)
      .filter(([t, n]) => !SIN_CONTROL_DE_DATOS.has(t) && (h1.datos[t]?.filas ?? 0) < n)
      .map(([t, n]) => `${t} (${n} → ${h1.datos[t]?.filas ?? 'tabla borrada'})`);
    if (perdidas.length) errores.push(`se perdieron filas al migrar: ${perdidas.join(', ')}`);
  }

  return { errores, esquema: h1.esquema };
}

// --- Principal ------------------------------------------------------------------

const md5Antes = existsSync(rutaBaseReal) ? md5(rutaBaseReal) : null;
const tmp = mkdtempSync(path.join(tmpdir(), 'nexo-migracion-'));

const origenes = [
  ...(md5Antes ? [['real', rutaBaseReal]] : []),
  ...readdirSync(dirDb)
    .filter((f) => f.startsWith('nexo.db.backup-'))
    .sort()
    .map((f) => [f.replace('nexo.db.', ''), path.join(dirDb, f)]),
  ...op.base.map((r) => [`--base ${path.basename(r)}`, path.resolve(r)])
];
const casos = [{ nombre: 'nueva', ruta: path.join(tmp, '00-nueva.db'), conDatos: false }];
origenes.forEach(([nombre, origen], i) => {
  const ruta = path.join(tmp, `${String(i + 1).padStart(2, '0')}.db`);
  copiarBase(origen, ruta);
  casos.push({ nombre, ruta, conDatos: true });
});

function esquemaDeSchemaSql() {
  const ruta = path.join(tmp, 'solo-schema-sql.db');
  const db = new DatabaseSync(ruta);
  try {
    db.exec(readFileSync(path.join(dirDb, 'schema.sql'), 'utf8'));
  } finally {
    db.close();
  }
  return huella(ruta).esquema;
}

let esquemaNuevo = null;
let fallidos = 0;
for (const caso of casos) {
  const { errores, esquema } = verificarCaso(caso, esquemaNuevo);
  if (caso.nombre === 'nueva' && esquema) {
    esquemaNuevo = esquema;
    const atrasadas = diferenciasDeDefinicion(esquemaDeSchemaSql(), esquema);
    if (atrasadas.length) {
      errores.push(`schema.sql no tiene la forma final (db/index.js la completa): ${atrasadas.join('; ')}`);
    }
  }
  if (errores.length) {
    fallidos++;
    console.log(`✘ ${caso.nombre}`);
    for (const e of errores) console.log(`    - ${e.replaceAll('\n', '\n      ')}`);
  } else {
    console.log(`✔ ${caso.nombre}`);
  }
}

console.log(`\n${casos.length - fallidos} de ${casos.length} casos OK.`);
if (md5Antes) {
  const md5Despues = md5(rutaBaseReal);
  console.log(`md5 de backend/db/nexo.db: ${md5Antes} antes, ${md5Despues} después.`);
  if (md5Despues !== md5Antes) {
    // Un servidor real andando puede haberla cambiado; este script no la abre
    // para escribir. Igual se marca: la verificación no prueba lo que dice.
    console.log('✘ La base real cambió durante la verificación (¿el servidor real está corriendo?).');
    fallidos++;
  }
}

if (fallidos) {
  console.log(`Las bases quedaron en ${tmp} para inspeccionarlas.`);
  process.exitCode = 1;
} else {
  rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
