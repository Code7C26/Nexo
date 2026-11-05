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

// La línea chica de una tarjeta del Resumen: solo la forma, sin ejes ni
// cifras (la cifra es la de la tarjeta). Se estira al ancho de la tarjeta
// con preserveAspectRatio="none", y vector-effect deja el trazo en 1,5px
// aunque se estire. El último punto va marcado: es el período más nuevo.
// Con menos de dos períodos no hay forma que mostrar.
export function lineaChica(valores) {
  if (valores.length < 2) return "";
  const W = 100;
  const H = 32;
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const alto = max - min || 1;
  const puntos = valores.map((v, i) => [(i / (valores.length - 1)) * W, 3 + (1 - (v - min) / alto) * (H - 6)]);
  const linea = puntos.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join("");
  const [xf, yf] = puntos.at(-1);
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" focusable="false">
      <path class="linea-chica-area" d="${linea}L${W},${H}L0,${H}Z" />
      <path class="linea-chica" d="${linea}" />
    </svg>
    <span class="linea-chica-punto" style="left:${xf.toFixed(2)}%;top:${((yf / H) * 100).toFixed(2)}%"></span>`;
}

// La tendencia del Resumen: un área para lo vendido y una línea para lo que
// se ganó, sobre el mismo eje en pesos (las dos son plata del mismo
// período). Se dibuja al ancho real y se redibuja si cambia, como las
// columnas; al señalar un período, una guía vertical y el detalle.
//   montarArea(contenedor, { titulo }) devuelve dibujar(serie, opciones), con
//   opciones { etiqueta(p), series: [{ clase, valor(p), area }], corto(n),
//   detalle(p) → [[nombre, texto], ...], vacio }
export function montarArea(contenedor, { titulo }) {
  let serie = [];
  let opciones = null;
  let anchoDibujado = 0;
  let ocultarTip = () => {};

  new ResizeObserver(() => {
    if (opciones && Math.round(contenedor.clientWidth) !== anchoDibujado) dibujar(false);
  }).observe(contenedor);
  document.addEventListener("pointerdown", (e) => {
    if (!contenedor.contains(e.target)) ocultarTip();
  });

  function dibujar(animar) {
    const { etiqueta, series, corto, detalle, vacio } = opciones;
    const hayDatos = serie.some((p) => series.some((s) => s.valor(p) !== 0));
    if (serie.length < 2 || !hayDatos) {
      anchoDibujado = 0;
      const texto = serie.length < 2 && hayDatos ? "Elegí un período más largo para ver cómo viene." : vacio ?? "Sin ventas en este período.";
      contenedor.innerHTML = `<p class="tabla-vacia">${esc(texto)}</p>`;
      return;
    }
    const W = Math.round(contenedor.clientWidth);
    if (W === 0) return;
    anchoDibujado = W;
    const H = W < 480 ? 210 : 330;
    const M = { top: 12, right: 8, bottom: 28, left: 52 };
    const pw = W - M.left - M.right;
    const ph = H - M.top - M.bottom;

    const todos = serie.flatMap((p) => series.map((s) => s.valor(p)));
    let maxV = Math.max(0, ...todos);
    let minV = Math.min(0, ...todos);
    if (maxV === minV) maxV = 1;
    const paso = pasoRedondo(maxV - minV, 4);
    maxV = Math.ceil(maxV / paso) * paso;
    minV = Math.floor(minV / paso) * paso;
    const y = (v) => M.top + ((maxV - v) / (maxV - minV)) * ph;
    const x = (i) => M.left + (i / (serie.length - 1)) * pw;
    const ultima = serie.length - 1;

    const marcas = [];
    for (let v = minV; v <= maxV + paso / 2; v += paso) marcas.push(v);
    const ejeY = marcas
      .map((v) => {
        const yv = y(v).toFixed(1);
        return `<line class="${v === 0 ? "grafico-base" : "grafico-grilla"}" x1="${M.left}" y1="${yv}" x2="${W - M.right}" y2="${yv}" />
        <text x="${M.left - 8}" y="${yv}" text-anchor="end" dominant-baseline="middle">${esc(corto(v))}</text>`;
      })
      .join("");

    // Las etiquetas del eje X que entran sin pisarse: la primera, la última y,
    // del medio, las que dejan aire con la anterior y con la última. La primera
    // va alineada a la izquierda y la última a la derecha, así que cada una
    // ocupa distinto: se mide el borde de cada una (~7,4px por carácter).
    const banda = pw / ultima;
    const bordes = (i) => {
      const w = String(etiqueta(serie[i])).length * 7.4;
      if (i === 0) return [x(0), x(0) + w];
      if (i === ultima) return [x(ultima) - w, x(ultima)];
      return [x(i) - w / 2, x(i) + w / 2];
    };
    const inicioUltima = bordes(ultima)[0];
    // Si la primera y la última no entran juntas (muy angosto), va la última.
    const visibles = new Set(inicioUltima >= bordes(0)[1] + 8 ? [0, ultima] : [ultima]);
    let finAnterior = visibles.has(0) ? bordes(0)[1] : -Infinity;
    for (let k = 1; k < ultima; k++) {
      const [izq, der] = bordes(k);
      if (izq >= finAnterior + 10 && der <= inicioUltima - 10) {
        visibles.add(k);
        finAnterior = der;
      }
    }
    const etiquetasX = serie
      .map((p, k) => {
        if (!visibles.has(k)) return "";
        const ancla = k === 0 ? "start" : k === ultima ? "end" : "middle";
        return `<text x="${x(k).toFixed(1)}" y="${H - 8}" text-anchor="${ancla}">${esc(etiqueta(p))}</text>`;
      })
      .join("");

    const trazo = (valor) => serie.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(valor(p)).toFixed(1)}`).join("");
    const y0 = y(Math.max(minV, 0)).toFixed(1);
    const dibujos = series
      .map((s) => {
        const d = trazo(s.valor);
        const area = s.area ? `<path class="area-relleno ${esc(s.clase)}" d="${d}L${x(ultima).toFixed(1)},${y0}L${x(0).toFixed(1)},${y0}Z" />` : "";
        return `${area}<path class="area-linea ${esc(s.clase)}" d="${d}" />`;
      })
      .join("");

    // Franjas invisibles para el mouse y el dedo, una por período.
    const franjas = serie
      .map((_, i) => {
        const x0 = Math.max(M.left, x(i) - banda / 2);
        const x1 = Math.min(W - M.right, x(i) + banda / 2);
        return `<rect class="area-franja" data-i="${i}" x="${x0.toFixed(1)}" y="${M.top}" width="${(x1 - x0).toFixed(1)}" height="${ph}" />`;
      })
      .join("");

    const descripcion = `${titulo}, de ${etiqueta(serie[0])} a ${etiqueta(serie[ultima])}. Con las flechas se recorre período por período.`;
    contenedor.innerHTML = `
      <svg class="${animar ? "area-animar" : ""}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" tabindex="0">
        <title>${esc(descripcion)}</title>
        ${ejeY}
        <g class="area-dibujo">${dibujos}</g>
        <line class="area-guia" x1="0" y1="${M.top}" x2="0" y2="${M.top + ph}" visibility="hidden" />
        ${series.map((s) => `<circle class="area-punto ${esc(s.clase)}" r="4" visibility="hidden" />`).join("")}
        ${etiquetasX}
        ${franjas}
      </svg>
      <div class="grafico-tip" hidden></div>`;

    const svg = contenedor.querySelector("svg");
    const tip = contenedor.querySelector(".grafico-tip");
    const guia = svg.querySelector(".area-guia");
    const puntos = [...svg.querySelectorAll(".area-punto")];
    let activo = null;
    const mostrar = (i) => {
      activo = i;
      const p = serie[i];
      guia.setAttribute("x1", x(i));
      guia.setAttribute("x2", x(i));
      guia.setAttribute("visibility", "visible");
      puntos.forEach((c, k) => {
        c.setAttribute("cx", x(i));
        c.setAttribute("cy", y(series[k].valor(p)));
        c.setAttribute("visibility", "visible");
      });
      const filas = detalle(p)
        .map(([nombre, texto]) => `<div><dt>${esc(nombre)}</dt><dd>${esc(texto)}</dd></div>`)
        .join("");
      tip.innerHTML = `<strong>${esc(etiqueta(p))}${p.parcial ? " (en curso)" : ""}</strong><dl>${filas}</dl>`;
      tip.hidden = false;
      const ancho = tip.offsetWidth;
      tip.style.left = `${x(i) + 16 + ancho <= W ? x(i) + 16 : Math.max(0, x(i) - 16 - ancho)}px`;
    };
    const ocultar = () => {
      activo = null;
      guia.setAttribute("visibility", "hidden");
      puntos.forEach((c) => c.setAttribute("visibility", "hidden"));
      tip.hidden = true;
    };
    ocultarTip = ocultar;
    svg.addEventListener("pointerover", (e) => {
      const franja = e.target.closest(".area-franja");
      if (franja) mostrar(Number(franja.dataset.i));
    });
    svg.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse") ocultar();
    });
    svg.addEventListener("focus", () => mostrar(activo ?? ultima));
    svg.addEventListener("blur", ocultar);
    svg.addEventListener("keydown", (e) => {
      const destino = { ArrowLeft: (activo ?? 0) - 1, ArrowRight: (activo ?? -1) + 1, Home: 0, End: ultima }[e.key];
      if (destino === undefined) return;
      e.preventDefault();
      mostrar(Math.min(ultima, Math.max(0, destino)));
    });
  }

  return (nuevaSerie, nuevasOpciones) => {
    serie = nuevaSerie;
    opciones = nuevasOpciones;
    dibujar(true);
  };
}

