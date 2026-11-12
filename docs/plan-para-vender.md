# Nexo en serio: qué falta para operar con clientes reales

Escrito el 12 de noviembre de 2026, después de preparar el servidor para mucha
gente a la vez (hist. §161). Es la lista para cuando se decida vender en serio:
qué hay hoy, qué falta, quién lo hace y cuánto cuesta. Cada punto tiene su
casilla para ir tachando.

**La idea en una línea:** como sistema, Nexo ya está para usarse de verdad. Lo
que falta es casi todo infraestructura, cuentas, trámites y cobro, no
funciones.

Quién hace cada cosa: **(U)** el usuario, porque es un trámite o una cuenta a
su nombre; **(C)** código, que se hace en una sesión de trabajo; **(U+C)** las
dos cosas.

---

## Lo que ya está

- Todas las funciones de §1 a §36 de CLAUDE.md, publicadas en
  https://nexosystem.duckdns.org.
- **Servidor** con HTTPS (Caddy). Se actualiza solo desde `main` con el CI en
  verde y vuelve a la versión anterior si el arranque falla (`docs/publicar.md`).
- **Respaldos:** uno en cada arranque y otro diario a las 3:30. El diario sube
  cifrado a Backblaze B2, y restaurarlo ya se probó.
- **Rendimiento** (hist. §161): SQLite en WAL, un índice en cada relación y
  topes por IP pensados para un wifi compartido. Con 20 personas a la vez
  responde en ~20 ms (medido en la compu contra una base de prueba).
- **Seguridad:** contraseñas con scrypt, sesiones revocables, cada negocio
  aislado, el empleado no ve los costos, auditoría de todo y código por mail
  para crear la cuenta.
- **Mail:** sale desde `nexosystem.app@gmail.com`.
- **Planes** Gratis, Emprendedor y Pro, con sus topes. Pasar a uno pago hoy es
  manual (ver el punto 5).

---

## 1. Servidor

Hoy: Oracle Cloud, capa gratis, **VM.Standard.E2.1.Micro** en San Pablo (AMD,
1/8 de núcleo con ráfagas, 1 GB de memoria y 2 GB de swap). En cálculo puro es
1,8 veces más lenta que la compu de desarrollo, y bajo carga sostenida Oracle
la frena mucho más.

- [ ] **(U) Pasar la cuenta de Oracle a Pay As You Go.** Es lo más urgente:
  Oracle recupera las máquinas gratis que pasan una semana casi sin uso, y con
  clientes reales eso sería un corte total. Pide una tarjeta, pero lo que está
  dentro de la capa gratis sigue sin costo. Conviene poner una alerta de gasto
  en $0 para enterarse si algo empieza a cobrar.
- [ ] **(U+C) Mudarse a la Ampere A1** (también capa gratis: hasta 4 núcleos
  ARM y 24 GB en total). Es otra liga: varias veces más procesador y sin
  frenos por ráfagas. Cómo:
  1. Crear la instancia (Ubuntu 24.04, forma VM.Standard.A1.Flex, por ejemplo
     2 núcleos y 12 GB). Si dice "out of capacity" en San Pablo, se reintenta
     otro día u otro horario.
  2. Seguir "Instalar desde cero" de `docs/publicar.md`: el instalador usa los
     repositorios de NodeSource y de Caddy, que tienen versión ARM (a
     confirmar al hacerlo). Nexo no tiene dependencias nativas, así que corre
     igual en ARM.
  3. Llevar la base con `VACUUM INTO` (nunca copiando el `.db` en uso),
     `/etc/nexo/nexo.env` y las claves de Backblaze.
  4. Apuntar DuckDNS (o el dominio propio) a la IP nueva, probar, y recién
     después apagar la vieja.
- [ ] **(U) Un aviso si el sitio se cae.** Hoy nadie se entera. UptimeRobot o
  Better Stack (gratis) consultan `https://.../api/auth/estado` cada minuto y
  avisan por mail o Telegram.
- [ ] **(C) Los errores, a la vista.** Hoy solo quedan en el registro del
  servidor (`journalctl -u nexo`). Un resumen diario por mail de los errores
  del día, sin servicios pagos.
- [ ] **(U) Practicar el plan de emergencia una vez:** restaurar el respaldo de
  Backblaze en una VM de prueba siguiendo `docs/publicar.md`, y anotar cuánto
  tardó.

## 2. Base de datos

- **SQLite alcanza** para cientos de negocios chicos, que escriben poco cada
  uno. El paso a Postgres (CLAUDE.md §34) es para cuando haya mucha escritura a
  la vez o más de un servidor. No hace falta ahora, y el código ya está
  preparado (todo el SQL vive en `backend/db/` y en `server.js`).
- [ ] **(C) Paginar las listas largas** (§35). `GET /api/ventas` trae todas las
  ventas del negocio: con seis semanas son 68 KB, pero con años de ventas sería
  lento desde el celular. Empezar por ventas, compras, movimientos de stock y
  auditoría.
- [ ] **(U) Repetir la prueba de restaurar** el respaldo cada tanto (por
  ejemplo, una vez por mes).

## 3. Dominio y mail

- [ ] **(U) Dominio propio**, por ejemplo un `.com.ar` en NIC Argentina, que
  se registra con clave fiscal y tiene un costo anual bajo. `duckdns.org` es
  gratis pero no se ve serio, y si DuckDNS se cae, Nexo también. Después hay
  que actualizar `NEXO_URL_PUBLICA`, el Caddyfile y las direcciones cargadas en
  Mercado Pago, Mercado Libre, Tienda Nube, Meta y Google.
