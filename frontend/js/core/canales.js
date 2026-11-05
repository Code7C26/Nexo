/**
 * core/canales.js
 * Lo que comparten las páginas de los canales de venta (Tienda Nube y Mercado
 * Libre, CLAUDE.md §32): los ajustes de lista, depósito y cuenta, la lista de
 * pedidos con sus botones y la actividad. Cada página pone sus ids y textos;
 * `plataforma` es la de la API (/api/integraciones/<plataforma>).
 */

import { avisar } from "./ui.js";
import { api } from "./api.js";
import { invocar } from "./registro.js";
import { esc, fechaHoraAR, money } from "./formato.js";
import { icono } from "./iconos.js";

// Por dónde entró una venta (hist. §128): la misma lista, con los mismos
// nombres, que CANALES_VENTA en server.js. Tienda Nube y Mercado Libre los
// pone sola la tienda conectada; se pueden elegir a mano para quien vende ahí
// sin conectarla.
export const CANALES_VENTA = {
  local: "En el local",
  tiendanube: "Tienda Nube",
  mercadolibre: "Mercado Libre",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  facebook: "Facebook",
  web: "Página propia",
  otro: "Otro"
};

// El logo de cada canal (hist. §138), de los sprites de cada marca; el local
// lleva la tienda, y lo que no tiene logo, el globo. Mercado Pago no es un
// canal (es dónde se cobra), pero sale en "Tus tiendas".
const LOGOS_CANAL = {
  tiendanube: '<svg class="ico ico-marca" aria-hidden="true" viewBox="0 0 37.5 27"><use href="/img/tiendanube.svg#nube"></use></svg>',
  mercadolibre:
    '<svg class="ico ico-marca ico-marca-color" aria-hidden="true" viewBox="0 0 150 104"><use href="/img/mercadolibre.svg#emblema"></use></svg>',
  mercadopago:
    '<svg class="ico ico-marca ico-marca-color" aria-hidden="true" viewBox="0 0 150 104"><use href="/img/mercadopago.svg#emblema"></use></svg>',
  instagram: '<svg class="ico ico-marca" aria-hidden="true" viewBox="0 0 24 24"><use href="/img/instagram.svg#emblema"></use></svg>',
  whatsapp: '<svg class="ico ico-marca" aria-hidden="true" viewBox="0 0 24 24"><use href="/img/whatsapp.svg#emblema"></use></svg>'
};
export const logoDeCanal = (canal) => LOGOS_CANAL[canal] ?? icono(canal === "local" ? "store" : "globe");

// Los tres selectores de "qué se publica y adónde entra la plata".
export async function pintarAjustesCanal(estado, { lista, deposito, cuenta }) {
  const [listas, depositos, cuentas] = await Promise.all([
    api("/api/listas-precios", { error: "No se pudieron cargar las listas de precios." }),
    api("/api/depositos", { error: "No se pudieron cargar los depósitos." }),
    api("/api/cuentas-tesoreria", { error: "No se pudieron cargar las cuentas." })
  ]);
  const opciones = (filas, elegido, primera) =>
    [
      `<option value="">${esc(primera)}</option>`,
      ...filas.map((f) => `<option value="${f.id}"${f.id === elegido ? " selected" : ""}>${esc(f.nombre)}</option>`)
    ].join("");
  const predeterminado = (filas, campo) => filas.find((f) => f[campo])?.nombre ?? "—";
  lista.innerHTML = opciones(
    listas.filter((l) => l.activa !== 0),
    estado.lista_precio_id,
    `La predeterminada (${predeterminado(listas, "es_predeterminada")})`
  );
  deposito.innerHTML = opciones(
    depositos.filter((d) => d.activo !== 0),
    estado.deposito_id,
    `El predeterminado (${predeterminado(depositos, "es_predeterminado")})`
  );
  cuenta.innerHTML = opciones(cuentas, estado.cuenta_tesoreria_id, "No registrar el cobro");
}

