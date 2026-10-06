// Test estático de la modularización del frontend (CLAUDE.md §31, Etapa B).
//
// No levanta nada ni abre un navegador: lee los .js de frontend/js como texto
// y verifica las reglas que el grafo de módulos ES tiene que cumplir para que
// la app no quede en blanco, porque el navegador es el único que las exige y
// recién al cargar la pantalla:
// 1. Todo import relativo resuelve a un archivo que existe, con las
//    mayúsculas exactas (Windows no distingue y un servidor Linux sí).
// 2. Todo nombre importado está exportado por el módulo de destino.
// 3. No hay ciclos de import, salvo los de CICLOS_PERMITIDOS.
// 4. Todo literal de core/registro.js que se invoca tiene su registrar():
//    - invocar('x', ...)  necesita  registrar('x', ...)
//    - recargar('x', ...) necesita  registrar('cargar:x', ...)
//    - alEntrarEnVista('v', ...) no necesita nada: es quien registra.
// 5. dominios/ nunca importa app.js (app.js los importa a ellos).
//
// Los archivos de js/vendor/ son librerías de terceros y no se analizan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ_JS = path.join(__dirname, '..', '..', 'frontend', 'js');

// Ciclos aceptados a propósito, como pares "a.js -> b.js" relativos a RAIZ_JS.
// Empieza vacía: cada entrada nueva tiene que justificarse acá.
const CICLOS_PERMITIDOS = [];

function listarJs(dir) {
  const salida = [];
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'vendor') continue;
    const completo = path.join(dir, nombre);
    if (statSync(completo).isDirectory()) salida.push(...listarJs(completo));
    else if (nombre.endsWith('.js')) salida.push(completo);
  }
  return salida;
}

const rel = (archivo) => path.relative(RAIZ_JS, archivo).split(path.sep).join('/');

// Quita comentarios para que un import o export "de ejemplo" dentro de un
// comentario no cuente. No es un parser: alcanza para el código de este repo.
function sinComentarios(texto) {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

function analizar(archivo) {
  const texto = sinComentarios(readFileSync(archivo, 'utf8'));
  const imports = [];
  const exportados = new Set();

  const reImport = /import\s*(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\}|\*\s*as\s+([\w$]+))?\s*from\s*['"]([^'"]+)['"]/g;
  for (const m of texto.matchAll(reImport)) {
    const [, porDefecto, nombrados, , origen] = m;
    const nombres = (nombrados ?? '')
      .split(',')
      .map((n) => n.trim().split(/\s+as\s+/)[0])
      .filter(Boolean);
    imports.push({ origen, nombres, porDefecto: Boolean(porDefecto) });
  }
  for (const m of texto.matchAll(/(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g)) {
    imports.push({ origen: m[1], nombres: [], porDefecto: false });
  }

  for (const m of texto.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([\w$]+)/g)) {
    exportados.add(m[1]);
  }
  for (const m of texto.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const parte of m[1].split(',')) {
      const nombre = parte.trim().split(/\s+as\s+/).pop();
      if (nombre) exportados.add(nombre);
    }
  }
  if (/export\s+default\b/.test(texto)) exportados.add('default');

  return { texto, imports, exportados };
}

const archivos = listarJs(RAIZ_JS);
const modulos = new Map(archivos.map((a) => [a, analizar(a)]));

// Resuelve un import relativo respetando mayúsculas; devuelve la ruta
// absoluta o null si no existe tal cual está escrito.
function resolver(desde, origen) {
  if (!origen.startsWith('.')) return null;
  const destino = path.resolve(path.dirname(desde), origen);
  let actual = path.parse(destino).root;
  for (const segmento of path.relative(actual, destino).split(path.sep)) {
    if (!readdirSync(actual).includes(segmento)) return null;
    actual = path.join(actual, segmento);
  }
  return statSync(actual).isFile() ? actual : null;
}

