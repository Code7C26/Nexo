-- Un cliente puede nacer de dos formas: cargado a mano desde la pantalla
-- de Clientes (con todos sus datos), o creado automáticamente al
-- registrar una venta con un nombre nuevo. En el segundo caso solo tiene
-- nombre y el resto se completa después desde su ficha: por eso todos
-- los campos de contacto son opcionales.
-- organizacion_id: segunda tabla (de ~38) en sumar la columna multi-tenant
-- del patrón piloteado en `productos` (CLAUDE.md §28), NOT NULL igual que
-- en todas las tablas de negocio salvo auditoria (ver el comentario de
-- productos).
CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  email TEXT,
  telefono TEXT,
  direccion TEXT,
  documento TEXT,
  notas TEXT,
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id),
  -- Lista de precios y plazo de pago habituales: solo se proponen al elegir
  -- el cliente en una venta. NULL = la lista predeterminada / sin plazo
  -- definido (el porqué de cada una, en su ALTER de db/index.js).
  lista_precio_id INTEGER REFERENCES listas_precios(id),
  condicion_pago TEXT
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
  -- Correlativo por (organizacion_id, punto_venta, tipo, letra): cada
  -- combinación tiene su propia numeración, como en la realidad. NULL en la
  -- definición de acá porque en una base nueva lo pone la aplicación al
  -- emitir, nunca un default fijo (no hay forma de que SQLite calcule "el
  -- siguiente" solo).
  numero INTEGER,
  -- organizacion_id: cuarta cabecera transaccional (de ~38 tablas) en sumar
  -- la columna multi-tenant del patrón piloteado en `productos` (CLAUDE.md
  -- §28). Cada organización es un negocio con su propio CUIT, así que la
  -- numeración de comprobantes también pasa a ser por organización (ver
  -- `idx_facturas_numeracion` en db/index.js).
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id),
  -- La venta que respalda esta factura, o la devolución que respalda esta
  -- nota de crédito (CLAUDE.md §16, §17). NULL en una factura suelta. Que
  -- ninguna de las dos se facture dos veces lo garantizan índices únicos
  -- parciales de db/index.js (idx_facturas_venta_id e
  -- idx_facturas_devolucion_id): no pueden vivir acá porque en una base
  -- vieja estas columnas todavía no existen cuando corre este archivo.
  venta_id INTEGER REFERENCES ventas(id),
  devolucion_id INTEGER REFERENCES devoluciones(id)
);

-- Solo un nivel por ahora (sin subcategoría): CLAUDE.md §3/§4 las
-- mencionan como entidades separadas, pero con el catálogo actual un
-- segundo nivel sería estructura vacía. Agregar subcategoría después es
-- aditivo (una columna parent_id acá mismo), no obliga a rehacer nada.
--
-- organizacion_id (Etapa A, CLAUDE.md §28), igual en los cinco catálogos de
-- este archivo (categorias, listas_precios, depositos, cuentas_tesoreria,
-- categorias_gasto): cada empresa tiene los suyos, y el nombre es único
-- dentro de la empresa, no en todo Nexo. NOT NULL a diferencia del resto de
-- la Etapa A, que la sumó nullable por ALTER: estas tablas se reconstruyen
-- (ver db/index.js), y con NULL el UNIQUE no frenaría duplicados, porque
-- SQLite trata cada NULL como distinto. El texto "UNIQUE (organizacion_id,
-- nombre)" es además el marcador que usa ese rebuild para saber si ya corrió.
CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  activa INTEGER NOT NULL DEFAULT 1,
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id),
  UNIQUE (organizacion_id, nombre)
);

-- Listas de precios (CLAUDE.md §18): un mismo producto puede tener precios
-- distintos según el canal (minorista/mayorista/tarjeta). Exactamente una
-- lista por organización es la predeterminada en todo momento — es el
-- fallback cuando un producto no tiene precio cargado en la lista elegida, y
-- la que asumen clientes/ventas/presupuestos sin lista propia asignada. La
-- consistencia de "una sola marcada" la garantiza el backend (ver
-- /api/listas-precios en server.js), no un constraint de SQL: SQLite no tiene
-- forma declarativa de expresar "a lo sumo una fila con es_predeterminada =
-- 1". organizacion_id: ver el comentario de categorias.
CREATE TABLE IF NOT EXISTS listas_precios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  activa INTEGER NOT NULL DEFAULT 1,
  es_predeterminada INTEGER NOT NULL DEFAULT 0,
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id),
  UNIQUE (organizacion_id, nombre)
);

-- Depósitos (CLAUDE.md §5/§19): el stock se maneja por producto Y
-- depósito, no como un único total global. Exactamente uno por organización
-- es el predeterminado en todo momento — es el que asumen las operaciones
-- (venta/compra/devolución) sin depósito elegido a mano, mismo criterio
-- que listas_precios.es_predeterminada. La consistencia de "una sola
-- marcada" la garantiza el backend (ver /api/depositos en server.js), no
-- un constraint de SQL, por el mismo motivo que esa tabla.
-- organizacion_id: ver el comentario de categorias.
CREATE TABLE IF NOT EXISTS depositos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  direccion TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  es_predeterminado INTEGER NOT NULL DEFAULT 0,
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id),
  UNIQUE (organizacion_id, nombre)
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
-- margen_objetivo nullable = ese producto no tiene alerta de margen: sin
-- objetivo cargado no hay nada contra qué comparar. Cuando está cargado, se
-- compara contra el margen real de la lista predeterminada (precio_venta),
-- solo a modo informativo/alerta, nunca sugiere ni fuerza un precio.
-- organizacion_id es la primera columna multi-tenant del sistema (CLAUDE.md
-- §28): `productos` es la tabla piloto para probar el patrón (columna +
-- backfill + filtrado en server.js) antes de replicarlo en el resto de las
-- tablas de negocio. La referencia a `organizaciones` es hacia adelante en
-- este archivo (SQLite no valida la tabla referenciada al crear). NOT NULL
-- desde hist. §64 en las 14 tablas que la sumaron nullable por ALTER: en una
-- base existente lo aplica el rebuild de "organizacion_id NOT NULL" al final
-- de db/index.js. auditoria queda nullable a propósito (ver ahí).
-- sku es único por empresa, no en todo Nexo: si no, una empresa recibiría
-- "ya existe" por el SKU de otra (CLAUDE.md §28). Lo garantiza
-- idx_productos_org_sku en db/index.js, que no puede vivir acá por el mismo
-- motivo que idx_facturas_numeracion. NULL = sin SKU, puede repetirse.
-- idx_productos_id_org (también en db/index.js) es la clave que exige la FK
-- compuesta de producto_variantes.
CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  sku TEXT,
  precio_costo REAL NOT NULL DEFAULT 0,
  precio_venta REAL NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  stock_minimo REAL NOT NULL DEFAULT 0,
  stock_maximo REAL,
  categoria_id INTEGER REFERENCES categorias(id),
  margen_objetivo REAL,
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id),
  -- Unidad en que se vende (unidad, kg, g, l, ml, m) y si es un producto con
  -- stock o un servicio sin stock (CLAUDE.md §4, §29). Los valores los valida
  -- server.js (UNIDADES, TIPOS_PRODUCTO), sin CHECK.
  unidad TEXT NOT NULL DEFAULT 'unidad',
  tipo TEXT NOT NULL DEFAULT 'producto',
  -- Qué incluye y cuánto tarda, pensados para un servicio (hist. §78). La
  -- duración es estimada, en minutos: informa, no se cobra (lo que se cobra
  -- por tiempo es la unidad 'hora').
  descripcion TEXT,
  duracion_minutos INTEGER
);

