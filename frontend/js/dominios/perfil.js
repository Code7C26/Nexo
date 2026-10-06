/**
 * dominios/perfil.js
 * Menú de perfil (mi cuenta): cambio de contraseña y cerrar sesión. Movido tal
 * cual desde app.js (CLAUDE.md §31, Etapa B / F3).
 */

import { avisar } from "../core/ui.js";

/* ---------- Menú de perfil (mi cuenta) ---------- */

const modalPerfil = document.getElementById("modalPerfil");
document.getElementById("btnPerfil").addEventListener("click", () => {
  // Nombre y rol los escribió sesion.js en el DOM al arrancar (ver
  // data-usuario-nombre/data-usuario-rol en el pie de la sidebar) —
  // leerlos de ahí evita un fetch propio solo para mostrar el modal.
  document.getElementById("perfilNombre").textContent =
    document.querySelector("[data-usuario-nombre]")?.textContent ?? "—";
  const rol = document.documentElement.dataset.rol;
  const perfilRolEl = document.getElementById("perfilRol");
  perfilRolEl.textContent = rol === "admin" ? "Administrador" : "Empleado";
  perfilRolEl.className = `status ${rol === "admin" ? "status-cobrado" : "status-pendiente"}`;
  modalPerfil.hidden = false;
});
document.getElementById("modalPerfilClose").addEventListener("click", () => {
  modalPerfil.hidden = true;
});
modalPerfil.addEventListener("click", (e) => {
  if (e.target === modalPerfil) modalPerfil.hidden = true;
});

document.getElementById("formCambioPassword").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const errorEl = document.getElementById("cambioPasswordError");
  errorEl.hidden = true;

  const res = await fetch("/api/auth/cambiar-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      actual: form.perfilPasswordActual.value,
      nueva: form.perfilPasswordNueva.value
    })
  });
  if (!res.ok) {
    const datos = await res.json().catch(() => ({}));
    errorEl.textContent = datos.error || "No se pudo cambiar la contraseña.";
    errorEl.hidden = false;
    return;
  }

  form.reset();
  modalPerfil.hidden = true;
  avisar("Contraseña actualizada.", "ok");
});

document.getElementById("btnCerrarSesion").addEventListener("click", () => {
  // nexoCerrarSesion la expone sesion.js (que cargó antes que este
  // archivo): hace el POST de logout y recarga la página — más simple y
  // más seguro que intentar desmontar los listeners de este archivo a
  // mano.
  window.nexoCerrarSesion?.();
});
