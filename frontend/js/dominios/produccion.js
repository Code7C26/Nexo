/**
 * dominios/produccion.js
 * Producción básica (CLAUDE.md §29, Etapa J de §38): el módulo `produccion`,
 * que cualquier negocio puede prender y que el emprendimiento trae prendido.
 *
 * Pantallas sobre las rutas de server.js, sección "Producción":
 * - Producciones (#/produccion/historial): lo que se hizo y cuánto costó.
 * - Recetas (#/produccion/recetas): lo que suele llevar cada cosa.
 * - Producir (#/produccion/producir, o /producir/<receta>): qué se hizo, qué
 *   se usó y cuánto salió de verdad. Con receta, propone los materiales para
 *   lo que se iba a hacer, y se corrigen en el momento.
 * - La receta (#/produccion/receta, o /receta/<id>): solo el admin la guarda.
 * - La ficha de una producción, con anular (admin).
 *
 * Los materiales son renglones .item-row propios (producto, variante y
 * cantidad, sin precio): los de venta de app.js piden precio y lista. El costo
 * solo lo ve el admin: al empleado el servidor no se lo manda.
 */

import { badge, camposFicha, cantidad, celdaMovil, esAdmin, esc, fechaAR, html, money } from "../core/formato.js";
import { avisar, confirmar, filaVacia, tablaCargando } from "../core/ui.js";
import { api, refrescar } from "../core/api.js";
import { icono } from "../core/iconos.js";
import { alEntrarEnVista, recargar, registrar } from "../core/registro.js";
import { mostrarVista } from "../core/router.js";

const PESTANAS = ["historial", "recetas", "producir", "receta"];
const ESTADOS = {
  activa: { texto: "Hecha", clase: "status-cobrado" },
  anulada: { texto: "Anulada", clase: "" }
};

// Lo que maneja stock y está activo: lo que se produce y los materiales.
let productos = [];
let depositos = [];
let recetas = [];
let fichaProduccion = null;
// La receta que se edita, y el producto con que se abre una nueva desde su
// ficha (o desde "Armar una receta" al producir).
let recetaEditada = null;
let productoPendiente = null;

const variantesCache = new Map();
function variantesDe(productoId) {
  if (!variantesCache.has(productoId)) {
    variantesCache.set(
      productoId,
      api(`/api/productos/${productoId}/variantes`)
        .then((lista) => lista.filter((v) => v.activo))
        .catch((e) => {
          variantesCache.delete(productoId);
          throw e;
        })
    );
  }
  return variantesCache.get(productoId);
}

const productoPorNombre = (nombre) => {
  const buscado = nombre.trim().toLowerCase();
  return productos.find((p) => p.nombre.trim().toLowerCase() === buscado) ?? null;
};
const productoPorId = (id) => productos.find((p) => p.id === id) ?? null;
const redondear3 = (n) => Math.round(n * 1000) / 1000;

async function cargarCatalogo() {
  const [lista, deps] = await Promise.all([api("/api/productos"), api("/api/depositos")]);
  productos = lista.filter((p) => p.activo && p.tipo === "producto");
  depositos = deps.filter((d) => d.activo);
  variantesCache.clear();
  document.getElementById("produccionProductos").innerHTML = productos
    .map((p) => `<option value="${esc(p.nombre)}"></option>`)
    .join("");
}

const recargarOtrasVistas = () => recargar("stock", "productos", "reporteStock");

/* ---------- Producto y variante (los dos formularios) ---------- */

// Resuelve el producto tipeado en `form.producto` y arma su selector de
// variantes. Devuelve el producto, o null si el texto no es ninguno.
async function elegirProducto(form, varianteElegida = null) {
  const producto = productoPorNombre(form.producto.value);
  const campo = form.querySelector('[data-campo="variante"]');
  form.dataset.productoId = producto?.id ?? "";
  if (!producto?.tiene_variantes) {
    campo.hidden = true;
    form.variante_id.innerHTML = "";
    return producto;
  }
  const variantes = await variantesDe(producto.id);
  form.variante_id.innerHTML =
    '<option value="">Elegí una variante…</option>' +
    variantes.map((v) => `<option value="${v.id}">${esc(v.combinacion)}</option>`).join("");
  form.variante_id.value = varianteElegida ?? "";
  campo.hidden = false;
  return producto;
}

