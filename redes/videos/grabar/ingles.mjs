// Graba la app real, en inglés, para el video de inglés. Guion:
// videos/estudio/storyboards/nexo-ingles.md.
//
// Necesita un Nexo local con la cuenta de Lola y su negocio de ejemplo (ver
// preparar-demo.mjs y `npm run demo -- --solo lola`), con la IA andando
// (GROQ_API_KEY): el asistente entiende la frase en inglés de verdad.
//
// Uso (desde redes/): node videos/grabar/ingles.mjs <salida>
// Deja en <salida> el .webm y escenas.json (el segundo en que arranca cada
// escena).
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { chromium } from 'playwright';

const [salida] = process.argv.slice(2);
if (!salida) {
  console.error('Uso: node videos/grabar/ingles.mjs <salida>');
  process.exit(1);
}
const U = process.env.NEXO_URL || 'http://localhost:3112';
mkdirSync(salida, { recursive: true });
// Todo va rápido: el video es corto y dinámico (hist. §169).
const RITMO = 0.4;
const pausa = (ms) => new Promise((r) => setTimeout(r, Math.round(ms * RITMO)));

const navegador = await chromium.launch({ channel: 'chrome', args: ['--lang=en-US'] });

// 1. Sin grabar: entra a la cuenta, elige el negocio, esconde la guía de
// primeros pasos y deja una factura hecha.
const preparar = await navegador.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'en-US' });
await preparar.addInitScript(() => localStorage.setItem('nexo.idioma', 'en'));
const previa = await preparar.newPage();
await previa.request.post(`${U}/api/auth/login`, { data: { email: 'lola@indumentarialola.com', password: 'Lola-2026-nexo' } });
const negocios = await (await previa.request.get(`${U}/api/negocios`)).json();
const lola = (negocios.negocios ?? negocios).find((n) => /Lola Indumentaria/.test(n.nombre));
await previa.request.post(`${U}/api/negocios/${lola.id}/entrar`);
const factura = await previa.request.post(`${U}/api/facturas`, {
  data: { cliente: 'Camila Herrera', concepto: 'Sale #152', neto: 43800, condicion: 'transferencia', tipo: 'factura', letra: 'B' }
});
console.log('factura', factura.status());
await previa.goto(`${U}/app#/dashboard`);
await previa.locator('[data-ocultar]').click().catch(() => {});
await pausa(500);
const estado = await preparar.storageState();
await preparar.close();

// 2. La grabación.
const contexto = await navegador.newContext({
  storageState: estado,
  viewport: { width: 1920, height: 1080 },
  locale: 'en-US',
  recordVideo: { dir: salida, size: { width: 1920, height: 1080 } }
});
await contexto.addInitScript(() => {
  document.documentElement.style.zoom = '1.25';
  window.addEventListener('DOMContentLoaded', () => {
    const cursor = document.createElement('div');
    cursor.style.cssText =
      'zoom:0.8;position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;' +
      'transform:translate(-100px,-100px);transition:transform .02s linear;' +
      "background:url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 0 24 24'><path d='M4 2l15 9-6.5 1.6L9.5 19z' fill='black' stroke='white' stroke-width='1.6' stroke-linejoin='round'/></svg>\") no-repeat";
    document.documentElement.appendChild(cursor);
    window.addEventListener('mousemove', (e) => {
      cursor.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
    }, true);
    window.addEventListener('mousedown', (e) => {
      const aro = document.createElement('div');
      aro.style.cssText =
        `zoom:0.8;position:fixed;left:${e.clientX - 18}px;top:${e.clientY - 18}px;width:36px;height:36px;border-radius:50%;` +
        'border:3px solid #3b82f6;z-index:2147483646;pointer-events:none;opacity:.9;transition:all .45s ease-out';
      document.documentElement.appendChild(aro);
      requestAnimationFrame(() => {
        aro.style.transform = 'scale(1.9)';
        aro.style.opacity = '0';
      });
      setTimeout(() => aro.remove(), 600);
    }, true);
  });
});

const pagina = await contexto.newPage();
const t0 = Date.now();
const escenas = [];
const marca = (nombre) => escenas.push({ nombre, seg: Math.round(((Date.now() - t0) / 1000) * 100) / 100 });

async function ir(localizador, { clic = true, pasos = 12 } = {}) {
  await localizador.scrollIntoViewIfNeeded();
  const caja = await localizador.boundingBox();
  const x = caja.x + caja.width / 2;
  const y = caja.y + caja.height / 2;
  await pagina.mouse.move(x, y, { steps: pasos });
  if (clic) {
    await pausa(160);
    await pagina.mouse.click(x, y);
  }
}
// El mouse recorre una línea, como cuando se mira un gráfico.
async function recorrer(desdeX, hastaX, y, pasos = 30) {
  await pagina.mouse.move(desdeX, y, { steps: 6 });
  await pagina.mouse.move(hastaX, y, { steps: pasos });
}
const irA = (vista) => ir(pagina.locator(`a.nav-item[data-view="${vista}"]`));

