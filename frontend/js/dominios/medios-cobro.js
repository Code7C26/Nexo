/**
 * dominios/medios-cobro.js
 * Configuración → Medios de cobro (hist. §171): cómo pagan los clientes en el
 * mostrador y a qué cuenta de tesorería entra la plata de cada forma de pago.
 * El punto de venta (dominios/pos.js) ofrece estos medios y no las cuentas;
 * cada uno lleva su comisión, los días que tarda en acreditarse y, en el
 * crédito, los planes de cuotas. Es una pantalla sobre /api/medios-cobro.
 */

import { api } from "../core/api.js";
import { avisar, confirmar, filaVacia, tablaCargando } from "../core/ui.js";
import { botonEditarFila, esc } from "../core/formato.js";
import { icono } from "../core/iconos.js";
import { registrar } from "../core/registro.js";

export const TIPO_MEDIO = {
  efectivo: "Efectivo",
  debito: "Débito",
  credito: "Crédito",
  transferencia: "Transferencia",
  billetera: "Billetera",
  otro: "Otro"
};

const form = document.getElementById("formMedioCobro");
const cuerpo = document.getElementById("mediosCobroBody");
const contenedorPlanes = document.getElementById("medioCobroPlanes");
const boton = document.getElementById("formMedioCobroSubmit");

let medios = [];
// Las cuentas donde puede entrar un medio: cualquiera menos la caja, que es
// del efectivo.
let cuentas = [];

const porcentaje = (n) => `${String(n).replace(".", ",")} %`;
const dias = (n) => (n > 0 ? `${n} ${n === 1 ? "día" : "días"}` : "Al instante");

function textoPlanes(medio) {
  if (!medio.planes.length) return "";
  const cuotas = medio.planes.map((p) => p.cuotas);
  return `${cuotas.length === 1 ? "Plan" : "Planes"}: ${cuotas.join(", ")} ${cuotas.length === 1 && cuotas[0] === 1 ? "pago" : "cuotas"}`;
}

async function pintar() {
  tablaCargando("mediosCobroBody", 5);
  [medios, cuentas] = await Promise.all([
    api("/api/medios-cobro", { error: "No se pudieron cargar los medios de cobro." }),
    api("/api/cuentas-tesoreria", { error: "No se pudieron cargar las cuentas." })
  ]);
  cuentas = cuentas.filter((c) => c.tipo !== "efectivo");
  cuerpo.innerHTML = medios.length
    ? medios
        .map(
          (m) => `
    <tr class="${m.activo ? "" : "fila-anulada"}">
      <td data-label="Medio" class="m-titulo">${esc(m.nombre)}<span class="celda-meta">${esc([TIPO_MEDIO[m.tipo], textoPlanes(m), m.activo ? "" : "Pausado"].filter(Boolean).join(" · "))}</span></td>
      <td data-label="Entra en">${esc(m.cuenta ?? "La caja del turno")}</td>
      <td data-label="Comisión" class="align-right mono">${m.comision_pct > 0 ? porcentaje(m.comision_pct) : "—"}</td>
      <td data-label="Se acredita" class="align-right">${esc(dias(m.dias_acreditacion))}</td>
      <td data-label="" class="etapa-acciones">
        ${botonEditarFila("btn-editar-medio", m.id, "medio de cobro")}
        <button type="button" class="btn btn-secundario btn-chico" data-pausar="${m.id}">${m.activo ? "Pausar" : "Activar"}</button>
        <button type="button" class="btn-icon btn-icon-danger" data-borrar="${m.id}" title="Borrar" aria-label="Borrar ${esc(m.nombre)}">${icono("trash-2")}</button>
      </td>
    </tr>`
        )
        .join("")
    : filaVacia(5, "Todavía no ofrecés ningún medio de cobro: sumá el primero abajo.");
  poblarCuentas();
}

function poblarCuentas(elegida = null) {
  const select = form.cuenta_tesoreria_id;
  select.innerHTML = cuentas.length
    ? cuentas.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join("")
    : `<option value="">No tenés cuentas: creá una en Caja</option>`;
  if (elegida) select.value = String(elegida);
}

/* ---------- Formulario ---------- */

function filaPlan(plan = {}) {
  const fila = document.createElement("div");
  fila.className = "form-fila medio-plan";
  fila.innerHTML = `
    <label>Cuotas
      <input type="number" class="plan-cuotas" min="1" max="60" step="1" inputmode="numeric" value="${esc(plan.cuotas ?? "")}" placeholder="3" />
    </label>
    <label>Me cuesta (%)
      <input type="number" class="plan-costo" min="0" max="100" step="0.01" inputmode="decimal" value="${esc(plan.costo_pct || "")}" placeholder="0" />
    </label>
    <button type="button" class="btn-icon plan-quitar" aria-label="Quitar este plan" title="Quitar este plan">×</button>`;
  return fila;
}