const varianteDelForm = (form) =>
  form.querySelector('[data-campo="variante"]').hidden || !form.variante_id.value ? null : Number(form.variante_id.value);

/* ---------- Renglones de materiales ---------- */

// Un renglón: el material, su variante y cuánto. `base` es la cantidad por
// unidad producida que viene de la receta: con ella se recalcula al cambiar lo
// que se iba a hacer, hasta que alguien la toca a mano.
function agregarMaterial(contenedor, { producto_id = null, variante_id = null, cantidad: cuanto = "", base = null } = {}) {
  const fila = document.createElement("div");
  fila.className = "item-row";
  fila.innerHTML = `
    <input type="text" class="item-producto" list="produccionProductos" placeholder="Material…" aria-label="Material" autocomplete="off" />
    <select class="item-variante-id" hidden aria-label="Variante del material"></select>
    <input type="number" class="item-cantidad" min="0" step="any" inputmode="decimal" placeholder="Cant." aria-label="Cantidad" />
    <span class="item-hay" aria-live="polite"></span>
    <button type="button" class="item-row-remove" aria-label="Quitar material">${icono("x")}</button>`;
  const entrada = fila.querySelector(".item-producto");
  const selector = fila.querySelector(".item-variante-id");
  const cantidadInput = fila.querySelector(".item-cantidad");
  if (base !== null) fila.dataset.base = base;

  const cambio = () => contenedor.dispatchEvent(new Event("material-change"));
  async function resolver(varianteElegida = null) {
    const producto = productoPorNombre(entrada.value);
    fila.dataset.productoId = producto?.id ?? "";
    cantidadInput.placeholder = producto && producto.unidad !== "unidad" ? `Cant. (${producto.unidad})` : "Cant.";
    if (producto?.tiene_variantes) {
      const variantes = await variantesDe(producto.id);
      selector.innerHTML =
        '<option value="">Elegí una variante…</option>' +
        variantes.map((v) => `<option value="${v.id}">${esc(v.combinacion)}</option>`).join("");
      selector.value = varianteElegida ?? "";
      selector.hidden = false;
    } else {
      selector.innerHTML = "";
      selector.hidden = true;
    }
    await pintarHay(fila);
    cambio();
  }
  entrada.addEventListener("input", () => resolver());
  selector.addEventListener("change", () => {
    pintarHay(fila);
    cambio();
  });
  cantidadInput.addEventListener("input", () => {
    delete fila.dataset.base;
    pintarHay(fila);
    cambio();
  });
  fila.querySelector(".item-row-remove").addEventListener("click", () => {
    fila.remove();
    cambio();
  });

  contenedor.appendChild(fila);
  const producto = producto_id ? productoPorId(producto_id) : null;
  if (producto) entrada.value = producto.nombre;
  cantidadInput.value = cuanto;
  return resolver(variante_id).then(() => fila);
}

// El material de un renglón: { producto, variante } o null, ya resuelto.
async function materialDeFila(fila) {
  const producto = productoPorId(Number(fila.dataset.productoId));
  if (!producto) return null;
  const selector = fila.querySelector(".item-variante-id");
  const variante =
    !selector.hidden && selector.value ? (await variantesDe(producto.id)).find((v) => v.id === Number(selector.value)) : null;
  return { producto, variante };
}

// Cuánto hay del material, en rojo si no alcanza para lo que se usa. Es el
// stock de todos los depósitos: el servidor controla el del depósito elegido.
async function pintarHay(fila) {
  const hay = fila.querySelector(".item-hay");
  const material = await materialDeFila(fila);
  if (!material || (material.producto.tiene_variantes && !material.variante)) {
    hay.textContent = "";
    return;
  }
  const stock = material.variante ? material.variante.stock : material.producto.stock;
  const usa = Number(fila.querySelector(".item-cantidad").value) || 0;
  hay.textContent = `Hay ${cantidad(stock, material.producto.unidad)}`;
  hay.classList.toggle("es-poco", usa > stock);
}

