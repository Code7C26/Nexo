/**
 * dominios/crm.js
 * Consultas (CRM, CLAUDE.md §29, hist. §89 y §90): el módulo `crm`, que
 * cualquier negocio puede prender. Los que preguntan y todavía no compraron:
 * de dónde llegaron, en qué quedó y qué falta hacer.
 *
 * Pantallas sobre las rutas de server.js, sección "Consultas (CRM)":
 * Todo vive en la página del CRM, junto con la base de clientes (hist. §91):
 * la vista `clientes`, con pestañas. Con el módulo apagado se ve solo la
 * lista de clientes, que pinta app.js.
 * - Consultas (#/clientes/consultas): el embudo, en columnas por etapa, con arrastrar y soltar en
 *   la compu (también a Ganada o Perdida, para cerrarla); en el celular, una
 *   etapa por pestaña.
 * - Para hoy (#/clientes/hoy): lo que vence hoy o ya venció, las consultas
 *   sin próximo paso, los presupuestos sin respuesta y los abonos que deben.
 *   Las primeras también van en el Resumen.
 * - Dejaron de comprar (#/clientes/dejaron) y Números (#/clientes/numeros).
 * - La ficha de una consulta: su seguimiento y "Cuando decide", que la pasa a
 *   cliente, presupuesto, venta o socio con las altas de siempre
 *   (nuevo:presupuesto y nuevo:venta de app.js, nuevo:socio de socios.js).
 *   El servidor la gana sola cuando sale la venta o el socio.
 * - El alta rápida (tres campos), en un modal: es lo que se carga parado en
 *   el mostrador.
 * - En la ficha del cliente, sus consultas y su seguimiento; en
 *   Configuración, las etapas del embudo.
 */

import { badge, botonEditarFila, camposFicha, celdaMovil, esc, fechaAR, hoyISO, money, numero } from "../core/formato.js";
import { avisar, confirmar, filaVacia, tablaCargando } from "../core/ui.js";
import { api, refrescar } from "../core/api.js";
import { icono } from "../core/iconos.js";
import { moduloActivo, negocio } from "../core/negocio.js";
import { alEntrarEnVista, invocar, recargar, registrar } from "../core/registro.js";
import { mostrarVista } from "../core/router.js";

// Cada tipo de actividad: cómo se llama, su ícono y qué se sugiere escribir.
const TIPOS = {
  llamada: { texto: "Llamada", icono: "phone", ejemplo: "Ej.: llamarla para contarle los horarios" },
  mensaje: { texto: "Mensaje", icono: "message-circle", ejemplo: "Ej.: mandarle la lista de precios por WhatsApp" },
  visita: { texto: "Visita", icono: "door-open", ejemplo: "Ej.: pasa por el local a probarse" },
  tarea: { texto: "Tarea", icono: "square-check-big", ejemplo: "Ej.: armarle el presupuesto" },
  nota: { texto: "Nota", icono: "notebook-tabs", ejemplo: "Ej.: prefiere que le escriban a la tarde" }
};
const ESTADOS = {
  abierta: { texto: "Abierta", clase: "status-info" },
  ganada: { texto: "Ganada", clase: "status-cobrado" },
  perdida: { texto: "Perdida", clase: "" }
};
// "lista" es la base de clientes (app.js); las demás son de este módulo.
const PESTANAS = ["lista", "consultas", "hoy", "dejaron", "numeros"];
const CLAVE_PESTANA = "nexo.crm.vista";
// Las cerradas que se ven en el embudo: las de los últimos días.
const DIAS_CERRADAS = 30;

let etapas = [];
let consultas = [];
let origenes = null;
let responsables = null;
let pestana = "lista";
// En el celular, la etapa que se está mirando (un id, "ganada" o "perdida").
let etapaCelular = null;
let ficha = null;
// En el modal: la consulta que se edita (null = alta).
let editando = null;
let arrastrando = null;
// Repintar a mitad de un arrastre suelta la tarjeta: se deja para el final.
let repintarAlSoltar = false;

const celular = window.matchMedia("(max-width: 860px)");

const normalizar = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const sumarDiasISO = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diasEntre = (desde, hasta) => Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000);

// "Hoy", "Mañana", "Ayer", "Hace 3 días", "En 5 días" o la fecha.
function cuando(fecha, hoy = hoyISO()) {
  if (!fecha) return "";
  const dias = diasEntre(hoy, fecha);
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Mañana";
  if (dias === -1) return "Ayer";
  if (dias < 0 && dias > -7) return `Hace ${-dias} días`;
  if (dias > 0 && dias < 7) return `En ${dias} días`;
  return fechaAR(fecha);
}
// "venció hace 3 días", "para mañana", "para el 12/11/2026".
const enMinuscula = (texto) => (/^\d/.test(texto) ? `el ${texto}` : texto.toLowerCase());

const badgeEstado = (o) => badge(ESTADOS[o.estado].clase, ESTADOS[o.estado].texto).html;

// El próximo paso de una consulta abierta, o cómo se cerró. Siempre con texto:
// el color solo acompaña.
function avisoDe(o, hoy) {
  if (o.estado === "ganada") {
    return `<span class="proximo proximo-ganada">${icono("circle-check")} Ganada ${esc(enMinuscula(cuando(o.fecha_cierre, hoy)))}</span>`;
  }
  if (o.estado === "perdida") return `<span class="proximo">Perdida: ${esc(o.motivo_perdida)}</span>`;
  if (o.aviso === "sin_accion") return `<span class="proximo proximo-falta">${icono("circle-alert")} Sin próximo paso</span>`;
  const tipo = TIPOS[o.proxima_tipo] ?? TIPOS.tarea;
  const clase = o.aviso === "vencida" ? "proximo-vencido" : o.aviso === "hoy" ? "proximo-hoy" : "";
  const etiqueta = o.aviso === "vencida" ? `Venció ${enMinuscula(cuando(o.proxima_fecha, hoy))}` : cuando(o.proxima_fecha, hoy);
  const simbolo = icono(tipo.icono);
  return `<span class="proximo ${clase}">${simbolo} <span>${esc(etiqueta)}: ${esc(o.proxima_descripcion)}</span></span>`;
}

// Un link de WhatsApp para un celular argentino cargado como se escribe
// (351 555-0101, 0351…): con 10 dígitos se le suma el 549. Si no se puede
// armar con seguridad, no hay link.
function linkWhatsApp(telefono) {
  let digitos = String(telefono ?? "").replace(/\D/g, "");
  if (digitos.startsWith("0")) digitos = digitos.slice(1);
  if (digitos.startsWith("54")) return digitos.length >= 12 ? `https://wa.me/${digitos}` : null;
  return digitos.length === 10 ? `https://wa.me/549${digitos}` : null;
}

async function cargarCatalogos() {
  if (origenes && responsables) return;
  [origenes, responsables] = await Promise.all([api("/api/crm/origenes"), api("/api/trabajos/responsables")]);
}

async function cargarConsultas() {
  [etapas, consultas] = await Promise.all([
    api("/api/crm/etapas", { error: "No se pudieron cargar las etapas." }),
    api("/api/crm/oportunidades", { error: "No se pudieron cargar las consultas." })
  ]);
  if (pestana === "consultas") renderEmbudo();
}

/* ---------- Embudo ---------- */

const embudo = document.getElementById("embudo");
const embudoEtapas = document.getElementById("embudoEtapas");
const buscar = document.getElementById("consultasBuscar");

function coincide(o, consulta) {
  if (!consulta) return true;
  const texto = normalizar(`${o.nombre} ${o.telefono ?? ""} ${o.interes ?? ""} ${o.responsable ?? ""}`);
  return normalizar(consulta)
    .split(/\s+/)
    .every((palabra) => texto.includes(palabra));
}

