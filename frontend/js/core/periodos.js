/**
 * core/periodos.js
 * Los períodos rápidos de las páginas de números (el Resumen, Venta online;
 * hist. §136-§138): hoy, los últimos 7 o 30 días, este mes, este año o todo.
 */

// El rango de un período, en la zona del navegador (es la del negocio para
// quien lo usa). "Este mes" y "Este año" van hasta hoy: un gráfico por día con
// el resto del mes en cero diría que las ventas se cayeron. "Todo" no pone
// límites: el servidor arranca en la primera operación.
export function rangoDePeriodo(periodo) {
  const iso = (d) => d.toLocaleDateString("sv-SE");
  const hoy = new Date();
  const hace = (dias) => {
    const d = new Date(hoy);
    d.setDate(d.getDate() - dias);
    return iso(d);
  };
  switch (periodo) {
    case "hoy":
      return { desde: iso(hoy), hasta: iso(hoy) };
    case "7":
      return { desde: hace(6), hasta: iso(hoy) };
    case "mes":
      return { desde: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: iso(hoy) };
    case "anio":
      return { desde: `${hoy.getFullYear()}-01-01`, hasta: iso(hoy) };
    case "todo":
      return {};
    default:
      return { desde: hace(29), hasta: iso(hoy) };
  }
}
