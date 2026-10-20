/**
 * dominios/trabajos.js
 * Trabajos, u órdenes de trabajo (CLAUDE.md §29, hist. §78): el módulo
 * `trabajos`, que cualquier negocio puede prender y que el de servicios trae
 * prendido.
 *
 * Pantallas sobre las rutas de server.js, sección "Trabajos":
 * - Trabajos (#/trabajos/lista): lo que hay que hacer, del más próximo al más
 *   lejano, con lo de hoy, lo de la semana y lo atrasado arriba.
 * - La agenda (#/trabajos/semana y #/trabajos/mes, hist. §80): la semana con
 *   sus horas, o el mes, con las cuotas de abonos que vencen. En el celular la
 *   semana es una lista por día.
 * - La ficha de un trabajo: empezarlo, cancelarlo o terminarlo. Terminar crea
 *   la venta y abre el cobro de siempre.
 * - El alta y la edición, en un modal como el del presupuesto. Desde la ficha
 *   de un presupuesto, "Programar trabajo" abre el mismo modal sin renglones:
 *   los copia el servidor.
 *
 * Los renglones usan las filas de venta de app.js (items:*), que leen el
 * catálogo; este módulo no lo conoce.
 */

import { badge, camposFicha, cantidad, esc, fechaAR, hoyISO, money } from "../core/formato.js";
import { avisar, confirmar, filaVacia, tablaCargando } from "../core/ui.js";
import { api, refrescar } from "../core/api.js";
import { icono } from "../core/iconos.js";
import { moduloActivo } from "../core/negocio.js";
import { alEntrarEnVista, invocar, recargar, registrar } from "../core/registro.js";
import { mostrarVista } from "../core/router.js";

// Pendiente en naranja (conviene mirarlo), en curso en azul, terminado en verde
// y cancelado en gris.
const ESTADOS = {
  pendiente: { texto: "Pendiente", clase: "status-aviso" },
  en_curso: { texto: "En curso", clase: "status-info" },
  terminado: { texto: "Terminado", clase: "status-cobrado" },
  cancelado: { texto: "Cancelado", clase: "" }
};
const porHacer = (t) => t.estado === "pendiente" || t.estado === "en_curso";
const FILTROS = {
  por_hacer: porHacer,
  terminados: (t) => t.estado === "terminado",
  cancelados: (t) => t.estado === "cancelado",
  todos: () => true
};
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

let trabajos = [];
let filtro = "por_hacer";
let fichaTrabajo = null;
// En el modal: el trabajo que se edita, o el presupuesto del que sale uno.
let editando = null;
let desdePresupuesto = null;

const normalizar = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// Días de `desde` a `hasta`, dos fechas AAAA-MM-DD (en UTC, así no cuenta el
// cambio de horario).
const diasEntre = (desde, hasta) => Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000);
const atrasado = (t, hoy) => porHacer(t) && t.fecha && t.fecha < hoy;

// "Hoy, 10:30", "Mañana", "El jueves", "12/11/2026", "Sin fecha".
function cuando(t, hoy) {
  if (!t.fecha) return "Sin fecha";
  const dias = diasEntre(hoy, t.fecha);
  const dia =
    dias === 0
      ? "Hoy"
      : dias === 1
      ? "Mañana"
      : dias === -1
      ? "Ayer"
      : dias > 1 && dias < 7
      ? `El ${DIAS[new Date(`${t.fecha}T12:00`).getDay()]}`
      : fechaAR(t.fecha);
  return t.hora ? `${dia}, ${t.hora}` : dia;
}

const badgeEstado = (t) => badge(ESTADOS[t.estado].clase, ESTADOS[t.estado].texto).html;

async function cargarTrabajos() {
  const enAgenda = pestana !== "lista";
  if (!enAgenda) tablaCargando("trabajosBody", 6);
  // Las cuotas de abonos que vencen se ven en la agenda, si el módulo está.
  const [lista, deAbonos] = await Promise.all([
    api("/api/trabajos"),
    enAgenda && moduloActivo("abonos") ? api("/api/abonos") : null
  ]);
  trabajos = lista;
  if (deAbonos) abonosAgenda = deAbonos.filter((a) => a.proxima);
  renderLista();
  if (enAgenda) renderAgenda();
}

// Lo que cambia cuando un trabajo termina: su venta mueve todo lo demás.
const recargarOtrasVistas = () =>
  recargar("ventas", "presupuestos", "stock", "productos", "clientes", "cuentasCorrientes", "panelResumen", "reporteStock");

/* ---------- Lista (#/trabajos) ---------- */

const trabajosBuscar = document.getElementById("trabajosBuscar");
const trabajosFiltro = document.getElementById("trabajosFiltro");

