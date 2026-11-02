/**
 * dominios/tienda-nube.js
 * Configuración → Tienda Nube (etapa G, CLAUDE.md §32). Sin conectar, los dos
 * pasos y el botón que lleva a Tienda Nube a dar el permiso; conectada, qué
 * lista y qué depósito se publican y adónde entra lo cobrado, los productos
 * para publicar, los pedidos que llegaron y la actividad. Solo admin.
 *
 * Al volver de Tienda Nube, el servidor deja el resultado en ?tiendanube= (y
 * ?clave= si la app se instaló desde Tienda Nube y hay que confirmarla).
 */

import { avisar, confirmar } from "../core/ui.js";
import { api } from "../core/api.js";
import { invocar, registrar } from "../core/registro.js";
import { esc, fechaHoraAR } from "../core/formato.js";
import { icono } from "../core/iconos.js";

const estadoEl = document.getElementById("tnEstado");
const pasos = document.getElementById("tnPasos");
const conectadaEl = document.getElementById("tnConectada");
const confirmarEl = document.getElementById("tnConfirmar");
const formAjustes = document.getElementById("formTnAjustes");
const listaProductos = document.getElementById("tnProductos");
const btnPublicar = document.getElementById("btnTnPublicar");
const btnSincronizar = document.getElementById("btnTnSincronizar");

const RESULTADOS = {
  conectada: ["¡Listo! Tu tienda quedó conectada. Ahora elegí qué productos publicar.", "ok"],
  cancelado: ["No se conectó: el permiso se canceló en Tienda Nube.", "atencion"],
  "sin-sesion": ["Para conectar la tienda, entrá a Nexo como administrador del negocio y tocá “Conectar mi Tienda Nube”.", "atencion"],
  "en-otro-negocio": ["Esa tienda ya está conectada a otro negocio de Nexo. Desconectala de allá primero.", "error"],
  "no-disponible": ["Tienda Nube todavía no está disponible en Nexo.", "atencion"],
  error: ["No se pudo conectar la tienda. Volvé a intentarlo desde acá.", "error"]
};

let estado = null;
// La instalación hecha desde Tienda Nube que espera confirmación.
let clavePendiente = null;

// Lo que dejó la vuelta de Tienda Nube se lee una vez y se saca de la URL,
// así un recargar no repite el aviso.
function leerVuelta() {
  const params = new URLSearchParams(location.search);
  const resultado = params.get("tiendanube");
  if (!resultado) return;
  history.replaceState(null, "", location.pathname + location.hash);
  if (resultado === "confirmar") {
    clavePendiente = params.get("clave");
    return;
  }
  const [texto, tipo] = RESULTADOS[resultado] ?? RESULTADOS.error;
  avisar(texto, tipo);
}

function pintarEstado() {
  if (!estado.disponible) {
    estadoEl.innerHTML = `<p class="fe-estado-linea fe-estado-falta">${icono("circle-alert")} <span>Tienda Nube todavía no está disponible en este servidor de Nexo.</span></p>`;
    return;
  }
  if (!estado.conectada) {
    estadoEl.innerHTML = estado.tienda
      ? `<p class="fe-estado-linea">${icono("info")} <span>La tienda “${esc(estado.tienda.nombre)}” está desconectada: Nexo no publica ni trae pedidos. Las ventas que ya llegaron siguen en Nexo.</span></p>`
      : "";
    return;
  }
  const tienda = estado.tienda.url
    ? `<a href="${esc(estado.tienda.url)}" target="_blank" rel="noopener noreferrer">${esc(estado.tienda.nombre)}</a>`
    : esc(estado.tienda.nombre);
  const revisada = estado.ultima_sincronizacion ? ` Última revisión: ${esc(fechaHoraAR(estado.ultima_sincronizacion))}.` : "";
  const publicados = estado.productos_publicados === 1 ? "1 producto publicado" : `${estado.productos_publicados} productos publicados`;
  const ventas = estado.pedidos_importados === 1 ? "1 pedido pasó a venta" : `${estado.pedidos_importados} pedidos pasaron a venta`;
  estadoEl.innerHTML = `
    <div class="fe-estado-linea fe-estado-activa">
      ${icono("circle-check")}
      <div class="fe-estado-texto">
        <p class="fe-estado-titulo">Conectada a ${tienda}</p>
        <p>${publicados} · ${ventas}.${revisada}</p>
      </div>
      <button type="button" class="btn btn-secundario" id="btnTnDesconectar">Desconectar</button>
    </div>`;
  document.getElementById("btnTnDesconectar").addEventListener("click", desconectar);
}

