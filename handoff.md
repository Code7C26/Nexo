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
    siguiente número (hoy el último es §56);
  - acá se actualizan "Estado actual" y "Qué sigue";
  - si cambió alguna decisión vigente, se actualiza también esa lista.
- Nunca apilar secciones "Última etapa" en este archivo: así fue como llegó a
  6000 líneas.
- Lo que deja de ser cierto se corrige o se borra de acá. En el histórico no se
  reescribe nada.

## Estado actual (6 de octubre de 2026)

**Ramas.** El trabajo diario va sobre `solla`, la rama de Santino (decisión
del usuario, hist. §28): no se abre una rama por tarea. `Tosi` es la de
Joaquín.
- `solla` está sincronizada con `origin/solla`, salvo el commit de F5 si todavía
  no se pusheó.
- El PR #24 ya pasó la Etapa A y F0–F4 a `main`. `origin/main` tiene 2 commits
  que `solla` no (los merges): conviene traerlos antes del próximo PR. Pasar
  `solla` → `main` es por PR.

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
- Todavía no corrió **ninguna** migración de la Etapa A: el próximo
  `npm start` aplica §37–§49 de una vez.
- El arnés de hist. §48 ya simuló ese arranque sobre una copia, sin errores.
- Backup previo: `backend/db/nexo.db.backup-antes-etapa-a-20261005-210622`, y una
  copia fuera del repo en `~/Documents/nexo-backups/` (6 de octubre, mismo md5).
- **Respaldo automático** (`backend/db/respaldo.js`, auditoría de hist. §57): cada
  arranque respalda la base ANTES de abrirla, en `<repo>/backups/` (ignorada por
  git), con rotación de 14 y sin duplicar si no cambió nada. Si el respaldo falla,
  el arranque se corta. Variables: `NEXO_BACKUP=off` (lo apaga), `NEXO_BACKUP_DIR`
  (destino: conviene una carpeta sincronizada con la nube, porque por defecto está
  en el mismo disco), `NEXO_BACKUP_KEEP`. Manual: `cd backend && npm run backup`.
  Con `node --watch` cada reinicio con datos nuevos crea uno y los 14 rotan rápido.
- Tiene una sola organización ("Mi negocio") y un solo usuario, admin.

**Servidor**: `cd backend && npm start`, en el puerto 3000 (`PORT` lo cambia).
- No hay `.env`. `GEMINI_API_KEY` se pasa como variable de entorno al arrancar;
  sin ella el asistente responde 503 y el resto funciona igual.
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

**Comprobantes, catálogo y auditoría**
- **Comprobantes:** los datos del membrete viven en `organizaciones` (no hay
  tabla `datos_negocio`). Venta y compra no se imprimen como comprobante
  (hist. §19, §20).
- **Las categorías de producto tienen un solo nivel**, sin subcategoría
  (hist. §13).
- **Auditoría:** `actor` (operador/asistente/sistema) y `usuario_id` son
  columnas distintas a propósito (hist. §14, §16).
- **El asistente IA no opera productos con variantes activas** (hist. §34).

## Cómo verificar un cambio (procedimiento de hist. §40–§49)

1. **Nunca contra `backend/db/nexo.db`:**
   - apuntar el código a otra base con `NEXO_DB_PATH` (y `NEXO_BACKUP_DIR` al
     scratchpad, o `NEXO_BACKUP=off`); ya no hace falta copiar `backend/`;
   - anotar el md5 de la base real antes y después.
2. **Regresión:** levantar el código de `HEAD` y el nuevo en puertos distintos
   (por ejemplo 4732 y 4731), cada uno con su copia de la misma base, y
   comparar el JSON de los mismos `GET`.
3. **Aislamiento:**
   - crear a mano una segunda organización con su admin, con `scrypt` y los
     mismos parámetros que `hashPassword` de `server.js`;
   - probar cada acceso cruzado por su efecto en la base, no solo por el
     código HTTP.
4. **Cambios de esquema:**
   - correr `db/index.js` sobre una base nueva, una copia de la real y los
     backups de `backend/db/`;
   - confirmar que todas migran en un solo arranque, que el segundo arranque
     no cambia nada y que el esquema final es el mismo en todas (hist. §48).
5. **`cd backend && npm test`** (inventario estático de rutas contra
   `permisos.js`): toda ruta nueva tiene que estar clasificada ahí, declarada
   en la columna 0 y con `soloAdmin` en la misma línea. También corre
   `backend/test/api.test.js`: levanta `server.js` como proceso hijo con base
   temporal (`servidor-de-prueba.js`: `levantarServidor`, `registrarEmpresa`,
   `crearEmpleado`, `crearCliente` con cookie) y fija los arreglos de la
   auditoría de hist. §57. Un endpoint nuevo con validación de entrada merece
   su caso ahí; el del límite por IP va último porque bloquea la IP local.
6. **En Windows**, matar los servidores de prueba por PID (`taskkill`):
   `pkill` no los encuentra.

## Qué sigue

Ninguna etapa se arranca sin planificarla antes con el equipo (CLAUDE.md §27,
§38).

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
productos) van al final. El baseline de navegador, el seed y ESLint viven en el
scratchpad de la sesión: hay que recrearlos (copia del repo, `playwright-core`
contra el Chrome instalado, usuario empleado con la contraseña ya cambiada).
**ESLint se corre desde la carpeta que contiene los archivos** y se confirma con
un archivo de control que falle a propósito; si no, ignora en silencio lo que
queda fuera de su base y da "cero errores" sin leer nada (hist. §54). Hay 4
`no-unused-vars` viejos en `app.js` que se dejaron. Hist. §53 y §54 cuentan qué
cubre cada prueba y las trampas.

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

**Roadmap** (CLAUDE.md §38):
- B: modularizar `app.js` y la base de la PWA (en paralelo con A).
- C: IVA.
- D: POS y turno de caja.
- E: ARCA.
- F: perfiles de rubro.
- G: integraciones.
- H: reportes avanzados.
- I: voz y WhatsApp.
