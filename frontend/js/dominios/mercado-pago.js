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

// Cuánto se llevó Mercado Pago por cada forma de pago y plan de cuotas, contra
// lo cobrado. Sin pagos todavía no hay nada que mostrar.
function pintarCostos() {
  const filas = estado.costos ?? [];
  document.getElementById("mpCostosPanel").hidden = !filas.length;
  const porcentaje = (parte, total) => (total > 0 ? `${((parte / total) * 100).toFixed(2).replace(".", ",")} %` : "—");
  document.getElementById("mpCostosBody").innerHTML = filas
    .map((f) => {
      const nombre = MEDIOS[f.medio] ?? f.medio ?? "Otro";
      const plan = f.cuotas > 1 ? `${f.cuotas} cuotas` : f.medio === "credit_card" ? "1 pago" : "";
      return `
    <tr>
      <td data-label="Cómo pagaron" class="m-titulo">${esc(nombre)}${plan ? `<span class="celda-meta">${plan}</span>` : ""}</td>
      <td data-label="Pagos" class="align-right mono">${esc(f.pagos)}</td>
      <td data-label="Comisión" class="align-right mono">${porcentaje(f.comision, f.importe)}</td>
      <td data-label="Cuotas sin interés" class="align-right mono">${f.financiacion > 0 ? porcentaje(f.financiacion, f.importe) : "—"}</td>
      <td data-label="Te cuesta" class="align-right mono">${porcentaje(f.comision + f.financiacion, f.importe)}</td>
    </tr>`;
    })
    .join("");
}

/* ---------- ¿Te conviene ofrecer cuotas? (hist. §172) ---------- */

// Mercado Pago no da sus tarifas por API: Nexo trae una tabla de referencia y
// el negocio la corrige con lo que dice su cuenta. Acá se ve, para cada plan,
// cuánto cuesta ofrecerlo y cuánto habría que cobrar para que quede lo mismo.
const montoTarifas = document.getElementById("mpTarifasMonto");
const comisionTarifas = document.getElementById("mpTarifasComision");
const cuerpoTarifas = document.getElementById("mpTarifasBody");
const btnRestaurarTarifas = document.getElementById("btnMpTarifasRestaurar");
let tarifas = null;

const pctTexto = (n) => `${(Math.round(n * 100) / 100).toString().replace(".", ",")} %`;

// Un renglón: el costo de las cuotas lleva el IVA, y la comisión se suma.
function calcularPlan(costoPct) {
  const monto = Number(montoTarifas.value) || 0;
  const total = (Number(comisionTarifas.value) || 0) + costoPct * (1 + tarifas.iva_pct / 100);
  const costo = Math.round(monto * total) / 100;
  return { total, costo, queda: monto - costo, cobrar: total < 100 ? monto / (1 - total / 100) : null };
}

function celdasPlan(costoPct) {
  const { total, costo, queda, cobrar } = calcularPlan(costoPct);
  return `
      <td data-label="Te cuesta" class="align-right mono">${money(costo)}<span class="celda-meta">${pctTexto(total)}</span></td>
      <td data-label="Te queda" class="align-right mono">${money(queda)}</td>
      <td data-label="Para que te quede lo mismo, cobrá" class="align-right mono">${cobrar == null ? "—" : money(cobrar)}</td>`;
}

