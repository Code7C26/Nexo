import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { respaldarBase, rutasDeRespaldo } from './respaldo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// NEXO_DB_PATH permite apuntar el servidor a otra base (pruebas, copias de
// verificación) sin tocar la real. Sin la variable, la base de siempre.
const { dbPath, dir: dirRespaldos } = rutasDeRespaldo(__dirname);

// Respaldo ANTES de abrir la base: lo que sigue (schema.sql, los rebuilds)
// puede reescribir tablas enteras. Si el respaldo falla se corta el arranque a
// propósito: seguir sin red de seguridad es peor que no arrancar. NEXO_BACKUP=off
// lo apaga (pruebas); NEXO_BACKUP_DIR cambia el destino, por ejemplo a una
// carpeta sincronizada con la nube. Ver db/respaldo.js (CLAUDE.md §35).
if (process.env.NEXO_BACKUP !== 'off') {
  let respaldo;
  try {
    respaldo = respaldarBase({ dbPath, dir: dirRespaldos });
  } catch (err) {
    throw new Error(
      `No se pudo respaldar la base antes de arrancar. Revisá el espacio y los permisos de ${dirRespaldos} ` +
        '(o arrancá con NEXO_BACKUP=off bajo tu responsabilidad: las migraciones son destructivas).',
      { cause: err }
    );
  }
  if (respaldo.creado) console.log(`Respaldo de la base: ${respaldo.archivo}`);
  if (respaldo.noEliminados?.length) {
    console.warn(`No se pudieron borrar respaldos viejos (¿abiertos en otro programa?): ${respaldo.noEliminados.join(', ')}`);
  }
}

const db = new DatabaseSync(dbPath);

