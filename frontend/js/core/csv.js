/**
 * core/csv.js
 * Exportar a CSV lo que el usuario está viendo.
 * Movido tal cual desde app.js (CLAUDE.md §31, Etapa B / F2).
 */

import { avisar } from "./ui.js";
import { hoyISO } from "./formato.js";

/* ---------- Exportar a CSV ---------- */

// Utilitario transversal de tablas, hermano de crearFiltros: las dos
// responden a "cosas que le pasan a una tabla". Va acá arriba, antes de
// las secciones de vista que lo usan.
//
// Se genera en el navegador y no en el servidor a propósito: lo que hay que
// exportar es lo que el usuario ESTÁ VIENDO, y sus filtros viven solo acá.
// Un endpoint tendría que reimplementar en SQL los operadores de
// crearFiltros (incluidos los relativos, "este mes", "últimos 7 días") y los
// campos que el frontend calcula por su cuenta — el mismo motor duplicado en
// dos lenguajes, que es justo lo que el proyecto ya evitó para el filtrado.

// Excel no lee el separador del archivo: usa el "separador de listas" de la
// configuración regional de Windows. En español es ';', porque la coma es el
// separador decimal — un CSV con comas mete toda la fila en la columna A.
const SEPARADOR_CSV = ";";

// Sin BOM, Excel abre el archivo con el codepage ANSI y todo acento se rompe
// ("Devolución" → "DevoluciÃ³n"). Con "N°" y "×" en casi todas las tablas, el
// archivo sería ilegible. Va en el CONTENIDO, no alcanza con el MIME type.
const BOM_UTF8 = "﻿";

// Escapado RFC 4180: se entrecomilla si el valor trae el separador, comillas,
// saltos de línea o espacios en los bordes; las comillas internas se DUPLICAN
// (no se escapan con backslash). El caso real que esto resuelve es
// items_resumen, que viene del backend como "2 × Remera, 3 × Pantalón" — con
// comas adentro: sin comillas, cada venta se partiría en columnas de más.
function celdaCSV(valor) {
  if (valor === null || valor === undefined) return "";
  const texto = String(valor);
  const necesitaComillas =
    texto.includes(SEPARADOR_CSV) ||
    texto.includes('"') ||
    texto.includes("\n") ||
    texto.includes("\r") ||
    texto.trim() !== texto;
  return necesitaComillas ? `"${texto.replaceAll('"', '""')}"` : texto;
}

// columnas: [{ titulo, valor: (fila) => any }]
// filas: la lista YA filtrada y ordenada que la vista le pasó a su render*().
//
// Los números se exportan CRUDOS (1234.5), nunca por money(): un "$ 1.234,50"
// llega a Excel como texto y no se puede sumar, que es exactamente para lo que
// alguien exporta. El formato se aplica después, en la planilla.
export function descargarCSV(nombreArchivo, columnas, filas) {
  if (!filas.length) {
    avisar("No hay filas para exportar.", "atencion");
    return;
  }

  const lineas = [
    columnas.map((c) => celdaCSV(c.titulo)).join(SEPARADOR_CSV),
    ...filas.map((fila) => columnas.map((c) => celdaCSV(c.valor(fila))).join(SEPARADOR_CSV))
  ];
  // CRLF: lo que manda RFC 4180 y lo que espera Excel en Windows.
  const contenido = BOM_UTF8 + lineas.join("\r\n") + "\r\n";

  const url = URL.createObjectURL(new Blob([contenido], { type: "text/csv;charset=utf-8;" }));
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = `${nombreArchivo}-${hoyISO()}.csv`;
  // Firefox exige que el <a> esté en el documento para que el click descargue.
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  // Sin esto el Blob queda retenido hasta cerrar la pestaña: exportar veinte
  // veces en una sesión larga sería una fuga real.
  URL.revokeObjectURL(url);

  avisar(`Exportadas ${filas.length} ${filas.length === 1 ? "fila" : "filas"} a CSV.`, "ok");
}
