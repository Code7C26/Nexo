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
import { cambiarIdioma, idioma } from "../core/idioma.js";
import { achicarImagen, atributosEncuadre, colorParaPapel, coloresDelLogo, corrimientoMaximo, variantesDeColor } from "../core/marca.js";

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
const formMarca = document.getElementById("formConfigMarca");
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
const formularios = [formNegocio, formMarca, formFunciones, formCambiarTipo, formComprobantes];
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
async function guardar(form, cuerpo, pintar, ruta = "/api/negocio") {
  const boton = botonGuardar(form);
  const texto = boton.textContent;
  boton.disabled = true;
  boton.textContent = "Guardando…";
  try {
    await api(ruta, { method: "PUT", body: cuerpo, error: "No se pudieron guardar los cambios." });
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

/* ---------- Logo y colores (hist. §212) ---------- */

// Como el "branding" de Square o de Gymdesk: un logo y un color, y Nexo los
// lleva al menú, a lo que se imprime y a la pantalla de entrada. El logo se
// achica acá (core/marca.js) y se guarda con el color, de una vez.
const archivoLogo = document.getElementById("marcaArchivo");
const estadoLogo = document.getElementById("marcaLogoEstado");
const errorLogo = document.getElementById("marcaLogoError");
const botonSubirLogo = document.getElementById("marcaSubirLogo");
const botonSacarLogo = document.getElementById("marcaSacarLogo");

// Para elegir sin saber de colores: distintos entre sí. core/marca.js los
// aclara u oscurece lo justo para que se lean en los dos temas.
const COLORES_DE_MARCA = [
  ["#16a34a", "Verde"],
  ["#0d9488", "Turquesa"],
  ["#7c3aed", "Violeta"],
  ["#db2777", "Rosa"],
  ["#dc2626", "Rojo"],
  ["#ea580c", "Naranja"],
  ["#ca8a04", "Dorado"]
];
// El azul de Nexo, tal cual está en styles.css (sin color elegido).
const AZUL_NEXO = {
  oscuro: { accent: "#60A5FA", bg: "rgba(96, 165, 250, 0.14)", contrast: "#0A0A0A" },
  claro: { accent: "#2563EB", bg: "#DBEAFE", contrast: "#FFFFFF" }
};
const HEX = /^#[0-9a-f]{6}$/i;

// El logo elegido y todavía sin guardar: undefined es el de siempre, null es
// sacarlo, y si no, el que se acaba de subir ({ tipo, datos, url }).
let logoPendiente;
let coloresDelLogoActual = [];

const logoVisible = () => (logoPendiente === undefined ? negocio.logo : logoPendiente?.url) ?? null;

function colorElegido() {
  const { color, color_otro: otro } = valores(formMarca);
  return color === "otro" ? otro : color;
}

/* --- El encuadre del logo en el menú (hist. §215) --- */

// El logo se acerca y se corre a mano dentro del cuadradito del menú, para que
// un logo con mucho margen (un escudo redondo en un cuadrado blanco) se vea
// grande. Se guarda con el resto de la marca; lo impreso usa el logo entero.
const cajaEncuadre = document.getElementById("marcaEncuadre");
const cuadroEncuadre = document.getElementById("marcaEncuadreCuadro");
const zoomEncuadre = document.getElementById("marcaEncuadreZoom");
const xEncuadre = document.getElementById("marcaEncuadreX");
const yEncuadre = document.getElementById("marcaEncuadreY");

const redondear1 = (n) => String(Math.round(n * 10) / 10);
function encuadreElegido() {
  const zoom = Number(zoomEncuadre.value) || 1;
  const max = corrimientoMaximo(zoom);
  const limitar = (v) => Math.max(-max, Math.min(max, Number(v) || 0));
  return { zoom, x: limitar(xEncuadre.value), y: limitar(yEncuadre.value) };
}
const entero = (e) => e.zoom === 1 && e.x === 0 && e.y === 0;

function ponerEncuadre(e) {
  zoomEncuadre.value = String(e?.zoom ?? 1);
  xEncuadre.value = redondear1(e?.x ?? 0);
  yEncuadre.value = redondear1(e?.y ?? 0);
}

function pintarEncuadre() {
  const url = logoVisible();
  cajaEncuadre.hidden = !url;
  if (!url) return;
  // Al alejar, el corrimiento vuelve a lo que entra.
  const e = encuadreElegido();
  xEncuadre.value = redondear1(e.x);
  yEncuadre.value = redondear1(e.y);
  cuadroEncuadre.innerHTML = `<img src="${esc(url)}" alt="" draggable="false"${atributosEncuadre(entero(e) ? null : e)} />`;
}

function cambioEncuadre() {
  pintarEncuadre();
  pintarPreviaMarca();
  actualizarBoton(formMarca);
}

zoomEncuadre.addEventListener("input", cambioEncuadre);
document.getElementById("marcaEncuadreCentrar").addEventListener("click", () => {
  ponerEncuadre(null);
  cambioEncuadre();
});

// Arrastrar con el dedo o el mouse: el logo sigue al puntero.
let arrastre = null;
cuadroEncuadre.addEventListener("pointerdown", (ev) => {
  arrastre = { x: ev.clientX, y: ev.clientY, desde: encuadreElegido(), lado: cuadroEncuadre.clientWidth || 1 };
  cuadroEncuadre.setPointerCapture(ev.pointerId);
  cuadroEncuadre.classList.add("is-arrastrando");
});
cuadroEncuadre.addEventListener("pointermove", (ev) => {
  if (!arrastre) return;
  xEncuadre.value = String(arrastre.desde.x + ((ev.clientX - arrastre.x) / arrastre.lado) * 100);
  yEncuadre.value = String(arrastre.desde.y + ((ev.clientY - arrastre.y) / arrastre.lado) * 100);
  cambioEncuadre();
});
for (const fin of ["pointerup", "pointercancel"]) {
  cuadroEncuadre.addEventListener(fin, () => {
    arrastre = null;
    cuadroEncuadre.classList.remove("is-arrastrando");
  });
}
// Con el teclado, las flechas lo corren de a poco.
const FLECHAS = { ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, -2], ArrowDown: [0, 2] };
cuadroEncuadre.addEventListener("keydown", (ev) => {
  const paso = FLECHAS[ev.key];
  if (!paso) return;
  ev.preventDefault();
  const e = encuadreElegido();
  xEncuadre.value = String(e.x + paso[0]);
  yEncuadre.value = String(e.y + paso[1]);
  cambioEncuadre();
});

// El mismo color con un par de puntos de diferencia: el que se lee del logo
// guardado (en WebP) no sale idéntico al que se leyó del original.
const casiIgual = (a, b) =>
  HEX.test(a) && HEX.test(b) && [1, 3, 5].every((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= 12);

function pintarColores(elegido) {
  const delLogo = coloresDelLogoActual
    .map((hex) => (casiIgual(hex, elegido) ? elegido : hex))
    .filter((hex) => !COLORES_DE_MARCA.some(([otro]) => otro === hex));
  const opciones = [
    ["", "Azul de Nexo", AZUL_NEXO.claro.accent],
    ...delLogo.map((hex, i) => [hex, delLogo.length > 1 ? `De tu logo ${i + 1}` : "De tu logo", hex]),
    ...COLORES_DE_MARCA.map(([hex, nombre]) => [hex, nombre, hex])
  ];
  // Un color guardado que no está en la lista es "Otro", con el suyo.
  const propio = opciones.some(([valor]) => valor === elegido) ? "" : elegido;
  document.getElementById("marcaColores").innerHTML =
    opciones
      .map(
        ([valor, nombre, muestra]) => `
      <label class="marca-color">
        <input type="radio" name="color" value="${esc(valor)}"${valor === elegido ? " checked" : ""} />
        <span class="marca-color-muestra" style="background: ${esc(muestra)}"></span>
        <span class="marca-color-nombre">${esc(nombre)}</span>
      </label>`
      )
      .join("") +
    `
      <label class="marca-color">
        <input type="radio" name="color" value="otro"${propio ? " checked" : ""} />
        <span class="marca-color-muestra${propio ? "" : " marca-color-arcoiris"}"${propio ? ` style="background: ${esc(propio)}"` : ""}></span>
        <input type="color" name="color_otro" class="marca-color-otro" value="${esc(propio || "#1f2937")}" aria-label="Elegir otro color" />
        <span class="marca-color-nombre">Otro</span>
      </label>`;
}

// "Otro": la muestra redonda toma el color del selector del sistema, que
// queda invisible encima de la tarjeta.
function elegirColorPropio() {
  const selector = formMarca.querySelector('input[name="color_otro"]');
  formMarca.querySelector('input[name="color"][value="otro"]').checked = true;
  const muestra = formMarca.querySelector(".marca-color-otro").previousElementSibling;
  muestra.classList.remove("marca-color-arcoiris");
  muestra.style.background = selector.value;
}

function pintarLogoMarca() {
  const url = logoVisible();
  const imagen = url ? `<img src="${esc(url)}" alt="Tu logo" />` : `<span class="marca-logo-vacio">Sin logo</span>`;
  document.getElementById("marcaLogoFondos").innerHTML = `
    <div class="marca-logo-fondo marca-logo-fondo-oscuro">${imagen}</div>
    <div class="marca-logo-fondo marca-logo-fondo-claro">${imagen}</div>`;
  botonSubirLogo.textContent = url ? "Cambiar el logo" : "Subir logo";
  botonSacarLogo.hidden = !url;
}

// La vista previa toma el color elegido sin tocar el resto de la app: las
// mismas variables de styles.css, solo adentro de la tarjeta.
function pintarPreviaMarca() {
  const hex = colorElegido();
  const variantes = HEX.test(hex) ? variantesDeColor(hex) : AZUL_NEXO;
  const delTema = variantes[temaActual() === "claro" ? "claro" : "oscuro"];
  const previa = document.getElementById("marcaPrevia");
  previa.style.setProperty("--accent", delTema.accent);
  previa.style.setProperty("--accent-on-dark", variantes.oscuro.accent);
  previa.style.setProperty("--accent-on-dark-ink", variantes.oscuro.contrast);
  previa.style.setProperty("--sidebar-active", variantes.oscuro.bg);

  const url = logoVisible();
  const nombre = negocio.nombre || "Tu negocio";
  const cuadradito = url
    ? `<span class="negocio-inicial negocio-logo"><img src="${esc(url)}" alt=""${atributosEncuadre(entero(encuadreElegido()) ? null : encuadreElegido())} /></span>`
    : `<span class="negocio-inicial">${esc(([...nombre.trim()][0] ?? "N").toLocaleUpperCase("es-AR"))}</span>`;
  document.getElementById("marcaPreviaNegocio").innerHTML = `${cuadradito}<span>${esc(nombre)}</span>`;
  const papel = colorParaPapel(HEX.test(hex) ? hex : null) ?? "#0A0A0A";
  document.getElementById("marcaPreviaPapel").innerHTML = `
    ${url ? `<img class="membrete-previa-logo" src="${esc(url)}" alt="" />` : ""}
    <p class="membrete-previa-nombre" style="color: ${esc(papel)}">${esc(nombre)}</p>
    ${negocio.direccion ? `<p>${esc(negocio.direccion)}</p>` : ""}
    <p>FACTURA B · N° 00001-00000152</p>`;
}

// Los colores de un logo ya guardado, para ofrecerlos: se leen de la imagen.
function leerColoresDe(url) {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => {
      const lienzo = document.createElement("canvas");
      lienzo.width = img.naturalWidth;
      lienzo.height = img.naturalHeight;
      lienzo.getContext("2d").drawImage(img, 0, 0);
      ok(coloresDelLogo(lienzo));
    };
    img.onerror = () => ok([]);
    img.src = url;
  });
}

