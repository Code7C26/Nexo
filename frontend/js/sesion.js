/**
 * sesion.js
 * -----------------------------------------------------------
 * El gate de arranque de Nexo. Se carga en vez de app.js
 * (index.html no tiene <script src="js/app.js"> — lo inyecta este
 * archivo, y recién cuando confirma que hay una sesión válida).
 *
 * Por qué existe: app.js no tiene init() ni DOMContentLoaded — toca el
 * DOM desde su primera línea y dispara varias olas de fetch() sin
 * ninguna guarda de sesión. Reescribirlo para que espere sería un
 * cambio grande y arriesgado sobre un archivo de miles de líneas. En
 * vez de eso, este archivo es el único que corre sin sesión, y app.js
 * se inyecta al DOM recién cuando GET /api/auth/estado confirma que
 * hay una — así es literalmente imposible que dispare un fetch sin
 * sesión, sin tocar una sola línea de su lógica de arranque.
 *
 * El pre-paint de index.html (data-sesion="cerrada") es solo cosmético,
 * para evitar el flash de la app antes de que este archivo confirme
 * con el servidor — la decisión real la toma siempre la cookie httpOnly
 * del lado del servidor, que este script ni puede leer.
 */

(() => {
  const pantalla = document.getElementById("sesionPantalla");
  const formLogin = document.getElementById("formLogin");
  const formBootstrap = document.getElementById("formBootstrap");
  const formCambioForzado = document.getElementById("formCambioForzado");

  let appInyectada = false;

  // ---------- Interceptor de fetch, instalado ANTES de inyectar app.js ----------
  // Las 78 lecturas de app.js hacen `await (await fetch(...)).json()` sin
  // chequear res.ok — con un 401 eso tira un TypeError al querer leer
  // datos de un cuerpo de error, y la pantalla queda a medias.
  // manejarError() en app.js solo cubre las escrituras. En vez de tocar
  // los 78 call sites para que hagan lo mismo 78 veces, se intercepta
  // fetch acá una sola vez: ante un 401 se apaga la sesión y se muestra
  // el login. Tiene que instalarse ANTES de inyectar app.js, porque su
  // boot dispara fetches inmediatamente al cargar.
  //
  // El 403 NO se intercepta acá: es específico de cada call site (un
  // empleado que no puede hacer algo) y las escrituras ya lo muestran
  // vía manejarError. El 401 en cambio tiene exactamente una respuesta
  // correcta en los 78 sitios — no hay ninguna decisión por call site
  // que se esté escondiendo al centralizarla acá.
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const res = await fetchOriginal(...args);
    if (res.status === 401) {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url ?? "";
      if (!url.includes("/api/auth/")) {
        cerrarSesionLocal();
        mostrarPantalla("login");
      }
    }
    return res;
  };

  function cerrarSesionLocal() {
    try {
      localStorage.removeItem("nexo.sesion");
    } catch {}
    document.documentElement.setAttribute("data-sesion", "cerrada");
    pantalla.hidden = false;
  }

  function mostrarPantalla(cual) {
    pantalla.hidden = false;
    formLogin.hidden = cual !== "login";
    formBootstrap.hidden = cual !== "bootstrap";
    formCambioForzado.hidden = cual !== "cambio";
  }

  function mostrarErrorEn(idParrafo, mensaje) {
    const p = document.getElementById(idParrafo);
    p.textContent = mensaje;
    p.hidden = false;
  }

  function ocultarErrorEn(idParrafo) {
    document.getElementById(idParrafo).hidden = true;
  }

  // arrancarApp() escribe estos datos en el pie de la sidebar para que
  // app.js (que todavía no cargó en este punto) los pueda leer del DOM
  // en vez de pedirlos de nuevo con un fetch propio.
  function escribirDatosUsuario(usuario) {
    document.documentElement.setAttribute("data-rol", usuario.rol);
    const nombreEl = document.querySelector("[data-usuario-nombre]");
    if (nombreEl) nombreEl.textContent = usuario.nombre;
    const rolEl = document.querySelector("[data-usuario-rol]");
    if (rolEl) rolEl.textContent = usuario.rol === "admin" ? "Administrador" : "Empleado";
  }

  function arrancarApp(usuario) {
    escribirDatosUsuario(usuario);
    document.documentElement.removeAttribute("data-sesion");
    pantalla.hidden = true;
    try {
      localStorage.setItem("nexo.sesion", "activa");
    } catch {}

    // Guarda de idempotencia: si el usuario cierra sesión y entra de
    // nuevo sin recargar la página (ver cerrarSesion() más abajo, que
    // por eso mismo hace location.reload() en vez de intentar volver acá
    // sin recargar), nunca se inyecta app.js dos veces — eso duplicaría
    // sus ~90 listeners, el MutationObserver de accesibilidad de
    // modales, y las olas de fetch del boot.
    if (appInyectada) return;
    appInyectada = true;

    const script = document.createElement("script");
    script.src = "js/app.js";
    document.body.appendChild(script);
  }

  // Expuesto para que el menú de perfil de app.js (que carga después)
  // pueda cerrar sesión sin que este archivo tenga que conocer nada de
  // app.js. Recargar la página es más simple y más seguro que intentar
  // desmontar app.js a mano: no hay que rastrear sus ~90 listeners para
  // sacarlos uno por uno.
  window.nexoCerrarSesion = async () => {
    try {
      await fetchOriginal("/api/auth/logout", { method: "POST" });
    } catch {}
    try {
      localStorage.removeItem("nexo.sesion");
    } catch {}
    location.reload();
  };

  formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    ocultarErrorEn("loginError");
    const usuario = document.getElementById("loginUsuario").value.trim();
    const password = document.getElementById("loginPassword").value;
    try {
      const res = await fetchOriginal("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, password })
      });
      const datos = await res.json();
      if (!res.ok) {
        mostrarErrorEn("loginError", datos.error || "No se pudo iniciar sesión.");
        return;
      }
      if (datos.usuario.debe_cambiar_password) {
        window.__usuarioPendienteCambio = datos.usuario;
        mostrarPantalla("cambio");
        return;
      }
      arrancarApp(datos.usuario);
    } catch {
      mostrarErrorEn("loginError", "No se pudo conectar con el servidor.");
    }
  });

  formBootstrap.addEventListener("submit", async (e) => {
    e.preventDefault();
    ocultarErrorEn("bootstrapError");
    const usuario = document.getElementById("bootstrapUsuario").value.trim();
    const nombre = document.getElementById("bootstrapNombre").value.trim();
    const password = document.getElementById("bootstrapPassword").value;
    try {
      const res = await fetchOriginal("/api/auth/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, nombre, password })
      });
      const datos = await res.json();
      if (!res.ok) {
        mostrarErrorEn("bootstrapError", datos.error || "No se pudo crear el administrador.");
        return;
      }
      arrancarApp(datos.usuario);
    } catch {
      mostrarErrorEn("bootstrapError", "No se pudo conectar con el servidor.");
    }
  });

  formCambioForzado.addEventListener("submit", async (e) => {
    e.preventDefault();
    ocultarErrorEn("cambioForzadoError");
    const actual = document.getElementById("cambioForzadoActual").value;
    const nueva = document.getElementById("cambioForzadoNueva").value;
    try {
      const res = await fetchOriginal("/api/auth/cambiar-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actual, nueva })
      });
      if (!res.ok) {
        const datos = await res.json();
        mostrarErrorEn("cambioForzadoError", datos.error || "No se pudo cambiar la contraseña.");
        return;
      }
      const usuario = window.__usuarioPendienteCambio;
      arrancarApp({ ...usuario, debe_cambiar_password: false });
    } catch {
      mostrarErrorEn("cambioForzadoError", "No se pudo conectar con el servidor.");
    }
  });

  // ---------- Flujo de arranque ----------
  (async () => {
    try {
      const res = await fetchOriginal("/api/auth/estado");
      const estado = await res.json();
      if (estado.requiere_bootstrap) {
        mostrarPantalla("bootstrap");
      } else if (!estado.autenticado) {
        cerrarSesionLocal();
        mostrarPantalla("login");
      } else if (estado.usuario.debe_cambiar_password) {
        window.__usuarioPendienteCambio = estado.usuario;
        mostrarPantalla("cambio");
      } else {
        arrancarApp(estado.usuario);
      }
    } catch {
      // Backend caído o inalcanzable: nunca dejar la pantalla en blanco.
      mostrarErrorEn("loginError", "No se pudo conectar con el servidor.");
      mostrarPantalla("login");
    }
  })();
})();
