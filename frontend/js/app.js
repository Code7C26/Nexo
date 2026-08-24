/**
 * app.js
 * -----------------------------------------------------------
 * Trabaja contra la API real del backend (/api/facturas) en vez
 * de datos estáticos. IVA y retención de Mercado Pago quedan
 * fuera de V1 (decisión del equipo): las facturas se manejan con
 * un único monto (`total`), sin impuestos.
 */

let facturas = [];

document.getElementById("todayDate").textContent = new Date().toLocaleDateString("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long"
});

const money = (n) =>
  n.toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });

const numero = (n) => n.toLocaleString("es-AR");

const hoyISO = () => new Date().toLocaleDateString("sv-SE"); // formato AAAA-MM-DD, para <input type="date">

const ICONO_TACHO =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/>' +
  '<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
  '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>' +
  '<line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

function renderResumen(lista) {
  const facturado = lista.reduce((acc, f) => acc + f.total, 0);
  const cobrado = lista.filter((f) => f.estado === "cobrado").reduce((acc, f) => acc + f.total, 0);
  const pendiente = lista
    .filter((f) => f.estado === "pendiente" || f.estado === "vencido")
    .reduce((acc, f) => acc + f.total, 0);

  document.getElementById("sumFacturado").textContent = money(facturado);
  document.getElementById("sumCobrado").textContent = money(cobrado);
  document.getElementById("sumPendiente").textContent = money(pendiente);
}

function renderTabla(lista) {
  const body = document.getElementById("movimientosBody");
  body.innerHTML = "";

  if (lista.length === 0) {
    body.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--ink-muted); padding: 24px;">
      No hay movimientos que coincidan con la búsqueda.
    </td></tr>`;
    return;
  }

  for (const f of lista) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="N°" class="mono">#${f.id}</td>
      <td data-label="Cliente">${f.cliente}</td>
      <td data-label="Concepto">${f.concepto}</td>
      <td data-label="Total" class="align-right mono">${money(f.total)}</td>
      <td data-label="Condición">${f.condicion}</td>
      <td data-label="Estado"><span class="status status-${f.estado}">${f.estado}</span></td>
    `;
    body.appendChild(tr);
  }
}

function render(lista = facturas) {
  renderResumen(lista);
  renderTabla(lista);
}

async function cargarFacturas() {
  const res = await fetch("/api/facturas");
  facturas = await res.json();
  render();
}

cargarFacturas();

/* ---------- Búsqueda ---------- */

document.getElementById("searchInput").addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  const filtradas = facturas.filter(
    (f) => f.cliente.toLowerCase().includes(q) || String(f.id).includes(q)
  );
  render(filtradas);
});

/* ---------- Modal nueva factura ---------- */

const modal = document.getElementById("modalFactura");

document.getElementById("btnNuevaFactura").addEventListener("click", () => {
  modal.hidden = false;
});

document.getElementById("modalClose").addEventListener("click", () => {
  modal.hidden = true;
});

modal.addEventListener("click", (e) => {
  if (e.target === modal) modal.hidden = true;
});

document.getElementById("formFactura").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  await fetch("/api/facturas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cliente: form.cliente.value,
      concepto: form.concepto.value,
      neto: parseFloat(form.neto.value),
      condicion: form.condicion.value
    })
  });

  await cargarFacturas();
  form.reset();
  modal.hidden = true;
});

/* ---------- Filas de items (Venta / Compra) ---------- */

function actualizarSubtotalFila(fila) {
  const cantidad = Number(fila.querySelector(".item-cantidad").value) || 0;
  const precio = Number(fila.querySelector(".item-precio").value) || 0;
  fila.querySelector(".item-subtotal").textContent = money(cantidad * precio);
}

function agregarFilaItemVenta(contenedor, listaProductos) {
  const fila = document.createElement("div");
  fila.className = "item-row";

  fila.innerHTML = `
    <input type="text" class="item-producto" list="productosVenta" placeholder="Buscar producto…" />
    <input type="hidden" class="item-producto-id" />
    <input type="number" class="item-cantidad" placeholder="Cant." step="1" min="1" />
    <input type="number" class="item-precio" placeholder="Precio unit." step="0.01" min="0" />
    <span class="item-subtotal mono">${money(0)}</span>
    <button type="button" class="item-row-remove" aria-label="Quitar producto">✕</button>
  `;

  const productoInput = fila.querySelector(".item-producto");
  const productoIdInput = fila.querySelector(".item-producto-id");
  const cantidad = fila.querySelector(".item-cantidad");
  const precio = fila.querySelector(".item-precio");

  productoInput.addEventListener("input", () => {
    // Búsqueda por nombre exacto (vía <datalist>, no un <select> cerrado):
    // si el texto matchea un producto existente, se resuelve su id y se
    // sugiere precio y tope de stock; si no matchea nada, no se puede
    // vender un producto que no existe.
    const buscado = productoInput.value.trim().toLowerCase();
    const producto = listaProductos.find((p) => p.nombre.trim().toLowerCase() === buscado);
    if (producto) {
      productoIdInput.value = producto.id;
      // Si el producto nunca se vendió, precio_venta todavía es 0 (Etapa 3:
      // el precio de venta recién se fija la primera vez que se vende).
      // Sugerir el costo en ese caso, no un 0 que no ayuda a saber qué
      // monto poner.
      precio.value = producto.precio_venta > 0 ? producto.precio_venta : producto.precio_costo;
      cantidad.max = producto.stock;
    } else {
      productoIdInput.value = "";
      cantidad.removeAttribute("max");
    }
    actualizarSubtotalFila(fila);
    contenedor.dispatchEvent(new Event("item-change"));
  });

  fila.querySelectorAll(".item-cantidad, .item-precio").forEach((input) => {
    input.addEventListener("input", () => {
      actualizarSubtotalFila(fila);
      contenedor.dispatchEvent(new Event("item-change"));
    });
  });

  fila.querySelector(".item-row-remove").addEventListener("click", () => {
    fila.remove();
    contenedor.dispatchEvent(new Event("item-change"));
  });

  contenedor.appendChild(fila);
}

