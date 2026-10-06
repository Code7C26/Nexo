# Nexo 🔗

> Sistema de gestión integral para PyMEs y emprendimientos, con interfaz conversacional por voz.

Nexo centraliza productos, stock, compras, ventas, clientes, proveedores,
tesorería y facturación en un solo sistema, pensado para que un comercio lo use
de verdad y compita con los sistemas de gestión que ya existen en el mercado
argentino (referencias: Dux Software, Contagram). Las reglas de negocio y de
arquitectura completas viven en [`CLAUDE.md`](CLAUDE.md); este README es la
puerta de entrada rápida.

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

Y, en las próximas etapas (ver [Roadmap](#-roadmap)): multi-empresa,
facturación electrónica con IVA vía ARCA, punto de venta de mostrador, uso
desde el celular como app instalable (PWA), adaptación a distintos rubros de
comercio (carnicería, verdulería, gastronomía, etc.) e integraciones con
Mercado Libre y Tienda Nube.

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
- Frontend: HTML, CSS y JavaScript vanilla, sin build step ni framework
  (con plan de modularización por dominio a medida que crece, ver `CLAUDE.md
  §31`).
- Base de datos: SQLite (`backend/db/nexo.db`), esquema versionado en
  `backend/db/schema.sql` y migraciones idempotentes en `backend/db/index.js`.
  Se escribe con SQL portable pensando en migrar a Postgres cuando haga falta
  soportar múltiples empresas en producción concurrente (`CLAUDE.md §34`).
- Dependencias de producción reales: solo `express` y `@google/genai`
  (asistente IA con Gemini). Criterio del proyecto: minimizar dependencias y
  costo de infraestructura, no funcionalidad.

---

## 🚀 Cómo correrlo

Requisitos: Node.js 22 o superior (usa `node:sqlite`, todavía experimental
en algunas versiones — anda bien en 22.5+ y 24).

```bash
cd backend
npm install
npm start          # levanta el servidor en http://localhost:3000
```

El frontend es estático: `backend/server.js` lo sirve directamente desde
`/frontend`, así que con el backend arriba ya está disponible en el mismo
puerto — no hace falta un segundo proceso ni build.

En el primer arranque, si no hay ningún usuario en la base, la pantalla de
sesión ofrece directamente el registro: el nombre del negocio y su primer
administrador. Después, cualquiera puede crear otra empresa desde el link
"Creá una cuenta" del login (`POST /api/auth/registro`, con un tope de 5
intentos por hora y por IP).

### Tests

```bash
cd backend
npm test            # node --test — hoy cubre el inventario de rutas y permisos
```

---

## 📁 Estructura del Repositorio

```plaintext
/Nexo
├── /backend   → servidor Express, esquema y acceso a datos SQLite
│   ├── server.js       → rutas de la API (un solo archivo, ~7000 líneas)
│   ├── permisos.js     → tabla versionada de permisos por rol y endpoint
│   ├── db/              → schema.sql + migraciones (index.js)
│   └── test/            → tests con node:test
├── /frontend  → UI (index.html, css/, js/), sin build step ni framework
│   └── js/      → app.js (lo que falta modularizar), core/ (compartido) y
│                  dominios/ (una pantalla por módulo ES); ver frontend/README.md
├── /docs      → documentación técnica y análisis del proyecto
├── /desing    → mockups y diseño visual
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

🚧 En desarrollo activo. El MVP original (`CLAUDE.md §25`) está **completo**:
hay un sistema funcional de punta a punta, no un prototipo, y el foco pasó a
las etapas que lo acercan a un producto comercializable.

**Construido y funcionando:**
- Productos con atributos y variantes, categorías, stock **multidepósito**
  (con transferencias entre depósitos) y listas de precios.
- Circuito completo de ventas (con devoluciones y notas de crédito) y
  compras (con devoluciones a proveedor y notas de crédito/débito), ambos
  con costo promedio ponderado y prorrateo de costos adicionales.
- Clientes, proveedores y sus cuentas corrientes, con vencimientos y aging.
- Tesorería (cuentas, movimientos, transferencias) y gastos.
- Facturación de monto simple, presupuestos.
- Reportes de ventas, compras y stock; dashboard de resumen.
- Usuarios con dos roles, **admin** y **empleado**: el empleado no ve
  costos ni márgenes (filtrado también en el backend, no solo escondido en
  la UI) y no tiene acceso a compras, tesorería ni a las pantallas de
  análisis — permisos versionados en `backend/permisos.js` y cubiertos por
  un test de inventario de rutas.
- Auditoría de operaciones sensibles, incluido login/logout.
- Asistente por lenguaje natural (Gemini) para registrar ventas, compras y
  gastos por texto, siempre con confirmación humana antes de ejecutar.

**Multi-empresa (Etapa A): núcleo hecho.** Todas las tablas de negocio llevan
`organizacion_id` y cada consulta filtra por la empresa de la sesión, así que
varios negocios conviven en una instalación con los datos aislados. Una empresa
nueva se da de alta desde la pantalla de login (registro público).

**Todavía no construido** (para no prometer de más), próximos pasos del
roadmap real (`CLAUDE.md §38`): IVA discriminado y facturación electrónica
con ARCA, punto de venta de mostrador con turno de caja, PWA instalable,
perfiles configurables por rubro de comercio, integraciones con Mercado Libre
y Tienda Nube, marca y unidad de medida como entidades propias,
subcategorías, ventas por vendedor, y la parte de IA/voz descripta en
`CLAUDE.md §21`/`§36` más allá del asistente por texto que ya existe.

## 🗺️ Roadmap

El orden y el porqué de cada etapa siguiente están en `CLAUDE.md §38`. Cada
etapa se planifica con el equipo antes de arrancarla — estar en el roadmap no
es una autorización para empezarla (`CLAUDE.md §27`).

| Etapa | Qué | Estado |
|---|---|---|
| A | Multi-empresa (`organizacion_id`, aislamiento, registro) | Núcleo hecho. Falta pasar `organizacion_id` a `NOT NULL` en 15 tablas y poder apagar el registro público |
| B | Modularizar `app.js` por dominio + PWA | En curso: hechos el núcleo compartido (`core/`) y 4 dominios (usuarios, configuración, mi cuenta, cuentas corrientes). `app.js` bajó de 9407 a 7408 líneas; faltan el resto de los dominios y la PWA (manifest, service worker, offline de lectura) |
| C | IVA discriminado y categoría fiscal | Pendiente |
| D | Punto de venta (POS) y turno de caja | Pendiente |
| E | Facturación electrónica ARCA (homologación → producción) | Pendiente, depende de C |
| F | Perfiles de rubro y unidad de medida fraccionable | Pendiente |
| G | Integraciones: Mercado Libre, Tienda Nube | Pendiente |
| H | Reportes avanzados y dashboard por rubro | Pendiente |
| I | IA: voz y WhatsApp | Pendiente |

Pendientes de seguridad y operación para producción real (`CLAUDE.md §35`):
backups de la base, recuperación de contraseña, HTTPS, límites de request y
paginación de los listados.

El detalle sesión a sesión de qué se hizo y qué decisiones quedaron
tomadas vive en [`handoff.md`](handoff.md), en la raíz del repo.
