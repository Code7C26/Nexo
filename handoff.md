# Handoff — Nexo

> Punto de entrada para retomar el proyecto en una sesión nueva. Se mantiene
> **corto y vivo**: estado actual, decisiones vigentes y qué sigue. El relato
> detallado de cada etapa (qué se tocó, cómo se verificó, qué falló) vive en
> [`docs/handoff-historico.md`](docs/handoff-historico.md), citado acá como
> "hist. §N". Las reglas de negocio y la arquitectura están en `CLAUDE.md`, y
> este archivo no las repite.

## Cómo mantener este archivo

- Al cerrar una etapa, se hacen tres cosas:
  - su relato completo se agrega al final de `docs/handoff-historico.md` con el
    siguiente número (hoy el último es §139);
  - acá se actualizan "Estado actual" y "Qué sigue";
  - si cambió alguna decisión vigente, se actualiza también esa lista.
- Nunca apilar secciones "Última etapa" en este archivo: así fue como llegó a
  6000 líneas.
- Lo que deja de ser cierto se corrige o se borra de acá. En el histórico no se
  reescribe nada.

## Estado actual (5 de noviembre de 2026)

**Lo último (5 de noviembre, hist. §139): Venta online también en el Resumen,
publicado.** La pieza "Por canal" del Resumen pasa a "Venta online": dona y
lista con logo, ventas y lo que quedó por canal, con "Ver todo" a la página.
Los logos viven en `core/canales.js` (`logoDeCanal`).

