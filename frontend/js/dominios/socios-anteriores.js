/**
 * dominios/socios-anteriores.js
 * "Lo que ya tenías" › Tus socios (hist. §227): los socios que ya venían
 * antes de Nexo, cargados uno atrás del otro, para un gimnasio que tenía todo
 * anotado a mano. Cada uno con su plan, desde cuándo viene y su próxima
 * cuota (como Clubworx y GymMaster: "start date" y "next payment date"):
 * - si la próxima cuota es más adelante, queda al día hasta el día anterior;
 * - si ya pasó, Nexo le arma las cuotas que debe desde ahí, al precio de hoy;
 * - "Además debe" es lo de antes que no son esas cuotas, en su cuenta corriente.
 * Es el alta de siempre (POST /api/socios) con proxima_cuota y deuda_anterior.
 * Solo admin.
 */

import { api } from "../core/api.js";
import { limpiarError, limpiarErrores, marcarError } from "../core/campos.js";
import { avisar } from "../core/ui.js";
import { esc, fechaAR, hoyISO, money, numero } from "../core/formato.js";
import { icono } from "../core/iconos.js";
import { recargar, registrar } from "../core/registro.js";

const form = document.getElementById("formSociosAnt");
const cajaPlanes = document.getElementById("saPlanes");
const resumen = document.getElementById("saResumen");
const lista = document.getElementById("saLista");
let planes = [];

// Las mismas cuentas de fechas que el servidor (sumarMeses en server.js): si
// el mes no tiene el día, el último del mes.
function sumarMeses(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m + n, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + n, Math.min(d, ultimo))).toISOString().slice(0, 10);
}