db.exec(readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// organizaciones: no es un dato de ejemplo, es infraestructura real —
// usuarios.organizacion_id la necesita para existir, y desde la Etapa A
// (CLAUDE.md §28) todas las tablas de negocio cuelgan de ella. Se siembra
// acá, antes que nada, porque el rebuild de catálogos de abajo y el seed del
// depósito principal ya necesitan una organización a la que asignar filas.
const { count: orgCount } = db.prepare('SELECT COUNT(*) AS count FROM organizaciones').get();
if (orgCount === 0) {
  db.prepare('INSERT INTO organizaciones (nombre) VALUES (?)').run('Mi negocio');
}
const primeraOrganizacionId = db.prepare('SELECT id FROM organizaciones ORDER BY id LIMIT 1').get().id;

// cuentas_tesoreria.saldo_inicial: la plata que ya había antes de usar el
// sistema. Las cuentas que ya existen arrancan en 0, así que su saldo
// sigue siendo exactamente la suma de sus movimientos — el número que se
// venía calculando hasta ahora no cambia. Va antes del rebuild de catálogos
// de abajo porque su INSERT..SELECT la lee.
const cuentasColumnas = db.prepare('PRAGMA table_info(cuentas_tesoreria)').all();
if (!cuentasColumnas.some((col) => col.name === 'saldo_inicial')) {
  db.exec('ALTER TABLE cuentas_tesoreria ADD COLUMN saldo_inicial REAL NOT NULL DEFAULT 0');
}

// Catálogos por organización (Etapa A, CLAUDE.md §28): categorias,
// listas_precios, depositos, cuentas_tesoreria y categorias_gasto pasan de
// UNIQUE(nombre) global a UNIQUE(organizacion_id, nombre), con
// organizacion_id NOT NULL (ver el porqué en schema.sql, comentario de
// categorias). Hace falta rebuild y no un ALTER: el UNIQUE de columna es un
// índice automático que SQLite no deja tirar. Mismo procedimiento que el
// rebuild de compras, que también es tabla padre de FKs: los id se
// preservan, así que productos.categoria_id, cobros.cuenta_tesoreria_id,
// movimientos_stock.deposito_id, etc. siguen apuntando a la misma fila.
// Todas las filas existentes quedan en la primera organización: hasta acá
// los catálogos eran globales, y la única empresa real es esa.
// Va al principio del archivo para que todo lo que sigue (seeds incluidos)
// ya encuentre estas tablas en su forma final. saldo_tesoreria apunta a
// cuentas_tesoreria, así que se tira antes del RENAME (SQLite valida las
// vistas durante esa operación) y se recrea más abajo, con el resto de la
// definición de esa vista.
const CATALOGOS_POR_ORGANIZACION = [
  {
    tabla: 'categorias',
    columnas: 'id, nombre, activa',
    definicion: `
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      activa INTEGER NOT NULL DEFAULT 1,
      organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id),
      UNIQUE (organizacion_id, nombre)`
  },
  {
    tabla: 'listas_precios',
    columnas: 'id, nombre, activa, es_predeterminada',
    definicion: `
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      activa INTEGER NOT NULL DEFAULT 1,
      es_predeterminada INTEGER NOT NULL DEFAULT 0,
      organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id),
      UNIQUE (organizacion_id, nombre)`
  },
  {
    tabla: 'depositos',
    columnas: 'id, nombre, direccion, activo, es_predeterminado',
    definicion: `
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      direccion TEXT,
      activo INTEGER NOT NULL DEFAULT 1,
      es_predeterminado INTEGER NOT NULL DEFAULT 0,
      organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id),
      UNIQUE (organizacion_id, nombre)`
  },
  {
    tabla: 'cuentas_tesoreria',
    columnas: 'id, nombre, tipo, saldo_inicial',
    vistas: ['saldo_tesoreria'],
    definicion: `
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      tipo TEXT NOT NULL CHECK (tipo IN ('efectivo', 'banco', 'mercadopago', 'otro')),
      saldo_inicial REAL NOT NULL DEFAULT 0,
      organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id),
      UNIQUE (organizacion_id, nombre)`
  },
  {
    tabla: 'categorias_gasto',
    columnas: 'id, nombre, tipo, activa',
    definicion: `
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      tipo TEXT NOT NULL CHECK (tipo IN ('operativo', 'inversion', 'retiro')),
      activa INTEGER NOT NULL DEFAULT 1,
      organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id),
      UNIQUE (organizacion_id, nombre)`
  }
];
for (const { tabla, columnas, definicion, vistas = [] } of CATALOGOS_POR_ORGANIZACION) {
  const actual = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(tabla);
  if (actual && !actual.sql.includes('UNIQUE (organizacion_id, nombre)')) {
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      for (const vista of vistas) {
        db.exec(`DROP VIEW IF EXISTS ${vista}`);
      }
      db.exec(`CREATE TABLE ${tabla}_nueva (${definicion})`);
      db.prepare(
        `INSERT INTO ${tabla}_nueva (${columnas}, organizacion_id)
         SELECT ${columnas}, ? FROM ${tabla}`
      ).run(primeraOrganizacionId);
      db.exec(`DROP TABLE ${tabla}`);
      db.exec(`ALTER TABLE ${tabla}_nueva RENAME TO ${tabla}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    db.exec('PRAGMA foreign_keys = ON');
  }
}

// `CREATE TABLE IF NOT EXISTS` no altera una tabla que ya existe, así que
// facturas.venta_id (agregada después de que nexo.db ya tenía datos) se
// migra a mano acá. Nullable y aditiva: las filas viejas quedan en NULL.
const facturasColumnas = db.prepare('PRAGMA table_info(facturas)').all();
if (!facturasColumnas.some((col) => col.name === 'venta_id')) {
  db.exec('ALTER TABLE facturas ADD COLUMN venta_id INTEGER REFERENCES ventas(id)');
}

// Una venta no debería poder facturarse dos veces. Índice único parcial
// (solo exige unicidad cuando venta_id no es NULL, para no romper las
// facturas sueltas sin venta asociada).
db.exec(
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_facturas_venta_id ON facturas(venta_id) WHERE venta_id IS NOT NULL'
);

// Mismo criterio para presupuestos: dos presupuestos distintos no pueden
// reclamar la misma venta. Parcial también, porque venta_id está en NULL
// mientras el presupuesto no se convirtió (que es la mayoría del tiempo).
db.exec(
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_presupuestos_venta_id ON presupuestos(venta_id) WHERE venta_id IS NOT NULL'
);
// Una devolución puede respaldar una nota de crédito (CLAUDE.md §16 y
// §17), igual que una venta respalda una factura. Aditivo y nullable:
// las facturas ya emitidas no tienen devolución detrás.
const facturasColumnas2 = db.prepare('PRAGMA table_info(facturas)').all();
if (!facturasColumnas2.some((col) => col.name === 'devolucion_id')) {
  db.exec('ALTER TABLE facturas ADD COLUMN devolucion_id INTEGER REFERENCES devoluciones(id)');
}

// Una devolución no puede tener dos notas de crédito: mismo patrón que
// idx_facturas_venta_id, parcial porque la mayoría de las facturas no
// respaldan una devolución.
db.exec(
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_facturas_devolucion_id ON facturas(devolucion_id) WHERE devolucion_id IS NOT NULL'
);

// Estructura de comprobante fiscal (ver el comentario largo en
// schema.sql): tipo/letra/punto_venta con default, y numero nullable
// porque en una base nueva lo asigna la aplicación al emitir.
if (!facturasColumnas.some((col) => col.name === 'tipo')) {
  db.exec(
    "ALTER TABLE facturas ADD COLUMN tipo TEXT NOT NULL DEFAULT 'factura' CHECK (tipo IN ('factura', 'nota_credito', 'nota_debito'))"
  );
  db.exec("ALTER TABLE facturas ADD COLUMN letra TEXT NOT NULL DEFAULT 'B' CHECK (letra IN ('A', 'B', 'C'))");
  db.exec('ALTER TABLE facturas ADD COLUMN punto_venta INTEGER NOT NULL DEFAULT 1');
  db.exec('ALTER TABLE facturas ADD COLUMN numero INTEGER');

  // Backfill de las facturas que ya existían: todas caen en el mismo
  // grupo (punto_venta=1, tipo='factura', letra='B', recién puestos por
  // el DEFAULT de arriba), así que numerarlas correlativas por orden de
  // id les da una numeración válida y sin huecos.
  const facturasViejas = db.prepare('SELECT id FROM facturas ORDER BY id').all();
  const asignarNumero = db.prepare('UPDATE facturas SET numero = ? WHERE id = ?');
  facturasViejas.forEach((f, i) => asignarNumero.run(i + 1, f.id));
}

// La numeración es por (punto de venta, tipo, letra): cada combinación
// tiene su propia serie. El índice es la garantía real de que no se
// repite un número — calcular MAX(numero)+1 y después insertar no es
// atómico, así que dos facturaciones simultáneas podrían pedir el mismo.
// Se migra a incluir organizacion_id más abajo (Etapa A, después de que esa
// columna existe en `facturas`), ver ahí el motivo.
db.exec(
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_facturas_numeracion ON facturas(punto_venta, tipo, letra, numero)'
);

// venta_items.costo_unitario_historico: foto del costo del producto al
// momento de vender (ver comentario en schema.sql). Las filas viejas
// quedan en 0 porque no hay forma de reconstruir retroactivamente qué
// costo tenía el producto en ese momento exacto.
const ventaItemsColumnas = db.prepare('PRAGMA table_info(venta_items)').all();
if (!ventaItemsColumnas.some((col) => col.name === 'costo_unitario_historico')) {
  db.exec('ALTER TABLE venta_items ADD COLUMN costo_unitario_historico REAL NOT NULL DEFAULT 0');
}

// movimientos_stock: reemplazo de origen_id (sin FK real) por venta_id /
// compra_id (con FK real). Se agregan y se backfillean desde las
// columnas viejas, que quedan sin usar pero no se borran (ver schema.sql).
const movimientosColumnas = db.prepare('PRAGMA table_info(movimientos_stock)').all();
if (!movimientosColumnas.some((col) => col.name === 'venta_id')) {
  db.exec('ALTER TABLE movimientos_stock ADD COLUMN venta_id INTEGER REFERENCES ventas(id)');
  db.exec('ALTER TABLE movimientos_stock ADD COLUMN compra_id INTEGER REFERENCES compras(id)');
  db.exec(
    "UPDATE movimientos_stock SET venta_id = origen_id WHERE origen = 'venta' AND origen_id IS NOT NULL"
  );
  db.exec(
    "UPDATE movimientos_stock SET compra_id = origen_id WHERE origen = 'compra' AND origen_id IS NOT NULL"
  );
}

// movimientos_stock.costo_unitario: costo con el envío prorrateado (ver
// compra_items.costo_real_unitario más abajo). Va acá, antes de los tres
// rebuilds de movimientos_stock que siguen, porque sus INSERT..SELECT leen
// esta columna: en una base anterior a ella, el primer rebuild reventaba con
// "no such column: costo_unitario" en todos los arranques.
if (!movimientosColumnas.some((col) => col.name === 'costo_unitario')) {
  db.exec('ALTER TABLE movimientos_stock ADD COLUMN costo_unitario REAL');
}

// movimientos_stock: agregar 'devolucion' al CHECK de origen y la columna
// devolucion_id obliga a reconstruir la tabla (SQLite no permite modificar
// un CHECK con ALTER TABLE) — mismo procedimiento ya usado para compras y
// movimientos_tesoreria más abajo. Es seguro: los id se preservan, y
// ninguna tabla referencia a movimientos_stock con FK.
// La vista stock_actual (schema.sql) apunta a esta tabla, así que hay que
// tirarla antes del RENAME (SQLite la valida durante esa operación) y
// recrearla dentro de la misma transacción — a diferencia de
// saldo_tesoreria, esta vista no se vuelve a crear más abajo en este
// archivo, porque ya se creó al correr schema.sql al principio.
const movimientosStockSql = db
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'movimientos_stock'")
  .get();
if (movimientosStockSql && !movimientosStockSql.sql.includes("'devolucion'")) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    db.exec('DROP VIEW IF EXISTS stock_actual');
    db.exec(`
      CREATE TABLE movimientos_stock_nueva (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        producto_id INTEGER NOT NULL REFERENCES productos(id),
        tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida', 'ajuste')),
        cantidad REAL NOT NULL,
        origen TEXT NOT NULL CHECK (origen IN ('venta', 'compra', 'ajuste_manual', 'devolucion')),
        origen_id INTEGER,
        venta_id INTEGER REFERENCES ventas(id),
        compra_id INTEGER REFERENCES compras(id),
        devolucion_id INTEGER REFERENCES devoluciones(id),
        fecha TEXT NOT NULL DEFAULT (date('now')),
        costo_unitario REAL,
        nota TEXT
      )
    `);
    db.exec(`
      INSERT INTO movimientos_stock_nueva
             (id, producto_id, tipo, cantidad, origen, origen_id, venta_id, compra_id, fecha, costo_unitario, nota)
      SELECT  id, producto_id, tipo, cantidad, origen, origen_id, venta_id, compra_id, fecha, costo_unitario, nota
        FROM movimientos_stock
    `);
    db.exec('DROP TABLE movimientos_stock');
    db.exec('ALTER TABLE movimientos_stock_nueva RENAME TO movimientos_stock');
    db.exec(`
      CREATE VIEW stock_actual AS
      SELECT producto_id,
             SUM(CASE tipo
                   WHEN 'entrada' THEN cantidad
                   WHEN 'salida' THEN -cantidad
                   ELSE cantidad
                 END) AS cantidad
      FROM movimientos_stock
      GROUP BY producto_id
    `);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  db.exec('PRAGMA foreign_keys = ON');
}

// movimientos_stock: agregar 'devolucion_proveedor' al CHECK de origen y
// la columna devolucion_proveedor_id — mismo motivo y mismo procedimiento
// que el rebuild de arriba que agregó 'devolucion'. devoluciones_proveedor
// ya existe en este punto (se creó al correr schema.sql al principio del
// archivo), así que la FK resuelve bien.
const movimientosStockSql2 = db
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'movimientos_stock'")
  .get();
if (movimientosStockSql2 && !movimientosStockSql2.sql.includes("'devolucion_proveedor'")) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    db.exec('DROP VIEW IF EXISTS stock_actual');
    db.exec(`
      CREATE TABLE movimientos_stock_nueva2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        producto_id INTEGER NOT NULL REFERENCES productos(id),
        tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida', 'ajuste')),
        cantidad REAL NOT NULL,
        origen TEXT NOT NULL CHECK (origen IN ('venta', 'compra', 'ajuste_manual', 'devolucion', 'devolucion_proveedor')),
        origen_id INTEGER,
        venta_id INTEGER REFERENCES ventas(id),
        compra_id INTEGER REFERENCES compras(id),
        devolucion_id INTEGER REFERENCES devoluciones(id),
        devolucion_proveedor_id INTEGER REFERENCES devoluciones_proveedor(id),
        fecha TEXT NOT NULL DEFAULT (date('now')),
        costo_unitario REAL,
        nota TEXT
      )
    `);
    db.exec(`
      INSERT INTO movimientos_stock_nueva2
             (id, producto_id, tipo, cantidad, origen, origen_id, venta_id, compra_id, devolucion_id, fecha, costo_unitario, nota)
      SELECT  id, producto_id, tipo, cantidad, origen, origen_id, venta_id, compra_id, devolucion_id, fecha, costo_unitario, nota
        FROM movimientos_stock
    `);
    db.exec('DROP TABLE movimientos_stock');
    db.exec('ALTER TABLE movimientos_stock_nueva2 RENAME TO movimientos_stock');
    db.exec(`
      CREATE VIEW stock_actual AS
      SELECT producto_id,
             SUM(CASE tipo
                   WHEN 'entrada' THEN cantidad
                   WHEN 'salida' THEN -cantidad
                   ELSE cantidad
                 END) AS cantidad
      FROM movimientos_stock
      GROUP BY producto_id
    `);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  db.exec('PRAGMA foreign_keys = ON');
}
// depositos: el depósito predeterminado de la primera organización se
// siembra acá arriba (y no con el resto de los catálogos base al final del
// archivo, ver sembrarCatalogosBase) porque el rebuild de movimientos_stock
// que sigue necesita que ya exista para poder backfillear deposito_id en los
// movimientos históricos — que, por ser anteriores a la Etapa A, son todos
// de esa organización.
const { count: depositosCount } = db
  .prepare('SELECT COUNT(*) AS count FROM depositos WHERE organizacion_id = ?')
  .get(primeraOrganizacionId);
let depositoPrincipalId;
if (depositosCount === 0) {
  ({ lastInsertRowid: depositoPrincipalId } = db
    .prepare('INSERT INTO depositos (nombre, es_predeterminado, organizacion_id) VALUES (?, 1, ?)')
    .run('Depósito principal', primeraOrganizacionId));
} else {
  depositoPrincipalId = db
    .prepare('SELECT id FROM depositos WHERE es_predeterminado = 1 AND organizacion_id = ?')
    .get(primeraOrganizacionId)?.id;
}

// movimientos_stock: agregar deposito_id (CLAUDE.md §5/§19 — el stock se
// maneja por producto Y depósito, no como un total global único) y
// transferencia_id, más 'transferencia' al CHECK de origen. Mismo motivo y
// procedimiento que los dos rebuilds de arriba. Todo el historial existente
// se backfillea al depósito principal recién creado (o al que ya era
// predeterminado, si esta migración corre sobre una base que ya tenía
// depósitos de una corrida anterior cortada a la mitad) — así el stock
// actual de cada producto, sumado entre depósitos, da exactamente el mismo
// número que daba antes de esta etapa: no se mueve ni una unidad, solo se
// le pone nombre a dónde ya estaba.
const movimientosStockSql3 = db
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'movimientos_stock'")
  .get();
if (movimientosStockSql3 && !movimientosStockSql3.sql.includes('deposito_id')) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    db.exec('DROP VIEW IF EXISTS stock_actual');
    db.exec('DROP VIEW IF EXISTS stock_por_deposito');
    db.exec(`
      CREATE TABLE movimientos_stock_nueva3 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        producto_id INTEGER NOT NULL REFERENCES productos(id),
        deposito_id INTEGER NOT NULL REFERENCES depositos(id),
        tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida', 'ajuste')),
        cantidad REAL NOT NULL,
        origen TEXT NOT NULL CHECK (origen IN ('venta', 'compra', 'ajuste_manual', 'devolucion', 'devolucion_proveedor', 'transferencia')),
        origen_id INTEGER,
        venta_id INTEGER REFERENCES ventas(id),
        compra_id INTEGER REFERENCES compras(id),
        devolucion_id INTEGER REFERENCES devoluciones(id),
        devolucion_proveedor_id INTEGER REFERENCES devoluciones_proveedor(id),
        transferencia_id INTEGER REFERENCES transferencias(id),
        fecha TEXT NOT NULL DEFAULT (date('now')),
        costo_unitario REAL,
        nota TEXT
      )
    `);
    db.exec(`
      INSERT INTO movimientos_stock_nueva3
             (id, producto_id, deposito_id, tipo, cantidad, origen, origen_id, venta_id, compra_id, devolucion_id, devolucion_proveedor_id, fecha, costo_unitario, nota)
      SELECT  id, producto_id, ${depositoPrincipalId}, tipo, cantidad, origen, origen_id, venta_id, compra_id, devolucion_id, devolucion_proveedor_id, fecha, costo_unitario, nota
        FROM movimientos_stock
    `);
    db.exec('DROP TABLE movimientos_stock');
    db.exec('ALTER TABLE movimientos_stock_nueva3 RENAME TO movimientos_stock');
    db.exec(`
      CREATE VIEW stock_actual AS
      SELECT producto_id,
             SUM(CASE tipo
                   WHEN 'entrada' THEN cantidad
                   WHEN 'salida' THEN -cantidad
                   ELSE cantidad
                 END) AS cantidad
      FROM movimientos_stock
      GROUP BY producto_id
    `);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  db.exec('PRAGMA foreign_keys = ON');
}

// El índice y stock_por_deposito se crean acá, incondicionales con
// IF NOT EXISTS, en vez de adentro del bloque de arriba: en una base
// FRESCA, schema.sql ya creó movimientos_stock CON deposito_id desde el
// vamos (el guard de arriba da false y el rebuild entero se saltea), así
// que si estas dos líneas vivieran solo adentro del rebuild, una base
// nueva se quedaría sin índice y sin la vista. stock_por_deposito no puede
// vivir en schema.sql: su cuerpo referencia deposito_id, columna que en
// una base existente todavía no está la primera vez que schema.sql corre
// (falla con "no such column") — mismo motivo por el que saldo_tesoreria
// tampoco vive ahí.
db.exec(
  'CREATE INDEX IF NOT EXISTS idx_movimientos_stock_producto_deposito ON movimientos_stock(producto_id, deposito_id)'
);
db.exec(`
  CREATE VIEW IF NOT EXISTS stock_por_deposito AS
  SELECT producto_id,
         deposito_id,
         SUM(CASE tipo
               WHEN 'entrada' THEN cantidad
               WHEN 'salida' THEN -cantidad
               ELSE cantidad
             END) AS cantidad
  FROM movimientos_stock
  GROUP BY producto_id, deposito_id
`);

// compras.estado_envio: informativo, no afecta el stock. Las compras
// viejas quedan en 'recibido' (el default), que es lo correcto: ya
// habían sumado su stock, así que conceptualmente ya estaban recibidas.
const comprasColumnas = db.prepare('PRAGMA table_info(compras)').all();
if (!comprasColumnas.some((col) => col.name === 'estado_envio')) {
  db.exec(
    "ALTER TABLE compras ADD COLUMN estado_envio TEXT NOT NULL DEFAULT 'recibido' CHECK (estado_envio IN ('pedido', 'en_camino', 'recibido'))"
  );
}

// compras: agregar 'borrador' al CHECK de estado obliga a reconstruir la
// tabla, porque SQLite no permite modificar un CHECK con ALTER TABLE. Se
// hace copiando las filas a una tabla nueva y renombrando. Es seguro
// porque los id se preservan tal cual, así que las FK que apuntan acá
// (compra_items, pagos, movimientos_stock, movimientos_cc_proveedores)
// siguen resolviendo a la misma compra.
// Va antes de los ALTER de compras que siguen (deposito_id, condicion_pago,
// fecha_vencimiento, organizacion_id) y después del de estado_envio, que su
// INSERT..SELECT lee: el cuerpo de un rebuild es una foto de la tabla del día
// en que se escribió, así que toda columna agregada por ALTER antes de que
// corra se pierde. Regla para cualquier ALTER nuevo: va después del último
// rebuild de su tabla.
const comprasSql = db
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'compras'")
  .get();
if (comprasSql && !comprasSql.sql.includes('borrador')) {
  // Las compras que ya existían sumaron su stock al crearse (era la regla
  // vieja), así que arrancan con stock_aplicado = 1 para que marcarlas
  // como recibidas no lo vuelva a sumar. Las anuladas quedan en 0 porque
  // su stock ya fue revertido.
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    db.exec(`
      CREATE TABLE compras_nueva (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        proveedor_id INTEGER NOT NULL REFERENCES proveedores(id),
        fecha TEXT NOT NULL DEFAULT (date('now')),
        estado TEXT NOT NULL CHECK (estado IN ('borrador', 'activa', 'anulada')) DEFAULT 'borrador',
        estado_envio TEXT NOT NULL CHECK (estado_envio IN ('pedido', 'en_camino', 'recibido')) DEFAULT 'pedido',
        costo_envio REAL NOT NULL DEFAULT 0,
        stock_aplicado INTEGER NOT NULL DEFAULT 0
      )
    `);
    db.exec(`
      INSERT INTO compras_nueva (id, proveedor_id, fecha, estado, estado_envio, costo_envio, stock_aplicado)
      SELECT id, proveedor_id, fecha, estado, estado_envio, 0,
             CASE WHEN estado = 'anulada' THEN 0 ELSE 1 END
        FROM compras
    `);
    db.exec('DROP TABLE compras');
    db.exec('ALTER TABLE compras_nueva RENAME TO compras');
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  db.exec('PRAGMA foreign_keys = ON');
}

// deposito_id en las operaciones que mueven stock (venta, compra,
// devolución, devolución a proveedor): de qué depósito salió o a cuál
// entró la mercadería de esa operación puntual (CLAUDE.md §19). Nullable,
// mismo criterio que lista_precio_id en ventas/presupuestos: NULL significa
// "el predeterminado de ese momento", no un id fijo copiado — si el día de
// mañana cambia cuál depósito es el predeterminado, las operaciones viejas
// sin depósito propio lo siguen solas.
const ventasColumnasDeposito = db.prepare('PRAGMA table_info(ventas)').all();
if (!ventasColumnasDeposito.some((col) => col.name === 'deposito_id')) {
  db.exec('ALTER TABLE ventas ADD COLUMN deposito_id INTEGER REFERENCES depositos(id)');
}
const comprasColumnasDeposito = db.prepare('PRAGMA table_info(compras)').all();
if (!comprasColumnasDeposito.some((col) => col.name === 'deposito_id')) {
  db.exec('ALTER TABLE compras ADD COLUMN deposito_id INTEGER REFERENCES depositos(id)');
}
const devolucionesColumnasDeposito = db.prepare('PRAGMA table_info(devoluciones)').all();
if (!devolucionesColumnasDeposito.some((col) => col.name === 'deposito_id')) {
  db.exec('ALTER TABLE devoluciones ADD COLUMN deposito_id INTEGER REFERENCES depositos(id)');
}
const devolucionesProveedorColumnasDeposito = db.prepare('PRAGMA table_info(devoluciones_proveedor)').all();
if (!devolucionesProveedorColumnasDeposito.some((col) => col.name === 'deposito_id')) {
  db.exec('ALTER TABLE devoluciones_proveedor ADD COLUMN deposito_id INTEGER REFERENCES depositos(id)');
}

// condicion_pago / fecha_vencimiento en ventas y compras: el plazo pactado
// y la fecha en que la deuda vence, para que el aging de cuentas corrientes
// mida contra el vencimiento real y no contra la fecha de la operación (que
// era la limitación explícita que tenía el reporte hasta ahora).
//
// El backfill deja las operaciones existentes como si hubieran sido de
// contado (vencimiento = su propia fecha). No es una suposición sobre lo que
// se pactó de verdad en cada una: es el único valor que hace que el reporte
// siga dando exactamente los mismos días y el mismo orden que daba antes de
// esta migración, así que nada cambia de lugar retroactivamente y el
// resultado se puede comparar 1:1 pre/post. El WHERE ... IS NULL lo hace
// idempotente y, de paso, evita pisar una operación que ya tenga vencimiento
// propio si esta migración vuelve a correr.
const ventasColumnasVenc = db.prepare('PRAGMA table_info(ventas)').all();
if (!ventasColumnasVenc.some((col) => col.name === 'condicion_pago')) {
  db.exec('ALTER TABLE ventas ADD COLUMN condicion_pago TEXT');
}
if (!ventasColumnasVenc.some((col) => col.name === 'fecha_vencimiento')) {
  db.exec('ALTER TABLE ventas ADD COLUMN fecha_vencimiento TEXT');
}
const comprasColumnasVenc = db.prepare('PRAGMA table_info(compras)').all();
if (!comprasColumnasVenc.some((col) => col.name === 'condicion_pago')) {
  db.exec('ALTER TABLE compras ADD COLUMN condicion_pago TEXT');
}
if (!comprasColumnasVenc.some((col) => col.name === 'fecha_vencimiento')) {
  db.exec('ALTER TABLE compras ADD COLUMN fecha_vencimiento TEXT');
}
db.exec(`
  UPDATE ventas
     SET fecha_vencimiento = fecha, condicion_pago = COALESCE(condicion_pago, 'contado')
   WHERE fecha_vencimiento IS NULL;
  UPDATE compras
     SET fecha_vencimiento = fecha, condicion_pago = COALESCE(condicion_pago, 'contado')
   WHERE fecha_vencimiento IS NULL;
`);

// productos.stock_minimo / stock_maximo: umbrales de la alerta de stock.
// Los productos viejos quedan con mínimo 0 y máximo NULL, o sea sin
// alerta configurada, que es el comportamiento neutro esperado hasta que
// alguien defina los umbrales de ese producto desde su ficha.
const productosColumnas = db.prepare('PRAGMA table_info(productos)').all();
if (!productosColumnas.some((col) => col.name === 'stock_minimo')) {
  db.exec('ALTER TABLE productos ADD COLUMN stock_minimo REAL NOT NULL DEFAULT 0');
  db.exec('ALTER TABLE productos ADD COLUMN stock_maximo REAL');
}

// productos.categoria_id: la tabla `categorias` la crea sola el
// CREATE TABLE IF NOT EXISTS de arriba (es una tabla nueva, no hace falta
// migrarla), pero la columna en `productos` sí, porque esa tabla ya
// existía. Nullable: los productos ya cargados quedan sin categoría, que
// es el estado neutro hasta que alguien la asigne desde la ficha.
if (!productosColumnas.some((col) => col.name === 'categoria_id')) {
  db.exec('ALTER TABLE productos ADD COLUMN categoria_id INTEGER REFERENCES categorias(id)');
}

// productos.margen_objetivo: umbral opcional para la alerta de margen bajo.
// Nullable: sin objetivo cargado no hay alerta, comportamiento neutro para
// todo producto existente hasta que alguien lo defina desde la ficha.
if (!productosColumnas.some((col) => col.name === 'margen_objetivo')) {
  db.exec('ALTER TABLE productos ADD COLUMN margen_objetivo REAL');
}

// productos.organizacion_id: primera tabla de negocio (de ~38) en sumar la
// columna que prepara Nexo para multi-tenant (CLAUDE.md §28). Nullable a
// propósito, no NOT NULL: no hay todavía UI para elegir organización en el
// alta, y el resto de las tablas todavía no tiene esta columna — pasa a
// obligatoria recién cuando el sistema sea multi-tenant de punta a punta.
// El backfill (re-ejecutable, solo toca filas en NULL) va más abajo, después
// de que se siembra la fila de `organizaciones`, porque en una base nueva
// esa tabla todavía está vacía en este punto del arranque.
if (!productosColumnas.some((col) => col.name === 'organizacion_id')) {
  db.exec('ALTER TABLE productos ADD COLUMN organizacion_id INTEGER REFERENCES organizaciones(id)');
}

// clientes.organizacion_id / proveedores.organizacion_id: mismo patrón que
// productos.organizacion_id de arriba, mismos motivos (Etapa A, CLAUDE.md
// §28). El backfill de las tres columnas se hace en un solo bloque más
// abajo, después de que se siembra la fila de `organizaciones`.
const clientesColumnasOrg = db.prepare('PRAGMA table_info(clientes)').all();
if (!clientesColumnasOrg.some((col) => col.name === 'organizacion_id')) {
  db.exec('ALTER TABLE clientes ADD COLUMN organizacion_id INTEGER REFERENCES organizaciones(id)');
}
const proveedoresColumnasOrg = db.prepare('PRAGMA table_info(proveedores)').all();
if (!proveedoresColumnasOrg.some((col) => col.name === 'organizacion_id')) {
  db.exec('ALTER TABLE proveedores ADD COLUMN organizacion_id INTEGER REFERENCES organizaciones(id)');
}

// ventas.organizacion_id / compras.organizacion_id: siguiente lote del mismo
// patrón (Etapa A, CLAUDE.md §28), sobre las dos cabeceras transaccionales
// más centrales. venta_items/compra_items no suman columna propia: se
// filtran vía JOIN a su cabecera, que ya queda organizada acá.
const ventasColumnasOrg = db.prepare('PRAGMA table_info(ventas)').all();
if (!ventasColumnasOrg.some((col) => col.name === 'organizacion_id')) {
  db.exec('ALTER TABLE ventas ADD COLUMN organizacion_id INTEGER REFERENCES organizaciones(id)');
}
const comprasColumnasOrg = db.prepare('PRAGMA table_info(compras)').all();
if (!comprasColumnasOrg.some((col) => col.name === 'organizacion_id')) {
  db.exec('ALTER TABLE compras ADD COLUMN organizacion_id INTEGER REFERENCES organizaciones(id)');
}

// presupuestos.organizacion_id / facturas.organizacion_id: siguiente lote del
// mismo patrón (Etapa A, CLAUDE.md §28), sobre la misma familia
// transaccional. presupuesto_items no suma columna propia: se filtra vía
// JOIN a su cabecera, igual que venta_items/compra_items.
const presupuestosColumnasOrg = db.prepare('PRAGMA table_info(presupuestos)').all();
if (!presupuestosColumnasOrg.some((col) => col.name === 'organizacion_id')) {
  db.exec('ALTER TABLE presupuestos ADD COLUMN organizacion_id INTEGER REFERENCES organizaciones(id)');
}
const facturasColumnasOrg = db.prepare('PRAGMA table_info(facturas)').all();
if (!facturasColumnasOrg.some((col) => col.name === 'organizacion_id')) {
  db.exec('ALTER TABLE facturas ADD COLUMN organizacion_id INTEGER REFERENCES organizaciones(id)');
}

// idx_facturas_numeracion pasa a incluir organizacion_id: cada organización
// es un negocio con su propio CUIT (CLAUDE.md §28/§33), así que no comparte
// correlativo fiscal con otra. Reemplaza la versión anterior (creada más
// arriba, sin esta columna) dropeándola y recreándola — a diferencia de un
// CHECK sobre una columna (CLAUDE.md §34), un índice no necesita reconstruir
// la tabla completa. Se hace acá, recién después de que la columna existe.
const indiceNumeracionActual = db
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_facturas_numeracion'")
  .get();
if (indiceNumeracionActual && !indiceNumeracionActual.sql.includes('organizacion_id')) {
  db.exec('DROP INDEX idx_facturas_numeracion');
  db.exec(
    'CREATE UNIQUE INDEX idx_facturas_numeracion ON facturas(organizacion_id, punto_venta, tipo, letra, numero)'
  );
}

// devoluciones.organizacion_id / devoluciones_proveedor.organizacion_id:
// siguiente lote del mismo patrón (Etapa A, CLAUDE.md §28). Ninguna de las
// dos suma índice nuevo: no tienen numeración correlativa propia como
// facturas.
const devolucionesColumnasOrg = db.prepare('PRAGMA table_info(devoluciones)').all();
if (!devolucionesColumnasOrg.some((col) => col.name === 'organizacion_id')) {
  db.exec('ALTER TABLE devoluciones ADD COLUMN organizacion_id INTEGER REFERENCES organizaciones(id)');
}
const devolucionesProveedorColumnasOrg = db.prepare('PRAGMA table_info(devoluciones_proveedor)').all();
if (!devolucionesProveedorColumnasOrg.some((col) => col.name === 'organizacion_id')) {
  db.exec('ALTER TABLE devoluciones_proveedor ADD COLUMN organizacion_id INTEGER REFERENCES organizaciones(id)');
}

// gastos.organizacion_id: siguiente lote del mismo patrón (Etapa A,
// CLAUDE.md §28).
const gastosColumnasOrg = db.prepare('PRAGMA table_info(gastos)').all();
if (!gastosColumnasOrg.some((col) => col.name === 'organizacion_id')) {
  db.exec('ALTER TABLE gastos ADD COLUMN organizacion_id INTEGER REFERENCES organizaciones(id)');
}

// movimientos_stock.organizacion_id / transferencias.organizacion_id:
// siguiente lote del mismo patrón (Etapa A, CLAUDE.md §28). Ninguna de las
// dos toca un CHECK, así que alcanza el ALTER TABLE aditivo de siempre — no
// hace falta el rebuild completo que sí necesitaron los cambios de §5/§19
// más arriba en este archivo.
const movimientosStockColumnasOrg = db.prepare('PRAGMA table_info(movimientos_stock)').all();
if (!movimientosStockColumnasOrg.some((col) => col.name === 'organizacion_id')) {
  db.exec('ALTER TABLE movimientos_stock ADD COLUMN organizacion_id INTEGER REFERENCES organizaciones(id)');
}
const transferenciasColumnasOrg = db.prepare('PRAGMA table_info(transferencias)').all();
if (!transferenciasColumnasOrg.some((col) => col.name === 'organizacion_id')) {
  db.exec('ALTER TABLE transferencias ADD COLUMN organizacion_id INTEGER REFERENCES organizaciones(id)');
}

// asistente_mensajes.organizacion_id: junto con auditoria.organizacion_id
// (que vive más abajo, después de los rebuilds de esa tabla) cierra el gap
// de lectura más grande que quedaba abierto de la Etapa A (CLAUDE.md §28) —
// eran las dos únicas tablas de datos de negocio sin columna de
// organización. No toca un CHECK, así que alcanza el ALTER aditivo de
// siempre.
const asistenteMensajesColumnasOrg = db.prepare('PRAGMA table_info(asistente_mensajes)').all();
if (!asistenteMensajesColumnasOrg.some((col) => col.name === 'organizacion_id')) {
  db.exec('ALTER TABLE asistente_mensajes ADD COLUMN organizacion_id INTEGER REFERENCES organizaciones(id)');
}

// compra_items.costo_real_unitario (y movimientos_stock.costo_unitario, más
// arriba): costo con el envío prorrateado. Nullable porque las filas viejas se
// cargaron cuando no existía el concepto de costo de envío — para esas,
// el costo real era exactamente el precio unitario.
const compraItemsColumnas = db.prepare('PRAGMA table_info(compra_items)').all();
if (!compraItemsColumnas.some((col) => col.name === 'costo_real_unitario')) {
  db.exec('ALTER TABLE compra_items ADD COLUMN costo_real_unitario REAL');
  db.exec('UPDATE compra_items SET costo_real_unitario = precio_unitario');
}

// clientes: campos de CRM agregados después de que la tabla ya existía.
// Todos nullable: los clientes creados automáticamente desde una venta
// solo tienen nombre, y el resto se completa desde su ficha.
const clientesColumnas = db.prepare('PRAGMA table_info(clientes)').all();
for (const columna of ['direccion', 'documento', 'notas']) {
  if (!clientesColumnas.some((col) => col.name === columna)) {
    db.exec(`ALTER TABLE clientes ADD COLUMN ${columna} TEXT`);
  }
}

// clientes.lista_precio_id: la lista de precios habitual de ese cliente
// (CLAUDE.md §18). Nullable, y NULL significa "la predeterminada" en vez
// de copiar el id de la predeterminada acá: si el día de mañana cambia
// cuál lista es la predeterminada, los clientes sin lista propia deben
// seguirla sola, no quedar pegados a la que era predeterminada cuando se
// cargaron.
if (!clientesColumnas.some((col) => col.name === 'lista_precio_id')) {
  db.exec('ALTER TABLE clientes ADD COLUMN lista_precio_id INTEGER REFERENCES listas_precios(id)');
}

// clientes.condicion_pago / proveedores.condicion_pago: el plazo de pago
// habitual de esa entidad ("30 días", "contado"), propuesto solo por
// Venta/Compra al elegirla (mismo criterio que lista_precio_id arriba). NULL
// significa "no tiene un plazo habitual definido" — a propósito SIN backfill
// para las entidades existentes: no sabemos qué plazo usaban de verdad, y
// dejarlas en NULL en vez de en 'contado' conserva la diferencia entre
// "nunca se definió" y "se definió que es de contado". Sus operaciones
// siguen arrancando en Contado como hasta ahora hasta que alguien cargue el
// plazo.
if (!clientesColumnas.some((col) => col.name === 'condicion_pago')) {
  db.exec('ALTER TABLE clientes ADD COLUMN condicion_pago TEXT');
}

// ventas.lista_precio_id / presupuestos.lista_precio_id: con qué lista se
// hizo la operación (trazabilidad, CLAUDE.md §8 y §22) — explica por qué
// esa venta tuvo esos precios y habilita reportar por canal más adelante.
// Nullable por el mismo motivo que en clientes: las ventas/presupuestos ya
// registrados no tienen lista, y NULL ahí también se interpreta como "se
// hizo con la predeterminada de ese momento", no con una lista fija.
const ventasColumnas = db.prepare('PRAGMA table_info(ventas)').all();
if (!ventasColumnas.some((col) => col.name === 'lista_precio_id')) {
  db.exec('ALTER TABLE ventas ADD COLUMN lista_precio_id INTEGER REFERENCES listas_precios(id)');
}
const presupuestosColumnas = db.prepare('PRAGMA table_info(presupuestos)').all();
if (!presupuestosColumnas.some((col) => col.name === 'lista_precio_id')) {
  db.exec('ALTER TABLE presupuestos ADD COLUMN lista_precio_id INTEGER REFERENCES listas_precios(id)');
}

// proveedores: mismos campos de contacto que clientes, agregados cuando la
// tabla ya existía. Todos nullable, porque los proveedores creados
// automáticamente desde una compra solo tienen nombre.
const proveedoresColumnas = db.prepare('PRAGMA table_info(proveedores)').all();
for (const columna of ['direccion', 'documento', 'notas']) {
  if (!proveedoresColumnas.some((col) => col.name === columna)) {
    db.exec(`ALTER TABLE proveedores ADD COLUMN ${columna} TEXT`);
  }
}

// proveedores.condicion_pago: mismo campo y mismo criterio que
// clientes.condicion_pago de arriba, del lado de la deuda con el proveedor.
if (!proveedoresColumnas.some((col) => col.name === 'condicion_pago')) {
  db.exec('ALTER TABLE proveedores ADD COLUMN condicion_pago TEXT');
}

// movimientos_tesoreria: origen / concepto / transferencia_id (ver
// schema.sql). El DEFAULT 'origen' es 'cobro', así que después de agregarlo
// hay que corregir las filas de pagos: se reconocen porque ya tienen
// pago_id, o sea que el dato para el backfill ya estaba en la tabla.
const movimientosTesoreriaColumnas = db.prepare('PRAGMA table_info(movimientos_tesoreria)').all();
if (!movimientosTesoreriaColumnas.some((col) => col.name === 'origen')) {
  db.exec(
    "ALTER TABLE movimientos_tesoreria ADD COLUMN origen TEXT NOT NULL DEFAULT 'cobro' " +
      "CHECK (origen IN ('cobro', 'pago', 'manual', 'transferencia'))"
  );
  db.exec("UPDATE movimientos_tesoreria SET origen = 'pago' WHERE pago_id IS NOT NULL");
}
if (!movimientosTesoreriaColumnas.some((col) => col.name === 'concepto')) {
  db.exec('ALTER TABLE movimientos_tesoreria ADD COLUMN concepto TEXT');
}
if (!movimientosTesoreriaColumnas.some((col) => col.name === 'transferencia_id')) {
  db.exec('ALTER TABLE movimientos_tesoreria ADD COLUMN transferencia_id INTEGER');
}

// Un gasto genera un egreso de tesorería, así que origen necesita admitir
// 'gasto'. SQLite no deja modificar un CHECK con ALTER TABLE, así que hay
// que reconstruir la tabla — mismo procedimiento que se usó más arriba
// para agregar 'borrador' a compras.
// Es seguro: los id se preservan tal cual y ninguna tabla referencia a
// movimientos_tesoreria con FK, así que no hay referencias que romper.
// Sí hay que tirar la vista saldo_tesoreria antes de empezar: SQLite
// valida las vistas existentes durante el ALTER TABLE ... RENAME, y una
// vista que apunta a la tabla recién borrada hace fallar la operación
// entera. Se recrea unas líneas más abajo, con la misma definición.
// Se aprovecha la misma pasada para agregar gasto_id, en vez de un ALTER
// aparte. `gastos` ya existe en este punto porque schema.sql se ejecutó al
// principio del archivo.
const movimientosTesoreriaSql = db
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'movimientos_tesoreria'")
  .get();
if (movimientosTesoreriaSql && !movimientosTesoreriaSql.sql.includes("'gasto'")) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    db.exec('DROP VIEW IF EXISTS saldo_tesoreria');
    db.exec(`
      CREATE TABLE movimientos_tesoreria_nueva (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cuenta_tesoreria_id INTEGER NOT NULL REFERENCES cuentas_tesoreria(id),
        tipo TEXT NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
        importe REAL NOT NULL,
        fecha TEXT NOT NULL DEFAULT (date('now')),
        cobro_id INTEGER REFERENCES cobros(id),
        pago_id INTEGER REFERENCES pagos(id),
        origen TEXT NOT NULL DEFAULT 'cobro'
          CHECK (origen IN ('cobro', 'pago', 'manual', 'transferencia', 'gasto')),
        concepto TEXT,
        transferencia_id INTEGER,
        gasto_id INTEGER REFERENCES gastos(id)
      )
    `);
    db.exec(`
      INSERT INTO movimientos_tesoreria_nueva
             (id, cuenta_tesoreria_id, tipo, importe, fecha, cobro_id, pago_id, origen, concepto, transferencia_id)
      SELECT  id, cuenta_tesoreria_id, tipo, importe, fecha, cobro_id, pago_id, origen, concepto, transferencia_id
        FROM movimientos_tesoreria
    `);
    db.exec('DROP TABLE movimientos_tesoreria');
    db.exec('ALTER TABLE movimientos_tesoreria_nueva RENAME TO movimientos_tesoreria');
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  db.exec('PRAGMA foreign_keys = ON');
}

// movimientos_tesoreria: agregar 'devolucion' al CHECK de origen y la
// columna devolucion_id — mismo motivo y mismo procedimiento que el
// rebuild de arriba que agregó 'gasto'. saldo_tesoreria se tira antes del
// RENAME y se recrea más abajo en este archivo (no en schema.sql, ver el
// comentario de esa vista), así que acá solo hace falta el DROP.
const movimientosTesoreriaSql2 = db
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'movimientos_tesoreria'")
  .get();
if (movimientosTesoreriaSql2 && !movimientosTesoreriaSql2.sql.includes("'devolucion'")) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    db.exec('DROP VIEW IF EXISTS saldo_tesoreria');
    db.exec(`
      CREATE TABLE movimientos_tesoreria_nueva2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cuenta_tesoreria_id INTEGER NOT NULL REFERENCES cuentas_tesoreria(id),
        tipo TEXT NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
        importe REAL NOT NULL,
        fecha TEXT NOT NULL DEFAULT (date('now')),
        cobro_id INTEGER REFERENCES cobros(id),
        pago_id INTEGER REFERENCES pagos(id),
        origen TEXT NOT NULL DEFAULT 'cobro'
          CHECK (origen IN ('cobro', 'pago', 'manual', 'transferencia', 'gasto', 'devolucion')),
        concepto TEXT,
        transferencia_id INTEGER,
        gasto_id INTEGER REFERENCES gastos(id),
        devolucion_id INTEGER REFERENCES devoluciones(id)
      )
    `);
    db.exec(`
      INSERT INTO movimientos_tesoreria_nueva2
             (id, cuenta_tesoreria_id, tipo, importe, fecha, cobro_id, pago_id, origen, concepto, transferencia_id, gasto_id)
      SELECT  id, cuenta_tesoreria_id, tipo, importe, fecha, cobro_id, pago_id, origen, concepto, transferencia_id, gasto_id
        FROM movimientos_tesoreria
    `);
    db.exec('DROP TABLE movimientos_tesoreria');
    db.exec('ALTER TABLE movimientos_tesoreria_nueva2 RENAME TO movimientos_tesoreria');
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  db.exec('PRAGMA foreign_keys = ON');
}

// movimientos_tesoreria: agregar 'devolucion_proveedor' al CHECK de origen
// y la columna devolucion_proveedor_id — mismo motivo y procedimiento que
// el rebuild de arriba que agregó 'devolucion'. saldo_tesoreria se tira
// antes del RENAME y se recrea más abajo en este archivo.
const movimientosTesoreriaSql3 = db
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'movimientos_tesoreria'")
  .get();
if (movimientosTesoreriaSql3 && !movimientosTesoreriaSql3.sql.includes("'devolucion_proveedor'")) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    db.exec('DROP VIEW IF EXISTS saldo_tesoreria');
    db.exec(`
      CREATE TABLE movimientos_tesoreria_nueva3 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cuenta_tesoreria_id INTEGER NOT NULL REFERENCES cuentas_tesoreria(id),
        tipo TEXT NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
        importe REAL NOT NULL,
        fecha TEXT NOT NULL DEFAULT (date('now')),
        cobro_id INTEGER REFERENCES cobros(id),
        pago_id INTEGER REFERENCES pagos(id),
        origen TEXT NOT NULL DEFAULT 'cobro'
          CHECK (origen IN ('cobro', 'pago', 'manual', 'transferencia', 'gasto', 'devolucion', 'devolucion_proveedor')),
        concepto TEXT,
        transferencia_id INTEGER,
        gasto_id INTEGER REFERENCES gastos(id),
        devolucion_id INTEGER REFERENCES devoluciones(id),
        devolucion_proveedor_id INTEGER REFERENCES devoluciones_proveedor(id)
      )
    `);
    db.exec(`
      INSERT INTO movimientos_tesoreria_nueva3
             (id, cuenta_tesoreria_id, tipo, importe, fecha, cobro_id, pago_id, origen, concepto, transferencia_id, gasto_id, devolucion_id)
      SELECT  id, cuenta_tesoreria_id, tipo, importe, fecha, cobro_id, pago_id, origen, concepto, transferencia_id, gasto_id, devolucion_id
        FROM movimientos_tesoreria
    `);
    db.exec('DROP TABLE movimientos_tesoreria');
    db.exec('ALTER TABLE movimientos_tesoreria_nueva3 RENAME TO movimientos_tesoreria');
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  db.exec('PRAGMA foreign_keys = ON');
}

// movimientos_tesoreria.organizacion_id: mismo patrón (Etapa A, CLAUDE.md
// §28). A diferencia de cobros/pagos/movimientos_cc_*, necesita columna
// propia porque hay orígenes ('manual', 'transferencia') sin venta/compra/
// gasto del que derivar la organización por join. Va después de los tres
// rebuilds de arriba y no junto al resto de la Etapa A: sus cuerpos no traen
// esta columna, así que en una base vieja la borraban (ver el comentario del
// rebuild de compras).
const movimientosTesoreriaColumnasOrg = db.prepare('PRAGMA table_info(movimientos_tesoreria)').all();
if (!movimientosTesoreriaColumnasOrg.some((col) => col.name === 'organizacion_id')) {
  db.exec('ALTER TABLE movimientos_tesoreria ADD COLUMN organizacion_id INTEGER REFERENCES organizaciones(id)');
}

// La vista del saldo de tesorería va acá y no en schema.sql a propósito:
// schema.sql se ejecuta al principio de este archivo, cuando en una base
// existente todavía no se agregó cuentas_tesoreria.saldo_inicial, así que
// ahí la vista fallaría al referenciar esa columna.
// LEFT JOIN para que una cuenta recién creada, sin movimientos, igual
// aparezca con su saldo inicial en vez de desaparecer del listado.
db.exec(`
  CREATE VIEW IF NOT EXISTS saldo_tesoreria AS
  SELECT cuentas_tesoreria.id AS cuenta_tesoreria_id,
         cuentas_tesoreria.saldo_inicial + COALESCE(SUM(
           CASE movimientos_tesoreria.tipo
             WHEN 'ingreso' THEN movimientos_tesoreria.importe
             ELSE -movimientos_tesoreria.importe
           END
         ), 0) AS saldo
    FROM cuentas_tesoreria
    LEFT JOIN movimientos_tesoreria
           ON movimientos_tesoreria.cuenta_tesoreria_id = cuentas_tesoreria.id
   GROUP BY cuentas_tesoreria.id
