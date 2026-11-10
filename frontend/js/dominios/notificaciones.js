/**
 * dominios/notificaciones.js
 * Configuración → Notificaciones (Web Push, hist. §146): prender, probar y
 * apagar los avisos en este aparato. El navegador da la suscripción y Nexo la
 * guarda colgada de la sesión (server.js, "Notificaciones").
 *
 * - En Android y en la compu andan desde el navegador; en el iPhone, solo con
 *   Nexo instalado en la pantalla de inicio (iOS 16.4 o más nuevo).
 * - Al entrar, si este aparato ya las tenía prendidas por esta misma persona,
 *   se vuelve a anotar con la sesión nueva: cerrar sesión las había borrado
 *   del servidor, pero no del navegador.
 * - Tocar un aviso con Nexo abierta la lleva a esa pantalla (sw.js manda el
 *   hash).
 */

import { api } from "../core/api.js";
import { avisar } from "../core/ui.js";
import { esAdmin, esc } from "../core/formato.js";
import { moduloActivo } from "../core/negocio.js";
import { registrar } from "../core/registro.js";

// Quién las prendió en este aparato (localStorage, por navegador).
const CLAVE_DUENO = "nexo-notificaciones-usuario";
const usuarioActual = () => document.documentElement.dataset.usuario ?? "";
const leerDueno = () => {
  try {
    return localStorage.getItem(CLAVE_DUENO);
  } catch {
    return null;
  }
};
const guardarDueno = (valor) => {
  try {
    if (valor) localStorage.setItem(CLAVE_DUENO, valor);
    else localStorage.removeItem(CLAVE_DUENO);
  } catch {
    // Sin almacenamiento, al volver a entrar hay que prenderlas de nuevo.
  }
};

const soportadas = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const esIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const instalada = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

async function suscripcionActual() {
  if (!soportadas()) return null;
  const registro = await navigator.serviceWorker.getRegistration();
  return registro ? registro.pushManager.getSubscription() : null;
}

// La clave pública del servidor, en bytes, como la pide el navegador.
const aBytes = (b64url) => Uint8Array.from(atob(b64url.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const mismaClave = (suscripcion, clave) => {
  const actual = suscripcion.options?.applicationServerKey;
  if (!actual) return true;
  const a = new Uint8Array(actual);
  const b = aBytes(clave);
  return a.length === b.length && a.every((x, i) => x === b[i]);
};

async function anotar(suscripcion) {
  await api("/api/notificaciones/suscripcion", {
    method: "POST",
    body: suscripcion.toJSON(),
    error: "No se pudieron prender las notificaciones."
  });
}

/* ---------- La página ---------- */

const estado = document.getElementById("notifEstado");
const icono = document.getElementById("notifIcono");
const botonPrender = document.getElementById("notifPrender");
const botonProbar = document.getElementById("notifProbar");
const botonApagar = document.getElementById("notifApagar");

function pintarLista() {
  const avisos = [
    ...(esAdmin()
      ? [
          ...(moduloActivo("canales") ? ["Entra una venta por Tienda Nube o Mercado Libre."] : []),
          "Te pagan con Mercado Pago.",
          ...(moduloActivo("stock") ? ["Un producto llega al stock mínimo o se termina."] : [])
        ]
      : []),
    ...(moduloActivo("socios") ? ["Un socio que debe espera en la entrada."] : [])
  ];
  document.getElementById("notifLista").innerHTML = avisos.length
    ? avisos.map((a) => `<li>${esc(a)}</li>`).join("")
    : `<li>${esc("Por ahora no hay avisos para tu rol en este negocio.")}</li>`;
}

async function pintar() {
  pintarLista();
  botonPrender.hidden = true;
  botonProbar.hidden = true;
  botonApagar.hidden = true;
  icono.classList.remove("notif-icono-on");
  if (!soportadas()) {
    estado.textContent =
      esIos() && !instalada()
        ? "En el iPhone, primero instalá Nexo: abrila en Safari, tocá Compartir y después “Agregar a inicio”. Después abrila desde su ícono y prendelas acá."
        : "Este navegador no permite notificaciones. Probá con Chrome, Edge, Firefox o Safari actualizados.";
    return;
  }
  if (Notification.permission === "denied") {
    estado.textContent =
      "Las bloqueaste para Nexo. Para prenderlas, tocá el candado al lado de la dirección (o los permisos de la app) y permití las notificaciones.";
    return;
  }
  const suscripcion = await suscripcionActual();
  if (suscripcion && Notification.permission === "granted") {
    estado.textContent = "Prendidas: este aparato recibe los avisos de Nexo, aunque no la tengas abierta.";
    icono.classList.add("notif-icono-on");
    botonProbar.hidden = false;
    botonApagar.hidden = false;
  } else {
    estado.textContent = "Apagadas en este aparato.";
    botonPrender.hidden = false;
  }
}

botonPrender.addEventListener("click", async () => {
  botonPrender.disabled = true;
  try {
    const permiso = await Notification.requestPermission();
    if (permiso !== "granted") {
      avisar("Sin el permiso del navegador, Nexo no te puede avisar.", "atencion");
      return;
    }
    const { clave_publica: clave } = await api("/api/notificaciones", { error: "No se pudieron prender las notificaciones." });
    const registro = await navigator.serviceWorker.ready;
    let suscripcion = await registro.pushManager.getSubscription();
    // Una de antes con otra clave del servidor ya no recibe nada.
    if (suscripcion && !mismaClave(suscripcion, clave)) {
      await suscripcion.unsubscribe();
      suscripcion = null;
    }
    suscripcion ??= await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(clave) });
    await anotar(suscripcion);
    guardarDueno(usuarioActual());
    avisar("Listo: las notificaciones quedaron prendidas en este aparato.", "ok");
  } catch (e) {
    // api() ya avisó lo suyo; esto es lo que dijo el navegador.
    if (e instanceof DOMException) avisar("El navegador no dejó prender las notificaciones.", "error");
  } finally {
    botonPrender.disabled = false;
    await pintar();
  }
});

botonProbar.addEventListener("click", async () => {
  botonProbar.disabled = true;
  try {
    await api("/api/notificaciones/probar", { method: "POST", error: "No se pudo mandar la de prueba." });
    avisar("Mandada: en unos segundos te llega.", "ok");
  } finally {
    botonProbar.disabled = false;
  }
});

botonApagar.addEventListener("click", async () => {
  botonApagar.disabled = true;
  try {
    const suscripcion = await suscripcionActual();
    if (suscripcion) {
      await api("/api/notificaciones/apagar", { method: "POST", body: { endpoint: suscripcion.endpoint }, error: "No se pudieron apagar." });
      await suscripcion.unsubscribe();
    }
    guardarDueno(null);
    avisar("Notificaciones apagadas en este aparato.", "ok");
  } finally {
    botonApagar.disabled = false;
    await pintar();
  }
});

registrar("pintar:notificaciones", pintar);

/* ---------- Al entrar y al tocar un aviso ---------- */

// Con la sesión nueva, la misma suscripción se vuelve a anotar, si la había
// prendido esta persona.
(async () => {
  if (!soportadas() || Notification.permission !== "granted" || leerDueno() !== usuarioActual()) return;
  const suscripcion = await suscripcionActual().catch(() => null);
  if (suscripcion) await anotar(suscripcion).catch(() => {});
})();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.nexo === "ir" && typeof e.data.hash === "string" && e.data.hash.startsWith("#/")) location.hash = e.data.hash;
  });
}
