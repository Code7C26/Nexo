/**
 * dominios/lista-proveedor.js
 * La lista de precios de un proveedor (pedido del usuario, 18 de noviembre de
 * 2026). En la ficha del proveedor: lo que cobra hoy por cada producto, cuánto
 * cambió y las listas cargadas. "Cargar lista" abre una página en dos pasos:
 * pegar el mensaje (o la planilla copiada) o subir el PDF, la planilla o una
 * foto, y revisar lo que Nexo encontró en el catálogo antes de guardar.
 *
 * El texto lo lee el servidor sin IA (backend/lista-proveedor.js); el PDF se
 * pasa a texto acá con pdf.js, y solo si no tiene texto (está escaneado) va
 * como imagen, igual que una foto, a la IA. Los precios se guardan por unidad
 * y con IVA, como el costo de una compra, y no tocan el costo del producto.
 */

import { api } from "../core/api.js";
import { esc, fechaAR, hoyISO, money, numero } from "../core/formato.js";
import { icono } from "../core/iconos.js";
import { mostrarVista } from "../core/router.js";
import { invocar, registrar } from "../core/registro.js";
import { avisar, confirmar, filaVacia } from "../core/ui.js";
import { ErrorArchivo, archivosAImagenes, cargarPdfjs } from "./factura-compra.js";

const ORIGEN_TEXTO = { mensaje: "desde un mensaje", archivo: "desde un archivo", foto: "desde una foto", a_mano: "a mano" };
const COINCIDENCIAS = {
  recordado: { texto: "Como la última vez", clase: "es-ok" },
  codigo: { texto: "Por el código", clase: "es-ok" },
  parecido: { texto: "Parecido: revisalo", clase: "es-revisar" },
  elegido: { texto: "Elegido por vos", clase: "es-ok" }
};
// Cuántos renglones se dibujan a la vez: una lista de miles se busca.
const RENGLONES_A_LA_VEZ = 200;

const redondear = (n) => Math.round(n * 100) / 100;
const normalizar = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
const claveDe = (productoId, varianteId) => `${productoId}:${varianteId ?? ""}`;

// Cuánto cambió un precio contra el anterior, con su flecha.
function cambio(precio, anterior) {
  if (!anterior || !(anterior.precio > 0)) return "";
  const pct = ((precio - anterior.precio) / anterior.precio) * 100;
  if (Math.abs(pct) < 0.05) return `<span class="lista-prov-cambio">Igual que el ${esc(fechaAR(anterior.fecha))}</span>`;
  const sube = pct > 0;
  return `<span class="lista-prov-cambio ${sube ? "sube" : "baja"}">${icono(sube ? "trending-up" : "trending-down")} ${sube ? "+" : "−"}${esc(
    numero(Math.abs(Math.round(pct * 10) / 10))
  )} % contra el ${esc(fechaAR(anterior.fecha))}</span>`;
}

/* ---------- En la ficha del proveedor ---------- */

let proveedorActual = null;
let preciosFicha = [];

async function pintarEnFicha(proveedor) {
  proveedorActual = proveedor;
  const body = document.getElementById("fichaProvListaBody");
  body.innerHTML = filaVacia(5, "Cargando…");
  const { precios, listas } = await api(`/api/proveedores/${proveedor.id}/precios`, {
    error: "No se pudo cargar la lista de precios."
  });
  if (proveedorActual?.id !== proveedor.id) return;
  preciosFicha = precios;
  const ultima = listas[0];
  document.getElementById("fichaProvListaResumen").textContent = ultima
    ? `${numero(precios.length)} ${precios.length === 1 ? "producto" : "productos"} con precio. La última lista es del ${fechaAR(ultima.fecha)}.`
    : "Cargale la lista de precios que te manda: el mensaje, la planilla, el PDF o una foto. Nexo la cruza con tus productos, y al cargarle una compra te propone esos costos.";
  document.getElementById("fichaProvListaBuscar").hidden = precios.length < 8;
  pintarPreciosFicha();

  const historial = document.getElementById("fichaProvListas");
  historial.hidden = listas.length === 0;
  document.getElementById("fichaProvListasCuenta").textContent = numero(listas.length);
  document.getElementById("fichaProvListasLista").innerHTML = listas
    .map(
      (l) => `
      <li>
        <span><b>${esc(fechaAR(l.fecha))}</b> · ${esc(numero(l.cantidad))} ${l.cantidad === 1 ? "precio" : "precios"} · ${esc(ORIGEN_TEXTO[l.origen] ?? "")}${
          l.usuario ? ` · ${esc(l.usuario)}` : ""
        }</span>
        <button type="button" class="btn-link lista-prov-borrar" data-lista="${l.id}" data-fecha="${esc(l.fecha)}">Borrar</button>
      </li>`
    )
    .join("");
}

