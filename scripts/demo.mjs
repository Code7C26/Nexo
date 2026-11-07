// Negocios de ejemplo para mostrar Nexo: `npm run demo -- --url <url> --email <mail>`.
//
// Suma a una cuenta que ya existe un negocio de cada tipo (indumentaria,
// mafaldas con producción, gimnasio, servicios y carnicería), con semanas de
// historia para que el Resumen y los reportes tengan qué mostrar. Como el seed
// (scripts/seed.mjs), todo entra por la API HTTP. Los negocios en sí están en
// backend/negocios-de-ejemplo.js, que también usa "Probar sin registrarse".
//
// Uso:
//   --url <url>        el servidor (por defecto, el de Nexo).
//   --email <mail>     la cuenta. La contraseña se pide al correr, sin mostrarla
//                      (o NEXO_DEMO_CLAVE).
//   --solo <clave>     uno solo: lola, mafaldas, gimnasio, clima o carniceria.
//
// La cuenta tiene que estar en un negocio con el plan Pro: sumar negocios es
// de Pro, y el nuevo nace con el plan del que se está usando. Un negocio que ya
// existe con el mismo nombre se saltea, así que volver a correrlo no duplica.
import { parseArgs } from 'node:util';

import { NEGOCIOS, armarNegocio, clienteDeApi } from '../backend/negocios-de-ejemplo.js';

async function conectar(url, email, password) {
  const api = clienteDeApi(url);
  await api.post('/api/auth/login', { email, password });
  return api;
}

// La contraseña sin que se vea en la pantalla ni quede en el historial.
function pedirClave(pregunta) {
  if (process.env.NEXO_DEMO_CLAVE) return Promise.resolve(process.env.NEXO_DEMO_CLAVE);
  process.stdout.write(pregunta);
  const entrada = process.stdin;
  entrada.setRawMode(true);
  entrada.resume();
  entrada.setEncoding('utf8');
  return new Promise((resolver) => {
    let clave = '';
    entrada.on('data', function leer(texto) {
      for (const letra of texto) {
        if (letra === '\r' || letra === '\n') {
          entrada.setRawMode(false);
          entrada.pause();
          entrada.off('data', leer);
          process.stdout.write('\n');
          return resolver(clave);
        }
        if (letra === '\u0003') process.exit(1);
        if (letra === '\u007f' || letra === '\b') clave = clave.slice(0, -1);
        else clave += letra;
      }
    });
  });
}

/* ---------- Principal ---------- */

async function principal() {
  const { values: op } = parseArgs({
    options: {
      url: { type: 'string', default: 'https://nexosystem.duckdns.org' },
      email: { type: 'string' },
      solo: { type: 'string' }
    }
  });
  if (!op.email) throw new Error('Indicá la cuenta con --email <mail>.');
  if (op.solo && !Object.hasOwn(NEGOCIOS, op.solo)) throw new Error(`--solo es uno de: ${Object.keys(NEGOCIOS).join(', ')}.`);

  const api = await conectar(op.url, op.email, await pedirClave(`Contraseña de ${op.email}: `));
  const existentes = new Set((await api.get('/api/negocios')).map((negocio) => negocio.nombre));
  const claves = op.solo ? [op.solo] : Object.keys(NEGOCIOS);
  for (const [indice, clave] of claves.entries()) {
    const { nombre } = NEGOCIOS[clave];
    if (existentes.has(nombre)) {
      console.log(`- ${nombre}: ya existe, lo salteo.`);
      continue;
    }
    process.stdout.write(`- ${nombre}: creando… `);
    const resumen = await armarNegocio(api, clave, { semilla: 1000 + indice });
    console.log(`listo (${resumen}).`);
  }
  console.log('Listo. Cambiá de negocio con el selector de arriba del menú.');
}

principal().catch((err) => {
  console.error(`\ndemo: ${err.message}`);
  process.exitCode = 1;
});
