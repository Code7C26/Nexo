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

-- estado solo tiene sentido para una factura SUELTA (sin venta_id): no
-- hay cobros de una venta de los que derivarlo, así que se guarda a mano.
-- Una factura que sí respalda una venta ignora esta columna en la API: su
-- estado de cobro se calcula en vivo a partir de los cobros de esa venta
-- (GET /api/ventas ya hace lo mismo), para no tener dos fuentes de verdad
-- que puedan desincronizarse.
-- condicion guarda un medio de pago (efectivo/transferencia/mercadopago),
-- no una condición de venta fiscal — el nombre de columna quedó así desde
-- el prototipo y cambiarlo obligaría a tocar todos los endpoints que ya
-- lo usan sin ganar nada real; se corrige en la UI, que lo etiqueta
-- "Medio de pago".
CREATE TABLE IF NOT EXISTS facturas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  concepto TEXT NOT NULL,
  neto REAL NOT NULL,
  condicion TEXT NOT NULL CHECK (condicion IN ('efectivo', 'transferencia', 'mercadopago')),
  estado TEXT NOT NULL CHECK (estado IN ('cobrado', 'pendiente', 'vencido')),
  fecha TEXT NOT NULL DEFAULT (date('now')),
  -- Estructura de comprobante fiscal (CLAUDE.md §16), sin IVA todavía
  -- (fuera de V1) y sin conexión real a ARCA: deja la numeración lista
  -- para cuando se conecte, sin tener que volver a migrar sobre datos
  -- ya cargados.
  tipo TEXT NOT NULL DEFAULT 'factura' CHECK (tipo IN ('factura', 'nota_credito', 'nota_debito')),
  letra TEXT NOT NULL DEFAULT 'B' CHECK (letra IN ('A', 'B', 'C')),
  punto_venta INTEGER NOT NULL DEFAULT 1,
  -- Correlativo por (punto_venta, tipo, letra): cada combinación tiene su
  -- propia numeración, como en la realidad. NULL en la definición de acá
  -- porque en una base nueva lo pone la aplicación al emitir, nunca un
  -- default fijo (no hay forma de que SQLite calcule "el siguiente" solo).
  numero INTEGER
);
-- venta_id se agrega por migración en db/index.js (ver ahí el porqué).

-- Solo un nivel por ahora (sin subcategoría): CLAUDE.md §3/§4 las
-- mencionan como entidades separadas, pero con el catálogo actual un
-- segundo nivel sería estructura vacía. Agregar subcategoría después es
-- aditivo (una columna parent_id acá mismo), no obliga a rehacer nada.
CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  activa INTEGER NOT NULL DEFAULT 1
);

-- precio_costo no se edita a mano en ningún lado: lo escribe la compra al
-- proveedor (costo promedio ponderado, ver POST /api/compras). Es un valor
-- derivado de las operaciones, no un dato que alguien carga.
-- stock_minimo / stock_maximo son los umbrales para la alerta de stock:
-- por debajo del mínimo avisa "bajo", por encima del máximo avisa "alto".
-- stock_maximo nullable = ese producto no tiene alerta de exceso.
-- categoria_id es nullable a propósito, no por comodidad: un producto se
-- autocrea por nombre desde una compra (ver crearCompra en server.js) sin
-- pasar nunca por este formulario, así que un NOT NULL rompería esa alta.
CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  sku TEXT UNIQUE,
  precio_costo REAL NOT NULL DEFAULT 0,
  precio_venta REAL NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  stock_minimo REAL NOT NULL DEFAULT 0,
  stock_maximo REAL,
  categoria_id INTEGER REFERENCES categorias(id)
);

-- Mismo criterio que clientes: un proveedor puede nacer cargado a mano
-- desde la pantalla de Proveedores, o creado automáticamente al registrar
-- una compra con un nombre nuevo. En ese segundo caso solo tiene nombre y
-- el resto se completa después desde su ficha, así que todo el contacto
-- es opcional.
CREATE TABLE IF NOT EXISTS proveedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  email TEXT,
  telefono TEXT,
  direccion TEXT,
  documento TEXT,
  notas TEXT
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