function pintarMarca() {
  logoPendiente = undefined;
  coloresDelLogoActual = [];
  estadoLogo.value = negocio.logo ? "actual" : "";
  errorLogo.hidden = true;
  pintarColores(negocio.color_marca ?? "");
  ponerEncuadre(negocio.logo_encuadre);
  pintarLogoMarca();
  pintarEncuadre();
  pintarPreviaMarca();
  marcarSinCambios(formMarca);
  if (!negocio.logo) return;
  const url = negocio.logo;
  leerColoresDe(url).then((colores) => {
    if (logoPendiente !== undefined || negocio.logo !== url || !colores.length) return;
    const sinTocar = !tieneCambios(formMarca);
    coloresDelLogoActual = colores;
    pintarColores(colorElegido());
    if (sinTocar) marcarSinCambios(formMarca);
  });
}

botonSubirLogo.addEventListener("click", () => archivoLogo.click());

archivoLogo.addEventListener("change", async () => {
  const archivo = archivoLogo.files[0];
  archivoLogo.value = "";
  if (!archivo) return;
  errorLogo.hidden = true;
  let imagen;
  try {
    imagen = await achicarImagen(archivo, { lado: 640 });
  } catch (e) {
    errorLogo.textContent = e.message;
    errorLogo.hidden = false;
    return;
  }
  logoPendiente = { tipo: imagen.tipo, datos: imagen.datos, url: imagen.url };
  coloresDelLogoActual = coloresDelLogo(imagen.lienzo);
  estadoLogo.value = `nuevo-${Date.now()}`;
  // Sin un color elegido, el del logo: se ve enseguida en la vista previa y
  // se puede volver al azul antes de guardar.
  const elegido = colorElegido();
  pintarColores(!elegido && coloresDelLogoActual[0] ? coloresDelLogoActual[0] : elegido);
  ponerEncuadre(null);
  pintarLogoMarca();
  pintarEncuadre();
  pintarPreviaMarca();
  actualizarBoton(formMarca);
});

