/**
 * dominios/problema.js
 * Avisar un problema (handoff.md, "Orden", punto 2): una página de
 * Configuración para los dos roles, a mano también desde el pie del menú. Lo
 * que escribe la persona va a POST /api/problema, junto con dónde estaba, su
 * navegador y los últimos errores, y cae en el CRM del negocio con el que se
 * vende Nexo. Antes de mandarlo, la página muestra todo eso.
 *
 * Los errores se juntan desde que carga la app: los de JavaScript que nadie
 * atrapó y los avisos de error que vio la persona (los toasts de api()).
 */

import { api } from "../core/api.js";
import { avisar } from "../core/ui.js";
import { esc } from "../core/formato.js";
import { negocio } from "../core/negocio.js";
import { registrar } from "../core/registro.js";
import { limpiarError, marcarError } from "../core/campos.js";

const PAGINA = "#/configuracion/problema";
const ERRORES_MAX = 3;
const errores = [];

function anotar(texto) {
  const limpio = String(texto ?? "").trim();
  if (!limpio || errores.at(-1) === limpio) return;
  errores.push(limpio);
  if (errores.length > ERRORES_MAX) errores.shift();
}

window.addEventListener("error", (e) => {
  const archivo = e.filename ? ` (${e.filename.split("/").pop()}:${e.lineno})` : "";
  anotar(`${e.message}${archivo}`);
});
// Los rechazos de api() ya se ven como toast, y ese toast se anota abajo.
window.addEventListener("unhandledrejection", (e) => {
  if (!e.reason?.yaAvisado) anotar(e.reason?.message ?? e.reason);
});
new MutationObserver((cambios) => {
  for (const cambio of cambios) {
    for (const nodo of cambio.addedNodes) {
      if (nodo.classList?.contains("aviso-error")) anotar(`Aviso: ${nodo.textContent}`);
    }
  }
}).observe(document.getElementById("avisos"), { childList: true });

// Dónde estaba la persona antes de abrir esta página: la última pantalla a la
// que entró, sin contar esta ni la lista de Configuración del celular, que es
// solo el camino para llegar. Se anota al entrar a cada una (y no con el
// oldURL al llegar acá) porque el router pinta esta página antes de que corra
// este listener. Si entró directo por el enlace, no se sabe.
const cuenta = (hash) => hash && !hash.startsWith(PAGINA) && hash !== "#/configuracion";
let pantalla = cuenta(location.hash) ? location.hash : "";
window.addEventListener("hashchange", () => {
  if (cuenta(location.hash)) pantalla = location.hash;
});

// "Ventas", o "Configuración › Apariencia": el nombre que ve en el menú.
function nombreDePantalla(hash) {
  const [vista, ...resto] = hash.replace(/^#\/?/, "").split("/");
  if (!vista) return "";
  const nombre = (sel) => document.querySelector(sel)?.textContent.trim();
  const principal = nombre(`.nav-item[data-view="${CSS.escape(vista)}"]`) ?? vista;
  const sub = resto[0] && (nombre(`.config-item[data-seccion="${CSS.escape(resto[0])}"] .config-item-nombre`) ?? resto[0]);
  return sub ? `${principal} › ${sub}` : principal;
}

function navegador() {
  const ua = navigator.userAgent;
  const conocidos = [
    [/Edg\/(\d+)/, "Edge"],
    [/OPR\/(\d+)/, "Opera"],
    [/SamsungBrowser\/(\d+)/, "Samsung Internet"],
    [/Firefox\/(\d+)/, "Firefox"],
    [/Chrome\/(\d+)/, "Chrome"],
    [/Version\/(\d+).*Safari/, "Safari"]
  ];
  const conocido = conocidos.find(([patron]) => patron.test(ua));
  const nombre = conocido ? `${conocido[1]} ${ua.match(conocido[0])[1]}` : "un navegador sin identificar";
  const sistemas = [
    [/Android/, "Android"],
    [/iPhone|iPad/, "iPhone"],
    [/Windows/, "Windows"],
    [/Mac OS X/, "Mac"],
    [/Linux/, "Linux"]
  ];
  const sistema = sistemas.find(([patron]) => patron.test(ua))?.[1] ?? "otro sistema";
  const app = matchMedia("(display-mode: standalone)").matches ? ", instalado como app" : "";
  return `${nombre} en ${sistema}${app}, pantalla de ${innerWidth}×${innerHeight}`;
}

const form = document.getElementById("formProblema");
const listaTecnico = document.getElementById("problemaTecnico");

function pintar() {
  const donde = nombreDePantalla(pantalla);
  const items = [
    "Tu nombre y tu mail, para responderte",
    donde ? `Dónde estabas: ${donde}` : "",
    negocio?.nombre ? `El negocio: ${negocio.nombre}` : "",
    `Tu navegador: ${navegador()}`,
    errores.length ? `Los últimos errores que aparecieron: ${errores.join(" · ")}` : "Errores: no apareció ninguno"
  ].filter(Boolean);
  listaTecnico.innerHTML = items.map((item) => `<li>${esc(item)}</li>`).join("");
}

registrar("pintar:problema", pintar);

form.mensaje.addEventListener("input", () => limpiarError(form.mensaje));

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const mensaje = form.mensaje.value.trim();
  if (!mensaje) {
    marcarError(form.mensaje, "Contanos qué pasó.");
    form.mensaje.focus();
    return;
  }
  const boton = form.querySelector('button[type="submit"]');
  boton.disabled = true;
  try {
    const donde = nombreDePantalla(pantalla);
    await api("/api/problema", {
      method: "POST",
      body: {
        mensaje,
        pantalla: donde ? `${donde} (${pantalla})` : "",
        navegador: navegador(),
        errores
      },
      error: "No se pudo mandar el aviso."
    });
    form.reset();
    errores.length = 0;
    avisar("Gracias: le llegó al equipo de Nexo. Si hace falta, te escribimos.", "ok");
    // De vuelta a donde estaba, o a Configuración si entró directo.
    location.hash = pantalla || "#/configuracion";
  } finally {
    boton.disabled = false;
  }
});
