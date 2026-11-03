/**
 * dominios/carga-inicial.js
 * "Lo que ya tenías" (handoff 8c): las páginas de Configuración para que un
 * negocio que ya venía funcionando arranque con sus números de hoy, sin
 * inventar compras ni ventas. Una página resume las cinco partes, que se
 * cargan por separado y en cualquier orden:
 * - el stock de hoy de cada depósito, con lo que costó cada unidad;
 * - lo que te deben y lo que debés (saldos anteriores, que se cobran y se
 *   pagan como cualquier venta o compra);
 * - la plata de hoy en cada cuenta;
 * - las ventas recientes (opcional), que no mueven stock ni caja.
 * El backend vive en server.js, "Carga inicial". Solo admin.
 */

import { api } from "../core/api.js";
import { avisar, confirmar } from "../core/ui.js";
import { esc, fechaAR, hoyISO, money, numero } from "../core/formato.js";
import { icono } from "../core/iconos.js";
import { moduloActivo, termino } from "../core/negocio.js";
import { recargar, registrar } from "../core/registro.js";

// Quien contestó en el alta que su negocio ya venía funcionando entra directo
// acá (alta.js deja la marca). Corre al importar el módulo, antes de que la
// app lea la dirección para decidir qué vista abrir.
try {
  if (sessionStorage.getItem("nexo.abrirCargaInicial")) {
    sessionStorage.removeItem("nexo.abrirCargaInicial");
    history.replaceState(null, "", "#/configuracion/lo-que-tenias");
  }
} catch {
  /* sin almacenamiento, entra al Resumen: la guía de primeros pasos lleva acá */
}

const campo = (id) => document.getElementById(id);
const plural = (n, uno, varios) => `${numero(n)} ${n === 1 ? uno : varios}`;
// Un número de un <input type="number">: vacío es null, y lo que no es número, NaN.
const leerNumero = (input) => (input.value.trim() === "" ? null : Number(input.value));
const nombreDeFila = (f) => (f.variante ? `${f.nombre} (${f.variante})` : f.nombre);
// Recargas de las pantallas que muestran lo que se acaba de cargar: si una
// falla, su api() ya avisó, y lo guardado no se repite.
const refrescarApp = (...nombres) => recargar(...nombres).catch(() => {});

/* ---------- La página que resume las cinco partes ---------- */

const PARTES = [
  {
    pagina: "stock-inicial",
    icono: "boxes",
    titulo: "Tu stock y lo que te costó",
    detalle: "Cuánto tenés hoy de cada producto y cuánto pagaste cada uno, para que Nexo sepa cuánto ganás en cada venta.",
    modulo: "stock",
    hecho: (e) => (e.stock.cantidad ? plural(e.stock.cantidad, "producto cargado", "productos cargados") : null)
  },
  {
    pagina: "te-deben",
    icono: "hand-coins",
    titulo: "Lo que te deben",
    detalle: "Clientes que te quedaron debiendo, y cuándo te tienen que pagar. Después los cobrás como cualquier venta.",
    hecho: (e) => (e.te_deben.cantidad ? `${plural(e.te_deben.cantidad, "saldo", "saldos")} · ${money(e.te_deben.total)}` : null)
  },
  {
    pagina: "lo-que-debes",
    icono: "truck",
    titulo: "Lo que debés",
    detalle: "Lo que les debés a tus proveedores. Después lo pagás como cualquier compra.",
    hecho: (e) => (e.debes.cantidad ? `${plural(e.debes.cantidad, "saldo", "saldos")} · ${money(e.debes.total)}` : null)
  },
  {
    pagina: "plata-inicial",
    icono: "wallet",
    titulo: "La plata de hoy",
    detalle: "Cuánto hay en la caja, en el banco y en Mercado Pago.",
    hecho: (e) => (e.caja.cantidad ? `${plural(e.caja.cantidad, "cuenta", "cuentas")} · ${money(e.caja.total)}` : null)
  },
  {
    pagina: "ventas-anteriores",
    icono: "history",
    titulo: "Ventas recientes",
    opcional: true,
    detalle: "Las de esta semana o este mes, para que tus reportes no arranquen vacíos. No descuentan stock ni suman a la caja.",
    hecho: (e) => (e.ventas.cantidad ? `${plural(e.ventas.cantidad, "venta", "ventas")} · ${money(e.ventas.total)}` : null)
  }
];