-- Precio de un producto en una lista puntual. No todo producto tiene fila
-- acá para toda lista: si falta, el precio de esa combinación cae al
-- precio_venta del producto (que representa la lista predeterminada). El
-- índice único de abajo es la garantía real de "un producto, un precio por
-- lista" — mismo criterio que idx_facturas_numeracion.
CREATE TABLE IF NOT EXISTS producto_precios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  lista_precio_id INTEGER NOT NULL REFERENCES listas_precios(id),
  precio REAL NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_producto_precios_unico
  ON producto_precios(producto_id, lista_precio_id);

-- Variantes de producto (ej. Talle/Color): un producto define sus propios
-- atributos (no hay catálogo global de "Talle" compartido entre productos
-- distintos) y una variante es una combinación concreta de valores de esos
-- atributos. Ver docs/handoff-historico.md, §30, para el razonamiento
-- completo detrás de este esquema.
CREATE TABLE IF NOT EXISTS producto_atributos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  nombre TEXT NOT NULL,
  orden INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_producto_atributos_unico
  ON producto_atributos(producto_id, nombre COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS producto_atributo_valores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  atributo_id INTEGER NOT NULL REFERENCES producto_atributos(id),
  valor TEXT NOT NULL,
  orden INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_producto_atributo_valores_unico
  ON producto_atributo_valores(atributo_id, valor COLLATE NOCASE);

-- precio_venta nullable: sin precio genérico propio, la variante cae a la
-- cadena de precio del producto padre (ver variante_precios más abajo).
-- precio_costo sigue el mismo criterio que productos.precio_costo: arranca
-- en 0 y lo escribe la compra (costo promedio ponderado por variante).
-- organizacion_id: a diferencia del resto de las tablas hijas, que heredan
-- la empresa de su fila padre, la variante tiene columna propia (hist. §64)
-- para que su SKU sea único por empresa en la base, igual que el del
-- producto (idx_producto_variantes_org_sku en db/index.js). Las consultas la
-- siguen filtrando por el JOIN a productos. La FK compuesta garantiza que
-- sea la de su producto: una variante con otra empresa no se puede guardar.
CREATE TABLE IF NOT EXISTS producto_variantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  sku TEXT,
  precio_costo REAL NOT NULL DEFAULT 0,
  precio_venta REAL,
  activo INTEGER NOT NULL DEFAULT 1,
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id),
  FOREIGN KEY (producto_id, organizacion_id) REFERENCES productos(id, organizacion_id)
);

-- Una fila por (variante, atributo, valor elegido). El índice único impide
-- que una variante tenga dos valores para el mismo atributo. No hay forma
-- declarativa en SQLite de impedir combinaciones repetidas entre variantes
-- (es un unique sobre un conjunto de filas): eso se valida en el backend
-- antes de insertar, mismo criterio que "una sola lista predeterminada".
CREATE TABLE IF NOT EXISTS producto_variante_valores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  variante_id INTEGER NOT NULL REFERENCES producto_variantes(id),
  atributo_id INTEGER NOT NULL REFERENCES producto_atributos(id),
  valor_id INTEGER NOT NULL REFERENCES producto_atributo_valores(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_producto_variante_valores_unico
  ON producto_variante_valores(variante_id, atributo_id);

-- Espejo exacto de producto_precios, a nivel variante.
CREATE TABLE IF NOT EXISTS variante_precios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  variante_id INTEGER NOT NULL REFERENCES producto_variantes(id),
  lista_precio_id INTEGER NOT NULL REFERENCES listas_precios(id),
  precio REAL NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_variante_precios_unico
  ON variante_precios(variante_id, lista_precio_id);

-- Mismo criterio que clientes: un proveedor puede nacer cargado a mano
-- desde la pantalla de Proveedores, o creado automáticamente al registrar
-- una compra con un nombre nuevo. En ese segundo caso solo tiene nombre y
-- el resto se completa después desde su ficha, así que todo el contacto
-- es opcional.
-- organizacion_id: mismo patrón multi-tenant que clientes/productos
-- (CLAUDE.md §28).
CREATE TABLE IF NOT EXISTS proveedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  email TEXT,
  telefono TEXT,
  direccion TEXT,
  documento TEXT,
  notas TEXT,
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id),
  -- Plazo de pago habitual: mismo criterio que clientes.condicion_pago.
  condicion_pago TEXT
);

-- condicion_pago / fecha_vencimiento: el plazo pactado con el cliente y la
-- fecha en que esa deuda vence. Se guardan las dos cosas a propósito:
-- condicion_pago es lo que se acordó ("30 días") y fecha_vencimiento es su
-- resultado ya calculado sobre la fecha de esta venta puntual. Persistir la
-- fecha en vez de recalcularla al vuelo sigue el criterio de §8: el
-- vencimiento es un dato histórico de la operación, y cambiar la fecha de la
-- venta más adelante no debería mover en silencio un vencimiento ya pactado.
-- Es lo que permite que el aging de cuentas corrientes mida contra el
-- vencimiento real y no contra la fecha de la operación.
-- organizacion_id: siguiente lote del patrón multi-tenant piloteado en
-- productos/clientes/proveedores (CLAUDE.md §28), sobre la cabecera de venta.
-- venta_items no suma columna propia: se filtra vía JOIN a esta tabla.
CREATE TABLE IF NOT EXISTS ventas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  fecha TEXT NOT NULL DEFAULT (date('now')),
  estado TEXT NOT NULL CHECK (estado IN ('activa', 'anulada')) DEFAULT 'activa',
  condicion_pago TEXT,
  fecha_vencimiento TEXT,
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id),
  -- De qué depósito salió la mercadería y con qué lista se vendió (CLAUDE.md
  -- §18, §19). NULL = el predeterminado de ese momento, no un id copiado:
  -- las operaciones sin uno propio siguen al que pase a ser predeterminado.
  deposito_id INTEGER REFERENCES depositos(id),
  lista_precio_id INTEGER REFERENCES listas_precios(id),
  -- El turno de caja en el que se hizo la venta, si fue desde el punto de
  -- venta (CLAUDE.md §30). NULL en las ventas de la pantalla administrativa.
  turno_caja_id INTEGER REFERENCES turnos_caja(id)
);

