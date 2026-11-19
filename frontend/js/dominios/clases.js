/**
 * dominios/clases.js
 * La grilla de clases del gimnasio (hist. §200): las actividades, sus horarios
 * en la semana y los profes de cada uno. La ven todos (la recepción la
 * consulta) y la arma el admin. En el celular se ve de a un día; en la compu,
 * la semana entera, con las clases que coinciden una al lado de la otra. Las
 * actividades de horario libre (Musculación, abierta de 7 a 23) van arriba de
 * cada día, no en la línea de horas. La imagen para compartir es la misma
 * grilla dibujada en un PNG, para Instagram o el estado de WhatsApp.
 * Pantalla sobre /api/grilla, /api/actividades, /api/clases y /api/empleados.
 */

import { api } from "../core/api.js";
import { avisar, confirmar } from "../core/ui.js";
import { esAdmin, esc } from "../core/formato.js";
import { negocio } from "../core/negocio.js";
import { alEntrarEnVista } from "../core/registro.js";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
// Los mismos colores que styles.css (.color-*), para la imagen: sale siempre
// clara, como un afiche.
const COLORES = {
  azul: "#2F6FE4",
  naranja: "#E8730C",
  verde: "#16A34A",
  violeta: "#7C3AED",
  rojo: "#DC2626",
  amarillo: "#CA8A04",
  rosa: "#DB2777",
  gris: "#6B7280"
};
// Alto de una hora en la línea del día.
const PX_HORA = 64;

const grilla = document.getElementById("grilla");
const formClase = document.getElementById("formClase");
const formActividad = document.getElementById("formActividad");
const selectSucursal = document.getElementById("grillaSucursal");

let datos = { actividades: [], clases: [], profes: [], colores: [] };
let sucursales = [];
let sucursal = "";
// 0 = lunes, como el servidor.
let diaElegido = (new Date().getDay() + 6) % 7;
let editando = null;
let editandoActividad = null;
// La actividad elegida en la leyenda para ver solo sus clases, o null.
let filtro = null;

const minutos = (hora) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
// La actividad principal (da el color) y el nombre de la clase: el de una
// compartida junta los de todas, "Boxeo + MMA" (hist. §202).
const actividadDe = (clase) => datos.actividades.find((a) => a.id === clase.actividad_id && a.activo);
const nombreClase = (clase) =>
  clase.actividades
    .map((id) => datos.actividades.find((a) => a.id === id && a.activo)?.nombre)
    .filter(Boolean)
    .join(" + ");
const nombresProfes = (clase) => clase.profes.map((p) => p.nombre).join(", ");
const hoy = () => (new Date().getDay() + 6) % 7;

// Las de la sucursal elegida, más las que no son de ninguna.
// Las de la actividad elegida en la leyenda, si hay una.
const clasesVisibles = () =>
  datos.clases.filter(
    (c) =>
      actividadDe(c) &&
      (!sucursal || c.sucursal_id === null || c.sucursal_id === Number(sucursal)) &&
      (!filtro || c.actividades.includes(filtro))
  );

// De lunes a viernes siempre; el fin de semana, solo si tiene algo.
function diasAMostrar(clases) {
  return DIAS.map((_, dia) => dia).filter((dia) => dia < 5 || clases.some((c) => c.dia_semana === dia));
}

// La línea de horas: solo las horas enteras con alguna clase, cualquier día.
// Un hueco sin clases (de la mañana a la tarde) se achica a un corte de
// `pxCorte`, para no dejar media pantalla vacía. Devuelve la altura de cada
// minuto (y), el alto total, las horas a rotular y dónde va cada corte.
function escala(fijas, pxHora, pxCorte) {
  const tramos = [];
  const franjas = fijas
    .map((c) => [Math.floor(minutos(c.desde) / 60) * 60, Math.ceil(minutos(c.hasta) / 60) * 60])
    .sort((a, b) => a[0] - b[0]);
  for (const [desde, hasta] of franjas) {
    const ultimo = tramos.at(-1);
    if (ultimo && desde <= ultimo.hasta) ultimo.hasta = Math.max(ultimo.hasta, hasta);
    else tramos.push({ desde, hasta });
  }
  let alto = 0;
  const marcas = [];
  const cortes = [];
  for (const [i, t] of tramos.entries()) {
    if (i) {
      cortes.push(alto);
      alto += pxCorte;
    }
    t.y = alto;
    for (let m = t.desde; m <= t.hasta; m += 60) marcas.push({ y: alto + ((m - t.desde) / 60) * pxHora, texto: `${String(m / 60).padStart(2, "0")}:00` });
    alto += ((t.hasta - t.desde) / 60) * pxHora;
  }
  const y = (m) => {
    const t = tramos.find((x) => m >= x.desde && m <= x.hasta);
    return t ? t.y + ((m - t.desde) / 60) * pxHora : null;
  };
  return { y, alto, marcas, cortes };
}
const PX_CORTE = 28;

