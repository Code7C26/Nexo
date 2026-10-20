// Baja Satoshi, la fuente de los títulos: `npm run fuentes` desde la raíz.
//
// Satoshi es de Fontshare (Indian Type Foundry), con la licencia ITF Free Font
// License: es gratis y se puede alojar en el servidor propio, pero no se puede
// redistribuir. Como el repo es público, los archivos no se versionan (están en
// .gitignore): cada instalación los baja de Fontshare, tal cual los publica,
// sin convertirlos ni recortarlos. Sin ellos, los títulos caen a Inter y la app
// funciona igual.
//
// Con --si-falta (lo usan `npm start` y `npm run dev` del backend) no hace nada
// si los archivos ya están, y un error de red solo se avisa: el arranque del
// servidor nunca depende de Fontshare.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PESOS = [500, 700];
const API = `https://api.fontshare.com/v2/css?f[]=satoshi@${PESOS.join(',')}&display=swap`;
const LICENCIA = 'https://www.fontshare.com/licenses/itf-ffl';
const dirFuentes = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'fonts');
const archivo = (peso) => path.join(dirFuentes, `satoshi-${peso}.woff2`);
const siFalta = process.argv.includes('--si-falta');

async function bajar(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`${url} respondió ${res.status}`);
  return res;
}

if (siFalta && PESOS.every((p) => existsSync(archivo(p)))) process.exit(0);

try {
  const css = await (await bajar(API)).text();
  // Un @font-face por peso, con la URL del woff2 primero en su src.
  const caras = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map(([, cuerpo]) => ({
    peso: Number(cuerpo.match(/font-weight:\s*(\d+)/)?.[1]),
    url: cuerpo.match(/url\('([^']+\.woff2)'\)/)?.[1],
  }));
  mkdirSync(dirFuentes, { recursive: true });
  for (const peso of PESOS) {
    const cara = caras.find((c) => c.peso === peso && c.url);
    if (!cara) throw new Error(`Fontshare no devolvió Satoshi ${peso} en woff2`);
    const url = cara.url.startsWith('//') ? `https:${cara.url}` : cara.url;
    writeFileSync(archivo(peso), Buffer.from(await (await bajar(url)).arrayBuffer()));
    console.log(`Satoshi ${peso}: ${path.relative(process.cwd(), archivo(peso))}`);
  }
  console.log(`Licencia de Satoshi (ITF Free Font License): ${LICENCIA}`);
} catch (e) {
  console.warn(`No se pudo bajar Satoshi (${e.message}). Los títulos se ven con Inter.`);
  // Corrido a mano, que falle de verdad; desde el arranque, que siga.
  if (!siFalta) process.exitCode = 1;
}