CREATE TABLE IF NOT EXISTS venta_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id INTEGER NOT NULL REFERENCES ventas(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  -- Variante concreta vendida (nullable): producto_id siempre es el
  -- producto padre, variante_id es un dato adicional. NULL = este ítem es
  -- del producto en general, sin variante (comportamiento de siempre).
  variante_id INTEGER REFERENCES producto_variantes(id),
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
  notas TEXT,
  -- organizacion_id: mismo patrón multi-tenant que facturas/ventas/compras
  -- (CLAUDE.md §28).
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id),
  -- Mismo criterio que ventas.lista_precio_id.
  lista_precio_id INTEGER REFERENCES listas_precios(id)
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
  variante_id INTEGER REFERENCES producto_variantes(id),
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
-- organizacion_id: mismo patrón multi-tenant que ventas (CLAUDE.md §28); se
-- deriva de venta_id -> ventas.organizacion_id al crear la devolución.
CREATE TABLE IF NOT EXISTS devoluciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id INTEGER NOT NULL REFERENCES ventas(id),
  fecha TEXT NOT NULL DEFAULT (date('now')),
  estado TEXT NOT NULL CHECK (estado IN ('activa', 'anulada')) DEFAULT 'activa',
  cuenta_tesoreria_id INTEGER REFERENCES cuentas_tesoreria(id),
  motivo TEXT,
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id),
  -- A qué depósito reingresa lo devuelto: mismo criterio que ventas.deposito_id.
  deposito_id INTEGER REFERENCES depositos(id)
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
  variante_id INTEGER REFERENCES producto_variantes(id),
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
-- organizacion_id: mismo patrón multi-tenant que ventas (CLAUDE.md §28).
-- compra_items no suma columna propia: se filtra vía JOIN a esta tabla.
CREATE TABLE IF NOT EXISTS compras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proveedor_id INTEGER NOT NULL REFERENCES proveedores(id),
  fecha TEXT NOT NULL DEFAULT (date('now')),
  estado TEXT NOT NULL CHECK (estado IN ('borrador', 'activa', 'anulada')) DEFAULT 'borrador',
  estado_envio TEXT NOT NULL CHECK (estado_envio IN ('pedido', 'en_camino', 'recibido')) DEFAULT 'pedido',
  costo_envio REAL NOT NULL DEFAULT 0,
  stock_aplicado INTEGER NOT NULL DEFAULT 0,
  -- Mismo par que en ventas, del lado de la deuda con el proveedor.
  condicion_pago TEXT,
  fecha_vencimiento TEXT,
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id),
  -- A qué depósito entra la mercadería: mismo criterio que ventas.deposito_id.
  deposito_id INTEGER REFERENCES depositos(id)
);

-- costo_real_unitario = precio_unitario + la parte del envío que le toca a
-- este ítem, prorrateada por su valor dentro de la compra (CLAUDE.md §7).
-- Es el costo que alimenta el promedio ponderado del producto, no el
-- precio_unitario pelado: si no, el envío desaparecería del costeo.
CREATE TABLE IF NOT EXISTS compra_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id INTEGER NOT NULL REFERENCES compras(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  variante_id INTEGER REFERENCES producto_variantes(id),
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
-- organizacion_id: mismo patrón multi-tenant que compras (CLAUDE.md §28); se
-- deriva de compra_id -> compras.organizacion_id al crear la devolución.
CREATE TABLE IF NOT EXISTS devoluciones_proveedor (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id INTEGER NOT NULL REFERENCES compras(id),
  fecha TEXT NOT NULL DEFAULT (date('now')),
  estado TEXT NOT NULL CHECK (estado IN ('activa', 'anulada')) DEFAULT 'activa',
  cuenta_tesoreria_id INTEGER REFERENCES cuentas_tesoreria(id),
  motivo TEXT,
  nota_credito_proveedor_numero TEXT,
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id),
  -- De qué depósito sale lo devuelto: mismo criterio que ventas.deposito_id.
  deposito_id INTEGER REFERENCES depositos(id)
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
  variante_id INTEGER REFERENCES producto_variantes(id),
  cantidad REAL NOT NULL CHECK (cantidad > 0),
  precio_unitario REAL NOT NULL,
  costo_real_unitario REAL NOT NULL DEFAULT 0
);

-- Una transferencia mueve mercadería entre dos depósitos (CLAUDE.md §19).
-- Se modela como operación propia (no como dos ajustes sueltos) para que
-- sea auditable y anulable como cualquier otra: genera exactamente dos
-- movimientos de stock (salida en origen + entrada en destino) que la
-- referencian por transferencia_id, igual que una venta referencia sus
-- movimientos por venta_id. anulada revierte con el par contrario, nunca
-- borra filas — mismo criterio que el resto del sistema.
-- organizacion_id: mismo patrón multi-tenant que gastos (CLAUDE.md §28); se
-- completa en el INSERT desde req.usuario.organizacion_id, y los dos
-- depósitos de la transferencia tienen que ser de esa misma organización (lo
-- valida POST /api/transferencias).
CREATE TABLE IF NOT EXISTS transferencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deposito_origen_id INTEGER NOT NULL REFERENCES depositos(id),
  deposito_destino_id INTEGER NOT NULL REFERENCES depositos(id),
  fecha TEXT NOT NULL DEFAULT (date('now')),
  estado TEXT NOT NULL CHECK (estado IN ('activa', 'anulada')) DEFAULT 'activa',
  nota TEXT,
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id)
);

-- tipo 'entrada'/'salida': cantidad siempre positiva, el signo lo pone el tipo.
-- tipo 'ajuste': cantidad puede ser negativa (correccion manual de stock).
-- deposito_id es NOT NULL: toda unidad de stock vive en algún depósito
-- físico concreto, nunca "en general" (CLAUDE.md §5/§19).
-- organizacion_id: mismo patrón multi-tenant que ventas/compras (CLAUDE.md
-- §28); se deriva de la operación que generó el movimiento (venta, compra,
-- devolución, transferencia o ajuste manual), nunca se resuelve solo acá —
-- quien llama a registrarMovimientoStock ya la tiene resuelta.
CREATE TABLE IF NOT EXISTS movimientos_stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  variante_id INTEGER REFERENCES producto_variantes(id),
  deposito_id INTEGER NOT NULL REFERENCES depositos(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida', 'ajuste')),
  cantidad REAL NOT NULL,
  origen TEXT NOT NULL CHECK (origen IN ('venta', 'compra', 'ajuste_manual', 'devolucion', 'devolucion_proveedor', 'transferencia')),
  -- origen_id: deprecado, reemplazado por venta_id/compra_id (con FK real
  -- de verdad). Se conserva sin usar por compatibilidad con filas viejas;
  -- se puede eliminar en una limpieza posterior.
  origen_id INTEGER,
  venta_id INTEGER REFERENCES ventas(id),
  compra_id INTEGER REFERENCES compras(id),
  devolucion_id INTEGER REFERENCES devoluciones(id),
  devolucion_proveedor_id INTEGER REFERENCES devoluciones_proveedor(id),
  transferencia_id INTEGER REFERENCES transferencias(id),
  fecha TEXT NOT NULL DEFAULT (date('now')),
  -- Costo real de la unidad que entra (con el envío ya prorrateado).
  -- Solo tiene sentido en las entradas por compra; en salidas y ajustes
  -- queda NULL.
  costo_unitario REAL,
  nota TEXT,
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id)
);

