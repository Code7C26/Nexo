# Handoff — Nexo

> Este archivo existe para que una sesión nueva de Claude Code (u otra persona)
> pueda retomar el proyecto sin haber visto la conversación anterior. Se
> actualiza al final de cada etapa de trabajo — antes de tocarlo, leerlo
> entero, y no asumir que sigue reflejando el estado del código si pasó
> mucho tiempo: conviene revalidar contra `git log` y contra la base real.

## 1. Objetivo del proyecto

Nexo es un sistema de gestión integral para PyMEs y emprendimientos,
proyecto de escuela de **Santino Solla** y **Joaquin Tosi**. Centraliza
inventario, precios, clientes y facturación, con visión a futuro de
interfaz conversacional por voz.

Las reglas de negocio, la arquitectura y el criterio de prioridades están
en **`CLAUDE.md`** (raíz del repo) — es lectura obligatoria antes de tocar
nada, y contiene la fuente de verdad de qué se decidió y por qué. Este
handoff no la duplica, solo cuenta el estado de avance.

Puntos clave de `CLAUDE.md` para no perder de vista:
- IVA y retención de Mercado Pago están **fuera de V1**, a propósito.
- No inventar reglas de negocio ambiguas: preguntar.
- No pushear directo a `main`: rama por feature + PR.
- Antes de cambiar el esquema de la base, explicar la migración y su
  impacto.

## 2. Stack técnico

- Backend: Node.js + Express (`backend/server.js`).
- Base de datos: SQLite vía `node:sqlite` (`DatabaseSync`), **sin ORM**,
  SQL crudo con `db.prepare(...).run()/get()/all()`.
- Frontend: HTML, CSS y JS vanilla, sin build step
  (`frontend/index.html`, `frontend/js/app.js`, `frontend/css/styles.css`).
- Sin autenticación ni usuarios: el sistema lo usa un solo operador por
  ahora (decisión explícita, no agregar auth sin que se pida).
- **Nuevo en esta etapa**: `@google/genai` (dependencia de
  `backend/interprete.js`, el asistente por texto — ver §4). Se probó
  primero con `@anthropic-ai/sdk`/Claude y se cambió a Gemini en la misma
  sesión porque el usuario prefirió un proveedor con tier gratuito real
  (Anthropic es pago por uso) — el swap solo tocó `interprete.js`, ni
  `server.js` ni el frontend se enteraron.

## 3. Estado actual (a la fecha de este handoff)

**Rama activa:** `Tosi`. **Nada de esta sesión ni de las anteriores está
commiteado todavía** — son ya varias etapas seguidas (Devolución a
proveedor, Reportes, y ahora Asistente) verificadas y desplegadas sobre la
base real sin commitear. Se le preguntó al usuario en sesiones anteriores
si convenía commitear y prefirió seguir construyendo; no se volvió a
insistir en esta sesión por la misma razón que ya quedó anotada antes.
Además de los archivos modificados que ya venía arrastrando
(`backend/server.js`, `backend/db/schema.sql`, `frontend/css/styles.css`,
`frontend/index.html`, `frontend/js/app.js`, `.gitignore`), esta etapa
agrega sin trackear: `backend/interprete.js` (nuevo), `backend/package.json`
/`backend/package-lock.json` (nueva dependencia `@google/genai`), y un
backup nuevo `backend/db/nexo.db.backup-antes-asistente-20260827-155621`.
**El punto 6 de la sección "Cómo seguir" de handoffs anteriores ya se
resolvió**: `.gitignore` ahora tiene `backend/db/*.backup-*`, así que los
backups (son muchos, cada etapa deja el suyo) ya no van a aparecer sueltos
en `git status`. Sigue sin explicarse por qué `CLAUDE.md` aparece
modificado desde hace varias sesiones — no fue ninguna sesión reciente,
seguir revisando con el usuario antes de tocarlo.

**El servidor real corre en `http://localhost:3000`**, ya con todos los
cambios de abajo aplicados y verificados contra los datos reales
(pre/post-deploy comparados número a número, sin diferencias).

