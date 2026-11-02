/**
 * core/buscar-ayuda.js
 * La búsqueda del manual (core/manual.js) y qué hacer con cada frase del
 * asistente (hist. §118). Todo corre en el navegador, sin red: una pregunta
 * sobre cómo se usa Nexo se responde con el manual y no gasta la IA, que
 * queda para cargar operaciones. Sin DOM, para poder probarlo con node:test.
 *
 * Búsqueda: cada palabra se lleva a una raíz (familias como vendí/venta/
 * vender a "vend", el resto a sus primeras letras) y cada sección suma por
 * las raíces que comparte con la pregunta: más si están en su título, sus
 * preguntas y sus palabras que solo en el texto, y más las raras que las
 * comunes. Una palabra que el manual no tiene pesa mucho: "¿cómo funciona la
 * bicicleta?" no puede contestarse con la sección que dice "funciona".
 */

import { SECCIONES } from "./manual.js";

export const normalizar = (texto) =>
  String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim();

// Palabras que no dicen de qué se trata la pregunta.
const VACIAS = new Set(
  ("a al algo alguien ante antes aca alla asi aun bien cada como con cual cuales cuando de del desde donde " +
    "e el ella ellos en entre era es esa ese eso esta este esto estoy fue ha hace hacer hacen hago hay " +
    "la las le les lo los mas me mi mis mucho muy necesito ni no nos o otra otro para pero poco por porque " +
    "puede puedo pueden que quien quiero se ser si sin sobre su sus te tengo ti tiene tu tus un una uno unos " +
    "unas y ya yo nexo sistema forma manera tener tenes vos podes deberia quisiera saber ayuda ayudame " +
    "explicame decime necesitaria hola che manana tarde noche ahora despues siempre dia")
    .split(" ")
);

// Familias que comparten raíz aunque se escriban distinto. La primera que
// coincide gana.
const FAMILIAS = [
  [/^(vend|vent)/, "vend"],
  [/^compr/, "compr"],
  [/^cobr/, "cobr"],
  [/^pag/, "pag"],
  [/^factur/, "factur"],
  [/^(presupuest|cotiz)/, "presup"],
  [/^(devol|devuel|devolv|reintegr)/, "devol"],
  [/^(anul|borr|elimin|cancel|deshac)/, "anul"],
  [/^(stock|inventari|existenc|mercaderi)/, "stock"],
  [/^(product|articul)/, "product"],
  [/^client/, "client"],
  [/^proveed/, "proveed"],
  [/^(contrasen|clave|password)/, "clave"],
  [/^(imprim|pdf)/, "imprim"],
  [/^(arca|afip|cae)$/, "arca"],
  [/^(emplead|usuari|invit|equipo)/, "usuari"],
  [/^gast/, "gast"],
  [/^(cuot|abono)/, "cuot"],
  [/^(celul|telefon|movil|android|iphone)/, "celul"],
  [/^(ganan|gane|margen|rentab|resultad)/, "ganan"],
  [/^(debe|debo|deud|fiad)/, "deud"],
  [/^(dict|habl|voz|microf|audio)/, "voz"]
];

export function raiz(palabra) {
  for (const [patron, familia] of FAMILIAS) if (patron.test(palabra)) return familia;
  return palabra.length > 5 ? palabra.slice(0, 5) : palabra;
}

export const raices = (texto) =>
  normalizar(texto)
    .split(" ")
    .filter((p) => p && !VACIAS.has(p))
    .map(raiz);

// Cuánto pesa una raíz según dónde aparece en la sección.
const PESOS = { titulo: 3, preguntas: 3, palabras: 2, texto: 1 };

const textoDeBloques = (bloques) =>
  bloques.map((b) => (typeof b === "string" ? b : (b.pasos ?? b.lista ?? [b.nota]).join(" "))).join(" ");

