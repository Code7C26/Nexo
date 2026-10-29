/**
 * alta.js
 * Alta guiada de una cuenta (hist. §73): tu cuenta, el código que llega al
 * mail (hist. §108), tu negocio, el tipo de negocio, sus secciones y los
 * datos de los comprobantes, en seis pasos a pantalla completa. El backend
 * crea todo junto al final, en una sola transacción (POST /api/auth/registro):
 * los pasos son solo de la interfaz, salvo el código, que el backend confirma
 * en el momento y canjea por un comprobante que el alta lleva al final.
 *
 * Lo carga sesion.js con import() recién cuando hace falta, así quien entra
 * con su cuenta nunca lo baja. Corre sin sesión: no usa api() ni nada que
 * dependa de la app, solo los módulos de core/ que no tocan la app.
 *
 * Cada paso entra al historial (#/crear-cuenta/N): el Atrás del navegador, o
 * el gesto de volver del celular, vuelve un paso.
 *
 * El mismo alta sirve para "Agregar negocio" (modo "negocio", hist. §77):
 * quien ya tiene cuenta suma otro negocio sin los pasos "Tu cuenta" ni "Tu
 * mail", en #/agregar-negocio/N y con POST /api/negocios. Lo abre
 * dominios/negocios.js.
 */

import { marcarModulosDelTipo, tarjetasModulos, tarjetasTipo, tipoDeNegocio } from "./core/tipos-negocio.js";
import { CONDICIONES_FISCALES, errorCuit, formatearCuit } from "./core/fiscal.js";
import { limpiarError, limpiarErrores, marcarError } from "./core/campos.js";
import { declaraMenor, leerAceptacion } from "./core/aceptacion.js";
import { codigoCompleto, esperarParaReenviar, prepararCampoCodigo } from "./core/codigo.js";

// El número de cada paso es el data-paso de su <form>.
const PASO = { cuenta: 1, codigo: 2, negocio: 3, tipo: 4, secciones: 5, comprobantes: 6 };
const NOMBRES_PASO = ["Tu cuenta", "Tu mail", "Tu negocio", "Tipo de negocio", "Secciones", "Comprobantes"];
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Lo que cambia entre crear una cuenta y agregar un negocio a la que ya se
// tiene: desde qué paso arranca, la dirección y los textos del final.
const MODOS = {
  cuenta: { primero: PASO.cuenta, ruta: "crear-cuenta", crear: "Crear cuenta", creando: "Creando tu cuenta…" },
  negocio: { primero: PASO.negocio, ruta: "agregar-negocio", crear: "Crear negocio", creando: "Creando el negocio…" }
};

const pantalla = document.getElementById("altaPantalla");
const formularios = [...pantalla.querySelectorAll(".alta-paso")];
const campo = (id) => document.getElementById(id);
const contenedorTipos = campo("altaTipos");
const contenedorModulos = campo("altaModulos");
const tactil = window.matchMedia("(pointer: coarse)");

let paso = PASO.cuenta;
let alcanzado = PASO.cuenta;
let catalogo = null;
let rubroDeLosModulos = null;
let alVolverAlPrimero = null;
let opciones = {};
let modo = MODOS.cuenta;
// Lo que respondió en el paso 1 sobre los términos y la edad.
let aceptacion = null;
// El mail al que se mandó el último código, y el comprobante del que ya se
// confirmó ({ email, valor }). Cambiar el mail en el paso 1 los deja sin uso.
let codigoMandadoA = null;
let comprobante = null;

const formDelPaso = (n) => formularios[n - 1];
// El número que ve quien completa el alta, y el de la dirección: en "Agregar
// negocio" el primer paso que se muestra es el 3 de los formularios.
const pasoVisible = (n) => n - modo.primero + 1;
const totalVisible = () => NOMBRES_PASO.length - modo.primero + 1;
const rutaDelPaso = (n) => `#/${modo.ruta}/${pasoVisible(n)}`;
const valor = (id) => campo(id).value.trim();
const mailDeLaCuenta = () => valor("altaEmailCuenta").toLowerCase();
const mailConfirmado = () => comprobante?.email === mailDeLaCuenta();