// "Lun a Vie 07:00 a 23:00 · Sáb 09:00 a 13:00": los días seguidos con la
// misma franja, juntos (como el horario de los empleados).
function resumenFranjas(clases) {
  const porDia = DIAS.map((_, dia) =>
    clases
      .filter((c) => c.dia_semana === dia)
      .map((c) => `${c.desde} a ${c.hasta}`)
      .join(" y ")
  );
  const grupos = [];
  porDia.forEach((texto, dia) => {
    if (!texto) return;
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.texto === texto && ultimo.hasta === dia - 1) ultimo.hasta = dia;
    else grupos.push({ texto, desde: dia, hasta: dia });
  });
  return grupos
    .map((g) => `${g.desde === g.hasta ? DIAS_CORTOS[g.desde] : `${DIAS_CORTOS[g.desde]} a ${DIAS_CORTOS[g.hasta]}`} ${g.texto}`)
    .join(" · ");
}

// Las clases de un día que se pisan van una al lado de la otra: cada una con
// su columna dentro del grupo que se superpone, y el ancho repartido.
function acomodar(clases) {
  const ordenadas = [...clases].sort((a, b) => a.desde.localeCompare(b.desde) || b.hasta.localeCompare(a.hasta));
  const acomodadas = [];
  let grupo = [];
  let finGrupo = "";
  const cerrarGrupo = () => {
    const columnas = Math.max(...grupo.map((g) => g.columna)) + 1;
    for (const g of grupo) acomodadas.push({ ...g, columnas });
    grupo = [];
  };
  for (const clase of ordenadas) {
    if (grupo.length && clase.desde >= finGrupo) cerrarGrupo();
    const ocupadas = new Set(grupo.filter((g) => g.clase.hasta > clase.desde).map((g) => g.columna));
    let columna = 0;
    while (ocupadas.has(columna)) columna++;
    grupo.push({ clase, columna });
    finGrupo = grupo.length === 1 || clase.hasta > finGrupo ? clase.hasta : finGrupo;
  }
  if (grupo.length) cerrarGrupo();
  return acomodadas;
}

/* ---------- La grilla ---------- */

// La leyenda filtra: tocar una actividad deja solo sus clases (las
// compartidas también); tocarla de nuevo, todas.
function pintarLeyenda() {
  if (filtro && !datos.actividades.some((a) => a.id === filtro && a.activo)) filtro = null;
  const leyenda = document.getElementById("grillaLeyenda");
  leyenda.classList.toggle("con-filtro", Boolean(filtro));
  leyenda.innerHTML = datos.actividades
    .filter((a) => a.activo)
    .map(
      (a) => `
      <li><button type="button" class="grilla-filtro" data-filtro="${a.id}" aria-pressed="${a.id === filtro}">
        <span class="grilla-punto color-${esc(a.color)}" aria-hidden="true"></span>${esc(a.nombre)}${a.horario === "libre" ? " <small>libre</small>" : ""}
      </button></li>`
    )
    .join("");
}

document.getElementById("grillaLeyenda").addEventListener("click", (e) => {
  const boton = e.target.closest("[data-filtro]");
  if (!boton) return;
  const id = Number(boton.dataset.filtro);
  filtro = filtro === id ? null : id;
  pintarGrilla();
});

function pintarDias(dias) {
  if (!dias.includes(diaElegido)) diaElegido = dias[0];
  document.getElementById("grillaDias").innerHTML = dias
    .map(
      (dia) =>
        `<button type="button" class="segmento" data-dia="${dia}" aria-pressed="${dia === diaElegido}">${esc(DIAS_CORTOS[dia])}${dia === hoy() ? '<span class="grilla-hoy-punto" aria-hidden="true"></span>' : ""}</button>`
    )
    .join("");
}

function vacio() {
  const admin = esAdmin();
  if (!datos.actividades.some((a) => a.activo)) {
    return `
      <div class="grilla-vacia">
        <p><strong>Todavía no hay clases.</strong></p>
        <p>${admin ? "Empezá por las actividades: lo que se hace en el gimnasio, como BJJ, Muay Thai o Musculación. Después les cargás los horarios y los profes." : "Cuando el administrador cargue las actividades y sus horarios, la grilla aparece acá."}</p>
        ${admin ? '<button type="button" class="btn btn-primary" data-ir="actividad">Cargar la primera actividad</button>' : ""}
      </div>`;
  }
  return `
    <div class="grilla-vacia">
      <p><strong>Las actividades están; faltan los horarios.</strong></p>
      <p>${admin ? "Cargá cuándo es cada clase y quién la da. Martes y jueves a las 19 se cargan de una vez." : "Cuando el administrador cargue los horarios, la grilla aparece acá."}</p>
      ${admin ? '<button type="button" class="btn btn-primary" data-ir="clase">Cargar el primer horario</button>' : ""}
    </div>`;
}

