/**
 * dominios/entrada.js
 * La pantalla de entrada del módulo `socios` (hist. §144): la que ve el socio
 * en una tablet o una compu en la puerta, con la sesión del negocio. Tipea su
 * DNI o su número y, si está al día, entra solo. Si debe, si todavía no empezó
 * o si está de baja, le pide que pase por recepción, y la recepción
 * (#/ingreso, dominios/socios.js) recibe el aviso.
 *
 * El ingreso por clase (hist. §228): si hay clases ahora (en curso o por
 * empezar), después del DNI elige a cuál viene, con la próxima ya marcada.
 * Puede marcar varias (la de las 7 y la de las 8) o volver a poner su DNI y
 * sumar otra. El que da clases (lo marca el dueño en su ficha) ve también "La
 * doy". El profe que no es socio toca "Soy profe", se elige y pone su PIN.
 *
 * Es otra ventana del mismo navegador y la misma sesión que la recepción: la
 * abre "Pantalla de entrada → Abrir" (en el otro monitor, si hay), y le avisa
 * a la recepción por un BroadcastChannel, al instante y sin el servidor.
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
const paso = document.getElementById("entradaPaso");
const botonProfe = document.getElementById("entradaProfe");
const titulo = vista.querySelector(".entrada-titulo");
const TITULO_DNI = titulo.textContent;
const MAX_DIGITOS = 12;
// Lo que se ve el saludo antes de volver a pedir un DNI.
const MS_RESULTADO = 4500;
// Si nadie toca nada al elegir la clase, se anota lo marcado: nadie queda
// afuera de la lista por apurado.
const MS_ELEGIR = 25000;

// A la recepción: quién llegó y si entró. El canal es por negocio.
const recepcion = "BroadcastChannel" in window ? new BroadcastChannel(`nexo-entrada-${document.documentElement.dataset.organizacion}`) : null;

let tipeado = "";
let enviando = false;
let volver = null;
let reloj = null;
// 'dni' o 'pin' (el profe que se eligió, en `profe`).
let modo = "dni";
let profe = null;
// La elección de clases en pantalla:
// { nombre, clases, marcadas: Map(id → 'vengo' | 'doy'), da, soloDoy, alConfirmar }.
let eleccion = null;

const visible = () => !vista.hidden;

function pintarCodigo() {
  codigo.textContent = modo === "pin" ? "•".repeat(tipeado.length) || "—" : tipeado || "—";
  codigo.classList.toggle("entrada-codigo-vacio", !tipeado);
}

// Con el enlace directo (#/entrada), el negocio llega después de entrar: se
// pinta también con cada reinicio y con el reloj.
// Con su logo grande arriba (hist. §212), como el kiosco de Gymdesk.
const logo = document.getElementById("entradaLogo");
function pintarNegocio() {
  document.getElementById("entradaNegocio").textContent = negocio.nombre ?? "";
  logo.hidden = !negocio.logo;
  if (negocio.logo && logo.getAttribute("src") !== negocio.logo) logo.src = negocio.logo;
}

function reiniciar() {
  pintarNegocio();
  clearTimeout(volver);
  modo = "dni";
  profe = null;
  eleccion = null;
  tipeado = "";
  titulo.textContent = TITULO_DNI;
  pintarCodigo();
  resultado.hidden = true;
  paso.hidden = true;
  cuerpo.hidden = false;
  botonProfe.hidden = false;
}

function mostrar(tono, tituloResultado, texto) {
  const iconoDelTono = { ok: "circle-check", aviso: "door-open", error: "circle-alert" }[tono];
  resultado.className = `entrada-resultado entrada-resultado-${tono}`;
  resultado.innerHTML = `
    <span class="entrada-resultado-icono">${icono(iconoDelTono)}</span>
    <p class="entrada-resultado-titulo">${esc(tituloResultado)}</p>
    ${texto ? `<p class="entrada-resultado-texto">${esc(texto)}</p>` : ""}`;
  cuerpo.hidden = true;
  paso.hidden = true;
  botonProfe.hidden = true;
  resultado.hidden = false;
  clearTimeout(volver);
  volver = setTimeout(reiniciar, MS_RESULTADO);
}

// Un paso a pantalla completa (elegir la clase, elegirse como profe).
function mostrarPaso(html) {
  paso.innerHTML = html;
  cuerpo.hidden = true;
  resultado.hidden = true;
  botonProfe.hidden = true;
  paso.hidden = false;
}

// Sin api(): un DNI que no está no es un error de la app, y la pantalla no
// muestra los avisos de arriba.
async function pedir(url, cuerpoPedido) {
  const res = await fetch(url, {
    method: cuerpoPedido ? "POST" : "GET",
    headers: cuerpoPedido ? { "Content-Type": "application/json" } : {},
    body: cuerpoPedido ? JSON.stringify(cuerpoPedido) : undefined
  });
  return { ok: res.ok, status: res.status, datos: await res.json().catch(() => ({})) };
}

const enLista = (textos) => (textos.length > 1 ? `${textos.slice(0, -1).join(", ")} y ${textos.at(-1)}` : textos[0]);

/* ---------- Elegir la clase ---------- */

