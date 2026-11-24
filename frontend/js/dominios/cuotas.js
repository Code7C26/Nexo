/**
 * dominios/cuotas.js
 * Cuotas (#/cuotas, hist. §208): los cobros de las cuotas de los socios de un
 * mes, uno por socio y por período, con los planes que lleva. Es la lista de
 * cobros de los sistemas de gimnasios (Gymdesk: Billing → Payments, con su
 * estado), y la razón por la que las cuotas ya no se listan en Ventas.
 * Cobrar es un toque por medio de cobro (hist. §215, core/cobro-medio.js),
 * como en la ficha del socio. Sobre GET /api/socios/cuotas y
 * POST /api/socios/:id/cobros (con venta_id). "Otro importe" abre el
 * "Registrar cobro" de Ventas: un pago parcial o el QR de Mercado Pago.
 * Una vencida se recuerda por WhatsApp con un toque (hist. §219,
 * core/recordar.js).
 */

import { badge, esc, fechaAR, hoyISO, money } from "../core/formato.js";
import { avisar, filaVacia, tablaCargando } from "../core/ui.js";
import { api, refrescar } from "../core/api.js";
import { alEntrarEnVista, invocar, recargar, registrar } from "../core/registro.js";
import { LOCALE } from "../core/idioma.js";
import { botonesDeMedios, cargarMediosDeCobro, confirmarCobroConMedio } from "../core/cobro-medio.js";
import { anotarRecordatorio, botonRecordar, preguntarSiLoMando } from "../core/recordar.js";

let mes = hoyISO().slice(0, 7);
let datos = { cuotas: [], totales: {} };
let cuentas = [];
let medios = [];
let filtro = "todas";
// La fila que muestra los botones de cada medio en vez de "Cobrar".
let cobrando = null;

const cuerpo = document.getElementById("cuotasBody");
const buscar = document.getElementById("cuotasBuscar");

