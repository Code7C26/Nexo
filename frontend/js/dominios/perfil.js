/**
 * dominios/perfil.js
 * Mi cuenta: la foto, el nombre, el mail (hist. §102), la contraseña, cerrar
 * sesión y dar de baja la cuenta. Es una página de Configuración
 * (#/configuracion/cuenta) para los dos roles, y la abre también el menú de la
 * cuenta del pie. WhatsApp tiene su página aparte (dominios/whatsapp.js).
 *
 * Como en Google, Notion o Shopify (hist. §225), Mi cuenta solo muestra los
 * datos, cada uno con "Cambiar": el nombre, el mail, la contraseña y la baja
 * son pantallas aparte (cuenta-nombre, cuenta-mail, cuenta-contrasena y
 * cuenta-baja), y al terminar se vuelve a Mi cuenta.
 */

import { api } from "../core/api.js";
import { esc } from "../core/formato.js";
import { icono } from "../core/iconos.js";
import { avisar } from "../core/ui.js";
import { alEntrarEnVista, registrar } from "../core/registro.js";
import { codigoCompleto, esperarParaReenviar, prepararCampoCodigo } from "../core/codigo.js";
import { achicarImagen } from "../core/marca.js";

// Nombre y rol los escribió sesion.js en el DOM al arrancar (ver
// data-usuario-nombre/data-usuario-rol en el pie de la sidebar): leerlos de
// ahí evita un fetch propio solo para mostrarlos.
const nombreActual = () => document.querySelector("[data-usuario-nombre]")?.textContent ?? "";

function pintarCuenta() {
  document.getElementById("perfilNombre").textContent = nombreActual() || "—";
  pintarMail();
}
registrar("pintar:cuenta", pintarCuenta);

// El error de cada pantalla va en la propia pantalla, no en un toast.
function mostrarError(id, texto) {
  const errorEl = document.getElementById(id);
  errorEl.textContent = texto;
  errorEl.hidden = !texto;
}

// Hecho el cambio, de vuelta a Mi cuenta con el aviso.
function volverAMiCuenta(aviso) {
  location.hash = "#/configuracion/cuenta";
  avisar(aviso, "ok");
}

// Cada pantalla arranca limpia: lo que quedó escrito no sigue al volver.
registrar("pintar:cuenta-nombre", () => {
  mostrarError("cambioNombreError", "");
  const input = document.getElementById("perfilNombreNuevo");
  input.value = nombreActual();
  input.focus();
});
registrar("pintar:cuenta-mail", () => {
  mostrarError("cambioMailError", "");
  // Un cambio de mail a medias no sigue abierto al volver a la página.
  pasoDelCodigo(null);
  pintarMail();
  document.getElementById("perfilEmailNuevo").focus();
});
registrar("pintar:cuenta-contrasena", () => {
  mostrarError("cambioPasswordError", "");
  document.getElementById("formCambioPassword").reset();
  document.getElementById("perfilPasswordActual").focus();
});
registrar("pintar:cuenta-baja", () => {
  mostrarError("bajaCuentaError", "");
  document.getElementById("formBajaCuenta").reset();
});

// El ojo de cada contraseña la muestra u oculta (como en la pantalla de entrada).
for (const boton of document.querySelectorAll('.config-pagina[data-seccion^="cuenta"] .campo-ver-clave')) {
  boton.addEventListener("click", () => {
    const input = boton.parentElement.querySelector("input");
    const ver = input.type === "password";
    input.type = ver ? "text" : "password";
    boton.setAttribute("aria-pressed", String(ver));
    boton.setAttribute("aria-label", ver ? "Ocultar contraseña" : "Mostrar contraseña");
    input.focus();
  });
}

/* ---------- Nombre (hist. §225) ---------- */

