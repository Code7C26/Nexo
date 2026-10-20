# Handoff — Nexo

> Punto de entrada para retomar el proyecto en una sesión nueva. Se mantiene
> **corto y vivo**: estado actual, decisiones vigentes y qué sigue. El relato
> detallado de cada etapa (qué se tocó, cómo se verificó, qué falló) vive en
> [`docs/handoff-historico.md`](docs/handoff-historico.md), citado acá como
> "hist. §N". Las reglas de negocio y la arquitectura están en `CLAUDE.md`, y
> este archivo no las repite.

## Cómo mantener este archivo

- Al cerrar una etapa, se hacen tres cosas:
  - su relato completo se agrega al final de `docs/handoff-historico.md` con el
    siguiente número (hoy el último es §76);
  - acá se actualizan "Estado actual" y "Qué sigue";
  - si cambió alguna decisión vigente, se actualiza también esa lista.
- Nunca apilar secciones "Última etapa" en este archivo: así fue como llegó a
  6000 líneas.
- Lo que deja de ser cierto se corrige o se borra de acá. En el histórico no se
  reescribe nada.

## Estado actual (20 de octubre de 2026)

**Próxima sesión:** varios negocios por cuenta (punto 6 del plan, en "Qué
sigue").
- Socios, cuotas e ingreso (hist. §74) y planes con varias duraciones, varios
  planes por socio y descuentos (hist. §75) están hechos y commiteados.
- El usuario ya probó la primera versión de socios en la base real, que es un
  gimnasio desde Configuración. Sus datos pasaron a la forma de §75 con la
  migración de `db/index.js`.
- Falta que vea §75 y diga qué cambiaría. Los planes y descuentos ya no
  están en Configuración: son "Planes", en el menú, dentro de Socios (hist. §76).

**Ramas.** El trabajo diario va sobre `solla`, la rama de Santino (decisión
del usuario, hist. §28): no se abre una rama por tarea. `Tosi` es la de
Joaquín.
- `solla` está pusheada hasta el cierre de la auditoría (hist. §65). El PR
  `solla` → `main` se abre desde
  https://github.com/Code7C26/Nexo/compare/main...solla (no hay `gh`). Va a
  ser la primera corrida del CI en GitHub.
- `main` ya está mergeada en `solla` (los PR #24 y #25 pasaron la Etapa A y
  F0–F5). Pasar `solla` → `main` es por PR, y desde la Fase 4 el CI de GitHub
  Actions (`npm run lint` + `npm test`) corre en cada PR.

**Construido.** El núcleo de CLAUDE.md §1–§27 está completo (ver "Estado real
del sistema" en `CLAUDE.md`). Facturación de monto simple, sin IVA ni ARCA.

**Etapa D (punto de venta, CLAUDE.md §30): hecha** (hist. §67 el backend, §68 la
pantalla `frontend/js/dominios/pos.js`).

**Etapa A del roadmap (multi-empresa, CLAUDE.md §28): núcleo hecho** (hist.
§37–§49). Todas las tablas de negocio tienen `organizacion_id` y todas las
consultas filtran por la empresa de la sesión, incluidos los cinco catálogos
(hist. §49). Una empresa se crea desde la pantalla de login con
`POST /api/auth/registro` (hist. §51). Lo que falta para cerrarla está en
"Qué sigue".

**Etapa B (modularizar `app.js` + PWA, CLAUDE.md §31): en curso** (hist.
§52–§56). Hechas F0 (test estático `backend/test/frontend-modulos.test.js`),
F1 (`sesion.js` inyecta `app.js` como módulo ES, con `onerror`), F2 (el
núcleo compartido salió a `frontend/js/core/`: `formato`, `ui`, `csv`,
`filtros`, `seleccion`, `comprobante`, `router`, `negocio`, `registro`), F3
(primeros dominios en `frontend/js/dominios/`: `usuarios`, `configuracion`,
`perfil`) y F4 (`cuentas-corrientes`, que invoca fichas, cobrar y pagar de otros
dominios por nombre con `invocar`) y F5 (`gastos`, más `core/maestros.js` con `cuentasTesoreria`,
`proveedores` y `poblarSelectCuentas`; hist. §56). `app.js` bajó de 9407 a 7083
líneas y sigue teniendo el resto de los dominios; falta extraerlos (F6–F13) y la
PWA (B2).
Decisión para la Etapa C: `precio_unitario` pasa a ser precio final con IVA
incluido.

**Base de datos real** (`backend/db/nexo.db`, en `.gitignore`):
- **Ya migrada a la Etapa A** (6 de octubre de 2026, primer arranque real, hist.
  §57): se aplicó §37–§49 de una vez. Los conteos de las 36 tablas dieron
  idénticos antes y después (solo bajó `sesiones`, que el arranque limpia),
  `integrity_check` ok, `foreign_key_check` sin filas y ninguna fila sin
  `organizacion_id`. md5 de la base recién migrada: `8dc00857…`. Ya no sirve
  de referencia porque cambia con el uso (el 16 de octubre era `b10b3a94…`):
  "la base real no cambió" se controla con el md5 de antes y de después de
  cada verificación, que los scripts calculan solos.
- Copias de la base **anterior** a la migración (md5 `a25ce51d…`):
  `backend/db/nexo.db.backup-antes-etapa-a-20261005-210622` y, fuera del repo,
  `~/Documents/nexo-backups/`. Para volver atrás, restaurar una de las dos.
- `NEXO_BACKUP_DIR` quedó definida como variable de entorno **de usuario de
  Windows** apuntando a `C:\Users\HP ULTRA 5\OneDrive\Nexo-respaldos`: los
  respaldos automáticos salen a la nube sin hacer nada. Si hace falta quitarla:
  `[Environment]::SetEnvironmentVariable('NEXO_BACKUP_DIR',$null,'User')`. Una
  terminal ya abierta no la ve hasta reiniciarse.
- **Respaldo automático** (`backend/db/respaldo.js`, auditoría de hist. §57): cada
  arranque respalda la base ANTES de abrirla, con rotación de 14 y sin duplicar si
  no cambió nada. Sin `NEXO_BACKUP_DIR` el destino es `<repo>/backups/` (ignorada
  por git, mismo disco que la base). Si el respaldo falla, el arranque se corta.
  Variables: `NEXO_BACKUP=off` (lo apaga), `NEXO_BACKUP_DIR`, `NEXO_BACKUP_KEEP`. Manual: `cd backend && npm run backup`.
  Con `node --watch` cada reinicio con datos nuevos crea uno y los 14 rotan rápido.
- Tiene una sola organización ("Mi negocio") y un solo usuario, admin.

**Servidor**: `cd backend && npm start`, en el puerto 3000 (`PORT` lo cambia).
- Antes de arrancar, `npm start` y `npm run dev` bajan Satoshi si falta
  (`scripts/fuentes.mjs --si-falta`, hist. §72). Sin conexión solo avisa y el
  servidor arranca igual.
- Node 22.13+ (`engines`, `.nvmrc`). `npm start`, `npm run dev` y
  `npm run backup` leen `.env` de la raíz si existe (`--env-file-if-exists`;
  plantilla en `.env.example`, hist. §59). Lo que ya está en el entorno le gana
  al archivo. `npm test` no lo lee. Hoy no hay `.env` en la máquina de Santino.
- `GEMINI_API_KEY`: sin ella el asistente responde 503 y el resto funciona
  igual.
- `NEXO_TRUST_PROXY=<n>` (cantidad de proxies de confianza delante, normalmente
  1) es **obligatoria detrás de un proxy inverso**: sin ella `req.ip` es siempre
  la IP del proxy y 30 logins fallidos de cualquiera bloquean el login de todas
  las empresas 15 minutos (tope por IP, hist. §57). En `NODE_ENV=production` sin
  ella el servidor avisa al arrancar.
- `NEXO_INTERPRETE=stub` reemplaza a Gemini por un parser determinista para
  pruebas (formato en `interpretarStub`, `backend/interprete.js`).

**Instalar desde cero funciona** (hist. §48): con `nexo.db` borrado, el primer
arranque crea todo y `POST /api/auth/registro` da de alta la primera empresa
con su admin (adopta la organización sembrada).

## Decisiones vigentes

Las que no están en `CLAUDE.md` y que alguien podría "arreglar" sin saberlo:

**Multi-empresa y seguridad**
- **El nombre de usuario es único en todo Nexo** y el login no pide empresa
  (hist. §45). Por eso el chequeo de duplicado de `POST /api/usuarios` es
  global a propósito.
- **Aislamiento entre empresas:** filtro plano `AND organizacion_id = ?` con la
  empresa de la sesión, nunca `(? IS NULL OR ...)`. Un id de otra empresa da el
  mismo 404/400 que uno inexistente (hist. §40–§49).
- **Tablas hijas sin columna propia** (`venta_items`, `cobros`, `pagos`,
  `movimientos_cc_*`, atributos): heredan el aislamiento de su fila padre
  (hist. §43, §47).
  - **Excepción: `producto_variantes` tiene `organizacion_id`** (hist. §65),
    solo para que su SKU sea único por empresa en la base. Una FK compuesta
    `(producto_id, organizacion_id)` la ata a la empresa de su producto. Las
    consultas la siguen filtrando por el JOIN a `productos`.
- **`organizacion_id` es `NOT NULL` en todas las tablas de negocio** (hist.
  §65), salvo `auditoria`. Un alta que no la cargue falla en la base.
- **SKU único por empresa** (hist. §65): `idx_productos_org_sku` e
  `idx_producto_variantes_org_sku`. Cada tabla por separado, como antes: un
  SKU de variante puede coincidir con el de un producto.
- **Catálogos por empresa:** `organizacion_id NOT NULL` y
  `UNIQUE(organizacion_id, nombre)`. Cada empresa recibe su depósito, lista y
  cuentas base vía `sembrarCatalogosBase` al arrancar (hist. §49).
- **La lista y el depósito predeterminados tienen que estar activos.** El
  `PATCH` rechaza (400) marcar como predeterminado uno inactivo, en vez de
  activarlo solo (hist. §50). Las altas de los cinco catálogos se auditan.
- **El registro de empresas es público** (decisión del usuario, hist. §51),
  sin verificación de email ni captcha. Solo lo frena un tope de 5 intentos
  por hora y por IP, en memoria.
- **`auditoria` no está en el backfill de arranque** de `organizacion_id`: su
  NULL de `login_fallido` es legítimo. Volver a sumarla al array de
  `db/index.js` reintroduce el bug de hist. §51.
- **`GET /api/auditoria` es solo admin**, porque los JSON de valor
  anterior/nuevo traen costos. Un `login_fallido` con un usuario inexistente
  queda con `organizacion_id NULL`, invisible para todas las empresas
  (hist. §46).

**Migraciones**
- Se sigue el patrón de CLAUDE.md §34, más una regla aprendida en hist. §48:
  - todo `ALTER` nuevo va **después del último rebuild de su tabla**;
  - `schema.sql` tiene que reflejar la forma final de cada tabla, incluido
    cada valor de sus `CHECK`. Si no, una base nueva dispara rebuilds viejos.
  - Por eso una columna nueva va en los dos lugares: en el `CREATE TABLE` de
    `schema.sql`, al final, y como `ALTER` en `db/index.js` para las bases
    existentes (hist. §64).
  - Los `CREATE INDEX` y las vistas que usan una columna sumada por `ALTER`
    van en `db/index.js`, después de ese `ALTER`. En `schema.sql`, que corre
    antes, una base vieja fallaría con "no such column".
  - `npm run verificar-migracion` (también en el CI) falla si la definición
    de una tabla en `schema.sql` (columnas, FK, `CHECK`, `UNIQUE`) no es la
    final.
  - Un rebuild que solo cambia una restricción puede partir del `CREATE` que
    la tabla tiene en `sqlite_master` en vez de una foto escrita a mano
    (patrón de hist. §65, `definicionConEmpresaObligatoria`). Así no pierde
    columnas sumadas por `ALTER`.

**Stock, precios y vencimientos**
- **El costo promedio ponderado es global por producto**, no por depósito. El
  stock mínimo/máximo también es global, y hay un depósito por operación, no
  por renglón (hist. §24).
- **Listas de precios:**
  - el precio es fijo por producto y lista;
  - `precio_venta` es el precio de la lista predeterminada, y los dos se
    mantienen sincronizados;
  - `lista_precio_id`/`deposito_id` en NULL en una operación significa "el
    predeterminado de ese momento" (hist. §23, §24).
- **Vencimientos:**
  - las operaciones anteriores a esa etapa quedaron como contado (vencimiento =
    su propia fecha) para no mover el aging histórico (hist. §25);
  - la condición de pago habitual de un cliente o proveedor solo se propone,
    no pisa lo que ya se cargó (hist. §26).

**Diseño visual (hist. §62, §69, §72)**
- **Principio del usuario (19 de octubre), por encima de los demás:** la
  interfaz se diseña para alguien que nunca usó Nexo. "No quiero que
  simplemente cumpla la función": él entiende el programa a la perfección,
  "pero alguien que no conoce Nexo, ni nunca lo probó, no va a tener ni
  idea". Pide foco en los pequeños detalles que separan una aplicación
  pensada y estética de "una aplicación sencilla hecha con inteligencia
  artificial", que "se pueda interactuar bien" y que las cosas sean simples.
  Lo que se configura va en pasos y páginas aparte, "bien estructurada como
  una aplicación real", nunca en "un cuadradito que se abre".
  - En la práctica, antes de dar por terminada una pantalla o un flujo:
    - qué ve y qué entiende quien entra por primera vez;
    - estados vacío, cargando, error y éxito;
    - foco y teclado, transiciones y textos;
    - y capturas al usuario.
- **Estructura de Dub, base negra de Nexo (hist. §72):**
  - bordes finos en vez de sombras: paneles y tarjetas sin sombra;
    `--shadow-md`/`--shadow-lg` solo para lo que flota;
  - densidad compacta (`--control-h` 36 px en escritorio; 44 px en el
    celular, el POS y el login);
  - radios de Dub: 6 inputs, 8 botones, 12 tarjetas, 16 modal y hoja.
- **Marco de marca (hist. §72):** la sidebar y un marco de 8 px (`--marco`)
  alrededor del contenido son negros (`--frame`) en los dos temas. El
  contenido vive en una hoja (`.main`) con borde fino. En el celular no hay
  marco. El scroll sigue siendo el del documento.
- **El tema de partida es el oscuro** (hist. §72): sin elección guardada no se
  sigue al sistema operativo. El claro va adaptado: hoja gris `#F5F5F5` y
  tarjetas blancas, nunca el lienzo blanco de Dub.
- **El negro es el color de marca** (el logo es blanco y negro): sidebar,
  marco, fondo del login y avisos son negros, con grises neutros. El rediseño
  lo había cambiado por azul noche y el usuario lo corrigió (hist. §62,
  addendum). Los acentos van encima, no en su lugar.
- **Botón primario en tinta, como Dub** (hist. §72): `--primario-bg`, blanco
  en oscuro y negro en claro. Reemplaza al "azul para toda acción" de hist.
  §62: volver atrás es cambiar los tres tokens `--primario-*`.
- **Un solo acento, el azul** (`--accent`): enlaces, foco, sección activa
  (tinte `--sidebar-active`, sin raya al costado), selección y datos clave.
  Sobre negro va `--accent-on-dark`. El amarillo del primer rediseño se sacó
  porque al usuario no le gusta negro con amarillo: no sumar un segundo color
  de acento sin preguntar.
- **Tipografía (hist. §72):** Inter (OFL, `frontend/fonts/inter.woff2`) para
  texto y cifras, y Satoshi solo para títulos (`--font-display`: marca, h1 de
  la página, login, título del POS y membrete). Nada de grotescas "con
  carácter" en los números (hist. §69).
  - **Satoshi no se versiona:** su licencia (ITF Free Font License) permite
    alojarla pero no redistribuirla, y el repo es público. La baja
    `npm run fuentes` (`.gitignore`: `frontend/fonts/satoshi-*.woff2`); si
    falta, cae a Inter.
- **Sin doble raya bajo las cifras ni bloques negros sueltos en el tema
  claro** (hist. §69): el total se destaca por tamaño y peso.
- **Fuentes propias** en `frontend/fonts/` (sin Google Fonts, pensado para
  la PWA y una CSP sin dominios externos). `--font-mono` ya no es
  monoespaciada: las cifras se alinean con `tabular-nums`.
- **Íconos:** solo del sprite `frontend/img/iconos.svg` vía `icono()`
  (`core/iconos.js`) o `<use href="/img/iconos.svg#…">` en el HTML. Un ícono
  nuevo se baja de `lucide-static` y se agrega como `<symbol>`. Nada de
  emojis ni caracteres sueltos (✕, ▸, ←) como íconos.
- **Colores de estado (hist. §63, §72):**
  - verde para lo resuelto y rojo lleno (`status-vencido`) para lo urgente;
  - `status-pendiente` es el mismo rojo, pero con contorno y sin relleno;
  - sin color de plata (hist. §72): azul `status-info` (en curso o
    predeterminado: presupuesto enviado, lista y depósito predeterminados),
    violeta `status-ia` (lo que hizo el asistente, en Auditoría) y naranja
    `status-aviso` (conviene mirarlo, no es urgente: stock alto);
  - lo que no es bueno ni urgente va en gris, con `.status` sin clase: un borrador, un rol,
    "Editó", una factura suelta o un gasto de inversión;
  - una cifra `.ledger-value` verde o roja que vale cero pasa sola a tinta (observer de
    `core/ui.js`).
  - Los íconos de las tarjetas del Resumen llevan color por métrica
    (`.ledger-icono-azul`, `-naranja`, `-verde`, `-violeta`); el Resultado
    queda neutro.
- **Contraste:** todo texto pasa AA (4,5:1) sobre su superficie, incluido
  `--ink-faint` (hist. §72).
- **Fichas:** el título va solo en la topbar; el `h2` del primer panel queda
  en el HTML pero se oculta por CSS (hist. §72).
- **Menú:** grupos `.nav-seccion`; los que son solo de admin llevan
  `.nav-seccion-admin` y se ocultan enteros para el empleado.

**Alta guiada y Configuración (hist. §73)**
- **Los tipos de negocio viven en un solo lugar:** `PERFILES_RUBRO`,
  `RUBROS_PROXIMAMENTE` y `MODULOS_INFO` en `server.js` (nombre, descripción e
  ícono). El frontend los pide: `GET /api/auth/tipos-negocio` (pública) o
  `perfiles` de `GET /api/negocio`. Un tipo nuevo no se escribe en el HTML.
- **`PUT /api/negocio` es parcial:** escribe solo los campos que vienen.
  Configuración manda solo lo que cambió.
- **Módulos iguales a los del tipo se guardan como NULL** (en el alta y en el
  `PUT`): la empresa sigue al preset.
- **Condición fiscal del negocio:** lista fija de claves (`responsable_inscripto`,
  `monotributo`, `exento`; `CONDICIONES_IVA` en `server.js`, `core/fiscal.js`).
  Un texto viejo que no se reconoció queda como estaba y se imprime tal cual.
  El CUIT se valida con su dígito verificador y se guarda con guiones.
- **Router con subrutas** (`#/vista/subruta`): el handler de `alEntrarEnVista`
  recibe la subruta.
- **Configuración es una vista con páginas** (`dominios/configuracion.js`,
  `PAGINAS`). Sumar una página es su ítem del menú, su `<section>` y su
  entrada. El empleado ve solo Apariencia.
  - Los catálogos son páginas, pero su lógica sigue en `app.js` y `gastos.js`
    (leen estado privado): registran `pintar:<catálogo>`.
  - Las cuentas de tesorería siguen en Caja.
- **El alta guiada es `frontend/js/alta.js`:** `sesion.js` la baja con
  `import()`. `#/crear-cuenta` es su enlace (para la landing).
- **El tema** pasa por `core/tema.js` (botón de la sidebar y página Apariencia).

**Socios y cuotas (hist. §74 a §76)**
- **Dónde está cada cosa:** el menú Socios tiene Ingreso, Socios y Planes.
  Planes es solo admin y tiene dos pestañas: `#/planes-socio` y
  `#/planes-socio/descuentos`. Configuración no tiene nada de socios, por
  pedido del usuario (hist. §76).
- **Sin circuito propio:** el socio es un cliente, cada plan es un servicio del
  catálogo y cada cuota es una venta de ese servicio, cobrada con los cobros de
  siempre.
  - Del producto salen el nombre del plan y si se ofrece. El precio sale de cada
    duración (`planes_socio_opciones`).
  - El `precio_venta` del servicio es solo de referencia, el de la duración más
    corta. Productos no lo deja cambiar.
- **Duraciones:** de 1 a 36 meses, una por cantidad de meses. La que se saca
  del plan se pausa y no se borra.
- **Varios planes por socio** (`inscripciones_socio`): cada uno tiene su ciclo y
  sus cuotas. Un socio de baja es uno sin planes activos. El mismo plan no puede
  estar activo dos veces (índice parcial).
- **Descuentos** (`descuentos_socio`), siempre en porcentaje:
  - tres tipos: combo de ciertos planes, por cantidad de planes, o a mano en la
    ficha del socio;
  - si le tocan varios, se aplica **el mayor, nunca la suma** (decisión
    tomada sin el usuario, a revisar);
  - se calculan al generar la cuota, y la cuota guarda `precio_lista`,
    `descuento_pct` y `descuento_id`;
  - la pantalla pide `POST /api/socios/cotizacion`, el mismo cálculo, antes de
    confirmar.
- **Cuotas sin cron:** `ponerCuotasAlDia()` corre al mirar a un socio. El
  `UNIQUE(inscripcion_id, desde)` de `cuotas_socio` impide cobrar dos veces un
  período. Hay `GET` que escriben a propósito.
- **Vencimiento:** la cuota vence el día en que empieza su período, el mismo día
  del mes que el alta, contado desde `ciclo_desde` y no encadenado. Debe desde
  ese día: no hay días de gracia (a definir con el usuario).
- **Un alta hacia atrás** cobra el período que corre, no los anteriores
  (`cobrar_desde`).
- **Baja:** no genera más cuotas y no toca las que ya hay. Reactivar empieza un
  ciclo nuevo, sin cobrar los meses de baja.
- **Bonificar:** se anula la venta de la cuota, y el período queda cubierto.
- **Cobro:** salda todas las cuotas impagas juntas. Cobrar una parte se hace desde
  la venta.
- **Auditoría, sin reconstruir `auditoria`:**
  - los socios van como `entidad cliente` con `operacion_tipo socio`;
  - los planes, como `producto` con `plan_socio`;
  - los descuentos, como `organizacion` con `descuento_socio`;
  - la cuota generada lleva `actor sistema` y no tiene usuario.
- **Permisos y catálogo:**
  - crear y editar planes y descuentos es admin;
  - la recepción (alta, sumar plan, descuento a mano, cobro, ingreso, baja) es
    de los dos roles;
  - los planes no salen en el catálogo del punto de venta.

**Frontend (hist. §58)**
- **Todo dato que se imprime en HTML pasa por `esc()`** (`core/formato.js`),
  incluidos atributos `value="…"`. Lo exige `npm test`
  (`backend/test/plantillas-html.js`): un `${x.campo}` crudo en un template
  con etiquetas falla. El test no ve un string armado en otra variable ni lo
  que devuelve una función propia: esos se escapan donde se arman. Las fichas
  arman sus datos con `camposFicha()` (`core/formato.js`): escapa cada valor
  salvo el envuelto en `html()`; un estado va con `badge(clase, texto)`, que
  escapa su texto (hist. §63).
- **Toda llamada al backend pasa por `api()`** (`core/api.js`): avisa el
  error (HTTP o de red) con un toast y lanza, así lo que sigue al `await` no
  corre. Para limpiar algo ante un error: `.catch((e) => { …; throw e; })`.
  Las recargas después de una escritura van con `refrescar([...])`: no
  cortan por una falla ya avisada (si no, el modal queda abierto y el
  usuario reenvía: duplicado).
  Excepciones a propósito: `perfil.js` (error en el modal) y la creación de
  variantes en lote (cuenta fallas). El 401 lo sigue resolviendo `sesion.js`.

**Herramientas (hist. §59)**
- **ESLint se corre solo con `npm run lint` desde la raíz** (`scripts/lint.mjs`),
  nunca a mano: antes de dar el resultado controla que las reglas se apliquen en
  cada zona y que haya leído cada `.js`/`.mjs`. ESLint ignora en silencio lo que
  no alcanza su config (hist. §54). Una carpeta nueva con código se suma a
  `CARPETAS` del script y a `eslint.config.mjs`.
- El `package.json` de la raíz es solo de herramientas (devDependencies) y **no**
  es `"type": "module"`: por eso la config es `.mjs`. Las dependencias de la app
  siguen en `backend/package.json`.
- Sin Prettier y con `formatOnSave` apagado: el estilo lo marca `.editorconfig`
  y nadie reformatea un archivo entero.
- **Scripts de verificación (hist. §60)**, desde la raíz: `npm run seed`,
  `npm run verificar-migracion` y `npm run regresion` (ver "Cómo verificar").
  Ninguno escribe en `backend/db/nexo.db`, y los que la leen fallan si su md5
  cambió. Reusan el arnés `levantarServidor` de `backend/test/`.
  - Una ruta `GET` nueva con `:id` se suma a `LISTADO_DE` de
    `regresion-head.mjs`: si no está, el script corta.
  - Un campo volátil nuevo (una hora) se suma a `normalizar`.

**Punto de venta (hist. §67)**
- **El turno de caja es por cuenta de tesorería de tipo efectivo**, no por
  usuario, con un solo turno abierto por caja (índice parcial).
- **Arqueo:** al abrir y al cerrar, si lo contado no coincide con el saldo, se
  registra un movimiento `manual` por la diferencia. El saldo de la caja
  queda siempre en lo último que se contó.
- **Los movimientos de un turno se delimitan por id** de
  `movimientos_tesoreria` (`desde_movimiento_id` y `hasta_movimiento_id`),
  porque esa tabla guarda la fecha sin hora.
- **Auditoría del turno:** `entidad cuenta_tesoreria`, acción
  `cambiar_estado`, `operacion_tipo turno_caja`. Así no hizo falta
  reconstruir `auditoria` para sumar una entidad nueva a su `CHECK`.
- **Venta de mostrador sin cliente:** va al cliente "Consumidor final" de la
  empresa, y a ese cliente no se le fía, tampoco si llega su id (hist. §68).
- **Pantalla (hist. §68):**
  - el precio sale del catálogo y no se edita;
  - el vuelto sale solo del efectivo, y el efectivo es siempre la caja del
    turno;
  - la caja elegida se recuerda por dispositivo y la venta en curso por
    pestaña;
  - el POS no crea clientes.

**Comprobantes, catálogo y auditoría**
- **Comprobantes:** los datos del membrete viven en `organizaciones` (no hay
  tabla `datos_negocio`). Venta y compra no se imprimen como comprobante
  (hist. §19, §20).
- **Las categorías de producto tienen un solo nivel**, sin subcategoría
  (hist. §13).
- **Auditoría:** `actor` (operador/asistente/sistema) y `usuario_id` son
  columnas distintas a propósito (hist. §14, §16).
- **El asistente IA no opera productos con variantes activas** (hist. §34).

**Tipos de negocio, unidades y servicios (hist. §70)**
- **El tipo de negocio es un preset de datos** (`PERFILES_RUBRO` en
  `server.js`): unidad y tipo con que nace un producto, y qué módulos se ven.
  Nunca `if (rubro === …)` con lógica (CLAUDE.md §29).
- **Módulos:** `pos`, `presupuestos`, `compras` y `stock`. Ocultarlos es de la
  interfaz (`<html data-modulos>` y el router); los permisos siguen en
  `permisos.js`. `organizaciones.modulos` NULL = los del preset; cambiar el tipo
  sin mandar módulos vuelve al preset.
- **Unidad del producto:** `unidad`, `kg`, `g`, `l`, `ml` o `m`, validada en
  `server.js` y sin `CHECK`. Las cantidades ya eran REAL: el backend nunca
  exigió enteros.
- **Un servicio no maneja stock:**
  - `registrarMovimientoStock` no escribe nada para un servicio, y es el único
    punto que escribe stock;
  - las validaciones de stock lo saltean;
  - compras, ajustes y transferencias lo rechazan;
  - no aparece en Stock ni en los reportes de stock;
  - con stock, no se puede pasar a servicio.

## Cómo verificar un cambio (procedimiento de hist. §40–§49, scripts de §60)

1. **Nunca contra `backend/db/nexo.db`:**
   - apuntar el código a otra base con `NEXO_DB_PATH` (y `NEXO_BACKUP_DIR` al
     scratchpad, o `NEXO_BACKUP=off`); ya no hace falta copiar `backend/`;
   - anotar el md5 de la base real antes y después (los scripts lo hacen
     solos).
   - Para una base con datos: `npm run seed -- --db <ruta>` (empresa "Baseline
     SA", `admin1`/`clave-segura-1` y `emp1`/`clave-segura-2`).
2. **Regresión:** `npm run regresion`. Compara el árbol de trabajo contra
   `HEAD` (`-- --ref <ref>` para otra) con la misma base sembrada, en todos los
   `GET` y con los dos roles. `-- --db <ruta>` parte de una copia de esa base.
   La base la siembran el servidor **y el `seed.mjs` de la ref**: un paso nuevo
   del seed recién se compara en el commit siguiente (hist. §67).
   Cada diferencia que muestre hay que justificarla.
3. **Aislamiento:**
   - segunda empresa en la misma base:
     `npm run seed -- --db <ruta> --prefijo b --empresa "Otra SRL"` (o
     `--url` contra un servidor de prueba que ya corre);
   - probar cada acceso cruzado por su efecto en la base, no solo por el
     código HTTP.
4. **Cambios de esquema:** `npm run verificar-migracion`. Corre `db/index.js`
   tres veces sobre una base nueva, una copia de la real y cada backup de
   `backend/db/`, y controla:
   - que migren en un solo arranque y que el segundo no cambie nada;
   - integridad y FKs;
   - que el esquema final sea igual en todas y que no se pierdan filas;
   - que `schema.sql` tenga la forma final de cada tabla (hist. §64).

   En el CI corre solo el caso de base nueva, porque las bases no se versionan.
5. **`npm test` y `npm run lint` desde la raíz** (los mismos que corre el CI;
   `npm install` en la raíz trae ESLint). `npm test` es el inventario estático de rutas contra
   `permisos.js`): toda ruta nueva tiene que estar clasificada ahí, declarada
   en la columna 0 y con `soloAdmin` en la misma línea. También corre
   `backend/test/api.test.js`: levanta `server.js` como proceso hijo con base
   temporal (`servidor-de-prueba.js`: `levantarServidor`, `registrarEmpresa`,
   `crearEmpleado`, `crearCliente` con cookie) y fija los arreglos de la
   auditoría de hist. §57. Un endpoint nuevo con validación de entrada merece
   su caso ahí; el del límite por IP va último porque bloquea la IP local.
6. **En Windows**, matar los servidores de prueba por PID (`taskkill`):
   `pkill` no los encuentra.
7. **Frontend en navegador** (hist. §58): `playwright-core` instalado en el
   scratchpad contra el Chrome de `C:/Program Files/Google/Chrome`, servidor
   con base nueva (`NEXO_DB_PATH` al scratchpad, `NEXO_BACKUP=off`,
   `NEXO_INTERPRETE=stub`), empresa creada con `POST /api/auth/registro`.
   Para XSS: sembrar `<img src=x onerror="window.__xss=…">'"` en cada campo de
   texto, recorrer vistas, fichas, modales, filtros y asistente, y mirar
   `window.__xss`. Correr lo mismo contra el commit anterior (`git worktree`
   + junction de `node_modules`) como control: si ahí tampoco salta, la
   prueba no está probando nada.

## Qué sigue

El orden de trabajo es el **plan en dos semanas**, al final de esta
sección. Ya cuenta como planificación con el equipo (CLAUDE.md §27, §38).

**Auditoría general del 6 de octubre (hist. §57–§65): hechas las Fases 0 a 7**
(git, respaldo automático, backend, frontend, herramientas, scripts de verificación, limpieza
del repo, documentación al día y esquema).
Decidido con el usuario: seguridad y datos primero, antes de seguir con F6–F13.
`LICENSE` sigue sin agregarse hasta que el equipo decida cuál.
- **Fase 7: hecha** (hist. §64–§65). `schema.sql` tiene la forma final de cada
  tabla, `verificar-migracion` corre en el CI, `organizacion_id` es `NOT NULL` y
  el SKU es único por empresa. **La base real todavía no se migró:** lo hace el
  próximo `npm start`, con el respaldo automático antes. Si el arranque falla,
  el `ROLLBACK` la deja como estaba y se restaura el respaldo si hiciera falta.
El CI todavía no corrió nunca en GitHub: en local se probó en un clon limpio, en
Windows, y no en Linux (Docker Desktop estaba apagado).

**Etapa B, F6 en adelante (después de la presentación, o cuando una etapa del
plan toque ese dominio)** (otro dominio sin acoplamiento con estado ajeno;
candidatos: Proveedores o Clientes, que dejan su tabla, ficha y modal en el
dominio y siguen fijando el maestro con `fijarProveedores()` de
`core/maestros.js`; Caja también fija `cuentasTesoreria` ahí). Los maestros
compartidos que lee más de un dominio van a `core/maestros.js` con su
`fijarX()` (hist. §56). Los catálogos de Productos (categorías, listas,
depósitos) van con Productos: leen estado que reasigna `cargarProductos()`
(hist. §55). El patrón está probado en F3, F4 y F5 (hist. §54–§56): el módulo del
dominio se importa desde `app.js` con un import de efecto y se registra solo
(`alEntrarEnVista('v', ...)` o `registrar('cargar:x', ...)`); el que otros leen
exporta con `export let`, los demás usan `recargar('x')`, y las acciones de
otro dominio se piden con `invocar('x', ...)` (el dueño las registra, por
ejemplo `app.js` con `registrar('cobrar:venta', ...)`). `dominios/` nunca importa `app.js` (lo verifica el
test). **Auditoría y Papelera esperan a Stock, Caja y a los dominios que leen**:
reasignan o leen sus cachés (hist. §54). Los dominios grandes (ventas, compras,
productos) van al final. El seed ya está versionado (`npm run seed`, con el
empleado y su contraseña ya cambiada). El baseline de navegador sigue en el
scratchpad de la sesión y hay que recrearlo (`playwright-core` contra el Chrome
instalado). ESLint ya no: `npm run lint` desde la raíz (hist. §59).
Hist. §53 y §54 cuentan qué cubre cada prueba y las trampas.

**Para cerrar la Etapa A** (`organizacion_id NOT NULL` y SKU por empresa ya
están, hist. §65):
1. Poder apagar el registro público por configuración (por ejemplo, en una
   instalación de un solo comercio) y sumarle verificación de email o captcha.
   Ninguna de las dos se hizo: requieren decisión y, la segunda, un servicio
   externo.
2. Si algún día dos empresas necesitan el mismo nombre de usuario, elegir entre
   `UNIQUE(organizacion_id, usuario)` con la empresa en el login, o login por
   email (hist. §45).

**Pendientes chicos conocidos:**
- Filtrar `valor_anterior`/`valor_nuevo` de `GET /api/auditoria` por campos
  sensibles. Solo hace falta si se reabre ese endpoint al rol empleado.
- `gh` (GitHub CLI) no está instalado en la máquina de Santino. Los PR se
  abren desde el link de comparación de GitHub.

**Diseño (hist. §62–§63, §66, §72).** Todas las pantallas se revisaron en
claro, en oscuro y a 390 px, y las fechas ya se muestran en dd/mm/aaaa. Los
dos pendientes viejos (la tabla de evolución en el celular y el título
repetido de las fichas) quedaron resueltos en hist. §72.

**Plan en dos semanas (decidido el 19 de octubre de 2026).** El usuario adelantó
el plazo: el producto tiene que estar casi terminado hacia el **2 de noviembre
de 2026**. Después se arranca con publicidad, marketing y la presentación
presencial. Reemplaza al plan hasta el 1 de diciembre de hist. §66.
- **Quién decide:** el usuario delegó las decisiones técnicas y las básicas de
  negocio. Este plan es la planificación que piden CLAUDE.md §27 y §38: no hace
  falta confirmar etapa por etapa. Solo se le pregunta lo que el cliente final
  ve con precio, lo que cuesta plata y los trámites a su nombre.
- **Tamaño:** cada etapa se recorta a lo que entra en una o dos sesiones y se ve
  en una demo, completa y funcionando. Lo que queda afuera se anota como
  "después".
- **Cuenta:** suman unas 20 sesiones en 14 días. Si no da, se recortan desde
  el final: Tienda Nube, Mercado Libre y reportes (decidido por el usuario el
  19 de octubre: Mercado Libre y Tienda Nube van al final).

**Producto, en orden:**
1. ~~D: punto de venta y turno de caja~~ **hecha** (hist. §67 y §68). Para
   después: descuentos y precio editable en el mostrador, alta rápida de
   cliente y venta sin conexión.
2. **F: tipos de negocio, unidades y servicios: hecha** (hist. §70).
   Prioridad del usuario del 19 de octubre. Tipos: comercio general (incluye
   indumentaria y ferretería), carnicería, verdulería, kiosco o almacén,
   servicios y gimnasio.
3. ~~Rediseño visual, segunda parte~~ **hecha** (hist. §72): estructura de Dub
   (https://dub.co/ y su ficha de Refero) sobre el negro de Nexo, Inter y
   Satoshi, oscuro de partida y marco negro. Falta que el usuario lo vea y
   diga qué cambiaría.

4. ~~Alta de cuenta guiada y Configuración como sección propia~~ **hecha**
   (hist. §73):
   - alta en cinco pasos a pantalla completa, con tarjetas de tipo y
     "Próximamente";
   - Configuración como vista con páginas (negocio, tipo y secciones,
     comprobantes con vista previa, usuarios, cuatro catálogos y apariencia).
   - Falta que el usuario lo vea.
   - Para después:
     - las cuentas de tesorería como página (hoy en Caja, con sus saldos);
     - el logo del negocio;
     - avisar al salir de una página con cambios sin guardar (hoy se
       conservan, pero no se avisa);
     - una guía de primeros pasos en el Resumen para una cuenta nueva.

5. ~~Socios, cuotas e ingreso~~ **hecha** (hist. §74, ampliada en §75 con
   duraciones, varios planes y descuentos). Falta que el usuario vea §75. Lo que quedó para después está en hist. §75. Lo que sigue
   es lo que se decidió para la etapa. Módulo
   `socios`, activable en cualquier negocio y prendido en el gimnasio, que
   además compra y vende como un comercio.
   Decidido con el usuario el 19 de octubre:
   - planes con precio y duración (mensual, trimestral, anual);
   - la cuota vence desde la fecha de alta del socio;
   - control de ingreso en la recepción, que avisa si debe.
   - Diseño (CLAUDE.md §29):
     - el socio es un cliente;
     - cada cuota es una venta del servicio del plan, cobrada con el circuito
       existente;
     - cuotas generadas de forma idempotente por período, sin cron.
   - Al sumarlo (hist. §73):
     - `socios` va a `MODULOS` y `MODULOS_INFO` y al preset del gimnasio (hoy
       `pos compras stock`);
     - se saca el "muy pronto" de la descripción del gimnasio;
     - sus planes y descuentos eran páginas de Configuración; desde hist. §76
       son su propia vista, "Planes", en el menú principal.
6. **Varios negocios por cuenta** (1–2 sesiones). Decidido por el usuario el
   19 de octubre: "una cuenta podría tener más de un negocio sin problema".
   - Es la variante "un usuario en varias empresas con cambio de contexto" de
     CLAUDE.md §28, que estaba a definir y ahora está definida.
   - **Diseño a proponer antes de tocar el esquema** (CLAUDE.md §34):
     - una tabla `usuario_organizaciones` (`usuario_id`, `organizacion_id`,
       `rol`);
     - la empresa activa vive en la sesión (`sesiones.organizacion_id`) y se
       cambia con un selector arriba del menú;
     - "Agregar negocio" crea otra empresa con el mismo usuario como admin.
   - **Restricciones:**
     - el nombre de usuario sigue siendo único en todo Nexo y el login sigue
       sin pedir empresa (hist. §45);
     - el aislamiento por `organizacion_id` de la sesión no cambia: solo
       cambia de dónde sale.
7. **B2: PWA** (1 sesión).
   - Manifest, íconos y service worker con caché del shell: se instala desde el
     celular.
   - Sin conexión abre y muestra lo último que cargó; no escribe sin conexión
     (CLAUDE.md §31).
8. **Landing pública con planes y hosting** (1 sesión). Va antes de lo demás
   porque el marketing necesita una dirección pública. La landing se sirve
   desde el mismo Express. **Decisiones del usuario:** qué precios mostrar (si
   no hay respuesta, va "consultanos") y dónde se publica (hosting gratis o
   pago, y si se compra un dominio).
9. **C: IVA** (2 sesiones).
   - Condición fiscal de la empresa (responsable inscripto, monotributo o
     exento) y del cliente.
   - Alícuota por producto, 21% por defecto. `precio_unitario` sigue siendo el
     precio final con IVA incluido.
   - Cada renglón guarda su alícuota y su IVA.
   - Letra automática: A de inscripto a inscripto, B de inscripto a cualquier
     otro, C si el emisor es monotributista. La factura A discrimina el IVA.
   - Reporte de IVA ventas y compras.
   - La retención de Mercado Pago queda para después.
10. **E: ARCA en homologación** (2 sesiones, después de C). Facturación
   electrónica real contra el ambiente de prueba de ARCA, con CAE de prueba.
   - Gratis.
   - WSAA + WSFEv1 implementados directo en el backend. No se usa AfipSDK: su
     producción pasa por una nube paga.
   - La firma del ticket de acceso (CMS) necesita `node-forge`, una
     dependencia sin costo; `node:crypto` no la tiene.
   - Certificado y clave por empresa (CLAUDE.md §33).
   - Reintento sin duplicar: antes de emitir se consulta el último número
     autorizado.
11. **I: voz y WhatsApp** (2 sesiones).
   - Dictado con la Web Speech API del navegador (es-AR, sin costo), con el
     mismo flujo de confirmación.
   - WhatsApp Cloud API como canal del asistente, con el número de prueba que
     da Meta: hasta 5 teléfonos y gratis. Las respuestas dentro de la ventana
     de 24 h no se cobran.
     - La política de "AI Providers" de Meta (2026) cobra a asistentes de IA de
       uso general, y solo en algunos países (hoy, Brasil). Ni el asistente de
       Nexo ni la Argentina entran.
   - Las notas de voz de WhatsApp se transcriben con Gemini, que ya se usa.
   - Consultas de solo lectura en lenguaje natural ("¿cuánto vendí este
     mes?").
12. **H: reportes** (1 sesión, segundo en recortarse): ventas por vendedor y
    comparación contra el mismo período del año anterior.
13. **Cierre** (1 sesión).
    - Datos de demo realistas.
    - Pasada final de diseño.
    - Ensayo de la demo.

14. **G: Mercado Libre** (2 sesiones). Arma también la base común de
   integraciones de CLAUDE.md §32:
   - credenciales OAuth por empresa;
   - tabla de vínculos publicación ↔ producto o variante;
   - log de sincronización.
   - Funciones:
     - Nexo empuja stock y precio de las publicaciones vinculadas;
     - las ventas de Mercado Libre entran por webhook como ventas de Nexo, por
       la misma lógica que una venta cargada a mano, y sin duplicarse.
   - Para la demo, usuarios de prueba de Mercado Libre (se crean por API).
   - Gratis.
15. **G: Tienda Nube** (1–2 sesiones), sobre la misma base. Gratis para
   partners, con una tienda demo.

**Lo que no es el producto: trabajos del Classroom** (decidido el 19 de
octubre).
- **Qué son:** los documentos que pide la profesora en el Classroom de la
  materia; por ejemplo, contabilidad, modelo Canvas de negocio y manual de
  usuario. El usuario va a pasar la lista completa.
- **Cómo se hacen:**
  - en **sesiones aparte**, sin mezclarlas con las del producto;
  - con **commits específicos de cada trabajo**: el usuario les saca captura
    para entregar en el Classroom. Un commit por documento, con un mensaje
    claro (por ejemplo `docs(classroom): modelo Canvas de negocio`), sin
    código del producto en el mismo commit.
  - Los documentos van en `docs/classroom/`.
- **Prioridad:** terminar el producto lo antes posible, así esos documentos
  describen un producto ya definido. Igual, algunos se van haciendo en estos
  días, intercalados.
- **Después:** publicidad, marketing y la presentación presencial.

**Trámites del usuario** (todos gratis; hay que tenerlos antes de la etapa que
los usa; conviene arrancarlos ya, porque algunos tardan días):
- **ARCA (etapa 10):**
  - clave fiscal nivel 3, la suya o la de un adulto; la app de ARCA la da
    validando el DNI;
  - adherir el servicio "WSASS – Autogestión Certificados Homologación";
  - generar el certificado de prueba con el pedido (CSR) que se prepara acá, y
    autorizarlo para el servicio "wsfe".
  - **Quién (19 de octubre):** lo va a hacer el padre del usuario, que es
    monotributista. Es un solo certificado de prueba para todos los negocios
    de la demo, y no toca su monotributo real.
    - Como es monotributista, las facturas de prueba salen C.
    - Para mostrar también A y B, probar si homologación lo permite con su
      CUIT.
  - **Cómo se ve en la demo (decidido con el usuario el 19 de octubre):** es
    una presentación escolar pero seria, con directivos y padres.
    - La factura impresa lleva los datos del negocio de demo cargados en
      Configuración, no los del padre: su CUIT es solo un dato interno.
    - Todo comprobante emitido en homologación lleva la leyenda "Comprobante
      de prueba – sin validez fiscal".
    - Se intenta emitir A, B y C. Homologación en general no controla la
      condición fiscal; se confirma en la primera prueba.
    - Se factura en vivo, con un video grabado antes de respaldo (los
      servidores de prueba de ARCA a veces se caen) y el CAE simulado como
      última red.
  - **En producción (decidido por el usuario el 19 de octubre):**
    - Nexo se inscribe en ARCA con su propio CUIT, clave fiscal nivel 3 y un
      certificado de producción;
    - cada cliente le delega el servicio wsfe a Nexo y emite con su propio
      CUIT, sin tener certificado.
    - Seguir soportando que un negocio suba su propio certificado.
    - CLAUDE.md §33 quedó corregido en ese sentido.
    - Que Nexo facture sus suscripciones (inscripción fiscal de Nexo) es
      aparte: hay que charlarlo con un contador.
- **Dirección pública con HTTPS (etapa 11):** Mercado Libre, Tienda Nube y
  WhatsApp le avisan a Nexo por webhook. Sin hosting pago: cuenta gratis de
  ngrok con su dominio fijo, apuntando al servidor local.
- **Mercado Libre (etapa 14):** cuenta propia de Mercado Libre y crear la app
  en su portal de desarrolladores.
- **Tienda Nube (etapa 15):** registrarse en el programa de partners, crear una
  tienda demo y la app.
- **Meta (etapa 11):**
  - cuenta de Meta for Developers;
  - una app con el producto WhatsApp;
  - cargar hasta 5 teléfonos de prueba.

**Después de la presentación:**
- **ARCA en producción.** Cada empresa usa su propio certificado, o delega el
  servicio en el CUIT de Nexo.
- **Producción de WhatsApp.** Pide verificar un negocio real ante Meta.
- **Fuera de alcance (CLAUDE.md §39):**
  - métricas de Meta Ads: la API es gratis, pero leer cuentas de otros negocios
    pide revisión de la app y verificación de negocio, semanas de trámite;
  - catálogo de Instagram.
- **Modularización F6–F13.** Se avanza cuando una etapa toca un dominio.
- **Migrar a Postgres.**
- **Registro público:** poder apagarlo y sumarle verificación.
