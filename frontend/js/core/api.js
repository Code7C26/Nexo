/**
 * core/api.js
 * Única puerta de las llamadas al backend (auditoría de hist. §57, Fase 3).
 *
 * Antes cada call site hacía `await (await fetch(url)).json()` sin mirar
 * res.ok, o `manejarError(res, …)` solo en las escrituras: un 500 se leía
 * como si fuera la lista, y un corte de red (TypeError de fetch) no lo
 * capturaba nadie y dejaba la pantalla a medias. api() resuelve los dos
 * casos en un lugar: avisa con un toast y lanza, así lo que sigue al await
 * (pintar, cerrar el modal, el aviso de éxito) no corre con datos que no
 * llegaron.
 *
 * El 401 lo sigue resolviendo el interceptor de sesion.js (apaga la sesión
 * y muestra el login): acá solo se evita sumarle un toast encima.
 */

import { avisar, manejarError } from "./ui.js";

// Marca de los errores que api() ya le mostró al usuario. El listener de
// abajo los silencia en la consola; cualquier otro rechazo sin capturar se
// sigue reportando normal.
class ErrorApi extends Error {
  yaAvisado = true;
}

window.addEventListener("unhandledrejection", (e) => {
  if (e.reason instanceof ErrorApi) e.preventDefault();
});

// opciones: { method, body, error }. `body` va como JSON; `error` es el
// mensaje del toast cuando el backend no manda uno propio.
export async function api(url, { method = "GET", body, error = "No se pudo completar la operación." } = {}) {
  const init = { method };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(url, init);
  } catch {
    avisar("Sin conexión con el servidor. Revisá la red y volvé a intentar.", "error");
    throw new ErrorApi(`Sin conexión: ${method} ${url}`);
  }

  if (!res.ok) {
    if (res.status !== 401) await manejarError(res, error);
    throw new ErrorApi(`HTTP ${res.status}: ${method} ${url}`);
  }

  // 204 (y cualquier respuesta sin cuerpo) no es un error: no hay nada que leer.
  const texto = await res.text();
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    avisar(error, "error");
    throw new ErrorApi(`Respuesta no JSON: ${method} ${url}`);
  }
}

// Recarga de pantallas después de una escritura (y olas del arranque): espera
// todas las cargas y no corta por las que ya avisó api(). Sin esto, una venta
// que se guardó bien pero cuyo refresco de stock falla dejaba el modal abierto
// con un toast de error, y el usuario la volvía a enviar (venta duplicada).
// Un error que no viene de api() (un bug al pintar) se relanza igual.
export async function refrescar(cargas) {
  const resultados = await Promise.allSettled(cargas);
  const inesperado = resultados.find((r) => r.status === "rejected" && !(r.reason instanceof ErrorApi));
  if (inesperado) throw inesperado.reason;
}
