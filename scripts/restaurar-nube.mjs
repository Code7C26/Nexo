// Trae un respaldo de la nube (db/respaldo-nube.js) y lo deja listo para usar:
//
//   npm run restaurar-nube                          lista los respaldos de la nube
//   npm run restaurar-nube -- --ultimo <destino>    baja el más reciente
//   npm run restaurar-nube -- <nombre> <destino>    baja uno en particular
//
// Necesita las mismas variables que la subida (NEXO_B2_* y NEXO_RESPALDO_CLAVE).
// Nunca pisa un archivo: el destino tiene que no existir. Después de bajarlo
// controla que SQLite lo lea entero (integrity_check), y recién ahí avisa que
// sirve. Ponerlo en lugar de la base es un paso a mano, con el servidor
// parado (docs/proyecto/publicar.md, "Respaldos").
import { DatabaseSync } from 'node:sqlite';
import { existsSync, rmSync, writeFileSync } from 'node:fs';

import { bajarRespaldo, configNube, listarEnNube } from '../backend/db/respaldo-nube.js';

const [primero, destino] = process.argv.slice(2);

try {
  const nube = configNube();
  if (!nube) throw new Error('Falta configurar el respaldo en la nube: NEXO_B2_* y NEXO_RESPALDO_CLAVE en el .env.');
  const lista = await listarEnNube(nube);

  if (!primero) {
    if (!lista.length) console.log(`No hay respaldos en ${nube.bucket}.`);
    for (const r of lista) console.log(`${r.nombre}  ${Math.ceil(r.bytes / 1024)} KB  ${r.fecha}`);
  } else {
    if (!destino) throw new Error('Falta el destino: la ruta del archivo .db que se va a crear.');
    if (existsSync(destino)) throw new Error(`${destino} ya existe: no se pisa ningún archivo.`);
    const nombre = primero === '--ultimo' ? lista.at(-1)?.nombre : primero;
    if (!nombre) throw new Error(`No hay respaldos en ${nube.bucket}.`);

    writeFileSync(destino, await bajarRespaldo(nube, nombre), { flag: 'wx' });
    let resultado;
    try {
      const base = new DatabaseSync(destino, { readOnly: true });
      try {
        resultado = base.prepare('PRAGMA integrity_check').get().integrity_check;
        if (resultado === 'ok') {
          const n = (tabla) => base.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).get().n;
          console.log(`${nombre} → ${destino}`);
          console.log(`Íntegro: ${n('organizaciones')} negocio(s), ${n('usuarios')} usuario(s), ${n('ventas')} venta(s).`);
        }
      } finally {
        base.close();
      }
    } catch (err) {
      resultado = err.message;
    }
    if (resultado !== 'ok') {
      rmSync(destino, { force: true });
      throw new Error(`El respaldo bajó pero SQLite no lo lee bien (${resultado}). No se dejó el archivo.`);
    }
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
