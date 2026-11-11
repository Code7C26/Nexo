/**
 * dominios/mercado-pago.js
 * Configuración → Mercado Pago (hist. §130). Sin conectar, los dos pasos y el
 * botón que lleva a Mercado Pago a dar el permiso; conectada, la cuenta de
 * Caja donde entra lo cobrado, los pagos que llegaron y la actividad. Solo
 * admin. El link de cada venta se arma en "Registrar cobro" (app.js).
 *
 * Al volver de Mercado Pago, el servidor deja el resultado en ?mercadopago=.
 */

import { avisar, confirmar } from "../core/ui.js";
import { api } from "../core/api.js";
import { invocar, recargar, registrar } from "../core/registro.js";
import { esc, fechaAR, fechaHoraAR, money } from "../core/formato.js";
import { icono } from "../core/iconos.js";
import { pintarActividadCanal } from "../core/canales.js";

const estadoEl = document.getElementById("mpEstado");
const pasos = document.getElementById("mpPasos");
const conectadaEl = document.getElementById("mpConectada");
const listaPagos = document.getElementById("mpPagos");
const selectCuenta = document.getElementById("mpCuenta");
const btnSincronizar = document.getElementById("btnMpSincronizar");

const RESULTADOS = {
  conectada: ["¡Listo! Tu cuenta quedó conectada. Ya podés cobrar con un link desde cualquier venta.", "ok"],
  cancelado: ["No se conectó: el permiso se canceló en Mercado Pago.", "atencion"],
  "sin-sesion": ["Para conectar tu cuenta, entrá a Nexo como administrador del negocio y tocá “Conectar mi Mercado Pago”.", "atencion"],
  "en-otro-negocio": ["Esa cuenta de Mercado Pago ya está conectada a otro negocio de Nexo. Desconectala de allá primero.", "error"],
  "no-disponible": ["Mercado Pago todavía no está disponible en Nexo.", "atencion"],
  error: ["No se pudo conectar tu cuenta. Volvé a intentarlo desde acá.", "error"]
};

const ESTADO_PAGO = {
  cobrado: ["status-cobrado", "Cobrado"],
  sin_asignar: ["status-pendiente", "Para revisar"],
  devuelto: ["status-vencido", "Devuelto"],
  en_disputa: ["status-pendiente", "Reclamado"]
};

const MEDIOS = {
  credit_card: "Tarjeta de crédito",
  debit_card: "Tarjeta de débito",
  prepaid_card: "Tarjeta prepaga",
  account_money: "Dinero en Mercado Pago",
  bank_transfer: "Transferencia",
  ticket: "Efectivo",
  digital_currency: "Mercado Crédito"
};

let estado = null;

function leerVuelta() {
  const params = new URLSearchParams(location.search);
  const resultado = params.get("mercadopago");
  if (!resultado) return;
  history.replaceState(null, "", location.pathname + location.hash);
  const [texto, tipo] = RESULTADOS[resultado] ?? RESULTADOS.error;
  avisar(texto, tipo);
  // El link de pago se ofrece según el negocio (mercado_pago.conectado).
  recargar("negocio");
}

function pintarEstado() {
  if (!estado.disponible) {
    estadoEl.innerHTML = `<p class="fe-estado-linea fe-estado-falta">${icono("circle-alert")} <span>Mercado Pago todavía no está disponible en este servidor de Nexo.</span></p>`;
    return;
  }
  if (!estado.conectada) {
    estadoEl.innerHTML = estado.cuenta
      ? `<p class="fe-estado-linea">${icono("info")} <span>La cuenta “${esc(estado.cuenta.nombre)}” está desconectada: los pagos de los links ya no entran solos. Los cobros que ya entraron siguen en Nexo.</span></p>`
      : "";
    return;
  }
  const revisada = estado.ultima_sincronizacion ? ` Última revisión: ${esc(fechaHoraAR(estado.ultima_sincronizacion))}.` : "";
  const cobrados =
    estado.cobrados === 0 ? "Todavía no entró ningún cobro" : estado.cobrados === 1 ? "1 cobro entró solo" : `${estado.cobrados} cobros entraron solos`;
  estadoEl.innerHTML = `
    <div class="fe-estado-linea fe-estado-activa">
      ${icono("circle-check")}
      <div class="fe-estado-texto">
        <p class="fe-estado-titulo">Conectada a ${esc(estado.cuenta.nombre)}</p>
        <p>${cobrados}.${revisada}</p>
      </div>
      <button type="button" class="btn btn-secundario" id="btnMpDesconectar">Desconectar</button>
    </div>`;
  document.getElementById("btnMpDesconectar").addEventListener("click", desconectar);
}

