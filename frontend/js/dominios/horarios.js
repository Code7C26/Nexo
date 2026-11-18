/**
 * dominios/horarios.js
 * Empleados, horarios y fichaje (hist. §196, §199, de Praxia). Quien tiene
 * cuenta ficha su entrada y su salida acá; el cajero sin cuenta ficha con su
 * PIN en la compu de la caja (dominios/pos.js). El admin carga los empleados
 * (nombre, PIN, sucursal, si es encargado y su cuenta, si tiene), el horario
 * de cada uno por día de la semana, ve quién vino y cuánto trabajó (horas,
 * llegadas tarde, faltas, los turnos que cumplió y los de caja) y corrige el
 * fichaje que alguien se olvidó. Pantalla sobre /api/fichajes, /api/horarios y
 * /api/empleados.
 */

import { api } from "../core/api.js";
import { avisar, confirmar } from "../core/ui.js";
import { esAdmin, esc, fechaAR, hoyISO, numero } from "../core/formato.js";
import { alEntrarEnVista } from "../core/registro.js";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const botonFichar = document.getElementById("btnFichar");
const formHorario = document.getElementById("formHorario");
const formEmpleado = document.getElementById("formEmpleado");
const botonesPeriodo = document.querySelectorAll("#horariosPeriodo .segmento");

let abierto = null;
let periodo = "hoy";
let empleados = [];
let horarios = [];
let editando = null;
let editandoEmpleado = null;

const franjaTexto = (f) => `${f.desde} a ${f.hasta}`;
// "4 h 30 min", "45 min".
function horas(minutos) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/* ---------- Fichar ---------- */

async function pintarFichar() {
  const mio = await api("/api/fichajes/mio", { error: "No se pudo cargar tu turno." });
  abierto = mio.abierto;
  document.getElementById("ficharEstado").textContent = abierto ? `Estás adentro desde las ${abierto.hora_entrada}.` : "No fichaste la entrada.";
  document.getElementById("ficharHorario").textContent = mio.horario_hoy.length
    ? `Hoy te toca de ${mio.horario_hoy.map(franjaTexto).join(" y de ")}.`
    : "Hoy no tenés horario cargado.";
  botonFichar.textContent = abierto ? "Fichar la salida" : "Fichar la entrada";
  document.getElementById("ficharHoy").innerHTML = mio.hoy
    .map((f) => `<li>Entraste a las ${esc(f.hora_entrada)}${f.hora_salida ? ` y saliste a las ${esc(f.hora_salida)}` : ""}.</li>`)
    .join("");
}

botonFichar.addEventListener("click", async () => {
  botonFichar.disabled = true;
  try {
    const f = await api(abierto ? "/api/fichajes/salida" : "/api/fichajes", { method: "POST", error: "No se pudo fichar." });
    avisar(f.hora_salida ? `Salida fichada a las ${f.hora_salida}.` : `Entrada fichada a las ${f.hora_entrada}.`, "ok");
  } finally {
    botonFichar.disabled = false;
  }
  await pintarFichar();
  if (esAdmin()) await Promise.all([pintarInforme(), pintarEmpleados()]);
});

/* ---------- Informe (admin) ---------- */

function rango() {
  const hoy = hoyISO();
  if (periodo === "mes") return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy };
  if (periodo === "semana") {
    const fecha = new Date(`${hoy}T12:00:00Z`);
    fecha.setUTCDate(fecha.getUTCDate() - ((fecha.getUTCDay() + 6) % 7));
    return { desde: fecha.toISOString().slice(0, 10), hasta: hoy };
  }
  return { desde: hoy, hasta: hoy };
}

// Cada turno (franja del horario) con lo que pasó, para saber si se paga
// entero (hist. §199).
function marcaTurno(t) {
  const franja = franjaTexto(t);
  if (t.estado === "cumplido") return `<span class="ledger-ok">${esc(franja)}: cumplido</span>`;
  if (t.estado === "falto") return `<span class="ledger-warn">${esc(franja)}: faltó</span>`;
  if (t.estado === "en_curso") {
    return `<span>${esc(franja)}: adentro${t.tarde_min ? `, entró ${esc(numero(t.tarde_min))} min tarde` : ""}</span>`;
  }
  if (t.estado === "sin_salida") return `<span class="ledger-warn">${esc(franja)}: no fichó la salida</span>`;
  if (t.estado === "por_venir") return `<span>${esc(franja)}: todavía no empezó</span>`;
  const que = [t.tarde_min ? `entró ${numero(t.tarde_min)} min tarde` : "", t.antes_min ? `se fue ${numero(t.antes_min)} min antes` : ""].filter(Boolean);
  return `<span class="ledger-warn">${esc(franja)}: ${esc(que.join(" y "))}</span>`;
}