// Los materiales cargados, como los pide el servidor. Un renglón a medio
// cargar corta con un mensaje; uno vacío del todo se ignora.
async function leerMateriales(contenedor) {
  const items = [];
  for (const fila of contenedor.querySelectorAll(".item-row")) {
    const texto = fila.querySelector(".item-producto").value.trim();
    const cuanto = Number(fila.querySelector(".item-cantidad").value);
    if (!texto && !cuanto) continue;
    const material = await materialDeFila(fila);
    if (!material) return { error: `"${texto}" no está entre tus productos: cargalo primero o elegilo de la lista.` };
    if (material.producto.tiene_variantes && !material.variante) {
      return { error: `Elegí la variante de "${material.producto.nombre}".` };
    }
    if (!(cuanto > 0)) return { error: `Poné cuánto de "${material.producto.nombre}".` };
    items.push({ producto_id: material.producto.id, variante_id: material.variante?.id ?? null, cantidad: redondear3(cuanto) });
  }
  if (items.length === 0) return { error: "Cargá al menos un material." };
  return { items };
}

// Lo que cuestan los materiales cargados, con el costo de hoy (solo admin).
async function costoMateriales(contenedor) {
  let total = 0;
  for (const fila of contenedor.querySelectorAll(".item-row")) {
    const material = await materialDeFila(fila);
    if (!material) continue;
    const costo = material.variante ? material.variante.precio_costo : material.producto.precio_costo;
    total += (Number(fila.querySelector(".item-cantidad").value) || 0) * (costo ?? 0);
  }
  return total;
}

/* ---------- Producciones (#/produccion/historial) ---------- */

const badgeEstado = (p) => badge(ESTADOS[p.estado].clase, ESTADOS[p.estado].texto).html;

async function cargarProducciones() {
  tablaCargando("produccionesBody", 6);
  const producciones = await api("/api/producciones");
  const body = document.getElementById("produccionesBody");
  if (producciones.length === 0) {
    body.innerHTML = filaVacia(6, "Todavía no produjiste nada. Cuando hagas algo, cargalo acá: sale lo que usaste y entra lo que salió.");
    return;
  }
  body.innerHTML = producciones
    .map(
      (p) => `
    <tr class="fila-clickeable" data-id="${p.id}">
      <td data-label="Fecha">${esc(fechaAR(p.fecha))}</td>
      <td data-label="Qué se hizo" class="m-titulo">${esc(p.nombre)}</td>
      ${celdaMovil(fechaAR(p.fecha), p.deposito, p.estado === "anulada" ? "Anulada" : null)}
      <td data-label="Depósito">${esc(p.deposito)}</td>
      <td data-label="Salieron" class="align-right mono m-valor">${esc(cantidad(p.cantidad, p.unidad))}</td>
      <td data-label="Costo de cada uno" class="align-right mono col-admin">${esAdmin() ? money(p.costo_unitario) : ""}</td>
      <td data-label="Estado">${badgeEstado(p)}</td>
    </tr>`
    )
    .join("");
}

document.getElementById("produccionesBody").addEventListener("click", (e) => {
  const fila = e.target.closest("tr[data-id]");
  if (fila) abrirFicha(Number(fila.dataset.id));
});

/* ---------- Recetas (#/produccion/recetas) ---------- */

const resumenMateriales = (r) => r.items.map((i) => i.nombre).join(", ");

async function cargarRecetas() {
  tablaCargando("recetasBody", 5);
  recetas = await api("/api/recetas");
  const body = document.getElementById("recetasBody");
  if (recetas.length === 0) {
    body.innerHTML = esAdmin()
      ? filaVacia(5, "Todavía no hay recetas. Armá la de algo que hacés: qué lleva y cuánto rinde.", {
          accionTexto: "+ Nueva receta",
          accionId: "btnPrimeraReceta"
        })
      : filaVacia(5, "Todavía no hay recetas: las arma el administrador del negocio.");
    return;
  }
  body.innerHTML = recetas
    .map(
      (r) => `
    <tr class="fila-clickeable" data-id="${r.id}">
      <td data-label="Qué se hace" class="m-titulo">${esc(r.nombre)}</td>
      ${celdaMovil(resumenMateriales(r))}
      <td data-label="Lleva">${esc(resumenMateriales(r))}</td>
      <td data-label="Rinde" class="align-right mono m-valor">${esc(cantidad(r.rinde, r.unidad))}</td>
      <td data-label="Costo de cada uno" class="align-right mono col-admin">${esAdmin() ? money(r.costo) : ""}</td>
      <td class="align-right m-accion"><a class="btn btn-secundario" href="#/produccion/producir/${r.id}">Producir</a></td>
    </tr>`
    )
    .join("");
}

