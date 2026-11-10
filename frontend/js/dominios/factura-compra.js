/**
 * dominios/factura-compra.js
 * La compra desde la factura del proveedor (hist. §151). Las fotos o el PDF se
 * pasan a imágenes livianas acá (el PDF, página por página con pdf.js), el
 * servidor las lee y devuelve los renglones ya buscados en el catálogo y en
 * unidades, y app.js los vuelca en el formulario de compra de siempre. Cada
 * renglón muestra de qué línea de la factura salió, cuántas trae cada bulto
 * (se corrige ahí) y cómo se encontró el producto. Nada se guarda hasta que la
 * persona toca Guardar.
 */

import { api } from "../core/api.js";
import { esc, money } from "../core/formato.js";

const VENDOR_PDFJS = "/js/vendor/pdf.min.mjs";
const VENDOR_PDFJS_WORKER = "/js/vendor/pdf.worker.min.mjs";
const PAGINAS_MAX = 4;
// Lo bastante grande para leer la letra chica de una factura, y liviano para
// el celular y para el cupo de la IA.
const LADO_MAX = 1800;
const CALIDAD = 0.82;

class ErrorArchivo extends Error {}

function canvasAImagen(canvas) {
  const dataUrl = canvas.toDataURL("image/jpeg", CALIDAD);
  return { tipo: "image/jpeg", datos: dataUrl.slice(dataUrl.indexOf(",") + 1) };
}

async function fotoAImagen(archivo) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(archivo);
  } catch {
    throw new ErrorArchivo(`No se pudo abrir "${archivo.name}". Probá con una foto JPG o PNG, o una captura de pantalla.`);
  }
  const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const ctx = canvas.getContext("2d");
  // El JPEG no tiene transparencia: una captura PNG con fondo transparente
  // saldría negra.
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvasAImagen(canvas);
}

let pdfjsPromesa = null;
function cargarPdfjs() {
  pdfjsPromesa ??= import(VENDOR_PDFJS)
    .then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = VENDOR_PDFJS_WORKER;
      return pdfjs;
    })
    .catch((err) => {
      pdfjsPromesa = null;
      throw err;
    });
  return pdfjsPromesa;
}

