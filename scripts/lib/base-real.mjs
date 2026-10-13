// Guardas compartidas por los scripts de verificación (seed, verificar-migracion,
// regresion-head): ninguno puede escribir en la base real, y los que la leen
// tienen que probar que quedó igual (paso 1 de "Cómo verificar" en handoff.md).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const rutaBaseReal = path.join(raiz, 'backend', 'db', 'nexo.db');

export function md5(ruta) {
  return createHash('md5').update(readFileSync(ruta)).digest('hex');
}

export function esLaReal(ruta) {
  return path.resolve(ruta).toLowerCase() === path.resolve(rutaBaseReal).toLowerCase();
}

export function asegurarQueNoEsLaReal(ruta) {
  if (esLaReal(ruta)) {
    throw new Error(`${ruta} es la base real (backend/db/nexo.db): los scripts de verificación nunca escriben ahí.`);
  }
}

// Copia consistente aunque el servidor real esté escribiendo, igual que el
// respaldo automático (db/respaldo.js). El origen se abre de solo lectura: el
// VACUUM INTO no puede modificarlo.
export function copiarBase(origen, destino) {
  asegurarQueNoEsLaReal(destino);
  const db = new DatabaseSync(origen, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    db.exec(`VACUUM INTO '${destino.replaceAll("'", "''")}'`);
  } finally {
    db.close();
  }
}
