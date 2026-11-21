/**
 * dominios/gastos.js
 * Gastos y sus categorías. Movido tal cual desde app.js (CLAUDE.md §31,
 * Etapa B / F5); lo único que cambia es que las recargas y el render de la
 * papelera, que viven en otros dominios, se piden por nombre.
 */

import { ICONO_TACHO, botonEditarFila, celdaMovil, esAdmin, esc, fechaAR, hoyISO, money } from "../core/formato.js";
import { avisar, confirmar, filaVacia, filaVaciaFiltrada, tablaCargando } from "../core/ui.js";
import { api, refrescar } from "../core/api.js";
import { crearFiltros } from "../core/filtros.js";
import { descargarCSV } from "../core/csv.js";
import { cuentasTesoreria, poblarSelectCuentas, proveedores } from "../core/maestros.js";
import { invocar, recargar, registrar } from "../core/registro.js";
import { mostrarVista } from "../core/router.js";
import { formatear, t } from "../core/idioma.js";

/* ---------- Gastos ---------- */

// Los gastos son lo que le falta al sistema para saber si el negocio gana
// plata: las ventas y su costo ya estaban, pero el alquiler y la luz no.
// El tipo de cada gasto decide si pesa o no en el resultado (ver
// schema.sql): los tres bajan la caja, solo el operativo baja el resultado.
// `gastos` y `categoriasGasto` los leen Resumen (últimos movimientos), la
// Papelera y el asistente, por eso se exportan.
export let gastos = [];
export let categoriasGasto = [];
// Los gastos fijos (hist. §214): el alquiler o la luz, que se repiten.
let gastosFijos = [];
// Qué está haciendo el formulario: un gasto (nuevo o el que se edita), un
// gasto fijo que se edita, o una vez de un gasto fijo que quedó para cargar.
let enFormulario = { tipo: "gasto", id: null };

const TIPO_GASTO_LABEL = { operativo: "Operativo", inversion: "Inversión", retiro: "Retiro" };
// Rojo solo el que baja el resultado (como la cifra de gastos operativos);
// inversión y retiro, que quedan fuera del resultado, van en gris.
const TIPO_GASTO_CLASE = {
  operativo: "status-vencido",
  inversion: "",
  retiro: ""
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
      <td data-label="Fecha">${esc(fechaAR(g.fecha))}</td>
      <td data-label="Categoría" class="m-titulo">${esc(g.categoria)}</td>
      ${celdaMovil(fechaAR(g.fecha), g.descripcion, g.cuenta)}
      <td data-label="Tipo" class="m-estado"><span class="status ${TIPO_GASTO_CLASE[g.tipo]}">${
        TIPO_GASTO_LABEL[g.tipo]
      }</span></td>
      <td data-label="Descripción">${esc(g.descripcion || "—")}${
        g.gasto_fijo_id ? ` <span class="status" title="Sale de un gasto fijo">Fijo</span>` : ""
      }</td>
      <td data-label="Cuenta">${esc(g.cuenta)}</td>
      <td data-label="Importe" class="align-right mono m-valor">${money(g.importe)}</td>
      <td data-label="" class="m-accion"><div class="fila-acciones">
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
      const deUnFijo = gastos.find((g) => g.id === Number(btn.dataset.id))?.gasto_fijo_id;
      if (
        !(await confirmar({
          cuerpo: deUnFijo
            ? "¿Anular este gasto? Va a la papelera y la plata vuelve a la cuenta. Es de un gasto fijo: esta vez no se vuelve a anotar."
            : "¿Anular este gasto? Va a la papelera y la plata vuelve a la cuenta.",
          aceptar: "Anular gasto",
          destructivo: true
        }))
      )
        return;
      await api(`/api/gastos/${btn.dataset.id}/anular`, { method: "POST", error: "No se pudo anular el gasto." });
      avisar(`Gasto #${btn.dataset.id} anulado.`, "ok");
      await refrescar([recargar("gastos", "caja", "panelResumen")]);
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
  const [listaGastos, listaCategorias, listaFijos] = await Promise.all([
    api("/api/gastos"),
    api("/api/categorias-gasto"),
    api("/api/gastos-fijos")
  ]);
  gastos = listaGastos;
  categoriasGasto = listaCategorias;
  gastosFijos = listaFijos;
  renderFijos();

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

/* --- Gastos fijos (hist. §214) --- */

// "Todos los meses, el 5", "Cada 2 semanas, los lunes": cuándo toca, contado
// desde la primera vez.
const DIAS_PLURAL = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];
function cadaCuanto(f) {
  const dia = Number(f.desde.slice(8, 10));
  if (f.unidad === "semana") {
    const cuales = t(DIAS_PLURAL[new Date(`${f.desde}T12:00:00`).getDay()]);
    return f.cada === 1 ? formatear("Todas las semanas, los {0}", cuales) : formatear("Cada {0} semanas, los {1}", f.cada, cuales);
  }
  if (f.cada === 12) return formatear("Todos los años, el {0}", fechaAR(f.desde).slice(0, 5));
  return f.cada === 1 ? formatear("Todos los meses, el {0}", dia) : formatear("Cada {0} meses, el {1}", f.cada, dia);
}
const nombreFijo = (f) => f.descripcion || f.categoria;

