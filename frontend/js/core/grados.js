// Grados y cinturones (hist. §230, docs/investigaciones/investigacion-gymdesk.md):
// el cinturón de cada alumno en cada actividad, y cuándo está listo para el
// siguiente. En la pantalla las rayas se llaman "grados", como se dice en los
// dojos de acá (pedido del usuario); en el código siguen siendo rayas, y un
// "grado" del código (la tabla grados) es un cinturón de la lista. Cada grado de la lista es un cinturón con sus rayas; un alumno
// está en un cinturón y en una de sus rayas (0 = el cinturón liso). El paso
// siguiente es su próxima raya o, con todas, el próximo cinturón.
//
// Lo que pide cada paso lo dice el cinturón en el que está el alumno, de una
// de dos formas (hist. §234, pedido del usuario):
// - por clases: las clases que se pasa en ese cinturón, de recibirlo al
//   siguiente (clases_cinturon), repartidas parejo entre sus pasos: sus rayas
//   y el salto al siguiente cinturón (el último cinturón no salta);
// - por tiempo: cada cuántos meses, un paso (meses_paso), o un tiempo para
//   cada paso (meses_pasos, hist. §235): el negro de BJJ, cada 3 años hasta el
//   4.º grado y cada 5 desde el 5.º.
// Las clases y los meses se cuentan "en el grado", desde el último paso (como
// Gymdesk).
//
// Puro, sin DOM: lo usan la página de grados y la ficha del socio, para
// mostrarlo, y server.js, que con estas mismas reglas valida y arma la lista
// de los que están listos.

export const COLORES_CINTURON = {
  blanco: "Blanco",
  gris: "Gris",
  amarillo: "Amarillo",
  naranja: "Naranja",
  verde: "Verde",
  azul: "Azul",
  violeta: "Violeta",
  marron: "Marrón",
  negro: "Negro",
  rojo: "Rojo"
};
export const MAX_GRADOS = 40;
export const MAX_RAYAS = 10;
export const MAX_CLASES_GRADO = 2000;
export const MAX_CLASES_CINTURON = 5000;
export const MAX_MESES_GRADO = 240;
export const LARGO_NOMBRE_GRADO = 40;
export const FORMAS_DE_SUBIR = { clases: "Por clases", tiempo: "Por tiempo" };

// Para no arrancar de cero. Las clases las pone cada profe; el negro de BJJ va
// por tiempo, un grado cada 3 años (como lo da la IBJJF del 1.º al 3.º).
const cinturon = (nombre, color, rayas, extra = {}) => ({ nombre, color, color2: null, rayas, por: "clases", clases_cinturon: null, meses_paso: null, meses_pasos: null, ...extra });
export const PLANTILLAS_GRADOS = {
  bjj: {
    nombre: "BJJ adultos",
    detalle: "Blanco, azul, violeta, marrón y negro, con 4 grados",
    grados: [
      cinturon("Blanco", "blanco", 4),
      cinturon("Azul", "azul", 4),
      cinturon("Violeta", "violeta", 4),
      cinturon("Marrón", "marron", 4),
      cinturon("Negro", "negro", 6, { por: "tiempo", meses_pasos: [36, 36, 36, 36, 60, 60] })
    ]
  },
  bjj_chicos: {
    nombre: "BJJ chicos",
    detalle: "Blanco, gris, amarillo, naranja y verde, cada uno con sus franjas",
    grados: [
      cinturon("Blanco", "blanco", 4),
      ...["gris", "amarillo", "naranja", "verde"].flatMap((color) => [
        cinturon(`${COLORES_CINTURON[color]} y blanco`, color, 4, { color2: "blanco" }),
        cinturon(COLORES_CINTURON[color], color, 4),
        cinturon(`${COLORES_CINTURON[color]} y negro`, color, 4, { color2: "negro" })
      ])
    ]
  },
  kyu: {
    nombre: "Judo o karate",
    detalle: "Blanco, amarillo, naranja, verde, azul, marrón y negro",
    grados: ["blanco", "amarillo", "naranja", "verde", "azul", "marron", "negro"].map((color) => cinturon(COLORES_CINTURON[color], color, 0))
  }
};