-- El índice sobre (producto_id, deposito_id) se crea en db/index.js, no
-- acá: en una base que todavía no pasó por el rebuild de movimientos_stock
-- (ver ahí el porqué), esta tabla la crea este mismo archivo sin
-- deposito_id.
--
-- Stock total por producto, sumando todos los depósitos. Es el que usa el
-- costo promedio ponderado (el costo es del producto, no de dónde está
-- guardado físicamente) y el semáforo de stock_minimo/stock_maximo, que
-- CLAUDE.md §5 mantiene global por decisión explícita.
CREATE VIEW IF NOT EXISTS stock_actual AS
SELECT producto_id,
       SUM(CASE tipo
             WHEN 'entrada' THEN cantidad
             WHEN 'salida' THEN -cantidad
             ELSE cantidad
           END) AS cantidad
FROM movimientos_stock
GROUP BY producto_id;

-- stock_por_deposito (stock por producto Y depósito) NO vive en este
-- archivo: su cuerpo referencia movimientos_stock.deposito_id, una columna
-- que en una base existente todavía no está la primera vez que este
-- archivo corre (se agrega recién en el rebuild de db/index.js). Crearla
-- acá rompería ese primer arranque con "no such column" — mismo motivo por
-- el que saldo_tesoreria tampoco vive en este archivo. Se crea en
-- db/index.js, inmediatamente después del rebuild que agrega la columna.

-- Una "cuenta de tesorería" es dónde está la plata (caja, banco, MP). Hoy
-- se corresponde 1 a 1 con los medios de pago que ya usa el sistema
-- (facturas.condicion), así que un cobro/pago tiene una sola cuenta en
-- vez de un campo "medio_pago" separado y redundante.
-- saldo_inicial es la plata que ya había en esa cuenta antes de empezar a
-- usar Nexo. No es un movimiento (nadie la ingresó desde el sistema), así
-- que vive en la cuenta y el saldo real se calcula como
-- saldo_inicial + movimientos (ver la vista saldo_tesoreria en db/index.js).
-- organizacion_id: ver el comentario de categorias. Acá además es lo que
-- impide que dos empresas compartan la fila "Efectivo" y mezclen su saldo.
CREATE TABLE IF NOT EXISTS cuentas_tesoreria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('efectivo', 'banco', 'mercadopago', 'otro')),
  saldo_inicial REAL NOT NULL DEFAULT 0,
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id),
  UNIQUE (organizacion_id, nombre)
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
-- organizacion_id: ver el comentario de categorias.
CREATE TABLE IF NOT EXISTS categorias_gasto (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('operativo', 'inversion', 'retiro')),
  activa INTEGER NOT NULL DEFAULT 1,
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id),
  UNIQUE (organizacion_id, nombre)
);

-- gastos.tipo se copia de la categoría al momento de cargar el gasto y se
-- queda ahí: es la misma idea que venta_items.costo_unitario_historico.
-- Si mañana se reclasifica una categoría, los gastos ya cargados no
-- deben cambiar de naturaleza y reescribir en silencio el resultado de
-- meses ya cerrados.
-- proveedor_id es opcional: el alquiler no tiene proveedor, pero el
-- service de una máquina sí puede tenerlo.
-- organizacion_id: mismo patrón multi-tenant que ventas/compras (CLAUDE.md
-- §28); no se deriva de otra tabla porque proveedor_id es opcional y no hay
-- una cabecera obligatoria de la que copiarlo, así que se completa en el
-- INSERT desde req.usuario.organizacion_id.
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
  estado TEXT NOT NULL CHECK (estado IN ('activo', 'anulado')) DEFAULT 'activo',
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id)
);

-- en la cuenta que sale y el ingreso en la que entra comparten el mismo
-- valor, así se puede mostrar una contra la otra. Es plata que se mueve
-- de bolsillo, no plata que entra o sale del negocio, por eso son dos
-- movimientos y no uno.
-- organizacion_id: columna propia (CLAUDE.md §28), a diferencia de cobros/
-- pagos/movimientos_cc_*. Hay orígenes ('manual', 'transferencia') que no
-- cuelgan de ninguna venta/compra/gasto de la que derivar la organización
-- por join, así que se completa en cada INSERT desde
-- req.usuario.organizacion_id (o la organización ya resuelta de la
-- operación padre, cuando la función que inserta ya la tiene en scope).
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
  devolucion_proveedor_id INTEGER REFERENCES devoluciones_proveedor(id),
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id)
);

