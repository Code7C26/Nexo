/**
 * core/tema.js
 * Tema claro / oscuro (hist. §72). Lo usan el botón de la sidebar (app.js) y
 * la página Apariencia de Configuración.
 */

// La elección explícita (si existe) ya se aplicó al <html> antes de que la
// página pintara nada (ver el script inline en el <head>). Sin elección, la
// app es oscura: es el tema principal de Nexo, no se sigue al sistema
// operativo.
export function temaActual() {
  try {
    return localStorage.getItem("nexo.tema") || "oscuro";
  } catch {
    return document.documentElement.getAttribute("data-tema") || "oscuro";
  }
}

// Avisa con el evento "nexo:tema", así la página Apariencia se entera aunque
// el cambio venga del botón de la sidebar.
export function aplicarTema(tema) {
  document.documentElement.setAttribute("data-tema", tema);
  try {
    localStorage.setItem("nexo.tema", tema);
  } catch {
    // Sin storage disponible, el tema sigue cambiado para esta sesión,
    // solo no se recuerda la próxima vez.
  }
  document.dispatchEvent(new CustomEvent("nexo:tema", { detail: tema }));
}