function tarjeta(o, hoy) {
  const arrastrable = o.estado === "abierta" && !celular.matches;
  return `
    <button type="button" class="embudo-tarjeta${o.estado === "abierta" ? "" : " es-cerrada"}" data-id="${o.id}" draggable="${arrastrable}">
      <span class="embudo-tarjeta-cabeza">
        <span class="embudo-tarjeta-nombre">${esc(o.nombre)}</span>
        ${o.valor_estimado ? `<span class="embudo-tarjeta-valor mono">${money(o.valor_estimado)}</span>` : ""}
      </span>
      ${o.interes ? `<span class="embudo-tarjeta-interes">${esc(o.interes)}</span>` : ""}
      ${avisoDe(o, hoy)}
    </button>`;
}

// Las columnas: las etapas activas, las pausadas que todavía tienen consultas
// y, al final, las cerradas de los últimos días (Ganada y Perdida también
// reciben tarjetas, para cerrarlas).
function columnas(visibles, hoy) {
  const desde = sumarDiasISO(hoy, -DIAS_CERRADAS);
  const abiertas = visibles.filter((o) => o.estado === "abierta");
  const lista = etapas
    .map((e) => ({ clave: String(e.id), etapa: e, nombre: e.nombre, items: abiertas.filter((o) => o.etapa_id === e.id) }))
    .filter((c) => c.etapa.activa || c.items.length > 0);
  for (const cierre of ["ganada", "perdida"]) {
    lista.push({
      clave: cierre,
      cierre,
      nombre: cierre === "ganada" ? "Ganadas" : "Perdidas",
      items: visibles.filter((o) => o.estado === cierre && (o.fecha_cierre ?? "") >= desde)
    });
  }
  return lista;
}

function renderEmbudo() {
  if (arrastrando !== null) {
    repintarAlSoltar = true;
    return;
  }
  const hoy = hoyISO();
  const mes = hoy.slice(0, 7);
  const abiertas = consultas.filter((o) => o.estado === "abierta");
  document.getElementById("consultasAbiertas").textContent = numero(abiertas.length);
  document.getElementById("consultasValor").textContent = money(abiertas.reduce((acc, o) => acc + (o.valor_estimado ?? 0), 0));
  document.getElementById("consultasSinAccion").textContent = numero(abiertas.filter((o) => o.aviso === "sin_accion").length);
  document.getElementById("consultasGanadas").textContent = numero(
    consultas.filter((o) => o.estado === "ganada" && (o.fecha_cierre ?? "").startsWith(mes)).length
  );

  if (consultas.length === 0) {
    embudoEtapas.hidden = true;
    embudo.innerHTML = `
      <div class="embudo-vacio">
        <span class="embudo-vacio-icono">${icono("funnel")}</span>
        <h3>Todavía no anotaste ninguna consulta</h3>
        <p>Cada vez que alguien te pregunta por WhatsApp, por Instagram o en el local, anotalo acá. Nexo te recuerda cuándo volver a escribirle y te muestra cuántas terminan en una venta.</p>
        <button type="button" class="btn btn-primary" data-nueva>${icono("plus")} Anotar la primera consulta</button>
      </div>`;
    return;
  }

  const consulta = buscar.value.trim();
  const visibles = consultas.filter((o) => coincide(o, consulta));
  const cols = columnas(visibles, hoy);

  if (celular.matches) {
    if (!cols.some((c) => c.clave === etapaCelular)) etapaCelular = cols[0]?.clave ?? null;
    embudoEtapas.hidden = false;
    embudoEtapas.innerHTML = cols
      .map(
        (c) =>
          `<button type="button" class="segmento" data-etapa="${esc(c.clave)}" aria-pressed="${c.clave === etapaCelular}">${esc(c.nombre)} <span class="segmento-cuenta">${numero(c.items.length)}</span></button>`
      )
      .join("");
  } else {
    embudoEtapas.hidden = true;
  }

  const mostradas = celular.matches ? cols.filter((c) => c.clave === etapaCelular) : cols;
  embudo.innerHTML = mostradas
    .map((c) => {
      const valor = c.items.reduce((acc, o) => acc + (o.valor_estimado ?? 0), 0);
      const vacio = consulta ? "Ninguna con esa búsqueda." : c.cierre ? `Ninguna en los últimos ${DIAS_CERRADAS} días.` : "Ninguna en esta etapa.";
      const clases = c.cierre ? `embudo-columna embudo-cierre embudo-${c.cierre}` : "embudo-columna";
      return `
      <section class="${clases}" data-destino="${esc(c.clave)}" aria-label="${esc(c.nombre)}">
        <header class="embudo-columna-cabeza">
          <h3>${esc(c.nombre)}${c.etapa && !c.etapa.activa ? ' <span class="celda-meta">(pausada)</span>' : ""}</h3>
          <span class="embudo-columna-cuenta">${numero(c.items.length)}</span>
          ${!c.cierre && valor > 0 ? `<span class="embudo-columna-valor mono">${money(valor)}</span>` : ""}
        </header>
        <div class="embudo-lista">
          ${c.items.length ? c.items.map((o) => tarjeta(o, hoy)).join("") : `<p class="embudo-columna-vacia">${esc(vacio)}</p>`}
        </div>
      </section>`;
    })
    .join("");
}

buscar.addEventListener("input", renderEmbudo);
embudoEtapas.addEventListener("click", (e) => {
  const boton = e.target.closest(".segmento[data-etapa]");
  if (!boton) return;
  etapaCelular = boton.dataset.etapa;
  renderEmbudo();
});
celular.addEventListener("change", () => {
  if (pestana === "consultas") renderEmbudo();
});

embudo.addEventListener("click", (e) => {
  if (e.target.closest("[data-nueva]")) abrirModal();
  const tarjetaEl = e.target.closest(".embudo-tarjeta");
  if (tarjetaEl) abrirFicha(Number(tarjetaEl.dataset.id));
});

// Arrastrar y soltar (solo en la compu): soltar en una etapa la mueve; en
// Ganada o Perdida, la cierra. La tarjeta se mueve enseguida y vuelve si el
// servidor no acepta. Con teclado, lo mismo se hace desde la ficha.
embudo.addEventListener("dragstart", (e) => {
  const tarjetaEl = e.target.closest(".embudo-tarjeta");
  if (!tarjetaEl) return;
  arrastrando = Number(tarjetaEl.dataset.id);
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", String(arrastrando));
  tarjetaEl.classList.add("es-arrastrada");
  embudo.classList.add("arrastrando");
});
embudo.addEventListener("dragend", () => {
  arrastrando = null;
  embudo.classList.remove("arrastrando");
  for (const el of embudo.querySelectorAll(".es-arrastrada, .es-destino")) el.classList.remove("es-arrastrada", "es-destino");
  if (repintarAlSoltar) {
    repintarAlSoltar = false;
    renderEmbudo();
  }
});
embudo.addEventListener("dragover", (e) => {
  const columna = e.target.closest(".embudo-columna");
  if (!columna || arrastrando === null) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  for (const otra of embudo.querySelectorAll(".es-destino")) if (otra !== columna) otra.classList.remove("es-destino");
  columna.classList.add("es-destino");
});
embudo.addEventListener("dragleave", (e) => {
  const columna = e.target.closest(".embudo-columna");
  if (columna && !columna.contains(e.relatedTarget)) columna.classList.remove("es-destino");
});
embudo.addEventListener("drop", (e) => {
  const columna = e.target.closest(".embudo-columna");
  if (!columna || arrastrando === null) return;
  e.preventDefault();
  const id = arrastrando;
  arrastrando = null;
  embudo.classList.remove("arrastrando");
  columna.classList.remove("es-destino");
  soltarEn(id, columna.dataset.destino);
});

