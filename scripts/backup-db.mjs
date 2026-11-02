// Respaldo manual de la base: `cd backend && npm run backup`.
//
// Hace lo mismo que el respaldo automático de cada arranque (db/respaldo.js) y
// respeta las mismas variables de entorno: NEXO_DB_PATH, NEXO_BACKUP_DIR y
// NEXO_BACKUP_KEEP. Sirve para sacar una copia antes de una operación riesgosa
// sin tener que reiniciar el servidor, o para programarla desde el Programador
// de tareas de Windows o un cron.
//
// Con el respaldo en la nube configurado (NEXO_B2_* y NEXO_RESPALDO_CLAVE, ver
// db/respaldo-nube.js), después sube cifrada la copia más reciente, si todavía
// no está allá. En el servidor lo corre nexo-respaldo.timer todos los días. Si
// la subida falla, sale con error y, si hay mail configurado, avisa al titular.
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { respaldarBase, rutasDeRespaldo } from '../backend/db/respaldo.js';
import { configNube, subirRespaldo } from '../backend/db/respaldo-nube.js';
import { mailConfigurado, mandarMail, plantillaMail } from '../backend/mail.js';

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

// Sin cambios en la base igual se intenta: si la subida de ayer falló, esta la
// reintenta (subirRespaldo no sube dos veces la misma copia).
if (r.archivo) {
  try {
    const nube = configNube();
    if (!nube) {
      console.log('Respaldo en la nube: no configurado (NEXO_B2_*).');
    } else {
      const s = await subirRespaldo(nube, r.archivo);
      console.log(s.subido
        ? `Subido a la nube (${nube.bucket}): ${s.nombre}, ${Math.ceil(s.bytes / 1024)} KB cifrados.`
        : `Ya estaba en la nube: ${s.nombre}.`);
    }
  } catch (err) {
    console.error(`No se pudo subir el respaldo a la nube: ${err.message}`);
    process.exitCode = 1;
    await avisarFallo(err.message);
  }
}

async function avisarFallo(motivo) {
  const para = (process.env.NEXO_TITULAR_EMAIL || process.env.NEXO_SMTP_USUARIO || '').trim();
  if (!mailConfigurado() || !para) return;
  const { texto, html } = plantillaMail({
    titulo: 'El respaldo de Nexo no llegó a la nube',
    parrafos: [
      `El respaldo de hoy quedó en el servidor, pero no se pudo subir la copia a la nube: ${motivo}`,
      'Mañana se reintenta solo. Si este aviso se repite, revisá las claves de Backblaze en /etc/nexo/nexo.env y el log con journalctl -u nexo-respaldo.'
    ],
    pie: 'Aviso automático del respaldo diario de Nexo.'
  });
  try {
    await mandarMail({ para, asunto: 'Nexo: falló el respaldo en la nube', texto, html });
  } catch (err) {
    console.error(`Tampoco se pudo mandar el aviso por mail: ${err.message}`);
  }
}
