# Nexo — Video en inglés: "Un sábado en el local" (16 de noviembre de 2026)

Reemplaza el enfoque de `nexo-ingles.md` (la app grabada): el usuario pidió una
animación propia, como el video en inglés de sus amigos (una historia chiquita
con tarjetas, sin mostrar la app). Va en la presentación justo antes de la de
los QR. Composición: `src/compositions/NexoUnSabado.tsx`.

- Horizontal 1920 × 1080, ~32 s con la voz de guía. Sin música, con los
  sonidos de cada toque. Subtítulos en castellano abajo (los del asistente,
  en cursiva). Frases sin comas en el medio.
- **Dos voces:** Santino es el dueño del local y **Tosi es el asistente**. Lo
  que dice Tosi aparece escrito en la tarjeta del asistente mientras lo dice,
  porque el asistente real contesta por escrito.
- Lo que se muestra existe en Nexo: venta y compra que propone el asistente y
  se confirman a mano, Tienda Nube, Mercado Libre, el punto de venta, el aviso
  de stock bajo y el arqueo de caja. Se dejó afuera WhatsApp (falta la app de
  Meta) y las preguntas sobre los datos (no están hechas).
- Datos genéricos: Juan Pérez, Textil Norte S.R.L., la remera negra talle M.

## Escenas

| # | Se ve | Quién | Dice (inglés) | Subtítulo |
|---|---|---|---|---|
| 1 | Sábado 10:02 AM. La tarjeta del asistente escucha (onda y texto en vivo) | Santino | Sold three black T-shirts to Juan. He paid with Mercado Pago. | Vendí tres remeras negras a Juan. Me pagó con Mercado Pago. |
| 2 | La tarjeta se corre y aparece la venta armada (cliente, renglón, Mercado Pago) | Tosi | Got it. Confirm the sale? | Listo. ¿Confirmo la venta? |
| 3 | El mouse confirma ("Sale #158") y salen los efectos: Stock 12 → 9, Mercado Pago, Factura B, Ganancia | — | — | — |
| 4 | Pasa el día: 1:15 PM Tienda Nube, 4:40 PM Mercado Libre, 6:30 PM el mostrador; el stock baja (9, 7, 4, 2) | — | — | — |
| 5 | 6:58 PM, aviso de stock bajo | Tosi | Only two black T-shirts left. | Quedan solo dos remeras negras. |
| 6 | El asistente escucha | Santino | Order twenty more from the supplier. | Pedile veinte más al proveedor. |
| 7 | La compra armada; el mouse la confirma ("Purchase #41") | Tosi | Order ready. | Pedido listo. |
| 8 | 8:30 PM, el día: 23 ventas, facturación, ganancia y el arqueo con OK | Tosi | Twenty-three sales today. The cash count is OK. | Veintitrés ventas hoy. La caja cierra bien. |
| 9 | El logo y "Your whole business in one place." | Santino | Nexo. Your whole business in one place. | Nexo. Todo tu negocio en un solo lugar. |
| 10 | "Try it free · Scan the code" (la diapositiva que sigue es la de los QR) | Tosi | Try it free. Scan the code. | Probalo gratis. Escaneá el código. |

## Grabar las voces

Cada frase, un audio aparte (o todo de corrido, con un segundo de silencio entre
frases, y se corta acá). Tranquilo y claro, sin apurarse. Nombres de archivo:

| Archivo | Quién | Frase |
|---|---|---|
| `00-venta.mp3` | Santino | Sold three black T-shirts to Juan. He paid with Mercado Pago. |
| `01-confirmar.mp3` | Tosi | Got it. Confirm the sale? |
| `02-aviso.mp3` | Tosi | Only two black T-shirts left. |
| `03-pedido.mp3` | Santino | Order twenty more from the supplier. |
| `04-listo.mp3` | Tosi | Order ready. |
| `05-cierre.mp3` | Tosi | Twenty-three sales today. The cash count is OK. |
| `06-lema.mp3` | Santino | Nexo. Your whole business in one place. |
| `07-probar.mp3` | Tosi | Try it free. Scan the code. |

## Rearmar

En el estudio vivo (`~/motion-architect/studio`), con ffmpeg en el PATH:

```
python scripts/voz-dialogo.py voz/nexo-un-sabado.json             # voz de guía (edge-tts)
python scripts/voz-dialogo.py voz/nexo-un-sabado.json --grabadas  # con las voces de verdad en public/voz/nexo-un-sabado/
npx remotion render src/index.ts NexoUnSabado-landscape out/nexo-un-sabado.mp4 --crf=18
```

El script recorta el silencio de las puntas y anota lo que dura cada frase y
su volumen cuadro por cuadro; el video se reacomoda solo a las voces nuevas
(los tiempos salen de `voz/nexo-un-sabado.json`). Necesita `LETRAS` exportado de
`NexoApertura.tsx` y la composición registrada en `src/compositions/index.ts`.
El mp4 va a `docs/pitch/media/`.