function agregarFilaItemCompra(contenedor) {
  const fila = document.createElement("div");
  fila.className = "item-row";

  fila.innerHTML = `
    <input type="text" class="item-producto" list="productosSugeridos" placeholder="Producto…" />
    <input type="number" class="item-cantidad" placeholder="Cant." step="1" min="1" />
    <input type="number" class="item-precio" placeholder="Costo unit." step="0.01" min="0" />
    <span class="item-subtotal mono">${money(0)}</span>
    <button type="button" class="item-row-remove" aria-label="Quitar producto">✕</button>
  `;

  fila.querySelectorAll(".item-cantidad, .item-precio").forEach((input) => {
    input.addEventListener("input", () => {
      actualizarSubtotalFila(fila);
      contenedor.dispatchEvent(new Event("item-change"));
    });
  });

  fila.querySelector(".item-row-remove").addEventListener("click", () => {
    fila.remove();
    contenedor.dispatchEvent(new Event("item-change"));
  });

  contenedor.appendChild(fila);
}

function leerItemsVenta(contenedor) {
  const items = [];
  contenedor.querySelectorAll(".item-row").forEach((fila) => {
    const producto_id = Number(fila.querySelector(".item-producto-id").value);
    const cantidad = Number(fila.querySelector(".item-cantidad").value);
    const precio_unitario = Number(fila.querySelector(".item-precio").value);
    if (producto_id && cantidad > 0 && precio_unitario >= 0) {
      items.push({ producto_id, cantidad, precio_unitario });
    }
  });
  return items;
}

function leerItemsCompra(contenedor) {
  const items = [];
  contenedor.querySelectorAll(".item-row").forEach((fila) => {
    const producto = fila.querySelector(".item-producto").value.trim();
    const cantidad = Number(fila.querySelector(".item-cantidad").value);
    const precio_unitario = Number(fila.querySelector(".item-precio").value);
    if (producto && cantidad > 0 && precio_unitario >= 0) {
      items.push({ producto, cantidad, precio_unitario });
    }
  });
  return items;
}

function totalItems(contenedor) {
  let total = 0;
  contenedor.querySelectorAll(".item-row").forEach((fila) => {
    const cantidad = Number(fila.querySelector(".item-cantidad").value) || 0;
    const precio_unitario = Number(fila.querySelector(".item-precio").value) || 0;
    total += cantidad * precio_unitario;
  });
  return total;
}

/* ---------- Productos ---------- */

let productos = [];
let productoEditandoId = null;
let productoFichaId = null;

function poblarDatalistProductos() {
  const opciones = productos.map((p) => `<option value="${p.nombre}"></option>`).join("");
  document.getElementById("productosSugeridos").innerHTML = opciones;
  document.getElementById("productosVenta").innerHTML = opciones;
}

const porcentaje = (n) => `${n.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;

function renderProductos(lista) {
  const body = document.getElementById("productosBody");
  body.innerHTML = "";

  if (lista.length === 0) {
    body.innerHTML = `<tr><td colspan="8" style="text-align:center; color: var(--ink-muted); padding: 24px;">
      Todavía no hay productos cargados.
    </td></tr>`;
    return;
  }

  for (const p of lista) {
    const tr = document.createElement("tr");
    tr.className = "fila-clickeable";
    tr.innerHTML = `
      <td data-label="Nombre">${p.nombre}</td>
      <td data-label="SKU">${p.sku || "—"}</td>
      <td data-label="Costo" class="align-right mono">${money(p.precio_costo)}</td>
      <td data-label="Valorizado" class="align-right mono">${money(p.valorizado)}</td>
      <td data-label="Precio" class="align-right mono">${money(p.precio_venta)}</td>
      <td data-label="Margen" class="align-right mono">${p.margen === null ? "—" : porcentaje(p.margen)}</td>
      <td data-label="Stock" class="align-right mono">${numero(p.stock)}</td>
      <td data-label="Activo"><span class="status ${p.activo ? "status-cobrado" : "status-vencido"}">${
        p.activo ? "Activo" : "Inactivo"
      }</span></td>
    `;
    tr.addEventListener("click", () => abrirFichaProducto(p.id));
    body.appendChild(tr);
  }
}

// La ficha se arma con la fila que ya está en el array `productos` (la
// lista trae todo lo que hace falta), así que el único fetch es el del
// historial de movimientos.
async function abrirFichaProducto(id) {
  productoFichaId = id;
  const producto = productos.find((p) => p.id === id);
  if (!producto) return;

  document.getElementById("fichaProductoNombre").textContent = producto.nombre;
  document.getElementById("fichaProductoCosto").textContent = money(producto.precio_costo);
  document.getElementById("fichaProductoStock").textContent = numero(producto.stock);
  document.getElementById("fichaProductoValorizado").textContent = money(producto.valorizado);

  const campos = [
    ["SKU", producto.sku],
    ["Precio de venta", money(producto.precio_venta)],
    ["Margen", producto.margen === null ? null : porcentaje(producto.margen)],
    ["Stock mínimo", numero(producto.stock_minimo)],
    ["Stock máximo", producto.stock_maximo === null ? null : numero(producto.stock_maximo)],
    ["Estado de stock", STOCK_LABEL[producto.estado_stock]],
    ["Activo", producto.activo ? "Sí" : "No"]
  ];
  document.getElementById("fichaProductoDatos").innerHTML = campos
    .map(([etiqueta, valor]) => `<div><dt>${etiqueta}</dt><dd>${valor || "—"}</dd></div>`)
    .join("");

  const movimientos = await (await fetch(`/api/productos/${id}/movimientos`)).json();
  const body = document.getElementById("fichaProductoMovimientos");
  body.innerHTML =
    movimientos.length === 0
      ? `<tr><td colspan="5" style="text-align:center; color: var(--ink-muted); padding: 24px;">
           Este producto todavía no tiene movimientos de stock.
         </td></tr>`
      : movimientos
          .map((m) => {
            const origen =
              m.origen === "venta"
                ? `Venta #${m.venta_id}`
                : m.origen === "compra"
                ? `Compra #${m.compra_id}`
                : "Ajuste manual";
            const signo = m.delta > 0 ? "+" : "";
            return `
        <tr>
          <td data-label="Fecha">${m.fecha}</td>
          <td data-label="Origen">${origen}</td>
          <td data-label="Cantidad" class="align-right mono">${signo}${numero(m.delta)}</td>
          <td data-label="Stock resultante" class="align-right mono">${numero(m.stock_posterior)}</td>
          <td data-label="Nota">${m.nota || "—"}</td>
        </tr>`;
          })
          .join("");

  mostrarVista("producto-detalle");
}

