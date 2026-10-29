/**
 * core/comprobante.js
 * Comprobante imprimible y descarga de PDF (CLAUDE.md §16).
 * Movido tal cual desde app.js (CLAUDE.md §31, Etapa B / F2).
 */

import { esc, fechaAR, money, numero } from "./formato.js";
import { condicionFiscal, condicionIvaCliente } from "./fiscal.js";
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
//
// `iva` es solo de una factura o nota (hist. §113): { letra, importe,
// condicionCliente }. La A discrimina el IVA debajo de los renglones; la B de
// un inscripto informa el IVA contenido (Ley 27.743, transparencia fiscal al
// consumidor). Un presupuesto no lo pasa.
function lineasDeIva(iva, total) {
  if (!iva) return "";
  if (iva.letra === "A") {
    return `
      <p class="hoja-subtotal"><span>Neto gravado</span> <span>${money(total - iva.importe)}</span></p>
      <p class="hoja-subtotal"><span>IVA</span> <span>${money(iva.importe)}</span></p>`;
  }
  return iva.importe > 0
    ? `<p class="hoja-subtotal"><span>IVA contenido (Ley 27.743)</span> <span>${money(iva.importe)}</span></p>`
    : "";
}

/* ---------- Factura electrónica (etapa E, CLAUDE.md §33) ---------- */

// El QR de la RG 4892 lo dibuja qrcode-generator (MIT, vendorizada como
// jsPDF). Se baja apenas carga este módulo, para que esté al imprimir; quien
// imprime una factura igual espera cargarQr() antes de armar la hoja.
const VENDOR_QR = "/js/vendor/qrcode.js";
let qrPromesa = null;
export function cargarQr() {
  if (window.qrcode) return Promise.resolve();
  qrPromesa ??= new Promise((ok, mal) => {
    const s = document.createElement("script");
    s.src = VENDOR_QR;
    s.onload = ok;
    s.onerror = () => {
      qrPromesa = null;
      mal(new Error(`No se pudo cargar ${VENDOR_QR}`));
    };
    document.body.appendChild(s);
  });
  return qrPromesa;
}
cargarQr().catch(() => {});

// Una imagen (GIF en data:) y no un SVG: html2canvas, el del PDF, la copia tal
// cual.
function imagenQr(url) {
  if (!window.qrcode) return "";
  const qr = window.qrcode(0, "M");
  qr.addData(url);
  qr.make();
  return `<img class="hoja-qr" src="${qr.createDataURL(4, 0)}" alt="Código QR del comprobante en ARCA" />`;
}

/* ---------- La factura, con el formato de las de ARCA (hist. §116) ---------- */

// Como el "Comprobante en línea" de ARCA: la letra en una caja al medio con su
// código, quien emite a la izquierda, los datos del comprobante a la derecha,
// el recuadro de para quién es, los renglones con código y unidad, los totales
// según la letra y, al pie, el QR con el CAE. Los datos de los dos lados son la
// foto que se tomó al hacerla (f.emisor y los del receptor); una factura
// anterior a la foto usa los datos de hoy del negocio.

const TIPO_TITULO = { factura: "FACTURA", nota_credito: "NOTA DE CRÉDITO", nota_debito: "NOTA DE DÉBITO" };
const UNIDAD_FACTURA = { unidad: "unidades", kg: "kilogramos", g: "gramos", l: "litros", ml: "mililitros", m: "metros", hora: "horas" };
const VENTA_TEXTO = {
  contado: "Contado",
  cuenta_corriente: "Cuenta corriente",
  transferencia: "Transferencia bancaria",
  tarjeta_debito: "Tarjeta de débito",
  tarjeta_credito: "Tarjeta de crédito",
  cheque: "Cheque",
  otra: "Otra"
};