function coincide(t, consulta) {
  if (!consulta) return true;
  const texto = normalizar(`${t.titulo} ${t.cliente} ${t.responsable ?? ""} ${t.items_resumen ?? ""}`);
  return normalizar(consulta)
    .split(/\s+/)
    .every((palabra) => texto.includes(palabra));
}

function renderLista() {
  const hoy = hoyISO();
  const pendientes = trabajos.filter(porHacer);
  document.getElementById("trabajosHoy").textContent = pendientes.filter((t) => t.fecha === hoy).length;
  document.getElementById("trabajosSemana").textContent = pendientes.filter(
    (t) => t.fecha && t.fecha >= hoy && diasEntre(hoy, t.fecha) < 7
  ).length;
  document.getElementById("trabajosAtrasados").textContent = pendientes.filter((t) => atrasado(t, hoy)).length;
  document.getElementById("trabajosACobrar").textContent = money(pendientes.reduce((acc, t) => acc + t.total, 0));

  const body = document.getElementById("trabajosBody");
  if (trabajos.length === 0) {
    body.innerHTML = filaVacia(6, "Todavía no hay trabajos. Programá uno desde un presupuesto aceptado o cargalo acá.", {
      accionTexto: "+ Nuevo trabajo",
      accionId: "btnNuevoTrabajo"
    });
    return;
  }
  const consulta = trabajosBuscar.value.trim();
  const visibles = trabajos.filter((t) => FILTROS[filtro](t) && coincide(t, consulta));
  if (visibles.length === 0) {
    body.innerHTML = filaVacia(6, consulta ? "Ningún trabajo con esa búsqueda." : "No hay trabajos acá.");
    return;
  }
  body.innerHTML = visibles
    .map(
      (t) => `
    <tr class="fila-clickeable" data-id="${t.id}">
      <td data-label="Cuándo">
        <span class="celda-principal">${esc(cuando(t, hoy))}</span>
        ${atrasado(t, hoy) ? '<span class="celda-meta trabajo-atrasado">Atrasado</span>' : ""}
      </td>
      <td data-label="Trabajo">
        <span class="celda-principal">${esc(t.titulo)}</span>
        ${t.items_resumen ? `<span class="celda-meta">${esc(t.items_resumen)}</span>` : ""}
      </td>
      <td data-label="Cliente">${esc(t.cliente)}</td>
      <td data-label="Responsable">${esc(t.responsable ?? "Sin asignar")}</td>
      <td data-label="Estado">${badgeEstado(t)}</td>
      <td data-label="Total" class="align-right mono">${t.total > 0 ? money(t.total) : "—"}</td>
    </tr>`
    )
    .join("");
}

document.getElementById("trabajosBody").addEventListener("click", (e) => {
  const fila = e.target.closest("tr[data-id]");
  if (fila) abrirFicha(Number(fila.dataset.id));
});
trabajosBuscar.addEventListener("input", renderLista);
trabajosFiltro.addEventListener("click", (e) => {
  const boton = e.target.closest(".segmento");
  if (!boton) return;
  filtro = boton.dataset.filtro;
  for (const b of trabajosFiltro.querySelectorAll(".segmento")) b.setAttribute("aria-pressed", String(b === boton));
  renderLista();
});

/* ---------- Ficha ---------- */

// Las acciones dependen del estado: uno terminado ya es una venta, y uno
// cancelado solo se puede retomar.
function botonesFicha(t) {
  const boton = (accion, texto, clase = "btn-secundario") =>
    `<button type="button" class="btn ${clase}" data-accion="${accion}">${texto}</button>`;
  if (t.estado === "terminado") return boton("venta", `Ver la venta #${t.venta_id}`, "btn-primary");
  if (t.estado === "cancelado") return boton("pendiente", "Retomar");
  return [
    boton("editar", "Editar"),
    t.estado === "pendiente" ? boton("en_curso", "Empezar") : boton("pendiente", "Volver a pendiente"),
    boton("cancelado", "Cancelar"),
    boton("terminar", "Terminar y cobrar", "btn-primary")
  ].join("");
}

