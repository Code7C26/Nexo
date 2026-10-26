/**
 * app.js
 * -----------------------------------------------------------
 * Trabaja contra la API real del backend (/api/facturas) en vez
 * de datos estáticos. IVA y retención de Mercado Pago quedan
 * fuera de V1 (decisión del equipo): las facturas se manejan con
 * un único monto (`total`), sin impuestos.
 */

import { crearFiltros, rangoDeFiltroFecha } from "./core/filtros.js";
import {
  ICONO_TACHO,
  badge,
  botonEditarFila,
  camposFicha,
  cantidad,
  columnasVisibles,
  duracion,
  esAdmin,
  esFraccionable,
  esc,
  fechaAR,
  hoyISO,
  html,
  money,
  moneyCorto,
  numero,
  UNIDADES
} from "./core/formato.js";
import { avisar, confirmar, filaVacia, filaVaciaFiltrada, mostrarResultadoBulk, tablaCargando } from "./core/ui.js";
import { api, refrescar } from "./core/api.js";
import { CONFIRMAR_LOTE_DESDE, LIMITE_LOTE, crearSeleccion, montarBarraSeleccion, traerConcurrencia } from "./core/seleccion.js";
import { armarHojaComprobante, descargarPDFsEnLote, imprimirComprobante, imprimirHojas, nombreArchivoPdf } from "./core/comprobante.js";
import { descargarCSV } from "./core/csv.js";
import { icono } from "./core/iconos.js";
import { mostrarVista, subrutaDesdeHash, vistaDesdeHash } from "./core/router.js";
import { aplicarTema, temaActual } from "./core/tema.js";
import { alEntrarEnVista, invocar, recargar, registrar } from "./core/registro.js";
import { cuentasTesoreria, fijarCuentasTesoreria, fijarProveedores, poblarSelectCuentas, proveedores } from "./core/maestros.js";
import { catalogoMixto, fijarTiposDelCatalogo, negocio, termino, terminoDeTipo } from "./core/negocio.js";
import "./dominios/usuarios.js";
import "./dominios/configuracion.js";
import "./dominios/perfil.js";
import "./dominios/cuentas-corrientes.js";
import { categoriasGasto, gastos } from "./dominios/gastos.js";
import "./dominios/pos.js";
import "./dominios/socios.js";
import "./dominios/trabajos.js";
import "./dominios/abonos.js";
import "./dominios/crm.js";
import "./dominios/primeros-pasos.js";
import "./dominios/negocios.js";

let facturas = [];

document.getElementById("todayDate").textContent = new Date().toLocaleDateString("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long"
});


/* ---------- Resumen (resultado del negocio) ---------- */

// El resultado lo calcula el backend, que es quien puede recorrer ventas
// y gastos con el rango de fechas aplicado. Acá solo se muestra.
//
// El filtro de fecha, sea "este mes" o un desde/hasta tipeado, se traduce
// a un rango concreto que entiende el backend. La usan tanto cargarResumen
// como cargarEvolucion, así los dos fetch quedan sobre el mismo rango.
function rangoActualResumen() {
  const filtroFecha = filtrosResumen.filtros.find((f) => f.campo === "fecha");
  return filtroFecha ? rangoDeFiltroFecha(filtroFecha) : {};
}

async function cargarResumen() {
  // Es rentabilidad (venta, costo y ganancia bruta juntos): admin-only en
  // el servidor (GET /api/resumen), y esta función se llama tras casi toda
  // mutación del sistema, no solo al entrar a la vista Resumen — por eso el
  // corte va acá adentro y no en cada uno de esos call sites. Sin esto, un
  // empleado dispara un 403 en segundo plano cada vez que carga una venta.
  if (!esAdmin()) return;
  const rango = rangoActualResumen();
  const params = new URLSearchParams(rango).toString();
  const resumen = await api(`/api/resumen${params ? "?" + params : ""}`);

  document.getElementById("sumVentas").textContent = money(resumen.ventas);
  document.getElementById("sumCosto").textContent = money(resumen.costo_mercaderia);
  document.getElementById("sumGananciaBruta").textContent = money(resumen.ganancia_bruta);
  document.getElementById("sumGastosOperativos").textContent = money(resumen.gastos_operativos);
  document.getElementById("sumInversiones").textContent = money(resumen.inversiones);
  document.getElementById("sumRetiros").textContent = money(resumen.retiros);

  // Un resultado negativo es información importante, no un detalle: va en
  // rojo para que no pase desapercibido entre el resto de los números.
  const elResultado = document.getElementById("sumResultado");
  elResultado.textContent = money(resumen.resultado);
  elResultado.classList.toggle("saldo-negativo", resumen.resultado < 0);
  elResultado.classList.toggle("ledger-ok", resumen.resultado >= 0);

  renderUltimosMovimientos(rango);

  // Sin await a propósito: este es el número que el operador está mirando
  // cuando carga una venta o un gasto (cargarResumen() se llama tras casi
  // toda mutación), así que tiene que quedar al día ya. La evolución
  // (gráfico + tabla + deltas) es una vista más profunda que puede llegar
  // unos milisegundos después sin que nadie lo note.
  refrescar([cargarEvolucion()]);
}

// Métrica → si "subir" es una mejora. Para gastos es al revés que para el
// resto: un aumento de gastos operativos es peor, no mejor, y pintarlo de
// verde porque el número subió sería directamente incorrecto.
const MEJOR_SI_SUBE = {
  ventas: true,
  ganancia_bruta: true,
  gastos_operativos: false,
  resultado: true
};

function formatearDelta(campo, delta) {
  if (!delta || !delta.comparable) {
    return `<span class="ledger-delta-neutro">Sin período anterior</span>`;
  }
  const mejoro = MEJOR_SI_SUBE[campo] ? delta.abs >= 0 : delta.abs <= 0;
  const clase = delta.abs === 0 ? "ledger-delta-neutro" : mejoro ? "ledger-delta-ok" : "ledger-delta-mal";
  const flecha = delta.abs > 0 ? icono("arrow-up-right") : delta.abs < 0 ? icono("arrow-down-right") : "";
  // La pastilla lleva el porcentaje; el importe del cambio queda en el
  // tooltip, para no apilar dos cifras debajo de la cifra principal.
  const abs = `${delta.abs > 0 ? "+" : delta.abs < 0 ? "−" : ""}${money(Math.abs(delta.abs))}`;
  const ref = `<span class="ledger-delta-ref">vs. período anterior</span>`;
  if (delta.cruza_cero) {
    // Un porcentaje acá sería técnicamente correcto pero absurdo de leer
    // (de -1000 a +10 da +101%): se muestra el cambio absoluto, con
    // texto explícito de qué cruzó.
    const texto = delta.abs > 0 ? "de pérdida a ganancia" : "de ganancia a pérdida";
    return `<span class="${clase}" title="${esc(texto)}">${flecha} ${esc(abs)}</span>${ref}`;
  }
  return `<span class="${clase}" title="${esc(abs)}">${flecha} ${porcentaje(Math.abs(delta.pct))}</span>${ref}`;
}

function renderDeltas(data) {
  const nota = document.getElementById("resumenRangoNota");
  const rango = (r) => `${fechaAR(r.desde)} al ${fechaAR(r.hasta)}`;
  nota.textContent = data.delta
    ? `Del ${rango(data.rango)}. Período anterior: ${rango(data.anterior.rango)}.`
    : `Del ${rango(data.rango)}${data.rango.acotado ? "" : ", todo lo cargado hasta hoy"}.`;

  for (const [campo, id] of [
    ["ventas", "deltaVentas"],
    ["ganancia_bruta", "deltaGananciaBruta"],
    ["gastos_operativos", "deltaGastosOperativos"],
    ["resultado", "deltaResultado"]
  ]) {
    document.getElementById(id).innerHTML = formatearDelta(campo, data.delta?.[campo]);
  }
}

function renderTablaEvolucion(serie) {
  const body = document.getElementById("evolucionBody");
  if (serie.length === 0) {
    body.innerHTML = filaVacia(7, "No hay operaciones en este período.");
    return;
  }
  body.innerHTML = serie
    .map((p) => {
      const margen = p.ventas > 0 ? porcentaje((p.ganancia_bruta / p.ventas) * 100) : "—";
      return `
    <tr>
      <td data-label="Período">${esc(p.etiqueta)}${p.parcial ? " (parcial)" : ""}</td>
      <td data-label="Ventas" class="align-right mono">${money(p.ventas)}</td>
      <td data-label="Costo" class="align-right mono">${money(p.costo_mercaderia)}</td>
      <td data-label="Ganancia bruta" class="align-right mono">${money(p.ganancia_bruta)}</td>
      <td data-label="Margen" class="align-right mono">${margen}</td>
      <td data-label="Gastos" class="align-right mono">${money(p.gastos_operativos)}</td>
      <td data-label="Resultado" class="align-right mono ${p.resultado < 0 ? "saldo-negativo" : ""}">${money(p.resultado)}</td>
    </tr>`;
    })
    .join("");
}

// Gráfico de barras del resultado por período, en SVG dibujado a mano
// (el proyecto no tiene librería de gráficos ni build step). Se dibuja al
// ancho real del contenedor: con un viewBox fijo el texto se achicaba con
// la pantalla y en el celular no se leía. Por eso un ResizeObserver lo
// redibuja cuando cambia ese ancho (también al volver a la vista: oculta
// mide 0 y no se dibuja). Los colores van por variable CSS, nunca
// hardcodeados: como esos tokens ya se redefinen para modo oscuro, el
// cambio de tema no lo redibuja — no "arreglar" esto pasando colores por
// parámetro. Barras en tinta (a favor) y en rojo (en contra), como los
// números de un cuaderno de cuentas; el período en curso va en contorno.
const graficoResultadoEl = document.getElementById("graficoResultado");
let serieGrafico = [];
let anchoGrafico = 0;
let ocultarTipGrafico = () => {};

function renderGraficoResultado(serie) {
  serieGrafico = serie;
  dibujarGraficoResultado({ animar: true });
}

new ResizeObserver(() => {
  const ancho = Math.round(graficoResultadoEl.clientWidth);
  if (ancho !== anchoGrafico) dibujarGraficoResultado({ animar: false });
}).observe(graficoResultadoEl);

// Un toque fuera del gráfico cierra el tooltip que dejó abierto el dedo.
document.addEventListener("pointerdown", (e) => {
  if (!graficoResultadoEl.contains(e.target)) ocultarTipGrafico();
});

// Paso "redondo" (1, 2 o 5 × 10^n) para que las marcas del eje Y caigan
// en cifras que se leen de un vistazo ($20k, $40k) y no en $37.412.
function pasoRedondo(span, marcas) {
  const crudo = span / marcas;
  const magnitud = 10 ** Math.floor(Math.log10(crudo));
  const n = crudo / magnitud;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * magnitud;
}

// Barra con la punta redondeada (4px) y la base recta sobre la línea del
// 0: hacia arriba si el resultado es a favor, hacia abajo si es en contra.
function pathBarra(x, y0, ancho, alto, haciaArriba) {
  const r = Math.min(4, ancho / 2, alto);
  const f = (n) => n.toFixed(1);
  const punta = haciaArriba ? y0 - alto : y0 + alto;
  const curva = haciaArriba ? punta + r : punta - r;
  return `M${f(x)},${f(y0)}V${f(curva)}Q${f(x)},${f(punta)} ${f(x + r)},${f(punta)}H${f(x + ancho - r)}Q${f(
    x + ancho
  )},${f(punta)} ${f(x + ancho)},${f(curva)}V${f(y0)}Z`;
}

function dibujarGraficoResultado({ animar }) {
  const contenedor = graficoResultadoEl;
  const serie = serieGrafico;

  const hayDatos = serie.some((p) => p.ventas !== 0 || p.resultado !== 0);
  if (serie.length === 0 || !hayDatos) {
    anchoGrafico = 0;
    contenedor.innerHTML = `<p class="tabla-vacia">No hay operaciones en este período.</p>`;
    return;
  }

  const W = Math.round(contenedor.clientWidth);
  if (W === 0) return;
  anchoGrafico = W;
  const H = W < 480 ? 200 : 240;
  const M = { top: 12, right: 4, bottom: 28, left: 52 };
  const pw = W - M.left - M.right;
  const ph = H - M.top - M.bottom;

  const valores = serie.map((p) => p.resultado);
  // El 0 se fuerza dentro del dominio a propósito: así la línea de base
  // siempre está visible y las barras negativas crecen hacia abajo solas,
  // sin ningún caso especial para el signo.
  let maxV = Math.max(0, ...valores);
  let minV = Math.min(0, ...valores);
  if (maxV === minV) maxV = 1;
  const paso = pasoRedondo(maxV - minV, 4);
  maxV = Math.ceil(maxV / paso) * paso;
  minV = Math.floor(minV / paso) * paso;
  const y = (v) => M.top + ((maxV - v) / (maxV - minV)) * ph;
  const y0 = y(0);

  const banda = pw / serie.length;
  // Hasta 24px de grueso y siempre 2px de aire entre barras vecinas.
  const ancho = Math.max(2, Math.min(24, banda * 0.62, banda - 2));
  const xBanda = (i) => M.left + banda * i;
  const centro = (i) => xBanda(i) + banda / 2;

  const marcas = [];
  for (let v = minV; v <= maxV + paso / 2; v += paso) marcas.push(v);
  const ejeY = marcas
    .map((v) => {
      const yv = y(v).toFixed(1);
      return `<line class="${v === 0 ? "grafico-base" : "grafico-grilla"}" x1="${M.left}" y1="${yv}" x2="${W - M.right}" y2="${yv}" />
        <text x="${M.left - 8}" y="${yv}" text-anchor="end" dominant-baseline="middle">${moneyCorto(v)}</text>`;
    })
    .join("");

  // Cuántas etiquetas del eje X entran sin amontonarse, sin medir texto
  // (~7px por carácter a 12px, más aire). La última siempre va; si queda
  // pegada a la anterior, se saca la anterior.
  const largoEtiqueta = Math.max(...serie.map((p) => String(p.etiqueta).length));
  const pasoEtiqueta = Math.max(1, Math.ceil((largoEtiqueta * 7 + 12) / banda));
  const ultima = serie.length - 1;
  const visibles = new Set(serie.map((_, i) => i).filter((i) => i % pasoEtiqueta === 0));
  const anteriorALaUltima = ultima - (ultima % pasoEtiqueta);
  if (ultima !== anteriorALaUltima) {
    if (ultima - anteriorALaUltima < pasoEtiqueta) visibles.delete(anteriorALaUltima);
    visibles.add(ultima);
  }
  // Centrada bajo su barra, salvo la que no entra contra el borde derecho
  // (en el celular "14/10" quedaba cortada): esa se alinea al borde.
  const etiquetasX = serie
    .map((p, i) => {
      if (!visibles.has(i)) return "";
      const mitad = (String(p.etiqueta).length * 7) / 2;
      const alBorde = centro(i) + mitad > W - M.right;
      const x = alBorde ? W - M.right : centro(i);
      return `<text x="${x.toFixed(1)}" y="${H - M.bottom + 18}" text-anchor="${alBorde ? "end" : "middle"}">${esc(
        p.etiqueta
      )}</text>`;
    })
    .join("");

  // Franja de cada período, detrás de las barras: es la zona de mouse y de
  // toque (más grande que la barra) y la que se resalta al pasar.
  const columnas = serie
    .map(
      (_, i) =>
        `<rect class="grafico-col" data-i="${i}" x="${xBanda(i).toFixed(1)}" y="${M.top}" width="${banda.toFixed(1)}" height="${ph}" />`
    )
    .join("");

  const barras = serie
    .map((p, i) => {
      if (p.resultado === 0) return "";
      const aFavor = p.resultado > 0;
      const alto = Math.max(Math.abs(y(p.resultado) - y0), 1);
      const clase = `grafico-barra ${aFavor ? "grafico-barra-pos" : "grafico-barra-neg"}${
        p.parcial ? " grafico-barra-parcial" : ""
      }`;
      return `<path class="${clase}" d="${pathBarra(centro(i) - ancho / 2, y0, ancho, alto, aFavor)}" />`;
    })
    .join("");

  const mejor = serie.reduce((a, b) => (b.resultado > a.resultado ? b : a));
  const peor = serie.reduce((a, b) => (b.resultado < a.resultado ? b : a));
  const resumenTexto = `Resultado por período, de ${serie[0].etiqueta} a ${serie[ultima].etiqueta}. Mejor: ${
    mejor.etiqueta
  } con ${money(mejor.resultado)}. Peor: ${peor.etiqueta} con ${money(
    peor.resultado
  )}. Con las flechas se recorre período por período.`;
  const hayParcial = serie.some((p) => p.parcial);

  contenedor.innerHTML = `
    <svg class="${animar ? "grafico-animar" : ""}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"
         role="img" tabindex="0" aria-labelledby="graficoResultadoTitulo">
      <title id="graficoResultadoTitulo">${esc(resumenTexto)}</title>
      ${columnas}
      ${ejeY}
      ${barras}
      ${etiquetasX}
    </svg>
    <div class="grafico-tip" hidden></div>
    ${hayParcial ? `<p class="grafico-nota">En contorno, el período en curso: todavía puede cambiar.</p>` : ""}`;

  enlazarTooltipGrafico(contenedor, serie, centro);
}

// Tooltip del gráfico: con el mouse sigue la franja que está debajo; con
// el dedo se queda en la que se tocó hasta tocar afuera; con el teclado el
// SVG es una sola parada de Tab y las flechas recorren los períodos.
function enlazarTooltipGrafico(contenedor, serie, centro) {
  const svg = contenedor.querySelector("svg");
  const tip = contenedor.querySelector(".grafico-tip");
  const columnas = [...svg.querySelectorAll(".grafico-col")];
  let activo = null;

  const mostrar = (i) => {
    activo = i;
    columnas.forEach((c, j) => c.classList.toggle("is-activa", j === i));
    const p = serie[i];
    tip.innerHTML = `
      <strong>${esc(p.etiqueta)}${p.parcial ? " · en curso" : ""}</strong>
      <dl>
        <div><dt>Ventas</dt><dd>${money(p.ventas)}</dd></div>
        <div><dt>Ganancia bruta</dt><dd>${money(p.ganancia_bruta)}</dd></div>
        <div><dt>Gastos</dt><dd>${money(p.gastos_operativos)}</dd></div>
        <div class="grafico-tip-total"><dt>Resultado</dt><dd class="${p.resultado < 0 ? "saldo-negativo" : ""}">${money(
          p.resultado
        )}</dd></div>
      </dl>`;
    tip.hidden = false;
    // Al costado de la franja, del lado que tenga lugar.
    const x = centro(i);
    const anchoTip = tip.offsetWidth;
    const izquierda = x + 16 + anchoTip <= contenedor.clientWidth ? x + 16 : Math.max(0, x - 16 - anchoTip);
    tip.style.left = `${izquierda}px`;
  };
  const ocultar = () => {
    activo = null;
    columnas.forEach((c) => c.classList.remove("is-activa"));
    tip.hidden = true;
  };
  ocultarTipGrafico = ocultar;

  svg.addEventListener("pointerover", (e) => {
    const col = e.target.closest(".grafico-col");
    if (col) mostrar(Number(col.dataset.i));
  });
  svg.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") ocultar();
  });

  svg.addEventListener("focus", () => mostrar(activo ?? serie.length - 1));
  svg.addEventListener("blur", ocultar);
  svg.addEventListener("keydown", (e) => {
    const destino = {
      ArrowLeft: (activo ?? 0) - 1,
      ArrowRight: (activo ?? -1) + 1,
      Home: 0,
      End: serie.length - 1
    }[e.key];
    if (destino === undefined) return;
    e.preventDefault();
    mostrar(Math.min(serie.length - 1, Math.max(0, destino)));
  });
}

// Dos refrescos pueden solaparse (cargarResumen dispara este sin esperar,
// y el usuario puede cambiar el filtro de nuevo antes de que responda el
// primero): el token descarta la respuesta si ya no es la más reciente,
// para que una serie vieja no pise a una fresca que llegó antes.
let tokenEvolucion = 0;

async function cargarEvolucion() {
  // Mismo corte que cargarResumen (GET /api/resumen/evolucion es admin-only
  // en el servidor). Hoy el único llamador es cargarResumen, que ya corta
  // antes de esta línea — se repite acá también por si en el futuro alguien
  // la llama sola, para no depender de que quien la use se acuerde del rol.
  if (!esAdmin()) return;
  const mio = ++tokenEvolucion;
  const rango = rangoActualResumen();
  const params = new URLSearchParams(rango).toString();
  const data = await api(`/api/resumen/evolucion${params ? "?" + params : ""}`);
  if (mio !== tokenEvolucion) return;

  document.getElementById("graficoGranularidad").textContent =
    { dia: "por día", mes: "por mes", anio: "por año" }[data.granularidad] ?? "";

  renderDeltas(data);
  renderTablaEvolucion(data.serie);
  renderGraficoResultado(data.serie);
}

// Las tres operaciones que mueven plata, juntas y ordenadas por fecha. Se
// arma con los cachés que ya tienen las otras pantallas, así que no
// necesita un fetch propio.
function renderUltimosMovimientos(rango = {}) {
  const body = document.getElementById("movimientosBody");

  const dentroDelRango = (fecha) =>
    (!rango.desde || fecha >= rango.desde) && (!rango.hasta || fecha <= rango.hasta);

  const movimientos = [
    ...ventas
      .filter((v) => v.estado === "activa")
      .map((v) => ({ fecha: v.fecha, tipo: "Venta", detalle: v.cliente, importe: v.total, signo: 1 })),
    ...compras
      .filter((c) => c.estado === "activa")
      .map((c) => ({ fecha: c.fecha, tipo: "Compra", detalle: c.proveedor, importe: c.total, signo: -1 })),
    ...gastos
      .filter((g) => g.estado === "activo")
      .map((g) => ({
        fecha: g.fecha,
        tipo: "Gasto",
        detalle: `${g.categoria}${g.descripcion ? " · " + g.descripcion : ""}`,
        importe: g.importe,
        signo: -1
      })),
    ...devoluciones
      .filter((d) => d.estado === "activa")
      .map((d) => ({ fecha: d.fecha, tipo: "Devolución", detalle: d.cliente, importe: d.total, signo: -1 }))
  ]
    .filter((m) => dentroDelRango(m.fecha))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 15);

  if (movimientos.length === 0) {
    body.innerHTML = filaVacia(4, "No hay movimientos en este período.");
    return;
  }

  body.innerHTML = movimientos
    .map(
      (m) => `
    <tr>
      <td data-label="Fecha">${esc(fechaAR(m.fecha))}</td>
      <td data-label="Tipo">${esc(m.tipo)}</td>
      <td data-label="Detalle" class="celda-wrap">${esc(m.detalle)}</td>
      <td data-label="Importe" class="align-right mono ${m.signo < 0 ? "saldo-negativo" : ""}">${
        m.signo < 0 ? "-" : "+"
      }${money(m.importe)}</td>
    </tr>`
    )
    .join("");
}

const filtrosResumen = crearFiltros(
  "filtrosResumen",
  [{ clave: "fecha", etiqueta: "Fecha", tipo: "fecha" }],
  () => cargarPanelResumen()
);

// Único punto de entrada para refrescar la vista Resumen completa: las dos
// mitades (resultado + qué se vende) comparten el mismo filtro de fecha, así
// que se cargan juntas para que ningún call site deje una mitad desactualizada.
async function cargarPanelResumen() {
  await refrescar([cargarResumen(), cargarReporteVentas(), cargarReporteCompras()]);
}

/* ---------- Reportes: qué se vende y a quién ---------- */
//
// Vista derivada como Resumen y Cuentas corrientes: no guarda estado
// propio más allá de lo que devuelve GET /api/reportes/ventas (que ya
// hace el neteo de devoluciones y el cálculo de márgenes), así que acá
// solo hace falta pintar la respuesta. Fusionada dentro de Resumen: usa
// el mismo filtro de fecha (rangoActualResumen), no uno propio.

function renderReporteProductos(lista) {
  const body = document.getElementById("reporteProductosBody");
  if (lista.length === 0) {
    body.innerHTML = filaVacia(6, "No hay ventas en este período.");
    return;
  }
  body.innerHTML = lista
    .map(
      (p) => `
    <tr>
      <td data-label="Producto">${esc(p.nombre)}</td>
      <td data-label="Unidades" class="align-right mono">${numero(p.unidades)}</td>
      <td data-label="Ventas" class="align-right mono">${money(p.ventas)}</td>
      <td data-label="Ganancia" class="align-right mono ${p.ganancia < 0 ? "saldo-negativo" : ""}">${money(p.ganancia)}</td>
      <td data-label="Margen" class="align-right mono">${porcentaje(p.margen_pct)}</td>
      <td data-label="% del total" class="align-right mono">${porcentaje(p.participacion_pct)}</td>
    </tr>`
    )
    .join("");
}

// Un producto sin categoría cae en el balde "Sin categoría" que ya arma
// el backend (GROUP BY sobre categoria_id, que es NULL para esos
// productos) — no se filtra ni se distingue especialmente acá.
function renderReporteCategorias(lista) {
  const body = document.getElementById("reporteCategoriasBody");
  if (lista.length === 0) {
    body.innerHTML = filaVacia(6, "No hay ventas en este período.");
    return;
  }
  body.innerHTML = lista
    .map(
      (c) => `
    <tr>
      <td data-label="Categoría">${esc(c.nombre)}</td>
      <td data-label="Unidades" class="align-right mono">${numero(c.unidades)}</td>
      <td data-label="Ventas" class="align-right mono">${money(c.ventas)}</td>
      <td data-label="Ganancia" class="align-right mono ${c.ganancia < 0 ? "saldo-negativo" : ""}">${money(c.ganancia)}</td>
      <td data-label="Margen" class="align-right mono">${porcentaje(c.margen_pct)}</td>
      <td data-label="% del total" class="align-right mono">${porcentaje(c.participacion_pct)}</td>
    </tr>`
    )
    .join("");
}

function renderReporteClientes(lista) {
  const body = document.getElementById("reporteClientesBody");
  if (lista.length === 0) {
    body.innerHTML = filaVacia(6, "No hay ventas en este período.");
    return;
  }
  body.innerHTML = lista
    .map(
      (c) => `
    <tr>
      <td data-label="Cliente"><button type="button" class="btn-link reporte-cliente-ficha" data-id="${c.id}">${esc(c.nombre)}</button></td>
      <td data-label="Ventas" class="align-right mono">${numero(c.cantidad_ventas)}</td>
      <td data-label="Total" class="align-right mono">${money(c.ventas)}</td>
      <td data-label="Ticket promedio" class="align-right mono">${money(c.ticket_promedio)}</td>
      <td data-label="Ganancia" class="align-right mono ${c.ganancia < 0 ? "saldo-negativo" : ""}">${money(c.ganancia)}</td>
      <td data-label="Última compra">${esc(fechaAR(c.ultima_compra) || "—")}</td>
    </tr>`
    )
    .join("");

  body.querySelectorAll(".reporte-cliente-ficha").forEach((btn) => {
    btn.addEventListener("click", () => abrirFichaCliente(Number(btn.dataset.id)));
  });
}

async function cargarReporteVentas() {
  // GET /api/reportes/ventas es admin-only (rentabilidad por producto,
  // categoría y cliente); se llama tras mutaciones de venta igual que
  // cargarResumen, no solo al entrar a la vista.
  if (!esAdmin()) return;
  tablaCargando("reporteProductosBody", 6);
  tablaCargando("reporteCategoriasBody", 6);
  tablaCargando("reporteClientesBody", 6);

  const rango = rangoActualResumen();
  const params = new URLSearchParams(rango).toString();
  const datos = await api(`/api/reportes/ventas${params ? "?" + params : ""}`);

  document.getElementById("reporteVentasNetas").textContent = money(datos.totales.ventas_netas);
  document.getElementById("reporteTicketPromedio").textContent = money(datos.totales.ticket_promedio);
  document.getElementById("reporteUnidades").textContent = numero(datos.totales.unidades);
  const elGanancia = document.getElementById("reporteGananciaBruta");
  elGanancia.textContent = money(datos.totales.ganancia_bruta);
  elGanancia.classList.toggle("saldo-negativo", datos.totales.ganancia_bruta < 0);
  elGanancia.classList.toggle("ledger-ok", datos.totales.ganancia_bruta >= 0);

  renderReporteProductos(datos.productos);
  renderReporteCategorias(datos.categorias);
  renderReporteClientes(datos.clientes);
}

/* ---------- Reportes: qué se compra ---------- */
//
// Espejo exacto de "Reportes: qué se vende y a quién" de arriba, del lado
// de compras. Mismo criterio: fusionado dentro de Estadísticas (antes
// "Resumen"), usa el mismo filtro de fecha (rangoActualResumen), no uno
// propio.

function renderReporteComprasProveedores(lista) {
  const body = document.getElementById("reporteComprasProveedoresBody");
  if (lista.length === 0) {
    body.innerHTML = filaVacia(5, "No hay compras en este período.");
    return;
  }
  body.innerHTML = lista
    .map(
      (p) => `
    <tr>
      <td data-label="Proveedor"><button type="button" class="btn-link reporte-proveedor-ficha" data-id="${p.id}">${esc(p.nombre)}</button></td>
      <td data-label="Compras" class="align-right mono">${numero(p.cantidad_compras)}</td>
      <td data-label="Total" class="align-right mono">${money(p.compras)}</td>
      <td data-label="Ticket promedio" class="align-right mono">${money(p.ticket_promedio)}</td>
      <td data-label="Última compra">${esc(fechaAR(p.ultima_compra) || "—")}</td>
    </tr>`
    )
    .join("");

  body.querySelectorAll(".reporte-proveedor-ficha").forEach((btn) => {
    btn.addEventListener("click", () => abrirFichaProveedor(Number(btn.dataset.id)));
  });
}

function renderReporteComprasProductos(lista) {
  const body = document.getElementById("reporteComprasProductosBody");
  if (lista.length === 0) {
    body.innerHTML = filaVacia(4, "No hay compras en este período.");
    return;
  }
  body.innerHTML = lista
    .map(
      (p) => `
    <tr>
      <td data-label="Producto">${esc(p.nombre)}</td>
      <td data-label="Unidades" class="align-right mono">${numero(p.unidades)}</td>
      <td data-label="Total" class="align-right mono">${money(p.compras)}</td>
      <td data-label="% del total" class="align-right mono">${porcentaje(p.participacion_pct)}</td>
    </tr>`
    )
    .join("");
}

// Un producto sin categoría cae en el balde "Sin categoría" que ya arma el
// backend (GROUP BY sobre categoria_id, NULL para esos productos).
function renderReporteComprasCategorias(lista) {
  const body = document.getElementById("reporteComprasCategoriasBody");
  if (lista.length === 0) {
    body.innerHTML = filaVacia(4, "No hay compras en este período.");
    return;
  }
  body.innerHTML = lista
    .map(
      (c) => `
    <tr>
      <td data-label="Categoría">${esc(c.nombre)}</td>
      <td data-label="Unidades" class="align-right mono">${numero(c.unidades)}</td>
      <td data-label="Total" class="align-right mono">${money(c.compras)}</td>
      <td data-label="% del total" class="align-right mono">${porcentaje(c.participacion_pct)}</td>
    </tr>`
    )
    .join("");
}

async function cargarReporteCompras() {
  // GET /api/reportes/compras es admin-only, igual que todo el circuito de
  // compras (ver permisos.js): valorizado al costo por definición.
  if (!esAdmin()) return;
  tablaCargando("reporteComprasProveedoresBody", 5);
  tablaCargando("reporteComprasProductosBody", 4);
  tablaCargando("reporteComprasCategoriasBody", 4);

  const rango = rangoActualResumen();
  const params = new URLSearchParams(rango).toString();
  const datos = await api(`/api/reportes/compras${params ? "?" + params : ""}`);

  document.getElementById("reporteComprasNetas").textContent = money(datos.totales.compras_netas);
  document.getElementById("reporteComprasTicketPromedio").textContent = money(datos.totales.ticket_promedio);
  document.getElementById("reporteComprasUnidades").textContent = numero(datos.totales.unidades);
  document.getElementById("reporteComprasCantidad").textContent = numero(datos.totales.cantidad_compras);

  renderReporteComprasProveedores(datos.proveedores);
  renderReporteComprasProductos(datos.productos);
  renderReporteComprasCategorias(datos.categorias);
}

/* ---------- Reportes: stock (qué reponer, valorizado, rotación) ---------- */
//
// El filtro de fecha define el ritmo de venta contra el que se mide la
// rotación (días de inventario) — no cambia el stock actual, que siempre
// es "ahora mismo". STOCK_CLASE/STOCK_LABEL se definen más abajo (sección
// Productos) pero se referencian acá recién al pintar, nunca al cargar el
// módulo, así que el orden de declaración no importa.

const filtrosReporteStock = crearFiltros(
  "filtrosReporteStock",
  [{ clave: "fecha", etiqueta: "Fecha", tipo: "fecha" }],
  () => cargarReporteStock()
);

function rangoActualReporteStock() {
  const filtroFecha = filtrosReporteStock.filtros.find((f) => f.campo === "fecha");
  return filtroFecha ? rangoDeFiltroFecha(filtroFecha) : {};
}

function renderReporteStock(lista) {
  const body = document.getElementById("reporteStockBody");
  if (lista.length === 0) {
    body.innerHTML = filaVacia(6, "Todavía no hay productos cargados.");
    return;
  }
  body.innerHTML = lista
    .map(
      (p) => `
    <tr>
      <td data-label="Producto">${esc(p.nombre)}</td>
      <td data-label="Stock" class="align-right mono">${numero(p.stock)}</td>
      <td data-label="Estado"><span class="status ${STOCK_CLASE[p.estado_stock]}">${STOCK_LABEL[p.estado_stock]}</span></td>
      <td data-label="Valorizado" class="align-right mono">${money(p.valorizado)}</td>
      <td data-label="Vendidas en el período" class="align-right mono">${numero(p.unidades_vendidas)}</td>
      <td data-label="Días de inventario" class="align-right mono">${p.dias_inventario === null ? "—" : numero(p.dias_inventario)}</td>
    </tr>`
    )
    .join("");
}

async function cargarReporteStock() {
  // GET /api/reportes/stock es admin-only (valorizado a costo). Se llama
  // desde decenas de Promise.all repartidos por casi todas las vistas
  // (refresco tras cada mutación de stock/venta/compra), así que el corte
  // tiene que vivir acá y no en cada call site.
  if (!esAdmin()) return;
  tablaCargando("reporteStockBody", 6);

  const rango = rangoActualReporteStock();
  const params = new URLSearchParams(rango).toString();
  const datos = await api(`/api/reportes/stock${params ? "?" + params : ""}`);

  document.getElementById("reporteStockValorizado").textContent = money(datos.resumen.total_valorizado);
  document.getElementById("reporteStockSinStock").textContent = numero(datos.resumen.cantidad_sin_stock);
  document.getElementById("reporteStockBajo").textContent = numero(datos.resumen.cantidad_bajo);
  document.getElementById("reporteStockCantidad").textContent = numero(datos.resumen.cantidad_productos);

  document.getElementById("reporteStockRangoNota").textContent = datos.rango.acotado
    ? `Rotación medida del ${datos.rango.desde} al ${datos.rango.hasta}.`
    : `Rotación medida del ${datos.rango.desde} al ${datos.rango.hasta} (todo lo cargado hasta hoy) — para una estimación más realista, probá filtrar por "Últimos 30 días".`;

  renderReporteStock(datos.productos);
}

// El backend ya resuelve comprobante y estado_cobro (derivado de los
// cobros reales cuando la factura respalda una venta — ver
// SELECT_FACTURA en server.js). Acá solo se agrega `respalda_venta`, una
// marca de sí/no para que el filtro "Respalda una venta" pueda usar el
// mismo motor select que el resto de los filtros, sin agregarle un caso
// especial.
function filtrarFacturas() {
  const lista = filtrosFacturas.aplicar(
    facturas.map((f) => ({ ...f, respalda_venta: f.venta_id ? "si" : "no" }))
  );

  const facturado = lista.reduce((acc, f) => acc + f.total, 0);
  const cobrado = lista
    .filter((f) => f.estado_cobro === "cobrado")
    .reduce((acc, f) => acc + f.total, 0);
  const pendiente = lista
    .filter((f) => f.estado_cobro !== "cobrado")
    .reduce((acc, f) => acc + f.total, 0);
  document.getElementById("facturasFacturadoStrip").textContent = money(facturado);
  document.getElementById("facturasCobradoStrip").textContent = money(cobrado);
  document.getElementById("facturasPendienteStrip").textContent = money(pendiente);

  renderFacturas(lista);
}

const ESTADO_COBRO_CLASE = { pendiente: "status-vencido", parcial: "status-pendiente", cobrado: "status-cobrado" };
// Antes se mostraba el valor crudo del backend ("pendiente", "parcial",
// "cobrado") tal cual, sin pasar por un diccionario — a diferencia de
// PRESUPUESTO_LABEL, STOCK_LABEL y TIPO_GASTO_LABEL, que ya seguían este
// mismo criterio. Reusado por Facturas, Ventas y el historial de Clientes.
const ESTADO_COBRO_LABEL = { pendiente: "Pendiente", parcial: "Parcial", cobrado: "Cobrado" };
const TIPO_FACTURA_LABEL = { factura: "Factura", nota_credito: "Nota de crédito", nota_debito: "Nota de débito" };
const CONDICION_FACTURA_LABEL = { efectivo: "Efectivo", transferencia: "Transferencia", mercadopago: "Mercado Pago" };

// Declarada arriba de cargarFacturas() (más abajo) a propósito: esa función
// se invoca a nivel de módulo apenas se carga el archivo, y tablaCargando()
// —lo primero que hace— ya necesita selFacturas.colspan(). Con `const`, si
// esta línea quedara más abajo que la invocación caería en TDZ.
const selFacturas = crearSeleccion("facturasBody");
montarBarraSeleccion(selFacturas, [
  { etiqueta: "Imprimir", onClick: (ids) => imprimirFacturasSeleccionadas(ids) },
  { etiqueta: "Descargar PDF", onClick: (ids, btn) => descargarPDFFacturasSeleccionadas(ids, btn) },
  { etiqueta: "Exportar CSV", onClick: (ids) => exportarFacturasSeleccionadas(ids) }
]);

// GET /api/facturas (el listado) no trae items ni el contacto completo del
// cliente para el membrete: hace falta el detalle de cada una, igual que
// abrirFichaFactura. Se pide con concurrencia acotada (traerConcurrencia) en
// vez de agregar un endpoint bulk nuevo — ver la sub-etapa 3 del plan: el
// cuello de botella de imprimir/descargar en lote no es la red (SQLite en el
// mismo proceso, milisegundos por consulta), así que duplicar el query del
// backend en una segunda ruta no acorta nada.
async function imprimirFacturasSeleccionadas(ids) {
  if (ids.length > LIMITE_LOTE) {
    avisar(`Seleccioná menos de ${LIMITE_LOTE} facturas.`, "atencion");
    return;
  }
  if (
    ids.length > CONFIRMAR_LOTE_DESDE &&
    !(await confirmar({
      titulo: "Imprimir en lote",
      cuerpo: `Se va a abrir el diálogo de impresión con ${ids.length} páginas, una por factura. ¿Continuar?`,
      aceptar: "Imprimir"
    }))
  )
    return;

  const facturasDetalle = await traerConcurrencia(ids, (id) => api(`/api/facturas/${id}`));
  imprimirHojas(facturasDetalle.map(hojaDeFactura));
}

