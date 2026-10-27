/**
 * dominios/plan.js
 * Plan de Nexo (hist. §99): la página de Configuración con el plan del negocio,
 * cuánto usa de cada tope y cómo pedir otro. Los datos llegan en
 * GET /api/negocio (`plan` y `planes`), los mismos que lee el comprobante para
 * la marca "Hecho con Nexo".
 *
 * Pedir un plan no lo cambia: manda la consulta al CRM con el que se vende Nexo
 * (POST /api/publico/consulta, la misma de la landing) y el plan lo activa
 * quien vende Nexo, en el servidor (npm run plan, hist. §98). Así ningún
 * negocio se pasa a Pro por su cuenta.
 */

import { negocio } from "../core/negocio.js";
import { esAdmin, esc, fechaAR, money, numero } from "../core/formato.js";
import { icono } from "../core/iconos.js";
import { api } from "../core/api.js";
import { avisar } from "../core/ui.js";
import { alEntrarEnVista, recargar, registrar } from "../core/registro.js";

const NOMBRE_USO = {
  productos: "Productos y servicios activos",
  ventas_mes: "Ventas de este mes",
  usuarios: "Usuarios"
};

const actualEl = document.getElementById("planActual");
const grillaEl = document.getElementById("planesGrilla");
const form = document.getElementById("formPedirPlan");
const campoContacto = document.getElementById("planPedidoContacto");
const campoMensaje = document.getElementById("planPedidoMensaje");
const whatsapp = document.getElementById("planPedidoWhatsapp");
let planPedido = null;

const precio = (p) => (p.precio === 0 ? "Sin costo" : `${esc(money(p.precio))}<span class="plan-precio-mes"> por mes</span>`);

// El estado del plan en una línea: hasta cuándo es la prueba, o por qué está
// en Gratis si la prueba terminó.
function estadoDelPlan(plan) {
  if (plan.vencido) {
    return `Tu plan ${esc(plan.vencido.nombre)} terminó el ${esc(fechaAR(plan.vencido.vencio))}: seguís en Gratis, con todo lo que cargaste.`;
  }
  if (plan.vence) {
    const dias = plan.dias_restantes;
    const cuando = dias === 0 ? "termina hoy" : dias === 1 ? "queda 1 día" : `quedan ${numero(dias)} días`;
    return `Hasta el ${esc(fechaAR(plan.vence))}: ${esc(cuando)}.`;
  }
  return plan.precio === 0 ? "Sin costo y sin vencimiento." : "Activo, sin vencimiento.";
}

function barraDeUso(recurso, { usados, tope }) {
  if (tope === null) {
    return `
      <div class="plan-uso">
        <div class="plan-uso-fila"><span>${esc(NOMBRE_USO[recurso])}</span><span>${esc(numero(usados))} · sin tope</span></div>
      </div>`;
  }
  const parte = Math.min(usados / tope, 1);
  // Los usuarios llenos son lo normal (Gratis es de una persona): sin color.
  const nivel = recurso === "usuarios" ? "" : parte >= 1 ? " is-lleno" : parte >= 0.8 ? " is-cerca" : "";
  return `
    <div class="plan-uso${nivel}">
      <div class="plan-uso-fila"><span>${esc(NOMBRE_USO[recurso])}</span><span>${esc(numero(usados))} de ${esc(numero(tope))}</span></div>
      <div class="plan-uso-barra" role="progressbar" aria-label="${esc(NOMBRE_USO[recurso])}" aria-valuemin="0" aria-valuemax="${esc(tope)}" aria-valuenow="${esc(Math.min(usados, tope))}">
        <span style="width: ${esc(Math.round(parte * 100))}%"></span>
      </div>
    </div>`;
}

function tarjetaDePlan(p, actual) {
  const esActual = p.clave === actual;
  const lista = (items, clase) =>
    items.map((i) => `<li class="${clase}">${icono(clase === "plan-pronto" ? "calendar-clock" : "check")}<span>${esc(i)}</span></li>`).join("");
  // Cada renglón ya pasó por esc() adentro de lista().
  const incluye = lista(p.incluye, "plan-si");
  const pronto = lista(p.muy_pronto.map((t) => `${t} (muy pronto)`), "plan-pronto");
  return `
    <article class="plan-tarjeta${esActual ? " is-actual" : ""}">
      <header>
        <h3>${esc(p.nombre)}${esActual ? ' <span class="status status-info">Tu plan</span>' : ""}</h3>
        <p class="plan-precio">${precio(p)}</p>
        <p class="plan-desc">${esc(p.descripcion)}</p>
      </header>
      <ul class="plan-incluye">
        ${incluye}
        ${pronto}
      </ul>
      ${esActual || p.precio === 0 ? "" : `<button type="button" class="btn btn-secundario btn-full" data-pedir="${esc(p.clave)}" aria-label="Quiero el plan ${esc(p.nombre)}">Quiero este plan</button>`}
    </article>`;
}

