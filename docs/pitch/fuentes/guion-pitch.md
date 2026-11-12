# Guion del pitch — Nexo

Para el simulacro del **jueves 12 de noviembre de 2026** y la presentación
oficial, **a principios de diciembre** (el 20 de noviembre, capaz, la feria
de ciencias). Son 30 minutos, en el orden de la consigna del profesor. Los
tiempos son orientativos: la demo es lo que más pesa y lo primero que se
recorta es I+D, no la demo.

| # | Parte | Tiempo |
|---|---|---|
| 1 | Gancho y equipo | 3 min |
| 2 | Problema | 3 min |
| 3 | Solución y demo en vivo | 10 min |
| 4 | I+D y validación | 6 min |
| 5 | Venta: propuesta de valor, viabilidad, gestión ágil | 5 min |
| 6 | Cierre y llamado a la acción (QR) | 2 min |
| — | Margen para preguntas o imprevistos | 1 min |

---

## 1. Gancho y equipo (3 min)

**Gancho (un dato, sin presentarse antes):** "La mitad de las pymes argentinas
pierde dos meses por año solo revisando planillas" (encuesta de SAP a 555
pymes, El Cronista, enero de 2016: 51 % pierde al menos dos meses al año
validando planillas; 46 % administra con hojas de cálculo). Es la diapositiva
2, sin la fuente en pantalla (es de 2016: se dice solo si preguntan). La 1 es el logo, con un saludo de una línea; los roles, en la 29.

**Equipo, con roles técnicos (completar entre los dos antes del jueves):**
- Santino Solla: ___
- Joaquín Tosi: ___

## 2. Problema (3 min)

- El comercio chico lleva el negocio en el cuaderno, en una planilla y en el
  celular. El stock no coincide, no sabe qué producto le deja plata y no sabe
  cuánto le debe cada cliente.
- Los sistemas que existen (Dux, Contagram, ver `docs/investigaciones/competencia.txt`) están
  pensados para quien ya tiene un contador y una computadora en el mostrador.
  Son caros para empezar y difíciles de usar desde el celular.
- Cada rubro tiene su particularidad: la carnicería vende por kilo con
  balanza, el gimnasio cobra cuotas, el técnico trabaja con presupuestos y
  agenda, y quien fabrica (las mafaldas) no sabe cuánto le cuesta lo que hace.

## 3. Solución y demo en vivo (10 min)

**Una frase:** Nexo es un solo sistema que conecta stock, ventas, caja,
cuentas corrientes y facturación, que se adapta al tipo de negocio y que se
puede usar hablándole.

### Antes de subir (preparación)

- Lola Indumentaria **ya abierta** en la compu, desde `/app#/probar`, y otro
  negocio en el celular. No esperar la carga en vivo.
- Si se va a mostrar la factura con CAE, tener a mano un negocio propio con la
  factura electrónica verificada (Configuración → Factura electrónica). Los de
  ejemplo no la tienen activa.
- El celular con WhatsApp vinculado a Nexo, y su pantalla espejada si se va a
  mostrar.
- Un rato antes, subir `NEXO_EJEMPLOS_RESERVA` en el servidor (por ejemplo a
  5), por si mucha gente escanea el QR a la vez.
- **No gastar el cupo de Groq ese día:** son unas 100 frases por día para todo
  Nexo. Ensayar el asistente el día anterior, o contra el stub.
- Video de respaldo de toda la demo, abierto en otra pestaña.

### Recorrido (en este orden)

