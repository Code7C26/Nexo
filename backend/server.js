import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db, { withTransaction } from './db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

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

/* ---------- Productos ---------- */

app.get('/api/productos', (req, res) => {
  const productos = db
    .prepare(
      `SELECT productos.id, productos.nombre, productos.sku, productos.precio_costo,
              productos.precio_venta, productos.activo,
              COALESCE(stock_actual.cantidad, 0) AS stock
       FROM productos
       LEFT JOIN stock_actual ON stock_actual.producto_id = productos.id
       ORDER BY productos.nombre`
    )
    .all();
  res.json(productos);
});

/* ---------- Proveedores ---------- */

app.get('/api/proveedores', (req, res) => {
  const proveedores = db.prepare('SELECT * FROM proveedores ORDER BY nombre').all();
  res.json(proveedores);
});

app.post('/api/proveedores', (req, res) => {
  const { nombre, email, telefono } = req.body;
  const { lastInsertRowid } = db
    .prepare('INSERT INTO proveedores (nombre, email, telefono) VALUES (?, ?, ?)')
    .run(nombre, email ?? null, telefono ?? null);
  res.status(201).json({ id: lastInsertRowid });
});

/* ---------- Stock ---------- */

app.get('/api/stock', (req, res) => {
  const stock = db
    .prepare(
      `SELECT productos.id, productos.nombre, productos.precio_costo, productos.precio_venta,
              COALESCE(stock_actual.cantidad, 0) AS stock
       FROM productos
       LEFT JOIN stock_actual ON stock_actual.producto_id = productos.id
       ORDER BY productos.nombre`
    )
    .all();
  res.json(stock);
});

app.post('/api/stock/ajuste', (req, res) => {
  const { producto_id, cantidad, nota } = req.body;
  const { lastInsertRowid } = db
    .prepare(
      "INSERT INTO movimientos_stock (producto_id, tipo, cantidad, origen, nota) VALUES (?, 'ajuste', ?, 'ajuste_manual', ?)"
    )
    .run(producto_id, cantidad, nota ?? null);
  res.status(201).json({ id: lastInsertRowid });
});

/* ---------- Ventas ---------- */

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
              EXISTS (SELECT 1 FROM facturas WHERE facturas.venta_id = ventas.id) AS facturada
       FROM ventas
       JOIN clientes ON clientes.id = ventas.cliente_id
       ORDER BY ventas.id DESC`
    )
    .all();
  res.json(
    ventas.map((v) => ({
      ...v,
      costo_total: v.total - v.margen,
      facturada: Boolean(v.facturada),
      estado_cobro: v.cobrado <= 0 ? 'pendiente' : v.cobrado >= v.total ? 'cobrado' : 'parcial'
    }))
  );
});

app.post('/api/ventas', (req, res) => {
  const { cliente, cliente_id, items, fecha } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'La venta necesita al menos un item.' });
  }

  // No se puede vender más de lo que hay: se valida antes de tocar nada,
  // así una venta que falla no deja nada a mitad de camino. Se suman las
  // cantidades por producto primero, por si el mismo producto aparece en
  // más de un renglón de la venta.
  const buscarStockDisponible = db.prepare(
    `SELECT productos.nombre, COALESCE(stock_actual.cantidad, 0) AS stock
     FROM productos LEFT JOIN stock_actual ON stock_actual.producto_id = productos.id
     WHERE productos.id = ?`
  );
  const cantidadPorProducto = new Map();
  for (const item of items) {
    cantidadPorProducto.set(
      item.producto_id,
      (cantidadPorProducto.get(item.producto_id) ?? 0) + item.cantidad
    );
  }
  for (const [producto_id, cantidadPedida] of cantidadPorProducto) {
    const producto = buscarStockDisponible.get(producto_id);
    if (!producto) {
      return res.status(400).json({ error: 'Uno de los productos de la venta no existe.' });
    }
    if (cantidadPedida > producto.stock) {
      return res.status(400).json({
        error: `No hay suficiente stock de "${producto.nombre}" (disponible: ${producto.stock}).`
      });
    }
  }

  const ventaId = withTransaction(() => {
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
  });

  res.status(201).json({ id: ventaId });
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
              (SELECT COALESCE(SUM(importe), 0) FROM cobros WHERE venta_id = ventas.id) AS cobrado
       FROM ventas WHERE ventas.id = ?`
    )
    .get(ventaId);
  if (!venta) {
    return res.status(404).json({ error: 'Venta no encontrada.' });
  }

  const saldoPendiente = venta.total - venta.cobrado;
  if (!(importe > 0)) {
    return res.status(400).json({ error: 'El importe del cobro tiene que ser mayor a 0.' });
  }
  if (importe > saldoPendiente) {
    return res.status(400).json({
      error: `El importe supera el saldo pendiente de la venta (${saldoPendiente.toFixed(2)}).`
    });
  }

  const cobroId = withTransaction(() => {
    const { lastInsertRowid: nuevoCobroId } = db
      .prepare('INSERT INTO cobros (venta_id, importe, cuenta_tesoreria_id, nota) VALUES (?, ?, ?, ?)')
      .run(ventaId, importe, cuenta_tesoreria_id, nota ?? null);

    db.prepare(
      "INSERT INTO movimientos_tesoreria (cuenta_tesoreria_id, tipo, importe, cobro_id) VALUES (?, 'ingreso', ?, ?)"
    ).run(cuenta_tesoreria_id, importe, nuevoCobroId);

    db.prepare(
      "INSERT INTO movimientos_cc_clientes (cliente_id, tipo, importe, venta_id, cobro_id) VALUES (?, 'cobro', ?, ?, ?)"
    ).run(venta.cliente_id, -importe, ventaId, nuevoCobroId);

    return nuevoCobroId;
  });

  res.status(201).json({ id: cobroId });
});