// Las clases de ahora. Con `da`, cada una tiene también "La doy"; `soloDoy`
// es el profe que se anotó con su PIN. Marca de entrada la que está en curso
// o la próxima, salvo que ya esté anotado en alguna.
function elegirClases({ nombre, clases, da = false, soloDoy = false, alConfirmar }) {
  const marcadas = new Map();
  const yaEsta = clases.some((c) => c.anotado || c.la_doy);
  if (!yaEsta) marcadas.set((clases.find((c) => c.en_curso) ?? clases[0]).id, soloDoy ? "doy" : "vengo");
  eleccion = { nombre, clases, marcadas, da: da || soloDoy, soloDoy, alConfirmar };
  pintarEleccion();
}

function pintarEleccion() {
  const { nombre, clases, marcadas, da, soloDoy } = eleccion;
  const boton = (c, valor, texto, ya) => {
    const marcado = ya || marcadas.get(c.id) === valor;
    return `<button type="button" data-clase="${c.id}" data-valor="${valor}" aria-pressed="${marcado}"${ya ? " disabled" : ""}>${marcado ? icono("check") : ""}${esc(texto)}</button>`;
  };
  const tarjetas = clases
    .map((c) => {
      const cuando = c.en_curso ? `Empezó a las ${c.desde}, hasta las ${c.hasta}` : `De ${c.desde} a ${c.hasta}`;
      const botones = [
        soloDoy ? "" : boton(c, "vengo", c.anotado ? "Ya estás" : "Vengo", c.anotado),
        da ? boton(c, "doy", c.la_doy ? "La das vos" : "La doy", c.la_doy) : ""
      ].join("");
      return `
      <div class="entrada-clase color-${esc(c.color)}">
        <p class="entrada-clase-nombre">${esc(c.actividad)}</p>
        <p class="entrada-clase-hora">${esc(cuando)}</p>
        <div class="entrada-clase-botones">${botones}</div>
      </div>`;
    })
    .join("");
  mostrarPaso(`
    <h1 class="entrada-titulo">${esc(soloDoy ? `${nombre}, ¿qué clase das?` : `¡Hola, ${nombre}! ¿A qué clase venís?`)}</h1>
    <p class="entrada-paso-ayuda">${esc(soloDoy ? "Tocá las que das ahora." : "Si te quedás a la siguiente, marcá las dos.")}</p>
    <div class="entrada-clases">${tarjetas}</div>
    <div class="entrada-paso-acciones">
      <button type="button" class="entrada-volver" data-accion="ninguna">${esc(soloDoy ? "Ninguna" : "No vengo a ninguna")}</button>
      <button type="button" class="entrada-listo" data-accion="listo">Listo</button>
    </div>`);
  clearTimeout(volver);
  volver = setTimeout(() => confirmarEleccion(), MS_ELEGIR);
}