function pintarFicha(t) {
  fichaTrabajo = t;
  const hoy = hoyISO();
  document.getElementById("fichaTrabajoTitulo").textContent = t.titulo;
  document.getElementById("fichaTrabajoTotal").textContent = money(t.total);
  document.getElementById("fichaTrabajoAcciones").innerHTML = botonesFicha(t);
  const enlace = (accion, texto) => ({ html: `<button type="button" class="btn-link" data-accion="${accion}">${esc(texto)}</button>` });
  document.getElementById("fichaTrabajoDatos").innerHTML = camposFicha([
    ["Cliente", enlace("cliente", t.cliente)],
    ["Cuándo", atrasado(t, hoy) ? { html: `${esc(cuando(t, hoy))} ${badge("status-vencido", "Atrasado").html}` } : cuando(t, hoy)],
    ["Responsable", t.responsable ?? "Sin asignar"],
    ["Estado", { html: badgeEstado(t) }],
    ["Teléfono", t.cliente_telefono],
    ["Dirección", t.cliente_direccion],
    ...(t.presupuesto_id ? [["Presupuesto", enlace("presupuesto", `Presupuesto #${t.presupuesto_id}`)]] : []),
    ["Notas", t.notas]
  ]);
  document.getElementById("fichaTrabajoItems").innerHTML =
    t.items.length === 0
      ? filaVacia(4, "Todavía no tiene renglones: cargá lo que se cobra con Editar.")
      : t.items
          .map(
            (i) => `
    <tr>
      <td data-label="Servicio o producto">${esc(i.producto)}${i.combinacion ? `<span class="celda-meta">${esc(i.combinacion)}</span>` : ""}</td>
      <td data-label="Cantidad" class="align-right mono">${esc(cantidad(i.cantidad, i.unidad))}</td>
      <td data-label="Precio unit." class="align-right mono">${money(i.precio_unitario)}</td>
      <td data-label="Subtotal" class="align-right mono">${money(i.subtotal)}</td>
    </tr>`
          )
          .join("");
}

async function abrirFicha(id) {
  pintarFicha(await api(`/api/trabajos/${id}`, { error: "No se pudo cargar el trabajo." }));
  mostrarVista("trabajo-detalle", { titulo: fichaTrabajo.titulo });
}

async function cambiarEstado(estado, boton) {
  if (
    estado === "cancelado" &&
    !(await confirmar({ cuerpo: "¿Cancelar este trabajo? Lo podés retomar después.", aceptar: "Cancelar trabajo", destructivo: true }))
  )
    return;
  boton.disabled = true;
  try {
    await api(`/api/trabajos/${fichaTrabajo.id}/estado`, {
      method: "PATCH",
      body: { estado },
      error: "No se pudo cambiar el estado."
    });
  } finally {
    boton.disabled = false;
  }
  avisar(`Trabajo ${ESTADOS[estado].texto.toLowerCase()}.`, "ok");
  // Cancelar o retomar cambia qué presupuesto tiene trabajo.
  await refrescar([cargarTrabajos(), recargar("presupuestos")]);
  await abrirFicha(fichaTrabajo.id);
}

async function terminar(boton) {
  if (
    !(await confirmar({
      cuerpo: `¿Terminar "${fichaTrabajo.titulo}"? Se crea la venta por ${money(fichaTrabajo.total)} y queda en la cuenta del cliente hasta que la cobres.`,
      aceptar: "Terminar"
    }))
  )
    return;
  boton.disabled = true;
  let ventaId;
  try {
    ({ venta_id: ventaId } = await api(`/api/trabajos/${fichaTrabajo.id}/terminar`, {
      method: "POST",
      error: "No se pudo terminar el trabajo."
    }));
  } finally {
    boton.disabled = false;
  }
  avisar(`Trabajo terminado: venta #${ventaId}.`, "ok");
  await refrescar([cargarTrabajos(), recargarOtrasVistas()]);
  await abrirFicha(fichaTrabajo.id);
  invocar("cobrar:venta", ventaId);
}

document.querySelector('[data-view="trabajo-detalle"]').addEventListener("click", (e) => {
  const boton = e.target.closest("[data-accion]");
  if (!boton || !fichaTrabajo) return;
  const accion = boton.dataset.accion;
  if (accion === "editar") abrirModal(fichaTrabajo);
  else if (accion === "terminar") terminar(boton);
  else if (accion === "venta") invocar("abrirFicha:venta", fichaTrabajo.venta_id);
  else if (accion === "cliente") invocar("abrirFicha:cliente", fichaTrabajo.cliente_id);
  else if (accion === "presupuesto") invocar("abrirFicha:presupuesto", fichaTrabajo.presupuesto_id);
  else cambiarEstado(accion, boton);
});
document.getElementById("btnVolverTrabajos").addEventListener("click", () => mostrarVista("trabajos"));

/* ---------- Alta y edición (modal) ---------- */

const modal = document.getElementById("modalTrabajo");
const form = document.getElementById("formTrabajo");
const itemsEl = document.getElementById("trabajoItems");

const actualizarTotal = () => {
  document.getElementById("trabajoTotal").textContent = money(invocar("items:total", itemsEl));
};
itemsEl.addEventListener("item-change", actualizarTotal);

