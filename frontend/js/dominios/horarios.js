/**
 * dominios/horarios.js
 * Horarios y fichaje (hist. §196, de Praxia): cada persona ficha su entrada y
 * su salida; el admin ve quién vino y cuánto trabajó (horas, llegadas tarde,
 * faltas y turnos de caja), corrige el fichaje que alguien se olvidó y carga
 * el horario de cada uno por día de la semana. Pantalla sobre /api/fichajes y
 * /api/horarios.
 */

import { api } from "../core/api.js";
import { avisar } from "../core/ui.js";
import { esAdmin, esc, fechaAR, hoyISO, numero } from "../core/formato.js";
import { alEntrarEnVista } from "../core/registro.js";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const botonFichar = document.getElementById("btnFichar");
const formHorario = document.getElementById("formHorario");
const botonesPeriodo = document.querySelectorAll("#horariosPeriodo .segmento");

let abierto = null;
let periodo = "hoy";
let personas = [];
let editando = null;

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
  if (esAdmin()) await pintarInforme();
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

function filaDia(d) {
  const dia = DIAS_CORTOS[(new Date(`${d.fecha}T12:00:00Z`).getUTCDay() + 6) % 7];
  const plan = d.plan.length ? d.plan.map(franjaTexto).join(" y ") : "Sin horario";
  const fichado = d.fichajes
    .map(
      (f) => `
        <span class="informe-fichaje">${esc(f.hora_entrada)} a ${esc(f.hora_salida ?? "…")}${f.corregido ? " (corregido)" : ""}
          <button type="button" class="btn-link" data-corregir="${f.id}" data-entrada="${esc(f.hora_entrada)}" data-salida="${esc(f.hora_salida ?? "")}">Corregir</button></span>`
    )
    .join(" · ");
  const marcas = [
    d.falta ? `<span class="ledger-warn">Faltó</span>` : "",
    d.tarde_min ? `<span class="ledger-warn">${esc(numero(d.tarde_min))} min tarde</span>` : "",
    d.turnos_caja ? `<span>${esc(numero(d.turnos_caja))} ${d.turnos_caja === 1 ? "turno" : "turnos"} de caja</span>` : ""
  ].join("");
  return `<div class="informe-dia"><strong>${esc(dia)} ${esc(fechaAR(d.fecha))}</strong><span>${esc(plan)}</span>${fichado}${marcas}</div>`;
}

async function pintarInforme() {
  const { desde, hasta } = rango();
  const informe = await api(`/api/fichajes/informe?desde=${desde}&hasta=${hasta}`, { error: "No se pudo armar el informe." });
  document.getElementById("informeHorariosNota").textContent =
    desde === hasta ? `Hoy, ${fechaAR(desde)}.` : `Del ${fechaAR(desde)} al ${fechaAR(hasta)}.`;
  document.getElementById("informeHorarios").innerHTML = informe.personas
    .map((p) => {
      const resumen = [
        `${horas(p.minutos_trabajados)} trabajadas${p.minutos_planificados ? ` de ${horas(p.minutos_planificados)}` : ""}`,
        p.llegadas_tarde ? `${numero(p.llegadas_tarde)} ${p.llegadas_tarde === 1 ? "llegada tarde" : "llegadas tarde"} (${numero(p.minutos_tarde)} min)` : "",
        p.faltas ? `${numero(p.faltas)} ${p.faltas === 1 ? "falta" : "faltas"}` : "",
        p.tiene_horario ? "" : "sin horario cargado"
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

/* ---------- Horarios (admin) ---------- */

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

async function pintarHorarios() {
  personas = await api("/api/horarios", { error: "No se pudieron cargar los horarios." });
  document.getElementById("horariosPersonas").innerHTML = personas
    .map(
      (p) => `
      <li>
        <span class="horario-quien">${esc(p.nombre)}<small>${esc(resumenHorario(p.franjas))}</small></span>
        <button type="button" class="btn btn-secundario btn-chico" data-editar="${p.id}">Cargar horario</button>
      </li>`
    )
    .join("");
}

document.getElementById("horariosPersonas").addEventListener("click", (e) => {
  const boton = e.target.closest("[data-editar]");
  if (!boton) return;
  editando = personas.find((p) => p.id === Number(boton.dataset.editar));
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
});

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
  await Promise.all([pintarHorarios(), pintarInforme()]);
});

alEntrarEnVista("horarios", async () => {
  formHorario.hidden = true;
  await Promise.all([pintarFichar(), ...(esAdmin() ? [pintarInforme(), pintarHorarios()] : [])]);
});
