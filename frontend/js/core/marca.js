/**
 * core/marca.js
 * El logo y el color del negocio (hist. §212), como el "branding" de Square o
 * de Gymdesk: un logo y un color que se ven en el menú, en lo que se imprime
 * y en la pantalla de entrada. El negro de Nexo (la barra, el marco) no
 * cambia: el color del negocio toma el lugar del azul, que es el único acento.
 * Sin color, el azul de Nexo; sin logo, la inicial del nombre.
 *
 * También achica en el navegador lo que se sube (el logo y la foto de
 * perfil): al servidor llega una imagen chica, nunca la foto de 5 MB.
 */

/* ---------- El color ---------- */

const BLANCO = [255, 255, 255];
const NEGRO = [0, 0, 0];
// Los fondos sobre los que se lee el acento en cada tema (styles.css): la
// hoja y las tarjetas del oscuro, la barra negra, y el blanco y el gris del claro.
const FONDOS_OSCUROS = [[10, 10, 10], [16, 16, 16], NEGRO];
const FONDOS_CLAROS = [BLANCO, [245, 245, 245]];
const TINTA_OSCURA = "#0A0A0A";

const hexARgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgbAHex = (rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
const mezclar = (a, b, t) => a.map((c, i) => c + (b[i] - c) * t);
const rgba = (rgb, alfa) => `rgba(${rgb.map(Math.round).join(", ")}, ${alfa})`;

// Luminancia y contraste de las WCAG: 4,5 es lo que pide un texto chico.
function luminancia(rgb) {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contraste(a, b) {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// Lleva el color de a poco hacia el blanco (para el oscuro) o el negro (para
// el claro) hasta que se lea sobre todos sus fondos. Un amarillo queda casi
// igual en el oscuro y se oscurece en el claro, como lo haría un diseñador.
function legibleSobre(rgb, fondos, hacia) {
  for (let t = 0; t <= 1; t += 0.02) {
    const color = mezclar(rgb, hacia, t);
    if (fondos.every((fondo) => contraste(color, fondo) >= 4.5)) return color;
  }
  return hacia;
}

// El texto que va encima del acento (un botón lleno): el que más se lee.
const tintaSobre = (rgb) => (contraste(rgb, hexARgb(TINTA_OSCURA)) >= contraste(rgb, BLANCO) ? TINTA_OSCURA : "#FFFFFF");

// Las dos versiones del color, con lo que styles.css define para el azul.
export function variantesDeColor(hex) {
  const base = hexARgb(hex);
  const oscuro = legibleSobre(base, FONDOS_OSCUROS, BLANCO);
  const claro = legibleSobre(base, FONDOS_CLAROS, NEGRO);
  return {
    oscuro: {
      accent: rgbAHex(oscuro),
      hover: rgbAHex(mezclar(oscuro, BLANCO, 0.25)),
      bg: rgba(oscuro, 0.14),
      contrast: tintaSobre(oscuro)
    },
    claro: {
      accent: rgbAHex(claro),
      hover: rgbAHex(mezclar(claro, NEGRO, 0.15)),
      bg: rgbAHex(mezclar(claro, BLANCO, 0.86)),
      contrast: tintaSobre(claro)
    }
  };
}

// Las variables de styles.css que lleva el color del negocio. --accent-on-dark
// es el de la barra y la pantalla de entrada: negras en el oscuro y blancas en
// el claro, así que cada tema lleva la variante que se lee sobre su fondo.
// Es CSS, no HTML: los valores los calcula variantesDeColor.
const declarar = (variables) =>
  Object.entries(variables)
    .map(([nombre, valor]) => `--${nombre}: ${valor};`)
    .join(" ");

function cssDeColor(hex) {
  const { oscuro, claro } = variantesDeColor(hex);
  const delTema = (v) => ({ accent: v.accent, "accent-hover": v.hover, "accent-bg": v.bg, "accent-contrast": v.contrast });
  const deLaBarra = (v) => ({ "accent-on-dark": v.accent, "accent-on-dark-ink": v.contrast, "sidebar-active": v.bg });
  const raiz = declarar({ ...delTema(oscuro), ...deLaBarra(oscuro) });
  const enClaro = declarar({ ...delTema(claro), ...deLaBarra(claro) });
  return `:root { ${raiz} }\n:root[data-tema="claro"] { ${enClaro} }`;
}

// El color en lo que se imprime (la hoja es blanca): la versión del claro.
export const colorParaPapel = (hex) => (hex ? variantesDeColor(hex).claro.accent : null);

const CLAVE_COLOR = "nexo.marca";

// Pisa los colores de styles.css con un <style> al final del <head>. Queda
// guardado para la próxima vez: arranque.js lo pone antes de pintar, sin un
// instante de azul.
export function aplicarColor(hex) {
  const css = hex && /^#[0-9a-f]{6}$/i.test(hex) ? cssDeColor(hex) : "";
  // Lo crea arranque.js, o este la primera vez (marcado con data-marca).
  let estilo = document.head.querySelector("style[data-marca]");
  if (!estilo) {
    estilo = document.createElement("style");
    estilo.dataset.marca = "";
    document.head.append(estilo);
  }
  estilo.textContent = css;
  try {
    if (css) localStorage.setItem(CLAVE_COLOR, css);
    else localStorage.removeItem(CLAVE_COLOR);
  } catch {}
}

/* ---------- El logo ---------- */

// Lo que se imprime lleva el logo adentro (data:), como el QR de la factura:
// así sale en el papel y en el PDF del mail sin esperar a que cargue.
let logoEnLinea = null;
let logoCargado = null;

export async function cargarLogo(url) {
  if (url === logoCargado) return;
  logoCargado = url;
  if (!url) {
    logoEnLinea = null;
    return;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const datos = await new Promise((ok, mal) => {
      const lector = new FileReader();
      lector.onload = () => ok(lector.result);
      lector.onerror = mal;
      lector.readAsDataURL(blob);
    });
    if (logoCargado === url) logoEnLinea = datos;
  } catch {
    // Sin el logo, lo impreso sale con el nombre solo, como antes.
    if (logoCargado === url) logoCargado = null;
  }
}

/* ---------- El encuadre del menú (hist. §215) ---------- */

// Cuánto se puede correr el logo con ese zoom: hasta que su borde llega al
// del cuadradito (sin zoom, nada).
export const corrimientoMaximo = (zoom) => Math.min(150, Math.max(0, (zoom - 1) * 50));

// Las clases y el estilo del <img> del cuadradito con el logo encuadrado a
// mano: acercado y corrido, sin el margen blanco. Sin encuadre, el logo entero.
export function atributosEncuadre(encuadre) {
  if (!encuadre) return "";
  const { zoom: z, x: cx, y: cy } = encuadre;
  const zoom = Number(z) || 1;
  const max = corrimientoMaximo(zoom);
  const corrido = (v) => Math.max(-max, Math.min(max, Number(v) || 0));
  const [x, y] = [corrido(cx), corrido(cy)];
  return ` data-encuadrado style="transform: translate(${x}%, ${y}%) scale(${zoom})"`;
}

// El <img> del logo para una hoja o un ticket, o nada si no hay. El src es un
// data: que arma el navegador, no un texto que venga de afuera.
export const imgLogo = (clase) => (logoEnLinea ? `<img class="${clase}" src="${logoEnLinea}" alt="" />` : "");

/* ---------- Achicar lo que se sube ---------- */

const MAX_BASE64 = 700 * 1024;

function abrirImagen(archivo) {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      ok(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      mal(new Error("No se pudo abrir la imagen. Probá con un PNG o un JPG."));
    };
    img.src = url;
  });
}

// El rectángulo con algo dibujado: un logo con mucho margen transparente
// quedaría chiquito en el cuadradito del menú.
function recorteSinTransparente(img) {
  const lienzo = document.createElement("canvas");
  lienzo.width = img.naturalWidth || img.width;
  lienzo.height = img.naturalHeight || img.height;
  const ctx = lienzo.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
  let [x0, y0, x1, y1] = [width, height, -1, -1];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { x: 0, y: 0, ancho: width, alto: height };
  return { x: x0, y: y0, ancho: x1 - x0 + 1, alto: y1 - y0 + 1 };
}

function exportar(lienzo, calidad) {
  // WebP pesa menos y guarda la transparencia; el navegador que no lo arma
  // devuelve un PNG.
  const webp = lienzo.toDataURL("image/webp", calidad);
  const url = webp.startsWith("data:image/webp") ? webp : lienzo.toDataURL("image/png");
  const tipo = url.slice(5, url.indexOf(";"));
  return { tipo, datos: url.slice(url.indexOf(",") + 1), url };
}

// El logo, sin el margen transparente y entrando en un cuadrado de `lado`; la
// foto, recortada al cuadrado del medio. Devuelve { tipo, datos, url, lienzo }.
export async function achicarImagen(archivo, { lado, cuadrada = false }) {
  if (!archivo?.type?.startsWith("image/")) throw new Error("Elegí una imagen: un PNG, un JPG o un WebP.");
  const img = await abrirImagen(archivo);
  const ancho = img.naturalWidth || img.width;
  const alto = img.naturalHeight || img.height;
  let origen;
  if (cuadrada) {
    const l = Math.min(ancho, alto);
    origen = { x: (ancho - l) / 2, y: (alto - l) / 2, ancho: l, alto: l };
  } else {
    origen = recorteSinTransparente(img);
  }
  let medida = lado;
  for (;;) {
    const escala = Math.min(1, medida / Math.max(origen.ancho, origen.alto));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.max(1, Math.round(origen.ancho * escala));
    lienzo.height = Math.max(1, Math.round(origen.alto * escala));
    const ctx = lienzo.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, origen.x, origen.y, origen.ancho, origen.alto, 0, 0, lienzo.width, lienzo.height);
    const imagen = exportar(lienzo, 0.9);
    if (imagen.datos.length <= MAX_BASE64 || medida <= 128) return { ...imagen, lienzo };
    medida = Math.round(medida * 0.75);
  }
}

