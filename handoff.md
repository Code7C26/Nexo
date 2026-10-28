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
    siguiente número (hoy el último es §105);
  - acá se actualizan "Estado actual" y "Qué sigue";
  - si cambió alguna decisión vigente, se actualiza también esa lista.
- Nunca apilar secciones "Última etapa" en este archivo: así fue como llegó a
  6000 líneas.
- Lo que deja de ser cierto se corrige o se borra de acá. En el histórico no se
  reescribe nada.

## Estado actual (28 de octubre de 2026)

**Nexo está publicado: https://nexosystem.duckdns.org** (hist. §103, guía
en `docs/publicar.md`). Para pruebas, con `noindex` hasta que estén los
términos (Fase 3 de 8b).
- **Servidor:** Oracle Cloud, cuenta "Nexoapp", Brazil East.
  - VM.Standard.E2.1.Micro con 1 GB de memoria y 2 GB de swap, Ubuntu 24.04;
  - IP `137.131.218.182`, que se mantiene mientras exista la instancia;
  - SSH: `ssh -i "C:\Users\HP ULTRA 5\.ssh\nexo-oracle.key" ubuntu@137.131.218.182`.
- **Cómo corre:**
  - Caddy (https solo) → Node en 127.0.0.1:3000 → `/var/lib/nexo/nexo.db`;
  - el código está en `/opt/nexo` y las variables en `/etc/nexo/nexo.env`.
- **Se actualiza solo:** lo que llega a `main` con el CI en verde está en el
  servidor en unos 5 minutos (`deploy/actualizar.sh`). Si el arranque falla,
  vuelve al commit anterior.
- **Respaldos:** en cada arranque y todos los días a las 3:30, en
  `/var/lib/nexo/respaldos`.
- **La base del servidor es la real desde el 27 de octubre:** la copió
  `VACUUM INTO`. La de la compu quedó como copia vieja, y lo que se cargue
  ahí no sube.
