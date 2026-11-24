/**
 * core/recordar.js
 * El botón "Recordar" de una deuda (hist. §219): un enlace de WhatsApp con el
 * mensaje armado de Configuración → Mensajes de WhatsApp (core/mensajes.js).
 * Es un <a> común, así el navegador no lo frena como a una ventana que se
 * abre sola. Al tocarlo pregunta si se mandó, y con el Sí Nexo anota el
 * recordatorio (quién, cuándo, cuánto) y la fila dice hace cuánto se le
 * recordó, para no insistir de más.
 *
 * Lo usan Cuentas corrientes (lo que debe un cliente) y Cuotas (la cuota
 * vencida de un socio).
 */

import { api } from "./api.js";
import { esc, fechaAR } from "./formato.js";
import { negocio } from "./negocio.js";
import { enlaceWhatsApp, llenarMensaje, textoDe } from "./mensajes.js";

// "$ 45.000" o "$ 1.250,50": como se escribe en un mensaje, sin los centavos
// cuando no hay.
export const pesosMensaje = (n) => `$ ${Number(n).toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;

// Lo que dice la fila del último recordatorio, o "".
export function haceCuanto(recordatorio) {
  if (!recordatorio) return "";
  if (recordatorio.dias <= 0) return "Le recordaste hoy";
  if (recordatorio.dias === 1) return "Le recordaste ayer";
  return `Le recordaste hace ${recordatorio.dias} días`;
}

// El mensaje de `tipo` con los datos de este cliente.
export const mensajeDe = (tipo, datos) => llenarMensaje(textoDe(tipo, negocio.mensajes_whatsapp), { negocio: negocio.nombre, ...datos });

// datos: { nombre, deuda (número), vencimiento (AAAA-MM-DD), dias, plan }.
// atributos: lo que el listener de la tabla necesita para anotarlo.
export function botonRecordar({ telefono, tipo, datos, recordatorio, atributos }) {
  const texto = mensajeDe(tipo, { ...datos, deuda: pesosMensaje(datos.deuda), vencimiento: fechaAR(datos.vencimiento) });
  const titulo = telefono ? "Abre WhatsApp con el mensaje listo para mandar" : "No tiene teléfono cargado: WhatsApp te pide elegir a quién";
  return `<span class="recordar">
      <a class="btn btn-secundario btn-chico" href="${esc(enlaceWhatsApp(telefono, texto))}" target="_blank" rel="noopener" title="${esc(titulo)}" ${atributos}>
        <svg class="ico ico-marca" aria-hidden="true" viewBox="0 0 24 24"><use href="/img/whatsapp.svg#emblema"></use></svg> Recordar
      </a>
      ${recordatorio ? `<span class="recordar-cuando">${esc(haceCuanto(recordatorio))}</span>` : ""}
    </span>`;
}

// Tocar "Recordar" solo abre WhatsApp: Nexo no sabe si el mensaje salió (se
// puede cerrar sin mandarlo). Abajo del botón pregunta "¿Lo mandaste?", y
// solo el Sí lo anota. Devuelve la respuesta; con No vuelve lo de antes.
export function preguntarSiLoMando(enlace) {
  const lugar = enlace.closest(".recordar");
  const anterior = lugar.querySelector(".recordar-cuando");
  const pregunta = document.createElement("span");
  pregunta.className = "recordar-cuando recordar-pregunta";
  pregunta.innerHTML = `¿Lo mandaste? <button type="button" class="btn-link" data-mando="si">Sí</button> <button type="button" class="btn-link" data-mando="no">No</button>`;
  if (anterior) anterior.replaceWith(pregunta);
  else lugar.append(pregunta);
  return new Promise((resolver) => {
    pregunta.addEventListener("click", (e) => {
      const boton = e.target.closest("[data-mando]");
      if (!boton) return;
      e.stopPropagation();
      if (anterior) pregunta.replaceWith(anterior);
      else pregunta.remove();
      resolver(boton.dataset.mando === "si");
    });
  });
}

// Anota que se le recordó. Devuelve el recordatorio ({ fecha, deuda, dias }),
// o null si no se pudo (api() ya avisó por qué).
export async function anotarRecordatorio(clienteId, tipo, ventaId = null) {
  try {
    return await api(`/api/clientes/${clienteId}/recordatorios`, {
      method: "POST",
      body: { tipo, ...(ventaId ? { venta_id: ventaId } : {}) },
      error: "No se pudo anotar el recordatorio."
    });
  } catch {
    return null;
  }
}