function indexar(secciones) {
  const indice = secciones.map((seccion) => {
    const pesos = new Map();
    // Cada campo suma una vez por raíz: estar en el título y en las preguntas
    // pesa más que estar en uno solo.
    const sumar = (texto, peso) => {
      for (const r of new Set(raices(texto))) pesos.set(r, (pesos.get(r) ?? 0) + peso);
    };
    sumar(textoDeBloques(seccion.bloques), PESOS.texto);
    sumar(seccion.palabras.join(" "), PESOS.palabras);
    sumar(seccion.preguntas.join(" "), PESOS.preguntas);
    sumar(seccion.titulo, PESOS.titulo);
    return { seccion, pesos };
  });
  // Rareza: una raíz que está en pocas secciones dice más que una que está en
  // todas, y una que no está en ninguna, más que todas.
  const enCuantas = new Map();
  for (const { pesos } of indice) for (const r of pesos.keys()) enCuantas.set(r, (enCuantas.get(r) ?? 0) + 1);
  const rareza = (r) => Math.log(1 + secciones.length / (enCuantas.get(r) ?? 0.5));
  return { indice, rareza };
}

const { indice: INDICE, rareza: RAREZA } = indexar(SECCIONES);

// Lo que suma una raíz que está en el título, las preguntas y las palabras de
// una sección: desde ahí cuenta como cubierta del todo.
const CUBIERTA = PESOS.titulo + PESOS.preguntas;

// Las secciones que mejor contestan, de más a menos, con su puntaje entre 0 y
// 1 (qué parte de lo que se preguntó cubren, pesado por dónde y por rareza).
export function buscarEnManual(texto, { maximo = 3 } = {}) {
  const pregunta = [...new Set(raices(texto))];
  if (!pregunta.length) return [];
  const total = pregunta.reduce((s, r) => s + RAREZA(r), 0);
  return INDICE.map(({ seccion, pesos }) => {
    const puntos = pregunta.reduce((s, r) => s + Math.min(1, (pesos.get(r) ?? 0) / CUBIERTA) * RAREZA(r), 0);
    return { seccion, puntaje: puntos / total };
  })
    .filter((r) => r.puntaje > 0)
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, maximo);
}

// Desde acá, una sección contesta con confianza; entre DUDOSO y SEGURO se
// ofrece como "¿es alguna de estas?". Ajustados con las preguntas de
// backend/test/ayuda.test.js ("¿cómo funciona la bicicleta?" da 0,3).
export const PUNTAJE_SEGURO = 0.45;
export const PUNTAJE_DUDOSO = 0.2;

// "¿Cómo…?", "dónde…", "qué es…", "se puede…" o un signo de pregunta.
const PREGUNTA_DE_USO =
  /^(como|donde|que es|que son|que significa|que hace|para que|por que|puedo|se puede|hay (forma|manera|como)|cual|cuales|cuando|quien|cuanto|cuanta|cuantos|cuantas|no (se|encuentro|me aparece|veo|puedo)|me olvide|ayuda|explicame|decime|necesito saber|quiero saber)\b/;
// "…, ¿cómo paso la mercadería?": la pregunta puede venir después del contexto.
const COMO_SE_HACE = /\b(como|donde) (hago|hacer|puedo|se|cargo|paso|veo|pongo|agrego|cambio|saco|registro|aviso|encuentro)\b/;
// Lo que ya pasó, contado en primera persona: es una operación para cargar.
const OPERACION =
  /\b(vendi|vendimos|le vendi|compre|compramos|le compre|pague|pagamos|cobre|cobramos|gaste|gastamos|me pago|me pagaron|entraron|llegaron|se llevo|se llevaron|cargue|devolv\w*|le quedo (chico|chica|grande|corto|corta))\b/;

// La charla (hist. §120): lo que no es una operación ni una duda de uso, pero
// merece respuesta. Cuenta solo si después no queda nada con contenido: "hola,
// vendí 3 remeras" es una venta, no un saludo.
const CHARLA = [
  ["saludo", /^(hola+|holis|buenas|buen dia|buenos dias|buenas tardes|buenas noches|que tal|como (andas|va|estas)|hey|ey)\b/],
  ["gracias", /^(gracias|muchas gracias|mil gracias|genial|perfecto|dale|ok|okey|listo|joya|buenisimo|barbaro|excelente|de diez|copado)\b/],
  ["despedida", /^(chau|chao|adios|nos vemos|hasta luego|hasta manana|hasta despues)\b/],
  ["capacidades", /^(que (podes|puedes|sabes|haces)( hacer)?|para que (servis|sirve esto)|como te uso|ayuda|ayudame|help|menu|opciones)\b/]
];