function sumarDias(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const opcionesActivas = (plan) => plan.opciones.filter((o) => o.activo);
const planesOfrecidos = () => planes.filter((p) => p.activo && opcionesActivas(p).length);

/* ---------- Los planes ---------- */

// Las mismas tarjetas del alta de socio (dominios/socios.js): la casilla del
// plan y, al marcarla, sus duraciones.
function pintarPlanes() {
  const ofrecidos = planesOfrecidos();
  if (!ofrecidos.length) {
    cajaPlanes.innerHTML = `<p class="opciones-cargando">Todavía no hay planes. <a class="btn-link" href="#/planes-socio">Creá el primero</a> y volvé.</p>`;
    return;
  }
  cajaPlanes.innerHTML = ofrecidos
    .map((p) => {
      const chips = opcionesActivas(p)
        .map(
          (o, i) => `
        <label class="duracion-chip">
          <input type="radio" name="opcion-${p.id}" value="${o.id}"${i === 0 ? " checked" : ""} />
          <span class="duracion-chip-nombre">${esc(o.duracion)}</span>
          <span class="duracion-chip-precio mono">${money(o.precio)}</span>
        </label>`
        )
        .join("");
      return `
      <div class="plan-elegir">
        <label class="plan-elegir-cabeza">
          <input type="checkbox" name="plan" value="${p.id}"${ofrecidos.length === 1 ? " checked" : ""} />
          <span class="plan-elegir-icono">${icono("calendar-clock")}</span>
          <span class="plan-elegir-texto"><span class="plan-elegir-nombre">${esc(p.nombre)}</span></span>
          <span class="opcion-tarjeta-check">${icono("check")}</span>
        </label>
        <div class="plan-elegir-duraciones" role="radiogroup" aria-label="Duración de ${esc(p.nombre)}">${chips}</div>
      </div>`;
    })
    .join("");
}

function elegidos() {
  return [...cajaPlanes.querySelectorAll('input[name="plan"]:checked')]
    .map((casilla) => {
      const plan = planes.find((p) => p.id === Number(casilla.value));
      const opcionId = Number(cajaPlanes.querySelector(`input[name="opcion-${plan.id}"]:checked`)?.value);
      return { plan, opcion: plan.opciones.find((o) => o.id === opcionId) };
    })
    .filter((e) => e.opcion);
}

/* ---------- Lo que va a pasar ---------- */

// Dicho antes de agregar: hasta cuándo queda al día o cuántas cuotas debe.
function pintarResumen() {
  const alta = form.fecha_alta.value;
  const proxima = form.proxima_cuota.value;
  const hoy = hoyISO();
  const planesElegidos = elegidos();
  let texto;
  if (!planesElegidos.length) texto = "Elegí qué plan hace.";
  else if (!alta) texto = "Poné desde cuándo es socio.";
  else if (!proxima) texto = "Poné cuándo le toca pagar la próxima cuota.";
  else if (proxima < alta) texto = "La próxima cuota no puede ser antes de que empezara.";
  else {
    const dia = Number(proxima.slice(8));
    const vence = `La cuota le vence el día ${dia}${dia > 28 ? " (o el último del mes)" : ""} de cada período.`;
    if (proxima > hoy) {
      texto = `${proxima > alta ? `Al día hasta el ${fechaAR(sumarDias(proxima, -1))}. ` : ""}${vence}`;
    } else {
      // Las que debe: los períodos que empezaron desde su próxima cuota hasta hoy.
      let cuotas = 0;
      for (const { opcion } of planesElegidos) {
        let n = 0;
        while (n < 400 && sumarMeses(proxima, n * opcion.meses) <= hoy) n += 1;
        cuotas = Math.max(cuotas, n);
      }
      texto =
        (cuotas === 1
          ? `Debe la cuota del ${fechaAR(proxima)}: Nexo se la arma al precio de hoy. `
          : `Debe ${numero(cuotas)} cuotas desde el ${fechaAR(proxima)}: Nexo se las arma al precio de hoy. `) + vence;
    }
  }
  resumen.textContent = texto;
}

cajaPlanes.addEventListener("change", () => {
  limpiarError(cajaPlanes);
  pintarResumen();
});
for (const nombre of ["fecha_alta", "proxima_cuota"]) form[nombre].addEventListener("input", pintarResumen);

/* ---------- Los que ya cargaste ---------- */

function situacion(s) {
  if (s.situacion === "debe") return `<span class="status status-vencido">Debe ${esc(money(s.deuda))}</span>`;
  if (s.situacion === "al_dia") return `<span class="status status-cobrado">Al día hasta el ${esc(fechaAR(s.al_dia_hasta))}</span>`;
  if (s.situacion === "baja") return '<span class="status">De baja</span>';
  return `<span class="status">Empieza el ${esc(fechaAR(s.empieza))}</span>`;
}

async function pintarLista() {
  const socios = await api("/api/socios", { error: "No se pudieron cargar los socios." });
  lista.innerHTML = socios.length
    ? [...socios]
        .reverse()
        .map((s) => {
          const nombres = s.planes.filter((p) => p.estado === "activa").map((p) => p.plan);
          return `
      <li class="ci-saldo">
        <div class="ci-saldo-texto">
          <strong>N° ${esc(numero(s.numero))} · ${esc(s.nombre)}</strong>
          <span>${esc(nombres.join(", ") || "Sin planes")} · socio desde el ${esc(fechaAR(s.fecha_alta))}</span>
        </div>
        ${situacion(s)}
      </li>`;
        })
        .join("")
    : '<li class="ci-vacio">Todavía no cargaste ningún socio.</li>';
}

/* ---------- Agregar ---------- */

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  limpiarErrores(form);
  const nombre = form.nombre.value.trim();
  const planesElegidos = elegidos();
  const alta = form.fecha_alta.value;
  const proxima = form.proxima_cuota.value;
  const deuda = form.deuda_anterior.value.trim() === "" ? null : Number(form.deuda_anterior.value);
  if (!nombre) {
    marcarError(form.nombre, "Escribí el nombre y apellido.");
    return form.nombre.focus();
  }
  if (!planesElegidos.length) return marcarError(cajaPlanes, "Elegí qué plan hace.");
  if (!alta || alta > hoyISO()) {
    marcarError(form.fecha_alta, "Poné desde cuándo viene: hoy o antes.");
    return form.fecha_alta.focus();
  }
  if (!proxima || proxima < alta) {
    marcarError(form.proxima_cuota, proxima ? "No puede ser antes de que empezara." : "Poné cuándo le toca pagar.");
    return form.proxima_cuota.focus();
  }
  if (deuda !== null && !(deuda >= 0)) {
    marcarError(form.deuda_anterior, "Escribí cuánto debe, en pesos.");
    return form.deuda_anterior.focus();
  }
  const boton = form.querySelector('button[type="submit"]');
  boton.disabled = true;
  let socio;
  try {
    socio = await api("/api/socios", {
      method: "POST",
      body: {
        cliente: { nombre, documento: form.documento.value.trim() || null, telefono: form.telefono.value.trim() || null },
        planes: planesElegidos.map((p) => ({ opcion_id: p.opcion.id })),
        fecha_alta: alta,
        proxima_cuota: proxima,
        deuda_anterior: deuda
      },
      error: "No se pudo cargar el socio."
    });
  } catch {
    return;
  } finally {
    boton.disabled = false;
  }
  avisar(`${socio.nombre} quedó como socio N° ${socio.numero}.`, "ok");
  // El plan y la próxima cuota quedan: casi siempre se repiten.
  for (const nombreCampo of ["nombre", "documento", "telefono", "fecha_alta", "deuda_anterior"]) form[nombreCampo].value = "";
  pintarResumen();
  form.nombre.focus();
  await pintarLista();
  recargar("socios", "cuentasCorrientes", "clientes", "ventas").catch(() => {});
});

/* ---------- Entrada desde Configuración ---------- */

registrar("pintar:socios-anteriores", async () => {
  form.reset();
  limpiarErrores(form);
  form.fecha_alta.max = hoyISO();
  cajaPlanes.innerHTML = `<p class="opciones-cargando">Cargando planes…</p>`;
  planes = await api("/api/planes-socio", { error: "No se pudieron cargar los planes." });
  pintarPlanes();
  pintarResumen();
  await pintarLista();
});
