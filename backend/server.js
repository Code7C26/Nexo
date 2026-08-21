import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from './db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.get('/api/clientes', (req, res) => {
  const clientes = db.prepare('SELECT * FROM clientes ORDER BY nombre').all();
  res.json(clientes);
});

app.get('/api/facturas', (req, res) => {
  const facturas = db
    .prepare(
      `SELECT facturas.id, clientes.nombre AS cliente, facturas.concepto, facturas.neto,
              facturas.neto AS total, facturas.condicion, facturas.estado, facturas.fecha
       FROM facturas
       JOIN clientes ON clientes.id = facturas.cliente_id
       ORDER BY facturas.id`
    )
    .all();
  res.json(facturas);
});

app.post('/api/facturas', (req, res) => {
  const { cliente, concepto, neto, condicion } = req.body;

  let clienteRow = db.prepare('SELECT id FROM clientes WHERE nombre = ?').get(cliente);
  if (!clienteRow) {
    const { lastInsertRowid } = db.prepare('INSERT INTO clientes (nombre) VALUES (?)').run(cliente);
    clienteRow = { id: lastInsertRowid };
  }

  const { lastInsertRowid: facturaId } = db
    .prepare(
      'INSERT INTO facturas (cliente_id, concepto, neto, condicion, estado) VALUES (?, ?, ?, ?, ?)'
    )
    .run(clienteRow.id, concepto, neto, condicion, 'pendiente');

  res.status(201).json({ id: facturaId });
});

app.listen(PORT, () => {
  console.log(`Nexo backend escuchando en http://localhost:${PORT}`);
});
