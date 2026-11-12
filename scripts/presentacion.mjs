// Arma las diapositivas del pitch en un solo archivo (npm run presentacion).
//
// La fuente es docs/pitch/fuentes/index.html, que apunta a sus archivos por
// ruta: las fuentes de frontend/fonts, sus capturas/ y qr/, el logo de
// docs/logos y los íconos de frontend/img. Acá todo eso entra al HTML (data: y
// un sprite adentro), así docs/pitch/Presentación — Nexo.html se abre con doble
// clic, sin internet, desde cualquier compu o un pendrive: es el plan B del
// pitch.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';

const ORIGEN = 'docs/pitch/fuentes/index.html';
const DESTINO = 'docs/pitch/Presentación — Nexo.html';
const carpeta = dirname(resolve(ORIGEN));

const TIPOS = {
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};
const dataUri = (ruta) => {
  const tipo = TIPOS[extname(ruta)];
  if (!tipo) throw new Error(`Tipo de archivo sin soporte: ${ruta}`);
  return `data:${tipo};base64,${readFileSync(resolve(carpeta, ruta)).toString('base64')}`;
};

let html = readFileSync(ORIGEN, 'utf8');

// Los símbolos de un sprite (<use href="../../frontend/img/iconos.svg#beef">)
// pasan a uno solo adentro de la página. Se renombran con el archivo de origen
// porque mercadolibre.svg y mercadopago.svg tienen los dos un "logo".
const simbolos = new Map();
html = html.replace(/href="([^"#]+\.svg)#([\w-]+)"/g, (_, ruta, id) => {
  const nuevo = `${basename(ruta, '.svg')}-${id}`;
  if (!simbolos.has(nuevo)) {
    const sprite = readFileSync(resolve(carpeta, ruta), 'utf8');
    const simbolo = sprite.match(new RegExp(`<symbol id="${id}"[\\s\\S]*?</symbol>`));
    if (!simbolo) throw new Error(`No está el símbolo ${id} en ${ruta}`);
    simbolos.set(nuevo, simbolo[0].replace(`id="${id}"`, `id="${nuevo}"`));
  }
  return `href="#${nuevo}"`;
});
html = html.replace('<!--SIMBOLOS-->', [...simbolos.values()].join('\n'));

// El resto de lo que apunta a un archivo: imágenes y fuentes.
html = html.replace(/\bsrc="((?:\.\.\/|capturas\/|qr\/)[^"]+)"/g, (_, ruta) => `src="${dataUri(ruta)}"`);
html = html.replace(/url\("(\.\.\/[^"]+)"\)/g, (_, ruta) => `url("${dataUri(ruta)}")`);

writeFileSync(DESTINO, html);
console.log(`${DESTINO}: ${(html.length / 1024 / 1024).toFixed(1)} MB, ${simbolos.size} símbolos.`);
