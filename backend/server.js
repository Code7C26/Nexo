import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db, { withTransaction } from './db/index.js';
import { interpretar, InterpreteError } from './interprete.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));
// assets/ vive al mismo nivel que backend/ y frontend/ (así lo define
// CLAUDE.md), no adentro de frontend/. Sin este mount el logo y el
// favicon no serían alcanzables por HTTP. Es una ruta estática de solo
// lectura, no toca lógica ni datos.
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));

/* ---------- Clientes (CRM) ---------- */

// Las ventas anuladas no cuentan para el total gastado ni la cantidad de
// compras: se dieron de baja, no representan plata que el cliente gastó.
const SELECT_CLIENTE_CON_TOTALES = `
  SELECT clientes.*,
         (SELECT COALESCE(SUM(venta_items.cantidad * venta_items.precio_unitario), 0)
            FROM ventas JOIN venta_items ON venta_items.venta_id = ventas.id
           WHERE ventas.cliente_id = clientes.id AND ventas.estado = 'activa') AS total_gastado,
         (SELECT COUNT(*) FROM ventas
           WHERE ventas.cliente_id = clientes.id AND ventas.estado = 'activa') AS cantidad_compras,
         (SELECT MAX(fecha) FROM ventas
           WHERE ventas.cliente_id = clientes.id AND ventas.estado = 'activa') AS ultima_compra,
         COALESCE((SELECT saldo FROM saldo_cc_clientes
                    WHERE saldo_cc_clientes.cliente_id = clientes.id), 0) AS deuda
    FROM clientes`;

app.get('/api/clientes', (req, res) => {
  const clientes = db.prepare(`${SELECT_CLIENTE_CON_TOTALES} ORDER BY clientes.nombre`).all();
  res.json(clientes);
});

app.get('/api/clientes/:id', (req, res) => {
  const clienteId = Number(req.params.id);
  const cliente = db.prepare(`${SELECT_CLIENTE_CON_TOTALES} WHERE clientes.id = ?`).get(clienteId);
  if (!cliente) {
    return res.status(404).json({ error: 'Cliente no encontrado.' });
  }

  const historial = db
    .prepare(
      `SELECT ventas.id, ventas.fecha, ventas.estado,
              (SELECT COALESCE(SUM(cantidad * precio_unitario), 0)
                 FROM venta_items WHERE venta_items.venta_id = ventas.id) AS total,
              (SELECT COALESCE(SUM(importe), 0)
                 FROM cobros WHERE cobros.venta_id = ventas.id) AS cobrado
         FROM ventas WHERE ventas.cliente_id = ?
        ORDER BY ventas.fecha DESC, ventas.id DESC`
    )
    .all(clienteId);

  res.json({
    ...cliente,
    historial: historial.map((v) => ({
      ...v,
      estado_cobro: v.cobrado <= 0 ? 'pendiente' : v.cobrado >= v.total ? 'cobrado' : 'parcial'
    }))
  });
});

app.post('/api/clientes', (req, res) => {
  const { nombre, email, telefono, direccion, documento, notas } = req.body;
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El cliente necesita un nombre.' });
  }

  const { lastInsertRowid } = db
    .prepare(
      'INSERT INTO clientes (nombre, email, telefono, direccion, documento, notas) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(
      nombre.trim(),
      email ?? null,
      telefono ?? null,
      direccion ?? null,
      documento ?? null,
      notas ?? null
    );
  res.status(201).json({ id: lastInsertRowid });
});

app.patch('/api/clientes/:id', (req, res) => {
  const clienteId = Number(req.params.id);
  const cliente = db.prepare('SELECT id FROM clientes WHERE id = ?').get(clienteId);
  if (!cliente) {
    return res.status(404).json({ error: 'Cliente no encontrado.' });
  }

  const { nombre, email, telefono, direccion, documento, notas } = req.body;
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El cliente necesita un nombre.' });
  }

  db.prepare(
    'UPDATE clientes SET nombre = ?, email = ?, telefono = ?, direccion = ?, documento = ?, notas = ? WHERE id = ?'
  ).run(
    nombre.trim(),
    email ?? null,
    telefono ?? null,
    direccion ?? null,
    documento ?? null,
    notas ?? null,
    clienteId
  );
  res.json({ id: clienteId });
});

// El correlativo es por (punto de venta, tipo, letra): cada combinación
// tiene su propia serie, como en la realidad. El índice único
// (db/index.js) es la garantía real contra un choque; esto solo calcula
// el candidato — tiene que llamarse siempre dentro de la misma
// transacción que hace el INSERT, para que las dos cosas sean atómicas.
function siguienteNumero(puntoVenta, tipo, letra) {
  const { maximo } = db
    .prepare('SELECT MAX(numero) AS maximo FROM facturas WHERE punto_venta = ? AND tipo = ? AND letra = ?')
    .get(puntoVenta, tipo, letra);
  return (maximo ?? 0) + 1;
}

const comprobante = (f) =>
  `${f.letra} ${String(f.punto_venta).padStart(4, '0')}-${String(f.numero).padStart(8, '0')}`;

// El estado de cobro de una factura que respalda una venta se calcula en
// vivo a partir de los cobros de esa venta (misma cuenta que ya usa
// GET /api/ventas): así nunca se desincroniza del cobro real. Una factura
// suelta no tiene cobros de dónde derivarlo, así que conserva su propio
// campo `estado`.
// facturas.neto es la foto del total de la venta al momento de facturar;
// una devolución posterior no reescribe esa foto (igual que
// costo_unitario_historico no se reescribe), pero sí tiene que descontarse
// acá para que el estado de cobro no siga pidiendo por mercadería que
// ya volvió — mismo criterio que GET /api/ventas.
const SUBQUERY_DEVUELTO_DE_VENTA_FACTURA = `
  COALESCE((
    SELECT SUM(devolucion_items.cantidad * devolucion_items.precio_unitario)
      FROM devolucion_items
      JOIN devoluciones ON devoluciones.id = devolucion_items.devolucion_id
      JOIN venta_items ON venta_items.id = devolucion_items.venta_item_id
     WHERE venta_items.venta_id = facturas.venta_id AND devoluciones.estado = 'activa'
  ), 0)`;

const SELECT_FACTURA = `
  SELECT facturas.id, facturas.cliente_id, clientes.nombre AS cliente, facturas.concepto,
         facturas.neto, facturas.neto AS total, facturas.condicion, facturas.fecha,
         facturas.tipo, facturas.letra, facturas.punto_venta, facturas.numero, facturas.venta_id,
         facturas.devolucion_id,
         CASE
           WHEN facturas.venta_id IS NOT NULL THEN (
             SELECT CASE
                      WHEN COALESCE(SUM(cobros.importe), 0) <= 0 THEN 'pendiente'
                      WHEN COALESCE(SUM(cobros.importe), 0) >= facturas.neto - ${SUBQUERY_DEVUELTO_DE_VENTA_FACTURA} THEN 'cobrado'
                      ELSE 'parcial'
                    END
               FROM cobros WHERE cobros.venta_id = facturas.venta_id
           )
           ELSE facturas.estado
         END AS estado_cobro
    FROM facturas
    JOIN clientes ON clientes.id = facturas.cliente_id`;

app.get('/api/facturas', (req, res) => {
  const facturas = db.prepare(`${SELECT_FACTURA} ORDER BY facturas.id DESC`).all();
  res.json(facturas.map((f) => ({ ...f, comprobante: comprobante(f) })));
});

app.get('/api/facturas/:id', (req, res) => {
  const facturaId = Number(req.params.id);
  const factura = db.prepare(`${SELECT_FACTURA} WHERE facturas.id = ?`).get(facturaId);
  if (!factura) {
    return res.status(404).json({ error: 'Factura no encontrada.' });
  }

  // Si respalda una venta, se traen sus items para poder ver qué se
  // facturó — mismo shape que ya arma GET /api/ventas/:id.
  const items = factura.venta_id
    ? db
        .prepare(
          `SELECT venta_items.producto_id, productos.nombre AS producto,
                  venta_items.cantidad, venta_items.precio_unitario
             FROM venta_items JOIN productos ON productos.id = venta_items.producto_id
            WHERE venta_id = ?
            ORDER BY venta_items.id`
        )
        .all(factura.venta_id)
        .map((i) => ({ ...i, subtotal: i.cantidad * i.precio_unitario }))
    : [];

  res.json({ ...factura, comprobante: comprobante(factura), items });
});

