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
    siguiente número (hoy el último es §62);
  - acá se actualizan "Estado actual" y "Qué sigue";
  - si cambió alguna decisión vigente, se actualiza también esa lista.
- Nunca apilar secciones "Última etapa" en este archivo: así fue como llegó a
  6000 líneas.
- Lo que deja de ser cierto se corrige o se borra de acá. En el histórico no se
  reescribe nada.

## Estado actual (14 de octubre de 2026)

**Ramas.** El trabajo diario va sobre `solla`, la rama de Santino (decisión
del usuario, hist. §28): no se abre una rama por tarea. `Tosi` es la de
Joaquín.
- `solla` tiene los commits de las Fases 3 a 6 de la auditoría (hist.
  §58–§61) sin pushear.
- `main` ya está mergeada en `solla` (los PR #24 y #25 pasaron la Etapa A y
  F0–F5). Pasar `solla` → `main` es por PR, y desde la Fase 4 el CI de GitHub
  Actions (`npm run lint` + `npm test`) corre en cada PR.

**Construido.** El núcleo de CLAUDE.md §1–§27 está completo (ver "Estado real
del sistema" en `CLAUDE.md`). Facturación de monto simple, sin IVA ni ARCA.

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
  `organizacion_id`. md5 de la base migrada: `8dc00857…` (la referencia para
  "la base real no cambió" en las verificaciones de ahora en adelante).
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
  `movimientos_cc_*`, atributos y variantes): heredan el aislamiento de su fila
  padre (hist. §43, §47).
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

**Diseño visual (hist. §62)**
- **Sistema visual:** azul birome (`--accent`) para toda acción y
  resaltador (`--highlight`) solo en la sección activa del menú y la cifra
  que concluye (`.ledger-item-total`). Está explicado al principio de
  `styles.css`. Sumar amarillo en otros lugares le saca el sentido.
- **Fuentes propias** en `frontend/fonts/` (sin Google Fonts, pensado para
  la PWA y una CSP sin dominios externos). `--font-mono` ya no es
  monoespaciada: las cifras se alinean con `tabular-nums`.
- **Íconos:** solo del sprite `frontend/img/iconos.svg` vía `icono()`
  (`core/iconos.js`) o `<use href="/img/iconos.svg#…">` en el HTML. Un ícono
  nuevo se baja de `lucide-static` y se agrega como `<symbol>`. Nada de
  emojis ni caracteres sueltos (✕, ▸, ←) como íconos.
- **Menú:** grupos `.nav-seccion`; los que son solo de admin llevan
  `.nav-seccion-admin` y se ocultan enteros para el empleado.

**Frontend (hist. §58)**
- **Todo dato que se imprime en HTML pasa por `esc()`** (`core/formato.js`),
  incluidos atributos `value="…"`. Lo exige `npm test`
  (`backend/test/plantillas-html.js`): un `${x.campo}` crudo en un template
  con etiquetas falla. El test no ve un string armado en otra variable ni lo
  que devuelve una función propia: esos se escapan donde se arman. La ficha de
  producto es la única que mete HTML en `valor` y escapa sus datos en el
  arreglo.
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

**Comprobantes, catálogo y auditoría**
- **Comprobantes:** los datos del membrete viven en `organizaciones` (no hay
  tabla `datos_negocio`). Venta y compra no se imprimen como comprobante
  (hist. §19, §20).
- **Las categorías de producto tienen un solo nivel**, sin subcategoría
  (hist. §13).
- **Auditoría:** `actor` (operador/asistente/sistema) y `usuario_id` son
  columnas distintas a propósito (hist. §14, §16).
- **El asistente IA no opera productos con variantes activas** (hist. §34).

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
   - que `schema.sql` no tenga `CHECK` atrasados.

   El aviso `!` de `schema.sql` incompleto es conocido (Fase 7).
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

Ninguna etapa se arranca sin planificarla antes con el equipo (CLAUDE.md §27,
§38).

