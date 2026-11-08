/**
 * dominios/tablero.js
 * -----------------------------------------------------------
 * El Resumen de cada persona (hist. §136): qué período mira, qué piezas ve,
 * en qué orden y contra qué compara, más las piezas que no salen de los
 * reportes de siempre: lo que hay que mirar hoy, cuándo se vende, dónde entró
 * la plata y quién vendió.
 *
 * Lo guarda el servidor por persona y negocio (GET/PUT/DELETE /api/tablero),
 * así sigue igual en el celular y en la compu; sin armar, es el del tipo de
 * negocio (tableroDelPreset en backend/perfiles.js). Las piezas son los
 * <div class="pieza" data-pieza> del Resumen en index.html: ordenarlas es
 * moverlas dentro de #tablero, que en la compu es una grilla (styles.css)
 * donde cada pieza tiene su ancho. Una pieza de un módulo apagado la sigue
 * ocultando el CSS ([data-modulo]); la de IVA, cargarReporteIva.
 *
 * Todo es del admin, como el resto del Resumen.
 */

import { api } from "../core/api.js";
import { esAdmin, esc, money, numero } from "../core/formato.js";
import { barrasHorizontales, dona, montarColumnas } from "../core/graficos.js";
import { icono } from "../core/iconos.js";
import { moduloActivo, negocio } from "../core/negocio.js";
import { rangoDePeriodo } from "../core/periodos.js";
import { invocar } from "../core/registro.js";
import { avisar } from "../core/ui.js";
import { logoDeCanal } from "../core/canales.js";
import { LOCALE, formatear } from "../core/idioma.js";

