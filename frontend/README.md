# Nexo — Prototipo de interfaz

Primer prototipo visual del dashboard, sin backend todavía. Corre 100% en el
navegador con datos de ejemplo (`js/data.js`) para poder ver la interfaz
funcionando ya mismo.

## Cómo abrirlo

1. Descomprimí la carpeta `nexo-app` donde quieras tener el proyecto.
2. Abrila en VS Code: `Archivo → Abrir carpeta`.
3. Instalá la extensión **Live Server** (Ritwick Dey) si no la tenés.
4. Click derecho sobre `index.html` → **Open with Live Server**.
   (Abrir el archivo directo con doble click también funciona, pero
   Live Server recarga solo cada vez que guardás — conviene para no
   estar refrescando a mano.)

## Estructura

```
nexo-app/
├── index.html        → estructura de la página (dashboard)
├── css/styles.css     → sistema de diseño completo (colores, tipografía, layout)
├── js/data.js          → datos de ejemplo + cálculo de IVA/retención
└── js/app.js           → lógica de interfaz (tabla, resumen, modal, búsqueda)
```

## Qué es real y qué es placeholder

- El **cálculo de IVA (21%)** usa la alícuota general vigente en Argentina.
- La **retención de Mercado Pago** en `data.js` es un valor de ejemplo
  (`RETENCION_MP_EJEMPLO`), NO un dato fiscal verificado — varía según
  impuesto (IIBB, Ganancias) y jurisdicción. Hay que confirmarlo con la
  fuente oficial antes de que esto sea un dato real del producto.
- Los datos de clientes/facturas son inventados, solo para ver la tabla
  poblada.
- El menú (`Facturas`, `Clientes`, `IVA & Retenciones`, `Asistente de voz`)
  todavía apunta todo a la misma vista — son las próximas pantallas a armar.

## Próximo paso técnico

Este prototipo queda como la capa visual. El siguiente paso es el motor de
datos real: definir el esquema SQLite (clientes, facturas, movimientos) y
un backend Express con rutas `/api/facturas`, `/api/clientes`. Cuando eso
exista, en `app.js` se reemplaza la línea:

```js
let facturas = FACTURAS.map(calcularFactura);
```

por un `fetch('/api/facturas')` — el resto del código (render, búsqueda,
resumen) ya está escrito contra esa misma forma de datos, así que no hay
que reescribir nada más.