// Un horario en la línea del día. El admin lo toca para editarlo.
function bloque({ clase, columna, columnas }, y) {
  const actividad = actividadDe(clase);
  const nombre = nombreClase(clase);
  const top = y(minutos(clase.desde));
  const alto = Math.max(y(minutos(clase.hasta)) - top - 3, 22);
  const extra = [clase.detalle, clase.cupo ? `cupo ${clase.cupo}` : "", sucursal ? "" : clase.sucursal].filter(Boolean).join(" · ");
  const titulo = [nombre, `${clase.desde} a ${clase.hasta}`, nombresProfes(clase), extra].filter(Boolean).join(" · ");
  const etiqueta = esAdmin() ? "button" : "div";
  // Solo las líneas que entran enteras (de a unos 16 px): primero qué es y a
  // qué hora, después quién la da y el detalle. El resto está en el title.
  const lineas = [
    `<strong>${esc(nombre)}</strong>`,
    `<span class="grilla-clase-hora">${esc(clase.desde)}–${esc(clase.hasta)}</span>`,
    clase.profes.length ? `<span>${esc(nombresProfes(clase))}</span>` : "",
    extra ? `<span class="grilla-clase-extra">${esc(extra)}</span>` : ""
  ].filter(Boolean);
  const corta = alto < 52;
  const entran = corta ? 2 : Math.max(2, Math.floor((alto - 8) / 16));
  const contenido = lineas.slice(0, entran).join("");
  return `
    <${etiqueta} ${etiqueta === "button" ? 'type="button" ' : ""}class="grilla-clase color-${esc(actividad.color)}${corta ? " es-corta" : ""}" data-clase="${clase.id}"
      style="top:${top}px;height:${alto}px;left:calc(${(columna / columnas) * 100}% + 2px);width:calc(${100 / columnas}% - 4px)" title="${esc(titulo)}">
      ${contenido}
    </${etiqueta}>`;
}

function libre(clase) {
  const a = actividadDe(clase);
  const etiqueta = esAdmin() ? "button" : "div";
  const titulo = [a.nombre, `${clase.desde} a ${clase.hasta}`, nombresProfes(clase)].filter(Boolean).join(" · ");
  return `<${etiqueta} ${etiqueta === "button" ? 'type="button" ' : ""}class="grilla-libre color-${esc(a.color)}" data-clase="${clase.id}" title="${esc(titulo)}"><strong>${esc(a.nombre)}</strong><span>${esc(clase.desde)} a ${esc(clase.hasta)}</span></${etiqueta}>`;
}

// En el celular, las clases del día elegido van en una lista, con todo lo que
// en la línea de horas no entra: quién la da, el detalle y el cupo.
function pintarAgenda(fijas) {
  const delDia = fijas.filter((c) => c.dia_semana === diaElegido).sort((a, b) => a.desde.localeCompare(b.desde));
  const etiqueta = esAdmin() ? "button" : "div";
  document.getElementById("grillaAgenda").innerHTML = delDia.length
    ? delDia
        .map((c) => {
          const a = actividadDe(c);
          const nombre = nombreClase(c);
          const extra = [c.detalle, c.cupo ? `cupo ${c.cupo}` : "", sucursal ? "" : c.sucursal].filter(Boolean).join(" · ");
          return `
            <li>
              <${etiqueta} ${etiqueta === "button" ? 'type="button" ' : ""}class="grilla-agenda-clase color-${esc(a.color)}" data-clase="${c.id}">
                <span class="grilla-agenda-hora"><strong>${esc(c.desde)}</strong>${esc(c.hasta)}</span>
                <span class="grilla-agenda-que">
                  <strong>${esc(nombre)}</strong>
                  ${c.profes.length ? `<span>${esc(nombresProfes(c))}</span>` : ""}
                  ${extra ? `<span>${esc(extra)}</span>` : ""}
                </span>
              </${etiqueta}>
            </li>`;
        })
        .join("")
    : `<li class="grilla-sin-clases">Sin clases el ${esc(DIAS[diaElegido].toLowerCase())}.</li>`;
}

