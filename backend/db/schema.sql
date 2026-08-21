CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  email TEXT,
  telefono TEXT
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
