// Deja una cuenta Pro lista en un Nexo local para grabar la app con datos:
// la cuenta de "Lola Gómez" con un negocio vacío. Después se suma el negocio
// de ejemplo con `npm run demo -- --url <url> --email <mail> --solo lola`
// (la clave en NEXO_DEMO_CLAVE).
//
// Uso (desde la raíz): node redes/videos/grabar/preparar-demo.mjs <url> <carpeta-de-mails>
import { lectorDeMails, registrarEmpresa } from '../../../backend/test/servidor-de-prueba.js';

const [url, carpetaMails] = process.argv.slice(2);
if (!url || !carpetaMails) {
  console.error('Uso: node redes/videos/grabar/preparar-demo.mjs <url> <carpeta-de-mails>');
  process.exit(1);
}
if (/nexosystem|:3000\b/.test(url)) {
  console.error('Solo sobre un Nexo local de prueba: nunca el real.');
  process.exit(1);
}

await registrarEmpresa(
  { url, leerMails: lectorDeMails(carpetaMails) },
  {
    empresa: 'Cuenta de Lola',
    usuario: 'lola',
    email: 'lola@indumentarialola.com',
    nombre: 'Lola Gómez',
    password: process.env.NEXO_DEMO_CLAVE,
    plan: 'pro'
  }
);
console.log('Cuenta lista: lola@indumentarialola.com');