async function pintarResumen() {
  const estado = await api("/api/carga-inicial", { error: "No se pudo cargar lo que ya tenías." });
  const partes = PARTES.filter((p) => !p.modulo || moduloActivo(p.modulo));
  // El botón principal va solo en la primera que falta: es "lo que sigue".
  const siguiente = partes.find((p) => !p.hecho(estado) && !p.opcional);
  campo("ciPartes").innerHTML = partes
    .map((p) => {
      const hecho = p.hecho(estado);
      return `
      <li class="ci-parte${hecho ? " es-hecha" : ""}">
        <span class="ci-parte-icono">${icono(hecho ? "check" : esc(p.icono))}</span>
        <div class="ci-parte-texto">
          <p class="config-tarjeta-titulo">${esc(p.titulo)}${p.opcional ? ' <span class="campo-opcional">(opcional)</span>' : ""}</p>
          <p class="config-tarjeta-texto">${esc(p.detalle)}</p>
          <p class="ci-parte-estado">${hecho ? `<span class="status status-cobrado">${esc(hecho)}</span>` : '<span class="status">Falta</span>'}</p>
        </div>
        <a class="btn ${p === siguiente ? "btn-primary" : "btn-secundario"}" href="#/configuracion/${esc(p.pagina)}">${hecho ? "Ver o sumar" : "Cargar"} ${icono("chevron-right")}</a>
      </li>`;
    })
    .join("");
}

/* ---------- Tu stock de hoy ---------- */

const formStock = campo("formStockInicial");
const planilla = campo("ciPlanilla");
const selectDeposito = campo("ciDeposito");
let filasStock = [];

// Una fila de la planilla. Los campos arrancan con lo que hay hoy en Nexo;
// lo que se cambia es lo que se guarda.
function filaStockHtml(f, i) {
  const unidad = f.unidad && f.unidad !== "unidad" ? ` ${esc(f.unidad)}` : "";
  const valorStock = f.stock || f.cargado ? String(f.stock) : "";
  const valorCosto = f.costo ? String(Math.round(f.costo * 100) / 100) : "";
  const sku = f.sku ?? "";
  const buscar = `${nombreDeFila(f)} ${sku}`.toLowerCase();
  return `
    <li class="ci-fila" data-i="${i}" data-buscar="${esc(buscar)}">
      <div class="ci-fila-nombre">
        <strong>${esc(nombreDeFila(f))}</strong>
        <span>${sku ? `${esc(sku)} · ` : ""}Hoy en Nexo: ${numero(f.stock)}${unidad}${f.cargado ? " · ya cargado" : ""}</span>
      </div>
      <label class="ci-campo">Cuántos tenés
        <input type="number" name="cantidad" min="0" step="any" inputmode="decimal" value="${valorStock}" placeholder="0" data-inicial="${valorStock}" />
      </label>
      <label class="ci-campo">Costo de cada uno
        <input type="number" name="costo" min="0" step="any" inputmode="decimal" value="${valorCosto}" placeholder="$ 0" data-inicial="${valorCosto}" />
      </label>
    </li>`;
}

function filaNuevaHtml() {
  const cual = termino("singular");
  return `
    <li class="ci-fila ci-fila-nueva" data-nueva>
      <label class="ci-campo ci-campo-nombre">${esc(cual.charAt(0).toUpperCase() + cual.slice(1))} nuevo
        <input type="text" name="nombre" maxlength="120" placeholder="Nombre" />
      </label>
      <label class="ci-campo">Cuántos tenés
        <input type="number" name="cantidad" min="0" step="any" inputmode="decimal" placeholder="0" />
      </label>
      <label class="ci-campo">Costo de cada uno
        <input type="number" name="costo" min="0" step="any" inputmode="decimal" placeholder="$ 0" />
      </label>
      <label class="ci-campo ci-campo-precio">Precio de venta
        <input type="number" name="precio_venta" min="0" step="any" inputmode="decimal" placeholder="$ 0" />
      </label>
      <button type="button" class="btn-fila ci-quitar" aria-label="Quitar este renglón">${icono("x")}</button>
    </li>`;
}

