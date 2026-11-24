/**
 * dominios/grados.js
 * Grados y cinturones (hist. §230, docs/investigaciones/investigacion-gymdesk.md):
 * el módulo `grados`, sobre las rutas de server.js, sección "Grados y
 * cinturones". Las reglas (el paso que sigue, lo que pide, los meses) son las
 * de core/grados.js, las mismas que usa el servidor.
 * - la página (#/grados), por actividad: los listos para graduar (se marcan y
 *   se gradúan juntos, como en un examen), los alumnos por cinturón y los que
 *   vienen sin el suyo;
 * - armar los cinturones de una actividad (#/grados/armar/<id>), desde una
 *   plantilla o de cero, ordenándolos arrastrando;
 * - cargar a los que ya venían (#/grados/cargar/<id>): su cinturón, desde
 *   cuándo y las clases que llevan desde el último ascenso;
 * - el bloque de la ficha del socio: dónde está, cuánto le falta, graduarlo y
 *   su historial, con "Deshacer" en el último.
 * Las clases salen de la asistencia por clase (dominios/clases.js).
 */

import { esAdmin, esc, fechaAR, hoyISO, numero } from "../core/formato.js";
import { avisar, confirmar } from "../core/ui.js";
import { api } from "../core/api.js";
import { icono } from "../core/iconos.js";
import { alEntrarEnVista, invocar, registrar } from "../core/registro.js";
import { mostrarVista } from "../core/router.js";
import { moduloActivo } from "../core/negocio.js";
import { ordenarArrastrando } from "../core/arrastrar.js";
import { COLORES_CINTURON, MAX_CLASES_GRADO, MAX_RAYAS, PLANTILLAS_GRADOS, nombreDelPaso, revisarGrados } from "../core/grados.js";
import { formatear, t } from "../core/idioma.js";

let pagina = null; // lo de GET /api/grados
let actividadId = null; // la que se está mirando

const plural = (n, uno, varios) => `${numero(n)} ${n === 1 ? t(uno) : t(varios)}`;
const normalizar = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// El cinturón dibujado, con sus rayas en la punta (la del negro es roja).
function dibujoCinturon({ color, color2 }, raya = 0, clase = "") {
  const franja = color2 ? ` cint2-${esc(color2)}` : "";
  return `<span class="cinturon cint-${esc(color)}${franja} ${clase}" aria-hidden="true"><span class="cinturon-punta">${"<i></i>".repeat(Math.min(raya, MAX_RAYAS))}</span></span>`;
}

// Todos los pasos de una lista (cada cinturón liso y con cada raya), para
// elegir. El valor es "grado:raya".
const pasosDe = (grados) => grados.flatMap((g) => Array.from({ length: g.rayas + 1 }, (_, raya) => ({ grado: g, raya, valor: `${g.id}:${raya}` })));

const opcionesDePasos = (grados, elegido = "", vacio = null) =>
  (vacio ? `<option value="">${esc(t(vacio))}</option>` : "") +
  pasosDe(grados)
    .map((p) => `<option value="${esc(p.valor)}" ${p.valor === elegido ? "selected" : ""}>${esc(nombreDelPaso(p.grado, p.raya))}</option>`)
    .join("");

const leerPaso = (valor) => {
  const [grado, raya] = String(valor).split(":").map(Number);
  return { grado_id: grado, raya };
};

// Lo que le falta para el paso que sigue, en palabras, y cuánto lleva (de 0 a
// 1) para la barrita. Sin el ingreso (hist. §233) el servidor no cuenta las
// clases (a.clases es null) y el paso pide solo los meses.
function cuantoFalta(a) {
  if (!a.siguiente) return { texto: t("Tiene el último cinturón."), avance: 1 };
  const { clases, meses } = a.siguiente;
  const partes = [];
  const avances = [];
  if (clases != null) {
    partes.push(a.clases >= clases ? formatear("las {0} clases", numero(clases)) : formatear("{0} de {1} clases", numero(a.clases), numero(clases)));
    avances.push(a.clases / clases);
  } else if (a.clases != null) {
    partes.push(plural(a.clases, "clase", "clases"));
  }
  if (meses != null) {
    partes.push(a.meses >= meses ? formatear("los {0} meses", numero(meses)) : formatear("{0} de {1} meses", numero(a.meses), numero(meses)));
    avances.push(a.meses / meses);
  }
  const lleva = partes.join(t(" y "));
  let texto;
  if (a.listo) texto = formatear("Listo para {0}: tiene {1}.", a.siguiente.nombre, lleva);
  else if (avances.length) texto = formatear("{0} para {1}.", lleva, a.siguiente.nombre);
  else if (lleva) texto = formatear("{0} desde el último paso. {1} no pide un mínimo: lo decidís vos.", lleva, a.siguiente.nombre);
  else texto = formatear("{0} lo decidís vos.", a.siguiente.nombre);
  return { texto, avance: avances.length ? Math.min(1, ...avances) : null };
}

