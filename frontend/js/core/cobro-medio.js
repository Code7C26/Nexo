/**
 * core/cobro-medio.js
 * Cobrar cuotas con los medios de cobro del negocio (hist. §215): Cuotas, la
 * ficha del socio y Abonos ofrecen un botón por cada medio activo (Efectivo,
 * Débito, Crédito, Transferencia…, los de Configuración › Medios de cobro),
 * como el mostrador y "Registrar cobro" de Ventas (hist. §171, §176). Nunca
 * las cuentas: Mercado Pago o el banco son adónde cae la plata, no cómo se
 * paga. Lo que no está configurado no se ofrece.
 *
 * Al tocar un medio se abre un diálogo que dice cuánto, a quién y adónde entra,
 * y pregunta solo lo que el medio no dice: la caja del efectivo si hay varias,
 * la cuenta donde cayó la transferencia, las cuotas del crédito. Las reglas de
 * la cuenta son las de cuentaDelMedio en el servidor.
 */

import { api } from "./api.js";
import { esc, money, numero } from "./formato.js";
import { icono } from "./iconos.js";
import { formatear, t } from "./idioma.js";

const ICONO_MEDIO = {
  efectivo: "banknote",
  debito: "credit-card",
  credito: "credit-card",
  transferencia: "arrow-right-left",
  billetera: "wallet",
  otro: "wallet"
};

export const cargarMediosDeCobro = () => api("/api/medios-cobro?activos=1", { error: "No se pudieron cargar los medios de cobro." });

// Los botones de los medios, el efectivo primero y resaltado (lo más común en
// la recepción). `datos` son los data-* de cada botón, además de data-medio;
// en una lista van chicos, en una ficha o en la recepción, de tamaño normal.
export function botonesDeMedios(medios, datos = "", { chicos = true } = {}) {
  const orden = [...medios].sort((a, b) => Number(b.tipo === "efectivo") - Number(a.tipo === "efectivo"));
  return orden
    .map(
      (m, i) => `<button type="button" class="btn ${i === 0 ? "btn-primary" : "btn-secundario"}${chicos ? " btn-chico" : ""}" data-medio="${m.id}" ${datos}>
        ${icono(ICONO_MEDIO[m.tipo] ?? "wallet")} ${esc(m.nombre)}
      </button>`
    )
    .join("");
}

// Las cuentas donde puede entrar lo cobrado con el medio (las mismas reglas
// que en el servidor): el efectivo a una caja, la transferencia a cualquier
// cuenta menos una caja, y los demás a la suya o, sin cuenta propia, a la que
// se elija.
function cuentasPosibles(medio, cuentas) {
  if (medio.tipo === "efectivo") return cuentas.filter((c) => c.tipo === "efectivo");
  if (medio.tipo === "transferencia") return cuentas.filter((c) => c.tipo !== "efectivo");
  return medio.cuenta_tesoreria_id ? [] : cuentas;
}

const modal = document.getElementById("modalCobroMedio");
const form = document.getElementById("formCobroMedio");
let pendiente = null;

function cerrar(resultado) {
  const resolver = pendiente;
  pendiente = null;
  modal.hidden = true;
  resolver?.(resultado);
}

// Pregunta y confirma el cobro con ese medio. Devuelve lo que va en el cuerpo
// del POST (medio_cobro_id, y cuotas y cuenta_tesoreria_id si hacen falta), o
// null si se cancela.
export function confirmarCobroConMedio({ medio, cuentas, importe, quien, que }) {
  document.getElementById("cobroMedioTitulo").textContent = formatear("Cobrar con {0}", medio.nombre);
  document.getElementById("cobroMedioCuerpo").textContent = formatear("{0} a {1}: {2}.", money(importe), quien, que);

  const planes = medio.tipo === "credito" ? medio.planes ?? [] : [];
  document.getElementById("cobroMedioCuotasCampo").hidden = planes.length === 0;
  form.cuotas.required = planes.length > 0;
  form.cuotas.innerHTML = planes
    .map((p) => `<option value="${esc(p.cuotas)}">${p.cuotas === 1 ? esc(t("1 pago")) : esc(formatear("{0} cuotas", numero(p.cuotas)))}</option>`)
    .join("");

  const posibles = cuentasPosibles(medio, cuentas);
  const elegir = posibles.length > 1;
  document.getElementById("cobroMedioCuentaCampo").hidden = !elegir;
  form.cuenta_tesoreria_id.required = elegir;
  form.cuenta_tesoreria_id.innerHTML = posibles.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join("");
  if (posibles.some((c) => c.id === medio.cuenta_tesoreria_id)) form.cuenta_tesoreria_id.value = medio.cuenta_tesoreria_id;
  document.getElementById("cobroMedioCuentaEtiqueta").textContent =
    medio.tipo === "efectivo" ? t("¿En qué caja entra?") : medio.tipo === "transferencia" ? t("¿En qué cuenta cayó?") : t("¿A qué cuenta entra?");

  const fija = elegir ? null : posibles[0] ?? cuentas.find((c) => c.id === medio.cuenta_tesoreria_id);
  const destino = document.getElementById("cobroMedioDestino");
  destino.hidden = !fija;
  destino.textContent = fija ? formatear("Entra a {0}.", fija.nombre) : "";
  document.getElementById("cobroMedioAceptar").textContent = formatear("Cobrar {0}", money(importe));

  return new Promise((resolve) => {
    pendiente = (aceptado) => {
      if (!aceptado) return resolve(null);
      resolve({
        medio_cobro_id: medio.id,
        ...(planes.length ? { cuotas: Number(form.cuotas.value) } : {}),
        ...(elegir ? { cuenta_tesoreria_id: Number(form.cuenta_tesoreria_id.value) } : fija ? { cuenta_tesoreria_id: fija.id } : {})
      });
    };
    modal.hidden = false;
  });
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  cerrar(true);
});
document.getElementById("cobroMedioCancelar").addEventListener("click", () => cerrar(false));
modal.addEventListener("click", (e) => {
  if (e.target === modal) cerrar(false);
});
// Escape o el "atrás" del celular lo cierran sin pasar por cerrar(): se
// resuelve como cancelado.
new MutationObserver(() => {
  if (modal.hidden && pendiente) cerrar(false);
}).observe(modal, { attributes: true, attributeFilter: ["hidden"] });
