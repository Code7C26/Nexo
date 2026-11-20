/**
 * dominios/importar.js
 * Traer desde una planilla (hist. §211): los productos, los clientes o los
 * proveedores que el negocio ya tenía en Excel. Tres pasos en la misma
 * página de Configuración, sin modales:
 * 1. qué se trae y el archivo (o lo pegado);
 * 2. qué es cada columna, adivinado por su título y corregible;
 * 3. revisar renglón por renglón (nuevo, cambia, igual o el error) y traer.
 * Leer el archivo y cada celda es de core/planilla.js, el mismo que usa el
 * servidor; el servidor dice qué haría cada renglón y después lo hace.
 */

import { api } from "../core/api.js";
import { alicuotaIva, condicionIvaCliente } from "../core/fiscal.js";
import { esc, money, numero, UNIDADES } from "../core/formato.js";
import { moduloActivo } from "../core/negocio.js";
import {
  CAMPOS,
  MAX_FILAS_PLANILLA,
  ErrorPlanilla,
  adivinarColumnas,
  armarTabla,
  leerArchivoPlanilla,
  separarTexto
} from "../core/planilla.js";
import { recargar, registrar } from "../core/registro.js";
import { avisar, confirmar } from "../core/ui.js";

const campo = (id) => document.getElementById(id);
const pasoArchivo = campo("imPasoArchivo");
const formColumnas = campo("formImColumnas");
const pasoRevisar = campo("imPasoRevisar");
const listaColumnas = campo("imColumnas");
const listaRenglones = campo("imRenglones");
const inputArchivo = campo("imArchivo");
const zonaSoltar = campo("imSoltar");

// De a cuántos renglones se guarda: así se ve el avance en una planilla larga.
const TANDA = 500;
// Cuántos renglones se dibujan por filtro: el resto se cuenta, no se pinta.
const MAX_A_LA_VISTA = 300;

const AYUDA = {
  productos:
    "Nexo reconoce el nombre, el código (SKU), el código de barras, la categoría, el precio, el costo, el stock, el stock mínimo, la unidad y el IVA. Un producto que ya tenés se encuentra por su código o su nombre, y solo cambia lo que trae la planilla.",
  clientes:
    "Nexo reconoce el nombre (y el apellido aparte), el CUIT o DNI, la condición frente al IVA, el mail, el teléfono, la dirección y las notas. Un cliente que ya tenés se encuentra por su CUIT, su mail o su nombre.",
  proveedores:
    "Nexo reconoce el nombre, el CUIT, la condición frente al IVA, el mail, el teléfono, la dirección y las notas. Un proveedor que ya tenés se encuentra por su CUIT, su mail o su nombre."
};
const LO_QUE_TRAE = { productos: "productos", clientes: "clientes", proveedores: "proveedores" };

let tipo = "productos";
// La planilla leída: { origen, encabezados, filas: [{ numero, celdas }] }.
let tabla = null;
// Qué campo es cada columna (null: no se usa).
let columnas = [];
// Lo que contestó el servidor al revisar, y el filtro de la lista.
let revision = null;
let filtro = "todos";

/* ---------- Paso 1: qué se trae y el archivo ---------- */

function elegirTipo(nuevo) {
  tipo = CAMPOS[nuevo] ? nuevo : "productos";
  for (const b of campo("imTipo").querySelectorAll("[data-tipo]")) b.setAttribute("aria-pressed", String(b.dataset.tipo === tipo));
  campo("imAyuda").textContent = AYUDA[tipo];
}

function mostrarPaso(paso) {
  pasoArchivo.hidden = paso !== "archivo";
  formColumnas.hidden = paso !== "columnas";
  pasoRevisar.hidden = paso !== "revisar";
  const visible = { archivo: pasoArchivo, columnas: formColumnas, revisar: pasoRevisar }[paso];
  if (paso !== "archivo") visible.scrollIntoView({ block: "start", behavior: "smooth" });
}

