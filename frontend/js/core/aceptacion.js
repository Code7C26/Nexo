/**
 * core/aceptacion.js
 * La casilla de los términos y la pregunta de edad (etapa 8b, Fase 3;
 * docs/investigacion-login-legal.md, 2.5). El mismo bloque va en el alta de
 * cuenta (alta.js), en la cuenta que nace de una invitación y en la página que
 * acepta los términos vigentes (sesion.js, que lo carga con import()).
 *
 * El bloque es un [data-aceptacion] de index.html: las respuestas "Sí" y "No"
 * a "¿Tenés 18 años o más?", que con "No" abren (por CSS) las dos casillas de
 * un menor, y la casilla de los términos, sin marcar. No se pide la fecha de
 * nacimiento: el backend guarda solo `mayor` o `menor_autorizado`.
 */

import { limpiarErrores, marcarError } from "./campos.js";

// Un error se va apenas se empieza a corregir (como en core/campos.js con los
// campos de texto): cualquier respuesta en el bloque limpia los suyos.
document.addEventListener("change", (e) => {
  const bloque = e.target.closest?.("[data-aceptacion]");
  if (bloque) limpiarErrores(bloque);
});

const MENOR_DE_13 = "Nexo es para mayores de 13 años. Si tenés menos, pedile a un adulto que cree la cuenta.";

// Devuelve { acepta_terminos: true, edad } listo para mandar, o null después
// de marcar en el bloque lo que falta. Con la edad ya declarada (un cambio de
// términos), la pregunta está oculta y solo cuenta la casilla.
export function leerAceptacion(raiz) {
  const bloque = raiz.querySelector("[data-aceptacion]");
  limpiarErrores(bloque);
  const pregunta = bloque.querySelector("[data-edad-pregunta]");
  let edad = null;
  if (!pregunta.hidden) {
    const respuesta = pregunta.querySelector('input[type="radio"]:checked')?.value;
    const opciones = pregunta.querySelector(".aceptacion-opciones");
    if (!respuesta) return falta(opciones, "Contanos si tenés 18 años o más.", pregunta.querySelector('input[type="radio"]'));
    if (respuesta === "mayor") edad = "mayor";
    else {
      const trece = pregunta.querySelector("[data-trece]");
      const permiso = pregunta.querySelector("[data-permiso]");
      if (!trece.checked) return falta(trece.closest("label"), MENOR_DE_13, trece);
      if (!permiso.checked) {
        return falta(permiso.closest("label"), "Para usar Nexo con menos de 18 años necesitás el permiso de tu madre, padre o tutor.", permiso);
      }
      edad = "menor_autorizado";
    }
  }
  const acepta = bloque.querySelector("[data-acepta]");
  if (!acepta.checked) return falta(acepta.closest("label"), "Para seguir, aceptá los términos y la política de privacidad.", acepta);
  return { acepta_terminos: true, ...(edad && { edad }) };
}

// El error va debajo de la casilla entera (su <label>) o del grupo de
// respuestas, y el foco a la casilla.
function falta(lugar, texto, foco) {
  marcarError(lugar, texto);
  foco.focus();
  return null;
}

// Si quien completa el alta dijo que tiene menos de 18 (para avisarle que un
// plan pago arranca en Gratis).
export function declaraMenor(raiz) {
  return raiz.querySelector('[data-edad-pregunta] input[value="menor"]')?.checked ?? false;
}

// Vuelve el bloque a cero; `pedirEdad` en false oculta la pregunta (la cuenta
// ya la respondió y solo cambiaron los términos).
export function prepararAceptacion(raiz, { pedirEdad = true } = {}) {
  const bloque = raiz.querySelector("[data-aceptacion]");
  limpiarErrores(bloque);
  bloque.querySelectorAll("input").forEach((input) => (input.checked = false));
  bloque.querySelector("[data-edad-pregunta]").hidden = !pedirEdad;
}