// Factura "suelta": sin venta detrás. Se conserva porque ya la usa el
// flujo de facturación rápida, pero es plata que el sistema no puede
// cruzar con stock, cuenta corriente ni resultado — por eso el listado la
// marca distinto de una factura que sí respalda una venta.
app.post('/api/facturas', (req, res) => {
  const { cliente, concepto, neto, condicion, tipo, letra, punto_venta } = req.body;

  const tipoFinal = tipo || 'factura';
  const letraFinal = letra || 'B';
  const puntoVentaFinal = Number(punto_venta) || 1;

  const facturaId = withTransaction(() => {
    let clienteRow = db.prepare('SELECT id FROM clientes WHERE nombre = ?').get(cliente);
    if (!clienteRow) {
      const { lastInsertRowid } = db.prepare('INSERT INTO clientes (nombre) VALUES (?)').run(cliente);
      clienteRow = { id: lastInsertRowid };
    }

    const numero = siguienteNumero(puntoVentaFinal, tipoFinal, letraFinal);
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO facturas (cliente_id, concepto, neto, condicion, estado, tipo, letra, punto_venta, numero)
         VALUES (?, ?, ?, ?, 'pendiente', ?, ?, ?, ?)`
      )
      .run(clienteRow.id, concepto, neto, condicion, tipoFinal, letraFinal, puntoVentaFinal, numero);

    return lastInsertRowid;
  });

  res.status(201).json({ id: facturaId });
});

/* ---------- Productos ---------- */

const SELECT_PRODUCTO = `
  SELECT productos.id, productos.nombre, productos.sku, productos.precio_costo,
         productos.precio_venta, productos.activo,
         productos.stock_minimo, productos.stock_maximo,
         COALESCE(stock_actual.cantidad, 0) AS stock
    FROM productos
    LEFT JOIN stock_actual ON stock_actual.producto_id = productos.id`;

// Semáforo de stock. El mínimo avisa cuando llegás a ese número (no cuando
// lo perforás): si configurás 5, con 5 unidades ya querés reponer. El
// máximo es opcional; sin máximo, un producto nunca marca "alto".
function estadoStock(stock, stockMinimo, stockMaximo) {
  if (stock <= 0) return 'sin_stock';
  if (stockMinimo > 0 && stock <= stockMinimo) return 'bajo';
  if (stockMaximo !== null && stockMaximo > 0 && stock > stockMaximo) return 'alto';
  return 'normal';
}

// Campos calculados que no se guardan (CLAUDE.md §4: la info derivada se
// calcula, no se persiste). El margen es sobre el precio de venta:
// (precio - costo) / precio. Sin precio de venta cargado no hay margen que
// mostrar, por eso null en vez de 0 (0% sería mentira).
function decorarProducto(p) {
  return {
    ...p,
    valorizado: p.precio_costo * p.stock,
    margen: p.precio_venta > 0 ? ((p.precio_venta - p.precio_costo) / p.precio_venta) * 100 : null,
    estado_stock: estadoStock(p.stock, p.stock_minimo, p.stock_maximo)
  };
}

app.get('/api/productos', (req, res) => {
  const productos = db.prepare(`${SELECT_PRODUCTO} ORDER BY productos.nombre`).all();
  res.json(productos.map(decorarProducto));
});

function normalizarPrecio(valor) {
  return valor === undefined || valor === null || valor === '' ? 0 : Number(valor);
}

// stock_maximo es opcional de verdad: vacío significa "sin tope", no 0.
function normalizarStockMaximo(valor) {
  return valor === undefined || valor === null || valor === '' ? null : Number(valor);
}

// Validación compartida por POST y PATCH. Devuelve el mensaje de error o
// null si está todo bien. Notar que precio_costo NO se lee del body en
// ningún lado: el costo lo fija la compra al proveedor, no esta pantalla.
function validarProducto({ nombre, precio_venta, stock_minimo, stock_maximo }) {
  if (!nombre || !nombre.trim()) {
    return 'El producto necesita un nombre.';
  }
  const venta = normalizarPrecio(precio_venta);
  if (Number.isNaN(venta) || venta < 0) {
    return 'El precio de venta debe ser un número mayor o igual a 0.';
  }
  const minimo = normalizarPrecio(stock_minimo);
  const maximo = normalizarStockMaximo(stock_maximo);
  if (Number.isNaN(minimo) || minimo < 0 || (maximo !== null && (Number.isNaN(maximo) || maximo < 0))) {
    return 'El stock mínimo y máximo deben ser números mayores o iguales a 0.';
  }
  if (maximo !== null && maximo < minimo) {
    return 'El stock máximo no puede ser menor que el mínimo.';
  }
  return null;
}

app.post('/api/productos', (req, res) => {
  const error = validarProducto(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const { nombre, sku, precio_venta, activo, stock_minimo, stock_maximo } = req.body;
  const skuNormalizado = sku && sku.trim() ? sku.trim() : null;

  let lastInsertRowid;
  try {
    // precio_costo arranca en 0 a propósito: un producto recién creado
    // todavía no se compró, así que no tiene costo real. Lo va a fijar la
    // primera compra que lo incluya.
    ({ lastInsertRowid } = db
      .prepare(
        `INSERT INTO productos (nombre, sku, precio_costo, precio_venta, activo, stock_minimo, stock_maximo)
         VALUES (?, ?, 0, ?, ?, ?, ?)`
      )
      .run(
        nombre.trim(),
        skuNormalizado,
        normalizarPrecio(precio_venta),
        activo === false || activo === 0 ? 0 : 1,
        normalizarPrecio(stock_minimo),
        normalizarStockMaximo(stock_maximo)
      ));
  } catch (err) {
    if (String(err.message).includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Ya existe un producto con ese SKU.' });
    }
    throw err;
  }
  res.status(201).json({ id: lastInsertRowid });
});

app.patch('/api/productos/:id', (req, res) => {
  const productoId = Number(req.params.id);
  const producto = db.prepare('SELECT id FROM productos WHERE id = ?').get(productoId);
  if (!producto) {
    return res.status(404).json({ error: 'Producto no encontrado.' });
  }

  const error = validarProducto(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const { nombre, sku, precio_venta, activo, stock_minimo, stock_maximo } = req.body;
  const skuNormalizado = sku && sku.trim() ? sku.trim() : null;

  try {
    // precio_costo queda deliberadamente fuera del UPDATE: es el promedio
    // ponderado que calculan las compras, editarlo a mano acá rompería la
    // trazabilidad del costo real.
    db.prepare(
      `UPDATE productos
          SET nombre = ?, sku = ?, precio_venta = ?, activo = ?, stock_minimo = ?, stock_maximo = ?
        WHERE id = ?`
    ).run(
      nombre.trim(),
      skuNormalizado,
      normalizarPrecio(precio_venta),
      activo === false || activo === 0 ? 0 : 1,
      normalizarPrecio(stock_minimo),
      normalizarStockMaximo(stock_maximo),
      productoId
    );
  } catch (err) {
    if (String(err.message).includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Ya existe un producto con ese SKU.' });
    }
    throw err;
  }
  res.json({ id: productoId });
});

// Historial de movimientos de stock de un producto. El stock resultante se
// calcula acumulando desde el movimiento más viejo (CLAUDE.md §5 pide poder
// ver el stock anterior y posterior de cada movimiento) y recién ahí se da
// vuelta la lista, para mostrar lo más reciente primero.
app.get('/api/productos/:id/movimientos', (req, res) => {
  const productoId = Number(req.params.id);
  const producto = db.prepare('SELECT id FROM productos WHERE id = ?').get(productoId);
  if (!producto) {
    return res.status(404).json({ error: 'Producto no encontrado.' });
  }

  const movimientos = db
    .prepare(
      `SELECT id, tipo, cantidad, origen, venta_id, compra_id, devolucion_id, fecha, nota
         FROM movimientos_stock
        WHERE producto_id = ?
        ORDER BY fecha, id`
    )
    .all(productoId);

  let acumulado = 0;
  const conSaldo = movimientos.map((m) => {
    const delta = m.tipo === 'salida' ? -m.cantidad : m.cantidad;
    const stockAnterior = acumulado;
    acumulado += delta;
    return { ...m, delta, stock_anterior: stockAnterior, stock_posterior: acumulado };
  });

  res.json(conSaldo.reverse());
});

/* ---------- Proveedores ---------- */

// Espejo de SELECT_CLIENTE_CON_TOTALES. Igual que aquel ignora las ventas
// anuladas, este ignora las compras que no están activas: un borrador
// todavía no es plata comprometida y una anulada ya se revirtió.
// El total comprado suma el envío, porque es lo que realmente se le pagó
// al proveedor, no solo la mercadería.
const SELECT_PROVEEDOR_CON_TOTALES = `
  SELECT proveedores.*,
         (SELECT COALESCE(SUM(compra_items.cantidad * compra_items.precio_unitario), 0)
            FROM compras JOIN compra_items ON compra_items.compra_id = compras.id
           WHERE compras.proveedor_id = proveedores.id AND compras.estado = 'activa')
         + (SELECT COALESCE(SUM(costo_envio), 0) FROM compras
             WHERE compras.proveedor_id = proveedores.id AND compras.estado = 'activa') AS total_comprado,
         (SELECT COUNT(*) FROM compras
           WHERE compras.proveedor_id = proveedores.id AND compras.estado = 'activa') AS cantidad_compras,
         (SELECT MAX(fecha) FROM compras
           WHERE compras.proveedor_id = proveedores.id AND compras.estado = 'activa') AS ultima_compra,
         COALESCE((SELECT saldo FROM saldo_cc_proveedores
                    WHERE saldo_cc_proveedores.proveedor_id = proveedores.id), 0) AS deuda
    FROM proveedores`;

app.get('/api/proveedores', (req, res) => {
  const proveedores = db.prepare(`${SELECT_PROVEEDOR_CON_TOTALES} ORDER BY proveedores.nombre`).all();
  res.json(proveedores);
});

app.get('/api/proveedores/:id', (req, res) => {
  const proveedorId = Number(req.params.id);
  const proveedor = db
    .prepare(`${SELECT_PROVEEDOR_CON_TOTALES} WHERE proveedores.id = ?`)
    .get(proveedorId);
  if (!proveedor) {
    return res.status(404).json({ error: 'Proveedor no encontrado.' });
  }

  const historial = db
    .prepare(
      `SELECT compras.id, compras.fecha, compras.estado, compras.estado_envio,
              (SELECT COALESCE(SUM(cantidad * precio_unitario), 0)
                 FROM compra_items WHERE compra_items.compra_id = compras.id) + compras.costo_envio AS total,
              (SELECT COALESCE(SUM(importe), 0)
                 FROM pagos WHERE pagos.compra_id = compras.id) AS pagado
         FROM compras WHERE compras.proveedor_id = ?
        ORDER BY compras.fecha DESC, compras.id DESC`
    )
    .all(proveedorId);

  const pagos = db
    .prepare(
      `SELECT pagos.id, pagos.fecha, pagos.importe, pagos.compra_id, pagos.nota,
              cuentas_tesoreria.nombre AS cuenta
         FROM pagos
         JOIN compras ON compras.id = pagos.compra_id
         JOIN cuentas_tesoreria ON cuentas_tesoreria.id = pagos.cuenta_tesoreria_id
        WHERE compras.proveedor_id = ?
        ORDER BY pagos.fecha DESC, pagos.id DESC`
    )
    .all(proveedorId);

  res.json({
    ...proveedor,
    historial: historial.map((c) => ({
      ...c,
      estado_pago: c.pagado <= 0 ? 'pendiente' : c.pagado >= c.total ? 'pagado' : 'parcial'
    })),
    pagos
  });
});

app.post('/api/proveedores', (req, res) => {
  const { nombre, email, telefono, direccion, documento, notas } = req.body;

  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'El proveedor necesita un nombre.' });
  }

  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO proveedores (nombre, email, telefono, direccion, documento, notas)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      String(nombre).trim(),
      email ?? null,
      telefono ?? null,
      direccion ?? null,
      documento ?? null,
      notas ?? null
    );
  res.status(201).json({ id: lastInsertRowid });
});

app.patch('/api/proveedores/:id', (req, res) => {
  const proveedorId = Number(req.params.id);
  const { nombre, email, telefono, direccion, documento, notas } = req.body;

  const proveedor = db.prepare('SELECT id FROM proveedores WHERE id = ?').get(proveedorId);
  if (!proveedor) {
    return res.status(404).json({ error: 'Proveedor no encontrado.' });
  }
  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'El proveedor necesita un nombre.' });
  }

  db.prepare(
    `UPDATE proveedores
        SET nombre = ?, email = ?, telefono = ?, direccion = ?, documento = ?, notas = ?
      WHERE id = ?`
  ).run(
    String(nombre).trim(),
    email ?? null,
    telefono ?? null,
    direccion ?? null,
    documento ?? null,
    notas ?? null,
    proveedorId
  );
  res.json({ id: proveedorId });
});

/* ---------- Stock ---------- */

// Stock no devuelve precio_venta a propósito: esta pantalla es sobre
// cuánta mercadería hay y cuánto vale, no sobre a cuánto se vende (eso
// vive en Productos).
app.get('/api/stock', (req, res) => {
  const stock = db
    .prepare(
      `SELECT productos.id, productos.nombre, productos.precio_costo,
              productos.stock_minimo, productos.stock_maximo,
              COALESCE(stock_actual.cantidad, 0) AS stock
       FROM productos
       LEFT JOIN stock_actual ON stock_actual.producto_id = productos.id
       ORDER BY productos.nombre`
    )
    .all();
  res.json(
    stock.map((p) => ({
      ...p,
      valorizado: p.precio_costo * p.stock,
      estado_stock: estadoStock(p.stock, p.stock_minimo, p.stock_maximo)
    }))
  );
});

app.post('/api/stock/ajuste', (req, res) => {
  const { producto_id, cantidad, nota } = req.body;

  const producto = db.prepare('SELECT id FROM productos WHERE id = ?').get(producto_id);
  if (!producto) {
    return res.status(400).json({ error: 'El producto no existe.' });
  }
  if (!Number(cantidad) || Number(cantidad) === 0) {
    return res.status(400).json({ error: 'La cantidad del ajuste no puede ser 0.' });
  }

  const { lastInsertRowid } = db
    .prepare(
      "INSERT INTO movimientos_stock (producto_id, tipo, cantidad, origen, nota) VALUES (?, 'ajuste', ?, 'ajuste_manual', ?)"
    )
    .run(producto_id, Number(cantidad), nota ?? null);
  res.status(201).json({ id: lastInsertRowid });
});

// Historial general de movimientos de stock, de todos los productos. La
// misma info que ya existe por producto (GET /api/productos/:id/movimientos)
// pero sin filtrar, para verla toda junta desde la página de Stock.
// El filtrado lo hace el navegador con el mismo motor que el resto de las
// pantallas: los operadores (contiene, mayor que, entre, períodos
// relativos…) serían mucho SQL y, sobre todo, tener dos motores haría que
// el mismo filtro se comporte distinto según la pantalla.
// Para que filtrar en memoria no mienta, el tope se sube a algo que cubre
// la operación real de una PyME. Si algún día una base supera las 2000
// filas de movimientos, hay que volver a bajar el filtrado al servidor.
const TOPE_MOVIMIENTOS = 2000;

app.get('/api/movimientos-stock', (req, res) => {
  const limite = Math.min(Number(req.query.limit) || TOPE_MOVIMIENTOS, 5000);
  const movimientos = db
    .prepare(
      `SELECT movimientos_stock.id, movimientos_stock.fecha, movimientos_stock.tipo,
              movimientos_stock.cantidad, movimientos_stock.origen, movimientos_stock.nota,
              movimientos_stock.venta_id, movimientos_stock.compra_id, movimientos_stock.devolucion_id,
              movimientos_stock.producto_id,
              productos.nombre AS producto
         FROM movimientos_stock
         JOIN productos ON productos.id = movimientos_stock.producto_id
        ORDER BY movimientos_stock.fecha DESC, movimientos_stock.id DESC
        LIMIT ?`
    )
    .all(limite);
  res.json(movimientos);
});

/* ---------- Ventas ---------- */

// devuelto: plata acreditada por devoluciones activas de esta venta (ver
// sección Devoluciones más abajo). neto = total - devuelto, y es lo que
// realmente se le puede reclamar al cliente — el estado_cobro compara
// contra neto, no contra total, para no seguir pidiendo plata por
// mercadería que ya volvió.
const SUBQUERY_DEVUELTO_VENTA = `
  (SELECT COALESCE(SUM(devolucion_items.cantidad * devolucion_items.precio_unitario), 0)
     FROM devolucion_items
     JOIN devoluciones ON devoluciones.id = devolucion_items.devolucion_id
     JOIN venta_items ON venta_items.id = devolucion_items.venta_item_id
    WHERE venta_items.venta_id = ventas.id AND devoluciones.estado = 'activa')`;

app.get('/api/ventas', (req, res) => {
  const ventas = db
    .prepare(
      `SELECT ventas.id, ventas.cliente_id, clientes.nombre AS cliente, ventas.fecha, ventas.estado,
              (SELECT COALESCE(SUM(cantidad * precio_unitario), 0)
                 FROM venta_items WHERE venta_items.venta_id = ventas.id) AS total,
              (SELECT COALESCE(SUM((precio_unitario - costo_unitario_historico) * cantidad), 0)
                 FROM venta_items WHERE venta_items.venta_id = ventas.id) AS margen,
              (SELECT COALESCE(SUM(importe), 0)
                 FROM cobros WHERE cobros.venta_id = ventas.id) AS cobrado,
              ${SUBQUERY_DEVUELTO_VENTA} AS devuelto,
              (SELECT GROUP_CONCAT(
                        (CASE WHEN venta_items.cantidad = CAST(venta_items.cantidad AS INTEGER)
                              THEN CAST(venta_items.cantidad AS INTEGER)
                              ELSE venta_items.cantidad END) || ' × ' || productos.nombre, ', ')
                 FROM venta_items JOIN productos ON productos.id = venta_items.producto_id
                WHERE venta_items.venta_id = ventas.id) AS items_resumen,
              EXISTS (SELECT 1 FROM facturas WHERE facturas.venta_id = ventas.id) AS facturada,
              EXISTS (SELECT 1 FROM devoluciones
                       WHERE devoluciones.venta_id = ventas.id AND devoluciones.estado = 'activa') AS tiene_devolucion
       FROM ventas
       JOIN clientes ON clientes.id = ventas.cliente_id
       ORDER BY ventas.id DESC`
    )
    .all();
  res.json(
    ventas.map((v) => {
      const neto = v.total - v.devuelto;
      return {
        ...v,
        costo_total: v.total - v.margen,
        facturada: Boolean(v.facturada),
        tiene_devolucion: Boolean(v.tiene_devolucion),
        neto,
        estado_cobro: v.cobrado <= 0 ? 'pendiente' : v.cobrado >= neto ? 'cobrado' : 'parcial'
      };
    })
  );
});

app.get('/api/ventas/:id', (req, res) => {
  const ventaId = Number(req.params.id);
  const venta = db
    .prepare(
      `SELECT ventas.id, ventas.cliente_id, clientes.nombre AS cliente, ventas.fecha, ventas.estado,
              EXISTS (SELECT 1 FROM devoluciones
                       WHERE devoluciones.venta_id = ventas.id AND devoluciones.estado = 'activa') AS tiene_devolucion
         FROM ventas JOIN clientes ON clientes.id = ventas.cliente_id
        WHERE ventas.id = ?`
    )
    .get(ventaId);
  if (!venta) {
    return res.status(404).json({ error: 'Venta no encontrada.' });
  }

  // cantidad_devuelta: cuánto de este renglón ya se devolvió (solo cuenta
  // devoluciones activas). Es lo que alimenta el modal de devolución para
  // topar la cantidad a devolver a lo que realmente queda.
  const items = db
    .prepare(
      `SELECT venta_items.id, venta_items.producto_id, productos.nombre AS producto,
              venta_items.cantidad, venta_items.precio_unitario, venta_items.costo_unitario_historico,
              COALESCE((
                SELECT SUM(devolucion_items.cantidad)
                  FROM devolucion_items JOIN devoluciones ON devoluciones.id = devolucion_items.devolucion_id
                 WHERE devolucion_items.venta_item_id = venta_items.id AND devoluciones.estado = 'activa'
              ), 0) AS cantidad_devuelta
         FROM venta_items JOIN productos ON productos.id = venta_items.producto_id
        WHERE venta_id = ?
        ORDER BY venta_items.id`
    )
    .all(ventaId);

  const total = items.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0);
  const costoTotal = items.reduce((acc, i) => acc + i.cantidad * i.costo_unitario_historico, 0);
  const devuelto = items.reduce((acc, i) => acc + i.cantidad_devuelta * i.precio_unitario, 0);
  const neto = total - devuelto;
  const { cobrado } = db
    .prepare('SELECT COALESCE(SUM(importe), 0) AS cobrado FROM cobros WHERE venta_id = ?')
    .get(ventaId);
  const facturada = Boolean(db.prepare('SELECT 1 FROM facturas WHERE venta_id = ?').get(ventaId));

  res.json({
    ...venta,
    tiene_devolucion: Boolean(venta.tiene_devolucion),
    items: items.map((i) => ({
      ...i,
      subtotal: i.cantidad * i.precio_unitario,
      ganancia: (i.precio_unitario - i.costo_unitario_historico) * i.cantidad,
      disponible_devolucion: i.cantidad - i.cantidad_devuelta
    })),
    total,
    costo_total: costoTotal,
    margen: total - costoTotal,
    devuelto,
    neto,
    cobrado,
    facturada,
    estado_cobro: cobrado <= 0 ? 'pendiente' : cobrado >= neto ? 'cobrado' : 'parcial'
  });
});

// Valida que haya stock para todos los items pedidos. Devuelve un mensaje
// de error o null si está todo bien. Se suman las cantidades por producto
// primero, por si el mismo producto aparece en más de un renglón.
// La usan el alta de venta y la conversión de un presupuesto: las dos
// tienen que rechazar por el mismo motivo y con el mismo texto.
function validarStockDisponible(items) {
  const buscarStockDisponible = db.prepare(
    `SELECT productos.nombre, COALESCE(stock_actual.cantidad, 0) AS stock
     FROM productos LEFT JOIN stock_actual ON stock_actual.producto_id = productos.id
     WHERE productos.id = ?`
  );
  const cantidadPorProducto = new Map();
  for (const item of items) {
    cantidadPorProducto.set(
      item.producto_id,
      (cantidadPorProducto.get(item.producto_id) ?? 0) + Number(item.cantidad)
    );
  }
  for (const [producto_id, cantidadPedida] of cantidadPorProducto) {
    const producto = buscarStockDisponible.get(producto_id);
    if (!producto) {
      return 'Uno de los productos de la venta no existe.';
    }
    if (cantidadPedida > producto.stock) {
      return `No hay suficiente stock de "${producto.nombre}" (disponible: ${producto.stock}).`;
    }
  }
  return null;
}

// Crea la venta con todos sus efectos: items, salida de stock, costo
// histórico congelado y deuda en la cuenta corriente.
// IMPORTANTE: asume que el stock ya se validó y que se la llama DENTRO de
// una transacción — así la conversión de un presupuesto puede meter en la
// misma transacción la venta y la marca del presupuesto, sin que quede
// una venta creada con el presupuesto sin convertir.
function crearVenta({ cliente, cliente_id, items, fecha }) {
  // Si el frontend ya sabe qué cliente es (lo eligió de la lista), usa
  // su id directamente: evita crear un duplicado por una diferencia de
  // tipeo. Si no, se resuelve por nombre y se crea si no existe.
  let clienteRow = cliente_id
    ? db.prepare('SELECT id FROM clientes WHERE id = ?').get(cliente_id)
    : db.prepare('SELECT id FROM clientes WHERE nombre = ?').get(cliente);
  if (!clienteRow) {
    const { lastInsertRowid } = db.prepare('INSERT INTO clientes (nombre) VALUES (?)').run(cliente);
    clienteRow = { id: lastInsertRowid };
  }

  // Si no viene fecha, se omite la columna para que aplique el
  // DEFAULT date('now') de la tabla en vez de pisarlo con un valor JS.
  const { lastInsertRowid: nuevaVentaId } = fecha
    ? db.prepare('INSERT INTO ventas (cliente_id, fecha) VALUES (?, ?)').run(clienteRow.id, fecha)
    : db.prepare('INSERT INTO ventas (cliente_id) VALUES (?)').run(clienteRow.id);

  const buscarCostoActual = db.prepare('SELECT precio_costo FROM productos WHERE id = ?');
  const insertItem = db.prepare(
    `INSERT INTO venta_items (venta_id, producto_id, cantidad, precio_unitario, costo_unitario_historico)
     VALUES (?, ?, ?, ?, ?)`
  );
  const insertMovimiento = db.prepare(
    "INSERT INTO movimientos_stock (producto_id, tipo, cantidad, origen, venta_id) VALUES (?, 'salida', ?, 'venta', ?)"
  );
  const actualizarPrecioVenta = db.prepare('UPDATE productos SET precio_venta = ? WHERE id = ?');

  let total = 0;
  for (const item of items) {
    // El costo se congela ACA, antes de tocar nada más del producto: es
    // la foto del momento de la venta, no se vuelve a recalcular después.
    const { precio_costo: costoActual } = buscarCostoActual.get(item.producto_id);
    insertItem.run(nuevaVentaId, item.producto_id, item.cantidad, item.precio_unitario, costoActual);
    insertMovimiento.run(item.producto_id, item.cantidad, nuevaVentaId);
    actualizarPrecioVenta.run(item.precio_unitario, item.producto_id);
    total += item.cantidad * item.precio_unitario;
  }

  // Toda venta aumenta la deuda del cliente; se salda con cobros. No
  // hace falta un flag "es a crédito": una venta cobrada al instante
  // simplemente tiene su cobro registrado enseguida.
  db.prepare(
    "INSERT INTO movimientos_cc_clientes (cliente_id, tipo, importe, venta_id) VALUES (?, 'venta', ?, ?)"
  ).run(clienteRow.id, total, nuevaVentaId);

  return nuevaVentaId;
}

app.post('/api/ventas', (req, res) => {
  const { cliente, cliente_id, items, fecha } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'La venta necesita al menos un item.' });
  }

  // No se puede vender más de lo que hay: se valida antes de tocar nada,
  // así una venta que falla no deja nada a mitad de camino.
  const errorStock = validarStockDisponible(items);
  if (errorStock) {
    return res.status(400).json({ error: errorStock });
  }

  const ventaId = withTransaction(() => crearVenta({ cliente, cliente_id, items, fecha }));

  res.status(201).json({ id: ventaId });
});

// Editar una venta ya cargada, mientras no esté facturada ni anulada. El
// total nuevo no puede quedar por debajo de lo ya cobrado (no tendría
// sentido: sería cobrar más de lo que vale la venta). Se resuelve
// revirtiendo el stock y la cuenta corriente actuales y volviendo a
// aplicar con los items nuevos, mismo patrón que la edición de compras.
app.put('/api/ventas/:id', (req, res) => {
  const ventaId = Number(req.params.id);
  const { cliente, cliente_id, items, fecha } = req.body;

  const venta = db.prepare('SELECT id, cliente_id, estado FROM ventas WHERE id = ?').get(ventaId);
  if (!venta) {
    return res.status(404).json({ error: 'Venta no encontrada.' });
  }
  if (venta.estado === 'anulada') {
    return res
      .status(400)
      .json({ error: 'Esta venta está anulada. Restaurala primero si querés editarla.' });
  }
  const facturada = db.prepare('SELECT 1 FROM facturas WHERE venta_id = ?').get(ventaId);
  if (facturada) {
    return res.status(400).json({ error: 'Esta venta ya tiene una factura asociada, no se puede editar.' });
  }
  // Editar reemplaza venta_items enteros (ver más abajo), y
  // devolucion_items.venta_item_id apunta a esas filas exactas: si se
  // permitiera editar, las devoluciones ya cargadas quedarían apuntando a
  // renglones que ya no existen.
  const tieneDevolucionEdicion = db
    .prepare("SELECT 1 FROM devoluciones WHERE venta_id = ? AND estado = 'activa'")
    .get(ventaId);
  if (tieneDevolucionEdicion) {
    return res
      .status(400)
      .json({ error: 'Esta venta tiene una devolución asociada, no se puede editar.' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'La venta necesita al menos un item.' });
  }

  const { cobrado } = db
    .prepare('SELECT COALESCE(SUM(importe), 0) AS cobrado FROM cobros WHERE venta_id = ?')
    .get(ventaId);
  const nuevoTotal = items.reduce((acc, i) => acc + Number(i.cantidad) * Number(i.precio_unitario), 0);
  if (nuevoTotal < cobrado) {
    return res.status(400).json({
      error: `El total no puede quedar por debajo de lo ya cobrado (${cobrado.toFixed(2)}).`
    });
  }

  const itemsViejos = db
    .prepare('SELECT producto_id, cantidad FROM venta_items WHERE venta_id = ?')
    .all(ventaId);

  // Stock disponible para los items nuevos, contemplando que el stock de
  // los items viejos de esta misma venta se libera primero.
  const liberadoPorProducto = new Map();
  for (const item of itemsViejos) {
    liberadoPorProducto.set(
      item.producto_id,
      (liberadoPorProducto.get(item.producto_id) ?? 0) + item.cantidad
    );
  }
  const pedidoPorProducto = new Map();
  for (const item of items) {
    pedidoPorProducto.set(
      item.producto_id,
      (pedidoPorProducto.get(item.producto_id) ?? 0) + Number(item.cantidad)
    );
  }
  const buscarStockDisponible = db.prepare(
    `SELECT productos.nombre, COALESCE(stock_actual.cantidad, 0) AS stock
       FROM productos LEFT JOIN stock_actual ON stock_actual.producto_id = productos.id
      WHERE productos.id = ?`
  );
  for (const [productoId, cantidadPedida] of pedidoPorProducto) {
    const producto = buscarStockDisponible.get(productoId);
    if (!producto) {
      return res.status(400).json({ error: 'Uno de los productos de la venta no existe.' });
    }
    const disponible = producto.stock + (liberadoPorProducto.get(productoId) ?? 0);
    if (cantidadPedida > disponible) {
      return res.status(400).json({
        error: `No hay suficiente stock de "${producto.nombre}" (disponible: ${disponible}).`
      });
    }
  }

  withTransaction(() => {
    const { subtotal: totalViejo } = db
      .prepare(
        'SELECT COALESCE(SUM(cantidad * precio_unitario), 0) AS subtotal FROM venta_items WHERE venta_id = ?'
      )
      .get(ventaId);

    // 1) Revertir el stock que se había descontado.
    const insertEntrada = db.prepare(
      "INSERT INTO movimientos_stock (producto_id, tipo, cantidad, origen, venta_id, nota) VALUES (?, 'entrada', ?, 'venta', ?, 'Reversión por edición')"
    );
    for (const item of itemsViejos) {
      insertEntrada.run(item.producto_id, item.cantidad, ventaId);
    }

    // 2) Reemplazar cliente, fecha e items.
    let clienteRow = cliente_id
      ? db.prepare('SELECT id FROM clientes WHERE id = ?').get(cliente_id)
      : db.prepare('SELECT id FROM clientes WHERE nombre = ?').get(cliente);
    if (!clienteRow) {
      const { lastInsertRowid } = db.prepare('INSERT INTO clientes (nombre) VALUES (?)').run(cliente);
      clienteRow = { id: lastInsertRowid };
    }
    db.prepare('UPDATE ventas SET cliente_id = ?, fecha = COALESCE(?, fecha) WHERE id = ?').run(
      clienteRow.id,
      fecha || null,
      ventaId
    );

    db.prepare('DELETE FROM venta_items WHERE venta_id = ?').run(ventaId);

    const buscarCostoActual = db.prepare('SELECT precio_costo FROM productos WHERE id = ?');
    const insertItem = db.prepare(
      `INSERT INTO venta_items (venta_id, producto_id, cantidad, precio_unitario, costo_unitario_historico)
       VALUES (?, ?, ?, ?, ?)`
    );
    const insertSalida = db.prepare(
      "INSERT INTO movimientos_stock (producto_id, tipo, cantidad, origen, venta_id) VALUES (?, 'salida', ?, 'venta', ?)"
    );
    const actualizarPrecioVenta = db.prepare('UPDATE productos SET precio_venta = ? WHERE id = ?');

    let total = 0;
    for (const item of items) {
      // Mismo criterio que crear una venta: el costo se congela con el
      // costo actual del producto en este momento, no el que tenía antes.
      const { precio_costo: costoActual } = buscarCostoActual.get(item.producto_id);
      insertItem.run(ventaId, item.producto_id, item.cantidad, item.precio_unitario, costoActual);
      insertSalida.run(item.producto_id, item.cantidad, ventaId);
      actualizarPrecioVenta.run(item.precio_unitario, item.producto_id);
      total += item.cantidad * item.precio_unitario;
    }

    // 3) Ajustar la cuenta corriente (no se reemplaza el movimiento
    // original, se compensa — mismo criterio que anular). Si el cliente
    // cambió, la deuda vieja tiene que revertirse contra el cliente VIEJO
    // y la nueva cargarse contra el NUEVO — insertar un solo ajuste neto
    // contra clienteRow.id (como se hacía antes) le dejaba al cliente
    // viejo una deuda fantasma y al nuevo la venta sin reflejar. Mismo
    // patrón de dos asientos que ya usa la edición de compras (dos
    // proveedores distintos). Cuando el cliente no cambia, los dos caen
    // sobre la misma entidad y la suma neta es idéntica a un solo ajuste.
    const insertAjusteCC = db.prepare(
      "INSERT INTO movimientos_cc_clientes (cliente_id, tipo, importe, venta_id) VALUES (?, 'ajuste', ?, ?)"
    );
    insertAjusteCC.run(venta.cliente_id, -totalViejo, ventaId);
    insertAjusteCC.run(clienteRow.id, total, ventaId);
  });

  res.json({ id: ventaId });
});

app.get('/api/ventas/:id/cobros', (req, res) => {
  const cobros = db
    .prepare(
      `SELECT cobros.id, cobros.fecha, cobros.importe, cobros.nota,
              cuentas_tesoreria.nombre AS cuenta
       FROM cobros
       JOIN cuentas_tesoreria ON cuentas_tesoreria.id = cobros.cuenta_tesoreria_id
       WHERE cobros.venta_id = ?
       ORDER BY cobros.id`
    )
    .all(Number(req.params.id));
  res.json(cobros);
});

app.post('/api/ventas/:id/cobros', (req, res) => {
  const ventaId = Number(req.params.id);
  const { importe, cuenta_tesoreria_id, nota } = req.body;

  const venta = db
    .prepare(
      `SELECT ventas.id, ventas.cliente_id,
              (SELECT COALESCE(SUM(cantidad * precio_unitario), 0) FROM venta_items WHERE venta_id = ventas.id) AS total,
              (SELECT COALESCE(SUM(importe), 0) FROM cobros WHERE venta_id = ventas.id) AS cobrado,
              ${SUBQUERY_DEVUELTO_VENTA} AS devuelto
       FROM ventas WHERE ventas.id = ?`
    )
    .get(ventaId);
  if (!venta) {
    return res.status(404).json({ error: 'Venta no encontrada.' });
  }

  // La mercadería devuelta ya no es plata que se le pueda reclamar al
  // cliente: el saldo pendiente se calcula sobre el neto, no sobre el
  // total bruto de la venta.
  const saldoPendiente = venta.total - venta.devuelto - venta.cobrado;
  if (!(importe > 0)) {
    return res.status(400).json({ error: 'El importe del cobro tiene que ser mayor a 0.' });
  }
  if (importe > saldoPendiente) {
    return res.status(400).json({
      error: `El importe supera el saldo pendiente de la venta (${saldoPendiente.toFixed(2)}).`
    });
  }

  const cobroId = withTransaction(() =>
    registrarCobro(ventaId, venta.cliente_id, importe, cuenta_tesoreria_id, nota)
  );

  res.status(201).json({ id: cobroId });
});

// Inserta el cobro y sus dos efectos (ingreso a tesorería, baja de la
// cuenta corriente del cliente). Sin validación propia — el llamador ya
// tiene que haber verificado importe/saldo pendiente/existencia de la
// cuenta. Asume que se la llama DENTRO de una transacción.
function registrarCobro(ventaId, clienteId, importe, cuentaTesoreriaId, nota) {
  const { lastInsertRowid: nuevoCobroId } = db
    .prepare('INSERT INTO cobros (venta_id, importe, cuenta_tesoreria_id, nota) VALUES (?, ?, ?, ?)')
    .run(ventaId, importe, cuentaTesoreriaId, nota ?? null);

  db.prepare(
    "INSERT INTO movimientos_tesoreria (cuenta_tesoreria_id, tipo, importe, cobro_id, origen) VALUES (?, 'ingreso', ?, ?, 'cobro')"
  ).run(cuentaTesoreriaId, importe, nuevoCobroId);

  db.prepare(
    "INSERT INTO movimientos_cc_clientes (cliente_id, tipo, importe, venta_id, cobro_id) VALUES (?, 'cobro', ?, ?, ?)"
  ).run(clienteId, -importe, ventaId, nuevoCobroId);

  return nuevoCobroId;
}

app.post('/api/ventas/:id/facturar', (req, res) => {
  const ventaId = Number(req.params.id);
  const { condicion, tipo, letra, punto_venta } = req.body;
  const tipoFinal = tipo || 'factura';
  const letraFinal = letra || 'B';
  const puntoVentaFinal = Number(punto_venta) || 1;

  const venta = db
    .prepare('SELECT ventas.id, ventas.cliente_id FROM ventas WHERE ventas.id = ?')
    .get(ventaId);
  if (!venta) {
    return res.status(404).json({ error: 'Venta no encontrada.' });
  }

  const yaFacturada = db.prepare('SELECT 1 FROM facturas WHERE venta_id = ?').get(ventaId);
  if (yaFacturada) {
    return res.status(409).json({ error: 'Esta venta ya tiene una factura asociada.' });
  }

  let facturaId;
  try {
    facturaId = withTransaction(() => {
      const { total } = db
        .prepare(
          'SELECT COALESCE(SUM(cantidad * precio_unitario), 0) AS total FROM venta_items WHERE venta_id = ?'
        )
        .get(ventaId);

      const numero = siguienteNumero(puntoVentaFinal, tipoFinal, letraFinal);
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO facturas (cliente_id, concepto, neto, condicion, estado, venta_id, tipo, letra, punto_venta, numero)
           VALUES (?, ?, ?, ?, 'pendiente', ?, ?, ?, ?, ?)`
        )
        .run(venta.cliente_id, `Venta #${ventaId}`, total, condicion, ventaId, tipoFinal, letraFinal, puntoVentaFinal, numero);

      return lastInsertRowid;
    });
  } catch (err) {
    // Última línea de defensa contra dos facturaciones simultáneas: el
    // chequeo de arriba no es atómico, los índices únicos sí (el de
    // venta_id contra facturar dos veces la misma venta, el de
    // numeración contra repetir un número — este último prácticamente
    // imposible con SQLite de un solo proceso, pero cubierto igual).
    if (String(err.message).includes('idx_facturas_venta_id') || String(err.message).includes('facturas.venta_id')) {
      return res.status(409).json({ error: 'Esta venta ya tiene una factura asociada.' });
    }
    if (String(err.message).includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'No se pudo asignar el número de comprobante, probá de nuevo.' });
    }
    throw err;
  }

  res.status(201).json({ id: facturaId });
});

app.post('/api/ventas/:id/anular', (req, res) => {
  const ventaId = Number(req.params.id);

  const venta = db.prepare('SELECT id, cliente_id, estado FROM ventas WHERE id = ?').get(ventaId);
  if (!venta) {
    return res.status(404).json({ error: 'Venta no encontrada.' });
  }
  if (venta.estado === 'anulada') {
    return res.status(400).json({ error: 'Esta venta ya está anulada.' });
  }

  const tieneFactura = db.prepare('SELECT 1 FROM facturas WHERE venta_id = ?').get(ventaId);
  if (tieneFactura) {
    return res.status(400).json({ error: 'Esta venta tiene una factura asociada, no se puede anular.' });
  }

  const tieneCobros = db.prepare('SELECT 1 FROM cobros WHERE venta_id = ?').get(ventaId);
  if (tieneCobros) {
    return res.status(400).json({ error: 'Esta venta tiene cobros registrados, no se puede anular.' });
  }

  const tieneDevolucionAnular = db
    .prepare("SELECT 1 FROM devoluciones WHERE venta_id = ? AND estado = 'activa'")
    .get(ventaId);
  if (tieneDevolucionAnular) {
    return res
      .status(400)
      .json({ error: 'Esta venta tiene una devolución asociada, no se puede anular.' });
  }

  withTransaction(() => {
    db.prepare("UPDATE ventas SET estado = 'anulada' WHERE id = ?").run(ventaId);

    const items = db
      .prepare('SELECT producto_id, cantidad, precio_unitario FROM venta_items WHERE venta_id = ?')
      .all(ventaId);
    const insertMovimiento = db.prepare(
      "INSERT INTO movimientos_stock (producto_id, tipo, cantidad, origen, venta_id, nota) VALUES (?, 'entrada', ?, 'venta', ?, 'Reversión por anulación')"
    );
    let total = 0;
    for (const item of items) {
      insertMovimiento.run(item.producto_id, item.cantidad, ventaId);
      total += item.cantidad * item.precio_unitario;
    }

    db.prepare(
      "INSERT INTO movimientos_cc_clientes (cliente_id, tipo, importe, venta_id) VALUES (?, 'ajuste', ?, ?)"
    ).run(venta.cliente_id, -total, ventaId);
  });

  res.json({ id: ventaId, estado: 'anulada' });
});

// Restaurar desde la papelera: vuelve a aplicar el efecto completo de la
// venta, o sea descuenta el stock otra vez y regenera la deuda del cliente.
// Puede fallar si en el medio se vendió el stock que había vuelto.
app.post('/api/ventas/:id/restaurar', (req, res) => {
  const ventaId = Number(req.params.id);

  const venta = db.prepare('SELECT id, cliente_id, estado FROM ventas WHERE id = ?').get(ventaId);
  if (!venta) {
    return res.status(404).json({ error: 'Venta no encontrada.' });
  }
  if (venta.estado !== 'anulada') {
    return res.status(400).json({ error: 'Esta venta no está en la papelera.' });
  }

  const items = db
    .prepare(
      `SELECT venta_items.producto_id, venta_items.cantidad, venta_items.precio_unitario, productos.nombre
         FROM venta_items JOIN productos ON productos.id = venta_items.producto_id
        WHERE venta_id = ?`
    )
    .all(ventaId);

  const buscarStockActual = db.prepare('SELECT cantidad FROM stock_actual WHERE producto_id = ?');
  for (const item of items) {
    const stockActual = buscarStockActual.get(item.producto_id)?.cantidad ?? 0;
    if (stockActual - item.cantidad < 0) {
      return res.status(400).json({
        error: `No hay stock suficiente de "${item.nombre}" para restaurar esta venta.`
      });
    }
  }

  withTransaction(() => {
    db.prepare("UPDATE ventas SET estado = 'activa' WHERE id = ?").run(ventaId);

    const insertMovimiento = db.prepare(
      "INSERT INTO movimientos_stock (producto_id, tipo, cantidad, origen, venta_id, nota) VALUES (?, 'salida', ?, 'venta', ?, 'Restaurada desde la papelera')"
    );
    let total = 0;
    for (const item of items) {
      insertMovimiento.run(item.producto_id, item.cantidad, ventaId);
      total += item.cantidad * item.precio_unitario;
    }

    db.prepare(
      "INSERT INTO movimientos_cc_clientes (cliente_id, tipo, importe, venta_id) VALUES (?, 'ajuste', ?, ?)"
    ).run(venta.cliente_id, total, ventaId);
  });

  res.json({ id: ventaId, estado: 'activa' });
});