function empezar() {
  tabla = null;
  revision = null;
  inputArchivo.value = "";
  campo("imTexto").value = "";
  elegirTipo(tipo);
  mostrarPaso("archivo");
}

function cargarTabla(filasCrudas, origen) {
  const leida = armarTabla(tipo, filasCrudas);
  if (!leida.filas.length) {
    avisar("La planilla no tiene renglones debajo de los títulos.", "error");
    return;
  }
  if (leida.filas.length > MAX_FILAS_PLANILLA) {
    avisar(`Tiene ${numero(leida.filas.length)} renglones: se traen hasta ${numero(MAX_FILAS_PLANILLA)} por vez. Partila en dos.`, "error");
    return;
  }
  tabla = { origen, ...leida };
  columnas = adivinarColumnas(tipo, tabla.encabezados);
  pintarColumnas();
}

async function leerArchivo(archivo) {
  if (!archivo) return;
  let filas;
  try {
    filas = await leerArchivoPlanilla(archivo);
  } catch (err) {
    avisar(err instanceof ErrorPlanilla ? err.message : "No se pudo abrir el archivo. Guardalo como .xlsx o como CSV y probá de nuevo.", "error");
    return;
  }
  cargarTabla(filas, archivo.name);
}

campo("imTipo").addEventListener("click", (e) => {
  const boton = e.target.closest("[data-tipo]");
  if (boton) elegirTipo(boton.dataset.tipo);
});
campo("btnImArchivo").addEventListener("click", () => inputArchivo.click());
inputArchivo.addEventListener("change", () => leerArchivo(inputArchivo.files[0]));
zonaSoltar.addEventListener("dragover", (e) => {
  e.preventDefault();
  zonaSoltar.classList.add("es-encima");
});
zonaSoltar.addEventListener("dragleave", () => zonaSoltar.classList.remove("es-encima"));
zonaSoltar.addEventListener("drop", (e) => {
  e.preventDefault();
  zonaSoltar.classList.remove("es-encima");
  leerArchivo(e.dataTransfer.files[0]);
});
campo("btnImPegar").addEventListener("click", () => {
  const texto = campo("imTexto").value;
  if (!texto.trim()) {
    campo("imTexto").focus();
    avisar("Pegá las columnas, con la fila de los títulos arriba.", "error");
    return;
  }
  cargarTabla(separarTexto(texto), "Lo pegado");
});

// "Desde una planilla" en Productos, Clientes y Proveedores llega con lo que
// se trae ya elegido, y arranca de cero. El clic pasa antes de que cambie la
// dirección.
document.addEventListener("click", (e) => {
  const enlace = e.target.closest("[data-planilla]");
  if (!enlace) return;
  elegirTipo(enlace.dataset.planilla);
  tabla = null;
});

/* ---------- Paso 2: qué es cada columna ---------- */

// Unos ejemplos de lo que tiene la columna, para reconocerla.
function ejemplos(i) {
  const valores = [];
  for (const fila of tabla.filas) {
    const celda = fila.celdas[i];
    if (celda !== null && String(celda).trim() !== "") valores.push(String(celda));
    if (valores.length === 3) break;
  }
  return valores.length ? valores.join(" · ") : "Vacía";
}

function pintarColumnas() {
  const opciones = CAMPOS[tipo];
  const renglones = tabla.filas.length === 1 ? "renglón" : "renglones";
  campo("imOrigen").textContent = `${tabla.origen}: ${numero(tabla.filas.length)} ${renglones}. Revisá lo que adivinó Nexo y corregí lo que no esté bien.`;
  listaColumnas.innerHTML = tabla.encabezados
    .map(
      (titulo, i) => `
      <li class="im-columna${columnas[i] ? "" : " sin-usar"}">
        <div class="im-columna-titulo">
          <strong>${esc(titulo)}</strong>
          <span>${esc(ejemplos(i))}</span>
        </div>
        <select data-i="${i}" aria-label="Qué es la columna ${esc(titulo)}">
          <option value="">No usar</option>
          ${opciones.map((c) => `<option value="${esc(c.clave)}"${columnas[i] === c.clave ? " selected" : ""}>${esc(c.nombre)}</option>`).join("")}
        </select>
      </li>`
    )
    .join("");
  pintarDeposito();
  mostrarPaso("columnas");
}