document.getElementById("formCambioNombre").addEventListener("submit", async (e) => {
  e.preventDefault();
  const boton = e.target.querySelector('button[type="submit"]');
  if (boton.disabled) return;
  const nombre = document.getElementById("perfilNombreNuevo").value.trim();
  if (!nombre) return mostrarError("cambioNombreError", "Escribí tu nombre.");
  mostrarError("cambioNombreError", "");
  boton.disabled = true;
  try {
    const { ok, datos } = await enviarEnLaPagina("PUT", "/api/auth/nombre", { nombre });
    if (!ok) return mostrarError("cambioNombreError", datos.error || "No se pudo cambiar el nombre.");
    // El nombre está en el pie del menú y en el menú de la cuenta.
    for (const el of document.querySelectorAll("[data-usuario-nombre]")) el.textContent = datos.nombre;
    volverAMiCuenta("Listo: cambiamos tu nombre.");
  } finally {
    boton.disabled = false;
  }
});

/* ---------- Foto de perfil (hist. §212) ---------- */

// Se guarda apenas se elige, como en cualquier app: no hay nada que revisar.
// Va también al círculo del pie del menú (que al arrancar pinta sesion.js).
const archivoFoto = document.getElementById("perfilArchivoFoto");
const botonSubirFoto = document.getElementById("perfilSubirFoto");
const botonSacarFoto = document.getElementById("perfilSacarFoto");

function pintarFoto(url) {
  document.getElementById("perfilFoto").innerHTML = url ? `<img src="${esc(url)}" alt="Tu foto" />` : icono("user");
  document.getElementById("btnPerfil").innerHTML = url ? `<img src="${esc(url)}" alt="" />` : icono("user");
  botonSubirFoto.textContent = url ? "Cambiar la foto" : "Subir foto";
  botonSacarFoto.hidden = !url;
}

async function guardarFoto(foto, boton) {
  boton.disabled = true;
  try {
    const r = await api("/api/auth/foto", { method: "PUT", body: { foto }, error: "No se pudo guardar la foto." });
    pintarFoto(r.foto);
    avisar(r.foto ? "Listo: ya tenés tu foto." : "Sacamos tu foto.", "ok");
  } finally {
    boton.disabled = false;
  }
}

botonSubirFoto.addEventListener("click", () => archivoFoto.click());
archivoFoto.addEventListener("change", async () => {
  const archivo = archivoFoto.files[0];
  archivoFoto.value = "";
  if (!archivo) return;
  let imagen;
  try {
    imagen = await achicarImagen(archivo, { lado: 256, cuadrada: true });
  } catch (e) {
    avisar(e.message, "error");
    return;
  }
  await guardarFoto({ tipo: imagen.tipo, datos: imagen.datos }, botonSubirFoto);
});
botonSacarFoto.addEventListener("click", () => guardarFoto(null, botonSacarFoto));

/* ---------- Mail de la cuenta (hist. §102) ---------- */

// El mail y si está confirmado salen del estado de la sesión: cambian desde
// otro lado (el enlace del mail se toca en otra pestaña o en el celular).
async function pintarMail() {
  const { usuario } = await api("/api/auth/estado");
  const estadoEl = document.getElementById("perfilEmailEstado");
  pintarFoto(usuario?.foto ?? null);
  document.getElementById("perfilEmail").textContent = usuario?.email ?? "—";
  document.getElementById("perfilEmailActual").textContent = usuario?.email ?? "—";
  estadoEl.hidden = !usuario?.email;
  estadoEl.textContent = usuario?.email_verificado ? "Confirmado" : "Sin confirmar";
  estadoEl.className = usuario?.email_verificado ? "status status-cobrado" : "status status-pendiente";
  document.getElementById("perfilEmailNota").hidden = !usuario?.email || usuario.email_verificado;
}

async function reenviarMail(boton) {
  boton.disabled = true;
  try {
    await api("/api/auth/email/reenviar", { method: "POST", error: "No se pudo mandar el enlace." });
    avisar("Te mandamos otro enlace. Vale el último que te llegó.", "ok");
  } finally {
    boton.disabled = false;
  }
}
document.getElementById("btnReenviarMail").addEventListener("click", (e) => reenviarMail(e.currentTarget));

