# Nexo — Video en inglés (borrador del 14 de noviembre de 2026)

- Formato: horizontal 1920x1080 · ~45 s @30fps. **La voz es de Santino,
  grabada por él en inglés** (como en el de Studree): yo le dejo el texto
  cortado por escena, con los segundos que dura cada una, y una voz de guía
  para ver el ritmo. Subtítulos en inglés quemados. Música bajita.
- Cómo se hace: la **app real en inglés** (Configuración → Apariencia →
  Idioma), grabada con Playwright sobre el negocio de ejemplo "Lola
  Indumentaria" (datos de `npm run demo`, base temporal), y armada en Remotion
  con el mismo estilo de la apertura.
- Aviso de verdad: los comprobantes, los mails y WhatsApp siguen en castellano
  dentro de la app (CLAUDE.md, hist. §142). Si aparece uno, se dice sin
  esconderlo, o no se muestra.

## Texto y escenas (≈ 105 palabras, 2,5 palabras por segundo)

| # | Seg. | Se ve | Santino dice |
|---|---|---|---|
| 1 | 0–6 | Logo y el Resumen en inglés | "This is Nexo: an all-in-one management system for small businesses in Argentina." |
| 2 | 6–14 | El menú; stock, ventas, caja y facturas pasando | "Stock, sales, cash and invoicing live in one place, and everything is connected." |
| 3 | 14–23 | Punto de venta con una oferta; la ficha "adónde fue la plata" | "Every sale updates stock, records the payment, and shows how much money was really made." |
| 4 | 23–30 | Los tipos de negocio (comercio, carnicería, gimnasio, servicios) | "It adapts to each type of business, from a clothing store to a butcher's shop or a gym." |
| 5 | 30–38 | El asistente: se escribe una venta y propone confirmarla | "Owners can just say what they sold, on the web or on WhatsApp, and Nexo prepares the sale to confirm." |
| 6 | 38–44 | Venta online (Tienda Nube y Mercado Libre) y la factura con CAE | "Online sales come in by themselves, and invoices are issued with ARCA." |
| 7 | 44–50 | Logo, el QR y "Start for free" | "You can start for free. Scan the code and try it now, with no sign-up." |

Base del texto: `docs/pitch/fuentes/guion-pitch.md`, "Componente en inglés".

## v4 armada (14 de noviembre, noche): atada a la voz

**Va en la presentación**, así que es corto: ~21 s con la voz guía (con una voz
humana serán ~25). El usuario dijo que la v3 todavía tenía pausas innecesarias
y descoordinación: la imagen se quedaba quieta (20 tramos de 1 s o más) y los
cortes no caían donde se decía cada palabra. Se rehízo así:
- **Cada pantalla se graba con movimiento continuo** (barridos del mouse, scroll
  suave, clics rápidos), sin esperar después de cada clic, y la composición le
  suma un empujón lento de zoom: no queda un cuadro quieto (salvo la tarjeta
  final del QR).
- **Cada corte arranca en el segundo exacto de su palabra** (`voz/nexo-ingles.json`,
  palabra por palabra) y la duración del video sale de la voz: no hay tiempo
  muerto ni desfasaje. Sin música. Frases cortas **sin comas**.

Texto completo (lo que dice Santino, de corrido, sin pausas largas):

> This is Nexo. A management system for small businesses. Stock. Sales. Cash.
> Invoices. All connected. Every sale updates the stock and shows what you
> really made. It adapts to any business. Just say what you sold. Nexo does
> the rest. Online sales come in by themselves. Try it free. Scan the code.

| Palabra | Se ve |
|---|---|
| "This is Nexo." | El Resumen, el mouse recorre el gráfico |
| "A management system for small businesses." | El Resumen baja |
| "Stock." "Sales." "Cash." "Invoices." | Un corte por pantalla, justo en cada palabra |
| "All connected." | El menú lateral completo, el mouse lo recorre |
| "Every sale updates the stock" | El mostrador sumando productos |
| "and shows what you really made." | La ficha, "Where the money went" |
| "It adapts to any business." | Las tarjetas de tipo de negocio |
| "Just say what you sold." | El asistente: se escribe la frase |
| "Nexo does the rest." | Propone y confirma |
| "Online sales come in by themselves." | Venta online |
| "Try it free. Scan the code." | QR de "Probar Nexo" |

Cambios contra el borrador: sin "invoices are issued with ARCA" (la pantalla de
facturas local no muestra CAE), sin logo de apertura, y el mensaje del asistente
al confirmar se tradujo entero ("Sale #158 recorded.", `asistenteEjecutar`).

## Rearmar

1. Nexo local con base temporal: `NEXO_DB_PATH=<base> NEXO_MAIL=stub NEXO_MAIL_DIR=<carpeta> NEXO_ARCA=stub PORT=3112 GROQ_API_KEY=<sin espacios> node backend/server.js`.
2. `NEXO_DEMO_CLAVE=Lola-2026-nexo node redes/videos/grabar/preparar-demo.mjs http://localhost:3112 <carpeta-de-mails>` y después `NEXO_DEMO_CLAVE=Lola-2026-nexo npm run demo -- --url http://localhost:3112 --email lola@indumentarialola.com --solo lola`.
3. Desde `redes/`: `node videos/grabar/ingles.mjs <salida>` (~29 s crudos y `escenas.json` con las marcas de cada momento); pasar el webm a mp4 de 30 cuadros con ffmpeg.
4. En el estudio vivo (`~/motion-architect/studio`): `public/clips/ingles.mp4`, `src/compositions/ingles.json`, `src/compositions/voz/nexo-ingles.json` (tiempos de la voz), `public/voz-guia/en-completo.mp3`, `public/qr/probar-codigo.png` (el cuadro blanco del QR: `crop=656:656:632:73`). Registrar `NexoIngles` en `src/compositions/index.ts`.
5. `npx remotion render src/index.ts NexoIngles-landscape out/x.mp4 --crf=18`.

**Con la voz real de Santino:** `GROQ_API_KEY=... node videos/grabar/tiempos-voz.mjs <su-audio> <salida.json>`
saca el segundo de cada palabra (Whisper de Groq, alineado con el guion) y esa
salida reemplaza a `voz/nexo-ingles.json`; con `GUIA = false` el video sale mudo
y su audio se mezcla con ffmpeg (o se pone en `public/` y se cambia el `<Audio>`).
Si su voz es mucho más lenta que la guía, hay momentos que se ven en cámara lenta
(la velocidad se limita entre 0,6x y 3x): se regraba ese tramo más largo.

Salida: `docs/pitch/media/nexo-ingles-guia.mp4` (con la voz guía de edge-tts,
solo para ver el ritmo). La voz guía se hace con `edge_tts` y
`boundary="WordBoundary"` (tiempos por palabra).

## Pendiente

**La voz del usuario** (de corrido, sin pausas largas): con ella se atan los
tiempos y sale el video final. Estado del grabador y trampas: handoff-historico.md §169.