async function cargarProductos() {
  const res = await fetch("/api/productos");
  productos = await res.json();
  poblarDatalistProductos();
  renderProductos(productos);
}

document.getElementById("productosSearch").addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  renderProductos(
    productos.filter((p) => [p.nombre, p.sku].some((campo) => (campo ?? "").toLowerCase().includes(q)))
  );
});

const modalProducto = document.getElementById("modalProducto");

function abrirModalProducto(producto = null) {
  productoEditandoId = producto?.id ?? null;
  const form = document.getElementById("formProducto");
  document.getElementById("modalProductoTitulo").textContent = producto ? "Editar producto" : "Nuevo producto";
  form.nombre.value = producto?.nombre ?? "";
  form.sku.value = producto?.sku ?? "";
  form.precio_venta.value = producto?.precio_venta ?? "";
  form.stock_minimo.value = producto?.stock_minimo ?? "";
  form.stock_maximo.value = producto?.stock_maximo ?? "";
  form.activo.checked = producto ? !!producto.activo : true;
  modalProducto.hidden = false;
}

document.getElementById("btnNuevoProducto").addEventListener("click", () => abrirModalProducto());
document.getElementById("btnEditarProducto").addEventListener("click", () => {
  abrirModalProducto(productos.find((p) => p.id === productoFichaId));
});
document.getElementById("btnVolverProductos").addEventListener("click", () => mostrarVista("productos"));
document.getElementById("modalProductoClose").addEventListener("click", () => {
  modalProducto.hidden = true;
});
modalProducto.addEventListener("click", (e) => {
  if (e.target === modalProducto) modalProducto.hidden = true;
});

document.getElementById("formProducto").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const datos = {
    nombre: form.nombre.value,
    sku: form.sku.value || null,
    precio_venta: form.precio_venta.value,
    stock_minimo: form.stock_minimo.value,
    stock_maximo: form.stock_maximo.value,
    activo: form.activo.checked
  };

  const res = await fetch(
    productoEditandoId ? `/api/productos/${productoEditandoId}` : "/api/productos",
    {
      method: productoEditandoId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos)
    }
  );
  if (!(await manejarError(res, "No se pudo guardar el producto."))) return;

  const eraEdicion = productoEditandoId !== null;
  await cargarProductos();
  // Si se editaba desde la ficha, se refresca para que muestre los datos
  // nuevos en vez de quedar con los viejos detrás del modal.
  if (eraEdicion && productoFichaId) await abrirFichaProducto(productoFichaId);
  form.reset();
  modalProducto.hidden = true;
});

/* ---------- Cuentas de tesorería (sin pantalla propia todavía) ---------- */

let cuentasTesoreria = [];

function poblarSelectCuentas(select) {
  select.innerHTML = cuentasTesoreria.map((c) => `<option value="${c.id}">${c.nombre}</option>`).join("");
}

async function cargarCuentasTesoreria() {
  const res = await fetch("/api/cuentas-tesoreria");
  cuentasTesoreria = await res.json();
}

async function manejarError(res, accionDefault) {
  if (res.ok) return true;
  let mensaje = accionDefault;
  try {
    const cuerpo = await res.json();
    if (cuerpo.error) mensaje = cuerpo.error;
  } catch {
    // sin cuerpo JSON, se usa el mensaje por defecto
  }
  alert(mensaje);
  return false;
}

/* ---------- Stock ---------- */

// El "alto" comparte color con el pendiente (naranja): no es un error,
// pero es plata inmovilizada de más y conviene que salte a la vista.
const STOCK_CLASE = {
  sin_stock: "status-vencido",
  bajo: "status-vencido",
  normal: "status-cobrado",
  alto: "status-pendiente"
};
const STOCK_LABEL = {
  sin_stock: "Sin stock",
  bajo: "Stock bajo",
  normal: "Normal",
  alto: "Stock alto"
};