// "Azul" o "Azul · 2 grados" (las rayas, en la pantalla, son grados).
export function nombreDelPaso(grado, raya = 0) {
  if (!grado) return "";
  return raya > 0 ? `${grado.nombre} · ${raya} ${raya === 1 ? "grado" : "grados"}` : grado.nombre;
}

// Los pasos de un cinturón: sus rayas, y el salto al siguiente si hay uno.
export const pasosDelCinturon = (grado, haySiguiente) => (grado?.rayas ?? 0) + (haySiguiente ? 1 : 0);

// Las clases del paso n (de 1 a pasos) al repartir total parejo: si no da
// justo, unos piden una más, y entre todos suman el total.
export const clasesDelPaso = (total, pasos, n) => Math.round((total * n) / pasos) - Math.round((total * (n - 1)) / pasos);

// El tiempo de cada paso, si es distinto en cada uno: la base lo guarda como
// "36 36 60" y la pantalla lo manda como lista. null = el mismo para todos.
export function mesesDeCadaPaso(valor) {
  if (valor == null || valor === "") return null;
  const lista = Array.isArray(valor) ? valor : String(valor).split(" ");
  return lista.map((m) => (m == null || m === "" ? null : Number(m)));
}

// Lo que pide el paso n de un cinturón: { clases, meses }, null lo que no pide.
function loQuePide(grado, n, haySiguiente) {
  if (!grado) return { clases: null, meses: null };
  if (grado.por === "tiempo") {
    const cada = mesesDeCadaPaso(grado.meses_pasos);
    return { clases: null, meses: (cada ? cada[n - 1] : grado.meses_paso) ?? null };
  }
  const pasos = pasosDelCinturon(grado, haySiguiente);
  return { clases: grado.clases_cinturon && pasos ? clasesDelPaso(grado.clases_cinturon, pasos, n) : null, meses: null };
}

// El paso que sigue a { grado_id, raya } en la lista de la actividad (todos
// sus grados, también los dados de baja, que siguen en el historial): su
// próxima raya, o el próximo cinturón activo, con lo que pide el cinturón de
// hoy. null = ya tiene el último.
export function proximoPaso(grados, actual) {
  if (!actual) return null;
  const grado = grados.find((g) => g.id === actual.grado_id);
  const orden = grado?.orden ?? Infinity;
  const siguiente = grados.filter((g) => g.activo && g.orden > orden).sort((a, b) => a.orden - b.orden)[0];
  const pide = loQuePide(grado, actual.raya + 1, Boolean(siguiente));
  if (grado && actual.raya < grado.rayas) return { grado_id: grado.id, raya: actual.raya + 1, ...pide };
  return siguiente ? { grado_id: siguiente.id, raya: 0, ...pide } : null;
}

// Los meses enteros entre dos fechas AAAA-MM-DD (del 3 de marzo al 2 de abril
// todavía no es uno).
export function mesesEntre(desde, hasta) {
  if (!desde || !hasta || hasta < desde) return 0;
  const [y1, m1, d1] = desde.slice(0, 10).split("-").map(Number);
  const [y2, m2, d2] = hasta.slice(0, 10).split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
}

// Desde cuándo tiene el cinturón de hoy: el primer paso de la tirada final con
// ese mismo cinturón (las rayas no lo cambian). historial: de un alumno en una
// actividad, del más viejo al más nuevo.
export function desdeElCinturon(historial) {
  if (!historial.length) return null;
  const { grado_id: actual } = historial.at(-1);
  let desde = historial.at(-1).fecha;
  for (let i = historial.length - 1; i >= 0 && historial[i].grado_id === actual; i--) desde = historial[i].fecha;
  return desde;
}

// Listo para el paso que sigue: pide algo, y ya llegó a todo lo que pide. Un
// paso que no pide nada lo decide el profe a ojo, y no avisa.
export function estaListo(paso, clases, meses) {
  if (!paso || (paso.clases == null && paso.meses == null)) return false;
  return (paso.clases == null || clases >= paso.clases) && (paso.meses == null || meses >= paso.meses);
}