function filaDia(d) {
  const dia = DIAS_CORTOS[(new Date(`${d.fecha}T12:00:00Z`).getUTCDay() + 6) % 7];
  const fichado = d.fichajes
    .map(
      (f) => `
        <span class="informe-fichaje">${esc(f.hora_entrada)} a ${esc(f.hora_salida ?? "…")}${f.corregido ? " (corregido)" : ""}
          <button type="button" class="btn-link" data-corregir="${f.id}" data-entrada="${esc(f.hora_entrada)}" data-salida="${esc(f.hora_salida ?? "")}">Corregir</button></span>`
    )
    .join(" · ");
  const marcas = [
    d.plan.length ? d.turnos.map(marcaTurno).join("") : "<span>Sin horario</span>",
    d.turnos_caja ? `<span>${esc(numero(d.turnos_caja))} ${d.turnos_caja === 1 ? "turno" : "turnos"} de caja</span>` : ""
  ].join("");
  return `<div class="informe-dia"><strong>${esc(dia)} ${esc(fechaAR(d.fecha))}</strong>${marcas}${fichado}</div>`;
}

async function pintarInforme() {
  const { desde, hasta } = rango();
  const informe = await api(`/api/fichajes/informe?desde=${desde}&hasta=${hasta}`, { error: "No se pudo armar el informe." });
  document.getElementById("informeHorariosNota").textContent =
    desde === hasta ? `Hoy, ${fechaAR(desde)}.` : `Del ${fechaAR(desde)} al ${fechaAR(hasta)}.`;
  if (!informe.personas.length) {
    document.getElementById("informeHorarios").innerHTML = `<p class="nota-plana">Todavía no hay empleados. Sumalos abajo, en Los empleados.</p>`;
    return;
  }
  document.getElementById("informeHorarios").innerHTML = informe.personas
    .map((p) => {
      const t = p.turnos;
      const resumen = [
        t.planificados ? `${numero(t.cumplidos)} de ${numero(t.planificados)} ${t.planificados === 1 ? "turno cumplido" : "turnos cumplidos"}` : "",
        `${horas(p.minutos_trabajados)} trabajadas${p.minutos_planificados ? ` de ${horas(p.minutos_planificados)}` : ""}`,
        p.llegadas_tarde ? `${numero(p.llegadas_tarde)} ${p.llegadas_tarde === 1 ? "llegada tarde" : "llegadas tarde"} (${numero(p.minutos_tarde)} min)` : "",
        p.faltas ? `${numero(p.faltas)} ${p.faltas === 1 ? "falta" : "faltas"}` : "",
        t.sin_salida ? `${numero(t.sin_salida)} sin fichar la salida` : "",
        p.tiene_horario ? "" : "sin horario cargado",
        p.activo ? "" : "dado de baja"
      ].filter(Boolean);
      const dias = p.dias.filter((d) => d.plan.length || d.fichajes.length);
      return `
        <details class="informe-persona" ${periodo === "hoy" ? "open" : ""}>
          <summary><strong>${esc(p.nombre)}</strong><span>${esc(resumen.join(" · "))}</span></summary>
          ${dias.length ? dias.map(filaDia).join("") : `<p class="nota-plana">No tuvo horario ni fichó en este período.</p>`}
        </details>`;
    })
    .join("");
}

for (const boton of botonesPeriodo) {
  boton.addEventListener("click", () => {
    periodo = boton.dataset.periodo;
    for (const b of botonesPeriodo) b.setAttribute("aria-pressed", String(b === boton));
    pintarInforme();
  });
}

// Corregir un fichaje: la entrada y la salida en el mismo lugar.
document.getElementById("informeHorarios").addEventListener("click", async (e) => {
  const corregir = e.target.closest("[data-corregir]");
  const guardar = e.target.closest("[data-guardar]");
  if (corregir) {
    corregir.closest(".informe-fichaje").outerHTML = `
      <span class="informe-corregir" data-fichaje="${Number(corregir.dataset.corregir)}">
        <input type="time" aria-label="Entrada" value="${esc(corregir.dataset.entrada)}" />
        <input type="time" aria-label="Salida" value="${esc(corregir.dataset.salida)}" />
        <button type="button" class="btn btn-primary btn-chico" data-guardar>Guardar</button>
      </span>`;
  } else if (guardar) {
    const caja = guardar.closest(".informe-corregir");
    const [entrada, salida] = [...caja.querySelectorAll("input")].map((i) => i.value);
    await api(`/api/fichajes/${caja.dataset.fichaje}`, {
      method: "PATCH",
      body: { entrada, salida },
      error: "No se pudo corregir el fichaje."
    });
    avisar("Fichaje corregido.", "ok");
    await pintarInforme();
  }
});