-- Un presupuesto es una OFERTA, no una operación: no toca stock, no
-- genera cuenta corriente y no entra en el resultado (CLAUDE.md §15).
-- Recién al convertirse en venta pasa a mover todo eso.
--
-- 'vencido' NO está en este CHECK a propósito: se deriva de comparar
-- `vencimiento` con la fecha de hoy. Guardarlo como estado obligaría a
-- que alguien entre a marcarlo, y en cuanto no lo haga la lista miente.
-- Mismo criterio que el estado de cobro de las facturas y el de pago de
-- las compras, que también se calculan en vez de guardarse.
--
-- `vencimiento` es nullable: un presupuesto sin fecha nunca vence.
-- `venta_id` se completa solo al convertir, y es lo que deja el rastro
-- entre la oferta y la operación que salió de ella.
CREATE TABLE IF NOT EXISTS presupuestos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  fecha TEXT NOT NULL DEFAULT (date('now')),
  vencimiento TEXT,
  estado TEXT NOT NULL
    CHECK (estado IN ('borrador', 'enviado', 'aceptado', 'rechazado', 'convertido'))
    DEFAULT 'borrador',
  venta_id INTEGER REFERENCES ventas(id),
  notas TEXT
);

-- A diferencia de venta_items, acá NO hay costo_unitario_historico: un
-- presupuesto no compromete costo. El costo se congela recién al
-- convertir, que es cuando la mercadería realmente sale — así el margen
-- de la venta es el real del momento de la entrega y no el de cuando se
-- cotizó.
CREATE TABLE IF NOT EXISTS presupuesto_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  presupuesto_id INTEGER NOT NULL REFERENCES presupuestos(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad REAL NOT NULL CHECK (cantidad > 0),
  precio_unitario REAL NOT NULL
);

-- Una devolución revierte parte (o todo) de una venta ya confirmada:
-- CLAUDE.md §17. A diferencia de una anulación, es parcial por renglón y
-- puede convivir con cobros y facturas ya emitidas.
--
-- No lleva cliente_id: se deriva de la venta (venta_id -> ventas.cliente_id).
-- Guardarlo acá sería una segunda fuente de verdad que puede
-- desincronizarse si la venta cambiara de cliente.
--
-- cuenta_tesoreria_id es NULLABLE a propósito: si tiene cuenta, la plata
-- se devolvió en el acto (egreso de tesorería); si es NULL, la devolución
-- solo generó un crédito a favor del cliente en su cuenta corriente, para
-- descontar de una próxima venta. Es la misma idea que un renglón de
-- cobro pero para la salida, sin necesitar una tabla aparte.
CREATE TABLE IF NOT EXISTS devoluciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id INTEGER NOT NULL REFERENCES ventas(id),
  fecha TEXT NOT NULL DEFAULT (date('now')),
  estado TEXT NOT NULL CHECK (estado IN ('activa', 'anulada')) DEFAULT 'activa',
  cuenta_tesoreria_id INTEGER REFERENCES cuentas_tesoreria(id),
  motivo TEXT
);

