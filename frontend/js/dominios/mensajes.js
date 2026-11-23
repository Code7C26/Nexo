/**
 * dominios/mensajes.js
 * Configuración → Mensajes de WhatsApp (hist. §219): una tarjeta por
 * situación de core/mensajes.js (antes de que venza, ya venció y, con socios,
 * la cuota vencida), con su texto, los marcadores para sumar donde está el
 * cursor y cómo le llega al cliente. Se guarda solo lo que cambió
 * (PUT /api/negocio/mensajes). Solo admin. Los usa core/recordar.js.
 */

import { avisar } from "../core/ui.js";
import { api } from "../core/api.js";
import { recargar, registrar } from "../core/registro.js";
import { esc, fechaAR, hoyISO } from "../core/formato.js";
import { moduloActivo, negocio } from "../core/negocio.js";
import { MARCADORES, MAX_MENSAJE, MENSAJES, llenarMensaje, textoDe } from "../core/mensajes.js";
import { pesosMensaje } from "../core/recordar.js";

const form = document.getElementById("formMensajes");
const lista = document.getElementById("mensajesLista");

const enDias = (n) => {
  const fecha = new Date(`${hoyISO()}T12:00:00`);
  fecha.setDate(fecha.getDate() + n);
  return fechaAR(fecha.toLocaleDateString("sv-SE"));
};

// Un cliente de ejemplo para la vista previa: lo que vence, dentro de 5 días;
// lo vencido, hace 12.
const ejemplo = (tipo) => ({
  nombre: "Marta Gómez",
  negocio: negocio.nombre,
  deuda: pesosMensaje(tipo === "cuota" ? 28000 : 45000),
  vencimiento: enDias(tipo === "por_vencer" ? 5 : -12),
  dias: 12,
  plan: "Musculación",
  total: pesosMensaje(18500),
  ganados: "18 puntos",
  puntos: "240 puntos",
  vencen: enDias(90)
});

const situaciones = () => Object.entries(MENSAJES).filter(([, m]) => !m.modulo || moduloActivo(m.modulo));

function pintarVista(tipo) {
  const texto = form.elements[tipo].value.trim() || MENSAJES[tipo].de_partida;
  lista.querySelector(`[data-vista="${tipo}"]`).textContent = llenarMensaje(texto, ejemplo(tipo));
}

function pintarMensajes() {
  lista.innerHTML = situaciones()
    .map(
      ([tipo, m]) => `
    <div class="form config-tarjeta">
      <div class="config-tarjeta-cuerpo">
        <p class="config-tarjeta-titulo">${esc(m.titulo)}</p>
        <p class="config-tarjeta-texto">${esc(m.cuando)}</p>
        <label>Mensaje
          <textarea name="${tipo}" rows="4" maxlength="${MAX_MENSAJE}"></textarea>
        </label>
        <div class="mensaje-marcadores">
          <span class="campo-ayuda">Sumá un dato:</span>
          ${m.marcadores
            .map((clave) => `<button type="button" class="chip mensaje-marcador" data-tipo="${tipo}" data-marcador="${clave}" title="${esc(MARCADORES[clave])}">{${clave}}</button>`)
            .join("")}
        </div>
        <div class="mensaje-vista-caja">
          <p class="campo-ayuda">Así le llega:</p>
          <p class="mensaje-vista" data-vista="${tipo}"></p>
        </div>
        <button type="button" class="btn-link" data-partida="${tipo}">Volver al de partida</button>
      </div>
    </div>`
    )
    .join("");
  for (const [tipo] of situaciones()) {
    form.elements[tipo].value = textoDe(tipo, negocio.mensajes_whatsapp);
    pintarVista(tipo);
  }
}
registrar("pintar:mensajes", pintarMensajes);

form.addEventListener("input", (e) => {
  if (e.target.name && MENSAJES[e.target.name]) pintarVista(e.target.name);
});

lista.addEventListener("click", (e) => {
  const marcador = e.target.closest("[data-marcador]");
  if (marcador) {
    // Donde está el cursor, o al final.
    const campo = form.elements[marcador.dataset.tipo];
    const marca = `{${marcador.dataset.marcador}}`;
    const desde = campo.selectionStart ?? campo.value.length;
    const hasta = campo.selectionEnd ?? desde;
    campo.setRangeText(marca, desde, hasta, "end");
    campo.focus();
    pintarVista(marcador.dataset.tipo);
    return;
  }
  const partida = e.target.closest("[data-partida]");
  if (partida) {
    form.elements[partida.dataset.partida].value = MENSAJES[partida.dataset.partida].de_partida;
    pintarVista(partida.dataset.partida);
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const boton = form.querySelector('button[type="submit"]');
  const mensajes = Object.fromEntries(situaciones().map(([tipo]) => [tipo, form.elements[tipo].value]));
  boton.disabled = true;
  try {
    const r = await api("/api/negocio/mensajes", { method: "PUT", body: { mensajes }, error: "No se pudieron guardar los mensajes." });
    negocio.mensajes_whatsapp = r.mensajes_whatsapp;
    // Cuentas corrientes ya está pintada: sus enlaces llevan el mensaje viejo.
    recargar("cuentasCorrientes");
    avisar("Mensajes guardados. Los vas a ver al tocar Recordar.", "ok");
  } finally {
    boton.disabled = false;
  }
});
