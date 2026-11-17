# Verificación de Google para "Conectar Gmail" (hist. §187)

Para que cualquier negocio conecte su Gmail sin el aviso de "Google no verificó
esta app", Google tiene que aprobar el permiso `gmail.send` de Nexo. Es un
permiso **sensible** (no restringido): la verificación es gratis y no lleva la
auditoría de seguridad paga, que es solo para los permisos que leen mails.

Se hace en el **mismo proyecto de Google Cloud de "Entrar con Google"**: Nexo
usa el mismo cliente (`GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` del `.env`
del servidor). No hay variables nuevas.

## Lo que ya está hecho en el código

- Configuración → Gmail: conectar, mail de prueba, desconectar.
- Pide solo `openid email` y `https://www.googleapis.com/auth/gmail.send`.
- La página `/privacidad` tiene la sección "Si conectás el Gmail de tu negocio"
  con la frase de Uso Limitado que exige Google.
- `nexosystem.duckdns.org` sirve como dominio propio: `duckdns.org` está en la
  lista de sufijos públicos, así que Google trata cada subdominio como un
  dominio aparte.

## Paso 1 — Habilitar la API de Gmail (2 minutos)

1. Entrá a https://console.cloud.google.com con la cuenta dueña del proyecto y
   elegí el proyecto de Nexo arriba a la izquierda.
2. Menú → **APIs y servicios → Biblioteca**. Buscá **Gmail API** y tocá
   **Habilitar**.

## Paso 2 — La dirección de vuelta (2 minutos)

1. Menú → **Google Auth Platform → Clientes**. Abrí el cliente web de Nexo (el
   de "Entrar con Google").
2. En **URIs de redireccionamiento autorizados**, agregá (sin borrar la que ya
   está de `/api/auth/google/vuelta`):
   - `https://nexosystem.duckdns.org/api/gmail/vuelta`
   - `http://localhost:3000/api/gmail/vuelta` (para probar en la compu)
3. **Guardar**. Puede tardar unos minutos en tomar.

## Paso 3 — Sumar el permiso (5 minutos)

1. **Google Auth Platform → Acceso a los datos** (Data Access) → **Agregar o
   quitar permisos**.
