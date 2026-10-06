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
└── js/
    ├── sesion.js       → login y gate: recién logueado inyecta app.js (módulo ES)
    ├── app.js          → las pantallas que todavía no se partieron + boot
    │                     (se está partiendo por dominio, Etapa B de CLAUDE.md §31)
    ├── dominios/       → una pantalla (o grupo chico) por módulo
    │   ├── usuarios.js       ABM de usuarios (solo admin)
    │   ├── configuracion.js  datos del negocio
    │   └── perfil.js         Mi cuenta: contraseña y cerrar sesión
    └── core/           → lo que comparten todas las pantallas
        ├── formato.js      money, numero, esc, esAdmin, hoyISO
        ├── ui.js           avisar (toasts), confirmar, estados de tabla
        ├── filtros.js      motor de filtros (crearFiltros)
        ├── seleccion.js    selección múltiple y barra de acciones en lote
        ├── csv.js          exportar a CSV
        ├── comprobante.js  hoja imprimible y PDF
        ├── router.js       vistas, hash y navegación (mostrarVista)
        ├── negocio.js      datos del negocio (membrete de comprobantes)
        └── registro.js     acciones por nombre entre módulos (sin ciclos)
```

`core/` solo importa de `core/`, y `dominios/` nunca importa `app.js` (`app.js`
los importa a ellos): lo verifica `backend/test/frontend-modulos.test.js`
(`npm test`).

## Qué es real y qué es placeholder

- Clientes, Facturas, Ventas, Compras, Stock: conectados a la API real
  (`backend/`), persistidos en SQLite.
- IVA y retención de Mercado Pago quedan fuera de V1 (decisión del
  equipo) — no hay cálculo ni pantalla para eso todavía.
- El menú "Facturas" (vista aparte de Resumen), "Clientes", "IVA &
  Retenciones" y "Asistente de voz" todavía no tienen pantalla propia —
  muestran un aviso de "sección todavía no construida".
