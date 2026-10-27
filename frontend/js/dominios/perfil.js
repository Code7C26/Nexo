/**
 * dominios/perfil.js
 * Mi cuenta: el mail (hist. §102), cambio de contraseña y cerrar sesión. Es una página de
 * Configuración (#/configuracion/cuenta) para los dos roles, y la abre también
 * el círculo de perfil del pie del menú. Antes era un modal aparte.
 */

import { api } from "../core/api.js";
import { esc } from "../core/formato.js";
import { icono } from "../core/iconos.js";
import { avisar } from "../core/ui.js";
import { alEntrarEnVista, registrar } from "../core/registro.js";
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
  document.getElementById("cambioMailError").hidden = true;
  pintarMail();
}
registrar("pintar:cuenta", pintarCuenta);

/* ---------- Mail de la cuenta (hist. §102) ---------- */

// El mail y si está confirmado salen del estado de la sesión: cambian desde
// otro lado (el enlace del mail se toca en otra pestaña o en el celular).
async function pintarMail() {
  const { usuario } = await api("/api/auth/estado");
  const estadoEl = document.getElementById("perfilEmailEstado");
  document.getElementById("perfilEmail").textContent = usuario?.email ?? "—";
  estadoEl.hidden = !usuario?.email;
  estadoEl.textContent = usuario?.email_verificado ? "Confirmado" : "Sin confirmar";
  estadoEl.className = usuario?.email_verificado ? "status status-cobrado" : "status status-pendiente";
  document.getElementById("perfilEmailNota").hidden = !usuario?.email || usuario.email_verificado;
}

async function reenviarMail(boton) {
  boton.disabled = true;
  try {
    await api("/api/auth/email/reenviar", { method: "POST", error: "No se pudo mandar el enlace." });
    avisar("Te mandamos otro enlace. Vale el último que te llegó.", "ok");
  } finally {
    boton.disabled = false;
  }
}
document.getElementById("btnReenviarMail").addEventListener("click", (e) => reenviarMail(e.currentTarget));

// En el Resumen, a los dos roles, hasta que se toca el enlace: se puede
// trabajar igual, pero sin el mail confirmado no hay cómo recuperar la cuenta.
const avisoMailEl = document.getElementById("avisoMail");
alEntrarEnVista("dashboard", async () => {
  avisoMailEl.hidden = true;
  const { usuario } = await api("/api/auth/estado");
  if (!usuario?.email || usuario.email_verificado) return;
  avisoMailEl.innerHTML = `${icono("mail")}<p>Confirmá tu mail: te mandamos un enlace a <strong>${esc(usuario.email)}</strong>. Así podés recuperar tu cuenta si te olvidás la contraseña.</p>
    <button type="button" class="btn btn-secundario" data-reenviar-mail>Mandarlo de nuevo</button>
    <a class="btn-link" href="#/configuracion/cuenta">Cambiar el mail</a>`;
  avisoMailEl.hidden = false;
});
avisoMailEl.addEventListener("click", (e) => {
  const boton = e.target.closest("[data-reenviar-mail]");
  if (boton) reenviarMail(boton);
});

document.getElementById("formCambioMail").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const errorEl = document.getElementById("cambioMailError");
  const email = form.perfilEmailNuevo.value.trim();
  errorEl.hidden = true;
  const error = (texto) => {
    errorEl.textContent = texto;
    errorEl.hidden = false;
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error("Revisá el mail nuevo: tiene que ser como nombre@dominio.com.");
  if (!form.perfilEmailPassword.value) return error("Escribí tu contraseña para cambiar el mail.");

  // Como la contraseña: el error va en la propia página, no en un toast.
  let res;
  try {
    res = await fetch("/api/auth/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: form.perfilEmailPassword.value })
    });
  } catch {
    return error("Sin conexión con el servidor. Revisá la red y volvé a intentar.");
  }
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) return error(datos.error || "No se pudo cambiar el mail.");

  form.reset();
  avisar(`Listo. Te mandamos un enlace a ${datos.usuario.email} para confirmarlo.`, "ok");
  pintarMail();
});

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