// La grilla es una sola tabla de CSS: una fila con los días, otra con las
// actividades libres y otra con la línea de horas. En el celular quedan solo
// las celdas del día elegido, sin la línea de horas: ahí va la agenda
// (styles.css).
function pintarGrilla() {
  pintarLeyenda();
  const visibles = clasesVisibles();
  const dias = diasAMostrar(visibles);
  pintarDias(dias);
  document.getElementById("grillaDias").hidden = !visibles.length;
  document.getElementById("grillaAgenda").hidden = !visibles.length;
  grilla.classList.toggle("sin-libres", !visibles.some((c) => actividadDe(c).horario === "libre"));
  if (!visibles.length && filtro) {
    grilla.innerHTML = `<div class="grilla-vacia"><p><strong>Esta actividad todavía no tiene horarios.</strong></p><p>Tocala de nuevo arriba para ver todas.</p></div>`;
    return;
  }
  if (!visibles.length) {
    grilla.innerHTML = vacio();
    return;
  }
  const fijas = visibles.filter((c) => actividadDe(c).horario === "fijo");
  const libres = visibles.filter((c) => actividadDe(c).horario === "libre");
  pintarAgenda(fijas);
  const { y, alto, marcas, cortes } = escala(fijas, PX_HORA, PX_CORTE);
  const ahora = new Date().getHours() * 60 + new Date().getMinutes();
  const celda = (dia, clase) =>
    `class="grilla-celda ${clase}${dia === diaElegido ? " is-elegido" : ""}${dia === hoy() ? " is-hoy" : ""}" data-dia="${dia}"`;

  const filas = [`<div class="grilla-esquina" aria-hidden="true"></div>`, ...dias.map((dia) => `<div ${celda(dia, "grilla-dia-nombre")}>${esc(DIAS[dia])}</div>`)];
  if (libres.length) {
    filas.push(
      `<div class="grilla-rotulo">Libre</div>`,
      ...dias.map((dia) => {
        const delDia = libres.filter((c) => c.dia_semana === dia).sort((a, b) => a.desde.localeCompare(b.desde));
        return `<div ${celda(dia, "grilla-abierto")}>${delDia.map(libre).join("") || '<span class="grilla-sin-clases">Cerrado</span>'}</div>`;
      })
    );
  }
  if (fijas.length) {
    const horas = marcas.map(({ y: arriba, texto }) => `<span style="top:${arriba}px">${esc(texto)}</span>`).join("");
    // Las rayas de cada hora y los cortes van dibujados en cada día: con los
    // cortes, las horas ya no están todas a la misma distancia.
    const fondo = [
      ...marcas.map(({ y: arriba }) => `<span class="grilla-raya" style="top:${arriba}px"></span>`),
      ...cortes.map((c) => `<span class="grilla-corte" style="top:${c}px;height:${PX_CORTE}px"></span>`)
    ].join("");
    const yAhora = y(ahora);
    filas.push(
      `<div class="grilla-horas" style="height:${alto}px" aria-hidden="true">${horas}</div>`,
      ...dias.map((dia) => {
        const delDia = acomodar(fijas.filter((c) => c.dia_semana === dia));
        const marcaAhora = dia === hoy() && yAhora !== null ? `<span class="grilla-ahora" style="top:${yAhora}px" aria-hidden="true"></span>` : "";
        const sinClases = delDia.length ? "" : '<span class="grilla-sin-clases">Sin clases</span>';
        return `<div ${celda(dia, "grilla-linea")} style="height:${alto}px"><span aria-hidden="true">${fondo}</span>${delDia.map((a) => bloque(a, y)).join("")}${marcaAhora}${sinClases}</div>`;
      })
    );
  }
  grilla.style.setProperty("--dias", dias.length);
  grilla.innerHTML = filas.join("");
}

async function cargar() {
  [datos, sucursales] = await Promise.all([
    api("/api/grilla", { error: "No se pudo cargar la grilla." }),
    api("/api/sucursales", { error: "No se pudieron cargar las sucursales." })
  ]);
  // Con una sola sucursal (o ninguna) no hay qué elegir.
  selectSucursal.hidden = sucursales.length < 2;
  selectSucursal.innerHTML =
    `<option value="">Todas las sucursales</option>` + sucursales.map((s) => `<option value="${s.id}">${esc(s.nombre)}</option>`).join("");
  if (!sucursales.some((s) => String(s.id) === sucursal)) sucursal = "";
  selectSucursal.value = sucursal;
  pintarGrilla();
  if (esAdmin()) pintarActividades();
}

selectSucursal.addEventListener("change", () => {
  sucursal = selectSucursal.value;
  pintarGrilla();
});

document.getElementById("grillaDias").addEventListener("click", (e) => {
  const boton = e.target.closest("[data-dia]");
  if (!boton) return;
  diaElegido = Number(boton.dataset.dia);
  pintarGrilla();
});

grilla.addEventListener("click", (e) => {
  const ir = e.target.closest("[data-ir]");
  if (ir?.dataset.ir === "actividad") abrirActividad();
  if (ir?.dataset.ir === "clase") abrirClase();
  editarTocado(e);
});

function editarTocado(e) {
  const clase = e.target.closest("button[data-clase]");
  if (clase) abrirClase(datos.clases.find((c) => c.id === Number(clase.dataset.clase)));
}

document.getElementById("grillaAgenda").addEventListener("click", editarTocado);

/* ---------- Cargar un horario (admin) ---------- */

function pintarProfes(elegidos) {
  document.getElementById("claseProfes").innerHTML = datos.profes.length
    ? datos.profes
        .map(
          (p) => `
          <label class="chip-elegir">
            <input type="checkbox" value="${p.id}" ${elegidos.has(p.id) ? "checked" : ""} />
            ${esc(p.nombre)}
          </label>`
        )
        .join("")
    : `<p class="campo-ayuda">Todavía no hay profes: escribí el nombre y tocá Sumar profe.</p>`;
}

const profesElegidos = () => new Set([...document.querySelectorAll("#claseProfes input:checked")].map((i) => Number(i.value)));