/* ---------- Presupuestos ---------- */

// Un presupuesto es una oferta: no toca stock, ni cuenta corriente, ni
// resultado (CLAUDE.md §15). Todo eso pasa recién al convertirlo en venta.

const SELECT_PRESUPUESTO = `
  SELECT presupuestos.id, presupuestos.cliente_id, clientes.nombre AS cliente,
         presupuestos.fecha, presupuestos.vencimiento, presupuestos.estado,
         presupuestos.venta_id, presupuestos.notas,
         (SELECT COALESCE(SUM(cantidad * precio_unitario), 0)
            FROM presupuesto_items WHERE presupuesto_items.presupuesto_id = presupuestos.id) AS total,
         (SELECT GROUP_CONCAT(
                   (CASE WHEN presupuesto_items.cantidad = CAST(presupuesto_items.cantidad AS INTEGER)
                         THEN CAST(presupuesto_items.cantidad AS INTEGER)
                         ELSE presupuesto_items.cantidad END) || ' × ' || productos.nombre, ', ')
            FROM presupuesto_items JOIN productos ON productos.id = presupuesto_items.producto_id
           WHERE presupuesto_items.presupuesto_id = presupuestos.id) AS items_resumen
    FROM presupuestos
    JOIN clientes ON clientes.id = presupuestos.cliente_id`;

// "Vencido" no se guarda: se calcula. Solo aplica a un presupuesto que
// sigue esperando respuesta — uno aceptado o rechazado ya tuvo la suya, y
// uno convertido ya es una venta, así que la fecha deja de importar.
function estadoEfectivoPresupuesto(presupuesto, hoy) {
  if (
    presupuesto.estado === 'enviado' &&
    presupuesto.vencimiento &&
    presupuesto.vencimiento < hoy
  ) {
    return 'vencido';
  }
  return presupuesto.estado;
}

const fechaDeHoy = () => new Date().toLocaleDateString('sv-SE');

function decorarPresupuesto(p, hoy) {
  return { ...p, estado_efectivo: estadoEfectivoPresupuesto(p, hoy) };
}

app.get('/api/presupuestos', (req, res) => {
  const hoy = fechaDeHoy();
  const presupuestos = db
    .prepare(`${SELECT_PRESUPUESTO} ORDER BY presupuestos.fecha DESC, presupuestos.id DESC`)
    .all();
  res.json(presupuestos.map((p) => decorarPresupuesto(p, hoy)));
});

app.get('/api/presupuestos/:id', (req, res) => {
  const presupuestoId = Number(req.params.id);
  const presupuesto = db
    .prepare(`${SELECT_PRESUPUESTO} WHERE presupuestos.id = ?`)
    .get(presupuestoId);
  if (!presupuesto) {
    return res.status(404).json({ error: 'Presupuesto no encontrado.' });
  }

  const items = db
    .prepare(
      `SELECT presupuesto_items.id, presupuesto_items.producto_id, productos.nombre AS producto,
              presupuesto_items.cantidad, presupuesto_items.precio_unitario
         FROM presupuesto_items JOIN productos ON productos.id = presupuesto_items.producto_id
        WHERE presupuesto_id = ?
        ORDER BY presupuesto_items.id`
    )
    .all(presupuestoId);

  res.json({
    ...decorarPresupuesto(presupuesto, fechaDeHoy()),
    items: items.map((i) => ({ ...i, subtotal: i.cantidad * i.precio_unitario }))
  });
});

// Valida el cuerpo de un presupuesto. A diferencia de una venta, NO valida
// stock: se puede cotizar algo que todavía no está en el depósito.
function validarPresupuesto(body) {
  const { items } = body;
  if (!Array.isArray(items) || items.length === 0) {
    return 'El presupuesto necesita al menos un item.';
  }
  for (const item of items) {
    if (!Number(item.producto_id)) {
      return 'Todos los items necesitan un producto.';
    }
    if (!(Number(item.cantidad) > 0)) {
      return 'La cantidad de cada item debe ser mayor a 0.';
    }
    if (!(Number(item.precio_unitario) >= 0)) {
      return 'El precio unitario no puede ser negativo.';
    }
  }
  return null;
}

function guardarItemsPresupuesto(presupuestoId, items) {
  const insertItem = db.prepare(
    `INSERT INTO presupuesto_items (presupuesto_id, producto_id, cantidad, precio_unitario)
     VALUES (?, ?, ?, ?)`
  );
  for (const item of items) {
    insertItem.run(
      presupuestoId,
      Number(item.producto_id),
      Number(item.cantidad),
      Number(item.precio_unitario)
    );
  }
}

// Resuelve el cliente igual que la venta: si el frontend ya sabe cuál es
// se usa su id (evita duplicados por diferencias de tipeo), si no se busca
// por nombre y se crea si no existe.
function resolverCliente(cliente, cliente_id) {
  let clienteRow = cliente_id
    ? db.prepare('SELECT id FROM clientes WHERE id = ?').get(cliente_id)
    : db.prepare('SELECT id FROM clientes WHERE nombre = ?').get(cliente);
  if (!clienteRow) {
    const { lastInsertRowid } = db.prepare('INSERT INTO clientes (nombre) VALUES (?)').run(cliente);
    clienteRow = { id: lastInsertRowid };
  }
  return clienteRow;
}

app.post('/api/presupuestos', (req, res) => {
  const { cliente, cliente_id, items, fecha, vencimiento, notas } = req.body;

  const error = validarPresupuesto(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const presupuestoId = withTransaction(() => {
    const clienteRow = resolverCliente(cliente, cliente_id);

    const columnas = ['cliente_id', 'vencimiento', 'notas'];
    const valores = [clienteRow.id, vencimiento || null, notas?.trim() || null];
    if (fecha) {
      columnas.push('fecha');
      valores.push(fecha);
    }
    const { lastInsertRowid: nuevoId } = db
      .prepare(
        `INSERT INTO presupuestos (${columnas.join(', ')}) VALUES (${columnas
          .map(() => '?')
          .join(', ')})`
      )
      .run(...valores);

    guardarItemsPresupuesto(nuevoId, items);
    return nuevoId;
  });

  res.status(201).json({ id: presupuestoId });
});

// Editar. Se rechaza si ya se convirtió: a partir de ahí la venta es la
// que manda, y el presupuesto queda como registro de lo que se ofreció.
app.put('/api/presupuestos/:id', (req, res) => {
  const presupuestoId = Number(req.params.id);
  const { cliente, cliente_id, items, fecha, vencimiento, notas } = req.body;

  const presupuesto = db
    .prepare('SELECT id, estado FROM presupuestos WHERE id = ?')
    .get(presupuestoId);
  if (!presupuesto) {
    return res.status(404).json({ error: 'Presupuesto no encontrado.' });
  }
  if (presupuesto.estado === 'convertido') {
    return res
      .status(400)
      .json({ error: 'Este presupuesto ya se convirtió en venta, no se puede editar.' });
  }

  const error = validarPresupuesto(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  withTransaction(() => {
    const clienteRow = resolverCliente(cliente, cliente_id);

    db.prepare(
      `UPDATE presupuestos
          SET cliente_id = ?, vencimiento = ?, notas = ?, fecha = COALESCE(?, fecha)
        WHERE id = ?`
    ).run(clienteRow.id, vencimiento || null, notas?.trim() || null, fecha || null, presupuestoId);

    // Un presupuesto no tiene efectos que revertir (no movió stock ni
    // cuenta corriente), así que sus items se reemplazan directamente —
    // no hace falta el revertir-y-reaplicar de ventas y compras.
    db.prepare('DELETE FROM presupuesto_items WHERE presupuesto_id = ?').run(presupuestoId);
    guardarItemsPresupuesto(presupuestoId, items);
  });

  res.json({ id: presupuestoId });
});

const ESTADOS_PRESUPUESTO_MANUALES = ['borrador', 'enviado', 'aceptado', 'rechazado'];

app.patch('/api/presupuestos/:id/estado', (req, res) => {
  const presupuestoId = Number(req.params.id);
  const { estado } = req.body;

  const presupuesto = db
    .prepare('SELECT id, estado FROM presupuestos WHERE id = ?')
    .get(presupuestoId);
  if (!presupuesto) {
    return res.status(404).json({ error: 'Presupuesto no encontrado.' });
  }
  if (presupuesto.estado === 'convertido') {
    return res.status(400).json({ error: 'Este presupuesto ya se convirtió en venta.' });
  }
  // 'convertido' no se puede poner a mano: lo pone solo la conversión, que
  // es la única que además crea la venta. Si se pudiera setear por acá,
  // quedaría un presupuesto marcado como convertido sin venta detrás.
  if (!ESTADOS_PRESUPUESTO_MANUALES.includes(estado)) {
    return res.status(400).json({ error: 'El estado no es válido.' });
  }

  db.prepare('UPDATE presupuestos SET estado = ? WHERE id = ?').run(estado, presupuestoId);
  res.json({ id: presupuestoId, estado });
});

// Convertir en venta. Acá sí se valida stock y se congela el costo: es el
// momento en que la mercadería realmente sale. El precio, en cambio, es el
// que se cotizó — es lo que se le prometió al cliente.
app.post('/api/presupuestos/:id/convertir', (req, res) => {
  const presupuestoId = Number(req.params.id);

  const presupuesto = db
    .prepare('SELECT id, cliente_id, estado FROM presupuestos WHERE id = ?')
    .get(presupuestoId);
  if (!presupuesto) {
    return res.status(404).json({ error: 'Presupuesto no encontrado.' });
  }
  if (presupuesto.estado === 'convertido') {
    return res.status(400).json({ error: 'Este presupuesto ya se convirtió en venta.' });
  }
  if (presupuesto.estado === 'rechazado') {
    return res
      .status(400)
      .json({ error: 'Este presupuesto está rechazado. Reabrilo antes de convertirlo.' });
  }

  const items = db
    .prepare(
      'SELECT producto_id, cantidad, precio_unitario FROM presupuesto_items WHERE presupuesto_id = ?'
    )
    .all(presupuestoId);
  if (items.length === 0) {
    return res.status(400).json({ error: 'El presupuesto no tiene items para convertir.' });
  }

  const errorStock = validarStockDisponible(items);
  if (errorStock) {
    return res.status(400).json({ error: errorStock });
  }

  // La venta y la marca del presupuesto van en la misma transacción: si
  // algo falla, no queda una venta creada con el presupuesto sin convertir.
  const ventaId = withTransaction(() => {
    const nuevaVentaId = crearVenta({
      cliente_id: presupuesto.cliente_id,
      items,
      fecha: null
    });
    db.prepare("UPDATE presupuestos SET estado = 'convertido', venta_id = ? WHERE id = ?").run(
      nuevaVentaId,
      presupuestoId
    );
    return nuevaVentaId;
  });

  res.status(201).json({ id: presupuestoId, venta_id: ventaId });
});


/* ---------- Devoluciones ---------- */

// Una devolución revierte parte (o todo) de una venta ya confirmada
// (CLAUDE.md §17). A diferencia de anular, es parcial por renglón y puede
// convivir con cobros y con una factura ya emitida.

const SELECT_DEVOLUCION = `
  SELECT devoluciones.id, devoluciones.venta_id, devoluciones.fecha, devoluciones.estado,
         devoluciones.motivo, devoluciones.cuenta_tesoreria_id,
         cuentas_tesoreria.nombre AS cuenta,
         ventas.cliente_id, clientes.nombre AS cliente,
         (SELECT COALESCE(SUM(cantidad * precio_unitario), 0)
            FROM devolucion_items WHERE devolucion_items.devolucion_id = devoluciones.id) AS total,
         (SELECT GROUP_CONCAT(
                   (CASE WHEN devolucion_items.cantidad = CAST(devolucion_items.cantidad AS INTEGER)
                         THEN CAST(devolucion_items.cantidad AS INTEGER)
                         ELSE devolucion_items.cantidad END) || ' × ' || productos.nombre, ', ')
            FROM devolucion_items JOIN productos ON productos.id = devolucion_items.producto_id
           WHERE devolucion_items.devolucion_id = devoluciones.id) AS items_resumen,
         EXISTS (SELECT 1 FROM facturas WHERE facturas.devolucion_id = devoluciones.id) AS tiene_nota_credito
    FROM devoluciones
    JOIN ventas ON ventas.id = devoluciones.venta_id
    JOIN clientes ON clientes.id = ventas.cliente_id
    LEFT JOIN cuentas_tesoreria ON cuentas_tesoreria.id = devoluciones.cuenta_tesoreria_id`;

function decorarDevolucion(d) {
  return {
    ...d,
    tiene_nota_credito: Boolean(d.tiene_nota_credito),
    reintegrada: d.cuenta_tesoreria_id != null
  };
}

app.get('/api/devoluciones', (req, res) => {
  const devoluciones = db
    .prepare(`${SELECT_DEVOLUCION} ORDER BY devoluciones.id DESC`)
    .all();
  res.json(devoluciones.map(decorarDevolucion));
});

app.get('/api/devoluciones/:id', (req, res) => {
  const devolucionId = Number(req.params.id);
  const devolucion = db.prepare(`${SELECT_DEVOLUCION} WHERE devoluciones.id = ?`).get(devolucionId);
  if (!devolucion) {
    return res.status(404).json({ error: 'Devolución no encontrada.' });
  }

  const items = db
    .prepare(
      `SELECT devolucion_items.id, devolucion_items.venta_item_id, devolucion_items.producto_id,
              productos.nombre AS producto, devolucion_items.cantidad, devolucion_items.precio_unitario,
              devolucion_items.vuelve_stock
         FROM devolucion_items JOIN productos ON productos.id = devolucion_items.producto_id
        WHERE devolucion_id = ?
        ORDER BY devolucion_items.id`
    )
    .all(devolucionId);

  res.json({
    ...decorarDevolucion(devolucion),
    items: items.map((i) => ({
      ...i,
      subtotal: i.cantidad * i.precio_unitario,
      vuelve_stock: Boolean(i.vuelve_stock)
    }))
  });
});

// Cuánto queda disponible para devolver de cada renglón de una venta: lo
// vendido menos lo ya devuelto por devoluciones activas. venta_item_id (no
// producto_id) es la clave, para que el tope sea correcto aunque el mismo
// producto aparezca en más de un renglón de la venta.
function itemsDevolviblesDeVenta(ventaId) {
  return db
    .prepare(
      `SELECT venta_items.id AS venta_item_id, venta_items.producto_id, productos.nombre,
              venta_items.precio_unitario, venta_items.costo_unitario_historico,
              venta_items.cantidad - COALESCE((
                SELECT SUM(devolucion_items.cantidad)
                  FROM devolucion_items JOIN devoluciones ON devoluciones.id = devolucion_items.devolucion_id
                 WHERE devolucion_items.venta_item_id = venta_items.id AND devoluciones.estado = 'activa'
              ), 0) AS disponible
         FROM venta_items JOIN productos ON productos.id = venta_items.producto_id
        WHERE venta_items.venta_id = ?`
    )
    .all(ventaId);
}

// Aplica los efectos de una devolución ya cargada: entrada de stock (solo
// en los renglones marcados vuelve_stock), crédito en la cuenta corriente
// del cliente, y egreso de caja si se marcó devolver la plata. Asume que
// se la llama DENTRO de una transacción — la usan tanto el alta como
// restaurar desde la papelera (mismo criterio que crearVenta).
function aplicarDevolucion(devolucionId) {
  const devolucion = db
    .prepare(
      `SELECT devoluciones.venta_id, devoluciones.cuenta_tesoreria_id, ventas.cliente_id
         FROM devoluciones JOIN ventas ON ventas.id = devoluciones.venta_id
        WHERE devoluciones.id = ?`
    )
    .get(devolucionId);

  const items = db
    .prepare(
      'SELECT producto_id, cantidad, precio_unitario, vuelve_stock FROM devolucion_items WHERE devolucion_id = ?'
    )
    .all(devolucionId);

  const insertEntrada = db.prepare(
    "INSERT INTO movimientos_stock (producto_id, tipo, cantidad, origen, devolucion_id, nota) VALUES (?, 'entrada', ?, 'devolucion', ?, 'Devolución de venta')"
  );

  let total = 0;
  for (const item of items) {
    if (item.vuelve_stock) {
      insertEntrada.run(item.producto_id, item.cantidad, devolucionId);
    }
    total += item.cantidad * item.precio_unitario;
  }

  // Crédito a favor del cliente: baja la deuda, igual signo que un cobro.
  db.prepare(
    "INSERT INTO movimientos_cc_clientes (cliente_id, tipo, importe, venta_id) VALUES (?, 'ajuste', ?, ?)"
  ).run(devolucion.cliente_id, -total, devolucion.venta_id);

  if (devolucion.cuenta_tesoreria_id) {
    // Reintegrar en efectivo salda al instante el crédito que se acaba de
    // generar arriba: sin este segundo ajuste (+total, que cancela el
    // -total de arriba) quedaría un saldo a favor fantasma en la cuenta
    // corriente del cliente ADEMÁS de la plata que ya salió de la caja.
    db.prepare(
      "INSERT INTO movimientos_cc_clientes (cliente_id, tipo, importe, venta_id) VALUES (?, 'ajuste', ?, ?)"
    ).run(devolucion.cliente_id, total, devolucion.venta_id);

    db.prepare(
      "INSERT INTO movimientos_tesoreria (cuenta_tesoreria_id, tipo, importe, origen, devolucion_id) VALUES (?, 'egreso', ?, 'devolucion', ?)"
    ).run(devolucion.cuenta_tesoreria_id, total, devolucionId);
  }
}

// El espejo exacto de aplicarDevolucion: lo usa anular. No se borran los
// movimientos originales (se conserva la auditoría), se insertan los de
// reversión — mismo criterio que anular una venta o una compra.
function revertirDevolucion(devolucionId) {
  const devolucion = db
    .prepare(
      `SELECT devoluciones.venta_id, devoluciones.cuenta_tesoreria_id, ventas.cliente_id
         FROM devoluciones JOIN ventas ON ventas.id = devoluciones.venta_id
        WHERE devoluciones.id = ?`
    )
    .get(devolucionId);

  const items = db
    .prepare(
      'SELECT producto_id, cantidad, precio_unitario, vuelve_stock FROM devolucion_items WHERE devolucion_id = ?'
    )
    .all(devolucionId);

  const insertSalida = db.prepare(
    "INSERT INTO movimientos_stock (producto_id, tipo, cantidad, origen, devolucion_id, nota) VALUES (?, 'salida', ?, 'devolucion', ?, 'Reversión por anulación')"
  );

  let total = 0;
  for (const item of items) {
    if (item.vuelve_stock) {
      insertSalida.run(item.producto_id, item.cantidad, devolucionId);
    }
    total += item.cantidad * item.precio_unitario;
  }

  // Vuelve a subir la deuda del cliente (se había bajado al aplicar).
  db.prepare(
    "INSERT INTO movimientos_cc_clientes (cliente_id, tipo, importe, venta_id) VALUES (?, 'ajuste', ?, ?)"
  ).run(devolucion.cliente_id, total, devolucion.venta_id);

  if (devolucion.cuenta_tesoreria_id) {
    // Espejo del ajuste de reintegro en aplicarDevolucion: vuelve a bajar
    // la cuenta corriente para deshacer la reconciliación de arriba.
    db.prepare(
      "INSERT INTO movimientos_cc_clientes (cliente_id, tipo, importe, venta_id) VALUES (?, 'ajuste', ?, ?)"
    ).run(devolucion.cliente_id, -total, devolucion.venta_id);

    db.prepare(
      "INSERT INTO movimientos_tesoreria (cuenta_tesoreria_id, tipo, importe, origen, devolucion_id) VALUES (?, 'ingreso', ?, 'devolucion', ?)"
    ).run(devolucion.cuenta_tesoreria_id, total, devolucionId);
  }
}

app.post('/api/devoluciones', (req, res) => {
  const { venta_id, items, motivo, cuenta_tesoreria_id } = req.body;
  const ventaId = Number(venta_id);

  const venta = db.prepare('SELECT id, estado FROM ventas WHERE id = ?').get(ventaId);
  if (!venta) {
    return res.status(404).json({ error: 'Venta no encontrada.' });
  }
  if (venta.estado === 'anulada') {
    return res
      .status(400)
      .json({ error: 'Esta venta está anulada, no se le puede registrar una devolución.' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'La devolución necesita al menos un item.' });
  }

  const vistos = new Set();
  for (const item of items) {
    const id = Number(item.venta_item_id);
    if (vistos.has(id)) {
      return res.status(400).json({ error: 'No se puede repetir el mismo item de la venta.' });
    }
    vistos.add(id);
    if (!(Number(item.cantidad) > 0)) {
      return res.status(400).json({ error: 'La cantidad a devolver debe ser mayor a 0.' });
    }
  }

  if (cuenta_tesoreria_id) {
    const cuenta = db.prepare('SELECT 1 FROM cuentas_tesoreria WHERE id = ?').get(cuenta_tesoreria_id);
    if (!cuenta) {
      return res.status(400).json({ error: 'La cuenta de tesorería no existe.' });
    }
  }

  const disponibles = new Map(
    itemsDevolviblesDeVenta(ventaId).map((r) => [r.venta_item_id, r])
  );
  for (const item of items) {
    const renglon = disponibles.get(Number(item.venta_item_id));
    if (!renglon) {
      return res.status(400).json({ error: 'Uno de los items no pertenece a esta venta.' });
    }
    if (Number(item.cantidad) > renglon.disponible) {
      return res.status(400).json({
        error: `No se puede devolver más de lo vendido de "${renglon.nombre}" (disponible: ${renglon.disponible}).`
      });
    }
  }

  const devolucionId = withTransaction(() => {
    const { lastInsertRowid: nuevaId } = db
      .prepare('INSERT INTO devoluciones (venta_id, cuenta_tesoreria_id, motivo) VALUES (?, ?, ?)')
      .run(ventaId, cuenta_tesoreria_id || null, motivo?.trim() || null);

    const insertItem = db.prepare(
      `INSERT INTO devolucion_items
              (devolucion_id, venta_item_id, producto_id, cantidad, precio_unitario, costo_unitario_historico, vuelve_stock)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const item of items) {
      const renglon = disponibles.get(Number(item.venta_item_id));
      const vuelveStock = item.vuelve_stock === false || item.vuelve_stock === 0 ? 0 : 1;
      insertItem.run(
        nuevaId,
        renglon.venta_item_id,
        renglon.producto_id,
        Number(item.cantidad),
        renglon.precio_unitario,
        renglon.costo_unitario_historico,
        vuelveStock
      );
    }

    aplicarDevolucion(nuevaId);
    return nuevaId;
  });

  res.status(201).json({ id: devolucionId });
});

// Nota de crédito: comprobante fiscal aparte, opcional — igual que
// "Facturar" en una venta (CLAUDE.md §16). Arranca su propia numeración
// (tipo 'nota_credito'), independiente de la de las facturas.
app.post('/api/devoluciones/:id/nota-credito', (req, res) => {
  const devolucionId = Number(req.params.id);
  const { condicion, letra, punto_venta } = req.body;
  const letraFinal = letra || 'B';
  const puntoVentaFinal = Number(punto_venta) || 1;

  const devolucion = db
    .prepare(
      `SELECT devoluciones.id, devoluciones.estado, ventas.cliente_id
         FROM devoluciones JOIN ventas ON ventas.id = devoluciones.venta_id
        WHERE devoluciones.id = ?`
    )
    .get(devolucionId);
  if (!devolucion) {
    return res.status(404).json({ error: 'Devolución no encontrada.' });
  }
  if (devolucion.estado === 'anulada') {
    return res.status(400).json({ error: 'Esta devolución está anulada.' });
  }

  const yaTiene = db.prepare('SELECT 1 FROM facturas WHERE devolucion_id = ?').get(devolucionId);
  if (yaTiene) {
    return res.status(409).json({ error: 'Esta devolución ya tiene una nota de crédito asociada.' });
  }

  const { total } = db
    .prepare('SELECT COALESCE(SUM(cantidad * precio_unitario), 0) AS total FROM devolucion_items WHERE devolucion_id = ?')
    .get(devolucionId);

  let facturaId;
  try {
    facturaId = withTransaction(() => {
      const numero = siguienteNumero(puntoVentaFinal, 'nota_credito', letraFinal);
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO facturas (cliente_id, concepto, neto, condicion, estado, devolucion_id, tipo, letra, punto_venta, numero)
           VALUES (?, ?, ?, ?, 'cobrado', ?, 'nota_credito', ?, ?, ?)`
        )
        .run(devolucion.cliente_id, `Devolución #${devolucionId}`, total, condicion || 'efectivo', devolucionId, letraFinal, puntoVentaFinal, numero);
      return lastInsertRowid;
    });
  } catch (err) {
    if (String(err.message).includes('idx_facturas_devolucion_id')) {
      return res.status(409).json({ error: 'Esta devolución ya tiene una nota de crédito asociada.' });
    }
    if (String(err.message).includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'No se pudo asignar el número de comprobante, probá de nuevo.' });
    }
    throw err;
  }

  res.status(201).json({ id: facturaId });
});

