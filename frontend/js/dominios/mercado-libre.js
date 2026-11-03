/**
 * dominios/mercado-libre.js
 * Configuración → Mercado Libre (etapa G, CLAUDE.md §32). Sin conectar, los
 * dos pasos y el botón que lleva a Mercado Libre a dar el permiso; conectada,
 * qué lista y qué depósito se publican y adónde entra lo cobrado, las
 * publicaciones del vendedor para vincular con productos de Nexo, las ventas
 * que llegaron y la actividad. Solo admin.
 *
 * En Mercado Libre no se publica desde Nexo: el vendedor ya tiene sus
 * publicaciones, y acá elige qué producto de Nexo es cada una (el SKU lo
 * sugiere). Al volver de Mercado Libre, el servidor deja el resultado en
 * ?mercadolibre=.
 */

import { avisar, confirmar } from "../core/ui.js";
import { api } from "../core/api.js";
import { registrar } from "../core/registro.js";
import { esc, fechaHoraAR, money } from "../core/formato.js";
import { icono } from "../core/iconos.js";
import {
  escucharAjustesCanal,
  escucharPedidosCanal,
  pintarActividadCanal,
  pintarAjustesCanal,
  pintarPedidosCanal
} from "../core/canales.js";

const estadoEl = document.getElementById("mlEstado");
const pasos = document.getElementById("mlPasos");
const conectadaEl = document.getElementById("mlConectada");
const listaPublicaciones = document.getElementById("mlPublicaciones");
const buscador = document.getElementById("mlBuscar");
const btnVincular = document.getElementById("btnMlVincular");
const btnSincronizar = document.getElementById("btnMlSincronizar");

const RESULTADOS = {
  conectada: ["¡Listo! Tu cuenta quedó conectada. Ahora vinculá tus publicaciones con tus productos.", "ok"],
  cancelado: ["No se conectó: el permiso se canceló en Mercado Libre.", "atencion"],
  "sin-sesion": ["Para conectar tu cuenta, entrá a Nexo como administrador del negocio y tocá “Conectar mi Mercado Libre”.", "atencion"],
  "en-otro-negocio": ["Esa cuenta de Mercado Libre ya está conectada a otro negocio de Nexo. Desconectala de allá primero.", "error"],
  "no-disponible": ["Mercado Libre todavía no está disponible en Nexo.", "atencion"],
  error: ["No se pudo conectar tu cuenta. Volvé a intentarlo desde acá.", "error"]
};

let estado = null;
// Las publicaciones y lo que se puede elegir en Nexo, como los dio el servidor.
let publicaciones = [];
let opciones = [];

function leerVuelta() {
  const params = new URLSearchParams(location.search);
  const resultado = params.get("mercadolibre");
  if (!resultado) return;
  history.replaceState(null, "", location.pathname + location.hash);
  const [texto, tipo] = RESULTADOS[resultado] ?? RESULTADOS.error;
  avisar(texto, tipo);
}

function pintarEstado() {
  if (!estado.disponible) {
    estadoEl.innerHTML = `<p class="fe-estado-linea fe-estado-falta">${icono("circle-alert")} <span>Mercado Libre todavía no está disponible en este servidor de Nexo.</span></p>`;
    return;
  }
  if (!estado.conectada) {
    estadoEl.innerHTML = estado.tienda
      ? `<p class="fe-estado-linea">${icono("info")} <span>La cuenta “${esc(estado.tienda.nombre)}” está desconectada: Nexo no actualiza tus publicaciones ni trae ventas. Las ventas que ya llegaron siguen en Nexo.</span></p>`
      : "";
    return;
  }
  const cuenta = estado.tienda.url
    ? `<a href="${esc(estado.tienda.url)}" target="_blank" rel="noopener noreferrer">${esc(estado.tienda.nombre)}</a>`
    : esc(estado.tienda.nombre);
  const revisada = estado.ultima_sincronizacion ? ` Última revisión: ${esc(fechaHoraAR(estado.ultima_sincronizacion))}.` : "";
  const vinculadas = estado.publicaciones_vinculadas === 1 ? "1 publicación vinculada" : `${estado.publicaciones_vinculadas} publicaciones vinculadas`;
  const ventas = estado.pedidos_importados === 1 ? "1 venta pasó a Nexo" : `${estado.pedidos_importados} ventas pasaron a Nexo`;
  estadoEl.innerHTML = `
    <div class="fe-estado-linea fe-estado-activa">
      ${icono("circle-check")}
      <div class="fe-estado-texto">
        <p class="fe-estado-titulo">Conectada a ${cuenta}</p>
        <p>${vinculadas} · ${ventas}.${revisada}</p>
      </div>
      <button type="button" class="btn btn-secundario" id="btnMlDesconectar">Desconectar</button>
    </div>`;
  document.getElementById("btnMlDesconectar").addEventListener("click", desconectar);
}

/* ---------- Publicaciones ---------- */

const claveDe = (o) => `${o.producto_id}:${o.variante_id ?? ""}`;