function pintarTarifas() {
  cuerpoTarifas.innerHTML = [
    `<tr data-cuotas="1">
      <td data-label="Plan" class="m-titulo">1 pago<span class="celda-meta">Sin costo de cuotas</span></td>
      <td data-label="Costo de las cuotas (% sin IVA)" class="align-right mono">—</td>${celdasPlan(0)}
    </tr>`,
    ...tarifas.filas.map((f) => {
      const costo = Number(f.costo_pct);
      return `<tr data-cuotas="${esc(f.cuotas)}">
      <td data-label="Plan" class="m-titulo">${esc(f.cuotas)} cuotas sin interés</td>
      <td data-label="Costo de las cuotas (% sin IVA)" class="align-right"><input type="number" class="tarifa-costo" min="0" max="100" step="0.01" inputmode="decimal" value="${esc(costo)}" aria-label="Costo de ${esc(f.cuotas)} cuotas" /></td>${celdasPlan(costo)}
    </tr>`;
    })
  ].join("");
  btnRestaurarTarifas.hidden = tarifas.origen !== "propias";
  document.getElementById("mpTarifasOrigen").textContent =
    tarifas.origen === "propias"
      ? `Son tus tarifas, actualizadas el ${fechaAR(tarifas.actualizado_en.slice(0, 10))}. El costo de las cuotas es el que publica Mercado Pago, sin IVA: acá se le suma el ${tarifas.iva_pct} %.`
      : `Cifras de referencia de la ayuda de Mercado Pago, vigentes desde el ${fechaAR(tarifas.vigente_desde)} y sin IVA. Todavía sin confirmar: Mercado Pago las cambia seguido y no las da por API, así que revisalas en tu cuenta (Costos y cuotas) y corregí las que no coincidan.`;
}

// Recalcula sin volver a dibujar, para no sacarle el foco al que está tipeando.
function recalcularTarifas() {
  for (const fila of cuerpoTarifas.querySelectorAll("tr")) {
    const costo = Number(fila.querySelector(".tarifa-costo")?.value) || 0;
    const celdas = fila.querySelectorAll("td");
    const nuevas = document.createElement("tr");
    nuevas.innerHTML = celdasPlan(costo);
    celdas[2].replaceWith(nuevas.children[0]);
    celdas[3].replaceWith(nuevas.children[0]);
    celdas[4].replaceWith(nuevas.children[0]);
  }
}

async function cargarTarifas() {
  tarifas = await api("/api/integraciones/mercadopago/tarifas", { error: "No se pudieron cargar las tarifas de Mercado Pago." });
  // La comisión de partida es el promedio de lo que ya cobró Mercado Pago.
  const cobrado = (estado.costos ?? []).reduce((suma, f) => suma + f.importe, 0);
  const comision = (estado.costos ?? []).reduce((suma, f) => suma + f.comision, 0);
  if (!comisionTarifas.value && cobrado > 0) comisionTarifas.value = (Math.round((comision / cobrado) * 10000) / 100).toString();
  pintarTarifas();
  document.getElementById("mpTarifasPanel").hidden = false;
}

montoTarifas.addEventListener("input", recalcularTarifas);
comisionTarifas.addEventListener("input", recalcularTarifas);
cuerpoTarifas.addEventListener("input", (e) => {
  if (e.target.closest(".tarifa-costo")) recalcularTarifas();
});

document.getElementById("btnMpTarifasGuardar").addEventListener("click", async () => {
  const filas = [...cuerpoTarifas.querySelectorAll("tr[data-cuotas]")]
    .filter((fila) => fila.querySelector(".tarifa-costo"))
    .map((fila) => ({ cuotas: fila.dataset.cuotas, costo_pct: fila.querySelector(".tarifa-costo").value }));
  tarifas = await api("/api/integraciones/mercadopago/tarifas", { method: "PUT", body: { filas }, error: "No se pudieron guardar las tarifas." });
  avisar("Tarifas guardadas.", "ok");
  pintarTarifas();
});

btnRestaurarTarifas.addEventListener("click", async () => {
  tarifas = await api("/api/integraciones/mercadopago/tarifas", { method: "DELETE", error: "No se pudo volver a la tabla de referencia." });
  avisar("Volviste a la tabla de referencia.", "ok");
  pintarTarifas();
});

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
  await cargarTarifas();
  if (!estado.conectada) return;
  listaPagos.innerHTML = estado.pagos.length
    ? estado.pagos.map(filaDePago).join("")
    : `<li><p class="tn-vacio">Todavía no llegó ningún pago. Creá un link desde “Registrar cobro” en una venta.</p></li>`;
  pintarActividadCanal(document.getElementById("mpActividad"), estado.actividad);
  pintarCaja();
  pintarCostos();
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
