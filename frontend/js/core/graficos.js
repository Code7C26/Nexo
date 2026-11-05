/**
 * core/graficos.js
 * Las piezas de dibujo del Resumen (hist. §136), sin librería: el proyecto no
 * tiene build step ni dependencias en el navegador. Los colores salen de los
 * tokens de styles.css, que ya cambian con el tema: nada se redibuja al pasar
 * de claro a oscuro.
 */

import { esc } from "./formato.js";

// Paso "redondo" (1, 2 o 5 × 10^n) para que las marcas del eje Y caigan
// en cifras que se leen de un vistazo ($20k, $40k) y no en $37.412.
export function pasoRedondo(span, marcas) {
  const crudo = span / marcas;
  const magnitud = 10 ** Math.floor(Math.log10(crudo));
  const n = crudo / magnitud;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * magnitud;
}

// Barra con la punta redondeada (4px) y la base recta sobre la línea del
// 0: hacia arriba si el valor es a favor, hacia abajo si es en contra.
export function pathBarra(x, y0, ancho, alto, haciaArriba) {
  const r = Math.min(4, ancho / 2, alto);
  const f = (n) => n.toFixed(1);
  const punta = haciaArriba ? y0 - alto : y0 + alto;
  const curva = haciaArriba ? punta + r : punta - r;
  return `M${f(x)},${f(y0)}V${f(curva)}Q${f(x)},${f(punta)} ${f(x + r)},${f(punta)}H${f(x + ancho - r)}Q${f(
    x + ancho
  )},${f(punta)} ${f(x + ancho)},${f(curva)}V${f(y0)}Z`;
}

// Un ranking en barras horizontales (lo más vendido, dónde entró la plata,
// quién vendió): nombre y cifra arriba, la barra abajo, a lo ancho que haya.
// Es HTML y no SVG a propósito: el nombre largo se corta solo, se lee igual
// en el celular y el lector de pantalla lo recorre como una lista. La barra
// mide contra la más grande; una cifra negativa (devoluciones de más) queda
// sin barra y en rojo.
//   lista: filas; nombre(f), valor(f) (número), cifra(f) y detalle(f) (texto ya formateado)
export function barrasHorizontales(lista, { nombre, valor, cifra, detalle = () => "", maximo = 8, vacio = "Sin datos en este período." }) {
  const filas = lista.slice(0, maximo);
  if (filas.length === 0) return `<p class="tabla-vacia">${esc(vacio)}</p>`;
  const tope = Math.max(...filas.map(valor), 0);
  return `<ol class="ranking">${filas
    .map((f) => {
      const v = valor(f);
      const ancho = tope > 0 && v > 0 ? Math.max(1.5, (v / tope) * 100) : 0;
      const extra = detalle(f);
      return `
      <li class="ranking-fila">
        <div class="ranking-cabeza">
          <span class="ranking-nombre">${esc(nombre(f))}</span>
          <span class="ranking-cifra${v < 0 ? " saldo-negativo" : ""}">${esc(cifra(f))}</span>
        </div>
        <div class="ranking-barra" aria-hidden="true"><span style="width:${ancho.toFixed(1)}%"></span></div>
        ${extra ? `<span class="ranking-detalle">${esc(extra)}</span>` : ""}
      </li>`;
    })
    .join("")}</ol>`;
}