async function soltarEn(id, destino) {
  const o = consultas.find((c) => c.id === id);
  if (!o || o.estado !== "abierta") return;
  if (destino === "ganada") {
    await ganar(o);
    return;
  }
  if (destino === "perdida") {
    abrirPerdida(o);
    return;
  }
  const etapa = etapas.find((e) => String(e.id) === destino);
  if (!etapa || etapa.id === o.etapa_id) return;
  const anterior = { etapa_id: o.etapa_id, etapa: o.etapa };
  Object.assign(o, { etapa_id: etapa.id, etapa: etapa.nombre });
  renderEmbudo();
  try {
    await api(`/api/crm/oportunidades/${id}/etapa`, { method: "PATCH", body: { etapa_id: etapa.id }, error: "No se pudo mover la consulta." });
  } catch {
    Object.assign(o, anterior);
    renderEmbudo();
    return;
  }
  avisar(`${o.nombre} pasó a "${etapa.nombre}".`, "ok");
}

async function ganar(o) {
  if (
    !(await confirmar({
      titulo: "Consulta ganada",
      cuerpo: `¿${o.nombre} ya te compró? Si todavía falta cargar la venta, hacela desde su ficha: la consulta queda ganada sola.`,
      aceptar: "Marcar como ganada"
    }))
  )
    return;
  await api(`/api/crm/oportunidades/${o.id}/cerrar`, { method: "POST", body: { resultado: "ganada" }, error: "No se pudo cerrar la consulta." });
  avisar(`Consulta de ${o.nombre} ganada.`, "ok");
  await refrescar([cargarConsultas(), ficha?.id === o.id ? abrirFicha(o.id) : null]);
}

/* ---------- Perdida (modal) ---------- */

const modalPerdida = document.getElementById("modalPerdida");
const formPerdida = document.getElementById("formPerdida");
let perdiendo = null;

function abrirPerdida(o) {
  perdiendo = o;
  formPerdida.reset();
  document.getElementById("modalPerdidaTitulo").textContent = `¿Por qué se perdió la consulta de ${o.nombre}?`;
  modalPerdida.hidden = false;
  formPerdida.motivo.focus();
}

document.getElementById("motivosRapidos").addEventListener("click", (e) => {
  const boton = e.target.closest("[data-motivo]");
  if (!boton) return;
  formPerdida.motivo.value = boton.dataset.motivo;
  formPerdida.requestSubmit();
});
document.getElementById("modalPerdidaClose").addEventListener("click", () => {
  modalPerdida.hidden = true;
});
modalPerdida.addEventListener("click", (e) => {
  if (e.target === modalPerdida) modalPerdida.hidden = true;
});
formPerdida.addEventListener("submit", async (e) => {
  e.preventDefault();
  const motivo = formPerdida.motivo.value.trim();
  if (!motivo) {
    avisar("Contá por qué se perdió, o tocá uno de los motivos.", "atencion");
    formPerdida.motivo.focus();
    return;
  }
  const boton = formPerdida.querySelector('[type="submit"]');
  boton.disabled = true;
  try {
    await api(`/api/crm/oportunidades/${perdiendo.id}/cerrar`, {
      method: "POST",
      body: { resultado: "perdida", motivo },
      error: "No se pudo cerrar la consulta."
    });
  } finally {
    boton.disabled = false;
  }
  modalPerdida.hidden = true;
  avisar(`Consulta de ${perdiendo.nombre} cerrada como perdida.`, "ok");
  await refrescar([cargarConsultas(), ficha?.id === perdiendo.id ? abrirFicha(perdiendo.id) : null]);
});

/* ---------- Alta rápida y edición (modal) ---------- */

const modal = document.getElementById("modalConsulta");
const form = document.getElementById("formConsulta");

async function abrirModal(o = null) {
  editando = o;
  await cargarCatalogos();
  form.reset();
  document.getElementById("modalConsultaTitulo").textContent = o ? "Editar consulta" : "Nueva consulta";
  document.getElementById("formConsultaSubmit").textContent = o ? "Guardar cambios" : "Guardar consulta";
  form.origen.innerHTML =
    '<option value="">Sin anotar</option>' + origenes.map((x) => `<option value="${esc(x.clave)}">${esc(x.nombre)}</option>`).join("");
  form.responsable_id.innerHTML =
    '<option value="">Nadie todavía</option>' + responsables.map((r) => `<option value="${r.id}">${esc(r.nombre)}</option>`).join("");
  // Una consulta que ya es cliente toma el nombre de su ficha.
  const esCliente = Boolean(o?.cliente_id);
  document.getElementById("consultaNombreCampo").hidden = esCliente;
  const nota = document.getElementById("consultaEsCliente");
  nota.hidden = !esCliente;
  nota.textContent = esCliente ? `Es ${o.nombre}, que ya es cliente: el nombre se cambia en su ficha.` : "";
  form.nombre.value = o?.nombre ?? "";
  form.telefono.value = o?.telefono ?? "";
  form.interes.value = o?.interes ?? "";
  form.email.value = o?.email ?? "";
  form.origen.value = o?.origen ?? "";
  form.valor_estimado.value = o?.valor_estimado ?? "";
  form.responsable_id.value = o?.responsable_id ?? "";
  document.getElementById("consultaMasDatos").open = Boolean(o && (o.origen || o.valor_estimado || o.responsable_id || o.email));
  modal.hidden = false;
  (esCliente ? form.telefono : form.nombre).focus();
}

document.getElementById("btnNuevaConsulta").addEventListener("click", () => abrirModal());
document.getElementById("modalConsultaClose").addEventListener("click", () => {
  modal.hidden = true;
});
modal.addEventListener("click", (e) => {
  if (e.target === modal) modal.hidden = true;
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const nombre = form.nombre.value.trim();
  if (!editando?.cliente_id && !nombre) {
    avisar("Anotá el nombre de quien consulta.", "atencion");
    form.nombre.focus();
    return;
  }
  const cuerpo = {
    nombre,
    telefono: form.telefono.value,
    interes: form.interes.value,
    email: form.email.value,
    origen: form.origen.value || null,
    valor_estimado: form.valor_estimado.value === "" ? null : Number(form.valor_estimado.value),
    responsable_id: form.responsable_id.value ? Number(form.responsable_id.value) : null
  };
  const boton = form.querySelector('[type="submit"]');
  boton.disabled = true;
  let id;
  try {
    ({ id } = await api(editando ? `/api/crm/oportunidades/${editando.id}` : "/api/crm/oportunidades", {
      method: editando ? "PUT" : "POST",
      body: cuerpo,
      error: "No se pudo guardar la consulta."
    }));
  } finally {
    boton.disabled = false;
  }
  modal.hidden = true;
  avisar(editando ? "Consulta actualizada." : "Consulta anotada. Agendá cuándo volver a escribirle.", "ok");
  await refrescar([cargarConsultas()]);
  await abrirFicha(id, { enfocarSeguimiento: !editando });
});

/* ---------- Ficha ---------- */

const formActividad = document.getElementById("formActividad");
let tipoActividad = "llamada";

function pintarTipos(contenedor, elegido) {
  contenedor.innerHTML = Object.entries(TIPOS)
    .map(([clave, t]) => {
      const simbolo = icono(t.icono);
      return `<button type="button" class="segmento" data-tipo="${clave}" aria-pressed="${clave === elegido}">${simbolo} ${esc(t.texto)}</button>`;
    })
    .join("");
}

// Una nota es un registro: no tiene fecha ni se marca hecha.
function ajustarFormActividad(formEl, tipo) {
  const esNota = tipo === "nota";
  formEl.fecha.closest("label").hidden = esNota;
  formEl.hecha.closest("label").hidden = esNota;
  formEl.descripcion.placeholder = TIPOS[tipo].ejemplo;
}

