/**
 * core/campos.js
 * Errores de validación debajo de cada campo (alta guiada y Configuración),
 * en vez de un aviso suelto: quien no conoce Nexo ve qué tiene que corregir y
 * dónde. El lector de pantalla lo lee con aria-invalid y aria-describedby.
 */

let contador = 0;

// `control` es un input, un select o el contenedor de un grupo de tarjetas.
export function marcarError(control, texto) {
  limpiarError(control);
  const p = document.createElement("p");
  p.className = "campo-error";
  p.id = `campo-error-${++contador}`;
  p.textContent = texto;
  // Un input con ícono o con el ojo de la contraseña vive en un .campo-icono:
  // el error va debajo de todo el envoltorio.
  (control.closest(".campo-icono") ?? control).insertAdjacentElement("afterend", p);
  control.dataset.errorId = p.id;
  control.setAttribute("aria-invalid", "true");
  const descripciones = [control.getAttribute("aria-describedby"), p.id].filter(Boolean);
  control.setAttribute("aria-describedby", descripciones.join(" "));
}

export function limpiarError(control) {
  const id = control.dataset.errorId;
  if (!id) return;
  document.getElementById(id)?.remove();
  delete control.dataset.errorId;
  control.removeAttribute("aria-invalid");
  const resto = (control.getAttribute("aria-describedby") ?? "").split(" ").filter((d) => d && d !== id);
  if (resto.length) control.setAttribute("aria-describedby", resto.join(" "));
  else control.removeAttribute("aria-describedby");
}

export function limpiarErrores(contenedor) {
  contenedor.querySelectorAll("[data-error-id]").forEach(limpiarError);
}