function renderStock(lista) {
  const body = document.getElementById("stockBody");
  body.innerHTML = "";

  if (lista.length === 0) {
    body.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--ink-muted); padding: 24px;">
      Todavía no hay productos con stock.
    </td></tr>`;
    return;
  }

  for (const p of lista) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="Producto">${p.nombre}</td>
      <td data-label="Costo" class="align-right mono">${money(p.precio_costo)}</td>
      <td data-label="Stock actual" class="align-right mono">${numero(p.stock)}</td>
      <td data-label="Estado"><span class="status ${STOCK_CLASE[p.estado_stock]}">${
        STOCK_LABEL[p.estado_stock]
      }</span></td>
    `;
    body.appendChild(tr);
  }
}

async function cargarStock() {
  const res = await fetch("/api/stock");
  const stock = await res.json();
  renderStock(stock);
}

const modalAjusteStock = document.getElementById("modalAjusteStock");

function poblarSelectProductos(select) {
  select.innerHTML =
    '<option value="">Producto…</option>' +
    productos.map((p) => `<option value="${p.id}">${p.nombre}</option>`).join("");
}

document.getElementById("btnAjusteStock").addEventListener("click", () => {
  poblarSelectProductos(document.querySelector('#formAjusteStock select[name="producto_id"]'));
  modalAjusteStock.hidden = false;
});
document.getElementById("modalAjusteStockClose").addEventListener("click", () => {
  modalAjusteStock.hidden = true;
});
modalAjusteStock.addEventListener("click", (e) => {
  if (e.target === modalAjusteStock) modalAjusteStock.hidden = true;
});

document.getElementById("formAjusteStock").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  await fetch("/api/stock/ajuste", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      producto_id: Number(form.producto_id.value),
      cantidad: parseFloat(form.cantidad.value),
      nota: form.nota.value || null
    })
  });

  await Promise.all([cargarStock(), cargarProductos()]);
  form.reset();
  modalAjusteStock.hidden = true;
});

/* ---------- Ventas ---------- */

function renderVentas(lista) {
  const body = document.getElementById("ventasBody");
  body.innerHTML = "";

  if (lista.length === 0) {
    body.innerHTML = `<tr><td colspan="8" style="text-align:center; color: var(--ink-muted); padding: 24px;">
      Todavía no hay ventas registradas.
    </td></tr>`;
    return;
  }

  const COBRO_CLASE = { pendiente: "status-vencido", parcial: "status-pendiente", cobrado: "status-cobrado" };

  for (const v of lista) {
    const tr = document.createElement("tr");

    const accionFactura = v.facturada
      ? `<span class="status status-cobrado">Facturada</span>`
      : `<button type="button" class="btn-link btn-facturar-venta" data-id="${v.id}">Facturar</button>`;
    const accionCobro =
      v.estado_cobro === "cobrado"
        ? ""
        : `<button type="button" class="btn-link btn-cobrar-venta" data-id="${v.id}">Cobrar</button>`;
    // Anular solo tiene sentido si no está facturada ni tiene cobros
    // (el backend lo vuelve a validar, esto es nada más para no invitar
    // a un click que ya sabemos que va a fallar).
    const accionAnular =
      !v.facturada && v.estado_cobro === "pendiente"
        ? `<button type="button" class="btn-icon-danger btn-anular-venta" data-id="${v.id}" title="Anular venta" aria-label="Anular venta">${ICONO_TACHO}</button>`
        : "";

    tr.innerHTML = `
      <td data-label="N°" class="mono">#${v.id}</td>
      <td data-label="Cliente">${v.cliente}</td>
      <td data-label="Fecha">${v.fecha}</td>
      <td data-label="Costo" class="align-right mono">${money(v.costo_total)}</td>
      <td data-label="Total" class="align-center mono">${money(v.total)}</td>
      <td data-label="Ganancia" class="align-right mono">${money(v.margen)}</td>
      <td data-label="Cobro"><span class="status ${COBRO_CLASE[v.estado_cobro]}">${v.estado_cobro}</span></td>
      <td data-label="">${accionFactura} ${accionCobro} ${accionAnular}</td>
    `;
    body.appendChild(tr);
  }

  body.querySelectorAll(".btn-facturar-venta").forEach((btn) => {
    btn.addEventListener("click", () => {
      ventaAFacturarId = Number(btn.dataset.id);
      modalFacturarVenta.hidden = false;
    });
  });

  body.querySelectorAll(".btn-anular-venta").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Anular esta venta? Va a la papelera y el stock vuelve al depósito.")) return;
      const res = await fetch(`/api/ventas/${btn.dataset.id}/anular`, { method: "POST" });
      if (!(await manejarError(res, "No se pudo anular la venta."))) return;
      await Promise.all([cargarVentas(), cargarStock(), cargarProductos()]);
    });
  });

  body.querySelectorAll(".btn-cobrar-venta").forEach((btn) => {
    btn.addEventListener("click", () => abrirModalCobrarVenta(Number(btn.dataset.id)));
  });
}

// `ventas` guarda todo lo que devuelve la API (incluidas las anuladas)
// porque la papelera se arma sobre ese mismo array; la tabla de Ventas
// filtra al renderizar.
async function cargarVentas() {
  const res = await fetch("/api/ventas");
  ventas = await res.json();
  renderVentas(ventas.filter((v) => v.estado !== "anulada"));
  renderPapelera();
}

let ventas = [];
let ventaAFacturarId = null;

const modalVenta = document.getElementById("modalVenta");
const ventaItemsEl = document.getElementById("ventaItems");

function actualizarTotalVenta() {
  document.getElementById("ventaTotal").textContent = money(totalItems(ventaItemsEl));
}
ventaItemsEl.addEventListener("item-change", actualizarTotalVenta);