async function descargarPDFFacturasSeleccionadas(ids, btn) {
  if (ids.length > LIMITE_LOTE) {
    avisar(`Seleccioná menos de ${LIMITE_LOTE} facturas.`, "atencion");
    return;
  }
  if (
    ids.length > CONFIRMAR_LOTE_DESDE &&
    !(await confirmar({
      titulo: "Descargar PDF en lote",
      cuerpo: `Se van a generar ${ids.length} archivos PDF, uno por factura. Puede tardar varios minutos y el navegador va a pedirte permiso para descargar varios archivos: aceptalo para que se descarguen todos. ¿Continuar?`,
      aceptar: "Descargar"
    }))
  )
    return;

  const facturasDetalle = await traerConcurrencia(ids, (id) => api(`/api/facturas/${id}`));
  const items = facturasDetalle.map((f) => ({
    html: hojaDeFactura(f),
    nombreArchivo: nombreArchivoPdf("factura", f.comprobante)
  }));
  await descargarPDFsEnLote(items, btn);
}

function renderFacturas(lista) {
  const body = document.getElementById("facturasBody");
  selFacturas.sincronizar(lista);

  if (lista.length === 0) {
    if (filtrosFacturas.filtros.length > 0) {
      body.innerHTML = filaVaciaFiltrada(selFacturas.colspan(7));
      body.querySelector(".tabla-vacia-limpiar").addEventListener("click", () => filtrosFacturas.limpiar());
    } else {
      body.innerHTML = filaVacia(selFacturas.colspan(7), "Todavía no hay facturas cargadas.", { accionTexto: "+ Nueva factura", accionId: "btnNuevaFactura" });
    }
    return;
  }

  body.innerHTML = lista
    .map(
      (f) => `
    <tr class="fila-clickeable" data-id="${f.id}">
      ${selFacturas.celda(f.id)}
      <td data-label="Comprobante" class="mono">${esc(f.comprobante)}</td>
      <td data-label="Tipo">${esc(TIPO_FACTURA_LABEL[f.tipo] ?? f.tipo)}</td>
      <td data-label="Fecha">${esc(fechaAR(f.fecha))}</td>
      <td data-label="Cliente">${esc(f.cliente)}</td>
      <td data-label="Origen">${
        f.venta_id
          ? `<a href="#" class="btn-link ficha-factura-ver-venta" data-venta-id="${f.venta_id}">Venta #${f.venta_id}</a>`
          : `<span class="status">Suelta</span>`
      }</td>
      <td data-label="Importe" class="align-right mono">${money(f.total)}</td>
      <td data-label="Cobro"><span class="status ${ESTADO_COBRO_CLASE[f.estado_cobro]}">${ESTADO_COBRO_LABEL[f.estado_cobro]}</span></td>
    </tr>`
    )
    .join("");

  body.querySelectorAll("tr[data-id]").forEach((tr) => {
    tr.addEventListener("click", (e) => {
      if (e.target.closest("a, button, input, label, select, textarea, .col-sel")) return;
      abrirFichaFactura(Number(tr.dataset.id));
    });
  });

  body.querySelectorAll(".ficha-factura-ver-venta").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      abrirFichaVenta(Number(a.dataset.ventaId));
    });
  });
}

const filtrosFacturas = crearFiltros(
  "filtrosFacturas",
  [
    { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
    { clave: "cliente", etiqueta: "Cliente", tipo: "texto" },
    {
      clave: "tipo",
      etiqueta: "Tipo",
      tipo: "select",
      opciones: [
        { valor: "factura", texto: "Factura" },
        { valor: "nota_credito", texto: "Nota de crédito" },
        { valor: "nota_debito", texto: "Nota de débito" }
      ]
    },
    {
      clave: "letra",
      etiqueta: "Letra",
      tipo: "select",
      opciones: [
        { valor: "A", texto: "A" },
        { valor: "B", texto: "B" },
        { valor: "C", texto: "C" }
      ]
    },
    { clave: "punto_venta", etiqueta: "Punto de venta", tipo: "numero" },
    {
      clave: "condicion",
      etiqueta: "Medio de pago",
      tipo: "select",
      opciones: [
        { valor: "efectivo", texto: "Efectivo" },
        { valor: "transferencia", texto: "Transferencia" },
        { valor: "mercadopago", texto: "Mercado Pago" }
      ]
    },
    {
      clave: "estado_cobro",
      etiqueta: "Estado de cobro",
      tipo: "select",
      opciones: [
        { valor: "pendiente", texto: "Pendiente" },
        { valor: "parcial", texto: "Parcial" },
        { valor: "cobrado", texto: "Cobrado" }
      ]
    },
    { clave: "total", etiqueta: "Importe", tipo: "numero" },
    {
      clave: "respalda_venta",
      etiqueta: "Respalda una venta",
      tipo: "select",
      opciones: [
        { valor: "si", texto: "Sí" },
        { valor: "no", texto: "No (suelta)" }
      ]
    }
  ],
  filtrarFacturas
);

// Mismas columnas que tendría un CSV completo de Facturas (no existe un
// botón "Exportar CSV" de lo visible para esta tabla todavía — solo el de
// lo seleccionado, desde la barra). Números crudos, nunca money(): ver el
// comentario junto a descargarCSV.
const COLUMNAS_CSV_FACTURAS = [
  { titulo: "Comprobante", valor: (f) => f.comprobante },
  { titulo: "Tipo", valor: (f) => TIPO_FACTURA_LABEL[f.tipo] ?? f.tipo },
  { titulo: "Fecha", valor: (f) => f.fecha },
  { titulo: "Cliente", valor: (f) => f.cliente },
  { titulo: "Origen", valor: (f) => (f.venta_id ? `Venta #${f.venta_id}` : "Suelta") },
  { titulo: "Importe", valor: (f) => f.total },
  { titulo: "Cobro", valor: (f) => ESTADO_COBRO_LABEL[f.estado_cobro] ?? f.estado_cobro }
];

function exportarFacturasSeleccionadas(ids) {
  const idsSet = new Set(ids);
  const seleccion = filtrosFacturas
    .aplicar(facturas.map((f) => ({ ...f, respalda_venta: f.venta_id ? "si" : "no" })))
    .filter((f) => idsSet.has(f.id));
  descargarCSV("nexo-facturas-seleccion", COLUMNAS_CSV_FACTURAS, seleccion);
}

async function cargarFacturas() {
  tablaCargando("facturasBody", selFacturas.colspan(6));
  facturas = await api("/api/facturas");
  filtrarFacturas();
}

// La factura que se está mirando, para que el botón Imprimir (estático en el
// HTML, bindeado una sola vez más abajo) sepa qué imprimir.
let facturaFichaDatos = null;

async function abrirFichaFactura(id) {
  const factura = await api(`/api/facturas/${id}`, {
    error: "No se pudo cargar la factura."
  });
  facturaFichaDatos = factura;

  document.getElementById("fichaFacturaTitulo").textContent = factura.comprobante;

  const campos = [
    ["Tipo", TIPO_FACTURA_LABEL[factura.tipo] ?? factura.tipo],
    ["Cliente", factura.cliente],
    ["Fecha", fechaAR(factura.fecha)],
    ["Concepto", factura.concepto],
    ["Medio de pago", CONDICION_FACTURA_LABEL[factura.condicion] ?? factura.condicion],
    ["Importe", money(factura.total)],
    ["Estado de cobro", badge(ESTADO_COBRO_CLASE[factura.estado_cobro], ESTADO_COBRO_LABEL[factura.estado_cobro] ?? factura.estado_cobro)],
    ["Origen", factura.venta_id ? `Venta #${factura.venta_id}` : "Factura suelta (sin venta asociada)"]
  ];
  document.getElementById("fichaFacturaDatos").innerHTML = camposFicha(campos);

  const panelItems = document.getElementById("fichaFacturaItemsPanel");
  if (factura.venta_id) {
    panelItems.hidden = false;
    document.getElementById("fichaFacturaVerVenta").onclick = (e) => {
      e.preventDefault();
      abrirFichaVenta(factura.venta_id);
    };
    document.getElementById("fichaFacturaItems").innerHTML = factura.items
      .map(
        (i) => `
      <tr>
        <td data-label="Producto">${esc(i.producto)}</td>
        <td data-label="Cantidad" class="align-right mono">${numero(i.cantidad)}</td>
        <td data-label="Precio unit." class="align-right mono">${money(i.precio_unitario)}</td>
        <td data-label="Subtotal" class="align-right mono">${money(i.subtotal)}</td>
      </tr>`
      )
      .join("");
  } else {
    panelItems.hidden = true;
  }

  mostrarVista("factura-detalle", { titulo: factura.comprobante });
}

document.getElementById("btnVolverFacturas").addEventListener("click", () => mostrarVista("facturas"));

// Arma el HTML de una hoja de factura. Extraída del botón de abajo para
// reusarla también en la impresión/descarga en lote desde el listado
// (varias facturas a la vez, ver crearSeleccion) sin duplicar la lógica del
// caso "factura suelta".
function hojaDeFactura(f) {
  return armarHojaComprobante({
    rotulo: TIPO_FACTURA_LABEL[f.tipo] ?? "Factura",
    comprobanteNro: f.comprobante,
    fecha: f.fecha,
    // NO van el estado de cobro ni "Origen: Venta #N": son gestión interna.
    campos: [],
    cliente: {
      nombre: f.cliente,
      documento: f.cliente_documento,
      direccion: f.cliente_direccion,
      telefono: f.cliente_telefono,
      email: f.cliente_email
    },
    // Una factura suelta no tiene renglones: se imprime su concepto como
    // único ítem, que es exactamente lo que la factura dice que se cobró.
    items: f.items?.length
      ? f.items
      : [{ producto: f.concepto, cantidad: 1, precio_unitario: f.total }],
    total: f.total
  });
}

// El botón vive en el HTML (no se re-renderiza como el de presupuesto), así
// que se bindea una sola vez y lee la factura de la variable de módulo.
document.getElementById("btnImprimirFactura").addEventListener("click", () => {
  const f = facturaFichaDatos;
  if (!f) return;
  imprimirComprobante(hojaDeFactura(f));
});

/* ---------- Modal nueva factura ---------- */

const modal = document.getElementById("modalFactura");

document.getElementById("btnNuevaFactura").addEventListener("click", () => {
  modal.hidden = false;
});

document.getElementById("modalClose").addEventListener("click", () => {
  modal.hidden = true;
});

modal.addEventListener("click", (e) => {
  if (e.target === modal) modal.hidden = true;
});

document.getElementById("formFactura").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const tipoElegido = form.tipo.value;

  const { id } = await api("/api/facturas", {
    method: "POST",
    body: {
      cliente: form.cliente.value,
      concepto: form.concepto.value,
      neto: parseFloat(form.neto.value),
      condicion: form.condicion.value,
      tipo: tipoElegido,
      letra: form.letra.value,
      punto_venta: Number(form.punto_venta.value) || 1
    },
    error: "No se pudo registrar la factura."
  });

  await refrescar([cargarFacturas()]);
  form.reset();
  modal.hidden = true;
  avisar(`${TIPO_FACTURA_LABEL[tipoElegido] ?? "Factura"} #${id} registrada.`, "ok");
});

/* ---------- Filas de items (Venta / Compra) ---------- */

function actualizarSubtotalFila(fila) {
  const cantidad = Number(fila.querySelector(".item-cantidad").value) || 0;
  const precio = Number(fila.querySelector(".item-precio").value) || 0;
  fila.querySelector(".item-subtotal").textContent = money(cantidad * precio);
}

// Lista de precios elegida en el formulario que contiene este contenedor de
// items (Venta o Presupuesto) — se busca en vez de recibirla por parámetro
// para no tener que tocar los 9 sitios que llaman agregarFilaItemVenta.
// Sin formulario o sin selector (ej. la ficha del asistente, que no tiene
// selector de lista), cae a "" y precioProductoEnLista usa precio_venta.
function listaPrecioDelFormulario(contenedor) {
  const select = contenedor.closest("form")?.querySelector('[name="lista_precio_id"]');
  return select?.value ?? "";
}

// limitarStock: en una venta la cantidad no puede superar el stock actual,
// pero en un presupuesto sí — se puede cotizar algo que todavía no está en
// el depósito (CLAUDE.md §15). El tope se valida igual al convertir.
// Cache de GET /api/productos/:id/variantes por producto, para no
// refetchear cada vez que se toca la misma fila (ej. al tipear letra por
// letra) ni cuando hay varios renglones del mismo producto en la venta o
// la compra.
const variantesPorProductoCache = new Map();
async function variantesDeProducto(productoId) {
  if (!variantesPorProductoCache.has(productoId)) {
    // Si falla no queda cacheada la promesa rechazada: el próximo intento
    // vuelve a pedirla.
    variantesPorProductoCache.set(
      productoId,
      api(`/api/productos/${productoId}/variantes`).catch((e) => {
        variantesPorProductoCache.delete(productoId);
        throw e;
      })
    );
  }
  return variantesPorProductoCache.get(productoId);
}

// La cantidad de un renglón sigue la unidad del producto: por unidad, enteros;
// por kg, litro o metro, con decimales (CLAUDE.md §4).
function ajustarCantidadSegunUnidad(input, producto) {
  const fraccion = esFraccionable(producto?.unidad);
  input.step = fraccion ? "0.001" : "1";
  input.min = fraccion ? "0.001" : "1";
  input.placeholder = producto && producto.unidad !== "unidad" ? `Cant. (${producto.unidad})` : "Cant.";
}

// Un servicio se vende sin tope de stock.
const topeDeStock = (producto) => (producto.tipo === "servicio" ? null : producto.stock);

function agregarFilaItemVenta(contenedor, listaProductos, limitarStock = true) {
  const fila = document.createElement("div");
  fila.className = "item-row";

  fila.innerHTML = `
    <input type="text" class="item-producto" list="productosVenta" placeholder="Buscar ${termino("singular")}…" />
    <input type="hidden" class="item-producto-id" />
    <select class="item-variante-id" hidden><option value="">Elegí una variante…</option></select>
    <input type="number" class="item-cantidad" placeholder="Cant." step="1" min="1" />
    <input type="number" class="item-precio" placeholder="Precio unit." step="0.01" min="0" autocomplete="off" />
    <span class="item-subtotal mono">${money(0)}</span>
    <button type="button" class="item-row-remove" aria-label="Quitar producto">${icono("x")}</button>
  `;

  const productoInput = fila.querySelector(".item-producto");
  const productoIdInput = fila.querySelector(".item-producto-id");
  const varianteSelect = fila.querySelector(".item-variante-id");
  const cantidad = fila.querySelector(".item-cantidad");
  const precio = fila.querySelector(".item-precio");
  // Variantes del producto resuelto en esta fila, para poder resolver el
  // precio sugerido de la variante elegida sin refetchear (variantesDeProducto
  // ya cachea por producto, esto solo evita recorrer la lista de nuevo).
  let variantesFila = [];

  productoInput.addEventListener("input", async () => {
    // Búsqueda por nombre exacto (vía <datalist>, no un <select> cerrado):
    // si el texto matchea un producto existente, se resuelve su id y se
    // sugiere precio y tope de stock; si no matchea nada, no se puede
    // vender un producto que no existe.
    const buscado = productoInput.value.trim().toLowerCase();
    const producto = listaProductos.find((p) => p.nombre.trim().toLowerCase() === buscado);
    ajustarCantidadSegunUnidad(cantidad, producto);
    if (producto) {
      productoIdInput.value = producto.id;
      // Si el producto todavía no tiene precio configurado en la lista
      // elegida (ni propio ni el fallback de precio_venta), se deja el
      // campo vacío en vez de rellenarlo con el costo — así queda claro que
      // hay que ponerle un precio, no un número que parece uno.
      const precioSugerido = precioProductoEnLista(producto, listaPrecioDelFormulario(contenedor));
      precio.value = precioSugerido > 0 ? precioSugerido : "";
      if (producto.tiene_variantes) {
        variantesFila = await variantesDeProducto(producto.id);
        varianteSelect.innerHTML =
          '<option value="">Elegí una variante…</option>' +
          variantesFila
            .filter((v) => v.activo)
            .map(
              (v) =>
                `<option value="${v.id}" data-stock="${esc(v.stock)}">${esc(v.combinacion)}${v.sku ? ` — ${esc(v.sku)}` : ""}</option>`
            )
            .join("");
        varianteSelect.hidden = false;
        varianteSelect.value = "";
        if (limitarStock) cantidad.removeAttribute("max");
      } else {
        variantesFila = [];
        varianteSelect.hidden = true;
        varianteSelect.value = "";
        if (limitarStock && topeDeStock(producto) !== null) cantidad.max = producto.stock;
        else cantidad.removeAttribute("max");
      }
    } else {
      productoIdInput.value = "";
      variantesFila = [];
      varianteSelect.hidden = true;
      varianteSelect.value = "";
      cantidad.removeAttribute("max");
    }
    actualizarSubtotalFila(fila);
    contenedor.dispatchEvent(new Event("item-change"));
  });

  varianteSelect.addEventListener("change", () => {
    // El tope de cantidad es el stock de LA VARIANTE elegida, no el
    // agregado del producto: puede sobrar de una variante hermana y faltar
    // de esta.
    const opcion = varianteSelect.selectedOptions[0];
    if (limitarStock) {
      if (opcion && opcion.value) {
        cantidad.max = Number(opcion.dataset.stock);
      } else {
        cantidad.removeAttribute("max");
      }
    }
    // Elegir variante refina el precio recién sugerido al resolver el
    // producto (Etapa 4: cadena de fallback variante_precios →
    // producto_variantes.precio_venta → precio del producto padre).
    if (opcion && opcion.value) {
      const variante = variantesFila.find((v) => v.id === Number(opcion.value));
      const producto = listaProductos.find((p) => p.id === Number(productoIdInput.value));
      const precioSugerido = precioVarianteEnLista(variante, producto, listaPrecioDelFormulario(contenedor));
      precio.value = precioSugerido > 0 ? precioSugerido : "";
      actualizarSubtotalFila(fila);
    }
    contenedor.dispatchEvent(new Event("item-change"));
  });

  fila.querySelectorAll(".item-cantidad, .item-precio").forEach((input) => {
    input.addEventListener("input", () => {
      actualizarSubtotalFila(fila);
      contenedor.dispatchEvent(new Event("item-change"));
    });
  });

  fila.querySelector(".item-row-remove").addEventListener("click", () => {
    fila.remove();
    contenedor.dispatchEvent(new Event("item-change"));
  });

  contenedor.appendChild(fila);
}

function agregarFilaItemCompra(contenedor, listaProductos) {
  const fila = document.createElement("div");
  fila.className = "item-row";

  fila.innerHTML = `
    <input type="text" class="item-producto" list="productosSugeridos" placeholder="Producto…" />
    <input type="hidden" class="item-producto-id" />
    <select class="item-variante-id" hidden><option value="">Elegí una variante…</option></select>
    <input type="number" class="item-cantidad" placeholder="Cant." step="1" min="1" />
    <input type="number" class="item-precio" placeholder="Costo unit." step="0.01" min="0" autocomplete="off" />
    <span class="item-subtotal mono">${money(0)}</span>
    <button type="button" class="item-row-remove" aria-label="Quitar producto">${icono("x")}</button>
  `;

  const productoInput = fila.querySelector(".item-producto");
  const productoIdInput = fila.querySelector(".item-producto-id");
  const varianteSelect = fila.querySelector(".item-variante-id");

  productoInput.addEventListener("input", async () => {
    // Igual que en Venta: matchea por nombre exacto contra el datalist. Sin
    // match, se sigue permitiendo tipear libre (crearCompra da de alta el
    // producto por nombre) — pero sin id resuelto no hay forma de saber si
    // tiene variantes, así que el select queda oculto.
    const buscado = productoInput.value.trim().toLowerCase();
    const producto = listaProductos.find((p) => p.nombre.trim().toLowerCase() === buscado);
    productoIdInput.value = producto?.id ?? "";
    ajustarCantidadSegunUnidad(fila.querySelector(".item-cantidad"), producto);
    if (producto?.tiene_variantes) {
      const variantes = await variantesDeProducto(producto.id);
      varianteSelect.innerHTML =
        '<option value="">Elegí una variante…</option>' +
        variantes
          .filter((v) => v.activo)
          .map((v) => `<option value="${v.id}">${esc(v.combinacion)}${v.sku ? ` — ${esc(v.sku)}` : ""}</option>`)
          .join("");
      varianteSelect.hidden = false;
    } else {
      varianteSelect.hidden = true;
      varianteSelect.value = "";
    }
    contenedor.dispatchEvent(new Event("item-change"));
  });

  varianteSelect.addEventListener("change", () => {
    contenedor.dispatchEvent(new Event("item-change"));
  });

  fila.querySelectorAll(".item-cantidad, .item-precio").forEach((input) => {
    input.addEventListener("input", () => {
      actualizarSubtotalFila(fila);
      contenedor.dispatchEvent(new Event("item-change"));
    });
  });

  fila.querySelector(".item-row-remove").addEventListener("click", () => {
    fila.remove();
    contenedor.dispatchEvent(new Event("item-change"));
  });

  contenedor.appendChild(fila);
}

// Al cambiar la lista de precios de una Venta/Presupuesto con ítems ya
// cargados, se repropone el precio de cada renglón con producto resuelto —
// avisando, nunca en silencio (CLAUDE.md §18: el precio SUGERIDO cambia
// con la lista, la operación no pierde datos sin que el usuario se entere).
// Un
// renglón cuyo precio ya fue tocado a mano por el usuario (distinto del que
// tenía la lista anterior) queda afuera del reproponer, para no pisar un
// descuento negociado a propósito.
async function reproponerPreciosPorLista(contenedor, listaProductos) {
  const listaId = listaPrecioDelFormulario(contenedor);
  let cambios = 0;
  for (const fila of contenedor.querySelectorAll(".item-row")) {
    const productoId = Number(fila.querySelector(".item-producto-id").value);
    if (!productoId) continue;
    const producto = listaProductos.find((p) => p.id === productoId);
    if (!producto) continue;
    const varianteSelect = fila.querySelector(".item-variante-id");
    const varianteId = !varianteSelect.hidden && varianteSelect.value ? Number(varianteSelect.value) : null;
    const precioInput = fila.querySelector(".item-precio");
    const precioActual = Number(precioInput.value) || 0;

    let precioNuevo;
    let preciosConocidos;
    if (varianteId) {
      const variante = (await variantesDeProducto(productoId)).find((v) => v.id === varianteId);
      if (!variante) continue;
      // Igual criterio que sin variante: si el precio actual coincide con
      // alguno de los precios conocidos (de la variante o del producto
      // padre), se asume que nadie lo tocó a mano y es seguro reproponerlo.
      preciosConocidos = [
        variante.precio_venta,
        ...Object.values(variante.precios || {}),
        producto.precio_venta,
        ...Object.values(producto.precios || {})
      ];
      precioNuevo = precioVarianteEnLista(variante, producto, listaId);
    } else {
      preciosConocidos = [producto.precio_venta, ...Object.values(producto.precios || {})];
      precioNuevo = precioProductoEnLista(producto, listaId);
    }
    if (!preciosConocidos.includes(precioActual)) continue;
    if (precioNuevo !== precioActual) {
      precioInput.value = precioNuevo > 0 ? precioNuevo : "";
      actualizarSubtotalFila(fila);
      cambios++;
    }
  }
  if (cambios > 0) {
    contenedor.dispatchEvent(new Event("item-change"));
    avisar(`Se actualizaron ${cambios} precio${cambios === 1 ? "" : "s"} según la lista elegida.`, "atencion");
  }
}

function leerItemsVenta(contenedor) {
  const items = [];
  contenedor.querySelectorAll(".item-row").forEach((fila) => {
    const producto_id = Number(fila.querySelector(".item-producto-id").value);
    const varianteSelect = fila.querySelector(".item-variante-id");
    const variante_id = !varianteSelect.hidden && varianteSelect.value ? Number(varianteSelect.value) : null;
    const cantidad = Number(fila.querySelector(".item-cantidad").value);
    const precio_unitario = Number(fila.querySelector(".item-precio").value);
    if (producto_id && cantidad > 0 && precio_unitario >= 0) {
      items.push({ producto_id, variante_id, cantidad, precio_unitario });
    }
  });
  return items;
}

function leerItemsCompra(contenedor) {
  const items = [];
  contenedor.querySelectorAll(".item-row").forEach((fila) => {
    const producto = fila.querySelector(".item-producto").value.trim();
    const varianteSelect = fila.querySelector(".item-variante-id");
    const variante_id = !varianteSelect.hidden && varianteSelect.value ? Number(varianteSelect.value) : null;
    const cantidad = Number(fila.querySelector(".item-cantidad").value);
    const precio_unitario = Number(fila.querySelector(".item-precio").value);
    if (producto && cantidad > 0 && precio_unitario >= 0) {
      items.push({ producto, variante_id, cantidad, precio_unitario });
    }
  });
  return items;
}

function totalItems(contenedor) {
  let total = 0;
  contenedor.querySelectorAll(".item-row").forEach((fila) => {
    const cantidad = Number(fila.querySelector(".item-cantidad").value) || 0;
    const precio_unitario = Number(fila.querySelector(".item-precio").value) || 0;
    total += cantidad * precio_unitario;
  });
  return total;
}

/* ---------- Productos ---------- */

let productos = [];
let categorias = [];
let listasPrecios = [];
// Depósitos (CLAUDE.md §19): se cargan junto con productos, igual que
// listasPrecios — Venta, Compra y el modal de ajuste de stock necesitan la
// lista completa para poblar sus selects.
let depositos = [];
let productoEditandoId = null;
let productoFichaId = null;

// La predeterminada es el fallback de todo el sistema (CLAUDE.md §18): si
// un producto no tiene precio propio en la lista elegida, o si una
// venta/presupuesto no especifica lista, se asume esta.
function listaPrecioPredeterminada() {
  return listasPrecios.find((l) => l.es_predeterminada) ?? null;
}

// Mismo criterio que listaPrecioPredeterminada (CLAUDE.md §19): el
// depósito que asumen Venta/Compra/Ajuste cuando no se elige uno propio.
function depositoPredeterminado() {
  return depositos.find((d) => d.es_predeterminado) ?? null;
}

// Precio de UN producto en UNA lista puntual, con el mismo fallback que ya
// aplica el backend: si el producto no tiene precio propio cargado ahí,
// cae a precio_venta (que es, por construcción, el precio de la
// predeterminada). listaId puede venir vacío (string del <select>, "" o
// undefined) — en ese caso también se usa precio_venta.
function precioProductoEnLista(producto, listaId) {
  if (!producto) return 0;
  const id = Number(listaId) || null;
  if (id && producto.precios && producto.precios[id] !== undefined) {
    return producto.precios[id];
  }
  return producto.precio_venta;
}

// Precio de UNA variante en UNA lista, con la misma cadena de fallback que
// ya resuelve el backend para variantes (ver plan de la Etapa 4):
// variante_precios → producto_variantes.precio_venta → precio del producto
// padre en esa lista (precioProductoEnLista, con su propio fallback).
function precioVarianteEnLista(variante, producto, listaId) {
  if (!variante) return precioProductoEnLista(producto, listaId);
  const id = Number(listaId) || null;
  if (id && variante.precios && variante.precios[id] !== undefined) {
    return variante.precios[id];
  }
  if (variante.precio_venta !== null && variante.precio_venta !== undefined) {
    return variante.precio_venta;
  }
  return precioProductoEnLista(producto, listaId);
}

function poblarDatalistProductos() {
  const opciones = productos.map((p) => `<option value="${esc(p.nombre)}"></option>`).join("");
  document.getElementById("productosSugeridos").innerHTML = opciones;
  document.getElementById("productosVenta").innerHTML = opciones;
}

const porcentaje = (n) => (n == null ? "—" : `${n.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`);

const selProductos = crearSeleccion("productosBody");

// Sin objetivo cargado no hay nada que mostrar (guion). Reusa las mismas
// clases que ya existen para "cobrado"/"pendiente" en vez de CSS nuevo.
// `conValor` suma el % objetivo al lado del badge (tabla, donde no hay otra
// columna que ya lo muestre); en la ficha ese número ya tiene su propia fila.
function badgeMargenObjetivo(p, conValor = false) {
  if (p.margen_objetivo == null) return "—";
  const clase = p.margen_bajo_objetivo ? "status-pendiente" : "status-cobrado";
  const texto = p.margen_bajo_objetivo ? "Bajo objetivo" : "En objetivo";
  const badge = `<span class="status ${clase}">${texto}</span>`;
  return conValor ? `${badge} <span class="mono">${porcentaje(p.margen_objetivo)}</span>` : badge;
}

function renderProductos(lista) {
  const body = document.getElementById("productosBody");
  body.innerHTML = "";
  selProductos.sincronizar(lista);
  body.closest("table").classList.toggle("sin-sku", !productos.some((p) => p.sku));

  if (lista.length === 0) {
    if (filtrosProductos.filtros.length > 0) {
      body.innerHTML = filaVaciaFiltrada(selProductos.colspan(10));
      body.querySelector(".tabla-vacia-limpiar").addEventListener("click", () => filtrosProductos.limpiar());
    } else {
      body.innerHTML = filaVacia(selProductos.colspan(10), `Todavía no hay ${termino("plural")} cargados.`, {
        accionTexto: `+ Nuevo ${termino("singular")}`,
        accionId: "btnNuevoProducto"
      });
    }
    return;
  }

  for (const p of lista) {
    const tr = document.createElement("tr");
    tr.className = "fila-clickeable";
    // La celda de Precio se ve como texto plano, igual que Costo o
    // Valorizado — el <input> real no existe hasta que se hace click
    // (ver activarEdicionPrecio), así que no hay una "cajita" de formulario
    // visible en la tabla, solo al editar. Sin precio configurado (0) se
    // muestra en rojo con el texto "Sin precio", no "$0,00" (que da a
    // entender que de verdad vale cero).
    // Editar el precio es PATCH /api/productos/:id, admin-only en el
    // servidor. `pointer-events: none` no alcanza para bloquear esto en el
    // frontend porque además del click hay un handler de teclado
    // (Enter/Espacio, más abajo) — para no-admin se emite un <span> plano
    // sin `tabindex` ni la clase que dispara los listeners, así que ni el
    // mouse ni el teclado lo activan.
    const precioTexto = p.precio_venta > 0 ? money(p.precio_venta) : "Sin precio";
    const precioCelda = esAdmin()
      ? `<span class="precio-venta-texto mono${p.precio_venta > 0 ? "" : " precio-sin-configurar"}" data-id="${p.id}" tabindex="0">${precioTexto}</span>`
      : `<span class="mono${p.precio_venta > 0 ? "" : " precio-sin-configurar"}">${precioTexto}</span>`;
    tr.innerHTML = `
      ${selProductos.celda(p.id)}
      <td data-label="Nombre">${esc(p.nombre)}</td>
      <td data-label="SKU" class="col-sku">${esc(p.sku || "—")}</td>
      <td data-label="Categoría">${esc(p.categoria || "—")}</td>
      <td data-label="Costo" class="align-right mono col-admin">${money(p.precio_costo)}</td>
      <td data-label="Valorizado" class="align-right mono col-admin" data-modulo="stock">${money(p.valorizado)}</td>
      <td data-label="Precio" class="align-right mono">${precioCelda}</td>
      <td data-label="Margen" class="align-right mono col-admin">${p.margen == null ? "—" : porcentaje(p.margen)}</td>
      <td data-label="Objetivo" class="align-right col-admin">${badgeMargenObjetivo(p, true)}</td>
      <td data-label="Stock" class="align-right mono" data-modulo="stock">${p.tipo === "servicio" ? "Servicio" : esc(cantidad(p.stock, p.unidad))}</td>
      <td data-label="Activo"><span class="status ${p.activo ? "status-cobrado" : "status-vencido"}">${
        p.activo ? "Activo" : "Inactivo"
      }</span></td>
      <td data-label="">${botonEditarFila("btn-editar-producto", p.id, "producto")}</td>
    `;
    tr.addEventListener("click", (e) => {
      if (e.target.closest("button, a, input, label, select, textarea, .col-sel, .precio-venta-texto")) return;
      abrirFichaProducto(p.id);
    });
    body.appendChild(tr);
  }

  body.querySelectorAll(".btn-editar-producto").forEach((btn) => {
    btn.addEventListener("click", () => {
      abrirModalProducto(productos.find((p) => p.id === Number(btn.dataset.id)));
    });
  });

  body.querySelectorAll(".precio-venta-texto").forEach((span) => {
    span.addEventListener("click", () => activarEdicionPrecio(span));
    // Mismo gesto por teclado que un botón: el span es tabulable
    // (tabindex="0") justamente para que Enter/Espacio también sirvan.
    span.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activarEdicionPrecio(span);
      }
    });
  });
}

// Reemplaza el <span> de precio por el <input> editable de siempre, ya
// enfocado. Al confirmar (blur o Enter) guarda y vuelve a redibujar la fila
// completa (cargarProductos ya lo hace), así que no hace falta reconstruir
// el <span> a mano acá — simplemente no se vuelve a tocar este nodo.
function activarEdicionPrecio(span) {
  const productoId = Number(span.dataset.id);
  const producto = productos.find((p) => p.id === productoId);
  if (!producto) return;

  const input = document.createElement("input");
  input.type = "number";
  input.className = `input-inline precio-venta-inline${producto.precio_venta > 0 ? "" : " precio-sin-configurar"}`;
  input.dataset.id = String(productoId);
  input.value = producto.precio_venta > 0 ? producto.precio_venta : "";
  input.placeholder = "Sin precio";
  input.step = "0.01";
  input.min = "0";
  input.autocomplete = "off";

  span.replaceWith(input);
  input.focus();
  input.select();

  let guardado = false;
  const confirmar = async () => {
    if (guardado) return;
    guardado = true;
    // El PATCH espera el producto completo (no solo el precio): se arma
    // con los datos que ya están en caché, cambiando nada más el precio.
    // Si falla igual se recarga: la celda tiene que volver al precio real.
    try {
      await api(`/api/productos/${productoId}`, {
        method: "PATCH",
        body: {
          nombre: producto.nombre,
          sku: producto.sku,
          precio_venta: input.value === "" ? 0 : Number(input.value),
          activo: !!producto.activo,
          stock_minimo: producto.stock_minimo,
          stock_maximo: producto.stock_maximo
        },
        error: "No se pudo actualizar el precio."
      });
    } finally {
      await refrescar([cargarProductos()]);
    }
  };

  input.addEventListener("blur", confirmar);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      input.blur();
    }
  });
  input.addEventListener("click", (e) => e.stopPropagation());
}

// La ficha se arma con la fila que ya está en el array `productos` (la
// lista trae todo lo que hace falta), así que el único fetch es el del
// historial de movimientos.
async function abrirFichaProducto(id) {
  productoFichaId = id;
  const producto = productos.find((p) => p.id === id);
  if (!producto) return;

  document.getElementById("fichaProductoNombre").textContent = producto.nombre;
  document.getElementById("fichaProductoCosto").textContent = money(producto.precio_costo);
  document.getElementById("fichaProductoStock").textContent = numero(producto.stock);
  document.getElementById("fichaProductoValorizado").textContent = money(producto.valorizado);

  // Un servicio no tiene stock, movimientos ni variantes (hist. §78): la ficha
  // muestra qué incluye y cuánto tarda.
  const esServicio = producto.tipo === "servicio";
  document.getElementById("fichaProductoStrip").hidden = esServicio;
  document.getElementById("fichaProductoMovimientosPanel").hidden = esServicio;
  document.getElementById("btnVariantesProducto").hidden = esServicio;

  const campos = [
    ...(esServicio ? [] : [["SKU", producto.sku]]),
    ["Categoría", producto.categoria],
    ...(producto.descripcion ? [["Descripción", producto.descripcion]] : []),
    [
      "Precio de venta",
      producto.precio_venta > 0
        ? money(producto.precio_venta)
        : html('<span class="precio-sin-configurar">Sin precio</span>')
    ],
    // Margen es a la vez costo y ganancia: se saca del todo para no-admin
    // en vez de dejarlo en la lista (esta ficha se arma con un array de
    // pares, no columnas fijas de tabla, así que acá no aplica `.col-admin`
    // — se filtra el dato en JS antes de mapearlo a <dt>/<dd>).
    ...(esAdmin()
      ? [
          ["Margen", producto.margen == null ? null : porcentaje(producto.margen)],
          ["Margen objetivo", producto.margen_objetivo == null ? null : porcentaje(producto.margen_objetivo)],
          ["Vs. objetivo", producto.margen_objetivo == null ? null : html(badgeMargenObjetivo(producto))]
        ]
      : []),
    [esServicio ? "Se cobra por" : "Se vende por", UNIDADES[producto.unidad] ?? producto.unidad],
    ...(esServicio
      ? [
          ["Tipo", "Servicio (sin stock)"],
          ["Duración estimada", duracion(producto.duracion_minutos)]
        ]
      : [
          ["Stock mínimo", cantidad(producto.stock_minimo, producto.unidad)],
          ["Stock máximo", producto.stock_maximo === null ? null : cantidad(producto.stock_maximo, producto.unidad)],
          ["Estado de stock", badge(STOCK_CLASE[producto.estado_stock], STOCK_LABEL[producto.estado_stock])]
        ]),
    ["Activo", producto.activo ? "Sí" : "No"]
  ];
  document.getElementById("fichaProductoDatos").innerHTML = camposFicha(campos);

  const panelVariantes = document.getElementById("fichaProductoVariantesPanel");
  panelVariantes.hidden = !producto.tiene_variantes;
  if (producto.tiene_variantes) {
    const variantes = await api(`/api/productos/${id}/variantes`);
    document.getElementById("fichaProductoVariantesBody").innerHTML = variantes
      .filter((v) => v.activo)
      .map(
        (v) => `
      <tr>
        <td data-label="Combinación">${esc(v.combinacion)}</td>
        <td data-label="SKU">${esc(v.sku || "—")}</td>
        <td data-label="Costo" class="align-right col-admin mono">${money(v.precio_costo)}</td>
        <td data-label="Precio" class="align-right mono">${
          v.precio_venta > 0 ? money(v.precio_venta) : '<span class="precio-sin-configurar">Sin precio</span>'
        }</td>
        <td data-label="Stock" class="align-right mono">${numero(v.stock)}</td>
        <td data-label="Activa">${v.activo ? "Sí" : "No"}</td>
      </tr>`
      )
      .join("");
  }

  const movimientos = await api(`/api/productos/${id}/movimientos`);
  const body = document.getElementById("fichaProductoMovimientos");
  body.innerHTML =
    movimientos.length === 0
      ? filaVacia(5, "Este producto todavía no tiene movimientos de stock.")
      : movimientos
          .map((m) => {
            const origen =
              m.origen === "venta"
                ? `Venta #${m.venta_id}`
                : m.origen === "compra"
                ? `Compra #${m.compra_id}`
                : m.origen === "devolucion"
                ? `Devolución #${m.devolucion_id}`
                : "Ajuste manual";
            const signo = m.delta > 0 ? "+" : "";
            return `
        <tr>
          <td data-label="Fecha">${esc(fechaAR(m.fecha))}</td>
          <td data-label="Origen">${origen}</td>
          <td data-label="Cantidad" class="align-right mono">${signo}${numero(m.delta)}</td>
          <td data-label="Stock resultante" class="align-right mono">${numero(m.stock_posterior)}</td>
          <td data-label="Nota">${esc(m.nota || "—")}</td>
        </tr>`;
          })
          .join("");

  mostrarVista("producto-detalle", { titulo: producto.nombre });
}

