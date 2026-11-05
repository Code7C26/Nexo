/**
 * dominios/tablero.js
 * -----------------------------------------------------------
 * El Resumen de cada persona (hist. §136): qué piezas ve, en qué orden y
 * contra qué compara, más las piezas nuevas que no salen de los reportes de
 * siempre: lo que hay que mirar hoy, cuándo se vende, dónde entró la plata y
 * quién vendió.
 *
 * Lo guarda el servidor por persona y negocio (GET/PUT/DELETE /api/tablero),
 * así sigue igual en el celular y en la compu; sin armar, es el del tipo de
 * negocio (tableroDelPreset en backend/perfiles.js). Las piezas son los
 * <div class="pieza" data-pieza> del Resumen en index.html: ordenarlas es
 * moverlas dentro de #tablero. Una pieza de un módulo apagado la sigue
 * ocultando el CSS ([data-modulo]); la de IVA, cargarReporteIva.
 *
 * Todo es del admin, como el resto del Resumen.
 */

import { api } from "../core/api.js";
import { esAdmin, esc, money, numero } from "../core/formato.js";
import { barrasHorizontales, montarColumnas } from "../core/graficos.js";
import { icono } from "../core/iconos.js";
import { moduloActivo, negocio } from "../core/negocio.js";
import { invocar } from "../core/registro.js";
import { avisar } from "../core/ui.js";

// Cómo se llama cada pieza en "Personalizar", y cuándo se puede elegir.
const PIEZAS = {
  resultado: { nombre: "Resultado", descripcion: "Ventas, costo, ganancia, gastos y lo que quedó." },
  pendiente: { nombre: "Para mirar hoy", descripcion: "Lo que te deben, lo que debés y lo que hay que reponer." },
  evolucion: { nombre: "Evolución del resultado", descripcion: "El resultado período por período, en gráfico y tabla." },
  ventas: { nombre: "Qué se vende", descripcion: "Cuánto vendiste, cuántas ventas, ticket promedio y cantidad." },
  cuando: { nombre: "Cuándo se vende", descripcion: "Por día de la semana y por hora." },
  productos: { nombre: "Lo más vendido", descripcion: "En barras, por ventas o por ganancia." },
  categorias: { nombre: "Ventas por categoría", descripcion: "En barras, por ventas o por ganancia." },
  cobros: { nombre: "Dónde entró la plata", descripcion: "Lo cobrado en cada cuenta: la caja, el banco, Mercado Pago." },
  vendedores: { nombre: "Quién vendió", descripcion: "Ventas y ticket promedio de cada persona." },
  clientes: { nombre: "Mejores clientes", descripcion: "Quién te compra más y cuándo compró por última vez." },
  canales: { nombre: "Por canal", descripcion: "El local, la tienda online, Mercado Libre, Instagram…", modulo: "canales" },
  movimientos: { nombre: "Últimos movimientos", descripcion: "Las últimas ventas, compras, gastos y devoluciones." },
  compras: { nombre: "Qué se compra", descripcion: "Proveedores, productos y categorías de lo comprado.", modulo: "compras" },
  iva: { nombre: "IVA", descripcion: "El IVA del período y los libros para el contador.", soloInscripto: true }
};

const disponible = (pieza) => {
  const info = PIEZAS[pieza];
  if (!info) return false;
  if (info.modulo && !moduloActivo(info.modulo)) return false;
  return !info.soloInscripto || negocio.condicion_iva === "responsable_inscripto";
};

let tablero = { orden: Object.keys(PIEZAS), ocultas: [], comparar: "anterior", personalizado: false };
let cargado = false;

// Contra qué compara la evolución: la lee app.js al pedirla.
export const comparacion = () => tablero.comparar;

const contenedor = document.getElementById("tablero");

function aplicarTablero() {
  for (const pieza of tablero.orden) {
    const el = contenedor.querySelector(`:scope > [data-pieza="${pieza}"]`);
    if (!el) continue;
    contenedor.append(el);
    el.classList.toggle("pieza-oculta", tablero.ocultas.includes(pieza));
  }
  document.getElementById("resumenComparar").value = tablero.comparar;
}

/* ---------- Las piezas nuevas ---------- */

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const ventasDe = (n) => `${numero(n)} ${n === 1 ? "venta" : "ventas"}`;

const dibujarDias = montarColumnas(document.getElementById("graficoDias"), { titulo: "Ventas por día de la semana" });
const dibujarHoras = montarColumnas(document.getElementById("graficoHoras"), { titulo: "Ventas por hora del día" });

