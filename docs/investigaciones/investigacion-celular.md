# Nexo en el celular: investigación y diseño

> Pedido del usuario del 25 de octubre de 2026: en el celular "todo tiene el
> mismo tamaño que en la compu, solo más apretado". En Productos entran uno o
> dos renglones por pantalla y hay que deslizar todo el tiempo. Le pasó lo mismo
> con el sistema de su negocio de perfumes. Pidió **investigar antes de hacer**.
>
> Este documento junta lo que se investigó y el diseño elegido. Va junto con la
> PWA (CLAUDE.md §31): la app instalada es esta misma vista. El orden de trabajo
> está en `handoff.md` (puntos 7 y 7b del plan).

## 1. Cómo está hoy (26 de octubre)

- **Un solo corte, a 860 px.** Debajo, toda tabla `.ledger-table` se vuelve una
  tarjeta: se oculta el `<thead>` y cada celda pasa a ser una línea con su
  etiqueta (`td::before { content: attr(data-label) }`).
  - **Por eso Productos ocupa tanto:** son 11 columnas, así que son 11 líneas
    por producto, incluidas las de los botones.
  - Hay 62 tablas en `index.html`, y cada una de las ~25 funciones que las
    llenan arma sus celdas a mano.
- **Menú:** un cajón lateral que se abre con la hamburguesa de arriba a la
  izquierda. No se cierra tocando afuera. No hay barra de navegación abajo.
- **Formularios:** los 34 modales siguen siendo una tarjeta centrada, como en
  la compu.
- **Controles:** de 36 px de alto y con letra de 14 px. iOS hace zoom al
  enfocar cualquier campo de menos de 16 px.
- **Filtros:** se abren en ventanitas flotantes, pensadas para el mouse.
- **Lo que ya funciona bien en el celular:**
  - el punto de venta: grilla de productos, barra fija abajo con el total y
    botones grandes;
  - el embudo del CRM: una etapa por pestaña;
  - el alta guiada: pantalla completa con los botones fijos abajo.

## 2. Qué se investigó

### Sistemas de gestión y apps de comercio

- **Shopify** (app de administración):
  - **barra inferior**: Inicio, Pedidos, Productos y Tienda, más buscar;
  - **"+" arriba** para crear, y el formulario se guarda con "Guardar" o ✓ en
    la barra de arriba;
  - **filtros en una pantalla aparte**, y los activos quedan como chips que se
    sacan con una x;
  - las vistas guardadas se arman solo en la compu;
  - en tablet cambió la barra inferior por un menú lateral (marzo de 2024);
  - en Shopify POS: Pedidos, Productos y Clientes, más un menú "Más". El
    carrito es un botón fijo con la cantidad y el total, visible en toda
    pantalla.
- **Square:**
  - barra inferior con hasta **4 secciones a elección** en el iPhone, más
    "Más";
  - el cobro tiene pestañas arriba (teclado, catálogo, favoritos) y una
    búsqueda por nombre, código o SKU;
  - la app Dashboard muestra un inicio con indicadores y un filtro de local.
- **Loyverse:**
  - en la lista de artículos, **cada fila es el nombre con el stock debajo**;
  - crear es un **botón redondo "+" abajo a la derecha**;
  - la administración completa queda en la web. En el celular hay una app
    aparte solo para mirar ventas, lo más vendido y el stock bajo.
- **Tienda Nube:**
  - **Inicio, Ventas, Productos y Clientes**, y lo demás en un menú lateral;
  - cada venta muestra número, fecha, cliente, cantidad de productos, total y
    los estados de pago y de envío;
  - tiene búsqueda, filtros por estado y acciones rápidas (marcar pagada o
    empaquetada);
  - el inicio muestra las ventas de hoy y de ayer.
- **Mercado Pago** (lado del vendedor):
  - en "Tu negocio", cada movimiento muestra importe, fecha y hora, medio de
    pago y estado;
  - filtro por fechas.
