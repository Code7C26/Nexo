/**
 * dominios/negocios.js
 * Varios negocios por cuenta (CLAUDE.md §28, hist. §77): el selector de arriba
 * del menú, con el negocio en el que se está trabajando, los otros de la
 * cuenta y "Agregar negocio" (solo el admin), que abre el alta guiada en su
 * modo "negocio".
 *
 * También muestra en el Resumen las invitaciones a otros negocios que le
 * llegaron a la cuenta (hist. §104), para aceptarlas o rechazarlas.
 *
 * Cambiar de negocio recarga la página: todo lo que la app tiene en memoria
 * (productos, clientes, cajas, filtros) es del negocio anterior, y recargar
 * es el mismo reseteo que ya usa cerrar sesión (sesion.js).
 */

import { api } from "../core/api.js";
import { esAdmin, esc } from "../core/formato.js";
import { icono } from "../core/iconos.js";
import { alEntrarEnVista, registrar } from "../core/registro.js";
import { avisar } from "../core/ui.js";

const selector = document.getElementById("negocioSelector");
const boton = document.getElementById("negocioActual");
const menu = document.getElementById("negocioMenu");
const CLAVE_AVISO = "nexo.aviso";

// El menú se muda al <body>: adentro de la sidebar lo cortaba su scroll, y en
// el celular el cajón tiene un transform que corre cualquier position: fixed.
document.body.append(menu);

let negocios = [];

// La letra del cuadradito: la primera del nombre, como el avatar de un
// espacio en Dub. Con [...] para no partir un carácter compuesto.
const inicial = (nombre) => ([...nombre.trim()][0] ?? "N").toLocaleUpperCase("es-AR");

/* ---------- Aviso después de recargar ---------- */

// Lo que se avisa sobrevive a la recarga en sessionStorage: lo deja quien
// cambia de negocio (acá o, desde otra pestaña, sesion.js) y se muestra al
// volver a cargar.
function avisarDespuesDeRecargar(texto) {
  try {
    sessionStorage.setItem(CLAVE_AVISO, texto);
  } catch {}
}

try {
  const pendiente = sessionStorage.getItem(CLAVE_AVISO);
  if (pendiente) {
    sessionStorage.removeItem(CLAVE_AVISO);
    // sesion.js también deja acá el resultado del enlace del mail (hist.
    // §102); uno que salió mal llega con "error:" adelante.
    if (pendiente.startsWith("error:")) avisar(pendiente.slice(6), "error");
    else avisar(pendiente, "ok");
  }
} catch {}

// Sin hash a propósito: la vista de inicio, porque la ficha o la página en la
// que se estaba son del otro negocio. Una dirección sin hash no es una
// navegación interna: el navegador recarga.
const recargarEnInicio = () => location.replace(location.pathname);

/* ---------- Selector ---------- */

async function cargarNegocios() {
  negocios = await api("/api/negocios", { error: "No se pudieron cargar tus negocios." });
  pintarActual();
}

function pintarActual() {
  const actual = negocios.find((n) => n.actual);
  if (!actual) return;
  boton.querySelector(".negocio-inicial").textContent = inicial(actual.nombre);
  boton.querySelector(".negocio-nombre").textContent = actual.nombre;
  boton.querySelector(".negocio-tipo").textContent = actual.tipo;
  boton.title = actual.nombre;
  // Un empleado de un solo negocio no tiene a dónde cambiar: ve el nombre y
  // nada más. El admin siempre tiene menú, porque ahí está "Agregar negocio".
  const conMenu = negocios.length > 1 || esAdmin();
  selector.classList.toggle("sin-menu", !conMenu);
  boton.disabled = !conMenu;
  if (conMenu) boton.setAttribute("aria-label", `Negocio: ${actual.nombre}. Cambiar de negocio`);
  else boton.removeAttribute("aria-label");
}