**Para quien sigue (5 de noviembre):** todo lo de esta sesión está en `main`
(PR #57 a #61) y publicado. Pendientes de esta parte, para decidir con el
usuario: "Qué se compra" todavía tiene las tarjetas viejas (sin línea ni
gráfico); "Lo que ya tenías" no muestra el canal en su planilla (solo por la
API); los negocios de ejemplo ya cargados en la cuenta del usuario tienen la
historia "Sin indicar" (renombrar el viejo y volver a correr la demo).

**Antes (5 de noviembre, hist. §138): la página Venta online, publicada (PR
#60).** Pedido del usuario: una sección de e-commerce con
gráficos y logos. `#/venta-online` (módulo canales, admin): cifras online,
ventas por canal, dona, una tarjeta por canal con su logo y adónde fue la
plata, publicidad (gasto de la categoría Publicidad de Gastos: ROAS, costo
por venta), lo más vendido por canal y las tiendas conectadas. La paleta de
series pasó a azul, naranja y aguamarina (el violeta no se distinguía del
azul). **Meta Ads queda afuera** ("lo dejamos por si escalamos", 5 de
noviembre; CLAUDE.md §39).

**Antes (5 de noviembre, hist. §137): el Resumen como tablero, publicado
(PR #59).** Pedido del usuario con capturas de referencia:
un pantallazo vistoso arriba y el detalle abajo, y que "Comparar con" no
parezca HTML básico. Período y comparación en botones de Nexo (el período se
guarda por persona; arranca en 30 días), grilla de 12 columnas en la compu,
tarjetas con su línea chica, "Ventas y ganancia" en área grande, dona de
cobros, y la evolución agrupada por semana de 32 a 183 días.

**Antes (5 de noviembre, hist. §136): el Resumen en piezas y
personalizable, publicado (PR #58).** Pedido del usuario
("un Resumen mejor, con más gráficos, personalizable"); el alcance lo decidí
yo después de mirar Square, Loyverse, Shopify y Dux ("investigá qué se usa y
decidí vos"):
- 14 piezas que cada persona muestra, oculta y ordena (Resumen →
  Personalizar), guardadas en la base por persona y negocio
  (`usuario_organizaciones.tablero`, migración aditiva). Sin armar, el
  preset del tipo de negocio (`TABLERO_DEL_RUBRO` en `backend/perfiles.js`);
- nuevas: "Para mirar hoy" (te deben / debés con lo vencido, stock a
  reponer), "Cuándo se vende" (día y hora), "Dónde entró la plata" (cobros
  por cuenta), "Quién vendió", lo más vendido y las categorías en barras;
- "Comparar con el año pasado" además del período anterior;
- la hora y el vendedor de cada venta salen de su alta en la auditoría: las
  de "Lo que ya tenías" (toda la historia de los negocios de ejemplo) cuentan
  por día y no por hora.
- **Falta:** que el usuario lo vea.

**Publicado el 5 de noviembre (PR #56 y #57):** los negocios de ejemplo
(`scripts/demo.mjs`, ya corrido en la cuenta del usuario, dicho por él), fiar
desde el punto de venta y los mensajes de WhatsApp con formato.

**Antes (5 de noviembre): negocios de ejemplo para la presentación, hechos
y corridos en la cuenta del usuario.** Pedido del usuario: "varios tipos de negocio en mi cuenta, para
explicar todas las funciones". `scripts/demo.mjs` (`npm run demo -- --email
<mail>`, la contraseña la pide sin mostrarla) entra por la API a la cuenta y
suma cinco negocios, cada uno con 4 a 6 semanas de historia (ventas
anteriores de "Lo que ya tenías": con fecha y cobro, sin mover stock ni caja):
- **Lola Indumentaria** (comercio): talles, 3 compras, ofertas, presupuesto
  mayorista, CRM, Instagram y WhatsApp, la caja abierta;
- **Mafaldas de Sofi** (emprendimiento): 3 recetas, 4 producciones, bolsa y
  sticker al vender;
- **Gimnasio Fuerza**: 13 socios (2 deben), 3 planes, combo, la barra;
- **Clima Sur** (servicios): presupuestos, 3 trabajos (uno terminado y
  cobrado a medias), 4 abonos;
- **Carnicería Don Ramón**: por kilo con PLU, balanza configurada, ofertas.

**Probado entero contra una base local** (cuenta sembrada pasada a Pro):
carga sin errores y se ve bien en Resumen, Producción, Socios y Trabajos.
Cada negocio nace con dirección y teléfono (`PUT /api/negocio`), así la guía
"Primeros pasos" solo deja pendiente "Sumá a alguien de tu equipo", que se
oculta con "Ocultar la guía" (localStorage, por negocio); verificado en los
cinco con `GET /api/negocio/primeros-pasos`.
**Ya corrido en la cuenta del usuario** (dicho por él el 5 de noviembre). Lo
que hizo falta:
1. ~~Arreglar la guía "Primeros pasos"~~: hecho (5 de noviembre).
2. **El negocio del usuario tiene que estar en Pro** (sumar negocios es de
   Pro, y el nuevo hereda el plan): Plataforma → Negocios → "Cambiar". Tope:
   5 negocios nuevos por hora y por cuenta.
3. El usuario lo corre desde la raíz:
   `npm run demo -- --email santinosolla22@gmail.com` (o `--solo <clave>`).
   Un negocio que ya existe con ese nombre se saltea.

Las producciones salen con la fecha de hoy (la ruta no acepta otra).

**WhatsApp anda de punta a punta (5 de noviembre).** El usuario vinculó su
celular y Nexo le contestó. Faltaba publicar la app de Meta y suscribirla a
la cuenta de WhatsApp (pasos en "Trámites del usuario" → Meta). PR #52 a #55,
publicados: contestar a los celulares argentinos sin el 9, el registro anota
el aviso descartado por firma o por otro número, y la página se entera al
volver de WhatsApp. **Sigue:** probar una venta por texto y por audio.
**Después, decidido por el usuario:** el número real con un chip (foto y
nombre "Nexo"; el de prueba no deja editar el perfil), con margen antes del
20. **Para decidir:** la política de privacidad publicada dice Gemini y no
nombra Groq, WhatsApp ni Mercado Pago; actualizarla pide volver a aceptarla
(se le preguntó al usuario, sin respuesta). **Revisar:** si el
`WHATSAPP_TOKEN` del servidor es el de 24 h, deja de andar; poner el del
usuario del sistema (paso 5 de Meta).

**Antes (4 de noviembre, hist. §134): WhatsApp como canal del asistente,
hecho y publicado (PR #50).** Pedido del usuario como
próximo paso:
- Mi cuenta → WhatsApp: la persona manda "NEXO <código>" desde su celular al
  número de Nexo y queda vinculada al negocio activo;
- un texto o una nota de voz vuelve como propuesta con Confirmar y Cancelar, y
  se registra con la misma ejecución, rol y auditoría que la web
  (`proponerDesdeTexto` y `ejecutarPropuesta`, sacados de las rutas del
  asistente); las devoluciones se terminan en la app;
- `backend/whatsapp.js` sin dependencias; tablas nuevas `whatsapp_vinculos` y
  `whatsapp_mensajes`;
- **probado contra un WhatsApp falso.** Para la prueba de verdad falta la app
  de Meta: es el trámite del usuario (pasos en "Trámites del usuario" →
  Meta), y después mandar las cinco claves al servidor.

**Publicado el 4 de noviembre (PR #50): §133 y §134.** WhatsApp ya está
conectado en el servidor: las cinco claves en `/etc/nexo/nexo.env`, el
webhook verificado y `messages` suscrito en Meta (app Nexo-app, número de
prueba +1 555 141 8019, gratis 90 días).

**Después (4 de noviembre, hist. §135): WhatsApp con página propia, hecho y
publicado (PR #51).** Configuración → WhatsApp
(`dominios/whatsapp.js`, los dos roles), con el logo, el vínculo que estaba
en Mi cuenta y ejemplos de qué mandar; ítem en "Tu cuenta" y una tarjeta en
la página del asistente, solo si WhatsApp está configurado. **Falta la prueba
con el celular:** vincular desde Configuración → WhatsApp y mandar una venta
al número de prueba.

**También el 4 de noviembre (hist. §133): ofertas con vigencia, hechas y
commiteadas en `solla`, sin publicar.** Punto 2 de las ideas de Praxia:
- Productos → Ofertas (admin): en porcentaje, en pesos o a precio fijo, sobre
  productos, categorías o todo, en una lista o en todas, entre fechas y ciertos
  días de la semana o del mes; con cantidad mínima, promoción por cantidad (los
  escalones son varias ofertas). Dos no se suman: gana la más barata. "Los
  precios de un día" muestra qué cambia;
- el punto de venta y el alta de venta las aplican (tachado, nombre, "Ahorra
  $ X", y la promoción que se gana llevando más); la venta anota en cada
  renglón la oferta y el precio de lista, y la ficha los muestra;
- las reglas viven en `frontend/js/core/ofertas.js`, que el servidor importa
  tal cual (la raíz pasó a `"type": "module"`);
- migración: tablas `ofertas` y `oferta_alcance`, y `venta_items.oferta_id` y
  `precio_lista` (aditivas). **Falta que el usuario lo vea.**

**Publicado el 4 de noviembre (PR #49): §131 y §132**, sin esperar a mirar el
servidor (pedido del usuario).

**Antes (4 de noviembre, hist. §131): "Adónde fue la plata" de cada
venta.** Pedido del usuario
("que cada venta tenga su fichita"):
- la ficha de la venta reparte lo que pagó el cliente en mercadería,
  packaging, cada categoría de gasto de la venta (comisión, envío, cuotas),
  IVA y "Te quedó", con importe, porcentaje y el promedio del negocio en 90
  días; marca "Más que lo normal" / "Menos que lo normal";
- la descripción de la comisión (Mercado Pago, Mercado Libre) y de las
  cuotas dice el porcentaje ("6,29 % del pago"), también en Gastos;
- sin cambios de esquema. **Falta que el usuario lo vea.**

**También el 4 de noviembre (hist. §132): etiquetas de balanza.** Punto 1 de
las ideas de Praxia:
- cada producto que se pesa tiene su código de balanza (PLU), único por
  negocio;
- Configuración → Balanza deduce el formato de la etiqueta de una etiqueta
  real (código, PLU y peso o importe impresos), y pide otra si dos formatos
  la explican;
- el punto de venta lee la etiqueta: el renglón entra con el peso, al precio
  de hoy (con importe, el peso sale de importe ÷ precio);
- migración aditiva: `productos.plu` y `organizaciones.balanza_formato`.
- **Falta probarla con una balanza de verdad** (la del compañero de Praxia
  sirve): el formato se dedujo con etiquetas armadas a mano.

**Antes (3 de noviembre, hist. §130): Mercado Pago, pasos 1 y 3 del plan,
hechos y commiteados en `solla`, sin publicar** (sesión sin el usuario:
"seguir con algo vos").
- Configuración → Cobros → Mercado Pago: conectar la cuenta (OAuth con PKCE,
  como Mercado Libre) y elegir adónde entra la plata;
- "Registrar cobro" ofrece un link de Mercado Pago (con QR, Copiar y
  WhatsApp); cuando el cliente paga, el cobro entra solo, con la comisión y
  las cuotas sin interés como gastos de la venta. Las retenciones se muestran,
  no se registran. Lo que no entra solo queda "Para revisar";
- la ficha de la venta suma "Cobrar" (en el celular no había cómo cobrar desde
  Ventas);
- el logo celeste de Mercado Pago (`frontend/img/mercadopago.svg`, de theSVG,
  MIT) en el menú de Configuración, el título de su página y el botón del
  link, como el de Mercado Libre (pedido del usuario);
- migración: rebuild del CHECK de `integraciones` e `integracion_log`, y la
  tabla `integracion_pagos`;
- **probado con un pago real el 3 de noviembre** (venta #35, ver "Trámites
  del usuario"): conectar, link, aviso firmado, cobro y comisión andan. Falta
  un pago en cuotas y uno con retenciones.

**Antes (3 de noviembre, hist. §129): la comisión y el envío de la venta
online, hechos y commiteados en `solla`, sin publicar.**
- la comisión de Mercado Libre y el envío que paga el negocio en Tienda Nube
  son gastos de la venta (`gastos.venta_id`, migración aditiva), en la cuenta
  del canal; se anulan y se restauran con ella;
- el envío que paga el cliente en Tienda Nube es un renglón "Envío";
- la ganancia por canal los descuenta, y la ficha de la venta muestra "Costos
  de vender" y lo que quedó;
- **sigue: Mercado Pago** (ver "Qué sigue"), el envío del vendedor en Mercado Libre
  y los mensajes; después, lo de
  Praxia (balanza, ofertas, cobrar a cuenta en el punto de venta).

**Publicado el 3 de noviembre (PR #45): §127 y §128.**

**Antes (3 de noviembre, hist. §128): tipo "Tienda online", hecho y
publicado (PR #45).** Pedido del usuario ("e-commerce, y
muchos locales venden digitalmente y viceversa"):
- tipo nuevo, con Venta online, Consultas, Compras, Stock y Producción (la
  caja y la bolsa del envío), sin punto de venta;
- módulo nuevo "Venta online" (`canales`) que cualquier negocio prende: las
  tiendas conectadas, el "Por dónde te compró" de cada venta, el reporte por
  canal (con lo usado al vender en el costo) y un paso de la guía;
- migración aditiva: `ventas.canal` nula, completada con la tienda o `local`
  donde se sabe; el módulo solo se prende a los negocios viejos con una tienda
  conectada.
- **Falta que el usuario lo vea.**

**Antes (3 de noviembre, hist. §127): código de barras propio, hecho y
publicado (PR #45).** Primera idea de Praxia:
- el producto y cada variante tienen su código de barras, aparte del SKU, único
  por empresa entre los dos y guardado sin espacios;
- el lector del punto de venta lo busca antes que el SKU; Tienda Nube lo
  recibe al publicar;
- suma una migración aditiva (`codigo_barras` nula en `productos` y
  `producto_variantes`, con sus índices únicos).

**Antes (3 de noviembre, hist. §126): producción básica, segunda parte,
hecha y publicada (PR #43, junto con §125).** Lo que se usa al vender (la caja, la bolsa):
- cada producto dice qué lleva, por cada uno o una vez por venta
  (Producción → Al vender, o el botón "Al vender" de su ficha);
- el alta de venta y el punto de venta lo proponen debajo de los renglones, y
  se cambia en el momento; lo que quedó sale del stock (origen `consumo`) y
  entra al costo y al margen de la venta y al resultado;
- una venta que no lo dice (Tienda Nube, Mercado Libre, presupuestos) lleva lo
  de siempre, hasta donde alcance el stock.

Suma una migración aditiva: `componentes_venta` y `venta_consumos`.

**Antes (3 de noviembre, hist. §125): producción básica, primera parte,
hecha y publicada (PR #43).** Módulo "Producción" (Configuración → Funciones;
prendido de partida en Emprendimiento):
- recetas: qué lleva cada cosa y cuánto suele rendir;
- producir: lo que se usó y lo que salió de verdad, con el costo que sale de
  los materiales y entra al costo promedio;
- anular, que devuelve todo y saca ese costo del promedio.

Suma una migración: cuatro tablas nuevas, `movimientos_stock.produccion_id` y
los orígenes `produccion` y `consumo` (rebuild del CHECK, como §124).

**Antes (2 de noviembre, hist. §124): "Lo que ya tenías", hecho y sin
publicar.** El punto 8c de "Qué sigue", salvo importar desde una planilla.
El alta pregunta "¿Tu negocio ya venía funcionando?" (paso 7), y con "Sí" entra
directo a Configuración → Lo que ya tenías:
- el stock de hoy con lo que costó cada uno, y el alta en la misma planilla;
- lo que te deben y lo que debés, como saldos anteriores;
- la plata de hoy;
- las ventas recientes, que no mueven stock ni caja.

Lo pidió el usuario por su hermano (mates), que tenía que inventar una compra
para cargar el costo. Su cuenta ya existe: lo encuentra en Configuración o en
Stock → "Stock inicial". **Para decidir con el usuario:** sus ventas ya
cargadas con costo 0 muestran 100 % de margen, porque el costo de una venta
queda congelado (CLAUDE.md §8).

**Antes (2 de noviembre, hist. §123): Mercado Libre hecho, sin publicar.**
Configuración → Canales de venta → Mercado Libre: conectar (OAuth con PKCE,
el token se renueva solo), vincular cada publicación con un producto de Nexo
(el SKU lo sugiere, "Traer su stock" opcional), stock y precio que manda Nexo,
y ventas que entran cobradas. Probado contra un Mercado Libre falso (11 tests)
y en Chrome con una demo. En el menú de Configuración, Tienda Nube lleva la
nube y Mercado Libre su emblema (pedido del usuario). **Falta:** publicar,
cargar `MERCADOLIBRE_APP_ID` y `MERCADOLIBRE_CLIENT_SECRET` en el servidor y
probar con usuarios de prueba (pasos en "Qué sigue", punto 5).

**Orden acordado con el usuario (2 de noviembre, al cerrar la sesión):**
1. ~~La mejora pendiente~~: era la carga inicial, hecha en `solla` (hist.
   §124).
2. ~~Publicar todo junto~~: hecho el 2 de noviembre (PR #42). La migración
   corrió en la base real (CHECK con `stock_inicial`, integridad ok). El
   primer CI falló por dos tests de socios y abonos que calculaban "hoy" en
   UTC (fallaban desde las 21 h); se arreglaron en el mismo PR.
3. ~~Las claves de Mercado Libre en el servidor~~: cargadas el 2 de noviembre
   con el comando de PowerShell, y el proceso las tiene. **Falta probar
   Mercado Libre con los usuarios de prueba** ("Qué sigue", punto 5).
4. **El usuario no tiene una cuenta de Mercado Libre con productos
   publicados.** No hace falta: Mercado Libre da usuarios de prueba que
   pueden publicar y comprar entre ellos (ver "Qué sigue", punto 5).

**Antes (2 de noviembre, hist. §121 y §122): Tienda Nube hecha.**
Configuración → Canales de venta → Tienda Nube: conectar (OAuth), publicar
productos, stock y precio que se mandan solos y pedidos que pasan a venta:
cobrada si se pagó online, por cobrar si el pago es manual (§122). Probado
contra un Tienda Nube falso (15 tests) y en Chrome
con una demo; **falta probarlo contra la tienda demo de verdad**, que necesita
el sitio publicado (la redirección de la app apunta ahí). Pasos en "Qué
sigue", punto 5.

**Para retomar (sesión del 29 de octubre):**
1. **El panel de la plataforma está hecho y publicado** (hist. §111, PR #32).
   Es "Plataforma", en el grupo "Nexo" al final del menú, con Resumen, Cuentas
   y Negocios, y solo lectura.
   - Lo ve la cuenta cuyo mail está en `NEXO_ADMIN_PLATAFORMA`, con el mail
     confirmado. En el servidor ya está:
     `NEXO_ADMIN_PLATAFORMA=santinosolla22@gmail.com` en `/etc/nexo/nexo.env`
     (el proceso la tiene cargada). Para verlo en la compu, la misma línea en
     el `.env` de la raíz.
   - El README se puso al día en la misma publicación (PR #33).
   - **Falta que el usuario lo vea.**
   - **IVA hecho** (hist. §112, §113 y §114, publicados en el PR #34): alícuota del producto, condición del cliente y del proveedor,
     IVA congelado en cada renglón de venta, presupuesto y compra, letra
     automática, factura A discriminada, compras con factura A como crédito
     fiscal (costo sin IVA), ganancia sin IVA para el inscripto y el libro
     IVA ventas y compras en Estadísticas. **Falta que el usuario lo vea:**
     poner el negocio como responsable inscripto en Configuración y cargar
     una compra con un proveedor inscripto.
2. **La etapa 8b está completa** con la Fase 4 (hist. §109: descargar los
   datos, dar de baja el negocio o la cuenta, `NEXO_REGISTRO=off` y campo
   trampa en el alta). Queda de 8b solo "entrar con Google", sin fecha.
3. **La presentación pasó al 20 de noviembre** (dicho por el usuario el 1 de
   noviembre). IVA y ARCA en homologación ya están. El orden vigente es el
   "Plan hasta el 20 de noviembre", al principio de "Qué sigue".
4. **ARCA en homologación hecho y publicado** (hist. §115, PR #34, 29 de
   octubre). Factura y nota de crédito con CAE de prueba real: se probó
   contra ARCA una A con dos alícuotas, una B y una nota de crédito A
   asociada, todas autorizadas. Configuración → Factura electrónica tiene los
   pasos de la delegación y "Verificar".
   - **En el servidor:** el certificado está en `/etc/nexo/arca/` (root:nexo,
     640) y `NEXO_ARCA_CERT` y `NEXO_ARCA_KEY` en `/etc/nexo/nexo.env`. Se
     comprobó desde el servidor que llega a ARCA.
   - **El ticket de 12 horas:** ARCA da uno por certificado y no da otro
     mientras esté vigente. La compu había pedido uno (vence el 30 de octubre
     a las 7:02) y se copió a `arca_tickets` de la base del servidor, así
     anda ya; después el servidor pide los suyos. Por eso, **en la compu se
     prueba con `NEXO_ARCA=stub`**: si la compu pide un ticket real, el
     servidor queda sin poder facturar hasta 12 horas. Un segundo certificado
     de homologación solo para la compu lo evitaría (opcional).
   - **Falta que el usuario lo vea** en el sitio: activarla en Configuración
     (CUIT, condición, un punto de venta que no tenga comprobantes internos,
     Verificar) y facturar una venta. En homologación todos los negocios
     comparten la serie de cada punto de venta (el 3 ya tiene la A, la B y la
     nota de crédito de prueba): los números saltan, es lo esperado.
   - Faltan las capturas de ARCA para los pasos de la página (las saca el
     usuario, con su clave fiscal).
   - La facturación real (producción) es después de la presentación y pide
     el CUIT de Nexo (decisión con un contador).
4b. **La factura con el formato de ARCA** (hist. §116, publicado en el PR #35): datos fijos del negocio en Configuración → Comprobantes (razón social, ingresos brutos, inicio de actividades), y los de cada factura (cliente, condición de venta, período) en el formulario de facturar, con una foto en la factura. **Falta que el usuario cargue sus datos fijos** en Configuración y lo vea impreso.
5. Hecho en esta sesión: el código del mail (hist. §108), la baja (hist.
   §109), ambos publicados (PR #31), y la limpieza de cuentas de la base real
   (hist. §110). Falta que el usuario pruebe §108 y §109 en el sitio.

**Nexo está publicado: https://nexosystem.duckdns.org** (hist. §103, guía
en `docs/publicar.md`). Sigue con `noindex` (`deploy/Caddyfile`, comprobado en
vivo el 1 de noviembre): se saca cuando arranque la publicidad.
- **Servidor:** Oracle Cloud, cuenta "Nexoapp", Brazil East.
  - VM.Standard.E2.1.Micro con 1 GB de memoria y 2 GB de swap, Ubuntu 24.04;
  - IP `137.131.218.182`, que se mantiene mientras exista la instancia;
  - SSH: `ssh -i "C:\Users\HP ULTRA 5\.ssh\nexo-oracle.key" ubuntu@137.131.218.182`.
- **Cómo corre:**
  - Caddy (https solo) → Node en 127.0.0.1:3000 → `/var/lib/nexo/nexo.db`;
  - el código está en `/opt/nexo` y las variables en `/etc/nexo/nexo.env`.
- **Se actualiza solo:** lo que llega a `main` con el CI en verde está en el
  servidor en unos 5 minutos (`deploy/actualizar.sh`). Si el arranque falla,
  vuelve al commit anterior.
- **Respaldos:** en cada arranque y todos los días a las 3:30, en
  `/var/lib/nexo/respaldos`. El diario además sube la copia cifrada a
  Backblaze B2 (bucket `nexo-respaldos-solla`, EU Central;
  `backend/db/respaldo-nube.js`, guía en `docs/publicar.md`).
- **La base del servidor es la real desde el 27 de octubre:** la copió
  `VACUUM INTO`. La de la compu quedó como copia vieja, y lo que se cargue
  ahí no sube.
- **Lo que tiene que hacer el usuario:**
  - entrar con su cuenta en el sitio, y desde ahí usar el servidor;
  - parar su `npm start` local cuando quiera: ya no hace falta;
  - **confirmar `NEXO_NEGOCIO_VENTAS=1`**: las consultas de la landing caen
    en el CRM de "Mi negocio" (lo elegí yo; su decisión era "un negocio
    suyo");
  - los enlaces de verificación que se mandaron antes apuntan a
    `localhost:3000`: reenviarlos desde el sitio (Mi cuenta) si hacen falta;
  - opcional: el token de DuckDNS en `/etc/nexo/duckdns.env` (pasos en la
    guía).
- **Pendiente de la publicación:**
  - **Oracle recupera las instancias gratis que pasan una semana casi sin
    uso.** Pasar a Pay As You Go lo evita, pero es una decisión de plata del
    usuario.
- **La etapa 8b está hecha:** Fases 1 (mail en la cuenta, hist. §102), 1b
  (invitaciones, hist. §104), 2 (recuperar la contraseña, hist. §105), 3
  (términos, privacidad y edad, hist. §106), el código del mail (hist. §108)
  y 4 (la baja, hist. §109).
- **Nuevo (29 de octubre, hist. §109):** Configuración → "Tus datos y la
  baja" (descargar todo en JSON y dar de baja el negocio: cerrado 30 días,
  cancelable, después se borra) y "Dar de baja mi cuenta" en Mi cuenta.
  **Falta que el usuario lo vea.**
- **Nuevo (29 de octubre, hist. §108):** el mail se confirma con un código
  de 6 números antes de crear la cuenta, y antes de cambiarlo. Pedido del
  usuario: con un mail ajeno se podía crear una cuenta igual. **Falta que el
  usuario lo vea.**
- **Para el usuario, de la Fase 3:** cargar `NEXO_TITULAR_NOMBRE`,
  `NEXO_TITULAR_CUIL` y `NEXO_TITULAR_DOMICILIO` en el `.env` de su compu y en
  `/etc/nexo/nexo.env` del servidor: sin ellos, `/terminos` y `/privacidad`
  dicen "dato a completar". Y revisar los dos textos (son borradores). Al
  publicar, **todas las cuentas** ven "Antes de
  seguir" una vez y aceptan.
- **Falta que el usuario confirme** que el mail de prueba de §101 llegó bien
  y cómo se ve. Desde el servidor salió otro el 27 de octubre.

**Nuevo: etapa 8b, login, mail, términos y edad** (8b en "Qué sigue").
Pedida por el usuario el 27 de octubre, después de ver la landing ("quedó
perfecta") y antes de seguir con cosas grandes. La investigación está hecha:
`docs/investigacion-login-legal.md`, con el plan en cuatro fases. El
hallazgo más grave: ninguna cuenta tiene mail, así que un admin que se olvida
la contraseña pierde su negocio.
- **Decidido el 27 de octubre:** el titular legal es Santino (19 años; sus
  datos van en `.env`, no en el repo público), y se acepta de 13 a 17 años en
  Gratis, con permiso de los padres.
- **El mail ya manda** (27 de octubre): `nexosystem.app@gmail.com` con
  contraseña de aplicación en el `.env` de la raíz (solo en la máquina de
  Santino; en `.env.example` están las variables vacías). `backend/mail.js` es
  un cliente SMTP propio sobre `node:tls`, sin dependencia, con
  `plantillaMail()` para el cuerpo y `NEXO_MAIL=stub` para los tests
  (`backend/test/mail.test.js`, servidor SMTP falso). `npm run probar-mail`
  manda uno de prueba (hist. §101).
- **Fase 1, hecha (hist. §102):**
  - el mail en la cuenta, con verificación por enlace;
  - el login y el alta con mail;
  - la página obligatoria "Sumá tu mail" para las cuentas de antes;
  - en Mi cuenta, cambiar el mail;
  - el aviso en el Resumen.
- **Fase 1b, hecha (hist. §104, commiteada en `solla`):** cada persona tiene
  su cuenta (decisión del usuario del 27 de octubre). El admin invita por mail
  desde Configuración → Usuarios → Invitar, y `POST /api/usuarios` ya no
  existe.
  - Quien no tiene cuenta la crea desde el enlace del mail, que le deja el
    mail confirmado.
  - Quien tiene cuenta ve la solicitud en el Resumen (o en el enlace) y la
    acepta.
  - Una cuenta sin ningún negocio entra igual: ve sus invitaciones y puede
    crear el suyo.
  - **Falta que el usuario lo vea.**
- **Fase 2, hecha (hist. §105):** "¿Te olvidaste la contraseña?" en el
  login, con un enlace por mail de un solo uso y 30 minutos. Usarlo cierra
  todas las sesiones, confirma el mail y avisa. El admin ya no resetea la
  contraseña de quien confirmó su mail. **Falta que el usuario lo vea.**
- **Fase 3, hecha (hist. §106):** `/terminos` nueva y privacidad completa,
  con los datos del titular desde `NEXO_TITULAR_*`. El alta y la cuenta por
  invitación piden la edad y la casilla sin marcar; de 13 a 17 años, solo
  Gratis. Una cuenta sin la versión vigente (`TERMINOS_VERSION` de
  `backend/legal.js`) ve "Antes de seguir" y el backend no la deja operar
  (403 `faltan_terminos`). Cambiar esa versión hace que todos vuelvan a
  aceptar. **Falta que el usuario lo vea.**
- **Pendiente nuevo (pedido del usuario del 28 de octubre): entrar con
  Google.** Está en "Qué sigue", 8b.
- **Lo que encontró el hermano del usuario al crear su cuenta** (28 de
  octubre; hist. §107):
  - "Emprendimiento" no marcaba ninguna sección. Arreglado: ahora trae
    Compras y Stock.
  - **Pedido nuevo, para más adelante:** cargar lo que ya tiene un negocio
    que existe (stock con costo, deudas, saldos, ventas recientes e importar
    desde una planilla). Las decisiones del usuario y el diseño están en "Qué
    sigue", 8c.
  - **Investigado, para más adelante:** el cierre de caja con todos los
    medios de pago, no solo el efectivo (8d, `docs/investigacion-caja.md`).
- **Gemini:** recomendado el plan pago con una sola clave de Nexo y un tope de
  frases por plan (sección 2.6). Falta que el usuario lo confirme, con los
  topes.

**En curso: etapa 8, planes, landing y publicación** (8 en "Qué sigue"),
en cuatro fases (§98 a §100 y la publicación). El plan está en el punto 8.
- **Fase 1, planes en el backend: hecha** (hist. §98), commiteada en
  `solla`.
- **Fase 2, el plan dentro de la app: hecha** (hist. §99), commiteada.
  Incluye el contacto `POST /api/publico/consulta`, adelantado de la Fase 3.
- **Fase 3, la landing: hecha** (hist. §100), commiteada en `solla`, sin
  pushear.
  - `/` es la landing pública, y la app pasa a `/app`;
  - suma privacidad, robots y sitemap, con capturas reales de la demo;
  - el usuario la vio el 27 de octubre: "quedó perfecta". La inspiración
    que dio fue escalafy.com.
  - **Privacidad es un borrador** para que el equipo revise el texto.
- **Fase 4, la publicación: hecha** (hist. §103). Está en
  https://nexosystem.duckdns.org, con `NEXO_URL_PUBLICA` y
  `NEXO_NEGOCIO_VENTAS=1` definidas.
- **Las decisiones del usuario ya están tomadas** (precios, topes de Gratis,
  Oracle Cloud y DuckDNS, contacto al CRM): ver hist. §98.
- **PWA y celular de verdad: hechos** (hist. §94 a §97), commiteados en
  `solla`, sin pushear. El diseño y la investigación están en
  `docs/investigacion-celular.md`.
  - **PWA:** se instala, y sin conexión abre con lo último que cargó. Suma la
    CSP.
  - **Navegación:** barra de abajo con las secciones del negocio y "Más".
  - **Pantallas:** formularios a pantalla completa, y el "atrás" los cierra.
  - **Listas:** de dos líneas, unos 10 renglones por pantalla en vez de 1.
  - **Filtros y alta:** los filtros en una hoja y un "Nuevo" flotante por
    vista.
  - **Falta que el usuario lo pruebe en su celular.** Para instalarla hace
    falta https o localhost: entrando a la compu por IP en la red de la casa
    se ve el diseño nuevo, pero no se instala ni abre sin conexión. Las
    opciones son ngrok (gratis, ver "Trámites"), o en Chrome del celular
    `chrome://flags` → "Insecure origins treated as secure" con la IP de la
    compu.
- **La auditoría es también del empleado** (hist. §93), sin costos ni filas
  de compras. Commiteado en `solla`; falta que el usuario lo vea.
- **La cuenta de demo del profe ya no existe** (hist. §110): el 29 de octubre
  el usuario pidió dejar solo su cuenta y la de su hermano. Para una demo
  nueva, sembrar un negocio con `npm run seed` o cargarlo desde el alta.
- **Mi cuenta es una página de Configuración** (hist. §92): contraseña y
  cerrar sesión, para los dos roles. El círculo de perfil lleva ahí; el modal
  de antes se sacó.
- **CRM: hecho y commiteado en `solla`** (hist. §89 el backend, §90 la
  pantalla, §91 la unión con Clientes). **En el menú es "CRM"**, en el lugar
  de Clientes, y es una sola página con pestañas: Clientes (la base de
  siempre), Consultas, Para hoy, Dejaron de comprar y Números. Pedido del
  usuario del 26 de octubre: "se tiene que llamar CRM y tiene que estar
  combinado con la base de datos de clientes, todo en la misma página". Con
  el módulo apagado vuelve a decir "Clientes", sin pestañas. Tiene:
  - embudo con arrastrar y soltar, y en el celular una etapa por pestaña;
  - "Para hoy", también en el Resumen;
  - Dejaron de comprar, Números y alta rápida de tres campos;
  - la ficha pasa la consulta a cliente, presupuesto, venta o socio, y se gana
    sola;
  - en la ficha del cliente, sus consultas y su seguimiento;
  - las etapas, en Configuración.
  - **Falta que el usuario lo vea.** Su base real (gimnasio) ya lo tiene
    prendido (migrada el 26 de octubre, respaldo
    `nexo-20261026-120237.db` en OneDrive), con las etapas Consulta → Clase
    de prueba → Seguimiento.
- **Tipo de negocio fijo y funciones que se suman (hist. §88): hecho y
  commiteado en `solla`, sin pushear.** Configuración tiene "Funciones" y una
  página aparte para cambiar el tipo; el catálogo se llama según lo cargado,
  con pestañas Productos | Servicios cuando hay de los dos. Falta que el
  usuario lo vea. **Su base real es un gimnasio** (no Servicios, como decía
  esto antes) con `modulos` en NULL: el próximo `npm start` la deja en
  `pos crm compras stock socios` (hist. §89).
- **Falta que el usuario vea §78 a §87** (servicios, trabajos, agenda, abonos,
  primeros pasos y lo demás). Ya están pusheados y en `main`.
- **Arreglado un error de fechas** (hist. §82): desde las 21 h, toda operación
  quedaba con la fecha del día siguiente (el servidor usaba UTC). Ahora "hoy"
  es el día de la Argentina (`backend/fecha.js`). **Para decidir con el
  usuario:** si se corrigen las operaciones viejas que quedaron corridas.
- Guía de primeros pasos en el Resumen (hist. §81): hecha y commiteada.
- La ficha del cliente muestra sus trabajos y abonos (hist. §83).
- Un abono cobra todas sus cuotas pendientes de una vez (hist. §84).
- Configuración marca y avisa los cambios sin guardar (hist. §85).
- Presupuestos, ventas y Resumen dicen "servicio" en un negocio de servicios
  (hist. §86).
- Agenda de trabajos, semana y mes (hist. §80): hecha y commiteada, pedida por
  el usuario el 20 de octubre. Pestañas en Trabajos; sin cambio de esquema.
- Abonos mensuales (hist. §79): hechos y commiteados. Módulo `abonos`, con las
  cuotas armadas por el mismo `periodosPendientes()` que las de socios. Falta
  que el usuario lo vea.
- Servicios con funciones propias, primera parte (hist. §78): hecha y
  commiteada. El catálogo se llama "Servicios" en ese tipo de negocio, con
  formulario propio (descripción, duración, unidad `hora`), y el módulo nuevo
  `trabajos`: presupuesto → trabajo con día, responsable y estado → venta.
  Falta que el usuario lo vea.
- Varios negocios por cuenta (hist. §77) está hecho y commiteado: selector
  arriba del menú, "Agregar negocio" y el rol por negocio. El usuario lo vio
  y le gustó (20 de octubre): "que se vaya manejando por cuenta".
- Socios, cuotas e ingreso (hist. §74) y planes con varias duraciones, varios
  planes por socio y descuentos (hist. §75) están hechos y commiteados.
- El usuario ya probó la primera versión de socios en la base real, que es un
  gimnasio desde Configuración. Sus datos pasaron a la forma de §75 con la
  migración de `db/index.js`.
- Falta que vea §75 y diga qué cambiaría. Los planes y descuentos ya no
  están en Configuración: son "Planes", en el menú, dentro de Socios (hist. §76).

**Ramas.** El trabajo diario va sobre `solla`, la rama de Santino (decisión
del usuario, hist. §28): no se abre una rama por tarea. `Tosi` es la de
Joaquín.
- `main` tiene todo hasta §116 (PR #34: IVA y ARCA en homologación; PR #35: formato de factura,
  publicado el 29 de octubre).
- **Desde el 28 de octubre se trabaja local** (propuesta del usuario): cada
  cambio se commitea en `solla`, sin push ni PR. Se publica cuando el usuario
  lo pide: Claude abre y mergea el PR con el CI en verde, por la API de
  GitHub (no hay `gh`), y el servidor lo toma solo en unos 5 minutos.
  Mientras tanto, el sitio público sigue en lo último que se mergeó.
- `main` ya está mergeada en `solla` (los PR #24 y #25 pasaron la Etapa A y
  F0–F5). Pasar `solla` → `main` es por PR, y desde la Fase 4 el CI de GitHub
  Actions (`npm run lint` + `npm test`) corre en cada PR.

**Construido.** El núcleo de CLAUDE.md §1–§27 está completo (ver "Estado real
del sistema" en `CLAUDE.md`). Facturación de monto simple, sin IVA ni ARCA.

**Etapa D (punto de venta, CLAUDE.md §30): hecha** (hist. §67 el backend, §68 la
pantalla `frontend/js/dominios/pos.js`).

**Etapa A del roadmap (multi-empresa, CLAUDE.md §28): núcleo hecho** (hist.
§37–§49). Todas las tablas de negocio tienen `organizacion_id` y todas las
consultas filtran por la empresa de la sesión, incluidos los cinco catálogos
(hist. §49). Una empresa se crea desde la pantalla de login con
`POST /api/auth/registro` (hist. §51). Lo que falta para cerrarla está en
"Qué sigue".

**Etapa B (modularizar `app.js` + PWA, CLAUDE.md §31): en curso** (hist.
§52–§56). Hechas F0 (test estático `backend/test/frontend-modulos.test.js`),
F1 (`sesion.js` inyecta `app.js` como módulo ES, con `onerror`), F2 (el
núcleo compartido salió a `frontend/js/core/`: `formato`, `ui`, `csv`,
`filtros`, `seleccion`, `comprobante`, `router`, `negocio`, `registro`), F3
(primeros dominios en `frontend/js/dominios/`: `usuarios`, `configuracion`,
`perfil`) y F4 (`cuentas-corrientes`, que invoca fichas, cobrar y pagar de otros
dominios por nombre con `invocar`) y F5 (`gastos`, más `core/maestros.js` con `cuentasTesoreria`,
`proveedores` y `poblarSelectCuentas`; hist. §56). `app.js` bajó de 9407 a 7083
líneas y sigue teniendo el resto de los dominios; falta extraerlos (F6–F13) y la
PWA (B2).
Decisión para la Etapa C: `precio_unitario` pasa a ser precio final con IVA
incluido.

**Base de datos real** (`backend/db/nexo.db`, en `.gitignore`):
- Migrada a §98 (planes) el 27 de octubre de 2026 en un `npm start`. Sus 4
  negocios quedaron en Pro sin vencimiento. Respaldo previo:
  `nexo-20261027-123610.db` en OneDrive.
- Migrada a §77–§79 el 25 de octubre de 2026 en un `npm start` (respaldo
  `nexo-20261025-225132.db` en OneDrive).
- **Ya migrada a la Etapa A** (6 de octubre de 2026, primer arranque real, hist.
  §57): se aplicó §37–§49 de una vez. Los conteos de las 36 tablas dieron
  idénticos antes y después (solo bajó `sesiones`, que el arranque limpia),
  `integrity_check` ok, `foreign_key_check` sin filas y ninguna fila sin
  `organizacion_id`. md5 de la base recién migrada: `8dc00857…`. Ya no sirve
  de referencia porque cambia con el uso (el 16 de octubre era `b10b3a94…`):
  "la base real no cambió" se controla con el md5 de antes y de después de
  cada verificación, que los scripts calculan solos.
- Copias de la base **anterior** a la migración (md5 `a25ce51d…`):
  `backend/db/nexo.db.backup-antes-etapa-a-20261005-210622` y, fuera del repo,
  `~/Documents/nexo-backups/`. Para volver atrás, restaurar una de las dos.
- `NEXO_BACKUP_DIR` quedó definida como variable de entorno **de usuario de
  Windows** apuntando a `C:\Users\HP ULTRA 5\OneDrive\Nexo-respaldos`: los
  respaldos automáticos salen a la nube sin hacer nada. Si hace falta quitarla:
  `[Environment]::SetEnvironmentVariable('NEXO_BACKUP_DIR',$null,'User')`. Una
  terminal ya abierta no la ve hasta reiniciarse.
- **Respaldo automático** (`backend/db/respaldo.js`, auditoría de hist. §57): cada
  arranque respalda la base ANTES de abrirla, con rotación de 14 y sin duplicar si
  no cambió nada. Sin `NEXO_BACKUP_DIR` el destino es `<repo>/backups/` (ignorada
  por git, mismo disco que la base). Si el respaldo falla, el arranque se corta.
  Variables: `NEXO_BACKUP=off` (lo apaga), `NEXO_BACKUP_DIR`, `NEXO_BACKUP_KEEP`. Manual: `cd backend && npm run backup`.
  Con `node --watch` cada reinicio con datos nuevos crea uno y los 14 rotan rápido.
- Tiene una sola organización ("Mi negocio") y un solo usuario, admin.

**Servidor**: `cd backend && npm start`, en el puerto 3000 (`PORT` lo cambia).
- Antes de arrancar, `npm start` y `npm run dev` bajan Satoshi si falta
  (`scripts/fuentes.mjs --si-falta`, hist. §72). Sin conexión solo avisa y el
  servidor arranca igual.
- Node 22.13+ (`engines`, `.nvmrc`). `npm start`, `npm run dev` y
  `npm run backup` leen `.env` de la raíz si existe (`--env-file-if-exists`;
  plantilla en `.env.example`, hist. §59). Lo que ya está en el entorno le gana
  al archivo. `npm test` no lo lee. En la máquina de Santino, `.env` tiene la
  clave del mail (hist. §101).
- `GEMINI_API_KEY`: sin ella el asistente responde 503 y el resto funciona
  igual.
- `NEXO_TRUST_PROXY=<n>` (cantidad de proxies de confianza delante, normalmente
  1) es **obligatoria detrás de un proxy inverso**: sin ella `req.ip` es siempre
  la IP del proxy y 30 logins fallidos de cualquiera bloquean el login de todas
  las empresas 15 minutos (tope por IP, hist. §57). En `NODE_ENV=production` sin
  ella el servidor avisa al arrancar.
- `NEXO_INTERPRETE=stub` reemplaza a Gemini por un parser determinista para
  pruebas (formato en `interpretarStub`, `backend/interprete.js`).

**Instalar desde cero funciona** (hist. §48): con `nexo.db` borrado, el primer
arranque crea todo y `POST /api/auth/registro` da de alta la primera empresa
con su admin (adopta la organización sembrada).

## Decisiones vigentes

Las que no están en `CLAUDE.md` y que alguien podría "arreglar" sin saberlo:

**Multi-empresa y seguridad**
- **Se entra con el mail, y es único en todo Nexo** (hist. §102, reemplaza al
  "usuario único" de §45). El login no pide empresa. El nombre de usuario
  sigue siendo único y global (`POST /api/usuarios` lo controla así a
  propósito). En una cuenta nueva el usuario es su mail; las de antes entran
  también con el usuario viejo.
- **Aislamiento entre empresas:** filtro plano `AND organizacion_id = ?` con la
  empresa de la sesión, nunca `(? IS NULL OR ...)`. Un id de otra empresa da el
  mismo 404/400 que uno inexistente (hist. §40–§49).
- **Tablas hijas sin columna propia** (`venta_items`, `cobros`, `pagos`,
  `movimientos_cc_*`, atributos): heredan el aislamiento de su fila padre
  (hist. §43, §47).
  - **Excepción: `producto_variantes` tiene `organizacion_id`** (hist. §65),
    solo para que su SKU sea único por empresa en la base. Una FK compuesta
    `(producto_id, organizacion_id)` la ata a la empresa de su producto. Las
    consultas la siguen filtrando por el JOIN a `productos`.
- **`organizacion_id` es `NOT NULL` en todas las tablas de negocio** (hist.
  §65), salvo `auditoria`. Un alta que no la cargue falla en la base.
- **SKU único por empresa** (hist. §65): `idx_productos_org_sku` e
  `idx_producto_variantes_org_sku`. Cada tabla por separado, como antes: un
  SKU de variante puede coincidir con el de un producto.
- **Catálogos por empresa:** `organizacion_id NOT NULL` y
  `UNIQUE(organizacion_id, nombre)`. Cada empresa recibe su depósito, lista y
  cuentas base vía `sembrarCatalogosBase` al arrancar (hist. §49).
- **La lista y el depósito predeterminados tienen que estar activos.** El
  `PATCH` rechaza (400) marcar como predeterminado uno inactivo, en vez de
  activarlo solo (hist. §50). Las altas de los cinco catálogos se auditan.
- **El registro de empresas es público** (decisión del usuario, hist. §51),
  sin verificación de email ni captcha. Solo lo frena un tope de 5 intentos
  por hora y por IP, en memoria.
- **`auditoria` no está en el backfill de arranque** de `organizacion_id`: su
  NULL de `login_fallido` es legítimo. Volver a sumarla al array de
  `db/index.js` reintroduce el bug de hist. §51.
- **`GET /api/auditoria` es de los dos roles** (hist. §93). Al empleado se le
  podan los JSON de valor anterior/nuevo con `podarSensibles` (el filtro de
  `res.json` no entra en un string) y no le llegan las filas de `compra`,
  `pago` ni `devolucion_proveedor`. Un `login_fallido` con un usuario inexistente
  queda con `organizacion_id NULL`, invisible para todas las empresas
  (hist. §46).

**Migraciones**
- Se sigue el patrón de CLAUDE.md §34, más una regla aprendida en hist. §48:
  - todo `ALTER` nuevo va **después del último rebuild de su tabla**;
  - `schema.sql` tiene que reflejar la forma final de cada tabla, incluido
    cada valor de sus `CHECK`. Si no, una base nueva dispara rebuilds viejos.
  - Por eso una columna nueva va en los dos lugares: en el `CREATE TABLE` de
    `schema.sql`, al final, y como `ALTER` en `db/index.js` para las bases
    existentes (hist. §64).
  - Los `CREATE INDEX` y las vistas que usan una columna sumada por `ALTER`
    van en `db/index.js`, después de ese `ALTER`. En `schema.sql`, que corre
    antes, una base vieja fallaría con "no such column".
  - `npm run verificar-migracion` (también en el CI) falla si la definición
    de una tabla en `schema.sql` (columnas, FK, `CHECK`, `UNIQUE`) no es la
    final.
  - Un rebuild que solo cambia una restricción puede partir del `CREATE` que
    la tabla tiene en `sqlite_master` en vez de una foto escrita a mano
    (patrón de hist. §65, `definicionConEmpresaObligatoria`). Así no pierde
    columnas sumadas por `ALTER`.

**Stock, precios y vencimientos**
- **El costo promedio ponderado es global por producto**, no por depósito. El
  stock mínimo/máximo también es global, y hay un depósito por operación, no
  por renglón (hist. §24).
- **Listas de precios:**
  - el precio es fijo por producto y lista;
  - `precio_venta` es el precio de la lista predeterminada, y los dos se
    mantienen sincronizados;
  - `lista_precio_id`/`deposito_id` en NULL en una operación significa "el
    predeterminado de ese momento" (hist. §23, §24).
- **Vencimientos:**
  - las operaciones anteriores a esa etapa quedaron como contado (vencimiento =
    su propia fecha) para no mover el aging histórico (hist. §25);
  - la condición de pago habitual de un cliente o proveedor solo se propone,
    no pisa lo que ya se cargó (hist. §26).

**Diseño visual (hist. §62, §69, §72)**
- **Principio del usuario (19 de octubre), por encima de los demás:** la
  interfaz se diseña para alguien que nunca usó Nexo. "No quiero que
  simplemente cumpla la función": él entiende el programa a la perfección,
  "pero alguien que no conoce Nexo, ni nunca lo probó, no va a tener ni
  idea". Pide foco en los pequeños detalles que separan una aplicación
  pensada y estética de "una aplicación sencilla hecha con inteligencia
  artificial", que "se pueda interactuar bien" y que las cosas sean simples.
  Lo que se configura va en pasos y páginas aparte, "bien estructurada como
  una aplicación real", nunca en "un cuadradito que se abre".
  - En la práctica, antes de dar por terminada una pantalla o un flujo:
    - qué ve y qué entiende quien entra por primera vez;
    - estados vacío, cargando, error y éxito;
    - foco y teclado, transiciones y textos;
    - y capturas al usuario.
- **Estructura de Dub, base negra de Nexo (hist. §72):**
  - bordes finos en vez de sombras: paneles y tarjetas sin sombra;
    `--shadow-md`/`--shadow-lg` solo para lo que flota;
  - densidad compacta (`--control-h` 36 px en escritorio; 44 px en el
    celular, el POS y el login);
  - radios de Dub: 6 inputs, 8 botones, 12 tarjetas, 16 modal y hoja.
- **Marco de marca (hist. §72):** la sidebar y un marco de 8 px (`--marco`)
  alrededor del contenido son negros (`--frame`) en los dos temas. El
  contenido vive en una hoja (`.main`) con borde fino. En el celular no hay
  marco. El scroll sigue siendo el del documento.
- **El tema de partida es el oscuro** (hist. §72): sin elección guardada no se
  sigue al sistema operativo. El claro va adaptado: hoja gris `#F5F5F5` y
  tarjetas blancas, nunca el lienzo blanco de Dub.
- **El negro es el color de marca** (el logo es blanco y negro): sidebar,
  marco, fondo del login y avisos son negros, con grises neutros. El rediseño
  lo había cambiado por azul noche y el usuario lo corrigió (hist. §62,
  addendum). Los acentos van encima, no en su lugar.
- **Botón primario en tinta, como Dub** (hist. §72): `--primario-bg`, blanco
  en oscuro y negro en claro. Reemplaza al "azul para toda acción" de hist.
  §62: volver atrás es cambiar los tres tokens `--primario-*`.
- **Un solo acento, el azul** (`--accent`): enlaces, foco, sección activa
  (tinte `--sidebar-active`, sin raya al costado), selección y datos clave.
  Sobre negro va `--accent-on-dark`. El amarillo del primer rediseño se sacó
  porque al usuario no le gusta negro con amarillo: no sumar un segundo color
  de acento sin preguntar.
- **Tipografía (hist. §72):** Inter (OFL, `frontend/fonts/inter.woff2`) para
  texto y cifras, y Satoshi solo para títulos (`--font-display`: marca, h1 de
  la página, login, título del POS y membrete). Nada de grotescas "con
  carácter" en los números (hist. §69).
  - **Satoshi no se versiona:** su licencia (ITF Free Font License) permite
    alojarla pero no redistribuirla, y el repo es público. La baja
    `npm run fuentes` (`.gitignore`: `frontend/fonts/satoshi-*.woff2`); si
    falta, cae a Inter.
- **Sin doble raya bajo las cifras ni bloques negros sueltos en el tema
  claro** (hist. §69): el total se destaca por tamaño y peso.
- **Fuentes propias** en `frontend/fonts/` (sin Google Fonts, pensado para
  la PWA y una CSP sin dominios externos). `--font-mono` ya no es
  monoespaciada: las cifras se alinean con `tabular-nums`.
- **Íconos:** solo del sprite `frontend/img/iconos.svg` vía `icono()`
  (`core/iconos.js`) o `<use href="/img/iconos.svg#…">` en el HTML. Un ícono
  nuevo se baja de `lucide-static` y se agrega como `<symbol>`. Nada de
  emojis ni caracteres sueltos (✕, ▸, ←) como íconos.
- **Colores de estado (hist. §63, §72):**
  - verde para lo resuelto y rojo lleno (`status-vencido`) para lo urgente;
  - `status-pendiente` es el mismo rojo, pero con contorno y sin relleno;
  - sin color de plata (hist. §72): azul `status-info` (en curso o
    predeterminado: presupuesto enviado, lista y depósito predeterminados),
    violeta `status-ia` (lo que hizo el asistente, en Auditoría) y naranja
    `status-aviso` (conviene mirarlo, no es urgente: stock alto);
  - lo que no es bueno ni urgente va en gris, con `.status` sin clase: un borrador, un rol,
    "Editó", una factura suelta o un gasto de inversión;
  - una cifra `.ledger-value` verde o roja que vale cero pasa sola a tinta (observer de
    `core/ui.js`).
  - Los íconos de las tarjetas del Resumen llevan color por métrica
    (`.ledger-icono-azul`, `-naranja`, `-verde`, `-violeta`); el Resultado
    queda neutro.
- **Contraste:** todo texto pasa AA (4,5:1) sobre su superficie, incluido
  `--ink-faint` (hist. §72).
- **Fichas:** el título va solo en la topbar; el `h2` del primer panel queda
  en el HTML pero se oculta por CSS (hist. §72).
- **Menú:** grupos `.nav-seccion`; los que son solo de admin llevan
  `.nav-seccion-admin` y se ocultan enteros para el empleado.

**Alta guiada y Configuración (hist. §73)**
- **Los tipos de negocio viven en un solo lugar:** `PERFILES_RUBRO`,
  `RUBROS_PROXIMAMENTE` y `MODULOS_INFO` en `backend/perfiles.js` (nombre, descripción e
  ícono). El frontend los pide: `GET /api/auth/tipos-negocio` (pública) o
  `perfiles` de `GET /api/negocio`. Un tipo nuevo no se escribe en el HTML.
- **`PUT /api/negocio` es parcial:** escribe solo los campos que vienen.
  Configuración manda solo lo que cambió.
- **Los módulos de cada negocio quedan guardados** (hist. §88): el alta guarda
  los elegidos (o los del tipo), y ni el `PUT` ni un cambio de tipo los mueven.
  Volver al NULL = "los del tipo" reintroduce el problema de §88: cambiar el
  tipo apagaba secciones solo.
- **Condición fiscal del negocio:** lista fija de claves (`responsable_inscripto`,
  `monotributo`, `exento`; `CONDICIONES_IVA` en `server.js`, `core/fiscal.js`).
  Un texto viejo que no se reconoció queda como estaba y se imprime tal cual.
  El CUIT se valida con su dígito verificador y se guarda con guiones.
- **Router con subrutas** (`#/vista/subruta`): el handler de `alEntrarEnVista`
  recibe la subruta.
- **Configuración es una vista con páginas** (`dominios/configuracion.js`,
  `PAGINAS`). Sumar una página es su ítem del menú, su `<section>` y su
  entrada. El empleado ve solo Apariencia.
  - Los catálogos son páginas, pero su lógica sigue en `app.js` y `gastos.js`
    (leen estado privado): registran `pintar:<catálogo>`.
  - Las cuentas de tesorería siguen en Caja.
- **El alta guiada es `frontend/js/alta.js`:** `sesion.js` la baja con
  `import()`. `#/crear-cuenta` es su enlace (para la landing).
- **El tema** pasa por `core/tema.js` (botón de la sidebar y página Apariencia).

**Socios y cuotas (hist. §74 a §76)**
- **Dónde está cada cosa:** el menú Socios tiene Ingreso, Socios y Planes.
  Planes es solo admin y tiene dos pestañas: `#/planes-socio` y
  `#/planes-socio/descuentos`. Configuración no tiene nada de socios, por
  pedido del usuario (hist. §76).
- **Sin circuito propio:** el socio es un cliente, cada plan es un servicio del
  catálogo y cada cuota es una venta de ese servicio, cobrada con los cobros de
  siempre.
  - Del producto salen el nombre del plan y si se ofrece. El precio sale de cada
    duración (`planes_socio_opciones`).
  - El `precio_venta` del servicio es solo de referencia, el de la duración más
    corta. Productos no lo deja cambiar.
- **Duraciones:** de 1 a 36 meses, una por cantidad de meses. La que se saca
  del plan se pausa y no se borra.
- **Varios planes por socio** (`inscripciones_socio`): cada uno tiene su ciclo y
  sus cuotas. Un socio de baja es uno sin planes activos. El mismo plan no puede
  estar activo dos veces (índice parcial).
- **Descuentos** (`descuentos_socio`), siempre en porcentaje:
  - tres tipos: combo de ciertos planes, por cantidad de planes, o a mano en la
    ficha del socio;
  - si le tocan varios, se aplica **el mayor, nunca la suma** (decisión
    tomada sin el usuario, a revisar);
  - se calculan al generar la cuota, y la cuota guarda `precio_lista`,
    `descuento_pct` y `descuento_id`;
  - la pantalla pide `POST /api/socios/cotizacion`, el mismo cálculo, antes de
    confirmar.
- **Cuotas sin cron:** `ponerCuotasAlDia()` corre al mirar a un socio. El
  `UNIQUE(inscripcion_id, desde)` de `cuotas_socio` impide cobrar dos veces un
  período. Hay `GET` que escriben a propósito.
- **Vencimiento:** la cuota vence el día en que empieza su período, el mismo día
  del mes que el alta, contado desde `ciclo_desde` y no encadenado. Debe desde
  ese día: no hay días de gracia (a definir con el usuario).
- **Un alta hacia atrás** cobra el período que corre, no los anteriores
  (`cobrar_desde`).
- **Baja:** no genera más cuotas y no toca las que ya hay. Reactivar empieza un
  ciclo nuevo, sin cobrar los meses de baja.
- **Bonificar:** se anula la venta de la cuota, y el período queda cubierto.
- **Cobro:** salda todas las cuotas impagas juntas. Cobrar una parte se hace desde
  la venta.
- **Auditoría, sin reconstruir `auditoria`:**
  - los socios van como `entidad cliente` con `operacion_tipo socio`;
  - los planes, como `producto` con `plan_socio`;
  - los descuentos, como `organizacion` con `descuento_socio`;
  - la cuota generada lleva `actor sistema` y no tiene usuario.
- **Permisos y catálogo:**
  - crear y editar planes y descuentos es admin;
  - la recepción (alta, sumar plan, descuento a mano, cobro, ingreso, baja) es
    de los dos roles;
  - los planes no salen en el catálogo del punto de venta.

**Servicios y trabajos (hist. §78)**
- **El nombre del catálogo sale de lo cargado** (hist. §88), nunca de un `if`:
  solo productos, solo servicios, o "productos y servicios" con pestañas en
  Productos. Con el catálogo vacío, el del preset (`PERFILES_RUBRO.catalogo`).
  En el HTML va en `[data-termino]` y en el JS, `termino()` de
  `core/negocio.js`; para un tipo puntual, `terminoDeTipo()`.
- **Un trabajo no es un circuito propio:** al terminarlo crea la venta con sus
  renglones, que se cobra como siempre. Hasta ahí no mueve stock ni cuenta
  corriente.
- **Un presupuesto con trabajo sin cancelar no se convierte directo:** la venta
  sale al terminar el trabajo, y el presupuesto queda convertido en ella.
- **Trabajos es de los dos roles.** La auditoría va como entidad `cliente` con
  `operacion_tipo trabajo`, igual que los socios.
- **Los renglones del trabajo usan las filas de venta de `app.js`**
  (`items:*` del registro): un dominio no conoce el catálogo.
- **"Hoy" sale de `backend/fecha.js`** (hist. §82): `fechaDeHoy()` en JS y
  `HOY_SQL` dentro del SQL; todo INSERT pasa la fecha, nunca el `DEFAULT
  (date('now'))`, que es UTC. Una tabla nueva con fecha sigue esta regla.
- **La agenda es una pestaña de Trabajos** (hist. §80), no una vista aparte:
  `#/trabajos/lista|semana|mes`, y sin subruta, la última usada. El largo del
  bloque sale de `duracion_estimada` del backend.
- **Abonos y cuotas de socios comparten `periodosPendientes()`** (hist. §79):
  una sola cuenta de períodos. Un abono no es un socio (sin número, ingreso ni
  descuentos), por eso tiene su tabla. Alta y precio son admin; verlos y
  cobrarlos, de los dos roles. El modal de cobro avisa con el evento
  `cobro-registrado`.

**Varios negocios por cuenta (hist. §77)**
- **El rol y la baja son de cada negocio** (`usuario_organizaciones`).
  `usuarios` es solo la identidad: ya no tiene `rol` ni `activo`.
  - `usuarios.organizacion_id` es el negocio donde se creó la cuenta y no
    decide nada.
  - El negocio de cada request sale de `sesiones.organizacion_id`.
- **El login no pide negocio** (con el mail o el usuario viejo, hist. §102):
  entra al último que se usó.
- **Nombre y contraseña son de la persona.** Un admin solo los cambia si
  administra todos los negocios de esa persona (409 si no). Sacar esa regla
  deja tomar el negocio de otro.
- **Solo el admin agrega negocios.** El negocio nuevo nace con quien lo crea
  como admin, y la sesión pasa a él.
- **Pestaña vieja:**
  - toda llamada a `/api/` lleva `X-Nexo-Negocio` (lo suma `sesion.js`);
  - si no coincide con la sesión, el backend responde 409 y la pestaña
    recarga;
  - `/auth/*` y `/negocios*` quedan exentas.
- **Lo que se guarda en el navegador y tiene ids lleva el negocio en la
  clave:** `nexo.filtros.<org>.<contenedor>` y `nexo.pos.caja.<org>`. Una
  clave nueva de ese tipo sigue la misma regla.
- **Cambiar de negocio recarga la página** en la vista de inicio. Es el
  reseteo de la memoria de la app, como en el logout.

**Cuenta y mail (hist. §102)**
- **Se entra con el mail:**
  - el login acepta `email` o `usuario` y busca por los dos; si coinciden
    cuentas distintas, gana la del mail;
  - el alta lo recibe como `email_cuenta`, porque `email` es el del negocio
    (comprobantes), en el alta y en "Agregar negocio".
- **En una cuenta nueva, `usuarios.usuario` es su mail.** Al cambiar el mail,
  si el usuario era el mail viejo, pasa al nuevo: si no, el viejo seguiría
  entrando y nadie más podría usarlo.
- **Una cuenta sin mail no opera** (403 `falta_email` en `autenticar`, salvo
  `/auth/email`, `/auth/logout` y `/auth/cambiar-password`). `sesion.js` la
  manda a "Sumá tu mail" con `seguirCon()`: primero la contraseña forzada,
  después el mail.
- **Un mail se confirma con un código antes de usarlo** (hist. §108, pedido
  del usuario del 29 de octubre: "si pongo un mail que no es mío puedo crear
  una cuenta igual"):
  - el alta pide el código en su paso 2 y la cuenta nace confirmada.
    `POST /api/auth/registro` exige `comprobante_email`, que da
    `/registro/verificar` al acertar el código;
  - cambiar o sumar el mail (Mi cuenta, "Sumá tu mail") manda el código al
    mail nuevo (202), y el mail cambia recién con `/auth/email/confirmar`;
  - tabla `codigos_mail`: 6 cifras, 15 minutos, 5 intentos, vale el último.
    El comprobante dura 2 horas. Se manda **esperando** a Gmail (si falla,
    503), no con `mandarSinEsperar`;
  - `/registro/codigo` responde 204 exista o no la cuenta: si existe, a su
    dueño le llega "Ya tenés una cuenta" en vez del código;
  - sin mail configurado y fuera de producción, el código sale en la consola.
- **Sin verificar se trabaja igual**, con el aviso en el Resumen y en Mi
  cuenta. Desde §108 eso solo le pasa a una cuenta de antes. La verificación
  es un `GET /verificar-mail?token=` (lo manda "Mandarlo de nuevo"):
  - vale 48 h, y solo el último enlace;
  - deja de valer si la cuenta cambió de mail;
  - un enlace ya usado sigue diciendo "verificado".
- **Los tokens de mail se guardan como SHA-256** en `tokens_cuenta`, sin
  `organizacion_id` (es de la cuenta). La Fase 2 (recuperar) usa la misma
  tabla con `tipo = 'recuperar'`.
- **Los mails salen después de responder** (`mandarSinEsperar`): un fallo de
  Gmail no corta la operación y queda en el log. Los enlaces usan
  `urlPublica(req)`. Fuera del navegador (un script contra otro puerto),
  definir `NEXO_URL_PUBLICA`.
- **Topes:** 5 envíos por hora y por cuenta (cambio y reenvío juntos), con
  `registroExcedido('mail:<id>')`.
- **Tests:** el arnés corre con `NEXO_MAIL=stub` y lee los mails con
  `leerMails()`, `ultimoEnlace()` y `codigoDelMail()`. Cada cuenta del arnés
  es `<usuario>@nexo.test`. `registrarEmpresa(servidor, …)` recibe el
  servidor (lee el código), no la URL; un alta a mano usa
  `confirmarMailDeAlta()`.

**La baja (hist. §109)**
- **Qué es "del negocio" sale del esquema** (`backend/db/datos-negocio.js`):
  toda tabla con `organizacion_id`, y las hijas sin la columna por sus FK.
  La descarga y el borrado usan la misma cuenta, así una tabla nueva queda
  cubierta sola. `usuarios`, `tokens_cuenta`, `codigos_mail` y
  `organizaciones` son de la cuenta y no se tocan.
- **Negocio en baja (`organizaciones.baja_pedida`):** `autenticar` responde
  403 `negocio_en_baja` a todo salvo `/auth/*`, `/negocios*`,
  `/negocio/baja/cancelar` y `/negocio/exportar`. `sesion.js` muestra la
  pantalla que lo explica.
- **El borrado** corre al arrancar y cada 6 horas (`borrarNegociosVencidos`),
  a los `BAJA_DIAS` (30). Es una transacción con las FK apagadas y controla
  que no queden FK rotas. La fila de `organizaciones` queda vacía
  (`baja_hecha`), porque `usuarios.organizacion_id` la referencia. Queda una
  fila de auditoría sin negocio.
- **Baja de la cuenta:** no se borra la fila (la auditoría la referencia).
  Se le sacan el nombre, el mail y la contraseña, y se tapa su mail en toda
  la auditoría y su nombre y usuario en sus filas. No puede dejar un negocio
  sin admin (409 `unico_admin`).
- **`NEXO_REGISTRO=off`:** cierra el alta y el primer negocio de una cuenta
  sin negocio. La primera cuenta de una instalación nueva se crea igual.
  `GET /api/auth/estado` trae `registro_abierto`.
- **Arnés:** `baja.test.js` reinicia el servidor sobre la misma base y en el
  mismo puerto. `levantarServidor` devuelve la URL de su puerto, no la del
  `PORT` que se le pasa.

**Panel de la plataforma (hist. §111)**
- **Es lo único de Nexo que lee datos de todos los negocios.** Va con su
  guardia, `soloPlataforma` (mail en `NEXO_ADMIN_PLATAFORMA` y confirmado), y
  nunca con `soloAdmin`, que es "admin de este negocio". En `permisos.js` es la
  clase `'plataforma'`.
- **De cada negocio, conteos y nunca sus datos** (ni clientes ni importes). Una
  columna nueva del panel sigue esa regla, y el test fija las claves exactas de
  cada fila.
- **Para otra cuenta, 404 igual que una ruta inexistente**, no 403: el panel no
  se anuncia.
- `/plataforma/*` pasa sin negocio, con el negocio en baja y con otra pestaña,
  como `/auth/*` (`autenticar` y el control de `X-Nexo-Negocio`).
- **Solo lectura.** Cambiar un plan sigue siendo `npm run plan` en el
  servidor.
- **"Último uso"** es el mayor entre los dos `ultimo_acceso` y el último pedido
  de cada sesión (`expira` menos `SESION_HORAS`).

**Invitaciones y cuentas sin negocio (hist. §104)**
- **A alguien se lo suma invitándolo** (`/api/invitaciones`, admin). No
  volver a crear cuentas con una contraseña elegida por el admin.
- **El enlace es `/app#/unirme/<token>`**, en el hash, y el token viaja por
  POST: no queda en ningún log. Cada envío cambia el token.
- **El enlace confirma el mail:** crear la cuenta o aceptar desde él lo deja
  confirmado. La lista de solicitudes adentro de Nexo es solo del mail
  confirmado, para que nadie acepte una invitación ajena con una cuenta hecha
  con un mail que no es suyo.
- **Al admin se le responde igual** exista o no una cuenta con ese mail.
- **Las pendientes cuentan para el tope de usuarios del plan.**
- **Una sesión puede no tener negocio** (`sesiones.organizacion_id` NULL):
  la cuenta que dieron de baja en todos sus negocios entra igual, pero
  `autenticar` solo la deja llegar a `/auth/*` y `/negocios*` (403
  `sin_negocio`). Una ruta nueva de negocio no necesita nada: nace cerrada.
- **`usuarios.organizacion_id` sigue NOT NULL:** toda cuenta nace en un
  negocio (registro o invitación). El rebuild a nulable queda para la cuenta
  que nazca sola (Google sin invitación).
- **`POST /api/negocios` no lleva `soloAdmin` en la firma:** con negocio
  controla el rol adentro; sin negocio crea el primero.
- **Arnés:** `crearEmpleado(servidor, …)` recibe el servidor (necesita sus
  mails), no la URL.

**Planes de Nexo (hist. §98)**
- **Precios, textos y topes viven solo en `backend/planes.js`.** La landing
  y el alta los piden a `GET /api/auth/planes`.
- **Todo plan tiene todas las funciones:** los separan los topes (usuarios,
  negocios, productos activos y ventas del mes), nunca un módulo apagado.
- **Una ruta nueva que crea algo con tope llama a `exigirLugarEnPlan()`.**
  - Se llama en la ruta, no en `crearVenta()`: las cuotas de socios y abonos
    se generan solas y nunca se frenan ni cuentan.
  - Una alta que crea productos dentro de una transacción la llama con
    `nuevos = 0` después del INSERT, así el throw la deshace.
- **Un negocio no se cambia el plan a sí mismo.** Lo cambia la plataforma:
  Plataforma → Negocios → "Cambiar" (`PUT /api/plataforma/negocios/:id/plan`,
  solo `NEXO_ADMIN_PLATAFORMA`, desde el 3 de noviembre, para dar Pro a
  quien prueba mientras el plan no se cobra) o `npm run plan` en el
  servidor. `PUT /api/negocio` no lo toca: dejaría a cualquiera pasarse a
  Pro gratis.
- **Plan vencido = Gratis, sin borrar nada:** el negocio sigue viendo y
  editando lo que tiene, solo no suma más allá del tope.
- **Los negocios que existían antes de §98 quedaron en Pro sin vencimiento**
  (las bases reales y la demo).
- **Contacto público (hist. §99):** `POST /api/publico/consulta` escribe solo
  en el negocio `NEXO_NEGOCIO_VENTAS` (Nexo se vende con Nexo). Sin esa
  variable responde 503.
- **`alEntrarEnVista()` admite varios handlers por vista** (hist. §99): corren
  en orden de registro.
- **El arnés de tests registra en Pro** (`registrarEmpresa`, `plan`). Un test
  de topes pide `plan: 'gratis'`.

**Landing y app (hist. §100)**
- **La app vive en `/app`; `/` es la landing**, y con sesión redirige a
  `/app`.
  - Un enlace o un `location` nuevo de la app no apunta a `/`.
  - Las rutas de `index.html` y de lo que se inyecta van absolutas (`/js/…`):
    `/app/` rompe las relativas.
- **El service worker solo guarda la navegación a `/app`.** Las páginas
  públicas no se guardan, para que no pisen la app sin conexión.
  - `landing.js` no va en `PRECACHE`.
  - En el manifest, `id` sigue siendo `/`.
- **La landing no repite datos del backend:**
  - precios, topes y tipos de negocio salen de `/api/auth/planes` y
    `/api/auth/tipos-negocio`;
  - el JSON-LD lo arma `server.js` desde `PLANES`.
- **Lo que tiene que ser absoluto (canónico, Open Graph, sitemap) usa
  `NEXO_URL_PUBLICA`.** Si no está, la URL sale del pedido.
- **La landing no promete lo que no existe:** ARCA y las integraciones
  aparecen como "muy pronto". Si una función cambia, se revisa el texto de la
  landing y de privacidad.

**PWA (hist. §94)**
- **Primero la red, y lo guardado solo si falla** (`frontend/sw.js`). No pasar
  a "primero lo guardado": sin build step serviría código viejo.
- **Un `.js` nuevo va a `PRECACHE` de `sw.js`**, y `npm test` falla si
  falta. Si cambia la forma de lo guardado, se sube `VERSION`: el service
  worker borra al activarse los cachés de otra versión.
- **Lo guardado de la API es de quien lo cargó:** la clave lleva el negocio y
  `sesion.js` lo borra en el login, el logout y el 401. Nunca guardar
  `/api/auth/*` (salvo `estado`) ni algo que no sea 200.
- **Sin conexión no se escribe** (CLAUDE.md §31): no hay cola de escrituras.
- **CSP sin scripts inline:** todo script va en un archivo. `arranque.js` es
  el que corre en el `<head>` antes de pintar.
- **`eslint.config.mjs` está protegido** por el hook `config-protection` del
  plugin ecc. `sw.js` declara sus globales con `/* global */`.

**Celular (hist. §95)**
- **Lo fijo abajo se apoya en `--abajo`** (la barra con el safe area; 0 en la
  compu). Un elemento flotante nuevo usa `bottom: calc(var(--abajo) + …)`.
- **Los destinos de la barra salen del menú lateral** (`PRIORIDAD` en
  `core/barra-inferior.js`), nunca del tipo de negocio. Una sección nueva de
  uso diario se suma a esa lista.
- **Un modal nuevo termina su formulario en `.btn-full`:** en el celular ese
  es el botón que queda fijo abajo.
- **El botón de alta de una vista nueva lleva `btn-nuevo`** (hist. §97): en
  el celular flota arriba de la barra. Uno solo por vista visible.
- **El "atrás" de los modales** vive en el observer de `core/ui.js`. Abrir un
  modal sin cambiar `hidden` (por ejemplo, con una clase) lo deja afuera.
- **Una lista nueva va en dos líneas en el celular** (hist. §96):
  - `lista-movil` en la tabla;
  - `m-titulo`, `m-valor` y `m-estado` en sus celdas;
  - la segunda línea con `celdaMovil()`, que escapa cada parte.
  - Una parte con prefijo va como `["vence", fecha]`, no con un template
    anidado: el chequeo de escape lo vería como HTML crudo.

**Frontend (hist. §58)**
- **Todo dato que se imprime en HTML pasa por `esc()`** (`core/formato.js`),
  incluidos atributos `value="…"`. Lo exige `npm test`
  (`backend/test/plantillas-html.js`): un `${x.campo}` crudo en un template
  con etiquetas falla. El test no ve un string armado en otra variable ni lo
  que devuelve una función propia: esos se escapan donde se arman. Las fichas
  arman sus datos con `camposFicha()` (`core/formato.js`): escapa cada valor
  salvo el envuelto en `html()`; un estado va con `badge(clase, texto)`, que
  escapa su texto (hist. §63).
- **Toda llamada al backend pasa por `api()`** (`core/api.js`): avisa el
  error (HTTP o de red) con un toast y lanza, así lo que sigue al `await` no
  corre. Para limpiar algo ante un error: `.catch((e) => { …; throw e; })`.
  Las recargas después de una escritura van con `refrescar([...])`: no
  cortan por una falla ya avisada (si no, el modal queda abierto y el
  usuario reenvía: duplicado).
  Excepciones a propósito: `perfil.js` (error en el modal) y la creación de
  variantes en lote (cuenta fallas). El 401 lo sigue resolviendo `sesion.js`.

**Herramientas (hist. §59)**
- **ESLint se corre solo con `npm run lint` desde la raíz** (`scripts/lint.mjs`),
  nunca a mano: antes de dar el resultado controla que las reglas se apliquen en
  cada zona y que haya leído cada `.js`/`.mjs`. ESLint ignora en silencio lo que
  no alcanza su config (hist. §54). Una carpeta nueva con código se suma a
  `CARPETAS` del script y a `eslint.config.mjs`.
- El `package.json` de la raíz es solo de herramientas (devDependencies) y **no**
  es `"type": "module"`: por eso la config es `.mjs`. Las dependencias de la app
  siguen en `backend/package.json`.
- Sin Prettier y con `formatOnSave` apagado: el estilo lo marca `.editorconfig`
  y nadie reformatea un archivo entero.
- **Scripts de verificación (hist. §60)**, desde la raíz: `npm run seed`,
  `npm run verificar-migracion` y `npm run regresion` (ver "Cómo verificar").
  Ninguno escribe en `backend/db/nexo.db`, y los que la leen fallan si su md5
  cambió. Reusan el arnés `levantarServidor` de `backend/test/`.
  - Una ruta `GET` nueva con `:id` se suma a `LISTADO_DE` de
    `regresion-head.mjs`: si no está, el script corta.
  - Un campo volátil nuevo (una hora) se suma a `normalizar`.

**Punto de venta (hist. §67)**
- **El turno de caja es por cuenta de tesorería de tipo efectivo**, no por
  usuario, con un solo turno abierto por caja (índice parcial).
- **Arqueo:** al abrir y al cerrar, si lo contado no coincide con el saldo, se
  registra un movimiento `manual` por la diferencia. El saldo de la caja
  queda siempre en lo último que se contó.
- **Los movimientos de un turno se delimitan por id** de
  `movimientos_tesoreria` (`desde_movimiento_id` y `hasta_movimiento_id`),
  porque esa tabla guarda la fecha sin hora.
- **Auditoría del turno:** `entidad cuenta_tesoreria`, acción
  `cambiar_estado`, `operacion_tipo turno_caja`. Así no hizo falta
  reconstruir `auditoria` para sumar una entidad nueva a su `CHECK`.
- **Venta de mostrador sin cliente:** va al cliente "Consumidor final" de la
  empresa, y a ese cliente no se le fía, tampoco si llega su id (hist. §68).
- **Pantalla (hist. §68):**
  - el precio sale del catálogo y no se edita;
  - el vuelto sale solo del efectivo, y el efectivo es siempre la caja del
    turno;
  - la caja elegida se recuerda por dispositivo y la venta en curso por
    pestaña;
  - el POS no crea clientes.

**Comprobantes, catálogo y auditoría**
- **Comprobantes:** los datos del membrete viven en `organizaciones` (no hay
  tabla `datos_negocio`). Venta y compra no se imprimen como comprobante
  (hist. §19, §20).
- **Las categorías de producto tienen un solo nivel**, sin subcategoría
  (hist. §13).
- **Auditoría:** `actor` (operador/asistente/sistema) y `usuario_id` son
  columnas distintas a propósito (hist. §14, §16).
- **El asistente IA no opera productos con variantes activas** (hist. §34).

**Tipos de negocio, unidades y servicios (hist. §70)**
- **El tipo de negocio es un preset de datos** (`PERFILES_RUBRO` en
  `backend/perfiles.js`, hist. §88): unidad y tipo con que nace un producto, y
  qué módulos trae al crear el negocio.
  Nunca `if (rubro === …)` con lógica (CLAUDE.md §29).
- **Módulos:** `pos`, `presupuestos`, `compras` y `stock`. Ocultarlos es de la
  interfaz (`<html data-modulos>` y el router); los permisos siguen en
  `permisos.js`. Se eligen al crear el negocio y se suman o sacan en
  Configuración → Funciones.
- **Cambiar el tipo de negocio no borra nada** (respondido al usuario el 20 de
  octubre):
  - desde hist. §88 solo cambia con qué unidad y tipo nace un producto nuevo
    (el menú ya no). Es una página aparte que lo dice antes de confirmar. Los
    productos que ya existen quedan como estaban;
  - los socios siguen siendo clientes y sus planes siguen en Productos;
  - con Socios apagado no se generan cuotas. Si se vuelve a prender, se generan
    de una las de los meses que pasaron a los planes que siguen activos.
- **Unidad del producto:** `unidad`, `kg`, `g`, `l`, `ml` o `m`, validada en
  `server.js` y sin `CHECK`. Las cantidades ya eran REAL: el backend nunca
  exigió enteros.
- **Un servicio no maneja stock:**
  - `registrarMovimientoStock` no escribe nada para un servicio, y es el único
    punto que escribe stock;
  - las validaciones de stock lo saltean;
  - compras, ajustes y transferencias lo rechazan;
  - no aparece en Stock ni en los reportes de stock;
  - con stock, no se puede pasar a servicio.

## Cómo verificar un cambio (procedimiento de hist. §40–§49, scripts de §60)

1. **Nunca contra `backend/db/nexo.db`:**
   - apuntar el código a otra base con `NEXO_DB_PATH` (y `NEXO_BACKUP_DIR` al
     scratchpad, o `NEXO_BACKUP=off`); ya no hace falta copiar `backend/`;
   - anotar el md5 de la base real antes y después (los scripts lo hacen
     solos).
   - Para una base con datos: `npm run seed -- --db <ruta>` (empresa "Baseline
     SA", `admin1@nexo.test`/`clave-segura-1` y
     `emp1@nexo.test`/`clave-segura-2`).
2. **Regresión:** `npm run regresion`. Compara el árbol de trabajo contra
   `HEAD` (`-- --ref <ref>` para otra) con la misma base sembrada, en todos los
   `GET` y con los dos roles. `-- --db <ruta>` parte de una copia de esa base.
   La base la siembran el servidor **y el `seed.mjs` de la ref**: un paso nuevo
   del seed recién se compara en el commit siguiente (hist. §67).
   Cada diferencia que muestre hay que justificarla.
3. **Aislamiento:**
   - segunda empresa en la misma base:
     `npm run seed -- --db <ruta> --prefijo b --empresa "Otra SRL"` (o
     `--url` contra un servidor de prueba que ya corre);
   - probar cada acceso cruzado por su efecto en la base, no solo por el
     código HTTP.
4. **Cambios de esquema:** `npm run verificar-migracion`. Corre `db/index.js`
   tres veces sobre una base nueva, una copia de la real y cada backup de
   `backend/db/`, y controla:
   - que migren en un solo arranque y que el segundo no cambie nada;
   - integridad y FKs;
   - que el esquema final sea igual en todas y que no se pierdan filas;
   - que `schema.sql` tenga la forma final de cada tabla (hist. §64).

   En el CI corre solo el caso de base nueva, porque las bases no se versionan.
5. **`npm test` y `npm run lint` desde la raíz** (los mismos que corre el CI;
   `npm install` en la raíz trae ESLint). `npm test` es el inventario estático de rutas contra
   `permisos.js`): toda ruta nueva tiene que estar clasificada ahí, declarada
   en la columna 0 y con `soloAdmin` en la misma línea. También corre
   `backend/test/api.test.js`: levanta `server.js` como proceso hijo con base
   temporal (`servidor-de-prueba.js`: `levantarServidor`, `registrarEmpresa`,
   `crearEmpleado`, `crearCliente` con cookie) y fija los arreglos de la
   auditoría de hist. §57. Un endpoint nuevo con validación de entrada merece
   su caso ahí; el del límite por IP va último porque bloquea la IP local.
6. **En Windows**, matar los servidores de prueba por PID (`taskkill`):
   `pkill` no los encuentra.
7. **Frontend en navegador** (hist. §58): `playwright-core` instalado en el
   scratchpad contra el Chrome de `C:/Program Files/Google/Chrome`, servidor
   con base nueva (`NEXO_DB_PATH` al scratchpad, `NEXO_BACKUP=off`,
   `NEXO_INTERPRETE=stub`), empresa creada con `POST /api/auth/registro`.
   Para XSS: el contexto va con `bypassCSP: true` (con la CSP de hist. §94 el
   `onerror` no correría aunque faltara el escape, y la prueba no probaría
   nada). Sembrar `<img src=x onerror="window.__xss=…">'"` en cada campo de
   texto, recorrer vistas, fichas, modales, filtros y asistente, y mirar
   `window.__xss`. Correr lo mismo contra el commit anterior (`git worktree`
   + junction de `node_modules`) como control: si ahí tampoco salta, la
   prueba no está probando nada.

## Qué sigue

**Plan hasta el 20 de noviembre (1 de noviembre de 2026).** Es el orden
vigente, y ya cuenta como planificación con el equipo (CLAUDE.md §27, §38).

**Decidido por el usuario el 2 de noviembre: producción básica, sí o sí antes
de la presentación.** Saca "producción con recetas/insumos" de CLAUDE.md §39.
**Hechas el 3 de noviembre: recetas y producir (hist. §125) y lo que se usa al
vender (hist. §126).** Queda: "¿cuántas puedo hacer?", lo usado al vender en
los reportes por producto, y los decants. El caso: un amigo que hace mafaldas compra
materiales y los combina, y la gente que vende comida. "Primero las básicas"
para un negocio muy chico; lo complejo, después. Pide:
- **Receta:** qué materiales lleva cada producto y cuánto. Los materiales son
  productos comunes, que se compran con las compras de siempre.
- **Producir:** descuenta los materiales y suma el producto, con un costo que
  sale de lo que costaron los materiales.
- **Flexible:** la misma cantidad de material no siempre da lo mismo. La
  receta es lo que *suele* llevar; al producir se anota lo que salió de
  verdad (y lo que se usó, si cambió), y el costo sale de lo real.
- **Packaging:** componentes que se descuentan solos al vender, aunque el
  producto sea comprado (la caja, la bolsa), como en cualquier e-commerce.
  **Varía en cada venta** (a veces ninguna bolsa, a veces dos): Nexo propone
  lo de siempre y se cambia en el momento; se descuenta lo que quedó.
- **Fraccionar (ejemplo del usuario, que vende decants de perfume y tuvo que
  hacerse un sistema propio porque ninguno lo resolvía):** el perfume en ml y
  el decant de 5 ml con "5 ml de ese perfume + 1 frasquito", que se descuenta
  al vender. Es el mismo mecanismo que el packaging. A decidir al arrancar:
  comprar el perfume ya en ml, o "abrir" el frasco como una producción (1
  frasco → 100 ml).
- **Estimación dada al usuario:** dos sesiones (1: recetas y producir; 2: lo
  que se arma al vender, packaging y fraccionado, y reportes), y una tercera
  si da (packaging editable en el punto de venta y "¿cuántas puedo hacer?").
- **Todo integrado:** stock, costo promedio y margen, reportes, y avisos de
  materiales bajos.

Diseño: hist. §125.

**Lo que se descuenta al vender, hecho el 3 de noviembre (hist. §126).**
**Decidido por mí, para revisar:** una venta que no dice qué se usó (Tienda
Nube, Mercado Libre, presupuesto o trabajo que pasa a venta) lleva lo de
siempre hasta donde alcance el stock, sin frenarse; lo que elige quien vende se
respeta y sin stock no se vende. **Falta que el usuario lo vea.** **Los decants
no son prioridad** (dicho por el usuario): ya se pueden armar con esto si el
perfume se maneja en ml (decant = 5 ml de perfume + 1 frasquito, al vender), y
abrir un frasco ya se puede como producción (receta "Perfume (ml)" = 1 frasco,
rinde 100). **Sigue:** "¿cuántas puedo hacer?" (la tercera sesión de la
estimación), o volver al orden de abajo.

**Ideas de Praxia (3 de noviembre, `docs/investigacion-praxia.md`).** Praxia es
el sistema de un compañero con carnicería. Lo que a Nexo le falta, verificado
en el código y ordenado por prioridad: etiquetas de balanza, ofertas con
vigencia y por cantidad, recargo por medio de pago (depende del 8d), y cobrar a
cuenta, gastos de caja, ventas del día y accesos rápidos desde el punto de
venta; después, puntos y premios, mensajes de WhatsApp armados, "Para revisar"
en el tablero, ventas por hora, gastos fijos que se repiten y permisos por
sección. **El 3 de noviembre el usuario pidió "seguir con las mejoras":**
- ~~código de barras en producto y variante~~ **hecho** (hist. §127);
- ~~etiquetas de balanza~~ **hechas el 4 de noviembre** (hist. §132,
  publicadas en el PR #49);
- ~~ofertas con vigencia~~ **hechas el 4 de noviembre** (hist. §133), sin
  publicar;
- **sigue: cobrar a cuenta y gastos desde el punto de venta** (punto 4 de la
  investigación; el recargo por medio de pago, punto 3, espera al 8d).
- En el medio, el usuario pidió el tipo "Tienda online": **hecho** (hist.
  §128, publicado en el PR #45), y la comisión y el envío (hist. §129, sin
  publicar).

**Mercado Pago (decidido por el usuario el 3 de noviembre: "si no se nos
complica, antes de la presentación, puede sumar bastante").** Va primero en lo
esencial que queda de la venta online, y reemplaza "anotar a mano la comisión
de una venta por Instagram o WhatsApp". Unas tres sesiones (1 a 3, después 4
a 6):
1. ~~**Conectar la cuenta**~~ **hecho el 3 de noviembre (hist. §130)**, contra
   un Mercado Pago falso. **Trámite del usuario:** crear la aplicación en el
   portal de desarrolladores de Mercado Pago (gratis) y mandar sus claves al
   servidor como las de Mercado Libre (ver "Trámites del usuario").
2. **Las comisiones reales de las ventas de Mercado Libre:** la venta dice qué
   pago tuvo; del pago salen la comisión y el costo de las cuotas sin interés,
   y reemplazan al `sale_fee` de hist. §129 (mismos gastos de la venta,
   categorías "Comisiones de venta" y una nueva para las cuotas). Confirmar
   antes en la documentación actual los nombres de los campos del desglose
   (comisión, financiación, neto, fecha en que se libera la plata): se
   escribieron de memoria.
3. ~~**Cobrar con link o QR desde la venta**~~ **hecho el 3 de noviembre
   (hist. §130)**: link de Checkout Pro desde "Registrar cobro", con QR, y el
   cobro, la comisión y las cuotas que entran solos. **Sigue el paso 2**, que
   usa la misma conexión: en la venta de Mercado Libre, `payments[].id` →
   `apiDeMercadoPago(...).pago(id)` → `desgloseDelPago` reemplaza al
   `sale_fee` de §129. Ojo: hace falta que el negocio tenga conectados los
   dos (es la misma cuenta, pero son dos permisos).
4. **Pagos sin asignar:** los que no salieron de Nexo (QR genérico, transferencia)
   se listan con una sugerencia por monto y fecha, y el negocio confirma de qué
   venta son. Nunca se asignan solos (CLAUDE.md §32).
5. **QR en el punto de venta** (sumado por el usuario el 3 de noviembre): un
   medio de cobro "QR de Mercado Pago" en el mostrador. Nexo arma el QR con el
   monto exacto y la venta como referencia (el QR dinámico de Mercado Pago,
   que pide dar de alta una sucursal y una caja en Mercado Pago, una vez, desde
   Nexo); la pantalla espera el pago y cierra la venta sola, con la comisión
   como gasto. Si el cliente no paga o Mercado Pago no contesta, se cobra con
   otro medio como siempre. Va con el turno de caja de hist. §67.
6. **La cuenta Mercado Pago de Caja, conciliada** (sumado por el usuario el 3
   de noviembre): la cuenta de tesorería de tipo Mercado Pago queda vinculada
   a la cuenta real.
   - Nexo compara su saldo con el de Mercado Pago y muestra la diferencia.
   - Avisa lo raro: plata que entró o salió de Mercado Pago sin venta, compra,
     gasto o cobro de Nexo que la explique, cobros de Nexo en la cuenta Mercado
     Pago que no aparecen allá, y pagos devueltos o en disputa.
   - Los avisos van a "Para revisar" (la idea de Praxia, punto 7 de
     `docs/investigacion-praxia.md`), con un botón para asignarlo a una venta,
     registrarlo como gasto o marcarlo como visto. Nunca se registra nada solo.
   - Confirmar en la documentación qué movimientos de salida da la API (los
     cobros entrantes salen de la búsqueda de pagos; los egresos quizás pidan
     el reporte de liquidaciones).
- **Retenciones (IIBB, ganancias, IVA):** CLAUDE.md las deja "a confirmar, no
  inventar". Se muestran aparte en el pago, sin cargarlas como gasto, hasta
  definirlas con un contador.
- Si se complica (aprobación de la aplicación, campos distintos de lo
  esperado), queda para después de la presentación y no frena lo demás.
- **Idea del usuario (4 de noviembre, "dejalo como idea"): "Cobros y
  cuotas".** En e-commerce cuesta saber cuánto se come vender en cuotas: la
  comisión de Mercado Pago, el costo de las cuotas sin interés y el IVA sobre
  esas comisiones. Una sección (por ejemplo "Cobros y cuotas") que junte todo
  lo que cobró Mercado Pago, y en cada producto una calculadora: cuánto hay
  que cobrarlo en cuotas para ganar lo que se quiere (como la que tiene
  Mercado Pago adentro). Por eso muchos suben el precio de lista y hacen
  descuento por transferencia: con las ofertas por medio de pago (el recargo
  del punto 3 de Praxia, o una oferta "por transferencia") se armaría en
  Nexo. Base que ya existe: la comisión y las cuotas de cada pago como gastos
  de la venta (hist. §130) y "adónde fue la plata" (hist. §131).

**Resumen mejor: hecho el 5 de noviembre (hist. §136, publicado; §137, sin publicar).** Ideas
que quedan para la etapa H (CLAUDE.md §20, §38): piezas de socios (activos,
cuotas del mes) y de producción, ventas por medio de cobro con el recargo de
Praxia, y deltas también en "Qué se vende".

**Del amigo que vende medialunas (5 de noviembre, cuenta nueva probándose):**
fía mucho desde el punto de venta. **Hecho y publicado el 5 de noviembre (PR #57):**
el cobro del punto de venta tiene "Dejar en cuenta corriente", que registra la
venta sin cobros y deja el total en la cuenta del cliente
(`registrarVenta` en `frontend/js/dominios/pos.js`). Sin cliente (o con
"Consumidor final") avisa que hay que elegirlo; el backend ya lo rechazaba.
Antes había que borrar el importe y confirmar (sigue sirviendo para fiar una
parte).

**También el 5 de noviembre, publicado (PR #57): los mensajes de WhatsApp con
formato** (pedido del usuario): emoji por tipo (🛒 venta, 📦 compra, 💸 gasto,
↩️ devolución), negrita de WhatsApp en el título y el total, ✅ al registrar,
❌ en los errores, ⚠️ cuando falta un dato y botones "✅ Confirmar" y
"❌ Cancelar" (`resumenParaWhatsApp`, `AYUDA_WHATSAPP` y `atenderWhatsApp` en
`backend/server.js`; tests adaptados). Falta verlo en el celular.

**El costo de los servicios (pedido del usuario el 5 de noviembre, sin
arrancar).** En Clima Sur todo servicio vendido da 100 % de margen: el costo
de un producto (`precio_costo`) sale solo de compras o de producción, y un
servicio no se compra, así que queda en 0. Hoy la única vía es "lo que se usa
al vender" (`componentes_venta`, que sirve para un servicio y se aplica al
terminar un trabajo), pero vive en Producción y el material necesita Compras y
Stock, que el tipo Servicios no trae. Lo que decidió el usuario:
- **Los materiales del servicio son un concepto aparte** de lo que se usa al
  vender: son lo que hace al servicio (el gas de una carga, los caños de una
  instalación), no un extra. Se cargan en la ficha del servicio como "lo que
  suele llevar"; cada trabajo los copia y se cambian ahí (se usó 1,5 kg y no
  1). Al terminar el trabajo pasan a la venta con el costo congelado, salen
  del stock y entran al margen.
- **Mano de obra, a elección del usuario en cada servicio:** costo fijo
  ($15.000 por instalación) o costo por hora (por la duración estimada, hist.
  §78; en el trabajo se corrigen las horas reales). Se congela en la venta y
  va en "adónde fue la plata" (hist. §131) como renglón propio con su %,
  separado de los materiales.
- **"Lo que se usa al vender" cambia de nombre** a "Packaging" o "Extras" (el
  nombre, a elegir al arrancar), para que no se confunda con los materiales.
- **A diseñar al arrancar:** las tablas (materiales del servicio y del
  trabajo, y dónde se congela la mano de obra; explicar la migración antes,
  CLAUDE.md §34), qué pasa con Compras y Stock apagados (prenderlos o
  avisar), la venta directa de un servicio sin trabajo (punto de venta, alta
  de venta), y cargarle materiales y mano de obra a Clima Sur en
  `scripts/demo.mjs`.

**Entrar con Google (pedido del usuario el 5 de noviembre, sin arrancar).**
Gratis y sin dependencias (OAuth con `fetch` y el token verificado con
`node:crypto`), pero no es chico: el flujo de ida y vuelta con `state`, la
cuenta que ya existe con ese mail (Google lo da verificado, así que se vincula
sola), la cuenta nueva que sigue al alta guiada sin el paso de la contraseña,
el botón en el login y la CSP. **Trámite del usuario antes:** crear el
cliente OAuth en Google Cloud Console (gratis) con la dirección de vuelta del
servidor, y pasar el id y la clave al `.env` del servidor.

**Lo que decidió el usuario el 1 de noviembre:**
- **Lo legal espera** hasta que se busque vender: términos, privacidad y datos
  del titular. Solo se hacen detalles cortos.
- **Sin gastos fijos nuevos** hasta vender. Se busca la opción más económica y
  segura.
- **Las facturas de prueba alcanzan para la presentación.** Para después:
  facturar en masa, facturar ventas que ya existen y mandar el comprobante por
  mail.
- **Mercado Libre y Tienda Nube tienen que estar en la presentación.** Reemplaza
  a "van al final" del plan de dos semanas.
- **La semana de la presentación es solo para la presentación.**
- **Los videos son importantes,** para publicidad y para la presentación. El
  usuario va a instalar una skill para hacerlos.
- **El manual de usuario se actualiza una sola vez, al final.** Desde el 2 de
  noviembre vive en la app (`frontend/js/core/manual.js`, hist. §118): esa
  revisión final es sobre ese archivo.
- **Conocidos del usuario empiezan a usar Nexo** para encontrar errores e ideas.
  Él probó mucho sin que quede anotado: los "Falta que el usuario lo vea" de
  este archivo pueden estar viejos.
- **Classroom:** faltan la consigna de testing y el documento final (importante).
  Las consignas se dejan en `consignas/`, en la raíz (ignorada por git).

**Orden:**
- **Del 2 al 8:**
  1. ~~Respaldo cifrado fuera del servidor, restauración probada y aviso si
     el sitio se cae.~~ **Hecho el 2 de noviembre.**
     - **Hecho (2 de noviembre):** `backend/db/respaldo-nube.js` (gzip +
       AES-256-GCM, firma SigV4 con `node:crypto` y `fetch`, probada contra
       el ejemplo de AWS), subida en `scripts/backup-db.mjs` (idempotente,
       con mail al titular si falla) y `scripts/restaurar-nube.mjs`
       (`npm run restaurar-nube`, controla `integrity_check`). Probado de
       punta a punta contra un S3 falso: 550 KB → 42 KB.
     - **Funcionando en el servidor desde el 2 de noviembre:** las cinco
       variables en `/etc/nexo/nexo.env` (queda una copia de antes en
       `nexo.env.antes-b2`). Primera subida a mano (27 KB cifrados) y
       restauración desde B2 a `/tmp`: íntegra y con los mismos conteos que
       la base real.
     - La regla de ciclo de vida del bucket está puesta (ocultar a los 90
       días, borrar 1 después). El usuario guardó `NEXO_RESPALDO_CLAVE` y la clave
       de Backblaze en su gestor de contraseñas.
     - **Para pegar claves en el servidor:** pegar en la terminal no le
       anduvo (el portapapeles se pisa con el comando); lo que funcionó fue
       un `.txt` en la compu mandado por `Get-Content … | ssh …`.
     - **Aviso si el sitio se cae (2 de noviembre):**
       `.github/workflows/vigia.yml`, cada 10 minutos desde GitHub (afuera
       del servidor) contra `/api/auth/estado`, con tres intentos. Si falla,
       GitHub manda un mail por cada run en rojo. Sin cuenta ni servicio
       nuevo. GitHub lo apaga si el repo pasa 60 días sin actividad.
  2. ~~"Avisar un problema" adentro de la app~~ **Hecho el 2 de noviembre.**
     - Página Configuración → Ayuda → "Avisar un problema", para los dos
       roles, y un botón (círculo con "!") en el pie del menú
       (`frontend/js/dominios/problema.js`).
     - `POST /api/problema` ('ambos'): cae en el CRM de `NEXO_NEGOCIO_VENTAS`.
       Una consulta abierta por persona (por su mail, interés "Avisos de
       problemas en Nexo"), y una tarea para hoy por cada aviso, con el texto,
       la pantalla, el negocio, el navegador y los últimos 3 errores (de
       JavaScript o toasts de error). Tope: 10 avisos por hora por persona.
       Sin la variable, 503.
     - La página muestra antes todo lo que se manda. Al mandar, vuelve a la
       pantalla donde estaba.
     - Tests en `backend/test/problema.test.js`; probado en Chrome en
       celular (empleado) y en compu (admin).
  3. IA más rápida y sin datos en el plan gratis de Google (ver abajo), con voz.
     **Hecho el 2 de noviembre** (hist. §117):
     - Groq por `fetch` como principal (`gpt-oss-20b`): 30 de 30 frases, en
       menos de un segundo. Gemini de respaldo, con razonamiento bajo.
     - Dictado con Whisper (botón de micrófono en el asistente), probado con
       audio real.
     - `npm run probar-ia` con las 30 frases. La clave está en el `.env` de
       la compu.
     - **Límite del plan gratis:** unas 5 frases por minuto para toda la
       instalación (el servidor espera y reintenta si es poco).
     - **Publicado el 2 de noviembre** (PR #39) y con `GROQ_API_KEY` en
       `/etc/nexo/nexo.env`: comprobado que el proceso la tiene cargada.
     - El usuario probó el dictado (dicho el 4 de noviembre).
  3b. **Manual en la app y asistente que responde con él: hecho el 2 de
     noviembre** (hist. §118, pedido del usuario). `#/ayuda` (Configuración ›
     Ayuda › Manual de uso, 40 secciones en `core/manual.js`), `#/asistente`
     con su página, y las preguntas de uso se contestan con el manual en el
     navegador, sin la IA. **Publicado el 2 de noviembre** (PR #40). **Falta
     que el usuario lo vea** y que el manual se revise al final.
  3c. **El asistente registra devoluciones y siempre propone el gasto**
     (hist. §119, lo probaron el usuario y su profesor en el sitio). Suma una
     migración chica (`asistente_mensajes.operacion_tipo` acepta
     `devolucion`). **Sin publicar todavía.**
     - **Cupo de Groq:** unas 100 frases por día para todo Nexo (200.000
       tokens). Las pruebas de este día lo agotaron: **no correr
       `probar-ia` con la clave del servidor** salvo lo justo. Para la demo,
       el Dev Tier de Groq (pago por uso) lo decide el usuario.
  3d. **Que el asistente responda a cualquier cosa** (pedido del usuario del
     2 de noviembre: "que el asistente y la app en general respondan a
     cualquier cosa que el público pueda llegar a poner"). Tres bloques:
     1. ~~Sin IA: saludos, gracias, "¿qué podés hacer?", "llevame a…", y
        nunca un "no identifiqué" seco; menos productos por pedido~~
        **hecho** (hist. §120), sin publicar.
     2. Más operaciones con la IA: cobrar a un cliente, pagar a un proveedor,
        rotura o pérdida de stock, alta de cliente o producto, presupuesto,
        anotar una consulta. Mandar solo las herramientas que tengan que ver
        con la frase, para no agrandar cada pedido.
     3. Preguntas sobre los números: es el punto 4 de abajo.
     - **Para después (dicho por el usuario el 2 de noviembre, "eso guardalo
       para después"):** los bloques 2 y 3, publicar lo de hist. §119 y §120
       (con la migración de `asistente_mensajes`) y decidir el plan pago de
       Groq. Todo está commiteado en `solla`, sin publicar: el sitio sigue
       con lo del PR #40.
  4. Preguntas de solo lectura en el asistente (hoy solo tiene
     `registrar_venta`, `registrar_compra` y `registrar_gasto`). Las de
     cómo se usa ya las contesta el manual (hist. §118): este punto es para
     las de los números ("¿cuánto vendí este mes?"), que hoy llevan a
     Resumen.
  5. Base de integraciones (CLAUDE.md §32) y Mercado Libre (punto 14).
     - **Tienda Nube hecha el 2 de noviembre** (hist. §121), commiteada en
       `solla` y sin publicar. La base (`integraciones`, vínculos, pedidos y
       log) sirve igual para Mercado Libre.
     - **Publicado el 2 de noviembre** (PR #41, junto con §119 y §120), con
       `TIENDANUBE_APP_ID` y `TIENDANUBE_CLIENT_SECRET` en `/etc/nexo/nexo.env`
       (comprobado desde afuera: el callback ya no dice "no-disponible").
     - **Probada contra Tienda Nube de verdad el 2 de noviembre**, en el negocio
       "Gonzalo José Solla" con la tienda nexo330: publicar un producto, un
       pedido "Pago pendiente" (gateway not-provided) que entró al momento como
       venta por cobrar y bajó el stock, y su cancelación, que anuló sola la
       venta y devolvió el stock. Quedan el producto "Producto de prueba (Tienda
       Nube)" desactivado, el cliente "Cliente de Prueba" y la venta #34
       anulada. Una orden de compra con un mail .test la rechaza Tienda Nube.
     - **Decidido por mí, para revisar:** Nexo manda en el stock y el precio
       (pisa los de la tienda); un pedido con pago manual entra al crearse,
       como venta por cobrar, y uno online recién pagado (mientras tanto
       reserva stock 72 horas); una cancelación anula sola la venta sin
       cobros, y la que tiene cobros o factura queda para la devolución; lo cobrado entra en la cuenta de Mercado Pago (se
       cambia en la página); los pedidos de antes de conectar no se traen.
     - **Decidido por el usuario el 2 de noviembre: Nexo manda** en el stock y
       el precio. Razón: el stock lo cambian las ventas y las compras, y las
       compras solo se registran en Nexo; que la tienda se actualice sola al
       cargar una compra es lo cómodo. **"Traer mis productos" desde una
       tienda que ya existe queda para después**, si sobra tiempo: crear en Nexo
       los productos de la tienda (o vincularlos por SKU), con el stock como
       ajuste "importado de Tienda Nube". Los cambios de la tienda hacia Nexo
       (stock como ajuste por la diferencia, nunca copiando el número) se
       pensaron y quedan descartados por ahora.
     - **Pregunta para el usuario:** ¿Tienda Nube (y Mercado Libre) solo en el
       plan Pro, como dice la landing ("muy pronto")? Hoy está para todos,
       como ARCA.
     - **Mercado Libre hecho el 2 de noviembre (hist. §123), commiteado en
       `solla` y sin publicar.** Para probarlo de verdad:
       1. publicar (PR a `main`) y mandar `MERCADOLIBRE_APP_ID` y
          `MERCADOLIBRE_CLIENT_SECRET` a `/etc/nexo/nexo.env` (mismo comando
          de PowerShell que Tienda Nube);
       2. crear dos usuarios de prueba (vendedor y comprador) por API:
          `POST https://api.mercadolibre.com/users/test_user` con
          `{"site_id":"MLA"}` y el token de cualquier cuenta real (la de
          Santino, con la que se creó la app, sirve). Devuelve usuario y
          contraseña; hasta 10, y caducan si no se usan. Entrar a Mercado
          Libre con el vendedor de prueba y conectarlo desde Nexo;
       3. publicar algo con el vendedor de prueba (en el título,
          "Item de testeo – Por favor, NO OFERTAR", como pide Mercado Libre),
          vincularlo en Nexo, y comprarlo con el comprador de prueba (con
          tarjetas de prueba de Mercado Pago): tiene que entrar como venta
          cobrada y bajar el stock en los dos lados.
       - **Decidido por mí, para revisar:** vincular a mano (nunca por
         nombre); "Traer su stock" es opcional y sin marcarlo manda Nexo; un
         producto puede ir en varias publicaciones (clásica y premium); con
         variantes a distinto precio va solo el stock (Mercado Libre usa un
         precio por publicación); el comprador se reconoce por su número en
         las notas del cliente; la comisión se anota pero no se descuenta.
       - Queda para después: publicar desde Nexo, crear en Nexo las
         publicaciones que no existen ("Traer mis productos", igual que en
         Tienda Nube), la comisión como costo y el envío.
     - Plan original (2 de noviembre), ya hecho:
       1. `backend/mercadolibre.js` como `tiendanube.js`: OAuth con `state`
          firmado. Diferencia clave: el token dura 6 horas y se renueva con un
          refresh token que cambia en cada uso; hay que guardarlo cifrado, y
          renovar de a uno a la vez (si dos pedidos renuevan juntos, uno pierde
          el permiso).
       2. Avisos: Mercado Libre **no los firma**. Se contestan 200 enseguida y
          se confía solo en lo que devuelve su API con el token del negocio
          (pedir `/orders/{id}` con ese token es la verificación).
       3. **En Mercado Libre lo normal es vincular, no publicar:** el vendedor ya
          tiene publicaciones, y publicar desde Nexo pide fotos y los atributos
          obligatorios de cada categoría (marca, modelo, código), que Nexo no
          tiene. Primero: listar sus publicaciones, vincularlas por SKU
          (`seller_custom_field` o el atributo `SELLER_SKU`) confirmando a mano,
          y crear en Nexo las que no existan. Publicar desde Nexo, después.
       4. Stock y precio: Nexo manda, como en Tienda Nube (decisión del
          usuario), con la misma pasada y la reserva de pedidos.
       5. Ventas: `orders_v2` → pedido pagado → venta cobrada en la cuenta de
          Mercado Pago, con `crearVenta`. La comisión (`sale_fee`) queda para
          después (lista de e-commerce de más abajo).
       6. Probar con usuarios de prueba de Mercado Libre (se crean por API).
       - **La documentación de Mercado Libre devolvió 403 a WebFetch**: leerla
         con curl y un User-Agent de navegador, o desde el navegador.
     - Falta también: el envío y el canal
       en la venta, vincular productos que ya estaban en la tienda, fotos.
- **Del 9 al 15:**
  1. Terminar Mercado Libre y hacer Tienda Nube (punto 15).
  2. ~~WhatsApp~~ **hecho el 4 de noviembre** (hist. §134), sin publicar;
     falta la app de Meta (trámite del usuario) y probarlo de verdad.
  3. Si da: importar desde una planilla (punto 8c), sugerencias en el Resumen
     (CLAUDE.md §36), logo del negocio y descuentos en el punto de venta.
- **Del 16 al 19, solo presentación:** ninguna función nueva de producto.
  - cuenta de demo y "Probar sin registrarse" con QR;
  - comprobar que las listas aguantan ese volumen (casi ningún `GET` pagina,
    CLAUDE.md §35);
  - videos, ensayo y video de respaldo;
  - manual de usuario y documento final;
  - sacar el `noindex` si ya arranca la publicidad.
- **Trámites del usuario, esta semana:** Backblaze, Groq, Mercado Libre (app en
  su portal), Tienda Nube (partners; la evaluación puede demorar) y Meta. Ver
  "Trámites del usuario".
- **Después de la presentación:** reportes (punto 12), Web Push, caja con todos
  los medios (8d) y entrar con Google.

**IA (decidido el 1 de noviembre, a confirmar con la prueba de frases):**
- **El problema:** `gemini-3.6-flash` tiene razonamiento en `medium` por defecto
  y en el código no se baja. Además, los términos del plan gratis de Google
  prohíben mandarle datos personales: pueden leerlos personas y se usan para
  mejorar sus productos. Nexo le manda el catálogo y la frase, que suele traer
  el nombre del cliente.
- **La salida, sin dependencia nueva:** Groq con `fetch`, `openai/gpt-oss-20b`
  para interpretar y `whisper-large-v3-turbo` para el audio, con Zero Data
  Retention prendido. `gemini-2.5-flash-lite` queda de respaldo. Antes de
  cambiar, una prueba con unas 30 frases en castellano rioplatense: si Groq no
  entiende bien, va Gemini Flash-Lite con facturación (centavos de dólar).
- **Whisper reemplaza a la Web Speech API del punto 11:** el mismo camino para
  el dictado de la web y las notas de voz de WhatsApp, y anda en todo navegador.
- **`interprete.js` sigue sin importar la base** (CLAUDE.md §36).

**WhatsApp (diseño del 1 de noviembre):**
- Webhook con firma verificada, que responde enseguida y no procesa dos veces un
  mismo mensaje (Meta reintenta).
- Teléfono vinculado a la cuenta con un código desde Mi cuenta. El negocio sale
  de ese vínculo, nunca del mensaje (CLAUDE.md §28).
- Audio → Whisper → el mismo `interpretar` y `resolverPropuesta` de la web →
  propuesta con botones Confirmar y Cancelar → la misma ejecución, con auditoría
  de actor `asistente`.
- El número de prueba llega a 5 teléfonos verificados y es gratis. Sirve para la
  demo, no para todos los conocidos.
- **Solo gestión del negocio, nunca charla abierta:** desde enero de 2026 Meta
  prohíbe los asistentes de uso general en la API.

**Servidor y respaldos (decidido el 1 de noviembre):**
- **Se sigue en Oracle:** es gratis, y migrar a días de la presentación es un
  riesgo mayor que el que evita. Google e2-micro solo da 1 GB de salida por mes.
- **Pay As You Go no tiene costo fijo:** se paga solo lo que exceda lo gratis.
  Oracle autoriza US$ 100 en la tarjeta y lo revierte. No acepta prepagas ni
  débito con PIN. Es decisión del usuario; con la copia afuera no bloquea nada.
- **Respaldo en Backblaze B2** (10 GB gratis, sin tarjeta, compatible con S3):
  cifrado con `node:crypto` y sin dependencias, con la clave también guardada
  fuera del servidor. Otro proveedor, para que un problema con Oracle no se
  lleve la copia.
- **Con gente usando Nexo, publicar es delicado:** cada merge a `main` reinicia
  y puede migrar la base real. Se publica por bloques y probando antes.

**Auditoría general del 6 de octubre (hist. §57–§65): hechas las Fases 0 a 7**
(git, respaldo automático, backend, frontend, herramientas, scripts de verificación, limpieza
del repo, documentación al día y esquema).
Decidido con el usuario: seguridad y datos primero, antes de seguir con F6–F13.
`LICENSE` sigue sin agregarse hasta que el equipo decida cuál.
- **Fase 7: hecha** (hist. §64–§65). `schema.sql` tiene la forma final de cada
  tabla, `verificar-migracion` corre en el CI, `organizacion_id` es `NOT NULL` y
  el SKU es único por empresa. **La base real todavía no se migró:** lo hace el
  próximo `npm start`, con el respaldo automático antes. Si el arranque falla,
  el `ROLLBACK` la deja como estaba y se restaura el respaldo si hiciera falta.
El CI todavía no corrió nunca en GitHub: en local se probó en un clon limpio, en
Windows, y no en Linux (Docker Desktop estaba apagado).

**Etapa B, F6 en adelante (después de la presentación, o cuando una etapa del
plan toque ese dominio)** (otro dominio sin acoplamiento con estado ajeno;
candidatos: Proveedores o Clientes, que dejan su tabla, ficha y modal en el
dominio y siguen fijando el maestro con `fijarProveedores()` de
`core/maestros.js`; Caja también fija `cuentasTesoreria` ahí). Los maestros
compartidos que lee más de un dominio van a `core/maestros.js` con su
`fijarX()` (hist. §56). Los catálogos de Productos (categorías, listas,
depósitos) van con Productos: leen estado que reasigna `cargarProductos()`
(hist. §55). El patrón está probado en F3, F4 y F5 (hist. §54–§56): el módulo del
dominio se importa desde `app.js` con un import de efecto y se registra solo
(`alEntrarEnVista('v', ...)` o `registrar('cargar:x', ...)`); el que otros leen
exporta con `export let`, los demás usan `recargar('x')`, y las acciones de
otro dominio se piden con `invocar('x', ...)` (el dueño las registra, por
ejemplo `app.js` con `registrar('cobrar:venta', ...)`). `dominios/` nunca importa `app.js` (lo verifica el
test). **Auditoría y Papelera esperan a Stock, Caja y a los dominios que leen**:
reasignan o leen sus cachés (hist. §54). Los dominios grandes (ventas, compras,
productos) van al final. El seed ya está versionado (`npm run seed`, con el
empleado y su contraseña ya cambiada). El baseline de navegador sigue en el
scratchpad de la sesión y hay que recrearlo (`playwright-core` contra el Chrome
instalado). ESLint ya no: `npm run lint` desde la raíz (hist. §59).
Hist. §53 y §54 cuentan qué cubre cada prueba y las trampas.

**Para cerrar la Etapa A** (`organizacion_id NOT NULL` y SKU por empresa ya
están, hist. §65):
1. Poder apagar el registro público por configuración (por ejemplo, en una
   instalación de un solo comercio): es la Fase 4 de 8b. La verificación del
   mail ya está (hist. §108, código antes de crear la cuenta). El captcha no
   se hizo: pediría un servicio externo.
2. Si algún día dos empresas necesitan el mismo nombre de usuario, elegir entre
   `UNIQUE(organizacion_id, usuario)` con la empresa en el login, o login por
   email (hist. §45).

**Pendientes chicos conocidos:**
- `gh` (GitHub CLI) no está instalado en la máquina de Santino. Los PR se
  abren desde el link de comparación de GitHub.

**Diseño (hist. §62–§63, §66, §72).** Todas las pantallas se revisaron en
claro, en oscuro y a 390 px, y las fechas ya se muestran en dd/mm/aaaa. Los
dos pendientes viejos (la tabla de evolución en el celular y el título
repetido de las fichas) quedaron resueltos en hist. §72.

**Plan en dos semanas (decidido el 19 de octubre de 2026).** El orden ya no es
este: lo reemplaza el plan hasta el 20 de noviembre, al principio de esta
sección. Queda como detalle de cada etapa. El usuario adelantó
el plazo: el producto tiene que estar casi terminado hacia el **2 de noviembre
de 2026**. Después se arranca con publicidad, marketing y la presentación
presencial. Reemplaza al plan hasta el 1 de diciembre de hist. §66.
- **Quién decide:** el usuario delegó las decisiones técnicas y las básicas de
  negocio. Este plan es la planificación que piden CLAUDE.md §27 y §38: no hace
  falta confirmar etapa por etapa. Solo se le pregunta lo que el cliente final
  ve con precio, lo que cuesta plata y los trámites a su nombre.
- **Tamaño:** cada etapa se recorta a lo que entra en una o dos sesiones y se ve
  en una demo, completa y funcionando. Lo que queda afuera se anota como
  "después".
- **Cuenta:** suman unas 20 sesiones en 14 días. Si no da, se recortan desde
  el final: Tienda Nube, Mercado Libre y reportes (decidido por el usuario el
  19 de octubre: Mercado Libre y Tienda Nube van al final).

**Producto, en orden:**
1. ~~D: punto de venta y turno de caja~~ **hecha** (hist. §67 y §68). Para
   después: descuentos y precio editable en el mostrador, alta rápida de
   cliente y venta sin conexión.
2. **F: tipos de negocio, unidades y servicios: hecha** (hist. §70).
   Prioridad del usuario del 19 de octubre. Tipos: comercio general (incluye
   indumentaria y ferretería), carnicería, verdulería, kiosco o almacén,
   servicios y gimnasio.
3. ~~Rediseño visual, segunda parte~~ **hecha** (hist. §72): estructura de Dub
   (https://dub.co/ y su ficha de Refero) sobre el negro de Nexo, Inter y
   Satoshi, oscuro de partida y marco negro. Falta que el usuario lo vea y
   diga qué cambiaría.

4. ~~Alta de cuenta guiada y Configuración como sección propia~~ **hecha**
   (hist. §73):
   - alta en cinco pasos a pantalla completa, con tarjetas de tipo y
     "Próximamente";
   - Configuración como vista con páginas (negocio, tipo y secciones,
     comprobantes con vista previa, usuarios, cuatro catálogos y apariencia).
   - Falta que el usuario lo vea.
   - Para después:
     - las cuentas de tesorería como página (hoy en Caja, con sus saldos);
     - el logo del negocio;
     - ~~avisar al salir de una página con cambios sin guardar~~ hecho
       (hist. §85);
     - ~~una guía de primeros pasos en el Resumen para una cuenta nueva~~
       hecha (hist. §81).

5. ~~Socios, cuotas e ingreso~~ **hecha** (hist. §74, ampliada en §75 con
   duraciones, varios planes y descuentos). Falta que el usuario vea §75. Lo que quedó para después está en hist. §75. Lo que sigue
   es lo que se decidió para la etapa. Módulo
   `socios`, activable en cualquier negocio y prendido en el gimnasio, que
   además compra y vende como un comercio.
   Decidido con el usuario el 19 de octubre:
   - planes con precio y duración (mensual, trimestral, anual);
   - la cuota vence desde la fecha de alta del socio;
   - control de ingreso en la recepción, que avisa si debe.
   - Diseño (CLAUDE.md §29):
     - el socio es un cliente;
     - cada cuota es una venta del servicio del plan, cobrada con el circuito
       existente;
     - cuotas generadas de forma idempotente por período, sin cron.
   - Al sumarlo (hist. §73):
     - `socios` va a `MODULOS` y `MODULOS_INFO` y al preset del gimnasio (hoy
       `pos compras stock`);
     - se saca el "muy pronto" de la descripción del gimnasio;
     - sus planes y descuentos eran páginas de Configuración; desde hist. §76
       son su propia vista, "Planes", en el menú principal.
6. ~~Varios negocios por cuenta~~ **hecha** (hist. §77). Pedido del usuario del
   19 de octubre: "una cuenta podría tener más de un negocio sin problema".
   - Selector arriba del menú, "Agregar negocio" con el alta guiada y el rol
     por negocio. Falta que el usuario lo vea.
   - Lo que quedó para después está en hist. §77. Por ejemplo: invitar a otro
     negocio a alguien que ya tiene usuario, y dar de baja un negocio entero.
6a. **Servicios con funciones propias** (1–2 sesiones). Pedido del usuario del
   20 de octubre: "que en vez de productos se puedan agregar servicios" y que
   el tipo Servicios tenga más funciones. Diseño e investigación en
   `docs/investigacion-crm-servicios.md` §3:
   - ~~catálogo de servicios, con el nombre de la sección según el preset~~
     **hecho** (hist. §78);
   - ~~formulario propio (precio fijo o por hora, duración, unidad `hora`)~~
     **hecho** (hist. §78);
   - ~~trabajos (presupuesto aceptado → trabajo → venta)~~ **hecho** (hist.
     §78, módulo `trabajos`);
   - ~~abonos mensuales, con el mecanismo de las cuotas de socios~~ **hecho**
     (hist. §79, `periodosPendientes()` compartido);
   - el recordatorio de presupuestos enviados sin respuesta pasa al CRM (6b),
     dentro de "Para hoy".
6a2. ~~Tipo de negocio fijo y funciones que se suman~~ **hecha** (hist. §88).
   Pedido del usuario del 20 de octubre; decidido con él el 25 de octubre: el
   cambio de tipo queda en una página aparte que dice qué cambia, el nombre del
   catálogo sale de lo cargado, y su base real no se toca (le suma las
   funciones él). Falta que lo vea.
6b. ~~CRM adaptado a cada tipo de negocio~~ **hecho** (hist. §89 y §90).
   Pedido del usuario del 20 de octubre, **que llegue a la presentación**:
   consultas, clientes y clientes potenciales. Diseño en
   `docs/investigacion-crm-servicios.md` §2:
   - módulo `crm` con etapas por preset;
   - oportunidades y actividades;
   - pasar a cliente, presupuesto, socio o venta sin volver a cargar;
   - la lista "Para hoy";
   - clientes que dejaron de comprar.
   - Ni Dux ni Contagram tienen CRM: es diferencial.
   - Para después: que WhatsApp cree la consulta sola (etapa 11), el
     asistente que la anote ("me consultó Juan por…"), un formulario de
     contacto en la landing, mensajes por lote y automatizaciones de
     seguimiento.
7. ~~B2: PWA~~ **hecha** (hist. §94). Para después: notificaciones con Web
   Push.
7b. ~~**Celular de verdad**~~ **hecho** (hist. §94 a §97; pedido del usuario
   del 25 de octubre, muy importante). **Investigación hecha** (`docs/investigacion-celular.md`), y
   de ahí salen las fases que siguen, un commit y un § cada una:
   - ~~**Fase 2, base:**~~ **hecha** (hist. §95):
     - barra inferior con Resumen, las tres primeras funciones prendidas de
       `ingreso, socios, pos, trabajos, ventas, productos, clientes`, y
       "Más", que abre el cajón de siempre; se va la hamburguesa;
     - el asistente pasa a la topbar y las fichas llevan "volver";
     - los modales a pantalla completa, y el "atrás" los cierra;
     - `--control-h` de 44 px e inputs de 16 px;
     - un token `--abajo` para todo lo fijo abajo.
   - ~~**Fase 3, listas compactas:**~~ **hecha** (hist. §96):
     - la tabla con `lista-movil`; las celdas con `m-titulo`, `m-valor` y
       `m-estado`, más una `<td class="m-sub">` armada con `celdaMovil()`
       (`core/formato.js`), que en la compu no se ve;
     - dos líneas por fila;
     - sin selección múltiple ni precio editable en el celular.
   - ~~**Fase 4:**~~ **hecha** (hist. §97): filtros en hoja desde abajo, un
     "Nuevo" flotante por vista (`btn-nuevo`) y la pasada visual.

   El pedido original, como referencia: Hoy en el celular
   todo tiene el mismo tamaño que en la compu, solo más apretado: en Productos
   entran uno o dos renglones por pantalla (cada fila de tabla se vuelve una
   tarjeta alta con todas las columnas) y hay que deslizar todo el tiempo. Le
   pasó lo mismo con el sistema de su negocio de perfumes.
   - **Investigar primero, con capturas:** cómo resuelven las listas, las
     fichas, los formularios y la navegación en el celular otros sistemas de
     gestión y apps de comercio (Dux, Contagram, Mercado Pago, Tienda Nube,
     Shopify, Square, Loyverse y otros).
   - **Ideas a validar con esa investigación:** lista compacta de una o dos
     líneas por renglón (nombre, el dato clave y el estado, y lo demás en la
     ficha); barra de navegación abajo con las secciones de uso diario; botón
     flotante para "Nuevo"; filtros en una hoja que sube desde abajo; formularios
     a pantalla completa en vez de modales.
   - Va junto con la PWA: la app instalada es esta misma vista.
8. **Landing pública con planes y hosting: en curso.** Va antes de lo demás
   porque el marketing necesita una dirección pública. Las decisiones del
   usuario (27 de octubre) están en hist. §98. Son cuatro fases, un § y un
   commit cada una:
   - ~~**Fase 1 (§98), planes en el backend**~~ **hecha**.
   - ~~**Fase 2 (§99), el plan en la app**~~ **hecha**: página "Plan de Nexo",
     aviso en el Resumen, enlace en el toast del tope, marca en los
     comprobantes, tipo "Emprendimiento", `?plan=` en el alta y el contacto
     al CRM de ventas.
   - ~~**Fase 3 (§100), landing**~~ **hecha**:
     - `/` muestra la landing sin sesión y lleva a `/app` con sesión;
     - la app pasa a `/app` (con `start_url` y `PRECACHE` del service
       worker);
     - `landing.html`, `landing.css` y `landing.js` sin scripts inline, con
       capturas reales;
     - el formulario de contacto, contra `POST /api/publico/consulta` (ya
       hecho en §99);
     - página de privacidad, `robots.txt` y `sitemap.xml`.
   - ~~**Fase 4, publicación**~~ hecha (hist. §103), adelantada a la etapa
     8b por pedido del usuario:
     - carpeta `deploy/` con `Caddyfile`, `nexo.service`, `instalar.sh`,
       `actualizar.sh` y DuckDNS;
     - la guía `docs/publicar.md`;
     - HSTS en producción.
     - Los trámites del usuario son la cuenta de Oracle Cloud (pide tarjeta
       solo para verificar) y la de DuckDNS.
   - **Para después:** cobro online con Mercado Pago, un panel de
     administración de la plataforma, dominio propio y respaldo fuera de la
     VM.
   Lo que sigue es el planteo original de la etapa, como referencia:
   - **Planes (pedido del usuario del 25 de octubre):** se definen en esta
     etapa, con él. Hay que decidir en base a qué se cobra, qué suma cada
     plan más caro y cómo es la demo para probarlo.
   - El plan base va más barato que la competencia. El trabajo del Classroom
     de punto de equilibrio usó $ 19.900 por mes como provisorio (Dux desde
     $ 36.000 + IVA; Contagram, $ 58.900 + IVA): no es un precio decidido.
   - **Plan gratis (pedido del usuario del 25 de octubre):** Nexo tiene que
     servirle a cualquier negocio, también a un chico que vende medialunas en
     el colegio y quiere saber cuánto vende y cuánto gana. Quiere invitar a los
     emprendedores de su colegio. El plan gratis tiene límites, a definir en
     esta etapa (por ejemplo, cantidad de productos o de ventas por mes, un
     solo usuario, sin facturación electrónica). Para ese usuario, una
     entrada más simple (un tipo "Emprendimiento" con pocas secciones) se
     piensa en esta misma etapa.
   - **Publicidad de terceros en el plan gratis: recomendado no ponerla**
     (respondido al usuario el 25 de octubre; la decisión es suya): paga muy
     poco, mete scripts de terceros donde están los datos de los negocios, y
     Google restringe los anuncios a menores. La alternativa propuesta: el
     plan gratis funciona como vidriera, invita a pasar a un plan pago y lleva
     la marca "Hecho con Nexo".
8b. **Login, mail, términos y edad** (pedido del usuario del 27 de octubre,
   antes de la Fase 4 de publicación: sin esto la landing no se abre al
   público). Investigación y plan en `docs/investigacion-login-legal.md`:
   - ~~`backend/mail.js`~~ hecho (hist. §101).
   - ~~Fase 1: mail en la cuenta, verificado, y login con mail~~ hecha (hist.
     §102).
   - ~~Fase 1b: invitaciones por mail desde Configuración y cuentas sin
     negocio~~ hecha (hist. §104), sin el rebuild de `usuarios` (no hizo
     falta: ver el §).
   - ~~Fase 2: recuperar la contraseña~~ hecha (hist. §105). El reseteo del
     admin quedó solo para quien no confirmó su mail.
   - **Entrar con Google** (pedido del usuario del 28 de octubre, pendiente,
     sin fecha). Lo pensado:
     - gratis y sin dependencias: el botón de Google Identity Services y el
       ID token verificado en el backend con `node:crypto` contra las claves
       públicas de Google (`aud`, `iss`, `exp`, `email_verified`);
     - la CSP: el script de Google es de un dominio externo. Si no conviene
       abrirla, el flujo por redirección (OAuth code flow) no pide ningún
       script en la página;
     - el mail de Google cuenta como confirmado. Si ya hay una cuenta con ese
       mail, se vincula. Si no, nace una cuenta sin negocio: ahí sí hace falta
       el rebuild de `usuarios` (`organizacion_id` nulable);
     - trámite del usuario: el cliente OAuth en Google Cloud Console (gratis),
       con el dominio de Nexo.
   - ~~Fase 3: `/terminos`, privacidad completa, la casilla de aceptación con
     su versión y la pregunta de edad~~ hecha (hist. §106).
   - ~~Fase 4: descargar los datos, dar de baja el negocio y
     `NEXO_REGISTRO=off`~~ hecha (hist. §109), con la baja de la cuenta y el
     campo trampa del alta. Para después: un mail de recordatorio unos días
     antes del borrado.
   - Las migraciones son aditivas y están explicadas en el documento.
8c. **Carga inicial: empezar con un negocio que ya existe. Hecha (hist.
   §124), salvo importar desde una planilla**, que es lo que queda de este
   punto (su diseño, en "Importar", abajo). Pedido del usuario del 28 de
   octubre. Lo vio cuando su
   hermano, que vende mates, tuvo que registrar una compra para cargar el
   stock que ya tenía. La mayoría de los que usen Nexo ya tienen un negocio
   andando: el primer día tienen que poder cargar lo que tienen, lo que les
   deben y lo que deben, sin inventar compras ni ventas. Lo que ya hay hoy:
   - el ajuste de stock (`POST /api/stock/ajuste`), que no lleva costo;
   - el saldo inicial de las cuentas de tesorería;
   - el tipo `ajuste` en las cuentas corrientes.

   **Decidido por el usuario el 28 de octubre:**
   - **La entrada:** una pregunta al final del alta y, además, un paso en la
     guía de primeros pasos del Resumen. La pregunta, redactada:
     - "¿Tu negocio ya venía funcionando?"
     - Bajada: "Si ya tenías mercadería, clientes que te deben o plata en la
       caja, cargalo ahora y Nexo arranca con tus números de hoy. Lo podés
       hacer después."
     - Opciones: "Sí, quiero cargar lo que ya tengo" y "No, arranco de cero".
   - **Un apartado propio, "Lo que ya tenías"**, con una sección para cada
     cosa, que se cargan en cualquier orden y muestran cuál falta:
     - productos y stock;
     - lo que te deben;
     - lo que debés;
     - la plata en la caja y en las cuentas;
     - ventas recientes.
   - **Importar desde una planilla: sí, sirve mucho.**
   - **Las ventas de antes no son obligatorias.** Si las carga, elige desde
     cuándo: esta semana, este mes o una fecha.

   Diseño técnico pensado (se planifica antes de arrancar):
   - **Stock inicial:** una planilla en pantalla, con una fila por producto
     (los que ya están y el alta rápida en la misma fila), depósito, cantidad
     y costo unitario.
     - Cada fila es un movimiento de stock de origen `stock_inicial`, con su
       costo unitario, que entra al costo promedio.
     - No genera deuda ni toca la caja.
     - **Esquema:** hay que sumar `stock_inicial` al `CHECK` de
       `movimientos_stock.origen`. Es un rebuild (CLAUDE.md §34).
   - **Lo que te deben y lo que debés:** por cliente o proveedor, el importe,
     la fecha y el vencimiento.
     - No sirve un `ajuste` suelto en la cuenta corriente: los cobros se
       aplican a una venta, y el aging sale del vencimiento de las ventas.
     - Por eso cada deuda nace como una "venta de saldo inicial" (y una
       "compra de saldo inicial" para los proveedores). No mueven stock ni
       caja, se cobran y se pagan con el circuito de siempre y aparecen en el
       aging.
   - **Caja y cuentas:** el saldo inicial de cada cuenta, que ya existe.
   - **Ventas recientes:** ventas marcadas como de carga inicial.
     - **No mueven stock:** el stock que se cargó ya es el de hoy.
     - **No mueven caja:** la plata que se cargó ya es la de hoy.
     - Cuentan en los reportes, así la primera semana o el primer mes no
       arrancan vacíos.
     - Una venta de antes que quedó sin cobrar **es** la deuda de ese cliente:
       no se carga de nuevo en "Lo que te deben".
   - **Importar:**
     - productos (con stock y costo), clientes y proveedores (con su saldo);
     - una planilla modelo para bajar;
     - una vista previa con el error de cada fila antes de confirmar;
     - el SKU identifica un producto que ya existe, y no se pisa nada sin
       avisar.
     - CSV sin dependencias. Para leer `.xlsx` directo, la opción es SheetJS
       (gratis, Apache 2.0) en `js/vendor/`, que se baja solo en esa
       pantalla.
   - Solo para el admin, y queda en la auditoría.
8d. **Caja con todos los medios de pago** (pedido del usuario del 28 de
   octubre, sin fecha). Investigación y diseño en `docs/investigacion-caja.md`.
   - Al abrir, solo el efectivo, como hoy (así hacen Fudo y Loyverse). Al
     cerrar, cada medio con lo que dice Nexo, lo declarado (el efectivo
     contado; el débito y el crédito, según el cierre de lote del posnet) y
     la diferencia.
   - Primero hace falta el medio de pago como entidad (`medios_pago` y
     `cobros.medio_pago_id`; CLAUDE.md §3 y §9): hoy un cobro guarda la cuenta,
     no con qué se pagó. Migración aditiva.
   - Además, el arqueo ciego opcional y el aviso de un cobro cargado con el
     medio equivocado.
9. **C: IVA. Hecha** (hist. §112, §113 y §114). Decidido en §114: para un
   inscripto, el costo de lo comprado con factura A va sin IVA y la ganancia
   también se mide sin IVA. Queda: la retención de Mercado Pago, el desglose
   por alícuota en los libros (para el libro IVA digital) y la alícuota por
   renglón en la compra.
   - Condición fiscal de la empresa (responsable inscripto, monotributo o
     exento) y del cliente.
   - Alícuota por producto, 21% por defecto. `precio_unitario` sigue siendo el
     precio final con IVA incluido.
   - Cada renglón guarda su alícuota y su IVA.
   - Letra automática: A de inscripto a inscripto o a monotributista (RG
     5003), B de inscripto a cualquier otro, C si el emisor es monotributista
     o exento. La factura A discrimina el IVA.
   - Reporte de IVA ventas y compras.
   - La retención de Mercado Pago queda para después.
10. **E: ARCA en homologación — hecho** (hist. §115). Lo que queda:
   - las capturas de ARCA en los pasos de la página (las saca el usuario);
   - que un negocio suba su propio certificado (CLAUDE.md §33): hace falta
     para producción, no para la demo. Su clave privada iría cifrada en la
     base, con una clave del servidor;
   - producción: el CUIT de Nexo (contador), `NEXO_ARCA_AMBIENTE=produccion`
     y confirmar que ARCA reconoce una delegación nueva sin esperar a que
     venza el ticket (si no, el mensaje de "Verificar" ya avisa que puede
     tardar unas horas).
11. **I: voz y WhatsApp** (2 sesiones).
   - Dictado con la Web Speech API del navegador (es-AR, sin costo), con el
     mismo flujo de confirmación.
   - WhatsApp Cloud API como canal del asistente, con el número de prueba que
     da Meta: hasta 5 teléfonos y gratis. Las respuestas dentro de la ventana
     de 24 h no se cobran.
     - La política de "AI Providers" de Meta (2026) cobra a asistentes de IA de
       uso general, y solo en algunos países (hoy, Brasil). Ni el asistente de
       Nexo ni la Argentina entran.
   - Las notas de voz de WhatsApp se transcriben con Gemini, que ya se usa.
   - Consultas de solo lectura en lenguaje natural ("¿cuánto vendí este
     mes?").
12. **H: reportes** (1 sesión, segundo en recortarse): ventas por vendedor y
    comparación contra el mismo período del año anterior.
13. **Cierre** (1 sesión).
    - Datos de demo realistas: una cuenta nueva para la presentación que
      muestre todas las funciones (decidido con el usuario el 29 de octubre;
      reemplaza a la demo del profe, que se borró en hist. §110).
    - Pasada final de diseño.
    - Ensayo de la demo.

14. **G: Mercado Libre** (2 sesiones). Arma también la base común de
   integraciones de CLAUDE.md §32:
   - credenciales OAuth por empresa;
   - tabla de vínculos publicación ↔ producto o variante;
   - log de sincronización.
   - Funciones:
     - Nexo empuja stock y precio de las publicaciones vinculadas;
     - las ventas de Mercado Libre entran por webhook como ventas de Nexo, por
       la misma lógica que una venta cargada a mano, y sin duplicarse.
   - Para la demo, usuarios de prueba de Mercado Libre (se crean por API).
   - Gratis.
   - **Lo que le falta a la venta para e-commerce** (visto con el usuario el
     2 de noviembre; hoy solo la compra tiene envío):
     - el canal de la venta (mostrador, Mercado Libre, Tienda Nube,
       WhatsApp), para la rentabilidad por canal de CLAUDE.md §20;
     - la comisión y el envío que cobra el canal como costo de la venta: si
       no, la ganancia de un vendedor de Mercado Libre sale falsa;
     - el envío de la venta: dirección, estado (por preparar → despachado →
       entregado), empresa y seguimiento, copiado del canal o cargado a mano
       en el envío propio, con una lista "para despachar hoy";
     - stock reservado de los pedidos pagos que todavía no salieron.
     - la ficha del producto para publicar: hoy tiene nombre, SKU, precio,
       categoría, descripción, variantes y stock. Faltan fotos, peso y
       medidas (los piden los envíos), código de barras, marca y precio de
       oferta. Lo de la vidriera (SEO, diseño, orden) queda en cada canal.
       Las fotos van al disco del servidor: una carga para los dos canales.
     - Las etiquetas y la elección del correo quedan en Mercado Envíos y
       Envío Nube. Son columnas nuevas en `ventas`: explicar la migración
       antes (CLAUDE.md §34).
15. **G: Tienda Nube** (1–2 sesiones), sobre la misma base. Gratis para
   partners, con una tienda demo.

**Lo que no es el producto: trabajos del Classroom** (decidido el 19 de
octubre).
- **Qué son:** los documentos que pide la profesora en el Classroom de la
  materia; por ejemplo, contabilidad, modelo Canvas de negocio y manual de
  usuario. El usuario va a pasar la lista completa.
- **Cómo se hacen:**
  - en **sesiones aparte**, sin mezclarlas con las del producto;
  - con **commits específicos de cada trabajo**: el usuario les saca captura
    para entregar en el Classroom. Un commit por documento, con un mensaje
    claro (por ejemplo `docs(classroom): modelo Canvas de negocio`), sin
    código del producto en el mismo commit.
  - Los documentos van directo en `docs/`, junto a los otros trabajos (pedido
    del usuario del 25 de octubre: no hay carpeta `docs/classroom/`).
- **Hechos y entregados** (un PDF cada uno en `docs/`; el HTML de origen no
  se versiona):
  - informe económico, monetización y marco legal;
  - punto de equilibrio: plan base provisorio de $ 19.900 por mes, 84
    clientes con sueldos y 5 sin sueldos;
  - TAM, SAM y SOM:
    - TAM: 476.750 empresas empleadoras;
    - SAM: unos 2.770 negocios de Alta Gracia, la ciudad del equipo;
    - SOM: el 3%, unos 83 clientes.
  - Un trabajo nuevo que use estos números los toma de ahí, para que no se
    contradigan.
- **Prioridad:** terminar el producto lo antes posible, así esos documentos
  describen un producto ya definido. Igual, algunos se van haciendo en estos
  días, intercalados.
- **Después:** publicidad, marketing y la presentación presencial.

**Trámites del usuario** (todos gratis; hay que tenerlos antes de la etapa que
los usa; conviene arrancarlos ya, porque algunos tardan días):
- ~~**Mercado Pago:**~~ **probado de verdad el 3 de noviembre.** Conectada
  la segunda cuenta de Santino (SS20250420182002) al negocio "Gonzalo José
  Solla"; la venta #35 ($100) se pagó con el link desde otra cuenta (el
  hermano: entre dos cuentas del mismo dueño Mercado Pago no habilita
  "Pagar") y entró sola por el aviso firmado al instante: cobrada, comisión
  $7,99 como gasto de la venta, neto $92,01. Falta ver un pago con tarjeta en
  cuotas (financiación) y uno con retenciones.
  App "Nexo-system" (número 2169591197651576), creada el 3 de noviembre con
  Checkout Pro y **"API de Preferences"**. La primera ("Nexo-App", …4890) se
  creó con "API de Orders" y Mercado Pago no la deja vincular cuentas: "La
  aplicación no está preparada para conectarse a Mercado Pago", con
  cualquier cuenta, con o sin PKCE y con cualquier dirección de vuelta.
  Mercado Pago avisa que Preferences "será descontinuada pronto": pasar
  `crearLink` a la API de Orders cuando lo anuncien, sin cambiar de app.
  `MERCADOPAGO_APP_ID` es el número de la app (o el Client ID de Producción),
  no el de "Cuenta de prueba" (3799…). Mercado Pago no acepta volver a
  `localhost`: se conecta desde el servidor.
  1. En https://www.mercadopago.com.ar/developers/panel/app, "Crear
     aplicación" (gratis), tipo Checkout Pro / pagos online, con la cuenta de
     Santino.
  2. En la app: URL de redireccionamiento
     `https://<dirección pública de Nexo>/api/integraciones/mercadopago/callback`
     (idéntica; si se prende PKCE en la app, Nexo ya lo manda), y en
     Webhooks la misma dirección con `/notificaciones` en vez de `/callback`,
     con el evento "Pagos". Ahí da la "clave secreta" de los avisos.
  3. Mandar al servidor `MERCADOPAGO_APP_ID` (el "Client ID" o número de la
     app), `MERCADOPAGO_CLIENT_SECRET` y `MERCADOPAGO_WEBHOOK_SECRET` (la clave
     de los avisos), con el mismo comando de PowerShell de Mercado Libre.
  4. Crear dos cuentas de prueba (vendedor y comprador) en "Cuentas de
     prueba" del panel, conectar el vendedor desde Nexo, crear un link en una
     venta y pagarlo con el comprador y una tarjeta de prueba.
  5. Mirar en Configuración → Mercado Pago que la comisión, las cuotas y las
     retenciones salgan bien: los nombres de `fee_details` se escribieron de
     memoria (hist. §130).
- ~~**Backblaze:**~~ hecho el 2 de noviembre (cuenta en EU Central, bucket
  privado `nexo-respaldos-solla`, clave solo para ese bucket).
- ~~**Groq:**~~ cuenta y clave hechas el 2 de noviembre (la clave en el
  `.env` de la compu). Confirmar que Zero Data Retention quedó prendido en
  Data Controls.
- **ARCA (etapa 10):**
  - **Quién (cambiado el 28 de octubre, hist. §105):** Santino, con su propio
    CUIL y su clave fiscal. Reemplaza al padre (19 de octubre). En ARCA no
    hay "cuenta de Nexo": Nexo tendría CUIT propio solo como sociedad.
    Homologación es gratis y no lo inscribe en ningún impuesto. Es un solo
    certificado de prueba para todos los negocios de la demo.
  - **Pasos que le pasé:**
    1. Clave fiscal nivel 3 con la app Mi ARCA (DNI + selfie).
    2. En arca.gob.ar, Administrador de Relaciones de Clave Fiscal → Adherir
       servicio → ARCA → Servicios interactivos → "WSASS – Autogestión
       Certificados Homologación". Salir y volver a entrar.
    3. Pasarme su CUIL: acá se genera la clave privada y el pedido (CSR). La
       clave no se versiona, igual que el `.env`.
    4. En WSASS: Nuevo certificado (nombre `nexo-homologacion`), pegar el CSR
       y pasarme el `.crt`.
    5. En WSASS: Crear autorización a servicio, con ese certificado, el
       servicio "wsfe" y su propio CUIL como representado.
  - **Estado (29 de octubre):** pasos 1 a 4 hechos. El certificado de
    homologación (alias `nexohomologacion`, sin guion, emitido por
    "Computadores Test", vence el 28 de octubre de 2028) y su clave están en
    `C:\Users\HP ULTRA 5\.nexo-arca\` (`nexo-homologacion.key`, `.csr` y
    `.crt`), fuera del repo; se controló que la clave y el certificado son
    pareja. Paso 5 hecho: autorización a `wsfe` con su propio CUIL como
    representado (también quedaron, sin uso, autorizaciones a `arbccf` y
    `wsfex`). **Los trámites de ARCA para homologación están completos.**
  - Sin inscripción fiscal, qué letras deja emitir homologación (A, B o C) se
    confirma en la primera prueba.
  - **Cómo se ve en la demo (decidido con el usuario el 19 de octubre):** es
    una presentación escolar pero seria, con directivos y padres.
    - La factura impresa lleva los datos del negocio de demo cargados en
      Configuración, no los de Santino: su CUIL es solo un dato interno.
    - Todo comprobante emitido en homologación lleva la leyenda "Comprobante
      de prueba – sin validez fiscal".
    - Se intenta emitir A, B y C. Homologación en general no controla la
      condición fiscal; se confirma en la primera prueba.
    - Se factura en vivo, con un video grabado antes de respaldo (los
      servidores de prueba de ARCA a veces se caen) y el CAE simulado como
      última red.
  - **En producción (decidido por el usuario el 19 de octubre):**
    - Nexo se inscribe en ARCA con su propio CUIT, clave fiscal nivel 3 y un
      certificado de producción. Ese CUIT es el de Santino como
      monotributista o el de una sociedad: cuesta plata por mes, así que se
      decide con un contador después de la presentación;
    - cada cliente le delega el servicio wsfe a Nexo y emite con su propio
      CUIT, sin tener certificado.
    - Seguir soportando que un negocio suba su propio certificado.
    - CLAUDE.md §33 quedó corregido en ese sentido.
    - Que Nexo facture sus suscripciones (inscripción fiscal de Nexo) es
      aparte: hay que charlarlo con un contador.
- **Dirección pública con HTTPS (etapa 11): ya está.** Mercado Libre, Tienda
  Nube y WhatsApp le avisan a Nexo por webhook, y desde hist. §103 llegan
  directo a https://nexosystem.duckdns.org. Ngrok ya no hace falta.
- **Mercado Libre (etapa 14):** cuenta propia de Mercado Libre y crear la app
  en su portal de desarrolladores. No hay sandbox: se prueba en producción entre
  usuarios de prueba (hasta 10, se crean por API y caducan).
  - **Hecho el 2 de noviembre:** app creada en Mercado Libre Developers (cuenta
    de Santino). El nombre corto "nexo" estaba tomado por otra app de Mercado
    Libre (es único en todo el sitio); se usó otro. Cargadas en la app:
    redirección `https://nexosystem.duckdns.org/api/integraciones/mercadolibre/callback`
    y avisos en `.../api/integraciones/mercadolibre/notificaciones`, con los
    tópicos `orders_v2` e `items`. **Esas rutas todavía no existen.**
  - `MERCADOLIBRE_APP_ID` (16 dígitos) y `MERCADOLIBRE_CLIENT_SECRET` (32) en el
    `.env` de la compu; **faltan en el servidor** (mismo comando de PowerShell
    que Tienda Nube, al publicar).
- **Tienda Nube (etapa 15):** registrarse en el programa de partners, crear una
  tienda demo y la app.
  - **Hecho el 2 de noviembre:** app 49947, "Para tus clientes" (sin la
    revisión de la tienda de aplicaciones), con la redirección a
    `/api/integraciones/tiendanube/callback`, la página `/app`, Editar
    productos, Ver pedidos y los tres webhooks de privacidad en
    `/api/integraciones/tiendanube/privacidad/{tienda,borrar-cliente,datos-cliente}`.
    Las rutas existen desde hist. §121 (sin publicar todavía).
    Tienda demo: https://nexo330.mitiendanube.com, vacía a propósito: los
    productos los sube Nexo al instalar la app ("publicar en Tienda Nube").
    `TIENDANUBE_APP_ID` y `TIENDANUBE_CLIENT_SECRET` en el `.env` de la compu
    (las de Mercado Libre y WhatsApp, vacías). La tienda demo es gratis pero no admite ventas: para la
  demo, probar crear la orden con `POST /orders` y confirmar que dispara
  `order/created`.
- **Meta (etapa 11): lo único que falta para WhatsApp** (el código está desde
  hist. §134). Pasos que le pasé el 4 de noviembre:
  1. En https://developers.facebook.com, entrar con su Facebook y registrarse
     como desarrollador (gratis).
  2. "Crear app" → caso de uso "Conectarse con clientes a través de WhatsApp"
     (tipo Negocio). Pide una cuenta comercial de Meta: se crea ahí mismo.
  3. En la app, WhatsApp → Configuración de la API: Meta da un número de
     prueba. Anotar el **Phone number ID** (`WHATSAPP_PHONE_NUMBER_ID`) y el
     número (`WHATSAPP_NUMERO`). En "Para", sumar su celular (y hasta 4 más) y
     verificarlo con el código que le llega.
  4. Configuración de la app → Básica: la **clave secreta de la app**
     (`WHATSAPP_APP_SECRET`).
  5. El token: el de la página de la API vence en 24 horas y sirve para
     probar. Para que dure, en la configuración del negocio (business.facebook.com)
     → Usuarios del sistema → crear uno de administrador, asignarle la app y
     generar un token sin vencimiento con `whatsapp_business_messaging` y
     `whatsapp_business_management` (`WHATSAPP_TOKEN`).
  6. Mandar al servidor las cinco variables con el comando de PowerShell de
     siempre: las cuatro de arriba y `WHATSAPP_VERIFY_TOKEN`, una palabra
     larga inventada (la genero yo si quiere).
  7. Publicar, y en WhatsApp → Configuración → Webhook: dirección
     `https://nexosystem.duckdns.org/api/integraciones/whatsapp/webhook`, el
     mismo `WHATSAPP_VERIFY_TOKEN`, y suscribir el campo **messages**.
  8. **Publicar la app** (menú Publicar; pide la URL de privacidad, la de
     condiciones y la de eliminación de datos: `/privacidad`, `/terminos` y
     `/privacidad`). Sin publicar, Meta solo manda los avisos de prueba del
     panel, nunca los mensajes reales, ni los del dueño (aprendido el 5 de
     noviembre).
  9. **Suscribir la app a la cuenta de WhatsApp:** en el Explorador de la API
     Graph, con Nexo-app y `whatsapp_business_management`,
     `POST 873217219182553/subscribed_apps`. El GET mostraba solo "WA DevX
     Webhook Events 1P App", una de Meta: con el webhook configurado y
     `messages` suscrito, igual no llegaba nada.
  10. Probar: Configuración → WhatsApp → mandar el código, y después una
     venta por texto y por audio. **El número de prueba no se abre desde
     wa.me** ("no está en WhatsApp"): primero se le manda al celular la
     plantilla de prueba desde Configuración de la API ("Enviar mensaje"), y
     se responde el código en ese chat.
  - El perfil del número de prueba no se edita: queda "Test Number" y sin foto
    (lo dice WhatsApp Manager → Números de teléfono → Perfil). Para la demo,
    guardarlo como contacto "Nexo". Con el número real: nombre "Nexo" (lo
    aprueba Meta), el ícono de 1024 × 1024, una descripción y el sitio.
  - Los celulares argentinos llegan con el 9 (549…) y se les contesta sin él
    (hist. §135, `destinatario()`). El registro anota el aviso mal firmado y
    el que va a otro número (el botón Probar del panel usa uno inventado).
  - El número de prueba es gratis y llega a 5 teléfonos: alcanza para la demo.

**Después de la presentación:**
- **Ofertas en presupuestos** (charlado con el usuario el 4 de noviembre, "lo
  dejamos para después"): el presupuesto propone el precio de la oferta como
  el alta de venta, y cada renglón guarda la oferta y el precio de lista
  (columnas nuevas en `presupuesto_items`). La regla: el presupuesto respeta
  su precio hasta su propio vencimiento aunque la oferta termine antes, y al
  convertirlo la venta conserva la oferta del presupuesto (hoy el precio pasa
  bien, pero la venta quedaría sin el nombre de la oferta).
- **ARCA en producción.** Cada empresa usa su propio certificado, o delega el
  servicio en el CUIT de Nexo.
- **Producción de WhatsApp.** Pide verificar un negocio real ante Meta.
- **Correo Argentino y Andreani** (posible mejora, pedida por el usuario el 2
  de noviembre). Va después del envío en la venta (etapa 14): cotizar,
  generar la etiqueta y seguir el envío desde una venta con envío propio.
  - Las dos APIs piden un contrato comercial de cada negocio, con sus
    credenciales guardadas por empresa (CLAUDE.md §32). Para Nexo es gratis.
  - No se puede probar sin un contrato real: no entra en la presentación.
  - Alternativa: un servicio que junta varios correos en una API (Enviopack,
    Zippin), sin contrato con cada uno, pero cobra por envío. Es decisión de
    plata.
  - Las condiciones de cada API se confirman al planificarla.
- **Fuera de alcance (CLAUDE.md §39):**
  - métricas de Meta Ads: la API es gratis, pero leer cuentas de otros negocios
    pide revisión de la app y verificación de negocio, semanas de trámite;
  - catálogo de Instagram.
- **Modularización F6–F13.** Se avanza cuando una etapa toca un dominio.
- **Migrar a Postgres.**
- **Registro público:** poder apagarlo (Fase 4 de 8b). El mail ya se
  verifica con el código (hist. §108).
