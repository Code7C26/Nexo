/**
 * dominios/cierre.js
 * El cierre del día y del mes (hist. §193): todas las cajas de todas las
 * sucursales juntas, y lo de cada una. Lo vendido en las cajas, lo que se
 * vendió fuera de ellas (Ventas, las tiendas online), cómo pagaron, lo que
 * salió del cajón y las diferencias de arqueo; en el mes, además, día por
 * día. Los números salen de GET /api/cierre-caja. Es del admin.
 */

import { api } from "../core/api.js";
import { esc, fechaAR, fechaHoraAR, money, numero } from "../core/formato.js";
import { filaVacia } from "../core/ui.js";
import { alEntrarEnVista } from "../core/registro.js";

const inputDia = document.getElementById("cierreDia");
const inputMes = document.getElementById("cierreMes");
const botonesModo = document.querySelectorAll("#cierreModo .segmento");

let modo = "dia";
const CENTAVO = 0.005;

const hoy = () => new Date().toLocaleDateString("sv-SE");
const ventasDe = (n) => `${numero(n)} ${n === 1 ? "venta" : "ventas"}`;
const claseDiferencia = (d) => (Math.abs(d) < CENTAVO ? "" : d < 0 ? "ledger-warn" : "ledger-ok");
function textoDiferencia(d) {
  if (Math.abs(d) < CENTAVO) return "Sin diferencia";
  return d < 0 ? `Faltan ${money(-d)}` : `Sobran ${money(d)}`;
}

