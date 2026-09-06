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

**Rama activa:** `Tosi`. **Cuatro commits al tope de `main`**: `468c01f`
("feat: devolución a proveedor, reportes de rentabilidad, asistente IA y
rediseño de frontend", de una sesión anterior), `a13fbd8` ("feat: cuentas
corrientes a cobrar y a pagar", §10), `4a33a5e` ("feat: fix bugs de cuenta
corriente y agrega reportes de ventas y stock", §11 + §12 juntas en un
commit — no se pudieron separar en dos porque las dos etapas terminaron
entrelazadas línea por línea dentro de los mismos arrays de refresco de
`app.js`, algo que git no puede stagear parcialmente) y `5ffb749` ("feat:
categorías de productos y ventas por categoría", §13, commiteado al
arrancar esta sesión antes de tocar más código).

**Encima de esos cuatro commits, `Tosi` tiene ahora un quinto commit**:
`156e919` ("feat: auditoría central unificada", §14 de este handoff),
commiteado al arrancar esta sesión (venía desplegado pero sin commitear
de la sesión anterior).

**Rama nueva de esta sesión: `feature/fusion-resumen`**, creada desde ese
commit para la Etapa A del plan de usuarios/login/roles (fusión de "Qué
se vende" en Resumen — ver §15). Sin PR abierto todavía — el link para
crearlo quedó en la salida del `git push`
(`https://github.com/Code7C26/Nexo/pull/new/feature/fusion-resumen`). La
Etapa B (usuarios, login y roles) del mismo plan queda para una rama y un
PR propios, después de que este se mergee.

**Estado de ramas en GitHub, a confirmar con el usuario en la próxima
sesión (no decidido del todo, ver por qué abajo):** `Tosi` y `solla`
apuntan ahora al mismo commit (`50cd520`) — se hizo así porque `solla`
estaba 7 commits atrás y sin ningún commit propio que `Tosi` no tuviera
(divergencia 0/7, verificado con `git rev-list --left-right --count`), y
el usuario confirmó llevar `solla` al día de `Tosi` en vez de dejarla
atrasada. **`Tosi` en el remoto tenía un commit que esta sesión no tenía
localmente** (`c3531c2`, "docs: boceto de manual de usuario y variantes
del logo", de `joacotosi68`, con `docs/manual-usuario.html` +
`assets/logo/` + `logo.png`) — se mergeó sin perder nada de ningún lado.
Ese commit traía **"Nexö" con diéresis en 8 lugares** (el título del
manual, la marca en el sidebar del manual, y `assets/logo/README.md`) —
se corrigió a "Nexo" antes de pushear nada (ver memoria del proyecto:
"Nexo" nunca lleva diéresis). El único conflicto real del merge fue ese
mismo README (agregado distinto en cada rama), resuelto quedándose con el
texto sin diéresis. `feature/fusion-resumen` después mergeó `Tosi` ya
actualizado, así que también tiene el manual y los assets de logo.
**`main` no se tocó** — sigue muy atrás (`f5547e9`), no se movió por no
ser lo que se pidió explícitamente. **Sin explorar todavía**: por qué
`origin/Tosi` tenía ese commit que la copia local de esta sesión no
tenía (probablemente un push desde el dispositivo de Joaquín entre
sesiones) — si vuelve a pasar, conviene `git fetch` antes de empezar a
trabajar, no solo al pushear al final.

Quedaron fuera de los commits, sin tocar, dos archivos sueltos en la raíz
que no son parte del proyecto Nexo: `install.ps1` (instalador del propio
MCP `codebase-memory-mcp`, no del sistema de gestión) y `.agents/skills/`
(carpeta local de skills de Claude Code, reproducible desde
`skills-lock.json`, que sí se commiteó).

**El servidor real corre en `http://localhost:3000`**, ya con todos los
cambios de esta sesión aplicados y verificados contra los datos reales
(pre/post-deploy comparados número a número, sin diferencias — ver §11,
§12 y §13). El proceso se reinició tres veces durante esta sesión, una por
cada etapa, para levantar el código nuevo.

**`GEMINI_API_KEY` NO está cargada en el proceso real ahora mismo** — el
asistente por texto responde 503 (`POST /api/asistente/interpretar`).
Handoffs anteriores decían que sí estaba cargada y probada contra el modelo
real; en algún momento entre esa sesión y esta el proceso se reinició sin
volver a pasarla (la key solo vive como variable de entorno del proceso que
lo arrancó, nunca se guardó en disco — no hay `.env`). Esta sesión no tiene
el valor de la key, así que no se pudo restaurar. El resto de Nexo funciona
normal sin ella. Se consigue gratis en
[aistudio.google.com](https://aistudio.google.com) (Google AI Studio), sin
tarjeta. Si el usuario la tiene, cargarla como variable de entorno al
arrancar el proceso real es la primera tarea rápida de la próxima sesión.

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
- Las cuatro familias de reportes de §20 (ventas, compras, stock,
  finanzas/rentabilidad) están construidas: **cuentas por cobrar y pagar**
  (§10), **qué se vende y a quién** (§11) y **stock** — qué reponer,
  valorizado, rotación como días de inventario (§12).
- **Ventas por categoría de producto ya se construyó (§13)**. Ventas por
  **vendedor** sigue sin ser construible: no hay columna de vendedor/usuario
  en `ventas` (no hay sistema de usuarios), y esta migración no lo
  desbloquea.
- Aging de cuentas por cobrar/pagar por **vencimiento pactado** (§10 lo
  mide por fecha de la operación, no por vencimiento): ni `ventas` ni
  `compras` tienen fecha de vencimiento ni condición de pago.
- Audio (§25 lo deja explícitamente para después de texto) — el asistente
  de esta etapa es solo texto.
- **Auditoría central unificada (§22): construida en esta sesión — ver
  §14.** Tabla `auditoria` nueva (bitácora del acto del operador, distinta
  de los libros mayores `movimientos_*`), ~42 puntos de inserción, vista
  con dos paneles.
- Listas de precios (§18) y multidepósito avanzado (§19).
- Índice sobre `ventas(fecha)`: correcto a escala pero sigue sin agregarse
  (con el volumen actual es ruido y tocaría el esquema).
- **Categorías de productos ya se construyó (§13)**, un solo nivel (sin
  subcategoría — decisión explícita, ver §13). Marca y unidad de medida
  (§3/§4 de `CLAUDE.md`) siguen sin construirse.
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
2. **`GEMINI_API_KEY` NO está cargada en el proceso real ahora mismo**
   (ver §3) — el asistente responde 503. Se probó contra el modelo real en
   una sesión anterior (ver §4, "Con el modelo real") y funcionaba, pero la
   key vive **solo** como variable de entorno del proceso que lo arrancó:
   se perdió en algún reinicio posterior y esta sesión no tenía el valor
   para volver a cargarla. Si el usuario la tiene, cargarla al arrancar el
   proceso real es rápido. Sigue faltando probar `/api/asistente/ejecutar`
   (el que sí escribe) contra el modelo real de punta a punta desde la
   pantalla — con el intérprete stub ya se probó (§4/§10). El proveedor es
   Gemini, no Anthropic (el usuario lo pidió así por costo — ver §4 si hace
   falta el porqué o cómo volver a cambiarlo).
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
7. **Ya se commiteó** el bloque grande de etapas anteriores (`468c01f`,
   ver §3) — la etapa de Cuentas corrientes (§10) quedó encima, sin
   commitear todavía. Confirmar con el usuario si conviene commitearla
   antes de seguir, mismo criterio de siempre: si no lo pide, no insistir
   de más, pero no dejar que se acumulen demasiadas etapas sueltas otra
   vez.

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
- Como todas las etapas previas, en el momento de escribir esto **nada de
  esto estaba commiteado** — son ya varias etapas seguidas sin commitear
  (Devolución a proveedor, Reportes, Asistente, y ahora esta). El número de
  archivos sueltos en `git status` sigue creciendo; vale la pena plantearlo
  con más insistencia la próxima vez que se converse con el usuario.
  **Actualización: esto ya se resolvió en la sesión siguiente — ver §3 y
  §10, todo lo de arriba quedó commiteado en `468c01f`.**

## 10. Última etapa: Cuentas corrientes (a cobrar y a pagar)

Con el MVP de `CLAUDE.md` §25 completo, se le preguntó al usuario qué
construir a continuación entre cuatro opciones (voz en el asistente,
cuentas por cobrar y pagar, reportes de qué-se-vende, categorías de
producto); eligió **cuentas por cobrar y pagar**, la familia de reportes de
§20 que faltaba y la de mayor valor operativo con menor riesgo (no
requería migrar el esquema).

**El problema que resuelve**: la deuda ya existía y estaba bien calculada
(`saldo_cc_clientes`/`saldo_cc_proveedores`), pero solo se podía ver de a
una entidad por vez, entrando a su ficha. No había ninguna pantalla que
respondiera "¿quién me debe?" o "¿a quién le debo?" de un vistazo.

**Verificado antes de construir** (con la base real, solo lectura): toda
fila de `movimientos_cc_clientes` lleva su `venta_id` y toda fila de
`movimientos_cc_proveedores` lleva su `compra_id` — 0 huérfanas. Por eso
`SUM(importe) GROUP BY venta_id` da el saldo pendiente exacto de cada
operación sin necesitar imputación FIFO de cobros contra ventas.

### Qué se construyó

- **`GET /api/cuentas-corrientes`** (nuevo, `backend/server.js`, sección
  `Cuentas corrientes` entre Gastos y Resumen) — de solo lectura, sin
  parámetros: arma el saldo pendiente por operación (`saldosPorOperacion`),
  lo agrupa por entidad (`agruparPorEntidad`), y calcula antigüedad desde
  la **fecha de la operación** (no hay vencimiento pactado en el esquema:
  ni `ventas` ni `compras` tienen esa columna, así que la vista lo aclara
  en su propio texto). Tres tramos (`al_dia`/`atrasado`/`vencido`, cortes
  en 30 y 60 días) que calzan 1:1 con las clases `.status-*` que ya
  existían, sin CSS nueva para eso. Un saldo negativo es crédito a favor
  (lo genera una devolución sin reintegro en efectivo) y se reporta aparte
  (`a_favor_clientes`/`a_favor_proveedores`), sin sumar a la deuda de nadie
  ni tener antigüedad. No filtra por estado de la operación a propósito:
  anular ya inserta el movimiento de reversión que deja el saldo en cero,
  así que las anuladas se caen solas por el `HAVING ABS(SUM(...)) > 0.005`.
- **Vista nueva `data-view="cuentas-corrientes"`** (nav "13", entre Caja y
  Gastos, que pasó a "14"; Papelera a "15"). Dos paneles ("Por cobrar" /
  "Por pagar") con fila expandible: click en la fila de una entidad
  despliega el detalle por operación (fecha, pendiente, antigüedad, y un
  botón "Cobrar"/"Pagar" por renglón). El botón reusa **tal cual**
  `abrirModalCobrarVenta`/`abrirModalPagarCompra`, los mismos modales que ya
  usan Ventas y Compras — no se duplicó nada. El nombre de la entidad es un
  link (`.btn-link`) a su ficha; clickear el nombre no togglea la fila
  (mismo patrón que ya usan todas las filas clickeables: `e.target.closest("button")`).
  Filtros y orden (`crearFiltros`/`crearOrden`) sobre nombre/saldo/antigüedad.
- **`cargarCuentasCorrientes()` se engancha en 14 lugares** — todos los
  puntos de `server.js`/`app.js` donde una mutación puede cambiar una
  cuenta corriente (crear/editar/anular venta, cobro, devolución de venta
  y su anulación, confirmar/editar/anular compra, pago, devolución a
  proveedor y su anulación, presupuesto convertido en venta, ejecución del
  asistente, restaurar desde papelera) más el arranque. Se decidió así
  después de notar que `cargarResumen()` (que es el mismo tipo de vista
  derivada/reporte) ya sigue exactamente ese patrón en esos mismos 14
  lugares — no es una convención nueva, es la que el proyecto ya tenía.
  Los gastos y la caja manual NO enganchan (no tocan cuenta corriente).

### Verificación hecha antes de desplegar

- Metodología de siempre: copia aislada al scratchpad, servidor de prueba
  en el puerto 3002, proceso del 3000 sin tocar hasta tener todo verde.
- **Invariante numérico**: el `por_cobrar`/`por_pagar` del endpoint nuevo
  coincide exactamente con la suma de `deuda` positivos que ya devuelven
  `GET /api/clientes`/`GET /api/proveedores` — verificado contra la base
  real antes y después del deploy (Tosi $340.000 en la venta #9; Boysnet
  $566.000 en las compras #1 y #2; Paraguaya $135.000 en la compra #3).
- **Casos hostiles, ejecutados de verdad sobre la copia**: cobro parcial
  (el pendiente baja), cobro total (la fila desaparece), devolución sin
  reintegro sobre una venta ya cobrada (saldo negativo, aparece como "a
  favor", sin tramo ni antigüedad), anular una compra con deuda (desaparece
  sola), y el estado sin ninguna deuda (los dos paneles muestran su mensaje
  vacío).
- **Playwright** (dos temas, tres scripts separados, 23 checks en total):
  carga sin errores de consola vía deep-link `#/cuentas-corrientes`,
  expandir/colapsar la fila, click en el nombre abre la ficha sin togglear
  la fila, pagar desde la vista (modal precargado con el saldo real, strip
  baja y la fila desaparece **sin recargar la página**), ordenar por
  columna (asc/desc), y 375px sin scroll horizontal.
- **Deploy**: backup `nexo.db.backup-antes-cuentas-corrientes-20260828-113138`,
  proceso del 3000 reiniciado (PID viejo 5500 terminado, nuevo arrancado
  con el mismo comando `node --experimental-sqlite server.js`), números
  post-deploy comparados 1:1 contra la foto pre-deploy (resumen, deuda
  total de clientes/proveedores, cantidad de ventas/compras) — sin
  diferencias. El endpoint nuevo devolvió, contra la base real, exactamente
  los tres saldos documentados arriba.

### Qué queda pendiente de esta etapa

- **Nada bloqueado.** El alcance acordado (tres tramos de antigüedad desde
  la fecha de la operación, sin vencimiento pactado) se completó entero.
- **Actualización: ya se commiteó** al arrancar la sesión siguiente
  (`a13fbd8`) — ver §3 y §11.
- Aging por **vencimiento pactado** (en vez de fecha de la operación)
  seguiría requiriendo migrar el esquema (agregar una columna de
  vencimiento a `ventas`/`compras`); quedó fuera a propósito, como estaba
  ya anotado en la sección 3 de handoffs anteriores.

## 11. Última etapa: dos bugs de cuenta corriente + reporte "qué se vende"

Con el MVP de `CLAUDE.md` §25 completo y Cuentas corrientes (§10) ya
commiteado, se le preguntó al usuario qué construir a continuación entre
cuatro opciones (reportes de qué-se-vende, reportes de stock, categorías de
producto, auditoría central); eligió **qué se vende y a quién**, la familia
de §20 que faltaba y no requiere migrar el esquema. Explorando el código
con el grafo de `codebase-memory-mcp` antes de construir aparecieron además
**dos bugs reales encadenados** en la cuenta corriente de clientes (código
de la etapa anterior, recién commiteado) — se arreglaron primero, porque
construir el reporte nuevo sin arreglarlos hubiera sido más difícil de
verificar (los invariantes numéricos no habrían cerrado).

### Bug A: editar una venta cambiando de cliente dejaba una deuda fantasma

`PUT /api/ventas/:id` (`backend/server.js`) permite reemplazar el cliente
de una venta ya cargada (el input es texto libre con datalist, sin
bloquear en edición). El código insertaba **un solo** movimiento de
`'ajuste'` en `movimientos_cc_clientes`, por la diferencia de total, contra
el cliente **nuevo** — el cliente **viejo** nunca se tocaba. Si el importe
no cambiaba, el ajuste daba `0`: el cliente viejo se quedaba con la deuda
original para siempre y el nuevo quedaba en `$0` a pesar de ser el dueño
real de la venta.

**Verificado contra la base real que el bug nunca se disparó** (0 ventas ni
compras con movimientos de cuenta corriente de más de una entidad), así
que no hizo falta ningún script de reparación de datos.

**Fix**: se copió el patrón que `PUT /api/compras/:id` ya tenía bien —
revertir el importe viejo completo contra la entidad vieja e insertar el
importe nuevo completo contra la nueva (dos asientos en vez de uno neto).
Cuando el cliente no cambia, el resultado neto es idéntico al de antes
(verificado sin regresión).

### Bug B: el saldo por operación de Cuentas corrientes podía mezclar entidades

`saldosPorOperacion` (la función que arma el detalle de Cuentas corrientes,
§10) agrupaba `GROUP BY venta_id` mientras seleccionaba `cliente_id` como
columna suelta — una *bare column* bajo SQLite, que devuelve el valor de
una fila arbitraria del grupo. Con datos normales no se notaba (todos los
movimientos de una venta eran del mismo cliente), pero **el fix del Bug A
lo hubiera disparado de verdad**: una venta editada con cambio de cliente
pasa a tener movimientos de dos clientes distintos, y esta consulta los
habría sumado y adjudicado al azar a uno de los dos.

**Fix**: `GROUP BY venta_id, cliente_id` (mismo cambio aplicado también al
lado de proveedores, es la misma función parametrizada).

**Verificado juntos, ejecutado de verdad** (no solo lectura de código)
sobre la copia de prueba: se creó una venta, se la editó pasándola de un
cliente a otro sin cambiar el importe, y se confirmó que el cliente viejo
queda en `$0` y el nuevo con el total completo — tanto en `GET
/api/clientes` como en `GET /api/cuentas-corrientes`, coincidiendo exacto
con el invariante ya establecido en §10 (`por_cobrar` = suma de `deuda`
positivas). Se repitió editando también el importe, y por separado editando
**sin** cambiar de cliente, para confirmar que no hay regresión.

### Reporte "qué se vende y a quién"

- **`GET /api/reportes/ventas?desde=&hasta=`** (nuevo, `backend/server.js`,
  sección después de Resumen/evolución) — de solo lectura. Los totales de
  plata (`ventas_netas`, `ganancia_bruta`) se calculan **llamando
  literalmente a `calcularResultado(desde, hasta)`** (la misma función que
  ya usa `/api/resumen`) en vez de reimplementar la resta de devoluciones:
  así el endpoint nuevo cierra exacto contra `/api/resumen` para el mismo
  rango por construcción, no por casualidad — verificado con varios rangos
  (abierto, acotado, sin ventas, y un caso extremo con la fecha manipulada
  a mano para que una devolución cayera sola en el rango sin su venta
  original) y siempre coincidió bit a bit.
- El ranking de productos y el de clientes se calculan aparte
  (`SQL_REPORTE_VENTAS_POR_PRODUCTO`/`POR_CLIENTE` y sus pares de
  devoluciones) y se **netean** con una función genérica
  (`netearPorId`): el costo sale siempre de
  `venta_items.costo_unitario_historico` (nunca del costo actual del
  producto, `CLAUDE.md` §8), y una devolución resta en el período en que
  se hizo, no en el de la venta original — mismo criterio que
  `calcularResultado`. Un producto vendido y devuelto entero en el mismo
  rango neta a su valor de antes de la venta (probado de verdad: no
  encabeza el ranking ni ensucia los totales). Una devolución de una venta
  de un período anterior, si cae dentro del rango consultado, entra al
  reporte con neto negativo (producto/cliente "solo con devolución en este
  rango") en vez de perderse — probado moviendo la fecha de una devolución
  a mano.
- **Frontend**: vista nueva `data-view="reportes-ventas"` ("02 — Qué se
  vende", justo después de Resumen; el resto del nav se renumeró 03→16).
  Reusa el mismo patrón que Resumen (`crearFiltros` con un campo fecha,
  `ledger-strip` con los 4 totales) y Cuentas corrientes (`crearOrden` por
  columna en las dos tablas, nombre de cliente como link a su ficha). No
  hizo falta CSS nueva.
- **Detalle de arquitectura frontend descubierto en esta etapa** (no
  documentado en handoffs anteriores): las vistas de Nexo **no** cargan sus
  datos al entrar por el nav — `mostrarVista()` solo muestra/oculta
  secciones. Todo se carga **una vez, al bootear la página**, con una
  cadena de `Promise.all(...).then(...)` al final de `app.js` (el orden
  importa: Caja antes que Gastos, Resumen al final), y después cada mutación
  relevante refresca a mano los cachés que toca. `cargarReporteVentas()` se
  agregó a esa cadena de arranque (grupo final, junto a Resumen y Cuentas
  corrientes: no depende de ningún caché del frontend) y a los puntos de
  mutación que tocan ventas/devoluciones de venta (crear/editar/anular
  venta, devolución y su anulación, ejecutar el asistente, restaurar desde
  la papelera) — **no** a los de compras/proveedores/gastos, que no afectan
  este reporte.

### Verificación hecha antes de desplegar

- Metodología de siempre: copia aislada al scratchpad, servidor de prueba
  en el puerto 3002, proceso del 3000 (que **no estaba corriendo** al
  empezar esta sesión) sin tocar hasta tener todo verde.
- Backend por `curl`: los dos bugs (arriba), el reporte nuevo cerrando
  exacto contra `/api/resumen` en cuatro escenarios distintos, venta
  devuelta entera, venta vendida a pérdida (margen negativo, `-5,95%` en la
  prueba) — todos con los invariantes numéricos verificados, no solo con
  lectura de código.
- Playwright (dos temas, dos viewports): 7/7 checks — las 16 vistas del nav
  sin caer a placeholder, deep-link `#/reportes-ventas`, orden asc/desc por
  columna, tema oscuro, 375px sin scroll horizontal, sin errores de
  consola. Capturas revisadas a mano en desktop y mobile.
- **Deploy**: backup `nexo.db.backup-antes-reportes-ventas-20260828-170200`
  en `backend/db/`, proceso del 3000 arrancado (no había ninguno corriendo),
  números post-deploy (ventas/compras activas, cantidad de clientes, deuda
  por cobrar/pagar) comparados 1:1 contra una foto tomada del archivo de la
  base **antes** de levantar el proceso — sin diferencias. El endpoint
  nuevo devolvió, contra la base real, `ventas_netas`/`ganancia_bruta`
  coincidiendo exacto con `/api/resumen`.

### Qué queda pendiente de esta etapa

- **Nada bloqueado.** Los dos bugs y el reporte se completaron y
  verificaron enteros.
- Sin commitear todavía — confirmar con el usuario antes de la próxima
  sesión.
- **`GEMINI_API_KEY` sigue sin estar cargada** en el proceso real (arrancado
  en esta sesión sin la variable) — el asistente responde 503, igual que en
  el handoff anterior. Sigue siendo la primera tarea rápida si el usuario
  tiene la key.
- Reportes de **stock** (qué reponer, valorizado, rotación) es la última
  familia de §20 que queda — candidata natural para la próxima etapa.

## 12. Última etapa: reporte de stock (qué reponer, valorizado, rotación)

Con el reporte "qué se vende" (§11) terminado, se le preguntó al usuario
qué construir a continuación; eligió la última familia de reportes de §20
que quedaba: **stock**. Antes de diseñar nada se revisó qué ya existía
(`CLAUDE.md` §24: revisar modelos existentes antes de proponer) y resultó
que **"valorizado" y "qué reponer" ya estaban construidos por producto**
desde etapas anteriores: `decorarProducto` (`backend/server.js`) ya calcula
`valorizado` (`precio_costo * stock`) y `estado_stock`
(`sin_stock`/`bajo`/`normal`/`alto`, con `productos.stock_minimo`/
`stock_maximo`), y `/api/productos` y `/api/stock` ya los devuelven; el
filtro por `estado_stock` en las vistas Productos y Stock ya permite ver
"qué reponer" filtrando. Lo único que no existía en ningún lado era
**rotación** — se le preguntó al usuario la fórmula (dos opciones:
días de inventario vs. índice de rotación) y eligió **días de
inventario**, y que fuera una vista nueva de análisis (no ampliar Stock).

### Qué se construyó

- **`GET /api/reportes/stock?desde=&hasta=`** (nuevo, `backend/server.js`,
  sección después de `/api/reportes/ventas`) — de solo lectura. Reusa
  `SELECT_PRODUCTO`/`decorarProducto` (la misma fuente que `/api/productos`,
  para no duplicar el cálculo de `valorizado`/`estado_stock`) y las mismas
  consultas de ventas/devoluciones por producto que `/api/reportes/ventas`
  (`SQL_REPORTE_VENTAS_POR_PRODUCTO`, `SQL_REPORTE_DEVOLUCIONES_POR_PRODUCTO`,
  `netearPorId` — mismo neteo, mismo criterio: no duplica "cuánto se vendió
  de cada producto en el rango", que ya se había resuelto en §11).
  - **Días de inventario** = `stock / (unidades_netas_del_rango /
    días_del_rango)`: al ritmo de venta del período, cuántos días dura el
    stock actual. Reglas explícitas (decisión de negocio, no arbitrarias):
    con **stock en 0 el resultado siempre es 0 días**, sin importar el
    ritmo (no queda nada, es urgente sea cual sea el consumo); **sin ventas
    netas positivas en el rango queda `null`** (no 0 ni infinito, que
    mentirían para los dos lados) — el frontend lo muestra como "—".
  - El resumen agregado (`resumen`) trae `total_valorizado` (suma sobre
    **todos** los productos, no solo los del rango — el valorizado es
    "ahora mismo", no depende del filtro de fecha) y la cuenta de productos
    por cada `estado_stock`.
  - La tabla de productos se ordena por defecto por días de inventario
    ascendente (lo más urgente primero), con los `null` siempre al final
    — es una lista de prioridad de reposición, no un listado alfabético.
- **Frontend**: vista nueva `data-view="reportes-stock"` ("13 — Reportes de
  stock", entre Stock y Caja — dominio "Stock" del nav, no "Resumen" como
  "Qué se vende": el resto del nav se renumeró 14→17). Mismo patrón que los
  otros dos reportes: `crearFiltros` con un campo fecha (el filtro define
  el ritmo de venta contra el que se mide la rotación, no cambia el stock
  actual, que siempre es "ahora"), `ledger-strip` de resumen, tabla con
  `crearOrden`. Reusa `STOCK_CLASE`/`STOCK_LABEL` que ya existían para el
  badge de estado (mismos colores que Productos y Stock). No hizo falta
  CSS nueva.
- **Enganche de refresco más amplio que los otros dos reportes**: a
  diferencia de "qué se vende" (solo ventas/devoluciones de venta), el
  stock lo mueve *todo* — ventas, compras, devoluciones de los dos lados,
  ajustes manuales, el asistente, restaurar desde la papelera — así que
  `cargarReporteStock()` se agregó en los mismos puntos donde ya se
  refrescaba `cargarStock()` (14 lugares) más uno adicional: el formulario
  de alta/edición de producto (`formProducto`), porque cambiar
  `stock_minimo`/`stock_maximo` recalcula `estado_stock` sin que se mueva
  ninguna unidad de stock.

### Verificación hecha antes de desplegar

- Metodología de siempre: copia aislada al scratchpad (server.js/index.html
  /app.js resincronizados sobre la misma copia que ya se usó en §11),
  servidor de prueba en el puerto 3002.
- Backend por `curl`: coherencia manual del cálculo (verificado a mano con
  los números reales de cada producto en la prueba: stock, unidades
  vendidas y días del rango dan exactamente el `dias_inventario`
  esperado), caso `null` (rango sin ventas), caso `0` días forzando un
  producto a stock 0 con un ajuste manual (confirmado también que
  `resumen.cantidad_sin_stock` sube y `total_valorizado` baja en el mismo
  movimiento).
- Playwright (dos temas, dos viewports): 6/6 checks — las 17 vistas del
  nav sin caer a placeholder, deep-link `#/reportes-stock`, orden
  interactivo por columna, tema oscuro, 375px sin scroll horizontal, sin
  errores de consola. Capturas revisadas a mano en los tres escenarios.
- **Deploy**: backup `nexo.db.backup-antes-reportes-stock-20260828-172546`
  en `backend/db/`, proceso del 3000 reiniciado, números post-deploy
  (ventas/compras activas, deuda por cobrar/pagar, y el `valorizado total`
  calculado con SQL directo contra la base **antes** de levantar el
  proceso) comparados 1:1 contra la foto pre-deploy — sin diferencias.

### Qué queda pendiente de esta etapa

- **Nada bloqueado.** Las cuatro familias de reportes de §20 quedaron
  completas con esta etapa (ver §3).
- Sin commitear todavía, junto con la etapa de §11 (bugs de cuenta
  corriente + "qué se vende") — confirmar con el usuario antes de la
  próxima sesión si conviene un commit o dos.
- `GEMINI_API_KEY` sigue sin cargar en el proceso real — sin cambios
  respecto a §11.
- Con el MVP y las cuatro familias de reportes completos, las opciones
  abiertas que quedan (de §3: notas de débito genéricas, ventas por
  categoría/vendedor —requieren migrar esquema—, aging por vencimiento
  pactado —requiere migrar esquema—, auditoría central unificada, listas
  de precios, multidepósito avanzado, índice sobre `ventas(fecha)`,
  categorías de productos) están todas anotadas en la sección 3 de este
  handoff. Preguntarle al usuario qué sigue, no asumir.

## 13. Última etapa: categorías de productos + ventas por categoría

Con el MVP y las cuatro familias de reportes de §20 completas, se le
preguntó al usuario qué construir a continuación entre cuatro opciones
(categorías de productos, notas de débito/crédito manuales, listas de
precios, auditoría central); eligió **categorías de productos** — la
migración de esquema más chica que quedaba pendiente, y la única que
desbloqueaba algo concreto (ventas por categoría, la última dimensión de
§20 que faltaba).

Dos decisiones tomadas con el usuario antes de construir:
- **Solo categoría, sin subcategoría** por ahora (`CLAUDE.md` §25: estar en
  el documento no significa construirlo ya). Agregar un segundo nivel
  después es aditivo (`ALTER TABLE categorias ADD COLUMN parent_id`), no
  obliga a rehacer nada.
- **El reporte de ventas por categoría entra en la misma etapa** — es la
  razón por la que la migración vale la pena hacerla ahora.

### La migración (lo único que toca el esquema)

Puramente aditiva: **no reescribe ni borra ninguna fila, no reconstruye
ninguna tabla, no cambia ningún `CHECK`** — a diferencia de otras
migraciones del proyecto (ver el comentario sobre `compras`/`estado` en
`db/index.js`), esta no necesitó el procedimiento de copiar-y-renombrar.

- **`backend/db/schema.sql`**: tabla nueva `categorias` (`id`, `nombre`
  UNIQUE, `activa`) — copia deliberada de `categorias_gasto` sin su
  columna `tipo`, que allá existe por una razón contable que acá no aplica.
  `productos` suma `categoria_id INTEGER REFERENCES categorias(id)`.
- **`backend/db/index.js`**: `ALTER TABLE productos ADD COLUMN
  categoria_id` con el mismo patrón idempotente (`PRAGMA table_info` +
  chequeo) que ya usan `stock_minimo`/`stock_maximo`.
- **`categoria_id` es nullable a propósito, no por comodidad**: los
  productos se autocrean por nombre desde una compra
  (`crearCompra`/`confirmarCompra` en `server.js`) sin pasar nunca por el
  formulario, así que un `NOT NULL` habría roto esa alta — **se verificó
  ejecutándolo de verdad** (compra con un producto nuevo por nombre) que
  sigue funcionando y el producto queda con `categoria_id` en `NULL`, el
  estado neutro correcto.
- **Sin categorías de ejemplo sembradas**: mismo criterio ya documentado en
  `db/index.js` para clientes/productos/proveedores — los seeds de ejemplo
  se sacaron a pedido del usuario cuando el proyecto pasó a prueba real.

### Qué se construyó

- **ABM de categorías** (`GET`/`POST`/`PATCH /api/categorias`) — calcado
  del de categorías de gasto: mismas tres validaciones (nombre vacío,
  nombre duplicado, baja lógica vía `activa` en vez de `DELETE`, para no
  dejar productos apuntando a una fila borrada).
- **`SELECT_PRODUCTO`** ahora hace `LEFT JOIN categorias` (el `LEFT` es lo
  que importa: un producto sin categoría sigue apareciendo) y devuelve
  `categoria_id` + `categoria` (el nombre). `validarProducto` valida que,
  si viene un `categoria_id`, exista de verdad — mismo criterio que ya
  usaba `validarGasto` para su propia categoría.
- **`GET /api/reportes/ventas`** suma un array `categorias` más, hermano de
  `productos`. Reusa toda la maquinaria de la etapa anterior sin
  reimplementar nada: dos consultas SQL nuevas agrupando por
  `productos.categoria_id` en vez de por producto, el mismo `netearPorId`
  para restar devoluciones, mismo criterio de costo histórico y de en qué
  período pesa una devolución. **Un producto sin categoría no se pierde**:
  SQLite agrupa todos los `categoria_id NULL` de un `GROUP BY` en un solo
  balde, así que ahí mismo cae el "Sin categoría" sin tener que armarlo a
  mano — se le pone nombre con `COALESCE(categorias.nombre, 'Sin
  categoría')`.
- **Frontend**: botón "Categorías" al lado de "+ Nuevo producto" (mismo
  patrón `.panel-acciones` que ya usa Gastos) que abre un modal calcado del
  de categorías de gasto, sin el campo Tipo. Select de categoría en el
  formulario de producto (opciones en runtime vía `poblarSelectCategorias`,
  mismo criterio que `poblarSelectCuentas`). Columna "Categoría" nueva en
  el listado de Productos, con su propio filtro (`filtros.setOpciones`,
  el método que ya existía justo para esto). Panel nuevo "Ventas por
  categoría" en "Qué se vende", entre "Productos más vendidos" y "Mejores
  clientes", mismas columnas que el ranking de productos.
- **Refresco**: cambiar la categoría de un **producto** también refresca
  "Qué se vende" — el reporte agrupa por la categoría *actual* del
  producto (join en vivo, no una foto histórica por venta), así que
  reasignar categoría cambia cómo se ven ventas ya hechas, y por eso
  también hay que refrescar el reporte en ese momento, no solo al crear o
  renombrar una categoría en sí.

### Verificación hecha antes de desplegar

- Metodología de siempre: copia aislada al scratchpad, servidor de prueba
  en el puerto 3003 (3000 y 3002 estaban ocupados por trabajo anterior de
  la misma sesión).
- **Migración**: diff completo de `PRAGMA table_info` de **todas** las
  tablas, antes vs. después — lo único que cambió fue la tabla `categorias`
  nueva y `productos.categoria_id`, nada más se tocó. Arrancar el server
  dos veces seguidas no rompe nada (idempotencia).
- **El caso que obligaba a nullable, probado de verdad**: compra con un
  producto nuevo por nombre sigue funcionando después de migrar, y el
  producto nuevo queda con `categoria_id: null`.
- **Invariante del reporte**: con productos de dos categorías distintas
  más uno sin categoría, la suma de `categorias[].ventas` (incluido el
  balde "Sin categoría") dio **exactamente** `totales.ventas_netas` en
  todos los casos probados.
- **Casos hostiles, ejecutados de verdad**: nombre de categoría duplicado
  y vacío (rechazados con mensaje claro), `categoria_id` inexistente al
  guardar un producto (rechazado), y **desactivar una categoría con
  productos asignados** — el producto sigue existiendo con su categoría
  intacta y el reporte la sigue sumando sin romperse.
- **Playwright** (dos temas, dos viewports): 7/7 checks — alta de
  categoría y de producto-con-categoría con clicks reales (no solo
  lectura de código), panel "Ventas por categoría" con datos, las 17
  vistas del nav sin caer a placeholder, tema oscuro, 375px sin scroll
  horizontal, sin errores de consola. Capturas revisadas a mano.
- **Deploy**: backup `nexo.db.backup-antes-categorias-20260828-175601` en
  `backend/db/`, proceso del 3000 reiniciado, números post-deploy
  (ventas/compras activas, valorizado total, deuda por cobrar/pagar)
  comparados 1:1 contra la foto pre-deploy — sin diferencias. Los 3
  productos reales quedaron con `categoria_id: null`, sin romper nada.

### Qué queda pendiente de esta etapa

- **Nada bloqueado.** Migración, ABM, listado, filtro y reporte se
  completaron y verificaron enteros.
- Sin commitear todavía — confirmar con el usuario antes de la próxima
  sesión.
- **Subcategorías** — decisión explícita de dejarlas afuera por ahora (ver
  arriba). Marca y unidad de medida (§3/§4 de `CLAUDE.md`) tampoco se
  construyeron: son otras entidades maestras, cada una su propia etapa.
- `GEMINI_API_KEY` sigue sin cargar en el proceso real — sin cambios.

## 14. Última etapa: Auditoría central unificada (CLAUDE.md §22)

Con el MVP y las cuatro familias de reportes completas, y la etapa de
categorías (§13) ya commiteada al arrancar esta sesión, se le preguntó al
usuario qué construir a continuación entre cuatro opciones (auditoría
central, listas de precios, notas de débito/crédito manuales, marca y
unidad de medida); eligió **auditoría central**, lo único de §22 que
seguía sin construirse.

**El problema que resuelve**: la trazabilidad estaba dispersa y parcial.
`movimientos_stock`/`movimientos_tesoreria`/`movimientos_cc_*` son libros
mayores contables (responden "cuánto hay y por qué"), y `asistente_mensajes`
solo cubre lo que entra por la IA. No había ningún lugar que respondiera
"qué hizo el operador y cuándo" — y algunas cosas se perdían para siempre:
cambiar el `precio_costo` de un producto, un ajuste manual de stock (se
guardaba el delta pero no el "de 20 a 15" que pide §22 como ejemplo),
editar un cliente/proveedor/cuenta de tesorería, o si una venta la creó el
formulario o el asistente.

### Decisiones tomadas con el usuario antes de construir

1. **Campo `actor` (`operador`/`asistente`/`sistema`), no `usuario`.** Sin
   sistema de usuarios (decisión ya tomada, un solo operador), inventar un
   "admin" falso hubiera sido peor que no tener el dato. `actor` registra
   *por qué vía* entró la operación en vez de *quién* la hizo — es
   información real, disponible hoy, y hoy se perdía (`crearVenta` no
   sabía si la llamaba el formulario o el asistente). Cuando exista auth
   de verdad, se agrega `usuario_id` al lado (migración aditiva) sin tirar
   `actor`, que sigue respondiendo algo distinto.
2. **Tabla nueva + panel derivado, no una sola cosa.** La tabla `auditoria`
   arranca vacía (no cubre nada de lo ya ocurrido); el panel derivado de
   `movimientos_stock`/`movimientos_tesoreria` sí tiene historia previa.
   Juntos dan cobertura desde el primer día.
3. **Alcance completo**: los 9 puntos que hoy no dejaban rastro en ningún
   lado (Fase A) más los 33 `withTransaction` existentes (Fase B), no solo
   uno de los dos grupos.
4. **Envolver en `withTransaction`** los dos endpoints que hacían un
   `INSERT` suelto (ajuste manual de stock, movimiento manual de caja) —
   necesario para auditarlos de forma atómica.

### La distinción de fondo: bitácora vs. libro mayor

> **`movimientos_*` son libros mayores: "cuánto hay y por qué".**
> **`auditoria` es una bitácora: "qué hizo el operador y cuándo".**

No son la misma información con distinto formato: la granularidad es
distinta a propósito. Una venta de 3 productos escribe **1** fila en
`auditoria` (el acto) y **3** en `movimientos_stock` + 1 en
`movimientos_cc_clientes` (el efecto) — verificado de verdad, no solo
argumentado (ver Verificación). Los movimientos en cascada (la tesorería
que mueve un cobro) no llevan fila propia en `auditoria`: la lleva el
cobro que los generó.

### Qué se construyó

- **`backend/db/schema.sql`, tabla nueva `auditoria`** (al final, después
  de `asistente_mensajes`) — **puramente aditiva**, sin `ALTER TABLE`, sin
  tocar ninguna tabla ni vista existente: no hizo falta migración manual en
  `db/index.js`, mismo caso que `categorias` en §13.
  `id, fecha (datetime, no date — el resto del proyecto usa date, pero un
  log necesita hora), actor, accion, entidad, entidad_id (nullable, SIN FK
  a propósito: es la única columna que apunta a tablas distintas según
  `entidad`), valor_anterior/valor_nuevo (JSON como TEXT, solo los campos
  que cambiaron), operacion_tipo/operacion_id (la "operación relacionada"
  de §22, ej. el cobro #4 apunta a la venta #12), detalle (frase legible
  ya armada en el backend)`. `accion` y `entidad` con CHECK cerrado, mismo
  criterio que `movimientos_stock.origen`. Dos índices
  (`fecha DESC, id DESC` y `entidad, entidad_id`).
- **`backend/db/index.js`, `registrarAuditoria()`** — exportada junto a
  `withTransaction`. Un `INSERT` pelado, **sin `BEGIN`/`COMMIT` propio a
  propósito**: `withTransaction` no es reentrante (abrir una transacción
  dentro de otra ya abierta tira error en SQLite), así que este helper se
  llama SIEMPRE desde adentro de un `withTransaction` en curso, como
  última línea antes del `return`. Al no abrir transacción propia, hereda
  la del llamador: si la operación falla después, el `ROLLBACK` se lleva
  la fila de auditoría con todo lo demás (§23) — **probado de verdad, no
  solo por lectura de código** (ver Verificación). Se descartó envolver
  `withTransaction` con un wrapper automático: no funciona, porque de los
  33 call sites la mitad no devuelve nada y el id de un alta recién existe
  después de correr la función — el wrapper no podría saber qué entidad ni
  qué id auditar.
- **`backend/server.js`, ~42 puntos de inserción**:
  - **Fase A** (9 puntos, lo que hoy no dejaba rastro en ningún lado):
    editar producto (`precio_costo` queda fuera del diff a propósito: lo
    recalculan las compras, auditarlo ahí duplicaría el acto de la
    compra), ajuste manual de stock (el ejemplo literal de §22, "de 20 a
    15" — ahora envuelto en `withTransaction`), movimiento manual de
    tesorería (ídem), editar cliente/proveedor/cuenta de tesorería,
    cambiar estado de presupuesto, cambiar estado de envío de compra, baja
    de categoría/categoría de gasto. Se agregó un helper genérico
    `diffCampos(anterior, nuevo, campos)` (junto a los otros helpers de
    negocio, antes de la sección Clientes) que compara solo los campos
    pedidos y devuelve `null` si no cambió nada — así un `PATCH` que no
    modifica nada no genera ruido en el log.
  - **Fase B** (los 33 `withTransaction` existentes): una fila por acto en
    ventas (crear/editar/anular/restaurar/cobrar/facturar), compras
    (crear/editar/confirmar/anular/restaurar/pagar), devoluciones de los
    dos lados (crear/anular/restaurar/nota de crédito), presupuestos
    (crear/editar/convertir), gastos (crear/editar/anular/restaurar),
    transferencia entre cuentas, factura suelta, y el asistente (los tres
    tipos, con `actor: 'asistente'` + `operacion_tipo: 'asistente_mensaje'`
    + `operacion_id` apuntando al mensaje — cierra el paso 9 del flujo de
    §21). **Regla seguida en todo el archivo: se audita en el llamador,
    no adentro de las funciones extraídas** (`crearVenta`, `registrarCobro`,
    `crearCompra`, `crearGasto`) — esas las llaman varios sitios distintos
    (formulario, conversión de presupuesto, asistente) y cada uno necesita
    su propio `actor`/`detalle`.
  - **`GET /api/auditoria?limit=`** (sección nueva, al final, después del
    asistente) — solo lectura, **sin POST** a propósito: la auditoría se
    escribe únicamente desde adentro de las transacciones, exponer un POST
    sería una puerta para falsificarla. Mismo patrón que
    `/api/movimientos-stock` (reusa `TOPE_MOVIMIENTOS`).
- **Frontend**: vista nueva `data-view="auditoria"` (nav "18 — Auditoría",
  al final, después de Papelera — es una vista de revisión, no de
  operación diaria, no renumera nada). Dos paneles:
  1. **"Registro de actividad"** — la tabla `auditoria`, con filtros
     (`crearFiltros`, calcado de `filtrosStockMov`) y orden por columna.
     `valor_anterior`/`valor_nuevo` se muestran como "campo: antes → después"
     dentro de Detalle (parseo en `try/catch`, nunca JSON crudo).
  2. **"Movimientos contables"** — panel derivado, **sin tabla ni endpoint
     propio** (mismo espíritu que Papelera), uniendo `movimientosStockCache`
     y `movimientosCajaCache` (los cachés que ya pueblan Stock y Caja al
     bootear) — da contenido con historia previa desde el primer día. Si
     esos módulos no cargaron todavía en la sesión, se piden aparte.
  - **Excepción deliberada al patrón "todo se carga al bootear"**: como
    *cualquier* mutación del sistema audita (~42 puntos), enganchar
    `cargarAuditoria()` a cada una ensuciaría demasiado. En su lugar se
    carga **al entrar a la vista** (un solo `if` dentro de `mostrarVista`,
    cubre nav click, deep-link F5 y el botón Atrás/Adelante porque los tres
    pasan por ahí) más un botón "Actualizar" en el panel para lo que
    cambió mientras la vista ya estaba abierta. Es la única vista con esta
    excepción — anotado acá para que no se lea como un olvido en el futuro.

### Verificación hecha antes de desplegar

- Metodología de siempre: copia aislada al scratchpad (con una copia de
  `nexo.db` **real**, no vacía, para probar la migración contra datos
  reales), servidor de prueba en el puerto 3002 (el proceso del 3000 **no
  estaba corriendo** al empezar esta sesión, así que no hubo conflicto).
- **Migración**: `PRAGMA table_info` de las 26 tablas, antes vs. después —
  la única diferencia fue la tabla `auditoria` nueva, nada más se tocó.
- **Anti-duplicación, probada de verdad**: una venta de 2 productos generó
  exactamente **1** fila en `/api/auditoria` y **2** en
  `/api/movimientos-stock`.
- **`valor_anterior`/`valor_nuevo`**: editar `precio_venta` de un producto
  dejó `{"precio_venta":60000}` → `{"precio_venta":65000}`; repetir la
  misma edición sin cambios reales no generó ninguna fila nueva.
- **Ajuste de stock**: el caso literal de §22, verificado con datos reales
  — "Ajuste de stock de 'Khamrah': 1 → 0".
- **Rollback, forzado de verdad (no solo lectura de código)**: facturar dos
  veces la misma venta — la primera vez generó su fila de auditoría
  normalmente, la segunda disparó la violación de `idx_facturas_venta_id`
  (409) y el conteo de `auditoria` quedó **exactamente igual** al de antes
  del segundo intento. Sin errores de transacción anidada en el log del
  servidor.
- **`actor: 'asistente'`**, con `NEXO_INTERPRETE=stub`: un gasto y una
  venta+cobro ejecutados vía `/api/asistente/ejecutar` quedaron con
  `actor: "asistente"` y `operacion_id` apuntando al `asistente_mensajes.id`
  correcto; la venta+cobro generó sus **2** filas (una por cada acto) en
  la misma transacción.
- **Casos hostiles, ejecutados de verdad con SQL directo**: `entidad`
  inválida rechazada por el CHECK; `entidad_id` apuntando a una fila
  inexistente aceptado (sin FK, es intencional) y el frontend lo mostró
  sin romperse; JSON con comillas/acentos/€ insertado y renderizado bien;
  `entidad_id NULL` mostrado como "—". Filas de prueba borradas después.
- **Dos bugs cosméticos encontrados y corregidos en esta misma etapa** (no
  en el diseño, en la primera pasada de implementación): el importe de
  stock en "Movimientos contables" usaba `money()` en vez de `numero()`
  (mostraba "$ 1,00" para una cantidad de una unidad); el label "Cambió
  estado" partía en dos líneas dentro del badge `.status` (que no tiene
  `white-space: nowrap`, mismo comportamiento que el resto de los badges
  de la app) — se acortó a "Actualizó".
- **Playwright** (dos temas, dos viewports): **35/35 checks** — las 18
  vistas del nav sin caer a placeholder, deep-link `#/auditoria`, orden
  por columna, botón "Actualizar", **crear una venta con clicks reales
  desde el formulario y verificar que aparece en Auditoría** (no solo
  lectura de código), tema oscuro, 375px sin scroll horizontal, sin
  errores de consola en ningún escenario. Capturas revisadas a mano en
  claro y oscuro.
- **Deploy**: backup `nexo.db.backup-antes-auditoria-20260829-110343` en
  `backend/db/`, foto pre-deploy tomada con SQL directo contra el archivo
  de la base **antes** de levantar el proceso (ventas activas, deuda por
  cobrar/pagar, valorizado total, conteo de clientes/proveedores/productos),
  proceso del 3000 arrancado (no había ninguno corriendo), foto post-deploy
  comparada 1:1 — **la única diferencia fue la tabla `auditoria` nueva**,
  ningún número de negocio cambió. Verificado también con Playwright de
  solo lectura contra el proceso real: la vista carga, los dos paneles
  están, el registro arranca vacío como se diseñó, el panel de movimientos
  ya tiene historia previa, sin errores de consola.

### Qué queda pendiente de esta etapa

- **Nada bloqueado.** Migración, helper, los ~42 puntos de las dos fases,
  el endpoint y la vista se completaron y verificaron enteros.
- Commiteada en `Tosi` (`156e919`, "feat: auditoría central unificada
  (CLAUDE.md §22)") al arrancar la sesión siguiente, antes de empezar la
  Etapa A de §15 — ver ahí el motivo (dejar el trabajo a salvo antes de
  ramificar).
- `GEMINI_API_KEY` sigue sin cargar en el proceso real — sin cambios.
- El panel "Movimientos contables" solo une stock y tesorería (los dos
  cachés ya disponibles en memoria al bootear) — cuentas corrientes de
  clientes/proveedores no tienen un caché de movimientos crudos en el
  frontend (solo el reporte agregado de Cuentas corrientes), así que
  quedaron fuera del panel derivado. Si en el futuro hace falta sumarlos,
  es agregar un fetch a `movimientos_cc_clientes`/`_proveedores` (no
  expuestos hoy como endpoint propio) y unirlos al mismo array.

## 15. Última etapa: fusión de "Qué se vende" en Resumen (Etapa A de
    `usuarios-login-roles`)

Primera de dos etapas de un plan más grande (usuarios/login/roles, ver
`.claude/plans/usar-mcp-codebase-memory-calm-pony.md` si sigue disponible
en el entorno de la sesión). El usuario pidió que "Qué se vende" dejara de
ser una vista aparte del nav y pasara a vivir dentro de Resumen, como un
panel de estadísticas del negocio. Se hizo deliberadamente **antes** que
la etapa de usuarios porque es chica, autocontenida, no toca backend, y
así el nav queda numerado 01..17 antes de que Usuarios agregue el ítem 18
(sin tener que renumerar dos veces).

**Rama:** `feature/fusion-resumen`, partiendo del commit de auditoría
(`156e919`) en `Tosi`. Pendiente de PR hacia `main` (o hacia `Tosi`, a
confirmar con el usuario el destino real del merge, dado que `main` está
varios commits atrás de `Tosi` en este repo).

### Qué se hizo

- **`frontend/index.html`**: el bloque de la vista `data-view="reportes-ventas"`
  (ledger-strip de 4 totales + paneles "Productos más vendidos" / "Ventas
  por categoría" / "Mejores clientes") se movió al final de
  `data-view="dashboard"`, con un `<h2>Qué se vende</h2>` separándolo
  visualmente de la primera mitad (resultado del negocio). La sección
  `reportes-ventas` (ahora vacía) y su nav item se borraron. El nav se
  renumeró de 01..18 a 01..17 en las 17 entradas restantes (texto literal
  en `<span class="nav-index">`, no un contador CSS).
- Los ids `reporteProductosBody` / `reporteCategoriasBody` /
  `reporteClientesBody` **no se tocaron**: son la clave de `localStorage`
  que recuerda el orden de columna elegido por el usuario
  (`nexo.orden.${idBody}`), y renombrarlos lo habría perdido. Se verificó
  con Playwright que el orden sobrevive a un F5.
- **`frontend/js/app.js`**: se borraron `filtrosReporteVentas` (el segundo
  filtro de fecha, redundante) y `rangoActualReporteVentas()` (idéntica a
  `rangoActualResumen()`). `cargarReporteVentas()` ahora usa
  `rangoActualResumen()` y ya no escribe una nota de rango propia (la
  nota de `#resumenRangoNota`, escrita por `cargarResumen()`, cubre las
  dos mitades).
- **`cargarPanelResumen()`** (función nueva): hace
  `Promise.all([cargarResumen(), cargarReporteVentas()])` y es ahora el
  único callback de `filtrosResumen`. **Los 21 call sites** que antes
  llamaban a `cargarResumen()` y/o `cargarReporteVentas()` por separado se
  reemplazaron por esta única función — incluidos los 13 sitios que antes
  llamaban solo una de las dos (p. ej. anular un gasto solo refrescaba
  `cargarResumen()`, dejando "Qué se vende" desactualizado hasta el
  próximo F5). Se confirmó con el usuario antes de tocar esos 13: la
  lectura literal del plan es unificarlos todos, a costa de un fetch extra
  por mutación, para que no quede ninguna mitad de Resumen desactualizada.
  Los 3 `crearOrden(...)` de las tablas de reportes se dejaron llamando
  solo a `cargarReporteVentas()` (reordenar una columna no cambia el rango
  de fechas, no hace falta recargar el resultado).
- **`VISTAS_CONSTRUIDAS`**: se borró la entrada `"reportes-ventas"`.
- **`VISTAS_RENOMBRADAS`** (mapa nuevo): `{ "reportes-ventas": "dashboard" }`,
  resuelto dentro de `vistaDesdeHash()` antes de buscar en
  `VISTAS_CONSTRUIDAS`. Un bookmark o link viejo a `#/reportes-ventas`
  abre Resumen en vez de quedar muerto (el hash de la URL no se reescribe
  en ese caso — es cosmético, la vista mostrada sí es la correcta).
- **Backend: cero cambios**, tal como preveía el plan. `/api/reportes/ventas`
  y `/api/resumen` ya existían sin tocar.

### Cómo se verificó

Sin servidor de prueba en 3002 con una copia del proyecto en el scratchpad
(incluida la base real, por ser una copia aislada) + Playwright instalado
puntualmente en un entorno npm aparte (no quedó como dependencia del
proyecto). Verificado:
- Nav con exactamente 17 `nav-index`, sin saltos ni duplicados.
- El `<h2>Qué se vende</h2>` aparece dentro de `[data-view="dashboard"]`,
  separando las dos mitades.
- **`#sumVentas` === `#reporteVentasNetas`** y
  **`#sumGananciaBruta` === `#reporteGananciaBruta`**, antes y después de
  cambiar el filtro de fecha (de "hoy" a "últimos 30 días") — el check
  central que prueba que la fusión comparte un solo rango.
- El orden de columna guardado en "Productos más vendidos" sobrevive a un
  F5.
- El deep-link viejo `#/reportes-ventas` abre Resumen (título "Resumen",
  `dashboard` visible).
- Un 404 de un ícono de logo (`/assets/logo/...`) apareció en consola
  durante la prueba, pero es preexistente y no relacionado — no se tocó.
- **No verificado por Playwright en esta sesión**: crear una venta con
  clicks reales de punta a punta (el combobox de cliente usa una
  estructura con varios `<input>` superpuestos entre modales que
  complicó el selector automático dentro del tiempo de la sesión). La
  actualización tras mutación sí quedó cubierta indirectamente: los 21
  call sites unificados a `cargarPanelResumen()` son el mismo código que
  ya se ejercitó al cambiar el filtro de fecha.

### Qué queda pendiente

- **Etapa B (usuarios, login y roles)** — ver el plan original. Es la
  etapa que motivó hacer esta fusión primero (para que el nav quede
  01..17 antes de que Usuarios agregue el 18).
- Playwright quedó instalado solo en un entorno npm temporal del
  scratchpad de la sesión, no como dependencia del proyecto ni en
  `node_modules` de `backend/` — si una sesión futura quiere reusar la
  misma verificación automatizada, hay que reinstalarlo (o formalizarlo
  como dependencia si el equipo decide adoptar Playwright de verdad).
- PR de `feature/fusion-resumen` sin abrir todavía — falta decidir con el
  usuario la rama destino (`main` vs. `Tosi`) antes de abrirlo.

## 16. Última etapa: Usuarios, login y roles (Etapa B de
    `usuarios-login-roles`)

Segunda y última etapa del plan de dos partes (Etapa A = fusión de "Qué se
vende", §15). Nexo pasó de "un solo operador sin identidad" a tener login,
un admin y empleados. **Es el cambio más grande hecho en una sola etapa
hasta ahora**: toca esquema, ~50 puntos de `server.js`, y el boot completo
del frontend.

**Rama:** `feature/usuarios-login-roles`, partiendo de
`feature/fusion-resumen` (que sigue sin PR abierto — ver §15). Sin PR
propio todavía: falta decidir con el usuario la rama destino de las dos
etapas juntas.

### Decisiones tomadas con el usuario antes de construir

Heredadas del plan original (`.claude/plans/usar-mcp-codebase-memory-calm-pony.md`,
que sigue disponible como referencia de diseño completa — este handoff no
lo duplica, solo cuenta qué se construyó y qué cambió respecto de lo
planeado):

1. Roles `admin`/`empleado`. Admin ve todo y gestiona usuarios; empleado
   opera pero no ve Usuarios. **Auditoría es visible para los dos roles**
   (es consulta, no configuración). Sin registro público: el admin da de
   alta a los empleados.
2. La auditoría suma `usuario_id` (columna nueva) sin sacar `actor`: son
   dos preguntas distintas (`actor` = por qué vía entró la operación,
   `usuario_id` = quién la hizo). El asistente sigue quedando con
   `actor: 'asistente'` **y además** `usuario_id` del usuario que
   confirmó — es la razón concreta de tener las dos columnas.
3. Login con usuario corto, no email (no hay recuperación por mail).
4. **Multi-negocio: preparar el camino, no construirlo.** Tabla
   `organizaciones` con UNA fila y `usuarios.organizacion_id`, pero las
   ~30 tablas de datos del sistema no se tocaron.
5. Pantalla de "primer uso" para crear el primer admin. Nunca existe una
   contraseña por defecto.
6. Tabla de sesiones (no JWT): dar de baja a un empleado o resetearle la
   contraseña lo saca del sistema en el próximo request, no cuando
   expire un token por su cuenta.

### Correcciones al diseño original, encontradas mirando el código real
antes de construir (documentadas también en el plan de ejecución de esta
sesión, `seguir-con-la-siguiente-gleaming-moonbeam.md`, que sigue
disponible como historial completo de la verificación):

- **"Configuración" no era una vista del nav** como asumía el diseño
  original: es un modal (`#modalConfiguracion`) que antes abrían **dos**
  botones (`#btnConfiguracion` y `#btnPerfil`) con el mismo handler.
  Resuelto así: `#btnPerfil` pasó a abrir `#modalPerfil` (nombre, rol,
  cambiar contraseña, cerrar sesión), visible para los **dos** roles —
  un empleado también necesita cerrar sesión. `#btnConfiguracion` sigue
  abriendo el modal vacío, **sin gating por rol**: ocultar un modal sin
  contenido no protege nada: la regla "el empleado no ve administración"
  se cumple ocultando la vista Usuarios, no este botón.
- El rebuild de `auditoria` (necesario para agregar `'usuario'` a su
  CHECK — SQLite no permite `ALTER` sobre un CHECK) se llevaba sus dos
  índices propios (`idx_auditoria_fecha`, `idx_auditoria_entidad`) con el
  `DROP TABLE`, y como `schema.sql` corre **antes** del bloque de
  migraciones en `db/index.js`, nada los recreaba — quedarían perdidos en
  silencio. Los 5 rebuilds anteriores del archivo no enseñaban a evitar
  esto porque ninguna de esas tablas tenía índices propios. Se recrean a
  mano dentro de la misma transacción del rebuild.
- `scryptSync` con los parámetros elegidos (`N=16384,r=8,p=1`) mide
  ~15-16 MB reales, por debajo del límite default de Node (32 MB) —
  funciona igual sin pasar `maxmem` explícito. Se pasa igual por
  claridad/a prueba de futuro, pero deja de ser el riesgo principal de la
  etapa que el diseño original suponía.

### Qué se construyó

**Esquema** (`backend/db/schema.sql`) — tres tablas nuevas, aditivas:
`organizaciones` (una fila), `usuarios` (con `usuario`/`nombre`
separados, `password_hash`/`password_salt` en columnas propias porque el
proyecto no tiene parser de formato PHC, `activo` como baja lógica,
`debe_cambiar_password`), `sesiones` (token como PK, `expira`). Índice
`UNIQUE` sobre `LOWER(usuario)` (SQLite compara case-sensitive por
default). `'usuario'` sumado al CHECK de `auditoria.entidad`.

**Migración** (`backend/db/index.js`) — reconstrucción de `auditoria` con
el patrón copiar-renombrar ya establecido (agrega `usuario_id`, recrea
sus 2 índices — ver corrección arriba), seed de la organización única
(mismo criterio que `cuentas_tesoreria`: no es dato de ejemplo, es
infraestructura), limpieza de sesiones vencidas al bootear (sin cron:
corre en cada arranque, alcanza), `registrarAuditoria` suma
`usuario_id = null` con default (ningún call site viejo rompe).

**Backend** (`backend/server.js`) — sección nueva `Usuarios, sesión y
roles` justo después del mount de `/assets`:
- Hash con `scryptSync` (`node:crypto`, sin dependencias nuevas),
  `timingSafeEqual` para comparar, `.normalize('NFKC')` en alta y login
  (acentos en NFC vs NFD según el teclado), hash dummy calculado una vez
  al bootear (para que el tiempo de respuesta no revele qué usuarios
  existen — verificado con un test de timing real, ver Verificación).
- Cookie de sesión httpOnly (`sameSite: 'lax'`, `secure` solo en
  producción — en `localhost` tiene que ser `false`), parseada a mano con
  `leerCookie()` (4 líneas, sin instalar `cookie-parser`).
- **`auditar(req, datos)`** — wrapper de `registrarAuditoria` que agrega
  automáticamente `usuario_id: req.usuario?.id ?? null`. Explícito, no
  AsyncLocalStorage (verificado que los 44 call sites tienen `req` en
  scope, ninguno dentro de las funciones extraídas que no auditan
  internamente). **Reemplazo mecánico de los 44 `registrarAuditoria({` a
  `auditar(req, {`**, verificado por conteo exacto (`grep -c`) antes y
  después, y `node --check` para confirmar que no rompió sintaxis.
- `autenticar` (401 JSON) y `soloAdmin` (403) como middlewares. Rate
  limit del login en un `Map` en memoria (5 fallidos / 15 min) — no es
  defensa seria, evita que un script bloquee el event loop con
  `scryptSync` a repetición.
- **`app.use('/api', autenticar)`** — un solo montaje después de los 3
  endpoints públicos (`estado`/`login`/`bootstrap`) cubre los 82
  endpoints de negocio. Lo estático (`frontend/`, `/assets`) queda
  público a propósito: no tiene datos del negocio.
- Endpoints nuevos: `GET /api/auth/estado`, `POST /api/auth/login`,
  `POST /api/auth/bootstrap` (revalida en el servidor que no haya
  usuarios, 409 si los hay), `POST /api/auth/logout`,
  `POST /api/auth/cambiar-password` (borra las demás sesiones del
  usuario, conserva la actual), y bajo `soloAdmin`:
  `GET/POST /api/usuarios`, `PATCH /api/usuarios/:id` (con salvaguardas:
  no se puede dar de baja ni degradar al último admin activo, ni uno
  darse de baja a sí mismo — dar de baja borra sus sesiones, lo echa en
  el acto), `POST /api/usuarios/:id/resetear-password` (ídem, fuerza
  `debe_cambiar_password`). **La contraseña nunca entra en la
  auditoría.**
- `GET /api/auditoria` suma `usuario_id` y `usuarios.nombre AS
  usuario_nombre` con `LEFT JOIN` (obligatorio: con INNER las filas
  históricas con `usuario_id NULL` desaparecerían), columnas calificadas
  con `auditoria.` (las dos tablas comparten `id`).

**Frontend, el gate** (`frontend/js/sesion.js`, archivo nuevo) — `app.js`
no tiene `init()` ni guarda de sesión propia (toca el DOM desde su
primera línea), así que en vez de reescribirlo se sacó
`<script src="js/app.js">` de `index.html` y lo reemplazó
`<script src="js/sesion.js">`, que **inyecta `app.js` recién cuando
`GET /api/auth/estado` confirma sesión válida** — es imposible que
dispare un fetch sin sesión. Intercepta `window.fetch` (instalado ANTES
de inyectar `app.js`, si no los fetches del boot quedarían sin cubrir):
ante un 401 (fuera de `/api/auth/*`) muestra el login; el 403 no se
intercepta, es específico de cada call site. Pre-paint cosmético en
`index.html` (`data-sesion="cerrada"`) para evitar el flash antes de la
respuesta real del servidor. Pantalla `.sesion-pantalla` con tres
formularios hermanos (login/bootstrap/cambio forzado), **no reusa
`.modal`** (traería Escape-cierra y click-afuera-cierra, y el observer de
accesibilidad de modales se instala al cargar `app.js`, que ahora carga
después). Cerrar sesión hace `location.reload()` en vez de intentar
desmontar `app.js` a mano (evita duplicar sus ~90 listeners si alguien
inicia sesión de nuevo sin recargar).

**Frontend, UI de usuarios** (`index.html` + `app.js`) — nav 18
"Usuarios" (oculto por CSS con `data-rol`, el servidor igual responde
403), vista con ABM calcado del de Cuentas de tesorería (mismo patrón:
listeners atados después del `innerHTML`, no delegación). `#modalPerfil`
nuevo (nombre, rol, cambiar mi contraseña, cerrar sesión) reemplaza el
uso que `#btnPerfil` le daba a `#modalConfiguracion`. Columna Usuario en
Auditoría (`usuario_nombre ?? "—"` para las filas históricas), colspan de
sus `filaVacia`/`filaVaciaFiltrada` actualizado de 6 a 7. Guarda de rol en
`mostrarVista`: un deep-link `#/usuarios` tecleado por un empleado cae a
dashboard.

### Bug real encontrado y corregido durante la verificación

**`.form[hidden]` no colapsaba** — `.form { display: flex }` (regla
existente, usada en todos los modales) le gana en especificidad al
`[hidden]` nativo del navegador, mismo problema que el proyecto ya había
documentado para `.form label[hidden]` en una etapa anterior, pero nadie
lo había cubierto para el propio `.form`. No importaba mientras cada
`.form` vivía solo en su modal — pero `.sesion-pantalla` pone tres
formularios hermanos alternados con `hidden`, y sin la regla los dos
ocultos seguían ocupando espacio en el flex de `.sesion-card`,
estirándola a 1041px de alto en un viewport de 720px (el botón de submit
quedaba fuera de la pantalla). Se reprodujo con Playwright real
(`getBoundingClientRect`, no solo lectura de código) antes de escribir el
fix: `card.height` bajó de 1041px a 422px al agregar `.form[hidden] {
display: none }` junto a la regla `.form` en `styles.css`.

### Verificación hecha antes de desplegar

Metodología de siempre, escalada por el tamaño de la etapa: copia aislada
al scratchpad con la base real, servidor de prueba en el **3002**, y un
**3003 con base vacía** para probar el bootstrap sin contaminar la copia
con datos. Playwright instalado puntualmente en un entorno npm aparte del
scratchpad (mismo criterio que la etapa de fusión, §15 — Chromium ya
estaba cacheado localmente, solo hizo falta bajar la build exacta que la
versión de `playwright` instalada esperaba).

- **Migración**: 27→30 tablas (`organizaciones`/`usuarios`/`sesiones`
  nuevas), `auditoria` con `usuario_id` y sus 2 índices intactos
  (`PRAGMA index_list`), `PRAGMA foreign_key_check` vacío, arrancar dos
  veces sin re-entrar al rebuild, datos de negocio preexistentes
  (9 ventas, 4 clientes en la copia de prueba) sin tocar.
- **Los 44 call sites**: verificado por conteo exacto en cada momento del
  proceso — al terminar el reemplazo mecánico, `grep -c
  "registrarAuditoria({"` daba 2 (la definición de `auditar` + el
  bootstrap, que audita con `usuario_id` explícito porque no hay sesión
  previa) y `grep -c "auditar(req, {"` daba exactamente 44. **Un primer
  intento del reemplazo automático rompió `auditar` con recursión
  infinita** (el `gsub` se aplicó también sobre su propio cuerpo, línea
  158) — detectado antes de aplicar el archivo, con `node --check` y una
  relectura manual del resultado, corregido excluyendo esa línea
  explícitamente del reemplazo.
- **Login**: contraseña mala y usuario inexistente dan el mismo mensaje;
  case-insensitive (`ADMIN` = `admin`); rate limit exacto al 6º intento
  fallido (`HTTP 429`); **test de timing real** (20 intentos contra
  usuario inexistente vs. 4 contra uno real con contraseña mala, mismo
  orden de magnitud — ~85ms vs ~80ms, valida el hash dummy).
- **`app.use('/api', autenticar)`**: 401 sin cookie / cookie inventada /
  cookie vencida (forzada por SQL) / cookie de usuario dado de baja,
  sobre 5 secciones distintas (`clientes`, `ventas`, `tesoreria`,
  `resumen`, `auditoria`). `POST /api/usuarios` con cookie de empleado →
  403 y `COUNT(*)` sin cambios. Logout → la misma cookie da 401 después.
- **La prueba central**: dos usuarios reales (admin id=1, empleado id=4)
  cada uno crea un gasto → cada fila de auditoría con su `usuario_id`
  correcto. **Concurrencia real** con `Promise.all` de dos requests
  simultáneos a `/api/asistente/ejecutar` (uno por usuario, con
  `NEXO_INTERPRETE=stub`) → cada fila de auditoría con su usuario sin
  cruzarse — la prueba que fallaría con una variable de módulo en vez de
  leer `req.usuario`.
- **Cobertura de los 44**: mutación de 6 tipos distintos (producto,
  cliente, stock, tesorería, presupuesto, gasto) → `SUM(usuario_id IS
  NULL) = 0` en las filas nuevas. (Nota: alta de proveedor/categoría no
  generan fila de auditoría — comportamiento **preexistente** de la
  etapa anterior, no introducido acá; solo su edición audita.)
- **Rollback**: facturar dos veces la misma venta → segunda da 409,
  `COUNT(*)` de auditoría sin cambios en ninguno de los dos intentos.
  (De paso, se encontró que el endpoint de facturar exige `condicion` ∈
  `efectivo/transferencia/mercadopago` — detalle preexistente sin
  documentar, no un bug de esta etapa, solo hizo falta para armar el
  payload de prueba correcto.)
- **Playwright, dos temas × 1280/375**: nav 18 sin saltos; sin sesión
  entra a `/` y **solo llama a `/api/auth/estado`** (interceptando
  `page.on('request')`, prueba de que `app.js` no se cargó); login exitoso
  arranca la app; F5 con sesión entra sin flash de login; **bootstrap con
  base vacía** en el 3003 crea el admin y loguea de una; **sesión
  vencida a mitad de uso** (forzada por SQL) + entrar a una vista con
  fetch fresco (Auditoría — un simple click de nav a una vista ya
  cacheada en memoria, como Clientes, no dispara ningún request nuevo, así
  que no sirve para este caso) → reaparece el login sin pantalla rota;
  **rol empleado**: nav Usuarios oculto, Auditoría visible, `#/usuarios`
  a mano cae a dashboard; **ABM completo** de usuarios con clicks reales
  (alta, ver fila nueva); **baja echa al usuario en el acto**, probado
  con **dos navegadores reales** (contextos de Playwright separados, no
  simulado); menú de perfil con nombre/rol correctos; 375px sin scroll
  horizontal; sin errores de consola en ningún escenario.
- **Deploy real**: backup `nexo.db.backup-antes-usuarios-20260829-162204`
  en `backend/db/`. Foto pre-deploy con SQL directo contra el archivo real
  **antes** de levantar el proceso (6 ventas activas, 4 clientes, 3
  productos, 2 proveedores, 3 compras activas, 0 filas de auditoría).
  Proceso del 3000 arrancado (no había ninguno corriendo al empezar esta
  sesión) — migración corrida contra la base real, foto post-deploy
  comparada 1:1: **la única diferencia fueron las 3 tablas nuevas**,
  ningún número de negocio cambió. **Primer admin creado con el usuario
  presente** (usuario `Solla_FAT`, nombre Santino Gonzalo Solla) vía
  `POST /api/auth/bootstrap` contra el proceso real — confirmado con
  `GET /api/auth/estado` (`requiere_bootstrap: false`) y la fila de
  auditoría correspondiente (`accion: crear, entidad: usuario,
  usuario_id: 1`).

### Qué queda pendiente de esta etapa

- **Nada bloqueado.** Las 9 partes del plan (esquema, migración, helpers
  de auth, los 44 call sites, endpoints, middleware, gate del frontend,
  UI de usuarios, deploy) se completaron y verificaron enteras, incluido
  el deploy real con el primer admin ya creado.
- **El sistema ya exige login** para entrar a `http://localhost:3000` —
  la próxima sesión (o cualquiera que abra el navegador) va a ver la
  pantalla de login, no el dashboard directo. Usuario admin:
  `Solla_FAT` (la contraseña la eligió el usuario, no queda escrita acá).
- `GEMINI_API_KEY` sigue sin cargar en el proceso real — sin cambios
  respecto a etapas anteriores (ver §3/§4).
- Sin commitear todavía — confirmar con el usuario antes de la próxima
  sesión. Con esto se acumulan **dos etapas sin commit** en la rama
  actual (`feature/usuarios-login-roles`, que ya incluye el trabajo de
  fusión de `feature/fusion-resumen` por venir de ahí): conviene
  commitear pronto para no perder el hilo.
- **Fuera de alcance a propósito** (documentado también en el código):
  recuperación de contraseña por email (no hay SMTP), 2FA, permisos
  granulares por módulo, aislamiento multi-organización real (solo se
  preparó la tabla), registro público, backfill de `usuario_id` en las
  filas de auditoría anteriores a esta etapa (inventarles un usuario
  sería falsificar el registro), `usuario_id` en `ventas`/`compras`/
  `gastos` (el "vendedor" de `CLAUDE.md` §8 — otra etapa, distinta de
  quién auditó el acto), HTTPS real.
- **Deuda técnica anotada, no resuelta esta etapa**: el proyecto no activa
  `PRAGMA foreign_keys` en ningún punto del arranque normal (solo
  alrededor de los rebuilds de esquema) — las FK de
  `usuarios.organizacion_id` y `sesiones.usuario_id` son documentación,
  no una garantía real de integridad referencial. Las salvaguardas de
  negocio (no dar de baja al último admin, etc.) están en el código de
  todas formas, así que no es un riesgo inmediato, pero conviene saberlo
  antes de asumir que una FK del esquema protege algo en runtime.
- Playwright, igual que en la etapa de fusión (§15), quedó instalado solo
  en un entorno npm temporal del scratchpad — no como dependencia del
  proyecto.

## 17. Última etapa: refresh visual — paleta negro/blanco puro + fixes de accesibilidad/superposición

**El pedido**: mejorar paleta, tipografía, y que no se superpongan
botones/funciones en el frontend. Se instaló primero el plugin de Claude
Code `ui-ux-pro-max` (marketplace `nextlevelbuilder/ui-ux-pro-max-skill`)
para apoyar el trabajo — quedó instalado globalmente, disponible para
sesiones futuras.

**Nota de proceso importante para la próxima sesión**: esta etapa arrancó
por error sobre la rama `solla` (que en ese momento estaba 5 commits
atrás de `main` — le faltaban exactamente las etapas de §15 y §16 de
arriba), y el usuario notó la funcionalidad "desaparecida" al probarlo.
A partir de eso, **decisión del usuario: de acá en adelante todo el
trabajo se hace directamente sobre `main`**, sin ramas personales por
integrante (`solla`/`Tosi`) — el equipo no se divide tareas por rama.
Guardado en memoria persistente (`nexo-rama-de-trabajo-solla.md`) para
que sesiones futuras no vuelvan a asumir una rama personal. El intento
sobre `solla` quedó en un `git stash` en esa rama, sin mergear — no hace
falta recuperarlo, todo se rehizo desde cero sobre `main`.

Antes de tocar nada se exploró `frontend/css/styles.css` a fondo: ya
existía un design system deliberado (tokens completos, dark mode en dos
capas, responsive con tablas→cards en mobile) — nada de estilos ad-hoc
que rescatar. Se consultó el plugin recién instalado; su recomendación
genérica para "ERP dashboard" (azul corporativo + Fira Sans + patrón de
landing) se descartó por ser peor que la identidad ya construida. El
plugin sí sirvió para consultas puntuales de accesibilidad (mínimos de
touch target, overflow).

En vez de rediseñar algo que ya funcionaba, se **midió**: contrastes WCAG
reales de la paleta (fórmula de luminancia relativa, script propio) y
geometrías de los elementos flotantes en distintos viewports.

### Decisión de dirección visual, tomada con el usuario

El usuario pidió explícitamente **negro puro en modo oscuro, blanco puro
en modo claro, sidebar siempre negra**, sin escalas de grises
intermedias. Se le señaló antes de implementar que si `--bg` y `--surface`
son el mismo negro/blanco puro, la separación por relleno cae a 1.00:1
(los paneles se vuelven invisibles), y se le preguntó cómo prefería
resolver esa disyuntiva: **eligió que los paneles se definan por su
borde, no por relleno**. Decisión guardada en memoria persistente
(`nexo-tema-negro-blanco-puro.md`).

### Qué se construyó

- **`frontend/css/styles.css`, tokens de los tres bloques de tema**
  (`:root`, `@media (prefers-color-scheme: dark)`, `[data-tema="oscuro"]`):
  `--bg`/`--surface` pasan a ser el mismo blanco puro (`#FFFFFF`) en claro
  y el mismo negro puro (`#000000`) en oscuro; `--surface-sunk` queda solo
  para inputs (`#F4F4F4` / `#141414`). `--line` sube de contraste (de
  1.37:1 y 1.77:1, casi invisibles, a 1.74:1 y 1.85:1) porque ahora es el
  único portador de la jerarquía panel/fondo. `--ink-muted` ajustado en
  los dos temas (`#616161` claro, `#909090` oscuro).
- **Corrección de contraste WCAG** (medido, no estético): el badge verde
  `--accent-ok` sobre su fondo reprobaba a 2.94:1 (mínimo 4.5) — bajó a
  `#1F7350` (claro); `--accent-warn` (terracota) estaba corto a 4.09:1,
  pasó a `#A34A1A`; `--sidebar-ink-3` estaba corto a 4.36:1, pasó a
  `#858585`. El tema oscuro no tenía ninguna falla (7 combinaciones
  medidas, 4.80-13.62:1) y no se tocó.
- **`.sidebar` con `border-right`**: efecto secundario del negro puro —
  la sidebar fija `#121212` quedaba a 1.12:1 del nuevo `--bg` oscuro
  (#000000), casi indistinguible. Se agregó el borde (`--sidebar-line`,
  ya existente).
- **`.panel`/`.ledger-strip` sin `box-shadow`**: con `--surface = --bg`,
  una sombra suave ensucia el borde. `--shadow-lg` queda para lo que sí
  flota (modal, popover).
- **Botones de ícono (`.btn-icon`/`.btn-icon-danger`) a 24×24px**: medían
  22×22 (SVG 14px + padding 4px), bajo el mínimo WCAG 2.2 AA. Se agregó
  `min-width`/`min-height: 24px` — verificado con Playwright: 24×24 exacto.
- **Superposición real corregida: toast tapaba el botón del asistente en
  mobile**. En viewports de 375-414px, `.avisos` (z-index 65) se montaba
  sobre `.asistente-launcher` (z-index 45), bloqueando el click. **El
  primer intento de fix (solo ajustar `max-width`) no tuvo efecto** — la
  causa real era más profunda: el archivo tenía la definición base de
  `.avisos` escrita *más abajo* que su override de
  `@media (max-width: 860px)`, así que con la misma especificidad la base
  ganaba la cascada sin importar el viewport. Bug preexistente, no
  introducido en esta etapa. Se movió el override a después de la base
  (mismo patrón que el `@media (min-width: 861px)` de sidebar colapsada,
  justo al lado). Verificado: `.avisos` termina en 291px, el launcher
  arranca en 303px, 12px de aire — reproducido igual en `solla` y en
  `main`, mismo bug en las dos ramas porque ninguna lo había tocado antes.
- **`frontend/js/app.js`, clamp derecho del popover de filtros**
  (`abrirSelectorCampo`/`abrirEditorFiltro`): antes solo se evitaba
  desbordar por la izquierda — un chip cerca del final de una fila con
  `flex-wrap` podía abrir el popover fuera de `.main`. Se agregó el
  techo, midiendo `contenedor.clientWidth`/`pop.offsetWidth` reales
  después de appendear el elemento. Probado bajo estrés (anclaje
  simulado a 20px del borde): sin desbordar ni un píxel.
- **`data-label` faltantes en la tabla anidada de cuentas corrientes**:
  4 `<td>` de `.cc-detalle` sin etiqueta, invisibles en mobile. Se
  agregaron y se sumó un bloque `.cc-detalle`/`.cc-detalle td` en el
  mismo `@media (max-width: 860px)` — es una `<table>` propia anidada en
  un `<td colspan>`, no hereda las reglas de `.ledger-table`.
- **Residuos de valores crudos**: `.filtros` y `.ficha-datos` pasaron sus
  `gap`/`margin` sueltos a tokens de la escala.
- **Bug encontrado al verificar en `main` (no existía en la versión de
  `solla` que se exploró primero, porque esa rama no tenía la vista de
  Usuarios): los botones "Editar"/"Resetear contraseña"/"Dar de
  baja"/"Reactivar" de la vista Usuarios (`app.js`, función que renderiza
  la lista) no tenían ninguna clase del sistema de diseño — quedaban con
  el estilo nativo del navegador (caja gris sólida), muy visible contra
  el nuevo fondo negro puro. Se les agregó `.btn-fila` (la clase que ya
  usan las acciones de fila en el resto de la app), sin tocar las clases
  funcionales (`btn-editar-usuario` etc.) que usan los `querySelectorAll`
  para bindear eventos. Verificado en pantalla en los dos temas.**

### Lo que NO se tocó, a propósito

- **Tipografía**: Plus Jakarta Sans + IBM Plex Mono, ya bien ejecutado —
  no había defecto que corregir.
- **La arquitectura de z-index**: coherente, sin colisiones — el único
  conflicto real era geométrico (ancho del toast), no de capas.
- La recomendación de paleta del plugin `ui-ux-pro-max` — descartada.

### Verificación hecha

- **Contraste**: recalculado sobre los tokens finales, las 3 combinaciones
  corregidas superan 4.5:1, ninguna de las que ya pasaba bajó.
- **Playwright contra el servidor real** (`node backend/server.js`,
  puerto 3000, con login real usando una cuenta de administrador
  existente, detenido al terminar): capturas en claro/oscuro de Resumen
  (con "Qué se vende" fusionado visible), Usuarios, Cuentas corrientes y
  Ventas; mobile 375px con un toast disparado junto al launcher (sin
  superposición, 12px de aire); tamaño real de un botón de ícono en
  Ventas (24×24px exacto); clamp del popover con filtros puestos y con un
  caso extremo simulado — sin desborde en ningún caso. El cambio de tema
  se verificó con el botón real (`#btnTema`) después de que un primer
  intento vía solo `localStorage` diera capturas engañosas (el
  `data-tema` del `<html>` no se actualiza solo por cambiar el storage
  en runtime, solo al cargar la página o al clickear el botón).
- CSS revisado por balance de llaves (con y sin comentarios) y JS
  validado con `node --check`.

### Qué queda pendiente de esta etapa

- **Sin commitear** — confirmar con el usuario si conviene commitear
  ahora o seguir sumando. Cambios en `frontend/css/styles.css` y
  `frontend/js/app.js` únicamente; no se tocó backend ni esquema.
- Los badges (`.status-*`) se mantuvieron como pastillas con relleno; se
  evaluó en pantalla real si convenía texto+borde en vez de relleno y el
  relleno se ve bien — no se tocó, queda como posible ajuste futuro.
- El fix de los botones de Usuarios (hallazgo de esta etapa, no builded
  a propósito desde el inicio) es un parche puntual sobre 4 botones —
  si en el futuro se agregan más acciones de fila fuera de las tablas ya
  existentes, conviene revisar que usen `.btn-fila`/`.btn-icon` desde el
  primer commit en vez de quedar sin clase.

## 18. Última etapa: 7 ajustes puntuales sobre el refresh visual (ronda 2)

Después de probar §17 en el navegador real, el usuario marcó 7 problemas
concretos con capturas. Todos con causa medida antes de tocar código, no
ajustados a ojo:

1. **Pie de sidebar se montaba sobre sus propios botones** —
   `.sidebar-foot` era un flex de 4 elementos en una fila; con avatar
   (36px) + 2 botones (32px c/u) + gaps, quedaban solo ~84px reales para
   el nombre/rol del usuario, y "ADMINISTRADOR" en mono necesita ~93px.
   Se pasó a grid de 2 filas: avatar+datos arriba, los 2 botones abajo
   alineados a la derecha (`frontend/css/styles.css`, `.sidebar-foot` /
   `.sidebar-foot-botones`).
2. **Fechas partidas en dos líneas en las tablas** —
   `.ledger-table th` tenía `white-space: nowrap` pero `.ledger-table td`
   no. Se agregó, con una clase `.celda-wrap` para eximir a las columnas
   de texto libre largo (`items_resumen` — "2 × Producto, 3 × Otro" — y
   `Detalle` de auditoría/movimientos), que sí necesitan poder envolver.
   Anulado en el `@media (max-width: 860px)`, donde las filas ya son
   cards apiladas.
3. **Botones pegados en el modal "Mi cuenta"** — "Cambiar mi contraseña"
   vive dentro del `<form>`, "Cerrar sesión" en un `.panel-acciones`
   hermano sin gap entre ambos. Se agregó un separador
   (`.modal-card > .form + .panel-acciones`: borde superior + margen).
4. **Sacado el `.eyebrow`** (el texto chico "RESUMEN"/"ADMINISTRACIÓN"
   sobre cada título) — un solo elemento reusado por todas las vistas
   (`#vistaEyebrow`), borrado del HTML y del CSS. El campo `dominio` de
   `VISTAS_CONSTRUIDAS` en `app.js` se conserva (documenta el dominio de
   cada vista aunque ya no se pinte), la línea que lo escribía quedó con
   guard para no romper si el elemento no existe.
5. **Poco espacio entre botones de acción de fila** — en Usuarios los
   botones se unían con `acciones.join(" ")` **sin** estar envueltos en
   `.fila-acciones` (el contenedor con gap que usa el resto de las
   tablas): solo los separaba un espacio de texto. Se envolvieron, y de
   paso se subió el `gap` de `.fila-acciones` de 8px a 12px — mejora
   también las acciones de fila de Ventas, Compras, Gastos, etc., no
   solo Usuarios.
6. **Sidebar del mismo negro que el fondo + rojo en vez de naranja**:
   - `--sidebar-bg` pasó de `#121212` a `#000000`, igual a `--bg` oscuro.
     `--sidebar-line` subió de `rgba(255,255,255,.12)` a `.22` para que
     el borde (ahora lo único que separa sidebar y fondo) se vea. Se
     introdujo un token nuevo `--pill-bg: #121212` para los 4 elementos
     que usaban `--sidebar-bg` sin ser la sidebar en sí (botón del
     asistente, hamburger mobile, burbujas del chat, botón de enviar) —
     si pasaban a negro puro se volvían invisibles sobre el fondo negro.
   - `--accent-warn`/`--accent-warn-bg` pasaron a ser exactamente
     `--accent-danger`/`-bg` en los tres bloques de tema (decisión
     explícita del usuario: "todo lo que hoy es naranja pasa a rojo").
     Consecuencia dejada explícita: los badges "Pendiente" y "Anulado"
     quedan del mismo rojo, distinguibles solo por su texto.
7. **Logo negro invisible en el login** — el login usa el ícono negro
   sobre un fondo que ahora es negro puro. Se cambió a la variante
   blanca. **Efecto secundario encontrado al implementar**: el login no
   sigue el tema (usa `var(--bg)`/`var(--surface)`/`var(--ink)`), así que
   con tema claro activo el fondo pasaría a blanco y el logo blanco
   quedaría invisible — mismo problema, dirección contraria. Se le
   preguntó al usuario y decidió que **el login sea siempre negro,
   sin importar el tema** (mismo criterio que la sidebar: identidad de
   marca, no preferencia de lectura). Se fijaron con colores propios
   `.sesion-pantalla`, `.sesion-card` y todo lo que hay dentro (labels,
   inputs, `.btn-primary`, `.form-note`) para no depender de tokens que
   se invierten con el tema — de lo contrario el botón "Ingresar"
   (`var(--ink)`/`var(--bg)`) y los mensajes de error también hubieran
   quedado ilegibles en tema claro.

### Verificación hecha

Playwright contra el servidor real, login con cuenta de administrador
real, en los dos temas (toggle con `#btnTema`, no `localStorage` — ver
nota de §17). Capturas de login, Resumen, Usuarios, modal "Mi cuenta" y
Ventas en claro y oscuro, más el drawer mobile a 375px. Medido en el DOM,
no solo mirado: pie de sidebar sin superposición en desktop (836 vs 844)
ni en mobile (939 vs 947), `.fila-acciones` con `gap: 12px` real,
`background-color` de sidebar y fondo idénticos (`rgb(0,0,0)`) en tema
oscuro. `items_resumen` sigue envolviendo en Ventas mientras las fechas
quedan en una sola línea — confirma que el nowrap + `.celda-wrap` separan
bien ambos casos.

### Qué queda pendiente de esta etapa

- **Sin commitear**, igual que §17 — confirmar con el usuario.
- El logo del favicon (`<link rel="icon">`) sigue siendo la versión negra
  — no se tocó porque el navegador lo pinta sobre su propia barra de
  pestañas, no sobre el fondo de la app; revisar si en algún navegador/SO
  se ve mal.
- Los badges "Pendiente"/"Anulado" ahora comparten color (rojo) — es lo
  que pidió el usuario, pero si en el uso diario resulta confuso
  distinguirlos, es un cambio de un solo token (`--accent-warn`) para
  volver a diferenciarlos sin tocar ningún otro lugar.

## 19. Última etapa: comprobantes imprimibles + exportación a CSV

**El pedido**: seguir sumando funciones. Con el MVP completo, se relevaron los
huecos reales del sistema y el usuario eligió, entre cuatro opciones
(imprimir/exportar, descuentos, reportes de compras, multidepósito), la
primera: **no se podía sacar nada del sistema**. Cero `@media print`, cero
exportación, cero forma de entregarle un papel a un cliente.

Se hizo en tres etapas chicas y verificables (A → B → C).

### Etapa A — Datos del negocio (toca esquema)

Los comprobantes necesitan un membrete: quién emite el papel.

- **Migración aditiva sobre `organizaciones`**: 6 columnas nullable
  (`documento` = CUIT, `direccion`, `telefono`, `email`, `condicion_iva`,
  `pie_comprobante`), cada una guardada con `PRAGMA table_info` para ser
  idempotente. Ninguna fila se reescribe.
- **Se decidió NO crear una tabla `datos_negocio` nueva** (era la alternativa
  obvia): `organizaciones` ya ES el negocio, y una tabla paralela duplicaría
  el concepto. Pero el motivo decisivo fue de auditoría — ver abajo.
- **Segundo rebuild de `auditoria`** para sumar `'organizacion'` al CHECK de
  `entidad`. SQLite no permite alterar un CHECK, así que hay que reconstruir la
  tabla entera (patrón ya usado dos veces, `db/index.js:112-215`). Se hizo a
  propósito, **decidido con el usuario**: cambiar el CUIT que sale impreso en
  todos los comprobantes tiene que quedar registrado (§22), y las dos
  alternativas para esquivar el rebuild eran no auditar o mentir reusando otra
  entidad. A diferencia del primer rebuild, este corre sobre una tabla **con
  filas y con `usuario_id`**, así que el INSERT..SELECT los copia y preserva
  los `id`; los dos índices se recrean a mano (el DROP TABLE se los lleva).
- `GET /api/negocio` (cualquier usuario autenticado, el frontend lo necesita en
  el boot) y `PUT /api/negocio` (**soloAdmin**).
- **Modal de Configuración**, que estaba vacío desde siempre con un texto que
  decía "en una próxima etapa": ahora tiene el formulario real, deshabilitado
  por rol para un empleado (el 403 del servidor es la garantía; esto es UI).

### Etapa B — Comprobante imprimible

Presupuesto y factura. El PDF lo hace el navegador ("Guardar como PDF" ya está
en su diálogo de impresión), así que **no se sumó ninguna dependencia**.

- **`#hojaImpresion`, un contenedor dedicado, NO `@media print` sobre la
  ficha.** Es la decisión central de la etapa: la ficha de venta muestra
  **costo, margen y ganancia por renglón**, y la de factura muestra estado de
  cobro y "Origen: Venta #N". Peor: esos campos se renderizan desde un array
  `campos` sin clase ni id propio, así que ocultarlos por CSS exigiría
  selectores posicionales (`div:nth-child(6)`) que se rompen en silencio la
  próxima vez que alguien reordene el array. El contenedor invierte el default:
  solo sale lo que se pone explícitamente.
- **Venta y compra NO se imprimen, a propósito**: la venta es un documento
  interno (mostraría el margen al cliente; si hace falta papel, se factura), y
  el comprobante de una compra lo emite el proveedor.
- **El papel dice "Documento no válido como comprobante fiscal"**, siempre.
  Nexo no está conectado a ARCA ni emite CAE: un papel con forma de factura y
  sin CAE no es válido, y no decirlo sería inducir a error.
- **Los datos de contacto del cliente no llegaban al frontend**:
  `SELECT_PRESUPUESTO` y `SELECT_FACTURA` traían solo `clientes.nombre`. Se
  agregaron `documento`/`direccion`/`email`/`telefono` (aditivo sobre el JSON).
- **Blanco y negro forzado, en tres capas y las tres hacen falta**: redefinir
  los tokens dentro de `@media print` (nombrando los tres selectores de tema,
  porque `[data-tema="oscuro"]` tiene más especificidad que `:root`),
  **`color-scheme: light`** (sin esto el navegador pinta el canvas oscuro por su
  cuenta aunque el CSS diga blanco — es el detalle que convierte una impresión
  en un cartucho entero), y colores literales en la hoja en vez de tokens
  (mismo criterio que `.sesion-card`, con el signo invertido).
- El botón de presupuesto se agrega con `insertAdjacentHTML` **después** del
  `if/else` que decide las acciones: las dos ramas reescriben
  `acciones.innerHTML` entero, así que ponerlo dentro de una sola lo haría
  desaparecer en la otra.
- **El botón dice "Imprimir / PDF", no "Imprimir"**, y la primera vez que se
  usa (una sola vez por navegador, con una marca en `localStorage`
  `nexo.avisoPdf`) aparece un toast que explica que hay que elegir "Guardar
  como PDF" en el destino de impresión. El usuario preguntó si podía haber una
  descarga de PDF aparte del imprimir; se le explicó que **el diálogo del
  navegador YA es la descarga de PDF** y que un botón separado no puede
  preseleccionar el destino (el navegador no lo permite por JS), así que sería
  el mismo botón prometiendo algo que no cumple. **Eligió el renombre.** Un PDF
  descargado de verdad requeriría una dependencia: una librería en el frontend
  (jsPDF/pdfmake, y habría que redibujar el comprobante en su API en vez de
  reusar el HTML, quedando dos versiones que mantener sincronizadas) o
  generarlo en el backend (Puppeteer reusa el HTML pero pesa ~300MB; PDFKit es
  liviano pero también obliga a redibujar). **La razón que lo va a justificar
  es mandar el comprobante por email o WhatsApp**, donde hace falta el archivo
  sin intervención del usuario — ahí la dependencia se paga sola.

### Etapa C — Exportación a CSV

Ventas, Gastos, Stock y Cuentas por cobrar/pagar (6 botones: tres vistas tienen
dos tablas independientes).

- **Se genera en el cliente**, no en el servidor: hay que exportar lo que el
  usuario ESTÁ VIENDO, y sus filtros y su orden viven solo en el frontend. Un
  endpoint tendría que reimplementar en SQL los operadores de `crearFiltros`
  (incluidos los relativos) — el mismo motor duplicado en dos lenguajes, que es
  justo lo que el proyecto ya evitó para el filtrado de movimientos.
- **Separador `;` y BOM UTF-8**, los dos necesarios: Excel usa el separador de
  listas regional (en español es `;`, porque la coma es el separador decimal) y
  sin BOM abre el archivo en ANSI y rompe todo acento. El BOM va en el
  contenido del Blob, no alcanza con el MIME type.
- **Números crudos**, nunca por `money()`: un "$ 1.234,50" llega a Excel como
  texto y no se puede sumar, que es exactamente para lo que se exporta.
- **Cada botón recalcula la lista con la expresión de SU vista**, copiada
  textualmente. No es un detalle: la composición difiere entre vistas
  (`filtrarPresupuestos` hace `orden(filtros(x))` y `filtrarFacturas` al revés),
  Ventas descarta las anuladas primero, Gastos filtra por activo, y Stock
  combina el motor de filtros con su propio `<input type="search">`. Copiar mal
  la expresión daría un CSV que no coincide con la pantalla.

### Bugs reales encontrados (por las pruebas, no por lectura)

1. **`numero is not a function`** al imprimir: el parámetro `numero` de
   `armarHojaComprobante` (el número de comprobante) sombreaba al helper global
   `numero()` que la misma función usa para las cantidades. Renombrado a
   `comprobanteNro`. Lo detectó el `pageerror` de Playwright — la hoja quedaba
   vacía sin ningún síntoma visible.
2. **El detalle de auditoría listaba índices en vez de campos**
   (`"actualizados: 0, 1, 2, ... 285"`): `diffCampos` devuelve los valores **ya
   serializados a JSON (string)**, así que `Object.keys()` sobre eso da los
   índices de cada carácter. Se calculan los campos cambiados aparte.
3. Al hidratar el formulario del negocio, `cargarNegocio()` se llamaba desde la
   cadena de arranque **antes** de que se declarara el `const formNegocio`. Se
   movió la sección entera antes del boot (con un script que verifica conteos
   exactos y aborta si algo no cuadra).

### Verificación hecha

Metodología de siempre: copia aislada al scratchpad, servidor de prueba en el
**3002** (nunca el 3000), Playwright.

- **Migración**: comparador propio (`foto.mjs` + `comparar.mjs` en el
  scratchpad) que verifica `COUNT(*)` de las 29 tablas, columnas de cada una,
  índices, vistas, `foreign_key_check` y una huella de `auditoria` (filas, min,
  max y suma de ids). Corrido pre y post en la copia **y** en la base real.
  Arrancar dos veces seguidas no re-entra al rebuild.
  - Única diferencia esperada y verificada a mano: `sesiones` 14 → 0. Es la
    limpieza de sesiones vencidas que `db/index.js` ya hacía en cada arranque
    desde antes de esta etapa; se comprobó contra el backup que **las 14 estaban
    vencidas** (la más nueva expiró el día anterior).
- **Endpoints** (`probar-negocio.mjs`): 401 sin cookie, 403 con cuenta de
  empleado (y el nombre sin cambiar después del 403), 400 con nombre vacío,
  persistencia de los 7 campos, opcionales vacíos → NULL (no cadena vacía),
  fila de auditoría con el `usuario_id` correcto, y **un PUT sin cambios reales
  no genera fila de auditoría**.
- **Impresión** (`etapaB.mjs`): medido en el DOM bajo `emulateMedia({media:
  'print'})`, **en tema oscuro**: fondo `rgb(255,255,255)` y tinta `rgb(0,0,0)`;
  `.app` con `display:none` y la hoja visible. Más un **PDF real** con
  `page.pdf()` (`emulateMedia` no pagina). Y la aserción que justifica todo el
  diseño: **"Costo", "Ganancia", "Margen" y "Estado de cobro" no aparecen en
  ningún lado de la hoja**.
- **CSV** (`etapaC.mjs`): BOM verificado a nivel byte (`EF BB BF`), separador
  `;`, CRLF, importes sin signo de moneda. La aserción central: con un filtro
  real aplicado por la UI, el archivo tiene **exactamente las filas que muestra
  la tabla** (6 → 3 al filtrar). Escapado probado directo contra el helper
  (separador, comillas duplicadas, saltos de línea, espacios en los bordes).
  Con la tabla vacía: avisa y **no descarga** nada.
- 375px sin scroll horizontal, botones sin superposición (medido con
  `getBoundingClientRect`), sin errores de consola en ningún escenario.
- **Deploy**: backup `nexo.db.backup-antes-datos-negocio-20260901-094043`, foto
  pre-deploy, copia de los 6 archivos de código (**nunca `nexo.db`**: la copia
  de prueba tenía usuarios de prueba), arranque del 3000 y comparación 1:1 —
  todos los números de negocio idénticos. Verificado además que la base real
  quedó **sin usuarios de prueba** y con la fila de auditoría original intacta.

### Qué queda pendiente

- **Los datos del negocio están vacíos en la base real**: el membrete va a salir
  con "Mi negocio" hasta que el usuario los cargue desde el engranaje →
  Configuración. Es lo primero que conviene hacer al abrir la app.
- **Sin commitear.** Los 6 archivos modificados están en `main` sin commit.
- **Logo del negocio en el membrete**: decisión explícita del usuario — el
  negocio va a poder **subir su propio logo** desde las preferencias, y por eso
  NO se usó el logo de Nexo (el papel es del negocio, no del software). Es la
  próxima etapa natural del modal de Configuración, y necesita manejo de
  archivos subidos.
- Extender el CSV a las otras 12 tablas: con el helper hecho son ~8 líneas cada
  una. Se acotó a 4 para validar el helper contra formas de tabla distintas.
- Imprimir devoluciones/notas de crédito: el molde ya está, pero el encabezado y
  el pie necesitan texto propio.
- `GEMINI_API_KEY` sigue sin cargar en el proceso real (sin cambios respecto a
  etapas anteriores).

## 20. Última etapa: selección múltiple en tablas + imprimir/descargar/CSV en lote

**El pedido**: seguir sumando funciones, con el caso concreto de poder
seleccionar varios comprobantes y descargar sus PDF de una. Se decidió con el
usuario (`AskUserQuestion`, dos rondas) el alcance real: selección en las 8
tablas de listado que tenían sentido (no las 14 del sistema — ver el porqué
más abajo), con tres acciones que **no escriben en la base**: imprimir en
lote, descargar PDF en lote, y CSV de lo seleccionado. La **edición masiva
tipo Notion** (cambiar estados/campos de varios registros a la vez) quedó
**explícitamente para una etapa aparte**, ya con esta infraestructura probada
— necesita endpoints bulk nuevos y una regla de negocio que hay que
preguntar (qué pasa si algunos de los N registros fallan la validación: ¿se
aplica el resto o se revierte todo?).

**Solo frontend — el backend y el esquema no se tocaron.** Las tres acciones
son de lectura, así que no hizo falta migración ni auditoría nueva.

### Decisión que revierte parcialmente la etapa 19

En §19 se le había explicado al usuario que el diálogo "Guardar como PDF"
del navegador YA es la descarga de PDF, y había elegido un solo botón
"Imprimir / PDF" para no sumar dependencias. Al preguntarle de nuevo en el
contexto de selección múltiple, **pidió las dos cosas separadas**: un botón
"Imprimir" (un solo diálogo, todos los comprobantes seleccionados, uno por
página) y un botón "Descargar PDF" (N archivos separados, con nombre
propio) — el navegador no permite eso último sin intervención humana, así
que hizo falta sumar una dependencia: **jsPDF + html2canvas**, vendorizadas
en `frontend/js/vendor/` (primera dependencia frontend del proyecto, cargada
bajo demanda, sin build step). Queda memoria de esto para no repetir la
pregunta en una sesión futura.

### `crearSeleccion` — el helper nuevo, en `frontend/js/app.js`

Cuarto miembro de la familia de utilitarios de tabla (`crearFiltros`,
`crearOrden`, `descargarCSV`), ubicado justo después de `crearOrden`. Agrega
una columna de checkbox a una tabla:

- **La columna se inyecta por JS** (`insertAdjacentHTML`), igual que
  `crearOrden` ya inyecta su flecha de orden — así la columna existe *si y
  solo si* la selección está montada, y `sel.colspan(n)` puede devolver
  `n + 1` sin tener que tocar el `<thead>` de cada vista a mano en
  `index.html`. El `<th>` de checkbox NO lleva `data-orden` a propósito.
- **Un solo `sel.celda(id)`** (devuelve string) sirve para los dos estilos
  de render que coexisten en el archivo (`innerHTML + .map().join("")` y
  `createElement("tr") + tr.innerHTML =`): las dos arman la fila con un
  template string.
- **"Seleccionar todo" = lo visible con los filtros puestos** — misma
  semántica que ya tenían los botones de "Exportar CSV" existentes.
  `sel.sincronizar(lista)` se llama desde cada `render*()` con la lista ya
  filtrada/ordenada; poda del set cualquier id que haya dejado de estar
  visible (si filtrás y algo seleccionado queda afuera, se destilda solo —
  necesario para que el contador de la barra nunca mienta sobre lo que hay
  tildado en pantalla).
- **Único punto de delegación real del archivo**: los checkboxes de fila se
  bindean una sola vez con `body.addEventListener("change", ...)`, no en
  cada render (el resto del archivo re-bindea siempre) — evitar N listeners
  nuevos por render era el único costo real de la feature.
- **Mobile**: el `<thead>` (y con él el checkbox "seleccionar todo") queda
  `display:none` en ese breakpoint. `crearSeleccion` inyecta un botón de
  texto propio (`.btn-sel-todo-mobile`) antes de `.tabla-scroll`, oculto en
  desktop, que hace de "seleccionar todo / ninguno" ahí. Decisión tomada con
  `AskUserQuestion`: se descartó ponerlo dentro de la barra flotante porque
  esa barra solo aparece con selección > 0, y hacía falta un control
  disponible aunque no hubiera nada tildado todavía.
- **Guarda de click de fila ampliada**: los ~8 sitios con
  `if (e.target.closest("button, a")) return;` (variantes inconsistentes
  entre vistas) pasaron a `"button, a, input, label, select, textarea"`. De
  paso corrige un bug preexistente en Productos (el input inline de precio
  podía disparar la apertura de la ficha).

### `montarBarraSeleccion` — la barra de acciones, única y flotante

Un solo `#barraSeleccion` (`index.html`, hermano de `#hojaImpresion`),
`position: fixed` centrada abajo, llenada con los botones de la vista activa
vía `sel.escuchar(fn)` (un mini pub/sub que `crearSeleccion` expone). En
mobile ocupa el ancho con `flex-wrap`. **Se agregó `.barra-seleccion` a la
lista de `display:none !important` del `@media print`** — si no, la barra
saldría impresa en el papel; es el detalle más fácil de olvidar de toda la
etapa y se hizo en la misma sub-etapa en que se creó la barra, no después.

### Las 8 tablas equipadas y las que quedaron afuera

| Tabla | Acciones |
|---|---|
| Facturas, Presupuestos | Imprimir · Descargar PDF · CSV |
| Ventas, Compras, Productos, Stock, Clientes, Proveedores | CSV |

Solo Facturas y Presupuestos imprimen: son las dos únicas entidades con
`armarHojaComprobante` (Ventas y Compras no imprimen a propósito desde §19 —
la venta mostraría el margen, el comprobante de compra lo emite el
proveedor). Quedaron **afuera** de esta etapa: Cuentas corrientes (dos
`<tr>` por registro — fila + detalle expandible — el helper tendría que
aprender "fila secundaria"), Papelera (el lote ahí sí tendría sentido pero
*escribe* en la base, es la próxima etapa), y Auditoría/Devoluciones/Dev.
proveedor/Gastos/Caja/Usuarios (sin acción de lote que aportara hoy — con el
helper ya hecho, sumar cualquiera cuesta ~6 líneas si se pide).

Compras tiene **dos ramas** de `tr.innerHTML` (borrador / no-borrador) y las
dos llevan `selCompras.celda(c.id)` — verificado por lectura de código (los
datos de prueba no traían ninguna compra en borrador para probarlo en vivo).

### Imprimir en lote

`imprimirComprobante(html)` se partió en `imprimirHojas(htmls)` (acepta un
array, concatena y hace un solo `window.print()`) + `imprimirComprobante`
como envoltorio de compatibilidad (`imprimirHojas([html])`) — **los dos call
sites viejos** (botón de la ficha de factura, botón inyectado de la ficha de
presupuesto) **quedan sin tocar un carácter**. Se extrajeron
`hojaDeFactura(f)` / `hojaDePresupuesto(p)` de esos dos botones para
reusarlas también desde el lote sin duplicar la lógica del caso "factura
suelta".

CSS nuevo en `styles.css`: `.hoja { break-after: page; page-break-after:
always; }` + `.hoja-impresion > .hoja:last-child { break-after: auto; }` —
sin la segunda regla, imprimir 3 hojas dejaría una 4ª página en blanco al
final (bug clásico de paginación por CSS).

### Descargar PDF (jsPDF + html2canvas)

- **Vendorizadas** en `frontend/js/vendor/jspdf.umd.min.js` (365KB, build
  2.5.2) y `html2canvas.min.js` (198KB, build 1.4.1), bajadas de jsdelivr y
  servidas por el `express.static` que ya existía — no hizo falta tocar el
  backend. **Cargadas bajo demanda** (`cargarLibsPdf()`, memoizada, inyecta
  `<script>` al vuelo con el mismo patrón que ya usa `sesion.js` para
  inyectar `app.js`): quien nunca aprieta "Descargar PDF" no baja ni un
  byte de las ~560KB combinadas.
- **El problema central**: html2canvas no puede fotografiar algo en
  `display:none` (que es como vive `#hojaImpresion` en pantalla) — mide con
  `getBoundingClientRect` y da un canvas 0×0. Se resolvió con un contenedor
  aparte, `.hoja-render` (creado y destruido por cada descarga vía
  `conHojaVisible()`), sacado de la vista con `position:fixed; left:
  -10000px` — **no** con `visibility:hidden` ni `opacity:0`, que html2canvas
  sí respeta y hubieran dado una captura en blanco. Ancho fijo en `mm`
  (182mm = A4 menos los 2×14mm de margen del `@page`) para que la hoja se
  maquete al ancho de página real sin importar el ancho de la ventana del
  usuario.
- **Verificado con Playwright que el PDF sale blanco aun con el tema oscuro
  activo** (pixel `(5,5)` del canvas: `[255,255,255,255]`) — funciona porque
  `.hoja` ya fijaba colores literales desde §19 y `.hoja-render` no hereda
  nada del tema; fue el riesgo más probable de toda la etapa y se descartó
  con una prueba real, no por lectura de código.
- **Pipeline**: `html2canvas(hoja, {scale:2, backgroundColor:"#FFFFFF"})` →
  `toDataURL("image/jpeg", 0.92)` (JPEG, no PNG: una A4 a scale 2 en PNG
  pesa 1-3MB, en JPEG ~200KB — con 50 facturas es la diferencia entre 10MB
  y 150MB de descargas) → `jsPDF({unit:"mm", format:"a4"})` → si la hoja
  mide más que una página útil (factura con muchos ítems), se reparte en
  varias páginas del mismo PDF en vez de achicar la imagen (escalarla la
  volvería ilegible).
- **Limitación que hay que poder explicarle al usuario si pregunta**: el PDF
  descargado es una IMAGEN, sin texto seleccionable — el botón "Imprimir" →
  "Guardar como PDF" del navegador sí da texto real. Los dos botones se
  complementan, no hay que proponer sacar uno de los dos.
- **Generación en serie**, no en paralelo (evita saturar memoria/hilo
  principal con N `html2canvas` a la vez), con el botón mostrando
  `Generando 3/20…` mientras dura — verificado en vivo con Playwright que el
  contador realmente se ve moverse paso a paso (1/3 → 2/3 → 3/3), no solo
  que el resultado final es correcto.
- **Umbrales**: sin selección > 25 no pide nada; entre 25 y 500 pide
  `confirmar()` avisando que puede tardar y que **Chrome va a pedir permiso
  para descargar varios archivos** (lo bloquea por defecto — es el problema
  de UX más probable si alguien selecciona muchos sin el aviso); por encima
  de 500, `avisar()` y no arranca (guardarraíl contra un "seleccionar todo"
  accidental, no una regla de negocio).
- Nombres: `factura-{comprobante-sanitizado}.pdf` / `presupuesto-{id}.pdf`,
  sin fecha (a diferencia de `descargarCSV`, el comprobante ya es único).

### CSV en lote

Los 6 botones "Exportar CSV" existentes (Ventas, Gastos, Stock, CC
cobrar/pagar) **no se tocaron** — siguen exportando todo lo visible. El CSV
en lote es un botón nuevo en la barra, con semántica distinta ("lo que
marcaste" vs. "lo que estás viendo"), reusando `descargarCSV` y filtrando
sobre la lista visible de cada vista (para preservar el orden y el filtro
activo). Se declararon `COLUMNAS_CSV_*` nuevas para las 4 tablas que no
tenían export previo (Facturas, Presupuestos, Compras, Proveedores) — mismo
criterio ya establecido: números crudos, nunca `money()`.

### Dos bugs reales que el usuario encontró probando a mano (después de la
### verificación con Playwright de abajo — quedaron afuera de esos scripts)

Ninguno de los dos apareció en las 91 verificaciones automatizadas de la
sub-etapa correspondiente porque las pruebas comprobaban el `hidden` del
DOM y el `.closest()` de forma aislada, no el resultado visual completo con
clicks reales del navegador. Lección para la próxima etapa: cuando algo
depende de CSS que puede ganarle a un atributo (como acá), verificar con
`isVisible()`/captura, no solo leyendo el atributo por `evaluate()`.

1. **Tildar el checkbox a veces abría la ficha igual.** La guarda de click de
   fila se había normalizado a `"button, a, input, label, select, textarea"`
   en 7 de los 8 sitios, pero **Facturas** (`"a, button, input, ..."`) y
   **Compras** (`"button, select, a, input, ..."`) tienen el mismo conjunto
   en **otro orden**, y el primer `sed` de reemplazo buscaba el texto
   literal exacto — se saltó esas dos variantes sin avisar. Como esas dos
   celdas de checkbox además son angostas (32px, con el `<input>` real de
   solo 13px), un click que cayera en el padding de la celda en vez de sobre
   el input daba `e.target = TD.col-sel`, que no matcheaba ninguna de las
   palabras de la guarda vieja → abría la ficha. Fix: se agregó `.col-sel` a
   las 7 guardas (cubre la celda entera, no solo el input) y se sumó un
   listener de `click` delegado en el `tbody` que togglea el checkbox si el
   click cae en cualquier parte de `td.col-sel` que no sea el input mismo —
   así el hitbox agrandado también sirve para algo, no solo para no romper.
   **Al normalizar las variantes de guarda, verificar con `grep` que el
   reemplazo realmente cubrió cada una — el orden de las palabras en el
   selector CSS varía entre sitios que se escribieron en sesiones distintas.**
2. **El cartel de selección no desaparecía al destildar todo, ni con
   "Limpiar" ni con Escape** (el usuario lo reportó dos veces: primero
   "se me traba", después "esc destilda el ítem pero no se va el cartel").
   La causa no era JavaScript — `sel.limpiar()` y el nuevo listener de
   `Escape` (agregado en el mismo arreglo, ver abajo) sí ponían
   `barra.hidden = true` correctamente. El problema era CSS puro:
   `.barra-seleccion { display: flex; }` tiene la misma especificidad que la
   regla `[hidden]` del user-agent stylesheet, y por venir después en la
   cascada le ganaba — la barra seguía viéndose con el conteo viejo aunque
   el atributo `hidden` estuviera puesto. Es el **mismo bug que el propio
   `styles.css` ya documentaba haber resuelto para `.hoja-impresion`**
   (comentario explícito ahí sobre por qué se usa una clase y no `[hidden]`
   para esa), pero no se replicó el patrón al escribir `.barra-seleccion`.
   Fix: `.barra-seleccion[hidden] { display: none; }`. **Cualquier elemento
   nuevo que se oculte con `el.hidden = true` en este proyecto necesita esa
   regla explícita si también tiene un `display` propio en CSS — no alcanza
   con el atributo solo.**
3. **De paso, mejora pedida por el usuario**: Escape ahora limpia la
   selección activa (antes no existía ninguna forma de "salir del modo
   selección" sin clickear "Limpiar" o destildar a mano). Implementado con
   una variable de módulo `seleccionActivaEnBarra` que `montarBarraSeleccion`
   actualiza cada vez que su `sel` pasa a tener selección > 0 — un solo
   listener global de `keydown`, no uno por tabla (evita apilar 8 handlers
   permanentes en `document`).

Los tres fixes están verificados con Playwright end-to-end (`isVisible()`
real, no solo el atributo) y sin regresión en las 49 verificaciones de las 8
tablas — ver el detalle en Verificación hecha, más abajo.

### Bugs reales encontrados en scripts de verificación (por las pruebas con
### Playwright, no por lectura)

Ninguno en el código de la app — los tres "fallos" que aparecieron al
principio de las corridas eran problemas de los propios scripts de
verificación, documentados acá para no repetirlos:

1. **`page.goto()` con el mismo hash no dispara `hashchange`** cuando ya se
   está en esa URL (ej. `#/facturas` → abrir ficha → `page.goto("#/facturas")`
   de nuevo): la vista queda con `hidden` mal aplicado y sus elementos con
   `getBoundingClientRect() = {0,0,0,0}`. Fix: navegar con el botón real
   ("← Volver a...") en vez de `page.goto` al mismo hash — es exactamente lo
   que haría un usuario real, y evita este falso negativo.
2. **`page.goto()` con `waitUntil: "load"` (el default) puede colgarse**
   contra este servidor si algún recurso enlazado nunca dispara su evento
   `load` — cambiar a `waitUntil: "domcontentloaded"` lo resolvió en todos
   los scripts. No se investigó la causa raíz (no bloqueaba el uso real de
   la app, solo la automatización de pruebas), pero si un futuro script de
   verificación se cuelga en un `goto`, probar esto primero.
3. Un `Stop-Process` de PowerShell demasiado amplio (`-Name node`) mató
   también el servidor de prueba real en medio de una tanda de verificación
   — hay que apuntar `Stop-Process` al PID exacto (`Get-NetTCPConnection
   -LocalPort 3002 | ... OwningProcess`), nunca por nombre de proceso
   genérico como `node`, porque mata cualquier otro Node corriendo en la
   máquina (incluido el servidor real si estuviera en otro puerto).

### Verificación hecha

Metodología de siempre: copia aislada al scratchpad, servidor de prueba en
el **3002**, Playwright. Usuario de prueba propio (`test_qa` / rol admin)
insertado a mano en la copia de `nexo.db` con el mismo `scryptSync` que usa
`server.js` — la copia no traía la contraseña del admin real (`Solla_FAT`).

- **Sub-etapa 1** (helper sobre Facturas sola): 17/17 checks — columna en
  thead/tbody, guarda de click, checkbox indeterminate con selección
  parcial, "Limpiar" destilda todo y oculta la barra, CSV descarga con el
  sufijo `-seleccion`, colspan correcto contra el `<thead>` real (verificado
  con `renderFacturas([])` forzado), mobile 375px sin scroll horizontal, sin
  el hueco de 110px del `::before` en la celda de checkbox, botón
  "Seleccionar todo" de mobile funcional.
- **Sub-etapa 2** (las 7 tablas restantes): 49/49 checks — mismo set por
  tabla (thead, tbody, barra, CSV, limpiar) × 8 tablas, sin errores de
  consola. Confirmado con `evaluate()` directo (no XPath, que dio falsos
  negativos en la primera pasada) que cada `<thead>` tiene exactamente un
  `th.col-sel`. Regresión mobile en 4 tablas más (Ventas, Productos,
  Clientes, Stock): sin scroll horizontal.
- **Sub-etapa 3** (imprimir en lote): 12/12 checks — **los dos botones
  viejos de imprimir individual (factura y presupuesto) siguen funcionando
  sin cambios**, imprimir 2 facturas seleccionadas genera exactamente 2
  `.hoja` en `#hojaImpresion` con un solo `window.print()`, el contenedor
  queda vacío después, `break-after` correcto (page/page/auto en 3 hojas de
  prueba), la barra de selección se confirma oculta en `@media print`
  (`getComputedStyle().display === "none"`).
- **Sub-etapa 4** (descargar PDF): verificado en varias pasadas — 1 PDF
  individual (73KB, cabecera `%PDF-` válida, nombre `factura-b-0001-...pdf`),
  3 PDFs en lote con nombres distintos y el contador de progreso visible
  paso a paso, toast final "Se descargaron 3 PDF.", **canvas confirmado
  blanco puro con tema oscuro activo** (el riesgo más probable de la etapa),
  sin errores de consola.
- **Regresión final**: re-corridas las 49 verificaciones de las 8 tablas
  después de sumar imprimir/descargar — sin diferencias.
- CSS revisado con llaves balanceadas (317/317, excluyendo comentarios).
- **No se reinició el proceso real** (`localhost:3000`): todo el cambio es
  frontend puro sin build step, así que ya está viviendo ahí apenas se
  guardaron los archivos. Los dos archivos vendorizados nuevos también se
  sirven solos por el `express.static` existente.
- **Sesión siguiente (continuación, tras los 3 fixes de arriba)**: la sesión
  anterior se había cortado sin dejar ningún servidor corriendo — se
  relevantó el de prueba (**3002**) desde la copia ya sincronizada del
  scratchpad y se re-corrió **toda** la batería existente antes de tocar
  nada más, para partir de un estado confirmado y no de memoria: 49/49 (las
  8 tablas), 13/13 (imprimir en lote, con los dos botones individuales
  viejos incluidos) y la descarga de 3 PDF en lote con nombres distintos y
  contador de progreso visible paso a paso — las tres baterías en verde. Fue
  después de esa foto limpia que se aplicaron y verificaron los 3 fixes de
  arriba.

### Qué queda pendiente

- **Sin commitear.** Junto con los cambios de §19 (backend, sin commit
  todavía), esta etapa suma `frontend/index.html`, `frontend/js/app.js`,
  `frontend/css/styles.css` y los dos archivos nuevos en
  `frontend/js/vendor/`.
- **Edición masiva (tipo Notion)**: la razón original del pedido, queda
  para la próxima etapa. Necesita: endpoints bulk nuevos (`withTransaction`
  + `auditar()` **por registro individual**, no uno por lote — la regla de
  trazabilidad de `CLAUDE.md` pide poder reconstruir qué cambió en cada
  entidad), y una decisión de negocio que hay que preguntarle al usuario
  antes de construir nada: si al editar 20 registros 3 fallan la
  validación, ¿se aplican los 17 restantes o se revierte todo el lote?
- **Solo Facturas y Presupuestos imprimen/descargan** — si el usuario pide
  extender a otra entidad (por ejemplo, un comprobante para devoluciones),
  el molde de `armarHojaComprobante` ya está, falta el encabezado/pie
  propio (mismo pendiente que ya señalaba §19).
- ~~Hay un archivo suelto y vacío en la raíz del repo, `String(o.valor)`~~ —
  **borrado en la sesión siguiente**: confirmado 0 bytes y consistente con
  una redirección de shell mal ejecutada (probablemente un heredoc/`sed` que
  interpoló mal una variable y creó un archivo con ese nombre literal), no
  con trabajo del usuario.
- `GEMINI_API_KEY` sigue sin cargar en el proceso real (sin cambios).

## 21. Última etapa: edición en lote (bulk edit) — Productos y Compras

**El pedido**: era la razón original por la que se había construido la selección
múltiple de §20, diferida en ese momento porque faltaban dos cosas: endpoints
bulk en el backend (hasta esta etapa, **cero** — todas las rutas de mutación
eran `/:id`) y una decisión de negocio sobre qué pasa cuando parte del lote
falla. Se le preguntó al usuario con `AskUserQuestion` (3 preguntas): qué
función construir (eligió edición en lote sobre listas de precios, reportes de
compras o marca/unidad de medida), la semántica de fallo parcial (**se
aplican los que pasan la validación, se informa el resto con su motivo — no
todo-o-nada**), y si commitear primero lo pendiente de §19/§20 (**no**, sigue
sin commitear, se acumula con esta etapa).

Alcance: **Productos** (activar/desactivar, categoría, precio de venta por
% o valor fijo, stock mínimo) y **Compras → estado de envío**. Ninguna otra
entidad tenía columnas enum que justificaran bulk edit (clientes/proveedores
son todo texto libre; ventas solo tendría sentido para anular, que arrastra
efectos colaterales de otra magnitud — quedó fuera a propósito).

**Cero migración de esquema**: verificado antes de tocar nada que el CHECK de
`auditoria.accion` ya incluía `'editar'`/`'cambiar_estado'` y el de `entidad`
ya incluía `'producto'`/`'compra'` (de etapas anteriores). `schema.sql` y
`db/index.js` no se tocaron.

### Backend (`backend/server.js`)

Helpers transversales nuevos, junto a `diffCampos` (~línea 374): `ErrorBulk`
(error de negocio con status HTTP asociado), `mensajeDeError` (traduce un
error de un ítem del lote al string que ve el usuario; un error que no sabe
traducir hace `throw` en vez de enmascararse como "falló el ítem X"),
`idsDeLote` (dedupe + `LIMITE_BULK = 500`, guardarraíl contra bloquear el
event loop — node:sqlite es síncrono) y `aplicarLote(ids, fn)` — el corazón
del patrón: **una transacción POR ÍTEM dentro del loop, nunca una
envolvente**. Es la única estructura compatible con "aplicar los que pasan":
un `ROLLBACK` que abarcara el lote entero se llevaría puestos los ítems ya
aplicados, y `withTransaction` (`db/index.js`) no es reentrante — anidar no
era una opción. Verificado en vivo (no solo por lectura) que tras un ítem
fallido el loop sigue vivo: un `PATCH` singular normal corrido justo después
de un fallo del bulk funciona sin problema.

- **`aplicarEdicionProducto(req, id, cambios, totalLote)`** — extraída del
  `PATCH /api/productos/:id` (mismo patrón ya usado con `crearCompra`,
  `registrarCobro`, `crearGasto`). Recibe `cambios` **parcial**: una clave
  ausente significa "no tocar ese campo" (detectado con `hasOwnProperty`,
  nunca `!== undefined`, porque `null` es un valor legítimo acá —
  `categoria_id: null` = sin categoría, `stock_maximo: null` = sin tope).
  **Fusiona** la fila actual con `cambios` y valida el objeto fusionado con
  `validarProducto` sin duplicar ninguna regla — es lo que permite detectar
  invariantes cruzadas (pedir `stock_minimo` mayor al `stock_maximo` ya
  guardado, aunque el bulk no toque ese segundo campo). `precio_venta` puede
  venir como número (fijo) o `{modo:'porcentaje', valor:N}` (resuelto en el
  backend contra el precio actual de cada fila, con
  `Math.round(x*100)/100`). `CAMPOS_BULK_PRODUCTO` excluye `nombre`/`sku`
  (sin sentido en lote, y el SKU violaría UNIQUE) y `precio_costo` (promedio
  ponderado de compras, igual que ya excluía el singular).
  `POST /api/productos/bulk` valida el request, filtra `cambios` contra
  `CAMPOS_BULK_PRODUCTO` y corre `aplicarLote`.
- **`aplicarEstadoEnvioCompra(req, id, estadoEnvio, totalLote)`** — mismo
  molde, extraída de `PATCH /api/compras/:id/estado-envio`. Las 4 guardas de
  negocio (no existe, borrador, anulada, no retroceder desde recibido) van
  **antes** de abrir la transacción — lanzan sin nada que deshacer.
  Verificado que `aplicarStockCompra` **no abre transacción propia** (son
  `db.prepare().run()` pelados), así que el bulk puede envolverla con
  seguridad dentro de su transacción por-ítem.
  `POST /api/compras/bulk/estado-envio` recibe `{ids, estado_envio}` (sin
  `cambios`: es un único campo con enum cerrado).
- **Response, siempre 200 si el request es válido**:
  `{aplicados, fallidos:[{id,error}], resumen}`. Nunca 207 (es de WebDAV con
  cuerpo XML, y `res.ok` en el frontend ya es `true` para cualquier 2xx, así
  que no cambiaría nada). Nunca un 4xx para éxito parcial: `manejarError`
  abortaría el flujo mostrando error aunque la mayoría se haya aplicado bien.
  Los mensajes de `fallidos` son los mismos strings que devolvería el
  endpoint singular.
- **Auditoría**: una fila por entidad afectada (nunca una por lote — si no,
  sería imposible responder "¿qué le pasó al producto 45?" desde el índice
  `idx_auditoria_entidad`). Si no hubo cambio real (`diffCampos` devuelve
  `null`), no se escribe fila — mismo criterio que el singular, alimenta el
  contador `resumen.sin_cambios`. El `detalle` menciona el lote
  (`"... (edición en lote de N)"`) cuando `totalLote > 1`.

### Frontend (`frontend/index.html`, `frontend/js/app.js`, `frontend/css/styles.css`)

Dos modales nuevos, **HTML estático** junto a `#modalProducto` (tienen que
estar en el DOM al cargar el script: el `MutationObserver` de accesibilidad
de foco/Escape/Tab hace `querySelectorAll(".modal")` una sola vez al
arrancar, y un modal inyectado en runtime no quedaría enganchado).

- **`#modalBulkProductos`** — la sutileza central de un bulk edit es
  distinguir "no tocar este campo" de "ponerlo en un valor", y en este
  dominio el vacío ya significa algo (`stock_maximo` vacío = sin tope). Se
  resolvió con **un checkbox de activación por campo**: cada input arranca
  `disabled` de verdad (no solo visual — así no viaja en el form ni engaña a
  un lector de pantalla) y se habilita al tildar su checkbox
  (`armarCambiosBulk` solo agrega al request las claves con el checkbox
  tildado). Precio de venta con `<select>` de modo (porcentaje/fijo).
- **`#modalBulkEstadoEnvio`** — un solo `<select>` con `ESTADOS_ENVIO`
  (reusa `ENVIO_LABEL` que ya existía). Confirmación **obligatoria**
  (`destructivo: true`) al marcar como "recibido": suma stock y recalcula
  costo, es irreversible por diseño.
- **`mostrarResultadoBulk(resultado, {bloque, titulo, lista, etiquetar})`**
  — compartida entre los dos modales (mismo shape de response). Sin fallos:
  cierra el modal, limpia la selección de la tabla, toast "ok". **Con
  fallos: el modal NO se cierra** — un toast de 4200ms es el vehículo
  equivocado para "estos 3 fallaron y por qué". Se revela un bloque
  `#bulkXResultado` con el conteo y un `<li>` por fallo con el motivo real
  (nombre del producto/número de compra, no el id pelado). **Los ids que
  fallaron quedan en la variable de estado del modal, y el botón pasa a
  "Reintentar con N..."** — la selección real de la tabla (`selProductos`/
  `selCompras`) no se toca, así que la barra sigue mostrando el total
  original; el usuario puede corregir el campo y volver a apretar el mismo
  botón para reintentar solo sobre el subconjunto que falló, sin tener que
  volver a seleccionar nada a mano. Verificado en vivo con Playwright — es
  la propiedad de UX más importante del diseño y no era evidente por
  lectura de código que iba a salir bien.
- **`poblarSelectCategorias` generalizada** (aceptaba un selector
  hardcodeado a `#formProducto`) para poder llenar también el select de
  categoría del modal bulk — si se hubiera olvidado, ese select habría
  quedado vacío en silencio.
- Guardado de una copia propia de los ids al abrir cada modal
  (`bulkProductosIds`/`bulkComprasIds`), no releída de `sel.ids` en el
  submit: si el usuario deja el modal abierto y algo re-renderiza la tabla,
  `sincronizar()` podría podar la selección bajo sus pies.
- **CSS**: `#modalBulkProductos`/`#modalBulkEstadoEnvio` usan `class="modal"`
  y heredan `.modal[hidden]` ya existente, sin regla propia. Pero
  `.bulk-campo` y `.bulk-resultado` sí necesitaron su propio
  `[hidden] { display: none }` explícito — mismo bug documentado ya dos
  veces en el archivo (una clase con `display` propio le gana en
  especificidad al `[hidden]` del navegador).

### Verificación hecha

Metodología de siempre: copia aislada al scratchpad (puerto **3002**, nunca
el 3000 real), usuario de prueba propio (`test_qa`/admin) insertado a mano
con el mismo `scryptSync` de `server.js` (la copia no tenía la contraseña
real). Datos sembrados a mano para cubrir los casos límite: un producto con
`stock_maximo` bajo (para la invariante cruzada), uno con precio decimal
(para el redondeo), una compra en borrador, una anulada, y dos compras
activas del mismo producto (para el caso de costo promedio dependiente del
orden).

- **Regresión de los endpoints singulares, antes y después del refactor**:
  los 4 mensajes de error de `PATCH /api/productos/:id` y los 5 caminos de
  `PATCH /api/compras/:id/estado-envio` comparados carácter a carácter — sin
  diferencias.
- **~20 casos hostiles por `curl`** contra `/api/productos/bulk`: `ids`
  vacío/ausente/mal tipado (siempre 400 claro, nunca 500), 600 ids (400 por
  `LIMITE_BULK`), ids duplicados `[7,7,7]` (una sola fila de auditoría, no
  tres), id inexistente (fallido con "Producto no encontrado."), `cambios`
  vacío o solo con campos fuera de scope (`nombre`, `precio_costo` — 400 "No
  indicaste ningún cambio.", y **confirmado en la base que `precio_costo` no
  cambió**), **el caso central**: `stock_minimo` sobre 3 ids donde uno tiene
  `stock_maximo` más bajo — los otros dos se aplicaron, ese falló con el
  mensaje exacto, y **la base confirma que el que falló quedó sin tocar**;
  justo después, un `PATCH` singular normal funcionó (sin transacción
  colgada). `categoria_id`/`stock_maximo` en `null` aplican y dejan NULL.
  Ajuste porcentual del 10% sobre 1234.56 dio exactamente 1358.02 (no
  1358.0160000000001). Porcentaje de -200% falló con el mensaje de
  `validarProducto`. Reaplicar un valor ya vigente dio `sin_cambios` **sin
  sumar fila de auditoría**. Sin cookie de sesión → 401.
- **Compras por `curl`**: lote mixto de 4 (una válida en `en_camino`, una
  borrador, una anulada, una válida en `pedido`) → `recibido` dio
  exactamente 2 aplicados y 2 fallidos con motivos distintos. Dos compras
  del mismo producto en un lote → ambas recibidas, **2 movimientos de stock
  sin duplicar**, `precio_costo` final coincidente con recibirlas de a una
  en el mismo orden ($500×10 + $600×5 ⁄ 15 = $533,33). Reenviar el mismo
  lote → todo `sin_cambios`, sin sumar movimientos. Estado inválido → 400
  antes de tocar la base.
- **Frontend con Playwright** (tres scripts, 30 checks en verde, cero
  errores de consola en cualquier corrida): inputs que arrancan `disabled`
  y solo se habilitan al tildar su checkbox (y vuelven a deshabilitarse al
  destildar); submit sin ningún checkbox no dispara request de red;
  intercepción del body real confirmando que solo viaja la clave tildada;
  `getComputedStyle(...).display === "none"` real con `hidden` puesto (no
  solo el atributo) para el modal y para el bloque de resultado; **el caso
  mixto real**: 2 productos seleccionados, uno falla — el modal no se
  cierra, "1 aplicado · 1 falló" con el nombre del producto y el motivo
  legible, la barra de selección sigue en "2 seleccionadas", el botón pasa a
  "Reintentar con 1 producto"; Compras: confirmación destructiva obligatoria
  con el texto de irreversibilidad antes de marcar como recibido, modal se
  cierra tras éxito limpio; regresión de alta/edición individual de
  productos sin cambios de comportamiento.
- Sintaxis (`node --check`) limpia en `server.js` y `app.js`. HTML sin ids
  duplicados (412 ids, todos únicos). CSS con llaves balanceadas (325/325).
- **No se reinició el proceso real del 3000** — a diferencia de §19/§20,
  esta etapa sí toca el backend, así que **hace falta reiniciarlo** para que
  los cambios vivan ahí (a diferencia de las últimas dos etapas, que eran
  frontend puro sin build step). Pendiente para cuando el usuario lo pida.

### Qué queda pendiente

- **Sin commitear**, junto con §19 y §20 (backend y frontend). Confirmar con
  el usuario cuándo conviene cortar el commit — se acumulan tres etapas
  seguidas sin commitear.
- Ninguna otra entidad tiene bulk edit todavía. Si se pide extender, el
  patrón (`ErrorBulk`, `idsDeLote`, `aplicarLote`) ya está listo para
  reusarse — lo específico de cada entidad es la función `aplicarEdicionX`
  y el modal.
- `GEMINI_API_KEY` sigue sin cargar en el proceso real (sin cambios, arrastra
  de etapas anteriores).

**Actualización**: el proceso real del 3000 **ya se reinició** con este
código, a pedido del usuario ("sii reincialo asi lo verifico desde
localhost") — ver §22 más abajo para el detalle de esa operación (backup,
verificación de conteo de filas, confirmación de la ruta nueva respondiendo
ahí). No quedó pendiente.

## 22. Última etapa: reportes de compras + "Resumen" → "Estadísticas"

**El pedido**: seguir sumando funciones (mismo patrón de sesión que las
etapas anteriores). Se le preguntó al usuario con `AskUserQuestion` entre
cuatro opciones (listas de precios, reportes de compras, más edición
masiva, marca/unidad de medida) y eligió **reportes de compras** —
CLAUDE.md §20 pide cuatro familias de reportes (ventas, compras, stock,
finanzas) y compras era la única que faltaba.

Al preguntar dónde debía vivir en el nav, el usuario pidió algo más amplio:
**renombrar "Resumen" a "Estadísticas"**, con el resultado del negocio
arriba y reportes debajo a medida que se baja la página. Acotado con una
segunda ronda de `AskUserQuestion`: **solo compras entra a esa pantalla por
ahora** (Reportes de stock queda como vista de nav propia, sin tocar —
consolidarla también es una decisión para otra sesión), compartiendo el
**mismo filtro de fecha** que ya usaba "Qué se vende"
(`#filtrosResumen`/`rangoActualResumen()`), no uno propio.

Es una etapa **de solo lectura, sin migración**: no se tocó `schema.sql` ni
`db/index.js`. `compra_items.costo_real_unitario` ya trae el envío
prorrateado (se resuelve al crear la compra), así que el reporte suma
directo sin recalcular nada — mismo criterio no negociable que
`venta_items.costo_unitario_historico` en el reporte de ventas.

### Backend (`backend/server.js`)

Sección nueva `/* ---------- Reportes: compras (CLAUDE.md §20) ---------- */`,
espejo exacto de "Reportes: qué se vende y a quién" (misma sesión de trabajo
que la construyó, etapa anterior a §19), del lado de compras:

- Queries `SQL_REPORTE_COMPRAS_POR_PROVEEDOR/PRODUCTO/CATEGORIA` — mismo
  patrón que las de ventas (`compras.estado = 'activa'`, agrupado por
  `compras.proveedor_id` / `compra_items.producto_id` /
  `productos.categoria_id` vía `LEFT JOIN` + `COALESCE(..., 'Sin
  categoría')`).
- **Devoluciones a proveedor netean el reporte**, igual que las devoluciones
  de venta netean el de ventas: `SQL_REPORTE_DEVOLUCIONES_PROVEEDOR_POR_*`
  contra `devoluciones_proveedor`/`devolucion_proveedor_items`. A
  diferencia de las devoluciones de venta (que tienen un flag
  `vuelve_stock` condicional), **toda devolución a proveedor saca stock
  siempre** — confirmado leyendo `aplicarDevolucionProveedor`, sin
  `CASE WHEN` en la resta.
- `netearComprasPorId` — adaptador propio en vez de reusar `netearPorId` tal
  cual: esta última resta las claves `ventas`/`costo`, y las queries de
  compras usan la clave `compras` (no hay "costo de comprar" del lado de
  compras, es la ganancia la que no aplica acá). Se prefirió un adaptador
  chico antes que acoplar `netearPorId` a un nombre de campo distinto — esa
  función ya la usa el reporte de ventas tal cual.
- **Sin equivalente a `calcularResultado`**: los totales de plata
  (`compras_netas`) se recalculan sumando las filas por-proveedor ya
  neteadas, no con una query aparte — así el total y el desglose por
  proveedor cierran exacto por construcción (verificado con curl: suma de
  `productos`/`categorias`/`proveedores` da exactamente `compras_netas` en
  los tres casos).
- `GET /api/reportes/compras`, mismo tratamiento de rango que
  `/api/reportes/ventas` (`validarFecha`, rango abierto acotado a la
  primera/última operación real). Response:
  `{rango, totales:{compras_netas, cantidad_compras, ticket_promedio,
  unidades}, proveedores, productos, categorias}` — sin `ganancia`/
  `margen_pct` en `productos`/`categorias` (no aplica del lado de compras).

**Cambio compartido, confirmado con el usuario antes de tocarlo**
(`AskUserQuestion`): `SQL_LIMITES_OPERACIONES` (`server.js`, cerca de línea
4816) hacía `UNION ALL` de `ventas`/`gastos`/`devoluciones` para calcular el
"rango abierto por defecto" — **no incluía `compras` ni
`devoluciones_proveedor`**. Un negocio con compras anteriores a su primera
venta hubiera visto el reporte de compras arrancar el rango tarde y
perderlas en silencio. Se amplió con esas dos tablas. **Efecto colateral
correcto y esperado**: también amplía el rango por defecto de
`/api/resumen/evolucion` y `/api/reportes/ventas`, que ya usaban la misma
query preparada — verificado con curl que sus responses siguen bien
formados después del cambio (sin diferencia visible con los datos de
prueba, que ya tenían ventas más tempranas que las compras).

### Frontend (`frontend/index.html`, `frontend/js/app.js`)

- **Nav**: la entrada 01 pasó de "Resumen" a "Estadísticas"
  (`index.html:58-60`). Se dejó **sin tocar** el atributo interno
  `data-view="dashboard"` — renombrarlo hubiera obligado a tocar cada
  `mostrarVista("dashboard")` del código sin ganar nada; solo cambia la
  etiqueta visible del nav. Confirmado que no hay otro lugar del HTML/JS que
  mostrara el texto "Resumen" (ni un `<h1>` propio dentro de la sección, ni
  referencias en `app.js` más allá del id interno).
- Bloque `<h2>Qué se compra</h2>` agregado **después** de "Mejores
  clientes" (dentro de la misma `<section class="view"
  data-view="dashboard">`), mismo molde exacto que "Qué se vende": un
  `ledger-strip` de 4 KPIs (compras netas, ticket promedio, unidades
  compradas, cantidad de compras) + 3 `<section class="panel">` con
  `<table class="ledger-table">` (proveedores, productos, categorías), cada
  `<th>` con `data-orden`/`data-tipo` para que `crearOrden` funcione gratis
  sin código adicional.
- `renderReporteComprasProveedores/Productos/Categorias` +
  `cargarReporteCompras()` — mismo patrón que sus pares de ventas
  (`filaVacia`, `data-label` por columna para mobile, `tablaCargando` antes
  del fetch). El link de proveedor reusa `abrirFichaProveedor` (ya existía,
  usado por la ficha manual de Proveedores) — mismo patrón que
  `abrirFichaCliente` en "Mejores clientes".
- Tres `crearOrden` nuevas (`ordenReporteComprasProveedores/Productos/Categorias`).
- **`cargarPanelResumen()` pasó a disparar los tres fetch en paralelo**:
  `Promise.all([cargarResumen(), cargarReporteVentas(), cargarReporteCompras()])`
  — único punto de enganche real, ya cuelga de `#filtrosResumen`, así que
  cambiar el filtro de fecha refresca ventas y compras a la vez sin código
  adicional.
- No hizo falta tocar `crearFiltros`, `rangoDeFiltroFecha`, `crearOrden`,
  `tablaCargando` ni `filaVacia`: se reusaron tal cual, ya eran genéricos.

### Verificación hecha

Metodología de siempre: copia aislada al scratchpad, servidor de prueba en
el **3002**, usuario de prueba propio (`test_qa`/admin, ya existía de la
etapa anterior). Se sembró además una **devolución a proveedor real**
(vía `POST /api/devoluciones-proveedor`, no SQL directo) para poder probar
el neteo de punta a punta.

- **Backend por curl**: sin rango (acota bien a la compra más vieja real,
  `acotado:false`); rango explícito; rango sin compras (fecha futura, arrays
  vacíos y totales en 0, **sin error**); **sumas cruzadas exactas**: suma de
  `productos.compras`, `categorias.compras` y `proveedores.compras` dan
  las tres, por separado, el mismo número que `totales.compras_netas`
  ($709.000 antes de la devolución de prueba); suma de `participacion_pct`
  de todas las categorías da exactamente 100. Tras registrar la devolución
  de 1 unidad de "Asad bourbon" (compra #3, proveedor Paraguaya): el total
  bajó de $709.000 a $689.000, las unidades de 37 a 36, el producto y el
  proveedor correctos bajaron su monto exacto — verificado número a número,
  no solo que "algo cambió".
- **Regresión de `SQL_LIMITES_OPERACIONES` ampliada**: `/api/resumen` y
  `/api/reportes/ventas` siguen respondiendo bien formados después del
  cambio compartido.
- **Frontend con Playwright** (dos scripts, 14 checks en verde, 0 errores de
  consola): nav dice "Estadísticas" y ya no dice "Resumen"; el bloque "Qué
  se compra" aparece con sus KPIs poblados; la tabla de proveedores tiene
  filas y el link de proveedor navega a la ficha real
  (`data-view="proveedor-detalle"`, con el nombre correcto cargado);
  ordenar por la columna "Unidades" cambia el orden de las filas sin
  vaciarlas; **regresión de "Qué se vende"**: sigue con su KPI poblado y su
  tabla de productos con filas, confirmando que agregar el tercer fetch al
  `Promise.all` de `cargarPanelResumen` no rompió nada; mobile 375px sin
  desborde horizontal (`scrollWidth === clientWidth`) con el bloque de
  compras sumado a la página.
- Sintaxis (`node --check`) limpia en `server.js` y `app.js`. HTML sin ids
  duplicados (419 ids, todos únicos).
- **Deploy al proceso real del 3000**: a pedido explícito del usuario
  ("sii reincialo asi lo verifico desde localhost"). Backup
  `nexo.db.backup-antes-bulk-edit-20260902-161157` (nombre heredado de
  cuando se armó el backup, que fue antes de esta etapa de reportes
  también — cubre ambas). Proceso identificado y detenido por PID exacto
  (`Get-NetTCPConnection -LocalPort 3000`, nunca por nombre `node`
  genérico), reiniciado con el mismo comando de siempre
  (`node --experimental-sqlite server.js`). **Conteo de filas de las 12
  tablas principales comparado 1:1 pre/post-reinicio: sin diferencias.**
  Confirmado que `POST /api/productos/bulk` (de §21, la etapa anterior)
  responde 401 en el proceso real (no 404) — la ruta existe, solo falta
  sesión. Esta etapa de reportes de compras se implementó y verificó
  **después** de ese reinicio, contra la copia de scratchpad como siempre
  — el código de reportes de compras todavía no está en el proceso real,
  ver pendientes.

### Qué queda pendiente

- **Sin commitear**, se sigue acumulando con §19/§20/§21.
- **El proceso real del 3000 todavía no tiene el código de esta etapa**
  (reportes de compras + rename a "Estadísticas") — sí tiene ya el de §21
  (bulk edit), reiniciado durante esta misma sesión. Falta un segundo
  reinicio (con backup nuevo) para que `/api/reportes/compras` responda ahí
  y el nav muestre "Estadísticas".
- **Reportes de stock sigue siendo una vista de nav aparte** — la
  consolidación completa (moverla también a Estadísticas) quedó
  explícitamente fuera de esta etapa, a decisión del usuario. Si se retoma,
  el molde ya está probado dos veces (ventas, ahora compras).
- `GEMINI_API_KEY` sigue sin cargar en el proceso real (sin cambios,
  arrastra de varias etapas atrás).

## 23. Última etapa: listas de precios (CLAUDE.md §18)

**Etapa 0 de esta sesión**: antes de tocar código nuevo se commitearon las
cuatro etapas que venían acumuladas sin commitear (§19–§22: comprobantes
imprimibles, selección múltiple en lote, edición masiva, reportes de
compras + rename a "Estadísticas") en una rama nueva
`feature/reportes-compras-estadisticas` (commit `0e984df`), y se reinició
el proceso real del 3000 con ese código antes de empezar. `main` no se
tocó — sigue en `5a03436`, no era parte de lo pedido.

**El pedido**: seguir sumando funciones. Se preguntó con `AskUserQuestion`
entre cuatro opciones (listas de precios, marca/unidad de medida,
consolidar reportes de stock, vencimientos/aging de CC) y el usuario
eligió **listas de precios** — la pieza de negocio más grande que faltaba
de §18: hoy un producto tenía un único `precio_venta`, sin poder vender lo
mismo a precio minorista/mayorista/tarjeta.

**Bug de comportamiento arreglado de paso, a propósito**: antes de esta
etapa, registrar o editar una venta hacía `UPDATE productos SET
precio_venta = ?` con el precio de esa venta puntual (`crearVenta` y el
`PUT /api/ventas/:id`, en `server.js`). Con una sola lista ya era
discutible; con varias hubiera sido un bug real — venderle a un mayorista
a un precio más bajo habría pisado en silencio el precio minorista de
todo el catálogo. Confirmado con el usuario (`AskUserQuestion`) y sacado:
**una venta ya NO modifica el precio de ningún producto**, en ningún
punto. Verificado explícitamente por curl: vender a un precio distinto al
de la ficha deja `precio_venta` intacto.

Decisiones de negocio confirmadas con el usuario antes de programar
(cuatro rondas de `AskUserQuestion`, todas con la opción recomendada
elegida):
- Precio **fijo por producto y lista** (no porcentajes globales por
  lista). Sin precio propio cargado, cae al precio base del producto.
- El **cliente tiene una lista habitual** en su ficha; Venta/Presupuesto
  la proponen sola al elegirlo, editable para esa operación puntual.
- **Se guarda `lista_precio_id`** en `ventas` y `presupuestos`
  (trazabilidad, §8/§22 — de dónde salió el precio de esa operación).
- El precio que ya tenía cada producto **pasó a ser el de la lista
  predeterminada** (creada como "Minorista" en la migración) — no cambió
  ningún número.
- Remarcación masiva **incluida**, reusando el modal de edición en lote
  de Productos que ya sabía ajustar por porcentaje.

### Migración (aditiva, sin tocar ningún dato existente)

- `backend/db/schema.sql` — dos tablas nuevas: `listas_precios` (`nombre`
  UNIQUE, `activa`, `es_predeterminada` — la consistencia de "exactamente
  una marcada" la garantiza el backend, no un constraint SQL) y
  `producto_precios` (`producto_id`, `lista_precio_id`, `precio`, con
  índice único `idx_producto_precios_unico` sobre el par). Ubicadas entre
  `categorias` y `productos`/`proveedores` en el archivo, por relación.
- `backend/db/index.js` — tres columnas nuevas nullable (mismo patrón
  `PRAGMA table_info` + `ALTER TABLE` de siempre): `clientes.lista_precio_id`,
  `ventas.lista_precio_id`, `presupuestos.lista_precio_id`. NULL significa
  "la predeterminada de ese momento", no un id fijo — así si el día de
  mañana cambia cuál lista es la predeterminada, lo que dependía de NULL
  la sigue sola.
- **Tercer rebuild de la tabla `auditoria`** (mismo procedimiento ya usado
  dos veces antes, para `usuario` y `organizacion`): se sumó `'lista_precio'`
  al `CHECK` de `entidad`, porque SQLite no permite alterar un `CHECK` con
  `ALTER TABLE`. Índices recreados a mano dentro de la misma transacción.
- **Seed + backfill**, junto al de `cuentas_tesoreria`/`organizaciones`: si
  `listas_precios` está vacía, se crea "Minorista" como predeterminada y
  se copia el `precio_venta` de cada producto a `producto_precios` en esa
  lista — así el número que el negocio ya tenía queda exactamente igual,
  solo que ahora también vive como fila de la tabla nueva.
  `productos.precio_venta` **se conserva** (no se borró): sigue siendo el
  precio de la lista predeterminada y el fallback para cualquier lista sin
  precio propio cargado.
- Verificado (copia de scratchpad, puerto 3002): diff de todas las tablas
  pre/post sin diferencias salvo lo nuevo; idempotencia probada
  reimportando `db/index.js` en un proceso fresco dos veces seguidas, sin
  duplicar filas ni romper nada; aplicada después también contra la base
  real, con el mismo resultado (ver "Deploy" más abajo).

### Backend (`backend/server.js`)

- **Maestro de listas**, sección nueva junto a "Categorías de productos":
  `GET/POST/PATCH /api/listas-precios`, calcado de categorías (nombre
  vacío, nombre duplicado, baja lógica vía `activa`), más dos reglas
  propias: la predeterminada no se puede desactivar ni desmarcar
  directamente (400 con mensaje claro), y marcar una lista distinta como
  predeterminada desmarca la anterior dentro de la misma transacción —
  nunca hay un instante con dos marcadas o con cero.
- **Precios por producto**: `obtenerPreciosPorProducto()` arma un mapa
  `producto_id -> {lista_precio_id: precio}` con un segundo query (no un
  pivot SQL dinámico), y `decorarProducto` lo adjunta como `precios` en
  cada producto de `GET /api/productos`.
- `aplicarEdicionProducto` (el punto único de edición, usado por PATCH
  singular y por bulk) acepta un campo `precios` opcional —
  `{lista_id: valor}`, cada valor un número fijo o
  `{modo:'porcentaje', valor:N}` calculado sobre el precio ACTUAL de esa
  lista puntual (con fallback a `precio_venta` si el producto todavía no
  tiene precio propio ahí) — y hace un
  `INSERT ... ON CONFLICT(producto_id, lista_precio_id) DO UPDATE`. Si el
  pedido tocó el precio de la lista **predeterminada**, también sincroniza
  `productos.precio_venta` — son la misma cosa vista desde dos lugares y
  no pueden desincronizarse. `CAMPOS_BULK_PRODUCTO` suma `precios`.
- **Ventas y presupuestos**: `crearVenta`, `PUT /api/ventas/:id`,
  `POST/PUT /api/presupuestos` validan y persisten `lista_precio_id`
  (nullable, valida que exista si viene). Al convertir un presupuesto, la
  venta hereda su `lista_precio_id`. Los dos `UPDATE productos SET
  precio_venta` de crear/editar venta se **eliminaron** (ver el bug de
  arriba).
- **Clientes**: `POST/PATCH /api/clientes` aceptan `lista_precio_id`
  (nullable, valida existencia). `GET` ya lo expone gratis vía
  `clientes.*`.
- **Lección de esta etapa** (bug propio, encontrado y arreglado antes de
  desplegar): la validación de `lista_precio_id` en `crearVenta` al
  principio lanzaba `new Error(...)` en vez de `new ErrorBulk(...)` — como
  `mensajeDeError` (el traductor de errores a JSON) **relanza** cualquier
  error que no reconoce, ese `Error` genérico escapaba del `try/catch` de
  `POST /api/ventas` y llegaba crudo al handler default de Express (HTML
  de stack trace en vez de un 400 limpio). El status code igual salía bien
  (400), así que el bug solo se notó mirando el *body* de la respuesta, no
  el código. Corregido usando `ErrorBulk`, la clase que ya existe
  justamente para esto. **Para la próxima vez**: cualquier `throw` nuevo
  dentro de una función que pueda llamarse desde un endpoint que pasa por
  `mensajeDeError` tiene que ser `ErrorBulk`, nunca `Error` a secas.

### Frontend (`frontend/index.html`, `frontend/js/app.js`)

- **Modal de gestión de listas** (`#modalListasPrecios`), calcado del de
  categorías de productos: form inline con `id` oculto (alta y edición en
  el mismo formulario) + tabla con columna "Predeterminada" (un botón
  "Marcar" en vez de un radio, para no tener que mandar un PATCH por fila
  al cambiar cuál es la predeterminada). Botón "Listas de precios" en el
  header de Productos, al lado de "Categorías".
- **Desviación decidida durante la implementación, confirmada con el
  usuario (`AskUserQuestion`)**: el plan original pedía una columna por
  lista en la tabla de Productos. Se encontró que `crearOrden` (el
  ordenamiento de columnas, compartido por todas las tablas del sistema)
  engancha sus listeners a los `<th>` **una sola vez**, al bootear la
  página — antes de que `/api/listas-precios` termine de responder.
  Generar ahí columnas dinámicas de verdad hubiera obligado a reescribir
  el arranque de esa infraestructura compartida, con riesgo sobre el
  orden guardado de columnas de otras pantallas. Se optó por: la tabla de
  Productos **sigue con una sola columna "Precio"** (la de la lista
  predeterminada, sin cambios visuales), y el **modal de producto** es
  donde se cargan/editan los precios de TODAS las listas — un input por
  cada lista activa que no sea la predeterminada, generado en runtime
  (`poblarPreciosPorLista`) solo en edición (un producto recién creado
  todavía no tiene id contra el cual guardar `producto_precios`, mismo
  criterio que ya usa el costo: "se completa después").
- **Modal de edición en lote de Productos**: el bloque de precio suma un
  `<select name="precio_lista_id">` ("sobre qué lista aplicar"). Si es la
  predeterminada, el ajuste viaja como `cambios.precio_venta` (como
  siempre); si es otra lista, viaja como `cambios.precios[id]` — misma
  distinción que ya hace el backend.
- **Venta y Presupuesto**: selector `<select name="lista_precio_id">` en
  cada modal. Se propone sola al elegir un cliente con lista habitual
  (o queda en la predeterminada); cambiarla con ítems ya cargados
  **repropone** sus precios (`reproponerPreciosPorLista`) — pero solo en
  los renglones cuyo precio actual coincide con algún precio conocido del
  producto, para no pisar un descuento negociado a mano. Avisa cuántos
  precios cambió (`avisar(...)`), nunca en silencio.
  `agregarFilaItemVenta` (los 9 sitios que la llaman no se tocaron: la
  función busca la lista elegida sola, vía `listaPrecioDelFormulario`,
  buscando el `<select>` dentro del mismo `<form>` que su contenedor de
  ítems) sugiere `precioProductoEnLista(producto, listaId)` en vez de
  `producto.precio_venta` directo.
- **Ficha de cliente**: campo "Lista de precios habitual"
  (`poblarSelectListasPrecios` con opción explícita "Usar la
  predeterminada" = NULL).

### Verificación hecha antes de desplegar

- Metodología de siempre: copia aislada al scratchpad, servidor de prueba
  en el **3002** (usuario de prueba con password reseteada directo en la
  copia — la real no se tocó), proceso del 3000 sin tocar hasta tener todo
  verde.
- **Backend por curl, número a número**: alta/edición de listas; intentar
  quitarle `es_predeterminada` a la única marcada (400); intentar
  desactivarla (400); marcar otra como predeterminada (la vieja se
  desmarca sola, siempre exactamente una marcada en ambos sentidos);
  cargar un precio en una lista no predeterminada (no toca `precio_venta`
  ni la otra lista); cargar el precio de la predeterminada vía `precios`
  (sí sincroniza `precio_venta`); ajuste porcentual sobre una lista
  puntual (75000 +10% = 82500, verificado exacto); **venta a un precio
  distinto del de la ficha — `precio_venta` quedó intacto** (la regresión
  que esta etapa vino a arreglar); presupuesto convertido a venta hereda
  la lista; bulk +20% sobre una lista puntual en 2 productos (valores
  exactos verificados, el resto del catálogo sin tocar); precio negativo
  rechazado (400); `lista_precio_id` inexistente en venta/cliente
  rechazado con JSON limpio (400, después de arreglar el bug de
  `ErrorBulk` de arriba).
- **Idempotencia**: reimportar `db/index.js` en un proceso nuevo, dos
  veces, sobre una base que ya tenía datos de negocio cargados durante la
  prueba (no solo la base vacía inicial) — sin duplicar ninguna fila.
- **Frontend con Playwright** (headless, claro y oscuro, 1280px y mobile
  375px): **32/32 checks en verde**. Modal de listas abre/lista/crea;
  modal de producto muestra los campos de precio por lista; guardar un
  precio de lista no rompe nada; selector de lista en Venta con las 3
  listas activas; el precio sugerido de un ítem cambia al cambiar de
  lista (55000 → 66000, verificado con el valor real); selector de lista
  habitual en el modal de Cliente; regresión de la etapa anterior
  (Estadísticas + "Qué se compra" siguen poblando); sin scroll horizontal
  en mobile. El único "error de consola" capturado fue un 400 esperado
  (el test de tema oscuro repitió el nombre de una lista ya creada por el
  test de tema claro — la validación de duplicados funcionando, no un
  bug).
- Sintaxis (`node --check`) limpia en `server.js` y `app.js` después de
  cada cambio.
- **Deploy**: Etapa 0 primero (ver arriba). Backup
  `nexo.db.backup-antes-listas-precios-20260903-082559` en `backend/db/`,
  proceso identificado y detenido por **PID exacto**
  (`Get-NetTCPConnection -LocalPort 3000`), reiniciado con
  `node --experimental-sqlite server.js`. **Row counts de las 6 tablas
  principales comparados 1:1 pre/post-migración: sin diferencias**, y los
  tres `precio_venta` de los productos reales quedaron con el mismo valor
  exacto que tenían antes. `producto_precios` quedó con una fila por
  producto en la lista Minorista, con esos mismos valores. El endpoint
  nuevo (`/api/listas-precios`) respondió 401 contra el proceso real (no
  404: la ruta existe, solo falta sesión) y el HTML sirve el botón "Listas
  de precios" nuevo.

### Qué queda pendiente

- **Sin commitear** — la rama activa sigue siendo
  `feature/reportes-compras-estadisticas` (con el commit `0e984df` de la
  Etapa 0). Falta decidir con el usuario si esta etapa va a esa misma
  rama/PR o a una propia, y commitear.
- El **alta de producto nuevo** (`POST /api/productos`) no acepta
  `precios` todavía — nace solo con el precio de la lista predeterminada
  (`precio_venta`), igual que ya pasa con el costo. Cargar precios de
  otras listas es una edición posterior, una vez que el producto ya tiene
  id. No se consideró una limitación real (mismo patrón que costo), pero
  vale mencionarlo si en el futuro se pide poder cargar todo de una.
- `GEMINI_API_KEY` sigue sin cargar en el proceso real (sin cambios,
  arrastra de varias etapas atrás).

## 24. Última etapa: multidepósito (CLAUDE.md §19)

**El pedido**: seguir sumando funciones. Se preguntó con `AskUserQuestion`
entre cuatro opciones (multidepósito, vencimientos/aging de CC, marca y
unidad de medida, notas de débito) y el usuario eligió **multidepósito** —
la brecha arquitectónica más grande que quedaba de `CLAUDE.md`: §5 dice
textualmente "el stock debe manejarse por producto y depósito, no asumir
que un producto tiene un único stock global", y hasta esta etapa Nexo lo
asumía.

**Etapa 0**: se commiteó primero la etapa de listas de precios (§23) que
venía desplegada sin commitear desde la sesión anterior (commit `0802c2d`,
en la misma rama `feature/reportes-compras-estadisticas`), para que el
diff de esta etapa viniera limpio.

**Lo que hizo la etapa viable**: el stock ya era un *ledger append-only* —
no existe `productos.stock_actual`, todo se deriva de `movimientos_stock`
vía la VIEW `stock_actual`, y las reversiones (anular/editar/restaurar)
insertan movimientos contrarios en vez de borrar filas. Agregar
`deposito_id` al ledger y agrupar por `(producto_id, deposito_id)` dio
stock por depósito sin reescribir la lógica de ninguna operación.

**Decisiones de negocio confirmadas con el usuario antes de programar**
(tres rondas de `AskUserQuestion`, las tres con la opción recomendada):
- `stock_minimo`/`stock_maximo` siguen siendo **globales por producto**
  (no por depósito); el semáforo compara contra el stock **total**.
- **Un depósito por operación**, no por renglón: Venta, Compra, Devolución
  y Dev. a proveedor llevan un único `deposito_id` en la cabecera.
- Si falta stock en el depósito elegido, Nexo **bloquea y avisa dónde sí
  hay** stock — nunca transfiere solo (moverlo sin que nadie lo haya
  movido físicamente haría que el sistema mienta sobre dónde están las
  cosas).

### Migración (aditiva)

- `backend/db/schema.sql`: tabla nueva `depositos` (junto a
  `listas_precios`, mismo molde — "exactamente uno predeterminado"
  garantizado por el backend); tabla nueva `transferencias` (cabecera de
  una transferencia entre depósitos); `movimientos_stock` gana
  `deposito_id` NOT NULL y `transferencia_id`, más `'transferencia'` en el
  CHECK de `origen`. **`stock_actual` se conserva tal cual** (total por
  producto) y se agregó una vista nueva `stock_por_deposito` — a
  propósito, no se le cambió el `GROUP BY` a `stock_actual`: hay 7 sitios
  en `server.js` que hacen `SELECT ... FROM stock_actual WHERE producto_id
  = ?` esperando una sola fila (costo promedio, semáforo); agruparla por
  dos columnas los habría roto en silencio (`.get()` tomando una fila al
  azar entre varias).
- **Bug propio encontrado y corregido durante la verificación**: el índice
  sobre `(producto_id, deposito_id)` y la vista `stock_por_deposito`
  **no pueden vivir en `schema.sql`** — en una base existente ese archivo
  corre primero, antes de que el rebuild de `index.js` agregue
  `deposito_id`, así que fallarían con "no such column". Se crean en
  `db/index.js`, **incondicionales con `IF NOT EXISTS`** después del
  bloque de rebuild (no solo adentro): en una base **fresca**,
  `schema.sql` ya crea `movimientos_stock` CON `deposito_id` desde el
  arranque, así que el guard del rebuild (`!sql.includes('deposito_id')`)
  da `false` y el bloque entero se saltea — sin el `IF NOT EXISTS` de
  afuera, una base nueva se hubiera quedado sin el índice ni la vista.
  Mismo motivo por el que `saldo_tesoreria` tampoco vive en `schema.sql`.
- `backend/db/index.js`: seed de `depositos` (crea "Depósito principal"
  como predeterminado si la tabla está vacía) ubicado **antes** del
  rebuild de `movimientos_stock` porque el backfill necesita su id; quinto
  rebuild de tabla del archivo (`movimientos_stock`, con
  `deposito_id`/`transferencia_id`/CHECK nuevo) — backfillea todo el
  historial al depósito principal, así el stock de cada producto queda
  exactamente igual que antes; `deposito_id` nullable agregado por ALTER a
  `ventas`, `compras`, `devoluciones`, `devoluciones_proveedor` (mismo
  criterio que `lista_precio_id`: NULL = "el predeterminado de ese
  momento", nunca un id copiado); **cuarto rebuild de `auditoria`**
  (`'deposito'` y `'transferencia'` sumados al CHECK de `entidad`).

### Backend (`backend/server.js`)

- **Refactor previo, antes de tocar nada de negocio**: los **14 INSERT
  literales** a `movimientos_stock` que había repartidos por el archivo
  (uno por cada operación que toca stock) se centralizaron en
  `registrarMovimientoStock({...})`. Es lo que evita tener que repetir
  esta cirugía la próxima vez que el ledger cambie, y hace que
  `deposito_id` sea imposible de olvidar en un sitio.
- **Maestro `/api/depositos`** (GET/POST/PATCH), calcado de
  `/api/listas-precios`: mismas dos reglas de "exactamente un
  predeterminado" (no se puede desmarcar ni desactivar directamente) más
  una propia — un depósito con stock cargado **no se puede desactivar**
  (400 explicando cuánto stock tiene), para no dejar mercadería escondida
  en un depósito invisible.
- **`/api/transferencias`** (GET, POST, `POST /:id/anular`): una
  transferencia es una operación propia (fila en `transferencias` + dos
  movimientos de stock que la referencian por `transferencia_id`), no dos
  ajustes sueltos — así es auditable y anulable. Anular inserta el par
  contrario, nunca borra filas.
- **`validarStockDisponible(items, depositoId)`** ahora recibe el depósito
  y valida contra `stock_por_deposito`; su mensaje de error suma **dónde sí
  hay stock** (`dondeHayStock`, nuevo helper) consultando las otras filas
  de esa vista para el mismo producto.
- **`crearVenta`/`crearCompra`** aceptan `deposito_id` (nullable, resuelto
  al predeterminado si no viene). Se tocaron también: editar/anular/
  restaurar venta, editar/anular/restaurar compra, `aplicarDevolucion`/
  `revertirDevolucion` (reingresan al depósito **de la venta original**,
  no a uno elegido), `aplicarDevolucionProveedor`/
  `revertirDevolucionProveedor` (salen del depósito **de la compra
  original**), conversión de presupuesto (usa el predeterminado, los
  presupuestos no llevan depósito propio) y `/api/asistente/ejecutar` (usa
  el predeterminado — el asistente todavía no interpreta depósito desde el
  texto, es una etapa aparte).
- **El costo promedio ponderado se dejó GLOBAL a propósito**
  (`aplicarStockCompra` sigue leyendo `stock_actual`, no
  `stock_por_deposito`): el costo es un atributo del producto, no de dónde
  está guardado físicamente — transferir mercadería entre depósitos no le
  cambia el costo. Verificado explícitamente por curl: transferir no mueve
  `precio_costo`.
- `GET /api/ventas/:id` y `GET /api/compras/:id` ahora exponen
  `deposito_id`/`deposito` (antes no lo hacían, hacía falta para que el
  frontend supiera qué preseleccionar al editar).
- `/api/stock` pasa a devolver **una fila por producto y depósito** (más
  `stock_total`, para el semáforo que sigue siendo global).
  `/api/movimientos-stock` suma `deposito_id`/`deposito` y ya no le faltan
  los movimientos de `devolucion_proveedor` (bug preexistente: antes cualquier
  origen sin mapear caía en "Ajuste manual" — con `transferencia` sumado
  ahora también, se corrigieron los dos casos de una).

### Frontend (`frontend/index.html`, `frontend/js/app.js`)

- **Modal `#modalDepositos`**, calcado de `#modalListasPrecios`: form
  inline con `id` oculto (alta/edición), tabla con columna
  "Predeterminado" y botón "Marcar". Botón "Depósitos" en el header de
  Stock.
- **Modal `#modalTransferenciaDeposito`** (producto/origen/destino/
  cantidad/nota) — nombre distinto de `#modalTransferencia`, que ya
  existía para transferencias **entre cuentas de tesorería** (cosas
  distintas, mismo concepto de nombre).
- **Vista Stock**: la tabla pasa de una fila por producto a una fila por
  producto+depósito, con columnas nuevas "Depósito" y "Stock total"; panel
  nuevo "Transferencias entre depósitos" (con acción Anular) entre la
  tabla de Stock y el Historial de movimientos.
- **`selStock` (la selección múltiple de la tabla) necesitó un `idDe`
  custom**: toma `producto_id` y `deposito_id` concatenados — con una fila
  por producto+depósito, `producto_id` solo dejó de ser único. El
  comentario que ya estaba en el código antes de esta etapa anticipaba
  exactamente este cambio.
- Selector de depósito nuevo en los modales de Venta, Compra y Ajuste de
  stock (`poblarSelectDepositos`, molde: `poblarSelectListasPrecios`),
  arrancando en el predeterminado; al editar una venta/compra respeta el
  depósito que ya tenía.
- `filtrosStock`/`filtrosStockMov` suman el filtro por depósito;
  `COLUMNAS_CSV_STOCK` suma depósito y stock total.

### Bug encontrado durante la verificación (de las pruebas, no del código)

El primer despliegue de prueba mostró "Dep?sito principal" en vez de
"Depósito principal" en el frontend. **No era un bug del código**: los 5
archivos tocados se verificaron como UTF-8 válido de punta a punta: el
problema era que un comando de bash de esta sesión (un `node -e` con el
nombre del depósito embebido en un heredoc, usado solo para poblar datos
de prueba) corrompió la tilde al pasar por Git Bash en Windows. Se
corrigió el dato de prueba a mano y se repitió la migración completa desde
cero contra una copia recién sacada de la base real (con `Copy-Item` de
PowerShell en vez de `cp`, que en este entorno no copió el archivo de
forma confiable en un intento — dio un archivo con `sqlite_master` vacío
sin ningún error) — el resultado, con la migración corriendo limpia desde
el archivo fuente real, ya tenía la tilde bien. **Lección para la próxima
sesión que necesite poblar datos de prueba con texto acentuado por un
one-liner de Node vía Bash**: preferir escribir el string en un archivo
`.mjs` con Write y ejecutarlo, no embeberlo en un `node -e "..."` dentro de
un heredoc de bash — es donde se corrompió acá. Y para copiar un `.db` en
este entorno, `Copy-Item` (PowerShell) resultó más confiable que `cp`
(bash) al menos una vez.

### Verificación hecha antes de desplegar

- Metodología de siempre: copia aislada al scratchpad, servidor de prueba
  en el **3002**, proceso del 3000 sin tocar hasta tener todo verde.
- **Migración**: corrida contra una copia fresca de la base **real** de
  producción (no solo la de prueba acumulada de la sesión) — stock
  idéntico pre/post, 17 tablas de negocio comparadas 1:1 en row count, cero
  movimientos con `deposito_id` NULL tras el backfill. Probada también
  sobre una base completamente vacía (camino "fresca") y con la migración
  corrida tres veces seguidas sobre una base con datos (idempotencia, sin
  duplicar filas).
- **Backend por curl, número a número**: alta/edición de depósitos; no
  poder desmarcar ni desactivar el predeterminado (400); no poder
  desactivar uno con stock (400, con la cantidad); marcar otro como
  predeterminado (siempre exactamente uno marcado); transferir y ver el
  saldo bajar en origen y subir en destino con el **stock total del
  producto sin cambios ni cambio de costo**; anular la transferencia y ver
  los dos saldos volver; vender desde un depósito sin stock teniendo stock
  en otro (400 con el mensaje "Hay stock en: X (n)"); comprar y devolver
  contra un depósito no predeterminado; anular/restaurar venta y compra
  (el stock vuelve al depósito **original** de la operación, no al
  predeterminado actual); devolución de venta y devolución a proveedor
  reingresan/salen del depósito correcto; asistente (stub) usando el
  predeterminado.
- **Atomicidad, probada de verdad**: un trigger SQL temporal que hace
  fallar a propósito el segundo movimiento (la entrada) de una
  transferencia — el primero (la salida) no quedó escrito, el servidor
  siguió respondiendo (no se colgó), y el stock quedó exactamente como
  antes del intento. Trigger eliminado después.
- **Bug propio encontrado y corregido en la misma verificación**:
  `GET /api/transferencias` mostraba una transferencia anulada **dos
  veces** — el `JOIN` tomaba cualquier movimiento `salida` asociado, y
  anular agrega un segundo `salida` (la reversión de la entrada original).
  Se corrigió acotando el JOIN al `MIN(id)` de esos movimientos (el
  original, no la reversión).
- **Frontend con Playwright** (headless, claro/oscuro, 1280px y 375px),
  corrido dos veces — contra la copia de prueba de la sesión y de nuevo
  contra una migración fresca de la base real: **31/31 checks en verde,
  sin errores de consola** las dos veces. Modal de depósitos abre/lista/
  marca; columna y filtro de depósito en Stock; modal de transferencia con
  selects poblados; selects de depósito en Venta y Compra; panel de
  transferencias visible; sin scroll horizontal en mobile.
- `node --check` en los tres archivos (`server.js`, `db/index.js`,
  `app.js`) después de cada tanda.
- **Deploy**: el proceso real **no estaba corriendo** al empezar esta
  etapa (sin PID que matar). Backup
  `nexo.db.backup-antes-multideposito-20260904-091043` en `backend/db/`,
  migración aplicada directo sobre la base real (mismo resultado 1:1 que
  la prueba), proceso arrancado con `node --experimental-sqlite
  server.js`. Los endpoints nuevos (`/api/depositos`,
  `/api/transferencias`) respondieron 401 (no 404: la ruta existe, solo
  falta sesión) contra el proceso real.

### Qué queda pendiente

- ~~Sin commitear~~ — **ya está commiteada**: `37acd16` ("feat:
  multidepósito"), encima de `0802c2d` (listas de precios), las dos en
  `feature/reportes-compras-estadisticas`. Sigue sin decidirse si esa rama
  va a un PR único o a varios.
- El **reporte de stock** (`/api/reportes/stock`, "qué reponer") sigue
  mostrando solo el total global por producto, sin desglose por depósito
  — quedó fuera a propósito de esta etapa (no se pidió explícitamente) pero
  es una extensión barata si hace falta después, mismo patrón que
  `/api/stock`.
- El **asistente de operaciones por texto** no interpreta depósito desde
  el texto todavía — usa siempre el predeterminado. Enseñarle a reconocer
  "vendí ... desde la sucursal" es una etapa aparte.
- `stock_minimo`/`stock_maximo` siguen siendo del producto (global), por
  decisión explícita de esta etapa — si en el futuro hace falta un mínimo
  por depósito (ej. una sucursal chica que necesita reponer antes), es una
  migración nueva sobre `producto_precios`-como-molde, no algo que esta
  etapa dejó a mitad de camino.
- `GEMINI_API_KEY` sigue sin cargar en el proceso real (sin cambios,
  arrastra de varias etapas atrás).

## 25. Última etapa: vencimientos y aging de cuentas corrientes

**El pedido**: seguir sumando funciones. Se preguntó con `AskUserQuestion`
entre cuatro opciones (vencimientos/aging, marca y unidad de medida, notas de
débito, reporte de stock por depósito) y el usuario eligió **vencimientos** —
era la brecha que este mismo handoff venía marcando desde §3.

**El problema que resuelve**: `GET /api/cuentas-corrientes` medía la
antigüedad de la deuda **desde la fecha de la operación**, porque no existía
fecha de vencimiento en el esquema (el propio código lo documentaba como
limitación consciente). Con eso el reporte mentía: una venta pactada a 30 días
hecha ayer figuraba "Al día" por casualidad y seguía figurando así hasta el
día 30, sin importar lo pactado; una de contado impaga hace 20 días figuraba
igual que una a 60 días recién emitida. No servía para decidir a quién
reclamar.

**Decisiones de negocio confirmadas con el usuario antes de programar** (tres
rondas de `AskUserQuestion`, las tres con la opción recomendada):
- Se carga eligiendo una **condición de pago** (Contado / 15 / 30 / 60 días /
  fecha puntual); Nexo calcula la fecha sola. Se guardan **las dos cosas**: la
  condición pactada y la fecha resultante.
- **Tramos nuevos** medidos desde el vencimiento: `a_vencer`, `vencido_30`,
  `vencido_60`, `vencido_mas` (antes: `al_dia`/`atrasado`/`vencido` medidos
  desde la fecha de la operación).
- Las operaciones existentes se backfillean con **vencimiento = su propia
  fecha** (equivalente a "fueron de contado"). No es una suposición sobre lo
  que se pactó de verdad: es el único valor que hace que el reporte siga dando
  exactamente los mismos días y el mismo orden que antes, así que nada cambia
  de lugar retroactivamente y el resultado se puede comparar 1:1 pre/post.

### Migración (aditiva, dos columnas por tabla)

- `backend/db/schema.sql`: `condicion_pago` TEXT y `fecha_vencimiento` TEXT en
  `ventas` y en `compras`, para que una base **fresca** nazca con ellas.
- `backend/db/index.js`: mismo patrón `PRAGMA table_info` + `ALTER TABLE` que
  ya usaba `deposito_id`, más el backfill
  (`UPDATE ... SET fecha_vencimiento = fecha, condicion_pago = 'contado'
  WHERE fecha_vencimiento IS NULL`). El `WHERE ... IS NULL` lo hace idempotente
  y evita pisar una operación que ya tenga vencimiento propio.
- **Sin rebuild de `auditoria`**: no se agregó ninguna entidad nueva al CHECK,
  solo columnas a tablas ya auditadas.

### Backend (`backend/server.js`)

- **`calcularVencimiento(fecha, condicion, fechaManual)`**, junto a los helpers
  de fecha: reusa `sumarDias` (no reimplementa aritmética de fechas). Lanza
  **`ErrorBulk`, nunca `Error` a secas** — la lección ya pagada en la etapa de
  listas de precios: un `Error` genérico escapa del `try/catch` y termina como
  HTML de stack trace de Express en vez de un 400 con JSON.
- **Ojo con el orden de declaración**: `sumarDias`/`diffDias` son *function
  declarations* (hoisted), por eso `calcularVencimiento` puede usarlas aunque
  estén más abajo en el archivo. `fechaDeHoy` y `SQL_HOY`, en cambio, son
  `const` — NO están hoisted, así que `crearVenta`/`crearCompra` (que están
  antes en el archivo) resuelven la fecha con un `SELECT date('now')` inline en
  vez de llamarlas. Si alguien "limpia" eso llamando a `fechaDeHoy()`, rompe.
- `crearVenta` y `crearCompra` aceptan `condicion_pago` + `fecha_vencimiento`
  (opcionales; sin ellos → `'contado'`, que preserva el comportamiento
  anterior). Las dos ahora **resuelven la fecha antes del INSERT** en vez de
  omitir la columna para que aplique el DEFAULT: el vencimiento tiene que
  calcularse sobre esa misma fecha y no sobre otra.
- `PUT /api/ventas/:id` y `PUT /api/compras/:id` **recalculan** el vencimiento,
  porque editar puede haber movido la fecha de la operación. Si el request no
  manda condición, se conserva la guardada; y con condición `'manual'` se
  conserva también la fecha guardada (una fecha suelta no se puede derivar de
  ninguna condición).
- **El cambio que da sentido a la etapa**: `saldosPorOperacion` ahora trae
  `COALESCE(o.fecha_vencimiento, o.fecha) AS vencimiento`, y `agruparPorEntidad`
  mide `diffDias(o.vencimiento, hoy)` — negativo = todavía no venció. Las
  operaciones se ordenan por vencimiento y `dias_max` pasa a ser "días
  vencido". `tramoDeAntiguedad` → `tramoDeVencimiento` con los cuatro tramos.
- `GET /api/ventas/:id` y `GET /api/compras/:id` exponen los dos campos nuevos
  (el frontend los necesita para preseleccionar al editar).
- Los otros llamadores de `crearVenta`/`crearCompra` (conversión de
  presupuesto, `/api/asistente/ejecutar`) no pasan condición, así que caen en
  `'contado'` — correcto y sin cambios de comportamiento.

### Frontend (`frontend/index.html`, `frontend/js/app.js`)

- Tres helpers chicos compartidos por Venta y Compra: `sincronizarVencimiento`
  (muestra el input de fecha solo con "manual"), `poblarCondicionPago` (deja el
  par como lo tenía la operación editada) y `datosCondicionPago` (lo que viaja
  al backend).
- `<select name="condicion_pago">` + input date condicional en los modales de
  Venta y Compra, después de Fecha.
- **Cuentas corrientes**: `CC_TRAMO_CLASE`/`CC_TRAMO_LABEL` pasan a las cuatro
  claves nuevas **sin CSS nueva** — `a_vencer` verde (`status-cobrado`),
  `vencido_30` amarillo (`status-pendiente`), `vencido_60` y `vencido_mas`
  rojo (`status-vencido`). Las columnas "Más vieja"/"Antigüedad" pasan a
  "Vence"/"Estado"; el detalle expandible suma la columna Vence y usa
  `ccTextoDias` ("Vence en N días" / "Vencido hace N días" / "Vence hoy" /
  "A favor"). Filtros y CSV: la etiqueta de `dias_max` pasa a "Días vencido".

### Verificación hecha antes de desplegar

- Metodología de siempre: copia aislada al scratchpad (con `Copy-Item` de
  PowerShell), servidor de prueba en el **3002**, proceso del 3000 sin tocar
  hasta tener todo verde.
- **La prueba clave de esta etapa**: se guardó la respuesta de
  `/api/cuentas-corrientes` **antes** de migrar y se comparó campo por campo
  con la de después (script `comparar-cc.mjs`). Con el backfill a contado, los
  saldos, los días, el orden de las entidades y los totales dieron
  **exactamente lo mismo** — solo cambió el nombre del tramo. Cualquier
  diferencia numérica ahí habría sido un bug.
- **Migración**: row counts de las 33 tablas comparados 1:1 (sin diferencias);
  cero filas sin `fecha_vencimiento` tras el backfill; idempotencia probada
  reimportando `db/index.js` tres veces seguidas sobre una base con datos (sin
  cambiar ninguna fila); y camino "base fresca" probado aparte, confirmando que
  las dos columnas nacen de `schema.sql`.
- **Por curl, 8/8**: venta a 30 días (fecha + 30, exacto); contado; fecha
  manual anterior a la operación rechazada con **JSON limpio** (se verificó el
  *body*, no solo el status — es exactamente el bug de `ErrorBulk` que se coló
  en una etapa anterior); condición inválida (400); fecha manual válida;
  editar la fecha recalcula el vencimiento conservando la condición; compra a
  60 días.
- **Bordes de los tramos, 7/7**: se creó una venta impaga por cada caso y se
  leyó qué tramo le asignó el endpoint — día -5 (`a_vencer`), 0, 1 y 30
  (`vencido_30`), 31 y 60 (`vencido_60`), 61 (`vencido_mas`). Los cortes caen
  donde tienen que caer.
- **Frontend con Playwright, 20/20 y sin errores de consola** (claro, oscuro,
  1280px y 375px): las 5 opciones del select, el input de fecha que
  aparece/desaparece con "manual", una venta creada de punta a punta desde la
  UI, los encabezados nuevos, todos los badges con las etiquetas nuevas, el
  detalle expandible con el texto de vencimiento, y sin scroll horizontal en
  mobile. Capturas revisadas a mano en los tres escenarios.
- **Ojo con las pruebas, no con el código**: la primera corrida por curl falló
  4 de 8 porque el producto de prueba tenía stock 0 y las ventas se rechazaban
  antes de llegar al código nuevo — dos de las pruebas de error incluso pasaban
  *por el motivo equivocado* (el mensaje era de stock, no de vencimiento). Se
  cargó stock y recién ahí las pruebas midieron lo que decían medir. Vale la
  pena mirar el mensaje de error y no solo el status code.
- **Deploy**: backup `nexo.db.backup-antes-vencimientos-20260904-140037`,
  proceso detenido por **PID exacto** (`Get-NetTCPConnection -LocalPort 3000`),
  reiniciado con `node --experimental-sqlite server.js`. Row counts post-deploy
  idénticos a la foto previa, backfill completo (0 filas sin vencimiento, 0 con
  vencimiento distinto de la fecha), `/api/cuentas-corrientes` respondió 401
  (no 404: la ruta existe, falta sesión) y el HTML sirve los dos selects
  nuevos.

### Qué queda pendiente

- **Sin commitear** — la rama sigue siendo
  `feature/reportes-compras-estadisticas` (esta etapa va encima de `37acd16`).
- **El cliente y el proveedor no tienen condición de pago habitual en su
  ficha**: se eligió la opción sin eso a propósito (el usuario descartó esa
  tercera alternativa), así que hay que elegir el plazo en cada operación. Si
  más adelante molesta, el molde exacto ya existe: `clientes.lista_precio_id`
  con `poblarSelectListasPrecios`, que se propone solo al elegir el cliente.
- **El asistente por texto no interpreta el plazo** desde la frase ("a 30
  días") — todas sus operaciones son de contado. Misma situación que depósito.
- Los tres archivos basura de la raíz (`0`, `0)`, `col.name`, los tres vacíos)
  **se borraron** esta etapa, con confirmación del usuario.
- `GEMINI_API_KEY` sigue sin cargar en el proceso real (sin cambios, arrastra
  de varias etapas atrás).

## 26. Última etapa: condición de pago habitual por cliente y proveedor

**El pedido**: seguir sumando funciones. El usuario eligió esta opción entre
cuatro (marca/unidad de medida, reporte de stock por depósito, notas de
débito, condición de pago habitual) porque era el cabo suelto que la propia
etapa anterior (§25) había dejado anotado: hoy hay que elegir el plazo de
pago a mano en cada venta/compra, y olvidarse mete esa operación al reporte
de Cuentas Corrientes como si fuera de contado.

**El molde**: `clientes.lista_precio_id` (§18/§23) — un plazo/lista
"habitual" en la ficha, que Venta/Compra proponen solo al elegir esa entidad,
sin pisar una elección que el usuario ya haya hecho a mano para esa operación
puntual.

**Decisiones confirmadas con el usuario** (dos rondas de `AskUserQuestion`,
las dos con la opción recomendada):
- Elegir un cliente/proveedor **no pisa** una condición que el usuario ya
  cambió a mano — mismo criterio que la lista de precios habitual.
- Los clientes/proveedores existentes quedan **sin plazo habitual (NULL)**,
  sin backfill: nada cambia de comportamiento hasta que alguien cargue el
  plazo, y queda distinguible "nunca se definió" de "se definió que es de
  contado".

### Migración (aditiva, una columna por tabla, sin tocar `schema.sql`)

`backend/db/index.js`: `clientes.condicion_pago` TEXT y
`proveedores.condicion_pago` TEXT, mismo patrón `PRAGMA table_info` +
`ALTER TABLE` que ya usa `clientes.lista_precio_id`. **Sin backfill** (NULL a
propósito). **Sin rebuild de `auditoria`** (ninguna entidad nueva en el CHECK).

**Nota de arquitectura descubierta en esta etapa**: a diferencia de
`ventas`/`compras` (que sí declaran `condicion_pago`/`fecha_vencimiento` en
`schema.sql` desde §25), `clientes.lista_precio_id` **nunca se agregó a
`schema.sql`** — vive solo en la migración de `db/index.js`, incluso para una
base fresca. La razón es el orden de las tablas en el archivo: `clientes` se
declara antes que `listas_precios`, así que una FK directa en el `CREATE
TABLE` sería una referencia hacia adelante. Se siguió ese mismo precedente
para `clientes.condicion_pago`/`proveedores.condicion_pago` (agregarlas
solo por migración, no en `schema.sql`) para no romper la consistencia del
patrón ya establecido — un intento inicial de sumarlas a `schema.sql` se
revirtió al notar esto.

### Backend (`backend/server.js`)

- **`normalizarCondicionPagoHabitual`/`condicionPagoHabitualValida`**, junto
  a `normalizarListaPrecioId`/`listaPrecioValida`: NULL = sin plazo definido;
  **`'manual'` se rechaza** (una fecha puntual de una operación concreta no
  es un plazo habitual reutilizable). Validan contra `CONDICIONES_PAGO`
  (definida más abajo en el archivo junto a `calcularVencimiento` de la etapa
  anterior) — es un lookup dentro de una función, así que no importa que la
  declaración esté más abajo: para cuando la función se llama de verdad
  (una request), el módulo ya cargó entero.
- `POST/PATCH /api/clientes` y `POST/PATCH /api/proveedores` suman
  `condicion_pago` en los mismos cuatro puntos donde ya está
  `lista_precio_id` (clientes) o los campos de contacto (proveedores):
  destructuring, validación, INSERT/UPDATE, y la lista de `diffCampos` para
  que el cambio quede auditado.
- **Nada más cambia**: `crearVenta`/`crearCompra` ya aceptaban
  `condicion_pago` desde §25; quién decide el valor sigue siendo el
  frontend. La conversión de presupuestos y el asistente por texto siguen
  siendo de contado, sin cambios de comportamiento.

### Frontend (`frontend/index.html`, `frontend/js/app.js`)

- **`poblarSelectCondicionPago(selector)`**, junto a los helpers de §25: las
  mismas opciones que Venta/Compra pero **sin "Fecha puntual"** y con "Sin
  definir" (= NULL) en vez de arrancar en "Contado".
- `<select name="condicion_pago">` nuevo en `#formCliente` (al lado de lista
  de precios habitual) y en `#formProveedor` (después de CUIT/DNI, primer
  campo de preferencia que tiene el lado proveedor — antes no tenía ninguno).
- **Propuesta automática, la parte que le da sentido a la etapa**: el
  listener de `change` del input de cliente en Venta (ya existía para la
  lista de precios) ahora también propone `condicion_pago`; se agregó el
  mismo listener **nuevo** para el input de proveedor en Compra (no existía
  ninguno — es lo único net-new de esta etapa, porque el lado proveedor no
  tenía precedente). Dos banderas de módulo nuevas,
  `ventaCondicionTocada`/`compraCondicionTocada` (reseteadas al abrir el
  modal, puestas en `true` por el `change` del propio select): a diferencia
  de la lista de precios, acá mirar el valor actual del select no alcanza
  para saber si el usuario ya eligió algo a mano, porque "contado" es a la
  vez el valor inicial y una elección válida.

### Verificación hecha antes de desplegar

- Metodología de siempre: copia aislada al scratchpad, servidor de prueba en
  el **3002**, proceso del 3000 sin tocar hasta tener todo verde.
- **Migración**: row counts de las 32 tablas sin diferencias; confirmado que
  las columnas nacen NULL en todos los clientes/proveedores existentes (sin
  backfill); idempotencia con tres corridas seguidas de `db/index.js` sobre
  una base con datos; camino "base fresca" probado aparte.
- **Por curl, 8/8**: cliente con `condicion_pago=30` guardado y leído;
  cliente sin mandar el campo queda NULL; **`'manual'` rechazado en la ficha
  de cliente** con **JSON limpio** (se verificó el *body*, no solo el
  status); condición inválida (`99`) rechazada en proveedor; proveedor con
  `condicion_pago=60`; `PATCH` de cliente actualiza el campo y queda en
  `auditoria`; una venta con el plazo del cliente (15 días) da
  `fecha_vencimiento` = fecha + 15 exacto.
- **Frontend con Playwright** (claro, oscuro, 1280px y 375px): los selects
  nuevos en las dos fichas con las 5 opciones correctas (sin "Fecha
  puntual"); Venta arranca en Contado y **propone sola 30 días** al elegir un
  cliente con ese plazo habitual; **no pisa** una condición que el usuario ya
  cambió a mano después de elegir el cliente; Compra propone sola 60 días al
  elegir un proveedor con ese plazo; sin scroll horizontal en mobile; sin
  errores de consola. Confirmado también a mano con capturas de las dos
  fichas.
- **Ojo con las pruebas, no con el código**: una corrida del script combinado
  marcó como "falla" que el modal de cliente (o, en otra corrida, el de
  proveedor) no se cerraba al guardar — pero el create sí llegaba a
  buen puerto (confirmado con `waitForResponse` aislado: 201 y el modal
  cerrado las dos veces) y las pruebas que dependían de ese registro
  (la propuesta automática leyendo su `condicion_pago`) seguían pasando, algo
  imposible si el alta hubiera fallado de verdad. Era una carrera de tiempos
  del script de prueba (varias altas seguidas con `waitForTimeout` fijo en
  la misma sesión), no un bug de la función.
- **Deploy**: backup `nexo.db.backup-antes-condicion-habitual-20260906-122414`,
  proceso detenido por **PID exacto**, reiniciado con
  `node --experimental-sqlite server.js`. Row counts post-deploy idénticos a
  la foto previa, las dos columnas nuevas en NULL para todas las filas
  existentes, y el HTML sirve el campo nuevo en las dos fichas.

### Qué queda pendiente

- **Sin commitear** — la rama sigue siendo
  `feature/reportes-compras-estadisticas` (esta etapa va encima de `e8858f4`).
- El **asistente por texto** sigue sin leer el plazo habitual del cliente al
  interpretar una venta por lenguaje natural — todas sus operaciones siguen
  siendo de contado, igual que antes de esta etapa.
- `GEMINI_API_KEY` sigue sin cargar en el proceso real (sin cambios, arrastra
  de varias etapas atrás).