function pintarPendiente({ por_cobrar: cobrar, por_pagar: pagar, sin_stock: sinStock, stock_bajo: bajo }) {
  const detalleDeuda = (d, quien) =>
    d.total <= 0 ? "Nada pendiente" : d.vencido > 0 ? `${money(d.vencido)} vencido · ${quien(d.cantidad)}` : `Nada vencido · ${quien(d.cantidad)}`;
  const elCobrar = document.getElementById("pendienteCobrar");
  elCobrar.textContent = money(cobrar.total);
  elCobrar.classList.toggle("saldo-negativo", cobrar.vencido > 0);
  document.getElementById("pendienteCobrarDetalle").textContent = detalleDeuda(cobrar, (n) => (n === 1 ? "1 cliente" : `${n} clientes`));
  const elPagar = document.getElementById("pendientePagar");
  elPagar.textContent = money(pagar.total);
  elPagar.classList.toggle("saldo-negativo", pagar.vencido > 0);
  document.getElementById("pendientePagarDetalle").textContent = detalleDeuda(pagar, (n) => (n === 1 ? "1 proveedor" : `${n} proveedores`));
  const reponer = sinStock + bajo;
  const elStock = document.getElementById("pendienteStock");
  elStock.textContent = reponer === 1 ? "1 producto" : `${numero(reponer)} productos`;
  elStock.classList.toggle("saldo-negativo", sinStock > 0);
  document.getElementById("pendienteStockDetalle").textContent =
    reponer === 0 ? "Todo con stock" : `${numero(sinStock)} sin stock · ${numero(bajo)} con poco`;
}

function pintarCuando({ dias, horas, sin_hora: sinHora }) {
  dibujarDias(dias, {
    etiqueta: (p) => DIAS[p.dia].slice(0, 3),
    valor: (p) => p.ventas,
    leer: (p) => `${DIAS[p.dia]}: ${money(p.ventas)} en ${ventasDe(p.cantidad)}`
  });
  // De la primera hora con ventas a la última, y al menos de 8 a 20 (un
  // horario de comercio): de 0 a 23 entero, un local de 9 a 20 se ve como dos
  // franjas vacías; y con pocas ventas, una barra sola no dice cuándo.
  const conVentas = horas.filter((h) => h.cantidad > 0).map((h) => h.hora);
  const desde = conVentas.length ? Math.min(8, ...conVentas) : 0;
  const hasta = conVentas.length ? Math.max(20, ...conVentas) : -1;
  dibujarHoras(
    horas.filter((h) => h.hora >= desde && h.hora <= hasta),
    {
      etiqueta: (p) => String(p.hora),
      valor: (p) => p.ventas,
      leer: (p) => `De ${p.hora} a ${p.hora + 1} h: ${money(p.ventas)} en ${ventasDe(p.cantidad)}`,
      vacio: sinHora > 0 ? "Las ventas de este período no tienen hora." : "Sin ventas en este período."
    }
  );
  const nota = document.getElementById("cuandoNota");
  nota.hidden = sinHora === 0;
  nota.textContent =
    sinHora === 1
      ? "Una venta no cuenta por hora: es de las que cargaste en «Lo que ya tenías», que guardan el día pero no la hora."
      : `${numero(sinHora)} ventas no cuentan por hora: son de las que cargaste en «Lo que ya tenías», que guardan el día pero no la hora.`;
}

const TIPO_CUENTA = { efectivo: "Efectivo", banco: "Banco", mercadopago: "Mercado Pago", otro: "Otra" };

function pintarCobros(cobros) {
  const total = cobros.reduce((acc, c) => acc + c.importe, 0);
  document.getElementById("tableroCobros").innerHTML = barrasHorizontales(cobros, {
    nombre: (c) => c.nombre,
    valor: (c) => c.importe,
    cifra: (c) => money(c.importe),
    detalle: (c) =>
      `${TIPO_CUENTA[c.tipo] ?? ""} · ${numero(c.cantidad)} ${c.cantidad === 1 ? "cobro" : "cobros"} · ${Math.round((c.importe / total) * 100)}% del total`,
    vacio: "No hubo cobros en este período."
  });
}

function pintarVendedores(vendedores) {
  document.getElementById("tableroVendedores").innerHTML = barrasHorizontales(vendedores, {
    nombre: (v) => v.nombre,
    valor: (v) => v.ventas,
    cifra: (v) => money(v.ventas),
    detalle: (v) => `${ventasDe(v.cantidad_ventas)} · ticket promedio ${money(v.ticket_promedio)}`,
    vacio: "No hay ventas en este período."
  });
}

// Lo llama cargarPanelResumen (app.js) con el mismo rango que el resto del
// Resumen. La primera vez trae también cómo lo armó la persona; después, lo
// que guarda Personalizar ya queda en memoria.
export async function cargarTablero(rango) {
  if (!esAdmin()) {
    contenedor.classList.add("is-listo");
    return;
  }
  document.getElementById("resumenControles").hidden = false;
  try {
    if (!cargado) {
      tablero = await api("/api/tablero");
      cargado = true;
      aplicarTablero();
    }
  } finally {
    contenedor.classList.add("is-listo");
  }
  const params = new URLSearchParams(rango).toString();
  const datos = await api(`/api/reportes/tablero${params ? "?" + params : ""}`);
  pintarPendiente(datos.pendiente);
  pintarCuando(datos);
  pintarCobros(datos.cobros);
  pintarVendedores(datos.vendedores);
}