app.post('/api/ventas/:id/facturar', (req, res) => {
  const ventaId = Number(req.params.id);
  const { condicion } = req.body;

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

      const { lastInsertRowid } = db
        .prepare(
          'INSERT INTO facturas (cliente_id, concepto, neto, condicion, estado, venta_id) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(venta.cliente_id, `Venta #${ventaId}`, total, condicion, 'pendiente', ventaId);

      return lastInsertRowid;
    });
  } catch (err) {
    // Última línea de defensa contra dos facturaciones simultáneas de la
    // misma venta: el chequeo de arriba no es atómico, el índice único sí.
    if (String(err.message).includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Esta venta ya tiene una factura asociada.' });
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

/* ---------- Compras ---------- */

app.get('/api/compras', (req, res) => {
  const compras = db
    .prepare(
      `SELECT compras.id, compras.proveedor_id, proveedores.nombre AS proveedor, compras.fecha,
              compras.estado, compras.estado_envio,
              (SELECT COALESCE(SUM(cantidad * precio_unitario), 0)
                 FROM compra_items WHERE compra_items.compra_id = compras.id) AS total,
              (SELECT COALESCE(SUM(importe), 0)
                 FROM pagos WHERE pagos.compra_id = compras.id) AS pagado
       FROM compras
       JOIN proveedores ON proveedores.id = compras.proveedor_id
       ORDER BY compras.id DESC`
    )
    .all();
  res.json(
    compras.map((c) => ({
      ...c,
      estado_pago: c.pagado <= 0 ? 'pendiente' : c.pagado >= c.total ? 'pagado' : 'parcial'
    }))
  );
});

app.post('/api/compras', (req, res) => {
  const { proveedor, items, fecha, estado_envio } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'La compra necesita al menos un item.' });
  }

  const compraId = withTransaction(() => {
    let proveedorRow = db.prepare('SELECT id FROM proveedores WHERE nombre = ?').get(proveedor);
    if (!proveedorRow) {
      const { lastInsertRowid } = db
        .prepare('INSERT INTO proveedores (nombre) VALUES (?)')
        .run(proveedor);
      proveedorRow = { id: lastInsertRowid };
    }

    // Columnas opcionales: se arman a mano para que, si no vienen, apliquen
    // los DEFAULT de la tabla (fecha de hoy, estado_envio 'recibido') en
    // vez de pisarlos con un valor calculado en JS.
    const columnas = ['proveedor_id'];
    const valores = [proveedorRow.id];
    if (fecha) {
      columnas.push('fecha');
      valores.push(fecha);
    }
    if (estado_envio) {
      columnas.push('estado_envio');
      valores.push(estado_envio);
    }
    const { lastInsertRowid: nuevaCompraId } = db
      .prepare(
        `INSERT INTO compras (${columnas.join(', ')}) VALUES (${columnas.map(() => '?').join(', ')})`
      )
      .run(...valores);

    const buscarProducto = db.prepare('SELECT id, precio_costo FROM productos WHERE nombre = ?');
    const crearProducto = db.prepare(
      'INSERT INTO productos (nombre, precio_costo, precio_venta) VALUES (?, ?, 0)'
    );
    const buscarStockActual = db.prepare(
      'SELECT cantidad FROM stock_actual WHERE producto_id = ?'
    );
    const actualizarPrecioCosto = db.prepare('UPDATE productos SET precio_costo = ? WHERE id = ?');
    const insertItem = db.prepare(
      'INSERT INTO compra_items (compra_id, producto_id, cantidad, precio_unitario) VALUES (?, ?, ?, ?)'
    );
    const insertMovimiento = db.prepare(
      "INSERT INTO movimientos_stock (producto_id, tipo, cantidad, origen, compra_id) VALUES (?, 'entrada', ?, 'compra', ?)"
    );

    let total = 0;
    for (const item of items) {
      let productoRow = buscarProducto.get(item.producto);
      if (!productoRow) {
        const { lastInsertRowid } = crearProducto.run(item.producto, item.precio_unitario);
        productoRow = { id: lastInsertRowid };
      } else {
        // Costo promedio ponderado: el costo nuevo mezcla el stock que ya
        // tenías (a su costo anterior) con lo que estás comprando ahora,
        // pesado por cantidad. Si no había stock previo, da exactamente el
        // precio de esta compra (no hace falta un caso especial aparte).
        const stockPrevio = buscarStockActual.get(productoRow.id)?.cantidad ?? 0;
        const costoPromedioNuevo =
          (stockPrevio * productoRow.precio_costo + item.cantidad * item.precio_unitario) /
          (stockPrevio + item.cantidad);
        actualizarPrecioCosto.run(costoPromedioNuevo, productoRow.id);
      }

      insertItem.run(nuevaCompraId, productoRow.id, item.cantidad, item.precio_unitario);
      insertMovimiento.run(productoRow.id, item.cantidad, nuevaCompraId);
      total += item.cantidad * item.precio_unitario;
    }

    db.prepare(
      "INSERT INTO movimientos_cc_proveedores (proveedor_id, tipo, importe, compra_id) VALUES (?, 'compra', ?, ?)"
    ).run(proveedorRow.id, total, nuevaCompraId);

    return nuevaCompraId;
  });

  res.status(201).json({ id: compraId });
});

