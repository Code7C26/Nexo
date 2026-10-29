/**
 * dominios/factura-electronica.js
 * Configuración → Factura electrónica (etapa E, CLAUDE.md §33): los pasos para
 * que el negocio le dé permiso a Nexo en ARCA (la delegación del servicio de
 * factura electrónica), su punto de venta y el botón que lo verifica. Solo
 * admin. Pensada para quien nunca hizo un trámite en ARCA: cada paso dice
 * dónde tocar, y Nexo nunca pide la clave fiscal.
 */

import { avisar, confirmar } from "../core/ui.js";
import { api } from "../core/api.js";
import { recargar, registrar } from "../core/registro.js";
import { esc, fechaAR } from "../core/formato.js";
import { icono } from "../core/iconos.js";
import { formatearCuit } from "../core/fiscal.js";

const estadoEl = document.getElementById("feEstado");
const formPunto = document.getElementById("formFePuntoVenta");
const inputPunto = document.getElementById("fePuntoVenta");
const ayudaPunto = document.getElementById("fePuntoAyuda");
const btnVerificar = document.getElementById("btnFeVerificar");
const errorVerificar = document.getElementById("feVerificarError");

// El sistema que se elige al crear el punto de venta en ARCA: el
// monotributista tiene el suyo.
const SISTEMA_PUNTO_VENTA = {
  monotributo: "Factura Electrónica - Monotributo - Web Services",
  responsable_inscripto: "RECE para aplicativo y web services",
  exento: "RECE para aplicativo y web services"
};

const AMBIENTE_TEXTO = {
  homologacion:
    "Nexo está en el ambiente de prueba de ARCA: los CAE son de prueba y cada comprobante sale con la leyenda “Comprobante de prueba – sin validez fiscal”.",
  simulado: "ARCA simulado: los CAE los inventa Nexo, para probar sin conexión. Nada de esto llega a ARCA."
};

let config = null;

const marcarPaso = (paso, hecho) =>
  document.querySelector(`.fe-paso[data-paso="${paso}"]`).classList.toggle("fe-paso-hecho", hecho);

function mostrarError(texto) {
  errorVerificar.textContent = texto;
  errorVerificar.hidden = !texto;
}

function pintarEstado() {
  const partes = [];
  if (!config.disponible) {
    partes.push(
      `<p class="fe-estado-linea fe-estado-falta">${icono("circle-alert")} <span>Este servidor todavía no tiene el certificado de Nexo para hablar con ARCA. Avisale a quien administra Nexo.</span></p>`
    );
  } else if (config.activa) {
    partes.push(`
      <div class="fe-estado-linea fe-estado-activa">
        ${icono("circle-check")}
        <div class="fe-estado-texto">
          <p class="fe-estado-titulo">Activa</p>
          <p>Punto de venta ${esc(String(config.punto_venta).padStart(4, "0"))} · verificada el ${esc(fechaAR(config.verificado))}. Cada factura y nota de crédito sale con CAE.</p>
        </div>
        <button type="button" class="btn btn-secundario" id="btnFeApagar">Apagar</button>
      </div>`);
  } else {
    partes.push(
      `<p class="fe-estado-linea">${icono("info")} <span>Todavía no está activa: seguí los pasos de abajo. Hasta entonces, tus comprobantes siguen siendo internos.</span></p>`
    );
  }
  if (AMBIENTE_TEXTO[config.ambiente]) partes.push(`<p class="fe-aviso-prueba">${esc(AMBIENTE_TEXTO[config.ambiente])}</p>`);
  estadoEl.innerHTML = partes.join("");
  document.getElementById("btnFeApagar")?.addEventListener("click", apagar);
}

