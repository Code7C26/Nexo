# Nexö — Instrucciones para Claude Code

## Contexto
Nexö es un sistema de gestión integral para PyMEs y emprendimientos, con
visión a futuro de interfaz conversacional por voz. Es un proyecto de
escuela desarrollado por dos integrantes: Santino Solla y Joaquin Tosi.
Centraliza inventario, precios, clientes y facturación.

## Reglas de negocio acordadas
- IVA y retención de Mercado Pago quedan **fuera de V1** — decisión ya
  tomada por el equipo. No se calculan ni se guardan; el placeholder que
  existe en el prototipo (`IVA_ALICUOTA`, `RETENCION_MP_EJEMPLO`) no se
  traduce a lógica real por ahora. Se retoma en una etapa posterior si el
  equipo lo decide.
- V1 trabaja con facturas de monto simple: `neto` = `total`, sin impuestos.
- Productos/inventario y precios quedan para una segunda etapa (V2), una
  vez que clientes + facturas funcionen de punta a punta.

## Reglas de negocio a confirmar (no inventar)
- Alcance exacto de "gestión de precios" e "inventario" para V1.

## Stack técnico
- Backend: Node.js + Express.
- Base de datos: SQLite.
- Frontend: HTML, CSS y JavaScript vanilla (sin framework por ahora).

## Estructura del repositorio
```
/frontend   → prototipo/UI (index.html, css/, js/)
/backend    → servidor Express, esquema y acceso a datos SQLite
/docs       → documentación técnica y análisis del proyecto
/desing     → mockups y diseño visual
/assets     → imágenes, íconos y recursos estáticos
```

## Reglas de desarrollo
- No inventar reglas de negocio ambiguas: preguntar.
- Trabajar por etapas chicas y testeables.
- Diseño responsive desde el inicio.
- Movimientos de datos auditables (quién/cuándo, no solo el estado final).
- No pushear directo a `main`: rama por feature (`feature/<nombre>`) +
  Pull Request. `main` siempre debe quedar en estado funcional.
- Antes de cambiar el esquema de la base de datos, explicar la migración y
  su impacto.