document.getElementById("btnNuevaVenta").addEventListener("click", () => {
  ventaItemsEl.innerHTML = "";
  agregarFilaItemVenta(ventaItemsEl, productos);
  actualizarTotalVenta();
  document.querySelector('#formVenta input[name="fecha"]').value = hoyISO();
  modalVenta.hidden = false;
});
document.getElementById("btnAgregarItemVenta").addEventListener("click", () => {
  agregarFilaItemVenta(ventaItemsEl, productos);
});
document.getElementById("modalVentaClose").addEventListener("click", () => {
  modalVenta.hidden = true;
});
modalVenta.addEventListener("click", (e) => {
  if (e.target === modalVenta) modalVenta.hidden = true;
});

document.getElementById("formVenta").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  for (const fila of ventaItemsEl.querySelectorAll(".item-row")) {
    const cantidadInput = fila.querySelector(".item-cantidad");
    const tope = cantidadInput.max ? Number(cantidadInput.max) : null;
    if (tope !== null && Number(cantidadInput.value) > tope) {
      alert(`No hay suficiente stock de "${fila.querySelector(".item-producto").value}" (disponible: ${numero(tope)}).`);
      return;
    }
  }

  const items = leerItemsVenta(ventaItemsEl);

  if (items.length === 0) {
    alert("Agregá al menos un producto a la venta.");
    return;
  }

  // Si el nombre tipeado matchea exactamente un cliente que ya existe, se
  // manda su id para no crear un duplicado; si no, se manda el nombre y el
  // backend lo crea (así "elegir existente o crear nuevo" es un solo campo).
  const nombreCliente = form.cliente.value.trim();
  const clienteExistente = clientes.find(
    (c) => c.nombre.trim().toLowerCase() === nombreCliente.toLowerCase()
  );

  const res = await fetch("/api/ventas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cliente: nombreCliente,
      cliente_id: clienteExistente?.id ?? null,
      fecha: form.fecha.value,
      items
    })
  });
  if (!(await manejarError(res, "No se pudo registrar la venta."))) return;

  await Promise.all([cargarVentas(), cargarStock(), cargarProductos(), cargarClientes()]);
  form.reset();
  modalVenta.hidden = true;
});

const modalFacturarVenta = document.getElementById("modalFacturarVenta");

document.getElementById("modalFacturarVentaClose").addEventListener("click", () => {
  modalFacturarVenta.hidden = true;
});
modalFacturarVenta.addEventListener("click", (e) => {
  if (e.target === modalFacturarVenta) modalFacturarVenta.hidden = true;
});

