/**
 * dominios/clases.js
 * La grilla de clases del gimnasio (hist. §200): las actividades, sus horarios
 * en la semana y los profes de cada uno. La ven todos (la recepción la
 * consulta) y la arma el admin. En el celular se ve de a un día; en la compu,
 * la semana entera, con las clases que coinciden una al lado de la otra. Las
 * actividades de horario libre (Musculación, abierta de 7 a 23) van arriba de
 * cada día, no en la línea de horas. La imagen para compartir es la misma
 * grilla dibujada en un PNG, para Instagram o el estado de WhatsApp.
 * Tocar una clase de horario fijo abre esa clase en un día (hist. §226): quién
 * la dio de verdad (el suplente), si se dio y la lista de los que vinieron,
 * con los que entraron ese día y los que suelen venir a mano. "Clases dadas"
 * junta lo anotado, por profe.
 * Pantalla sobre /api/grilla, /api/actividades, /api/clases, /api/empleados,
 * /api/clases/:id/fechas/:fecha, /api/asistencia y /api/socios.
 */

import { api } from "../core/api.js";
import { avisar, confirmar } from "../core/ui.js";
import { badge, esAdmin, esc } from "../core/formato.js";
import { negocio } from "../core/negocio.js";
import { temaActual } from "../core/tema.js";
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
const formActividad = document.getElementById("formActividadGrilla");
const selectSucursal = document.getElementById("grillaSucursal");

let datos = { actividades: [], clases: [], profes: [], colores: [], semana: { hoy: "", lunes: "", anotadas: [] } };
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

// Fechas AAAA-MM-DD, sin la hora: el día del negocio lo da el servidor.
const sumarDias = (fecha, n) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const fechaLarga = (fecha) =>
  new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-AR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
// La fecha de esta semana de un horario, y lo que se anotó de él.
const fechaEstaSemana = (clase) => sumarDias(datos.semana.lunes, clase.dia_semana);
const anotadaEstaSemana = (clase) => datos.semana.anotadas.find((a) => a.clase_id === clase.id && a.fecha === fechaEstaSemana(clase));
const esFija = (clase) => actividadDe(clase)?.horario === "fijo";

// Lo anotado de esta semana, en una línea: "12 vinieron · suplente".
function textoAnotada(clase) {
  const a = anotadaEstaSemana(clase);
  if (!a) return "";
  if (a.estado === "suspendida") return "No se dio";
  return [a.asistentes ? `${a.asistentes} ${a.asistentes === 1 ? "vino" : "vinieron"}` : "", a.con_suplente ? "suplente" : ""].filter(Boolean).join(" · ");
}

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