async function cargarProductos() {
  tablaCargando("productosBody", selProductos.colspan(10));
  const [listaProductos, listaCategorias, listaListasPrecios, listaDepositos] = await Promise.all([
    api("/api/productos"),
    api("/api/categorias"),
    api("/api/listas-precios"),
    api("/api/depositos")
  ]);
  productos = listaProductos;
  categorias = listaCategorias;
  listasPrecios = listaListasPrecios;
  depositos = listaDepositos;
  // El nombre del catálogo y las pestañas salen de lo que hay (hist. §88).
  fijarTiposDelCatalogo(productos.map(tipoDeProducto));
  poblarDatalistProductos();
  poblarSelectCategorias();

  filtrosProductos.setOpciones(
    "categoria_id",
    categorias.filter((c) => c.activa).map((c) => ({ valor: String(c.id), texto: c.nombre }))
  );

  filtrarProductos();
}

// Llena un <select> de lista de precios con las listas activas. Genérica
// (con default al select de cliente) para poder llenar también los de
// Venta, Presupuesto y el bulk de productos, que necesitan las mismas
// opciones. `conPredeterminada` agrega una opción explícita "Usar la
// predeterminada" con value="" (para cliente, donde NULL es válido);
// Venta/Presupuesto en cambio siempre mandan un id concreto, así que la
// opción de la predeterminada se llama por su nombre real.
function poblarSelectListasPrecios(selector, { conPredeterminada = false } = {}) {
  const select = document.querySelector(selector);
  if (!select) return;
  const actual = select.value;
  const activas = listasPrecios.filter((l) => l.activa);
  const predeterminada = listaPrecioPredeterminada();
  select.innerHTML =
    (conPredeterminada ? '<option value="">Usar la predeterminada</option>' : "") +
    activas
      .map(
        (l) =>
          `<option value="${l.id}">${esc(l.nombre)}${l.es_predeterminada ? " (predeterminada)" : ""}</option>`
      )
      .join("");
  select.value = actual || (conPredeterminada ? "" : String(predeterminada?.id ?? ""));
}

// Llena un <select> de depósito con los activos (CLAUDE.md §19) — mismo
// patrón que poblarSelectListasPrecios: arranca en el predeterminado, sin
// opción "usar la predeterminada" porque Venta/Compra/Ajuste siempre mandan
// un id concreto (el backend interpreta NULL como "el predeterminado de
// ese momento", pero el frontend no necesita mandar NULL a propósito).
function poblarSelectDepositos(selector) {
  const select = document.querySelector(selector);
  if (!select) return;
  const actual = select.value;
  const activos = depositos.filter((d) => d.activo);
  const predeterminado = depositoPredeterminado();
  select.innerHTML = activos
    .map((d) => `<option value="${d.id}">${esc(d.nombre)}${d.es_predeterminado ? " (predeterminado)" : ""}</option>`)
    .join("");
  select.value = actual || String(predeterminado?.id ?? "");
}

// Llena el <select> de categoría del formulario de alta/edición de
// producto — mismo criterio que poblarSelectCuentas (Ventas/Compras): las
// opciones dependen de datos que llegan por fetch, así que se arman en
// runtime en vez de quedar fijas en el HTML.
//
// Generalizada (con default al select de siempre) para poder llenar
// también el select de categoría del modal de edición en lote, que
// necesita exactamente las mismas opciones.
function poblarSelectCategorias(selector = '#formProducto [name="categoria_id"]') {
  const select = document.querySelector(selector);
  const actual = select.value;
  select.innerHTML =
    '<option value="">Sin categoría</option>' +
    categorias
      .filter((c) => c.activa)
      .map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`)
      .join("");
  select.value = actual;
}

function filtrarProductos() {
  renderProductos(listaProductosVisible());
}

// Lo que la tabla muestra (pestaña + búsqueda + filtros + orden): lo usan la
// tabla y el CSV, para que coincidan.
function listaProductosVisible() {
  const q = document.getElementById("productosSearch").value.trim().toLowerCase();
  const porTexto = productos.filter(
    (p) =>
      (!catalogoMixto() || tipoDeProducto(p) === pestanaProductos) &&
      [p.nombre, p.sku].some((campo) => (campo ?? "").toLowerCase().includes(q))
  );
  return filtrosProductos.aplicar(porTexto);
}

/* ---------- Pestañas Productos | Servicios (hist. §88) ---------- */

// Con productos y servicios cargados, el catálogo se ve en dos pestañas, para
// que no se mezclen: cada una con su "Nuevo", y la de servicios sin Stock ni
// Valorizado. Con un solo tipo no hay pestañas y la sección lleva su nombre
// (termino() en core/negocio.js).
const tipoDeProducto = (p) => (p.tipo === "servicio" ? "servicio" : "producto");
const PESTANA_DE_SUBRUTA = { productos: "producto", servicios: "servicio" };
let pestanaProductos = "producto";

function pintarPestanasProductos() {
  const mixto = catalogoMixto();
  document.getElementById("productosMenu").hidden = !mixto;
  for (const enlace of document.querySelectorAll("#productosMenu .segmento")) {
    if (enlace.dataset.pestana === pestanaProductos) enlace.setAttribute("aria-current", "page");
    else enlace.removeAttribute("aria-current");
  }
  document.getElementById("productosTabla").classList.toggle("solo-servicios", mixto && pestanaProductos === "servicio");
  document.getElementById("productosTitulo").textContent = mixto ? terminoDeTipo(pestanaProductos, "Plural") : termino("Plural");
  document.getElementById("btnNuevoProductoTermino").textContent = mixto ? terminoDeTipo(pestanaProductos) : termino("singular");
  // La barra de direcciones sigue a la pestaña (también cuando la cambia el
  // guardado de un producto), sin sumar una entrada al historial.
  if (mixto && location.hash.startsWith("#/productos")) {
    history.replaceState(null, "", `#/productos/${terminoDeTipo(pestanaProductos, "plural")}`);
  }
}

document.addEventListener("nexo:catalogo", pintarPestanasProductos);

alEntrarEnVista("productos", (subruta) => {
  const elegida = PESTANA_DE_SUBRUTA[subruta];
  if (!elegida || elegida === pestanaProductos) return;
  pestanaProductos = elegida;
  pintarPestanasProductos();
  filtrarProductos();
});

const COLUMNAS_CSV_PRODUCTOS = [
  { titulo: "Nombre", valor: (p) => p.nombre },
  { titulo: "SKU", valor: (p) => p.sku },
  { titulo: "Categoría", valor: (p) => p.categoria },
  { titulo: "Costo", valor: (p) => p.precio_costo, admin: true },
  { titulo: "Valorizado", valor: (p) => p.valorizado, admin: true },
  { titulo: "Precio", valor: (p) => p.precio_venta },
  { titulo: "Margen", valor: (p) => p.margen, admin: true },
  { titulo: "Margen objetivo", valor: (p) => p.margen_objetivo, admin: true },
  { titulo: "Bajo objetivo", valor: (p) => (p.margen_bajo_objetivo == null ? "" : p.margen_bajo_objetivo ? "sí" : "no"), admin: true },
  { titulo: "Stock", valor: (p) => p.stock },
  { titulo: "Activo", valor: (p) => (p.activo ? "sí" : "no") }
];

montarBarraSeleccion(selProductos, [
  {
    etiqueta: "Editar en lote",
    onClick: (ids) => abrirModalBulkProductos(ids)
  },
  {
    etiqueta: "Exportar CSV",
    onClick: (ids) => {
      const idsSet = new Set(ids);
      descargarCSV("nexo-productos-seleccion", columnasVisibles(COLUMNAS_CSV_PRODUCTOS), listaProductosVisible().filter((p) => idsSet.has(p.id)));
    }
  }
]);

/* ---------- Edición en lote de productos ---------- */
//
// bulkProductosIds guarda una COPIA de los ids con los que se abrió el
// modal — no se lee selProductos.ids de nuevo al hacer submit. Si el
// usuario deja el modal abierto y algo dispara un re-render de la tabla,
// sincronizar() podría podar la selección, y el lote cambiaría bajo los
// pies del usuario entre "vio el número" y "apretó aplicar".
let bulkProductosIds = [];

const modalBulkProductos = document.getElementById("modalBulkProductos");
const formBulkProductos = document.getElementById("formBulkProductos");
const bulkProductosResultado = document.getElementById("bulkProductosResultado");
const bulkProductosResultadoTitulo = document.getElementById("bulkProductosResultadoTitulo");
const bulkProductosResultadoLista = document.getElementById("bulkProductosResultadoLista");

// Habilita/deshabilita el o los inputs de un .bulk-campo según su checkbox
// de activación — un solo listener delegado, no uno por campo.
formBulkProductos.addEventListener("change", (e) => {
  if (!e.target.classList.contains("bulk-activar")) return;
  const campo = e.target.closest(".bulk-campo");
  campo.querySelectorAll("select, input:not(.bulk-activar)").forEach((el) => {
    el.disabled = !e.target.checked;
  });
});

function abrirModalBulkProductos(ids) {
  bulkProductosIds = ids;
  formBulkProductos.reset();
  formBulkProductos.querySelectorAll(".bulk-activar").forEach((cb) => {
    cb.checked = false;
    cb.dispatchEvent(new Event("change"));
  });
  poblarSelectCategorias('#formBulkProductos [name="categoria_id"]');
  poblarSelectListasPrecios('#formBulkProductos [name="precio_lista_id"]');
  bulkProductosResultado.hidden = true;
  document.getElementById("modalBulkProductosConteo").textContent =
    `${ids.length} producto${ids.length === 1 ? "" : "s"} seleccionado${ids.length === 1 ? "" : "s"}`;
  document.getElementById("bulkProductosSubmit").textContent = `Aplicar a ${ids.length} producto${ids.length === 1 ? "" : "s"}`;
  modalBulkProductos.hidden = false;
}

document.getElementById("modalBulkProductosClose").addEventListener("click", () => {
  modalBulkProductos.hidden = true;
});
modalBulkProductos.addEventListener("click", (e) => {
  if (e.target === modalBulkProductos) modalBulkProductos.hidden = true;
});

// Arma el `cambios` parcial a partir de los checkboxes tildados: solo un
// campo con su checkbox activo termina viajando en el request. Es la
// implementación concreta de "ausencia de la clave = no tocar este campo".
function armarCambiosBulk(form) {
  const cambios = {};
  if (form.querySelector('[data-campo="activo"]').checked) {
    cambios.activo = form.activo.value === "1";
  }
  if (form.querySelector('[data-campo="categoria_id"]').checked) {
    cambios.categoria_id = form.categoria_id.value || null;
  }
  if (form.querySelector('[data-campo="stock_minimo"]').checked) {
    cambios.stock_minimo = form.stock_minimo.value;
  }
  if (form.querySelector('[data-campo="margen_objetivo"]').checked) {
    cambios.margen_objetivo = form.margen_objetivo.value === "" ? null : Number(form.margen_objetivo.value);
  }
  if (form.querySelector('[data-campo="precio_venta"]').checked) {
    const ajuste =
      form.precio_modo.value === "porcentaje"
        ? { modo: "porcentaje", valor: form.precio_valor.value }
        : Number(form.precio_valor.value);
    // La lista predeterminada usa precio_venta (columna del producto); una
    // lista distinta se manda como precios[id] — ver aplicarEdicionProducto
    // en server.js, que trata a las dos por separado.
    const predeterminada = listaPrecioPredeterminada();
    const listaElegidaId = Number(form.precio_lista_id.value);
    if (!predeterminada || listaElegidaId === predeterminada.id) {
      cambios.precio_venta = ajuste;
    } else {
      cambios.precios = { [listaElegidaId]: ajuste };
    }
  }
  return cambios;
}

formBulkProductos.addEventListener("submit", async (e) => {
  e.preventDefault();
  const cambios = armarCambiosBulk(e.target);
  if (Object.keys(cambios).length === 0) {
    avisar("No indicaste ningún cambio.", "atencion");
    return;
  }

  if (cambios.activo === false || bulkProductosIds.length > 20) {
    const ok = await confirmar({
      titulo: "Editar en lote",
      cuerpo: `Se va a aplicar este cambio a ${bulkProductosIds.length} productos. ¿Confirmás?`,
      aceptar: "Aplicar",
      destructivo: cambios.activo === false
    });
    if (!ok) return;
  }

  const resultado = await api("/api/productos/bulk", {
    method: "POST",
    body: { ids: bulkProductosIds, cambios },
    error: "No se pudo aplicar la edición en lote."
  });

  await refrescar([cargarProductos(), cargarReporteStock(), cargarPanelResumen()]);

  const huboFallos = mostrarResultadoBulk(resultado, {
    bloque: bulkProductosResultado,
    titulo: bulkProductosResultadoTitulo,
    lista: bulkProductosResultadoLista,
    etiquetar: (id) => {
      const p = productos.find((prod) => prod.id === id);
      return p ? p.nombre : `#${id}`;
    }
  });

  if (huboFallos) {
    // El modal queda abierto y bulkProductosIds pasa a ser solo los que
    // fallaron: si el usuario corrige un campo y vuelve a apretar el
    // mismo botón, el próximo submit reintenta justo sobre ese
    // subconjunto, sin tener que volver a seleccionarlos a mano en la
    // tabla. El texto del botón lo deja explícito (no dice "Cerrar": el
    // submit vuelve a aplicar, no cierra el modal).
    bulkProductosIds = resultado.fallidos.map((f) => f.id);
    document.getElementById("bulkProductosSubmit").textContent =
      `Reintentar con ${bulkProductosIds.length} producto${bulkProductosIds.length === 1 ? "" : "s"}`;
  } else {
    selProductos.limpiar();
    modalBulkProductos.hidden = true;
  }
});

const OPCIONES_ESTADO_STOCK = [
  { valor: "sin_stock", texto: "Sin stock" },
  { valor: "bajo", texto: "Bajo" },
  { valor: "normal", texto: "Normal" },
  { valor: "alto", texto: "Alto" }
];

const filtrosProductos = crearFiltros(
  "filtrosProductos",
  [
    { clave: "nombre", etiqueta: "Nombre", tipo: "texto" },
    { clave: "sku", etiqueta: "SKU", tipo: "texto" },
    { clave: "categoria_id", etiqueta: "Categoría", tipo: "select", opciones: [] },
    {
      clave: "activo",
      etiqueta: "Activo",
      tipo: "select",
      opciones: [
        { valor: "1", texto: "Sí" },
        { valor: "0", texto: "No" }
      ]
    },
    { clave: "estado_stock", etiqueta: "Estado de stock", tipo: "select", opciones: OPCIONES_ESTADO_STOCK },
    { clave: "precio_venta", etiqueta: "Precio de venta", tipo: "numero" },
    { clave: "precio_costo", etiqueta: "Costo", tipo: "numero" },
    { clave: "margen", etiqueta: "Margen", tipo: "numero" },
    { clave: "margen_objetivo", etiqueta: "Margen objetivo", tipo: "numero" },
    {
      clave: "margen_bajo_objetivo",
      etiqueta: "Vs. objetivo",
      tipo: "select",
      opciones: [
        { valor: "true", texto: "Bajo objetivo" },
        { valor: "false", texto: "En objetivo" }
      ]
    },
    { clave: "stock", etiqueta: "Stock", tipo: "numero" },
    { clave: "valorizado", etiqueta: "Valorizado", tipo: "numero" }
  ],
  filtrarProductos
);

document.getElementById("productosSearch").addEventListener("input", filtrarProductos);

const modalProducto = document.getElementById("modalProducto");

// Precios por lista (todas menos la predeterminada, que ya se carga en el
// campo precio_venta de arriba): solo tiene sentido en EDICIÓN. Un producto
// recién creado todavía no existe en la base, así que no hay id contra el
// cual guardar filas de producto_precios — se completan después, editando,
// igual que ya pasa con el costo ("el costo no se carga acá").
function poblarPreciosPorLista(producto) {
  const contenedor = document.getElementById("preciosPorListaProducto");
  const predeterminada = listaPrecioPredeterminada();
  const otras = listasPrecios.filter((l) => l.activa && l.id !== predeterminada?.id);

  if (!producto || otras.length === 0) {
    contenedor.innerHTML = "";
    return;
  }

  contenedor.innerHTML = otras
    .map((l) => {
      const precioActual = producto.precios?.[l.id];
      return `
        <label>Precio (${esc(l.nombre)})
          <input type="number" class="precio-lista-input" data-lista-id="${l.id}"
                 step="0.01" min="0" placeholder="Sin precio propio: usa ${money(producto.precio_venta)}"
                 value="${precioActual !== undefined ? precioActual : ""}" autocomplete="off" />
        </label>`;
    })
    .join("");
}

// `tipo` es con qué tipo nace uno nuevo: el de la pestaña, o si no hay
// pestañas, el del tipo de negocio.
function abrirModalProducto(producto = null, { tipo } = {}) {
  productoEditandoId = producto?.id ?? null;
  const form = document.getElementById("formProducto");
  form.nombre.value = producto?.nombre ?? "";
  form.sku.value = producto?.sku ?? "";
  form.descripcion.value = producto?.descripcion ?? "";
  form.duracion_minutos.value = producto?.duracion_minutos ?? "";
  form.categoria_id.value = producto?.categoria_id ?? "";
  form.precio_venta.value = producto?.precio_venta ?? "";
  form.margen_objetivo.value = producto?.margen_objetivo ?? "";
  form.stock_minimo.value = producto?.stock_minimo ?? "";
  form.stock_maximo.value = producto?.stock_maximo ?? "";
  form.activo.checked = producto ? !!producto.activo : true;
  // Un producto nuevo nace con la unidad y el tipo del tipo de negocio (una
  // carnicería vende por kg, un gimnasio vende servicios).
  form.unidad.value = producto?.unidad ?? negocio.unidad_defecto ?? "unidad";
  form.tipo.value = producto?.tipo ?? tipo ?? negocio.tipo_defecto ?? "producto";
  mostrarCamposSegunTipo();
  poblarPreciosPorLista(producto);
  modalProducto.hidden = false;
}

// Un servicio no maneja stock (no tiene mínimo ni máximo que cargar) y no
// lleva SKU, pero sí una duración estimada (hist. §78). El SKU que ya tenga
// sigue viéndose, para poder borrarlo. El título dice lo que se está cargando
// (hist. §88): "Nuevo servicio" aunque el catálogo sea de productos.
function mostrarCamposSegunTipo() {
  const form = document.getElementById("formProducto");
  const esServicio = form.tipo.value === "servicio";
  const palabra = terminoDeTipo(esServicio ? "servicio" : "producto");
  document.getElementById("modalProductoTitulo").textContent = `${productoEditandoId ? "Editar" : "Nuevo"} ${palabra}`;
  form.nombre.placeholder = `Nombre del ${palabra}`;
  document.getElementById("productoStockCampos").hidden = esServicio;
  document.getElementById("productoSkuCampo").hidden = esServicio && !form.sku.value;
  document.getElementById("productoDuracionCampo").hidden = !esServicio;
  document.getElementById("productoUnidadEtiqueta").textContent = esServicio ? "Se cobra por" : "Se vende por";
}
document.getElementById("formProducto").tipo.addEventListener("change", mostrarCamposSegunTipo);

document.getElementById("btnNuevoProducto").addEventListener("click", () =>
  abrirModalProducto(null, { tipo: catalogoMixto() ? pestanaProductos : undefined })
);
document.getElementById("btnEditarProducto").addEventListener("click", () => {
  abrirModalProducto(productos.find((p) => p.id === productoFichaId));
});
document.getElementById("btnVolverProductos").addEventListener("click", () => mostrarVista("productos"));
document.getElementById("modalProductoClose").addEventListener("click", () => {
  modalProducto.hidden = true;
});
modalProducto.addEventListener("click", (e) => {
  if (e.target === modalProducto) modalProducto.hidden = true;
});

document.getElementById("formProducto").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const datos = {
    nombre: form.nombre.value,
    sku: form.sku.value || null,
    descripcion: form.descripcion.value,
    // La duración es de un servicio: un producto no la manda.
    duracion_minutos: form.tipo.value === "servicio" && form.duracion_minutos.value !== "" ? Number(form.duracion_minutos.value) : null,
    categoria_id: form.categoria_id.value || null,
    precio_venta: form.precio_venta.value,
    margen_objetivo: form.margen_objetivo.value === "" ? null : Number(form.margen_objetivo.value),
    stock_minimo: form.stock_minimo.value,
    stock_maximo: form.stock_maximo.value,
    activo: form.activo.checked,
    unidad: form.unidad.value,
    tipo: form.tipo.value
  };
  // precios por lista: solo en edición (ver poblarPreciosPorLista). Un
  // input vacío significa "sin precio propio en esa lista", no se manda —
  // así no se pisa un precio existente con 0 por accidente.
  if (productoEditandoId) {
    const precios = {};
    document.querySelectorAll("#preciosPorListaProducto .precio-lista-input").forEach((input) => {
      if (input.value !== "") precios[input.dataset.listaId] = Number(input.value);
    });
    if (Object.keys(precios).length > 0) datos.precios = precios;
  }

  await api(productoEditandoId ? `/api/productos/${productoEditandoId}` : "/api/productos", {
    method: productoEditandoId ? "PATCH" : "POST",
    body: datos,
    error: `No se pudo guardar el ${terminoDeTipo(datos.tipo)}.`
  });

  const eraEdicion = productoEditandoId !== null;
  // Con productos y servicios, la tabla queda en la pestaña de lo que se
  // acaba de guardar (hist. §88).
  pestanaProductos = datos.tipo === "servicio" ? "servicio" : "producto";
  // categoria_id también puede cambiar acá, y "Ventas por categoría" (en
  // Qué se vende) agrupa por la categoría ACTUAL del producto, no por una
  // foto histórica — así que también hay que refrescarlo.
  await refrescar([cargarProductos(), cargarReporteStock(), cargarPanelResumen()]);
  // Si se editaba desde la ficha, se refresca para que muestre los datos
  // nuevos en vez de quedar con los viejos detrás del modal.
  if (eraEdicion && productoFichaId) await abrirFichaProducto(productoFichaId);
  form.reset();
  modalProducto.hidden = true;
  avisar(`${terminoDeTipo(datos.tipo, "Singular")} ${eraEdicion ? "actualizado" : "creado"}.`, "ok");
});

/* ---------- Atributos y variantes de producto ---------- */
//
// Solo accesible desde la ficha de un producto ya guardado (btnVariantesProducto
// vive en #producto-detalle, no en el alta). Un atributo (Talle, Color...) es
// propio del producto; una variante es una combinación concreta de un valor
// por cada atributo. La combinación de una variante no se edita una vez
// creada (evita corromper el significado de variante_id en movimientos ya
// generados): para corregir un error se desactiva y se crea de nuevo.

let variantesProductoId = null;
let variantesAtributosCache = [];
let variantesCache = [];

const modalVariantesProducto = document.getElementById("modalVariantesProducto");

async function cargarVariantesModal() {
  const [atributos, variantes] = await Promise.all([
    api(`/api/productos/${variantesProductoId}/atributos`),
    api(`/api/productos/${variantesProductoId}/variantes`)
  ]);
  variantesAtributosCache = atributos;
  variantesCache = variantes;
  renderVariantesAtributos();
  renderVariantesTabla();
}

function renderVariantesAtributos() {
  const cont = document.getElementById("variantesAtributosLista");
  if (variantesAtributosCache.length === 0) {
    cont.innerHTML =
      '<p class="form-note">Todavía no hay atributos. Agregá el primero (ej. "Talle") para poder crear variantes.</p>';
    return;
  }
  cont.innerHTML = variantesAtributosCache
    .map(
      (a) => `
    <div class="atributo-item" data-atributo-id="${a.id}">
      <div class="atributo-item-head">
        <strong>${esc(a.nombre)}</strong>
        <button type="button" class="btn-icon-danger btn-eliminar-atributo" data-id="${a.id}" title="Eliminar atributo" aria-label="Eliminar atributo">${ICONO_TACHO}</button>
      </div>
      <div class="atributo-valores">
        ${a.valores
          .map(
            (v) =>
              `<span class="chip">${esc(v.valor)}<button type="button" class="btn-eliminar-valor" data-atributo-id="${a.id}" data-valor-id="${v.id}" aria-label="Eliminar valor ${esc(v.valor)}">×</button></span>`
          )
          .join("")}
        <form class="atributo-valor-form" data-atributo-id="${a.id}">
          <label class="visualmente-oculto" for="valorNuevo${a.id}">Nuevo valor de ${esc(a.nombre)}</label>
          <input type="text" id="valorNuevo${a.id}" placeholder="Nuevo valor" required />
          <button type="submit" class="btn btn-secundario">+</button>
        </form>
      </div>
    </div>`
    )
    .join("");

  cont.querySelectorAll(".btn-eliminar-atributo").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ok = await confirmar({
        titulo: "Eliminar atributo",
        cuerpo: "¿Eliminar este atributo y sus valores? No se puede si ya tiene variantes creadas.",
        aceptar: "Eliminar",
        destructivo: true
      });
      if (!ok) return;
      await api(`/api/productos/${variantesProductoId}/atributos/${btn.dataset.id}`, {
        method: "DELETE",
        error: "No se pudo eliminar el atributo."
      });
      await refrescar([cargarVariantesModal()]);
    });
  });

  cont.querySelectorAll(".btn-eliminar-valor").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api(`/api/productos/${variantesProductoId}/atributos/${btn.dataset.atributoId}/valores/${btn.dataset.valorId}`, {
        method: "DELETE",
        error: "No se pudo eliminar el valor."
      });
      await refrescar([cargarVariantesModal()]);
    });
  });

  cont.querySelectorAll(".atributo-valor-form").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = form.querySelector("input");
      await api(`/api/productos/${variantesProductoId}/atributos/${form.dataset.atributoId}/valores`, {
        method: "POST",
        body: { valor: input.value },
        error: "No se pudo agregar el valor."
      });
      await refrescar([cargarVariantesModal()]);
    });
  });
}

// Mismo criterio que poblarPreciosPorLista (Productos): un mini-input por
// cada lista activa que no sea la predeterminada (esa ya se edita arriba,
// en la columna "Precio de venta"). Sin precio propio cargado, la variante
// cae al fallback de precioVarianteEnLista (precio_venta de la variante, y
// de ahí al precio del producto padre en esa lista).
function preciosPorListaVarianteHtml(v) {
  const predeterminada = listaPrecioPredeterminada();
  const otras = listasPrecios.filter((l) => l.activa && l.id !== predeterminada?.id);
  if (otras.length === 0) return "";
  return otras
    .map((l) => {
      const precioActual = v.precios?.[l.id];
      return `
        <label>${esc(l.nombre)}
          <input type="number" class="variante-precio-lista" data-lista-id="${l.id}"
                 step="0.01" min="0" placeholder="Sin precio propio"
                 value="${precioActual !== undefined ? precioActual : ""}" autocomplete="off" />
        </label>`;
    })
    .join("");
}

function renderVariantesTabla() {
  const body = document.getElementById("variantesProductoBody");
  if (variantesCache.length === 0) {
    body.innerHTML = filaVacia(7, "Todavía no hay variantes creadas.");
    return;
  }
  body.innerHTML = variantesCache
    .map(
      (v) => `
    <tr class="${v.activo ? "" : "fila-anulada"}" data-variante-id="${v.id}">
      <td data-label="Combinación">${esc(v.combinacion)}</td>
      <td data-label="SKU"><input type="text" class="variante-sku" value="${esc(v.sku ?? "")}" placeholder="—" /></td>
      <td data-label="Precio de venta" class="align-right"><input type="number" step="0.01" min="0" class="variante-precio" value="${esc(v.precio_venta ?? "")}" placeholder="Sin precio propio" /></td>
      <td data-label="Precios por lista" class="variante-precios-lista">${preciosPorListaVarianteHtml(v)}</td>
      <td data-label="Stock" class="align-right mono">${numero(v.stock)}</td>
      <td data-label="Activa"><label class="form-check"><input type="checkbox" class="variante-activa" ${v.activo ? "checked" : ""} /></label></td>
      <td data-label=""><button type="button" class="btn btn-secundario btn-guardar-variante">Guardar</button></td>
    </tr>`
    )
    .join("");

  body.querySelectorAll(".btn-guardar-variante").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const fila = btn.closest("tr");
      const varianteId = fila.dataset.varianteId;
      const sku = fila.querySelector(".variante-sku").value.trim();
      const precio = fila.querySelector(".variante-precio").value;
      const activo = fila.querySelector(".variante-activa").checked;
      // Igual que en Productos: un input vacío significa "sin precio propio
      // en esa lista", no se manda — así no se pisa un precio existente con
      // 0 por accidente.
      const precios = {};
      fila.querySelectorAll(".variante-precio-lista").forEach((input) => {
        if (input.value !== "") precios[input.dataset.listaId] = Number(input.value);
      });
      const body = { sku: sku || null, precio_venta: precio === "" ? null : Number(precio), activo };
      if (Object.keys(precios).length > 0) body.precios = precios;
      await api(`/api/productos/${variantesProductoId}/variantes/${varianteId}`, {
        method: "PATCH",
        body: body,
        error: "No se pudo guardar la variante."
      });
      await refrescar([cargarVariantesModal(), cargarProductos()]);
      if (productoFichaId === variantesProductoId) await abrirFichaProducto(productoFichaId);
      avisar("Variante actualizada.", "ok");
    });
  });
}

document.getElementById("btnVariantesProducto").addEventListener("click", async () => {
  variantesProductoId = productoFichaId;
  const producto = productos.find((p) => p.id === productoFichaId);
  document.getElementById("modalVariantesProductoTitulo").textContent = `Variantes de "${producto?.nombre ?? ""}"`;
  await refrescar([cargarVariantesModal()]);
  modalVariantesProducto.hidden = false;
});
document.getElementById("modalVariantesProductoClose").addEventListener("click", () => {
  modalVariantesProducto.hidden = true;
});
modalVariantesProducto.addEventListener("click", (e) => {
  if (e.target === modalVariantesProducto) modalVariantesProducto.hidden = true;
});

document.getElementById("formAtributoProducto").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  await api(`/api/productos/${variantesProductoId}/atributos`, {
    method: "POST",
    body: { nombre: form.nombre.value },
    error: "No se pudo agregar el atributo."
  });
  form.reset();
  await refrescar([cargarVariantesModal()]);
});

