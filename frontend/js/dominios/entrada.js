/**
 * dominios/entrada.js
 * La pantalla de entrada del módulo `socios` (hist. §144): la que ve el socio
 * en una tablet o una compu en la puerta, con la sesión del negocio. Tipea su
 * DNI o su número y, si está al día, entra solo. Si debe, si todavía no empezó
 * o si está de baja, le pide que pase por recepción, y la recepción
 * (#/ingreso, dominios/socios.js) recibe el aviso.
 *
 * Ocupa toda la pantalla, por encima del menú (CSS .entrada-pantalla), y
 * nunca muestra cuánto debe nadie: la ve cualquiera que esté en la fila.
 * Sirve con el teclado de la pantalla o con uno de verdad.
 */

import { esc, fechaAR } from "../core/formato.js";
import { confirmar } from "../core/ui.js";
import { icono } from "../core/iconos.js";
import { alEntrarEnVista } from "../core/registro.js";
import { mostrarVista } from "../core/router.js";
import { negocio } from "../core/negocio.js";

const vista = document.querySelector('[data-view="entrada"]');
const codigo = document.getElementById("entradaCodigo");
const resultado = document.getElementById("entradaResultado");
const cuerpo = document.getElementById("entradaCuerpo");
const MAX_DIGITOS = 12;
// Lo que se ve el saludo antes de volver a pedir un DNI.
const MS_RESULTADO = 4500;

let tipeado = "";
let enviando = false;
let volver = null;
let reloj = null;

const visible = () => !vista.hidden;

function pintarCodigo() {
  codigo.textContent = tipeado || "—";
  codigo.classList.toggle("entrada-codigo-vacio", !tipeado);
}

// Con el enlace directo (#/entrada), el negocio llega después de entrar: se
// pinta también con cada reinicio y con el reloj.
const pintarNegocio = () => (document.getElementById("entradaNegocio").textContent = negocio.nombre ?? "");

function reiniciar() {
  pintarNegocio();
  clearTimeout(volver);
  tipeado = "";
  pintarCodigo();
  resultado.hidden = true;
  cuerpo.hidden = false;
}

function mostrar(tono, titulo, texto) {
  const iconoDelTono = { ok: "circle-check", aviso: "door-open", error: "circle-alert" }[tono];
  resultado.className = `entrada-resultado entrada-resultado-${tono}`;
  resultado.innerHTML = `
    <span class="entrada-resultado-icono">${icono(iconoDelTono)}</span>
    <p class="entrada-resultado-titulo">${esc(titulo)}</p>
    ${texto ? `<p class="entrada-resultado-texto">${esc(texto)}</p>` : ""}`;
  cuerpo.hidden = true;
  resultado.hidden = false;
  clearTimeout(volver);
  volver = setTimeout(reiniciar, MS_RESULTADO);
}

// Sin api(): un DNI que no está no es un error de la app, y la pantalla no
// muestra los avisos de arriba.
async function entrar() {
  if (!tipeado || enviando) return;
  enviando = true;
  try {
    const res = await fetch("/api/socios/entrada", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo: tipeado })
    });
    const r = await res.json().catch(() => ({}));
    if (!res.ok) mostrar("error", "No te encontramos", res.status === 404 ? r.error : "Pasá por recepción.");
    else if (r.entra) {
      mostrar("ok", `¡Hola, ${r.nombre}!`, r.al_dia_hasta ? `Estás al día hasta el ${fechaAR(r.al_dia_hasta)}. ¡Buen entrenamiento!` : "¡Buen entrenamiento!");
    } else mostrar("aviso", `${r.nombre}, pasá por recepción`, r.motivo);
  } catch {
    mostrar("error", "Sin conexión", "Pasá por recepción.");
  } finally {
    enviando = false;
  }
}

function tecla(valor) {
  if (!resultado.hidden) reiniciar();
  if (valor === "borrar") tipeado = tipeado.slice(0, -1);
  else if (valor === "entrar") return entrar();
  else if (tipeado.length < MAX_DIGITOS) tipeado += valor;
  pintarCodigo();
}

document.getElementById("entradaTeclado").addEventListener("click", (e) => {
  const boton = e.target.closest("[data-tecla]");
  if (boton) tecla(boton.dataset.tecla);
});

// Con un teclado de verdad (una compu en la puerta, o un lector de carnets
// que tipea el número y Enter).
document.addEventListener("keydown", (e) => {
  if (!visible() || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.(".modal")) return;
  if (/^\d$/.test(e.key)) tecla(e.key);
  else if (e.key === "Backspace") tecla("borrar");
  else if (e.key === "Enter") tecla("entrar");
  else return;
  e.preventDefault();
});

function pintarHora() {
  if (!visible()) {
    clearInterval(reloj);
    reloj = null;
    return;
  }
  pintarNegocio();
  document.getElementById("entradaHora").textContent = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

document.getElementById("entradaSalir").addEventListener("click", async () => {
  const seguro = await confirmar({
    cuerpo: "¿Salir de la pantalla de entrada? Los socios ya no van a poder anotarse solos.",
    aceptar: "Salir"
  });
  if (!seguro) return;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  mostrarVista("ingreso");
});

alEntrarEnVista("entrada", () => {
  reiniciar();
  clearInterval(reloj);
  reloj = setInterval(pintarHora, 5000);
  pintarHora();
});
