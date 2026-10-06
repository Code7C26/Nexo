/**
 * core/comprobante.js
 * Comprobante imprimible y descarga de PDF (CLAUDE.md §16).
 * Movido tal cual desde app.js (CLAUDE.md §31, Etapa B / F2).
 */

import { esc, money, numero } from "./formato.js";
import { negocio } from "./negocio.js";
import { avisar } from "./ui.js";

/* ---------- Comprobante imprimible ---------- */

// El papel que se le entrega al cliente: presupuesto o factura. Se arma en un
// contenedor propio (#hojaImpresion) y NO reusando la ficha con @media print,
// porque la ficha muestra costo, margen y ganancia — datos internos que no
// pueden salir impresos. Acá solo aparece lo que se pone explícitamente.
//
// El PDF lo hace el navegador: su diálogo de impresión ya trae "Guardar como
// PDF", así que no hace falta ninguna librería (el proyecto no tiene build
// step y no queremos sumar dependencias solo para esto).

const hojaImpresionEl = document.getElementById("hojaImpresion");



// Línea del membrete que solo aparece si el dato existe: un monotributista sin
// local no debería ver un renglón "Dirección: —" en su comprobante.
const lineaSiHay = (etiqueta, valor) =>
  valor ? `<p><span class="hoja-etiqueta">${esc(etiqueta)}</span> ${esc(valor)}</p>` : "";

// Arma el HTML del comprobante. Un solo molde para los dos tipos: cambian el
// rótulo, el número y algún campo, no la estructura.
// OJO con los nombres: el parámetro del número de comprobante NO puede
// llamarse `numero`, porque sombrearía al helper de formato numero() que esta
// misma función usa para las cantidades (y tirar "numero is not a function").
export function armarHojaComprobante({ rotulo, comprobanteNro, fecha, campos = [], cliente, items, total, notas, pieExtra }) {
  const filas = items
    .map(
      (i) => `
        <tr>
          <td>${esc(i.producto)}</td>
          <td class="num">${numero(i.cantidad)}</td>
          <td class="num">${money(i.precio_unitario)}</td>
          <td class="num">${money(i.cantidad * i.precio_unitario)}</td>
        </tr>`
    )
    .join("");

  return `
    <div class="hoja">
      <header class="hoja-encabezado">
        <div class="hoja-negocio">
          <h1>${esc(negocio.nombre || "—")}</h1>
          ${lineaSiHay("CUIT:", negocio.documento)}
          ${lineaSiHay("", negocio.condicion_iva)}
          ${lineaSiHay("", negocio.direccion)}
          ${lineaSiHay("Tel:", negocio.telefono)}
          ${lineaSiHay("", negocio.email)}
        </div>
        <div class="hoja-comprobante">
          <p class="hoja-rotulo">${esc(rotulo)}</p>
          <p class="hoja-numero">${esc(comprobanteNro)}</p>
          <p>${esc(fecha)}</p>
          ${campos.map(([e, v]) => (v ? `<p><span class="hoja-etiqueta">${esc(e)}</span> ${esc(v)}</p>` : "")).join("")}
        </div>
      </header>

      <section class="hoja-cliente">
        <p class="hoja-etiqueta">Cliente</p>
        <p class="hoja-cliente-nombre">${esc(cliente.nombre)}</p>
        ${lineaSiHay("CUIT/DNI:", cliente.documento)}
        ${lineaSiHay("", cliente.direccion)}
        ${lineaSiHay("Tel:", cliente.telefono)}
        ${lineaSiHay("", cliente.email)}
      </section>

      <table class="hoja-items">
        <thead>
          <tr>
            <th>Producto</th>
            <th class="num">Cantidad</th>
            <th class="num">Precio unit.</th>
            <th class="num">Subtotal</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>

      <p class="hoja-total"><span>Total</span> <strong>${money(total)}</strong></p>

      ${notas ? `<section class="hoja-notas"><p class="hoja-etiqueta">Notas</p><p>${esc(notas)}</p></section>` : ""}

      <footer class="hoja-pie">
        ${pieExtra ? `<p>${esc(pieExtra)}</p>` : ""}
        ${negocio.pie_comprobante ? `<p>${esc(negocio.pie_comprobante)}</p>` : ""}
        <!-- Nexo no está conectado a ARCA y no emite CAE: lo impreso es un
             documento interno, no un comprobante fiscal. Decirlo es
             obligatorio para no inducir a error a quien lo recibe. -->
        <p class="hoja-legal">Documento no válido como comprobante fiscal.</p>
      </footer>
    </div>
  `;
}

