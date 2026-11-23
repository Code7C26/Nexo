// Puntos y premios (hist. §223, docs/investigaciones/investigacion-puntos.md):
// el programa de fidelidad del negocio. Un punto cada $ X de lo que el cliente
// pagó, con la regla y el vencimiento congelados en cada venta (como Square:
// cambiar la regla vale para lo que viene). Los puntos no son un contador: el
// saldo sale de las ventas y de los canjes y ajustes (puntos_movimientos), así
// que anular una venta los saca y devuelve lo canjeado en ella, sin más.
//
// Puro, sin DOM: lo usan el mostrador y la página de puntos, para mostrarlo, y
// server.js, que con estas mismas reglas valida y guarda.

import { aplicarDescuento } from "./descuento.js";
import { LOCALE } from "./idioma.js";

export const TIPOS_PREMIO = {
  porcentaje: "Un porcentaje de descuento",
  monto: "Un monto de descuento",
  producto: "Un producto de regalo"
};
export const MAX_PUNTOS = 1_000_000;
export const MAX_MESES_VENCIMIENTO = 60;

const redondear = (n) => Math.round(n * 100) / 100;
const pesos = (n) =>
  n.toLocaleString(LOCALE, { style: "currency", currency: "ARS", currencyDisplay: "narrowSymbol", minimumFractionDigits: 0, maximumFractionDigits: 2 });
const numero = (n) => n.toLocaleString(LOCALE, { maximumFractionDigits: 2 });

// Los puntos que da una venta: lo cobrado (sin lo devuelto) dividido la regla
// de ese día. Lo que quedó fiado suma cuando se paga. El centavo de más que
// deja una suma de decimales no le saca un punto a nadie.
export function puntosDeLaVenta(pagado, puntosCada) {
  if (!(puntosCada > 0) || !(pagado > 0)) return 0;
  return Math.floor(pagado / puntosCada + 1e-9);
}

// La fecha en que vencen los puntos ganados un día, a tantos meses (el mismo
// día del mes, o el último si ese mes es más corto). Sin meses, no vencen.
export function venceDe(fecha, meses) {
  if (!meses) return null;
  const [y, m, d] = fecha.slice(0, 10).split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m - 1 + meses + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + meses, Math.min(d, ultimo))).toISOString().slice(0, 10);
}

// El saldo de un cliente a una fecha. eventos: [{ fecha, puntos, vence }]: los
// positivos son lo ganado (una venta, un ajuste a favor) y vencen el día
// `vence` (null, nunca); los negativos, lo usado (un canje, un ajuste en
// contra). Se recorren por fecha; lo usado gasta primero lo que vence antes,
// como Square, y lo que se usó de más (una venta anulada después de canjear
// sus puntos) queda como deuda que pagan los puntos que vienen.
// Devuelve { saldo, vencidos, proximo: { fecha, puntos } | null }.
export function saldoDePuntos(eventos, hoy) {
  const ordenados = eventos
    .filter((e) => e.puntos)
    .map((e) => ({ ...e, fecha: e.fecha.slice(0, 10) }))
    // El mismo día, primero lo ganado.
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || b.puntos - a.puntos);
  let bolsas = []; // [{ puntos, vence }]
  let deuda = 0;
  let vencidos = 0;
  const vencerHasta = (dia) => {
    bolsas = bolsas.filter((b) => {
      if (b.vence && b.vence <= dia) {
        vencidos += b.puntos;
        return false;
      }
      return true;
    });
  };
  for (const e of ordenados) {
    vencerHasta(e.fecha);
    if (e.puntos > 0) {
      const paga = Math.min(deuda, e.puntos);
      deuda -= paga;
      if (e.puntos > paga) bolsas.push({ puntos: e.puntos - paga, vence: e.vence ?? null });
      continue;
    }
    let falta = -e.puntos;
    bolsas.sort((a, b) => (a.vence ?? "9999").localeCompare(b.vence ?? "9999"));
    for (const b of bolsas) {
      const usa = Math.min(b.puntos, falta);
      b.puntos -= usa;
      falta -= usa;
      if (falta === 0) break;
    }
    bolsas = bolsas.filter((b) => b.puntos > 0);
    deuda += falta;
  }
  vencerHasta(hoy);
  const conVencimiento = bolsas.filter((b) => b.vence).sort((a, b) => a.vence.localeCompare(b.vence));
  const proximo = conVencimiento.length
    ? {
        fecha: conVencimiento[0].vence,
        puntos: conVencimiento.filter((b) => b.vence === conVencimiento[0].vence).reduce((acc, b) => acc + b.puntos, 0)
      }
    : null;
  return { saldo: bolsas.reduce((acc, b) => acc + b.puntos, 0) - deuda, vencidos, proximo };
}

// "10 % de descuento", "$ 5.000 de descuento", "Alfajor de regalo".
export function describirPremio(premio, nombreProducto) {
  if (premio.tipo === "porcentaje") return `${numero(premio.valor)} % de descuento`;
  if (premio.tipo === "monto") return `${pesos(premio.valor)} de descuento`;
  return `${nombreProducto ?? "Un producto"} de regalo`;
}

// "1.250 puntos", "1 punto".
export const textoPuntos = (n) => `${n.toLocaleString(LOCALE)} ${Math.abs(n) === 1 ? "punto" : "puntos"}`;

// Los premios de descuento de una venta, uno detrás del otro, sobre los
// precios de cada renglón (con el mismo reparto que el descuento a mano,
// core/descuento.js). El descuento a mano, si hay, va después, sobre lo que
// queda. renglones: [{ cantidad, precio }]. premios: los de descuento, en el
// orden en que se canjearon.
// Devuelve { error } o { renglones: [{ precio, descuento }], montos: [n] }.
export function aplicarPremios(renglones, premios) {
  let actuales = renglones.map((r) => ({ cantidad: r.cantidad, precio: r.precio }));
  const montos = [];
  for (const premio of premios) {
    const subtotal = redondear(actuales.reduce((acc, r) => acc + r.cantidad * r.precio, 0));
    if (premio.tipo === "monto" && premio.valor > subtotal + 0.005) {
      return { error: `El premio "${premio.nombre}" es de ${pesos(premio.valor)} y la venta es de ${pesos(subtotal)}: sumá algo más o elegí otro.` };
    }
    const con = aplicarDescuento(actuales, { tipo: premio.tipo, valor: premio.valor });
    if (con.error) return { error: con.error };
    actuales = actuales.map((r, i) => ({ cantidad: r.cantidad, precio: con.renglones[i].precio }));
    montos.push(con.monto);
  }
  return {
    renglones: actuales.map((r, i) => ({ precio: r.precio, descuento: redondear(renglones[i].precio - r.precio) })),
    montos
  };
}
