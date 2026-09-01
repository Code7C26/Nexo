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
- **Con autenticación y usuarios desde §16**: login con cookie httpOnly,
  sesiones en base, y dos roles (`admin` / `empleado`). Esta línea decía
  lo contrario hasta esta etapa; quedó sin actualizar cuando se construyó
  el módulo. Ver §16 para el detalle y §19 para el agujero de permisos que
  todavía sigue abierto.
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
  **vendedor** sigue sin construirse, pero **ya dejó de estar bloqueado**:
  desde §16 hay sistema de usuarios, así que solo falta agregar
  `usuario_id` a `ventas` (migración aditiva). Hoy se sabe quién auditó una
  operación, no quién la vendió.
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

- ~~Sin commitear~~ — ya commiteado: §17 y §18 viajan juntas en `5a03436`
  ("feat: refresh visual negro/blanco puro…"), que hoy está en `main`.
- El logo del favicon (`<link rel="icon">`) sigue siendo la versión negra
  — no se tocó porque el navegador lo pinta sobre su propia barra de
  pestañas, no sobre el fondo de la app; revisar si en algún navegador/SO
  se ve mal.
- Los badges "Pendiente"/"Anulado" ahora comparten color (rojo) — es lo
  que pidió el usuario, pero si en el uso diario resulta confuso
  distinguirlos, es un cambio de un solo token (`--accent-warn`) para
  volver a diferenciarlos sin tocar ningún otro lugar.

## 19. Última etapa: 6 correcciones de UI + auditoría de permisos por rol

