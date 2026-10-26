/**
 * dominios/perfil.js
 * Mi cuenta: cambio de contraseña y cerrar sesión. Es una página de
 * Configuración (#/configuracion/cuenta) para los dos roles, y la abre también
 * el círculo de perfil del pie del menú. Antes era un modal aparte.
 */

import { avisar } from "../core/ui.js";
import { registrar } from "../core/registro.js";
import { mostrarVista } from "../core/router.js";

// Nombre y rol los escribió sesion.js en el DOM al arrancar (ver
// data-usuario-nombre/data-usuario-rol en el pie de la sidebar): leerlos de
// ahí evita un fetch propio solo para mostrarlos.
function pintarCuenta() {
  document.getElementById("perfilNombre").textContent =
    document.querySelector("[data-usuario-nombre]")?.textContent ?? "—";
  const perfilRolEl = document.getElementById("perfilRol");
  perfilRolEl.textContent = document.documentElement.dataset.rol === "admin" ? "Administrador" : "Empleado";
  perfilRolEl.className = "status"; // un rol no es bueno ni malo: gris, como en Usuarios
  document.getElementById("cambioPasswordError").hidden = true;
}
registrar("pintar:cuenta", pintarCuenta);

document.getElementById("btnPerfil").addEventListener("click", () => {
  document.getElementById("sidebar").classList.remove("is-open");
  mostrarVista("configuracion", { subruta: "cuenta" });
});

document.getElementById("formCambioPassword").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const errorEl = document.getElementById("cambioPasswordError");
  errorEl.hidden = true;

  // No usa api(): el error se muestra en la propia página, no en un toast.
  let res;
  try {
    res = await fetch("/api/auth/cambiar-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actual: form.perfilPasswordActual.value,
        nueva: form.perfilPasswordNueva.value
      })
    });
  } catch {
    errorEl.textContent = "Sin conexión con el servidor. Revisá la red y volvé a intentar.";
    errorEl.hidden = false;
    return;
  }
  if (!res.ok) {
    const datos = await res.json().catch(() => ({}));
    errorEl.textContent = datos.error || "No se pudo cambiar la contraseña.";
    errorEl.hidden = false;
    return;
  }

  form.reset();
  avisar("Contraseña actualizada.", "ok");
});

document.getElementById("btnCerrarSesion").addEventListener("click", () => {
  // nexoCerrarSesion la expone sesion.js (que cargó antes que este
  // archivo): hace el POST de logout y recarga la página — más simple y
  // más seguro que intentar desmontar los listeners de este archivo a
  // mano.
  window.nexoCerrarSesion?.();
});