async function confirmarEleccion(ninguna = false) {
  if (!eleccion || enviando) return;
  clearTimeout(volver);
  const elegidas = (valor) => (ninguna ? [] : [...eleccion.marcadas].filter(([, v]) => v === valor).map(([id]) => id));
  const pedido = { vengo: elegidas("vengo"), doy: elegidas("doy") };
  const { alConfirmar } = eleccion;
  eleccion = null;
  enviando = true;
  try {
    await alConfirmar(pedido);
  } catch {
    mostrar("error", "Sin conexión", "Pasá por recepción.");
  } finally {
    enviando = false;
  }
}

paso.addEventListener("click", (e) => {
  const accion = e.target.closest("[data-accion]")?.dataset.accion;
  if (accion === "listo") return confirmarEleccion();
  if (accion === "ninguna") return confirmarEleccion(true);
  if (accion === "volver") return reiniciar();
  const profeBoton = e.target.closest("[data-profe]");
  if (profeBoton) return pedirPin({ id: Number(profeBoton.dataset.profe), nombre: profeBoton.dataset.nombre });
  const boton = e.target.closest("[data-clase]");
  if (!boton || boton.disabled || !eleccion) return;
  const id = Number(boton.dataset.clase);
  // Una clase la da o la toma: tocar la otra opción cambia.
  if (eleccion.marcadas.get(id) === boton.dataset.valor) eleccion.marcadas.delete(id);
  else eleccion.marcadas.set(id, boton.dataset.valor);
  pintarEleccion();
});

/* ---------- El socio ---------- */

async function entrar() {
  if (!tipeado || enviando) return;
  if (modo === "pin") return entrarProfe();
  enviando = true;
  const codigoSocio = tipeado;
  try {
    const { ok, status, datos: r } = await pedir("/api/socios/entrada", { codigo: codigoSocio });
    if (r.socio_id) recepcion?.postMessage({ socio_id: r.socio_id, entra: Boolean(r.entra) });
    if (!ok) mostrar("error", "No te encontramos", status === 404 ? r.error : "Pasá por recepción.");
    else if (r.entra && r.clases?.length) {
      elegirClases({ nombre: r.nombre, clases: r.clases, da: r.da_clases, alConfirmar: (pedido) => anotarSocio(codigoSocio, r, pedido) });
    } else if (r.entra) saludar(r);
    else mostrar("aviso", `${r.nombre}, pasá por recepción`, r.motivo);
  } catch {
    mostrar("error", "Sin conexión", "Pasá por recepción.");
  } finally {
    enviando = false;
  }
}

function saludar(r, clases = null) {
  const alDia = r.al_dia_hasta ? `Estás al día hasta el ${fechaAR(r.al_dia_hasta)}. ` : "";
  if (!clases) return mostrar("ok", `¡Hola, ${r.nombre}!`, `${alDia}¡Buen entrenamiento!`);
  const partes = [clases.vengo.length ? `Anotado en ${enLista(clases.vengo)}.` : "", clases.doy.length ? `Das ${enLista(clases.doy)}.` : ""];
  mostrar("ok", `¡Hola, ${r.nombre}!`, `${partes.filter(Boolean).join(" ")} ¡Buen entrenamiento!`);
}

async function anotarSocio(codigoSocio, r, { vengo, doy }) {
  if (!vengo.length && !doy.length) return saludar(r);
  const { ok, datos } = await pedir("/api/socios/entrada/clases", { codigo: codigoSocio, clases: vengo, doy });
  if (!ok) return mostrar("aviso", `${r.nombre}, pasá por recepción`, datos.error ?? "");
  saludar(r, datos);
}

/* ---------- El profe ---------- */