document.getElementById("recetasBody").addEventListener("click", (e) => {
  if (e.target.closest("#btnPrimeraReceta")) {
    mostrarVista("produccion", { subruta: "receta" });
    return;
  }
  if (e.target.closest("a")) return;
  const fila = e.target.closest("tr[data-id]");
  if (!fila) return;
  // El admin la edita; el empleado, que no puede, va a producirla.
  mostrarVista("produccion", { subruta: `${esAdmin() ? "receta" : "producir"}/${fila.dataset.id}` });
});

/* ---------- Producir (#/produccion/producir) ---------- */

const formProducir = document.getElementById("formProducir");
const materialesProducir = formProducir.querySelector("[data-materiales]");
// "Salieron" sigue a "¿Cuánto ibas a hacer?" hasta que se toca a mano.
let cantidadTocada = false;

const recetaDe = (productoId, varianteId) =>
  recetas.find((r) => r.producto_id === productoId && (r.variante_id ?? null) === (varianteId ?? null)) ?? null;

async function prepararProducir(recetaId) {
  formProducir.reset();
  formProducir.dataset.productoId = "";
  cantidadTocada = false;
  materialesProducir.innerHTML = "";
  await refrescar([cargarCatalogo(), api("/api/recetas").then((lista) => (recetas = lista))]);

  const campoDeposito = formProducir.querySelector('[data-campo="deposito"]');
  formProducir.deposito_id.innerHTML = depositos.map((d) => `<option value="${d.id}">${esc(d.nombre)}</option>`).join("");
  formProducir.deposito_id.value = depositos.find((d) => d.es_predeterminado)?.id ?? depositos[0]?.id ?? "";
  campoDeposito.hidden = depositos.length < 2;

  const receta = recetaId ? recetas.find((r) => r.id === recetaId) : null;
  if (receta) {
    formProducir.producto.value = productoPorId(receta.producto_id)?.nombre ?? "";
    await elegirProducto(formProducir, receta.variante_id);
  }
  await aplicarReceta();
  formProducir.producto.focus();
}

// Con el producto (y la variante) elegidos, propone lo de su receta; sin
// receta, un renglón vacío para cargar lo que se usó.
async function aplicarReceta() {
  const producto = productoPorId(Number(formProducir.dataset.productoId));
  const receta = producto ? recetaDe(producto.id, varianteDelForm(formProducir)) : null;
  materialesProducir.innerHTML = "";
  const nota = formProducir.querySelector('[data-nota="receta"]');
  if (receta) {
    formProducir.plan.value = receta.rinde;
    if (!cantidadTocada) formProducir.cantidad.value = receta.rinde;
    for (const i of receta.items) {
      await agregarMaterial(materialesProducir, {
        producto_id: i.producto_id,
        variante_id: i.variante_id,
        cantidad: i.cantidad,
        base: i.cantidad / receta.rinde
      });
    }
    nota.textContent = `Su receta rinde ${cantidad(receta.rinde, receta.unidad)}: los materiales se calculan para lo que ibas a hacer.`;
  } else {
    await agregarMaterial(materialesProducir);
    nota.textContent = producto ? "No tiene receta: cargá lo que usaste." : "";
    if (producto && esAdmin()) {
      productoPendiente = producto.id;
      nota.insertAdjacentHTML("beforeend", ' <a href="#/produccion/receta">Armar su receta</a> te ahorra cargarlo cada vez.');
    }
  }
  await resumirProducir();
}

