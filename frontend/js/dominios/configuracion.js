/**
 * dominios/configuracion.js
 * Configuración (hist. §73): una vista con su menú y una página por tema
 * (#/configuracion/<página>), en vez del modal de antes. Cada página guarda lo
 * suyo con PUT /api/negocio, que es parcial: manda solo lo que cambió.
 *
 * Para sumar una página (IVA, ARCA): su ítem del menú y su <section>
 * en index.html, y su entrada en PAGINAS.
 */

import { fijarNegocio, moduloActivo, negocio, terminoDeTipo } from "../core/negocio.js";
import { avisar } from "../core/ui.js";
import { api, refrescar } from "../core/api.js";
import { alEntrarEnVista, invocar, recargar, registrar } from "../core/registro.js";
import { UNIDADES, esAdmin, esc, fechaAR } from "../core/formato.js";
import { icono } from "../core/iconos.js";
import { mostrarVista } from "../core/router.js";
import { tarjetasModulos, tarjetasTipo, tipoDeNegocio } from "../core/tipos-negocio.js";
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
const formFunciones = document.getElementById("formConfigFunciones");
const formCambiarTipo = document.getElementById("formConfigCambiarTipo");
const formComprobantes = document.getElementById("formConfigComprobantes");
const formApariencia = document.getElementById("formConfigApariencia");
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
  marcarEnElMenu(form);
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
  marcarEnElMenu(form);
};

/* ---------- Cambios sin guardar (hist. §85) ---------- */

// Lo que no se guardó se conserva al cambiar de página (hist. §73), pero no
// tiene que pasar desapercibido: la página lleva un punto en el menú, salir
// de Configuración por el menú avisa, y cerrar o recargar la pestaña pregunta.
const formularios = [formNegocio, formFunciones, formCambiarTipo, formComprobantes];
// La página del menú: "Cambiar el tipo" no tiene ítem propio y marca el de
// Funciones.
const itemDelMenu = (clave) => PAGINAS[clave]?.menu ?? clave;
const seccionDe = (form) => itemDelMenu(form.closest(".config-pagina")?.dataset.seccion);

function marcarEnElMenu(form) {
  const item = config.querySelector(`.config-item[data-seccion="${seccionDe(form)}"]`);
  if (!item) return;
  const sinGuardar = tieneCambios(form);
  item.classList.toggle("sin-guardar", sinGuardar);
  if (sinGuardar) item.setAttribute("title", "Tiene cambios sin guardar");
  else item.removeAttribute("title");
}

const paginasSinGuardar = () =>
  formularios
    .filter(tieneCambios)
    .map((form) => config.querySelector(`.config-item[data-seccion="${seccionDe(form)}"] .config-item-nombre`)?.textContent ?? "");

window.addEventListener("beforeunload", (e) => {
  if (paginasSinGuardar().length) e.preventDefault();
});

// Salir por el menú no se frena (los cambios siguen ahí al volver), pero se
// avisa adónde quedaron.
document.addEventListener(
  "click",
  (e) => {
    if (!e.target.closest(".nav-item") || config.closest(".view").hidden) return;
    const pendientes = paginasSinGuardar();
    if (pendientes.length === 0) return;
    avisar(`Quedaron cambios sin guardar en ${pendientes.join(" y ")}. Siguen ahí cuando vuelvas a Configuración.`, "atencion");
  },
  true
);

for (const form of formularios) {
  form.addEventListener("input", () => actualizarBoton(form));
  form.addEventListener("change", () => actualizarBoton(form));
}

// El servidor valida lo mismo que acá: si algo se escapa, su error llega como
// aviso (api()) y el botón vuelve a quedar habilitado para reintentar.
async function guardar(form, cuerpo, pintar) {
  const boton = botonGuardar(form);
  const texto = boton.textContent;
  boton.disabled = true;
  boton.textContent = "Guardando…";
  try {
    await api("/api/negocio", { method: "PUT", body: cuerpo, error: "No se pudieron guardar los cambios." });
  } catch (e) {
    boton.disabled = false;
    throw e;
  } finally {
    boton.textContent = texto;
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

/* ---------- Funciones y tipo de negocio (hist. §88) ---------- */

// El tipo se eligió al crear el negocio y se ve fijo; lo que se toca son las
// funciones. Cambiar el tipo no prende ni apaga ninguna (el servidor ya no las
// mueve): es otra página, que dice qué cambia antes de confirmar.
const tipoActual = () => tipoDeNegocio(negocio.perfiles, negocio.rubro) ?? negocio.perfiles.tipos[0];

function pintarFunciones() {
  const tipo = tipoActual();
  document.getElementById("configTipoActual").innerHTML = `
    <span class="opcion-tarjeta-icono">${icono(esc(tipo.icono))}</span>
    <div class="config-tipo-actual-texto">
      <p class="config-tipo-actual-etiqueta">Tipo de negocio</p>
      <p class="config-tipo-actual-nombre">${esc(tipo.nombre)}</p>
      <p class="config-tipo-actual-desc">${esc(tipo.descripcion)}</p>
    </div>
    <a class="btn btn-secundario" href="#/configuracion/cambiar-tipo">Cambiar el tipo</a>`;
  document.getElementById("configModulos").innerHTML = tarjetasModulos(negocio.perfiles, negocio.modulos, tipo);
  marcarSinCambios(formFunciones);
}

formFunciones.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!tieneCambios(formFunciones)) return;
  await guardar(formFunciones, { modulos: valores(formFunciones).modulo }, pintarFunciones);
});