/* ---------- Los colores del logo ---------- */

function rgbAHsl([r, g, b]) {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rr ? (gg - bb) / d + (gg < bb ? 6 : 0) : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
  return [h * 60, s, l];
}

// Hasta `cuantos` colores con fuerza del logo, de más a menos presentes, para
// ofrecerlos como el color del negocio. Se saltean los grises, el casi blanco y
// el casi negro: un logo negro sobre blanco no tiene color que ofrecer.
export function coloresDelLogo(lienzo, cuantos = 3) {
  const chico = document.createElement("canvas");
  const escala = Math.min(1, 64 / Math.max(lienzo.width, lienzo.height));
  chico.width = Math.max(1, Math.round(lienzo.width * escala));
  chico.height = Math.max(1, Math.round(lienzo.height * escala));
  const ctx = chico.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(lienzo, 0, 0, chico.width, chico.height);
  const { data } = ctx.getImageData(0, 0, chico.width, chico.height);
  const grupos = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const rgb = [data[i], data[i + 1], data[i + 2]];
    const [h, s, l] = rgbAHsl(rgb);
    if (s < 0.25 || l < 0.12 || l > 0.92) continue;
    // Doce tonos, y dentro de cada uno, claro u oscuro.
    const clave = `${Math.round(h / 30) % 12}-${l > 0.55 ? 1 : 0}`;
    const grupo = grupos.get(clave) ?? { n: 0, suma: [0, 0, 0] };
    grupo.n++;
    grupo.suma = grupo.suma.map((c, j) => c + rgb[j]);
    grupos.set(clave, grupo);
  }
  const total = data.length / 4;
  return [...grupos.values()]
    .filter((g) => g.n / total > 0.01)
    .sort((a, b) => b.n - a.n)
    .slice(0, cuantos)
    .map((g) => rgbAHex(g.suma.map((c) => c / g.n)));
}
