// Test de inventario de rutas: la contraparte ejecutable de permisos.js.
//
// No levanta el servidor ni pega contra la base — lee `server.js` como
// texto plano y reconstruye, con las mismas reglas que se usaron para
// generar la tabla a mano, qué endpoints existen y de qué clase son cada
// uno. Después lo compara contra `RUTAS_PERMISOS`. La idea (ver el plan de
// permisos, etapa 2.1) es que agregar el endpoint #106 sin pasar por esta
// tabla, o marcarlo `admin` en la tabla sin ponerle `soloAdmin` en el
// código, rompa el test — es la red que un `grep` manual no garantiza con
// el tiempo.
//
// Clasificación:
// - 'publico': la línea de registro aparece ANTES de
//   `app.use('/api', autenticar)`.
// - 'admin': aparece después, y la firma incluye `soloAdmin` como
//   argumento (`app.metodo(path, soloAdmin, ...)`).
// - 'ambos': aparece después, sin `soloAdmin`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { RUTAS_PERMISOS } from '../permisos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fuente = readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const lineas = fuente.split('\n');

const RE_MOUNT = /^app\.use\('\/api',\s*autenticar\)/;
const RE_RUTA = /^app\.(get|post|patch|put|delete)\('(\/api\/[^']*)'/;

function extraerRutas() {
  const indiceMount = lineas.findIndex((l) => RE_MOUNT.test(l));
  assert.ok(
    indiceMount !== -1,
    "No se encontró la línea `app.use('/api', autenticar)` — cambió el server.js, hay que actualizar el test."
  );

  const rutas = new Map();
  lineas.forEach((linea, indice) => {
    const m = linea.match(RE_RUTA);
    if (!m) return;
    const [, metodo, ruta] = m;
    const clave = `${metodo.toUpperCase()} ${ruta}`;
    let clase;
    if (indice < indiceMount) {
      clase = 'publico';
    } else {
      clase = linea.includes('soloAdmin') ? 'admin' : 'ambos';
    }
    // Si una misma ruta+método se registrara dos veces, es un bug propio
    // (o de este test) — server.js no debería tener rutas duplicadas.
    assert.ok(
      !rutas.has(clave),
      `Ruta duplicada en server.js: ${clave} (línea ${indice + 1})`
    );
    rutas.set(clave, { clase, linea: indice + 1 });
  });
  return rutas;
}

test('todas las rutas del código están clasificadas en permisos.js', () => {
  const rutas = extraerRutas();
  const faltantes = [...rutas.keys()].filter((clave) => !(clave in RUTAS_PERMISOS));
  assert.deepEqual(
    faltantes,
    [],
    `Rutas sin clasificar en permisos.js (agregalas a RUTAS_PERMISOS): ${faltantes.join(', ')}`
  );
});

test('permisos.js no tiene entradas de rutas que ya no existen', () => {
  const rutas = extraerRutas();
  const sobrantes = Object.keys(RUTAS_PERMISOS).filter((clave) => !rutas.has(clave));
  assert.deepEqual(
    sobrantes,
    [],
    `Entradas de permisos.js que ya no están en server.js (borralas): ${sobrantes.join(', ')}`
  );
});

test('la clasificación de permisos.js coincide con el código real', () => {
  const rutas = extraerRutas();
  const desajustes = [];
  for (const [clave, { clase, linea }] of rutas) {
    const esperado = RUTAS_PERMISOS[clave];
    if (esperado !== undefined && esperado !== clase) {
      desajustes.push(
        `${clave} (server.js:${linea}): permisos.js dice '${esperado}', el código es '${clase}'`
      );
    }
  }
  assert.deepEqual(desajustes, [], desajustes.join('\n'));
});