// Lo que se iba a hacer cambia los materiales de la receta que nadie tocó.
formProducir.plan.addEventListener("input", () => {
  const plan = Number(formProducir.plan.value) || 0;
  for (const fila of materialesProducir.querySelectorAll(".item-row[data-base]")) {
    fila.querySelector(".item-cantidad").value = redondear3(Number(fila.dataset.base) * plan) || "";
    pintarHay(fila);
  }
  if (!cantidadTocada) formProducir.cantidad.value = plan || "";
  resumirProducir();
});
formProducir.cantidad.addEventListener("input", () => {
  cantidadTocada = true;
  resumirProducir();
});
formProducir.producto.addEventListener("input", async () => {
  await elegirProducto(formProducir);
  await aplicarReceta();
});
formProducir.variante_id.addEventListener("change", aplicarReceta);
materialesProducir.addEventListener("material-change", () => resumirProducir());
formProducir.querySelector('[data-accion="agregar"]').addEventListener("click", () => agregarMaterial(materialesProducir));

async function resumirProducir() {
  const resumen = formProducir.querySelector("[data-resumen]");
  const producto = productoPorId(Number(formProducir.dataset.productoId));
  const salieron = Number(formProducir.cantidad.value) || 0;
  if (!producto) {
    resumen.textContent = "Elegí qué hiciste.";
    return;
  }
  const entran = salieron > 0 ? `Entran ${cantidad(salieron, producto.unidad)} al stock.` : "Poné cuánto salió.";
  if (!esAdmin() || salieron <= 0) {
    resumen.textContent = entran;
    return;
  }
  const costo = await costoMateriales(materialesProducir);
  resumen.textContent = `${entran} Costo: ${money(costo)}, ${money(costo / salieron)} cada uno.`;
}

formProducir.addEventListener("submit", async (e) => {
  e.preventDefault();
  const producto = productoPorId(Number(formProducir.dataset.productoId));
  if (!producto) return avisar("Elegí qué hiciste: tiene que ser uno de tus productos.", "error");
  const varianteId = varianteDelForm(formProducir);
  if (producto.tiene_variantes && !varianteId) return avisar(`Elegí la variante de "${producto.nombre}".`, "error");
  const salieron = Number(formProducir.cantidad.value);
  if (!(salieron > 0)) return avisar("Poné cuánto salió de verdad.", "error");
  const { items, error } = await leerMateriales(materialesProducir);
  if (error) return avisar(error, "error");

  const boton = formProducir.querySelector('[type="submit"]');
  boton.disabled = true;
  let id;
  try {
    ({ id } = await api("/api/producciones", {
      method: "POST",
      body: {
        producto_id: producto.id,
        variante_id: varianteId,
        cantidad: redondear3(salieron),
        deposito_id: Number(formProducir.deposito_id.value) || null,
        nota: formProducir.nota.value,
        items
      },
      error: "No se pudo guardar la producción."
    }));
  } finally {
    boton.disabled = false;
  }
  avisar(`Listo: ${cantidad(salieron, producto.unidad)} de "${producto.nombre}" al stock.`, "ok");
  await refrescar([recargarOtrasVistas()]);
  await abrirFicha(id);
});

/* ---------- La receta (#/produccion/receta) ---------- */

const formReceta = document.getElementById("formReceta");
const materialesReceta = formReceta.querySelector("[data-materiales]");
const botonBorrar = formReceta.querySelector('[data-accion="borrar"]');

async function prepararReceta(recetaId) {
  formReceta.reset();
  formReceta.dataset.productoId = "";
  materialesReceta.innerHTML = "";
  recetaEditada = null;
  await cargarCatalogo();
  if (recetaId) recetaEditada = await api(`/api/recetas/${recetaId}`, { error: "No se pudo cargar la receta." });

  // El producto de una receta que ya existe no cambia: sería otra receta.
  formReceta.producto.disabled = Boolean(recetaEditada);
  formReceta.variante_id.disabled = Boolean(recetaEditada);
  botonBorrar.hidden = !recetaEditada;
  const productoId = recetaEditada?.producto_id ?? productoPendiente;
  productoPendiente = null;
  if (productoId) {
    formReceta.producto.value = productoPorId(productoId)?.nombre ?? recetaEditada?.producto ?? "";
    await elegirProducto(formReceta, recetaEditada?.variante_id);
  }
  if (recetaEditada) {
    formReceta.rinde.value = recetaEditada.rinde;
    formReceta.nota.value = recetaEditada.nota ?? "";
    for (const i of recetaEditada.items) {
      await agregarMaterial(materialesReceta, { producto_id: i.producto_id, variante_id: i.variante_id, cantidad: i.cantidad });
    }
  } else {
    await agregarMaterial(materialesReceta);
  }
  await resumirReceta();
  (productoId ? formReceta.rinde : formReceta.producto).focus();
}