// Arma el producto cartesiano de los valores actuales de cada atributo y
// crea (en bulk, un POST por combinación) las que todavía no existen como
// variante activa. Se compara por el texto de la combinación en vez de
// volver a resolver producto_variante_valores acá: ya viene armado en el
// mismo orden de atributos en `combinacion` (ver server.js).
document.getElementById("btnGenerarVariantes").addEventListener("click", async () => {
  if (variantesAtributosCache.length === 0) {
    avisar("Agregá al menos un atributo primero.", "error");
    return;
  }
  if (variantesAtributosCache.some((a) => a.valores.length === 0)) {
    avisar("Todos los atributos necesitan al menos un valor para generar variantes.", "error");
    return;
  }

  let combinaciones = [[]];
  for (const atributo of variantesAtributosCache) {
    const nuevas = [];
    for (const combo of combinaciones) {
      for (const valor of atributo.valores) {
        nuevas.push([...combo, { atributo_id: atributo.id, valor_id: valor.id }]);
      }
    }
    combinaciones = nuevas;
  }

  const existentes = new Set(variantesCache.filter((v) => v.activo).map((v) => v.combinacion));
  let creadas = 0;
  let fallidas = 0;
  for (const combo of combinaciones) {
    const texto = combo
      .map(({ atributo_id, valor_id }) => {
        const atributo = variantesAtributosCache.find((a) => a.id === atributo_id);
        const valor = atributo.valores.find((v) => v.id === valor_id);
        return `${atributo.nombre}: ${valor.valor}`;
      })
      .join(" / ");
    if (existentes.has(texto)) continue;
    // Sin api(): las fallas se cuentan y se avisan juntas al final, no una
    // por combinación. Un corte de red cuenta como falla.
    const res = await fetch(`/api/productos/${variantesProductoId}/variantes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valores: combo })
    }).catch(() => null);
    if (res?.ok) creadas++;
    else fallidas++;
  }

  await refrescar([cargarVariantesModal(), cargarProductos()]);
  if (productoFichaId === variantesProductoId) await abrirFichaProducto(productoFichaId);
  avisar(
    fallidas > 0
      ? `${creadas} variante(s) creada(s), ${fallidas} no se pudieron crear.`
      : creadas > 0
      ? `${creadas} variante(s) nueva(s) creada(s).`
      : "No había combinaciones nuevas para crear.",
    fallidas > 0 ? "error" : "ok"
  );
});

/* ---------- Categorías de productos ---------- */
//
// Calcado de categorías de gasto (dominios/gastos.js): mismo patrón de
// formulario + tabla editable, sin campo Tipo. La baja es lógica (activa = 0)
// desde el mismo PATCH que edita, nunca DELETE — un producto con esa
// categoría no puede quedar apuntando a una fila borrada.
//
// Los cuatro catálogos de abajo (este, listas, depósitos y categorías de
// gasto) son páginas de Configuración (hist. §73): su botón en cada pantalla
// lleva ahí, y la página los pinta con invocar("pintar:<catálogo>").

function renderCategoriasProductos() {
  const body = document.getElementById("categoriasProductosBody");
  if (categorias.length === 0) {
    body.innerHTML = filaVacia(2, "Todavía no hay categorías.");
    return;
  }

  body.innerHTML = categorias
    .map(
      (c) => `
    <tr class="${c.activa ? "" : "fila-anulada"}">
      <td data-label="Categoría">${esc(c.nombre)}</td>
      <td data-label="">${botonEditarFila("btn-editar-categoria-producto", c.id, "categoría")}</td>
    </tr>`
    )
    .join("");

  body.querySelectorAll(".btn-editar-categoria-producto").forEach((btn) => {
    btn.addEventListener("click", () => {
      const categoria = categorias.find((c) => c.id === Number(btn.dataset.id));
      const form = document.getElementById("formCategoriaProducto");
      form.id.value = categoria.id;
      form.nombre.value = categoria.nombre;
      document.getElementById("formCategoriaProductoSubmit").textContent = "Guardar cambios";
      form.nombre.focus();
    });
  });
}

registrar("pintar:categorias-productos", () => {
  document.getElementById("formCategoriaProducto").reset();
  document.getElementById("formCategoriaProducto").id.value = "";
  document.getElementById("formCategoriaProductoSubmit").textContent = "Agregar categoría";
  renderCategoriasProductos();
});
document.getElementById("btnCategoriasProductos").addEventListener("click", () => {
  mostrarVista("configuracion", { subruta: "categorias-productos" });
});

document.getElementById("formCategoriaProducto").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const editandoId = form.id.value;

  await api(editandoId ? `/api/categorias/${editandoId}` : "/api/categorias", {
    method: editandoId ? "PATCH" : "POST",
    body: { nombre: form.nombre.value, activa: 1 },
    error: "No se pudo guardar la categoría."
  });

  const eraEdicion = Boolean(editandoId);
  // Una categoría nueva o renombrada cambia el select del formulario de
  // producto y el agrupamiento de "Ventas por categoría".
  await refrescar([cargarProductos(), cargarPanelResumen()]);
  renderCategoriasProductos();
  form.reset();
  form.id.value = "";
  document.getElementById("formCategoriaProductoSubmit").textContent = "Agregar categoría";
  avisar(eraEdicion ? "Categoría actualizada." : "Categoría creada.", "ok");
});

/* ---------- Listas de precios (CLAUDE.md §18) ---------- */
//
// Calcado de categorías de productos de arriba: mismo patrón de formulario +
// tabla editable. Columna propia "Predeterminada": un botón "Marcar" por cada
// lista que no lo es, en vez de un radio — evita mandar un PATCH por cada
// fila al cambiar la predeterminada.

function renderListasPrecios() {
  const body = document.getElementById("listasPreciosBody");
  if (listasPrecios.length === 0) {
    body.innerHTML = filaVacia(3, "Todavía no hay listas de precios.");
    return;
  }

  body.innerHTML = listasPrecios
    .map(
      (l) => `
    <tr class="${l.activa ? "" : "fila-anulada"}">
      <td data-label="Lista">${esc(l.nombre)}</td>
      <td data-label="Predeterminada">${
        l.es_predeterminada
          ? `<span class="status status-info">Predeterminada</span>`
          : `<button type="button" class="btn-link btn-marcar-predeterminada" data-id="${l.id}">Marcar</button>`
      }</td>
      <td data-label="">${botonEditarFila("btn-editar-lista-precio", l.id, "lista de precios")}</td>
    </tr>`
    )
    .join("");

  body.querySelectorAll(".btn-editar-lista-precio").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lista = listasPrecios.find((l) => l.id === Number(btn.dataset.id));
      const form = document.getElementById("formListaPrecio");
      form.id.value = lista.id;
      form.nombre.value = lista.nombre;
      document.getElementById("formListaPrecioSubmit").textContent = "Guardar cambios";
      form.nombre.focus();
    });
  });

  body.querySelectorAll(".btn-marcar-predeterminada").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const lista = listasPrecios.find((l) => l.id === Number(btn.dataset.id));
      await api(`/api/listas-precios/${lista.id}`, {
        method: "PATCH",
        body: { nombre: lista.nombre, activa: true, es_predeterminada: true },
        error: "No se pudo marcar la lista como predeterminada."
      });
      await refrescar([cargarProductos()]);
      renderListasPrecios();
      avisar(`"${lista.nombre}" es ahora la lista predeterminada.`, "ok");
    });
  });
}

registrar("pintar:listas-precios", () => {
  document.getElementById("formListaPrecio").reset();
  document.getElementById("formListaPrecio").id.value = "";
  document.getElementById("formListaPrecioSubmit").textContent = "Agregar lista";
  renderListasPrecios();
});
document.getElementById("btnListasPrecios").addEventListener("click", () => {
  mostrarVista("configuracion", { subruta: "listas-precios" });
});

document.getElementById("formListaPrecio").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const editandoId = form.id.value;

  await api(editandoId ? `/api/listas-precios/${editandoId}` : "/api/listas-precios", {
    method: editandoId ? "PATCH" : "POST",
    body: { nombre: form.nombre.value },
    error: "No se pudo guardar la lista de precios."
  });

  const eraEdicion = Boolean(editandoId);
  // Una lista nueva o renombrada cambia el select del modal de producto y
  // los de Venta/Presupuesto.
  await refrescar([cargarProductos()]);
  renderListasPrecios();
  form.reset();
  form.id.value = "";
  document.getElementById("formListaPrecioSubmit").textContent = "Agregar lista";
  avisar(eraEdicion ? "Lista de precios actualizada." : "Lista de precios creada.", "ok");
});

/* ---------- Depósitos (CLAUDE.md §5/§19) ---------- */
//
// Calcado de listas de precios de arriba: mismo patrón de formulario + tabla
// editable + "exactamente uno predeterminado" con botón "Marcar" en vez de
// radio.

function renderDepositos() {
  const body = document.getElementById("depositosBody");
  if (depositos.length === 0) {
    body.innerHTML = filaVacia(3, "Todavía no hay depósitos.");
    return;
  }

  body.innerHTML = depositos
    .map(
      (d) => `
    <tr class="${d.activo ? "" : "fila-anulada"}">
      <td data-label="Depósito">${esc(d.nombre)}</td>
      <td data-label="Predeterminado">${
        d.es_predeterminado
          ? `<span class="status status-info">Predeterminado</span>`
          : `<button type="button" class="btn-link btn-marcar-deposito-predeterminado" data-id="${d.id}">Marcar</button>`
      }</td>
      <td data-label="">${botonEditarFila("btn-editar-deposito", d.id, "depósito")}</td>
    </tr>`
    )
    .join("");

  body.querySelectorAll(".btn-editar-deposito").forEach((btn) => {
    btn.addEventListener("click", () => {
      const deposito = depositos.find((d) => d.id === Number(btn.dataset.id));
      const form = document.getElementById("formDeposito");
      form.id.value = deposito.id;
      form.nombre.value = deposito.nombre;
      form.direccion.value = deposito.direccion ?? "";
      document.getElementById("formDepositoSubmit").textContent = "Guardar cambios";
      form.nombre.focus();
    });
  });

  body.querySelectorAll(".btn-marcar-deposito-predeterminado").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const deposito = depositos.find((d) => d.id === Number(btn.dataset.id));
      await api(`/api/depositos/${deposito.id}`, {
        method: "PATCH",
        body: { nombre: deposito.nombre, direccion: deposito.direccion, activo: true, es_predeterminado: true },
        error: "No se pudo marcar el depósito como predeterminado."
      });
      await refrescar([cargarProductos()]);
      renderDepositos();
      avisar(`"${deposito.nombre}" es ahora el depósito predeterminado.`, "ok");
    });
  });
}

registrar("pintar:depositos", () => {
  document.getElementById("formDeposito").reset();
  document.getElementById("formDeposito").id.value = "";
  document.getElementById("formDepositoSubmit").textContent = "Agregar depósito";
  renderDepositos();
});
document.getElementById("btnDepositos").addEventListener("click", () => {
  mostrarVista("configuracion", { subruta: "depositos" });
});

document.getElementById("formDeposito").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const editandoId = form.id.value;

  await api(editandoId ? `/api/depositos/${editandoId}` : "/api/depositos", {
    method: editandoId ? "PATCH" : "POST",
    body: { nombre: form.nombre.value, direccion: form.direccion.value || null },
    error: "No se pudo guardar el depósito."
  });

  const eraEdicion = Boolean(editandoId);
  // Un depósito nuevo o renombrado cambia los selects de Venta, Compra,
  // Ajuste de stock y Transferencia.
  await refrescar([cargarProductos(), cargarStock()]);
  renderDepositos();
  form.reset();
  form.id.value = "";
  document.getElementById("formDepositoSubmit").textContent = "Agregar depósito";
  avisar(eraEdicion ? "Depósito actualizado." : "Depósito creado.", "ok");
});

/* ---------- Stock ---------- */

// El "alto" comparte color con el pendiente (naranja): no es un error,
// pero es plata inmovilizada de más y conviene que salte a la vista.
const STOCK_CLASE = {
  sin_stock: "status-vencido",
  bajo: "status-vencido",
  normal: "status-cobrado",
  // Por encima del máximo no es urgente: conviene mirarlo (naranja).
  alto: "status-aviso"
};
const STOCK_LABEL = {
  sin_stock: "Sin stock",
  bajo: "Stock bajo",
  normal: "Normal",
  alto: "Stock alto"
};

// idDe custom (CLAUDE.md §19): /api/stock ahora trae una fila por producto
// Y depósito, así que producto_id solo ya no identifica una fila única —
// el comentario que estaba acá antes de esta etapa ya anticipaba
// exactamente este cambio.
const selStock = crearSeleccion("stockBody", { idDe: (p) => `${p.producto_id}-${p.deposito_id}` });

function renderStock(lista) {
  const body = document.getElementById("stockBody");
  body.innerHTML = "";
  selStock.sincronizar(lista);

  if (lista.length === 0) {
    if (filtrosStock.filtros.length > 0) {
      body.innerHTML = filaVaciaFiltrada(selStock.colspan(7));
      body.querySelector(".tabla-vacia-limpiar").addEventListener("click", () => filtrosStock.limpiar());
    } else {
      body.innerHTML = filaVacia(selStock.colspan(7), "Todavía no hay productos con stock.", { accionTexto: "+ Nuevo producto", accionId: "btnNuevoProducto" });
    }
    return;
  }

  for (const p of lista) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      ${selStock.celda(`${p.producto_id}-${p.deposito_id}`)}
      <td data-label="Producto">${esc(p.nombre)}</td>
      <td data-label="Depósito">${esc(p.deposito ?? "—")}</td>
      <td data-label="Costo" class="align-right mono col-admin">${money(p.precio_costo)}</td>
      <td data-label="Stock en depósito" class="align-right mono">${esc(cantidad(p.stock, p.unidad))}</td>
      <td data-label="Stock total" class="align-right mono">${esc(cantidad(p.stock_total, p.unidad))}</td>
      <td data-label="Estado"><span class="status ${STOCK_CLASE[p.estado_stock]}">${
        STOCK_LABEL[p.estado_stock]
      }</span></td>
      <td data-label=""><button type="button" class="btn-fila btn-ajustar-stock" data-producto="${p.producto_id}" data-deposito="${p.deposito_id ?? ""}">Ajustar</button></td>
    `;
    body.appendChild(tr);
  }

  body.querySelectorAll(".btn-ajustar-stock").forEach((btn) => {
    btn.addEventListener("click", () =>
      abrirModalAjusteStock(Number(btn.dataset.producto), btn.dataset.deposito || null)
    );
  });
}

// Historial general de movimientos, de todos los productos juntos. Viaja
// pegado a cargarStock() (mismo fetch inicial que dispara todo lo demás)
// para no tener que acordarse de refrescarlo aparte en cada lugar que
// toca stock.
function renderMovimientosStock(movimientos) {
  const body = document.getElementById("stockMovimientosBody");
  if (movimientos.length === 0) {
    if (filtrosStockMov.filtros.length > 0) {
      body.innerHTML = filaVaciaFiltrada(6);
      body.querySelector(".tabla-vacia-limpiar").addEventListener("click", () => filtrosStockMov.limpiar());
    } else {
      body.innerHTML = filaVacia(6, "Todavía no hay movimientos de stock.");
    }
    return;
  }
  body.innerHTML = movimientos
    .map((m) => {
      const origen =
        m.origen === "venta"
          ? `Venta #${m.venta_id}`
          : m.origen === "compra"
          ? `Compra #${m.compra_id}`
          : m.origen === "devolucion"
          ? `Devolución #${m.devolucion_id}`
          : m.origen === "devolucion_proveedor"
          ? `Devolución a proveedor #${m.devolucion_proveedor_id}`
          : m.origen === "transferencia"
          ? `Transferencia #${m.transferencia_id}`
          : "Ajuste manual";
      const signo = m.tipo === "salida" ? "-" : m.tipo === "entrada" ? "+" : m.cantidad >= 0 ? "+" : "-";
      return `
    <tr>
      <td data-label="Fecha">${esc(fechaAR(m.fecha))}</td>
      <td data-label="Producto">${esc(m.producto)}</td>
      <td data-label="Depósito">${esc(m.deposito ?? "—")}</td>
      <td data-label="Origen">${origen}</td>
      <td data-label="Cantidad" class="align-right mono">${signo}${numero(Math.abs(m.cantidad))}</td>
      <td data-label="Nota">${esc(m.nota || "—")}</td>
    </tr>`;
    })
    .join("");
}

let stockCache = [];

// El listado de stock se filtra en memoria (está entero acá), pero el
// historial de movimientos va al servidor: tiene tope de filas, así que
// filtrarlo acá mentiría en cuanto se pida un rango de fechas viejo.
function filtrarStock() {
  const texto = document.getElementById("stockSearch").value.trim().toLowerCase();
  const porTexto = stockCache.filter((p) => p.nombre.toLowerCase().includes(texto));
  renderStock(filtrosStock.aplicar(porTexto));
}

// Stock combina el motor de filtros CON su propio <input type="search">: el
// CSV tiene que respetar los dos, o exportaría filas que la tabla esconde.
function listaStockVisible() {
  const texto = document.getElementById("stockSearch").value.trim().toLowerCase();
  const porTexto = stockCache.filter((p) => p.nombre.toLowerCase().includes(texto));
  return filtrosStock.aplicar(porTexto);
}

// /api/stock no devuelve sku (es la vista de existencias, no el catálogo).
// "Valorizado" y "Estado" siguen siendo del TOTAL del producto (CLAUDE.md
// §5: el mínimo/máximo es global, no por depósito), no de esta fila puntual.
const COLUMNAS_CSV_STOCK = [
  { titulo: "Producto", valor: (p) => p.nombre },
  { titulo: "Depósito", valor: (p) => p.deposito ?? "" },
  { titulo: "Costo", valor: (p) => p.precio_costo, admin: true },
  { titulo: "Stock en depósito", valor: (p) => p.stock },
  { titulo: "Stock total", valor: (p) => p.stock_total },
  { titulo: "Stock mínimo", valor: (p) => p.stock_minimo },
  { titulo: "Stock máximo", valor: (p) => p.stock_maximo },
  { titulo: "Valorizado", valor: (p) => p.valorizado, admin: true },
  { titulo: "Estado", valor: (p) => STOCK_LABEL[p.estado_stock] ?? p.estado_stock }
];

document.getElementById("btnExportarStock").addEventListener("click", () => {
  descargarCSV("nexo-stock", columnasVisibles(COLUMNAS_CSV_STOCK), listaStockVisible());
});

montarBarraSeleccion(selStock, [
  {
    etiqueta: "Exportar CSV",
    onClick: (ids) => {
      // ids acá son las claves compuestas "producto_id-deposito_id" (ver el
      // idDe de selStock, más arriba).
      const idsSet = new Set(ids);
      descargarCSV(
        "nexo-stock-seleccion",
        columnasVisibles(COLUMNAS_CSV_STOCK),
        listaStockVisible().filter((p) => idsSet.has(`${p.producto_id}-${p.deposito_id}`))
      );
    }
  }
]);

const filtrosStock = crearFiltros(
  "filtrosStock",
  [
    { clave: "nombre", etiqueta: "Producto", tipo: "texto" },
    { clave: "deposito_id", etiqueta: "Depósito", tipo: "select", opciones: [] },
    { clave: "estado_stock", etiqueta: "Estado", tipo: "select", opciones: OPCIONES_ESTADO_STOCK },
    { clave: "stock", etiqueta: "Stock en depósito", tipo: "numero" },
    { clave: "stock_minimo", etiqueta: "Stock mínimo", tipo: "numero" },
    { clave: "precio_costo", etiqueta: "Costo", tipo: "numero" },
    { clave: "valorizado", etiqueta: "Valorizado", tipo: "numero" }
  ],
  filtrarStock
);
const filtrosStockMov = crearFiltros(
  "filtrosStockMov",
  [
    { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
    { clave: "producto_id", etiqueta: "Producto", tipo: "select", opciones: [] },
    { clave: "deposito_id", etiqueta: "Depósito", tipo: "select", opciones: [] },
    {
      clave: "origen",
      etiqueta: "Origen",
      tipo: "select",
      opciones: [
        { valor: "venta", texto: "Venta" },
        { valor: "compra", texto: "Compra" },
        { valor: "devolucion", texto: "Devolución" },
        { valor: "devolucion_proveedor", texto: "Devolución a proveedor" },
        { valor: "transferencia", texto: "Transferencia" },
        { valor: "ajuste_manual", texto: "Ajuste manual" }
      ]
    },
    { clave: "cantidad", etiqueta: "Cantidad", tipo: "numero" },
    { clave: "nota", etiqueta: "Nota", tipo: "texto" }
  ],
  () => renderMovimientosStock(filtrosStockMov.aplicar(movimientosStockCache))
);

// El historial llega entero y se filtra acá, con el mismo motor que el
// resto (ver el comentario de TOPE_MOVIMIENTOS en el backend).
let movimientosStockCache = [];

async function cargarMovimientosStock() {
  tablaCargando("stockMovimientosBody", 5);
  movimientosStockCache = await api("/api/movimientos-stock");
  renderMovimientosStock(filtrosStockMov.aplicar(movimientosStockCache));
}

async function cargarStock() {
  tablaCargando("stockBody", selStock.colspan(7));
  stockCache = await api("/api/stock");
  const opcionesDeposito = depositos
    .filter((d) => d.activo)
    .map((d) => ({ valor: String(d.id), texto: d.nombre }));
  filtrosStock.setOpciones("deposito_id", opcionesDeposito);
  filtrosStockMov.setOpciones(
    "producto_id",
    // Un producto por fila (no por producto+depósito): stockCache trae una
    // fila por depósito, así que se deduplica por producto_id.
    [...new Map(stockCache.map((p) => [p.producto_id, p])).values()].map((p) => ({
      valor: p.producto_id,
      texto: p.nombre
    }))
  );
  filtrosStockMov.setOpciones("deposito_id", opcionesDeposito);
  filtrarStock();
  await refrescar([cargarMovimientosStock(), cargarTransferencias()]);
}

document.getElementById("stockSearch").addEventListener("input", filtrarStock);

const modalAjusteStock = document.getElementById("modalAjusteStock");

function poblarSelectProductos(select) {
  select.innerHTML =
    '<option value="">Producto…</option>' +
    productos.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join("");
}

function abrirModalAjusteStock(productoIdPreseleccionado = null, depositoIdPreseleccionado = null) {
  const select = document.querySelector('#formAjusteStock select[name="producto_id"]');
  poblarSelectProductos(select);
  if (productoIdPreseleccionado) select.value = productoIdPreseleccionado;
  poblarSelectDepositos('#formAjusteStock [name="deposito_id"]');
  if (depositoIdPreseleccionado) {
    document.querySelector('#formAjusteStock [name="deposito_id"]').value = depositoIdPreseleccionado;
  }
  modalAjusteStock.hidden = false;
}

document.getElementById("btnAjusteStock").addEventListener("click", () => abrirModalAjusteStock());
document.getElementById("modalAjusteStockClose").addEventListener("click", () => {
  modalAjusteStock.hidden = true;
});
modalAjusteStock.addEventListener("click", (e) => {
  if (e.target === modalAjusteStock) modalAjusteStock.hidden = true;
});

document.getElementById("formAjusteStock").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  await api("/api/stock/ajuste", {
    method: "POST",
    body: {
      producto_id: Number(form.producto_id.value),
      deposito_id: Number(form.deposito_id.value),
      cantidad: parseFloat(form.cantidad.value),
      nota: form.nota.value || null
    },
    error: "No se pudo registrar el ajuste."
  });

  await refrescar([cargarStock(), cargarProductos(), cargarReporteStock()]);
  form.reset();
  modalAjusteStock.hidden = true;
  avisar("Stock ajustado.", "ok");
});

/* ---------- Transferencias entre depósitos (CLAUDE.md §19) ---------- */

let transferenciasCache = [];

function renderTransferencias(lista) {
  const body = document.getElementById("transferenciasBody");
  if (lista.length === 0) {
    body.innerHTML = filaVacia(7, "Todavía no hay transferencias entre depósitos.");
    return;
  }
  body.innerHTML = lista
    .map(
      (t) => `
    <tr class="${t.estado === "anulada" ? "fila-anulada" : ""}">
      <td data-label="Fecha">${esc(fechaAR(t.fecha))}</td>
      <td data-label="Producto">${esc(t.producto)}</td>
      <td data-label="Desde">${esc(t.deposito_origen)}</td>
      <td data-label="Hacia">${esc(t.deposito_destino)}</td>
      <td data-label="Cantidad" class="align-right mono">${numero(t.cantidad)}</td>
      <td data-label="Estado"><span class="status ${t.estado === "anulada" ? "status-vencido" : "status-cobrado"}">${
        t.estado === "anulada" ? "Anulada" : "Activa"
      }</span></td>
      <td data-label="">${
        t.estado === "activa" && esAdmin()
          ? `<button type="button" class="btn-fila btn-anular-transferencia" data-id="${t.id}">Anular</button>`
          : ""
      }</td>
    </tr>`
    )
    .join("");

  body.querySelectorAll(".btn-anular-transferencia").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ok = await confirmar({
        titulo: "Anular transferencia",
        cuerpo: "El stock vuelve al depósito de origen.",
        aceptar: "Anular",
        destructivo: true
      });
      if (!ok) return;
      await api(`/api/transferencias/${btn.dataset.id}/anular`, {
        method: "POST",
        error: "No se pudo anular la transferencia."
      });
      await refrescar([cargarStock()]);
      avisar("Transferencia anulada.", "ok");
    });
  });
}

async function cargarTransferencias() {
  transferenciasCache = await api("/api/transferencias");
  renderTransferencias(transferenciasCache);
}

const modalTransferenciaDeposito = document.getElementById("modalTransferenciaDeposito");

document.getElementById("btnTransferirStock").addEventListener("click", () => {
  const form = document.getElementById("formTransferenciaDeposito");
  form.reset();
  poblarSelectProductos(form.producto_id);
  poblarSelectDepositos("#transferenciaDepositoOrigen");
  poblarSelectDepositos("#transferenciaDepositoDestino");
  modalTransferenciaDeposito.hidden = false;
});
document.getElementById("modalTransferenciaDepositoClose").addEventListener("click", () => {
  modalTransferenciaDeposito.hidden = true;
});
modalTransferenciaDeposito.addEventListener("click", (e) => {
  if (e.target === modalTransferenciaDeposito) modalTransferenciaDeposito.hidden = true;
});

document.getElementById("formTransferenciaDeposito").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  await api("/api/transferencias", {
    method: "POST",
    body: {
      producto_id: Number(form.producto_id.value),
      deposito_origen_id: Number(form.deposito_origen_id.value),
      deposito_destino_id: Number(form.deposito_destino_id.value),
      cantidad: parseFloat(form.cantidad.value),
      nota: form.nota.value || null
    },
    error: "No se pudo registrar la transferencia."
  });

  await refrescar([cargarStock()]);
  form.reset();
  modalTransferenciaDeposito.hidden = true;
  avisar("Transferencia registrada.", "ok");
});


/* ---------- Presupuestos ---------- */

// Un presupuesto es una oferta, no una operación: no descuenta stock ni
// genera deuda. Todo eso pasa recién al convertirlo en venta.
let presupuestos = [];
let presupuestoEditandoId = null;
// La consulta de la que sale un presupuesto nuevo (hist. §90): queda vinculada.
let presupuestoDeConsulta = null;

const PRESUPUESTO_LABEL = {
  borrador: "Borrador",
  enviado: "Enviado",
  aceptado: "Aceptado",
  rechazado: "Rechazado",
  vencido: "Vencido",
  convertido: "Convertido"
};

// Borrador va en gris y enviado en azul (está en curso, esperando al
// cliente): ninguno pide nada todavía, y en rojo se leían como un problema.
const PRESUPUESTO_CLASE = {
  borrador: "",
  enviado: "status-info",
  aceptado: "status-cobrado",
  rechazado: "status-vencido",
  vencido: "status-vencido",
  convertido: "status-cobrado"
};

// Declarada arriba de renderPresupuestos: cargarPresupuestos() (más abajo)
// llama tablaCargando() antes del await, y esa llamada ya necesita
// selPresupuestos.colspan() — mismo criterio que selFacturas.
const selPresupuestos = crearSeleccion("presupuestosBody");
montarBarraSeleccion(selPresupuestos, [
  { etiqueta: "Imprimir", onClick: (ids) => imprimirPresupuestosSeleccionados(ids) },
  { etiqueta: "Descargar PDF", onClick: (ids, btn) => descargarPDFPresupuestosSeleccionados(ids, btn) },
  { etiqueta: "Exportar CSV", onClick: (ids) => exportarPresupuestosSeleccionados(ids) }
]);

// Mismo criterio que imprimirFacturasSeleccionadas: GET /api/presupuestos
// tampoco trae items, hace falta el detalle de cada uno.
async function imprimirPresupuestosSeleccionados(ids) {
  if (ids.length > LIMITE_LOTE) {
    avisar(`Seleccioná menos de ${LIMITE_LOTE} presupuestos.`, "atencion");
    return;
  }
  if (
    ids.length > CONFIRMAR_LOTE_DESDE &&
    !(await confirmar({
      titulo: "Imprimir en lote",
      cuerpo: `Se va a abrir el diálogo de impresión con ${ids.length} páginas, una por presupuesto. ¿Continuar?`,
      aceptar: "Imprimir"
    }))
  )
    return;

  const presupuestosDetalle = await traerConcurrencia(ids, (id) => api(`/api/presupuestos/${id}`));
  imprimirHojas(presupuestosDetalle.map(hojaDePresupuesto));
}

async function descargarPDFPresupuestosSeleccionados(ids, btn) {
  if (ids.length > LIMITE_LOTE) {
    avisar(`Seleccioná menos de ${LIMITE_LOTE} presupuestos.`, "atencion");
    return;
  }
  if (
    ids.length > CONFIRMAR_LOTE_DESDE &&
    !(await confirmar({
      titulo: "Descargar PDF en lote",
      cuerpo: `Se van a generar ${ids.length} archivos PDF, uno por presupuesto. Puede tardar varios minutos y el navegador va a pedirte permiso para descargar varios archivos: aceptalo para que se descarguen todos. ¿Continuar?`,
      aceptar: "Descargar"
    }))
  )
    return;

  const presupuestosDetalle = await traerConcurrencia(ids, (id) => api(`/api/presupuestos/${id}`));
  const items = presupuestosDetalle.map((p) => ({
    html: hojaDePresupuesto(p),
    nombreArchivo: nombreArchivoPdf("presupuesto", p.id)
  }));
  await descargarPDFsEnLote(items, btn);
}

function renderPresupuestos(lista) {
  const body = document.getElementById("presupuestosBody");
  selPresupuestos.sincronizar(lista);

  // Los totales acompañan al filtro, igual que en Ventas y Compras.
  const sumar = (fn) => lista.filter(fn).reduce((acc, p) => acc + p.total, 0);
  document.getElementById("presupuestadoStrip").textContent = money(
    lista.reduce((acc, p) => acc + p.total, 0)
  );
  document.getElementById("presupuestoAceptadoStrip").textContent = money(
    sumar((p) => p.estado_efectivo === "aceptado")
  );
  document.getElementById("presupuestoConvertidoStrip").textContent = money(
    sumar((p) => p.estado_efectivo === "convertido")
  );

  if (lista.length === 0) {
    if (filtrosPresupuestos.filtros.length > 0) {
      body.innerHTML = filaVaciaFiltrada(selPresupuestos.colspan(8));
      body.querySelector(".tabla-vacia-limpiar").addEventListener("click", () => filtrosPresupuestos.limpiar());
    } else {
      body.innerHTML = filaVacia(selPresupuestos.colspan(8), "Todavía no hay presupuestos cargados.", { accionTexto: "+ Nuevo presupuesto", accionId: "btnNuevoPresupuesto" });
    }
    return;
  }

  body.innerHTML = lista
    .map(
      (p) => `
    <tr class="fila-clickeable" data-id="${p.id}">
      ${selPresupuestos.celda(p.id)}
      <td data-label="N°" class="mono">#${p.id}</td>
      <td data-label="Cliente">${esc(p.cliente)}</td>
      <td data-label="Productos" class="celda-wrap">${esc(p.items_resumen || "—")}</td>
      <td data-label="Fecha">${esc(fechaAR(p.fecha))}</td>
      <td data-label="Vence">${esc(fechaAR(p.vencimiento) || "—")}</td>
      <td data-label="Total" class="align-right mono">${money(p.total)}</td>
      <td data-label="Estado"><span class="status ${PRESUPUESTO_CLASE[p.estado_efectivo]}">${
        PRESUPUESTO_LABEL[p.estado_efectivo]
      }</span></td>
      <td data-label="">${
        p.estado === "convertido"
          ? `<button type="button" class="btn-link btn-ver-venta-presu" data-venta="${p.venta_id}">Venta #${p.venta_id}</button>`
          : botonEditarFila("btn-editar-presupuesto", p.id, "presupuesto")
      }</td>
    </tr>`
    )
    .join("");

  body.querySelectorAll("tr[data-id]").forEach((tr) => {
    tr.addEventListener("click", (e) => {
      if (e.target.closest("button, a, input, label, select, textarea, .col-sel")) return;
      abrirFichaPresupuesto(Number(tr.dataset.id));
    });
  });

  body.querySelectorAll(".btn-editar-presupuesto").forEach((btn) => {
    btn.addEventListener("click", async () => {
      abrirModalPresupuesto(await api(`/api/presupuestos/${btn.dataset.id}`, { error: "No se pudo cargar el presupuesto." }));
    });
  });

  body.querySelectorAll(".btn-ver-venta-presu").forEach((btn) => {
    btn.addEventListener("click", () => abrirFichaVenta(Number(btn.dataset.venta)));
  });
}

function filtrarPresupuestos() {
  renderPresupuestos(filtrosPresupuestos.aplicar(presupuestos));
}

const filtrosPresupuestos = crearFiltros(
  "filtrosPresupuestos",
  [
    { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
    { clave: "vencimiento", etiqueta: "Vencimiento", tipo: "fecha" },
    { clave: "cliente", etiqueta: "Cliente", tipo: "texto" },
    { clave: "items_resumen", etiqueta: "Productos", tipo: "texto" },
    {
      clave: "estado_efectivo",
      etiqueta: "Estado",
      tipo: "select",
      opciones: [
        { valor: "borrador", texto: "Borrador" },
        { valor: "enviado", texto: "Enviado" },
        { valor: "aceptado", texto: "Aceptado" },
        { valor: "rechazado", texto: "Rechazado" },
        { valor: "vencido", texto: "Vencido" },
        { valor: "convertido", texto: "Convertido" }
      ]
    },
    { clave: "total", etiqueta: "Total", tipo: "numero" },
    { clave: "notas", etiqueta: "Notas", tipo: "texto" }
  ],
  filtrarPresupuestos
);

// Mismas columnas de datos que muestra la tabla. Números crudos (nunca
// money()) — ver el comentario junto a descargarCSV.
const COLUMNAS_CSV_PRESUPUESTOS = [
  { titulo: "N°", valor: (p) => p.id },
  { titulo: "Cliente", valor: (p) => p.cliente },
  { titulo: "Productos", valor: (p) => p.items_resumen },
  { titulo: "Fecha", valor: (p) => p.fecha },
  { titulo: "Vence", valor: (p) => p.vencimiento },
  { titulo: "Total", valor: (p) => p.total },
  { titulo: "Estado", valor: (p) => PRESUPUESTO_LABEL[p.estado_efectivo] ?? p.estado_efectivo }
];

function exportarPresupuestosSeleccionados(ids) {
  const idsSet = new Set(ids);
  const seleccion = filtrosPresupuestos
    .aplicar(presupuestos)
    .filter((p) => idsSet.has(p.id));
  descargarCSV("nexo-presupuestos-seleccion", COLUMNAS_CSV_PRESUPUESTOS, seleccion);
}

async function cargarPresupuestos() {
  tablaCargando("presupuestosBody", selPresupuestos.colspan(8));
  presupuestos = await api("/api/presupuestos");
  filtrarPresupuestos();
}

/* --- Ficha --- */

// Arma el HTML de una hoja de presupuesto. Extraída del botón de abajo
// (dentro de abrirFichaPresupuesto) para reusarla también en la
// impresión/descarga en lote desde el listado — ver crearSeleccion.
function hojaDePresupuesto(p) {
  return armarHojaComprobante({
    rotulo: "Presupuesto",
    comprobanteNro: `N° ${p.id}`,
    fecha: p.fecha,
    // El estado (borrador/enviado/aceptado) NO va: es gestión interna y no
    // le dice nada a quien recibe el papel.
    campos: [["Válido hasta:", fechaAR(p.vencimiento)]],
    cliente: {
      nombre: p.cliente,
      documento: p.cliente_documento,
      direccion: p.cliente_direccion,
      telefono: p.cliente_telefono,
      email: p.cliente_email
    },
    items: p.items,
    total: p.total,
    notas: p.notas
  });
}

async function abrirFichaPresupuesto(id) {
  const p = await api(`/api/presupuestos/${id}`, {
    error: "No se pudo cargar el presupuesto."
  });

  document.getElementById("fichaPresupuestoTitulo").textContent = `Presupuesto #${p.id}`;
  document.getElementById("fichaPresupuestoTotal").textContent = money(p.total);

  const campos = [
    ["Cliente", p.cliente],
    ["Fecha", fechaAR(p.fecha)],
    ["Válido hasta", fechaAR(p.vencimiento) || "Sin vencimiento"],
    ["Estado", badge(PRESUPUESTO_CLASE[p.estado_efectivo], PRESUPUESTO_LABEL[p.estado_efectivo])],
    ["Notas", p.notas]
  ];
  document.getElementById("fichaPresupuestoDatos").innerHTML = camposFicha(campos);

  // Las acciones dependen del estado: un presupuesto convertido ya es una
  // venta, así que lo único que ofrece es el link para ir a verla.
  const acciones = document.getElementById("fichaPresupuestoAcciones");
  if (p.estado === "convertido") {
    acciones.innerHTML = `<button type="button" class="btn btn-secundario" id="btnIrAVentaPresu">Ver la venta #${p.venta_id}</button>`;
    acciones.querySelector("#btnIrAVentaPresu").addEventListener("click", () =>
      abrirFichaVenta(p.venta_id)
    );
  } else {
    const botonEstado = (estado, texto, clase = "btn-secundario") =>
      p.estado === estado
        ? ""
        : `<button type="button" class="btn ${clase} btn-estado-presu" data-estado="${estado}">${texto}</button>`;

    // Con un trabajo en marcha (hist. §78), la venta sale al terminarlo: en vez
    // de convertir, se va al trabajo. Sin trabajo y con el módulo prendido, se
    // puede programar uno (no a un rechazado, que primero se reabre).
    const final = p.trabajo_id
      ? `<button type="button" class="btn btn-primary" id="btnVerTrabajoPresu">Ver el trabajo</button>`
      : `${p.estado === "rechazado" ? "" : '<button type="button" class="btn btn-secundario" id="btnProgramarTrabajo" data-modulo="trabajos">Programar trabajo</button>'}
         <button type="button" class="btn btn-primary" id="btnConvertirPresupuesto">Convertir en venta</button>`;
    acciones.innerHTML = `
      <button type="button" class="btn btn-secundario" id="btnEditarPresupuesto">Editar</button>
      ${botonEstado("enviado", "Marcar enviado")}
      ${p.trabajo_id ? "" : botonEstado("aceptado", "Aceptar")}
      ${p.trabajo_id ? "" : botonEstado("rechazado", "Rechazar")}
      ${final}
    `;

    acciones.querySelector("#btnEditarPresupuesto").addEventListener("click", () =>
      abrirModalPresupuesto(p)
    );
    acciones.querySelector("#btnVerTrabajoPresu")?.addEventListener("click", () => invocar("abrirFicha:trabajo", p.trabajo_id));
    acciones.querySelector("#btnProgramarTrabajo")?.addEventListener("click", () => invocar("programar:trabajo", p));

    acciones.querySelectorAll(".btn-estado-presu").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await api(`/api/presupuestos/${p.id}/estado`, {
          method: "PATCH",
          body: { estado: btn.dataset.estado },
          error: "No se pudo cambiar el estado."
        });
        await refrescar([cargarPresupuestos()]);
        await abrirFichaPresupuesto(p.id);
      });
    });

    acciones.querySelector("#btnConvertirPresupuesto")?.addEventListener("click", async () => {
      if (
        !(await confirmar({
          cuerpo: "¿Convertir este presupuesto en venta? Se va a descontar el stock y generar la deuda del cliente.",
          aceptar: "Convertir"
        }))
      )
        return;
      await api(`/api/presupuestos/${p.id}/convertir`, {
        method: "POST",
        error: "No se pudo convertir el presupuesto."
      });
      avisar(`Presupuesto #${p.id} convertido en venta.`, "ok");
      // La conversión mueve stock, cuenta corriente y resultado.
      await refrescar([
        cargarPresupuestos(),
        cargarVentas(),
        cargarStock(),
        cargarProductos(),
        cargarClientes(),
        recargar("cuentasCorrientes"),
        cargarPanelResumen(),
        cargarReporteStock()
      ]);
      await abrirFichaPresupuesto(p.id);
    });
  }

  // Imprimir se agrega DESPUÉS del if/else y con insertAdjacentHTML, no dentro
  // de cada rama: las dos reescriben acciones.innerHTML entero, así que un
  // botón puesto en una sola rama desaparecería en la otra, y ponerlo en el
  // innerHTML de ambas duplicaría el markup. Un presupuesto convertido también
  // se puede imprimir: sigue siendo el papel que se le entregó al cliente.
  acciones.insertAdjacentHTML(
    "beforeend",
    '<button type="button" class="btn btn-secundario" id="btnImprimirPresupuesto">Imprimir / PDF</button>'
  );
  acciones.querySelector("#btnImprimirPresupuesto").addEventListener("click", () => {
    imprimirComprobante(hojaDePresupuesto(p));
  });

  document.getElementById("fichaPresupuestoItems").innerHTML = p.items
    .map(
      (i) => `
    <tr>
      <td data-label="Producto">${esc(i.producto)}</td>
      <td data-label="Cantidad" class="align-right mono">${numero(i.cantidad)}</td>
      <td data-label="Precio unit." class="align-right mono">${money(i.precio_unitario)}</td>
      <td data-label="Subtotal" class="align-right mono">${money(i.subtotal)}</td>
    </tr>`
    )
    .join("");

  mostrarVista("presupuesto-detalle", { titulo: `Presupuesto #${p.id}` });
}

document.getElementById("btnVolverPresupuestos").addEventListener("click", () =>
  mostrarVista("presupuestos")
);

/* --- Modal (alta y edición) --- */

const modalPresupuesto = document.getElementById("modalPresupuesto");
const presupuestoItemsEl = document.getElementById("presupuestoItems");

// Un renglón por cada item ya guardado de un presupuesto o un trabajo, con su
// variante. limitarStock en false: se puede cotizar más de lo que hay en el
// depósito, y el tope se valida al pasar a venta.
async function cargarFilasItems(contenedor, items) {
  for (const item of items) {
    agregarFilaItemVenta(contenedor, productos, false);
    const fila = contenedor.lastElementChild;
    fila.querySelector(".item-producto").value = item.producto;
    fila.querySelector(".item-producto-id").value = item.producto_id;
    fila.querySelector(".item-cantidad").value = item.cantidad;
    fila.querySelector(".item-precio").value = item.precio_unitario;
    ajustarCantidadSegunUnidad(fila.querySelector(".item-cantidad"), productos.find((p) => p.id === item.producto_id));
    if (item.variante_id) {
      const varianteSelect = fila.querySelector(".item-variante-id");
      const variantes = await variantesDeProducto(item.producto_id);
      varianteSelect.innerHTML = variantes
        .filter((v) => v.activo || v.id === item.variante_id)
        .map(
          (v) =>
            `<option value="${v.id}" data-stock="${esc(v.stock)}">${esc(v.combinacion)}${v.sku ? ` — ${esc(v.sku)}` : ""}</option>`
        )
        .join("");
      varianteSelect.value = item.variante_id;
      varianteSelect.hidden = false;
    }
    actualizarSubtotalFila(fila);
  }
}

function actualizarTotalPresupuesto() {
  document.getElementById("presupuestoTotal").textContent = money(totalItems(presupuestoItemsEl));
}
presupuestoItemsEl.addEventListener("item-change", actualizarTotalPresupuesto);

// desde: { cliente, crm_oportunidad_id } cuando sale de una consulta.
async function abrirModalPresupuesto(presupuesto = null, desde = null) {
  presupuestoEditandoId = presupuesto?.id ?? null;
  presupuestoDeConsulta = desde?.crm_oportunidad_id ?? null;
  document.getElementById("modalPresupuestoTitulo").textContent = presupuesto
    ? "Editar presupuesto"
    : "Nuevo presupuesto";
  document.getElementById("formPresupuestoSubmit").textContent = presupuesto
    ? "Guardar cambios"
    : "Guardar presupuesto";

  const form = document.getElementById("formPresupuesto");
  form.cliente.value = presupuesto?.cliente ?? desde?.cliente ?? "";
  form.fecha.value = presupuesto?.fecha ?? hoyISO();
  form.vencimiento.value = presupuesto?.vencimiento ?? "";
  form.notas.value = presupuesto?.notas ?? "";

  poblarSelectListasPrecios("#presupuestoListaPrecio");
  if (presupuesto?.lista_precio_id) {
    form.lista_precio_id.value = presupuesto.lista_precio_id;
  } else if (!presupuesto) {
    const clienteExistente = clientes.find(
      (c) => c.nombre.trim().toLowerCase() === (form.cliente.value || "").trim().toLowerCase()
    );
    if (clienteExistente?.lista_precio_id) form.lista_precio_id.value = clienteExistente.lista_precio_id;
  }

  presupuestoItemsEl.innerHTML = "";
  if (presupuesto) {
    await cargarFilasItems(presupuestoItemsEl, presupuesto.items);
  } else {
    agregarFilaItemVenta(presupuestoItemsEl, productos, false);
  }
  actualizarTotalPresupuesto();
  modalPresupuesto.hidden = false;
}

document.getElementById("btnNuevoPresupuesto").addEventListener("click", () =>
  abrirModalPresupuesto()
);
document.getElementById("btnAgregarItemPresupuesto").addEventListener("click", () => {
  agregarFilaItemVenta(presupuestoItemsEl, productos, false);
});
document.getElementById("modalPresupuestoClose").addEventListener("click", () => {
  modalPresupuesto.hidden = true;
});
modalPresupuesto.addEventListener("click", (e) => {
  if (e.target === modalPresupuesto) modalPresupuesto.hidden = true;
});
document.getElementById("presupuestoListaPrecio").addEventListener("change", () => {
  reproponerPreciosPorLista(presupuestoItemsEl, productos);
});
document.getElementById("formPresupuesto").cliente.addEventListener("change", (e) => {
  const clienteExistente = clientes.find(
    (c) => c.nombre.trim().toLowerCase() === e.target.value.trim().toLowerCase()
  );
  if (clienteExistente?.lista_precio_id && !presupuestoEditandoId) {
    const select = document.getElementById("presupuestoListaPrecio");
    select.value = clienteExistente.lista_precio_id;
    reproponerPreciosPorLista(presupuestoItemsEl, productos);
  }
});

