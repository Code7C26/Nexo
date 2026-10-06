/**
 * dominios/cuentas-corrientes.js
 * Cuentas corrientes (a cobrar y a pagar). Movido tal cual desde app.js
 * (CLAUDE.md §31, Etapa B / F4); lo único que cambia es que las acciones de
 * otros dominios (fichas, cobrar, pagar) se invocan por nombre.
 */

import { money, numero } from "../core/formato.js";
import { filaVacia, filaVaciaFiltrada, tablaCargando } from "../core/ui.js";
import { crearFiltros } from "../core/filtros.js";
import { descargarCSV } from "../core/csv.js";
import { invocar, registrar } from "../core/registro.js";

/* ---------- Cuentas corrientes (a cobrar y a pagar) ---------- */

// Mismo criterio de color que ESTADO_COBRO_CLASE: verde = sin urgencia,
// amarillo = empieza a atrasarse, rojo = viejo. El backend ya calcula el
// tramo por operación (server.js, tramoDeVencimiento) midiendo contra el
// vencimiento pactado — acá solo se traduce a clase/etiqueta visual. Los dos
// tramos más viejos comparten el rojo: ya son deuda vencida, la diferencia
// de cuánto la da la columna de días.
const CC_TRAMO_CLASE = {
  a_vencer: "status-cobrado",
  vencido_30: "status-pendiente",
  vencido_60: "status-vencido",
  vencido_mas: "status-vencido"
};
const CC_TRAMO_LABEL = {
  a_vencer: "A vencer",
  vencido_30: "Vencido 1-30",
  vencido_60: "Vencido 31-60",
  vencido_mas: "Vencido +60"
};

// "Vence en 5 días" / "Vencido hace 5 días" / "Vence hoy", según el signo.
// `dias` viene del backend como distancia desde el vencimiento hasta hoy.
function ccTextoDias(dias) {
  if (dias === null) return "A favor";
  if (dias === 0) return "Vence hoy";
  return dias < 0 ? `Vence en ${numero(-dias)} días` : `Vencido hace ${numero(dias)} días`;
}

// La operación "más vieja" tiene que ser la deuda más vieja, no
// simplemente operaciones[0]: si una entidad tiene una operación con
// crédito a favor (pendiente negativo, sin tramo) fechada antes que su
// deuda real, esa no cuenta para "hace cuánto que me debe".
function ccMasVieja(entidad) {
  const conDeuda = entidad.operaciones.filter((o) => o.tramo);
  return conDeuda.find((o) => o.dias === entidad.dias_max) ?? conDeuda[0] ?? entidad.operaciones[0];
}

