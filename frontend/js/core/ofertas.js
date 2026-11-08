// Ofertas con vigencia (hist. §133): cuánto cuesta algo hoy, con las ofertas
// del negocio. Una oferta baja el precio de lista en un porcentaje, en pesos
// por unidad o a un precio fijo, sobre productos elegidos, categorías o todo
// el catálogo, en una lista o en todas. Vale entre dos fechas (la de fin es
// opcional), y si se quiere solo ciertos días de la semana o del mes. Con una
// cantidad mínima es una promoción por cantidad ("2 kg o más a $9.000 el
// kilo"); varias, con mínimos distintos, son los escalones.
//
// Las reglas: dos ofertas no se suman (gana la que deja el precio más bajo) y
// una que no baja el precio no se aplica.
//
// Puro, sin DOM: lo usan el punto de venta, el alta de venta, la página de
// ofertas y server.js, que con estas mismas reglas anota en cada renglón la
// oferta que se le aplicó. Las fechas son "AAAA-MM-DD" del día del negocio
// (fechaDeHoy en el servidor).

import { LOCALE } from "./idioma.js";

export const TIPOS_OFERTA = {
  porcentaje: "Un porcentaje menos",
  monto: "Un monto menos por unidad",
  precio: "A un precio fijo"
};
export const ALCANCES_OFERTA = {
  productos: "Productos elegidos",
  categorias: "Categorías",
  todo: "Todo el catálogo"
};
// 1 es lunes y 7 domingo, como en el calendario de acá.
export const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const DIAS_SEMANA_PLURAL = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"];

const redondear = (n) => Math.round(n * 100) / 100;
const pesos = (n) => n.toLocaleString(LOCALE, { style: "currency", currency: "ARS", currencyDisplay: "narrowSymbol", minimumFractionDigits: 0, maximumFractionDigits: 2 });
const numero = (n) => n.toLocaleString(LOCALE, { maximumFractionDigits: 3 });
const listar = (cosas) => (cosas.length === 1 ? cosas[0] : `${cosas.slice(0, -1).join(", ")} y ${cosas.at(-1)}`);
const fechaCorta = (iso) => iso.split("-").reverse().join("/");