const cambiada = (li) => [...li.querySelectorAll("input[data-inicial]")].some((input) => input.value.trim() !== input.dataset.inicial);
const nuevaConDatos = (li) => li.querySelector('[name="nombre"]').value.trim() !== "";

function actualizarResumenStock() {
  const cambios = [...planilla.querySelectorAll(".ci-fila:not([data-nueva])")].filter(cambiada).length;
  const nuevos = [...planilla.querySelectorAll(".ci-fila[data-nueva]")].filter(nuevaConDatos).length;
  const total = cambios + nuevos;
  formStock.querySelector('button[type="submit"]').disabled = total === 0;
  campo("ciStockResumen").textContent =
    total === 0
      ? "Cambiá solo lo que no está bien: lo demás queda como está."
      : `Vas a guardar ${plural(total, "renglón", "renglones")}${nuevos ? ` (${plural(nuevos, "nuevo", "nuevos")})` : ""}.`;
}

async function pintarStock() {
  const [depositos, datos] = await Promise.all([
    api("/api/depositos", { error: "No se pudieron cargar los depósitos." }),
    api(`/api/carga-inicial/stock${selectDeposito.value ? `?deposito_id=${selectDeposito.value}` : ""}`, {
      error: "No se pudo cargar tu stock."
    })
  ]);
  const activos = depositos.filter((d) => d.activo);
  selectDeposito.innerHTML = activos.map((d) => `<option value="${d.id}">${esc(d.nombre)}</option>`).join("");
  selectDeposito.value = String(datos.deposito.id);
  selectDeposito.dataset.anterior = selectDeposito.value;
  campo("ciDepositoCampo").hidden = activos.length < 2;
  filasStock = datos.filas;
  campo("ciBuscar").value = "";
  campo("ciBuscar").hidden = filasStock.length < 8;
  planilla.innerHTML = filasStock.length
    ? filasStock.map(filaStockHtml).join("")
    : `<li class="ci-vacio">Todavía no cargaste ${esc(termino("plural"))} con stock. Sumalos acá abajo, con lo que tenés y lo que te costó.</li>`;
  if (!filasStock.length) planilla.insertAdjacentHTML("beforeend", filaNuevaHtml());
  actualizarResumenStock();
}

planilla.addEventListener("input", actualizarResumenStock);
planilla.addEventListener("click", (e) => {
  const quitar = e.target.closest(".ci-quitar");
  if (!quitar) return;
  quitar.closest(".ci-fila").remove();
  actualizarResumenStock();
});
campo("btnCiSumarProducto").addEventListener("click", () => {
  planilla.querySelector(".ci-vacio")?.remove();
  planilla.insertAdjacentHTML("beforeend", filaNuevaHtml());
  planilla.lastElementChild.querySelector("input").focus();
});
campo("ciBuscar").addEventListener("input", (e) => {
  const texto = e.target.value.trim().toLowerCase();
  for (const li of planilla.querySelectorAll(".ci-fila:not([data-nueva])")) li.hidden = texto !== "" && !li.dataset.buscar.includes(texto);
});
selectDeposito.addEventListener("change", async () => {
  const pendientes = [...planilla.querySelectorAll(".ci-fila:not([data-nueva])")].some(cambiada);
  if (
    pendientes &&
    !(await confirmar({
      titulo: "Cambiar de depósito",
      cuerpo: "Lo que escribiste en este depósito y no guardaste se pierde.",
      aceptar: "Cambiar igual"
    }))
  ) {
    selectDeposito.value = selectDeposito.dataset.anterior;
    return;
  }
  pintarStock();
});

