/**
 * landing.js — la página pública de Nexo (hist. §100)
 * -----------------------------------------------------------
 * El único script de landing.html (sin inline: la CSP no lo deja). No es parte
 * de la app: el service worker no lo guarda.
 *
 * Qué hace:
 * - el menú de la barra en el celular, y el borde de la barra al bajar;
 * - los tipos de negocio, de GET /api/auth/tipos-negocio;
 * - los planes, de GET /api/auth/planes: los precios, textos y topes viven
 *   solo en backend/planes.js. Cada plan lleva al alta con ?plan= (alta.js);
 * - el formulario de contacto, contra POST /api/publico/consulta (hist. §99),
 *   que deja la consulta en el CRM del negocio con el que se vende Nexo.
 *
 * Lo que viene de la API se escapa con esc(), como en la app.
 */

import { esc } from "./core/formato.js";
import { icono } from "./core/iconos.js";

const $ = (id) => document.getElementById(id);

// Sin centavos: en un precio de plan solo meten ruido ("$ 19.900").
const precio = (n) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

// El plan que se marca como recomendado. Es una opinión de la landing, no un
// dato del plan: si no existe esa clave, ninguno se marca.
const PLAN_RECOMENDADO = "emprendedor";

/* ---------- Barra ---------- */

const barra = $("barra");
const nav = $("barraNav");
const btnMenu = $("btnMenu");

function marcarMenu(abierto) {
  nav.classList.toggle("abierta", abierto);
  btnMenu.setAttribute("aria-expanded", String(abierto));
  btnMenu.setAttribute("aria-label", abierto ? "Cerrar menú" : "Abrir menú");
  btnMenu.innerHTML = icono(abierto ? "x" : "menu");
}
const cerrarMenu = () => marcarMenu(false);

btnMenu.addEventListener("click", () => marcarMenu(!nav.classList.contains("abierta")));
// Un enlace del menú lleva a su sección y cierra el panel.
nav.addEventListener("click", (e) => {
  if (e.target.closest("a")) cerrarMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && nav.classList.contains("abierta")) {
    cerrarMenu();
    btnMenu.focus();
  }
});

const marcarBarra = () => barra.classList.toggle("con-borde", window.scrollY > 8);
window.addEventListener("scroll", marcarBarra, { passive: true });
marcarBarra();

$("anio").textContent = String(new Date().getFullYear());

/* ---------- Tipos de negocio ---------- */

async function mostrarTipos() {
  try {
    const res = await fetch("/api/auth/tipos-negocio");
    if (!res.ok) return; // queda la lista fija del HTML
    const { tipos, proximamente = [] } = await res.json();
    // Los que todavía no tienen su módulo van al final, apagados y con "Muy
    // pronto", como en el alta.
    const tarjeta = (t, pronto) => `
        <li class="tipo${pronto ? " tipo-pronto" : ""}">
          <span class="tipo-icono">${icono(esc(t.icono))}</span>
          <div class="tipo-texto">
            <strong>${esc(t.nombre)}${pronto ? '<em class="tipo-sello">Muy pronto</em>' : ""}</strong>
            <span>${esc(t.descripcion)}</span>
          </div>
        </li>`;
    $("tipos").innerHTML =
      tipos.map((t) => tarjeta(t, false)).join("") + proximamente.map((t) => tarjeta(t, true)).join("");
  } catch {
    // Sin conexión con el servidor queda la lista fija del HTML.
  }
}

/* ---------- Planes ---------- */