-- Turno de caja del punto de venta (CLAUDE.md §30, hist. §67). Un turno es
-- una cuenta de tesorería de tipo efectivo (el cajón) entre una apertura y un
-- cierre, ambos con arqueo: lo contado contra el saldo del sistema. Si no
-- coinciden, la diferencia se registra como movimiento manual de esa cuenta,
-- así el saldo de la caja siempre queda en lo que se contó.
-- Los movimientos del turno se delimitan por id de movimientos_tesoreria
-- (desde_movimiento_id excluido, hasta_movimiento_id incluido) y no por
-- fecha: esa tabla guarda solo la fecha, sin hora, y los id crecen siempre
-- (AUTOINCREMENT). desde se toma después del ajuste de apertura y hasta
-- antes del de cierre, así ninguno de los dos cuenta como movimiento del
-- turno.
-- esperado_* es el saldo del sistema en ese momento; contado_*, lo que se
-- contó. Un turno abierto por cuenta como máximo (idx_turnos_caja_abierto).
CREATE TABLE IF NOT EXISTS turnos_caja (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cuenta_tesoreria_id INTEGER NOT NULL REFERENCES cuentas_tesoreria(id),
  estado TEXT NOT NULL CHECK (estado IN ('abierto', 'cerrado')) DEFAULT 'abierto',
  abierto_en TEXT NOT NULL DEFAULT (datetime('now')),
  abierto_por INTEGER NOT NULL REFERENCES usuarios(id),
  esperado_apertura REAL NOT NULL,
  contado_apertura REAL NOT NULL,
  desde_movimiento_id INTEGER NOT NULL DEFAULT 0,
  cerrado_en TEXT,
  cerrado_por INTEGER REFERENCES usuarios(id),
  esperado_cierre REAL,
  contado_cierre REAL,
  hasta_movimiento_id INTEGER,
  nota TEXT,
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_turnos_caja_abierto
  ON turnos_caja(cuenta_tesoreria_id) WHERE estado = 'abierto';

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
-- organizacion_id: mismo patrón multi-tenant que ventas/compras (CLAUDE.md
-- §28); se completa en el INSERT desde req.usuario.organizacion_id, porque el
-- handler que lo escribe ya está autenticado.
CREATE TABLE IF NOT EXISTS asistente_mensajes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL DEFAULT (datetime('now')),
  texto TEXT NOT NULL,
  propuesta_json TEXT,
  estado TEXT NOT NULL CHECK (estado IN ('interpretado', 'confirmado', 'descartado', 'fallido')),
  operacion_tipo TEXT CHECK (operacion_tipo IN ('venta', 'compra', 'gasto')),
  operacion_id INTEGER,
  error TEXT,
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id)
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
--
-- organizacion_id: mismo patrón multi-tenant que ventas/compras (CLAUDE.md
-- §28), con un caso sin empresa deducible: un login_fallido con un usuario
-- que no existe no tiene a quién atribuirse, así que queda NULL a propósito
-- (mismo criterio que usuario_id arriba: NULL es honesto, inventarle una
-- empresa sería falsificar la auditoría) y por lo tanto invisible en
-- GET /api/auditoria para todas las empresas. Se completa desde
-- req.usuario.organizacion_id vía el wrapper `auditar` en server.js.
CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL DEFAULT (datetime('now')),
  actor TEXT NOT NULL DEFAULT 'operador'
    CHECK (actor IN ('operador', 'asistente', 'sistema')),
  accion TEXT NOT NULL
    CHECK (accion IN ('crear', 'editar', 'anular', 'restaurar', 'cambiar_estado', 'confirmar',
                      'login', 'logout', 'login_fallido')),
  -- 'organizacion' cubre los datos del negocio (nombre, CUIT, dirección) que
  -- salen impresos en el membrete de todo comprobante: cambiarlos no es un
  -- ajuste cosmético, así que queda registrado como cualquier otra mutación.
  -- Estos dos CHECK tienen que quedar iguales a los del último rebuild de
  -- auditoria en db/index.js: si acá falta un valor, una base nueva dispara
  -- ese rebuild, que recrea la tabla sin organizacion_id.
  entidad TEXT NOT NULL
    CHECK (entidad IN ('venta','compra','presupuesto','devolucion','devolucion_proveedor',
                       'factura','cobro','pago','gasto','producto','cliente','proveedor',
                       'stock','tesoreria','categoria','categoria_gasto','cuenta_tesoreria','usuario',
                       'organizacion','lista_precio','deposito','transferencia')),
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
  detalle TEXT,
  organizacion_id INTEGER REFERENCES organizaciones(id)
);

CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria(fecha DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_entidad ON auditoria(entidad, entidad_id);
-- idx_auditoria_org_fecha (la que reemplaza en la práctica a
-- idx_auditoria_fecha una vez que GET /api/auditoria filtra por
-- organizacion_id) no se crea acá sino en index.js, mismo criterio que
-- idx_facturas_numeracion: en una instalación vieja, este archivo se
-- ejecuta completo en cada arranque y organizacion_id todavía no existe en
-- esa primera pasada, así que un CREATE INDEX sobre esa columna acá
-- rompería la migración antes de que el ALTER TABLE llegue a correr.

-- Usuarios, login y roles. Nexo pasa de "un solo operador sin identidad"
-- a admin/empleado con sesión propia.
--
-- organizaciones es cada negocio de Nexo (CLAUDE.md §28): todas las tablas
-- de datos tienen organizacion_id y toda consulta filtra por el negocio de
-- la sesión. Un usuario puede trabajar en varios (usuario_organizaciones,
-- más abajo).
-- Los campos de contacto/fiscales son los datos que van en el membrete de un
-- comprobante impreso (presupuesto, factura). Viven acá y no en una tabla
-- aparte porque "la organización" YA es el negocio: una tabla paralela
-- duplicaría el concepto. Todos nullable: una instalación nueva arranca sin
-- ellos y el negocio los completa desde Configuración cuando los necesita.
-- En bases que ya existían se agregan por migración aditiva (ver db/index.js).
--
-- condicion_iva es texto libre ("Monotributo", "Responsable Inscripto") y NO
-- tiene lógica detrás: IVA está fuera de V1 (CLAUDE.md), esto es una línea
-- del membrete, no un dato que se calcule.
CREATE TABLE IF NOT EXISTS organizaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  fecha_alta TEXT NOT NULL DEFAULT (datetime('now')),
  documento TEXT,         -- CUIT
  direccion TEXT,
  telefono TEXT,
  email TEXT,
  condicion_iva TEXT,
  pie_comprobante TEXT,   -- condiciones/validez al pie del comprobante
  -- Tipo de negocio y módulos visibles (CLAUDE.md §29, PERFILES_RUBRO en
  -- server.js). NULL = comercio general / los módulos del preset del tipo.
  rubro TEXT,
  modulos TEXT,
  -- Plan de Nexo (hist. §98, PLANES en backend/planes.js) y hasta cuándo rige
  -- (AAAA-MM-DD). NULL en plan_vence es que no vence; vencido, el negocio
  -- queda en Gratis sin perder nada.
  plan TEXT NOT NULL DEFAULT 'gratis',
  plan_vence TEXT
);

-- nombre queda separado de usuario (el de login) porque la columna
-- Usuario de la vista Auditoría tiene que mostrar "Joaquín Tosi", no
-- "jtosi". password_hash/password_salt van en columnas propias en vez de
-- un único string con formato PHC: el proyecto no tiene parser para ese
-- formato, y dos columnas es más explícito e inspeccionable con SQL
-- directo. debe_cambiar_password se usa cuando el admin resetea la
-- contraseña de otro usuario, para forzar que la cambie en el próximo
-- login antes de dejarlo operar.
--
-- Esta tabla es solo la identidad (hist. §77): el rol y la baja son de
-- cada negocio y viven en usuario_organizaciones. organizacion_id es el
-- negocio donde se creó la cuenta y ya no decide ningún permiso; queda
-- porque sacarla pide reconstruir la tabla (es una FK). Un usuario nunca se
-- borra: auditoria.usuario_id tiene que seguir resolviendo su nombre.
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id),
  usuario TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  debe_cambiar_password INTEGER NOT NULL DEFAULT 0 CHECK (debe_cambiar_password IN (0,1)),
  fecha_alta TEXT NOT NULL DEFAULT (datetime('now')),
  ultimo_acceso TEXT,
  -- Mail de la cuenta (hist. §102): se entra con él y es la forma de
  -- recuperarla. NULL en las cuentas anteriores a §102, que lo cargan al
  -- entrar. Se guarda en minúsculas; email_verificado es la fecha en que se
  -- tocó el enlace, y vuelve a NULL si el mail cambia. El índice único va en
  -- db/index.js, después del ALTER que suma estas columnas.
  email TEXT,
  email_verificado TEXT
);
-- SQLite compara texto case-sensitive por default: sin este índice sobre
-- LOWER(usuario), "Admin" y "admin" podrían coexistir como dos cuentas
-- distintas.
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_usuario ON usuarios(LOWER(usuario));

