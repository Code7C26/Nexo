# Nexo 🔗

> Sistema de gestión integral para PyMEs y emprendimientos, con interfaz conversacional por voz.

---

## 🧩 Problema

En muchos emprendimientos y PyMEs, la organización está fragmentada en múltiples archivos, planillas y herramientas que no se comunican entre sí. Esta descentralización genera pérdida de tiempo, mayor probabilidad de errores y dificultades para tomar decisiones informadas.

---

## 💡 Solución

Nexo centraliza toda la gestión en una única plataforma. A través de una interfaz conversacional con lenguaje natural, permite automatizar y optimizar procesos clave como:

- Control de productos e inventario
- Gestión de precios
- Administración de clientes
- Manejo de facturación

---

## 👥 Público Objetivo

PyMEs y emprendimientos recientes que necesiten modernizarse y centralizar sus operaciones de stock y administración, reemplazando planillas y archivos dispersos por un sistema integral.

---

## 🛠️ Stack Tecnológico

**Software (definitivo, no la propuesta inicial):**
- Backend: Node.js + Express, SQL crudo (sin ORM) sobre SQLite vía
  `node:sqlite`.
- Frontend: HTML, CSS y JavaScript vanilla, sin build step ni framework.
- Base de datos: SQLite (`backend/db/nexo.db`), esquema versionado en
  `backend/db/schema.sql` y migraciones idempotentes en `backend/db/index.js`.

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

En el primer arranque, si no hay ningún usuario en la base, el propio login
ofrece un flujo de "bootstrap" para crear el primer administrador.

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
├── /frontend  → UI (index.html, css/, js/app.js), sin build step
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

🚧 En desarrollo activo — ya pasó la etapa de definición: hay un sistema
funcional de punta a punta, no solo un prototipo.

**Construido y funcionando:**
- Productos, categorías, stock **multidepósito** (con transferencias entre
  depósitos) y listas de precios.
- Circuito completo de ventas (con devoluciones y notas de crédito) y
  compras (con devoluciones a proveedor), ambos con costo promedio
  ponderado y prorrateo de costos adicionales.
- Clientes, proveedores y sus cuentas corrientes, con vencimientos y aging.
- Tesorería (cuentas, movimientos, transferencias) y gastos.
- Facturación de monto simple (sin IVA, ver `CLAUDE.md`), presupuestos.
- Reportes de ventas, compras y stock; dashboard de resumen.
- Usuarios con dos roles, **admin** y **empleado**: el empleado no ve
  costos ni márgenes (filtrado también en el backend, no solo escondido en
  la UI) y no tiene acceso a compras, tesorería ni a las pantallas de
  análisis — permisos versionados en `backend/permisos.js` y cubiertos por
  un test de inventario de rutas.
- Auditoría de operaciones sensibles, incluido login/logout.

**Todavía no construido** (para no prometer de más): notas de débito
(el modelo las soporta pero no hay forma de darlas de alta desde la UI),
marca y unidad de medida como entidades propias, subcategorías, ventas por
vendedor, y toda la parte de IA/voz descripta en `CLAUDE.md` §21 — hoy es
visión, no código.

El detalle sesión a sesión de qué se hizo y qué decisiones quedaron
tomadas vive en [`handoff.md`](handoff.md), en la raíz del repo.
