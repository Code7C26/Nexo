// Respaldo automático de la base (CLAUDE.md §35, "Backups").
//
// Se llama desde db/index.js ANTES de abrir la base y de correr las
// migraciones, que son destructivas por diseño (rebuilds con DROP + RENAME):
// si una sale mal, lo único que separa al negocio de perder sus datos es la
// copia que se haya hecho justo antes. Hasta ahora esa copia la hacía un
// humano a mano y vivía en la misma carpeta que la base.
//
// db/index.js no tiene tabla de versiones de esquema (cada migración detecta
// su estado mirando sqlite_master), así que "¿hay una migración pendiente?" no
// se puede responder de forma genérica. En su lugar se respalda en cada
// arranque y se evitan los duplicados: si la base no cambió desde el último
// respaldo, no se crea otro. La rotación acota el espacio.
//
// Usa VACUUM INTO y no una copia de archivo: da una copia consistente aunque la
// base esté en modo WAL o tenga una transacción a medias de un arranque caído.
//
// Lo único crítico es que el respaldo nuevo exista. La limpieza (rotación,
// temporales viejos) es higiene: si falla, se informa pero no corta nada.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

// Solo se rota lo que este módulo creó: cualquier otro archivo que alguien deje
// en la carpeta de respaldos (notas, una copia manual) no se toca.
const PATRON_RESPALDO = /^nexo-\d{8}-\d{6}\.db$/;
const PATRON_TEMPORAL = /^\.tmp-.*\.db$/;
const CONSERVAR_POR_DEFECTO = 14;
const TEMPORAL_HUERFANO_MS = 60 * 60 * 1000;

// Campos del encabezado de SQLite que cambian sin que cambie ningún dato: el
// contador de cambios (bytes 24-27), la cookie de esquema (40-43) y su
// "version-valid-for" (92-95). db/index.js recrea vistas en cada arranque, así
// que sin ignorarlos todo arranque parecería una base distinta.
const CAMPOS_VOLATILES = [[24, 28], [40, 44], [92, 96]];

// Los nombres van en UTC: ordenan igual que el tiempo y no dependen de la zona
// horaria ni del horario de verano de la máquina.
function sello(fecha) {
  const iso = fecha.toISOString();
  return `${iso.slice(0, 10).replaceAll('-', '')}-${iso.slice(11, 19).replaceAll(':', '')}`;
}

// Rutas de la base y de los respaldos, con sus variables de entorno. Las usan
// db/index.js y scripts/backup-db.mjs para que ambos miren siempre lo mismo.
// `dirDb` es la carpeta backend/db. Por defecto los respaldos van a <repo>/backups.
// `||` y no `??`: una variable definida pero vacía cuenta como no definida.
export function rutasDeRespaldo(dirDb) {
  return {
    dbPath: process.env.NEXO_DB_PATH || path.join(dirDb, 'nexo.db'),
    dir: process.env.NEXO_BACKUP_DIR || path.join(dirDb, '..', '..', 'backups')
  };
}

// Huella del contenido de un respaldo, para saber si dos son "lo mismo". Lee en
// bloques (la base puede crecer) y pone en cero los campos volátiles, que viven
// todos en el primer bloque. Un archivo vacío o truncado no rompe: da otra
// huella, o sea "distinto", y se respalda de nuevo.
function huella(archivo) {
  const fd = openSync(archivo, 'r');
  const bloque = Buffer.allocUnsafe(1 << 20);
  const hash = createHash('sha256');
  try {
    for (let pos = 0, leidos; (leidos = readSync(fd, bloque, 0, bloque.length, pos)) > 0; pos += leidos) {
      if (pos === 0) {
        for (const [desde, hasta] of CAMPOS_VOLATILES) bloque.fill(0, Math.min(desde, leidos), Math.min(hasta, leidos));
      }
      hash.update(bloque.subarray(0, leidos));
    }
  } finally {
    closeSync(fd);
  }
  return hash.digest('hex');
}

