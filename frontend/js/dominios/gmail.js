/**
 * dominios/gmail.js
 * Configuración → Gmail (hist. §187): conectar el Gmail del negocio para que
 * las facturas salgan desde ahí y no desde la casilla de Nexo. Sin conectar,
 * cómo funciona y el botón; conectado, la cuenta, el mail de prueba y
 * desconectar. Solo admin. Nexo pide solo el permiso de mandar (gmail.send).
 *
 * Al volver de Google, el servidor deja el resultado en ?gmail=.
 */

import { avisar, confirmar } from "../core/ui.js";
import { api } from "../core/api.js";
import { alEntrarEnVista, recargar, registrar } from "../core/registro.js";
import { esc, fechaHoraAR } from "../core/formato.js";
import { icono } from "../core/iconos.js";
import { negocio } from "../core/negocio.js";

const estadoEl = document.getElementById("gmailEstado");
const btnConectar = document.getElementById("gmailConectar");
const btnPrueba = document.getElementById("gmailPrueba");
const btnDesconectar = document.getElementById("gmailDesconectar");
const resumen = document.getElementById("configGmailResumen");

const RESULTADOS = {
  conectado: ["¡Listo! Tu Gmail quedó conectado: las facturas que mandes salen desde ahí.", "ok"],
  cancelado: ["No se conectó: el permiso se canceló en Google.", "atencion"],
  "sin-permiso": ["No se conectó: en Google quedó sin tildar el permiso de mandar mails. Volvé a conectar y dejalo tildado.", "atencion"],
  "sin-sesion": ["Para conectar tu Gmail, entrá a Nexo como administrador del negocio y tocá “Conectar Gmail”.", "atencion"],
  "no-disponible": ["Conectar Gmail todavía no está disponible en este Nexo.", "atencion"],
  "sin-plan": ["No se conectó: mandar las facturas por mail es desde el plan Emprendedor.", "atencion"],
  error: ["No se pudo conectar tu Gmail. Volvé a intentarlo desde acá.", "error"]
};

// El ítem del menú de Configuración dice desde dónde salen hoy.
function pintarResumen(gmail) {
  resumen.textContent = gmail?.conectado
    ? `Las facturas salen desde ${gmail.direccion}`
    : gmail?.desconectado_por_google
      ? "Se desconectó: conectalo de nuevo"
      : "Mandá las facturas desde tu mail";
}
alEntrarEnVista("configuracion", () => pintarResumen(negocio.gmail));

function leerVuelta() {
  const params = new URLSearchParams(location.search);
  const resultado = params.get("gmail");
  if (!resultado) return;
  history.replaceState(null, "", location.pathname + location.hash);
  const [texto, tipo] = RESULTADOS[resultado] ?? RESULTADOS.error;
  avisar(texto, tipo);
  // La factura dice desde dónde sale según el negocio (negocio.gmail).
  recargar("negocio");
}

// El texto del botón va en su último nodo, después del logo.
function botonConectar(texto, principal) {
  btnConectar.lastChild.textContent = ` ${texto}`;
  btnConectar.className = `btn ${principal ? "btn-primary" : "btn-secundario"}`;
}

