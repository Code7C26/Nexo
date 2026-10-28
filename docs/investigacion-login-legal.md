# Login, recuperación por mail, términos, privacidad y edad

Investigación del 27 de octubre de 2026, pedida por el usuario antes de seguir
con etapas grandes: "seguridad de login y aceptación de términos y condiciones
o de políticas de privacidad… temas de edad, login, recuperación por mail".
No es asesoramiento legal: es lo que dicen las normas y la práctica, para
decidir con el equipo y, si se puede, confirmarlo con un abogado o un contador.

## 1. Cómo está hoy

**Lo que ya está bien** (no hay que tocarlo):
- contraseñas con scrypt, sal propia, NFKC y comparación en tiempo constante;
- mismo mensaje y mismo tiempo para "no existe" y "contraseña mala";
- sesiones en tabla (se cortan al instante), cookie `httpOnly` + `sameSite`
  y `secure` en producción, 12 h que se renuevan con el uso;
- tope de intentos por usuario (5) y por IP (30) cada 15 minutos, y tope de
  registros por IP;
- cambiar la contraseña cierra las otras sesiones; el admin puede forzar el
  cambio; login y logout se auditan;
- CSP sin scripts inline, `X-Frame-Options`, `nosniff`, `Referrer-Policy`.

**Lo que falta**, de más grave a menos:
1. **Ningún usuario tiene mail.** Si el único admin de un negocio se olvida la
   contraseña, pierde el negocio: no hay forma de recuperarla sin entrar a la
   base del servidor. Con la landing pública y el plan gratis, esto va a
   pasar en la primera semana.
2. **No hay términos y condiciones ni registro de que alguien aceptó algo.**
   La privacidad existe (`/privacidad`) pero es un borrador, nadie la acepta y
   no dice quién es el responsable de los datos.
3. **No se pregunta la edad**, y el público incluye a chicos del colegio.
4. **No hay forma de dar de baja la cuenta ni el negocio** (derecho de
   supresión de la Ley 25.326 y "botón de baja").
5. El registro no verifica nada: cualquiera crea cuentas (solo lo frena el
   tope por IP).
6. Sin segundo factor (2FA) ni aviso de "entraron a tu cuenta".

## 2. Lo legal

### 2.1 Quién es "Nexo" ante la ley (decisión del equipo)

Los términos, la privacidad y la inscripción de la base necesitan una persona
real como titular: nombre, DNI o CUIL/CUIT, domicilio y un mail de contacto.

**Decidido el 27 de octubre: el titular es Santino Solla** (19 años, mayor de
edad).
- No hace falta estar inscripto en ARCA para ser titular de los términos ni
  responsable de la base. La inscripción (monotributo) recién hace falta para
  cobrar los planes, porque hay que facturarlos: eso se charla con un
  contador antes del primer cliente que pague.
- Para el trámite de la AAIP alcanza la clave fiscal (la da la app Mi ARCA
  validando el DNI), que se saca con el CUIL, sin estar inscripto en nada.
- Como persona, responde con su patrimonio. Una SAS separa eso, y se arma
  online cuando haya ingresos.
- **El domicilio no va al repo**, que es público: los datos del titular
  salen de variables de entorno (`NEXO_TITULAR_*`) y se completan en las
  páginas al servirlas.

### 2.2 Ley 25.326 de Protección de Datos Personales

Nexo cumple dos papeles distintos, y los textos tienen que separarlos:
- **Responsable** de los datos de las cuentas (nombre, usuario, mail, la
  auditoría de entradas) y de las consultas de la landing.
