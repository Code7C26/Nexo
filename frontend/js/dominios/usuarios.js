/**
 * dominios/usuarios.js
 * Usuarios (solo admin). Movido tal cual desde app.js (CLAUDE.md §31, Etapa B / F3).
 *
 * Desde hist. §104 a alguien se lo suma invitándolo por mail (página Invitar
 * de Configuración): ya no se crean cuentas con usuario y contraseña. Acá
 * quedan las pendientes, para reenviarlas o cancelarlas.
 */

import { avisar, confirmar, filaVacia, tablaCargando } from "../core/ui.js";
import { api, refrescar } from "../core/api.js";
import { celdaMovil, esc, fechaAR } from "../core/formato.js";
import { registrar } from "../core/registro.js";
import { mostrarVista } from "../core/router.js";
import { limpiarErrores, marcarError } from "../core/campos.js";

/* ---------- Usuarios (solo admin) ---------- */
// Calcada del ABM de Cuentas de tesorería (arriba, misma estructura:
// render + modal de alta/edición con listeners atados después del
// innerHTML, no delegación, misma convención del resto del archivo) y de
// Categorías (baja lógica en vez de DELETE).

let usuariosCache = [];

const ROL_LABEL = { admin: "Administrador", empleado: "Empleado" };
// Un rol no es bueno ni malo: los dos van en gris (en rojo, "Empleado" se
// leía como un problema). Lo mismo un usuario dado de baja, abajo.
const ROL_CLASE = { admin: "", empleado: "" };

// Se entra con el mail (hist. §102). Una cuenta de antes que todavía no
// entró a sumarlo se ve por su usuario: lo va a cargar al entrar.
function celdaMail(u) {
  if (!u.email) {
    return `<div class="celda-mail"><span class="mono">${esc(u.usuario)}</span><span class="status">Sin mail todavía</span></div>`;
  }
  const estado = u.email_verificado ? "" : '<span class="status status-pendiente">Sin confirmar</span>';
  return `<div class="celda-mail"><span>${esc(u.email)}</span>${estado}</div>`;
}

function renderUsuarios(lista) {
  const body = document.getElementById("usuariosBody");

  if (lista.length === 0) {
    body.innerHTML = filaVacia(7, "Todavía no hay otros usuarios cargados.");
    return;
  }

  body.innerHTML = lista
    .map((u) => {
      const acciones = [`<button type="button" class="btn-fila btn-editar-usuario" data-id="${u.id}">Editar</button>`];
      if (u.activo) {
        acciones.push(
          `<button type="button" class="btn-fila btn-resetear-usuario" data-id="${u.id}">Resetear contraseña</button>`,
          `<button type="button" class="btn-fila btn-baja-usuario" data-id="${u.id}">Dar de baja</button>`
        );
      } else {
        acciones.push(`<button type="button" class="btn-fila btn-reactivar-usuario" data-id="${u.id}">Reactivar</button>`);
      }
      return `
        <tr class="${u.activo ? "" : "fila-anulada"}">
          <td data-label="Mail">${celdaMail(u)}</td>
          <td data-label="Nombre">${esc(u.nombre)}</td>
          <td data-label="Rol"><span class="status ${ROL_CLASE[u.rol] || ""}">${esc(ROL_LABEL[u.rol] || u.rol)}</span></td>
          <td data-label="Estado"><span class="status ${u.activo ? "status-cobrado" : ""}">${
            u.activo ? "Activo" : "Dado de baja"
          }</span></td>
          <td data-label="Alta">${u.fecha_alta ? esc(fechaAR(u.fecha_alta)) : "—"}</td>
          <td data-label="Último acceso">${u.ultimo_acceso ? esc(fechaAR(u.ultimo_acceso)) : "—"}</td>
          <td data-label=""><div class="fila-acciones">${acciones.join("")}</div></td>
        </tr>`;
    })
    .join("");

  body.querySelectorAll(".btn-editar-usuario").forEach((btn) => {
    btn.addEventListener("click", () => {
      abrirModalUsuario(usuariosCache.find((u) => u.id === Number(btn.dataset.id)));
    });
  });
  body.querySelectorAll(".btn-baja-usuario").forEach((btn) => {
    btn.addEventListener("click", () => darDeBajaUsuario(Number(btn.dataset.id)));
  });
  body.querySelectorAll(".btn-reactivar-usuario").forEach((btn) => {
    btn.addEventListener("click", () => reactivarUsuario(Number(btn.dataset.id)));
  });
  body.querySelectorAll(".btn-resetear-usuario").forEach((btn) => {
    btn.addEventListener("click", () => resetearPasswordUsuario(Number(btn.dataset.id)));
  });
}

