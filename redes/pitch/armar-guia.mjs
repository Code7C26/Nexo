// Arma la guía de los que presentan el pitch (npm run guia, en redes/):
// saca una miniatura de cada diapositiva de docs/presentacion/index.html, las
// pone en los <img data-diapositiva> de pitch/guia.html y la imprime en
// docs/Guía para presentar — Nexo.pdf.
import { join } from 'node:path';
import { chromium } from 'playwright';
import { servirRepo } from '../servidor.mjs';

const servidor = await servirRepo();
const destino = join(servidor.raiz, 'docs', 'Guía para presentar — Nexo.pdf');

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
} finally {
  await navegador.close();
  servidor.cerrar();
}
