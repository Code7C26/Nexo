/**
 * core/ui.js
 * Avisos (toasts), confirmación, accesibilidad de modales y estados de tabla.
 * Movido tal cual desde app.js (CLAUDE.md §31, Etapa B / F2).
 */

/* ---------- Avisos y confirmaciones (reemplazan alert()/confirm() nativos) ---------- */

// Toast que se apila abajo a la izquierda y se retira solo — no bloquea
// el hilo ni rompe la identidad visual con el chrome del navegador.
// tono: "ok" | "atencion" | "error".
const avisosEl = document.getElementById("avisos");

export function avisar(mensaje, tono = "ok") {
  const aviso = document.createElement("div");
  aviso.className = `aviso aviso-${tono}`;
  aviso.setAttribute("role", tono === "error" ? "alert" : "status");
  aviso.textContent = mensaje;
  avisosEl.appendChild(aviso);
  setTimeout(() => aviso.remove(), 4200);
}

// Reemplaza confirm(): abre el modal de confirmación en vez de bloquear
// la página con el diálogo nativo, y resuelve una Promise<boolean> según
// qué botón se apriete (Enter confirma, Escape o click afuera cancela).
const modalConfirmar = document.getElementById("modalConfirmar");
const modalConfirmarTitulo = document.getElementById("modalConfirmarTitulo");
const modalConfirmarCuerpo = document.getElementById("modalConfirmarCuerpo");
const btnConfirmarAceptar = document.getElementById("modalConfirmarAceptar");
const btnConfirmarCancelar = document.getElementById("modalConfirmarCancelar");
let confirmarActivo = null;

function confirmarCerrar(resultado) {
  if (!confirmarActivo) return;
  modalConfirmar.hidden = true;
  document.removeEventListener("keydown", confirmarKeydown);
  const { resolve, trigger } = confirmarActivo;
  confirmarActivo = null;
  trigger?.focus();
  resolve(resultado);
}

function confirmarKeydown(e) {
  if (e.key === "Escape") {
    e.preventDefault();
    confirmarCerrar(false);
  }
  if (e.key === "Enter") {
    e.preventDefault();
    confirmarCerrar(true);
  }
}

export function confirmar({ titulo = "Confirmar", cuerpo, aceptar = "Confirmar", destructivo = false } = {}) {
  return new Promise((resolve) => {
    modalConfirmarTitulo.textContent = titulo;
    modalConfirmarCuerpo.textContent = cuerpo;
    btnConfirmarAceptar.textContent = aceptar;
    btnConfirmarAceptar.className = `btn ${destructivo ? "btn-peligro" : "btn-primary"}`;
    confirmarActivo = { resolve, trigger: document.activeElement };
    modalConfirmar.hidden = false;
    document.addEventListener("keydown", confirmarKeydown);
    btnConfirmarCancelar.focus();
  });
}

btnConfirmarAceptar.addEventListener("click", () => confirmarCerrar(true));
btnConfirmarCancelar.addEventListener("click", () => confirmarCerrar(false));
modalConfirmar.addEventListener("click", (e) => {
  if (e.target === modalConfirmar) confirmarCerrar(false);
});

/* ---------- Accesibilidad de modales (foco, Escape, Tab) ---------- */

// Se engancha al atributo hidden de cada .modal con un MutationObserver
// en vez de tocar los ~90 lugares que ya hacen `modalX.hidden = true/false`
// desde botones, submits y clicks afuera — así cualquier apertura/cierre
// existente hereda foco y Escape sin reescribir esos call sites.
// modalConfirmar queda afuera: ya tiene su propio manejo arriba, necesario
// porque tiene que resolver una promesa según qué botón se apriete, no
// solo abrir o cerrar.
const FOCUSABLES_MODAL = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

document.querySelectorAll(".modal").forEach((modal) => {
  if (modal.id === "modalConfirmar") return;

  let trigger = null;

  new MutationObserver(() => {
    if (modal.hidden) {
      trigger?.focus();
    } else {
      trigger = document.activeElement;
      // El botón ✕ es siempre el primer focusable en el DOM (va al
      // principio del modal-head), pero no es un buen destino de foco
      // inicial: hay que saltarlo y arrancar en el primer campo real.
      const focosables = [...modal.querySelectorAll(FOCUSABLES_MODAL)];
      const objetivo = focosables.find((el) => !el.classList.contains("modal-close")) ?? focosables[0] ?? modal;
      objetivo.focus();
    }
  }).observe(modal, { attributes: true, attributeFilter: ["hidden"] });

  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      modal.hidden = true;
      return;
    }
    if (e.key !== "Tab") return;
    const focosables = [...modal.querySelectorAll(FOCUSABLES_MODAL)].filter((el) => el.offsetParent !== null);
    if (focosables.length === 0) return;
    const primero = focosables[0];
    const ultimo = focosables[focosables.length - 1];
    if (e.shiftKey && document.activeElement === primero) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primero.focus();
    }
  });
});