function opcionesDeNexo(elegida) {
  return [
    `<option value="">No vincular</option>`,
    ...opciones.map((o) => {
      const clave = claveDe(o);
      const detalle = [o.sku ? `SKU ${o.sku}` : null, o.stock === null ? null : `stock ${o.stock}`].filter(Boolean).join(" · ");
      return `<option value="${esc(clave)}"${clave === elegida ? " selected" : ""}>${esc(o.nombre)}${detalle ? ` (${esc(detalle)})` : ""}</option>`;
    })
  ].join("");
}

function filaDePublicacion(p, i) {
  const datos = [p.externo_producto_id, p.sku ? `SKU ${p.sku}` : null, money(p.precio), p.full ? "Full" : `stock ${p.stock}`]
    .filter(Boolean)
    .join(" · ");
  const pausada = p.estado === "paused" ? `<span class="status status-info">Pausada</span>` : "";
  const foto = p.foto
    ? `<img class="ml-foto" src="${esc(p.foto)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
    : `<span class="ml-foto" aria-hidden="true"></span>`;
  const titulo = p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.titulo)}</a>` : esc(p.titulo);
  const buscable = esc(`${p.titulo} ${p.sku} ${p.externo_producto_id}`.toLowerCase());
  const cabeza = `
      ${foto}
      <div class="ml-publicacion-texto">
        <p class="ml-publicacion-titulo">${titulo} ${pausada}</p>
        <p class="ml-publicacion-detalle">${esc(datos)}</p>`;
  if (p.vinculo) {
    return `
    <li class="ml-publicacion" data-texto="${buscable}">
      ${cabeza}
        <p class="ml-publicacion-vinculo">${icono("package")} <span>${esc(p.vinculo.nombre)}</span></p>
      </div>
      <button type="button" class="btn-link" data-desvincular="${p.vinculo.id}">Desvincular</button>
    </li>`;
  }
  const sugerida = p.sugerencia ? claveDe(p.sugerencia) : "";
  const traer = p.full
    ? `<p class="campo-ayuda">Full: el stock lo maneja Mercado Libre. Nexo manda solo el precio.</p>`
    : `<label class="ml-traer"><input type="checkbox" data-traer="${i}" /> Traer su stock (${esc(p.stock)}) a Nexo</label>`;
  return `
    <li class="ml-publicacion" data-texto="${buscable}">
      ${cabeza}
        <label class="ml-elegir">
          <span class="visualmente-oculto">Producto de Nexo para ${esc(p.titulo)}</span>
          <select data-publicacion="${i}">${opcionesDeNexo(sugerida)}</select>
        </label>
        ${traer}
      </div>
    </li>`;
}

async function pintarPublicaciones() {
  listaPublicaciones.innerHTML = `<li><p class="tn-vacio">Buscando tus publicaciones en Mercado Libre…</p></li>`;
  let r;
  try {
    r = await api("/api/integraciones/mercadolibre/publicaciones", { error: "No se pudieron traer tus publicaciones." });
  } catch {
    listaPublicaciones.innerHTML = `<li><p class="tn-vacio">No se pudieron traer tus publicaciones. Probá de nuevo en unos minutos.</p></li>`;
    return;
  }
  ({ publicaciones, opciones } = r);
  buscador.hidden = publicaciones.length < 8;
  if (!publicaciones.length) {
    listaPublicaciones.innerHTML = `<li><p class="tn-vacio">Tu cuenta no tiene publicaciones activas.</p></li>`;
    actualizarBotonVincular();
    return;
  }
  // Primero las que faltan vincular.
  const orden = publicaciones.map((p, i) => [p, i]).sort(([a], [b]) => Number(Boolean(a.vinculo)) - Number(Boolean(b.vinculo)));
  const tope =
    r.total > publicaciones.length ? `<li><p class="tn-vacio">Se muestran ${esc(publicaciones.length)} de tus ${esc(r.total)} publicaciones.</p></li>` : "";
  listaPublicaciones.innerHTML = orden.map(([p, i]) => filaDePublicacion(p, i)).join("") + tope;
  filtrar();
  actualizarBotonVincular();
}

const elegidas = () =>
  [...listaPublicaciones.querySelectorAll("select[data-publicacion]")]
    .filter((s) => s.value)
    .map((s) => {
      const indice = Number(s.dataset.publicacion);
      const p = publicaciones[indice];
      const [productoId, varianteId] = s.value.split(":");
      const traer = listaPublicaciones.querySelector(`input[data-traer="${indice}"]`);
      return {
        externo_producto_id: p.externo_producto_id,
        externo_variante_id: p.externo_variante_id,
        producto_id: Number(productoId),
        variante_id: varianteId ? Number(varianteId) : null,
        traer_stock: Boolean(traer?.checked)
      };
    });

function actualizarBotonVincular() {
  const n = elegidas().length;
  btnVincular.disabled = n === 0;
  btnVincular.textContent = n ? `Vincular ${n}` : "Vincular";
}