campo("altaCondicion").innerHTML = `<option value="">Todavía no lo sé</option>${Object.entries(CONDICIONES_FISCALES)
  .map(([clave, etiqueta]) => `<option value="${clave}">${etiqueta}</option>`)
  .join("")}`;

/* ---------- Navegación entre pasos ---------- */

function irAPaso(n, { historial = true } = {}) {
  paso = n;
  alcanzado = Math.max(alcanzado, n);
  for (const form of formularios) form.hidden = Number(form.dataset.paso) !== n;
  campo("altaProgreso").textContent = `Paso ${pasoVisible(n)} de ${totalVisible()} · ${NOMBRES_PASO[n - 1]}`;
  campo("altaPasos")
    .querySelectorAll("li")
    .forEach((li, i) => {
      li.hidden = i < modo.primero - 1;
      li.classList.toggle("is-hecho", i < n - 1);
      li.classList.toggle("is-actual", i === n - 1);
    });
  if (historial) history.pushState(null, "", rutaDelPaso(n));
  pantalla.scrollTo(0, 0);
  if (n === PASO.codigo) pintarPasoCodigo();
  // El mail de los comprobantes se propone con el de la cuenta: casi
  // siempre es el mismo, y se puede cambiar o borrar.
  if (n === PASO.comprobantes && modo === MODOS.cuenta && !campo("altaEmail").value.trim()) {
    campo("altaEmail").value = valor("altaEmailCuenta");
  }
  // Con teclado, el foco va al primer campo (o a la tarjeta elegida): se
  // sigue sin buscar dónde quedó. En una pantalla táctil va al título, porque
  // enfocar un campo abre el teclado del celular y tapa la explicación del
  // paso. El código es la excepción: ahí el teclado es lo que se necesita, y
  // el celular propone el código del mail arriba de él. El cambio de paso lo
  // lee el lector de pantalla desde #altaProgreso (aria-live).
  const form = formDelPaso(n);
  const primero = form.querySelector("input:checked:not([disabled])") ?? form.querySelector("input:not([disabled]), select");
  const alCodigo = n === PASO.codigo && !mailConfirmado();
  (tactil.matches && !alCodigo ? form.querySelector("h1") : primero ?? form.querySelector("h1")).focus();
}

function errorEn(control, texto) {
  marcarError(control, texto);
  control.focus();
}

// Atrás/Adelante del navegador. Adelante no deja saltear un paso que todavía
// no se completó.
window.addEventListener("popstate", () => {
  if (pantalla.hidden) return;
  const ruta = location.hash.match(new RegExp(`^#\\/${modo.ruta}(?:\\/(\\d))?$`));
  if (!ruta) {
    // Salió del alta: en una instalación nueva no hay a dónde ir, se queda.
    if (opciones.instalacionNueva) history.pushState(null, "", rutaDelPaso(paso));
    else cerrar(opciones.alVolver);
    return;
  }
  const destino = Math.min(Math.max(Number(ruta[1] ?? 1) + modo.primero - 1, modo.primero), alcanzado);
  irAPaso(destino, { historial: false });
  if (destino === PASO.cuenta && alVolverAlPrimero) {
    alVolverAlPrimero();
    alVolverAlPrimero = null;
  }
});

for (const boton of pantalla.querySelectorAll("[data-atras]")) {
  boton.addEventListener("click", () => history.back());
}

campo("altaIrALogin").addEventListener("click", () => {
  history.replaceState(null, "", location.pathname + location.search);
  cerrar(opciones.alVolver);
});

// "Agregar negocio" se cancela volviendo por el historial hasta antes del
// primer paso: así el Atrás del navegador no lo vuelve a abrir.
campo("altaCancelar").addEventListener("click", () => history.go(-pasoVisible(paso)));

function cerrar(despues) {
  pantalla.hidden = true;
  despues?.();
}

// El ojo de la contraseña la muestra u oculta (el del login lo maneja
// sesion.js, que solo mira su propia pantalla).
for (const boton of pantalla.querySelectorAll(".campo-ver-clave")) {
  boton.addEventListener("click", () => {
    const input = boton.parentElement.querySelector("input");
    const ver = input.type === "password";
    input.type = ver ? "text" : "password";
    boton.setAttribute("aria-pressed", String(ver));
    boton.setAttribute("aria-label", ver ? "Ocultar contraseña" : "Mostrar contraseña");
    input.focus();
  });
}