async function resumirReceta() {
  const resumen = formReceta.querySelector("[data-resumen]");
  const rinde = Number(formReceta.rinde.value) || 0;
  if (!esAdmin() || rinde <= 0) {
    resumen.textContent = "";
    return;
  }
  const costo = await costoMateriales(materialesReceta);
  resumen.textContent = `Con los costos de hoy, cada uno sale ${money(costo / rinde)}.`;
}

formReceta.producto.addEventListener("input", () => elegirProducto(formReceta));
formReceta.rinde.addEventListener("input", resumirReceta);
materialesReceta.addEventListener("material-change", resumirReceta);
formReceta.querySelector('[data-accion="agregar"]').addEventListener("click", () => agregarMaterial(materialesReceta));

formReceta.addEventListener("submit", async (e) => {
  e.preventDefault();
  const productoId = recetaEditada?.producto_id ?? productoPorId(Number(formReceta.dataset.productoId))?.id;
  if (!productoId) return avisar("Elegí de qué es la receta: tiene que ser uno de tus productos.", "error");
  const producto = productoPorId(productoId);
  const varianteId = recetaEditada ? recetaEditada.variante_id : varianteDelForm(formReceta);
  if (!recetaEditada && producto?.tiene_variantes && !varianteId) return avisar(`Elegí la variante de "${producto.nombre}".`, "error");
  const rinde = Number(formReceta.rinde.value);
  if (!(rinde > 0)) return avisar("Poné cuánto rinde la receta.", "error");
  const { items, error } = await leerMateriales(materialesReceta);
  if (error) return avisar(error, "error");

  const cuerpo = { rinde: redondear3(rinde), nota: formReceta.nota.value, items };
  const boton = formReceta.querySelector('[type="submit"]');
  boton.disabled = true;
  try {
    await api(recetaEditada ? `/api/recetas/${recetaEditada.id}` : "/api/recetas", {
      method: recetaEditada ? "PUT" : "POST",
      body: recetaEditada ? cuerpo : { ...cuerpo, producto_id: productoId, variante_id: varianteId },
      error: "No se pudo guardar la receta."
    });
  } finally {
    boton.disabled = false;
  }
  avisar(recetaEditada ? "Receta guardada." : "Receta lista: ya la podés usar al producir.", "ok");
  mostrarVista("produccion", { subruta: "recetas" });
});

botonBorrar.addEventListener("click", async () => {
  if (!recetaEditada) return;
  const seguro = await confirmar({
    cuerpo: `¿Borrar la receta de "${recetaEditada.nombre}"? Lo que ya produjiste no cambia.`,
    aceptar: "Borrar receta",
    destructivo: true
  });
  if (!seguro) return;
  await api(`/api/recetas/${recetaEditada.id}`, { method: "DELETE", error: "No se pudo borrar la receta." });
  avisar("Receta borrada.", "ok");
  mostrarVista("produccion", { subruta: "recetas" });
});

/* ---------- Ficha de una producción ---------- */

