// Regresión de la API: el árbol de trabajo contra HEAD (u otra ref), con los
// mismos datos. `npm run regresion` (opciones: -- --ref <ref> --db <ruta>).
//
// Es el paso 2 de "Cómo verificar" en handoff.md, que hasta ahora se armaba a
// mano en cada sesión:
//   1. saca la ref en un `git worktree` temporal (con una junction a
//      backend/node_modules, que en Windows no pide permisos de admin);
//   2. arma una base: una nueva sembrada con el seed.mjs y el servidor de la
//      ref, o con --db una copia de esa base más una empresa sembrada encima.
//      La base se copia dos veces, así las dos versiones arrancan con los
//      mismos datos y, si el árbol trae una migración, se ejercita;
//   3. levanta las dos versiones y pide todos los GET de RUTAS_PERMISOS
//      (backend/permisos.js) como admin y como empleado, en el mismo orden;
//   4. compara el JSON (código HTTP incluido) y muestra cada diferencia.
// Una diferencia no es necesariamente un bug: es lo que el cambio movió, y hay
// que mirar si era lo buscado. Sin diferencias sale con 0; con alguna, 1.
//
// Con --usuario y --password se compara también como ese usuario de la base
// de --db (por ejemplo, el admin de una copia de la real).
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { RUTAS_PERMISOS } from '../backend/permisos.js';
import { crearCliente, levantarServidor } from '../backend/test/servidor-de-prueba.js';
import { copiarBase, md5, raiz, rutaBaseReal } from './lib/base-real.mjs';
import { PASSWORD_ADMIN, PASSWORD_EMPLEADO } from './seed.mjs';

const { values: op } = parseArgs({
  options: {
    ref: { type: 'string', default: 'HEAD' },
    db: { type: 'string' },
    usuario: { type: 'string' },
    password: { type: 'string' }
  }
});

// Rutas con parámetros: de qué listado salen sus ids. Una ruta GET nueva con
// parámetro que no esté acá corta el script, para que no quede sin probar sin
// que nadie se entere.
const LISTADO_DE = {
  '/api/clientes/:id': '/api/clientes',
  '/api/facturas/:id': '/api/facturas',
  '/api/productos/:id/movimientos': '/api/productos',
  '/api/productos/:id/atributos': '/api/productos',
  '/api/productos/:id/variantes': '/api/productos',
  '/api/proveedores/:id': '/api/proveedores',
  '/api/ventas/:id': '/api/ventas',
  '/api/turnos-caja/:id': '/api/turnos-caja',
  '/api/socios/:id': '/api/socios',
  '/api/trabajos/:id': '/api/trabajos',
  '/api/abonos/:id': '/api/abonos',
  '/api/ventas/:id/cobros': '/api/ventas',
  '/api/presupuestos/:id': '/api/presupuestos',
  '/api/devoluciones/:id': '/api/devoluciones',
  '/api/compras/:id': '/api/compras',
  '/api/compras/:id/pagos': '/api/compras',
  '/api/devoluciones-proveedor/:id': '/api/devoluciones-proveedor'
};
const IDS_POR_RUTA = 10;

// Lo único que se ignora al comparar: lo que cambia entre dos corridas
// idénticas porque depende de la hora del login de esta misma prueba.
function normalizar(ruta, json) {
  if (ruta === '/api/auditoria' && Array.isArray(json)) {
    return json.map((f) => (f.accion === 'login' ? { ...f, fecha: '<hora del login>' } : f));
  }
  if (ruta === '/api/usuarios' && Array.isArray(json)) {
    return json.map((u) => ('ultimo_acceso' in u ? { ...u, ultimo_acceso: '<hora del login>' } : u));
  }
  return json;
}