function botonesFicha(o) {
  const boton = (accion, texto, clase = "btn-secundario") =>
    `<button type="button" class="btn ${clase}" data-accion="${accion}">${texto}</button>`;
  if (o.estado !== "abierta") return [boton("editar", "Editar"), boton("reabrir", "Reabrir")].join("");
  const opciones = etapas
    .filter((e) => e.activa || e.id === o.etapa_id)
    .map((e) => `<option value="${e.id}"${e.id === o.etapa_id ? " selected" : ""}>${esc(e.nombre)}</option>`)
    .join("");
  return [
    `<label class="ficha-etapa"><span>Etapa</span><select id="fichaConsultaEtapa" aria-label="Mover a la etapa">${opciones}</select></label>`,
    boton("editar", "Editar"),
    boton("perdida", "Perdida"),
    boton("ganada", "Ganada")
  ].join("");
}

function opcionesPasar(o) {
  const opcion = (accion, iconoId, titulo, detalle) => `
    <button type="button" class="consulta-pasar-opcion" data-accion="${accion}">
      <span class="consulta-pasar-icono">${icono(iconoId)}</span>
      <span class="consulta-pasar-texto"><span class="consulta-pasar-titulo">${esc(titulo)}</span><span class="consulta-pasar-detalle">${esc(detalle)}</span></span>
      ${icono("chevron-right", "consulta-pasar-flecha")}
    </button>`;
  const lista = [];
  if (!o.cliente_id) lista.push(opcion("cliente", "user-plus", "Pasarla a cliente", "Lo das de alta con su nombre y su teléfono."));
  if (moduloActivo("presupuestos")) {
    lista.push(opcion("presupuesto", "file-text", "Hacerle un presupuesto", "Queda vinculado: si se convierte en venta, la consulta se gana sola."));
  }
  lista.push(opcion("venta", "shopping-cart", "Registrar la venta", "Ya decidió: la venta gana la consulta."));
  if (moduloActivo("socios")) lista.push(opcion("socio", "id-card", "Hacerlo socio", "El alta del socio, con sus datos ya cargados."));
  return lista.join("");
}

function itemActividad(a, hoy) {
  const tipo = TIPOS[a.tipo] ?? TIPOS.tarea;
  const vencida = !a.hecha && a.fecha < hoy;
  const estado = a.hecha
    ? a.tipo === "nota"
      ? cuando(a.fecha, hoy)
      : `Hecha ${enMinuscula(cuando(a.fecha_hecha ?? a.fecha, hoy))}`
    : vencida
    ? `Venció ${enMinuscula(cuando(a.fecha, hoy))}`
    : `Para ${enMinuscula(cuando(a.fecha, hoy))}`;
  const clase = a.hecha ? "es-hecha" : vencida ? "es-vencida" : a.fecha === hoy ? "es-hoy" : "";
  const simbolo = icono(a.hecha ? "check" : tipo.icono);
  return `
    <li class="linea-tiempo-item ${clase}" data-actividad="${a.id}">
      <span class="linea-tiempo-icono">${simbolo}</span>
      <div class="linea-tiempo-cuerpo">
        <p class="linea-tiempo-texto">${esc(a.descripcion)}</p>
        <p class="linea-tiempo-meta">${esc(tipo.texto)} · ${esc(estado)}${a.usuario ? ` · ${esc(a.usuario)}` : ""}</p>
      </div>
      <div class="linea-tiempo-acciones">
        ${a.hecha ? "" : `<button type="button" class="btn btn-secundario btn-chico" data-hecha="${a.id}">${icono("check")} Hecha</button>`}
        <button type="button" class="btn-icon" data-borrar="${a.id}" title="Borrar" aria-label="Borrar">${icono("trash-2")}</button>
      </div>
    </li>`;
}

function pintarFicha(o) {
  ficha = o;
  const hoy = hoyISO();
  document.getElementById("fichaConsultaTitulo").textContent = o.nombre;
  document.getElementById("fichaConsultaAcciones").innerHTML = botonesFicha(o);
  const enlace = (accion, texto) => ({ html: `<button type="button" class="btn-link" data-accion="${accion}">${esc(texto)}</button>` });
  const whatsapp = linkWhatsApp(o.telefono);
  const telefono = o.telefono
    ? {
        html:
          `<a href="tel:${esc(o.telefono.replace(/[^\d+]/g, ""))}">${esc(o.telefono)}</a>` +
          (whatsapp ? ` · <a href="${esc(whatsapp)}" target="_blank" rel="noopener">WhatsApp</a>` : "")
      }
    : null;
  const generado = [];
  if (o.presupuesto) generado.push(`<button type="button" class="btn-link" data-accion="ver-presupuesto">Presupuesto #${o.presupuesto.id}</button>`);
  if (o.venta_id) generado.push(`<button type="button" class="btn-link" data-accion="ver-venta">Venta #${o.venta_id}</button>`);
  if (o.socio) generado.push(`Socio N° ${numero(o.socio.numero)}`);
  document.getElementById("fichaConsultaDatos").innerHTML = camposFicha([
    ["Qué busca", o.interes],
    ["Estado", { html: `${badgeEstado(o)}${o.estado === "perdida" ? ` ${esc(o.motivo_perdida)}` : ""}` }],
    ["Etapa", o.etapa],
    ...(o.estado === "abierta" ? [["Próximo paso", { html: avisoDe(o, hoy) }]] : []),
    ["Teléfono", telefono],
    ["Email", o.email],
    ["Llegó por", o.origen_nombre],
    ["Valor estimado", o.valor_estimado ? money(o.valor_estimado) : null],
    ["La sigue", o.responsable ?? "Nadie todavía"],
    ["Consultó", fechaAR(o.fecha)],
    ...(o.cliente_id ? [["Cliente", enlace("cliente", "Ver su ficha")]] : []),
    ...(generado.length ? [["Lo que generó", { html: generado.join(" · ") }]] : [])
  ]);

  document.getElementById("fichaConsultaPasar").hidden = o.estado !== "abierta";
  document.getElementById("fichaConsultaOpciones").innerHTML = o.estado === "abierta" ? opcionesPasar(o) : "";

  document.getElementById("fichaConsultaActividades").innerHTML = o.actividades.length
    ? o.actividades.map((a) => itemActividad(a, hoy)).join("")
    : '<li class="linea-tiempo-vacia">Todavía no hay nada anotado. ¿Cuándo le volvés a escribir?</li>';
}

async function abrirFicha(id, { enfocarSeguimiento = false } = {}) {
  const [o] = await Promise.all([
    api(`/api/crm/oportunidades/${id}`, { error: "No se pudo cargar la consulta." }),
    etapas.length ? null : cargarConsultas()
  ]);
  pintarFicha(o);
  formActividad.reset();
  tipoActividad = "llamada";
  pintarTipos(document.getElementById("actividadTipo"), tipoActividad);
  ajustarFormActividad(formActividad, tipoActividad);
  formActividad.fecha.value = sumarDiasISO(hoyISO(), 1);
  mostrarVista("consulta-detalle", { titulo: o.nombre });
  // La ficha arranca arriba, aunque el embudo estuviera bajado.
  window.scrollTo(0, 0);
  // En el celular no: el foco abre el teclado sin que lo pidan.
  if (enfocarSeguimiento && !celular.matches) formActividad.descripcion.focus();
}

document.getElementById("actividadTipo").addEventListener("click", (e) => {
  const boton = e.target.closest(".segmento[data-tipo]");
  if (!boton) return;
  tipoActividad = boton.dataset.tipo;
  pintarTipos(document.getElementById("actividadTipo"), tipoActividad);
  ajustarFormActividad(formActividad, tipoActividad);
  formActividad.descripcion.focus();
});

