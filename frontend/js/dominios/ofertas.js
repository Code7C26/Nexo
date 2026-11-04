/**
 * dominios/ofertas.js
 * Ofertas con vigencia (hist. §133): bajan el precio de lista por un tiempo,
 * sin tocar las listas. Pantallas sobre las rutas de server.js, sección
 * "Ofertas con vigencia", solo del admin (el empleado las ve aplicadas en el
 * mostrador y en las ventas):
 * - la lista (#/ofertas), con "Los precios de un día": qué cambia ese día;
 * - la página de cada una (#/ofertas/nueva, #/ofertas/<id>), en tres pasos:
 *   cuánto baja, a qué y cuándo. Desde ahí se pausa y se vuelve a prender.
 *
 * Las reglas (cuándo vale, cuál gana) son las de core/ofertas.js, las mismas
 * que usa el servidor.
 */

import { badge, celdaMovil, esAdmin, esc, hoyISO, money } from "../core/formato.js";
import { avisar, filaVacia, tablaCargando } from "../core/ui.js";
import { api } from "../core/api.js";
import { icono } from "../core/iconos.js";
import { alEntrarEnVista } from "../core/registro.js";
import { mostrarVista } from "../core/router.js";
import {
  DIAS_SEMANA,
  describirOferta,
  describirVigencia,
  estadoOferta,
  mejorOferta,
  proximaPromocion
} from "../core/ofertas.js";

const ESTADOS = {
  vigente: { texto: "Vigente", clase: "status-cobrado", orden: 0 },
  "hoy-no": { texto: "Hoy no", clase: "status-info", orden: 1 },
  proxima: { texto: "Próxima", clase: "status-pendiente", orden: 2 },
  pausada: { texto: "Pausada", clase: "", orden: 3 },
  terminada: { texto: "Terminada", clase: "", orden: 4 }
};
const badgeEstado = (estado) => badge(estado.clase, estado.texto).html;
const MAX_PRECIOS_DEL_DIA = 100;
// Cómo se pide el valor según el tipo de oferta.
const CAMPO_VALOR = {
  porcentaje: { texto: "Porcentaje", sufijo: "%", placeholder: "15" },
  monto: { texto: "Cuánto menos por unidad", sufijo: "$", placeholder: "500" },
  precio: { texto: "Precio por unidad", sufijo: "$", placeholder: "9000" }
};

let ofertas = [];
let productos = [];
let categorias = [];
let listas = [];
// La oferta que se edita (null es una nueva) y los productos elegidos.
let ofertaEditada = null;
let elegidos = [];

const productoPorId = (id) => productos.find((p) => p.id === id) ?? null;
const listaPredeterminada = () => listas.find((l) => l.es_predeterminada)?.id ?? null;
const conUnidad = (p) => (p.unidad && p.unidad !== "unidad" ? ` ${p.unidad}` : "");

async function cargarMaestros() {
  [ofertas, productos, categorias, listas] = await Promise.all([
    api("/api/ofertas"),
    api("/api/productos"),
    api("/api/categorias"),
    api("/api/listas-precios")
  ]);
}

/* ---------- La lista (#/ofertas) ---------- */

// "3 productos", "Vacuno y Cerdo", "Todo el catálogo"; y la lista, si es una.
function queToca(oferta) {
  const nombres =
    oferta.alcance === "todo"
      ? []
      : oferta.alcance === "categorias"
        ? oferta.categorias.map((id) => categorias.find((c) => c.id === id)?.nombre ?? "—")
        : oferta.productos.map((id) => productoPorId(id)?.nombre ?? "—");
  let texto = "Todo el catálogo";
  if (nombres.length) texto = nombres.length <= 2 ? nombres.join(" y ") : `${nombres.slice(0, 2).join(", ")} y ${nombres.length - 2} más`;
  return oferta.lista ? `${texto} · ${oferta.lista}` : texto;
}

