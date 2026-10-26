/**
 * sw.js — service worker de Nexo (PWA, CLAUDE.md §31; hist. §94)
 * -----------------------------------------------------------
 * Vive en la raíz de frontend/ para que su alcance sea todo el sitio ("/").
 * Lo registra sesion.js.
 *
 * Qué hace: que la app se pueda abrir sin conexión y muestre lo último que
 * cargó. No escribe sin conexión: los POST/PUT/PATCH/DELETE ni pasan por acá,
 * así que sin red fallan como siempre y api() avisa.
 *
 * Estrategia: primero la red, y lo guardado solo si la red no responde. No hay
 * build step que le ponga versión a cada archivo, así que un caché que sirva
 * primero lo guardado mostraría código viejo hasta cambiar VERSION a mano.
 * Con conexión siempre se ve lo último; lo guardado es solo el respaldo.
 *
 * Dos cachés:
 * - SHELL: los archivos de la app (html, css, js, fuentes, íconos). PRECACHE se
 *   baja al instalar, para que la primera vez sin conexión ya abra.
 *   backend/test/frontend-modulos.test.js controla que liste todo frontend/js
 *   y lo que carga index.html: un archivo nuevo que falte hace fallar npm test.
 * - DATOS: las respuestas 200 de los GET /api. La clave lleva el negocio de la
 *   pestaña (X-Nexo-Negocio), y sesion.js borra este caché en cada login,
 *   logout y 401: lo guardado es siempre de quien lo cargó. Al empleado ya le
 *   llega podado por el servidor (sin costos), así que tampoco se guardan.
 *   /api/auth/* no se guarda, salvo /api/auth/estado, que hace falta para
 *   arrancar sin conexión.
 *
 * Lo que sale de DATOS lleva la cabecera X-Nexo-Guardado-En (milisegundos):
 * sesion.js la ve y muestra el aviso "Sin conexión · lo cargado a las …".
 */

// Globales de un service worker (no de una página): eslint.config.mjs no tiene
// una zona para este archivo, así que se declaran acá.
/* global self, caches, fetch, URL, Headers, Request, Response, setTimeout, clearTimeout */

const VERSION = "v1";
const SHELL = `nexo-shell-${VERSION}`;
const DATOS = `nexo-datos-${VERSION}`;

// La API espera hasta acá antes de mostrar lo guardado (una red que existe
// pero no responde). El shell no tiene tope: mezclar un index.html viejo con
// un app.js nuevo, por una red lenta, rompería la pantalla.
const ESPERA_API_MS = 6000;

const PRECACHE = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/css/styles.css",
  "/fonts/inter.woff2",
  "/img/iconos.svg",
  "/img/app/icono-192.png",
  "/img/app/apple-touch-icon.png",
  "/assets/logo/01-icono/nexo-icono_negro_fondo-transparente.png",
  "/assets/logo/01-icono/nexo-icono_blanco_fondo-transparente.png",
  "/js/arranque.js",
  "/js/sesion.js",
  "/js/app.js",
  "/js/alta.js",
  "/js/core/api.js",
  "/js/core/barra-inferior.js",
  "/js/core/campos.js",
  "/js/core/comprobante.js",
  "/js/core/csv.js",
  "/js/core/filtros.js",
  "/js/core/fiscal.js",
  "/js/core/formato.js",
  "/js/core/iconos.js",
  "/js/core/maestros.js",
  "/js/core/negocio.js",
  "/js/core/registro.js",
  "/js/core/router.js",
  "/js/core/seleccion.js",
  "/js/core/tema.js",
  "/js/core/tipos-negocio.js",
  "/js/core/ui.js",
  "/js/dominios/abonos.js",
  "/js/dominios/configuracion.js",
  "/js/dominios/crm.js",
  "/js/dominios/cuentas-corrientes.js",
  "/js/dominios/gastos.js",
  "/js/dominios/negocios.js",
  "/js/dominios/perfil.js",
  "/js/dominios/pos.js",
  "/js/dominios/primeros-pasos.js",
  "/js/dominios/socios.js",
  "/js/dominios/trabajos.js",
  "/js/dominios/usuarios.js",
];

// Satoshi no se versiona (su licencia no deja redistribuirla) y puede faltar:
// se intenta una por una, y si falta, los títulos caen a Inter como siempre.
const OPCIONALES = ["/fonts/satoshi-500.woff2", "/fonts/satoshi-700.woff2"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // no-cache: revalida contra el servidor en vez de tomar lo que tenga el
      // caché HTTP del navegador.
      await cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "no-cache" })));
      await Promise.all(OPCIONALES.map((url) => cache.add(new Request(url, { cache: "no-cache" })).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const vigentes = new Set([SHELL, DATOS]);
      for (const nombre of await caches.keys()) {
        if (nombre.startsWith("nexo-") && !vigentes.has(nombre)) await caches.delete(nombre);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const pedido = event.request;
  if (pedido.method !== "GET") return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    if (url.pathname.startsWith("/api/auth/") && url.pathname !== "/api/auth/estado") return;
    url.searchParams.set("__negocio", pedido.headers.get("X-Nexo-Negocio") ?? "");
    event.respondWith(redPrimero(event, pedido, url.href, DATOS, ESPERA_API_MS));
    return;
  }

  // Una navegación (abrir la app, recargar) es siempre index.html: el resto de
  // la ruta va en el hash, que no llega acá.
  const clave = pedido.mode === "navigate" ? "/index.html" : pedido;
  event.respondWith(redPrimero(event, pedido, clave, SHELL, null));
});

// Pide a la red y guarda la copia. Si la red falla (o, con `espera`, tarda más
// que eso), devuelve lo guardado; si no hay nada guardado, lo que haga la red.
async function redPrimero(event, pedido, clave, nombreCache, espera) {
  const cache = await caches.open(nombreCache);
  const red = fetch(pedido).then(async (res) => {
    if (res.status === 200 && res.type === "basic") {
      await cache.put(clave, nombreCache === DATOS ? await conMarca(res.clone()) : res.clone());
    }
    return res;
  });
  // La copia se termina de guardar aunque ya se haya respondido con lo viejo.
  event.waitUntil(red.catch(() => {}));
  try {
    return await (espera ? antesDe(red, espera) : red);
  } catch {
    const guardada = await cache.match(clave);
    return guardada ?? red;
  }
}

function antesDe(promesa, ms) {
  return new Promise((resolver, rechazar) => {
    const reloj = setTimeout(() => rechazar(new Error("tiempo agotado")), ms);
    promesa.then(
      (valor) => {
        clearTimeout(reloj);
        resolver(valor);
      },
      (error) => {
        clearTimeout(reloj);
        rechazar(error);
      },
    );
  });
}

async function conMarca(res) {
  const cabeceras = new Headers(res.headers);
  cabeceras.set("X-Nexo-Guardado-En", String(Date.now()));
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: cabeceras });
}