async function pintarGmail() {
  leerVuelta();
  const estado = await api("/api/gmail", { error: "No se pudo consultar Gmail." });
  pintarResumen(estado);
  // Desde Emprendedor, como la factura electrónica. En Gratis se ve cómo
  // funciona y el aviso del plan; lo conectado queda en pausa.
  const sinPlan = !estado.plan_lo_incluye;
  document.getElementById("gmailSinPlan").hidden = !sinPlan;
  document.getElementById("gmailNoDisponible").hidden = estado.disponible;
  document.getElementById("gmailTarjeta").hidden = !estado.disponible || (sinPlan && !estado.conectado);
  document.getElementById("gmailComoFunciona").hidden = !estado.disponible || estado.conectado;
  if (!estado.disponible) return;
  btnConectar.hidden = sinPlan;

  if (estado.conectado) {
    const quien = estado.conectada_por ? ` ${esc(estado.conectada_por)}` : "";
    estadoEl.innerHTML = `
      <p class="fe-estado-linea fe-estado-activa">${icono("circle-check")}
        <span>Conectado a <strong>${esc(estado.direccion)}</strong>. Las facturas que mandes desde Nexo salen desde ahí, con el nombre de ${esc(negocio.nombre)}.</span></p>
      <p class="form-note">Lo conectó${quien} el ${esc(fechaHoraAR(estado.conectada_en))}.</p>`;
    botonConectar("Conectar otro Gmail", false);
  } else if (estado.desconectado_por_google) {
    estadoEl.innerHTML = `
      <p class="fe-estado-linea fe-estado-falta">${icono("circle-alert")}
        <span>Google dejó de darle permiso a Nexo para mandar desde <strong>${esc(estado.direccion)}</strong>, y las facturas no salen hasta que lo conectes de nuevo. Si preferís que salgan desde Nexo, desconectalo.</span></p>`;
    botonConectar("Conectar de nuevo", true);
  } else {
    estadoEl.innerHTML = `<p class="config-tarjeta-texto">Conectá la cuenta de Gmail del negocio. Te lleva a Google, elegís la cuenta y aceptás el permiso de mandar mails.</p>`;
    botonConectar("Conectar Gmail", true);
  }
  if (estado.en_pausa) {
    estadoEl.innerHTML = `
      <p class="fe-estado-linea fe-estado-falta">${icono("circle-alert")}
        <span>Tu Gmail <strong>${esc(estado.direccion)}</strong> está en pausa: tu plan no incluye mandar facturas por mail. Vuelve a andar cuando pases a Emprendedor.</span></p>`;
  }
  btnPrueba.hidden = !estado.conectado || sinPlan;
  btnDesconectar.hidden = !estado.conectado && !estado.desconectado_por_google;
  document.getElementById("gmailSinConectar").textContent = sinPlan
    ? "Con el plan Emprendedor, las facturas salen desde tu Gmail o, si no lo conectás, desde la casilla de Nexo con el nombre de tu negocio."
    : estado.nexo_manda
      ? `Mientras no lo conectes, las facturas salen desde la casilla de Nexo, con el nombre de ${negocio.nombre}.`
      : "Mientras no lo conectes, las facturas no se pueden mandar por mail.";
}
registrar("pintar:gmail", pintarGmail);

btnConectar.addEventListener("click", async () => {
  btnConectar.disabled = true;
  try {
    const { url } = await api("/api/gmail/conectar", { method: "POST", error: "No se pudo empezar a conectar Gmail." });
    location.href = url;
  } finally {
    btnConectar.disabled = false;
  }
});

btnPrueba.addEventListener("click", async () => {
  btnPrueba.disabled = true;
  try {
    const r = await api("/api/gmail/prueba", { method: "POST", error: "No se pudo mandar el mail de prueba." });
    avisar(`Te mandamos un mail de prueba a ${r.direccion}. Así les llegan las facturas a tus clientes.`, "ok");
  } catch {
    // Si Google sacó el permiso, la página lo muestra.
    await pintarGmail();
  } finally {
    btnPrueba.disabled = false;
  }
});

btnDesconectar.addEventListener("click", async () => {
  const ok = await confirmar({
    titulo: "Desconectar Gmail",
    cuerpo: "Las facturas vuelven a salir desde la casilla de Nexo, con el nombre de tu negocio. Nexo le avisa a Google que suelte el permiso.",
    aceptar: "Desconectar"
  });
  if (!ok) return;
  await api("/api/gmail/desconectar", { method: "POST", error: "No se pudo desconectar Gmail." });
  avisar("Gmail desconectado: las facturas salen desde Nexo.", "ok");
  await recargar("negocio");
  await pintarGmail();
});