// Lo que se anota: si falta algo, el aviso; si no, al servidor. Devuelve si
// se guardó.
async function anotar(formEl, tipo, destino) {
  const descripcion = formEl.descripcion.value.trim();
  const hecha = tipo === "nota" || formEl.hecha.checked;
  const fecha = tipo === "nota" ? null : formEl.fecha.value || null;
  if (!descripcion) {
    avisar("Contá qué hay que hacer, o qué pasó.", "atencion");
    formEl.descripcion.focus();
    return false;
  }
  if (!hecha && !fecha) {
    avisar("Elegí para cuándo es, o marcá que ya lo hiciste.", "atencion");
    formEl.fecha.focus();
    return false;
  }
  const boton = formEl.querySelector('[type="submit"]');
  boton.disabled = true;
  try {
    await api("/api/crm/actividades", { method: "POST", body: { ...destino, tipo, descripcion, fecha, hecha }, error: "No se pudo anotar." });
  } finally {
    boton.disabled = false;
  }
  return true;
}

formActividad.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!ficha) return;
  if (!(await anotar(formActividad, tipoActividad, { oportunidad_id: ficha.id }))) return;
  avisar("Anotado.", "ok");
  await refrescar([cargarConsultas()]);
  await abrirFicha(ficha.id);
});

async function marcarHecha(id) {
  await api(`/api/crm/actividades/${id}`, { method: "PATCH", body: { hecha: true }, error: "No se pudo marcar." });
  avisar("Hecha. ¿Cuál es el próximo paso?", "ok");
}

async function borrarActividad(id) {
  if (!(await confirmar({ cuerpo: "¿Borrar lo anotado? No se puede deshacer.", aceptar: "Borrar", destructivo: true }))) return false;
  await api(`/api/crm/actividades/${id}`, { method: "DELETE", error: "No se pudo borrar." });
  return true;
}

// Pasarla a cliente. Si ya hay un cliente con ese nombre, se ofrece vincularlo
// en vez de duplicarlo. Devuelve el id del cliente, o null si no se hizo.
async function asegurarCliente(o) {
  if (o.cliente_id) return o.cliente_id;
  const clientes = await api("/api/clientes", { error: "No se pudieron cargar los clientes." });
  const mismo = clientes.find((c) => normalizar(c.nombre.trim()) === normalizar(o.nombre.trim()));
  let cuerpo = {};
  if (mismo) {
    const vincular = await confirmar({
      titulo: "Ya tenés un cliente con ese nombre",
      cuerpo: `¿${mismo.nombre} es la misma persona que consultó? Si no lo es, cambiale el nombre a la consulta con Editar y volvé a intentar.`,
      aceptar: "Sí, es la misma"
    });
    if (!vincular) return null;
    cuerpo = { cliente_id: mismo.id };
  }
  const { cliente_id: clienteId } = await api(`/api/crm/oportunidades/${o.id}/cliente`, {
    method: "POST",
    body: cuerpo,
    error: "No se pudo pasar a cliente."
  });
  await refrescar([recargar("clientes")]);
  return clienteId;
}

async function pasarA(accion) {
  const o = ficha;
  if (accion === "socio") {
    invocar("nuevo:socio", { cliente_id: o.cliente_id, nombre: o.nombre, telefono: o.telefono, email: o.email, crm_oportunidad_id: o.id });
    return;
  }
  const clienteId = await asegurarCliente(o);
  if (!clienteId) return;
  await abrirFicha(o.id);
  if (accion === "cliente") {
    avisar(`${o.nombre} ya es cliente.`, "ok");
    return;
  }
  invocar(accion === "presupuesto" ? "nuevo:presupuesto" : "nuevo:venta", { cliente: ficha.nombre, crm_oportunidad_id: o.id });
}

const vistaFicha = document.querySelector('[data-view="consulta-detalle"]');
vistaFicha.addEventListener("click", async (e) => {
  if (!ficha) return;
  const hecha = e.target.closest("[data-hecha]");
  const borrar = e.target.closest("[data-borrar]");
  if (hecha) {
    hecha.disabled = true;
    await marcarHecha(Number(hecha.dataset.hecha)).finally(() => {
      hecha.disabled = false;
    });
    await refrescar([cargarConsultas()]);
    await abrirFicha(ficha.id, { enfocarSeguimiento: true });
    return;
  }
  if (borrar) {
    if (await borrarActividad(Number(borrar.dataset.borrar))) {
      await refrescar([cargarConsultas()]);
      await abrirFicha(ficha.id);
    }
    return;
  }
  const boton = e.target.closest("[data-accion]");
  if (!boton) return;
  const accion = boton.dataset.accion;
  if (accion === "editar") abrirModal(ficha);
  else if (accion === "ganada") ganar(ficha);
  else if (accion === "perdida") abrirPerdida(ficha);
  else if (accion === "reabrir") {
    await api(`/api/crm/oportunidades/${ficha.id}/reabrir`, { method: "POST", error: "No se pudo reabrir." });
    avisar("Consulta reabierta.", "ok");
    await refrescar([cargarConsultas()]);
    await abrirFicha(ficha.id);
  } else if (accion === "cliente" && ficha.cliente_id) invocar("abrirFicha:cliente", ficha.cliente_id);
  else if (accion === "ver-presupuesto") invocar("abrirFicha:presupuesto", ficha.presupuesto.id);
  else if (accion === "ver-venta") invocar("abrirFicha:venta", ficha.venta_id);
  else pasarA(accion);
});
vistaFicha.addEventListener("change", async (e) => {
  if (e.target.id !== "fichaConsultaEtapa" || !ficha) return;
  const select = e.target;
  const anterior = ficha.etapa_id;
  try {
    await api(`/api/crm/oportunidades/${ficha.id}/etapa`, {
      method: "PATCH",
      body: { etapa_id: Number(select.value) },
      error: "No se pudo mover la consulta."
    });
  } catch {
    select.value = anterior;
    return;
  }
  avisar(`Pasó a "${select.selectedOptions[0].textContent}".`, "ok");
  await refrescar([cargarConsultas()]);
  await abrirFicha(ficha.id);
});
document.getElementById("btnVolverConsultas").addEventListener("click", () => mostrarVista("clientes", { subruta: "consultas" }));

/* ---------- Para hoy ---------- */

const paraHoyEl = document.getElementById("paraHoy");