// El día de la semana de una fecha, de 1 (lunes) a 7 (domingo).
export function diaDeLaSemana(fecha) {
  const [y, m, d] = fecha.split("-").map(Number);
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

// Si la oferta vale ese día: activa, dentro de sus fechas y en sus días.
export function ofertaVigente(oferta, fecha) {
  if (!oferta.activa) return false;
  if (fecha < oferta.desde) return false;
  if (oferta.hasta && fecha > oferta.hasta) return false;
  if (oferta.dias_semana?.length && !oferta.dias_semana.includes(diaDeLaSemana(fecha))) return false;
  if (oferta.dias_mes?.length && !oferta.dias_mes.includes(Number(fecha.slice(8, 10)))) return false;
  return true;
}

// Si la oferta toca este producto en esta lista. lista_id es la lista de la
// venta ya resuelta (sin lista, la predeterminada).
export function ofertaAlcanza(oferta, { producto_id, categoria_id, lista_id }) {
  if (oferta.lista_precio_id && Number(oferta.lista_precio_id) !== Number(lista_id)) return false;
  if (oferta.alcance === "todo") return true;
  if (oferta.alcance === "categorias") return categoria_id != null && oferta.categorias.includes(Number(categoria_id));
  return oferta.productos.includes(Number(producto_id));
}

// El precio por unidad con la oferta, o null si no lo baja.
export function precioConOferta(oferta, precioLista) {
  if (!(precioLista > 0)) return null;
  const precio = redondear(
    oferta.tipo === "porcentaje"
      ? precioLista * (1 - oferta.valor / 100)
      : oferta.tipo === "monto"
        ? precioLista - oferta.valor
        : oferta.valor
  );
  return precio >= 0 && precio < precioLista ? precio : null;
}

// La oferta que se aplica a un renglón, con su precio: { oferta, precio }, o
// null. renglon: { producto_id, categoria_id, lista_id, cantidad,
// precio_lista }. Entre las que valen, la del precio más bajo; si empatan, la
// más vieja (el id menor), así el servidor y la pantalla eligen la misma.
export function mejorOferta(ofertas, renglon, fecha) {
  let mejor = null;
  for (const oferta of ofertas) {
    if (!ofertaVigente(oferta, fecha) || !ofertaAlcanza(oferta, renglon)) continue;
    if (oferta.cantidad_minima && !(renglon.cantidad >= oferta.cantidad_minima - 1e-9)) continue;
    const precio = precioConOferta(oferta, renglon.precio_lista);
    if (precio === null) continue;
    if (!mejor || precio < mejor.precio || (precio === mejor.precio && oferta.id < mejor.oferta.id)) {
      mejor = { oferta, precio };
    }
  }
  return mejor;
}

// La promoción por cantidad que se gana llevando más: entre las que piden más
// de lo que tiene el renglón y bajan el precio que tiene hoy, la del mínimo
// más chico. Para anunciarla antes de pesar ("Desde 2 kg: $9.000 el kg").
export function proximaPromocion(ofertas, renglon, fecha) {
  const actual = mejorOferta(ofertas, renglon, fecha)?.precio ?? renglon.precio_lista;
  let proxima = null;
  for (const oferta of ofertas) {
    if (!oferta.cantidad_minima || renglon.cantidad >= oferta.cantidad_minima - 1e-9) continue;
    if (!ofertaVigente(oferta, fecha) || !ofertaAlcanza(oferta, renglon)) continue;
    const precio = precioConOferta(oferta, renglon.precio_lista);
    if (precio === null || precio >= actual) continue;
    if (!proxima || oferta.cantidad_minima < proxima.oferta.cantidad_minima) proxima = { oferta, precio };
  }
  return proxima;
}

// "20 % menos", "$ 500 menos", "A $ 9.000"; con mínimo, "… desde 2 kg".
export function describirOferta(oferta, unidad) {
  const cuanto =
    oferta.tipo === "porcentaje"
      ? `${numero(oferta.valor)} % menos`
      : oferta.tipo === "monto"
        ? `${pesos(oferta.valor)} menos`
        : `A ${pesos(oferta.valor)}`;
  if (!oferta.cantidad_minima) return cuanto;
  const medida = unidad && unidad !== "unidad" ? ` ${unidad}` : oferta.cantidad_minima === 1 ? " unidad" : " unidades";
  return `${cuanto} desde ${numero(oferta.cantidad_minima)}${medida}`;
}

// "Del 01/11/2026 al 30/11/2026, los martes y jueves", "Desde el
// 01/11/2026, los días 1 y 15 de cada mes".
export function describirVigencia(oferta) {
  const partes = [oferta.hasta ? `Del ${fechaCorta(oferta.desde)} al ${fechaCorta(oferta.hasta)}` : `Desde el ${fechaCorta(oferta.desde)}`];
  if (oferta.dias_semana?.length) partes.push(`los ${listar(oferta.dias_semana.map((d) => DIAS_SEMANA_PLURAL[d - 1]))}`);
  if (oferta.dias_mes?.length) {
    partes.push(`${oferta.dias_mes.length === 1 ? "el día" : "los días"} ${listar(oferta.dias_mes.map(String))} de cada mes`);
  }
  return partes.join(", ");
}

// En qué momento está: "vigente" (vale hoy), "hoy-no" (dentro de sus fechas,
// pero hoy no es uno de sus días), "proxima", "terminada" o "pausada".
export function estadoOferta(oferta, hoy) {
  if (!oferta.activa) return "pausada";
  if (oferta.hasta && hoy > oferta.hasta) return "terminada";
  if (hoy < oferta.desde) return "proxima";
  return ofertaVigente(oferta, hoy) ? "vigente" : "hoy-no";
}
