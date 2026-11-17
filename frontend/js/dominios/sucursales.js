/**
 * dominios/sucursales.js
 * Configuración → Sucursales (hist. §193): cada local del negocio con su
 * depósito, sus cajas y la gente que trabaja ahí. El punto de venta
 * (dominios/pos.js) vende del depósito de la sucursal de la caja, y cada
 * persona con sucursales asignadas solo abre esas cajas. Es una pantalla
 * sobre /api/sucursales.
 */

import { api } from "../core/api.js";
import { avisar, confirmar, filaVacia, tablaCargando } from "../core/ui.js";
import { botonEditarFila, esc } from "../core/formato.js";
import { icono } from "../core/iconos.js";
import { registrar } from "../core/registro.js";

const form = document.getElementById("formSucursal");
const cuerpo = document.getElementById("sucursalesBody");
const boton = document.getElementById("formSucursalSubmit");
const contenedorCajas = document.getElementById("sucursalCajas");
const contenedorPersonas = document.getElementById("sucursalPersonas");

let sucursales = [];
let depositos = [];
let cajas = []; // las cuentas de efectivo, con la sucursal de cada una
let personas = [];

const lista = (nombres) => (nombres.length ? nombres.map(esc).join(", ") : "—");

async function pintar() {
  tablaCargando("sucursalesBody", 5);
  const [listaSucursales, listaDepositos, tesoreria, usuarios] = await Promise.all([
    api("/api/sucursales", { error: "No se pudieron cargar las sucursales." }),
    api("/api/depositos", { error: "No se pudieron cargar los depósitos." }),
    api("/api/tesoreria", { error: "No se pudieron cargar las cajas." }),
    api("/api/usuarios", { error: "No se pudo cargar el equipo." })
  ]);
  sucursales = listaSucursales;
  depositos = listaDepositos.filter((d) => d.activo);
  cajas = tesoreria.cuentas.filter((c) => c.tipo === "efectivo");
  personas = usuarios.filter((u) => u.activo);
  cuerpo.innerHTML = sucursales.length
    ? sucursales
        .map(
          (s) => `
    <tr>
      <td data-label="Sucursal" class="m-titulo">${esc(s.nombre)}${s.direccion ? `<span class="celda-meta">${esc(s.direccion)}</span>` : ""}</td>
      <td data-label="Depósito">${esc(s.deposito)}</td>
      <td data-label="Cajas">${lista(s.cajas.map((c) => c.nombre))}</td>
      <td data-label="Quiénes trabajan">${s.personas.length ? lista(s.personas.map((p) => p.nombre)) : "Todos"}</td>
      <td data-label="" class="etapa-acciones">
        ${botonEditarFila("btn-editar-sucursal", s.id, "sucursal")}
        <button type="button" class="btn-icon btn-icon-danger" data-borrar="${s.id}" title="Borrar" aria-label="Borrar ${esc(s.nombre)}">${icono("trash-2")}</button>
      </td>
    </tr>`
        )
        .join("")
    : filaVacia(5, "Todavía no armaste sucursales: con un solo local no hace falta. Sumá la primera abajo cuando abras otro.");
  editar(null);
}

/* ---------- Formulario ---------- */

// El depósito: los que no son de otra sucursal, o uno nuevo. La primera
// sucursal arranca con el principal, que es donde ya está la mercadería.
function poblarDepositos(sucursal) {
  const ocupados = new Set(sucursales.filter((s) => s.id !== sucursal?.id).map((s) => s.deposito_id));
  const libres = depositos.filter((d) => !ocupados.has(d.id));
  form.deposito_id.innerHTML = [
    ...libres.map((d) => `<option value="${d.id}">${esc(d.nombre)}${d.es_predeterminado ? " (el principal)" : ""}</option>`),
    `<option value="">Uno nuevo, con el nombre de la sucursal</option>`
  ].join("");
  const primera = sucursales.length ? "" : String(libres.find((d) => d.es_predeterminado)?.id ?? "");
  form.deposito_id.value = sucursal ? String(sucursal.deposito_id) : primera;
}

