/**
 * dominios/venta-online.js
 * -----------------------------------------------------------
 * La página "Venta online" (hist. §138), del módulo Venta online y del admin:
 * cuánto entra por cada canal (Tienda Nube, Mercado Libre, Instagram,
 * WhatsApp, el local…), cuánto queda después de lo que cuesta vender ahí,
 * cómo vienen las ventas de cada uno, qué rinde la publicidad y cómo están
 * las tiendas conectadas. Los números salen de GET /api/reportes/canales.
 *
 * Cada canal tiene su logo, y los tres canales online que más vendió el
 * negocio en toda su historia, su color (los da el servidor, así no cambian
 * con el período); lo demás va junto en gris. Son los tres colores de serie
 * validados para quien no distingue colores (styles.css): con un cuarto, en
 * la dona, dos ya no se distinguen.
 */

import { api } from "../core/api.js";
import { esAdmin, esc, fechaHoraAR, money, moneyCorto, numero } from "../core/formato.js";
import { barrasHorizontales, dona, montarArea } from "../core/graficos.js";
import { icono } from "../core/iconos.js";
import { rangoDePeriodo } from "../core/periodos.js";
import { alEntrarEnVista } from "../core/registro.js";

// El logo de cada canal (los de las marcas, del sprite de cada una) y su color.
const CANAL = {
  tiendanube: { logo: '<svg class="ico ico-marca" aria-hidden="true" viewBox="0 0 37.5 27"><use href="/img/tiendanube.svg#nube"></use></svg>' },
  mercadolibre: {
    logo: '<svg class="ico ico-marca ico-marca-color" aria-hidden="true" viewBox="0 0 150 104"><use href="/img/mercadolibre.svg#emblema"></use></svg>'
  },
  instagram: { logo: '<svg class="ico ico-marca" aria-hidden="true" viewBox="0 0 24 24"><use href="/img/instagram.svg#emblema"></use></svg>' },
  whatsapp: { logo: '<svg class="ico ico-marca" aria-hidden="true" viewBox="0 0 24 24"><use href="/img/whatsapp.svg#emblema"></use></svg>' },
  local: { logo: icono("store") },
  mercadopago: {
    logo: '<svg class="ico ico-marca ico-marca-color" aria-hidden="true" viewBox="0 0 150 104"><use href="/img/mercadopago.svg#emblema"></use></svg>'
  }
};
const logoDe = (canal) => CANAL[canal]?.logo ?? icono("globe");
let colores = {};
const serieDe = (canal) => colores[canal] ?? null;
const claveDe = (canal) => canal ?? "sin_indicar";

const pesos = (n) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const pct = (n) => `${n.toLocaleString("es-AR", { maximumFractionDigits: 1 })} %`;
const ventasDe = (n) => `${numero(n)} ${n === 1 ? "venta" : "ventas"}`;

// El período es de quien mira, en este navegador (no hace falta que viaje).
const CLAVE_PERIODO = "nexo.online.periodo";
let periodo = "30";
try {
  periodo = localStorage.getItem(CLAVE_PERIODO) ?? "30";
} catch {
  // Sin almacenamiento (modo privado): arranca en 30 días.
}
const botonesPeriodo = [...document.querySelectorAll("#onlinePeriodo [data-periodo]")];
const marcarPeriodo = () => botonesPeriodo.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.periodo === periodo)));

document.getElementById("onlinePeriodo").addEventListener("click", (e) => {
  const boton = e.target.closest("[data-periodo]");
  if (!boton) return;
  periodo = boton.dataset.periodo;
  try {
    localStorage.setItem(CLAVE_PERIODO, periodo);
  } catch {
    // Igual cambia, solo que no se recuerda.
  }
  cargar();
});

/* ---------- Las piezas ---------- */

function ponerCifra(id, valor, texto) {
  const el = document.getElementById(id);
  el.textContent = texto ?? pesos(valor);
  el.title = texto ? "" : money(valor);
}