| Paso | Qué se muestra | Qué se dice | Min |
|---|---|---|---|
| 1 | `/app#/probar` desde el celular: elegir un negocio y entrar | "Esto es lo que van a hacer ustedes con el QR del final: sin registrarse, cada uno con su negocio." | 1 |
| 2 | Resumen de Lola: ventas, ganancia, "Para mirar hoy", cuándo se vende | "Lo primero que ve el dueño a la mañana." | 1,5 |
| 3 | Punto de venta: una remera talle M (entra sola la oferta de 15 % en remeras) y dos medias (precio por cantidad). Cobro mixto, efectivo con vuelto y Mercado Pago | "Así vende parado frente al cliente. El stock baja solo." | 2 |
| 4 | La ficha de esa venta: adónde fue la plata (mercadería, comisión, IVA, lo que quedó, cada uno con su %) | Volver al gancho: "esto es lo que ninguno sabía." | 1 |
| 5 | Asistente: escribir o dictar "vendí dos gorras a Camila Herrera, me pagó por transferencia", ver la propuesta y confirmar | "La IA propone, la persona confirma. Nunca toca los datos sola." | 1,5 |
| 6 | (Si anda el WhatsApp) la misma venta con una nota de voz | "Sin abrir la app." | 1 |
| 7 | Cambiar de negocio: Mafaldas (receta y costo de producir) o la carnicería (etiqueta de la balanza) | "El mismo sistema, configurado para otro rubro, sin código aparte." | 1,5 |
| 8 | Una factura con CAE de ARCA (homologación), impresa con el QR | "Factura electrónica real, contra ARCA." | 0,5 |

Si el tiempo aprieta, se saltean el 6 y el 8, en ese orden.

### Plan B

- **Sin internet en el aula:** los datos del celular como hotspot y, si
  tampoco, el video de respaldo.
- **El asistente no contesta** (cupo de Groq agotado): contarlo como una
  decisión ("usamos un proveedor sin retención de datos, con cupo gratis") y
  pasar al paso siguiente. No reintentar en vivo.
- **El servidor no responde:** Nexo corre igual en la compu (`npm start`), con
  un negocio de ejemplo cargado de antemano.

## 4. I+D y validación (6 min)

### Arquitectura

```
Navegador (PWA instalable)  ──HTTPS──▶  Servidor Node.js + Express  ──▶  SQLite
  HTML, CSS y JavaScript                 API REST, roles, auditoría       74 tablas, aisladas
  sin framework, módulos ES              lógica de negocio en transacción  por empresa
                                                 │
                     ┌───────────────┬───────────┼────────────┬──────────────┐
                    ARCA        Mercado Pago  Mercado Libre  Tienda Nube   WhatsApp
                 (WSAA, WSFEv1)  (cobros)     (ventas, stock)  (idem)     (Cloud API)
                                                 │
                                   Groq: gpt-oss-20b y Whisper (voz)
                                   Gemini de respaldo
```

- **Lenguajes:** JavaScript en el servidor y en el navegador, SQL, HTML y CSS.
- **Dependencias de producción: solo dos** (`express` y `@google/genai`). ARCA,
  Mercado Pago, Mercado Libre, Tienda Nube, WhatsApp y el envío de mails están
  hechos sin librerías, con lo que trae Node. Es más barato, y no hay terceros
  que actualizar.
- **Multi-empresa:** muchos negocios en la misma instalación, cada uno con sus
  datos aislados. El negocio sale siempre de la sesión, nunca de lo que manda
  el navegador.
- **Hosting:** Oracle Cloud, en la capa gratuita, con respaldo automático de
  la base en cada arranque.

### Números del proyecto (al 8 de noviembre de 2026)

- Desde el 7 de mayo de 2026: 359 commits.
- 291 rutas de la API y 74 tablas.
- Unas 68.000 líneas de código: 30.000 en el servidor, 27.000 de JavaScript
  en el navegador y 10.000 de CSS.

### Resultados de testing

- **320 tests automáticos** en 39 archivos (unas 9.300 líneas de tests), que
  recorren la API de punta a punta contra una base nueva en cada corrida.
- **CI en GitHub Actions:** cada Pull Request corre lint y tests, y nada llega
  a `main` (lo que se publica) con el CI en rojo.
- **Migraciones verificadas:** 24 de 24 contra una copia de la base real, sin
  perder datos.
- **ARCA probado contra el ambiente de homologación real:** factura A con
  21 % y 10,5 %, factura B y nota de crédito, las tres con CAE.
- **Pruebas en navegador:** celular y compu, tema claro y oscuro.

### Un bloqueo grave y cómo se resolvió (elegir uno)