const barrita = (avance) =>
  avance == null ? "" : `<span class="grados-avance" aria-hidden="true"><span style="width:${esc(Math.round(Math.max(0, avance) * 100))}%"></span></span>`;

/* ---------- La página (#/grados) ---------- */

const actividad = () => pagina?.actividades.find((a) => a.id === actividadId) ?? null;
const conGrados = () => pagina.actividades.filter((a) => a.grados.length);

async function cargarPagina() {
  pagina = await api("/api/grados", { error: "No se pudieron cargar los cinturones." });
}

function pintarLista() {
  const conLista = conGrados();
  document.getElementById("gradosVacio").hidden = conLista.length > 0;
  document.getElementById("gradosContenido").hidden = conLista.length === 0;
  if (!conLista.length) return pintarVacio();
  if (!conLista.some((a) => a.id === actividadId)) actividadId = conLista[0].id;
  const a = actividad();

  const segmentos = document.getElementById("gradosActividades");
  segmentos.hidden = conLista.length < 2;
  segmentos.innerHTML = conLista
    .map((x) => `<button type="button" class="segmento" data-actividad="${x.id}" aria-pressed="${x.id === a.id}">${esc(x.nombre)}</button>`)
    .join("");
  document.getElementById("gradosEditar").href = `#/grados/armar/${a.id}`;
  document.getElementById("gradosCargar").href = `#/grados/cargar/${a.id}`;
  document.getElementById("gradosSinCargar").href = `#/grados/cargar/${a.id}`;
  document.getElementById("gradosSinIngreso").hidden = moduloActivo("ingreso");

  const alumnos = pagina.alumnos.filter((x) => x.actividad_id === a.id);
  const listos = alumnos.filter((x) => x.listo);
  const sin = pagina.sin_grado.filter((x) => x.actividad_id === a.id);
  document.getElementById("gradosConCinturon").textContent = numero(alumnos.length);
  document.getElementById("gradosListosCifra").textContent = numero(listos.length);
  document.getElementById("gradosSinCifra").textContent = numero(sin.length);

  pintarListos(listos);
  pintarPorCinturon(a, alumnos);

  document.getElementById("gradosSinPanel").hidden = sin.length === 0;
  document.getElementById("gradosSin").innerHTML = sin
    .map(
      (s) => `
      <li><button type="button" class="grados-fila" data-socio="${s.socio_id}">
        <span class="grados-fila-quien"><strong>${esc(s.nombre)}</strong><small>N° ${esc(s.numero)}</small></span>
        <span class="grados-fila-dato">${esc(formatear("Vino a {0}", plural(s.clases, "clase", "clases")))}</span>
      </button></li>`
    )
    .join("");

  // Las actividades que todavía no tienen sus cinturones, para armarlos.
  const otras = pagina.actividades.filter((x) => !x.grados.length && x.horario === "fijo");
  const bloqueOtras = document.getElementById("gradosOtras");
  bloqueOtras.hidden = otras.length === 0;
  bloqueOtras.innerHTML = otras.length
    ? `<span>${esc(t("Armar los cinturones de otra actividad:"))}</span> ${otras
        .map((x) => `<a class="btn-link" href="#/grados/armar/${x.id}">${esc(x.nombre)}</a>`)
        .join(" · ")}`
    : "";
}

function pintarVacio() {
  const actividades = pagina.actividades;
  document.getElementById("gradosVacioActividades").innerHTML = actividades.length
    ? actividades
        .map(
          (a) =>
            `<a class="btn btn-secundario color-${esc(a.color)}" href="#/grados/armar/${a.id}"><span class="grilla-punto" aria-hidden="true"></span> ${esc(a.nombre)}</a>`
        )
        .join("")
    : `<p>${esc(t("Primero cargá tus actividades en Clases (BJJ, Judo…)."))} <a class="btn-link" href="#/clases">${esc(t("Ir a Clases"))}</a></p>`;
}

