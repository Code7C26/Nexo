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
├── fonts/            → Inter (woff2 variable + licencia OFL) y Satoshi, que
│                       no se versiona: la baja scripts/fuentes.mjs
├── img/iconos.svg    → sprite de íconos (Lucide, ISC); se usan con icono() de core/iconos.js
└── js/
    ├── sesion.js       → login y gate: recién logueado inyecta app.js (módulo ES)
    ├── app.js          → las pantallas que todavía no se partieron + boot
    │                     (se está partiendo por dominio, Etapa B de CLAUDE.md §31)
    ├── dominios/       → una pantalla (o grupo chico) por módulo
    │   ├── usuarios.js       ABM de usuarios (solo admin)
    │   ├── configuracion.js  datos del negocio
    │   ├── perfil.js         Mi cuenta: contraseña y cerrar sesión
    │   ├── cuentas-corrientes.js  a cobrar y a pagar, con aging
    │   ├── gastos.js         gastos y sus categorías
    │   └── pos.js            punto de venta: turno de caja, mostrador y cobro
    ├── core/           → lo que comparten todas las pantallas
    │   ├── api.js          api(): toda llamada al backend, con aviso de error
    │   ├── formato.js      money, numero, esc, esAdmin, hoyISO
    │   ├── iconos.js       icono(nombre): <svg> del sprite img/iconos.svg
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
- PWA (CLAUDE.md §31, hist. §94): `manifest.webmanifest`, los íconos de
  `img/app/` y el service worker `sw.js` en la raíz, que registra
  `js/sesion.js`. Sin conexión abre y muestra lo último que cargó, sin
  escribir. Un `.js` nuevo va también a `PRECACHE` de `sw.js` (lo controla
  `npm test`).

## Sistema visual

El concepto y los tokens (color, tipografía, espaciado, movimiento) están
explicados al principio de `css/styles.css`. En corto:

- La estructura de Dub (bordes finos en vez de sombras, densidad compacta,
  pastillas de color) sobre el negro de marca. La sidebar y un marco
  alrededor del contenido son negros en los dos temas; el contenido vive en
  una hoja con borde fino. El tema de partida es el oscuro.
- El botón primario va en tinta (`--primario-bg`: blanco en oscuro, negro en
  claro). Un solo acento, el azul (`--accent`), para enlaces, foco, la
  sección activa y la selección.
- El color con significado va en piezas chicas: pastillas `.status` (verde
  resuelto, rojo urgente, contorno rojo parcial, azul `status-info`,
  violeta `status-ia`, naranja `status-aviso`, gris sin clase) y los
  íconos de las tarjetas del Resumen. Nada de amarillo.
- La cifra que concluye (Resultado, Posición neta) se destaca por tamaño y
  peso, sin color ni subrayado.
- Las cifras van en tarjetas de indicadores (`.ledger-strip` / `.ledger-item`).
- Inter para texto y cifras, con cifras tabulares (`.mono`) en importes y
  cantidades. Satoshi solo para los títulos (`--font-display`).
- Íconos: un ícono nuevo se baja de `lucide-static` y se agrega como
  `<symbol>` a `img/iconos.svg`. Nada de emojis ni caracteres sueltos (✕, ▸)
  como íconos.