// El depósito importa solo si se trae stock o costo y hay más de uno.
async function pintarDeposito() {
  const conStock = tipo === "productos" && moduloActivo("stock") && (columnas.includes("stock") || columnas.includes("costo"));
  const select = campo("imDeposito");
  if (conStock && !select.options.length) {
    const depositos = await api("/api/depositos", { error: "No se pudieron cargar los depósitos." }).catch(() => []);
    select.innerHTML = depositos
      .filter((d) => d.activo)
      .map((d) => `<option value="${d.id}"${d.es_predeterminado ? " selected" : ""}>${esc(d.nombre)}</option>`)
      .join("");
  }
  campo("imDepositoCampo").hidden = !conStock || select.options.length < 2;
}

// Cada campo va en una sola columna: elegirlo en otra lo saca de la anterior.
listaColumnas.addEventListener("change", (e) => {
  const select = e.target.closest("select[data-i]");
  if (!select) return;
  const i = Number(select.dataset.i);
  const clave = select.value || null;
  columnas = columnas.map((c, j) => (j !== i && c === clave ? null : c));
  columnas[i] = clave;
  for (const otro of listaColumnas.querySelectorAll("select[data-i]")) {
    otro.value = columnas[Number(otro.dataset.i)] ?? "";
    otro.closest(".im-columna").classList.toggle("sin-usar", !otro.value);
  }
  pintarDeposito();
});

campo("btnImOtra").addEventListener("click", empezar);

// Lo que se manda: cada renglón con su número y { campo: celda }.
function renglonesParaMandar() {
  return tabla.filas.map((fila) => {
    const campos = {};
    columnas.forEach((clave, i) => {
      if (clave) campos[clave] = fila.celdas[i];
    });
    return { numero: fila.numero, campos };
  });
}

const deposito = () => (campo("imDepositoCampo").hidden ? null : Number(campo("imDeposito").value) || null);

formColumnas.addEventListener("submit", async (e) => {
  e.preventDefault();
  const claves = tipo === "productos" ? ["nombre", "sku", "codigo_barras"] : ["nombre", "documento", "email"];
  if (!columnas.some((c) => claves.includes(c))) {
    listaColumnas.querySelector("select")?.focus();
    avisar(
      tipo === "productos"
        ? "Elegí qué columna es el nombre, o el código: sin eso Nexo no sabe de qué producto es cada renglón."
        : "Elegí qué columna es el nombre: sin eso Nexo no sabe de quién es cada renglón.",
      "error"
    );
    return;
  }
  const boton = formColumnas.querySelector('[type="submit"]');
  boton.disabled = true;
  try {
    revision = await api(`/api/importar/${tipo}`, {
      method: "POST",
      body: { filas: renglonesParaMandar(), deposito_id: deposito() },
      error: "No se pudo revisar la planilla."
    });
  } catch {
    return;
  } finally {
    boton.disabled = false;
  }
  filtro = revision.resumen.error && !revision.resumen.crear && !revision.resumen.actualizar ? "error" : "todos";
  pintarRevision();
  mostrarPaso("revisar");
});

/* ---------- Paso 3: revisar y traer ---------- */

const NOMBRE_CAMPO = Object.fromEntries(
  Object.values(CAMPOS)
    .flat()
    .map((c) => [c.clave, c.nombre])
);

// Un valor como se lee en Nexo: la plata con su signo, el IVA con su %.
function valorLegible(clave, valor) {
  if (valor === null || valor === undefined || valor === "") return "vacío";
  if (clave === "precio_venta" || clave === "costo") return money(valor);
  if (clave === "stock" || clave === "stock_minimo") return numero(valor);
  if (clave === "alicuota_iva") return alicuotaIva(valor);
  if (clave === "condicion_iva") return condicionIvaCliente(valor);
  if (clave === "unidad") return UNIDADES[valor] ?? valor;
  return String(valor);
}

