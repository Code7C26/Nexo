/**
 * dominios/configuracion.js
 * Configuración (hist. §73): una vista con su menú y una página por tema
 * (#/configuracion/<página>), en vez del modal de antes. Cada página guarda lo
 * suyo con PUT /api/negocio, que es parcial: manda solo lo que cambió.
 *
 * Para sumar una página (IVA, ARCA): su ítem del menú y su <section>
 * en index.html, y su entrada en PAGINAS.
 */

import { fijarNegocio, moduloActivo, negocio } from "../core/negocio.js";
import { avisar } from "../core/ui.js";
import { api, refrescar } from "../core/api.js";
import { alEntrarEnVista, invocar, recargar, registrar } from "../core/registro.js";
import { esAdmin, esc } from "../core/formato.js";
import { mostrarVista } from "../core/router.js";
import { marcarModulosDelTipo, tarjetasModulos, tarjetasTipo, tipoDeNegocio } from "../core/tipos-negocio.js";
import { CONDICIONES_FISCALES, condicionFiscal, errorCuit, esCondicionFiscal, formatearCuit } from "../core/fiscal.js";
import { limpiarError, limpiarErrores, marcarError } from "../core/campos.js";
import { aplicarTema, temaActual } from "../core/tema.js";

// `negocio` queda en memoria para que armarHojaComprobante() no tenga que
// hacer un fetch cada vez que se imprime: vive en core/negocio.js (lo lee
// comprobante.js) y se carga con fijarNegocio().
async function cargarNegocio() {
  fijarNegocio(await api("/api/negocio", { error: "No se pudieron cargar los datos del negocio." }));
}

const config = document.getElementById("config");
const formNegocio = document.getElementById("formConfigNegocio");
const formTipo = document.getElementById("formConfigTipo");
const formComprobantes = document.getElementById("formConfigComprobantes");
const formApariencia = document.getElementById("formConfigApariencia");
const notaModulos = document.getElementById("configModulosNota");
const NOTA_MODULOS = notaModulos.textContent;
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ---------- Guardar solo lo que cambió ---------- */

// Los checkbox van como lista; el resto, como texto sin espacios de más.
function valores(form) {
  const datos = new FormData(form);
  const resultado = {};
  for (const { name, type } of form.elements) {
    if (!name || Object.hasOwn(resultado, name)) continue;
    resultado[name] = type === "checkbox" ? datos.getAll(name) : String(datos.get(name) ?? "").trim();
  }
  return resultado;
}

const botonGuardar = (form) => form.querySelector('button[type="submit"]');

// Lo que se pintó es el punto de partida: "Guardar cambios" se habilita recién
// cuando algo cambia.
function marcarSinCambios(form) {
  form.dataset.inicial = JSON.stringify(valores(form));
  botonGuardar(form).disabled = true;
}

function cambios(form) {
  const inicial = JSON.parse(form.dataset.inicial ?? "{}");
  return Object.fromEntries(
    Object.entries(valores(form)).filter(([campo, valor]) => JSON.stringify(valor) !== JSON.stringify(inicial[campo]))
  );
}

const tieneCambios = (form) => form.dataset.inicial !== undefined && Object.keys(cambios(form)).length > 0;
const actualizarBoton = (form) => {
  botonGuardar(form).disabled = !tieneCambios(form);
};

for (const form of [formNegocio, formTipo, formComprobantes]) {
  form.addEventListener("input", () => actualizarBoton(form));
  form.addEventListener("change", () => actualizarBoton(form));
}

// El servidor valida lo mismo que acá: si algo se escapa, su error llega como
// aviso (api()) y el botón vuelve a quedar habilitado para reintentar.
async function guardar(form, cuerpo, pintar) {
  const boton = botonGuardar(form);
  boton.disabled = true;
  boton.textContent = "Guardando…";
  try {
    await api("/api/negocio", { method: "PUT", body: cuerpo, error: "No se pudieron guardar los cambios." });
  } catch (e) {
    boton.disabled = false;
    throw e;
  } finally {
    boton.textContent = "Guardar cambios";
  }
  // También el selector de negocio, que muestra el nombre y el tipo.
  await refrescar([cargarNegocio(), recargar("negocios")]);
  pintar();
  avisar("Cambios guardados.", "ok");
}

function errorEn(control, texto) {
  marcarError(control, texto);
  control.focus();
}

/* ---------- Datos del negocio ---------- */

function pintarNegocio() {
  for (const campo of ["nombre", "direccion", "telefono", "email"]) formNegocio[campo].value = negocio[campo] ?? "";
  limpiarErrores(formNegocio);
  marcarSinCambios(formNegocio);
}