function pintarFicha(p) {
  fichaProduccion = p;
  document.getElementById("fichaProduccionTitulo").textContent = `Producción #${p.id}`;
  document.getElementById("fichaProduccionAcciones").innerHTML =
    esAdmin() && p.estado === "activa" ? '<button type="button" class="btn btn-secundario" data-accion="anular">Anular</button>' : "";
  document.getElementById("fichaProduccionDatos").innerHTML = camposFicha([
    ["Qué se hizo", p.nombre],
    ["Salieron", cantidad(p.cantidad, p.unidad)],
    ["Fecha", fechaAR(p.fecha)],
    ["Depósito", p.deposito],
    ["Estado", html(badgeEstado(p))],
    ...(esAdmin()
      ? [
          ["Costo total", money(p.costo_total)],
          ["Costo de cada uno", money(p.costo_unitario)]
        ]
      : []),
    ["Nota", p.nota]
  ]);
  document.getElementById("fichaProduccionItems").innerHTML = p.items
    .map(
      (i) => `
    <tr>
      <td data-label="Material">${esc(i.nombre)}</td>
      <td data-label="Cantidad" class="align-right mono">${esc(cantidad(i.cantidad, i.unidad))}</td>
      <td data-label="Costo" class="align-right mono col-admin">${esAdmin() ? money(i.cantidad * i.costo_unitario) : ""}</td>
    </tr>`
    )
    .join("");
}

async function abrirFicha(id) {
  pintarFicha(await api(`/api/producciones/${id}`, { error: "No se pudo cargar la producción." }));
  mostrarVista("produccion-detalle", { titulo: `Producción #${id}` });
}

document.getElementById("fichaProduccionAcciones").addEventListener("click", async (e) => {
  const boton = e.target.closest('[data-accion="anular"]');
  if (!boton || !fichaProduccion) return;
  const seguro = await confirmar({
    cuerpo: `¿Anular la producción #${fichaProduccion.id}? Los materiales vuelven al stock, sale lo que se hizo (${cantidad(fichaProduccion.cantidad, fichaProduccion.unidad)} de "${fichaProduccion.nombre}") y su costo deja de contar.`,
    aceptar: "Anular",
    destructivo: true
  });
  if (!seguro) return;
  boton.disabled = true;
  try {
    await api(`/api/producciones/${fichaProduccion.id}/anular`, { method: "POST", error: "No se pudo anular la producción." });
  } finally {
    boton.disabled = false;
  }
  avisar("Producción anulada.", "ok");
  await refrescar([recargarOtrasVistas()]);
  await abrirFicha(fichaProduccion.id);
});
document.getElementById("btnVolverProducciones").addEventListener("click", () => mostrarVista("produccion", { subruta: "historial" }));

/* ---------- Entrar a la vista ---------- */

// La subruta es la pestaña, y la página con su id: "producir/3", "receta/5".
async function entrarAProduccion(subruta) {
  const [nombre, id] = (subruta ?? "").split("/");
  let pestana = PESTANAS.includes(nombre) ? nombre : "historial";
  // Una receta la guarda solo el admin.
  if (pestana === "receta" && !esAdmin()) pestana = "recetas";
  const esperada = id && (pestana === "producir" || pestana === "receta") ? `${pestana}/${id}` : pestana;
  if (subruta !== esperada) history.replaceState(null, "", `#/produccion/${esperada}`);

  for (const seccion of document.querySelectorAll(".produccion-pestana")) seccion.hidden = seccion.dataset.pestana !== pestana;
  const menu = document.getElementById("produccionMenu");
  menu.hidden = pestana === "producir" || pestana === "receta";
  for (const enlace of menu.querySelectorAll(".segmento")) {
    if (enlace.dataset.pestana === pestana) enlace.setAttribute("aria-current", "page");
    else enlace.removeAttribute("aria-current");
  }

  if (pestana === "historial") await cargarProducciones();
  else if (pestana === "recetas") await cargarRecetas();
  else if (pestana === "producir") await prepararProducir(Number(id) || null);
  else await prepararReceta(Number(id) || null);
}

// Desde la ficha del producto (app.js): su receta, o una nueva para él.
registrar("abrirReceta:producto", async (productoId) => {
  const suya = (await api("/api/recetas")).find((r) => r.producto_id === productoId && !r.variante_id);
  if (!suya) productoPendiente = productoId;
  mostrarVista("produccion", { subruta: suya ? `receta/${suya.id}` : "receta" });
});

alEntrarEnVista("produccion", entrarAProduccion);
registrar("cargar:producciones", cargarProducciones);
registrar("abrirFicha:produccion", abrirFicha);
