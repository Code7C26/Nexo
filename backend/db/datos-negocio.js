// Todos los datos de un negocio, para descargarlos y para borrarlos cuando se
// da de baja (etapa 8b, Fase 4, hist. §109; Ley 25.326: acceso y supresión).
//
// No hay una lista de tablas escrita a mano: se arma del esquema. Una tabla
// con organizacion_id es del negocio de esa columna. Una sin la columna (los
// renglones de una venta, los cobros, los atributos de un producto) hereda el
// negocio de la fila a la que apunta por FK, como hereda el aislamiento
// (CLAUDE.md §28). Así una tabla nueva queda cubierta sin tocar este archivo,
// y no se puede olvidar ninguna. Las de la cuenta de una persona no son de un
// negocio y nunca se tocan acá.
import db, { withTransaction } from './index.js';

// La cuenta (identidad, mail, contraseña) es de la persona, que puede estar en
// otros negocios. organizaciones es el negocio en sí: su fila queda vacía.
const DE_LA_CUENTA = new Set(['organizaciones', 'usuarios', 'tokens_cuenta', 'codigos_mail']);
// Lo que no sale en la descarga: las sesiones abiertas, y cualquier columna
// con un secreto (el hash de una invitación).
const SIN_DESCARGA = new Set(['sesiones']);
const COLUMNA_SECRETA = /(^token$|_hash$|_salt$)/;

// Cada tabla del negocio con su condición para "es de este negocio" (con el
// id del negocio en el lugar de ?ORG?) y cuántos saltos de FK hay hasta una
// tabla con organizacion_id. El esquema no cambia con el servidor andando:
// se arma una sola vez.
let tablas = null;
function tablasDelNegocio() {
  if (tablas) return tablas;
  const nombres = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((t) => t.name)
    .filter((t) => !DE_LA_CUENTA.has(t));
  const esquema = new Map(
    nombres.map((t) => [
      t,
      {
        columnas: db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name),
        fks: db.prepare(`PRAGMA foreign_key_list(${t})`).all()
      }
    ])
  );
  const resueltas = new Map();
  function resolver(t, visitadas) {
    if (resueltas.has(t)) return resueltas.get(t);
    const info = esquema.get(t);
    if (!info || visitadas.has(t)) return null;
    let resultado = null;
    if (info.columnas.includes('organizacion_id')) {
      resultado = { condicion: `${t}.organizacion_id = ?ORG?`, saltos: 0 };
    } else {
      // Por cualquiera de sus FK hacia algo del negocio: una columna nula (un
      // movimiento de cuenta corriente sin cobro) no deja la fila afuera.
      const caminos = info.fks
        .map((fk) => ({ fk, padre: resolver(fk.table, new Set([...visitadas, t])) }))
        .filter((c) => c.padre);
      if (caminos.length) {
        resultado = {
          condicion: `(${caminos
            .map(({ fk, padre }) => `${t}.${fk.from} IN (SELECT ${fk.table}.${fk.to ?? 'id'} FROM ${fk.table} WHERE ${padre.condicion})`)
            .join(' OR ')})`,
          saltos: 1 + Math.max(...caminos.map((c) => c.padre.saltos))
        };
      }
    }
    resueltas.set(t, resultado);
    return resultado;
  }
  tablas = nombres
    .map((nombre) => ({ nombre, ...resolver(nombre, new Set()) }))
    .filter((t) => t.condicion);
  return tablas;
}

// El id va escrito en el SQL: es un entero que sale de la base, nunca del
// pedido, y así cada condición sirve igual en un SELECT o en un DELETE.
function condicionPara(tabla, organizacionId) {
  if (!Number.isInteger(organizacionId)) throw new Error(`Negocio inválido: ${organizacionId}`);
  return tabla.condicion.replaceAll('?ORG?', String(organizacionId));
}

// Cuántas filas tiene el negocio en cada tabla. Para los tests y el log del
// borrado.
export function contarFilasDelNegocio(organizacionId) {
  return Object.fromEntries(
    tablasDelNegocio().map((t) => [
      t.nombre,
      db.prepare(`SELECT COUNT(*) AS n FROM ${t.nombre} WHERE ${condicionPara(t, organizacionId)}`).get().n
    ])
  );
}

// "Descargar los datos": todo lo del negocio en un objeto que se guarda como
// JSON. Las tablas van con sus columnas tal cual (es la copia completa, para
// llevarla a otro sistema o guardarla); el equipo, con el nombre y el mail de
// cada persona en vez de su id de cuenta.
export function exportarNegocio(organizacionId) {
  const negocio = db.prepare('SELECT * FROM organizaciones WHERE id = ?').get(organizacionId);
  const equipo = db
    .prepare(
      `SELECT usuarios.nombre, usuarios.email, pertenencia.rol, pertenencia.activo, pertenencia.fecha_alta
         FROM usuario_organizaciones pertenencia
         JOIN usuarios ON usuarios.id = pertenencia.usuario_id
        WHERE pertenencia.organizacion_id = ?
        ORDER BY usuarios.nombre`
    )
    .all(organizacionId);
  const datos = {};
  for (const t of tablasDelNegocio()) {
    if (SIN_DESCARGA.has(t.nombre)) continue;
    const filas = db.prepare(`SELECT ${t.nombre}.* FROM ${t.nombre} WHERE ${condicionPara(t, organizacionId)} ORDER BY rowid`).all();
    if (!filas.length) continue;
    datos[t.nombre] = filas.map((fila) =>
      Object.fromEntries(Object.entries(fila).filter(([columna]) => !COLUMNA_SECRETA.test(columna)))
    );
  }
  return {
    formato: 'nexo-datos-del-negocio',
    version: 1,
    exportado: new Date().toISOString(),
    negocio,
    equipo,
    tablas: datos
  };
}

// Borra todo lo del negocio, en una transacción: o se va todo o no se va
// nada. Primero las tablas más lejos de organizacion_id (los renglones antes
// que las ventas): la condición de una hija lee a su padre, que todavía
// tiene que estar. Con las FK apagadas para no depender del orden entre las
// que sí tienen la columna, y al final se controla que no quede ninguna FK
// rota que antes no estuviera. La fila de organizaciones queda, sin sus
// datos: usuarios.organizacion_id (el negocio donde nació una cuenta) la
// sigue referenciando.
export function borrarDatosNegocio(organizacionId) {
  const orden = [...tablasDelNegocio()].sort((a, b) => b.saltos - a.saltos);
  const rotasAntes = db.prepare('PRAGMA foreign_key_check').all().length;
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    return withTransaction(() => {
      const borradas = {};
      for (const t of orden) {
        const { changes } = db.prepare(`DELETE FROM ${t.nombre} WHERE ${condicionPara(t, organizacionId)}`).run();
        if (changes) borradas[t.nombre] = Number(changes);
      }
      db.prepare(
        `UPDATE organizaciones
            SET nombre = 'Negocio dado de baja', documento = NULL, direccion = NULL, telefono = NULL, email = NULL,
                condicion_iva = NULL, pie_comprobante = NULL, baja_hecha = datetime('now')
          WHERE id = ?`
      ).run(organizacionId);
      const rotasDespues = db.prepare('PRAGMA foreign_key_check').all().length;
      if (rotasDespues > rotasAntes) {
        throw new Error(`El borrado del negocio ${organizacionId} dejaba ${rotasDespues - rotasAntes} referencias rotas.`);
      }
      return borradas;
    });
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}