// Las actividades marcadas, en el orden de la lista: la primera es la
// principal (le da el color a la clase).
const actividadesElegidas = () => [...document.querySelectorAll("#claseActividades input:checked")].map((i) => Number(i.value));

function pintarActividadesDeClase(elegidas) {
  document.getElementById("claseActividades").innerHTML = datos.actividades
    .filter((a) => a.activo)
    .map(
      (a) => `
      <label class="chip-elegir">
        <input type="checkbox" value="${a.id}" ${elegidas.includes(a.id) ? "checked" : ""} />
        <span class="grilla-punto color-${esc(a.color)}" aria-hidden="true"></span>${esc(a.nombre)}${a.horario === "libre" ? " (libre)" : ""}
      </label>`
    )
    .join("");
}

// Una actividad libre no tiene clases sino una franja abierta, y sin cupo.
function segunActividad() {
  const actividad = datos.actividades.find((a) => a.id === actividadesElegidas()[0]);
  const esLibre = actividad?.horario === "libre";
  document.getElementById("claseDiasLeyenda").textContent = esLibre ? "Días que está abierta" : editando ? "Día" : "Días";
  document.getElementById("claseDesdeEtiqueta").textContent = esLibre ? "Abre" : "Empieza";
  document.getElementById("claseHastaEtiqueta").textContent = esLibre ? "Cierra" : "Termina";
  document.getElementById("claseCupoCampo").hidden = esLibre;
}

function abrirClase(clase = null) {
  const activas = datos.actividades.filter((a) => a.activo);
  if (!activas.length) {
    abrirActividad();
    avisar("Primero cargá una actividad.", "atencion");
    return;
  }
  formActividad.hidden = true;
  editando = clase;
  const form = formClase;
  form.reset();
  document.getElementById("claseFormTitulo").textContent = clase
    ? `${nombreClase(clase)}, el ${DIAS[clase.dia_semana].toLowerCase()} a las ${clase.desde}`
    : "Nuevo horario";
  // Al cargar, la actividad que se está mirando en la leyenda, si hay una.
  pintarActividadesDeClase(clase?.actividades ?? (filtro ? [filtro] : activas.length === 1 ? [activas[0].id] : []));
  // Al cargar, varios días de una vez; al editar, el día de ese horario.
  const tipo = clase ? "radio" : "checkbox";
  document.getElementById("claseDias").innerHTML = DIAS_CORTOS.map(
    (nombre, dia) => `
      <label class="chip-elegir">
        <input type="${tipo}" name="dia" value="${dia}" ${clase?.dia_semana === dia ? "checked" : ""} />
        ${esc(nombre)}
      </label>`
  ).join("");
  pintarProfes(new Set(clase?.profes.map((p) => p.id) ?? []));
  document.getElementById("claseSucursalCampo").hidden = sucursales.length < 2;
  form.sucursal_id.innerHTML = `<option value="">Todas</option>` + sucursales.map((s) => `<option value="${s.id}">${esc(s.nombre)}</option>`).join("");
  if (clase) {
    form.desde.value = clase.desde;
    form.hasta.value = clase.hasta;
    form.detalle.value = clase.detalle ?? "";
    form.cupo.value = clase.cupo ?? "";
    form.sucursal_id.value = clase.sucursal_id ?? "";
  } else {
    form.sucursal_id.value = sucursal;
  }
  document.getElementById("btnClaseSacar").hidden = !clase;
  segunActividad();
  form.hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "nearest" });
  document.querySelector("#claseActividades input")?.focus({ preventScroll: true });
}

document.getElementById("btnClaseNueva").addEventListener("click", () => abrirClase());
document.getElementById("claseActividades").addEventListener("change", segunActividad);
document.getElementById("btnClaseCancelar").addEventListener("click", () => {
  formClase.hidden = true;
});

// Un profe nuevo es un empleado más: nace acá, sin PIN.
async function sumarProfe() {
  const campo = document.getElementById("claseProfeNombre");
  const nombre = campo.value.trim();
  if (!nombre) {
    avisar("Escribí el nombre del profe.", "atencion");
    campo.focus();
    return;
  }
  const boton = document.getElementById("btnClaseProfeSumar");
  boton.disabled = true;
  try {
    const profe = await api("/api/empleados", { method: "POST", body: { nombre }, error: "No se pudo sumar el profe." });
    const elegidos = profesElegidos();
    elegidos.add(profe.id);
    datos.profes = [...datos.profes, { id: profe.id, nombre: profe.nombre }].sort((a, b) => a.nombre.localeCompare(b.nombre));
    pintarProfes(elegidos);
    campo.value = "";
    avisar(`${profe.nombre} ya es parte del equipo.`, "ok");
  } finally {
    boton.disabled = false;
  }
}

document.getElementById("btnClaseProfeSumar").addEventListener("click", sumarProfe);
document.getElementById("claseProfeNombre").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  sumarProfe();
});

