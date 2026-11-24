# Gymdesk: competencia e inspiración para gimnasios

Investigado el 19 de noviembre de 2026, de su propio sitio (gymdesk.com:
`/pricing`, `/software/martial-arts`, `/llms.txt`, las páginas de cobros) y de
Capterra y Software Advice. El usuario lo descubrió buscando para el primer
piloto de Nexo: el gimnasio de artes marciales donde entrena.

**En una línea:** un sistema de EE. UU. hecho solo para gimnasios, nacido en
2016 de un cinturón negro de BJJ, con fuerte foco en artes marciales. Dice
tener más de 4.500 gimnasios en 30+ países y 4,8/5 en Capterra (donde
figura con su nombre viejo, "Martial Arts on Rails"). Se fusionó con
Smoothcomp (torneos).

## Precios (USD por mes, sin contrato)

Se paga por el tamaño del gimnasio, no por funciones: todas las funciones en
todos los planes, personal ilimitado, sin costo de alta ni de baja, 30 días
de prueba sin tarjeta.

| Plan | Socios activos | Con su procesador de pagos | Con otro |
|---|---|---|---|
| Micro | hasta 50 | 75 | 100 |
| Small | 51–100 | 100 | 125 |
| Medium | 101–150 | 150 | 175 |
| Large | 151–250 | 200 | 240 |
| Enterprise | 251+ | a consultar | a consultar |

Cuentan solo los socios activos: no los congelados, los dados de baja, los
de una clase suelta ni los interesados. Agregados: segunda sede (USD 50–100),
control de puerta (USD 100 hasta 3 puertas), app con la marca del gimnasio
(USD 100).

## Qué tiene

- **Cuotas:** débito automático con tarjeta, reintento de los pagos
  rechazados, recargo por mora, cortar el ingreso al que debe, planes
  familiares con precio que se ajusta, cobro automático del examen.
- **Asistencia:** pantalla de entrada (kiosco), código QR o la app; aviso de
  los alumnos que dejan de venir.
- **Clases y reservas:** grilla de clases recurrentes, reserva desde el
  celular, cupo, lista de espera, clase suelta con su precio.
- **Grados (lo más fuerte para artes marciales):** cada disciplina tiene su
  sistema de cinturones; cada grado pide clases, horas, tiempo en el grado,
  técnicas o edad. Sigue a cada alumno, da las rayas solo (o las da el
  profe) y muestra quién está listo para rendir. Un alumno puede tener azul
  en BJJ y amarillo en judo.
- **App del socio:** reservar, marcar la entrada, ver su progreso de
  cinturón, anotarse a torneos. Una sola cuenta por familia para los chicos.
- **Página web** del gimnasio con la grilla, la clase de prueba y el pago.
- **Marketing:** interesados, mensajes automáticos (bienvenida,
  recordatorios, felicitar un ascenso), mail, SMS, referidos, reseñas.
- **Reportes:** ingresos, asistencia, previsión de ingresos, socios en
  riesgo de irse.
- **Punto de venta** con stock (uniformes, guantes, bebidas), con cargo a la
  cuenta del socio.
- **Deslinde de responsabilidad** firmado (el "waiver").
- No dice nada de sueldos de profes, videos del programa ni cómo se arma un
  examen (solo cobra su derecho).

## Lo que no tiene para un gimnasio de acá

- **Argentina no aparece.** Cobra con procesadores de EE. UU., Canadá,
  Europa y Oceanía (Stripe, Square, GoCardless…): **no hay Mercado Pago** ni
  nada latinoamericano.
- **No factura con ARCA**, no maneja pesos ni IVA.
- Precio en dólares: el plan más chico son USD 75 por mes.
- Es solo del gimnasio: no tiene compras a proveedores, cuentas corrientes,
  tesorería ni gastos como un sistema de gestión.

## Nexo hoy, contra Gymdesk

Ya hecho en el módulo de socios (`planes_socio`, `cuotas_socio`,
`ingresos_socio` en `backend/db/schema.sql`) y el resto de Nexo:

- Planes por actividad con precio por duración (mensual, trimestral, anual),
  varios planes por socio, descuentos por combo, por cantidad o a mano
  (familiar, estudiante), cuotas que se generan solas y cada una es una venta.
- Recepción y pantalla de entrada que avisa si el socio está al día.
- Punto de venta con stock, caja, factura electrónica, Mercado Pago (QR y
  link), cuentas corrientes, gastos, profes como empleados con fichaje y
  horarios, el Resumen, el asistente por texto, voz y WhatsApp.

Lo que Gymdesk tiene y Nexo no (candidatos, **solo si el piloto los
necesita**; regla del 19 de noviembre, `plan-para-vender.md` punto 12):

1. **Grilla de clases** con profe, disciplina y cupo (ya anotada en
   `handoff.md` como idea del usuario del 17 de noviembre).
2. **Asistencia por clase**, no solo por entrada.
3. **Grados y cinturones** por disciplina, con lo que pide cada uno y
   quién está listo para rendir. Es lo que más los distingue en artes
   marciales.
