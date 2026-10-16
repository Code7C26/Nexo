/**
 * dominios/usuarios.js
 * Usuarios (solo admin). Movido tal cual desde app.js (CLAUDE.md §31, Etapa B / F3).
 */

import { avisar, confirmar, filaVacia, tablaCargando } from "../core/ui.js";
import { api, refrescar } from "../core/api.js";
import { esc, fechaAR } from "../core/formato.js";
import { alEntrarEnVista } from "../core/registro.js";

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

function renderUsuarios(lista) {
  const body = document.getElementById("usuariosBody");

  if (lista.length === 0) {
    body.innerHTML = filaVacia(7, "Todavía no hay otros usuarios cargados.", {
      accionTexto: "+ Usuario",
      accionId: "btnNuevoUsuario"
    });
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
          <td data-label="Usuario" class="mono">${esc(u.usuario)}</td>
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
  usuariosCache = await api("/api/usuarios", { error: "No se pudieron cargar los usuarios." });
  renderUsuarios(usuariosCache);
}

/* --- Modal de usuario (alta y edición) --- */

const modalUsuario = document.getElementById("modalUsuario");
let usuarioEditandoId = null;

function abrirModalUsuario(usuario = null) {
  usuarioEditandoId = usuario?.id ?? null;
  const form = document.getElementById("formUsuario");
  document.getElementById("modalUsuarioTitulo").textContent = usuario ? "Editar usuario" : "Nuevo usuario";
  form.usuarioUsuario.value = usuario?.usuario ?? "";
  form.usuarioNombre.value = usuario?.nombre ?? "";
  form.usuarioRol.value = usuario?.rol ?? "empleado";
  form.usuarioPassword.value = "";
  // El usuario de login no se cambia en edición (es la clave con la que
  // inicia sesión); la contraseña tampoco se toca acá, para eso está el
  // botón "Resetear contraseña" en la fila.
  form.usuarioUsuario.disabled = !!usuario;
  document.getElementById("usuarioPasswordLabel").hidden = !!usuario;
  modalUsuario.hidden = false;
}

document.getElementById("btnNuevoUsuario").addEventListener("click", () => abrirModalUsuario());
document.getElementById("modalUsuarioClose").addEventListener("click", () => {
  modalUsuario.hidden = true;
});
modalUsuario.addEventListener("click", (e) => {
  if (e.target === modalUsuario) modalUsuario.hidden = true;
});

document.getElementById("formUsuario").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const eraEdicion = usuarioEditandoId !== null;

  await api(eraEdicion ? `/api/usuarios/${usuarioEditandoId}` : "/api/usuarios", {
    method: eraEdicion ? "PATCH" : "POST",
    body: eraEdicion
      ? { nombre: form.usuarioNombre.value, rol: form.usuarioRol.value }
      : {
          usuario: form.usuarioUsuario.value,
          nombre: form.usuarioNombre.value,
          password: form.usuarioPassword.value,
          rol: form.usuarioRol.value
        },
    error: "No se pudo guardar el usuario."
  });

  await refrescar([cargarUsuarios()]);
  form.reset();
  modalUsuario.hidden = true;
  avisar(eraEdicion ? "Usuario actualizado." : "Usuario creado.", "ok");
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

// Se carga al entrar en la vista (ver mostrarVista en core/router.js).
alEntrarEnVista("usuarios", cargarUsuarios);