`);

// auditoria: agregar 'usuario' al CHECK de entidad y la columna
// usuario_id obliga a reconstruir la tabla (SQLite no permite modificar
// un CHECK con ALTER TABLE) — mismo procedimiento que los rebuilds de
// movimientos_stock/compras/movimientos_tesoreria más arriba. A
// diferencia de esos, acá no hay ninguna vista que apunte a auditoria
// (no hace falta DROP VIEW antes del rename), pero SÍ hay dos índices
// propios (idx_auditoria_fecha, idx_auditoria_entidad) que el DROP TABLE
// se lleva puestos y que schema.sql ya no vuelve a crear en este arranque
// (corrió al principio del archivo, antes de este bloque) — hay que
// recrearlos a mano dentro de la misma transacción o quedan perdidos en
// silencio. Es una reconstrucción sin datos que preservar: la tabla
// auditoria se agregó recién en la etapa anterior y todavía no tiene
// ninguna fila en la base real, pero igual se hace con el mismo cuidado
// que si tuviera.
const auditoriaSql = db
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'auditoria'")
  .get();
if (auditoriaSql && !auditoriaSql.sql.includes("'usuario'")) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    db.exec(`
      CREATE TABLE auditoria_nueva (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT NOT NULL DEFAULT (datetime('now')),
        actor TEXT NOT NULL DEFAULT 'operador'
          CHECK (actor IN ('operador', 'asistente', 'sistema')),
        accion TEXT NOT NULL
          CHECK (accion IN ('crear', 'editar', 'anular', 'restaurar', 'cambiar_estado', 'confirmar')),
        entidad TEXT NOT NULL
          CHECK (entidad IN ('venta','compra','presupuesto','devolucion','devolucion_proveedor',
                             'factura','cobro','pago','gasto','producto','cliente','proveedor',
                             'stock','tesoreria','categoria','categoria_gasto','cuenta_tesoreria','usuario')),
        entidad_id INTEGER,
        usuario_id INTEGER REFERENCES usuarios(id),
        valor_anterior TEXT,
        valor_nuevo TEXT,
        operacion_tipo TEXT,
        operacion_id INTEGER,
        detalle TEXT
      )
    `);
    db.exec(`
      INSERT INTO auditoria_nueva
             (id, fecha, actor, accion, entidad, entidad_id, valor_anterior, valor_nuevo, operacion_tipo, operacion_id, detalle)
      SELECT  id, fecha, actor, accion, entidad, entidad_id, valor_anterior, valor_nuevo, operacion_tipo, operacion_id, detalle
        FROM auditoria
    `);
    db.exec('DROP TABLE auditoria');
    db.exec('ALTER TABLE auditoria_nueva RENAME TO auditoria');
    db.exec('CREATE INDEX idx_auditoria_fecha ON auditoria(fecha DESC, id DESC)');
    db.exec('CREATE INDEX idx_auditoria_entidad ON auditoria(entidad, entidad_id)');
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  db.exec('PRAGMA foreign_keys = ON');
}

// Datos del negocio para el membrete de los comprobantes impresos. Aditivas y
// nullable, mismo criterio que facturas.venta_id/devolucion_id más arriba: una
// base que ya existía las gana vacías y el negocio las completa desde
// Configuración. Ninguna fila se reescribe. Se chequea columna por columna
// (y no "si falta una, agregar todas") para que el bloque sea idempotente
// incluso si una corrida anterior se cortó a la mitad.
const organizacionesColumnas = db.prepare('PRAGMA table_info(organizaciones)').all();
for (const columna of ['documento', 'direccion', 'telefono', 'email', 'condicion_iva', 'pie_comprobante']) {
  if (!organizacionesColumnas.some((col) => col.name === columna)) {
    db.exec(`ALTER TABLE organizaciones ADD COLUMN ${columna} TEXT`);
  }
}

// Segundo rebuild de auditoria: sumar 'organizacion' al CHECK de entidad, para
// poder auditar quién cambió los datos del negocio. Cambiar el CUIT que sale
// impreso en TODOS los comprobantes no puede pasar sin dejar rastro (§22), y
// reusar otra entidad para esquivar el rebuild sería mentir en el registro que
// existe justamente para no mentir.
//
// Mismo procedimiento que el rebuild de arriba, con una diferencia que importa:
// a esta altura la tabla YA TIENE FILAS y ya tiene usuario_id, así que el
// INSERT..SELECT copia también esa columna. Los id se preservan explícitamente
// (una fila de auditoría se referencia por id) y los dos índices se recrean a
// mano: el DROP TABLE se los lleva y schema.sql ya corrió al principio del
// archivo, así que nadie más los va a volver a crear en este arranque.
const auditoriaSql2 = db
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'auditoria'")
  .get();
if (auditoriaSql2 && !auditoriaSql2.sql.includes("'organizacion'")) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    db.exec(`
      CREATE TABLE auditoria_nueva (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT NOT NULL DEFAULT (datetime('now')),
        actor TEXT NOT NULL DEFAULT 'operador'
          CHECK (actor IN ('operador', 'asistente', 'sistema')),
        accion TEXT NOT NULL
          CHECK (accion IN ('crear', 'editar', 'anular', 'restaurar', 'cambiar_estado', 'confirmar')),
        entidad TEXT NOT NULL
          CHECK (entidad IN ('venta','compra','presupuesto','devolucion','devolucion_proveedor',
                             'factura','cobro','pago','gasto','producto','cliente','proveedor',
                             'stock','tesoreria','categoria','categoria_gasto','cuenta_tesoreria','usuario',
                             'organizacion')),
        entidad_id INTEGER,
        usuario_id INTEGER REFERENCES usuarios(id),
        valor_anterior TEXT,
        valor_nuevo TEXT,
        operacion_tipo TEXT,
        operacion_id INTEGER,
        detalle TEXT
      )
    `);
    db.exec(`
      INSERT INTO auditoria_nueva
             (id, fecha, actor, accion, entidad, entidad_id, usuario_id, valor_anterior, valor_nuevo, operacion_tipo, operacion_id, detalle)
      SELECT  id, fecha, actor, accion, entidad, entidad_id, usuario_id, valor_anterior, valor_nuevo, operacion_tipo, operacion_id, detalle
        FROM auditoria
    `);
    db.exec('DROP TABLE auditoria');
    db.exec('ALTER TABLE auditoria_nueva RENAME TO auditoria');
    db.exec('CREATE INDEX idx_auditoria_fecha ON auditoria(fecha DESC, id DESC)');
    db.exec('CREATE INDEX idx_auditoria_entidad ON auditoria(entidad, entidad_id)');
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  db.exec('PRAGMA foreign_keys = ON');
}

// Tercer rebuild de auditoria: sumar 'lista_precio' al CHECK de entidad, para
// poder auditar altas/ediciones de listas de precios (CLAUDE.md §18) con el
// mismo registro central que el resto de los maestros. Mismo procedimiento
// que los dos rebuilds de arriba: los índices se recrean a mano porque el
// DROP TABLE se los lleva y schema.sql ya corrió al principio del archivo.
const auditoriaSql3 = db
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'auditoria'")
  .get();
if (auditoriaSql3 && !auditoriaSql3.sql.includes("'lista_precio'")) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    db.exec(`
      CREATE TABLE auditoria_nueva (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT NOT NULL DEFAULT (datetime('now')),
        actor TEXT NOT NULL DEFAULT 'operador'
          CHECK (actor IN ('operador', 'asistente', 'sistema')),
        accion TEXT NOT NULL
          CHECK (accion IN ('crear', 'editar', 'anular', 'restaurar', 'cambiar_estado', 'confirmar')),
        entidad TEXT NOT NULL
          CHECK (entidad IN ('venta','compra','presupuesto','devolucion','devolucion_proveedor',
                             'factura','cobro','pago','gasto','producto','cliente','proveedor',
                             'stock','tesoreria','categoria','categoria_gasto','cuenta_tesoreria','usuario',
                             'organizacion','lista_precio')),
        entidad_id INTEGER,
        usuario_id INTEGER REFERENCES usuarios(id),
        valor_anterior TEXT,
        valor_nuevo TEXT,
        operacion_tipo TEXT,
        operacion_id INTEGER,
        detalle TEXT
      )
    `);
    db.exec(`
      INSERT INTO auditoria_nueva
             (id, fecha, actor, accion, entidad, entidad_id, usuario_id, valor_anterior, valor_nuevo, operacion_tipo, operacion_id, detalle)
      SELECT  id, fecha, actor, accion, entidad, entidad_id, usuario_id, valor_anterior, valor_nuevo, operacion_tipo, operacion_id, detalle
        FROM auditoria
    `);
    db.exec('DROP TABLE auditoria');
    db.exec('ALTER TABLE auditoria_nueva RENAME TO auditoria');
    db.exec('CREATE INDEX idx_auditoria_fecha ON auditoria(fecha DESC, id DESC)');
    db.exec('CREATE INDEX idx_auditoria_entidad ON auditoria(entidad, entidad_id)');
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  db.exec('PRAGMA foreign_keys = ON');
}

// Cuarto rebuild de auditoria: sumar 'deposito' y 'transferencia' al CHECK
// de entidad, para poder auditar altas/ediciones de depósitos y
// transferencias (CLAUDE.md §19) con el mismo registro central que el
// resto de los maestros y operaciones. Mismo procedimiento que los tres
// rebuilds de arriba.
const auditoriaSql4 = db
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'auditoria'")
  .get();
if (auditoriaSql4 && !auditoriaSql4.sql.includes("'deposito'")) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    db.exec(`
      CREATE TABLE auditoria_nueva (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT NOT NULL DEFAULT (datetime('now')),
        actor TEXT NOT NULL DEFAULT 'operador'
          CHECK (actor IN ('operador', 'asistente', 'sistema')),
        accion TEXT NOT NULL
          CHECK (accion IN ('crear', 'editar', 'anular', 'restaurar', 'cambiar_estado', 'confirmar')),
        entidad TEXT NOT NULL
          CHECK (entidad IN ('venta','compra','presupuesto','devolucion','devolucion_proveedor',
                             'factura','cobro','pago','gasto','producto','cliente','proveedor',
                             'stock','tesoreria','categoria','categoria_gasto','cuenta_tesoreria','usuario',
                             'organizacion','lista_precio','deposito','transferencia')),
        entidad_id INTEGER,
        usuario_id INTEGER REFERENCES usuarios(id),
        valor_anterior TEXT,
        valor_nuevo TEXT,
        operacion_tipo TEXT,
        operacion_id INTEGER,
        detalle TEXT
      )
    `);
    db.exec(`
      INSERT INTO auditoria_nueva
             (id, fecha, actor, accion, entidad, entidad_id, usuario_id, valor_anterior, valor_nuevo, operacion_tipo, operacion_id, detalle)
      SELECT  id, fecha, actor, accion, entidad, entidad_id, usuario_id, valor_anterior, valor_nuevo, operacion_tipo, operacion_id, detalle
        FROM auditoria
    `);
    db.exec('DROP TABLE auditoria');
    db.exec('ALTER TABLE auditoria_nueva RENAME TO auditoria');
    db.exec('CREATE INDEX idx_auditoria_fecha ON auditoria(fecha DESC, id DESC)');
    db.exec('CREATE INDEX idx_auditoria_entidad ON auditoria(entidad, entidad_id)');
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  db.exec('PRAGMA foreign_keys = ON');
}

// Quinto rebuild de auditoria: sumar 'login', 'logout' y 'login_fallido' al
// CHECK de accion, para poder auditar el ingreso y la salida de sesión
// (CLAUDE.md §22 y la auditoría de permisos por rol). Hasta acá el login no
// dejaba ningún rastro. Mismo procedimiento que los cuatro rebuilds de
// arriba, esta vez sobre accion en vez de entidad.
const auditoriaSql5 = db
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'auditoria'")
  .get();
if (auditoriaSql5 && !auditoriaSql5.sql.includes("'login'")) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    db.exec(`
      CREATE TABLE auditoria_nueva (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT NOT NULL DEFAULT (datetime('now')),
        actor TEXT NOT NULL DEFAULT 'operador'
          CHECK (actor IN ('operador', 'asistente', 'sistema')),
        accion TEXT NOT NULL
          CHECK (accion IN ('crear', 'editar', 'anular', 'restaurar', 'cambiar_estado', 'confirmar',
                            'login', 'logout', 'login_fallido')),
        entidad TEXT NOT NULL
          CHECK (entidad IN ('venta','compra','presupuesto','devolucion','devolucion_proveedor',
                             'factura','cobro','pago','gasto','producto','cliente','proveedor',
                             'stock','tesoreria','categoria','categoria_gasto','cuenta_tesoreria','usuario',
                             'organizacion','lista_precio','deposito','transferencia')),
        entidad_id INTEGER,
        usuario_id INTEGER REFERENCES usuarios(id),
        valor_anterior TEXT,
        valor_nuevo TEXT,
        operacion_tipo TEXT,
        operacion_id INTEGER,
        detalle TEXT
      )
    `);
    db.exec(`
      INSERT INTO auditoria_nueva
             (id, fecha, actor, accion, entidad, entidad_id, usuario_id, valor_anterior, valor_nuevo, operacion_tipo, operacion_id, detalle)
      SELECT  id, fecha, actor, accion, entidad, entidad_id, usuario_id, valor_anterior, valor_nuevo, operacion_tipo, operacion_id, detalle
        FROM auditoria
    `);
    db.exec('DROP TABLE auditoria');
    db.exec('ALTER TABLE auditoria_nueva RENAME TO auditoria');
    db.exec('CREATE INDEX idx_auditoria_fecha ON auditoria(fecha DESC, id DESC)');
    db.exec('CREATE INDEX idx_auditoria_entidad ON auditoria(entidad, entidad_id)');
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  db.exec('PRAGMA foreign_keys = ON');
}

// auditoria.organizacion_id (Etapa A, CLAUDE.md §28, ver
// asistente_mensajes.organizacion_id más arriba). Va después de los cinco
// rebuilds de auditoria y no junto al resto de la Etapa A: sus cuerpos no
// traen esta columna, así que la borraban — en una base vieja, y también en
// una nueva mientras el CHECK de entidad de schema.sql estuvo atrasado
// respecto del último rebuild (el primer arranque reventaba en el backfill
// con "no such column: organizacion_id").
const auditoriaColumnasOrg = db.prepare('PRAGMA table_info(auditoria)').all();
if (!auditoriaColumnasOrg.some((col) => col.name === 'organizacion_id')) {
  db.exec('ALTER TABLE auditoria ADD COLUMN organizacion_id INTEGER REFERENCES organizaciones(id)');
  // Backfill de una sola vez, acá adentro y no en el array compartido de más
  // abajo (que corre en cada arranque): auditoria es la única tabla con un
  // NULL legítimo, el login_fallido de un usuario que no existe (ver
  // schema.sql). En el array, cada reinicio se lo atribuía a la primera
  // empresa y su admin veía lo que había tecleado cualquiera.
  db.prepare(
    `UPDATE auditoria SET organizacion_id = ?
      WHERE organizacion_id IS NULL
        AND NOT (accion = 'login_fallido' AND usuario_id IS NULL)`
  ).run(primeraOrganizacionId);
}
// Repara las bases que ya arrancaron con auditoria en el backfill compartido
// (copias de desarrollo de la Etapa A). Re-ejecutable: una vez en NULL, el
// WHERE ya no las encuentra.
db.exec(
  `UPDATE auditoria SET organizacion_id = NULL
    WHERE accion = 'login_fallido' AND usuario_id IS NULL AND organizacion_id IS NOT NULL`
);
// idx_auditoria_org_fecha, el índice que en la práctica reemplaza a
// idx_auditoria_fecha una vez que GET /api/auditoria filtra por
// organización: se crea acá, fuera del `if` de arriba y no en schema.sql
// (mismo criterio que idx_facturas_numeracion), porque tiene que cubrir
// tanto la instalación fresca (donde la columna ya viene en el CREATE
// TABLE y el ALTER de arriba no llega a correr) como la que se acaba de
// migrar. Por la misma razón que el ALTER, va después de los rebuilds: un
// DROP TABLE se lleva sus índices.
db.exec('CREATE INDEX IF NOT EXISTS idx_auditoria_org_fecha ON auditoria(organizacion_id, fecha DESC, id DESC)');

// Variantes de producto (Talle/Color/etc.): variante_id se agrega como
// columna nullable adicional en las tablas de ítems y en movimientos_stock.
// producto_id sigue siendo siempre el producto padre en todos lados; NULL en
// variante_id significa "este ítem es del producto en general, sin
// variante", que es exactamente lo que ya pasa hoy sin ningún cambio de
// dato. Es un ALTER simple (no rebuild) porque la columna es nullable, sin
// default ni CHECK — el mismo caso que productos.categoria_id.
for (const tabla of [
  'movimientos_stock',
  'venta_items',
  'compra_items',
  'devolucion_items',
  'devolucion_proveedor_items',
  'presupuesto_items'
]) {
  const columnas = db.prepare(`PRAGMA table_info(${tabla})`).all();
  if (!columnas.some((col) => col.name === 'variante_id')) {
    db.exec(`ALTER TABLE ${tabla} ADD COLUMN variante_id INTEGER REFERENCES producto_variantes(id)`);
  }
}

// Equivalentes de stock_actual/stock_por_deposito, pero a nivel variante.
// Viven acá (no en schema.sql) por el mismo motivo que stock_por_deposito:
// en una base existente, movimientos_stock.variante_id recién existe
// después del ALTER de arriba, así que declarar la vista en schema.sql
// rompería el primer arranque sobre una base vieja con "no such column".
db.exec('DROP VIEW IF EXISTS stock_variante_actual');
db.exec(`
  CREATE VIEW stock_variante_actual AS
  SELECT producto_id, variante_id,
         SUM(CASE tipo WHEN 'entrada' THEN cantidad WHEN 'salida' THEN -cantidad ELSE cantidad END) AS cantidad
  FROM movimientos_stock
  WHERE variante_id IS NOT NULL
  GROUP BY producto_id, variante_id