-- venta_item_id (no producto_id solo) apunta al renglón exacto de la
-- venta: es lo que permite topar "no devolver más de lo que se vendió"
-- aunque el mismo producto aparezca en más de un renglón de esa venta.
-- precio_unitario y costo_unitario_historico se copian del renglón de la
-- venta y quedan congelados ahí: la devolución acredita al precio al que
-- se vendió, no al precio de lista del día en que se devuelve — mismo
-- criterio que venta_items.costo_unitario_historico.
-- vuelve_stock es por renglón: lo devuelto en buen estado reingresa al
-- depósito; lo que vino fallado no, y su costo queda como pérdida del
-- período en vez de sumarse de nuevo al inventario.
CREATE TABLE IF NOT EXISTS devolucion_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  devolucion_id INTEGER NOT NULL REFERENCES devoluciones(id),
  venta_item_id INTEGER NOT NULL REFERENCES venta_items(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad REAL NOT NULL CHECK (cantidad > 0),
  precio_unitario REAL NOT NULL,
  costo_unitario_historico REAL NOT NULL DEFAULT 0,
  vuelve_stock INTEGER NOT NULL DEFAULT 1
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

-- Espejo de devoluciones/devolucion_items, del lado de compras: revierte
-- parte (o todo) de una compra ya recibida, devolviéndole mercadería al
-- proveedor. A diferencia de la devolución de venta, acá no existe un
-- equivalente de "vuelve_stock": la mercadería siempre SALE del depósito
-- de vuelta al proveedor, sin importar el motivo (fallada o no).
--
-- No lleva proveedor_id: se deriva de la compra (compra_id ->
-- compras.proveedor_id), mismo criterio que devoluciones con cliente_id.
--
-- cuenta_tesoreria_id es NULLABLE a propósito, igual que en devoluciones:
-- si tiene cuenta, el proveedor reintegró la plata en el acto (ingreso de
-- tesorería); si es NULL, la devolución solo generó un crédito a favor en
-- la cuenta corriente del proveedor, para descontar de la próxima compra.
--
-- nota_credito_proveedor_numero es una referencia libre (el número que te
-- dio el proveedor en su propio comprobante) — no se emite desde acá, así
-- que no tiene letra/punto_venta/numeración propia como sí tiene la nota
-- de crédito que Nexo emite a un cliente (tabla facturas).
CREATE TABLE IF NOT EXISTS devoluciones_proveedor (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id INTEGER NOT NULL REFERENCES compras(id),
  fecha TEXT NOT NULL DEFAULT (date('now')),
  estado TEXT NOT NULL CHECK (estado IN ('activa', 'anulada')) DEFAULT 'activa',
  cuenta_tesoreria_id INTEGER REFERENCES cuentas_tesoreria(id),
  motivo TEXT,
  nota_credito_proveedor_numero TEXT
);

-- compra_item_id (no producto_id solo) apunta al renglón exacto de la
-- compra: topa "no devolver más de lo que se compró" aunque el mismo
-- producto aparezca en más de un renglón. precio_unitario y
-- costo_real_unitario se copian del renglón de la compra y quedan
-- congelados: precio_unitario es lo que se acredita en la cuenta
-- corriente del proveedor (lo que le debías por esa unidad);
-- costo_real_unitario (con el envío prorrateado) es lo que alimenta el
-- recálculo del costo promedio del producto al sacarla de stock.
CREATE TABLE IF NOT EXISTS devolucion_proveedor_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  devolucion_proveedor_id INTEGER NOT NULL REFERENCES devoluciones_proveedor(id),
  compra_item_id INTEGER NOT NULL REFERENCES compra_items(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad REAL NOT NULL CHECK (cantidad > 0),
  precio_unitario REAL NOT NULL,
  costo_real_unitario REAL NOT NULL DEFAULT 0
);

-- tipo 'entrada'/'salida': cantidad siempre positiva, el signo lo pone el tipo.
-- tipo 'ajuste': cantidad puede ser negativa (correccion manual de stock).
CREATE TABLE IF NOT EXISTS movimientos_stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida', 'ajuste')),
  cantidad REAL NOT NULL,
  origen TEXT NOT NULL CHECK (origen IN ('venta', 'compra', 'ajuste_manual', 'devolucion', 'devolucion_proveedor')),
  -- origen_id: deprecado, reemplazado por venta_id/compra_id (con FK real
  -- de verdad). Se conserva sin usar por compatibilidad con filas viejas;
  -- se puede eliminar en una limpieza posterior.
  origen_id INTEGER,
  venta_id INTEGER REFERENCES ventas(id),
  compra_id INTEGER REFERENCES compras(id),
  devolucion_id INTEGER REFERENCES devoluciones(id),
  devolucion_proveedor_id INTEGER REFERENCES devoluciones_proveedor(id),
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
-- saldo_inicial es la plata que ya había en esa cuenta antes de empezar a
-- usar Nexo. No es un movimiento (nadie la ingresó desde el sistema), así
-- que vive en la cuenta y el saldo real se calcula como
-- saldo_inicial + movimientos (ver la vista saldo_tesoreria en db/index.js).
CREATE TABLE IF NOT EXISTS cuentas_tesoreria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('efectivo', 'banco', 'mercadopago', 'otro')),
  saldo_inicial REAL NOT NULL DEFAULT 0
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
-- origen dice de dónde salió el movimiento: de un cobro de venta, de un
-- pago a proveedor, de una carga manual (aporte, retiro, gasto pagado de
-- la caja) o de una transferencia entre cuentas propias.
-- transferencia_id agrupa las dos patas de una transferencia: el egreso
-- Los gastos NO son compras de mercadería (eso vive en compras): son el
-- alquiler, la luz, los sueldos, la publicidad (CLAUDE.md §14).
--
-- El tipo es lo que decide cómo pesa cada gasto en el resultado:
--   operativo -> resta del resultado del negocio.
--   inversion -> sale plata pero se convierte en algo que queda
--                (una máquina, una PC); no es gasto del período.
--   retiro    -> plata que se lleva el dueño; no es gasto del negocio,
--                es ganancia ya generada que se reparte.
-- Los tres bajan la caja; solo el operativo baja el resultado. Si se
-- mezclaran, un mes con un retiro grande figuraría como mes con pérdida.
CREATE TABLE IF NOT EXISTS categorias_gasto (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('operativo', 'inversion', 'retiro')),
  activa INTEGER NOT NULL DEFAULT 1
);