// Un error se va apenas se empieza a corregir.
pantalla.addEventListener("input", (e) => limpiarError(e.target));
pantalla.addEventListener("change", (e) => {
  if (e.target.name === "rubro") limpiarError(contenedorTipos);
});

// Un botón ocupado mientras espera al servidor, con lo que está haciendo.
// Devuelve la función que lo deja como estaba.
function ocupar(boton, texto) {
  const antes = boton.innerHTML;
  boton.disabled = true;
  boton.textContent = texto;
  return () => {
    boton.disabled = false;
    boton.innerHTML = antes;
  };
}

// fetch con JSON de ida y de vuelta; un error de red vuelve como status 0.
async function postJson(url, cuerpo) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo)
    });
    return { status: res.status, ok: res.ok, datos: await res.json().catch(() => ({})) };
  } catch {
    return { status: 0, ok: false, datos: { error: "No se pudo conectar con Nexo. Revisá la conexión y probá de nuevo." } };
  }
}

/* ---------- Catálogo de tipos de negocio ---------- */

async function cargarCatalogo() {
  if (catalogo) return;
  try {
    const res = await fetch("/api/auth/tipos-negocio");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    catalogo = await res.json();
    contenedorTipos.innerHTML = tarjetasTipo(catalogo, null);
  } catch {
    contenedorTipos.innerHTML = `
      <p class="opciones-cargando">No se pudieron cargar los tipos de negocio. Revisá la conexión.
        <button type="button" class="btn-link" id="altaReintentarTipos">Reintentar</button></p>`;
    campo("altaReintentarTipos").addEventListener("click", cargarCatalogo);
  }
}

/* ---------- Plan elegido en la landing (hist. §99) ---------- */

// La landing manda a /app?plan=pro#/crear-cuenta. El plan se confirma contra
// el catálogo del backend: uno que no existe se ignora y queda Gratis, el que
// el backend usa si no llega ninguno.
let planElegido = null;
let textoPlan = "";

async function mostrarPlan() {
  const aviso = campo("altaPlan");
  aviso.hidden = true;
  planElegido = null;
  const pedido = new URLSearchParams(location.search).get("plan");
  if (!pedido || modo !== MODOS.cuenta) return;
  try {
    const res = await fetch("/api/auth/planes");
    if (!res.ok) return;
    const { planes, dias_prueba: dias } = await res.json();
    const plan = planes.find((p) => p.clave === pedido);
    if (!plan) return;
    planElegido = plan;
    textoPlan =
      plan.precio > 0
        ? `Plan ${plan.nombre}: lo probás ${dias} días gratis, sin tarjeta. Si después no lo pagás, seguís en el plan Gratis con todo lo que cargaste.`
        : "Plan Gratis: sin costo y sin tarjeta. Cuando lo necesites, pasás a un plan con más lugar.";
    avisarPlan();
  } catch {
    // Sin el catálogo, el alta sigue igual y el negocio nace en Gratis.
  }
}

// Con menos de 18 años el negocio nace en Gratis (etapa 8b, Fase 3): un plan
// pago lo contrata un mayor de edad, y el backend lo rechaza. Se avisa apenas
// responde "No", en el mismo lugar donde dice qué plan eligió.
function planQueVa() {
  return planElegido && !(planElegido.precio > 0 && declaraMenor(formDelPaso(PASO.cuenta))) ? planElegido : null;
}

function avisarPlan() {
  const aviso = campo("altaPlan");
  if (!planElegido) return;
  aviso.textContent = planQueVa()
    ? textoPlan
    : `Elegiste el plan ${planElegido.nombre}, pero con menos de 18 años tu negocio arranca en el plan Gratis. Un plan pago lo tiene que contratar un mayor de edad.`;
  aviso.hidden = false;
}

formDelPaso(PASO.cuenta).addEventListener("change", (e) => {
  if (e.target.type === "radio") avisarPlan();
});

