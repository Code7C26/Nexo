/**
 * core/al-vender.js
 * Lo que se usa al vender (hist. §126): la caja, la bolsa, el frasquito. Cada
 * producto dice qué suele llevar (Producción → Al vender), y al vender Nexo lo
 * propone; quien vende lo cambia en el momento (a veces ninguna bolsa, a veces
 * dos). Lo usan el alta de venta (app.js) y el punto de venta (pos.js).
 *
 * crearConsumos(contenedor) arma el bloque y devuelve:
 * - cargar(): trae lo configurado (GET /api/componentes-venta) y el stock, sin
 *   tocar lo que ya se cambió (una venta que falló se corrige y se reintenta);
 * - reiniciar(): empieza de cero, para una venta nueva;
 * - proponer(items): recalcula con los renglones, sin pisar lo que se tocó;
 * - fijar(consumos, items): lo de una venta que se edita, como si se hubiera
 *   tocado;
 * - leer(): lo que se manda como `consumos`, o undefined si no se pudo cargar
 *   (el servidor pone lo de siempre).
 * La cuenta es la misma que consumosPropuestos en server.js: lo de cada unidad
 * se suma, y lo de una vez por venta va una sola vez.
 */

import { api } from "./api.js";
import { cantidad, esc } from "./formato.js";
import { icono } from "./iconos.js";

const redondear3 = (n) => Math.round(n * 1000) / 1000;
const claveDe = (c) => `${c.producto_id}:${c.variante_id ?? ""}`;

export function propuestaDe(items, porProducto) {
  const total = new Map();
  const porVenta = new Map();
  for (const item of items) {
    for (const c of porProducto.get(item.producto_id) ?? []) {
      const clave = claveDe(c);
      if (c.por_venta) porVenta.set(clave, { c, cantidad: Math.max(porVenta.get(clave)?.cantidad ?? 0, c.cantidad) });
      else total.set(clave, { c, cantidad: (total.get(clave)?.cantidad ?? 0) + c.cantidad * Number(item.cantidad) });
    }
  }
  for (const [clave, { c, cantidad: cuanto }] of porVenta) {
    total.set(clave, { c, cantidad: (total.get(clave)?.cantidad ?? 0) + cuanto });
  }
  return new Map([...total].map(([clave, { c, cantidad: cuanto }]) => [clave, { ...c, cantidad: redondear3(cuanto) }]));
}