-- Enlaces de un solo uso que se mandan por mail (hist. §102): verificar el
-- mail y, desde la Fase 2, recuperar la contraseña. Se guarda solo el
-- SHA-256 del token: quien lea la base no puede usar un enlace vigente.
-- email es a qué mail se mandó: un enlace de verificación deja de servir si
-- la cuenta cambió de mail. Es de la cuenta, no de un negocio, por eso no
-- lleva organizacion_id (igual que sesiones). Las horas van en UTC, como
-- sesiones.expira: no son fechas de una operación.
CREATE TABLE IF NOT EXISTS tokens_cuenta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('verificar_email','recuperar')),
  token_hash TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  vence TEXT NOT NULL,
  usado TEXT
);
CREATE INDEX IF NOT EXISTS idx_tokens_cuenta_usuario ON tokens_cuenta(usuario_id, tipo);

-- En qué negocios trabaja cada usuario, y con qué rol en cada uno (CLAUDE.md
-- §28, hist. §77): un dueño con un comercio y un gimnasio entra con un solo
-- usuario y cambia de negocio. activo es la baja en ESE negocio, nunca
-- DELETE: dar de baja a alguien en A no le toca el acceso a B.
-- ultimo_acceso es el de este negocio: el login entra al último que se usó.
CREATE TABLE IF NOT EXISTS usuario_organizaciones (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id),
  rol TEXT NOT NULL DEFAULT 'empleado' CHECK (rol IN ('admin','empleado')),
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  fecha_alta TEXT NOT NULL DEFAULT (datetime('now')),
  ultimo_acceso TEXT,
  PRIMARY KEY (usuario_id, organizacion_id)
);
CREATE INDEX IF NOT EXISTS idx_usuario_organizaciones_org ON usuario_organizaciones(organizacion_id);

-- Invitaciones a trabajar en un negocio (hist. §104,
-- docs/investigacion-login-legal.md §5): el admin ya no crea empleados con
-- usuario y contraseña, invita a un mail con un rol. Aceptar suma la fila de
-- usuario_organizaciones. La ve en Nexo la cuenta que confirmó ese mail; el
-- enlace del mail (token_hash, SHA-256 como tokens_cuenta) sirve además para
-- crear la cuenta si no tiene, y prueba que el mail es suyo.
-- Una sola pendiente por negocio y mail: volver a invitar la reenvía. Vence a
-- los 14 días de `enviada` (la última vez que se mandó), calculado al leerla
-- y sin estado guardado, como el "vencido" de los presupuestos. usuario_id es
-- quién la aceptó o la rechazó.
CREATE TABLE IF NOT EXISTS invitaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id),
  email TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'empleado' CHECK (rol IN ('admin','empleado')),
  token_hash TEXT NOT NULL UNIQUE,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aceptada','rechazada','cancelada')),
  invitado_por INTEGER NOT NULL REFERENCES usuarios(id),
  creada TEXT NOT NULL DEFAULT (datetime('now')),
  enviada TEXT NOT NULL DEFAULT (datetime('now')),
  respondida TEXT,
  usuario_id INTEGER REFERENCES usuarios(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitaciones_pendiente ON invitaciones(organizacion_id, email) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS idx_invitaciones_email ON invitaciones(email, estado);

-- Tabla de sesiones en vez de un token firmado (JWT). Con JWT, dar de
-- baja a un empleado no lo echa del sistema hasta que el token expire
-- por su cuenta. Con esta tabla, DELETE FROM sesiones WHERE usuario_id=?
-- lo saca en el próximo request — en un sistema que maneja plata y
-- audita todo, eso no es negociable. También evita elegir un algoritmo
-- de firma y gestionar un secreto. Las sesiones sobreviven al reinicio
-- del proceso porque están en disco, que es lo correcto con `--watch`.
--
-- organizacion_id es el negocio en el que está trabajando esa sesión (hist.
-- §77): de acá sale req.usuario.organizacion_id. Es nullable porque en las
-- bases viejas la suma un ALTER; el código siempre la carga, y una sesión
-- sin negocio no pasa el JOIN de sesionValida().
CREATE TABLE IF NOT EXISTS sesiones (
  token TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  creada TEXT NOT NULL DEFAULT (datetime('now')),
  expira TEXT NOT NULL,
  organizacion_id INTEGER REFERENCES organizaciones(id)
);
CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones(usuario_id);

-- Socios, planes, descuentos y cuotas (CLAUDE.md §29, hist. §74 y §75): un
-- módulo que cualquier negocio puede prender y que el gimnasio trae prendido.
-- No es un circuito de datos propio: el socio es un cliente, el plan es un
-- servicio del catálogo y cada cuota es una venta de ese servicio, cobrada
-- como cualquier venta. Estas tablas guardan solo lo que el resto del sistema
-- no tiene: los precios por duración, los descuentos, qué planes hace cada
-- socio, qué período cubre cada cuota y quién entró.
--
-- planes_socio: la actividad o el pase (musculación, funcional, pase libre).
-- Su nombre y si se ofrece son los del producto; el precio, el de cada
-- duración (planes_socio_opciones).
CREATE TABLE IF NOT EXISTS planes_socio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL UNIQUE REFERENCES productos(id),
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id)
);

-- Cada duración de un plan con su precio: mensual, de dos meses, anual o la
-- cantidad de meses que se quiera (la valida server.js, sin CHECK). Una por
-- cantidad de meses: la que se saca del plan se pausa (activo 0) y no se
-- borra, porque puede tener socios y cuotas. Hija de planes_socio.
CREATE TABLE IF NOT EXISTS planes_socio_opciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES planes_socio(id),
  meses INTEGER NOT NULL,
  precio REAL NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1,
  UNIQUE (plan_id, meses)
);

