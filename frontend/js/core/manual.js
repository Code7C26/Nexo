/**
 * core/manual.js
 * El manual de uso de Nexo (hist. §118), como datos: lo pinta la vista Ayuda
 * (dominios/ayuda.js) y lo busca el asistente (core/buscar-ayuda.js) para
 * responder "¿cómo hago…?" sin llamar a la IA.
 *
 * Cada sección:
 * - id: va en el enlace (#/ayuda/<id>); no se cambia una vez publicado.
 * - grupo y titulo: el índice.
 * - pantalla: [hash, nombre] de la pantalla de Nexo donde se hace, si hay una.
 * - modulo: la función opcional del tipo de negocio que la trae (CLAUDE.md §29).
 * - admin: true si solo lo hace quien administra el negocio.
 * - preguntas: cómo lo preguntaría alguien; pesan mucho en la búsqueda.
 * - palabras: otras formas de nombrar lo mismo.
 * - bloques: un texto es un párrafo; { pasos }, { lista } y { nota }.
 *   **así** queda en negrita.
 * - ver: ids de secciones relacionadas.
 *
 * Escrito para quien nunca usó Nexo: los nombres de los botones, tal cual se
 * ven en pantalla. Si un botón cambia de nombre, se cambia acá también.
 */

export const GRUPOS = [
  "Empezar",
  "Productos y servicios",
  "Vender",
  "Facturar",
  "Clientes",
  "Comprar y stock",
  "Plata",
  "Servicios y gimnasio",
  "Tu cuenta y tu equipo"
];