async function pdfAImagenes(archivo, lugar) {
  const pdfjs = await cargarPdfjs();
  let documento;
  try {
    documento = await pdfjs.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()) }).promise;
  } catch {
    throw new ErrorArchivo(`No se pudo abrir el PDF "${archivo.name}".`);
  }
  const imagenes = [];
  for (let n = 1; n <= Math.min(documento.numPages, lugar); n++) {
    const pagina = await documento.getPage(n);
    const base = pagina.getViewport({ scale: 1 });
    const viewport = pagina.getViewport({ scale: LADO_MAX / Math.max(base.width, base.height) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pagina.render({ canvasContext: ctx, canvas, viewport }).promise;
    imagenes.push(canvasAImagen(canvas));
  }
  await documento.destroy();
  return imagenes;
}

// archivos: los que eligió la persona (fotos y/o PDF) → las páginas que se
// mandan a leer, hasta PAGINAS_MAX.
async function archivosAImagenes(archivos) {
  const imagenes = [];
  for (const archivo of archivos) {
    const lugar = PAGINAS_MAX - imagenes.length;
    if (lugar <= 0) break;
    if (archivo.type === "application/pdf" || /\.pdf$/i.test(archivo.name)) {
      imagenes.push(...(await pdfAImagenes(archivo, lugar)));
    } else {
      imagenes.push(await fotoAImagen(archivo));
    }
  }
  return imagenes;
}

// Devuelve lo que leyó el servidor, o null si no se pudo (ya avisado).
export async function leerFactura(archivos, avisar) {
  let imagenes;
  try {
    imagenes = await archivosAImagenes(archivos);
  } catch (err) {
    avisar(err instanceof ErrorArchivo ? err.message : "No se pudo preparar el archivo. Probá con una foto.", "error");
    return null;
  }
  if (!imagenes.length) return null;
  if (archivos.length > imagenes.length && imagenes.length === PAGINAS_MAX) {
    avisar(`Se leen hasta ${PAGINAS_MAX} páginas por factura: el resto quedó afuera.`, "atencion");
  }
  try {
    return await api("/api/compras/leer-comprobante", {
      method: "POST",
      body: { imagenes },
      error: "No se pudo leer la factura."
    });
  } catch {
    return null;
  }
}

/* ---------- Lo que se ve en cada renglón ---------- */

const COINCIDENCIAS = {
  recordado: { texto: "Como la última vez", clase: "es-ok" },
  codigo: { texto: "Por el código", clase: "es-ok" },
  parecido: { texto: "Parecido: revisalo", clase: "es-revisar" },
  nuevo: { texto: "Nuevo: se crea al guardar", clase: "es-nuevo" },
  elegido: { texto: "Elegido por vos", clase: "es-ok" }
};

const redondear = (n) => Math.round(n * 100) / 100;

// Debajo del renglón de la compra: de qué línea de la factura salió, cuántas
// trae cada bulto y cómo se encontró el producto. Cambiar el bulto recalcula
// la cantidad y el costo de cada unidad (el total del renglón no cambia).
export function montarOrigen(fila, item, alCambiar) {
  fila.classList.add("desde-factura");
  fila.dataset.factura = JSON.stringify({ clave: item.clave, descripcion: item.descripcion });
  const origen = document.createElement("div");
  origen.className = "item-origen";
  origen.innerHTML = `
    <span class="item-origen-texto">En la factura: <b>${esc(String(item.cantidad_factura))} × ${esc(item.descripcion)}</b> · ${money(item.total)}</span>
    <label class="item-origen-bulto">Cada uno trae
      <input type="number" class="item-bulto" min="1" step="1" value="${esc(String(item.unidades_por_bulto))}" />
      u.</label>
    <span class="item-origen-estado"></span>
  `;
  fila.appendChild(origen);
  marcarCoincidencia(fila, item.coincidencia);

  const bulto = origen.querySelector(".item-bulto");
  bulto.addEventListener("input", () => {
    const unidades = Number(bulto.value);
    if (!(unidades > 0)) return;
    const cantidad = Math.round(item.cantidad_factura * unidades * 1000) / 1000;
    fila.querySelector(".item-cantidad").value = cantidad;
    fila.querySelector(".item-precio").value = redondear(item.total / cantidad);
    alCambiar();
  });
}

export function marcarCoincidencia(fila, coincidencia) {
  const estado = fila.querySelector(".item-origen-estado");
  if (!estado) return;
  const { texto, clase } = COINCIDENCIAS[coincidencia] ?? COINCIDENCIAS.nuevo;
  estado.className = `item-origen-estado ${clase}`;
  estado.textContent = texto;
}

// Lo que el servidor recuerda de este renglón al guardar la compra.
export function facturaDeFila(fila) {
  if (!fila.dataset.factura) return null;
  const { clave, descripcion } = JSON.parse(fila.dataset.factura);
  return { clave, descripcion, unidades_por_bulto: Number(fila.querySelector(".item-bulto")?.value) || 1 };
}

// Arriba del formulario: qué se leyó y lo que hay que mirar.
export function pintarResumen(el, lectura) {
  const comprobante = [lectura.letra ? `Factura ${lectura.letra}` : "Comprobante", lectura.numero].filter(Boolean).join(" ");
  const avisos = [];
  if (!lectura.proveedor) avisos.push("No se pudo leer quién la emitió: completá el proveedor.");
  if (lectura.diferencia) {
    avisos.push(
      `Lo cargado da ${money(Math.abs(lectura.diferencia))} ${lectura.diferencia > 0 ? "más" : "menos"} que el total de la factura: revisá cantidades y precios.`
    );
  }
  const revisar = lectura.items.filter((i) => i.coincidencia === "parecido" || i.coincidencia === "nuevo").length;
  if (revisar === 1) avisos.push("Hay un producto para revisar: elegí el de tu catálogo o dejalo como nuevo.");
  if (revisar > 1) avisos.push(`Hay ${revisar} productos para revisar: elegí el de tu catálogo o dejalos como nuevos.`);
  el.innerHTML = `
    <p class="compra-factura-titulo">${esc(comprobante)}${lectura.proveedor ? ` de <b>${esc(lectura.proveedor.nombre)}</b>` : ""}${lectura.total ? ` · total ${money(lectura.total)}` : ""}</p>
    <p class="form-note">Los packs y cajas entran en unidades, con el costo de cada una${lectura.precios_sin_iva ? " y el IVA sumado" : ""}. Si un bulto trae otra cantidad, corregila en el renglón: la próxima factura de este proveedor ya sale así.</p>
    ${lectura.percepciones ? `<p class="form-note">Las percepciones (${money(lectura.percepciones)}) no entran al costo de la mercadería.</p>` : ""}
    ${avisos.map((a) => `<p class="compra-factura-aviso">${esc(a)}</p>`).join("")}
  `;
  el.hidden = false;
}
