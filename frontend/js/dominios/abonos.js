/**
 * dominios/abonos.js
 * Abonos (CLAUDE.md §29, hist. §79): el módulo `abonos`, un servicio que un
 * cliente paga cada tantos meses. Cualquier negocio lo puede prender y el de
 * servicios lo trae prendido.
 *
 * Pantallas sobre las rutas de server.js, sección "Abonos":
 * - Abonos (#/abonos): quién paga qué y cada cuánto, la próxima cuota y lo que
 *   se debe.
 * - La ficha de un abono: sus cuotas, cada una con su cobro, y (admin) editar,
 *   dar de baja o reactivar.
 * - El alta y la edición, en un modal (admin).
 *
 * Cada cuota es una venta: se cobra con el cobro de ventas de app.js
 * (cobrar:venta), que avisa con el evento "cobro-registrado" para repintar.
 */

import { badge, camposFicha, esAdmin, esc, fechaAR, hoyISO, money } from "../core/formato.js";
import { avisar, confirmar, filaVacia, tablaCargando } from "../core/ui.js";
import { api, refrescar } from "../core/api.js";
import { alEntrarEnVista, invocar, recargar, registrar } from "../core/registro.js";
import { mostrarVista } from "../core/router.js";

const FILTROS = {
  activos: (a) => a.estado === "activo",
  deben: (a) => a.deuda > 0,
  baja: (a) => a.estado === "baja",
  todos: () => true
};

let abonos = [];
let filtro = "activos";
let fichaAbono = null;
let editando = null;

const normalizar = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// Mismos colores que las cuotas de socios: verde lo pagado, gris lo que no se
// cobra, rojo lo vencido.
function badgeCuota(c) {
  if (c.estado === "pagada") return badge("status-cobrado", "Pagada").html;
  if (c.estado === "bonificada") return badge("", "Bonificada").html;
  if (c.estado === "sin_cargo") return badge("", "Sin cargo").html;
  if (c.estado === "parcial") return badge("status-pendiente", `Falta ${money(c.saldo)}`).html;
  return c.desde === hoyISO() ? badge("status-pendiente", "Vence hoy").html : badge("status-vencido", "Vencida").html;
}

function badgeAbono(a) {
  if (a.estado === "baja") return badge("", "De baja").html;
  return a.deuda > 0 ? badge("status-vencido", "Debe").html : badge("status-cobrado", "Al día").html;
}

async function cargarAbonos() {
  tablaCargando("abonosBody", 7);
  abonos = await api("/api/abonos");
  renderLista();
}

/* ---------- Lista (#/abonos) ---------- */

const abonosBuscar = document.getElementById("abonosBuscar");
const abonosFiltro = document.getElementById("abonosFiltro");

function renderLista() {
  const activos = abonos.filter((a) => a.estado === "activo");
  document.getElementById("abonosActivos").textContent = activos.length;
  // Lo que entra por mes: un abono trimestral suma un tercio.
  document.getElementById("abonosPorMes").textContent = money(activos.reduce((acc, a) => acc + a.precio / a.meses, 0));
  document.getElementById("abonosConDeuda").textContent = abonos.filter((a) => a.deuda > 0).length;
  document.getElementById("abonosDeuda").textContent = money(abonos.reduce((acc, a) => acc + a.deuda, 0));

  const body = document.getElementById("abonosBody");
  if (abonos.length === 0) {
    body.innerHTML = esAdmin()
      ? filaVacia(7, "Todavía no hay abonos. Cargá el primero: un servicio que un cliente te paga todos los meses.", {
          accionTexto: "+ Nuevo abono",
          accionId: "btnNuevoAbono"
        })
      : filaVacia(7, "Todavía no hay abonos.");
    return;
  }
  const consulta = normalizar(abonosBuscar.value.trim());
  const visibles = abonos.filter(
    (a) => FILTROS[filtro](a) && (!consulta || normalizar(`${a.cliente} ${a.servicio}`).includes(consulta))
  );
  if (visibles.length === 0) {
    body.innerHTML = filaVacia(7, consulta ? "Ningún abono con esa búsqueda." : "No hay abonos acá.");
    return;
  }
  body.innerHTML = visibles
    .map(
      (a) => `
    <tr class="fila-clickeable" data-id="${a.id}">
      <td data-label="Cliente"><span class="celda-principal">${esc(a.cliente)}</span></td>
      <td data-label="Servicio">${esc(a.servicio)}</td>
      <td data-label="Se cobra">${esc(a.duracion)}</td>
      <td data-label="Precio" class="align-right mono">${money(a.precio)}</td>
      <td data-label="Próxima cuota">${a.proxima ? esc(fechaAR(a.proxima)) : "—"}</td>
      <td data-label="Debe" class="align-right mono">${a.deuda > 0 ? money(a.deuda) : "—"}</td>
      <td data-label="Estado">${badgeAbono(a)}</td>
    </tr>`
    )
    .join("");
}