function rango() {
  if (modo === "dia") {
    const dia = inputDia.value || hoy();
    return { desde: dia, hasta: dia };
  }
  const [y, m] = (inputMes.value || hoy().slice(0, 7)).split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mes = `${y}-${String(m).padStart(2, "0")}`;
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

async function cargar() {
  if (!inputDia.value) inputDia.value = hoy();
  if (!inputMes.value) inputMes.value = hoy().slice(0, 7);
  const { desde, hasta } = rango();
  const cierre = await api(`/api/cierre-caja?desde=${desde}&hasta=${hasta}`, { error: "No se pudo armar el cierre." });
  pintar(cierre);
}

function pintar({ desde, hasta, totales, sucursales, dias }) {
  document.getElementById("cierreRango").textContent =
    desde === hasta ? `Cierre del ${fechaAR(desde)}` : `Cierre del ${fechaAR(desde)} al ${fechaAR(hasta)}`;

  const abiertas = document.getElementById("cierreAbiertas");
  abiertas.hidden = totales.abiertos === 0;
  abiertas.querySelector("p").textContent =
    totales.abiertos === 1
      ? "Hay una caja con el turno abierto: sus números todavía pueden cambiar."
      : `Hay ${numero(totales.abiertos)} cajas con el turno abierto: sus números todavía pueden cambiar.`;

  document.getElementById("cierreVendido").textContent = money(totales.ventas.total);
  document.getElementById("cierreVendidoNota").textContent =
    `${ventasDe(totales.ventas.cantidad)} en ${numero(totales.turnos)} ${totales.turnos === 1 ? "turno" : "turnos"}`;
  document.getElementById("cierreSinCaja").textContent = money(totales.sin_caja.total);
  document.getElementById("cierreSinCajaNota").textContent = `${ventasDe(totales.sin_caja.cantidad)} desde Ventas o las tiendas online`;
  const diferencias = document.getElementById("cierreDiferencias");
  diferencias.textContent = Math.abs(totales.diferencias) < CENTAVO ? money(0) : money(totales.diferencias);
  diferencias.className = `kpi-cifra mono ${claseDiferencia(totales.diferencias)}`;
  document.getElementById("cierreDiferenciasNota").textContent = textoDiferencia(totales.diferencias);
  document.getElementById("cierreEgresos").textContent = money(totales.egresos);
  document.getElementById("cierreEgresosNota").textContent = totales.otros_ingresos
    ? `Y entraron ${money(totales.otros_ingresos)} que no son ventas`
    : "Gastos y retiros pagados con la caja";

  document.getElementById("cierreMediosBody").innerHTML = totales.cobros_por_medio.length
    ? totales.cobros_por_medio
        .map(
          (m) => `
        <tr>
          <td data-label="Medio">${esc(m.medio)}</td>
          <td data-label="Cobros" class="align-right mono">${numero(m.cantidad)}</td>
          <td data-label="Importe" class="align-right mono">${money(m.importe)}</td>
        </tr>`
        )
        .join("")
    : filaVacia(3, "No se cobró nada en las cajas.");

  pintarSucursales(sucursales);

  document.getElementById("cierreDiasPanel").hidden = modo !== "mes";
  document.getElementById("cierreDiasBody").innerHTML = dias.length
    ? dias
        .map(
          (d) => `
        <tr>
          <td data-label="Día">${esc(fechaAR(d.fecha))}</td>
          <td data-label="En las cajas" class="align-right"><span class="mono">${money(d.ventas.total)}</span><span class="pos-celda-detalle">${esc(ventasDe(d.ventas.cantidad))}</span></td>
          <td data-label="Fuera de las cajas" class="align-right"><span class="mono">${money(d.sin_caja.total)}</span><span class="pos-celda-detalle">${esc(ventasDe(d.sin_caja.cantidad))}</span></td>
          <td data-label="Diferencias" class="align-right mono ${esc(claseDiferencia(d.diferencias))}">${esc(textoDiferencia(d.diferencias))}</td>
        </tr>`
        )
        .join("")
    : filaVacia(4, "No hubo movimiento en el mes.");
}

// "09:00 a 18:30", o con las dos fechas si el turno pasó la medianoche.
function horario(t) {
  const [desdeFecha, desdeHora] = fechaHoraAR(t.abierto_en).split(" ");
  if (t.estado === "abierto") return `Desde ${desdeFecha} ${desdeHora}, abierto`;
  const [hastaFecha, hastaHora] = fechaHoraAR(t.cerrado_en).split(" ");
  return desdeFecha === hastaFecha
    ? `${desdeFecha}, ${desdeHora} a ${hastaHora}`
    : `${desdeFecha} ${desdeHora} a ${hastaFecha} ${hastaHora}`;
}

const quienes = (t) =>
  !t.cerrado_por_nombre || t.abierto_por_nombre === t.cerrado_por_nombre
    ? t.abierto_por_nombre
    : `${t.abierto_por_nombre} y ${t.cerrado_por_nombre}`;

// Un panel por sucursal (o uno solo, "Cajas", si el negocio no tiene), con
// sus totales y cada turno de cada caja.
function pintarSucursales(sucursales) {
  const contenedor = document.getElementById("cierreSucursales");
  if (!sucursales.length) {
    contenedor.innerHTML = `<section class="panel"><div class="panel-head"><h2>Cajas</h2></div><p class="nota-plana">Ninguna caja abrió en este período.</p></section>`;
    return;
  }
  contenedor.innerHTML = sucursales
    .map((s) => {
      const turnos = s.cajas.flatMap((c) => c.turnos.map((t) => ({ ...t, caja: c.nombre })));
      const titulo = s.nombre ?? (sucursales.length > 1 ? "Cajas sin sucursal" : "Cajas");
      const resumen = s.turnos
        ? `${money(s.ventas.total)} en ${ventasDe(s.ventas.cantidad)} · ${textoDiferencia(s.diferencias)}`
        : "No abrió ninguna caja.";
      const medios = s.cobros_por_medio.length
        ? `<p class="nota-plana">${s.cobros_por_medio.map((m) => `${esc(m.medio)}: <span class="mono">${money(m.importe)}</span>`).join(" · ")}</p>`
        : "";
      const filas = turnos
        .map((t) => {
          const diferencia = t.diferencia_apertura + (t.diferencia_cierre ?? 0);
          return `
          <tr>
            <td data-label="Caja">${esc(t.caja)}</td>
            <td data-label="Turno">${esc(horario(t))}<span class="pos-celda-detalle">${esc(quienes(t))}</span></td>
            <td data-label="Vendido" class="align-right"><span class="mono">${money(t.ventas.total)}</span><span class="pos-celda-detalle">${esc(ventasDe(t.ventas.cantidad))}</span></td>
            <td data-label="Esperado" class="align-right mono">${money(t.esperado)}</td>
            <td data-label="Contado" class="align-right mono">${t.estado === "cerrado" ? money(t.contado_cierre) : "—"}</td>
            <td data-label="Diferencia" class="align-right mono ${claseDiferencia(diferencia)}">${t.estado === "cerrado" ? esc(textoDiferencia(diferencia)) : "Abierto"}</td>
          </tr>`;
        })
        .join("");
      const tabla = turnos.length
        ? `<div class="tabla-scroll"><table class="ledger-table lista-movil">
            <thead><tr>
              <th scope="col">Caja</th><th scope="col">Turno</th><th scope="col" class="align-right">Vendido</th>
              <th scope="col" class="align-right">Esperado</th><th scope="col" class="align-right">Contado</th><th scope="col" class="align-right">Diferencia</th>
            </tr></thead>
            <tbody>${filas}</tbody></table></div>`
        : "";
      return `
        <section class="panel">
          <div class="panel-head"><h2>${esc(titulo)}</h2></div>
          <p class="nota-plana">${esc(resumen)}</p>
          ${medios}
          ${tabla}
        </section>`;
    })
    .join("");
}

for (const boton of botonesModo) {
  boton.addEventListener("click", () => {
    modo = boton.dataset.modo;
    for (const b of botonesModo) b.setAttribute("aria-pressed", String(b === boton));
    inputDia.closest("label").hidden = modo !== "dia";
    inputMes.closest("label").hidden = modo !== "mes";
    cargar();
  });
}
inputDia.addEventListener("change", cargar);
inputMes.addEventListener("change", cargar);

alEntrarEnVista("cierre", () => cargar());