botonProfe.addEventListener("click", async () => {
  if (enviando) return;
  enviando = true;
  try {
    const { ok, datos: profes } = await pedir("/api/socios/entrada/profes");
    if (!ok) return mostrar("error", "Sin conexión", "Probá de nuevo.");
    const lista = profes.length
      ? `<div class="entrada-profes">${profes
          .map((p) => `<button type="button" data-profe="${p.id}" data-nombre="${esc(p.nombre)}">${esc(p.nombre)}</button>`)
          .join("")}</div>`
      : `<p class="entrada-paso-ayuda">Todavía no hay profes con PIN: el dueño los carga en Empleados.</p>`;
    mostrarPaso(`
      <h1 class="entrada-titulo">¿Quién sos?</h1>
      <p class="entrada-paso-ayuda">Si también sos alumno, entrá con tu DNI: ahí podés marcar "La doy".</p>
      ${lista}
      <div class="entrada-paso-acciones"><button type="button" class="entrada-volver" data-accion="volver">Volver</button></div>`);
    clearTimeout(volver);
    volver = setTimeout(reiniciar, MS_ELEGIR);
  } catch {
    mostrar("error", "Sin conexión", "Probá de nuevo.");
  } finally {
    enviando = false;
  }
});

function pedirPin(elegido) {
  clearTimeout(volver);
  modo = "pin";
  profe = elegido;
  tipeado = "";
  titulo.textContent = `Hola, ${elegido.nombre}: poné tu PIN`;
  pintarCodigo();
  paso.hidden = true;
  cuerpo.hidden = false;
  volver = setTimeout(reiniciar, MS_ELEGIR);
}

async function entrarProfe() {
  enviando = true;
  const credenciales = { empleado_id: profe.id, pin: tipeado };
  try {
    const { ok, datos: r } = await pedir("/api/socios/entrada/profe", credenciales);
    if (!ok) return mostrar("error", "No pudimos anotarte", r.error ?? "Probá de nuevo.");
    if (!r.clases.length) return mostrar("aviso", `Hola, ${r.nombre}`, "No hay clases ahora para anotarte.");
    elegirClases({
      nombre: r.nombre,
      clases: r.clases,
      soloDoy: true,
      alConfirmar: async ({ doy }) => {
        if (!doy.length) return reiniciar();
        const { ok: anotado, datos } = await pedir("/api/socios/entrada/profe", { ...credenciales, doy });
        if (!anotado) return mostrar("error", "No pudimos anotarte", datos.error ?? "");
        mostrar("ok", `¡Buena clase, ${datos.nombre}!`, `Das ${enLista(datos.doy)}.`);
      }
    });
  } catch {
    mostrar("error", "Sin conexión", "Pasá por recepción.");
  } finally {
    enviando = false;
  }
}

/* ---------- El teclado ---------- */

function tecla(valor) {
  if (!resultado.hidden) reiniciar();
  if (valor === "borrar") tipeado = tipeado.slice(0, -1);
  else if (valor === "entrar") return entrar();
  else if (tipeado.length < MAX_DIGITOS) tipeado += valor;
  pintarCodigo();
}

document.getElementById("entradaTeclado").addEventListener("click", (e) => {
  // A pantalla completa con el primer toque: el navegador lo pide así.
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  const boton = e.target.closest("[data-tecla]");
  if (boton) tecla(boton.dataset.tecla);
});

// Con un teclado de verdad (una compu en la puerta, o un lector de carnets
// que tipea el número y Enter). Eligiendo la clase, Enter es "Listo".
document.addEventListener("keydown", (e) => {
  if (!visible() || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.(".modal")) return;
  if (!paso.hidden) {
    if (e.key === "Enter" && eleccion) confirmarEleccion();
    else if (e.key === "Escape") reiniciar();
    else return;
  } else if (/^\d$/.test(e.key)) tecla(e.key);
  else if (e.key === "Backspace") tecla("borrar");
  else if (e.key === "Enter") tecla("entrar");
  else if (e.key === "Escape" && modo === "pin") reiniciar();
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
  document.getElementById("entradaHora").textContent = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

document.getElementById("entradaSalir").addEventListener("click", async () => {
  const seguro = await confirmar({
    cuerpo: "¿Salir de la pantalla de entrada? Los socios ya no van a poder anotarse solos.",
    aceptar: "Salir"
  });
  if (!seguro) return;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  // Abierta desde la recepción, es su ventana: se cierra. Si no, va a Ingreso.
  if (window.opener) window.close();
  else mostrarVista("ingreso");
});

alEntrarEnVista("entrada", () => {
  reiniciar();
  clearInterval(reloj);
  reloj = setInterval(pintarHora, 5000);
  pintarHora();
});