// Imprime UNA O VARIAS hojas juntas: htmls.join("") las concatena en el
// mismo contenedor y un único window.print() las manda todas al mismo
// diálogo (una página impresa por hoja — ver el break-after en styles.css).
// Así "imprimir 5 facturas seleccionadas" desde el listado es un solo
// diálogo con 5 páginas, no 5 diálogos separados.
export function imprimirHojas(htmls) {
  hojaImpresionEl.innerHTML = htmls.join("");

  // El PDF sale del mismo diálogo (destino "Guardar como PDF"), pero eso no es
  // obvio para quien busca descargar un archivo. Se avisa UNA sola vez por
  // navegador: repetirlo en cada impresión sería ruido para quien ya lo sabe.
  try {
    if (!localStorage.getItem("nexo.avisoPdf")) {
      avisar('Para guardarlo como PDF, elegí "Guardar como PDF" en el destino de impresión.', "ok");
      localStorage.setItem("nexo.avisoPdf", "1");
    }
  } catch {
    // Sin storage disponible (modo privado) el aviso simplemente no se muestra:
    // no vale la pena bloquear una impresión por un mensaje de ayuda.
  }

  window.print();
  // Se vacía después de imprimir para no dejar datos de un cliente colgando
  // en el DOM mientras se navega a otra pantalla.
  hojaImpresionEl.innerHTML = "";
}

// Caso de un solo comprobante: los dos botones de ficha (factura y
// presupuesto) siguen llamando a esta función tal cual, sin enterarse de
// que por dentro ahora es un array de uno.
export function imprimirComprobante(html) {
  imprimirHojas([html]);
}

/* ---------- Descargar PDF (jsPDF + html2canvas) ---------- */

// "Imprimir" (arriba) ya cubre el caso de guardar un PDF: es lo que hace el
// destino "Guardar como PDF" del diálogo del navegador, con texto real y
// seleccionable, sin sumar ninguna dependencia. Esto es otra cosa: el
// usuario pidió poder seleccionar varios comprobantes y que se descarguen
// como archivos separados, uno por comprobante, con nombre propio — el
// navegador no permite eso sin intervención humana (no hay forma de
// disparar N diálogos de impresión ni de nombrar el archivo por JS), así
// que hace falta generar el PDF nosotros. jsPDF arma el archivo, html2canvas
// convierte el HTML de la hoja en una imagen para meter adentro.
//
// Contrapartida que hay que tener presente: el PDF resultante es una
// IMAGEN, no texto seleccionable ni buscable — es la limitación real de
// fotografiar el HTML en vez de redibujar el comprobante en la API de
// jsPDF (que implicaría mantener dos versiones del diseño sincronizadas).
// Por eso conviven los dos botones en vez de reemplazar uno por el otro.

// Vendorizadas en frontend/js/vendor/, servidas por el mismo express.static
// que ya sirve el resto del frontend — sin dependencia de npm ni build step.
const VENDOR_JSPDF = "js/vendor/jspdf.umd.min.js";
const VENDOR_HTML2CANVAS = "js/vendor/html2canvas.min.js";

// No se cargan con <script> en index.html: son ~500KB combinados y solo
// hacen falta si alguien aprieta "Descargar PDF". Memoizada para no volver
// a inyectar los <script> en cada descarga; si la carga falla, se limpia la
// memoización para permitir un reintento (una mala red no debería dejar el
// botón roto para siempre en esa misma sesión de página).
let libsPdfPromesa = null;
function cargarLibsPdf() {
  if (libsPdfPromesa) return libsPdfPromesa;
  const cargarScript = (src) =>
    new Promise((ok, mal) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = ok;
      s.onerror = () => mal(new Error(`No se pudo cargar ${src}`));
      document.body.appendChild(s);
    });
  libsPdfPromesa = Promise.all([cargarScript(VENDOR_JSPDF), cargarScript(VENDOR_HTML2CANVAS)]).catch((err) => {
    libsPdfPromesa = null;
    throw err;
  });
  return libsPdfPromesa;
}

