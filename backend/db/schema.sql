-- Un cliente puede nacer de dos formas: cargado a mano desde la pantalla
-- de Clientes (con todos sus datos), o creado automáticamente al
-- registrar una venta con un nombre nuevo. En el segundo caso solo tiene
-- nombre y el resto se completa después desde su ficha: por eso todos
-- los campos de contacto son opcionales.
CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  email TEXT,
  telefono TEXT,
  direccion TEXT,
  documento TEXT,
  notas TEXT
);

CREATE TABLE IF NOT EXISTS facturas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  concepto TEXT NOT NULL,
  neto REAL NOT NULL,
  condicion TEXT NOT NULL CHECK (condicion IN ('efectivo', 'transferencia', 'mercadopago')),
  estado TEXT NOT NULL CHECK (estado IN ('cobrado', 'pendiente', 'vencido')),
  fecha TEXT NOT NULL DEFAULT (date('now'))
);
-- venta_id se agrega por migración en db/index.js (ver ahí el porqué).

-- precio_costo no se edita a mano en ningún lado: lo escribe la compra al
-- proveedor (costo promedio ponderado, ver POST /api/compras). Es un valor
-- derivado de las operaciones, no un dato que alguien carga.
-- stock_minimo / stock_maximo son los umbrales para la alerta de stock:
-- por debajo del mínimo avisa "bajo", por encima del máximo avisa "alto".
-- stock_maximo nullable = ese producto no tiene alerta de exceso.
CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  sku TEXT UNIQUE,
  precio_costo REAL NOT NULL DEFAULT 0,
  precio_venta REAL NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  stock_minimo REAL NOT NULL DEFAULT 0,
  stock_maximo REAL
);

CREATE TABLE IF NOT EXISTS proveedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  email TEXT,
  telefono TEXT
);

CREATE TABLE IF NOT EXISTS ventas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  fecha TEXT NOT NULL DEFAULT (date('now')),
  estado TEXT NOT NULL CHECK (estado IN ('activa', 'anulada')) DEFAULT 'activa'
);

CREATE TABLE IF NOT EXISTS venta_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id INTEGER NOT NULL REFERENCES ventas(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad REAL NOT NULL CHECK (cantidad > 0),
  precio_unitario REAL NOT NULL,
  -- Foto del precio_costo del producto en el momento de la venta. No se
  -- recalcula nunca después, aunque el costo del producto cambie con
  -- compras posteriores: es lo que permite calcular márgenes históricos
  -- reales en vez de con el costo actual.
  costo_unitario_historico REAL NOT NULL DEFAULT 0
);

-- Ciclo de vida de una compra:
--   borrador -> se arma sin efecto alguno (ni stock, ni costo, ni deuda).
--   activa   -> se efectuó el pedido: nace la deuda con el proveedor.
--   anulada  -> se revirtió (ver papelera).
-- Y en paralelo, estado_envio va 'pedido' -> 'en_camino' -> 'recibido'.
-- El stock sube recién al marcar 'recibido', que es cuando la mercadería
-- está realmente en el depósito.
-- stock_aplicado evita el doble conteo: marca si esta compra ya sumó su
-- stock. Es necesario porque las compras viejas (anteriores a esta regla)
-- sumaban stock al crearse, y si no se distinguieran volverían a sumarlo
-- al marcarlas como recibidas.
CREATE TABLE IF NOT EXISTS compras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proveedor_id INTEGER NOT NULL REFERENCES proveedores(id),
  fecha TEXT NOT NULL DEFAULT (date('now')),
  estado TEXT NOT NULL CHECK (estado IN ('borrador', 'activa', 'anulada')) DEFAULT 'borrador',
  estado_envio TEXT NOT NULL CHECK (estado_envio IN ('pedido', 'en_camino', 'recibido')) DEFAULT 'pedido',
  costo_envio REAL NOT NULL DEFAULT 0,
  stock_aplicado INTEGER NOT NULL DEFAULT 0
);

-- costo_real_unitario = precio_unitario + la parte del envío que le toca a
-- este ítem, prorrateada por su valor dentro de la compra (CLAUDE.md §7).
-- Es el costo que alimenta el promedio ponderado del producto, no el
-- precio_unitario pelado: si no, el envío desaparecería del costeo.
CREATE TABLE IF NOT EXISTS compra_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id INTEGER NOT NULL REFERENCES compras(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad REAL NOT NULL CHECK (cantidad > 0),
  precio_unitario REAL NOT NULL,
  costo_real_unitario REAL
);