document.getElementById("formFacturarVenta").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  await fetch(`/api/ventas/${ventaAFacturarId}/facturar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ condicion: form.condicion.value })
  });

  await Promise.all([cargarVentas(), cargarFacturas()]);
  ventaAFacturarId = null;
  modalFacturarVenta.hidden = true;
});

/* ---------- Cobrar venta ---------- */

const modalCobrarVenta = document.getElementById("modalCobrarVenta");
let ventaACobrarId = null;

function renderHistorialPagos(contenedorId, lista) {
  const contenedor = document.getElementById(contenedorId);
  if (lista.length === 0) {
    contenedor.innerHTML = "";
    return;
  }
  contenedor.innerHTML =
    `<div class="historial-pagos">` +
    lista
      .map((p) => `<div class="historial-pagos-item"><span>${p.fecha} · ${p.cuenta}</span><span class="mono">${money(p.importe)}</span></div>`)
      .join("") +
    `</div>`;
}

async function abrirModalCobrarVenta(id) {
  ventaACobrarId = id;
  const venta = ventas.find((v) => v.id === id);
  document.getElementById("cobroVentaTotal").textContent = money(venta.total);
  document.getElementById("cobroVentaCobrado").textContent = money(venta.cobrado);
  document.getElementById("cobroVentaSaldo").textContent = money(venta.total - venta.cobrado);

  poblarSelectCuentas(document.querySelector('#formCobrarVenta select[name="cuenta_tesoreria_id"]'));

  const cobros = await (await fetch(`/api/ventas/${id}/cobros`)).json();
  renderHistorialPagos("cobroVentaHistorial", cobros);

  modalCobrarVenta.hidden = false;
}

document.getElementById("modalCobrarVentaClose").addEventListener("click", () => {
  modalCobrarVenta.hidden = true;
});
modalCobrarVenta.addEventListener("click", (e) => {
  if (e.target === modalCobrarVenta) modalCobrarVenta.hidden = true;
});

document.getElementById("formCobrarVenta").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  const res = await fetch(`/api/ventas/${ventaACobrarId}/cobros`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      importe: parseFloat(form.importe.value),
      cuenta_tesoreria_id: Number(form.cuenta_tesoreria_id.value),
      nota: form.nota.value || null
    })
  });

  if (!(await manejarError(res, "No se pudo registrar el cobro."))) return;

  await cargarVentas();
  form.reset();
  modalCobrarVenta.hidden = true;
});

/* ---------- Compras ---------- */

const ENVIO_LABEL = { pedido: "Pedido", en_camino: "En camino", recibido: "Recibido" };
const PAGO_CLASE = { pendiente: "status-vencido", parcial: "status-pendiente", pagado: "status-cobrado" };

function renderCompras(lista) {
  const body = document.getElementById("comprasBody");
  body.innerHTML = "";

  if (lista.length === 0) {
    body.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--ink-muted); padding: 24px;">
      Todavía no hay compras registradas.
    </td></tr>`;
    return;
  }

  for (const c of lista) {
    const tr = document.createElement("tr");
    const borrador = c.estado === "borrador";

    // Anular solo tiene sentido si no tiene pagos (el backend lo vuelve a
    // validar, esto es nada más para no invitar a un click que ya sabemos
    // que va a fallar).
    const accionAnular =
      c.estado_pago === "pendiente"
        ? `<button type="button" class="btn-icon-danger btn-anular-compra" data-id="${c.id}" title="Anular compra" aria-label="Anular compra">${ICONO_TACHO}</button>`
        : "";

    // Un borrador todavía no le debe nada a nadie, así que no se puede
    // pagar ni tiene estado de envío que tocar: lo único que ofrece es
    // efectuar el pedido.
    if (borrador) {
      tr.innerHTML = `
        <td data-label="N°" class="mono">#${c.id}</td>
        <td data-label="Proveedor">${c.proveedor}</td>
        <td data-label="Fecha">${c.fecha}</td>
        <td data-label="Total" class="align-right mono">${money(c.total)}</td>
        <td data-label="Pago"><span class="status status-pendiente">borrador</span></td>
        <td data-label="Envío">—</td>
        <td data-label=""><button type="button" class="btn-link btn-confirmar-compra" data-id="${c.id}">Efectuar pedido</button> ${accionAnular}</td>
      `;
      body.appendChild(tr);
      continue;
    }

    const accionPago =
      c.estado_pago === "pagado"
        ? ""
        : `<button type="button" class="btn-link btn-pagar-compra" data-id="${c.id}">Pagar</button>`;
    // Una vez recibida no se puede volver atrás (el costo promedio ya se
    // recalculó), así que el selector se reemplaza por texto plano.
    const celdaEnvio =
      c.estado_envio === "recibido"
        ? `<span class="status status-cobrado">Recibido</span>`
        : `<select class="select-inline select-estado-envio" data-id="${c.id}">${Object.entries(ENVIO_LABEL)
            .map(
              ([valor, label]) =>
                `<option value="${valor}" ${valor === c.estado_envio ? "selected" : ""}>${label}</option>`
            )
            .join("")}</select>`;

    tr.innerHTML = `
      <td data-label="N°" class="mono">#${c.id}</td>
      <td data-label="Proveedor">${c.proveedor}</td>
      <td data-label="Fecha">${c.fecha}</td>
      <td data-label="Total" class="align-right mono">${money(c.total)}</td>
      <td data-label="Pago"><span class="status ${PAGO_CLASE[c.estado_pago]}">${c.estado_pago}</span></td>
      <td data-label="Envío">${celdaEnvio}</td>
      <td data-label="">${accionPago} ${accionAnular}</td>
    `;
    body.appendChild(tr);
  }

  body.querySelectorAll(".btn-confirmar-compra").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Efectuar el pedido? Se va a registrar la deuda con el proveedor.")) return;
      const res = await fetch(`/api/compras/${btn.dataset.id}/confirmar`, { method: "POST" });
      if (!(await manejarError(res, "No se pudo efectuar el pedido."))) return;
      await cargarCompras();
    });
  });

  body.querySelectorAll(".btn-pagar-compra").forEach((btn) => {
    btn.addEventListener("click", () => abrirModalPagarCompra(Number(btn.dataset.id)));
  });

  body.querySelectorAll(".btn-anular-compra").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Anular esta compra? Va a la papelera y el stock que sumó se revierte.")) return;
      const res = await fetch(`/api/compras/${btn.dataset.id}/anular`, { method: "POST" });
      if (!(await manejarError(res, "No se pudo anular la compra."))) return;
      await Promise.all([cargarCompras(), cargarStock(), cargarProductos()]);
    });
  });

  body.querySelectorAll(".select-estado-envio").forEach((select) => {
    select.addEventListener("change", async () => {
      if (
        select.value === "recibido" &&
        !confirm("¿Marcar la compra como recibida? Se va a sumar el stock y recalcular el costo.")
      ) {
        await cargarCompras();
        return;
      }
      const res = await fetch(`/api/compras/${select.dataset.id}/estado-envio`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado_envio: select.value })
      });
      if (!(await manejarError(res, "No se pudo cambiar el estado de envío."))) {
        await cargarCompras();
        return;
      }
      // Recibir una compra mueve stock y costo, así que hay que refrescar
      // esas pantallas también.
      await Promise.all([cargarCompras(), cargarStock(), cargarProductos()]);
    });
  });
}

let compras = [];

async function cargarCompras() {
  const res = await fetch("/api/compras");
  compras = await res.json();
  renderCompras(compras.filter((c) => c.estado !== "anulada"));
  renderPapelera();
}

const modalCompra = document.getElementById("modalCompra");
const compraItemsEl = document.getElementById("compraItems");
const compraCostoEnvioEl = document.getElementById("compraCostoEnvio");

// El envío vive fuera de #compraItems (no es un ítem), así que totalItems()
// no lo ve y hay que sumarlo aparte.
function actualizarTotalCompra() {
  const envio = Number(compraCostoEnvioEl.value) || 0;
  document.getElementById("compraTotal").textContent = money(totalItems(compraItemsEl) + envio);
}
compraItemsEl.addEventListener("item-change", actualizarTotalCompra);
compraCostoEnvioEl.addEventListener("input", actualizarTotalCompra);

document.getElementById("btnNuevaCompra").addEventListener("click", () => {
  compraItemsEl.innerHTML = "";
  agregarFilaItemCompra(compraItemsEl);
  compraCostoEnvioEl.value = "";
  actualizarTotalCompra();
  document.querySelector('#formCompra input[name="fecha"]').value = hoyISO();
  modalCompra.hidden = false;
});
document.getElementById("btnAgregarItemCompra").addEventListener("click", () => {
  agregarFilaItemCompra(compraItemsEl);
});
document.getElementById("modalCompraClose").addEventListener("click", () => {
  modalCompra.hidden = true;
});
modalCompra.addEventListener("click", (e) => {
  if (e.target === modalCompra) modalCompra.hidden = true;
});

