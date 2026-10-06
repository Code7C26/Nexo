// Respaldo manual de la base: `cd backend && npm run backup`.
//
// Hace lo mismo que el respaldo automático de cada arranque (db/respaldo.js) y
// respeta las mismas variables de entorno: NEXO_DB_PATH, NEXO_BACKUP_DIR y
// NEXO_BACKUP_KEEP. Sirve para sacar una copia antes de una operación riesgosa
// sin tener que reiniciar el servidor, o para programarla desde el Programador
// de tareas de Windows o un cron.
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { respaldarBase, rutasDeRespaldo } from '../backend/db/respaldo.js';

const dirDb = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'backend', 'db');
const { dbPath, dir } = rutasDeRespaldo(dirDb);

const r = respaldarBase({ dbPath, dir });
if (r.creado) {
  console.log(`Respaldo creado: ${r.archivo}`);
  if (r.eliminados) console.log(`Se borraron ${r.eliminados} respaldo(s) viejo(s) por rotación.`);
  if (r.noEliminados?.length) console.warn(`No se pudieron borrar: ${r.noEliminados.join(', ')}`);
} else if (r.motivo === 'sin-cambios') {
  console.log(`La base no cambió desde el último respaldo (${r.archivo}). No se creó otro.`);
} else {
  // Código de salida distinto de 0: si esto corre programado, una ruta mal
  // escrita no puede pasar por "éxito" y dejar al negocio sin respaldos.
  console.error(`No hay base para respaldar en ${dbPath}.`);
  process.exitCode = 1;
}