function pintarCifras({ online, canales }) {
  const hayOnline = canales.some((c) => c.online && c.cantidad_ventas > 0);
  ponerCifra("onlineVentas", online.ventas);
  document.getElementById("onlineVentasNota").textContent = hayOnline
    ? `${pct(online.participacion_pct)} de todo lo que vendiste`
    : "Todavía no hay ventas online en este período";
  ponerCifra("onlinePedidos", 0, numero(online.cantidad_ventas));
  const canalesOnline = canales.filter((c) => c.online && c.cantidad_ventas > 0).length;
  document.getElementById("onlinePedidosNota").textContent =
    canalesOnline === 1 ? "En 1 canal" : `En ${numero(canalesOnline)} canales`;
  ponerCifra("onlineTicket", online.ticket_promedio);
  const local = canales.find((c) => c.canal === "local");
  document.getElementById("onlineTicketNota").textContent =
    local && local.cantidad_ventas > 0 ? `En el local, ${pesos(local.ticket_promedio)}` : "Por cada pedido online";
  const elGanancia = document.getElementById("onlineGanancia");
  ponerCifra("onlineGanancia", online.ganancia);
  elGanancia.classList.toggle("saldo-negativo", online.ganancia < 0);
  elGanancia.classList.toggle("ledger-ok", online.ganancia > 0);
  document.getElementById("onlineGananciaNota").textContent = "Después de la mercadería, las comisiones y los envíos";
}

// La serie: una línea por canal con color, y lo demás junto en gris.
const dibujarSerie = montarArea(document.getElementById("graficoOnline"), { titulo: "Ventas por canal en cada período" });

function pintarSerie({ serie, canales }) {
  const conColor = canales.filter((c) => serieDe(c.canal) && c.ventas > 0);
  const deColor = new Set(conColor.map((c) => claveDe(c.canal)));
  const hayResto = canales.some((c) => !deColor.has(claveDe(c.canal)) && c.ventas > 0);
  const resto = (p) => Object.entries(p.canales).reduce((acc, [clave, v]) => (deColor.has(clave) ? acc : acc + v), 0);
  const series = [
    ...conColor.map((c) => ({ clase: serieDe(c.canal), valor: (p) => p.canales[c.canal] ?? 0, nombre: c.nombre })),
    ...(hayResto ? [{ clase: "serie-otras", valor: resto, nombre: "El resto" }] : [])
  ];
  document.getElementById("onlineLeyenda").innerHTML = series
    .map((s) => `<li><span class="leyenda-marca leyenda-linea ${esc(s.clase)}" aria-hidden="true"></span>${esc(s.nombre)}</li>`)
    .join("");
  dibujarSerie(serie, {
    etiqueta: (p) => p.etiqueta,
    series,
    corto: moneyCorto,
    detalle: (p) => series.map((s) => [s.nombre, money(s.valor(p))])
  });
}

function pintarDona({ canales }) {
  const resto = canales.filter((c) => !serieDe(c.canal)).map((c) => c.nombre);
  document.getElementById("onlineDona").innerHTML = dona(canales, {
    nombre: (c) => c.nombre,
    valor: (c) => c.ventas,
    cifra: pesos,
    centro: "vendido",
    serie: (c) => serieDe(c.canal),
    otras: resto.length === 1 ? resto[0] : "El resto",
    vacio: "No hay ventas en este período."
  });
}