document.getElementById("formCompra").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const items = leerItemsCompra(compraItemsEl);

  if (items.length === 0) {
    alert("Agregá al menos un producto a la compra.");
    return;
  }

  const res = await fetch("/api/compras", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      proveedor: form.proveedor.value,
      fecha: form.fecha.value,
      costo_envio: form.costo_envio.value,
      items
    })
  });
  if (!(await manejarError(res, "No se pudo guardar la compra."))) return;

  await Promise.all([cargarCompras(), cargarStock(), cargarProductos()]);
  form.reset();
  modalCompra.hidden = true;
});

/* ---------- Pagar compra ---------- */

const modalPagarCompra = document.getElementById("modalPagarCompra");
let compraAPagarId = null;

async function abrirModalPagarCompra(id) {
  compraAPagarId = id;
  const compra = compras.find((c) => c.id === id);
  document.getElementById("pagoCompraTotal").textContent = money(compra.total);
  document.getElementById("pagoCompraPagado").textContent = money(compra.pagado);
  document.getElementById("pagoCompraSaldo").textContent = money(compra.total - compra.pagado);

  poblarSelectCuentas(document.querySelector('#formPagarCompra select[name="cuenta_tesoreria_id"]'));

  const pagos = await (await fetch(`/api/compras/${id}/pagos`)).json();
  renderHistorialPagos("pagoCompraHistorial", pagos);

  modalPagarCompra.hidden = false;
}

document.getElementById("modalPagarCompraClose").addEventListener("click", () => {
  modalPagarCompra.hidden = true;
});
modalPagarCompra.addEventListener("click", (e) => {
  if (e.target === modalPagarCompra) modalPagarCompra.hidden = true;
});

document.getElementById("formPagarCompra").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  const res = await fetch(`/api/compras/${compraAPagarId}/pagos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      importe: parseFloat(form.importe.value),
      cuenta_tesoreria_id: Number(form.cuenta_tesoreria_id.value),
      nota: form.nota.value || null
    })
  });

  if (!(await manejarError(res, "No se pudo registrar el pago."))) return;

  await cargarCompras();
  form.reset();
  modalPagarCompra.hidden = true;
});

/* ---------- Clientes (CRM) ---------- */

let clientes = [];
let clienteEditandoId = null;
let clienteFichaId = null;

function renderClientes(lista) {
  const body = document.getElementById("clientesBody");
  body.innerHTML = "";

  if (lista.length === 0) {
    body.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--ink-muted); padding: 24px;">
      Todavía no hay clientes cargados.
    </td></tr>`;
    return;
  }

  for (const c of lista) {
    const tr = document.createElement("tr");
    tr.className = "fila-clickeable";
    const contacto = [c.telefono, c.email].filter(Boolean).join(" · ") || "—";
    tr.innerHTML = `
      <td data-label="Nombre">${c.nombre}</td>
      <td data-label="Contacto">${contacto}</td>
      <td data-label="Compras" class="align-right mono">${numero(c.cantidad_compras)}</td>
      <td data-label="Total gastado" class="align-right mono">${money(c.total_gastado)}</td>
      <td data-label="Deuda" class="align-right mono">${money(c.deuda)}</td>
    `;
    tr.addEventListener("click", () => abrirFichaCliente(c.id));
    body.appendChild(tr);
  }
}

function poblarDatalistClientes() {
  document.getElementById("clientesSugeridos").innerHTML = clientes
    .map((c) => `<option value="${c.nombre}"></option>`)
    .join("");
}

async function cargarClientes() {
  const res = await fetch("/api/clientes");
  clientes = await res.json();
  renderClientes(clientes);
  poblarDatalistClientes();
}

document.getElementById("clientesSearch").addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  renderClientes(
    clientes.filter((c) =>
      [c.nombre, c.email, c.telefono].some((campo) => (campo ?? "").toLowerCase().includes(q))
    )
  );
});

async function abrirFichaCliente(id) {
  clienteFichaId = id;
  const cliente = await (await fetch(`/api/clientes/${id}`)).json();

  document.getElementById("fichaClienteNombre").textContent = cliente.nombre;
  document.getElementById("fichaClienteTotal").textContent = money(cliente.total_gastado);
  document.getElementById("fichaClienteCompras").textContent = numero(cliente.cantidad_compras);
  document.getElementById("fichaClienteDeuda").textContent = money(cliente.deuda);

  const campos = [
    ["Email", cliente.email],
    ["Teléfono", cliente.telefono],
    ["Dirección", cliente.direccion],
    ["CUIT / DNI", cliente.documento],
    ["Última compra", cliente.ultima_compra],
    ["Notas", cliente.notas]
  ];
  document.getElementById("fichaClienteDatos").innerHTML = campos
    .map(([etiqueta, valor]) => `<div><dt>${etiqueta}</dt><dd>${valor || "—"}</dd></div>`)
    .join("");

  const COBRO_CLASE = { pendiente: "status-vencido", parcial: "status-pendiente", cobrado: "status-cobrado" };
  const historialBody = document.getElementById("fichaClienteHistorial");
  historialBody.innerHTML =
    cliente.historial.length === 0
      ? `<tr><td colspan="4" style="text-align:center; color: var(--ink-muted); padding: 24px;">
           Este cliente todavía no tiene compras.
         </td></tr>`
      : cliente.historial
          .map((v) => {
            const anulada = v.estado === "anulada";
            return `
        <tr class="${anulada ? "fila-anulada" : ""}">
          <td data-label="N°" class="mono">#${v.id}</td>
          <td data-label="Fecha">${v.fecha}</td>
          <td data-label="Total" class="align-right mono">${money(v.total)}</td>
          <td data-label="Cobro"><span class="status ${
            anulada ? "status-vencido" : COBRO_CLASE[v.estado_cobro]
          }">${anulada ? "anulada" : v.estado_cobro}</span></td>
        </tr>`;
          })
          .join("");

  mostrarVista("cliente-detalle");
}