// En el Resumen, a los dos roles, hasta que se toca el enlace: se puede
// trabajar igual, pero sin el mail confirmado no hay cómo recuperar la cuenta.
const avisoMailEl = document.getElementById("avisoMail");
alEntrarEnVista("dashboard", async () => {
  avisoMailEl.hidden = true;
  const { usuario } = await api("/api/auth/estado");
  if (!usuario?.email || usuario.email_verificado) return;
  avisoMailEl.innerHTML = `${icono("mail")}<p>Confirmá tu mail: te mandamos un enlace a <strong>${esc(usuario.email)}</strong>. Así podés recuperar tu cuenta si te olvidás la contraseña.</p>
    <button type="button" class="btn btn-secundario" data-reenviar-mail>Mandarlo de nuevo</button>
    <a class="btn-link" href="#/configuracion/cuenta-mail">Cambiar el mail</a>`;
  avisoMailEl.hidden = false;
});
avisoMailEl.addEventListener("click", (e) => {
  const boton = e.target.closest("[data-reenviar-mail]");
  if (boton) reenviarMail(boton);
});

// Cambiar el mail es en dos pasos dentro de la misma tarjeta (hist. §108): el
// mail nuevo con la contraseña, y el código que llega a ese mail. Hasta el
// código, la cuenta sigue con el de antes.
const formCambioMail = document.getElementById("formCambioMail");
const inputCodigo = document.getElementById("perfilCodigo");
const botonReenviarCodigo = document.getElementById("perfilReenviarCodigo");
let mailPendiente = null;
let cortarEspera = null;

function errorDelMail(texto) {
  const errorEl = document.getElementById("cambioMailError");
  errorEl.textContent = texto;
  errorEl.hidden = !texto;
}

// Como la contraseña: el error va en la propia página, no en un toast.
async function enviarEnLaPagina(metodo, url, cuerpo) {
  try {
    const res = await fetch(url, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo)
    });
    return { ok: res.ok, datos: await res.json().catch(() => ({})) };
  } catch {
    return { ok: false, datos: { error: "Sin conexión con el servidor. Revisá la red y volvé a intentar." } };
  }
}
const postEnLaPagina = (url, cuerpo) => enviarEnLaPagina("POST", url, cuerpo);

function pasoDelCodigo(email) {
  mailPendiente = email;
  document.getElementById("perfilMailCampos").hidden = !!email;
  document.getElementById("perfilCodigoBloque").hidden = !email;
  document.getElementById("perfilMailPie").textContent = email
    ? "Hasta que lo confirmes, seguís entrando con tu mail de ahora."
    : "Te mandamos un código al mail nuevo, y un aviso al de ahora.";
  document.getElementById("perfilMailEnviar").textContent = email ? "Confirmar" : "Seguir";
  if (!email) {
    cortarEspera?.();
    formCambioMail.reset();
    return;
  }
  const destacado = document.createElement("strong");
  destacado.textContent = email;
  document
    .getElementById("perfilCodigoTexto")
    .replaceChildren("Te mandamos un código de 6 números a ", destacado, ". Escribilo acá para confirmar el cambio.");
  inputCodigo.value = "";
  inputCodigo.focus();
}

// Pide el código para el mail y la contraseña del formulario. Devuelve el
// error, o null si salió.
async function pedirCodigo(email) {
  const { ok, datos } = await postEnLaPagina("/api/auth/email", { email, password: formCambioMail.perfilEmailPassword.value });
  if (!ok) return datos.error || "No se pudo mandar el código.";
  cortarEspera?.();
  cortarEspera = esperarParaReenviar(botonReenviarCodigo);
  return null;
}