async function pintarAjustes() {
  const [listas, depositos, cuentas] = await Promise.all([
    api("/api/listas-precios", { error: "No se pudieron cargar las listas de precios." }),
    api("/api/depositos", { error: "No se pudieron cargar los depósitos." }),
    api("/api/cuentas-tesoreria", { error: "No se pudieron cargar las cuentas." })
  ]);
  const opciones = (filas, elegido, primera) =>
    [
      `<option value="">${esc(primera)}</option>`,
      ...filas.map((f) => `<option value="${f.id}"${f.id === elegido ? " selected" : ""}>${esc(f.nombre)}</option>`)
    ].join("");
  const predeterminado = (filas, campo) => filas.find((f) => f[campo])?.nombre ?? "—";
  document.getElementById("tnLista").innerHTML = opciones(
    listas.filter((l) => l.activa !== 0),
    estado.lista_precio_id,
    `La predeterminada (${predeterminado(listas, "es_predeterminada")})`
  );
  document.getElementById("tnDeposito").innerHTML = opciones(
    depositos.filter((d) => d.activo !== 0),
    estado.deposito_id,
    `El predeterminado (${predeterminado(depositos, "es_predeterminado")})`
  );
  document.getElementById("tnCuenta").innerHTML = opciones(cuentas, estado.cuenta_tesoreria_id, "No registrar el cobro");
}

async function pintarProductos() {
  const productos = await api("/api/integraciones/tiendanube/productos", { error: "No se pudieron cargar los productos." });
  if (!productos.length) {
    listaProductos.innerHTML = `<li><p class="tn-vacio">Todavía no cargaste productos en Nexo.</p></li>`;
    actualizarBotonPublicar();
    return;
  }
  // Primero los que faltan publicar.
  const ordenados = [...productos].sort((a, b) => Number(a.publicado) - Number(b.publicado));
  listaProductos.innerHTML = ordenados
    .map((p) => {
      const detalle = [
        p.sku ? `SKU ${p.sku}` : null,
        p.variantes ? `${p.variantes} ${p.variantes === 1 ? "variante" : "variantes"}` : null,
        p.tipo === "servicio" ? "Servicio, sin tope de stock" : null
      ]
        .filter(Boolean)
        .join(" · ");
      return `
      <li>
        <label class="tn-producto${p.publicado ? " tn-producto-publicado" : ""}">
          <input type="checkbox" value="${p.id}"${p.publicado ? " checked disabled" : ""} />
          <span class="tn-producto-texto">
            <span class="tn-producto-nombre">${esc(p.nombre)}</span>
            ${detalle ? `<span class="tn-producto-detalle">${esc(detalle)}</span>` : ""}
          </span>
          ${p.publicado ? `<span class="status status-cobrado">En la tienda</span>` : ""}
        </label>
      </li>`;
    })
    .join("");
  actualizarBotonPublicar();
}

const elegidos = () =>
  [...listaProductos.querySelectorAll("input[type=checkbox]:checked:not(:disabled)")].map((c) => Number(c.value));

function actualizarBotonPublicar() {
  const n = elegidos().length;
  btnPublicar.disabled = n === 0;
  btnPublicar.textContent = n ? `Publicar ${n}` : "Publicar";
}

const ESTADO_PEDIDO = {
  importado: ["status-cobrado", "Es venta"],
  pendiente: ["status-pendiente", "Para revisar"],
  cancelado: ["status-vencido", "Cancelado"]
};