function pintarListos(listos) {
  document.getElementById("gradosListosPanel").hidden = listos.length === 0;
  const admin = esAdmin();
  document.getElementById("gradosListos").innerHTML = listos
    .map((x) => {
      const paso = `${esc(x.nombre)} ${icono("chevron-right")} ${dibujoCinturon(x.siguiente, x.siguiente.raya, "cinturon-chico")} ${esc(x.siguiente.nombre)}`;
      const dato = esc(cuantoFalta(x).texto);
      const quien = `<span class="grados-fila-quien"><strong>${esc(x.alumno)}</strong><small>${paso}</small></span><span class="grados-fila-dato">${dato}</span>`;
      return admin
        ? `<li><label class="grados-fila grados-fila-marcar"><input type="checkbox" data-listo="${x.socio_id}" />${quien}</label></li>`
        : `<li><button type="button" class="grados-fila" data-socio="${x.socio_id}">${quien}</button></li>`;
    })
    .join("");
  const form = document.getElementById("formGraduarMarcados");
  if (!form.fecha.value) form.fecha.value = hoyISO();
  form.fecha.max = hoyISO();
  marcarGraduar();
}

function pintarPorCinturon(a, alumnos) {
  const zona = document.getElementById("gradosPorCinturon");
  if (!alumnos.length) {
    zona.innerHTML = esAdmin()
      ? `<p class="grados-nadie">${esc(t("Todavía nadie tiene su cinturón en Nexo. Cargá a los que ya venían con su cinturón y las clases que llevan."))} <a class="btn-link" href="#/grados/cargar/${a.id}">${esc(t("Cargar los que ya venían"))}</a></p>`
      : `<p class="grados-nadie">${esc(t("Todavía nadie tiene su cinturón en Nexo."))}</p>`;
    return;
  }
  zona.innerHTML = a.grados
    .map((g) => {
      const de = alumnos.filter((x) => x.grado_id === g.id).sort((x, y) => y.raya - x.raya || x.alumno.localeCompare(y.alumno));
      if (!de.length) return "";
      return `
      <section class="grados-grupo">
        <h3 class="grados-grupo-titulo">${dibujoCinturon(g, 0)} ${esc(g.nombre)} <small>${esc(String(de.length))}</small></h3>
        <ul class="grados-filas">${de
          .map((x) => {
            const falta = cuantoFalta(x);
            return `
          <li><button type="button" class="grados-fila${x.listo ? " es-listo" : ""}" data-socio="${x.socio_id}">
            ${dibujoCinturon(x, x.raya, "cinturon-chico")}
            <span class="grados-fila-quien"><strong>${esc(x.alumno)}</strong><small>${esc(x.raya ? plural(x.raya, "grado", "grados") : t("Sin grados"))} · ${esc(formatear("desde el {0}", fechaAR(x.fecha)))}</small></span>
            <span class="grados-fila-dato">${esc(falta.texto)}${barrita(falta.avance)}</span>
          </button></li>`;
          })
          .join("")}</ul>
      </section>`;
    })
    .join("");
}

function marcarGraduar() {
  const marcados = document.querySelectorAll("#gradosListos [data-listo]:checked").length;
  const boton = document.querySelector('#formGraduarMarcados [type="submit"]');
  boton.disabled = marcados === 0;
  boton.textContent = marcados ? formatear("Graduar a {0}", plural(marcados, "alumno", "alumnos")) : t("Graduar a los marcados");
}

document.getElementById("gradosActividades").addEventListener("click", (e) => {
  const boton = e.target.closest("[data-actividad]");
  if (!boton) return;
  actividadId = Number(boton.dataset.actividad);
  pintarLista();
});

document.getElementById("gradosListos").addEventListener("change", marcarGraduar);

// Tocar a un alumno abre su ficha.
for (const id of ["gradosPorCinturon", "gradosSin", "gradosListos"]) {
  document.getElementById(id).addEventListener("click", (e) => {
    const fila = e.target.closest("[data-socio]");
    if (fila) invocar("abrirFicha:socio", Number(fila.dataset.socio));
  });
}

document.getElementById("formGraduarMarcados").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const ids = [...document.querySelectorAll("#gradosListos [data-listo]:checked")].map((c) => Number(c.dataset.listo));
  const pasos = pagina.alumnos
    .filter((x) => x.actividad_id === actividadId && ids.includes(x.socio_id))
    .map((x) => ({ socio_id: x.socio_id, grado_id: x.siguiente.grado_id, raya: x.siguiente.raya, fecha: form.fecha.value, nota: form.nota.value }));
  if (!pasos.length) return;
  const boton = form.querySelector('[type="submit"]');
  boton.disabled = true;
  try {
    pagina = await api("/api/grados/pasos", { method: "POST", body: { pasos }, error: "No se pudo anotar la graduación." });
  } finally {
    boton.disabled = false;
  }
  form.nota.value = "";
  avisar(pasos.length === 1 ? "¡Graduado! Queda en su historial." : formatear("¡{0} graduados! Queda en el historial de cada uno.", numero(pasos.length)), "ok");
  pintarLista();
});