async function cargarUsuarios() {
  tablaCargando("usuariosBody", 7);
  // Este endpoint es solo admin: si por algún motivo lo llama un empleado,
  // api() avisa el 403 y corta acá, sin pintar un cuerpo de error como lista.
  const [usuarios, invitaciones] = await Promise.all([
    api("/api/usuarios", { error: "No se pudieron cargar los usuarios." }),
    api("/api/invitaciones", { error: "No se pudieron cargar las invitaciones." })
  ]);
  usuariosCache = usuarios;
  renderUsuarios(usuariosCache);
  renderInvitaciones(invitaciones);
}

/* --- Invitaciones sin responder (hist. §104) --- */

const ROL_INVITACION = { admin: "Administrador", empleado: "Empleado" };

// Vence a los 14 días de mandada (lo mismo calcula el backend). `enviada`
// viene en UTC, como la guarda SQLite.
function vencimiento(enviada) {
  const fecha = new Date(`${enviada.replace(" ", "T")}Z`);
  fecha.setDate(fecha.getDate() + 14);
  return fecha.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

function renderInvitaciones(lista) {
  document.getElementById("invitacionesPendientes").hidden = lista.length === 0;
  document.getElementById("invitacionesBody").innerHTML = lista
    .map((i) => {
      const vencida = i.estado === "vencida";
      const rol = ROL_INVITACION[i.rol] ?? i.rol;
      const estado = vencida
        ? '<span class="status status-pendiente">Venció</span>'
        : `<span class="status status-info">Vence el ${esc(vencimiento(i.enviada))}</span>`;
      return `
        <tr>
          <td data-label="Mail" class="m-titulo">${esc(i.email)}</td>
          <td data-label="Rol"><span class="status">${esc(rol)}</span></td>
          <td data-label="Estado" class="m-estado">${estado}</td>
          ${celdaMovil(rol, ["invitó", i.invito])}
          <td data-label=""><div class="fila-acciones">
            <button type="button" class="btn-fila" data-reenviar="${i.id}">${vencida ? "Mandar de nuevo" : "Reenviar"}</button>
            <button type="button" class="btn-fila" data-cancelar="${i.id}" data-email="${esc(i.email)}">Cancelar</button>
          </div></td>
        </tr>`;
    })
    .join("");
}

document.getElementById("invitacionesBody").addEventListener("click", async (e) => {
  const reenviar = e.target.closest("[data-reenviar]");
  const cancelar = e.target.closest("[data-cancelar]");
  if (reenviar) {
    reenviar.disabled = true;
    try {
      await api(`/api/invitaciones/${reenviar.dataset.reenviar}/reenviar`, { method: "POST", error: "No se pudo reenviar la invitación." });
    } finally {
      reenviar.disabled = false;
    }
    await refrescar([cargarUsuarios()]);
    avisar("Listo: le mandamos la invitación de nuevo, con un enlace nuevo.", "ok");
  } else if (cancelar) {
    const ok = await confirmar({
      titulo: "Cancelar la invitación",
      cuerpo: `El enlace que le llegó a ${cancelar.dataset.email} deja de servir. Si después querés sumarla, la invitás de nuevo.`,
      aceptar: "Cancelar invitación",
      destructivo: true
    });
    if (!ok) return;
    await api(`/api/invitaciones/${cancelar.dataset.cancelar}/cancelar`, { method: "POST", error: "No se pudo cancelar la invitación." });
    await refrescar([cargarUsuarios()]);
    avisar("Invitación cancelada.", "ok");
  }
});

/* --- Página Invitar --- */

const formInvitar = document.getElementById("formInvitar");
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const invitarError = document.getElementById("invitarError");

function pintarInvitar() {
  formInvitar.reset();
  limpiarErrores(formInvitar);
  invitarError.hidden = true;
}

function errorDeInvitar(texto, conPlan = false) {
  invitarError.textContent = texto;
  // Un tope del plan lleva a "Tu plan", donde se ve cómo sumar lugar.
  if (conPlan) {
    const enlace = document.createElement("a");
    enlace.className = "btn-link";
    enlace.href = "#/configuracion/plan";
    enlace.textContent = "Ver tu plan";
    invitarError.append(" ", enlace);
  }
  invitarError.hidden = false;
}

formInvitar.addEventListener("submit", async (e) => {
  e.preventDefault();
  limpiarErrores(formInvitar);
  invitarError.hidden = true;
  const emailEl = formInvitar.elements.email;
  const email = emailEl.value.trim();
  if (!EMAIL_VALIDO.test(email)) {
    marcarError(emailEl, "Revisá el mail: tiene que ser como nombre@mail.com.");
    emailEl.focus();
    return;
  }
  const boton = formInvitar.querySelector('button[type="submit"]');
  boton.disabled = true;
  // Como Mi cuenta: el error va en la propia página (un tope del plan, alguien
  // que ya trabaja acá), no en un toast que se va.
  let res;
  try {
    res = await fetch("/api/invitaciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, rol: formInvitar.elements.rol.value })
    });
  } catch {
    errorDeInvitar("Sin conexión con el servidor. Revisá la red y volvé a intentar.");
    return;
  } finally {
    boton.disabled = false;
  }
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    errorDeInvitar(datos.error || "No se pudo mandar la invitación.", datos.codigo === "limite_plan");
    return;
  }
  avisar(
    res.status === 200 ? `Ya estaba invitada: le mandamos el mail de nuevo a ${email}.` : `Listo: le mandamos la invitación a ${email}.`,
    "ok"
  );
  mostrarVista("configuracion", { subruta: "usuarios" });
});