// "Llevame a ventas", "abrí el stock", "quiero ver la caja": el nombre de la
// pantalla, con o sin artículo. "Abrí la caja" no: en el mostrador eso es
// abrir el turno, y lo contesta el manual.
const IR_A = /^(llevame|lleva me|ir|anda|andá|vamos|pasame|mostrame|abrime|abri|abrir|entra|entrar|quiero ver|ver)( a| al)?( la| el| los| las| mis| mi)? (.+)$/;
const PANTALLAS = [
  [/^(resumen|inicio|tablero|dashboard|estadisticas|numeros)$/, "#/dashboard", "Resumen"],
  [/^(punto de venta|pos|mostrador)$/, "#/pos", "Punto de venta"],
  [/^ventas?$/, "#/ventas", "Ventas"],
  [/^compras?$/, "#/compras", "Compras"],
  [/^(stock|inventario)$/, "#/stock", "Stock"],
  [/^(caja|tesoreria|cuentas)$/, "#/caja", "Caja"],
  [/^gastos?$/, "#/gastos", "Gastos"],
  [/^(clientes?|crm|consultas)$/, "#/clientes", "Clientes"],
  [/^proveedor(es)?$/, "#/proveedores", "Proveedores"],
  [/^(productos?|catalogo|servicios|articulos)$/, "#/productos", "Productos"],
  [/^presupuestos?$/, "#/presupuestos", "Presupuestos"],
  [/^facturas?$/, "#/facturas", "Facturas"],
  [/^devoluciones$/, "#/devoluciones", "Devoluciones"],
  [/^(cuentas corrientes|deudas|deudores)$/, "#/cuentas-corrientes", "Cuentas corrientes"],
  [/^trabajos$/, "#/trabajos", "Trabajos"],
  [/^abonos$/, "#/abonos", "Abonos"],
  [/^socios$/, "#/socios", "Socios"],
  [/^papelera$/, "#/papelera", "Papelera"],
  [/^auditoria$/, "#/auditoria", "Auditoría"],
  [/^(configuracion|ajustes)$/, "#/configuracion", "Configuración"],
  [/^(manual|ayuda)$/, "#/ayuda", "Manual de uso"]
];

function pantallaPedida(limpio) {
  const pedido = IR_A.exec(limpio);
  if (!pedido) return null;
  const [, verbo, , , nombre] = pedido;
  const encontrada = PANTALLAS.find(([patron]) => patron.test(nombre.trim()));
  if (!encontrada || (verbo.startsWith("abr") && encontrada[1] === "#/caja")) return null;
  return { hash: encontrada[1], nombre: encontrada[2] };
}

// Qué hacer con una frase del asistente:
// - "operacion": va a la IA, como siempre (venta, compra, gasto o devolución).
// - "ayuda": se contesta con el manual; `resultados` puede venir vacío.
// - "charla": un saludo, un gracias, un chau o "¿qué podés hacer?" (`charla`).
// - "navegar": "llevame a ventas" (`pantalla`: { hash, nombre }).
export function clasificarFrase(texto) {
  const limpio = normalizar(texto);
  // Se sacan las fórmulas una tras otra ("buenas, ¿cómo andás?" son dos): es
  // charla si no queda nada más, y cuenta la primera.
  let resto = limpio;
  let primera = null;
  for (let sacada = true; sacada; ) {
    sacada = false;
    for (const [charla, patron] of CHARLA) {
      if (!patron.test(resto)) continue;
      primera ??= charla;
      resto = resto.replace(patron, "").trim();
      sacada = true;
    }
  }
  if (primera && !raices(resto).length) return { tipo: "charla", charla: primera };
  const pantalla = pantallaPedida(limpio);
  if (pantalla) return { tipo: "navegar", pantalla };
  const esPregunta =
    PREGUNTA_DE_USO.test(limpio) || COMO_SE_HACE.test(limpio) || /\?\s*$/.test(String(texto).trim());
  if (esPregunta) return { tipo: "ayuda", resultados: buscarEnManual(texto) };
  if (OPERACION.test(limpio)) return { tipo: "operacion" };
  // Ni pregunta ni operación clara ("factura electrónica", "stock bajo"): si
  // el manual lo tiene seguro, se contesta con él; si no, a la IA.
  const resultados = buscarEnManual(texto);
  if (resultados[0]?.puntaje >= PUNTAJE_SEGURO && limpio.split(" ").length <= 5) return { tipo: "ayuda", resultados };
  return { tipo: "operacion" };
}