// Una fila por pago: el importe y el estado; abajo, cómo se pagó y lo que
// descontó Mercado Pago, o por qué no se cobró.
function filaDePago(p) {
  const [clase, texto] = ESTADO_PAGO[p.estado] ?? ["status-info", p.estado];
  const medio = [MEDIOS[p.medio] ?? null, p.cuotas > 1 ? `${p.cuotas} cuotas` : null, p.pagador].filter(Boolean).join(" · ");
  const descuentos = [
    p.comision > 0 ? `comisión ${money(p.comision)}` : null,
    p.financiacion > 0 ? `cuotas sin interés ${money(p.financiacion)}` : null,
    p.retenciones > 0 ? `retenciones ${money(p.retenciones)}` : null
  ].filter(Boolean);
  const neto = p.neto != null ? `Te quedan ${money(p.neto)}${descuentos.length ? ` (${descuentos.join(", ")})` : ""}` : null;
  const libera = p.libera_en && p.estado === "cobrado" ? `disponible desde el ${fechaAR(p.libera_en.slice(0, 10))}` : null;
  const detalle = p.motivo ?? [neto, libera].filter(Boolean).join(", ");
  const pideAtencion = p.estado !== "cobrado" && !p.revisado_en;
  const acciones = [
    p.venta_id ? `<button type="button" class="btn-link" data-venta="${p.venta_id}">Ver venta #${p.venta_id}</button>` : "",
    pideAtencion ? `<button type="button" class="btn-link" data-revisado="${p.id}">Ya lo revisé</button>` : ""
  ].join(" ");
  return `
    <li class="tn-pedido">
      <div class="tn-pedido-texto">
        <p class="tn-pedido-titulo"><span class="mono">${money(p.importe)}</span> <span class="status ${clase}">${texto}</span></p>
        ${medio ? `<p class="tn-pedido-detalle">${esc(medio)}</p>` : ""}
        ${detalle ? `<p class="tn-pedido-detalle">${esc(detalle)}</p>` : ""}
      </div>
      <div class="tn-pedido-acciones">${acciones}</div>
    </li>`;
}

async function pintarCuenta() {
  const cuentas = await api("/api/cuentas-tesoreria", { error: "No se pudieron cargar las cuentas." });
  selectCuenta.innerHTML = [
    `<option value="">No registrar el cobro</option>`,
    ...cuentas.map((c) => `<option value="${c.id}"${c.id === estado.cuenta_tesoreria_id ? " selected" : ""}>${esc(c.nombre)}</option>`)
  ].join("");
}

async function cargar() {
  leerVuelta();
  estado = await api("/api/integraciones/mercadopago", { error: "No se pudo cargar Mercado Pago." });
  pintarEstado();
  document.getElementById("configMercadoPagoResumen").textContent = estado.conectada
    ? `Conectada a ${estado.cuenta.nombre}`
    : "Cobrá con un link y que entre solo";
  // Desde el plan Emprendedor, como Tienda Nube.
  const sinPlan = estado.plan_lo_incluye === false;
  document.getElementById("mpSinPlan").hidden = !sinPlan;
  pasos.hidden = !estado.disponible || estado.conectada || sinPlan;
  conectadaEl.hidden = !estado.conectada;
  if (!estado.conectada) return;
  listaPagos.innerHTML = estado.pagos.length
    ? estado.pagos.map(filaDePago).join("")
    : `<li><p class="tn-vacio">Todavía no llegó ningún pago. Creá un link desde “Registrar cobro” en una venta.</p></li>`;
  pintarActividadCanal(document.getElementById("mpActividad"), estado.actividad);
  pintarCaja();
  await pintarCuenta();
}