// Columnas (cuándo se vende: por día de la semana, por hora). Se dibuja al
// ancho real del contenedor y se redibuja si cambia, como el gráfico del
// resultado. La columna más alta va en azul (el dato clave); señalar otra,
// con el mouse, el dedo o las flechas, la lee en la línea de abajo, que de
// partida dice cuál es la más alta.
//   contenedor: el elemento; titulo: para el lector de pantalla
//   montar() devuelve dibujar(serie, { etiqueta, valor, leer }), donde
//   leer(p) es la frase de una columna ("Sábado: $ 120.000 en 14 ventas").
export function montarColumnas(contenedor, { titulo }) {
  let serie = [];
  let opciones = null;
  let anchoDibujado = 0;

  new ResizeObserver(() => {
    if (opciones && Math.round(contenedor.clientWidth) !== anchoDibujado) dibujar(false);
  }).observe(contenedor);

  function dibujar(animar) {
    const { etiqueta, valor, leer, vacio } = opciones;
    const tope = Math.max(0, ...serie.map(valor));
    if (serie.length === 0 || tope === 0) {
      anchoDibujado = 0;
      contenedor.innerHTML = `<p class="tabla-vacia">${esc(vacio ?? "Sin ventas en este período.")}</p>`;
      return;
    }
    const W = Math.round(contenedor.clientWidth);
    if (W === 0) return;
    anchoDibujado = W;
    const H = W < 480 ? 150 : 170;
    const M = { top: 8, right: 2, bottom: 24, left: 2 };
    const ph = H - M.top - M.bottom;
    const banda = (W - M.left - M.right) / serie.length;
    const ancho = Math.max(3, Math.min(28, banda * 0.66, banda - 2));
    const centro = (i) => M.left + banda * i + banda / 2;
    const y0 = M.top + ph;
    const iMax = serie.findIndex((p) => valor(p) === tope);

    // Cuántas etiquetas entran sin pisarse (~7px por carácter a 12px).
    const largo = Math.max(...serie.map((p) => String(etiqueta(p)).length));
    const cada = Math.max(1, Math.ceil((largo * 7 + 8) / banda));

    const columnas = serie
      .map(
        (_, i) =>
          `<rect class="grafico-col" data-i="${i}" x="${(M.left + banda * i).toFixed(1)}" y="${M.top}" width="${banda.toFixed(1)}" height="${ph}" />`
      )
      .join("");
    const barras = serie
      .map((p, i) => {
        const v = valor(p);
        if (v <= 0) return "";
        const alto = Math.max((v / tope) * ph, 2);
        return `<path class="grafico-barra columnas-barra${i === iMax ? " is-max" : ""}" d="${pathBarra(centro(i) - ancho / 2, y0, ancho, alto, true)}" />`;
      })
      .join("");
    const etiquetas = serie
      .map((p, i) =>
        i % cada === 0 || i === iMax
          ? `<text x="${centro(i).toFixed(1)}" y="${H - 6}" text-anchor="middle"${i === iMax ? ' class="is-max"' : ""}>${esc(etiqueta(p))}</text>`
          : ""
      )
      .join("");

    contenedor.innerHTML = `
      <svg class="${animar ? "grafico-animar" : ""}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" tabindex="0">
        <title>${esc(`${titulo}. La más alta: ${leer(serie[iMax])}. Con las flechas se recorre una por una.`)}</title>
        ${columnas}
        <line class="grafico-base" x1="${M.left}" y1="${y0}" x2="${W - M.right}" y2="${y0}" />
        ${barras}
        ${etiquetas}
      </svg>
      <p class="columnas-lectura" aria-live="polite"></p>`;
    enlazar(iMax);
  }

  function enlazar(iMax) {
    const svg = contenedor.querySelector("svg");
    const lectura = contenedor.querySelector(".columnas-lectura");
    const cols = [...svg.querySelectorAll(".grafico-col")];
    let activa = null;
    const mostrar = (i) => {
      activa = i;
      cols.forEach((c, j) => c.classList.toggle("is-activa", j === i));
      lectura.textContent = i === iMax ? `La más alta · ${opciones.leer(serie[i])}` : opciones.leer(serie[i]);
    };
    const volver = () => {
      activa = null;
      cols.forEach((c) => c.classList.remove("is-activa"));
      lectura.textContent = `La más alta · ${opciones.leer(serie[iMax])}`;
    };
    volver();
    svg.addEventListener("pointerover", (e) => {
      const col = e.target.closest(".grafico-col");
      if (col) mostrar(Number(col.dataset.i));
    });
    svg.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse") volver();
    });
    svg.addEventListener("blur", volver);
    svg.addEventListener("keydown", (e) => {
      const destino = { ArrowLeft: (activa ?? iMax) - 1, ArrowRight: (activa ?? iMax) + 1, Home: 0, End: serie.length - 1 }[e.key];
      if (destino === undefined) return;
      e.preventDefault();
      mostrar(Math.min(serie.length - 1, Math.max(0, destino)));
    });
  }

  return (nuevaSerie, nuevasOpciones) => {
    serie = nuevaSerie;
    opciones = nuevasOpciones;
    dibujar(true);
  };
}