`);
db.exec('DROP VIEW IF EXISTS stock_variante_por_deposito');
db.exec(`
  CREATE VIEW stock_variante_por_deposito AS
  SELECT producto_id, variante_id, deposito_id,
         SUM(CASE tipo WHEN 'entrada' THEN cantidad WHEN 'salida' THEN -cantidad ELSE cantidad END) AS cantidad
  FROM movimientos_stock
  WHERE variante_id IS NOT NULL
  GROUP BY producto_id, variante_id, deposito_id
`);

// Limpieza de sesiones vencidas al bootear, sin cron ni timer: con
// `--watch` esto corre en cada reinicio del proceso, que alcanza para un
// sistema de este tamaño.
db.exec("DELETE FROM sesiones WHERE expira <= datetime('now')");

export function withTransaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// Auditoría central (CLAUDE.md §22). Un INSERT pelado, SIN BEGIN/COMMIT
// propio a propósito: withTransaction no es reentrante (db.exec('BEGIN')
// dentro de una transacción ya abierta tira error), así que este helper
// se llama SIEMPRE desde adentro de un withTransaction ya en curso, como
// última línea antes del return. Al no abrir su propia transacción,
// hereda la de quien lo llama: si la operación falla después, el
// ROLLBACK se lleva la fila de auditoría con todo lo demás (§23).
//
// No envuelve withTransaction en sí (un wrapper automático no puede
// saber qué entidad/id se tocó: la mitad de los 33 call sites no
// devuelven nada, y el id de un alta recién existe DESPUÉS de correr la
// función) — por eso se llama explícitamente en cada punto, con el id ya
// en mano.
export function registrarAuditoria({
  accion,
  entidad,
  entidad_id = null,
  actor = 'operador',
  usuario_id = null,
  valor_anterior = null,
  valor_nuevo = null,
  operacion_tipo = null,
  operacion_id = null,
  detalle = null,
  // Nullable a propósito (Etapa A, CLAUDE.md §28): el único caso sin
  // organización deducible es login_fallido con un usuario que no existe
  // (ver server.js), donde no hay a quién atribuirle la empresa. NULL deja
  // esa fila invisible en GET /api/auditoria para todas las empresas, en
  // vez de mezclarla con una al azar.
  organizacion_id = null
}) {
  db.prepare(
    `INSERT INTO auditoria
       (actor, accion, entidad, entidad_id, usuario_id, valor_anterior, valor_nuevo, operacion_tipo, operacion_id, detalle, organizacion_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    actor,
    accion,
    entidad,
    entidad_id,
    usuario_id,
    valor_anterior,
    valor_nuevo,
    operacion_tipo,
    operacion_id,
    detalle,
    organizacion_id
  );
}