// Cada "momento" (marca X ... marca X-fin) es lo que se ve mientras se dice una
// palabra del guion: siempre con movimiento, sin esperas. Remotion corta de
// una marca a la otra en el segundo en que se dice la palabra.
// Scroll suave: la rueda en pasos cortos, para que el movimiento sea continuo.
async function scrollSuave(dy, pasos = 12, ms = 45) {
  for (let i = 0; i < pasos; i++) {
    await pagina.mouse.wheel(0, dy / pasos);
    await new Promise((r) => setTimeout(r, ms));
  }
}
// Va a una pantalla del menú y la deja recorriéndose.
async function pantalla(vista, dy = 320) {
  await irA(vista);
  await scrollSuave(dy, 10);
}

await pagina.mouse.move(900, 500);
await pagina.goto(`${U}/app#/dashboard`);
await pagina.waitForSelector('a.nav-item[data-view="dashboard"]', { state: 'visible' });
await pausa(900);

// 1. El Resumen: el mouse recorre el gráfico y después baja
marca('resumen');
await recorrer(520, 1380, 640, 60);
marca('resumen-b');
await scrollSuave(520, 40, 60);
marca('resumen-fin');

// 2. Cada pantalla del menú, de a una
marca('stock');
await pantalla('stock');
marca('ventas');
await pantalla('ventas');
marca('caja');
await pantalla('caja');
marca('facturas');
await pantalla('facturas', 120);
marca('conectado');
// El mouse baja por el menú: todo está en un solo lugar.
await pagina.mouse.move(70, 140, { steps: 4 });
await pagina.mouse.move(70, 720, { steps: 80 });
marca('conectado-fin');

// 3. El mostrador y adónde fue la plata
await irA('pos');
await pagina.waitForSelector('.pos-item', { state: 'visible' });
marca('pos');
await ir(pagina.locator('.pos-item', { hasText: 'Remera básica — Talle: M' }).first(), { pasos: 8 });
await ir(pagina.locator('.pos-item', { hasText: 'Gorra trucker' }).first(), { pasos: 8 });
await ir(pagina.locator('.pos-item', { hasText: 'Jogger frisa' }).first(), { pasos: 8 });
await ir(pagina.locator('.pos-item', { hasText: 'Medias x3' }).first(), { pasos: 8 });
await pausa(250);
marca('pos-fin');
await irA('ventas');
await pagina.waitForSelector('tbody:visible tr', { state: 'visible' });
await pausa(300);
marca('ficha');
await ir(pagina.locator('tbody:visible tr').nth(5).locator('td').nth(1), { pasos: 8 });
await pagina.locator('h2:visible, h3:visible', { hasText: /^Where the money went$/ }).first().waitFor({ state: 'visible' });
await scrollSuave(560, 40, 60);
marca('ficha-fin');

// 4. Los tipos de negocio
await pagina.goto(`${U}/app#/configuracion/cambiar-tipo`);
await pagina.locator('section:visible .opcion-tarjeta').first().waitFor({ state: 'visible' });
await pausa(300);
marca('tipos');
const tarjetas = pagina.locator('section:visible .opcion-tarjeta');
for (const i of [0, 3, 6, 4, 1, 2]) {
  await ir(tarjetas.nth(i), { clic: false, pasos: 7 });
  await pausa(260);
}
marca('tipos-fin');

// 5. El asistente: se escribe, propone y se confirma
await pagina.goto(`${U}/app#/asistente`);
await pagina.waitForSelector('#asistenteTexto', { state: 'visible' });
await pausa(400);
const caja = pagina.locator('#asistenteTexto:visible').first();
await ir(caja, { pasos: 8 });
marca('asistente');
await caja.pressSequentially('I sold two trucker caps to Camila Herrera', { delay: 22 });
await caja.press('Enter');
marca('escrito');
await pagina.waitForSelector('text=Confirm and record', { state: 'visible', timeout: 30000 });
marca('propuesta');
await pausa(500);
await ir(pagina.getByRole('button', { name: 'Confirm and record' }), { pasos: 8 });
await pagina.getByText(/Sale #\d+ recorded/).first().waitFor({ state: 'visible' });
await pausa(500);
marca('confirmado');

// 6. Venta online
await irA('venta-online');
await pagina.waitForSelector('#onlineDona svg, #onlineDona', { state: 'visible' });
marca('online');
await recorrer(480, 1000, 600, 40);
await scrollSuave(650, 36, 60);
marca('online-fin');
marca('fin');

const video = pagina.video();
await contexto.close();
await navegador.close();
const archivo = await video.path();
writeFileSync(path.join(salida, 'escenas.json'), JSON.stringify({ archivo: path.basename(archivo), escenas }, null, 2));
console.log('Listo:', archivo);
console.log(escenas.map((e) => `${e.seg}s ${e.nombre}`).join('\n'));