// Diferencias entre dos JSON, como lista de "camino: a ≠ b".
function diferencias(a, b, camino = '$', salida = []) {
  if (salida.length >= 10) return salida;
  const tipo = (x) => (Array.isArray(x) ? 'array' : x === null ? 'null' : typeof x);
  if (tipo(a) !== tipo(b) || (tipo(a) !== 'object' && tipo(a) !== 'array')) {
    if (JSON.stringify(a) !== JSON.stringify(b)) salida.push(`${camino}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
    return salida;
  }
  if (tipo(a) === 'array' && a.length !== b.length) {
    salida.push(`${camino}: ${a.length} elementos ≠ ${b.length}`);
  }
  const claves = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of claves) {
    if (tipo(a) === 'array' && (k >= a.length || k >= b.length)) continue;
    diferencias(a[k], b[k], tipo(a) === 'array' ? `${camino}[${k}]` : `${camino}.${k}`, salida);
  }
  return salida;
}

function git(...args) {
  const r = spawnSync('git', args, { cwd: raiz, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr.trim()}`);
  return r.stdout.trim();
}

async function login(url, usuario, password) {
  const cliente = crearCliente(url);
  const r = await cliente.post('/api/auth/login', { usuario, password });
  if (r.status !== 200) throw new Error(`Login de ${usuario} falló en ${url} (${r.status}): ${r.texto}`);
  return cliente;
}

// Todas las rutas a pedir, con los parámetros ya completados. Los ids salen de
// la versión de la ref vista por el admin: los datos son los mismos en las dos.
async function rutasConcretas(admin) {
  const rutas = [];
  for (const clave of Object.keys(RUTAS_PERMISOS).filter((k) => k.startsWith('GET '))) {
    const ruta = clave.slice(4);
    if (!ruta.includes(':')) {
      rutas.push(ruta);
      continue;
    }
    if (ruta === '/api/productos/:id/variantes/:varianteId/movimientos') {
      for (const p of (await admin.get('/api/productos')).json.slice(0, IDS_POR_RUTA)) {
        for (const v of (await admin.get(`/api/productos/${p.id}/variantes`)).json ?? []) {
          rutas.push(`/api/productos/${p.id}/variantes/${v.id}/movimientos`);
        }
      }
      continue;
    }
    const listado = LISTADO_DE[ruta];
    if (!listado) throw new Error(`${clave} tiene parámetros y no está en LISTADO_DE de scripts/regresion-head.mjs.`);
    const filas = (await admin.get(listado)).json;
    if (!Array.isArray(filas) || !filas.length) {
      console.log(`! ${clave}: ${listado} no devolvió filas, la ruta no se prueba.`);
      continue;
    }
    for (const f of filas.slice(0, IDS_POR_RUTA)) rutas.push(ruta.replace(':id', f.id));
  }
  return rutas;
}

async function principal() {
  const md5Antes = existsSync(rutaBaseReal) ? md5(rutaBaseReal) : null;
  const tmp = mkdtempSync(path.join(tmpdir(), 'nexo-regresion-'));
  const worktree = path.join(tmp, 'ref');
  const junction = path.join(worktree, 'backend', 'node_modules');
  const servidores = [];
  let distintas = 0;

  try {
    const sha = git('rev-parse', '--short', op.ref);
    git('worktree', 'add', '--detach', worktree, op.ref);
    symlinkSync(path.join(raiz, 'backend', 'node_modules'), junction, 'junction');
    console.log(`Comparando ${op.ref} (${sha}) contra el árbol de trabajo.`);

    // Base de partida, con una empresa de usuarios conocidos sembrada con el
    // código de la ref: su servidor y también su seed.mjs. Con el seed del árbol,
    // un paso que usa una ruta nueva fallaría contra el servidor de la ref.
    const { sembrar } = await import(pathToFileURL(path.join(worktree, 'scripts', 'seed.mjs')).href);
    const base = path.join(tmp, 'base.db');
    if (op.db) copiarBase(path.resolve(op.db), base);
    const sembrador = await levantarServidor({ backendDir: path.join(worktree, 'backend'), dbPath: base });
    let usuarios;
    try {
      ({ usuarios } = await sembrar(sembrador.url, { prefijo: op.db ? 'regresion' : '' }));
    } finally {
      await sembrador.cerrar();
    }

    const sesiones = [
      ['admin', usuarios.admin, PASSWORD_ADMIN],
      ['empleado', usuarios.empleado, PASSWORD_EMPLEADO],
      ...(op.usuario ? [[op.usuario, op.usuario, op.password ?? '']] : [])
    ];

    const versiones = {};
    for (const [nombre, backendDir] of [
      ['ref', path.join(worktree, 'backend')],
      ['nuevo', path.join(raiz, 'backend')]
    ]) {
      const dbPath = path.join(tmp, `${nombre}.db`);
      copyFileSync(base, dbPath);
      const servidor = await levantarServidor({ backendDir, dbPath });
      servidores.push(servidor);
      const clientes = {};
      for (const [rol, usuario, password] of sesiones) clientes[rol] = await login(servidor.url, usuario, password);
      versiones[nombre] = clientes;
    }

    const rutas = await rutasConcretas(versiones.ref.admin);
    let comparadas = 0;
    for (const ruta of rutas) {
      for (const [rol] of sesiones) {
        const [a, b] = await Promise.all([versiones.ref[rol].get(ruta), versiones.nuevo[rol].get(ruta)]);
        const rutaBase = ruta.split('?')[0];
        const difs = diferencias(
          { status: a.status, json: normalizar(rutaBase, a.json) ?? a.texto },
          { status: b.status, json: normalizar(rutaBase, b.json) ?? b.texto }
        );
        comparadas++;
        if (difs.length) {
          distintas++;
          console.log(`≠ GET ${ruta} (${rol})`);
          for (const d of difs) console.log(`    ${d.slice(0, 300)}`);
        }
      }
    }
    console.log(`\n${comparadas} comparaciones (${rutas.length} rutas × ${sesiones.length} sesiones): ${distintas} distintas.`);
  } finally {
    for (const s of servidores) await s.cerrar();
    // La junction se borra antes que el worktree: así ningún borrado
    // recursivo puede llegar al backend/node_modules real.
    if (existsSync(junction)) rmSync(junction);
    if (existsSync(worktree)) git('worktree', 'remove', '--force', worktree);
    git('worktree', 'prune');
    rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    if (md5Antes && md5(rutaBaseReal) !== md5Antes) {
      console.log('✘ La base real cambió durante la regresión (¿el servidor real está corriendo?).');
      distintas++;
    }
  }
  if (distintas) process.exitCode = 1;
}

principal().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