-- gastos.tipo se copia de la categoría al momento de cargar el gasto y se
-- queda ahí: es la misma idea que venta_items.costo_unitario_historico.
-- Si mañana se reclasifica una categoría, los gastos ya cargados no
-- deben cambiar de naturaleza y reescribir en silencio el resultado de
-- meses ya cerrados.
-- proveedor_id es opcional: el alquiler no tiene proveedor, pero el
-- service de una máquina sí puede tenerlo.
CREATE TABLE IF NOT EXISTS gastos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria_id INTEGER NOT NULL REFERENCES categorias_gasto(id),
  cuenta_tesoreria_id INTEGER NOT NULL REFERENCES cuentas_tesoreria(id),
  proveedor_id INTEGER REFERENCES proveedores(id),
  fecha TEXT NOT NULL DEFAULT (date('now')),
  importe REAL NOT NULL CHECK (importe > 0),
  tipo TEXT NOT NULL CHECK (tipo IN ('operativo', 'inversion', 'retiro')),
  descripcion TEXT,
  comprobante TEXT,
  estado TEXT NOT NULL CHECK (estado IN ('activo', 'anulado')) DEFAULT 'activo'
);

-- en la cuenta que sale y el ingreso en la que entra comparten el mismo
-- valor, así se puede mostrar una contra la otra. Es plata que se mueve
-- de bolsillo, no plata que entra o sale del negocio, por eso son dos
-- movimientos y no uno.
CREATE TABLE IF NOT EXISTS movimientos_tesoreria (
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

-- Asistente de operaciones por texto (CLAUDE.md §21). Cada mensaje que el
-- usuario escribe queda registrado junto con lo que la IA interpretó y qué
-- pasó después: interpretado (propuesto, sin ejecutar), confirmado (el
-- usuario lo aprobó y se ejecutó como operacion_tipo/operacion_id),
-- descartado (el usuario lo rechazó) o fallido (la ejecución falló pese a
-- confirmarse, ver `error`). La IA nunca escribe en ninguna otra tabla
-- directamente: esta es su única puerta de entrada, y es también el
-- registro de auditoría de esa puerta (§22).
CREATE TABLE IF NOT EXISTS asistente_mensajes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL DEFAULT (datetime('now')),
  texto TEXT NOT NULL,
  propuesta_json TEXT,
  estado TEXT NOT NULL CHECK (estado IN ('interpretado', 'confirmado', 'descartado', 'fallido')),
  operacion_tipo TEXT CHECK (operacion_tipo IN ('venta', 'compra', 'gasto')),
  operacion_id INTEGER,
  error TEXT
);