const nombreMes = (aaaamm) => {
  const [y, m] = aaaamm.split("-").map(Number);
  const texto = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(LOCALE, { month: "long", year: "numeric", timeZone: "UTC" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};
const otroMes = (aaaamm, n) => {
  const [y, m] = aaaamm.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`;
};

const vencida = (c) => c.saldo > 0 && c.desde < hoyISO();
const FILTROS = {
  todas: () => true,
  por_cobrar: (c) => c.saldo > 0,
  vencidas: vencida,
  pagadas: (c) => c.estado === "pagada"
};

function estadoCuota(c) {
  if (c.estado === "pagada") return badge("status-cobrado", "Pagada").html;
  if (c.estado === "bonificada") return badge("", "Bonificada").html;
  if (c.estado === "sin_cargo") return badge("", "Sin cargo").html;
  if (c.estado === "parcial") return badge("status-pendiente", `Falta ${money(c.saldo)}`).html;
  return vencida(c) ? badge("status-vencido", "Vencida").html : badge("status-pendiente", "Vence hoy").html;
}

// Facturar va como en Ventas: la cuota es una venta por dentro. Un combo de
// antes de hist. §208 lleva una venta por plan: no se ofrece (serían dos
// facturas con el precio repartido).
const botonFacturar = (c) =>
  c.facturada || c.estado === "bonificada" || c.ventas.length > 1
    ? ""
    : `<button type="button" class="btn btn-secundario btn-chico" data-facturar="${c.venta_id}">Facturar</button>`;

const botonRecordarCuota = (c) =>
  vencida(c)
    ? botonRecordar({
        telefono: c.telefono,
        tipo: "cuota",
        datos: { nombre: c.socio, plan: c.planes.join(" + "), deuda: c.saldo, vencimiento: c.desde },
        recordatorio: c.recordatorio,
        atributos: `data-recordar="${c.venta_id}"`
      })
    : "";

function accionesCuota(c) {
  if (c.saldo <= 0) return `<div class="cuotas-cuentas">${botonFacturar(c)}</div>`;
  if (cobrando !== c.venta_id) {
    return `<div class="cuotas-cuentas">${botonFacturar(c)}${botonRecordarCuota(c)}<button type="button" class="btn btn-secundario btn-chico" data-cobrar="${c.venta_id}">Cobrar</button></div>`;
  }
  // "Otro importe" cobra una venta: el de un combo de varias, desde la ficha.
  const otro = c.ventas.length > 1 ? "" : `<button type="button" class="btn-link" data-otro="${c.venta_id}">Otro importe</button>`;
  return `<div class="cuotas-cuentas">${botonesDeMedios(medios, `data-venta="${c.venta_id}"`)}${otro}<button type="button" class="btn-link" data-cancelar>Cancelar</button></div>`;
}

function pintar() {
  const { totales } = datos;
  document.getElementById("cuotasTitulo").textContent = `Cuotas de ${nombreMes(mes).toLowerCase()}`;
  document.getElementById("cuotasCantidad").textContent = String(totales.cuotas ?? 0);
  document.getElementById("cuotasCobrado").textContent = money(totales.cobrado ?? 0);
  document.getElementById("cuotasPorCobrar").textContent = money(totales.por_cobrar ?? 0);
  document.getElementById("cuotasVencido").textContent = money(totales.vencido ?? 0);
  document.getElementById("btnCuotasMesSiguiente").disabled = mes >= hoyISO().slice(0, 7);

  const texto = buscar.value.trim().toLowerCase();
  const visibles = datos.cuotas.filter(
    (c) => FILTROS[filtro](c) && (!texto || c.socio.toLowerCase().includes(texto) || String(c.numero) === texto)
  );
  if (!visibles.length) {
    const vacio = datos.cuotas.length ? "Ninguna cuota con ese filtro." : `No hay cuotas de ${nombreMes(mes).toLowerCase()}.`;
    cuerpo.innerHTML = filaVacia(6, vacio);
    return;
  }
  cuerpo.innerHTML = visibles
    .map(
      (c) => `
    <tr>
      <td data-label="Socio"><button type="button" class="btn-link" data-socio="${c.socio_id}">${esc(c.socio)}</button><span class="celda-meta">N° ${esc(String(c.numero))}</span></td>
      <td data-label="Planes">${esc(c.planes.join(" + "))}</td>
      <td data-label="Período">${esc(fechaAR(c.desde))} al ${esc(fechaAR(c.hasta))}</td>
      <td data-label="Importe" class="align-right mono">${money(c.importe)}</td>
      <td data-label="Estado">${estadoCuota(c)}</td>
      <td data-label="">${accionesCuota(c)}</td>
    </tr>`
    )
    .join("");
}

async function cargarCuotas() {
  datos = await api(`/api/socios/cuotas?mes=${mes}`, { error: "No se pudieron cargar las cuotas." });
}

async function cargarCuentas() {
  const [todas, activos] = await Promise.all([api("/api/cuentas-tesoreria", { error: "No se pudieron cargar las cuentas." }), cargarMediosDeCobro()]);
  cuentas = todas.filter((c) => c.activa !== 0 && c.activa !== false);
  medios = activos;
}

async function cambiarMes(n) {
  mes = otroMes(mes, n);
  cobrando = null;
  tablaCargando("cuotasBody", 6);
  await cargarCuotas();
  pintar();
}

async function cobrar(boton) {
  const cuota = datos.cuotas.find((c) => c.venta_id === Number(boton.dataset.venta));
  const medio = medios.find((m) => m.id === Number(boton.dataset.medio));
  if (!cuota || !medio) return;
  const como = await confirmarCobroConMedio({
    medio,
    cuentas,
    importe: cuota.saldo,
    quien: cuota.socio,
    que: `la cuota de ${cuota.planes.join(" + ")}`
  });
  if (!como) return;
  boton.disabled = true;
  try {
    const resultado = await api(`/api/socios/${cuota.socio_id}/cobros`, {
      method: "POST",
      body: { ...como, venta_ids: cuota.ventas },
      error: "No se pudo registrar el cobro."
    });
    avisar(`Cobrado ${money(resultado.cobrado)} con ${resultado.en}.`, "ok");
  } catch {
    boton.disabled = false;
    return;
  }
  cobrando = null;
  await refrescar([cargarCuotas(), recargar("socios", "ventas", "caja", "clientes", "cuentasCorrientes")]);
  pintar();
}

// Recordar abre WhatsApp (el enlace); si se mandó, acá se anota.
async function anotar(enlace) {
  const cuota = datos.cuotas.find((c) => c.venta_id === Number(enlace.dataset.recordar));
  if (!cuota || !(await preguntarSiLoMando(enlace))) return;
  const recordatorio = await anotarRecordatorio(cuota.cliente_id, "cuota", cuota.venta_id);
  if (!recordatorio) return;
  cuota.recordatorio = recordatorio;
  pintar();
}

cuerpo.addEventListener("click", (e) => {
  const recordar = e.target.closest("[data-recordar]");
  if (recordar) return anotar(recordar);
  const socio = e.target.closest("[data-socio]");
  if (socio) return invocar("abrirFicha:socio", Number(socio.dataset.socio));
  const facturar = e.target.closest("[data-facturar]");
  if (facturar) return invocar("facturar:venta", Number(facturar.dataset.facturar));
  const abrir = e.target.closest("[data-cobrar]");
  if (abrir) {
    cobrando = Number(abrir.dataset.cobrar);
    return pintar();
  }
  if (e.target.closest("[data-cancelar]")) {
    cobrando = null;
    return pintar();
  }
  const otro = e.target.closest("[data-otro]");
  if (otro) {
    cobrando = null;
    pintar();
    return invocar("cobrar:venta", Number(otro.dataset.otro));
  }
  const medio = e.target.closest("[data-medio]");
  if (medio) cobrar(medio);
});

document.getElementById("cuotasFiltro").addEventListener("click", (e) => {
  const boton = e.target.closest("[data-filtro]");
  if (!boton) return;
  filtro = boton.dataset.filtro;
  for (const b of e.currentTarget.querySelectorAll("[data-filtro]")) b.setAttribute("aria-pressed", String(b === boton));
  pintar();
});
buscar.addEventListener("input", pintar);
document.getElementById("btnCuotasMesAnterior").addEventListener("click", () => cambiarMes(-1));
document.getElementById("btnCuotasMesSiguiente").addEventListener("click", () => cambiarMes(1));

document.addEventListener("cobro-registrado", async () => {
  if (document.querySelector('[data-view="cuotas"]')?.hidden) return;
  await cargarCuotas();
  pintar();
});

registrar("cargar:cuotas", async () => {
  await cargarCuotas();
  pintar();
});

alEntrarEnVista("cuotas", async () => {
  cobrando = null;
  tablaCargando("cuotasBody", 6);
  await refrescar([cargarCuotas(), cargarCuentas()]);
  pintar();
});
