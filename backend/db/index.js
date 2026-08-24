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