/* ---------- El código del mail (hist. §108) ---------- */

const inputCodigo = campo("altaCodigo");
const botonReenviar = campo("altaReenviarCodigo");
let cortarEspera = null;

// El paso dice a qué mail se mandó. Si se volvió con Atrás y el mail ya está
// confirmado, dice eso y deja seguir sin pedir otro código.
function pintarPasoCodigo() {
  const confirmado = mailConfirmado();
  const destacado = document.createElement("strong");
  destacado.textContent = mailDeLaCuenta();
  campo("altaCodigoTitulo").textContent = confirmado ? "Tu mail está confirmado" : "Revisá tu mail";
  campo("altaCodigoTexto").replaceChildren(
    ...(confirmado
      ? ["Con ", destacado, " vas a entrar a Nexo."]
      : ["Te mandamos un código de 6 números a ", destacado, ". Escribilo acá para confirmar que el mail es tuyo."])
  );
  campo("altaCodigoCampo").hidden = confirmado;
  campo("altaConfirmarCodigo").firstChild.textContent = confirmado ? "Continuar " : "Confirmar ";
}

// Manda el código al mail del paso 1. Devuelve true si salió.
async function mandarCodigo() {
  const email = mailDeLaCuenta();
  const { ok, datos } = await postJson("/api/auth/registro/codigo", { email, sitio: campo("altaSitio").value });
  if (!ok) return datos.error || "No pudimos mandarte el código. Probá de nuevo en unos minutos.";
  codigoMandadoA = email;
  inputCodigo.value = "";
  cortarEspera?.();
  cortarEspera = esperarParaReenviar(botonReenviar);
  return null;
}

// Paso 1 → 2: el código sale una vez por mail. Volver y seguir sin cambiar el
// mail no manda otro (para eso está "Mandar otro código"); con el mail ya
// confirmado, se saltea el paso.
async function pasarAlCodigo() {
  if (mailConfirmado()) return irAPaso(PASO.negocio);
  if (codigoMandadoA !== mailDeLaCuenta()) {
    comprobante = null;
    const listo = ocupar(campo("altaContinuarCuenta"), "Mandando el código…");
    const error = await mandarCodigo();
    listo();
    if (error) return errorEn(campo("altaEmailCuenta"), error);
  }
  irAPaso(PASO.codigo);
}

async function confirmarCodigo() {
  if (mailConfirmado()) return irAPaso(PASO.negocio);
  const email = mailDeLaCuenta();
  const listo = ocupar(campo("altaConfirmarCodigo"), "Confirmando…");
  const { ok, datos } = await postJson("/api/auth/registro/verificar", { email, codigo: inputCodigo.value });
  listo();
  if (!ok) return errorEn(inputCodigo, datos.error || "No se pudo confirmar el código. Probá de nuevo.");
  comprobante = { email, valor: datos.comprobante };
  irAPaso(PASO.negocio);
}

prepararCampoCodigo(inputCodigo, () => formDelPaso(PASO.codigo).requestSubmit());

botonReenviar.addEventListener("click", async () => {
  limpiarError(inputCodigo);
  botonReenviar.disabled = true;
  const error = await mandarCodigo();
  if (error) {
    botonReenviar.disabled = false;
    return errorEn(inputCodigo, error);
  }
  inputCodigo.focus();
});

/* ---------- Validación de cada paso ---------- */

