// Textos de la interfaz y su traducción al inglés (Configuración → Idioma).
//
//   npm run i18n            lista los textos que todavía no tienen traducción
//   npm run i18n -- --todo  lista todos los textos que encuentra, en JSON
//
// La app no tiene claves de traducción: el texto en castellano es la clave,
// y frontend/js/idioma/en.js dice cómo se dice en inglés. core/idioma.js
// traduce lo que aparece en pantalla. Este script es el que encuentra esos
// textos en el código, para que no se escape ninguno:
//   - index.html: el texto entre etiquetas y los atributos que se leen
//     (placeholder, title, aria-label, alt, data-label);
//   - el JavaScript del frontend y del servidor: los strings y los template
//     literals que parecen texto para una persona (no clases CSS, ids, SQL ni
//     claves). Lo que va entre ${} pasa a {0}, {1}…, y un template con HTML
//     se parte en las etiquetas, como lo parte el navegador.
// El test backend/test/idioma.test.js usa extraerTextos() para que todo texto
// nuevo llegue con su traducción.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as espree from 'espree';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const ARCHIVOS_HTML = ['frontend/index.html'];
const CARPETAS_JS = ['frontend/js', 'backend'];
const NO_SE_LEE = new Set(['vendor', 'test', 'node_modules', 'idioma']);
// Lo que no se traduce por frases:
//   - la landing, que es aparte de la app (Configuración no llega ahí);
//   - el manual, que tiene su propia versión entera;
//   - lo que el intérprete le manda a la IA (instrucciones, no interfaz);
//   - los negocios de ejemplo, que son datos, como los de cualquier negocio;
//   - los comprobantes, que salen siempre en castellano (translate="no"):
//     son documentos fiscales argentinos.
const ARCHIVOS_FUERA = new Set([
  'frontend/js/landing.js',
  'frontend/js/core/comprobante.js',
  'frontend/js/core/manual.js',
  'frontend/js/core/manual-en.js',
  'backend/interprete.js',
  'backend/negocios-de-ejemplo.js'
]);

const ATRIBUTOS = ['placeholder', 'title', 'aria-label', 'alt', 'data-label'];

// Llamadas cuyos argumentos son nombres técnicos, no texto: ids, selectores,
// clases, eventos, claves de storage, SQL, URLs y lo que va a la consola.
const LLAMADAS_TECNICAS = new Set([
  'getElementById', 'querySelector', 'querySelectorAll', 'closest', 'matches', 'createElement', 'createElementNS',
  'addEventListener', 'removeEventListener', 'getAttribute', 'removeAttribute', 'hasAttribute', 'toggleAttribute',
  'add', 'remove', 'toggle', 'contains', 'getItem', 'setItem', 'removeItem', 'getPropertyValue', 'setProperty',
  'prepare', 'exec', 'require', 'fetch', 'startsWith', 'endsWith', 'split', 'CustomEvent', 'Event', 'get', 'post',
  'put', 'patch', 'delete', 'use', 'all', 'run', 'importKey', 'createHash', 'createHmac', 'digest', 'padStart',
  'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString', 'toLocaleUpperCase', 'toLocaleLowerCase',
  'DateTimeFormat', 'NumberFormat', 'Collator', 'localeCompare', 'normalize', 'encodeURIComponent',
  'decodeURIComponent', 'atob', 'btoa', 'RegExp', 'on', 'setHeader', 'header', 'type', 'sendFile', 'static',
  'cookie', 'clearCookie', 'redirect', 'getElementsByTagName', 'execCommand', 'canPlayType', 'isTypeSupported',
  'pragma', 'readFileSync', 'writeFileSync', 'existsSync', 'join', 'resolve', 'spawn', 'match', 'test', 'includes',
  'indexOf', 'lastIndexOf', 'has', 'emit', 'once', 'dirname', 'basename', 'extname', 'createReadStream'
]);
// setAttribute("aria-label", "Texto"): el primero es el nombre, el segundo
// puede ser texto.
const PRIMER_ARGUMENTO_TECNICO = new Set(['setAttribute', 'setItem', 'set', 'replace', 'replaceAll']);