async function guardar(cuerpo, { metodo = "PUT", aviso } = {}) {
  tablero = await api("/api/tablero", { method: metodo, body: cuerpo, error: "No se pudo guardar el Resumen." });
  aplicarTablero();
  if (aviso) avisar(aviso, "ok");
}

// Contra qué comparar se guarda al elegirlo, y vuelve a pedir la evolución.
document.getElementById("resumenComparar").addEventListener("change", async (e) => {
  await guardar({ orden: tablero.orden, ocultas: tablero.ocultas, comparar: e.target.value });
  await invocar("cargar:panelResumen");
});

/* ---------- Personalizar ---------- */
//
// Una lista con una casilla para mostrar u ocultar cada pieza y dos botones
// para subirla o bajarla (arrastrar no se puede hacer bien con el dedo ni con
// el teclado). Se trabaja sobre una copia: nada cambia hasta Guardar.

const modal = document.getElementById("modalTablero");
const lista = document.getElementById("tableroLista");
let borrador = null;

function pintarLista() {
  const elegibles = borrador.orden.filter(disponible);
  lista.innerHTML = elegibles
    .map((pieza, i) => {
      const info = PIEZAS[pieza];
      const visible = !borrador.ocultas.includes(pieza);
      return `
      <li class="tablero-fila${visible ? "" : " is-oculta"}" data-pieza="${esc(pieza)}">
        <label class="tablero-elegir">
          <input type="checkbox" ${visible ? "checked" : ""} />
          <span>
            <strong>${esc(info.nombre)}</strong>
            <small>${esc(info.descripcion)}</small>
          </span>
        </label>
        <span class="tablero-mover">
          <button type="button" class="btn-icon tablero-subir" data-mover="-1" ${i === 0 ? "disabled" : ""} aria-label="Subir ${esc(info.nombre)}">${icono("chevron-down")}</button>
          <button type="button" class="btn-icon" data-mover="1" ${i === elegibles.length - 1 ? "disabled" : ""} aria-label="Bajar ${esc(info.nombre)}">${icono("chevron-down")}</button>
        </span>
      </li>`;
    })
    .join("");
}

lista.addEventListener("change", (e) => {
  const pieza = e.target.closest("[data-pieza]")?.dataset.pieza;
  if (!pieza) return;
  borrador.ocultas = e.target.checked ? borrador.ocultas.filter((p) => p !== pieza) : [...borrador.ocultas, pieza];
  e.target.closest("li").classList.toggle("is-oculta", !e.target.checked);
});

lista.addEventListener("click", (e) => {
  const boton = e.target.closest("[data-mover]");
  if (!boton) return;
  const pieza = boton.closest("[data-pieza]").dataset.pieza;
  const paso = Number(boton.dataset.mover);
  // Se mueve entre las que se pueden elegir; las de un módulo apagado quedan
  // al final, en el orden que tenían, por si se vuelve a prender.
  const elegibles = borrador.orden.filter(disponible);
  const i = elegibles.indexOf(pieza);
  const j = i + paso;
  if (j < 0 || j >= elegibles.length) return;
  [elegibles[i], elegibles[j]] = [elegibles[j], elegibles[i]];
  borrador.orden = [...elegibles, ...borrador.orden.filter((p) => !disponible(p))];
  pintarLista();
  // El foco sigue al botón de la pieza que se movió, para seguir moviéndola.
  const destino = lista.querySelector(`[data-pieza="${pieza}"] [data-mover="${paso}"]`);
  (destino && !destino.disabled ? destino : lista.querySelector(`[data-pieza="${pieza}"] input`))?.focus();
});

document.getElementById("btnPersonalizarResumen").addEventListener("click", () => {
  borrador = { orden: [...tablero.orden], ocultas: [...tablero.ocultas] };
  pintarLista();
  document.getElementById("btnTableroPreset").hidden = !tablero.personalizado;
  modal.hidden = false;
  lista.querySelector("input")?.focus();
});

const cerrar = () => {
  modal.hidden = true;
  document.getElementById("btnPersonalizarResumen").focus();
};
document.getElementById("modalTableroClose").addEventListener("click", cerrar);
modal.addEventListener("click", (e) => {
  if (e.target === modal) cerrar();
});
modal.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    cerrar();
  }
});

document.getElementById("btnTableroGuardar").addEventListener("click", async () => {
  await guardar({ ...borrador, comparar: tablero.comparar }, { aviso: "Listo: el Resumen quedó como lo armaste." });
  cerrar();
});

document.getElementById("btnTableroPreset").addEventListener("click", async () => {
  const comparaba = tablero.comparar;
  await guardar(undefined, { metodo: "DELETE", aviso: "Volvió al Resumen de tu tipo de negocio." });
  cerrar();
  if (comparaba !== tablero.comparar) await invocar("cargar:panelResumen");
});
