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
    │   ├── perfil.js         Mi cuenta: contraseña y cerrar sesión
    │   ├── cuentas-corrientes.js  a cobrar y a pagar, con aging
    │   └── gastos.js         gastos y sus categorías
    ├── core/           → lo que comparten todas las pantallas
    │   ├── api.js          api(): toda llamada al backend, con aviso de error
    │   ├── formato.js      money, numero, esc, esAdmin, hoyISO
    │   ├── ui.js           avisar (toasts), confirmar, estados de tabla
    │   ├── filtros.js      motor de filtros (crearFiltros)
    │   ├── seleccion.js    selección múltiple y barra de acciones en lote
    │   ├── csv.js          exportar a CSV
    │   ├── comprobante.js  hoja imprimible y PDF
    │   ├── router.js       vistas, hash y navegación (mostrarVista)
    │   ├── negocio.js      datos del negocio (membrete de comprobantes)
    │   ├── maestros.js     maestros que leen varios dominios (cuentas, proveedores)
    │   └── registro.js     acciones por nombre entre módulos (sin ciclos)
    └── vendor/         → jsPDF y html2canvas, cargados a demanda para el PDF
```

`core/` solo importa de `core/`, y `dominios/` nunca importa `app.js` (`app.js`
los importa a ellos): lo verifica `backend/test/frontend-modulos.test.js`
(`npm test`).

## Qué hay y qué falta

- Todas las pantallas del menú están conectadas a la API real (`backend/`) y
  persisten en SQLite. La vista `placeholder` ("sección todavía no
  construida") sigue en `index.html` como red del router: hoy ningún ítem del
  menú cae ahí.
- El asistente de texto (CLAUDE.md §21) no es un ítem del menú: es el widget
  flotante del final de `index.html` (`#asistenteLauncher`).
- IVA y retención de Mercado Pago no tienen cálculo ni pantalla todavía: son
  la Etapa C del roadmap (CLAUDE.md §16, §33, §38).
- Falta la PWA (manifest, service worker, offline de lectura; CLAUDE.md §31).
