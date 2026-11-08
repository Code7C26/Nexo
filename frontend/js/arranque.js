// Se carga en el <head> sin defer, así corre antes de pintar la página (no en
// app.js, que carga después) y no hay un flash de tema oscuro (el de partida,
// sin atributo) al entrar con claro elegido. Era un script inline: salió a
// este archivo para que la CSP pueda prohibir los scripts inline (hist. §94).
try {
  const guardado = localStorage.getItem("nexo.tema");
  if (guardado) document.documentElement.setAttribute("data-tema", guardado);
  const sidebarGuardada = localStorage.getItem("nexo.sidebar");
  if (sidebarGuardada) document.documentElement.setAttribute("data-sidebar", sidebarGuardada);
  // Marca cosmética para evitar el flash de la app antes de que sesion.js
  // confirme con el servidor si hay sesión de verdad. Esto NO es seguridad: el
  // servidor decide con la cookie httpOnly, que este script ni siquiera puede
  // leer. Si alguien borra esta marca a mano, lo único que pasa es que ve un
  // parpadeo — sesion.js igual pide /api/auth/estado y muestra el login si
  // corresponde.
  // En inglés, la página no se muestra hasta que traductor.js la traduce
  // (así no se ve el castellano un instante). Si algo falla, se muestra igual
  // a los 4 segundos: mejor en castellano que en blanco.
  if (localStorage.getItem("nexo.idioma") === "en") {
    document.documentElement.setAttribute("data-traduciendo", "");
    setTimeout(() => document.documentElement.removeAttribute("data-traduciendo"), 4000);
  }
  if (localStorage.getItem("nexo.sesion") !== "activa") {
    document.documentElement.setAttribute("data-sesion", "cerrada");
  }
} catch {}