/* --- Modal de edición de usuario --- */

const modalUsuario = document.getElementById("modalUsuario");
let usuarioEditandoId = null;

// Solo el nombre y el rol: el mail es de la persona (lo cambia ella en Mi
// cuenta), y la contraseña tiene su botón en la fila.
function abrirModalUsuario(usuario) {
  usuarioEditandoId = usuario.id;
  const form = document.getElementById("formUsuario");
  form.usuarioNombre.value = usuario.nombre ?? "";
  form.usuarioRol.value = usuario.rol ?? "empleado";
  modalUsuario.hidden = false;
}

document.getElementById("modalUsuarioClose").addEventListener("click", () => {
  modalUsuario.hidden = true;
});
modalUsuario.addEventListener("click", (e) => {
  if (e.target === modalUsuario) modalUsuario.hidden = true;
});

document.getElementById("formUsuario").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  await api(`/api/usuarios/${usuarioEditandoId}`, {
    method: "PATCH",
    body: { nombre: form.usuarioNombre.value, rol: form.usuarioRol.value },
    error: "No se pudo guardar el usuario."
  });

  await refrescar([cargarUsuarios()]);
  form.reset();
  modalUsuario.hidden = true;
  avisar("Usuario actualizado.", "ok");
});

async function darDeBajaUsuario(id) {
  const usuario = usuariosCache.find((u) => u.id === id);
  const ok = await confirmar({
    titulo: "Dar de baja usuario",
    cuerpo: `"${usuario?.nombre}" no va a poder ingresar a Nexo. Se va a cerrar su sesión en el acto si la tiene abierta.`,
    aceptar: "Dar de baja",
    destructivo: true
  });
  if (!ok) return;

  await api(`/api/usuarios/${id}`, {
    method: "PATCH",
    body: { activo: false },
    error: "No se pudo dar de baja al usuario."
  });

  await refrescar([cargarUsuarios()]);
  avisar("Usuario dado de baja.", "ok");
}

async function reactivarUsuario(id) {
  await api(`/api/usuarios/${id}`, {
    method: "PATCH",
    body: { activo: true },
    error: "No se pudo reactivar al usuario."
  });

  await refrescar([cargarUsuarios()]);
  avisar("Usuario reactivado.", "ok");
}

async function resetearPasswordUsuario(id) {
  const usuario = usuariosCache.find((u) => u.id === id);
  const nueva = prompt(`Nueva contraseña temporal para "${usuario?.nombre}" (mínimo 8 caracteres):`);
  if (!nueva) return;
  if (nueva.length < 8) {
    avisar("La contraseña tiene que tener al menos 8 caracteres.", "error");
    return;
  }

  await api(`/api/usuarios/${id}/resetear-password`, {
    method: "POST",
    body: { password: nueva },
    error: "No se pudo resetear la contraseña."
  });

  avisar(`Contraseña reseteada. Se le va a pedir que la cambie en su próximo ingreso.`, "ok");
}

// Es una página de Configuración (hist. §73): se carga al entrar en ella, con
// recargar("usuarios") desde dominios/configuracion.js.
registrar("cargar:usuarios", cargarUsuarios);
registrar("pintar:invitar", pintarInvitar);
