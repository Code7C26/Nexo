/**
 * dominios/cuenta-menu.js
 * El menú de la cuenta, como el de Notion: tocar la foto o el nombre del pie
 * de la sidebar abre la cuenta (foto, nombre y mail), Mejorar tu plan y Mi
 * cuenta, Configuración, Invitar a alguien, el tema, Avisar un problema,
 * Entrar con otra cuenta y Cerrar sesión. Reemplaza los botones sueltos del
 * pie (pedido del usuario, 22 de noviembre).
 *
 * Es el mismo menú que el selector de negocio (dominios/negocios.js): vive en
 * el <body>, fijo en la pantalla, con flechas, Escape y clic afuera. Los
 * negocios de la cuenta quedan en ese selector, arriba: acá no se repiten.
 *
 * "Entrar con otra cuenta" cierra la sesión y abre el login: Nexo tiene una
 * sesión por navegador, y varias cuentas abiertas a la vez pedirían varias
 * sesiones por cookie en el servidor.
 */

import { aplicarTema, temaActual } from "../core/tema.js";
import { api } from "../core/api.js";
import { avisar, confirmar } from "../core/ui.js";

const boton = document.getElementById("cuentaBoton");
const menu = document.getElementById("cuentaMenu");
const botonTema = document.getElementById("cuentaTema");

// Adentro de la sidebar lo cortaba su scroll, y en el celular el cajón tiene
// un transform que corre cualquier position: fixed (como el de negocios).
document.body.append(menu);

// Solo las que se ven: las de admin se ocultan por CSS para el empleado.
const opciones = () => [...menu.querySelectorAll(".negocio-opcion")].filter((o) => o.offsetParent !== null);

// Arriba del botón, que está al pie de la pantalla.
function ubicarMenu() {
  const caja = boton.getBoundingClientRect();
  const ancho = Math.max(caja.width, 264);
  menu.style.bottom = `${Math.round(Math.max(window.innerHeight - caja.top + 6, 8))}px`;
  menu.style.left = `${Math.round(Math.min(caja.left, window.innerWidth - ancho - 8))}px`;
  menu.style.width = `${Math.round(ancho)}px`;
}

// El tema al que se pasa, no el que está: "Tema claro" estando en el oscuro.
function pintarTema() {
  const claro = temaActual() === "claro";
  botonTema.querySelector("use").setAttribute("href", `/img/iconos.svg#${claro ? "moon" : "sun"}`);
  botonTema.querySelector("span").textContent = claro ? "Tema oscuro" : "Tema claro";
}

function abrirMenu() {
  // La foto (o el ícono) es la del pie, que pintan sesion.js y Mi cuenta.
  menu.querySelector(".cuenta-menu-foto").innerHTML = document.getElementById("btnPerfil").innerHTML;
  pintarTema();
  menu.hidden = false;
  ubicarMenu();
  boton.setAttribute("aria-expanded", "true");
  opciones()[0]?.focus();
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
  // El tema cambia ahí mismo y el menú queda abierto, para ver cómo queda.
  if (opcion === botonTema) {
    aplicarTema(temaActual() === "oscuro" ? "claro" : "oscuro");
    pintarTema();
    return;
  }
  cerrarMenu();
  document.getElementById("sidebar").classList.remove("is-open");
  if (opcion.id === "cuentaOtra") {
    try {
      sessionStorage.setItem("nexo.avisoLogin", "Entrá con la otra cuenta.");
    } catch {}
    window.nexoCerrarSesion();
  } else if (opcion.id === "cuentaSalir") {
    window.nexoCerrarSesion();
  } else if (opcion.id === "cuentaCaja") {
    dejarEstaCompu();
  }
  // Los enlaces siguen solos: el router abre la página de Configuración.
});

document.addEventListener("click", (e) => {
  if (!boton.contains(e.target) && !menu.contains(e.target)) cerrarMenu();
});

// La compu vinculada a una caja (hist. §199), con el admin adentro: deja de
// ser la caja (solo esta; las otras compus de la caja siguen). También lo
// ofrece el punto de venta. Devuelve si se desvinculó.
export async function dejarEstaCompu() {
  const caja = window.nexoEstaCompu;
  if (!caja) return false;
  const ok = await confirmar({
    titulo: `¿Dejar de usar esta compu como la caja «${caja.nombre}»?`,
    cuerpo: "Al abrir Nexo ya no va a preguntar quién atiende: pide entrar con una cuenta. Las otras compus de la caja siguen igual.",
    aceptar: "Dejar de usarla",
    destructivo: true
  });
  if (!ok) return false;
  await api("/api/cajas/esta-compu", { method: "DELETE", error: "No se pudo desvincular esta compu." });
  window.nexoEstaCompu = null;
  document.getElementById("cuentaCaja").hidden = true;
  avisar(`Esta compu ya no es la caja «${caja.nombre}».`, "ok");
  return true;
}
window.addEventListener("resize", () => cerrarMenu());
