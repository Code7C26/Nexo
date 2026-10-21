// "Hoy" para todo el backend (hist. §81): el día en la zona horaria del
// negocio, no el de UTC ni el del servidor. Con date('now') de SQLite, que es
// UTC, desde las 21 h de la Argentina una venta quedaba con la fecha del día
// siguiente; y un hosting en la nube corre en UTC. La zona se fija acá, con
// Intl, que la respeta igual en Windows y en Linux (la variable TZ, no: Node
// en Windows la ignora).
//
// NEXO_ZONA_HORARIA la cambia (un nombre IANA, ej. "America/Montevideo"). Una
// zona que no existe corta el arranque, en vez de fechar mal cada operación.
//
// No importa la base: lo usa también interprete.js, que nunca la toca.

export const ZONA_HORARIA = process.env.NEXO_ZONA_HORARIA || 'America/Argentina/Buenos_Aires';

try {
  new Intl.DateTimeFormat('en-US', { timeZone: ZONA_HORARIA });
} catch {
  throw new Error(`NEXO_ZONA_HORARIA="${ZONA_HORARIA}" no es una zona horaria válida (ej. America/Argentina/Buenos_Aires).`);
}

// AAAA-MM-DD del día de hoy en la zona del negocio.
export const fechaDeHoy = () => new Date().toLocaleDateString('sv-SE', { timeZone: ZONA_HORARIA });

// El instante UTC ("AAAA-MM-DD HH:MM:SS", como datetime('now')) en que empezó
// hoy en la zona del negocio: para comparar contra las columnas que guardan la
// hora en UTC (ingresos, auditoría).
export function inicioDeHoyUTC() {
  const ahora = new Date();
  const desfase = new Intl.DateTimeFormat('en-US', { timeZone: ZONA_HORARIA, timeZoneName: 'longOffset' })
    .formatToParts(ahora)
    .find((p) => p.type === 'timeZoneName').value; // "GMT-03:00", o "GMT" a secas
  const [, signo = '+', horas = '0', minutos = '0'] = /GMT([+-])?(\d{2})?:?(\d{2})?/.exec(desfase);
  const minutosDesfase = (signo === '-' ? -1 : 1) * (Number(horas) * 60 + Number(minutos));
  const [y, m, d] = fechaDeHoy().split('-').map(Number);
  const inicio = new Date(Date.UTC(y, m - 1, d) - minutosDesfase * 60000);
  return inicio.toISOString().slice(0, 19).replace('T', ' ');
}