formStock.addEventListener("submit", async (e) => {
  e.preventDefault();
  const filas = [];
  for (const li of planilla.querySelectorAll(".ci-fila:not([data-nueva])")) {
    if (!cambiada(li)) continue;
    const f = filasStock[Number(li.dataset.i)];
    const cantidad = leerNumero(li.querySelector('[name="cantidad"]')) ?? 0;
    const costo = leerNumero(li.querySelector('[name="costo"]')) ?? 0;
    if (!(cantidad >= 0) || !(costo >= 0)) {
      li.querySelector("input").focus();
      return avisar(`Revisá "${nombreDeFila(f)}": la cantidad y el costo son números de 0 para arriba.`, "error");
    }
    filas.push({ producto_id: f.producto_id, variante_id: f.variante_id, cantidad, costo });
  }
  const nuevos = [];
  for (const li of planilla.querySelectorAll(".ci-fila[data-nueva]")) {
    if (!nuevaConDatos(li)) continue;
    const nuevo = {
      nombre: li.querySelector('[name="nombre"]').value.trim(),
      precio_venta: leerNumero(li.querySelector('[name="precio_venta"]')) ?? 0,
      cantidad: leerNumero(li.querySelector('[name="cantidad"]')) ?? 0,
      costo: leerNumero(li.querySelector('[name="costo"]')) ?? 0
    };
    if (![nuevo.precio_venta, nuevo.cantidad, nuevo.costo].every((n) => n >= 0)) {
      li.querySelector('[name="precio_venta"]').focus();
      return avisar(`Revisá "${nuevo.nombre}": el precio, la cantidad y el costo son números de 0 para arriba.`, "error");
    }
    nuevos.push(nuevo);
  }
  const boton = formStock.querySelector('button[type="submit"]');
  boton.disabled = true;
  try {
    const { cambiados } = await api("/api/carga-inicial/stock", {
      method: "POST",
      body: { deposito_id: Number(selectDeposito.value), filas, nuevos },
      error: "No se pudo guardar el stock."
    });
    avisar(cambiados ? `Listo: ${plural(cambiados, "renglón guardado", "renglones guardados")}.` : "No había nada distinto para guardar.", "ok");
  } catch {
    boton.disabled = false;
    return;
  }
  await pintarStock();
  refrescarApp("productos", "stock", "reporteStock");
});

/* ---------- Lo que te deben y lo que debés ---------- */

// Las dos páginas son iguales: cambia de quién es el saldo y adónde se anula.
const SALDOS = {
  cliente: {
    lista: "clientes",
    form: campo("formCiDeben"),
    cuerpo: campo("ciDebenLista"),
    nombres: campo("ciDebenNombres"),
    fuente: "/api/clientes",
    anular: (id) => `/api/ventas/${id}/anular`,
    cancelado: "te pagó",
    vacio: "Todavía no cargaste nada de lo que te deben."
  },
  proveedor: {
    lista: "proveedores",
    form: campo("formCiDebes"),
    cuerpo: campo("ciDebesLista"),
    nombres: campo("ciDebesNombres"),
    fuente: "/api/proveedores",
    anular: (id) => `/api/compras/${id}/anular`,
    cancelado: "le pagaste",
    vacio: "Todavía no cargaste nada de lo que debés."
  }
};

async function pintarSaldos(tipo) {
  const s = SALDOS[tipo];
  s.form.reset();
  s.form.fecha.max = hoyISO();
  s.form.fecha.value = hoyISO();
  const [saldos, entidades] = await Promise.all([
    api("/api/carga-inicial/saldos", { error: "No se pudieron cargar los saldos." }),
    api(s.fuente, { error: "No se pudo cargar la lista de nombres." })
  ]);
  s.nombres.innerHTML = entidades.map((e) => `<option value="${esc(e.nombre)}"></option>`).join("");
  const filas = saldos[s.lista];
  s.cuerpo.innerHTML = filas.length
    ? filas
        .map(
          (f) => `
      <li class="ci-saldo">
        <div class="ci-saldo-texto">
          <strong>${esc(f.nombre)}</strong>
          <span>Desde el ${esc(fechaAR(f.fecha))} · vence el ${esc(fechaAR(f.vencimiento))}${
            f.cancelado > 0 ? ` · ya ${esc(s.cancelado)} ${esc(money(f.cancelado))}` : ""
          }</span>
        </div>
        <span class="ci-saldo-importe mono">${esc(money(f.importe))}</span>
        ${f.cancelado > 0 ? "" : `<button type="button" class="btn-link" data-anular="${f.id}" data-nombre="${esc(f.nombre)}">Anular</button>`}
      </li>`
        )
        .join("")
    : `<li class="ci-vacio">${esc(s.vacio)}</li>`;
}