// Los grupos de "Para hoy", en el orden en que conviene encararlos. Cada
// renglón lleva a lo suyo (ir) y, si es una actividad, se marca hecha ahí.
function gruposParaHoy(d) {
  const hoy = d.hoy;
  const grupos = [];
  const actividad = (a) => {
    const tipo = TIPOS[a.tipo] ?? TIPOS.tarea;
    return {
      ir: a.oportunidad_id ? `consulta:${a.oportunidad_id}` : `cliente:${a.cliente_id}`,
      icono: tipo.icono,
      titulo: a.descripcion,
      meta: `${a.nombre ?? ""} · ${tipo.texto}${a.vencida ? ` · venció ${enMinuscula(cuando(a.fecha, hoy))}` : ""}`,
      clase: a.vencida ? "es-vencida" : "es-hoy",
      actividad_id: a.id
    };
  };
  const vencidas = d.actividades.filter((a) => a.vencida);
  const deHoy = d.actividades.filter((a) => !a.vencida);
  if (vencidas.length) grupos.push({ titulo: "Atrasado", items: vencidas.map(actividad) });
  if (deHoy.length) grupos.push({ titulo: "Para hoy", items: deHoy.map(actividad) });
  if (d.sin_accion.length) {
    grupos.push({
      titulo: "Consultas sin próximo paso",
      items: d.sin_accion.map((o) => ({
        ir: `consulta:${o.id}`,
        icono: "circle-alert",
        titulo: o.nombre,
        meta: `${o.interes ? `${o.interes} · ` : ""}consultó ${enMinuscula(cuando(o.fecha, hoy))}`,
        clase: "es-falta",
        accion: "Agendar"
      }))
    });
  }
  if (d.presupuestos.length && moduloActivo("presupuestos")) {
    grupos.push({
      titulo: "Presupuestos sin respuesta",
      items: d.presupuestos.map((p) => ({
        ir: `presupuesto:${p.id}`,
        icono: "file-text",
        titulo: `Presupuesto #${p.id} · ${p.cliente}`,
        meta: `Enviado hace ${p.dias} días · ${money(p.total)}`,
        accion: "Ver"
      }))
    });
  }
  if (d.abonos.length && moduloActivo("abonos")) {
    grupos.push({
      titulo: "Abonos que deben",
      items: d.abonos.map((a) => ({
        ir: `abono:${a.id}`,
        icono: "repeat",
        titulo: `${a.cliente} · ${a.servicio}`,
        meta: `Debe ${money(a.deuda)}${a.cuotas_impagas > 1 ? ` (${a.cuotas_impagas} cuotas)` : ""}`,
        accion: "Cobrar"
      }))
    });
  }
  return grupos;
}

// Un renglón: lo que lleva viene armado en gruposParaHoy() con datos de la
// base, y se escapa acá.
function renglon(r) {
  const accion = r.actividad_id
    ? `<button type="button" class="btn btn-secundario btn-chico" data-hecha="${r.actividad_id}">${icono("check")} Hecha</button>`
    : `<button type="button" class="btn-link" data-ir="${esc(r.ir)}">${esc(r.accion)}</button>`;
  const simbolo = icono(r.icono);
  return `
    <li class="para-hoy-item ${esc(r.clase ?? "")}">
      <button type="button" class="para-hoy-ir" data-ir="${esc(r.ir)}">
        <span class="para-hoy-icono">${simbolo}</span>
        <span class="para-hoy-texto"><span class="para-hoy-titulo">${esc(r.titulo)}</span><span class="para-hoy-meta">${esc(r.meta)}</span></span>
      </button>
      ${accion}
    </li>`;
}

async function cargarParaHoy() {
  const d = await api("/api/crm/para-hoy", { error: "No se pudo cargar lo de hoy." });
  const grupos = gruposParaHoy(d);
  const total = grupos.reduce((acc, g) => acc + g.items.length, 0);
  const cuenta = document.getElementById("consultasHoyCuenta");
  cuenta.hidden = total === 0;
  cuenta.textContent = numero(total);
  if (pestana !== "hoy") return;
  paraHoyEl.innerHTML = total
    ? grupos
        .map(
          (g) => `
      <section class="panel para-hoy-grupo">
        <div class="panel-head"><h2>${esc(g.titulo)} <span class="para-hoy-cuenta">${numero(g.items.length)}</span></h2></div>
        <ul class="para-hoy-lista">${g.items.map(renglon).join("")}</ul>
      </section>`
        )
        .join("")
    : `
      <div class="embudo-vacio">
        <span class="embudo-vacio-icono es-ok">${icono("circle-check")}</span>
        <h3>Nada pendiente para hoy</h3>
        <p>Cuando agendes una llamada o un mensaje, aparece acá el día que toca. También te avisa de las consultas que quedaron sin próximo paso.</p>
      </div>`;
}

// Tocar un renglón lleva a la ficha que corresponde.
function ir(destino) {
  const [que, id] = destino.split(":");
  if (que === "consulta") abrirFicha(Number(id), { enfocarSeguimiento: true });
  else if (que === "cliente") invocar("abrirFicha:cliente", Number(id));
  else if (que === "presupuesto") invocar("abrirFicha:presupuesto", Number(id));
  else if (que === "abono") invocar("abrirFicha:abono", Number(id));
}

async function alTocarParaHoy(e, alTerminar) {
  const hecha = e.target.closest("[data-hecha]");
  if (hecha) {
    hecha.disabled = true;
    await marcarHecha(Number(hecha.dataset.hecha)).finally(() => {
      hecha.disabled = false;
    });
    await refrescar([alTerminar(), cargarConsultas()]);
    return;
  }
  const destino = e.target.closest("[data-ir]");
  if (destino) ir(destino.dataset.ir);
}
paraHoyEl.addEventListener("click", (e) => alTocarParaHoy(e, cargarParaHoy));

/* ---------- Para hoy en el Resumen ---------- */

const resumenEl = document.getElementById("paraHoyResumen");
const EN_EL_RESUMEN = 5;

// Lo invoca el Resumen al entrar (dominios/primeros-pasos.js). Sin nada
// pendiente no se ve: el Resumen no se llena de paneles vacíos.
async function pintarParaHoyResumen() {
  if (!negocio.id) await recargar("negocio");
  if (!moduloActivo("crm")) {
    resumenEl.hidden = true;
    return;
  }
  const renglones = gruposParaHoy(await api("/api/crm/para-hoy", { error: "No se pudo cargar lo de hoy." })).flatMap((g) => g.items);
  if (renglones.length === 0) {
    resumenEl.hidden = true;
    return;
  }
  const primeros = renglones.slice(0, EN_EL_RESUMEN).map(renglon).join("");
  resumenEl.hidden = false;
  resumenEl.innerHTML = `
    <div class="panel-head">
      <h2 id="paraHoyResumenTitulo">Para hoy <span class="para-hoy-cuenta">${numero(renglones.length)}</span></h2>
      <a class="btn-link" href="#/clientes/hoy">Ver todo ${icono("chevron-right")}</a>
    </div>
    <ul class="para-hoy-lista">${primeros}</ul>`;
}
resumenEl.addEventListener("click", (e) => alTocarParaHoy(e, pintarParaHoyResumen));

/* ---------- Dejaron de comprar ---------- */

const dejaronDias = document.getElementById("dejaronDias");
let dias = 90;
let dejaronClientes = [];

async function cargarDejaron() {
  tablaCargando("dejaronBody", 5);
  dejaronClientes = await api(`/api/crm/inactivos?dias=${dias}`, { error: "No se pudo cargar la lista." });
  document.getElementById("dejaronBody").innerHTML = dejaronClientes.length
    ? dejaronClientes
        .map(
          (c) => `
    <tr class="fila-clickeable" data-cliente="${c.id}">
      <td data-label="Cliente" class="m-titulo">
        <span class="celda-principal">${esc(c.nombre)}</span>
        ${c.telefono ? `<span class="celda-meta">${esc(c.telefono)}</span>` : ""}
      </td>
      ${celdaMovil(`hace ${numero(c.dias)} días`, `${numero(c.compras)} compra${c.compras === 1 ? "" : "s"}`, c.telefono)}
      <td data-label="Última compra">
        <span class="celda-principal">${esc(fechaAR(c.ultima_compra))}</span>
        <span class="celda-meta">hace ${numero(c.dias)} días</span>
      </td>
      <td data-label="Compras" class="align-right mono">${numero(c.compras)}</td>
      <td data-label="Compró en total" class="align-right mono m-valor">${money(c.total_comprado)}</td>
      <td data-label="Seguimiento" class="align-right m-estado">${
        c.con_seguimiento
          ? badge("status-info", "Agendado").html
          : `<button type="button" class="btn btn-secundario btn-chico" data-seguir="${c.id}">${icono("plus")} Anotar seguimiento</button>`
      }</td>
    </tr>`
        )
        .join("")
    : filaVacia(5, "Nadie dejó de venir en ese tiempo. Cuando un cliente que compraba deja de hacerlo, aparece acá.");
}