// Una tarjeta por canal: lo que entró y adónde fue, en una barra partida.
function pintarCanales({ canales }) {
  const conVentas = canales.filter((c) => c.cantidad_ventas > 0 || c.ventas !== 0);
  const caja = document.getElementById("onlineCanales");
  if (conVentas.length === 0) {
    caja.innerHTML = `<p class="tabla-vacia">No hay ventas en este período.</p>`;
    return;
  }
  caja.innerHTML = conVentas
    .map((c) => {
      const deVender = c.costos.comision + c.costos.envio + c.costos.cuotas + c.costos.otros;
      const base = Math.max(c.ventas, c.mercaderia + deVender, 1);
      const ancho = (v) => `${((Math.max(v, 0) / base) * 100).toFixed(1)}%`;
      const logo = logoDe(c.canal);
      const [anchoMercaderia, anchoVender, anchoQuedo] = [ancho(c.mercaderia), ancho(deVender), ancho(c.ganancia)];
      const detalleDeVender = [
        ["comisión", c.costos.comision],
        ["envío", c.costos.envio],
        ["cuotas", c.costos.cuotas],
        ["otros", c.costos.otros]
      ]
        .filter(([, v]) => v > 0)
        .map(([nombre, v]) => `${nombre} ${pesos(v)}`)
        .join(", ");
      return `
      <article class="canal-tarjeta">
        <header class="canal-cabeza">
          <span class="canal-logo canal-logo-${esc(claveDe(c.canal))}">${logo}</span>
          <div>
            <h3>${esc(c.nombre)}</h3>
            <p>${esc(pct(c.participacion_pct))} de lo vendido</p>
          </div>
        </header>
        <p class="kpi-cifra" title="${esc(money(c.ventas))}">${esc(pesos(c.ventas))}</p>
        <dl class="canal-datos">
          <div><dt>Ventas</dt><dd>${esc(numero(c.cantidad_ventas))}</dd></div>
          <div><dt>Ticket</dt><dd>${esc(pesos(c.ticket_promedio))}</dd></div>
          <div><dt>Margen</dt><dd class="${c.ganancia < 0 ? "saldo-negativo" : ""}">${esc(pct(c.margen_pct))}</dd></div>
        </dl>
        <div class="canal-reparto" aria-hidden="true">
          <span class="reparto-mercaderia" style="width:${anchoMercaderia}"></span>
          <span class="reparto-vender" style="width:${anchoVender}"></span>
          <span class="reparto-quedo" style="width:${anchoQuedo}"></span>
        </div>
        <ul class="canal-reparto-leyenda">
          <li><span class="leyenda-marca reparto-mercaderia" aria-hidden="true"></span>Mercadería <strong>${esc(pesos(c.mercaderia))}</strong></li>
          <li><span class="leyenda-marca reparto-vender" aria-hidden="true"></span>Vender ahí <strong>${esc(pesos(deVender))}</strong>${
            detalleDeVender ? `<small>${esc(detalleDeVender)}</small>` : ""
          }</li>
          <li><span class="leyenda-marca reparto-quedo" aria-hidden="true"></span>Te quedó <strong class="${c.ganancia < 0 ? "saldo-negativo" : ""}">${esc(
            pesos(c.ganancia)
          )}</strong></li>
        </ul>
      </article>`;
    })
    .join("");
}

// Publicidad: lo anotado en Gastos con la categoría Publicidad, contra lo
// vendido online. Sin conexión con Meta Ads (CLAUDE.md §39).
function pintarPublicidad({ publicidad, online }) {
  const caja = document.getElementById("onlinePublicidad");
  if (publicidad.gasto <= 0) {
    caja.innerHTML = `
      <p class="online-vacio">Anotá lo que ponés en anuncios en Gastos, con la categoría <strong>${esc(publicidad.categoria)}</strong>, y acá ves cuánto vendiste por cada peso.</p>
      <a class="btn btn-secundario" href="#/gastos">${icono("plus")} Anotar un gasto</a>`;
    return;
  }
  const roas = publicidad.roas.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  caja.innerHTML = `
    <p class="publicidad-roas"><span class="kpi-cifra">${esc(roas)}</span><span>de venta online por cada peso en anuncios</span></p>
    <dl class="publicidad-datos">
      <div><dt>Gasto en anuncios</dt><dd>${esc(pesos(publicidad.gasto))}</dd></div>
      <div><dt>Costo por venta online</dt><dd>${esc(publicidad.costo_por_venta == null ? "—" : pesos(publicidad.costo_por_venta))}</dd></div>
      <div><dt>Te quedó, después de los anuncios</dt><dd class="${publicidad.ganancia_despues < 0 ? "saldo-negativo" : ""}">${esc(
        pesos(publicidad.ganancia_despues)
      )}</dd></div>
    </dl>
    <p class="grafico-nota">Sobre ${esc(ventasDe(online.cantidad_ventas))} online por ${esc(pesos(online.ventas))}, y ${esc(
      numero(publicidad.gastos)
    )} ${publicidad.gastos === 1 ? "gasto" : "gastos"} de ${esc(publicidad.categoria)}.</p>`;
}