function pintarPedidos() {
  const cuerpo = document.getElementById("tnPedidosBody");
  if (!estado.pedidos.length) {
    cuerpo.innerHTML = `<tr><td colspan="4" class="tn-vacio celda-wrap">Todavía no llegó ningún pedido pagado de la tienda.</td></tr>`;
    return;
  }
  cuerpo.innerHTML = estado.pedidos
    .map((p) => {
      const [clase, texto] = ESTADO_PEDIDO[p.estado];
      const detalle = p.error ?? (p.venta_id ? `Venta #${p.venta_id}` : "—");
      const acciones = [
        p.venta_id ? `<button type="button" class="btn-link" data-venta="${p.venta_id}">Ver venta</button>` : "",
        p.estado === "pendiente" ? `<button type="button" class="btn-link" data-reintentar="${p.id}">Reintentar</button>` : "",
        p.estado === "cancelado" && p.error ? `<button type="button" class="btn-link" data-revisado="${p.id}">Ya lo revisé</button>` : ""
      ].join(" ");
      return `
      <tr>
        <td data-label="Pedido" class="mono">#${esc(p.numero ?? p.externo_id)}</td>
        <td data-label="Estado"><span class="status ${clase}">${texto}</span></td>
        <td data-label="Detalle" class="celda-wrap">${esc(detalle)}</td>
        <td data-label="">${acciones}</td>
      </tr>`;
    })
    .join("");
}

function pintarActividad() {
  document.getElementById("tnActividad").innerHTML = estado.actividad.length
    ? estado.actividad
        .map(
          (a) => `
      <li>
        <span class="tn-actividad-fecha">${esc(fechaHoraAR(a.fecha))}</span>
        <span class="${a.resultado === "error" ? "tn-actividad-error" : ""}">${esc(a.detalle)}</span>
      </li>`
        )
        .join("")
    : `<li><p class="tn-vacio">Sin actividad todavía.</p></li>`;
}

async function pintarConfirmacion() {
  let tienda;
  try {
    tienda = await api(`/api/integraciones/tiendanube/pendiente?clave=${encodeURIComponent(clavePendiente)}`, {
      error: "Pasó mucho tiempo: conectá la tienda de nuevo desde acá."
    });
  } catch {
    clavePendiente = null;
    confirmarEl.hidden = true;
    return;
  }
  document.getElementById("tnConfirmarTexto").textContent =
    `Instalaste Nexo en la tienda “${tienda.nombre}”. Si la conectás, sus pedidos van a entrar como ventas de este negocio.`;
  confirmarEl.hidden = false;
}

async function cargar() {
  leerVuelta();
  estado = await api("/api/integraciones/tiendanube", { error: "No se pudo cargar Tienda Nube." });
  pintarEstado();
  document.getElementById("configTiendaNubeResumen").textContent = estado.conectada
    ? `Conectada a ${estado.tienda.nombre}`
    : "Tu tienda online, conectada a Nexo";
  if (clavePendiente && estado.disponible && !estado.conectada) await pintarConfirmacion();
  else confirmarEl.hidden = true;
  pasos.hidden = !estado.disponible || estado.conectada || !confirmarEl.hidden;
  conectadaEl.hidden = !estado.conectada;
  if (!estado.conectada) return;
  pintarPedidos();
  pintarActividad();
  await Promise.all([pintarAjustes(), pintarProductos()]);
}

document.getElementById("btnTnConectar").addEventListener("click", async (e) => {
  const boton = e.currentTarget;
  boton.disabled = true;
  try {
    const { url } = await api("/api/integraciones/tiendanube/conectar", {
      method: "POST",
      error: "No se pudo empezar la conexión."
    });
    location.assign(url);
  } catch {
    boton.disabled = false;
  }
});

document.getElementById("btnTnConfirmar").addEventListener("click", async () => {
  await api("/api/integraciones/tiendanube/confirmar", {
    method: "POST",
    body: { clave: clavePendiente },
    error: "No se pudo conectar la tienda."
  });
  clavePendiente = null;
  avisar(RESULTADOS.conectada[0], "ok");
  await cargar();
});