app.post('/api/devoluciones/:id/anular', (req, res) => {
  const devolucionId = Number(req.params.id);

  const devolucion = db.prepare('SELECT id, estado FROM devoluciones WHERE id = ?').get(devolucionId);
  if (!devolucion) {
    return res.status(404).json({ error: 'Devolución no encontrada.' });
  }
  if (devolucion.estado === 'anulada') {
    return res.status(400).json({ error: 'Esta devolución ya está anulada.' });
  }

  const tieneNotaCredito = db.prepare('SELECT 1 FROM facturas WHERE devolucion_id = ?').get(devolucionId);
  if (tieneNotaCredito) {
    return res
      .status(400)
      .json({ error: 'Esta devolución tiene una nota de crédito asociada, no se puede anular.' });
  }

  withTransaction(() => {
    revertirDevolucion(devolucionId);
    db.prepare("UPDATE devoluciones SET estado = 'anulada' WHERE id = ?").run(devolucionId);
  });

  res.json({ id: devolucionId, estado: 'anulada' });
});

// Restaurar desde la papelera: vuelve a aplicar el efecto completo (stock,
// cuenta corriente y, si correspondía, el egreso de caja). Puede fallar si
// en el medio se volvió a vender el stock que había entrado por acá —
// mismo cuidado que restaurar una venta.
app.post('/api/devoluciones/:id/restaurar', (req, res) => {
  const devolucionId = Number(req.params.id);

  const devolucion = db.prepare('SELECT id, estado FROM devoluciones WHERE id = ?').get(devolucionId);
  if (!devolucion) {
    return res.status(404).json({ error: 'Devolución no encontrada.' });
  }
  if (devolucion.estado !== 'anulada') {
    return res.status(400).json({ error: 'Esta devolución no está en la papelera.' });
  }

  const items = db
    .prepare(
      `SELECT devolucion_items.producto_id, devolucion_items.cantidad, devolucion_items.vuelve_stock,
              productos.nombre
         FROM devolucion_items JOIN productos ON productos.id = devolucion_items.producto_id
        WHERE devolucion_id = ?`
    )
    .all(devolucionId);

  const buscarStockActual = db.prepare('SELECT cantidad FROM stock_actual WHERE producto_id = ?');
  for (const item of items) {
    if (!item.vuelve_stock) continue;
    const stockActual = buscarStockActual.get(item.producto_id)?.cantidad ?? 0;
    if (stockActual - item.cantidad < 0) {
      return res.status(400).json({
        error: `No hay stock suficiente de "${item.nombre}" para restaurar esta devolución.`
      });
    }
  }

  withTransaction(() => {
    db.prepare("UPDATE devoluciones SET estado = 'activa' WHERE id = ?").run(devolucionId);
    aplicarDevolucion(devolucionId);
  });

  res.json({ id: devolucionId, estado: 'activa' });
});


/* ---------- Compras ---------- */

const ESTADOS_ENVIO = ['pedido', 'en_camino', 'recibido'];

// devuelto: plata acreditada por devoluciones a proveedor activas de esta
// compra (ver sección Devoluciones a proveedor más abajo). neto = total -
// devuelto: es lo que realmente se le sigue debiendo al proveedor — el
// estado_pago (y el saldo pendiente para pagar) compara contra neto, no
// contra el total bruto. Mismo criterio que SUBQUERY_DEVUELTO_VENTA.
const SUBQUERY_DEVUELTO_COMPRA = `
  (SELECT COALESCE(SUM(devolucion_proveedor_items.cantidad * devolucion_proveedor_items.precio_unitario), 0)
     FROM devolucion_proveedor_items
     JOIN devoluciones_proveedor ON devoluciones_proveedor.id = devolucion_proveedor_items.devolucion_proveedor_id
     JOIN compra_items ON compra_items.id = devolucion_proveedor_items.compra_item_id
    WHERE compra_items.compra_id = compras.id AND devoluciones_proveedor.estado = 'activa')`;

// El total de una compra incluye el envío: es plata que se le debe al
// proveedor igual que la mercadería (CLAUDE.md §6 lo lista como "costos
// adicionales" dentro de la cabecera de la compra).
app.get('/api/compras', (req, res) => {
  const compras = db
    .prepare(
      `SELECT compras.id, compras.proveedor_id, proveedores.nombre AS proveedor, compras.fecha,
              compras.estado, compras.estado_envio, compras.costo_envio, compras.stock_aplicado,
              (SELECT COALESCE(SUM(cantidad * precio_unitario), 0)
                 FROM compra_items WHERE compra_items.compra_id = compras.id) AS subtotal,
              (SELECT COALESCE(SUM(importe), 0)
                 FROM pagos WHERE pagos.compra_id = compras.id) AS pagado,
              ${SUBQUERY_DEVUELTO_COMPRA} AS devuelto,
              EXISTS (SELECT 1 FROM devoluciones_proveedor
                       WHERE devoluciones_proveedor.compra_id = compras.id AND devoluciones_proveedor.estado = 'activa') AS tiene_devolucion
       FROM compras
       JOIN proveedores ON proveedores.id = compras.proveedor_id
       ORDER BY compras.id DESC`
    )
    .all();
  res.json(
    compras.map((c) => {
      const total = c.subtotal + c.costo_envio;
      const neto = total - c.devuelto;
      return {
        ...c,
        total,
        neto,
        tiene_devolucion: Boolean(c.tiene_devolucion),
        estado_pago: c.pagado <= 0 ? 'pendiente' : c.pagado >= neto ? 'pagado' : 'parcial'
      };
    })
  );
});

app.get('/api/compras/:id', (req, res) => {
  const compraId = Number(req.params.id);
  const compra = db
    .prepare(
      `SELECT compras.id, compras.proveedor_id, proveedores.nombre AS proveedor, compras.fecha,
              compras.estado, compras.estado_envio, compras.costo_envio, compras.stock_aplicado,
              EXISTS (SELECT 1 FROM devoluciones_proveedor
                       WHERE devoluciones_proveedor.compra_id = compras.id AND devoluciones_proveedor.estado = 'activa') AS tiene_devolucion
         FROM compras JOIN proveedores ON proveedores.id = compras.proveedor_id
        WHERE compras.id = ?`
    )
    .get(compraId);
  if (!compra) {
    return res.status(404).json({ error: 'Compra no encontrada.' });
  }

  // cantidad_devuelta: cuánto de este renglón ya se devolvió al proveedor
  // (solo cuenta devoluciones activas) — alimenta el modal de devolución
  // para topar la cantidad a devolver a lo que realmente queda.
  const items = db
    .prepare(
      `SELECT compra_items.id, compra_items.producto_id, productos.nombre AS producto,
              compra_items.cantidad, compra_items.precio_unitario, compra_items.costo_real_unitario,
              COALESCE((
                SELECT SUM(devolucion_proveedor_items.cantidad)
                  FROM devolucion_proveedor_items
                  JOIN devoluciones_proveedor ON devoluciones_proveedor.id = devolucion_proveedor_items.devolucion_proveedor_id
                 WHERE devolucion_proveedor_items.compra_item_id = compra_items.id
                   AND devoluciones_proveedor.estado = 'activa'
              ), 0) AS cantidad_devuelta
         FROM compra_items JOIN productos ON productos.id = compra_items.producto_id
        WHERE compra_id = ?
        ORDER BY compra_items.id`
    )
    .all(compraId);

  const subtotal = items.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0);
  const total = subtotal + compra.costo_envio;
  const devuelto = items.reduce((acc, i) => acc + i.cantidad_devuelta * i.precio_unitario, 0);
  const neto = total - devuelto;
  const { pagado } = db
    .prepare('SELECT COALESCE(SUM(importe), 0) AS pagado FROM pagos WHERE compra_id = ?')
    .get(compraId);

  res.json({
    ...compra,
    tiene_devolucion: Boolean(compra.tiene_devolucion),
    items: items.map((i) => ({
      ...i,
      subtotal: i.cantidad * i.precio_unitario,
      disponible_devolucion: i.cantidad - i.cantidad_devuelta
    })),
    subtotal,
    total,
    devuelto,
    neto,
    pagado,
    estado_pago: pagado <= 0 ? 'pendiente' : pagado >= neto ? 'pagado' : 'parcial'
  });
});

// Prorrateo del costo de envío por valor del ítem (CLAUDE.md §7): si el
// producto A vale el 80% de la compra, absorbe el 80% del envío. El caso
// borde de una compra con subtotal 0 (todo a precio cero) se reparte por
// cantidad, para no perder el costo del envío.
function prorratearEnvio(items, costoEnvio) {
  const subtotal = items.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0);
  const cantidadTotal = items.reduce((acc, i) => acc + i.cantidad, 0);

  return items.map((item) => {
    const proporcion =
      subtotal > 0 ? (item.cantidad * item.precio_unitario) / subtotal : item.cantidad / cantidadTotal;
    const envioAsignado = costoEnvio * proporcion;
    return { ...item, costo_real_unitario: item.precio_unitario + envioAsignado / item.cantidad };
  });
}

// Una compra nace como borrador: no toca stock, ni costo, ni deuda. Es
// nada más el papel armado. Los efectos aparecen recién al efectuar el
// pedido (deuda) y al recibir la mercadería (stock y costo).
// Crea la compra en estado 'borrador' con sus items (envío ya prorrateado):
// da de alta proveedor/producto por nombre si no existen. IMPORTANTE: igual
// que crearVenta, asume que ya se validó todo y que se la llama DENTRO de
// una transacción — así el asistente por texto (§21) puede encadenar
// crear+confirmar+recibir en una sola transacción atómica.
function crearCompra({ proveedor, items, costoEnvio, fecha }) {
  let proveedorRow = db.prepare('SELECT id FROM proveedores WHERE nombre = ?').get(proveedor);
  if (!proveedorRow) {
    const { lastInsertRowid } = db.prepare('INSERT INTO proveedores (nombre) VALUES (?)').run(proveedor);
    proveedorRow = { id: lastInsertRowid };
  }

  const columnas = ['proveedor_id', 'costo_envio'];
  const valores = [proveedorRow.id, costoEnvio];
  if (fecha) {
    columnas.push('fecha');
    valores.push(fecha);
  }
  const { lastInsertRowid: nuevaCompraId } = db
    .prepare(`INSERT INTO compras (${columnas.join(', ')}) VALUES (${columnas.map(() => '?').join(', ')})`)
    .run(...valores);

  const buscarProducto = db.prepare('SELECT id FROM productos WHERE nombre = ?');
  // Un producto nuevo nace con costo 0: todavía no entró nada al
  // depósito, su costo lo va a fijar la recepción de esta compra.
  const crearProducto = db.prepare('INSERT INTO productos (nombre, precio_costo, precio_venta) VALUES (?, 0, 0)');
  const insertItem = db.prepare(
    `INSERT INTO compra_items (compra_id, producto_id, cantidad, precio_unitario, costo_real_unitario)
     VALUES (?, ?, ?, ?, ?)`
  );

  const itemsProrrateados = prorratearEnvio(
    items.map((i) => ({
      producto: String(i.producto).trim(),
      cantidad: Number(i.cantidad),
      precio_unitario: Number(i.precio_unitario)
    })),
    costoEnvio
  );

  for (const item of itemsProrrateados) {
    let productoRow = buscarProducto.get(item.producto);
    if (!productoRow) {
      const { lastInsertRowid } = crearProducto.run(item.producto);
      productoRow = { id: lastInsertRowid };
    }
    insertItem.run(nuevaCompraId, productoRow.id, item.cantidad, item.precio_unitario, item.costo_real_unitario);
  }

  return nuevaCompraId;
}

app.post('/api/compras', (req, res) => {
  const { proveedor, items, fecha, costo_envio } = req.body;

  if (!proveedor || !String(proveedor).trim()) {
    return res.status(400).json({ error: 'La compra necesita un proveedor.' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'La compra necesita al menos un item.' });
  }
  for (const item of items) {
    if (!item.producto || !String(item.producto).trim()) {
      return res.status(400).json({ error: 'Todos los items necesitan un producto.' });
    }
    if (!(Number(item.cantidad) > 0)) {
      return res.status(400).json({ error: 'La cantidad de cada item debe ser mayor a 0.' });
    }
    if (!(Number(item.precio_unitario) >= 0)) {
      return res.status(400).json({ error: 'El costo unitario no puede ser negativo.' });
    }
  }
  const costoEnvio = normalizarPrecio(costo_envio);
  if (Number.isNaN(costoEnvio) || costoEnvio < 0) {
    return res.status(400).json({ error: 'El costo de envío debe ser un número mayor o igual a 0.' });
  }

  const compraId = withTransaction(() => crearCompra({ proveedor, items, costoEnvio, fecha }));

  res.status(201).json({ id: compraId, estado: 'borrador' });
});

// Editar una compra existente, en cualquier estado (incluso ya recibida).
// Se resuelve como revertir los efectos actuales (deuda si se había
// efectuado, stock+costo si se había recibido) y volver a aplicarlos con
// los datos nuevos, dentro de la misma transacción — el mismo patrón que
// ya usan anular/restaurar. El costo se recalcula con
// recalcularCostoProducto (no con la resta incremental) porque un
// promedio ponderado no se puede "restar" de forma exacta.
app.put('/api/compras/:id', (req, res) => {
  const compraId = Number(req.params.id);
  const { proveedor, items, fecha, costo_envio } = req.body;

  const compra = db
    .prepare('SELECT id, proveedor_id, estado, costo_envio, stock_aplicado FROM compras WHERE id = ?')
    .get(compraId);
  if (!compra) {
    return res.status(404).json({ error: 'Compra no encontrada.' });
  }
  if (compra.estado === 'anulada') {
    return res
      .status(400)
      .json({ error: 'Esta compra está anulada. Restaurala primero si querés editarla.' });
  }
  // Editar reemplaza compra_items enteros (ver más abajo), y
  // devolucion_proveedor_items.compra_item_id apunta a esas filas exactas:
  // si se permitiera editar, las devoluciones ya cargadas quedarían
  // apuntando a renglones que ya no existen. Mismo criterio que ventas.
  const tieneDevolucionEdicion = db
    .prepare("SELECT 1 FROM devoluciones_proveedor WHERE compra_id = ? AND estado = 'activa'")
    .get(compraId);
  if (tieneDevolucionEdicion) {
    return res
      .status(400)
      .json({ error: 'Esta compra tiene una devolución a proveedor asociada, no se puede editar.' });
  }

  if (!proveedor || !String(proveedor).trim()) {
    return res.status(400).json({ error: 'La compra necesita un proveedor.' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'La compra necesita al menos un item.' });
  }
  for (const item of items) {
    if (!item.producto || !String(item.producto).trim()) {
      return res.status(400).json({ error: 'Todos los items necesitan un producto.' });
    }
    if (!(Number(item.cantidad) > 0)) {
      return res.status(400).json({ error: 'La cantidad de cada item debe ser mayor a 0.' });
    }
    if (!(Number(item.precio_unitario) >= 0)) {
      return res.status(400).json({ error: 'El costo unitario no puede ser negativo.' });
    }
  }
  const costoEnvio = normalizarPrecio(costo_envio);
  if (Number.isNaN(costoEnvio) || costoEnvio < 0) {
    return res.status(400).json({ error: 'El costo de envío debe ser un número mayor o igual a 0.' });
  }

  const itemsViejos = db
    .prepare(
      `SELECT compra_items.producto_id, compra_items.cantidad, productos.nombre
         FROM compra_items JOIN productos ON productos.id = compra_items.producto_id
        WHERE compra_id = ?`
    )
    .all(compraId);

  // Si esta compra ya sumó stock, hay que poder sacarlo antes de aplicar
  // los items nuevos — mismo chequeo que ya usa anular.
  if (compra.stock_aplicado) {
    const buscarStockActual = db.prepare('SELECT cantidad FROM stock_actual WHERE producto_id = ?');
    for (const item of itemsViejos) {
      const stockActual = buscarStockActual.get(item.producto_id)?.cantidad ?? 0;
      if (stockActual - item.cantidad < 0) {
        return res.status(400).json({
          error: `"${item.nombre}" ya se vendió parcial o totalmente, no se puede editar esta compra.`
        });
      }
    }
  }

  const itemsProrrateados = prorratearEnvio(
    items.map((i) => ({
      producto: String(i.producto).trim(),
      cantidad: Number(i.cantidad),
      precio_unitario: Number(i.precio_unitario)
    })),
    costoEnvio
  );

  withTransaction(() => {
    // 1) Revertir los efectos actuales.
    if (compra.stock_aplicado) {
      const insertSalida = db.prepare(
        "INSERT INTO movimientos_stock (producto_id, tipo, cantidad, origen, compra_id, nota) VALUES (?, 'salida', ?, 'compra', ?, 'Reversión por edición')"
      );
      for (const item of itemsViejos) {
        insertSalida.run(item.producto_id, item.cantidad, compraId);
      }
    }
    if (compra.estado === 'activa') {
      const { subtotal: subtotalViejo } = db
        .prepare(
          'SELECT COALESCE(SUM(cantidad * precio_unitario), 0) AS subtotal FROM compra_items WHERE compra_id = ?'
        )
        .get(compraId);
      db.prepare(
        "INSERT INTO movimientos_cc_proveedores (proveedor_id, tipo, importe, compra_id) VALUES (?, 'ajuste', ?, ?)"
      ).run(compra.proveedor_id, -(subtotalViejo + compra.costo_envio), compraId);
    }

    // 2) Reemplazar proveedor, fecha, envío e items.
    let proveedorRow = db.prepare('SELECT id FROM proveedores WHERE nombre = ?').get(proveedor);
    if (!proveedorRow) {
      const { lastInsertRowid } = db
        .prepare('INSERT INTO proveedores (nombre) VALUES (?)')
        .run(proveedor);
      proveedorRow = { id: lastInsertRowid };
    }
    db.prepare('UPDATE compras SET proveedor_id = ?, costo_envio = ?, fecha = COALESCE(?, fecha) WHERE id = ?').run(
      proveedorRow.id,
      costoEnvio,
      fecha || null,
      compraId
    );

    db.prepare('DELETE FROM compra_items WHERE compra_id = ?').run(compraId);

    const buscarProducto = db.prepare('SELECT id FROM productos WHERE nombre = ?');
    const crearProducto = db.prepare(
      'INSERT INTO productos (nombre, precio_costo, precio_venta) VALUES (?, 0, 0)'
    );
    const insertItem = db.prepare(
      `INSERT INTO compra_items (compra_id, producto_id, cantidad, precio_unitario, costo_real_unitario)
       VALUES (?, ?, ?, ?, ?)`
    );

    const productosNuevos = [];
    for (const item of itemsProrrateados) {
      let productoRow = buscarProducto.get(item.producto);
      if (!productoRow) {
        const { lastInsertRowid } = crearProducto.run(item.producto);
        productoRow = { id: lastInsertRowid };
      }
      insertItem.run(
        compraId,
        productoRow.id,
        item.cantidad,
        item.precio_unitario,
        item.costo_real_unitario
      );
      productosNuevos.push(productoRow.id);
    }

    // 3) Reaplicar según el estado actual (editar no cambia de estado).
    if (compra.estado === 'activa') {
      const { subtotal: subtotalNuevo } = db
        .prepare(
          'SELECT COALESCE(SUM(cantidad * precio_unitario), 0) AS subtotal FROM compra_items WHERE compra_id = ?'
        )
        .get(compraId);
      db.prepare(
        "INSERT INTO movimientos_cc_proveedores (proveedor_id, tipo, importe, compra_id) VALUES (?, 'compra', ?, ?)"
      ).run(proveedorRow.id, subtotalNuevo + costoEnvio, compraId);
    }

    if (compra.stock_aplicado) {
      const insertEntrada = db.prepare(
        `INSERT INTO movimientos_stock (producto_id, tipo, cantidad, origen, compra_id, costo_unitario)
         VALUES (?, 'entrada', ?, 'compra', ?, ?)`
      );
      const nuevos = db
        .prepare('SELECT producto_id, cantidad, costo_real_unitario FROM compra_items WHERE compra_id = ?')
        .all(compraId);
      for (const item of nuevos) {
        insertEntrada.run(item.producto_id, item.cantidad, compraId, item.costo_real_unitario);
      }

      // Recalcular el costo de todos los productos tocados: los que salían
      // antes y los que entran ahora (pueden repetirse, un Set alcanza).
      const productosTocados = new Set([...itemsViejos.map((i) => i.producto_id), ...productosNuevos]);
      for (const productoId of productosTocados) {
        recalcularCostoProducto(productoId);
      }
    }
  });

  res.json({ id: compraId });
});

// "Efectuar el pedido": el borrador pasa a ser una compra real y nace la
// deuda con el proveedor. El stock todavía no se toca — la mercadería no
// llegó.
// Pasa una compra de 'borrador' a 'activa' y genera la deuda con el
// proveedor (subtotal + envío). Asume que ya se validó el estado y que se
// la llama DENTRO de una transacción — mismo criterio que crearCompra, para
// que el asistente por texto pueda encadenar crear+confirmar sin abrir una
// segunda transacción.
function confirmarCompra(compraId) {
  db.prepare("UPDATE compras SET estado = 'activa' WHERE id = ?").run(compraId);

  const compra = db.prepare('SELECT proveedor_id, costo_envio FROM compras WHERE id = ?').get(compraId);
  const { subtotal } = db
    .prepare(`SELECT COALESCE(SUM(cantidad * precio_unitario), 0) AS subtotal FROM compra_items WHERE compra_id = ?`)
    .get(compraId);

  db.prepare(
    "INSERT INTO movimientos_cc_proveedores (proveedor_id, tipo, importe, compra_id) VALUES (?, 'compra', ?, ?)"
  ).run(compra.proveedor_id, subtotal + compra.costo_envio, compraId);
}

app.post('/api/compras/:id/confirmar', (req, res) => {
  const compraId = Number(req.params.id);

  const compra = db.prepare('SELECT id, estado FROM compras WHERE id = ?').get(compraId);
  if (!compra) {
    return res.status(404).json({ error: 'Compra no encontrada.' });
  }
  if (compra.estado !== 'borrador') {
    return res.status(400).json({ error: 'Esta compra ya fue efectuada.' });
  }

  withTransaction(() => confirmarCompra(compraId));

  res.json({ id: compraId, estado: 'activa' });
});

// Suma el stock de una compra y recalcula el costo promedio ponderado de
// cada producto. Usa costo_real_unitario (con el envío ya prorrateado), no
// el precio unitario pelado. Se llama dentro de una transacción.
function aplicarStockCompra(compraId) {
  const items = db
    .prepare(
      'SELECT producto_id, cantidad, costo_real_unitario, precio_unitario FROM compra_items WHERE compra_id = ?'
    )
    .all(compraId);

  const buscarProducto = db.prepare('SELECT precio_costo FROM productos WHERE id = ?');
  const buscarStockActual = db.prepare('SELECT cantidad FROM stock_actual WHERE producto_id = ?');
  const actualizarPrecioCosto = db.prepare('UPDATE productos SET precio_costo = ? WHERE id = ?');
  const insertMovimiento = db.prepare(
    `INSERT INTO movimientos_stock (producto_id, tipo, cantidad, origen, compra_id, costo_unitario)
     VALUES (?, 'entrada', ?, 'compra', ?, ?)`
  );

  for (const item of items) {
    const costoReal = item.costo_real_unitario ?? item.precio_unitario;
    // El stock previo se acota a 0: si quedó negativo por un ajuste, no
    // tiene sentido que arrastre el promedio hacia valores absurdos.
    const stockPrevio = Math.max(buscarStockActual.get(item.producto_id)?.cantidad ?? 0, 0);
    const costoAnterior = buscarProducto.get(item.producto_id).precio_costo;
    const costoPromedio =
      (stockPrevio * costoAnterior + item.cantidad * costoReal) / (stockPrevio + item.cantidad);

    actualizarPrecioCosto.run(costoPromedio, item.producto_id);
    insertMovimiento.run(item.producto_id, item.cantidad, compraId, costoReal);
  }

  db.prepare('UPDATE compras SET stock_aplicado = 1 WHERE id = ?').run(compraId);
}

// Reproduce el costo promedio ponderado de un producto desde cero,
// repasando su historial de movimientos en orden cronológico, en vez de
// arrastrar el cálculo incremental. Da exactamente el mismo resultado que
// aplicarStockCompra en el camino normal, pero es lo que permite editar o
// revertir una compra ya recibida sin degradar el costo: en vez de tratar
// de "restar" un promedio ponderado (no es reversible de forma exacta),
// se recalcula todo desde el historial real que quedó en movimientos_stock.
//
// Solo las entradas mueven el costo (salidas y ajustes solo cantidad, es
// el comportamiento estándar de costo promedio ponderado). Los
// movimientos viejos, de antes de que existiera la columna
// movimientos_stock.costo_unitario, caen en cascada al
// costo_real_unitario que quedó guardado en compra_items de esa compra.
function recalcularCostoProducto(productoId) {
  const movimientos = db
    .prepare(
      `SELECT tipo, cantidad, costo_unitario, compra_id
         FROM movimientos_stock
        WHERE producto_id = ?
        ORDER BY fecha, id`
    )
    .all(productoId);

  const buscarCostoCompra = db.prepare(
    'SELECT costo_real_unitario FROM compra_items WHERE compra_id = ? AND producto_id = ?'
  );

  let stock = 0;
  let costo = 0;
  for (const m of movimientos) {
    if (m.tipo === 'entrada') {
      let costoEntrada = m.costo_unitario;
      if (costoEntrada === null && m.compra_id) {
        costoEntrada = buscarCostoCompra.get(m.compra_id, productoId)?.costo_real_unitario ?? null;
      }
      if (costoEntrada !== null) {
        const stockPrevio = Math.max(stock, 0);
        costo = (stockPrevio * costo + m.cantidad * costoEntrada) / (stockPrevio + m.cantidad);
      }
      stock += m.cantidad;
    } else {
      // 'salida' resta, 'ajuste' ya viene con signo — ninguno toca el costo.
      stock += m.tipo === 'salida' ? -m.cantidad : m.cantidad;
    }
  }

  db.prepare('UPDATE productos SET precio_costo = ? WHERE id = ?').run(costo, productoId);
  return costo;
}

