// Términos, privacidad y edad (etapa 8b, Fase 3; docs/investigacion-login-legal.md,
// secciones 2.1 a 2.5).
//
// TERMINOS_VERSION es la fecha de los términos y la privacidad vigentes. Cada
// cuenta guarda qué versión aceptó y cuándo: si se cambia acá, todas las
// cuentas vuelven a ver la página de aceptación antes de seguir (el gate de
// autenticar, en server.js). Se cambia solo por un cambio de fondo en
// terminos.html o privacidad.html, nunca por una coma.
export const TERMINOS_VERSION = '2026-10-28';
const TERMINOS_FECHA_TEXTO = '28 de octubre de 2026';

// Lo que declara la persona sobre su edad (decisión del usuario del 27 de
// octubre, 2.5): no se pide la fecha de nacimiento. De 13 a 17 años entra con
// el permiso de sus padres, y solo en Gratis; menos de 13 no llega a mandarse.
export const EDADES = ['mayor', 'menor_autorizado'];

// La aceptación que llega con el alta de una cuenta o con la página de
// aceptación: { acepta_terminos: true, edad }. `pedirEdad` es false cuando la
// cuenta ya declaró su edad y solo cambiaron los términos.
export function validarAceptacion(cuerpo, { pedirEdad = true } = {}) {
  if (cuerpo?.acepta_terminos !== true) {
    return { error: 'Para seguir, aceptá los términos y la política de privacidad.' };
  }
  if (!pedirEdad) return { edad: null };
  if (!EDADES.includes(cuerpo?.edad)) {
    return { error: 'Contanos si tenés 18 años o más.' };
  }
  return { edad: cuerpo.edad };
}

// El titular de Nexo ante la ley (2.1): Santino. Sus datos no van al repo, que
// es público: salen de NEXO_TITULAR_* (.env) y se completan en las páginas al
// servirlas. Sin mail propio, el de Nexo, que es el que lee el equipo.
function datosTitular() {
  const leer = (nombre) => process.env[nombre]?.trim() || null;
  return {
    nombre: leer('NEXO_TITULAR_NOMBRE'),
    documento: leer('NEXO_TITULAR_CUIL'),
    domicilio: leer('NEXO_TITULAR_DOMICILIO'),
    email: leer('NEXO_TITULAR_EMAIL') || leer('NEXO_SMTP_USUARIO') || 'nexosystem.app@gmail.com'
  };
}

// Qué datos del titular faltan, para el aviso del arranque en producción.
export function titularIncompleto() {
  const titular = datosTitular();
  return ['nombre', 'documento', 'domicilio'].filter((campo) => !titular[campo]);
}

const escaparHtml = (texto) =>
  String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// terminos.html y privacidad.html con los datos del titular, la fecha de la
// versión y los días de prueba. Un dato que falta se ve como "a completar",
// así nunca sale una página con un hueco que nadie note.
export function completarPaginaLegal(html, { diasPrueba }) {
  const titular = datosTitular();
  const dato = (valor) => (valor ? escaparHtml(valor) : '<span class="legal-falta">dato a completar</span>');
  return html
    .replaceAll('%TITULAR_NOMBRE%', dato(titular.nombre))
    .replaceAll('%TITULAR_CUIL%', dato(titular.documento))
    .replaceAll('%TITULAR_DOMICILIO%', dato(titular.domicilio))
    .replaceAll('%TITULAR_EMAIL%', escaparHtml(titular.email))
    .replaceAll('%TERMINOS_FECHA%', TERMINOS_FECHA_TEXTO)
    .replaceAll('%DIAS_PRUEBA%', String(diasPrueba));
}
