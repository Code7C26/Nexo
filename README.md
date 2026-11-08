# Nexo 🔗

> Sistema de gestión integral para PyMEs y emprendimientos, con interfaz conversacional por voz.

Nexo centraliza productos, stock, compras, ventas, clientes, proveedores,
tesorería y facturación en un solo sistema, pensado para que un comercio lo use
de verdad y compita con los sistemas de gestión que ya existen en el mercado
argentino (referencias: Dux Software, Contagram). Las reglas de negocio y de
arquitectura completas viven en [`CLAUDE.md`](CLAUDE.md); este README es la
puerta de entrada rápida.

**Está publicado en https://nexosystem.duckdns.org.** Para verlo funcionando
sin crear una cuenta: **[Probar sin registrarse](https://nexosystem.duckdns.org/app#/probar)**
(se elige un negocio de ejemplo y se entra como su dueño, con semanas de
historia cargadas).

---

## 🧩 Problema

En muchos emprendimientos y PyMEs, la organización está fragmentada en múltiples archivos, planillas y herramientas que no se comunican entre sí. Esta descentralización genera pérdida de tiempo, mayor probabilidad de errores y dificultades para tomar decisiones informadas.

---

## 💡 Solución

Nexo centraliza toda la gestión en una única plataforma, con las operaciones
relacionadas entre sí (una venta descuenta stock, actualiza la cuenta
corriente y la tesorería, no son pantallas aisladas). Con visión de crecer
hacia una interfaz conversacional por texto y voz, permite automatizar y
optimizar procesos clave como:

- Productos, stock multidepósito y precios
- Compras, ventas, presupuestos y devoluciones
- Clientes, proveedores y cuentas corrientes
- Tesorería, gastos y facturación
- Reportes y dashboard de rentabilidad
- Punto de venta de mostrador con turno de caja
- CRM, trabajos, abonos y socios con cuotas, según el tipo de negocio

Todo en un solo sistema que se adapta al tipo de negocio (comercio,
emprendimiento, tienda online, carnicería, verdulería, kiosco, servicios,
gimnasio), con varios negocios por cuenta, uso desde el celular como app
instalable (PWA), un asistente que registra operaciones por texto, voz y
WhatsApp, y conexión con Tienda Nube, Mercado Libre y Mercado Pago. Lo que
sigue está en el [Roadmap](#-roadmap).

---

## 👥 Público Objetivo

PyMEs y emprendimientos que necesiten modernizarse y centralizar sus
operaciones de stock, ventas y administración, reemplazando planillas y
archivos dispersos por un sistema integral — desde el comercio de barrio
hasta negocios con varios puntos de venta.

---

## 🛠️ Stack Tecnológico

**Software (definitivo, no la propuesta inicial):**
- Backend: Node.js 22+ + Express, SQL crudo (sin ORM) sobre SQLite vía
  `node:sqlite`.
- Frontend: HTML, CSS y JavaScript vanilla, sin build step ni framework,
  partido en módulos ES por dominio (`CLAUDE.md §31`) e instalable como PWA.
- Base de datos: SQLite (`backend/db/nexo.db`), esquema versionado en
  `backend/db/schema.sql` y migraciones idempotentes en `backend/db/index.js`.
  Se escribe con SQL portable pensando en migrar a Postgres cuando haga falta
  soportar múltiples empresas en producción concurrente (`CLAUDE.md §34`).
- Dependencias de producción reales: solo `express` y `@google/genai`
  (Gemini, el respaldo del asistente IA). Todo lo demás está hecho sobre
  Node, sin librerías: Groq (la IA principal) y Whisper (la voz) con `fetch`;
  el mail con un cliente SMTP propio sobre `node:tls`; la factura electrónica
  de ARCA (WSAA y WSFEv1, con la firma CMS armada con `node:crypto`); Tienda
  Nube, Mercado Libre, Mercado Pago y WhatsApp; y el respaldo cifrado
  (AES-256-GCM) a Backblaze B2 con la firma SigV4 propia. Criterio del
  proyecto: minimizar dependencias y costo de infraestructura, no
  funcionalidad.
- Publicación: una VM gratuita de Oracle Cloud con Caddy (HTTPS) delante de
  Node, que se actualiza sola con lo que llega a `main` con el CI en verde
  (`deploy/`, guía en `docs/publicar.md`).

---

## 🚀 Cómo correrlo

Requisitos: Node.js 22.13 o superior (usa `node:sqlite`, que desde 22.13 ya
no necesita `--experimental-sqlite`; `.nvmrc` fija la 22).

```bash
cd backend
npm install
npm start          # levanta el servidor en http://localhost:3000
```

Configuración opcional: copiar `.env.example` como `.env` en la raíz y
descomentar lo que haga falta (puerto, clave de la IA, carpeta de respaldos,
etc.). `npm start`, `npm run dev` y `npm run backup` lo leen solos; sin `.env`
el servidor arranca igual.

Antes de arrancar, `npm start` y `npm run dev` bajan una sola vez Satoshi, la
fuente de los títulos, de Fontshare (`scripts/fuentes.mjs`; a mano:
`npm run fuentes` desde la raíz). Su licencia no permite redistribuirla, así
que no está en el repo. Si no hay conexión, los títulos se ven con Inter y la
app funciona igual.

El frontend es estático: `backend/server.js` lo sirve directamente desde
`/frontend`, así que con el backend arriba ya está disponible en el mismo
puerto — no hace falta un segundo proceso ni build.

La landing pública está en `/` y la app en `/app`. En el primer arranque,
si no hay ningún usuario en la base, la pantalla de sesión ofrece directamente
el alta: el negocio, su tipo y su primer administrador. Después, cualquiera
crea su cuenta desde "Creá una cuenta" del login, en un alta guiada en pasos
que confirma el mail con un código de 6 números (con un tope de intentos por
IP). Sin mail configurado y fuera de producción, el código sale en la consola
del servidor. `NEXO_REGISTRO=off` cierra el alta pública.

### Tests

Desde la raíz del repo (el `npm install` de la raíz solo trae ESLint):

```bash
npm install
npm test            # node --test del backend: rutas y permisos, API, mail, cuentas, planes, baja y módulos del frontend
npm run lint        # ESLint sobre frontend/js, backend y scripts
```

Los dos corren en GitHub Actions en cada PR (`.github/workflows/ci.yml`).

---

## 📁 Estructura del Repositorio

```plaintext
/Nexo
├── /backend   → servidor Express, esquema y acceso a datos SQLite
│   ├── server.js       → rutas de la API (un solo archivo, ~21.000 líneas)
│   ├── permisos.js     → tabla versionada de permisos por rol y endpoint
│   ├── perfiles.js     → tipos de negocio y módulos que trae cada uno
│   ├── planes.js       → planes de Nexo (precios y topes)
│   ├── mail.js         → cliente SMTP propio, sin dependencia
│   ├── db/              → schema.sql + migraciones (index.js)
│   └── test/            → tests con node:test
├── /frontend  → UI (index.html, css/, js/), sin build step ni framework
│   └── js/      → app.js (lo que falta modularizar), core/ (compartido) y
│                  dominios/ (una pantalla por módulo ES); ver frontend/README.md
├── /scripts   → herramientas desde la raíz: lint, backup, seed,
│                verificar-migracion y regresión contra HEAD
├── /.github   → CI (GitHub Actions: lint + tests en cada PR)
├── /deploy    → servicio, Caddy y actualización automática del servidor
├── /docs      → documentación técnica y análisis del proyecto
├── /diseno    → mockups y diseño visual
├── /assets    → imágenes, íconos y recursos estáticos
├── handoff.md → estado y decisiones vigentes del proyecto, sesión a sesión
└── README.md  → este archivo
```

## 📚 Documentación

- **Manual de uso:** vive adentro de Nexo (Configuración › Ayuda › Manual de
  uso, con buscador), y el asistente lo usa para contestar "¿cómo hago…?". Se
  puede leer sin cuenta entrando a un
  [negocio de ejemplo](https://nexosystem.duckdns.org/app#/probar).
- **Reglas de negocio y arquitectura:** [`CLAUDE.md`](CLAUDE.md), con cada
  decisión numerada (§1 a §39) y citada desde el código.
- **Estado y decisiones, sesión a sesión:** [`handoff.md`](handoff.md), y el
  relato completo de cada etapa en
  [`docs/handoff-historico.md`](docs/handoff-historico.md).
- **Cómo se publica:** [`docs/publicar.md`](docs/publicar.md).
- **Investigaciones previas a cada etapa** (competencia, caja, celular, CRM,
  login y legales): [`docs/`](docs/).

## 👨‍💻 Integrantes y Roles

| Nombre | Rol | GitHub |
|--------|-----|--------|
| Joaquin Tosi | Scrum Master / Desarrollador | joacotosi68 |
| Santino Solla | Desarrollador | santisolla13 |

---

## 📌 Estado del Proyecto

🚧 En desarrollo activo y **publicado** en https://nexosystem.duckdns.org
(sin indexar en buscadores hasta cerrar los textos legales). El MVP original
(`CLAUDE.md §25`) está completo: es un sistema funcional de punta a punta, no
un prototipo. Lo cubren 319 tests automáticos (`npm test`) que corren en cada
Pull Request junto con el lint.

**Construido y funcionando:**
- Productos y servicios con atributos y variantes, unidades fraccionables (kg,
  litro, metro, hora), categorías, stock **multidepósito** con transferencias
  y listas de precios.
- Ventas (con devoluciones y notas de crédito) y compras (con devoluciones a
  proveedor), con costo promedio ponderado y prorrateo de costos adicionales.
- Clientes, proveedores y sus cuentas corrientes, con vencimientos y aging.
- Tesorería, gastos, presupuestos y facturación de monto simple.
- **Punto de venta** de mostrador: lector de código de barras o cámara, cobro
  con varios medios y turno de caja con arqueo.
- **Tipos de negocio** (comercio, emprendimiento, carnicería, verdulería,
  kiosco, servicios, gimnasio) y funciones que se suman o se sacan: CRM con
  embudo de consultas, trabajos con agenda, abonos mensuales, y socios con
  planes, cuotas e ingreso.
- **Multi-empresa:** varios negocios por instalación con los datos aislados,
  y varios negocios por cuenta con su rol en cada uno.
- **Cuentas:** se entra con el mail (confirmado con un código), se invita a
  cada persona por mail, se recupera la contraseña por mail, hay términos y
  privacidad, y un negocio o una cuenta se descarga y se da de baja.
- Dos roles, **admin** y **empleado**: el empleado no ve costos ni márgenes
  (filtrado en el backend, no solo escondido en la UI). Permisos versionados
  en `backend/permisos.js` y cubiertos por un test de inventario de rutas.
- **Planes** (Gratis, Emprendedor, Pro) con topes de uso, y una landing
  pública con los precios.
- **PWA:** se instala en el celular, abre sin conexión con lo último que
  cargó y tiene un diseño propio para la pantalla chica.
- Reportes de ventas, compras y stock, y un **Resumen** en piezas que cada
  persona ordena: resultado del período contra el anterior o el año pasado,
  cuándo se vende, dónde entró la plata, quién vendió y la venta online por
  canal.
- **Producción:** recetas, producir con lo que salió de verdad, costo desde
  los materiales, y el packaging que se descuenta al vender.
- **Venta online:** Tienda Nube y Mercado Libre conectados (Nexo manda en el
  stock y el precio; cada pedido entra como venta una sola vez), y Mercado
  Pago con link de pago y la comisión de cada cobro.
- **Probar sin registrarse:** cinco negocios de ejemplo, uno por visitante,
  que se borran solos a los 3 días.
- Auditoría de operaciones, incluido login/logout.
- Asistente por lenguaje natural (Groq, con Gemini de respaldo) para
  registrar ventas, compras, gastos y devoluciones por texto, por voz o
  **por WhatsApp**, siempre con confirmación humana antes de ejecutar. La IA
  propone y nunca escribe en la base (`backend/interprete.js` ni siquiera la
  importa). Las preguntas de cómo se usa Nexo las contesta con el manual, en
  el navegador y sin la IA.
- **Manual de uso** dentro de la app (Configuración › Ayuda), con buscador.
- IVA discriminado por renglón, letra de comprobante automática, libro IVA, y
  factura electrónica con CAE de ARCA en el ambiente de homologación.
- **Panel de la plataforma** para quien administra Nexo: las cuentas, los
  negocios y cómo crecen, sin ver los datos de ningún negocio.

**Todavía no construido**, para no prometer de más (roadmap real en
`CLAUDE.md §38`): facturación electrónica en producción (hoy, homologación de
ARCA), la retención de Mercado Pago, preguntas al asistente sobre los números
del negocio, publicar desde Nexo en Mercado Libre, notificaciones push y
entrar con Google.

## 🗺️ Roadmap

El orden y el porqué de cada etapa están en `CLAUDE.md §38`. Cada etapa se
planifica con el equipo antes de arrancarla: estar en el roadmap no es una
autorización para empezarla (`CLAUDE.md §27`).

| Etapa | Qué | Estado |
|---|---|---|
| A | Multi-empresa (`organizacion_id`, aislamiento, alta de negocios) | Hecha, con varios negocios por cuenta |
| B | Modularizar `app.js` por dominio + PWA | PWA hecha; la modularización sigue en curso (28 dominios ya están en `frontend/js/dominios/`) |
| C | IVA discriminado y categoría fiscal | Hecha (falta la retención de Mercado Pago) |
| D | Punto de venta (POS) y turno de caja | Hecha |
| E | Facturación electrónica ARCA (homologación → producción) | Homologación hecha; falta producción |
| F | Perfiles de rubro y unidad de medida fraccionable | Hecha |
| G | Integraciones: Mercado Libre, Tienda Nube, Mercado Pago | Hecha |
| H | Reportes avanzados y dashboard por rubro | En curso: Resumen personalizable con preset por tipo de negocio y Venta online |
| I | IA: voz y WhatsApp | Hecha; faltan las preguntas sobre los números |
| J | Producción básica: recetas, producir, packaging | En curso: falta "¿cuántas puedo hacer?" |

Respaldos: cada arranque del servidor respalda la base antes de abrirla (con
rotación de 14; `NEXO_BACKUP_DIR` elige la carpeta), el servidor publicado lo
hace además todos los días, y `cd backend && npm run backup` lo hace a mano.
Además, cada noche se sube una copia cifrada fuera del servidor (Backblaze
B2), con la restauración probada, y GitHub Actions mira cada 10 minutos que el
sitio responda. Pendientes de operación para producción real (`CLAUDE.md §35`):
límites de request y paginación de los listados.

El detalle sesión a sesión de qué se hizo y qué decisiones quedaron tomadas
vive en [`handoff.md`](handoff.md), en la raíz del repo.