- **Competencia argentina:**
  - **Contagram** no tiene app. En sus preguntas frecuentes admite que en el
    celular es "incómodo para la carga de muchos datos", aunque "funciona
    perfecto como herramienta de consulta".
  - **Dux** tampoco tiene una app oficial: es su web adaptada.
  - **Que Nexo se instale como app ya es un diferencial frente a los dos.**

### Guías de diseño

- **Material Design 3 (Google):**
  - barra de navegación de 80 dp, de **3 a 5 destinos**;
  - filas de lista de 56, 72 y 88 dp (una, dos y tres líneas);
  - toque mínimo de 48 × 48 dp, con 8 dp entre controles;
  - **un botón flotante para la acción principal** de la pantalla, de 56 dp,
    abajo a la derecha;
  - las hojas que suben desde abajo, para elegir algo sin perder la pantalla
    de atrás.
- **Apple (Human Interface Guidelines):**
  - **la barra de pestañas es para navegar, no para acciones**;
  - evitar la pestaña "Más" cuando esconde contenido importante;
  - toque mínimo de 44 × 44 pt;
  - las hojas, para tareas cortas; **una tarea de varios pasos va a pantalla
    completa**.
- **Shopify Polaris:**
  - debajo de 490 px sus tablas se vuelven filas apiladas y **pierden la
    selección múltiple**;
  - las acciones de cada fila no se muestran en pantallas chicas: van a la
    ficha o a un menú.

### Lo que se repite en todas

1. **Barra inferior con 4 o 5 secciones de uso diario.** Lo demás, en "Más" o
   en un menú lateral.
2. **Filas de dos o tres líneas, no tablas:**
   - arriba, el nombre y el importe a la derecha;
   - abajo, un dato o dos y el estado;
   - **nadie muestra todas las columnas.**
3. **Búsqueda arriba y filtros en una hoja o pantalla aparte**, con los
   activos como chips.
4. **Un solo botón de crear por pantalla.**
5. **Ficha y formulario a pantalla completa**, con el botón de guardar
   siempre visible.
6. **El celular es para consultar y para acciones rápidas** (vender, cobrar,
   registrar un ingreso). La carga pesada queda en la compu.

## 3. Diseño elegido

Las decisiones técnicas y de diseño las delegó el usuario (`handoff.md`,
"Quién decide").

### Navegación

- **Barra inferior en el celular** (hasta 860 px, el corte de siempre), con
  cinco lugares:
  - **Resumen**, siempre;
  - **tres secciones** de uso diario;
  - **Más**, que abre el menú completo: el cajón de siempre, con el selector de
    negocio y todas las secciones.
- **Las tres secciones salen de las funciones prendidas en el negocio**, en
  este orden de prioridad: Ingreso, Socios, Punto de venta, Trabajos, Ventas,
  Productos, CRM. Se toman las tres primeras que tenga el negocio. Queda así:
  - comercio: Resumen · Vender · Ventas · Productos · Más;
  - gimnasio: Resumen · Ingreso · Socios · Vender · Más;
  - servicios: Resumen · Trabajos · Ventas · Servicios · Más.

  Sale de las funciones, no del tipo de negocio (CLAUDE.md §29): un comercio
  que prende Socios ve Socios.
- **Se va la hamburguesa.** El cajón se cierra también tocando afuera.
- **El asistente** pasa a un ícono en la barra de arriba, para dejar libre la
  esquina de abajo.
- **En una ficha**, una flecha "volver" en la barra de arriba.

### Listas

- **Cada fila, dos líneas, de unos 64 px:**
  - arriba, el nombre y el importe a la derecha;
  - abajo, los datos secundarios unidos por " · " y el estado.
  - Productos, por ejemplo: "Remera negra M  $ 15.000" / "SKU 001 · Ropa ·
    12 u." En una pantalla entran ~9 en vez de 1 o 2.
- **Tocar la fila abre la ficha**, como ya pasa. Las listas sin ficha (Stock,
  Gastos, Caja) dejan visible un solo botón de 44 px.
- **En el celular se esconden** la selección múltiple y el precio editable en
  línea de Productos, como hace Polaris: eso se hace desde la ficha o desde la
  compu.