formNegocio.addEventListener("submit", async (e) => {
  e.preventDefault();
  limpiarErrores(formNegocio);
  const { nombre, email } = valores(formNegocio);
  if (!nombre) {
    errorEn(formNegocio.nombre, "El negocio necesita un nombre: es lo que encabeza tus comprobantes.");
    return;
  }
  if (email && !EMAIL_VALIDO.test(email)) {
    errorEn(formNegocio.email, "Revisá el email: tiene que ser como nombre@dominio.com.");
    return;
  }
  await guardar(formNegocio, cambios(formNegocio), pintarNegocio);
});

/* ---------- Tipo de negocio y secciones ---------- */

function pintarTipo() {
  document.getElementById("configTipos").innerHTML = tarjetasTipo(negocio.perfiles, negocio.rubro);
  document.getElementById("configModulos").innerHTML = tarjetasModulos(negocio.perfiles, negocio.modulos);
  notaModulos.textContent = NOTA_MODULOS;
  marcarSinCambios(formTipo);
}

// Elegir otro tipo vuelve a marcar sus secciones; se pueden cambiar igual
// antes de guardar.
formTipo.addEventListener("change", (e) => {
  if (e.target.name !== "rubro") return;
  marcarModulosDelTipo(formTipo, negocio.perfiles, e.target.value);
  const tipo = tipoDeNegocio(negocio.perfiles, e.target.value);
  notaModulos.textContent = `Marcamos las secciones que trae "${tipo.nombre}". Podés cambiarlas antes de guardar.`;
  actualizarBoton(formTipo);
});

formTipo.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!tieneCambios(formTipo)) return;
  // Van los dos juntos: si las secciones son las del tipo, el servidor guarda
  // que la empresa sigue al tipo.
  const { rubro, modulo } = valores(formTipo);
  await guardar(formTipo, { rubro, modulos: modulo }, pintarTipo);
});

/* ---------- Comprobantes y datos fiscales ---------- */

const selectCondicion = document.getElementById("configCondicion");
const inputCuit = document.getElementById("configCuit");

function pintarComprobantes() {
  inputCuit.value = negocio.documento ?? "";
  // La lista fija, más el texto libre de antes si db/index.js no lo pudo
  // pasar a la lista: se ve hasta que se elija otra opción.
  const actual = negocio.condicion_iva ?? "";
  const opciones = Object.entries(CONDICIONES_FISCALES).map(([clave, etiqueta]) => `<option value="${clave}">${etiqueta}</option>`);
  const anterior = actual && !esCondicionFiscal(actual) ? `<option value="${esc(actual)}">${esc(actual)} (dato anterior)</option>` : "";
  selectCondicion.innerHTML = `<option value="">Sin indicar</option>${opciones.join("")}${anterior}`;
  selectCondicion.value = actual;
  formComprobantes.pie_comprobante.value = negocio.pie_comprobante ?? "";
  limpiarErrores(formComprobantes);
  marcarSinCambios(formComprobantes);
  pintarMembrete();
}

// El encabezado del comprobante armado con lo que se va escribiendo. La
// dirección y el contacto salen de Datos del negocio.
function pintarMembrete() {
  const { documento, condicion_iva: condicion, pie_comprobante: pie } = valores(formComprobantes);
  const lineas = [
    documento && `CUIT: ${formatearCuit(documento)}`,
    condicionFiscal(condicion),
    negocio.direccion,
    negocio.telefono && `Tel: ${negocio.telefono}`,
    negocio.email
  ].filter(Boolean);
  document.getElementById("configMembrete").innerHTML = `
    <p class="membrete-previa-nombre">${esc(negocio.nombre || "Tu negocio")}</p>
    ${lineas.map((linea) => `<p>${esc(linea)}</p>`).join("")}
    ${pie ? `<p class="membrete-previa-pie">${esc(pie)}</p>` : ""}`;
}

formComprobantes.addEventListener("input", pintarMembrete);
formComprobantes.addEventListener("change", pintarMembrete);

// Al salir del campo: el error si está mal, o el CUIT con sus guiones.
inputCuit.addEventListener("blur", () => {
  const error = errorCuit(inputCuit.value);
  if (error) {
    marcarError(inputCuit, error);
    return;
  }
  limpiarError(inputCuit);
  inputCuit.value = formatearCuit(inputCuit.value);
  actualizarBoton(formComprobantes);
  pintarMembrete();
});

formComprobantes.addEventListener("submit", async (e) => {
  e.preventDefault();
  limpiarErrores(formComprobantes);
  const error = errorCuit(inputCuit.value);
  if (error) {
    errorEn(inputCuit, error);
    return;
  }
  // Solo lo que cambió: un texto libre viejo en la condición fiscal no se
  // reenvía (el servidor ya no lo aceptaría) si no se tocó.
  await guardar(formComprobantes, cambios(formComprobantes), pintarComprobantes);
});