const LETRAS = /[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g;
const SQL =
  /\b(SELECT|INSERT INTO|UPDATE \w+ SET|DELETE FROM|CREATE (TABLE|INDEX|VIEW)|PRAGMA|ALTER TABLE|WHERE|LEFT JOIN|ORDER BY|GROUP BY|COALESCE|INTEGER|NOT NULL|PRIMARY KEY|FOREIGN KEY|REFERENCES)\b|\bCHECK \(/;

// ¿Es texto para una persona? Lo decide sin los {n}: tiene que tener letras,
// y no parecer un nombre técnico.
export function pareceTexto(texto) {
  const sin = texto.replace(/\{\d+\}/g, ' ').replace(/\s+/g, ' ').trim();
  if (sin.replace(LETRAS, '').length < 2) return false;
  if (SQL.test(sin)) return false;
  if (/^(https?:|mailto:|tel:|data:|blob:|wss?:|\/|#|\.|\[|@|\$|&)/.test(sin)) return false;
  if (/[{}<>=\\|]|=>|\(\)|^\w+\(|;\S/.test(sin)) return false;
  // Un solo token sin espacios: id, clase, clave, nombre de archivo,
  // constante o camelCase. Pasan las palabras que arrancan en mayúscula
  // ("Guardar") o llevan tilde ("también").
  if (!/\s/.test(sin)) {
    if (/[-_./:@]/.test(sin) && !/^[A-ZÁÉÍÓÚÑ¿¡]/.test(sin)) return false;
    if (/^[A-Z0-9_]+$/.test(sin)) return false;
    if (/[a-z][A-Z]/.test(sin)) return false;
    if (/^[a-z0-9]+$/.test(sin)) return false;
  }
  // Lista de clases ("btn btn-primary is-activo") o de nombres técnicos.
  if (/^[a-z0-9_-]+( [a-z0-9_-]+)+$/.test(sin) && /[-_]/.test(sin)) return false;
  // Lista de columnas ("id, nombre, activa"), encabezados de mail
  // ("MIME-Version: 1.0") y marcadores de plantilla ("%JSONLD%").
  if (/^[a-z_.]+(, ?[a-z_.]+)+$/.test(sin) || /^[A-Z][a-z]+(-[A-Z][a-z]+)+:/.test(sin) || /^%\w+%$|^User-agent:/.test(sin)) return false;
  // Tipos MIME, formatos de fecha y rutas.
  if (/^[a-z]+\/[a-z0-9.+-]+(;|$)|^(YYYY|AAAA|HH:mm)|^[\w-]+(\/[\w.-]+)+$/.test(sin)) return false;
  // Más nombres técnicos: una columna con su tipo ("sku TEXT"), directivas de
  // seguridad ('self'), comandos en mayúscula ("MAIL FROM"), cabeceras
  // ("X-Nexo-…", "Bearer …"), métodos de ARCA ("FEDummy"), direcciones y
  // fechas ISO.
  if (/^[a-z_]+ (TEXT|REAL|INTEGER|BLOB)\b|'(self|none|unsafe-inline)'|^'\w+'$|^[A-Z0-9-]+( [A-Z0-9-]+)+$|^FE[A-Z]/.test(sin)) return false;
  if (/^X-[A-Z]|^Bearer |@\{\d+\}|T00:00:00Z|^\+\{\d+\} (hours|minutes)$|IS NULL|^\?\w+\?$|^\{\d+\}Result$/.test(texto)) return false;
  return true;
}

// "  Hola,\n  mundo  " → "Hola, mundo": así se compara con el texto del DOM.
export const normalizar = (texto) => texto.replace(/\s+/g, ' ').trim();

const decodificar = (s) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&middot;/g, '·')
    .replace(/&hellip;/g, '…')
    .replace(/&times;/g, '×')
    .replace(/&amp;/g, '&');

// Los atributos que se leen como texto, de una etiqueta.
function atributosDeTexto(etiqueta) {
  const valores = [];
  for (const atributo of ATRIBUTOS) {
    const m = etiqueta.match(new RegExp(`\\s${atributo}="([^"]*)"`));
    if (m) valores.push(m[1]);
  }
  return valores;
}

/* ---------- HTML ---------- */

function textosDelHtml(html, agregar) {
  const limpio = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '');
  // Se recorre etiqueta por etiqueta para saltear lo que está dentro de un
  // translate="no" (el nombre de cada idioma, que va en ese idioma).
  const VACIAS = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr|use|path|circle|rect|line|polyline)$/i;
  let adentroDeNo = 0;
  const pila = [];
  for (const parte of limpio.split(/(<[^>]+>)/)) {
    const etiqueta = parte.match(/^<(\/)?([a-zA-Z][\w-]*)[^>]*?(\/)?>$/);
    if (!etiqueta) {
      if (!adentroDeNo) agregar(decodificar(parte));
      continue;
    }
    const [, cierra, nombre, autocierra] = etiqueta;
    if (cierra) {
      if (pila.pop()?.no) adentroDeNo--;
      continue;
    }
    const no = /\stranslate="no"/.test(parte);
    if (!adentroDeNo && !no) atributosDeTexto(parte).forEach((v) => agregar(decodificar(v)));
    if (autocierra || VACIAS.test(nombre)) continue;
    pila.push({ no });
    if (no) adentroDeNo++;
  }
}

/* ---------- JavaScript ---------- */

function nombreDeLlamada(callee) {
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression' && !callee.computed) return callee.property.name;
  return null;
}

// El template literal con sus ${} como {0}, {1}…, partido en las etiquetas
// HTML que lleva (los atributos que se leen van aparte).
// Marca del lugar de un ${} mientras se parte el template (un carácter de uso
// privado, que no aparece en el código).
const HUECO = '';

function partesDelTemplate(nodo) {
  let texto = '';
  nodo.quasis.forEach((q, i) => {
    texto += q.value.cooked ?? q.value.raw;
    if (i < nodo.expressions.length) texto += HUECO;
  });
  const partes = [];
  const etiquetas = texto.match(/<[a-zA-Z/][^>]*>/g) ?? [];
  if (etiquetas.length) {
    for (const etiqueta of etiquetas) partes.push(...atributosDeTexto(etiqueta));
    partes.push(...texto.split(/<[a-zA-Z/][^>]*>/));
  } else {
    partes.push(texto);
  }
  // Cada parte numera sus huecos desde 0, en el orden en que aparecen.
  return partes.map((parte) => {
    let n = 0;
    return decodificar(parte.replaceAll(HUECO, () => `{${n++}}`));
  });
}

function textosDelJs(codigo, archivo, agregar) {
  let ast;
  try {
    ast = espree.parse(codigo, { ecmaVersion: 'latest', sourceType: 'module' });
  } catch (err) {
    throw new Error(`${archivo}: ${err.message}`, { cause: err });
  }
  const visitar = (nodo, padre, clave) => {
    if (!nodo || typeof nodo.type !== 'string') return;
    if (nodo.type === 'ImportDeclaration' || nodo.type === 'ExportAllDeclaration' || nodo.type === 'ExportNamedDeclaration' && nodo.source) return;
    if (nodo.type === 'CallExpression') {
      const callee = nodo.callee;
      // Lo que va a la consola no se lee en pantalla.
      if (callee.type === 'MemberExpression' && callee.object.type === 'Identifier' && callee.object.name === 'console') return;
      const nombre = nombreDeLlamada(callee);
      if (nombre && LLAMADAS_TECNICAS.has(nombre)) {
        visitar(callee, nodo, 'callee');
        nodo.arguments.forEach((arg, i) => {
          const literal = arg.type === 'Literal' || arg.type === 'TemplateLiteral';
          if (!literal || (PRIMER_ARGUMENTO_TECNICO.has(nombre) && i > 0)) visitar(arg, nodo, 'arguments');
        });
        return;
      }
    }
    if (nodo.type === 'Literal' && typeof nodo.value === 'string') {
      const esClave = (padre?.type === 'Property' && clave === 'key') || (padre?.type === 'MemberExpression' && clave === 'property');
      const esComparacion = padre?.type === 'BinaryExpression' && ['===', '!==', '==', '!=', 'in'].includes(padre.operator);
      if (!esClave && !esComparacion && padre?.type !== 'SwitchCase') agregar(nodo.value);
      return;
    }
    if (nodo.type === 'TemplateLiteral') {
      if (padre?.type !== 'TaggedTemplateExpression') partesDelTemplate(nodo).forEach((p) => agregar(p));
      nodo.expressions.forEach((e) => visitar(e, nodo, 'expressions'));
      return;
    }
    for (const [k, v] of Object.entries(nodo)) {
      if (k === 'loc' || k === 'range') continue;
      if (Array.isArray(v)) v.forEach((h) => visitar(h, nodo, k));
      else if (v && typeof v.type === 'string') visitar(v, nodo, k);
    }
  };
  visitar(ast, null, null);
}

function archivosJs(carpeta) {
  const salida = [];
  for (const entrada of readdirSync(path.join(raiz, carpeta), { withFileTypes: true })) {
    if (NO_SE_LEE.has(entrada.name)) continue;
    const relativo = `${carpeta}/${entrada.name}`;
    if (entrada.isDirectory()) salida.push(...archivosJs(relativo));
    else if (/\.m?js$/.test(entrada.name) && !ARCHIVOS_FUERA.has(relativo)) salida.push(relativo);
  }
  return salida;
}

// Map texto → archivos donde aparece.
export function extraerTextos() {
  const textos = new Map();
  const agregadorDe = (archivo) => (crudo) => {
    const texto = normalizar(crudo);
    if (!texto || !pareceTexto(texto)) return;
    if (!textos.has(texto)) textos.set(texto, new Set());
    textos.get(texto).add(archivo);
  };
  for (const archivo of ARCHIVOS_HTML) textosDelHtml(readFileSync(path.join(raiz, archivo), 'utf8'), agregadorDe(archivo));
  for (const carpeta of CARPETAS_JS) {
    for (const archivo of archivosJs(carpeta)) textosDelJs(readFileSync(path.join(raiz, archivo), 'utf8'), archivo, agregadorDe(archivo));
  }
  return textos;
}

export async function diccionarioIngles() {
  return (await import(pathToFileURL(path.join(raiz, 'frontend/js/idioma/en.js')))).default;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const textos = extraerTextos();
  if (process.argv.includes('--todo')) {
    console.log(JSON.stringify(Object.fromEntries([...textos].map(([t, a]) => [t, [...a]])), null, 1));
  } else {
    const en = await diccionarioIngles().catch(() => ({}));
    const faltan = [...textos.keys()].filter((t) => !(t in en));
    for (const t of faltan) console.log(`${JSON.stringify(t)}  (${[...textos.get(t)].join(', ')})`);
    console.log(`\n${faltan.length} de ${textos.size} textos sin traducir.`);
    process.exitCode = faltan.length ? 1 : 0;
  }
}
