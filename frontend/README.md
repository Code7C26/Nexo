# Nexo — Frontend

Dashboard de gestión (clientes, facturas, ventas, compras, stock). Es HTML,
CSS y JavaScript vanilla, sin build step, pero **ya no funciona solo**:
depende de la API del backend Express para cargar y guardar datos.

## Cómo correrlo

El propio backend sirve este frontend como archivos estáticos, así que no
hace falta (ni sirve) abrir `index.html` con Live Server u otra herramienta
suelta — sin la API detrás, todas las pantallas van a fallar al pedir datos
(`/api/...` da 404/405 y errores de JSON en la consola).

1. Desde la carpeta `backend/`: `npm install` (la primera vez) y después
   `npm run dev`.
2. Abrí **http://localhost:3000** en el navegador. Ese mismo puerto sirve
   tanto la interfaz como la API.

## Estructura

```
frontend/
├── index.html        → estructura de la página (todas las vistas)
├── css/styles.css     → sistema de diseño (colores, tipografía, layout)
└── js/app.js           → lógica de interfaz + llamadas a /api/...
```

## Qué es real y qué es placeholder

- Clientes, Facturas, Ventas, Compras, Stock: conectados a la API real
  (`backend/`), persistidos en SQLite.
- IVA y retención de Mercado Pago quedan fuera de V1 (decisión del
  equipo) — no hay cálculo ni pantalla para eso todavía.
- El menú "Facturas" (vista aparte de Resumen), "Clientes", "IVA &
  Retenciones" y "Asistente de voz" todavía no tienen pantalla propia —
  muestran un aviso de "sección todavía no construida".