function tarjetaPlan(plan, dias) {
  const destacado = plan.clave === PLAN_RECOMENDADO;
  const prueba = plan.precio > 0 ? `${dias} días de prueba, sin tarjeta` : "Sin tarjeta y sin vencimiento";
  const pronto = plan.muy_pronto?.length
    ? `<p class="plan-pronto"><strong>Muy pronto:</strong> ${esc(plan.muy_pronto.join(" · "))}</p>`
    : "";
  return `
    <article class="plan${destacado ? " plan-destacado" : ""}">
      ${destacado ? '<span class="plan-sello">Recomendado</span>' : ""}
      <h3>${esc(plan.nombre)}</h3>
      <p class="plan-descripcion">${esc(plan.descripcion)}</p>
      <p class="plan-precio"><strong>${esc(precio(plan.precio))}</strong><span>${plan.precio > 0 ? "por mes" : "para siempre"}</span></p>
      <p class="plan-prueba">${esc(prueba)}</p>
      <a class="btn ${destacado ? "btn-tinta" : "btn-fantasma"} btn-grande" href="/app?plan=${esc(encodeURIComponent(plan.clave))}#/crear-cuenta">
        ${plan.precio > 0 ? `Probar ${esc(plan.nombre)}` : "Empezar gratis"}
      </a>
      <ul>
        ${plan.incluye.map((linea) => `<li>${icono("check")}<span>${esc(linea)}</span></li>`).join("")}
      </ul>
      ${pronto}
    </article>`;
}

async function mostrarPlanes() {
  const lista = $("planesLista");
  try {
    const res = await fetch("/api/auth/planes");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { planes, dias_prueba: dias, contacto } = await res.json();
    lista.innerHTML = planes.map((p) => tarjetaPlan(p, dias)).join("");
    for (const el of document.querySelectorAll("[data-dias-prueba]")) el.textContent = String(dias);

    // El formulario de contacto ofrece los mismos planes.
    $("cPlan").insertAdjacentHTML(
      "beforeend",
      planes.map((p) => `<option value="${esc(p.clave)}">${esc(p.nombre)}</option>`).join(""),
    );
    if (contacto?.whatsapp) mostrarWhatsapp(contacto.whatsapp);
  } catch {
    lista.innerHTML = `<p class="planes-error">No pudimos cargar los planes. <a href="/app#/crear-cuenta">Creá tu cuenta gratis</a> y los ves adentro.</p>`;
  }
}

function mostrarWhatsapp(numero) {
  const texto = encodeURIComponent("Hola, quiero saber más de Nexo.");
  const enlace = $("whatsapp");
  enlace.innerHTML = `<a class="btn btn-fantasma" href="https://wa.me/${esc(encodeURIComponent(numero))}?text=${texto}" target="_blank" rel="noopener">${icono("message-circle")}Escribinos por WhatsApp</a>`;
  enlace.hidden = false;
}

/* ---------- Contacto ---------- */

const form = $("formContacto");
const aviso = $("contactoAviso");
const btnContacto = $("btnContacto");

function avisar(texto, tipo) {
  aviso.textContent = texto;
  aviso.className = `form-aviso ${tipo}`;
  aviso.hidden = false;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const datos = Object.fromEntries(new FormData(form));
  if (!datos.nombre.trim()) {
    avisar("Contanos tu nombre.", "error");
    $("cNombre").focus();
    return;
  }
  if (!datos.contacto.trim()) {
    avisar("Dejanos un teléfono o un mail para responderte.", "error");
    $("cContacto").focus();
    return;
  }
  if (!datos.plan) delete datos.plan;

  btnContacto.disabled = true;
  btnContacto.textContent = "Mandando…";
  try {
    const res = await fetch("/api/publico/consulta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
    if (res.ok) {
      form.reset();
      avisar("¡Listo! Te escribimos en cuanto la leamos.", "ok");
      return;
    }
    const { error } = await res.json().catch(() => ({}));
    avisar(error ?? "No pudimos mandar la consulta. Probá de nuevo en un rato.", "error");
  } catch {
    avisar("No hay conexión con Nexo. Probá de nuevo en un rato.", "error");
  } finally {
    btnContacto.disabled = false;
    btnContacto.textContent = "Mandar consulta";
  }
});

mostrarTipos();
mostrarPlanes();