export const SECCIONES = [
  /* ---------- Empezar ---------- */
  {
    id: "empezar",
    grupo: "Empezar",
    titulo: "Cómo está organizado Nexo",
    preguntas: ["cómo se usa nexo", "por dónde empiezo", "qué hace nexo", "cómo funciona el sistema", "dónde está cada cosa"],
    palabras: ["menu", "inicio", "empezar", "organizado", "secciones"],
    bloques: [
      "Nexo junta en un solo lugar lo que pasa en tu negocio: lo que vendés, lo que comprás, el stock, la plata y tus clientes. Cada cosa que cargás actualiza sola a las demás: una venta descuenta el stock, suma al cliente lo que te debe y entra en la caja cuando la cobrás.",
      { lista: [
        "**El menú de la izquierda** (en el celular, la barra de abajo y \"Más\") tiene todas las pantallas, agrupadas: productos y clientes, ventas, compras, stock y plata.",
        "**Resumen** muestra cómo va el negocio: lo que vendiste, lo que ganaste y lo que gastaste en el período.",
        "**El asistente** (el botón con brillitos) carga ventas, compras y gastos contándoselos, y responde dudas como esta.",
        "**Configuración** tiene los datos del negocio, las funciones que usás, tu equipo y esta ayuda."
      ] },
      "Si recién empezás, en Resumen vas a ver una guía de primeros pasos: cargar un producto, un cliente y tu primera venta."
    ],
    ver: ["asistente", "cargar-producto", "registrar-venta"]
  },
  {
    id: "asistente",
    grupo: "Empezar",
    titulo: "El asistente: cargar contándolo",
    pantalla: ["#/asistente", "Asistente"],
    preguntas: ["cómo uso el asistente", "puedo cargar una venta hablando", "cómo dicto", "para qué sirve el asistente", "puedo hablarle", "cómo cargo por voz"],
    palabras: ["asistente", "ia", "inteligencia", "voz", "dictar", "microfono", "hablar", "audio", "chat"],
    bloques: [
      "El asistente entiende frases como las que le dirías a alguien: \"vendí 3 remeras a Juan por 45 mil y me pagó por Mercado Pago\", \"compré 10 pantalones a Textil Norte a 9 mil cada uno\", \"pagué 25 mil de luz en efectivo\" o \"Juan me devolvió la remera, le quedó chica\".",
      { pasos: [
        "Abrí el asistente con el botón de brillitos, o desde **Asistente** en el menú.",
        "Escribí lo que pasó, o tocá el **micrófono**, decilo y tocalo otra vez para terminar.",
        "Te muestra cómo lo entendió: el cliente, los productos, las cantidades, los precios y el cobro. Corregí lo que haga falta.",
        "Tocá **Confirmar y registrar**. Hasta ese momento no se carga nada."
      ] },
      "También le podés preguntar cómo se hace algo en Nexo (\"¿cómo anulo una venta?\") y te responde con este manual.",
      { nota: "Para que te entienda mejor, nombrá los productos como están cargados. Si un producto no existe, la venta no se puede confirmar hasta corregirlo; en una compra, el producto nuevo se crea solo." }
    ],
    ver: ["registrar-venta", "registrar-compra", "registrar-gasto"]
  },
  {
    id: "celular",
    grupo: "Empezar",
    titulo: "Usar Nexo en el celular",
    pantalla: ["#/configuracion/apariencia", "Configuración › Apariencia"],
    preguntas: ["cómo instalo nexo en el celular", "hay app para el celular", "funciona sin internet", "cómo lo pongo en la pantalla de inicio", "cambiar a modo oscuro"],
    palabras: ["celular", "telefono", "app", "aplicacion", "instalar", "movil", "android", "iphone", "offline", "internet", "tema", "oscuro", "claro"],
    bloques: [
      "Nexo funciona en el navegador del celular y se puede instalar como una app, con su ícono en la pantalla de inicio. No hace falta bajar nada de una tienda.",
      { pasos: [
        "Entrá a Nexo desde el navegador del celular.",
        "Andá a **Configuración › Apariencia** y tocá **Instalar Nexo**. En el iPhone: el botón de compartir de Safari y \"Agregar a inicio\".",
        "Desde ahí mismo elegís el tema claro u oscuro."
      ] },
      "Sin conexión, Nexo abre y muestra lo último que cargó, con un aviso arriba. Para cargar algo nuevo hace falta internet."
    ]
  },

  /* ---------- Productos y servicios ---------- */
  {
    id: "cargar-producto",
    grupo: "Productos y servicios",
    titulo: "Cargar un producto o un servicio",
    pantalla: ["#/productos", "Productos"],
    preguntas: ["cómo cargo un producto", "cómo agrego un artículo", "cómo doy de alta un servicio", "cómo cambio el precio de un producto", "cómo vendo por kilo", "dónde pongo el costo"],
    palabras: ["producto", "articulo", "servicio", "alta", "precio", "costo", "sku", "codigo", "barras", "kilo", "kg", "unidad", "medida", "catalogo", "editar"],
    bloques: [
      { pasos: [
        "Entrá a **Productos** (puede llamarse Servicios, según tu negocio) y tocá **Nuevo producto**.",
        "Poné el nombre, el precio de venta y, si lo sabés, el costo. El precio es el final, con IVA incluido.",
        "Elegí la unidad: por unidad, o por kilo, gramo, litro o metro si lo vendés fraccionado.",
        "Si es un servicio (un corte, una clase, una hora de trabajo), elegí el tipo servicio: no lleva stock.",
        "Tocá **Guardar producto**."
      ] },
      "Para cambiar un precio, abrí el producto desde la lista y editalo. El código o SKU sirve para buscarlo rápido y para el lector de código de barras.",
      { nota: "El costo se actualiza solo cada vez que cargás una compra: Nexo hace el promedio entre lo que tenías y lo que entró." }
    ],
    ver: ["variantes", "listas-precios", "categorias", "registrar-compra"]
  },
  {
    id: "variantes",
    grupo: "Productos y servicios",
    titulo: "Talles, colores y variantes",
    pantalla: ["#/productos", "Productos"],
    preguntas: ["cómo cargo talles", "cómo pongo colores", "un producto con varios talles", "cómo hago variantes"],
    palabras: ["talle", "talles", "color", "colores", "variante", "variantes", "atributo", "modelo"],
    bloques: [
      "Si vendés el mismo producto en varios talles o colores, cargalo una vez y armá sus variantes: cada combinación tiene su propio stock y su código.",
      { pasos: [
        "Abrí el producto y tocá **Variantes**.",
        "Tocá **Agregar atributo** (por ejemplo, Talle) y cargá sus valores (S, M, L). Repetí con Color si hace falta.",
        "Tocá **Generar variantes**: Nexo arma todas las combinaciones."
      ] },
      "Al vender, elegís la variante exacta (Remera negra M)."
    ]
  },
  {
    id: "listas-precios",
    grupo: "Productos y servicios",
    titulo: "Listas de precios (minorista, mayorista…)",
    pantalla: ["#/configuracion/listas-precios", "Configuración › Listas de precios"],
    admin: true,
    preguntas: ["cómo pongo precio mayorista", "puedo tener dos precios", "cómo hago una lista de precios", "precio con tarjeta"],
    palabras: ["lista", "listas", "mayorista", "minorista", "tarjeta", "precios", "precio"],
    bloques: [
      "Un mismo producto puede tener un precio distinto según a quién le vendés: minorista, mayorista, con tarjeta.",
      { pasos: [
        "En **Productos**, tocá **Listas de precios** y agregá las que uses.",
        "En cada producto, cargá su precio en cada lista.",
        "Al hacer una venta o un presupuesto, elegí la lista: los precios salen de ahí."
      ] }
    ]
  },
  {
    id: "categorias",
    grupo: "Productos y servicios",
    titulo: "Categorías de productos",
    pantalla: ["#/configuracion/categorias-productos", "Configuración › Categorías"],
    admin: true,
    preguntas: ["cómo agrupo los productos", "cómo creo una categoría", "cómo ordeno el catálogo"],
    palabras: ["categoria", "categorias", "rubro", "grupo", "agrupar", "familia"],
    bloques: [
      "Las categorías agrupan tus productos (bebidas, almacén, remeras) y sirven para filtrar la lista y para ver en Resumen qué se vende de cada una.",
      "Se arman en **Productos › Categorías**, y en cada producto elegís la suya."
    ]
  },

  /* ---------- Vender ---------- */
  {
    id: "punto-de-venta",
    grupo: "Vender",
    titulo: "Vender en el mostrador (Punto de venta)",
    pantalla: ["#/pos", "Punto de venta"],
    modulo: "pos",
    preguntas: ["cómo vendo en el mostrador", "cómo abro la caja", "cómo cierro la caja", "cómo cobro con el lector", "cómo hago el arqueo", "cómo doy el vuelto", "cómo cobro con dos medios de pago"],
    palabras: ["mostrador", "punto", "pos", "caja", "turno", "abrir", "cerrar", "arqueo", "vuelto", "lector", "escanear", "codigo", "barras", "cobrar", "rapida"],
    bloques: [
      "Es la pantalla para vender rápido, parado frente al cliente.",
      { pasos: [
        "Al empezar el día, tocá **Abrir caja** y contá el efectivo con el que arrancás.",
        "Buscá cada producto por nombre o código, o pasalo por el lector (también sirve la cámara del celular).",
        "Tocá **Cobrar** y elegí cómo paga: efectivo, transferencia, tarjeta… Puede pagar con más de uno. Si es en efectivo, Nexo calcula el vuelto.",
        "Al terminar el día, tocá **Cerrar caja** y contá el efectivo: Nexo te dice si coincide con lo que debería haber."
      ] },
      "Sin elegir cliente, la venta va a Consumidor final. Para dejarle algo a cuenta a alguien, elegí el cliente: a Consumidor final no se le fía.",
      { nota: "Si no ves Punto de venta en el menú, prendelo en Configuración › Funciones." }
    ],
    ver: ["caja", "registrar-venta", "funciones"]
  },
  {
    id: "registrar-venta",
    grupo: "Vender",
    titulo: "Registrar una venta",
    pantalla: ["#/ventas", "Ventas"],
    preguntas: ["cómo cargo una venta", "cómo registro una venta", "cómo vendo", "cómo hago una venta a cuenta", "cómo le vendo a un cliente", "cómo vendo fiado"],
    palabras: ["venta", "ventas", "vender", "registrar", "cargar", "nueva", "fiado", "cuenta", "credito"],
    bloques: [
      { pasos: [
        "Entrá a **Ventas** y tocá **Nueva venta**.",
        "Elegí el cliente y la lista de precios.",
        "Agregá los productos con su cantidad: el precio sale de la lista y lo podés cambiar.",
        "Si ya te pagó, cargá el cobro (cuánto y a qué cuenta entró). Si no, queda a cuenta: lo debe.",
        "Tocá **Registrar venta**."
      ] },
      "Al registrarla, Nexo descuenta el stock, guarda el costo de ese momento para calcular la ganancia y, si quedó algo sin cobrar, lo suma a lo que te debe el cliente.",
      "También la podés cargar desde el asistente: \"vendí 2 buzos a Sole a 28 mil cada uno, pagó en efectivo\"."
    ],
    ver: ["cobrar", "anular-venta", "facturar", "punto-de-venta"]
  },
  {
    id: "cobrar",
    grupo: "Vender",
    titulo: "Cobrar una venta o una deuda",
    pantalla: ["#/cuentas-corrientes", "Cuentas corrientes"],
    preguntas: ["cómo cobro una venta", "cómo registro un pago de un cliente", "me pagó lo que debía", "cómo cobro una deuda", "cómo cargo un pago parcial"],
    palabras: ["cobro", "cobrar", "cobre", "pago", "pagó", "deuda", "debe", "parcial", "saldo", "seña"],
    bloques: [
      "Una venta y su cobro son cosas distintas: podés vender hoy y cobrar en partes.",
      { pasos: [
        "Abrí la venta (desde **Ventas** o desde la ficha del cliente) y tocá **Cobrar**.",
        "Poné cuánto te pagó y a qué cuenta entró la plata (efectivo, banco, Mercado Pago).",
        "Tocá **Registrar cobro**."
      ] },
      "El cobro baja lo que debe el cliente y suma la plata a esa cuenta en Caja."
    ],
    ver: ["cuentas-corrientes", "caja"]
  },
  {
    id: "anular-venta",
    grupo: "Vender",
    titulo: "Anular una venta",
    pantalla: ["#/ventas", "Ventas"],
    admin: true,
    preguntas: ["cómo anulo una venta", "cómo borro una venta", "me equivoqué en una venta", "cómo cancelo una venta", "cómo elimino una venta"],
    palabras: ["anular", "anulo", "borrar", "eliminar", "cancelar", "equivoque", "error", "deshacer"],
    bloques: [
      { pasos: [
        "Abrí la venta desde **Ventas**.",
        "Tocá **Anular** y confirmá."
      ] },
      "Al anularla, los productos vuelven al stock y la venta pasa a la Papelera, desde donde se puede restaurar.",
      { nota: "No se puede anular una venta que ya tiene cobros, una factura o una devolución. Si ya la cobraste o la facturaste, lo que corresponde es una devolución (con su nota de crédito)." }
    ],
    ver: ["devolucion-venta", "papelera"]
  },
  {
    id: "devolucion-venta",
    grupo: "Vender",
    titulo: "Devolución de un cliente",
    pantalla: ["#/devoluciones", "Devoluciones"],
    preguntas: ["cómo hago una devolución", "un cliente me devolvió algo", "cómo cambio un producto", "cómo hago una nota de crédito"],
    palabras: ["devolucion", "devolver", "devolvio", "cambio", "nota", "credito", "reintegro"],
    bloques: [
      { pasos: [
        "Abrí la venta original desde **Ventas** y tocá **Devolver**.",
        "Elegí qué productos y cuántos te devuelve.",
        "Tocá **Registrar devolución**."
      ] },
      "Los productos vuelven al stock y se descuenta de la venta. Si la venta estaba facturada, desde la devolución tocás **Emitir nota de crédito**.",
      "Todas las devoluciones quedan en **Devoluciones**.",
      "También se la podés contar al asistente: \"Juan me devolvió la remera, le quedó chica\". Busca la venta y te muestra qué se devuelve antes de cargarlo."
    ],
    ver: ["anular-venta", "facturar"]
  },
  {
    id: "presupuestos",
    grupo: "Vender",
    titulo: "Presupuestos",
    pantalla: ["#/presupuestos", "Presupuestos"],
    modulo: "presupuestos",
    preguntas: ["cómo hago un presupuesto", "cómo paso un presupuesto a venta", "cómo mando un presupuesto", "cómo imprimo un presupuesto"],
    palabras: ["presupuesto", "presupuestos", "cotizacion", "cotizar", "convertir", "aceptado", "rechazado", "vencido"],
    bloques: [
      { pasos: [
        "Entrá a **Presupuestos** y tocá **Nuevo presupuesto**.",
        "Elegí el cliente, la fecha hasta la que vale y los productos.",
        "Tocá **Guardar presupuesto**. Desde su ficha lo imprimís o lo guardás en PDF para mandarlo."
      ] },
      "Un presupuesto no toca el stock. Cuando el cliente acepta, abrilo y tocá **Convertir en venta**: se arma la venta con los mismos productos y precios.",
      "Si pasa la fecha, se ve como vencido. También lo podés marcar como aceptado o rechazado."
    ],
    ver: ["registrar-venta", "trabajos"]
  },

  /* ---------- Facturar ---------- */
  {
    id: "facturar",
    grupo: "Facturar",
    titulo: "Hacer una factura",
    pantalla: ["#/facturas", "Facturas"],
    preguntas: ["cómo hago una factura", "cómo facturo una venta", "cómo imprimo una factura", "cómo saco el pdf de la factura", "qué letra de factura me corresponde", "factura a o b"],
    palabras: ["factura", "facturar", "facturas", "comprobante", "imprimir", "pdf", "ticket", "letra", "a", "b", "c"],
    bloques: [
      "Podés facturar una venta que ya cargaste, o hacer una factura suelta.",
      { pasos: [
        "Para una venta: abrila y tocá **Facturar**. Para una suelta: **Facturas › Nueva factura**.",
        "Revisá los datos del cliente y la condición de venta.",
        "Tocá **Generar factura**. Desde su ficha, **Imprimir / PDF**."
      ] },
      "La letra (A, B o C) sale sola, según tu condición frente al IVA y la del cliente.",
      { nota: "Sin la factura electrónica activada, el comprobante es interno: sale con una X y \"No válido como factura\". Para facturar ante ARCA, mirá Factura electrónica." }
    ],
    ver: ["factura-electronica", "iva", "datos-del-negocio"]
  },
  {
    id: "factura-electronica",
    grupo: "Facturar",
    titulo: "Factura electrónica con ARCA",
    pantalla: ["#/configuracion/factura-electronica", "Configuración › Factura electrónica"],
    admin: true,
    preguntas: ["cómo activo la factura electrónica", "cómo conecto con arca", "cómo saco el cae", "cómo facturo con afip", "qué es el cae"],
    palabras: ["arca", "afip", "cae", "electronica", "fiscal", "homologacion", "delegacion", "punto", "venta", "cuit"],
    bloques: [
      "Con la factura electrónica activada, cada factura y nota de crédito sale con su CAE, el número que da ARCA y que la hace válida.",
      { pasos: [
        "Entrá a **Configuración › Factura electrónica**.",
        "Seguí los pasos para darle permiso a Nexo desde ARCA. Nexo nunca te pide tu clave fiscal.",
        "Cargá tu CUIT, tu condición frente al IVA y el punto de venta, y tocá **Verificar con ARCA**.",
        "Listo: al hacer una factura, Nexo le pide el CAE a ARCA. Si ARCA no responde, queda pendiente y se reintenta con **Pedir el CAE a ARCA**."
      ] },
      { nota: "Hoy funciona en el ambiente de prueba de ARCA: los comprobantes dicen \"Comprobante de prueba – sin validez fiscal\"." }
    ],
    ver: ["facturar", "iva"]
  },
  {
    id: "iva",
    grupo: "Facturar",
    titulo: "IVA",
    pantalla: ["#/configuracion/negocio", "Configuración › Datos del negocio"],
    preguntas: ["cómo cargo el iva", "dónde veo el iva", "el precio incluye iva", "soy responsable inscripto", "soy monotributista", "libro iva"],
    palabras: ["iva", "impuesto", "alicuota", "inscripto", "monotributo", "monotributista", "exento", "consumidor", "final", "condicion", "libro", "debito", "credito", "fiscal"],
    bloques: [
      { lista: [
        "**Tu condición** (responsable inscripto, monotributo, exento) va en Configuración › Datos del negocio.",
        "**La de cada cliente y proveedor**, en su ficha. Vacía es consumidor final.",
        "**La alícuota de cada producto** (21 %, 10,5 %…) va en el producto. El precio que cargás es el final, con IVA incluido."
      ] },
      "Con eso Nexo elige la letra de cada factura, discrimina el IVA en la A y lo guarda en cada renglón.",
      "Si sos responsable inscripto, el IVA de las compras con factura A es crédito fiscal y no suma al costo, y la ganancia se calcula sin IVA. En **Resumen** ves el IVA del período y el libro IVA de ventas y de compras."
    ],
    ver: ["facturar", "datos-del-negocio"]
  },

  /* ---------- Clientes ---------- */
  {
    id: "clientes",
    grupo: "Clientes",
    titulo: "Clientes",
    pantalla: ["#/clientes", "Clientes"],
    preguntas: ["cómo cargo un cliente", "cómo doy de alta un cliente", "dónde veo lo que compró un cliente", "cómo le pongo un límite de crédito"],
    palabras: ["cliente", "clientes", "alta", "ficha", "datos", "contacto", "limite", "credito", "condicion", "pago"],
    bloques: [
      { pasos: [
        "Entrá a **Clientes** (o CRM) y tocá **Nuevo cliente**.",
        "Cargá el nombre y lo que tengas: teléfono, mail, CUIT, su condición frente al IVA y en cuántos días te suele pagar.",
        "Tocá **Guardar cliente**."
      ] },
      "En la ficha de cada cliente ves todo lo que te compró, lo que te debe y sus movimientos."
    ],
    ver: ["crm", "cuentas-corrientes"]
  },
  {
    id: "crm",
    grupo: "Clientes",
    titulo: "Consultas y seguimiento (CRM)",
    pantalla: ["#/clientes/consultas", "CRM"],
    modulo: "crm",
    preguntas: ["cómo anoto una consulta", "cómo hago seguimiento a un cliente", "qué es el crm", "cómo veo a quién tengo que llamar hoy", "qué clientes dejaron de comprar", "cómo marco una consulta como perdida"],
    palabras: ["crm", "consulta", "consultas", "seguimiento", "embudo", "etapa", "potencial", "interesado", "llamar", "hoy", "dejaron", "perdida", "ganada", "tarea"],
    bloques: [
      "El CRM es para la gente que todavía no te compró: quién preguntó, qué busca y cuándo volver a escribirle.",
      { pasos: [
        "En **CRM**, tocá **Nueva consulta** y anotá quién es y qué le interesa.",
        "Arrastrá la tarjeta de etapa a medida que avanza.",
        "Con **Anotar seguimiento** dejás la próxima acción (llamarlo el jueves) y Nexo te la recuerda en \"Para hoy\".",
        "Cuando compra, pasala a cliente, presupuesto o venta sin volver a cargar nada. Si no compra, **Marcar como perdida** y elegí por qué."
      ] },
      "En \"Dejaron de comprar\" ves los clientes que hace tiempo que no vuelven, para escribirles."
    ],
    ver: ["clientes", "presupuestos"]
  },
  {
    id: "cuentas-corrientes",
    grupo: "Clientes",
    titulo: "Quién te debe y a quién le debés",
    pantalla: ["#/cuentas-corrientes", "Cuentas corrientes"],
    preguntas: ["quién me debe", "cuánto me deben", "a quién le debo", "cómo veo las deudas de los clientes", "qué facturas vencen", "cuenta corriente de un cliente"],
    palabras: ["cuenta", "corriente", "deuda", "deudas", "debe", "deben", "debo", "saldo", "vencimiento", "vencidas", "cobrar", "pagar", "fiado", "plata"],
    bloques: [
      "En **Cuentas corrientes** tenés dos listas: **Por cobrar** (lo que te deben tus clientes) y **Por pagar** (lo que les debés a tus proveedores), con lo vencido y lo que está por vencer.",
      "El saldo sale de las ventas, compras, cobros y pagos que cargaste: no se edita a mano. Para bajar una deuda, cargá el cobro o el pago."
    ],
    ver: ["cobrar", "pagar-proveedor"]
  },

  /* ---------- Comprar y stock ---------- */
  {
    id: "registrar-compra",
    grupo: "Comprar y stock",
    titulo: "Registrar una compra",
    pantalla: ["#/compras", "Compras"],
    modulo: "compras",
    admin: true,
    preguntas: ["cómo cargo una compra", "cómo registro mercadería que compré", "cómo cargo el envío de una compra", "cómo entra la mercadería al stock", "cómo actualizo el costo"],
    palabras: ["compra", "compras", "compre", "mercaderia", "proveedor", "envio", "flete", "recibido", "pedido", "camino", "costo", "reponer"],
    bloques: [
      { pasos: [
        "Entrá a **Compras** y tocá **Nueva compra**.",
        "Elegí el proveedor y cargá los productos con su costo. Si un producto no existe, se crea ahí mismo.",
        "Si pagaste envío, cargalo: Nexo lo reparte entre los productos según lo que vale cada uno.",
        "Si tenés la factura del proveedor, cargá su letra y número.",
        "Confirmala. Mientras esté como pedido o en camino, el stock no cambia: sube cuando la marcás como recibida."
      ] },
      "Al recibirla, Nexo actualiza el costo de cada producto con el promedio entre lo que tenías y lo que entró."
    ],
    ver: ["pagar-proveedor", "stock", "proveedores"]
  },
  {
    id: "pagar-proveedor",
    grupo: "Comprar y stock",
    titulo: "Pagarle a un proveedor",
    pantalla: ["#/compras", "Compras"],
    modulo: "compras",
    admin: true,
    preguntas: ["cómo le pago a un proveedor", "cómo registro un pago a proveedor", "cuánto le debo al proveedor"],
    palabras: ["pagar", "pago", "proveedor", "deuda", "debo", "saldar"],
    bloques: [
      { pasos: [
        "Abrí la compra desde **Compras** y tocá **Pagar**.",
        "Poné cuánto pagaste y de qué cuenta salió la plata.",
        "Tocá **Registrar pago**."
      ] },
      "Lo que les debés a todos tus proveedores lo ves en **Cuentas corrientes › Por pagar**."
    ],
    ver: ["cuentas-corrientes", "caja"]
  },
  {
    id: "proveedores",
    grupo: "Comprar y stock",
    titulo: "Proveedores",
    pantalla: ["#/proveedores", "Proveedores"],
    preguntas: ["cómo cargo un proveedor", "dónde veo lo que le compré a un proveedor"],
    palabras: ["proveedor", "proveedores", "distribuidor", "mayorista", "alta"],
    bloques: [
      "En **Proveedores › Nuevo proveedor** cargás su nombre, CUIT, condición frente al IVA y contacto. En su ficha ves lo que le compraste y lo que le debés.",
      "Si le devolvés mercadería, se hace desde **Dev. a proveedor**: el stock baja y se descuenta de lo que le debés."
    ],
    ver: ["registrar-compra", "pagar-proveedor"]
  },
  {
    id: "stock",
    grupo: "Comprar y stock",
    titulo: "Ver y ajustar el stock",
    pantalla: ["#/stock", "Stock"],
    modulo: "stock",
    preguntas: ["cómo veo el stock", "cómo corrijo el stock", "cómo ajusto el inventario", "se me rompió un producto", "cómo cargo una pérdida de mercadería", "por qué cambió el stock"],
    palabras: ["stock", "inventario", "existencia", "ajuste", "ajustar", "corregir", "merma", "rotura", "perdida", "vencido", "historial", "movimientos", "conteo"],
    bloques: [
      "En **Stock** ves cuánto hay de cada producto en cada depósito. Cada venta, compra o devolución lo mueve solo.",
      { pasos: [
        "Si contaste y no coincide, o se rompió o venció algo, tocá **Ajustar stock**.",
        "Elegí el producto, la cantidad real o la diferencia, y el motivo.",
        "Tocá **Guardar ajuste**."
      ] },
      "En el **Historial de movimientos** ves cada cambio: cuándo, quién y por qué."
    ],
    ver: ["depositos", "que-reponer"]
  },
  {
    id: "depositos",
    grupo: "Comprar y stock",
    titulo: "Varios depósitos y transferencias",
    pantalla: ["#/stock", "Stock"],
    modulo: "stock",
    preguntas: ["cómo paso mercadería de un depósito a otro", "tengo dos locales", "cómo agrego un depósito", "cómo transfiero stock"],
    palabras: ["deposito", "depositos", "local", "locales", "dos", "transferir", "transferencia", "mover", "galpon"],
    bloques: [
      "Si guardás mercadería en más de un lugar, cada uno es un depósito con su propio stock.",
      { pasos: [
        "Agregá los depósitos desde **Stock › Depósitos**.",
        "Para mover mercadería, tocá **Transferir**, elegí de dónde a dónde y cuánto."
      ] }
    ],
    ver: ["stock"]
  },
  {
    id: "que-reponer",
    grupo: "Comprar y stock",
    titulo: "Qué reponer",
    pantalla: ["#/reportes-stock", "Reportes de stock"],
    modulo: "stock",
    admin: true,
    preguntas: ["qué tengo que comprar", "qué productos se están por acabar", "qué tengo sin stock", "qué se vende más rápido"],
    palabras: ["reponer", "reposicion", "faltante", "falta", "minimo", "bajo", "agotado", "rotacion", "comprar"],
    bloques: [
      "En **Reportes de stock** ves lo que está por debajo del mínimo, lo que no tiene stock y qué tan rápido rota cada producto.",
      "El mínimo de cada producto se carga en el producto."
    ],
    ver: ["stock", "registrar-compra"]
  },

  /* ---------- Plata ---------- */
  {
    id: "caja",
    grupo: "Plata",
    titulo: "Caja y cuentas",
    pantalla: ["#/caja", "Caja"],
    preguntas: ["cuánta plata tengo", "cómo agrego una cuenta de banco", "cómo agrego mercado pago", "cómo paso plata de una cuenta a otra", "cómo cargo un ingreso de plata", "cómo retiro plata de la caja"],
    palabras: ["caja", "cuenta", "cuentas", "banco", "efectivo", "mercado", "pago", "billetera", "saldo", "plata", "dinero", "transferencia", "movimiento", "ingreso", "retiro", "tesoreria"],
    bloques: [
      "En **Caja** están tus cuentas (el efectivo, el banco, Mercado Pago) con lo que hay en cada una.",
      { lista: [
        "**Cuenta**: agrega una cuenta nueva, con su saldo inicial.",
        "**Transferencia**: pasa plata de una cuenta a otra (depositar el efectivo en el banco).",
        "**Movimiento**: un ingreso o un egreso que no es venta, compra ni gasto."
      ] },
      "Los cobros, los pagos y los gastos mueven estas cuentas solos. Una venta sin cobrar no suma a la caja hasta que la cobrás."
    ],
    ver: ["cobrar", "registrar-gasto", "punto-de-venta"]
  },
  {
    id: "registrar-gasto",
    grupo: "Plata",
    titulo: "Registrar un gasto",
    pantalla: ["#/gastos", "Gastos"],
    preguntas: ["cómo cargo un gasto", "cómo registro el alquiler", "dónde pongo la luz", "cómo cargo un sueldo", "cómo creo una categoría de gasto", "cómo registro un retiro del dueño"],
    palabras: ["gasto", "gastos", "alquiler", "luz", "agua", "gas", "internet", "servicios", "sueldo", "impuesto", "nafta", "publicidad", "retiro", "inversion", "categoria", "pague"],
    bloques: [
      "Un gasto es lo que pagás para que el negocio funcione y no es mercadería para revender: alquiler, luz, internet, publicidad, nafta.",
      { pasos: [
        "Entrá a **Gastos** y tocá **Nuevo gasto**.",
        "Elegí la categoría, el importe y de qué cuenta salió la plata.",
        "Tocá **Registrar gasto**."
      ] },
      "Las categorías se arman en **Gastos › Categorías**. Cada una dice si es un gasto operativo, una inversión (una heladera nueva) o un retiro del dueño: así el Resumen calcula bien el resultado.",
      "Desde el asistente: \"pagué 25 mil de luz en efectivo\"."
    ],
    ver: ["caja", "resumen"]
  },
  {
    id: "resumen",
    grupo: "Plata",
    titulo: "Cómo va el negocio (Resumen)",
    pantalla: ["#/dashboard", "Resumen"],
    admin: true,
    preguntas: ["cuánto vendí este mes", "cuánto gané", "cómo veo la ganancia", "qué es lo que más vendo", "quiénes son mis mejores clientes", "cómo veo las estadísticas", "cuál es mi margen"],
    palabras: ["resumen", "estadisticas", "reporte", "reportes", "ganancia", "gane", "margen", "resultado", "vendi", "mes", "periodo", "evolucion", "mejores", "rentabilidad", "numeros"],
    bloques: [
      "En **Resumen** elegís el período (este mes, el anterior, el año) y ves:",
      { lista: [
        "lo que vendiste, lo que te costó eso, la ganancia, los gastos y el resultado, comparado con el período anterior;",
        "cómo viene el resultado mes a mes;",
        "qué se vende, por categoría y los mejores clientes;",
        "qué se compra y a quién;",
        "el IVA del período."
      ] },
      "La ganancia de cada venta usa el costo que tenía el producto cuando lo vendiste, aunque después cambie."
    ],
    ver: ["iva", "que-reponer"]
  },

  /* ---------- Servicios y gimnasio ---------- */
  {
    id: "trabajos",
    grupo: "Servicios y gimnasio",
    titulo: "Trabajos (órdenes de trabajo)",
    pantalla: ["#/trabajos", "Trabajos"],
    modulo: "trabajos",
    preguntas: ["cómo cargo un trabajo", "cómo hago una orden de trabajo", "cómo organizo los trabajos del día", "cómo cobro un trabajo terminado"],
    palabras: ["trabajo", "trabajos", "orden", "ordenes", "servicio", "tecnico", "reparacion", "agenda", "responsable", "terminado"],
    bloques: [
      { pasos: [
        "Entrá a **Trabajos** y tocá **Nuevo trabajo**, o pasá a trabajo un presupuesto aceptado.",
        "Poné el día, quién lo hace y qué se cobra.",
        "Cuando lo terminás, pasalo a venta para cobrarlo."
      ] },
      "Las pestañas separan lo que está por hacer, lo de hoy, lo terminado y lo cancelado."
    ],
    ver: ["presupuestos", "abonos"]
  },
  {
    id: "abonos",
    grupo: "Servicios y gimnasio",
    titulo: "Abonos (cobros que se repiten)",
    pantalla: ["#/abonos", "Abonos"],
    modulo: "abonos",
    preguntas: ["cómo cobro todos los meses lo mismo", "cómo hago un abono", "cómo cargo una suscripción", "quién debe el abono"],
    palabras: ["abono", "abonos", "mensual", "suscripcion", "cuota", "repetir", "todos", "meses", "mantenimiento"],
    bloques: [
      "Un abono es un servicio que un cliente paga cada tantos meses (el mantenimiento mensual, por ejemplo).",
      "En **Abonos › Nuevo abono** elegís el cliente, el servicio y cada cuánto se cobra. Cada cuota se arma como una venta, y en la pestaña \"Deben\" ves quién está atrasado."
    ],
    ver: ["cobrar", "trabajos"]
  },
  {
    id: "socios",
    grupo: "Servicios y gimnasio",
    titulo: "Socios, cuotas e ingreso",
    pantalla: ["#/socios", "Socios"],
    modulo: "socios",
    preguntas: ["cómo doy de alta un socio", "cómo cobro la cuota", "cómo controlo quién entra", "qué socios deben", "cómo armo los planes del gimnasio"],
    palabras: ["socio", "socios", "cuota", "cuotas", "gimnasio", "plan", "planes", "ingreso", "entrada", "recepcion", "membresia", "descuento", "combo"],
    bloques: [
      { pasos: [
        "Armá los planes en **Planes**: precio y duración (mensual, trimestral, anual), y si querés, descuentos y combos.",
        "En **Socios**, dá de alta a la persona (nueva, o que ya es cliente) con su plan.",
        "La cuota vence desde la fecha de alta y se cobra como cualquier venta."
      ] },
      "En **Ingreso**, la recepción busca al socio cuando llega: Nexo avisa si debe la cuota."
    ],
    ver: ["cobrar"]
  },

  /* ---------- Tu cuenta y tu equipo ---------- */
  {
    id: "datos-del-negocio",
    grupo: "Tu cuenta y tu equipo",
    titulo: "Los datos de tu negocio",
    pantalla: ["#/configuracion/negocio", "Configuración › Datos del negocio"],
    admin: true,
    preguntas: ["cómo cambio el nombre del negocio", "dónde pongo el cuit", "cómo cambio los datos que salen en la factura"],
    palabras: ["negocio", "datos", "nombre", "cuit", "direccion", "telefono", "razon", "social", "comprobantes", "logo"],
    bloques: [
      "En **Configuración › Datos del negocio** van el nombre, el CUIT, tu condición frente al IVA, la dirección y el teléfono. Salen en tus presupuestos y facturas.",
      "En **Configuración › Comprobantes** van la razón social, los ingresos brutos y el inicio de actividades que pide la factura, con una vista previa."
    ],
    ver: ["iva", "facturar"]
  },
  {
    id: "funciones",
    grupo: "Tu cuenta y tu equipo",
    titulo: "Prender o apagar funciones",
    pantalla: ["#/configuracion/funciones", "Configuración › Funciones"],
    admin: true,
    preguntas: ["cómo activo el punto de venta", "no me aparece presupuestos", "cómo saco una sección del menú", "cómo cambio el tipo de negocio"],
    palabras: ["funciones", "funcion", "modulo", "activar", "prender", "apagar", "seccion", "menu", "tipo", "rubro", "aparece"],
    bloques: [
      "Según el tipo de negocio que elegiste, Nexo arranca con algunas funciones prendidas. Las demás las sumás cuando las necesites.",
      "En **Configuración › Funciones** prendés o apagás punto de venta, consultas (CRM), presupuestos, trabajos, abonos, compras, stock y socios. Apagar una no borra nada.",
      "Desde ahí también podés **Cambiar el tipo** de negocio: solo cambia con qué unidad nace un producto nuevo."
    ]
  },
  {
    id: "equipo",
    grupo: "Tu cuenta y tu equipo",
    titulo: "Sumar a alguien de tu equipo",
    pantalla: ["#/configuracion/usuarios", "Configuración › Usuarios"],
    admin: true,
    preguntas: ["cómo agrego un empleado", "cómo invito a alguien", "qué ve un empleado", "cómo doy de baja a un empleado", "cómo creo un usuario"],
    palabras: ["usuario", "usuarios", "empleado", "empleados", "invitar", "invitacion", "equipo", "rol", "permisos", "administrador", "vendedor"],
    bloques: [
      { pasos: [
        "Entrá a **Configuración › Usuarios** y tocá invitar.",
        "Poné su mail y su rol, y tocá **Mandar invitación**.",
        "Le llega un mail para crear su cuenta y entrar a tu negocio."
      ] },
      { lista: [
        "**Administrador**: ve y hace todo.",
        "**Empleado**: vende, cobra y atiende, pero no ve costos, márgenes ni ganancias, ni entra a Resumen, Compras ni la Papelera."
      ] },
      "Cada movimiento queda registrado con quién lo hizo, en Auditoría."
    ],
    ver: ["auditoria"]
  },
  {
    id: "varios-negocios",
    grupo: "Tu cuenta y tu equipo",
    titulo: "Más de un negocio",
    pantalla: ["#/configuracion/negocio", "Configuración"],
    preguntas: ["tengo dos negocios", "cómo agrego otro negocio", "cómo cambio de negocio"],
    palabras: ["negocios", "dos", "otro", "segundo", "cambiar", "agregar", "empresa", "selector", "sucursal"],
    bloques: [
      "Con la misma cuenta podés manejar varios negocios, cada uno con sus datos separados.",
      "El selector de arriba del menú cambia de negocio, y ahí mismo está **Agregar negocio**."
    ]
  },
  {
    id: "papelera",
    grupo: "Tu cuenta y tu equipo",
    titulo: "Recuperar algo anulado (Papelera)",
    pantalla: ["#/papelera", "Papelera"],
    admin: true,
    preguntas: ["cómo recupero una venta anulada", "dónde está lo que borré", "cómo restauro un gasto"],
    palabras: ["papelera", "recuperar", "restaurar", "borrado", "anulado", "deshacer"],
    bloques: [
      "Lo que anulás (ventas, compras, gastos, devoluciones) va a la **Papelera**. Desde ahí, **Restaurar** lo vuelve a poner como estaba, con su efecto en el stock y en la plata."
    ],
    ver: ["anular-venta"]
  },
  {
    id: "auditoria",
    grupo: "Tu cuenta y tu equipo",
    titulo: "Quién hizo qué (Auditoría)",
    pantalla: ["#/auditoria", "Auditoría"],
    preguntas: ["quién cargó esta venta", "quién modificó el stock", "cómo veo lo que hizo un empleado"],
    palabras: ["auditoria", "registro", "actividad", "historial", "quien", "modifico", "cambio"],
    bloques: [
      "En **Auditoría** queda cada cosa que se hizo en el negocio: quién, cuándo y qué cambió, incluidas las entradas y salidas de cada persona y lo que cargó el asistente."
    ]
  },
  {
    id: "mi-cuenta",
    grupo: "Tu cuenta y tu equipo",
    titulo: "Tu contraseña y tu mail",
    pantalla: ["#/configuracion/cuenta", "Configuración › Mi cuenta"],
    preguntas: ["cómo cambio la contraseña", "me olvidé la contraseña", "cómo cambio mi mail", "cómo cierro sesión"],
    palabras: ["contrasena", "clave", "password", "olvide", "mail", "correo", "email", "sesion", "cerrar", "salir", "cuenta"],
    bloques: [
      "En **Configuración › Mi cuenta** cambiás tu contraseña o tu mail (te mandamos un código para confirmarlo) y cerrás la sesión.",
      "Si te olvidaste la contraseña, en la pantalla de ingreso tocá **¿Te olvidaste la contraseña?**: te llega un enlace por mail para elegir una nueva."
    ]
  },
  {
    id: "datos-y-baja",
    grupo: "Tu cuenta y tu equipo",
    titulo: "Descargar tus datos o dar de baja",
    pantalla: ["#/configuracion/baja", "Configuración › Tus datos y la baja"],
    admin: true,
    preguntas: ["cómo descargo mis datos", "cómo doy de baja el negocio", "cómo borro mi cuenta", "puedo exportar todo"],
    palabras: ["baja", "descargar", "exportar", "datos", "borrar", "eliminar", "cuenta", "csv", "respaldo"],
    bloques: [
      "En **Configuración › Tus datos y la baja** descargás todo lo de tu negocio, y podés darlo de baja: queda cerrado 30 días, en los que se puede volver atrás, y después se borra.",
      "Las listas (ventas, gastos, stock) también tienen **Exportar CSV**, para abrirlas en una planilla."
    ]
  },
  {
    id: "avisar-problema",
    grupo: "Tu cuenta y tu equipo",
    titulo: "Avisar un problema",
    pantalla: ["#/configuracion/problema", "Configuración › Avisar un problema"],
    preguntas: ["algo no anda", "encontré un error", "cómo reporto un problema", "cómo me comunico con nexo", "tengo una idea"],
    palabras: ["problema", "error", "falla", "anda", "funciona", "reportar", "avisar", "soporte", "ayuda", "contacto", "idea", "sugerencia"],
    bloques: [
      "Si algo no anda o no se entiende, contanos desde **Configuración › Avisar un problema** (o el círculo con \"!\" al pie del menú). Antes de mandarlo, la página te muestra todo lo que se envía."
    ]
  }
];