async function pintarPlan() {
  // Fresco al entrar: el uso cambia con cada venta.
  await recargar("negocio");
  const { plan, planes } = negocio;
  if (!plan || !planes) return;
  actualEl.innerHTML = `
    <div class="config-tarjeta-cuerpo">
      <div class="plan-actual-head">
        <div>
          <p class="plan-actual-etiqueta">Tu plan</p>
          <p class="plan-actual-nombre">${esc(plan.nombre)}</p>
        </div>
        ${plan.precio > 0 ? `<p class="plan-precio">${precio(plan)}</p>` : ""}
      </div>
      <p class="plan-actual-estado">${estadoDelPlan(plan)}</p>
      ${Object.entries(plan.uso)
        .map(([recurso, uso]) => barraDeUso(recurso, uso))
        .join("")}
    </div>`;
  grillaEl.innerHTML = planes.planes.map((p) => tarjetaDePlan(p, plan.clave)).join("");
  document.getElementById("configPlanResumen").textContent = `Estás en ${plan.nombre}`;
  form.hidden = true;
}
registrar("pintar:plan", pintarPlan);

/* ---------- Aviso en el Resumen ---------- */

// Al admin, cuando la prueba termina en 3 días o menos, o cuando los productos
// o las ventas pasaron el 80% de su tope: que no se entere el día que una
// venta no entra. Los usuarios no avisan: Gratis es de una persona y está
// siempre "lleno". Sin aviso,
// el Resumen queda como siempre.
const avisoEl = document.getElementById("avisoPlan");

function textoDelAviso(plan) {
  if (plan.vence && plan.dias_restantes <= 3) {
    const cuando = plan.dias_restantes === 0 ? "hoy" : plan.dias_restantes === 1 ? "mañana" : `en ${plan.dias_restantes} días`;
    return `Tu prueba del plan ${plan.nombre} termina ${cuando}. Después seguís en Gratis, con todo lo que cargaste.`;
  }
  const [recurso, uso] =
    Object.entries(plan.uso).find(([r, u]) => r !== "usuarios" && u.tope !== null && u.usados >= u.tope * 0.8) ?? [];
  if (!recurso) return null;
  const nombre = NOMBRE_USO[recurso].toLowerCase();
  return uso.usados >= uso.tope
    ? `Llegaste al tope de tu plan: ${uso.tope} de ${uso.tope} ${nombre}.`
    : `Vas por ${uso.usados} de ${uso.tope} ${nombre} de tu plan.`;
}

alEntrarEnVista("dashboard", async () => {
  avisoEl.hidden = true;
  if (!esAdmin()) return;
  await recargar("negocio");
  const texto = negocio.plan && textoDelAviso(negocio.plan);
  if (!texto) return;
  avisoEl.innerHTML = `${icono("gem")}<p>${esc(texto)}</p><a class="btn btn-secundario" href="#/configuracion/plan">Ver los planes</a>`;
  avisoEl.hidden = false;
});

grillaEl.addEventListener("click", (e) => {
  const boton = e.target.closest("[data-pedir]");
  if (!boton) return;
  planPedido = negocio.planes.planes.find((p) => p.clave === boton.dataset.pedir);
  document.getElementById("planPedidoTitulo").textContent = `Pedir el plan ${planPedido.nombre}`;
  campoContacto.value ||= negocio.telefono || negocio.email || "";
  const numeroWhatsapp = negocio.planes.contacto?.whatsapp;
  whatsapp.hidden = !numeroWhatsapp;
  if (numeroWhatsapp) {
    const texto = `Hola, quiero el plan ${planPedido.nombre} de Nexo para "${negocio.nombre}".`;
    whatsapp.href = `https://wa.me/${numeroWhatsapp}?text=${encodeURIComponent(texto)}`;
  }
  form.hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "nearest" });
  document.getElementById("planPedidoTitulo").focus({ preventScroll: true });
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const boton = form.querySelector('button[type="submit"]');
  boton.disabled = true;
  try {
    await api("/api/publico/consulta", {
      method: "POST",
      body: {
        nombre: document.querySelector("[data-usuario-nombre]")?.textContent?.trim() || negocio.nombre,
        negocio: negocio.nombre,
        contacto: campoContacto.value.trim(),
        mensaje: campoMensaje.value.trim(),
        plan: planPedido.clave
      },
      error: "No se pudo mandar el pedido."
    });
    form.hidden = true;
    campoMensaje.value = "";
    avisar(`Listo: te vamos a escribir para activar el plan ${planPedido.nombre}.`);
  } finally {
    boton.disabled = false;
  }
});