Commit: `7bc15ee` ("fix: correcciones de UI en tablas, filtros y modales +
probador de tipografías"), sobre `Tosi`.

### Lo que se hizo

El usuario marcó seis problemas con capturas. Todos con la causa medida en
el código antes de tocar nada:

1. **Se eliminó el orden de tablas por click en el encabezado.** La
   función existía (`crearOrden`, 18 usos, 98 `data-orden` en el HTML) pero
   no se anunciaba de ninguna forma: el usuario tocaba una columna,
   aparecía una flecha y la tabla cambiaba sin explicación. Se le ofreció
   mantenerla haciéndola descubrible o sacarla, y **eligió sacarla**. Antes
   de borrarla se verificó que todos los endpoints ya traen un `ORDER BY`
   sensato (`nombre` en los maestros, `id`/`fecha DESC` en las
   operaciones), así que ninguna tabla quedó desordenada.
2. **Desalineación entre encabezados y datos** — era el mismo bug: la
   flecha de orden reservaba `0.9em` fijos al final de cada `th` aunque
   estuviera vacía, y en las columnas `align-right` eso corría el texto del
   encabezado mientras el dato iba a ras del padding. Se arregló solo al
   sacar el orden.
3. **Carteles pegados a los filtros** — `.form-note` es `margin: 0` y
   `.filtros` no tenía `margin-top`: el gap real era 0px.
4. **Celda de precio de Productos** — era un `<input>` de 100px fijos con
   borde permanente. Pasó a campo fantasma (sin caja en reposo, aparece en
   hover/foco), con `mono` + `tabular-nums` para alinear con Costo y Margen.
5. **El botón de menú tapaba el título** con la sidebar colapsada: faltaba
   en desktop la compensación de padding que ya existía en mobile.
6. **Modal "Mi cuenta"**: el nombre del usuario y el formulario de
   contraseña estaban pegados sin ningún margen.

### Probador de tipografías — el usuario rechazó las cuatro opciones

Se agregó un probador temporal en el modal de Configuración (que hasta acá
estaba vacío): cuatro combinaciones vía `data-fuente` en `<html>` +
`localStorage`, aprovechando que todo el CSS ya lee
`--font-display`/`--font-body`/`--font-mono`, así que cambiar de tipografía
es redefinir tres variables y no tocar ninguna regla.

**El usuario probó las cuatro y no le gustó ninguna.** Sus dos objeciones,
textuales: no le gusta **"que tenga el estilo de una caja registradora"** y
no le gusta **"que los 0 tengan puntos o tachas en el medio"**.

Esto es importante porque **invalida el concepto tipográfico con el que se
construyó el frontend**: el sistema actual está montado sobre una idea de
"libro mayor / ticket de caja" (IBM Plex Mono para encabezados, títulos,
badges y números), documentada en los comentarios de `styles.css` alrededor
de `--font-display`. La segunda objeción además descarta de plano a casi
todas las monoespaciadas para programadores (IBM Plex Mono, JetBrains Mono,
DM Mono, Roboto Mono, Space Mono usan cero con punto o barra por diseño).

Camino para la próxima tanda: proponer sans (no mono) para encabezados y
títulos, verificando el dibujo del cero antes de proponer, y mantener las
columnas de números alineadas con `font-variant-numeric: tabular-nums`
sobre una sans con cifras tabulares — que es lo que ya hace la clase
`.mono` y funciona igual sin ser monoespaciada. **El probador sigue en el
código con las cuatro opciones viejas**: hay que reemplazarlas, no solo
elegir una.

### Auditoría de permisos por rol — diagnóstico hecho, implementación NO

Se auditó el módulo de usuarios de §16 y apareció un agujero grande:

**El rol "empleado" hoy no protege casi nada.** `soloAdmin`
(`backend/server.js:174`) está aplicado a exactamente **4 endpoints**, los
cuatro de `/api/usuarios` (líneas 5684, 5696, 5738, 5792). Los otros ~88
endpoints de negocio solo pasan por `autenticar`, o sea que solo exigen
"tener sesión". Un empleado, con su cookie normal y sin ninguna barrera,
puede llamar por API a `POST /api/ventas/:id/anular`,
`POST /api/tesoreria/transferencias`, `PATCH /api/productos/:id` (precios),
`POST /api/stock/ajuste`, `GET /api/resumen` y `GET /api/reportes/ventas`
(toda la rentabilidad y los márgenes del negocio). La UI le esconde la
pantalla de Usuarios y nada más.

**Segundo hueco: `debe_cambiar_password` no se enforza en el servidor.**
`autenticar` (`server.js:161-172`) no lo mira, y el login ya devuelve una
cookie plenamente operativa antes de que aparezca la pantalla de cambio
forzado (`sesion.js:148-152`). Un usuario con la contraseña reseteada por
el admin puede cerrar el modal, o llamar la API directo, y operar igual.

**Tercer hueco: login y logout no auditan nada.** `auditoria.entidad` ya
acepta `'usuario'` (`schema.sql:493`), pero hoy no queda registro de quién
entró ni cuándo. Los intentos fallidos solo viven en un `Map` en memoria
que se pierde en cada reinicio (`server.js:184-214`), y el rate limit es
por nombre de usuario, no por IP.

### Reglas de negocio ya decididas por el usuario (no volver a preguntar)

Se le preguntó explícitamente y definió el reparto. **Estas decisiones
están tomadas, falta implementarlas:**

**Acciones que pasan a ser solo-admin:**
- Anular y restaurar todo: ventas, compras, gastos, devoluciones y
  devoluciones a proveedor (10 endpoints `POST /api/*/:id/anular` y
  `/restaurar`). Como consecuencia, la Papelera queda solo para admin.
- Tesorería: transferencias, movimientos manuales y el ABM de cuentas.
  **Pero los cobros de venta (`POST /api/ventas/:id/cobros`) y los pagos de
  compra (`POST /api/compras/:id/pagos`) siguen siendo del empleado** — es
  su trabajo diario, no configuración.
- Alta y edición de productos y de categorías (incluye el precio de venta,
  o sea que el campo editable de la tabla de Productos se apaga para el
  empleado).
- Ajuste manual de stock.

**El empleado NO debe ver costos ni ganancias.** El usuario eligió
explícitamente la opción más costosa ("si el dato viaja al navegador, el
empleado puede leerlo"), o sea que no alcanza con esconder columnas en el
frontend: hay que **filtrar los campos en el backend**. Debe dejar de ver
Costo/Valorizado/Margen en Productos, la ganancia y la rentabilidad del
Resumen, el margen y la ganancia de los reportes de ventas, y el costo
histórico y margen de cada línea en la ficha de una venta. Sigue viendo
precio de venta, stock, sus ventas, clientes y cuentas corrientes.

**Auditoría sigue visible para los dos roles** — decisión previa de §16 que
el usuario mantuvo ("es consulta, no configuración").

### Dónde tocar cuando se implemente

Los puntos calientes ya localizados: `SELECT_PRODUCTO`
(`server.js:698-706`) incluye `precio_costo` y lo usan tanto
`GET /api/productos` como el reporte de stock; `decorarProducto`
(`server.js:722`) calcula el margen; `GET /api/resumen` (4562),
`GET /api/resumen/evolucion` (4769), `GET /api/reportes/ventas` (4978) y
`GET /api/ventas/:id` (1198) son los otros portadores de datos sensibles.
En el frontend, `sesion.js:87-93` ya escribe `data-rol` en `<html>` y hay
**una sola** regla CSS que lo usa (`styles.css:2109`, esconde el nav de
Usuarios): ese es el mecanismo a extender. Ojo con un detalle: `sesion.js`
intercepta 401 pero **deliberadamente no intercepta 403**, así que cada
llamada que pueda recibir 403 tiene que manejarlo por su cuenta.

Quedó sin escribir el plan de implementación detallado (se cortó por límite
de sesión). El diagnóstico y las decisiones de arriba son lo que hay que
retomar.

### Qué queda pendiente

- **Implementar los permisos por rol** con las reglas de arriba.
- **Reemplazar las cuatro opciones del probador de tipografías** por
  alternativas que respeten las objeciones del usuario, y una vez elegida
  una, fijarla como default y sacar del `<link>` de Google Fonts las
  familias que sobren (hoy carga 5 de más).
- `GEMINI_API_KEY` sigue sin estar cargada en el proceso: el asistente por
  texto responde 503. Se consigue gratis en Google AI Studio.