function pintarMenu() {
  menu.innerHTML = `
    <p class="negocio-menu-titulo">Tus negocios</p>
    ${negocios
      .map(
        (n) => `
      <button type="button" class="negocio-opcion${n.actual ? " is-actual" : ""}" role="menuitemradio"
        aria-checked="${n.actual ? "true" : "false"}" data-id="${n.id}" data-nombre="${esc(n.nombre)}">
        <span class="negocio-inicial" aria-hidden="true">${esc(inicial(n.nombre))}</span>
        <span class="negocio-textos">
          <strong class="negocio-nombre">${esc(n.nombre)}</strong>
          <span class="negocio-tipo">${esc(n.se_borra ? "Se está dando de baja" : n.tipo)}</span>
        </span>
        ${n.actual ? icono("check", "negocio-check") : ""}
      </button>`
      )
      .join("")}
    ${
      esAdmin()
        ? `<div class="negocio-menu-separador" role="separator"></div>
      <button type="button" class="negocio-opcion negocio-agregar" role="menuitem" data-agregar>
        <span class="negocio-inicial" aria-hidden="true">${icono("plus")}</span>
        <span class="negocio-textos">
          <strong class="negocio-nombre">Agregar negocio</strong>
          <span class="negocio-tipo">Otro local o rubro, con tu misma cuenta</span>
        </span>
      </button>`
        : ""
    }`;
}

const opciones = () => [...menu.querySelectorAll(".negocio-opcion:not(:disabled)")];

// Fijo en la pantalla y no adentro de la sidebar: así no lo corta su scroll
// ni la barra colapsada, que es angosta. Se ubica debajo del botón.
function ubicarMenu() {
  const caja = boton.getBoundingClientRect();
  const ancho = Math.max(caja.width, 264);
  menu.style.top = `${Math.round(caja.bottom + 6)}px`;
  menu.style.left = `${Math.round(Math.min(caja.left, window.innerWidth - ancho - 8))}px`;
  menu.style.width = `${Math.round(ancho)}px`;
}

function abrirMenu() {
  pintarMenu();
  menu.hidden = false;
  ubicarMenu();
  boton.setAttribute("aria-expanded", "true");
  (menu.querySelector(".is-actual") ?? opciones()[0])?.focus();
}

function cerrarMenu({ devolverFoco = false } = {}) {
  if (menu.hidden) return;
  menu.hidden = true;
  boton.setAttribute("aria-expanded", "false");
  if (devolverFoco) boton.focus();
}

boton.addEventListener("click", () => (menu.hidden ? abrirMenu() : cerrarMenu()));

boton.addEventListener("keydown", (e) => {
  if ((e.key === "ArrowDown" || e.key === "ArrowUp") && menu.hidden) {
    e.preventDefault();
    abrirMenu();
  }
});

// Flechas, Inicio y Fin recorren; Escape cierra y vuelve al botón; Tab cierra
// y deja que el foco siga su camino.
menu.addEventListener("keydown", (e) => {
  const lista = opciones();
  const i = lista.indexOf(document.activeElement);
  const destino = {
    ArrowDown: lista[(i + 1) % lista.length],
    ArrowUp: lista[(i - 1 + lista.length) % lista.length],
    Home: lista[0],
    End: lista[lista.length - 1]
  }[e.key];
  if (destino) {
    e.preventDefault();
    destino.focus();
  } else if (e.key === "Escape") {
    e.preventDefault();
    cerrarMenu({ devolverFoco: true });
  } else if (e.key === "Tab") {
    cerrarMenu();
  }
});

menu.addEventListener("click", (e) => {
  const opcion = e.target.closest(".negocio-opcion");
  if (!opcion) return;
  if (opcion.hasAttribute("data-agregar")) agregarNegocio();
  else if (opcion.classList.contains("is-actual")) cerrarMenu({ devolverFoco: true });
  else entrar(opcion);
});

document.addEventListener("click", (e) => {
  if (!selector.contains(e.target) && !menu.contains(e.target)) cerrarMenu();
});
window.addEventListener("resize", () => cerrarMenu());

/* ---------- Cambiar de negocio ---------- */