- **Cómo se hace:** es la misma fila de la tabla, con marcas en sus celdas
  (título, importe, estado) y una celda extra con los datos secundarios, que en
  la compu no se ve. No hay un segundo dibujo de cada lista, así que el
  celular y la compu no se pueden desfasar.

### Crear, filtrar y formularios

- **Un botón flotante "+ Nuevo …"** por pantalla, arriba de la barra inferior.
  Lleva texto y no solo "+": quien nunca usó Nexo tiene que entender qué hace.
- **Los filtros se abren en una hoja desde abajo**, y los activos quedan como
  chips en una fila que se desliza.
- **Todo formulario va a pantalla completa** en el celular, con el título
  arriba y los botones fijos abajo. Las confirmaciones cortas ("¿Anular la
  venta?") van en una hoja desde abajo.
- **El "atrás" del celular cierra el formulario**, en vez de salir de la
  sección.
- **Controles de 44 px y letra de 16 px**, así iOS no hace zoom.

### La app instalable (PWA)

- Se instala desde el navegador del celular, con ícono propio y a pantalla
  completa. Hay un botón "Instalar Nexo" en Configuración → Apariencia; en el
  iPhone, los pasos (Compartir → Agregar a inicio).
- **Sin conexión:**
  - abre y muestra lo último que se cargó;
  - **no guarda nada**: avisa arriba "Sin conexión · estás viendo lo cargado a
    las 14:32 · no se puede guardar hasta que vuelva".
- **Siempre se ve lo más nuevo:** con conexión, la app pide todo al servidor.
  Lo guardado es solo el respaldo para cuando no hay red.
- **Lo guardado es de quien lo cargó:** se borra al entrar y al salir de la
  cuenta, y va separado por negocio. Al empleado le llega ya sin costos, como
  siempre.

## 4. Para después

- Encabezados por día ("Hoy", "Ayer") en Ventas y Caja.
- Acciones deslizando la fila. En la web no hay un estándar, y siempre
  necesitarían un botón visible de respaldo.
- Escribir sin conexión y sincronizar después (CLAUDE.md §39).
- Notificaciones (stock bajo, cuentas por vencer) con Web Push.

## 5. Segunda vuelta: tamaños y cuánto entra en la pantalla (22 de noviembre)

> Pedido del usuario: en el celular "las opciones son muy grandes, entonces
> tenés que andar recorriendo todo". Quiere que lo básico sea cómodo, sabiendo
> que la compu siempre va a serlo más.

### Cómo está (medido en un celular de 390 × 780)

Las filas de las listas ya miden 64 px, como se decidió arriba. El problema es
todo lo que va **antes** y **alrededor** de las listas:

- **El Resumen mide 13 pantallas.**
  - "Primeros pasos" ocupa 1.242 px (una pantalla y media): cada paso es una
    tarjeta de 148 px con la explicación entera y un botón a todo el ancho,
    también los que ya están hechos.
  - Los botones del período (Hoy, 7 días…), "vs. período anterior" y
    "Personalizar" van en tres renglones: 147 px.
  - Cada cifra (Ventas, Ganancia…) es una tarjeta de 208 px con media tarjeta
    vacía, reservada para una línea chica.
- **En las listas, la primera fila aparece tarde:** a los 421 px en Ventas, 400
  en Stock, 569 en Cuentas corrientes (la pantalla útil tiene ~665). Antes van
  tres tarjetas grandes de totales, un título que repite el de arriba, "Exportar
  CSV" a todo el ancho y "Filtrar" en otro renglón.
- **Punto de venta:** con la caja cerrada, lo primero es el cartel de "¿Esta es
  la compu del mostrador?", que en un teléfono no corresponde.
- Letra: cuerpo de 15 px, títulos de sección de 17 y el de la pantalla de 24.
  Está bien: no es la letra lo que ocupa, son los márgenes, las tarjetas y lo
  que se muestra de más.

### Lo que dicen las guías y las apps

- **Apple:** letra de 17 pt de partida y 11 como mínimo; la escala va de 34
  (título grande) a 13 (notas al pie) y 12 (leyendas). Pide **lo importante
  arriba** y **mostrar de a poco** ("una interfaz con demasiado contenido y
  demasiadas opciones hace más difícil encontrar la información").
- **Nielsen Norman Group:** la primera pantalla tiene que ir "despiadadamente"
  a lo mínimo; lo secundario va a otra pantalla o plegado, y "si la primera
  pantalla es demasiado densa, nadie lee nada". Escribir corto en el celular.
- **Shopify:** en la app, las cifras del inicio son una **franja que se desliza
  de costado** (4 de partida, hasta 18 a elección). En 2025 los comerciantes se
  quejaron de una actualización porque "ahora hay que deslizar más en vez de
  ver de un vistazo".
- **Square:** el inicio y su widget muestran ventas, ventas netas, cantidad y
  ticket promedio, con un período a elegir.
- **Tableros en el celular:** de 3 a 5 cifras y uno o dos gráficos; cada cifra
  con su comparación.
- **Cómo se agarra el teléfono** (Hoober, 1.333 personas): 49 % con una mano,
  36 % sosteniéndolo con una y tocando con la otra, 15 % con las dos. Lo que se
  toca seguido va abajo o al medio, no arriba en las esquinas.
- Lo de octubre sigue: toques de 44 px como mínimo, campos con letra de 16 px.

### Qué se hace (solo en el celular; la compu queda igual)

1. **Primeros pasos plegado:** los pasos hechos se esconden y queda la cuenta
   ("Llevás 6 de 8"). Solo el próximo paso muestra su explicación y su botón;
   los otros son un renglón que se toca entero.
2. **Las cifras del Resumen, chicas:** la tarjeta mide lo que su número, con la
   línea chica abajo y sin el hueco.
3. **El período en un solo renglón** que se desliza de costado, con
   "Personalizar" al final.
4. **Las listas, más arriba:**
   - los totales de arriba (Ventas, Costo, Ganancia) en una franja compacta;
   - la tabla sin la tarjeta que la envuelve ni el título repetido;
   - "Exportar CSV" no se muestra (es de la compu) y "Filtrar" va al lado del
     buscador.
5. **El punto de venta sin el cartel de la compu del mostrador** en un
   teléfono.

Se miden antes y después con lo mismo: alto del Resumen en pantallas y dónde
aparece la primera fila de cada lista.

### Resultado (hist. §221)

| | Antes | Después |
|---|---|---|
| Resumen | 13 pantallas | 9,3 |
| Primeros pasos | 1.242 px | 340 |
| Cada cifra del Resumen | 208 px | 152 |
| Período y comparar | 147 px | 44 |
| Primera fila de Ventas | 421 px | 207 |
| Productos | 392 px | 268 |
| Stock | 400 px | 224 |
| Caja | 417 px | 232 |
| Cuentas corrientes | 569 px | 254 |

Además, "Últimos movimientos", "Mejores clientes" y "Evolución del resultado"
pasaron a filas de dos líneas (la evolución, con los últimos 7 períodos; el
gráfico muestra todos). Lo que sigue grande: el CRM (otra estructura) y lo que
cada uno elige ver en el Resumen, que se esconde con "Personalizar".

### El CRM, las fichas y los formularios (hist. §222)

Lo mismo que en las listas, en lo que quedaba:

- **Las fichas** (venta, cliente, producto, compra, proveedor, presupuesto,
  factura, devoluciones, trabajo, abono, socio y producción): sus tablas eran
  tarjetas de 4 o 5 renglones por fila ("N° · Fecha · Total · Cobro", uno
  abajo del otro). Ahora son filas de dos líneas, como las listas. Los datos
  vacíos no se muestran ("Email —"), como en los contactos del teléfono, y
  los botones de arriba van en un renglón.
- **El CRM:** sus listas van dentro de pestañas y no les llegaba lo de las
  listas; ahora sí.
- **Los formularios:** los campos ya miden 44 px con letra de 16 (lo mínimo
  para tocar cómodo y para que el iPhone no agrande la pantalla), así que no
  se achican. Lo que se hizo es sacar lo que no hay que elegir: una lista con
  una sola opción (un solo depósito) no se muestra, y en "Nueva venta" la
  fecha y el plazo van juntos, porque casi siempre quedan como vienen.

| | Antes | Después |
|---|---|---|
| Ficha de un cliente | 2,9 pantallas | 2,0 |
| Ficha de una venta | 3,0 | 2,5 |
| Ficha de un producto | 1,7 | 1,3 |
| CRM, clientes | 1,7 | 1,5 |
| Nueva venta: dónde empiezan los productos | 566 px | 322 |
| Nuevo gasto | más de una pantalla | entra en una |

Además, el aviso de lista vacía salía corrido a la derecha en el celular (el
lugar de una etiqueta que no tiene): ahora va centrado.

## Fuentes

- Material Design 3: [navigation bar](https://raw.githubusercontent.com/material-components/material-components-android/master/docs/components/BottomNavigation.md),
  [list tokens](https://raw.githubusercontent.com/material-components/material-web/main/tokens/versions/v0_192/_md-comp-list.scss),
  [FAB](https://raw.githubusercontent.com/material-components/material-components-android/master/docs/components/FloatingActionButton.md),
  [bottom sheet](https://raw.githubusercontent.com/material-components/material-components-android/master/docs/components/BottomSheet.md),
  [touch target](https://support.google.com/accessibility/android/answer/7101858).
- Apple HIG: [tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars),
  [sheets](https://developer.apple.com/design/human-interface-guidelines/sheets),
  [accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility).
- Shopify Polaris: [index table](https://raw.githubusercontent.com/Shopify/polaris/main/polaris.shopify.com/content/components/tables/index-table.mdx),
  [resource list](https://raw.githubusercontent.com/Shopify/polaris/main/polaris.shopify.com/content/components/lists/resource-list.mdx).
- Shopify: [filtrar pedidos](https://help.shopify.com/en/manual/fulfillment/managing-orders/viewing-orders/filtering-orders),
  [agregar productos](https://help.shopify.com/en/manual/products/add-update-products),
  [navegación en tablet](https://changelog.shopify.com/posts/updated-the-shopify-app-s-navigation-experience-on-tablet),
  [carrito siempre visible en POS](https://changelog.shopify.com/posts/keep-the-cart-in-view-on-mobile-pos).
- Square: [Dashboard app](https://squareup.com/help/us/en/article/5618-get-started-with-the-square-dashboard-app),
  [rediseño del POS](https://squareup.com/us/en/the-bottom-line/inside-square/square-pos-redesign).
- Loyverse: [stock en el POS](https://help.loyverse.com/help/displaying-stock-and-cost-items-pos),
  [artículos](https://help.loyverse.com/help/items-categories).
- Tienda Nube: [gestionar desde la app](https://ayuda.tiendanube.com/es_AR/159567-por-tiendanube/como-gestionar-mi-tiendanube-desde-la-aplicacion-movil),
  [blog de la app](https://www.tiendanube.com/blog/ecommerce-app/).
- Contagram: [contagram.com](https://www.contagram.com/) (preguntas frecuentes).
- Segunda vuelta (tamaños): Apple [typography](https://developer.apple.com/design/human-interface-guidelines/typography)
  y [layout](https://developer.apple.com/design/human-interface-guidelines/layout);
  Nielsen Norman Group, [defer secondary content](https://www.nngroup.com/articles/defer-secondary-content-for-mobile/)
  y [mobile content](https://www.nngroup.com/articles/mobile-content/);
  Shopify, [métricas del inicio en la app](https://changelog.shopify.com/posts/customizable-home-metrics-now-available-on-the-shopify-app)
  y [quejas por más scroll](https://community.shopify.com/t/shopify-editions-summer-update-25/416779);
  Square, [Dashboard app](https://squareup.com/help/us/en/article/5618-get-started-with-the-square-dashboard-app);
  Hoober, [how do users really hold mobile devices](https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php);
  [tableros en el celular](https://www.thebricks.com/resources/best-practices-for-mobile-dashboard-design).