**Recomendado: "hoy" era mañana.** Desde las 21 h de la Argentina, toda
venta, cobro y gasto quedaba con la fecha del día siguiente, porque el
servidor usaba la hora UTC. Se encontró probando a las 21 h. La fecha pasó a
calcularse en la zona horaria del negocio, con un test que simula un servidor
en otra zona.

**De respaldo: la firma para ARCA.** Para facturar, Nexo se identifica ante
ARCA con su certificado digital, y lo normal es usar una librería externa
(`node-forge`) para firmar. Se armó a mano con `node:crypto`, se verificó con
`openssl`, y ARCA la aceptó a la primera.

**Otro posible:** la IA. El plan gratuito de Gemini puede usar lo que se le
manda, y la frase trae el nombre del cliente. Se cambió a Groq, con retención
de datos en cero, y Gemini quedó de respaldo.

## 5. Venta (5 min)

### Propuesta de valor

Saber cuánto ganás en cada venta, vender desde el mostrador o el celular, y
cargar lo que pasó hablándole al sistema, en un solo lugar que se adapta a tu
rubro.

### Planes (precios por mes, los mismos de la app)

| Plan | Precio | Para quién |
|---|---|---|
| Gratis | $ 0 | Para empezar: todas las funciones, hasta 100 productos y 300 ventas por mes, 1 usuario |
| Emprendedor | $ 19.900 | Sin topes de productos ni de ventas, hasta 3 usuarios |
| Pro | $ 34.900 | Asistente con IA (texto, voz y WhatsApp), usuarios sin tope, varios negocios |

### Viabilidad

Sacar las cifras de los documentos ya entregados, sin inventar otras:
- `docs/Dimensionamiento de Mercado (TAM, SAM, SOM) — Nexo.pdf`;
- `docs/Análisis Financiero y Punto de Equilibrio — Nexo.pdf`;
- `docs/Informe Económico, Monetización y Marco Legal — Nexo.pdf`.

El costo fijo de infraestructura hoy es cero (capa gratuita de Oracle y
servicios en plan gratis), y eso baja el punto de equilibrio.

### Gestión ágil

- Etapas chicas y que se pueden probar, con un roadmap escrito por etapas
  (CLAUDE.md §38).
- Una rama por integrante, y Pull Request a `main` con el CI obligatorio.
- Una bitácora (`handoff.md`) que se actualiza al cerrar cada etapa, para
  retomar sin perder contexto.
- Prioridades revisadas con el uso real, como los negocios de ejemplo para
  que cualquiera pruebe sin registrarse.

## 6. Cierre y llamado a la acción (2 min)

- **QR 1 → `https://nexosystem.duckdns.org/app#/probar`:** "Escaneen y entren
  ahora como dueños de uno de estos negocios."
- **QR 2 → `https://github.com/Code7C26/Nexo`** (código, README y manual: no
  se leen en el pitch).
- Los dos QR están en `docs/pitch/fuentes/qr/` (`probar-nexo.svg` y `repositorio-nexo.svg`),
  en SVG: se agrandan sin perder calidad para la diapositiva, los stickers y
  las tarjetas. Están comprobados: se leen y llevan a esas dos direcciones.
- Frase final, que vuelve al gancho: "La próxima vez que vendan algo, van a
  saber cuánto ganaron."

## Componente en inglés

**No va en la presentación** (decisión del usuario del 11 de noviembre): el
equipo hace aparte un video en inglés que explica el proyecto, y la
diapositiva en inglés se sacó. Este texto queda como base para ese video:

> Nexo is an all-in-one management system for small businesses in Argentina.
> It connects stock, sales, cash and invoicing in one place, adapts to each
> type of business, from a clothing store to a butcher's shop, and lets owners
> record a sale just by talking to it, on the web or on WhatsApp. Every sale
> shows how much money was actually made. You can start for free, and try it
> right now with the QR code, without signing up.

## Stand y material

- Stickers y tarjetas con los dos QR.
- Remeras iguales.
- Carpeta con el resumen ejecutivo.
- Flyer, video tutorial y redes: es la identidad de marca activa que pide la
  consigna.