export function crearConsumos(contenedor) {
  let porProducto = null;
  // Lo configurado en algún producto, por clave: lo que se puede sumar a mano.
  let conocidos = new Map();
  // clave → { producto_id, variante_id, nombre, unidad, stock, cantidad, tocada }
  let filas = new Map();
  // Lo que quien vende sacó: no se vuelve a proponer en esta venta.
  let quitadas = new Set();
  // Lo que usaba la venta que se edita: vuelve al stock al guardarla.
  let liberado = new Map();

  contenedor.classList.add("consumos");
  contenedor.innerHTML = `
    <p class="consumos-titulo">Se usa al vender</p>
    <ul class="consumos-lista"></ul>
    <label class="consumos-agregar" hidden>
      <span class="visualmente-oculto">Usar otra cosa</span>
      <select></select>
    </label>`;
  const lista = contenedor.querySelector(".consumos-lista");
  const agregar = contenedor.querySelector(".consumos-agregar");
  const selector = agregar.querySelector("select");

  // "Hay N" solo cuando no alcanza; si alcanza, la unidad (kg, ml) o nada.
  function textoHay(clave, fila) {
    const disponible = (fila.stock ?? Infinity) + (liberado.get(clave) ?? 0);
    if (fila.cantidad > disponible) return { falta: true, texto: `Hay ${cantidad(Math.max(disponible, 0), fila.unidad)}` };
    return { falta: false, texto: fila.unidad && fila.unidad !== "unidad" ? fila.unidad : "" };
  }

  function pintar() {
    contenedor.hidden = filas.size === 0 && quitadas.size === 0;
    lista.innerHTML = [...filas]
      .map(([clave, f]) => {
        const { falta, texto } = textoHay(clave, f);
        return `
        <li class="consumo" data-clave="${esc(clave)}">
          <span class="consumo-nombre">${esc(f.nombre)}</span>
          <input type="number" class="consumo-cantidad" value="${esc(f.cantidad)}" min="0" step="any" inputmode="decimal" aria-label="Cuánto de ${esc(f.nombre)}" />
          <span class="consumo-hay${falta ? " es-poco" : ""}" aria-live="polite">${esc(texto)}</span>
          <button type="button" class="item-row-remove" data-accion="quitar" aria-label="No usar ${esc(f.nombre)}">${icono("x")}</button>
        </li>`;
      })
      .join("");
    const sumables = [...conocidos].filter(([clave]) => !filas.has(clave));
    agregar.hidden = sumables.length === 0 || contenedor.hidden;
    selector.innerHTML =
      '<option value="">+ Usar otra cosa…</option>' +
      sumables.map(([clave, c]) => `<option value="${esc(clave)}">${esc(c.nombre)}</option>`).join("");
  }

  lista.addEventListener("input", (e) => {
    const input = e.target.closest(".consumo-cantidad");
    if (!input) return;
    const clave = input.closest(".consumo").dataset.clave;
    const fila = filas.get(clave);
    fila.cantidad = Number(input.value) || 0;
    fila.tocada = true;
    const { falta, texto } = textoHay(clave, fila);
    const hay = input.nextElementSibling;
    hay.classList.toggle("es-poco", falta);
    hay.textContent = texto;
  });
  lista.addEventListener("click", (e) => {
    const boton = e.target.closest('[data-accion="quitar"]');
    if (!boton) return;
    const clave = boton.closest(".consumo").dataset.clave;
    filas.delete(clave);
    quitadas.add(clave);
    pintar();
  });
  selector.addEventListener("change", () => {
    const clave = selector.value;
    const c = conocidos.get(clave);
    if (!c) return;
    quitadas.delete(clave);
    filas.set(clave, { ...c, cantidad: 1, tocada: true });
    pintar();
    lista.querySelector(`[data-clave="${CSS.escape(clave)}"] .consumo-cantidad`)?.focus();
  });

  function reiniciar() {
    filas = new Map();
    quitadas = new Set();
    liberado = new Map();
    pintar();
  }

  function proponer(items) {
    if (!porProducto) return;
    const propuesta = propuestaDe(items, porProducto);
    for (const [clave, fila] of filas) {
      if (!fila.tocada && !propuesta.has(clave)) filas.delete(clave);
    }
    for (const [clave, c] of propuesta) {
      if (quitadas.has(clave) || filas.get(clave)?.tocada) continue;
      filas.set(clave, { ...c, tocada: false });
    }
    pintar();
  }

  return {
    async cargar() {
      try {
        const configurados = await api("/api/componentes-venta");
        porProducto = new Map(configurados.map((t) => [t.producto_id, t.componentes]));
        conocidos = new Map(configurados.flatMap((t) => t.componentes).map((c) => [claveDe(c), c]));
      } catch {
        // Sin la lista, el servidor pone lo de siempre: la venta no se frena.
        porProducto = null;
        conocidos = new Map();
      }
      for (const [clave, fila] of filas) fila.stock = conocidos.get(clave)?.stock;
      pintar();
    },
    reiniciar,
    proponer,
    fijar(consumos, items) {
      reiniciar();
      for (const c of consumos ?? []) {
        const clave = claveDe(c);
        liberado.set(clave, c.cantidad);
        filas.set(clave, { ...c, stock: conocidos.get(clave)?.stock, tocada: true });
      }
      // Lo que se proponía y esta venta no usó, se sacó a propósito.
      if (porProducto) for (const clave of propuestaDe(items, porProducto).keys()) if (!filas.has(clave)) quitadas.add(clave);
      pintar();
    },
    leer() {
      if (!porProducto) return undefined;
      return [...filas.values()]
        .filter((f) => f.cantidad > 0)
        .map((f) => ({ producto_id: f.producto_id, variante_id: f.variante_id ?? null, cantidad: redondear3(f.cantidad) }));
    }
  };
}