-- Un descuento en porcentaje que baja el precio de cada cuota al generarla.
-- aplica (sin CHECK, lo valida server.js) dice cuándo: 'combo', si el socio
-- tiene todos los planes de descuento_socio_planes; 'cantidad', si tiene
-- minimo_planes o más; 'manual', si se le eligió en su ficha (familiar,
-- estudiante). Si le tocan varios, se aplica el mayor, nunca la suma.
CREATE TABLE IF NOT EXISTS descuentos_socio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  porcentaje REAL NOT NULL,
  aplica TEXT NOT NULL,
  minimo_planes INTEGER,
  activo INTEGER NOT NULL DEFAULT 1,
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id),
  UNIQUE (organizacion_id, nombre)
);

-- Los planes de un combo. Hija de descuentos_socio.
CREATE TABLE IF NOT EXISTS descuento_socio_planes (
  descuento_id INTEGER NOT NULL REFERENCES descuentos_socio(id),
  plan_id INTEGER NOT NULL REFERENCES planes_socio(id),
  PRIMARY KEY (descuento_id, plan_id)
);

-- numero: el número de socio, correlativo por empresa (el que se tipea en la
-- recepción). Lo calcula server.js en la misma transacción del alta, y el
-- UNIQUE es la garantía. descuento_id: su descuento a mano, si tiene.
CREATE TABLE IF NOT EXISTS socios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL UNIQUE REFERENCES clientes(id),
  numero INTEGER NOT NULL,
  fecha_alta TEXT NOT NULL,
  descuento_id INTEGER REFERENCES descuentos_socio(id),
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id),
  UNIQUE (organizacion_id, numero)
);

-- Cada plan que hace un socio, con su duración: puede tener varios a la vez,
-- y cada uno lleva su ciclo y sus cuotas. Un socio de baja es uno sin ningún
-- plan activo. Hija de socios.
-- plan_id repite el plan de opcion_id a propósito: es lo que deja tener un
-- índice único de "un mismo plan activo una sola vez por socio". server.js
-- escribe siempre los dos juntos.
-- fecha_alta: desde cuándo hace ese plan. Las cuotas vencen ese mismo día de
-- cada período (decisión del usuario, 19 de octubre de 2026).
-- ciclo_desde: desde dónde se cuentan los períodos: la fecha de alta, o la de
-- la reactivación después de una baja.
-- cobrar_desde: el primer período que se cobra es el que contiene esta fecha.
-- En un alta de hoy es la misma; en un alta cargada hacia atrás (un socio que
-- ya venía) es el día en que se lo cargó, así Nexo no le inventa meses de
-- deuda de antes de estar en el sistema.
CREATE TABLE IF NOT EXISTS inscripciones_socio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  socio_id INTEGER NOT NULL REFERENCES socios(id),
  plan_id INTEGER NOT NULL REFERENCES planes_socio(id),
  opcion_id INTEGER NOT NULL REFERENCES planes_socio_opciones(id),
  fecha_alta TEXT NOT NULL,
  ciclo_desde TEXT NOT NULL,
  cobrar_desde TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'baja')),
  fecha_baja TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inscripciones_socio_activa
  ON inscripciones_socio(socio_id, plan_id) WHERE estado = 'activa';

-- Una fila por período de un plan: [desde, hasta] y la venta que lo cobra.
-- Las arma server.js cada vez que mira a un socio, sin cron: el UNIQUE de
-- (inscripcion_id, desde) es lo que impide cobrar dos veces el mismo período.
-- precio_lista, descuento_pct y descuento_id son la foto del momento (como el
-- costo histórico de una venta, CLAUDE.md §8): cambiar el precio o el
-- descuento después no reescribe lo que ya se generó. Una cuota cuya venta se
-- anula queda bonificada: el período está cubierto y no se vuelve a generar.
-- Hija de inscripciones_socio.
CREATE TABLE IF NOT EXISTS cuotas_socio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inscripcion_id INTEGER NOT NULL REFERENCES inscripciones_socio(id),
  opcion_id INTEGER NOT NULL REFERENCES planes_socio_opciones(id),
  venta_id INTEGER NOT NULL UNIQUE REFERENCES ventas(id),
  desde TEXT NOT NULL,
  hasta TEXT NOT NULL,
  meses INTEGER NOT NULL,
  precio_lista REAL NOT NULL,
  descuento_pct REAL NOT NULL DEFAULT 0,
  descuento_id INTEGER REFERENCES descuentos_socio(id),
  UNIQUE (inscripcion_id, desde)
);

-- Cada vez que un socio entra por la recepción: quién lo dejó pasar, cuándo y
-- si estaba al día. Es su propio registro de quién y cuándo (CLAUDE.md §22),
-- sin una fila de auditoría por ingreso. al_dia en 0 es alguien que entró
-- debiendo porque lo dejaron pasar igual, y deuda es lo que debía.
CREATE TABLE IF NOT EXISTS ingresos_socio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  socio_id INTEGER NOT NULL REFERENCES socios(id),
  fecha TEXT NOT NULL DEFAULT (datetime('now')),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  al_dia INTEGER NOT NULL CHECK (al_dia IN (0, 1)),
  deuda REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ingresos_socio ON ingresos_socio(socio_id, fecha);

-- Trabajos, u órdenes de trabajo (CLAUDE.md §29, hist. §78): lo que un negocio
-- de servicios tiene que hacer para un cliente, con fecha, responsable y
-- estado. El módulo `trabajos` lo puede prender cualquier negocio. No es un
-- circuito de datos propio: al terminarse pasa a una venta con sus renglones,
-- que se cobra y se factura como cualquier otra (venta_id). Puede salir de un
-- presupuesto aceptado (presupuesto_id): ese presupuesto queda convertido en
-- la misma venta. El índice parcial deja un solo trabajo vivo por presupuesto;
-- uno cancelado no cuenta, así se puede volver a programar.
-- estado: pendiente → en_curso → terminado, o cancelado. 'terminado' solo lo
-- pone el cierre, junto con la venta.
-- fecha y hora: cuándo se hace. NULL = todavía sin fecha.
-- lista_precio_id: la del presupuesto, para la venta (mismo criterio que
-- ventas.lista_precio_id).
CREATE TABLE IF NOT EXISTS trabajos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  presupuesto_id INTEGER REFERENCES presupuestos(id),
  titulo TEXT NOT NULL,
  fecha TEXT,
  hora TEXT,
  responsable_id INTEGER REFERENCES usuarios(id),
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'en_curso', 'terminado', 'cancelado')),
  notas TEXT,
  lista_precio_id INTEGER REFERENCES listas_precios(id),
  venta_id INTEGER UNIQUE REFERENCES ventas(id),
  fecha_creacion TEXT NOT NULL DEFAULT (datetime('now')),
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trabajos_presupuesto_vivo
  ON trabajos(presupuesto_id) WHERE presupuesto_id IS NOT NULL AND estado <> 'cancelado';
