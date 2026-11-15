// Graba la app real para el video 5 ("Un negocio desde cero"): la alta guiada
// de punta a punta y "Lo que ya tenías". Guion: videos/estudio/storyboards/
// nexo-negocio-desde-cero.md.
//
// Necesita un Nexo local con una base vacía y el mail en modo stub, así el
// código de 6 números se lee de la carpeta de mails y no sale ningún mail:
//   NEXO_DB_PATH=<base nueva> NEXO_MAIL=stub NEXO_MAIL_DIR=<carpeta> \
//   NEXO_ARCA=stub PORT=3111 node backend/server.js
//
// Uso (desde redes/): node videos/grabar/negocio-desde-cero.mjs <carpeta-de-mails> <salida>
// Deja en <salida> el .webm y escenas.json con el segundo en que arranca cada
// escena, para que Remotion corte y ponga los títulos.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { chromium } from 'playwright';

const [carpetaMails, salida] = process.argv.slice(2);
if (!carpetaMails || !salida) {
  console.error('Uso: node videos/grabar/negocio-desde-cero.mjs <carpeta-de-mails> <salida>');
  process.exit(1);
}
const URL_BASE = process.env.NEXO_URL || 'http://localhost:3111';
mkdirSync(salida, { recursive: true });

const NEGOCIO = 'Lola Indumentaria';
const PERSONA = { nombre: 'Lola Gómez', mail: 'lola@indumentarialola.com', clave: 'Lola-2026-nexo' };

// Todo va rápido: el video corre de fondo en una diapositiva (hist. §169).
const RITMO = 0.4;
const pausa = (ms) => new Promise((r) => setTimeout(r, Math.round(ms * RITMO)));

const navegador = await chromium.launch({ channel: 'chrome' });
const contexto = await navegador.newContext({
  viewport: { width: 1920, height: 1080 },
  locale: 'es-AR',
  recordVideo: { dir: salida, size: { width: 1920, height: 1080 } }
});
// El cursor no sale en la grabación: se dibuja uno que sigue al mouse y marca
// cada clic.
// La app se ve a 125 % (como en un monitor de 1536 px) y llena el cuadro; el cursor
// y los aros llevan el zoom inverso para quedar donde está el mouse.
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

let x = 760;
let y = 420;
// Mueve el mouse hasta el elemento, como una persona, y hace clic.
async function ir(localizador, { clic = true, pasos = 12, alBorde = false } = {}) {
  await localizador.scrollIntoViewIfNeeded();
  const caja = await localizador.boundingBox();
  const destinoX = alBorde ? caja.x + 14 : caja.x + caja.width / 2;
  const destinoY = caja.y + caja.height / 2;
  await pagina.mouse.move(destinoX, destinoY, { steps: pasos });
  x = destinoX;
  y = destinoY;
  if (clic) {
    await pausa(160);
    await pagina.mouse.click(destinoX, destinoY);
  }
}
const escribir = async (localizador, texto, demora = 65) => {
  await ir(localizador);
  await localizador.pressSequentially(texto, { delay: Math.round(demora * RITMO) });
};
const ultimoCodigo = () => {
  const archivos = readdirSync(carpetaMails).filter((a) => a.endsWith('.json')).sort();
  for (const archivo of archivos.reverse()) {
    const mail = JSON.parse(readFileSync(path.join(carpetaMails, archivo), 'utf8'));
    const m = /\b(\d{6})\b/.exec(mail.texto || '');
    if (m && mail.para === PERSONA.mail) return m[1];
  }
  return null;
};

await pagina.mouse.move(x, y);
await pagina.goto(`${URL_BASE}/app#/crear-cuenta`);
await pagina.waitForSelector('#altaNombre', { state: 'visible' });
await pausa(1500);

// 1. La cuenta
marca('cuenta');
await escribir(pagina.locator('#altaNombre'), PERSONA.nombre);
await escribir(pagina.locator('#altaEmailCuenta'), PERSONA.mail, 50);
await escribir(pagina.locator('#altaPassword'), PERSONA.clave, 60);
await ir(pagina.locator('[data-paso="1"] label.form-check:has(input[value="mayor"])'));
await ir(pagina.locator('[data-paso="1"] label.aceptacion-casilla'), { alBorde: true });
await pausa(500);
await ir(pagina.locator('#altaContinuarCuenta'));

// 2. El código del mail
await pagina.waitForSelector('#altaCodigo', { state: 'visible' });
marca('codigo');
await pausa(1400);
let codigo = null;
for (let i = 0; i < 20 && !codigo; i++) {
  codigo = ultimoCodigo();
  if (!codigo) await pausa(300);
}
if (!codigo) throw new Error('No llegó el código a la carpeta de mails.');
await escribir(pagina.locator('#altaCodigo'), codigo, 140);
await pausa(500);
// Con los 6 números la app confirma sola; si no, se toca el botón.
await pausa(900);
if (await pagina.locator('#altaConfirmarCodigo').isVisible()) await ir(pagina.locator('#altaConfirmarCodigo'));

// 3. El nombre del negocio
await pagina.waitForSelector('#altaEmpresa', { state: 'visible' });
marca('nombre');
await pausa(900);
await escribir(pagina.locator('#altaEmpresa'), NEGOCIO, 75);
await pausa(600);
await ir(pagina.locator('[data-paso="3"] button[type="submit"]'));