async function poblarResponsables(elegido) {
  const responsables = await api("/api/trabajos/responsables");
  form.responsable_id.innerHTML =
    '<option value="">Sin asignar</option>' +
    responsables.map((r) => `<option value="${r.id}">${esc(r.nombre)}</option>`).join("");
  form.responsable_id.value = elegido ?? "";
}

// trabajo: el que se edita. presupuesto: aquel del que sale uno nuevo (sus
// renglones los copia el servidor, así que acá no se cargan). sugerido: el día,
// la hora y el responsable de un hueco de la agenda.
async function abrirModal(trabajo = null, presupuesto = null, sugerido = null) {
  editando = trabajo;
  desdePresupuesto = presupuesto;
  form.reset();
  document.getElementById("modalTrabajoTitulo").textContent = trabajo
    ? "Editar trabajo"
    : presupuesto
    ? `Programar el presupuesto #${presupuesto.id}`
    : "Nuevo trabajo";
  // El cliente de un trabajo que sale de un presupuesto es el del presupuesto.
  const clienteFijo = Boolean(presupuesto || trabajo?.presupuesto_id);
  document.getElementById("trabajoClienteCampo").hidden = clienteFijo;
  form.cliente.required = !clienteFijo;
  form.cliente.value = trabajo?.cliente ?? "";
  form.titulo.value = trabajo?.titulo ?? "";
  form.titulo.required = !presupuesto;
  form.titulo.placeholder = presupuesto
    ? `Si lo dejás vacío: ${presupuesto.items[0]?.producto ?? "el primer renglón"}`
    : "Ej.: Instalación del aire en el living";
  form.fecha.value = trabajo ? trabajo.fecha ?? "" : sugerido?.fecha ?? (presupuesto ? "" : hoyISO());
  form.hora.value = trabajo?.hora ?? sugerido?.hora ?? "";
  form.notas.value = trabajo?.notas ?? "";

  const nota = document.getElementById("trabajoRenglonesNota");
  document.getElementById("trabajoRenglones").hidden = Boolean(presupuesto);
  nota.hidden = !presupuesto;
  if (presupuesto) {
    const renglones = presupuesto.items.length === 1 ? "Se copia el renglón" : `Se copian los ${presupuesto.items.length} renglones`;
    nota.textContent = `${renglones} del presupuesto, por ${money(presupuesto.total)}. Los podés corregir en el trabajo.`;
  }
  itemsEl.innerHTML = "";
  if (trabajo?.items.length) await invocar("items:cargar", itemsEl, trabajo.items);
  else if (!presupuesto) invocar("items:agregarFila", itemsEl);
  actualizarTotal();
  await poblarResponsables(trabajo ? trabajo.responsable_id : sugerido?.responsable_id);
  modal.hidden = false;
  form.titulo.focus();
}

document.getElementById("btnNuevoTrabajo").addEventListener("click", () => abrirModal());
document.getElementById("btnAgregarItemTrabajo").addEventListener("click", () => invocar("items:agregarFila", itemsEl));
document.getElementById("modalTrabajoClose").addEventListener("click", () => {
  modal.hidden = true;
});
modal.addEventListener("click", (e) => {
  if (e.target === modal) modal.hidden = true;
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const cuerpo = {
    titulo: form.titulo.value,
    fecha: form.fecha.value || null,
    hora: form.hora.value || null,
    responsable_id: form.responsable_id.value ? Number(form.responsable_id.value) : null,
    notas: form.notas.value
  };
  if (desdePresupuesto) cuerpo.presupuesto_id = desdePresupuesto.id;
  else cuerpo.items = invocar("items:leer", itemsEl);
  if (!desdePresupuesto && !editando?.presupuesto_id) cuerpo.cliente = form.cliente.value.trim();

  const boton = form.querySelector('[type="submit"]');
  boton.disabled = true;
  let id;
  try {
    ({ id } = await api(editando ? `/api/trabajos/${editando.id}` : "/api/trabajos", {
      method: editando ? "PUT" : "POST",
      body: cuerpo,
      error: "No se pudo guardar el trabajo."
    }));
  } finally {
    boton.disabled = false;
  }
  modal.hidden = true;
  avisar(editando ? "Trabajo actualizado." : "Trabajo programado.", "ok");
  // Puede haber creado un cliente, o aceptado el presupuesto.
  await refrescar([cargarTrabajos(), recargar("clientes", "presupuestos")]);
  await abrirFicha(id);
});

/* ---------- Pestañas y agenda (hist. §80) ---------- */

const PESTANAS = ["lista", "semana", "mes"];
const CLAVE_PESTANA = "nexo.trabajos.vista";
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS_CORTOS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const DIAS_LARGOS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
// Un trabajo sin duración ocupa una hora, y ninguno menos de media.
const DURACION_SIN_DATO = 60;
const DURACION_MINIMA = 30;
// Las horas que se ven siempre; se amplían si hay algo antes o después.
const HORA_DESDE = 8;
const HORA_HASTA = 20;
const MAX_EN_EL_DIA = 3;