app.post('/api/compras/:id/anular', (req, res) => {
  const compraId = Number(req.params.id);

  const compra = db
    .prepare('SELECT id, proveedor_id, estado, costo_envio, stock_aplicado FROM compras WHERE id = ?')
    .get(compraId);
  if (!compra) {
    return res.status(404).json({ error: 'Compra no encontrada.' });
  }
  if (compra.estado === 'anulada') {
    return res.status(400).json({ error: 'Esta compra ya está anulada.' });
  }

  const tienePagos = db.prepare('SELECT 1 FROM pagos WHERE compra_id = ?').get(compraId);
  if (tienePagos) {
    return res.status(400).json({ error: 'Esta compra tiene pagos registrados, no se puede anular.' });
  }

  const tieneDevolucionAnular = db
    .prepare("SELECT 1 FROM devoluciones_proveedor WHERE compra_id = ? AND estado = 'activa'")
    .get(compraId);
  if (tieneDevolucionAnular) {
    return res
      .status(400)
      .json({ error: 'Esta compra tiene una devolución a proveedor asociada, no se puede anular.' });
  }

  const items = db
    .prepare(
      `SELECT compra_items.producto_id, compra_items.cantidad, compra_items.precio_unitario, productos.nombre
       FROM compra_items JOIN productos ON productos.id = compra_items.producto_id
       WHERE compra_id = ?`
    )
    .all(compraId);

  // El stock solo hay que devolverlo si esta compra llegó a sumarlo (o sea,
  // si se marcó recibida). Un borrador o un pedido en camino no tocaron el
  // depósito, así que no hay nada que revertir ni que validar.
  if (compra.stock_aplicado) {
    const buscarStockActual = db.prepare('SELECT cantidad FROM stock_actual WHERE producto_id = ?');
    for (const item of items) {
      const stockActual = buscarStockActual.get(item.producto_id)?.cantidad ?? 0;
      if (stockActual - item.cantidad < 0) {
        return res.status(400).json({
          error: `"${item.nombre}" ya se vendió parcial o totalmente, no se puede anular la compra.`
        });
      }
    }
  }

  withTransaction(() => {
    db.prepare("UPDATE compras SET estado = 'anulada' WHERE id = ?").run(compraId);

    if (compra.stock_aplicado) {
      const insertMovimiento = db.prepare(
        "INSERT INTO movimientos_stock (producto_id, tipo, cantidad, origen, compra_id, nota) VALUES (?, 'salida', ?, 'compra', ?, 'Reversión por anulación')"
      );
      for (const item of items) {
        insertMovimiento.run(item.producto_id, item.cantidad, compraId);
      }
      // Queda en 0 para que, si se restaura desde la papelera, el stock se
      // vuelva a aplicar en vez de darse por aplicado.
      db.prepare('UPDATE compras SET stock_aplicado = 0 WHERE id = ?').run(compraId);
    }

    // La deuda solo existe si el pedido se llegó a efectuar: un borrador
    // anulado no le debe nada a nadie.
    if (compra.estado === 'activa') {
      const subtotal = items.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0);
      db.prepare(
        "INSERT INTO movimientos_cc_proveedores (proveedor_id, tipo, importe, compra_id) VALUES (?, 'ajuste', ?, ?)"
      ).run(compra.proveedor_id, -(subtotal + compra.costo_envio), compraId);
    }
  });

  res.json({ id: compraId, estado: 'anulada' });
});

// Restaurar desde la papelera. Una compra que se anuló siendo borrador
// vuelve a ser borrador (nunca tuvo deuda ni stock); una que ya se había
// efectuado vuelve a estar activa, con su deuda, y si además estaba
// recibida se le vuelve a sumar el stock.
app.post('/api/compras/:id/restaurar', (req, res) => {
  const compraId = Number(req.params.id);

  const compra = db
    .prepare('SELECT id, proveedor_id, estado, estado_envio, costo_envio FROM compras WHERE id = ?')
    .get(compraId);
  if (!compra) {
    return res.status(404).json({ error: 'Compra no encontrada.' });
  }
  if (compra.estado !== 'anulada') {
    return res.status(400).json({ error: 'Esta compra no está en la papelera.' });
  }

  // No se guarda el estado previo a la anulación: se deduce de si llegó a
  // generar deuda. Si nunca hubo un movimiento 'compra' en la cuenta
  // corriente, era un borrador.
  const fueEfectuada = db
    .prepare("SELECT 1 FROM movimientos_cc_proveedores WHERE compra_id = ? AND tipo = 'compra'")
    .get(compraId);

  if (!fueEfectuada) {
    db.prepare("UPDATE compras SET estado = 'borrador' WHERE id = ?").run(compraId);
    return res.json({ id: compraId, estado: 'borrador' });
  }

  withTransaction(() => {
    db.prepare("UPDATE compras SET estado = 'activa' WHERE id = ?").run(compraId);

    const { subtotal } = db
      .prepare(
        `SELECT COALESCE(SUM(cantidad * precio_unitario), 0) AS subtotal
           FROM compra_items WHERE compra_id = ?`
      )
      .get(compraId);
    db.prepare(
      "INSERT INTO movimientos_cc_proveedores (proveedor_id, tipo, importe, compra_id) VALUES (?, 'ajuste', ?, ?)"
    ).run(compra.proveedor_id, subtotal + compra.costo_envio, compraId);

    if (compra.estado_envio === 'recibido') {
      aplicarStockCompra(compraId);
    }
  });

  res.json({ id: compraId, estado: 'activa' });
});

// El estado de envío es el que gobierna el stock: al marcar 'recibido' la
// mercadería entra al depósito y recién ahí se recalcula el costo.
app.patch('/api/compras/:id/estado-envio', (req, res) => {
  const compraId = Number(req.params.id);
  const { estado_envio } = req.body;

  if (!ESTADOS_ENVIO.includes(estado_envio)) {
    return res.status(400).json({ error: 'Estado de envío inválido.' });
  }

  const compra = db
    .prepare('SELECT id, estado, estado_envio, stock_aplicado FROM compras WHERE id = ?')
    .get(compraId);
  if (!compra) {
    return res.status(404).json({ error: 'Compra no encontrada.' });
  }
  if (compra.estado === 'borrador') {
    return res
      .status(400)
      .json({ error: 'Esta compra todavía es un borrador: primero hay que efectuar el pedido.' });
  }
  if (compra.estado === 'anulada') {
    return res.status(400).json({ error: 'Esta compra está anulada.' });
  }
  // Volver atrás desde "recibido" obligaría a deshacer el costo promedio
  // ponderado, que se sobrescribe de forma destructiva y no tiene historial
  // para reconstruirlo. Si hay que corregir, se anula la compra.
  if (compra.estado_envio === 'recibido' && estado_envio !== 'recibido') {
    return res.status(400).json({
      error: 'Una compra ya recibida no puede volver atrás. Si te equivocaste, anulá la compra.'
    });
  }

  if (estado_envio === 'recibido' && !compra.stock_aplicado) {
    withTransaction(() => {
      db.prepare('UPDATE compras SET estado_envio = ? WHERE id = ?').run(estado_envio, compraId);
      aplicarStockCompra(compraId);
    });
  } else {
    db.prepare('UPDATE compras SET estado_envio = ? WHERE id = ?').run(estado_envio, compraId);
  }

  res.json({ id: compraId, estado_envio });
});

app.get('/api/compras/:id/pagos', (req, res) => {
  const pagos = db
    .prepare(
      `SELECT pagos.id, pagos.fecha, pagos.importe, pagos.nota,
              cuentas_tesoreria.nombre AS cuenta
       FROM pagos
       JOIN cuentas_tesoreria ON cuentas_tesoreria.id = pagos.cuenta_tesoreria_id
       WHERE pagos.compra_id = ?
       ORDER BY pagos.id`
    )
    .all(Number(req.params.id));
  res.json(pagos);
});

app.post('/api/compras/:id/pagos', (req, res) => {
  const compraId = Number(req.params.id);
  const { importe, cuenta_tesoreria_id, nota } = req.body;

  const compra = db
    .prepare(
      `SELECT compras.id, compras.proveedor_id,
              (SELECT COALESCE(SUM(cantidad * precio_unitario), 0) FROM compra_items WHERE compra_id = compras.id) AS total,
              (SELECT COALESCE(SUM(importe), 0) FROM pagos WHERE compra_id = compras.id) AS pagado,
              ${SUBQUERY_DEVUELTO_COMPRA} AS devuelto
       FROM compras WHERE compras.id = ?`
    )
    .get(compraId);
  if (!compra) {
    return res.status(404).json({ error: 'Compra no encontrada.' });
  }

  // La mercadería devuelta ya no es plata que el proveedor pueda cobrar:
  // el saldo pendiente se calcula sobre el neto, no sobre el total bruto.
  const saldoPendiente = compra.total - compra.devuelto - compra.pagado;
  if (!(importe > 0)) {
    return res.status(400).json({ error: 'El importe del pago tiene que ser mayor a 0.' });
  }
  if (importe > saldoPendiente) {
    return res.status(400).json({
      error: `El importe supera el saldo pendiente de la compra (${saldoPendiente.toFixed(2)}).`
    });
  }

  const pagoId = withTransaction(() => {
    const { lastInsertRowid: nuevoPagoId } = db
      .prepare('INSERT INTO pagos (compra_id, importe, cuenta_tesoreria_id, nota) VALUES (?, ?, ?, ?)')
      .run(compraId, importe, cuenta_tesoreria_id, nota ?? null);

    db.prepare(
      "INSERT INTO movimientos_tesoreria (cuenta_tesoreria_id, tipo, importe, pago_id, origen) VALUES (?, 'egreso', ?, ?, 'pago')"
    ).run(cuenta_tesoreria_id, importe, nuevoPagoId);

    db.prepare(
      "INSERT INTO movimientos_cc_proveedores (proveedor_id, tipo, importe, compra_id, pago_id) VALUES (?, 'pago', ?, ?, ?)"
    ).run(compra.proveedor_id, -importe, compraId, nuevoPagoId);

    return nuevoPagoId;
  });

  res.status(201).json({ id: pagoId });
});

/* ---------- Devoluciones a proveedor ---------- */

// Espejo de Devoluciones (venta) del lado de compras: revierte parte de
// una compra ya recibida, devolviéndole mercadería al proveedor. A
// diferencia de la devolución de venta, acá no hay un equivalente de
// vuelve_stock: el movimiento es siempre una salida (se le devuelve al
// proveedor, sin importar el motivo).
//
// El comprobante asociado es una referencia libre al número que te dio el
// proveedor en su propia nota de crédito — no algo que Nexo emita ni
// prepare para ARCA, así que no reutiliza la tabla facturas ni tiene
// numeración propia (ver el comentario largo en schema.sql).

const SELECT_DEVOLUCION_PROVEEDOR = `
  SELECT devoluciones_proveedor.id, devoluciones_proveedor.compra_id, devoluciones_proveedor.fecha,
         devoluciones_proveedor.estado, devoluciones_proveedor.motivo,
         devoluciones_proveedor.cuenta_tesoreria_id, devoluciones_proveedor.nota_credito_proveedor_numero,
         cuentas_tesoreria.nombre AS cuenta,
         compras.proveedor_id, proveedores.nombre AS proveedor,
         (SELECT COALESCE(SUM(cantidad * precio_unitario), 0)
            FROM devolucion_proveedor_items
           WHERE devolucion_proveedor_items.devolucion_proveedor_id = devoluciones_proveedor.id) AS total,
         (SELECT GROUP_CONCAT(
                   (CASE WHEN devolucion_proveedor_items.cantidad = CAST(devolucion_proveedor_items.cantidad AS INTEGER)
                         THEN CAST(devolucion_proveedor_items.cantidad AS INTEGER)
                         ELSE devolucion_proveedor_items.cantidad END) || ' × ' || productos.nombre, ', ')
            FROM devolucion_proveedor_items JOIN productos ON productos.id = devolucion_proveedor_items.producto_id
           WHERE devolucion_proveedor_items.devolucion_proveedor_id = devoluciones_proveedor.id) AS items_resumen
    FROM devoluciones_proveedor
    JOIN compras ON compras.id = devoluciones_proveedor.compra_id
    JOIN proveedores ON proveedores.id = compras.proveedor_id
    LEFT JOIN cuentas_tesoreria ON cuentas_tesoreria.id = devoluciones_proveedor.cuenta_tesoreria_id`;

function decorarDevolucionProveedor(d) {
  return {
    ...d,
    tiene_nota_credito: d.nota_credito_proveedor_numero != null,
    reintegrada: d.cuenta_tesoreria_id != null
  };
}

app.get('/api/devoluciones-proveedor', (req, res) => {
  const devoluciones = db
    .prepare(`${SELECT_DEVOLUCION_PROVEEDOR} ORDER BY devoluciones_proveedor.id DESC`)
    .all();
  res.json(devoluciones.map(decorarDevolucionProveedor));
});

app.get('/api/devoluciones-proveedor/:id', (req, res) => {
  const id = Number(req.params.id);
  const devolucion = db
    .prepare(`${SELECT_DEVOLUCION_PROVEEDOR} WHERE devoluciones_proveedor.id = ?`)
    .get(id);
  if (!devolucion) {
    return res.status(404).json({ error: 'Devolución a proveedor no encontrada.' });
  }

  const items = db
    .prepare(
      `SELECT devolucion_proveedor_items.id, devolucion_proveedor_items.compra_item_id,
              devolucion_proveedor_items.producto_id, productos.nombre AS producto,
              devolucion_proveedor_items.cantidad, devolucion_proveedor_items.precio_unitario
         FROM devolucion_proveedor_items JOIN productos ON productos.id = devolucion_proveedor_items.producto_id
        WHERE devolucion_proveedor_id = ?
        ORDER BY devolucion_proveedor_items.id`
    )
    .all(id);

  res.json({
    ...decorarDevolucionProveedor(devolucion),
    items: items.map((i) => ({ ...i, subtotal: i.cantidad * i.precio_unitario }))
  });
});

// Cuánto queda disponible para devolver de cada renglón de una compra: lo
// comprado menos lo ya devuelto por devoluciones a proveedor activas.
// compra_item_id (no producto_id) para que el tope sea correcto aunque el
// mismo producto aparezca en más de un renglón de la compra.
function itemsDevolviblesDeCompra(compraId) {
  return db
    .prepare(
      `SELECT compra_items.id AS compra_item_id, compra_items.producto_id, productos.nombre,
              compra_items.precio_unitario, compra_items.costo_real_unitario,
              compra_items.cantidad - COALESCE((
                SELECT SUM(devolucion_proveedor_items.cantidad)
                  FROM devolucion_proveedor_items
                  JOIN devoluciones_proveedor ON devoluciones_proveedor.id = devolucion_proveedor_items.devolucion_proveedor_id
                 WHERE devolucion_proveedor_items.compra_item_id = compra_items.id
                   AND devoluciones_proveedor.estado = 'activa'
              ), 0) AS disponible
         FROM compra_items JOIN productos ON productos.id = compra_items.producto_id
        WHERE compra_items.compra_id = ?`
    )
    .all(compraId);
}

// Aplica los efectos de una devolución a proveedor ya cargada: salida de
// stock, recálculo del costo promedio del producto (a diferencia de la
// devolución de venta, acá SÍ hay que tocarlo: se está revirtiendo parte
// de lo que una compra sumó al costeo, con recalcularCostoProducto en vez
// de restar el promedio a mano, por la misma razón que anular una compra
// no lo hace a mano), crédito en la cuenta corriente del proveedor, y si
// se marcó reintegro, ingreso de caja. Asume que se la llama DENTRO de una
// transacción — la usan tanto el alta como restaurar.
function aplicarDevolucionProveedor(devolucionProveedorId) {
  const devolucion = db
    .prepare(
      `SELECT devoluciones_proveedor.compra_id, devoluciones_proveedor.cuenta_tesoreria_id, compras.proveedor_id
         FROM devoluciones_proveedor JOIN compras ON compras.id = devoluciones_proveedor.compra_id
        WHERE devoluciones_proveedor.id = ?`
    )
    .get(devolucionProveedorId);

  const items = db
    .prepare(
      'SELECT producto_id, cantidad, precio_unitario FROM devolucion_proveedor_items WHERE devolucion_proveedor_id = ?'
    )
    .all(devolucionProveedorId);

  const insertSalida = db.prepare(
    "INSERT INTO movimientos_stock (producto_id, tipo, cantidad, origen, devolucion_proveedor_id, nota) VALUES (?, 'salida', ?, 'devolucion_proveedor', ?, 'Devolución a proveedor')"
  );

  let total = 0;
  const productosTocados = new Set();
  for (const item of items) {
    insertSalida.run(item.producto_id, item.cantidad, devolucionProveedorId);
    productosTocados.add(item.producto_id);
    total += item.cantidad * item.precio_unitario;
  }
  for (const productoId of productosTocados) {
    recalcularCostoProducto(productoId);
  }

  // Crédito a favor con el proveedor: baja la deuda, igual signo que un pago.
  db.prepare(
    "INSERT INTO movimientos_cc_proveedores (proveedor_id, tipo, importe, compra_id) VALUES (?, 'ajuste', ?, ?)"
  ).run(devolucion.proveedor_id, -total, devolucion.compra_id);

  if (devolucion.cuenta_tesoreria_id) {
    // Mismo doble asiento que aplicarDevolucion (venta): si el proveedor
    // reintegra la plata en el acto, hace falta un segundo ajuste (+total)
    // que cancele el crédito recién generado — si no, además de la plata
    // que entró a caja quedaría un saldo a favor fantasma en la cuenta
    // corriente del proveedor.
    db.prepare(
      "INSERT INTO movimientos_cc_proveedores (proveedor_id, tipo, importe, compra_id) VALUES (?, 'ajuste', ?, ?)"
    ).run(devolucion.proveedor_id, total, devolucion.compra_id);

    db.prepare(
      "INSERT INTO movimientos_tesoreria (cuenta_tesoreria_id, tipo, importe, origen, devolucion_proveedor_id) VALUES (?, 'ingreso', ?, 'devolucion_proveedor', ?)"
    ).run(devolucion.cuenta_tesoreria_id, total, devolucionProveedorId);
  }
}

// El espejo exacto de aplicarDevolucionProveedor: lo usa anular. No se
// borran los movimientos originales (se conserva la auditoría), se
// insertan los de reversión — mismo criterio que revertirDevolucion.
function revertirDevolucionProveedor(devolucionProveedorId) {
  const devolucion = db
    .prepare(
      `SELECT devoluciones_proveedor.compra_id, devoluciones_proveedor.cuenta_tesoreria_id, compras.proveedor_id
         FROM devoluciones_proveedor JOIN compras ON compras.id = devoluciones_proveedor.compra_id
        WHERE devoluciones_proveedor.id = ?`
    )
    .get(devolucionProveedorId);

  const items = db
    .prepare(
      'SELECT producto_id, cantidad, precio_unitario FROM devolucion_proveedor_items WHERE devolucion_proveedor_id = ?'
    )
    .all(devolucionProveedorId);

  const insertEntrada = db.prepare(
    "INSERT INTO movimientos_stock (producto_id, tipo, cantidad, origen, devolucion_proveedor_id, nota) VALUES (?, 'entrada', ?, 'devolucion_proveedor', ?, 'Reversión por anulación')"
  );

  let total = 0;
  const productosTocados = new Set();
  for (const item of items) {
    insertEntrada.run(item.producto_id, item.cantidad, devolucionProveedorId);
    productosTocados.add(item.producto_id);
    total += item.cantidad * item.precio_unitario;
  }
  for (const productoId of productosTocados) {
    recalcularCostoProducto(productoId);
  }

  // Vuelve a subir la deuda del proveedor (se había bajado al aplicar).
  db.prepare(
    "INSERT INTO movimientos_cc_proveedores (proveedor_id, tipo, importe, compra_id) VALUES (?, 'ajuste', ?, ?)"
  ).run(devolucion.proveedor_id, total, devolucion.compra_id);

  if (devolucion.cuenta_tesoreria_id) {
    // Espejo del ajuste de reintegro en aplicarDevolucionProveedor: vuelve
    // a bajar la cuenta corriente para deshacer la reconciliación de arriba.
    db.prepare(
      "INSERT INTO movimientos_cc_proveedores (proveedor_id, tipo, importe, compra_id) VALUES (?, 'ajuste', ?, ?)"
    ).run(devolucion.proveedor_id, -total, devolucion.compra_id);

    db.prepare(
      "INSERT INTO movimientos_tesoreria (cuenta_tesoreria_id, tipo, importe, origen, devolucion_proveedor_id) VALUES (?, 'egreso', ?, 'devolucion_proveedor', ?)"
    ).run(devolucion.cuenta_tesoreria_id, total, devolucionProveedorId);
  }
}