// Crea un contenedor .hoja-render con el HTML de una hoja, lo deja en el DOM
// el tiempo que dure fn(), y lo saca pase lo que pase. Ver el comentario de
// .hoja-render en styles.css: display:none (como #hojaImpresion) no sirve
// acá, html2canvas necesita medir un nodo realmente presente.
async function conHojaVisible(html, fn) {
  const caja = document.createElement("div");
  caja.className = "hoja-render";
  caja.innerHTML = html;
  document.body.appendChild(caja);
  try {
    return await fn(caja.firstElementChild);
  } finally {
    caja.remove();
  }
}

// Sanitiza un nombre de comprobante para usarlo como nombre de archivo:
// Windows prohíbe \ / : * ? " < > | y el comprobante puede traer espacios
// ("B 0001-00000123") que sin normalizar quedarían igual pero es más
// prolijo unificarlos.
export function nombreArchivoPdf(prefijo, identificador) {
  const limpio = String(identificador)
    .toLowerCase()
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${prefijo}-${limpio}.pdf`;
}

// Convierte UNA hoja (el HTML que arma armarHojaComprobante) en un archivo
// PDF y lo descarga. Si la hoja mide más que una página A4 útil (una
// factura con muchos ítems), se reparte en varias páginas del mismo PDF en
// vez de achicar la imagen — una factura larga escalada a una sola página
// quedaría ilegible.
async function descargarPDFDeHoja(html, nombreArchivo) {
  await cargarLibsPdf();
  await conHojaVisible(html, async (hoja) => {
    const canvas = await html2canvas(hoja, { scale: 2, backgroundColor: "#FFFFFF", useCORS: true });
    const pdf = new jspdf.jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

    const MARGEN = 14; // mismo margen que @page en el CSS de impresión
    const anchoUtil = 210 - MARGEN * 2;
    const altoUtil = 297 - MARGEN * 2;
    const altoImg = (canvas.height / canvas.width) * anchoUtil;
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92); // JPEG: una A4 a scale 2 en PNG pesa 1-3MB, en JPEG ~200KB

    if (altoImg <= altoUtil) {
      pdf.addImage(dataUrl, "JPEG", MARGEN, MARGEN, anchoUtil, altoImg);
    } else {
      // Reparte la misma imagen en N páginas, desplazando hacia arriba en
      // cada una (el resto de la imagen queda recortado por los bordes de
      // la página, que es exactamente lo que hace una impresión paginada).
      let restante = altoImg;
      let offsetY = 0;
      while (restante > 0) {
        pdf.addImage(dataUrl, "JPEG", MARGEN, MARGEN - offsetY, anchoUtil, altoImg);
        restante -= altoUtil;
        offsetY += altoUtil;
        if (restante > 0) pdf.addPage();
      }
    }

    pdf.save(nombreArchivo);
  });
}

// Genera y descarga un PDF por cada hoja, EN SERIE (no en paralelo): varios
// html2canvas corriendo a la vez saturan memoria y el hilo principal del
// navegador. El setTimeout(0) entre iteraciones le da un respiro al
// navegador para repintar el contador del botón — sin eso, con el hilo
// principal ocupado generando canvases, "Generando 3/20…" no llegaría a
// verse hasta que todo terminó.
// items: [{ html, nombreArchivo }]. btn: el <button> que disparó la acción,
// para deshabilitarlo y mostrar el progreso mientras dura (puede ser largo:
// unos 0.5-1.5s por hoja).
export async function descargarPDFsEnLote(items, btn) {
  const textoOriginal = btn.textContent;
  btn.disabled = true;
  let fallidos = 0;
  try {
    for (let i = 0; i < items.length; i++) {
      btn.textContent = `Generando ${i + 1}/${items.length}…`;
      await new Promise((r) => setTimeout(r, 0));
      try {
        await descargarPDFDeHoja(items[i].html, items[i].nombreArchivo);
      } catch {
        fallidos++;
      }
    }
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }

  if (fallidos === 0) {
    avisar(`Se descargaron ${items.length} PDF.`, "ok");
  } else {
    avisar(`Se descargaron ${items.length - fallidos} PDF. ${fallidos} fallaron.`, "atencion");
  }
}