document.getElementById("formPresupuesto").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const items = leerItemsVenta(presupuestoItemsEl);

  if (items.length === 0) {
    avisar(`Agregá al menos un ${termino("singular")} al presupuesto.`, "atencion");
    return;
  }

  const nombreCliente = form.cliente.value.trim();
  const clienteExistente = clientes.find(
    (c) => c.nombre.trim().toLowerCase() === nombreCliente.toLowerCase()
  );

  const body = {
    cliente: nombreCliente,
    cliente_id: clienteExistente?.id ?? null,
    fecha: form.fecha.value,
    vencimiento: form.vencimiento.value || null,
    notas: form.notas.value || null,
    items,
    lista_precio_id: form.lista_precio_id.value || null
  };
  const consultaId = presupuestoEditandoId ? null : presupuestoDeConsulta;
  if (consultaId) body.crm_oportunidad_id = consultaId;

  await api(presupuestoEditandoId ? `/api/presupuestos/${presupuestoEditandoId}` : "/api/presupuestos", {
    method: presupuestoEditandoId ? "PUT" : "POST",
    body,
    error: "No se pudo guardar el presupuesto."
  });

  const idEditado = presupuestoEditandoId;
  // Puede haber creado un cliente nuevo; el stock no se toca nunca acá.
  await refrescar([cargarPresupuestos(), cargarClientes()]);
  form.reset();
  modalPresupuesto.hidden = true;
  if (idEditado) await abrirFichaPresupuesto(idEditado);
  if (consultaId) await invocar("abrirFicha:consulta", consultaId);
  avisar(idEditado ? "Presupuesto actualizado." : "Presupuesto creado.", "ok");
});

/* ---------- Ventas ---------- */

const selVentas = crearSeleccion("ventasBody");

function renderVentas(lista) {
  const body = document.getElementById("ventasBody");
  body.innerHTML = "";
  selVentas.sincronizar(lista);

  if (lista.length === 0) {
    if (filtrosVentas.filtros.length > 0) {
      body.innerHTML = filaVaciaFiltrada(selVentas.colspan(8));
      body.querySelector(".tabla-vacia-limpiar").addEventListener("click", () => filtrosVentas.limpiar());
    } else {
      body.innerHTML = filaVacia(selVentas.colspan(8), "Todavía no hay ventas registradas.", { accionTexto: "+ Nueva venta", accionId: "btnNuevaVenta" });
    }
    return;
  }

  for (const v of lista) {
    const tr = document.createElement("tr");
    tr.className = "fila-clickeable";

    const accionFactura = v.facturada
      ? `<span class="status status-cobrado">Facturada</span>`
      : `<button type="button" class="btn-fila btn-facturar-venta" data-id="${v.id}">Facturar</button>`;
    const accionCobro =
      v.estado_cobro === "cobrado"
        ? ""
        : `<button type="button" class="btn-fila btn-cobrar-venta" data-id="${v.id}">Cobrar</button>`;
    // Anular solo tiene sentido si no está facturada, no tiene cobros ni
    // devoluciones asociadas (el backend lo vuelve a validar, esto es
    // nada más para no invitar a un click que ya sabemos que va a fallar).
    const accionAnular =
      !v.facturada && !v.tiene_devolucion && v.estado_cobro === "pendiente" && esAdmin()
        ? `<button type="button" class="btn-icon-danger btn-anular-venta" data-id="${v.id}" title="Anular venta" aria-label="Anular venta">${ICONO_TACHO}</button>`
        : "";

    tr.innerHTML = `
      ${selVentas.celda(v.id)}
      <td data-label="N°" class="mono">#${v.id}</td>
      <td data-label="Cliente">${esc(v.cliente)}</td>
      <td data-label="Productos" class="celda-wrap">${esc(v.items_resumen || "—")}</td>
      <td data-label="Fecha">${esc(fechaAR(v.fecha))}</td>
      <td data-label="Costo" class="align-right mono col-admin">${money(v.costo_total)}</td>
      <td data-label="Total" class="align-right mono">${money(v.total)}</td>
      <td data-label="Ganancia" class="align-right mono col-admin">${money(v.margen)}</td>
      <td data-label="Cobro"><span class="status ${ESTADO_COBRO_CLASE[v.estado_cobro]}">${ESTADO_COBRO_LABEL[v.estado_cobro]}</span></td>
      <td data-label=""><div class="fila-acciones">${accionFactura} ${accionCobro} ${accionAnular}</div></td>
    `;
    tr.addEventListener("click", (e) => {
      if (e.target.closest("button, a, input, label, select, textarea, .col-sel")) return;
      abrirFichaVenta(v.id);
    });
    body.appendChild(tr);
  }

  body.querySelectorAll(".btn-facturar-venta").forEach((btn) => {
    btn.addEventListener("click", () => {
      ventaAFacturarId = Number(btn.dataset.id);
      modalFacturarVenta.hidden = false;
    });
  });

  body.querySelectorAll(".btn-anular-venta").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (
        !(await confirmar({
          cuerpo: "¿Anular esta venta? Va a la papelera y el stock vuelve al depósito.",
          aceptar: "Anular venta",
          destructivo: true
        }))
      )
        return;
      await api(`/api/ventas/${btn.dataset.id}/anular`, {
        method: "POST",
        error: "No se pudo anular la venta."
      });
      avisar(`Venta #${btn.dataset.id} anulada.`, "ok");
      await refrescar([cargarVentas(), cargarStock(), cargarProductos(), cargarClientes(), recargar("cuentasCorrientes"), cargarPanelResumen(), cargarReporteStock()]);
    });
  });

  body.querySelectorAll(".btn-cobrar-venta").forEach((btn) => {
    btn.addEventListener("click", () => abrirModalCobrarVenta(Number(btn.dataset.id)));
  });
}

// Los totales acompañan al filtro: si mirás julio, el strip muestra julio.
// Un resumen que se quedara con el acumulado histórico mientras la tabla
// muestra un mes se prestaría a leer mal el número.
// Cada vista compone filtros y orden a su manera (algunas descartan anuladas
// primero, otras invierten el orden de aplicación), así que el botón de
// exportar de cada una recalcula con SU MISMA expresión en vez de leer una
// lista guardada: un caché podría quedar desincronizado y exportar algo
// distinto de lo que se ve en pantalla, que es el único bug que esta función
// no se puede permitir.
function listaVentasVisible() {
  const activas = ventas.filter((v) => v.estado !== "anulada");
  return filtrosVentas.aplicar(activas);
}

// Las columnas se declaran acá y no se derivan del <thead>: el CSV tiene
// que llevar el valor crudo, no el HTML de la celda con sus badges y
// botones.
const COLUMNAS_CSV_VENTAS = [
  { titulo: "N°", valor: (v) => v.id },
  { titulo: "Fecha", valor: (v) => v.fecha },
  { titulo: "Cliente", valor: (v) => v.cliente },
  { titulo: "Productos", valor: (v) => v.items_resumen },
  { titulo: "Costo", valor: (v) => v.costo_total, admin: true },
  { titulo: "Total", valor: (v) => v.total },
  { titulo: "Devuelto", valor: (v) => v.devuelto },
  { titulo: "Neto", valor: (v) => v.neto },
  { titulo: "Ganancia", valor: (v) => v.margen, admin: true },
  { titulo: "Cobro", valor: (v) => ESTADO_COBRO_LABEL[v.estado_cobro] ?? v.estado_cobro },
  { titulo: "Facturada", valor: (v) => (v.facturada ? "sí" : "no") }
];

document.getElementById("btnExportarVentas").addEventListener("click", () => {
  descargarCSV("nexo-ventas", columnasVisibles(COLUMNAS_CSV_VENTAS), listaVentasVisible());
});

montarBarraSeleccion(selVentas, [
  {
    etiqueta: "Exportar CSV",
    onClick: (ids) => {
      const idsSet = new Set(ids);
      descargarCSV("nexo-ventas-seleccion", columnasVisibles(COLUMNAS_CSV_VENTAS), listaVentasVisible().filter((v) => idsSet.has(v.id)));
    }
  }
]);

function filtrarVentas() {
  const activas = ventas.filter((v) => v.estado !== "anulada");
  const lista = filtrosVentas.aplicar(activas);

  const total = lista.reduce((acc, v) => acc + v.total, 0);
  const costo = lista.reduce((acc, v) => acc + (v.costo_total ?? 0), 0);
  document.getElementById("ventasTotalStrip").textContent = money(total);
  document.getElementById("ventasCostoStrip").textContent = money(costo);
  document.getElementById("ventasGananciaStrip").textContent = money(total - costo);

  renderVentas(lista);
}

const filtrosVentas = crearFiltros(
  "filtrosVentas",
  [
    { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
    { clave: "cliente", etiqueta: "Cliente", tipo: "texto" },
    { clave: "items_resumen", etiqueta: "Productos", tipo: "texto" },
    {
      clave: "estado_cobro",
      etiqueta: "Estado de cobro",
      tipo: "select",
      opciones: [
        { valor: "pendiente", texto: "Pendiente" },
        { valor: "parcial", texto: "Parcial" },
        { valor: "cobrado", texto: "Cobrado" }
      ]
    },
    { clave: "total", etiqueta: "Total", tipo: "numero" },
    { clave: "costo_total", etiqueta: "Costo", tipo: "numero" },
    { clave: "margen", etiqueta: "Ganancia", tipo: "numero" },
    { clave: "cobrado", etiqueta: "Cobrado", tipo: "numero" }
  ],
  filtrarVentas
);

// `ventas` guarda todo lo que devuelve la API (incluidas las anuladas)
// porque la papelera se arma sobre ese mismo array; la tabla de Ventas
// filtra al renderizar.
async function cargarVentas() {
  tablaCargando("ventasBody", selVentas.colspan(8));
  ventas = await api("/api/ventas");
  filtrarVentas();
  renderPapelera();
}

let ventas = [];
let ventaAFacturarId = null;
let ventaEditandoId = null;
// La consulta de la que sale una venta nueva (hist. §90): la venta la gana.
let ventaDeConsulta = null;
let ventaFichaId = null;

const modalVenta = document.getElementById("modalVenta");
const ventaItemsEl = document.getElementById("ventaItems");

function actualizarTotalVenta() {
  document.getElementById("ventaTotal").textContent = money(totalItems(ventaItemsEl));
}
ventaItemsEl.addEventListener("item-change", actualizarTotalVenta);

// Modo alta y modo edición comparten el mismo modal: sin venta se arranca
// en blanco, con venta se precargan cliente/fecha/items y el submit más
// abajo decide POST o PUT según `ventaEditandoId`.
/* ---------- Condición de pago y vencimiento (venta y compra) ---------- */

// El input de fecha solo tiene sentido con la condición "manual": para los
// plazos redondos la fecha la calcula el backend sobre la fecha de la
// operación, y mostrarla acá invitaría a editarla sin que eso cambie nada.
function sincronizarVencimiento(selectId, wrapId) {
  const select = document.getElementById(selectId);
  document.getElementById(wrapId).hidden = select.value !== "manual";
}

// Deja el par condición/vencimiento como lo tenía la operación que se está
// editando, o en "contado" para una nueva.
function poblarCondicionPago(form, operacion, selectId, wrapId) {
  form.condicion_pago.value = operacion?.condicion_pago ?? "contado";
  form.fecha_vencimiento.value = operacion?.condicion_pago === "manual" ? operacion.fecha_vencimiento ?? "" : "";
  sincronizarVencimiento(selectId, wrapId);
}

// Lo que viaja al backend: la fecha suelta solo se manda con "manual", para
// no ensuciar el request con un valor que el backend va a ignorar igual.
function datosCondicionPago(form) {
  return {
    condicion_pago: form.condicion_pago.value,
    fecha_vencimiento: form.condicion_pago.value === "manual" ? form.fecha_vencimiento.value || null : null
  };
}

// Select de condición de pago para la FICHA de cliente/proveedor (el plazo
// habitual de esa entidad, no el de una operación puntual): sin "Fecha
// puntual" (un plazo habitual reutilizable no puede ser una fecha suelta de
// una venta concreta) y con una opción explícita "Sin definir" = NULL, mismo
// criterio que "Usar la predeterminada" en poblarSelectListasPrecios.
function poblarSelectCondicionPago(selector) {
  const select = document.querySelector(selector);
  if (!select) return;
  select.innerHTML = `
    <option value="">Sin definir</option>
    <option value="contado">Contado</option>
    <option value="15">15 días</option>
    <option value="30">30 días</option>
    <option value="60">60 días</option>
  `;
}

// Marca si el usuario ya tocó el select de condición de pago a mano para
// esta venta puntual — mientras siga en false, elegir un cliente con plazo
// habitual puede proponerlo solo; una vez en true (el usuario lo cambió),
// elegir otro cliente ya no se lo pisa (a diferencia de la lista de precios,
// acá "contado" es a la vez el valor inicial y una elección válida del
// usuario, así que mirar el valor actual no alcanza para distinguir los dos
// casos — hace falta esta bandera aparte).
let ventaCondicionTocada = false;

// desde: { cliente, crm_oportunidad_id } cuando sale de una consulta.
async function abrirModalVenta(venta = null, desde = null) {
  ventaEditandoId = venta?.id ?? null;
  ventaDeConsulta = desde?.crm_oportunidad_id ?? null;
  ventaCondicionTocada = false;
  document.getElementById("modalVentaTitulo").textContent = venta ? "Editar venta" : "Nueva venta";
  document.getElementById("formVentaSubmit").textContent = venta ? "Guardar cambios" : "Registrar venta";

  const form = document.getElementById("formVenta");
  form.cliente.value = venta?.cliente ?? desde?.cliente ?? "";
  form.fecha.value = venta?.fecha ?? hoyISO();

  poblarSelectListasPrecios("#ventaListaPrecio");
  // Al editar, respeta la lista con la que se hizo la venta; al crear, si
  // el cliente tipeado ya existe y tiene una lista habitual, se propone
  // sola (CLAUDE.md §18) — se puede cambiar igual antes de guardar.
  if (venta?.lista_precio_id) {
    form.lista_precio_id.value = venta.lista_precio_id;
  } else if (!venta) {
    const clienteExistente = clientes.find(
      (c) => c.nombre.trim().toLowerCase() === (form.cliente.value || "").trim().toLowerCase()
    );
    if (clienteExistente?.lista_precio_id) form.lista_precio_id.value = clienteExistente.lista_precio_id;
  }

  // Depósito de esta venta (CLAUDE.md §19): al editar respeta el que ya
  // tenía; al crear arranca en el predeterminado (poblarSelectDepositos ya
  // hace eso solo).
  poblarSelectDepositos("#ventaDeposito");
  if (venta?.deposito_id) form.deposito_id.value = venta.deposito_id;

  poblarCondicionPago(form, venta, "ventaCondicionPago", "ventaVencimientoWrap");
  // Mismo criterio que la lista de precios: al crear, si el cliente tipeado
  // ya existe y tiene un plazo habitual, se propone solo.
  if (!venta) {
    const clienteExistente = clientes.find(
      (c) => c.nombre.trim().toLowerCase() === (form.cliente.value || "").trim().toLowerCase()
    );
    if (clienteExistente?.condicion_pago) {
      form.condicion_pago.value = clienteExistente.condicion_pago;
      sincronizarVencimiento("ventaCondicionPago", "ventaVencimientoWrap");
    }
  }

  ventaItemsEl.innerHTML = "";
  if (venta) {
    for (const item of venta.items) {
      agregarFilaItemVenta(ventaItemsEl, productos);
      const fila = ventaItemsEl.lastElementChild;
      fila.querySelector(".item-producto").value = item.producto;
      fila.querySelector(".item-producto-id").value = item.producto_id;
      fila.querySelector(".item-cantidad").value = item.cantidad;
      fila.querySelector(".item-precio").value = item.precio_unitario;
      if (item.variante_id) {
        const varianteSelect = fila.querySelector(".item-variante-id");
        const variantes = await variantesDeProducto(item.producto_id);
        varianteSelect.innerHTML = variantes
          .filter((v) => v.activo || v.id === item.variante_id)
          .map(
            (v) =>
              `<option value="${v.id}" data-stock="${esc(v.stock)}">${esc(v.combinacion)}${v.sku ? ` — ${esc(v.sku)}` : ""}</option>`
          )
          .join("");
        varianteSelect.value = item.variante_id;
        varianteSelect.hidden = false;
        // Mismo criterio que abajo para el stock del producto: la cantidad
        // ya cargada de este renglón cuenta como "disponible" también para
        // el tope de la variante.
        const varianteCache = variantes.find((v) => v.id === item.variante_id);
        if (varianteCache) {
          fila.querySelector(".item-cantidad").max = varianteCache.stock + item.cantidad;
        }
      } else {
        // El tope de stock de este renglón tiene que contemplar que su
        // propia cantidad ya está "afuera" (reservada por esta misma
        // venta): si no, al editar sin cambiar nada el tope quedaría más
        // bajo que la cantidad ya cargada.
        const productoCache = productos.find((p) => p.id === item.producto_id);
        if (productoCache && topeDeStock(productoCache) !== null) {
          fila.querySelector(".item-cantidad").max = productoCache.stock + item.cantidad;
        }
      }
      actualizarSubtotalFila(fila);
    }
  } else {
    agregarFilaItemVenta(ventaItemsEl, productos);
  }
  actualizarTotalVenta();
  modalVenta.hidden = false;
}

document.getElementById("btnNuevaVenta").addEventListener("click", () => abrirModalVenta());
document.getElementById("btnAgregarItemVenta").addEventListener("click", () => {
  agregarFilaItemVenta(ventaItemsEl, productos);
});
document.getElementById("modalVentaClose").addEventListener("click", () => {
  modalVenta.hidden = true;
});
modalVenta.addEventListener("click", (e) => {
  if (e.target === modalVenta) modalVenta.hidden = true;
});
document.getElementById("ventaListaPrecio").addEventListener("change", () => {
  reproponerPreciosPorLista(ventaItemsEl, productos);
});
document.getElementById("ventaCondicionPago").addEventListener("change", () => {
  ventaCondicionTocada = true;
  sincronizarVencimiento("ventaCondicionPago", "ventaVencimientoWrap");
});
// Elegir (o tipear) un cliente que ya existe y tiene lista/condición
// habitual las propone solas — solo si el usuario todavía no eligió una
// distinta a mano para esta venta puntual (no se le pisa una elección ya
// hecha). Los dos campos usan criterios distintos para detectar "ya elegido
// a mano" porque lista_precio_id arranca vacío (fácil de distinguir) pero
// condicion_pago arranca en "contado", que es también una elección válida —
// de ahí la bandera ventaCondicionTocada.
document.getElementById("formVenta").cliente.addEventListener("change", (e) => {
  const clienteExistente = clientes.find(
    (c) => c.nombre.trim().toLowerCase() === e.target.value.trim().toLowerCase()
  );
  if (clienteExistente?.lista_precio_id && !ventaEditandoId) {
    const select = document.getElementById("ventaListaPrecio");
    select.value = clienteExistente.lista_precio_id;
    reproponerPreciosPorLista(ventaItemsEl, productos);
  }
  if (clienteExistente?.condicion_pago && !ventaEditandoId && !ventaCondicionTocada) {
    document.getElementById("ventaCondicionPago").value = clienteExistente.condicion_pago;
    sincronizarVencimiento("ventaCondicionPago", "ventaVencimientoWrap");
  }
});

document.getElementById("formVenta").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  for (const fila of ventaItemsEl.querySelectorAll(".item-row")) {
    const cantidadInput = fila.querySelector(".item-cantidad");
    const tope = cantidadInput.max ? Number(cantidadInput.max) : null;
    if (tope !== null && Number(cantidadInput.value) > tope) {
      avisar(`No hay suficiente stock de "${fila.querySelector(".item-producto").value}" (disponible: ${numero(tope)}).`, "atencion");
      return;
    }
  }

  const items = leerItemsVenta(ventaItemsEl);

  if (items.length === 0) {
    avisar(`Agregá al menos un ${termino("singular")} a la venta.`, "atencion");
    return;
  }

  // Si el nombre tipeado matchea exactamente un cliente que ya existe, se
  // manda su id para no crear un duplicado; si no, se manda el nombre y el
  // backend lo crea (así "elegir existente o crear nuevo" es un solo campo).
  const nombreCliente = form.cliente.value.trim();
  const clienteExistente = clientes.find(
    (c) => c.nombre.trim().toLowerCase() === nombreCliente.toLowerCase()
  );

  const body = {
    cliente: nombreCliente,
    cliente_id: clienteExistente?.id ?? null,
    fecha: form.fecha.value,
    items,
    lista_precio_id: form.lista_precio_id.value || null,
    deposito_id: form.deposito_id.value || null,
    ...datosCondicionPago(form)
  };
  const consultaId = ventaEditandoId ? null : ventaDeConsulta;
  if (consultaId) body.crm_oportunidad_id = consultaId;

  await api(ventaEditandoId ? `/api/ventas/${ventaEditandoId}` : "/api/ventas", {
    method: ventaEditandoId ? "PUT" : "POST",
    body,
    error: ventaEditandoId ? "No se pudo guardar la venta." : "No se pudo registrar la venta."
  });

  const idEditado = ventaEditandoId;
  await refrescar([cargarVentas(), cargarStock(), cargarProductos(), cargarClientes(), recargar("cuentasCorrientes"), cargarPanelResumen(), cargarReporteStock()]);
  form.reset();
  modalVenta.hidden = true;
  // Si se estaba editando desde la ficha, volver a esa ficha con los
  // datos ya actualizados en vez de dejar al usuario en la lista.
  if (idEditado) await abrirFichaVenta(idEditado);
  if (consultaId) await invocar("abrirFicha:consulta", consultaId);
  avisar(idEditado ? `Venta #${idEditado} actualizada.` : consultaId ? "Venta registrada: la consulta quedó ganada." : "Venta registrada.", "ok");
});

async function abrirFichaVenta(id) {
  ventaFichaId = id;
  const venta = await api(`/api/ventas/${id}`, {
    error: "No se pudo cargar la venta."
  });

  document.getElementById("fichaVentaTitulo").textContent = `Venta #${venta.id}`;
  // Editar reemplaza los items enteros, y una devolución apunta a esos
  // renglones exactos (venta_item_id): si se pudiera editar, la
  // devolución quedaría apuntando a renglones que ya no existen. El
  // backend ya lo rechaza, esto es para no invitar a un click que va a
  // fallar.
  document.getElementById("btnEditarVenta").hidden = venta.facturada || venta.tiene_devolucion;
  document.getElementById("btnDevolverVenta").hidden =
    venta.estado === "anulada" || venta.items.every((i) => i.disponible_devolucion <= 0);

  const campos = [
    ["Cliente", venta.cliente],
    ["Fecha", fechaAR(venta.fecha)],
    ["Cobrado", `${money(venta.cobrado)} de ${money(venta.neto)}`],
    ["Estado de cobro", badge(ESTADO_COBRO_CLASE[venta.estado_cobro], ESTADO_COBRO_LABEL[venta.estado_cobro] ?? venta.estado_cobro)],
    ["Facturada", venta.facturada ? "Sí" : "No"]
  ];
  document.getElementById("fichaVentaDatos").innerHTML = camposFicha(campos);

  document.getElementById("fichaVentaCosto").textContent = money(venta.costo_total);
  document.getElementById("fichaVentaTotal").textContent = money(venta.total);
  document.getElementById("fichaVentaDevuelto").textContent = money(venta.devuelto);
  document.getElementById("fichaVentaNeto").textContent = money(venta.neto);
  document.getElementById("fichaVentaGanancia").textContent = money(venta.margen);

  document.getElementById("fichaVentaItems").innerHTML = venta.items
    .map(
      (i) => `
        <tr>
          <td data-label="Producto">${esc(i.producto)}</td>
          <td data-label="Cantidad" class="align-right mono">${numero(i.cantidad)}</td>
          <td data-label="Precio unit." class="align-right mono">${money(i.precio_unitario)}</td>
          <td data-label="Subtotal" class="align-right mono">${money(i.subtotal)}</td>
          <td data-label="Devuelto" class="align-right mono">${
            i.cantidad_devuelta > 0 ? numero(i.cantidad_devuelta) : "—"
          }</td>
          <td data-label="Ganancia" class="align-right mono col-admin">${money(i.ganancia)}</td>
        </tr>`
    )
    .join("");

  // Las devoluciones de esta venta viven en su propio caché (cargarDevoluciones,
  // ya resuelto para cuando se navega acá); el panel entero se oculta si no hay
  // ninguna, para no mostrar una tabla vacía en la mayoría de las ventas.
  const devolucionesDeVenta = devoluciones.filter((d) => d.venta_id === venta.id);
  const panelDevoluciones = document.getElementById("fichaVentaDevolucionesPanel");
  panelDevoluciones.hidden = devolucionesDeVenta.length === 0;
  document.getElementById("fichaVentaDevolucionesBody").innerHTML = devolucionesDeVenta
    .map(
      (d) => `
    <tr>
      <td data-label="N°" class="mono">#${d.id}</td>
      <td data-label="Productos" class="celda-wrap">${esc(d.items_resumen || "—")}</td>
      <td data-label="Total" class="align-right mono">${money(d.total)}</td>
      <td data-label="Estado">${
        d.estado === "anulada"
          ? `<span class="status status-vencido">Anulada</span>`
          : `<span class="status ${d.reintegrada ? "status-cobrado" : "status-pendiente"}">${
              d.reintegrada ? "Reintegrada" : "Crédito a favor"
            }</span>`
      }</td>
      <td data-label=""><button type="button" class="btn-link btn-ver-devolucion" data-id="${d.id}">Ver</button></td>
    </tr>`
    )
    .join("");
  document.querySelectorAll("#fichaVentaDevolucionesBody .btn-ver-devolucion").forEach((btn) => {
    btn.addEventListener("click", () => abrirFichaDevolucion(Number(btn.dataset.id)));
  });

  mostrarVista("venta-detalle", { titulo: `Venta #${venta.id}` });
}

document.getElementById("btnEditarVenta").addEventListener("click", async () => {
  abrirModalVenta(await api(`/api/ventas/${ventaFichaId}`, { error: "No se pudo cargar la venta." }));
});
document.getElementById("btnVolverVentas").addEventListener("click", () => mostrarVista("ventas"));

const modalFacturarVenta = document.getElementById("modalFacturarVenta");

document.getElementById("modalFacturarVentaClose").addEventListener("click", () => {
  modalFacturarVenta.hidden = true;
});
modalFacturarVenta.addEventListener("click", (e) => {
  if (e.target === modalFacturarVenta) modalFacturarVenta.hidden = true;
});

document.getElementById("formFacturarVenta").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  await api(`/api/ventas/${ventaAFacturarId}/facturar`, {
    method: "POST",
    body: {
      condicion: form.condicion.value,
      letra: form.letra.value,
      punto_venta: Number(form.punto_venta.value) || 1
    },
    error: "No se pudo generar la factura."
  });

  await refrescar([cargarVentas(), cargarFacturas()]);
  avisar(`Venta #${ventaAFacturarId} facturada.`, "ok");
  ventaAFacturarId = null;
  modalFacturarVenta.hidden = true;
});

/* ---------- Cobrar venta ---------- */

const modalCobrarVenta = document.getElementById("modalCobrarVenta");
let ventaACobrarId = null;

function renderHistorialPagos(contenedorId, lista) {
  const contenedor = document.getElementById(contenedorId);
  if (lista.length === 0) {
    contenedor.innerHTML = "";
    return;
  }
  contenedor.innerHTML =
    `<div class="historial-pagos">` +
    lista
      .map((p) => `<div class="historial-pagos-item"><span>${esc(fechaAR(p.fecha))} · ${esc(p.cuenta)}</span><span class="mono">${money(p.importe)}</span></div>`)
      .join("") +
    `</div>`;
}

async function abrirModalCobrarVenta(id) {
  ventaACobrarId = id;
  const venta = ventas.find((v) => v.id === id);
  document.getElementById("cobroVentaTotal").textContent = money(venta.neto);
  document.getElementById("cobroVentaCobrado").textContent = money(venta.cobrado);
  document.getElementById("cobroVentaSaldo").textContent = money(venta.neto - venta.cobrado);

  poblarSelectCuentas(document.querySelector('#formCobrarVenta select[name="cuenta_tesoreria_id"]'));

  const cobros = await api(`/api/ventas/${id}/cobros`);
  renderHistorialPagos("cobroVentaHistorial", cobros);

  modalCobrarVenta.hidden = false;
}

document.getElementById("modalCobrarVentaClose").addEventListener("click", () => {
  modalCobrarVenta.hidden = true;
});
modalCobrarVenta.addEventListener("click", (e) => {
  if (e.target === modalCobrarVenta) modalCobrarVenta.hidden = true;
});

document.getElementById("formCobrarVenta").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  await api(`/api/ventas/${ventaACobrarId}/cobros`, {
    method: "POST",
    body: {
      importe: parseFloat(form.importe.value),
      cuenta_tesoreria_id: Number(form.cuenta_tesoreria_id.value),
      nota: form.nota.value || null
    },
    error: "No se pudo registrar el cobro."
  });

  // Un cobro entra plata en una cuenta y baja la deuda del cliente, así
  // que Caja y Clientes también quedan desactualizados.
  await refrescar([cargarVentas(), cargarCaja(), cargarClientes(), recargar("cuentasCorrientes")]);
  form.reset();
  modalCobrarVenta.hidden = true;
  avisar("Cobro registrado.", "ok");
  // Para las pantallas que muestran lo que se debe de una venta (las cuotas
  // de un abono, hist. §79) sin conocer este modal.
  document.dispatchEvent(new CustomEvent("cobro-registrado", { detail: { ventaId: ventaACobrarId } }));
});

/* ---------- Devoluciones ---------- */

// Una devolución revierte parte (o todo) de una venta ya confirmada: no es
// una operación nueva independiente, así que se registra desde la ficha
// de la venta que revierte (botón "Devolver"), no desde un "+ Nuevo" en
// su propia pantalla — esta pantalla es nada más el listado y la ficha.
let devoluciones = [];
let ventaADevolverId = null;

function renderDevoluciones(lista) {
  const body = document.getElementById("devolucionesBody");

  document.getElementById("devueltoStrip").textContent = money(
    lista.reduce((acc, d) => acc + d.total, 0)
  );
  document.getElementById("reintegradoStrip").textContent = money(
    lista.filter((d) => d.reintegrada).reduce((acc, d) => acc + d.total, 0)
  );
  document.getElementById("creditoAFavorStrip").textContent = money(
    lista.filter((d) => !d.reintegrada).reduce((acc, d) => acc + d.total, 0)
  );

  if (lista.length === 0) {
    if (filtrosDevoluciones.filtros.length > 0) {
      body.innerHTML = filaVaciaFiltrada(7);
      body.querySelector(".tabla-vacia-limpiar").addEventListener("click", () => filtrosDevoluciones.limpiar());
    } else {
      body.innerHTML = filaVacia(7, "Todavía no hay devoluciones registradas.");
    }
    return;
  }

  body.innerHTML = lista
    .map(
      (d) => `
    <tr class="fila-clickeable" data-id="${d.id}">
      <td data-label="N°" class="mono">#${d.id}</td>
      <td data-label="Cliente">${esc(d.cliente)}</td>
      <td data-label="Productos" class="celda-wrap">${esc(d.items_resumen || "—")}</td>
      <td data-label="Fecha">${esc(fechaAR(d.fecha))}</td>
      <td data-label="Total" class="align-right mono">${money(d.total)}</td>
      <td data-label="Plata"><span class="status ${d.reintegrada ? "status-cobrado" : "status-pendiente"}">${
        d.reintegrada ? "Reintegrada" : "Crédito a favor"
      }</span></td>
      <td data-label="">${
        d.tiene_nota_credito ? `<span class="status status-cobrado">Con nota de crédito</span>` : ""
      }</td>
    </tr>`
    )
    .join("");

  body.querySelectorAll("tr[data-id]").forEach((tr) => {
    tr.addEventListener("click", () => abrirFichaDevolucion(Number(tr.dataset.id)));
  });
}

// Igual que Ventas y Compras: las anuladas no se muestran en el listado
// principal (solo en la papelera), así que ni entran en los totales del strip.
function filtrarDevoluciones() {
  const activas = devoluciones
    .filter((d) => d.estado !== "anulada")
    .map((d) => ({ ...d, reintegrada_txt: d.reintegrada ? "si" : "no" }));
  renderDevoluciones(filtrosDevoluciones.aplicar(activas));
}

const filtrosDevoluciones = crearFiltros(
  "filtrosDevoluciones",
  [
    { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
    { clave: "cliente", etiqueta: "Cliente", tipo: "texto" },
    { clave: "items_resumen", etiqueta: "Productos", tipo: "texto" },
    { clave: "total", etiqueta: "Total", tipo: "numero" },
    {
      clave: "reintegrada_txt",
      etiqueta: "Plata",
      tipo: "select",
      opciones: [
        { valor: "si", texto: "Reintegrada" },
        { valor: "no", texto: "Crédito a favor" }
      ]
    },
    { clave: "motivo", etiqueta: "Motivo", tipo: "texto" }
  ],
  filtrarDevoluciones
);

async function cargarDevoluciones() {
  tablaCargando("devolucionesBody", 7);
  devoluciones = await api("/api/devoluciones");
  filtrarDevoluciones();
  renderPapelera();
}

/* --- Ficha --- */

async function abrirFichaDevolucion(id) {
  const d = await api(`/api/devoluciones/${id}`, {
    error: "No se pudo cargar la devolución."
  });

  document.getElementById("fichaDevolucionTitulo").textContent = `Devolución #${d.id}`;
  document.getElementById("fichaDevolucionTotal").textContent = money(d.total);

  const campos = [
    ["Cliente", d.cliente],
    ["Fecha", fechaAR(d.fecha)],
    ["Venta de origen", `Venta #${d.venta_id}`],
    ["Motivo", d.motivo],
    [
      "Plata",
      d.reintegrada ? `Reintegrada por ${d.cuenta}` : "Crédito a favor del cliente"
    ],
    ["Estado", d.estado === "anulada" ? badge("status-vencido", "Anulada") : badge("status-cobrado", "Activa")]
  ];
  document.getElementById("fichaDevolucionDatos").innerHTML = camposFicha(campos);

  const acciones = document.getElementById("fichaDevolucionAcciones");
  const botones = [
    `<button type="button" class="btn btn-secundario" id="btnVerVentaDevolucion">Ver la venta #${d.venta_id}</button>`
  ];
  if (d.estado !== "anulada") {
    if (d.tiene_nota_credito) {
      botones.push(`<span class="status status-cobrado">Con nota de crédito</span>`);
    } else {
      botones.push(
        `<button type="button" class="btn btn-secundario" id="btnNotaCreditoDevolucion">Emitir nota de crédito</button>`
      );
      if (esAdmin()) {
        botones.push(
          `<button type="button" class="btn-icon-danger" id="btnAnularDevolucion" title="Anular devolución" aria-label="Anular devolución">${ICONO_TACHO}</button>`
        );
      }
    }
  }
  acciones.innerHTML = botones.join(" ");

  acciones.querySelector("#btnVerVentaDevolucion").addEventListener("click", () => abrirFichaVenta(d.venta_id));

  const btnNotaCredito = acciones.querySelector("#btnNotaCreditoDevolucion");
  if (btnNotaCredito) {
    btnNotaCredito.addEventListener("click", () => {
      devolucionANotaCreditoId = d.id;
      modalNotaCredito.hidden = false;
    });
  }

  const btnAnular = acciones.querySelector("#btnAnularDevolucion");
  if (btnAnular) {
    btnAnular.addEventListener("click", async () => {
      if (
        !(await confirmar({
          cuerpo: "¿Anular esta devolución? El stock y la cuenta corriente vuelven a como estaban.",
          aceptar: "Anular devolución",
          destructivo: true
        }))
      )
        return;
      await api(`/api/devoluciones/${d.id}/anular`, {
        method: "POST",
        error: "No se pudo anular la devolución."
      });
      avisar(`Devolución #${d.id} anulada.`, "ok");
      await refrescar([
        cargarDevoluciones(),
        cargarVentas(),
        cargarStock(),
        cargarProductos(),
        cargarClientes(),
        cargarCaja(),
        recargar("cuentasCorrientes"),
        cargarPanelResumen(),
        cargarReporteStock()
      ]);
      await abrirFichaDevolucion(d.id);
    });
  }

  document.getElementById("fichaDevolucionItems").innerHTML = d.items
    .map(
      (i) => `
    <tr>
      <td data-label="Producto">${esc(i.producto)}</td>
      <td data-label="Cantidad" class="align-right mono">${numero(i.cantidad)}</td>
      <td data-label="Precio unit." class="align-right mono">${money(i.precio_unitario)}</td>
      <td data-label="Subtotal" class="align-right mono">${money(i.subtotal)}</td>
      <td data-label="Vuelve al stock">${i.vuelve_stock ? "Sí" : "No (pérdida)"}</td>
    </tr>`
    )
    .join("");

  mostrarVista("devolucion-detalle", { titulo: `Devolución #${d.id}` });
}

document.getElementById("btnVolverDevoluciones").addEventListener("click", () => mostrarVista("devoluciones"));

/* --- Modal: registrar devolución (se abre desde la ficha de la venta) --- */

const modalDevolucion = document.getElementById("modalDevolucion");
const devolucionItemsEl = document.getElementById("devolucionItems");

function actualizarTotalDevolucion() {
  let total = 0;
  devolucionItemsEl.querySelectorAll(".item-row-devolucion").forEach((fila) => {
    const cantidad = Number(fila.querySelector(".devolucion-cantidad").value) || 0;
    const precio = Number(fila.dataset.precio);
    total += cantidad * precio;
  });
  document.getElementById("devolucionTotal").textContent = money(total);
}

// La lista de Ventas (GET /api/ventas) no trae los items con detalle, así
// que hace falta traer la ficha completa (GET /api/ventas/:id) para saber
// cuánto queda disponible para devolver de cada renglón.
async function abrirModalDevolucion(ventaId) {
  ventaADevolverId = ventaId;
  const venta = await api(`/api/ventas/${ventaId}`, {
    error: "No se pudo cargar la venta."
  });
  document.getElementById("modalDevolucionTitulo").textContent = `Registrar devolución — Venta #${ventaId}`;

  devolucionItemsEl.innerHTML = "";
  for (const item of venta.items) {
    if (item.disponible_devolucion <= 0) continue;
    const fila = document.createElement("div");
    fila.className = "item-row item-row-devolucion";
    fila.dataset.ventaItemId = item.id;
    fila.dataset.precio = item.precio_unitario;
    fila.innerHTML = `
      <span class="devolucion-producto">${esc(item.producto)}${
        item.combinacion ? ` (${esc(item.combinacion)})` : ""
      } <span class="mono" style="color: var(--ink-muted)">(vendidas: ${numero(
        item.cantidad
      )}, disponibles: ${numero(item.disponible_devolucion)})</span></span>
      <input type="number" class="devolucion-cantidad" placeholder="Cant." step="1" min="0" max="${esc(item.disponible_devolucion)}" value="0" />
      <label class="form-check">
        <input type="checkbox" class="devolucion-vuelve-stock" checked /> Vuelve al stock
      </label>
    `;
    fila.querySelector(".devolucion-cantidad").addEventListener("input", actualizarTotalDevolucion);
    devolucionItemsEl.appendChild(fila);
  }

  document.getElementById("formDevolucion").reset();
  document.getElementById("devolucionReintegrar").checked = false;
  document.getElementById("devolucionCuentaLabel").hidden = true;
  actualizarTotalDevolucion();
  modalDevolucion.hidden = false;
}

// Como abrirModalDevolucion arma las filas a mano (no reusa
// agregarFilaItemVenta: acá no se agrega un producto nuevo, se elige
// cuánto devolver de cada renglón ya vendido), el listener de cantidad
// se cablea al crear cada fila, arriba.

document.getElementById("btnDevolverVenta").addEventListener("click", async () => {
  await abrirModalDevolucion(ventaFichaId);
});

document.getElementById("modalDevolucionClose").addEventListener("click", () => {
  modalDevolucion.hidden = true;
});
modalDevolucion.addEventListener("click", (e) => {
  if (e.target === modalDevolucion) modalDevolucion.hidden = true;
});

document.getElementById("devolucionReintegrar").addEventListener("change", (e) => {
  const label = document.getElementById("devolucionCuentaLabel");
  label.hidden = !e.target.checked;
  if (e.target.checked) {
    poblarSelectCuentas(label.querySelector("select"));
  }
});

document.getElementById("formDevolucion").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  const items = [...devolucionItemsEl.querySelectorAll(".item-row-devolucion")]
    .map((fila) => ({
      venta_item_id: Number(fila.dataset.ventaItemId),
      cantidad: Number(fila.querySelector(".devolucion-cantidad").value) || 0,
      vuelve_stock: fila.querySelector(".devolucion-vuelve-stock").checked
    }))
    .filter((i) => i.cantidad > 0);

  if (items.length === 0) {
    avisar("Ingresá una cantidad a devolver de al menos un producto.", "atencion");
    return;
  }

  const reintegrar = document.getElementById("devolucionReintegrar").checked;

  await api("/api/devoluciones", {
    method: "POST",
    body: {
      venta_id: ventaADevolverId,
      items,
      motivo: form.motivo.value || null,
      cuenta_tesoreria_id: reintegrar ? Number(form.cuenta_tesoreria_id.value) : null
    },
    error: "No se pudo registrar la devolución."
  });
  avisar("Devolución registrada.", "ok");

  // Toca stock, cuenta corriente, caja (si hubo reintegro) y el resultado.
  await refrescar([
    cargarDevoluciones(),
    cargarVentas(),
    cargarStock(),
    cargarProductos(),
    cargarClientes(),
    cargarCaja(),
    recargar("cuentasCorrientes"),
    cargarPanelResumen(),
    cargarReporteStock()
  ]);
  modalDevolucion.hidden = true;
  await abrirFichaVenta(ventaADevolverId);
});