document.getElementById("btnTnNoConfirmar").addEventListener("click", () => {
  clavePendiente = null;
  confirmarEl.hidden = true;
  pasos.hidden = !estado.disponible || estado.conectada;
  avisar("No se conectó. Si querés sacar a Nexo de tu tienda, desinstalalo desde sus aplicaciones.", "atencion");
});

formAjustes.addEventListener("submit", async (e) => {
  e.preventDefault();
  const datos = Object.fromEntries([...new FormData(formAjustes)].map(([k, v]) => [k, v ? Number(v) : null]));
  await api("/api/integraciones/tiendanube", { method: "PUT", body: datos, error: "No se pudieron guardar los cambios." });
  avisar("Guardado. La tienda se actualiza en unos segundos.", "ok");
  await cargar();
});

listaProductos.addEventListener("change", actualizarBotonPublicar);

btnPublicar.addEventListener("click", async () => {
  const ids = elegidos();
  if (!ids.length) return;
  btnPublicar.disabled = true;
  btnPublicar.textContent = "Publicando…";
  try {
    // De a 50, el tope de cada pedido al servidor.
    let publicados = 0;
    const errores = [];
    for (let i = 0; i < ids.length; i += 50) {
      const r = await api("/api/integraciones/tiendanube/publicar", {
        method: "POST",
        body: { producto_ids: ids.slice(i, i + 50) },
        error: "No se pudieron publicar los productos."
      });
      publicados += r.publicados;
      errores.push(...r.errores);
    }
    if (publicados) avisar(publicados === 1 ? "Se publicó 1 producto en tu tienda." : `Se publicaron ${publicados} productos en tu tienda.`, "ok");
    if (errores.length) avisar(`No se publicó “${errores[0].producto}”: ${errores[0].error}`, "error");
  } finally {
    await cargar();
  }
});

btnSincronizar.addEventListener("click", async () => {
  btnSincronizar.disabled = true;
  try {
    await api("/api/integraciones/tiendanube/sincronizar", { method: "POST", error: "No se pudo revisar la tienda." });
    await cargar();
    avisar("Listo: la tienda está al día.", "ok");
  } finally {
    btnSincronizar.disabled = false;
  }
});

document.getElementById("tnPedidosBody").addEventListener("click", async (e) => {
  const boton = e.target.closest("button");
  if (!boton) return;
  if (boton.dataset.venta) {
    invocar("abrirFicha:venta", Number(boton.dataset.venta));
  } else if (boton.dataset.reintentar) {
    const r = await api(`/api/integraciones/tiendanube/pedidos/${boton.dataset.reintentar}/reintentar`, {
      method: "POST",
      error: "No se pudo reintentar el pedido."
    });
    if (r.estado === "importado") avisar(`Listo: el pedido es la venta #${r.venta_id}.`, "ok");
    else avisar(r.error ?? "Sigue sin poder pasar a venta.", "atencion");
    await cargar();
  } else if (boton.dataset.revisado) {
    await api(`/api/integraciones/tiendanube/pedidos/${boton.dataset.revisado}/revisado`, {
      method: "POST",
      error: "No se pudo marcar el pedido."
    });
    await cargar();
  }
});

async function desconectar() {
  const ok = await confirmar({
    titulo: "Desconectar Tienda Nube",
    cuerpo:
      "Nexo deja de actualizar el stock y el precio de la tienda y de traer sus pedidos. Los productos siguen publicados allá, y las ventas que ya llegaron quedan en Nexo. Para sacar a Nexo del todo, desinstalalo también desde las aplicaciones de tu tienda.",
    aceptar: "Desconectar"
  });
  if (!ok) return;
  await api("/api/integraciones/tiendanube/desconectar", { method: "POST", error: "No se pudo desconectar la tienda." });
  avisar("La tienda quedó desconectada.", "ok");
  await cargar();
}

registrar("pintar:tienda-nube", cargar);