**Falta configurar `GEMINI_API_KEY`** — sin ella, el asistente por texto
responde 503 con un mensaje claro (`POST /api/asistente/interpretar`) pero
el resto de Nexo funciona normal. Es la única pieza de esta etapa que no
se pudo probar contra el modelo real (todo lo demás sí, con un intérprete
stub determinista — ver §4). Se consigue gratis en
[aistudio.google.com](https://aistudio.google.com) (Google AI Studio), sin
tarjeta. Primera tarea de la próxima sesión si el usuario ya tiene la key:
cargarla como variable de entorno del proceso real y probar el asistente
con frases reales, la del propio `CLAUDE.md` §21 incluida ("vendí tres
remeras negras talle M a Juan por 45 mil y me pagó por Mercado Pago").

### Etapas ya completas (los 10 puntos del MVP de `CLAUDE.md` §25)

En orden cronológico de construcción — cada una se dio por cerrada y
verificada antes de pasar a la siguiente:

1. Clientes, productos, proveedores, ventas, compras, stock, cobros/pagos.
2. Costeo desde compras (promedio ponderado, prorrateo de envío por valor
   del ítem), papelera con anular/restaurar.
3. Gastos (con `tipo`: operativo/inversión/retiro) + motor de **filtros
   estilo Notion** (`crearFiltros` en `app.js`) reusado en casi todas las
   pantallas.
4. Rediseño de frontend (tokens de diseño, modo oscuro, logo).
5. Facturas (estructura fiscal `tipo`/`letra`/`punto_venta`/`numero`,
   preparada para ARCA pero sin conexión real).
6. Presupuestos (oferta que no toca stock/CC/resultado hasta convertirse
   en venta).
7. Devoluciones y notas de crédito (lado de venta).
8. Devolución a proveedor.
9. Reportes de rentabilidad: evolución en el tiempo y comparación de
   períodos.
10. **Operaciones por texto (el asistente)** — la última etapa, terminada
    en esta sesión. Con esto, **el MVP completo de §25 ya está construido**
    (con la salvedad de la API key, arriba). Ver detalle en §4.

### Qué NO está construido todavía (de `CLAUDE.md`, más allá del MVP)

- Notas de débito como concepto general (§16/§17) — quedó fuera de la
  etapa de devolución a proveedor a propósito: se le preguntó al usuario
  y se determinó que el comprobante de una devolución a proveedor es una
  **nota de crédito que emite el proveedor** (no algo que Nexo emita), así
  que no hizo falta construir notas de débito para eso. Si en el futuro
  hace falta que Nexo emita una nota de débito de verdad (p. ej. hacia un
  cliente), es una etapa nueva, sin molde previo.
- Las otras tres familias de reportes de §20 — **qué se vende y a quién**
  (ranking de productos, mejores clientes, ticket promedio), **cuentas por
  cobrar y pagar** (juntar en una vista lo que hoy solo existe disperso en
  la ficha de cada cliente/proveedor) y **stock** (qué reponer, valorizado,
  rotación) — el usuario eligió empezar solo por rentabilidad y no volvió
  a pedir las otras.
- Ventas por categoría de producto y por vendedor (dentro de §20): **no
  son construibles hoy sin migrar el esquema primero** — no existe tabla
  de categorías de productos (`productos` no tiene `categoria_id`) ni
  columna de vendedor/usuario en `ventas` (no hay sistema de usuarios).
- Aging de cuentas por cobrar/pagar por vencimiento pactado: ni `ventas`
  ni `compras` tienen fecha de vencimiento ni condición de pago.
- Audio (§25 lo deja explícitamente para después de texto) — el asistente
  de esta etapa es solo texto.
- Auditoría central unificada (§22): con esta etapa hay trazabilidad
  parcial nueva (`asistente_mensajes` audita todo lo que pasa por el
  asistente — ver §4) sumada a la que ya existía (movimientos de stock y
  caja dicen qué operación los causó), pero sigue sin haber un log
  unificado que junte todas las fuentes en un solo lugar.
- Listas de precios (§18) y multidepósito avanzado (§19).
- Índice sobre `ventas(fecha)`: correcto a escala pero sigue sin agregarse
  (con el volumen actual es ruido y tocaría el esquema).
- Categorías de productos (§4 de `CLAUDE.md`, el documento de reglas):
  desbloquearía ventas-por-categoría de §20 y ordenaría el listado de
  productos. Es la migración más chica que queda pendiente si se quiere
  retomar reportes.
- Una entrada de menú ("IVA & Retenciones") sigue oculta del nav por
  apuntar a una pantalla vacía — no se borró nada, solo se sacó el link.
  ("Asistente de voz" ya NO está en esta lista: el asistente de **texto**
  si tiene pantalla propia desde esta etapa — nav "Asistente", ver §4.)

## 4. Última etapa completada: asistente flotante + repaso visual

**Ojo: el producto se llama Nexo, sin diéresis.** "Nexo" aparecía mal
escrito como "Nexö" en 26 lugares (UI, comentarios, docs, y el prompt de
sistema que se le manda a Gemini) — corregido en todo el repo esta etapa.
No volver a escribirlo con diéresis.

Se instaló la skill `frontend-design`
(`npx skills add https://github.com/anthropics/skills --skill
frontend-design`, queda en `.agents/skills/frontend-design/` — no
aparece en el listado de skills de Claude Code hasta reiniciar la
sesión, mientras tanto hay que leer `SKILL.md` directo).

**El asistente dejó de ser una vista del nav** (ya no es
`data-view="asistente"`, Papelera volvió a ser la entrada 14) y pasó a
ser un **widget flotante**: círculo abajo a la derecha
(`#asistenteLauncher`, ícono genérico de chispa) que abre un panel
(`#asistentePanel`) con un **hilo de conversación** tipo Notion/Canva
AI — cada frase queda apilada en `#asistenteHilo` junto con su
respuesta, sin borrarse al confirmar/descartar.

Esto obligó a un **refactor de fondo** en `frontend/js/app.js`: antes
`asistenteMensajeId` era una variable de módulo y todo se buscaba por
`document.getElementById(...)`, lo cual solo servía para una propuesta a
la vez. Ahora cada tarjeta recibe su **nodo raíz propio** y todo se
resuelve con `raiz.querySelector(...)`; los `id=` internos de las
plantillas (`plantillaAsistenteVenta/Compra/Gasto`) pasaron a ser clases
(`.asistente-cliente`, `.asistente-venta-items`, etc.) porque puede haber
varias tarjetas simultáneas en el documento. Verificado con Playwright
(24 checks, sin errores de consola) que confirmar una tarjeta con OTRA
tarjeta todavía pendiente **no toca los datos de la pendiente** — es el
caso que justificaba todo el refactor, y salió limpio. Se reusaron sin
tocar `agregarFilaItemVenta/Compra`, `leerItemsVenta/Compra`,
`totalItems`, `actualizarSubtotalFila`, `poblarSelectCuentas`,
`manejarError` (ya recibían un contenedor explícito, así que ya eran
seguras por tarjeta).

CSS nueva en `frontend/css/styles.css`, sección "Asistente flotante"
(antes de "Responsive"): launcher y panel usan `--sidebar-bg`/
`--sidebar-ink` (fijos en los dos temas) y no `--brand`/`--brand-contrast`
(que es negro puro sin variante clara para oscuro — un ícono con
brand-contrast quedaría invisible sobre brand en tema oscuro). `z-index:
45` para los dos: por encima del contenido, por debajo de `.modal` (50)
— verificado que "Nueva venta" tapa el panel y no al revés. La fila de
item (producto/cantidad/precio/subtotal/quitar) se apila en dos líneas
dentro del panel angosto (`.asistente-propuesta .item-row { flex-wrap:
wrap }`) en vez de duplicar el componente.

**Repaso visual — lo que se alcanzó a hacer:**
- `.tabla-vacia` (la clase que ya existía para el estado vacío de una
  tabla) estaba definida pero **17 de 22 lugares** seguían con el
  `style="text-align:center; color: var(--ink-muted); padding: 24px;"`
  inline que esa clase vino a reemplazar — unificado, ahora los 22 usan
  la clase.
- El círculo flotante tapaba la última fila de una tabla larga (se
  superponía a los links de acción de la columna derecha, ver Ventas).
  Se le agregó despeje al `padding-bottom` de `.main` (96px desktop, 88px
  mobile — antes 48px/40px) para que el contenido nunca quede debajo del
  botón.
- **Repaso completado en la continuación de esta misma sesión**: se
  revisaron con capturas las vistas que habían quedado pendientes
  (Compras, Presupuestos, Facturas, Clientes, Proveedores, Stock, Caja,
  Devoluciones) — todas consistentes, sin hallazgos nuevos salvo el bug
  de Caja de abajo.
- **Bug real encontrado y corregido en Caja** (`app.js`, función que
  arma la columna "Concepto" de Movimientos): para orígenes que no son
  cobro/pago/transferencia (gasto, manual, devolución...), el concepto
  quedaba **duplicado** ("Primero · Primero") porque una línea pensada
  para agregarle una nota extra a "Cobro de venta #N" se ejecutaba
  también para los orígenes que YA habían usado `m.concepto` como
  etiqueta principal. Acotado a los tres orígenes que corresponde.
- **Nav reordenado** por dominio en vez de por orden de construcción:
  Resumen → maestros (Productos/Clientes/Proveedores, lo que hace falta
  cargado antes de operar) → embudo de venta (Presupuestos/Ventas/
  Devoluciones/Facturas) → embudo de compra (Compras/Dev. a proveedor) →
  Stock (consecuencia de los dos embudos) → Finanzas (Caja/Gastos) →
  Papelera. Solo se reordenó el `<nav>`; las `<section>` de cada vista
  quedaron en su posición física original en `index.html` (no afecta
  nada: se muestran por `data-view`, no por orden en el DOM).

**Verificación**: migración de screenshots + Playwright en la copia de
scratchpad de siempre (puerto 3002, `NEXO_INTERPRETE=stub`). 24/24
checks: navegación de las 14 vistas restantes sin caer a placeholder,
apertura/cierre del panel, foco (al textarea al abrir, al launcher al
cerrar), Escape cierra, Enter envía/Shift+Enter salta de línea, hilo
acumula turnos, **las dos tarjetas pendientes simultáneas**, descartar
no ejecuta nada, modal por encima del panel, tema oscuro, mobile 375px
sin desborde horizontal. Sin errores de consola. Como el backend
(`server.js`/`interprete.js`) no se tocó en esta etapa, **no hizo falta
reiniciar el proceso real** — el frontend se sirve directo desde disco
(`express.static`, sin build step), así que los cambios ya están viviendo
en `http://localhost:3000` apenas se guardaron los archivos.

## 5. Etapa anterior: Asistente de operaciones por texto (CLAUDE.md §21)

### Etapas anteriores, resumidas

- **Devoluciones (venta y proveedor)**: una devolución revierte parte de
  una operación ya confirmada, es parcial por renglón, y puede
  emitir/asociar una nota de crédito
  (`aplicarDevolucion`/`revertirDevolucion` y su par
  `aplicarDevolucionProveedor`/`revertirDevolucionProveedor` en
  `server.js`, comentados). Lección que dejó: antes de clonar un chequeo
  de un endpoint a otro, confirmar qué operación de stock hace cada uno
  (entrada vs. salida).
- **Reportes de rentabilidad**: `calcularResultado(desde, hasta)` es la
  única fuente de verdad de las reglas contables de §17 (costo desde
  `venta_items.costo_unitario_historico`, nunca desde compras). La vista
  Resumen tiene un endpoint `/api/resumen/evolucion` con serie por
  período + comparación contra el período anterior, y un gráfico SVG
  dibujado a mano (sin librería) que sigue el tema claro/oscuro por
  variables CSS. Detalle completo en el historial de git de este archivo
  si hace falta.

### Qué se construyó en esta etapa

El usuario eligió, entre cuatro opciones (los 3 reportes que faltaban,
categorías de productos, auditoría central, u operaciones por texto),
**operaciones por texto** — el diferencial del producto según §26.
Alcance acordado: venta+cobro, compra y gasto (no consultas de lectura,
esa quedó explícitamente descartada para esta etapa); solo texto, no
audio.

**Arquitectura, en una frase**: el modelo interpreta pero NUNCA ejecuta —
propone llamando a una función (function calling), Nexo resuelve esos
nombres contra la base real, se lo muestra al usuario en una tarjeta
editable, y solo al confirmar se ejecuta, revalidando todo desde cero
como si fuera un formulario manual.

- **`backend/interprete.js` (nuevo, ~280 líneas)** — el único archivo que
  sabe que existe un proveedor de IA. Usa el SDK oficial de Google
  (`@google/genai`), modelo `gemini-3.6-flash` (se probó primero
  `gemini-2.5-flash` por tener un tier gratuito bien documentado, pero
  quedó deprecado para cuentas nuevas — ver el detalle en "Con el modelo
  real" más abajo; Gemini en general, a diferencia de Anthropic, tiene un
  tier gratuito real sin tarjeta, de sobra para una pyme chica), tres
  funciones (`registrar_venta`, `registrar_compra`, `registrar_gasto`) con
  esquemas que solo aceptan **nombres**, nunca IDs (Nexo los resuelve
  después). El contexto de negocio (cuentas de tesorería, categorías de
  gasto, catálogo de productos) va en `systemInstruction`; la fecha de hoy
  va aparte, en el mensaje del usuario. Sin `GEMINI_API_KEY` lanza
  `InterpreteError` (503), nunca rompe el proceso. **Se probó primero con
  Anthropic/Claude y se cambió a Gemini en la misma sesión** (a pedido del
  usuario, por el costo) — el archivo se reescribió entero pero su
  contrato público (`interpretar(texto, contexto)` → `{tipo, datos}` o
  `{tipo:null, mensaje}`, más `InterpreteError`) no cambió un bit, así que
  `server.js` y el frontend no necesitaron ningún cambio. Si en el futuro
  hace falta volver a Anthropic o soportar los dos, es la misma cirugía
  acotada a este único archivo. **`NEXO_INTERPRETE=stub`** activa un intérprete
  determinista sin red (mini-sintaxis `"venta: cliente=X; item=P,3,100"`)
  — así se pudo probar el circuito completo sin key ni gastar tokens; ver
  §6 para cómo usarlo.
- **`backend/server.js`, sección nueva `Asistente (operaciones por
  texto)`** (al final, antes de `app.listen`):
  - `POST /api/asistente/interpretar` — de solo lectura: le pasa el texto
    al intérprete y devuelve una propuesta con cada nombre ya resuelto
    contra la base (`resolverPropuesta`, vía `buscarPorNombre`: exacto
    primero, `LIKE` después, marca `resuelto`/`ambiguo`/`no_encontrado`/
    `no_dado`). Cliente (venta) y proveedor/producto (compra) pueden
    quedar `no_encontrado` sin bloquear — se crean por nombre, igual que
    el formulario manual. Producto en una venta y categoría/cuenta en un
    gasto **no** se crean solos: si no existen, bloquean
    (`ejecutable: false` + `problemas: [...]`). Cada interpretación con
    una operación detectada queda logueada en `asistente_mensajes`
    (tabla nueva, ver más abajo).
  - `POST /api/asistente/ejecutar` — recibe la propuesta ya confirmada
    (y eventualmente corregida a mano) y **no le cree ciegamente**: para
    venta, valida que cada `producto_id`/`cuenta_id` referenciado exista
    de verdad (`existeId`) y corre `validarStockDisponible`; para gasto,
    corre `validarGasto` tal cual; para compra, no hace falta id (compra
    siempre resuelve por nombre, igual que el formulario manual). Reusa
    las funciones internas de los endpoints normales en vez de
    reimplementar nada: `crearVenta`, `registrarCobro` (extraída de
    `POST /ventas/:id/cobros`), `crearCompra`/`confirmarCompra`
    (extraídas de `POST /compras` y `POST /compras/:id/confirmar`),
    `aplicarStockCompra`, `validarGasto`, `crearGasto` (extraída de
    `POST /gastos`). **Venta+cobro van en una sola transacción** — antes
    eran dos endpoints HTTP separados, imposibles de unir así; es la
    razón concreta de por qué `/ejecutar` es su propio endpoint. Marca
    el mensaje `confirmado` (con el id de la operación creada) o
    `fallido` (con el error) — nunca deja un mensaje "interpretado" sin
    resolución si la ejecución llegó a intentarse de verdad.
  - `POST /api/asistente/:id/descartar` — marca el mensaje `descartado`,
    no ejecuta nada.
  - Un chequeo de `mensaje_id` con `estado = 'interpretado'` en
    `/ejecutar` evita tanto ejecutar un mensaje que no existe como
    ejecutar el mismo dos veces.
- **`backend/db/schema.sql`, tabla nueva `asistente_mensajes`** — sin
  migración manual en `index.js` porque es un `CREATE TABLE IF NOT
  EXISTS` puro (aditivo, sin `ALTER`, sin FK entrantes de otras tablas):
  `texto`, `propuesta_json`, `estado` (interpretado/confirmado/
  descartado/fallido), `operacion_tipo`, `operacion_id`, `error`. Es a la
  vez la entidad "Mensaje/Confirmación" de §21 y un registro de auditoría
  nuevo para esta puerta de entrada (§22) — hoy no tiene una pantalla
  propia que la muestre (no se construyó un "historial" en el nav, quedó
  fuera del alcance acordado), pero los datos ya están, así que agregar
  esa vista más adelante es barato.
- **Frontend**: vista nueva `data-view="asistente"` (nav "14 — Asistente",
  entre Presupuestos... y Papelera, que pasó a "15"). Un textarea +
  botón "Interpretar", y debajo una tarjeta de confirmación por tipo de
  operación (`plantillaAsistenteVenta/Compra/Gasto` +
  `activarAsistenteVenta/Compra/Gasto` en `app.js`) con badges de estado
  (`.status` reusado, mismo patrón que "Cobro"/"Pago" en Facturas/Ventas)
  para cada campo resuelto. **Reusa fuerte los helpers que ya existían**
  para los modales manuales de Venta/Compra en vez de reimplementar filas
  de ítems: `agregarFilaItemVenta`/`agregarFilaItemCompra`,
  `leerItemsVenta`/`leerItemsCompra`, `totalItems`,
  `actualizarSubtotalFila`, `poblarSelectCuentas` — así la tarjeta hereda
  gratis el datalist de productos, el botón "+ agregar producto", quitar
  ítem, etc. Ambigüedad de cliente/proveedor se resuelve con un `<select>`
  de candidatos que completa el nombre exacto en el input de texto; para
  producto ambiguo se muestra una nota "Coinciden: X, Y" al lado del ítem.
  **`"asistente"` está agregado a `VISTAS_CONSTRUIDAS`** (si falta, el
  nav cae al placeholder en silencio).

### Verificación hecha antes de desplegar

- Metodología de siempre: copia aislada al scratchpad, servidor de
  prueba en el puerto **3002**, proceso del 3000 sin tocar hasta tener
  todo verde.
- **Migración**: `asistente_mensajes` se crea sola, sin tocar ninguna
  tabla existente (diff completo de todas las tablas, pre vs. post,
  columna por columna) — verificado también que arrancar el server dos
  veces seguidas no rompe nada (idempotencia).
- **Circuito completo con `NEXO_INTERPRETE=stub`**, por `curl`, para las
  tres operaciones — cada una verificada de punta a punta contra la
  cascada real: venta+cobro (stock descontado, costo histórico congelado,
  cuenta corriente y tesorería actualizadas), compra (alta de
  proveedor/producto nuevos, costo promedio ponderado con prorrateo de
  envío correcto), gasto (movimiento de tesorería, tipo heredado de la
  categoría cuando no se especifica).
- **Atomicidad (§23), probada de verdad y no solo por lectura de
  código**: se instaló un trigger SQL temporal que hace fallar el INSERT
  en `cobros` a propósito, a mitad de una venta+cobro ya en curso.
  Resultado: **ni el cliente nuevo, ni la venta, ni el movimiento de
  stock quedaron creados** — rollback completo de toda la cascada — y el
  mensaje quedó marcado `fallido` con el motivo exacto. Trigger
  eliminado después de la prueba.
- **Casos hostiles**: texto vacío, frase sin ninguna operación ("hola"),
  producto inexistente en una venta (bloquea, no se puede crear desde
  ahí), cliente ambiguo (dos "Juan" — detectado con ambos candidatos
  listados), importe negativo, cantidad mayor al stock disponible
  (rechazada en `/ejecutar` aunque la propuesta la haya marcado
  `ejecutable`, porque el stock se revalida ahí con los datos frescos),
  `mensaje_id` inexistente y reintento del mismo `mensaje_id` dos veces
  — todos devuelven un error claro, ninguno cuelga el servidor ni deja
  algo a medio escribir.
- **Sin `GEMINI_API_KEY`**: `/interpretar` devuelve 503 con mensaje
  claro; el resto de Nexo (probado con `/api/resumen`) sigue andando
  normal. Probado dos veces: una vez con el código armado sobre
  Anthropic (mensaje `ANTHROPIC_API_KEY`) y de nuevo después del swap a
  Gemini (mensaje `GEMINI_API_KEY`) — mismo comportamiento en los dos
  casos, solo cambió el nombre de la variable.
- **Frontend con Playwright** (headless, dos temas, viewport 1280 y
  375px): **15/15 checks en verde, consola sin errores** (una vez que se
  copió también `assets/` a la copia de prueba — sin eso salían 404 del
  logo, no relacionado con el código). Cliente/producto prellenados
  correctamente, badges renderizados, total del carrito correcto, el
  toggle "Ya se cobró" muestra/oculta cuenta e importe, confirmar
  ejecuta y muestra el mensaje de éxito, descartar no crea nada y limpia
  el formulario, "sin operación" muestra el mensaje del intérprete, tema
  oscuro se mantiene en la tarjeta recién creada, sin scroll horizontal
  en mobile. Capturas revisadas a mano en los tres escenarios (claro,
  oscuro, mobile).
- **Con el modelo real**: probado en esta misma sesión, ya con
  `GEMINI_API_KEY` cargada. El código de la llamada (`interpretarConGemini`
  en `interprete.js`) se había verificado antes contra los **tipos
  instalados del SDK** (`node_modules/@google/genai/dist/genai.d.ts`)
  campo por campo, no solo contra la documentación — y aun así
  `gemini-2.5-flash` (el modelo elegido originalmente) dio 404 al primer
  intento real: **quedó deprecado para cuentas nuevas**, la propia API
  contestó recomendando `gemini-3.6-flash` en el mensaje de error. Se
  cambió al toque y con eso sí funcionó. **Lección para la próxima vez que
  haga falta tocar el modelo**: la familia Gemini rota bastante seguido —
  si el modelo configurado empieza a dar 404, el mensaje de error de la
  API casi siempre dice directamente cuál usar en su lugar, es más
  confiable que buscar en documentación externa.
  - Probado con `/api/asistente/interpretar` (**de solo lectura**, no creó
    nada) contra el catálogo real: un gasto ("pagué el alquiler, 50 mil en
    efectivo" → categoría/cuenta/importe/tipo resueltos bien) y una venta
    ("vendí un Khamrah a Maria por 25 mil, todavía no me pagó" → producto
    resuelto, cliente nuevo detectado, **y reconoció correctamente que "no
    me pagó" significa sin cobro**, sin que se le pidiera explícitamente).
  - También probado con la frase textual de `CLAUDE.md` §21 ("vendí tres
    remeras negras talle M a Juan por 45 mil..."): el catálogo real no
    tiene remeras (es un negocio de perfumes), y el modelo **no inventó un
    producto para completar el esquema** — respondió en texto explicando
    que no encontró el producto, tal como pide el prompt de sistema. Buena
    señal de que la instrucción "no inventes" se está respetando de
    verdad.
  - **`/api/asistente/ejecutar` (el que sí escribe) no se probó contra el
    modelo real en esta sesión** — solo con el intérprete stub (ver
    arriba). La mecánica de ejecución es independiente del proveedor (no
    lee nada de `interprete.js` más que `{tipo, datos}`), así que no
    debería haber sorpresas, pero confirmar una operación de punta a punta
    desde la pantalla del usuario real es lo primero que vale la pena
    hacer con calma.
- **Deploy**: backup `nexo.db.backup-antes-asistente-20260827-155621` en
  `backend/db/`, proceso del 3000 reiniciado (`node --experimental-sqlite
  server.js`, mismo flag que ya usaba el proceso anterior), números
  post-deploy comparados 1:1 contra la foto pre-deploy (`/api/resumen`,
  cantidad de ventas/compras/clientes) — sin diferencias. El endpoint
  nuevo respondió 503 (esperado, sin key) contra el proceso real.

## 6. Archivos en juego

- `backend/db/schema.sql` — **una tabla nueva** (`asistente_mensajes`,
  al final del archivo), `CREATE TABLE IF NOT EXISTS` puro, sin tocar
  nada existente. `backend/db/index.js` — sin cambios (no hizo falta
  migración manual, ver §4).
- `backend/interprete.js` (**nuevo**, ~280 líneas) — todo lo que sabe de
  IA. Ver §4 para el detalle.
- `backend/server.js` (~4150 líneas) — sección nueva `Asistente
  (operaciones por texto)` al final, antes de `app.listen`. Además, tres
  funciones se **extrajeron** de sus endpoints (mismo comportamiento,
  ahora reusables): `crearCompra`/`confirmarCompra` (de `POST /compras` y
  `POST /compras/:id/confirmar`), `registrarCobro` (de `POST
  /ventas/:id/cobros`), `crearGasto` (de `POST /gastos`) — si tocás
  cualquiera de esos cuatro endpoints, revisá que el asistente los sigue
  usando bien.
- `frontend/index.html` — vista nueva `data-view="asistente"`, nav
  reordenado (Asistente = 14, Papelera pasó a 15).
- `frontend/js/app.js` (~5000 líneas) — sección nueva `Asistente
  (operaciones por texto)`, ubicada justo antes de `/* ----------
  Papelera ---------- */` (mismo orden que en `index.html`). **Se agregó
  `"asistente"` a `VISTAS_CONSTRUIDAS`.**
- `frontend/css/styles.css` — dos reglas nuevas, chicas, ambas con
  tokens ya existentes (`.asistente-problemas` con los acentos de
  `status-pendiente`, `.asistente-propuesta` solo margen).
- `backend/package.json`/`package-lock.json` — dependencia nueva
  `@google/genai` (después de probar y sacar `@anthropic-ai/sdk`).
- `.gitignore` — se agregó `backend/db/*.backup-*` (pendiente de varias
  sesiones, ver §3).

Patrón para orientarse rápido en `server.js`/`app.js`: cada entidad nueva
se agregó como una sección contigua, cerca de las entidades con las que
más se relaciona. El asistente es la excepción: como toca por igual
Ventas, Compras y Gastos, se lo puso al final de cada archivo (después de
Resumen/antes de Papelera), no pegado a ninguna de las tres en particular.

## 7. Cómo seguir trabajando (checklist para la próxima sesión)

1. **Leer `CLAUDE.md` entero** antes de proponer nada.
2. **`GEMINI_API_KEY` ya está cargada en el proceso real y probada**
   (ver §4, "Con el modelo real") — el asistente ya funciona de punta a
   punta con `/interpretar`. Lo único que falta probar es
   `/api/asistente/ejecutar` (el que sí escribe) contra el modelo real
   — confirmar una operación de verdad desde la pantalla "Asistente" es
   la primera prueba pendiente. El proveedor es Gemini, no Anthropic (el
   usuario lo pidió así por costo — ver §4 si hace falta el porqué o
   cómo volver a cambiarlo). Ojo: la key vive **solo** como variable de
   entorno del proceso que lo arrancó — si se reinicia el server sin
   pasarla nuevamente, vuelve a responder 503.
3. Para seguir probando el asistente **sin** key (o sin gastar tokens),
   usar `NEXO_INTERPRETE=stub` como variable de entorno del server de
   prueba: acepta frases con la sintaxis
   `"venta: cliente=X; item=Producto,cantidad,precio; cobro_cuenta=Y"`
   (también `compra:` y `gasto:`, mismo estilo `campo=valor; campo=valor`)
   — ver `backend/interprete.js` (función `interpretarStub`) para el
   detalle exacto de los campos por tipo.
4. Preguntarle al usuario **qué sigue** (no asumir) — con el MVP de §25
   completo, las opciones abiertas están en la sección 3 de este archivo
   ("Qué NO está construido todavía"). Repetir el patrón de
   `AskUserQuestion` con la opción recomendada primero.
5. Antes de tocar el esquema, explicar la migración y su impacto, y
   probarla primero sobre una copia aislada.
6. Metodología de verificación ya establecida (repetirla): copiar
   `backend/` + `frontend/` + `assets/` + `nexo.db` al scratchpad de la
   sesión (sin los `*.backup-*`), correr un servidor de prueba en el
   puerto **3002** (nunca el 3000, que es el real), verificar con `curl`
   y con Playwright. El **binario de Chromium** ya está cacheado
   localmente (`AppData/Local/ms-playwright`), pero el **paquete npm
   `playwright`** no siempre está en la copia — `npm install playwright`
   en el scratchpad es rápido porque no vuelve a descargar el browser.
   Si algo hostil hace falta forzar de verdad (como la prueba de
   atomicidad de esta etapa) y no se puede simular con datos válidos, un
   trigger SQL temporal sobre la copia de prueba es una forma limpia de
   hacerlo — eliminarlo después.
7. Antes de commitear cualquier cosa: son ya varias etapas seguidas sin
   commitear (Devolución a proveedor, Reportes, Asistente) — si el
   usuario no lo pide, no hace falta insistir de nuevo, pero si el
   número de archivos sueltos sigue creciendo puede valer la pena
   plantearlo con más insistencia que en sesiones anteriores.

## 8. Última etapa: sidebar fija + solape del asistente flotante

Etapa chica, solo CSS (`frontend/css/styles.css`), sin tocar backend ni
JS — no hizo falta reiniciar el proceso real (estático, sin build step).

- **Pedido del usuario**: en una página larga, al scrollear hacia abajo el
  pie de la sidebar ("Negocio / Tu Pyme") se veía cada vez más lejos,
  porque `.sidebar` era un ítem de grid normal sin posición fija — crecía
  junto con `.main` y quedaba anclada al final de la página entera, no al
  viewport. Se agregó `position: sticky; top: 0; height: 100vh;
  overflow-y: auto` a `.sidebar` (regla base, ~línea 181) para que quede
  siempre a la vista mientras se scrollea. La regla mobile (`@media
  max-width: 860px`, ~línea 1335) sigue igual — ahí la sidebar ya era un
  drawer `position: fixed` que se desliza con `transform`, y esa regla,
  al venir después en el archivo, sigue ganando en ese breakpoint sin
  conflicto.
- **Bug real encontrado de paso (no pedido, pero sí autorizado a mejorar
  lo que encontrara)**: el círculo flotante del asistente
  (`.asistente-launcher`, fixed bottom-right, 56px) tapaba los últimos
  dígitos de la columna de importe de **cualquier fila** de una tabla que
  pasara por esa esquina al scrollear (no solo la última fila de la
  página, que es el caso que ya se había resuelto antes con el
  padding-bottom de `.main`). Se reprodujo en Caja (columna "Importe",
  ej. "-$ 100.000,00" con el último dígito tapado) con viewport 1280×900,
  un ancho de ventana común. Fix: `.main` (~línea 319) ahora reserva ese
  mismo ancho también en el padding derecho (`calc(56px + var(--sp-5) +
  var(--sp-3))`, la misma cuenta que ya usaba `.asistente-panel` para su
  `bottom`) en vez de `var(--sp-6)`. Así ninguna columna alineada a la
  derecha llega nunca a la franja donde descansa el botón, en cualquier
  posición de scroll. La regla mobile de `.main` (padding propio, no
  hereda del shorthand) no se tocó — en mobile las tablas pasan a tarjetas
  apiladas (`.ledger-table td::before`) sin columnas pegadas al borde, así
  que no aplicaba el mismo problema.
- **Verificación**: Playwright contra el proceso real (`localhost:3000`,
  solo lectura — ningún endpoint que escriba) — el mismo método rápido
  para cambios solo-CSS, sin copiar a scratchpad ni levantar servidor de
  prueba en 3002 (eso es para cambios que tocan `server.js`/esquema).
  Confirmado con `boundingBox()` que `#sidebar` mantiene `y: 0` y
  `height` = alto del viewport aun con `scrollY > 0`; capturas de las 14
  vistas en desktop (claro), Caja y Ventas en oscuro, y Ventas en mobile
  (375px, sin scroll horizontal) — sin regresiones. El drawer mobile
  (`#navToggle`) se sigue abriendo/cerrando igual que antes.
- **Nota suelta, no resuelta esta etapa**: `CLAUDE.md` dice mantener
  `docs/handoff.md`, pero el handoff real que vienen actualizando las
  últimas sesiones (este archivo) vive en la raíz del repo
  (`handoff.md`), no en `docs/`. No se movió ni se tocó `CLAUDE.md` por
  las dudas — confirmar con el usuario si conviene mover el archivo a
  `docs/` o corregir la referencia en `CLAUDE.md` para que coincidan.

**Seguimiento en la misma etapa**: el usuario pidió además poder ocultar
la sidebar para ver una vista en pantalla completa (la idea original de
"correrla para un costado o dejarla fijada" del pedido inicial). Se
agregó:

- Botón `#btnColapsar` (icono chevron, reusa la clase `.btn-tema` para el
  estilo) al lado del logo en `.brand` — `frontend/index.html`. Hizo
  falta envolver el logo+nombre en un `.brand-id` nuevo para poder
  empujar el botón al extremo derecho con `justify-content:
  space-between` en `.brand` (`styles.css`).
- Al colapsar: `data-sidebar="colapsada"` en `<html>`, guardado en
  `localStorage` (`nexo.sidebar`) con el mismo criterio que `nexo.tema` —
  incluido el mismo script inline en el `<head>` de `index.html` que lo
  aplica antes de pintar, para que no haya flash de sidebar visible al
  recargar con la barra ya oculta.
- CSS nueva en `styles.css`, junto a las reglas de `.sidebar` (no en la
  sección "Responsive" de al final, que es solo el breakpoint mobile):
  `@media (min-width: 861px) { :root[data-sidebar="colapsada"] ... }`
  pone `.app` a una sola columna, oculta `.sidebar` y muestra
  `#navToggle` (el mismo hamburger que ya existía para el drawer mobile,
  reusado tal cual) como botón para volver a expandirla. **El
  `min-width` es importante, no cosmético**: sin él, si alguien colapsa
  la sidebar en desktop y después achica la ventana a mobile (o abre el
  mismo navegador en el celular, mismo `localStorage`), el selector
  `:root[data-sidebar="colapsada"] .sidebar { display: none }` gana por
  especificidad sobre la regla mobile aunque esta aparezca después en el
  archivo — rompería el drawer entero. Se probó explícitamente ese
  escenario (colapsar en 1280px, después achicar a 375px) y la sidebar
  vuelve a aparecer bien.
- `app.js`: click en `#btnColapsar` guarda el estado; el handler de
  `#navToggle` (el mismo que ya togglea `.is-open` en mobile) ahora
  también limpia `data-sidebar`/`localStorage` si estaba colapsada — un
  solo botón físico (misma esquina superior izquierda) sirve para "abrir
  el drawer" en mobile y "reexpandir la sidebar" en desktop, según cuál
  de los dos estados esté activo.
- Verificado con Playwright contra el proceso real: colapsa/expande,
  persiste entre reloads, sobrevive un resize a mobile sin romper el
  drawer, y se ve bien en oscuro. Sin errores de consola.

## 9. Última etapa: pasada de diseño de frontend (skill `frontend-design`)

Con el MVP de §25 completo, el usuario pidió una pasada de diseño sobre
el frontend: cerrar la distancia entre lo que el sistema de tokens de
`styles.css` ya declaraba (concepto "libro mayor / ticket de caja") y lo
que el usuario efectivamente veía. Se relevaron 22 mejoras posibles
(inventario completo en el historial de esta conversación) agrupadas en
6 frentes, y el usuario los aprobó todos. **Solo frontend** — no se tocó
`server.js` ni el esquema en ninguna tanda, así que no hizo falta
reiniciar el proceso real en ningún momento (`express.static`, sin build
step: los cambios se sirven solos apenas se guardan los archivos).

**Metodología de esta etapa** (más rápida que copiar a scratchpad, válida
porque no se tocó backend): ediciones aplicadas con scripts de Node ad
hoc (`String.split/join` con verificación de conteo exacto antes de
escribir — si un texto no aparecía la cantidad de veces esperada, el
script abortaba sin tocar el archivo), no con reemplazos manuales, para
poder tocar decenas de sitios en `app.js` (5262 líneas) sin errores de
tipeo. Verificación con Playwright contra el proceso real
(`localhost:3000`, que ya estaba corriendo — si no lo está, levantarlo
con `node --experimental-sqlite server.js` desde `backend/`) después de
cada tanda: capturas en claro/oscuro/375px, chequeo de consola sin
errores, y al menos un caso hostil por tanda probado de punta a punta
(no solo lectura de código).

### Tanda 1 — Feedback propio

Los 23 `alert()`/`confirm()` nativos del navegador (chrome propio,
bloqueaban el hilo) se reemplazaron por infraestructura propia en
`app.js`, ubicada junto a `manejarError` (que ahora llama
`avisar(mensaje, "error")` en vez de `alert`):
- **`avisar(mensaje, tono)`** — toast que se apila en `#avisos`
  (`index.html`), abajo a la izquierda. Tres tonos sobre los tokens
  existentes (`--accent-ok/warn/danger`). Se retira solo a los 4.2s.
- **`confirmar({titulo, cuerpo, aceptar, destructivo})` → `Promise<boolean>`**
  — abre `#modalConfirmar` (modal nuevo en `index.html`, reusa
  `.modal`/`.modal-card`), Enter confirma, Escape o click afuera cancela.
  El botón de acción usa `.btn-peligro` (nuevo, mismo criterio de
  `--brand-contrast` que `.btn-add-item`) cuando `destructivo: true`.
- Los 8 `confirm()` de acciones destructivas pasan a `await confirmar(...)`
  con mensaje de éxito después (`avisar(...)`); los 14 `alert()` de
  validación de formulario pasan a `avisar(..., "atencion")`; los 20
  formularios de alta/edición que antes cerraban el modal en silencio
  ahora avisan qué se creó/actualizó (con el id cuando el endpoint lo
  devuelve, ej. "Factura #12 registrada").
- **Bug real encontrado y corregido de paso**: el toast en la esquina
  inferior izquierda tapaba a medias el pie de la sidebar (nombre del
  negocio + botón de tema), que vive en esa misma esquina. `.avisos` pasa
  a arrancar después de la sidebar (`left: calc(var(--sidebar-w) + var(--sp-5))`),
  con vuelta al borde real si la sidebar está colapsada o en mobile.

### Tanda 2 — Carga y estados vacíos

- **`tablaCargando(bodyId, colspan)`** — filas skeleton (nueva animación
  `skeleton-brillo`, respeta `prefers-reduced-motion` vía la regla global
  ya existente) al principio de los 13 `cargar*()` que alimentan una
  tabla, antes del `await fetch`.
- **`filaVacia(colspan, mensaje, {accionTexto, accionId})`** reemplaza
  los 22 `<tr><td class="tabla-vacia">` sueltos. Con acción, el botón
  dispara el mismo control que ya abre el alta (`data-abrir="<id>"` +
  un único listener delegado en `document`) — 8 vistas (Facturas,
  Productos, Stock, Presupuestos, Ventas, Compras, Clientes,
  Proveedores) y Caja/Gastos la tienen.
- **`filaVaciaFiltrada(colspan)`** distingue "no hay nada cargado" de
  "el filtro no encontró nada": se agregó `limpiar()` al objeto que
  devuelve `crearFiltros()` (mismo efecto que vaciar los chips a mano) y
  cada vista con filtro lo usa cuando `filtros.length > 0`. De paso,
  Gastos dejó de decir "no coincidan con el filtro" cuando en realidad
  no había ningún filtro puesto (imprecisión que ya traía).

### Tanda 3 — Orientación (dónde estoy)

- **`VISTAS_CONSTRUIDAS`** pasó de `Set` a mapa (`{titulo, dominio, nav?, esFicha?}`),
  el dominio es el mismo agrupamiento del `<nav>` (Resumen / Maestros /
  Embudo de venta / Embudo de compra / Stock / Finanzas / Papelera).
- **`mostrarVista(viewId, {titulo, actualizarHash})`** ahora setea el
  eyebrow, el `<h1>` (que dejó de ser la fecha — la fecha bajó a
  `.topbar-fecha`, chica, a la derecha), `document.title` y
  `aria-current="page"` en el nav activo. Las 9 vistas de ficha (no
  están en el nav) tienen su propio `nav` (qué ítem se mantiene
  resaltado, ej. ver una venta mantiene "Ventas" activo) y `esFicha:true`
  (no generan hash — el nombre de vista solo no alcanza para reconstruir
  qué registro mostrar); cada `abrirFicha*()` pasa su propio `titulo` en
  cuanto sabe qué registro es (ej. `Venta #37`).
- **Deep-link por hash** (`#/ventas`) para las 14 vistas del nav:
  `hashchange` + lectura inicial al cargar. F5 y el botón Atrás del
  navegador ya no tiran siempre a Resumen.

### Tanda 4 — Los 20 modales

- Nuevo bloque en `app.js`, "Accesibilidad de modales": un
  `MutationObserver` por `.modal` sobre el atributo `hidden`, sin tocar
  ninguno de los ~90 sitios que ya hacen `modalX.hidden = true/false` —
  cualquier apertura/cierre existente hereda foco y Escape gratis. Al
  abrir, foco al primer campo real (salteando el botón ✕, que es siempre
  el primer focusable en el DOM); al cerrar, el foco vuelve a quien lo
  disparó. Escape cierra; Tab/Shift+Tab quedan atrapados dentro
  (probado el wrap en los dos sentidos). `modalConfirmar` queda afuera
  de este sistema a propósito — ya tiene el suyo propio de la Tanda 1,
  porque necesita resolver una promesa, no solo abrir/cerrar.
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` en los 20
  `.modal` de `index.html` (10 ya tenían un `<h3 id="...">` para
  apuntar; a los otros 10 se les agregó el id).
- El carácter `✕` de los 21 botones de cerrar (20 modales + el panel del
  asistente) pasó a ser el mismo SVG de línea que ya usan
  `ICONO_TACHO`/`ICONO_LAPIZ`. Los `✕` de `.filtro-chip-x` e
  `.item-row-remove` quedaron igual a propósito (rol distinto, no son
  cierre de modal).

### Tanda 5 — Tablas

- Ventas tenía la columna Total centrada mientras Costo y Ganancia iban
  a la derecha (único caso en todo el archivo, revisado con `grep`); ya
  es `align-right` en `app.js` e `index.html`.
- `ESTADO_COBRO_LABEL`/`ESTADO_PAGO_LABEL` (junto a
  `ESTADO_COBRO_CLASE`/`ESTADO_PAGO_CLASE`, esta última renombrada desde
  `PAGO_CLASE` por simetría) reemplazan el valor crudo del backend
  ("pendiente"/"parcial"/"cobrado"/"pagado") que se mostraba tal cual en
  Facturas, Ventas, Compras, y los historiales de ficha de Cliente y
  Proveedor — mismo criterio que ya tenían `PRESUPUESTO_LABEL`,
  `STOCK_LABEL` y `TIPO_GASTO_LABEL`. Dos declaraciones locales
  duplicadas de `COBRO_CLASE` (en `renderVentas` y en
  `abrirFichaCliente`) se eliminaron a favor de la compartida.
- `.main` reservaba ~92px de padding derecho en las **14 vistas**, todo
  el tiempo, solo para que el círculo del asistente no tapara una
  columna en ventanas angostas. Por encima de 1600px de ventana (sidebar
  240px + `max-width:1280px` de `.main` = 1520px de contenido real, más
  margen) el botón cae sobre fondo vacío, no sobre la tabla — ahora ese
  padding extra solo se aplica por debajo de ese umbral
  (`@media (min-width: 1600px)`).
- **Encabezado de tabla fijo al scrollear**: se sospechaba que
  `.tabla-scroll { overflow-x: auto }` iba a capturar el `sticky` para sí
  misma en vez de dejarlo pegado al viewport (el padding-right de arriba
  documenta ese tipo de sorpresa). Se probó a mano antes de descartarlo
  y **funcionó**: como `.tabla-scroll` no tiene overflow vertical propio
  (su alto es el de su contenido), el scroll relevante para el `sticky`
  sigue siendo el de la página. `.ledger-table th` ahora es
  `position: sticky; top: 0` con fondo propio (si no, las filas de abajo
  se transparentan por debajo al scrollear).

### Tanda 6 — Identidad visual

Decisión tomada con el usuario: llevar el concepto tipográfico hasta el
final en vez de agregar color de marca (la paleta ya era una elección
deliberada, el hueco estaba en la tipografía, no en el color).

- **`--font-display` dejó de ser un alias de `--font-body`**
  (las dos eran Plus Jakarta Sans) y pasa a ser IBM Plex Mono — la
  familia que ya estaba cargada y que ya era la voz de los números.
  Toma los títulos de pantalla (`.topbar h1`, con tracking `-0.02em`
  porque el mono se abre más a ese tamaño), `.eyebrow`, `.panel-head h2`,
  `.modal-head h3`, `.ledger-label`, `.ledger-table th`, `.ficha-datos dt`
  y `.status`. La sans queda para texto corrido, celdas y formularios.
  Se sumó el peso 700 al import de Google Fonts de IBM Plex Mono (antes
  traía 400/500/600; `.modal-head h3` no fijaba `font-weight` y usa el
  bold por default del navegador).
- **Jerarquía de la ledger-strip**: "Resultado" es la conclusión de la
  tira, no un insumo más — nueva clase `.ledger-item-total` (en el
  `<div>` de Resultado en `index.html`) le da más `flex`, un
  `.ledger-value` a `--txt-2xl` (antes igual a los demás, `--txt-xl`) y
  un `.ledger-label` en `font-weight:700`.
- **Gráfico de evolución** (`renderGraficoResultado`, sigue siendo SVG a
  mano sin librería): las barras ganaron `rx="2"` (esquina de ticket,
  apenas insinuada) y un `<style>text{font-family:var(--font-mono)}</style>`
  inline en el propio SVG para que los números de los ejes hablen el
  mismo idioma que el resto de la identidad — antes heredaban la sans
  por default sin que nadie lo hubiera decidido así.

### Verificación final

Barrido con Playwright por las 14 vistas del nav de punta a punta
(título, eyebrow, sección visible), ciclo de tema oscuro sobre 3 vistas,
drawer mobile + una vista a 375px sin desborde horizontal — **0 errores
de consola** en toda la corrida. Además, por tanda: toast/confirmar
probados con clicks reales (no solo lectura de código), F5 sobre
`#/ventas` vuelve a Ventas, ficha de venta mantiene "Ventas" resaltado y
restaura el título al volver, Tab-trap probado en los dos sentidos
dentro de un modal real, `.tabla-vacia-limpiar` restaura las filas
después de un filtro sin resultados.

### Qué queda pendiente de esta etapa

- **Nada bloqueado** — las 6 tandas del plan se completaron y
  verificaron. Los 22 hallazgos del inventario original quedan
  registrados en el historial de esta conversación por si en el futuro
  se quiere revisar alguno que no entró en esta pasada (ninguno quedó
  afuera, en realidad: los 6 grupos A–F se cubrieron todos).
- Sigue sin resolverse lo anotado en §8: `CLAUDE.md` dice mantener
  `docs/handoff.md`, pero este archivo vive en la raíz del repo.
- Como todas las etapas previas, **nada de esto está commiteado** — son
  ya varias etapas seguidas sin commitear (Devolución a proveedor,
  Reportes, Asistente, y ahora esta). El número de archivos sueltos en
  `git status` sigue creciendo; vale la pena plantearlo con más
  insistencia la próxima vez que se converse con el usuario.
