# Nexo — Video 6: Apertura (versión 2, 12 de noviembre de 2026)

- Formato: horizontal 1920x1080 · 41 s = 1230 cuadros @30fps
- Composición: `src/compositions/NexoApertura.tsx`; las pantallas de la app en
  `src/components/nexo/pantallas.tsx`, la ventana y las piezas en `ui.tsx`.
- Para qué: abre el pitch. Arranca solo en la diapositiva 1 y se funde en
  ella: el último cuadro tiene el logo en el mismo lugar y tamaño que la
  diapositiva a 1920 × 1080.
- Pedido del usuario (versión 2): un pantallazo completo de Nexo, vistoso y
  rápido; lo principal (el Resumen y el asistente) de a poco y lo demás
  rápido; el menú igual al de la app; más gráficos en el Resumen, con el mouse
  recorriendo el de 30 días.
- Sin voz. Música propia y bajita (`scripts/musica-nexo.py`, 120 bpm: un pulso
  cada 15 cuadros); hay una variante `--estilo movida` (bajo, palmas y
  hi-hat) para comparar: `--props='{"musica":"music/nexo-apertura-movida.wav"}'`.
- Datos genéricos: el negocio "Indumentaria", el cliente "Juan Pérez".
- El menú es el de un comercio en la app: Resumen, Asistente; Maestros
  (Productos, CRM, Proveedores); Ventas (Punto de venta, Presupuestos, Ventas,
  Venta online, Devoluciones, Facturas); Compras; Stock; Finanzas;
  Administración. Los íconos y los logos salen de la app con
  `scripts/iconos-nexo.py`.

## Escenas

| # | Cuadros | Título | Qué pasa |
|---|---|---|---|
| 1 | 0–60 | Todo el negocio, en un solo **lugar**. | Solo el texto |
| 2 | 60–250 | El mes, de un **vistazo**. | Resumen: el mouse toca "30 días", las cifras cuentan, el gráfico se dibuja con sus fechas y el mouse lo recorre (línea guía, puntos y cartel con fecha, ventas y ganancia). Baja a "Cuándo se vende" (mapa de calor) y "Lo más vendido"; "Dónde entró la plata" es una dona |
| 3 | 250–340 | Las ofertas, **solas**. | Punto de venta: la remera entra con el 15 % y el total sube |
| 4 | 340–420 | Cuánto deja cada **venta**. | La barra tramo por tramo hasta "Te quedó" |
| 5 | 420–520 | La factura, con CAE de **ARCA**. | Factura B autorizada; el mouse toca PDF y sube la factura impresa con el formato de ARCA, CAE y QR |
| 6 | 520–630 | La compra, desde la **foto**. | La foto de la factura del proveedor se escanea y los renglones aparecen encontrados, con el pack pasado a unidades y el IVA como crédito fiscal |
| 7 | 630–720 | Tienda Nube y Mercado Libre, **conectados**. | Venta online: cifras, las dos tiendas conectadas, la dona por canal y dos pedidos que entran solos |
| 8 | 720–810 | Cobros con Mercado Pago, **solos**. | El cobro del punto de venta: Mercado Pago, el QR, "Esperando el pago" y "Pago aprobado" |
| 9 | 810–940 | Se dice, y Nexo la **arma**. | Asistente: se escribe, se envía, propone y se confirma |
| 10 | 940–1030 | Y todo lo demás, **conectado**. | Doce funciones en grilla |
| 11 | 1030–1120 | Y lo que cada **rubro** necesita. | Ocho rubros con lo suyo |
| 12 | 1120–1230 | — | El logo, quieto al final |

## Rearmar

```
python scripts/iconos-nexo.py "C:/Users/HP ULTRA 5/Desktop/Nexo"
python scripts/musica-nexo.py public/music/nexo-apertura.wav 41 --pulso-desde 2.0 --final-en 37.33
npx remotion render src/index.ts NexoApertura-landscape out/nexo-apertura.mp4 --crf=18
```
El mp4 va a `docs/pitch/media/` del repo de Nexo.