function detalleDe(r) {
  if (r.accion === "error") return `<p class="im-renglon-detalle es-error">${esc(r.error)}</p>`;
  if (r.accion === "igual") return '<p class="im-renglon-detalle">Ya está como en la planilla.</p>';
  if (!r.cambios?.length) return '<p class="im-renglon-detalle"></p>';
  const partes = r.cambios.map((c) => {
    const nombre = esc(NOMBRE_CAMPO[c.campo] ?? c.campo);
    if (r.accion === "crear" || c.antes === null) return `${nombre}: ${esc(valorLegible(c.campo, c.despues))}`;
    return `${nombre}: <span class="im-cambio-antes">${esc(valorLegible(c.campo, c.antes))}</span> → ${esc(valorLegible(c.campo, c.despues))}`;
  });
  return `<p class="im-renglon-detalle">${partes.join(" · ")}</p>`;
}

const ESTADOS = {
  crear: { texto: "Nuevo", clase: "status-cobrado" },
  actualizar: { texto: "Cambia", clase: "status-info" },
  igual: { texto: "Igual", clase: "" },
  error: { texto: "No se trae", clase: "status-vencido" }
};
const FILTROS = [
  { clave: "todos", texto: "Todos" },
  { clave: "crear", texto: "Nuevos" },
  { clave: "actualizar", texto: "Cambian" },
  { clave: "error", texto: "Con errores" },
  { clave: "igual", texto: "Iguales" }
];

function textoResumen({ resumen, filas, guardada }) {
  const aTraer = resumen.crear + resumen.actualizar;
  if (guardada) {
    const errores = resumen.error ? " Los que tienen un error quedaron afuera: corregilos en la planilla y traela de nuevo." : "";
    return `Se trajeron ${numero(aTraer)} de ${numero(filas.length)} renglones.${errores}`;
  }
  const partes = [];
  if (resumen.crear) partes.push(`${numero(resumen.crear)} ${resumen.crear === 1 ? "nuevo" : "nuevos"}`);
  if (resumen.actualizar) partes.push(`${numero(resumen.actualizar)} ${resumen.actualizar === 1 ? "cambia" : "cambian"}`);
  if (resumen.igual) partes.push(`${numero(resumen.igual)} ${resumen.igual === 1 ? "queda igual" : "quedan iguales"}`);
  if (resumen.error) partes.push(`${numero(resumen.error)} con errores`);
  const errores = resumen.error ? " Los que tienen un error no se traen: podés corregirlos en la planilla y volver a subirla." : "";
  return `De ${numero(filas.length)} renglones: ${partes.join(", ")}.${errores}`;
}