/* --- Modal: emitir nota de crédito (se abre desde la ficha de la devolución) --- */

const modalNotaCredito = document.getElementById("modalNotaCredito");
let devolucionANotaCreditoId = null;

document.getElementById("modalNotaCreditoClose").addEventListener("click", () => {
  modalNotaCredito.hidden = true;
});
modalNotaCredito.addEventListener("click", (e) => {
  if (e.target === modalNotaCredito) modalNotaCredito.hidden = true;
});

document.getElementById("formNotaCredito").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  await api(`/api/devoluciones/${devolucionANotaCreditoId}/nota-credito`, {
    method: "POST",
    body: {
      condicion: form.condicion.value,
      letra: form.letra.value,
      punto_venta: Number(form.punto_venta.value) || 1
    },
    error: "No se pudo emitir la nota de crédito."
  });

  await refrescar([cargarDevoluciones(), cargarFacturas()]);
  modalNotaCredito.hidden = true;
  await abrirFichaDevolucion(devolucionANotaCreditoId);
  avisar("Nota de crédito emitida.", "ok");
});


/* ---------- Compras ---------- */

const ENVIO_LABEL = { pedido: "Pedido", en_camino: "En camino", recibido: "Recibido" };
const ESTADO_PAGO_CLASE = { pendiente: "status-vencido", parcial: "status-pendiente", pagado: "status-cobrado" };
const ESTADO_PAGO_LABEL = { pendiente: "Pendiente", parcial: "Parcial", pagado: "Pagado" };

const selCompras = crearSeleccion("comprasBody");

function renderCompras(lista) {
  const body = document.getElementById("comprasBody");
  body.innerHTML = "";
  selCompras.sincronizar(lista);

  if (lista.length === 0) {
    if (filtrosCompras.filtros.length > 0) {
      body.innerHTML = filaVaciaFiltrada(selCompras.colspan(7));
      body.querySelector(".tabla-vacia-limpiar").addEventListener("click", () => filtrosCompras.limpiar());
    } else {
      body.innerHTML = filaVacia(selCompras.colspan(7), "Todavía no hay compras registradas.", { accionTexto: "+ Nueva compra", accionId: "btnNuevaCompra" });
    }
    return;
  }

  for (const c of lista) {
    const tr = document.createElement("tr");
    tr.className = "fila-clickeable";
    tr.addEventListener("click", (e) => {
      if (e.target.closest("button, select, a, input, label, textarea, .col-sel")) return;
      abrirFichaCompra(c.id);
    });
    const borrador = c.estado === "borrador";

    // Anular solo tiene sentido si no tiene pagos (el backend lo vuelve a
    // validar, esto es nada más para no invitar a un click que ya sabemos
    // que va a fallar).
    const accionAnular =
      c.estado_pago === "pendiente"
        ? `<button type="button" class="btn-icon-danger btn-anular-compra" data-id="${c.id}" title="Anular compra" aria-label="Anular compra">${ICONO_TACHO}</button>`
        : "";

    // Un borrador todavía no le debe nada a nadie, así que no se puede
    // pagar ni tiene estado de envío que tocar: lo único que ofrece es
    // efectuar el pedido.
    if (borrador) {
      tr.innerHTML = `
        ${selCompras.celda(c.id)}
        <td data-label="N°" class="mono">#${c.id}</td>
        <td data-label="Proveedor">${esc(c.proveedor)}</td>
        <td data-label="Fecha">${esc(fechaAR(c.fecha))}</td>
        <td data-label="Total" class="align-right mono">${money(c.total)}</td>
        <td data-label="Pago"><span class="status">Borrador</span></td>
        <td data-label="Envío">—</td>
        <td data-label=""><div class="fila-acciones"><button type="button" class="btn-fila btn-confirmar-compra" data-id="${c.id}">Efectuar pedido</button> ${accionAnular}</div></td>
      `;
      body.appendChild(tr);
      continue;
    }

    const accionPago =
      c.estado_pago === "pagado"
        ? ""
        : `<button type="button" class="btn-fila btn-pagar-compra" data-id="${c.id}">Pagar</button>`;
    // Una vez recibida no se puede volver atrás (el costo promedio ya se
    // recalculó), así que el selector se reemplaza por texto plano.
    const celdaEnvio =
      c.estado_envio === "recibido"
        ? `<span class="status status-cobrado">Recibido</span>`
        : `<select class="select-inline select-estado-envio" data-id="${c.id}">${Object.entries(ENVIO_LABEL)
            .map(
              ([valor, label]) =>
                `<option value="${valor}" ${valor === c.estado_envio ? "selected" : ""}>${label}</option>`
            )
            .join("")}</select>`;

    tr.innerHTML = `
      ${selCompras.celda(c.id)}
      <td data-label="N°" class="mono">#${c.id}</td>
      <td data-label="Proveedor">${esc(c.proveedor)}</td>
      <td data-label="Fecha">${esc(fechaAR(c.fecha))}</td>
      <td data-label="Total" class="align-right mono">${money(c.total)}</td>
      <td data-label="Pago"><span class="status ${ESTADO_PAGO_CLASE[c.estado_pago]}">${ESTADO_PAGO_LABEL[c.estado_pago]}</span></td>
      <td data-label="Envío">${celdaEnvio}</td>
      <td data-label=""><div class="fila-acciones">${accionPago} ${accionAnular}</div></td>
    `;
    body.appendChild(tr);
  }

  body.querySelectorAll(".btn-confirmar-compra").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (
        !(await confirmar({
          cuerpo: "¿Efectuar el pedido? Se va a registrar la deuda con el proveedor.",
          aceptar: "Efectuar pedido"
        }))
      )
        return;
      await api(`/api/compras/${btn.dataset.id}/confirmar`, {
        method: "POST",
        error: "No se pudo efectuar el pedido."
      });
      avisar(`Compra #${btn.dataset.id} efectuada.`, "ok");
      await refrescar([cargarCompras(), cargarProveedores(), recargar("cuentasCorrientes")]);
    });
  });

  body.querySelectorAll(".btn-pagar-compra").forEach((btn) => {
    btn.addEventListener("click", () => abrirModalPagarCompra(Number(btn.dataset.id)));
  });

  body.querySelectorAll(".btn-anular-compra").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (
        !(await confirmar({
          cuerpo: "¿Anular esta compra? Va a la papelera y el stock que sumó se revierte.",
          aceptar: "Anular compra",
          destructivo: true
        }))
      )
        return;
      await api(`/api/compras/${btn.dataset.id}/anular`, {
        method: "POST",
        error: "No se pudo anular la compra."
      });
      avisar(`Compra #${btn.dataset.id} anulada.`, "ok");
      await refrescar([cargarCompras(), cargarStock(), cargarProductos(), cargarProveedores(), recargar("cuentasCorrientes"), cargarReporteStock()]);
    });
  });

  body.querySelectorAll(".select-estado-envio").forEach((select) => {
    select.addEventListener("change", async () => {
      if (
        select.value === "recibido" &&
        !(await confirmar({
          cuerpo: "¿Marcar la compra como recibida? Se va a sumar el stock y recalcular el costo.",
          aceptar: "Marcar recibida"
        }))
      ) {
        await refrescar([cargarCompras()]);
        return;
      }
      await api(`/api/compras/${select.dataset.id}/estado-envio`, {
        method: "PATCH",
        body: { estado_envio: select.value },
        error: "No se pudo cambiar el estado de envío."
      }).catch(async (e) => {
        // El select ya muestra el estado nuevo: se repinta con el real.
        await refrescar([cargarCompras()]);
        throw e;
      });
      // Recibir una compra mueve stock y costo, así que hay que refrescar
      // esas pantallas también.
      await refrescar([cargarCompras(), cargarStock(), cargarProductos(), cargarProveedores(), cargarReporteStock()]);
    });
  });
}

let compras = [];
let compraEditandoId = null;
let compraFichaId = null;

function filtrarCompras() {
  const activas = compras.filter((c) => c.estado !== "anulada");
  const lista = filtrosCompras.aplicar(activas);

  const total = lista.reduce((acc, c) => acc + c.total, 0);
  const pagado = lista.reduce((acc, c) => acc + c.pagado, 0);
  document.getElementById("comprasTotalStrip").textContent = money(total);
  document.getElementById("comprasPagadoStrip").textContent = money(pagado);
  document.getElementById("comprasDeudaStrip").textContent = money(total - pagado);

  renderCompras(lista);
}

const filtrosCompras = crearFiltros(
  "filtrosCompras",
  [
    { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
    { clave: "proveedor", etiqueta: "Proveedor", tipo: "texto" },
    {
      clave: "estado",
      etiqueta: "Estado",
      tipo: "select",
      opciones: [
        { valor: "borrador", texto: "Borrador" },
        { valor: "activa", texto: "Efectuada" }
      ]
    },
    {
      clave: "estado_pago",
      etiqueta: "Estado de pago",
      tipo: "select",
      opciones: [
        { valor: "pendiente", texto: "Pendiente" },
        { valor: "parcial", texto: "Parcial" },
        { valor: "pagado", texto: "Pagado" }
      ]
    },
    {
      clave: "estado_envio",
      etiqueta: "Envío",
      tipo: "select",
      opciones: [
        { valor: "pedido", texto: "Pedido" },
        { valor: "en_camino", texto: "En camino" },
        { valor: "recibido", texto: "Recibido" }
      ]
    },
    { clave: "total", etiqueta: "Total", tipo: "numero" },
    { clave: "pagado", etiqueta: "Pagado", tipo: "numero" },
    { clave: "costo_envio", etiqueta: "Costo de envío", tipo: "numero" }
  ],
  filtrarCompras
);

// Mismos criterios que filtrarCompras: descarta anuladas, aplica filtros y
// orden con la misma expresión — así lo que se exporta coincide con lo que
// se ve en pantalla.
function listaComprasVisible() {
  const activas = compras.filter((c) => c.estado !== "anulada");
  return filtrosCompras.aplicar(activas);
}

const COLUMNAS_CSV_COMPRAS = [
  { titulo: "N°", valor: (c) => c.id },
  { titulo: "Proveedor", valor: (c) => c.proveedor },
  { titulo: "Fecha", valor: (c) => c.fecha },
  { titulo: "Total", valor: (c) => c.total },
  { titulo: "Pagado", valor: (c) => c.pagado },
  { titulo: "Estado de pago", valor: (c) => ESTADO_PAGO_LABEL[c.estado_pago] ?? c.estado_pago },
  { titulo: "Envío", valor: (c) => ENVIO_LABEL[c.estado_envio] ?? c.estado_envio }
];

montarBarraSeleccion(selCompras, [
  {
    etiqueta: "Cambiar estado de envío",
    onClick: (ids) => abrirModalBulkEstadoEnvio(ids)
  },
  {
    etiqueta: "Exportar CSV",
    onClick: (ids) => {
      const idsSet = new Set(ids);
      descargarCSV("nexo-compras-seleccion", COLUMNAS_CSV_COMPRAS, listaComprasVisible().filter((c) => idsSet.has(c.id)));
    }
  }
]);

/* ---------- Edición en lote de estado de envío (Compras) ---------- */
//
// Mismo criterio que bulkProductosIds: copia propia de los ids, no se
// relee selCompras.ids al hacer submit.
let bulkComprasIds = [];

const modalBulkEstadoEnvio = document.getElementById("modalBulkEstadoEnvio");
const formBulkEstadoEnvio = document.getElementById("formBulkEstadoEnvio");
const bulkEstadoEnvioResultado = document.getElementById("bulkEstadoEnvioResultado");
const bulkEstadoEnvioResultadoTitulo = document.getElementById("bulkEstadoEnvioResultadoTitulo");
const bulkEstadoEnvioResultadoLista = document.getElementById("bulkEstadoEnvioResultadoLista");

function abrirModalBulkEstadoEnvio(ids) {
  bulkComprasIds = ids;
  formBulkEstadoEnvio.reset();
  formBulkEstadoEnvio.estado_envio.innerHTML = Object.entries(ENVIO_LABEL)
    .map(([valor, texto]) => `<option value="${valor}">${texto}</option>`)
    .join("");
  bulkEstadoEnvioResultado.hidden = true;
  document.getElementById("modalBulkEstadoEnvioConteo").textContent =
    `${ids.length} compra${ids.length === 1 ? "" : "s"} seleccionada${ids.length === 1 ? "" : "s"}`;
  document.getElementById("bulkEstadoEnvioSubmit").textContent = `Aplicar a ${ids.length} compra${ids.length === 1 ? "" : "s"}`;
  modalBulkEstadoEnvio.hidden = false;
}

document.getElementById("modalBulkEstadoEnvioClose").addEventListener("click", () => {
  modalBulkEstadoEnvio.hidden = true;
});
modalBulkEstadoEnvio.addEventListener("click", (e) => {
  if (e.target === modalBulkEstadoEnvio) modalBulkEstadoEnvio.hidden = true;
});

formBulkEstadoEnvio.addEventListener("submit", async (e) => {
  e.preventDefault();
  const estadoEnvio = e.target.estado_envio.value;

  // Marcar como "recibido" suma stock al depósito y recalcula el costo
  // promedio ponderado de cada producto — es irreversible por diseño
  // (una vez recibida, una compra no puede volver atrás). Confirmación
  // obligatoria, no condicional como en Productos.
  if (estadoEnvio === "recibido") {
    const ok = await confirmar({
      titulo: "Marcar como recibidas",
      cuerpo: `Vas a marcar ${bulkComprasIds.length} compras como recibidas. Esto suma el stock correspondiente y recalcula el costo de cada producto. No se puede deshacer.`,
      aceptar: "Marcar como recibidas",
      destructivo: true
    });
    if (!ok) return;
  }

  const resultado = await api("/api/compras/bulk/estado-envio", {
    method: "POST",
    body: { ids: bulkComprasIds, estado_envio: estadoEnvio },
    error: "No se pudo aplicar el cambio de estado en lote."
  });

  await refrescar([cargarCompras(), cargarProductos(), cargarReporteStock(), cargarPanelResumen()]);

  const huboFallos = mostrarResultadoBulk(resultado, {
    bloque: bulkEstadoEnvioResultado,
    titulo: bulkEstadoEnvioResultadoTitulo,
    lista: bulkEstadoEnvioResultadoLista,
    etiquetar: (id) => `Compra #${id}`
  });

  if (huboFallos) {
    bulkComprasIds = resultado.fallidos.map((f) => f.id);
    document.getElementById("bulkEstadoEnvioSubmit").textContent =
      `Reintentar con ${bulkComprasIds.length} compra${bulkComprasIds.length === 1 ? "" : "s"}`;
  } else {
    selCompras.limpiar();
    modalBulkEstadoEnvio.hidden = true;
  }
});

async function cargarCompras() {
  // Todo el circuito de compras es admin-only en el servidor (se valoriza
  // al costo por definición — ver permisos.js), y esta función corre en el
  // boot para cualquier usuario logueado. Sin este corte un empleado recibe
  // el cuerpo del 403 (`{error: "..."}`) donde se espera un array, y
  // filtrarCompras()/renderPapelera() explotan tratando de iterarlo.
  if (!esAdmin()) return;
  tablaCargando("comprasBody", selCompras.colspan(7));
  compras = await api("/api/compras");
  filtrarCompras();
  renderPapelera();
}

const modalCompra = document.getElementById("modalCompra");
const compraItemsEl = document.getElementById("compraItems");
const compraCostoEnvioEl = document.getElementById("compraCostoEnvio");

// El envío vive fuera de #compraItems (no es un ítem), así que totalItems()
// no lo ve y hay que sumarlo aparte.
function actualizarTotalCompra() {
  const envio = Number(compraCostoEnvioEl.value) || 0;
  document.getElementById("compraTotal").textContent = money(totalItems(compraItemsEl) + envio);
}
compraItemsEl.addEventListener("item-change", actualizarTotalCompra);
compraCostoEnvioEl.addEventListener("input", actualizarTotalCompra);

// Igual que con ventas: el mismo modal sirve para alta y edición. La nota
// de "se guarda como borrador" solo tiene sentido al crear, así que se
// oculta al editar (una compra editada nunca cambia de estado).
// Mismo criterio que ventaCondicionTocada (ver ahí el porqué).
let compraCondicionTocada = false;

async function abrirModalCompra(compra = null) {
  compraEditandoId = compra?.id ?? null;
  compraCondicionTocada = false;
  document.getElementById("modalCompraTitulo").textContent = compra ? "Editar compra" : "Nueva compra";
  document.getElementById("formCompraSubmit").textContent = compra ? "Guardar cambios" : "Guardar borrador";
  document.getElementById("compraFormNota").hidden = Boolean(compra);

  const form = document.getElementById("formCompra");
  form.proveedor.value = compra?.proveedor ?? "";
  form.fecha.value = compra?.fecha ?? hoyISO();
  compraCostoEnvioEl.value = compra?.costo_envio ?? "";

  // Depósito de esta compra (CLAUDE.md §19): a ese depósito entra la
  // mercadería cuando se marca recibida. Al editar respeta el que ya
  // tenía; al crear arranca en el predeterminado.
  poblarSelectDepositos("#compraDeposito");
  if (compra?.deposito_id) form.deposito_id.value = compra.deposito_id;

  poblarCondicionPago(form, compra, "compraCondicionPago", "compraVencimientoWrap");
  // Al crear, si el proveedor tipeado ya existe y tiene un plazo habitual,
  // se propone solo (mismo criterio que el cliente en Venta).
  if (!compra) {
    const proveedorExistente = proveedores.find(
      (p) => p.nombre.trim().toLowerCase() === (form.proveedor.value || "").trim().toLowerCase()
    );
    if (proveedorExistente?.condicion_pago) {
      form.condicion_pago.value = proveedorExistente.condicion_pago;
      sincronizarVencimiento("compraCondicionPago", "compraVencimientoWrap");
    }
  }

  compraItemsEl.innerHTML = "";
  if (compra) {
    for (const item of compra.items) {
      agregarFilaItemCompra(compraItemsEl, productos);
      const fila = compraItemsEl.lastElementChild;
      fila.querySelector(".item-producto").value = item.producto;
      fila.querySelector(".item-producto-id").value = item.producto_id;
      fila.querySelector(".item-cantidad").value = item.cantidad;
      fila.querySelector(".item-precio").value = item.precio_unitario;
      if (item.variante_id) {
        const varianteSelect = fila.querySelector(".item-variante-id");
        const variantes = await variantesDeProducto(item.producto_id);
        varianteSelect.innerHTML = variantes
          .filter((v) => v.activo || v.id === item.variante_id)
          .map((v) => `<option value="${v.id}">${esc(v.combinacion)}${v.sku ? ` — ${esc(v.sku)}` : ""}</option>`)
          .join("");
        varianteSelect.value = item.variante_id;
        varianteSelect.hidden = false;
      }
      actualizarSubtotalFila(fila);
    }
  } else {
    agregarFilaItemCompra(compraItemsEl, productos);
  }
  actualizarTotalCompra();
  modalCompra.hidden = false;
}

document.getElementById("btnNuevaCompra").addEventListener("click", () => abrirModalCompra());
document.getElementById("btnAgregarItemCompra").addEventListener("click", () => {
  agregarFilaItemCompra(compraItemsEl, productos);
});
document.getElementById("compraCondicionPago").addEventListener("change", () => {
  compraCondicionTocada = true;
  sincronizarVencimiento("compraCondicionPago", "compraVencimientoWrap");
});
// Elegir (o tipear) un proveedor que ya existe y tiene plazo habitual lo
// propone solo — mismo criterio que el cliente en Venta (no se le pisa una
// elección ya hecha a mano).
document.getElementById("formCompra").proveedor.addEventListener("change", (e) => {
  const proveedorExistente = proveedores.find(
    (p) => p.nombre.trim().toLowerCase() === e.target.value.trim().toLowerCase()
  );
  if (proveedorExistente?.condicion_pago && !compraEditandoId && !compraCondicionTocada) {
    document.getElementById("compraCondicionPago").value = proveedorExistente.condicion_pago;
    sincronizarVencimiento("compraCondicionPago", "compraVencimientoWrap");
  }
});
document.getElementById("modalCompraClose").addEventListener("click", () => {
  modalCompra.hidden = true;
});
modalCompra.addEventListener("click", (e) => {
  if (e.target === modalCompra) modalCompra.hidden = true;
});

document.getElementById("formCompra").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const items = leerItemsCompra(compraItemsEl);

  if (items.length === 0) {
    avisar("Agregá al menos un producto a la compra.", "atencion");
    return;
  }

  const body = {
    proveedor: form.proveedor.value,
    fecha: form.fecha.value,
    costo_envio: form.costo_envio.value,
    items,
    deposito_id: form.deposito_id.value || null,
    ...datosCondicionPago(form)
  };

  await api(compraEditandoId ? `/api/compras/${compraEditandoId}` : "/api/compras", {
    method: compraEditandoId ? "PUT" : "POST",
    body,
    error: "No se pudo guardar la compra."
  });

  const idEditado = compraEditandoId;
  await refrescar([cargarCompras(), cargarStock(), cargarProductos(), cargarProveedores(), recargar("cuentasCorrientes"), cargarReporteStock()]);
  form.reset();
  modalCompra.hidden = true;
  if (idEditado) await abrirFichaCompra(idEditado);
  avisar(idEditado ? `Compra #${idEditado} actualizada.` : "Compra registrada.", "ok");
});

async function abrirFichaCompra(id) {
  compraFichaId = id;
  const compra = await api(`/api/compras/${id}`, {
    error: "No se pudo cargar la compra."
  });

  document.getElementById("fichaCompraTitulo").textContent = `Compra #${compra.id}`;
  // Editar reemplaza los items enteros, y una devolución a proveedor apunta
  // a esos renglones exactos (compra_item_id): si se pudiera editar, la
  // devolución quedaría apuntando a renglones que ya no existen. El
  // backend ya lo rechaza, esto es para no invitar a un click que va a fallar.
  document.getElementById("btnEditarCompra").hidden = compra.tiene_devolucion;
  document.getElementById("btnDevolverCompra").hidden =
    compra.estado !== "activa" || !compra.stock_aplicado || compra.items.every((i) => i.disponible_devolucion <= 0);

  const campos = [
    ["Proveedor", compra.proveedor],
    ["Fecha", fechaAR(compra.fecha)],
    ["Estado", compra.estado === "borrador" ? badge("", "Borrador") : badge("status-cobrado", "Efectuada")],
    ["Envío", ENVIO_LABEL[compra.estado_envio] ?? "—"],
    ["Pagado", `${money(compra.pagado)} de ${money(compra.neto)}`],
    ["Estado de pago", badge(ESTADO_PAGO_CLASE[compra.estado_pago], ESTADO_PAGO_LABEL[compra.estado_pago] ?? compra.estado_pago)]
  ];
  document.getElementById("fichaCompraDatos").innerHTML = camposFicha(campos);

  document.getElementById("fichaCompraSubtotal").textContent = money(compra.subtotal);
  document.getElementById("fichaCompraEnvio").textContent = money(compra.costo_envio);
  document.getElementById("fichaCompraTotal").textContent = money(compra.total);
  document.getElementById("fichaCompraDevuelto").textContent = money(compra.devuelto);
  document.getElementById("fichaCompraNeto").textContent = money(compra.neto);

  document.getElementById("fichaCompraItems").innerHTML = compra.items
    .map(
      (i) => `
        <tr>
          <td data-label="Producto">${esc(i.producto)}</td>
          <td data-label="Cantidad" class="align-right mono">${numero(i.cantidad)}</td>
          <td data-label="Precio unit." class="align-right mono">${money(i.precio_unitario)}</td>
          <td data-label="Costo real (con envío)" class="align-right mono">${money(i.costo_real_unitario)}</td>
          <td data-label="Subtotal" class="align-right mono">${money(i.subtotal)}</td>
          <td data-label="Devuelto" class="align-right mono">${
            i.cantidad_devuelta > 0 ? numero(i.cantidad_devuelta) : "—"
          }</td>
        </tr>`
    )
    .join("");

  // Las devoluciones a esta compra viven en su propio caché
  // (cargarDevolucionesProveedor, ya resuelto para cuando se navega acá);
  // el panel entero se oculta si no hay ninguna.
  const devolucionesDeCompra = devolucionesProveedor.filter((d) => d.compra_id === compra.id);
  const panelDevoluciones = document.getElementById("fichaCompraDevolucionesPanel");
  panelDevoluciones.hidden = devolucionesDeCompra.length === 0;
  document.getElementById("fichaCompraDevolucionesBody").innerHTML = devolucionesDeCompra
    .map(
      (d) => `
    <tr>
      <td data-label="N°" class="mono">#${d.id}</td>
      <td data-label="Productos" class="celda-wrap">${esc(d.items_resumen || "—")}</td>
      <td data-label="Total" class="align-right mono">${money(d.total)}</td>
      <td data-label="Estado">${
        d.estado === "anulada"
          ? `<span class="status status-vencido">Anulada</span>`
          : `<span class="status ${d.reintegrada ? "status-cobrado" : "status-pendiente"}">${
              d.reintegrada ? "Reintegrada" : "Crédito a favor"
            }</span>`
      }</td>
      <td data-label=""><button type="button" class="btn-link btn-ver-devolucion-proveedor" data-id="${d.id}">Ver</button></td>
    </tr>`
    )
    .join("");
  document.querySelectorAll("#fichaCompraDevolucionesBody .btn-ver-devolucion-proveedor").forEach((btn) => {
    btn.addEventListener("click", () => abrirFichaDevolucionProveedor(Number(btn.dataset.id)));
  });

  mostrarVista("compra-detalle", { titulo: `Compra #${compra.id}` });
}

document.getElementById("btnEditarCompra").addEventListener("click", async () => {
  abrirModalCompra(await api(`/api/compras/${compraFichaId}`, { error: "No se pudo cargar la compra." }));
});
document.getElementById("btnVolverCompras").addEventListener("click", () => mostrarVista("compras"));

/* ---------- Pagar compra ---------- */

const modalPagarCompra = document.getElementById("modalPagarCompra");
let compraAPagarId = null;

async function abrirModalPagarCompra(id) {
  compraAPagarId = id;
  const compra = compras.find((c) => c.id === id);
  document.getElementById("pagoCompraTotal").textContent = money(compra.total);
  document.getElementById("pagoCompraPagado").textContent = money(compra.pagado);
  document.getElementById("pagoCompraSaldo").textContent = money(compra.total - compra.pagado);

  poblarSelectCuentas(document.querySelector('#formPagarCompra select[name="cuenta_tesoreria_id"]'));

  const pagos = await api(`/api/compras/${id}/pagos`);
  renderHistorialPagos("pagoCompraHistorial", pagos);

  modalPagarCompra.hidden = false;
}

document.getElementById("modalPagarCompraClose").addEventListener("click", () => {
  modalPagarCompra.hidden = true;
});
modalPagarCompra.addEventListener("click", (e) => {
  if (e.target === modalPagarCompra) modalPagarCompra.hidden = true;
});

document.getElementById("formPagarCompra").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  await api(`/api/compras/${compraAPagarId}/pagos`, {
    method: "POST",
    body: {
      importe: parseFloat(form.importe.value),
      cuenta_tesoreria_id: Number(form.cuenta_tesoreria_id.value),
      nota: form.nota.value || null
    },
    error: "No se pudo registrar el pago."
  });

  // Un pago saca plata de una cuenta y baja la deuda con el proveedor.
  await refrescar([cargarCompras(), cargarCaja(), cargarProveedores(), recargar("cuentasCorrientes")]);
  form.reset();
  modalPagarCompra.hidden = true;
  avisar("Pago registrado.", "ok");
});

/* ---------- Devoluciones a proveedor ---------- */

// Espejo de Devoluciones (venta), del lado de compras: revierte parte de
// una compra ya recibida, devolviéndole mercadería al proveedor. Se
// registra desde la ficha de la compra que revierte (botón "Devolver"),
// no desde un "+ Nuevo" en su propia pantalla.
let devolucionesProveedor = [];
let compraADevolverId = null;

function renderDevolucionesProveedor(lista) {
  const body = document.getElementById("devolucionesProveedorBody");

  document.getElementById("devueltoProveedorStrip").textContent = money(
    lista.reduce((acc, d) => acc + d.total, 0)
  );
  document.getElementById("reintegradoProveedorStrip").textContent = money(
    lista.filter((d) => d.reintegrada).reduce((acc, d) => acc + d.total, 0)
  );
  document.getElementById("creditoProveedorStrip").textContent = money(
    lista.filter((d) => !d.reintegrada).reduce((acc, d) => acc + d.total, 0)
  );

  if (lista.length === 0) {
    if (filtrosDevolucionesProveedor.filtros.length > 0) {
      body.innerHTML = filaVaciaFiltrada(7);
      body.querySelector(".tabla-vacia-limpiar").addEventListener("click", () => filtrosDevolucionesProveedor.limpiar());
    } else {
      body.innerHTML = filaVacia(7, "Todavía no hay devoluciones a proveedor registradas.");
    }
    return;
  }

  body.innerHTML = lista
    .map(
      (d) => `
    <tr class="fila-clickeable" data-id="${d.id}">
      <td data-label="N°" class="mono">#${d.id}</td>
      <td data-label="Proveedor">${esc(d.proveedor)}</td>
      <td data-label="Productos" class="celda-wrap">${esc(d.items_resumen || "—")}</td>
      <td data-label="Fecha">${esc(fechaAR(d.fecha))}</td>
      <td data-label="Total" class="align-right mono">${money(d.total)}</td>
      <td data-label="Plata"><span class="status ${d.reintegrada ? "status-cobrado" : "status-pendiente"}">${
        d.reintegrada ? "Reintegrada" : "Crédito a favor"
      }</span></td>
      <td data-label="">${
        d.tiene_nota_credito ? `<span class="status status-cobrado">Con nota de crédito</span>` : ""
      }</td>
    </tr>`
    )
    .join("");

  body.querySelectorAll("tr[data-id]").forEach((tr) => {
    tr.addEventListener("click", () => abrirFichaDevolucionProveedor(Number(tr.dataset.id)));
  });
}

// Igual que Devoluciones (venta): las anuladas no se muestran en el
// listado principal (solo en la papelera), así que ni entran en los
// totales del strip.
function filtrarDevolucionesProveedor() {
  const activas = devolucionesProveedor
    .filter((d) => d.estado !== "anulada")
    .map((d) => ({ ...d, reintegrada_txt: d.reintegrada ? "si" : "no" }));
  renderDevolucionesProveedor(
    filtrosDevolucionesProveedor.aplicar(activas)
  );
}

const filtrosDevolucionesProveedor = crearFiltros(
  "filtrosDevolucionesProveedor",
  [
    { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
    { clave: "proveedor", etiqueta: "Proveedor", tipo: "texto" },
    { clave: "items_resumen", etiqueta: "Productos", tipo: "texto" },
    { clave: "total", etiqueta: "Total", tipo: "numero" },
    {
      clave: "reintegrada_txt",
      etiqueta: "Plata",
      tipo: "select",
      opciones: [
        { valor: "si", texto: "Reintegrada" },
        { valor: "no", texto: "Crédito a favor" }
      ]
    },
    { clave: "motivo", etiqueta: "Motivo", tipo: "texto" }
  ],
  filtrarDevolucionesProveedor
);

async function cargarDevolucionesProveedor() {
  // Mismo motivo que cargarCompras(): es el reverso de una compra, se
  // valoriza al costo, admin-only en el servidor, y corre en el boot.
  if (!esAdmin()) return;
  tablaCargando("devolucionesProveedorBody", 7);
  devolucionesProveedor = await api("/api/devoluciones-proveedor");
  filtrarDevolucionesProveedor();
  renderPapelera();
}

/* --- Ficha --- */

async function abrirFichaDevolucionProveedor(id) {
  const d = await api(`/api/devoluciones-proveedor/${id}`, {
    error: "No se pudo cargar la devolución."
  });

  document.getElementById("fichaDevolucionProveedorTitulo").textContent = `Devolución a proveedor #${d.id}`;
  document.getElementById("fichaDevolucionProveedorTotal").textContent = money(d.total);

  const campos = [
    ["Proveedor", d.proveedor],
    ["Fecha", fechaAR(d.fecha)],
    ["Compra de origen", `Compra #${d.compra_id}`],
    ["Motivo", d.motivo],
    ["Plata", d.reintegrada ? `Reintegrada por ${d.cuenta}` : "Crédito con el proveedor"],
    ["Nota de crédito del proveedor", d.nota_credito_proveedor_numero],
    ["Estado", d.estado === "anulada" ? badge("status-vencido", "Anulada") : badge("status-cobrado", "Activa")]
  ];
  document.getElementById("fichaDevolucionProveedorDatos").innerHTML = camposFicha(campos);

  const acciones = document.getElementById("fichaDevolucionProveedorAcciones");
  const botones = [
    `<button type="button" class="btn btn-secundario" id="btnVerCompraDevolucionProveedor">Ver la compra #${d.compra_id}</button>`
  ];
  if (d.estado !== "anulada") {
    if (d.tiene_nota_credito) {
      botones.push(`<span class="status status-cobrado">Con nota de crédito</span>`);
    } else {
      botones.push(
        `<button type="button" class="btn btn-secundario" id="btnNotaCreditoDevolucionProveedor">Asociar nota de crédito</button>`
      );
      botones.push(
        `<button type="button" class="btn-icon-danger" id="btnAnularDevolucionProveedor" title="Anular devolución" aria-label="Anular devolución">${ICONO_TACHO}</button>`
      );
    }
  }
  acciones.innerHTML = botones.join(" ");

  acciones
    .querySelector("#btnVerCompraDevolucionProveedor")
    .addEventListener("click", () => abrirFichaCompra(d.compra_id));

  const btnNotaCredito = acciones.querySelector("#btnNotaCreditoDevolucionProveedor");
  if (btnNotaCredito) {
    btnNotaCredito.addEventListener("click", () => {
      devolucionProveedorANotaCreditoId = d.id;
      document.getElementById("formNotaCreditoProveedor").reset();
      modalNotaCreditoProveedor.hidden = false;
    });
  }

  const btnAnular = acciones.querySelector("#btnAnularDevolucionProveedor");
  if (btnAnular) {
    btnAnular.addEventListener("click", async () => {
      if (
        !(await confirmar({
          cuerpo: "¿Anular esta devolución? El stock y la cuenta corriente vuelven a como estaban.",
          aceptar: "Anular devolución",
          destructivo: true
        }))
      )
        return;
      await api(`/api/devoluciones-proveedor/${d.id}/anular`, {
        method: "POST",
        error: "No se pudo anular la devolución."
      });
      avisar(`Devolución #${d.id} anulada.`, "ok");
      await refrescar([
        cargarDevolucionesProveedor(),
        cargarCompras(),
        cargarStock(),
        cargarProductos(),
        cargarProveedores(),
        cargarCaja(),
        recargar("cuentasCorrientes"),
        cargarPanelResumen(),
        cargarReporteStock()
      ]);
      await abrirFichaDevolucionProveedor(d.id);
    });
  }

  document.getElementById("fichaDevolucionProveedorItems").innerHTML = d.items
    .map(
      (i) => `
    <tr>
      <td data-label="Producto">${esc(i.producto)}</td>
      <td data-label="Cantidad" class="align-right mono">${numero(i.cantidad)}</td>
      <td data-label="Precio unit." class="align-right mono">${money(i.precio_unitario)}</td>
      <td data-label="Subtotal" class="align-right mono">${money(i.subtotal)}</td>
    </tr>`
    )
    .join("");

  mostrarVista("devolucion-proveedor-detalle", { titulo: `Devolución a proveedor #${d.id}` });
}

document
  .getElementById("btnVolverDevolucionesProveedor")
  .addEventListener("click", () => mostrarVista("devoluciones-proveedor"));

/* --- Modal: registrar devolución a proveedor (se abre desde la ficha de la compra) --- */

const modalDevolucionProveedor = document.getElementById("modalDevolucionProveedor");
const devolucionProveedorItemsEl = document.getElementById("devolucionProveedorItems");

function actualizarTotalDevolucionProveedor() {
  let total = 0;
  devolucionProveedorItemsEl.querySelectorAll(".item-row-devolucion").forEach((fila) => {
    const cantidad = Number(fila.querySelector(".devolucion-cantidad").value) || 0;
    const precio = Number(fila.dataset.precio);
    total += cantidad * precio;
  });
  document.getElementById("devolucionProveedorTotal").textContent = money(total);
}

// La lista de Compras (GET /api/compras) no trae los items con detalle, así
// que hace falta traer la ficha completa (GET /api/compras/:id) para saber
// cuánto queda disponible para devolver de cada renglón.
async function abrirModalDevolucionProveedor(compraId) {
  compraADevolverId = compraId;
  const compra = await api(`/api/compras/${compraId}`, {
    error: "No se pudo cargar la compra."
  });
  document.getElementById(
    "modalDevolucionProveedorTitulo"
  ).textContent = `Registrar devolución — Compra #${compraId}`;

  devolucionProveedorItemsEl.innerHTML = "";
  for (const item of compra.items) {
    if (item.disponible_devolucion <= 0) continue;
    const fila = document.createElement("div");
    fila.className = "item-row item-row-devolucion";
    fila.dataset.compraItemId = item.id;
    fila.dataset.precio = item.precio_unitario;
    fila.innerHTML = `
      <span class="devolucion-producto">${esc(item.producto)}${
        item.combinacion ? ` (${esc(item.combinacion)})` : ""
      } <span class="mono" style="color: var(--ink-muted)">(compradas: ${numero(
        item.cantidad
      )}, disponibles: ${numero(item.disponible_devolucion)})</span></span>
      <input type="number" class="devolucion-cantidad" placeholder="Cant." step="1" min="0" max="${esc(item.disponible_devolucion)}" value="0" />
    `;
    fila.querySelector(".devolucion-cantidad").addEventListener("input", actualizarTotalDevolucionProveedor);
    devolucionProveedorItemsEl.appendChild(fila);
  }

  document.getElementById("formDevolucionProveedor").reset();
  document.getElementById("devolucionProveedorReintegrar").checked = false;
  document.getElementById("devolucionProveedorCuentaLabel").hidden = true;
  actualizarTotalDevolucionProveedor();
  modalDevolucionProveedor.hidden = false;
}

document.getElementById("btnDevolverCompra").addEventListener("click", async () => {
  await abrirModalDevolucionProveedor(compraFichaId);
});

document.getElementById("modalDevolucionProveedorClose").addEventListener("click", () => {
  modalDevolucionProveedor.hidden = true;
});
modalDevolucionProveedor.addEventListener("click", (e) => {
  if (e.target === modalDevolucionProveedor) modalDevolucionProveedor.hidden = true;
});

document.getElementById("devolucionProveedorReintegrar").addEventListener("change", (e) => {
  const label = document.getElementById("devolucionProveedorCuentaLabel");
  label.hidden = !e.target.checked;
  if (e.target.checked) {
    poblarSelectCuentas(label.querySelector("select"));
  }
});

document.getElementById("formDevolucionProveedor").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  const items = [...devolucionProveedorItemsEl.querySelectorAll(".item-row-devolucion")]
    .map((fila) => ({
      compra_item_id: Number(fila.dataset.compraItemId),
      cantidad: Number(fila.querySelector(".devolucion-cantidad").value) || 0
    }))
    .filter((i) => i.cantidad > 0);

  if (items.length === 0) {
    avisar("Ingresá una cantidad a devolver de al menos un producto.", "atencion");
    return;
  }

  const reintegrar = document.getElementById("devolucionProveedorReintegrar").checked;

  await api("/api/devoluciones-proveedor", {
    method: "POST",
    body: {
      compra_id: compraADevolverId,
      items,
      motivo: form.motivo.value || null,
      cuenta_tesoreria_id: reintegrar ? Number(form.cuenta_tesoreria_id.value) : null
    },
    error: "No se pudo registrar la devolución."
  });
  avisar("Devolución registrada.", "ok");

  // Toca stock, costo, cuenta corriente y caja (si hubo reintegro).
  await refrescar([
    cargarDevolucionesProveedor(),
    cargarCompras(),
    cargarStock(),
    cargarProductos(),
    cargarProveedores(),
    cargarCaja(),
    recargar("cuentasCorrientes"),
    cargarPanelResumen(),
    cargarReporteStock()
  ]);
  modalDevolucionProveedor.hidden = true;
  await abrirFichaCompra(compraADevolverId);
});