function pintarLista() {
  const body = document.getElementById("ofertasBody");
  if (ofertas.length === 0) {
    body.innerHTML = filaVacia(4, "Todavía no hay ofertas. Armá una: cuánto baja, a qué y cuándo.", {
      accionTexto: "+ Nueva oferta",
      accionId: "btnPrimeraOferta"
    });
    return;
  }
  const hoy = hoyISO();
  body.innerHTML = ofertas
    .map((o) => ({ oferta: o, estado: ESTADOS[estadoOferta(o, hoy)] }))
    .sort((a, b) => a.estado.orden - b.estado.orden || b.oferta.id - a.oferta.id)
    .map(
      ({ oferta: o, estado }) => `
    <tr class="fila-clickeable" data-id="${o.id}">
      <td data-label="Oferta" class="m-titulo">${esc(o.nombre)}<small class="ofertas-cuanto">${esc(describirOferta(o))}</small></td>
      ${celdaMovil(queToca(o), describirVigencia(o))}
      <td data-label="Qué toca">${esc(queToca(o))}</td>
      <td data-label="Cuándo">${esc(describirVigencia(o))}</td>
      <td data-label="Estado" class="m-valor">${badgeEstado(estado)}</td>
    </tr>`
    )
    .join("");
}

document.getElementById("ofertasBody").addEventListener("click", (e) => {
  if (e.target.closest("#btnPrimeraOferta")) return mostrarVista("ofertas", { subruta: "nueva" });
  const fila = e.target.closest("tr[data-id]");
  if (fila) mostrarVista("ofertas", { subruta: fila.dataset.id });
});

// Los precios de un día: cada producto activo al que una oferta le cambia el
// precio ese día, en la lista predeterminada y por una unidad, y la promoción
// por cantidad que tenga.
function pintarPreciosDelDia() {
  const dia = document.getElementById("ofertasDia").value || hoyISO();
  const lista = document.getElementById("ofertasDiaLista");
  const listaId = listaPredeterminada();
  const filas = [];
  for (const p of productos) {
    if (!p.activo || !(p.precio_venta > 0)) continue;
    const renglon = { producto_id: p.id, categoria_id: p.categoria_id, lista_id: listaId, cantidad: 1, precio_lista: p.precio_venta };
    const mejor = mejorOferta(ofertas, renglon, dia);
    const promo = proximaPromocion(ofertas, renglon, dia);
    if (mejor || promo) filas.push({ p, mejor, promo });
    if (filas.length >= MAX_PRECIOS_DEL_DIA) break;
  }
  if (filas.length === 0) {
    lista.innerHTML = `<li class="ofertas-dia-vacio">Ese día ninguna oferta cambia un precio.</li>`;
    return;
  }
  lista.innerHTML = filas
    .map(({ p, mejor, promo }) => {
      const porUnidad = p.unidad && p.unidad !== "unidad" ? ` / ${esc(p.unidad)}` : "";
      const precio = mejor
        ? `<s>${money(p.precio_venta)}</s> <strong>${money(mejor.precio)}</strong>${porUnidad}`
        : `${money(p.precio_venta)}${porUnidad}`;
      const promocion = promo
        ? `<span class="ofertas-dia-promo">Desde ${esc(String(promo.oferta.cantidad_minima))}${esc(conUnidad(p))}: ${money(promo.precio)}</span>`
        : "";
      return `
      <li>
        <span class="ofertas-dia-nombre">${esc(p.nombre)}<small>${esc((mejor ?? promo).oferta.nombre)}</small></span>
        <span class="ofertas-dia-precio mono">${precio}${promocion}</span>
      </li>`;
    })
    .join("");
}

document.getElementById("ofertasDia").addEventListener("change", pintarPreciosDelDia);

async function cargarLista() {
  tablaCargando("ofertasBody", 4);
  await cargarMaestros();
  pintarLista();
  const dia = document.getElementById("ofertasDia");
  if (!dia.value) dia.value = hoyISO();
  pintarPreciosDelDia();
}

/* ---------- La página de una oferta (#/ofertas/nueva, #/ofertas/<id>) ---------- */

const formOferta = document.getElementById("formOferta");
const botonPausar = formOferta.querySelector('[data-accion="pausar"]');
const buscarProducto = document.getElementById("ofertaBuscarProducto");
const chipsProductos = document.getElementById("ofertaProductosElegidos");
const chipsCategorias = document.getElementById("ofertaCategorias");
const chipsDiasSemana = document.getElementById("ofertaDiasSemana");

const tipoElegido = () => formOferta.querySelector('input[name="tipo"]:checked').value;
const alcanceElegido = () => formOferta.querySelector('input[name="alcance"]:checked').value;
const marcados = (contenedor) => [...contenedor.querySelectorAll("input:checked")].map((i) => Number(i.value));
const diasDelMes = () =>
  formOferta.dias_mes.value
    .split(/[^\d]+/)
    .filter(Boolean)
    .map(Number);

