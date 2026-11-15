# Nexo — Video 5: Un negocio desde cero (borrador del 14 de noviembre de 2026)

- Formato: horizontal 1920x1080 · ~55 s @30fps, sin voz (subtítulos y música
  bajita, como la apertura). Va en una diapositiva, corriendo solo.
- Cómo se hace: la **app real** corre en la compu con `NEXO_MAIL=stub` (el
  código de 6 números sale de la carpeta de mails, no de un mail de verdad) y
  una base temporal; Playwright graba la alta guiada y "Lo que ya tenías"
  con la cuenta de un negocio inventado. Remotion le pone el título de cada
  escena, el zoom, el cursor y el cierre. Datos genéricos: "Lola Indumentaria",
  "Lola Gómez". Nunca una cuenta real.
- Lo que se ve es lo que hace hoy la app: no se agrega nada que no ande.

## Escenas

| # | Seg. | Título en pantalla | Qué pasa |
|---|---|---|---|
| 1 | 0–4 | Tu negocio, listo en **minutos**. | Solo el texto |
| 2 | 4–12 | Creás tu **cuenta**. | Paso 1: nombre, mail, contraseña, "tengo 18" y términos; "Continuar" |
| 3 | 12–17 | Confirmás tu **mail**. | Paso 2: el código de 6 números se escribe y se confirma |
| 4 | 17–22 | Le ponés **nombre**. | Paso 3: "Lola Indumentaria" |
| 5 | 22–30 | Elegís **qué tipo** de negocio es. | Paso 4: las tarjetas (comercio, carnicería, gimnasio, servicios…); el mouse pasa por algunas y elige "Comercio general" |
| 6 | 30–36 | Nexo arma las **secciones**. | Paso 5: las secciones marcadas según el tipo; se prende o apaga una |
| 7 | 36–39 | Los comprobantes, **cuando quieras**. | Paso 6: "Completar después" |
| 8 | 39–44 | ¿Ya venía **funcionando**? | Paso 7: "Sí, quiero cargar lo que ya tengo" → "Crear cuenta" |
| 9 | 44–52 | Cargás lo que **ya tenés**. | Configuración → Lo que ya tenías: stock de hoy con lo que costó, lo que te deben, lo que debés y la plata de cada cuenta |
| 10 | 52–55 | Y arrancás con tus números **de hoy**. | El Resumen ya con cifras; cierre con el logo |

## v2 (14 de noviembre, noche) — la tabla de arriba es la v1, ya no vale

Con las correcciones del usuario: va dentro de una diapositiva, de fondo,
mientras el equipo habla. **26 s**, a pantalla completa, **sin intro, sin outro
y sin música**; el zoom y el cursor se mantienen. Solo hay etiquetas de 2 o 3
palabras, abajo a la izquierda (sin comas): "Tu cuenta", "Tu mail", "Tu
negocio", "El tipo", "Las secciones", "Lo que ya tenías" (de ¿ya venía
funcionando? hasta la carga de deudas y cajas) y "Primeros pasos" (el Resumen).
Hay dos mp4 en `docs/pitch/media/`: `nexo-negocio-desde-cero.mp4` (con
etiquetas) y `nexo-negocio-desde-cero-sin-texto.mp4` (el mismo, sin ningún texto;
el usuario elige).

## Rearmar

1. Nexo local con base vacía: `NEXO_DB_PATH=<base nueva> NEXO_MAIL=stub NEXO_MAIL_DIR=<carpeta> NEXO_ARCA=stub PORT=3111 node backend/server.js`.
2. Desde `redes/`: `node videos/grabar/negocio-desde-cero.mjs <carpeta-de-mails> <salida>` (grabación a ritmo rápido: `RITMO = 0.4`, 35 s crudos) y pasar el webm a mp4 de 30 cuadros con ffmpeg.
3. En el estudio vivo: `public/clips/negocio-desde-cero.mp4` y `src/compositions/negocio-desde-cero.json` (el `escenas.json`). `TRAMOS` en `NexoNegocioDesdeCero.tsx` dice qué tramo, a qué velocidad, con qué zoom y qué etiqueta; `CON_TEXTO = false` saca todo el texto.
4. `npx remotion render src/index.ts NexoNegocioDesdeCero-landscape out/x.mp4 --crf=18`.
