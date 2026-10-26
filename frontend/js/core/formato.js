/**
 * core/formato.js
 * Formato, rol y helpers de presentación compartidos por todas las vistas.
 * Movido tal cual desde app.js (CLAUDE.md §31, Etapa B / F2).
 */

import { icono } from "./iconos.js";

// Guarda contra `null`/`undefined`: con el filtrado de campos sensibles por
// rol (permisos por rol, backend/server.js) un empleado puede recibir un
// producto sin `precio_costo` o una venta sin `margen` — sin este chequeo
// `n.toLocaleString` explota adentro del template literal que arma la fila
// de la tabla, y la excepción se lleva puesto el render entero (no queda
// "vacío", no se dibuja nada). Con la guarda degrada a un guion.
export const money = (n) =>
  n == null
    ? "—"
    : n.toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });

export const numero = (n) => (n == null ? "—" : n.toLocaleString("es-AR"));

// Unidades en que se vende un producto (UNIDADES en server.js). Por kg, litro
// o metro la cantidad lleva decimales; por gramo o mililitro, no. Por hora es
// la de un servicio que se cobra por tiempo, y también admite 1,5.
export const UNIDADES = {
  unidad: "Unidad",
  kg: "Kilo (kg)",
  g: "Gramo (g)",
  l: "Litro (l)",
  ml: "Mililitro (ml)",
  m: "Metro (m)",
  hora: "Hora"
};
export const esFraccionable = (unidad) => unidad === "kg" || unidad === "l" || unidad === "m" || unidad === "hora";
const ABREVIATURAS = { hora: "h" };

// Una cantidad con su unidad: "3", "1,25 kg", "500 g", "1,5 h". Por unidad va
// el número solo, como hasta ahora.
export function cantidad(n, unidad) {
  if (n == null) return "—";
  const texto = n.toLocaleString("es-AR", { maximumFractionDigits: 3 });
  return !unidad || unidad === "unidad" ? texto : `${texto} ${ABREVIATURAS[unidad] ?? unidad}`;
}

// Cuánto tarda un servicio, en minutos: "45 min", "2 h", "1 h 30 min".
export function duracion(minutos) {
  if (!minutos) return "—";
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas === 0) return `${resto} min`;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

// sesion.js escribe data-rol en <html> antes de inyectar este archivo (ver
// escribirDatosUsuario en sesion.js), así que ya está disponible en la
// primera línea que corre acá. Es la misma fuente que ya usa styles.css
// (:root:not([data-rol="admin"])) para esconder por CSS — esta función es
// el equivalente en JS, para las decisiones que no se pueden resolver con
// una regla de CSS (no hacer el fetch, no emitir el link, elegir la vista
// de fallback).
export const esAdmin = () => document.documentElement.dataset.rol === "admin";

// Los CSV son datos armados en JS, no DOM: `.col-admin` no les sirve. Las
// columnas de costo/margen de un array COLUMNAS_CSV_X se marcan con
// `admin: true`, y esto filtra esa marca al momento de exportar (no antes:
// el rol puede no estar listo todavía si se evaluara al definir el array a
// nivel de módulo). Sin este filtro un empleado se exporta una columna con
// el valor real igual — el filtrado del backend (permisos por rol) no
// interviene acá porque el array ya vive en el objeto que llegó por fetch.
export const columnasVisibles = (columnas) => (esAdmin() ? columnas : columnas.filter((c) => !c.admin));

export const hoyISO = () => new Date().toLocaleDateString("sv-SE"); // formato AAAA-MM-DD, para <input type="date">

// Fecha para mostrar en pantalla y en comprobantes: dd/mm/aaaa, el formato
// de Argentina. La API, los <input type="date"> y los CSV siguen en ISO. De
// un "AAAA-MM-DD hh:mm:ss" toma solo la fecha; lo que no empieza con una
// fecha ISO vuelve tal cual, y null/undefined como "".
export function fechaAR(valor) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor ?? "");
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : (valor ?? "");
}