function pintar() {
  pintarEstado();
  const tieneDatos = Boolean(config.cuit_negocio && config.condicion_iva);
  marcarPaso("datos", tieneDatos);
  document.getElementById("feDatosTexto").textContent = tieneDatos
    ? `CUIT ${formatearCuit(config.cuit_negocio)}. Con tu condición frente al IVA, Nexo elige solo la letra de cada comprobante.`
    : "Nexo necesita el CUIT del negocio y su condición frente al IVA: con eso arma cada comprobante.";
  document.getElementById("feDatosLink").hidden = tieneDatos;

  // El CUIT de Nexo solo existe en producción; en el ambiente de prueba el
  // paso se muestra igual, para saber qué viene.
  const prueba = config.ambiente !== "produccion";
  document.getElementById("fePermisoPrueba").hidden = !prueba;
  document.getElementById("feCuitNexo").textContent = config.cuit_nexo
    ? formatearCuit(config.cuit_nexo)
    : "(se informa al pasar a producción)";
  marcarPaso("permiso", config.activa);

  document.getElementById("feSistema").textContent =
    SISTEMA_PUNTO_VENTA[config.condicion_iva] ?? SISTEMA_PUNTO_VENTA.responsable_inscripto;
  inputPunto.value = config.punto_venta ?? "";
  const avisos = [];
  const internos = config.puntos_internos;
  if (internos.length) {
    avisos.push(
      internos.length > 1
        ? `No uses los puntos ${internos.join(", ")}: ya tienen comprobantes internos de Nexo.`
        : `No uses el punto ${internos[0]}: ya tiene comprobantes internos de Nexo.`
    );
  }
  if (prueba) avisos.push("En el ambiente de prueba no hace falta crearlo en ARCA: sirve cualquier número.");
  ayudaPunto.textContent = avisos.join(" ");
  ayudaPunto.hidden = avisos.length === 0;
  marcarPaso("punto", Boolean(config.punto_venta));

  marcarPaso("verificar", config.activa);
  btnVerificar.disabled = !config.disponible;
  btnVerificar.textContent = config.activa ? "Verificar de nuevo" : "Verificar con ARCA";
  document.getElementById("feVerificarPie").textContent = config.activa ? "Ya está verificada." : "Tarda unos segundos.";
  document.getElementById("configFacturaElectronicaResumen").textContent = config.activa
    ? "Activa, con CAE de ARCA"
    : "Facturá con CAE de ARCA";
}

async function cargar() {
  config = await api("/api/factura-electronica", { error: "No se pudo cargar la factura electrónica." });
  mostrarError("");
  pintar();
}

formPunto.addEventListener("submit", async (e) => {
  e.preventDefault();
  const punto = Number(inputPunto.value);
  if (!Number.isInteger(punto) || punto < 1 || punto > 99998) {
    avisar("El punto de venta es un número entre 1 y 99998.", "atencion");
    inputPunto.focus();
    return;
  }
  await api("/api/factura-electronica", {
    method: "PUT",
    body: { punto_venta: punto },
    error: "No se pudo guardar el punto de venta."
  });
  await Promise.all([cargar(), recargar("negocio")]);
  avisar("Punto de venta guardado. Ahora verificalo con ARCA.", "ok");
});

// El motivo de un fallo va debajo del botón, y no en un aviso que se va: es lo
// que hay que leer para saber qué paso revisar.
btnVerificar.addEventListener("click", async () => {
  mostrarError("");
  const texto = btnVerificar.textContent;
  btnVerificar.disabled = true;
  btnVerificar.textContent = "Consultando a ARCA…";
  try {
    const res = await fetch("/api/factura-electronica/verificar", { method: "POST" });
    const datos = await res.json().catch(() => ({}));
    if (!res.ok) {
      mostrarError(datos.error ?? "ARCA no respondió. Probá de nuevo en unos minutos.");
      btnVerificar.textContent = texto;
      return;
    }
    await Promise.all([cargar(), recargar("negocio")]);
    avisar("Listo: la factura electrónica está activa. Tu próxima factura sale con CAE.", "ok");
  } catch {
    mostrarError("Sin conexión con el servidor. Revisá la red y volvé a intentar.");
    btnVerificar.textContent = texto;
  } finally {
    btnVerificar.disabled = !config?.disponible;
  }
});

async function apagar() {
  const ok = await confirmar({
    titulo: "Apagar la factura electrónica",
    cuerpo:
      "Tus próximos comprobantes vuelven a ser internos, sin CAE. Lo que ya está autorizado no cambia, y la podés volver a prender verificando de nuevo.",
    aceptar: "Apagar"
  });
  if (!ok) return;
  await api("/api/factura-electronica", { method: "DELETE", error: "No se pudo apagar la factura electrónica." });
  await Promise.all([cargar(), recargar("negocio")]);
  avisar("La factura electrónica quedó apagada.", "ok");
}

registrar("pintar:factura-electronica", cargar);