function renderFijos() {
  const panel = document.getElementById("gastosFijosPanel");
  panel.hidden = gastosFijos.length === 0;
  if (gastosFijos.length === 0) return;

  // Arriba, lo que tocó y falta cargar, de lo más viejo a lo de hoy.
  const pendientes = gastosFijos
    .flatMap((f) => f.pendientes.map((periodo) => ({ f, periodo })))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));
  document.getElementById("gastosFijosParaCargar").hidden = pendientes.length === 0;
  document.getElementById("gastosFijosPendientes").innerHTML = pendientes
    .map(
      ({ f, periodo }) => `<li class="revisar-aviso">
        <svg class="ico" aria-hidden="true"><use href="/img/iconos.svg#bell"></use></svg>
        <span class="revisar-texto">
          <span class="revisar-frase">${esc(formatear("{0}: tocaba el {1}", nombreFijo(f), fechaAR(periodo)))}</span>
          <span class="revisar-detalle">${esc(formatear("La última vez fueron {0}, de {1}.", money(f.ultimo_importe), f.cuenta))}</span>
        </span>
        <span class="revisar-acciones">
          ${
            esAdmin()
              ? `<button type="button" class="btn btn-secundario btn-chico btn-saltear-fijo" data-id="${f.id}" data-periodo="${esc(periodo)}">Esta vez no</button>`
              : ""
          }
          <button type="button" class="btn btn-primary btn-chico btn-cargar-fijo" data-id="${f.id}" data-periodo="${esc(periodo)}">Cargar</button>
        </span>
      </li>`
    )
    .join("");

  document.getElementById("gastosFijosBody").innerHTML = gastosFijos
    .map(
      (f) => `
    <tr class="${f.estado === "activo" ? "" : "fila-anulada"}">
      <td data-label="Gasto" class="m-titulo">${esc(nombreFijo(f))}</td>
      ${celdaMovil(f.estado === "activo" && f.proxima ? formatear("Próxima: {0}", fechaAR(f.proxima)) : cadaCuanto(f))}
      <td data-label="Cada cuánto">${esc(cadaCuanto(f))}</td>
      <td data-label="Cómo">${f.modo === "solo" ? "Se anota solo" : "Te avisa"}</td>
      <td data-label="Próxima vez">${
        f.estado === "activo" ? esc(f.proxima ? fechaAR(f.proxima) : "—") : esc(formatear("Dado de baja el {0}", fechaAR(f.fecha_baja)))
      }</td>
      <td data-label="Importe" class="align-right mono m-valor">${money(f.importe)}</td>
      <td data-label="" class="m-accion"><div class="fila-acciones">${
        f.estado === "activo" && esAdmin()
          ? `${botonEditarFila("btn-editar-fijo", f.id, "gasto fijo")}
             <button type="button" class="btn-icon-danger btn-baja-fijo" data-id="${f.id}" title="Dar de baja" aria-label="Dar de baja">${ICONO_TACHO}</button>`
          : ""
      }</div></td>
    </tr>`
    )
    .join("");
}

const fijoDe = (id) => gastosFijos.find((f) => f.id === Number(id));

document.getElementById("gastosFijosPanel").addEventListener("click", async (e) => {
  const boton = e.target.closest("button[data-id]");
  if (!boton) return;
  const fijo = fijoDe(boton.dataset.id);
  if (!fijo) return;
  if (boton.classList.contains("btn-cargar-fijo")) {
    abrirModalGasto(null, { vez: { fijo, periodo: boton.dataset.periodo } });
  } else if (boton.classList.contains("btn-editar-fijo")) {
    abrirModalGasto(null, { fijo });
  } else if (boton.classList.contains("btn-saltear-fijo")) {
    if (
      !(await confirmar({
        cuerpo: formatear("¿No se paga {0} del {1}? Deja de aparecer para cargar.", nombreFijo(fijo), fechaAR(boton.dataset.periodo)),
        aceptar: "Esta vez no"
      }))
    )
      return;
    await api(`/api/gastos-fijos/${fijo.id}/saltear`, {
      method: "POST",
      body: { periodo: boton.dataset.periodo },
      error: "No se pudo saltear esa vez."
    });
    await refrescar([recargar("gastos", "panelResumen")]);
  } else if (boton.classList.contains("btn-baja-fijo")) {
    if (
      !(await confirmar({
        cuerpo: formatear("¿Dar de baja {0}? Desde hoy no se anota ni avisa más. Los gastos que ya se anotaron quedan como están.", nombreFijo(fijo)),
        aceptar: "Dar de baja",
        destructivo: true
      }))
    )
      return;
    await api(`/api/gastos-fijos/${fijo.id}/baja`, { method: "POST", error: "No se pudo dar de baja el gasto fijo." });
    avisar(formatear("{0} dado de baja.", nombreFijo(fijo)), "ok");
    await refrescar([recargar("gastos", "panelResumen")]);
  }
});

