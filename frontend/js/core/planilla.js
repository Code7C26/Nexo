/**
 * core/planilla.js
 * Traer productos, clientes y proveedores desde la planilla que el negocio ya
 * tenía (hist. §211). Lo usan la pantalla (dominios/importar.js) y el
 * servidor ("Importar desde una planilla" en server.js), como core/descuento.js:
 * - leer el archivo: Excel (.xlsx), CSV o lo copiado de Excel y pegado, sin
 *   librerías (el .xlsx es un zip de XML, y el navegador y Node traen cómo
 *   descomprimirlo);
 * - adivinar qué es cada columna por su título ("Precio", "Cod. barras");
 * - leer cada celda como la escribe un negocio argentino ("$ 1.234,50",
 *   "21 %", "Resp. Inscripto", "kg").
 */

/* ---------- Los campos de cada cosa que se trae ---------- */

// Las palabras van separadas por | : son claves para comparar, no texto que
// se muestra (y así scripts/i18n.mjs no las toma por frases).
const lista = (palabras) => palabras.split("|");

// `sinonimos`: cómo suele titularse esa columna, ya sin acentos ni signos.
export const CAMPOS = {
  productos: [
    { clave: "nombre", nombre: "Nombre", sinonimos: lista("nombre|producto|articulo|nombre del producto|nombre del articulo|item|titulo|detalle|descripcion del producto") },
    { clave: "sku", nombre: "Código (SKU)", sinonimos: lista("sku|codigo|cod|codigo interno|codigo de articulo|codigo articulo|cod articulo|cod art|codigo de producto|referencia|ref|id producto") },
    { clave: "codigo_barras", nombre: "Código de barras", sinonimos: lista("codigo de barras|codigo barras|cod barras|cod barra|codigo barra|ean|ean13|barcode|upc|gtin") },
    { clave: "categoria", nombre: "Categoría", sinonimos: lista("categoria|rubro|familia|seccion|departamento|linea|grupo") },
    { clave: "precio_venta", nombre: "Precio de venta", sinonimos: lista("precio|precio de venta|precio venta|pvp|precio final|precio publico|precio al publico|venta|precio minorista|p venta|precio unitario|precio lista") },
    { clave: "costo", nombre: "Costo", sinonimos: lista("costo|precio de costo|precio costo|costo unitario|p costo|compra|precio de compra|precio compra|costo de compra") },
    { clave: "stock", nombre: "Stock", sinonimos: lista("stock|cantidad|existencia|existencias|stock actual|cant|unidades|disponible|cantidad disponible|inventario") },
    { clave: "stock_minimo", nombre: "Stock mínimo", sinonimos: lista("stock minimo|minimo|stock min|punto de pedido|cantidad minima") },
    { clave: "unidad", nombre: "Unidad de medida", sinonimos: lista("unidad|unidad de medida|um|medida|unidad medida") },
    { clave: "alicuota_iva", nombre: "IVA", sinonimos: lista("iva|alicuota|alicuota iva|alicuota de iva|iva porcentaje|tasa iva|porcentaje iva") },
    { clave: "descripcion", nombre: "Descripción", sinonimos: lista("descripcion|descripcion larga|detalle largo") }
  ],
  clientes: [
    { clave: "nombre", nombre: "Nombre o razón social", sinonimos: lista("nombre|cliente|razon social|nombre y apellido|apellido y nombre|nombre completo|denominacion") },
    { clave: "apellido", nombre: "Apellido", sinonimos: lista("apellido|apellidos") },
    { clave: "documento", nombre: "CUIT o DNI", sinonimos: lista("cuit|dni|documento|cuil|cuit dni|dni cuit|nro documento|numero de documento|doc") },
    { clave: "condicion_iva", nombre: "Condición frente al IVA", sinonimos: lista("condicion iva|condicion frente al iva|condicion ante el iva|situacion iva|categoria iva|iva|tipo de iva") },
    { clave: "email", nombre: "Email", sinonimos: lista("email|mail|e mail|correo|correo electronico") },
    { clave: "telefono", nombre: "Teléfono", sinonimos: lista("telefono|tel|celular|cel|whatsapp|movil|telefono celular") },
    { clave: "direccion", nombre: "Dirección", sinonimos: lista("direccion|domicilio|calle|direccion completa") },
    { clave: "localidad", nombre: "Localidad", sinonimos: lista("localidad|ciudad|barrio|provincia|partido") },
    { clave: "notas", nombre: "Notas", sinonimos: lista("notas|observaciones|comentarios|obs|nota") }
  ],
  proveedores: [
    { clave: "nombre", nombre: "Nombre o razón social", sinonimos: lista("nombre|proveedor|razon social|empresa|denominacion|nombre fantasia") },
    { clave: "documento", nombre: "CUIT", sinonimos: lista("cuit|documento|cuil|dni|nro documento") },
    { clave: "condicion_iva", nombre: "Condición frente al IVA", sinonimos: lista("condicion iva|condicion frente al iva|condicion ante el iva|situacion iva|categoria iva|iva|tipo de iva") },
    { clave: "email", nombre: "Email", sinonimos: lista("email|mail|e mail|correo|correo electronico") },
    { clave: "telefono", nombre: "Teléfono", sinonimos: lista("telefono|tel|celular|cel|whatsapp|movil") },
    { clave: "direccion", nombre: "Dirección", sinonimos: lista("direccion|domicilio|calle") },
    { clave: "localidad", nombre: "Localidad", sinonimos: lista("localidad|ciudad|provincia|partido") },
    { clave: "notas", nombre: "Notas", sinonimos: lista("notas|observaciones|comentarios|obs|contacto|vendedor") }
  ]
};