// Lo que cambia con el tipo: el efectivo no elige cuenta (va a la caja del
// turno) y el crédito tiene planes.
function ajustarSegunTipo() {
  const tipo = form.tipo.value;
  document.getElementById("medioCobroCuentaCampo").hidden = tipo === "efectivo";
  document.getElementById("medioCobroEfectivoAyuda").hidden = tipo !== "efectivo";
  document.getElementById("medioCobroPlanesCampo").hidden = tipo !== "credito";
}
form.tipo.addEventListener("change", () => {
  ajustarSegunTipo();
  // Un crédito nuevo arranca con un plan de una cuota, para no quedar sin nada.
  if (form.tipo.value === "credito" && !contenedorPlanes.children.length) contenedorPlanes.append(filaPlan({ cuotas: 1 }));
});

document.getElementById("btnMedioPlan").addEventListener("click", () => {
  contenedorPlanes.append(filaPlan());
  contenedorPlanes.lastElementChild.querySelector("input").focus();
});
contenedorPlanes.addEventListener("click", (e) => {
  e.target.closest(".plan-quitar")?.closest(".medio-plan").remove();
});

function editar(medio) {
  form.reset();
  form.id.value = medio?.id ?? "";
  form.nombre.value = medio?.nombre ?? "";
  form.tipo.value = medio?.tipo ?? "debito";
  poblarCuentas(medio?.cuenta_tesoreria_id);
  form.comision_pct.value = medio?.comision_pct ? medio.comision_pct : "";
  form.dias_acreditacion.value = medio?.dias_acreditacion ? medio.dias_acreditacion : "";
  contenedorPlanes.replaceChildren(...(medio?.planes ?? []).map(filaPlan));
  ajustarSegunTipo();
  document.getElementById("medioCobroFormTitulo").textContent = medio ? `Editar «${medio.nombre}»` : "Sumar un medio de cobro";
  boton.textContent = medio ? "Guardar cambios" : "Agregar medio";
  document.getElementById("btnMedioCobroCancelar").hidden = !medio;
  if (medio) {
    form.scrollIntoView({ behavior: "smooth", block: "nearest" });
    form.nombre.focus();
  }
}

document.getElementById("btnMedioCobroCancelar").addEventListener("click", () => editar(null));

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = form.id.value;
  const tipo = form.tipo.value;
  const planes = [...contenedorPlanes.querySelectorAll(".medio-plan")].map((fila) => ({
    cuotas: fila.querySelector(".plan-cuotas").value,
    costo_pct: fila.querySelector(".plan-costo").value
  }));
  const body = {
    nombre: form.nombre.value,
    tipo,
    cuenta_tesoreria_id: tipo === "efectivo" ? null : form.cuenta_tesoreria_id.value,
    comision_pct: form.comision_pct.value,
    dias_acreditacion: form.dias_acreditacion.value,
    planes: tipo === "credito" ? planes : []
  };
  boton.disabled = true;
  try {
    await api(id ? `/api/medios-cobro/${id}` : "/api/medios-cobro", {
      method: id ? "PUT" : "POST",
      body,
      error: "No se pudo guardar el medio de cobro."
    });
  } finally {
    boton.disabled = false;
  }
  avisar(id ? "Medio de cobro actualizado." : "Medio de cobro agregado: ya se ofrece en el punto de venta.", "ok");
  editar(null);
  await pintar();
});

/* ---------- Tabla ---------- */

cuerpo.addEventListener("click", async (e) => {
  const editarBtn = e.target.closest(".btn-editar-medio");
  const pausar = e.target.closest("[data-pausar]");
  const borrar = e.target.closest("[data-borrar]");
  if (editarBtn) {
    editar(medios.find((m) => m.id === Number(editarBtn.dataset.id)));
  } else if (pausar) {
    const medio = medios.find((m) => m.id === Number(pausar.dataset.pausar));
    await api(`/api/medios-cobro/${medio.id}`, { method: "PUT", body: { activo: !medio.activo }, error: "No se pudo cambiar el medio." });
    avisar(medio.activo ? `«${medio.nombre}» pausado: el punto de venta ya no lo ofrece.` : `«${medio.nombre}» activo.`, "ok");
    await pintar();
  } else if (borrar) {
    const medio = medios.find((m) => m.id === Number(borrar.dataset.borrar));
    if (
      !(await confirmar({
        titulo: "Borrar medio de cobro",
        cuerpo: `¿Borrar «${medio.nombre}»? Si ya cobró algo, no se puede: pausalo.`,
        aceptar: "Borrar",
        destructivo: true
      }))
    )
      return;
    await api(`/api/medios-cobro/${medio.id}`, { method: "DELETE", error: "No se pudo borrar el medio." });
    avisar(`«${medio.nombre}» borrado.`, "ok");
    await pintar();
  }
});

registrar("pintar:mediosCobro", pintar);
