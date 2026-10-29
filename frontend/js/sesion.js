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
  const formSumarMailCodigo = document.getElementById("formSumarMailCodigo");
  const formTerminos = document.getElementById("formTerminos");
  const sinNegocio = document.getElementById("sinNegocio");
  const pantallaInvitacion = document.getElementById("invitacion");
  const formRecuperar = document.getElementById("formRecuperar");
  const recuperarEnviado = document.getElementById("recuperarEnviado");
  const formRestablecer = document.getElementById("formRestablecer");

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
    // Los términos cambiaron con la app abierta (etapa 8b, Fase 3): el backend
    // frena todo con 403 hasta aceptarlos. Recargar pasa por seguirCon, que
    // muestra la página para aceptarlos. Se mira una copia: el cuerpo sigue
    // entero para quien llamó.
    if (res.status === 403 && url.startsWith("/api/") && !url.startsWith("/api/auth/")) {
      const cuerpo = await res.clone().json().catch(() => null);
      if (cuerpo?.codigo === "faltan_terminos") location.reload();
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
    formSumarMailCodigo.hidden = cual !== "mail-codigo";
    formTerminos.hidden = cual !== "terminos";
    sinNegocio.hidden = cual !== "sin-negocio";
    pantallaInvitacion.hidden = cual !== "invitacion";
    formRecuperar.hidden = cual !== "recuperar";
    recuperarEnviado.hidden = cual !== "recuperar-enviado";
    formRestablecer.hidden = cual !== "restablecer";
    if (cual === "mail") document.getElementById("sumarMailEmail").focus();
    if (cual === "mail-codigo") document.getElementById("sumarMailCodigo").focus();
  }

  // Lo que falta antes de la app, en orden: la contraseña propia (cuando el
  // admin la reseteó), el mail (hist. §102: una cuenta de antes de §102 lo
  // suma antes de operar; el backend tampoco la deja) y los términos vigentes
  // (etapa 8b, Fase 3). Es el mismo camino después del login, del arranque con
  // sesión y de cada paso completado.
  //
  // Después, una invitación que quedó por aceptar (se entró desde su enlace,
  // hist. §104), y una cuenta sin ningún negocio va a su pantalla en vez de a
  // la app.
  let usuarioPendiente = null;
  function seguirCon(usuario) {
    usuarioPendiente = usuario;
    if (usuario.debe_cambiar_password) mostrarPantalla("cambio");
    else if (!usuario.email) mostrarPantalla("mail");
    else if (!usuario.terminos_al_dia) mostrarTerminos(usuario);
    else if (aceptarAlEntrar) aceptarYEntrar(usuario);
    else if (usuario.organizacion_id == null) mostrarSinNegocio(usuario);
    else arrancarApp(usuario);
  }

  // El alta guiada (hist. §73) es un módulo aparte, js/alta.js, que se baja
  // recién cuando hace falta: quien entra con su cuenta nunca la carga. Si no
  // carga, se vuelve al login con el motivo, como con app.js.
  //
  // Una cuenta sin negocio (hist. §104) la usa para crear el primero: el alta
  // sin el paso "Tu cuenta", como "Agregar negocio". La sesión pasa a él, y se
  // recarga para arrancar la app de cero.
  async function abrirAlta({ instalacionNueva = false, primerNegocio = false } = {}) {
    pantalla.hidden = true;
    try {
      const { montarAlta } = await import("./alta.js");
      montarAlta(
        primerNegocio
          ? {
              modo: "negocio",
              primero: true,
              alTerminar: (nuevo) => entrarALaApp(`Listo: ya estás en «${nuevo.nombre}».`),
              alVolver: () => mostrarPantalla("sin-negocio")
            }
          : { instalacionNueva, alTerminar: arrancarApp, alVolver: () => mostrarPantalla("login") }
      );
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
      const error = await mandarCodigoSumarMail(email);
      if (error) return mostrarErrorEn("sumarMailError", error);
      mostrarCodigoSumarMail(email);
    } finally {
      boton.disabled = false;
    }
  });

  document.getElementById("sumarMailSalir").addEventListener("click", () => window.nexoCerrarSesion());

  // El código que llegó al mail que se suma (hist. §108): recién con él el
  // mail queda en la cuenta. El campo lo arma core/codigo.js, que se baja
  // recién acá, como core/aceptacion.js.
  const inputCodigoSumarMail = document.getElementById("sumarMailCodigo");
  const botonReenviarSumarMail = document.getElementById("sumarMailReenviar");
  let mailPorSumar = null;
  let cortarEsperaSumarMail = null;
  let moduloCodigo = null;
  const codigoUi = () =>
    (moduloCodigo ??= import("./core/codigo.js").then((m) => {
      m.prepararCampoCodigo(inputCodigoSumarMail, () => formSumarMailCodigo.requestSubmit());
      return m;
    }));

  // Devuelve el error para mostrar, o null si el código salió.
  async function mandarCodigoSumarMail(email) {
    try {
      const { res, datos } = await postJson("/api/auth/email", { email });
      if (!res.ok) return datos.error || "No se pudo mandar el código.";
      mailPorSumar = email;
      inputCodigoSumarMail.value = "";
      const { esperarParaReenviar } = await codigoUi();
      cortarEsperaSumarMail?.();
      cortarEsperaSumarMail = esperarParaReenviar(botonReenviarSumarMail);
      return null;
    } catch {
      return "No se pudo conectar con el servidor.";
    }
  }

  function mostrarCodigoSumarMail(email) {
    const destacado = document.createElement("strong");
    destacado.textContent = email;
    document
      .getElementById("sumarMailCodigoTexto")
      .replaceChildren("Te mandamos un código de 6 números a ", destacado, ". Escribilo acá para confirmar que el mail es tuyo.");
    ocultarErrorEn("sumarMailCodigoError");
    mostrarPantalla("mail-codigo");
  }

  formSumarMailCodigo.addEventListener("submit", async (e) => {
    e.preventDefault();
    ocultarErrorEn("sumarMailCodigoError");
    const boton = formSumarMailCodigo.querySelector('button[type="submit"]');
    if (boton.disabled) return;
    if (!/^\d{6}$/.test(inputCodigoSumarMail.value)) {
      return mostrarErrorEn("sumarMailCodigoError", "Escribí los 6 números del código que te mandamos.");
    }
    boton.disabled = true;
    try {
      const { res, datos } = await postJson("/api/auth/email/confirmar", { codigo: inputCodigoSumarMail.value });
      if (!res.ok) {
        mostrarErrorEn("sumarMailCodigoError", datos.error || "No se pudo confirmar el código.");
        inputCodigoSumarMail.focus();
        return;
      }
      cortarEsperaSumarMail?.();
      guardarAviso(`Listo: tu mail ${datos.usuario.email} quedó confirmado.`);
      seguirCon({ ...usuarioPendiente, ...datos.usuario });
    } catch {
      mostrarErrorEn("sumarMailCodigoError", "No se pudo conectar con el servidor.");
    } finally {
      boton.disabled = false;
    }
  });

  botonReenviarSumarMail.addEventListener("click", async () => {
    ocultarErrorEn("sumarMailCodigoError");
    botonReenviarSumarMail.disabled = true;
    const error = await mandarCodigoSumarMail(mailPorSumar);
    if (error) {
      botonReenviarSumarMail.disabled = false;
      return mostrarErrorEn("sumarMailCodigoError", error);
    }
    inputCodigoSumarMail.focus();
  });

  document.getElementById("sumarMailCambiar").addEventListener("click", () => {
    ocultarErrorEn("sumarMailError");
    mostrarPantalla("mail");
  });

  // ---------- Términos y edad (etapa 8b, Fase 3) ----------

  // El bloque de la casilla y la edad lo maneja core/aceptacion.js, que se baja
  // recién acá (como alta.js): quien ya aceptó nunca lo carga.
  const aceptacion = () => import("./core/aceptacion.js");

  // Una cuenta de antes, o todas cuando cambian los términos. Con la edad ya
  // declarada, solo la casilla.
  async function mostrarTerminos(usuario) {
    const nueva = !usuario.edad;
    document.getElementById("terminosTitulo").textContent = nueva ? "Antes de seguir" : "Cambiaron los términos";
    document.getElementById("terminosTexto").textContent = nueva
      ? "Escribimos los términos y la política de privacidad de Nexo: qué datos guardamos, para qué, y qué podés pedirnos. Leelos y aceptalos para seguir usando Nexo."
      : "Actualizamos los términos o la política de privacidad de Nexo. Leelos y aceptalos para seguir usando Nexo.";
    ocultarErrorEn("terminosError");
    mostrarPantalla("terminos");
    try {
      (await aceptacion()).prepararAceptacion(formTerminos, { pedirEdad: nueva });
    } catch {
      mostrarErrorEn("terminosError", "No se pudo cargar la página. Recargá para probar de nuevo.");
    }
  }

  formTerminos.addEventListener("submit", async (e) => {
    e.preventDefault();
    ocultarErrorEn("terminosError");
    const boton = formTerminos.querySelector('button[type="submit"]');
    boton.disabled = true;
    try {
      const respuesta = (await aceptacion()).leerAceptacion(formTerminos);
      if (!respuesta) return;
      const { res, datos } = await postJson("/api/auth/terminos", respuesta);
      if (!res.ok) return mostrarErrorEn("terminosError", datos.error || "No se pudo guardar. Probá de nuevo.");
      seguirCon({ ...usuarioPendiente, ...datos.usuario });
    } catch {
      mostrarErrorEn("terminosError", "No se pudo conectar con el servidor.");
    } finally {
      boton.disabled = false;
    }
  });

  document.getElementById("terminosSalir").addEventListener("click", () => window.nexoCerrarSesion());

  // ---------- Invitaciones y cuentas sin negocio (hist. §104) ----------

  const ROL_TEXTO = { admin: "administrador", empleado: "empleado" };

  // El enlace del mail de una invitación: /app#/unirme/<token>.
  const tokenInvitacion = location.hash.match(/^#\/unirme\/([A-Za-z0-9_-]+)$/)?.[1] ?? null;
  // Quien ya tiene cuenta entra primero (y pasa sus pasos obligatorios), y
  // recién ahí se acepta: seguirCon lo mira.
  let aceptarAlEntrar = null;

  function sacarInvitacionDeLaDireccion() {
    if (location.hash.startsWith("#/unirme/")) history.replaceState(null, "", location.pathname + location.search);
  }

  async function postJson(url, cuerpo = {}) {
    const res = await fetchOriginal(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo)
    });
    return { res, datos: await res.json().catch(() => ({})) };
  }

  // Aceptar (o crear un negocio) deja la sesión en otro negocio: se arranca
  // de cero en la app, con el aviso, como al cambiar de negocio.
  function entrarALaApp(aviso) {
    guardarAviso(aviso);
    sacarInvitacionDeLaDireccion();
    location.replace(location.pathname);
  }

  async function aceptarYEntrar(usuario) {
    const token = aceptarAlEntrar;
    aceptarAlEntrar = null;
    try {
      const { res, datos } = await postJson("/api/auth/invitacion/aceptar", { token });
      if (res.ok) return entrarALaApp(`Listo: ya estás en «${datos.negocio}».`);
      guardarAviso(`error:${datos.error || "No se pudo aceptar la invitación."}`);
    } catch {
      guardarAviso("error:No se pudo aceptar la invitación. Probá de nuevo desde el enlace del mail.");
    }
    sacarInvitacionDeLaDireccion();
    seguirCon(usuario);
  }

  const mostrar = (id, visible) => (document.getElementById(id).hidden = !visible);

  function errorInvitacion(texto) {
    const p = document.getElementById("invitacionError");
    p.textContent = texto;
    p.hidden = !texto;
  }

  // La página del enlace. Sin sesión ofrece crear la cuenta o, si ese mail ya
  // tiene, ingresar; con sesión, aceptarla ahí. Una que ya no está vigente
  // dice por qué.
  async function mostrarInvitacion(usuario) {
    let info = null;
    try {
      const { res, datos } = await postJson("/api/auth/invitacion", { token: tokenInvitacion });
      if (res.ok) info = datos;
    } catch {
      mostrarPantalla("login");
      mostrarErrorEn("loginError", sinRedNiSesion());
      return;
    }
    const titulo = document.getElementById("invitacionTitulo");
    const texto = document.getElementById("invitacionTexto");
    for (const id of ["formInvitacionCuenta", "invitacionAceptar", "invitacionIngresar", "invitacionAhoraNo"]) mostrar(id, false);
    errorInvitacion("");
    const ingresar = document.getElementById("invitacionIngresar");
    ingresar.textContent = usuario ? "Ir a Nexo" : "Ingresar";
    delete ingresar.dataset.email;

    if (!info) {
      titulo.textContent = "Este enlace no sirve";
      texto.textContent =
        "Puede que esté incompleto o que ya te hayan mandado uno más nuevo. Pedile a quien te invitó que te lo mande de nuevo.";
      mostrar("invitacionIngresar", true);
    } else {
      titulo.textContent = `${info.invito} te invitó a ${info.negocio}`;
      const rol = ROL_TEXTO[info.rol] ?? info.rol;
      if (info.estado !== "pendiente") {
        texto.textContent = {
          vencida: `La invitación venció. Pedile a ${info.invito} que te la mande de nuevo desde Nexo.`,
          cancelada: `${info.invito} canceló esta invitación.`,
          aceptada: `Ya la aceptaste. Entrá con tu mail para trabajar en ${info.negocio}.`,
          rechazada: `La rechazaste. Si cambiaste de idea, pedile a ${info.invito} que te invite de nuevo.`
        }[info.estado];
        mostrar("invitacionIngresar", true);
      } else if (usuario) {
        texto.textContent =
          usuario.organizacion_id == null
            ? `Te suma a su equipo como ${rol}.`
            : `Te suma a su equipo como ${rol}. Tus otros negocios siguen igual: pasás de uno a otro desde arriba del menú.`;
        mostrar("invitacionAceptar", true);
        mostrar("invitacionAhoraNo", true);
      } else if (info.tiene_cuenta) {
        texto.textContent = `Te suma a su equipo como ${rol}. Ya tenés cuenta con ${info.email}: ingresá y la invitación se acepta sola.`;
        ingresar.dataset.email = info.email;
        mostrar("invitacionIngresar", true);
      } else {
        texto.textContent = `Te suma a su equipo como ${rol}. Creá tu cuenta para entrar: con ella vas a ingresar a Nexo.`;
        document.getElementById("invitacionEmail").value = info.email;
        mostrar("formInvitacionCuenta", true);
        aceptacion()
          .then((m) => m.prepararAceptacion(document.getElementById("formInvitacionCuenta")))
          .catch(() => {});
      }
    }
    mostrarPantalla("invitacion");
    if (!document.getElementById("formInvitacionCuenta").hidden) document.getElementById("invitacionNombre").focus();
  }

  document.getElementById("invitacionIngresar").addEventListener("click", (e) => {
    const email = e.currentTarget.dataset.email;
    if (usuarioPendiente) {
      sacarInvitacionDeLaDireccion();
      seguirCon(usuarioPendiente);
      return;
    }
    // Con una invitación vigente, se acepta al entrar.
    if (email) {
      aceptarAlEntrar = tokenInvitacion;
      document.getElementById("loginUsuario").value = email;
    } else {
      sacarInvitacionDeLaDireccion();
    }
    mostrarPantalla("login");
    document.getElementById(email ? "loginPassword" : "loginUsuario").focus();
  });

  // "Ahora no" sigue a la app. Si la invitación era para otro mail, el mismo
  // botón pasa a cerrar la sesión: cerrarla recarga con el enlace todavía en la
  // dirección, y se entra con ese mail.
  let paraOtroMail = false;
  document.getElementById("invitacionAhoraNo").addEventListener("click", () => {
    if (paraOtroMail) {
      window.nexoCerrarSesion();
      return;
    }
    sacarInvitacionDeLaDireccion();
    seguirCon(usuarioPendiente);
  });

  document.getElementById("invitacionAceptar").addEventListener("click", async (e) => {
    const boton = e.currentTarget;
    errorInvitacion("");
    boton.disabled = true;
    try {
      const { res, datos } = await postJson("/api/auth/invitacion/aceptar", { token: tokenInvitacion });
      if (res.ok) return entrarALaApp(`Listo: ya estás en «${datos.negocio}».`);
      errorInvitacion(datos.error || "No se pudo aceptar la invitación.");
      if (datos.codigo === "otro_mail") {
        paraOtroMail = true;
        boton.hidden = true;
        document.getElementById("invitacionAhoraNo").textContent = "Cerrar sesión y entrar con ese mail";
      }
    } catch {
      errorInvitacion("No se pudo conectar con el servidor.");
    } finally {
      boton.disabled = false;
    }
  });

  document.getElementById("formInvitacionCuenta").addEventListener("submit", async (e) => {
    e.preventDefault();
    errorInvitacion("");
    const nombre = document.getElementById("invitacionNombre").value.trim();
    const password = document.getElementById("invitacionPassword").value;
    if (!nombre) return errorInvitacion("Escribí tu nombre.");
    if (password.length < 8) return errorInvitacion("La contraseña tiene que tener al menos 8 caracteres.");
    const boton = e.target.querySelector('button[type="submit"]');
    boton.disabled = true;
    try {
      const respuesta = (await aceptacion()).leerAceptacion(e.target);
      if (!respuesta) return;
      const { res, datos } = await postJson("/api/auth/invitacion/cuenta", { token: tokenInvitacion, nombre, password, ...respuesta });
      if (res.status === 409) {
        // Ese mail ya tiene cuenta (la creó en otra pestaña): a ingresar.
        aceptarAlEntrar = tokenInvitacion;
        document.getElementById("loginUsuario").value = document.getElementById("invitacionEmail").value;
        mostrarPantalla("login");
        mostrarErrorEn("loginError", datos.error);
        return;
      }
      if (!res.ok) return errorInvitacion(datos.error || "No se pudo crear la cuenta.");
      await borrarDatosGuardados();
      sacarInvitacionDeLaDireccion();
      guardarAviso("Listo: ya estás en el equipo. Te damos la bienvenida a Nexo.");
      seguirCon(datos.usuario);
    } catch {
      errorInvitacion("No se pudo conectar con el servidor.");
    } finally {
      boton.disabled = false;
    }
  });

  // Sin ningún negocio: sus invitaciones (de su mail confirmado) y crear el
  // suyo. Armado con el DOM y textContent: este archivo no carga core/.
  async function mostrarSinNegocio(usuario) {
    mostrarPantalla("sin-negocio");
    ocultarErrorEn("sinNegocioError");
    const lista = document.getElementById("sinNegocioSolicitudes");
    const bajada = document.getElementById("sinNegocioBajada");
    let solicitudes = [];
    try {
      const res = await fetchOriginal("/api/auth/invitaciones");
      if (res.ok) solicitudes = await res.json();
    } catch {
      mostrarErrorEn("sinNegocioError", "No se pudo conectar con el servidor.");
    }
    lista.replaceChildren(
      ...solicitudes.map((s) => {
        const item = document.createElement("li");
        item.className = "solicitud";
        const textos = document.createElement("p");
        const negocio = document.createElement("strong");
        negocio.textContent = s.negocio;
        const detalle = document.createElement("span");
        detalle.textContent = `Te invitó ${s.invito}, como ${ROL_TEXTO[s.rol] ?? s.rol}`;
        textos.append(negocio, detalle);
        const boton = (clase, textoBoton, accion) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = clase;
          b.textContent = textoBoton;
          b.addEventListener("click", () => responder(s, accion, b));
          return b;
        };
        const acciones = document.createElement("div");
        acciones.className = "solicitud-acciones";
        acciones.append(boton("btn-link", "Rechazar", "rechazar"), boton("btn btn-primary", "Aceptar", "aceptar"));
        item.append(textos, acciones);
        return item;
      })
    );
    lista.hidden = solicitudes.length === 0;
    // Con invitaciones, la acción principal es aceptar: crear el propio queda
    // como la otra opción.
    const crear = document.getElementById("sinNegocioCrear");
    crear.classList.toggle("btn-primary", !solicitudes.length);
    crear.classList.toggle("btn-secundario", !!solicitudes.length);
    if (solicitudes.length) {
      bajada.textContent = "Te invitaron a estos negocios. Aceptá para empezar a trabajar, o creá el tuyo.";
    } else if (!usuario.email_verificado) {
      bajada.textContent = `Cuando alguien te invite, la invitación aparece acá una vez que confirmes tu mail: te mandamos un enlace a ${usuario.email}. Si tenés tu propio negocio, crealo.`;
    } else {
      bajada.textContent = "Si alguien te invita a su negocio, la invitación aparece acá. Si tenés tu propio negocio, crealo.";
    }
  }

  async function responder(solicitud, accion, boton) {
    ocultarErrorEn("sinNegocioError");
    boton.disabled = true;
    try {
      const { res, datos } = await postJson(`/api/auth/invitaciones/${solicitud.id}/${accion}`);
      if (!res.ok) {
        mostrarErrorEn("sinNegocioError", datos.error || "No se pudo responder la invitación.");
        return;
      }
      if (accion === "aceptar") return entrarALaApp(`Listo: ya estás en «${solicitud.negocio}».`);
      mostrarSinNegocio(usuarioPendiente);
    } catch {
      mostrarErrorEn("sinNegocioError", "No se pudo conectar con el servidor.");
    } finally {
      boton.disabled = false;
    }
  }

  // ---------- Recuperar la contraseña (hist. §105) ----------

  // El enlace del mail: /app#/restablecer/<token>.
  const tokenRestablecer = location.hash.match(/^#\/restablecer\/([A-Za-z0-9_-]+)$/)?.[1] ?? null;
  const MAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function volverAlLogin(email) {
    if (location.hash.startsWith("#/restablecer/")) history.replaceState(null, "", location.pathname + location.search);
    if (email) document.getElementById("loginUsuario").value = email;
    mostrarPantalla("login");
    document.getElementById(email ? "loginPassword" : "loginUsuario").focus();
  }

  // Lleva lo que ya escribió en el login, si es un mail: una cuenta de antes
  // de §102 pudo haber escrito su usuario.
  function abrirRecuperar() {
    ocultarErrorEn("recuperarError");
    const escrito = document.getElementById("loginUsuario").value.trim();
    const campo = document.getElementById("recuperarEmail");
    if (MAIL_VALIDO.test(escrito)) campo.value = escrito;
    mostrarPantalla("recuperar");
    campo.focus();
  }

  document.getElementById("irARecuperar").addEventListener("click", abrirRecuperar);
  document.getElementById("recuperarOtraVez").addEventListener("click", abrirRecuperar);
  document.getElementById("restablecerPedirOtro").addEventListener("click", () => {
    if (location.hash.startsWith("#/restablecer/")) history.replaceState(null, "", location.pathname + location.search);
    abrirRecuperar();
  });
  pantalla.querySelectorAll("[data-volver-login]").forEach((b) => b.addEventListener("click", () => volverAlLogin()));

  formRecuperar.addEventListener("submit", async (e) => {
    e.preventDefault();
    ocultarErrorEn("recuperarError");
    const email = document.getElementById("recuperarEmail").value.trim();
    if (!MAIL_VALIDO.test(email)) {
      mostrarErrorEn("recuperarError", "Revisá el mail: tiene que ser como nombre@dominio.com.");
      return;
    }
    const boton = formRecuperar.querySelector('button[type="submit"]');
    boton.disabled = true;
    try {
      const { res, datos } = await postJson("/api/auth/recuperar", { email });
      if (!res.ok) {
        mostrarErrorEn("recuperarError", datos.error || "No se pudo mandar el enlace.");
        return;
      }
      // El backend responde igual exista o no la cuenta: el texto también.
      document.getElementById("recuperarEnviadoTexto").textContent =
        `Si hay una cuenta de Nexo con ${email}, te llega un mail con un enlace para elegir una contraseña nueva. ` +
        "Vence en 30 minutos. Si no lo ves en unos minutos, buscalo en el spam.";
      mostrarPantalla("recuperar-enviado");
    } catch {
      mostrarErrorEn("recuperarError", sinRedNiSesion());
    } finally {
      boton.disabled = false;
    }
  });

  // Antes del formulario se pregunta si el enlace sirve, así quien toca uno
  // vencido no escribe la contraseña de gusto.
  async function mostrarRestablecer() {
    const campos = document.getElementById("restablecerCampos");
    ocultarErrorEn("restablecerError");
    let enlace = null;
    try {
      const { res, datos } = await postJson("/api/auth/restablecer/enlace", { token: tokenRestablecer });
      if (res.ok) enlace = datos;
    } catch {
      mostrarPantalla("login");
      mostrarErrorEn("loginError", sinRedNiSesion());
      return;
    }
    campos.hidden = !enlace;
    document.getElementById("restablecerPedirOtro").hidden = !!enlace;
    if (enlace) {
      document.getElementById("restablecerEmail").value = enlace.email;
    } else {
      document.getElementById("restablecerTitulo").textContent = "Este enlace ya no sirve";
      document.getElementById("restablecerTexto").textContent =
        "Venció (dura 30 minutos), ya se usó o pediste uno más nuevo. Pedí otro y usá el último que te llegue.";
    }
    mostrarPantalla("restablecer");
    if (enlace) document.getElementById("restablecerPassword").focus();
  }

  formRestablecer.addEventListener("submit", async (e) => {
    e.preventDefault();
    ocultarErrorEn("restablecerError");
    const password = document.getElementById("restablecerPassword").value;
    if (password.length < 8) {
      mostrarErrorEn("restablecerError", "La contraseña tiene que tener al menos 8 caracteres.");
      return;
    }
    const boton = formRestablecer.querySelector('button[type="submit"]');
    boton.disabled = true;
    try {
      const { res, datos } = await postJson("/api/auth/restablecer", { token: tokenRestablecer, password });
      if (res.status === 410) {
        // Venció mientras escribía: la misma página que un enlace vencido.
        await mostrarRestablecer();
        return;
      }
      if (!res.ok) {
        mostrarErrorEn("restablecerError", datos.error || "No se pudo guardar la contraseña.");
        return;
      }
      // Cerró todas las sesiones, también la de este navegador si había una.
      cerrarSesionLocal();
      document.getElementById("restablecerPassword").value = "";
      volverAlLogin(datos.email);
      const aviso = document.getElementById("loginAviso");
      aviso.textContent = "Listo: tu contraseña cambió. Entrá con la nueva.";
      aviso.classList.remove("is-error");
      aviso.hidden = false;
    } catch {
      mostrarErrorEn("restablecerError", "No se pudo conectar con el servidor.");
    } finally {
      boton.disabled = false;
    }
  });

  document.getElementById("sinNegocioCrear").addEventListener("click", () => abrirAlta({ primerNegocio: true }));
  document.getElementById("sinNegocioSalir").addEventListener("click", () => window.nexoCerrarSesion());

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
      } else if (tokenRestablecer) {
        // El enlace para elegir otra contraseña (hist. §105), con sesión o
        // sin ella: guardarla cierra todas.
        if (!estado.autenticado) cerrarSesionLocal();
        mostrarRestablecer();
      } else if (tokenInvitacion) {
        // El enlace de una invitación (hist. §104). Con sesión, los pasos
        // obligatorios van antes: la invitación se acepta después.
        if (!estado.autenticado) {
          cerrarSesionLocal();
          mostrarInvitacion(null);
        } else if (estado.usuario.debe_cambiar_password || !estado.usuario.email || !estado.usuario.terminos_al_dia) {
          aceptarAlEntrar = tokenInvitacion;
          seguirCon(estado.usuario);
        } else {
          usuarioPendiente = estado.usuario;
          mostrarInvitacion(estado.usuario);
        }
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
