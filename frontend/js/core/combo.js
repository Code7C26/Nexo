/**
 * core/combo.js
 * Las listas para elegir un cliente, un proveedor o un producto mientras se
 * escribe, con la cara de Nexo y no la del navegador (hist. §175): la lista
 * nativa de <datalist> se ve distinta en cada navegador, no se puede estilar
 * y en el tema oscuro queda gris sobre negro.
 *
 * No hay que llamar a nada: todo <input list="…"> de la página (también los
 * que se agregan después, como los renglones de una venta) pasa a usar esta
 * lista. El <datalist> sigue siendo de dónde salen las opciones, así que el
 * código que lo llena no cambia. Lo que se escribe sigue valiendo aunque no
 * esté en la lista (un cliente o un proveedor nuevo): con
 * data-combo-nuevo="proveedor nuevo", la lista lo avisa abajo.
 */

import { esc, numero } from "./formato.js";
import { icono } from "./iconos.js";

const MAX_OPCIONES = 50;

const normalizar = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const panel = document.createElement("ul");
panel.className = "combo-lista";
panel.id = "comboLista";
panel.setAttribute("role", "listbox");
panel.hidden = true;
document.body.append(panel);

// El campo que tiene la lista abierta, lo que muestra y cuál está marcada.
let campo = null;
let opciones = [];
let activa = -1;
// Mientras se elige, el "input" que se avisa no vuelve a abrir la lista.
let eligiendo = false;

function preparar(input) {
  input.dataset.lista = input.getAttribute("list");
  input.removeAttribute("list");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", panel.id);
  input.autocomplete = "off";
}

function prepararEn(raiz) {
  if (raiz.matches?.("input[list]")) preparar(raiz);
  raiz.querySelectorAll?.("input[list]").forEach(preparar);
}

prepararEn(document.body);
new MutationObserver((cambios) => {
  for (const cambio of cambios) {
    for (const nodo of cambio.addedNodes) if (nodo.nodeType === 1) prepararEn(nodo);
  }
}).observe(document.body, { childList: true, subtree: true });

// Las opciones del <datalist>: el valor y, si la opción trae un texto
// distinto, ese texto como detalle.
function opcionesDe(input) {
  const lista = document.getElementById(input.dataset.lista);
  if (!lista) return [];
  return [...lista.options].map((o) => {
    const detalle = (o.label || o.textContent || "").trim();
    return { valor: o.value, detalle: detalle && detalle !== o.value ? detalle : "" };
  });
}

function filtrar(input) {
  const consulta = normalizar(input.value);
  const palabras = consulta.split(" ").filter(Boolean);
  const todas = opcionesDe(input);
  const coinciden = todas.filter((o) => {
    const texto = normalizar(`${o.valor} ${o.detalle}`);
    return palabras.every((p) => texto.includes(p));
  });
  // Primero las que empiezan con lo escrito.
  if (consulta) coinciden.sort((a, b) => normalizar(b.valor).startsWith(consulta) - normalizar(a.valor).startsWith(consulta));
  const exacta = Boolean(consulta) && todas.some((o) => normalizar(o.valor) === consulta);
  return { coinciden, exacta, consulta };
}

function pintar() {
  const { coinciden, exacta, consulta } = filtrar(campo);
  opciones = coinciden.slice(0, MAX_OPCIONES);
  const nuevo = campo.dataset.comboNuevo && consulta && !exacta;
  if (opciones.length === 0 && !nuevo) {
    cerrar();
    return;
  }
  activa = Math.min(activa, opciones.length - 1);
  const filas = opciones.map(
    (o, i) => `
      <li class="combo-opcion" role="option" id="comboOpcion${i}" data-i="${i}" aria-selected="false">
        <span class="combo-opcion-valor">${esc(o.valor)}</span>
        ${o.detalle ? `<span class="combo-opcion-detalle">${esc(o.detalle)}</span>` : ""}
      </li>`
  );
  const otras = coinciden.length - opciones.length;
  if (otras > 0) filas.push(`<li class="combo-mas" aria-hidden="true">Seguí escribiendo para ver las otras ${numero(otras)}</li>`);
  if (nuevo) {
    filas.push(`
      <li class="combo-nuevo" aria-hidden="true">
        ${icono("plus")}
        <strong>${esc(campo.value.trim())}</strong>
        <span>${esc(campo.dataset.comboNuevo)}</span>
      </li>`);
  }
  panel.innerHTML = filas.join("");
  panel.hidden = false;
  campo.setAttribute("aria-expanded", "true");
  marcar(activa);
  ubicar();
}