app.post('/api/devoluciones-proveedor', (req, res) => {
  const { compra_id, items, motivo, cuenta_tesoreria_id } = req.body;
  const compraId = Number(compra_id);

  const compra = db.prepare('SELECT id, estado, stock_aplicado FROM compras WHERE id = ?').get(compraId);
  if (!compra) {
    return res.status(404).json({ error: 'Compra no encontrada.' });
  }
  if (compra.estado === 'anulada') {
    return res
      .status(400)
      .json({ error: 'Esta compra está anulada, no se le puede registrar una devolución.' });
  }
  if (compra.estado !== 'activa' || !compra.stock_aplicado) {
    return res.status(400).json({
      error: 'Esta compra todavía no fue recibida, no hay mercadería ni deuda que devolver.'
    });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'La devolución necesita al menos un item.' });
  }

  const vistos = new Set();
  for (const item of items) {
    const id = Number(item.compra_item_id);
    if (vistos.has(id)) {
      return res.status(400).json({ error: 'No se puede repetir el mismo item de la compra.' });
    }
    vistos.add(id);
    if (!(Number(item.cantidad) > 0)) {
      return res.status(400).json({ error: 'La cantidad a devolver debe ser mayor a 0.' });
    }
  }

  if (cuenta_tesoreria_id) {
    const cuenta = db.prepare('SELECT 1 FROM cuentas_tesoreria WHERE id = ?').get(cuenta_tesoreria_id);
    if (!cuenta) {
      return res.status(400).json({ error: 'La cuenta de tesorería no existe.' });
    }
  }

  const disponibles = new Map(itemsDevolviblesDeCompra(compraId).map((r) => [r.compra_item_id, r]));
  // A diferencia de una devolución de venta (que solo agrega stock), acá se
  // saca stock: si parte de esta mercadería ya se vendió, no se puede sacar
  // más de lo que efectivamente sigue en el depósito.
  const buscarStockActual = db.prepare('SELECT cantidad FROM stock_actual WHERE producto_id = ?');
  for (const item of items) {
    const renglon = disponibles.get(Number(item.compra_item_id));
    if (!renglon) {
      return res.status(400).json({ error: 'Uno de los items no pertenece a esta compra.' });
    }
    if (Number(item.cantidad) > renglon.disponible) {
      return res.status(400).json({
        error: `No se puede devolver más de lo comprado de "${renglon.nombre}" (disponible: ${renglon.disponible}).`
      });
    }
    const stockActual = buscarStockActual.get(renglon.producto_id)?.cantidad ?? 0;
    if (Number(item.cantidad) > stockActual) {
      return res.status(400).json({
        error: `No hay stock suficiente de "${renglon.nombre}" para devolver (stock actual: ${stockActual}).`
      });
    }
  }

  const devolucionId = withTransaction(() => {
    const { lastInsertRowid: nuevaId } = db
      .prepare('INSERT INTO devoluciones_proveedor (compra_id, cuenta_tesoreria_id, motivo) VALUES (?, ?, ?)')
      .run(compraId, cuenta_tesoreria_id || null, motivo?.trim() || null);

    const insertItem = db.prepare(
      `INSERT INTO devolucion_proveedor_items
              (devolucion_proveedor_id, compra_item_id, producto_id, cantidad, precio_unitario, costo_real_unitario)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const item of items) {
      const renglon = disponibles.get(Number(item.compra_item_id));
      insertItem.run(
        nuevaId,
        renglon.compra_item_id,
        renglon.producto_id,
        Number(item.cantidad),
        renglon.precio_unitario,
        renglon.costo_real_unitario ?? renglon.precio_unitario
      );
    }

    aplicarDevolucionProveedor(nuevaId);
    return nuevaId;
  });

  res.status(201).json({ id: devolucionId });
});

app.post('/api/devoluciones-proveedor/:id/nota-credito', (req, res) => {
  const id = Number(req.params.id);
  const { numero } = req.body;

  if (!numero || !String(numero).trim()) {
    return res.status(400).json({ error: 'Hace falta el número de la nota de crédito.' });
  }

  const devolucion = db
    .prepare('SELECT id, estado, nota_credito_proveedor_numero FROM devoluciones_proveedor WHERE id = ?')
    .get(id);
  if (!devolucion) {
    return res.status(404).json({ error: 'Devolución a proveedor no encontrada.' });
  }
  if (devolucion.estado === 'anulada') {
    return res.status(400).json({ error: 'Esta devolución está anulada.' });
  }
  if (devolucion.nota_credito_proveedor_numero) {
    return res.status(409).json({ error: 'Esta devolución ya tiene una nota de crédito asociada.' });
  }

  const numeroFinal = String(numero).trim();
  db.prepare('UPDATE devoluciones_proveedor SET nota_credito_proveedor_numero = ? WHERE id = ?').run(
    numeroFinal,
    id
  );

  res.json({ id, nota_credito_proveedor_numero: numeroFinal });
});

app.post('/api/devoluciones-proveedor/:id/anular', (req, res) => {
  const id = Number(req.params.id);

  const devolucion = db
    .prepare('SELECT id, estado, nota_credito_proveedor_numero FROM devoluciones_proveedor WHERE id = ?')
    .get(id);
  if (!devolucion) {
    return res.status(404).json({ error: 'Devolución a proveedor no encontrada.' });
  }
  if (devolucion.estado === 'anulada') {
    return res.status(400).json({ error: 'Esta devolución ya está anulada.' });
  }
  if (devolucion.nota_credito_proveedor_numero) {
    return res
      .status(400)
      .json({ error: 'Esta devolución tiene una nota de crédito asociada, no se puede anular.' });
  }

  // Anular hace ENTRAR stock de nuevo (revertirDevolucionProveedor: se
  // deshace la salida hacia el proveedor), así que a diferencia de
  // restaurar (que vuelve a sacarlo) nunca puede fallar por falta de
  // stock — mismo criterio que anular una devolución de venta.
  withTransaction(() => {
    revertirDevolucionProveedor(id);
    db.prepare("UPDATE devoluciones_proveedor SET estado = 'anulada' WHERE id = ?").run(id);
  });

  res.json({ id, estado: 'anulada' });
});

// Restaurar desde la papelera: vuelve a aplicar el efecto completo (salida
// de stock, costo, cuenta corriente y, si correspondía, el ingreso de
// caja). Puede fallar si en el medio se volvió a comprar/vender ese
// producto de forma que ya no alcanza el stock — mismo cuidado que
// restaurar una compra.
app.post('/api/devoluciones-proveedor/:id/restaurar', (req, res) => {
  const id = Number(req.params.id);

  const devolucion = db.prepare('SELECT id, estado FROM devoluciones_proveedor WHERE id = ?').get(id);
  if (!devolucion) {
    return res.status(404).json({ error: 'Devolución a proveedor no encontrada.' });
  }
  if (devolucion.estado !== 'anulada') {
    return res.status(400).json({ error: 'Esta devolución no está en la papelera.' });
  }

  const items = db
    .prepare(
      `SELECT devolucion_proveedor_items.producto_id, devolucion_proveedor_items.cantidad, productos.nombre
         FROM devolucion_proveedor_items JOIN productos ON productos.id = devolucion_proveedor_items.producto_id
        WHERE devolucion_proveedor_id = ?`
    )
    .all(id);
  const buscarStockActual = db.prepare('SELECT cantidad FROM stock_actual WHERE producto_id = ?');
  for (const item of items) {
    const stockActual = buscarStockActual.get(item.producto_id)?.cantidad ?? 0;
    if (stockActual - item.cantidad < 0) {
      return res.status(400).json({
        error: `No hay stock suficiente de "${item.nombre}" para restaurar esta devolución.`
      });
    }
  }

  withTransaction(() => {
    db.prepare("UPDATE devoluciones_proveedor SET estado = 'activa' WHERE id = ?").run(id);
    aplicarDevolucionProveedor(id);
  });

  res.json({ id, estado: 'activa' });
});

/* ---------- Cuentas de tesorería ---------- */

app.get('/api/cuentas-tesoreria', (req, res) => {
  const cuentas = db.prepare('SELECT * FROM cuentas_tesoreria ORDER BY id').all();
  res.json(cuentas);
});

const TIPOS_CUENTA = ['efectivo', 'banco', 'mercadopago', 'otro'];

app.post('/api/cuentas-tesoreria', (req, res) => {
  const { nombre, tipo, saldo_inicial } = req.body;

  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'La cuenta necesita un nombre.' });
  }
  if (!TIPOS_CUENTA.includes(tipo)) {
    return res.status(400).json({ error: 'El tipo de cuenta no es válido.' });
  }
  const saldoInicial = normalizarPrecio(saldo_inicial);
  if (Number.isNaN(saldoInicial)) {
    return res.status(400).json({ error: 'El saldo inicial tiene que ser un número.' });
  }
  // nombre es UNIQUE en la tabla: se chequea acá para devolver un mensaje
  // entendible en vez de dejar que reviente la constraint.
  const yaExiste = db.prepare('SELECT 1 FROM cuentas_tesoreria WHERE nombre = ?').get(String(nombre).trim());
  if (yaExiste) {
    return res.status(400).json({ error: 'Ya existe una cuenta con ese nombre.' });
  }

  const { lastInsertRowid } = db
    .prepare('INSERT INTO cuentas_tesoreria (nombre, tipo, saldo_inicial) VALUES (?, ?, ?)')
    .run(String(nombre).trim(), tipo, saldoInicial);
  res.status(201).json({ id: lastInsertRowid });
});

app.patch('/api/cuentas-tesoreria/:id', (req, res) => {
  const cuentaId = Number(req.params.id);
  const { nombre, tipo, saldo_inicial } = req.body;

  const cuenta = db.prepare('SELECT id FROM cuentas_tesoreria WHERE id = ?').get(cuentaId);
  if (!cuenta) {
    return res.status(404).json({ error: 'Cuenta no encontrada.' });
  }
  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'La cuenta necesita un nombre.' });
  }
  if (!TIPOS_CUENTA.includes(tipo)) {
    return res.status(400).json({ error: 'El tipo de cuenta no es válido.' });
  }
  const saldoInicial = normalizarPrecio(saldo_inicial);
  if (Number.isNaN(saldoInicial)) {
    return res.status(400).json({ error: 'El saldo inicial tiene que ser un número.' });
  }
  const yaExiste = db
    .prepare('SELECT 1 FROM cuentas_tesoreria WHERE nombre = ? AND id <> ?')
    .get(String(nombre).trim(), cuentaId);
  if (yaExiste) {
    return res.status(400).json({ error: 'Ya existe otra cuenta con ese nombre.' });
  }

  db.prepare('UPDATE cuentas_tesoreria SET nombre = ?, tipo = ?, saldo_inicial = ? WHERE id = ?').run(
    String(nombre).trim(),
    tipo,
    saldoInicial,
    cuentaId
  );
  res.json({ id: cuentaId });
});

/* ---------- Tesorería (caja) ---------- */

// Dónde está la plata. El saldo sale de la vista saldo_tesoreria
// (saldo_inicial + movimientos), nunca de un campo editable a mano
// (CLAUDE.md §12/§13): se puede reconstruir siempre desde el historial.
app.get('/api/tesoreria', (req, res) => {
  const cuentas = db
    .prepare(
      `SELECT cuentas_tesoreria.*,
              COALESCE((SELECT saldo FROM saldo_tesoreria
                         WHERE saldo_tesoreria.cuenta_tesoreria_id = cuentas_tesoreria.id), 0) AS saldo
         FROM cuentas_tesoreria
        ORDER BY cuentas_tesoreria.id`
    )
    .all();

  // Las transferencias se excluyen de los totales de ingresos/egresos a
  // propósito: mover plata de una cuenta propia a otra no es plata que
  // entre ni salga del negocio, y contarla infla las dos columnas.
  const { ingresos, egresos } = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN importe END), 0) AS ingresos,
              COALESCE(SUM(CASE WHEN tipo = 'egreso' THEN importe END), 0) AS egresos
         FROM movimientos_tesoreria
        WHERE origen <> 'transferencia'`
    )
    .get();

  res.json({
    cuentas,
    total: cuentas.reduce((acc, c) => acc + c.saldo, 0),
    ingresos,
    egresos
  });
});

// Igual que movimientos-stock: se devuelve el historial y el navegador lo
// filtra con el motor común (ver el comentario de TOPE_MOVIMIENTOS).
app.get('/api/tesoreria/movimientos', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || TOPE_MOVIMIENTOS, 5000);

  // La contraparte de una transferencia es la otra pata que comparte
  // transferencia_id: se busca su cuenta para poder mostrar
  // "Transferencia a Banco" en vez de un egreso suelto sin explicación.
  const movimientos = db
    .prepare(
      `SELECT movimientos_tesoreria.id, movimientos_tesoreria.fecha, movimientos_tesoreria.tipo,
              movimientos_tesoreria.importe, movimientos_tesoreria.origen, movimientos_tesoreria.concepto,
              movimientos_tesoreria.cuenta_tesoreria_id,
              cuentas_tesoreria.nombre AS cuenta,
              cobros.venta_id AS venta_id,
              pagos.compra_id AS compra_id,
              (SELECT c2.nombre
                 FROM movimientos_tesoreria AS otra
                 JOIN cuentas_tesoreria AS c2 ON c2.id = otra.cuenta_tesoreria_id
                WHERE otra.transferencia_id = movimientos_tesoreria.transferencia_id
                  AND otra.id <> movimientos_tesoreria.id) AS contraparte
         FROM movimientos_tesoreria
         JOIN cuentas_tesoreria ON cuentas_tesoreria.id = movimientos_tesoreria.cuenta_tesoreria_id
         LEFT JOIN cobros ON cobros.id = movimientos_tesoreria.cobro_id
         LEFT JOIN pagos ON pagos.id = movimientos_tesoreria.pago_id
        ORDER BY movimientos_tesoreria.fecha DESC, movimientos_tesoreria.id DESC
        LIMIT ?`
    )
    .all(limit);

  res.json(movimientos);
});