4. **Cuenta familiar:** varios socios que paga uno solo.
5. **Débito automático** de la cuota (con Mercado Pago, suscripciones) y el
   aviso de deuda por WhatsApp.
6. **Reserva desde el celular** y una página pública del gimnasio.
7. Avisar de los alumnos que dejan de venir.

## Para tomar como inspiración

- **Cobrar por socios activos:** para los gimnasios puede servir como la
  medida del plan. "Todas las funciones en todos los planes", en cambio, no
  va para Nexo (usuario, 19 de noviembre): el plan barato tendría lo que
  nadie usa, y cada rubro se mide distinto (`plan-para-vender.md`, punto 7).
- **Sin costo de alta ni de baja, y "te llevás tus datos cuando quieras".**
  Nexo ya deja descargar el negocio (§28); conviene decirlo en la venta.
- **El argumento de venta de Nexo frente a Gymdesk:** en pesos, con Mercado
  Pago y factura de ARCA, y con todo el negocio (lo que vende, lo que
  compra, la caja) en el mismo lugar que los socios.

Fuentes: [Gymdesk, precios](https://gymdesk.com/pricing) ·
[Gymdesk, artes marciales](https://gymdesk.com/software/martial-arts) ·
[Gymdesk, procesadores de pago](https://gymdesk.com/features/payment-processors) ·
[Capterra](https://www.capterra.com/p/148663/Martial-Arts-on-Rails/) ·
[Software Advice](https://www.softwareadvice.com/membership-management/martial-arts-on-rails-profile)

## Ideas del usuario para artes marciales (19 de noviembre, charladas con Gemini)

Para documentar, no para hacer ahora. La prioridad del usuario: **primero
que el dueño del gimnasio tenga todas las comodidades**; el perfil propio de
cada alumno viene después, porque tiene bastante complejidad y se charla
antes. Sumarlo después puede hacer que los alumnos tengan más ganas de ir,
que sientan el progreso y que el profe se ahorre trabajo.

1. **Perfil competitivo del alumno, que él mismo maneja**
   - Un campo con la URL de su perfil público de Smoothcomp, que se abre con
     un clic.
   - El alumno carga sus torneos, medallas (oro, plata, bronce) y fotos del
     podio; quedan **pendientes** hasta que el profe las aprueba.
   - **Medallero del gimnasio:** ranking interno y los logros históricos de
     la academia, armados solos con esos registros.
2. **Graduaciones y cinturones**
   - Una línea de tiempo con el cinturón actual, los grados o rayas y la
     fecha de cada ascenso.
   - Cuántas clases lleva el alumno desde su última graduación, contadas con
     el ingreso que ya existe (hist. §74, §144).
   - Un aviso al profe cuando un alumno llega a las clases que pide el
     próximo grado o cinturón.
3. **Clases por disciplina y nivel**
   - Etiquetar los horarios de la grilla (BJJ Principiantes, No-Gi,
     Competidores, Infantil) para saber quién puede reservar o entrar según
     su cinturón.

**Cómo encaja en Nexo (mi lectura, para cuando se planifique):**
- Los cinturones y el contador de clases son del dueño y no necesitan que el
  alumno tenga cuenta: van primero. El contador sale de `ingresos_socio`,
  pero para contar clases (no entradas a la sala) hace falta la asistencia
  por clase, que la grilla (hist. §200) ya deja preparada (`clases.activo`,
  cupo).
- El nivel de cada horario hoy es texto libre (`clases.detalle`). Validar
  quién entra según su cinturón pide un nivel mínimo estructurado por
  horario: es un cambio de esquema, se planifica con la asistencia.
- El perfil del alumno es lo más grande: una cuenta de Nexo para el socio
  (hoy las cuentas son del equipo del negocio, §28), con permisos propios y
  la aprobación del profe. Es una etapa aparte.
- El medallero sale de los torneos aprobados; Smoothcomp es solo un enlace
  (su API sería otra integración, §32).

## Asistencia por clase y suplentes (23 de noviembre, antes de diseñarlo)

Cómo lo resuelven los sistemas de gimnasios y de academias:

- **Gymdesk:** la asistencia se prende en la configuración. El alumno se
  anota en la clase desde el kiosco o la app (con su número o su nombre), y
  la recepción puede **marcar a varios de una vez** ("Multiple Check-In") y
  **cargar asistencias de días pasados**. Los grados piden clases, horas o
  días **en el grado**, por programa (cada disciplina con su lista), y el
  alumno aparece como "listo para ascender" con un aviso en el tablero. Cada
  raya es un grado más de la lista.
- **Clubworx:** "Roll call", la lista de la clase que toma el profe.
- **Suplentes** (Gymdesk no lo documenta): en Punchpass se va a la clase de
  ese día y se le pone otro profe, también a varias juntas. En iClassPro el
  suplente queda atado a la clase en esas fechas, y eso alimenta la
  asistencia y las horas del profe. Jackrabbit permite anotar que el profe
  faltó sin poner reemplazo. ActiveNet le paga al suplente por cada fecha.

**Lo que se toma para Nexo:**
1. La clase de un día es su propio registro: qué horario de la grilla, qué
   fecha, si se dio o no, y **quién la dio de verdad** (de partida, los
   profes de la grilla; si es otro, es un suplente).
2. La lista se toma desde la clase, con los que entraron hoy arriba y los que
   suelen venir a esa clase, para marcar de un toque. Se puede cargar un día
   pasado.
3. Las clases de cada alumno se cuentan por actividad (la base de los
   grados), y las de cada profe, con cuántas fueron como suplente.

Fuentes: [Gymdesk, asistencia](https://docs.gymdesk.com/help/attendance-tracking) ·
[Gymdesk, rangos](https://docs.gymdesk.com/help/member-ranks) ·
[Gymdesk, programas](https://docs.gymdesk.com/help/gym-programs) ·
[Clubworx, roll call](https://intercom.help/clubworx/en/articles/2219249-roll-call-for-gyms-pt-and-studios) ·
[Punchpass, suplentes](https://support.punchpass.com/en/articles/3193362-adding-a-substitute-instructor) ·
[iClassPro, suplentes](https://support.iclasspro.com/hc/en-us/articles/4420528113815-How-Do-I-Mark-a-Staff-Member-as-Absent-Assign-a-Substitute-Instructor) ·
[Jackrabbit, suplentes](https://help.jackrabbitclass.com/help/substitutes) ·
[ActiveNet, pago al suplente](https://help.aw.active.com/ActiveNet/standard/en_US/master_ChangeSubstituteInstructorPayroll.htm)

## El ingreso por clase y los profes en la entrada (23 de noviembre de 2026, hist. §228)

El usuario probó la lista de hist. §226 y la corrigió: "Entraron ese día" no
sirve, porque el profe se tiene que acordar quién vino. **El ingreso tiene que
ser por clase.** Además: un alumno que entra a la de las 7 y se queda a la de
las 8 no se distingue, y en los dojos (en El Morro y en muchos otros) a veces
da la clase un alumno, y muchos profes también son alumnos.

Cómo lo resuelven:
- **Gymdesk:** en la pantalla de entrada (Front Desk Mode) "se toca una
  clase antes de poner o pasar el código del socio", y todos los que entran
  después quedan anotados en esa clase. Desde la app del socio se ven "todas
  las clases que le corresponden" y se anota de un toque. El profe pasa lista
  con "Multiple Check-In", que trae solo a los que **deberían** venir a esa
  clase (por su plan y su grado): "tocás a los que vinieron y confirmás".
  Quién da la clase es siempre personal ("Instructors" asignados a cada
  clase); el profe pasa **su propio código en la misma entrada** y eso le
  suma una clase para el pago. Cada clase puede contar más de una para el
  grado ("Session Count"), y los grados cuentan "clases en el grado".
- **Clubworx:** "Class Kiosk" para que los alumnos se anoten solos en la clase
  elegida, que **avanza sola a la siguiente** a medida que pasa el día; y
  "Roll Call" para el profe, con los anotados, "Drop in" para sumar a otro y
  las clases desde el último examen de cada uno.
- **Ninguno** documenta qué pasa con dos clases seguidas ni con un alumno que
  da una clase: en los dos, el que enseña es una cuenta de personal.

**Lo que toma Nexo:**
1. **El socio elige la clase al entrar.** Pone su DNI y la pantalla le
   muestra las clases de ahora (en curso o por empezar), con la próxima ya
   marcada. Puede marcar varias: es la respuesta a la de las 7 y la de las 8.
   Si se olvidó, vuelve a poner el DNI y suma la otra (no es otro ingreso).
2. **El profe se anota en la misma pantalla**, con "Soy profe" y su PIN, como
   el código de personal de Gymdesk. Queda como el que la dio, y si no es el
   de la grilla, como suplente.
3. **Un alumno que da clases** (lo que ninguno resuelve): en su ficha se lo
   marca "Da clases" y pasa a ser también profe, la misma persona. Al entrar
   con su DNI ve "La doy yo" en cada clase.
4. **La lista de la clase** es la de los que se anotaron en ella. El profe o
   la recepción solo corrigen, con el buscador (como el "Drop in" de
   Clubworx), y ya no se adivina por "entraron ese día".

Fuentes: [Gymdesk, asistencia](https://docs.gymdesk.com/help/attendance-tracking) ·
[Gymdesk, personal](https://docs.gymdesk.com/en/help/docs/managers) ·
[Gymdesk, grilla](https://docs.gymdesk.com/en/help/docs/schedule) ·
[Gymdesk, cómo registrar asistencia](https://gymdesk.com/blog/attendance-tracking-methods-for-martial-arts-gym-businesses) ·
[Clubworx, Class Kiosk](https://intercom.help/clubworx/en/articles/455503-using-class-kiosk-mode) ·
[Clubworx, Roll Call para artes marciales](https://intercom.help/clubworx/en/articles/2219238-roll-call-for-martial-arts-studios)