/* ---------- Armar los cinturones (#/grados/armar/<id>) ---------- */

const formGrados = document.getElementById("formGrados");
const listaGrados = document.getElementById("gradosLista");
let actividadArmada = null;
let clave = 0;

function filaDeGrado(g = {}) {
  const k = clave++;
  const colores = Object.entries(COLORES_CINTURON)
    .map(
      ([valor, nombre]) => `
      <label class="color-elegir cint-${valor}" title="${esc(t(nombre))}">
        <input type="radio" name="color-${k}" value="${valor}" aria-label="${esc(t(nombre))}" ${valor === (g.color ?? "blanco") ? "checked" : ""} />
      </label>`
    )
    .join("");
  const franjas = Object.entries(COLORES_CINTURON)
    .map(([valor, nombre]) => `<option value="${valor}" ${valor === g.color2 ? "selected" : ""}>${esc(t(nombre))}</option>`)
    .join("");
  const numeroCampo = (nombre, valor, max, placeholder) =>
    `<input type="number" name="${nombre}" min="1" max="${max}" step="1" inputmode="numeric" value="${esc(valor ?? "")}" placeholder="${esc(t(placeholder))}" />`;
  return `
    <li class="grado-fila" data-id="${g.id ?? ""}" data-alumnos="${esc(g.alumnos ?? 0)}">
      <div class="grado-fila-cabeza">
        <button type="button" class="btn-icon tablero-arrastrar" data-arrastrar aria-label="${esc(t("Mover el cinturón: arrastralo o usá las flechas"))}" title="${esc(t("Arrastrá para cambiarlo de lugar"))}">${icono("menu")}</button>
        <span data-dibujo>${dibujoCinturon({ color: g.color ?? "blanco", color2: g.color2 }, g.rayas ?? 0)}</span>
        <label class="grado-fila-nombre"><span class="visualmente-oculto">${esc(t("Nombre"))}</span>
          <input type="text" name="nombre" maxlength="40" autocomplete="off" value="${esc(g.nombre ?? "")}" placeholder="${esc(t("Ej: Azul"))}" />
        </label>
        <button type="button" class="btn-icon" data-sacar aria-label="${esc(t("Sacar este cinturón"))}" title="${esc(t("Sacar"))}">${icono("trash-2")}</button>
      </div>
      <div class="grado-fila-campos">
        <fieldset class="grado-colores">
          <legend>${esc(t("Color"))}</legend>
          <div class="colores-elegir">${colores}</div>
        </fieldset>
        <label>${esc(t("Franja del medio"))}
          <select name="color2"><option value="">${esc(t("Sin franja"))}</option>${franjas}</select>
        </label>
        <label>${esc(t("Grados"))}
          <input type="number" name="rayas" min="0" max="${MAX_RAYAS}" step="1" inputmode="numeric" value="${esc(g.rayas ?? 0)}" />
        </label>
        <label data-si-rayas>${esc(t("Clases por grado"))}
          ${numeroCampo("clases_raya", g.clases_raya, MAX_CLASES_GRADO, "A ojo")}
        </label>
        <label data-no-primero>${esc(t("Clases para llegar"))}
          ${numeroCampo("clases", g.clases, MAX_CLASES_GRADO, "A ojo")}
        </label>
        <label data-no-primero>${esc(t("Meses con el anterior"))}
          ${numeroCampo("meses", g.meses, 240, "Sin mínimo")}
        </label>
      </div>
    </li>`;
}

function leerFila(li) {
  const valor = (nombre) => li.querySelector(`[name="${nombre}"]`).value;
  return {
    id: li.dataset.id ? Number(li.dataset.id) : null,
    nombre: valor("nombre"),
    color: li.querySelector('input[type="radio"]:checked')?.value ?? null,
    color2: valor("color2") || null,
    rayas: valor("rayas") === "" ? 0 : Number(valor("rayas")),
    clases_raya: valor("clases_raya") || null,
    clases: valor("clases") || null,
    meses: valor("meses") || null
  };
}

const leerFilas = () => [...listaGrados.querySelectorAll(".grado-fila")].map(leerFila);