const numeroConPuntos = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const entero = (valor, max) => {
  if (valor == null || valor === "") return null;
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 && n <= max ? n : NaN;
};

// La lista que arma el profe, en su orden. Devuelve { error } o { grados } con
// lo que se guarda (el id del que ya estaba, si viene).
export function revisarGrados(lista) {
  if (!Array.isArray(lista)) return { error: "La lista de cinturones no es válida." };
  if (lista.length > MAX_GRADOS) return { error: `Una actividad puede tener hasta ${MAX_GRADOS} cinturones.` };
  const grados = [];
  const nombres = new Set();
  for (const [i, g] of lista.entries()) {
    const nombre = typeof g?.nombre === "string" ? g.nombre.trim() : "";
    const cual = nombre || `El cinturón ${i + 1}`;
    if (!nombre) return { error: `${cual} necesita un nombre.` };
    if (nombre.length > LARGO_NOMBRE_GRADO) return { error: `${cual}: el nombre puede tener hasta ${LARGO_NOMBRE_GRADO} letras.` };
    if (nombres.has(nombre.toLowerCase())) return { error: `"${nombre}" está dos veces.` };
    nombres.add(nombre.toLowerCase());
    if (!Object.hasOwn(COLORES_CINTURON, g.color ?? "")) return { error: `${cual}: elegí el color.` };
    const color2 = g.color2 == null || g.color2 === "" ? null : g.color2;
    if (color2 != null && (!Object.hasOwn(COLORES_CINTURON, color2) || color2 === g.color)) return { error: `${cual}: la franja del medio no es válida.` };
    const rayas = g.rayas == null || g.rayas === "" ? 0 : Number(g.rayas);
    if (!Number.isInteger(rayas) || rayas < 0 || rayas > MAX_RAYAS) return { error: `${cual}: puede tener de 0 a ${MAX_RAYAS} grados.` };
    const por = g.por == null || g.por === "" ? "clases" : g.por;
    if (!Object.hasOwn(FORMAS_DE_SUBIR, por)) return { error: `${cual}: elegí si sube por clases o por tiempo.` };
    // El último no salta a ningún otro: sin grados, no pide nada.
    const pasos = pasosDelCinturon({ rayas }, i < lista.length - 1);
    const clases = por === "clases" && pasos ? entero(g.clases_cinturon, MAX_CLASES_CINTURON) : null;
    const meses = por === "tiempo" && pasos ? entero(g.meses_paso, MAX_MESES_GRADO) : null;
    if (Number.isNaN(clases)) return { error: `${cual}: las clases van de 1 a ${numeroConPuntos(MAX_CLASES_CINTURON)}, o vacías.` };
    if (clases != null && clases < pasos) return { error: `${cual}: son ${pasos} pasos, así que pide al menos ${pasos} clases.` };
    if (Number.isNaN(meses)) return { error: `${cual}: el tiempo va de 1 mes a ${MAX_MESES_GRADO / 12} años, o vacío.` };
    // Un tiempo para cada paso: uno por paso, en orden.
    let cada = por === "tiempo" && pasos ? mesesDeCadaPaso(g.meses_pasos) : null;
    if (cada) {
      if (cada.length !== pasos) return { error: `${cual}: poné el tiempo de cada uno de sus ${pasos} pasos.` };
      cada = cada.map((m) => entero(m, MAX_MESES_GRADO));
      if (cada.some(Number.isNaN)) return { error: `${cual}: el tiempo va de 1 mes a ${MAX_MESES_GRADO / 12} años, o vacío.` };
      if (cada.every((m) => m == null)) cada = null;
    }
    const id = g.id == null || g.id === "" ? null : Number(g.id);
    if (id != null && !(Number.isInteger(id) && id > 0)) return { error: "La lista de cinturones no es válida." };
    grados.push({ id, nombre, color: g.color, color2, rayas, por, clases_cinturon: clases, meses_paso: cada ? null : meses, meses_pasos: cada, orden: i });
  }
  return { grados };
}