// Lo más vendido, con un botón por canal.
let productosPorCanal = {};
let canalElegido = null;
function pintarProductos({ canales, productos }) {
  productosPorCanal = productos;
  const conProductos = canales.filter((c) => productos[claveDe(c.canal)]?.length);
  if (!conProductos.some((c) => claveDe(c.canal) === canalElegido)) {
    canalElegido = claveDe((conProductos.find((c) => c.online) ?? conProductos[0])?.canal ?? null);
  }
  document.getElementById("onlineProductosCanal").innerHTML = conProductos
    .map(
      (c) =>
        `<button type="button" class="segmento" data-canal="${esc(claveDe(c.canal))}" aria-pressed="${claveDe(c.canal) === canalElegido}">${esc(c.nombre)}</button>`
    )
    .join("");
  pintarRanking();
}
function pintarRanking() {
  document.getElementById("onlineProductos").innerHTML = barrasHorizontales(productosPorCanal[canalElegido] ?? [], {
    nombre: (p) => p.nombre,
    valor: (p) => p.ventas,
    cifra: (p) => money(p.ventas),
    detalle: (p) => `Cantidad ${numero(p.unidades)}`,
    vacio: "No hay ventas en este período."
  });
}
document.getElementById("onlineProductosCanal").addEventListener("click", (e) => {
  const boton = e.target.closest("[data-canal]");
  if (!boton) return;
  canalElegido = boton.dataset.canal;
  for (const b of document.querySelectorAll("#onlineProductosCanal [data-canal]")) {
    b.setAttribute("aria-pressed", String(b.dataset.canal === canalElegido));
  }
  pintarRanking();
});

// Las tiendas: si están conectadas y lo que espera que alguien lo mire.
const TIENDAS = [
  { plataforma: "tiendanube", nombre: "Tienda Nube", seccion: "tienda-nube" },
  { plataforma: "mercadolibre", nombre: "Mercado Libre", seccion: "mercado-libre" },
  { plataforma: "mercadopago", nombre: "Mercado Pago", seccion: "mercado-pago" }
];
function pintarTiendas({ conexiones }) {
  document.getElementById("onlineTiendas").innerHTML = TIENDAS.map((t) => {
    const c = conexiones.find((x) => x.plataforma === t.plataforma);
    const conectada = c?.estado === "conectada";
    const logo = logoDe(t.plataforma);
    const avisos = [];
    if (c?.pedidos_pendientes) avisos.push(`${numero(c.pedidos_pendientes)} ${c.pedidos_pendientes === 1 ? "pedido espera" : "pedidos esperan"} el pago`);
    if (c?.pedidos_con_error) avisos.push(`${numero(c.pedidos_con_error)} ${c.pedidos_con_error === 1 ? "pedido no entró" : "pedidos no entraron"}`);
    const estado = conectada
      ? `Conectada${c.nombre_cuenta ? `: ${c.nombre_cuenta}` : ""}${c.ultima_sincronizacion ? `. Al día el ${fechaHoraAR(c.ultima_sincronizacion)}` : ""}`
      : "Sin conectar";
    return `
      <a class="tienda-item${conectada ? " is-conectada" : ""}" href="#/configuracion/${esc(t.seccion)}">
        <span class="canal-logo canal-logo-${esc(t.plataforma)}">${logo}</span>
        <span class="tienda-texto">
          <strong>${esc(t.nombre)}</strong>
          <span>${esc(estado)}</span>
          ${avisos.length ? `<span class="tienda-aviso">${esc(avisos.join(" y "))}</span>` : ""}
        </span>
        <span class="tienda-accion">${conectada ? "Ver" : "Conectar"}</span>
      </a>`;
  }).join("");
}

/* ---------- Carga ---------- */

let token = 0;
async function cargar() {
  if (!esAdmin()) return;
  marcarPeriodo();
  const mio = ++token;
  const params = new URLSearchParams(rangoDePeriodo(periodo)).toString();
  const datos = await api(`/api/reportes/canales${params ? "?" + params : ""}`);
  if (mio !== token) return;
  const rango = (r) => `${new Date(`${r.desde}T12:00`).toLocaleDateString("es-AR")} al ${new Date(`${r.hasta}T12:00`).toLocaleDateString("es-AR")}`;
  document.getElementById("onlineRango").textContent = `Del ${rango(datos.rango)}.`;
  colores = datos.colores;
  pintarCifras(datos);
  pintarSerie(datos);
  pintarDona(datos);
  pintarCanales(datos);
  pintarPublicidad(datos);
  pintarProductos(datos);
  pintarTiendas(datos);
}

alEntrarEnVista("venta-online", () => cargar());