// Guardar los ajustes: lo que no se elige va como null (la predeterminada).
export function escucharAjustesCanal(form, plataforma, { aviso, recargar }) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const datos = Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, v ? Number(v) : null]));
    await api(`/api/integraciones/${plataforma}`, { method: "PUT", body: datos, error: "No se pudieron guardar los cambios." });
    avisar(aviso, "ok");
    await recargar();
  });
}

const ESTADO_PEDIDO = {
  importado: ["status-cobrado", "Es venta"],
  esperando_pago: ["status-info", "Esperando el pago"],
  pendiente: ["status-pendiente", "Para revisar"],
  cancelado: ["status-vencido", "Cancelado"]
};

// Una fila por pedido: el número y el estado, el detalle (el error, la venta,
// o la reserva) y los botones.
export function pintarPedidosCanal(lista, pedidos, { vacio, titulo, reservado }) {
  if (!pedidos.length) {
    lista.innerHTML = `<li><p class="tn-vacio">${esc(vacio)}</p></li>`;
    return;
  }
  lista.innerHTML = pedidos
    .map((p) => {
      const [clase, texto] = p.por_cobrar > 0 ? ["status-pendiente", "Por cobrar"] : ESTADO_PEDIDO[p.estado];
      const venta = p.venta_id ? `Venta #${p.venta_id}${p.por_cobrar > 0 ? ` · falta cobrar ${money(p.por_cobrar)}` : ""}` : null;
      const detalle = p.error ?? venta ?? (p.estado === "esperando_pago" ? reservado : null) ?? "—";
      const acciones = [
        p.venta_id ? `<button type="button" class="btn-link" data-venta="${p.venta_id}">Ver venta</button>` : "",
        p.estado === "pendiente" ? `<button type="button" class="btn-link" data-reintentar="${p.id}">Reintentar</button>` : "",
        p.estado === "cancelado" && p.error ? `<button type="button" class="btn-link" data-revisado="${p.id}">Ya lo revisé</button>` : ""
      ].join(" ");
      return `
      <li class="tn-pedido">
        <div class="tn-pedido-texto">
          <p class="tn-pedido-titulo"><span class="mono">${esc(titulo)} #${esc(p.numero ?? p.externo_id)}</span> <span class="status ${clase}">${texto}</span></p>
          <p class="tn-pedido-detalle">${esc(detalle)}</p>
        </div>
        <div class="tn-pedido-acciones">${acciones}</div>
      </li>`;
    })
    .join("");
}

// Los botones de cada pedido: ver la venta, reintentar uno pendiente, o dar
// por revisado uno cancelado que ya era venta.
export function escucharPedidosCanal(lista, plataforma, recargar) {
  lista.addEventListener("click", async (e) => {
    const boton = e.target.closest("button");
    if (!boton) return;
    if (boton.dataset.venta) {
      invocar("abrirFicha:venta", Number(boton.dataset.venta));
    } else if (boton.dataset.reintentar) {
      const r = await api(`/api/integraciones/${plataforma}/pedidos/${boton.dataset.reintentar}/reintentar`, {
        method: "POST",
        error: "No se pudo reintentar."
      });
      if (r.estado === "importado") avisar(`Listo: ahora es la venta #${r.venta_id}.`, "ok");
      else avisar(r.error ?? "Sigue sin poder pasar a venta.", "atencion");
      await recargar();
    } else if (boton.dataset.revisado) {
      await api(`/api/integraciones/${plataforma}/pedidos/${boton.dataset.revisado}/revisado`, {
        method: "POST",
        error: "No se pudo marcar."
      });
      await recargar();
    }
  });
}

export function pintarActividadCanal(lista, actividad) {
  lista.innerHTML = actividad.length
    ? actividad
        .map(
          (a) => `
      <li>
        <span class="tn-actividad-fecha">${esc(fechaHoraAR(a.fecha))}</span>
        <span class="${a.resultado === "error" ? "tn-actividad-error" : ""}">${esc(a.detalle)}</span>
      </li>`
        )
        .join("")
    : `<li><p class="tn-vacio">Sin actividad todavía.</p></li>`;
}
