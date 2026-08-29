import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(path.join(__dirname, 'nexo.db'));

db.exec(readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

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
// compras.estado_envio: informativo, no afecta el stock. Las compras
// viejas quedan en 'recibido' (el default), que es lo correcto: ya
// habían sumado su stock, así que conceptualmente ya estaban recibidas.
const comprasColumnas = db.prepare('PRAGMA table_info(compras)').all();
if (!comprasColumnas.some((col) => col.name === 'estado_envio')) {
  db.exec(
    "ALTER TABLE compras ADD COLUMN estado_envio TEXT NOT NULL DEFAULT 'recibido' CHECK (estado_envio IN ('pedido', 'en_camino', 'recibido'))"
  );
}

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

// compra_items.costo_real_unitario y movimientos_stock.costo_unitario:
// costo con el envío prorrateado. Nullable porque las filas viejas se
// cargaron cuando no existía el concepto de costo de envío — para esas,
// el costo real era exactamente el precio unitario.
const compraItemsColumnas = db.prepare('PRAGMA table_info(compra_items)').all();
if (!compraItemsColumnas.some((col) => col.name === 'costo_real_unitario')) {
  db.exec('ALTER TABLE compra_items ADD COLUMN costo_real_unitario REAL');
  db.exec('UPDATE compra_items SET costo_real_unitario = precio_unitario');
}
if (!movimientosColumnas.some((col) => col.name === 'costo_unitario')) {
  db.exec('ALTER TABLE movimientos_stock ADD COLUMN costo_unitario REAL');
}

// compras: agregar 'borrador' al CHECK de estado obliga a reconstruir la
// tabla, porque SQLite no permite modificar un CHECK con ALTER TABLE. Se
// hace copiando las filas a una tabla nueva y renombrando. Es seguro
// porque los id se preservan tal cual, así que las FK que apuntan acá
// (compra_items, pagos, movimientos_stock, movimientos_cc_proveedores)
// siguen resolviendo a la misma compra.
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

// clientes: campos de CRM agregados después de que la tabla ya existía.
// Todos nullable: los clientes creados automáticamente desde una venta
// solo tienen nombre, y el resto se completa desde su ficha.
const clientesColumnas = db.prepare('PRAGMA table_info(clientes)').all();
for (const columna of ['direccion', 'documento', 'notas']) {
  if (!clientesColumnas.some((col) => col.name === columna)) {
    db.exec(`ALTER TABLE clientes ADD COLUMN ${columna} TEXT`);
  }
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

// cuentas_tesoreria.saldo_inicial: la plata que ya había antes de usar el
// sistema. Las cuentas que ya existen arrancan en 0, así que su saldo
// sigue siendo exactamente la suma de sus movimientos — el número que se
// venía calculando hasta ahora no cambia.
const cuentasColumnas = db.prepare('PRAGMA table_info(cuentas_tesoreria)').all();
if (!cuentasColumnas.some((col) => col.name === 'saldo_inicial')) {
  db.exec('ALTER TABLE cuentas_tesoreria ADD COLUMN saldo_inicial REAL NOT NULL DEFAULT 0');
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

// Nota: los seeds de clientes/facturas/productos/proveedores de ejemplo
// que existían acá (para que el prototipo no arrancara vacío) se sacaron
// a pedido del usuario, ya en etapa de prueba real de las funciones —
// no tiene sentido seguir inyectando cuentas de ejemplo cada vez que la
// base arranca vacía. `cuentas_tesoreria` sigue sembrándose porque no es
// "dato de ejemplo": es infraestructura real que necesitan Cobros/Pagos
// para funcionar (Efectivo/Banco/Mercado Pago).

const { count: cuentasCount } = db.prepare('SELECT COUNT(*) AS count FROM cuentas_tesoreria').get();
if (cuentasCount === 0) {
  const insertCuenta = db.prepare('INSERT INTO cuentas_tesoreria (nombre, tipo) VALUES (?, ?)');
  insertCuenta.run('Efectivo', 'efectivo');
  insertCuenta.run('Banco', 'banco');
  insertCuenta.run('Mercado Pago', 'mercadopago');
}

export default db;