// Desde "Para revisar" del Resumen: ir a Gastos y cargar esa vez.
registrar("cargarVezGastoFijo", async (id, periodo) => {
  mostrarVista("gastos");
  await cargarGastos();
  const fijo = fijoDe(id);
  if (fijo?.pendientes.includes(periodo)) abrirModalGasto(null, { vez: { fijo, periodo } });
});

/* --- Modal de gasto --- */

const modalGasto = document.getElementById("modalGasto");
const formGasto = document.getElementById("formGasto");
const casillaRepite = document.getElementById("gastoRepite");

// Lo que se ve de "Se repite": la casilla solo en un gasto nuevo; las opciones,
// con la casilla marcada o al editar un gasto fijo (sin cada cuánto, que no se
// cambia). La fecha y el comprobante no son del gasto fijo.
function mostrarRepite() {
  const editandoFijo = enFormulario.tipo === "fijo";
  const nuevo = enFormulario.tipo === "gasto" && enFormulario.id === null;
  document.getElementById("gastoRepiteCampo").hidden = !nuevo;
  const repite = editandoFijo || (nuevo && casillaRepite.checked);
  document.getElementById("gastoRepiteOpciones").hidden = !repite;
  document.getElementById("gastoFrecuenciaCampo").hidden = editandoFijo;
  document.getElementById("gastoFechaCampo").hidden = editandoFijo;
  document.getElementById("gastoComprobanteCampo").hidden = editandoFijo;
  formGasto.fecha.required = !editandoFijo;
  document.getElementById("gastoFechaEtiqueta").textContent = repite && !editandoFijo ? t("La primera vez") : t("Fecha");

  const nota = document.getElementById("gastoRepiteNota");
  const hoy = hoyISO();
  const fecha = formGasto.fecha.value;
  const solo = formGasto.modo.value === "solo";
  nota.textContent = editandoFijo
    ? formatear("{0}. Para cambiar cada cuánto, dalo de baja y cargá uno nuevo. Lo que cambies acá vale para las próximas veces.", cadaCuanto(fijoDe(enFormulario.id)))
    : !fecha || fecha === hoy
      ? ""
      : fecha > hoy
        ? formatear("Todavía no se anota nada: la primera vez es el {0}.", fechaAR(fecha))
        : solo
          ? t("Como la primera vez ya pasó, se anotan también las veces que tocaron hasta hoy.")
          : t("Como la primera vez ya pasó, las veces que tocaron hasta hoy quedan para cargar.");
  nota.hidden = nota.textContent === "";
}
casillaRepite.addEventListener("change", mostrarRepite);
formGasto.fecha.addEventListener("change", mostrarRepite);
for (const radio of formGasto.querySelectorAll('input[name="modo"]')) radio.addEventListener("change", mostrarRepite);

