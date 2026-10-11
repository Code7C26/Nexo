// Lint del repo: `npm run lint` desde la raíz (config en eslint.config.mjs).
//
// No alcanza con correr ESLint y mirar que no haya errores: ESLint ignora en
// silencio lo que queda fuera de su config, y así dio "cero errores" sobre
// archivos que no estaba leyendo (hist. §54). Por eso, antes de dar el
// resultado, este script hace dos controles que fallan si eso vuelve a pasar:
//   1. reglas: un fuente con una variable sin usar y una función no definida,
//      evaluado como si estuviera en cada zona del repo, tiene que dar
//      exactamente esos dos errores (y no quejarse de los globales de la zona);
//   2. cobertura: cada .js/.mjs del repo tiene que estar entre los archivos
//      que ESLint efectivamente leyó.
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CARPETAS = ['frontend/js', 'backend', 'scripts'];
const NO_SE_LINTEA = new Set(['node_modules', 'vendor']);

const eslint = new ESLint({ cwd: raiz });

function abortar(mensaje) {
  console.error(`npm run lint: ${mensaje}`);
  process.exit(1);
}

// --- 1. Control de reglas ---------------------------------------------------
// Cada zona usa un global propio (document en el navegador, process en Node):
// si la config de la zona no se aplicara, también daría no-undef y el control
// lo detectaría.
const ZONAS = [
  ['frontend/js/__control__.js', 'document'],
  ['frontend/js/sesion.js', 'localStorage'],
  ['backend/__control__.js', 'process'],
  ['scripts/__control__.mjs', 'process'],
  ['__control__.mjs', 'process'],
];
for (const [archivo, global] of ZONAS) {
  const [r] = await eslint.lintText(`const sinUsar = ${global};\nnoDefinida();\n`, {
    filePath: path.join(raiz, archivo),
  });
  const reglas = r.messages.map((m) => m.ruleId).sort().join(', ');
  const undefOk = r.messages.some((m) => m.ruleId === 'no-undef' && m.message.includes('noDefinida'));
  if (reglas !== 'no-undef, no-unused-vars' || !undefOk) {
    abortar(
      `el control de reglas no dio lo esperado en ${archivo} (dio: ${reglas || 'nada'}). ` +
        'La config no se está aplicando ahí, o el archivo cae en un ignore.',
    );
  }
}

// --- 2. Lint + control de cobertura -------------------------------------------
function fuentes(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) return NO_SE_LINTEA.has(e.name) ? [] : fuentes(ruta);
    return /\.m?js$/.test(e.name) ? [ruta] : [];
  });
}
const esperados = [
  ...CARPETAS.flatMap((c) => fuentes(path.join(raiz, c))),
  ...readdirSync(raiz).filter((f) => f.endsWith('.mjs')).map((f) => path.join(raiz, f)),
];

const resultados = await eslint.lintFiles([...CARPETAS, '*.mjs']);
const leidos = new Set(resultados.map((r) => path.normalize(r.filePath)));
const faltan = esperados.filter((f) => !leidos.has(path.normalize(f)));
if (faltan.length) {
  abortar(
    `ESLint no leyó ${faltan.length} archivo(s): ${faltan.map((f) => path.relative(raiz, f)).join(', ')}. ` +
      'Revisar los ignores de eslint.config.mjs.',
  );
}

const problemas = resultados.reduce((n, r) => n + r.errorCount + r.warningCount, 0);
if (problemas) {
  const formatter = await eslint.loadFormatter('stylish');
  console.log(await formatter.format(resultados));
  process.exitCode = 1;
} else {
  console.log(`ESLint: ${resultados.length} archivos, sin problemas.`);
}