function pintarPreciosFicha() {
  const buscado = normalizar(document.getElementById("fichaProvListaBuscar").value);
  const filas = buscado
    ? preciosFicha.filter((p) => normalizar(`${p.nombre} ${p.descripcion ?? ""}`).includes(buscado))
    : preciosFicha;
  const body = document.getElementById("fichaProvListaBody");
  if (!preciosFicha.length) {
    body.innerHTML = filaVacia(5, "Todavía no le cargaste ninguna lista a este proveedor.");
    return;
  }
  if (!filas.length) {
    body.innerHTML = filaVacia(5, "Ningún producto coincide con la búsqueda.");
    return;
  }
  body.innerHTML = filas
    .map((p) => {
      const costo = p.costo_actual > 0 ? money(p.costo_actual) : "—";
      const variacion = cambio(p.precio, p.anterior) || "—";
      return `
      <tr data-clave="${esc(claveDe(p.producto_id, p.variante_id))}">
        <td data-label="Producto" class="m-titulo">${esc(p.nombre)}${p.activo ? "" : ' <span class="status">Inactivo</span>'}${
          p.descripcion && normalizar(p.descripcion) !== normalizar(p.nombre)
            ? `<span class="lista-prov-como">Para el proveedor: ${esc(p.descripcion)}</span>`
            : ""
        }</td>
        <td data-label="Precio" class="align-right mono lista-prov-precio">${money(p.precio)}</td>
        <td data-label="Cambio">${variacion}</td>
        <td data-label="Tu costo hoy" class="align-right mono">${costo}</td>
        <td data-label="Desde">${esc(fechaAR(p.fecha))}
          <button type="button" class="btn-link lista-prov-cambiar" aria-label="Cambiar el precio de ${esc(p.nombre)}">Cambiar</button></td>
      </tr>`;
    })
    .join("");
}

document.getElementById("fichaProvListaBuscar").addEventListener("input", pintarPreciosFicha);

// Cambiar un precio a mano: una lista de un solo renglón, con la fecha de hoy.
document.getElementById("fichaProvListaBody").addEventListener("click", (e) => {
  const boton = e.target.closest(".lista-prov-cambiar");
  if (!boton) return;
  const fila = boton.closest("tr");
  const precio = preciosFicha.find((p) => claveDe(p.producto_id, p.variante_id) === fila.dataset.clave);
  const celda = fila.querySelector(".lista-prov-precio");
  celda.innerHTML = `
    <form class="form lista-prov-editar">
      <input type="number" min="0" step="0.01" value="${esc(String(precio.precio))}" aria-label="Precio nuevo de ${esc(precio.nombre)}" required />
      <button type="submit" class="btn btn-primary">Guardar</button>
    </form>`;
  const input = celda.querySelector("input");
  input.focus();
  input.select();
  celda.querySelector("form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const nuevo = Number(input.value);
    if (!(nuevo >= 0)) return;
    await api(`/api/proveedores/${proveedorActual.id}/listas`, {
      method: "POST",
      body: { fecha: hoyISO(), origen: "a_mano", renglones: [{ producto_id: precio.producto_id, variante_id: precio.variante_id, precio: nuevo }] },
      error: "No se pudo guardar el precio."
    });
    avisar("Precio guardado.", "ok");
    await pintarEnFicha(proveedorActual);
  });
});