export const TIPOS_PLANILLA = Object.keys(CAMPOS);
// Lo que entra en una sola planilla: un catálogo grande, no una base entera.
export const MAX_FILAS_PLANILLA = 5000;

// Un título o un texto para comparar: sin acentos, mayúsculas ni signos.
export const normalizar = (texto) =>
  String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim();

// Qué campo es cada columna: el título igual a un sinónimo gana; si no, el
// sinónimo más largo que esté adentro del título ("Precio de venta $" →
// precio de venta, no precio). Cada campo va en una sola columna, la que
// mejor coincide; las demás quedan sin usar (null).
export function adivinarColumnas(tipo, encabezados) {
  const campos = CAMPOS[tipo];
  const puntajes = encabezados.map((titulo) => {
    const t = normalizar(titulo);
    let mejor = { clave: null, puntos: 0 };
    if (!t) return mejor;
    for (const campo of campos) {
      for (const s of campo.sinonimos) {
        const puntos = t === s ? 1000 + s.length : ` ${t} `.includes(` ${s} `) ? s.length : 0;
        if (puntos > mejor.puntos) mejor = { clave: campo.clave, puntos };
      }
    }
    return mejor;
  });
  const elegidas = encabezados.map(() => null);
  const orden = puntajes.map((p, i) => ({ ...p, i })).filter((p) => p.clave).sort((a, b) => b.puntos - a.puntos);
  const usados = new Set();
  for (const p of orden) {
    if (usados.has(p.clave)) continue;
    usados.add(p.clave);
    elegidas[p.i] = p.clave;
  }
  // "Código | Descripción | Precio": la descripción es el nombre.
  if (tipo === "productos" && !usados.has("nombre")) {
    const i = elegidas.indexOf("descripcion");
    if (i >= 0) elegidas[i] = "nombre";
  }
  return elegidas;
}

/* ---------- Leer cada celda ---------- */

// Un número como lo escribe un negocio: 1234.5, "1.234,50", "$ 12.000",
// "10,5 %". La coma es decimal; el punto también, salvo que separe miles
// ("1.500" son mil quinientos). Vacío es null; lo que no es número, NaN.
export function leerNumero(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : NaN;
  let t = String(valor).trim().replace(/ars|\$|%/gi, "").replace(/[\s\u00a0]/g, "");
  if (t === "" || t === "-") return null;
  const negativo = /^-/.test(t) || /^\(.*\)$/.test(t);
  t = t.replace(/^-|^\(|\)$/g, "");
  if (!/^[\d.,]+$/.test(t)) return NaN;
  const coma = t.lastIndexOf(",");
  const punto = t.lastIndexOf(".");
  if (coma >= 0 && punto >= 0) {
    t = coma > punto ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (coma >= 0) {
    t = /^\d{1,3}(,\d{3}){2,}$/.test(t) ? t.replace(/,/g, "") : t.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, "");
  }
  const n = Number(t);
  if (!Number.isFinite(n)) return NaN;
  return negativo ? -n : n;
}