export async function manejarError(res, accionDefault) {
  if (res.ok) return true;
  let mensaje = accionDefault;
  try {
    const cuerpo = await res.json();
    if (cuerpo.error) mensaje = cuerpo.error;
  } catch {
    // sin cuerpo JSON, se usa el mensaje por defecto
  }
  avisar(mensaje, "error");
  return false;
}

/* ---------- Resultado de una edición en lote ---------- */
//
// Compartida entre el bulk de Productos y el de Compras (mismo shape de
// response: {aplicados, fallidos, resumen}). Devuelve true si hubo algún
// fallo (así el caller sabe si debe dejar el modal abierto en vez de
// cerrarlo) y false si el lote entero salió bien.
//
// `etiquetar(id)` arma el texto legible de un id fallido (ej. el nombre
// del producto en vez de un número pelado) buscando en el array que el
// caller ya tiene en memoria — mostrarResultadoBulk no conoce la entidad.
export function mostrarResultadoBulk(resultado, { bloque, titulo, lista, etiquetar = (id) => `#${id}` } = {}) {
  const { aplicados, fallidos, resumen } = resultado;

  if (fallidos.length === 0) {
    bloque.hidden = true;
    lista.innerHTML = "";
    const partes = [`${resumen.aplicados} aplicado${resumen.aplicados === 1 ? "" : "s"}`];
    if (resumen.sin_cambios > 0) partes.push(`${resumen.sin_cambios} ya estaba${resumen.sin_cambios === 1 ? "" : "n"} así`);
    avisar(partes.join(", ") + ".", "ok");
    return false;
  }

  titulo.textContent =
    aplicados.length === 0
      ? "Ninguno se pudo aplicar."
      : `${resumen.aplicados} aplicado${resumen.aplicados === 1 ? "" : "s"} · ${resumen.fallidos} falló${resumen.fallidos === 1 ? "" : "aron"}.`;
  lista.innerHTML = fallidos
    .map((f) => `<li>${etiquetar(f.id)} — ${f.error}</li>`)
    .join("");
  bloque.hidden = false;
  avisar(titulo.textContent, "atencion");
  return true;
}

/* ---------- Estado de tablas: carga y vacío ---------- */

// Fila de estado vacío. Con accionTexto+accionId agrega un botón que
// dispara el mismo control que ya abre el alta correspondiente (así no
// duplica la lógica de apertura de cada modal).
export function filaVacia(colspan, mensaje, { accionTexto, accionId } = {}) {
  const accion =
    accionTexto && accionId
      ? ` <button type="button" class="btn-link tabla-vacia-accion" data-abrir="${accionId}">${accionTexto}</button>`
      : "";
  return `<tr><td colspan="${colspan}" class="tabla-vacia">${mensaje}${accion}</td></tr>`;
}

// Distingue "no hay nada cargado" de "el filtro no encontró nada": en el
// segundo caso invitar a crear un registro sería confuso (puede que sí
// existan, el filtro los está ocultando), así que se ofrece limpiarlos.
export function filaVaciaFiltrada(colspan) {
  return `<tr><td colspan="${colspan}" class="tabla-vacia">Ningún resultado para estos filtros. <button type="button" class="btn-link tabla-vacia-limpiar">Limpiar filtros</button></td></tr>`;
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".tabla-vacia-accion");
  if (btn) document.getElementById(btn.dataset.abrir)?.click();
});

// Filas skeleton mientras el fetch de un cargar*() todavía está en
// curso — se llama al principio de esas funciones, antes del await.
export function tablaCargando(bodyId, colspan, filas = 3) {
  const body = document.getElementById(bodyId);
  if (!body) return;
  body.innerHTML = Array.from({ length: filas })
    .map(() => `<tr class="fila-cargando"><td colspan="${colspan}"><div class="skeleton-linea"></div></td></tr>`)
    .join("");
}