const celular = window.matchMedia("(max-width: 860px)");
const agendaCuerpo = document.getElementById("agendaCuerpo");
const agendaDia = document.getElementById("agendaDia");
const agendaSinFecha = document.getElementById("agendaSinFecha");
const agendaResponsable = document.getElementById("agendaResponsable");

let pestana = "lista";
// Un día de la semana o del mes que se está mirando.
let referencia = hoyISO();
// En el mes, el día elegido: su lista va abajo de la grilla.
let diaElegido = null;
let abonosAgenda = [];
let responsablesCargados = false;

// Fechas AAAA-MM-DD en UTC al mediodía: sumar días no cruza el cambio de hora.
const sumarDiasISO = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dosCifras = (n) => String(n).padStart(2, "0");
// 0 es el lunes: la semana arranca el lunes, como en la Argentina.
const diaDeLaSemana = (iso) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;
const inicioSemana = (iso) => sumarDiasISO(iso, -diaDeLaSemana(iso));
const primeroDelMes = (iso, desplazar = 0) => {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + desplazar, 1, 12)).toISOString().slice(0, 10);
};
const minutosDe = (hora) => {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
};
const horaDeMinutos = (min) => `${dosCifras(Math.floor(min / 60))}:${dosCifras(min % 60)}`;
const duracionDe = (t) => Math.max(t.duracion_estimada || DURACION_SIN_DATO, DURACION_MINIMA);