- [ ] **(U+C) Un servicio de mail para aplicaciones** con el dominio propio
  (Brevo o Resend tienen plan gratis), con SPF y DKIM configurados. Gmail
  tiene un tope diario, los mails pueden caer en spam, y Google puede bloquear
  una cuenta que manda mails automáticos. Del lado del código casi no cambia
  nada: `backend/mail.js` ya manda por SMTP.
- [ ] **(C) Sacar el `noindex`** del Caddyfile cuando arranque la publicidad,
  para que Google encuentre la landing.

## 4. Servicios externos

| Servicio | Hoy | Qué falta | Quién |
|---|---|---|---|
| **IA** (asistente, voz, facturas de proveedor) | Groq gratis: ~100 frases por día para todo Nexo. Gemini gratis de respaldo, que puede usar los datos | Plan pago por uso de Groq. Gemini en un plan que no use los datos, o sacarlo. Conviene mirar el consumo por negocio antes de abrir Pro a muchos | U |
| **WhatsApp** | App de Meta publicada, con el número de prueba (llega a 5 teléfonos) | El número real (el chip, pasos en el handoff, "Trámites del usuario" → Meta) y la verificación del negocio ante Meta, que pide los datos del titular. Meta cobra los mensajes que inicia Nexo; las respuestas dentro de las 24 h son gratis | U |
| **ARCA** | Factura electrónica probada en homologación (A, B y nota de crédito) | El CUIT de Nexo (el monotributo de Santino o una sociedad), clave fiscal nivel 3 y un certificado de producción; después `NEXO_ARCA_AMBIENTE=produccion`. Cada cliente le delega la factura a Nexo desde ARCA. Se define con un contador (§33) | U+C |
| **Mercado Pago** | El link de pago, probado con plata real (3 de noviembre) | Probar el QR del mostrador con plata real, y un pago con cuotas y otro con retenciones | U |
| **Mercado Libre** | La conexión está hecha | Probarla con una cuenta real de vendedor | U |
| **Tienda Nube** | La app se instala con un enlace ("Para tus clientes") | Publicarla en la tienda de apps de Tienda Nube (pasa por su revisión), para que cualquier tienda la encuentre | U |
| **Entrar con Google** | Funciona | Revisar la pantalla de permisos (logo, nombre, enlaces a términos y privacidad) cuando estén los datos del titular | U |

## 5. Cobrarles a los clientes

Es lo que más falta para vender.

- [ ] **(C) Cobro automático de los planes con Mercado Pago** (suscripciones
  mensuales). Hoy el negocio pide el plan desde Configuración → Plan, la
  consulta cae en el CRM, y alguien corre `npm run plan` en el servidor (hist.
  §98). Falta:
  - el débito mensual;
  - los 14 días de prueba que pasan solos a cobro;
  - qué pasa si no paga: avisos, unos días de gracia y vuelta a Gratis. Lo
    conectado queda en pausa y no se borra nada, como ya hace hist. §153;
  - la página de "Tu plan", con las facturas de la suscripción.
- [ ] **(U) Facturarle la suscripción a cada cliente:** Nexo tiene que estar
  inscripto (el mismo monotributo o sociedad del punto de ARCA). Con eso, la
  factura de la suscripción la puede emitir el propio Nexo.

## 6. Legal

Investigado en `docs/investigacion-login-legal.md`.

- [ ] **(U) Cargar los datos del titular** en `/etc/nexo/nexo.env`:
  `NEXO_TITULAR_NOMBRE`, `NEXO_TITULAR_CUIL` y `NEXO_TITULAR_DOMICILIO`. Ya se
  decidió que el titular es Santino. Sin esos datos, `/terminos` y
  `/privacidad` dicen "a completar", y el servidor lo avisa en cada arranque.
  Al cambiarlos, todas las cuentas aceptan de nuevo una vez.
- [ ] **(U) Revisar los términos y la privacidad**, que son borradores. Lo
  ideal es con un abogado.
- [ ] **(U) Inscribir la base de datos en la AAIP** (Ley 25.326 de datos
  personales). Se hace con clave fiscal y es gratis.
- [ ] **(U) Monotributo o sociedad, con un contador:** destraba ARCA en
  producción y la facturación de las suscripciones. Es el gasto fijo que hay
  que decidir (está en el Análisis Financiero entregado, en `docs/`).

## 7. Soporte y operación

- [ ] **(U) Un canal de soporte con horario,** el WhatsApp o el mail de Nexo.
  "Avisar un problema" ya existe en la app.
- [ ] **(U+C) Qué hacer si algo se rompe:** quién mira el aviso de caída, cómo
  se vuelve a una versión anterior (`docs/publicar.md`) y cómo se les avisa a
  los clientes.
- [ ] **(C) La reserva de negocios de ejemplo** en producción es de 4 por
  tipo. Para un evento se sube con `NEXO_EJEMPLOS_RESERVA` (el comando está en
  hist. §161).

---

## En qué orden

1. **Ya, sin gastar nada:** Pay As You Go, la mudanza a la Ampere A1, el aviso
   de caídas, los datos del titular y la AAIP.
2. **Antes del primer cliente que pague:** monotributo y contador. Eso destraba
   ARCA en producción y facturar las suscripciones. Después, el cobro
   automático con Mercado Pago, el dominio propio con el mail profesional, y
   la IA paga.
3. **Con clientes de verdad:** WhatsApp con el número real y verificado, la app
   de Tienda Nube publicada, y paginar las listas. Postgres, más adelante.
