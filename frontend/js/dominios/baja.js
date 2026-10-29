/**
 * dominios/baja.js
 * "Tus datos y la baja" (etapa 8b, Fase 4, hist. §109): la página de
 * Configuración para descargar los datos del negocio y para darlo de baja.
 * Solo admin. Al pedir la baja, el negocio queda cerrado: la página se
 * recarga y sesion.js muestra la pantalla del negocio en baja, desde donde se
 * cancela.
 */

import { negocio } from "../core/negocio.js";
import { avisar } from "../core/ui.js";
import { registrar } from "../core/registro.js";
import { descargarDatosDelNegocio } from "../core/descarga-datos.js";

const form = document.getElementById("formBajaNegocio");
const campoNombre = document.getElementById("bajaNegocioNombre");
const campoPassword = document.getElementById("bajaNegocioPassword");
const errorEl = document.getElementById("bajaNegocioError");

function error(texto) {
  errorEl.textContent = texto;
  errorEl.hidden = !texto;
}

// Al entrar a la página: el nombre que hay que escribir, y los campos vacíos.
registrar("pintar:baja", () => {
  form.reset();
  error("");
  document.getElementById("bajaNegocioEtiqueta").textContent = negocio?.nombre
    ? `Escribí "${negocio.nombre}" para confirmar`
    : "Escribí el nombre del negocio para confirmar";
});

document.getElementById("btnDescargarDatos").addEventListener("click", async (e) => {
  const boton = e.currentTarget;
  boton.disabled = true;
  try {
    const fallo = await descargarDatosDelNegocio();
    if (fallo) avisar(fallo, "error");
    else avisar("Listo: el archivo quedó en tus descargas.", "ok");
  } finally {
    boton.disabled = false;
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const boton = form.querySelector('button[type="submit"]');
  if (boton.disabled) return;
  error("");
  if (!campoNombre.value.trim()) return error("Escribí el nombre del negocio.");
  if (!campoPassword.value) return error("Escribí tu contraseña.");
  boton.disabled = true;
  try {
    // Como la contraseña de Mi cuenta: el error va en la página, no en un toast.
    const res = await fetch("/api/negocio/baja", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: campoNombre.value, password: campoPassword.value })
    });
    const datos = await res.json().catch(() => ({}));
    if (!res.ok) return error(datos.error || "No se pudo dar de baja el negocio.");
    location.replace("/app");
  } catch {
    error("Sin conexión con el servidor. Revisá la red y volvé a intentar.");
  } finally {
    boton.disabled = false;
  }
});