// Backfill de organizacion_id en las tablas que la sumaron por ALTER TABLE
// (ver más arriba): recién acá corrieron todos esos ALTER. Los cinco
// catálogos no están en la lista porque la traen NOT NULL desde su rebuild,
// al principio del archivo, y auditoria tampoco porque tiene su propio
// backfill junto a su ALTER. Re-ejecutable, solo toca filas que todavía no
// tienen organización asignada.
for (const tabla of [
  'productos',
  'clientes',
  'proveedores',
  'ventas',
  'compras',
  'presupuestos',
  'facturas',
  'devoluciones',
  'devoluciones_proveedor',
  'gastos',
  'movimientos_stock',
  'transferencias',
  'movimientos_tesoreria',
  'asistente_mensajes',
]) {
  db.exec(
    `UPDATE ${tabla} SET organizacion_id = (SELECT id FROM organizaciones ORDER BY id LIMIT 1)
      WHERE organizacion_id IS NULL`
  );
}

// Catálogos base de cada organización: el depósito y la lista de precios
// predeterminados, y las cuentas Efectivo/Banco/Mercado Pago. No son datos de
// ejemplo (los seeds de clientes/facturas/productos/proveedores de ejemplo
// que existían acá se sacaron a pedido del usuario): son infraestructura que
// el sistema necesita para operar — sin depósito predeterminado una venta sin
// depósito elegido no tiene de dónde sacar stock, sin lista predeterminada no
// hay precio de fallback (CLAUDE.md §18), y Cobros/Pagos necesitan dónde
// registrar la plata.
// Se siembra por organización y por tabla, solo si esa organización todavía
// no tiene ninguna fila. Corre en cada arranque para todas, así que una
// empresa creada a mano recibe los suyos en el próximo arranque; el alta de
// empresa de POST /api/auth/registro la llama directo, por eso se exporta. La
// lista copia el precio_venta de cada producto de esa
// organización, así que el número que el negocio ya venía usando no cambia
// ni un peso — solo pasa a vivir también como fila de producto_precios.
export function sembrarCatalogosBase(organizacionId) {
  const contar = (tabla) =>
    db.prepare(`SELECT COUNT(*) AS count FROM ${tabla} WHERE organizacion_id = ?`).get(organizacionId).count;
  if (contar('depositos') === 0) {
    db.prepare('INSERT INTO depositos (nombre, es_predeterminado, organizacion_id) VALUES (?, 1, ?)').run(
      'Depósito principal',
      organizacionId
    );
  }
  if (contar('cuentas_tesoreria') === 0) {
    const insertCuenta = db.prepare('INSERT INTO cuentas_tesoreria (nombre, tipo, organizacion_id) VALUES (?, ?, ?)');
    insertCuenta.run('Efectivo', 'efectivo', organizacionId);
    insertCuenta.run('Banco', 'banco', organizacionId);
    insertCuenta.run('Mercado Pago', 'mercadopago', organizacionId);
  }
  if (contar('listas_precios') === 0) {
    const { lastInsertRowid: listaPredeterminadaId } = db
      .prepare('INSERT INTO listas_precios (nombre, es_predeterminada, organizacion_id) VALUES (?, 1, ?)')
      .run('Minorista', organizacionId);
    db.prepare(
      `INSERT INTO producto_precios (producto_id, lista_precio_id, precio)
       SELECT id, ?, precio_venta FROM productos WHERE organizacion_id = ?`
    ).run(listaPredeterminadaId, organizacionId);
  }
}
for (const { id } of db.prepare('SELECT id FROM organizaciones ORDER BY id').all()) {
  sembrarCatalogosBase(id);
}

export default db;
