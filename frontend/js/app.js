/**
 * app.js
 * -----------------------------------------------------------
 * Todo acá trabaja sobre el array FACTURAS de data.js.
 * Cuando exista el backend, el único cambio real es reemplazar
 * `let facturas = FACTURAS.map(calcularFactura);`
 * por algo como:
 *   const res = await fetch('/api/facturas');
 *   let facturas = await res.json();
 * El resto (render, filtro, resumen) sigue funcionando igual
 * porque ya está escrito contra la forma de esos datos.
 */

let facturas = FACTURAS.map(calcularFactura);

document.getElementById("businessName").textContent = NEGOCIO.nombre;

document.getElementById("todayDate").textContent = new Date().toLocaleDateString("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long"
});

const money = (n) =>
  n.toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });

function renderResumen(lista) {
  const facturado = lista.reduce((acc, f) => acc + f.neto, 0);
  const iva = lista.reduce((acc, f) => acc + f.iva, 0);
  const retenido = lista.reduce((acc, f) => acc + f.retencionMp, 0);
  const neto = facturado + iva - retenido;

  document.getElementById("sumFacturado").textContent = money(facturado);
  document.getElementById("sumIva").textContent = money(iva);
  document.getElementById("sumRetenciones").textContent = money(retenido);
  document.getElementById("sumNeto").textContent = money(neto);
}

function renderTabla(lista) {
  const body = document.getElementById("movimientosBody");
  body.innerHTML = "";

  if (lista.length === 0) {
    body.innerHTML = `<tr><td colspan="8" style="text-align:center; color: var(--ink-muted); padding: 24px;">
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
      <td data-label="Neto" class="align-right mono">${money(f.neto)}</td>
      <td data-label="IVA" class="align-right mono">${money(f.iva)}</td>
      <td data-label="Ret. MP" class="align-right mono">${f.retencionMp ? money(f.retencionMp) : "—"}</td>
      <td data-label="Total" class="align-right mono">${money(f.total)}</td>
      <td data-label="Estado"><span class="status status-${f.estado}">${f.estado}</span></td>
    `;
    body.appendChild(tr);
  }
}

function render(lista = facturas) {
  renderResumen(lista);
  renderTabla(lista);
}

render();

/* ---------- Búsqueda ---------- */

document.getElementById("searchInput").addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  const filtradas = facturas.filter(
    (f) => f.cliente.toLowerCase().includes(q) || f.id.includes(q)
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

document.getElementById("formFactura").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target;

  const nueva = calcularFactura({
    id: String(facturas.length + 1).padStart(4, "0"),
    cliente: form.cliente.value,
    concepto: form.concepto.value,
    neto: parseFloat(form.neto.value),
    condicion: form.condicion.value,
    estado: "pendiente"
  });

  facturas = [nueva, ...facturas];
  render();
  form.reset();
  modal.hidden = true;

  // Cuando exista el backend, acá va el fetch POST a /api/facturas
  // en vez de solo actualizar el array en memoria.
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