function pintarCampoValor() {
  const campo = CAMPO_VALOR[tipoElegido()];
  formOferta.querySelector("[data-texto-valor]").textContent = campo.texto;
  formOferta.querySelector("[data-sufijo]").textContent = campo.sufijo;
  formOferta.valor.placeholder = campo.placeholder;
  formOferta.valor.max = tipoElegido() === "porcentaje" ? "99.99" : "";
}

function pintarAlcance() {
  const alcance = alcanceElegido();
  for (const bloque of formOferta.querySelectorAll("[data-alcance]")) bloque.hidden = bloque.dataset.alcance !== alcance;
}

function pintarElegidos() {
  chipsProductos.innerHTML = elegidos
    .map((id) => {
      const nombre = productoPorId(id)?.nombre ?? "—";
      return `<span class="chip">${esc(nombre)}<button type="button" data-quitar="${id}" aria-label="Quitar ${esc(nombre)}">${icono("x")}</button></span>`;
    })
    .join("");
}

function leerFormulario() {
  const alcance = alcanceElegido();
  return {
    nombre: formOferta.nombre.value.trim(),
    tipo: tipoElegido(),
    valor: Number(formOferta.valor.value),
    cantidad_minima: formOferta.cantidad_minima.value === "" ? null : Number(formOferta.cantidad_minima.value),
    alcance,
    productos: alcance === "productos" ? elegidos : [],
    categorias: alcance === "categorias" ? marcados(chipsCategorias) : [],
    lista_precio_id: formOferta.lista_precio_id.value ? Number(formOferta.lista_precio_id.value) : null,
    desde: formOferta.desde.value,
    hasta: formOferta.hasta.value || null,
    dias_semana: marcados(chipsDiasSemana),
    dias_mes: diasDelMes()
  };
}

// Lo que va a hacer la oferta, en una línea, mientras se arma.
function pintarResumen() {
  const borrador = leerFormulario();
  const resumen = formOferta.querySelector("[data-resumen]");
  if (!(borrador.valor > 0) || !borrador.desde) {
    resumen.textContent = "Completá cuánto baja y desde cuándo.";
    return;
  }
  const cuantos = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const alcance =
    borrador.alcance === "todo"
      ? "en todo el catálogo"
      : borrador.alcance === "categorias"
        ? `en ${cuantos(borrador.categorias.length, "categoría", "categorías")}`
        : `en ${cuantos(borrador.productos.length, "producto", "productos")}`;
  resumen.textContent = `${describirOferta(borrador)} ${alcance}. ${describirVigencia(borrador)}.`;
}

async function prepararOferta(id) {
  await cargarMaestros();
  ofertaEditada = id ? (ofertas.find((o) => o.id === id) ?? null) : null;
  if (id && !ofertaEditada) {
    avisar("Esa oferta no existe.", "error");
    return mostrarVista("ofertas");
  }
  const o = ofertaEditada;
  formOferta.reset();
  formOferta.nombre.value = o?.nombre ?? "";
  formOferta.tipo.value = o?.tipo ?? "porcentaje";
  formOferta.valor.value = o?.valor ?? "";
  formOferta.cantidad_minima.value = o?.cantidad_minima ?? "";
  formOferta.alcance.value = o?.alcance ?? "productos";
  elegidos = [...(o?.productos ?? [])];

  document.getElementById("ofertaProductos").innerHTML = productos
    .filter((p) => p.activo)
    .map((p) => `<option value="${esc(p.nombre)}"></option>`)
    .join("");
  const categoriasVisibles = categorias.filter((c) => c.activa || o?.categorias.includes(c.id));
  chipsCategorias.innerHTML = categoriasVisibles.length
    ? categoriasVisibles
        .map(
          (c) => `
        <label class="chip-elegir">
          <input type="checkbox" value="${c.id}"${o?.categorias.includes(c.id) ? " checked" : ""} />
          <span>${esc(c.nombre)}</span>
        </label>`
        )
        .join("")
    : `<p class="opciones-nota">Todavía no hay categorías: se arman en Configuración → Categorías de productos.</p>`;
  formOferta.lista_precio_id.innerHTML =
    `<option value="">Todas las listas</option>` +
    listas
      .filter((l) => l.activa || l.id === o?.lista_precio_id)
      .map((l) => `<option value="${l.id}">Solo ${esc(l.nombre)}</option>`)
      .join("");
  formOferta.lista_precio_id.value = o?.lista_precio_id ?? "";
  // Con una sola lista no hay nada que elegir.
  formOferta.lista_precio_id.closest("label").hidden = listas.length < 2 && !o?.lista_precio_id;

  formOferta.desde.value = o?.desde ?? hoyISO();
  formOferta.hasta.value = o?.hasta ?? "";
  chipsDiasSemana.innerHTML = DIAS_SEMANA.map(
    (nombre, i) => `
    <label class="chip-elegir">
      <input type="checkbox" value="${i + 1}"${o?.dias_semana.includes(i + 1) ? " checked" : ""} />
      <span>${esc(nombre.slice(0, 3))}<span class="visualmente-oculto">${esc(nombre.slice(3))}</span></span>
    </label>`
  ).join("");
  formOferta.dias_mes.value = o?.dias_mes.join(", ") ?? "";

  botonPausar.hidden = !o;
  botonPausar.textContent = o?.activa === false ? "Volver a activarla" : "Pausar";
  formOferta.querySelector('[type="submit"]').textContent = o ? "Guardar cambios" : "Crear oferta";
  pintarCampoValor();
  pintarAlcance();
  pintarElegidos();
  pintarResumen();
}

