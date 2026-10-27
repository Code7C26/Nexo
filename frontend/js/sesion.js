/**
 * sesion.js
 * -----------------------------------------------------------
 * El gate de arranque de Nexo. Se carga en vez de app.js
 * (index.html no tiene <script src="js/app.js"> — lo inyecta este
 * archivo como módulo ES, y recién cuando confirma que hay una sesión
 * válida).
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
  // Explícitos: antes se leían como globales implícitas del navegador (cada
  // id del DOM es una propiedad de window), que se rompen sin aviso si otro
  // script declara una variable con el mismo nombre.
  const formCambioForzado = document.getElementById("formCambioForzado");
  const formSumarMail = document.getElementById("formSumarMail");

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
  //
  // También marca cada llamada a la API con el negocio que muestra esta
  // pestaña (hist. §77). La sesión es una sola por navegador: si en otra
  // pestaña se cambió de negocio, el backend frena a esta con un 409 en vez de
  // dejarla escribir en el negocio equivocado, y acá se recarga con un aviso.
  //
  // Y es donde se ve si una respuesta salió de lo guardado sin conexión (ver
  // "Sin conexión" más abajo).
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const url = typeof args[0] === "string" ? args[0] : args[0]?.url ?? "";
    const negocio = document.documentElement.dataset.organizacion;
    if (negocio && url.startsWith("/api/")) {
      const init = args[1] ?? {};
      args[1] = { ...init, headers: { ...init.headers, "X-Nexo-Negocio": negocio } };
    }
    let res;
    try {
      res = await fetchOriginal(...args);
    } catch (e) {
      if (url.startsWith("/api/")) mostrarSinConexion();
      throw e;
    }
    if (url.startsWith("/api/")) revisarConexion(res);
    if (res.status === 401) {
      if (!url.includes("/api/auth/")) {
        cerrarSesionLocal();
        mostrarPantalla("login");
      }
    }
    if (res.status === 409 && res.headers.get("X-Nexo-Negocio-Cambiado")) {
      try {
        sessionStorage.setItem("nexo.aviso", "Cambiaste de negocio en otra pestaña. Esta se actualizó para mostrar en el que estás.");
      } catch {}
      location.replace(location.pathname);
    }
    return res;
  };

  function cerrarSesionLocal() {
    try {
      localStorage.removeItem("nexo.sesion");
    } catch {}
    borrarDatosGuardados();
    document.documentElement.setAttribute("data-sesion", "cerrada");
    pantalla.hidden = false;
  }

  // ---------- PWA y sin conexión (CLAUDE.md §31, hist. §94) ----------
  // sw.js guarda una copia de lo que se cargó para poder abrir la app sin
  // conexión. Solo con HTTPS o en localhost: el navegador no registra un
  // service worker en otro caso, y la app sigue igual sin él.
  if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("No se pudo registrar el service worker.", e));
    });
  }

  // Lo guardado de la API es de quien lo cargó: se borra al entrar, al salir y
  // cuando vence la sesión, así otra persona en el mismo dispositivo nunca ve
  // datos ajenos sin conexión. El nombre es el de DATOS en sw.js.
  async function borrarDatosGuardados() {
    try {
      if (!("caches" in window)) return;
      const nombres = await caches.keys();
      await Promise.all(nombres.filter((n) => n.startsWith("nexo-datos-")).map((n) => caches.delete(n)));
    } catch {}
  }

  // El aviso de arriba. Sin conexión no se guarda nada (no hay escritura
  // diferida): el aviso lo dice antes de que alguien cargue una venta entera.
  const avisoConexion = document.getElementById("avisoConexion");
  // Una llamada que falla después no trae hora: se mantiene la última conocida.
  let ultimoGuardadoEn = 0;
  function mostrarSinConexion(guardadoEn) {
    if (guardadoEn) ultimoGuardadoEn = guardadoEn;
    let cuando = "lo último que se cargó";
    if (ultimoGuardadoEn) {
      const fecha = new Date(ultimoGuardadoEn);
      const hora = fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
      const esHoy = fecha.toDateString() === new Date().toDateString();
      cuando = esHoy
        ? `lo que se cargó a las ${hora}`
        : `lo que se cargó el ${fecha.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })} a las ${hora}`;
    }
    avisoConexion.textContent = `Sin conexión. Estás viendo ${cuando}; no se puede guardar nada hasta que vuelva.`;
    avisoConexion.hidden = false;
    document.documentElement.setAttribute("data-conexion", "no");
    // En el celular el aviso es fijo y la topbar baja lo que mide (styles.css).
    document.documentElement.style.setProperty("--aviso-conexion-h", `${avisoConexion.offsetHeight}px`);
  }
  function ocultarSinConexion() {
    ultimoGuardadoEn = 0;
    avisoConexion.hidden = true;
    document.documentElement.removeAttribute("data-conexion");
  }
  // Una respuesta guardada trae X-Nexo-Guardado-En (la pone sw.js); una que
  // llegó del servidor muestra que la conexión volvió.
  function revisarConexion(res) {
    const guardadoEn = Number(res.headers.get("X-Nexo-Guardado-En"));
    if (guardadoEn) mostrarSinConexion(guardadoEn);
    else if (navigator.onLine) ocultarSinConexion();
  }
  window.addEventListener("offline", () => mostrarSinConexion());
  window.addEventListener("online", ocultarSinConexion);

  // El navegador avisa que se puede instalar apenas carga la página, antes de
  // que exista app.js: se guarda el pedido para el botón "Instalar Nexo" de
  // Configuración → Apariencia (dominios/configuracion.js), que lo usa después.
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    window.nexoPedidoInstalar = e;
    document.dispatchEvent(new Event("nexo:instalable"));
  });
  window.addEventListener("appinstalled", () => {
    window.nexoPedidoInstalar = null;
    document.dispatchEvent(new Event("nexo:instalable"));
  });

  function mostrarPantalla(cual) {
    pantalla.hidden = false;
    formLogin.hidden = cual !== "login";
    formCambioForzado.hidden = cual !== "cambio";
    formSumarMail.hidden = cual !== "mail";
    if (cual === "mail") document.getElementById("sumarMailEmail").focus();
  }

  // Lo que falta antes de la app, en orden: la contraseña propia (cuando el
  // admin la reseteó) y el mail (hist. §102: una cuenta de antes de §102 lo
  // suma antes de operar; el backend tampoco la deja). Es el mismo camino
  // después del login, del arranque con sesión y de cada paso completado.
  let usuarioPendiente = null;
  function seguirCon(usuario) {
    usuarioPendiente = usuario;
    if (usuario.debe_cambiar_password) mostrarPantalla("cambio");
    else if (!usuario.email) mostrarPantalla("mail");
    else arrancarApp(usuario);
  }

  // El alta guiada (hist. §73) es un módulo aparte, js/alta.js, que se baja
  // recién cuando hace falta: quien entra con su cuenta nunca la carga. Si no
  // carga, se vuelve al login con el motivo, como con app.js.
  async function abrirAlta({ instalacionNueva = false } = {}) {
    pantalla.hidden = true;
    try {
      const { montarAlta } = await import("./alta.js");
      montarAlta({ instalacionNueva, alTerminar: arrancarApp, alVolver: () => mostrarPantalla("login") });
    } catch (e) {
      console.error("No se pudo cargar js/alta.js (o alguno de los módulos que importa).", e);
      mostrarPantalla("login");
      mostrarErrorEn("loginError", "No se pudo abrir el alta de cuenta. Recargá la página.");
    }
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
  // data-organizacion es el negocio de la sesión: separa por negocio lo que se
  // guarda en el navegador (filtros, la caja del punto de venta) y marca las
  // llamadas a la API (ver el interceptor de arriba).
  function escribirDatosUsuario(usuario) {
    document.documentElement.setAttribute("data-rol", usuario.rol);
    document.documentElement.setAttribute("data-organizacion", usuario.organizacion_id);
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

    // Nunca se inyecta app.js dos veces: eso duplicaría sus ~90 listeners,
    // el MutationObserver de accesibilidad de modales, y las olas de fetch
    // del boot. Cerrar sesión ya recarga la página (ver nexoCerrarSesion
    // más abajo); la única forma de llegar acá con la app cargada es volver
    // a entrar después de un 401, y ahí lo que tiene en memoria es de la
    // sesión anterior, que puede ser de otro usuario o de otro negocio
    // (hist. §77). Recargar arranca de cero con la sesión nueva.
    if (appInyectada) {
      location.reload();
      return;
    }
    appInyectada = true;
    // Después de un login lo guardado está vacío: sin esto, el próximo arranque
    // sin conexión no tendría el estado de la sesión y mostraría el login. Con
    // fetchOriginal, como el arranque, así la copia queda con la misma clave.
    fetchOriginal("/api/auth/estado").catch(() => {});

    // app.js es un módulo ES (CLAUDE.md §31): carga diferida, modo estricto y
    // su propio scope en vez del global. Inyectarlo con type="module" desde
    // acá (y no con un <script type="module"> estático en index.html) es lo
    // que conserva el gate: sin sesión ni siquiera se descarga.
    const script = document.createElement("script");
    script.type = "module";
    script.src = "/js/app.js";
    // Si falta o falla cualquier archivo del grafo de imports el navegador
    // descarta TODO el módulo y la pantalla quedaría en blanco sin una pista.
    // Se vuelve al login con el motivo, y la guarda de idempotencia se libera
    // para que un reintento pueda inyectarlo de nuevo.
    script.onerror = () => {
      console.error("No se pudo cargar js/app.js (o alguno de los módulos que importa).");
      script.remove();
      appInyectada = false;
      cerrarSesionLocal();
      mostrarPantalla("login");
      mostrarErrorEn("loginError", "No se pudo cargar la aplicación. Recargá la página.");
    };
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
    await borrarDatosGuardados();
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
        body: JSON.stringify({ email: usuario, password })
      });
      const datos = await res.json();
      if (!res.ok) {
        mostrarErrorEn("loginError", datos.error || "No se pudo iniciar sesión.");
        return;
      }
      // Lo guardado antes de este login puede ser de otra persona.
      await borrarDatosGuardados();
      seguirCon(datos.usuario);
    } catch {
      mostrarErrorEn("loginError", sinRedNiSesion());
    }
  });

  // Sin conexión y sin nada guardado (nunca se entró desde este dispositivo, o
  // se cerró la sesión) no hay qué mostrar.
  function sinRedNiSesion() {
    return navigator.onLine
      ? "No se pudo conectar con el servidor."
      : "Sin conexión. Para usar Nexo sin conexión, primero entrá una vez con conexión desde este dispositivo.";
  }

  // Entra al historial: el Atrás del navegador, desde el primer paso del
  // alta, vuelve al login.
  document.getElementById("irARegistro").addEventListener("click", () => {
    history.pushState(null, "", "#/crear-cuenta");
    abrirAlta();
  });

  // El ojo de cada contraseña la muestra u oculta.
  pantalla.querySelectorAll(".campo-ver-clave").forEach((boton) => {
    boton.addEventListener("click", () => {
      const input = boton.parentElement.querySelector("input");
      const ver = input.type === "password";
      input.type = ver ? "text" : "password";
      boton.setAttribute("aria-pressed", String(ver));
      boton.setAttribute("aria-label", ver ? "Ocultar contraseña" : "Mostrar contraseña");
      input.focus();
    });
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
      seguirCon({ ...usuarioPendiente, debe_cambiar_password: false });
    } catch {
      mostrarErrorEn("cambioForzadoError", "No se pudo conectar con el servidor.");
    }
  });

  formSumarMail.addEventListener("submit", async (e) => {
    e.preventDefault();
    ocultarErrorEn("sumarMailError");
    const email = document.getElementById("sumarMailEmail").value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      mostrarErrorEn("sumarMailError", "Revisá el mail: tiene que ser como nombre@dominio.com.");
      return;
    }
    const boton = formSumarMail.querySelector('button[type="submit"]');
    boton.disabled = true;
    try {
      const res = await fetchOriginal("/api/auth/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const datos = await res.json();
      if (!res.ok) {
        mostrarErrorEn("sumarMailError", datos.error || "No se pudo guardar el mail.");
        return;
      }
      guardarAviso(`Te mandamos un enlace a ${datos.usuario.email} para confirmarlo.`);
      seguirCon({ ...usuarioPendiente, ...datos.usuario });
    } catch {
      mostrarErrorEn("sumarMailError", "No se pudo conectar con el servidor.");
    } finally {
      boton.disabled = false;
    }
  });

  document.getElementById("sumarMailSalir").addEventListener("click", () => window.nexoCerrarSesion());

  // El toast que muestra la app al cargar (dominios/negocios.js). Con
  // "error:" adelante sale como error.
  function guardarAviso(texto) {
    try {
      sessionStorage.setItem("nexo.aviso", texto);
    } catch {}
  }

  // El enlace del mail de verificación vuelve a /app?mail=… (server.js,
  // /verificar-mail). Se lee una vez y se saca de la dirección, así recargar
  // no lo repite.
  const RESULTADO_MAIL = {
    verificado: "Listo: tu mail quedó confirmado.",
    invalido: "error:Ese enlace ya no sirve: venció o pediste uno más nuevo. Podés pedir otro desde Mi cuenta."
  };
  const resultadoMail = RESULTADO_MAIL[new URLSearchParams(location.search).get("mail")] ?? null;
  if (new URLSearchParams(location.search).has("mail")) {
    const url = new URL(location.href);
    url.searchParams.delete("mail");
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
  }

  // ---------- Flujo de arranque ----------
  (async () => {
    try {
      const res = await fetchOriginal("/api/auth/estado");
      revisarConexion(res);
      const estado = await res.json();
      if (estado.requiere_bootstrap) {
        // Instalación nueva: no hay cuenta a la que volver, así que el alta
        // no ofrece "Ya tengo cuenta".
        abrirAlta({ instalacionNueva: true });
      } else if (!estado.autenticado) {
        cerrarSesionLocal();
        // #/crear-cuenta es el enlace para crear una cuenta (por ejemplo,
        // desde la página pública).
        if (location.hash.startsWith("#/crear-cuenta")) abrirAlta();
        else mostrarPantalla("login");
        // Tocó el enlace del mail desde un dispositivo sin sesión.
        if (resultadoMail) {
          const aviso = document.getElementById("loginAviso");
          aviso.textContent = resultadoMail.startsWith("error:")
            ? resultadoMail.slice(6)
            : "Tu mail quedó confirmado. Entrá con él.";
          aviso.classList.toggle("is-error", resultadoMail.startsWith("error:"));
          aviso.hidden = false;
        }
      } else {
        if (resultadoMail) guardarAviso(resultadoMail);
        seguirCon(estado.usuario);
      }
    } catch {
      // Backend caído o inalcanzable: nunca dejar la pantalla en blanco.
      mostrarErrorEn("loginError", sinRedNiSesion());
      mostrarPantalla("login");
    }
  })();
})();
