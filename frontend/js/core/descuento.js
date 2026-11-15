// El descuento a mano del mostrador (hist. §175): un porcentaje o un monto
// sobre toda la venta, sin armar una oferta ("a mi hermano le hago 10 %").
// Se reparte entre los renglones según su valor, como el envío de una compra
// (CLAUDE.md §7), y queda en el precio de cada uno: el total, el IVA, el margen
// y la factura ya lo cuentan solos. Cada renglón dice también cuánto se le
// bajó por unidad, que es lo que se guarda en venta_items.descuento.
//
// Puro, sin DOM: lo usan el punto de venta, para mostrarlo, y server.js, que
// con estas mismas reglas arma los precios que se guardan.

export const TIPOS_DESCUENTO = ["porcentaje", "monto"];

const redondear = (n) => Math.round(n * 100) / 100;
const valorDe = (renglones, precios) => redondear(renglones.reduce((acc, r, i) => acc + r.cantidad * precios[i], 0));

// renglones: [{ cantidad, precio }], con el precio que se cobraría sin el
// descuento (el de lista o el de la oferta). descuento: { tipo, valor } o null.
// Devuelve { error } o { renglones: [{ precio, descuento }], monto }.
export function aplicarDescuento(renglones, descuento) {
  const sin = renglones.map((r) => r.precio);
  if (!descuento) return { renglones: sin.map((precio) => ({ precio, descuento: 0 })), monto: 0 };
  if (!TIPOS_DESCUENTO.includes(descuento.tipo)) return { error: "El descuento tiene que ser un porcentaje o un monto." };
  const valor = Number(descuento.valor);
  if (!Number.isFinite(valor) || valor <= 0) return { error: "El descuento tiene que ser mayor a 0." };
  const subtotal = valorDe(renglones, sin);
  if (!(subtotal > 0)) return { error: "No hay nada a qué hacerle descuento." };
  if (descuento.tipo === "porcentaje" && valor > 100) return { error: "El descuento no puede pasar del 100 %." };
  if (descuento.tipo === "monto" && valor > subtotal + 0.005) return { error: "El descuento no puede pasar del total de la venta." };

  const monto = descuento.tipo === "porcentaje" ? redondear((subtotal * valor) / 100) : redondear(Math.min(valor, subtotal));
  const factor = 1 - monto / subtotal;
  const precios = sin.map((p) => redondear(p * factor));
  // Lo que el redondeo deja de más o de menos lo absorbe un renglón: uno de
  // una sola unidad si hay (ahí cierra al centavo), y si no, el de más valor.
  const diferencia = redondear(subtotal - monto - valorDe(renglones, precios));
  if (Math.abs(diferencia) >= 0.005) {
    const porValor = renglones.map((r, i) => i).sort((a, b) => renglones[b].cantidad * sin[b] - renglones[a].cantidad * sin[a]);
    const i = porValor.find((j) => renglones[j].cantidad === 1) ?? porValor[0];
    precios[i] = Math.max(0, redondear(precios[i] + diferencia / renglones[i].cantidad));
  }
  return {
    renglones: precios.map((precio, i) => ({ precio, descuento: redondear(sin[i] - precio) })),
    monto: redondear(subtotal - valorDe(renglones, precios))
  };
}