// Un gasto común (nuevo o el que se edita), un gasto fijo que se edita
// ({ fijo }) o una vez de un gasto fijo que quedó para cargar ({ vez }).
function abrirModalGasto(gasto = null, { fijo = null, vez = null } = {}) {
  if (categoriasGasto.length === 0) {
    avisar("Primero creá una categoría de gasto desde el botón «Categorías».", "atencion");
    return;
  }
  enFormulario = fijo
    ? { tipo: "fijo", id: fijo.id }
    : vez
      ? { tipo: "vez", fijo: vez.fijo, periodo: vez.periodo }
      : { tipo: "gasto", id: gasto?.id ?? null };
  const base = fijo ?? vez?.fijo ?? gasto;
  document.getElementById("modalGastoTitulo").textContent = fijo
    ? t("Editar gasto fijo")
    : vez
      ? formatear("Cargar {0} del {1}", nombreFijo(vez.fijo), fechaAR(vez.periodo))
      : gasto
        ? t("Editar gasto")
        : t("Nuevo gasto");
  document.getElementById("formGastoSubmit").textContent = fijo || gasto ? t("Guardar cambios") : t("Registrar gasto");

  // Solo se ofrecen las categorías activas, salvo la del gasto que se está
  // editando: si se desactivó después, igual tiene que poder verse.
  const categoriasDisponibles = categoriasGasto.filter(
    (c) => c.activa || c.id === base?.categoria_id
  );
  document.getElementById("gastoCategoria").innerHTML = categoriasDisponibles
    .map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`)
    .join("");
  poblarSelectCuentas(document.getElementById("gastoCuenta"));
  document.getElementById("gastoProveedor").innerHTML =
    `<option value="">Sin proveedor</option>` +
    proveedores.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join("");

  const form = formGasto;
  form.categoria_id.value = base?.categoria_id ?? categoriasDisponibles[0]?.id ?? "";
  form.tipo.value = base?.tipo ?? categoriasDisponibles[0]?.tipo ?? "operativo";
  form.importe.value = (vez ? vez.fijo.ultimo_importe : base?.importe) ?? "";
  form.cuenta_tesoreria_id.value = base?.cuenta_tesoreria_id ?? cuentasTesoreria[0]?.id ?? "";
  form.fecha.value = gasto?.fecha ?? hoyISO();
  form.descripcion.value = base?.descripcion ?? "";
  form.proveedor_id.value = base?.proveedor_id ?? "";
  form.comprobante.value = gasto?.comprobante ?? "";
  casillaRepite.checked = false;
  form.frecuencia.value = "1-mes";
  form.modo.value = fijo?.modo ?? "solo";
  mostrarRepite();

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

formGasto.addEventListener("submit", async (e) => {
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

  const { tipo, id } = enFormulario;
  let aviso;
  if (tipo === "fijo") {
    await api(`/api/gastos-fijos/${id}`, {
      method: "PUT",
      body: { ...datos, modo: form.modo.value },
      error: "No se pudo guardar el gasto fijo."
    });
    aviso = t("Gasto fijo actualizado: vale para las próximas veces.");
  } else if (tipo === "vez") {
    await api("/api/gastos", {
      method: "POST",
      body: { ...datos, gasto_fijo_id: enFormulario.fijo.id, periodo: enFormulario.periodo },
      error: "No se pudo guardar el gasto."
    });
    aviso = t("Gasto registrado.");
  } else if (id === null && casillaRepite.checked) {
    const [cada, unidad] = form.frecuencia.value.split("-");
    const creado = await api("/api/gastos-fijos", {
      method: "POST",
      body: { ...datos, cada: Number(cada), unidad, modo: form.modo.value },
      error: "No se pudo guardar el gasto fijo."
    });
    aviso =
      creado.anotados > 1
        ? formatear("Gasto fijo creado: se anotaron {0} gastos, desde el {1}.", creado.anotados, fechaAR(creado.desde))
        : creado.proxima
          ? formatear("Gasto fijo creado. La próxima vez es el {0}.", fechaAR(creado.proxima))
          : t("Gasto fijo creado.");
  } else {
    await api(id ? `/api/gastos/${id}` : "/api/gastos", {
      method: id ? "PUT" : "POST",
      body: datos,
      error: "No se pudo guardar el gasto."
    });
    aviso = id ? t("Gasto actualizado.") : t("Gasto registrado.");
  }

  // Un gasto mueve plata y cambia el resultado: hay que refrescar las tres.
  await refrescar([recargar("gastos", "caja", "panelResumen")]);
  form.reset();
  modalGasto.hidden = true;
  avisar(aviso, "ok");
});

/* --- Categorías de gasto (página de Configuración, hist. §73) --- */

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
      <td data-label="Categoría">${esc(c.nombre)}</td>
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
      form.nombre.focus();
    });
  });
}

registrar("pintar:categorias-gastos", () => {
  document.getElementById("formCategoria").reset();
  document.getElementById("formCategoria").id.value = "";
  document.getElementById("formCategoriaSubmit").textContent = "Agregar categoría";
  renderCategorias();
});
document.getElementById("btnCategoriasGasto").addEventListener("click", () => {
  mostrarVista("configuracion", { subruta: "categorias-gastos" });
});

document.getElementById("formCategoria").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const editandoId = form.id.value;

  await api(editandoId ? `/api/categorias-gasto/${editandoId}` : "/api/categorias-gasto", {
    method: editandoId ? "PATCH" : "POST",
    body: { nombre: form.nombre.value, tipo: form.tipo.value, activa: 1 },
    error: "No se pudo guardar la categoría."
  });

  const eraEdicion = Boolean(editandoId);
  await refrescar([cargarGastos()]);
  form.reset();
  form.id.value = "";
  document.getElementById("formCategoriaSubmit").textContent = "Agregar categoría";
  avisar(eraEdicion ? "Categoría actualizada." : "Categoría creada.", "ok");
});

// Lo recargan las demás operaciones con recargar("gastos").
registrar("cargar:gastos", cargarGastos);