// Lo que cambia con cada fila: el dibujo, las clases por raya (sin rayas no
// van) y lo que pide el primero, que no viene de ningún otro.
function refrescarFila(li, primero) {
  const g = leerFila(li);
  li.querySelector("[data-dibujo]").innerHTML = dibujoCinturon({ color: g.color ?? "blanco", color2: g.color2 }, Math.min(g.rayas || 0, MAX_RAYAS));
  li.querySelector("[data-si-rayas]").hidden = !(g.rayas > 0);
  for (const campo of li.querySelectorAll("[data-no-primero]")) campo.hidden = primero;
}

function refrescarFilas() {
  const filas = [...listaGrados.querySelectorAll(".grado-fila")];
  filas.forEach((li, i) => refrescarFila(li, i === 0));
  document.getElementById("gradosPlantillas").hidden = filas.length > 0;
  formGrados.hidden = filas.length === 0;
  document.getElementById("gradosArmarAyuda").textContent = filas.length
    ? formatear("{0}. Lo que pide cada uno se cuenta desde el paso anterior.", plural(filas.length, "cinturón", "cinturones"))
    : "";
}

function pintarPlantillas() {
  document.getElementById("gradosPlantillasLista").innerHTML =
    Object.entries(PLANTILLAS_GRADOS)
      .map(
        ([valor, p]) => `
      <button type="button" class="opcion-tarjeta grados-plantilla" data-plantilla="${valor}">
        <span class="grados-plantilla-dibujo">${p.grados
          .filter((g) => !g.color2)
          .slice(0, 5)
          .map((g) => dibujoCinturon(g, 0, "cinturon-chico"))
          .join("")}</span>
        <span class="opcion-tarjeta-texto">
          <span class="opcion-tarjeta-nombre">${esc(t(p.nombre))}</span>
          <span class="opcion-tarjeta-desc">${esc(t(p.detalle))}</span>
        </span>
      </button>`
      )
      .join("") +
    `<button type="button" class="opcion-tarjeta grados-plantilla" data-plantilla="">
        <span class="grados-plantilla-dibujo">${icono("plus")}</span>
        <span class="opcion-tarjeta-texto">
          <span class="opcion-tarjeta-nombre">${esc(t("Empezar de cero"))}</span>
          <span class="opcion-tarjeta-desc">${esc(t("Los cargás uno por uno."))}</span>
        </span>
      </button>`;
}

async function prepararArmar(id) {
  if (!pagina) await cargarPagina();
  actividadArmada = pagina.actividades.find((a) => a.id === id) ?? null;
  if (!actividadArmada) {
    avisar("Esa actividad no existe.", "error");
    return mostrarVista("grados");
  }
  document.getElementById("gradosArmarTitulo").textContent = formatear("Cinturones de {0}", actividadArmada.nombre);
  pintarPlantillas();
  listaGrados.innerHTML = actividadArmada.grados.map(filaDeGrado).join("");
  refrescarFilas();
}

document.getElementById("gradosPlantillasLista").addEventListener("click", (e) => {
  const boton = e.target.closest("[data-plantilla]");
  if (!boton) return;
  const plantilla = PLANTILLAS_GRADOS[boton.dataset.plantilla];
  listaGrados.innerHTML = plantilla ? plantilla.grados.map((g) => filaDeGrado({ ...g, nombre: t(g.nombre) })).join("") : filaDeGrado();
  refrescarFilas();
  listaGrados.querySelector(plantilla ? '[name="clases_raya"]' : '[name="nombre"]')?.focus();
});

document.getElementById("btnSumarCinturon").addEventListener("click", () => {
  listaGrados.insertAdjacentHTML("beforeend", filaDeGrado());
  refrescarFilas();
  listaGrados.lastElementChild.querySelector('[name="nombre"]').focus();
});

for (const evento of ["input", "change"]) {
  listaGrados.addEventListener(evento, (e) => {
    const li = e.target.closest(".grado-fila");
    if (li) refrescarFila(li, li === listaGrados.firstElementChild);
  });
}

listaGrados.addEventListener("click", async (e) => {
  const sacar = e.target.closest("[data-sacar]");
  if (!sacar) return;
  const li = sacar.closest(".grado-fila");
  const alumnos = Number(li.dataset.alumnos);
  if (alumnos > 0) {
    const ok = await confirmar({
      titulo: formatear("Sacar {0}", li.querySelector('[name="nombre"]').value),
      cuerpo: formatear("Lo tienen {0}. Siguen con él y queda en su historial, pero no se ofrece más para graduar.", plural(alumnos, "alumno", "alumnos")),
      aceptar: "Sacar",
      destructivo: true
    });
    if (!ok) return;
  }
  li.remove();
  refrescarFilas();
});

