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
      `SELECT id, tipo, cantidad, origen, venta_id, compra_id, fecha, nota
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

/* ---------- Compras ---------- */

const ESTADOS_ENVIO = ['pedido', 'en_camino', 'recibido'];

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
                 FROM pagos WHERE pagos.compra_id = compras.id) AS pagado
       FROM compras
       JOIN proveedores ON proveedores.id = compras.proveedor_id
       ORDER BY compras.id DESC`
    )
    .all();
  res.json(
    compras.map((c) => {
      const total = c.subtotal + c.costo_envio;
      return {
        ...c,
        total,
        estado_pago: c.pagado <= 0 ? 'pendiente' : c.pagado >= total ? 'pagado' : 'parcial'
      };
    })
  );
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

  const itemsProrrateados = prorratearEnvio(
    items.map((i) => ({
      producto: String(i.producto).trim(),
      cantidad: Number(i.cantidad),
      precio_unitario: Number(i.precio_unitario)
    })),
    costoEnvio
  );

  const compraId = withTransaction(() => {
    let proveedorRow = db.prepare('SELECT id FROM proveedores WHERE nombre = ?').get(proveedor);
    if (!proveedorRow) {
      const { lastInsertRowid } = db
        .prepare('INSERT INTO proveedores (nombre) VALUES (?)')
        .run(proveedor);
      proveedorRow = { id: lastInsertRowid };
    }

    const columnas = ['proveedor_id', 'costo_envio'];
    const valores = [proveedorRow.id, costoEnvio];
    if (fecha) {
      columnas.push('fecha');
      valores.push(fecha);
    }
    const { lastInsertRowid: nuevaCompraId } = db
      .prepare(
        `INSERT INTO compras (${columnas.join(', ')}) VALUES (${columnas.map(() => '?').join(', ')})`
      )
      .run(...valores);

    const buscarProducto = db.prepare('SELECT id FROM productos WHERE nombre = ?');
    // Un producto nuevo nace con costo 0: todavía no entró nada al
    // depósito, su costo lo va a fijar la recepción de esta compra.
    const crearProducto = db.prepare(
      'INSERT INTO productos (nombre, precio_costo, precio_venta) VALUES (?, 0, 0)'
    );
    const insertItem = db.prepare(
      `INSERT INTO compra_items (compra_id, producto_id, cantidad, precio_unitario, costo_real_unitario)
       VALUES (?, ?, ?, ?, ?)`
    );

    for (const item of itemsProrrateados) {
      let productoRow = buscarProducto.get(item.producto);
      if (!productoRow) {
        const { lastInsertRowid } = crearProducto.run(item.producto);
        productoRow = { id: lastInsertRowid };
      }
      insertItem.run(
        nuevaCompraId,
        productoRow.id,
        item.cantidad,
        item.precio_unitario,
        item.costo_real_unitario
      );
    }

    return nuevaCompraId;
  });

  res.status(201).json({ id: compraId, estado: 'borrador' });
});

// "Efectuar el pedido": el borrador pasa a ser una compra real y nace la
// deuda con el proveedor. El stock todavía no se toca — la mercadería no
// llegó.
app.post('/api/compras/:id/confirmar', (req, res) => {
  const compraId = Number(req.params.id);

  const compra = db
    .prepare('SELECT id, proveedor_id, estado, costo_envio FROM compras WHERE id = ?')
    .get(compraId);
  if (!compra) {
    return res.status(404).json({ error: 'Compra no encontrada.' });
  }
  if (compra.estado !== 'borrador') {
    return res.status(400).json({ error: 'Esta compra ya fue efectuada.' });
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
      "INSERT INTO movimientos_cc_proveedores (proveedor_id, tipo, importe, compra_id) VALUES (?, 'compra', ?, ?)"
    ).run(compra.proveedor_id, subtotal + compra.costo_envio, compraId);
  });

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