- **Lo que tiene que hacer el usuario:**
  - entrar con su cuenta en el sitio, y desde ahí usar el servidor;
  - parar su `npm start` local cuando quiera: ya no hace falta;
  - **confirmar `NEXO_NEGOCIO_VENTAS=1`**: las consultas de la landing caen
    en el CRM de "Mi negocio" (lo elegí yo; su decisión era "un negocio
    suyo");
  - los enlaces de verificación que se mandaron antes apuntan a
    `localhost:3000`: reenviarlos desde el sitio (Mi cuenta) si hacen falta;
  - opcional: el token de DuckDNS en `/etc/nexo/duckdns.env` (pasos en la
    guía).
- **Pendiente de la publicación:**
  - el respaldo fuera de la VM (Object Storage);
  - **Oracle recupera las instancias gratis que pasan una semana casi sin
    uso.** Pasar a Pay As You Go lo evita, pero es una decisión de plata del
    usuario.
- **Lo que sigue: la Fase 3 de la etapa 8b** (términos, privacidad y edad).
  Hechas: Fases 1 (mail en la cuenta, hist. §102), 1b (invitaciones, hist.
  §104) y 2 (recuperar la contraseña, hist. §105, commiteada en `solla`, sin
  publicar).
- **Falta que el usuario confirme** que el mail de prueba de §101 llegó bien
  y cómo se ve. Desde el servidor salió otro el 27 de octubre.

**Nuevo: etapa 8b, login, mail, términos y edad** (8b en "Qué sigue").
Pedida por el usuario el 27 de octubre, después de ver la landing ("quedó
perfecta") y antes de seguir con cosas grandes. La investigación está hecha:
`docs/investigacion-login-legal.md`, con el plan en cuatro fases. El
hallazgo más grave: ninguna cuenta tiene mail, así que un admin que se olvida
la contraseña pierde su negocio.
- **Decidido el 27 de octubre:** el titular legal es Santino (19 años; sus
  datos van en `.env`, no en el repo público), y se acepta de 13 a 17 años en
  Gratis, con permiso de los padres.
- **El mail ya manda** (27 de octubre): `nexosystem.app@gmail.com` con
  contraseña de aplicación en el `.env` de la raíz (solo en la máquina de
  Santino; en `.env.example` están las variables vacías). `backend/mail.js` es
  un cliente SMTP propio sobre `node:tls`, sin dependencia, con
  `plantillaMail()` para el cuerpo y `NEXO_MAIL=stub` para los tests
  (`backend/test/mail.test.js`, servidor SMTP falso). `npm run probar-mail`
  manda uno de prueba (hist. §101).
- **Fase 1, hecha (hist. §102):**
  - el mail en la cuenta, con verificación por enlace;
  - el login y el alta con mail;
  - la página obligatoria "Sumá tu mail" para las cuentas de antes;
  - en Mi cuenta, cambiar el mail;
  - el aviso en el Resumen.
- **Fase 1b, hecha (hist. §104, commiteada en `solla`):** cada persona tiene
  su cuenta (decisión del usuario del 27 de octubre). El admin invita por mail
  desde Configuración → Usuarios → Invitar, y `POST /api/usuarios` ya no
  existe.
  - Quien no tiene cuenta la crea desde el enlace del mail, que le deja el
    mail confirmado.
  - Quien tiene cuenta ve la solicitud en el Resumen (o en el enlace) y la
    acepta.
  - Una cuenta sin ningún negocio entra igual: ve sus invitaciones y puede
    crear el suyo.
  - **Falta que el usuario lo vea.**
- **Fase 2, hecha (hist. §105):** "¿Te olvidaste la contraseña?" en el
  login, con un enlace por mail de un solo uso y 30 minutos. Usarlo cierra
  todas las sesiones, confirma el mail y avisa. El admin ya no resetea la
  contraseña de quien confirmó su mail. **Falta que el usuario lo vea.**
- **Pendiente nuevo (pedido del usuario del 28 de octubre): entrar con
  Google.** Está en "Qué sigue", 8b.
- **Gemini:** recomendado el plan pago con una sola clave de Nexo y un tope de
  frases por plan (sección 2.6). Falta que el usuario lo confirme, con los
  topes.

**En curso: etapa 8, planes, landing y publicación** (8 en "Qué sigue"),
en cuatro fases (§98 a §100 y la publicación). El plan está en el punto 8.
- **Fase 1, planes en el backend: hecha** (hist. §98), commiteada en
  `solla`.
- **Fase 2, el plan dentro de la app: hecha** (hist. §99), commiteada.
  Incluye el contacto `POST /api/publico/consulta`, adelantado de la Fase 3.
- **Fase 3, la landing: hecha** (hist. §100), commiteada en `solla`, sin
  pushear.
  - `/` es la landing pública, y la app pasa a `/app`;
  - suma privacidad, robots y sitemap, con capturas reales de la demo;
  - el usuario la vio el 27 de octubre: "quedó perfecta". La inspiración
    que dio fue escalafy.com.
  - **Privacidad es un borrador** para que el equipo revise el texto.
- **Fase 4, la publicación: hecha** (hist. §103). Está en
  https://nexosystem.duckdns.org, con `NEXO_URL_PUBLICA` y
  `NEXO_NEGOCIO_VENTAS=1` definidas.
- **Las decisiones del usuario ya están tomadas** (precios, topes de Gratis,
  Oracle Cloud y DuckDNS, contacto al CRM): ver hist. §98.
- **PWA y celular de verdad: hechos** (hist. §94 a §97), commiteados en
  `solla`, sin pushear. El diseño y la investigación están en
  `docs/investigacion-celular.md`.
  - **PWA:** se instala, y sin conexión abre con lo último que cargó. Suma la
    CSP.
  - **Navegación:** barra de abajo con las secciones del negocio y "Más".
  - **Pantallas:** formularios a pantalla completa, y el "atrás" los cierra.
  - **Listas:** de dos líneas, unos 10 renglones por pantalla en vez de 1.
  - **Filtros y alta:** los filtros en una hoja y un "Nuevo" flotante por
    vista.
  - **Falta que el usuario lo pruebe en su celular.** Para instalarla hace
    falta https o localhost: entrando a la compu por IP en la red de la casa
    se ve el diseño nuevo, pero no se instala ni abre sin conexión. Las
    opciones son ngrok (gratis, ver "Trámites"), o en Chrome del celular
    `chrome://flags` → "Insecure origins treated as secure" con la IP de la
    compu.
- **La auditoría es también del empleado** (hist. §93), sin costos ni filas
  de compras. Commiteado en `solla`; falta que el usuario lo vea.
- **Cuenta de demo para el profe (26 de octubre), en la base real:** usuario
  `prueba` / `prueba1234`, con dos negocios: "Comercio prueba" (#3) y "Gym
  prueba" (#4). Empleados: `vendedor.prueba` / `vendedor1234` (comercio) y
  `recepcion.prueba` / `recepcion1234` (gym, debe cambiar la clave al entrar).
  - **Mails (hist. §102):** `prueba` tiene `nexosystem.app+prueba@gmail.com` y
    `vendedor.prueba` tiene `nexosystem.app+vendedor@gmail.com`. Entran con el
    mail o con el usuario de siempre.
  - `recepcion.prueba` no tiene mail: al entrar pide la clave nueva y después
    el mail. Si se prueba, conviene usar `nexosystem.app+recepcion@gmail.com`.
  Todo se cargó por la API: productos con talles, lista mayorista, compras
  recibidas con envío, ventas de contado y a cuenta corriente, presupuestos,
  devolución, gastos, turnos de caja (uno cerrado con $500 de faltante y otro
  abierto), CRM en todas las etapas, y socios con cuotas e ingresos en el gym.
  Respaldo previo: `nexo-20261026-124111.db` en OneDrive. Los negocios #1 y #2
  del usuario no se tocaron (hist. §92).
- **Mi cuenta es una página de Configuración** (hist. §92): contraseña y
  cerrar sesión, para los dos roles. El círculo de perfil lleva ahí; el modal
  de antes se sacó.
- **CRM: hecho y commiteado en `solla`** (hist. §89 el backend, §90 la
  pantalla, §91 la unión con Clientes). **En el menú es "CRM"**, en el lugar
  de Clientes, y es una sola página con pestañas: Clientes (la base de
  siempre), Consultas, Para hoy, Dejaron de comprar y Números. Pedido del
  usuario del 26 de octubre: "se tiene que llamar CRM y tiene que estar
  combinado con la base de datos de clientes, todo en la misma página". Con
  el módulo apagado vuelve a decir "Clientes", sin pestañas. Tiene:
  - embudo con arrastrar y soltar, y en el celular una etapa por pestaña;
  - "Para hoy", también en el Resumen;
  - Dejaron de comprar, Números y alta rápida de tres campos;
  - la ficha pasa la consulta a cliente, presupuesto, venta o socio, y se gana
    sola;
  - en la ficha del cliente, sus consultas y su seguimiento;
  - las etapas, en Configuración.
  - **Falta que el usuario lo vea.** Su base real (gimnasio) ya lo tiene
    prendido (migrada el 26 de octubre, respaldo
    `nexo-20261026-120237.db` en OneDrive), con las etapas Consulta → Clase
    de prueba → Seguimiento.
- **Tipo de negocio fijo y funciones que se suman (hist. §88): hecho y
  commiteado en `solla`, sin pushear.** Configuración tiene "Funciones" y una
  página aparte para cambiar el tipo; el catálogo se llama según lo cargado,
  con pestañas Productos | Servicios cuando hay de los dos. Falta que el
  usuario lo vea. **Su base real es un gimnasio** (no Servicios, como decía
  esto antes) con `modulos` en NULL: el próximo `npm start` la deja en
  `pos crm compras stock socios` (hist. §89).
- **Falta que el usuario vea §78 a §87** (servicios, trabajos, agenda, abonos,
  primeros pasos y lo demás). Ya están pusheados y en `main`.
- **Arreglado un error de fechas** (hist. §82): desde las 21 h, toda operación
  quedaba con la fecha del día siguiente (el servidor usaba UTC). Ahora "hoy"
  es el día de la Argentina (`backend/fecha.js`). **Para decidir con el
  usuario:** si se corrigen las operaciones viejas que quedaron corridas.
- Guía de primeros pasos en el Resumen (hist. §81): hecha y commiteada.
- La ficha del cliente muestra sus trabajos y abonos (hist. §83).
- Un abono cobra todas sus cuotas pendientes de una vez (hist. §84).
- Configuración marca y avisa los cambios sin guardar (hist. §85).
- Presupuestos, ventas y Resumen dicen "servicio" en un negocio de servicios
  (hist. §86).
- Agenda de trabajos, semana y mes (hist. §80): hecha y commiteada, pedida por
  el usuario el 20 de octubre. Pestañas en Trabajos; sin cambio de esquema.
- Abonos mensuales (hist. §79): hechos y commiteados. Módulo `abonos`, con las
  cuotas armadas por el mismo `periodosPendientes()` que las de socios. Falta
  que el usuario lo vea.
- Servicios con funciones propias, primera parte (hist. §78): hecha y
  commiteada. El catálogo se llama "Servicios" en ese tipo de negocio, con
  formulario propio (descripción, duración, unidad `hora`), y el módulo nuevo
  `trabajos`: presupuesto → trabajo con día, responsable y estado → venta.
  Falta que el usuario lo vea.
- Varios negocios por cuenta (hist. §77) está hecho y commiteado: selector
  arriba del menú, "Agregar negocio" y el rol por negocio. El usuario lo vio
  y le gustó (20 de octubre): "que se vaya manejando por cuenta".
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
- `main` tiene todo hasta la Fase 1b (PR #30, publicado el 28 de octubre).
- **Desde el 28 de octubre se trabaja local** (propuesta del usuario): cada
  cambio se commitea en `solla`, sin push ni PR. Se publica cuando el usuario
  lo pide: Claude abre y mergea el PR con el CI en verde, por la API de
  GitHub (no hay `gh`), y el servidor lo toma solo en unos 5 minutos.
  Mientras tanto, el sitio público sigue en lo último que se mergeó.
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
- Migrada a §98 (planes) el 27 de octubre de 2026 en un `npm start`. Sus 4
  negocios quedaron en Pro sin vencimiento. Respaldo previo:
  `nexo-20261027-123610.db` en OneDrive.
- Migrada a §77–§79 el 25 de octubre de 2026 en un `npm start` (respaldo
  `nexo-20261025-225132.db` en OneDrive).
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
  al archivo. `npm test` no lo lee. En la máquina de Santino, `.env` tiene la
  clave del mail (hist. §101).
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
- **Se entra con el mail, y es único en todo Nexo** (hist. §102, reemplaza al
  "usuario único" de §45). El login no pide empresa. El nombre de usuario
  sigue siendo único y global (`POST /api/usuarios` lo controla así a
  propósito). En una cuenta nueva el usuario es su mail; las de antes entran
  también con el usuario viejo.
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
- **`GET /api/auditoria` es de los dos roles** (hist. §93). Al empleado se le
  podan los JSON de valor anterior/nuevo con `podarSensibles` (el filtro de
  `res.json` no entra en un string) y no le llegan las filas de `compra`,
  `pago` ni `devolucion_proveedor`. Un `login_fallido` con un usuario inexistente
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
  `RUBROS_PROXIMAMENTE` y `MODULOS_INFO` en `backend/perfiles.js` (nombre, descripción e
  ícono). El frontend los pide: `GET /api/auth/tipos-negocio` (pública) o
  `perfiles` de `GET /api/negocio`. Un tipo nuevo no se escribe en el HTML.
- **`PUT /api/negocio` es parcial:** escribe solo los campos que vienen.
  Configuración manda solo lo que cambió.
- **Los módulos de cada negocio quedan guardados** (hist. §88): el alta guarda
  los elegidos (o los del tipo), y ni el `PUT` ni un cambio de tipo los mueven.
  Volver al NULL = "los del tipo" reintroduce el problema de §88: cambiar el
  tipo apagaba secciones solo.
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

**Servicios y trabajos (hist. §78)**
- **El nombre del catálogo sale de lo cargado** (hist. §88), nunca de un `if`:
  solo productos, solo servicios, o "productos y servicios" con pestañas en
  Productos. Con el catálogo vacío, el del preset (`PERFILES_RUBRO.catalogo`).
  En el HTML va en `[data-termino]` y en el JS, `termino()` de
  `core/negocio.js`; para un tipo puntual, `terminoDeTipo()`.
- **Un trabajo no es un circuito propio:** al terminarlo crea la venta con sus
  renglones, que se cobra como siempre. Hasta ahí no mueve stock ni cuenta
  corriente.
- **Un presupuesto con trabajo sin cancelar no se convierte directo:** la venta
  sale al terminar el trabajo, y el presupuesto queda convertido en ella.
- **Trabajos es de los dos roles.** La auditoría va como entidad `cliente` con
  `operacion_tipo trabajo`, igual que los socios.
- **Los renglones del trabajo usan las filas de venta de `app.js`**
  (`items:*` del registro): un dominio no conoce el catálogo.
- **"Hoy" sale de `backend/fecha.js`** (hist. §82): `fechaDeHoy()` en JS y
  `HOY_SQL` dentro del SQL; todo INSERT pasa la fecha, nunca el `DEFAULT
  (date('now'))`, que es UTC. Una tabla nueva con fecha sigue esta regla.
- **La agenda es una pestaña de Trabajos** (hist. §80), no una vista aparte:
  `#/trabajos/lista|semana|mes`, y sin subruta, la última usada. El largo del
  bloque sale de `duracion_estimada` del backend.
- **Abonos y cuotas de socios comparten `periodosPendientes()`** (hist. §79):
  una sola cuenta de períodos. Un abono no es un socio (sin número, ingreso ni
  descuentos), por eso tiene su tabla. Alta y precio son admin; verlos y
  cobrarlos, de los dos roles. El modal de cobro avisa con el evento
  `cobro-registrado`.

**Varios negocios por cuenta (hist. §77)**
- **El rol y la baja son de cada negocio** (`usuario_organizaciones`).
  `usuarios` es solo la identidad: ya no tiene `rol` ni `activo`.
  - `usuarios.organizacion_id` es el negocio donde se creó la cuenta y no
    decide nada.
  - El negocio de cada request sale de `sesiones.organizacion_id`.
- **El login no pide negocio** (con el mail o el usuario viejo, hist. §102):
  entra al último que se usó.
- **Nombre y contraseña son de la persona.** Un admin solo los cambia si
  administra todos los negocios de esa persona (409 si no). Sacar esa regla
  deja tomar el negocio de otro.
- **Solo el admin agrega negocios.** El negocio nuevo nace con quien lo crea
  como admin, y la sesión pasa a él.
- **Pestaña vieja:**
  - toda llamada a `/api/` lleva `X-Nexo-Negocio` (lo suma `sesion.js`);
  - si no coincide con la sesión, el backend responde 409 y la pestaña
    recarga;
  - `/auth/*` y `/negocios*` quedan exentas.
- **Lo que se guarda en el navegador y tiene ids lleva el negocio en la
  clave:** `nexo.filtros.<org>.<contenedor>` y `nexo.pos.caja.<org>`. Una
  clave nueva de ese tipo sigue la misma regla.
- **Cambiar de negocio recarga la página** en la vista de inicio. Es el
  reseteo de la memoria de la app, como en el logout.

**Cuenta y mail (hist. §102)**
- **Se entra con el mail:**
  - el login acepta `email` o `usuario` y busca por los dos; si coinciden
    cuentas distintas, gana la del mail;
  - el alta lo recibe como `email_cuenta`, porque `email` es el del negocio
    (comprobantes), en el alta y en "Agregar negocio".
- **En una cuenta nueva, `usuarios.usuario` es su mail.** Al cambiar el mail,
  si el usuario era el mail viejo, pasa al nuevo: si no, el viejo seguiría
  entrando y nadie más podría usarlo.
- **Una cuenta sin mail no opera** (403 `falta_email` en `autenticar`, salvo
  `/auth/email`, `/auth/logout` y `/auth/cambiar-password`). `sesion.js` la
  manda a "Sumá tu mail" con `seguirCon()`: primero la contraseña forzada,
  después el mail.
- **Sin verificar se trabaja igual**, con el aviso en el Resumen y en Mi
  cuenta. La verificación es un `GET /verificar-mail?token=`:
  - vale 48 h, y solo el último enlace;
  - deja de valer si la cuenta cambió de mail;
  - un enlace ya usado sigue diciendo "verificado".
- **Los tokens de mail se guardan como SHA-256** en `tokens_cuenta`, sin
  `organizacion_id` (es de la cuenta). La Fase 2 (recuperar) usa la misma
  tabla con `tipo = 'recuperar'`.
- **Los mails salen después de responder** (`mandarSinEsperar`): un fallo de
  Gmail no corta la operación y queda en el log. Los enlaces usan
  `urlPublica(req)`. Fuera del navegador (un script contra otro puerto),
  definir `NEXO_URL_PUBLICA`.
- **Topes:** 5 envíos por hora y por cuenta (cambio y reenvío juntos), con
  `registroExcedido('mail:<id>')`.
- **Tests:** el arnés corre con `NEXO_MAIL=stub` y lee los mails con
  `leerMails()` y `ultimoEnlace()`. Cada cuenta del arnés es
  `<usuario>@nexo.test`.

**Invitaciones y cuentas sin negocio (hist. §104)**
- **A alguien se lo suma invitándolo** (`/api/invitaciones`, admin). No
  volver a crear cuentas con una contraseña elegida por el admin.
- **El enlace es `/app#/unirme/<token>`**, en el hash, y el token viaja por
  POST: no queda en ningún log. Cada envío cambia el token.
- **El enlace confirma el mail:** crear la cuenta o aceptar desde él lo deja
  confirmado. La lista de solicitudes adentro de Nexo es solo del mail
  confirmado, para que nadie acepte una invitación ajena con una cuenta hecha
  con un mail que no es suyo.
- **Al admin se le responde igual** exista o no una cuenta con ese mail.
- **Las pendientes cuentan para el tope de usuarios del plan.**
- **Una sesión puede no tener negocio** (`sesiones.organizacion_id` NULL):
  la cuenta que dieron de baja en todos sus negocios entra igual, pero
  `autenticar` solo la deja llegar a `/auth/*` y `/negocios*` (403
  `sin_negocio`). Una ruta nueva de negocio no necesita nada: nace cerrada.
- **`usuarios.organizacion_id` sigue NOT NULL:** toda cuenta nace en un
  negocio (registro o invitación). El rebuild a nulable queda para la cuenta
  que nazca sola (Google sin invitación).
- **`POST /api/negocios` no lleva `soloAdmin` en la firma:** con negocio
  controla el rol adentro; sin negocio crea el primero.
- **Arnés:** `crearEmpleado(servidor, …)` recibe el servidor (necesita sus
  mails), no la URL.

**Planes de Nexo (hist. §98)**
- **Precios, textos y topes viven solo en `backend/planes.js`.** La landing
  y el alta los piden a `GET /api/auth/planes`.
- **Todo plan tiene todas las funciones:** los separan los topes (usuarios,
  negocios, productos activos y ventas del mes), nunca un módulo apagado.
- **Una ruta nueva que crea algo con tope llama a `exigirLugarEnPlan()`.**
  - Se llama en la ruta, no en `crearVenta()`: las cuotas de socios y abonos
    se generan solas y nunca se frenan ni cuentan.
  - Una alta que crea productos dentro de una transacción la llama con
    `nuevos = 0` después del INSERT, así el throw la deshace.
- **El plan no se cambia por la API.** Se cambia con `npm run plan` en el
  servidor, y `PUT /api/negocio` no lo toca. Hacerlo editable desde la app
  dejaría a cualquier negocio pasarse a Pro gratis.
- **Plan vencido = Gratis, sin borrar nada:** el negocio sigue viendo y
  editando lo que tiene, solo no suma más allá del tope.
- **Los negocios que existían antes de §98 quedaron en Pro sin vencimiento**
  (las bases reales y la demo).
- **Contacto público (hist. §99):** `POST /api/publico/consulta` escribe solo
  en el negocio `NEXO_NEGOCIO_VENTAS` (Nexo se vende con Nexo). Sin esa
  variable responde 503.
- **`alEntrarEnVista()` admite varios handlers por vista** (hist. §99): corren
  en orden de registro.
- **El arnés de tests registra en Pro** (`registrarEmpresa`, `plan`). Un test
  de topes pide `plan: 'gratis'`.

**Landing y app (hist. §100)**
- **La app vive en `/app`; `/` es la landing**, y con sesión redirige a
  `/app`.
  - Un enlace o un `location` nuevo de la app no apunta a `/`.
  - Las rutas de `index.html` y de lo que se inyecta van absolutas (`/js/…`):
    `/app/` rompe las relativas.
- **El service worker solo guarda la navegación a `/app`.** Las páginas
  públicas no se guardan, para que no pisen la app sin conexión.
  - `landing.js` no va en `PRECACHE`.
  - En el manifest, `id` sigue siendo `/`.
- **La landing no repite datos del backend:**
  - precios, topes y tipos de negocio salen de `/api/auth/planes` y
    `/api/auth/tipos-negocio`;
  - el JSON-LD lo arma `server.js` desde `PLANES`.
- **Lo que tiene que ser absoluto (canónico, Open Graph, sitemap) usa
  `NEXO_URL_PUBLICA`.** Si no está, la URL sale del pedido.
- **La landing no promete lo que no existe:** ARCA y las integraciones
  aparecen como "muy pronto". Si una función cambia, se revisa el texto de la
  landing y de privacidad.

**PWA (hist. §94)**
- **Primero la red, y lo guardado solo si falla** (`frontend/sw.js`). No pasar
  a "primero lo guardado": sin build step serviría código viejo.
- **Un `.js` nuevo va a `PRECACHE` de `sw.js`**, y `npm test` falla si
  falta. Si cambia la forma de lo guardado, se sube `VERSION`: el service
  worker borra al activarse los cachés de otra versión.
- **Lo guardado de la API es de quien lo cargó:** la clave lleva el negocio y
  `sesion.js` lo borra en el login, el logout y el 401. Nunca guardar
  `/api/auth/*` (salvo `estado`) ni algo que no sea 200.
- **Sin conexión no se escribe** (CLAUDE.md §31): no hay cola de escrituras.
- **CSP sin scripts inline:** todo script va en un archivo. `arranque.js` es
  el que corre en el `<head>` antes de pintar.
- **`eslint.config.mjs` está protegido** por el hook `config-protection` del
  plugin ecc. `sw.js` declara sus globales con `/* global */`.

**Celular (hist. §95)**
- **Lo fijo abajo se apoya en `--abajo`** (la barra con el safe area; 0 en la
  compu). Un elemento flotante nuevo usa `bottom: calc(var(--abajo) + …)`.
- **Los destinos de la barra salen del menú lateral** (`PRIORIDAD` en
  `core/barra-inferior.js`), nunca del tipo de negocio. Una sección nueva de
  uso diario se suma a esa lista.
- **Un modal nuevo termina su formulario en `.btn-full`:** en el celular ese
  es el botón que queda fijo abajo.
- **El botón de alta de una vista nueva lleva `btn-nuevo`** (hist. §97): en
  el celular flota arriba de la barra. Uno solo por vista visible.
- **El "atrás" de los modales** vive en el observer de `core/ui.js`. Abrir un
  modal sin cambiar `hidden` (por ejemplo, con una clase) lo deja afuera.
- **Una lista nueva va en dos líneas en el celular** (hist. §96):
  - `lista-movil` en la tabla;
  - `m-titulo`, `m-valor` y `m-estado` en sus celdas;
  - la segunda línea con `celdaMovil()`, que escapa cada parte.
  - Una parte con prefijo va como `["vence", fecha]`, no con un template
    anidado: el chequeo de escape lo vería como HTML crudo.

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
  `backend/perfiles.js`, hist. §88): unidad y tipo con que nace un producto, y
  qué módulos trae al crear el negocio.
  Nunca `if (rubro === …)` con lógica (CLAUDE.md §29).
- **Módulos:** `pos`, `presupuestos`, `compras` y `stock`. Ocultarlos es de la
  interfaz (`<html data-modulos>` y el router); los permisos siguen en
  `permisos.js`. Se eligen al crear el negocio y se suman o sacan en
  Configuración → Funciones.
- **Cambiar el tipo de negocio no borra nada** (respondido al usuario el 20 de
  octubre):
  - desde hist. §88 solo cambia con qué unidad y tipo nace un producto nuevo
    (el menú ya no). Es una página aparte que lo dice antes de confirmar. Los
    productos que ya existen quedan como estaban;
  - los socios siguen siendo clientes y sus planes siguen en Productos;
  - con Socios apagado no se generan cuotas. Si se vuelve a prender, se generan
    de una las de los meses que pasaron a los planes que siguen activos.
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
     SA", `admin1@nexo.test`/`clave-segura-1` y
     `emp1@nexo.test`/`clave-segura-2`).
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
   Para XSS: el contexto va con `bypassCSP: true` (con la CSP de hist. §94 el
   `onerror` no correría aunque faltara el escape, y la prueba no probaría
   nada). Sembrar `<img src=x onerror="window.__xss=…">'"` en cada campo de
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
     - ~~avisar al salir de una página con cambios sin guardar~~ hecho
       (hist. §85);
     - ~~una guía de primeros pasos en el Resumen para una cuenta nueva~~
       hecha (hist. §81).

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
6. ~~Varios negocios por cuenta~~ **hecha** (hist. §77). Pedido del usuario del
   19 de octubre: "una cuenta podría tener más de un negocio sin problema".
   - Selector arriba del menú, "Agregar negocio" con el alta guiada y el rol
     por negocio. Falta que el usuario lo vea.
   - Lo que quedó para después está en hist. §77. Por ejemplo: invitar a otro
     negocio a alguien que ya tiene usuario, y dar de baja un negocio entero.
6a. **Servicios con funciones propias** (1–2 sesiones). Pedido del usuario del
   20 de octubre: "que en vez de productos se puedan agregar servicios" y que
   el tipo Servicios tenga más funciones. Diseño e investigación en
   `docs/investigacion-crm-servicios.md` §3:
   - ~~catálogo de servicios, con el nombre de la sección según el preset~~
     **hecho** (hist. §78);
   - ~~formulario propio (precio fijo o por hora, duración, unidad `hora`)~~
     **hecho** (hist. §78);
   - ~~trabajos (presupuesto aceptado → trabajo → venta)~~ **hecho** (hist.
     §78, módulo `trabajos`);
   - ~~abonos mensuales, con el mecanismo de las cuotas de socios~~ **hecho**
     (hist. §79, `periodosPendientes()` compartido);
   - el recordatorio de presupuestos enviados sin respuesta pasa al CRM (6b),
     dentro de "Para hoy".
6a2. ~~Tipo de negocio fijo y funciones que se suman~~ **hecha** (hist. §88).
   Pedido del usuario del 20 de octubre; decidido con él el 25 de octubre: el
   cambio de tipo queda en una página aparte que dice qué cambia, el nombre del
   catálogo sale de lo cargado, y su base real no se toca (le suma las
   funciones él). Falta que lo vea.
6b. ~~CRM adaptado a cada tipo de negocio~~ **hecho** (hist. §89 y §90).
   Pedido del usuario del 20 de octubre, **que llegue a la presentación**:
   consultas, clientes y clientes potenciales. Diseño en
   `docs/investigacion-crm-servicios.md` §2:
   - módulo `crm` con etapas por preset;
   - oportunidades y actividades;
   - pasar a cliente, presupuesto, socio o venta sin volver a cargar;
   - la lista "Para hoy";
   - clientes que dejaron de comprar.
   - Ni Dux ni Contagram tienen CRM: es diferencial.
   - Para después: que WhatsApp cree la consulta sola (etapa 11), el
     asistente que la anote ("me consultó Juan por…"), un formulario de
     contacto en la landing, mensajes por lote y automatizaciones de
     seguimiento.
7. ~~B2: PWA~~ **hecha** (hist. §94). Para después: notificaciones con Web
   Push.
7b. ~~**Celular de verdad**~~ **hecho** (hist. §94 a §97; pedido del usuario
   del 25 de octubre, muy importante). **Investigación hecha** (`docs/investigacion-celular.md`), y
   de ahí salen las fases que siguen, un commit y un § cada una:
   - ~~**Fase 2, base:**~~ **hecha** (hist. §95):
     - barra inferior con Resumen, las tres primeras funciones prendidas de
       `ingreso, socios, pos, trabajos, ventas, productos, clientes`, y
       "Más", que abre el cajón de siempre; se va la hamburguesa;
     - el asistente pasa a la topbar y las fichas llevan "volver";
     - los modales a pantalla completa, y el "atrás" los cierra;
     - `--control-h` de 44 px e inputs de 16 px;
     - un token `--abajo` para todo lo fijo abajo.
   - ~~**Fase 3, listas compactas:**~~ **hecha** (hist. §96):
     - la tabla con `lista-movil`; las celdas con `m-titulo`, `m-valor` y
       `m-estado`, más una `<td class="m-sub">` armada con `celdaMovil()`
       (`core/formato.js`), que en la compu no se ve;
     - dos líneas por fila;
     - sin selección múltiple ni precio editable en el celular.
   - ~~**Fase 4:**~~ **hecha** (hist. §97): filtros en hoja desde abajo, un
     "Nuevo" flotante por vista (`btn-nuevo`) y la pasada visual.

   El pedido original, como referencia: Hoy en el celular
   todo tiene el mismo tamaño que en la compu, solo más apretado: en Productos
   entran uno o dos renglones por pantalla (cada fila de tabla se vuelve una
   tarjeta alta con todas las columnas) y hay que deslizar todo el tiempo. Le
   pasó lo mismo con el sistema de su negocio de perfumes.
   - **Investigar primero, con capturas:** cómo resuelven las listas, las
     fichas, los formularios y la navegación en el celular otros sistemas de
     gestión y apps de comercio (Dux, Contagram, Mercado Pago, Tienda Nube,
     Shopify, Square, Loyverse y otros).
   - **Ideas a validar con esa investigación:** lista compacta de una o dos
     líneas por renglón (nombre, el dato clave y el estado, y lo demás en la
     ficha); barra de navegación abajo con las secciones de uso diario; botón
     flotante para "Nuevo"; filtros en una hoja que sube desde abajo; formularios
     a pantalla completa en vez de modales.
   - Va junto con la PWA: la app instalada es esta misma vista.
8. **Landing pública con planes y hosting: en curso.** Va antes de lo demás
   porque el marketing necesita una dirección pública. Las decisiones del
   usuario (27 de octubre) están en hist. §98. Son cuatro fases, un § y un
   commit cada una:
   - ~~**Fase 1 (§98), planes en el backend**~~ **hecha**.
   - ~~**Fase 2 (§99), el plan en la app**~~ **hecha**: página "Plan de Nexo",
     aviso en el Resumen, enlace en el toast del tope, marca en los
     comprobantes, tipo "Emprendimiento", `?plan=` en el alta y el contacto
     al CRM de ventas.
   - ~~**Fase 3 (§100), landing**~~ **hecha**:
     - `/` muestra la landing sin sesión y lleva a `/app` con sesión;
     - la app pasa a `/app` (con `start_url` y `PRECACHE` del service
       worker);
     - `landing.html`, `landing.css` y `landing.js` sin scripts inline, con
       capturas reales;
     - el formulario de contacto, contra `POST /api/publico/consulta` (ya
       hecho en §99);
     - página de privacidad, `robots.txt` y `sitemap.xml`.
   - ~~**Fase 4, publicación**~~ hecha (hist. §103), adelantada a la etapa
     8b por pedido del usuario:
     - carpeta `deploy/` con `Caddyfile`, `nexo.service`, `instalar.sh`,
       `actualizar.sh` y DuckDNS;
     - la guía `docs/publicar.md`;
     - HSTS en producción.
     - Los trámites del usuario son la cuenta de Oracle Cloud (pide tarjeta
       solo para verificar) y la de DuckDNS.
   - **Para después:** cobro online con Mercado Pago, un panel de
     administración de la plataforma, dominio propio y respaldo fuera de la
     VM.
   Lo que sigue es el planteo original de la etapa, como referencia:
   - **Planes (pedido del usuario del 25 de octubre):** se definen en esta
     etapa, con él. Hay que decidir en base a qué se cobra, qué suma cada
     plan más caro y cómo es la demo para probarlo.
   - El plan base va más barato que la competencia. El trabajo del Classroom
     de punto de equilibrio usó $ 19.900 por mes como provisorio (Dux desde
     $ 36.000 + IVA; Contagram, $ 58.900 + IVA): no es un precio decidido.
   - **Plan gratis (pedido del usuario del 25 de octubre):** Nexo tiene que
     servirle a cualquier negocio, también a un chico que vende medialunas en
     el colegio y quiere saber cuánto vende y cuánto gana. Quiere invitar a los
     emprendedores de su colegio. El plan gratis tiene límites, a definir en
     esta etapa (por ejemplo, cantidad de productos o de ventas por mes, un
     solo usuario, sin facturación electrónica). Para ese usuario, una
     entrada más simple (un tipo "Emprendimiento" con pocas secciones) se
     piensa en esta misma etapa.
   - **Publicidad de terceros en el plan gratis: recomendado no ponerla**
     (respondido al usuario el 25 de octubre; la decisión es suya): paga muy
     poco, mete scripts de terceros donde están los datos de los negocios, y
     Google restringe los anuncios a menores. La alternativa propuesta: el
     plan gratis funciona como vidriera, invita a pasar a un plan pago y lleva
     la marca "Hecho con Nexo".
8b. **Login, mail, términos y edad** (pedido del usuario del 27 de octubre,
   antes de la Fase 4 de publicación: sin esto la landing no se abre al
   público). Investigación y plan en `docs/investigacion-login-legal.md`:
   - ~~`backend/mail.js`~~ hecho (hist. §101).
   - ~~Fase 1: mail en la cuenta, verificado, y login con mail~~ hecha (hist.
     §102).
   - ~~Fase 1b: invitaciones por mail desde Configuración y cuentas sin
     negocio~~ hecha (hist. §104), sin el rebuild de `usuarios` (no hizo
     falta: ver el §).
   - ~~Fase 2: recuperar la contraseña~~ hecha (hist. §105). El reseteo del
     admin quedó solo para quien no confirmó su mail.
   - **Entrar con Google** (pedido del usuario del 28 de octubre, pendiente,
     sin fecha). Lo pensado:
     - gratis y sin dependencias: el botón de Google Identity Services y el
       ID token verificado en el backend con `node:crypto` contra las claves
       públicas de Google (`aud`, `iss`, `exp`, `email_verified`);
     - la CSP: el script de Google es de un dominio externo. Si no conviene
       abrirla, el flujo por redirección (OAuth code flow) no pide ningún
       script en la página;
     - el mail de Google cuenta como confirmado. Si ya hay una cuenta con ese
       mail, se vincula. Si no, nace una cuenta sin negocio: ahí sí hace falta
       el rebuild de `usuarios` (`organizacion_id` nulable);
     - trámite del usuario: el cliente OAuth en Google Cloud Console (gratis),
       con el dominio de Nexo.
   - Fase 3: `/terminos`, privacidad completa, la casilla de aceptación con
     su versión y la pregunta de edad.
   - Fase 4: descargar los datos, dar de baja el negocio y `NEXO_REGISTRO=off`.
   - Las migraciones son aditivas y están explicadas en el documento.
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
  - Los documentos van directo en `docs/`, junto a los otros trabajos (pedido
    del usuario del 25 de octubre: no hay carpeta `docs/classroom/`).
- **Hechos y entregados** (un PDF cada uno en `docs/`; el HTML de origen no
  se versiona):
  - informe económico, monetización y marco legal;
  - punto de equilibrio: plan base provisorio de $ 19.900 por mes, 84
    clientes con sueldos y 5 sin sueldos;
  - TAM, SAM y SOM:
    - TAM: 476.750 empresas empleadoras;
    - SAM: unos 2.770 negocios de Alta Gracia, la ciudad del equipo;
    - SOM: el 3%, unos 83 clientes.
  - Un trabajo nuevo que use estos números los toma de ahí, para que no se
    contradigan.
- **Prioridad:** terminar el producto lo antes posible, así esos documentos
  describen un producto ya definido. Igual, algunos se van haciendo en estos
  días, intercalados.
- **Después:** publicidad, marketing y la presentación presencial.

**Trámites del usuario** (todos gratis; hay que tenerlos antes de la etapa que
los usa; conviene arrancarlos ya, porque algunos tardan días):
- **ARCA (etapa 10):**
  - **Quién (cambiado el 28 de octubre, hist. §105):** Santino, con su propio
    CUIL y su clave fiscal. Reemplaza al padre (19 de octubre). En ARCA no
    hay "cuenta de Nexo": Nexo tendría CUIT propio solo como sociedad.
    Homologación es gratis y no lo inscribe en ningún impuesto. Es un solo
    certificado de prueba para todos los negocios de la demo.
  - **Pasos que le pasé:**
    1. Clave fiscal nivel 3 con la app Mi ARCA (DNI + selfie).
    2. En arca.gob.ar, Administrador de Relaciones de Clave Fiscal → Adherir
       servicio → ARCA → Servicios interactivos → "WSASS – Autogestión
       Certificados Homologación". Salir y volver a entrar.
    3. Pasarme su CUIL: acá se genera la clave privada y el pedido (CSR). La
       clave no se versiona, igual que el `.env`.
    4. En WSASS: Nuevo certificado (nombre `nexo-homologacion`), pegar el CSR
       y pasarme el `.crt`.
    5. En WSASS: Crear autorización a servicio, con ese certificado, el
       servicio "wsfe" y su propio CUIL como representado.
  - Sin inscripción fiscal, qué letras deja emitir homologación (A, B o C) se
    confirma en la primera prueba.
  - **Cómo se ve en la demo (decidido con el usuario el 19 de octubre):** es
    una presentación escolar pero seria, con directivos y padres.
    - La factura impresa lleva los datos del negocio de demo cargados en
      Configuración, no los de Santino: su CUIL es solo un dato interno.
    - Todo comprobante emitido en homologación lleva la leyenda "Comprobante
      de prueba – sin validez fiscal".
    - Se intenta emitir A, B y C. Homologación en general no controla la
      condición fiscal; se confirma en la primera prueba.
    - Se factura en vivo, con un video grabado antes de respaldo (los
      servidores de prueba de ARCA a veces se caen) y el CAE simulado como
      última red.
  - **En producción (decidido por el usuario el 19 de octubre):**
    - Nexo se inscribe en ARCA con su propio CUIT, clave fiscal nivel 3 y un
      certificado de producción. Ese CUIT es el de Santino como
      monotributista o el de una sociedad: cuesta plata por mes, así que se
      decide con un contador después de la presentación;
    - cada cliente le delega el servicio wsfe a Nexo y emite con su propio
      CUIT, sin tener certificado.
    - Seguir soportando que un negocio suba su propio certificado.
    - CLAUDE.md §33 quedó corregido en ese sentido.
    - Que Nexo facture sus suscripciones (inscripción fiscal de Nexo) es
      aparte: hay que charlarlo con un contador.
- **Dirección pública con HTTPS (etapa 11): ya está.** Mercado Libre, Tienda
  Nube y WhatsApp le avisan a Nexo por webhook, y desde hist. §103 llegan
  directo a https://nexosystem.duckdns.org. Ngrok ya no hace falta.
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
