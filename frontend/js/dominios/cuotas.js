/**
 * dominios/cuotas.js
 * Cuotas (#/cuotas, hist. §208): los cobros de las cuotas de los socios de un
 * mes, uno por socio y por período, con los planes que lleva. Es la lista de
 * cobros de los sistemas de gimnasios (Gymdesk: Billing → Payments, con su
 * estado), y la razón por la que las cuotas ya no se listan en Ventas.
 * Cobrar es un toque por cuenta, como en la ficha del socio. Sobre
 * GET /api/socios/cuotas y POST /api/socios/:id/cobros (con venta_id).
 */

import { badge, esc, fechaAR, hoyISO, money } from "../core/formato.js";
import { avisar, confirmar, filaVacia, tablaCargando } from "../core/ui.js";
import { api, refrescar } from "../core/api.js";
import { icono } from "../core/iconos.js";
import { alEntrarEnVista, invocar, recargar, registrar } from "../core/registro.js";
import { LOCALE } from "../core/idioma.js";

const ICONO_TIPO_CUENTA = { efectivo: "banknote", banco: "building-2", mercadopago: "wallet", otro: "wallet" };

let mes = hoyISO().slice(0, 7);
let datos = { cuotas: [], totales: {} };
let cuentas = [];
let filtro = "todas";
// La fila que muestra los botones de cada cuenta en vez de "Cobrar".
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

function accionesCuota(c) {
  if (c.saldo <= 0) return "";
  if (cobrando !== c.venta_id) {
    return `<button type="button" class="btn btn-secundario btn-chico" data-cobrar="${c.venta_id}">Cobrar</button>`;
  }
  // La de efectivo primero y resaltada, como en la recepción.
  const orden = [...cuentas].sort((a, b) => Number(b.tipo === "efectivo") - Number(a.tipo === "efectivo"));
  return `<div class="cuotas-cuentas">${orden
    .map(
      (cuenta, i) => `
      <button type="button" class="btn ${i === 0 ? "btn-primary" : "btn-secundario"} btn-chico" data-cuenta="${cuenta.id}" data-venta="${c.venta_id}">
        ${icono(ICONO_TIPO_CUENTA[cuenta.tipo] ?? "wallet")} ${esc(cuenta.nombre)}
      </button>`
    )
    .join("")}<button type="button" class="btn-link" data-cancelar>Cancelar</button></div>`;
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
  const todas = await api("/api/cuentas-tesoreria", { error: "No se pudieron cargar las cuentas." });
  cuentas = todas.filter((c) => c.activa !== 0 && c.activa !== false);
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
  const cuenta = cuentas.find((c) => c.id === Number(boton.dataset.cuenta));
  if (!cuota || !cuenta) return;
  const ok = await confirmar({
    titulo: "Cobrar la cuota",
    cuerpo: `¿Cobrarle ${money(cuota.saldo)} a ${cuota.socio} en ${cuenta.nombre}? Es la cuota de ${cuota.planes.join(" + ")}.`,
    aceptar: `Cobrar ${money(cuota.saldo)}`
  });
  if (!ok) return;
  boton.disabled = true;
  try {
    const resultado = await api(`/api/socios/${cuota.socio_id}/cobros`, {
      method: "POST",
      body: { cuenta_tesoreria_id: cuenta.id, venta_id: cuota.venta_id },
      error: "No se pudo registrar el cobro."
    });
    avisar(`Cobrado ${money(resultado.cobrado)} en ${cuenta.nombre}.`, "ok");
  } catch {
    boton.disabled = false;
    return;
  }
  cobrando = null;
  await refrescar([cargarCuotas(), recargar("socios", "ventas", "caja", "clientes", "cuentasCorrientes")]);
  pintar();
}

cuerpo.addEventListener("click", (e) => {
  const socio = e.target.closest("[data-socio]");
  if (socio) return invocar("abrirFicha:socio", Number(socio.dataset.socio));
  const abrir = e.target.closest("[data-cobrar]");
  if (abrir) {
    cobrando = Number(abrir.dataset.cobrar);
    return pintar();
  }
  if (e.target.closest("[data-cancelar]")) {
    cobrando = null;
    return pintar();
  }
  const cuenta = e.target.closest("[data-cuenta]");
  if (cuenta) cobrar(cuenta);
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