// Las funciones del tipo elegido que el negocio todavía no tiene.
function funcionesQueFaltan(tipo) {
  return negocio.perfiles.modulos.filter((m) => tipo.modulos.includes(m.clave) && !negocio.modulos.includes(m.clave));
}

const unidadEnTexto = (unidad) => (UNIDADES[unidad] ?? unidad).toLowerCase();
const listaConY = (nombres) => (nombres.length < 2 ? nombres.join("") : `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`);

function pintarCambiosDelTipo() {
  const caja = document.getElementById("configTipoCambios");
  const boton = botonGuardar(formCambiarTipo);
  const tipo = tipoDeNegocio(negocio.perfiles, valores(formCambiarTipo).rubro);
  if (!tipo || tipo.clave === negocio.rubro) {
    caja.hidden = true;
    caja.innerHTML = "";
    boton.disabled = true;
    boton.textContent = "Cambiar el tipo";
    return;
  }
  const faltan = funcionesQueFaltan(tipo);
  const sumar = formCambiarTipo.querySelector('input[name="sumar"]')?.checked ?? false;
  caja.hidden = false;
  caja.innerHTML = `
    <p class="config-tipo-cambios-titulo">Qué cambia si pasás a ${esc(tipo.nombre)}</p>
    <ul class="config-tipo-cambios-lista">
      <li>${icono("check")} <span>Lo nuevo que cargues va a nacer como ${esc(terminoDeTipo(tipo.tipo_defecto))}, por ${esc(unidadEnTexto(tipo.unidad_defecto))}.</span></li>
      <li>${icono("check")} <span>Lo que ya cargaste queda igual: no se borra, no cambia de nombre y no se apaga ninguna función.</span></li>
    </ul>
    ${
      faltan.length
        ? `<label class="form-check">
             <input type="checkbox" name="sumar" value="si"${sumar ? " checked" : ""} />
             Sumar también ${esc(listaConY(faltan.map((m) => m.nombre)))}, que vienen con ${esc(tipo.nombre)}
           </label>`
        : ""
    }`;
  boton.disabled = false;
  boton.textContent = `Cambiar a ${tipo.nombre}`;
}

function pintarCambiarTipo() {
  document.getElementById("configTipos").innerHTML = tarjetasTipo(negocio.perfiles, negocio.rubro);
  pintarCambiosDelTipo();
  marcarSinCambios(formCambiarTipo);
}

formCambiarTipo.addEventListener("change", (e) => {
  if (e.target.name === "rubro") pintarCambiosDelTipo();
});

formCambiarTipo.addEventListener("submit", async (e) => {
  e.preventDefault();
  const tipo = tipoDeNegocio(negocio.perfiles, valores(formCambiarTipo).rubro);
  if (!tipo || tipo.clave === negocio.rubro) return;
  const cuerpo = { rubro: tipo.clave };
  if (formCambiarTipo.querySelector('input[name="sumar"]')?.checked) {
    cuerpo.modulos = [...negocio.modulos, ...funcionesQueFaltan(tipo).map((m) => m.clave)];
  }
  // De vuelta en Funciones, que ya muestra el tipo nuevo.
  await guardar(formCambiarTipo, cuerpo, () => {
    marcarSinCambios(formCambiarTipo);
    mostrarVista("configuracion", { subruta: "funciones" });
  });
});

document.getElementById("btnConfigOtroNegocio").addEventListener("click", () => invocar("agregar:negocio"));

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
  for (const campo of ["razon_social", "ingresos_brutos", "inicio_actividades"]) formComprobantes[campo].value = negocio[campo] ?? "";
  limpiarErrores(formComprobantes);
  marcarSinCambios(formComprobantes);
  pintarMembrete();
}