// Una dona para repartir un total entre pocas partes (dónde entró la plata).
// Hasta tres partes con su color (--serie-1 a 3, validados para quien no
// distingue colores) y el resto junto en "Otras", en gris: un cuarto color ya
// no se distingue bien. Al lado, la lista con el nombre, la cifra y el
// porcentaje, así el color nunca es lo único que dice cuál es cuál.
//   lista: filas ya ordenadas de mayor a menor; nombre(f), valor(f), cifra(n)
//   serie(f), opcional: la clase de color de cada fila ("serie-1"), para que
//   algo tenga siempre el mismo color (un canal); las que no tienen van
//   juntas en `otras`. Sin serie(f), las tres más grandes.
export function dona(lista, { nombre, valor, cifra, centro, serie, otras = "Otras", vacio = "Sin datos en este período." }) {
  const positivas = lista.filter((f) => valor(f) > 0);
  if (positivas.length === 0) return `<p class="tabla-vacia">${esc(vacio)}</p>`;
  const conColor = serie ? positivas.filter((f) => serie(f)) : positivas.slice(0, 3);
  const partes = conColor.map((f, i) => ({ nombre: nombre(f), valor: valor(f), clase: serie ? serie(f) : `serie-${i + 1}` }));
  const resto = positivas.filter((f) => !conColor.includes(f)).reduce((acc, f) => acc + valor(f), 0);
  if (resto > 0) partes.push({ nombre: otras, valor: resto, clase: "serie-otras" });
  const total = partes.reduce((acc, p) => acc + p.valor, 0);

  // Cada parte es un arco del mismo círculo (stroke-dasharray), con aire
  // entre una y otra para que se separen sin depender del color.
  const R = 42;
  const largo = 2 * Math.PI * R;
  const aire = partes.length > 1 ? 1.5 : 0;
  let recorrido = 0;
  const arcos = partes
    .map((p) => {
      const tramo = (p.valor / total) * largo;
      const lleno = Math.max(tramo - aire, 0.5);
      const arco = `<circle class="dona-arco ${esc(p.clase)}" r="${R}" cx="50" cy="50" stroke-dasharray="${lleno.toFixed(2)} ${(largo - lleno).toFixed(
        2
      )}" stroke-dashoffset="${(-recorrido).toFixed(2)}" />`;
      recorrido += tramo;
      return arco;
    })
    .join("");
  const pct = (v) => `${Math.round((v / total) * 100)} %`;
  const resumen = partes.map((p) => `${p.nombre}: ${pct(p.valor)}`).join(", ");
  const leyenda = partes
    .map(
      (p) => `<li>
          <span class="leyenda-marca ${esc(p.clase)}" aria-hidden="true"></span>
          <span class="dona-nombre">${esc(p.nombre)}</span>
          <span class="dona-cifra">${esc(cifra(p.valor))}</span>
          <span class="dona-pct">${esc(pct(p.valor))}</span>
        </li>`
    )
    .join("");
  return `
    <div class="dona">
      <div class="dona-grafico">
        <svg viewBox="0 0 100 100" role="img" aria-label="${esc(resumen)}">
          <circle class="dona-fondo" r="${R}" cx="50" cy="50" />
          <g transform="rotate(-90 50 50)">${arcos}</g>
        </svg>
        <div class="dona-centro"><span class="dona-total">${esc(cifra(total))}</span><span class="dona-etiqueta">${esc(centro)}</span></div>
      </div>
      <ul class="dona-leyenda">${leyenda}</ul>
    </div>`;
}
