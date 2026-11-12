# Guiones de los videos — Nexo

Borrador para revisar antes de grabar. Primero se aprueban los guiones, después
se graban las pantallas y se arman las animaciones.

## Herramienta, referencias y cómo se ven en la presentación (12 de noviembre)

**La herramienta: Motion Architect** (github.com/Hainrixz/motion-architect, MIT,
de Enrique Rocha; si se redistribuye hay que conservar su crédito). Es la que
usó el grupo de Studree (Code7C26/Studree) para su spot y su anuncio en inglés:
un plugin de Claude Code con la skill `motion-architect`, los comandos `/motion`
y `/motion-render` y un subagente que analiza videos de referencia, sobre un
estudio de Remotion. Su flujo: intake → referencias → marca → **storyboard que
se aprueba** → animación → revisión cuadro por cuadro → preview → mp4 en 16:9,
9:16, 1:1 o 4:5.

- **Dónde está:** `C:\Users\HP ULTRA 5\motion-architect` (`~/motion-architect`,
  donde la skill busca el estudio). Fuera del repo de Nexo: los videos se arman
  ahí y los mp4 terminados se copian a `docs/pitch/media/`.
- **Ya hecho:** el clon; `ffmpeg` y `yt-dlp` instalados con winget (en el PATH
  de usuario); `python3` funciona (copia de `python.exe` en la carpeta de Python
  3.13, porque el `python3` de Windows abría la Microsoft Store).
- **Instalado del todo** (12 de noviembre): el estudio (Remotion 4.0.533) y el
  plugin en Claude Code. En PowerShell, `npm`, `npx` y `claude` van como
  `npm.cmd`, `npx.cmd` y `claude.cmd` (la política de ejecución bloquea los
  `.ps1`). La sesión de videos se abre **en Nexo**, para tener su contexto, y
  ya puede escribir en el estudio: `C:\Users\HP ULTRA 5\motion-architect` está
  en `additionalDirectories` de `.claude/settings.local.json` (local, no se
  sube; la extensión de VS Code no tiene `/add-dir`). La skill encuentra el estudio en
  `~/motion-architect/studio` (Nexo no tiene una carpeta `studio/`).
- **Remotion** es gratis para equipos de hasta 3 personas.

**Las referencias de estilo** ya están en
`~/motion-architect/studio/public/references/`: `studree-spot.mp4` (43 s, sin
voz) y `studree-anuncio-en.mp4` (40 s, con las voces del equipo en inglés), los
dos en 1920 × 1080 a 30 fps, con sus pósters. Se analizan con el subagente
`reference-analyst` para tomar el ritmo, los cortes, las transiciones y el tipo
de movimiento; el contenido y la marca son de Nexo.

**Cómo se ven en la presentación** (lo que el usuario quiere, tomado de
Studree y mejorado):
- El video está en la diapositiva como una tarjeta con su póster.
- **Arranca solo al llegar a esa diapositiva** (en Studree se arrancaba con
  Espacio) y la tarjeta se agranda a toda la pantalla: en Studree, `left`,
  `top`, `width`, `height` y `border-radius` con una transición de 0,6 s
  ease-in-out, una barra de progreso fina abajo, y lo de alrededor (contador,
  QR, progreso) se esconde mientras suena.
- **Al terminar, cae en la diapositiva con una transición:** la tarjeta vuelve
  a su lugar (o el video se funde en el contenido de la diapositiva) y entra el
  texto. Espacio pausa, Esc lo cierra, y avanzar de diapositiva lo corta.
- Los mp4 van en `docs/pitch/media/` y la presentación armada los tiene que
  seguir abriendo con doble clic: o se incrustan, o viajan junto a ella en la
  carpeta del pitch (a decidir al armarlo: un mp4 de 5 a 8 MB incrustado en
  base64 hace pesado el HTML).

**El video en inglés** va como el de Studree: Nexo en inglés (Configuración →
Apariencia → Idioma) y la voz del usuario grabada en inglés, no una voz
sintética.

## Reglas para los cuatro videos

- **Formato:** horizontal 1920 × 1080 para el pitch y YouTube; los videos 1 a 3
  salen también en vertical 1080 × 1920 para Reels y TikTok, con el mismo
  guion.
- **Subtítulos siempre puestos**, quemados en el video: en redes casi todos lo
  miran sin sonido.