// El encabezado del comprobante armado con lo que se va escribiendo. La
// dirección y el contacto salen de Datos del negocio.
function pintarMembrete() {
  const {
    documento,
    condicion_iva: condicion,
    pie_comprobante: pie,
    razon_social: razonSocial,
    ingresos_brutos: iibb,
    inicio_actividades: inicio
  } = valores(formComprobantes);
  const lineas = [
    razonSocial && `Razón social: ${razonSocial}`,
    documento && `CUIT: ${formatearCuit(documento)}`,
    condicionFiscal(condicion),
    iibb && `Ingresos brutos: ${iibb}`,
    inicio && `Inicio de actividades: ${fechaAR(inicio)}`,
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

/* ---------- Instalar como app (PWA, hist. §94) ---------- */

// sesion.js guarda el pedido de instalación del navegador en
// window.nexoPedidoInstalar (llega antes de que cargue este módulo) y avisa con
// "nexo:instalable" cuando aparece o cuando ya se instaló.
const instalarEstado = document.getElementById("instalarEstado");
const btnInstalar = document.getElementById("btnInstalar");

function estaInstalada() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function pintarInstalar() {
  const esIos = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  btnInstalar.hidden = true;
  if (estaInstalada()) {
    instalarEstado.textContent = "Ya está instalada en este dispositivo: se abre desde su ícono, como cualquier app.";
  } else if (window.nexoPedidoInstalar) {
    instalarEstado.textContent =
      "Instalala para abrirla desde un ícono, a pantalla completa, y ver lo último que cargaste aunque no haya conexión.";
    btnInstalar.hidden = false;
  } else if (esIos) {
    instalarEstado.textContent = "En el iPhone o el iPad, abrí Nexo en Safari, tocá Compartir y después “Agregar a inicio”.";
  } else if (!window.isSecureContext) {
    instalarEstado.textContent = "Para instalarla, Nexo tiene que abrirse desde una dirección segura (https).";
  } else {
    instalarEstado.textContent =
      "Para instalarla, abrí Nexo en Chrome o Edge, en el celular o en la compu, y elegí “Instalar” en el menú del navegador.";
  }
}

btnInstalar.addEventListener("click", async () => {
  const pedido = window.nexoPedidoInstalar;
  if (!pedido) return;
  // El navegador deja usar cada pedido una sola vez.
  window.nexoPedidoInstalar = null;
  pedido.prompt();
  const { outcome } = await pedido.userChoice;
  if (outcome === "accepted") avisar("Nexo quedó instalada. La vas a encontrar con su ícono.");
  pintarInstalar();
});
document.addEventListener("nexo:instalable", pintarInstalar);

/* ---------- Páginas ---------- */

const PAGINAS = {
  negocio: { admin: true, form: formNegocio, alEntrar: pintarNegocio },
  funciones: { admin: true, form: formFunciones, alEntrar: pintarFunciones },
  "cambiar-tipo": { admin: true, form: formCambiarTipo, alEntrar: pintarCambiarTipo, menu: "funciones" },
  // Las etapas del embudo de consultas las pinta dominios/crm.js (hist. §90).
  "etapas-consultas": { admin: true, modulo: "crm", alEntrar: () => invocar("pintar:etapasConsultas") },
  comprobantes: { admin: true, form: formComprobantes, alEntrar: pintarComprobantes },
  // Factura electrónica con ARCA: dominios/factura-electronica.js (etapa E).
  "factura-electronica": { admin: true, alEntrar: () => invocar("pintar:factura-electronica") },
  // Descargar los datos y dar de baja el negocio: dominios/baja.js (hist. §109).
  baja: { admin: true, alEntrar: () => invocar("pintar:baja") },
  // El plan de Nexo lo pinta dominios/plan.js (hist. §99).
  plan: { admin: true, alEntrar: () => invocar("pintar:plan") },
  usuarios: { admin: true, alEntrar: () => recargar("usuarios") },
  // Invitar a alguien (hist. §104): sin ítem propio, marca el de Usuarios.
  invitar: { admin: true, alEntrar: () => invocar("pintar:invitar"), menu: "usuarios" },
  // Los catálogos los pinta su dominio (leen su estado), después de traerlos
  // de nuevo: el boot pudo no haber llegado a cargarlos con un deep-link.
  "listas-precios": { admin: true, alEntrar: () => recargar("productos").then(() => invocar("pintar:listas-precios")) },
  depositos: { admin: true, modulo: "stock", alEntrar: () => recargar("productos").then(() => invocar("pintar:depositos")) },
  "categorias-productos": {
    admin: true,
    alEntrar: () => recargar("productos").then(() => invocar("pintar:categorias-productos"))
  },
  "categorias-gastos": { admin: true, alEntrar: () => recargar("gastos").then(() => invocar("pintar:categorias-gastos")) },
  cuenta: { admin: false, alEntrar: () => invocar("pintar:cuenta") },
  apariencia: {
    admin: false,
    alEntrar: () => {
      pintarApariencia();
      pintarInstalar();
    }
  }
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
    const activo = item.dataset.seccion === itemDelMenu(clave);
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
