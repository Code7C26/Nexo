/**
 * dominios/trabajos.js
 * Trabajos, u órdenes de trabajo (CLAUDE.md §29, hist. §78): el módulo
 * `trabajos`, que cualquier negocio puede prender y que el de servicios trae
 * prendido.
 *
 * Pantallas sobre las rutas de server.js, sección "Trabajos":
 * - Trabajos (#/trabajos): lo que hay que hacer, del más próximo al más lejano,
 *   con lo de hoy, lo de la semana y lo atrasado arriba.
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
  tablaCargando("trabajosBody", 6);
  trabajos = await api("/api/trabajos");
  renderLista();
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
// renglones los copia el servidor, así que acá no se cargan).
async function abrirModal(trabajo = null, presupuesto = null) {
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
  form.fecha.value = trabajo ? trabajo.fecha ?? "" : presupuesto ? "" : hoyISO();
  form.hora.value = trabajo?.hora ?? "";
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
  await poblarResponsables(trabajo?.responsable_id);
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

alEntrarEnVista("trabajos", cargarTrabajos);
registrar("cargar:trabajos", cargarTrabajos);
registrar("abrirFicha:trabajo", abrirFicha);
registrar("programar:trabajo", (presupuesto) => abrirModal(null, presupuesto));
