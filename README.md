# Nexo 🔗

> Sistema de gestión integral para PyMEs y emprendimientos, con interfaz conversacional por voz.

Nexo centraliza productos, stock, compras, ventas, clientes, proveedores,
tesorería y facturación en un solo sistema, pensado para que un comercio lo use
de verdad y compita con los sistemas de gestión que ya existen en el mercado
argentino (referencias: Dux Software, Contagram). Las reglas de negocio y de
arquitectura completas viven en [`CLAUDE.md`](CLAUDE.md); este README es la
puerta de entrada rápida.

**Está publicado en https://nexosystem.duckdns.org**, por ahora para pruebas.

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
carnicería, verdulería, kiosco, servicios, gimnasio), con varios negocios por
cuenta y uso desde el celular como app instalable (PWA). Lo que sigue (ver
[Roadmap](#-roadmap)): IVA discriminado y facturación electrónica con ARCA,
voz y WhatsApp, reportes avanzados e integraciones con Mercado Libre y Tienda
Nube.

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
  (asistente IA con Gemini). El mail sale por un cliente SMTP propio sobre
  `node:tls`, sin dependencia. Criterio del proyecto: minimizar dependencias
  y costo de infraestructura, no funcionalidad.
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
descomentar lo que haga falta (puerto, clave de Gemini, carpeta de respaldos,
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
│   ├── server.js       → rutas de la API (un solo archivo, ~14.800 líneas)
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

## 👨‍💻 Integrantes y Roles

| Nombre | Rol | GitHub |
|--------|-----|--------|
| Joaquin Tosi | Scrum Master / Desarrollador | joacotosi68 |
| Santino Solla | Desarrollador | santisolla13 |

---

## 📌 Estado del Proyecto

🚧 En desarrollo activo y **publicado** en https://nexosystem.duckdns.org
(para pruebas, sin indexar en buscadores hasta cerrar los textos legales). El
MVP original (`CLAUDE.md §25`) está completo: es un sistema funcional de punta
a punta, no un prototipo.

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
- Reportes de ventas, compras y stock, y un Resumen con el resultado del
  período.
- Auditoría de operaciones, incluido login/logout.
- Asistente por lenguaje natural (Gemini) para registrar ventas, compras y
  gastos por texto, siempre con confirmación humana antes de ejecutar.
- **Panel de la plataforma** para quien administra Nexo: las cuentas, los
  negocios y cómo crecen, sin ver los datos de ningún negocio.

**Todavía no construido**, para no prometer de más (roadmap real en
`CLAUDE.md §38`): IVA discriminado y facturación electrónica con ARCA (los
trámites de homologación ya están hechos), voz y WhatsApp, reportes de ventas
por vendedor y comparativas entre períodos, integraciones con Mercado Libre y
Tienda Nube, notificaciones push y entrar con Google.

## 🗺️ Roadmap

El orden y el porqué de cada etapa están en `CLAUDE.md §38`. Cada etapa se
planifica con el equipo antes de arrancarla: estar en el roadmap no es una
autorización para empezarla (`CLAUDE.md §27`).

| Etapa | Qué | Estado |
|---|---|---|
| A | Multi-empresa (`organizacion_id`, aislamiento, alta de negocios) | Hecha, con varios negocios por cuenta |
| B | Modularizar `app.js` por dominio + PWA | PWA hecha; la modularización sigue en curso (`app.js` tiene ~7400 líneas, y 15 dominios ya están en `frontend/js/dominios/`) |
| C | IVA discriminado y categoría fiscal | Próxima |
| D | Punto de venta (POS) y turno de caja | Hecha |
| E | Facturación electrónica ARCA (homologación → producción) | Pendiente, depende de C; trámites de homologación listos |
| F | Perfiles de rubro y unidad de medida fraccionable | Hecha |
| G | Integraciones: Mercado Libre, Tienda Nube | Pendiente |
| H | Reportes avanzados y dashboard por rubro | Pendiente |
| I | IA: voz y WhatsApp | Pendiente |

Respaldos: cada arranque del servidor respalda la base antes de abrirla (con
rotación de 14; `NEXO_BACKUP_DIR` elige la carpeta), el servidor publicado lo
hace además todos los días, y `cd backend && npm run backup` lo hace a mano.
Pendientes de operación para producción real (`CLAUDE.md §35`): respaldo fuera
del servidor, límites de request y paginación de los listados.

El detalle sesión a sesión de qué se hizo y qué decisiones quedaron tomadas
vive en [`handoff.md`](handoff.md), en la raíz del repo.
