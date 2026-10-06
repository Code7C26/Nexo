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
    siguiente número (hoy el último es §49);
  - acá se actualizan "Estado actual" y "Qué sigue";
  - si cambió alguna decisión vigente, se actualiza también esa lista.
- Nunca apilar secciones "Última etapa" en este archivo: así fue como llegó a
  6000 líneas.
- Lo que deja de ser cierto se corrige o se borra de acá. En el histórico no se
  reescribe nada.

## Estado actual (5 de octubre de 2026)

**Ramas.** El trabajo diario va sobre `solla`, la rama de Santino (decisión
del usuario, hist. §28): no se abre una rama por tarea. `Tosi` es la de
Joaquín.
- `solla` está 14 commits adelante de `origin/solla`, sin pushear (toda la
  Etapa A).
- `main` está 21 commits atrás de `solla`. Pasar `solla` → `main` es por PR.

**Construido.** El núcleo de CLAUDE.md §1–§27 está completo (ver "Estado real
del sistema" en `CLAUDE.md`). Facturación de monto simple, sin IVA ni ARCA.

**Etapa A del roadmap (multi-empresa, CLAUDE.md §28): núcleo hecho** (hist.
§37–§49). Todas las tablas de negocio tienen `organizacion_id` y todas las
consultas filtran por la empresa de la sesión, incluidos los cinco catálogos
(hist. §49). Lo que falta para cerrarla está en "Qué sigue".

**Base de datos real** (`backend/db/nexo.db`, en `.gitignore`):
- Todavía no corrió **ninguna** migración de la Etapa A: el próximo
  `npm start` aplica §37–§49 de una vez.
- El arnés de hist. §48 ya simuló ese arranque sobre una copia, sin errores.
- Backup previo: `backend/db/nexo.db.backup-antes-etapa-a-20261005-210622`.
- Tiene una sola organización ("Mi negocio") y un solo usuario, admin.

**Servidor**: `cd backend && npm start`, en el puerto 3000 (`PORT` lo cambia).
- No hay `.env`. `GEMINI_API_KEY` se pasa como variable de entorno al arrancar;
  sin ella el asistente responde 503 y el resto funciona igual.
- `NEXO_INTERPRETE=stub` reemplaza a Gemini por un parser determinista para
  pruebas (formato en `interpretarStub`, `backend/interprete.js`).

**Instalar desde cero funciona** (hist. §48): con `nexo.db` borrado, el primer
arranque crea todo y `POST /api/auth/bootstrap` da de alta el primer admin.

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
   - copiar `backend/` (con `node_modules`) al scratchpad, porque la ruta de la
     base está fija en `db/index.js`;
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
   en la columna 0 y con `soloAdmin` en la misma línea.
6. **En Windows**, matar los servidores de prueba por PID (`taskkill`):
   `pkill` no los encuentra.

## Qué sigue

Ninguna etapa se arranca sin planificarla antes con el equipo (CLAUDE.md §27,
§38).

**Para cerrar la Etapa A:**
1. Pasar `organizacion_id` a `NOT NULL` en las 15 tablas que lo tienen
   nullable. Cada una requiere rebuild; los catálogos ya nacen así.
2. Alta de empresa desde la API (hoy se crean a mano). Tiene que llamar a
   `sembrarCatalogosBase`, que habría que exportar de `db/index.js`.
3. Si algún día dos empresas necesitan el mismo nombre de usuario, elegir entre
   `UNIQUE(organizacion_id, usuario)` con la empresa en el login, o login por
   email (hist. §45).

**Pendientes chicos conocidos:**
4. Pasada visual en el navegador de Usuarios, Configuración, Auditoría y las
   pantallas de catálogos. En las sesiones de §45–§49 no hubo herramienta de
   navegador.
5. El alta de categoría, lista, cuenta y categoría de gasto no se audita (solo
   la edición).
6. Una lista o un depósito inactivo puede quedar como predeterminado si el
   `PATCH` omite `activa`/`activo`.
7. Decidir en `permisos.js` si listas, depósitos y categorías de gasto pasan a
   ser solo admin.
8. Filtrar `valor_anterior`/`valor_nuevo` de `GET /api/auditoria` por campos
   sensibles. Solo hace falta si se reabre ese endpoint al rol empleado.
9. `obtenerPreciosPorProducto` y `obtenerPreciosPorVariante` leen los precios
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