// Ingreso o egreso cargado a mano: aporte del dueño, retiro, un gasto
// pagado de la caja. No tiene venta ni compra detrás, por eso lleva
// concepto: es lo único que explica de qué se trata.
app.post('/api/tesoreria/movimientos', (req, res) => {
  const { cuenta_tesoreria_id, tipo, importe, fecha, concepto } = req.body;

  if (tipo !== 'ingreso' && tipo !== 'egreso') {
    return res.status(400).json({ error: 'El tipo tiene que ser ingreso o egreso.' });
  }
  const monto = Number(importe);
  if (!(monto > 0)) {
    return res.status(400).json({ error: 'El importe tiene que ser mayor a 0.' });
  }
  const cuenta = db.prepare('SELECT id FROM cuentas_tesoreria WHERE id = ?').get(Number(cuenta_tesoreria_id));
  if (!cuenta) {
    return res.status(400).json({ error: 'La cuenta de tesorería no existe.' });
  }

  const columnas = ['cuenta_tesoreria_id', 'tipo', 'importe', 'origen', 'concepto'];
  const valores = [cuenta.id, tipo, monto, 'manual', concepto?.trim() || null];
  if (fecha) {
    columnas.push('fecha');
    valores.push(fecha);
  }
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO movimientos_tesoreria (${columnas.join(', ')}) VALUES (${columnas
        .map(() => '?')
        .join(', ')})`
    )
    .run(...valores);

  res.status(201).json({ id: lastInsertRowid });
});

// Transferencia entre cuentas propias: sale de una y entra en la otra.
// Son dos movimientos y no uno porque cada cuenta tiene que ver su propio
// lado del movimiento en su historial. Van juntos en una transacción: una
// transferencia a medias dejaría plata desaparecida.
app.post('/api/tesoreria/transferencias', (req, res) => {
  const { origen_id, destino_id, importe, fecha, concepto } = req.body;

  const monto = Number(importe);
  if (!(monto > 0)) {
    return res.status(400).json({ error: 'El importe tiene que ser mayor a 0.' });
  }
  if (Number(origen_id) === Number(destino_id)) {
    return res.status(400).json({ error: 'La cuenta de origen y la de destino tienen que ser distintas.' });
  }
  const cuentaOrigen = db.prepare('SELECT id, nombre FROM cuentas_tesoreria WHERE id = ?').get(Number(origen_id));
  const cuentaDestino = db.prepare('SELECT id, nombre FROM cuentas_tesoreria WHERE id = ?').get(Number(destino_id));
  if (!cuentaOrigen || !cuentaDestino) {
    return res.status(400).json({ error: 'Alguna de las cuentas de la transferencia no existe.' });
  }

  const transferenciaId = withTransaction(() => {
    const insertMovimiento = (cuentaId, tipo, grupo) => {
      const columnas = ['cuenta_tesoreria_id', 'tipo', 'importe', 'origen', 'concepto'];
      const valores = [cuentaId, tipo, monto, 'transferencia', concepto?.trim() || null];
      if (fecha) {
        columnas.push('fecha');
        valores.push(fecha);
      }
      if (grupo !== null) {
        columnas.push('transferencia_id');
        valores.push(grupo);
      }
      return db
        .prepare(
          `INSERT INTO movimientos_tesoreria (${columnas.join(', ')}) VALUES (${columnas
            .map(() => '?')
            .join(', ')})`
        )
        .run(...valores).lastInsertRowid;
    };

    // El id del egreso hace de id de la transferencia: se inserta primero
    // sin grupo, se marca a sí mismo, y el ingreso nace ya apuntando ahí.
    const egresoId = insertMovimiento(cuentaOrigen.id, 'egreso', null);
    db.prepare('UPDATE movimientos_tesoreria SET transferencia_id = ? WHERE id = ?').run(egresoId, egresoId);
    insertMovimiento(cuentaDestino.id, 'ingreso', egresoId);

    return egresoId;
  });

  res.status(201).json({ transferencia_id: transferenciaId });
});

/* ---------- Categorías de gasto ---------- */

const TIPOS_GASTO = ['operativo', 'inversion', 'retiro'];

app.get('/api/categorias-gasto', (req, res) => {
  const categorias = db.prepare('SELECT * FROM categorias_gasto ORDER BY nombre').all();
  res.json(categorias);
});

app.post('/api/categorias-gasto', (req, res) => {
  const { nombre, tipo } = req.body;

  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'La categoría necesita un nombre.' });
  }
  if (!TIPOS_GASTO.includes(tipo)) {
    return res.status(400).json({ error: 'El tipo de gasto no es válido.' });
  }
  // nombre es UNIQUE: se chequea acá para devolver un mensaje entendible
  // en vez de dejar que reviente la constraint.
  const yaExiste = db
    .prepare('SELECT 1 FROM categorias_gasto WHERE nombre = ?')
    .get(String(nombre).trim());
  if (yaExiste) {
    return res.status(400).json({ error: 'Ya existe una categoría con ese nombre.' });
  }

  const { lastInsertRowid } = db
    .prepare('INSERT INTO categorias_gasto (nombre, tipo) VALUES (?, ?)')
    .run(String(nombre).trim(), tipo);
  res.status(201).json({ id: lastInsertRowid });
});

// Cambiar el tipo de una categoría afecta solo a los gastos futuros: los
// ya cargados guardan su propio tipo (ver schema.sql), justamente para no
// reescribir resultados de meses cerrados.
app.patch('/api/categorias-gasto/:id', (req, res) => {
  const categoriaId = Number(req.params.id);
  const { nombre, tipo, activa } = req.body;

  const categoria = db.prepare('SELECT id FROM categorias_gasto WHERE id = ?').get(categoriaId);
  if (!categoria) {
    return res.status(404).json({ error: 'Categoría no encontrada.' });
  }
  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'La categoría necesita un nombre.' });
  }
  if (!TIPOS_GASTO.includes(tipo)) {
    return res.status(400).json({ error: 'El tipo de gasto no es válido.' });
  }
  const yaExiste = db
    .prepare('SELECT 1 FROM categorias_gasto WHERE nombre = ? AND id <> ?')
    .get(String(nombre).trim(), categoriaId);
  if (yaExiste) {
    return res.status(400).json({ error: 'Ya existe otra categoría con ese nombre.' });
  }

  db.prepare('UPDATE categorias_gasto SET nombre = ?, tipo = ?, activa = ? WHERE id = ?').run(
    String(nombre).trim(),
    tipo,
    activa === undefined ? 1 : Number(Boolean(activa)),
    categoriaId
  );
  res.json({ id: categoriaId });
});

/* ---------- Gastos ---------- */

const SELECT_GASTO = `
  SELECT gastos.*,
         categorias_gasto.nombre AS categoria,
         cuentas_tesoreria.nombre AS cuenta,
         proveedores.nombre AS proveedor
    FROM gastos
    JOIN categorias_gasto ON categorias_gasto.id = gastos.categoria_id
    JOIN cuentas_tesoreria ON cuentas_tesoreria.id = gastos.cuenta_tesoreria_id
    LEFT JOIN proveedores ON proveedores.id = gastos.proveedor_id`;

app.get('/api/gastos', (req, res) => {
  const gastos = db.prepare(`${SELECT_GASTO} ORDER BY gastos.fecha DESC, gastos.id DESC`).all();
  res.json(gastos);
});

// Valida el cuerpo de un gasto y resuelve la categoría. Lo comparten el
// alta y la edición, que exigen exactamente lo mismo.
function validarGasto(body) {
  const { categoria_id, cuenta_tesoreria_id, proveedor_id, importe, tipo } = body;

  const categoria = db
    .prepare('SELECT id, tipo FROM categorias_gasto WHERE id = ?')
    .get(Number(categoria_id));
  if (!categoria) {
    return { error: 'La categoría del gasto no existe.' };
  }
  const cuenta = db
    .prepare('SELECT id FROM cuentas_tesoreria WHERE id = ?')
    .get(Number(cuenta_tesoreria_id));
  if (!cuenta) {
    return { error: 'La cuenta de tesorería no existe.' };
  }
  const monto = Number(importe);
  if (!(monto > 0)) {
    return { error: 'El importe del gasto tiene que ser mayor a 0.' };
  }
  // El tipo se hereda de la categoría salvo que venga uno explícito, que
  // es lo que permite corregir un gasto puntual sin tocar la categoría.
  const tipoFinal = tipo === undefined || tipo === null || tipo === '' ? categoria.tipo : tipo;
  if (!TIPOS_GASTO.includes(tipoFinal)) {
    return { error: 'El tipo de gasto no es válido.' };
  }
  let proveedorFinal = null;
  if (proveedor_id) {
    const proveedor = db.prepare('SELECT id FROM proveedores WHERE id = ?').get(Number(proveedor_id));
    if (!proveedor) {
      return { error: 'El proveedor del gasto no existe.' };
    }
    proveedorFinal = proveedor.id;
  }

  return { categoriaId: categoria.id, cuentaId: cuenta.id, proveedorId: proveedorFinal, monto, tipo: tipoFinal };
}

// Un gasto se paga en el momento (decisión del equipo): además de la fila
// en gastos genera su egreso de tesorería, los dos en la misma
// transacción para que no quede plata descontada sin gasto ni al revés.
app.post('/api/gastos', (req, res) => {
  const { fecha, descripcion, comprobante } = req.body;
  const validacion = validarGasto(req.body);
  if (validacion.error) {
    return res.status(400).json({ error: validacion.error });
  }
  const { categoriaId, cuentaId, proveedorId, monto, tipo } = validacion;

  const gastoId = withTransaction(() =>
    crearGasto({ categoriaId, cuentaId, proveedorId, monto, tipo, fecha, descripcion, comprobante })
  );

  res.status(201).json({ id: gastoId });
});

// Inserta el gasto y su egreso de tesorería. Espera los datos ya
// validados por validarGasto() (categoriaId/cuentaId/proveedorId/monto/
// tipo con nombres resueltos a ID). Asume que se la llama DENTRO de una
// transacción.
function crearGasto({ categoriaId, cuentaId, proveedorId, monto, tipo, fecha, descripcion, comprobante }) {
  const columnas = ['categoria_id', 'cuenta_tesoreria_id', 'proveedor_id', 'importe', 'tipo', 'descripcion', 'comprobante'];
  const valores = [categoriaId, cuentaId, proveedorId, monto, tipo, descripcion?.trim() || null, comprobante?.trim() || null];
  if (fecha) {
    columnas.push('fecha');
    valores.push(fecha);
  }
  const { lastInsertRowid: nuevoGastoId } = db
    .prepare(`INSERT INTO gastos (${columnas.join(', ')}) VALUES (${columnas.map(() => '?').join(', ')})`)
    .run(...valores);

  insertarMovimientoGasto(nuevoGastoId, cuentaId, monto, fecha, descripcion);
  return nuevoGastoId;
}

function insertarMovimientoGasto(gastoId, cuentaId, monto, fecha, descripcion) {
  const columnas = ['cuenta_tesoreria_id', 'tipo', 'importe', 'origen', 'gasto_id', 'concepto'];
  const valores = [cuentaId, 'egreso', monto, 'gasto', gastoId, descripcion?.trim() || null];
  if (fecha) {
    columnas.push('fecha');
    valores.push(fecha);
  }
  db.prepare(
    `INSERT INTO movimientos_tesoreria (${columnas.join(', ')}) VALUES (${columnas
      .map(() => '?')
      .join(', ')})`
  ).run(...valores);
}

// Editar un gasto: se borra su movimiento de tesorería y se inserta el
// nuevo, dentro de una transacción. Acá sí se puede borrar el movimiento
// (a diferencia de stock o cuenta corriente, donde se compensa) porque un
// gasto es dueño exclusivo de su egreso: nadie más lo referencia y no hay
// un saldo intermedio que alguien haya visto entre medio.
app.put('/api/gastos/:id', (req, res) => {
  const gastoId = Number(req.params.id);
  const { fecha, descripcion, comprobante } = req.body;

  const gasto = db.prepare('SELECT id, estado FROM gastos WHERE id = ?').get(gastoId);
  if (!gasto) {
    return res.status(404).json({ error: 'Gasto no encontrado.' });
  }
  if (gasto.estado === 'anulado') {
    return res.status(400).json({ error: 'Este gasto está anulado. Restauralo primero si querés editarlo.' });
  }

  const validacion = validarGasto(req.body);
  if (validacion.error) {
    return res.status(400).json({ error: validacion.error });
  }
  const { categoriaId, cuentaId, proveedorId, monto, tipo } = validacion;

  withTransaction(() => {
    db.prepare(
      `UPDATE gastos
          SET categoria_id = ?, cuenta_tesoreria_id = ?, proveedor_id = ?, importe = ?,
              tipo = ?, descripcion = ?, comprobante = ?, fecha = COALESCE(?, fecha)
        WHERE id = ?`
    ).run(
      categoriaId,
      cuentaId,
      proveedorId,
      monto,
      tipo,
      descripcion?.trim() || null,
      comprobante?.trim() || null,
      fecha || null,
      gastoId
    );

    db.prepare('DELETE FROM movimientos_tesoreria WHERE gasto_id = ?').run(gastoId);
    insertarMovimientoGasto(gastoId, cuentaId, monto, fecha, descripcion);
  });

  res.json({ id: gastoId });
});

app.post('/api/gastos/:id/anular', (req, res) => {
  const gastoId = Number(req.params.id);
  const gasto = db.prepare('SELECT id, estado FROM gastos WHERE id = ?').get(gastoId);
  if (!gasto) {
    return res.status(404).json({ error: 'Gasto no encontrado.' });
  }
  if (gasto.estado === 'anulado') {
    return res.status(400).json({ error: 'Este gasto ya está anulado.' });
  }

  withTransaction(() => {
    db.prepare("UPDATE gastos SET estado = 'anulado' WHERE id = ?").run(gastoId);
    // La plata vuelve a la cuenta: se saca el egreso que lo había bajado.
    db.prepare('DELETE FROM movimientos_tesoreria WHERE gasto_id = ?').run(gastoId);
  });

  res.json({ id: gastoId, estado: 'anulado' });
});

app.post('/api/gastos/:id/restaurar', (req, res) => {
  const gastoId = Number(req.params.id);
  const gasto = db
    .prepare('SELECT id, estado, cuenta_tesoreria_id, importe, fecha, descripcion FROM gastos WHERE id = ?')
    .get(gastoId);
  if (!gasto) {
    return res.status(404).json({ error: 'Gasto no encontrado.' });
  }
  if (gasto.estado !== 'anulado') {
    return res.status(400).json({ error: 'Este gasto no está anulado.' });
  }

  withTransaction(() => {
    db.prepare("UPDATE gastos SET estado = 'activo' WHERE id = ?").run(gastoId);
    insertarMovimientoGasto(
      gastoId,
      gasto.cuenta_tesoreria_id,
      gasto.importe,
      gasto.fecha,
      gasto.descripcion
    );
  });

  res.json({ id: gastoId, estado: 'activo' });
});

/* ---------- Cuentas corrientes (a cobrar y a pagar) ---------- */

// Antigüedad medida desde la fecha de la operación, no desde un
// vencimiento pactado: ni ventas ni compras tienen ese dato en el
// esquema (ver CLAUDE.md). Los tres tramos calzan con las clases
// .status-* que ya existen en el frontend, para no agregar CSS nueva.
function tramoDeAntiguedad(dias) {
  if (dias <= 30) return 'al_dia';
  if (dias <= 60) return 'atrasado';
  return 'vencido';
}

// Saldo pendiente por operación (venta o compra), no por entidad: es la
// base para poder mostrar el detalle y para calcular la antigüedad desde
// la operación impaga más vieja. No se filtra por estado de la operación
// a propósito: anular una venta o una compra ya inserta el movimiento de
// reversión que deja el saldo en cero (ver los endpoints .../anular), así
// que las anuladas se caen solas acá por el HAVING — filtrar por estado
// sería redundante y más frágil si ese criterio cambia en otro lado.
// `> 0.005` en vez de `<> 0` porque importe es REAL: una operación saldada
// al centavo puede dejar un residuo de coma flotante.
//
// El GROUP BY incluye la entidad además de la operación: si solo
// agrupara por operación, m.${columnaEntidad} sería una bare column bajo
// SQLite y devolvería el valor de una fila arbitraria del grupo. Con
// datos normales todos los movimientos de una operación son de la misma
// entidad y no se nota, pero editar una venta cambiando de cliente deja
// dos asientos de 'ajuste' en la misma operación con cliente_id distinto
// (ver PUT /api/ventas/:id) — sin la entidad en el GROUP BY, esta
// consulta sumaría los dos juntos y se los adjudicaría a cualquiera de
// los dos en vez de partirlos correctamente entre ambos.
function saldosPorOperacion(tablaMovimientos, columnaEntidad, columnaOperacion, tablaOperacion) {
  return db
    .prepare(
      `SELECT m.${columnaOperacion} AS operacion_id, m.${columnaEntidad} AS entidad_id,
              o.fecha AS fecha, ROUND(SUM(m.importe), 2) AS pendiente
         FROM ${tablaMovimientos} m
         JOIN ${tablaOperacion} o ON o.id = m.${columnaOperacion}
        GROUP BY m.${columnaOperacion}, m.${columnaEntidad}
       HAVING ABS(SUM(m.importe)) > 0.005`
    )
    .all();
}

// Agrupa los saldos por operación (arriba) en uno por entidad: saldo total,
// antigüedad de la deuda más vieja (solo entre las operaciones que SÍ son
// deuda: un saldo negativo es crédito a favor, no tiene "antigüedad
// vencida"), y el detalle ordenado por fecha para la fila expandible.
function agruparPorEntidad(saldos, tablaEntidad, hoy) {
  const porEntidad = new Map();
  for (const s of saldos) {
    if (!porEntidad.has(s.entidad_id)) porEntidad.set(s.entidad_id, []);
    porEntidad.get(s.entidad_id).push(s);
  }

  const resultado = [];
  for (const [entidadId, operacionesRaw] of porEntidad) {
    const entidad = db.prepare(`SELECT id, nombre, telefono, email FROM ${tablaEntidad} WHERE id = ?`).get(entidadId);
    if (!entidad) continue; // defensivo: no debería pasar, la FK lo garantiza

    const operaciones = operacionesRaw
      .map((o) => {
        const dias = diffDias(o.fecha, hoy);
        return {
          id: o.operacion_id,
          fecha: o.fecha,
          pendiente: o.pendiente,
          dias: o.pendiente > 0 ? dias : null,
          tramo: o.pendiente > 0 ? tramoDeAntiguedad(dias) : null
        };
      })
      .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.id - b.id));

    const saldo = Math.round(operaciones.reduce((acc, o) => acc + o.pendiente, 0) * 100) / 100;
    const diasDeuda = operaciones.filter((o) => o.pendiente > 0).map((o) => o.dias);

    resultado.push({
      id: entidad.id,
      nombre: entidad.nombre,
      telefono: entidad.telefono,
      email: entidad.email,
      saldo,
      dias_max: diasDeuda.length ? Math.max(...diasDeuda) : null,
      operaciones
    });
  }

  return resultado.sort((a, b) => (b.dias_max ?? -1) - (a.dias_max ?? -1));
}

app.get('/api/cuentas-corrientes', (req, res) => {
  const hoy = fechaDeHoy();

  const entidadesClientes = agruparPorEntidad(
    saldosPorOperacion('movimientos_cc_clientes', 'cliente_id', 'venta_id', 'ventas'),
    'clientes',
    hoy
  );
  const entidadesProveedores = agruparPorEntidad(
    saldosPorOperacion('movimientos_cc_proveedores', 'proveedor_id', 'compra_id', 'compras'),
    'proveedores',
    hoy
  );

  // Los totales solo suman deuda real (saldo > 0); un saldo a favor va
  // aparte y no compensa la deuda de otra entidad.
  const porCobrar = entidadesClientes.filter((e) => e.saldo > 0);
  const porPagar = entidadesProveedores.filter((e) => e.saldo > 0);
  const aFavorClientes = entidadesClientes.filter((e) => e.saldo < 0);
  const aFavorProveedores = entidadesProveedores.filter((e) => e.saldo < 0);

  const sumaSaldo = (lista) => Math.round(lista.reduce((acc, e) => acc + e.saldo, 0) * 100) / 100;
  const totalPorCobrar = sumaSaldo(porCobrar);
  const totalPorPagar = sumaSaldo(porPagar);

  res.json({
    por_cobrar: porCobrar,
    por_pagar: porPagar,
    a_favor_clientes: aFavorClientes,
    a_favor_proveedores: aFavorProveedores,
    totales: {
      por_cobrar: totalPorCobrar,
      por_pagar: totalPorPagar,
      a_favor_clientes: Math.abs(sumaSaldo(aFavorClientes)),
      a_favor_proveedores: Math.abs(sumaSaldo(aFavorProveedores)),
      neto: Math.round((totalPorCobrar - totalPorPagar) * 100) / 100
    }
  });
});

/* ---------- Resumen (resultado del negocio) ---------- */

// El resultado real del negocio. La distinción importante está en qué se
// resta y qué no: solo los gastos operativos bajan el resultado. Las
// inversiones y los retiros salieron de la caja, pero no son gasto del
// período — se informan aparte para que se vean sin ensuciar el número.
//
// Las siguientes sentencias se preparan una sola vez a propósito, acá
// arriba y no dentro de calcularResultado(): esa función corre en loop
// (una vez por período de la serie de /api/resumen/evolucion), y
// re-preparar las mismas sentencias en cada vuelta sería trabajo de
// parseo puro por nada. Es seguro hoistear el statement (no solo el
// string SQL, que es lo que se hace en el resto del archivo) porque este
// módulo se importa después de que db/index.js termina de correr las
// migraciones.
const SQL_RESULTADO_VENTAS = db.prepare(
  `SELECT COALESCE(SUM(venta_items.cantidad * venta_items.precio_unitario), 0) AS total,
          COALESCE(SUM(venta_items.cantidad * venta_items.costo_unitario_historico), 0) AS costo
     FROM ventas JOIN venta_items ON venta_items.venta_id = ventas.id
    WHERE ventas.estado = 'activa'
      AND (? IS NULL OR ventas.fecha >= ?)
      AND (? IS NULL OR ventas.fecha <= ?)`
);

const SQL_RESULTADO_GASTOS = db.prepare(
  `SELECT COALESCE(SUM(CASE WHEN tipo = 'operativo' THEN importe END), 0) AS operativos,
          COALESCE(SUM(CASE WHEN tipo = 'inversion' THEN importe END), 0) AS inversiones,
          COALESCE(SUM(CASE WHEN tipo = 'retiro' THEN importe END), 0) AS retiros
     FROM gastos
    WHERE estado = 'activo'
      AND (? IS NULL OR fecha >= ?)
      AND (? IS NULL OR fecha <= ?)`
);

// Una devolución activa borra la venta que revierte (y su costo, si esa
// mercadería volvió al depósito) del resultado del período en que se
// hizo la devolución — no del período de la venta original, que ya
// cerró. Si vino fallada (vuelve_stock = 0), el costo NO se resta: la
// venta se borra pero el costo queda puesto, o sea la pérdida completa
// de esa mercadería (CLAUDE.md §17).
const SQL_RESULTADO_DEVOLUCIONES = db.prepare(
  `SELECT COALESCE(SUM(devolucion_items.cantidad * devolucion_items.precio_unitario), 0) AS importe,
          COALESCE(SUM(CASE WHEN devolucion_items.vuelve_stock
                            THEN devolucion_items.cantidad * devolucion_items.costo_unitario_historico
                            ELSE 0 END), 0) AS costo
     FROM devoluciones JOIN devolucion_items ON devolucion_items.devolucion_id = devoluciones.id
    WHERE devoluciones.estado = 'activa'
      AND (? IS NULL OR devoluciones.fecha >= ?)
      AND (? IS NULL OR devoluciones.fecha <= ?)`
);

// Fuente de verdad única del resultado del negocio: la usan tanto
// GET /api/resumen (un solo período) como GET /api/resumen/evolucion (uno
// por período de la serie, más el total y el período de comparación). Las
// reglas contables de arriba viven acá y en ningún otro lado — si el día
// de mañana cambian, cambian una sola vez.
function calcularResultado(desde, hasta) {
  // El mismo par de parámetros se repite en cada consulta; con
  // (? IS NULL OR campo >= ?) el filtro se apaga solo cuando no viene.
  const rango = [desde ?? null, desde ?? null, hasta ?? null, hasta ?? null];

  const ventas = SQL_RESULTADO_VENTAS.get(...rango);
  const gastos = SQL_RESULTADO_GASTOS.get(...rango);
  const devoluciones = SQL_RESULTADO_DEVOLUCIONES.get(...rango);

  const ventasNetas = ventas.total - devoluciones.importe;
  const costoNeto = ventas.costo - devoluciones.costo;
  const gananciaBruta = ventasNetas - costoNeto;

  return {
    ventas: ventasNetas,
    costo_mercaderia: costoNeto,
    ganancia_bruta: gananciaBruta,
    gastos_operativos: gastos.operativos,
    resultado: gananciaBruta - gastos.operativos,
    inversiones: gastos.inversiones,
    retiros: gastos.retiros
  };
}

app.get('/api/resumen', (req, res) => {
  const { desde, hasta } = req.query;
  res.json(calcularResultado(desde ?? null, hasta ?? null));
});

/* ---------- Resumen: evolución y comparación de períodos ---------- */

const CAMPOS_RESULTADO = [
  'ventas',
  'costo_mercaderia',
  'ganancia_bruta',
  'gastos_operativos',
  'resultado',
  'inversiones',
  'retiros'
];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
// Tope duro de períodos en la serie: no es un número que se vaya a
// alcanzar en uso normal (2 años en granularidad mensual son 25), es el
// seguro contra un ?desde= absurdamente viejo que generaría miles de
// iteraciones.
const MAX_BUCKETS = 40;

// Cuánto abarca el período pedido, para no traer más operaciones ni
// menos ventas/gastos/devoluciones de las que corresponden (mismas tres
// tablas que calcularResultado — compras y pagos no entran acá tampoco).
const SQL_LIMITES_OPERACIONES = db.prepare(
  `SELECT MIN(fecha) AS primera, MAX(fecha) AS ultima FROM (
     SELECT fecha FROM ventas WHERE estado = 'activa'
     UNION ALL SELECT fecha FROM gastos WHERE estado = 'activo'
     UNION ALL SELECT fecha FROM devoluciones WHERE estado = 'activa'
   )`
);
// "Hoy" se pide a SQLite (no a `new Date()` de JS) para quedar consistente
// con el resto del esquema, que ya usa date('now') como default de fecha
// en ventas/compras/gastos/etc.
const SQL_HOY = db.prepare("SELECT date('now') AS hoy");

const FECHA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;
function validarFecha(valor) {
  return typeof valor === 'string' && FECHA_VALIDA.test(valor) ? valor : null;
}

const maxISO = (a, b) => (a > b ? a : b);
const minISO = (a, b) => (a < b ? a : b);
// Los componentes de fecha se comparan como strings (maxISO/minISO,
// generarBuckets), lo que solo da el orden cronológico correcto si el año
// está siempre a 4 dígitos — si no, "999" ordena después de "1000" porque
// '9' > '1' en la primera posición.
const anioISO = (y) => String(y).padStart(4, '0');

// {y, m, d} con m 0-indexado (para pasarlo directo a Date.UTC).
function partesISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m: m - 1, d };
}

// Arma una fecha ISO a partir de partes que pueden desbordar (mes 12,
// día 0, día 32...) y deja que el motor de fechas resuelva el corrimiento
// — así no hay que calcular a mano cuántos días tiene cada mes.
// fechaISO(y, m, 0) da el último día del mes anterior a m; fechaISO(y,
// m + 1, 0) da el último día del mes m.
//
// A propósito NO se usa `Date.UTC(y, m, d)` directo: para 0 <= y <= 99,
// Date.UTC (y el constructor de Date) interpreta el año como 1900+y por
// compatibilidad histórica de JS ("año 1" se vuelve 1901). setUTCFullYear
// no tiene esa regla — toma el año tal cual — así que es el único camino
// correcto para fechas de años chicos, que sí pueden aparecer acá vía un
// ?desde= mal tipeado (validarFecha solo exige el formato, no un año
// razonable).
function fechaISO(y, m, d) {
  const dt = new Date(0);
  dt.setUTCFullYear(y, m, d);
  return dt.toISOString().slice(0, 10);
}

function sumarDias(iso, n) {
  const { y, m, d } = partesISO(iso);
  return fechaISO(y, m, d + n);
}

// Inclusivo: diffDias(x, x) === 0.
function diffDias(desde, hasta) {
  const { y: y1, m: m1, d: d1 } = partesISO(desde);
  const { y: y2, m: m2, d: d2 } = partesISO(hasta);
  return Math.round((Date.UTC(y2, m2, d2) - Date.UTC(y1, m1, d1)) / 86400000);
}

function granularidadDe(desde, hasta) {
  const dias = diffDias(desde, hasta) + 1;
  if (dias <= 31) return 'dia';
  if (dias <= 731) return 'mes'; // ~2 años, hasta 25 buckets
  return 'anio';
}

// Genera los períodos de la serie, cada uno recortado contra [desde,
// hasta]: es lo único que garantiza que la suma de la serie sea
// exactamente igual al total del rango pedido — si un bucket usara el mes
// calendario completo, contaría operaciones fuera del rango. `parcial`
// marca los bordes recortados (por ejemplo, el mes en curso).
function generarBuckets(desde, hasta, granularidad) {
  const buckets = [];

  if (granularidad === 'dia') {
    let cursor = desde;
    while (cursor <= hasta && buckets.length < MAX_BUCKETS) {
      const { d, m } = partesISO(cursor);
      buckets.push({
        clave: cursor,
        etiqueta: `${String(d).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}`,
        desde: cursor,
        hasta: cursor,
        parcial: false
      });
      cursor = sumarDias(cursor, 1);
    }
    return buckets;
  }

  if (granularidad === 'mes') {
    let { y, m } = partesISO(desde);
    while (fechaISO(y, m, 1) <= hasta && buckets.length < MAX_BUCKETS) {
      const inicioCal = fechaISO(y, m, 1);
      const finCal = fechaISO(y, m + 1, 0);
      const bDesde = maxISO(inicioCal, desde);
      const bHasta = minISO(finCal, hasta);
      buckets.push({
        clave: `${anioISO(y)}-${String(m + 1).padStart(2, '0')}`,
        etiqueta: `${MESES_CORTOS[m]} ${anioISO(y).slice(-2)}`,
        desde: bDesde,
        hasta: bHasta,
        parcial: bDesde !== inicioCal || bHasta !== finCal
      });
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
    return buckets;
  }

  // 'anio'
  let y = partesISO(desde).y;
  while (anioISO(y) + '-01-01' <= hasta && buckets.length < MAX_BUCKETS) {
    const inicioCal = anioISO(y) + '-01-01';
    const finCal = anioISO(y) + '-12-31';
    const bDesde = maxISO(inicioCal, desde);
    const bHasta = minISO(finCal, hasta);
    buckets.push({
      clave: anioISO(y),
      etiqueta: anioISO(y),
      desde: bDesde,
      hasta: bHasta,
      parcial: bDesde !== inicioCal || bHasta !== finCal
    });
    y += 1;
  }
  return buckets;
}

// El período anterior "natural" al pedido: si es un año calendario
// completo, el año anterior; si es un mes calendario completo, el mes
// calendario anterior (así marzo compara contra el 1-28/29 de febrero, no
// contra "31 días para atrás", que caería a fines de enero); si no,
// desplaza por la duración exacta del rango, contiguo y sin solape.
function periodoAnterior(desde, hasta) {
  const d = partesISO(desde);
  const h = partesISO(hasta);

  if (d.m === 0 && d.d === 1 && h.m === 11 && h.d === 31 && d.y === h.y) {
    return { desde: anioISO(d.y - 1) + '-01-01', hasta: anioISO(d.y - 1) + '-12-31' };
  }

  const finDeEseMes = fechaISO(d.y, d.m + 1, 0);
  if (d.d === 1 && hasta === finDeEseMes) {
    let ay = d.y;
    let am = d.m - 1;
    if (am < 0) {
      am = 11;
      ay -= 1;
    }
    return { desde: fechaISO(ay, am, 1), hasta: fechaISO(ay, am + 1, 0) };
  }

  const n = diffDias(desde, hasta) + 1;
  return { desde: sumarDias(desde, -n), hasta: sumarDias(desde, -1) };
}

// Compara actual contra anterior. El denominador usa el VALOR ABSOLUTO de
// `anterior` a propósito: con el signo puesto, mejorar de -100 a -50 daría
// -50% y se leería como un empeoramiento; en valor absoluto da +50%, y así
// el signo del porcentaje siempre significa "mejoró"/"empeoró", nunca al
// revés. anterior=0 no es divisible: en vez de Infinity/NaN, pct queda en
// null y comparable en false. Cuando el resultado cambia de signo
// (pérdida → ganancia o viceversa) el porcentaje es matemáticamente
// correcto pero engañoso (-1000 → +10 da +101%): cruza_cero avisa para que
// el frontend muestre solo el delta absoluto en ese caso.
function variacion(actual, anterior) {
  const abs = actual - anterior;
  if (anterior === 0) {
    return { abs, pct: null, comparable: false, cruza_cero: false };
  }
  const cruzaCero = Math.sign(actual) !== Math.sign(anterior) && actual !== 0;
  return { abs, pct: (abs / Math.abs(anterior)) * 100, comparable: true, cruza_cero: cruzaCero };
}

app.get('/api/resumen/evolucion', (req, res) => {
  const desdeParam = validarFecha(req.query.desde);
  const hastaParam = validarFecha(req.query.hasta);

  const { primera, ultima } = SQL_LIMITES_OPERACIONES.get();
  const hoy = SQL_HOY.get().hoy;

  // Cuando falta un extremo (el caso por defecto: el filtro del Resumen
  // arranca sin fecha), se acota contra la primera/última operación
  // registrada en vez de dejar el rango abierto — así siempre hay una
  // granularidad concreta que elegir. El extremo alto usa un máximo, no
  // un tope: si hubiera una operación con fecha futura, un tope la dejaría
  // fuera de la serie pero dentro del total (que no tiene límite), y la
  // suma de la serie dejaría de coincidir con el total.
  const desde = desdeParam ?? minISO(primera ?? hoy, hoy);
  const hasta = hastaParam ?? maxISO(ultima ?? hoy, hoy);
  const acotado = Boolean(desdeParam && hastaParam);

  const granularidad = granularidadDe(desde, hasta);
  const buckets = generarBuckets(desde, hasta, granularidad);
  const serie = buckets.map((b) => ({ ...b, ...calcularResultado(b.desde, b.hasta) }));
  const total = calcularResultado(desde, hasta);

  let anterior = null;
  let delta = null;
  // Comparar contra "antes" solo tiene sentido cuando el usuario fijó el
  // inicio del rango a mano: si es abierto, el período anterior sería
  // vacío por construcción (no hay nada antes del comienzo del historial)
  // y mostrar 0 o -100% ahí sería mentir, no informar.
  if (desdeParam) {
    const rangoAnterior = periodoAnterior(desde, hasta);
    const hayOperacionAntes = primera !== null && primera <= rangoAnterior.hasta;
    if (hayOperacionAntes) {
      const resultadoAnterior = calcularResultado(rangoAnterior.desde, rangoAnterior.hasta);
      anterior = { rango: rangoAnterior, ...resultadoAnterior };
      delta = {};
      for (const campo of CAMPOS_RESULTADO) {
        delta[campo] = variacion(total[campo], resultadoAnterior[campo]);
      }
    }
  }

  res.json({ rango: { desde, hasta, acotado }, granularidad, total, serie, anterior, delta });
});

/* ---------- Reportes: qué se vende y a quién (CLAUDE.md §20) ---------- */
//
// Familia de reportes que faltaba (ranking de productos, mejores clientes,
// ticket promedio) y no requiere migrar el esquema: todo sale de
// venta_items, que ya guarda cantidad, precio_unitario y
// costo_unitario_historico. El costo NUNCA se lee de productos.precio_costo
// (el costo de HOY) — mismo criterio no negociable que calcularResultado
// (CLAUDE.md §8: no recalcular rentabilidad histórica con el costo actual).
//
// Los totales de plata (ventas_netas, ganancia_bruta) se calculan
// literalmente llamando a calcularResultado(desde, hasta) — la única
// fuente de verdad de las reglas contables (ver su comentario más
// arriba) — en vez de reimplementar la resta de devoluciones: así este
// endpoint cierra exacto contra GET /api/resumen para el mismo rango por
// construcción, no por casualidad.

const SQL_REPORTE_UNIDADES_VENTAS = db.prepare(
  `SELECT COUNT(DISTINCT ventas.id) AS cantidad_ventas,
          COALESCE(SUM(venta_items.cantidad), 0) AS unidades
     FROM ventas JOIN venta_items ON venta_items.venta_id = ventas.id
    WHERE ventas.estado = 'activa'
      AND (? IS NULL OR ventas.fecha >= ?)
      AND (? IS NULL OR ventas.fecha <= ?)`
);

const SQL_REPORTE_UNIDADES_DEVOLUCIONES = db.prepare(
  `SELECT COALESCE(SUM(devolucion_items.cantidad), 0) AS unidades
     FROM devoluciones JOIN devolucion_items ON devolucion_items.devolucion_id = devoluciones.id
    WHERE devoluciones.estado = 'activa'
      AND (? IS NULL OR devoluciones.fecha >= ?)
      AND (? IS NULL OR devoluciones.fecha <= ?)`
);

const SQL_REPORTE_VENTAS_POR_PRODUCTO = db.prepare(
  `SELECT venta_items.producto_id AS id, productos.nombre AS nombre,
          SUM(venta_items.cantidad) AS unidades,
          SUM(venta_items.cantidad * venta_items.precio_unitario) AS ventas,
          SUM(venta_items.cantidad * venta_items.costo_unitario_historico) AS costo
     FROM venta_items
     JOIN ventas ON ventas.id = venta_items.venta_id
     JOIN productos ON productos.id = venta_items.producto_id
    WHERE ventas.estado = 'activa'
      AND (? IS NULL OR ventas.fecha >= ?)
      AND (? IS NULL OR ventas.fecha <= ?)
    GROUP BY venta_items.producto_id`
);

const SQL_REPORTE_DEVOLUCIONES_POR_PRODUCTO = db.prepare(
  `SELECT devolucion_items.producto_id AS id,
          SUM(devolucion_items.cantidad) AS unidades,
          SUM(devolucion_items.cantidad * devolucion_items.precio_unitario) AS ventas,
          SUM(CASE WHEN devolucion_items.vuelve_stock
                   THEN devolucion_items.cantidad * devolucion_items.costo_unitario_historico
                   ELSE 0 END) AS costo
     FROM devolucion_items
     JOIN devoluciones ON devoluciones.id = devolucion_items.devolucion_id
    WHERE devoluciones.estado = 'activa'
      AND (? IS NULL OR devoluciones.fecha >= ?)
      AND (? IS NULL OR devoluciones.fecha <= ?)
    GROUP BY devolucion_items.producto_id`
);

const SQL_REPORTE_VENTAS_POR_CLIENTE = db.prepare(
  `SELECT ventas.cliente_id AS id, clientes.nombre AS nombre,
          COUNT(DISTINCT ventas.id) AS cantidad_ventas,
          SUM(venta_items.cantidad * venta_items.precio_unitario) AS ventas,
          SUM(venta_items.cantidad * venta_items.costo_unitario_historico) AS costo,
          MAX(ventas.fecha) AS ultima_compra
     FROM venta_items
     JOIN ventas ON ventas.id = venta_items.venta_id
     JOIN clientes ON clientes.id = ventas.cliente_id
    WHERE ventas.estado = 'activa'
      AND (? IS NULL OR ventas.fecha >= ?)
      AND (? IS NULL OR ventas.fecha <= ?)
    GROUP BY ventas.cliente_id`
);

// devolucion_items no guarda cliente_id propio: se atribuye a través de
// devoluciones.venta_id -> ventas.cliente_id, igual que en cuentas
// corrientes se atribuye todo movimiento a través de su operación.
const SQL_REPORTE_DEVOLUCIONES_POR_CLIENTE = db.prepare(
  `SELECT ventas.cliente_id AS id,
          SUM(devolucion_items.cantidad * devolucion_items.precio_unitario) AS ventas,
          SUM(CASE WHEN devolucion_items.vuelve_stock
                   THEN devolucion_items.cantidad * devolucion_items.costo_unitario_historico
                   ELSE 0 END) AS costo
     FROM devolucion_items
     JOIN devoluciones ON devoluciones.id = devolucion_items.devolucion_id
     JOIN ventas ON ventas.id = devoluciones.venta_id
    WHERE devoluciones.estado = 'activa'
      AND (? IS NULL OR devoluciones.fecha >= ?)
      AND (? IS NULL OR devoluciones.fecha <= ?)
    GROUP BY ventas.cliente_id`
);

const redondear2 = (n) => Math.round(n * 100) / 100;
const margenPct = (ganancia, ventas) => (ventas > 0 ? redondear2((ganancia / ventas) * 100) : 0);

// Neteo genérico por id: resta las filas de devoluciones (por producto o
// por cliente, según se llame) contra las filas de venta correspondientes.
// Una entidad que solo tiene devolución en este rango (la venta original
// es de un período anterior, pero se devolvió dentro de este) entra con
// base en cero para que el neto —negativo— no se pierda del reporte:
// mismo criterio que calcularResultado, la devolución pesa en el período
// en que se hizo, no en el de la venta.
function netearPorId(filasVentas, filasDevoluciones, resolverNombre) {
  const porId = new Map(filasVentas.map((f) => [f.id, { ...f }]));
  for (const dev of filasDevoluciones) {
    let fila = porId.get(dev.id);
    if (!fila) {
      fila = {
        id: dev.id,
        nombre: resolverNombre(dev.id),
        unidades: 0,
        cantidad_ventas: 0,
        ventas: 0,
        costo: 0,
        ultima_compra: null
      };
      porId.set(dev.id, fila);
    }
    fila.unidades = (fila.unidades ?? 0) - (dev.unidades ?? 0);
    fila.ventas -= dev.ventas;
    fila.costo -= dev.costo;
  }
  return [...porId.values()];
}

app.get('/api/reportes/ventas', (req, res) => {
  const desdeParam = validarFecha(req.query.desde);
  const hastaParam = validarFecha(req.query.hasta);

  // Mismo tratamiento de rango abierto que /api/resumen/evolucion: sin
  // desde/hasta, se acota contra la primera/última operación registrada.
  const { primera, ultima } = SQL_LIMITES_OPERACIONES.get();
  const hoy = SQL_HOY.get().hoy;
  const desde = desdeParam ?? minISO(primera ?? hoy, hoy);
  const hasta = hastaParam ?? maxISO(ultima ?? hoy, hoy);
  const acotado = Boolean(desdeParam && hastaParam);
  const rango = [desde, desde, hasta, hasta];

  const resultado = calcularResultado(desde, hasta);
  const ventasUnid = SQL_REPORTE_UNIDADES_VENTAS.get(...rango);
  const devolucionesUnid = SQL_REPORTE_UNIDADES_DEVOLUCIONES.get(...rango);
  const cantidadVentas = ventasUnid.cantidad_ventas;

  const buscarNombreProducto = db.prepare('SELECT nombre FROM productos WHERE id = ?');
  const buscarNombreCliente = db.prepare('SELECT nombre FROM clientes WHERE id = ?');

  const productos = netearPorId(
    SQL_REPORTE_VENTAS_POR_PRODUCTO.all(...rango),
    SQL_REPORTE_DEVOLUCIONES_POR_PRODUCTO.all(...rango),
    (id) => buscarNombreProducto.get(id)?.nombre ?? '(producto eliminado)'
  )
    .map((p) => {
      const ganancia = redondear2(p.ventas - p.costo);
      return {
        id: p.id,
        nombre: p.nombre,
        unidades: p.unidades,
        ventas: redondear2(p.ventas),
        costo: redondear2(p.costo),
        ganancia,
        margen_pct: margenPct(ganancia, p.ventas),
        participacion_pct: resultado.ventas > 0 ? redondear2((p.ventas / resultado.ventas) * 100) : 0
      };
    })
    .sort((a, b) => b.ventas - a.ventas);

  const clientes = netearPorId(
    SQL_REPORTE_VENTAS_POR_CLIENTE.all(...rango),
    SQL_REPORTE_DEVOLUCIONES_POR_CLIENTE.all(...rango),
    (id) => buscarNombreCliente.get(id)?.nombre ?? '(cliente eliminado)'
  )
    .map((c) => {
      const ganancia = redondear2(c.ventas - c.costo);
      return {
        id: c.id,
        nombre: c.nombre,
        cantidad_ventas: c.cantidad_ventas ?? 0,
        ventas: redondear2(c.ventas),
        ganancia,
        margen_pct: margenPct(ganancia, c.ventas),
        ticket_promedio: c.cantidad_ventas > 0 ? redondear2(c.ventas / c.cantidad_ventas) : 0,
        ultima_compra: c.ultima_compra
      };
    })
    .sort((a, b) => b.ventas - a.ventas);

  res.json({
    rango: { desde, hasta, acotado },
    totales: {
      ventas_netas: resultado.ventas,
      cantidad_ventas: cantidadVentas,
      ticket_promedio: cantidadVentas > 0 ? redondear2(resultado.ventas / cantidadVentas) : 0,
      unidades: ventasUnid.unidades - devolucionesUnid.unidades,
      ganancia_bruta: resultado.ganancia_bruta,
      margen_pct: margenPct(resultado.ganancia_bruta, resultado.ventas)
    },
    productos,
    clientes
  });
});

/* ---------- Reportes: stock (qué reponer, valorizado, rotación) ---------- */
//
// "Valorizado" y "qué reponer" ya existían por producto (decorarProducto,
// estadoStock, más abajo en la sección Productos) — lo que faltaba era el
// agregado (total del inventario, cuántos productos hay que reponer) y la
// rotación, que no existía en ningún lado. Reusa las mismas consultas de
// ventas/devoluciones por producto que /api/reportes/ventas (mismo
// neteo, mismo criterio) para no duplicar "cuánto se vendió de cada
// producto en el rango".
//
// Rotación = días de inventario: al ritmo de venta del período, cuántos
// días dura el stock actual — stock / (unidades_netas / días_del_período).
// Sin ventas netas positivas en el rango no hay ritmo con el que dividir,
// así que queda null (no "infinito" ni 0, que mentirían para los dos
// lados); el frontend lo muestra como "—". Con stock en 0 el resultado es
// 0 días sin importar el ritmo: no queda nada, sea cual sea el consumo.

app.get('/api/reportes/stock', (req, res) => {
  const desdeParam = validarFecha(req.query.desde);
  const hastaParam = validarFecha(req.query.hasta);

  const { primera, ultima } = SQL_LIMITES_OPERACIONES.get();
  const hoy = SQL_HOY.get().hoy;
  const desde = desdeParam ?? minISO(primera ?? hoy, hoy);
  const hasta = hastaParam ?? maxISO(ultima ?? hoy, hoy);
  const acotado = Boolean(desdeParam && hastaParam);
  const rango = [desde, desde, hasta, hasta];
  const diasPeriodo = diffDias(desde, hasta) + 1;

  const unidadesNetasPorProducto = new Map(
    netearPorId(
      SQL_REPORTE_VENTAS_POR_PRODUCTO.all(...rango),
      SQL_REPORTE_DEVOLUCIONES_POR_PRODUCTO.all(...rango),
      () => null
    ).map((fila) => [fila.id, fila.unidades])
  );

  const productosBase = db.prepare(`${SELECT_PRODUCTO} ORDER BY productos.nombre`).all().map(decorarProducto);

  const productos = productosBase
    .map((p) => {
      const unidadesVendidas = unidadesNetasPorProducto.get(p.id) ?? 0;
      const ritmoDiario = unidadesVendidas / diasPeriodo;
      const diasInventario = p.stock <= 0 ? 0 : ritmoDiario > 0 ? Math.round(p.stock / ritmoDiario) : null;
      return {
        id: p.id,
        nombre: p.nombre,
        stock: p.stock,
        precio_costo: p.precio_costo,
        valorizado: redondear2(p.valorizado),
        estado_stock: p.estado_stock,
        unidades_vendidas: unidadesVendidas,
        dias_inventario: diasInventario
      };
    })
    .sort((a, b) => {
      // Sin ventas en el rango (null) queda al final: no es "no urgente",
      // es "no se puede estimar" — mezclarlo con los calculables mentiría.
      if (a.dias_inventario === null && b.dias_inventario === null) return a.nombre.localeCompare(b.nombre, 'es');
      if (a.dias_inventario === null) return 1;
      if (b.dias_inventario === null) return -1;
      return a.dias_inventario - b.dias_inventario;
    });

  const resumen = {
    total_valorizado: redondear2(productosBase.reduce((acc, p) => acc + p.valorizado, 0)),
    cantidad_productos: productosBase.length,
    cantidad_sin_stock: productosBase.filter((p) => p.estado_stock === 'sin_stock').length,
    cantidad_bajo: productosBase.filter((p) => p.estado_stock === 'bajo').length,
    cantidad_alto: productosBase.filter((p) => p.estado_stock === 'alto').length
  };

  res.json({ rango: { desde, hasta, acotado }, resumen, productos });
});

/* ---------- Asistente (operaciones por texto) ---------- */
//
// CLAUDE.md §21: la IA interpreta, pero NUNCA escribe en la base — el
// circuito tiene dos pasos separados a propósito:
//
//   POST /api/asistente/interpretar → de solo lectura. Le pasa el texto y
//   el contexto del negocio al intérprete (backend/interprete.js, el único
//   archivo que sabe que existe un proveedor de IA) y devuelve una
//   propuesta con cada nombre ya resuelto (o no) contra la base real.
//
//   POST /api/asistente/ejecutar → recibe la propuesta que el usuario
//   confirmó (ya corregida si hizo falta) y NO le cree ciegamente: vuelve
//   a validar todo con las mismas funciones que usan los endpoints
//   normales (validarStockDisponible, validarGasto, crearVenta,
//   crearCompra...) antes de ejecutar, todo en una sola transacción. Una
//   propuesta manipulada no puede saltearse ninguna regla de negocio.
//
// Cada mensaje interpretado queda en asistente_mensajes (schema.sql), que
// es a la vez la entidad "Mensaje/Confirmación" de §21 y el registro de
// auditoría de esta puerta de entrada (§22).

// Busca `nombre` en `tabla` (nombre de tabla fijo, siempre uno de los
// strings de abajo — nunca viene del usuario) por coincidencia exacta
// primero y aproximada después. Devuelve el ESTADO de la resolución, no
// solo el resultado: la UI necesita distinguir "no existe" de "hay varios
// que matchean" para poder pedirle al usuario que elija.
function buscarPorNombre(tabla, nombreCrudo) {
  const nombre = nombreCrudo === undefined || nombreCrudo === null ? '' : String(nombreCrudo).trim();
  if (!nombre) {
    return { estado: 'no_dado', valor: nombreCrudo ?? null, id: null, nombre_resuelto: null, candidatos: [] };
  }
  const exactos = db.prepare(`SELECT id, nombre FROM ${tabla} WHERE nombre = ? COLLATE NOCASE`).all(nombre);
  if (exactos.length === 1) {
    return { estado: 'resuelto', valor: nombre, id: exactos[0].id, nombre_resuelto: exactos[0].nombre, candidatos: [] };
  }
  if (exactos.length > 1) {
    return { estado: 'ambiguo', valor: nombre, id: null, nombre_resuelto: null, candidatos: exactos };
  }
  const parciales = db.prepare(`SELECT id, nombre FROM ${tabla} WHERE nombre LIKE ? COLLATE NOCASE`).all(`%${nombre}%`);
  if (parciales.length === 1) {
    return { estado: 'resuelto', valor: nombre, id: parciales[0].id, nombre_resuelto: parciales[0].nombre, candidatos: [] };
  }
  if (parciales.length > 1) {
    return { estado: 'ambiguo', valor: nombre, id: null, nombre_resuelto: null, candidatos: parciales };
  }
  return { estado: 'no_encontrado', valor: nombre, id: null, nombre_resuelto: null, candidatos: [] };
}

function existeId(tabla, id) {
  if (id === null || id === undefined || id === '') return false;
  return Boolean(db.prepare(`SELECT 1 FROM ${tabla} WHERE id = ?`).get(Number(id)));
}

// Convierte la propuesta cruda del intérprete (solo nombres, ver
// interprete.js) en una propuesta resuelta contra la base real: cada
// referencia queda marcada resuelta/ambigua/no encontrada/no dada, y se
// arma `problemas` con lo que bloquea la ejecución. Cliente (venta) y
// proveedor/producto (compra) pueden ser "nuevos" — igual que el
// formulario manual, esos SÍ se crean por nombre. Producto en una venta y
// categoría/cuenta en un gasto NO se crean solos: si no existen, bloquea.
function resolverPropuesta(tipo, datos) {
  const problemas = [];

  if (tipo === 'venta') {
    const cliente = buscarPorNombre('clientes', datos.cliente);
    if (cliente.estado === 'no_dado') problemas.push('Falta el nombre del cliente.');
    if (cliente.estado === 'ambiguo') problemas.push(`Hay más de un cliente que coincide con "${cliente.valor}".`);

    const items = (Array.isArray(datos.items) ? datos.items : []).map((item) => {
      const producto = buscarPorNombre('productos', item.producto);
      if (producto.estado === 'no_dado' || producto.estado === 'no_encontrado') {
        problemas.push(
          `El producto "${item.producto ?? '(sin nombre)'}" no existe en el catálogo. Cargalo primero o corregí el nombre.`
        );
      }
      if (producto.estado === 'ambiguo') {
        problemas.push(`Hay más de un producto que coincide con "${item.producto}".`);
      }
      if (!(Number(item.cantidad) > 0)) problemas.push(`La cantidad de "${item.producto ?? '?'}" tiene que ser mayor a 0.`);
      if (!(Number(item.precio_unitario) >= 0)) problemas.push(`El precio de "${item.producto ?? '?'}" no puede ser negativo.`);
      return { producto, cantidad: item.cantidad, precio_unitario: item.precio_unitario };
    });
    if (items.length === 0) problemas.push('La venta necesita al menos un producto.');

    let cobro = null;
    if (datos.cobro) {
      const cuenta = buscarPorNombre('cuentas_tesoreria', datos.cobro.cuenta);
      if (cuenta.estado !== 'resuelto') {
        problemas.push(`No encontré la cuenta de tesorería "${datos.cobro.cuenta ?? '?'}" para el cobro.`);
      }
      cobro = { cuenta, importe: datos.cobro.importe ?? null };
    }

    return { cliente, items, cobro, fecha: datos.fecha ?? null, ejecutable: problemas.length === 0, problemas };
  }

  if (tipo === 'compra') {
    const proveedor = buscarPorNombre('proveedores', datos.proveedor);
    if (proveedor.estado === 'no_dado') problemas.push('Falta el nombre del proveedor.');
    if (proveedor.estado === 'ambiguo') problemas.push(`Hay más de un proveedor que coincide con "${proveedor.valor}".`);

    const items = (Array.isArray(datos.items) ? datos.items : []).map((item) => {
      const producto = buscarPorNombre('productos', item.producto);
      // Acá "no encontrado" no bloquea: la compra da de alta el producto
      // nuevo por nombre, es lo que le fija el costo inicial (CLAUDE.md §6).
      if (producto.estado === 'ambiguo') {
        problemas.push(`Hay más de un producto que coincide con "${item.producto}".`);
      }
      if (!item.producto || !String(item.producto).trim()) problemas.push('Todos los items necesitan un producto.');
      if (!(Number(item.cantidad) > 0)) problemas.push(`La cantidad de "${item.producto ?? '?'}" tiene que ser mayor a 0.`);
      if (!(Number(item.precio_unitario) >= 0)) problemas.push(`El costo de "${item.producto ?? '?'}" no puede ser negativo.`);
      return { producto, cantidad: item.cantidad, precio_unitario: item.precio_unitario };
    });
    if (items.length === 0) problemas.push('La compra necesita al menos un item.');

    const costoEnvio = normalizarPrecio(datos.costo_envio);
    if (Number.isNaN(costoEnvio) || costoEnvio < 0) problemas.push('El costo de envío no puede ser negativo.');

    return {
      proveedor,
      items,
      costo_envio: costoEnvio,
      fecha: datos.fecha ?? null,
      ejecutable: problemas.length === 0,
      problemas
    };
  }

  if (tipo === 'gasto') {
    const categoria = buscarPorNombre('categorias_gasto', datos.categoria);
    if (categoria.estado !== 'resuelto') {
      problemas.push(`No encontré la categoría de gasto "${datos.categoria ?? '?'}" (las categorías no se crean solas).`);
    }
    const cuenta = buscarPorNombre('cuentas_tesoreria', datos.cuenta);
    if (cuenta.estado !== 'resuelto') {
      problemas.push(`No encontré la cuenta de tesorería "${datos.cuenta ?? '?'}".`);
    }
    // El proveedor de un gasto es opcional y tampoco se crea por nombre
    // (validarGasto exige un proveedor_id existente): si no matchea, el
    // gasto se puede confirmar igual sin proveedor, no bloquea.
    const proveedor = datos.proveedor ? buscarPorNombre('proveedores', datos.proveedor) : null;
    if (proveedor && proveedor.estado === 'ambiguo') {
      problemas.push(`Hay más de un proveedor que coincide con "${proveedor.valor}"; se puede confirmar sin proveedor.`);
    }
    if (!(Number(datos.importe) > 0)) problemas.push('El importe del gasto tiene que ser mayor a 0.');

    return {
      categoria,
      cuenta,
      proveedor,
      importe: datos.importe,
      tipo: datos.tipo === 'heredar_de_categoria' ? null : datos.tipo,
      descripcion: datos.descripcion ?? null,
      fecha: datos.fecha ?? null,
      ejecutable: problemas.length === 0,
      problemas
    };
  }

  return { ejecutable: false, problemas: ['Tipo de operación desconocido.'] };
}

function contextoParaInterprete() {
  return {
    cuentas: db.prepare('SELECT nombre, tipo FROM cuentas_tesoreria ORDER BY nombre').all(),
    categoriasGasto: db.prepare('SELECT nombre, tipo FROM categorias_gasto WHERE activa = 1 ORDER BY nombre').all(),
    productos: db.prepare('SELECT nombre FROM productos WHERE activo = 1 ORDER BY nombre').all()
  };
}

app.post('/api/asistente/interpretar', async (req, res) => {
  const { texto } = req.body;

  let resultado;
  try {
    resultado = await interpretar(texto, contextoParaInterprete());
  } catch (err) {
    if (err instanceof InterpreteError) {
      return res.status(err.status).json({ error: err.message });
    }
    throw err;
  }

  if (!resultado.tipo) {
    return res.json({
      mensaje_id: null,
      tipo: null,
      mensaje: resultado.mensaje,
      propuesta: null,
      ejecutable: false,
      problemas: []
    });
  }

  const propuesta = resolverPropuesta(resultado.tipo, resultado.datos);

  const { lastInsertRowid: mensajeId } = db
    .prepare(
      "INSERT INTO asistente_mensajes (texto, propuesta_json, estado, operacion_tipo) VALUES (?, ?, 'interpretado', ?)"
    )
    .run(texto, JSON.stringify(propuesta), resultado.tipo);

  res.json({
    mensaje_id: Number(mensajeId),
    tipo: resultado.tipo,
    mensaje: null,
    propuesta,
    ejecutable: propuesta.ejecutable,
    problemas: propuesta.problemas
  });
});

app.post('/api/asistente/:id/descartar', (req, res) => {
  const mensajeId = Number(req.params.id);
  const { changes } = db
    .prepare("UPDATE asistente_mensajes SET estado = 'descartado' WHERE id = ? AND estado = 'interpretado'")
    .run(mensajeId);
  if (changes === 0) {
    return res.status(404).json({ error: 'Este mensaje no existe o ya fue procesado.' });
  }
  res.json({ id: mensajeId, estado: 'descartado' });
});

// Ejecuta una propuesta ya confirmada (y eventualmente corregida) por el
// usuario. `propuesta` tiene que tener la MISMA forma que devolvió
// /interpretar (ver resolverPropuesta) — este endpoint no vuelve a
// resolver nombres (el usuario ya desambiguó lo que hacía falta), pero sí
// vuelve a verificar que cada id referenciado exista de verdad antes de
// usarlo, y corre las mismas validaciones de negocio que los endpoints
// manuales. Todo dentro de una única transacción (CLAUDE.md §23).
app.post('/api/asistente/ejecutar', (req, res) => {
  const { mensaje_id: mensajeId, tipo, propuesta } = req.body;

  const mensaje = db
    .prepare("SELECT id FROM asistente_mensajes WHERE id = ? AND estado = 'interpretado'")
    .get(Number(mensajeId));
  if (!mensaje) {
    return res.status(404).json({ error: 'Este mensaje no existe o ya fue procesado.' });
  }

  const marcarFallido = (error) => {
    db.prepare("UPDATE asistente_mensajes SET estado = 'fallido', error = ? WHERE id = ?").run(
      String(error),
      mensaje.id
    );
  };
  const marcarConfirmado = (operacionId) => {
    db.prepare(
      "UPDATE asistente_mensajes SET estado = 'confirmado', operacion_id = ?, propuesta_json = ? WHERE id = ?"
    ).run(operacionId, JSON.stringify(propuesta), mensaje.id);
  };

  if (tipo === 'venta') {
    if (!Array.isArray(propuesta?.items) || propuesta.items.length === 0) {
      return res.status(400).json({ error: 'La venta necesita al menos un item.' });
    }
    const items = [];
    for (const item of propuesta.items) {
      if (!existeId('productos', item.producto?.id)) {
        marcarFallido(`Producto inválido: "${item.producto?.valor ?? '?'}".`);
        return res.status(400).json({ error: `El producto "${item.producto?.valor ?? '?'}" no existe.` });
      }
      if (!(Number(item.cantidad) > 0) || !(Number(item.precio_unitario) >= 0)) {
        return res.status(400).json({ error: 'Cantidad y precio de cada item tienen que ser válidos.' });
      }
      items.push({
        producto_id: Number(item.producto.id),
        cantidad: Number(item.cantidad),
        precio_unitario: Number(item.precio_unitario)
      });
    }

    const clienteId = existeId('clientes', propuesta.cliente?.id) ? Number(propuesta.cliente.id) : null;
    const clienteNombre = propuesta.cliente?.nombre_resuelto || propuesta.cliente?.valor || null;
    if (!clienteId && (!clienteNombre || !clienteNombre.trim())) {
      return res.status(400).json({ error: 'La venta necesita un cliente.' });
    }

    const errorStock = validarStockDisponible(items);
    if (errorStock) {
      return res.status(400).json({ error: errorStock });
    }

    const total = items.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0);
    let cuentaCobroId = null;
    let importeCobro = null;
    if (propuesta.cobro) {
      if (!existeId('cuentas_tesoreria', propuesta.cobro.cuenta?.id)) {
        return res.status(400).json({ error: 'La cuenta de tesorería del cobro no existe.' });
      }
      cuentaCobroId = Number(propuesta.cobro.cuenta.id);
      importeCobro = propuesta.cobro.importe ?? total;
      if (!(importeCobro > 0)) {
        return res.status(400).json({ error: 'El importe del cobro tiene que ser mayor a 0.' });
      }
      if (importeCobro > total) {
        return res
          .status(400)
          .json({ error: `El cobro (${importeCobro}) supera el total de la venta (${total.toFixed(2)}).` });
      }
    }

    let ventaId;
    try {
      ventaId = withTransaction(() => {
        const nuevaVentaId = crearVenta({
          cliente: clienteNombre,
          cliente_id: clienteId,
          items,
          fecha: propuesta.fecha
        });
        if (cuentaCobroId) {
          const { cliente_id: clienteIdCreado } = db
            .prepare('SELECT cliente_id FROM ventas WHERE id = ?')
            .get(nuevaVentaId);
          registrarCobro(nuevaVentaId, clienteIdCreado, importeCobro, cuentaCobroId, 'Cargado por el asistente');
        }
        return nuevaVentaId;
      });
    } catch (err) {
      marcarFallido(err.message);
      return res.status(500).json({ error: 'No se pudo registrar la venta.' });
    }

    marcarConfirmado(ventaId);
    return res.status(201).json({ id: ventaId, tipo: 'venta' });
  }

  if (tipo === 'compra') {
    if (!Array.isArray(propuesta?.items) || propuesta.items.length === 0) {
      return res.status(400).json({ error: 'La compra necesita al menos un item.' });
    }
    const proveedorNombre = propuesta.proveedor?.nombre_resuelto || propuesta.proveedor?.valor;
    if (!proveedorNombre || !proveedorNombre.trim()) {
      return res.status(400).json({ error: 'La compra necesita un proveedor.' });
    }
    const items = [];
    for (const item of propuesta.items) {
      const productoNombre = item.producto?.nombre_resuelto || item.producto?.valor;
      if (!productoNombre || !productoNombre.trim()) {
        return res.status(400).json({ error: 'Todos los items necesitan un producto.' });
      }
      if (!(Number(item.cantidad) > 0) || !(Number(item.precio_unitario) >= 0)) {
        return res.status(400).json({ error: 'Cantidad y costo de cada item tienen que ser válidos.' });
      }
      items.push({ producto: productoNombre, cantidad: Number(item.cantidad), precio_unitario: Number(item.precio_unitario) });
    }
    const costoEnvio = normalizarPrecio(propuesta.costo_envio);
    if (Number.isNaN(costoEnvio) || costoEnvio < 0) {
      return res.status(400).json({ error: 'El costo de envío debe ser un número mayor o igual a 0.' });
    }

    let compraId;
    try {
      compraId = withTransaction(() => {
        const nuevaCompraId = crearCompra({ proveedor: proveedorNombre, items, costoEnvio, fecha: propuesta.fecha });
        confirmarCompra(nuevaCompraId);
        aplicarStockCompra(nuevaCompraId);
        return nuevaCompraId;
      });
    } catch (err) {
      marcarFallido(err.message);
      return res.status(500).json({ error: 'No se pudo registrar la compra.' });
    }

    marcarConfirmado(compraId);
    return res.status(201).json({ id: compraId, tipo: 'compra' });
  }

  if (tipo === 'gasto') {
    if (!existeId('categorias_gasto', propuesta?.categoria?.id)) {
      return res.status(400).json({ error: 'La categoría del gasto no existe.' });
    }
    if (!existeId('cuentas_tesoreria', propuesta?.cuenta?.id)) {
      return res.status(400).json({ error: 'La cuenta de tesorería del gasto no existe.' });
    }
    const proveedorId = existeId('proveedores', propuesta?.proveedor?.id) ? Number(propuesta.proveedor.id) : null;

    const validacion = validarGasto({
      categoria_id: propuesta.categoria.id,
      cuenta_tesoreria_id: propuesta.cuenta.id,
      proveedor_id: proveedorId,
      importe: propuesta.importe,
      tipo: propuesta.tipo
    });
    if (validacion.error) {
      return res.status(400).json({ error: validacion.error });
    }
    const { categoriaId, cuentaId, proveedorId: proveedorIdValidado, monto, tipo: tipoValidado } = validacion;

    let gastoId;
    try {
      gastoId = withTransaction(() =>
        crearGasto({
          categoriaId,
          cuentaId,
          proveedorId: proveedorIdValidado,
          monto,
          tipo: tipoValidado,
          fecha: propuesta.fecha,
          descripcion: propuesta.descripcion,
          comprobante: null
        })
      );
    } catch (err) {
      marcarFallido(err.message);
      return res.status(500).json({ error: 'No se pudo registrar el gasto.' });
    }

    marcarConfirmado(gastoId);
    return res.status(201).json({ id: gastoId, tipo: 'gasto' });
  }

  return res.status(400).json({ error: 'Tipo de operación desconocido.' });
});

app.listen(PORT, () => {
  console.log(`Nexo backend escuchando en http://localhost:${PORT}`);
});