// 1234.5 → "1.234,50": sin el signo, como los importes de una factura de ARCA.
const importeFactura = (n) =>
  Number(n ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const conCeros = (n, largo) => (n == null ? "—" : String(n).padStart(largo, "0"));
const datoFactura = (etiqueta, valor) =>
  `<p><span class="fac-etiqueta">${esc(etiqueta)}</span> ${esc(valor || "—")}</p>`;

// El IVA de cada alícuota sale del total de esa alícuota, igual que lo que se le
// informa a ARCA (importesDelComprobante en backend/arca.js).
function ivaPorAlicuota(renglones) {
  const grupos = new Map();
  for (const r of renglones) {
    const clave = r.alicuota ?? "21";
    grupos.set(clave, (grupos.get(clave) ?? 0) + r.importe);
  }
  return [...grupos].map(([clave, total]) => {
    const tasa = Number(clave);
    const iva = Number.isFinite(tasa) && tasa > 0 ? Math.round((total - total / (1 + tasa / 100)) * 100) / 100 : 0;
    return { clave, tasa, total, iva };
  });
}

function totalesFactura(f, renglones) {
  const fila = (etiqueta, valor, clase = "") =>
    `<p class="fac-total ${clase}"><span>${esc(etiqueta)}</span> <span>${importeFactura(valor)}</span></p>`;
  if (f.letra !== "A") {
    return fila("Subtotal: $", f.total) + fila("Importe Otros Tributos: $", 0) + fila("Importe Total: $", f.total, "fac-total-final");
  }
  // La A discrimina: neto gravado, el IVA de cada alícuota (las de ARCA, de
  // mayor a menor), exento y no gravado aparte.
  const grupos = ivaPorAlicuota(renglones);
  const gravados = grupos.filter((g) => Number.isFinite(g.tasa));
  const sumar = (lista, campo) => lista.reduce((s, g) => s + g[campo], 0);
  const neto = sumar(gravados, "total") - sumar(gravados, "iva");
  const exento = sumar(grupos.filter((g) => g.clave === "exento"), "total");
  const noGravado = sumar(grupos.filter((g) => g.clave === "no_gravado"), "total");
  const ivas = [27, 21, 10.5, 5, 2.5, 0].map((tasa) => {
    const grupo = gravados.find((g) => g.tasa === tasa);
    return fila(`IVA ${String(tasa).replace(".", ",")}%: $`, grupo?.iva ?? 0);
  });
  return [
    fila("Importe Neto Gravado: $", neto),
    ...ivas,
    noGravado ? fila("Importe Neto No Gravado: $", noGravado) : "",
    exento ? fila("Importe Exento: $", exento) : "",
    fila("Importe Otros Tributos: $", 0),
    fila("Importe Total: $", f.total, "fac-total-final")
  ].join("");
}

// f: lo que devuelve GET /api/facturas/:id.
export function armarHojaFactura(f) {
  const emisor = f.emisor ?? negocio;
  const electronica = Boolean(f.arca_estado);
  const discrimina = f.letra === "A";

  // Una factura suelta no tiene renglones: su concepto es el único.
  const renglones = (f.items?.length ? f.items : [{ producto: f.concepto, cantidad: 1, precio_unitario: f.total, unidad: "unidad", alicuota_iva: f.alicuota_iva }]).map(
    (i) => ({ ...i, importe: i.cantidad * i.precio_unitario, alicuota: i.alicuota_iva })
  );
  const filas = renglones
    .map((r) => {
      const tasa = Number(r.alicuota ?? "21");
      const divisor = discrimina && Number.isFinite(tasa) ? 1 + tasa / 100 : 1;
      const sinIva = r.importe / divisor;
      return `
        <tr>
          <td>${esc(r.codigo ?? "")}</td>
          <td>${esc(r.producto)}</td>
          <td class="num">${importeFactura(r.cantidad)}</td>
          <td>${esc(UNIDAD_FACTURA[r.unidad] ?? r.unidad ?? "unidades")}</td>
          <td class="num">${importeFactura(sinIva / r.cantidad)}</td>
          <td class="num">0,00</td>
          ${
            discrimina
              ? `<td class="num">${importeFactura(sinIva)}</td>
                 <td class="num">${esc(Number.isFinite(tasa) ? `${String(tasa).replace(".", ",")}%` : r.alicuota === "exento" ? "Exento" : "No gravado")}</td>
                 <td class="num">${importeFactura(r.importe)}</td>`
              : `<td class="num">0,00</td><td class="num">${importeFactura(r.importe)}</td>`
          }
        </tr>`;
    })
    .join("");
  const encabezado = discrimina
    ? "<th>Código</th><th>Producto / Servicio</th><th>Cantidad</th><th>U. Medida</th><th>Precio Unit.</th><th>% Bonif</th><th>Subtotal</th><th>Alícuota IVA</th><th>Subtotal c/IVA</th>"
    : "<th>Código</th><th>Producto / Servicio</th><th>Cantidad</th><th>U. Medida</th><th>Precio Unit.</th><th>% Bonif</th><th>Imp. Bonif.</th><th>Subtotal</th>";

  // La caja de la letra: la del comprobante con su código de ARCA, o una X si es
  // un comprobante interno (no es una factura).
  const caja = electronica
    ? `<span class="fac-letra-letra">${esc(f.letra)}</span><span class="fac-letra-cod">COD. ${esc(conCeros(f.codigo_comprobante, 3))}</span>`
    : `<span class="fac-letra-letra">X</span><span class="fac-letra-cod">No válido como factura</span>`;

  const periodo =
    f.periodo_desde || f.periodo_hasta || f.vencimiento_pago
      ? `<section class="fac-periodo">
           <p><span class="fac-etiqueta">Período Facturado Desde:</span> ${esc(fechaAR(f.periodo_desde ?? f.fecha))}</p>
           <p><span class="fac-etiqueta">Hasta:</span> ${esc(fechaAR(f.periodo_hasta ?? f.fecha))}</p>
           <p><span class="fac-etiqueta">Fecha de Vto. para el pago:</span> ${esc(fechaAR(f.vencimiento_pago ?? f.fecha))}</p>
         </section>`
      : "";

  const documento = String(f.cliente_documento ?? "").replace(/\D/g, "");
  const etiquetaDoc = documento.length === 11 ? "CUIT:" : documento ? "DNI:" : "Documento:";

  // B de un inscripto: el IVA contenido (Ley 27.743, transparencia fiscal).
  const transparencia =
    f.letra === "B" && f.iva > 0
      ? `<section class="fac-transparencia">
           <p class="fac-etiqueta">Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)</p>
           <p><span>IVA Contenido: $</span> <span>${importeFactura(f.iva)}</span></p>
         </section>`
      : "";

  const observaciones = (f.arca_observaciones ?? []).length
    ? `<div class="fac-observaciones">${f.arca_observaciones.map((o) => `<p>${esc(o.mensaje)}</p>`).join("")}</div>`
    : "";

  return `
    <div class="hoja hoja-factura">
      <p class="fac-copia">ORIGINAL</p>
      <header class="fac-cabecera">
        <div class="fac-emisor">
          <p class="fac-emisor-nombre">${esc(emisor.nombre || "—")}</p>
          ${datoFactura("Razón Social:", emisor.razon_social || emisor.nombre)}
          ${datoFactura("Domicilio Comercial:", emisor.direccion)}
          ${datoFactura("Condición frente al IVA:", condicionFiscal(emisor.condicion_iva))}
        </div>
        <div class="fac-letra">${caja}</div>
        <div class="fac-datos">
          <p class="fac-tipo">${esc(TIPO_TITULO[f.tipo] ?? "FACTURA")}</p>
          <p class="fac-numero">
            <span><span class="fac-etiqueta">Punto de Venta:</span> ${esc(conCeros(f.punto_venta, 5))}</span>
            <span><span class="fac-etiqueta">Comp. Nro:</span> ${esc(conCeros(f.numero, 8))}</span>
          </p>
          ${datoFactura("Fecha de Emisión:", fechaAR(f.fecha))}
          ${datoFactura("CUIT:", emisor.documento?.replace(/-/g, ""))}
          ${datoFactura("Ingresos Brutos:", emisor.ingresos_brutos)}
          ${datoFactura("Fecha de Inicio de Actividades:", emisor.inicio_actividades ? fechaAR(emisor.inicio_actividades) : "")}
        </div>
      </header>
      ${periodo}
      <section class="fac-receptor">
        ${datoFactura(etiquetaDoc, documento)}
        ${datoFactura("Apellido y Nombre / Razón Social:", f.receptor_nombre ?? f.cliente)}
        ${datoFactura("Condición frente al IVA:", condicionIvaCliente(f.cliente_condicion_iva))}
        ${datoFactura("Domicilio:", f.cliente_direccion)}
        ${datoFactura("Condición de venta:", VENTA_TEXTO[f.condicion_venta] ?? "Contado")}
      </section>
      <table class="fac-items">
        <thead><tr>${encabezado}</tr></thead>
        <tbody>${filas}</tbody>
      </table>
      <section class="fac-totales">${totalesFactura(f, renglones)}</section>
      ${transparencia}
      ${emisor.pie_comprobante ? `<p class="fac-leyenda">${esc(emisor.pie_comprobante)}</p>` : ""}
      ${observaciones}
      <footer class="fac-pie">${pieFactura(f)}</footer>
      ${negocio.plan?.marca ? `<p class="hoja-marca">Hecho con Nexo · gestión para tu negocio</p>` : ""}
    </div>`;
}

// El pie: el QR y el CAE si ARCA lo autorizó; si no, qué es este papel.
function pieFactura(f) {
  if (f.arca_estado === "autorizado") {
    const qr = f.arca_qr ? imagenQr(f.arca_qr) : "";
    const prueba = f.arca_ambiente !== "produccion";
    return `
      <div class="fac-pie-arca">
        ${qr}
        <div>
          <p class="fac-arca-marca">ARCA</p>
          <p class="fac-arca-autorizado">Comprobante Autorizado</p>
          ${prueba ? `<p class="fac-prueba">Comprobante de prueba – sin validez fiscal</p>` : ""}
        </div>
      </div>
      <p class="fac-pagina">Pág. 1/1</p>
      <div class="fac-cae">
        ${datoFactura("CAE N°:", f.cae)}
        ${datoFactura("Fecha de Vto. de CAE:", fechaAR(f.cae_vencimiento))}
      </div>`;
  }
  if (f.arca_estado) return `<p class="fac-prueba">Comprobante sin autorizar por ARCA: no es válido como factura.</p>`;
  return `<p class="fac-prueba">Documento no válido como comprobante fiscal.</p>`;
}

// El presupuesto (la factura tiene la suya, armarHojaFactura).
export function armarHojaComprobante({ rotulo, comprobanteNro, fecha, campos = [], cliente, items, total, notas, pieExtra, iva }) {
  // En la A los renglones van sin IVA, para que sumen el neto gravado.
  const sinIva = iva?.letra === "A";
  const filas = items
    .map((i) => {
      const subtotal = i.cantidad * i.precio_unitario - (sinIva ? i.iva ?? 0 : 0);
      return `
        <tr>
          <td>${esc(i.producto)}</td>
          <td class="num">${numero(i.cantidad)}</td>
          <td class="num">${money(subtotal / i.cantidad)}</td>
          <td class="num">${money(subtotal)}</td>
        </tr>`;
    })
    .join("");

  return `
    <div class="hoja">
      <header class="hoja-encabezado">
        <div class="hoja-negocio">
          <h1>${esc(negocio.nombre || "—")}</h1>
          ${lineaSiHay("CUIT:", negocio.documento)}
          ${lineaSiHay("", condicionFiscal(negocio.condicion_iva))}
          ${lineaSiHay("", negocio.direccion)}
          ${lineaSiHay("Tel:", negocio.telefono)}
          ${lineaSiHay("", negocio.email)}
        </div>
        <div class="hoja-comprobante">
          <p class="hoja-rotulo">${esc(rotulo)}</p>
          <p class="hoja-numero">${esc(comprobanteNro)}</p>
          <p>${esc(fechaAR(fecha))}</p>
          ${campos.map(([e, v]) => (v ? `<p><span class="hoja-etiqueta">${esc(e)}</span> ${esc(v)}</p>` : "")).join("")}
        </div>
      </header>

      <section class="hoja-cliente">
        <p class="hoja-etiqueta">Cliente</p>
        <p class="hoja-cliente-nombre">${esc(cliente.nombre)}</p>
        ${lineaSiHay("CUIT/DNI:", cliente.documento)}
        ${iva ? lineaSiHay("IVA:", condicionIvaCliente(iva.condicionCliente)) : ""}
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

      ${lineasDeIva(iva, total)}
      <p class="hoja-total"><span>Total</span> <strong>${money(total)}</strong></p>

      ${notas ? `<section class="hoja-notas"><p class="hoja-etiqueta">Notas</p><p>${esc(notas)}</p></section>` : ""}

      <footer class="hoja-pie">
        ${pieExtra ? `<p>${esc(pieExtra)}</p>` : ""}
        ${negocio.pie_comprobante ? `<p>${esc(negocio.pie_comprobante)}</p>` : ""}
        <!-- Un presupuesto no es un comprobante fiscal: decirlo es obligatorio
             para no inducir a error a quien lo recibe. -->
        <p class="hoja-legal">Documento no válido como comprobante fiscal.</p>
        ${negocio.plan?.marca ? `<p class="hoja-marca">Hecho con Nexo · gestión para tu negocio</p>` : ""}
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
const VENDOR_JSPDF = "/js/vendor/jspdf.umd.min.js";
const VENDOR_HTML2CANVAS = "/js/vendor/html2canvas.min.js";

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
