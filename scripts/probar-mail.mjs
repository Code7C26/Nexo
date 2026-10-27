// Manda un mail de prueba con la configuración de .env (NEXO_SMTP_*), para
// saber si Nexo puede mandar mails antes de que lo necesite un usuario:
//
//   npm run probar-mail                     se lo manda a la misma cuenta de Nexo
//   npm run probar-mail -- otro@mail.com    a otra dirección
//
// No toca la base ni el servidor. Si falla, dice por qué sin mostrar la clave.
import { mandarMail, plantillaMail, mailConfigurado, MailError } from '../backend/mail.js';

if (!mailConfigurado()) {
  console.error('Falta configurar el mail: completá NEXO_SMTP_USUARIO y NEXO_SMTP_CLAVE en el .env de la raíz.');
  process.exit(1);
}

const para = process.argv[2] ?? process.env.NEXO_SMTP_USUARIO.trim();
const { texto, html } = plantillaMail({
  titulo: 'Prueba de mail de Nexo',
  parrafos: [
    'Si estás leyendo esto, Nexo ya puede mandar mails: verificar cuentas, recuperar contraseñas y avisos.',
    `Enviado el ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}.`
  ],
  pie: 'Es un mail de prueba: no hace falta hacer nada.'
});

try {
  await mandarMail({ para, asunto: 'Prueba de mail de Nexo', texto, html });
  console.log(`Mail de prueba enviado a ${para}. Fijate en la bandeja de entrada (y en spam, por las dudas).`);
} catch (err) {
  console.error(err instanceof MailError ? err.message : err);
  process.exit(1);
}