function abrir(input) {
  if (campo && campo !== input) cerrar();
  campo = input;
  pintar();
}

function cerrar() {
  panel.hidden = true;
  panel.innerHTML = "";
  campo?.setAttribute("aria-expanded", "false");
  campo?.removeAttribute("aria-activedescendant");
  campo = null;
  opciones = [];
  activa = -1;
}

function marcar(i) {
  activa = i;
  for (const fila of panel.querySelectorAll(".combo-opcion")) {
    fila.setAttribute("aria-selected", String(Number(fila.dataset.i) === i));
  }
  if (i >= 0) {
    campo.setAttribute("aria-activedescendant", `comboOpcion${i}`);
    document.getElementById(`comboOpcion${i}`)?.scrollIntoView({ block: "nearest" });
  } else {
    campo.removeAttribute("aria-activedescendant");
  }
}

// Debajo del campo, o arriba si abajo no entra; fija a la ventana, así
// ningún modal con scroll la recorta.
function ubicar() {
  if (!campo) return;
  const caja = campo.getBoundingClientRect();
  if (caja.width === 0) {
    cerrar();
    return;
  }
  const ancho = Math.max(caja.width, 220);
  const abajo = window.innerHeight - caja.bottom;
  const arriba = abajo < Math.min(panel.scrollHeight, 320) + 12 && caja.top > abajo;
  panel.style.left = `${Math.max(8, Math.min(caja.left, window.innerWidth - ancho - 8))}px`;
  panel.style.width = `${ancho}px`;
  panel.style.top = arriba ? "" : `${caja.bottom + 6}px`;
  panel.style.bottom = arriba ? `${window.innerHeight - caja.top + 6}px` : "";
}

// Elegir escribe el valor y avisa como si se hubiera tipeado: los formularios
// escuchan "input" y "change" (la condición de pago del proveedor, el precio
// del producto).
function elegir(i) {
  const input = campo;
  const opcion = opciones[i];
  cerrar();
  if (!opcion) return;
  input.value = opcion.valor;
  eligiendo = true;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  eligiendo = false;
}

const conLista = (el) => el instanceof HTMLInputElement && el.dataset.lista !== undefined;

// Se abre al escribir, al tocar el campo o con ↓; no al recibir el foco solo
// (un renglón nuevo que se enfoca no tiene por qué tapar la pantalla).
document.addEventListener("input", (e) => {
  if (conLista(e.target) && !eligiendo) {
    activa = -1;
    abrir(e.target);
  }
});

document.addEventListener("pointerdown", (e) => {
  if (conLista(e.target)) {
    if (campo !== e.target) abrir(e.target);
    return;
  }
  // Tocar la lista no le saca el foco al campo.
  if (panel.contains(e.target)) e.preventDefault();
});

panel.addEventListener("click", (e) => {
  const fila = e.target.closest(".combo-opcion");
  if (fila) elegir(Number(fila.dataset.i));
  else if (e.target.closest(".combo-nuevo")) cerrar();
});

panel.addEventListener("pointermove", (e) => {
  const fila = e.target.closest(".combo-opcion");
  if (fila && Number(fila.dataset.i) !== activa) marcar(Number(fila.dataset.i));
});

// En captura: Escape cierra la lista sin cerrar el modal de atrás, y Enter
// elige sin mandar el formulario.
document.addEventListener(
  "keydown",
  (e) => {
    if (!conLista(e.target)) return;
    const abierta = campo === e.target && !panel.hidden;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!abierta) {
        activa = -1;
        abrir(e.target);
        if (campo && opciones.length) marcar(e.key === "ArrowDown" ? 0 : opciones.length - 1);
        return;
      }
      if (!opciones.length) return;
      marcar((activa + (e.key === "ArrowDown" ? 1 : -1) + opciones.length) % opciones.length);
      return;
    }
    if (!abierta) return;
    if (e.key === "Enter" && activa >= 0) {
      e.preventDefault();
      e.stopPropagation();
      elegir(activa);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cerrar();
    } else if (e.key === "Tab") {
      cerrar();
    }
  },
  true
);

document.addEventListener("focusout", (e) => {
  if (e.target === campo) cerrar();
});
window.addEventListener("resize", ubicar);
document.addEventListener(
  "scroll",
  (e) => {
    if (!panel.hidden && !panel.contains(e.target)) ubicar();
  },
  true
);