// 4. El tipo de negocio
await pagina.waitForSelector('#altaTipos .opcion-tarjeta', { state: 'visible' });
marca('tipo');
await pausa(1200);
const tarjetas = pagina.locator('#altaTipos .opcion-tarjeta');
const cantidad = await tarjetas.count();
for (const i of [1, 2, 3].filter((n) => n < cantidad)) {
  await ir(tarjetas.nth(i), { clic: false, pasos: 10 });
  await pausa(650);
}
await ir(pagina.locator('#altaTipos .opcion-tarjeta', { hasText: 'Comercio general' }));
await pausa(1100);
await ir(pagina.locator('[data-paso="4"] button[type="submit"]'));

// 5. Las secciones
await pagina.waitForSelector('#altaModulos input[name="modulo"]', { state: 'attached' });
marca('secciones');
await pausa(1800);
const modulos = pagina.locator('#altaModulos .opcion-tarjeta');
if ((await modulos.count()) > 2) {
  await ir(modulos.nth(2));
  await pausa(900);
  await ir(modulos.nth(2));
}
await pausa(700);
await ir(pagina.locator('[data-paso="5"] button[type="submit"]'));

// 6. Los comprobantes, más tarde
await pagina.waitForSelector('#altaDespues', { state: 'visible' });
marca('comprobantes');
await pausa(1500);
await ir(pagina.locator('#altaDespues'));

// 7. ¿Ya venía funcionando?
await pagina.waitForSelector('#altaCrear', { state: 'visible' });
marca('funcionando');
await pausa(1500);
await ir(pagina.locator('[data-paso="7"] .opcion-tarjeta', { hasText: 'quiero cargar lo que ya tengo' }));
await pausa(1100);
await ir(pagina.locator('#altaCrear'));
marca('creada');

// 8. Lo que ya tenías
await pagina.waitForSelector('#ciPartes .ci-parte', { state: 'visible', timeout: 30000 });
marca('ya-tenias');
await pausa(2200);
await ir(pagina.locator('#ciPartes a', { hasText: 'Cargar' }).first());

await pagina.waitForSelector('#btnCiSumarProducto', { state: 'visible' });
await pausa(900);
const productos = [
  ['Remera básica', '24', '8500', '18000'],
  ['Jean recto', '12', '21000', '42000'],
  ['Buzo canguro', '9', '26000', '54000']
];
for (const [nombre, cantidadP, costo, precio] of productos) {
  // La planilla de un negocio vacío ya trae un renglón en blanco.
  const hayEnBlanco = await pagina.locator('#ciPlanilla .ci-fila-nueva [name="nombre"]').evaluateAll((l) => l.some((i) => i.value === ''));
  if (!hayEnBlanco) await ir(pagina.locator('#btnCiSumarProducto'));
  const fila = pagina.locator('#ciPlanilla .ci-fila-nueva').last();
  await escribir(fila.locator('[name="nombre"]'), nombre, 50);
  await escribir(fila.locator('[name="cantidad"]'), cantidadP, 70);
  await escribir(fila.locator('[name="costo"]'), costo, 70);
  await escribir(fila.locator('[name="precio_venta"]'), precio, 70);
  await pausa(400);
}
await ir(pagina.locator('#formStockInicial button[type="submit"]'));
await pausa(1800);

// Lo que le deben y la plata de hoy
await pagina.goto(`${URL_BASE}/app#/configuracion/te-deben`);
await pagina.waitForSelector('#formCiDeben', { state: 'visible' });
marca('te-deben');
await pausa(900);
await escribir(pagina.locator('#formCiDeben [name="nombre"]'), 'Camila Herrera', 60);
await escribir(pagina.locator('#formCiDeben [name="importe"]'), '38000', 70);
await ir(pagina.locator('#formCiDeben button[type="submit"]'));
await pausa(1800);

await pagina.goto(`${URL_BASE}/app#/configuracion/plata-inicial`);
await pagina.waitForSelector('#ciPlataLista .ci-fila', { state: 'visible' });
marca('plata');
await pausa(900);
const saldos = pagina.locator('#ciPlataLista [name="saldo"]');
const montos = ['150000', '420000'];
for (let i = 0; i < Math.min(montos.length, await saldos.count()); i++) {
  await ir(saldos.nth(i));
  await saldos.nth(i).fill('');
  await saldos.nth(i).pressSequentially(montos[i], { delay: 30 });
}
await pausa(500);
await ir(pagina.locator('#formCiPlata button[type="submit"]'));
await pausa(1800);

// El Resumen, ya con números
await pagina.goto(`${URL_BASE}/app#/dashboard`);
marca('resumen');
await pausa(4500);
marca('fin');

const video = pagina.video();
await contexto.close();
await navegador.close();
const archivo = await video.path();
writeFileSync(path.join(salida, 'escenas.json'), JSON.stringify({ archivo: path.basename(archivo), escenas }, null, 2));
console.log('Listo:', archivo);
console.log(escenas.map((e) => `${e.seg}s ${e.nombre}`).join('\n'));
