# Handoff histórico — Nexo

> Relato completo, etapa por etapa. Las secciones §1 a §51 son las que se
> escribieron en `handoff.md` hasta el 5 de octubre de 2026 y se movieron acá sin
> cambios (misma numeración) cuando `handoff.md` pasó a ser un resumen corto y
> vivo, a pedido del usuario. `handoff.md` y algunos comentarios del código
> citan estas secciones como "hist. §N". Desde §52, cada etapa se escribe
> directamente acá al cerrarla, y `handoff.md` solo guarda el estado actual.
>
> Las secciones §1 a §51 conservan el encabezado `# Handoff — Nexo` y la
> introducción del `handoff.md` original: son parte del texto movido, no la
> cabecera de este archivo.
>
> Cada sección describe el estado del proyecto en ESE momento: para el estado
> actual, leer `handoff.md`. Lo de acá no se reescribe; las etapas nuevas
> agregan su relato al final, con el siguiente número disponible.

---

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

## 27. Última etapa: 6 correcciones de UI + auditoría de permisos por rol

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

## 28. Corrección de este handoff + orden de ramas

**Corrección sobre §27**: ese punto quedó registrado como "diagnóstico hecho,
implementación NO", pero **los permisos por rol sí se implementaron** después,
en dos commits que este handoff nunca llegó a documentar: `135de27` ("fix:
enforzar debe_cambiar_password en el servidor y auditar login/logout") y
`d299699` ("feat: permisos por rol admin/empleado en los ~105 endpoints y en
la UI"). Están descritos con más detalle en `README.md` ("Estado del
Proyecto"). Esta sesión no revisó el diff de esos commits en profundidad —
si hace falta el detalle técnico exacto de qué se tocó, mirar los commits
directamente.

**Orden de ramas de esta sesión** (pedido explícito del usuario: "hiciste un
lío abriendo tantas ramas"):
- El PR #23 (`feature/precios-multideposito-cxc-reportes` → `main`) **ya
  estaba mergeado en GitHub** desde antes de esta sesión, más un
  `Update README.md` (`e5de3dc`) hecho directo sobre `main`. El `main` local
  solo estaba atrasado por falta de `fetch` — no se abrió ningún PR nuevo.
- `main` y `solla` locales y remotos quedaron en el mismo commit
  (`e5de3dc`, fast-forward puro, sin conflicto).
- Se borraron, local y remoto, tres ramas que ya no tenían ningún commit
  propio fuera de `main`: `feature/fusion-resumen`,
  `feature/usuarios-login-roles`, `feature/precios-multideposito-cxc-reportes`.
- **`Tosi` se dejó intacta a propósito** (es la rama de Joaquín). Al revisar
  quedó una nota suelta: el `Tosi` **local** de este clon está 8 commits
  atrás de `origin/Tosi` (nadie hizo `fetch` de esos commits antes) — no es
  un problema, solo desactualización del clon local, y no se tocó porque no
  es la rama de esta sesión.
- **Regla nueva, confirmada por el usuario, que reemplaza "rama por feature"
  para el día a día**: de acá en adelante el trabajo va siempre sobre
  `solla` (la rama de Santino), no una rama nueva por tarea. `Tosi` sigue
  siendo la de Joaquín. Si en algún momento hace falta abrir un PR real
  (`solla` → `main`), es la misma mecánica de siempre, solo que ya no se
  crea una rama descartable para cada etapa.

**Estado final de ramas**: `main`, `solla` (rama activa de trabajo), `Tosi`
— las tres iguales en local y remoto salvo `Tosi` (ver arriba). Ninguna otra
rama de feature quedó viva.

## 29. Notas de débito: alta desde la UI

El README marcaba pendiente "notas de débito (el modelo las soporta pero
no hay forma de darlas de alta desde la UI)". Se confirmó con el usuario
(dos `AskUserQuestion`, ambas con la opción recomendada):

- Se dan de alta **sueltas**, sin atarlas a ninguna venta/factura
  existente — mismo patrón que la "Factura suelta" que ya existía.
- **No afectan cuenta corriente, tesorería ni resultado** — son solo un
  documento, igual que la factura suelta.

Investigando el código se confirmó que **no hacía falta ningún cambio de
backend ni migración**: `backend/db/schema.sql` ya tenía `nota_debito` en
el `CHECK` de `facturas.tipo`, `POST /api/facturas` ya aceptaba y procesaba
`tipo: 'nota_debito'` con numeración independiente por
`(punto_venta, tipo, letra)` (mismo mecanismo que `nota_credito`), y
`permisos.js` ya dejaba ese endpoint en `'ambos'` roles. Lo único que
faltaba era exponerlo en el frontend.

Cambios (solo `frontend/`):

- `frontend/index.html`: se agregó la opción "Nota de débito" al
  `<select name="tipo">` del modal "Nueva factura" (la opción
  `nota_credito` sigue sin estar disponible ahí a propósito: sigue siendo
  exclusivamente automática desde una devolución). Se agregó la columna
  "Tipo" al `<thead>` de la tabla de Facturas.
- `frontend/js/app.js`: nuevo `TIPO_FACTURA_LABEL` (mismo patrón que
  `TIPO_GASTO_LABEL`), usado en la tabla de Facturas (nueva columna
  "Tipo"), en la ficha de detalle, en el rótulo de impresión
  (`hojaDeFactura`), en el export CSV (`COLUMNAS_CSV_FACTURAS`) y en el
  toast de éxito al crear ("Nota de débito #N registrada." en vez de
  siempre "Factura #N registrada.").

Verificado en una copia aislada (puerto 3002, base de datos descartable):
numeración independiente confirmada por curl (`factura` y `nota_debito`
arrancan cada una en su propio número 1), y un script de Playwright
confirmó de punta a punta: el select muestra "Nota de débito", el alta
desde la UI muestra el toast correcto, la tabla muestra la columna "Tipo"
con el valor correcto, la ficha muestra "Tipo: Nota de débito", crear una
factura común sigue funcionando igual que antes, y no hubo errores de
consola. La copia de prueba y el proceso en el puerto 3002 se
eliminaron/detuvieron al terminar.

Pendiente conocido de la sesión anterior, sin resolver todavía: el commit
`7af7308` (orden de ramas) quedó sin la línea `Co-Authored-By`; se ofreció
corregirlo con un amend + force-push a `solla` pero no se hizo porque
requiere confirmación explícita del usuario.

## 30. Variantes de producto — Etapa 1 (maestro) y Etapa 2 (compras)

Arranca la etapa grande "variantes de producto" (talle/color con stock,
costo y opcionalmente precio propios), con plan escrito y aprobado en
`C:\Users\HP ULTRA 5\.claude\plans\sigamos-mejorando-nexo-typed-clover.md`
(6 etapas: 1. schema+maestro, 2. compras, 3. ventas, 4. precio por lista a
nivel variante, 5. devoluciones, 6. bloqueo del asistente IA). Principio de
diseño, no perder de vista en las próximas etapas: **`producto_id` en
`movimientos_stock`/`venta_items`/`compra_items`/etc. siempre apunta al
producto padre; `variante_id` es una columna nueva, nullable, adicional**.
`NULL` = "es para el producto en general", idéntico al comportamiento
previo — así un producto sin variantes queda garantizado sin cambios de
comportamiento.

**Todo este trabajo (Etapa 1 y 2) está sin commitear todavía**, como
cambios sin stagear sobre `solla` (`backend/db/index.js`,
`backend/db/schema.sql`, `backend/permisos.js`, `backend/server.js`,
`frontend/css/styles.css`, `frontend/index.html`, `frontend/js/app.js`).
Se sigue el criterio ya vigente de esta rama: trabajar directo sobre
`solla`, sin ramas descartables por feature.

### Etapa 1 — Schema + maestro de atributos/variantes

Completada y verificada en una sesión previa a la que generó este
handoff (por eso no tiene tanto detalle acá — ver el plan para el diseño
completo). En resumen: 5 tablas nuevas (`producto_atributos`,
`producto_atributo_valores`, `producto_variantes`,
`producto_variante_valores`, `variante_precios`), columna `variante_id`
agregada a `movimientos_stock`/`venta_items`/`compra_items`/
`devolucion_items`/`devolucion_proveedor_items`/`presupuesto_items`
(nullable, migración idempotente igual que las ya existentes de
`db/index.js`), vistas `stock_variante_actual`/`stock_variante_por_deposito`
(mismo criterio que `stock_por_deposito`: viven en `index.js`, no en
`schema.sql`), y 10 endpoints nuevos bajo `/api/productos/:id/atributos`
y `/api/productos/:id/variantes` (todos registrados en
`permisos.js` → `RUTAS_PERMISOS`, ABM admin / lectura ambos roles).
`combinacionVariante(varianteId)` arma el texto legible ("Talle: S") a
partir de esas tablas.

### Etapa 2 — Compras con variante

**Objetivo**: que comprar una variante puntual sume stock y recalcule
costo promedio ponderado de esa variante específicamente, sin tocar el
costo del producto padre ni el de sus otras variantes.

**`backend/server.js`**:
- `registrarMovimientoStock` acepta `variante_id = null` y lo persiste —
  es el cambio raíz del que dependen todos los demás (sin esto, cualquier
  otro cambio quedaría escribiendo `variante_id` NULL igual).
- `crearCompra` y el `PUT /api/compras/:id` (edición): cada ítem admite
  `variante_id` opcional; se valida que la variante exista y pertenezca
  al producto, y que si el producto tiene variantes activas **no** se
  pueda comprar "en general" sin elegir una (`ErrorBulk`, mensaje directo
  al usuario). `itemsProrrateados` en las dos funciones dejaba caer
  `variante_id` porque reconstruía el objeto ítem a mano sin ese campo —
  bug de integración encontrado y corregido antes de llegar a probarlo en
  vivo, agregándolo explícitamente al mapeo en ambos lados.
- `aplicarStockCompra`: si el ítem trae `variante_id`, el costo promedio
  ponderado se lee/escribe contra `producto_variantes.precio_costo` y
  `stock_variante_actual` en vez de `productos`/`stock_actual`.
- `recalcularCostoProducto` suma `AND variante_id IS NULL` a su `WHERE`
  (no mezclar historial de variantes en el promedio del padre); nueva
  `recalcularCostoVariante(varianteId)`, espejo exacto filtrando por
  `variante_id`. Ambas reconstruyen el promedio desde cero repasando
  `movimientos_stock` en orden cronológico (no restan incrementalmente:
  un promedio ponderado no se puede "desarmar" con exactitud).
- `GET /api/compras/:id` decora cada ítem con `combinacion` (vía
  `combinacionVariante`) cuando tiene variante.
- **Bug real encontrado y corregido en `POST /api/compras/:id/anular`**:
  el `SELECT` de ítems y el `registrarMovimientoStock` de reversión no
  incluían `variante_id`, así que anular una compra con variante generaba
  el movimiento de reversión con `variante_id = NULL` — el stock de la
  variante específica **nunca bajaba** (aunque el stock agregado del
  producto padre sí, porque `stock_actual` suma sin filtrar por
  variante), y un `restaurar` posterior duplicaba la cantidad. Corregido
  agregando `compra_items.variante_id` al `SELECT` y `variante_id:
  item.variante_id` al `registrarMovimientoStock` de esa transacción.
  Verificado con curl contra una variante real: stock 5→0 (anular)→5
  (restaurar) sin desvíos, tanto antes (fallaba) como después (correcto)
  del fix.

**`frontend/js/app.js`**:
- `agregarFilaItemCompra(contenedor, listaProductos)` ahora recibe la
  lista de productos (antes no la necesitaba) y agrega un
  `<input class="item-producto-id" hidden>` + `<select
  class="item-variante-id" hidden>` que se revela y se puebla (vía
  `GET /api/productos/:id/variantes`, cacheado en
  `variantesPorProductoCache`) cuando el nombre tipeado matchea un
  producto con `tiene_variantes`. `leerItemsCompra` lee ese select.
  `abrirModalCompra` pasó a ser `async` para poder precargar variantes al
  editar una compra existente. Los 5 call sites de
  `agregarFilaItemCompra` (modal manual + las dos ramas del asistente)
  se actualizaron para pasar `productos`.
- `activarAsistenteCompra` ahora también fija `.item-producto-id` (igual
  que ya hacía `activarAsistenteVenta`), pero **no** arma el select de
  variante — deferido a propósito a la Etapa 6 (bloqueo del asistente),
  así que hoy una propuesta de IA sobre un producto con variantes falla
  recién al confirmar, con el mismo mensaje de `ErrorBulk` del backend.

**Verificación**: copia aislada (`backend`+`frontend`) en un scratchpad,
servidor de prueba en el puerto 3002, circuito completo por curl contra
dos productos reales (uno con variantes "Talle S/M", otro sin variantes
como control de regresión) — alta de compra como borrador → confirmar →
marcar recibido → editar cantidad/precio → editar cambiando de variante →
anular → restaurar, chequeando en cada paso el stock/costo de la variante
tocada, de su variante hermana (no debe moverse) y del producto padre (su
`precio_costo` propio no debe moverse, pero su `stock` agregado sí debe
incluir el de la variante — es el comportamiento esperado, no un bug, ver
el plan). Migración probada idempotente (arrancar el server de prueba dos
veces sobre la misma base ya migrada). `npm test` (los 3 tests de
inventario de rutas/permisos) verde antes y después, tanto en la copia
aislada como en el repo real. **No había herramienta de automatización de
navegador disponible en esta sesión** (se buscó y no apareció ningún
tool de Playwright/browser) — la integración del frontend se verificó
estáticamente: sin ids duplicados en `index.html`, y cada
`getElementById`/`querySelector` nuevo de `app.js` contrastado a mano
contra los ids/clases reales del HTML. Si en la próxima sesión aparece un
tool de navegador, vale la pena una pasada visual real de estos cambios
de compra (no se hizo esta vez por falta de herramienta, no por decisión).

### Gap conocido, no resuelto a propósito (fuera del alcance de esta etapa)

Los chequeos de "ya se vendió/compró, no se puede editar/anular" en el
`PUT`/`anular` de compras siguen mirando `stock_por_deposito` a nivel
**producto**, no por variante — en un producto multi-variante esto podría
aprobar o bloquear una edición/anulación de forma imprecisa respecto de
la variante puntual involucrada. Se detectó en esta etapa pero se dejó
así porque no es parte del alcance acordado; revisar si da problemas al
construir la Etapa 3 (ventas), que toca el mismo tipo de chequeo.

### Qué sigue

Etapas 3 a 6 del plan (ventas con variante, precio por lista a nivel
variante, devoluciones, bloqueo del asistente) — ver el archivo del plan
para el detalle punto por punto de cada una. Etapa 3 es la siguiente en
orden: toca `validarStockDisponible`, `crearVenta`, los movimientos de
stock de venta/anular/restaurar/devolución, y el mismo tipo de selector
de variante en `agregarFilaItemVenta`/`leerItemsVenta` que se acaba de
construir para compras (con el agregado de que el `max` del input de
cantidad debe leer el stock de la variante, no el agregado del producto).

## 31. Variantes de producto — Etapa 3 (ventas y presupuestos)

**Objetivo**: que vender una variante puntual descuente su stock
específico y congele su costo histórico específico, sin tocar el
stock/costo del producto padre ni el de sus variantes hermanas — mismo
principio que ya rige para compras desde la Etapa 2. Presupuestos entró
en el alcance de esta misma etapa (no es una etapa aparte del plan
madre): convierten en venta llamando a las mismas
`validarStockDisponible`/`crearVenta`, así que journalear `variante_id`
en venta_items lo resuelve gratis también para presupuestos. Plan
completo en `C:\Users\HP ULTRA 5\.claude\plans\eventual-nibbling-cray.md`.
**Sin commitear todavía**, junto con las Etapas 1 y 2 (mismos archivos
listados en §30).

**`backend/server.js`**:
- `dondeHayStock` ganó un tercer parámetro opcional `varianteId`: con
  variante consulta `stock_variante_por_deposito` en vez de
  `stock_por_deposito`.
- `validarStockDisponible` (la usan tanto `POST /api/ventas` como
  `POST /api/presupuestos/:id/convertir`) reescrita para agrupar por
  clave compuesta `producto_id:variante_id` en vez de solo
  `producto_id`, con la misma bifurcación variante/no-variante que ya
  tenía `crearCompra`: producto con variantes activas exige
  `variante_id` en cada ítem, producto sin variantes rechaza si igual
  llegó una.
- `crearVenta`: el costo congelado en `venta_items.costo_unitario_historico`
  sale de `producto_variantes.precio_costo` cuando el ítem trae variante
  (nuevo `buscarCostoVariante`), del `productos.precio_costo` si no —
  ventas nunca escribe costo, solo lo lee, así que no hizo falta ningún
  `recalcularCostoVariante` acá (a diferencia de compras).
- `GET /api/ventas/:id` y `GET /api/presupuestos/:id`: cada ítem decorado
  con `combinacion` (vía `combinacionVariante`) cuando tiene variante,
  mismo patrón que ya tiene compras.
- `PUT /api/ventas/:id` (edición): mismo patrón que la edición de
  compras — los `Map` de liberado/pedido por producto pasan a indexar
  por la clave compuesta, y el chequeo de stock se bifurca
  variante/no-variante.
- `POST /api/ventas/:id/anular` y `.../restaurar`: se les aplicó
  directamente el mismo fix que en la Etapa 2 hizo falta parchear como
  bug real para compras (`SELECT` de ítems + `registrarMovimientoStock`
  de reversión con `variante_id`) — acá se agregó desde el principio,
  sin pasar primero por el bug.
- `guardarItemsPresupuesto` y `POST /api/presupuestos/:id/convertir`: el
  INSERT/SELECT de ítems suma `variante_id`; no hizo falta ningún otro
  cambio en el endpoint de convertir porque `validarStockDisponible`/
  `crearVenta` ya leen `item.variante_id` directo del objeto.
- No hizo falta tocar `permisos.js` (sin endpoints nuevos, confirmado con
  `npm test`) ni el filtro de campos sensibles (`podarSensibles` ya
  oculta costo/margen/ganancia para el rol empleado en cualquier
  respuesta, la `combinacion` nueva no es sensible).

**`frontend/js/app.js`**: mismo patrón visual que ya se construyó para
compras en la Etapa 2, reusando la misma caché `variantesPorProductoCache`/
`variantesDeProducto` (se reubicó antes de `agregarFilaItemVenta` porque
ahora la usan las dos).
- `agregarFilaItemVenta` gana el mismo `<select class="item-variante-id"
  hidden>` que ya tiene la fila de compra, con un `data-stock` por
  `<option>`; un listener de `change` actualiza `cantidad.max` al stock
  de la variante elegida (no al agregado del producto) cuando
  `limitarStock` es `true` — es la diferencia real contra el patrón de
  compra, que no limita por stock.
- `leerItemsVenta` suma `variante_id` al ítem emitido, igual que
  `leerItemsCompra`.
- `abrirModalVenta` y `abrirModalPresupuesto` pasaron a `async` para
  poder precargar la variante al editar una venta/presupuesto existente
  (fetch de variantes, poblar el select, seleccionar la opción correcta;
  en venta además recalcula el `max` de cantidad contra el stock de esa
  variante puntual).
- `activarAsistenteVenta` no se tocó, mismo criterio ya establecido en
  compras: el asistente asigna `.item-producto-id` sin pasar por el
  evento del input, así que el select de variante nunca se llega a
  mostrar — una propuesta de IA sobre un producto con variantes queda
  bloqueada recién al confirmar. Sigue siendo la Etapa 6 la que decide
  si eso cambia.

**Verificación**: copia aislada en scratchpad, servidor de prueba en el
puerto 3002 (nunca el 3000 real). Como la copia de la base no traía
ningún producto con variantes cargado (a diferencia de lo esperado, la
data de prueba de la Etapa 1/2 no había quedado persistida en
`nexo.db`), se armó el fixture desde cero por curl contra los endpoints
ya existentes: atributo "Talle" + valores "S"/"M" en el producto "Asad
bourbon", dos variantes, y una compra confirmada+recibida para darles
stock inicial (S=10, M=5, costo 30000 cada una).

Circuito completo por curl, todo correcto:
- Venta de 3 unidades de la variante S: su stock bajó a 7, la variante M
  y el costo del producto padre no se movieron, costo histórico
  congelado en 30000.
- Rechazos correctos: vender el producto sin elegir variante
  (`"Asad bourbon" tiene variantes: elegí una para vender.`); pedir 100
  de la variante M aunque S+M agregado alcanzarían
  (`No hay suficiente stock de "Asad bourbon" (Talle: M) (disponible: 5)`).
- Editar la venta cambiando de variante S→M con cantidad 2: S volvió a
  10 (liberado), M bajó a 3 (nuevo pedido) — sin mezclar los dos stocks.
- Anular la venta editada: M volvió a 5. Restaurar: M volvió a bajar a 3.
  Los dos movimientos correctos, sin duplicar ni perder cantidad.
- Regresión de control sobre un producto sin variantes (Khamrah): editar/
  anular/restaurar se comportó exactamente igual que antes de esta
  etapa (stock 0→1 al anular→0 al restaurar).
- Presupuesto con un ítem de variante M: creado, editado (cantidad
  1→2), convertido a venta — la venta resultante quedó con
  `variante_id` correcto y el stock de M bajó de 3 a 1 en el mismo paso.
- `npm test` (los 3 tests de inventario de rutas/permisos) verde antes y
  después.

**A diferencia de la Etapa 2, esta vez sí hubo herramienta de navegador
disponible** (Playwright 1.63, ya cacheado en un scratchpad de sesiones
anteriores en `/tmp/claude/pwscratch`, sin necesidad de instalar nada
nuevo — solo copiar el script de chequeo ahí para que resolviera el
`require('playwright')` local). Se hizo la pasada visual real que había
quedado pendiente en la Etapa 2:
- Nueva venta: tipear "Asad bourbon" muestra el select con "Talle: S" /
  "Talle: M"; elegir una variante actualiza el `max` de cantidad al
  stock de esa variante puntual (confirmado con el valor real, no un
  mock).
- Editar una venta existente con variante: el modal precarga
  correctamente el producto, la variante (`Talle: M` seleccionada) y la
  cantidad.
- Editar un presupuesto existente con variante: mismo prellenado
  correcto, en tema claro.
- Mobile (420px): el formulario en general se ve bien; la fila de ítem
  (producto+variante+cantidad+precio en una sola línea flex) queda
  apretada, pero es exactamente el mismo layout `.item-row` que ya usa
  la fila de compra desde la Etapa 2 — no es una regresión de esta
  etapa, es un límite de diseño preexistente que ninguna de las dos
  etapas se propuso resolver.
- Datos de prueba quedaron en la copia de scratchpad únicamente
  (ventas #10/#11/#12, presupuestos #2/#3, compra #4, cliente "Cliente
  Test"/"Cliente Presu"/"Cliente Presu UI") — la base real
  (`backend/db/nexo.db`) no se tocó en ningún momento de esta
  verificación. El proceso de prueba en el puerto 3002 se detuvo al
  terminar.

### Qué sigue

Etapas 4 a 6 del plan madre (precio por lista a nivel variante,
devoluciones con variante, bloqueo del asistente IA) — ninguna se
empezó, quedan para cuando el usuario lo pida explícitamente. Antes de
eso: **confirmar con el usuario si conviene commitear el bloque de
Etapas 1+2+3 juntas** (siguen todas sin commitear, sobre `solla`) o
esperar a tener más etapas — no se commiteó nada todavía porque no se
pidió.

**Actualización**: en la sesión siguiente el usuario pidió commitear
esto. Quedó en `1dbc86b` ("feat: variantes de producto (atributos,
compras y ventas/presupuestos)"), sobre `solla`, sin push. Ver §32 para
la Etapa 4.

## 32. Variantes de producto — Etapa 4 (precio por lista a nivel variante)

**Objetivo**: que el precio sugerido en Venta/Presupuesto respete un
precio propio de la variante elegida, con la cadena de fallback del plan
madre: `variante_precios` → `producto_variantes.precio_venta` → precio
del producto padre en esa lista (que a su vez cae a `precio_venta` del
producto si no tiene precio propio ahí). Commiteada junto con Etapas
1+2+3 en `1dbc86b`.

**Hallazgo clave antes de escribir código**: el backend de esta etapa ya
estaba hecho desde la Etapa 1 — `producto_variantes.precio_venta`,
`variante_precios`, `obtenerPreciosPorVariante`, `decorarVariante` (con
su `precios` por lista) y el `PATCH /api/productos/:id/variantes/:id`
que ya acepta `precios` en el body y hace upsert contra `variante_precios`
ya existían. Lo que faltaba era exclusivamente:
1. Frontend: UI para cargar el precio por lista de una variante (solo se
   podía cargar el `precio_venta` genérico, nunca `precios[listaId]`).
2. Frontend: usar esa cadena de fallback para sugerir/reproponer el
   precio en los formularios de Venta y Presupuesto cuando el ítem tiene
   variante — hoy sugería siempre el precio del producto padre, ignorando
   la variante elegida.

No hizo falta ningún cambio en `backend/server.js` ni en el schema.

**`frontend/index.html`**: la tabla de "Variantes" (dentro de
`#modalVariantesProducto`) gana una columna nueva "Precios por lista"
entre "Precio de venta" y "Stock".

**`frontend/js/app.js`**:
- `preciosPorListaVarianteHtml(v)` (nueva): mismo patrón que
  `poblarPreciosPorLista` (Productos) — un mini-input por cada lista
  activa que no sea la predeterminada (esa se edita en la columna "Precio
  de venta"). Se usa dentro de `renderVariantesTabla`, que ahora arma esa
  celda y, en el handler de "Guardar", junta esos inputs en un objeto
  `precios` (input vacío = no se manda, igual criterio que Productos) que
  viaja en el mismo PATCH que ya mandaba `sku`/`precio_venta`/`activo`.
  `filaVacia` pasó de colspan 6 a 7 por la columna nueva.
- `precioVarianteEnLista(variante, producto, listaId)` (nueva, al lado de
  `precioProductoEnLista`): implementa la cadena de fallback completa.
  Sin variante, delega directo en `precioProductoEnLista`.
- `agregarFilaItemVenta`: la fila gana una variable de closure
  `variantesFila` (el array crudo de `GET .../variantes`, no solo el
  HTML del `<select>`) para poder resolver el precio de la variante
  elegida sin refetchear. El listener de `change` del select de variante
  (que hasta la Etapa 3 solo actualizaba `cantidad.max`) ahora también
  recalcula `precio.value` con `precioVarianteEnLista` — elegir variante
  refina el precio recién sugerido al resolver el producto, mismo
  criterio de que "tocar un selector de esta fila re-sugiere precio" que
  ya regía para el nombre del producto.
- `reproponerPreciosPorLista` (cambia la lista de precios de una
  Venta/Presupuesto con ítems ya cargados) pasó a `async`: por cada fila
  con variante elegida, resuelve sus datos vía `variantesDeProducto`
  (cacheada, no refetchea) y usa `precioVarianteEnLista` en vez de
  `precioProductoEnLista`; sin variante, camino idéntico al de antes. El
  criterio de "no pisar un precio tocado a mano" se extendió: ahora
  compara contra los precios conocidos de la variante Y del producto
  padre juntos.
- No se tocó `agregarFilaItemCompra`/`leerItemsCompra`: esta etapa es
  específicamente sobre precios de venta (listas de precios no aplican a
  costos de compra).

**Verificación**: copia aislada en scratchpad, servidor de prueba en el
puerto 3002. `npm test` verde antes y después (sin endpoints nuevos). Se
armó un producto "Remera" (precio_venta 10000) con lista "Mayorista"
adicional (precio 8000 a nivel producto) y dos variantes: "Talle: S" (sin
precio propio) y "Talle: M" (`precio_venta` propio 15000). Se extrajo
`precioVarianteEnLista`/`precioProductoEnLista` del archivo real y se
corrió standalone en Node con los 4 casos cruzados (variante×lista) más
el caso sin variante — los 5 coincidieron con lo esperado por el diseño,
incluyendo el caso no obvio: el `precio_venta` genérico de una variante
gana por sobre el precio de lista del producto padre (M en Mayorista dio
15000, no 8000), tal cual especifica el orden de la cadena en el plan.
Pasada visual con Playwright (tema claro, mobile 420px): el modal de
variantes muestra y guarda el precio por lista correctamente (persistió
tras cerrar/reabrir el modal), y en Nueva Venta elegir "Talle: S" con
lista Mayorista sugirió 9000 (precio propio de esa variante en esa
lista) y cambiar a "Talle: M" sugirió el precio propio de M — con aviso
"Se actualizaron N precio(s) según la lista elegida." confirmando que
`reproponerPreciosPorLista` corrió bien de punta a punta. No se probó
tema oscuro esta vez (el toggle de tema vive en la sidebar, colapsada en
la vista mobile de la captura; no bloqueó la verificación porque los
elementos nuevos reusan clases genéricas — `.form label`-like, tabla
`.ledger-table` — ya probadas en oscuro en etapas anteriores). Datos de
prueba solo en la copia de scratchpad; la base real no se tocó.

### Qué sigue

Etapas 5 (devoluciones con variante) y 6 (bloqueo del asistente IA sobre
productos con variantes) del plan madre — ninguna empezada.

**Actualización**: el usuario pidió commitear esta etapa también. Quedó
en `04696f6` ("feat: precio por lista a nivel variante en ventas y
presupuestos"), sobre `solla`, sin push.

## 33. Variantes de producto — Etapa 5 (devoluciones con variante)

**Objetivo**: threading puro de `variante_id` en devoluciones de venta y a
proveedor, tal cual lo define el plan madre — se copia igual que ya se
copia `producto_id`/`costo_unitario_historico` en esos mismos flujos, sin
lógica de negocio nueva. La migración de columnas ya existía desde la
Etapa 1 (`devolucion_items.variante_id` y
`devolucion_proveedor_items.variante_id` ya estaban en el loop de
`backend/db/index.js`), así que todo el trabajo fue en `backend/server.js`
y en los dos modales de devolución del frontend.

**`backend/server.js`**:
- `itemsDevolviblesDeVenta`/`itemsDevolviblesDeCompra`: suman
  `variante_id` al SELECT (antes solo devolvían `producto_id`).
- `POST /api/devoluciones`: valida y guarda `variante_id` en el INSERT de
  `devolucion_items`; el mensaje de "no se puede devolver más de lo
  vendido" ahora agrega `(combinacionVariante(...))` cuando el renglón
  tiene variante.
- `aplicarDevolucion`/`revertirDevolucion`: el SELECT de
  `devolucion_items` trae `variante_id` y se lo pasa a
  `registrarMovimientoStock` — la devolución ahora entra/sale del stock de
  la variante correcta, no del stock general del producto.
- `GET /api/devoluciones/:id`: los items devueltos incluyen `variante_id`
  y `combinacion` (mismo criterio que ya usan `GET /api/ventas/:id` y
  `GET /api/compras/:id`).
- Espejo completo del lado proveedor: `itemsDevolviblesDeCompra`,
  `aplicarDevolucionProveedor`/`revertirDevolucionProveedor` (estas dos
  además ahora llaman `recalcularCostoVariante` por cada variante tocada,
  igual que ya hacían con `recalcularCostoProducto` por producto — acá SÍ
  hace falta, a diferencia de la devolución de venta, porque se está
  revirtiendo costeo, mismo motivo que ya explica el comentario existente
  arriba de `aplicarDevolucionProveedor`), `GET
  /api/devoluciones-proveedor/:id`, e inserción de `variante_id` en `POST
  /api/devoluciones-proveedor`.
- **Bug real encontrado y corregido de paso** (no estaba en el alcance
  original de "threading puro", pero esta etapa es la primera que toca
  este código exacto): la validación de stock suficiente en `POST
  /api/devoluciones-proveedor` consultaba `stock_por_deposito` (agregado
  del producto) sin importar si el renglón tenía variante. Con productos
  con variantes esto podía aprobar una devolución a proveedor de una
  variante sin stock propio con tal de que el producto padre (sumando
  todas sus variantes) tuviera stock suficiente, o rechazar una devolución
  válida de una variante con stock de sobra si otra variante hermana
  estaba en 0. Se corrigió bifurcando igual que ya bifurca el resto del
  código (`item.variante_id ? stock_variante_por_deposito :
  stock_por_deposito`, mismo patrón que ya usa `restaurar` de venta en
  `backend/server.js` ~línea 3386-3392); el master plan ya señalaba este
  gap como pendiente de revisar "si da problemas al construir la Etapa 3"
  — recién en la Etapa 5 el código llegó a tocar esa validación en
  concreto.

**`frontend/js/app.js`**: `abrirModalDevolucion` y
`abrirModalDevolucionProveedor` ahora muestran `(combinación)` al lado del
nombre del producto en cada renglón del modal, cuando el item tiene
variante — mismo formato que ya usan las tablas de ítems de Venta/Compra.
No hizo falta tocar el backend de esas fichas (`GET /api/ventas/:id` y
`GET /api/compras/:id` ya devolvían `combinacion` desde etapas
anteriores).

**Verificación**: copia aislada en scratchpad, servidor de prueba en el
puerto 3002 (nunca el 3000 ni la base real). `npm test` verde antes y
después (sin endpoints nuevos). Se armó un flujo completo por HTTP (script
Node con `fetch`, sesión con cookie): producto "Remera Test" con atributo
Talle (valores S y M, M con `precio_venta` propio 15000) → compra de 10
unidades de la variante S (confirmada y recibida) → venta de 4 unidades de
esa misma variante → devolución de venta de 2 unidades (con
`vuelve_stock`) → devolución a proveedor de 3 unidades. En cada paso se
confirmó que `variante_id`/`combinacion` viajan correctos en las
respuestas y que el stock evolucionó bien: 10 (compra) − 4 (venta) = 6 → +2
(devolución de venta) = 8 → −3 (devolución a proveedor) = 5. Se probó
además que devolver a proveedor más de lo que queda disponible cae con el
mensaje de error correcto incluyendo la combinación. Pasada con Playwright
sobre esos mismos datos: el modal de devolución de venta mostró `"Remera
Test (Talle: S) (vendidas: 4, disponibles: 2)"` y el de devolución a
proveedor `"Remera Test (Talle: S) (compradas: 10, disponibles: 7)"` — la
combinación se ve en ambos modales tal como se buscaba. Datos de prueba
solo en la copia de scratchpad; la base real no se tocó.

### Qué sigue

Etapa 6 del plan madre (bloqueo del asistente IA sobre productos con
variantes) — la última del epic "Variantes de producto", todavía no
empezada. Etapa 5 está verificada pero, al momento de escribir esto,
todavía no se le preguntó al usuario si commitearla.

**Actualización**: en la sesión siguiente el usuario pidió commitear la
Etapa 5. Quedó en `097787a` ("feat: devoluciones con variante de
producto"), sobre `solla`, sin push. Ver §34 para la Etapa 6.

## 34. Variantes de producto — Etapa 6 (bloqueo del asistente IA)

**Objetivo**: la última etapa del epic. Antes de esta etapa, si el
asistente de texto/IA proponía una venta o compra sobre un producto con
variantes activas, la propuesta se armaba igual y recién fallaba al
confirmar (con el `ErrorBulk` del backend). Ahora el bloqueo se adelanta
al momento de interpretar el texto: la propuesta vuelve con
`ejecutable: false` y el problema listado, antes de que el usuario
intente confirmarla. Sin soporte de variantes para el LLM —
`interprete.js` no se tocó, sigue fuera de alcance (el asistente no
puede proponer una variante puntual, solo bloquea cuando el producto las
tiene).

**`backend/server.js`**: única función tocada, `resolverPropuesta(tipo,
datos)` (~7468). Nuevo helper `tieneVariantesActivas(productoId)`
(al lado de `buscarPorNombre`/`existeId`, mismo estilo no cacheado),
espejo de la query ya usada 4 veces en el archivo (`SELECT COUNT(*) AS n
FROM producto_variantes WHERE producto_id = ? AND activo = 1`). Se llama
dentro del `.map` de items tanto en el bloque `tipo === 'venta'` como en
`tipo === 'compra'`: cuando `producto.estado === 'resuelto'` y el
producto tiene variantes activas, agrega a `problemas` el mensaje
`"${nombre}" tiene variantes: elegí la variante exacta a mano.` (mismo
texto base que ya usan `crearVenta`/`crearCompra`, adaptado porque acá no
hay una fila con selector para elegir ahí mismo). En compra, el chequeo
solo corre si el producto ya existe — un producto "no encontrado" en
compra no aplica, ese camino da de alta un producto nuevo sin variantes.
No hizo falta tocar el frontend: `frontend/js/app.js:8078` ya renderiza
cualquier string que venga en `problemas`, así que el mensaje nuevo se
muestra gratis. No hubo endpoints nuevos, así que no hizo falta tocar
`permisos.js` (confirmado con `npm test`).

**Verificación**: copia aislada en scratchpad, servidor de prueba en el
puerto 3002 (nunca el 3000 real). `npm test` verde antes y después. Como
`POST /api/asistente/interpretar` depende del LLM (`@google/genai`) y no
había forma de probarlo end-to-end sin esa dependencia externa en esta
sesión, se verificó `resolverPropuesta` extraído del archivo real y
corrido standalone en Node contra la copia de la base (mismo criterio ya
usado en la Etapa 4 para `precioVarianteEnLista`), con un producto
"RemeraVarianteTest" armado por API con una variante "Talle: S": venta
sobre ese producto → bloqueada con el mensaje esperado; venta sobre un
producto sin variantes (Khamrah) → sigue proponiéndose normal, sin
mensaje nuevo (regresión); compra sobre el mismo producto con variantes
→ bloqueada; compra sobre un producto nuevo que no existe todavía →
sigue sin bloquear (regresión: el alta de producto nuevo por nombre en
compra no tiene variantes, no debe frenarse). Los 4 casos coincidieron
con lo esperado. Datos de prueba solo en la copia de scratchpad; la base
real no se tocó.

### Qué sigue

Con la Etapa 6 termina el epic completo "Variantes de producto" (las 6
etapas del plan madre). Queda pendiente commitear esta etapa — no se
commiteó todavía porque no se le preguntó al usuario en esta sesión.
Después de eso, según CLAUDE.md la próxima área declarada es "gestión de
precios" e "inventario" en V2, pero el alcance exacto todavía está en
"a confirmar" — no arrancar sin preguntarle al usuario qué sigue.

**Actualización**: la Etapa 6 quedó commiteada en `5193d75` ("feat:
bloquear asistente IA en productos con variantes activas"), sobre
`solla`, sin push. Ver §35 para lo que se hizo después.

## 35. Margen objetivo por producto

**Objetivo**: CLAUDE.md §4 lista "margen objetivo" y "markup objetivo"
como campos posibles de un producto. Se implementó solo `margen_objetivo`
(%) — un único campo, no los dos: son matemáticamente convertibles entre
sí y CLAUDE.md §4 pide no duplicar información derivada; si algún día
hace falta mostrar markup, se deriva al vuelo. Uso puramente informativo:
compara el margen real del producto (lista predeterminada, ya calculado
como `margen` en `decorarProducto`) contra el objetivo cargado y expone
una alerta booleana. No sugiere ni fuerza precios de venta. Alcance: solo
a nivel producto, no por variante ni por lista de precios.

**Migración** (`backend/db/schema.sql` + `backend/db/index.js`): columna
nueva `productos.margen_objetivo REAL`, nullable, sin `DEFAULT`. Mismo
patrón ya usado para `categoria_id`/`stock_maximo`: `PRAGMA table_info` +
`ALTER TABLE ADD COLUMN` idempotente en el arranque del server. Aditiva y
sin impacto en filas existentes — quedan con `margen_objetivo = NULL`
(comportamiento neutro: sin objetivo cargado no hay alerta).

**`backend/server.js`**:
- `SELECT_PRODUCTO` suma `margen_objetivo`.
- `decorarProducto` calcula `margen` en una variable local primero y
  agrega `margen_bajo_objetivo`: `null` cuando no hay objetivo cargado o
  no hay margen calculable (nunca `false` por defecto, sería engañoso),
  si no `margen < margen_objetivo` (comparación estricta; igualdad exacta
  cuenta como "cumple").
- `normalizarMargenObjetivo(valor)` (junto a `normalizarCategoriaId`):
  `''`/`null`/`undefined` → `null`, si no `Number(valor)`.
- `validarProducto`: si viene `margen_objetivo`, debe ser un número entre
  0 (inclusive) y 100 (exclusivo); si no, 400.
- `POST /api/productos`, `CAMPOS_BULK_PRODUCTO` y `aplicarEdicionProducto`
  (el punto único de edición para PATCH singular y bulk) quedaron
  extendidos igual que el resto de los campos editables. En
  `aplicarEdicionProducto` el punto crítico es que el `SELECT` del
  producto actual también trae `margen_objetivo`: como la función
  re-selecciona la fila y la fusiona con los cambios parciales, si faltara
  ahí un PATCH que no toca este campo lo pisaría con `null` en cada
  edición (mismo mecanismo que ya sostiene `stock_minimo`/`stock_maximo`).
  Queda auditado vía `diffCampos`.
- `CLAVES_SENSIBLES` suma `margen_objetivo` y `margen_bajo_objetivo` —
  mismo trato que `margen`/`costo`/`ganancia`: un empleado no-admin no
  debe ver nada de rentabilidad, ni en el JSON de `GET /api/productos`.
- No se tocaron `GET /api/stock`, `GET /api/reportes/stock` (arman su
  propio objeto de salida, el campo no se cuela solo), las altas
  automáticas de producto por nombre (compra/asistente, quedan en `NULL`
  como ya pasa con `stock_minimo`/`categoria_id`), ni `permisos.js` (no
  hay endpoints nuevos, confirmado con `npm test`).

**Frontend** (`frontend/index.html` + `frontend/js/app.js`):
- Input nuevo "Margen objetivo (%)" en el formulario de alta/edición de
  producto, mismo patrón que `stock_maximo` (vacío → `null`).
- Ficha de detalle: filas "Margen objetivo" y "Vs. objetivo" dentro del
  bloque ya envuelto en `esAdmin() ? [...] : []` que muestra "Margen".
- Tabla de listado: columna nueva "Objetivo" con clase `col-admin` (se
  oculta para no-admin vía CSS, igual que Costo/Margen), con un helper
  `badgeMargenObjetivo(p)` que reusa las clases CSS ya existentes
  `.status-cobrado` (verde, "En objetivo") y `.status-pendiente`
  (naranja, "Bajo objetivo") — no hizo falta CSS nuevo.
- Bulk edit: `.bulk-campo` nuevo para `margen_objetivo` en
  `#formBulkProductos`; vacío → `null` explícito (borra el objetivo).
- `filtrosProductos`: filtro numérico por `margen_objetivo` y un select
  por `margen_bajo_objetivo` (`"true"`/`"false"`).
- `COLUMNAS_CSV_PRODUCTOS`: dos columnas nuevas con `admin: true`, mismo
  patrón que `margen`.
- No hizo falta ningún guard extra para no-admin: como `CLAVES_SENSIBLES`
  ya filtra estos campos del JSON, llegan `undefined` al frontend, y
  todos los puntos de lectura de arriba ya toleran `== null`.

**Verificación**: copia aislada en scratchpad, servidor de prueba en el
puerto 3002 (nunca el 3000 real ni la base real). `npm test` verde antes
y después (sin endpoints nuevos). Se confirmó la migración: columna
ausente antes del primer arranque, presente después, y un segundo
reinicio del proceso no la duplica ni pisa los valores ya cargados
(idempotencia). Por API (admin, vía curl con cookie de sesión): producto
sin objetivo trae ambos campos en `null`; `PATCH` con
`margen_objetivo: 50` sobre un producto con margen real ~49.09% da
`margen_bajo_objetivo: true`; con el objetivo igualado exacto al margen
real da `false` (la igualdad cuenta como "cumple"); un `PATCH` parcial
que solo cambia `precio_venta` sin tocar `margen_objetivo` no lo borra
(confirma el punto crítico del `SELECT` en `aplicarEdicionProducto`);
límites de validación: `-5`, `100` y `150` rechazados con 400, `0`
aceptado; bulk edit sobre dos productos a la vez actualiza cada uno con
su propio `margen_bajo_objetivo` calculado contra su propio margen real;
`GET /api/auditoria` registra el diff de cada cambio (single y bulk);
alta de producto nuevo con `margen_objetivo` cargado directo en el
`POST` funciona igual. Con un usuario no-admin, `GET /api/productos`
confirmado que **no trae** `margen_objetivo` ni `margen_bajo_objetivo` en
ninguna fila (ausentes del JSON, no solo `null`); un PATCH de no-admin
sobre un producto da 403 (regresión de `soloAdmin`, no relacionado al
campo nuevo pero confirmado sin romperse). Datos de prueba solo en la
copia de scratchpad; la base real no se tocó.

No se hizo verificación visual en navegador en esta sesión — no había
herramienta de automatización de browser disponible en el entorno. Se
compensó con la batería de pruebas por API de arriba, que cubre toda la
lógica de negocio (cálculo, validación, persistencia parcial, permisos,
auditoría), pero falta la pasada visual (formulario, ficha, columna con
badge, bulk edit, filtro, CSV) antes de dar el feature por completamente
cerrado.

### Qué sigue

Falta: (1) pasada visual en navegador de esta etapa (ver arriba), (2)
preguntarle al usuario si commitea este trabajo sobre `solla`, (3) una
vez cerrado esto, definir con el usuario el alcance de "gestión de
precios" / "inventario" en V2 (CLAUDE.md lo deja como "a confirmar", no
arrancar sin esa conversación).

## 36. Reescritura de CLAUDE.md — de proyecto escolar a producto real

Sesión de planificación pura, sin tocar código de `backend/` ni
`frontend/`. El usuario corrigió el marco del proyecto: aunque Nexo nació
como trabajo de escuela, el estándar a partir de ahora es el de un
producto real, pensado para competir con sistemas de gestión ya
existentes en el mercado argentino (Dux Software, Contagram —
`docs/competencia.txt`). La única restricción real es de costo, no de
ambición: preferir siempre la solución más barata que cumpla el
requisito completo, nunca una versión recortada del requisito.

**Decisiones tomadas con el usuario en esta sesión** (ver tabla completa
en `CLAUDE.md`, preámbulo):

- App móvil → PWA (instalable, offline básico), no app nativa por ahora.
- Frontend → sigue vanilla, pero modularizado por dominio a medida que
  crece (`app.js` hoy tiene ~9400 líneas en un solo archivo).
- Multi-empresa → SaaS multi-tenant real (`organizacion_id` en tablas de
  negocio, aislamiento por empresa). Hoy `organizaciones` tiene una sola
  fila y ninguna tabla de negocio tiene esa columna: es preparación de
  arquitectura, no implementación.
- Base de datos → SQLite ahora, con SQL portable y acceso a datos
  concentrado en `backend/db/`, para poder migrar a Postgres el día que
  haya varias empresas escribiendo en simultáneo.
- Rubros (comercio, carnicería, gastronomía...) → un solo sistema
  configurable por "perfil de rubro", nunca versiones de código
  separadas. Regla dura anotada: nunca un `if (rubro === ...)` con
  lógica de negocio adentro.
- IVA → **entra al modelo** (revierte la decisión anterior de dejarlo
  fuera de V1). Categoría fiscal elegible por el usuario en cliente y
  producto; IVA discriminado por renglón en venta/compra/presupuesto. Es
  requisito previo para ARCA. Los placeholders `IVA_ALICUOTA` y
  `RETENCION_MP_EJEMPLO` dejan de ser código muerto.
- Meta Ads / ROAS → reconocido como parte de la visión, pospuesto
  explícitamente (`CLAUDE.md §39`).

**Restricción dura que definió cómo se editó el documento:** el código
cita `CLAUDE.md` por número de sección en decenas de comentarios
(`server.js`, `schema.sql`, `db/index.js`, `app.js`), y este mismo
handoff también. Por eso §1–§27 **conservaron su número y su tema**: se
corrigió y amplió el contenido de varias (§4 Productos, §6 Compras, §8
Ventas, §10 Clientes, §15 Presupuestos, §16 Facturación, §20 Reportes,
§25 Principio de MVP — esta última pasó a marcar el MVP como completo),
pero nada se renumeró ni se fusionó. Las secciones nuevas se agregaron
después de §27, del §28 al §39:

| § | Tema |
|---|---|
| 28 | Multi-empresa (multi-tenant) |
| 29 | Perfiles de rubro y módulos activables |
| 30 | Punto de venta (POS) y turno de caja |
| 31 | Frontend, PWA y arquitectura de cliente |
| 32 | Integraciones (Mercado Libre, Tienda Nube, ARCA, etc.) |
| 33 | Facturación electrónica ARCA |
| 34 | Portabilidad de datos y evolución del esquema (SQLite → Postgres) |
| 35 | Seguridad y operación |
| 36 | IA operativa (amplía §21) |
| 37 | Qué significa "competir" |
| 38 | Roadmap por etapas |
| 39 | Fuera de alcance por ahora |

**Verificación hecha:** se confirmó con `grep` que todas las secciones
citadas por el código (§3 a §23) conservan tema tras la edición, que no
quedó texto de las reglas vencidas ("fuera de V1", "V2"), y que
`backend/test` sigue en verde (no se tocó código en esta sesión — el
único diff de `backend/` y `frontend/` que aparece en `git status` es el
de la etapa 35, sin commitear, ya documentado arriba).

### Roadmap acordado (CLAUDE.md §38)

Orden elegido para que abarate lo que sigue y para que las dos personas
del equipo trabajen en paralelo sin pisarse: **0)** cerrar y commitear la
etapa 35 pendiente (pasada visual incluida) → **A)** multi-empresa
(backend) y **B)** modularizar `app.js` + base de PWA (frontend), en
paralelo → **C)** IVA y categoría fiscal → **D)** POS y turno de caja →
**E)** ARCA (homologación → producción) → **F)** perfiles de rubro +
unidad de medida fraccionable → **G)** integraciones Mercado
Libre/Tienda Nube → **H)** reportes avanzados → **I)** IA por voz y
WhatsApp. Ninguna etapa se arranca sin planificarla primero con el
usuario (regla ya existente de `CLAUDE.md §27`, reafirmada para las
secciones nuevas).

### Qué sigue

1. Cerrar la etapa 35 (pendiente desde antes de esta sesión): pasada
   visual en navegador + decidir con el usuario si commitear.
2. Retomar el roadmap de `CLAUDE.md §38` empezando por la etapa 0 y
   después A/B en paralelo — planificando cada una con el usuario antes
   de escribir código, como exige `CLAUDE.md §27`.
3. Esta sesión no generó commit (fue solo edición de `CLAUDE.md` y de
   este handoff): sigue sin decidirse si `CLAUDE.md`/`handoff.md` se
   commitean junto con la etapa 35 pendiente o por separado.

## 37. Etapa A (multi-empresa) — `productos`, `clientes` y `proveedores`

**Objetivo**: sentar el patrón end-to-end de aislamiento multi-tenant
(CLAUDE.md §28) y cubrir con él las tres primeras tablas de negocio, antes
de replicarlo en el resto de las ~35 que faltan. Arrancó como piloto de
`productos` solamente; el usuario pidió seguir "lo más que se pueda" en la
misma sesión, así que se extendió a `clientes` y `proveedores`, incluyendo
todos los caminos de "autocrear por nombre" que ya existían en ventas,
compras, presupuestos y facturas — sin esto último, cualquier cliente/
proveedor/producto creado al vuelo desde esos flujos hubiera quedado con
`organizacion_id` NULL y habría desaparecido de los listados ya filtrados
(regresión real, no una mejora pendiente). Sigue sin ser la Etapa A
completa: faltan ~35 tablas más.

**`backend/db/schema.sql`**: `productos`, `clientes` y `proveedores` ganan
`organizacion_id INTEGER REFERENCES organizaciones(id)`, nullable a
propósito (todavía no hay UI para elegir organización en el alta, y el
resto de las tablas no la tiene). Son referencias hacia adelante en el
archivo (`organizaciones` se define más abajo) — SQLite lo permite sin
problema, no valida la tabla referenciada al momento del `CREATE TABLE`.

**`backend/db/index.js`**: migración aditiva idempotente para bases
existentes, mismo patrón que las anteriores (`PRAGMA table_info` +
`ALTER TABLE ADD COLUMN`) para las tres tablas. El backfill se generalizó a
un loop:
```js
for (const tabla of ['productos', 'clientes', 'proveedores']) {
  db.exec(
    `UPDATE ${tabla} SET organizacion_id = (SELECT id FROM organizaciones ORDER BY id LIMIT 1)
      WHERE organizacion_id IS NULL`
  );
}
```
colocado DESPUÉS del seed de `organizaciones` (que crea la primera fila más
abajo en el archivo): en una base nueva, `organizaciones` todavía está
vacía en el punto donde corre la migración de columnas. Re-ejecutable (solo
toca filas en `NULL`).

**`backend/server.js`**:
- `sesionValida()` trae `usuarios.organizacion_id` en el SELECT, disponible
  como `req.usuario.organizacion_id` en cada request autenticado.
- `GET/POST/PATCH` de `productos`, `clientes` y `proveedores` (incluido
  `GET /:id`) filtran/asignan por `req.usuario.organizacion_id`. Un id de
  otra organización da 404 igual que "no existe" (regla dura de §28:
  "ninguna consulta puede cruzar datos de dos empresas").
- `aplicarEdicionProducto` (PATCH singular y bulk de productos): mismo
  filtro en el SELECT que busca el producto.
- **Caminos de autocreación por nombre**, todos actualizados para que la
  fila nueva nazca con el `organizacion_id` correcto en vez de NULL:
  - `resolverCliente(cliente, cliente_id, organizacionId)` (ahora recibe la
    organización como tercer parámetro): usado por presupuestos
    (POST/PUT), por `POST /api/facturas` y por `PUT /api/ventas/:id`.
  - `crearVenta({..., organizacion_id})`: delega en `resolverCliente`.
    Actualizados sus 3 call sites (`POST /api/ventas`, conversión de
    presupuesto, ejecución del asistente).
  - `crearCompra({..., organizacion_id})`: resuelve/crea proveedor y
    producto con la organización. Actualizados sus 2 call sites (`POST
    /api/compras`, ejecución del asistente).
  - `PUT /api/compras/:id`: tiene su propia lógica inline (no pasa por
    `crearCompra`) para resolver/crear proveedor y producto por nombre —
    se actualizó por separado, con el mismo criterio.
- No se tocaron los endpoints de atributos/variantes de producto, ni
  ninguna otra tabla de negocio (stock, tesorería, gastos...): queda para
  las próximas sesiones, repitiendo este mismo patrón. Las tablas `ventas`,
  `compras`, `presupuestos` y `facturas` en sí (las cabeceras) tampoco
  tienen la columna todavía — solo se les enseñó a asignarla correctamente
  cuando autocrean un cliente/proveedor/producto.

**Verificación**: copia aislada en scratchpad, servidor de prueba en el
puerto 3002 (nunca el 3000 real ni la base real; el proceso viejo quedó
escuchando en un reinicio y hubo que matarlo por PID con `taskkill` antes
del segundo arranque — `pkill` no lo encontró en este entorno Windows).
Cubierto por HTTP: `GET/POST/PATCH` de productos/clientes/proveedores;
venta nueva con cliente por nombre (con y sin stock disponible); compra
nueva con proveedor y producto por nombre; `PATCH
/api/compras/:id/estado-envio` a `recibido` para dar stock real antes de
vender; presupuesto y factura suelta con cliente por nombre; `PUT
/api/compras/:id` reemplazando proveedor y producto por nombres nuevos. En
todos los casos la fila autocreada apareció en su GET filtrado con
`organizacion_id: 1`. Idempotencia confirmada reiniciando el proceso: sin
errores de migración, mismos datos y misma cantidad de productos antes y
después. `npm test` verde. Datos de prueba solo en la copia de scratchpad;
la base real no se tocó.

### Qué sigue

1. Replicar el mismo patrón (columna + backfill + filtrado en queries +
   revisar autocreación por nombre) en el resto de las ~35 tablas de
   negocio, tabla por tabla o agrupando por dominio (ventas, compras,
   presupuestos, facturas, stock, tesorería...). Este paso ya deja
   `productos`/`clientes`/`proveedores` como referencia del patrón,
   incluida la parte de autocreación que no había quedado registrada en el
   piloto original.
2. ~~Preguntarle al usuario si commitea este paso antes de seguir con la
   próxima tabla.~~ Resuelto en la sesión siguiente (§38): se commiteó
   primero, como su propio commit, antes de tocar nada nuevo.
3. Cuando el resto de las tablas tenga la columna, evaluar pasar
   `organizacion_id` a `NOT NULL` en cada una (hoy es nullable a propósito
   en todas partes donde se agregó).

## 38. Etapa A (multi-empresa) — `ventas` y `compras` (cabecera)

**Objetivo**: siguiente lote del mismo patrón de §37, sobre las dos
cabeceras transaccionales más centrales. Decisiones tomadas con el usuario
antes de arrancar: (a) commitear primero el trabajo pendiente de §37, como
su propio commit; (b) elegir `ventas`/`compras` como siguiente lote en vez
de los catálogos con `UNIQUE(nombre)` (`categorias`, `listas_precios`,
`depositos`, `cuentas_tesoreria`, `categorias_gasto`), que necesitan el
patrón de reconstrucción completa de §34 (su `UNIQUE` es a nivel columna) y
además cambian la regla de "una predeterminada" de global a por
organización — quedan para una etapa aparte, más riesgosa; (c) `venta_items`
y `compra_items` no suman columna propia, se filtran vía `JOIN` a su
cabecera.

**`backend/db/schema.sql` / `backend/db/index.js`**: mismo patrón exacto que
§37 — `organizacion_id INTEGER REFERENCES organizaciones(id)` nullable en
ambas tablas, `ALTER TABLE ADD COLUMN` idempotente, y `'ventas'`/`'compras'`
se agregaron al mismo loop de backfill que ya recorría
`productos`/`clientes`/`proveedores`.

**`backend/server.js`**:
- `crearVenta`/`crearCompra` ya recibían `organizacion_id` desde §37 (lo
  usaban solo para resolver/crear cliente, proveedor y producto); ahora
  además lo escriben en el `INSERT INTO ventas`/`INSERT INTO compras`.
- `GET /api/ventas`, `GET /api/ventas/:id`, `GET /api/compras`,
  `GET /api/compras/:id`: filtrados por `organizacion_id`.
- Todos los endpoints que buscan una venta/compra por id para operar sobre
  ella suman `AND organizacion_id = ?` a esa búsqueda (mismo criterio que
  `aplicarEdicionProducto` en §37: un id de otra organización da 404, nunca
  la operación): `PUT /api/ventas/:id`, `GET/POST /api/ventas/:id/cobros`,
  `POST /api/ventas/:id/facturar`, `POST /api/ventas/:id/anular`,
  `POST /api/ventas/:id/restaurar`, `PUT /api/compras/:id`,
  `POST /api/compras/:id/confirmar`, `POST /api/compras/:id/anular`,
  `POST /api/compras/:id/restaurar`, `aplicarEstadoEnvioCompra` (cubre
  `PATCH .../estado-envio` y el lote), `GET/POST /api/compras/:id/pagos`.
- De yapa, se encontraron y corrigieron dos fugas reales que la migración
  hacía explotables: `POST /api/devoluciones` y
  `POST /api/devoluciones-proveedor` toman `venta_id`/`compra_id` directo del
  body y operaban sobre cualquier id sin chequear organización — con
  `organizacion_id` ya en `ventas`/`compras`, alguien de otra empresa podía
  adivinar un id secuencial y registrar una devolución sobre una venta/compra
  ajena. Mismo fix mecánico: se sumó `AND organizacion_id = ?` a esas dos
  búsquedas puntuales. No se tocó nada más de esos endpoints (las tablas
  `devoluciones`/`devoluciones_proveedor` en sí siguen sin columna propia,
  queda para cuando les toque su etapa).
- Funciones internas que reciben el id ya validado por su caller dentro de la
  misma transacción (`confirmarCompra`, `aplicarStockCompra`) no se tocaron:
  no son punto de entrada externo.

**Gap conocido, no corregido en esta etapa** (fuera de alcance, es un
subsistema aparte): las queries de `/api/resumen/*` y `/api/reportes/*`
(dashboard, comparación de períodos) agregan `ventas`/`compras`/`gastos`/
`devoluciones` sin filtrar por organización en ningún lado — hoy siguen
siendo 100% globales, para cualquier tabla, no solo las de esta etapa.
Cuando se planifique la etapa de reportes multi-empresa hay que revisarlas
todas, no es un fix puntual de una o dos queries.

**Verificación**: copia aislada en scratchpad (servidor de prueba en el
puerto 3911), organización 2 creada a mano (bootstrap de Nexo todavía no
tiene alta de una segunda empresa por API) con su propio admin, hasheando la
password con el mismo `scryptSync`/parámetros que usa el servidor. Con una
venta y una compra activas en la organización 1: `GET /api/ventas` y
`GET /api/compras` desde la organización 2 devuelven `[]`; pedir por id
(`GET`, `anular`, `facturar`, `confirmar`, y `POST /api/devoluciones` con el
`venta_id` de la otra organización) devuelve 404 en todos los casos; la
organización 1 sigue viendo y operando sus propios datos sin cambios.
`npm test` verde antes y después. Proceso de prueba matado y copia de
scratchpad borrada al terminar; la base real no se tocó.

### Qué sigue

1. Presupuestos y facturas son los candidatos naturales del próximo lote
   (misma familia transaccional); facturas trae una decisión de diseño
   propia todavía sin resolver: si la numeración correlativa
   (`idx_facturas_numeracion`, hoy `punto_venta + tipo + letra + numero`
   global) pasa a ser única por organización o se mantiene global — no
   asumir una respuesta, preguntarlo antes de tocar ese índice.
2. Devoluciones, devoluciones a proveedor, gastos, stock/movimientos_stock,
   tesorería y cuentas corrientes quedan pendientes del mismo patrón
   (columna en la cabecera/operación que corresponda, no en el detalle).
3. Los catálogos con `UNIQUE(nombre)` (`categorias`, `listas_precios`,
   `depositos`, `cuentas_tesoreria`, `categorias_gasto`) siguen pendientes
   como su propia etapa, por el motivo explicado arriba (reconstrucción de
   tabla + regla de "predeterminada" por organización).
4. Reportes/resumen (ver "gap conocido" arriba) necesita su propia revisión
   una vez que las tablas de negocio relevantes tengan la columna.

## 39. Etapa A (multi-tenant) — `presupuestos` y `facturas`

**Objetivo**: siguiente lote del mismo patrón de §37/§38, sobre la misma
familia transaccional. Decisión pendiente que dejaba §38 sobre la numeración
de comprobantes (`idx_facturas_numeracion`, hoy global por
`punto_venta+tipo+letra`): se resolvió pasarla a ser **por organización**
(`organizacion_id` sumado al índice) — cada organización es un negocio con su
propio CUIT (CLAUDE.md §28/§33), así que no tiene sentido que comparta
correlativo fiscal con otra.

**`backend/db/schema.sql` / `backend/db/index.js`**: mismo patrón exacto que
§37/§38 — `organizacion_id INTEGER REFERENCES organizaciones(id)` nullable en
`presupuestos` y `facturas`, `ALTER TABLE ADD COLUMN` idempotente, y las dos
tablas se sumaron al mismo loop de backfill que ya recorría
`productos`/`clientes`/`proveedores`/`ventas`/`compras`. `presupuesto_items`
no suma columna propia (se filtra vía JOIN a su cabecera, igual que
`venta_items`/`compra_items`).

Además, `idx_facturas_numeracion` se migró de `(punto_venta, tipo, letra,
numero)` a `(organizacion_id, punto_venta, tipo, letra, numero)`: un `DROP
INDEX` + recreación, guardado detrás de un chequeo de idempotencia contra
`sqlite_master.sql` (si el índice ya incluye `organizacion_id`, no hace
nada). No hizo falta el rebuild completo de tabla de `CLAUDE.md §34` — ese
patrón es solo para `CHECK` sobre columnas; un índice se puede rehacer
directo sin tocar los datos. La migración tiene que correr **después** de
que la columna `organizacion_id` ya existe en `facturas`, así que el bloque
quedó ubicado justo debajo del `ALTER TABLE` correspondiente, no en el lugar
original (más arriba en el archivo) donde el índice se creaba por primera
vez sin esa columna.

**`backend/server.js`**:
- `siguienteNumero` ganó un primer parámetro `organizacionId`; sus tres call
  sites (`POST /api/facturas`, `POST /api/ventas/:id/facturar`,
  `POST /api/devoluciones/:id/nota-credito`) lo actualizaron.
- `GET /api/presupuestos`, `GET /api/presupuestos/:id`, `GET /api/facturas`,
  `GET /api/facturas/:id`: filtrados por `organizacion_id`.
- `POST /api/presupuestos`, `POST /api/facturas` (suelta),
  `POST /api/ventas/:id/facturar`, `POST /api/devoluciones/:id/nota-credito`:
  escriben `organizacion_id` en el `INSERT` correspondiente.
- `PUT /api/presupuestos/:id`, `PATCH /api/presupuestos/:id/estado`,
  `POST /api/presupuestos/:id/convertir`: sus `SELECT ... FROM presupuestos
  WHERE id = ?` ganaron `AND organizacion_id = ?` — un id de otra
  organización da 404, mismo criterio que el resto de los lookups de §37/§38.
- Gap real encontrado y cerrado de yapa (mismo criterio que los de §38):
  `POST /api/presupuestos/:id/convertir` buscaba el presupuesto por id sin
  filtrar organización antes de convertirlo en venta — alguien podía adivinar
  el id de un presupuesto ajeno y convertirlo (leyendo su cliente e items,
  aunque la venta resultante quedara en la organización del atacante). Se
  cerró con el mismo filtro de arriba.
- Segundo gap cerrado: `POST /api/devoluciones/:id/nota-credito` buscaba la
  devolución uniendo con `ventas` pero sin filtrar por
  `ventas.organizacion_id` — con esa columna ya existiendo desde §38, alguien
  podía emitir una nota de crédito sobre la devolución de otra empresa
  adivinando el id. Se sumó `AND ventas.organizacion_id = ?` al JOIN que ya
  estaba ahí (la tabla `devoluciones` en sí sigue sin columna propia, eso
  queda para su propia etapa, igual que en §38).

**Verificación**: copia aislada en scratchpad, servidor de prueba en el
puerto 3913 (nunca el 3000 real ni `nexo.db` real), organización 2 creada a
mano con su propio admin (mismo `scryptSync`/parámetros que el servidor).
Con un presupuesto, una factura suelta, una venta con devolución y su nota de
crédito activos en la organización 1: `GET /api/presupuestos` y
`GET /api/facturas` desde la organización 2 devuelven `[]`; pedir por id
(`GET`/`PUT`/`PATCH estado`/`POST convertir` de presupuestos, `GET` de
facturas, `POST nota-credito` sobre la devolución de la organización 1) da
404 en todos los casos desde la organización 2; la organización 1 sigue
viendo y operando sus propios datos sin cambios. Numeración verificada
independiente: la primera factura de la organización 2 salió con `numero: 1`
pese a que la organización 1 ya tenía su propio número 1 (series separadas,
confirmado). `npm test` verde. Idempotencia confirmada matando y
reiniciando el proceso de prueba sobre la misma base ya migrada: sin
errores, mismos datos, misma numeración. Proceso y copia de scratchpad
borrados al terminar; la base real no se tocó (`nexo.db` real con mtime sin
cambios respecto al inicio de la sesión).

### Qué sigue

1. Devoluciones, devoluciones a proveedor, gastos, stock/movimientos_stock,
   tesorería y cuentas corrientes quedan pendientes del mismo patrón (mismo
   orden que ya señalaba §38).
2. Los catálogos con `UNIQUE(nombre)` (`categorias`, `listas_precios`,
   `depositos`, `cuentas_tesoreria`, `categorias_gasto`) siguen pendientes
   como su propia etapa (reconstrucción de tabla + regla de "predeterminada"
   por organización).
3. Reportes/resumen (gap ya señalado en §38) necesita su propia revisión una
   vez que las tablas de negocio relevantes tengan la columna.
4. Cuando el resto de las tablas tenga la columna, evaluar pasar
   `organizacion_id` a `NOT NULL` en cada una (hoy es nullable a propósito en
   todas partes donde se agregó).

## 40. Etapa A (multi-tenant) — `devoluciones` y `devoluciones a proveedor`

**Objetivo**: primer ítem de la lista que dejaba pendiente §37/§38/§39
("Devoluciones, devoluciones a proveedor, gastos, stock/movimientos_stock,
tesorería y cuentas corrientes"). Mismo patrón exacto que las etapas
anteriores, sobre `devoluciones` y `devoluciones_proveedor`.

**`backend/db/schema.sql` / `backend/db/index.js`**: `organizacion_id INTEGER
REFERENCES organizaciones(id)` nullable en ambas tablas, `ALTER TABLE ADD
COLUMN` idempotente ubicado junto al resto de los bloques de
`organizacion_id` (después del de presupuestos/facturas), y las dos tablas
sumadas al mismo loop de backfill que ya recorría
`productos`/`clientes`/`proveedores`/`ventas`/`compras`/`presupuestos`/
`facturas`. Sin cambios de índice: a diferencia de `facturas`, ninguna de las
dos tiene numeración correlativa propia.

**`backend/server.js`**:
- `POST /api/devoluciones`, `POST /api/devoluciones-proveedor`: escriben
  `organizacion_id` en el `INSERT` (ya validaban la venta/compra padre contra
  la organización del usuario desde §38, eso no cambió).
- `GET /api/devoluciones`, `GET /api/devoluciones/:id`,
  `GET /api/devoluciones-proveedor`, `GET /api/devoluciones-proveedor/:id`:
  filtrados por `organizacion_id`.
- `POST /api/devoluciones/:id/anular`, `POST /api/devoluciones/:id/restaurar`,
  `POST /api/devoluciones-proveedor/:id/anular`,
  `POST /api/devoluciones-proveedor/:id/restaurar`,
  `POST /api/devoluciones-proveedor/:id/nota-credito`: sus
  `SELECT ... WHERE id = ?` ganaron `AND organizacion_id = ?`.
- `POST /api/devoluciones/:id/nota-credito` no necesitó cambios: ya filtraba
  vía JOIN a `ventas.organizacion_id` desde el fix de §39.
- Gap real encontrado y cerrado (mismo tipo que §38/§39, pero más grave acá
  porque no era solo un lookup puntual): como `devoluciones` y
  `devoluciones_proveedor` todavía no tenían columna propia,
  `GET /api/devoluciones` y `GET /api/devoluciones-proveedor` **no tenían
  ningún filtro** y devolvían las devoluciones de todas las organizaciones
  sin distinción; sus variantes por id y los endpoints `anular`/`restaurar`/
  `nota-credito` (proveedor) tampoco filtraban, así que alguien podía
  adivinar un id secuencial y ver, anular, restaurar o emitir una nota de
  crédito sobre la devolución de otra empresa. Se cerró sumando el filtro
  correspondiente a cada uno, listados arriba.

**Verificación**: copia aislada en scratchpad, servidor de prueba en un
puerto nuevo (nunca el 3000 real ni `nexo.db` real), organización 2 creada a
mano con su propio admin (mismo `scryptSync`/parámetros que el servidor).
Con una devolución de venta y una devolución a proveedor activas en la
organización 1: `GET /api/devoluciones` y `GET /api/devoluciones-proveedor`
desde la organización 2 devuelven `[]`; pedir por id, anular, restaurar y
nota-crédito sobre esos ids desde la organización 2 da 404 en todos los
casos. La organización 1 sigue viendo y operando sus propias devoluciones sin
cambios (anular, restaurar y nota-crédito responden según su propia lógica de
estado, no bloqueadas por organización). `npm test` verde antes y después.
Idempotencia confirmada matando y reiniciando el proceso de prueba sobre la
misma base ya migrada: sin errores. Proceso y copia de scratchpad borrados al
terminar; la base real no se tocó (`nexo.db` real con mtime sin cambios
respecto al inicio de la sesión).

### Qué sigue

1. Gastos, stock/movimientos_stock, tesorería y cuentas corrientes quedan
   pendientes del mismo patrón (mismo orden que ya señalaba §38/§39).
2. Los catálogos con `UNIQUE(nombre)` (`categorias`, `listas_precios`,
   `depositos`, `cuentas_tesoreria`, `categorias_gasto`) siguen pendientes
   como su propia etapa (reconstrucción de tabla + regla de "predeterminada"
   por organización).
3. Reportes/resumen (gap ya señalado en §38/§39) sigue necesitando su propia
   revisión una vez que las tablas de negocio relevantes tengan la columna;
   los agregados que suman `devoluciones`/`devoluciones_proveedor` en
   `/api/resumen/*` y `/api/reportes/*` siguen sin filtrar por organización.
4. Cuando el resto de las tablas tenga la columna, evaluar pasar
   `organizacion_id` a `NOT NULL` en cada una (hoy es nullable a propósito en
   todas partes donde se agregó).

## 41. Etapa A (multi-tenant) — `gastos`

**Objetivo**: siguiente ítem de la lista que dejaba pendiente §40 ("Gastos,
stock/movimientos_stock, tesorería y cuentas corrientes"). Mismo patrón
exacto que las etapas anteriores, sobre `gastos`. A diferencia de
`devoluciones`/`devoluciones_proveedor` (que derivan la organización de su
venta/compra padre), `gastos` no cuelga de una cabecera obligatoria —
`proveedor_id` es opcional — así que `organizacion_id` se completa siempre
desde `req.usuario.organizacion_id` en el momento del alta, nunca por JOIN.

**`backend/db/schema.sql` / `backend/db/index.js`**: `organizacion_id INTEGER
REFERENCES organizaciones(id)` nullable en `gastos`, `ALTER TABLE ADD COLUMN`
idempotente ubicado junto al resto de los bloques de `organizacion_id`
(después del de `devoluciones`/`devoluciones_proveedor`), y `gastos` sumada
al mismo loop de backfill que ya recorría el resto de las tablas migradas.

**`backend/server.js`**:
- `GET /api/gastos`: filtrado por `organizacion_id`.
- `crearGasto(...)` gana un parámetro `organizacionId` que se escribe en el
  `INSERT INTO gastos`. Se llama desde dos lugares — `POST /api/gastos`
  (alta manual) y el confirmador de operaciones del asistente de IA
  (`tipo === 'gasto'`, §21/§36) — los dos ahora pasan
  `req.usuario.organizacion_id`.
- `PUT /api/gastos/:id`, `POST /api/gastos/:id/anular`,
  `POST /api/gastos/:id/restaurar`: sus `SELECT ... WHERE id = ?` ganaron
  `AND organizacion_id = ?`.
- Gap real encontrado y cerrado (mismo tipo que en §38/§39/§40): como
  `gastos` todavía no tenía columna propia, `GET /api/gastos` **no tenía
  ningún filtro** y devolvía los gastos de todas las organizaciones sin
  distinción; `PUT`, `anular` y `restaurar` tampoco filtraban, así que
  alguien podía adivinar un id secuencial y editar, anular o restaurar el
  gasto de otra empresa. Se cerró sumando el filtro correspondiente a cada
  uno, listados arriba. El alta desde el asistente de IA tenía el mismo
  problema (no pasaba `organizacion_id` al insert) y se cerró en el mismo
  lote.
- No se tocó `insertarMovimientoGasto` ni `movimientos_tesoreria`: quedan
  para la etapa "tesorería" completa (ver "Qué sigue" abajo).

**Gaps que quedan fuera a propósito**:
- `movimientos_tesoreria` sigue sin `organizacion_id` — es la etapa
  "tesorería" completa aparte, con ~9 sitios de `INSERT` distintos (cobro,
  pago, devolución, devolución a proveedor, manual, transferencia, gasto).
  Incluye que el egreso que genera cada gasto (`insertarMovimientoGasto`) no
  quedó filtrado ni marcado con organización en esta tanda.
- `cuentas_tesoreria` y `categorias_gasto` siguen como catálogos globales
  (`UNIQUE(nombre)`) — misma etapa aparte ya anotada en §39/§40.
- `SQL_RESULTADO_GASTOS` (dashboard/resultado del período) sigue sin filtrar
  por organización — mismo gap ya trackeado como "Reportes/resumen" en
  §38/§39/§40.

**Verificación**: copia aislada en scratchpad, servidor de prueba en un
puerto nuevo (nunca el 3000 real ni `nexo.db` real), organización 2 creada a
mano con su propio admin (mismo `scryptSync`/parámetros que el servidor).
Con un gasto activo cargado en la organización 1: `GET /api/gastos` desde la
organización 2 devuelve `[]`; `PUT`, `anular` y `restaurar` sobre ese id
desde la organización 2 dan 404 en los tres casos. La organización 1 sigue
pudiendo editar, anular y restaurar su propio gasto sin cambios de
comportamiento. `npm test` verde antes y después. Idempotencia confirmada
matando y reiniciando el proceso de prueba sobre la misma base ya migrada:
sin errores. Proceso y copia de scratchpad borrados al terminar; no existe
`nexo.db` real en esta máquina, así que no hay riesgo de haberlo tocado.

### Qué sigue

1. `stock`/`movimientos_stock`, tesorería (`movimientos_tesoreria`, `cobros`,
   `pagos`) y cuentas corrientes (`movimientos_cc_clientes`/
   `movimientos_cc_proveedores`) quedan pendientes del mismo patrón (mismo
   orden que ya señalaba §38/§39/§40). De esos, tesorería es el que más
   sitios de `INSERT` toca (~9) porque no siempre cuelga de una cabecera ya
   organizada.
2. Los catálogos con `UNIQUE(nombre)` (`categorias`, `listas_precios`,
   `depositos`, `cuentas_tesoreria`, `categorias_gasto`) siguen pendientes
   como su propia etapa (reconstrucción de tabla + regla de "predeterminada"
   por organización).
3. Reportes/resumen (gap ya señalado en §38/§39/§40) sigue necesitando su
   propia revisión una vez que las tablas de negocio relevantes tengan la
   columna; los agregados que usan `gastos` en `/api/resumen/*` y
   `/api/reportes/*` (incluido `SQL_RESULTADO_GASTOS`) siguen sin filtrar
   por organización.
4. Cuando el resto de las tablas tenga la columna, evaluar pasar
   `organizacion_id` a `NOT NULL` en cada una (hoy es nullable a propósito en
   todas partes donde se agregó).

## 42. Etapa A (multi-tenant) — `movimientos_stock` y `transferencias`

**Objetivo**: siguiente ítem de la lista que dejaba pendiente §41 ("stock/
movimientos_stock"). "Stock" no es una tabla propia: `stock_actual` y
`stock_por_deposito` son vistas SQL derivadas de `movimientos_stock`
(agrupadas por `producto_id`, y por `producto_id, deposito_id` la segunda), así
que no tienen columna propia y se filtran indirectamente vía
`productos.organizacion_id` o vía `producto_id IN (...)` sobre productos ya
filtrados. `transferencias` sí es una cabecera de operación (como
ventas/compras/gastos) y necesitó su propia columna, poblada siempre desde
`req.usuario.organizacion_id` al insertar — no se deriva de `depositos`, que
sigue siendo catálogo global (§39/§40).

**`backend/db/schema.sql` / `backend/db/index.js`**: `organizacion_id INTEGER
REFERENCES organizaciones(id)` nullable en `movimientos_stock` y
`transferencias`, `ALTER TABLE ADD COLUMN` idempotente junto al resto de los
bloques de `organizacion_id` (después del de `gastos`), y ambas tablas
sumadas al mismo loop de backfill.

**`backend/server.js`**:
- `registrarMovimientoStock(...)` — el punto de inserción centralizado y
  único de toda escritura a `movimientos_stock` — gana un parámetro
  obligatorio `organizacion_id` (sin default: cualquier llamado que no lo
  pase revienta en el momento, a propósito). Los 17 sitios que la llaman se
  actualizaron: los que ya tenían `req.usuario.organizacion_id` en scope de
  handler lo pasan directo (`POST /api/stock/ajuste`, `POST /api/transferencias`
  y su `anular`, `crearVenta`, `PUT /api/ventas/:id` —dos loops—,
  `POST /api/ventas/:id/anular` y `/restaurar`, `PUT /api/compras/:id` —dos
  loops—, `POST /api/compras/:id/anular`); los que son funciones internas sin
  ese parámetro (`aplicarDevolucion`, `revertirDevolucion`,
  `aplicarStockCompra`, `aplicarDevolucionProveedor`,
  `revertirDevolucionProveedor`) ganaron `organizacion_id`/`compras.
  organizacion_id`/`ventas.organizacion_id` en el `SELECT` que ya hacían
  contra la venta/compra padre, y lo propagan desde ahí.
- `GET /api/stock`: ahora filtra `productos` por `organizacion_id` y resuelve
  `stock_por_deposito` acotando por los ids de producto ya filtrados
  (`IN (...)`), porque la vista no tiene columna propia.
- `GET /api/movimientos-stock`, `GET /api/transferencias`: filtrados por
  `organizacion_id`.
- `POST /api/transferencias`: el `INSERT` en `transferencias` escribe
  `organizacion_id` desde `req.usuario.organizacion_id`.
- `POST /api/transferencias/:id/anular`: su `SELECT ... WHERE id = ?` ganó
  `AND organizacion_id = ?`.
- `POST /api/stock/ajuste`, `GET /api/productos/:id/movimientos`,
  `GET /api/productos/:id/variantes/:varianteId/movimientos`: sus lookups de
  `productos`/`producto_variantes` (`SELECT ... WHERE id = ?`) ganaron el
  filtro por organización.
- Gap real encontrado y cerrado (mismo tipo que §38-41): ninguno de los
  endpoints de arriba filtraba por organización antes de esta tanda —
  `GET /api/stock`, `GET /api/movimientos-stock`, `GET /api/transferencias`
  devolvían datos de todas las organizaciones sin distinción, y
  `POST /api/stock/ajuste`, `POST /api/transferencias`,
  `POST /api/transferencias/:id/anular` y los dos endpoints de movimientos por
  producto/variante permitían operar sobre productos/transferencias de otra
  empresa adivinando el id. Se cerró sumando el filtro correspondiente a cada
  uno.

**Gaps que quedan fuera a propósito**:
- `POST /api/productos/:id/atributos` y `POST /api/productos/:id/variantes`
  tienen el mismo patrón de fuga (`SELECT id FROM productos WHERE id = ?` sin
  filtro de organización) pero no tocan stock/movimientos_stock — quedan
  para cuando se retome la migración de `productos` en detalle, no se
  corrigieron en este lote para no mezclar alcance.
- Tesorería (`movimientos_tesoreria`, `cobros`, `pagos`) y cuentas
  corrientes (`movimientos_cc_clientes`/`movimientos_cc_proveedores`) siguen
  pendientes, ya anotado en §41.
- `depositos` sigue como catálogo global — misma etapa aparte ya anotada en
  §39/§40/§41 (catálogos con `UNIQUE(nombre)`).
- Reportes/resumen sigue sin filtrar por organización (mismo gap trackeado
  desde §38).

**Verificación**: copia aislada del `nexo.db` real en scratchpad (todo el
directorio `backend/` copiado aparte, porque la ruta de la base está fijada a
`__dirname/nexo.db` en `db/index.js` y no hay variable de entorno para
redirigirla), servidor de prueba en el puerto 4173 (nunca usado antes) contra
esa copia, organización 2 creada a mano con su propio admin
(`scryptSync`/parámetros idénticos a los del servidor). Con productos,
movimientos de stock, ventas y compras reales de la organización 1:
`GET /api/stock`, `GET /api/movimientos-stock` y `GET /api/transferencias`
desde la organización 2 devuelven `[]`; `POST /api/stock/ajuste` desde la
organización 2 contra un producto de la organización 1 responde 400 ("El
producto no existe"); la organización 1 sigue pudiendo ajustar su propio
stock, crear una venta y anularla con normalidad. Se confirmó por SQL directo
que los movimientos de stock generados por esa venta (salida + entrada de
reversión al anular) quedaron con `organizacion_id = 1`, y que no quedó
ninguna fila con `organizacion_id IS NULL` en `movimientos_stock` ni en
`transferencias` tras el backfill. `npm test` verde antes y después.
Idempotencia confirmada matando y reiniciando el proceso de prueba sobre la
misma base ya migrada: sin errores. Proceso y copia de scratchpad borrados al
terminar; la base real (`backend/db/nexo.db`) no se tocó en ningún momento.

### Qué sigue

1. Los catálogos con `UNIQUE(nombre)` (`categorias`, `listas_precios`,
   `depositos`, `cuentas_tesoreria`, `categorias_gasto`) siguen pendientes
   como su propia etapa (reconstrucción de tabla + regla de "predeterminada"
   por organización).
2. Gap deferido de este lote: `POST /api/productos/:id/atributos` y
   `POST /api/productos/:id/variantes` sin filtro de organización.
3. Reportes/resumen (gap ya señalado desde §38) sigue necesitando su propia
   revisión una vez que las tablas de negocio relevantes tengan la columna.
4. Cuando el resto de las tablas tenga la columna, evaluar pasar
   `organizacion_id` a `NOT NULL` en cada una (hoy es nullable a propósito en
   todas partes donde se agregó).

## 43. Etapa A (multi-tenant) — tesorería y cuentas corrientes

**Objetivo**: siguiente ítem de la lista que dejaba pendiente §42 —
`movimientos_tesoreria`, `cobros`, `pagos`, `movimientos_cc_clientes` y
`movimientos_cc_proveedores`.

**Decisión de diseño por tabla** (para no repetir sin pensar el patrón de
`movimientos_stock`/`transferencias`):
- `movimientos_tesoreria` **necesitó columna propia**: a diferencia de
  `cobros`/`pagos`, tiene orígenes (`manual`, `transferencia`) que no cuelgan
  de ninguna venta/compra/gasto de la que derivar la organización por join.
- `cobros` y `pagos` **no la necesitaron**: son filas hijas de una única
  venta/compra (`venta_id`/`compra_id` `NOT NULL`), mismo caso que
  `venta_items`/`compra_items`. Los `GET` que las exponen
  (`/api/ventas/:id/cobros`, `/api/compras/:id/pagos`) ya filtraban vía join
  a `ventas`/`compras.organizacion_id` desde una tanda anterior — nada que
  tocar ahí.
- `movimientos_cc_clientes`/`movimientos_cc_proveedores` **tampoco la
  necesitaron**, mismo motivo: `cliente_id`/`proveedor_id` son siempre
  `NOT NULL` y esas tablas ya tienen `organizacion_id` desde una tanda
  anterior. Agregarles columna propia hubiera sido la versión más cara de
  resolver lo mismo (ALTER + backfill + ~14 sitios de `INSERT`) cuando
  alcanzaba con filtrar los `SELECT` que las leen.

**`backend/db/schema.sql` / `backend/db/index.js`**: `organizacion_id INTEGER
REFERENCES organizaciones(id)` nullable en `movimientos_tesoreria`,
`ALTER TABLE ADD COLUMN` idempotente junto al resto de los bloques (después
del de `transferencias`), y sumada al mismo loop de backfill.

**`backend/server.js`** — `organizacion_id` completado en los 8 sitios que
insertan en `movimientos_tesoreria`:
- `registrarCobro(...)` (llamada desde `POST /api/ventas/:id/cobros` y desde
  el alta de venta del asistente) gana el parámetro `organizacionId`.
- `POST /api/compras/:id/pagos`: usa `req.usuario.organizacion_id` directo.
- `aplicarDevolucion`/`revertirDevolucion` y
  `aplicarDevolucionProveedor`/`revertirDevolucionProveedor`: reusan la
  `ventas.organizacion_id`/`compras.organizacion_id` que ya traía su propio
  `SELECT` para `registrarMovimientoStock`.
- `insertarMovimientoGasto(...)` (llamada desde `crearGasto`, `PUT
  /api/gastos/:id` y `POST /api/gastos/:id/restaurar`) gana el parámetro
  `organizacionId`.
- `POST /api/tesoreria/movimientos` y `POST /api/tesoreria/transferencias`
  (las dos inserciones de la transferencia): `req.usuario.organizacion_id`.
- `confirmarCompra` no necesitó cambios: solo inserta en
  `movimientos_cc_proveedores`, que no lleva columna propia.

**Lecturas filtradas**: `GET /api/tesoreria` (el agregado de
ingresos/egresos, no la lista de `cuentas`, que sigue siendo catálogo
global) y `GET /api/tesoreria/movimientos`.

**Gap real encontrado y cerrado**: `GET /api/cuentas-corrientes` (el aging de
cuentas por cobrar/pagar) no filtraba por organización en absoluto —
`saldosPorOperacion(...)` unía `movimientos_cc_clientes`/`_proveedores` con
`ventas`/`compras` sin condición de organización, y `agruparPorEntidad(...)`
buscaba el cliente/proveedor por id sin filtrar tampoco. Se cerró sumando
`AND o.organizacion_id = ?` al join en `saldosPorOperacion` y
`AND organizacion_id = ?` al lookup de la entidad en `agruparPorEntidad`,
pasando `req.usuario.organizacion_id` desde el endpoint a las dos funciones.

**Limitación conocida documentada (no resuelta en esta tanda)**:
`cuentas_tesoreria` sigue siendo catálogo global (`UNIQUE(nombre)`), igual
que `categorias`/`listas_precios`/`depositos`/`categorias_gasto`. Para
catálogos que son solo etiquetas, compartir la fila es inofensivo porque las
vistas que agregan sobre ellos agrupan también por una columna ya distinguida
por organización. `cuentas_tesoreria` es distinto: la vista `saldo_tesoreria`
(`backend/db/index.js`, ver comentario junto a su definición) suma
`movimientos_tesoreria` agrupando *solo* por `cuenta_tesoreria_id` — el día
que una segunda organización real comparta la fila "Efectivo" (porque
`UNIQUE(nombre)` se lo obliga), su saldo se mezclaría con el de la otra
organización: no es una fuga de visibilidad, es un balance de caja
incorrecto. Se verificó en la práctica: con dos organizaciones operando
sobre el mismo scratchpad, `GET /api/tesoreria` mostró el mismo `saldo` por
cuenta para las dos (suma de ambas), mientras que `ingresos`/`egresos` (que sí
filtran por `movimientos_tesoreria.organizacion_id`) mostraron correctamente
solo lo de cada una. No se resuelve acá: requiere el rebuild de la tabla a
`UNIQUE(organizacion_id, nombre)`, ya anotado como su propia etapa (ítem 1 de
abajo).

**Verificación**: mismo procedimiento que §42 — copia aislada de
`backend/` en scratchpad, servidor de prueba contra esa copia (puerto 3981),
organización 2 creada a mano con su propio admin (mismo `scryptSync`). Con
datos reales de la organización 1 (ventas con cobros, gastos, movimientos
manuales y una transferencia ya existentes) y datos nuevos cargados para la
organización 2 (venta + cobro, gasto, movimiento manual, transferencia):
`GET /api/tesoreria/movimientos` y `GET /api/cuentas-corrientes` desde la
organización 2 no mostraron nada de la organización 1 y viceversa;
`ingresos`/`egresos` de `GET /api/tesoreria` quedaron correctamente separados
por organización; la organización 1 pudo seguir cobrando, transfiriendo y
viendo su propio aging sin cambios después de que la organización 2 operara.
Se confirmó por SQL directo que no quedó ninguna fila con
`organizacion_id IS NULL` en `movimientos_tesoreria` tras el backfill.
`npm test` verde antes y después. Idempotencia confirmada matando y
reiniciando el proceso de prueba sobre la misma base ya migrada: sin
errores. Proceso y copia de scratchpad borrados al terminar (incluido un
proceso de una corrida anterior que había quedado huérfano reteniendo el
archivo); la base real (`backend/db/nexo.db`) no se tocó en ningún momento.

### Qué sigue

1. Los catálogos con `UNIQUE(nombre)` (`categorias`, `listas_precios`,
   `depositos`, `cuentas_tesoreria`, `categorias_gasto`) siguen pendientes
   como su propia etapa (reconstrucción de tabla + regla de "predeterminada"
   por organización) — para `cuentas_tesoreria` deja de ser solo prolijidad:
   es lo que corrige el balance de caja mezclado documentado arriba.
2. Gap deferido desde §42: `POST /api/productos/:id/atributos` y
   `POST /api/productos/:id/variantes` sin filtro de organización.
3. Reportes/resumen (gap ya señalado desde §38) sigue necesitando su propia
   revisión una vez que las tablas de negocio relevantes tengan la columna.
4. Cuando el resto de las tablas tenga la columna, evaluar pasar
   `organizacion_id` a `NOT NULL` en cada una (hoy es nullable a propósito en
   todas partes donde se agregó).

## 44. Etapa A (multi-tenant) — reportes y dashboard

**Objetivo**: el ítem 3 que dejaba pendiente §43 — los cinco endpoints de
reportes/dashboard (`GET /api/resumen`, `/api/resumen/evolucion`,
`/api/reportes/ventas`, `/api/reportes/compras`, `/api/reportes/stock`) no
filtraban por organización en absoluto: eran el gap más severo que quedaba,
porque agregan (`SUM`, `COUNT`, `GROUP BY`) datos financieros de todas las
organizaciones mezclados, no un registro individual adivinable por id.

**Decisión de diseño**: filtro plano no opcional `AND tabla.organizacion_id
= ?` como última condición de cada `WHERE` — nunca envuelto en `(? IS NULL
OR ...)` como los filtros de fecha opcionales, a propósito, para que un
llamador que pase `organizacionId` undefined explote en el bind (500
ruidoso) en vez de mezclar organizaciones en silencio. El array de bindings
compartido por handler (`rango`) se extendió de 4 a 5 elementos agregando
`req.usuario.organizacion_id` al final, sirviendo sin bifurcar para todas
las queries de un mismo handler.

**`backend/server.js`** — sin ninguna migración de esquema nueva (las 6
tablas involucradas ya tenían `organizacion_id` desde tandas anteriores):
- `calcularResultado(desde, hasta, organizacionId)`: sus 3 queries
  (`SQL_RESULTADO_VENTAS/GASTOS/DEVOLUCIONES`) y sus 5 call-sites
  (`/api/resumen`, y `/api/resumen/evolucion` en `serie`, `total` y
  `resultadoAnterior`).
- `SQL_LIMITES_OPERACIONES` (el `UNION ALL` de 5 subqueries que busca el
  rango de fechas por defecto): cada rama ganó su propio placeholder —
  SQLite no permite reusar un `?` posicional entre subqueries distintas— y
  sus 4 call-sites pasan el mismo `organizacionId` 5 veces.
- Los 8 pares de queries de reporte de ventas y los 8 de compras
  (unidades/por-producto/por-categoría/por-cliente-o-proveedor, para
  ventas y sus devoluciones, y compras y sus devoluciones a proveedor):
  filtro siempre sobre la tabla cabecera (`ventas`/`compras`/
  `devoluciones`/`devoluciones_proveedor`), nunca sobre `categorias`
  (catálogo global sin columna propia).
- Lookups inline de `resolverNombre` (`buscarNombreProducto`,
  `buscarNombreCliente`, `buscarNombreProveedor`): ganaron `AND
  organizacion_id = ?` como defensa en profundidad, mismo criterio ya
  aplicado en §40-43. `buscarNombreCategoria` no se tocó (catálogo global).

**Gap real encontrado y cerrado (el de mayor impacto de los cinco)**: `GET
/api/reportes/stock` traía `productosBase` con un `SELECT_PRODUCTO` sin
ningún `WHERE` — el `resumen.total_valorizado`/`cantidad_productos` del
dashboard de stock salían de productos de **todas** las organizaciones
sumados. Se cerró agregando `WHERE productos.organizacion_id = ?`, espejando
exactamente el mismo patrón que ya usa `GET /api/productos`.

**Gaps fuera a propósito (relevados en esta misma sesión, no tocados)**:
usuarios (incluye una vulnerabilidad crítica de reseteo de contraseña
cruzado entre organizaciones), `organizacionUnica()` como función a
reemplazar, atributos/variantes de producto (10 de 11 endpoints, deferido
desde §42), y `asistente_mensajes`/`auditoria` sin columna de organización.
Ninguno se arranca sin su propia planificación (CLAUDE.md §27).

**Verificación**: mismo procedimiento que §40-43. Copia aislada de
`backend/` en el scratchpad, dos servidores de prueba sobre la misma base
(uno con el código sin parchear, puerto 4732, y otro con el fix, puerto
4731) para probar regresión cero: los 5 endpoints devolvieron respuestas
**byte-idénticas** entre ambos para la organización 1 (la única con datos
reales hoy). Se creó a mano una organización 2 con admin propio (mismo
`scryptSync`) y se le cargó un set mínimo de datos que ejercita los 5
endpoints: producto, cliente, proveedor, compra confirmada y recibida
(stock solo sube en `estado_envio: recibido`, no al confirmar — ver §6),
venta, gasto, devolución de esa venta y devolución a esa compra. Los 5
endpoints devolvieron para la organización 2 solo lo cargado para ella,
nunca mezclado con la organización 1 — en particular
`resumen.total_valorizado`/`cantidad_productos` de `/api/reportes/stock`
coincidieron exactamente con el único producto de la organización 2. Se
forzó además el camino de `resolverNombre` (editando a mano la fecha de la
venta/compra original para que quedara fuera del rango consultado mientras
la devolución seguía dentro): los nombres resolvieron correctamente sin
cruzarse entre organizaciones. Se probaron los 5 endpoints con y sin
`?desde=&hasta=`, incluida una consulta fuera de rango (resultado en cero,
no error). `npm test` verde antes y después, y de nuevo tras reiniciar el
proceso de prueba desde cero (confirma que las sentencias modificadas
preparan bien en un proceso fresco). Proceso y copia de scratchpad borrados
al terminar; `backend/db/nexo.db` real no se tocó (confirmado por `git
status`/mtime sin cambios — la ruta está en `.gitignore`, así que tampoco
aparecería en el diff aunque hubiera cambiado).

### Qué sigue

1. Los catálogos con `UNIQUE(nombre)` (`categorias`, `listas_precios`,
   `depositos`, `cuentas_tesoreria`, `categorias_gasto`) siguen pendientes
   como su propia etapa de rebuild a `UNIQUE(organizacion_id, nombre)`.
2. Gap deferido desde §42/§43: `POST /api/productos/:id/atributos` y
   `POST /api/productos/:id/variantes` (10 de 11 endpoints de
   atributos/variantes) sin filtro de organización.
3. Usuarios: filtrado por organización pendiente en sus endpoints,
   incluyendo una vulnerabilidad crítica de reseteo de contraseña entre
   organizaciones distintas detectada durante la exploración de esta etapa
   — priorizar antes que el resto de este roadmap.
4. `organizacionUnica()` (la función que hoy resuelve "la única
   organización que existe") queda para reemplazar una vez que haya más de
   una organización real operando.
5. `asistente_mensajes` y `auditoria` todavía no tienen columna de
   organización propia.
6. Cuando el resto de las tablas tenga la columna, evaluar pasar
   `organizacion_id` a `NOT NULL` en cada una (hoy es nullable a propósito
   en todas partes donde se agregó).

## 45. Etapa A (multi-tenant) — usuarios, último admin y datos del negocio

**Objetivo**: el ítem 3 que §44 marcaba como prioritario sobre el resto del
roadmap. Los cuatro endpoints de usuarios no filtraban por organización, y uno
de ellos no era una fuga de lectura sino una **escalada de privilegios entre
inquilinos**: `POST /api/usuarios/:id/resetear-password` buscaba al usuario con
`WHERE id = ?` y nada más, así que un admin de la empresa A podía fijarle la
contraseña a un usuario de la empresa B y después loguearse como él, tomando
control de otra empresa entera. Era el agujero más grave que tuvo el sistema.

**Decisión de negocio tomada con el equipo en esta sesión**: el nombre de
usuario **sigue siendo único de forma global**. `usuarios.usuario` conserva su
`UNIQUE` del esquema y `POST /api/auth/login` sigue resolviendo sin saber la
empresa (no se hace rebuild de la tabla ni se toca el login). Consecuencia
deliberada, ya comentada en el código para que nadie la "arregle": el chequeo
de duplicados de `POST /api/usuarios` **tiene que seguir siendo global** — si
se filtrara por organización, el `INSERT` reventaría contra ese `UNIQUE` y
devolvería un 500 en vez del 409 claro que devuelve hoy. Las alternativas que
se descartaron por ahora: `UNIQUE(organizacion_id, usuario)` (obliga a que el
login sepa la empresa: slug/subdominio, y toca frontend) y login por email
(es lo que usan los sistemas comerciales y habilita recuperación de contraseña
de §35, pero es una etapa propia bastante más grande).

**`backend/server.js`** — sin ninguna migración de esquema (`usuarios` ya tenía
`organizacion_id NOT NULL` con FK desde el inicio). Mismo patrón de §40-44:
filtro plano `AND organizacion_id = ?` con `req.usuario.organizacion_id`, nunca
envuelto en `(? IS NULL OR ...)`:
- `contarAdminsActivos(organizacionId)`: contaba admins de **todo Nexo**, así
  que la salvaguarda del "último administrador activo" era falsa por empresa —
  la empresa B podía quedarse sin ningún admin porque la A todavía tenía los
  suyos, y no hay registro público para recuperarse de eso. Ahora cuenta dentro
  de la empresa.
- `GET /api/usuarios`: `WHERE organizacion_id = ?` (listaba nombre, rol y
  último acceso de los usuarios de todas las empresas).
- `POST /api/usuarios`: la empresa sale de la sesión y no de
  `organizacionUnica()` (un admin de la empresa B creaba su empleado dentro de
  la empresa A).
- `PATCH /api/usuarios/:id` y `POST /api/usuarios/:id/resetear-password`:
  filtro en el lookup (un usuario de otra empresa cae en el 404 que ya existía,
  sin revelar que existe en otra parte) **y además en el `WHERE` de la
  escritura**, como defensa en profundidad.
- `GET /api/negocio` (`ORDER BY id LIMIT 1` → `WHERE id = ?`) y
  `PUT /api/negocio` (`organizacionUnica()` → sesión): un admin de la empresa B
  leía y sobrescribía el membrete de comprobantes de la empresa A.
- `organizacionUnica()`: **ya no se llama desde ningún handler de negocio**. Le
  queda un único uso legítimo, `POST /api/auth/bootstrap`, donde por definición
  hay una sola organización (es el primer usuario del sistema). El comentario
  de la función lo dice, para que deje de leerse como un atajo pendiente de
  reemplazo generalizado. Esto cierra el ítem 4 del "Qué sigue" de §44.

**Verificación**: mismo procedimiento que §40-44, sin tocar
`backend/db/nexo.db` real (confirmado por md5 y mtime idénticos antes y
después). Copia aislada de `backend/` en el scratchpad con **una sola base
compartida por los dos servidores** (el parcheado en 4731 y el de `HEAD` sin
parchear en 4732, este último copiado como `server-base.js` dentro del mismo
directorio para que `db/index.js` resuelva el mismo archivo). Compartir la base
hace que la tabla `sesiones` también sea común, así que **la misma cookie sirve
en los dos puertos** y se puede comparar el mismo request contra las dos
versiones del código. Suite de 28 chequeos, toda verde, levantada sobre
procesos recién arrancados (confirma que las sentencias modificadas preparan
bien en un proceso fresco):
- Regresión cero en la empresa 1: `GET /api/negocio` byte-idéntico a `HEAD`, y
  `GET /api/usuarios` con las mismas columnas y sin `password_hash`/
  `password_salt`.
- El reseteo cruzado devuelve 404, el hash de la víctima **no** cambia, el
  atacante **no** puede loguearse como ella y la víctima sigue entrando con su
  contraseña original — se probó el efecto, no solo el código de error.
- `PATCH` cruzado en los dos sentidos: 404 y la fila de la otra empresa intacta.
- Controles de no-regresión: el `PATCH` y el reseteo legítimos **dentro** de la
  propia empresa siguen funcionando (204, `debe_cambiar_password = 1`, y la
  contraseña nueva loguea).
- `POST /api/usuarios` crea con `organizacion_id = 2`, y un nombre de usuario
  que ya existe en la empresa 1 devuelve **409 y no 500** (la consecuencia de
  la decisión de unicidad global, probada explícitamente).
- La salvaguarda del último admin: 409 al degradar al único admin de la empresa
  2 aunque la empresa 1 tenga los suyos. Se comprobó además que `HEAD` **sí** lo
  degradaba (204), o sea que el bug existía y quedó cerrado.
- `PUT /api/negocio` de la empresa 2 actualiza su fila y deja la de la empresa 1
  intacta.

`npm test` (el test estático de inventario de rutas) verde antes y después; no
se agregaron rutas, así que `permisos.js` no se tocó. Proceso y copia del
scratchpad borrados al terminar.

**Lo único del plan que quedó sin hacer**: la pasada visual en el navegador
contra la base real (pantalla de Usuarios y Configuración → datos del negocio).
El contrato de la API se verificó idéntico en forma y el frontend consume estos
dos endpoints con `fetch` + render directo, sin asumir nada que cambie (las
respuestas solo se acotan a la empresa de la sesión), pero la confirmación
visual sigue pendiente.

### Qué sigue

1. Los catálogos con `UNIQUE(nombre)` (`categorias`, `listas_precios`,
   `depositos`, `cuentas_tesoreria`, `categorias_gasto`) siguen pendientes como
   su propia etapa de rebuild a `UNIQUE(organizacion_id, nombre)`.
2. Gap deferido desde §42/§43, corregido en §46: son **9 de 10** endpoints de
   atributos/variantes sin filtro de organización, no 10 de 11 — el de
   movimientos por variante ya filtraba.
3. `GET /api/auditoria` devuelve la auditoría de **todas** las empresas, y es
   accesible también al rol empleado. Necesita migración: la tabla `auditoria`
   no tiene columna de organización. Lo mismo `asistente_mensajes`. Es el
   gap de lectura más grande que queda abierto. **Cerrado en §46.**
4. Cuando el resto de las tablas tenga la columna, evaluar pasar
   `organizacion_id` a `NOT NULL` en cada una (hoy es nullable a propósito en
   todas partes donde se agregó; `usuarios` ya era `NOT NULL` de origen).
5. Decisión que quedó anotada y no cerrada: si alguna vez se quiere que dos
   empresas puedan tener el mismo nombre de usuario, hay que elegir entre
   `UNIQUE(organizacion_id, usuario)` + empresa en el login, o login por email
   (ver el párrafo de decisión de negocio más arriba).

## 46. Etapa A (multi-tenant) — auditoría y asistente

**Objetivo**: el ítem 3 del "Qué sigue" de §45, el gap de lectura más grande
que quedaba abierto. `auditoria` y `asistente_mensajes` eran las únicas dos
tablas de datos de negocio sin `organizacion_id`. Dos problemas distintos:
`GET /api/auditoria` devolvía el log de **todas** las empresas, con los JSON
`valor_anterior`/`valor_nuevo` adentro (nombres de clientes, importes, costos
y márgenes de otros inquilinos). Y `POST /api/asistente/ejecutar` resolvía la
propuesta con `WHERE id = ? AND estado = 'interpretado'` sin más — un usuario
de la empresa B que pasara el `mensaje_id` de la empresa A ejecutaba esa
propuesta: **escritura** cruzada entre inquilinos, no solo lectura. No estaba
en el handoff; apareció al relevar esta etapa.

**Decisiones de negocio tomadas con el equipo en esta sesión**:
- `GET /api/auditoria` pasa de `'ambos'` a `'admin'`: los JSON de valor
  anterior/nuevo traen costo, margen y ganancia sin filtrar, justo lo que §35
  le esconde al empleado en el resto de las respuestas.
- `login_fallido` con un usuario que no existe (no hay empresa deducible)
  guarda `organizacion_id = NULL`, que lo deja invisible en
  `GET /api/auditoria` para todas las empresas — antes que mostrarlo a todas
  (cruzaría inquilinos) o atribuirlo a `organizacionUnica()` (falsificaría la
  auditoría en cuanto haya dos empresas reales).

**`backend/db/schema.sql`** y **`backend/db/index.js`** — ALTER aditivo de
siempre (ningún `CHECK` tocado, no hace falta rebuild) para las dos columnas,
más backfill de las dos tablas al array compartido. Una trampa encontrada y
resuelta: el índice nuevo `idx_auditoria_org_fecha` **no puede vivir en
`schema.sql`** como un `CREATE INDEX` suelto — ese archivo se ejecuta completo
en cada arranque, incluso en una base vieja donde `organizacion_id` todavía no
existe en la primera pasada, así que reventaba antes de que el `ALTER TABLE`
llegara a correr. Se resolvió con el mismo criterio que `idx_facturas_numeracion`:
el índice se crea entero dentro de `db/index.js`, fuera del `if` del `ALTER`
(para cubrir tanto la instalación fresca como la recién migrada).

**`backend/db/index.js`** y **`backend/server.js`** — escritura, reusando el
chokepoint sin tocar los 63 call-sites de auditoría: `registrarAuditoria()`
suma `organizacion_id`, y el wrapper `auditar(req, datos)` le pasa
`req.usuario?.organizacion_id ?? null` igual que ya hace con `usuario_id`. Los
4 `registrarAuditoria` directos de auth (no pasan por el wrapper, son
endpoints públicos) se ajustaron a mano: login y login_fallido-por-contraseña
ahora traen `organizacion_id` del `SELECT` de login (que no lo traía); bootstrap
ya tenía `orgId` en scope; login_fallido-por-usuario-inexistente se deja sin
el parámetro a propósito (→ NULL). El INSERT de `asistente_mensajes` suma la
columna con `req.usuario.organizacion_id`.

**`backend/server.js`** — lectura y aislamiento, mismo filtro plano
`AND organizacion_id = ?` que §40-45 (nunca `(? IS NULL OR ...)`):
- `GET /api/auditoria`: `WHERE auditoria.organizacion_id = ?` antes del
  `ORDER BY`, más `soloAdmin` como argumento.
- `POST /api/asistente/ejecutar`: el filtro en el `SELECT` de lookup. Un
  `mensaje_id` de otra empresa cae en el mismo 404 de siempre, sin revelar que
  existe en otra parte. Los `UPDATE` de `marcarFallido`/`marcarConfirmado` no
  necesitan filtro propio: operan sobre `mensaje.id`, que ya salió del lookup
  acotado.
- `POST /api/asistente/:id/descartar`: mismo filtro en el `UPDATE`.
- `contextoParaInterprete()`: fuga parcial encontrada en el relevamiento —
  manda a Gemini `productos`, `cuentas_tesoreria` y `categorias_gasto` sin
  ningún `WHERE`. Se filtró `productos` (ya tiene la columna). Las otras dos
  son catálogos que todavía no la tienen (ítem 1 del "Qué sigue" de §45, el
  rebuild de catálogos) — queda comentado en el código como mejora parcial
  declarada, no un cierre.

**`backend/permisos.js`**: `'GET /api/auditoria'` de `'ambos'` a `'admin'`.

**`frontend/js/app.js`** y **`frontend/css/styles.css`**: `"auditoria"` suma a
`VISTAS_SOLO_ADMIN`, guard `if (!esAdmin()) return;` en `cargarAuditoria()`, y
el nav-item se oculta por CSS — mismas tres capas que ya usan Usuarios,
Estadísticas, Papelera y Compras.

**Verificación**: mismo procedimiento que §40-45, sin tocar `backend/db/nexo.db`
real (md5 idéntico antes y después: `a25ce51db1f9978b77c16aac22bc8a3e`). Dos
servidores sobre la misma base copiada (4731 parcheado, 4732 `HEAD` como
`server-base.js`), cookie de sesión compartida por la tabla `sesiones` común.
Todo verde:
- Regresión cero en la empresa 1: `GET /api/auditoria` byte-idéntico entre
  4731 y 4732.
- Migración idempotente: reinicio en frío del proceso sin error; `PRAGMA
  table_info` confirma la columna en las dos tablas; `SELECT COUNT(*) WHERE
  organizacion_id IS NULL` da 0 después del backfill.
- Aislamiento probado por efecto: empresa 2 creada a mano con su admin, un
  alta de auditoría en cada empresa (edición de categoría), cada admin ve solo
  la suya y el `valor_nuevo` de la otra nunca aparece. `GET /api/auditoria`
  como empleado → 403.
- Asistente cruzado: `mensaje_id` de la empresa 1 pasado por la cookie de la
  empresa 2 a `ejecutar` y a `descartar` → 404 en los dos, `estado` de la fila
  sin cambios, sin operación creada. Controles de no-regresión: el descartar y
  el ejecutar legítimos **dentro** de la propia empresa funcionan (200, gasto
  creado con el `organizacion_id` correcto).
- Auditoría de login: login exitoso y login con contraseña mala quedan con la
  empresa del usuario; login con usuario inexistente queda con
  `organizacion_id = NULL` y no aparece en `GET /api/auditoria` de ninguna
  empresa.
- `npm test` verde antes y después del cambio de `permisos.js`.

**Lo único del plan que quedó sin hacer**: la pasada visual en el navegador
contra la base real (no hay herramienta de browser disponible en esta sesión
para automatizarla). Queda pendiente confirmar a mano que un admin ve
Auditoría normalmente y que un empleado no ve el ítem de nav ni puede llegar
por deep-link (`#/auditoria` → Ventas) — cubre también la pasada visual que
§45 dejó pendiente (Usuarios y Configuración), que tampoco se hizo en esta
sesión.

### Qué sigue

1. Los catálogos con `UNIQUE(nombre)` (`categorias`, `listas_precios`,
   `depositos`, `cuentas_tesoreria`, `categorias_gasto`) siguen pendientes como
   su propia etapa de rebuild a `UNIQUE(organizacion_id, nombre)`. Cierra
   también el filtro de `cuentas_tesoreria`/`categorias_gasto` en
   `contextoParaInterprete()`.
2. 9 de 10 endpoints de atributos/variantes sin filtro de organización (el de
   movimientos por variante ya filtra). **Cerrado en §47.**
3. Pasar `organizacion_id` a `NOT NULL` en todas las tablas que lo tienen
   nullable hoy.
4. Filtrar `valor_anterior`/`valor_nuevo` por campos sensibles en
   `GET /api/auditoria` — solo haría falta si alguna vez se vuelve a abrir esa
   lectura al rol empleado; con el endpoint en `admin` no es urgente.
5. Pasada visual pendiente en el navegador: Usuarios, Configuración (§45) y
   Auditoría (§46), las tres en una sola sesión si se puede.
6. Bug encontrado en §47, sin corregir porque es ajeno a esa etapa:
   `backend/db/schema.sql` define `CREATE TABLE auditoria` sin columna
   `organizacion_id`, pese a que el comentario de `backend/db/index.js` (línea
   544-547, agregado en §46) asume que en una instalación fresca "la columna
   ya viene en el CREATE TABLE". En los hechos, solo llega por el `ALTER
   TABLE` de la migración (índice 537-540 de `db/index.js`), así que una base
   nueva de cero revienta en el arranque (`Error: no such column:
   organizacion_id`) al llegar al backfill de la línea 1314-1316 — el resto
   de las tablas de esa misma lista sí tienen la columna en el `CREATE
   TABLE`. No afecta ninguna base ya migrada (como la real del repo), pero
   bloquea instalar Nexo desde cero. Encontrado al armar la base compartida
   de la verificación de §47 con `nexo.db` recién borrado; no estaba en el
   handoff. Arreglo esperado: agregar `organizacion_id INTEGER REFERENCES
   organizaciones(id)` al `CREATE TABLE auditoria` de `schema.sql`, igual que
   ya la tienen `productos`/`clientes`/etc. en sus propios `CREATE TABLE`.

## 47. Etapa A (multi-tenant) — atributos y variantes de producto

**Objetivo**: ítem 2 del "Qué sigue" de §46. 9 de los 10 endpoints de
atributos y variantes de producto (`backend/server.js`, bloque "Atributos y
variantes de producto") no filtraban por `organizacion_id`: un admin de la
empresa B que adivinara o enumerara un `producto_id`/`atributo_id`/
`variante_id` de la empresa A podía leer y **escribir** sus atributos,
valores y variantes (nombres de talles/colores, SKU, precio de venta, stock
por variante). El único que ya filtraba era
`GET /api/productos/:id/variantes/:varianteId/movimientos`, que sirvió de
referencia del patrón esperado.

**No hizo falta tocar el esquema**: `producto_atributos`,
`producto_atributo_valores`, `producto_variantes` y `producto_variante_valores`
no necesitan columna propia de organización — heredan el aislamiento del
`producto_id`, igual que ya pasa con `movimientos_stock` por producto.

**`backend/server.js`** — mismo patrón "chokepoint" que ya usa
`GET /api/productos/:id/movimientos`: verificar una sola vez, al principio de
cada handler, que el `producto_id` de la URL pertenece a
`req.usuario.organizacion_id` (`SELECT id FROM productos WHERE id = ? AND
organizacion_id = ?`), 404 genérico ("Producto no encontrado.") si no. Las
consultas anidadas por `atributoId`/`valorId`/`varianteId` que ya filtraban
por `producto_id` quedan igual, ahora correctamente acotadas:
- `GET /api/productos/:id/atributos` y `GET /api/productos/:id/variantes`: no
  verificaban ni la existencia del producto. Se les agregó el lookup completo.
- `POST /api/productos/:id/atributos` y `POST /api/productos/:id/variantes`:
  ya hacían `SELECT id FROM productos WHERE id = ?`; se les agregó
  `AND organizacion_id = ?`.
- `PATCH`/`DELETE` de atributos, `POST`/`DELETE` de valores y `PATCH` de
  variantes: verificaban que el hijo perteneciera al `producto_id` de la URL,
  pero nunca que ese producto fuera de la organización. Se les agregó el
  mismo lookup de producto antes de las queries existentes.

**Verificación**: mismo procedimiento que §40-46, pero con un hallazgo
intermedio: armar la base compartida borrando `nexo.db` para arrancar de cero
expuso el bug de `auditoria` sin `organizacion_id` en `schema.sql` (documentado
arriba, en el ítem 6 del "Qué sigue" — no se corrigió, es ajeno a esta etapa).
Se resolvió usando una **copia de la base real** (ya migrada) en vez de una
base fresca, confirmando por `md5sum` que la base real nunca se tocó
(idéntica antes y después:
`a25ce51db1f9978b77c16aac22bc8a3e`). Dos servidores sobre esa copia
compartida (4731 parcheado, 4732 `HEAD` sin parchear como `server-head.js` en
el mismo directorio), con una segunda organización y dos admins de prueba
creados a mano en la copia (`admin1_test` en la organización 1 ya existente,
`admin2_test` + organización "Empresa Test 2" nueva) porque no se tenía la
contraseña real del admin existente. Se armó un producto de prueba por
empresa con un atributo ("Talle"), un valor ("M") y una variante (SKU
"SKU-EMP1") en el producto de la empresa 1. Todo verde:
- Los 9 endpoints devuelven 404 en 4731 (parcheado) cuando el admin de la
  empresa 2 pasa el `producto_id`/`atributo_id`/`variante_id` de la empresa 1
  (lectura y escritura, probado uno por uno).
- Confirmado por contraste que `HEAD` (4732) sí filtraba la fuga: el mismo
  `GET` de atributos/variantes devolvía 200 con los datos de la empresa 1, y
  un `PATCH` cruzado (renombrar el atributo "Talle" a "HackeadoHead") devolvía
  200 y **efectivamente modificaba la fila real** — confirma que no era solo
  un bug de lectura, sino de escritura cruzada entre inquilinos.
- Controles de no-regresión en 4731: las mismas operaciones dentro de la
  propia empresa siguen funcionando igual (200/201), incluida una regla de
  negocio preexistente (borrar un atributo con variantes creadas sigue dando
  400, no un 404 falso por el nuevo filtro).
- Producto inexistente sigue dando 404 igual que antes.
- `npm test` (inventario estático de rutas) verde antes y después — no se
  agregaron rutas, `permisos.js` no se tocó.

Proceso y copia del scratchpad borrados al terminar.

**Lo único del plan que quedó sin hacer**: ninguno de los puntos planificados
quedó pendiente; el bug de `schema.sql`/`auditoria` que apareció durante la
verificación quedó fuera del alcance de esta etapa a propósito (ver ítem 6
arriba).

### Qué sigue

1. Los catálogos con `UNIQUE(nombre)` (`categorias`, `listas_precios`,
   `depositos`, `cuentas_tesoreria`, `categorias_gasto`) siguen pendientes como
   su propia etapa de rebuild a `UNIQUE(organizacion_id, nombre)`.
   **Cerrado en §49.**
2. Pasar `organizacion_id` a `NOT NULL` en todas las tablas que lo tienen
   nullable hoy.
3. Filtrar `valor_anterior`/`valor_nuevo` por campos sensibles en
   `GET /api/auditoria` — no urgente con el endpoint en `admin`.
4. Pasada visual pendiente en el navegador: Usuarios, Configuración (§45) y
   Auditoría (§46).
5. Bug de instalación fresca: agregar `organizacion_id` al `CREATE TABLE
   auditoria` de `schema.sql` (ver detalle en el "Qué sigue" de §46 de arriba).
   **Cerrado en §48** (el diagnóstico de este ítem estaba equivocado, ver ahí).

## 48. Instalación desde cero y migración de bases viejas

**Objetivo**: ítem 5 del "Qué sigue" de §47 — instalar Nexo desde cero
reventaba en el primer arranque. **El diagnóstico de §46/§47 estaba mal**:
`schema.sql` sí traía `organizacion_id` en `auditoria`. Lo atrasado era su
`CHECK` de `entidad` (le faltaban `'lista_precio'`, `'deposito'` y
`'transferencia'`), así que una base nueva disparaba los rebuilds #3–#5 de
`auditoria` en `db/index.js`, cuyos cuerpos recrean la tabla sin
`organizacion_id` ni `idx_auditoria_org_fecha`.

**Causa general, ya anotada en el código**: el cuerpo de un rebuild es una foto
de la tabla del día en que se escribió, así que toda columna agregada por
`ALTER` *antes* de que corra se pierde. **Regla: todo `ALTER` nuevo va después
del último rebuild de su tabla.** El mismo defecto rompía el primer arranque de
todas las bases anteriores a la Etapa A.

**Cambios** (sin cambio de esquema final, solo de orden):
- `schema.sql`: `CHECK` de `entidad` de `auditoria` igual al del último rebuild,
  con un comentario que lo exige.
- `db/index.js`:
  - Los `ALTER` de `organizacion_id` de `auditoria` (con su índice) y de
    `movimientos_tesoreria` se movieron después de los rebuilds de su tabla.
  - El rebuild `'borrador'` de `compras`, junto con el `ALTER` de
    `estado_envio` que su `INSERT..SELECT` lee, se movió antes de los `ALTER`
    de `deposito_id`, `condicion_pago`, `fecha_vencimiento` y
    `organizacion_id` de `compras`, que se perdían.
  - El `ALTER` de `movimientos_stock.costo_unitario` se movió antes de los
    tres rebuilds que la leen: la base del 25/8 no arrancaba nunca
    (`no such column: costo_unitario`).

**Verificación**: arnés en el scratchpad que corre `db/index.js` tres veces
sobre una base nueva, una copia de la real y los 21 backups de `backend/db/`.
- **Con `HEAD`:** la base nueva y 20 backups fallaban en el 1er arranque; el del
  25/8 fallaba en todos.
- **Con el fix:**
  - los 23 casos migran en un solo arranque, y el 2do y el 3er arranque no
    cambian nada (huella de esquema + datos);
  - `foreign_key_check` queda vacío;
  - columnas, índices y vistas finales son idénticos a los de una base nueva;
  - la base real queda idéntica en datos con `HEAD` y con el fix.
- **Smoke test HTTP sobre base nueva** (bootstrap, producto, compra recibida,
  venta + cobro, gasto, auditoría con organización): 18/18. Con `HEAD` el
  servidor ni arranca.
- La base real no se tocó (md5 `a25ce51db1f9978b77c16aac22bc8a3e`).

## 49. Etapa A (multi-tenant) — catálogos por organización

**Objetivo**: ítem 1 del "Qué sigue" de §47, el último bloque grande de la
Etapa A. Los cinco catálogos (`categorias`, `listas_precios`, `depositos`,
`cuentas_tesoreria`, `categorias_gasto`) eran globales, con `UNIQUE(nombre)`.
Con una segunda empresa pasaba esto:
- el saldo de caja se mezclaba entre empresas (documentado en §43);
- marcar una lista o un depósito como predeterminado se lo quitaba a todas las
  demás empresas;
- `depositoPredeterminadoId()` devolvía el depósito de cualquier empresa;
- unos 25 caminos de escritura aceptaban ids de catálogo de otra empresa
  (cobros y pagos ni siquiera validaban la cuenta);
- el asistente resolvía nombres contra todas las empresas.

**Esquema** (`schema.sql` + `db/index.js`):
- Las 5 tablas se reconstruyen con `organizacion_id INTEGER NOT NULL
  REFERENCES organizaciones(id)` y `UNIQUE (organizacion_id, nombre)`.
  - Hace falta rebuild porque el `UNIQUE` de columna es un índice automático
    que no se puede tirar.
  - `NOT NULL` a propósito: con `NULL`, el `UNIQUE` no frena duplicados.
  - Mismo procedimiento que el rebuild de `compras`, que también es tabla padre
    de FKs: se preservan los ids, y todas las filas existentes quedan en la
    primera organización.
  - El marcador del rebuild es el texto `UNIQUE (organizacion_id, nombre)`.
- El rebuild corre al principio del archivo. Para eso:
  - el seed de `organizaciones` subió arriba de todo;
  - el `ALTER` de `cuentas_tesoreria.saldo_inicial` va antes del rebuild,
    porque el rebuild lo lee.
- Los seeds de depósito, cuentas y lista pasan a
  `sembrarCatalogosBase(organizacionId)`. Corre en cada arranque para cada
  organización y solo siembra lo que le falta a esa empresa, así que una
  empresa creada a mano recibe sus catálogos al reiniciar.

**`server.js`**: mismo patrón que §40–47 — filtro plano
`AND organizacion_id = ?` y los mismos mensajes de siempre. Un id ajeno en
`/:id` de catálogo da 404; un id ajeno en el body da 400 "no existe".
- **CRUD de los 5 catálogos:** listado, chequeo de duplicado por empresa,
  lookup, y desmarcar predeterminados solo dentro de la empresa.
- **Helpers que ahora reciben la empresa:**
  - `depositoPredeterminadoId(org)` (19 llamadas);
  - `depositoActivoValido` (nuevo);
  - `listaPrecioValida`, `validarProducto` y `validarStockDisponible`;
  - `validarGasto`, que ahora valida también el proveedor;
  - `buscarPorNombre`, `existeId` y `resolverPropuesta` del asistente. Esto
    cubre también clientes, productos y proveedores, que tampoco filtraban:
    los `candidatos` de un nombre ambiguo mostraban nombres de otras empresas.
- **Validación nueva:** la cuenta en `POST /api/ventas/:id/cobros` y
  `POST /api/compras/:id/pagos`. Antes solo la frenaba la FK, y una cuenta
  inexistente daba 500.
- **Lecturas:**
  - `GET /api/tesoreria` (cuentas y total);
  - `contextoParaInterprete`, que ya no le manda a Gemini cuentas ni
    categorías de gasto de otras empresas;
  - `buscarNombreCategoria` en los reportes.
- **Mismo camino, mismo pase:** un producto de otra empresa en
  `validarStockDisponible` y en `PUT /api/ventas/:id` entraba a la venta y
  exponía su costo. Cerrado.

**Sin cambios**:
- El frontend no tiene ids ni nombres fijos y elige los predeterminados por
  flag.
- `interprete.js` y `permisos.js` (no hay rutas nuevas) tampoco cambian.
- Las respuestas de los catálogos suman la clave `organizacion_id`.

**Verificación** (scratchpad, borrado al terminar):
- **Preparación:** una copia de la base real con un admin de prueba en la org 1
  y una org 2 con su admin, creados a mano. `HEAD` corre en el 4732 y el árbol
  de trabajo en el 4731.
- **Resultado:** 113/113 chequeos verdes:
  - **Migración:** `NOT NULL` y marcador en las 5 tablas; las filas de la org 1
    quedan idénticas a la base real, con los mismos ids; `foreign_key_check`
    vacío; la org 2 recibe sus catálogos al arrancar; un alta nueva toma
    max(id)+1.
  - **Regresión de la org 1:** 27 `GET` (catálogos, tesorería, stock, ventas,
    compras, reportes, cuentas corrientes) dan idéntico con `HEAD` y con el
    fix, ignorando la clave nueva.
  - **Aislamiento:**
    - cada empresa ve solo sus listados, y dos empresas pueden usar el mismo
      nombre;
    - un `PATCH` cruzado da 404 y no cambia nada;
    - 26 operaciones con ids de la otra empresa en el body dan 400 con el
      mensaje esperado, y los conteos no cambian;
    - los controles dentro de la propia empresa pasan;
    - una venta sin depósito descuenta stock del depósito propio;
    - el saldo de Efectivo queda separado por empresa;
    - el asistente resuelve "Efectivo" a la cuenta propia y rechaza una cuenta
      ajena metida a mano;
    - cada empresa tiene sus propios predeterminados.
  - **Contrastes que confirman que `HEAD` tenía cada bug:**
    - la org 2 veía el Efectivo de la org 1 y le cargaba plata;
    - el asistente resolvía su "Efectivo" a la cuenta de la org 1;
    - marcar una lista le quitaba la predeterminada a la org 1.
- **Arnés de arranque de §48** con el esquema nuevo: la base nueva, la real y
  los 21 backups migran en un solo arranque, quedan estables y con el mismo
  esquema. Smoke de instalación desde cero: 18/18.
- `npm test` verde. La base real no se tocó (md5
  `a25ce51db1f9978b77c16aac22bc8a3e`).

**Ojo con el próximo arranque real**: la base real todavía no corrió ninguna
migración de la Etapa A (§37–§49), así que el próximo `npm start` las aplica
todas juntas. Backup previo:
`backend/db/nexo.db.backup-antes-etapa-a-20261005-210622`. El arnés de §48 ya
lo simuló sobre una copia, sin errores.

### Qué sigue

1. Pasar `organizacion_id` a `NOT NULL` en las 15 tablas que lo tienen
   nullable. Los 5 catálogos ya nacen `NOT NULL`.
2. Alta de empresa desde la API (hoy se crean a mano). Tiene que llamar a
   `sembrarCatalogosBase`, que hoy es local a `db/index.js` y habría que
   exportar.
3. El alta de categoría, lista, cuenta y categoría de gasto no se audita (solo
   la edición; el alta de depósito sí).
4. Una lista o un depósito inactivo puede quedar como predeterminado si el
   `PATCH` omite `activa`/`activo`.
5. `obtenerPreciosPorProducto` y `obtenerPreciosPorVariante` leen los precios
   de todas las empresas. No hay fuga, porque se indexan por los productos
   propios, pero cuesta rendimiento a medida que crecen las empresas.
6. Filtrar `valor_anterior`/`valor_nuevo` por campos sensibles en
   `GET /api/auditoria` — no urgente con el endpoint en `admin`.
7. Pasada visual pendiente en el navegador: Usuarios, Configuración,
   Auditoría y las pantallas de catálogos.
8. Decisión abierta en `permisos.js`: si listas, depósitos y categorías de
   gasto tienen que ser solo admin.

## 50. Catálogos — altas auditadas y predeterminado siempre activo

Cierra los puntos 3 y 4 del "Qué sigue" de §49. Sin cambio de esquema.

**Altas auditadas** (`backend/server.js`):
- `POST /api/categorias`, `/api/listas-precios`, `/api/cuentas-tesoreria` y
  `/api/categorias-gasto` ahora registran `accion: 'crear'`, con la misma
  `entidad` que ya usaba su edición.
- El INSERT y la auditoría van en un mismo `withTransaction`, como las
  ediciones. El alta de depósito, que ya auditaba, se movió a la misma forma.
- La cuenta de tesorería lleva su saldo inicial en el `detalle`, porque es el
  campo sensible de esa entidad.

**Predeterminado inactivo**:
- `PATCH /api/listas-precios/:id` y `/api/depositos/:id` miraban solo el
  `activa`/`activo` del body, así que marcar como predeterminada una fila que
  ya estaba inactiva (sin mandar el flag) pasaba.
- Ahora el chequeo es sobre el estado final. Un `activa:false` explícito
  conserva el mensaje de antes; el caso nuevo responde 400 con "Activá la
  lista/el depósito antes de marcarlo como predeterminado".
- **Decisión:** se rechaza y no se activa sola, para que la API no cambie en
  silencio un campo que nadie pidió cambiar.
- **Consecuencia:** una fila que ya estuviera predeterminada e inactiva
  (estado ya corrupto) tampoco se puede editar sin mandar `activa:true`. En la
  base real no hay ninguna.

**Frontend** (`frontend/js/app.js`): `AUDITORIA_ENTIDAD_LABEL` suma
`lista_precio`, `deposito`, `usuario` y `transferencia`. Sin eso la tabla
mostraba el nombre crudo y el filtro "Entidad" no ofrecía esas opciones.

**Verificación** (scratchpad, base nueva, servidor en el 4731):
- Las 5 altas dan 201 y dejan su fila de auditoría con `usuario_id`,
  `organizacion_id` y `detalle` correctos, comprobado en la tabla.
- Listas y depósitos, 8 casos cada uno, todos como se esperaba: desactivar una
  no predeterminada, marcarla inactiva sin el flag (400, la predeterminada
  anterior sigue), con `false` explícito (400), con `true` (200, queda una sola
  y activa), y desmarcar o desactivar la predeterminada (400).
- `npm test` verde (3/3). La base real no se tocó (md5
  `a25ce51db1f9978b77c16aac22bc8a3e`) y no tiene predeterminados inactivos.
- El script marcó 5 falsos negativos en el chequeo de auditoría vía
  `GET /api/auditoria`; las filas en la tabla están bien. No se inspeccionó qué
  campos expone ese endpoint.
- Sin pasada visual en el navegador para las etiquetas nuevas.

### Qué sigue

Quedan los puntos 1, 2 y 5–8 de §49.

## 51. Etapa A (multi-tenant) — alta de empresa por registro público

**Objetivo**: el ítem 2 del "Qué sigue" para cerrar la Etapa A. Hasta acá una
empresa nueva se creaba a mano en la base. **Decisión del usuario**: registro
público (cualquiera crea su negocio desde el login y queda como su primer
admin). Se descartaron un rol de superadmin de plataforma y un script de
consola. El NOT NULL de las 14 tablas (ítem 1) se dejó para otra sesión.

**Bug encontrado y corregido** (`backend/db/index.js`): el backfill de
`organizacion_id` que corre en cada arranque incluía `auditoria`, así que cada
reinicio le asignaba a la primera empresa los `login_fallido` de usuarios
inexistentes. Esos registros quedan en NULL a propósito (hist. §46) y el bug le
mostraba al admin de esa empresa lo que había tecleado cualquiera en el login.
- `auditoria` salió del array compartido. Su backfill pasó a ejecutarse una
  sola vez, dentro del `if` del `ALTER TABLE`, y excluye esos `login_fallido`.
- Un `UPDATE` idempotente repara las bases que ya habían arrancado con el bug.
- La base real todavía no migró, así que no tenía filas afectadas.

**`POST /api/auth/registro`** (`backend/server.js`) reemplaza a
`POST /api/auth/bootstrap`, que era el caso particular "primera empresa".
- Body `{ empresa, usuario, nombre, password }`. Mismas reglas que
  `POST /api/usuarios`: sin espacios en el usuario, contraseña de 8 o más,
  duplicado de usuario global (409, hist. §45).
- Rate limit por IP en memoria: 5 intentos por hora, cuenta todos (cada uno
  cuesta un scrypt). El sexto da 429.
- Una transacción. Con la base sin usuarios se **adopta** la organización que
  sembró `db/index.js` y se le cambia el nombre. Si ya hay usuarios se inserta
  una organización y se llama a `sembrarCatalogosBase`, que ahora se exporta.
- Audita `crear organizacion` y `crear usuario`, con `organizacion_id` propio.
- `permisos.js`: la ruta nueva es `publico`. `GET /api/auth/estado` no cambió.

**Frontend**: `formBootstrap` pasó a `formRegistro` (suma "Nombre del negocio").
El login tiene un link "Creá una cuenta" y el registro uno de vuelta. En una
instalación nueva el link de vuelta se oculta. `.btn-link` necesitó un color
fijo dentro de `.sesion-card`: usa `var(--ink)` y en tema claro quedaba negro
sobre la tarjeta negra.

**Verificación** (scratchpad, copia de la base real en el 4742 y base nueva en
el 4741):
- Copia real: migró entera en un solo arranque. Registro con body vacío,
  usuario con espacio y contraseña corta dan 400; el válido, 201; el duplicado
  (distinto caso de mayúsculas), 409; el sexto intento, 429.
- La empresa B queda con su organización, depósito, lista y 3 cuentas propias y
  2 filas de auditoría. Con su sesión, productos, clientes, ventas y categorías
  vuelven vacíos y `negocio` devuelve el suyo. La empresa A conserva sus 3
  productos y 9 ventas.
- Base nueva: el primer registro adopta la organización sembrada, el segundo
  crea la empresa 2. Cada una con sus catálogos base.
- Bug de auditoría: un `login_fallido` inexistente queda en NULL; con la fila
  forzada a la empresa 1 el reinicio la devuelve a NULL; el admin de B no la ve
  en `GET /api/auditoria`.
- `npm test` verde (3/3). Base real intacta (md5
  `a25ce51db1f9978b77c16aac22bc8a3e`) y servidores cerrados con `taskkill`.
- **No se hizo pasada visual en el navegador** de las pantallas de login y
  registro: no hay herramienta de navegador en esta sesión.

### Qué sigue

Quedan el ítem 1 de §49 (NOT NULL en las tablas) y los pendientes chicos.
Nuevos, anotados en `handoff.md`: poder apagar el registro público por
configuración, y verificación de email o captcha.

## 52. Etapa B (modularizar `app.js`) — F0 red de seguridad y F1 módulo ES

Plan completo de la etapa: fases F0–F13 (modularización) y B2 (PWA). Hecho
hasta acá: F0 y F1. `app.js` sigue entero (9407 líneas); lo único que cambió
en el código de la app es cómo se carga.

**Decisión de la sesión (para la Etapa C, no implementada):** `precio_unitario`
pasa a ser precio final con IVA incluido; el IVA se extrae por renglón.

**F0 — red de seguridad (nada de esto va al repo salvo el test):**
- `backend/test/frontend-modulos.test.js`, corre con `npm test`. Lee
  `frontend/js/**` como texto y verifica: imports relativos resuelven con las
  mayúsculas exactas, nombres importados exportados, sin ciclos fuera de
  `CICLOS_PERMITIDOS` (vacía), y cada `invocar('x')` / `recargar('x')` con su
  `registrar('x')` / `registrar('cargar:x')`. Se probó con módulos rotos a
  propósito: los cuatro defectos fallan.
- Baseline de navegador (scratchpad, no commiteado): `playwright-core` contra
  el Chrome instalado, en una copia del repo en el puerto 4731 con base nueva.
  Por rol (admin y empleado) y por cada una de las 18 vistas más 7 fichas
  captura requests, consola y DOM normalizado. Dos corridas idénticas dan cero
  diferencias, salvo el DOM de Auditoría y Usuarios (cada login agrega filas
  y un "último acceso"), que el comparador ignora.
- Trampa: un usuario recién creado tiene `debe_cambiar_password`, y
  `sesion.js` no inyecta `app.js` hasta que lo cambia. El baseline del
  empleado salió inválido (siempre el Resumen vacío) hasta cambiarle la
  contraseña por `POST /api/auth/cambiar-password`.
- ESLint ad hoc (`no-undef` con `sourceType: module`) sobre `app.js`: **cero
  errores**. Los 4 de `sesion.js` son globales implícitos por `id` del HTML
  (`formRegistro`, `irALogin`) y `sesion.js` sigue siendo script clásico.

**F1 — `frontend/js/sesion.js`:** inyecta `app.js` con `type = "module"` y un
`onerror` que registra el motivo en consola, libera `appInyectada`, cierra la
sesión local y muestra el login con "No se pudo cargar la aplicación".
`index.html` sigue sin referenciar `app.js` (el gate depende de eso; el test lo
verifica). Baseline posterior: cero diferencias. El `onerror` se probó
renombrando `app.js` en la copia.

Base real intacta (md5 `a25ce51db1f9978b77c16aac22bc8a3e`). Sin commitear.

### Qué sigue

F2 (núcleo: `core/formato.js`, `ui.js`, `csv.js`, `filtros.js`, `seleccion.js`,
`registro.js`, `router.js`). Para retomar, el baseline y las herramientas hay que
recrearlas: están en el scratchpad de la sesión, no en el repo.

## 53. Etapa B — F2: el núcleo compartido sale de `app.js` a `frontend/js/core/`

**Qué se hizo.** `app.js` pasó de 9407 a 7933 líneas. El código movido es el de
siempre, copiado tal cual y con `export`/`import` agregados; no se reescribió
ningún patrón (CLAUDE.md §31). Módulos nuevos en `frontend/js/core/`:
- `formato.js`: `money`, `numero`, `moneyCorto`, `hoyISO`, `esc`, `esAdmin`,
  `columnasVisibles`, íconos y `botonEditarFila`.
- `ui.js`: `avisar`, `confirmar`, accesibilidad de modales, `manejarError`,
  `mostrarResultadoBulk`, `filaVacia*`, `tablaCargando`.
- `csv.js`, `filtros.js` (`crearFiltros` y operadores) y `seleccion.js`
  (`crearSeleccion`, `montarBarraSeleccion`, `traerConcurrencia`).
- `comprobante.js`: hoja imprimible y PDF. Va en core porque lo usan facturas,
  presupuestos y devoluciones.
- `router.js`: `VISTAS_CONSTRUIDAS`, `mostrarVista`, hash y nav.
- `negocio.js` y `registro.js`: ver abajo, son lo único que no es una mudanza.

**Decisiones que no son obvias:**
- **`negocio` tiene módulo propio.** `comprobante.js` lee los datos del negocio
  para el membrete y los llena `cargarNegocio()`, que sigue en `app.js`. Un
  binding importado no se puede reasignar desde afuera, así que el dato vive en
  `core/negocio.js` (`export let negocio` + `fijarNegocio()`). Mismo patrón que
  va a usar cada dominio con su estado: `export let` en el dueño, que es el
  único que reasigna. Se verificó que los arrays maestros (`productos`,
  `clientes`, `proveedores`, `cuentasTesoreria`...) se reasignan en un solo
  lugar cada uno.
- **`registro.js` reemplaza llamadas directas entre dominios** (`registrar`,
  `invocar`, `recargar`, `alEntrarEnVista`/`entrarEnVista`). Hoy solo lo usa el
  router; los dominios lo van a necesitar desde F3. El test de F0 ya valida
  que cada `invocar`/`recargar` tenga su `registrar`.
- **Único cambio de lógica:** `mostrarVista` llamaba `cargarAuditoria()` y
  `cargarUsuarios()` según la vista. Ahora llama `entrarEnVista(viewId)` y
  `app.js` registra las dos con `alEntrarEnVista`.
- **`core/` solo puede importar de `core/`.** Test nuevo en
  `frontend-modulos.test.js` (probado a propósito con un `import "../app.js"`
  en `csv.js`: falla).

**Qué falló en el camino (para no repetirlo):**
- La primera versión del router llamaba `entrarEnVista("auditoria")` y
  `entrarEnVista("usuarios")` **sin condición**, en vez de por vista. Cada
  navegación cargaba Auditoría y Usuarios; al empleado le daba 403 en
  `/api/usuarios` y dejaba el tbody de Usuarios con el skeleton. No lo vio
  ESLint ni `npm test`: lo vio la sonda de login de empleado (21 requests en el
  original, 22 con el 403). Con ese código el baseline completo se colgó dos
  veces con `Page crashed` en el recorrido del empleado; con la corrección
  dejó de pasar, pero no se investigó por qué crasheaba (puede ser otra cosa
  que el 403). Correcto: una sola llamada `entrarEnVista(viewId)` y el
  registro decide.
- Un `Escape` no cierra el menú de "+ Filtro" (pasa igual en el original); el
  script de prueba tuvo que hacer click afuera.
- El puerto 4731 ya estaba ocupado por un `node server.js` ajeno a esta
  sesión (PID 18000, arrancado a las 10:17). El seed corrió contra ese servidor
  sin querer. Se usaron 4741 (original) y 4742 (nuevo), y el 4731 no se tocó.

**Cómo se verificó.** Todo contra copias en el scratchpad, con base nueva:
- Baseline de navegador (`baseline.mjs`): por rol (admin y empleado), 18
  vistas, 9 fichas, selección, menú de filtros, modal de nueva venta,
  deep-link a vista admin, Atrás, tema y perfil: requests, consola y DOM
  normalizado. Dos corridas del original dan cero diferencias; original contra
  nuevo: **cero diferencias**. Hace falta esperar ~3,5 s tras el login porque
  el boot encadena `Promise.all` en etapas y `networkidle` cae entre dos.
  Auditoría y Usuarios se vacían del DOM antes de comparar (traen horas).
- Prueba funcional (`funcional.mjs`), original contra nuevo, **idénticas byte a
  byte**: exportar CSV de Ventas (BOM, separador, nombre), `confirmar` con 27
  facturas seleccionadas ("Imprimir en lote", cierre con Escape), Escape que
  limpia la selección, descarga de PDF (jsPDF + html2canvas, `%PDF`, nombre) e
  impresión (`window.print` interceptado: la hoja se vacía justo después, hay
  que capturarla adentro). No ejercitó: el contenido del menú de filtros (el
  selector no matchó; lo cubre el baseline) ni PDF/impresión en lote de varias
  hojas.
- ESLint `no-undef` (`sourceType: module`; `html2canvas` y `jspdf` como globales
  de vendor) sobre `app.js` y `core/*.js`: cero errores.
- `npm test`: 9 de 9. `backend/db/nexo.db` intacta (md5
  `a25ce51db1f9978b77c16aac22bc8a3e` antes y después).

**Herramientas (scratchpad, no van al repo).** `seed.mjs` (empresa "Baseline SA",
admin1 y emp1, 3 productos, 2 clientes, 1 proveedor, 1 compra recibida, 1
venta; el gasto se carga después de crear la categoría), `baseline.mjs`
(incluye `--diff a.json b.json`), `funcional.mjs` y `extraer.mjs`, que cortó
`app.js` por rangos de líneas y calculó exports/imports con ESLint iterando
hasta estabilizarse. Trampas del seed: `condicion_pago` solo acepta `contado`,
15, 30 o 60; `facturas.condicion` solo `efectivo`, `transferencia` o
`mercadopago`; la compra hay que confirmarla y marcarla `recibido` para que
haya stock.

### Qué sigue

F3: primer dominio, uno chico (`negocio`, `usuarios` o `auditoria`), para
fijar el patrón con `registrar`/`recargar`. Después ir de los chicos a los
grandes (ventas, compras, productos), el boot en F13 y la PWA (B2).

## 54. Etapa B — F3: Usuarios, Configuración y Mi cuenta salen a `frontend/js/dominios/`

**Qué se hizo.** `app.js` pasó de 7933 a 7631 líneas. Tres módulos nuevos en
`frontend/js/dominios/` (carpeta nueva, una por dominio), con el código movido
tal cual y solo `import`/`export` agregados:
- `usuarios.js`: ABM de usuarios (lista, modal, baja, reactivar, resetear
  contraseña). Se registra solo con `alEntrarEnVista("usuarios", cargarUsuarios)`.
  No exporta nada: nadie más lee su estado.
- `configuracion.js`: datos del negocio. Registra `registrar("cargar:negocio", ...)`
  y el boot de `app.js` pasó de `cargarNegocio()` a `recargar("negocio")`, en la
  misma primera ola del `Promise.all`. Es el primer uso real de
  `registrar`/`recargar`. Escribe el membrete con `fijarNegocio()` (`core/negocio.js`).
- `perfil.js`: menú Mi cuenta, cambio de contraseña y cerrar sesión. Solo
  listeners.

`app.js` los trae con tres imports de efecto. Los módulos importados se evalúan
antes que el cuerpo de `app.js`, así que sus registros ya existen cuando corre
el boot y el `mostrarVista` inicial. Siguen en `app.js` hasta F13: tema,
colapsar sidebar, `navToggle` y el boot.

**Decisión: Auditoría no entra en F3.** `cargarAuditoria` lee y además
**reasigna** `movimientosStockCache` y `movimientosCajaCache`, que son estado de
Stock y Caja. Moverla ahora obligaba a importar de `app.js` (ciclo) o a cambiar
comportamiento. Va después de Stock y Caja: leerá sus cachés como live binding
de solo lectura y pedirá lo que falte en variables propias. Papelera, que lee
ventas/compras/gastos/devoluciones, también espera.

**Test estático.** Regla nueva en `frontend-modulos.test.js`: `dominios/` nunca
importa `app.js`. Dominio→dominio queda permitido a propósito (los dominios
grandes van a leer estado de otros). Probada con un `import "../app.js"` en
`perfil.js`: fallan la regla nueva y la de ciclos; con el archivo restaurado,
10 de 10.

**Cómo se verificó.** Todo contra copias en el scratchpad, con base nueva
(original = `HEAD`, puerto 4741; nuevo, 4742):
- Baseline de navegador (`baseline.mjs`), admin y empleado, 18 vistas y 9
  fichas: **cero diferencias** en requests, consola y DOM.
- Prueba funcional dirigida (`funcional-f3.mjs`, 38 observaciones),
  **idéntica** entre original y nuevo:
  - Usuarios: alta, duplicado (409, el modal queda abierto), edición, resetear
    con `prompt` corto y válido, baja con `confirmar` (cancelada con Escape y
    luego aceptada), reactivar.
  - Configuración: nombre vacío rechazado, guardado, cerrar sin guardar y
    reabrir sin valores a medias.
  - Membrete: tras guardar el nombre, el comprobante impreso sale con el
    nombre, el CUIT y el pie nuevos (valida el live binding de `negocio`).
  - Mi cuenta: contraseña actual incorrecta, cambio correcto, cierre con click
    afuera, cerrar sesión.
  - Empleado: Configuración en solo lectura (8 de 8 controles deshabilitados) y
    ningún `GET /api/usuarios`.
- `npm test`: 10 de 10. `backend/db/nexo.db` intacta (md5
  `a25ce51db1f9978b77c16aac22bc8a3e`).

**Qué falló en el camino (para no repetirlo):**
- **El ESLint de la primera pasada de F3 no probaba nada** (y el de F2 pudo
  estar igual: no se volvió a correr). ESLint ignora en silencio los archivos
  fuera de la carpeta base de la config, y `--no-warn-ignored` esconde el
  aviso: devolvía "cero errores" sobre archivos que no leía. Se notó porque un
  archivo de control con un import sin usar tampoco dio error. Hay que correrlo
  **desde la carpeta que contiene los archivos** y confirmar siempre con un
  control que falle a propósito. Ya bien corrido sobre `app.js`, `core/` y
  `dominios/`: sin `no-undef`, `no-import-assign` ni imports sin usar. Quedan 4
  `no-unused-vars` que **ya estaban en el original** (`presupuestoFichaId`,
  `devolucionFichaId`, `ventaADevolverItems`, `devolucionProveedorFichaId`,
  asignadas y nunca leídas): no se tocaron, una mudanza no cambia comportamiento.
- La primera corrida funcional dio dos diferencias que eran ruido: un toast
  viejo todavía visible en una corrida y ya vencido en la otra, y un 404 de
  logos que no copié al scratchpad (`/assets/...`). Se resolvió registrando solo
  el último toast y las URLs de los 404, y repitiendo con bases nuevas.
- Mi primer script usaba `[name=...]` y los inputs de Usuarios y Mi cuenta
  tienen solo `id` (el código accede por `form.usuarioUsuario`).
- Un heredoc largo con dos `<<'EOF'` encadenados falló al parsear y no aplicó
  nada: para docs largos usar Edit.

### Qué sigue

F4: siguiente dominio chico. Candidatos sin acoplamiento con estado ajeno:
catálogos de Productos (categorías, listas de precios, depósitos) o Cuentas
corrientes. Auditoría y Papelera van después de Stock/Caja y de los dominios
que leen. Después los grandes (ventas, compras, productos), el boot en F13 y
la PWA (B2).

## 55. Etapa B — F4: Cuentas corrientes sale a `frontend/js/dominios/`

**Qué se hizo.** `app.js` pasó de 7631 a 7408 líneas. Módulo nuevo
`frontend/js/dominios/cuentas-corrientes.js` (tablas a cobrar y a pagar, aging,
filas expandibles, filtros y exportar CSV), con el código movido tal cual y solo
`import`/`export` agregados. Se registra solo con
`registrar("cargar:cuentasCorrientes", ...)` y no exporta nada.

**Por qué este dominio y no los catálogos de Productos.** Categorías, listas de
precios y depósitos leen `categorias`, `listasPrecios` y `depositos`, que
reasigna `cargarProductos()`: moverlos obliga a sacar ese estado de su dueño
antes de tiempo, así que van junto con Productos. Cuentas corrientes solo tiene
su propia caché (`ccUltimaRespuesta`).

**Únicos cambios de lógica (equivalentes):**
- Las cuatro acciones de otros dominios que dispara CC pasan por el registro:
  `invocar("abrirFicha:cliente" | "abrirFicha:proveedor" | "cobrar:venta" |
  "pagar:compra", id)`. `app.js` las registra junto a
  `alEntrarEnVista("auditoria", ...)`.
- Las 15 llamadas a `cargarCuentasCorrientes()` de `app.js` pasaron a
  `recargar("cuentasCorrientes")`. Todas estaban dentro de un `Promise.all` o un
  `then`, así que devolver la Promise de `recargar` es equivalente.

**Cómo se verificó.** Copias en el scratchpad con base nueva (original = `HEAD`,
puerto 4741; nuevo, 4742), más una venta a 30 días y una compra a 60 para tener
varios tramos:
- Baseline de navegador (`baseline.mjs`), admin y empleado, 36 pasos cada uno:
  **cero diferencias**.
- Prueba funcional dirigida (`funcional-f4.mjs`, 22 observaciones), **idéntica**
  entre original y nuevo: totales y nota de neto, expandir/colapsar, CSV de
  cobrar, pagar y filtrado, filtro por cliente con su chip, "sin resultados" con
  limpiar, nombre que abre la ficha de cliente y de proveedor, "Cobrar" y "Pagar"
  (modal con el saldo, registro, toast y totales de CC recargados solos) y la
  vista del empleado.
- `npm test`: 10 de 10. ESLint corrido desde la carpeta de los archivos, con un
  control que falló a propósito: sin `no-undef` ni imports sin usar; solo los 4
  `no-unused-vars` viejos. `backend/db/nexo.db` intacta (md5
  `a25ce51db1f9978b77c16aac22bc8a3e`).

**Qué falló en el camino (para no repetirlo):**
- La primera versión del script funcional apuntaba a `.filtro-popover
  .filtro-input`, que resuelve a tres elementos (dos selects y el input): hay que
  usar `input.filtro-input`. Falló igual en original y nuevo, o sea que era de la
  prueba y no del cambio.
- `npm test` falló en el paso intermedio hasta registrar las cuatro acciones en
  `app.js`: el test de F0 detecta cada `invocar` sin su `registrar`.
- En `fichaCliente` el hash sigue siendo `#/cuentas-corrientes` (la ficha no
  cambia el hash); es igual en el original.

### Qué sigue

F5: otro dominio chico. Candidatos: Gastos (con `categoriasGasto`, que solo
reasigna su propio `cargarGastos`; verificar antes) o Proveedores/Clientes si se
resuelve cómo exponen su estado (`export let` en el dueño). Auditoría y Papelera
siguen esperando a Stock, Caja y a los dominios que leen. Los grandes (ventas,
compras, productos) al final, el boot en F13 y la PWA (B2).

## 56. Etapa B — F5: Gastos sale a `frontend/js/dominios/` y los maestros compartidos a `core/maestros.js`

**Qué se hizo.** `app.js` pasó de 7408 a 7083 líneas. Módulos nuevos:
- `frontend/js/dominios/gastos.js` (337 líneas): tabla, filtros, CSV, modal de gasto y modal
  de categorías de gasto, movidos tal cual. Exporta `gastos` y `categoriasGasto` con
  `export let` (los leen Resumen, Papelera y el asistente) y se registra con
  `registrar("cargar:gastos", ...)`.
- `frontend/js/core/maestros.js` (34 líneas): `cuentasTesoreria` y `proveedores`, con
  `fijarCuentasTesoreria()`/`fijarProveedores()`, y `poblarSelectCuentas()`. Mismo mecanismo
  que `core/negocio.js` (hist. §53): un binding importado no se puede reasignar, así que el
  dueño del dato (`cargarCaja`, `cargarProveedores`, ambos todavía en `app.js`) lo fija con el
  setter y todos los demás lo leen importándolo.

**Por qué `core/maestros.js` y no otra forma.** Gastos lee cuentas de tesorería y proveedores,
que hoy reasignan funciones de `app.js`, y `dominios/` no puede importar `app.js` (lo verifica
el test de F0). Se descartó `invocar("leer:proveedores")`, que mete lecturas síncronas en el
registro de acciones, y se descartó importar de un futuro `dominios/proveedores.js`, que
abriría una red de imports entre dominios (Compras ↔ Proveedores) con riesgo de ciclos. Las
cuentas de tesorería las leen unos ocho lugares y son un maestro (CLAUDE.md §3).

**Únicos cambios de lógica (equivalentes):**
- Anular y guardar un gasto hacían `Promise.all([cargarGastos(), cargarCaja(),
  cargarPanelResumen()])`; ahora `recargar("gastos", "caja", "panelResumen")`. `app.js`
  registra `cargar:caja` y `cargar:panelResumen`.
- `cargarGastos()` llamaba a `renderPapelera()`; ahora `invocar("render:papelera")`, que
  `app.js` registra. Las tres acciones se registran **antes** del `Promise.all` del boot,
  porque `render:papelera` corre apenas termina el primer fetch de gastos.
- Las tres llamadas a `cargarGastos()` que quedaban en `app.js` (asistente, restaurar desde
  la papelera, boot) pasaron a `recargar("gastos")`.

**Cómo se verificó.** Copias en el scratchpad con base nueva (original = `HEAD`, puerto
4741; nuevo, 4742), mismo seed: empresa, admin, un proveedor y un empleado con la contraseña
ya cambiada.
- Prueba funcional dirigida (`funcional-f5.mjs`, 52 observaciones), **idéntica** entre
  original y nuevo, con 0 errores de consola: alta y edición de categorías, cuentas y
  proveedores del modal de gasto, el tipo que arrastra la categoría, alta, edición y anulación
  de gastos con sus avisos, Caja (`-$ 2.300,00`) y Resumen recargados solos, filtro con chip y
  "sin resultados", CSV, Papelera (anular y restaurar), la propuesta de gasto del asistente
  con `NEXO_INTERPRETE=stub`, y la vista del empleado (sin botón de anular).
- Pasada de humo (`humo-f5.mjs`, 41 observaciones) por las 18 vistas como admin y como
  empleado, más el modal de movimiento de caja, el de compra y la tabla de proveedores:
  **idéntica** salvo los timestamps de Auditoría, que son la hora de cada corrida.
- `npm test`: 10 de 10. ESLint corrido desde la carpeta de los archivos, con un
  `control.js` que falló a propósito: `app.js` solo con los 4 `no-unused-vars` viejos;
  `gastos.js` y `maestros.js` sin errores. `backend/db/nexo.db` intacta (md5
  `a25ce51db1f9978b77c16aac22bc8a3e`).

**Qué se aprendió en el camino (para no repetirlo):**
- En Windows con `core.autocrlf=true`, `git archive HEAD` entrega LF y el árbol de trabajo
  tiene CRLF: un `diff -rq` entre ambos marca casi todos los archivos como distintos. Hay que
  usar `diff --strip-trailing-cr`.
- Los hooks de GateGuard piden presentar los hechos antes de la primera escritura de cada
  archivo nuevo y de la primera edición de `app.js`; si se manda un lote en paralelo, solo la
  primera operación rechazada queda sin aplicar y hay que reintentarla.
- Las bases de prueba quedan modificadas por el recorrido: si un selector falla a la mitad
  hay que resembrar las dos.

### Qué sigue

F6: otro dominio. Con `core/maestros.js` ya existe el hogar de los maestros compartidos, así
que Proveedores y Clientes pasan a ser candidatos: al moverlos, `cargarProveedores()` sigue
llamando a `fijarProveedores()` y se queda con su propia tabla, ficha y modal. Auditoría y
Papelera siguen esperando a Stock, Caja y a los dominios que leen: `renderPapelera` lee
`ventas`, `compras`, `gastos`, `devoluciones` y `devolucionesProveedor`. Los grandes (ventas,
compras, productos) al final, el boot en F13 y la PWA (B2).

## 57. Auditoría general del 6 de octubre de 2026 — Fases 0 a 2 (respaldo y backend)

Pedido del usuario: auditar todo el proceso con las herramientas de ECC y pulir el proyecto para
que sirva de estructura de trabajo. Tres exploraciones en paralelo (backend, frontend,
proceso/herramientas) y la revisión de ECC (`code-reviewer`, `security-reviewer`) sobre cada fase.
Decisiones del usuario: seguridad y datos primero (antes de seguir con F6–F13), oficializar la rama
personal `solla` + PR a `main`, y borrar los placeholders y renombrar `desing/` → `diseno/`.

**Fase 0 — git.** `solla` pusheada, `origin/main` traído (los 2 merges #24/#25), `main` local
adelantado. Copia de la base real fuera del repo en `~/Documents/nexo-backups/`.

**Fase 1 — respaldo automático** (`backend/db/respaldo.js`, `scripts/backup-db.mjs`,
`npm run backup`). `db/index.js` no tiene tabla de versiones, así que "migración pendiente" no se
puede detectar de forma genérica: se respalda en cada arranque, antes de abrir la base, con
`VACUUM INTO`. No duplica si la base no cambió: la huella ignora los bytes 24-27, 40-43 y 92-95 del
encabezado SQLite, porque `index.js` recrea vistas en cada arranque y cambian sin que cambie ningún
dato (con el hash del archivo crudo, cada arranque creaba un respaldo). Rotación de 14 que nunca borra
el recién creado (si el reloj retrocede) y que no corta el arranque si no puede borrar uno
(archivo abierto en Windows). Si el respaldo falla, el arranque se corta. Variables:
`NEXO_DB_PATH`, `NEXO_BACKUP_DIR`, `NEXO_BACKUP_KEEP`, `NEXO_BACKUP=off`. 13 tests.

**Fase 2 — backend** (`server.js`, `interprete.js`, tests en `backend/test/api.test.js` con el
arnés `servidor-de-prueba.js`):
- **Ventas:** `validarItemsVenta` (POST y PUT). Cantidad 0, precio negativo y valores no numéricos
  pasaban. El revisor encontró además que un texto como `"0x5"` pasa `Number()` pero SQLite lo
  guarda como TEXT en la columna REAL: venta en total 0 con deuda y stock inconsistente. Por eso solo
  se aceptan números JSON reales, con tope 1e9 (dos valores finitos grandes se desbordaban y dejaban
  el dashboard en `null`). Mismo criterio en cobros y pagos.
- **Asistente:** la rama de compra de `/api/asistente/ejecutar` exige admin (era un atajo alrededor
  de la política del circuito de compras).
- **Presupuestos:** `producto_id`/`variante_id` se validan contra la empresa (el GET devolvía
  nombres de productos de otra empresa).
- **Compras y ventas:** el saldo de pago incluye el envío y solo se paga una compra activa; cobros
  y facturación rechazan ventas anuladas.
- **Errores:** 404 JSON bajo `/api`, manejador final sin stack (conserva los 4xx), `interpretar`
  envuelto con `asincrono()` (un rechazo tumbaba el proceso de todas las empresas),
  `unhandledRejection` registrado, Gemini ya no devuelve su mensaje al cliente.
- **Cabeceras, login y menores:** nosniff, X-Frame-Options DENY, Referrer-Policy, `x-powered-by`
  off, `NEXO_TRUST_PROXY`; login valida tipos y largos y tiene tope de 30 fallos por IP con poda de los
  mapas; `?limit` negativo; alta de clientes y proveedores auditada; `engines` Node >= 22.

**Se decidió NO hacer** (queda en el backlog): WAL y `busy_timeout` (cambia el formato del archivo de
la base real al próximo arranque; conviene decidirlo junto con la migración de la Etapa A), CSP
(necesita autoalojar fuentes y mover el script inline del `<head>`: va con la PWA, B2), validar
`POST /api/facturas` (`neto`, `tipo`, `letra`) y los importes de tesorería/gastos con el mismo rigor.

**Qué se aprendió:**
- `Number()` es un validador demasiado permisivo para algo que va crudo al INSERT: acepta `"0x5"`,
  `"0b11"`, `" 5 "`. Validar `typeof` además del valor.
- Un hash del archivo SQLite entero no sirve para detectar "cambió la base": el encabezado cambia con
  cada escritura, aunque no cambie ningún dato.
- El arnés de tests de API tiene que matar al servidor hijo si el arranque expira: sus pipes
  mantienen vivo el event loop y `node --test` no termina.

### Qué sigue

Fase 3 (frontend: `esc()` en las 145 asignaciones a `innerHTML` de `app.js`, que hoy no lo usa
ninguna; wrapper `api()` con `res.ok` y errores de red; `.catch` en el boot), Fase 4
(ESLint versionado, CI, `.editorconfig`, `.env.example`), Fase 5 (scripts `seed`,
`verificar-migracion`, `regresion-head`), Fase 6 (limpieza del repo y correcciones de README,
CLAUDE.md y `frontend/README.md`) y Fase 7 (backlog ordenado en `handoff.md`). Los commits de las
Fases 1 y 2 están en `solla` sin pushear.

### Addendum al §57 — primer arranque real de la base (6 de octubre, 22:17 UTC)

Autorizado por el usuario ("las tres primeras" de lo que se le pedía tras las Fases 0–2). Se
importó `backend/db/index.js` con `NEXO_BACKUP_DIR` apuntando a `OneDrive\Nexo-respaldos`: el
respaldo automático dejó primero la base pre-migración y, en el segundo arranque, la migrada.
Los conteos de las 36 tablas dieron idénticos antes y después (solo `sesiones` 1 → 0, limpieza
de vencidas); `integrity_check` ok, `foreign_key_check` sin filas, ninguna fila sin
`organizacion_id`, `categorias` con `UNIQUE (organizacion_id, nombre)`, un tercer arranque no creó
otro respaldo. md5 de la base real pasó de `a25ce51d…` a `8dc00857…`. `NEXO_BACKUP_DIR` se fijó
como variable de entorno de usuario de Windows. `NEXO_TRUST_PROXY` no se define: hoy no hay proxy
inverso delante.

## 58. Auditoría general — Fase 3 (frontend: XSS y errores de red), 11 de octubre de 2026

Pedido del usuario: "seguir trabajando" → la Fase 3 del plan de §57, decidida antes de seguir con
F6–F13. Siete commits en `solla` (`05d71e3` a `56537e9`), sin pushear.

**XSS almacenado cerrado.** `app.js` tenía 147 asignaciones a `innerHTML` y ningún `esc()`: un
cliente llamado `<img src=x onerror=…>` ejecutaba código en la sesión de quien lo mirara.
- `esc()` (`core/formato.js`) suma la comilla simple y se aplica a todo dato del backend, del
  usuario, de localStorage (filtros guardados) o del LLM que se imprime en HTML, incluidos
  atributos `value="…"`.
- 134 interpolaciones se escaparon con un script que usa el mismo analizador del test; el resto,
  a mano (valores de las fichas, `<title>` del gráfico, contacto, concepto de caja, auditoría,
  asistente).
- La ficha de producto es la única que mete HTML en `valor`: escapa sus datos dentro del arreglo
  de pares.
- Test estático nuevo (`backend/test/plantillas-html.js` desde `frontend-modulos.test.js`):
  tokeniza los template literals (con anidamiento) y exige `esc()` en todo `${x.campo}` impreso
  en un template con etiquetas o atributos. Solo eximen los formateadores de una lista
  explícita (`esc`, `money`, `numero`, `porcentaje` y cuatro funciones propias que escapan
  adentro). Tiene un caso de control con cadenas sintéticas y un test de mutación: quitar
  cualquier `esc(x.campo)` real que esté dentro de un template lo hace fallar.
- No ve un string armado en otra variable y después interpolado: esos se escapan donde se arman.

**Errores de red.** Nuevo `core/api.js`.
- `api(url, { method, body, error })` avisa con un toast un error HTTP, un corte de red o una
  respuesta no JSON, y lanza. Lo que sigue al `await` no corre.
- `refrescar([...])` espera todas las recargas posteriores a una escritura con `allSettled`.
  Solo relanza errores que no vengan de `api()`.
- Las 112 llamadas de `app.js`, `core/` y `dominios/` pasan por ahí, salvo dos a propósito:
  `perfil.js` (muestra el error en el modal) y la creación de variantes en lote (cuenta las
  fallas).
- El arranque usa `refrescar()` por ola, y `cargarFacturas()` entró en la primera.

**Menores.**
- Test de ids: todo `getElementById("x")` literal existe. Encontró `formBootstrap` y
  `vistaEyebrow` muertos.
- `sesion.js` usaba `formRegistro`/`irALogin` como globales implícitas de `window`.
- `scope="col"` en los 269 `<th>`.
- Drawer móvil con `aria-expanded` sincronizado (MutationObserver) y cierre con Escape.
- CSV: los textos que empiezan con `= + - @` llevan un apóstrofo, para que Excel no los ejecute
  como fórmula.

**Verificación.**
- `npm test`: 46 tests, 11 del frontend.
- Chrome vía `playwright-core` desde el scratchpad, contra un servidor de prueba (base nueva,
  `NEXO_INTERPRETE=stub`).
- XSS: payloads en todos los campos de texto, recorriendo 18 vistas con sus fichas, 4 modales,
  un filtro y el asistente. Dio 0 ejecuciones. El mismo recorrido contra `bfde0a6` (control) dio
  81.
- Servidor caído: una lectura y una escritura avisan "Sin conexión" y el modal queda abierto.
- `GET /api/categorias-gasto` en 500 después de guardar un gasto: se guarda una sola vez, el
  modal cierra y avisa el éxito.
- `GET /api/facturas` en 500 al arrancar: Ventas y Resumen cargan igual.
- Drawer en 390 px: abre, cierra con Escape y devuelve el foco.
- ESLint 9 sobre una copia del frontend, con un archivo de control: solo quedan los 4
  `no-unused-vars` viejos.
- md5 de la base real sin cambios (`8dc00857…`).

**Revisión de ECC (`security-reviewer`).**
- No encontró XSS residual.
- Encontró un problema que la propia Fase 3 había introducido: `api()` lanzaba también en las
  recargas después de guardar. Una venta guardada cuyo refresco fallaba dejaba el modal abierto
  e invitaba a reenviarla (duplicado). Se resolvió con `refrescar()`.
- También señaló el arranque que se cortaba entero, la promesa rechazada cacheada en
  `variantesDeProducto`, los huecos del analizador (funciones propias, templates de solo
  atributos) y la inyección de fórmulas en el CSV. Todo quedó arreglado.

**Qué se aprendió:**
- Si un wrapper de fetch lanza, cambia también el comportamiento de las recargas posteriores a
  una escritura. Separar "falló lo que pedí" de "falló algo que refresco después".
- Un test estático necesita dos controles: uno sintético (que el analizador lee) y uno de
  mutación sobre el código real (que no tiene huecos donde importa).
- El control negativo en el navegador (correr lo mismo contra el commit anterior) es lo que
  demuestra que la prueba de XSS prueba algo.
- `POST /api/facturas` con una `condicion` fuera del `CHECK` devuelve 500: anotado como pendiente.

### Qué sigue

Fase 4 (ESLint versionado, CI, `.editorconfig`, `.env.example`), después las Fases 5 a 7 de §57.
Pushear `solla`.

## 59. Auditoría general — Fase 4 (herramientas versionadas), 11 de octubre de 2026

Pedido del usuario: "seguir" → la Fase 4 del plan de §57. Tres commits en `solla`
(`03c5baf`, `426e80f`, `fcba6e7`) más este de documentación, sin pushear.

**ESLint versionado.**
- `package.json` en la raíz, solo de herramientas: devDependencies `eslint` 10, `@eslint/js` y
  `globals`, y los scripts `lint`, `test` y `backup` (los dos últimos delegan en `backend/`).
  No es `"type": "module"`, así que la config es `eslint.config.mjs`.
- Se usó ESLint 10 y no el 9 que decía el plan: el 10 ya era la línea vigente (10.12) y la
  misma config funcionó sin cambios. Pide Node `^22.13`, el mismo mínimo que `node:sqlite`
  sin flag.
- Config: `recommended`, globales de navegador para `frontend/js` (más `jspdf` y
  `html2canvas`), `sesion.js` como script clásico, globales de Node para `backend`, `scripts`
  y los `.mjs` de la raíz. `no-empty` con `allowEmptyCatch`: los 5 `catch {}` vacíos son a
  propósito (localStorage y logout).
- `scripts/lint.mjs` no se fía del resultado de ESLint. Antes:
  - pasa un fuente de control (`const sinUsar = <global de la zona>; noDefinida();`) como si
    estuviera en cada zona y exige exactamente `no-undef` + `no-unused-vars`. Eso prueba que
    las reglas corren y que los globales de la zona están cargados;
  - recorre las carpetas y exige que cada `.js`/`.mjs` (salvo `node_modules` y `vendor`)
    aparezca entre los archivos que ESLint leyó.
- Se borraron los 4 `no-unused-vars` viejos de `app.js` (`presupuestoFichaId`,
  `devolucionFichaId`, `ventaADevolverItems`, `devolucionProveedorFichaId`): se asignaban y
  nunca se leían.
- Resultado: 32 archivos, sin problemas. El backend ya estaba limpio con `recommended`.

**`.env`, versiones y editor.**
- `start`, `dev` y `backup` de `backend/package.json` cargan `../.env` con
  `--env-file-if-exists` (Node 22.9+, sin dependencias). Lo del entorno le gana al archivo,
  así que `NEXO_BACKUP_DIR` de Windows sigue mandando. `npm test` no lo lee. Sin `.env`, Node 24
  imprime "../.env not found. Continuing without it." y sigue.
- `.env.example` documenta, comentadas, las 9 variables que lee el backend.
- `engines >=22.13` en los dos `package.json` y `.nvmrc` con `22`. Según el historial de la
  doc de Node, `node:sqlite` dejó de necesitar `--experimental-sqlite` en 22.13.0.
- `.editorconfig` (utf-8, LF, dos espacios; Markdown sin recorte de espacios finales). Sin
  Prettier. `.vscode`: `formatOnSave` apagado y EditorConfig en lugar de Prettier en las
  extensiones recomendadas.

**CI.** `.github/workflows/ci.yml`:
- en cada PR y en cada push a `main`, con permisos de solo lectura y cancelación de corridas
  viejas;
- `checkout@v7` y `setup-node@v7` (las vigentes), Node de `.nvmrc` con caché de los dos
  lockfiles;
- `npm ci` (raíz y backend), `npm run lint`, `npm test`.

También se sumaron una plantilla de PR con el checklist del proyecto y el README ("Cómo
correrlo" y "Tests").

**Verificación.**
- Mutaciones, todas revertidas, con el mensaje que dieron:
  - `app.js` en `ignores` → "ESLint no leyó 1 archivo(s): frontend\js\app.js";
  - `no-undef` apagado → falla el control de reglas en `frontend/js/__control__.js`;
  - sin `globals.browser` → el control da dos `no-undef`;
  - una variable sin usar en `gastos.js` → error normal.
- Clon limpio en el scratchpad (`npm ci` ×2, lint, tests): 32 archivos y 46 de 46.
- `.env` en el clon, con base del scratchpad: `PORT=4799` del archivo se respeta, `PORT=4800`
  del shell le gana y sin `.env` arranca igual. `NEXO_BACKUP=off` del archivo se respetó (no se
  creó `backups/`).
- Imports relativos contra los nombres reales de archivo (mayúsculas): sin diferencias. Es lo
  que más suele romper al pasar a Linux.
- md5 de la base real sin cambios (`8dc00857…`).
- **No probado:** el CI en Linux. Docker Desktop estaba apagado y no se levantó; la primera
  corrida real va a ser al abrir el PR.

### Qué sigue

Fase 5 (scripts `seed`, `verificar-migracion`, `regresion-head`), después las Fases 6 y 7
de §57. Pushear `solla` y abrir el PR a `main`, que es también la primera corrida del CI.

## 60. Auditoría general — Fase 5 (scripts de verificación), 13 de octubre de 2026

Pedido del usuario: "seguir" → la Fase 5 del plan de §57. Cuatro commits en `solla`
(`deecda5`, `4ee9652`, `e137dd1`, `435db4f`) más este de documentación, sin pushear. Pasan a
estar versionados los procedimientos de "Cómo verificar" que cada sesión reescribía en el
scratchpad.

**Base común.**
- `levantarServidor` (`backend/test/servidor-de-prueba.js`) acepta `{ backendDir, dbPath }`:
  levanta otro árbol (un worktree) o usa una base existente, que no se borra al cerrar. Sin
  argumentos hace lo mismo que antes, y `api.test.js` no cambió. El cliente suma `del`.
- `scripts/lib/base-real.mjs`: `md5`, `copiarBase` (abre el origen de solo lectura y hace
  `VACUUM INTO`, igual que `respaldo.js`) y `asegurarQueNoEsLaReal`.

**`npm run seed -- --db <ruta>`** (`scripts/seed.mjs`). Crea la empresa "Baseline SA" con
`admin1`/`clave-segura-1` y `emp1`/`clave-segura-2` (con la contraseña ya cambiada).
- **Datos:**
  - 3 productos, uno con variantes por talle;
  - 2 clientes y 1 proveedor;
  - una compra a 30 días con envío, recibida y pagada en parte;
  - una venta de contado cobrada y facturada, y otra a cuenta corriente;
  - un presupuesto, una factura manual, una devolución de venta y una a proveedor;
  - una transferencia entre depósitos;
  - un gasto y un aporte a caja.
- **Todo por la API**, así que valida y audita igual que un operador. Por eso ya no hace falta
  crear una segunda organización a mano con scrypt: `--prefijo b --empresa "Otra SRL"` la
  siembra en la misma base (usuarios y SKU son únicos en todo Nexo).
- **Otras opciones:** `--url` siembra un servidor que ya corre.
- **Rechazos:** la base real, siempre; el puerto 3000, salvo con `--forzar`.
- **Verificado:** dos empresas en la misma base, con conteos simétricos por `organizacion_id`
  en todas las tablas de negocio.

**`npm run verificar-migracion`** (`scripts/verificar-migracion.mjs`). Es el arnés de §48.
- **Casos:** base nueva, copia de la real, copia de cada `nexo.db.backup-*` y `--base <ruta>`.
- **Controles:**
  - 1er arranque sin errores;
  - 2do y 3er arranque sin cambios de esquema ni de datos (salvo `sesiones`);
  - `integrity_check` y `foreign_key_check`;
  - esquema final igual al de la base nueva. Se comparan columnas por nombre, índices
    automáticos por sus columnas, FKs, CHECK, vistas y triggers;
  - ninguna tabla pierde filas.
- **Resultado:** 24 de 24 OK en unos 30 s.
- **Controles negativos, todos revertidos:**
  - una columna que solo está en `schema.sql` → fallan la real y los 22 backups;
  - un `DELETE` de `auditoria` en cada arranque → idempotencia y "se perdieron filas".
- **Hallazgo 1: un CHECK atrasado ya no se detectaba.** Desde el arreglo de §48, un `CHECK`
  atrasado en `schema.sql` se corrige solo: `db/index.js` corre los rebuilds sobre la base
  nueva y el esquema final queda igual. Ninguno de los controles de arriba lo detectaba. Se
  sumó uno: una base armada **solo** con `schema.sql` tiene que tener los mismos `CHECK` que
  la base nueva migrada. Con el `CHECK` de `entidad` de `auditoria` atrasado a propósito,
  falla.
- **Hallazgo 2: `schema.sql` no tiene la forma final.** Ese mismo control mostró que hoy
  `schema.sql` no tiene la forma final en 10 tablas. Lo que vive solo en `db/index.js` (por
  `ALTER` posteriores al último rebuild):
  - 13 columnas: `deposito_id`, `lista_precio_id` y `condicion_pago` en las operaciones y en
    clientes y proveedores, y `venta_id`/`devolucion_id` en `facturas`;
  - 7 índices: `idx_auditoria_org_fecha`, la numeración de facturas, etc.;
  - 4 vistas de stock y saldo.

  Funciona, pero contradice la regla de §48. El script lo muestra como aviso (`!`) sin
  fallar. Alinearlo es un cambio de esquema que hay que explicar antes, y queda para la Fase
  7.

**`npm run regresion`** (`scripts/regresion-head.mjs`).
- **Cómo compara:**
  - `git worktree` de `--ref` (por defecto `HEAD`), con una junction a
    `backend/node_modules`;
  - base sembrada una vez con el código de la ref y copiada a las dos versiones;
  - todos los `GET` de `RUTAS_PERMISOS` como admin y como empleado. Las rutas con `:id` salen
    de su listado (`LISTADO_DE`), y una ruta nueva con parámetro que no esté ahí corta el
    script.
- **Qué normaliza:** solo la hora de los logins de la propia prueba (`ultimo_acceso` de
  `/api/usuarios` y `fecha` de los `login` en `/api/auditoria`).
- **Otras opciones:** `--db` parte de una copia de otra base y siembra encima una empresa
  "regresion"; `--usuario`/`--password` compara además como un usuario de esa base.
- **Resultado:**
  - 112 comparaciones (56 rutas × 2 roles): 0 distintas en unos 5 s, también con
    `--db backend/db/nexo.db`;
  - control negativo (un campo de más en `GET /api/clientes`, revertido): marca esa ruta en
    los dos roles y nada más;
  - al terminar, `git worktree list` queda solo con el principal.
- **La junction se borra antes que el worktree.** Se probó antes con carpetas de mentira:
  `rmSync` de la junction, y también un borrado recursivo de la carpeta que la contiene,
  dejan intacto el destino.

**Verificación general.** `npm run lint` (36 archivos) y `npm test` (46 de 46) verdes en cada
commit. md5 de la base real sin cambios (`8dc00857…`).

**No entra al CI todavía:** las bases de `backend/db/` no están versionadas, y la regresión
necesita una ref con la que comparar. Queda para la Fase 7, junto con alinear `schema.sql`.

### Qué sigue

Fase 6 de §57 (limpieza del repo y correcciones de README, `frontend/README.md` y CLAUDE.md),
después la Fase 7. Pushear `solla` y abrir el PR a `main`, que es también la primera corrida
del CI.

## 61. Auditoría general — Fase 6 (limpieza del repo y documentación), 14 de octubre de 2026

Pedido del usuario: "seguir laburando (hacerme un resumen de lo que falta antes de empezar)" → la
Fase 6 del plan de §57. Tres commits en `solla` (`0f6565b`, `70d80c5`, `21c665b`) más este de
documentación, sin pushear. No toca código de la app ni la base.

**Repo.** Se borraron `src/hola.txt` (con eso desaparece `src/`), `assets/hola.txt` y
`desing/hola.txt` (vacíos o pruebas de git) y `docs/Mejoras.txt` (una línea de prueba).
`desing/` pasa a `diseno/` con `git mv`: solo tiene `logo.png`, que no es igual a ninguno de
`assets/logo/` y no lo referencia ningún archivo de código.

**README y `frontend/README.md`.**
- La estructura del README suma `scripts/`, `.github/` y `diseno/`. La fila B del roadmap pasa a 5
  dominios y 7042 líneas de `app.js`, y los respaldos salen de los pendientes de producción.
- El árbol de `frontend/README.md` suma `core/api.js`, `core/maestros.js`, `dominios/gastos.js` y
  `vendor/`. La sección "Qué es real y qué es placeholder" decía que Facturas y Clientes no tenían
  pantalla: hoy los 17 ítems del menú tienen su vista (verificado contra `index.html`), y la vista
  `placeholder` sigue solo como red de `router.js`. El comentario de IVA de `index.html` apunta a
  la Etapa C en vez de "fuera de V1".

**`CLAUDE.md`** (sin renumerar):
- la regla de ramas pasa de `feature/<nombre>` a la rama personal + PR con CI;
- el preámbulo y §28 reflejan que el alta de empresas ya existe, y lo que falta es `NOT NULL` y el
  registro configurable o verificado;
- la estructura suma `core/`, `dominios/`, `respaldo.js`, `scripts/` y `.github/`;
- §31 dice que la modularización está en curso;
- §35 saca los backups de pendientes;
- §38 suma una columna "Estado". La Etapa 0 figura hecha: el commit `9e45182` y hist. §35.

**Cabecera de este archivo:** aclara que desde §52 las etapas se escriben acá directamente y que
el `# Handoff — Nexo` de más abajo es parte del texto movido.

**Verificación:** `npm test` (46 ok) y `npm run lint` (36 archivos, sin problemas). `git grep`
de `desing`, `hola.txt` y `Mejoras.txt` solo encuentra este archivo. md5 de la base real sin
cambios (`8dc00857…`).

### Qué sigue

Fase 7 de §57: consolidar el backlog y alinear `schema.sql`. Se evalúa sumar en la misma pasada
de rebuilds el `NOT NULL` de `organizacion_id`, el SKU único por empresa y los índices, y llevar
`verificar-migracion` al CI. Antes de tocar el esquema se explica la migración. Después: pushear
`solla` y abrir el PR a `main`, que va a ser la primera corrida del CI.

## 62. Rediseño visual general del frontend, 14 de octubre de 2026

Pedido del usuario: "una mejora general de todo el diseño, agregá iconos, mejorá la tipografía,
todo todo", con las skills de diseño instaladas (`ui-ux-pro-max` y `frontend-design`), porque
"aunque tenga muchas funciones al cliente no le va a gustar si no tiene un diseño atractivo e
interactivo". Además pidió anotar como pendiente una landing page con planes e ingreso (queda en
`handoff.md`). Commit `802ebcf` en `solla`, sin pushear.

**Dirección.** `ui-ux-pro-max` recomendó estilo plano, slate + verde y Poppins/Open Sans, todo genérico
para un SaaS. Se tomaron sus reglas de calidad (contraste, foco visible, objetivos de toque, SVG en
vez de emojis, reduced-motion) y no la paleta ni las fuentes. El concepto viene del rubro: el cuaderno
de cuentas de un comercio, con birome azul para las acciones y resaltador amarillo para lo que
importa. Antes era negro puro con monoespaciada en todos los títulos: se leía como terminal y no como
producto.

**Qué cambió:**
- **Tokens** (`styles.css`): fondo gris frío con paneles blancos y sombra mínima, tinta azul noche,
  tema oscuro azul noche, radios por jerarquía, duraciones y curva de movimiento. Sin etiquetas en
  mayúsculas: el tamaño chico se compensa con peso y color.
- **Tipografía:** Bricolage Grotesque para títulos y cifras e Instrument Sans para el resto. Las dos son
  variables, tienen `tnum` y llevan licencia OFL. Se sirven desde `frontend/fonts/` (solo el
  subconjunto latino, 107 KB en total) y se precarga la del texto. Se fue Google Fonts con sus 7
  familias y el probador de tipografías de Configuración (solo quedaban sus bloques de CSS y el
  script del `<head>`).
- **Íconos:** 63 de Lucide (`lucide-static` 1.57.0, ISC) en un sprite propio
  (`frontend/img/iconos.svg`, 16 KB) y `icono()` en `core/iconos.js`. Están en el menú, los botones de
  crear, exportar, editar, filtrar y volver, en los cierres de modal, el chevron de Cuentas
  corrientes, los deltas del Resumen y los avisos. `ICONO_TACHO` y `ICONO_LAPIZ` de `formato.js` salen
  del sprite.
- **Menú** agrupado por circuito: Maestros, Ventas, Compras, Stock, Finanzas y Administración, con
  "Estadísticas" renombrado a "Resumen", que es el título que ya mostraba la vista. Los grupos que
  son solo de admin se ocultan enteros.
- **Interacción:** halo de foco en todos los campos, botones con estado apretado, modales y
  popovers con entrada animada y fondo desenfocado, avisos oscuros con ícono por tono, barra de
  selección oscura flotante, badges de estado con punto (no solo color), fila de tabla con hover
  y encabezado con fondo.
- **Login:** fondo de marca con dos luces, tarjeta translúcida, bajada y botón resaltador.
- **Celular:** drawer de 300 px con velo detrás. El logo ya no queda debajo de la hamburguesa y el
  botón de ocultar barra (que es de escritorio) no aparece.

**Cómo se verificó:** `playwright-core` en el scratchpad contra el Chrome instalado. Se usó un servidor
de prueba en el 3100 con base sembrada (`npm run seed`) y entrando por el formulario de login (entrar
por API no deja la marca de sesión de `sesion.js` y la captura queda en el login). Se sacaron capturas
de escritorio en claro y oscuro y de celular a 390 px, antes y después, sin errores de consola. También
se capturaron los modales (venta, producto, confirmación), el asistente, la barra de selección y el
drawer. `npm test` dio 46 ok y `npm run lint` pasó sin problemas en 37 archivos.

**Qué se aprendió:**
- Un `@@@ CUT` de dos líneas no entra en el aplicador de parches del scratchpad: las marcas tienen que
  ser de una línea.
- Un script Python grande dentro de un heredoc de bash falla en Windows por el largo de la línea de
  comando (`ENAMETOOLONG`): conviene escribirlo como archivo.
- La base real cambió de md5 durante la sesión porque el servidor del puerto 3000 quedó corriendo
  para que el usuario mirara la app, y el login escribe en `sesiones`. No es una migración.

### Qué sigue

Revisar a ojo las pantallas que no se capturaron (lista en `handoff.md`) y el gráfico del Resumen.
Después, la landing page cuando el equipo defina los planes, y la Fase 7 de la auditoría.

### Addendum al §62 — vuelve el negro de marca (14 de octubre)

El usuario aprobó el rediseño pero lo corrigió: "el concepto de la marca aclaraba que se tenía que
mantener el negro". El rediseño había cambiado la base oscura por azul noche (`#111733` en la sidebar,
`#0A0E1B` en el login y el tema oscuro, `#141A2E` en la tinta) y teñido los grises de azul. Ahora la
sidebar, el login, los avisos, la barra de selección, `--brand` y el fondo del tema oscuro vuelven a
`#000000`, la tinta vuelve a `#121212` y los grises son neutros. Las luces del login bajan de
intensidad para que el fondo se lea negro. La sidebar recupera su borde derecho, porque en tema oscuro
el fondo de la app también es negro. El azul birome y el resaltador quedan como acentos.

### Segundo addendum al §62 — sale el amarillo (14 de octubre)

Al usuario no le gustó la combinación de negro con amarillo ("buscar otra combinación más buena").
Queda blanco y negro de marca con un solo acento, el azul birome:
- la sección activa del menú usa `--accent-on-dark` (`#8FA3FF`, el azul aclarado para leerse sobre
  negro);
- el avatar del pie pasa a círculo blanco con ícono negro;
- el botón del login es blanco sobre negro, como el logo;
- la cifra que concluye (Resultado, Posición neta) cambia el trazo de resaltador por una doble raya
  azul debajo, como se subraya el total en un libro de cuentas;
- el ícono de "atención" de los avisos pasa a rojo, como "pendiente" (regla vieja: atención y
  pendiente comparten color);
- `--highlight` y `--highlight-ink` dejan de existir.

## 63. Segunda pasada de diseño: fichas, administración, gráfico y asistente, 14 de octubre de 2026

Pedido del usuario: "seguir", que retoma lo que había dejado anotado el §62: revisar a ojo las
pantallas que el rediseño no había capturado y el gráfico del Resumen. Cubre también el
pendiente chico #4 (pasada visual de Usuarios, Configuración, Auditoría, catálogos y registro).

**Cómo se miró.** `playwright-core` contra el Chrome instalado, con un servidor en el 3100 sobre
una base sembrada (`npm run seed`) más 14 días de ventas y tres gastos con fecha pasada. Se
capturaron las 9 fichas, Presupuestos, Facturas, Reportes de stock, Papelera, Auditoría,
Usuarios, Configuración, los 5 catálogos y el login con registro, en claro, en oscuro y a 390 px,
antes y después.

**Qué se encontró y se arregló:**
- **Escape no cerraba cuatro catálogos** (categorías de producto, listas, depósitos y categorías
  de gasto), y el foco no entraba al modal. El formulario arranca con
  `<input type="hidden" name="id">`, que `core/ui.js` tomaba como primer enfocable, y `focus()`
  sobre él no hace nada. `FOCUSABLES_MODAL` excluye ahora los `type="hidden"`.
- **Rojo donde no hay alarma.** Al salir el naranja (§62), `--accent-warn` quedó igual al rojo, y
  todo lo que usaba `status-pendiente` se leía como un problema: el presupuesto en borrador o
  enviado, el rol "Empleado", "Editó" y "Actualizó" en Auditoría, la factura "Suelta", la compra
  en borrador y los gastos de inversión o retiro. Todos esos pasan a gris (`.status` sin clase).
  `status-pendiente` queda para lo que pide atención, y ahora va **con contorno y sin relleno**:
  así "Parcial" no se confunde con "Pendiente" (lleno).
- **Cifras en cero con color** ("Devuelto $0,00" en rojo, "Aceptado $0,00" en verde, "Sin stock 0"
  en rojo). Un `MutationObserver` en `core/ui.js` marca `.ledger-cero` sobre las
  `.ledger-value` verdes o rojas cuando el texto es un cero, y el CSS las pasa a tinta. Es el
  mismo recurso que ya usaban los modales, para no tocar las ~25 escrituras de esas cifras.
- **Fichas:**
  - la tira de cifras estaba pegada al panel de datos en todas menos Cliente, que tenía una
    regla propia. Ahora rige `.panel + .ledger-strip` para todas y la de Cliente se borró;
  - los estados eran texto suelto y pasan a ser badges, como en los listados (cobro, pago,
    presupuesto, compra, devolución, stock);
  - el medio de pago de la factura salía crudo ("transferencia");
  - en el celular, los datos van de a dos por fila, las acciones en una grilla pareja y la
    última tarjeta de una tabla no lleva la línea de abajo.
- **`camposFicha()`, `html()` y `badge()`** (`core/formato.js`) reemplazan el `map` que repetían
  las 9 fichas. Todo valor se escapa salvo el que viene envuelto en `html()`, y `badge()` escapa
  su texto. La de Producto deja de escapar a mano en su arreglo. El test de escape no ve el `dd`
  intermedio, que es la excepción documentada.
- **Catálogos:** el botón de agregar quedaba pegado al encabezado de la tabla.
- **Gráfico del Resumen** (reescrito con las reglas de la skill `dataviz`):
  - se dibuja al ancho real del contenedor y lo redibuja un `ResizeObserver`. Con el `viewBox`
    fijo de 800, a 360 px el texto quedaba en unos 5 px;
  - barras en tinta (a favor) y en rojo (en contra), de hasta 24 px de ancho, con punta
    redondeada y base recta;
  - de 3 a 5 marcas redondas en el eje Y (pasos de 1, 2 o 5) y grilla de línea fina;
  - el período en curso va en contorno;
  - tooltip con ventas, ganancia bruta, gastos y resultado: con el mouse sigue la franja, con el
    dedo se queda hasta tocar afuera, y con el teclado el SVG es una sola parada de Tab y las
    flechas recorren los períodos;
  - la última fecha del eje se alinea al borde si no entra;
  - `moneyCorto` conserva un decimal en miles.
- **Asistente:** el ejemplo largo no entraba en el placeholder de una línea. Pasa a tres
  sugerencias en la bienvenida, que llenan el cuadro sin enviar, y el placeholder queda en
  "Contame qué pasó…". Las sugerencias van en castellano común y no en el formato de
  `interpretarStub`: son para el usuario real (Gemini), y el stub solo sirve para probar el flujo.

**Cómo se verificó:**
- capturas de antes y después, sin errores de consola;
- Escape cierra los 5 catálogos con el foco en el primer campo;
- tooltip con mouse, toque (y toque afuera) y flechas; el eje se mantiene en 12px a 390 px;
- XSS: `<img onerror>` en cliente, producto, SKU, categoría, email, notas y concepto de factura.
  Abiertas las fichas de cliente, venta, producto, factura y presupuesto, el payload se ve como
  texto y `window.__xss` sigue en 0. El control (el mismo payload insertado crudo) sí dispara;
- `npm test` dio 46 ok y `npm run lint` dio 37 archivos sin problemas.

**Encontrado y no tocado (no es de diseño):**
- `POST /api/ventas` sin `cliente` ni `cliente_id` da 500 en vez de 400: `resolverCliente`
  intenta enlazar `undefined`. Desde la UI no pasa, porque el formulario pide cliente, pero el
  POS (venta sin cliente) va a necesitar una decisión.
- **Un producto con variantes tiene `precio_costo` 0** (el costo vive en cada variante), así que
  su costo promedio y su valorizado salen en $0 en la ficha y en Reportes de stock, y el
  "Valorizado total" queda corto. Cómo se costea un producto con variantes es una regla de
  negocio: no se inventó.

**Qué se aprendió:**
- La base real cambia de md5 aunque nada de la sesión la toque, si el servidor del 3000 sigue
  abierto con una pestaña logueada: cada pedido autenticado extiende el vencimiento de la sesión
  (`UPDATE sesiones`, `server.js:154`). En el §62 se lo había atribuido solo al login.
- Una línea o un texto del SVG le ganan el mouse a la franja que tienen detrás: necesitan
  `pointer-events: none`.

### Qué sigue

Las dos cuestiones de arriba, con el equipo. En diseño quedan:
- en el celular, la tabla de evolución del Resumen es una tarjeta por período (15 con un rango
  diario) y alarga mucho la pantalla;
- las fechas se muestran en ISO (`2026-10-14`) en toda la app;
- las fichas repiten el título arriba y en el primer panel.

## 64. Auditoría general — Fase 7, primera parte (`schema.sql` con la forma final), 16 de octubre de 2026

Pedido del usuario: "seguir" → la Fase 7 de §57, empezando por la parte que no reescribe
tablas. La pasada de rebuilds (`organizacion_id NOT NULL`, SKU por empresa) queda propuesta y
espera el visto bueno del usuario.

**`schema.sql` con la forma final de cada tabla.** Hallazgo 2 de §60. Se sumaron al final
de cada `CREATE TABLE` las 11 columnas que hasta acá solo sumaba un `ALTER` de `db/index.js`,
en el mismo orden en que quedaban:
- `clientes.lista_precio_id` y `clientes.condicion_pago`;
- `proveedores.condicion_pago`;
- `facturas.venta_id` y `facturas.devolucion_id`;
- `ventas.deposito_id` y `ventas.lista_precio_id`;
- `presupuestos.lista_precio_id`;
- `deposito_id` en `compras`, `devoluciones` y `devoluciones_proveedor`.

(§60 hablaba de 13 columnas porque contaba también las FK.) Los `ALTER` siguen en
`db/index.js` para las bases existentes. Ningún guard de rebuild mira estas columnas: los de
`compras` y `movimientos_stock` miran el `CHECK`.

**Lo que queda en `db/index.js` a propósito:** 6 `CREATE INDEX` (`idx_facturas_venta_id`,
`idx_facturas_devolucion_id`, `idx_facturas_numeracion`, `idx_presupuestos_venta_id`,
`idx_movimientos_stock_producto_deposito`, `idx_auditoria_org_fecha`) y 4 vistas
(`stock_por_deposito`, `saldo_tesoreria`, `stock_variante_actual`,
`stock_variante_por_deposito`). Casi todos referencian columnas que una base vieja recibe por
`ALTER`. En `schema.sql`, que corre antes, esa base fallaría con "no such column", como ya
explicaban los comentarios de `stock_por_deposito`. `idx_presupuestos_venta_id` podría
moverse, pero no se tocó para no partir el criterio.

**`verificar-migracion`.**
- El aviso `!` pasó a ser un error. La definición de cada tabla en `schema.sql` (columnas,
  FK, `CHECK` y los `UNIQUE`/PK automáticos) tiene que ser igual a la de la base nueva
  migrada.
- Los `CREATE INDEX` y las vistas quedan afuera de ese control y los sigue cubriendo el
  control 4.
- Cada índice guarda ahora su `origen` (`c`, `u` o `pk`) para poder separarlos.

**CI.** `.github/workflows/ci.yml` suma `npm run verificar-migracion` después de `npm test`.
Sin `nexo.db` ni backups corre solo el caso de base nueva: probado en una copia mínima del
repo en el scratchpad, sin bases, con "1 de 1 casos OK".

**Verificación.**
- `verificar-migracion`: 24 de 24 OK, sin avisos. md5 de la base real sin cambios
  (`b10b3a94…`; ya no es `8dc00857…` porque cambió con el uso, y el handoff dejó de tomarlo
  como referencia fija).
- Controles negativos, todos revertidos con `cmp` contra la copia:
  - sin `clientes.lista_precio_id` en `schema.sql`: "✘ nueva … tabla clientes: difieren
    columnas, fks";
  - sin `'deposito'` en el `CHECK` de `entidad` de `auditoria` (lo agrega un rebuild): "✘
    nueva … tabla auditoria: difieren checks";
  - un `CHECK` cambiado sin rebuild (`'anulada'` fuera de `estado`): la base nueva pasa,
    porque coincide con `schema.sql`, y lo marca el control 4 en la real y los backups. En el
    CI ese caso no se ve: hace falta una base existente.
- Base nueva con el `schema.sql` de `HEAD` contra la base nueva con el de ahora: iguales los
  60 objetos, columna por columna y en el mismo orden.
- `npm run regresion`: 112 comparaciones, 0 distintas. `npm run lint` (37 archivos) y
  `npm test` (46 de 46) verdes.

**Correcciones al handoff.** Las tablas con `organizacion_id` nullable son 14 y no 15:
`auditoria` queda nullable a propósito (hist. §46). Sumada al handoff la regla de "una
columna nueva va en `schema.sql` y como `ALTER`".

### Qué sigue

Fase 7, segunda parte, con el visto bueno del usuario: una pasada de rebuilds para
`organizacion_id NOT NULL` en las 14 tablas y SKU único por empresa en `productos` (y una
decisión sobre `producto_variantes`, que no tiene columna de empresa). Después, F6 de la
Etapa B.

## 65. Auditoría general — Fase 7, segunda parte (`organizacion_id NOT NULL` y SKU por empresa), 16 de octubre de 2026

Pedido del usuario: "si" a la propuesta del cierre de §64: las dos cosas en una sola migración,
y para las variantes la columna propia que se había recomendado (la otra opción era controlar
el SKU solo en el backend).

**Qué cambia en el esquema.**
- `organizacion_id NOT NULL` en las 14 tablas que la tenían nullable: `productos`, `clientes`,
  `proveedores`, `ventas`, `compras`, `presupuestos`, `facturas`, `devoluciones`,
  `devoluciones_proveedor`, `gastos`, `movimientos_stock`, `transferencias`,
  `movimientos_tesoreria` y `asistente_mensajes`. `auditoria` queda nullable a propósito
  (hist. §46).
- **SKU único por empresa**, cada tabla por separado como antes. `productos.sku` y
  `producto_variantes.sku` pierden su `UNIQUE` global, y los reemplazan
  `idx_productos_org_sku` e `idx_producto_variantes_org_sku`.
- **`producto_variantes.organizacion_id`**, nueva y `NOT NULL`. Sale de su producto y la ata
  la FK compuesta `(producto_id, organizacion_id) → productos(id, organizacion_id)`. Esa FK
  necesita la clave única `idx_productos_id_org`.
  - Corrige la decisión vigente de que las variantes heredaban la empresa del producto. La
    columna está para que la unicidad la garantice la base; las consultas siguen filtrando
    por el JOIN.

**Rebuild genérico** (`db/index.js`, después del backfill compartido de `organizacion_id`).
- **Cuerpo:** no es una foto escrita a mano. Parte del `CREATE TABLE` que cada tabla tiene hoy
  en `sqlite_master` y le cambia solo tres cosas:
  - el `organizacion_id` nullable pasa a `NOT NULL`;
  - se saca `sku TEXT UNIQUE`;
  - en la variante, se suma la FK compuesta.
- **Controles del texto:** si el patrón no aparece exactamente una vez, el arranque se corta.
  Antes de escribirlo se miró el texto de las 15 tablas en la base real y en los 22 backups:
  el patrón aparece una vez en cada una.
- **Así no se pierde ninguna columna sumada por `ALTER`** (la trampa de §48).
- **Se preserva:**
  - los índices y triggers de cada tabla, recreados con su SQL original;
  - todas las vistas, que se tiran y se recrean en su orden de creación;
  - `sqlite_sequence`, que el `INSERT..SELECT` dejaba en el id más alto y creaba en 0 en las
    tablas vacías.
- **Una sola transacción:** con `foreign_keys` apagado y `PRAGMA foreign_key_check` de las
  tablas reconstruidas antes del `COMMIT`.
- **Idempotente:** en una base nueva, o ya migrada, ninguna tabla cambia y no corre.

**La trampa de la FK compuesta.**
- **El problema:** en una base anterior a las variantes, `schema.sql` crea
  `producto_variantes` de cero, ya con la FK compuesta. Pasa antes de que `productos` tenga
  `organizacion_id` y antes de que exista `idx_productos_id_org`.
- **Por qué rompe:** sin esa clave, SQLite rechaza con "foreign key mismatch" todo `UPDATE`
  de `productos.organizacion_id`, aun el que no toca filas, porque falla al preparar. Se
  confirmó con una prueba aislada antes de escribir el código.
- **Solución:** `idx_productos_id_org` se crea pegado al `ALTER` que suma esa columna.
- **En el verificador:** una base armada solo con `schema.sql` tampoco pasa
  `foreign_key_check`, así que `verificar-migracion` lee su esquema sin la huella completa.

**Código.** El único `INSERT` que no cargaba empresa era el alta de variante
(`POST /api/productos/:id/variantes`), que ahora la carga. El resto de los `INSERT` en las 14
tablas ya la cargaba, y `node:sqlite` rechaza enlazar `undefined`. El aviso de SKU repetido
se detecta por "UNIQUE constraint failed", así que no cambió. Comentarios de `schema.sql` y
`db/index.js` que decían "nullable a propósito" corregidos.

**Verificación.**
- `verificar-migracion`: 24 de 24 OK, md5 de la base real sin cambios (`b10b3a94…`).
- **Copia de la base real migrada:**
  - mismas filas y misma suma de ids en las 15 tablas;
  - `sqlite_sequence` idéntica;
  - `NOT NULL` en las 15;
  - sin `UNIQUE` global de SKU, con los tres índices nuevos;
  - FK compuesta presente y `foreign_key_check` sin filas;
  - 7 vistas;
  - ninguna variante con una empresa distinta de la de su producto.
- **En la base:** una variante con otra empresa da "FOREIGN KEY constraint failed"; una
  variante o un cliente sin empresa, "NOT NULL constraint failed".
- **`api.test.js`, caso nuevo:**
  - la empresa B puede usar el SKU de producto y de variante de A;
  - un SKU repetido dentro de B da 400 "…SKU".
  - Usa productos propios: al primer intento les agregaba variantes a los de las otras
    pruebas, que después ya no se podían vender sin elegir una.
  - Control negativo: corrido contra `HEAD` en un `git worktree` (junction de `node_modules`
    borrada antes que el worktree), falla con "Ya existe un producto con ese SKU.".
- `npm run regresion`: 112 comparaciones, 0 distintas. La base la siembra el código de `HEAD`
  y la migra el nuevo al arrancar.
- `npm test` 47 de 47 y `npm run lint` (37 archivos) verdes.

**La base real no se tocó:** la migra el próximo `npm start`, con el respaldo automático
antes.

### Qué sigue

La auditoría general (§57) queda cerrada. Lo próximo es F6 de la Etapa B, o pushear `solla` y
abrir el PR a `main`, que es también la primera corrida del CI. De la Etapa A queda solo lo
que requiere decisión del equipo (registro público configurable y su verificación).

## 66. Plan hasta la presentación y arreglos chicos pendientes, 16 de octubre de 2026

Pedido del usuario: tomar las decisiones por mi cuenta ("vos sabés más y vos podés averiguar
más"). Quiere que la app ande bien y sea razonablemente escalable, y la presenta en un mes y
medio, alrededor del 1 de diciembre: hace falta un MVP muy bueno, sin trabajos de meses y
cerrando las etapas en distintas sesiones. El PR queda a criterio.

**Git.** `solla` pusheada (29 commits, hasta `2392125`). `gh` no está instalado, así que el
PR a `main` se abre desde el link de comparación de GitHub (ver handoff.md).

**Plan.** Ver "Plan hasta la presentación" en handoff.md. Las decisiones de cada etapa (venta
sin cliente → "Consumidor final", turno de caja con arqueo, letra automática del comprobante,
voz con la Web Speech API) quedaron escritas ahí. Lo que depende de trámites o apps de
terceros (ARCA real, Mercado Libre, Tienda Nube) queda para después de la presentación.

**Arreglos.**
- **Errores 500 que eran de validación** (pendientes 8 y 9 de §58 y §63):
  - `POST /api/facturas` valida concepto, importe (número > 0), medio de pago, tipo, letra
    y punto de venta.
  - `resolverCliente` lanza `ErrorValidacion` sin nombre ni id, o con un `cliente_id` de
    otra empresa. Ese id responde igual que uno inexistente y no filtra su nombre.
  - `ErrorValidacion` es una clase nueva: su mensaje llega como 400 por `mensajeDeError` y
    por el manejador final, aunque se lance adentro de una transacción. El resto de los
    errores sigue saliendo como 500 genérico.
  - El nombre del cliente se recorta antes de buscarlo o crearlo.
- **Valorizado de productos con variantes** (pendiente 10). Lo decidí yo:
  - valorizado = stock sin variante × costo del producto + Σ stock de cada variante × su
    costo;
  - el costo que se muestra de un producto con variantes es el promedio ponderado
    (valorizado / stock);
  - aplica a `GET /api/productos`, `GET /api/stock` y `GET /api/reportes/stock`;
  - los dos campos auxiliares de la consulta se sacan de la respuesta: el filtro de campos
    sensibles corta por nombre de clave (CLAUDE.md §35) y no los conoce.
- **Precios por empresa** (pendiente 7): `obtenerPreciosPorProducto(organizacionId)` y
  `obtenerPreciosPorVariante(productoId)` ya no leen todas las filas de la base.
- **Catálogos solo admin** (pendiente 5). Lo decidí yo:
  - crear y editar listas de precios, depósitos y categorías de gasto pasa a ser `soloAdmin`
    (`permisos.js` y `server.js`), igual que las categorías de producto;
  - los `GET` siguen abiertos a los dos roles;
  - en la UI, los cuatro botones de gestión llevan `col-admin`. El de categorías de producto
    ya le daba 403 al empleado.
  - El seed creaba la categoría de gasto con el empleado; ahora la crea el admin.
- **Fechas en dd/mm/aaaa** (pendiente de diseño de §63):
  - `fechaAR()` en `core/formato.js`, aplicada en 35 lugares: tablas, fichas, historial de
    pagos y el comprobante impreso;
  - la API, los `<input type="date">` y los CSV siguen en ISO.

**Verificación.**
- `npm test`: 49 de 49, con tres casos nuevos (factura con datos inválidos, venta sin
  cliente o con cliente ajeno, más el de SKU de §65). `npm run lint` verde.
- `npm run regresion`: 3 diferencias, todas del arreglo del valorizado y solo para el admin.
  La "Gorra" del seed pasa de costo $0, valorizado $0 y margen 100% a $1.546,39, $10.824,74
  (7 unidades) y 55,8%, y el total del inventario sube en esa cifra.
- **Navegador** (playwright-core con el Chrome instalado, base sembrada, los dos roles, 8
  vistas):
  - todas las fechas visibles en dd/mm/aaaa, ninguna en ISO;
  - los cuatro botones de catálogos visibles para el admin y ocultos para el empleado;
  - ningún error de consola ni de página.

### Qué sigue

Etapa D del plan: punto de venta y turno de caja.

## 67. Etapa D, primera parte: turno de caja y venta de mostrador (backend), 16 de octubre de 2026

Primera etapa del plan de §66, decidida sin consulta como pidió el usuario. Commit `e8400bb`.

**Esquema.**
- **Tabla nueva `turnos_caja`** (ver el comentario en `schema.sql`):
  - una cuenta de tesorería de tipo efectivo entre una apertura y un cierre;
  - en cada punta, el saldo del sistema (`esperado_*`) y lo contado (`contado_*`);
  - quién abrió y quién cerró;
  - la ventana de movimientos `desde_movimiento_id` / `hasta_movimiento_id`.
- `idx_turnos_caja_abierto`, único parcial: un turno abierto por caja. La tabla nace con
  `schema.sql` en cualquier base, así que el índice puede vivir ahí.
- `ventas.turno_caja_id`, nullable: en `schema.sql` y por `ALTER` en `db/index.js`, después
  del rebuild de §65. Lleva un índice parcial para el resumen.

**Por qué la ventana es por id.** `movimientos_tesoreria.fecha` es solo la fecha
(`date('now')`), sin hora, así que no alcanza para saber qué entró durante el turno. Los id
crecen siempre (AUTOINCREMENT), así que "id mayor que el último al abrir" es exacto. Una
anulación posterior genera un movimiento nuevo, que también cae en la ventana.

**Arqueo.**
- Al abrir y al cerrar, si lo contado difiere del saldo, se inserta un movimiento `manual`
  por la diferencia ("Diferencia de arqueo al abrir/cerrar la caja (turno #N)").
- Así el saldo de la caja siempre es lo último que se contó.
- El ajuste de apertura queda antes de la ventana y el de cierre después, así que ninguno
  cuenta como movimiento del turno.
- Se descartó un origen nuevo `arqueo`: obligaba a reconstruir `movimientos_tesoreria` por su
  `CHECK`.

**Rutas** (todas para los dos roles; el efectivo no es un dato sensible):
- `GET /api/turnos-caja` (filtro `?estado=`) y `GET /api/turnos-caja/:id`. Devuelven el
  resumen:
  - ventas del turno (cantidad y total);
  - cobros por cuenta;
  - cobros, otros ingresos y egresos de la caja;
  - esperado: el saldo en vivo si el turno está abierto, el del cierre si no;
  - diferencias de apertura y de cierre.
- `POST /api/turnos-caja` y `POST /api/turnos-caja/:id/cerrar`.
- `GET /api/pos/catalogo`:
  - un ítem por producto sin variantes y uno por variante activa ("Gorra — Talle: M"), con
    su SKU;
  - precio de la lista predeterminada, con la misma cadena que la pantalla de ventas;
  - stock del depósito predeterminado.
- `POST /api/pos/ventas`: `crearVenta`, `turno_caja_id` y un `registrarCobro` por medio, en
  una transacción, con auditoría de la venta y de cada cobro.
  - Sin `cliente_id` va a "Consumidor final".
  - Los cobros no pueden superar el total.
  - Si suman menos, hace falta un cliente real y el resto queda en su cuenta corriente.
- Abrir y cerrar se auditan como `cambiar_estado` de la `cuenta_tesoreria`, con
  `operacion_tipo 'turno_caja'`. `auditoria.operacion_tipo` es texto libre, así que no hizo
  falta reconstruir `auditoria` para sumar una entidad.

**Seed y regresión.**
- El seed suma un turno abierto con el saldo justo, una venta de mostrador de $9.000 ($5.000
  en efectivo y $4.000 en banco) y el cierre con arqueo justo.
- `regresion-head.mjs` siembra ahora con el `seed.mjs` de la ref (import dinámico desde el
  worktree), no con el del árbol. Con el del árbol, el paso "abrir la caja" fallaba con 404
  contra el servidor de `HEAD`. Consecuencia: un paso nuevo del seed recién se compara en el
  commit siguiente.

**Verificación.**
- `api.test.js`, caso nuevo de punta a punta:
  - sin turno no se vende, y en una cuenta de banco no se abre caja;
  - una apertura con $100 de más deja registrada la diferencia;
  - un solo turno abierto por caja;
  - el catálogo no trae productos de otra empresa;
  - cobro mixto con "Consumidor final";
  - cobros de más → 400; de menos sin cliente → 400; de menos con cliente → 201;
  - el resumen da 2 ventas por $200, $90 en efectivo y esperado $190;
  - la empresa B no ve el turno (404), no vende con él, no abre caja en una cuenta de A y
    no lo cierra;
  - el cierre con $10 de menos da diferencia −10, ni el turno cerrado ni un segundo cierre
    se aceptan, y el turno siguiente abre esperando lo contado.
- `npm test` 50 de 50, `npm run lint` verde y `verificar-migracion` 24 de 24 (base real sin
  cambios).
- `npm run regresion`: las 4 diferencias son las rutas nuevas (404 en `HEAD`).

### Qué sigue

La pantalla del punto de venta, segunda parte de la Etapa D (ver el plan en handoff.md):
- módulo `frontend/js/dominios/pos.js`, mobile-first;
- apertura y cierre de caja con arqueo;
- búsqueda por nombre, SKU o lector de código de barras;
- carrito, cobro mixto con vuelto y cliente opcional;
- recorrido en el navegador con los dos roles y a 390 px.

## 68. Etapa D, segunda parte: la pantalla del punto de venta, 19 de octubre de 2026

Cierra la Etapa D del plan de §66. La pantalla está sobre las rutas de §67, sin circuito de
datos nuevo.

**Archivos.**
- `frontend/js/dominios/pos.js` (nuevo): todo el dominio. Se registra con
  `alEntrarEnVista("pos", ...)` y `app.js` lo importa por efecto.
- `index.html`:
  - ítem "Punto de venta", el primero del grupo Ventas;
  - la vista `pos`;
  - los modales `modalPosCobro`, `modalPosCierre` y `modalPosCamara`, en el HTML estático
    porque `core/ui.js` solo engancha foco y Escape a los `.modal` que existen al cargar.
- `styles.css`: bloque "Punto de venta" y sus reglas dentro del responsive.
- `core/formato.js`: `fechaHoraAR()`. `abierto_en`/`cerrado_en` vienen de
  `datetime('now')`, en UTC y sin zona, y se muestran en hora local.
- `core/router.js`: `pos` en `VISTAS_CONSTRUIDAS`. No es solo de admin.
- `app.js`: registra `cargar:ventas`, `cargar:stock`, `cargar:productos`, `cargar:clientes` y
  `cargar:reporteStock`. El POS los recarga después de cada venta, sin `await`, así no frena
  la venta siguiente.
- `img/iconos.svg`: `scan-barcode` y `minus` (lucide-static 1.57.0). `minus` se escribió a
  mano porque unpkg no respondió: es un solo trazo, `M5 12h14`.

**Cómo funciona.**
- **Al entrar** pide juntos el turno abierto, `/api/tesoreria`, el catálogo y los clientes.
  - Las cajas son las cuentas de tipo efectivo.
  - La caja elegida se recuerda por dispositivo (`localStorage nexo.pos.caja`). Si no hay,
    se toma la que tiene turno abierto o la primera.
  - Con más de una caja aparece un selector.
- **Sin turno:** "Abrir caja" con el saldo del sistema, el contado obligatorio y un botón
  "Coincide con el sistema". Debajo, los últimos 10 cierres con su diferencia (verde si cuadra,
  rojo si falta, tinta si sobra).
- **Con turno:**
  - Arriba, la tira negra del turno: caja, desde cuándo, quién, ventas, vendido, efectivo
    esperado y "Cerrar caja".
  - **Búsqueda:** cada palabra tiene que ser el comienzo de una palabra del nombre, la
    categoría o el SKU, sin acentos y en cualquier orden. Al principio se buscaba "contiene",
    pero "gorra m" encontraba las dos gorras porque la "m" aparece adentro de "Indumentaria".
  - **Enter** agrega el SKU exacto, o el único resultado vendible si hay uno solo. Es lo que
    manda el lector físico. Si el foco quedó en un botón, lo que se tipea va a la búsqueda.
  - **Atajos:** F2 enfoca la búsqueda y F9 cobra. El foco automático es solo con mouse
    (`pointer: fine`): en el celular abriría el teclado.
  - **Cámara:** solo donde existe `BarcodeDetector` (Chrome en Android; no en Windows). Lee
    cada 250 ms, la lectura entra por el mismo camino que Enter, y la cámara se apaga al
    cerrarse el modal de cualquier forma (observer de `hidden`).
  - **Ticket:** cantidad con −/+ y tope en el stock del depósito predeterminado. El precio
    sale del catálogo y no se edita. El carrito se guarda en `sessionStorage` por turno, con
    solo claves y cantidades: un F5 no pierde la venta.
  - **Celular:** una columna y una barra negra fija con unidades, total y "Cobrar". La barra
    termina antes del lanzador del asistente, y los avisos suben por encima de ella (`:has`).
- **Cobro:**
  - Arranca con una fila de efectivo por el total y el texto seleccionado: tipear "20000" es
    "paga con".
  - Los chips de cada medio suman una fila por lo que falta. Si no falta nada y hay un solo
    medio, lo reemplazan ("todo con Mercado Pago").
  - El efectivo es siempre la caja del turno, porque un cobro en efectivo a otra cuenta no
    entraría en el arqueo.
  - **El vuelto sale solo del efectivo.** Si el excedente supera lo pagado en efectivo, no se
    puede confirmar. Antes de mandar, el vuelto se descuenta del efectivo (el backend rechaza
    cobros mayores al total) y se juntan las filas de una misma cuenta.
  - Si falta plata, hace falta un cliente, y el aviso dice cuánto queda en su cuenta corriente.
  - El cliente se elige por nombre exacto. "Consumidor final" no se ofrece en la lista. El POS
    no crea clientes.
  - Al confirmar, el mismo modal muestra "Venta #N registrada" y el vuelto en grande, con
    "Nueva venta" enfocado.
- **Cierre:**
  - Muestra el resumen en vivo: apertura, ventas, cobros en efectivo, otros ingresos,
    egresos, lo vendido por medio (más lo que quedó a cuenta) y "Tendría que haber en la
    caja".
  - La diferencia se calcula en vivo mientras se tipea lo contado.
  - Con una venta en curso, pide confirmar antes de descartarla.

**Backend.** `POST /api/pos/ventas` dejaba fiar al "Consumidor final" si llegaba su
`cliente_id` (solo controlaba que faltara el id). Ahora también responde 400 en ese caso,
con aserción nueva en el caso de POS de `api.test.js`.

**Verificación.**
- `npm test` 50 de 50 y `npm run lint` verde.
- `npm run regresion`: 122 comparaciones, 0 distintas.
- md5 de la base real sin cambios (`b10b3a94…`).
- **Navegador:** playwright-core contra el Chrome instalado, base del seed más un producto,
  una categoría y un cliente con `<img onerror>` en el nombre. 51 controles, todos ok:
  - admin en escritorio claro: apertura con $100 de más, búsqueda sin acentos, variante, SKU
    con Enter, tope de stock, lector con el foco en un botón, recarga con el carrito guardado,
    F9, cobro mixto con vuelto (el backend recibió $10.000 en efectivo y $9.500 en Mercado
    Pago), bloqueo sin cliente, fiado a Juan Pérez, cliente inexistente y cierre con $10 de
    menos (el saldo quedó en lo contado);
  - empleado en celular oscuro: el circuito completo, la barra sin tapar el asistente y
    "todo con Mercado Pago";
  - cámara con `BarcodeDetector` simulado y `--use-fake-device-for-media-stream`;
  - escritorio oscuro;
  - `window.__xss` sin definir en todos los casos.
- Capturas revisadas en claro, en oscuro y a 390 px. Por ellas se cambió:
  - la tabla de cierres pasó a "Turno" (rango horario y quién) y "Vendido" (con la cantidad
    de ventas), porque en escritorio la diferencia quedaba cortada;
  - se sacaron las flechitas de los importes del cobro;
  - en el celular, "Vaciar" quedó al lado de "Venta".

### Qué sigue

B2, la PWA (plan de handoff.md).

## 69. Rediseño visual, primera parte, 19 de octubre de 2026

Pedido del usuario: "me sigue sin convencer", "no me gusta la tipografía, sobre todo de los
números, hay cosas que parecen muy IA" y "sacar el subrayado en azul de números". Dijo que lo
que más le suena a IA son las cifras grandes, las tiras y tarjetas negras y los textos
explicativos. Como referencia mostró los dashboards y logins de topmate.io/code_xr: tarjetas
de indicadores con ícono, cifra en una sans neutra y variación en pastilla, y login en
tarjeta con campos con ícono. En el mismo pedido adelantó el plazo: producto casi terminado
en dos semanas (plan nuevo en handoff.md).

**Qué cambió.**
- **Tipografía:** una sola familia, Geist (Fontsource 5.3, OFL, variable,
  `frontend/fonts/geist.woff2`), para títulos, texto y cifras. Se borraron Bricolage
  Grotesque e Instrument Sans. Los nombres `--font-display`/`--font-body`/`--font-mono` se
  conservan porque los usan decenas de reglas. Las cifras grandes van en peso 600–650.
- **Sin doble raya azul:** el Resultado, el total del POS y el vuelto se destacan por tamaño
  y peso.
- **Tiras de cifras → tarjetas de indicadores**, en todas las vistas que usan
  `.ledger-strip`:
  - una grilla `auto-fit`, donde cada `.ledger-item` es una tarjeta y `.ledger-divider` ya
    no se dibuja;
  - en el celular van de a dos, y la que queda sola o la del total ocupan el renglón
    (`:nth-child(odd of .ledger-item)`);
  - el Resumen suma un ícono por tarjeta (`.ledger-icono`, gris, sin color nuevo);
  - la variación es una pastilla verde o roja con el porcentaje, el importe en el tooltip y
    "vs. período anterior" (`formatearDelta` en `app.js`).
- **Sin bloques negros en el tema claro:** la tira del turno, el visor del cobro y la barra
  del celular del POS pasaron a superficies. "Caja abierta" va en verde.
- **Login:**
  - tarjeta blanca sobre el negro de marca (el fondo sigue siendo #000, sin el brillo azul);
  - logo negro y botón azul;
  - campos con ícono y botón para ver la contraseña (`.campo-icono`, `.campo-ver-clave`,
    manejado en `sesion.js`).
- **Textos explicativos:** de 49 notas `.form-note` quedan 36. Se sacaron las que contaban
  el funcionamiento interno (dos decían "Nexo todavía no maneja vencimientos pactados", que
  ya no es cierto) y se acortaron las demás. El rango del Resumen es una línea simple
  (`.nota-plana`) con fechas dd/mm/aaaa.

**Verificación.** `npm test` 50 de 50 y `npm run lint` verde. Capturas del login, el
Resumen, Ventas y el POS en claro, en oscuro y a 390 px, sin errores de página.

### Qué sigue

Segunda parte del rediseño:
- que el usuario lo vea y diga qué sigue sin convencerle;
- la tabla de evolución en el celular;
- el título repetido de las fichas;
- revisar el resto de las vistas con la misma vara (listas con etiquetas de estado como en
  la referencia).

Después, B2 (PWA).

## 70. Tipos de negocio, unidades de medida y servicios, 19 de octubre de 2026

Pedido del usuario: "agregar tipos de negocio dónde se pueda elegir el tipo de negocio (para
carnicería, verdulería, gym o uno que sea con sistema de socios y cuotas)". También pidió que
Mercado Libre y Tienda Nube vayan al final del plan. Sobre los tipos, aclaró que indumentaria y
ferretería son comercio general, y que el Nexo base tiene que manejar variantes y medir
productos "no solo por unidades". Decidió las reglas del gimnasio (ver el plan en handoff.md).
Esta sesión cubre la primera parte; socios y cuotas es la siguiente.

**Esquema.** Aditivo, por ALTER con default y sin rebuild. Va en `schema.sql` y en
`db/index.js`, después del último ALTER:
- `productos.unidad TEXT NOT NULL DEFAULT 'unidad'`;
- `productos.tipo TEXT NOT NULL DEFAULT 'producto'`;
- `organizaciones.rubro TEXT` y `organizaciones.modulos TEXT`, nullable.

Sin `CHECK`: los valores los validan `UNIDADES`, `TIPOS_PRODUCTO` y `PERFILES_RUBRO` en
`server.js`, para no reconstruir tablas al sumar uno. Los productos que ya existían quedan por
unidad y con stock; las empresas, como comercio general.

**Backend (`server.js`).**
- `PERFILES_RUBRO` y `perfilDeEmpresa()`.
  - `GET /api/negocio` devuelve `rubro`, `modulos`, `unidad_defecto`, `tipo_defecto` y
    `perfiles`.
  - `PUT /api/negocio` acepta `rubro` y `modulos`, validados. Cambiar el tipo sin mandar
    módulos vuelve a los del preset.
  - `POST /api/auth/registro` acepta `rubro`.
- **Productos:** POST, PATCH y el lote aceptan `unidad`, y POST y PATCH también `tipo`. Sin
  esos datos, un producto nuevo toma los del tipo de negocio.
- **Servicios:**
  - `esServicio()`: `registrarMovimientoStock` no escribe nada para un servicio. Es el único
    punto que escribe stock, así que cubre venta, edición, anulación y devolución.
  - Las validaciones de stock y los cinco chequeos de "no queda negativo" lo saltean.
  - Ajuste, transferencia y compra lo rechazan con 400.
  - `/api/stock` y `/api/reportes/stock` excluyen los servicios, y `estado_stock` es null.
  - Un producto con stock no pasa a servicio.
- `GET /api/pos/catalogo` suma `unidad` y `tipo`, con `stock: null` para un servicio.

**Frontend.**
- `core/formato.js`: `UNIDADES`, `esFraccionable()` y `cantidad(n, unidad)`.
- `core/negocio.js`: `fijarNegocio()` pone `<html data-modulos>`; `moduloActivo()`.
- **Menú:** `data-modulo` en los ítems de punto de venta y presupuestos y en las secciones
  Compras y Stock. El CSS las oculta si el módulo no está en `data-modulos`, y el router
  (`MODULO_DE_VISTA`) manda a Ventas una vista de un módulo apagado.
- **Producto:** "Se vende por" y "Tipo" en el modal. El stock mínimo y máximo se ocultan para
  un servicio. La tabla, la ficha y Stock muestran la cantidad con su unidad.
- **Renglones de venta y compra:** el `step` sigue la unidad, y un servicio no tiene tope de
  stock.
- **Punto de venta:**
  - un producto que no va por unidad abre "Cantidad", donde se carga el peso o el importe y
    se calcula el otro;
  - el − y el + mueven 0,1 en kg, l y m, y 100 en g y ml;
  - un servicio dice "Servicio" y no tiene tope;
  - la barra cuenta productos, no unidades.
- **Registro y Configuración:** el select "Tipo de negocio" y, en Configuración, las
  casillas de módulos.

**Verificación.**
- `npm test` 51 de 51, con un caso nuevo en `api.test.js`:
  - venta de 1,25 kg;
  - un servicio que se vende y se anula sin mover stock;
  - un servicio en un ajuste o una compra da 400;
  - pasar a servicio con stock da 400;
  - el tipo de negocio y los módulos, con su validación y el 403 para el empleado.
- `npm run lint` verde y `verificar-migracion` 24 de 24 (base real sin cambios).
- `npm run regresion`: 8 diferencias, todas por los campos nuevos (`unidad`, `tipo`, `rubro`,
  `modulos`, `unidad_defecto`, `tipo_defecto`, `perfiles`) en productos, stock, catálogo del
  POS y negocio. Ningún dato existente cambia.
- **Navegador:**
  - el recorrido del POS de §68 sigue todo ok;
  - uno nuevo, todo ok:
    - una carnicería registrada desde la API, con el POS por kg ($4.000 = 0,5 kg y el + suma
      100 g) y el stock en el backend 9,4 kg;
    - un producto nuevo nace por kg;
    - en Configuración, pasar a kiosco y apagar Compras la saca del menú y bloquea la vista;
    - en un gimnasio, un producto nuevo es servicio y no tiene tope en el POS;
    - el registro pide el tipo.

### Qué sigue

Socios, cuotas e ingreso (plan en handoff.md).

## 71. Cierre de la sesión del 19 de octubre: visión de tipos de negocio y referencia de diseño

No hubo código: el usuario pidió documentar todo para seguir en otra sesión ("esta ya se hizo
muy larga"). Lo que definió, en sus palabras:

- **Tipos de negocio:**
  - "Cuando vos creás una cuenta, te pregunte qué tipo de negocio tenés y a partir de eso
    puedas gestionar el tuyo."
  - "Una cuenta podría tener más de un negocio sin problema."
  - "Un gimnasio que maneja socios también puede vender productos y tener una parte
    comercial... todos los gimnasios que conozco venden productos. Compran y venden."
  - Para la presentación: algunos tipos terminados y otros que aparezcan con "Próximamente".
    Barbería, con calendario y mensajes a clientes, y restaurante, con comandas y mesas
    ("muy, muy complejo"), quedan para próximamente.
  - "Vi que se hicieron bastantes. Pero bastante complejo. Así que mejoraría eso." Se tomó como
    simplificar la elección (tarjetas en vez de select y casillas).
- **Diseño:**
  - Referencias: https://dub.co/ y la ficha de Refero
    https://styles.refero.design/style/b0d80806-b724-4ed1-a1d1-074edd3c9bc9.
  - Lo que busca: "un estilo moderno, simple, que tenga colores, que tenga una tipografía
    simple, y que se pueda aplicar a cualquier cosa. Obviamente en su modo oscuro, adaptado a
    Nexo".
  - Quiere que se mire la app de Dub (las fotos y la demo), no solo la página web.
  - Mientras se documentaba agregó: "Acordate que ese estilo hay que adaptarlo a Nexo. No tiene
    que ser blanco." De Dub se toma la estructura, no el lienzo blanco: la base es el negro de
    marca, y la versión principal es la oscura.

**Lo que se dejó escrito:**
- `handoff.md`: el plan con tres etapas nuevas (rediseño segunda parte, tipos de negocio
  segunda parte, varios negocios por cuenta). El resumen de la ficha de Refero quedó en el
  punto del rediseño.
- CLAUDE.md §28 (multi-negocio decidido) y §29 (gimnasio = comercio + socios; tipos
  complejos "Próximamente").
- La ficha de Refero se leyó con WebFetch. De dub.co solo se pudo leer el texto (sin CSS ni
  capturas): las capturas se sacan con playwright en la próxima sesión.

## 72. Rediseño visual, segunda parte: estructura de Dub sobre el negro de Nexo, 19 de octubre de 2026

Pedido del usuario (hist. §71): "un estilo moderno, simple, que tenga colores, que tenga una
tipografía simple, y que se pueda aplicar a cualquier cosa. Obviamente en su modo oscuro,
adaptado a Nexo", y "no tiene que ser blanco". La referencia es Dub. Se sacaron capturas de
dub.co, de su página de analytics y de una página pública de estadísticas de la app
(`app.dub.co/share/...`). Se tomó la estructura y no el lienzo blanco.

**Qué cambió (`frontend/css/styles.css`, salvo donde se indica).**
- **Tokens nuevos**, con el oscuro como base (`:root`) y el claro en `[data-tema="claro"]`:
  - se borraron los dos bloques `@media (prefers-color-scheme: dark)`;
  - `--frame`, `--sheet-line`, `--primario-*`, `--info`, `--violeta` y `--naranja` (cada
    uno con su `-bg`), `--r-xs` y `--control-h`;
  - `--shadow-sm` se borró con sus seis usos.
- **Oscuro de partida.** Sin elección guardada la app es oscura: `temaActual()` en `app.js`
  cae en `"oscuro"` y el ícono por defecto es la luna. El script del `<head>` no cambió: solo
  pone `data-tema` si hay algo guardado.
- **Marco de marca:**
  - `html`, `body` y `.app` pintan `--frame`;
  - `.main` es la hoja, con margen `--marco`, borde `--sheet-line` y radio 16;
  - el ancho de lectura (1200 px) pasó de `.main` a `.main > .topbar` y `.main > .view`;
  - con la sidebar colapsada, la hoja suma el margen izquierdo;
  - en el celular, sin marco.
- **Menú:** ítems de 34 px y sección activa con tinte azul. Sin la raya `::before` y sin
  negrita.
- **Botones:** primario en tinta (blanco en oscuro, negro en claro), 36 px, peso 500.
- **Inputs y buscador:** 36 px y radio 6.
- **Filtros:** el botón de filtro es un contorno de 8 px (ya no una pastilla punteada) y los
  chips tienen radio 8.
- **Paneles y tablas:** paneles sin sombra con 20 px de padding, y celdas más bajas (11 px).
  El `h2` de panel pasó a Inter 600.
- **Tarjetas de indicadores:** cifras en Inter y mínimo de 180 px, así las cinco del Resumen
  entran en un renglón. Íconos del Resumen con color por métrica (`.ledger-icono-*` en
  `index.html`).
- **Pastillas:** peso 500. Tres clases nuevas, `status-info`, `status-ia` y `status-aviso`.
  En `app.js`:
  - "Stock alto" pasó del contorno rojo al naranja (no es urgente);
  - presupuesto "Enviado" y "Predeterminada/o" de los catálogos, a azul;
  - el actor "Asistente IA" de Auditoría, a violeta.
- **Tipografía:** Inter reemplaza a Geist (se borraron `geist.woff2` y `OFL-geist.txt`), y
  Satoshi queda solo para los títulos.
  - De los 21 usos de `--font-display`, quedan seis: marca, h1, título del POS, login y los
    dos del membrete.
  - Los demás (cifras, títulos de modal, tooltip del gráfico) pasaron a `--font-body`.
- **Satoshi y su licencia.** La licencia de Fontshare (ITF FFL v2.0) permite alojar la fuente
  en el servidor propio, pero prohíbe redistribuirla y subsetearla, y el repo
  `Code7C26/Nexo` es público.
  - Por eso los woff2 no se versionan. Los baja `scripts/fuentes.mjs` (`npm run fuentes`),
    que lee el CSS de la API de Fontshare y guarda los archivos oficiales tal cual.
  - `backend/package.json` lo corre en `prestart`/`predev` con `--si-falta`: sin conexión
    solo avisa y sale con 0.
  - Si la fuente falta, los títulos caen a Inter. Se probó sacando los archivos.
- **Login:** la tarjeta sigue al tema (oscura con borde en el oscuro, blanca en el claro) y
  se borraron los colores fijos del tema claro. El logo negro se invierte en el oscuro.
- **Avisos:** fondo `--pill-bg` (antes negro, que no se despegaba de la hoja oscura) y los
  colores nuevos.
- **Contraste:** `--ink-faint` subió a `#808080` en oscuro y `#767676` en claro, para que
  sus dos usos de texto (`.ledger-delta-ref`, `.pos-item-meta`) pasen AA.
  - El resto ya pasaba: textos y pastillas, entre 4,5 y 11.
  - Lo midió un script en el scratchpad, con los fondos rgba compuestos sobre la
    superficie.
- **Pendientes viejos, cerrados:**
  - **Título repetido de las fichas:** en las nueve fichas, el `h2` del primer panel decía
    lo mismo que la topbar. Se oculta por CSS
    (`[data-view$="-detalle"] > section.panel:first-of-type > .panel-head > h2`), sin tocar
    el router ni el JS que lo completa.
  - **Evolución del Resumen en el celular:** con `.tabla-compacta` deja de ser una tarjeta
    por período. Queda como tabla con scroll horizontal y el período fijo a la izquierda.
- **Arreglo de paso:** "Última compra" (fichas de cliente y proveedor, y reportes) salía
  `AAAA-MM-DD`; ahora pasa por `fechaAR`.

**Verificación.**
- `npm test` 51 de 51 y `npm run lint` verde.
  - El test de escape marcó un `esc()` sobre una constante en mayúsculas dentro de un
    template anidado. Se sacó: las constantes del código no se escapan, y el test de mutación
    lo exige.
- Capturas de las 19 vistas, cuatro fichas y el modal de venta, en oscuro, claro y 390 px.
  También el POS en uso (mostrador y cobro), el filtro abierto, el asistente con una consulta
  y el login. No hubo ningún `pageerror`.
- El servidor de prueba usó una base sembrada en el scratchpad: `backend/db/nexo.db` no se
  tocó. No hubo cambios de backend, así que `npm run regresion` no aplicaba.

### Qué sigue

- Que el usuario vea las capturas y diga qué cambiaría. El botón primario en tinta es la
  decisión más visible y se revierte con los tres tokens `--primario-*`.
- Tipos de negocio, segunda parte (punto 4 del plan).

## 73. Alta de cuenta guiada y Configuración como sección propia, 19 de octubre de 2026

Punto 4 del plan, con lo que pidió el usuario el 19 de octubre: elegir el tipo de negocio
"no en una sola pantallita", una interfaz aparte "bien estructurada como una aplicación real,
no un cuadradito que se abre", y una Configuración que se pueda seguir llenando.

**Backend (`server.js`, `permisos.js`, `db/index.js`).**
- **El catálogo de tipos vive en un solo lugar.** `PERFILES_RUBRO` suma `descripcion` e
  `icono`, y hay dos listas nuevas:
  - `RUBROS_PROXIMAMENTE` (barbería o peluquería, restaurante o bar): se muestran, pero la
    validación no los acepta;
  - `MODULOS_INFO`: nombre, descripción e ícono de cada módulo.
  - `catalogoTiposNegocio()` los arma, y los devuelven la ruta nueva
    `GET /api/auth/tipos-negocio` (pública, para el alta) y `GET /api/negocio` en
    `perfiles`, que cambió de forma.
- **Gimnasio:** su preset pasa a `pos compras stock`, con productos que nacen como
  producto. Los socios se suman con su módulo, en la etapa 5.
- **`validarDatosNegocio(cuerpo, { parcial })`**, compartida por el registro y
  `PUT /api/negocio`:
  - CUIT con dígito verificador (módulo 11), guardado como `20-12345678-6`;
  - condición fiscal de una lista fija (`responsable_inscripto`, `monotributo`, `exento`);
  - email con formato básico y topes de largo;
  - el tipo con `Object.hasOwn`: antes `"constructor"` o un array pasaban.
- **`PUT /api/negocio` es parcial:** escribe solo lo que viene. Antes, un campo que faltaba
  se borraba.
- **Módulos iguales a los del tipo se guardan como NULL**, en el alta y en el `PUT`
  (`modulosDelPreset()`): la empresa sigue al tipo.
- **El registro acepta** `modulos`, `documento`, `condicion_iva`, `direccion`, `telefono` y
  `email`, en las dos ramas de la transacción, con topes de largo como el login.
- **`condicion_iva` del negocio (sin cambio de esquema):** un backfill idempotente en
  `db/index.js` pasa a clave el texto que reconoce ("inscripto", salvo "no inscripto";
  "monotrib"; "exent"). El que no reconoce queda como estaba: Configuración lo muestra como
  "dato anterior" y el comprobante lo imprime tal cual. No se borró nada.
- `permisos.js`: la ruta nueva y el comentario de cabecera corregido (los cinco catálogos ya
  eran admin).

**Frontend.**
- **`core/` nuevo:**
  - `tipos-negocio.js`: las tarjetas, con un radio o un checkbox nativo adentro;
  - `fiscal.js`: condiciones, CUIT y etiqueta;
  - `campos.js`: el error debajo del campo, con `aria-invalid`;
  - `tema.js`: sale de `app.js` y avisa con el evento `nexo:tema`.
- **Router con subrutas:**
  - `#/vista/subruta`, con `subrutaDesdeHash()`, y el handler de `alEntrarEnVista` recibe
    la subruta;
  - `data-subruta` en los ítems del menú;
  - `#/usuarios` va a `configuracion/usuarios`.
- **Alta guiada (`frontend/js/alta.js`):**
  - cinco pasos a pantalla completa: tu cuenta, tu negocio, tipo, secciones y
    comprobantes (con "Completar después");
  - `sesion.js` la baja con `import()` desde "Creá una cuenta", desde `#/crear-cuenta` o en
    una instalación nueva;
  - cada paso entra al historial y Adelante no saltea pasos;
  - un 409 vuelve al paso 1 con el error en el usuario;
  - con teclado el foco va al primer campo, y en una pantalla táctil al título, para no
    abrir el teclado del celular;
  - se borró `#formRegistro`.
- **Configuración es una vista**, con un menú de páginas y cada página con su "Guardar
  cambios":
  - el botón se habilita con cambios y se manda solo lo que cambió;
  - lo editado sin guardar no se pisa al volver.
  - **Páginas:** Datos del negocio; Tipo de negocio y secciones; Comprobantes (con vista
    previa del membrete); Usuarios (el panel se movió desde su vista); los cuatro catálogos;
    Apariencia.
  - En el celular es una lista que lleva a cada página.
  - El empleado ve solo Apariencia.
  - Se borraron `#modalConfiguracion` y la vista Usuarios. El ítem Usuarios del menú pasó a
    ser Configuración.
- **Catálogos (listas de precios, depósitos y categorías de producto y de gasto):**
  - sus modales pasaron a páginas;
  - la lógica quedó en `app.js` y `gastos.js`, que registran `pintar:<catálogo>`;
  - la página recarga productos o gastos antes de pintar;
  - los botones de Productos, Stock y Gastos llevan ahí;
  - Depósitos depende del módulo `stock`;
  - las cuentas de tesorería siguen en Caja.
- **Ocho íconos de Lucide** al sprite: `beef`, `briefcase`, `carrot`, `cup-soda`,
  `dumbbell`, `palette`, `scissors` y `utensils`.

**Verificación.**
- `npm test` 55 de 55:
  - `registro.test.js` es nuevo y tiene su propio servidor, por el tope de 5 altas por IP;
  - en `api.test.js` hay un caso nuevo de actualización parcial, CUIT, condición y
    gimnasio.
- `npm run lint` verde.
- `verificar-migracion` 24 de 24, con la base real sin cambios (md5 `0cbdaa9d…`).
- `npm run regresion`: 4 diferencias, todas por la ruta pública nueva y la forma nueva de
  `perfiles` en `GET /api/negocio`.
- **Navegador** (base nueva en el scratchpad):
  - el alta completa con errores, Atrás y Adelante, 409 y "Completar después";
  - Configuración en escritorio y celular, en oscuro y claro;
  - los cuatro catálogos desde su botón: alta, lápiz y "Marcar";
  - deep-links con recarga real, y un módulo apagado redirige.
  - No hubo ningún `pageerror`.
  - Un arreglo que salió de esa prueba: la página se decide después de cargar el negocio
    (antes, un deep-link a Depósitos con `stock` apagado se abría).

### Qué sigue

- Que el usuario vea las capturas.
- Socios, cuotas e ingreso (punto 5 del plan).

## 74. Socios, cuotas e ingreso, 20 de octubre de 2026

Punto 5 del plan, con lo decidido con el usuario el 19 de octubre:
- planes con precio y duración (mensual, trimestral, anual);
- la cuota vence desde la fecha de alta del socio;
- un control de ingreso en la recepción que avisa si debe.

**Diseño (CLAUDE.md §29).** Es un módulo `socios` reusable, sin circuito de datos propio:
- el socio es un cliente (`socios.cliente_id`, uno por cliente);
- el plan es un servicio del catálogo (`planes_socio.producto_id`): su nombre, su precio y si
  está activo son los del producto;
- cada cuota es una venta de ese servicio. Lleva la fecha del día en que empieza el período
  y vence ese mismo día (se paga por adelantado). La cobran los cobros de siempre, y la ven
  las cuentas corrientes, la caja y los reportes.

**Esquema.** Aditivo: cuatro tablas nuevas al final de `schema.sql`, sin tocar ninguna
existente.
- `planes_socio`: el producto y la duración en meses (la valida `server.js`, sin `CHECK`).
- `socios`: número correlativo por empresa, `fecha_alta`, `ciclo_desde`, `cobrar_desde` y
  estado (activo o baja).
- `cuotas_socio`: el período (`desde` y `hasta`) y su venta, con `UNIQUE(socio_id, desde)`.
  Es hija de `socios`.
- `ingresos_socio`: quién lo dejó pasar, cuándo, si estaba al día y cuánto debía. También es
  hija de `socios`, y es su propio registro de quién y cuándo, sin fila de auditoría.

**Backend (`server.js`, sección "Socios, planes y cuotas").**
- **Cuotas sin cron.** `ponerCuotasAlDia()` corre cada vez que se mira a un socio (listado,
  ficha, ingreso, cobro, cambio de plan).
  - Genera solo los períodos que faltan hasta hoy, con el día local (`fechaDeHoy`).
  - Abre una transacción solo si a alguien le falta el período de hoy.
- **Períodos.** Se cuentan desde `ciclo_desde` y no encadenados (`sumarMeses()`: del 31/1
  sale el 28/2 y después el 31/3). Cada cuota que existe ocupa sus meses y una nueva usa el
  plan de hoy: un cambio de plan rige desde la cuota siguiente.
- **Alta hacia atrás** (un socio que ya venía): `cobrar_desde` es el día de la carga, así
  que se cobra el período que corre y no los anteriores.
- **Baja:** deja de generar cuotas y no toca las generadas. Reactivar empieza un ciclo nuevo
  hoy, o al terminar el período ya pagado; los meses de baja no se cobran.
- **Bonificar:** una cuota cuya venta se anula queda bonificada, y el período cuenta como
  cubierto.
- **Cobro:** `POST /api/socios/:id/cobros` salda todas las cuotas impagas, de la más vieja a
  la más nueva, en una cuenta. Es un cobro común por cuota, en una sola transacción.
- **Situación de cada socio:** al día (y hasta cuándo), debe (cuánto y desde cuándo), por
  empezar o de baja.
- **Rutas:**
  - `GET` y `POST /api/planes-socio`, y `PATCH /api/planes-socio/:id`. Crear y editar
    planes es admin.
  - `GET /api/socios`, `GET /api/socios/ingresos` (los de hoy), `GET /api/socios/:id`,
    `POST /api/socios`, `PATCH /api/socios/:id` (plan o estado),
    `POST /api/socios/:id/cobros` y `POST /api/socios/:id/ingresos`. Son de los dos roles:
    es el trabajo de la recepción.
- **Auditoría sin reconstruir `auditoria`** (el mismo recurso que el turno de caja):
  - alta, baja, reactivación y cambio de plan van como `entidad cliente`, con
    `operacion_tipo socio`;
  - los planes van como `entidad producto`, con `operacion_tipo plan_socio`;
  - cada cuota generada es una venta con `actor sistema` y sin usuario.
- **Módulo:** `socios` entra a `MODULOS`, a `MODULOS_INFO` y al preset del gimnasio
  (`pos compras stock socios`). La descripción del gimnasio ya no dice "muy pronto".
- **Guardas:**
  - el servicio de un plan no puede pasar a producto con stock, y los planes no aparecen en
    el catálogo del punto de venta;
  - el precio de un plan tiene que ser mayor a 0;
  - la fecha de alta tiene que existir (`validarFecha` solo mira el formato y dejaba pasar
    un 2026-13-01), desde el año 2000 y hasta 90 días para adelante;
  - el mismo documento no crea un cliente duplicado, y "Consumidor final" no puede ser
    socio.

**Frontend (`frontend/js/dominios/socios.js`).**
- **Menú y router:** el grupo "Socios" (módulo `socios`) con Ingreso y Socios. Vistas
  `ingreso`, `socios` y `socio-detalle`.
- **Ingreso:** una búsqueda grande por nombre, DNI o número, con flechas y Enter.
  - Al día: el ingreso se anota solo y la tarjeta sale verde.
  - Debe: tarjeta roja con un botón de cobro por cuenta y "Dejar pasar igual".
  - Por empezar (naranja) y de baja (gris).
  - Debajo, la lista de los ingresos de hoy.
- **Socios:** la tira de cifras (activos, al día, deben y deuda), la búsqueda y filtros por
  segmentos. "Deben" incluye a los de baja con deuda, para que la cifra cierre con la lista.
- **Alta** en `#/socios/nuevo`, como página y no como modal: tres tarjetas numeradas (quién
  es, nuevo o un cliente existente; el plan; desde cuándo) y un resumen que dice qué día
  vence la cuota y qué período se cobra primero.
- **Ficha:** datos, cobro, cambio de plan, baja o reactivación, cuotas e ingresos. Cada
  cuota lleva a su venta (`abrirFicha:venta`, registrado en `app.js`).
- **Configuración → Planes de socios** (admin, con el módulo prendido): la lista, el lápiz y
  pausar o activar.
- **Cuatro íconos de Lucide** al sprite: `calendar-clock`, `door-open`, `id-card` y
  `user-plus`.

**Verificación.**
- `npm test` 56 de 56:
  - el caso nuevo de `api.test.js` cubre planes, cuotas sin duplicarse, cobro, ingreso,
    alta hacia atrás, fechas inválidas, baja y reactivación, plan pausado y aislamiento
    entre empresas;
  - se actualizaron dos asserts que fijaban la lista vieja de módulos.
- `sumarMeses` se probó en los bordes: 31/1, año bisiesto y cambio de año.
- `npm run lint` verde y `verificar-migracion` 24 de 24.
- `npm run regresion`: 10 diferencias, todas esperadas (las rutas nuevas y el catálogo de
  tipos y módulos). `seed.mjs` suma un plan y dos socios: `/api/socios/:id` se compara
  desde el commit siguiente.
- **Navegador** (base en el scratchpad, `playwright-core` con el Chrome instalado):
  - planes en Configuración, alta, ficha con cobro;
  - ingreso al día, con deuda, "Dejar pasar igual", de baja y sin resultados;
  - escritorio y 390 px, oscuro y claro;
  - sin ningún `pageerror` ni error de consola.
  - Arreglos que salieron de esa prueba: la deuda total no cerraba con "Deben", los botones
    de cobro repetían el monto y el contador de ingresos llevaba el punto de estado.
- **Base real:** el `npm start` creó las cuatro tablas vacías, con el respaldo de antes en
  `OneDrive/Nexo-respaldos/nexo-20261020-114932.db`, y `integrity_check` da ok. La empresa
  real es un comercio general: el módulo se prende en Configuración → Tipo de negocio y
  secciones.

### Para después

- Cobrar una parte de la deuda, o adelantar cuotas: hoy se salda todo junto, y una cuota
  recién se genera al empezar su período.
- Congelar un plan (vacaciones) en vez de dar de baja.
- Avisos de vencimiento por WhatsApp (etapa 11).
- Un carnet con código para el lector de la recepción.
- Días de gracia antes de que figure que debe (hoy debe desde el primer día del período):
  a definir con el usuario.

### Qué sigue

- Que el usuario lo pruebe y vea las capturas.
- Varios negocios por cuenta (punto 6 del plan).

## 75. Planes con varias duraciones, varios planes por socio y descuentos, 20 de octubre de 2026

**Pedido del usuario:**
- un mismo plan con "distintas variantes por cuánto dura": mensual,
  trimestral, anual, dos meses, "muy personalizable";
- "combinar planes y hacer descuentos, por si una persona quiere hacer varias
  actividades".

Cambia el modelo de §74, que tenía una duración por plan y un plan por socio.

**Modelo.**
- **El plan sigue siendo un servicio del catálogo,** con su nombre y si se
  ofrece. Cada duración es una fila de `planes_socio_opciones`:
  - meses de 1 a 36 y su precio, una por cantidad de meses;
  - la que se saca se pausa, no se borra.
- **El precio del servicio en Productos** es de referencia: el de la duración
  más corta. `aplicarEdicionProducto` rechaza cambiarlo; compara valores,
  porque el modal de Productos manda siempre el precio de cada lista.
- **Un socio hace uno o varios planes** (`inscripciones_socio`), cada uno con
  su duración, su ciclo y sus cuotas:
  - el ciclo, `cobrar_desde`, la baja y la reactivación son los de §74, ahora
    por plan;
  - un índice parcial impide el mismo plan activo dos veces;
  - el socio está de baja cuando no tiene ningún plan activo.
- **Descuentos (`descuentos_socio` y `descuento_socio_planes`),** siempre en
  porcentaje (de más de 0 a 100):
  - **combo:** cuando el socio tiene todos los planes elegidos; baja esos;
  - **por cantidad:** desde N planes; baja todos;
  - **a mano:** se elige en el alta o en la ficha (`socios.descuento_id`).
  - Si se aplican varios, gana el mayor y no se suman: es un default razonable,
    falta confirmarlo con el usuario.
  - Se calcula al generar cada cuota, con los planes activos de ese momento.
    La cuota guarda la foto: `precio_lista`, `descuento_pct` y `descuento_id`.
  - Un 100% da una cuota "sin cargo".
- **Descartado:**
  - **Duraciones como variantes de producto:** ataba los socios a los
    atributos, y Productos podía desarmar la relación con los meses.
  - **Descuentos por monto fijo:** con planes de distinta duración no tiene un
    reparto claro. Un precio fijo de combo se arma como un plan propio
    ("Musculación + Funcional").

**Esquema.** Las tablas de §74 nunca se commitearon. En la base real el usuario
ya había probado la primera versión: un plan, un socio, una cuota cobrada (venta
#11) y dos ingresos. Por eso no se borraron.
- `schema.sql` tiene la forma nueva: `planes_socio` sin `duracion_meses`,
  `socios` sin plan ni estado, y `cuotas_socio` por inscripción. Suma las
  tablas nuevas: opciones, descuentos, planes de un combo e inscripciones.
- `db/index.js` migra la forma de §74 si la encuentra (`planes_socio` con
  `duracion_meses`), en una transacción con `foreign_keys` OFF:
  - cada plan conserva su id y su duración pasa a ser su primera opción, con
    el precio del servicio; una duración que solo quedó en cuotas entra
    pausada, con lo cobrado;
  - cada socio conserva su id y su plan pasa a ser una inscripción con el
    mismo id;
  - cada cuota conserva su id y su venta, y toma como precio de lista lo que
    se cobró;
  - `ingresos_socio` no cambia.
  - Las tres tablas que cambian se reconstruyen con su `CREATE` de
    `schema.sql`, leído con una regex (`schemaSql`): no hay una segunda copia
    de la definición.
  - Al final controla las claves foráneas de las seis tablas.
- **Antes de migrar se intentó otra cosa:** borrar las tablas, creyendo que
  estaban vacías. Una guarda del script controlaba que estuvieran vacías,
  encontró los dos ingresos y no tocó nada.
  - La migración se probó primero en una copia de la base real.
  - Respaldo manual antes de arrancar: `nexo-20261020-123807.db`, en
    OneDrive.

**Backend (`server.js`, sección de socios reescrita).**
- **Rutas nuevas:**
  - `GET`, `POST` y `PATCH /api/descuentos-socio` (escribir es admin);
  - `POST /api/socios/cotizacion`, que no escribe y devuelve las líneas, el
    total y los planes que ya tenía y cambian de descuento;
  - `POST /api/socios/:id/planes` (sumar);
  - `PATCH /api/socios/:id/planes/:inscripcionId` (duración, dejar,
    reactivar).
- **Rutas que cambian:**
  - `POST /api/planes-socio` y su `PATCH` reciben `opciones: [{ meses, precio }]`;
  - `POST /api/socios` recibe `planes: [{ opcion_id }]` y `descuento_id`;
  - `PATCH /api/socios/:id` cambia el descuento a mano, o da de baja y
    reactiva al socio entero (vuelven los planes de su última baja).
- **Cada socio trae** sus planes con el precio de la próxima cuota y su
  descuento. `empieza` reemplaza al uso de `ciclo_desde` para "por empezar".

**Frontend (`dominios/socios.js` reescrito).**
- **Configuración → Planes:** una fila por duración (meses y precio), con su
  nombre y cuánto sale por mes, comparado con el mensual. Se agregan y se
  quitan duraciones.
- **Configuración → Descuentos y combos** (página nueva): tres tarjetas para
  elegir el tipo, los planes del combo en casillas y la cantidad mínima.
- **Alta:** cada plan es una tarjeta con su casilla; marcada, muestra sus
  duraciones. Abajo, la cotización: precio de lista tachado, precio final, el
  descuento y el primer período. Se puede elegir el descuento a mano.
- **Ficha:**
  - el panel "Planes": duración (con confirmación), Dejar, Reactivar y "Sumar
    plan", con la cotización y los planes que cambian de descuento;
  - el descuento a mano;
  - el detalle de la cuota: duración y descuento.
- **Lista e ingreso:** muestran todos los planes del socio.

**Verificación.**
- `npm test` 56 de 56. El caso de socios se reescribió:
  - duraciones inválidas o repetidas, editar y pausar duraciones, y el precio
    del servicio que no se cambia desde Productos;
  - combo, cantidad y a mano, con "gana el mayor";
  - cotización igual a la cuota generada;
  - alta con dos planes, sumar uno, cambiar duración, dejar y reactivar;
  - baja y vuelta del socio entero, y aislamiento.
- `npm run lint` verde y `verificar-migracion` 24 de 24, incluida la copia de
  la base real.
- `npm run regresion`: 12 diferencias, todas por rutas nuevas y el catálogo de
  módulos.
- **Navegador:** escritorio, 390 px, oscuro y claro, sin errores de consola.
  Arreglos que salieron de la prueba:
  - el error de una duración rompía su fila;
  - "Pausar" quedaba fuera de la tabla de descuentos;
  - elegir la misma duración avisaba un cambio que no hubo;
  - en el celular, el nombre del plan quedaba apretado contra el precio.
- **Base real:** migrada al arrancar, con `integrity_check` ok y sin claves
  rotas.

### Para después

- Descuentos de monto fijo, o un precio fijo de combo que se reparta.
- Que se sumen dos descuentos (hoy gana el mayor), si el usuario lo prefiere.
- Alinear el vencimiento de un plan sumado con el de los otros (hoy cada plan
  vence el día en que se sumó).
- Pases por día o por semana: hoy son un servicio que se vende en el punto de
  venta.
- Lo pendiente de §74: cobro parcial, congelar un plan, avisos por WhatsApp,
  carnet con código y días de gracia.

### Qué sigue

- Que el usuario lo vea y confirme "gana el mayor".
- Varios negocios por cuenta (punto 6 del plan).

## 76. Planes y descuentos de socios, del menú de Configuración al menú principal, 20 de octubre de 2026

**Pedido del usuario:** "la configuración de planes también tiene que estar en
el apartado principal, no en Configuración".

**Qué cambió.**
- **Vista nueva `planes-socio`:** "Planes" en el menú, dentro del grupo Socios.
  - Tiene dos pestañas, que son enlaces con su dirección: `#/planes-socio`
    (los planes) y `#/planes-socio/descuentos` (descuentos y combos). Los
    descuentos se mudaron con los planes porque van atados a ellos.
  - Es solo admin: `col-admin` en el ítem del menú y `VISTAS_SOLO_ADMIN` en el
    router, porque son los precios. Pertenece al módulo `socios`.
  - El HTML de las dos páginas se movió tal cual, con los mismos ids.
    Sumó un título en cada formulario ("Nuevo plan" o `Editar "…"`).
- **Configuración** ya no tiene el grupo Socios ni sus entradas en `PAGINAS`.
  - `dominios/socios.js` cambió `registrar("pintar:…")` por
    `alEntrarEnVista("planes-socio", abrirPlanes)`, que elige la pestaña por la
    subruta.
  - Los enlaces viejos `#/configuracion/planes-socio` y
    `…/descuentos-socio` llevan a la vista nueva (`VISTAS_RENOMBRADAS`).
- **Textos:** los avisos que decían "Configuración → Planes de socios" ahora
  dicen "Socios → Planes", también el error de `server.js` al tocar el precio
  de un plan desde Productos.

**Verificación.**
- `npm test` 56 de 56 y `npm run lint` verde.
- **Navegador** (base nueva en el scratchpad):
  - el ítem del menú y las dos pestañas, con su dirección y el título del
    formulario al editar;
  - el enlace viejo y Configuración sin el grupo Socios;
  - 390 px;
  - el empleado no ve "Planes", y con la dirección escrita a mano no entra.
  - Sin errores de consola.
- El servidor real se reinició para tomar el texto nuevo.

### Qué sigue

- Lo mismo que §75: que el usuario lo vea y confirme "gana el mayor".

## 77. Varios negocios por cuenta, 20 de octubre de 2026

**Pedido:** punto 6 del plan en dos semanas. "Una cuenta podría tener más de un
negocio sin problema" (decisión del usuario del 19 de octubre, CLAUDE.md §28).
Antes se commitearon socios, cuotas, planes y descuentos (§74–§76), en dos
commits aparte.

**Esquema** (CLAUDE.md §34):
- **`usuario_organizaciones`** (tabla nueva): en qué negocios trabaja cada
  usuario.
  - Columnas `usuario_id`, `organizacion_id`, `rol`, `activo`, `fecha_alta` y
    `ultimo_acceso`, con PK compuesta.
  - Un índice por `organizacion_id`.
- **`usuarios` quedó como la identidad.**
  - Se borraron `rol` y `activo` con `DROP COLUMN`, después de copiarlos a la
    pertenencia en la misma transacción.
  - Es SQL estándar; ninguna vista, índice ni trigger los usaba, y cada
    `CHECK` era de su propia columna. Reconstruir la tabla (cuatro tablas
    tienen FK hacia ella) era más riesgo para nada.
  - Es una variante nueva del patrón de §34: sirve para sacar una columna sin
    FK ni índice.
  - `usuarios.organizacion_id` queda como "negocio donde se creó la cuenta" y
    no decide permisos. Sacarla pide reconstruir la tabla, porque es una FK.
- **`sesiones.organizacion_id`**: el negocio activo de la sesión.
  - Nullable, porque la suma un `ALTER`.
  - Las sesiones abiertas se rellenan con el negocio de su usuario, así nadie
    queda afuera al migrar.

**Backend (`server.js`).**
- **Sesión:**
  - `sesionValida` hace `JOIN` a la pertenencia activa del negocio de la
    sesión;
  - `req.usuario.rol` y `req.usuario.organizacion_id` mantienen los nombres,
    así que ningún handler cambió.
- **Respuesta del usuario:** `datosUsuario()` arma la misma respuesta en
  estado, login y registro, que ahora suma `organizacion_id`.
- **Login:** entra al último negocio usado (`ultimo_acceso` de la
  pertenencia, con milésimas).
  - El orden es `ultimo_acceso IS NULL, ultimo_acceso DESC`, portable.
  - Sin ninguna pertenencia activa responde igual que un usuario que no existe.
- **Registro:** se separaron `validarNegocioNuevo`, `valoresNegocio`,
  `insertarNegocio` y `sumarAlNegocio`, que también usa el alta de negocio.
- **Rutas nuevas:**
  - `GET /api/negocios` (los dos roles): los negocios activos del usuario.
  - `POST /api/negocios` (admin): crea uno con quien lo crea como admin y
    pasa la sesión a él.
    - Tiene el tope del registro, contado por usuario.
    - El empleado no crea negocios desde la cuenta de su empleador.
  - `POST /api/negocios/:id/entrar` (los dos roles): cambia de negocio.
    - Uno ajeno o de baja da 404, igual que uno inexistente.
    - Se audita como `logout` en el que deja y `login` en el que entra, sin
      nombrar al otro.
- **Pestaña vieja:** el frontend manda `X-Nexo-Negocio` con el negocio que
  muestra.
  - Si no es el de la sesión, el backend responde 409 con
    `X-Nexo-Negocio-Cambiado`.
  - Sin esto, una pestaña que seguía mostrando A escribía en B después de
    cambiar en otra.
  - Quedan exentas `/auth/*` y `/negocios*`. No autoriza nada.
- **Usuarios:** el rol y la baja se escriben en la pertenencia del negocio
  actual.
  - La baja borra solo las sesiones de ese negocio.
  - El último admin se cuenta por negocio.
  - **Regla nueva:** el nombre y la contraseña son de la persona, así que un
    admin solo los cambia si administra **todos** los negocios de esa persona,
    también los que la dieron de baja. Si no, responde 409 con un mensaje.
    - Sin esta regla, el admin de A le resetea la clave a alguien que se armó
      su negocio C y entra a C.

**Frontend.**
- **Sesión (`sesion.js`):**
  - marca `<html data-organizacion>`;
  - su interceptor suma la cabecera y, ante el 409 de la pestaña vieja,
    recarga con un aviso;
  - volver a entrar después de un 401 recarga, en vez de seguir con la
    memoria de la sesión anterior.
- **Claves locales por negocio:**
  - `nexo.filtros.<org>.<contenedor>`, porque guardan ids de categorías,
    depósitos y cuentas;
  - `nexo.pos.caja.<org>`.
- **`dominios/negocios.js` (nuevo):** el selector arriba del menú, con la
  estructura del de espacios de Dub (inicial en un cuadradito, nombre, tipo,
  `chevrons-up-down`).
  - **Menú:** el negocio actual con check y "Agregar negocio" solo para el
    admin.
    - Lo muda al `<body>` y lo ubica fijo debajo del botón: el cajón del
      celular tiene un `transform` que corre cualquier `position: fixed`.
    - Teclado: flechas, Inicio, Fin, Escape y Tab.
  - **Cambiar de negocio:** recarga en la vista de inicio con el aviso
    "Estás en «X»".
  - **Empleado de un solo negocio:** ve el nombre sin menú.
- **"Agregar negocio" es `alta.js` en modo `negocio`:**
  - arranca en "Tu negocio" ("Paso 1 de 4") con la ruta `#/agregar-negocio/N`;
  - tiene Cancelar en la cabecera, sin Atrás en su primer paso, y una nota
    que explica qué es un negocio aparte;
  - el botón final dice "Crear negocio";
  - llama a `POST /api/negocios`.

**Verificación.**
- `npm test` 57 de 57, con un caso nuevo:
  - crear, cambiar y volver;
  - 404 a un negocio ajeno, con la sesión que no se mueve;
  - el empleado no crea negocios;
  - el login entra al último negocio;
  - la cabecera de la pestaña vieja;
  - la regla de nombre y contraseña;
  - la baja en un negocio que no toca el otro;
  - el último admin por negocio.
- `npm run lint` verde.
- `verificar-migracion` 24 de 24, con la copia de la base real.
- `npm run regresion`: 4 diferencias, todas esperadas. Son `organizacion_id` en
  `/api/auth/estado` y la ruta nueva `GET /api/negocios`, con los dos roles;
  `/api/usuarios` dio igual.
- **Navegador** (34 controles, base nueva): selector, teclado, alta con
  Cancelar y Atrás, nombre con XSS, cambio en las dos direcciones, filtros
  separados, dos pestañas, claro, 390 px y empleado.
  - El único error de consola es el 409 esperado de la pestaña vieja, que
    Chrome registra como recurso fallido.

### Para después

- Invitar a una persona que ya tiene usuario a otro negocio. Hoy cada negocio
  crea sus propios usuarios, y el nombre de usuario sigue siendo único en todo
  Nexo.
- Pasar un negocio a otro dueño, o darlo de baja entero.
- Un límite de negocios por cuenta, cuando haya planes (CLAUDE.md §28).
- El logo del negocio en el cuadradito del selector, cuando exista el logo.

### Qué sigue

- Que el usuario lo vea.
- B2: PWA (punto 7 del plan).

## 78. Servicios con funciones propias: catálogo y trabajos, 20 de octubre de 2026

**Pedido:** punto 6a del plan en dos semanas. "Que en vez de productos se
puedan agregar servicios" y que el tipo Servicios tenga más funciones (usuario,
20 de octubre). Diseño en `docs/investigacion-crm-servicios.md` §3. Esta etapa
hace los dos primeros puntos (catálogo y trabajos); los abonos y el
recordatorio de presupuestos quedan para la siguiente.

**Esquema** (CLAUDE.md §34, todo aditivo):
- `productos.descripcion` (texto) y `productos.duracion_minutos` (entero, de 1
  a una semana), nullable, con `ALTER` en `db/index.js` después de los
  rebuilds.
- Tablas nuevas `trabajos` y `trabajo_items` (hija), con un índice único
  parcial: un solo trabajo sin cancelar por presupuesto.
- Unidad nueva `hora` en `UNIDADES` (sin `CHECK`, no hubo rebuild). Admite
  decimales, como kg.

**Catálogo.**
- Cada tipo de negocio puede llamar distinto a su catálogo:
  `PERFILES_RUBRO.<tipo>.catalogo = { plural, singular }`, que sale en
  `GET /api/negocio`. Solo Servicios lo usa ("servicios"); el resto sigue con
  "productos" (`CATALOGO_POR_DEFECTO`).
- En el frontend, `termino(clave)` de `core/negocio.js` da la palabra
  ("Plural" en mayúscula, "singular" en minúscula). `fijarNegocio()` la pone en
  cada `[data-termino]`: el menú, el título de la vista (el router le pone
  `data-termino` al `h1`, así se corrige con un deep-link), los botones y el
  modal.
  - En un botón flex, la palabra va dentro de un `<span>` que envuelve todo el
    texto: si no, el `gap` deja un espacio doble.
- **Formulario de servicio:** sin SKU (si ya tenía, se ve para poder borrarlo)
  ni stock; con descripción, duración estimada y "Se cobra por" (unidad u
  hora). Las unidades no se recortan para un servicio: una lavandería cobra por
  kilo.
- **Ficha de servicio:** sin franja de stock, movimientos ni botón Variantes;
  con descripción y duración (`duracion()` de `core/formato.js`: "1 h 30 min").
- **Tabla:** la columna SKU solo aparece si algún producto tiene (`.sin-sku`).
  Stock y Valorizado van con el módulo de stock (`data-modulo="stock"`).

**Trabajos** (módulo `trabajos`, nuevo en `MODULOS`; viene prendido en
Servicios y cualquier negocio lo puede prender).
- Un trabajo es lo que hay que hacer para un cliente: título, día y hora
  opcionales, responsable (un usuario activo del negocio), estado (pendiente,
  en curso, terminado o cancelado), notas y renglones.
- **Sin circuito propio:** al terminarlo pasa a una venta con sus renglones,
  desde el depósito predeterminado y con la lista del trabajo, igual que la
  conversión de un presupuesto. Se cobra con el cobro de siempre.
- **Desde un presupuesto:** "Programar trabajo" en su ficha. Copia cliente,
  renglones y lista, y el presupuesto pasa a aceptado. Mientras tenga un
  trabajo sin cancelar, el presupuesto no se convierte directo (400) y su ficha
  muestra "Ver el trabajo". Al terminar el trabajo, el presupuesto queda
  convertido en la misma venta.
- Los renglones se corrigen hasta terminarlo (las horas reales). Uno sin
  renglones no se termina. Uno cancelado no se edita y se puede retomar, salvo
  que su presupuesto ya tenga otro trabajo o se haya convertido.
- **Rutas** (todas de los dos roles, como presupuestos y ventas):
  `GET /api/trabajos`, `GET /api/trabajos/responsables` (los usuarios activos
  del negocio, aparte de `GET /api/usuarios`, que es de admin),
  `GET /api/trabajos/:id`, `POST /api/trabajos`, `PUT /api/trabajos/:id`,
  `PATCH /api/trabajos/:id/estado` y `POST /api/trabajos/:id/terminar`.
- **Auditoría:** como los socios, sin reconstruir `auditoria`: entidad
  `cliente` con `operacion_tipo trabajo`; la venta, entidad `venta` con
  `operacion_tipo trabajo`.
- `validarPresupuesto` se partió: `errorEnItemsCotizados()` valida los
  renglones de los dos. Un producto ajeno ahora dice "Uno de los productos no
  existe." (antes nombraba al presupuesto).
- **Pantallas** (`frontend/js/dominios/trabajos.js`, nuevo):
  - lista con "Para hoy", "Próximos 7 días", "Atrasados" y "A cobrar al
    terminar", búsqueda y filtros (por hacer, terminados, cancelados, todos);
    "Cuándo" dice "Hoy, 15:00", "Mañana", "El jueves" o la fecha;
  - ficha con las acciones según el estado; "Terminar y cobrar" crea la venta y
    abre el cobro;
  - alta y edición en un modal como el del presupuesto. Las filas de renglones
    son las de venta de `app.js`, que las registra como `items:agregarFila`,
    `items:cargar`, `items:leer` e `items:total` (el dominio no conoce el
    catálogo). `cargarFilasItems()` salió del modal del presupuesto y lo usan
    los dos.
- Íconos nuevos del sprite (Lucide): `clipboard-list` (trabajos) y `repeat`
  (para los abonos).
- En el celular, los filtros de Socios y de Trabajos van en un renglón de lado
  a lado.

**Verificación.**
- `npm test` 58 de 58, con un caso nuevo: servicio por hora con duración, el
  catálogo del tipo Servicios, trabajo desde presupuesto (aceptado, sin
  convertir directo, sin segundo trabajo), validaciones (hora sin día,
  responsable de otro negocio, producto ajeno, sin título), aislamiento (404
  desde otro negocio), corregir horas, terminar en una venta por 37.500 con el
  presupuesto convertido, y el ciclo cancelar y retomar.
- `npm run lint` verde.
- `verificar-migracion` 24 de 24; md5 de la base real igual antes y después.
- `npm run regresion`: 14 diferencias, todas esperadas: las rutas nuevas de
  trabajos, `descripcion` y `duracion_minutos` en productos, `trabajo_id` en
  presupuestos y el módulo y el catálogo nuevos en los tipos de negocio. Se
  sumó `/api/trabajos/:id` a `LISTADO_DE`.
- **Navegador** (base nueva, negocio de servicios): menú y título
  "Servicios", formulario sin SKU y con duración, ficha de servicio, presupuesto
  → programar → ficha del trabajo → terminar → cobro de la venta, lista en la
  compu y a 390 px, sin errores de consola.
  - Un recorrido que crea la cuenta por API con el alta guiada abierta en la
    página pierde el hash: el alta lo borra al cerrarse (`alta.js`). Es del
    script, no de Nexo.

### Para después

- Abonos mensuales (punto 3 del diseño), con el mecanismo de las cuotas de
  socios.
- Recordatorio de presupuestos enviados sin respuesta, compartido con el CRM.
- Agenda con turnos, horas por cliente y portal del cliente (diseño §3).
- Asignar el responsable a varios trabajos de una vez, y una vista de
  calendario.

### Qué sigue

- Que el usuario lo vea.
- Abonos (sigue el punto 6a) y después el CRM (6b).

## 79. Abonos mensuales, 20 de octubre de 2026

**Pedido:** el resto del punto 6a del plan (`docs/investigacion-crm-servicios.md`
§3, punto 3): un servicio que un cliente paga cada tantos meses
(mantenimiento, honorarios, una agencia). Lo tienen Dux y Contagram.

**Decisión:** el mismo mecanismo que las cuotas de socios, no uno nuevo.
- La cuenta de períodos salió de `generarCuotasDe()` a
  **`periodosPendientes()`**, que usan socios y abonos. Mismo comportamiento:
  los 59 tests (incluido el de socios, §74–§75) siguen pasando.
- Cada cuota es una venta del servicio; `decorarCuota()` decide su estado
  (pagada, parcial, vencida, bonificada) también para los abonos.
- Un abono no es un socio: no tiene número, ingreso ni descuentos. Por eso va
  en su propia tabla y no en `inscripciones_socio`.

**Esquema** (aditivo): tablas `abonos` (cliente, servicio, precio, cada cuántos
meses de 1 a 12, `fecha_alta`, `ciclo_desde`, `cobrar_desde`, estado, notas) y
`cuotas_abono` (hija, con `UNIQUE(abono_id, desde)` y la venta).

**Backend** (módulo `abonos`, nuevo en `MODULOS`, prendido en Servicios).
- `GET /api/abonos` y `GET /api/abonos/:id` (los dos roles) arman las cuotas que
  falten (`ponerAbonosAlDia()`, sin cron, igual que `ponerCuotasAlDia()`).
  `GET /api/cuentas-corrientes` también las arma, así la deuda aparece aunque
  nadie haya entrado a Abonos.
- `POST /api/abonos` y `PATCH /api/abonos/:id` son admin, como los planes de
  socios: cambian lo que se cobra.
  - Solo un servicio activo de la empresa: con stock, cada cuota sacaría
    mercadería.
  - Un alta hacia atrás cobra el período que corre, no los anteriores.
  - El precio o la frecuencia nuevos rigen desde la cuota siguiente: antes de
    guardarlos se arma lo que falte con el precio de antes.
  - Baja y reactivar, como un plan de socio: no se cobran los meses de baja.
- Auditoría: entidad `cliente` con `operacion_tipo abono`; la cuota generada,
  `actor sistema`.

**Frontend** (`frontend/js/dominios/abonos.js`, nuevo):
- lista con "Abonos activos", "Entra por mes" (un trimestral suma un tercio),
  "Deben" y la deuda, búsqueda y filtros;
- ficha con las cuotas: "Cobrar" abre el cobro de ventas de siempre, y el modal
  de cobro de `app.js` ahora avisa con el evento `cobro-registrado` para que la
  ficha se repinte sin conocerlo;
- alta y edición en un modal (admin), que propone el precio del servicio.

**Verificación.**
- `npm test` 59 de 59, con un caso nuevo: validaciones (producto con stock,
  servicio ajeno, meses fuera de rango, precio negativo, empleado 403), la cuota
  de hoy una sola vez, el alta hacia atrás, precio desde la siguiente, cobro,
  baja y reactivar sin duplicar, y aislamiento.
- `npm run lint` verde; `verificar-migracion` 24 de 24, con el md5 de la base
  real igual antes y después.
- `npm run regresion`: 6 diferencias esperadas (la ruta nueva y el módulo nuevo
  en los tipos de negocio). Se sumó `/api/abonos/:id` a `LISTADO_DE`.
- Navegador (base nueva): alta desde el modal con precio propuesto, ficha,
  cobro de la cuota (queda "Pagada" y la deuda en $0), lista en la compu y a
  390 px, sin errores de consola.

### Para después

- Aviso de abonos con cuotas vencidas en "Para hoy" del CRM (6b).
- Cobrar varias cuotas juntas desde la ficha, como en socios.
- Ajuste de precio en lote (por ejemplo, +10% a todos los abonos de un servicio).

### Qué sigue

- Que el usuario vea §78 y §79.
- El recordatorio de presupuestos sin respuesta va con "Para hoy" del CRM (6b).

## 80. Agenda de trabajos: semana y mes, 20 de octubre de 2026

**Pedido:** "¿hay algún tipo de calendario/agenda semanal y mensual para los
servicios?" No había; el usuario pidió hacerlo antes del CRM.

**Sin cambio de esquema.** Los trabajos ya guardaban día, hora y responsable.
`SELECT_TRABAJO` suma `duracion_estimada` (minutos): lo que se cobra por hora
dura esas horas; el resto, la duración estimada de cada servicio por su
cantidad. NULL si no hay dato.

**Pantalla** (`dominios/trabajos.js`): Trabajos tiene tres pestañas,
`#/trabajos/lista`, `#/trabajos/semana` y `#/trabajos/mes`. Sin subruta abre la
última que se usó (`localStorage` `nexo.trabajos.vista`), así "Volver a
trabajos" vuelve a la agenda.
- **Semana:** columnas de lunes a domingo, de 8 a 20 h (se amplía si hay algo
  antes o después).
  - Cada trabajo es un bloque a su hora, con el largo de su duración (1 h sin
    dato, nunca menos de media).
  - Los que se pisan van lado a lado, en carriles por grupo.
  - Arriba van los que tienen día sin hora y las cuotas de abonos que empiezan
    ese día. Una línea roja marca la hora actual en la columna de hoy.
  - Tocar un hueco abre el alta con ese día y esa media hora.
- **Mes:** la grilla con hasta tres cosas por día y "+N más"; tocar un día
  muestra su lista abajo, con "Agregar un trabajo".
- **Los dos:** el color de cada bloque es su estado, como en la lista
  (naranja, azul, verde; borde rojo si está atrasado); los cancelados no se
  ven. Filtro por responsable (también "Sin asignar"), que se propone al crear
  desde la agenda. Abajo, "Sin fecha", con lo que todavía no tiene día.
- **Celular:** la semana pasa a una lista por día y el mes muestra puntos; lo
  del día elegido va abajo.
- `abonos.js` registra `abrirFicha:abono` para abrir una cuota desde la agenda.

**Verificación.**
- `npm test` 59 de 59; el caso de trabajos suma `duracion_estimada` (2,5 h por
  hora dan 150 minutos). `npm run lint` verde.
- `npm run regresion`: 0 diferencias (el seed no tiene trabajos).
- Navegador (base nueva, negocio de servicios): semana con dos trabajos que se
  pisan, uno sin hora, el abono del domingo y "Sin fecha"; un hueco de mañana
  propone 13:00; el mes, el día elegido y uno atrasado con borde rojo; el
  celular en semana y mes; volver por el menú abre la pestaña recordada. Sin
  errores de consola.
- Arreglado en la pasada: el texto de un bloque de una hora se cortaba (ahora
  hora y título van en un renglón), la etiqueta de las 8 se montaba en la fila
  de arriba y el selector de responsable tenía el estilo del sistema.

### Para después

- Arrastrar un bloque para cambiarle el día o la hora.
- Vista de día con columnas por responsable.
- Turnos que reserva el cliente (el módulo que espera la barbería).

## 81. Guía de primeros pasos en el Resumen, 20 de octubre de 2026

**Pedido:** pendiente de §73 ("una guía de primeros pasos en el Resumen para
una cuenta nueva"), dentro de "seguí con cosas más chicas" del usuario.

- `GET /api/negocio/primeros-pasos` (admin, como el Resumen) devuelve cuánto
  hay cargado: datos del negocio, catálogo (sin los servicios de los planes de
  socios), clientes (sin "Consumidor final"), ventas, usuarios activos, planes,
  socios, trabajos y abonos.
- `frontend/js/dominios/primeros-pasos.js` arma los pasos según los módulos:
  datos del negocio, primer producto o servicio (con `termino()`), planes y
  primer socio si hay socios, un cliente, primer trabajo y un abono si están
  esos módulos, la primera venta (en el mostrador si hay punto de venta) y
  sumar a alguien del equipo.
  - Cada paso se da por hecho con los conteos, no con un tilde a mano.
  - El que sigue va resaltado con "Empezar"; los demás, con "Ir". Llevan a la
    vista y abren su alta, o a la página de Configuración.
  - Barra de progreso; "Ocultar la guía" queda guardado por negocio en el
    navegador (`nexo.primerosPasos.oculto.<org>`), y se oculta sola al
    completarse.
- Verificación: un caso de API (cuenta lo de A sin los planes, B no ve lo de A,
  empleado 403) y un recorrido en Chrome con una cuenta nueva de servicios
  (siete pasos, "Empezar" a Configuración, un paso que queda hecho al cargar un
  servicio, celular y ocultar después de recargar), sin errores de consola.

## 82. "Hoy" es el día del negocio, no el de UTC, 20 de octubre de 2026

**Hallazgo** (al probar §81 a las 21 h): el Resumen decía "Del 21/10" con la
barra en "Martes, 20 de octubre". El servidor tomaba "hoy" con `date('now')` de
SQLite, que es UTC: **desde las 21 h de la Argentina, toda venta, cobro, pago,
gasto, movimiento de caja o de cuenta corriente quedaba con la fecha del día
siguiente**, y el asistente le decía a Gemini que hoy era mañana.

**Arreglo** (sin cambio de esquema):
- `backend/fecha.js` (nuevo): `fechaDeHoy()` en la zona del negocio con Intl,
  `America/Argentina/Buenos_Aires` por defecto o `NEXO_ZONA_HORARIA` (en
  `.env.example`). No depende de la hora del servidor, así un hosting en UTC
  fecha bien; una zona inválida corta el arranque. `inicioDeHoyUTC()` para
  comparar contra columnas con hora en UTC (los ingresos del día de socios).
  - Se descartó usar la variable `TZ`: Node en Windows la ignora.
  - Lo usa también `interprete.js`, que sigue sin importar la base.
- `server.js`: los 35 INSERTs que dependían del `DEFAULT (date('now'))` de 14
  tablas pasan la fecha explícita con `HOY_SQL` (`fecha_de_hoy()`, una función
  registrada en la conexión que llama a `fechaDeHoy()`), y los 5 que arman sus
  columnas a mano ponen siempre `fecha || fechaDeHoy()`. Se fueron `SQL_HOY` y
  los `SELECT date('now')`. El `DEFAULT` de las tablas queda (cambiarlo pide
  reconstruir 14 tablas), pero ya nada lo usa.
  - Las columnas con fecha y hora (`datetime('now')`: auditoría, ingresos,
    sesiones) siguen en UTC, que es correcto: el frontend las muestra en hora
    local.

**Verificación.**
- `backend/test/fecha.test.js` (nuevo): un servidor en una zona que ahora
  mismo está en otro día que UTC (Pago Pago o Kiritimati según la hora) fecha
  la venta, el cobro y el movimiento de caja con el día de esa zona; una zona
  inválida no arranca. **Control:** contra HEAD (worktree) fallan los dos.
- A mano, a las 21:06 de la Argentina (00:06 UTC del 21): venta, cobro y
  movimientos con fecha 20.
- `npm test` 62 de 62, `npm run lint`, `verificar-migracion` 24 de 24 (md5 de
  la base real igual) y `npm run regresion` con solo la ruta nueva de §81.

### Para después

- **Datos que ya quedaron mal:** lo cargado antes de este arreglo entre las 21
  y las 24 h tiene la fecha del día siguiente. Se podría corregir con la hora
  UTC de su fila de auditoría, pero cambia fechas de operaciones reales: lo
  decide el usuario.

## 83. Trabajos y abonos en la ficha del cliente, 20 de octubre de 2026

**Por qué:** que la ficha de un cliente muestre todo lo suyo, no solo sus
compras.
- Dos paneles nuevos en la ficha, "Trabajos" y "Abonos", con
  `data-modulo` (no se ven con el módulo apagado). Los pinta cada dominio:
  `app.js` invoca `pintar:trabajosDelCliente` y `pintar:abonosDelCliente`.
- Trabajos: lo que falta hacer primero, con "Cuándo", estado y total; "Nuevo
  trabajo" abre el alta con el cliente ya cargado.
- Abonos: servicio, cada cuánto, precio, próxima cuota, deuda y estado; "Nuevo
  abono" (admin) propone el cliente.
- Filtran en el navegador `GET /api/trabajos` y `GET /api/abonos`: para una
  base grande va a hacer falta filtrar por cliente en el servidor (la
  paginación sigue pendiente, CLAUDE.md §35).
- Verificación: `npm test` 62 de 62, lint verde y un recorrido en Chrome
  (un trabajo y un abono en la ficha, el alta con el cliente propuesto y la
  ficha del abono desde la fila), sin errores de consola.

## 84. Cobrar todas las cuotas de un abono juntas, 20 de octubre de 2026

**Pendiente de §79.** `POST /api/abonos/:id/cobros` (los dos roles, como cobrar
una venta) salda todas las cuotas impagas en una cuenta, con un cobro por
cuota, igual que el cobro de un socio. En la ficha del abono, un panel con
"Debe $X" y un botón por cuenta (efectivo primero), con confirmación; con
deuda, la franja "Debe" se oculta porque el panel ya lo dice. Cobrar una parte
sigue siendo desde la cuota.
- Verificación: el caso de abonos suma el cobro de todo (404 desde otro
  negocio, 400 con una cuenta ajena, deuda en 0 después y 400 si no hay nada
  que cobrar); `npm test` 62 de 62; recorrido en Chrome (panel, confirmación,
  cuota pagada y deuda en $0), sin errores de consola.

## 85. Cambios sin guardar en Configuración, 20 de octubre de 2026

**Pendiente de §73** ("avisar al salir de una página con cambios sin guardar").
Los cambios ya se conservaban al cambiar de página; ahora no pasan
desapercibidos (`dominios/configuracion.js`):
- la página con cambios lleva un punto naranja en el menú de Configuración (en
  lugar de la flecha), que se va al guardar o al deshacer el cambio;
- salir de Configuración por el menú principal no se frena, pero avisa en qué
  páginas quedaron cambios y que siguen ahí al volver;
- cerrar o recargar la pestaña pide confirmación al navegador
  (`beforeunload`).
- Cubre las tres páginas con formulario (negocio, tipo y secciones,
  comprobantes); los catálogos guardan al momento.
- Verificación: recorrido en Chrome (punto, aviso al salir, el dato que sigue
  al volver y el punto que se va al guardar), sin errores de consola; lint y
  `npm test` 62 de 62.

## 86. El vocabulario del catálogo en presupuestos y ventas, 20 de octubre de 2026

**Por qué:** en un negocio de servicios, el circuito de venta seguía diciendo
"producto". Ahora sigue a `termino()` (§78), con `data-termino` en el HTML:
- Resumen: "Servicios más vendidos" y su columna;
- Presupuestos: la columna de la lista, "Servicios cotizados" y su columna,
  "agregar servicio" y el aviso de renglón vacío;
- Ventas: la columna de la lista, "Servicios vendidos" y su columna, "agregar
  servicio" y el aviso de renglón vacío;
- Factura: "Servicios facturados" y su columna;
- el buscador de cada renglón: "Buscar servicio…".
- Compras, stock, devoluciones y el punto de venta siguen diciendo "producto":
  un servicio no se compra ni tiene stock.
- Verificación: recorrido en Chrome con un negocio de servicios ("agregar
  servicio", "Buscar servicio…", columna "Servicios") y uno de comercio (los
  mismos con "producto"), sin errores; lint y `npm test` 62 de 62.

## 87. Pasada en tema claro de las pantallas nuevas, 20 de octubre de 2026

Regla de diseño: toda pantalla se revisa en claro, en oscuro y a 390 px. Se
recorrieron en claro el Resumen con la guía, Trabajos (lista, semana y mes),
Abonos (lista y ficha con cobro) y la semana en el celular. Arreglado:
- **Los chips del mes salían grises** (también en oscuro): la regla de
  `.agenda-chip` iba después de los colores de estado y se los pisaba. Los
  estados van ahora con `:is(.agenda-trabajo, .agenda-chip)` delante.
- **El panel de cobro del abono quedaba pegado al de arriba** con la franja
  oculta: `.ledger-strip[hidden] + .panel` recupera el margen.
- **Doble separación entre la franja y la lista de Trabajos** (gap de la
  pestaña más el margen de la franja).

## 88. Tipo de negocio fijo y funciones que se suman, 25 de octubre de 2026

**Por qué:** el usuario pasó su gimnasio a Servicios desde Configuración y, con
dos clics, se le apagaron Socios, punto de venta, Compras y Stock (los módulos
en NULL seguían al preset) y todo el catálogo pasó a llamarse "Servicios".
Pidió que el tipo no se cambie tan fácil, poder sumarle funciones a su tipo y
que nada parezca perderse ni renombrarse por tocar una opción. Decidido con él
el 25 de octubre: el cambio de tipo queda en una página aparte que dice qué
cambia; el nombre del catálogo sale de lo cargado; su base real no se toca (él
le suma las funciones que quiera).

**Backend, sin cambio de esquema:**
- `backend/perfiles.js` (nuevo): `MODULOS`, `MODULOS_INFO`, `PERFILES_RUBRO`,
  `RUBROS_PROXIMAMENTE` y `modulosDelPreset()` salieron de `server.js`, para
  que `db/index.js` también los lea.
- `organizaciones.modulos` se guarda siempre: el alta y "Agregar negocio"
  guardan los elegidos (o los del tipo si no vienen), y `PUT /api/negocio` ya
  no los pasa a NULL. **Cambiar el tipo no toca los módulos:** solo con qué
  unidad y tipo nace un producto nuevo. `''` (todos apagados) es válido.
- Migración de datos en `db/index.js`: cada `modulos IS NULL` pasa a los del
  preset de su tipo (lo que esa empresa ya veía). Re-ejecutable. La base real
  queda con `presupuestos trabajos abonos`, como la ve hoy.
- `perfilDeEmpresa()` conserva el NULL → preset por si acaso.

**Configuración** (`dominios/configuracion.js`, `index.html`):
- "Tipo de negocio y secciones" pasó a **Funciones**
  (`#/configuracion/funciones`; `#/configuracion/tipo` redirige): el tipo se ve
  fijo en una tarjeta con "Cambiar el tipo", y abajo las funciones, con la
  pastilla "Viene con {tipo}" en las que trae (`tarjetasModulos(..., tipo)`).
- **Cambiar el tipo** (`#/configuracion/cambiar-tipo`, sin ítem propio: marca
  Funciones con `menu` en `PAGINAS`): las tarjetas de tipo, un panel "Qué
  cambia" (cómo nace lo nuevo, y que nada se borra, renombra ni apaga), una
  casilla opcional para sumar las funciones del tipo nuevo que faltan, "Crear
  otro negocio" (`invocar("agregar:negocio")`, que registra `negocios.js`) y
  el botón "Cambiar a {tipo}", deshabilitado hasta elegir otro.
- `guardar()` devuelve al botón su texto propio.

**Catálogo** (`core/negocio.js`, `app.js`):
- `termino()` sale de lo cargado (`fijarTiposDelCatalogo`, que llama
  `cargarProductos()`): solo productos, "productos"; solo servicios,
  "servicios"; los dos, "productos y servicios" / "producto o servicio"; vacío,
  el del tipo. `terminoDeTipo()` da la palabra de un tipo puntual.
  `pintarTerminos()` avisa con el evento `nexo:catalogo`.
- Con los dos tipos, Productos tiene pestañas **Productos | Servicios**
  (`#/productos/productos|servicios`): la lista, el CSV, el título del panel y
  "Nuevo producto/servicio" siguen a la pestaña; en Servicios se ocultan Stock
  y Valorizado (`.solo-servicios`). Al guardar, la pestaña pasa al tipo
  guardado. El modal se titula según su tipo.
- Los planes de socio son servicios: un gimnasio con productos ve "Productos y
  servicios", con los planes en la pestaña Servicios.

**Verificación:** `npm test` 62 de 62 (el cambio de tipo mantiene los
módulos; el alta los guarda explícitos; apagar todos es válido), lint,
`verificar-migracion` 24 de 24, `regresion` 0 diferencias en 172, md5 de la
base real igual. Recorrido en Chrome con un negocio de Servicios con un
producto y un servicio: pestañas, "Nuevo servicio", sumar Socios, cambiar a
Carnicería (módulos intactos, producto nuevo en kg), en oscuro, claro y 390 px,
sin errores de consola.

## 89. Consultas (CRM), primera parte: el backend, 26 de octubre de 2026

Punto 6b del plan, pedido por el usuario el 20 de octubre ("que llegue a la
presentación"). Diseño en `docs/investigacion-crm-servicios.md` §2. Esta parte
es el backend entero, con sus tests; la pantalla es hist. §90.

**Módulo y presets** (`backend/perfiles.js`):
- `crm` entra en `MODULOS` (después de `pos`) y en `MODULOS_INFO` como
  "Consultas", con el ícono `funnel` (el sprite lo suma en §90).
- Cada preset tiene `etapas_crm` (solo las abiertas; Ganada y Perdida son el
  estado de la consulta): comercio, carnicería, verdulería y kiosco "Consulta →
  Presupuesto enviado → Negociación"; servicios "Consulta → Visita o
  relevamiento → Presupuesto enviado"; gimnasio "Consulta → Clase de prueba →
  Seguimiento". `etapasCrmDelPreset()` las da.
- Viene prendido en comercio, servicios y gimnasio. En carnicería, verdulería y
  kiosco (venta de paso) queda para sumar desde Funciones.

**Esquema** (solo tablas nuevas, en `schema.sql` con su forma final):
- `crm_etapas` (por negocio, `UNIQUE(organizacion_id, nombre)`, `orden`,
  `activa`).
- `crm_oportunidades`: cliente o contacto suelto (el nombre se guarda
  siempre), origen (clave de `ORIGENES_CRM`, sin CHECK), qué busca, valor
  estimado, responsable, etapa, `estado` abierta/ganada/perdida con motivo y
  fecha de cierre, y lo que generó (`presupuesto_id`, `venta_id`,
  `socio_id`).
- `crm_actividades`: llamada, mensaje, visita, nota o tarea, de una consulta o
  de un cliente, con `organizacion_id` propio. Una pendiente siempre tiene
  fecha; una nota nace hecha.
- **La próxima acción no se guarda:** es la actividad pendiente más próxima
  (`SELECT_OPORTUNIDAD`). De ahí sale el aviso `sin_accion` / `vencida` /
  `hoy`.

**Migración** (`db/index.js`):
- `crmYaExistia` se mide antes de `db.exec(schemaSql)`. Solo en el arranque
  que crea las tablas, a cada negocio cuyo tipo trae `crm` se le suma a
  `modulos`. Si después el admin lo apaga, no vuelve.
- `sembrarCatalogosBase` siembra las etapas del tipo (aunque el módulo esté
  apagado, así prenderlo ya trae el embudo).
- `resembrarEtapasCrm()`: la instalación nueva adopta la organización
  sembrada sin tipo (con las etapas de comercio); el registro las vuelve a
  sembrar con las del tipo elegido.
- **La base real es un gimnasio con `modulos` en NULL** (no arrancó desde
  §88; el handoff decía Servicios por error). El próximo `npm start` la deja
  en `pos crm compras stock socios` con las etapas del gimnasio. Probado sobre
  una copia: un segundo arranque con `crm` apagado no lo vuelve a prender.

**Rutas** (`server.js`, sección "Consultas (CRM)"; `permisos.js`):
- Etapas: `GET` de los dos roles; alta, `PUT` (nombre, pausar) y
  `PATCH /orden` del admin. "Ganada" y "Perdida" no se aceptan como nombre, y
  siempre queda una activa.
- Consultas: listado (`?estado`, `?cliente_id`), ficha con actividades y lo
  vinculado, alta (la rápida es nombre, teléfono y qué busca; entra en la
  primera etapa activa), edición, `PATCH /etapa`, `/cerrar` (perdida pide
  motivo), `/reabrir` y `/cliente` (crea el cliente desde el contacto o
  vincula uno; si ya hay uno con el mismo nombre, 400 con su `cliente_id`
  para ofrecer vincularlo). `GET /api/crm/origenes`.
- Actividades: alta, `PATCH` (hecha o corregir), `DELETE` y
  `GET ?cliente_id=` para la ficha del cliente.
- `GET /api/crm/para-hoy`: actividades vencidas o de hoy, consultas abiertas
  sin próxima acción, presupuestos `enviado` con fecha de hace 7 días o más
  (el presupuesto no guarda cuándo se envió) y sin vencer, y abonos que deben
  (pone los abonos al día, como `GET /api/abonos`).
- `GET /api/crm/inactivos?dias=` (90 por defecto): clientes con dos ventas o
  más y la última hace más de esos días, con si ya tienen seguimiento.
- `GET /api/crm/reporte`: por origen, embudo por etapa y motivos de pérdida;
  la conversión es sobre las cerradas.
- **Pasar a presupuesto, venta o socio no duplica circuitos:**
  `POST /api/presupuestos`, `/api/ventas` y `/api/socios` aceptan
  `crm_oportunidad_id` (`oportunidadParaVincular`, 400 si es ajena) y, en su
  transacción, `vincularOportunidad()` deja el vínculo y el cliente (nunca
  "Consumidor final"). La venta y el socio la ganan.
- **Se gana sola** al convertir su presupuesto o al terminar el trabajo que lo
  convierte (`ganarOportunidadesDelPresupuesto`).
- Auditoría sin reconstruir `auditoria`: entidad `cliente` (u
  `organizacion`, si es un contacto suelto) con `operacion_tipo`
  `oportunidad`, `actividad` o `crm_etapa`.
- `primeros-pasos` cuenta `consultas`.

**Seed:** cuatro pasos nuevos (una consulta con llamada vencida y nota, una que
pasa a cliente y a presupuesto, una perdida). `LISTADO_DE` suma
`/api/crm/oportunidades/:id`.

**Verificación:** `npm test` 63 de 63 (test nuevo de consultas: etapas del tipo,
también del gimnasio; orden y pausa; alta rápida; próxima acción y "Para hoy";
mover de etapa; presupuesto → venta la gana; perdida con motivo y números;
pasar a cliente sin duplicar; venta y socio desde la consulta; dejaron de
comprar; aislamiento). Se ajustaron dos tests que fijaban la lista de módulos.
Lint, `verificar-migracion` 24 de 24, `regresion` con 19 diferencias, todas
de lo nuevo (rutas `/api/crm/*`, `crm` en los módulos, `etapas_crm` en los
perfiles y `consultas` en primeros pasos). md5 de la base real igual
(`d4a84eef…`).

## 90. Consultas (CRM), segunda parte: la pantalla, 26 de octubre de 2026

Sigue a hist. §89 (el backend). Todo en `frontend/js/dominios/crm.js`, con el
patrón de `trabajos.js`. En el menú se llama **"Consultas"** (no "CRM": quien
nunca usó Nexo no conoce la sigla), primero en la sección Ventas.

**Vista `consultas`** (`#/consultas/embudo|hoy|dejaron|numeros`; sin subruta,
la última usada, `nexo.consultas.vista`, con try/catch):
- **Embudo:**
  - en la compu, columnas por etapa (las pausadas solo si tienen consultas),
    más Ganadas y Perdidas de los últimos 30 días;
  - arrastrar y soltar nativo de HTML5, sin librería. Soltar en una etapa la
    mueve (optimista, vuelve si el servidor no acepta); en Ganada, confirma;
    en Perdida, pide el motivo;
  - con teclado, lo mismo se hace desde la ficha (selector de etapa);
  - no se repinta a mitad de un arrastre (`repintarAlSoltar`): soltaba la
    tarjeta;
  - en el celular, una etapa por pestaña (`.segmentos` con la cuenta) y una
    lista de dos renglones por consulta.
  - Cada tarjeta muestra el próximo paso siempre con texto ("Venció hace 2
    días: …", "Sin próximo paso"); el color solo acompaña. La clase es
    `.proximo`: **`.aviso` ya era la del toast**.
  - Vacío: explica qué es una consulta y ofrece cargar la primera.
- **Para hoy:** grupos (atrasado, para hoy, consultas sin próximo paso,
  presupuestos sin respuesta si está el módulo, abonos que deben si está el
  módulo). Las actividades se marcan "Hecha" ahí; lo demás lleva a su ficha.
  La cuenta va en la pestaña.
- **Dejaron de comprar:** 60, 90 días o 6 meses, con "Anotar seguimiento".
- **Números:** este mes, 3 meses o siempre; consultas, ganadas, perdidas y "De
  las cerradas, ganadas"; barras de un color con el número al lado (por
  origen, embudo hoy y motivos de pérdida).

**Alta rápida:** un modal de tres campos (nombre, teléfono, qué busca) y "Más
datos" plegado (origen, valor, quién la sigue, email). En el celular el botón
flota abajo, a la izquierda del asistente. Al guardar abre la ficha con el foco
en el seguimiento (en el celular no: abriría el teclado).

**Ficha `consulta-detalle`:** datos con `camposFicha` (teléfono con `tel:` y
WhatsApp si el número argentino se puede armar con seguridad, `linkWhatsApp`),
selector de etapa, Editar, Ganada y Perdida (o Reabrir). "Cuando decide":
- pasarla a cliente (si ya hay uno con ese nombre, pregunta si es la misma
  persona y lo vincula);
- hacerle un presupuesto o registrar la venta: asegura el cliente y abre el
  alta de siempre con `invocar("nuevo:presupuesto" | "nuevo:venta")`,
  registrados en `app.js`, que mandan `crm_oportunidad_id` y vuelven a la
  ficha;
- hacerlo socio: `invocar("nuevo:socio")`, que registra `socios.js`: el alta
  de `#/socios/nuevo` con los datos puestos.
- El seguimiento es una línea de tiempo con un formulario arriba (llamada,
  mensaje, visita, tarea o nota; una nota no lleva fecha).

**Integraciones:**
- Ficha del cliente: panel "Consultas y seguimiento"
  (`pintar:crmDelCliente`) con sus consultas, su seguimiento y "Anotar
  seguimiento" (modal `modalSeguimiento`, el mismo de Dejaron de comprar).
- Resumen: panel "Para hoy" con los 5 primeros y "Ver todo"; no se ve si no hay
  nada. Lo invoca el handler de dashboard de `primeros-pasos.js`, porque
  `alEntrarEnVista` guarda uno solo por vista.
- Primeros pasos: "Anotá tu primera consulta".
- Configuración: página "Etapas de las consultas" (admin, `modulo: "crm"`):
  agregar, renombrar, subir y bajar, pausar y activar.
- Íconos nuevos de `lucide-static` 1.57.0: `funnel`, `phone` y
  `message-circle`.

**Verificación:** `npm test` 63 de 63, lint, `regresion` 0 diferencias en 196,
`verificar-migracion` 24 de 24, md5 de la base real igual. En Chrome
(playwright-core, base sembrada en el scratchpad) a 1440 y 390 px, oscuro y
claro:
- embudo y arrastre;
- alta rápida → ficha;
- "Para hoy" en la vista y en el Resumen;
- Números y página de etapas;
- pasar a presupuesto (queda vinculado) y a venta (la gana);
- seguimiento desde la ficha del cliente y Dejaron de comprar;
- el empleado ve el embudo y no las etapas;
- XSS sembrado en nombre, teléfono, qué busca, actividad, etapa y motivo, sin
  ejecutar (no se corrió el control contra el commit anterior);
- sin errores de consola y sin scroll horizontal a 390 px.

Arreglado con las capturas:
- nombres cortados en las tarjetas;
- el botón flotante tapado por el del asistente;
- el selector de etapa pisado en el celular;
- la cuenta de la pestaña ilegible en claro.

El arrastre de Playwright falló dos veces por tiempos de la prueba, cuando se
arrastra apenas carga la página; después anduvo siempre.

## 91. El CRM junto con los clientes, en una sola página, 26 de octubre de 2026

Pedido del usuario después de ver §90: "en el panel se tiene que llamar CRM y
tiene que estar combinado con la base de datos de clientes, tiene que estar
todo en la misma página".

- **Una sola vista:** la de `clientes`. Las pestañas de Consultas pasaron
  adentro: `#/clientes/lista|consultas|hoy|dejaron|numeros`. "Clientes" es la
  lista de siempre (la pinta `app.js`) y va primero; sin subruta abre la
  última usada (`nexo.crm.vista`). El embudo pasó a llamarse "Consultas".
- **El menú tiene un solo ítem**, en el lugar de Clientes (Maestros). Dice
  "CRM" con el módulo prendido y "Clientes" sin él (`.con-crm` /
  `.sin-crm`), y el título lo mismo (`tituloConModulo` en
  `core/router.js`, y `entrarAlCrm` lo corrige cuando el negocio llega
  después). Sin el módulo no hay pestañas: solo la lista.
- "Nueva consulta" no se ve en la pestaña Clientes, que tiene "Nuevo cliente".
- Los links viejos (`#/consultas`, `#/consultas/hoy`…) redirigen
  (`VISTAS_RENOMBRADAS`), y la dirección queda en la nueva.
- La ficha de una consulta marca CRM en el menú; "Volver al CRM" vuelve a
  Consultas.
- **La vista `consultas` ya no existe.** No hay cambios en el backend ni en
  el módulo: sigue siendo `crm`.

**Verificación:** `npm test` 63 de 63, lint. En Chrome (servidor de prueba):
- menú y título "CRM", la lista primero y sin ítem aparte;
- la pestaña Consultas, el link viejo y "Volver al CRM";
- con el módulo apagado, "Clientes" sin pestañas;
- a 390 px, sin scroll horizontal y sin errores de consola.

## 92. Mi cuenta en Configuración, y la demo para el profe, 26 de octubre de 2026

**Demo.** Pedido del usuario: "creá un comercio y un gym de prueba y usá la
mayoría de las funciones, para mostrarle a mi profe". Cuenta nueva en la base
real (`prueba` / `prueba1234`) con "Comercio prueba" y "Gym prueba", cargada
toda por la API con un script del scratchpad: primero corrió limpio contra una
base temporal y después, con respaldo previo (`nexo-20261026-124111.db`),
contra el servidor real. Los negocios #1 y #2 del usuario no se tocaron.
Trampas de la API que aparecieron: el alta de producto devuelve solo el `id`;
el punto de venta no acepta cobrar de más (el vuelto lo calcula la pantalla);
los orígenes del CRM son `whatsapp|instagram|local|conocido|web|otro`.

**Mi cuenta.** El usuario no encontraba cómo cerrar sesión (estaba en un
modal que abría el círculo de perfil) y pidió: "la configuración de cuenta
debería estar en configuración también".
- Página nueva `#/configuracion/cuenta`, en el grupo "Tu cuenta" junto con
  Apariencia, para los dos roles: nombre y rol, cambiar la contraseña y una
  tarjeta aparte para cerrar sesión.
- El círculo de perfil ahora lleva a esa página. **El modal `#modalPerfil` ya
  no existe:** un solo lugar, y configuración en páginas, no en modales.
- `dominios/perfil.js` registra `pintar:cuenta`, que `configuracion.js` llama
  al entrar. Sin cambios en el backend.

**Verificación:** `npm test` 63 de 63, lint. En Chrome contra el servidor real
con la cuenta de demo: el círculo abre Mi cuenta, la contraseña equivocada
muestra el error en la página, Cerrar sesión vuelve al login, el empleado ve
solo Mi cuenta y Apariencia, y a 390 px se ve bien.

## 93. La auditoría, también para el empleado, 26 de octubre de 2026

Pendiente chico del handoff: filtrar `valor_anterior`/`valor_nuevo` de
`GET /api/auditoria` por campos sensibles. Como el endpoint era solo admin, el
filtro no habría cambiado nada; el usuario eligió abrirla al empleado.
- `server.js`: el endpoint ya no lleva `soloAdmin`. Para el empleado, cada
  JSON de valor se parsea y pasa por `podarSensibles` (el filtro de `res.json`
  no entra en un string); si queda vacío o roto, va `null`. Las filas de
  `compra`, `pago` y `devolucion_proveedor` no le llegan
  (`ENTIDADES_AUDITORIA_SOLO_ADMIN`): ahí `precio_unitario` es un costo y el
  filtro por nombre de clave no lo distingue. Ningún `detalle` arma texto con
  costos, así que no se tocó.
- `permisos.js`: `'ambos'`.
- Frontend: la sección "Administración" del menú dejó de ser
  `nav-seccion-admin`; al empleado se le ocultan Papelera y Configuración una
  por una y ve solo Auditoría. `auditoria` salió de `VISTAS_SOLO_ADMIN` y
  `cargarAuditoria` ya no corta por rol. El filtro "Entidad" sigue ofreciendo
  Compra y Pago (se arma antes de conocer el rol): para el empleado filtran a
  vacío.

**Verificación:** `npm test` 64 de 64 (test nuevo en `api.test.js`: margen
objetivo podado para el empleado y visible para el admin, sin filas de
compras), lint. No se probó en el navegador.

## 94. PWA: se instala y abre sin conexión, 26 de octubre de 2026

Etapa 7 del plan (B2, CLAUDE.md §31), junto con 7b ("celular de verdad"). La
investigación de 7b quedó en `docs/investigacion-celular.md` (commit aparte);
esta etapa es solo la PWA.

**Qué se hizo:**
- `frontend/manifest.webmanifest`: nombre, `start_url` "/", standalone, negro
  de marca. Los íconos (`frontend/img/app/`: 192, 512, 512 maskable y el 180 de
  Apple) se generaron una sola vez con `playwright-core` en el scratchpad: el
  logo blanco de `assets/logo/01-icono/` centrado sobre negro (72 % del lado, y
  56 % el maskable, dentro de su zona segura). No se versiona el script ni se
  suma dependencia.
- `frontend/sw.js`, en la raíz para que su alcance sea "/":
  - **primero la red, y lo guardado solo si falla**, para el shell y para los
    `GET /api`. No hay build step que versione los archivos: un caché "primero
    lo guardado" serviría código viejo;
  - la API espera hasta 6 s antes de mostrar lo guardado. El shell no tiene
    tope: un `index.html` viejo con un `app.js` nuevo rompería la pantalla;
  - `PRECACHE` lista todo `frontend/js`, `styles.css`, Inter, el sprite, los
    logos y los íconos. Satoshi va en `OPCIONALES`, que tolera que falte. Los
    vendor del PDF se guardan al usarse;
  - en `DATOS`, solo las respuestas 200, con la clave más el negocio
    (`__negocio`, de `X-Nexo-Negocio`) y la cabecera `X-Nexo-Guardado-En`;
  - nunca `/api/auth/*`, salvo `estado`, que hace falta para arrancar sin red.
- `js/sesion.js`:
  - registra el service worker, solo en contexto seguro (localhost o https);
  - **borra lo guardado de la API** (`nexo-datos-*`) en el login, el logout y
    `cerrarSesionLocal` (401 o arranque sin sesión);
  - después de un login vuelve a pedir `/api/auth/estado` con `fetchOriginal`,
    para que el próximo arranque sin conexión tenga la sesión, con la misma
    clave que usa el arranque;
  - aviso naranja arriba (`#avisoConexion`): "Sin conexión. Estás viendo lo que
    se cargó a las 14:55; no se puede guardar nada hasta que vuelva". Lo
    dispara una respuesta con `X-Nexo-Guardado-En`, un fetch a `/api/` que
    falla o el evento `offline`. Lo saca una respuesta del servidor o el evento
    `online`;
  - sin conexión y sin nada guardado, el login lo explica en vez de "No se
    pudo conectar con el servidor";
  - guarda el `beforeinstallprompt` en `window.nexoPedidoInstalar`, porque
    llega antes que `app.js`.
- Configuración → Apariencia: tarjeta "Nexo como app".
  - Con el pedido del navegador, botón "Instalar Nexo". En iOS, los pasos;
    instalada, "ya está instalada". Sin https, lo explica.
  - En el menú de Configuración, Apariencia pasó a decir "Tema e instalar como
    app".
- **CSP** (`server.js`): `script-src 'self'`, sin inline; `style-src` con
  `'unsafe-inline'`, porque las plantillas arman `style=""`; `img-src` con
  `data:` y `blob:`; `frame-ancestors 'none'`.
  - El script inline del `<head>` salió a `js/arranque.js`, que sigue siendo
    bloqueante y corre antes de pintar.
  - `viewport-fit=cover` en el viewport, para los safe areas de la fase
    siguiente.
- Tests y lint:
  - `api.test.js`: la CSP, y el manifest y `sw.js` con su tipo;
  - `frontend-modulos.test.js`, test nuevo: `PRECACHE` (más `OPCIONALES`)
    contiene todo `frontend/js` y todo `src`/`href` local de `index.html` y
    `url()` de `styles.css`, y todo lo de `PRECACHE` existe en disco. Mutado
    (sacando dos entradas), falla y las nombra;
  - `scripts/lint.mjs` lintea `frontend/sw.js` (`SUELTOS`).
  - **`eslint.config.mjs` no se pudo tocar:** el hook `config-protection` del
    plugin ecc lo bloquea. Por eso `sw.js` declara sus globales con
    `/* global */`, y `arranque.js` se lintea como módulo, sin diferencia
    para ese código.

**Ojo para la prueba de XSS en el navegador** (procedimiento 7 del handoff):
con la CSP, un `onerror=` sembrado ya no corre aunque el HTML esté sin
escapar. Para probar el escape hay que crear el contexto con
`bypassCSP: true`; si no, la prueba no prueba nada.

**Verificación:** `npm test` 66 de 66, lint (56 archivos), `npm run regresion`
con 196 comparaciones y 0 distintas. La base real no cambió (md5 `e8df3009…`).
En Chrome a 390 px, contra una base sembrada:
- el service worker queda activo y controla la página; el manifest no tiene
  errores, y el único error de instalabilidad es "in-incognito", propio del
  contexto de prueba;
- sin conexión: abre con la sesión, Productos sale de lo guardado, el aviso
  tiene la hora, y un POST falla sin escribir. Con conexión, el aviso se va;
- el logout deja solo `nexo-shell-v1`;
- el empleado: 21 respuestas guardadas, ninguna con costos. Control: con el
  admin hay 5 que sí los tienen;
- cero violaciones de CSP en las 24 vistas del menú, y el PDF de una factura
  se descarga con la CSP puesta.

**Lo que muestra la captura sin conexión:** Productos, en el celular, con un
producto por pantalla. Es el problema de 7b, que se resuelve en las fases
siguientes.

## 95. Celular, fase 2: barra de abajo y formularios a pantalla completa, 26 de octubre de 2026

Primera fase de 7b (`docs/investigacion-celular.md`). Todo es del frontend y
solo cambia hasta 860 px: en la compu no se ve nada nuevo.

**Qué se hizo:**
- **Barra de abajo** (`core/barra-inferior.js`, `#barraInferior`):
  - cuatro destinos y "Más". Los destinos son los primeros de `PRIORIDAD`
    (`dashboard, ingreso, socios, pos, trabajos, ventas, productos, clientes`)
    que el menú lateral muestra (`checkVisibility`): los módulos y el rol ya
    se resuelven ahí, sin `if (rubro)`;
  - según el negocio queda así:
    - comercio: Resumen · Vender · Ventas · Catálogo;
    - gimnasio: Resumen · Ingreso · Socios · Vender;
    - servicios: Resumen · Trabajos · Ventas · Catálogo (o Servicios);
    - el empleado no tiene Resumen: Vender · Ventas · Catálogo · CRM;
  - textos cortos: `pos` dice "Vender", y el catálogo dice "Catálogo" cuando
    el nombre tiene más de una palabra;
  - tocar un destino es hacer `click()` en su ítem del menú: navega igual,
    con su subruta;
  - un observer repinta cuando cambian los módulos, el rol o la sección activa
    (el router marca `.is-active` en el menú). **Solo se rearma si cambian los
    destinos;** lo activo se marca aparte, porque si no "Más" perdía el foco
    al abrir el cajón.
- **"Más" abre el cajón de siempre**, y la hamburguesa ya no se ve en el
  celular.
  - Tocar afuera del cajón lo cierra, y ese toque no hace nada más (click en
    captura). No cuentan como afuera el menú de negocios (vive en el `<body>`)
    ni los modales.
  - Escape devuelve el foco a "Más".
- **El asistente sube a la topbar**, arriba a la derecha (40 px), y su panel
  ocupa la pantalla. Libera la esquina de abajo.
- **Topbar de un renglón:** sin la fecha. `--topbar-h` es
  `52px + safe area`. En las fichas, la flecha `#btnVolver` hace `click()` en
  el "Volver a …" de la ficha abierta (cada una sabe a qué pestaña volver), y
  ese botón interno se oculta en el celular.
- **Modales a pantalla completa:** la cabecera fija arriba y el botón de
  guardar fijo abajo (todos los formularios terminan en `.btn-full`; se
  revisaron los 34). `#modalConfirmar` va como hoja desde abajo, con los dos
  botones de 48 px.
  - Modales en z-index 52, por encima del asistente de la topbar (51).
- **El "atrás" de Android cierra el modal** (`core/ui.js`):
  - al abrir, en el celular, un `pushState` con la misma dirección (no cambia
    el hash, así que el router no se entera);
  - el `popstate` cierra el último modal abierto;
  - cerrar con la X hace `history.back()`. Como es asíncrono, un modal que se
    abre mientras tanto espera para sumar su entrada (`esperandoAtras`): si
    no, ese back se la llevaría.
  - `#modalConfirmar` queda afuera, como en el observer.
- **`--abajo`** (64 px + safe area; 0 en la compu): lo usan la barra del POS,
  la de selección, los avisos, el alta rápida del CRM y el padding de `.main`.
  La barra del POS y los avisos ya no dejan el lugar del asistente.
- **`--control-h: 44px`** en el celular, y los inputs de 16 px (iOS hacía
  zoom con 14).

**Verificación:** `npm test` 66 de 66, lint (57 archivos). La base real no
cambió (md5 `e8df3009…`). En Chrome a 390 px (táctil), contra la base
sembrada:
- la barra por negocio (cambiando los módulos con `PUT /api/negocio` y
  restaurándolos) y para el empleado, como arriba;
- "Más" abre (`aria-expanded`), y tocar afuera cierra sin cambiar el hash;
- la ficha de un producto con la flecha, que vuelve a la lista;
- "Nuevo cliente" a 390 × 844, y el "atrás" lo cierra sin salir de
  `#/clientes/lista`;
- cerrar con la X y después "atrás" lleva a la vista anterior (no queda una
  entrada muerta);
- la hoja de confirmar;
- en la compu (1440), ni la barra ni la hamburguesa.
- Sin errores de consola.

## 96. Celular, fase 3: listas de dos líneas, 26 de octubre de 2026

El pedido que abrió 7b: en el celular cada fila de tabla era una tarjeta con
una línea por columna (Productos, 11 líneas por producto, y uno o dos por
pantalla). Ahora cada fila son dos líneas de 64 px, como en Shopify o Tienda
Nube: **unos 10 productos por pantalla.**

**Cómo se hizo (sin un segundo render):** el mismo `<tr>`, con marcas en sus
celdas.
- La tabla lleva `lista-movil` en `index.html`, y cada celda lleva una marca:
  - `m-titulo`: lo que nombra la fila;
  - `m-valor`: el importe, a la derecha;
  - `m-estado`: el estado, abajo a la derecha;
  - `m-accion`: un botón a la derecha, para las listas sin ficha.
- **`celdaMovil(...partes)`** (`core/formato.js`) suma una `<td class="m-sub">`
  con la segunda línea: las partes unidas por " · ", sin las vacías, cada una
  escapada. Una parte puede ser `[prefijo, valor]` ("vence" y la fecha): sale
  solo si hay valor.
  - **En la compu `m-sub` no se ve:** se controló que en las 16 listas las
    celdas visibles por fila sean las mismas columnas del encabezado.
- En el celular, la fila es una grilla `"titulo valor accion" / "sub estado
  accion"`, y lo que no está marcado se oculta. Solo cambian las filas con
  `m-titulo`: la vacía, la de "cargando" y la de detalle de Cuentas corrientes
  quedan como antes.
- La selección múltiple y su "Seleccionar todo" no se ven en esas tablas
  (como en Polaris), y el precio editable de Productos lleva a la ficha
  (`pointer-events: none`).
- `.solo-celular`: lo que en la compu ya tiene su columna y en el celular va
  pegado al título (el N° de Auditoría).
- `backend/test/plantillas-html.js`: `celdaMovil` está en `FUNCIONES_SEGURAS`
  (escapa lo que recibe). Una parte armada con un template anidado
  (`` `vence ${fechaAR(x)}` ``) el chequeo la ve como HTML aparte: por eso
  existe la forma `[prefijo, valor]`.

**Las 21 listas migradas, con lo que muestra cada una (título · segunda
línea · estado):**

| Lista | Título | Segunda línea | Importe | Estado |
|---|---|---|---|---|
| Productos | nombre | SKU · categoría · stock (o "Servicio") | precio | solo si está inactivo |
| Ventas | cliente | N° · fecha · productos | total | cobro |
| Presupuestos | cliente | N° · fecha · vence | total | estado |
| Compras | proveedor | N° · fecha · envío | total | pago |
| Clientes | nombre | contacto · compras · "debe $" | total gastado | — |
| Proveedores | nombre | contacto · compras · "le debés $" | total comprado | — |
| Stock | producto | depósito · total si difiere | stock | estado, "Ajustar" |
| Mov. de stock | producto | fecha · origen · depósito · nota | cantidad | — |
| Facturas | cliente | comprobante · tipo · fecha | importe | cobro |
| Devoluciones (las dos) | cliente o proveedor | N° · fecha · productos | total | plata |
| Caja: cuentas | cuenta | tipo · saldo inicial | saldo | lápiz |
| Caja: movimientos | concepto | fecha · cuenta | importe | — |
| Cuentas corrientes (las dos) | nombre | operaciones · vence | deuda | tramo |
| Gastos | categoría | fecha · descripción · cuenta | importe | tipo, botones |
| Auditoría | entidad #N° | fecha y hora · usuario · detalle | — | acción |
| Socios | nombre | N° · planes · cuota | deuda, si hay | situación |
| Trabajos | trabajo | cuándo · atrasado · cliente · responsable | total, si hay | estado |
| Abonos | cliente | servicio · cada cuánto · debe o próxima | precio | estado |
| CRM, Dejaron de comprar | cliente | hace N días · compras · teléfono | total comprado | seguimiento |

**Quedan como tarjeta, a propósito:** Usuarios (cuatro botones por fila, en una
página de Configuración), las tablas de las fichas (renglones de una venta,
historiales) y los catálogos de Configuración. Si alguna se usa en el celular,
se migra igual.

**Verificación:** `npm test` 66 de 66, lint (57 archivos). La base real no
cambió (md5 `e8df3009…`). En Chrome:
- **a 390 px**, con 33 productos: filas de 64 px y diez a la vista. Las otras
  12 listas, con capturas: cada una con su primera fila de 64 px (67 en
  Cuentas corrientes);
- **XSS:** un producto y una categoría con `<img onerror>` en el nombre, el
  SKU y la categoría, con `bypassCSP: true`. `window.__xss` no se escribió, y
  el texto se ve escapado en las dos líneas;
- **a 1440 px:** las celdas visibles por fila son igual a las columnas del
  encabezado en las 16 listas;
- sin errores de consola.

## 97. Celular, fase 4: filtros en una hoja, "Nuevo" flotante y pasada visual, 26 de octubre de 2026

Última fase de 7b. Con esta, el celular queda como se diseñó en
`docs/investigacion-celular.md`.

**Qué se hizo:**
- **Filtros** (`core/filtros.js`, `styles.css`):
  - en el celular, la ventanita de "Filtrar" es una hoja desde abajo, con
    velo, opciones de 48 px y campos de 44. El `left` que le pone el JS para
    la compu se pisa con `!important`;
  - los chips van en una fila que se desliza;
  - tocar el velo solo cierra la hoja: un listener en captura, que solo actúa
    en el celular. Antes, ese toque habría abierto la fila de atrás.
- **"Nuevo" flotante:** el botón primario de 13 vistas lleva `btn-nuevo`
  (presupuestos, trabajos con su agenda, abonos, socios, productos, clientes,
  proveedores, caja, gastos, ventas, compras y facturas).
  - En el celular es una píldora de 56 px con su texto ("+ Nuevo producto"),
    arriba de la barra de abajo. Es el mismo botón, que se muda.
  - Se esconde mientras está la barra de selección.
  - Usuarios no lo lleva: es una página de Configuración.
- **Renglones de venta, compra y presupuesto** (`.item-row`): el producto va
  en su línea y abajo la cantidad, el precio, el subtotal y quitar. Antes, a
  390 px cada campo quedaba de tres letras.
- **Bug de antes, que ahora se veía:** el cajón cerrado, justo fuera de la
  pantalla, derramaba su sombra sobre el borde izquierdo. Con los formularios
  a pantalla completa se veía como un degradé sobre el botón de guardar (y en
  claro, a lo largo de todo el formulario). Ahora la sombra va solo con el
  cajón abierto.

**Verificación:** `npm test` 66 de 66, lint. La base real no cambió (md5
`e8df3009…`). En Chrome a 390 px, en oscuro y en claro:
- un solo flotante por vista en las 12 recorridas (Stock y Cuentas
  corrientes no tienen alta, y no lo llevan);
- la hoja de filtros (elegir campo y editor), y tocar el velo la cierra sin
  cambiar de vista;
- al final de Productos, la última fila termina arriba del botón (675 contra
  708 px);
- el formulario de venta con sus renglones en dos líneas, y el botón sin el
  degradé (y en la compu, igual que antes);
- POS, CRM con la pestaña Consultas y el Resumen;
- sin errores de consola.

**Para después** (anotado en `docs/investigacion-celular.md` §4): encabezados
por día en Ventas y Caja, acciones deslizando la fila, Web Push.

## 98. Planes de Nexo en el backend, 27 de octubre de 2026

Primera fase de la etapa 8 (landing, planes y hosting). Plan completo de la
etapa: fases §98 a §101.

**Decisiones del usuario (27 de octubre):**
- **Planes:** Gratis, Emprendedor a $ 19.900 por mes y Pro a $ 34.900 por
  mes.
- **Gratis, versión generosa:** 1 usuario y 1 negocio, 100 productos y 300
  ventas por mes, con "Hecho con Nexo" en los comprobantes.
- **Hosting y dominio:** Oracle Cloud Always Free con un subdominio gratis de
  DuckDNS, porque "nexo" no está libre.
- **Contacto:** por ahora la consulta de la landing cae en el CRM de un
  negocio suyo dentro de Nexo. WhatsApp se suma cuando tenga un número
  propio para Nexo.

**Decidido sin el usuario** (default del mercado, a revisar):
- **Prueba de 14 días** de un plan pago, que al vencer cae a Gratis sin
  borrar nada.
- **Topes:** Emprendedor tiene 3 usuarios; solo Pro suma negocios, y el
  negocio nuevo hereda su plan.
- **Qué cuenta para el tope:**
  - los productos activos, contando los servicios;
  - las ventas del mes que no estén anuladas. Las cuotas de socios y abonos
    no cuentan ni se frenan.
- **Todos los planes tienen todas las funciones:** los separan solo los
  topes, nunca un módulo apagado.

**Qué se hizo:**
- **`backend/planes.js`:**
  - `PLANES` es la única fuente de precios, textos y topes;
  - `DIAS_PRUEBA` es la duración de la prueba;
  - `planEfectivo()` devuelve Gratis cuando el plan venció;
  - `planQuePermite()` nombra el plan que sigue.
- **Esquema:**
  - `organizaciones.plan` (`NOT NULL DEFAULT 'gratis'`) y `plan_vence`
    (AAAA-MM-DD o NULL), en `schema.sql` y como `ALTER` en `db/index.js`;
  - los negocios que ya existían pasan a Pro sin vencimiento, solo en el
    arranque que suma la columna.
- **`server.js`:**
  - `GET /api/auth/planes` es pública y trae los planes y el WhatsApp de
    `NEXO_CONTACTO_WHATSAPP`, si existe;
  - el registro acepta `plan`, y uno pago arranca la prueba;
  - `GET /api/negocio` suma `plan` (el que rige, el vencimiento, los días que
    quedan, el que venció y el uso contra cada tope) y `planes`.
- **El tope es `exigirLugarEnPlan()`:** responde 403
  `{ error, codigo: 'limite_plan' }` con `ErrorPlan`, un `ErrorBulk`, así los
  catch que ya traducían `ErrorBulk` lo devuelven. Corre en:
  - **productos:** el alta, la reactivación (también en lote), los que crea
    una compra por nombre (después del INSERT, y el throw deshace la compra)
    y el servicio de un plan de socios;
  - **usuarios:** el alta y la reactivación;
  - **negocios:** "Agregar negocio";
  - **ventas:** las ventas, el punto de venta, un presupuesto convertido, un
    trabajo terminado, las ventas del asistente y la venta anulada que se
    restaura.
- **`npm run plan` (`scripts/plan.mjs`):**
  - lista los negocios, muestra uno con `--ver` y cambia el plan con
    `--negocio N --plan X [--hasta AAAA-MM-DD]`;
  - abre la base directo, sin correr migraciones ni respaldo con el servidor
    andando, y audita el cambio con actor `sistema`;
  - es la administración de la plataforma hasta que haya un panel.
- **Tests:**
  - `registrarEmpresa()` del arnés da de alta en Pro, para que los topes no
    se crucen con lo que prueba cada test;
  - `backend/test/planes.test.js` (con su propio servidor) llena un Gratis
    hasta cada tope, vence una prueba con el script y controla que
    `PUT /api/negocio` ignore el plan.

**Verificación:**
- `npm test`: 70 de 70, y lint sin problemas.
- `verificar-migracion`: 24 de 24 casos.
- Una copia de la base real migrada deja sus 4 negocios en Pro sin
  vencimiento.
- `regresion`: 4 diferencias, todas esperadas (la ruta nueva y los campos
  `plan` y `planes`).
- La base real no cambió (md5 `602d45b8…`).

## 99. El plan dentro de la app, 27 de octubre de 2026

Segunda fase de la etapa 8 (ver §98).

**Qué se hizo:**
- **Configuración → "Plan de Nexo"** (`dominios/plan.js`, solo admin):
  - el plan actual, con su estado (hasta cuándo es la prueba, o "terminó, seguís
    en Gratis");
  - barras de uso de productos, ventas del mes y usuarios: naranja desde el
    80% y rojo en el tope. Los usuarios llenos no se colorean, porque Gratis es
    de una persona;
  - los tres planes lado a lado (apilados en el celular), con lo que suma cada
    uno y lo que viene "muy pronto";
  - **"Quiero este plan"** abre en la misma página un pedido con el teléfono o
    el mail. Va a `POST /api/publico/consulta`, y si hay WhatsApp configurado,
    también un enlace a `wa.me` con el texto armado. El plan no cambia solo: lo
    activa quien vende Nexo con `npm run plan`.
- **`POST /api/publico/consulta`** (pública, adelantada de la Fase 3):
  - crea la consulta en el CRM del negocio `NEXO_NEGOCIO_VENTAS`, en su
    primera etapa, con origen "La web", y "qué busca" dice el plan y el
    negocio;
  - suma una tarea para hoy con el mensaje, así sale en "Para hoy";
  - tiene un tope de 5 por hora por IP, un campo trampa (`sitio`) y largos
    máximos. Sin la variable responde 503;
  - se audita con actor `sistema` en ese negocio.
- **Aviso en el Resumen** (solo admin): cuando la prueba termina en 3 días o
  menos, o cuando productos o ventas pasan el 80% del tope. Lleva "Ver los
  planes".
- **El tope en un toast:** `manejarError` de `core/ui.js` ve
  `codigo: 'limite_plan'` y, al admin, le suma "Ver los planes".
  - `avisar()` acepta una acción `{ texto, href }`, y ese aviso dura 8 s.
  - Tocar el enlace cierra el modal abierto en la compu; en el celular lo
    cierra el `popstate`.
- **"Hecho con Nexo · gestión para tu negocio"** al pie de los comprobantes de
  un negocio Gratis (`plan.marca`, `core/comprobante.js`).
- **Tipo "Emprendimiento"**, primero en `PERFILES_RUBRO`:
  - unidad `unidad`, tipo `producto`, sin módulos opcionales e ícono `sprout`;
  - es para quien vende por su cuenta.
- **El alta guiada lee `?plan=`** (`/?plan=pro#/crear-cuenta`, y desde la
  Fase 3 `/app?plan=pro…`):
  - lo confirma contra `/api/auth/planes` y muestra "Plan Pro: lo probás 14
    días gratis, sin tarjeta…" en el primer paso;
  - lo manda al registro.
- **Íconos nuevos** en el sprite: `sprout` y `gem`.

**Bug de base que apareció:** `alEntrarEnVista()` guardaba un solo handler
por vista, y el de primeros pasos pisaba al del aviso del plan. Ahora guarda
una lista y corren en orden. Solo el Resumen tiene dos.

**Verificación:**
- `npm test`: 71 de 71, y lint sin problemas.
- La base real no cambió (md5 `602d45b8…`).
- En Chrome, con base nueva y `NEXO_NEGOCIO_VENTAS=1`, en la compu y a 390 px,
  en oscuro y en claro:
  - el alta con `?plan=pro` muestra la prueba;
  - con 85 productos, el Resumen avisa "Vas por 85 de 100";
  - la página del plan y el pedido de Emprendedor: la consulta aparece en el
    CRM del negocio de ventas;
  - el producto 101 desde el modal da el toast con "Ver los planes", que lleva
    a la página y cierra el modal;
  - el comprobante de Gratis lleva la marca.
  - El único error de consola es el 403 del tope, el esperado.

## 100. La landing en "/" y la app en "/app", 27 de octubre de 2026

Tercera fase de la etapa 8 (ver §98). La inspiración que pasó el usuario fue
escalafy.com. De ahí se tomaron cinco cosas, adaptadas al negro con acento
azul de Nexo y sin el rosa:
- el título grande con la segunda línea en color;
- las preguntas en chips;
- los bloques alternados de texto y pantalla;
- los planes en tarjetas con "Recomendado";
- un cierre con llamada a la acción.

**Qué se hizo:**
- **Rutas (`server.js`, antes de lo estático, que pasa a `index: false`):**
  - `/` da la landing sin sesión, y con sesión, 302 a `/app`. Así, una PWA
    instalada antes, con `start_url "/"`, sigue entrando;
  - `/app` es `index.html`, y `/index.html` da 301 a `/app`;
  - `/privacidad`;
  - `/robots.txt` deja afuera `/app` y `/api/`;
  - `/sitemap.xml` lista `/` y `/privacidad`.
- **La landing es una plantilla:**
  - `urlPublica()` sale de `NEXO_URL_PUBLICA`, o del pedido si no está;
  - llena el canónico, Open Graph y el JSON-LD (`SoftwareApplication`), con
    los precios armados desde `PLANES`;
  - en producción el archivo se lee una vez, y en desarrollo en cada pedido.
- **La app en `/app`:**
  - las rutas relativas de `index.html`, `sesion.js` (`app.js`) y
    `comprobante.js` (vendor) pasan a absolutas, porque `/app/` las rompía;
  - en el manifest, `start_url` pasa a `/app`, y `id` y `scope` quedan en
    `/`.
- **Service worker v2:**
  - `PRECACHE` lleva `/app` en vez de `/` y `/index.html`;
  - solo la navegación a `/app` se guarda, con la clave `/app`;
  - la landing y privacidad no se interceptan. Antes, cualquier navegación
    se guardaba como la app, así que la landing la habría pisado.
- **Archivos nuevos:** `landing.html`, `privacidad.html`, `css/landing.css`,
  `js/landing.js` e `img/landing/*.webp`.
  - `landing.js` es el único script, sin inline. Importa `esc` y `icono` de
    `core/`, con `modulepreload`.
  - `landing.js` queda fuera de la regla de que todo `frontend/js` vaya en
    `PRECACHE` (`frontend-modulos.test.js`).
- **Secciones:**
  - la portada, con el Resumen en un marco de compu y el celular encimado;
  - "Cómo funciona", en seis bloques: vender, stock y costos, clientes, la
    plata, el asistente (un ejemplo armado en HTML) y el celular;
  - "Y además";
  - los tipos de negocio, desde `/api/auth/tipos-negocio`, con los "Muy
    pronto" como tarjetas apagadas;
  - los planes, desde `/api/auth/planes`. Emprendedor va "Recomendado" (una
    opinión de la landing, en `PLAN_RECOMENDADO`), y el botón lleva a
    `/app?plan=X#/crear-cuenta`;
  - las preguntas frecuentes, con `<details>`. Dicen que ARCA "todavía no" y
    que el plan se activa contactándonos;
  - el contacto, contra `POST /api/publico/consulta`, con el campo trampa y
    WhatsApp si está configurado;
  - el cierre.
- **Las capturas** salen de una copia de la base real, con la demo `prueba`:
  - el negocio se renombró a "Tienda Alma", solo en la copia;
  - las de la compu son de 1280×880 a 2x, con la barra lateral colapsada,
    para que se lean;
  - la portada es de 1440×900 a 2x, y las del celular, de 390×844 a 2x;
  - todas pesan menos de 110 KB.
- **`privacidad.html` es un borrador para que el equipo lo revise.** Dice lo
  que Nexo hace de verdad:
  - la cookie de sesión y lo que queda en el navegador;
  - que al asistente se le mandan a Gemini el texto y los nombres de
    productos, cuentas y categorías, nada más;
  - los respaldos, y que la IP se usa solo en memoria;
  - la Ley 25.326 y la AAIP.

**Lo que falló en el camino:**
- La plantilla citaba `%URL%` y `%JSONLD%` en un comentario, y `.replace` de
  `%JSONLD%` llenó el comentario en vez del `<script>`. Lo agarró
  `landing.test.js`. Ahora el comentario no los nombra, y se usa
  `replaceAll`.
- El chequeo de `esc()` marcó `plan.clave` dentro de un `href` (solo tenía
  `encodeURIComponent`). Va con los dos.
- En chrome-devtools, la primera captura después de cambiar la emulación a
  veces da timeout o sale ampliada. Se repite la captura.

**Verificación:**
- `npm test`: 77 de 77, con el nuevo `landing.test.js` (6 tests), y lint sin
  problemas.
- `regresion`: 0 diferencias. Solo compara `/api`, que no cambió.
- En Chrome, en la compu y a 390 px:
  - sin errores de consola ni de CSP;
  - un plan lleva al alta con "Plan Pro: lo probás 14 días…";
  - el formulario deja la consulta en "Para hoy" del negocio de ventas;
  - con sesión, `/` va a `/app`;
  - el caché `nexo-shell-v2` tiene `/app` y no tiene la landing.
- Lighthouse en el celular: 100 en accesibilidad, buenas prácticas y SEO.
- La traza con 4x de CPU y Fast 4G da un LCP de 2,1 s (era 2,7 s antes del
  `modulepreload`). Falta la compresión, que la pone Caddy en la Fase 4.
- La base real no la tocó esta sesión: su md5 cambia porque el servidor del
  usuario en el puerto 3000 renueva sesiones.

## 101. Login, mail, términos y edad: investigación y el módulo de mail, 27 de octubre de 2026

El usuario vio la landing ("quedó perfecta") y, antes de seguir con cosas
grandes, pidió revisar la seguridad del login, la aceptación de términos y
privacidad, la edad y la recuperación por mail. Pasa a ser la etapa 8b, antes
de la Fase 4 de publicación: sin esto la landing no se abre al público.

**Investigación:** `docs/investigacion-login-legal.md`. Lo legal (Ley 25.326,
inscripción en la AAIP, botones de arrepentimiento y de baja, edad según el
Código Civil), qué le falta al login, las opciones de mail y el plan por
fases. El hallazgo más grave: ninguna cuenta tiene mail, y un admin que se
olvida la contraseña pierde su negocio.

**Decisiones del usuario (27 de octubre):**
- El titular legal de Nexo es Santino (19 años). No hace falta estar
  inscripto en ARCA para eso; sí para cobrar los planes. Sus datos van en
  `.env` (`NEXO_TITULAR_*`, Fase 3), no en el repo público.
- Se acepta de 13 a 17 años en Gratis, con permiso de los padres. Los planes
  pagos, solo mayores.
- Cada persona tiene su cuenta con mail y se entra con el mail. El admin
  invita por mail desde Configuración y la persona acepta la solicitud, solo
  con mail verificado. Diseño en la sección 5 del documento (Fases 1 y 1b).
- Gemini: se le recomendó una sola clave de Nexo en el plan pago, con un tope
  de frases por plan (sección 2.6). Falta que lo confirme, con los topes.

**Qué se hizo:**
- `backend/mail.js`: cliente SMTP propio sobre `node:tls` (solo TLS directo,
  puerto 465), sin dependencia nueva.
  - `mandarMail({ para, asunto, texto, html })`, `plantillaMail()` (texto y
    HTML con la franja negra de Nexo, estilos en línea y sin imágenes),
    `esMailValido()`, `mailConfigurado()` y `conversarSmtp()`, separada de la
    conexión para poder probarla.
  - Saca los espacios de la clave (Google la muestra en cuatro grupos).
  - Rechaza destinatarios y asuntos con saltos de línea, para que nadie meta
    un `Bcc:`.
  - Cuerpo en base64 y asunto con RFC 2047; duplica los puntos al principio
    de línea.
  - Un 535 da "rechazó el usuario o la clave", sin mostrar la clave.
  - `NEXO_MAIL=stub` guarda cada mail como JSON en `NEXO_MAIL_DIR` en vez de
    mandarlo.
- `npm run probar-mail [-- destino]` (`scripts/probar-mail.mjs`), desde la
  raíz, lee `.env`.
- `.env.example`: `NEXO_SMTP_USUARIO`, `NEXO_SMTP_CLAVE`,
  `NEXO_SMTP_SERVIDOR` y `NEXO_SMTP_PUERTO`.
- La cuenta de Nexo es `nexosystem.app@gmail.com`, con contraseña de
  aplicación en el `.env` de la raíz de la máquina de Santino (se creó en esta
  sesión, comprobado que git lo ignora). La clave nunca pasó por el chat: el
  formato se controló con búsquedas que solo cuentan coincidencias.
- `assets/logo/06-perfil/`: el ícono en un cuadrado de 512×512, en negro y en
  blanco, para la foto de perfil del mail. A escala 1:1, sin agrandar.

**Lo que falló en el camino:**
- `myaccount.google.com/apppasswords` decía "no está disponible para tu
  cuenta": faltaba la verificación en dos pasos.
- El usuario abrió `.env.example` para pegar la clave. Ese archivo se versiona
  y el repo es público: la clave va en `.env`.
- La clave se pegó con los espacios de Google. Desde ahí `mail.js` los saca.

**Verificación:**
- `backend/test/mail.test.js` (5 tests) contra un servidor SMTP falso sin
  TLS: la charla, el AUTH, los puntos duplicados, el 535 sin la clave, el
  asunto con acentos, los destinatarios inválidos y el modo stub.
- `npm test`: 82 de 82. Lint sin problemas.
- `npm run probar-mail`: Gmail aceptó el envío a la misma cuenta. Falta que el
  usuario confirme que llegó y cómo se ve.
- No se tocó el esquema ni la base real.

## 102. Mail en la cuenta, verificación y login con mail (etapa 8b, Fase 1), 27 de octubre de 2026

Primera fase de la etapa 8b, con el diseño de la sección 5 de
`docs/investigacion-login-legal.md`. Antes se commiteó aparte lo de §101
(`20e548f`).

**Esquema (aditivo, sin rebuild):**
- `usuarios.email` y `usuarios.email_verificado`, nulables. Están al final del
  `CREATE TABLE` de `schema.sql` y se suman con `ALTER` en `db/index.js`,
  después de la migración de `rol`/`activo`. Ahí también va
  `idx_usuarios_email`: único sobre `LOWER(email)`, parcial (`WHERE email IS
  NOT NULL`).
- La tabla nueva `tokens_cuenta`:
  - columnas: usuario, tipo `verificar_email` | `recuperar`, SHA-256 del
    token, mail al que se mandó, creado, vence y usado;
  - sin `organizacion_id`, como `sesiones`, y con las horas en UTC;
  - la Fase 2 la reusa para recuperar la contraseña.
- La auditoría usa `editar usuario` con detalle ("Sumó su mail", "Cambió su
  mail", "Verificó su mail"): no toca el `CHECK` de `auditoria`.

**Backend:**
- **Login:** acepta `email` o `usuario` en el mismo campo y busca por los dos.
  Si coinciden cuentas distintas, gana la del mail. El mensaje pasa a ser "Mail
  o contraseña incorrectos.". El `HASH_DUMMY`, los topes y la auditoría quedan
  igual.
- **Alta (`/api/auth/registro`):**
  - pide `email_cuenta`, porque `email` ya era el mail del negocio de los
    comprobantes, igual que en "Agregar negocio";
  - el usuario de una cuenta nueva es su mail, en minúsculas;
  - 409 si el mail lo usa otra cuenta, como mail o como usuario;
  - manda la verificación.
- **Puerta en `autenticar`:** una cuenta sin mail recibe 403 `{ codigo:
  'falta_email' }` en todo, salvo en `/auth/email`, `/auth/logout` y
  `/auth/cambiar-password`. Va después de la del cambio de contraseña.
- **`POST /api/auth/email`:**
  - la primera vez no pide la contraseña; cambiarlo sí;
  - el mail nuevo queda sin verificar, y al anterior le llega un aviso;
  - si el usuario era el mail viejo, pasa al nuevo (si no, el mail viejo
    seguía entrando: lo encontró el test);
  - tope: 5 por hora y por cuenta, con `registroExcedido('mail:<id>')`.
- **`POST /api/auth/email/reenviar`:** con el mismo tope.
- **`GET /verificar-mail?token=`:**
  - vale 48 h, y solo si el mail de la cuenta sigue siendo al que se mandó;
  - un enlace nuevo borra los anteriores sin usar;
  - redirige a `/app?mail=verificado|invalido`;
  - un enlace ya usado vuelve a decir "verificado" (por el antivirus del mail
    que lo abre antes).
- **Los mails** salen después de responder (`mandarSinEsperar`): si falla, el
  error queda en el log y la operación ya está hecha. Los enlaces usan
  `urlPublica(req)`.
- `datosUsuario`, `sesionValida` y `GET /api/usuarios` suman `email` y
  `email_verificado`.

**Frontend:**
- **Login:**
  - dice "Mail", sin `type=email`, porque las cuentas viejas entran con su
    usuario;
  - `sesion.js` sigue el orden contraseña forzada → "Sumá tu mail"
    (`#formSumarMail`, obligatoria) → la app, con `seguirCon()`.
- **`?mail=` del enlace:**
  - se lee y se saca de la dirección;
  - con sesión va como `nexo.aviso`; `dominios/negocios.js` ahora entiende el
    prefijo `error:`;
  - sin sesión, como nota en el login.
- **Alta:**
  - el paso 1 pide el mail (`#altaEmailCuenta`), y el 409 vuelve a ese campo;
  - el mail del negocio del paso 5 se propone con el de la cuenta.
- **Mi cuenta:** tarjeta "Mail" con el estado (Confirmado o Sin confirmar),
  "Mandarlo de nuevo" y el cambio con contraseña.
- **Resumen:** aviso "Confirmá tu mail" (`#avisoMail`) para los dos roles, con
  reenviar y cambiar.
- **Usuarios:** la columna "Mail", con el estado abajo; si falta el mail,
  muestra el usuario viejo.
- **Textos:**
  - ícono `mail` de lucide-static en el sprite;
  - "entra con su mail" en Primeros pasos y en la landing;
  - privacidad: el mail de la cuenta y un párrafo sobre los mails que salen
    por Gmail.

**Tests y scripts:**
- **`servidor-de-prueba.js`:**
  - corre con `NEXO_MAIL=stub` y devuelve `leerMails()`;
  - suma `ultimoEnlace()`;
  - `registrarEmpresa` manda `<usuario>@nexo.test`;
  - `crearEmpleado` suma el mail después del cambio de contraseña.
- `backend/test/cuenta-mail.test.js` (6 tests) cubre:
  - el enlace de un solo uso, el vencido y el reemplazado;
  - las mayúsculas;
  - la puerta `falta_email`;
  - los duplicados contra el mail y contra el usuario;
  - el cambio de mail con su aviso;
  - el empleado y el tope.
- **`regresion-head.mjs`:**
  - entra con el mail y, si falla (400 o 401), con el usuario;
  - si la cuenta no tiene mail, se lo suma.
- `seed.mjs` muestra las credenciales con el mail.

**Lo que falló en el camino:**
- La primera versión del alta usaba `email` para la cuenta, que chocaba con
  el mail del negocio.
- En el test de cambio de mail, el viejo seguía entrando porque era también el
  usuario.
- La regresión se siembra con el seed de la ref, así que en el árbol de
  trabajo sus cuentas no tienen mail. HEAD responde 400 (no 401) a un login
  sin `usuario`.
- El primer recorrido en el navegador creó la empresa en Gratis, que no deja
  sumar usuarios.

**Verificación:**
- `npm test` dio 88 de 88. Lint sin problemas.
- `npm run verificar-migracion`: 24 de 24, y la base real no cambió.
- **`npm run regresion`:** 5 diferencias, todas esperadas:
  - `email` y `email_verificado` en `estado` (los dos roles) y en Usuarios;
  - dos filas "Sumó su mail" en la auditoría, que el script mismo genera al
    sumar el mail.
- **Navegador** (playwright-core del scratchpad, base nueva, mail stub):
  - el alta con mail inválido y el paso 5 con el mail propuesto;
  - el aviso del Resumen y el reenvío;
  - Mi cuenta sin confirmar → el enlace → el toast y "Confirmado";
  - el cambio con contraseña mala y buena;
  - una cuenta vieja: contraseña forzada → "Sumá tu mail" (con un mail
    repetido) → la app;
  - el enlace sin sesión, válido e inválido;
  - Usuarios.
  - Capturas en oscuro, claro y a 390 px, sin errores de consola fuera de los
    401 y 409 buscados.
- **Base real:**
  - la migró un servidor temporal en el puerto 3917, sin tocar el `npm start`
    del usuario que corría en el 3000 con el código viejo. Las columnas son
    aditivas, así que el código viejo anda igual;
  - respaldos `nexo-20261027-165816.db` (antes de migrar) y los dos que
    siguen, en OneDrive;
  - `integrity_check` ok y sin errores de FK.
- **Cuentas de la demo:**
  - `prueba` → `nexosystem.app+prueba@gmail.com` y `vendedor.prueba` →
    `nexosystem.app+vendedor@gmail.com`, con el enlace mandado de verdad por
    Gmail;
  - el envío se rehízo con `NEXO_URL_PUBLICA=http://localhost:3000` para que
    el enlace apunte al servidor de siempre (el primero apuntaba al 3917);
  - `recepcion.prueba` quedó sin mail a propósito: tiene el cambio de
    contraseña forzado, y sumarle el mail por la API pedía cambiarle la clave
    de la demo. Al entrar pasa por las dos páginas.

## 103. La publicación en Oracle (etapa 8, Fase 4), 27 de octubre de 2026

Adelantada por pedido del usuario ("que pueda entrar desde internet con el
dominio de DuckDNS"), antes de la Fase 1b de 8b. Se hizo sola mientras el
usuario no estaba, con su autorización para mergear (PR #27 y #28).

**Qué se agregó (`deploy/`, guía en `docs/publicar.md`):**
- **`instalar.sh`**: idempotente, se corre con `sudo bash instalar.sh [base.db]`.
  - swap de 2 GB, el 80 y el 443 en iptables (antes del REJECT de Oracle,
    guardado con `netfilter-persistent`);
  - Node 22 de NodeSource, Caddy del repo oficial y el usuario de sistema
    `nexo`;
  - el clon de `main` en `/opt/nexo`, la base y los respaldos en
    `/var/lib/nexo` y las variables en `/etc/nexo/nexo.env` (root:nexo, 640);
  - la base inicial solo si no hay una, con `integrity_check` antes.
- **`actualizar.sh`** + `nexo-actualizar.timer`, cada 5 minutos:
  - trae `main` solo si el CI de ese commit está en verde (API pública de
    GitHub, sin token);
  - corre `npm ci` si cambió el lock y copia las unidades y el `Caddyfile` si
    cambiaron;
  - reinicia, y si Nexo no responde en 30 s, vuelve al commit anterior y anota
    el fallido en `/var/lib/nexo/.commit-fallido`;
  - todo dentro de `main()`, porque git reemplaza el script mientras corre.
- **`Caddyfile`**: https de Let's Encrypt, HSTS de un año y
  `X-Robots-Tag: noindex, nofollow` hasta los términos (Fase 3 de 8b).
- **`nexo.service`** endurecido: corre como `nexo`, con `ProtectSystem=strict`,
  y solo escribe en `/var/lib/nexo`. Heap de 384 MB.
- **`nexo-respaldo.timer`**: respaldo diario a las 3:30 de la Argentina.
  Se guardan 60 (`NEXO_BACKUP_KEEP`), sumados a los de cada arranque.
- **`nexo-duckdns`**: avisa la IP cada 30 minutos, solo si existe
  `/etc/nexo/duckdns.env` con el token. No está creado: el token es del
  usuario, y la IP no cambia mientras exista la instancia.
- **`server.js`:** `NEXO_HOST` (127.0.0.1 en el servidor) para que Node no
  escuche en todas las interfaces. Va documentada en `.env.example`, junto con
  `NEXO_URL_PUBLICA`.
- **`.gitattributes`:** `deploy/**` siempre en LF, también en Windows.

**Instalación real:**
- **La base real:** copiada con `VACUUM INTO` desde una conexión de solo
  lectura, sin parar el `npm start` del usuario. `integrity_check` ok, sin
  errores de FK; tiene 4 negocios, 4 usuarios, 21 productos y 33 ventas.
- **Las variables:** `/etc/nexo/nexo.env` salió del `.env` de la compu (solo
  las de SMTP, sin mostrarlas) más las fijas del servidor.
- **`NEXO_NEGOCIO_VENTAS=1`:** "Mi negocio" de `Solla_FAT`. Lo decidí yo, a
  confirmar con el usuario: su decisión era "un negocio suyo".
- **Versiones:** Node v22.23.4 y Caddy del repo estable.

**Verificación:**
- **Desde afuera:**
  - `http://` da 308 a `https://`, y la landing responde 200 con HSTS,
    `noindex` y la CSP de Nexo;
  - responden `/app`, `sw.js`, Satoshi y `robots.txt`, con la URL pública;
  - un login fallido da 401 JSON;
  - el 3000 no se ve desde afuera.
- **En el servidor:**
  - `nexo` y `caddy` activos, Node en 127.0.0.1:3000;
  - el respaldo del primer arranque está en `/var/lib/nexo/respaldos`;
  - el mail sale: `probar-mail` mandó uno a la casilla de Nexo.
- **En Chrome, a 390 px:** la landing y el login de `/app` se ven bien, sin
  errores de consola.
- **La actualización sola:** se probó con el commit de este mismo handoff, que
  fue de PR a `main` y de ahí al servidor (ver el resultado en `handoff.md`).

**Problemas en el camino:**
- No hay `gh`: los PR se abren y se mergean con la API REST y el token de
  `git credential fill`, sin mostrarlo.
- La primera llamada a la API con el cuerpo como argumento dio "Problems
  parsing JSON", por la codificación en Windows. Se arregló mandando el JSON
  desde un archivo (`-d @archivo`).
- El loop local que seguía la instalación nunca cortaba, porque `pgrep -f` se
  encontraba a sí mismo. La instalación terminó bien igual, en unos 7
  minutos.

## 104. Invitaciones por mail y cuentas sin negocio (etapa 8b, Fase 1b), 28 de octubre de 2026

Lo que seguía según el handoff ("¿qué sigue?", "¿y?"); el usuario aprobó el
plan y sumó como pendiente entrar con Google (anotado en "Qué sigue", 8b).
Diseño de partida: `docs/investigacion-login-legal.md` §5.

**Qué cambió:**
- **Tabla `invitaciones`** (solo en `schema.sql`, es nueva: aditiva, sin
  migración en `db/index.js`): negocio, mail en minúsculas, rol, `token_hash`
  (SHA-256), estado (`pendiente|aceptada|rechazada|cancelada`), quién invitó,
  `enviada` y quién respondió. Una pendiente por negocio y mail (índice
  parcial). "Vencida" son 14 días desde `enviada`, calculado al leer.
- **Admin** (`/api/invitaciones`, `soloAdmin`): listar las pendientes (con
  las vencidas), invitar, reenviar y cancelar.
  - Invitar a un mail con una pendiente la reenvía con el rol nuevo (200 y no
    201).
  - Cada envío cambia el token: solo vale el último enlace.
  - Las pendientes vigentes cuentan para el tope de usuarios del plan.
  - 30 invitaciones por hora y por negocio (`registroExcedido` ahora acepta
    un máximo).
  - Si esa persona ya trabaja en el negocio, 409.
  - La respuesta es igual exista o no una cuenta con ese mail. Al mail sí
    le cambia el texto: "creá tu cuenta" o "entrá con tu cuenta".
- **El enlace** es `/app#/unirme/<token>`: en el hash, así no queda en el log
  de Caddy. Lo leen rutas por POST con el token en el cuerpo:
  - `POST /api/auth/invitacion` (pública): de qué negocio es, quién invitó,
    el estado y si el mail ya tiene cuenta.
  - `POST /api/auth/invitacion/cuenta` (pública): crea la cuenta con ese mail
    **ya confirmado** (el enlace llegó ahí), la suma al negocio y abre la
    sesión. Tope aparte: 20 por hora y por IP, contando solo los pedidos con
    un enlace vigente y datos válidos (un equipo se suma desde el mismo wifi).
  - `POST /api/auth/invitacion/aceptar` (con sesión): tiene que ser el mail de
    la cuenta (si no, 403 `otro_mail`), y lo deja confirmado.
- **La cuenta** (`/api/auth/invitaciones`): ve las pendientes de su mail
  **confirmado** y las acepta o rechaza por id. Aceptar pasa la sesión a ese
  negocio. Rechazar queda en la auditoría del negocio.
- **Aceptar** (`aceptarInvitacion`): suma la fila de `usuario_organizaciones`
  con el rol, o reactiva la baja que tenía ahí, y ocupa un lugar del plan. Si
  no hay lugar, el texto es para quien acepta ("avisale a … para que sume
  lugar"). Auditado como `crear usuario` con `operacion_tipo invitacion`.
- **Cuenta sin negocio:** el login ya no rechaza a una cuenta sin ningún
  negocio activo (antes era "como si no existiera").
  - Entra con la sesión sin negocio (`organizacion_id` y rol en NULL);
    `sesionValida` pasó a LEFT JOIN.
  - `autenticar` solo la deja llegar a `/auth/*` y `/negocios*`; lo demás es
    403 `sin_negocio`.
  - `POST /api/negocios` perdió el `soloAdmin` de la firma (permisos.js:
    'ambos'): con negocio sigue siendo solo del admin, controlado adentro;
    sin negocio crea el primero, con el plan que mande (Gratis si no manda),
    como el registro.
- **`POST /api/usuarios` se fue** (el alta con usuario y contraseña). Editar,
  dar de baja y resetear la contraseña siguen.
- **Frontend:**
  - Configuración → Usuarios: "Invitar" (página `#/configuracion/invitar`, con
    el mail y el rol en dos tarjetas) e "Invitaciones sin responder" con
    reenviar y cancelar. El modal de usuario quedó solo para editar nombre y
    rol.
  - `sesion.js`: la pantalla del enlace (crear la cuenta; ingresar y aceptar
    sola si el mail ya tiene cuenta; aceptar con la sesión abierta; o por qué
    ya no vale) y la de "Todavía no estás en ningún negocio", con sus
    solicitudes y "Crear mi negocio" (el alta en modo negocio con `primero`,
    sin la nota de "negocio aparte").
  - El Resumen muestra las invitaciones que le llegaron a la cuenta
    (`dominios/negocios.js`), con Aceptar y Rechazar.
- **Arnés:** `crearEmpleado(servidor, admin, …)` invita y crea la cuenta
  desde el enlace del mail (necesita `servidor.leerMails`); `lectorDeMails()`
  y `tokenDeInvitacion()` exportados. El seed recibe `leerMails`, y con
  `--url` pide `--mails <carpeta>`. `regresion-head` se lo pasa (una ref
  anterior lo ignora).

**Lo que se decidió distinto del documento:**
- **Sin rebuild de `usuarios`.** Toda cuenta nueva nace desde una invitación
  (con su negocio) o desde el registro, así que `organizacion_id` nunca queda
  NULL. La cuenta sin negocio se resuelve en la sesión, no en `usuarios`. El
  rebuild hace falta recién con una cuenta que nazca sola (entrar con Google
  sin invitación): se hace en esa etapa.
- **El reseteo de contraseña del admin sigue igual** para todos: limitarlo a
  quien no confirmó su mail deja sin salida al que la olvida hasta que exista
  "Me olvidé la contraseña". Se restringe en la Fase 2.
- **El enlace confirma el mail.** El documento pedía cuenta verificada para ver
  la solicitud; eso sigue en la lista de Nexo, pero tocar el enlace ya prueba
  el mail, así que crear la cuenta o aceptar desde él no pide otro paso.

**Verificación:**
- `npm run lint` limpio y 96 tests en verde, 8 nuevos en
  `backend/test/invitaciones.test.js`. Cubren invitar y crear la cuenta,
  aceptar con cuenta ya existente, reenviar, vencer y cancelar, el mail
  equivocado, rechazar, la cuenta sin negocio que crea el suyo, los permisos
  del empleado y el tope de Gratis.
- `cuenta-mail.test.js` arma la cuenta "de antes de §102" directo en la base de
  prueba (el alta con usuario y contraseña ya no existe).
- `npm run verificar-migracion`: 24 de 24, la base real sin cambios (md5
  igual).
- `npm run regresion`: solo las 4 rutas nuevas (404 en HEAD).
- En Chrome, contra una base sembrada en el scratchpad:
  - invitar desde la página;
  - abrir el enlace sin sesión y crear la cuenta (entra como empleada);
  - darla de baja y volver a entrar (pantalla sin negocio);
  - reinvitarla (aparece la solicitud);
  - crear su negocio (queda admin) y aceptar la invitación desde el Resumen
    (pasa a Baseline SA como admin).
  - Pasada a 390 px de la pantalla sin negocio.
- **Corregido en la pasada:** `.btn-link` le ganaba al `[hidden]` y "Ahora no"
  se veía sin sesión. Con solicitudes, "Crear mi negocio" pasa a secundario.