async function entrar(opcion) {
  const nombre = opcion.dataset.nombre;
  for (const otra of opciones()) otra.disabled = true;
  opcion.setAttribute("aria-busy", "true");
  opcion.querySelector(".negocio-tipo").textContent = "Cambiando…";
  try {
    await api(`/api/negocios/${opcion.dataset.id}/entrar`, { method: "POST", error: "No se pudo cambiar de negocio." });
  } catch (e) {
    pintarMenu();
    opciones()[0]?.focus();
    throw e;
  }
  avisarDespuesDeRecargar(`Estás en «${nombre}».`);
  recargarEnInicio();
}

/* ---------- Agregar negocio ---------- */

// El alta guiada a pantalla completa, sin el paso "Tu cuenta" (alta.js). Se
// baja recién acá, como desde el login.
async function agregarNegocio() {
  cerrarMenu();
  document.getElementById("sidebar").classList.remove("is-open");
  let montarAlta;
  try {
    ({ montarAlta } = await import("../alta.js"));
  } catch (e) {
    avisar("No se pudo abrir el alta de negocio. Recargá la página.", "error");
    throw e;
  }
  montarAlta({
    modo: "negocio",
    alTerminar: (nuevo) => {
      avisarDespuesDeRecargar(`Listo: ya estás en «${nuevo.nombre}».`);
      recargarEnInicio();
    },
    alVolver: () => boton.focus()
  });
}

// #/agregar-negocio es el enlace directo (o una recarga a mitad del alta, que
// vuelve a empezar: el alta no guarda lo que se iba completando).
if (location.hash.startsWith("#/agregar-negocio")) {
  history.replaceState(null, "", location.pathname + location.search);
  if (esAdmin()) agregarNegocio();
}

/* ---------- Invitaciones que le llegaron (hist. §104) ---------- */

// En el Resumen, para los dos roles: solo las del mail confirmado de la cuenta
// (el backend no devuelve otras). Aceptar pasa a ese negocio, así que recarga.
const avisoInvitaciones = document.getElementById("avisoInvitaciones");
const ROL_TEXTO = { admin: "administrador", empleado: "empleado" };

alEntrarEnVista("dashboard", async () => {
  const solicitudes = await api("/api/auth/invitaciones");
  avisoInvitaciones.hidden = solicitudes.length === 0;
  avisoInvitaciones.innerHTML = solicitudes
    .map(
      (s) => `
    <div class="aviso-plan" role="status">
      ${icono("user-plus")}
      <p><strong>${esc(s.invito)}</strong> te invitó a sumarte a <strong>${esc(s.negocio)}</strong> como ${esc(ROL_TEXTO[s.rol] ?? s.rol)}.</p>
      <button type="button" class="btn btn-primary" data-aceptar="${s.id}" data-negocio="${esc(s.negocio)}">Aceptar</button>
      <button type="button" class="btn-link" data-rechazar="${s.id}">Rechazar</button>
    </div>`
    )
    .join("");
});

avisoInvitaciones.addEventListener("click", async (e) => {
  const aceptar = e.target.closest("[data-aceptar]");
  const rechazar = e.target.closest("[data-rechazar]");
  const boton = aceptar ?? rechazar;
  if (!boton) return;
  boton.disabled = true;
  try {
    if (aceptar) {
      await api(`/api/auth/invitaciones/${aceptar.dataset.aceptar}/aceptar`, { method: "POST", error: "No se pudo aceptar la invitación." });
      avisarDespuesDeRecargar(`Listo: ya estás en «${aceptar.dataset.negocio}». Pasás de un negocio a otro desde arriba del menú.`);
      recargarEnInicio();
      return;
    }
    await api(`/api/auth/invitaciones/${rechazar.dataset.rechazar}/rechazar`, { method: "POST", error: "No se pudo rechazar la invitación." });
    boton.closest(".aviso-plan").remove();
    avisoInvitaciones.hidden = !avisoInvitaciones.children.length;
    avisar("Invitación rechazada.", "ok");
  } finally {
    boton.disabled = false;
  }
});

// Lo pide el boot de app.js en su primera ola, y Configuración al guardar
// (por si cambió el nombre o el tipo del negocio).
registrar("cargar:negocios", cargarNegocios);
// Lo ofrece "Cambiar el tipo" de Configuración (hist. §88): otro tipo de
// negocio suele ser otro negocio.
registrar("agregar:negocio", agregarNegocio);