function renderCcTabla(bodyId, lista, filtros, { tipoLabel, tipoClave, accionLabel, abrirFicha, abrirAccion }) {
  const body = document.getElementById(bodyId);
  body.innerHTML = "";

  if (lista.length === 0) {
    if (filtros.filtros.length > 0) {
      body.innerHTML = filaVaciaFiltrada(6);
      body.querySelector(".tabla-vacia-limpiar").addEventListener("click", () => filtros.limpiar());
    } else {
      body.innerHTML = filaVacia(
        6,
        tipoClave === "cliente" ? "Nadie te debe: todo cobrado." : "No le debés nada a nadie: todo pagado."
      );
    }
    return;
  }

  for (const e of lista) {
    const masVieja = ccMasVieja(e);
    const fila = document.createElement("tr");
    fila.className = "fila-clickeable";
    fila.innerHTML = `
      <td data-label="${tipoLabel}"><button type="button" class="btn-link cc-abrir-ficha" data-id="${e.id}">${e.nombre}</button></td>
      <td data-label="Deuda" class="align-right mono">${money(e.saldo)}</td>
      <td data-label="Operaciones">${numero(e.operaciones.length)}</td>
      <td data-label="Vence">${masVieja.vencimiento}</td>
      <td data-label="Estado"><span class="status ${CC_TRAMO_CLASE[masVieja.tramo]}">${CC_TRAMO_LABEL[masVieja.tramo]}</span></td>
      <td data-label="" class="cc-chevron">▸</td>
    `;

    const detalle = document.createElement("tr");
    detalle.className = "cc-detalle-fila";
    detalle.hidden = true;
    detalle.innerHTML = `
      <td colspan="6">
        <table class="cc-detalle">
          <tbody>
            ${e.operaciones
              .map(
                (o) => `
              <tr>
                <td data-label="Fecha">${o.fecha}</td>
                <td data-label="Vence">${o.vencimiento}</td>
                <td data-label="Pendiente" class="align-right mono">${money(o.pendiente)}</td>
                <td data-label="Estado">${ccTextoDias(o.dias)}</td>
                <td data-label=""><button type="button" class="btn-fila cc-accion" data-id="${o.id}">${accionLabel}</button></td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </td>`;

    fila.addEventListener("click", (ev) => {
      if (ev.target.closest("button")) return;
      detalle.hidden = !detalle.hidden;
      fila.querySelector(".cc-chevron").textContent = detalle.hidden ? "▸" : "▾";
    });
    fila.querySelector(".cc-abrir-ficha").addEventListener("click", () => abrirFicha(e.id));

    body.appendChild(fila);
    body.appendChild(detalle);
  }

  body.querySelectorAll(".cc-accion").forEach((btn) => {
    btn.addEventListener("click", () => abrirAccion(Number(btn.dataset.id)));
  });
}

function renderCuentasCorrientes(datos) {
  const { por_cobrar, por_pagar, a_favor_clientes, a_favor_proveedores, totales } = datos;

  document.getElementById("ccPorCobrar").textContent = money(totales.por_cobrar);
  document.getElementById("ccPorPagar").textContent = money(totales.por_pagar);
  const neto = document.getElementById("ccNeto");
  neto.textContent = money(totales.neto);
  neto.classList.toggle("saldo-negativo", totales.neto < 0);
  neto.classList.toggle("ledger-ok", totales.neto >= 0);

  const notaFavorClientes = document.getElementById("ccNotaFavorClientes");
  notaFavorClientes.hidden = a_favor_clientes.length === 0;
  if (a_favor_clientes.length > 0) {
    notaFavorClientes.textContent = `A favor de ${a_favor_clientes.length} cliente(s) por ${money(totales.a_favor_clientes)} (crédito de una devolución sin reintegro): no suma a la deuda de nadie más.`;
  }
  const notaFavorProveedores = document.getElementById("ccNotaFavorProveedores");
  notaFavorProveedores.hidden = a_favor_proveedores.length === 0;
  if (a_favor_proveedores.length > 0) {
    notaFavorProveedores.textContent = `A favor de ${a_favor_proveedores.length} proveedor(es) por ${money(totales.a_favor_proveedores)}: no compensa la deuda con otro proveedor.`;
  }

  renderCcTabla(
    "ccCobrarBody",
    filtrosCcCobrar.aplicar(por_cobrar),
    filtrosCcCobrar,
    {
      tipoLabel: "Cliente",
      tipoClave: "cliente",
      accionLabel: "Cobrar",
      abrirFicha: (id) => invocar("abrirFicha:cliente", id),
      abrirAccion: (id) => invocar("cobrar:venta", id)
    }
  );
  renderCcTabla(
    "ccPagarBody",
    filtrosCcPagar.aplicar(por_pagar),
    filtrosCcPagar,
    {
      tipoLabel: "Proveedor",
      tipoClave: "proveedor",
      accionLabel: "Pagar",
      abrirFicha: (id) => invocar("abrirFicha:proveedor", id),
      abrirAccion: (id) => invocar("pagar:compra", id)
    }
  );
}

function filtrarCcCobrar() {
  renderCuentasCorrientes(ccUltimaRespuesta);
}
function filtrarCcPagar() {
  renderCuentasCorrientes(ccUltimaRespuesta);
}

const filtrosCcCobrar = crearFiltros(
  "filtrosCcCobrar",
  [
    { clave: "nombre", etiqueta: "Cliente", tipo: "texto" },
    { clave: "saldo", etiqueta: "Deuda", tipo: "numero" },
    { clave: "dias_max", etiqueta: "Días vencido", tipo: "numero" }
  ],
  filtrarCcCobrar
);

const filtrosCcPagar = crearFiltros(
  "filtrosCcPagar",
  [
    { clave: "nombre", etiqueta: "Proveedor", tipo: "texto" },
    { clave: "saldo", etiqueta: "Deuda", tipo: "numero" },
    { clave: "dias_max", etiqueta: "Días vencido", tipo: "numero" }
  ],
  filtrarCcPagar
);

// Guarda la última respuesta cruda del endpoint para que los filtros y el
// orden (que solo tocan una de las dos tablas) puedan re-renderizar sin
// pedir los datos de nuevo — es una foto de hoy, no cambia entre filtros.
let ccUltimaRespuesta = {
  por_cobrar: [],
  por_pagar: [],
  a_favor_clientes: [],
  a_favor_proveedores: [],
  totales: { por_cobrar: 0, por_pagar: 0, a_favor_clientes: 0, a_favor_proveedores: 0, neto: 0 }
};

async function cargarCuentasCorrientes() {
  tablaCargando("ccCobrarBody", 6);
  tablaCargando("ccPagarBody", 6);
  const datos = await (await fetch("/api/cuentas-corrientes")).json();
  ccUltimaRespuesta = datos;
  renderCuentasCorrientes(datos);
}

// Cuentas corrientes tiene dos tablas independientes (a cobrar y a pagar), así
// que lleva un botón por panel y no uno por vista. Cada lista es plana: las
// filas expandibles (.cc-detalle) son un detalle del render, no de los datos.
const COLUMNAS_CSV_CC = (tipoLabel) => [
  { titulo: tipoLabel, valor: (e) => e.nombre },
  { titulo: "Teléfono", valor: (e) => e.telefono },
  { titulo: "Email", valor: (e) => e.email },
  { titulo: "Saldo", valor: (e) => e.saldo },
  { titulo: "Operaciones pendientes", valor: (e) => e.operaciones?.filter((o) => o.pendiente > 0).length ?? 0 },
  // La operación pendiente que vence primero: las operaciones vienen
  // ordenadas por vencimiento ascendente desde el backend.
  { titulo: "Vence", valor: (e) => e.operaciones?.find((o) => o.pendiente > 0)?.vencimiento ?? "" },
  { titulo: "Días vencido", valor: (e) => e.dias_max }
];

document.getElementById("btnExportarCcCobrar").addEventListener("click", () => {
  descargarCSV(
    "nexo-cuentas-por-cobrar",
    COLUMNAS_CSV_CC("Cliente"),
    filtrosCcCobrar.aplicar(ccUltimaRespuesta?.por_cobrar ?? [])
  );
});

document.getElementById("btnExportarCcPagar").addEventListener("click", () => {
  descargarCSV(
    "nexo-cuentas-por-pagar",
    COLUMNAS_CSV_CC("Proveedor"),
    filtrosCcPagar.aplicar(ccUltimaRespuesta?.por_pagar ?? [])
  );
});

// Lo recargan las demás operaciones con recargar("cuentasCorrientes").
registrar("cargar:cuentasCorrientes", cargarCuentasCorrientes);