/* --- Modal: asociar nota de crédito del proveedor (se abre desde la ficha de la devolución) --- */

const modalNotaCreditoProveedor = document.getElementById("modalNotaCreditoProveedor");
let devolucionProveedorANotaCreditoId = null;

document.getElementById("modalNotaCreditoProveedorClose").addEventListener("click", () => {
  modalNotaCreditoProveedor.hidden = true;
});
modalNotaCreditoProveedor.addEventListener("click", (e) => {
  if (e.target === modalNotaCreditoProveedor) modalNotaCreditoProveedor.hidden = true;
});

document.getElementById("formNotaCreditoProveedor").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  await api(`/api/devoluciones-proveedor/${devolucionProveedorANotaCreditoId}/nota-credito`, {
    method: "POST",
    body: { numero: form.numero.value },
    error: "No se pudo guardar la nota de crédito."
  });

  await refrescar([cargarDevolucionesProveedor()]);
  modalNotaCreditoProveedor.hidden = true;
  await abrirFichaDevolucionProveedor(devolucionProveedorANotaCreditoId);
  avisar("Nota de crédito guardada.", "ok");
});

/* ---------- Clientes (CRM) ---------- */

let clientes = [];
let clienteEditandoId = null;
let clienteFichaId = null;

const selClientes = crearSeleccion("clientesBody");

function renderClientes(lista) {
  const body = document.getElementById("clientesBody");
  body.innerHTML = "";
  selClientes.sincronizar(lista);

  if (lista.length === 0) {
    if (filtrosClientes.filtros.length > 0) {
      body.innerHTML = filaVaciaFiltrada(selClientes.colspan(5));
      body.querySelector(".tabla-vacia-limpiar").addEventListener("click", () => filtrosClientes.limpiar());
    } else {
      body.innerHTML = filaVacia(selClientes.colspan(5), "Todavía no hay clientes cargados.", { accionTexto: "+ Nuevo cliente", accionId: "btnNuevoCliente" });
    }
    return;
  }

  for (const c of lista) {
    const tr = document.createElement("tr");
    tr.className = "fila-clickeable";
    const contacto = [c.telefono, c.email].filter(Boolean).join(" · ") || "—";
    tr.innerHTML = `
      ${selClientes.celda(c.id)}
      <td data-label="Nombre">${esc(c.nombre)}</td>
      <td data-label="Contacto">${esc(contacto)}</td>
      <td data-label="Compras" class="align-right mono">${numero(c.cantidad_compras)}</td>
      <td data-label="Total gastado" class="align-right mono">${money(c.total_gastado)}</td>
      <td data-label="Deuda" class="align-right mono">${money(c.deuda)}</td>
      <td data-label="">${botonEditarFila("btn-editar-cliente", c.id, "cliente")}</td>
    `;
    tr.addEventListener("click", (e) => {
      if (e.target.closest("button, a, input, label, select, textarea, .col-sel")) return;
      abrirFichaCliente(c.id);
    });
    body.appendChild(tr);
  }

  // El objeto de la lista ya trae todos los campos del modal (la API hace
  // SELECT clientes.*), así que no hace falta ir a buscarlo de nuevo.
  body.querySelectorAll(".btn-editar-cliente").forEach((btn) => {
    btn.addEventListener("click", () => {
      abrirModalCliente(clientes.find((c) => c.id === Number(btn.dataset.id)));
    });
  });
}

function poblarDatalistClientes() {
  document.getElementById("clientesSugeridos").innerHTML = clientes
    .map((c) => `<option value="${esc(c.nombre)}"></option>`)
    .join("");
}

async function cargarClientes() {
  tablaCargando("clientesBody", selClientes.colspan(5));
  clientes = await api("/api/clientes");
  filtrarClientes();
  poblarDatalistClientes();
}

function filtrarClientes() {
  const q = document.getElementById("clientesSearch").value.trim().toLowerCase();
  const porTexto = clientes.filter((c) =>
    [c.nombre, c.email, c.telefono].some((campo) => (campo ?? "").toLowerCase().includes(q))
  );
  renderClientes(filtrosClientes.aplicar(porTexto));
}

// Misma expresión que filtrarClientes (búsqueda + filtros + orden).
function listaClientesVisible() {
  const q = document.getElementById("clientesSearch").value.trim().toLowerCase();
  const porTexto = clientes.filter((c) =>
    [c.nombre, c.email, c.telefono].some((campo) => (campo ?? "").toLowerCase().includes(q))
  );
  return filtrosClientes.aplicar(porTexto);
}

const COLUMNAS_CSV_CLIENTES = [
  { titulo: "Nombre", valor: (c) => c.nombre },
  { titulo: "Teléfono", valor: (c) => c.telefono },
  { titulo: "Email", valor: (c) => c.email },
  { titulo: "Compras", valor: (c) => c.cantidad_compras },
  { titulo: "Total gastado", valor: (c) => c.total_gastado },
  { titulo: "Deuda", valor: (c) => c.deuda }
];

montarBarraSeleccion(selClientes, [
  {
    etiqueta: "Exportar CSV",
    onClick: (ids) => {
      const idsSet = new Set(ids);
      descargarCSV("nexo-clientes-seleccion", COLUMNAS_CSV_CLIENTES, listaClientesVisible().filter((c) => idsSet.has(c.id)));
    }
  }
]);

// "Deuda mayor que 0" reemplaza al viejo select de sí/no: el mismo campo
// ahora sirve para pedir quién debe, quién debe más de cierto monto, o
// quién está al día.
const filtrosClientes = crearFiltros(
  "filtrosClientes",
  [
    { clave: "nombre", etiqueta: "Nombre", tipo: "texto" },
    { clave: "deuda", etiqueta: "Deuda", tipo: "numero" },
    { clave: "total_gastado", etiqueta: "Total gastado", tipo: "numero" },
    { clave: "cantidad_compras", etiqueta: "Cantidad de compras", tipo: "numero" },
    { clave: "ultima_compra", etiqueta: "Última compra", tipo: "fecha" },
    { clave: "email", etiqueta: "Email", tipo: "texto" },
    { clave: "telefono", etiqueta: "Teléfono", tipo: "texto" },
    { clave: "documento", etiqueta: "CUIT / DNI", tipo: "texto" }
  ],
  filtrarClientes
);

document.getElementById("clientesSearch").addEventListener("input", filtrarClientes);

async function abrirFichaCliente(id) {
  clienteFichaId = id;
  const cliente = await api(`/api/clientes/${id}`);

  document.getElementById("fichaClienteNombre").textContent = cliente.nombre;
  document.getElementById("fichaClienteTotal").textContent = money(cliente.total_gastado);
  document.getElementById("fichaClienteCompras").textContent = numero(cliente.cantidad_compras);
  document.getElementById("fichaClienteDeuda").textContent = money(cliente.deuda);

  const campos = [
    ["Email", cliente.email],
    ["Teléfono", cliente.telefono],
    ["Dirección", cliente.direccion],
    ["CUIT / DNI", cliente.documento],
    ["Última compra", fechaAR(cliente.ultima_compra)],
    ["Notas", cliente.notas]
  ];
  document.getElementById("fichaClienteDatos").innerHTML = camposFicha(campos);

  const historialBody = document.getElementById("fichaClienteHistorial");
  historialBody.innerHTML =
    cliente.historial.length === 0
      ? filaVacia(4, "Este cliente todavía no tiene compras.")
      : cliente.historial
          .map((v) => {
            const anulada = v.estado === "anulada";
            return `
        <tr class="${anulada ? "fila-anulada" : ""}">
          <td data-label="N°" class="mono">#${v.id}</td>
          <td data-label="Fecha">${esc(fechaAR(v.fecha))}</td>
          <td data-label="Total" class="align-right mono">${money(v.total)}</td>
          <td data-label="Cobro"><span class="status ${
            anulada ? "status-vencido" : ESTADO_COBRO_CLASE[v.estado_cobro]
          }">${anulada ? "Anulada" : ESTADO_COBRO_LABEL[v.estado_cobro]}</span></td>
        </tr>`;
          })
          .join("");

  // Sus consultas, sus trabajos y sus abonos los pinta cada dominio (hist.
  // §83, §90).
  invocar("pintar:crmDelCliente", cliente);
  invocar("pintar:trabajosDelCliente", cliente);
  invocar("pintar:abonosDelCliente", cliente);
  mostrarVista("cliente-detalle", { titulo: cliente.nombre });
}

const modalCliente = document.getElementById("modalCliente");

function abrirModalCliente(cliente = null) {
  clienteEditandoId = cliente?.id ?? null;
  const form = document.getElementById("formCliente");
  document.getElementById("modalClienteTitulo").textContent = cliente ? "Editar cliente" : "Nuevo cliente";
  form.nombre.value = cliente?.nombre ?? "";
  form.email.value = cliente?.email ?? "";
  form.telefono.value = cliente?.telefono ?? "";
  form.direccion.value = cliente?.direccion ?? "";
  form.documento.value = cliente?.documento ?? "";
  form.notas.value = cliente?.notas ?? "";
  poblarSelectListasPrecios('#formCliente [name="lista_precio_id"]', { conPredeterminada: true });
  form.lista_precio_id.value = cliente?.lista_precio_id ?? "";
  poblarSelectCondicionPago('#formCliente [name="condicion_pago"]');
  form.condicion_pago.value = cliente?.condicion_pago ?? "";
  modalCliente.hidden = false;
}

document.getElementById("btnNuevoCliente").addEventListener("click", () => abrirModalCliente());
document.getElementById("btnEditarCliente").addEventListener("click", async () => {
  const cliente = await api(`/api/clientes/${clienteFichaId}`);
  abrirModalCliente(cliente);
});
document.getElementById("modalClienteClose").addEventListener("click", () => {
  modalCliente.hidden = true;
});
modalCliente.addEventListener("click", (e) => {
  if (e.target === modalCliente) modalCliente.hidden = true;
});
document.getElementById("btnVolverClientes").addEventListener("click", () => mostrarVista("clientes"));

document.getElementById("formCliente").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const datos = {
    nombre: form.nombre.value,
    email: form.email.value || null,
    telefono: form.telefono.value || null,
    direccion: form.direccion.value || null,
    documento: form.documento.value || null,
    notas: form.notas.value || null,
    lista_precio_id: form.lista_precio_id.value || null,
    condicion_pago: form.condicion_pago.value || null
  };

  await api(clienteEditandoId ? `/api/clientes/${clienteEditandoId}` : "/api/clientes", {
    method: clienteEditandoId ? "PATCH" : "POST",
    body: datos,
    error: "No se pudo guardar el cliente."
  });

  const eraEdicion = clienteEditandoId !== null;
  await refrescar([cargarClientes()]);
  if (eraEdicion && clienteFichaId) await abrirFichaCliente(clienteFichaId);
  form.reset();
  modalCliente.hidden = true;
  avisar(eraEdicion ? "Cliente actualizado." : "Cliente creado.", "ok");
});

/* ---------- Proveedores ---------- */

// Espejo de Clientes: misma lista, misma ficha, mismo modal. La diferencia
// conceptual es de qué lado está la plata — al cliente le vendemos y nos
// debe, al proveedor le compramos y le debemos.
let proveedorEditandoId = null;
let proveedorFichaId = null;

const selProveedores = crearSeleccion("proveedoresBody");

function renderProveedores(lista) {
  const body = document.getElementById("proveedoresBody");
  body.innerHTML = "";
  selProveedores.sincronizar(lista);

  if (lista.length === 0) {
    if (filtrosProveedores.filtros.length > 0) {
      body.innerHTML = filaVaciaFiltrada(selProveedores.colspan(6));
      body.querySelector(".tabla-vacia-limpiar").addEventListener("click", () => filtrosProveedores.limpiar());
    } else {
      body.innerHTML = filaVacia(selProveedores.colspan(6), "Todavía no hay proveedores cargados.", { accionTexto: "+ Nuevo proveedor", accionId: "btnNuevoProveedor" });
    }
    return;
  }

  for (const p of lista) {
    const tr = document.createElement("tr");
    tr.className = "fila-clickeable";
    const contacto = [p.telefono, p.email].filter(Boolean).join(" · ") || "—";
    tr.innerHTML = `
      ${selProveedores.celda(p.id)}
      <td data-label="Nombre">${esc(p.nombre)}</td>
      <td data-label="Contacto">${esc(contacto)}</td>
      <td data-label="Compras" class="align-right mono">${numero(p.cantidad_compras)}</td>
      <td data-label="Total comprado" class="align-right mono">${money(p.total_comprado)}</td>
      <td data-label="Deuda" class="align-right mono">${money(p.deuda)}</td>
      <td data-label="">${botonEditarFila("btn-editar-proveedor", p.id, "proveedor")}</td>
    `;
    tr.addEventListener("click", (e) => {
      if (e.target.closest("button, a, input, label, select, textarea, .col-sel")) return;
      abrirFichaProveedor(p.id);
    });
    body.appendChild(tr);
  }

  body.querySelectorAll(".btn-editar-proveedor").forEach((btn) => {
    btn.addEventListener("click", () => {
      abrirModalProveedor(proveedores.find((p) => p.id === Number(btn.dataset.id)));
    });
  });
}

async function cargarProveedores() {
  tablaCargando("proveedoresBody", selProveedores.colspan(6));
  fijarProveedores(await api("/api/proveedores"));
  filtrarProveedores();
}

function filtrarProveedores() {
  const q = document.getElementById("proveedoresSearch").value.trim().toLowerCase();
  const porTexto = proveedores.filter((p) =>
    [p.nombre, p.email, p.telefono].some((campo) => (campo ?? "").toLowerCase().includes(q))
  );
  renderProveedores(filtrosProveedores.aplicar(porTexto));
}

// Misma expresión que filtrarProveedores.
function listaProveedoresVisible() {
  const q = document.getElementById("proveedoresSearch").value.trim().toLowerCase();
  const porTexto = proveedores.filter((p) =>
    [p.nombre, p.email, p.telefono].some((campo) => (campo ?? "").toLowerCase().includes(q))
  );
  return filtrosProveedores.aplicar(porTexto);
}

const COLUMNAS_CSV_PROVEEDORES = [
  { titulo: "Nombre", valor: (p) => p.nombre },
  { titulo: "Teléfono", valor: (p) => p.telefono },
  { titulo: "Email", valor: (p) => p.email },
  { titulo: "Compras", valor: (p) => p.cantidad_compras },
  { titulo: "Total comprado", valor: (p) => p.total_comprado },
  { titulo: "Deuda", valor: (p) => p.deuda }
];

montarBarraSeleccion(selProveedores, [
  {
    etiqueta: "Exportar CSV",
    onClick: (ids) => {
      const idsSet = new Set(ids);
      descargarCSV("nexo-proveedores-seleccion", COLUMNAS_CSV_PROVEEDORES, listaProveedoresVisible().filter((p) => idsSet.has(p.id)));
    }
  }
]);

const filtrosProveedores = crearFiltros(
  "filtrosProveedores",
  [
    { clave: "nombre", etiqueta: "Nombre", tipo: "texto" },
    { clave: "deuda", etiqueta: "Deuda", tipo: "numero" },
    { clave: "total_comprado", etiqueta: "Total comprado", tipo: "numero" },
    { clave: "cantidad_compras", etiqueta: "Cantidad de compras", tipo: "numero" },
    { clave: "ultima_compra", etiqueta: "Última compra", tipo: "fecha" },
    { clave: "email", etiqueta: "Email", tipo: "texto" },
    { clave: "telefono", etiqueta: "Teléfono", tipo: "texto" },
    { clave: "documento", etiqueta: "CUIT / DNI", tipo: "texto" }
  ],
  filtrarProveedores
);

document.getElementById("proveedoresSearch").addEventListener("input", filtrarProveedores);

async function abrirFichaProveedor(id) {
  proveedorFichaId = id;
  const proveedor = await api(`/api/proveedores/${id}`, {
    error: "No se pudo cargar el proveedor."
  });

  document.getElementById("fichaProveedorNombre").textContent = proveedor.nombre;
  document.getElementById("fichaProveedorTotal").textContent = money(proveedor.total_comprado);
  document.getElementById("fichaProveedorCompras").textContent = numero(proveedor.cantidad_compras);
  document.getElementById("fichaProveedorDeuda").textContent = money(proveedor.deuda);

  const campos = [
    ["Email", proveedor.email],
    ["Teléfono", proveedor.telefono],
    ["Dirección", proveedor.direccion],
    ["CUIT / DNI", proveedor.documento],
    ["Última compra", fechaAR(proveedor.ultima_compra)],
    ["Notas", proveedor.notas]
  ];
  document.getElementById("fichaProveedorDatos").innerHTML = camposFicha(campos);

  const historialBody = document.getElementById("fichaProveedorHistorial");
  historialBody.innerHTML =
    proveedor.historial.length === 0
      ? filaVacia(4, "Este proveedor todavía no tiene compras.")
      : proveedor.historial
          .map((c) => {
            const anulada = c.estado === "anulada";
            const borrador = c.estado === "borrador";
            const etiqueta = anulada ? "Anulada" : borrador ? "Borrador" : ESTADO_PAGO_LABEL[c.estado_pago];
            const clase = anulada
              ? "status-vencido"
              : borrador
              ? ""
              : ESTADO_PAGO_CLASE[c.estado_pago];
            return `
        <tr class="${anulada ? "fila-anulada" : ""}">
          <td data-label="N°" class="mono">#${c.id}</td>
          <td data-label="Fecha">${esc(fechaAR(c.fecha))}</td>
          <td data-label="Total" class="align-right mono">${money(c.total)}</td>
          <td data-label="Pago"><span class="status ${clase}">${etiqueta}</span></td>
        </tr>`;
          })
          .join("");

  const pagosBody = document.getElementById("fichaProveedorPagos");
  pagosBody.innerHTML =
    proveedor.pagos.length === 0
      ? filaVacia(5, "Todavía no se le pagó nada a este proveedor.")
      : proveedor.pagos
          .map(
            (p) => `
        <tr>
          <td data-label="Fecha">${esc(fechaAR(p.fecha))}</td>
          <td data-label="Compra" class="mono">#${p.compra_id}</td>
          <td data-label="Cuenta">${esc(p.cuenta)}</td>
          <td data-label="Importe" class="align-right mono">${money(p.importe)}</td>
          <td data-label="Nota">${esc(p.nota || "—")}</td>
        </tr>`
          )
          .join("");

  mostrarVista("proveedor-detalle", { titulo: proveedor.nombre });
}

const modalProveedor = document.getElementById("modalProveedor");

function abrirModalProveedor(proveedor = null) {
  proveedorEditandoId = proveedor?.id ?? null;
  const form = document.getElementById("formProveedor");
  document.getElementById("modalProveedorTitulo").textContent = proveedor
    ? "Editar proveedor"
    : "Nuevo proveedor";
  form.nombre.value = proveedor?.nombre ?? "";
  form.email.value = proveedor?.email ?? "";
  form.telefono.value = proveedor?.telefono ?? "";
  form.direccion.value = proveedor?.direccion ?? "";
  form.documento.value = proveedor?.documento ?? "";
  form.notas.value = proveedor?.notas ?? "";
  poblarSelectCondicionPago('#formProveedor [name="condicion_pago"]');
  form.condicion_pago.value = proveedor?.condicion_pago ?? "";
  modalProveedor.hidden = false;
}

document.getElementById("btnNuevoProveedor").addEventListener("click", () => abrirModalProveedor());
document.getElementById("btnEditarProveedor").addEventListener("click", () => {
  abrirModalProveedor(proveedores.find((p) => p.id === proveedorFichaId));
});
document.getElementById("modalProveedorClose").addEventListener("click", () => {
  modalProveedor.hidden = true;
});
modalProveedor.addEventListener("click", (e) => {
  if (e.target === modalProveedor) modalProveedor.hidden = true;
});
document.getElementById("btnVolverProveedores").addEventListener("click", () =>
  mostrarVista("proveedores")
);

document.getElementById("formProveedor").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const datos = {
    nombre: form.nombre.value,
    email: form.email.value || null,
    telefono: form.telefono.value || null,
    direccion: form.direccion.value || null,
    documento: form.documento.value || null,
    notas: form.notas.value || null,
    condicion_pago: form.condicion_pago.value || null
  };

  await api(proveedorEditandoId ? `/api/proveedores/${proveedorEditandoId}` : "/api/proveedores", {
    method: proveedorEditandoId ? "PATCH" : "POST",
    body: datos,
    error: "No se pudo guardar el proveedor."
  });

  const eraEdicion = proveedorEditandoId !== null;
  await refrescar([cargarProveedores()]);
  if (eraEdicion && proveedorFichaId) await abrirFichaProveedor(proveedorFichaId);
  form.reset();
  modalProveedor.hidden = true;
  avisar(eraEdicion ? "Proveedor actualizado." : "Proveedor creado.", "ok");
});

/* ---------- Caja / Tesorería ---------- */

// Dónde está la plata. El saldo de cada cuenta lo calcula el backend como
// saldo_inicial + movimientos: acá nunca se guarda ni se edita un saldo,
// solo se muestra lo que se reconstruye del historial.
function renderCuentasTesoreria(cuentas) {
  const body = document.getElementById("cajaCuentasBody");
  const TIPO_LABEL = {
    efectivo: "Efectivo",
    banco: "Banco",
    mercadopago: "Mercado Pago",
    otro: "Otro"
  };

  body.innerHTML = cuentas
    .map(
      (c) => `
    <tr>
      <td data-label="Cuenta">${esc(c.nombre)}</td>
      <td data-label="Tipo">${esc(TIPO_LABEL[c.tipo] ?? c.tipo)}</td>
      <td data-label="Saldo inicial" class="align-right mono">${money(c.saldo_inicial)}</td>
      <td data-label="Saldo actual" class="align-right mono ${
        c.saldo < 0 ? "saldo-negativo" : ""
      }">${money(c.saldo)}</td>
      <td data-label="">${botonEditarFila("btn-editar-cuenta", c.id, "cuenta")}</td>
    </tr>`
    )
    .join("");

  body.querySelectorAll(".btn-editar-cuenta").forEach((btn) => {
    btn.addEventListener("click", () => {
      abrirModalCuenta(cuentasTesoreria.find((c) => c.id === Number(btn.dataset.id)));
    });
  });
}

function renderMovimientosTesoreria(movimientos) {
  const body = document.getElementById("cajaMovimientosBody");

  if (movimientos.length === 0) {
    if (filtrosCaja.filtros.length > 0) {
      body.innerHTML = filaVaciaFiltrada(4);
      body.querySelector(".tabla-vacia-limpiar").addEventListener("click", () => filtrosCaja.limpiar());
    } else {
      body.innerHTML = filaVacia(4, "Todavía no hay movimientos de caja.", { accionTexto: "+ Movimiento", accionId: "btnMovimientoTesoreria" });
    }
    return;
  }

  body.innerHTML = movimientos
    .map((m) => {
      // Cada origen se explica distinto: el cobro y el pago apuntan a su
      // documento, la transferencia a la otra cuenta, y el manual solo
      // tiene el concepto que escribió el usuario.
      let concepto;
      if (m.origen === "cobro") {
        concepto = `Cobro de venta #${m.venta_id}`;
      } else if (m.origen === "pago") {
        concepto = `Pago de compra #${m.compra_id}`;
      } else if (m.origen === "transferencia") {
        const direccion = m.tipo === "egreso" ? "a" : "desde";
        concepto = `Transferencia ${direccion} ${m.contraparte ?? "—"}`;
      } else {
        concepto = m.concepto || "Movimiento manual";
      }
      // Solo cobro/pago/transferencia calcularon una etiqueta separada de
      // m.concepto arriba — a esos sí les suma la nota como extra. Los
      // demás orígenes (manual, gasto, devolución...) ya USARON m.concepto
      // como etiqueta principal en el else de arriba: sumarlo de nuevo acá
      // lo duplicaba ("Primero · Primero").
      if (["cobro", "pago", "transferencia"].includes(m.origen) && m.concepto) {
        concepto += ` · ${m.concepto}`;
      }

      const signo = m.tipo === "ingreso" ? "+" : "-";
      return `
        <tr>
          <td data-label="Fecha">${esc(fechaAR(m.fecha))}</td>
          <td data-label="Cuenta">${esc(m.cuenta)}</td>
          <td data-label="Concepto">${esc(concepto)}</td>
          <td data-label="Importe" class="align-right mono ${
            m.tipo === "egreso" ? "saldo-negativo" : ""
          }">${signo}${money(m.importe)}</td>
        </tr>`;
    })
    .join("");
}

// Los filtros de esta pantalla van al servidor, no en memoria: la consulta
// de movimientos tiene tope de filas, así que filtrar acá sobre una lista
// ya recortada devolvería resultados incompletos sin avisar.
const filtrosCaja = crearFiltros(
  "filtrosCaja",
  [
    { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
    { clave: "cuenta_tesoreria_id", etiqueta: "Cuenta", tipo: "select", opciones: [] },
    {
      clave: "tipo",
      etiqueta: "Tipo",
      tipo: "select",
      opciones: [
        { valor: "ingreso", texto: "Ingreso" },
        { valor: "egreso", texto: "Egreso" }
      ]
    },
    {
      clave: "origen",
      etiqueta: "Origen",
      tipo: "select",
      opciones: [
        { valor: "cobro", texto: "Cobro de venta" },
        { valor: "pago", texto: "Pago de compra" },
        { valor: "gasto", texto: "Gasto" },
        { valor: "manual", texto: "Manual" },
        { valor: "transferencia", texto: "Transferencia" }
      ]
    },
    { clave: "importe", etiqueta: "Importe", tipo: "numero" },
    { clave: "concepto", etiqueta: "Concepto", tipo: "texto" }
  ],
  () => renderMovimientosTesoreria(filtrosCaja.aplicar(movimientosCajaCache))
);

// El historial llega entero y se filtra acá, con el mismo motor que el
// resto de las pantallas (ver TOPE_MOVIMIENTOS en el backend).
let movimientosCajaCache = [];

async function cargarCaja() {
  tablaCargando("cajaMovimientosBody", 4);
  const [tesoreria, movimientos] = await Promise.all([
    api("/api/tesoreria"),
    api("/api/tesoreria/movimientos")
  ]);

  fijarCuentasTesoreria(tesoreria.cuentas);
  movimientosCajaCache = movimientos;

  document.getElementById("cajaTotal").textContent = money(tesoreria.total);
  document.getElementById("cajaIngresos").textContent = money(tesoreria.ingresos);
  document.getElementById("cajaEgresos").textContent = money(tesoreria.egresos);

  renderCuentasTesoreria(cuentasTesoreria);

  filtrosCaja.setOpciones(
    "cuenta_tesoreria_id",
    cuentasTesoreria.map((c) => ({ valor: c.id, texto: c.nombre }))
  );
  renderMovimientosTesoreria(filtrosCaja.aplicar(movimientosCajaCache));
}

/* --- Modal de cuenta (alta y edición) --- */

const modalCuenta = document.getElementById("modalCuenta");
let cuentaEditandoId = null;

function abrirModalCuenta(cuenta = null) {
  cuentaEditandoId = cuenta?.id ?? null;
  const form = document.getElementById("formCuenta");
  document.getElementById("modalCuentaTitulo").textContent = cuenta ? "Editar cuenta" : "Nueva cuenta";
  form.nombre.value = cuenta?.nombre ?? "";
  form.tipo.value = cuenta?.tipo ?? "efectivo";
  form.saldo_inicial.value = cuenta?.saldo_inicial ?? "";
  modalCuenta.hidden = false;
}

document.getElementById("btnNuevaCuenta").addEventListener("click", () => abrirModalCuenta());
document.getElementById("modalCuentaClose").addEventListener("click", () => {
  modalCuenta.hidden = true;
});
modalCuenta.addEventListener("click", (e) => {
  if (e.target === modalCuenta) modalCuenta.hidden = true;
});

document.getElementById("formCuenta").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  await api(cuentaEditandoId ? `/api/cuentas-tesoreria/${cuentaEditandoId}` : "/api/cuentas-tesoreria", {
    method: cuentaEditandoId ? "PATCH" : "POST",
    body: {
        nombre: form.nombre.value,
        tipo: form.tipo.value,
        saldo_inicial: form.saldo_inicial.value
      },
    error: "No se pudo guardar la cuenta."
  });

  const eraEdicion = cuentaEditandoId !== null;
  await refrescar([cargarCaja()]);
  form.reset();
  modalCuenta.hidden = true;
  avisar(eraEdicion ? "Cuenta actualizada." : "Cuenta creada.", "ok");
});

/* --- Modal de movimiento manual --- */

const modalMovimientoCaja = document.getElementById("modalMovimientoCaja");

document.getElementById("btnMovimientoTesoreria").addEventListener("click", () => {
  const form = document.getElementById("formMovimientoCaja");
  form.reset();
  poblarSelectCuentas(document.getElementById("movimientoCajaCuenta"));
  form.fecha.value = hoyISO();
  modalMovimientoCaja.hidden = false;
});
document.getElementById("modalMovimientoCajaClose").addEventListener("click", () => {
  modalMovimientoCaja.hidden = true;
});
modalMovimientoCaja.addEventListener("click", (e) => {
  if (e.target === modalMovimientoCaja) modalMovimientoCaja.hidden = true;
});

document.getElementById("formMovimientoCaja").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  await api("/api/tesoreria/movimientos", {
    method: "POST",
    body: {
      cuenta_tesoreria_id: Number(form.cuenta_tesoreria_id.value),
      tipo: form.tipo.value,
      importe: parseFloat(form.importe.value),
      fecha: form.fecha.value,
      concepto: form.concepto.value || null
    },
    error: "No se pudo registrar el movimiento."
  });

  await refrescar([cargarCaja()]);
  form.reset();
  modalMovimientoCaja.hidden = true;
  avisar("Movimiento registrado.", "ok");
});

/* --- Modal de transferencia --- */

const modalTransferencia = document.getElementById("modalTransferencia");

document.getElementById("btnTransferencia").addEventListener("click", () => {
  if (cuentasTesoreria.length < 2) {
    avisar("Necesitás al menos dos cuentas para poder transferir entre ellas.", "atencion");
    return;
  }
  const form = document.getElementById("formTransferencia");
  form.reset();
  // Origen y destino arrancan en cuentas distintas para que la primera
  // opción del formulario ya sea válida.
  poblarSelectCuentas(document.getElementById("transferenciaOrigen"), cuentasTesoreria[0].id);
  poblarSelectCuentas(document.getElementById("transferenciaDestino"), cuentasTesoreria[1].id);
  form.fecha.value = hoyISO();
  modalTransferencia.hidden = false;
});
document.getElementById("modalTransferenciaClose").addEventListener("click", () => {
  modalTransferencia.hidden = true;
});
modalTransferencia.addEventListener("click", (e) => {
  if (e.target === modalTransferencia) modalTransferencia.hidden = true;
});

document.getElementById("formTransferencia").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  await api("/api/tesoreria/transferencias", {
    method: "POST",
    body: {
      origen_id: Number(form.origen_id.value),
      destino_id: Number(form.destino_id.value),
      importe: parseFloat(form.importe.value),
      fecha: form.fecha.value,
      concepto: form.concepto.value || null
    },
    error: "No se pudo hacer la transferencia."
  });

  await refrescar([cargarCaja()]);
  form.reset();
  modalTransferencia.hidden = true;
  avisar("Transferencia registrada.", "ok");
});

/* ---------- Asistente flotante (operaciones por texto, CLAUDE.md §21) ---------- */
//
// No es una pantalla más: es un widget flotante (círculo abajo a la
// derecha) disponible desde cualquier vista, con un hilo de conversación
// tipo Notion/Canva AI — cada frase que se manda queda apilada en
// #asistenteHilo junto con su respuesta, y el hilo no se borra al
// confirmar u otro. Vive solo en memoria (no se persiste): una propuesta
// vieja apunta a precios/stock que pueden haber cambiado, así que no
// tiene sentido mostrarla como vigente después de recargar la página.
//
// Flujo por turno: interpretar (solo lectura, arma una propuesta) -> el
// usuario la revisa/edita en la tarjeta de ESE turno -> confirmar recién
// ejecuta. Como puede haber VARIAS tarjetas pendientes al mismo tiempo
// (una por turno), nada se busca por id global: cada tarjeta recibe su
// propio nodo raíz y resuelve todo con `raiz.querySelector(...)`, nunca
// `document.getElementById(...)` — evita que confirmar una tarjeta lea
// por accidente los campos de otra.
//
// Reusa a propósito los mismos helpers de fila de item que los modales de
// Venta y Compra (agregarFilaItemVenta/Compra, leerItemsVenta/Compra,
// totalItems, actualizarSubtotalFila) — ya reciben un contenedor
// explícito, así que ya eran seguros por tarjeta sin tocarlos — y
// poblarSelectCuentas para las cuentas de tesorería. Los caches globales
// (productos, clientes, proveedores y cuentasTesoreria de core/maestros.js,
// categoriasGasto de dominios/gastos.js) ya están cargados por la secuencia de arranque de más abajo en este
// archivo, así que no hace falta un fetch propio acá.

const ASISTENTE_ESTADO_CLASE = {
  resuelto: "status-cobrado",
  ambiguo: "status-pendiente",
  no_encontrado: "status-pendiente",
  no_dado: "status-vencido"
};

// `ref` es un objeto resuelto de la propuesta ({estado, valor,
// nombre_resuelto, id, candidatos}, ver resolverPropuesta en server.js).
// creaSiNoExiste: true para cliente/proveedor (y producto en una compra),
// que si no existen se dan de alta por nombre — en esos casos
// "no_encontrado" es informativo, no un problema.
function asistenteBadge(ref, { creaSiNoExiste = false } = {}) {
  if (!ref) return "";
  let texto;
  if (ref.estado === "resuelto") texto = "encontrado";
  else if (ref.estado === "ambiguo") texto = "hay varios, elegí uno";
  else if (ref.estado === "no_encontrado") texto = creaSiNoExiste ? "no existe, se va a crear" : "no existe";
  else texto = "falta";
  const clase = ref.estado === "no_encontrado" && !creaSiNoExiste ? "status-vencido" : ASISTENTE_ESTADO_CLASE[ref.estado];
  return `<span class="status ${clase}">${texto}</span>`;
}

function asistenteNotaCandidatos(candidatos) {
  return candidatos?.length
    ? `<p class="form-note">Coinciden: ${esc(candidatos.map((c) => c.nombre).join(", "))}</p>`
    : "";
}

/* --- Apertura/cierre del panel --- */

const asistenteLauncher = document.getElementById("asistenteLauncher");
const asistentePanel = document.getElementById("asistentePanel");
const asistenteHilo = document.getElementById("asistenteHilo");
const asistenteTextoEl = document.getElementById("asistenteTexto");
const formAsistente = document.getElementById("formAsistente");
const btnAsistenteEnviar = document.getElementById("btnAsistenteEnviar");

function asistenteAbrir() {
  asistentePanel.hidden = false;
  asistenteLauncher.setAttribute("aria-expanded", "true");
  asistenteTextoEl.focus();
  asistenteScrollAlFinal();
}

function asistenteCerrar() {
  asistentePanel.hidden = true;
  asistenteLauncher.setAttribute("aria-expanded", "false");
  asistenteLauncher.focus();
}

asistenteLauncher.addEventListener("click", () => {
  if (asistentePanel.hidden) asistenteAbrir();
  else asistenteCerrar();
});
document.getElementById("asistentePanelClose").addEventListener("click", asistenteCerrar);
// Escape cierra; un clic afuera NO — se puede estar mirando otra pantalla
// con el panel abierto mientras se decide qué hacer con una propuesta.
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !asistentePanel.hidden) asistenteCerrar();
});

