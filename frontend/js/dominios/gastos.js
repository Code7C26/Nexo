/**
 * dominios/gastos.js
 * Gastos y sus categorías. Movido tal cual desde app.js (CLAUDE.md §31,
 * Etapa B / F5); lo único que cambia es que las recargas y el render de la
 * papelera, que viven en otros dominios, se piden por nombre.
 */

import { ICONO_TACHO, botonEditarFila, esAdmin, hoyISO, money } from "../core/formato.js";
import { avisar, confirmar, filaVacia, filaVaciaFiltrada, manejarError, tablaCargando } from "../core/ui.js";
import { crearFiltros } from "../core/filtros.js";
import { descargarCSV } from "../core/csv.js";
import { cuentasTesoreria, poblarSelectCuentas, proveedores } from "../core/maestros.js";
import { invocar, recargar, registrar } from "../core/registro.js";

/* ---------- Gastos ---------- */

// Los gastos son lo que le falta al sistema para saber si el negocio gana
// plata: las ventas y su costo ya estaban, pero el alquiler y la luz no.
// El tipo de cada gasto decide si pesa o no en el resultado (ver
// schema.sql): los tres bajan la caja, solo el operativo baja el resultado.
// `gastos` y `categoriasGasto` los leen Resumen (últimos movimientos), la
// Papelera y el asistente, por eso se exportan.
export let gastos = [];
export let categoriasGasto = [];
let gastoEditandoId = null;

const TIPO_GASTO_LABEL = { operativo: "Operativo", inversion: "Inversión", retiro: "Retiro" };
const TIPO_GASTO_CLASE = {
  operativo: "status-vencido",
  inversion: "status-pendiente",
  retiro: "status-pendiente"
};

function renderGastos(lista) {
  const body = document.getElementById("gastosBody");

  document.getElementById("gastosOperativos").textContent = money(
    lista.filter((g) => g.tipo === "operativo").reduce((acc, g) => acc + g.importe, 0)
  );
  document.getElementById("gastosInversiones").textContent = money(
    lista.filter((g) => g.tipo === "inversion").reduce((acc, g) => acc + g.importe, 0)
  );
  document.getElementById("gastosRetiros").textContent = money(
    lista.filter((g) => g.tipo === "retiro").reduce((acc, g) => acc + g.importe, 0)
  );

  if (lista.length === 0) {
    if (categoriasGasto.length === 0) {
      body.innerHTML = filaVacia(7, "Primero creá una categoría de gasto (botón «Categorías») y después vas a poder cargar gastos.");
    } else if (filtrosGastos.filtros.length > 0) {
      body.innerHTML = filaVaciaFiltrada(7);
      body.querySelector(".tabla-vacia-limpiar").addEventListener("click", () => filtrosGastos.limpiar());
    } else {
      body.innerHTML = filaVacia(7, "Todavía no hay gastos registrados.", { accionTexto: "+ Nuevo gasto", accionId: "btnNuevoGasto" });
    }
    return;
  }

  body.innerHTML = lista
    .map(
      (g) => `
    <tr>
      <td data-label="Fecha">${g.fecha}</td>
      <td data-label="Categoría">${g.categoria}</td>
      <td data-label="Tipo"><span class="status ${TIPO_GASTO_CLASE[g.tipo]}">${
        TIPO_GASTO_LABEL[g.tipo]
      }</span></td>
      <td data-label="Descripción">${g.descripcion || "—"}</td>
      <td data-label="Cuenta">${g.cuenta}</td>
      <td data-label="Importe" class="align-right mono">${money(g.importe)}</td>
      <td data-label=""><div class="fila-acciones">
        ${botonEditarFila("btn-editar-gasto", g.id, "gasto")}
        ${
          esAdmin()
            ? `<button type="button" class="btn-icon-danger btn-anular-gasto" data-id="${g.id}" title="Anular gasto" aria-label="Anular gasto">${ICONO_TACHO}</button>`
            : ""
        }
      </div></td>
    </tr>`
    )
    .join("");

  body.querySelectorAll(".btn-editar-gasto").forEach((btn) => {
    btn.addEventListener("click", () => abrirModalGasto(gastos.find((g) => g.id === Number(btn.dataset.id))));
  });

  body.querySelectorAll(".btn-anular-gasto").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (
        !(await confirmar({
          cuerpo: "¿Anular este gasto? Va a la papelera y la plata vuelve a la cuenta.",
          aceptar: "Anular gasto",
          destructivo: true
        }))
      )
        return;
      const res = await fetch(`/api/gastos/${btn.dataset.id}/anular`, { method: "POST" });
      if (!(await manejarError(res, "No se pudo anular el gasto."))) return;
      avisar(`Gasto #${btn.dataset.id} anulado.`, "ok");
      await recargar("gastos", "caja", "panelResumen");
    });
  });
}