function filtrar() {
  const texto = buscador.value.trim().toLowerCase();
  for (const fila of listaPublicaciones.querySelectorAll("li[data-texto]")) {
    fila.hidden = Boolean(texto) && !fila.dataset.texto.includes(texto);
  }
}

/* ---------- La página ---------- */

async function cargar() {
  leerVuelta();
  estado = await api("/api/integraciones/mercadolibre", { error: "No se pudo cargar Mercado Libre." });
  pintarEstado();
  document.getElementById("configMercadoLibreResumen").textContent = estado.conectada
    ? `Conectada a ${estado.tienda.nombre}`
    : "Tus publicaciones, conectadas a Nexo";
  pasos.hidden = !estado.disponible || estado.conectada;
  conectadaEl.hidden = !estado.conectada;
  if (!estado.conectada) return;
  pintarPedidosCanal(document.getElementById("mlPedidos"), estado.pedidos, {
    vacio: "Todavía no llegó ninguna venta de Mercado Libre.",
    titulo: "Venta",
    reservado: "Sin pagar todavía: sus unidades quedan reservadas en Mercado Libre."
  });
  pintarActividadCanal(document.getElementById("mlActividad"), estado.actividad);
  await Promise.all([
    pintarAjustesCanal(estado, {
      lista: document.getElementById("mlLista"),
      deposito: document.getElementById("mlDeposito"),
      cuenta: document.getElementById("mlCuenta")
    }),
    pintarPublicaciones()
  ]);
}

document.getElementById("btnMlConectar").addEventListener("click", async (e) => {
  const boton = e.currentTarget;
  boton.disabled = true;
  try {
    const { url } = await api("/api/integraciones/mercadolibre/conectar", {
      method: "POST",
      error: "No se pudo empezar la conexión."
    });
    location.assign(url);
  } catch {
    boton.disabled = false;
  }
});

escucharAjustesCanal(document.getElementById("formMlAjustes"), "mercadolibre", {
  aviso: "Guardado. Tus publicaciones se actualizan en unos segundos.",
  recargar: cargar
});

listaPublicaciones.addEventListener("change", actualizarBotonVincular);
buscador.addEventListener("input", filtrar);

listaPublicaciones.addEventListener("click", async (e) => {
  const boton = e.target.closest("button[data-desvincular]");
  if (!boton) return;
  const ok = await confirmar({
    titulo: "Desvincular la publicación",
    cuerpo: "Nexo deja de cambiarle el stock y el precio, y sus ventas nuevas quedan para revisar. La publicación sigue en Mercado Libre como está.",
    aceptar: "Desvincular"
  });
  if (!ok) return;
  await api("/api/integraciones/mercadolibre/desvincular", {
    method: "POST",
    body: { id: Number(boton.dataset.desvincular) },
    error: "No se pudo desvincular."
  });
  await cargar();
});

btnVincular.addEventListener("click", async () => {
  const vinculos = elegidas();
  if (!vinculos.length) return;
  btnVincular.disabled = true;
  btnVincular.textContent = "Vinculando…";
  try {
    // De a 50, el tope de cada pedido al servidor.
    let vinculados = 0;
    const errores = [];
    for (let i = 0; i < vinculos.length; i += 50) {
      const r = await api("/api/integraciones/mercadolibre/vincular", {
        method: "POST",
        body: { vinculos: vinculos.slice(i, i + 50) },
        error: "No se pudieron vincular las publicaciones."
      });
      vinculados += r.vinculados;
      errores.push(...r.errores);
    }
    if (vinculados) avisar(vinculados === 1 ? "Se vinculó 1 publicación." : `Se vincularon ${vinculados} publicaciones.`, "ok");
    if (errores.length) avisar(`No se vinculó “${errores[0].titulo}”: ${errores[0].error}`, "error");
  } finally {
    await cargar();
  }
});

btnSincronizar.addEventListener("click", async () => {
  btnSincronizar.disabled = true;
  try {
    await api("/api/integraciones/mercadolibre/sincronizar", { method: "POST", error: "No se pudo revisar Mercado Libre." });
    await cargar();
    avisar("Listo: está todo al día.", "ok");
  } finally {
    btnSincronizar.disabled = false;
  }
});

escucharPedidosCanal(document.getElementById("mlPedidos"), "mercadolibre", cargar);

async function desconectar() {
  const ok = await confirmar({
    titulo: "Desconectar Mercado Libre",
    cuerpo:
      "Nexo deja de actualizar el stock y el precio de tus publicaciones y de traer sus ventas. Las publicaciones siguen en Mercado Libre, y las ventas que ya llegaron quedan en Nexo. Para sacarle el permiso a Nexo del todo, hacelo también desde tu cuenta de Mercado Libre.",
    aceptar: "Desconectar"
  });
  if (!ok) return;
  await api("/api/integraciones/mercadolibre/desconectar", { method: "POST", error: "No se pudo desconectar tu cuenta." });
  avisar("Tu cuenta quedó desconectada.", "ok");
  await cargar();
}

registrar("pintar:mercado-libre", cargar);