// Un texto de la celda: lo que viene como número (un código de barras en una
// celda numérica) pasa a texto. Vacío es null.
export function leerTexto(valor) {
  if (valor === null || valor === undefined) return null;
  const t = String(valor).trim();
  return t === "" ? null : t;
}

const UNIDADES_ESCRITAS = {
  unidad: lista("u|un|unid|unidad|unidades|c u|cu|uni|pieza|piezas|pza"),
  kg: lista("kg|kgs|kilo|kilos|kilogramo|kilogramos"),
  g: lista("g|gr|grs|gramo|gramos"),
  l: lista("l|lt|lts|litro|litros"),
  ml: lista("ml|cc|mililitro|mililitros"),
  m: lista("m|mt|mts|metro|metros"),
  hora: lista("h|hs|hora|horas")
};
// La unidad de Nexo para lo escrito ("Kilos" → kg), o undefined si no es una.
export function leerUnidad(valor) {
  const t = normalizar(valor).replace(/^x /, "");
  if (!t) return null;
  return Object.keys(UNIDADES_ESCRITAS).find((u) => UNIDADES_ESCRITAS[u].includes(t));
}

// La alícuota de IVA como la guarda Nexo ('21', '10.5', 'exento'…), o
// undefined. Excel guarda "21 %" como 0,21.
const ALICUOTAS = ["21", "10.5", "27", "5", "2.5", "0"];
export function leerAlicuota(valor) {
  const t = normalizar(valor);
  if (!t) return null;
  if (t.startsWith("exent")) return "exento";
  if (t.startsWith("no grav")) return "no_gravado";
  let n = leerNumero(valor);
  if (typeof valor === "number" && n > 0 && n < 1) n = Math.round(n * 1000) / 10;
  if (!Number.isFinite(n)) return undefined;
  return ALICUOTAS.find((a) => Number(a) === n);
}

// La condición frente al IVA de un cliente o un proveedor, o undefined.
export function leerCondicionIva(valor) {
  const t = normalizar(valor).replace(/ /g, "");
  if (!t) return null;
  if (/^(ri|respinsc|responsableinscrip|inscripto|resinsc)/.test(t)) return "responsable_inscripto";
  if (/^(mt|m|rs|monotrib|regimensimplificado|pequenocontribuyente)$|^monotrib/.test(t)) return "monotributo";
  if (/^(ex|exento|ivaexento|sujetoexento)$/.test(t)) return "exento";
  if (/^(cf|consumidorfinal|consfinal|final)$/.test(t)) return "consumidor_final";
  return undefined;
}

// Una fila de la planilla ({ campo: celda }) como la usa Nexo, con lo que no
// se pudo leer. Un campo vacío no está en `datos`: al actualizar, no se toca.
export function interpretarFila(tipo, fila) {
  const datos = {};
  const errores = [];
  for (const { clave, nombre } of CAMPOS[tipo]) {
    const celda = fila?.[clave];
    if (celda === undefined || celda === null || String(celda).trim() === "") continue;
    switch (clave) {
      case "precio_venta":
      case "costo":
      case "stock":
      case "stock_minimo": {
        const n = leerNumero(celda);
        if (Number.isNaN(n)) errores.push(`"${nombre}" no es un número: dice "${celda}".`);
        else if (n < 0) errores.push(`"${nombre}" no puede ser negativo.`);
        else datos[clave] = Math.round(n * 1000) / 1000;
        break;
      }
      case "unidad": {
        const u = leerUnidad(celda);
        if (u === undefined) errores.push(`La unidad "${celda}" no es una de Nexo: unidad, kg, g, litro, ml, metro u hora.`);
        else datos[clave] = u;
        break;
      }
      case "alicuota_iva": {
        const a = leerAlicuota(celda);
        if (a === undefined) errores.push(`El IVA "${celda}" no es una alícuota: 21, 10,5, 27, 5, 2,5, 0 o exento.`);
        else datos[clave] = a;
        break;
      }
      case "condicion_iva": {
        const c = leerCondicionIva(celda);
        if (c === undefined) {
          errores.push(`La condición "${celda}" no es una frente al IVA: responsable inscripto, monotributo, exento o consumidor final.`);
        } else datos[clave] = c;
        break;
      }
      case "codigo_barras":
        datos[clave] = leerTexto(celda).replace(/\s+/g, "");
        break;
      default:
        datos[clave] = leerTexto(celda);
    }
  }
  // Nombre y apellido en columnas separadas van juntos, y la localidad, con
  // la dirección: Nexo los guarda en uno.
  if (datos.apellido) datos.nombre = datos.nombre ? `${datos.nombre} ${datos.apellido}` : datos.apellido;
  delete datos.apellido;
  if (datos.localidad) datos.direccion = datos.direccion ? `${datos.direccion}, ${datos.localidad}` : datos.localidad;
  delete datos.localidad;
  if (datos.email) datos.email = datos.email.toLowerCase();
  return { datos, errores };
}