function filtrarGastos() {
  const activos = gastos.filter((g) => g.estado === "activo");
  renderGastos(filtrosGastos.aplicar(activos));
}

// Misma composición que filtrarGastos, para que el CSV traiga exactamente las
// filas que muestra la tabla.
function listaGastosVisible() {
  const activos = gastos.filter((g) => g.estado === "activo");
  return filtrosGastos.aplicar(activos);
}

const COLUMNAS_CSV_GASTOS = [
  { titulo: "N°", valor: (g) => g.id },
  { titulo: "Fecha", valor: (g) => g.fecha },
  { titulo: "Categoría", valor: (g) => g.categoria },
  { titulo: "Tipo", valor: (g) => TIPO_GASTO_LABEL[g.tipo] ?? g.tipo },
  { titulo: "Descripción", valor: (g) => g.descripcion },
  { titulo: "Proveedor", valor: (g) => g.proveedor },
  { titulo: "Cuenta", valor: (g) => g.cuenta },
  { titulo: "Comprobante", valor: (g) => g.comprobante },
  { titulo: "Importe", valor: (g) => g.importe }
];

document.getElementById("btnExportarGastos").addEventListener("click", () => {
  descargarCSV("nexo-gastos", COLUMNAS_CSV_GASTOS, listaGastosVisible());
});

const filtrosGastos = crearFiltros(
  "filtrosGastos",
  [
    { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
    { clave: "categoria_id", etiqueta: "Categoría", tipo: "select", opciones: [] },
    {
      clave: "tipo",
      etiqueta: "Tipo",
      tipo: "select",
      opciones: [
        { valor: "operativo", texto: "Operativo" },
        { valor: "inversion", texto: "Inversión" },
        { valor: "retiro", texto: "Retiro" }
      ]
    },
    { clave: "cuenta_tesoreria_id", etiqueta: "Cuenta", tipo: "select", opciones: [] },
    { clave: "importe", etiqueta: "Importe", tipo: "numero" },
    { clave: "descripcion", etiqueta: "Descripción", tipo: "texto" },
    { clave: "proveedor", etiqueta: "Proveedor", tipo: "texto" },
    { clave: "comprobante", etiqueta: "Comprobante", tipo: "texto" }
  ],
  filtrarGastos
);

async function cargarGastos() {
  tablaCargando("gastosBody", 7);
  const [listaGastos, listaCategorias] = await Promise.all([
    fetch("/api/gastos").then((r) => r.json()),
    fetch("/api/categorias-gasto").then((r) => r.json())
  ]);
  gastos = listaGastos;
  categoriasGasto = listaCategorias;

  filtrosGastos.setOpciones(
    "categoria_id",
    categoriasGasto.map((c) => ({ valor: c.id, texto: c.nombre }))
  );
  filtrosGastos.setOpciones(
    "cuenta_tesoreria_id",
    cuentasTesoreria.map((c) => ({ valor: c.id, texto: c.nombre }))
  );

  filtrarGastos();
  renderCategorias();
  invocar("render:papelera");
}

/* --- Modal de gasto --- */

const modalGasto = document.getElementById("modalGasto");

function abrirModalGasto(gasto = null) {
  if (categoriasGasto.length === 0) {
    avisar("Primero creá una categoría de gasto desde el botón «Categorías».", "atencion");
    return;
  }
  gastoEditandoId = gasto?.id ?? null;
  document.getElementById("modalGastoTitulo").textContent = gasto ? "Editar gasto" : "Nuevo gasto";
  document.getElementById("formGastoSubmit").textContent = gasto ? "Guardar cambios" : "Registrar gasto";

  const form = document.getElementById("formGasto");
  // Solo se ofrecen las categorías activas, salvo la del gasto que se está
  // editando: si se desactivó después, igual tiene que poder verse.
  const categoriasDisponibles = categoriasGasto.filter(
    (c) => c.activa || c.id === gasto?.categoria_id
  );
  document.getElementById("gastoCategoria").innerHTML = categoriasDisponibles
    .map((c) => `<option value="${c.id}">${c.nombre}</option>`)
    .join("");
  poblarSelectCuentas(document.getElementById("gastoCuenta"));
  document.getElementById("gastoProveedor").innerHTML =
    `<option value="">Sin proveedor</option>` +
    proveedores.map((p) => `<option value="${p.id}">${p.nombre}</option>`).join("");

  form.categoria_id.value = gasto?.categoria_id ?? categoriasDisponibles[0]?.id ?? "";
  form.tipo.value = gasto?.tipo ?? categoriasDisponibles[0]?.tipo ?? "operativo";
  form.importe.value = gasto?.importe ?? "";
  form.cuenta_tesoreria_id.value = gasto?.cuenta_tesoreria_id ?? cuentasTesoreria[0]?.id ?? "";
  form.fecha.value = gasto?.fecha ?? hoyISO();
  form.descripcion.value = gasto?.descripcion ?? "";
  form.proveedor_id.value = gasto?.proveedor_id ?? "";
  form.comprobante.value = gasto?.comprobante ?? "";

  modalGasto.hidden = false;
}

// Elegir categoría arrastra su tipo: es lo que hace que no haya que
// acordarse de si el alquiler era operativo o no.
document.getElementById("gastoCategoria").addEventListener("change", (e) => {
  const categoria = categoriasGasto.find((c) => c.id === Number(e.target.value));
  if (categoria) document.getElementById("gastoTipo").value = categoria.tipo;
});

document.getElementById("btnNuevoGasto").addEventListener("click", () => abrirModalGasto());
document.getElementById("modalGastoClose").addEventListener("click", () => {
  modalGasto.hidden = true;
});
modalGasto.addEventListener("click", (e) => {
  if (e.target === modalGasto) modalGasto.hidden = true;
});

document.getElementById("formGasto").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const datos = {
    categoria_id: Number(form.categoria_id.value),
    cuenta_tesoreria_id: Number(form.cuenta_tesoreria_id.value),
    proveedor_id: form.proveedor_id.value ? Number(form.proveedor_id.value) : null,
    tipo: form.tipo.value,
    importe: parseFloat(form.importe.value),
    fecha: form.fecha.value,
    descripcion: form.descripcion.value || null,
    comprobante: form.comprobante.value || null
  };

  const res = await fetch(gastoEditandoId ? `/api/gastos/${gastoEditandoId}` : "/api/gastos", {
    method: gastoEditandoId ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos)
  });
  if (!(await manejarError(res, "No se pudo guardar el gasto."))) return;

  const eraEdicion = gastoEditandoId !== null;
  // Un gasto mueve plata y cambia el resultado: hay que refrescar las tres.
  await recargar("gastos", "caja", "panelResumen");
  form.reset();
  modalGasto.hidden = true;
  avisar(eraEdicion ? "Gasto actualizado." : "Gasto registrado.", "ok");
});