// Un respaldo anterior que no se puede leer cuenta como "distinto": mejor un
// respaldo de más que quedarse sin el de hoy por culpa de uno roto.
function sonIguales(a, b) {
  try {
    return huella(a) === huella(b);
  } catch {
    return false;
  }
}

// rmSync que no corta nada: devuelve si pudo. En Windows borrar un archivo que
// otro proceso tiene abierto (un visor de bases, el antivirus, un cliente de
// sincronización) tira EPERM, y eso no justifica frenar el arranque.
function borrarSiPuede(ruta) {
  try {
    rmSync(ruta, { force: true });
    return true;
  } catch {
    return false;
  }
}

export function respaldarBase({
  dbPath,
  dir,
  conservar = Number(process.env.NEXO_BACKUP_KEEP) || CONSERVAR_POR_DEFECTO,
  ahora = new Date()
}) {
  // Primer arranque: no hay nada que perder, y abrir la ruta con DatabaseSync
  // crearía una base vacía antes de que schema.sql tenga oportunidad de hacerlo.
  if (!existsSync(dbPath) || statSync(dbPath).size === 0) {
    return { creado: false, motivo: 'sin-base' };
  }

  mkdirSync(dir, { recursive: true });

  // Temporales de un arranque anterior que murió en medio del VACUUM (en
  // Windows `node --watch` mata el proceso sin correr los `finally`).
  for (const nombre of readdirSync(dir).filter((n) => PATRON_TEMPORAL.test(n))) {
    const ruta = path.join(dir, nombre);
    if (Date.now() - statSync(ruta).mtimeMs > TEMPORAL_HUERFANO_MS) borrarSiPuede(ruta);
  }

  const temporal = path.join(dir, `.tmp-${process.pid}-${Date.now()}.db`);
  try {
    const origen = new DatabaseSync(dbPath);
    try {
      // Si el servidor está escribiendo justo ahora (npm run backup con el
      // servidor andando), esperar un poco en vez de fallar con "locked".
      origen.exec('PRAGMA busy_timeout = 5000');
      origen.exec(`VACUUM INTO '${temporal.replaceAll("'", "''")}'`);
    } finally {
      origen.close();
    }

    // La base viva no es un respaldo aunque su nombre lo parezca (pasa al
    // verificar una restauración apuntando NEXO_DB_PATH a un archivo de esta
    // carpeta): no se compara contra sí misma ni entra en la rotación.
    const vivo = path.resolve(dbPath);
    const existentes = readdirSync(dir)
      .filter((nombre) => PATRON_RESPALDO.test(nombre) && path.resolve(dir, nombre) !== vivo)
      .sort();

    // "Último" por fecha de modificación y no por nombre: si el reloj de la
    // máquina retrocedió, el más reciente no es el de nombre mayor.
    const ultimo = existentes
      .map((nombre) => ({ nombre, t: statSync(path.join(dir, nombre)).mtimeMs }))
      .sort((a, b) => b.t - a.t)[0]?.nombre;
    if (ultimo && sonIguales(path.join(dir, ultimo), temporal)) {
      return { creado: false, motivo: 'sin-cambios', archivo: path.join(dir, ultimo) };
    }

    // Dos respaldos en el mismo segundo (un reinicio rápido con --watch) no se
    // pisan: el nombre se corre de a un segundo hasta encontrar uno libre.
    let momento = ahora;
    let archivo = path.join(dir, `nexo-${sello(momento)}.db`);
    while (existsSync(archivo)) {
      momento = new Date(momento.getTime() + 1000);
      archivo = path.join(dir, `nexo-${sello(momento)}.db`);
    }
    renameSync(temporal, archivo);

    // El respaldo recién creado nunca es candidato a borrarse: la rotación
    // trabaja solo sobre los anteriores, y deja lugar para el nuevo.
    const sobrantes = existentes.slice(0, Math.max(0, existentes.length - (Math.max(1, conservar) - 1)));
    const noEliminados = sobrantes.filter((nombre) => !borrarSiPuede(path.join(dir, nombre)));
    return { creado: true, archivo, eliminados: sobrantes.length - noEliminados.length, noEliminados };
  } finally {
    borrarSiPuede(temporal);
  }
}