/* ---------- Leer el archivo ---------- */

// Texto separado por comas, punto y coma o tabuladores (lo copiado de
// Excel), con comillas como las escribe Excel. Devuelve las filas de celdas.
export function separarTexto(texto) {
  const limpio = String(texto ?? "").replace(/^\ufeff/, "");
  const primera = limpio.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const cuenta = (c) => primera.split(c).length - 1;
  const separador = ["\t", ";", ","].reduce((mejor, c) => (cuenta(c) > cuenta(mejor) ? c : mejor), "\t");
  const filas = [];
  let fila = [];
  let celda = "";
  let entreComillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (entreComillas) {
      if (c === '"' && limpio[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (c === '"') entreComillas = false;
      else celda += c;
    } else if (c === '"' && celda === "") entreComillas = true;
    else if (c === separador) {
      fila.push(celda);
      celda = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpio[i + 1] === "\n") i++;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else celda += c;
  }
  if (celda !== "" || fila.length) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas.map((f) => f.map((c) => c.trim()));
}

// Un CSV de Excel en Windows suele venir en Latin-1, no en UTF-8: se prueba
// UTF-8 y, si no lo es, se lee como Windows-1252 (las eñes y los acentos).
export function decodificarTexto(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

const ENTIDADES = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
const desescapar = (t) =>
  t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (todo, e) =>
    e[0] === "#" ? String.fromCodePoint(/^#x/i.test(e) ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTIDADES[e] ?? todo)
  );
// El texto de un nodo de Excel, que puede venir partido en pedazos con
// formato (<r><t>Ma</t></r><r><t>te</t></r>); el de la pronunciación, no.
const textoDeNodo = (xml) =>
  desescapar(
    [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join("")
  );

// Los archivos de adentro de un zip, sin librerías: el directorio está al
// final, y cada archivo va guardado tal cual o con deflate. Devuelve cómo leer
// uno por su nombre (null si no está).
async function abrirZip(bytes) {
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let fin = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (vista.getUint32(i, true) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error("zip");
  const cantidad = vista.getUint16(fin + 10, true);
  let p = vista.getUint32(fin + 16, true);
  const archivos = {};
  for (let n = 0; n < cantidad; n++) {
    if (vista.getUint32(p, true) !== 0x02014b50) throw new Error("zip");
    const metodo = vista.getUint16(p + 10, true);
    const comprimido = vista.getUint32(p + 20, true);
    const largoNombre = vista.getUint16(p + 28, true);
    const largoExtra = vista.getUint16(p + 30, true);
    const largoComentario = vista.getUint16(p + 32, true);
    const local = vista.getUint32(p + 42, true);
    const nombre = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + largoNombre));
    const inicio = local + 30 + vista.getUint16(local + 26, true) + vista.getUint16(local + 28, true);
    archivos[nombre] = { metodo, datos: bytes.subarray(inicio, inicio + comprimido) };
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  return async (nombre) => {
    const a = archivos[nombre];
    if (!a) return null;
    if (a.metodo === 0) return new TextDecoder().decode(a.datos);
    if (a.metodo !== 8) throw new Error("zip");
    const flujo = new Blob([a.datos]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Response(flujo).text();
  };
}

// "B12" → 1 (la columna, desde 0).
function columnaDe(referencia) {
  let n = 0;
  for (const l of /^[A-Z]*/.exec(referencia ?? "")[0]) n = n * 26 + (l.charCodeAt(0) - 64);
  return n - 1;
}

// La primera hoja de un .xlsx, como filas de celdas: los números quedan
// números (sin la duda de la coma) y los textos, textos.
export async function leerXlsx(bytes) {
  const leer = await abrirZip(bytes);
  const libro = (await leer("xl/workbook.xml")) ?? "";
  const relaciones = (await leer("xl/_rels/workbook.xml.rels")) ?? "";
  const idHoja = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(libro)?.[1];
  const relacion = idHoja ? [...relaciones.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => r.includes(`Id="${idHoja}"`)) : null;
  const destino = relacion ? /Target="([^"]+)"/.exec(relacion)?.[1] : null;
  const ruta = destino ? destino.replace(/^\/?(xl\/)?/, "xl/") : "xl/worksheets/sheet1.xml";
  const hoja = await leer(ruta);
  if (hoja === null) throw new Error("hoja");
  const compartidos = [...((await leer("xl/sharedStrings.xml")) ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textoDeNodo(m[1]));

  const filas = [];
  for (const [, contenido] of hoja.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const fila = [];
    for (const [, atributos, interior = ""] of contenido.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const columna = columnaDe(/\br="([A-Z]+)/.exec(atributos)?.[1]);
      const tipo = /\bt="([^"]+)"/.exec(atributos)?.[1];
      const valor = /<v>([\s\S]*?)<\/v>/.exec(interior)?.[1];
      let celda = null;
      if (tipo === "s") celda = compartidos[Number(valor)] ?? null;
      else if (tipo === "inlineStr") celda = textoDeNodo(interior);
      else if (tipo === "str" || tipo === "e") celda = valor === undefined ? null : desescapar(valor);
      else if (tipo === "b") celda = valor === "1" ? "Sí" : "No";
      else if (valor !== undefined) celda = Math.round(Number(valor) * 1e9) / 1e9;
      fila[columna >= 0 ? columna : fila.length] = celda;
    }
    filas.push(Array.from(fila, (c) => (typeof c === "string" ? c.trim() : (c ?? null))));
  }
  return filas;
}

// Dónde están los títulos: la primera fila (de las diez primeras) con dos
// celdas o más y algún título conocido; si no hay, la primera con dos.
// Muchas planillas arrancan con el nombre del negocio o la fecha arriba.
function filaDeTitulos(tipo, filas) {
  const llenas = (f) => f.filter((c) => c !== null && String(c).trim() !== "").length;
  const primeras = filas.slice(0, 10);
  const conocida = primeras.findIndex((f) => llenas(f) >= 2 && adivinarColumnas(tipo, f.map((c) => c ?? "")).some(Boolean));
  if (conocida >= 0) return conocida;
  const conDos = primeras.findIndex((f) => llenas(f) >= 2);
  return conDos >= 0 ? conDos : 0;
}

// Las filas crudas como { encabezados, filas }: sin lo de arriba de los
// títulos ni las filas vacías. Cada fila lleva su número en la planilla, para
// que el error diga "renglón 14" y se encuentre en Excel.
export function armarTabla(tipo, filasCrudas) {
  const inicio = filaDeTitulos(tipo, filasCrudas);
  const titulos = (filasCrudas[inicio] ?? []).map((c) => leerTexto(c) ?? "");
  const ancho = Math.max(titulos.length, ...filasCrudas.slice(inicio + 1).map((f) => f.length), 0);
  const encabezados = Array.from({ length: ancho }, (_, i) => titulos[i] || `Columna ${i + 1}`);
  const filas = filasCrudas
    .slice(inicio + 1)
    .map((f, i) => ({ numero: inicio + i + 2, celdas: Array.from({ length: ancho }, (_, j) => f[j] ?? null) }))
    .filter((f) => f.celdas.some((c) => c !== null && String(c).trim() !== ""));
  return { encabezados, filas };
}

export class ErrorPlanilla extends Error {}

// El archivo que eligió el usuario, como filas crudas.
export async function leerArchivoPlanilla(archivo) {
  const nombre = archivo.name ?? "";
  if (/\.xls$/i.test(nombre)) {
    throw new ErrorPlanilla("Es un Excel viejo (.xls). Abrilo en Excel y guardalo como .xlsx (Archivo → Guardar como) o como CSV.");
  }
  if (/\.(ods|numbers)$/i.test(nombre)) {
    throw new ErrorPlanilla("Guardala como Excel (.xlsx) o como CSV y subila de nuevo.");
  }
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  if (/\.xlsx$/i.test(nombre) || (bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    try {
      return await leerXlsx(bytes);
    } catch {
      throw new ErrorPlanilla(`No se pudo abrir "${nombre}". Probá guardarla de nuevo como .xlsx o como CSV.`);
    }
  }
  return separarTexto(decodificarTexto(bytes));
}