ordenarArrastrando(listaGrados, { fila: ".grado-fila", alCambiar: refrescarFilas });

formGrados.addEventListener("submit", async (e) => {
  e.preventDefault();
  const { error } = revisarGrados(leerFilas());
  if (error) return avisar(error, "error");
  const boton = formGrados.querySelector('[type="submit"]');
  boton.disabled = true;
  try {
    await api(`/api/actividades/${actividadArmada.id}/grados`, { method: "PUT", body: { grados: leerFilas() }, error: "No se pudieron guardar los cinturones." });
  } finally {
    boton.disabled = false;
  }
  avisar(formatear("Listo: los cinturones de {0} quedaron guardados.", actividadArmada.nombre), "ok");
  actividadId = actividadArmada.id;
  pagina = null;
  mostrarVista("grados");
});

/* ---------- Los que ya venían (#/grados/cargar/<id>) ---------- */

const formCargar = document.getElementById("formCargarGrados");
const listaCargar = document.getElementById("gradosCargarLista");
let actividadCargada = null;

async function prepararCargar(id) {
  if (!pagina) await cargarPagina();
  actividadCargada = pagina.actividades.find((a) => a.id === id && a.grados.length) ?? null;
  if (!actividadCargada) {
    avisar("Esa actividad todavía no tiene cinturones.", "error");
    return mostrarVista("grados");
  }
  document.getElementById("gradosCargarTitulo").textContent = formatear("Los que ya venían a {0}", actividadCargada.nombre);
  document.getElementById("gradosCargarBuscar").value = "";
  // Los que no tienen su cinturón en esta actividad: primero los que vienen a
  // sus clases, después el resto.
  const tienen = new Set(pagina.alumnos.filter((x) => x.actividad_id === id).map((x) => x.socio_id));
  const vienen = new Map(pagina.sin_grado.filter((x) => x.actividad_id === id).map((x) => [x.socio_id, x.clases]));
  const socios = pagina.socios.filter((s) => !tienen.has(s.id)).sort((a, b) => (vienen.has(b.id) ? 1 : 0) - (vienen.has(a.id) ? 1 : 0));
  const opciones = opcionesDePasos(actividadCargada.grados, "", "Sin elegir");
  listaCargar.innerHTML = socios.length
    ? socios
        .map(
          (s) => `
      <li class="grados-cargar-fila" data-socio="${s.id}" data-buscar="${esc(normalizar([s.nombre, s.documento ?? "", s.numero].join(" ")))}">
        <span class="grados-fila-quien"><strong>${esc(s.nombre)}</strong><small>N° ${esc(s.numero)}${vienen.has(s.id) ? ` · ${esc(formatear("vino a {0}", plural(vienen.get(s.id), "clase", "clases")))}` : ""}</small></span>
        <label>${esc(t("Cinturón"))}<select name="paso">${opciones}</select></label>
        <label><span>${esc(t("Desde"))} <span class="campo-opcional">${esc(t("(opcional)"))}</span></span><input type="date" name="fecha" max="${hoyISO()}" /></label>
        <label><span>${esc(t("Clases desde el último ascenso"))} <span class="campo-opcional">${esc(t("(opcional)"))}</span></span>
          <input type="number" name="clases_antes" min="0" max="${MAX_CLASES_GRADO}" step="1" inputmode="numeric" placeholder="0" />
        </label>
      </li>`
        )
        .join("")
    : `<li class="grados-nadie">${esc(t("Todos los socios que siguen viniendo ya tienen su cinturón en esta actividad."))}</li>`;
  formCargar.querySelector('[type="submit"]').hidden = socios.length === 0;
  contarCargados();
}

const filasCargadas = () => [...listaCargar.querySelectorAll(".grados-cargar-fila")].filter((li) => li.querySelector('[name="paso"]').value);

function contarCargados() {
  const n = filasCargadas().length;
  document.getElementById("gradosCargarAyuda").textContent = n ? formatear("{0} con su cinturón elegido.", plural(n, "alumno", "alumnos")) : t("Elegí el cinturón de cada uno.");
  formCargar.querySelector('[type="submit"]').disabled = n === 0;
}

listaCargar.addEventListener("change", contarCargados);

document.getElementById("gradosCargarBuscar").addEventListener("input", (e) => {
  const buscado = normalizar(e.target.value.trim());
  for (const li of listaCargar.querySelectorAll(".grados-cargar-fila")) li.hidden = Boolean(buscado) && !li.dataset.buscar.includes(buscado);
});