dejaronDias.addEventListener("click", (e) => {
  const boton = e.target.closest(".segmento[data-dias]");
  if (!boton) return;
  dias = Number(boton.dataset.dias);
  for (const b of dejaronDias.querySelectorAll(".segmento")) b.setAttribute("aria-pressed", String(b === boton));
  cargarDejaron();
});
document.getElementById("dejaronBody").addEventListener("click", (e) => {
  const seguir = e.target.closest("[data-seguir]");
  if (seguir) {
    const cliente = dejaronClientes.find((c) => c.id === Number(seguir.dataset.seguir));
    abrirSeguimiento(cliente, { descripcion: "Escribirle para saber cómo anda y contarle lo nuevo", alGuardar: cargarDejaron });
    return;
  }
  const fila = e.target.closest("tr[data-cliente]");
  if (fila) invocar("abrirFicha:cliente", Number(fila.dataset.cliente));
});

/* ---------- Números ---------- */

const numerosPeriodo = document.getElementById("numerosPeriodo");
let periodo = "trimestre";

function desdeDelPeriodo() {
  const hoy = hoyISO();
  if (periodo === "mes") return `${hoy.slice(0, 8)}01`;
  if (periodo === "trimestre") return sumarDiasISO(hoy, -90);
  return null;
}

// Barras horizontales de un solo color, con el número al lado: comparan
// cantidades de una misma cosa, así que no hace falta leyenda.
function barras(filas, vacio) {
  if (filas.length === 0) return `<p class="barras-vacio">${esc(vacio)}</p>`;
  const maximo = Math.max(...filas.map((f) => f.valor), 1);
  return filas
    .map(
      (f) => `
    <div class="barra">
      <span class="barra-etiqueta">${esc(f.etiqueta)}</span>
      <span class="barra-pista"><span class="barra-relleno" style="width: ${Math.max((f.valor / maximo) * 100, f.valor > 0 ? 2 : 0)}%"></span></span>
      <span class="barra-valor mono">${esc(f.texto)}</span>
    </div>`
    )
    .join("");
}

async function cargarNumeros() {
  const desde = desdeDelPeriodo();
  const r = await api(`/api/crm/reporte${desde ? `?desde=${desde}` : ""}`, { error: "No se pudieron cargar los números." });
  document.getElementById("numerosTotal").textContent = numero(r.total);
  document.getElementById("numerosGanadas").textContent = numero(r.ganadas);
  document.getElementById("numerosPerdidas").textContent = numero(r.perdidas);
  document.getElementById("numerosConversion").textContent = r.conversion === null ? "—" : `${numero(Math.round(r.conversion))}%`;
  document.getElementById("numerosOrigen").innerHTML = barras(
    r.por_origen.map((o) => ({
      etiqueta: o.origen_nombre,
      valor: o.total,
      texto: o.ganadas ? `${numero(o.total)} · ${numero(o.ganadas)} ganadas` : numero(o.total)
    })),
    "Todavía no hay consultas en este período. Anotá de dónde llega cada una y acá vas a ver qué canal te trae más."
  );
  document.getElementById("numerosEtapas").innerHTML = barras(
    r.por_etapa
      .filter((e) => e.activa || e.abiertas > 0)
      .map((e) => ({ etiqueta: e.nombre, valor: e.abiertas, texto: e.valor > 0 ? `${numero(e.abiertas)} · ${money(e.valor)}` : numero(e.abiertas) })),
    "Tu embudo todavía no tiene etapas."
  );
  document.getElementById("numerosMotivos").innerHTML = barras(
    r.motivos.map((m) => ({ etiqueta: m.motivo, valor: m.total, texto: numero(m.total) })),
    "Ninguna consulta perdida en este período."
  );
}

numerosPeriodo.addEventListener("click", (e) => {
  const boton = e.target.closest(".segmento[data-periodo]");
  if (!boton) return;
  periodo = boton.dataset.periodo;
  for (const b of numerosPeriodo.querySelectorAll(".segmento")) b.setAttribute("aria-pressed", String(b === boton));
  cargarNumeros();
});

/* ---------- Pestañas ---------- */

// La página del CRM: la base de clientes y las consultas, en pestañas. Sin
// subruta (el menú, Volver), la última que se usó. Con el módulo apagado, solo
// la lista de clientes y sin pestañas.
async function entrarAlCrm(subruta) {
  if (!negocio.id) await recargar("negocio");
  const conCrm = moduloActivo("crm");
  let guardada = null;
  try {
    guardada = localStorage.getItem(CLAVE_PESTANA);
  } catch {
    // Sin almacenamiento (ventana privada): se abre la lista.
  }
  const elegida = !conCrm ? "lista" : PESTANAS.includes(subruta) ? subruta : PESTANAS.includes(guardada) ? guardada : "lista";
  // La dirección queda siempre en la del CRM, también si se llegó por un link
  // viejo de Consultas (#/consultas/hoy, core/router.js).
  const destino = conCrm ? `#/clientes/${elegida}` : "#/clientes";
  if (location.hash !== destino) history.replaceState(null, "", destino);
  if (conCrm) {
    try {
      localStorage.setItem(CLAVE_PESTANA, elegida);
    } catch {
      // Idem: la próxima vez arranca en la lista.
    }
  }
  // Con un deep-link el negocio llega después que el título del router.
  const titulo = conCrm ? "CRM" : "Clientes";
  document.getElementById("vistaTitulo").textContent = titulo;
  document.title = `${titulo} · Nexo`;
  pestana = elegida;
  for (const seccion of document.querySelectorAll('[data-view="clientes"] .crm-pestana')) {
    seccion.hidden = seccion.dataset.pestana !== pestana;
  }
  for (const enlace of document.querySelectorAll("#consultasMenu .segmento")) {
    if (enlace.dataset.pestana === pestana) enlace.setAttribute("aria-current", "page");
    else enlace.removeAttribute("aria-current");
  }
  // En la lista de clientes, el alta es "Nuevo cliente", la del panel.
  document.getElementById("btnNuevaConsulta").hidden = pestana === "lista";
  if (!conCrm) return;
  // "Para hoy" se carga siempre: su cuenta va en la pestaña.
  if (pestana === "lista") await refrescar([recargar("clientes"), cargarParaHoy()]);
  else if (pestana === "consultas") {
    if (consultas.length === 0) embudo.innerHTML = '<p class="embudo-cargando">Cargando consultas…</p>';
    await refrescar([cargarConsultas(), cargarParaHoy()]);
  } else if (pestana === "hoy") await cargarParaHoy();
  else if (pestana === "dejaron") await refrescar([cargarDejaron(), cargarParaHoy()]);
  else await refrescar([cargarNumeros(), cargarParaHoy()]);
}

/* ---------- Seguimiento de un cliente (modal) ---------- */

const modalSeguimiento = document.getElementById("modalSeguimiento");
const formSeguimiento = document.getElementById("formSeguimiento");
let seguimiento = null;
let tipoSeguimiento = "mensaje";

function abrirSeguimiento(cliente, { descripcion = "", alGuardar = null } = {}) {
  seguimiento = { cliente, alGuardar };
  formSeguimiento.reset();
  tipoSeguimiento = "mensaje";
  pintarTipos(document.getElementById("seguimientoTipo"), tipoSeguimiento);
  ajustarFormActividad(formSeguimiento, tipoSeguimiento);
  document.getElementById("modalSeguimientoTitulo").textContent = `Seguimiento de ${cliente.nombre}`;
  formSeguimiento.descripcion.value = descripcion;
  formSeguimiento.fecha.value = hoyISO();
  modalSeguimiento.hidden = false;
  formSeguimiento.descripcion.focus();
}