-- Auditoría central unificada (CLAUDE.md §22). Registra el ACTO del
-- operador (crear/editar/anular/...), no el efecto contable: eso ya lo
-- cubren movimientos_stock/movimientos_tesoreria/movimientos_cc_* (que
-- son libros mayores, no una bitácora) y asistente_mensajes (que ya
-- audita su propia puerta de entrada). Una venta de 3 productos escribe
-- UNA sola fila acá y tres en movimientos_stock: la granularidad es
-- distinta a propósito, no hay duplicación.
--
-- Registra "por qué vía" entró la operación (actor): operador (a mano) /
-- asistente (por la IA, ver §21) / sistema (reservado para
-- automatizaciones futuras). Desde la etapa de usuarios/login/roles,
-- usuario_id registra además "quién" fue el operador humano (columna
-- aparte, agregada por migración aditiva) — actor y usuario_id responden
-- preguntas distintas, así que ninguno reemplaza al otro: el asistente
-- sigue quedando con actor='asistente' Y usuario_id apuntando a quien
-- confirmó la operación propuesta.
--
-- entidad_id es nullable y sin FK a propósito: es la única columna del
-- proyecto que apunta a tablas distintas según el valor de `entidad`, y el
-- registro debe sobrevivir aunque la fila referida deje de existir.
CREATE TABLE IF NOT EXISTS auditoria (
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
  -- Quién operó, más allá de por qué vía (actor). Nullable a propósito:
  -- las filas de antes de esta etapa no tienen a quién atribuirse, y
  -- NULL es honesto (se muestra "—"); inventarles un admin sería
  -- falsificar la auditoría. Sin FK con ON DELETE: un usuario dado de
  -- baja se marca activo=0 pero nunca se borra, así que la referencia
  -- sigue resolviendo el nombre para siempre.
  usuario_id INTEGER REFERENCES usuarios(id),
  -- JSON con solo los campos que cambiaron, no la fila entera. Ej.:
  -- {"precio_venta":1000} -> {"precio_venta":1200}. NULL en 'crear' (no
  -- hay anterior) y en 'anular' (el nuevo estado es obvio).
  valor_anterior TEXT,
  valor_nuevo TEXT,
  -- La "operación relacionada" de §22: ej. el cobro #4 apunta a venta #12.
  operacion_tipo TEXT,
  operacion_id INTEGER,
  -- Frase legible ya armada en el backend ("Venta #12 anulada, stock
  -- devuelto"): sin esto el frontend tendría que reimplementar la
  -- narración de cada uno de los ~20 casos distintos.
  detalle TEXT
);

CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria(fecha DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_entidad ON auditoria(entidad, entidad_id);

-- Usuarios, login y roles. Nexo pasa de "un solo operador sin identidad"
-- a admin/empleado con sesión propia.
--
-- organizaciones arranca con UNA sola fila: es la preparación para vender
-- Nexo a más de un negocio (usuarios.organizacion_id ya apunta acá), pero
-- las ~30 tablas de datos del sistema (ventas, clientes, stock...) NO se
-- tocan en esta etapa. El día que exista un segundo negocio, alcanza con
-- agregar organizacion_id a esas tablas y filtrar por ella — usuarios y
-- login no necesitan rehacerse.
CREATE TABLE IF NOT EXISTS organizaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  fecha_alta TEXT NOT NULL DEFAULT (datetime('now'))
);

-- nombre queda separado de usuario (el de login) porque la columna
-- Usuario de la vista Auditoría tiene que mostrar "Joaquín Tosi", no
-- "jtosi". password_hash/password_salt van en columnas propias en vez de
-- un único string con formato PHC: el proyecto no tiene parser para ese
-- formato, y dos columnas es más explícito e inspeccionable con SQL
-- directo. activo es baja lógica, nunca DELETE: auditoria.usuario_id
-- tiene que poder seguir resolviendo el nombre de un usuario dado de
-- baja. debe_cambiar_password se usa cuando el admin resetea la
-- contraseña de otro usuario, para forzar que la cambie en el próximo
-- login antes de dejarlo operar.
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id),
  usuario TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'empleado' CHECK (rol IN ('admin','empleado')),
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  debe_cambiar_password INTEGER NOT NULL DEFAULT 0 CHECK (debe_cambiar_password IN (0,1)),
  fecha_alta TEXT NOT NULL DEFAULT (datetime('now')),
  ultimo_acceso TEXT
);
-- SQLite compara texto case-sensitive por default: sin este índice sobre
-- LOWER(usuario), "Admin" y "admin" podrían coexistir como dos cuentas
-- distintas.
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_usuario ON usuarios(LOWER(usuario));

-- Tabla de sesiones en vez de un token firmado (JWT). Con JWT, dar de
-- baja a un empleado no lo echa del sistema hasta que el token expire
-- por su cuenta. Con esta tabla, DELETE FROM sesiones WHERE usuario_id=?
-- lo saca en el próximo request — en un sistema que maneja plata y
-- audita todo, eso no es negociable. También evita elegir un algoritmo
-- de firma y gestionar un secreto. Las sesiones sobreviven al reinicio
-- del proceso porque están en disco, que es lo correcto con `--watch`.
CREATE TABLE IF NOT EXISTS sesiones (
  token TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  creada TEXT NOT NULL DEFAULT (datetime('now')),
  expira TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones(usuario_id);