app.post('/api/compras/:id/anular', (req, res) => {
  const compraId = Number(req.params.id);

  const compra = db.prepare('SELECT id, proveedor_id, estado FROM compras WHERE id = ?').get(compraId);
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

  const items = db
    .prepare(
      `SELECT compra_items.producto_id, compra_items.cantidad, compra_items.precio_unitario, productos.nombre
       FROM compra_items JOIN productos ON productos.id = compra_items.producto_id
       WHERE compra_id = ?`
    )
    .all(compraId);
  const buscarStockActual = db.prepare('SELECT cantidad FROM stock_actual WHERE producto_id = ?');
  for (const item of items) {
    const stockActual = buscarStockActual.get(item.producto_id)?.cantidad ?? 0;
    if (stockActual - item.cantidad < 0) {
      return res.status(400).json({
        error: `"${item.nombre}" ya se vendió parcial o totalmente, no se puede anular la compra.`
      });
    }
  }

  withTransaction(() => {
    db.prepare("UPDATE compras SET estado = 'anulada' WHERE id = ?").run(compraId);

    const insertMovimiento = db.prepare(
      "INSERT INTO movimientos_stock (producto_id, tipo, cantidad, origen, compra_id, nota) VALUES (?, 'salida', ?, 'compra', ?, 'Reversión por anulación')"
    );
    let total = 0;
    for (const item of items) {
      insertMovimiento.run(item.producto_id, item.cantidad, compraId);
      total += item.cantidad * item.precio_unitario;
    }

    db.prepare(
      "INSERT INTO movimientos_cc_proveedores (proveedor_id, tipo, importe, compra_id) VALUES (?, 'ajuste', ?, ?)"
    ).run(compra.proveedor_id, -total, compraId);
  });

  res.json({ id: compraId, estado: 'anulada' });
});

app.patch('/api/compras/:id/estado-envio', (req, res) => {
  const compraId = Number(req.params.id);
  const { estado_envio } = req.body;

  const compra = db.prepare('SELECT id FROM compras WHERE id = ?').get(compraId);
  if (!compra) {
    return res.status(404).json({ error: 'Compra no encontrada.' });
  }

  db.prepare('UPDATE compras SET estado_envio = ? WHERE id = ?').run(estado_envio, compraId);
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
              (SELECT COALESCE(SUM(importe), 0) FROM pagos WHERE compra_id = compras.id) AS pagado
       FROM compras WHERE compras.id = ?`
    )
    .get(compraId);
  if (!compra) {
    return res.status(404).json({ error: 'Compra no encontrada.' });
  }

  const saldoPendiente = compra.total - compra.pagado;
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
      "INSERT INTO movimientos_tesoreria (cuenta_tesoreria_id, tipo, importe, pago_id) VALUES (?, 'egreso', ?, ?)"
    ).run(cuenta_tesoreria_id, importe, nuevoPagoId);

    db.prepare(
      "INSERT INTO movimientos_cc_proveedores (proveedor_id, tipo, importe, compra_id, pago_id) VALUES (?, 'pago', ?, ?, ?)"
    ).run(compra.proveedor_id, -importe, compraId, nuevoPagoId);

    return nuevoPagoId;
  });

  res.status(201).json({ id: pagoId });
});

/* ---------- Cuentas de tesorería ---------- */

app.get('/api/cuentas-tesoreria', (req, res) => {
  const cuentas = db.prepare('SELECT * FROM cuentas_tesoreria ORDER BY id').all();
  res.json(cuentas);
});

app.listen(PORT, () => {
  console.log(`Nexo backend escuchando en http://localhost:${PORT}`);
});
