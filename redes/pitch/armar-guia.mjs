// Arma la carpeta del pitch, docs/pitch/ (npm run guia, en redes/): la guía de
// los que presentan, la factura de compra de ejemplo y los QR en PNG. La
// presentación en sí la arma `npm run presentacion` en la raíz.
//
// La guía: saca una miniatura de cada diapositiva de docs/presentacion/
// index.html, las pone en los <img data-diapositiva> de pitch/guia.html y la
// imprime en PDF.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { servirRepo } from '../servidor.mjs';

const servidor = await servirRepo();
const carpeta = join(servidor.raiz, 'docs', 'pitch');
const destino = join(carpeta, 'Guía para presentar — Nexo.pdf');
// Los QR de docs/qr, en PNG grande para imprimir o poner en una diapositiva.
const QR = { 'probar-nexo': 'Probar Nexo', 'repositorio-nexo': 'Repositorio en GitHub', 'instagram-nexo': 'Instagram @nexosystem.app' };

// El Chrome de la compu: así no hace falta bajar el Chromium de Playwright.
const navegador = await chromium.launch({ channel: 'chrome' });
try {
  // Las miniaturas: cada diapositiva como se ve al terminar de entrar, sin
  // la barra de progreso ni el contador (el número va en la guía).
  const diapos = await navegador.newPage({ viewport: { width: 1600, height: 900 } });
  await diapos.goto(`${servidor.base}/docs/presentacion/index.html`, { waitUntil: 'networkidle' });
  await diapos.evaluate(() => document.fonts.ready);
  await diapos.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; animation: none !important; } html { scroll-behavior: auto !important; } .progreso, .pie { display: none !important; }'
  });
  const cantidad = await diapos.evaluate(() => {
    document.querySelectorAll('.slide').forEach((s) => s.classList.add('visible'));
    return document.querySelectorAll('.slide').length;
  });
  const miniaturas = [];
  for (let i = 0; i < cantidad; i++) {
    await diapos.evaluate((n) => document.querySelectorAll('.slide')[n].scrollIntoView({ behavior: 'instant' }), i);
    const imagen = await diapos.screenshot({ type: 'jpeg', quality: 80 });
    miniaturas.push(`data:image/jpeg;base64,${imagen.toString('base64')}`);
  }

  const guia = await navegador.newPage();
  await guia.goto(`${servidor.base}/redes/pitch/guia.html`, { waitUntil: 'networkidle' });
  const huecos = await guia.locator('img[data-diapositiva]').count();
  if (huecos !== cantidad) {
    throw new Error(`La presentación tiene ${cantidad} diapositivas y la guía ${huecos}: renumerar guia.html.`);
  }
  await guia.evaluate(async (fuentes) => {
    const imgs = [...document.querySelectorAll('img[data-diapositiva]')];
    for (const img of imgs) img.src = fuentes[Number(img.dataset.diapositiva) - 1];
    await Promise.all(imgs.map((img) => img.decode()));
    await document.fonts.ready;
  }, miniaturas);
  await guia.pdf({
    path: destino,
    preferCSSPageSize: true,
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate:
      '<div style="width:100%;padding:0 14mm;font:8px Inter,sans-serif;color:#999;display:flex;justify-content:space-between"><span>Nexo · Guía para presentar el pitch</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>'
  });
  console.log(`${cantidad} diapositivas → ${destino}`);

  // La factura de compra de ejemplo, para la demo de "Cargar desde la factura".
  const factura = await navegador.newPage({ viewport: { width: 820, height: 1100 }, deviceScaleFactor: 2 });
  await factura.goto(`${servidor.base}/docs/presentacion/factura-textil-norte.html`, { waitUntil: 'networkidle' });
  await factura.pdf({ path: join(carpeta, 'Factura de compra de ejemplo.pdf'), preferCSSPageSize: true, printBackground: true });
  await factura.locator('.hoja').screenshot({ path: join(carpeta, 'Factura de compra de ejemplo.jpg'), type: 'jpeg', quality: 88 });

  const qr = await navegador.newPage({ viewport: { width: 1000, height: 1000 } });
  for (const [archivo, nombre] of Object.entries(QR)) {
    const svg = readFileSync(join(servidor.raiz, 'docs', 'qr', `${archivo}.svg`), 'utf8');
    await qr.setContent(`<body style="margin:0">${svg.replace('<svg ', '<svg width="1000" height="1000" ')}</body>`);
    await qr.locator('svg').screenshot({ path: join(carpeta, 'QR', `${nombre}.png`) });
  }
  console.log(`Factura de ejemplo y ${Object.keys(QR).length} QR → ${carpeta}`);
} finally {
  await navegador.close();
  servidor.cerrar();
}
