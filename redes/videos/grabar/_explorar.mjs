import { chromium } from 'playwright';
const salida = process.argv[2];
const U = 'http://localhost:3112';
const n = await chromium.launch({ channel: 'chrome' });
const c = await n.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'en-US' });
await c.addInitScript(() => { localStorage.setItem('nexo.idioma', 'en'); document.documentElement.style.zoom = '1.25'; });
const p = await c.newPage();
await p.request.post(U + '/api/auth/login', { data: { email: 'lola@indumentarialola.com', password: 'Lola-2026-nexo' } });
await p.request.post(`${U}/api/negocios/2/entrar`);
// ficha de venta
await p.goto(`${U}/app#/ventas`);
await p.waitForTimeout(2000);
await p.locator('tbody:visible tr').nth(1).locator('td').nth(2).click();
await p.waitForTimeout(1500);
await p.screenshot({ path: `${salida}/ficha1.png` });
// asistente
await p.goto(`${U}/app#/asistente`);
await p.waitForTimeout(1500);
const caja = p.locator('#asistenteTexto:visible').first();
console.log('input', await caja.count());
await caja.click();
await caja.pressSequentially('I sold two trucker caps to Camila Herrera', { delay: 30 });
await caja.press('Enter');
const t0 = Date.now();
await p.waitForTimeout(9000);
console.log('ms', Date.now() - t0);
await p.screenshot({ path: `${salida}/asistente2.png` });
await n.close();