formCargar.addEventListener("submit", async (e) => {
  e.preventDefault();
  const pasos = filasCargadas().map((li) => {
    const clases = li.querySelector('[name="clases_antes"]').value;
    return {
      socio_id: Number(li.dataset.socio),
      ...leerPaso(li.querySelector('[name="paso"]').value),
      fecha: li.querySelector('[name="fecha"]').value || null,
      clases_antes: clases === "" ? 0 : Number(clases)
    };
  });
  if (!pasos.length) return;
  const boton = formCargar.querySelector('[type="submit"]');
  boton.disabled = true;
  try {
    pagina = await api("/api/grados/pasos", { method: "POST", body: { pasos }, error: "No se pudieron guardar los cinturones." });
  } finally {
    boton.disabled = false;
  }
  avisar(formatear("Listo: {0} con su cinturón.", plural(pasos.length, "alumno", "alumnos")), "ok");
  actividadId = actividadCargada.id;
  mostrarVista("grados");
});

async function entrarAGrados(subruta) {
  const armar = /^armar\/(\d+)$/.exec(subruta ?? "");
  const cargar = /^cargar\/(\d+)$/.exec(subruta ?? "");
  const cual = esAdmin() && armar ? "armar" : esAdmin() && cargar ? "cargar" : "lista";
  for (const seccion of document.querySelectorAll(".grados-pagina")) seccion.hidden = seccion.dataset.pagina !== cual;
  if (cual === "armar") return prepararArmar(Number(armar[1]));
  if (cual === "cargar") return prepararCargar(Number(cargar[1]));
  if (subruta) history.replaceState(null, "", "#/grados");
  await cargarPagina();
  pintarLista();
}

alEntrarEnVista("grados", entrarAGrados);

/* ---------- La ficha del socio ---------- */

const panelFicha = document.getElementById("fichaSocioGradosPanel");
const zonaFicha = document.getElementById("fichaSocioGrados");
let socioDeLaFicha = null;

function formularioDeGrado(g) {
  const s = g.situacion;
  // Graduar propone el paso que sigue; se puede elegir otro (un salto).
  const elegido = s?.siguiente ? `${s.siguiente.grado_id}:${s.siguiente.raya}` : "";
  const clasesAntes = s
    ? ""
    : `<label><span>${esc(t("Clases desde el último ascenso"))} <span class="campo-opcional">${esc(t("(opcional)"))}</span></span><input type="number" name="clases_antes" min="0" max="${MAX_CLASES_GRADO}" step="1" inputmode="numeric" placeholder="0" /></label>`;
  return `
      <button type="button" class="btn ${s?.listo ? "btn-primary" : "btn-secundario"} btn-chico" data-abrir-graduar>${esc(s ? t("Graduar") : t("Ponerle su cinturón"))}</button>
      <form class="form socio-grado-form" data-graduar hidden novalidate>
        <label>${esc(s ? t("A qué pasa") : t("Su cinturón"))}<select name="paso">${opcionesDePasos(g.grados, elegido)}</select></label>
        <label>${esc(s ? t("Fecha") : t("Desde"))}<input type="date" name="fecha" value="${hoyISO()}" max="${hoyISO()}" ${s ? `min="${esc(s.fecha)}"` : ""} /></label>
        ${clasesAntes}
        <label><span>${esc(t("Nota"))} <span class="campo-opcional">${esc(t("(opcional)"))}</span></span><input type="text" name="nota" maxlength="200" autocomplete="off" /></label>
        <div class="socio-grado-botones">
          <button type="button" class="btn-link" data-cancelar>${esc(t("Cancelar"))}</button>
          <button type="submit" class="btn btn-primary btn-chico">${esc(t("Guardar"))}</button>
        </div>
      </form>`;
}

function historialDeGrado(g) {
  if (!g.historial.length) return "";
  const admin = esAdmin();
  return `<details class="socio-grado-historial">
        <summary>${esc(t("Historial"))} <small>${esc(String(g.historial.length))}</small></summary>
        <ol>${g.historial
          .map((h) => {
            const detalle = [
              fechaAR(h.fecha),
              h.usuario,
              h.clases_antes ? formatear("con {0} que ya llevaba", plural(h.clases_antes, "clase", "clases")) : null,
              h.nota
            ].filter(Boolean);
            return `
          <li>
            ${dibujoCinturon(h, h.raya ?? 0, "cinturon-chico")}
            <span><strong>${esc(h.nombre)}</strong><small>${esc(detalle.join(" · "))}</small></span>
            ${admin && h.ultimo ? `<button type="button" class="btn-link" data-deshacer="${h.id}" data-nombre="${esc(h.nombre)}">${esc(t("Deshacer"))}</button>` : ""}
          </li>`;
          })
          .join("")}</ol>
      </details>`;
}

