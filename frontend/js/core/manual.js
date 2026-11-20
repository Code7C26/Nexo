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
 *
 * En inglés (Configuración → Apariencia → Idioma) cada sección toma su texto
 * de core/manual-en.js, por el mismo id: una sección nueva se escribe en los dos.
 */

import { idioma } from "./idioma.js";
import { GRUPOS_EN, SECCIONES_EN } from "./manual-en.js";

const GRUPOS_ES = [
  "Empezar",
  "Productos y servicios",
  "Vender",
  "Vender por internet",
  "Facturar",
  "Clientes",
  "Comprar y stock",
  "Plata",
  "Servicios y gimnasio",
  "Tu cuenta y tu equipo"
];

const SECCIONES_ES = [
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
      "Si recién empezás, en Resumen vas a ver una guía de primeros pasos: cargar un producto, un cliente y tu primera venta. Si tu negocio ya venía funcionando, cargá primero lo que ya tenías: el stock, las deudas y la plata de hoy."
    ],
    ver: ["lo-que-tenias", "asistente", "cargar-producto", "registrar-venta"]
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
      "Y por los números de tu negocio: \"¿cuánto vendí este mes?\", \"¿cuánto vendí de remeras la semana pasada?\", \"¿quién me debe?\", \"¿cuántas gorras me quedan?\". Te contesta en el momento, con los mismos números del Resumen y sin cargar nada.",
      { nota: "Para que te entienda mejor, nombrá los productos como están cargados. Si un producto no existe, la venta no se puede confirmar hasta corregirlo; en una compra, el producto nuevo se crea solo." },
      { nota: "Cargar ventas, compras y gastos con el asistente es del plan Pro." }
    ],
    ver: ["registrar-venta", "registrar-compra", "registrar-gasto", "whatsapp"]
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
    id: "lo-que-tenias",
    grupo: "Empezar",
    titulo: "Cargar lo que ya tenías",
    pantalla: ["#/configuracion/lo-que-tenias", "Configuración › Lo que ya tenías"],
    admin: true,
    preguntas: ["cómo cargo el stock que ya tenía", "cómo cargo lo que me deben de antes", "cómo empiezo si mi negocio ya funcionaba", "cómo cargo la plata que tengo hoy", "cómo cargo deudas viejas con proveedores"],
    palabras: ["inicial", "antes", "tenia", "empezar", "arrancar", "stock", "deuda", "deudas", "saldo", "plata", "caja", "migrar", "pasar", "viejo"],
    bloques: [
      "Si tu negocio ya venía funcionando, cargá lo que tenés hoy y Nexo arranca con tus números de verdad. Está en **Configuración › Lo que ya tenías**, en partes que cargás por separado y en el orden que quieras:",
      { lista: [
        "**Tu stock de hoy**: cuántos tenés de cada producto y cuánto te costó cada uno. Con ese costo Nexo calcula la ganancia de cada venta.",
        "**Lo que te deben**: lo que cada cliente te quedó debiendo. Queda en su cuenta corriente y se cobra como cualquier venta.",
        "**Lo que debés**: lo que les debías a tus proveedores. Se paga como cualquier compra.",
        "**La plata de hoy**: cuánto hay en la caja, en el banco y en Mercado Pago.",
        "**Ventas recientes** (opcional): las de esta semana o este mes, para que los reportes no arranquen vacíos."
      ] },
      { nota: "Nada de esto inventa compras ni ventas: el stock no genera deudas ni toca la caja, y las ventas recientes no descuentan stock ni suman a la caja, porque lo que cargaste ya es lo de hoy." }
    ],
    ver: ["stock", "cuentas-corrientes", "caja"]
  },
  {
    id: "notificaciones",
    grupo: "Empezar",
    titulo: "Notificaciones en el celular y la compu",
    pantalla: ["#/configuracion/notificaciones", "Configuración › Notificaciones"],
    preguntas: ["cómo prendo las notificaciones", "me puede avisar cuando se acaba el stock", "cómo me entero de una venta online", "no me llegan las notificaciones"],
    palabras: ["notificaciones", "notificacion", "alerta", "alertas", "push", "celular"],
    bloques: [
      "Nexo te puede avisar en el celular o en la compu aunque no lo tengas abierto.",
      { pasos: [
        "Desde cada aparato donde quieras los avisos, entrá a **Configuración › Notificaciones**.",
        "Tocá **Prender las notificaciones** y aceptá el permiso del navegador.",
        "Con **Mandar una de prueba** ves cómo llegan."
      ] },
      { lista: [
        "Cuando a un producto le queda poco stock o se queda sin stock.",
        "Cuando entra una venta de Tienda Nube o de Mercado Libre.",
        "Cuando te pagan con Mercado Pago.",
        "En el gimnasio, cuando un socio espera en la entrada."
      ] },
      "Los de stock, ventas online y pagos le llegan a quien administra el negocio. Cerrar sesión los apaga en ese aparato."
    ],
    ver: ["celular"]
  },
  {
    id: "whatsapp",
    grupo: "Empezar",
    titulo: "Cargar por WhatsApp",
    pantalla: ["#/configuracion/whatsapp", "Configuración › WhatsApp"],
    preguntas: ["puedo cargar una venta por whatsapp", "cómo vinculo mi whatsapp", "le puedo mandar un audio a nexo"],
    palabras: ["whatsapp", "wsp", "mensaje", "audio", "vincular", "numero", "telefono"],
    bloques: [
      "Le mandás a Nexo lo que vendiste, compraste o gastaste, escrito o en un audio, sin abrir la app. Te contesta cómo lo entendió, y no se registra nada hasta que tocás **Confirmar**.",
      { pasos: [
        "Entrá a **Configuración › WhatsApp** y tocá **Vincular mi WhatsApp**.",
        "Desde tu celular, mandá al número de Nexo el mensaje que te muestra.",
        "Listo: contale lo que pasó como a una persona (\"vendí 2 buzos a Sole a 28 mil cada uno, pagó en efectivo\")."
      ] },
      "Se carga en el negocio al que vinculaste el número. Una devolución se termina en Nexo: te manda el enlace.",
      { nota: "Si no ves WhatsApp en Configuración, todavía no está disponible en tu Nexo." }
    ],
    ver: ["asistente"]
  },
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
      "Para cambiar un precio, abrí el producto desde la lista y editalo. El código o SKU sirve para buscarlo rápido; el **Código de barras** es el que lee el lector del mostrador, y el **Código de balanza (PLU)**, el de lo que pesás en una balanza con etiquetas.",
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
    id: "ofertas",
    grupo: "Productos y servicios",
    titulo: "Ofertas y promociones",
    pantalla: ["#/ofertas", "Ofertas"],
    admin: true,
    preguntas: ["cómo hago una oferta", "cómo pongo un producto en promoción", "cómo hago un descuento por cantidad", "cómo bajo el precio por unos días", "cómo hago una promo de los martes"],
    palabras: ["oferta", "ofertas", "promocion", "promo", "promos", "descuento", "rebaja", "liquidacion", "cantidad", "dia", "semana", "vigencia"],
    bloques: [
      "Una oferta baja el precio por un tiempo sin tocar tus listas de precios. Arranca y termina sola, y el punto de venta y las ventas la aplican.",
      { pasos: [
        "En **Productos**, tocá **Ofertas** y después **Nueva oferta**.",
        "Elegí cuánto baja: un porcentaje menos, un monto menos o a un precio fijo. Con una cantidad mínima es una promoción por cantidad (\"2 kg o más a $ 9.000 el kilo\").",
        "Elegí a qué: productos, categorías o todo el catálogo, y en qué lista de precios.",
        "Elegí desde y hasta cuándo y, si querés, qué días de la semana o del mes.",
        "Tocá **Guardar oferta**."
      ] },
      "Si dos ofertas tocan lo mismo, no se suman: gana la más barata. En **Los precios de un día** ves cómo queda cada precio ese día.",
      "Para un descuento a una sola venta, sin armar una oferta, usá **Descuento** en el punto de venta."
    ],
    ver: ["listas-precios", "punto-de-venta"]
  },
  {
    id: "produccion",
    grupo: "Productos y servicios",
    titulo: "Producción: recetas y lo que fabricás",
    pantalla: ["#/produccion", "Producción"],
    modulo: "produccion",
    preguntas: ["cómo cargo una receta", "cómo registro lo que produje", "cuánto me cuesta hacer un producto", "cómo descuento el envase o el packaging al vender", "cómo cargo los insumos"],
    palabras: ["produccion", "producir", "receta", "recetas", "fabricar", "elaborar", "hacer", "insumo", "insumos", "materiales", "rinde", "packaging", "envase", "envases"],
    bloques: [
      "Si hacés lo que vendés (comida, velas, ropa), Producción saca el costo de cada cosa desde los materiales que lleva.",
      { pasos: [
        "En **Producción › Recetas**, tocá **Nueva receta**: elegí qué se hace, cuánto rinde y qué materiales lleva. Los materiales son productos como cualquier otro: los comprás con las compras de siempre, y de ahí sale su costo.",
        "Cuando hacés una tanda, tocá **Producir**: elegí qué hiciste y cuánto ibas a hacer. Nexo propone los materiales de la receta: corregí lo que usaste de verdad.",
        "Poné cuánto salió de verdad y guardalo. Los materiales salen del stock, lo que hiciste entra, y su costo sale de lo que usaste."
      ] },
      "En **Al vender** cargás lo que se usa al vender sin venderse: la caja de cada uno, o la bolsa una sola vez por venta. Al vender, Nexo lo propone y se cambia en el momento si esa vez fue distinto: sale del stock y entra al costo de la venta.",
      { nota: "Si no ves Producción en el menú, prendela en Configuración › Funciones." }
    ],
    ver: ["registrar-compra", "stock", "funciones"]
  },
  {
    id: "balanza",
    grupo: "Productos y servicios",
    titulo: "Balanza y etiquetas con código",
    pantalla: ["#/configuracion/balanza", "Configuración › Balanza"],
    modulo: "pos",
    admin: true,
    preguntas: ["cómo uso la balanza", "el punto de venta lee la etiqueta de la balanza", "cómo vendo por peso con etiqueta", "qué es el plu"],
    palabras: ["balanza", "etiqueta", "etiquetas", "peso", "pesar", "plu", "codigo", "kilo", "fiambre", "carne", "verdura"],
    bloques: [
      "Si tu balanza imprime etiquetas con código de barras, el punto de venta las lee: el producto entra con su peso, al precio de hoy en Nexo (nunca el de la etiqueta).",
      { pasos: [
        "Pesá cualquier producto en la balanza y sacá la etiqueta.",
        "En **Configuración › Balanza**, pasá la etiqueta con el lector y copiá lo que tiene impreso: el código del producto en la balanza (PLU) y el peso o el importe. Nexo se da cuenta solo de cómo arma el código tu balanza.",
        "Tocá **Probar la etiqueta** y después **Usar este formato**.",
        "En cada producto que pesás, cargá su **Código de balanza (PLU)**: el número con el que lo tenés en la balanza."
      ] }
    ],
    ver: ["punto-de-venta", "cargar-producto"]
  },

  {
    id: "punto-de-venta",
    grupo: "Vender",
    titulo: "Vender en el mostrador (Punto de venta)",
    pantalla: ["#/pos", "Punto de venta"],
    modulo: "pos",
    preguntas: ["cómo vendo en el mostrador", "cómo abro la caja", "cómo cierro la caja", "cómo cobro con el lector", "cómo hago el arqueo", "cómo doy el vuelto", "cómo cobro con dos medios de pago", "cómo imprimo el ticket", "cómo facturo en el mostrador", "cómo hago una factura a en el mostrador", "cómo hago un descuento en el mostrador", "cómo cobro con tarjeta en cuotas", "cómo cobro con qr"],
    palabras: ["mostrador", "punto", "pos", "caja", "turno", "abrir", "cerrar", "arqueo", "vuelto", "lector", "escanear", "codigo", "barras", "cobrar", "rapida", "ticket", "imprimir", "impresora"],
    bloques: [
      "Es la pantalla para vender rápido, parado frente al cliente.",
      { pasos: [
        "Al empezar el día, tocá **Abrir caja** y contá el efectivo con el que arrancás.",
        "Buscá cada producto por nombre o código, o pasalo por el lector (también sirve la cámara del celular).",
        "Tocá **Cobrar** y elegí cómo paga: efectivo, transferencia, tarjeta… Puede pagar con más de uno. Si es en efectivo, Nexo calcula el vuelto.",
        "Ahí mismo elegí **Sin factura** o la factura que corresponde (**Factura A** o **Factura B** si sos responsable inscripto, **Factura C** si no), y tildá **Imprimir el ticket** si querés que salga solo. Queda como lo dejaste para la próxima venta.",
        "Al terminar el día, tocá **Cerrar caja** y contá el efectivo: Nexo te dice si coincide con lo que debería haber."
      ] },
      "Sin elegir cliente, la venta va a Consumidor final. Para dejarle algo a cuenta a alguien, elegí el cliente: a Consumidor final no se le fía.",
      { lista: [
        "**Los medios** que aparecen al cobrar (efectivo, débito, crédito con sus cuotas, transferencia…) los arma quien administra en Configuración › Medios de cobro.",
        "**Descuento**: un porcentaje o un monto sobre toda la venta, sin armar una oferta. Las ofertas vigentes se aplican solas.",
        "**Cobrar con QR de Mercado Pago**: con tu Mercado Pago conectado, el cliente escanea y el cobro entra cuando paga.",
        "**Balanza**: si tu balanza imprime etiquetas, pasala por el lector y el producto entra con su peso."
      ] },
      "Para hacerle la factura A a una empresa o a un monotributista, tocá **Factura A** y confirmá su CUIT, su nombre y su condición frente al IVA. Si ya está en tus clientes, Nexo lo encuentra por el CUIT; si no, lo crea. Si hacés la factura C, el enlace **Facturar a un cliente con CUIT** hace lo mismo. La letra sale de tu condición y la del cliente: a un responsable inscripto no se le hace la B.",
      "El ticket es para impresoras de 80 mm. Se vuelve a imprimir desde la ficha de la venta, con **Ticket**.",
      { nota: "Si no ves Punto de venta en el menú, prendelo en Configuración › Funciones." }
    ],
    ver: ["caja", "medios-cobro", "ofertas", "balanza", "registrar-venta", "funciones"]
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
      "Al registrarla, Nexo descuenta el stock, guarda el costo de ese momento para calcular la ganancia y, si quedó algo sin cobrar, lo suma a lo que te debe el cliente. Si vendés online, elegí **Por dónde te compró** (el local, Instagram, WhatsApp…).",
      "En la ficha de la venta ves **Adónde fue la plata**: la mercadería, cada gasto de la venta (la comisión, el envío, las cuotas), el IVA y lo que te quedó. Si pagaste el envío, sumalo con **Sumar el envío**.",
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
      "El cobro baja lo que debe el cliente y suma la plata a esa cuenta en Caja.",
      "Si te paga con Mercado Pago, en el mismo cobro tocá **Cobrar con QR** si está con vos (Mercado Pago cobra menos comisión por el QR), o **Mandar un link de pago** para mandárselo por WhatsApp. Va por el importe que pusiste, o por todo lo que debe. Cuando paga, el cobro se registra solo."
    ],
    ver: ["cuentas-corrientes", "caja", "mercado-pago"]
  },
  {
    id: "medios-cobro",
    grupo: "Vender",
    titulo: "Medios de cobro: tarjetas, cuotas y comisiones",
    pantalla: ["#/configuracion/medios-cobro", "Configuración › Medios de cobro"],
    modulo: "pos",
    admin: true,
    preguntas: ["cómo cargo la comisión de la tarjeta", "cómo ofrezco cuotas", "cómo agrego modo o cuenta dni", "a qué cuenta entra lo que cobro con débito", "cómo cargo el posnet"],
    palabras: ["medio", "medios", "cobro", "tarjeta", "debito", "credito", "cuotas", "comision", "posnet", "modo", "billetera", "transferencia", "acredita"],
    bloques: [
      "Los medios de cobro son las formas en que te pagan en el mostrador: efectivo, débito, crédito, transferencia, MODO… Cada uno dice a qué cuenta entra la plata.",
      { pasos: [
        "Entrá a **Configuración › Medios de cobro** y tocá **Sumar un medio de cobro**.",
        "Poné el nombre, el tipo y a qué cuenta entra. El efectivo entra siempre en la caja del turno, así el arqueo cierra.",
        "Cargá la comisión y en cuántos días se acredita la plata. La comisión se anota sola como un gasto de cada venta.",
        "En crédito, sumá los planes de cuotas que ofrecés y, si son sin interés para el cliente, cuánto te cuesta a vos ofrecerlos: también se anota como gasto de la venta.",
        "Tocá **Agregar medio**."
      ] },
      "Al cobrar con transferencia, en el mostrador se elige en qué cuenta cayó (el banco, Mercado Pago…).",
      { nota: "Lo que cobrás con tu Mercado Pago conectado no hace falta cargarlo acá: Nexo anota el costo real de cada pago." }
    ],
    ver: ["punto-de-venta", "mercado-pago", "caja"]
  },
  {
    id: "turno-mostrador",
    grupo: "Vender",
    titulo: "Durante el turno: cobrar a cuenta, gastos de caja y anular",
    pantalla: ["#/pos", "Punto de venta"],
    modulo: "pos",
    preguntas: ["cómo cobro una deuda en el mostrador", "un cliente viene a pagar lo que debe", "cómo anoto que saqué plata de la caja", "cómo anulo una venta del mostrador", "cómo reimprimo un ticket", "cómo armo los accesos rápidos"],
    palabras: ["cuenta", "deuda", "fiado", "gasto", "caja", "bolsas", "anular", "reimprimir", "ticket", "accesos", "rapidos", "botonera", "turno"],
    bloques: [
      "Con la caja abierta, arriba del mostrador tenés todo lo que pasa en el turno, sin salir de la pantalla.",
      { pasos: [
        "**Cobrar a cuenta**: el cliente paga su deuda sin llevarse nada. Elegilo, poné cuánto paga y cómo: se salda primero lo más viejo, y sale un papel con lo que le queda.",
        "**Gasto de caja**: lo que sale del cajón (bolsas, flete, un arreglo). Se descuenta de lo que tiene que haber en la caja y queda en Gastos.",
        "**Ventas del turno**: cada venta del turno, para reimprimir el ticket o anularla con el motivo. Lo cobrado vuelve del cajón y el stock vuelve al depósito.",
        "**Accesos rápidos**: tocá **Armar accesos rápidos**, marcá los productos de siempre y tocá **Listo**. Quedan guardados en esa caja."
      ] },
      { nota: "Un empleado anula solo con el mail y la contraseña de un administrador, ahí mismo. Una venta de un turno ya cerrado, o con factura, se devuelve desde Ventas." }
    ],
    ver: ["punto-de-venta", "sucursales", "caja"]
  },
  {
    id: "sucursales",
    grupo: "Vender",
    titulo: "Sucursales y el cierre del día",
    pantalla: ["#/configuracion/sucursales", "Configuración › Sucursales"],
    admin: true,
    preguntas: ["cómo agrego otro local", "tengo dos sucursales", "cómo veo el cierre de caja del día", "cuánto vendieron todas las cajas", "cómo hago que una caja venda de su depósito", "cómo veo el cierre del mes"],
    palabras: ["sucursal", "sucursales", "local", "locales", "cierre", "dia", "mes", "cajas", "deposito", "arqueo", "diferencias"],
    bloques: [
      "Si tenés más de un local, cada sucursal junta su depósito, sus cajas y la gente que trabaja ahí.",
      { pasos: [
        "Entrá a **Configuración › Sucursales** y tocá **Sumar una sucursal**.",
        "Poné el nombre y elegí su depósito: uno que ya tenés o uno nuevo con el nombre de la sucursal.",
        "Marcá sus cajas (o creá una nueva) y quiénes trabajan ahí. Quien tiene sucursales solo abre esas cajas.",
        "Tocá **Agregar sucursal**."
      ] },
      "Cada caja vende solo lo que hay en el depósito de su sucursal. Si un producto no está, el mostrador avisa en qué otra sucursal hay, para mandar al cliente.",
      "El **Cierre de caja** (desde **Caja** o el punto de venta) suma todas las cajas de todas las sucursales: lo vendido, cómo te pagaron, lo que salió del cajón, las diferencias y lo vendido fuera de las cajas. **Del mes** lo muestra además día por día."
    ],
    ver: ["punto-de-venta", "turno-mostrador", "caja"]
  },
  {
    id: "horarios",
    grupo: "Tu cuenta y tu equipo",
    titulo: "Horarios, fichaje y PIN",
    pantalla: ["#/horarios", "Empleados"],
    preguntas: ["cómo cargo un cajero sin cuenta", "cómo le pongo un pin al cajero", "cómo ficho la entrada", "cómo marco la salida", "cómo cargo el horario de un empleado", "quién llegó tarde", "cuántas horas trabajó", "cumplió el turno", "se olvidó de fichar la salida"],
    palabras: ["pin", "encargado", "horario", "horarios", "fichar", "fichaje", "entrada", "salida", "tarde", "horas", "falta", "faltas", "turno", "turnos", "cumplido"],
    bloques: [
      "Los empleados no necesitan una cuenta de Nexo: los cargás vos, con su nombre y un PIN, y atienden y fichan en la compu de la caja.",
      { pasos: [
        "En **Empleados** › **Sumar empleado**, escribí el nombre y un PIN de 4 a 6 números. Si tenés sucursales, elegí dónde trabaja. Marcá **Es encargado** si autoriza anular una venta en la caja.",
        "Si esa persona también tiene cuenta de Nexo (un encargado, vos mismo), elegila en **Su cuenta de Nexo**: así ficha también desde su celular.",
        "Tocá **Horario** para cargar sus días y horas (con horario cortado, las dos franjas).",
        "En **Quién vino y cuánto trabajó** ves, de hoy, la semana o el mes, cuántos turnos cumplió cada uno, sus horas, las llegadas tarde y las faltas. Cada turno dice si lo cumplió, si entró tarde o se fue antes, o si faltó.",
        "Si alguien se olvidó de fichar, tocá **Corregir** en ese día y cargá la hora: queda marcado como corregido y en la auditoría."
      ] },
      { nota: "Llegar hasta 5 minutos después, o irse hasta 5 minutos antes, no cuenta. Nexo dice qué turnos se cumplieron; los sueldos no se liquidan en Nexo." }
    ],
    ver: ["caja-vinculada", "equipo", "turno-mostrador"]
  },
  {
    id: "caja-vinculada",
    grupo: "Vender",
    titulo: "La compu de la caja",
    pantalla: ["#/pos", "Punto de venta"],
    preguntas: ["cómo dejo la compu como caja", "cómo atiende un cajero sin cuenta", "cómo se ficha en la caja", "cómo cambio quién atiende", "cómo desvinculo la compu"],
    palabras: ["compu", "caja", "vincular", "desvincular", "pin", "atender", "atiende", "bloquear", "relevo", "fichar"],
    bloques: [
      "La compu del mostrador tiene su propia cuenta: sin la tuya abierta, solo sirve para vender en esa caja. Nadie vende ni cambia nada desde su casa.",
      { pasos: [
        "En el local, entrá con tu cuenta al **Punto de venta**, elegí la caja y tocá **Usar esta compu como caja**. Después salí de tu cuenta.",
        "La compu queda en **¿Quién atiende?**: cada empleado toca su nombre, pone su PIN y **Atender**. Las ventas quedan a su nombre.",
        "Para el relevo, **Bloquear**: el turno y la venta en curso siguen, y atiende el próximo con su PIN.",
        "Fichar es otro botón: con el PIN, **Fichar la entrada** o **Fichar la salida**. Desbloquear la caja no es fichar."
      ] },
      { lista: [
        "**Anular una venta**: si quien atiende no es encargado, la autoriza un encargado con su PIN.",
        "**Entrar con mi cuenta**: desde la caja, el dueño entra a su cuenta; al salir, la compu vuelve a ser la caja.",
        "**Desvincular**: desde tu cuenta, en el mismo lugar del punto de venta."
      ] }
    ],
    ver: ["horarios", "turno-mostrador", "punto-de-venta"]
  },
  {
    id: "mercado-pago",
    grupo: "Vender",
    titulo: "Cobrar con Mercado Pago",
    pantalla: ["#/configuracion/mercado-pago", "Configuración › Mercado Pago"],
    admin: true,
    preguntas: ["cómo conecto mercado pago", "cómo mando un link de pago", "cómo armo el qr del mostrador", "me conviene dar cuotas con mercado pago"],
    palabras: ["mercado", "pago", "mp", "link", "qr", "conectar", "cuotas", "comision", "cartel"],
    bloques: [
      "Con tu cuenta de Mercado Pago conectada, cobrás con un link o con el QR del mostrador, y el cobro entra solo en Nexo, con la comisión y el costo de las cuotas anotados como gastos de esa venta.",
      { pasos: [
        "Entrá a **Configuración › Mercado Pago** y tocá **Conectar mi Mercado Pago**: te lleva a Mercado Pago para darle permiso a Nexo, y volvés solo. Nexo nunca te pide la contraseña y no puede sacar plata de tu cuenta.",
        "Elegí en qué cuenta de Caja entra lo cobrado.",
        "Para el mostrador, cargá la dirección del local y tocá **Armar la caja**. Después, **Descargar el cartel para imprimir** te da el QR para pegar en el mostrador."
      ] },
      { lista: [
        "**Link de pago**: al cobrar una venta o una deuda, **Mandar un link de pago**. Se lo mandás por WhatsApp. La comisión es más alta que la del QR.",
        "**QR al cobrar una venta o una deuda**: con la caja armada, **Cobrar con QR** en **Registrar cobro**. Si no paga, **No pagó**.",
        "**QR en el mostrador**: al cobrar, **Cobrar con QR de Mercado Pago**. El cobro entra cuando paga."
      ] },
      "En **¿Te conviene ofrecer cuotas?** ves cuánto te cuesta cada plan y cuánto cobrar para que te quede lo mismo.",
      { nota: "Es desde el plan Emprendedor." }
    ],
    ver: ["medios-cobro", "cobrar", "punto-de-venta"]
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
      "Los productos vuelven al stock y se descuenta de la venta. Si la venta estaba facturada, desde la devolución tocás **Emitir nota de crédito**: sale con la misma letra que la factura y va a nombre del mismo cliente, porque la corrige.",
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

  /* ---------- Vender por internet ---------- */
  {
    id: "tiendas-online",
    grupo: "Vender por internet",
    titulo: "Conectar Tienda Nube y Mercado Libre",
    pantalla: ["#/configuracion/tienda-nube", "Configuración › Tienda Nube"],
    modulo: "canales",
    admin: true,
    preguntas: ["cómo conecto tienda nube", "cómo conecto mercado libre", "cómo sincronizo el stock con mi tienda", "cómo publico mis productos en tienda nube", "entran solas las ventas de mercado libre"],
    palabras: ["tienda", "nube", "tiendanube", "mercado", "libre", "ml", "online", "internet", "publicar", "publicaciones", "sincronizar", "ecommerce", "web"],
    bloques: [
      "Si vendés por internet, conectá tu tienda: el stock y el precio se mantienen al día solos, y cada venta de la tienda entra como una venta de Nexo.",
      { pasos: [
        "Entrá a **Configuración › Tienda Nube** (o **Mercado Libre**) y tocá **Conectar mi Tienda Nube** (o **Conectar mi Mercado Libre**). Te lleva a la tienda para darle permiso a Nexo, y volvés solo.",
        "Elegí de qué lista de precios sale el precio, de qué depósito el stock y a qué cuenta entra lo cobrado.",
        "En Tienda Nube, elegí qué productos **Publicar**: se crean con su nombre, sus variantes, su precio y su stock, y las fotos se cargan en Tienda Nube. Si la tienda ya tenía productos, **Traer lo que ya tengo en la tienda**.",
        "En Mercado Libre, **Vincular** cada publicación con su producto de Nexo. Si tienen el mismo SKU, ya viene elegido. Nexo no crea ni borra publicaciones."
      ] },
      "Nexo manda: si cambiás el stock o el precio en la tienda, Nexo lo vuelve a poner como está acá. Si en Mercado Libre vendés más caro por la comisión, armá una lista de precios para Mercado Libre.",
      "Una venta pagada online entra cobrada; una que te pagan por transferencia o en efectivo, por cobrar.",
      { nota: "Es desde el plan Emprendedor. Si no ves Canales de venta en Configuración, prendé Venta online en Funciones." }
    ],
    ver: ["venta-online", "listas-precios", "funciones"]
  },
  {
    id: "venta-online",
    grupo: "Vender por internet",
    titulo: "Cuánto te deja cada canal (Venta online)",
    pantalla: ["#/venta-online", "Venta online"],
    modulo: "canales",
    admin: true,
    preguntas: ["cuánto vendo por mercado libre", "qué canal me deja más", "cuánto me cobra mercado libre", "cómo anoto que una venta fue por instagram", "me rinde la publicidad"],
    palabras: ["canal", "canales", "online", "instagram", "tienda", "mercado", "libre", "comision", "publicidad", "ganancia", "ticket"],
    bloques: [
      "Cada venta guarda por dónde entró: el local, Tienda Nube, Mercado Libre, Instagram, WhatsApp… Las de las tiendas conectadas se anotan solas, y en una venta cargada a mano lo elegís en **Por dónde te compró**.",
      "En **Venta online** ves, por período, cuánto vendiste online y, por cada canal, adónde fue la plata: la mercadería, lo que cobra el canal por vender ahí (comisión, envío, cuotas) y lo que te quedó. También lo más vendido en cada canal y lo que rinde la publicidad que anotás en Gastos."
    ],
    ver: ["tiendas-online", "resumen", "registrar-gasto"]
  },

  /* ---------- Facturar ---------- */
  {
    id: "facturar",
    grupo: "Facturar",
    titulo: "Hacer una factura",
    pantalla: ["#/facturas", "Facturas"],
    preguntas: ["cómo hago una factura", "cómo facturo una venta", "cómo imprimo una factura", "cómo saco el pdf de la factura", "qué letra de factura me corresponde", "factura a o b", "qué necesito para hacer una factura a", "le puedo hacer factura b a un monotributista", "por qué me sale factura b"],
    palabras: ["factura", "facturar", "facturas", "comprobante", "imprimir", "pdf", "ticket", "letra", "a", "b", "c"],
    bloques: [
      "Podés facturar una venta que ya cargaste, o hacer una factura suelta.",
      { pasos: [
        "Para una venta: abrila y tocá **Facturar**. Para una suelta: **Facturas › Nueva factura**.",
        "Si sos responsable inscripto, elegí **Factura A** o **Factura B**: la A te pide el CUIT del cliente y la B no. Revisá sus datos y la condición de venta.",
        "Tocá **Generar factura**. Desde su ficha, **Imprimir / PDF**."
      ] },
      "La letra sale sola, según tu condición frente al IVA y la del cliente, así nunca sale una que ARCA no acepta:",
      { lista: [
        "Si sos **responsable inscripto**: A a otro inscripto o a un monotributista, y B a un consumidor final o a un exento. A un monotributista no se le hace B: desde 2021 le corresponde la A.",
        "Si sos **monotributista o exento**: siempre C."
      ] },
      "Para una A, el cliente tiene que tener su CUIT cargado. Si no te lo da, no es A: es una B a consumidor final. Un inscripto que compra para él también va en B: elegí **Factura B** y sale sin sus datos, sin cambiar su ficha.",
      "La A muestra el IVA aparte; la B dice cuánto IVA contiene el precio, como pide la ley de transparencia fiscal. La A a un monotributista lleva una leyenda que aclara que ese IVA solo le sirve para el monotributo.",
      "La factura guarda los datos del cliente de ese momento: si después cambiás su ficha, la factura no cambia.",
      "En el Punto de venta la factura se elige al cobrar, sin pasar por acá: tocando **Factura A** cargás ahí mismo al cliente con su CUIT.",
      { nota: "Sin la factura electrónica activada, el comprobante es interno: sale con una X y \"No válido como factura\". Para facturar ante ARCA, mirá Factura electrónica." }
    ],
    ver: ["factura-electronica", "iva", "datos-del-negocio"]
  },
  {
    id: "factura-por-mail",
    grupo: "Facturar",
    titulo: "Mandar la factura por mail",
    pantalla: ["#/facturas", "Facturas"],
    preguntas: ["cómo mando la factura por mail", "cómo le envío la factura al cliente", "puedo mandar varias facturas juntas", "cómo mando las facturas desde mi gmail"],
    palabras: ["mail", "email", "correo", "mandar", "enviar", "factura", "facturas", "pdf", "gmail", "adjunto"],
    bloques: [
      { pasos: [
        "Abrí la factura y tocá **Mandar por mail**, o tildá varias en **Facturas** y tocá **Mandar por mail**: cada una va al mail de su cliente.",
        "Revisá el mail y tocá **Mandar**. Va con el PDF adjunto, a nombre de tu negocio. Si el cliente no tenía mail, lo podés guardar en su ficha."
      ] },
      "Si conectás el Gmail de tu negocio en **Configuración › Gmail**, las facturas salen desde tu mail: tus clientes te contestan a vos y te quedan en \"Enviados\". Nexo solo pide permiso para mandar: no puede leer ni borrar tus mails. Sin conectarlo, salen desde Nexo a tu nombre.",
      { nota: "Es desde el plan Emprendedor, como la factura electrónica. Una factura electrónica sin CAE todavía no se puede mandar." }
    ],
    ver: ["facturar", "factura-electronica"]
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
        "Cargá tu CUIT y tu condición frente al IVA (**Cargar el CUIT y la condición**) y el punto de venta, y tocá **Verificar con ARCA**.",
        "Listo: al hacer una factura, Nexo le pide el CAE a ARCA. Si ARCA no responde, queda pendiente y se reintenta con **Pedir el CAE a ARCA**."
      ] },
      "El número de cada factura lo da ARCA, así no se saltea ni se repite, aunque se reintente. Cada una sale con el CAE, su vencimiento y el código QR de ARCA, con el que cualquiera la puede verificar.",
      "Si ARCA rechaza una factura, Nexo te muestra el motivo: corregí el dato (por ejemplo, el CUIT del cliente) y pedí el CAE de nuevo, o descartala. Una factura rechazada no gasta número.",
      { nota: "Hoy funciona en el ambiente de prueba de ARCA: los comprobantes dicen \"Comprobante de prueba – sin validez fiscal\"." },
      { nota: "Es desde el plan Emprendedor. Si tu negocio pasa a Gratis, queda en pausa: apagala para seguir con comprobantes internos, o volvé a un plan pago." }
    ],
    ver: ["facturar", "iva"]
  },
  {
    id: "iva",
    grupo: "Facturar",
    titulo: "IVA",
    pantalla: ["#/configuracion/comprobantes", "Configuración › Comprobantes y datos fiscales"],
    preguntas: ["cómo cargo el iva", "dónde veo el iva", "el precio incluye iva", "soy responsable inscripto", "soy monotributista", "libro iva"],
    palabras: ["iva", "impuesto", "alicuota", "inscripto", "monotributo", "monotributista", "exento", "consumidor", "final", "condicion", "libro", "debito", "credito", "fiscal"],
    bloques: [
      { lista: [
        "**Tu condición** (responsable inscripto, monotributo, exento) va en Configuración › Comprobantes y datos fiscales.",
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
    ver: ["crm", "cuentas-corrientes", "unir-repetidos"]
  },
  {
    id: "unir-repetidos",
    grupo: "Clientes",
    titulo: "Unir clientes o proveedores repetidos",
    pantalla: ["#/clientes", "Clientes"],
    admin: true,
    preguntas: ["tengo un cliente cargado dos veces", "cómo junto dos clientes", "cómo uno proveedores repetidos", "cargué dos veces el mismo cliente"],
    palabras: ["unir", "juntar", "repetido", "repetidos", "duplicado", "duplicados", "dos", "veces", "fusionar", "mismo"],
    bloques: [
      { pasos: [
        "En **Clientes** (o **Proveedores**), tildá los repetidos.",
        "Tocá **Unir** en la barra de abajo.",
        "Elegí cuál queda y tocá **Unir**."
      ] },
      "Todo lo de los otros pasa al que queda: las ventas, los cobros, las facturas, los presupuestos y la cuenta corriente (en un proveedor, sus compras y sus pagos), y se completa el contacto que le falte. Los otros se borran. Las facturas ya hechas no cambian."
    ],
    ver: ["clientes", "proveedores"]
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
    ver: ["compra-desde-factura", "pagar-proveedor", "stock", "proveedores"]
  },
  {
    id: "compra-desde-factura",
    grupo: "Comprar y stock",
    titulo: "Cargar una compra con la foto de la factura",
    pantalla: ["#/compras", "Compras"],
    modulo: "compras",
    admin: true,
    preguntas: ["cómo cargo una compra con una foto", "puedo subir la factura del proveedor", "cómo cargo una compra desde el pdf", "cómo cargo un pack de 12", "cómo escaneo una factura"],
    palabras: ["foto", "factura", "remito", "pdf", "escanear", "subir", "camara", "pack", "caja", "bulto", "fardo", "proveedor"],
    bloques: [
      { pasos: [
        "Entrá a **Compras**, tocá **Nueva compra** y después **Cargar desde la factura**.",
        "Sacale una foto a la factura o el remito (en el celular se abre la cámara), o elegí el PDF que te mandó el proveedor. Si son varias hojas, elegilas juntas.",
        "Nexo completa el proveedor, el número, la fecha y cada producto con su cantidad y su costo. Abajo de cada renglón ves cómo figuraba en la factura.",
        "Revisá los que dicen **Parecido** o **Nuevo**: elegí el producto de tu catálogo o dejalo para que se cree.",
        "Tocá **Guardar borrador** y seguí como con cualquier compra."
      ] },
      "Los packs entran en unidades: 2 packs de 12 gaseosas son 24 gaseosas, cada una con su costo. Si un bulto trae otra cantidad, corregila en **Cada uno trae**.",
      { nota: "Lo que confirmás queda recordado para ese proveedor: la próxima factura suya sale sola. Si lo cargado no da el total de la factura, Nexo te avisa." },
      { nota: "Es del plan Pro." }
    ],
    ver: ["registrar-compra", "proveedores"]
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
    ver: ["registrar-compra", "pagar-proveedor", "unir-repetidos", "lista-proveedor"]
  },
  {
    id: "lista-proveedor",
    grupo: "Comprar y stock",
    titulo: "La lista de precios de un proveedor",
    pantalla: ["#/proveedores", "Proveedores"],
    admin: true,
    preguntas: ["cómo cargo la lista de precios de un proveedor", "el proveedor me mandó los precios nuevos", "cómo actualizo los costos de un proveedor", "qué proveedor me vende más barato"],
    palabras: ["lista", "precios", "catalogo", "proveedor", "aumento", "costos", "mensaje", "pdf", "planilla", "comparar"],
    bloques: [
      "Cuando un proveedor te manda sus precios, los cargás en su ficha y Nexo los cruza con tus productos.",
      { pasos: [
        "En **Proveedores**, abrí el proveedor y tocá **Cargar lista**.",
        "Pegá el mensaje que te mandó (o una planilla copiada de Excel), o subí el PDF, la planilla en CSV o una foto. Elegí desde cuándo valen y si los precios son con IVA o sin IVA.",
        "Revisá lo que encontró: cada renglón con su producto, cuántas trae si es un pack y cuánto sale cada una. Lo que no encontró lo elegís de tu catálogo, o lo dejás afuera.",
        "Tocá **Guardar**."
      ] },
      { lista: [
        "En la ficha del proveedor ves lo que cobra hoy por cada producto, cuánto subió o bajó contra la lista anterior y tu costo de hoy.",
        "Al cargarle una compra a ese proveedor, el costo de cada producto sale de su lista. Lo podés cambiar.",
        "En la ficha de cada producto ves lo que te cobra cada proveedor, del más barato al más caro.",
        "La próxima lista de ese proveedor encuentra sola lo que ya elegiste."
      ] },
      { nota: "La lista no cambia el costo de tus productos: ese sale de lo que compraste. Una lista cargada por error se borra desde **Listas cargadas**, y vuelven los precios de la anterior. Leer una foto es del plan Pro; el mensaje, la planilla y el PDF, de todos." }
    ],
    ver: ["proveedores", "registrar-compra"]
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
      "En **Resumen** elegís el período (hoy, 7 días, este mes, el año o las fechas que quieras) y ves:",
      { lista: [
        "lo que vendiste, lo que te costó eso, la ganancia, los gastos y el resultado, comparado con el período anterior o con el mismo del año pasado;",
        "lo que hay que mirar hoy: lo que te deben, lo que debés y lo que hay que reponer;",
        "cuándo se vende, por día de la semana y por hora;",
        "cómo viene el resultado mes a mes;",
        "qué se vende, por categoría y los mejores clientes;",
        "qué se compra y a quién;",
        "el IVA del período."
      ] },
      "Con **Personalizar** elegís qué piezas ver, y cada una se cambia de lugar arrastrándola desde sus tres rayas. Arranca con las de tu tipo de negocio.",
      "La ganancia de cada venta usa el costo que tenía el producto cuando lo vendiste, aunque después cambie."
    ],
    ver: ["iva", "que-reponer", "venta-online"]
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
    preguntas: ["cómo doy de alta un socio", "cómo cobro la cuota", "cómo controlo quién entra", "qué socios deben", "cómo armo los planes del gimnasio", "dónde veo las cuotas del mes", "por qué las cuotas no están en ventas", "cómo sumo un plan a un socio"],
    palabras: ["socio", "socios", "cuota", "cuotas", "gimnasio", "plan", "planes", "ingreso", "entrada", "recepcion", "membresia", "descuento", "combo", "cobro", "mes", "proporcional"],
    bloques: [
      { pasos: [
        "Armá los planes en **Planes**: precio y duración (mensual, trimestral, anual), y si querés, descuentos y combos.",
        "En **Socios**, dá de alta a la persona (nueva, o que ya es cliente) con su plan.",
        "La cuota vence desde la fecha de alta. Si hace varios planes, es **una sola cuota** con todos adentro: un cobro por mes, no uno por plan."
      ] },
      "En **Cuotas** ves las del mes: cuánto cobraste, cuánto falta y cuánto está vencido, y cobrás cada una de un toque. Las cuotas no aparecen en **Ventas**, que queda para lo que vendés en el mostrador.",
      "Si a un socio le sumás un plan a mitad de mes, la primera vez paga solo los días que faltan hasta el vencimiento de su cuota, y desde ahí va en la misma cuota.",
      "En el **Resumen**, la pieza **Socios y cuotas** muestra los socios activos, las altas y las bajas, lo cobrado de cuotas aparte de las ventas del mostrador, las entradas por día y los que no vienen.",
      "En **Ingreso**, la recepción busca al socio cuando llega: Nexo avisa si debe la cuota.",
      "Un **combo** baja el precio cuando el socio combina planes: con un porcentaje, o con un **precio fijo por mes** (BJJ + MMA a $80.000). También puede bajar un solo plan si el socio hace además alguno de otros: el funcional a mitad de precio si hace alguna marcial.",
      "En **Socios**, el filtro **No vienen** muestra a los activos que hace dos semanas o más no entran, para llamarlos antes de que se den de baja. De alguien que ya venía, en el alta se carga la última vez que vino.",
      "**Parece que dejaron** junta a los que hace un mes no vienen y no pagaron la cuota de un mes que no vinieron: lo más común es que hayan dejado sin avisar. Nexo no los da de baja solo: en la ficha elegís darlo de baja borrando esa deuda o dejándola. Si vuelve, se lo reactiva y paga desde ese día."
    ],
    ver: ["cobrar", "clases"]
  },
  {
    id: "clases",
    grupo: "Servicios y gimnasio",
    titulo: "La grilla de clases",
    pantalla: ["#/clases", "Clases"],
    modulo: "socios",
    preguntas: ["cómo armo la grilla de clases", "cómo cargo los horarios de las clases", "cómo le asigno un profe a una clase", "qué clases hay hoy", "cómo comparto la grilla en instagram"],
    palabras: ["clase", "clases", "grilla", "horario", "horarios", "actividad", "actividades", "profe", "profes", "profesor", "instructor", "cupo", "semana", "turno"],
    bloques: [
      "En **Clases** está la semana del gimnasio: todas las actividades con sus horarios y quién da cada clase. La ve todo el equipo; la arma quien administra.",
      { pasos: [
        "Tocá **Nueva actividad**: el nombre (BJJ, Funcional), el color y si es de horario **Fijo** (clases a una hora) o **Libre** (abierta en una franja, como la sala de musculación).",
        "Tocá **Nuevo horario**: la actividad, los días (martes y jueves a las 19 se cargan de una vez), a qué hora empieza y termina, y los profes. El detalle (Principiantes, Kids) y el cupo son opcionales.",
        "Para cambiar o sacar un horario, tocalo en la grilla."
      ] },
      "Dos clases pueden ser a la misma hora: van una al lado de la otra. Un profe no puede estar en dos clases a la vez; Nexo te avisa.",
      "Una clase de varias actividades a la vez (el sparring de Boxeo, MMA y Kickboxing) se carga una sola vez, marcando todas: aparece en la grilla de cada una.",
      "Tocá una actividad arriba de la grilla para ver solo sus clases; tocala de nuevo para ver todas. La imagen para compartir sale filtrada igual.",
      "Los profes son los empleados del negocio: si sumás uno desde la grilla, aparece también en **Empleados**.",
      "**Imagen para compartir** arma la grilla de la semana en una imagen para Instagram o el estado de WhatsApp: vertical, u horizontal y más grande; con fondo oscuro o claro. En el celular se comparte directo.",
      { nota: "En el celular la grilla se ve de a un día: elegí el día arriba." }
    ],
    ver: ["socios", "horarios"]
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
      "En **Configuración › Datos del negocio** van el nombre, la dirección, el teléfono y el mail. Salen en el encabezado de tus comprobantes.",
      "En **Configuración › Comprobantes y datos fiscales** van la razón social, el CUIT, tu condición frente al IVA (define qué factura podés hacer), los ingresos brutos, el inicio de actividades y un texto al pie, con una vista previa."
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
      "En **Configuración › Funciones** prendés o apagás punto de venta, venta online, consultas (CRM), presupuestos, trabajos, abonos, compras, stock, producción y socios. Apagar una no borra nada.",
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
    id: "plan",
    grupo: "Tu cuenta y tu equipo",
    titulo: "Los planes de Nexo",
    pantalla: ["#/configuracion/plan", "Configuración › Plan de Nexo"],
    admin: true,
    preguntas: ["cuánto cuesta nexo", "qué incluye el plan gratis", "cómo paso a otro plan", "qué plan necesito para la factura electrónica"],
    palabras: ["plan", "planes", "precio", "gratis", "emprendedor", "pro", "pagar", "suscripcion", "limite", "tope", "cuesta"],
    bloques: [
      "Todos los planes tienen las funciones para manejar tu negocio; cambia hasta dónde llegás.",
      { lista: [
        "**Gratis**: hasta 100 productos y 300 ventas por mes, un usuario, y los comprobantes con la marca de Nexo.",
        "**Emprendedor**: sin topes de productos ni de ventas, hasta 3 usuarios, la factura electrónica, las facturas por mail, Tienda Nube, Mercado Libre y Mercado Pago, y los comprobantes sin la marca de Nexo.",
        "**Pro**: todo eso, más el asistente con IA, las compras desde la foto de la factura, usuarios sin tope y varios negocios con la misma cuenta."
      ] },
      "En **Configuración › Plan de Nexo** ves los precios, lo que usás y pedís pasar a otro: te escribimos para activarlo, y mientras tanto seguís usando Nexo como siempre.",
      { nota: "Si pasás a un plan que no trae algo que usabas (la factura electrónica, una tienda conectada), queda en pausa: no se borra nada." }
    ],
    ver: ["funciones", "varios-negocios"]
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

// En inglés, cada sección con su texto de manual-en.js; el hash de la pantalla,
// el módulo, admin y las relacionadas no cambian. Sin versión, en castellano.
export const GRUPOS = idioma === "en" ? GRUPOS_ES.map((g) => GRUPOS_EN[g] ?? g) : GRUPOS_ES;
export const SECCIONES =
  idioma === "en"
    ? SECCIONES_ES.map((s) => {
        const en = SECCIONES_EN[s.id];
        if (!en) return s;
        return { ...s, ...en, grupo: GRUPOS_EN[s.grupo] ?? s.grupo, pantalla: s.pantalla && [s.pantalla[0], en.pantalla ?? s.pantalla[1]] };
      })
    : SECCIONES_ES;