formClase.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = formClase;
  const actividades = actividadesElegidas();
  if (!actividades.length) {
    avisar("Elegí la actividad.", "atencion");
    return;
  }
  const dias = [...form.querySelectorAll("#claseDias input:checked")].map((i) => Number(i.value));
  if (!dias.length) {
    avisar("Elegí el día.", "atencion");
    return;
  }
  if (!form.desde.value || !form.hasta.value) {
    avisar("Falta la hora en que empieza o la que termina.", "atencion");
    return;
  }
  if (form.hasta.value <= form.desde.value) {
    avisar("La hora en que termina va después de la de inicio.", "atencion");
    return;
  }
  const body = {
    actividades,
    ...(editando ? { dia_semana: dias[0] } : { dias }),
    desde: form.desde.value,
    hasta: form.hasta.value,
    detalle: form.detalle.value,
    cupo: form.cupo.value,
    sucursal_id: form.sucursal_id.value || null,
    profes: [...profesElegidos()]
  };
  const boton = document.getElementById("formClaseSubmit");
  boton.disabled = true;
  try {
    await api(editando ? `/api/clases/${editando.id}` : "/api/clases", {
      method: editando ? "PATCH" : "POST",
      body,
      error: "No se pudo guardar el horario."
    });
  } finally {
    boton.disabled = false;
  }
  avisar(editando ? "Horario guardado." : dias.length > 1 ? `${dias.length} horarios cargados.` : "Horario cargado.", "ok");
  form.hidden = true;
  diaElegido = dias[0];
  await cargar();
});

document.getElementById("btnClaseSacar").addEventListener("click", async () => {
  const clase = editando;
  const ok = await confirmar({
    titulo: "¿Sacar este horario de la grilla?",
    cuerpo: `${nombreClase(clase)}, el ${DIAS[clase.dia_semana].toLowerCase()} de ${clase.desde} a ${clase.hasta}. Los otros días de esa actividad quedan.`,
    aceptar: "Sacar",
    destructivo: true
  });
  if (!ok) return;
  await api(`/api/clases/${clase.id}`, { method: "PATCH", body: { activo: false }, error: "No se pudo sacar el horario." });
  avisar("Horario sacado de la grilla.", "ok");
  formClase.hidden = true;
  await cargar();
});

/* ---------- Las actividades (admin) ---------- */

function pintarActividades() {
  const lista = document.getElementById("actividadesLista");
  if (!datos.actividades.length) {
    lista.innerHTML = `<li class="nota-plana">Todavía no hay actividades.</li>`;
    return;
  }
  lista.innerHTML = datos.actividades
    .map((a) => {
      const suyas = datos.clases.filter((c) => c.actividades.includes(a.id));
      const cuando =
        a.horario === "libre"
          ? suyas.length
            ? `Abierta ${resumenFranjas(suyas)}`
            : "Libre, sin franja cargada"
          : `${suyas.length} ${suyas.length === 1 ? "clase por semana" : "clases por semana"}`;
      const boton = a.activo
        ? `<button type="button" class="btn btn-secundario btn-chico" data-actividad="${a.id}">Editar</button>`
        : `<button type="button" class="btn btn-secundario btn-chico" data-alta="${a.id}">Darla de alta</button>`;
      return `
        <li class="${a.activo ? "" : "es-baja"}">
          <span class="grilla-punto color-${esc(a.color)}" aria-hidden="true"></span>
          <span class="actividad-quien">${esc(a.nombre)}<small>${esc(a.activo ? cuando : "Dada de baja")}</small></span>
          ${boton}
        </li>`;
    })
    .join("");
}

document.getElementById("actividadesLista").addEventListener("click", async (e) => {
  const editar = e.target.closest("[data-actividad]");
  const alta = e.target.closest("[data-alta]");
  if (editar) abrirActividad(datos.actividades.find((a) => a.id === Number(editar.dataset.actividad)));
  if (alta) {
    const actividad = datos.actividades.find((a) => a.id === Number(alta.dataset.alta));
    await api(`/api/actividades/${actividad.id}`, { method: "PATCH", body: { activo: true }, error: "No se pudo dar de alta." });
    avisar(`${actividad.nombre} volvió a la grilla, con sus horarios.`, "ok");
    await cargar();
  }
});

function abrirActividad(actividad = null) {
  formClase.hidden = true;
  editandoActividad = actividad;
  const form = formActividad;
  form.reset();
  document.getElementById("actividadFormTitulo").textContent = actividad ? `Editar ${actividad.nombre}` : "Nueva actividad";
  // El primer color sin usar, para que dos actividades no se confundan.
  const usados = new Set(datos.actividades.filter((a) => a.activo).map((a) => a.color));
  const color = actividad?.color ?? datos.colores.find((c) => !usados.has(c)) ?? datos.colores[0];
  document.getElementById("actividadColores").innerHTML = datos.colores
    .map(
      (c) => `
      <label class="color-elegir color-${esc(c)}" title="${esc(c)}">
        <input type="radio" name="color" value="${esc(c)}" aria-label="${esc(c)}" ${c === color ? "checked" : ""} />
      </label>`
    )
    .join("");
  if (actividad) {
    form.nombre.value = actividad.nombre;
    form.horario.value = actividad.horario;
  }
  document.getElementById("btnActividadBaja").hidden = !actividad;
  form.hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "nearest" });
  form.nombre.focus({ preventScroll: true });
}