function pintarRevision() {
  const { resumen } = revision;
  const total = revision.filas.length;
  const aTraer = resumen.crear + resumen.actualizar;
  const guardada = Boolean(revision.guardada);
  campo("imRevisarTitulo").textContent = guardada ? "Listo" : "Revisá antes de traerla";
  campo("imResumen").textContent = textoResumen(revision);
  campo("imAviso").hidden = !revision.aviso;
  campo("imAviso").textContent = revision.aviso ?? "";

  campo("imFiltro").innerHTML = FILTROS.filter((f) => f.clave === "todos" || resumen[f.clave])
    .map((f) => {
      const cuenta = numero(f.clave === "todos" ? total : resumen[f.clave]);
      return `<button type="button" class="segmento" data-filtro="${esc(f.clave)}" aria-pressed="${f.clave === filtro}">${esc(f.texto)}<span class="im-cuenta">${cuenta}</span></button>`;
    })
    .join("");
  const visibles = revision.filas.filter((r) => filtro === "todos" || r.accion === filtro);
  listaRenglones.innerHTML = visibles
    .slice(0, MAX_A_LA_VISTA)
    .map((r) => {
      const estado = ESTADOS[r.accion];
      return `
      <li class="im-renglon">
        <div class="im-renglon-nombre">
          <strong>${esc(r.nombre ?? "Sin nombre")}</strong>
          <span>Renglón ${numero(r.numero)}</span>
        </div>
        ${detalleDe(r)}
        <span class="status ${esc(estado.clase)}">${esc(estado.texto)}</span>
      </li>`;
    })
    .join("");
  campo("imMas").hidden = visibles.length <= MAX_A_LA_VISTA;
  campo("imMas").textContent = `Y ${numero(visibles.length - MAX_A_LA_VISTA)} renglones más.`;

  const botonGuardar = campo("btnImGuardar");
  botonGuardar.hidden = guardada;
  botonGuardar.disabled = aTraer === 0;
  botonGuardar.textContent = aTraer ? `Traer ${numero(aTraer)} ${LO_QUE_TRAE[tipo]}` : "No hay nada para traer";
  campo("btnImColumnas").textContent = guardada ? "Traer otra planilla" : "Cambiar las columnas";
}

campo("imFiltro").addEventListener("click", (e) => {
  const boton = e.target.closest("[data-filtro]");
  if (!boton) return;
  filtro = boton.dataset.filtro;
  pintarRevision();
});

campo("btnImColumnas").addEventListener("click", () => {
  if (revision?.guardada) empezar();
  else mostrarPaso("columnas");
});

// Se guarda de a tandas, en el orden de la planilla: el servidor vuelve a
// revisar cada tanda justo antes de guardarla.
campo("btnImGuardar").addEventListener("click", async () => {
  const { resumen } = revision;
  if (
    resumen.actualizar &&
    !(await confirmar({
      titulo: "Traer la planilla",
      cuerpo: `Se crean ${numero(resumen.crear)} y se cambian ${numero(resumen.actualizar)} que ya tenías, con lo que dice la planilla. Lo que está vacío en la planilla no se toca.`,
      aceptar: "Traer"
    }))
  ) {
    return;
  }
  const boton = campo("btnImGuardar");
  boton.disabled = true;
  const filas = renglonesParaMandar();
  const resultado = { filas: [], resumen: { crear: 0, actualizar: 0, igual: 0, error: 0 }, aviso: null, guardada: true };
  try {
    for (let desde = 0; desde < filas.length; desde += TANDA) {
      boton.textContent = filas.length > TANDA ? `Trayendo ${numero(Math.min(desde + TANDA, filas.length))} de ${numero(filas.length)}…` : "Trayendo…";
      const tanda = await api(`/api/importar/${tipo}`, {
        method: "POST",
        body: { filas: filas.slice(desde, desde + TANDA), deposito_id: deposito(), guardar: true },
        error: "No se pudo traer la planilla."
      });
      resultado.filas.push(...tanda.filas);
      for (const [clave, n] of Object.entries(tanda.resumen)) resultado.resumen[clave] += n;
    }
  } catch {
    // Lo de las tandas anteriores ya quedó guardado: se muestra eso.
    if (!resultado.filas.length) {
      pintarRevision();
      return;
    }
  }
  revision = resultado;
  filtro = resultado.resumen.error ? "error" : "todos";
  pintarRevision();
  avisar(`Listo: ${numero(resultado.resumen.crear + resultado.resumen.actualizar)} ${LO_QUE_TRAE[tipo]} de la planilla.`, "ok");
  const recargas = { productos: ["productos", "stock", "reporteStock"], clientes: ["clientes"], proveedores: [] }[tipo];
  recargar(...recargas).catch(() => {});
});

/* ---------- Entrada desde Configuración ---------- */

registrar("pintar:planilla", () => {
  // Volver a la página no pisa una planilla a medio revisar.
  if (!tabla || revision?.guardada) empezar();
});
elegirTipo(tipo);
