# Escalar y vender Nexo

**Estado: en pausa hasta la presentación oficial (principios de diciembre de
2026).** Decidido por el usuario el 17 de noviembre: hasta presentar se
trabaja solo el plan de la presentación (`handoff.md`, "Qué sigue"). Después
se analiza este documento con el equipo y se decide si se escala. **Nada de
acá se arranca sin esa decisión**; lo que aparezca mientras tanto (un riesgo,
una idea, un precio) se anota acá y no se ejecuta.

Escrito el 12 de noviembre y rehecho el 17 de noviembre con el análisis de esa
sesión (hist. §190–§192). Lo marcado **preliminar** son números y opciones
para confirmar al planificarlo, no decisiones.

**La idea en una línea:** como sistema, Nexo ya está para usarse de verdad.
Escalar es reforzarlo todo (servidor, datos, seguridad, integraciones),
ponerlo en regla (contador, monotributo, abogado, marca) y cobrar los planes.
Es un cambio grande, más de infraestructura y de trámites que de funciones.

Quién hace cada cosa: **(U)** el usuario, porque es un trámite o una cuenta a
su nombre; **(C)** código, que se hace en una sesión de trabajo; **(U+C)** las
dos cosas.

**Criterio de gastos para esta etapa** (usuario, 17 de noviembre): se paga lo
que dé seguridad y confiabilidad ("si hay que pagar un hosting, lo pagamos; no
vamos a buscar opciones gratis a toda costa"; "mientras más seguridad les
demos a los clientes, más clientes vamos a tener"). Hasta la presentación, la
infraestructura sigue como está.

---

## 0. Las decisiones que ordenan todo lo demás

- [ ] **(U) Escalar sí o no**, después de la presentación.
- [ ] **(U) De quién es el CUIT de Nexo:** el monotributo de Santino (ya
  decidido como titular de los términos) o una sociedad. Con un contador. Si
  el titular es menor de edad, planteárselo primero.
- [ ] **(U) Dónde corre Nexo y con qué base de datos** (punto 2).
- [ ] **(U) Los planes y sus precios** (punto 7).

## 1. Lo que ya está

- Todas las funciones de §1 a §36 de CLAUDE.md, publicadas en
  https://nexosystem.duckdns.org.
- **Servidor** (Oracle, capa gratis) con HTTPS (Caddy). Se actualiza solo
  desde `main` con el CI en verde y vuelve a la versión anterior si el
  arranque falla (`docs/proyecto/publicar.md`).
- **Respaldos:** uno en cada arranque y otro diario a las 3:30, que sube
  cifrado a Backblaze B2; restaurarlo ya se probó.
- **Rendimiento** (hist. §161): SQLite en WAL, un índice en cada relación y
  topes por IP. Con 20 personas a la vez responde en ~20 ms.
- **Seguridad:** contraseñas con scrypt, sesiones revocables, cada negocio
  aislado, el empleado no ve los costos, auditoría de todo, tokens de las
  integraciones cifrados, CSP y código por mail para crear la cuenta.
- **Factura electrónica** probada en homologación (A, B y nota de crédito, con
  las reglas de ARCA repasadas en hist. §190).
- **Planes** Gratis, Emprendedor y Pro, con sus topes; pasar a uno pago hoy
  es manual.

## 2. Servidor, base de datos e IA

**El riesgo más grande hoy:** el respaldo es diario. Si el disco se rompe a
las 19 h, se pierden las ventas del día de todos los negocios.

- [ ] **(C) Litestream** (gratis): copia cada cambio de la base a Backblaze en
  segundos. Cierra ese riesgo sin esperar lo demás. Es lo primero de esta
  etapa (o antes, si el equipo lo decide).
- [ ] **(U+C) Servidor pago.** La capa gratis de Oracle no tiene garantía y
  puede recuperar la máquina. **Preliminar:** AWS en São Paulo (~30 ms desde
  Argentina), un EC2 de 2 núcleos y 2 GB, **~USD 15–20/mes**. DigitalOcean es
  más simple y parecido de precio, pero no tiene región en Sudamérica
  (~140 ms). Seguir en Oracle pagando también es posible.
- [ ] **(U+C) Un servidor de prueba (staging)**, **~USD 5–10/mes**: hoy lo
  que entra a `main` va directo a producción, con la base real.
- [ ] **(U+C) Postgres administrado.** SQLite alcanza para el tamaño de hoy;
  lo que gana Postgres administrado: volver a cualquier minuto de los últimos
  7 días, los datos aparte de la app, dos servidores de app a la vez (sin
  cortes al actualizar) y **el aislamiento entre negocios garantizado por la
  base** (Row-Level Security por `organizacion_id`), que es un argumento de
  seguridad para los clientes.
  - **El costo real es el trabajo:** `server.js` tiene ~1.278 consultas
    escritas para SQLite (síncronas); Postgres es asíncrono, así que hay que
    reescribir el acceso a datos y volver a probarlo. Varias semanas de
    sesiones; se planifica como etapa (§27, §34).
  - **Preliminar, RDS (AWS São Paulo):** la base más chica, con recuperación
    al minuto de 7 días incluida, **~USD 25–30/mes**; duplicada en dos zonas,
    el doble (para cuando haya unos 50 clientes).
  - **Preliminar, Supabase:** Postgres de verdad, en São Paulo, y lo conocen
    por Vrader. El plan Pro (~USD 25) trae respaldos diarios; la recuperación
    al minuto es un agregado de **~USD 100/mes**, así que con ella sale
    **~USD 125+**. Trae login, archivos y una API automática que Nexo no usa
    (la API hay que apagarla). No corre el servidor de Nexo: igual hace falta
    uno aparte.
  - Recomendación preliminar: RDS, por precio. Supabase si pesa mucho su
    panel, y siempre con la recuperación al minuto.
- [ ] **(C) Paginar las listas largas** (§35): ventas, compras, movimientos de
  stock y auditoría.
- [ ] **(U) Practicar el plan de emergencia** una vez por mes: restaurar el
  respaldo en una máquina de prueba y anotar cuánto tardó.
- [ ] **(U+C) IA paga.** Groq gratis da ~100 frases por día para *todo*
  Nexo: con 10 clientes Pro no alcanza. Pagando por uso, una frase cuesta
  fracciones de centavo de dólar (mil frases, ~USD 1; el audio, centavos por
  hora): **por cliente son centavos por mes**. Se gana: sin tope diario, un
  modelo más grande para lo difícil (leer facturas de proveedores) y Gemini
  pago de respaldo, que no usa los datos (el gratis puede: sacarlo). Un
  **cupo por plan**, porque la IA es lo único que crece con el uso.

## 3. Seguridad

- [ ] **(C) Verificación en dos pasos** (2FA) para los administradores, con
  una app de códigos (`node:crypto`, sin dependencias).
- [ ] **(C) Topes generales** de tamaño y de cantidad de pedidos por persona
  (§35), no solo en el login.
- [ ] **(U+C) El servidor endurecido:** ssh solo con llave, firewall,
  actualizaciones automáticas de seguridad, fail2ban y HSTS en Caddy.
- [ ] **(C) `npm audit` en el CI** y los avisos de dependencias de GitHub.
- [ ] **(U+C) El certificado de ARCA de Nexo**, lo más delicado: solo en el
  servidor, con permisos cerrados y un plan si se filtra.
- [ ] **(C) Una revisión de seguridad completa** antes de vender, con una
  prueba de que un negocio no puede ver datos de otro.
- [ ] **(U) Hacer privado el repo de GitHub.** Hoy es público (organización
  Code7C26); el 17 de noviembre se revisó el historial y no hay claves
  subidas. **Antes de cambiarlo**, darle al servidor una llave de solo lectura
  (deploy key), o las actualizaciones dejan de llegar. A los profesores, como
  colaboradores de solo lectura. Las Actions privadas tienen 2.000 minutos por
  mes, que alcanzan para el CI.
- [ ] **(U) Cloudflare** en su plan gratis delante del sitio (contra ataques
  que lo tiran); el pago (~USD 20), más adelante.
- Una prueba de seguridad externa paga, cuando entren clientes grandes.

## 4. Integraciones y ARCA en producción

Que no fallen nunca es imposible (dependen de otros); que **se recuperen
solas y avisen**, sí.

- [ ] **(U) ARCA en producción:** el CUIT de Nexo, clave fiscal nivel 3 y un
  certificado de producción (lo arma Claude; se sube en "Administración de
  Certificados Digitales" y se asocia a Facturación Electrónica en el
  "Administrador de Relaciones"). Después `NEXO_ARCA_CERT`, `NEXO_ARCA_KEY`,
  `NEXO_ARCA_CUIT` y `NEXO_ARCA_AMBIENTE=produccion`. Primera prueba: una
  factura real chica y su nota de crédito. Cada negocio: punto de venta "RECE
  para aplicativo y web services" y la delegación a Nexo.
- [ ] **(C) CAEA**, la contingencia de ARCA para facturar cuando su servicio
  está caído. Hoy la factura queda pendiente y se reintenta.
- [ ] **(C) Lo que quedó del repaso de ARCA** (hist. §190): el tope para
  identificar al consumidor final (el monto, con el contador), el exento o
  monotributista sin CUIT con B (probarlo en homologación) y la "A con
  leyenda" o M de un inscripto nuevo (RG 1575).
- [ ] **(C) Revisión automática cada pocos minutos** de pedidos y pagos de
  Mercado Libre, Tienda Nube y Mercado Pago, por si un aviso no llegó (hoy es
  el botón "Buscar ahora").
- [ ] **(C) Reintentos guardados**, que sobrevivan a un reinicio.
- [ ] **(C) Avisos:** al dueño, cuando una cuenta se desconecta o vence su
  permiso; al equipo, si los errores suben de golpe. Y un estado por
  integración (última sincronización, último error, pendientes).
- [ ] **(U) Pruebas con plata real** pendientes: el QR del mostrador, un pago
  en cuotas, uno con retenciones; Mercado Libre con una cuenta de vendedor
  real; publicar la app de Tienda Nube en su tienda de apps.
- [ ] **(C) Retenciones de Mercado Pago** (§16, §33), recargo por cuotas y
  acreditación diferida.
- Más integraciones, según lo que pidan los clientes: Shopify o WooCommerce
  (con el molde de Tienda Nube), conciliación bancaria importando el extracto
  y el reporte de liquidaciones de los posnet (Payway, Getnet casi no tienen
  API abierta).

## 5. WhatsApp y el asistente

- [ ] **(U) El número real** (el chip) y la verificación del negocio ante
  Meta, con los datos del titular. Hasta verificarlo, unas 250 conversaciones
  iniciadas por día; verificado, sube por escalones.
- Meta cobra los mensajes que inicia Nexo (recordatorios, el resumen del día),
  con plantillas aprobadas; responder dentro de las 24 h es gratis.
- [ ] **(C) Cupo de mensajes por plan.**
- [ ] **(C) El asistente:** comparar períodos, varias preguntas en una y más
  operaciones (cobrar una deuda, pagarle a un proveedor, ajustar stock, armar
  un presupuesto).

## 6. Apps en las tiendas

**Cambia una decisión de CLAUDE.md** (§31 y §39: app nativa, fuera de
alcance). No se reescribe nada: se empaqueta la misma PWA, como §31 deja
abierto.

- [ ] **(U+C) Android:** TWA con PWABuilder o Bubblewrap, **USD 25** una vez.
- [ ] **(U+C) Compu:** ya se instala desde Chrome o Edge; para la Microsoft
  Store, PWABuilder (la cuenta individual sería gratis, a confirmar).
- [ ] **(U+C) iOS:** **USD 99 por año** y una Mac (o compilar en la nube).
  Apple rechaza "una web en una caja": hay que sumarle algo nativo
  (notificaciones, cámara, abrir sin conexión). Después de los primeros
  clientes que paguen.

## 7. Los planes y cómo se cobran

- [ ] **(C) Cobro automático de los planes con Mercado Pago** (suscripción
  mensual). Es lo que más falta para vender. Hoy el negocio pide el plan desde
  Configuración → Plan, la consulta cae en el CRM y alguien corre `npm run
  plan` en el servidor (hist. §98). Falta: el débito mensual, los 14 días de
  prueba que pasan solos a cobro, qué pasa si no paga (avisos, días de gracia
  y vuelta a Gratis, con lo conectado en pausa, como hist. §153) y la página
  de "Tu plan" con las facturas de la suscripción.
- [ ] **(U) Facturarle la suscripción a cada cliente,** con el mismo CUIT del
  punto 4. Como monotributistas, la factura es C: a un cliente inscripto no le
  sirve como crédito fiscal, y la competencia factura A más IVA. Tenerlo en
  cuenta al comparar precios.
- [ ] **(U) Revisar la estructura de los planes** (usuario, 17 de noviembre):
  Praxia suma precio por cada sucursal y cada caja. Ideas para decidir:
  - agregados que se pagan aparte: sucursal o caja extra, usuarios extra, un
    paquete de IA o de WhatsApp, así el precio acompaña lo que cuesta cada
    cliente;
  - ajuste de precios cada tres meses, avisado, por la inflación (un plan
    anual en pesos es riesgoso);
  - Gratis con topes como puerta de entrada, y Pro como el plan de la IA.

## 8. Legal y administrativo

- [ ] **(U) Contador y monotributo** (o sociedad): destraba ARCA en
  producción y facturar las suscripciones. **Los topes del monotributo**
  (anuales, vigentes desde agosto de 2026, según ARCA): A $ 12.009.410, B
  $ 17.595.183, C $ 24.670.494, D $ 30.628.651, E $ 36.028.231, F
  $ 45.151.659, G $ 53.995.799, H $ 81.924.660, I $ 91.699.762, J
  $ 105.012.519 y K $ 126.610.839. La A alcanza para unos 50 clientes de
  Emprendedor; la K, para unos 500. La cuota mensual de cada categoría la da
  el contador.
- [ ] **(U) Los datos del titular** en `/etc/nexo/nexo.env`
  (`NEXO_TITULAR_NOMBRE`, `NEXO_TITULAR_CUIL`, `NEXO_TITULAR_DOMICILIO`). Sin
  ellos, `/terminos` y `/privacidad` dicen "a completar". Al cambiarlos, todas
  las cuentas aceptan de nuevo una vez.
- [ ] **(U) Un abogado** para los términos y la privacidad (hoy borradores),
  que digan que cada negocio responde por sus datos fiscales.
- [ ] **(U) Inscribir la base de datos en la AAIP** (Ley 25.326), gratis, con
  clave fiscal.
- [ ] **(U) La marca en el INPI** (clases 9 y 42). "Nexo" es un nombre muy
  usado: **revisar pronto** si otra empresa de software la tiene, antes de
  carteles y tiendas de apps.
- [ ] **(U) El software en la DNDA** (derecho de autor, por TAD).

## 9. Dominio, mail y operación

- [ ] **(U) Dominio propio** (`.com.ar` en NIC Argentina). Después,
  `NEXO_URL_PUBLICA`, el Caddyfile y las direcciones en Mercado Pago, Mercado
  Libre, Tienda Nube, Meta y Google.
- [ ] **(U+C) Mail para aplicaciones** con el dominio (Postmark o Resend,
  ~USD 15/mes, o el plan gratis de Brevo), con SPF y DKIM: que las facturas
  lleguen y no caigan en spam. `backend/mail.js` ya manda por SMTP.
- [ ] **(U) Aviso si el sitio se cae** (UptimeRobot o Better Stack).
- [ ] **(C) Los errores, a la vista:** un resumen diario por mail, y que los
  errores del navegador de los clientes también lleguen al servidor (o
  Sentry, ~USD 26/mes).
- [ ] **(C) Pruebas de punta a punta** de lo crítico (cobrar, facturar,
  cerrar la caja) en el servidor de prueba antes de cada publicación, y un
  chequeo nocturno de que los saldos den lo mismo que sus movimientos.
- [ ] **(C) Una prueba de carga** antes de abrir la publicidad, y sacar el
  `noindex` del Caddyfile.
- [ ] **(U) Soporte:** un canal con horario (WhatsApp o mail) y videos cortos
  de un minuto por tarea. "Avisar un problema" ya existe.
- [ ] **(U) Acompañar a los primeros 3 a 5 clientes** de cerca: lo que pidan
  ordena el resto de la lista.
- [ ] **(C) Medir:** cuántos registrados llegan a la primera venta, cuántos
  siguen al mes, cuántos pasan a un plan pago (en Plataforma).

## 10. Costos y cuántos clientes hacen falta

**Preliminar, por mes, solo infraestructura:**

| Qué | Aprox./mes |
|---|---|
| Servidor (AWS São Paulo) | USD 15–20 |
| Servidor de prueba | USD 5–10 |
| Postgres administrado (RDS) | USD 25–30 |
| Mail para aplicaciones | USD 0–15 |
| IA paga | USD 5–20 |
| Errores (Sentry) | USD 0–26 |
| Litestream + Backblaze | centavos |
| **Total** | **USD 70–120** |

Más: contador (~$ 45.000/mes según el Informe Económico), la cuota del
monotributo, el dominio (anual), el abogado (una vez), el INPI, Google Play
(USD 25, una vez) y Apple (USD 99/año, más adelante).

- [ ] **(U+C) Rehacer el Análisis Financiero** (`docs/classroom/Análisis
  Financiero y Punto de Equilibrio — Nexo.pdf`) con estos costos. Base de
  octubre: margen de ~$ 18.000 por cliente de Emprendedor ($ 19.900 menos la
  comisión de Mercado Pago, 7,25 %); 5 clientes cubren servidor, dominio y
  contador; 84 clientes pagan además el sueldo base de los dos (o 56 si el
  promedio llega a $ 29.900 con parte en Pro).

## 11. Las reglas de CLAUDE.md que cambiarían

Anotadas sin tocarlas hasta que se decida escalar:

- **El preámbulo:** "la única restricción real es de costo (evitar
  dependencias pagas o infraestructura cara)".
- **§34:** se sigue con SQLite hasta que haga falta Postgres.
- **§31 y §39:** la app nativa en las tiendas, fuera de alcance.
- **Stack técnico:** "dependencias de producción reales: `express` y
  `@google/genai`" (Postgres suma `pg`).

## 12. En qué orden

1. **Al decidir escalar, sin depender de nada más:** Litestream, el repo
   privado (con la deploy key primero), el aviso de caídas, lo básico de
   seguridad (2FA, el servidor endurecido, `npm audit`), la AAIP y revisar la
   marca en el INPI.
2. **Para poder vender:** contador y monotributo, ARCA en producción, el cobro
   automático de los planes, el servidor pago con su servidor de prueba, el
   dominio con su mail y el abogado.
3. **Con los primeros clientes:** integraciones que se recuperan solas, el
   CAEA, la IA paga con cupos, WhatsApp con el número real, Android y la
   Microsoft Store, y la migración a Postgres.
4. **Después:** iOS, más integraciones y los planes con agregados.
