// Saca las imágenes de los carruseles fijados de Instagram (npm run carruseles,
// en redes/): una PNG de 1080 × 1440 por lámina de carruseles.html, en
// carruseles/salida/carrusel-N/. Las portadas salen de .panorama, cortada en
// tres para que fijadas una al lado de la otra formen el logo.
//
// La página se sirve por HTTP desde la raíz del repo, y no se abre como
// archivo: Chrome no carga los íconos de un sprite externo (<use href=
// "iconos.svg#...">) desde file://.
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const aca = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aca, '../..');
const salida = join(aca, 'salida');
const ANCHO = 1080;
const ALTO = 1440;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2'
};

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
const url = `http://127.0.0.1:${servidor.address().port}/redes/carruseles/carruseles.html`;

// El Chrome de la compu: así no hace falta bajar el Chromium de Playwright.
const navegador = await chromium.launch({ channel: 'chrome' });
try {
  const pagina = await navegador.newPage({ viewport: { width: 3400, height: 1600 } });
  const faltan = [];
  pagina.on('response', (r) => r.status() >= 400 && faltan.push(r.url()));
  await pagina.goto(url, { waitUntil: 'networkidle' });
  await pagina.evaluate(() => document.fonts.ready);
  if (faltan.length) throw new Error(`No cargó: ${faltan.join(', ')}`);

  // Se borran las imágenes viejas y no la carpeta: abierta en el Explorador
  // de Windows, no se deja borrar.
  mkdirSync(salida, { recursive: true });
  for (const archivo of readdirSync(salida, { recursive: true })) {
    if (archivo.endsWith('.png')) rmSync(join(salida, archivo));
  }
  const guardar = async (archivo, clip) => {
    const destino = join(salida, archivo);
    mkdirSync(dirname(destino), { recursive: true });
    await pagina.screenshot({ path: destino, clip, fullPage: true });
  };

  // Con fullPage, el recorte va en coordenadas de la página entera, no de lo
  // que se ve.
  const enLaPagina = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height };
  };

  // Las portadas: la panorámica cortada en tres.
  const panorama = pagina.locator('.panorama');
  const caja = await panorama.evaluate(enLaPagina);
  const portadas = (await panorama.getAttribute('data-portadas')).split(' ');
  for (const [i, archivo] of portadas.entries()) {
    await guardar(archivo, { x: caja.x + i * ANCHO, y: caja.y, width: ANCHO, height: ALTO });
  }

  // El resto, una lámina por imagen.
  const laminas = await pagina.locator('.lamina').all();
  for (const lamina of laminas) {
    const { x, y, width, height } = await lamina.evaluate(enLaPagina);
    if (width !== ANCHO || height !== ALTO) throw new Error(`Una lámina mide ${width} × ${height}`);
    await guardar(await lamina.getAttribute('data-archivo'), { x, y, width, height });
  }
  console.log(`${portadas.length + laminas.length} imágenes en ${salida}`);
} finally {
  await navegador.close();
  servidor.close();
}