formOferta.addEventListener("change", (e) => {
  if (e.target.name === "tipo") pintarCampoValor();
  if (e.target.name === "alcance") pintarAlcance();
  pintarResumen();
});
formOferta.addEventListener("input", pintarResumen);

buscarProducto.addEventListener("input", () => {
  const buscado = buscarProducto.value.trim().toLowerCase();
  const producto = productos.find((p) => p.activo && p.nombre.trim().toLowerCase() === buscado);
  if (!producto) return;
  if (!elegidos.includes(producto.id)) elegidos.push(producto.id);
  buscarProducto.value = "";
  pintarElegidos();
  pintarResumen();
});

chipsProductos.addEventListener("click", (e) => {
  const boton = e.target.closest("[data-quitar]");
  if (!boton) return;
  elegidos = elegidos.filter((id) => id !== Number(boton.dataset.quitar));
  pintarElegidos();
  pintarResumen();
});

formOferta.addEventListener("submit", async (e) => {
  e.preventDefault();
  const cuerpo = leerFormulario();
  if (!cuerpo.nombre) return avisar("Ponele un nombre a la oferta.", "error");
  if (!(cuerpo.valor > 0)) return avisar("Poné cuánto baja la oferta.", "error");
  if (cuerpo.alcance === "productos" && cuerpo.productos.length === 0) return avisar("Elegí al menos un producto.", "error");
  if (cuerpo.alcance === "categorias" && cuerpo.categorias.length === 0) return avisar("Elegí al menos una categoría.", "error");
  const boton = formOferta.querySelector('[type="submit"]');
  boton.disabled = true;
  try {
    await api(ofertaEditada ? `/api/ofertas/${ofertaEditada.id}` : "/api/ofertas", {
      method: ofertaEditada ? "PUT" : "POST",
      body: cuerpo,
      error: "No se pudo guardar la oferta."
    });
  } finally {
    boton.disabled = false;
  }
  avisar(ofertaEditada ? "Oferta guardada." : "Oferta lista: el punto de venta y las ventas ya la aplican.", "ok");
  mostrarVista("ofertas");
});

botonPausar.addEventListener("click", async () => {
  if (!ofertaEditada) return;
  const activa = !ofertaEditada.activa;
  await api(`/api/ofertas/${ofertaEditada.id}`, {
    method: "PATCH",
    body: { activa },
    error: "No se pudo cambiar la oferta."
  });
  avisar(activa ? "La oferta vuelve a valer." : "Oferta pausada: deja de aplicarse hasta que la actives.", "ok");
  mostrarVista("ofertas");
});

async function entrarAOfertas(subruta) {
  // La vista es del admin: el router no deja entrar al empleado.
  if (!esAdmin()) return;
  const pagina = subruta === "nueva" || Number(subruta) > 0 ? "oferta" : "lista";
  for (const seccion of document.querySelectorAll(".ofertas-pagina")) seccion.hidden = seccion.dataset.pagina !== pagina;
  if (pagina === "lista") {
    if (subruta) history.replaceState(null, "", "#/ofertas");
    await cargarLista();
  } else {
    await prepararOferta(subruta === "nueva" ? null : Number(subruta));
  }
}

alEntrarEnVista("ofertas", entrarAOfertas);