2. Buscá `gmail.send` y tildá `.../auth/gmail.send` ("Enviar correos
   electrónicos en tu nombre"). **Actualizar** y **Guardar**. Queda en "Tus
   permisos sensibles".
3. Si pide para qué se usa, pegá el texto de "Justificación" de abajo.

## Paso 4 — Revisar el público (1 minuto)

**Google Auth Platform → Público** (Audience):

- Tipo de usuario: **Externo**.
- Estado de publicación: si dice **En producción**, dejalo así. **No lo pases a
  "En prueba"**: en prueba, "Entrar con Google" deja de andar para todos los
  que no estén en la lista de usuarios de prueba.
- Mientras Google no lo apruebe, conectar Gmail muestra "Google no verificó esta
  app" y sirve para hasta 100 cuentas. Se pasa con **Configuración avanzada →
  Ir a Nexo (no seguro)**. Alcanza para probar y para la presentación.

## Paso 5 — Probarlo vos (cuando esté publicado en el servidor)

Configuración → Gmail → **Conectar Gmail** → elegís tu cuenta → avanzado → Ir a
Nexo → dejás tildado el permiso → **Continuar**. Después **Mandarme un mail de
prueba**, y mandá una factura a otro mail tuyo. Tiene que llegar desde tu Gmail
y quedar en "Enviados".

## Paso 6 — La marca (10 minutos)

**Google Auth Platform → Marca** (Branding):

- Nombre de la app: **Nexo**
- Mail de asistencia: el de Nexo.
- Logo: opcional. Si lo subís, Google revisa la marca aparte (unos días). Tiene
  que ser cuadrado, de 120 × 120: sirve
  `frontend/img/logo/nexo-icono_blanco_fondo-negro.png`, achicado.
- Página principal: `https://nexosystem.duckdns.org`
- Política de privacidad: `https://nexosystem.duckdns.org/privacidad`
- Condiciones del servicio: `https://nexosystem.duckdns.org/terminos`
- Dominios autorizados: `nexosystem.duckdns.org`
- Mail de contacto del desarrollador: el tuyo (ahí llegan las respuestas de
  Google).

## Paso 7 — Probar que el dominio es tuyo (10 minutos)

Google pide que el dominio esté verificado en Search Console **con la misma
cuenta de Google** que es dueña del proyecto.

1. Entrá a https://search.google.com/search-console → **Agregar propiedad** →
   **Prefijo de la URL** → `https://nexosystem.duckdns.org/`.
2. Elegí el método **Archivo HTML**: Google te da un archivo tipo
   `google1a2b3c4d5e6f.html`. Ponelo en `frontend/` (Nexo sirve esa carpeta en
   la raíz), publicalo y tocá **Verificar**. Si me lo pasás, lo hago yo.

## Paso 8 — El video (lo grabás vos, 2 a 3 minutos)

Google pide un video en YouTube (puede ser **Oculto**) que muestre cómo se pide
y se usa el permiso. Conviene grabarlo con Google en inglés (en
myaccount.google.com → Datos personales → Idioma) para que la pantalla de
permisos salga en inglés, que es lo que leen. Guion:

1. Nexo abierto en `https://nexosystem.duckdns.org/app`, con la barra de
   direcciones a la vista. Ir a Configuración → Gmail.
2. Tocar **Conectar Gmail**. En la pantalla de Google, que se vea la URL
   completa (con el `client_id`) y el permiso "Send email on your behalf".
   Aceptar.
3. De vuelta en Nexo: "Conectado a …". Tocar **Mandarme un mail de prueba**.
4. Ir a Facturas → abrir una → **Mandar por mail** → mandar.
5. Abrir Gmail: la factura en **Enviados**, con el PDF adjunto. Abrirla desde la
   casilla del cliente (otra cuenta tuya).
6. Volver a Configuración → Gmail → **Desconectar**.

Se puede narrar o poner subtítulos en inglés; con lo que se ve alcanza.

## Paso 9 — Mandarlo a verificar

**Google Auth Platform → Centro de verificación** (Verification Center) →
**Preparar para la verificación** / **Enviar para verificación**. Completá:

- Justificación del permiso: el texto de abajo.
- Video: el link de YouTube.
- Marcá que leíste la política de datos.

Google contesta por mail al contacto del desarrollador. La marca suele tardar
2 o 3 días hábiles; el permiso, de unos días a algunas semanas. A veces piden
cambios (un texto de la privacidad, otro video): pasámelos y los resolvemos.

Cuando lo aprueben, conectar Gmail ya no muestra el aviso ni tiene el tope de
100 cuentas.

## Textos para pegar (en inglés, que es lo que leen)

**Justificación de `gmail.send`:**

> Nexo is a business management system for small businesses in Argentina
> (inventory, sales, invoicing). A business owner can optionally connect the
> business's Gmail account in Settings → Gmail so that the invoices they issue
> in Nexo are emailed to their customers from the business's own address,
> instead of from Nexo's address. We request gmail.send only to send emails the
> user explicitly triggers in Nexo: an invoice with its PDF attached, to a
> recipient the user chooses, or a test email to their own address. Nexo never
> reads, modifies or deletes messages, and does not access contacts or any
> other Google data. gmail.send is the narrowest scope that allows sending
> email on the user's behalf. The refresh token is encrypted at rest on our
> server and is revoked and deleted when the user disconnects Gmail.

**Para qué usa Nexo los datos de Google (si lo pregunta aparte):**

> We only store the connected email address and an encrypted refresh token.
> Google user data is not sold, shared with third parties, used for
> advertising, or used to train AI models. Our use complies with the Google
> API Services User Data Policy, including the Limited Use requirements, as
> stated in our privacy policy.

## Fuentes

- Permisos de Gmail y su clasificación:
  https://developers.google.com/workspace/gmail/api/auth/scopes
- Verificación de permisos sensibles:
  https://support.google.com/cloud/answer/13463817
- Política de datos del usuario (Uso Limitado):
  https://developers.google.com/terms/api-services-user-data-policy
- Lista de sufijos públicos (duckdns.org): https://publicsuffix.org/list/
