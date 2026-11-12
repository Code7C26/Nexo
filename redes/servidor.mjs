// Sirve la raíz del repo por HTTP en un puerto libre, para las páginas que
// Playwright fotografía (carruseles/armar.mjs, pitch/armar-guia.mjs). Por HTTP
// y no como archivo: Chrome no carga los íconos de un sprite externo
// (<use href="iconos.svg#...">) ni algunas fuentes desde file://.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2'
};

// Devuelve la dirección base (http://127.0.0.1:puerto) y cómo cerrarlo.
export async function servirRepo() {
  const servidor = createServer((req, res) => {
    const ruta = resolve(raiz, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!ruta.startsWith(raiz + sep)) return res.writeHead(403).end();
    try {
      const cuerpo = readFileSync(ruta);
      res.writeHead(200, { 'Content-Type': TIPOS[extname(ruta)] ?? 'application/octet-stream' }).end(cuerpo);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((listo) => servidor.listen(0, '127.0.0.1', listo));
  return { base: `http://127.0.0.1:${servidor.address().port}`, raiz, cerrar: () => servidor.close() };
}