**Auditoría general del 6 de octubre (hist. §57–§61), en curso: hechas las Fases 0 a 6**
(git, respaldo automático, backend, frontend, herramientas, scripts de verificación, limpieza
del repo y documentación al día).
Decidido con el usuario: seguridad y datos primero, antes de seguir con F6–F13.
`LICENSE` sigue sin agregarse hasta que el equipo decida cuál. Falta:
- **Fase 7:** consolidar este backlog; ver abajo "Para cerrar la Etapa A" (sumar
  SKU único por empresa e índices en la misma pasada de rebuilds).
  - Alinear `schema.sql` con la forma final: hoy le faltan 13 columnas, 7 índices
    y 4 vistas que suma `db/index.js` (lista en hist. §60). Es lo que
    `verificar-migracion` muestra como aviso.
  - Evaluar llevar `verificar-migracion` (al menos el caso de base nueva) al CI.
Los commits de las Fases 1 y 2 ya están en `origin/solla`; los de las Fases 3 a 6, no.
El CI todavía no corrió nunca en GitHub: la primera corrida real va a ser al abrir el
próximo PR `solla` → `main` (en local se probó en un clon limpio, en Windows; Docker
Desktop estaba apagado y no se probó en Linux).

**Etapa B, siguiente paso: F6** (otro dominio sin acoplamiento con estado ajeno;
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

**Para cerrar la Etapa A:**
1. Pasar `organizacion_id` a `NOT NULL` en las 15 tablas que lo tienen
   nullable. Cada una requiere rebuild; los catálogos ya nacen así.
2. Poder apagar el registro público por configuración (por ejemplo, en una
   instalación de un solo comercio) y sumarle verificación de email o captcha.
   Ninguna de las dos se hizo: requieren decisión y, la segunda, un servicio
   externo.
3. Si algún día dos empresas necesitan el mismo nombre de usuario, elegir entre
   `UNIQUE(organizacion_id, usuario)` con la empresa en el login, o login por
   email (hist. §45).

**Pendientes chicos conocidos:**
4. Pasada visual en el navegador de Usuarios, Configuración, Auditoría, las
   pantallas de catálogos y el login con el registro nuevo (hist. §51). En las
   sesiones de §45–§51 no hubo herramienta de navegador.
5. Decidir en `permisos.js` si listas, depósitos y categorías de gasto pasan a
   ser solo admin.
6. Filtrar `valor_anterior`/`valor_nuevo` de `GET /api/auditoria` por campos
   sensibles. Solo hace falta si se reabre ese endpoint al rol empleado.
7. `obtenerPreciosPorProducto` y `obtenerPreciosPorVariante` leen los precios
   de todas las empresas. No hay fuga, pero no escala.
8. `POST /api/facturas` no valida `condicion` (ni `neto`, `tipo`, `letra`, ya
   anotado en hist. §57): un valor fuera del `CHECK` de la tabla
   (`efectivo`/`transferencia`/`mercadopago`) da 500 en vez de 400
   (hist. §58).

**Diseño, siguiente pasada (hist. §62):** el rediseño se revisó en navegador
en Resumen, Productos, Ventas, Caja, Stock, Cuentas corrientes, login,
modales, asistente, barra de selección y menú del celular. Falta revisar a
ojo las fichas (venta, compra, cliente, producto), Presupuestos, Facturas,
Reportes de stock, Papelera, Auditoría y Usuarios. El placeholder del
asistente se corta en dos líneas (ya pasaba antes). El gráfico del Resumen
sigue con el estilo anterior (ejes y barras).

**Pendiente pedido por el usuario (14 de octubre de 2026): landing page pública.**
Una página de entrada, previa al login, donde el visitante vea qué es Nexo y los
planes, y pueda ingresar o crear su cuenta. Requiere definir con el equipo los
planes (qué incluye cada uno y su precio), que hoy no existen en el sistema: las
suscripciones por empresa son una etapa aparte (CLAUDE.md §28). Se sirve desde el
mismo Express, sin hosting extra.

**Roadmap** (CLAUDE.md §38):
- B: modularizar `app.js` y la base de la PWA (en paralelo con A).
- C: IVA.
- D: POS y turno de caja.
- E: ARCA.
- F: perfiles de rubro.
- G: integraciones.
- H: reportes avanzados.
- I: voz y WhatsApp.