// Cada una devuelve true si el paso está completo; si no, marca el error.
const VALIDAR = {
  [PASO.cuenta]() {
    const nombre = campo("altaNombre");
    const email = campo("altaEmailCuenta");
    const password = campo("altaPassword");
    if (!nombre.value.trim()) return errorEn(nombre, "Escribí tu nombre.");
    if (!email.value.trim()) return errorEn(email, "Escribí tu mail: con él vas a ingresar.");
    if (!EMAIL_VALIDO.test(email.value.trim())) {
      return errorEn(email, "Revisá el mail: tiene que ser como nombre@dominio.com.");
    }
    if (password.value.length < 8) return errorEn(password, "La contraseña tiene que tener al menos 8 caracteres.");
    aceptacion = leerAceptacion(formDelPaso(PASO.cuenta));
    return aceptacion !== null;
  },
  [PASO.codigo]() {
    if (mailConfirmado() || codigoCompleto(inputCodigo)) return true;
    return errorEn(inputCodigo, "Escribí los 6 números del código que te mandamos.");
  },
  [PASO.negocio]() {
    const empresa = campo("altaEmpresa");
    if (!empresa.value.trim()) return errorEn(empresa, "Escribí el nombre de tu negocio.");
    return true;
  },
  [PASO.tipo]() {
    if (!catalogo) return false;
    if (!formDelPaso(PASO.tipo).querySelector('input[name="rubro"]:checked')) {
      marcarError(contenedorTipos, "Elegí el tipo que más se parezca a tu negocio.");
      contenedorTipos.querySelector("input:not([disabled])")?.focus();
      return false;
    }
    return true;
  },
  [PASO.secciones]: () => true,
  [PASO.comprobantes]() {
    const cuit = campo("altaCuit");
    const email = campo("altaEmail");
    const error = errorCuit(cuit.value);
    if (error) return errorEn(cuit, error);
    if (email.value.trim() && !EMAIL_VALIDO.test(email.value.trim())) {
      return errorEn(email, "Revisá el email: tiene que ser como nombre@dominio.com.");
    }
    return true;
  }
};

// Al llegar a las secciones se marcan las del tipo elegido, salvo que se
// vuelva sin haber cambiado de tipo: ahí se respeta lo que ya se tocó.
function prepararModulos() {
  const rubro = formDelPaso(PASO.tipo).querySelector('input[name="rubro"]:checked').value;
  if (rubro === rubroDeLosModulos) return;
  rubroDeLosModulos = rubro;
  contenedorModulos.innerHTML = tarjetasModulos(catalogo, []);
  marcarModulosDelTipo(contenedorModulos, catalogo, rubro);
  const tipo = tipoDeNegocio(catalogo, rubro);
  campo("altaModulosBajada").textContent = tipo.modulos.length
    ? `Marcamos las que suele usar un negocio como el tuyo (${tipo.nombre}). ` +
      "Cambialas ahora o cuando quieras desde Configuración."
    : "Marcá las que vayas a usar. Si después necesitás otra, la sumás desde Configuración.";
}

for (const form of formularios) {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    // Mientras espera al servidor (el código), un segundo Enter no manda otro.
    if (form.querySelector('button[type="submit"]').disabled) return;
    limpiarErrores(form);
    if (VALIDAR[paso]() !== true) return;
    if (paso === PASO.cuenta) return pasarAlCodigo();
    if (paso === PASO.codigo) return confirmarCodigo();
    if (paso === PASO.tipo) prepararModulos();
    if (paso < NOMBRES_PASO.length) irAPaso(paso + 1);
    else crearCuenta({ conComprobantes: true });
  });
}

campo("altaDespues").addEventListener("click", () => crearCuenta({ conComprobantes: false }));

/* ---------- Crear la cuenta ---------- */

// Vuelve al primer paso con el error en el campo del mail.
function volverAlMail(texto) {
  alVolverAlPrimero = () => errorEn(campo("altaEmailCuenta"), texto);
  history.go(PASO.cuenta - paso);
}