CREATE INDEX IF NOT EXISTS idx_trabajos_org_fecha ON trabajos(organizacion_id, fecha);

-- Lo que se va a cobrar por el trabajo: la copia de los renglones del
-- presupuesto, o los que se cargan a mano. Se pueden corregir hasta terminarlo
-- (las horas reales, un material de más). Hija de trabajos.
CREATE TABLE IF NOT EXISTS trabajo_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trabajo_id INTEGER NOT NULL REFERENCES trabajos(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  variante_id INTEGER REFERENCES producto_variantes(id),
  cantidad REAL NOT NULL CHECK (cantidad > 0),
  precio_unitario REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trabajo_items_trabajo ON trabajo_items(trabajo_id);

-- Abonos (CLAUDE.md §29, hist. §79): un servicio que un cliente paga cada
-- tantos meses (mantenimiento, honorarios, una agencia). El módulo `abonos` lo
-- puede prender cualquier negocio. Es el mismo mecanismo que las cuotas de
-- socios: cada período es una venta del servicio, que se cobra como cualquier
-- venta, y server.js las arma al mirar, sin cron (periodosPendientes()).
-- precio y meses: lo que se cobra y cada cuántos meses; cambiarlos rige desde
-- la cuota siguiente, porque cada cuota guarda los suyos.
-- fecha_alta, ciclo_desde y cobrar_desde: lo mismo que en inscripciones_socio.
CREATE TABLE IF NOT EXISTS abonos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  precio REAL NOT NULL,
  meses INTEGER NOT NULL,
  fecha_alta TEXT NOT NULL,
  ciclo_desde TEXT NOT NULL,
  cobrar_desde TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'baja')),
  fecha_baja TEXT,
  notas TEXT,
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id)
);
CREATE INDEX IF NOT EXISTS idx_abonos_org ON abonos(organizacion_id, estado);

-- Una fila por período de un abono, con la venta que lo cobra. El UNIQUE de
-- (abono_id, desde) impide cobrar dos veces el mismo período, como en
-- cuotas_socio. Una cuota cuya venta se anula queda bonificada. Hija de abonos.
CREATE TABLE IF NOT EXISTS cuotas_abono (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  abono_id INTEGER NOT NULL REFERENCES abonos(id),
  venta_id INTEGER NOT NULL UNIQUE REFERENCES ventas(id),
  desde TEXT NOT NULL,
  hasta TEXT NOT NULL,
  meses INTEGER NOT NULL,
  precio REAL NOT NULL,
  UNIQUE (abono_id, desde)
);

-- Consultas (CRM, CLAUDE.md §29, hist. §89): los que preguntan y todavía no
-- compraron. El módulo `crm` lo puede prender cualquier negocio, y el tipo de
-- negocio solo decide con qué etapas nace (etapas_crm en perfiles.js, que
-- db/index.js siembra). No es un circuito propio: una oportunidad pasa a
-- cliente, presupuesto, venta o socio con las altas de siempre, y queda
-- vinculada a lo que generó.

-- Las etapas abiertas del embudo, propias de cada negocio y editables. Ganada
-- y Perdida no son filas: son el estado de la oportunidad, comunes a todos.
-- activa = 0 la pausa: no se ofrece para mover, pero las oportunidades que
-- están en ella siguen ahí.
CREATE TABLE IF NOT EXISTS crm_etapas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  orden INTEGER NOT NULL,
  activa INTEGER NOT NULL DEFAULT 1,
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id),
  UNIQUE (organizacion_id, nombre)
);

-- Una consulta o un cliente potencial.
-- Quién: un cliente que ya existe (cliente_id) o un contacto suelto. El nombre
-- se guarda siempre (contacto_nombre): al pasar a cliente se copia de él.
-- origen: clave de una lista fija de server.js (ORIGENES_CRM), sin CHECK, como
-- productos.unidad.
-- estado: abierta → ganada o perdida; motivo_perdida solo en perdida, y
-- fecha_cierre al cerrarse. etapa_id es en qué etapa quedó.
-- presupuesto_id, venta_id y socio_id: lo que generó. Cuando ese presupuesto
-- se convierte en venta, o sale la venta o el socio, se gana sola.
-- La próxima acción no se guarda: es su actividad pendiente más próxima.
CREATE TABLE IF NOT EXISTS crm_oportunidades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER REFERENCES clientes(id),
  contacto_nombre TEXT NOT NULL,
  contacto_telefono TEXT,
  contacto_email TEXT,
  origen TEXT,
  interes TEXT,
  valor_estimado REAL,
  responsable_id INTEGER REFERENCES usuarios(id),
  etapa_id INTEGER NOT NULL REFERENCES crm_etapas(id),
  estado TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'ganada', 'perdida')),
  motivo_perdida TEXT,
  fecha_cierre TEXT,
  presupuesto_id INTEGER REFERENCES presupuestos(id),
  venta_id INTEGER REFERENCES ventas(id),
  socio_id INTEGER REFERENCES socios(id),
  fecha TEXT NOT NULL,
  fecha_creacion TEXT NOT NULL DEFAULT (datetime('now')),
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id)
);
CREATE INDEX IF NOT EXISTS idx_crm_oportunidades_org ON crm_oportunidades(organizacion_id, estado, etapa_id);
CREATE INDEX IF NOT EXISTS idx_crm_oportunidades_presupuesto ON crm_oportunidades(presupuesto_id);
CREATE INDEX IF NOT EXISTS idx_crm_oportunidades_cliente ON crm_oportunidades(cliente_id);

-- Llamada, mensaje, visita, nota o tarea. Cuelga de una oportunidad, de un
-- cliente o de los dos (server.js exige al menos uno). Tiene organizacion_id
-- propio para listar "Para hoy" sin pasar por la oportunidad.
-- fecha: para cuándo es; NULL en una nota, que no vence. fecha_hecha: cuándo
-- se marcó hecha.
CREATE TABLE IF NOT EXISTS crm_actividades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  oportunidad_id INTEGER REFERENCES crm_oportunidades(id),
  cliente_id INTEGER REFERENCES clientes(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('llamada', 'mensaje', 'visita', 'nota', 'tarea')),
  descripcion TEXT NOT NULL,
  fecha TEXT,
  hecha INTEGER NOT NULL DEFAULT 0,
  fecha_hecha TEXT,
  usuario_id INTEGER REFERENCES usuarios(id),
  fecha_creacion TEXT NOT NULL DEFAULT (datetime('now')),
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id)
);
CREATE INDEX IF NOT EXISTS idx_crm_actividades_pendientes ON crm_actividades(organizacion_id, hecha, fecha);
CREATE INDEX IF NOT EXISTS idx_crm_actividades_oportunidad ON crm_actividades(oportunidad_id);
CREATE INDEX IF NOT EXISTS idx_crm_actividades_cliente ON crm_actividades(cliente_id);