document.getElementById("btnActividadNueva").addEventListener("click", () => abrirActividad());
document.getElementById("btnActividadCancelar").addEventListener("click", () => {
  formActividad.hidden = true;
});

formActividad.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = formActividad;
  const nombre = form.nombre.value.trim();
  if (!nombre) {
    avisar("Escribí el nombre de la actividad.", "atencion");
    form.nombre.focus();
    return;
  }
  const body = { nombre, horario: form.horario.value, color: form.color.value };
  const boton = document.getElementById("formActividadSubmit");
  boton.disabled = true;
  let guardada;
  try {
    guardada = await api(editandoActividad ? `/api/actividades/${editandoActividad.id}` : "/api/actividades", {
      method: editandoActividad ? "PATCH" : "POST",
      body,
      error: "No se pudo guardar la actividad."
    });
  } finally {
    boton.disabled = false;
  }
  const nueva = !editandoActividad;
  form.hidden = true;
  await cargar();
  if (nueva) {
    // Lo que sigue es cargarle los horarios: el formulario ya la trae elegida.
    abrirClase();
    pintarActividadesDeClase([guardada.id]);
    segunActividad();
    avisar(`${guardada.nombre} creada. Ahora cargale los horarios.`, "ok");
  } else {
    avisar(`${guardada.nombre}: guardada.`, "ok");
  }
});

document.getElementById("btnActividadBaja").addEventListener("click", async () => {
  const actividad = editandoActividad;
  const ok = await confirmar({
    titulo: `¿Dar de baja ${actividad.nombre}?`,
    cuerpo: "Sale de la grilla con todos sus horarios. Si la volvés a dar de alta, vuelven con ella.",
    aceptar: "Dar de baja",
    destructivo: true
  });
  if (!ok) return;
  await api(`/api/actividades/${actividad.id}`, { method: "PATCH", body: { activo: false }, error: "No se pudo dar de baja." });
  avisar(`${actividad.nombre} quedó dada de baja.`, "ok");
  formActividad.hidden = true;
  await cargar();
});

/* ---------- La imagen para compartir ---------- */

// Corta el texto con "…" para que entre en el ancho.
function recortar(ctx, texto, ancho) {
  if (ctx.measureText(texto).width <= ancho) return texto;
  let corto = texto;
  while (corto.length > 1 && ctx.measureText(`${corto}…`).width > ancho) corto = corto.slice(0, -1);
  return `${corto}…`;
}

function rectRedondeado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, h / 2));
}