test('sesion.js inyecta app.js como módulo y index.html no lo carga por su cuenta', () => {
  const sesion = readFileSync(path.join(RAIZ_JS, 'sesion.js'), 'utf8');
  assert.match(sesion, /script\.type\s*=\s*["']module["']/, 'sesion.js tiene que inyectar app.js con type="module".');
  assert.match(sesion, /script\.onerror\s*=/, 'sesion.js tiene que manejar el fallo de carga del grafo de módulos.');

  const html = readFileSync(path.join(RAIZ_JS, '..', 'index.html'), 'utf8');
  assert.doesNotMatch(
    html,
    /<script[^>]+src=["'][^"']*js\/app\.js/,
    'index.html no puede cargar app.js directo: se saltearía el gate de sesion.js.'
  );
});

test('todo import relativo resuelve a un archivo existente (mayúsculas exactas)', () => {
  const rotos = [];
  for (const [archivo, { imports }] of modulos) {
    for (const { origen } of imports) {
      if (origen.startsWith('.') && !resolver(archivo, origen)) {
        rotos.push(`${rel(archivo)} importa '${origen}'`);
      }
    }
  }
  assert.deepEqual(rotos, [], `Imports que no resuelven:\n${rotos.join('\n')}`);
});

test('todo nombre importado está exportado por el módulo de destino', () => {
  const faltantes = [];
  for (const [archivo, { imports }] of modulos) {
    for (const { origen, nombres, porDefecto } of imports) {
      const destino = resolver(archivo, origen);
      if (!destino || !modulos.has(destino)) continue;
      const { exportados } = modulos.get(destino);
      for (const nombre of nombres) {
        if (!exportados.has(nombre)) faltantes.push(`${rel(archivo)} importa '${nombre}' de ${rel(destino)}`);
      }
      if (porDefecto && !exportados.has('default')) faltantes.push(`${rel(archivo)} importa default de ${rel(destino)}`);
    }
  }
  assert.deepEqual(faltantes, [], `Nombres que el destino no exporta:\n${faltantes.join('\n')}`);
});

test('no hay ciclos de import fuera de CICLOS_PERMITIDOS', () => {
  const grafo = new Map();
  for (const [archivo, { imports }] of modulos) {
    grafo.set(
      archivo,
      imports.map(({ origen }) => resolver(archivo, origen)).filter((d) => d && modulos.has(d))
    );
  }
  const ciclos = [];
  const estado = new Map(); // 1 = en la pila, 2 = terminado
  const pila = [];
  const visitar = (nodo) => {
    estado.set(nodo, 1);
    pila.push(nodo);
    for (const vecino of grafo.get(nodo)) {
      if (estado.get(vecino) === 1) {
        const ciclo = [...pila.slice(pila.indexOf(vecino)), vecino].map(rel);
        ciclos.push(ciclo.join(' -> '));
      } else if (!estado.has(vecino)) {
        visitar(vecino);
      }
    }
    pila.pop();
    estado.set(nodo, 2);
  };
  for (const nodo of grafo.keys()) if (!estado.has(nodo)) visitar(nodo);

  const sinPermitir = ciclos.filter((c) => !CICLOS_PERMITIDOS.some((p) => c.includes(p)));
  assert.deepEqual(sinPermitir, [], `Ciclos de import:\n${sinPermitir.join('\n')}`);
});

test('todo literal de core/registro.js que se invoca tiene su registrar()', () => {
  const registrados = new Set();
  const usados = [];
  for (const [archivo, { texto }] of modulos) {
    // registro.js define las funciones: sus propias firmas no son usos.
    if (rel(archivo) === 'core/registro.js') continue;
    for (const m of texto.matchAll(/\bregistrar\(\s*['"]([^'"]+)['"]/g)) registrados.add(m[1]);
    for (const m of texto.matchAll(/\binvocar\(\s*['"]([^'"]+)['"]/g)) {
      usados.push({ clave: m[1], donde: rel(archivo), uso: `invocar('${m[1]}')` });
    }
    for (const m of texto.matchAll(/\brecargar\(([^)]*)\)/g)) {
      for (const literal of m[1].matchAll(/['"]([^'"]+)['"]/g)) {
        usados.push({ clave: `cargar:${literal[1]}`, donde: rel(archivo), uso: `recargar('${literal[1]}')` });
      }
    }
  }
  const sinRegistrar = usados.filter((u) => !registrados.has(u.clave)).map((u) => `${u.donde}: ${u.uso}`);
  assert.deepEqual(sinRegistrar, [], `Usos sin registrar():\n${sinRegistrar.join('\n')}`);
});

test('core/ solo importa de core/ (nunca de un dominio ni de app.js)', () => {
  const haciaAfuera = [];
  for (const [archivo, { imports }] of modulos) {
    if (!rel(archivo).startsWith('core/')) continue;
    for (const { origen } of imports) {
      const destino = resolver(archivo, origen);
      if (destino && !rel(destino).startsWith('core/')) haciaAfuera.push(`${rel(archivo)} importa '${origen}'`);
    }
  }
  assert.deepEqual(haciaAfuera, [], `core/ depende de código fuera de core/:\n${haciaAfuera.join('\n')}`);
});

test('dominios/ nunca importa app.js (app.js los importa a ellos)', () => {
  const haciaApp = [];
  for (const [archivo, { imports }] of modulos) {
    if (!rel(archivo).startsWith('dominios/')) continue;
    for (const { origen } of imports) {
      const destino = resolver(archivo, origen);
      if (destino && rel(destino) === 'app.js') haciaApp.push(`${rel(archivo)} importa '${origen}'`);
    }
  }
  assert.deepEqual(haciaApp, [], `dominios/ depende de app.js:\n${haciaApp.join('\n')}`);
});