// El QR de la caja para el mostrador (hist. §147).
const formCaja = document.getElementById("formMpCaja");
function pintarCaja() {
  document.getElementById("mpCajaEstado").textContent = estado.qr_caja
    ? "Listo: el punto de venta cobra con el QR de tu caja de Mercado Pago, que tiene una comisión mucho más baja que el link (con dinero en cuenta, cerca del 0,8 %). Imprimí el cartel y pegalo en el mostrador: con una venta en curso cobra esa venta, y si no, el cliente escribe el monto."
    : "El punto de venta puede cobrar con el QR de una caja de Mercado Pago, con una comisión mucho más baja que la del link. Para eso, Nexo crea una sucursal y una caja en tu cuenta con la dirección del local. Hasta entonces, cobra con el QR del link.";
  document.getElementById("mpCajaCampos").hidden = estado.qr_caja;
  document.getElementById("mpCajaPie").hidden = estado.qr_caja;
  // El QR fijo de la caja, para pegar en el mostrador: con una venta en el
  // punto de venta cobra esa venta; sin venta, el cliente escribe el monto.
  const cartel = estado.qr_cartel;
  const pdf = document.getElementById("mpCajaCartelPdf");
  const imagen = document.getElementById("mpCajaCartelImagen");
  const seguro = (url) => typeof url === "string" && url.startsWith("https://");
  pdf.hidden = !seguro(cartel?.pdf);
  imagen.hidden = !seguro(cartel?.imagen);
  if (seguro(cartel?.pdf)) pdf.href = cartel.pdf;
  if (seguro(cartel?.imagen)) imagen.href = cartel.imagen;
  document.getElementById("mpCajaCartel").hidden = pdf.hidden && imagen.hidden;
}

formCaja.addEventListener("submit", async (e) => {
  e.preventDefault();
  const boton = formCaja.querySelector('[type="submit"]');
  const datos = Object.fromEntries(["calle", "numero", "ciudad", "provincia"].map((c) => [c, formCaja[c].value.trim()]));
  if (Object.values(datos).some((v) => !v)) return avisar("Completá la calle, el número, la ciudad y la provincia del local.", "atencion");
  boton.disabled = true;
  try {
    await api("/api/integraciones/mercadopago/caja", { method: "POST", body: datos, error: "Mercado Pago no dejó armar la caja." });
    avisar("Caja armada: el punto de venta ya cobra con su QR.", "ok");
    await cargar();
  } finally {
    boton.disabled = false;
  }
});

document.getElementById("btnMpConectar").addEventListener("click", async (e) => {
  const boton = e.currentTarget;
  boton.disabled = true;
  try {
    const { url } = await api("/api/integraciones/mercadopago/conectar", { method: "POST", error: "No se pudo empezar la conexión." });
    location.assign(url);
  } catch {
    boton.disabled = false;
  }
});

document.getElementById("formMpAjustes").addEventListener("submit", async (e) => {
  e.preventDefault();
  await api("/api/integraciones/mercadopago", {
    method: "PUT",
    body: { cuenta_tesoreria_id: selectCuenta.value ? Number(selectCuenta.value) : null },
    error: "No se pudieron guardar los cambios."
  });
  avisar("Guardado.", "ok");
  await cargar();
});

listaPagos.addEventListener("click", async (e) => {
  const boton = e.target.closest("button");
  if (!boton) return;
  if (boton.dataset.venta) {
    invocar("abrirFicha:venta", Number(boton.dataset.venta));
  } else if (boton.dataset.revisado) {
    await api(`/api/integraciones/mercadopago/pagos/${boton.dataset.revisado}/revisado`, { method: "POST", error: "No se pudo marcar." });
    await cargar();
  }
});

btnSincronizar.addEventListener("click", async () => {
  btnSincronizar.disabled = true;
  try {
    await api("/api/integraciones/mercadopago/sincronizar", { method: "POST", error: "No se pudo revisar Mercado Pago." });
    await cargar();
    avisar("Listo: está todo al día.", "ok");
  } finally {
    btnSincronizar.disabled = false;
  }
});

async function desconectar() {
  const ok = await confirmar({
    titulo: "Desconectar Mercado Pago",
    cuerpo:
      "Los pagos de los links que ya mandaste dejan de entrar solos: los vas a tener que registrar a mano. Los cobros que ya entraron quedan en Nexo. Para sacarle el permiso a Nexo del todo, hacelo también desde tu cuenta de Mercado Pago.",
    aceptar: "Desconectar"
  });
  if (!ok) return;
  await api("/api/integraciones/mercadopago/desconectar", { method: "POST", error: "No se pudo desconectar tu cuenta." });
  avisar("Tu cuenta quedó desconectada.", "ok");
  await recargar("negocio");
  await cargar();
}

registrar("pintar:mercado-pago", cargar);
