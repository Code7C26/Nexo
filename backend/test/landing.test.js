// La landing en "/" y la app en "/app" (hist. §100): quién ve qué, robots y
// sitemap con la URL pública, el JSON-LD con los precios de planes.js, y que
// las páginas públicas no tengan scripts inline (la CSP no los deja) ni
// referencias a archivos que no existen. Con su propio servidor, para poder
// fijar NEXO_URL_PUBLICA.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { ACEPTA, levantarServidor } from './servidor-de-prueba.js';
import { PLANES } from '../planes.js';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FRONTEND = path.join(RAIZ, 'frontend');
const URL_PUBLICA = 'https://nexo.ejemplo.org';

let servidor;

before(async () => {
  servidor = await levantarServidor({ env: { NEXO_URL_PUBLICA: `${URL_PUBLICA}/` } });
});

after(async () => {
  await servidor?.cerrar();
});

// Sin seguir redirecciones, para ver el 301/302 y su destino.
const pedir = (ruta, cookie) =>
  fetch(servidor.url + ruta, { redirect: 'manual', headers: cookie ? { cookie } : {} });

test('"/" sin sesión es la landing, con la URL pública y sin restos de la plantilla', async () => {
  const res = await pedir('/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.ok(res.headers.get('content-security-policy'), 'la landing también lleva la CSP');
  const html = await res.text();
  assert.match(html, /<link rel="canonical" href="https:\/\/nexo\.ejemplo\.org\/" \/>/);
  assert.match(html, /og:image" content="https:\/\/nexo\.ejemplo\.org\/img\/landing\/resumen\.webp"/);
  assert.doesNotMatch(html, /%URL%|%JSONLD%/);
});

test('el JSON-LD de la landing es válido y trae los precios de planes.js', async () => {
  const html = await (await pedir('/')).text();
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(m, 'falta el JSON-LD');
  const datos = JSON.parse(m[1]);
  assert.equal(datos['@type'], 'SoftwareApplication');
  assert.equal(datos.url, `${URL_PUBLICA}/`);
  assert.deepEqual(
    datos.offers.map((o) => [o.name, o.price, o.priceCurrency]),
    Object.values(PLANES).map((p) => [p.nombre, p.precio, 'ARS'])
  );
});

test('con sesión, "/" lleva a /app; /app es la app y /index.html redirige', async () => {
  const registro = await fetch(`${servidor.url}/api/auth/registro`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ empresa: 'Landing SA', email_cuenta: 'landing@nexo.test', nombre: 'Admin', password: 'clave-segura-1', ...ACEPTA })
  });
  assert.equal(registro.status, 201);
  const cookie = registro.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');

  const conSesion = await pedir('/', cookie);
  assert.equal(conSesion.status, 302);
  assert.equal(conSesion.headers.get('location'), '/app');

  // Una cookie inventada no cuenta como sesión.
  assert.equal((await pedir('/', 'nexo_sesion=inventada')).status, 200);

  const app = await pedir('/app');
  assert.equal(app.status, 200);
  assert.match(await app.text(), /<script src="\/js\/sesion\.js">/);

  const viejo = await pedir('/index.html');
  assert.equal(viejo.status, 301);
  assert.equal(viejo.headers.get('location'), '/app');
});

test('privacidad, robots y sitemap', async () => {
  const privacidad = await pedir('/privacidad');
  assert.equal(privacidad.status, 200);
  assert.match(await privacidad.text(), /Política de privacidad/);

  const robots = await (await pedir('/robots.txt')).text();
  assert.match(robots, /^Disallow: \/app$/m);
  assert.match(robots, /^Disallow: \/api\/$/m);
  assert.match(robots, new RegExp(`^Sitemap: ${URL_PUBLICA}/sitemap\\.xml$`, 'm'));

  const sitemap = await pedir('/sitemap.xml');
  assert.match(sitemap.headers.get('content-type'), /xml/);
  const xml = await sitemap.text();
  assert.deepEqual([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]), [
    `${URL_PUBLICA}/`,
    `${URL_PUBLICA}/privacidad`,
    `${URL_PUBLICA}/terminos`
  ]);
});

// La CSP no deja ejecutar scripts inline: uno que se cuele en la landing
// fallaría en silencio en el navegador. El JSON-LD no se ejecuta, así que vale.
for (const pagina of ['landing.html', 'privacidad.html', 'terminos.html']) {
  test(`${pagina}: sin scripts inline y todo lo que referencia existe`, () => {
    const html = readFileSync(path.join(FRONTEND, pagina), 'utf8');
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)].filter(
      (m) => !/type="application\/ld\+json"/.test(m[1])
    );
    assert.deepEqual(inline.map((m) => m[0]), [], 'script inline en la página pública');
    assert.doesNotMatch(html, /\son[a-z]+="/i, 'atributo de evento (onclick=…) en la página pública');

    // src/href locales, sin las anclas ni las rutas que arma el servidor.
    const rutasDelServidor = new Set(['/', '/app', '/privacidad', '/terminos']);
    const locales = [...html.matchAll(/(?:src|href)="(\/[^"#?]*)/g)]
      .map((m) => m[1])
      .filter((ref) => !rutasDelServidor.has(ref));
    const faltan = locales.filter((ref) => {
      const archivo = ref.startsWith('/assets/') ? path.join(RAIZ, ref) : path.join(FRONTEND, ref);
      try {
        return !statSync(archivo).isFile();
      } catch {
        return true;
      }
    });
    assert.deepEqual(faltan, [], `${pagina} referencia archivos que no existen`);
  });
}