function fechaLarga(iso, { mes = true, anio = true, dia = false } = {}) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${dia ? `${DIAS_LARGOS[diaDeLaSemana(iso)]} ` : ""}${d}${mes ? ` de ${MESES[m - 1]}` : ""}${anio ? ` de ${y}` : ""}`;
}
const tituloDia = (fecha, hoy) =>
  fecha === hoy ? `Hoy, ${fechaLarga(fecha, { anio: false })}` : fechaLarga(fecha, { anio: false, dia: true });

function tituloSemana(lunes, domingo) {
  if (lunes.slice(0, 4) !== domingo.slice(0, 4)) return `${fechaLarga(lunes)} al ${fechaLarga(domingo)}`;
  if (lunes.slice(5, 7) !== domingo.slice(5, 7)) return `${fechaLarga(lunes, { anio: false })} al ${fechaLarga(domingo)}`;
  return `${fechaLarga(lunes, { mes: false, anio: false })} al ${fechaLarga(domingo)}`;
}

// Lo que muestra la agenda: todo menos lo cancelado, del responsable elegido.
function trabajosDeAgenda() {
  const elegido = agendaResponsable.value;
  return trabajos.filter(
    (t) =>
      t.estado !== "cancelado" &&
      (elegido === "" || (elegido === "sin" ? !t.responsable_id : t.responsable_id === Number(elegido)))
  );
}
const delDia = (lista, fecha) =>
  lista.filter((t) => t.fecha === fecha).sort((a, b) => (a.hora ?? "").localeCompare(b.hora ?? ""));
const abonosDelDia = (fecha) => abonosAgenda.filter((a) => a.proxima === fecha);

// Un trabajo en la agenda: su color es su estado (como en la lista), y uno
// atrasado lleva además un borde rojo.
function bloque(t, hoy, estilo = "", corto = false) {
  const atraso = atrasado(t, hoy);
  const clase = `agenda-trabajo agenda-${t.estado}${atraso ? " agenda-atrasado" : ""}${corto ? " es-corto" : ""}`;
  // El título completo al pasar el mouse: dos trabajos que se pisan quedan angostos.
  const completo = `${t.hora ? `${esc(t.hora)} ` : ""}${esc(t.titulo)} · ${esc(t.cliente)}`;
  return `<button type="button" class="${clase}" data-trabajo="${t.id}" title="${completo}"${estilo ? ` style="${estilo}"` : ""}>
      ${t.hora ? `<span class="agenda-trabajo-hora mono">${esc(t.hora)}</span>` : ""}
      <span class="agenda-trabajo-titulo">${esc(t.titulo)}</span>
      <span class="agenda-trabajo-meta">${esc(t.cliente)}${atraso ? " · Atrasado" : ""}</span>
    </button>`;
}

const bloqueAbono = (a) =>
  `<button type="button" class="agenda-trabajo agenda-abono" data-abono="${a.id}">
      <span class="agenda-trabajo-titulo">${icono("repeat")} Cuota de ${esc(a.cliente)}</span>
      <span class="agenda-trabajo-meta">${esc(a.servicio)} · ${money(a.precio)}</span>
    </button>`;

// Los trabajos que se pisan en un mismo día van lado a lado: cada grupo de
// trabajos que se solapan se reparte en carriles.
function enCarriles(lista, desde, hasta) {
  const orden = lista
    .map((t) => {
      const inicio = Math.max(minutosDe(t.hora), desde);
      return { t, inicio, fin: Math.min(inicio + duracionDe(t), hasta) };
    })
    .sort((a, b) => a.inicio - b.inicio);
  const resultado = [];
  let grupo = [];
  let finGrupo = -1;
  const cerrar = () => {
    const carriles = Math.max(...grupo.map((g) => g.carril)) + 1;
    for (const g of grupo) resultado.push({ ...g, carriles });
    grupo = [];
    finGrupo = -1;
  };
  for (const item of orden) {
    if (grupo.length && item.inicio >= finGrupo) cerrar();
    const ocupados = new Set(grupo.filter((g) => g.fin > item.inicio).map((g) => g.carril));
    let carril = 0;
    while (ocupados.has(carril)) carril++;
    grupo.push({ ...item, carril });
    finGrupo = Math.max(finGrupo, item.fin);
  }
  if (grupo.length) cerrar();
  return resultado;
}

// Un día como lista: la semana en el celular y el día elegido del mes.
function listaDelDia(fecha, lista, hoy, { titulo = true } = {}) {
  const items = [...delDia(lista, fecha).map((t) => bloque(t, hoy)), ...abonosDelDia(fecha).map(bloqueAbono)];
  return `
    <section class="agenda-lista-dia${fecha === hoy ? " es-hoy" : ""}">
      ${titulo ? `<h3>${esc(tituloDia(fecha, hoy))}</h3>` : ""}
      ${items.length ? items.join("") : '<p class="agenda-vacio">Nada programado.</p>'}
      <button type="button" class="btn-link agenda-agregar" data-nuevo-dia="${fecha}">${icono("plus")} Agregar un trabajo</button>
    </section>`;
}

function renderSemana(hoy) {
  const lunes = inicioSemana(referencia);
  const dias = Array.from({ length: 7 }, (_, i) => sumarDiasISO(lunes, i));
  document.getElementById("agendaTitulo").textContent = tituloSemana(lunes, dias[6]);
  const lista = trabajosDeAgenda().filter((t) => t.fecha >= lunes && t.fecha <= dias[6]);
  agendaDia.hidden = true;

  // En el celular, siete columnas no entran: una lista por día.
  if (celular.matches) {
    agendaCuerpo.innerHTML = `<div class="agenda-lista">${dias.map((d) => listaDelDia(d, lista, hoy)).join("")}</div>`;
    return;
  }

  const conHora = lista.filter((t) => t.hora);
  const desde = Math.min(HORA_DESDE, ...conHora.map((t) => Math.floor(minutosDe(t.hora) / 60)));
  const hasta = Math.min(24, Math.max(HORA_HASTA, ...conHora.map((t) => Math.ceil((minutosDe(t.hora) + duracionDe(t)) / 60))));
  const cantidadHoras = hasta - desde;
  const horas = Array.from({ length: cantidadHoras }, (_, i) => desde + i);
  const sinHora = (d) => [
    ...lista.filter((t) => t.fecha === d && !t.hora).map((t) => bloque(t, hoy)),
    ...abonosDelDia(d).map(bloqueAbono)
  ];
  const haySinHora = dias.some((d) => sinHora(d).length > 0);
  const ahora = new Date();
  const minutoAhora = ahora.getHours() * 60 + ahora.getMinutes();

  const columna = (d) => {
    const bloques = enCarriles(
      conHora.filter((t) => t.fecha === d),
      desde * 60,
      hasta * 60
    ).map(({ t, inicio, fin, carril, carriles }) =>
      bloque(
        t,
        hoy,
        `--inicio: ${(inicio - desde * 60) / 60}; --largo: ${(fin - inicio) / 60}; --carril: ${carril}; --carriles: ${carriles}`,
        fin - inicio <= 60
      )
    );
    const lineaAhora =
      d === hoy && minutoAhora >= desde * 60 && minutoAhora < hasta * 60
        ? `<span class="agenda-ahora" style="--inicio: ${(minutoAhora - desde * 60) / 60}" aria-hidden="true"></span>`
        : "";
    return `<div class="agenda-columna${d === hoy ? " es-hoy" : ""}" data-fecha="${d}" data-desde="${desde}" data-horas="${cantidadHoras}">${lineaAhora}${bloques.join("")}</div>`;
  };

  agendaCuerpo.innerHTML = `
    <div class="agenda-semana" style="--horas: ${cantidadHoras}">
      <div class="agenda-fila agenda-cabecera">
        <span></span>
        ${dias
          .map(
            (d, i) =>
              `<span class="agenda-dia-cab${d === hoy ? " es-hoy" : ""}"><span>${DIAS_CORTOS[i]}</span><strong>${Number(d.slice(8))}</strong></span>`
          )
          .join("")}
      </div>
      ${
        haySinHora
          ? `<div class="agenda-fila agenda-sin-hora">
        <span class="agenda-hora-etiqueta">Sin hora</span>
        ${dias.map((d) => `<div class="agenda-celda" data-fecha="${d}">${sinHora(d).join("")}</div>`).join("")}
      </div>`
          : ""
      }
      <div class="agenda-fila agenda-grilla">
        <div class="agenda-horas" aria-hidden="true">${horas.map((h) => `<span>${horaDeMinutos(h * 60)}</span>`).join("")}</div>
        ${dias.map(columna).join("")}
      </div>
    </div>`;
}

function renderMes(hoy) {
  const primero = primeroDelMes(referencia);
  const ultimo = sumarDiasISO(primeroDelMes(referencia, 1), -1);
  const desde = inicioSemana(primero);
  const hasta = sumarDiasISO(inicioSemana(ultimo), 6);
  const dias = [];
  for (let d = desde; d <= hasta; d = sumarDiasISO(d, 1)) dias.push(d);
  const [y, m] = primero.split("-").map(Number);
  document.getElementById("agendaTitulo").textContent = `${MESES[m - 1][0].toUpperCase()}${MESES[m - 1].slice(1)} de ${y}`;
  const lista = trabajosDeAgenda().filter((t) => t.fecha >= desde && t.fecha <= hasta);
  if (diaElegido && (diaElegido < primero || diaElegido > ultimo)) diaElegido = null;

  const chip = (x) =>
    x.servicio
      ? `<button type="button" class="agenda-chip agenda-abono" data-abono="${x.id}">${icono("repeat")} ${esc(x.cliente)}</button>`
      : `<button type="button" class="agenda-chip agenda-${esc(x.estado)}${atrasado(x, hoy) ? " agenda-atrasado" : ""}" data-trabajo="${x.id}">${
          x.hora ? `<span class="mono">${esc(x.hora)}</span> ` : ""
        }${esc(x.titulo)}</button>`;
  const celda = (d) => {
    const items = [...delDia(lista, d), ...abonosDelDia(d)];
    const total = items.length;
    const visibles = items.slice(0, MAX_EN_EL_DIA).map(chip).join("");
    const clases = ["agenda-mes-dia", d < primero || d > ultimo ? "es-fuera" : "", d === hoy ? "es-hoy" : "", d === diaElegido ? "es-elegido" : ""];
    const cuantos = total === 0 ? "nada programado" : total === 1 ? "1 programado" : `${total} programados`;
    return `
      <div class="${clases.filter(Boolean).join(" ")}" data-dia="${d}">
        <button type="button" class="agenda-mes-numero" data-dia="${d}" aria-label="${esc(fechaLarga(d, { dia: true }))}, ${cuantos}">${Number(d.slice(8))}</button>
        <div class="agenda-mes-items">${visibles}${total > MAX_EN_EL_DIA ? `<span class="agenda-mas">+${total - MAX_EN_EL_DIA} más</span>` : ""}</div>
        ${total ? `<span class="agenda-mes-puntos" aria-hidden="true">${"<i></i>".repeat(Math.min(total, 3))}</span>` : ""}
      </div>`;
  };

  agendaCuerpo.innerHTML = `
    <div class="agenda-mes">
      <div class="agenda-mes-cab" aria-hidden="true">${DIAS_CORTOS.map((d) => `<span>${d}</span>`).join("")}</div>
      <div class="agenda-mes-grilla">${dias.map(celda).join("")}</div>
    </div>`;

  agendaDia.hidden = !diaElegido;
  if (diaElegido) agendaDia.innerHTML = `<h3>${esc(tituloDia(diaElegido, hoy))}</h3>${listaDelDia(diaElegido, lista, hoy, { titulo: false })}`;
}

// Lo que todavía no tiene día, para no perderlo de vista al mirar la agenda.
function renderSinFecha(hoy) {
  const sinFecha = trabajosDeAgenda().filter((t) => !t.fecha && porHacer(t));
  const cantidad = sinFecha.length;
  agendaSinFecha.hidden = cantidad === 0;
  agendaSinFecha.innerHTML = `
    <h3>Sin fecha <span class="agenda-cuenta">${cantidad}</span></h3>
    <p class="agenda-vacio">Abrí uno y ponele día con Editar para que aparezca en la agenda.</p>
    <div class="agenda-sin-fecha">${sinFecha.map((t) => bloque(t, hoy)).join("")}</div>`;
}

function renderAgenda() {
  const hoy = hoyISO();
  if (pestana === "semana") renderSemana(hoy);
  else renderMes(hoy);
  renderSinFecha(hoy);
}

async function poblarResponsablesAgenda() {
  if (responsablesCargados) return;
  const lista = await api("/api/trabajos/responsables");
  agendaResponsable.innerHTML =
    '<option value="">Todos</option><option value="sin">Sin asignar</option>' +
    lista.map((r) => `<option value="${r.id}">${esc(r.nombre)}</option>`).join("");
  responsablesCargados = true;
}

// Sin subruta (el menú, Volver), la última pestaña que se usó.
async function entrarATrabajos(subruta) {
  const guardada = localStorage.getItem(CLAVE_PESTANA);
  const elegida = PESTANAS.includes(subruta) ? subruta : PESTANAS.includes(guardada) ? guardada : "lista";
  if (subruta !== elegida) history.replaceState(null, "", `#/trabajos/${elegida}`);
  localStorage.setItem(CLAVE_PESTANA, elegida);
  if (elegida !== pestana) diaElegido = null;
  pestana = elegida;
  const enAgenda = pestana !== "lista";
  for (const seccion of document.querySelectorAll(".trabajos-pestana")) {
    seccion.hidden = seccion.dataset.pestana !== (enAgenda ? "agenda" : "lista");
  }
  for (const enlace of document.querySelectorAll("#trabajosMenu .segmento")) {
    if (enlace.dataset.pestana === pestana) enlace.setAttribute("aria-current", "page");
    else enlace.removeAttribute("aria-current");
  }
  if (enAgenda) {
    if (pestana === "mes" && !diaElegido) diaElegido = hoyISO();
    await poblarResponsablesAgenda();
  }
  await cargarTrabajos();
}