document.getElementById("fichaProvListasLista").addEventListener("click", async (e) => {
  const boton = e.target.closest(".lista-prov-borrar");
  if (!boton) return;
  const ok = await confirmar({
    titulo: "Borrar la lista",
    cuerpo: `La lista del ${fechaAR(boton.dataset.fecha)} deja de valer y vuelven los precios de la anterior. Queda anotado en la auditoría.`,
    aceptar: "Borrar",
    destructivo: true
  });
  if (!ok) return;
  await api(`/api/proveedores/${proveedorActual.id}/listas/${boton.dataset.lista}`, {
    method: "DELETE",
    error: "No se pudo borrar la lista."
  });
  avisar("Lista borrada.", "ok");
  await pintarEnFicha(proveedorActual);
});

document.getElementById("btnFichaProvCargarLista").addEventListener("click", () => abrirCarga(proveedorActual));

/* ---------- Cargar una lista: paso 1 ---------- */

const pasoCargar = document.getElementById("listaPasoCargar");
const pasoRevisar = document.getElementById("listaPasoRevisar");
const formCargar = document.getElementById("formListaProv");
const inputArchivo = document.getElementById("listaProvArchivo");
const TEXTO_ARCHIVO = "Un PDF, una planilla CSV o fotos de la lista. Una planilla de Excel: guardala como CSV, o copiá las columnas y pegalas como mensaje.";
let modo = "mensaje";
let archivosElegidos = [];

function elegirModo(nuevo) {
  modo = nuevo;
  for (const b of document.querySelectorAll("#listaProvModo [data-modo]")) b.setAttribute("aria-pressed", String(b.dataset.modo === modo));
  document.getElementById("listaProvTextoCampo").hidden = modo !== "mensaje";
  document.getElementById("listaProvArchivoCampo").hidden = modo !== "archivo";
}

function abrirCarga(proveedor) {
  proveedorActual = proveedor;
  for (const el of document.querySelectorAll(".lista-prov-nombre")) el.textContent = proveedor.nombre;
  formCargar.reset();
  formCargar.fecha.value = hoyISO();
  archivosElegidos = [];
  document.getElementById("listaProvArchivoNombre").textContent = TEXTO_ARCHIVO;
  elegirModo("mensaje");
  pasoCargar.hidden = false;
  pasoRevisar.hidden = true;
  mostrarVista("proveedor-lista", { titulo: `Lista de ${proveedor.nombre}` });
}

document.getElementById("listaProvModo").addEventListener("click", (e) => {
  const boton = e.target.closest("[data-modo]");
  if (boton) elegirModo(boton.dataset.modo);
});
document.getElementById("btnListaProvArchivo").addEventListener("click", () => inputArchivo.click());
inputArchivo.addEventListener("change", () => {
  archivosElegidos = [...inputArchivo.files];
  document.getElementById("listaProvArchivoNombre").textContent = archivosElegidos.length
    ? archivosElegidos.map((a) => a.name).join(", ")
    : TEXTO_ARCHIVO;
});
document.getElementById("btnVolverListaProveedor").addEventListener("click", () => invocar("abrirFicha:proveedor", proveedorActual.id));

const esPdf = (a) => a.type === "application/pdf" || /\.pdf$/i.test(a.name);
const esTexto = (a) => /^text\//.test(a.type) || /\.(csv|txt|tsv)$/i.test(a.name);