// La semana en un PNG de 1080 de ancho (el de Instagram), clara siempre.
function dibujarImagen() {
  const visibles = clasesVisibles();
  const fijas = visibles.filter((c) => actividadDe(c).horario === "fijo");
  const libres = visibles.filter((c) => actividadDe(c).horario === "libre");
  const dias = diasAMostrar(visibles);
  const ANCHO = 1080;
  const MARGEN = 48;
  const COL_HORAS = 64;
  const actividadesLibres = datos.actividades.filter((a) => a.activo && libres.some((c) => c.actividad_id === a.id));
  const yGrilla = 210 + (actividadesLibres.length ? 24 + actividadesLibres.length * 40 : 0);
  const y0 = yGrilla + 56;
  // La hora tan alta como haga falta para llenar el 4:5 de Instagram (1350),
  // entre 92 y 150 px: pocas horas no quedan flotando, muchas no se aprietan.
  const CORTE = 36;
  const horas = escala(fijas, 1, 0);
  const HORA = Math.min(150, Math.max(92, (1350 - y0 - 90 - horas.cortes.length * CORTE) / Math.max(horas.alto, 1)));
  const linea = escala(fijas, HORA, CORTE);
  const alto = Math.max(1350, y0 + linea.alto + 90);

  const canvas = document.createElement("canvas");
  canvas.width = ANCHO;
  canvas.height = alto;
  const ctx = canvas.getContext("2d");
  const fuente = (peso, tam) => `${peso} ${tam}px Inter, "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, ANCHO, alto);

  // El encabezado: el negocio y la sucursal.
  ctx.fillStyle = "#0A0A0A";
  ctx.font = fuente(800, 56);
  ctx.fillText(recortar(ctx, negocio.nombre || "Grilla de clases", ANCHO - MARGEN * 2), MARGEN, 110);
  const nombreSucursal = sucursales.find((s) => String(s.id) === sucursal)?.nombre;
  ctx.fillStyle = "#6B6B6B";
  ctx.font = fuente(500, 30);
  // Filtrada, es la grilla de esa actividad ("Grilla de BJJ").
  const nombreFiltro = datos.actividades.find((a) => a.id === filtro)?.nombre;
  const subtitulo = [nombreFiltro ? `Grilla de ${nombreFiltro}` : "Grilla de clases", nombreSucursal].filter(Boolean).join(" · ");
  ctx.fillText(subtitulo, MARGEN, 158);

  // Las de horario libre, con su franja.
  let y = 210;
  for (const a of actividadesLibres) {
    ctx.fillStyle = COLORES[a.color];
    rectRedondeado(ctx, MARGEN, y + 6, 18, 18, 5);
    ctx.fill();
    ctx.fillStyle = "#0A0A0A";
    ctx.font = fuente(700, 26);
    ctx.fillText(a.nombre, MARGEN + 30, y + 24);
    const ancho = ctx.measureText(a.nombre).width;
    ctx.fillStyle = "#4A4A4A";
    ctx.font = fuente(500, 24);
    const franjas = resumenFranjas(libres.filter((c) => c.actividad_id === a.id));
    ctx.fillText(recortar(ctx, franjas, ANCHO - MARGEN * 2 - ancho - 48), MARGEN + 46 + ancho, y + 24);
    y += 40;
  }

  // Los días.
  const anchoDia = (ANCHO - MARGEN * 2 - COL_HORAS) / dias.length;
  const xDia = (i) => MARGEN + COL_HORAS + i * anchoDia;
  ctx.font = fuente(700, 24);
  ctx.fillStyle = "#0A0A0A";
  ctx.textAlign = "center";
  dias.forEach((dia, i) => ctx.fillText(DIAS_CORTOS[dia].toUpperCase(), xDia(i) + anchoDia / 2, yGrilla + 30));
  ctx.textAlign = "left";

  // Las horas, con su raya, y los huecos sin clases achicados a un corte.
  ctx.font = fuente(500, 20);
  for (const m of linea.marcas) {
    ctx.fillStyle = "#8A8A8A";
    ctx.fillText(m.texto, MARGEN, y0 + m.y + 7);
    ctx.fillStyle = "#E5E5E5";
    ctx.fillRect(MARGEN + COL_HORAS, y0 + m.y, ANCHO - MARGEN * 2 - COL_HORAS, 1);
  }
  for (const c of linea.cortes) {
    ctx.fillStyle = "#F4F4F5";
    ctx.fillRect(MARGEN + COL_HORAS, y0 + c + 6, ANCHO - MARGEN * 2 - COL_HORAS, CORTE - 12);
  }

  // Las clases, en su color.
  dias.forEach((dia, i) => {
    for (const { clase, columna, columnas } of acomodar(fijas.filter((c) => c.dia_semana === dia))) {
      const a = actividadDe(clase);
      const nombre = nombreClase(clase);
      const w = anchoDia / columnas - 6;
      const x = xDia(i) + (anchoDia / columnas) * columna + 3;
      const top = y0 + linea.y(minutos(clase.desde)) + 2;
      const h = Math.max(linea.y(minutos(clase.hasta)) - linea.y(minutos(clase.desde)) - 4, 30);
      // En una columna angosta (dos clases a la vez), la letra más chica.
      const chica = w < 130;
      ctx.fillStyle = COLORES[a.color];
      rectRedondeado(ctx, x, top, w, h, 10);
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = "#FFFFFF";
      const lineas = [
        [fuente(800, chica ? 18 : 22), nombre],
        [fuente(600, chica ? 15 : 19), `${clase.desde}–${clase.hasta}`],
        [fuente(500, chica ? 15 : 18), nombresProfes(clase)],
        [fuente(500, chica ? 14 : 17), clase.detalle ?? ""]
      ].filter(([, texto]) => texto);
      const paso = chica ? 19 : 23;
      let yy = top + (chica ? 22 : 27);
      for (const [f, texto] of lineas) {
        if (yy > top + h - 6) break;
        ctx.font = f;
        ctx.fillText(recortar(ctx, texto, w - (chica ? 10 : 16)), x + (chica ? 6 : 8), yy);
        yy += paso;
      }
      ctx.restore();
    }
  });

  ctx.fillStyle = "#A3A3A3";
  ctx.font = fuente(500, 20);
  ctx.textAlign = "right";
  ctx.fillText("Hecha con Nexo", ANCHO - MARGEN, alto - 36);
  return canvas;
}

// En el celular se comparte directo (WhatsApp, Instagram); en la compu se baja.
document.getElementById("btnGrillaImagen").addEventListener("click", async () => {
  if (!clasesVisibles().length) {
    avisar("Todavía no hay horarios para mostrar.", "atencion");
    return;
  }
  await document.fonts?.ready;
  const blob = await new Promise((resolve) => dibujarImagen().toBlob(resolve, "image/png"));
  const archivo = new File([blob], "grilla-de-clases.png", { type: "image/png" });
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: "Grilla de clases" });
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(blob);
  enlace.download = archivo.name;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
  avisar("Imagen descargada.", "ok");
});

alEntrarEnVista("clases", async () => {
  formClase.hidden = true;
  formActividad.hidden = true;
  await cargar();
});