/* --- Modal de categorías --- */

const modalCategorias = document.getElementById("modalCategorias");

function renderCategorias() {
  const body = document.getElementById("categoriasBody");
  if (categoriasGasto.length === 0) {
    body.innerHTML = filaVacia(3, "Todavía no hay categorías.");
    return;
  }

  body.innerHTML = categoriasGasto
    .map(
      (c) => `
    <tr class="${c.activa ? "" : "fila-anulada"}">
      <td data-label="Categoría">${c.nombre}</td>
      <td data-label="Tipo"><span class="status ${TIPO_GASTO_CLASE[c.tipo]}">${
        TIPO_GASTO_LABEL[c.tipo]
      }</span></td>
      <td data-label="">${botonEditarFila("btn-editar-categoria", c.id, "categoría")}</td>
    </tr>`
    )
    .join("");

  body.querySelectorAll(".btn-editar-categoria").forEach((btn) => {
    btn.addEventListener("click", () => {
      const categoria = categoriasGasto.find((c) => c.id === Number(btn.dataset.id));
      const form = document.getElementById("formCategoria");
      form.id.value = categoria.id;
      form.nombre.value = categoria.nombre;
      form.tipo.value = categoria.tipo;
      document.getElementById("formCategoriaSubmit").textContent = "Guardar cambios";
    });
  });
}

document.getElementById("btnCategoriasGasto").addEventListener("click", () => {
  document.getElementById("formCategoria").reset();
  document.getElementById("formCategoria").id.value = "";
  document.getElementById("formCategoriaSubmit").textContent = "Agregar categoría";
  renderCategorias();
  modalCategorias.hidden = false;
});
document.getElementById("modalCategoriasClose").addEventListener("click", () => {
  modalCategorias.hidden = true;
});
modalCategorias.addEventListener("click", (e) => {
  if (e.target === modalCategorias) modalCategorias.hidden = true;
});

document.getElementById("formCategoria").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const editandoId = form.id.value;

  const res = await fetch(
    editandoId ? `/api/categorias-gasto/${editandoId}` : "/api/categorias-gasto",
    {
      method: editandoId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: form.nombre.value, tipo: form.tipo.value, activa: 1 })
    }
  );
  if (!(await manejarError(res, "No se pudo guardar la categoría."))) return;

  const eraEdicion = Boolean(editandoId);
  await cargarGastos();
  form.reset();
  form.id.value = "";
  document.getElementById("formCategoriaSubmit").textContent = "Agregar categoría";
  avisar(eraEdicion ? "Categoría actualizada." : "Categoría creada.", "ok");
});

// Lo recargan las demás operaciones con recargar("gastos").
registrar("cargar:gastos", cargarGastos);