document.getElementById("abonosBody").addEventListener("click", (e) => {
  const fila = e.target.closest("tr[data-id]");
  if (fila) abrirFicha(Number(fila.dataset.id));
});
abonosBuscar.addEventListener("input", renderLista);
abonosFiltro.addEventListener("click", (e) => {
  const boton = e.target.closest(".segmento");
  if (!boton) return;
  filtro = boton.dataset.filtro;
  for (const b of abonosFiltro.querySelectorAll(".segmento")) b.setAttribute("aria-pressed", String(b === boton));
  renderLista();
});

/* ---------- Ficha ---------- */

function pintarFicha(a) {
  fichaAbono = a;
  document.getElementById("fichaAbonoTitulo").textContent = `${a.servicio} · ${a.cliente}`;
  document.getElementById("fichaAbonoDeuda").textContent = money(a.deuda);
  // Editar, dar de baja y reactivar son de admin: cambian lo que se cobra.
  document.getElementById("fichaAbonoAcciones").innerHTML = esAdmin()
    ? `<button type="button" class="btn btn-secundario" data-accion="editar">Editar</button>
       ${
         a.estado === "activo"
           ? '<button type="button" class="btn btn-secundario" data-accion="baja">Dar de baja</button>'
           : '<button type="button" class="btn btn-primary" data-accion="activo">Reactivar</button>'
       }`
    : "";
  document.getElementById("fichaAbonoDatos").innerHTML = camposFicha([
    ["Cliente", { html: `<button type="button" class="btn-link" data-accion="cliente">${esc(a.cliente)}</button>` }],
    ["Servicio", a.servicio],
    ["Precio", money(a.precio)],
    ["Se cobra", a.duracion],
    ["Desde", fechaAR(a.fecha_alta)],
    ["Próxima cuota", a.proxima ? fechaAR(a.proxima) : null],
    ["Estado", { html: badgeAbono(a) }],
    ["Notas", a.notas]
  ]);
  document.getElementById("fichaAbonoCuotas").innerHTML =
    a.cuotas.length === 0
      ? filaVacia(5, `La primera cuota se arma el ${esc(fechaAR(a.ciclo_desde))}.`)
      : a.cuotas
          .map(
            (c) => `
    <tr>
      <td data-label="Período">${esc(fechaAR(c.desde))} al ${esc(fechaAR(c.hasta))}</td>
      <td data-label="Importe" class="align-right mono">${money(c.importe)}</td>
      <td data-label="Cobrado" class="align-right mono">${money(c.cobrado)}</td>
      <td data-label="Estado">${badgeCuota(c)}</td>
      <td data-label="">${
        c.saldo > 0
          ? `<button type="button" class="btn btn-secundario" data-cobrar="${c.venta_id}">Cobrar</button>`
          : `<button type="button" class="btn-link" data-venta="${c.venta_id}">Venta #${c.venta_id}</button>`
      }</td>
    </tr>`
          )
          .join("");
}

async function abrirFicha(id) {
  pintarFicha(await api(`/api/abonos/${id}`, { error: "No se pudo cargar el abono." }));
  mostrarVista("abono-detalle", { titulo: fichaAbono.servicio });
}

async function cambiarEstado(estado, boton) {
  if (
    estado === "baja" &&
    !(await confirmar({
      cuerpo: "¿Dar de baja este abono? No se arman más cuotas; las que ya hay siguen en la cuenta del cliente.",
      aceptar: "Dar de baja",
      destructivo: true
    }))
  )
    return;
  boton.disabled = true;
  try {
    await api(`/api/abonos/${fichaAbono.id}`, { method: "PATCH", body: { estado }, error: "No se pudo cambiar el abono." });
  } finally {
    boton.disabled = false;
  }
  avisar(estado === "baja" ? "Abono dado de baja." : "Abono reactivado.", "ok");
  await refrescar([cargarAbonos(), recargar("ventas", "cuentasCorrientes")]);
  await abrirFicha(fichaAbono.id);
}

document.querySelector('[data-view="abono-detalle"]').addEventListener("click", async (e) => {
  const cobrar = e.target.closest("[data-cobrar]");
  const venta = e.target.closest("[data-venta]");
  const boton = e.target.closest("[data-accion]");
  if (!fichaAbono) return;
  if (cobrar) {
    // La cuota puede haberse armado recién al mirar: el cobro busca la venta
    // en la lista de ventas, que se pide antes.
    await recargar("ventas");
    invocar("cobrar:venta", Number(cobrar.dataset.cobrar));
  } else if (venta) invocar("abrirFicha:venta", Number(venta.dataset.venta));
  else if (boton?.dataset.accion === "editar") abrirModal(fichaAbono);
  else if (boton?.dataset.accion === "cliente") invocar("abrirFicha:cliente", fichaAbono.cliente_id);
  else if (boton) cambiarEstado(boton.dataset.accion, boton);
});
document.getElementById("btnVolverAbonos").addEventListener("click", () => mostrarVista("abonos"));

// Un cobro desde la ficha baja la deuda de su cuota.
document.addEventListener("cobro-registrado", async (e) => {
  if (!fichaAbono?.cuotas.some((c) => c.venta_id === e.detail.ventaId)) return;
  await refrescar([cargarAbonos()]);
  pintarFicha(await api(`/api/abonos/${fichaAbono.id}`));
});

/* ---------- Alta y edición (modal, admin) ---------- */

const modal = document.getElementById("modalAbono");
const form = document.getElementById("formAbono");
let servicios = [];

// Solo servicios activos: con stock, cada cuota sacaría mercadería.
async function poblarServicios() {
  servicios = (await api("/api/productos")).filter((p) => p.tipo === "servicio" && p.activo);
  form.producto_id.innerHTML =
    '<option value="">Elegí un servicio…</option>' +
    servicios.map((s) => `<option value="${s.id}">${esc(s.nombre)}</option>`).join("");
  document.getElementById("abonoSinServicios").hidden = servicios.length > 0;
}

async function abrirModal(abono = null) {
  editando = abono;
  form.reset();
  document.getElementById("modalAbonoTitulo").textContent = abono ? "Editar abono" : "Nuevo abono";
  // El cliente, el servicio y desde cuándo no cambian: para otro, otro abono.
  for (const id of ["abonoClienteCampo", "abonoServicioCampo", "abonoDesdeCampo"]) {
    document.getElementById(id).hidden = Boolean(abono);
  }
  document.getElementById("abonoSinServicios").hidden = true;
  form.cliente.required = !abono;
  form.producto_id.required = !abono;
  form.precio.value = abono?.precio ?? "";
  form.meses.value = abono?.meses ?? 1;
  form.fecha_alta.value = hoyISO();
  form.notas.value = abono?.notas ?? "";
  if (!abono) await poblarServicios();
  modal.hidden = false;
  (abono ? form.precio : form.cliente).focus();
}

// Elegir el servicio propone su precio de lista, si todavía no se escribió uno.
form.producto_id.addEventListener("change", () => {
  const servicio = servicios.find((s) => s.id === Number(form.producto_id.value));
  if (servicio && form.precio.value === "") form.precio.value = servicio.precio_venta || "";
});
document.getElementById("btnNuevoAbono").addEventListener("click", () => abrirModal());
document.getElementById("modalAbonoClose").addEventListener("click", () => {
  modal.hidden = true;
});
modal.addEventListener("click", (e) => {
  if (e.target === modal) modal.hidden = true;
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const cuerpo = { precio: Number(form.precio.value), meses: Number(form.meses.value), notas: form.notas.value };
  if (!editando) {
    cuerpo.cliente = form.cliente.value.trim();
    cuerpo.producto_id = Number(form.producto_id.value);
    cuerpo.fecha_alta = form.fecha_alta.value || null;
  }
  const boton = form.querySelector('[type="submit"]');
  boton.disabled = true;
  let id;
  try {
    ({ id } = await api(editando ? `/api/abonos/${editando.id}` : "/api/abonos", {
      method: editando ? "PATCH" : "POST",
      body: cuerpo,
      error: "No se pudo guardar el abono."
    }));
  } finally {
    boton.disabled = false;
  }
  modal.hidden = true;
  avisar(editando ? "Abono actualizado. El precio nuevo rige desde la cuota siguiente." : "Abono creado.", "ok");
  // El alta arma la primera cuota (una venta) y puede crear un cliente.
  await refrescar([cargarAbonos(), recargar("ventas", "clientes", "cuentasCorrientes")]);
  await abrirFicha(id);
});

alEntrarEnVista("abonos", cargarAbonos);
registrar("cargar:abonos", cargarAbonos);