// Las cajas de efectivo, marcadas las de esta sucursal. Las de otra sucursal
// también se pueden marcar: pasan a esta.
function poblarCajas(sucursal) {
  contenedorCajas.innerHTML = cajas.length
    ? cajas
        .map((c) => {
          const deOtra = c.sucursal_id && c.sucursal_id !== sucursal?.id ? ` <span class="celda-meta">hoy en ${esc(c.sucursal)}</span>` : "";
          const suya = c.sucursal_id && c.sucursal_id === sucursal?.id;
          return `<label class="form-check"><input type="checkbox" value="${c.id}" ${suya ? "checked" : ""} /> ${esc(c.nombre)}${deOtra}</label>`;
        })
        .join("")
    : `<p class="campo-ayuda">Todavía no tenés cajas de efectivo: creá una abajo.</p>`;
}

function poblarPersonas(sucursal) {
  const suyas = new Set((sucursal?.personas ?? []).map((p) => p.id));
  contenedorPersonas.innerHTML = personas
    .map(
      (p) =>
        `<label class="form-check"><input type="checkbox" value="${p.id}" ${suyas.has(p.id) ? "checked" : ""} /> ${esc(p.nombre)} <span class="celda-meta">${p.rol === "admin" ? "Administrador" : "Empleado"}</span></label>`
    )
    .join("");
}

const nombreCajaNueva = () => `Crear la caja "Caja ${form.nombre.value.trim() || "…"}"`;
form.nombre.addEventListener("input", () => {
  document.getElementById("sucursalCajaNuevaTexto").textContent = nombreCajaNueva();
});

function editar(sucursal) {
  form.reset();
  form.id.value = sucursal?.id ?? "";
  form.nombre.value = sucursal?.nombre ?? "";
  form.direccion.value = sucursal?.direccion ?? "";
  poblarDepositos(sucursal);
  poblarCajas(sucursal);
  poblarPersonas(sucursal);
  // Una sucursal nueva arranca con su caja, salvo la primera, que suele
  // quedarse con la que ya había.
  form.caja_nueva.checked = !sucursal && sucursales.length > 0;
  document.getElementById("sucursalCajaNuevaTexto").textContent = nombreCajaNueva();
  document.getElementById("sucursalFormTitulo").textContent = sucursal ? `Editar «${sucursal.nombre}»` : "Sumar una sucursal";
  boton.textContent = sucursal ? "Guardar cambios" : "Agregar sucursal";
  document.getElementById("btnSucursalCancelar").hidden = !sucursal;
  if (sucursal) {
    form.scrollIntoView({ behavior: "smooth", block: "nearest" });
    form.nombre.focus();
  }
}

document.getElementById("btnSucursalCancelar").addEventListener("click", () => editar(null));

const marcadas = (contenedor) => [...contenedor.querySelectorAll("input:checked")].map((i) => Number(i.value));

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = form.id.value;
  if (!form.nombre.value.trim()) {
    avisar("Ponele un nombre a la sucursal.", "atencion");
    form.nombre.focus();
    return;
  }
  const body = {
    nombre: form.nombre.value,
    direccion: form.direccion.value,
    deposito_id: form.deposito_id.value || null,
    cajas: marcadas(contenedorCajas),
    caja_nueva: form.caja_nueva.checked,
    personas: marcadas(contenedorPersonas)
  };
  boton.disabled = true;
  try {
    await api(id ? `/api/sucursales/${id}` : "/api/sucursales", {
      method: id ? "PATCH" : "POST",
      body,
      error: "No se pudo guardar la sucursal."
    });
  } finally {
    boton.disabled = false;
  }
  avisar(id ? "Sucursal actualizada." : "Sucursal agregada: sus cajas ya venden de su depósito.", "ok");
  await pintar();
});

/* ---------- Tabla ---------- */

cuerpo.addEventListener("click", async (e) => {
  const editarBtn = e.target.closest(".btn-editar-sucursal");
  const borrar = e.target.closest("[data-borrar]");
  if (editarBtn) {
    editar(sucursales.find((s) => s.id === Number(editarBtn.dataset.id)));
  } else if (borrar) {
    const sucursal = sucursales.find((s) => s.id === Number(borrar.dataset.borrar));
    if (
      !(await confirmar({
        titulo: "Borrar sucursal",
        cuerpo: `¿Borrar «${sucursal.nombre}»? Su depósito, su stock y sus cajas quedan como están, sin sucursal.`,
        aceptar: "Borrar",
        destructivo: true
      }))
    )
      return;
    await api(`/api/sucursales/${sucursal.id}`, { method: "DELETE", error: "No se pudo borrar la sucursal." });
    avisar(`«${sucursal.nombre}» borrada.`, "ok");
    await pintar();
  }
});

registrar("pintar:sucursales", pintar);