for (const [tipo, s] of Object.entries(SALDOS)) {
  s.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const nombre = form.nombre.value.trim();
    const importe = leerNumero(form.importe);
    if (!nombre) return form.nombre.focus();
    if (!(importe > 0)) {
      form.importe.focus();
      return avisar("Escribí cuánto es, en pesos.", "error");
    }
    const boton = form.querySelector('button[type="submit"]');
    boton.disabled = true;
    try {
      await api("/api/carga-inicial/saldos", {
        method: "POST",
        body: { tipo, nombre, importe, fecha: form.fecha.value || null, vencimiento: form.vencimiento.value || null },
        error: "No se pudo guardar."
      });
    } catch {
      return;
    } finally {
      boton.disabled = false;
    }
    avisar(`Listo: ${nombre}, ${money(importe)}.`, "ok");
    await pintarSaldos(tipo);
    form.nombre.focus();
    refrescarApp("cuentasCorrientes", "ventas", "clientes");
  });
  s.cuerpo.addEventListener("click", async (e) => {
    const boton = e.target.closest("[data-anular]");
    if (!boton) return;
    const ok = await confirmar({
      titulo: "Anular este saldo",
      cuerpo: `Se saca lo que cargaste de ${boton.dataset.nombre}. Queda en la papelera, por si te equivocaste.`,
      aceptar: "Anular",
      destructivo: true
    });
    if (!ok) return;
    try {
      await api(s.anular(boton.dataset.anular), { method: "POST", error: "No se pudo anular." });
    } catch {
      return;
    }
    avisar("Saldo anulado.", "ok");
    await pintarSaldos(tipo);
    refrescarApp("cuentasCorrientes", "ventas", "clientes");
  });
}

/* ---------- La plata de hoy ---------- */

const formPlata = campo("formCiPlata");
const listaPlata = campo("ciPlataLista");
let cuentasPlata = [];

async function pintarPlata() {
  const { cuentas } = await api("/api/tesoreria", { error: "No se pudieron cargar tus cuentas." });
  cuentasPlata = cuentas;
  listaPlata.innerHTML = cuentas
    .map((c, i) => {
      const valor = String(Math.round(c.saldo * 100) / 100);
      return `
      <li class="ci-fila" data-i="${i}">
        <div class="ci-fila-nombre">
          <strong>${esc(c.nombre)}</strong>
          <span>Hoy en Nexo: ${esc(money(c.saldo))}</span>
        </div>
        <label class="ci-campo">Lo que hay hoy
          <input type="number" name="saldo" step="any" inputmode="decimal" value="${valor}" data-inicial="${valor}" />
        </label>
      </li>`;
    })
    .join("");
  formPlata.querySelector('button[type="submit"]').disabled = true;
}

formPlata.addEventListener("input", () => {
  formPlata.querySelector('button[type="submit"]').disabled = ![...listaPlata.children].some(cambiada);
});

// Lo que se escribe es lo que hay HOY: si la cuenta ya tiene movimientos en
// Nexo, el saldo inicial es eso menos lo que se movió desde que se empezó.
formPlata.addEventListener("submit", async (e) => {
  e.preventDefault();
  const cambios = [...listaPlata.children].filter(cambiada);
  for (const li of cambios) {
    if (Number.isNaN(leerNumero(li.querySelector("input")))) {
      li.querySelector("input").focus();
      return avisar("Escribí un número, en pesos.", "error");
    }
  }
  const boton = formPlata.querySelector('button[type="submit"]');
  boton.disabled = true;
  try {
    for (const li of cambios) {
      const c = cuentasPlata[Number(li.dataset.i)];
      const hoy = leerNumero(li.querySelector("input")) ?? 0;
      const movido = c.saldo - c.saldo_inicial;
      await api(`/api/cuentas-tesoreria/${c.id}`, {
        method: "PATCH",
        body: { nombre: c.nombre, tipo: c.tipo, saldo_inicial: Math.round((hoy - movido) * 100) / 100 },
        error: `No se pudo guardar ${c.nombre}.`
      });
    }
  } catch {
    // Las que se guardaron antes del error quedan: se vuelve a pintar todo.
    await pintarPlata();
    return;
  }
  avisar("Listo: tus cuentas quedaron con la plata de hoy.", "ok");
  await pintarPlata();
  refrescarApp("caja");
});

/* ---------- Ventas recientes ---------- */

const formVentas = campo("formCiVentas");
const renglones = campo("ciVentaRenglones");
let catalogoVentas = [];

