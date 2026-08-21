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

/* ---------- Menú mobile ---------- */

document.getElementById("navToggle").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("is-open");
});

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    document.querySelectorAll(".nav-item").forEach((i) => i.classList.remove("is-active"));
    item.classList.add("is-active");
    document.getElementById("sidebar").classList.remove("is-open");
    // Las vistas de Facturas / Clientes / IVA / Voz se arman en los
    // próximos pasos — por ahora todo el nav apunta al mismo dashboard.
  });
});