-- tipo 'entrada'/'salida': cantidad siempre positiva, el signo lo pone el tipo.
-- tipo 'ajuste': cantidad puede ser negativa (correccion manual de stock).
CREATE TABLE IF NOT EXISTS movimientos_stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida', 'ajuste')),
  cantidad REAL NOT NULL,
  origen TEXT NOT NULL CHECK (origen IN ('venta', 'compra', 'ajuste_manual')),
  -- origen_id: deprecado, reemplazado por venta_id/compra_id (con FK real
  -- de verdad). Se conserva sin usar por compatibilidad con filas viejas;
  -- se puede eliminar en una limpieza posterior.
  origen_id INTEGER,
  venta_id INTEGER REFERENCES ventas(id),
  compra_id INTEGER REFERENCES compras(id),
  fecha TEXT NOT NULL DEFAULT (date('now')),
  -- Costo real de la unidad que entra (con el envío ya prorrateado).
  -- Solo tiene sentido en las entradas por compra; en salidas y ajustes
  -- queda NULL.
  costo_unitario REAL,
  nota TEXT
);

CREATE VIEW IF NOT EXISTS stock_actual AS
SELECT producto_id,
       SUM(CASE tipo
             WHEN 'entrada' THEN cantidad
             WHEN 'salida' THEN -cantidad
             ELSE cantidad
           END) AS cantidad
FROM movimientos_stock
GROUP BY producto_id;

-- Una "cuenta de tesorería" es dónde está la plata (caja, banco, MP). Hoy
-- se corresponde 1 a 1 con los medios de pago que ya usa el sistema
-- (facturas.condicion), así que un cobro/pago tiene una sola cuenta en
-- vez de un campo "medio_pago" separado y redundante.
CREATE TABLE IF NOT EXISTS cuentas_tesoreria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('efectivo', 'banco', 'mercadopago', 'otro'))
);

CREATE TABLE IF NOT EXISTS cobros (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id INTEGER NOT NULL REFERENCES ventas(id),
  fecha TEXT NOT NULL DEFAULT (date('now')),
  importe REAL NOT NULL CHECK (importe > 0),
  cuenta_tesoreria_id INTEGER NOT NULL REFERENCES cuentas_tesoreria(id),
  nota TEXT
);

CREATE TABLE IF NOT EXISTS pagos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id INTEGER NOT NULL REFERENCES compras(id),
  fecha TEXT NOT NULL DEFAULT (date('now')),
  importe REAL NOT NULL CHECK (importe > 0),
  cuenta_tesoreria_id INTEGER NOT NULL REFERENCES cuentas_tesoreria(id),
  nota TEXT
);

-- Ledger de tesorería, mismo patrón que movimientos_stock, pero con FK
-- real por columna (cobro_id/pago_id) en vez de una referencia
-- polimórfica sin integridad como el origen_id que se corrigió en
-- movimientos_stock (Etapa 4a).
CREATE TABLE IF NOT EXISTS movimientos_tesoreria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cuenta_tesoreria_id INTEGER NOT NULL REFERENCES cuentas_tesoreria(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
  importe REAL NOT NULL,
  fecha TEXT NOT NULL DEFAULT (date('now')),
  cobro_id INTEGER REFERENCES cobros(id),
  pago_id INTEGER REFERENCES pagos(id)
);

-- Cuenta corriente de cliente: el saldo se reconstruye sumando
-- movimientos, nunca es un campo editable a mano. importe con signo:
-- positivo aumenta la deuda (venta), negativo la disminuye (cobro).
CREATE TABLE IF NOT EXISTS movimientos_cc_clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('venta', 'cobro', 'ajuste')),
  importe REAL NOT NULL,
  fecha TEXT NOT NULL DEFAULT (date('now')),
  venta_id INTEGER REFERENCES ventas(id),
  cobro_id INTEGER REFERENCES cobros(id)
);

CREATE TABLE IF NOT EXISTS movimientos_cc_proveedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proveedor_id INTEGER NOT NULL REFERENCES proveedores(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('compra', 'pago', 'ajuste')),
  importe REAL NOT NULL,
  fecha TEXT NOT NULL DEFAULT (date('now')),
  compra_id INTEGER REFERENCES compras(id),
  pago_id INTEGER REFERENCES pagos(id)
);

CREATE VIEW IF NOT EXISTS saldo_cc_clientes AS
SELECT cliente_id, SUM(importe) AS saldo
FROM movimientos_cc_clientes
GROUP BY cliente_id;

CREATE VIEW IF NOT EXISTS saldo_cc_proveedores AS
SELECT proveedor_id, SUM(importe) AS saldo
FROM movimientos_cc_proveedores
GROUP BY proveedor_id;