// Lo que se puede vender: los productos (y cada variante) y los servicios.
async function cargarCatalogoVentas() {
  const [stock, productos] = await Promise.all([
    api("/api/carga-inicial/stock", { error: "No se pudo cargar el catálogo." }),
    api("/api/productos", { error: "No se pudo cargar el catálogo." })
  ]);
  const servicios = productos
    .filter((p) => p.activo && p.tipo === "servicio")
    .map((p) => ({ producto_id: p.id, variante_id: null, nombre: p.nombre, variante: null, precio_venta: p.precio_venta }));
  catalogoVentas = [...stock.filas, ...servicios].sort((a, b) => nombreDeFila(a).localeCompare(nombreDeFila(b), "es"));
}

function renglonHtml() {
  const opciones = catalogoVentas.map((f, i) => `<option value="${i}">${esc(nombreDeFila(f))}</option>`).join("");
  return `
    <li class="ci-fila ci-renglon">
      <label class="ci-campo ci-campo-nombre">Qué vendiste
        <select name="item"><option value="">Elegí…</option>${opciones}</select>
      </label>
      <label class="ci-campo">Cantidad
        <input type="number" name="cantidad" min="0" step="any" inputmode="decimal" value="1" />
      </label>
      <label class="ci-campo">Precio de cada uno
        <input type="number" name="precio" min="0" step="any" inputmode="decimal" placeholder="$ 0" />
      </label>
      <button type="button" class="btn-fila ci-quitar" aria-label="Quitar este renglón">${icono("x")}</button>
    </li>`;
}

function actualizarTotalVenta() {
  let total = 0;
  for (const li of renglones.children) {
    total += (leerNumero(li.querySelector('[name="cantidad"]')) || 0) * (leerNumero(li.querySelector('[name="precio"]')) || 0);
  }
  campo("ciVentaTotal").textContent = `Total: ${money(total)}`;
}

function mostrarCobro() {
  const cobrada = formVentas.cobrada.value === "si";
  campo("ciVentaCuentaCampo").hidden = !cobrada;
  campo("ciVentaVenceCampo").hidden = cobrada;
  campo("ciVentaClienteAyuda").textContent = cobrada
    ? "Opcional: sin cliente, queda como Consumidor final."
    : "Quién te la debe: queda en su cuenta corriente.";
}

async function pintarVentas() {
  formVentas.reset();
  formVentas.fecha.max = hoyISO();
  formVentas.fecha.value = hoyISO();
  const [cuentas, clientes, ventas] = await Promise.all([
    api("/api/cuentas-tesoreria", { error: "No se pudieron cargar tus cuentas." }),
    api("/api/clientes", { error: "No se pudo cargar la lista de clientes." }),
    api("/api/carga-inicial/ventas", { error: "No se pudieron cargar las ventas." }),
    cargarCatalogoVentas()
  ]);
  formVentas.cuenta.innerHTML = cuentas.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join("");
  campo("ciVentaClientes").innerHTML = clientes.map((c) => `<option value="${esc(c.nombre)}"></option>`).join("");
  renglones.innerHTML = renglonHtml();
  actualizarTotalVenta();
  mostrarCobro();
  campo("ciVentasLista").innerHTML = ventas.length
    ? ventas
        .map((v) => {
          const cobrada = v.cobrado >= v.total;
          return `
      <li class="ci-saldo">
        <div class="ci-saldo-texto">
          <strong>${esc(fechaAR(v.fecha))} · ${esc(v.cliente)}</strong>
          <span>${esc(v.items_resumen ?? "")}</span>
        </div>
        <span class="ci-saldo-importe mono">${esc(money(v.total))}
          <span class="status ${cobrada ? "status-cobrado" : "status-pendiente"}">${cobrada ? "Cobrada" : "Te la deben"}</span>
        </span>
        <button type="button" class="btn-link" data-anular="${v.id}">Anular</button>
      </li>`;
        })
        .join("")
    : '<li class="ci-vacio">Todavía no cargaste ventas de antes.</li>';
}