// Enter envía, Shift+Enter hace salto de línea (como Notion/Canva AI); el
// textarea crece con el contenido en vez de scrollear internamente.
asistenteTextoEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    formAsistente.requestSubmit();
  }
});
function asistenteAjustarAltoTextarea() {
  asistenteTextoEl.style.height = "auto";
  asistenteTextoEl.style.height = `${asistenteTextoEl.scrollHeight}px`;
}
asistenteTextoEl.addEventListener("input", asistenteAjustarAltoTextarea);

// Un ejemplo de la bienvenida llena el cuadro para editarlo: no se envía
// solo, igual que todo lo demás del asistente (CLAUDE.md §21).
document.querySelectorAll(".asistente-sugerencia").forEach((btn) => {
  btn.addEventListener("click", () => {
    asistenteTextoEl.value = btn.textContent;
    asistenteAjustarAltoTextarea();
    asistenteTextoEl.focus();
  });
});

function asistenteScrollAlFinal() {
  asistenteHilo.scrollTop = asistenteHilo.scrollHeight;
}

/* --- El hilo: un turno por intercambio --- */

function asistenteAgregarTurnoUsuario(texto) {
  const turno = document.createElement("div");
  turno.className = "asistente-turno asistente-turno-usuario";
  const p = document.createElement("p");
  p.textContent = texto; // textContent: es texto tipeado por el usuario, nunca HTML.
  turno.appendChild(p);
  asistenteHilo.appendChild(turno);
}

function asistenteAgregarTurnoRespuesta() {
  const turno = document.createElement("div");
  turno.className = "asistente-turno asistente-turno-respuesta";
  turno.innerHTML = `<p class="asistente-pensando" aria-live="polite">Pensando…</p>`;
  asistenteHilo.appendChild(turno);
  return turno;
}

formAsistente.addEventListener("submit", async (e) => {
  e.preventDefault();
  const texto = asistenteTextoEl.value.trim();
  if (!texto) return;

  asistenteAgregarTurnoUsuario(texto);
  const turnoRespuesta = asistenteAgregarTurnoRespuesta();
  asistenteTextoEl.value = "";
  asistenteAjustarAltoTextarea();
  asistenteScrollAlFinal();

  btnAsistenteEnviar.disabled = true;
  try {
    const data = await api("/api/asistente/interpretar", {
      method: "POST",
      body: { texto },
      error: "No se pudo interpretar el texto."
    }).catch((e) => {
      turnoRespuesta.remove();
      throw e;
    });
    asistenteRenderRespuesta(turnoRespuesta, data);
  } finally {
    btnAsistenteEnviar.disabled = false;
    asistenteScrollAlFinal();
  }
});

function asistenteRenderRespuesta(turnoEl, data) {
  if (!data.tipo) {
    turnoEl.innerHTML = `<p>${esc(data.mensaje ?? "No identifiqué ninguna operación en ese texto.")}</p>`;
    return;
  }

  const plantillas = { venta: plantillaAsistenteVenta, compra: plantillaAsistenteCompra, gasto: plantillaAsistenteGasto };
  turnoEl.innerHTML = plantillas[data.tipo](data.propuesta);
  const tarjeta = turnoEl.querySelector(".asistente-propuesta");

  if (data.problemas?.length) {
    tarjeta.insertAdjacentHTML(
      "afterbegin",
      `<p class="form-note asistente-problemas">${esc(data.problemas.join(" · "))}</p>`
    );
  }

  const activadores = { venta: activarAsistenteVenta, compra: activarAsistenteCompra, gasto: activarAsistenteGasto };
  activadores[data.tipo](tarjeta, data.propuesta, data.mensaje_id, turnoEl);

  tarjeta
    .querySelector(".btn-asistente-descartar")
    .addEventListener("click", () => asistenteDescartar(data.mensaje_id, turnoEl));
}

// Confirmada: la tarjeta colapsa a una línea de resultado y queda como
// historial del turno — el hilo entero no se borra por esto.
async function asistenteEjecutar(mensajeId, tipo, propuesta, turnoEl) {
  const { id } = await api("/api/asistente/ejecutar", {
    method: "POST",
    body: { mensaje_id: mensajeId, tipo, propuesta },
    error: "No se pudo registrar la operación."
  });
  const etiqueta = { venta: "Venta", compra: "Compra", gasto: "Gasto" }[tipo];
  turnoEl.innerHTML = `<p class="asistente-resuelto asistente-confirmado">${icono("circle-check")} ${etiqueta} #${id} registrada.</p>`;
  asistenteScrollAlFinal();

  // Toda la cascada real la hizo el backend; acá solo hace falta refrescar
  // los caches que la operación pudo haber tocado, para que el resto de
  // las pantallas no queden desactualizadas hasta el próximo F5.
  await refrescar([
    cargarVentas(),
    cargarCompras(),
    recargar("gastos"),
    cargarStock(),
    cargarProductos(),
    cargarClientes(),
    cargarProveedores(),
    cargarCaja(),
    recargar("cuentasCorrientes"),
    cargarPanelResumen(),
    cargarReporteStock()
  ]);
}

async function asistenteDescartar(mensajeId, turnoEl) {
  if (mensajeId) {
    // Si el servidor no lo registra, se avisa pero la tarjeta se descarta igual.
    await refrescar([
      api(`/api/asistente/${mensajeId}/descartar`, {
        method: "POST",
        error: "No se pudo registrar el descarte en el servidor."
      })
    ]);
  }
  turnoEl.innerHTML = `<p class="asistente-resuelto asistente-descartado">Descartada.</p>`;
}

/* --- Venta --- */

function plantillaAsistenteVenta(propuesta) {
  const clienteNombre = propuesta.cliente.nombre_resuelto || propuesta.cliente.valor || "";
  return `
    <div class="asistente-propuesta">
      <p class="asistente-propuesta-titulo">Venta</p>
      <form class="form">
        <label>
          <span>Cliente ${asistenteBadge(propuesta.cliente, { creaSiNoExiste: true })}</span>
          <input type="text" class="asistente-cliente" list="clientesSugeridos" value="${esc(clienteNombre)}" placeholder="Nombre del cliente" />
        </label>
        <label class="asistente-cliente-ambiguo-wrap" ${propuesta.cliente.estado === "ambiguo" ? "" : "hidden"}>
          <span>Elegí cuál es</span>
          <select class="asistente-cliente-ambiguo">
            <option value="">— elegí uno —</option>
            ${propuesta.cliente.candidatos.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join("")}
          </select>
        </label>

        <div class="item-rows asistente-venta-items"></div>
        <button type="button" class="btn-add-item asistente-agregar-item">+ agregar producto</button>
        <p class="item-total">Total: <span class="mono asistente-venta-total">$0,00</span></p>

        <label class="form-check">
          <input type="checkbox" class="asistente-cobro-toggle" ${propuesta.cobro ? "checked" : ""} />
          Ya se cobró (total o parcial)
        </label>
        <label class="asistente-cobro-cuenta-wrap" ${propuesta.cobro ? "" : "hidden"}>
          <span>Cuenta ${propuesta.cobro ? asistenteBadge(propuesta.cobro.cuenta) : ""}</span>
          <select class="asistente-cobro-cuenta"></select>
        </label>
        <label class="asistente-cobro-importe-wrap" ${propuesta.cobro ? "" : "hidden"}>
          <span>Importe cobrado (vacío = el total)</span>
          <input type="number" class="asistente-cobro-importe" step="0.01" min="0" value="${esc(propuesta.cobro?.importe ?? "")}" />
        </label>

        <label>
          <span>Fecha (vacío = hoy)</span>
          <input type="date" class="asistente-fecha" value="${esc(propuesta.fecha ?? "")}" />
        </label>

        <div class="panel-acciones">
          <button type="button" class="btn btn-secundario btn-asistente-descartar">Descartar</button>
          <button type="submit" class="btn btn-primary">Confirmar y registrar</button>
        </div>
      </form>
    </div>
  `;
}

function activarAsistenteVenta(raiz, propuesta, mensajeId, turnoEl) {
  const clienteInput = raiz.querySelector(".asistente-cliente");
  // Igual que el campo Cliente del modal manual de Venta: texto libre con
  // sugerencias, crearVenta lo resuelve por nombre o lo crea. La única
  // diferencia es cuando hay ambigüedad — ahí SÍ hace falta un id
  // concreto, para no crear un cliente nuevo por accidente.
  let clienteIdManual = propuesta.cliente.estado === "resuelto" ? propuesta.cliente.id : null;
  clienteInput.addEventListener("input", () => {
    clienteIdManual = null;
  });
  const clienteAmbiguoSelect = raiz.querySelector(".asistente-cliente-ambiguo");
  clienteAmbiguoSelect?.addEventListener("change", () => {
    const candidato = propuesta.cliente.candidatos.find((c) => c.id === Number(clienteAmbiguoSelect.value));
    if (candidato) {
      clienteIdManual = candidato.id;
      clienteInput.value = candidato.nombre;
    }
  });

  const itemsEl = raiz.querySelector(".asistente-venta-items");
  const totalEl = raiz.querySelector(".asistente-venta-total");
  const actualizarTotal = () => {
    totalEl.textContent = money(totalItems(itemsEl));
  };
  itemsEl.addEventListener("item-change", actualizarTotal);

  for (const item of propuesta.items) {
    agregarFilaItemVenta(itemsEl, productos, true);
    const fila = itemsEl.lastElementChild;
    fila.querySelector(".item-producto").value = item.producto.nombre_resuelto || item.producto.valor || "";
    fila.querySelector(".item-producto-id").value = item.producto.id ?? "";
    fila.querySelector(".item-cantidad").value = item.cantidad ?? "";
    fila.querySelector(".item-precio").value = item.precio_unitario ?? "";
    actualizarSubtotalFila(fila);
    if (item.producto.estado === "ambiguo") {
      fila.insertAdjacentHTML("afterend", asistenteNotaCandidatos(item.producto.candidatos));
    }
  }
  actualizarTotal();

  raiz.querySelector(".asistente-agregar-item").addEventListener("click", () => {
    agregarFilaItemVenta(itemsEl, productos, true);
  });

  const cobroToggle = raiz.querySelector(".asistente-cobro-toggle");
  const cuentaWrap = raiz.querySelector(".asistente-cobro-cuenta-wrap");
  const importeWrap = raiz.querySelector(".asistente-cobro-importe-wrap");
  const cuentaSelect = raiz.querySelector(".asistente-cobro-cuenta");
  poblarSelectCuentas(cuentaSelect, propuesta.cobro?.cuenta?.id ?? cuentasTesoreria[0]?.id ?? null);
  const sincronizarCobro = () => {
    cuentaWrap.hidden = !cobroToggle.checked;
    importeWrap.hidden = !cobroToggle.checked;
  };
  cobroToggle.addEventListener("change", sincronizarCobro);

  raiz.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const items = leerItemsVenta(itemsEl);
    if (items.length === 0) {
      avisar("Falta elegir, para cada item, un producto que exista en el catálogo.", "atencion");
      return;
    }
    const clienteTexto = clienteInput.value.trim();
    if (!clienteIdManual && !clienteTexto) {
      avisar("Falta el cliente.", "atencion");
      return;
    }

    await asistenteEjecutar(
      mensajeId,
      "venta",
      {
        cliente: {
          id: clienteIdManual,
          valor: clienteTexto,
          nombre_resuelto: clienteIdManual ? clienteTexto : null
        },
        items: items.map((it) => ({
          producto: { id: it.producto_id },
          cantidad: it.cantidad,
          precio_unitario: it.precio_unitario
        })),
        cobro: cobroToggle.checked
          ? {
              cuenta: { id: Number(cuentaSelect.value) },
              importe: raiz.querySelector(".asistente-cobro-importe").value
                ? Number(raiz.querySelector(".asistente-cobro-importe").value)
                : null
            }
          : null,
        fecha: raiz.querySelector(".asistente-fecha").value || null
      },
      turnoEl
    );
  });
}

/* --- Compra --- */

function plantillaAsistenteCompra(propuesta) {
  const proveedorNombre = propuesta.proveedor.nombre_resuelto || propuesta.proveedor.valor || "";
  return `
    <div class="asistente-propuesta">
      <p class="asistente-propuesta-titulo">Compra</p>
      <form class="form">
        <label>
          <span>Proveedor ${asistenteBadge(propuesta.proveedor, { creaSiNoExiste: true })}</span>
          <input type="text" class="asistente-proveedor" value="${esc(proveedorNombre)}" placeholder="Nombre del proveedor" />
        </label>
        <label class="asistente-proveedor-ambiguo-wrap" ${propuesta.proveedor.estado === "ambiguo" ? "" : "hidden"}>
          <span>Elegí cuál es</span>
          <select class="asistente-proveedor-ambiguo">
            <option value="">— elegí uno —</option>
            ${propuesta.proveedor.candidatos.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join("")}
          </select>
        </label>

        <div class="item-rows asistente-compra-items"></div>
        <button type="button" class="btn-add-item asistente-agregar-item">+ agregar producto</button>
        <p class="item-total">Total: <span class="mono asistente-compra-total">$0,00</span></p>

        <label>
          <span>Costo de envío</span>
          <input type="number" class="asistente-costo-envio" step="0.01" min="0" value="${esc(propuesta.costo_envio ?? 0)}" />
        </label>
        <label>
          <span>Fecha (vacío = hoy)</span>
          <input type="date" class="asistente-fecha" value="${esc(propuesta.fecha ?? "")}" />
        </label>

        <div class="panel-acciones">
          <button type="button" class="btn btn-secundario btn-asistente-descartar">Descartar</button>
          <button type="submit" class="btn btn-primary">Confirmar y registrar</button>
        </div>
      </form>
    </div>
  `;
}

function activarAsistenteCompra(raiz, propuesta, mensajeId, turnoEl) {
  const proveedorInput = raiz.querySelector(".asistente-proveedor");
  // Una compra siempre resuelve proveedor/producto por NOMBRE (crea el que
  // falte, igual que el modal manual) — no hace falta trackear un id acá,
  // ni siquiera con ambigüedad: elegir un candidato solo completa el
  // nombre exacto en el input de texto.
  const proveedorAmbiguoSelect = raiz.querySelector(".asistente-proveedor-ambiguo");
  proveedorAmbiguoSelect?.addEventListener("change", () => {
    const candidato = propuesta.proveedor.candidatos.find((c) => c.id === Number(proveedorAmbiguoSelect.value));
    if (candidato) proveedorInput.value = candidato.nombre;
  });

  const itemsEl = raiz.querySelector(".asistente-compra-items");
  const totalEl = raiz.querySelector(".asistente-compra-total");
  const actualizarTotal = () => {
    totalEl.textContent = money(totalItems(itemsEl));
  };
  itemsEl.addEventListener("item-change", actualizarTotal);

  for (const item of propuesta.items) {
    agregarFilaItemCompra(itemsEl, productos);
    const fila = itemsEl.lastElementChild;
    fila.querySelector(".item-producto").value = item.producto.nombre_resuelto || item.producto.valor || "";
    fila.querySelector(".item-producto-id").value = item.producto.id ?? "";
    fila.querySelector(".item-cantidad").value = item.cantidad ?? "";
    fila.querySelector(".item-precio").value = item.precio_unitario ?? "";
    actualizarSubtotalFila(fila);
    if (item.producto.estado === "ambiguo") {
      fila.insertAdjacentHTML("afterend", asistenteNotaCandidatos(item.producto.candidatos));
    }
  }
  actualizarTotal();

  raiz.querySelector(".asistente-agregar-item").addEventListener("click", () => {
    agregarFilaItemCompra(itemsEl, productos);
  });

  raiz.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const items = leerItemsCompra(itemsEl);
    if (items.length === 0) {
      avisar("Falta al menos un producto con cantidad y costo válidos.", "atencion");
      return;
    }
    const proveedorTexto = proveedorInput.value.trim();
    if (!proveedorTexto) {
      avisar("Falta el proveedor.", "atencion");
      return;
    }

    await asistenteEjecutar(
      mensajeId,
      "compra",
      {
        proveedor: { valor: proveedorTexto, nombre_resuelto: proveedorTexto },
        items: items.map((it) => ({
          producto: { valor: it.producto, nombre_resuelto: it.producto },
          cantidad: it.cantidad,
          precio_unitario: it.precio_unitario
        })),
        costo_envio: Number(raiz.querySelector(".asistente-costo-envio").value) || 0,
        fecha: raiz.querySelector(".asistente-fecha").value || null
      },
      turnoEl
    );
  });
}

/* --- Gasto --- */

function plantillaAsistenteGasto(propuesta) {
  return `
    <div class="asistente-propuesta">
      <p class="asistente-propuesta-titulo">Gasto</p>
      <form class="form">
        <label>
          <span>Categoría ${asistenteBadge(propuesta.categoria)}</span>
          <select class="asistente-categoria"></select>
        </label>
        <label>
          <span>Cuenta ${asistenteBadge(propuesta.cuenta)}</span>
          <select class="asistente-cuenta"></select>
        </label>
        <label>
          <span>Proveedor (opcional) ${propuesta.proveedor ? asistenteBadge(propuesta.proveedor) : ""}</span>
          <select class="asistente-proveedor-gasto"></select>
        </label>
        <label>
          <span>Importe</span>
          <input type="number" class="asistente-importe" step="0.01" min="0.01" value="${esc(propuesta.importe ?? "")}" />
        </label>
        <label>
          <span>Tipo</span>
          <select class="asistente-tipo-gasto">
            <option value="">Heredar de la categoría</option>
            <option value="operativo">Operativo</option>
            <option value="inversion">Inversión</option>
            <option value="retiro">Retiro</option>
          </select>
        </label>
        <label>
          <span>Descripción</span>
          <input type="text" class="asistente-descripcion" value="${esc(propuesta.descripcion ?? "")}" />
        </label>
        <label>
          <span>Fecha (vacío = hoy)</span>
          <input type="date" class="asistente-fecha" value="${esc(propuesta.fecha ?? "")}" />
        </label>

        <div class="panel-acciones">
          <button type="button" class="btn btn-secundario btn-asistente-descartar">Descartar</button>
          <button type="submit" class="btn btn-primary">Confirmar y registrar</button>
        </div>
      </form>
    </div>
  `;
}

function activarAsistenteGasto(raiz, propuesta, mensajeId, turnoEl) {
  const categoriaSelect = raiz.querySelector(".asistente-categoria");
  categoriaSelect.innerHTML = categoriasGasto
    .filter((c) => c.activa)
    .map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`)
    .join("");
  if (propuesta.categoria.estado === "resuelto") categoriaSelect.value = propuesta.categoria.id;

  poblarSelectCuentas(
    raiz.querySelector(".asistente-cuenta"),
    propuesta.cuenta.estado === "resuelto" ? propuesta.cuenta.id : null
  );

  const proveedorSelect = raiz.querySelector(".asistente-proveedor-gasto");
  proveedorSelect.innerHTML =
    `<option value="">Sin proveedor</option>` + proveedores.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join("");
  if (propuesta.proveedor?.estado === "resuelto") proveedorSelect.value = propuesta.proveedor.id;

  raiz.querySelector(".asistente-tipo-gasto").value = propuesta.tipo ?? "";

  raiz.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!categoriaSelect.value) {
      avisar("Falta elegir una categoría.", "atencion");
      return;
    }
    const cuentaValue = raiz.querySelector(".asistente-cuenta").value;
    if (!cuentaValue) {
      avisar("Falta elegir una cuenta.", "atencion");
      return;
    }

    await asistenteEjecutar(
      mensajeId,
      "gasto",
      {
        categoria: { id: Number(categoriaSelect.value) },
        cuenta: { id: Number(cuentaValue) },
        proveedor: proveedorSelect.value ? { id: Number(proveedorSelect.value) } : null,
        importe: Number(raiz.querySelector(".asistente-importe").value),
        tipo: raiz.querySelector(".asistente-tipo-gasto").value || null,
        descripcion: raiz.querySelector(".asistente-descripcion").value.trim() || null,
        fecha: raiz.querySelector(".asistente-fecha").value || null
      },
      turnoEl
    );
  });
}

/* ---------- Auditoría (CLAUDE.md §22) ---------- */

const AUDITORIA_ACCION_CLASE = {
  crear: "status-cobrado",
  confirmar: "status-cobrado",
  restaurar: "status-cobrado",
  editar: "",
  cambiar_estado: "",
  anular: "status-vencido"
};
// Una sola palabra cada una: el badge .status no tiene white-space:nowrap
// (mismo comportamiento que el resto de los badges de la app), así que
// dos palabras envuelven feo dentro de la píldora.
const AUDITORIA_ACCION_LABEL = {
  crear: "Creó",
  editar: "Editó",
  anular: "Anuló",
  restaurar: "Restauró",
  cambiar_estado: "Actualizó",
  confirmar: "Confirmó",
  login: "Inició sesión",
  logout: "Cerró sesión",
  login_fallido: "Intento de inicio de sesión fallido"
};
const AUDITORIA_ENTIDAD_LABEL = {
  venta: "Venta",
  compra: "Compra",
  presupuesto: "Presupuesto",
  devolucion: "Devolución",
  devolucion_proveedor: "Devolución a proveedor",
  factura: "Factura",
  cobro: "Cobro",
  pago: "Pago",
  gasto: "Gasto",
  producto: "Producto",
  cliente: "Cliente",
  proveedor: "Proveedor",
  stock: "Stock",
  tesoreria: "Tesorería",
  categoria: "Categoría",
  categoria_gasto: "Categoría de gasto",
  cuenta_tesoreria: "Cuenta de tesorería",
  lista_precio: "Lista de precios",
  deposito: "Depósito",
  usuario: "Usuario",
  transferencia: "Transferencia"
};
const AUDITORIA_ACTOR_LABEL = { operador: "Operador", asistente: "Asistente IA", sistema: "Sistema" };

// "20 → 15" en vez del JSON crudo: valor_anterior/valor_nuevo llegan como
// texto JSON (ver registrarAuditoria en db/index.js), y acá se muestran
// como parte del Detalle en vez de en columnas propias, porque cada
// entidad cambia campos distintos. El parse va en try/catch: un JSON
// roto no puede tirar abajo toda la fila.
function auditoriaDiffTexto(anteriorJson, nuevoJson) {
  if (!anteriorJson || !nuevoJson) return "";
  try {
    const anterior = JSON.parse(anteriorJson);
    const nuevo = JSON.parse(nuevoJson);
    const partes = Object.keys(nuevo).map((campo) => {
      const val = (v) => (v === null || v === undefined || v === "" ? "—" : v);
      return `${campo}: ${val(anterior[campo])} → ${val(nuevo[campo])}`;
    });
    return partes.length > 0 ? ` (${partes.join(", ")})` : "";
  } catch {
    return "";
  }
}

function renderAuditoria(registros) {
  const body = document.getElementById("auditoriaBody");

  if (registros.length === 0) {
    if (filtrosAuditoria.filtros.length > 0) {
      body.innerHTML = filaVaciaFiltrada(7);
      body.querySelector(".tabla-vacia-limpiar").addEventListener("click", () => filtrosAuditoria.limpiar());
    } else {
      body.innerHTML = filaVacia(7, "Todavía no hay actividad registrada en esta etapa.");
    }
    return;
  }

  body.innerHTML = registros
    .map((r) => {
      const [fecha, hora] = (r.fecha || "").split(" ");
      const detalle = `${r.detalle || "—"}${auditoriaDiffTexto(r.valor_anterior, r.valor_nuevo)}`;
      return `
        <tr>
          <td data-label="Fecha">${esc(fechaAR(fecha) || "—")}${hora ? ` <span class="mono">${esc(hora)}</span>` : ""}</td>
          <td data-label="Acción"><span class="status ${AUDITORIA_ACCION_CLASE[r.accion] || ""}">${esc(AUDITORIA_ACCION_LABEL[r.accion] || r.accion)}</span></td>
          <td data-label="Entidad">${esc(AUDITORIA_ENTIDAD_LABEL[r.entidad] || r.entidad)}</td>
          <td data-label="N°">${r.entidad_id ?? "—"}</td>
          <td data-label="Detalle" class="celda-wrap">${esc(detalle)}</td>
          <td data-label="Origen">${r.actor === "asistente" ? `<span class="status status-ia">${AUDITORIA_ACTOR_LABEL.asistente}</span>` : esc(AUDITORIA_ACTOR_LABEL[r.actor] || r.actor)}</td>
          <td data-label="Usuario">${esc(r.usuario_nombre ?? "—")}</td>
        </tr>`;
    })
    .join("");
}

let auditoriaCache = [];

const filtrosAuditoria = crearFiltros(
  "filtrosAuditoria",
  [
    { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
    {
      clave: "accion",
      etiqueta: "Acción",
      tipo: "select",
      opciones: Object.entries(AUDITORIA_ACCION_LABEL).map(([valor, texto]) => ({ valor, texto }))
    },
    {
      clave: "entidad",
      etiqueta: "Entidad",
      tipo: "select",
      opciones: Object.entries(AUDITORIA_ENTIDAD_LABEL).map(([valor, texto]) => ({ valor, texto }))
    },
    {
      clave: "actor",
      etiqueta: "Origen",
      tipo: "select",
      opciones: Object.entries(AUDITORIA_ACTOR_LABEL).map(([valor, texto]) => ({ valor, texto }))
    },
    { clave: "detalle", etiqueta: "Detalle", tipo: "texto" },
    { clave: "usuario_nombre", etiqueta: "Usuario", tipo: "texto" }
  ],
  () => renderAuditoria(filtrosAuditoria.aplicar(auditoriaCache))
);

// Panel "Movimientos contables": derivado, sin tabla ni endpoint propio
// (mismo espíritu que Papelera, más abajo) — junta lo que ya tienen
// historia previa a esta etapa: stock (movimientosStockCache, poblado por
// cargarStock) y tesorería (movimientosCajaCache, poblado por cargarCaja).
// Si esos módulos todavía no cargaron en esta sesión (poco probable, son
// parte del boot), se piden acá mismo para no dejar el panel vacío.
function renderAuditoriaMovimientos(movimientos) {
  const body = document.getElementById("auditoriaMovBody");

  if (movimientos.length === 0) {
    if (filtrosAuditoriaMov.filtros.length > 0) {
      body.innerHTML = filaVaciaFiltrada(4);
      body.querySelector(".tabla-vacia-limpiar").addEventListener("click", () => filtrosAuditoriaMov.limpiar());
    } else {
      body.innerHTML = filaVacia(4, "Todavía no hay movimientos registrados.");
    }
    return;
  }

  body.innerHTML = movimientos
    .map((m) => {
      // Stock mueve unidades, tesorería mueve plata: son magnitudes
      // distintas y cada una necesita su propio formato, no los dos con
      // money() (una cantidad de 1 unidad no es "$ 1,00").
      const importeFmt = m.tipoLabel === "Stock" ? numero(Math.abs(m.importe)) : money(Math.abs(m.importe));
      return `
        <tr>
          <td data-label="Fecha">${esc(fechaAR(m.fecha))}</td>
          <td data-label="Tipo">${esc(m.tipoLabel)}</td>
          <td data-label="Concepto">${esc(m.concepto)}</td>
          <td data-label="Importe" class="align-right mono">${esc(m.signo)}${importeFmt}</td>
        </tr>`;
    })
    .join("");
}

let auditoriaMovCache = [];

function armarAuditoriaMovimientos() {
  const deStock = movimientosStockCache.map((m) => {
    const origen =
      m.origen === "venta"
        ? `Venta #${m.venta_id}`
        : m.origen === "compra"
        ? `Compra #${m.compra_id}`
        : m.origen === "devolucion"
        ? `Devolución #${m.devolucion_id}`
        : "Ajuste manual";
    const salida = m.tipo === "salida" || (m.tipo === "ajuste" && m.cantidad < 0);
    return {
      fecha: m.fecha,
      tipoLabel: "Stock",
      concepto: `${origen} · ${m.producto}`,
      importe: Math.abs(m.cantidad),
      signo: salida ? "-" : "+"
    };
  });

  const deTesoreria = movimientosCajaCache.map((m) => {
    let concepto;
    if (m.origen === "cobro") concepto = `Cobro de venta #${m.venta_id}`;
    else if (m.origen === "pago") concepto = `Pago de compra #${m.compra_id}`;
    else if (m.origen === "transferencia") concepto = `Transferencia ${m.tipo === "egreso" ? "a" : "desde"} ${m.contraparte ?? "—"}`;
    else concepto = m.concepto || "Movimiento manual";
    return {
      fecha: m.fecha,
      tipoLabel: "Tesorería",
      concepto,
      importe: m.importe,
      signo: m.tipo === "ingreso" ? "+" : "-"
    };
  });

  return [...deStock, ...deTesoreria].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
}

const filtrosAuditoriaMov = crearFiltros(
  "filtrosAuditoriaMov",
  [
    { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
    {
      clave: "tipoLabel",
      etiqueta: "Tipo",
      tipo: "select",
      opciones: [
        { valor: "Stock", texto: "Stock" },
        { valor: "Tesorería", texto: "Tesorería" }
      ]
    },
    { clave: "concepto", etiqueta: "Concepto", tipo: "texto" }
  ],
  () => renderAuditoriaMovimientos(filtrosAuditoriaMov.aplicar(auditoriaMovCache))
);

async function cargarAuditoria() {
  // Es de los dos roles (hist. §93): al empleado el servidor le saca los
  // costos de valor_anterior/valor_nuevo y las filas de compras.
  tablaCargando("auditoriaBody", 7);
  tablaCargando("auditoriaMovBody", 4);

  const peticiones = [api("/api/auditoria")];
  // Solo se piden si todavía no están en memoria: Stock y Caja ya los
  // cargan al bootear la página (ver la cadena de Promise.all al final de
  // este archivo), así que lo normal es no volver a pedirlos acá.
  if (movimientosStockCache.length === 0) {
    peticiones.push(api("/api/movimientos-stock"));
  }
  if (movimientosCajaCache.length === 0) {
    peticiones.push(api("/api/tesoreria/movimientos"));
  }
  const [auditoria, stockExtra, cajaExtra] = await Promise.all(peticiones);

  auditoriaCache = auditoria;
  if (stockExtra) movimientosStockCache = stockExtra;
  if (cajaExtra) movimientosCajaCache = cajaExtra;

  renderAuditoria(filtrosAuditoria.aplicar(auditoriaCache));

  auditoriaMovCache = armarAuditoriaMovimientos();
  renderAuditoriaMovimientos(filtrosAuditoriaMov.aplicar(auditoriaMovCache));
}

document.getElementById("btnActualizarAuditoria").addEventListener("click", async () => {
  await cargarAuditoria();
  avisar("Auditoría actualizada.", "ok");
});

/* ---------- Papelera ---------- */

// Se arma sobre los arrays que ya tienen Ventas, Compras, Gastos y
// Devoluciones (la API devuelve las anuladas junto con el resto), así que
// no hace falta un fetch propio. La llaman esos cargarX() después de
// refrescarse.
function renderPapelera() {
  const body = document.getElementById("papeleraBody");
  const anulados = [
    ...ventas
      .filter((v) => v.estado === "anulada")
      .map((v) => ({ tipo: "Venta", id: v.id, fecha: v.fecha, quien: v.cliente, total: v.total })),
    ...compras
      .filter((c) => c.estado === "anulada")
      .map((c) => ({ tipo: "Compra", id: c.id, fecha: c.fecha, quien: c.proveedor, total: c.total })),
    ...gastos
      .filter((g) => g.estado === "anulado")
      .map((g) => ({ tipo: "Gasto", id: g.id, fecha: g.fecha, quien: g.categoria, total: g.importe })),
    ...devoluciones
      .filter((d) => d.estado === "anulada")
      .map((d) => ({ tipo: "Devolución", id: d.id, fecha: d.fecha, quien: d.cliente, total: d.total })),
    ...devolucionesProveedor
      .filter((d) => d.estado === "anulada")
      .map((d) => ({ tipo: "Dev. a proveedor", id: d.id, fecha: d.fecha, quien: d.proveedor, total: d.total }))
  ].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id);

  if (anulados.length === 0) {
    body.innerHTML = filaVacia(6, "La papelera está vacía.");
    return;
  }

  body.innerHTML = anulados
    .map(
      (d) => `
    <tr>
      <td data-label="Tipo">${esc(d.tipo)}</td>
      <td data-label="N°" class="mono">#${d.id}</td>
      <td data-label="Fecha">${esc(fechaAR(d.fecha))}</td>
      <td data-label="Cliente / Proveedor">${esc(d.quien)}</td>
      <td data-label="Total" class="align-right mono">${money(d.total)}</td>
      <td data-label=""><button type="button" class="btn-fila btn-restaurar"
        data-tipo="${
          d.tipo === "Venta"
            ? "ventas"
            : d.tipo === "Compra"
            ? "compras"
            : d.tipo === "Devolución"
            ? "devoluciones"
            : d.tipo === "Dev. a proveedor"
            ? "devoluciones-proveedor"
            : "gastos"
        }" data-id="${d.id}">Restaurar</button></td>
    </tr>`
    )
    .join("");

  body.querySelectorAll(".btn-restaurar").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api(`/api/${btn.dataset.tipo}/${btn.dataset.id}/restaurar`, {
        method: "POST",
        error: "No se pudo restaurar el documento."
      });
      await refrescar([
        cargarVentas(),
        cargarCompras(),
        recargar("gastos"),
        cargarDevoluciones(),
        cargarDevolucionesProveedor(),
        cargarStock(),
        cargarProductos(),
        cargarClientes(),
        cargarProveedores(),
        cargarCaja(),
        recargar("cuentasCorrientes"),
        cargarPanelResumen(),
        cargarReporteStock()
      ]);
    });
  });
}

// Acciones que dominios/gastos.js invoca por nombre. Se registran antes del
// arranque porque cargarGastos() pide render:papelera apenas termina su fetch.
registrar("cargar:caja", cargarCaja);
registrar("cargar:panelResumen", cargarPanelResumen);
registrar("render:papelera", renderPapelera);
// Las que refresca dominios/pos.js después de cada venta de mostrador: las
// mismas que recarga el alta de venta de acá.
registrar("cargar:ventas", cargarVentas);
registrar("cargar:stock", cargarStock);
registrar("cargar:productos", cargarProductos);
registrar("cargar:clientes", cargarClientes);
registrar("cargar:reporteStock", cargarReporteStock);

// El orden importa en dos puntos: Caja llena `cuentasTesoreria`, que
// Gastos necesita para su filtro y su modal; y el Resumen va último
// porque su tabla de últimos movimientos se arma con los cachés de
// ventas, compras y gastos ya cargados. Cuentas corrientes y el reporte
// de stock no dependen de ningún caché del frontend (traen su propio
// fetch), así que entran en el mismo último grupo que Resumen.
// recargar("negocio") va en la primera ola: no depende de nada y la impresión de
// comprobantes necesita el membrete listo antes del primer click en Imprimir.
// recargar("negocios"), el selector de arriba del menú, tampoco depende de
// nada y es lo primero que se ve. Facturas tampoco depende de ningún caché.
// Cada ola usa refrescar(): si una carga falla, api() ya la avisó con un toast
// y las demás siguen (la pantalla de esa carga queda vacía, no toda la app).
// Solo un error inesperado (un bug al pintar) corta la cadena.
refrescar([cargarClientes(), cargarProveedores(), cargarCaja(), recargar("negocio"), recargar("negocios"), cargarFacturas()])
  .then(() => refrescar([recargar("gastos"), cargarProductos()]))
  .then(() => refrescar([cargarVentas(), cargarCompras(), cargarStock(), cargarPresupuestos(), cargarDevoluciones()]))
  .then(() => refrescar([cargarDevolucionesProveedor()]))
  .then(() => refrescar([cargarPanelResumen(), recargar("cuentasCorrientes"), cargarReporteStock()]))
  .catch((e) => {
    avisar("No se terminaron de cargar los datos. Recargá la página para reintentar.", "atencion");
    throw e;
  });

/* ---------- Tema claro / oscuro ---------- */

// El botón de la sidebar alterna; la página Apariencia de Configuración elige
// uno. Los dos pasan por core/tema.js.
document.getElementById("btnTema").addEventListener("click", () => {
  aplicarTema(temaActual() === "oscuro" ? "claro" : "oscuro");
});

/* ---------- Colapsar sidebar (pantalla completa en desktop) ---------- */

document.getElementById("btnColapsar").addEventListener("click", () => {
  document.documentElement.setAttribute("data-sidebar", "colapsada");
  try {
    localStorage.setItem("nexo.sidebar", "colapsada");
  } catch {
    // Sin storage disponible, se oculta igual para esta sesión, solo no
    // se recuerda la próxima vez (mismo criterio que el tema, arriba).
  }
});

/* ---------- Menú mobile y navegación entre vistas ---------- */

const navToggle = document.getElementById("navToggle");
const sidebar = document.getElementById("sidebar");

// aria-expanded sigue a la clase is-open sin importar quién la cambie: este
// botón, Escape o el router al navegar (core/router.js la saca en cada click
// del nav). Mismo criterio que los modales en core/ui.js.
new MutationObserver(() => {
  navToggle.setAttribute("aria-expanded", String(sidebar.classList.contains("is-open")));
}).observe(sidebar, { attributes: true, attributeFilter: ["class"] });

// Escape cierra el drawer mobile, salvo que un modal ya la haya usado.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || e.defaultPrevented || !sidebar.classList.contains("is-open")) return;
  sidebar.classList.remove("is-open");
  navToggle.focus();
});

navToggle.addEventListener("click", () => {
  sidebar.classList.toggle("is-open");
  // En desktop este mismo botón reaparece cuando la sidebar está
  // colapsada (ver CSS) y su única función ahí es volver a mostrarla.
  if (document.documentElement.getAttribute("data-sidebar") === "colapsada") {
    document.documentElement.removeAttribute("data-sidebar");
    try {
      localStorage.removeItem("nexo.sidebar");
    } catch {}
  }
});


// Al entrar: si la URL ya trae una vista puesta (F5, o volver con el
// botón Atrás), arrancar ahí en vez de siempre en Resumen.
// Auditoría se carga al entrar (ver mostrarVista en core/router.js);
// Configuración hace lo mismo desde dominios/configuracion.js.
alEntrarEnVista("auditoria", cargarAuditoria);

// Acciones que dominios/cuentas-corrientes.js invoca por nombre (solo con un
// click, después del boot).
registrar("abrirFicha:cliente", abrirFichaCliente);
registrar("abrirFicha:proveedor", abrirFichaProveedor);
registrar("abrirFicha:venta", abrirFichaVenta);
registrar("abrirFicha:presupuesto", abrirFichaPresupuesto);
registrar("cargar:presupuestos", cargarPresupuestos);
// Las altas que salen de una consulta (dominios/crm.js, hist. §90).
registrar("nuevo:presupuesto", (desde) => abrirModalPresupuesto(null, desde));
registrar("nuevo:venta", (desde) => abrirModalVenta(null, desde));
// Las filas de renglones de venta, para los trabajos (dominios/trabajos.js):
// leen el catálogo, que vive acá.
registrar("items:agregarFila", (contenedor) => agregarFilaItemVenta(contenedor, productos, false));
registrar("items:cargar", cargarFilasItems);
registrar("items:leer", leerItemsVenta);
registrar("items:total", totalItems);
registrar("cobrar:venta", abrirModalCobrarVenta);
registrar("pagar:compra", abrirModalPagarCompra);

mostrarVista(vistaDesdeHash() ?? "dashboard", { actualizarHash: false, subruta: subrutaDesdeHash() });