// Cómo se llama cada pieza en "Personalizar", y cuándo se puede elegir.
const PIEZAS = {
  resultado: { nombre: "Resultado", descripcion: "Ventas, ganancia, gastos y lo que quedó, con su línea." },
  tendencia: { nombre: "Ventas y ganancia", descripcion: "El gráfico grande: cómo vienen las ventas y lo que te dejan." },
  cobros: { nombre: "Dónde entró la plata", descripcion: "Lo cobrado en cada cuenta: la caja, el banco, Mercado Pago." },
  ventas: { nombre: "Qué se vende", descripcion: "Cuántas ventas, ticket promedio, unidades y lo cobrado." },
  cuando: { nombre: "Cuándo se vende", descripcion: "Por día de la semana y por hora." },
  pendiente: { nombre: "Para mirar hoy", descripcion: "Lo que te deben, lo que debés y lo que hay que reponer." },
  productos: { nombre: "Lo más vendido", descripcion: "En barras, por ventas o por ganancia." },
  categorias: { nombre: "Ventas por categoría", descripcion: "En barras, por ventas o por ganancia." },
  vendedores: { nombre: "Quién vendió", descripcion: "Ventas y ticket promedio de cada persona." },
  clientes: { nombre: "Mejores clientes", descripcion: "Quién te compra más y cuándo compró por última vez." },
  canales: { nombre: "Venta online", descripcion: "De dónde vienen tus ventas y cuánto te queda en cada canal.", modulo: "canales" },
  evolucion: { nombre: "Evolución del resultado", descripcion: "El resultado período por período, en gráfico y tabla." },
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

let tablero = { orden: Object.keys(PIEZAS), ocultas: [], comparar: "anterior", periodo: "30", personalizado: false };
let cargado = false;
// "Fechas": un rango tipeado, solo por esta vez (no se guarda en el servidor).
let fechas = null;

// Contra qué compara la evolución: la lee app.js al pedirla.
export const comparacion = () => tablero.comparar;

// El rango del período elegido (core/periodos.js), o las fechas tipeadas.
export function rangoResumen() {
  if (fechas) return { ...(fechas.desde ? { desde: fechas.desde } : {}), ...(fechas.hasta ? { hasta: fechas.hasta } : {}) };
  return rangoDePeriodo(tablero.periodo);
}

const contenedor = document.getElementById("tablero");
const botonesPeriodo = [...document.querySelectorAll("#resumenPeriodo [data-periodo]")];
const botonesComparar = [...document.querySelectorAll("#resumenComparar [data-comparar]")];
const cajaFechas = document.getElementById("resumenFechas");

function aplicarTablero() {
  for (const pieza of tablero.orden) {
    const el = contenedor.querySelector(`:scope > [data-pieza="${pieza}"]`);
    if (!el) continue;
    contenedor.append(el);
    el.classList.toggle("pieza-oculta", tablero.ocultas.includes(pieza));
  }
  const periodo = fechas ? "fechas" : tablero.periodo;
  for (const b of botonesPeriodo) b.setAttribute("aria-pressed", String(b.dataset.periodo === periodo));
  for (const b of botonesComparar) b.setAttribute("aria-pressed", String(b.dataset.comparar === tablero.comparar));
  cajaFechas.hidden = !fechas;
}

// Lo primero que hace cargarPanelResumen (app.js): traer cómo armó la persona
// su Resumen, porque de ahí sale el período de todo lo demás. Una sola vez:
// después, lo que guarda queda en memoria.
export async function prepararTablero() {
  if (!esAdmin()) {
    contenedor.classList.add("is-listo");
    return;
  }
  document.getElementById("resumenControles").hidden = false;
  if (cargado) return;
  try {
    tablero = await api("/api/tablero");
    cargado = true;
    aplicarTablero();
  } finally {
    contenedor.classList.add("is-listo");
  }
}

/* ---------- Las piezas nuevas ---------- */

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const ventasDe = (n) => `${numero(n)} ${n === 1 ? "venta" : "ventas"}`;
const pesos = (n) => n.toLocaleString(LOCALE, { style: "currency", currency: "ARS", currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 });

const dibujarDias = montarColumnas(document.getElementById("graficoDias"), { titulo: "Ventas por día de la semana" });
const dibujarHoras = montarColumnas(document.getElementById("graficoHoras"), { titulo: "Ventas por hora del día" });

// Cada deuda con un medidor: la parte vencida en rojo, sobre el total.
function pintarDeuda(id, deuda, quien) {
  const cifra = document.getElementById(id);
  cifra.textContent = pesos(deuda.total);
  cifra.title = money(deuda.total);
  document.getElementById(`${id}Medidor`).style.width = deuda.total > 0 ? `${((deuda.vencido / deuda.total) * 100).toFixed(1)}%` : "0%";
  document.getElementById(`${id}Detalle`).textContent =
    deuda.total <= 0 ? "Nada pendiente" : deuda.vencido > 0 ? `${pesos(deuda.vencido)} vencido, de ${quien(deuda.cantidad)}` : `Nada vencido, de ${quien(deuda.cantidad)}`;
}

function pintarPendiente({ por_cobrar: cobrar, por_pagar: pagar, sin_stock: sinStock, stock_bajo: bajo }) {
  pintarDeuda("pendienteCobrar", cobrar, (n) => (n === 1 ? "1 cliente" : `${n} clientes`));
  pintarDeuda("pendientePagar", pagar, (n) => (n === 1 ? "1 proveedor" : `${n} proveedores`));
  const reponer = sinStock + bajo;
  const elStock = document.getElementById("pendienteStock");
  elStock.textContent = reponer === 1 ? "1 producto" : `${numero(reponer)} productos`;
  elStock.classList.toggle("saldo-negativo", sinStock > 0);
  document.getElementById("pendienteStockDetalle").textContent =
    reponer === 0 ? "Todo con stock" : `${numero(sinStock)} sin stock y ${numero(bajo)} con poco`;
}

function pintarCuando({ dias, horas, sin_hora: sinHora }) {
  dibujarDias(dias, {
    etiqueta: (p) => DIAS[p.dia].slice(0, 3),
    valor: (p) => p.ventas,
    leer: (p) => formatear("{0}: {1} en {2}", DIAS[p.dia], money(p.ventas), ventasDe(p.cantidad))
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
      leer: (p) => formatear("De {0} a {1} h: {2} en {3}", p.hora, p.hora + 1, money(p.ventas), ventasDe(p.cantidad)),
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

function pintarCobros(cobros) {
  const total = cobros.reduce((acc, c) => acc + c.importe, 0);
  const cantidad = cobros.reduce((acc, c) => acc + c.cantidad, 0);
  document.getElementById("tableroCobros").innerHTML = dona(cobros, {
    nombre: (c) => c.nombre,
    valor: (c) => c.importe,
    cifra: pesos,
    centro: "cobrado",
    vacio: "No hubo cobros en este período."
  });
  // La tarjeta "Cobrado" de Qué se vende.
  const elCobrado = document.getElementById("tableroCobrado");
  elCobrado.textContent = pesos(total);
  elCobrado.title = money(total);
  document.getElementById("tableroCobradoNota").textContent = cantidad === 1 ? "En 1 cobro" : `En ${numero(cantidad)} cobros`;
}

function pintarVendedores(vendedores) {
  document.getElementById("tableroVendedores").innerHTML = barrasHorizontales(vendedores, {
    nombre: (v) => v.nombre,
    valor: (v) => v.ventas,
    cifra: (v) => money(v.ventas),
    detalle: (v) => `${ventasDe(v.cantidad_ventas)}, ticket promedio ${money(v.ticket_promedio)}`,
    vacio: "No hay ventas en este período."
  });
}

// Venta online, en chico: la dona y cada canal con su logo, el mismo color
// que en la página (lo da el servidor) y lo que dejó.
function pintarCanales({ canales, colores }) {
  const conVentas = canales.filter((c) => c.cantidad_ventas > 0);
  const serie = (c) => colores[c.canal] ?? null;
  document.getElementById("resumenCanalesDona").innerHTML = dona(conVentas, {
    nombre: (c) => c.nombre,
    valor: (c) => c.ventas,
    cifra: pesos,
    centro: "vendido",
    serie,
    otras: "El resto",
    conLeyenda: false,
    vacio: "No hay ventas en este período."
  });
  document.getElementById("resumenCanalesLista").innerHTML = conVentas
    .map((c) => {
      const color = serie(c) ?? "serie-otras";
      const logo = logoDeCanal(c.canal);
      const clave = c.canal ?? "sin_indicar";
      const detalle = `${ventasDe(c.cantidad_ventas)}, ${c.participacion_pct.toLocaleString(LOCALE, { maximumFractionDigits: 1 })} %`;
      return `
      <li>
        <span class="leyenda-marca ${esc(color)}" aria-hidden="true"></span>
        <span class="canal-logo canal-logo-${esc(clave)}">${logo}</span>
        <span class="rc-nombre"><strong>${esc(c.nombre)}</strong><small>${esc(detalle)}</small></span>
        <span class="rc-cifras"><strong>${esc(pesos(c.ventas))}</strong><small class="${c.ganancia < 0 ? "saldo-negativo" : ""}">Te quedó ${esc(
          pesos(c.ganancia)
        )}</small></span>
      </li>`;
    })
    .join("");
}

// Lo llama cargarPanelResumen (app.js) con el mismo rango que el resto.
export async function cargarTablero(rango) {
  if (!esAdmin()) return;
  const params = new URLSearchParams(rango).toString();
  const consulta = params ? "?" + params : "";
  const [datos, canales] = await Promise.all([
    api(`/api/reportes/tablero${consulta}`),
    moduloActivo("canales") ? api(`/api/reportes/canales${consulta}`) : null
  ]);
  pintarPendiente(datos.pendiente);
  pintarCuando(datos);
  pintarCobros(datos.cobros);
  pintarVendedores(datos.vendedores);
  if (canales) pintarCanales(canales);
}

async function guardar(cuerpo, { metodo = "PUT", aviso } = {}) {
  tablero = await api("/api/tablero", { method: metodo, body: cuerpo, error: "No se pudo guardar el Resumen." });
  aplicarTablero();
  if (aviso) avisar(aviso, "ok");
}

const preferencias = () => ({ orden: tablero.orden, ocultas: tablero.ocultas, comparar: tablero.comparar, periodo: tablero.periodo });

// El período y contra qué comparar se guardan al elegirlos, y se vuelve a
// cargar el Resumen. "Fechas" abre los dos campos y no se guarda.
document.getElementById("resumenPeriodo").addEventListener("click", async (e) => {
  const boton = e.target.closest("[data-periodo]");
  if (!boton) return;
  if (boton.dataset.periodo === "fechas") {
    fechas = rangoResumen();
    document.getElementById("resumenDesde").value = fechas.desde ?? "";
    document.getElementById("resumenHasta").value = fechas.hasta ?? "";
    aplicarTablero();
    document.getElementById("resumenDesde").focus();
    return;
  }
  fechas = null;
  await guardar({ ...preferencias(), periodo: boton.dataset.periodo });
  await invocar("cargar:panelResumen");
});

for (const id of ["resumenDesde", "resumenHasta"]) {
  document.getElementById(id).addEventListener("change", async () => {
    const desde = document.getElementById("resumenDesde").value;
    const hasta = document.getElementById("resumenHasta").value;
    if (desde && hasta && desde > hasta) {
      avisar("La fecha de inicio es posterior a la de fin.", "atencion");
      return;
    }
    fechas = { desde, hasta };
    await invocar("cargar:panelResumen");
  });
}

document.getElementById("resumenComparar").addEventListener("click", async (e) => {
  const boton = e.target.closest("[data-comparar]");
  if (!boton || boton.dataset.comparar === tablero.comparar) return;
  await guardar({ ...preferencias(), comparar: boton.dataset.comparar });
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
  await guardar({ ...borrador, comparar: tablero.comparar, periodo: tablero.periodo }, { aviso: "Listo: el Resumen quedó como lo armaste." });
  cerrar();
});

document.getElementById("btnTableroPreset").addEventListener("click", async () => {
  const antes = `${tablero.comparar} ${tablero.periodo}`;
  await guardar(undefined, { metodo: "DELETE", aviso: "Volvió al Resumen de tu tipo de negocio." });
  cerrar();
  if (antes !== `${tablero.comparar} ${tablero.periodo}`) await invocar("cargar:panelResumen");
});