// El texto de un PDF, renglón por renglón: los pedazos que comparten la altura
// van juntos, de izquierda a derecha, y una separación grande es una columna
// (un tabulador, como la planilla pegada). Vacío si el PDF es una imagen.
async function textoDelPdf(archivo) {
  const pdfjs = await cargarPdfjs();
  let documento;
  try {
    documento = await pdfjs.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()) }).promise;
  } catch {
    throw new ErrorArchivo(`No se pudo abrir el PDF "${archivo.name}".`);
  }
  const lineas = [];
  for (let n = 1; n <= documento.numPages; n++) {
    const pagina = await documento.getPage(n);
    const { items } = await pagina.getTextContent();
    const porAltura = new Map();
    for (const item of items) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform[5] / 3);
      if (!porAltura.has(y)) porAltura.set(y, []);
      porAltura.get(y).push({ x: item.transform[4], fin: item.transform[4] + (item.width ?? 0), texto: item.str });
    }
    for (const y of [...porAltura.keys()].sort((a, b) => b - a)) {
      const pedazos = porAltura.get(y).sort((a, b) => a.x - b.x);
      let linea = "";
      let fin = null;
      for (const p of pedazos) {
        linea += fin === null ? p.texto : `${p.x - fin > 12 ? "\t" : " "}${p.texto}`;
        fin = p.fin;
      }
      lineas.push(linea);
    }
  }
  await documento.destroy();
  return lineas.join("\n");
}