- **Encargado del tratamiento** (art. 25, "prestación de servicios
  informatizados") de lo que cada negocio carga sobre sus clientes y
  proveedores. Ahí el responsable es el negocio. El art. 25 obliga a Nexo a
  usar esos datos solo para prestar el servicio, no cederlos y destruirlos al
  terminar el contrato. **Los términos son ese contrato.**

Lo que pide la ley y cómo se cumple:

| Qué pide | Dónde | Cómo en Nexo |
|---|---|---|
| Consentimiento libre, expreso e informado (art. 5) | Alta de cuenta | Casilla sin marcar "Leí y acepto los términos y la política de privacidad", con la versión y la fecha guardadas |
| Informar finalidad, destinatarios, responsable y derechos (art. 6) | Privacidad | Completar el borrador: titular, domicilio, mail, para qué, a quién se manda (Gemini, el hosting, el servicio de mail) |
| Acceso en 10 días corridos (art. 14); corrección y supresión en 5 días hábiles (art. 16) | Privacidad + app | Pedido por el formulario o el mail; "Descargar mis datos" y "Dar de baja" en la app |
| Seguridad y confidencialidad (arts. 9 y 10) | Servidor | Ya hay mucho; la AAIP publica medidas recomendadas (Res. 47/2018): control de acceso, respaldo, registro de incidentes |
| Transferencia internacional (art. 12) | Privacidad | Gemini (Google, EE. UU.) y el hosting: EE. UU. no es país "adecuado". Se cubre con el consentimiento informado y con los términos del proveedor; las cláusulas modelo están en la Disp. 60/2016 y la Res. AAIP 198/2023 |
| Publicidad (art. 27) | Alta | Si algún día se mandan novedades por mail: casilla aparte, sin marcar, y "dejar de recibir" en cada mail |
| Inscripción de la base | Trámite | Registro Nacional de Bases de Datos de la AAIP: **gratis**, por Trámites a Distancia con clave fiscal nivel 2 del titular. Sin inscribir, la base es "ilícita" para la ley |

**Gemini, ojo:** el plan gratis de la API de Gemini permite a Google usar lo
que se le manda para mejorar sus productos, y puede leerlo una persona. Hoy al
asistente le llegan el texto que escribe el usuario y los nombres de
productos, cuentas y categorías. La privacidad tiene que decirlo con todas las
letras, y en producción conviene la API paga (que no usa los datos). Ver 2.6.

### 2.6 Gemini para todos los negocios (pregunta del usuario, 27 de octubre)

Con la clave gratis, los límites (unos pocos pedidos por minuto y un tope por
día) son **de toda la clave**: los comparten todos los negocios de Nexo, y con
diez usuarios a la vez ya no alcanzan. Las opciones:

| Opción | Problema |
|---|---|
| Seguir con la clave gratis | Se queda sin cuota con pocos usuarios, y Google usa los datos |
| Que cada negocio cargue su propia clave | Nadie del público de Nexo sabe sacar una clave de Google; el asistente dejaría de ser "escribir y listo" |
| Otro proveedor gratis (Groq, OpenRouter) | Los mismos límites y otra integración que mantener |
| **Una sola clave de Nexo, en el plan pago, con topes por plan** | Cuesta plata, pero poca y controlada |

**Recomendación: la última.** Precios pagos de Google (octubre de 2026, por
millón de tokens): `gemini-3.6-flash`, el de hoy, US$ 0,75 de entrada y 3,75
de salida, **el doble desde el 1 de enero de 2027**; `gemini-3.1-flash-lite`,
US$ 0,25 y 1,50. Cada frase del asistente manda unos 2.000 a 3.000 tokens
(instrucciones, herramientas y hasta 300 productos) y recibe pocos. Eso da
unos **US$ 2 cada 1.000 frases con Flash-Lite y US$ 5 con Flash** (10 desde
enero). Un negocio que lo usa 20 veces por día gasta entre US$ 1 y 3 por mes.

Cómo se controla:
- un tope nuevo por plan, `asistente_mes`, en `backend/planes.js`, con el
  mismo mecanismo que los demás topes;
- un tope diario de toda la plataforma en el servidor, como freno de
  emergencia;
- el modelo en una variable (`NEXO_GEMINI_MODELO`), probando Flash-Lite contra
  Flash con unas 30 frases reales antes de cambiar, y el "pensamiento" del
  modelo al mínimo (se cobra como salida);
- una alerta de presupuesto en la facturación de Google Cloud.

Para la demo del 2 de noviembre alcanza la clave gratis. El plan pago se
activa antes de abrir la landing al público: hay que cargar una tarjeta en
Google AI Studio.

### 2.3 Términos y condiciones: qué tienen que decir

- quién presta el servicio (titular) y cómo contactarlo;
- qué es Nexo, los planes, la prueba de 14 días (`DIAS_PRUEBA`) y qué pasa al vencer (queda en
  Gratis sin borrar nada — ya es así);
- edad mínima y autorización de los padres (2.5);
- obligaciones del usuario: datos verdaderos, cuidar su contraseña, no cargar
  datos de terceros sin derecho, uso lícito;
- los datos del negocio son del negocio; Nexo es encargado (art. 25) y no los
  usa para otra cosa;
- disponibilidad: sin garantía de servicio continuo, respaldos, qué pasa si se
  pierde algo (limitación de responsabilidad razonable — una cláusula que
  libere de todo es abusiva y nula frente a un consumidor);
- el asistente propone y el usuario confirma: la responsabilidad de lo
  cargado es de quien confirma;
- **Nexo no reemplaza al contador ni a ARCA**: los comprobantes sin CAE no son
  factura;
- baja: cómo se da de baja, qué se puede descargar antes y cuándo se borra;
- cambios en los términos: aviso adentro de la app y nueva aceptación;
- ley argentina y jurisdicción (los tribunales del domicilio del titular, sin
  quitarle al consumidor el suyo).

### 2.4 Defensa del consumidor

- **Botón de arrepentimiento** (Res. SCI 424/2020): quien contrata online
  puede arrepentirse dentro de 10 días, con un enlace visible desde la página
  de inicio y sin pedir login. **Botón de baja** (Res. 316/2018 y sus
  ampliaciones): dar de baja un servicio por la web, sin trámites.
- ¿Aplica a Nexo? A una empresa que usa el software para su actividad, en
  general no: la ley protege al "destinatario final" (fallo Phynx c/
  Microsoft, 2019). Pero muchos clientes de Nexo van a ser personas,
  emprendedores y chicos, donde un juez puede ver un consumidor. Las multas
  por no tener el botón existen y se confirmaron en la Justicia.
- **Recomendación:** cuando haya cobro online, los dos enlaces en el pie de la
  landing ("Botón de arrepentimiento" y "Dar de baja"), que escriben al CRM de
  ventas como el formulario de contacto, y responden con un número de trámite.
  Mientras no se cobre online, alcanza con la baja dentro de la app y un
  enlace "Dar de baja" en el pie.

### 2.5 Edad

- **Código Civil y Comercial:** menor de edad es quien no cumplió 18; desde
  los 13 es adolescente (art. 25). El menor de 16 no puede ejercer un oficio
  o industria ni obligarse sin autorización de sus padres (art. 681); al
  mayor de 16 que trabaja se lo presume autorizado para los contratos de ese
  trabajo (art. 683). Los contratos de escasa cuantía de la vida cotidiana se
  presumen con conformidad de los padres (art. 684).
- **Datos personales:** la Ley 25.326 no fija una edad para consentir. La
  práctica (y la AAIP en sus guías para adolescentes) apunta a no tratar datos
  de menores de 13 y a pedir el aval de un adulto por debajo de 16.
- **Decidido por el usuario el 27 de octubre** (encaja con "un chico que vende
  medialunas en el colegio"):
  - menores de 13: no;
  - de 13 a 17: pueden usar Nexo **Gratis**, con una casilla "Tengo el permiso
    de mi madre, padre o tutor" (con 16 o más que trabaja, se presume);
  - planes pagos: el titular tiene que ser mayor de edad.
  - No se pide la fecha de nacimiento (no hace falta guardarla): una pregunta
    "¿Tenés 18 años o más?" y, si no, la casilla del permiso y "tengo 13 o
    más". Se guarda qué declaró y cuándo.

## 3. Seguridad del login: qué sumar

| Qué | Por qué | Costo |
|---|---|---|
| Mail en la cuenta, verificado | Sin mail no hay recuperación; sin verificar, alguien podría poner el mail de otro | Columna nueva + mail de verificación |
| Recuperar la contraseña por mail | El problema 1 de arriba | Enlace de un solo uso, 30 minutos, guardado como hash; pedirlo responde siempre lo mismo (no revela si el mail existe); usarlo cierra todas las sesiones y avisa por mail |
| Entrar con usuario **o** mail | Nadie se acuerda del usuario | Una condición más en el login |
| Contraseñas comunes rechazadas | NIST 800-63B-4 pide comparar con listas de contraseñas filtradas; "12345678" hoy pasa | Lista de las ~10.000 más comunes en un archivo, sin servicio externo |
| Mínimo de 8, sin reglas de "una mayúscula" | NIST pide 15 si la contraseña es el único factor y 8 con 2FA. 15 espanta a un comercio: 8 + lista de comunes + 2FA opcional es el equilibrio | Nada |
| Mostrar contraseña (ojito) y gestor de contraseñas | Menos errores al tipear en el celular | `autocomplete` correcto en los formularios |
| Aviso por mail al cambiar la contraseña o el mail | El dueño se entera si alguien le tomó la cuenta | Un mail |
| Registro con campo trampa y apagable | Bots; una instalación de un solo comercio no quiere registro público (pendiente de §28) | `NEXO_REGISTRO=off` + el campo trampa que ya usa el contacto |
| Dar de baja la cuenta o el negocio | Ley 25.326 (supresión) y botón de baja | Descargar los datos antes, y borrar a los 30 días |
| 2FA con app (TOTP), opcional | Lo esperable en un sistema con plata | `node:crypto` alcanza (HMAC-SHA1), sin dependencias. **Después** |
| Sesiones abiertas y "cerrar en todos lados" | Celular perdido | Lista desde `sesiones`. **Después** |
| HSTS y cookie `__Host-` en producción | HTTPS obligatorio | Ya planeado en la Fase 4 (publicación) |

## 4. El mail

| Opción | Gratis | Necesita dominio propio | Comentario |
|---|---|---|---|
| **Gmail por SMTP con contraseña de aplicación** | 500 destinatarios por día | No | Sale de la cuenta de Nexo, llega bien (Google lo firma). Pide verificación en dos pasos en esa cuenta |
| Brevo | 300 por día | Conviene | Sin dominio, mandar "desde" un Gmail falla las verificaciones y cae en spam |
| Resend | 100 por día | Sí | DuckDNS no deja cargar los registros de mail (SPF, DKIM) |

**Recomendación:** Gmail por SMTP ahora, con un cliente SMTP propio sobre
`node:tls` (unas 100 líneas, **sin dependencia nueva**), y `NEXO_MAIL=stub`
para los tests, que guarda los mails en una carpeta en vez de mandarlos (como
`NEXO_INTERPRETE=stub`). El día que haya dominio propio se pasa a Brevo o
Resend cambiando solo `backend/mail.js`.

**Lo que tiene que hacer el usuario** (sin pasar la clave por el chat):
1. Entrar a la cuenta de Gmail de Nexo y confirmar que tenga un teléfono y un
   mail de recuperación (si Google la bloquea, se cae el mail de Nexo).
2. myaccount.google.com/security → "Verificación en dos pasos" → activarla.
3. myaccount.google.com/apppasswords → nombre "Nexo servidor" → Crear. Google
   muestra una vez 16 letras en cuatro grupos.
4. En la raíz del repo, copiar `.env.example` a `.env` y completar
   `NEXO_SMTP_USUARIO` (el mail) y `NEXO_SMTP_CLAVE` (las 16 letras, sin
   espacios), sin el `#` adelante. `.env` está en `.gitignore`.
5. Si la clave se filtra, se borra desde la misma página y se crea otra.
   Cambiar la contraseña de la cuenta de Google también las borra.

Si "Contraseñas de aplicaciones" dice que no está disponible: falta la
verificación en dos pasos, o la cuenta tiene la Protección avanzada.

**Hecho el 27 de octubre:** la cuenta es `nexosystem.app@gmail.com`, con la
clave en el `.env` de Santino. `backend/mail.js` (SMTP propio sobre
`node:tls`) ya manda: `npm run probar-mail` desde la raíz le manda un mail
de prueba a la misma cuenta, o a otra con `npm run probar-mail -- otro@mail.com`.
Al publicar, el `.env` del servidor necesita las mismas dos variables.

## 5. Plan de implementación

Cinco fases, un commit y un § del histórico cada una. Las migraciones son
aditivas (CLAUDE.md §34: columnas nulables y tablas nuevas), salvo un rebuild
de `usuarios` en la Fase 1b.

### Decisión del usuario (27 de octubre): cada persona tiene su cuenta, con mail

"Creo que deben tener mail, muchas empresas tienen un mail propio en la
computadora dividiendo las partes (administración, marketing, etc.) y estaría
bueno que ingresen con mail." Y: "cada usuario debería tener su cuenta y ya
después un usuario administrador de un negocio puede habilitar a otro para ser
empleado, desde Configuración, que se puedan mandar solicitudes a usuarios
verificados."

Reemplaza lo de "usuario o mail" y "empleados sin mail" de la primera versión
de este plan:
- **Se entra con el mail.** El usuario de hoy deja de pedirse en el alta. Las
  cuentas viejas lo siguen aceptando en el login solo para no dejar a nadie
  afuera, pero la pantalla dice "Mail".
- **Toda cuenta tiene mail.** La que no tiene (todas las de hoy) lo carga al
  entrar, en una página que no se saltea, como el cambio de contraseña
  forzado. Puede seguir trabajando mientras no lo verifica, con un aviso.
- **Una cuenta es de una persona, no de un negocio.** Se crea sola (nombre,
  mail, contraseña) y después crea su negocio o espera que la sumen a uno.
- **El admin ya no crea empleados con usuario y contraseña.** Desde
  Configuración → Usuarios, "Invitar" con el mail y el rol. La persona acepta
  o rechaza la solicitud adentro de Nexo.
- **Solo a mails verificados:** la solicitud aparece únicamente en la cuenta
  que verificó ese mail. Así nadie se queda con una invitación ajena creando
  una cuenta con el mail de otro.
- **Si el mail todavía no tiene cuenta** (decidido acá): le llega un mail para
  crearla, y la solicitud lo espera. Al admin se le contesta igual en los dos
  casos ("le mandamos la invitación"), así Configuración no sirve para
  averiguar quién tiene cuenta en Nexo.

**Fase 1 — mail en la cuenta y login con mail** (hecha, hist. §102; el alta
lo recibe como `email_cuenta`, porque `email` ya era el mail del negocio)
- `backend/mail.js`: hecho (sección 4).
- `usuarios`: `email` (único sin importar mayúsculas cuando no es NULL) y
  `email_verificado` (fecha). Las dos nulables: las cuentas de hoy no tienen.
- Tabla `tokens_cuenta` (usuario, tipo `verificar_email` | `recuperar`, hash
  SHA-256 del token, mail, creado, vence, usado). Es de la cuenta y no del
  negocio, por eso no lleva `organizacion_id`, igual que `sesiones`. La usan
  la verificación (acá) y la recuperación (Fase 2).
- El alta pide nombre, mail y contraseña (sin usuario) y manda la
  verificación. Por dentro, `usuarios.usuario` de una cuenta nueva es su mail,
  así la columna sigue `NOT NULL UNIQUE` sin rebuild.
- Login con el mail. Página obligatoria "Sumá tu mail" para la cuenta que no
  tiene. Mi cuenta: cambiar el mail (pide la contraseña, verifica el nuevo y
  avisa al viejo).
- **Las cuentas de la demo del profe** (`prueba`, `vendedor.prueba`,
  `recepcion.prueba`) chocarían con la página obligatoria. Se les carga un
  mail de la cuenta de Nexo con "+" (`nexosystem.app+prueba@gmail.com`): es un
  mail real que llega a la misma bandeja, así se pueden verificar.

**Fase 1b — invitaciones y cuentas sin negocio** (hecha, hist. §104: sin el
rebuild de `usuarios`, que pasa a la etapa de entrar con Google; el enlace de
la invitación deja el mail confirmado; el reseteo del admin se restringe con
la Fase 2)
- Tabla `invitaciones`: negocio (`organizacion_id NOT NULL`), mail, rol,
  quién invitó, estado (`pendiente`, `aceptada`, `rechazada`, `cancelada`),
  fechas y quién aceptó. Una sola pendiente por negocio y mail (índice
  parcial). Vence a los 14 días, calculado como el "vencido" de los
  presupuestos, sin estado guardado.
- Aceptar suma la fila de `usuario_organizaciones` con ese rol (o reactiva la
  que estaba de baja) y lo audita en el negocio. El admin ve, reenvía y
  cancela las pendientes; sacar a alguien es la baja de siempre.
- **Cuenta sin negocio:** puede entrar, y ve una página con sus solicitudes y
  "Crear mi negocio" (el alta guiada sin el paso de la cuenta, como "Agregar
  negocio"). La sesión sin negocio solo alcanza a `/auth/*`, las invitaciones
  y crear el negocio.
- **Rebuild de `usuarios`:** `organizacion_id` (el negocio donde se creó la
  cuenta, que ya no decide nada desde hist. §77) pasa a nulable, porque una
  cuenta puede nacer sin negocio. Es un `NOT NULL` y SQLite no lo deja sacar
  con `ALTER`: rebuild con el patrón de §34, conservando los ids, que
  referencian `sesiones`, `auditoria` y las demás.
- `POST /api/usuarios` (el alta de empleados con contraseña) deja de existir.
  El admin solo resetea la contraseña de alguien que no verificó su mail; el
  que lo verificó usa "Me olvidé la contraseña".

**Fase 2 — recuperar la contraseña**
- Usa `tokens_cuenta` de la Fase 1.
- `POST /api/auth/recuperar` (respuesta idéntica exista o no, tope por IP y
  por mail), la página `#/restablecer/<token>` y `POST /api/auth/restablecer`.
- Restablecer cierra todas las sesiones, apaga `debe_cambiar_password`,
  marca el mail como verificado, audita y avisa por mail.

**Fase 3 — términos, privacidad y edad**
- Página `/terminos` y privacidad completa, con el titular (dato a completar
  hasta que se decida), Gemini, el hosting y el servicio de mail.
- `usuarios`: `terminos_version`, `terminos_aceptados` (fecha) y `edad`
  (`mayor` | `menor_autorizado`).
- Alta: la pregunta de edad y la casilla de aceptación, sin marcar. Un menor
  solo puede elegir Gratis.
- Quien no aceptó la versión vigente (las cuentas existentes, un empleado
  nuevo, o cuando cambian los términos) ve una página para aceptarlos antes
  de seguir, con el mismo mecanismo que `debe_cambiar_password`.
- Enlaces a términos y privacidad en el pie de la landing, del login y del
  alta.

**Fase 4 — baja**
- "Descargar mis datos" (un archivo con todo lo del negocio) y "Dar de baja
  el negocio": queda inactivo 30 días (se puede volver atrás) y después se
  borra. La baja de una cuenta de persona saca su mail y su nombre, pero la
  auditoría sigue diciendo quién hizo cada cosa.
- `NEXO_REGISTRO=off` y el campo trampa en el alta.

**Después:** entrar con Google (pedido del usuario del 28 de octubre; plan en
`handoff.md`, 8b), 2FA con app para los admins, sesiones abiertas, aviso de
"entraron desde un dispositivo nuevo", botón de arrepentimiento cuando haya
cobro online, y pasar a un servicio de mail con dominio propio.

## 6. Decisiones que no son técnicas

1. ~~Titular legal~~: **Santino** (2.1). Falta que cargue sus datos en `.env`
   (`NEXO_TITULAR_*`, llegan con la Fase 3).
2. ~~Edad~~: **de 13 a 17 en Gratis, con permiso de los padres** (2.5).
3. **El mail de Nexo:** los pasos de la sección 4, que hace el usuario.
4. **Gemini:** recomendado el plan pago con topes por plan (2.6). Falta que el
   usuario confirme y cuántas frases por mes trae cada plan (propuesta: Gratis
   30, Emprendedor 300, Pro 1.500).
5. **Trámite en la AAIP** (gratis, con la clave fiscal de Santino), antes de
   abrir la landing al público.

## Fuentes

- [Ley 25.326 y la AAIP](https://www.argentina.gob.ar/aaip/politica-de-privacidad-de-la-aaip)
- [Inscripción de bases de datos privadas (AAIP)](https://www.argentina.gob.ar/servicio/inscribir-un-responsable-de-bases-de-datos-personales-privadas)
- [Res. AAIP 198/2023, cláusulas modelo de transferencia internacional](https://abogados.com.ar/la-aaip-aprobo-clausulas-contractuales-modelo-para-transferencia-internacional-de-datos-personales/33646)
- [Guías de la AAIP sobre datos de menores (2024)](https://allende.com/en/privacy-and-cybersecurity/the-aaip-published-two-guidelines-to-strengthen-the-protection-of-minors-personal-data-12-13-2024/)
- [Res. SCI 424/2020, botón de arrepentimiento](https://abogados.com.ar/resolucion-n4242020-de-la-secretaria-de-comercio-interior-boton-de-arrepentimiento/26958)
- [Multa confirmada por no mostrar el botón](https://www.palabrasdelderecho.com.ar/articulo/3991/La-Justicia-confirmo-una-multa-a-dos-empresas-por-no-publicar-en-un-lugar-visible-de-su-web-el-boton-de-arrepentimientos)
- [Botón de baja, Res. 316/2018 y ampliaciones](https://abogados.com.ar/index.php/boton-de-baja-ampliacion-del-listado-de-servicios-incluidos/29353)
- [Phynx c/ Microsoft: software de una empresa no es consumo final](https://aldiaargentina.microjuris.com/2019/10/11/consumidor-o-no-consumidor-la-ley-de-defensa-del-consumidor-es-inaplicable-si-el-software-adquirido-por-la-sociedad-comercial-no-tuvo-destino-de-consumo-final/)
- [Capacidad de los adolescentes en contratos de consumo (UCA)](https://repositorio.uca.edu.ar/bitstream/123456789/17743/1/capacidad-adolescentes-contratos-consumo.pdf)
- [OWASP, Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
- [NIST SP 800-63B-4, contraseñas](https://www.sakimura.org/en/2025/10/7710/)
- [Límites de Gmail SMTP en 2026](https://serversmtp.com/limits-of-gmail-smtp-server/)
- [Brevo, plan gratis de la API](https://www.brevo.com/features/email-api/?rtype=n2go)
- [Resend, plan gratis](https://automationatlas.io/answers/resend-free-tier-explained-2026/)