renglones.addEventListener("change", (e) => {
  if (e.target.name !== "item") return;
  const elegido = catalogoVentas[Number(e.target.value)];
  const precio = e.target.closest(".ci-renglon").querySelector('[name="precio"]');
  if (elegido && !precio.value) precio.value = String(elegido.precio_venta ?? "");
  actualizarTotalVenta();
});
renglones.addEventListener("input", actualizarTotalVenta);
renglones.addEventListener("click", (e) => {
  const quitar = e.target.closest(".ci-quitar");
  if (!quitar || renglones.children.length === 1) return;
  quitar.closest(".ci-renglon").remove();
  actualizarTotalVenta();
});
campo("btnCiSumarRenglon").addEventListener("click", () => {
  renglones.insertAdjacentHTML("beforeend", renglonHtml());
  renglones.lastElementChild.querySelector("select").focus();
});
for (const radio of formVentas.querySelectorAll('[name="cobrada"]')) radio.addEventListener("change", mostrarCobro);

formVentas.addEventListener("submit", async (e) => {
  e.preventDefault();
  const items = [];
  for (const li of renglones.children) {
    const select = li.querySelector('[name="item"]');
    if (select.value === "") continue;
    const elegido = catalogoVentas[Number(select.value)];
    const cantidad = leerNumero(li.querySelector('[name="cantidad"]'));
    const precio = leerNumero(li.querySelector('[name="precio"]'));
    if (!(cantidad > 0) || !(precio >= 0)) {
      li.querySelector('[name="cantidad"]').focus();
      return avisar(`Revisá "${nombreDeFila(elegido)}": la cantidad y el precio.`, "error");
    }
    items.push({ producto_id: elegido.producto_id, variante_id: elegido.variante_id, cantidad, precio_unitario: precio });
  }
  if (!items.length) {
    renglones.querySelector("select").focus();
    return avisar("Elegí qué vendiste.", "error");
  }
  if (!formVentas.fecha.value) {
    formVentas.fecha.focus();
    return avisar("Elegí la fecha de la venta.", "error");
  }
  const cobrada = formVentas.cobrada.value === "si";
  const cliente = formVentas.cliente.value.trim();
  if (!cobrada && !cliente) {
    formVentas.cliente.focus();
    return avisar("Una venta que te deben necesita el cliente.", "error");
  }
  const boton = formVentas.querySelector('button[type="submit"]');
  boton.disabled = true;
  try {
    await api("/api/carga-inicial/ventas", {
      method: "POST",
      body: {
        fecha: formVentas.fecha.value,
        cliente: cliente || null,
        items,
        cobrada,
        cuenta_tesoreria_id: cobrada ? Number(formVentas.cuenta.value) : null,
        vencimiento: cobrada ? null : formVentas.vencimiento.value || null
      },
      error: "No se pudo guardar la venta."
    });
  } catch {
    return;
  } finally {
    boton.disabled = false;
  }
  // La fecha queda: casi siempre se cargan varias del mismo día.
  const fecha = formVentas.fecha.value;
  avisar("Venta guardada.", "ok");
  await pintarVentas();
  formVentas.fecha.value = fecha;
  renglones.querySelector("select").focus();
  refrescarApp("ventas", "cuentasCorrientes", "clientes");
});

campo("ciVentasLista").addEventListener("click", async (e) => {
  const boton = e.target.closest("[data-anular]");
  if (!boton) return;
  const ok = await confirmar({
    titulo: "Anular esta venta",
    cuerpo: "Sale de tus reportes y, si te la debían, de la cuenta del cliente. Queda en la papelera.",
    aceptar: "Anular",
    destructivo: true
  });
  if (!ok) return;
  try {
    await api(`/api/ventas/${boton.dataset.anular}/anular`, { method: "POST", error: "No se pudo anular la venta." });
  } catch {
    return;
  }
  avisar("Venta anulada.", "ok");
  await pintarVentas();
  refrescarApp("ventas", "cuentasCorrientes", "clientes");
});

/* ---------- Entrada desde Configuración ---------- */

const PINTAR = {
  "lo-que-tenias": pintarResumen,
  "stock-inicial": pintarStock,
  "te-deben": () => pintarSaldos("cliente"),
  "lo-que-debes": () => pintarSaldos("proveedor"),
  "plata-inicial": pintarPlata,
  "ventas-anteriores": pintarVentas
};
registrar("pintar:carga-inicial", (pagina) => PINTAR[pagina]());