const sugerencia = (extra) => ({
  ...extra,
  responsable_id: agendaResponsable.value && agendaResponsable.value !== "sin" ? Number(agendaResponsable.value) : null
});

document.querySelector('.trabajos-pestana[data-pestana="agenda"]').addEventListener("click", (e) => {
  const trabajo = e.target.closest("[data-trabajo]");
  const abono = e.target.closest("[data-abono]");
  const nuevo = e.target.closest("[data-nuevo-dia]");
  const dia = e.target.closest("[data-dia]");
  const columna = e.target.closest(".agenda-columna");
  const celda = e.target.closest(".agenda-celda");
  if (trabajo) abrirFicha(Number(trabajo.dataset.trabajo));
  else if (abono) invocar("abrirFicha:abono", Number(abono.dataset.abono));
  else if (nuevo) abrirModal(null, null, sugerencia({ fecha: nuevo.dataset.nuevoDia }));
  else if (dia) {
    diaElegido = dia.dataset.dia;
    renderAgenda();
  } else if (columna) {
    // La media hora del hueco tocado.
    const { top, height } = columna.getBoundingClientRect();
    const mediasHoras = Math.floor(((e.clientY - top) / height) * Number(columna.dataset.horas) * 2);
    const minutos = Math.min(Number(columna.dataset.desde) * 60 + mediasHoras * 30, 23 * 60 + 30);
    abrirModal(null, null, sugerencia({ fecha: columna.dataset.fecha, hora: horaDeMinutos(minutos) }));
  } else if (celda) abrirModal(null, null, sugerencia({ fecha: celda.dataset.fecha }));
});

function mover(sentido) {
  referencia = pestana === "semana" ? sumarDiasISO(referencia, 7 * sentido) : primeroDelMes(referencia, sentido);
  diaElegido = null;
  renderAgenda();
}
document.getElementById("agendaAnterior").addEventListener("click", () => mover(-1));
document.getElementById("agendaSiguiente").addEventListener("click", () => mover(1));
document.getElementById("agendaHoy").addEventListener("click", () => {
  referencia = hoyISO();
  diaElegido = pestana === "mes" ? referencia : null;
  renderAgenda();
});
document.getElementById("btnNuevoTrabajoAgenda").addEventListener("click", () =>
  abrirModal(null, null, sugerencia({ fecha: pestana === "mes" && diaElegido ? diaElegido : hoyISO() }))
);
agendaResponsable.addEventListener("change", renderAgenda);
celular.addEventListener("change", () => {
  if (pestana !== "lista") renderAgenda();
});

alEntrarEnVista("trabajos", entrarATrabajos);
registrar("cargar:trabajos", cargarTrabajos);
registrar("abrirFicha:trabajo", abrirFicha);
registrar("programar:trabajo", (presupuesto) => abrirModal(null, presupuesto));