document.getElementById("seguimientoTipo").addEventListener("click", (e) => {
  const boton = e.target.closest(".segmento[data-tipo]");
  if (!boton) return;
  tipoSeguimiento = boton.dataset.tipo;
  pintarTipos(document.getElementById("seguimientoTipo"), tipoSeguimiento);
  ajustarFormActividad(formSeguimiento, tipoSeguimiento);
});
document.getElementById("modalSeguimientoClose").addEventListener("click", () => {
  modalSeguimiento.hidden = true;
});
modalSeguimiento.addEventListener("click", (e) => {
  if (e.target === modalSeguimiento) modalSeguimiento.hidden = true;
});
formSeguimiento.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!seguimiento) return;
  if (!(await anotar(formSeguimiento, tipoSeguimiento, { cliente_id: seguimiento.cliente.id }))) return;
  modalSeguimiento.hidden = true;
  avisar("Seguimiento anotado.", "ok");
  await refrescar([seguimiento.alGuardar?.(), cargarParaHoy()]);
});

/* ---------- En la ficha del cliente ---------- */

let clienteDeLaFicha = null;

async function pintarCrmDelCliente(cliente) {
  clienteDeLaFicha = cliente;
  if (!moduloActivo("crm")) return;
  const consultasEl = document.getElementById("fichaClienteConsultas");
  const lista = document.getElementById("fichaClienteSeguimiento");
  lista.innerHTML = '<li class="linea-tiempo-vacia">Cargando…</li>';
  consultasEl.innerHTML = "";
  const [suyas, actividades] = await Promise.all([
    api(`/api/crm/oportunidades?cliente_id=${cliente.id}`),
    api(`/api/crm/actividades?cliente_id=${cliente.id}`)
  ]);
  const hoy = hoyISO();
  consultasEl.innerHTML = suyas
    .map(
      (o) => `
    <button type="button" class="cliente-consulta" data-consulta="${o.id}">
      <span class="cliente-consulta-texto">${esc(o.interes ?? "Consulta")}<span class="celda-meta">${esc(fechaAR(o.fecha))} · ${esc(o.etapa)}</span></span>
      ${badgeEstado(o)}
    </button>`
    )
    .join("");
  lista.innerHTML = actividades.length
    ? actividades.map((a) => itemActividad(a, hoy)).join("")
    : `<li class="linea-tiempo-vacia">${suyas.length ? "Sin seguimiento anotado." : "Sin consultas ni seguimiento todavía."}</li>`;
}

document
  .getElementById("fichaClienteSeguimiento")
  .closest(".panel")
  .addEventListener("click", async (e) => {
    if (!clienteDeLaFicha) return;
    const consulta = e.target.closest("[data-consulta]");
    const hecha = e.target.closest("[data-hecha]");
    const borrar = e.target.closest("[data-borrar]");
    if (consulta) abrirFicha(Number(consulta.dataset.consulta));
    else if (hecha) {
      await marcarHecha(Number(hecha.dataset.hecha));
      await pintarCrmDelCliente(clienteDeLaFicha);
    } else if (borrar && (await borrarActividad(Number(borrar.dataset.borrar)))) await pintarCrmDelCliente(clienteDeLaFicha);
  });
document.getElementById("btnSeguimientoCliente").addEventListener("click", () => {
  if (clienteDeLaFicha) abrirSeguimiento(clienteDeLaFicha, { alGuardar: () => pintarCrmDelCliente(clienteDeLaFicha) });
});

/* ---------- Etapas (Configuración) ---------- */

const formEtapa = document.getElementById("formEtapaConsulta");

async function pintarEtapas() {
  tablaCargando("etapasConsultasBody", 4);
  etapas = await api("/api/crm/etapas", { error: "No se pudieron cargar las etapas." });
  document.getElementById("etapasConsultasBody").innerHTML = etapas.length
    ? etapas
        .map(
          (e, i) => `
    <tr class="${e.activa ? "" : "fila-anulada"}">
      <td data-label="Etapa">${esc(e.nombre)}</td>
      <td data-label="Abiertas" class="align-right mono">${numero(e.abiertas)}</td>
      <td data-label="Estado">${e.activa ? badge("status-cobrado", "Activa").html : badge("", "Pausada").html}</td>
      <td data-label="" class="etapa-acciones">
        <button type="button" class="btn-icon" data-subir="${e.id}" title="Subir" aria-label="Subir ${esc(e.nombre)}"${i === 0 ? " disabled" : ""}>${icono("chevron-down", "ico-arriba")}</button>
        <button type="button" class="btn-icon" data-bajar="${e.id}" title="Bajar" aria-label="Bajar ${esc(e.nombre)}"${i === etapas.length - 1 ? " disabled" : ""}>${icono("chevron-down")}</button>
        ${botonEditarFila("btn-editar-etapa", e.id, "etapa")}
        <button type="button" class="btn btn-secundario btn-chico" data-pausar="${e.id}">${e.activa ? "Pausar" : "Activar"}</button>
      </td>
    </tr>`
        )
        .join("")
    : filaVacia(4, "Tu embudo todavía no tiene etapas: sumá la primera abajo.");
}

function editarEtapa(etapa) {
  formEtapa.id.value = etapa?.id ?? "";
  formEtapa.nombre.value = etapa?.nombre ?? "";
  document.getElementById("formEtapaConsultaSubmit").textContent = etapa ? "Guardar nombre" : "Agregar etapa";
  if (etapa) formEtapa.nombre.focus();
}

document.getElementById("etapasConsultasBody").addEventListener("click", async (e) => {
  const mover = e.target.closest("[data-subir], [data-bajar]");
  const editar = e.target.closest(".btn-editar-etapa");
  const pausar = e.target.closest("[data-pausar]");
  if (mover) {
    const ids = etapas.map((x) => x.id);
    const sube = mover.dataset.subir !== undefined;
    const i = ids.indexOf(Number(sube ? mover.dataset.subir : mover.dataset.bajar));
    const j = sube ? i - 1 : i + 1;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await api("/api/crm/etapas/orden", { method: "PATCH", body: { ids }, error: "No se pudo cambiar el orden." });
    await pintarEtapas();
  } else if (editar) {
    editarEtapa(etapas.find((x) => x.id === Number(editar.dataset.id)));
  } else if (pausar) {
    const etapa = etapas.find((x) => x.id === Number(pausar.dataset.pausar));
    await api(`/api/crm/etapas/${etapa.id}`, { method: "PUT", body: { activa: !etapa.activa }, error: "No se pudo cambiar la etapa." });
    avisar(etapa.activa ? `"${etapa.nombre}" pausada: ya no se ofrece, y lo que está ahí sigue ahí.` : `"${etapa.nombre}" activa.`, "ok");
    await pintarEtapas();
  }
});

formEtapa.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = formEtapa.id.value;
  const boton = document.getElementById("formEtapaConsultaSubmit");
  boton.disabled = true;
  try {
    await api(id ? `/api/crm/etapas/${id}` : "/api/crm/etapas", {
      method: id ? "PUT" : "POST",
      body: { nombre: formEtapa.nombre.value },
      error: "No se pudo guardar la etapa."
    });
  } finally {
    boton.disabled = false;
  }
  avisar(id ? "Etapa renombrada." : "Etapa agregada al final del embudo.", "ok");
  editarEtapa(null);
  await pintarEtapas();
});

/* ---------- Registro ---------- */

alEntrarEnVista("clientes", entrarAlCrm);
registrar("cargar:consultas", cargarConsultas);
registrar("abrirFicha:consulta", (id) => abrirFicha(id));
registrar("pintar:crmDelCliente", pintarCrmDelCliente);
registrar("pintar:paraHoyResumen", pintarParaHoyResumen);
registrar("pintar:etapasConsultas", pintarEtapas);