/* ---------- Apariencia ---------- */

function pintarApariencia() {
  for (const radio of formApariencia.querySelectorAll('input[name="tema"]')) radio.checked = radio.value === temaActual();
}

formApariencia.addEventListener("change", (e) => aplicarTema(e.target.value));
formApariencia.addEventListener("submit", (e) => e.preventDefault());
// El botón de la sidebar también cambia el tema.
document.addEventListener("nexo:tema", pintarApariencia);

/* ---------- Páginas ---------- */

const PAGINAS = {
  negocio: { admin: true, form: formNegocio, alEntrar: pintarNegocio },
  tipo: { admin: true, form: formTipo, alEntrar: pintarTipo },
  comprobantes: { admin: true, form: formComprobantes, alEntrar: pintarComprobantes },
  usuarios: { admin: true, alEntrar: () => recargar("usuarios") },
  // Los catálogos los pinta su dominio (leen su estado), después de traerlos
  // de nuevo: el boot pudo no haber llegado a cargarlos con un deep-link.
  "listas-precios": { admin: true, alEntrar: () => recargar("productos").then(() => invocar("pintar:listas-precios")) },
  depositos: { admin: true, modulo: "stock", alEntrar: () => recargar("productos").then(() => invocar("pintar:depositos")) },
  "categorias-productos": {
    admin: true,
    alEntrar: () => recargar("productos").then(() => invocar("pintar:categorias-productos"))
  },
  "categorias-gastos": { admin: true, alEntrar: () => recargar("gastos").then(() => invocar("pintar:categorias-gastos")) },
  apariencia: { admin: false, alEntrar: pintarApariencia }
};

// Una página de admin no se abre para el empleado (es UI: el servidor
// responde 403 igual), ni la de un módulo apagado.
const permitida = (clave) =>
  Object.hasOwn(PAGINAS, clave ?? "") &&
  (!PAGINAS[clave].admin || esAdmin()) &&
  (!PAGINAS[clave].modulo || moduloActivo(PAGINAS[clave].modulo));

const celular = window.matchMedia("(max-width: 860px)");

async function abrirPagina(subruta) {
  // Con un deep-link, el router llega antes que el boot: sin el negocio
  // todavía no se sabe qué módulos están prendidos (moduloActivo deja pasar
  // todo), y una página de un módulo apagado se abriría igual.
  if (!negocio.id) await cargarNegocio();
  let clave = permitida(subruta) ? subruta : null;
  // En el celular, sin página se ve la lista; en la compu, la primera.
  if (!clave && !celular.matches) clave = Object.keys(PAGINAS).find(permitida);
  // Una página que no vale (mal escrita, o de admin para un empleado) no
  // queda en la barra de direcciones.
  if (subruta && subruta !== clave) {
    history.replaceState(null, "", clave ? `#/configuracion/${clave}` : "#/configuracion");
  }

  const anterior = config.dataset.pagina;
  config.dataset.pagina = clave ?? "";
  for (const pagina of config.querySelectorAll(".config-pagina")) pagina.hidden = pagina.dataset.seccion !== clave;
  for (const item of config.querySelectorAll(".config-item")) {
    const activo = item.dataset.seccion === clave;
    item.classList.toggle("is-active", activo);
    if (activo) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  }

  if (!clave) {
    // De vuelta en la lista del celular: el foco, en la página de la que vino.
    if (anterior) config.querySelector(`.config-item[data-seccion="${anterior}"]`)?.focus();
    return;
  }
  if (celular.matches) {
    window.scrollTo(0, 0);
    config.querySelector(`.config-pagina[data-seccion="${clave}"] h2`)?.focus();
  }
  // Lo que se estaba editando y no se guardó no se pisa al volver a la página.
  const { form, alEntrar } = PAGINAS[clave];
  if (!(form && tieneCambios(form))) await alEntrar();
}

// Pasar de celular a compu con la lista abierta deja la página vacía: se abre
// la primera.
celular.addEventListener("change", () => {
  if (!config.closest(".view").hidden && !config.dataset.pagina) abrirPagina(null);
});

document.getElementById("btnConfiguracion").addEventListener("click", () => {
  document.getElementById("sidebar").classList.remove("is-open");
  mostrarVista("configuracion");
});

alEntrarEnVista("configuracion", abrirPagina);
// Lo recarga el boot de app.js con recargar("negocio").
registrar("cargar:negocio", cargarNegocio);