- **Voz:** una sola para los cuatro (Tomás o Elena, a elegir). Frases cortas:
  unas 2,5 palabras por segundo.
- **Marca:** fondo negro, acento azul, tipografía Satoshi, el logo al cierre.
- **Datos:** solo los negocios de ejemplo de `/app#/probar`. Nunca una cuenta
  real.
- **Música:** libre de derechos (Biblioteca de audio de YouTube o Pixabay,
  revisando la licencia de cada tema), baja debajo de la voz.
- **No se muestra lo que todavía no anda de verdad:** nada de WhatsApp hasta
  que esté la app de Meta.

Cada escena dice qué se ve, cómo se mueve, qué dice la voz y qué texto aparece.

---

## Video 1 — "¿Cuánto ganaste?"

**Para qué:** abrir el pitch y publicidad en redes. **Duración:** 35 s.
**Idea:** la pregunta del gancho, y Nexo como la respuesta.

| # | Tiempo | En pantalla | Animación | Voz | Texto |
|---|---|---|---|---|---|
| 1 | 0–4 s | Fondo negro | La pregunta aparece palabra por palabra | "¿Cuánto ganaste con tu última venta?" | ¿Cuánto ganaste con tu última venta? |
| 2 | 4–9 s | Íconos: cuaderno, planilla, calculadora, celular | Se apilan y se desordenan | "No cuánto cobraste. Cuánto te quedó, después de la mercadería, la comisión y el envío." | — |
| 3 | 9–17 s | Punto de venta de Lola: Remera básica M y dos Medias x3 | Zoom al cartel de la oferta (15 % en remeras) y al precio por cantidad de las medias; cobro mixto | "Con Nexo vendés desde el mostrador o el celular. Las ofertas se aplican solas y el stock baja solo." | Las ofertas, solas |
| 4 | 17–26 s | La ficha de esa venta | La barra se llena tramo por tramo: mercadería, comisión, envío, "Te quedó", cada uno con su % | "Y en cada venta ves adónde fue la plata. Y cuánto te quedó a vos." | Te quedó: $ … |
| 5 | 26–31 s | Resumen de Lola | Las cifras cuentan hacia arriba, el gráfico se dibuja | "Ventas, stock, caja y clientes, en un solo lugar." | — |
| 6 | 31–35 s | Logo de Nexo, QR y dirección | El logo entra, el QR aparece abajo | "Nexo. Probalo gratis, sin registrarte." | Probalo gratis · nexosystem.duckdns.org |

**Estado:** aprobado (10 de noviembre).

**Antes de grabar:** se arma una venta completa en Lola: con comisión de
Mercado Pago y envío, para que la escena 4 muestre todos los tramos. Las
ventas de ejemplo no los traen. El IVA aparece como tramo solo si el negocio es
responsable inscripto: se revisa al armar la venta.

---

## Video 2 — "Decíselo a Nexo"

**Para qué:** redes, y respaldo del paso del asistente en la demo en vivo.
**Duración:** 25 s.
**Idea:** cargar una venta hablando, sin formularios.

| # | Tiempo | En pantalla | Animación | Voz | Texto |
|---|---|---|---|---|---|
| 1 | 0–4 s | Fondo negro | — | "¿Y si en vez de cargar la venta, se la decís?" | — |
| 2 | 4–10 s | Asistente de Lola, botón del micrófono | Toque en el micrófono; una onda de audio; la frase aparece escrita | (se escucha una voz distinta, la del dueño) "Vendí dos gorras a Camila Herrera, me pagó por transferencia." | — |
| 3 | 10–17 s | La propuesta: dos Gorra trucker, Camila Herrera, transferencia, total | Zoom a cada dato a medida que se nombra | "Nexo entiende la venta y te la muestra antes de guardarla." | Vos confirmás |
| 4 | 17–21 s | Toque en Confirmar, aviso de venta guardada | El stock de la gorra baja de un número al otro | "Vos confirmás. Nunca toca tus datos sin preguntarte." | — |
| 5 | 21–25 s | Logo, QR | Igual que el cierre del video 1 | "Nexo. Hablale a tu negocio." | Asistente incluido en el plan Pro |

**Estado:** aprobado (10 de noviembre). **Para después:** sumar una escena con
la misma venta mandada por WhatsApp, cuando esté la app de Meta.

---

