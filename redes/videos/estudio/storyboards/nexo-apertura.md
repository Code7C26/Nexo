# Nexo — Video 6: Apertura (hecho, 12 de noviembre de 2026)

- Formato: horizontal 1920x1080 · 29,5 s = 885 cuadros @30fps
- Composición: `src/compositions/NexoApertura.tsx` (piezas en `src/components/nexo/`)
- Tono: app-store con el lenguaje de Studree: negro, una idea por pantalla,
  el título a la izquierda y la app a la derecha, nada corta en seco.
- Para qué: abre el pitch. Arranca solo en la diapositiva 1 y se funde en
  ella: el último cuadro tiene el logo en el mismo lugar y tamaño que la
  diapositiva a 1920 × 1080.
- Sin voz (pedido del usuario; se puede sumar después). Música propia, bajita
  (`scripts/musica-nexo.py`, 120 bpm: un pulso cada 15 cuadros) y sonidos de
  la librería CC0 en cada toque.
- Datos genéricos (pedido del usuario): el negocio se llama "Indumentaria" y
  el cliente "Juan Pérez". Las cifras son las del negocio de ejemplo.
- Marca: negro #000, texto #F5F5F5, un solo acento azul #60A5FA, Satoshi 700
  e Inter. Los verdes son los de la app (estados), solo dentro de la ventana.

## Escenas

| # | Cuadros | Título | Qué pasa |
|---|---|---|---|
| 1 | 0–75 | Todo el negocio, en un solo **lugar**. | Solo el texto, palabra por palabra |
| 2 | 75–180 | El mes, de un **vistazo**. | Entra la ventana de Nexo. Resumen: las cuatro cifras cuentan, las líneas y el gráfico se dibujan |
| 3 | 180–300 | Las ofertas, **solas**. | Punto de venta: toca la Remera M, entra con "Semana de remeras: 15 % off", el precio se tacha y el total sube de $ 24.700 a $ 37.365 |
| 4 | 300–405 | Cuánto deja cada **venta**. | Venta #1284 de $ 45.000: la barra se llena tramo por tramo y cierra en "Te quedó $ 17.920 · 39,8 %" |
| 5 | 405–545 | Se dice, y Nexo la **arma**. | Asistente: se escribe la frase, se envía, aparece la propuesta dato por dato y se confirma: "Venta #1285 registrada." |
| 6 | 545–650 | Y todo lo demás, **conectado**. | Doce funciones en grilla (stock, caja, cuentas corrientes, factura, compras desde la foto…) |
| 7 | 650–765 | Y lo que cada **rubro** necesita. | Ocho rubros con su función propia (balanza, recetas, socios…) |
| 8 | 765–885 | — | El logo: ícono, NΞXO letra por letra y la bajada; quieto 2 s |

La ventana cambia de pantalla sin cortes: lo viejo se va a la izquierda
desenfocado (8 cuadros) y lo nuevo entra desde la derecha (14 cuadros); en el
menú, el resaltado azul se desliza al ítem de cada pantalla.

## Rearmar

```
python scripts/musica-nexo.py public/music/nexo-apertura.wav 29.5 --pulso-desde 2.5 --final-en 25.5
npx remotion render src/index.ts NexoApertura-landscape out/nexo-apertura.mp4 --crf=18
```
El mp4 va a `docs/pitch/media/` del repo de Nexo.
