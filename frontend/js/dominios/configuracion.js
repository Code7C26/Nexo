/**
 * dominios/configuracion.js
 * Configuración (datos del negocio). Movido tal cual desde app.js
 * (CLAUDE.md §31, Etapa B / F3).
 */

import { fijarNegocio, negocio } from "../core/negocio.js";
import { avisar, manejarError } from "../core/ui.js";
import { registrar } from "../core/registro.js";

/* ---------- Configuración (datos del negocio) ---------- */

// El engranaje abre Configuración, que desde esta etapa tiene contenido real:
// los datos que encabezan los comprobantes impresos. El círculo de perfil
// (#btnPerfil) no lo comparte: abre #modalPerfil, el menú de cuenta.
//
// `negocio` queda en memoria para que armarHojaComprobante() no tenga que
// hacer un fetch cada vez que se imprime — mismo criterio que `cuentasTesoreria`
// y los demás cachés que llena el boot.
// El caché vive en core/negocio.js (lo lee comprobante.js): se carga con fijarNegocio().

const modalConfiguracion = document.getElementById("modalConfiguracion");
const formNegocio = document.getElementById("formNegocio");

function pintarFormNegocio() {
  for (const campo of ["nombre", "documento", "condicion_iva", "direccion", "telefono", "email", "pie_comprobante"]) {
    if (formNegocio[campo]) formNegocio[campo].value = negocio[campo] ?? "";
  }
  // Gating por rol: es UI, no seguridad — el servidor responde 403 igual si un
  // empleado llama al endpoint directo (mismo criterio que la vista Usuarios).
  const esAdmin = document.documentElement.dataset.rol === "admin";
  document.getElementById("negocioSoloLectura").hidden = esAdmin;
  for (const control of formNegocio.querySelectorAll("input, textarea, button")) {
    control.disabled = !esAdmin;
  }
}

async function cargarNegocio() {
  const res = await fetch("/api/negocio");
  if (!res.ok) return;
  fijarNegocio(await res.json());
  pintarFormNegocio();
}

formNegocio.addEventListener("submit", async (e) => {
  e.preventDefault();
  const datos = Object.fromEntries(new FormData(formNegocio).entries());
  if (!datos.nombre?.trim()) {
    avisar("El negocio necesita un nombre.", "atencion");
    return;
  }
  const res = await fetch("/api/negocio", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos)
  });
  if (!(await manejarError(res, "No se pudieron guardar los datos del negocio."))) return;
  await cargarNegocio();
  modalConfiguracion.hidden = true;
  avisar("Datos del negocio actualizados.", "ok");
});

document.getElementById("btnConfiguracion").addEventListener("click", () => {
  // Se repinta al abrir: así el formulario nunca muestra un valor viejo si el
  // usuario editó, cerró sin guardar y volvió a abrir.
  pintarFormNegocio();
  modalConfiguracion.hidden = false;
});
document.getElementById("modalConfiguracionClose").addEventListener("click", () => {
  modalConfiguracion.hidden = true;
});
modalConfiguracion.addEventListener("click", (e) => {
  if (e.target === modalConfiguracion) modalConfiguracion.hidden = true;
});

// Lo recarga el boot de app.js con recargar("negocio").
registrar("cargar:negocio", cargarNegocio);