## Video 3 — "Un sistema, tu rubro"

**Para qué:** pitch (la parte de solución) y redes. **Duración:** 30 s.
**Idea:** el mismo Nexo, cuatro negocios distintos.

| # | Tiempo | En pantalla | Animación | Voz | Texto |
|---|---|---|---|---|---|
| 1 | 0–3 s | Fondo negro | — | "Cada negocio es distinto." | — |
| 2 | 3–8 s | Indumentaria: un producto con sus talles | Corte rápido, el tipo de negocio arriba | "Una tienda de ropa vende por talle…" | Indumentaria |
| 3 | 8–13 s | Panadería: la receta y el costo de producir | Los materiales se suman y dan el costo | "…una panadería necesita saber cuánto le cuesta lo que hace…" | Panadería |
| 4 | 13–18 s | Carnicería: se lee una etiqueta de la balanza | El código se convierte en "Vacío · 1,240 kg" | "…la carnicería vende por kilo, con la balanza…" | Carnicería |
| 5 | 18–23 s | Gimnasio: la entrada de un socio al día | El cartel verde de "puede pasar" | "…y el gimnasio cobra cuotas." | Gimnasio |
| 6 | 23–27 s | Las cuatro pantallas a la vez, en mosaico | Se juntan en una sola | "Nexo es uno solo, y arranca con lo que tu negocio necesita." | — |
| 7 | 27–30 s | Logo, QR | Cierre de siempre | "Probalo gratis." | Probalo gratis |

**Estado:** aprobado con cambios (10 de noviembre): solo se nombra el tipo de
negocio, nunca el nombre de fantasía de los ejemplos. Antes de grabar, a cada
copia de ejemplo se le cambia el nombre por su tipo en Configuración
(Indumentaria, Panadería, Carnicería, Gimnasio), así que si el nombre se ve en
el menú, dice eso. Solo cambia la copia del visitante, no los ejemplos.

---

## Video 4 — Tutorial "Empezá en 2 minutos"

**Para qué:** el video tutorial que pide la consigna, y el sitio. **Duración:**
2 a 3 min. **Idea:** de cero a la primera venta.

Se graba en el sitio real, desde el navegador (decidido el 10 de noviembre):
- la cuenta se crea con un alias de Gmail (`santinosolla22+tutorial@gmail.com`):
  el código de 6 números llega a la casilla de siempre, y la cuenta queda
  aparte de la real;
- la espera del código se corta en la edición;
- al terminar, el negocio se da de baja desde Configuración (queda cerrado 30
  días y después se borra solo).

| # | Capítulo | En pantalla | Voz (resumen) |
|---|---|---|---|
| 1 | Crear la cuenta (20 s) | El alta guiada: mail, nombre del negocio, tipo de negocio | "Creás tu cuenta y elegís qué tipo de negocio tenés. Nexo arranca con lo que necesitás." |
| 2 | Cargar un producto (30 s) | Nuevo producto: nombre, precio, stock | "Cargás tus productos con el precio y el stock que tenés hoy." |
| 3 | Abrir la caja y vender (45 s) | Punto de venta: abrir la caja, buscar el producto, cobrar | "Abrís la caja con lo que hay en efectivo, buscás el producto y cobrás." |
| 4 | Ver cómo te fue (25 s) | La ficha de la venta y el Resumen | "En cada venta ves cuánto te quedó, y en el Resumen, cómo va el negocio." |
| 5 | Si te trabás (15 s) | El manual en la app y "Avisar un problema" | "Si algo no sale, el manual está adentro de la app, y nos podés avisar desde ahí." |

Cada capítulo lleva su título animado arriba a la izquierda, para poder
saltar entre partes en YouTube.

## Pendientes para el pitch (pedidos el 12 de noviembre)

Dos videos más, **obligatorios para la presentación oficial** (decisión del
usuario del 12 de noviembre). Se hacen en una sesión aparte, con los videos
animados para la presentación y para Instagram. No están
grabados.

### Video 5 — "Un negocio desde cero" (para una diapositiva del pitch)

**Para qué:** una diapositiva con el video corriendo solo (sin sonido, o con
subtítulos) mientras se cuenta cómo se arranca. Va cerca de "Nexo crece con el
negocio" (8) o de la del QR (10); se decide al armarla. **Duración:** 40 a
60 s, en loop.