const modalCliente = document.getElementById("modalCliente");

function abrirModalCliente(cliente = null) {
  clienteEditandoId = cliente?.id ?? null;
  const form = document.getElementById("formCliente");
  document.getElementById("modalClienteTitulo").textContent = cliente ? "Editar cliente" : "Nuevo cliente";
  form.nombre.value = cliente?.nombre ?? "";
  form.email.value = cliente?.email ?? "";
  form.telefono.value = cliente?.telefono ?? "";
  form.direccion.value = cliente?.direccion ?? "";
  form.documento.value = cliente?.documento ?? "";
  form.notas.value = cliente?.notas ?? "";
  modalCliente.hidden = false;
}

document.getElementById("btnNuevoCliente").addEventListener("click", () => abrirModalCliente());
document.getElementById("btnEditarCliente").addEventListener("click", async () => {
  const cliente = await (await fetch(`/api/clientes/${clienteFichaId}`)).json();
  abrirModalCliente(cliente);
});
document.getElementById("modalClienteClose").addEventListener("click", () => {
  modalCliente.hidden = true;
});
modalCliente.addEventListener("click", (e) => {
  if (e.target === modalCliente) modalCliente.hidden = true;
});
document.getElementById("btnVolverClientes").addEventListener("click", () => mostrarVista("clientes"));

document.getElementById("formCliente").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const datos = {
    nombre: form.nombre.value,
    email: form.email.value || null,
    telefono: form.telefono.value || null,
    direccion: form.direccion.value || null,
    documento: form.documento.value || null,
    notas: form.notas.value || null
  };

  const res = await fetch(
    clienteEditandoId ? `/api/clientes/${clienteEditandoId}` : "/api/clientes",
    {
      method: clienteEditandoId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos)
    }
  );
  if (!(await manejarError(res, "No se pudo guardar el cliente."))) return;

  const eraEdicion = clienteEditandoId !== null;
  await cargarClientes();
  if (eraEdicion && clienteFichaId) await abrirFichaCliente(clienteFichaId);
  form.reset();
  modalCliente.hidden = true;
});

/* ---------- Carga inicial de las secciones nuevas ---------- */

/* ---------- Papelera ---------- */

// Se arma sobre los arrays que ya tienen Ventas y Compras (la API devuelve
// las anuladas junto con el resto), así que no hace falta un fetch propio.
// La llaman cargarVentas() y cargarCompras() después de refrescarse.
function renderPapelera() {
  const body = document.getElementById("papeleraBody");
  const anulados = [
    ...ventas
      .filter((v) => v.estado === "anulada")
      .map((v) => ({ tipo: "Venta", id: v.id, fecha: v.fecha, quien: v.cliente, total: v.total })),
    ...compras
      .filter((c) => c.estado === "anulada")
      .map((c) => ({ tipo: "Compra", id: c.id, fecha: c.fecha, quien: c.proveedor, total: c.total }))
  ].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id);

  if (anulados.length === 0) {
    body.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--ink-muted); padding: 24px;">
      La papelera está vacía.
    </td></tr>`;
    return;
  }

  body.innerHTML = anulados
    .map(
      (d) => `
    <tr>
      <td data-label="Tipo">${d.tipo}</td>
      <td data-label="N°" class="mono">#${d.id}</td>
      <td data-label="Fecha">${d.fecha}</td>
      <td data-label="Cliente / Proveedor">${d.quien}</td>
      <td data-label="Total" class="align-right mono">${money(d.total)}</td>
      <td data-label=""><button type="button" class="btn-link btn-restaurar"
        data-tipo="${d.tipo === "Venta" ? "ventas" : "compras"}" data-id="${d.id}">Restaurar</button></td>
    </tr>`
    )
    .join("");

  body.querySelectorAll(".btn-restaurar").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const res = await fetch(`/api/${btn.dataset.tipo}/${btn.dataset.id}/restaurar`, {
        method: "POST"
      });
      if (!(await manejarError(res, "No se pudo restaurar el documento."))) return;
      await Promise.all([cargarVentas(), cargarCompras(), cargarStock(), cargarProductos()]);
    });
  });
}

cargarCuentasTesoreria();
cargarClientes();
cargarProductos().then(() => {
  cargarVentas();
  cargarCompras();
  cargarStock();
});

/* ---------- Menú mobile y navegación entre vistas ---------- */

document.getElementById("navToggle").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("is-open");
});

const VISTAS_CONSTRUIDAS = new Set([
  "dashboard",
  "ventas",
  "compras",
  "stock",
  "clientes",
  "productos",
  "papelera"
]);
const btnNuevaFactura = document.getElementById("btnNuevaFactura");

function mostrarVista(viewId) {
  document.querySelectorAll(".view").forEach((sec) => {
    sec.hidden = sec.dataset.view !== viewId;
  });
  btnNuevaFactura.hidden = viewId !== "dashboard";
}

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    document.querySelectorAll(".nav-item").forEach((i) => i.classList.remove("is-active"));
    item.classList.add("is-active");
    document.getElementById("sidebar").classList.remove("is-open");

    const view = item.dataset.view;
    mostrarVista(VISTAS_CONSTRUIDAS.has(view) ? view : "placeholder");
  });
});
