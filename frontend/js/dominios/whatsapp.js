/**
 * dominios/whatsapp.js
 * Configuración → WhatsApp (hist. §134, §135): vincular el teléfono de la
 * persona al negocio activo, para mandarle al asistente ventas, compras y
 * gastos por WhatsApp. Es de los dos roles: el número es de cada persona.
 * Antes era una tarjeta de Mi cuenta.
 *
 * El ítem del menú y el acceso desde la página del asistente se muestran solo
 * si Nexo tiene WhatsApp configurado (GET /api/whatsapp → disponible).
 */

import { api } from "../core/api.js";
import { avisar, confirmar } from "../core/ui.js";
import { alEntrarEnVista, registrar } from "../core/registro.js";

const item = document.getElementById("configWhatsAppItem");
const resumen = document.getElementById("configWhatsAppResumen");
const guiaAsistente = document.getElementById("asistenteGuiaWhatsApp");
const textoGuia = document.getElementById("asistenteGuiaWhatsAppTexto");

// Lo que contesta /api/whatsapp también decide el menú y el asistente: sin
// WhatsApp configurado no se ofrece en ningún lado.
function mostrarAccesos(estado) {
  const disponible = Boolean(estado?.disponible);
  item.hidden = !disponible;
  guiaAsistente.hidden = !disponible;
  if (!disponible) return;
  resumen.textContent = estado.vinculo ? `+${estado.vinculo.telefono}` : "Cargá ventas con un mensaje";
  textoGuia.textContent = estado.vinculo
    ? "Ya tenés tu número vinculado: mandale tus ventas a Nexo desde el celular, escritas o en un audio."
    : "Mandale tus ventas a Nexo desde el celular, escritas o en un audio. Vinculá tu número para empezar.";
}

// Al entrar a Configuración o al asistente. Si falla, los accesos quedan como
// estaban: es el menú, no merece un aviso.
async function revisarAccesos() {
  const estado = await api("/api/whatsapp").catch(() => null);
  if (estado) mostrarAccesos(estado);
}
alEntrarEnVista("configuracion", revisarAccesos);
alEntrarEnVista("asistente", revisarAccesos);

/* ---------- La página ---------- */

// Vincular es mandar un código desde el celular al número de Nexo: así queda
// probado que el teléfono es de quien lo vincula. Mientras se espera el
// mensaje, la página pregunta cada pocos segundos si ya llegó.
const ESPERA_WHATSAPP_MS = 3000;
let espera = null;

function dejarDeEsperar() {
  clearInterval(espera);
  espera = null;
}

async function pintarWhatsApp() {
  dejarDeEsperar();
  const estado = await api("/api/whatsapp", { error: "No se pudo consultar WhatsApp." });
  mostrarAccesos(estado);
  document.getElementById("waNoDisponible").hidden = estado.disponible;
  document.getElementById("waVinculo").hidden = !estado.disponible;
  document.getElementById("waEjemplos").hidden = !estado.disponible;
  if (!estado.disponible) return;
  document.getElementById("waCodigo").hidden = true;
  const texto = document.getElementById("waTexto");
  const vincular = document.getElementById("waVincular");
  const desvincular = document.getElementById("waDesvincular");
  if (estado.vinculo) {
    texto.replaceChildren(
      "Tu WhatsApp ",
      Object.assign(document.createElement("strong"), { textContent: `+${estado.vinculo.telefono}` }),
      ` está vinculado a ${estado.vinculo.negocio}. Mandale al número de Nexo lo que vendiste, compraste o gastaste.`
    );
    vincular.textContent = "Vincular otro número";
    desvincular.hidden = false;
  } else {
    texto.textContent =
      "Vinculá tu celular una sola vez: le mandás un código al número de Nexo y listo. Se usa en el negocio en el que estás ahora.";
    vincular.textContent = "Vincular mi WhatsApp";
    desvincular.hidden = true;
  }
}
registrar("pintar:whatsapp", pintarWhatsApp);

document.getElementById("waVincular").addEventListener("click", async () => {
  const pedido = await api("/api/whatsapp/vincular", { method: "POST", error: "No se pudo empezar a vincular WhatsApp." });
  document.getElementById("waMensaje").textContent = `NEXO ${pedido.codigo}`;
  document.getElementById("waAbrir").href = pedido.enlace;
  document.getElementById("waVence").textContent =
    `El código vence en ${pedido.minutos} minutos. Cuando llegue, esta página se actualiza sola.`;
  document.getElementById("waCodigo").hidden = false;

  dejarDeEsperar();
  const hasta = Date.now() + pedido.minutos * 60_000;
  const antes = (await api("/api/whatsapp")).vinculo?.telefono ?? null;
  espera = setInterval(async () => {
    // Fuera de la página, o vencido el código, se deja de preguntar.
    const pagina = document.querySelector('.config-pagina[data-seccion="whatsapp"]');
    if (Date.now() > hasta || !pagina || pagina.hidden) return dejarDeEsperar();
    const estado = await api("/api/whatsapp").catch(() => null);
    if (estado?.vinculo && estado.vinculo.telefono !== antes) {
      avisar("WhatsApp vinculado: ya podés mandarle tus ventas.", "ok");
      pintarWhatsApp();
    }
  }, ESPERA_WHATSAPP_MS);
});

document.getElementById("waDesvincular").addEventListener("click", async () => {
  const seguro = await confirmar({
    titulo: "Desvincular WhatsApp",
    cuerpo: "Ese número deja de poder registrar cosas en Nexo. Lo podés volver a vincular cuando quieras.",
    aceptar: "Desvincular",
    destructivo: true
  });
  if (!seguro) return;
  await api("/api/whatsapp/vinculo", { method: "DELETE", error: "No se pudo desvincular WhatsApp." });
  avisar("WhatsApp desvinculado.", "ok");
  pintarWhatsApp();
});