// Un horario en la línea del día. Se toca para abrir la clase de esta semana
// (quién la dio y quién vino).
function bloque({ clase, columna, columnas }, y) {
  const actividad = actividadDe(clase);
  const nombre = nombreClase(clase);
  const top = y(minutos(clase.desde));
  const alto = Math.max(y(minutos(clase.hasta)) - top - 3, 22);
  const extra = [clase.detalle, clase.cupo ? `cupo ${clase.cupo}` : "", sucursal ? "" : clase.sucursal].filter(Boolean).join(" · ");
  const anotada = textoAnotada(clase);
  const titulo = [nombre, `${clase.desde} a ${clase.hasta}`, nombresProfes(clase), extra, anotada].filter(Boolean).join(" · ");
  // Solo las líneas que entran enteras (de a unos 16 px): primero qué es y a
  // qué hora, después lo anotado esta semana, quién la da y el detalle. El
  // resto está en el title.
  const lineas = [
    `<strong>${esc(nombre)}</strong>`,
    `<span class="grilla-clase-hora">${esc(clase.desde)}–${esc(clase.hasta)}</span>`,
    anotada ? `<span class="grilla-clase-anotada">${esc(anotada)}</span>` : "",
    clase.profes.length ? `<span>${esc(nombresProfes(clase))}</span>` : "",
    extra ? `<span class="grilla-clase-extra">${esc(extra)}</span>` : ""
  ].filter(Boolean);
  const corta = alto < 52;
  const entran = corta ? 2 : Math.max(2, Math.floor((alto - 8) / 16));
  const contenido = lineas.slice(0, entran).join("");
  const suspendida = anotadaEstaSemana(clase)?.estado === "suspendida";
  return `
    <button type="button" class="grilla-clase color-${esc(actividad.color)}${corta ? " es-corta" : ""}${suspendida ? " es-suspendida" : ""}" data-clase="${clase.id}"
      style="top:${top}px;height:${alto}px;left:calc(${(columna / columnas) * 100}% + 2px);width:calc(${100 / columnas}% - 4px)" title="${esc(titulo)}">
      ${contenido}
    </button>`;
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
  document.getElementById("grillaAgenda").innerHTML = delDia.length
    ? delDia
        .map((c) => {
          const a = actividadDe(c);
          const nombre = nombreClase(c);
          const extra = [c.detalle, c.cupo ? `cupo ${c.cupo}` : "", sucursal ? "" : c.sucursal].filter(Boolean).join(" · ");
          const anotada = textoAnotada(c);
          return `
            <li>
              <button type="button" class="grilla-agenda-clase color-${esc(a.color)}" data-clase="${c.id}">
                <span class="grilla-agenda-hora"><strong>${esc(c.desde)}</strong>${esc(c.hasta)}</span>
                <span class="grilla-agenda-que">
                  <strong>${esc(nombre)}</strong>
                  ${c.profes.length ? `<span>${esc(nombresProfes(c))}</span>` : ""}
                  ${extra ? `<span>${esc(extra)}</span>` : ""}
                  ${anotada ? `<span class="grilla-clase-anotada">${esc(anotada)}</span>` : ""}
                </span>
              </button>
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
  pintarFiltrosHistorial();
  await cargarHistorial();
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

// Una clase de horario fijo se abre en su día (la lista); una franja libre,
// para editarla (solo el admin la tiene como botón).
function editarTocado(e) {
  const boton = e.target.closest("button[data-clase]");
  if (!boton) return;
  const clase = datos.clases.find((c) => c.id === Number(boton.dataset.clase));
  if (!clase) return;
  if (esFija(clase)) abrirDia(clase, fechaEstaSemana(clase));
  else abrirClase(clase);
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
  panelDia.hidden = true;
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

/* ---------- La clase de un día (hist. §226) ---------- */

const panelDia = document.getElementById("claseDia");
// La clase abierta: el horario, la fecha y lo que dijo el servidor.
let abierta = null;
// Los socios, para buscar a quién anotar y mostrar si debe. Se piden al abrir
// la primera clase.
let socios = null;
const MAX_ENCONTRADOS = 8;

const normalizar = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
const socioDe = (id) => socios?.find((s) => s.id === id);
const marcaSituacion = (id) => {
  const s = socioDe(id);
  if (s?.situacion === "debe") return badge("status-vencido", "Debe").html;
  if (s?.situacion === "baja") return badge("", "De baja").html;
  return "";
};
const limiteAtras = () => sumarDias(datos.semana.hoy, -364);
const limiteAdelante = () => sumarDias(datos.semana.hoy, 14);

async function abrirDia(clase, fecha) {
  formClase.hidden = true;
  formActividad.hidden = true;
  const [detalle] = await Promise.all([
    api(`/api/clases/${clase.id}/fechas/${fecha}`, { error: "No se pudo abrir la clase." }),
    socios ? null : api("/api/socios", { error: "No se pudieron cargar los socios." }).then((lista) => (socios = lista))
  ]);
  abierta = { clase, fecha, detalle };
  document.getElementById("claseDiaBuscar").value = "";
  pintarDia();
  panelDia.hidden = false;
  panelDia.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function pintarDia() {
  const { clase, fecha, detalle } = abierta;
  const esHoy = fecha === datos.semana.hoy;
  document.getElementById("claseDiaTitulo").textContent = nombreClase(clase) || detalle.actividad;
  document.getElementById("claseDiaHorario").textContent = `Los ${DIAS[clase.dia_semana].toLowerCase()} de ${clase.desde} a ${clase.hasta}${clase.detalle ? ` · ${clase.detalle}` : ""}`;
  document.getElementById("claseDiaFecha").textContent = `${fechaLarga(fecha)}${esHoy ? " · hoy" : ""}`;
  document.getElementById("btnClaseDiaAntes").disabled = sumarDias(fecha, -7) < limiteAtras();
  document.getElementById("btnClaseDiaDespues").disabled = sumarDias(fecha, 7) > limiteAdelante();

  // Los profes del negocio, más los de ese día que ya no están (uno dado de baja).
  const elegidos = new Set(detalle.profes.map((p) => p.id));
  const deGrilla = new Set(detalle.profes_grilla.map((p) => p.id));
  const todos = [...datos.profes, ...detalle.profes.filter((p) => !datos.profes.some((x) => x.id === p.id))];
  document.getElementById("claseDiaProfes").innerHTML = todos.length
    ? todos
        .map(
          (p) => `
          <label class="chip-elegir">
            <input type="checkbox" value="${p.id}" ${elegidos.has(p.id) ? "checked" : ""} />
            ${esc(p.nombre)}${elegidos.has(p.id) && !deGrilla.has(p.id) ? " <small>suplente</small>" : ""}
          </label>`
        )
        .join("")
    : `<p class="campo-ayuda">Todavía no hay profes: sumalos en Empleados o al cargar el horario.</p>`;
  document.getElementById("claseDiaSuspendida").checked = detalle.estado === "suspendida";
  document.getElementById("claseDiaNota").value = detalle.nota ?? "";

  // La lista: de hoy para atrás, y si la clase se dio.
  const futura = fecha > datos.semana.hoy;
  const suspendida = detalle.estado === "suspendida";
  document.getElementById("claseDiaLista").hidden = futura || suspendida;
  const aviso = document.getElementById("claseDiaFutura");
  aviso.hidden = !futura && !suspendida;
  aviso.textContent = suspendida
    ? "Esta clase no se dio: para tomar la lista, destildá «No se dio» y guardá."
    : "La lista se toma el día de la clase. Para adelante se puede anotar quién la va a dar o que no se da.";
  if (futura || suspendida) return;

  const n = detalle.asistentes.length;
  document.getElementById("claseDiaVinieron").textContent = n ? `Vinieron ${n}` : "Todavía no se anotó a nadie";
  document.getElementById("claseDiaAsistentes").innerHTML = detalle.asistentes
    .map(
      (a) => `
      <li>
        <span class="clase-dia-quien"><strong>${esc(a.nombre)}</strong> <small>N° ${esc(a.numero)}</small> ${marcaSituacion(a.socio_id)}</span>
        <button type="button" class="btn-icon" data-sacar="${a.socio_id}" aria-label="Sacar a ${esc(a.nombre)} de la lista" title="Sacar de la lista"><svg class="ico" aria-hidden="true"><use href="/img/iconos.svg#x"></use></svg></button>
      </li>`
    )
    .join("");
  const chips = (lista) =>
    lista
      .map((s) => `<button type="button" class="chip-sumar" data-anotar="${s.socio_id}"><svg class="ico" aria-hidden="true"><use href="/img/iconos.svg#plus"></use></svg>${esc(s.nombre)}</button>`)
      .join("");
  const { entraron, suelen_venir: suelen } = detalle;
  const chipsEntraron = chips(entraron);
  const chipsSuelen = chips(suelen);
  const botonTodos = entraron.length > 1 ? `<button type="button" class="btn btn-secundario btn-chico" data-anotar-todos>Anotar a los ${esc(entraron.length)}</button>` : "";
  document.getElementById("claseDiaEntraron").innerHTML = entraron.length
    ? `<p class="campo-ayuda">${esHoy ? "Entraron hoy" : "Entraron ese día"}</p><div class="clase-dia-chips">${chipsEntraron}${botonTodos}</div>`
    : "";
  document.getElementById("claseDiaSuelen").innerHTML = suelen.length
    ? `<p class="campo-ayuda">Suelen venir a esta clase</p><div class="clase-dia-chips">${chipsSuelen}</div>`
    : "";
  pintarEncontrados();
}

// Lo que se busca, entre los socios que todavía no están en la lista.
function pintarEncontrados() {
  const lista = document.getElementById("claseDiaEncontrados");
  const texto = normalizar(document.getElementById("claseDiaBuscar").value);
  if (!texto || !abierta) {
    lista.innerHTML = "";
    return;
  }
  const vinieron = new Set(abierta.detalle.asistentes.map((a) => a.socio_id));
  const digitos = texto.replace(/\D/g, "");
  const encontrados = (socios ?? [])
    .filter((s) => !vinieron.has(s.id))
    .filter(
      (s) =>
        normalizar(s.nombre).includes(texto) ||
        (digitos && (String(s.numero) === digitos || String(s.documento ?? "").replace(/\D/g, "").includes(digitos)))
    )
    .slice(0, MAX_ENCONTRADOS);
  lista.innerHTML = encontrados.length
    ? encontrados
        .map(
          (s) => `
          <li>
            <button type="button" class="clase-dia-encontrado" data-anotar="${s.id}">
              <span><strong>${esc(s.nombre)}</strong> <small>N° ${esc(s.numero)}</small> ${marcaSituacion(s.id)}</span>
              <span class="clase-dia-anotar"><svg class="ico" aria-hidden="true"><use href="/img/iconos.svg#plus"></use></svg> Anotar</span>
            </button>
          </li>`
        )
        .join("")
    : `<li class="campo-ayuda">No hay ningún socio con «${esc(document.getElementById("claseDiaBuscar").value.trim())}».</li>`;
}

async function anotar(ids) {
  const { clase, fecha } = abierta;
  abierta.detalle = await api(`/api/clases/${clase.id}/fechas/${fecha}/asistencias`, {
    method: "POST",
    body: { socios: ids },
    error: "No se pudo anotar."
  });
  pintarDia();
  recargarSemana();
}

panelDia.addEventListener("click", async (e) => {
  const anotarUno = e.target.closest("[data-anotar]");
  const todos = e.target.closest("[data-anotar-todos]");
  const sacar = e.target.closest("[data-sacar]");
  if (anotarUno) {
    await anotar([Number(anotarUno.dataset.anotar)]);
    const buscar = document.getElementById("claseDiaBuscar");
    if (buscar.value) {
      buscar.value = "";
      pintarEncontrados();
      buscar.focus();
    }
  } else if (todos) {
    await anotar(abierta.detalle.entraron.map((s) => s.socio_id));
  } else if (sacar) {
    const { clase, fecha } = abierta;
    abierta.detalle = await api(`/api/clases/${clase.id}/fechas/${fecha}/asistencias/${sacar.dataset.sacar}`, {
      method: "DELETE",
      error: "No se pudo sacar de la lista."
    });
    pintarDia();
    recargarSemana();
  }
});

document.getElementById("claseDiaBuscar").addEventListener("input", pintarEncontrados);
// Con Enter se anota al primero que aparece (el lector de carnets tipea el número y Enter).
document.getElementById("claseDiaBuscar").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  document.querySelector("#claseDiaEncontrados [data-anotar]")?.click();
});

document.getElementById("btnClaseDiaGuardar").addEventListener("click", async () => {
  const { clase, fecha } = abierta;
  const boton = document.getElementById("btnClaseDiaGuardar");
  boton.disabled = true;
  try {
    abierta.detalle = await api(`/api/clases/${clase.id}/fechas/${fecha}`, {
      method: "PUT",
      body: {
        profes: [...document.querySelectorAll("#claseDiaProfes input:checked")].map((i) => Number(i.value)),
        estado: document.getElementById("claseDiaSuspendida").checked ? "suspendida" : "dada",
        nota: document.getElementById("claseDiaNota").value
      },
      error: "No se pudo guardar."
    });
  } finally {
    boton.disabled = false;
  }
  const suplentes = abierta.detalle.profes.filter((p) => p.suplente);
  avisar(
    abierta.detalle.estado === "suspendida"
      ? "Anotado: esa clase no se dio."
      : suplentes.length
        ? `Anotado: la dio ${suplentes.map((p) => p.nombre).join(" y ")} de suplente.`
        : "Guardado.",
    "ok"
  );
  pintarDia();
  recargarSemana();
});

for (const [id, pasos] of [
  ["btnClaseDiaAntes", -7],
  ["btnClaseDiaDespues", 7]
]) {
  document.getElementById(id).addEventListener("click", () => abrirDia(abierta.clase, sumarDias(abierta.fecha, pasos)));
}

document.getElementById("btnClaseDiaEditar").addEventListener("click", () => abrirClase(abierta.clase));
document.getElementById("btnClaseDiaCerrar").addEventListener("click", () => {
  panelDia.hidden = true;
  abierta = null;
});

// Lo anotado cambia la grilla (cuántos vinieron) y las clases dadas, sin
// cerrar lo que está abierto.
async function recargarSemana() {
  const nuevos = await api("/api/grilla", { error: "No se pudo actualizar la grilla." });
  datos = nuevos;
  pintarGrilla();
  cargarHistorial();
}

/* ---------- Clases dadas (hist. §226) ---------- */

const selectProfe = document.getElementById("asistenciaProfe");
const selectPeriodo = document.getElementById("asistenciaPeriodo");
let historial = null;

function pintarFiltrosHistorial() {
  const elegido = selectProfe.value;
  selectProfe.innerHTML = `<option value="">Todos los profes</option>` + datos.profes.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join("");
  if (datos.profes.some((p) => String(p.id) === elegido)) selectProfe.value = elegido;
  selectProfe.hidden = !datos.profes.length;
}

async function cargarHistorial() {
  if (!datos.semana.hoy) return;
  const params = new URLSearchParams({ desde: sumarDias(datos.semana.hoy, -(Number(selectPeriodo.value) - 1)), hasta: datos.semana.hoy });
  if (selectProfe.value) params.set("profe", selectProfe.value);
  historial = await api(`/api/asistencia?${params}`, { error: "No se pudieron cargar las clases dadas." });
  pintarHistorial();
}

function pintarHistorial() {
  const { clases, total, por_profe: porProfe } = historial;
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  document.getElementById("asistenciaResumen").innerHTML = clases.length
    ? `
      <div class="ledger-strip">
        <div class="ledger-item"><span class="ledger-label">Clases dadas</span><span class="ledger-value mono">${esc(total.dadas)}</span></div>
        <div class="ledger-divider" aria-hidden="true"></div>
        <div class="ledger-item"><span class="ledger-label">Alumnos en clase</span><span class="ledger-value mono">${esc(total.asistencias)}</span></div>
        <div class="ledger-divider" aria-hidden="true"></div>
        <div class="ledger-item"><span class="ledger-label">No se dieron</span><span class="ledger-value mono">${esc(total.suspendidas)}</span></div>
      </div>
      ${
        porProfe.length
          ? `<ul class="asistencia-profes">${porProfe
              .map(
                (p) => `<li><strong>${esc(p.nombre)}</strong><span>${esc(plural(p.clases, "clase", "clases"))}${p.suplente ? ` (${esc(p.suplente)} de suplente)` : ""} · ${esc(plural(p.alumnos, "alumno", "alumnos"))}</span></li>`
              )
              .join("")}</ul>`
          : ""
      }`
    : "";
  document.getElementById("asistenciaLista").innerHTML = clases.length
    ? clases
        .map((c) => {
          const profes = c.profes.map((p) => `${p.nombre}${p.suplente ? " (suplente)" : ""}`).join(", ");
          const que = c.estado === "suspendida" ? "No se dio" : plural(c.asistentes, "vino", "vinieron");
          return `
            <li>
              <button type="button" class="asistencia-clase color-${esc(c.color)}" data-historial="${c.clase_id}" data-fecha="${esc(c.fecha)}">
                <span class="asistencia-cuando"><strong>${esc(fechaLarga(c.fecha))}</strong>${esc(c.desde)}</span>
                <span class="asistencia-que"><strong>${esc(c.actividad)}</strong><span>${esc(profes || "Sin profe anotado")}${c.nota ? ` · ${esc(c.nota)}` : ""}</span></span>
                <span class="asistencia-cuantos${c.estado === "suspendida" ? " es-suspendida" : ""}">${esc(que)}</span>
              </button>
            </li>`;
        })
        .join("")
    : `<li class="nota-plana">${selectProfe.value ? "Ese profe no tiene clases anotadas en este período." : "Todavía no hay clases anotadas en este período."}</li>`;
}

document.getElementById("asistenciaLista").addEventListener("click", (e) => {
  const boton = e.target.closest("[data-historial]");
  if (!boton) return;
  const { fecha } = boton.dataset;
  const clase = datos.clases.find((c) => c.id === Number(boton.dataset.historial));
  if (!clase) {
    avisar("Ese horario ya no está en la grilla.", "atencion");
    return;
  }
  abrirDia(clase, fecha);
});

selectProfe.addEventListener("change", cargarHistorial);
selectPeriodo.addEventListener("change", cargarHistorial);

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
  panelDia.hidden = true;
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

// Los colores de la imagen, según el fondo que se elige (de partida, el de la
// apariencia de Nexo). Los bloques de las clases van en su color en los dos.
const PALETAS = {
  claro: { fondo: "#FFFFFF", texto: "#0A0A0A", suave: "#6B6B6B", franja: "#4A4A4A", hora: "#8A8A8A", raya: "#E5E5E5", corte: "#F4F4F5", firma: "#A3A3A3" },
  oscuro: { fondo: "#0A0A0A", texto: "#F5F5F5", suave: "#A1A1A1", franja: "#C4C4C4", hora: "#8A8A8A", raya: "#262626", corte: "#161616", firma: "#6B6B6B" }
};
// Vertical: el 4:5 de Instagram (1080 × 1350). Horizontal: 1920 × 1080, con
// las columnas más anchas para que se lean las clases que van a la misma hora.
const FORMATOS = {
  vertical: { ancho: 1080, alto: 1350, titulo: 56, subtitulo: 30, hora: [92, 150] },
  horizontal: { ancho: 1920, alto: 1080, titulo: 48, subtitulo: 26, hora: [60, 140] }
};

// La semana en un PNG, con el formato y el fondo elegidos.
function dibujarImagen({ formato = "vertical", fondo = "oscuro" } = {}) {
  const f = FORMATOS[formato];
  const c = PALETAS[fondo];
  const visibles = clasesVisibles();
  const fijas = visibles.filter((x) => actividadDe(x).horario === "fijo");
  const libres = visibles.filter((x) => actividadDe(x).horario === "libre");
  const dias = diasAMostrar(visibles);
  const ANCHO = f.ancho;
  const MARGEN = 48;
  const COL_HORAS = 64;
  const yTitulo = f.titulo + 54;
  const ySubtitulo = yTitulo + f.subtitulo + 18;
  const yLibres = ySubtitulo + 40;
  const actividadesLibres = datos.actividades.filter((a) => a.activo && libres.some((x) => x.actividad_id === a.id));
  const yGrilla = yLibres + (actividadesLibres.length ? 24 + actividadesLibres.length * 40 : 0);
  const y0 = yGrilla + 56;
  // La hora tan alta como haga falta para llenar el formato, entre un mínimo y
  // un máximo: pocas horas no quedan flotando, muchas no se aprietan.
  const CORTE = 36;
  const horas = escala(fijas, 1, 0);
  const [minimo, maximo] = f.hora;
  const HORA = Math.min(maximo, Math.max(minimo, (f.alto - y0 - 80 - horas.cortes.length * CORTE) / Math.max(horas.alto, 1)));
  const linea = escala(fijas, HORA, CORTE);
  const alto = Math.max(f.alto, y0 + linea.alto + 80);

  const canvas = document.createElement("canvas");
  canvas.width = ANCHO;
  canvas.height = alto;
  const ctx = canvas.getContext("2d");
  const fuente = (peso, tam) => `${peso} ${tam}px Inter, "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = c.fondo;
  ctx.fillRect(0, 0, ANCHO, alto);

  // El encabezado: el negocio, y de qué es la grilla.
  ctx.fillStyle = c.texto;
  ctx.font = fuente(800, f.titulo);
  ctx.fillText(recortar(ctx, negocio.nombre || "Grilla de clases", ANCHO - MARGEN * 2), MARGEN, yTitulo);
  const nombreSucursal = sucursales.find((x) => String(x.id) === sucursal)?.nombre;
  ctx.fillStyle = c.suave;
  ctx.font = fuente(500, f.subtitulo);
  // Filtrada, es la grilla de esa actividad ("Grilla de BJJ").
  const nombreFiltro = datos.actividades.find((a) => a.id === filtro)?.nombre;
  const subtitulo = [nombreFiltro ? `Grilla de ${nombreFiltro}` : "Grilla de clases", nombreSucursal].filter(Boolean).join(" · ");
  ctx.fillText(subtitulo, MARGEN, ySubtitulo);

  // Las de horario libre, con su franja.
  let y = yLibres;
  for (const a of actividadesLibres) {
    ctx.fillStyle = COLORES[a.color];
    rectRedondeado(ctx, MARGEN, y + 6, 18, 18, 5);
    ctx.fill();
    ctx.fillStyle = c.texto;
    ctx.font = fuente(700, 26);
    ctx.fillText(a.nombre, MARGEN + 30, y + 24);
    const ancho = ctx.measureText(a.nombre).width;
    ctx.fillStyle = c.franja;
    ctx.font = fuente(500, 24);
    const franjas = resumenFranjas(libres.filter((x) => x.actividad_id === a.id));
    ctx.fillText(recortar(ctx, franjas, ANCHO - MARGEN * 2 - ancho - 48), MARGEN + 46 + ancho, y + 24);
    y += 40;
  }

  // Los días.
  const anchoDia = (ANCHO - MARGEN * 2 - COL_HORAS) / dias.length;
  const xDia = (i) => MARGEN + COL_HORAS + i * anchoDia;
  ctx.font = fuente(700, 24);
  ctx.fillStyle = c.texto;
  ctx.textAlign = "center";
  dias.forEach((dia, i) => ctx.fillText((formato === "horizontal" ? DIAS[dia] : DIAS_CORTOS[dia]).toUpperCase(), xDia(i) + anchoDia / 2, yGrilla + 30));
  ctx.textAlign = "left";

  // Las horas, con su raya, y los huecos sin clases achicados a un corte.
  ctx.font = fuente(500, 20);
  for (const m of linea.marcas) {
    ctx.fillStyle = c.hora;
    ctx.fillText(m.texto, MARGEN, y0 + m.y + 7);
    ctx.fillStyle = c.raya;
    ctx.fillRect(MARGEN + COL_HORAS, y0 + m.y, ANCHO - MARGEN * 2 - COL_HORAS, 1);
  }
  for (const corte of linea.cortes) {
    ctx.fillStyle = c.corte;
    ctx.fillRect(MARGEN + COL_HORAS, y0 + corte + 6, ANCHO - MARGEN * 2 - COL_HORAS, CORTE - 12);
  }

  // Las clases, en su color.
  dias.forEach((dia, i) => {
    for (const { clase, columna, columnas } of acomodar(fijas.filter((x) => x.dia_semana === dia))) {
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
      for (const [letra, texto] of lineas) {
        if (yy > top + h - 6) break;
        ctx.font = letra;
        ctx.fillText(recortar(ctx, texto, w - (chica ? 10 : 16)), x + (chica ? 6 : 8), yy);
        yy += paso;
      }
      ctx.restore();
    }
  });

  ctx.fillStyle = c.firma;
  ctx.font = fuente(500, 20);
  ctx.textAlign = "right";
  ctx.fillText("Hecha con Nexo", ANCHO - MARGEN, alto - 32);
  return canvas;
}

// Antes de bajarla se elige el formato y el fondo, con la vista previa al lado.
const panelImagen = document.getElementById("grillaImagen");
const vistaImagen = document.getElementById("grillaImagenVista");
const imagen = { formato: "vertical", fondo: "oscuro" };
let urlVista = null;

function pintarOpcionesImagen() {
  for (const b of panelImagen.querySelectorAll("[data-formato]")) b.setAttribute("aria-pressed", String(b.dataset.formato === imagen.formato));
  for (const b of panelImagen.querySelectorAll("[data-fondo]")) b.setAttribute("aria-pressed", String(b.dataset.fondo === imagen.fondo));
  dibujarImagen(imagen).toBlob((blob) => {
    if (urlVista) URL.revokeObjectURL(urlVista);
    urlVista = URL.createObjectURL(blob);
    vistaImagen.src = urlVista;
  }, "image/png");
}

document.getElementById("btnGrillaImagen").addEventListener("click", async () => {
  if (!clasesVisibles().length) {
    avisar("Todavía no hay horarios para mostrar.", "atencion");
    return;
  }
  if (!panelImagen.hidden) {
    panelImagen.hidden = true;
    return;
  }
  // De partida, el fondo de la apariencia que se está usando.
  imagen.fondo = temaActual() === "claro" ? "claro" : "oscuro";
  await document.fonts?.ready;
  panelImagen.hidden = false;
  pintarOpcionesImagen();
  panelImagen.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

panelImagen.addEventListener("click", (e) => {
  const opcion = e.target.closest("[data-formato], [data-fondo]");
  if (!opcion) return;
  if (opcion.dataset.formato) imagen.formato = opcion.dataset.formato;
  if (opcion.dataset.fondo) imagen.fondo = opcion.dataset.fondo;
  pintarOpcionesImagen();
});

document.getElementById("btnGrillaImagenCancelar").addEventListener("click", () => {
  panelImagen.hidden = true;
});

// En el celular se comparte directo (WhatsApp, Instagram); en la compu se baja.
document.getElementById("btnGrillaImagenBajar").addEventListener("click", async () => {
  const blob = await new Promise((resolve) => dibujarImagen(imagen).toBlob(resolve, "image/png"));
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
  panelImagen.hidden = true;
  formClase.hidden = true;
  formActividad.hidden = true;
  panelDia.hidden = true;
  abierta = null;
  // Los socios pueden haber cambiado desde la última vez (un alta, un cobro).
  socios = null;
  await cargar();
});