botonSacarLogo.addEventListener("click", () => {
  logoPendiente = negocio.logo ? null : undefined;
  coloresDelLogoActual = [];
  estadoLogo.value = "";
  pintarColores(colorElegido());
  ponerEncuadre(null);
  pintarLogoMarca();
  pintarEncuadre();
  pintarPreviaMarca();
  actualizarBoton(formMarca);
  botonSubirLogo.focus();
});

formMarca.addEventListener("input", (e) => {
  // Mover el color de "Otro" ya es elegirlo.
  if (e.target.name === "color_otro") elegirColorPropio();
  pintarPreviaMarca();
});
// Tocar "Otro" lo elige, aunque se cierre el selector sin mover el color.
formMarca.addEventListener("click", (e) => {
  if (e.target.name !== "color_otro") return;
  elegirColorPropio();
  pintarPreviaMarca();
  actualizarBoton(formMarca);
});
formMarca.addEventListener("change", pintarPreviaMarca);
document.addEventListener("nexo:tema", () => {
  if (!formMarca.closest(".config-pagina").hidden) pintarPreviaMarca();
});

formMarca.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!tieneCambios(formMarca)) return;
  const cuerpo = {};
  const color = colorElegido() || null;
  if (color !== (negocio.color_marca ?? null)) cuerpo.color = color;
  if (logoPendiente !== undefined) cuerpo.logo = logoPendiente && { tipo: logoPendiente.tipo, datos: logoPendiente.datos };
  const encuadre = logoVisible() && !entero(encuadreElegido()) ? encuadreElegido() : null;
  if (JSON.stringify(encuadre) !== JSON.stringify(negocio.logo_encuadre ?? null)) cuerpo.encuadre = encuadre;
  await guardar(formMarca, cuerpo, pintarMarca, "/api/negocio/marca");
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
  // Con el logo y el color del negocio (hist. §212), como sale impreso.
  const color = colorParaPapel(negocio.color_marca);
  document.getElementById("configMembrete").innerHTML = `
    ${negocio.logo ? `<img class="membrete-previa-logo" src="${esc(negocio.logo)}" alt="" />` : ""}
    <p class="membrete-previa-nombre"${color ? ` style="color: ${esc(color)}"` : ""}>${esc(negocio.nombre || "Tu negocio")}</p>
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
  for (const radio of formApariencia.querySelectorAll('input[name="idioma"]')) radio.checked = radio.value === idioma;
}

// El idioma recarga la página (core/idioma.js): todo se vuelve a pintar ya
// traducido. El tema se aplica en el momento.
formApariencia.addEventListener("change", (e) => {
  if (e.target.name === "idioma") cambiarIdioma(e.target.value);
  else aplicarTema(e.target.value);
});
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
  marca: { admin: true, form: formMarca, alEntrar: pintarMarca },
  // Lo que ya tenía el negocio al empezar con Nexo: dominios/carga-inicial.js
  // (handoff 8c). Cada parte es su página, y todas marcan el mismo ítem.
  "lo-que-tenias": { admin: true, alEntrar: () => invocar("pintar:carga-inicial", "lo-que-tenias") },
  "stock-inicial": {
    admin: true,
    modulo: "stock",
    menu: "lo-que-tenias",
    alEntrar: () => invocar("pintar:carga-inicial", "stock-inicial")
  },
  "te-deben": { admin: true, menu: "lo-que-tenias", alEntrar: () => invocar("pintar:carga-inicial", "te-deben") },
  "lo-que-debes": { admin: true, menu: "lo-que-tenias", alEntrar: () => invocar("pintar:carga-inicial", "lo-que-debes") },
  "plata-inicial": { admin: true, menu: "lo-que-tenias", alEntrar: () => invocar("pintar:carga-inicial", "plata-inicial") },
  "ventas-anteriores": { admin: true, menu: "lo-que-tenias", alEntrar: () => invocar("pintar:carga-inicial", "ventas-anteriores") },
  // Traer productos, clientes o proveedores desde Excel: dominios/importar.js (hist. §211).
  planilla: { admin: true, menu: "lo-que-tenias", alEntrar: () => invocar("pintar:planilla") },
  funciones: { admin: true, form: formFunciones, alEntrar: pintarFunciones },
  "cambiar-tipo": { admin: true, form: formCambiarTipo, alEntrar: pintarCambiarTipo, menu: "funciones" },
  // Las etapas del embudo de consultas las pinta dominios/crm.js (hist. §90).
  "etapas-consultas": { admin: true, modulo: "crm", alEntrar: () => invocar("pintar:etapasConsultas") },
  // Las etiquetas de la balanza: dominios/balanza.js (hist. §132).
  balanza: { admin: true, modulo: "pos", alEntrar: () => invocar("pintar:balanza") },
  // Cómo pagan los clientes y a qué cuenta entra: dominios/medios-cobro.js (hist. §171).
  "medios-cobro": { admin: true, modulo: "pos", alEntrar: () => invocar("pintar:mediosCobro") },
  // Cada local con su depósito, sus cajas y su gente: dominios/sucursales.js (hist. §193).
  sucursales: { admin: true, alEntrar: () => invocar("pintar:sucursales") },
  comprobantes: { admin: true, form: formComprobantes, alEntrar: pintarComprobantes },
  // Factura electrónica con ARCA: dominios/factura-electronica.js (etapa E).
  "factura-electronica": { admin: true, alEntrar: () => invocar("pintar:factura-electronica") },
  // Tienda Nube: dominios/tienda-nube.js (etapa G). Las dos tiendas son del
  // módulo Venta online (hist. §128).
  "tienda-nube": { admin: true, modulo: "canales", alEntrar: () => invocar("pintar:tienda-nube") },
  // Mercado Libre: dominios/mercado-libre.js (etapa G).
  "mercado-libre": { admin: true, modulo: "canales", alEntrar: () => invocar("pintar:mercado-libre") },
  // Mercado Pago: dominios/mercado-pago.js (hist. §130). No es un canal de
  // venta: no depende del módulo Venta online.
  "mercado-pago": { admin: true, alEntrar: () => invocar("pintar:mercado-pago") },
  // Los mensajes de WhatsApp para recordar deudas: dominios/mensajes.js (hist. §219).
  mensajes: { admin: true, alEntrar: () => invocar("pintar:mensajes") },
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
  // WhatsApp, el teléfono de cada persona: dominios/whatsapp.js (hist. §135).
  whatsapp: { admin: false, alEntrar: () => invocar("pintar:whatsapp") },
  // Las facturas desde el Gmail del negocio: dominios/gmail.js (hist. §187).
  gmail: { admin: true, alEntrar: () => invocar("pintar:gmail") },
  // Avisar un problema: dominios/problema.js (handoff.md, "Orden", punto 2).
  problema: { admin: false, alEntrar: () => invocar("pintar:problema") },
  // Notificaciones de cada aparato: dominios/notificaciones.js (hist. §146).
  notificaciones: { admin: false, alEntrar: () => invocar("pintar:notificaciones") },
  // El menú de cada persona: dominios/menu.js (hist. §224).
  menu: { admin: false, alEntrar: () => invocar("pintar:menu") },
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

// En la compu la lista tiene su propio scroll y mide lo que se ve de ella:
// con la página arriba arranca más abajo (el título, el aviso del ejemplo), y
// el tope fijo del CSS la dejaba seguir debajo del borde de la pantalla.
const listaConfig = config.querySelector(".config-menu");
function ajustarLista() {
  if (celular.matches || config.closest(".view").hidden) {
    listaConfig.style.maxHeight = "";
    return;
  }
  const arriba = Math.max(listaConfig.getBoundingClientRect().top, 16);
  listaConfig.style.maxHeight = `${Math.round(window.innerHeight - arriba - 16)}px`;
}
window.addEventListener("scroll", ajustarLista, { passive: true });
window.addEventListener("resize", ajustarLista);

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
  } else if (anterior !== clave) {
    // En la compu la lista tiene su propio scroll: la página nueva se ve
    // desde arriba, y el ítem elegido queda a la vista en la lista.
    // A mano y no con scrollIntoView, que corría también la página.
    window.scrollTo(0, 0);
    ajustarLista();
    const item = listaConfig.querySelector(".config-item.is-active");
    if (item) {
      const l = listaConfig.getBoundingClientRect();
      const i = item.getBoundingClientRect();
      if (i.bottom > l.bottom) listaConfig.scrollTop += i.bottom - l.bottom;
      else if (i.top < l.top) listaConfig.scrollTop -= l.top - i.top;
    }
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

alEntrarEnVista("configuracion", abrirPagina);
// Lo recarga el boot de app.js con recargar("negocio").
registrar("cargar:negocio", cargarNegocio);
