// Grados y cinturones (hist. §230, docs/investigaciones/investigacion-gymdesk.md):
// el cinturón de cada alumno en cada actividad, y cuándo está listo para el
// siguiente. En la pantalla las rayas se llaman "grados", como se dice en los
// dojos de acá (pedido del usuario); en el código siguen siendo rayas, y un
// "grado" del código (la tabla grados) es un cinturón de la lista. Cada grado de la lista es un cinturón con sus rayas; un alumno
// está en un cinturón y en una de sus rayas (0 = el cinturón liso). El paso
// siguiente es su próxima raya o, con todas, el próximo cinturón:
// - una raya pide las clases_raya de su cinturón;
// - un cinturón pide sus clases y sus meses con el anterior.
// Las clases se cuentan "en el grado" (desde el último paso, como Gymdesk); los
// meses, desde que tiene el cinturón (como la IBJJF).
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
export const MAX_MESES_GRADO = 240;
export const LARGO_NOMBRE_GRADO = 40;

// Para no arrancar de cero. Los meses son los mínimos de la IBJJF con el
// cinturón anterior; las clases las pone cada profe.
const cinturon = (nombre, color, rayas, extra = {}) => ({ nombre, color, color2: null, rayas, clases_raya: null, clases: null, meses: null, ...extra });
export const PLANTILLAS_GRADOS = {
  bjj: {
    nombre: "BJJ adultos",
    detalle: "Blanco, azul, violeta, marrón y negro, con 4 grados",
    grados: [
      cinturon("Blanco", "blanco", 4),
      cinturon("Azul", "azul", 4),
      cinturon("Violeta", "violeta", 4, { meses: 24 }),
      cinturon("Marrón", "marron", 4, { meses: 18 }),
      cinturon("Negro", "negro", 6, { meses: 12 })
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

// El paso que sigue a { grado_id, raya } en la lista de la actividad (todos
// sus grados, también los dados de baja, que siguen en el historial): su
// próxima raya, o el próximo cinturón activo. null = ya tiene el último.
export function proximoPaso(grados, actual) {
  if (!actual) return null;
  const grado = grados.find((g) => g.id === actual.grado_id);
  if (grado && actual.raya < grado.rayas) {
    return { grado_id: grado.id, raya: actual.raya + 1, clases: grado.clases_raya ?? null, meses: null };
  }
  const orden = grado?.orden ?? Infinity;
  const siguiente = grados.filter((g) => g.activo && g.orden > orden).sort((a, b) => a.orden - b.orden)[0];
  return siguiente ? { grado_id: siguiente.id, raya: 0, clases: siguiente.clases ?? null, meses: siguiente.meses ?? null } : null;
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
    const clasesRaya = entero(g.clases_raya, MAX_CLASES_GRADO);
    const clases = entero(g.clases, MAX_CLASES_GRADO);
    const meses = entero(g.meses, MAX_MESES_GRADO);
    if ([clasesRaya, clases].some(Number.isNaN)) return { error: `${cual}: las clases van de 1 a ${MAX_CLASES_GRADO}, o vacías.` };
    if (Number.isNaN(meses)) return { error: `${cual}: los meses van de 1 a ${MAX_MESES_GRADO}, o vacíos.` };
    const id = g.id == null || g.id === "" ? null : Number(g.id);
    if (id != null && !(Number.isInteger(id) && id > 0)) return { error: "La lista de cinturones no es válida." };
    grados.push({ id, nombre, color: g.color, color2, rayas, clases_raya: rayas > 0 ? clasesRaya : null, clases, meses, orden: i });
  }
  return { grados };
}