function bloqueDeActividad(g) {
  const s = g.situacion;
  const cabeza = s
    ? `${dibujoCinturon(s, s.raya)}
       <span class="socio-grado-quien"><strong>${esc(s.nombre)}</strong><small>${esc(g.actividad.nombre)} · ${esc(formatear("con el cinturón desde el {0}", fechaAR(s.desde_cinturon)))}</small></span>
       ${s.listo ? `<span class="status status-cobrado">${esc(t("Listo para graduar"))}</span>` : ""}`
    : `<span class="cinturon cinturon-vacio" aria-hidden="true"></span>
       <span class="socio-grado-quien"><strong>${esc(t("Sin cinturón en Nexo"))}</strong><small>${esc(g.actividad.nombre)} · ${esc(formatear("vino a {0}", plural(g.clases_total, "clase", "clases")))}</small></span>`;
  const falta = s ? cuantoFalta(s) : null;
  const puedeGraduar = esAdmin() && g.grados.length > 0 && (!s || s.siguiente);
  return `
    <article class="socio-grado${s?.listo ? " es-listo" : ""}" data-actividad="${g.actividad.id}">
      <div class="socio-grado-cabeza">${cabeza}</div>
      ${falta ? `<p class="socio-grado-falta">${esc(falta.texto)}</p>${barrita(falta.avance)}` : ""}
      ${puedeGraduar ? formularioDeGrado(g) : ""}
      ${historialDeGrado(g)}
    </article>`;
}

function pintarGradosDelSocio(socio) {
  socioDeLaFicha = socio;
  const lista = socio.grados ?? [];
  panelFicha.hidden = !moduloActivo("grados") || lista.length === 0;
  zonaFicha.innerHTML = lista.map(bloqueDeActividad).join("");
}

registrar("pintar:gradosDelSocio", pintarGradosDelSocio);

zonaFicha.addEventListener("click", async (e) => {
  const bloque = e.target.closest(".socio-grado");
  if (!bloque) return;
  const abrir = e.target.closest("[data-abrir-graduar]");
  if (abrir) {
    const form = bloque.querySelector("[data-graduar]");
    form.hidden = false;
    abrir.hidden = true;
    form.paso.focus();
    return;
  }
  if (e.target.closest("[data-cancelar]")) {
    bloque.querySelector("[data-graduar]").hidden = true;
    bloque.querySelector("[data-abrir-graduar]").hidden = false;
    return;
  }
  const deshacer = e.target.closest("[data-deshacer]");
  if (!deshacer) return;
  const ok = await confirmar({
    titulo: t("Deshacer el último paso"),
    cuerpo: formatear("{0} se saca de su historial y vuelve al cinturón que tenía, con sus clases. Queda anotado en la auditoría.", deshacer.dataset.nombre),
    aceptar: "Deshacer",
    destructivo: true
  });
  if (!ok) return;
  const socio = await api(`/api/socios/${socioDeLaFicha.id}/grados/${deshacer.dataset.deshacer}`, { method: "DELETE", error: "No se pudo deshacer." });
  pagina = null;
  avisar("Listo: volvió al que tenía.", "ok");
  pintarGradosDelSocio(socio);
});

zonaFicha.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target.closest("[data-graduar]");
  if (!form) return;
  const boton = form.querySelector('[type="submit"]');
  boton.disabled = true;
  try {
    await api("/api/grados/pasos", {
      method: "POST",
      body: {
        pasos: [
          {
            socio_id: socioDeLaFicha.id,
            ...leerPaso(form.paso.value),
            fecha: form.fecha.value || null,
            clases_antes: form.clases_antes?.value ? Number(form.clases_antes.value) : 0,
            nota: form.nota.value
          }
        ]
      },
      error: "No se pudo anotar el cinturón."
    });
  } finally {
    boton.disabled = false;
  }
  avisar(form.clases_antes ? "Listo: Nexo sigue contando sus clases desde ahí." : "¡Graduado! Queda en su historial.", "ok");
  const socio = await api(`/api/socios/${socioDeLaFicha.id}`, { error: "No se pudo cargar el socio." });
  pagina = null;
  pintarGradosDelSocio(socio);
});
