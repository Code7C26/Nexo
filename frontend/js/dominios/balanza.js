/**
 * dominios/balanza.js
 * Configuración → Balanza (hist. §132): el formato de las etiquetas que
 * imprime la balanza del negocio, para que el punto de venta las lea. Se
 * deduce de una etiqueta real (su código y lo que tiene impreso) con
 * core/balanza.js; si más de un formato la explica, pide otra etiqueta y se
 * queda con los que explican las dos.
 */

import { api } from "../core/api.js";
import { avisar, confirmar } from "../core/ui.js";
import { esc } from "../core/formato.js";
import { negocio } from "../core/negocio.js";
import { registrar } from "../core/registro.js";
import { limpiarErrores, marcarError } from "../core/campos.js";
import { deducirFormatos, describirFormato, esEan13 } from "../core/balanza.js";

const form = document.getElementById("formBalanza");
const resultado = document.getElementById("balanzaResultado");
const btnGuardar = document.getElementById("btnBalanzaGuardar");
const btnOtra = document.getElementById("btnBalanzaOtra");

// Los formatos que explican las etiquetas probadas hasta ahora; null antes de
// la primera.
let candidatos = null;
let etiquetasProbadas = 0;
const claveFormato = (f) => `${f.prefijo}|${f.plu_digitos}|${f.valor}|${f.decimales}`;

function pintarEstado() {
  const formato = negocio.balanza;
  document.getElementById("balanzaEstado").textContent = formato
    ? `El mostrador lee las etiquetas: ${describirFormato(formato)}.`
    : "Todavía no está configurada: el mostrador no lee etiquetas de balanza.";
  document.getElementById("balanzaEstadoPie").hidden = !formato;
  document.getElementById("balanzaFormTitulo").textContent = formato ? "Cambiarla con otra etiqueta" : "Configurala con una etiqueta";
  document.getElementById("configBalanzaResumen").textContent = formato ? "Lee las etiquetas" : "Que el mostrador lea sus etiquetas";
}

function empezarDeNuevo() {
  candidatos = null;
  etiquetasProbadas = 0;
  form.reset();
  limpiarErrores(form);
  resultado.hidden = true;
  btnGuardar.hidden = true;
  btnOtra.hidden = true;
}

function pintarResultado() {
  resultado.hidden = false;
  btnOtra.hidden = false;
  if (candidatos.length === 0) {
    resultado.innerHTML = `<p class="balanza-error">Ningún formato explica ${
      etiquetasProbadas > 1 ? "todas las etiquetas" : "esta etiqueta"
    }. Revisá que el PLU, el peso o el importe sean los que tiene impresos.</p>`;
    btnGuardar.hidden = true;
    return;
  }
  if (candidatos.length === 1) {
    resultado.innerHTML = `<p>Tu balanza arma el código así: <strong>${esc(describirFormato(candidatos[0]))}</strong>.</p>`;
    btnGuardar.hidden = false;
    return;
  }
  resultado.innerHTML = `<p>Puede ser más de un formato:</p><ul>${candidatos
    .map((f) => `<li>${esc(describirFormato(f))}</li>`)
    .join("")}</ul><p>Pasá otra etiqueta, de otro producto o de otro peso, para decidir.</p>`;
  btnGuardar.hidden = true;
  form.reset();
  form.codigo.focus();
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  limpiarErrores(form);
  const codigo = form.codigo.value.replace(/\s+/g, "");
  const plu = form.plu.value.trim();
  const peso = form.peso.value === "" ? null : Number(form.peso.value);
  const importe = form.importe.value === "" ? null : Number(form.importe.value);
  if (!esEan13(codigo)) return marcarError(form.codigo, "Son 13 números: pasala de nuevo con el lector.");
  if (codigo[0] !== "2") return marcarError(form.codigo, "No es una etiqueta de balanza: esas empiezan con 2.");
  if (!/^\d{1,6}$/.test(plu)) return marcarError(form.plu, "El PLU es el número del producto en la balanza.");
  if (!(peso > 0) && !(importe > 0)) return marcarError(form.peso, "Cargá el peso o el importe que tiene impresos.");

  const nuevos = deducirFormatos({ codigo, plu: Number(plu), peso, importe });
  etiquetasProbadas += 1;
  if (candidatos) {
    const claves = new Set(nuevos.map(claveFormato));
    candidatos = candidatos.filter((f) => claves.has(claveFormato(f)));
  } else {
    candidatos = nuevos;
  }
  pintarResultado();
});

// El lector termina cada lectura con Enter: en el código pasa al PLU, sin
// probar el formulario a medio llenar.
form.codigo.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  form.plu.focus();
});

btnOtra.addEventListener("click", empezarDeNuevo);

btnGuardar.addEventListener("click", async () => {
  const [formato] = candidatos ?? [];
  if (!formato) return;
  const { balanza } = await api("/api/negocio/balanza", {
    method: "PUT",
    body: { formato },
    error: "No se pudo guardar el formato de la balanza."
  });
  negocio.balanza = balanza;
  empezarDeNuevo();
  pintarEstado();
  avisar("Listo: el punto de venta ya lee las etiquetas de tu balanza.", "ok");
});

document.getElementById("btnBalanzaQuitar").addEventListener("click", async () => {
  const ok = await confirmar({
    titulo: "Dejar de usar la balanza",
    cuerpo: "El punto de venta deja de leer sus etiquetas. Los códigos de balanza de los productos quedan guardados.",
    aceptar: "Dejar de usarla"
  });
  if (!ok) return;
  await api("/api/negocio/balanza", { method: "PUT", body: { formato: null }, error: "No se pudo guardar." });
  negocio.balanza = null;
  pintarEstado();
});

registrar("pintar:balanza", () => {
  empezarDeNuevo();
  pintarEstado();
});