// Lo que se manda a leer: { texto } o { imagenes }, y de dónde salió.
async function prepararLectura() {
  if (modo === "mensaje") {
    const texto = formCargar.texto.value;
    if (!texto.trim()) throw new ErrorArchivo("Pegá el mensaje o la lista del proveedor.");
    return { cuerpo: { texto }, origen: "mensaje" };
  }
  if (!archivosElegidos.length) throw new ErrorArchivo("Elegí el archivo con la lista.");
  const textos = [];
  const imagenes = [];
  for (const archivo of archivosElegidos) {
    if (esTexto(archivo)) textos.push(await archivo.text());
    else if (esPdf(archivo)) {
      const texto = await textoDelPdf(archivo);
      // Sin texto adentro, es un escaneo: va como foto.
      if (texto.replace(/\s/g, "").length > 20) textos.push(texto);
      else imagenes.push(archivo);
    } else if (/^image\//.test(archivo.type)) imagenes.push(archivo);
    else throw new ErrorArchivo(`"${archivo.name}" no es un PDF, una planilla CSV ni una foto.`);
  }
  if (textos.length) {
    if (imagenes.length) avisar("Se leyó el texto de los archivos; las fotos quedaron afuera. Cargalas aparte.", "atencion");
    return { cuerpo: { texto: textos.join("\n") }, origen: "archivo" };
  }
  return { cuerpo: { imagenes: await archivosAImagenes(imagenes) }, origen: "foto" };
}

/* ---------- Paso 2: revisar ---------- */

let lectura = null;
let filtro = "todos";

formCargar.addEventListener("submit", async (e) => {
  e.preventDefault();
  const boton = formCargar.querySelector('[type="submit"]');
  boton.disabled = true;
  try {
    let preparada;
    try {
      preparada = await prepararLectura();
    } catch (err) {
      avisar(err instanceof ErrorArchivo ? err.message : "No se pudo abrir el archivo. Probá pegando la lista como mensaje.", "error");
      return;
    }
    let r;
    try {
      r = await api(`/api/proveedores/${proveedorActual.id}/lista/leer`, {
        method: "POST",
        body: preparada.cuerpo,
        error: "No se pudo leer la lista."
      });
    } catch {
      return;
    }
    // La foto puede decir si los precios son sin IVA; si no, lo que se eligió.
    const sinIva = r.precios_sin_iva ?? formCargar.iva.value === "sin";
    formCargar.iva.value = sinIva ? "sin" : "con";
    armarRevision(r, { origen: preparada.origen, fecha: formCargar.fecha.value, sinIva });
  } finally {
    boton.disabled = false;
  }
});

function armarRevision(r, datos) {
  const porNombre = new Map(r.catalogo.map((e) => [normalizar(e.nombre), e]));
  const porClave = new Map(r.catalogo.map((e) => [claveDe(e.producto_id, e.variante_id), e]));
  const anteriores = new Map(r.anteriores.map((a) => [claveDe(a.producto_id, a.variante_id), a]));
  lectura = {
    ...datos,
    porNombre,
    anteriores,
    descartadas: r.descartadas,
    renglones: r.renglones.map((x, i) => {
      const entrada = x.producto ? porClave.get(claveDe(x.producto.id, x.producto.variante_id)) : null;
      return {
        i,
        descripcion: x.descripcion,
        clave: x.clave,
        precio: x.precio,
        bulto: x.unidades_por_bulto || 1,
        coincidencia: x.coincidencia,
        entrada,
        incluir: Boolean(entrada)
      };
    })
  };
  document.getElementById("listaProvCatalogo").innerHTML = r.catalogo
    .map((e) => `<option value="${esc(e.nombre)}"></option>`)
    .join("");
  document.getElementById("listaProvBuscar").value = "";
  filtro = lectura.renglones.some((x) => x.coincidencia === "parecido") ? "revisar" : "todos";
  pasoCargar.hidden = true;
  pasoRevisar.hidden = false;
  pintarRevision();
  pasoRevisar.scrollIntoView({ block: "start" });
}

const precioUnidad = (x) => redondear((x.precio / (x.bulto > 0 ? x.bulto : 1)) * (lectura.sinIva ? 1 + (x.entrada?.alicuota ?? 21) / 100 : 1));
const anteriorDe = (x) => (x.entrada ? lectura.anteriores.get(claveDe(x.entrada.producto_id, x.entrada.variante_id)) : null);

function pintarCuentas() {
  const r = lectura.renglones;
  const cuentas = {
    todos: r.filter((x) => x.entrada).length,
    revisar: r.filter((x) => x.coincidencia === "parecido").length,
    sin: r.filter((x) => !x.entrada).length
  };
  for (const b of document.querySelectorAll("#listaProvFiltro [data-filtro]")) {
    b.setAttribute("aria-pressed", String(b.dataset.filtro === filtro));
    b.querySelector(".lista-prov-cuenta").textContent = numero(cuentas[b.dataset.filtro]);
  }
  return cuentas;
}

function pintarRevision() {
  const { renglones } = lectura;
  const cuentas = pintarCuentas();
  const partes = [
    `${numero(renglones.length)} ${renglones.length === 1 ? "renglón leído" : "renglones leídos"}`,
    `${numero(cuentas.todos)} con producto`,
    lectura.descartadas
      ? `${numero(lectura.descartadas)} ${lectura.descartadas === 1 ? "renglón sin precio quedó afuera" : "renglones sin precio quedaron afuera"}`
      : ""
  ].filter(Boolean);
  document.getElementById("listaProvResumen").textContent = `${partes.join(" · ")}. Los precios se guardan por unidad${
    lectura.sinIva ? " y con el IVA sumado" : ""
  }, como el costo de una compra. Si un renglón es de un pack, poné cuántas trae.`;
  pintarRenglones();
  pintarPie();
}

function pintarRenglones() {
  const buscado = normalizar(document.getElementById("listaProvBuscar").value);
  const deFiltro = lectura.renglones.filter((x) =>
    filtro === "revisar" ? x.coincidencia === "parecido" : filtro === "sin" ? !x.entrada : Boolean(x.entrada)
  );
  const visibles = buscado
    ? deFiltro.filter((x) => normalizar(`${x.descripcion} ${x.entrada?.nombre ?? ""}`).includes(buscado))
    : deFiltro;
  const lista = document.getElementById("listaProvRenglones");
  const nota = document.getElementById("listaProvMas");
  nota.hidden = visibles.length <= RENGLONES_A_LA_VEZ;
  nota.textContent = `Se muestran ${numero(RENGLONES_A_LA_VEZ)} de ${numero(visibles.length)}: buscá para encontrar el resto.`;
  if (!visibles.length) {
    const vacio =
      filtro === "sin" ? "Todos los renglones tienen su producto." : filtro === "revisar" ? "No hay nada para revisar." : "Ningún renglón tiene producto todavía.";
    lista.innerHTML = `<li class="lista-prov-vacio">${esc(buscado ? "Ningún renglón coincide con la búsqueda." : vacio)}</li>`;
    return;
  }
  lista.innerHTML = visibles.slice(0, RENGLONES_A_LA_VEZ).map(htmlRenglon).join("");
}

function htmlRenglon(x) {
  const estado = x.entrada ? COINCIDENCIAS[x.coincidencia] ?? COINCIDENCIAS.elegido : null;
  return `
    <li class="lista-prov-renglon${x.incluir ? "" : " es-fuera"}" data-i="${esc(String(x.i))}">
      <label class="lista-prov-incluir"><input type="checkbox" ${x.incluir ? "checked" : ""} ${x.entrada ? "" : "disabled"} />
        <span class="visualmente-oculto">Guardar este precio</span></label>
      <div class="lista-prov-cuerpo">
        <p class="lista-prov-original">En la lista: <b>${esc(x.descripcion)}</b> · <span class="mono">${money(x.precio)}</span>
          ${estado ? `<span class="item-origen-estado ${esc(estado.clase)}">${esc(estado.texto)}</span>` : ""}</p>
        <input type="text" class="lista-prov-producto" list="listaProvCatalogo" value="${esc(x.entrada?.nombre ?? "")}"
          placeholder="Elegí el producto de tu catálogo" aria-label="Producto de ${esc(x.descripcion)}" />
        <div class="lista-prov-numeros">
          <label class="lista-prov-bulto">Trae <input type="number" min="1" step="1" value="${esc(String(x.bulto))}" /> u.</label>
          ${x.entrada ? `<span>Cada una: <b class="mono">${money(precioUnidad(x))}</b></span>${cambio(precioUnidad(x), anteriorDe(x))}` : ""}
        </div>
      </div>
    </li>`;
}

// Cambia un renglón y se vuelve a dibujar solo ese (el resto no se toca, así
// no se pierde dónde estaba escribiendo).
function redibujar(x) {
  const viejo = document.querySelector(`#listaProvRenglones [data-i="${esc(String(x.i))}"]`);
  if (!viejo) return;
  const plantilla = document.createElement("template");
  plantilla.innerHTML = htmlRenglon(x).trim();
  viejo.replaceWith(plantilla.content.firstChild);
  pintarPie();
}

const renglonDe = (el) => lectura.renglones[Number(el.closest("[data-i]").dataset.i)];

document.getElementById("listaProvRenglones").addEventListener("change", (e) => {
  const x = renglonDe(e.target);
  if (e.target.type === "checkbox") {
    x.incluir = e.target.checked && Boolean(x.entrada);
    e.target.closest(".lista-prov-renglon").classList.toggle("es-fuera", !x.incluir);
    pintarPie();
  } else if (e.target.closest(".lista-prov-bulto")) {
    const bulto = Number(e.target.value);
    if (bulto > 0) {
      x.bulto = bulto;
      redibujar(x);
    }
  } else if (e.target.classList.contains("lista-prov-producto")) {
    const entrada = lectura.porNombre.get(normalizar(e.target.value)) ?? null;
    x.entrada = entrada;
    x.coincidencia = entrada ? "elegido" : null;
    x.incluir = Boolean(entrada);
    redibujar(x);
    pintarCuentas();
  }
});

document.getElementById("listaProvFiltro").addEventListener("click", (e) => {
  const boton = e.target.closest("[data-filtro]");
  if (!boton) return;
  filtro = boton.dataset.filtro;
  pintarRevision();
});
document.getElementById("listaProvBuscar").addEventListener("input", pintarRenglones);

const paraGuardar = () => lectura.renglones.filter((x) => x.incluir && x.entrada);

function pintarPie() {
  const n = paraGuardar().length;
  const boton = document.getElementById("btnListaProvGuardar");
  boton.disabled = n === 0;
  boton.textContent = n === 1 ? "Guardar 1 precio" : `Guardar ${numero(n)} precios`;
}

document.getElementById("btnListaProvOtra").addEventListener("click", () => {
  pasoRevisar.hidden = true;
  pasoCargar.hidden = false;
});

document.getElementById("btnListaProvGuardar").addEventListener("click", async (e) => {
  const boton = e.currentTarget;
  const renglones = paraGuardar().map((x) => ({
    producto_id: x.entrada.producto_id,
    variante_id: x.entrada.variante_id,
    precio: precioUnidad(x),
    descripcion: x.descripcion,
    clave: x.clave,
    unidades_por_bulto: x.bulto
  }));
  boton.disabled = true;
  let r;
  try {
    r = await api(`/api/proveedores/${proveedorActual.id}/listas`, {
      method: "POST",
      body: { fecha: lectura.fecha, origen: lectura.origen, precios_sin_iva: lectura.sinIva, renglones },
      error: "No se pudo guardar la lista."
    });
  } catch {
    boton.disabled = false;
    return;
  }
  avisar(r.cantidad === 1 ? "Lista guardada: 1 precio." : `Lista guardada: ${numero(r.cantidad)} precios.`, "ok");
  await invocar("abrirFicha:proveedor", proveedorActual.id);
});

/* ---------- En la ficha del producto ---------- */

// Lo que cobra cada proveedor por el producto, del más barato al más caro,
// contra su costo de hoy. El panel solo aparece si alguno tiene lista.
async function pintarEnProducto(productoId, costoActual) {
  const panel = document.getElementById("fichaProductoProveedoresPanel");
  panel.hidden = true;
  const precios = await fetch(`/api/productos/${productoId}/precios-proveedores`)
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);
  if (!precios.length) return;
  const masBarato = precios[0].precio;
  document.getElementById("fichaProductoProveedores").innerHTML = precios
    .map((p) => {
      const diferencia = costoActual > 0 ? ((p.precio - costoActual) / costoActual) * 100 : null;
      const contraCosto =
        diferencia === null || Math.abs(diferencia) < 0.05
          ? ""
          : ` · ${diferencia > 0 ? "+" : "−"}${numero(Math.abs(Math.round(diferencia * 10) / 10))} % de tu costo`;
      return `
      <li${p.precio === masBarato && precios.length > 1 ? ' class="es-mejor"' : ""}>
        <button type="button" class="btn-link" data-proveedor="${p.proveedor_id}">${esc(p.proveedor)}</button>${p.variante ? ` <span class="lista-prov-como">${esc(p.variante)}</span>` : ""}
        <span class="lista-prov-comparar-precio"><b class="mono">${money(p.precio)}</b>
          <span class="lista-prov-como">Lista del ${esc(fechaAR(p.fecha))}${esc(contraCosto)}</span></span>
      </li>`;
    })
    .join("");
  panel.hidden = false;
}

document.getElementById("fichaProductoProveedores").addEventListener("click", (e) => {
  const boton = e.target.closest("[data-proveedor]");
  if (boton) invocar("abrirFicha:proveedor", Number(boton.dataset.proveedor));
});

/* ---------- Lo que usan los demás ---------- */

registrar("lista-proveedor:en-producto", pintarEnProducto);

// La ficha del proveedor la pinta app.js y pide esta parte.
registrar("lista-proveedor:pintar", pintarEnFicha);

// Los precios de hoy de un proveedor, para proponer el costo al cargarle una
// compra: Map "producto:variante" → { precio, fecha }. Sin api(): si falla, la
// compra se carga igual, sin propuesta y sin avisos.
registrar("lista-proveedor:precios", async (proveedorId) => {
  const datos = await fetch(`/api/proveedores/${proveedorId}/precios`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return new Map((datos?.precios ?? []).map((p) => [claveDe(p.producto_id, p.variante_id), { precio: p.precio, fecha: p.fecha }]));
});