formCambioMail.addEventListener("submit", async (e) => {
  e.preventDefault();
  const boton = document.getElementById("perfilMailEnviar");
  if (boton.disabled) return;
  errorDelMail("");
  boton.disabled = true;
  try {
    if (mailPendiente) {
      if (!codigoCompleto(inputCodigo)) return errorDelMail("Escribí los 6 números del código que te mandamos.");
      const { ok, datos } = await postEnLaPagina("/api/auth/email/confirmar", { codigo: inputCodigo.value });
      if (!ok) {
        errorDelMail(datos.error || "No se pudo confirmar el código.");
        return inputCodigo.focus();
      }
      pasoDelCodigo(null);
      volverAMiCuenta(`Listo: tu mail ahora es ${datos.usuario.email}.`);
      return;
    }
    const email = formCambioMail.perfilEmailNuevo.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return errorDelMail("Revisá el mail nuevo: tiene que ser como nombre@dominio.com.");
    if (!formCambioMail.perfilEmailPassword.value) return errorDelMail("Escribí tu contraseña para cambiar el mail.");
    const error = await pedirCodigo(email);
    if (error) return errorDelMail(error);
    pasoDelCodigo(email);
  } finally {
    boton.disabled = false;
  }
});

prepararCampoCodigo(inputCodigo, () => formCambioMail.requestSubmit());

botonReenviarCodigo.addEventListener("click", async () => {
  errorDelMail("");
  botonReenviarCodigo.disabled = true;
  const error = await pedirCodigo(mailPendiente);
  if (error) {
    botonReenviarCodigo.disabled = false;
    return errorDelMail(error);
  }
  inputCodigo.focus();
});

document.getElementById("perfilCancelarCodigo").addEventListener("click", () => {
  errorDelMail("");
  pasoDelCodigo(null);
});

/* ---------- Dar de baja la cuenta (hist. §109) ---------- */

// Si sale bien, la sesión ya no existe: se cierra como un logout, y el login
// dice qué pasó (sesion.js lee "nexo.avisoLogin").
const formBajaCuenta = document.getElementById("formBajaCuenta");
formBajaCuenta.addEventListener("submit", async (e) => {
  e.preventDefault();
  const boton = formBajaCuenta.querySelector('button[type="submit"]');
  const errorEl = document.getElementById("bajaCuentaError");
  const error = (texto) => {
    errorEl.textContent = texto;
    errorEl.hidden = !texto;
  };
  if (boton.disabled) return;
  error("");
  if (!formBajaCuenta.bajaCuentaPassword.value) return error("Escribí tu contraseña para confirmar.");
  boton.disabled = true;
  try {
    const { ok, datos } = await postEnLaPagina("/api/auth/baja-cuenta", { password: formBajaCuenta.bajaCuentaPassword.value });
    if (!ok) return error(datos.error || "No se pudo dar de baja la cuenta.");
    try {
      sessionStorage.setItem("nexo.avisoLogin", "Tu cuenta quedó dada de baja. Te mandamos un mail de confirmación.");
    } catch {}
    window.nexoCerrarSesion();
  } finally {
    boton.disabled = false;
  }
});

// La nueva se escribe dos veces, como en cualquier app: un error de tipeo
// dejaría a la persona sin poder entrar.
document.getElementById("formCambioPassword").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const boton = form.querySelector('button[type="submit"]');
  if (boton.disabled) return;
  const actual = form.perfilPasswordActual.value;
  const nueva = form.perfilPasswordNueva.value;
  if (!actual) return mostrarError("cambioPasswordError", "Escribí tu contraseña actual.");
  if (nueva.length < 8) return mostrarError("cambioPasswordError", "La contraseña nueva tiene que tener al menos 8 caracteres.");
  if (nueva !== form.perfilPasswordRepetida.value) return mostrarError("cambioPasswordError", "Las dos contraseñas nuevas no son iguales.");
  mostrarError("cambioPasswordError", "");
  boton.disabled = true;
  try {
    const { ok, datos } = await postEnLaPagina("/api/auth/cambiar-password", { actual, nueva });
    if (!ok) return mostrarError("cambioPasswordError", datos.error || "No se pudo cambiar la contraseña.");
    form.reset();
    volverAMiCuenta("Listo: cambiamos tu contraseña.");
  } finally {
    boton.disabled = false;
  }
});

document.getElementById("btnCerrarSesion").addEventListener("click", () => {
  // nexoCerrarSesion la expone sesion.js (que cargó antes que este
  // archivo): hace el POST de logout y recarga la página — más simple y
  // más seguro que intentar desmontar los listeners de este archivo a
  // mano.
  window.nexoCerrarSesion?.();
});