async function crearCuenta({ conComprobantes }) {
  const error = campo("altaError");
  error.hidden = true;
  const delNegocio = {
    rubro: formDelPaso(PASO.tipo).querySelector('input[name="rubro"]:checked').value,
    modulos: [...contenedorModulos.querySelectorAll('input[name="modulo"]:checked')].map((c) => c.value)
  };
  // Una cuenta nueva lleva la persona y el negocio (que ahí se llama
  // `empresa`); un negocio más, solo el negocio.
  const cuerpo =
    modo === MODOS.negocio
      ? { nombre: valor("altaEmpresa"), ...delNegocio }
      : {
          nombre: valor("altaNombre"),
          email_cuenta: valor("altaEmailCuenta"),
          comprobante_email: comprobante?.valor,
          password: campo("altaPassword").value,
          empresa: valor("altaEmpresa"),
          ...(planQueVa() && { plan: planQueVa().clave }),
          ...aceptacion,
          ...delNegocio
        };
  if (conComprobantes) {
    Object.assign(cuerpo, {
      documento: formatearCuit(valor("altaCuit")),
      condicion_iva: valor("altaCondicion"),
      direccion: valor("altaDireccion"),
      telefono: valor("altaTelefono"),
      email: valor("altaEmail")
    });
  }

  const crear = campo("altaCrear");
  const botones = [crear, campo("altaDespues"), ...formDelPaso(PASO.comprobantes).querySelectorAll("[data-atras]")];
  botones.forEach((b) => (b.disabled = true));
  crear.textContent = modo.creando;
  try {
    const { status, ok, datos } = await postJson(modo === MODOS.negocio ? "/api/negocios" : "/api/auth/registro", cuerpo);
    if (!ok) {
      // Mail ya tomado: de vuelta al primer paso, con el error en el campo.
      if (status === 409) return volverAlMail(datos.error);
      // El comprobante del código vence a las 2 horas: se confirma de nuevo.
      if (datos.codigo === "mail_sin_confirmar") {
        comprobante = null;
        codigoMandadoA = null;
        return volverAlMail("Pasó mucho tiempo desde que confirmaste el mail. Tocá Continuar y te mandamos otro código.");
      }
      error.textContent = datos.error || `No se pudo ${modo === MODOS.negocio ? "crear el negocio" : "crear la cuenta"}. Probá de nuevo.`;
      error.hidden = false;
      return;
    }
    history.replaceState(null, "", location.pathname + location.search);
    cerrar(() => opciones.alTerminar(modo === MODOS.negocio ? { id: datos.id, nombre: cuerpo.nombre } : datos.usuario));
  } finally {
    botones.forEach((b) => (b.disabled = false));
    crear.textContent = modo.crear;
  }
}

// Agregar un negocio arranca con los pasos vacíos, aunque en esta misma página
// ya se haya empezado otro y cancelado.
function limpiarPasosDelNegocio() {
  for (const form of formularios.slice(PASO.negocio - 1)) {
    form.reset();
    limpiarErrores(form);
  }
  if (catalogo) contenedorTipos.innerHTML = tarjetasTipo(catalogo, null);
  contenedorModulos.innerHTML = "";
  rubroDeLosModulos = null;
  campo("altaError").hidden = true;
}

/* ---------- Entrada ---------- */

// alTerminar(usuario) entra a la app; alVolver() vuelve al login. En una
// instalación nueva no hay cuenta a la que volver.
//
// Con modo "negocio" (hist. §77), desde la app: alTerminar({ id, nombre })
// recibe el negocio creado, al que la sesión ya pasó, y alVolver() es
// cancelar. Entra al historial encima de la vista en la que se estaba, así
// el Atrás del primer paso vuelve a ella. Con `primero` es el primer negocio
// de una cuenta que no tiene ninguno (hist. §104): no es "un negocio aparte".
export function montarAlta({ alTerminar, alVolver, instalacionNueva = false, modo: nombreModo = "cuenta", primero = false }) {
  opciones = { alTerminar, alVolver, instalacionNueva };
  modo = MODOS[nombreModo];
  const agregaNegocio = modo === MODOS.negocio;
  campo("altaYaTengo").hidden = instalacionNueva || agregaNegocio;
  campo("altaCancelar").hidden = !agregaNegocio;
  campo("altaNotaNegocio").hidden = !agregaNegocio || primero;
  formDelPaso(PASO.negocio).querySelector("[data-atras]").hidden = agregaNegocio;
  campo("altaCrear").textContent = modo.crear;
  if (agregaNegocio) limpiarPasosDelNegocio();
  pantalla.hidden = false;
  alcanzado = modo.primero;
  // Recargar a mitad de camino vuelve al primer paso: la contraseña vive
  // solo en memoria.
  if (agregaNegocio) history.pushState(null, "", rutaDelPaso(modo.primero));
  else history.replaceState(null, "", rutaDelPaso(modo.primero));
  irAPaso(modo.primero, { historial: false });
  cargarCatalogo();
  mostrarPlan();
}
