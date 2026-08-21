import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(path.join(__dirname, 'nexo.db'));

db.exec(readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

const { count } = db.prepare('SELECT COUNT(*) AS count FROM clientes').get();
if (count === 0) {
  const insertCliente = db.prepare('INSERT INTO clientes (nombre) VALUES (?)');
  const clientes = ['Almacén Don Beto', 'Kiosco La Esquina', 'Ferretería Sur', 'Panadería Trigo'];
  const ids = clientes.map((nombre) => insertCliente.run(nombre).lastInsertRowid);

  const insertFactura = db.prepare(
    'INSERT INTO facturas (cliente_id, concepto, neto, condicion, estado) VALUES (?, ?, ?, ?, ?)'
  );
  insertFactura.run(ids[0], 'Venta de mercadería', 45000, 'mercadopago', 'cobrado');
  insertFactura.run(ids[1], 'Reposición de stock', 18500, 'efectivo', 'cobrado');
  insertFactura.run(ids[2], 'Servicio técnico', 62000, 'mercadopago', 'pendiente');
  insertFactura.run(ids[3], 'Venta mayorista', 27300, 'transferencia', 'vencido');
}

export default db;