Qué tiene que mostrar, en el orden del alta guiada (`frontend/js/alta.js`,
siete pasos a pantalla completa):
1. **La cuenta:** nombre, mail y contraseña (o "Entrar con Google").
2. **El código de 6 números** que llega al mail (la espera se corta).
3. **El negocio:** cómo se llama.
4. **El tipo de negocio** (comercio, carnicería, gimnasio…): Nexo arranca con
   lo que ese rubro necesita.
5. **Las secciones** que trae prendidas (punto de venta, presupuestos, stock…),
   que se pueden cambiar.
6. **Los datos de los comprobantes** (o "más tarde").
7. **"¿Tu negocio ya venía funcionando?"**: si dice que sí, entra directo a
   **"Lo que ya tenías"** (Configuración), que carga sin inventar compras ni
   ventas: el stock de hoy de cada depósito con lo que costó, lo que le deben y
   lo que debe, la plata de cada cuenta y, si quiere, las ventas recientes
   (`frontend/js/dominios/carga-inicial.js`).

Se graba igual que el video 4 (alias de Gmail `+tutorial`, en el sitio real, y
el negocio se da de baja al terminar). Con la skill `ui-demo` y Remotion,
como los demás.

### Video 6 — Apertura (hecho, 12 de noviembre)

**Versión 2 (12 de noviembre, a pedido del usuario después de verla): 41 s,
7,4 MB.** Un pantallazo completo, vistoso y rápido: el menú igual al de la
app (los 21 ítems de un comercio en sus grupos), el Resumen con el clic en
"30 días", el mouse recorriendo el gráfico con la fecha y los montos, y más
gráficos (dona de cobros, mapa de calor, lo más vendido); y escenas nuevas y
cortas: la factura con su PDF, la compra desde la foto, Tienda Nube y Mercado
Libre, y el cobro con el QR de Mercado Pago. Lo principal (Resumen y
asistente) sigue yendo de a poco. **El usuario eligió la música movida** ("el
video quedó perfecto"). Detalle: `redes/videos/estudio/storyboards/nexo-apertura.md`.

**El reel** (pedido del usuario): `redes/videos/nexo-apertura-reel.mp4`, 1080 ×
1920, 41 s, con su portada (`nexo-apertura-reel-portada.jpg`). Las mismas
escenas: la app va sin el menú lateral (como en el celular) y ocupa el ancho,
el título arriba, las grillas en dos columnas, y el cierre con "Probalo gratis
· link en la bio". Respeta las zonas que tapa Instagram (14 % de arriba, 20 %
de abajo). **No tiene voz todavía**, aunque los videos de Instagram la llevan
(decisión del usuario): falta que apruebe el texto y elija la voz.

Versión 1: **`docs/pitch/media/nexo-apertura.mp4`**: 29,5 s, 1920 × 1080, 3,8 MB. Abre la
presentación: arranca solo en la diapositiva 1, a pantalla completa, y al
terminar se funde en ella (el logo del último cuadro está en el mismo lugar y
tamaño que el de la diapositiva).

Decisiones del usuario al aprobarlo:
- **Genérico:** el negocio se llama "Indumentaria" y el cliente "Juan Pérez";
  nunca el nombre de los negocios de ejemplo ni el de sus clientes.
- **Sin la entrada del gimnasio:** mostraba un rubro y no los demás. En su
  lugar, un pantallazo de doce funciones y otro de los ocho rubros, cada uno
  con lo suyo.
- **Sin voz** en la presentación (se puede sumar después), con los sonidos de
  cada toque y una música bajita. **Los videos para Instagram sí llevan voz.**

Escenas: "Todo el negocio, en un solo lugar" → Resumen → punto de venta con la
oferta que entra sola → cuánto deja cada venta → el asistente arma y confirma
una venta → "Y todo lo demás, conectado" → "Y lo que cada rubro necesita" →
el logo. La app no está grabada: está redibujada en el video, igual a la real,
como hizo Studree. El detalle cuadro por cuadro y cómo se rearma:
`redes/videos/estudio/storyboards/nexo-apertura.md` (las fuentes del estudio
están copiadas en `redes/videos/estudio/`).

**La música** es propia: `scripts/musica-nexo.py` del estudio la genera (un
colchón de acordes, un arpegio y un pulso suave a 120 bpm). No hay que buscar
licencias.