// Fecha y hora de un momento que el backend guardó con datetime('now'):
// "AAAA-MM-DD hh:mm:ss" en UTC y sin zona. Se muestra en la hora local del
// navegador como "dd/mm/aaaa hh:mm"; lo que no tenga ese formato pasa por
// fechaAR().
export function fechaHoraAR(valor) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(valor ?? "");
  if (!partes) return fechaAR(valor);
  const d = new Date(Date.UTC(partes[1], partes[2] - 1, partes[3], partes[4], partes[5]));
  const dos = (n) => String(n).padStart(2, "0");
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

// Versión abreviada de money(), para las etiquetas del eje del gráfico de
// evolución: "$450.000,00" no entra en la canaleta angosta del eje.
// Conserva el signo, y un decimal en miles: con marcas cada $500, redondear
// a miles enteros escribía "$2k" en la de $1.500.
export function moneyCorto(n) {
  const signo = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const corto = (v) => v.toLocaleString("es-AR", { maximumFractionDigits: 1 });
  if (abs >= 1e6) return `${signo}$${corto(abs / 1e6)}M`;
  if (abs >= 1e3) return `${signo}$${corto(abs / 1e3)}k`;
  return `${signo}$${Math.round(abs)}`;
}

// Íconos de las acciones de fila, del sprite de core/iconos.js.
export const ICONO_TACHO = icono("trash-2");

const ICONO_LAPIZ = icono("pencil");

// Botón de editar que va en una fila de tabla. Se usa igual en Productos,
// Clientes y Proveedores para que sea una sola convención: el click en la
// fila abre la ficha completa, el lápiz va directo al modal de edición.
export const botonEditarFila = (clase, id, que) =>
  `<button type="button" class="btn-icon ${clase}" data-id="${id}" title="Editar ${que}" aria-label="Editar ${que}">${ICONO_LAPIZ}</button>`;

// Escapa todo dato que se interpola en un template que termina en innerHTML.
// Los datos vienen de la base (nombres de cliente, productos, notas) y los
// carga cualquier usuario de la empresa: sin esto, un nombre como
// `<img src=x onerror=…>` ejecuta código en la sesión de quien lo mire.
// Sirve igual dentro de un atributo (value="…", title="…"), por eso escapa
// también las dos comillas. backend/test/frontend-modulos.test.js falla si
// un campo de un objeto se interpola en HTML sin pasar por acá.
export function esc(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// La segunda línea de una fila en el celular (hist. §96): los datos que en la
// compu son columnas aparte, unidos por " · ". Va como una celda más del <tr>,
// que en la compu no se ve (.m-sub en styles.css); en una tabla .lista-movil
// el celular muestra solo las celdas marcadas (m-titulo, m-valor, m-estado,
// m-accion y esta). Una parte puede ser [prefijo, valor] ("vence" y la fecha):
// sale "vence 12/11", o nada si el valor está vacío. Lo vacío se saltea, y
// cada parte se escapa.
export function celdaMovil(...partes) {
  const vacio = (v) => v == null || v === "" || v === "—";
  const texto = partes
    .map((p) => (Array.isArray(p) ? (vacio(p[1]) ? null : `${p[0]} ${p[1]}`) : p))
    .filter((p) => !vacio(p))
    .map(esc)
    .join(" · ");
  return `<td class="m-sub">${texto}</td>`;
}

// Marca un valor de camposFicha() como HTML ya armado (un badge): se
// imprime tal cual, así que quien lo arma escapa lo que lleva adentro.
export const html = (s) => ({ html: s });

// Badge de estado (.status) para una ficha: el texto se escapa acá. Sin
// clase queda gris, para lo que no es ni bueno ni urgente (un borrador).
export const badge = (clase, texto) => html(`<span class="status ${clase ?? ""}">${esc(texto)}</span>`);

// Los datos de una ficha (<dl class="ficha-datos">) desde pares
// [etiqueta, valor]. Todo valor se escapa salvo el envuelto en html(), y
// uno vacío se muestra como "—". Antes cada ficha repetía este map.
// (El test de escape no ve `dd`: es la excepción documentada en el
// handoff, y acá todo lo que no viene marcado con html() pasa por esc().)
export const camposFicha = (campos) =>
  campos
    .map(([etiqueta, valor]) => {
      const dd = valor?.html ?? esc(valor || "—");
      return `<div><dt>${etiqueta}</dt><dd>${dd}</dd></div>`;
    })
    .join("");