/* ---------- Los empleados y su horario (admin) ---------- */

// "Lun a Vie 09:00 a 17:00 · Sáb 09:00 a 13:00": los días seguidos con el
// mismo horario, juntos.
function resumenHorario(franjas) {
  if (!franjas.length) return "Sin horario cargado";
  const porDia = DIAS.map((_, dia) =>
    franjas
      .filter((f) => f.dia_semana === dia)
      .map(franjaTexto)
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

async function pintarEmpleados() {
  [empleados, horarios] = await Promise.all([
    api("/api/empleados", { error: "No se pudieron cargar los empleados." }),
    api("/api/horarios", { error: "No se pudieron cargar los horarios." })
  ]);
  const activos = empleados.filter((e) => e.activo);
  const lista = document.getElementById("horariosPersonas");
  if (!activos.length) {
    lista.innerHTML = `<li class="nota-plana">Todavía no sumaste a nadie.</li>`;
    return;
  }
  lista.innerHTML = activos
    .map((e) => {
      const franjas = horarios.find((h) => h.id === e.id)?.franjas ?? [];
      const datos = [
        e.tiene_pin ? "con PIN" : "sin PIN",
        e.encargado ? "encargado" : "",
        e.sucursal ? `en ${e.sucursal}` : "",
        e.cuenta_email ? `cuenta ${e.cuenta_email}` : "",
        e.adentro ? "adentro ahora" : ""
      ].filter(Boolean);
      return `
      <li>
        <span class="horario-quien">${esc(e.nombre)}<small>${esc(datos.join(" · "))}</small><small>${esc(resumenHorario(franjas))}</small></span>
        <button type="button" class="btn btn-secundario btn-chico" data-horario="${e.id}">Horario</button>
        <button type="button" class="btn btn-secundario btn-chico" data-empleado="${e.id}">Editar</button>
      </li>`;
    })
    .join("");
}

document.getElementById("horariosPersonas").addEventListener("click", (e) => {
  const horario = e.target.closest("[data-horario]");
  const empleado = e.target.closest("[data-empleado]");
  if (horario) abrirHorario(Number(horario.dataset.horario));
  if (empleado) abrirEmpleado(empleados.find((x) => x.id === Number(empleado.dataset.empleado)));
});

function abrirHorario(id) {
  formEmpleado.hidden = true;
  const empleado = empleados.find((x) => x.id === id);
  editando = { id, nombre: empleado.nombre, franjas: horarios.find((h) => h.id === id)?.franjas ?? [] };
  document.getElementById("horarioFormTitulo").textContent = `El horario de ${editando.nombre}`;
  document.getElementById("horarioDias").innerHTML = DIAS.map((nombre, dia) => {
    const [a, b] = editando.franjas.filter((f) => f.dia_semana === dia);
    const valores = [a?.desde, a?.hasta, b?.desde, b?.hasta];
    const campos = ["entra", "sale", "vuelve", "sale de nuevo"]
      .map((etiqueta, i) => `<input type="time" aria-label="${esc(`${nombre}: ${etiqueta}`)}" value="${esc(valores[i] ?? "")}" />`)
      .join("");
    return `
      <div class="horario-dia" data-dia="${dia}">
        <span>${esc(nombre)}</span>
        ${campos}
      </div>`;
  }).join("");
  formHorario.hidden = false;
  formHorario.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

document.getElementById("btnHorarioCancelar").addEventListener("click", () => {
  formHorario.hidden = true;
});

formHorario.addEventListener("submit", async (e) => {
  e.preventDefault();
  const franjas = [];
  for (const fila of formHorario.querySelectorAll(".horario-dia")) {
    const [d1, h1, d2, h2] = [...fila.querySelectorAll("input")].map((i) => i.value);
    for (const [desde, hasta] of [
      [d1, h1],
      [d2, h2]
    ]) {
      if (!desde && !hasta) continue;
      if (!desde || !hasta) {
        avisar(`${DIAS[Number(fila.dataset.dia)]}: falta la hora de entrada o la de salida.`, "atencion");
        return;
      }
      franjas.push({ dia_semana: Number(fila.dataset.dia), desde, hasta });
    }
  }
  const boton = document.getElementById("formHorarioSubmit");
  boton.disabled = true;
  try {
    await api(`/api/horarios/${editando.id}`, { method: "PUT", body: { franjas }, error: "No se pudo guardar el horario." });
  } finally {
    boton.disabled = false;
  }
  avisar(`Horario de ${editando.nombre} guardado.`, "ok");
  formHorario.hidden = true;
  await Promise.all([pintarEmpleados(), pintarInforme()]);
});

// El alta o la edición de un empleado. Las sucursales y las cuentas del
// negocio se piden al abrir: cambian poco, pero cambian.
async function abrirEmpleado(empleado = null) {
  formHorario.hidden = true;
  editandoEmpleado = empleado;
  const [sucursales, usuarios] = await Promise.all([
    api("/api/sucursales", { error: "No se pudieron cargar las sucursales." }),
    api("/api/usuarios", { error: "No se pudieron cargar las cuentas." })
  ]);
  const form = formEmpleado;
  form.reset();
  document.getElementById("empleadoFormTitulo").textContent = empleado ? `Editar a ${empleado.nombre}` : "Sumar empleado";
  document.getElementById("empleadoPinEtiqueta").textContent = empleado?.tiene_pin ? "PIN nuevo (vacío: sigue el de ahora)" : "PIN para la caja";
  document.getElementById("btnEmpleadoBaja").hidden = !empleado;
  // Sin sucursales no hay qué elegir: trabaja en todas.
  document.getElementById("empleadoSucursalCampo").hidden = !sucursales.length;
  form.sucursal_id.innerHTML =
    `<option value="">En todas</option>` + sucursales.map((s) => `<option value="${s.id}">${esc(s.nombre)}</option>`).join("");
  // Las cuentas activas que no son de otro empleado.
  const tomadas = new Set(empleados.filter((e) => e.usuario_id && e.id !== empleado?.id).map((e) => e.usuario_id));
  form.usuario_id.innerHTML =
    `<option value="">Sin cuenta</option>` +
    usuarios
      .filter((u) => u.activo && !tomadas.has(u.id))
      .map((u) => `<option value="${u.id}">${esc(u.nombre)}${u.email ? ` (${esc(u.email)})` : ""}</option>`)
      .join("");
  if (empleado) {
    form.nombre.value = empleado.nombre;
    form.sucursal_id.value = empleado.sucursal_id ?? "";
    form.usuario_id.value = empleado.usuario_id ?? "";
    form.encargado.checked = empleado.encargado;
  }
  form.hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "nearest" });
  form.nombre.focus();
}

document.getElementById("btnEmpleadoNuevo").addEventListener("click", () => abrirEmpleado());
document.getElementById("btnEmpleadoCancelar").addEventListener("click", () => {
  formEmpleado.hidden = true;
});

formEmpleado.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = formEmpleado;
  const nombre = form.nombre.value.trim();
  const pin = form.pin.value.trim();
  if (!nombre) {
    avisar("Escribí el nombre.", "atencion");
    return;
  }
  if (pin && !/^\d{4,6}$/.test(pin)) {
    avisar("El PIN va de 4 a 6 números.", "atencion");
    return;
  }
  const body = {
    nombre,
    sucursal_id: form.sucursal_id.value || null,
    usuario_id: form.usuario_id.value || null,
    encargado: form.encargado.checked,
    // En una edición, sin PIN escrito queda el de antes.
    ...(pin ? { pin } : {})
  };
  const boton = document.getElementById("formEmpleadoSubmit");
  boton.disabled = true;
  try {
    await api(editandoEmpleado ? `/api/empleados/${editandoEmpleado.id}` : "/api/empleados", {
      method: editandoEmpleado ? "PATCH" : "POST",
      body,
      error: "No se pudo guardar el empleado."
    });
  } finally {
    boton.disabled = false;
  }
  avisar(editandoEmpleado ? `${nombre}: guardado.` : `${nombre} ya es parte del equipo.`, "ok");
  form.hidden = true;
  await Promise.all([pintarEmpleados(), pintarInforme()]);
});

document.getElementById("btnEmpleadoBaja").addEventListener("click", async () => {
  const empleado = editandoEmpleado;
  const ok = await confirmar({
    titulo: `¿Dar de baja a ${empleado.nombre}?`,
    cuerpo: "Deja de aparecer en la caja y en los horarios. Lo que hizo y lo que fichó quedan.",
    aceptar: "Dar de baja",
    destructivo: true
  });
  if (!ok) return;
  await api(`/api/empleados/${empleado.id}`, { method: "PATCH", body: { activo: false }, error: "No se pudo dar de baja." });
  avisar(`${empleado.nombre} quedó dado de baja.`, "ok");
  formEmpleado.hidden = true;
  await Promise.all([pintarEmpleados(), pintarInforme()]);
});

alEntrarEnVista("horarios", async () => {
  formHorario.hidden = true;
  formEmpleado.hidden = true;
  await Promise.all([pintarFichar(), ...(esAdmin() ? [pintarInforme(), pintarEmpleados()] : [])]);
});
