// Saca el segundo de cada palabra de una grabación de voz, para atar el video
// en inglés a la voz real (estudio/src/compositions/voz/nexo-ingles.json).
// Usa Whisper de Groq (GROQ_API_KEY, sin espacios) y alinea con el guion.
//
// Uso: GROQ_API_KEY=... node videos/grabar/tiempos-voz.mjs <audio.mp3|wav|m4a> <salida.json> [guion.json]
// El guion es el .json de la voz guía (trae el campo "texto"); por defecto el del estudio.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [audio, salida, guion = path.join(import.meta.dirname, '../estudio/src/compositions/voz/nexo-ingles.json')] = process.argv.slice(2);
if (!audio || !salida || !process.env.GROQ_API_KEY) {
  console.error('Uso: GROQ_API_KEY=... node videos/grabar/tiempos-voz.mjs <audio> <salida.json> [guion.json]');
  process.exit(1);
}
const { texto } = JSON.parse(readFileSync(guion, 'utf8'));

const forma = new FormData();
forma.append('file', new Blob([readFileSync(audio)]), path.basename(audio));
forma.append('model', 'whisper-large-v3-turbo');
forma.append('language', 'en');
forma.append('response_format', 'verbose_json');
forma.append('timestamp_granularities[]', 'word');
const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
  body: forma
});
if (!r.ok) {
  console.error('Groq contestó', r.status, await r.text());
  process.exit(1);
}
const oidas = (await r.json()).words;

// Alinea las palabras del guion con las que oyó Whisper (puede oír "Nexus" por "Nexo").
const norm = (x) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
const guionPalabras = texto.split(/\s+/);
const palabras = [];
let j = 0;
for (const t of guionPalabras) {
  let k = j;
  while (k < Math.min(j + 4, oidas.length) && norm(oidas[k].word) !== norm(t)) k++;
  const o = oidas[k < Math.min(j + 4, oidas.length) ? k : j];
  if (!o) throw new Error(`Whisper oyó menos palabras que el guion (faltan desde "${t}")`);
  palabras.push({ t, ini: Math.round(o.start * 1000) / 1000, fin: Math.round(o.end * 1000) / 1000 });
  j = (k < Math.min(j + 4, oidas.length) ? k : j) + 1;
}
writeFileSync(salida, JSON.stringify({ texto, palabras }, null, 1));
console.log(`${palabras.length} palabras del guion; Whisper oyó ${oidas.length}; termina en ${palabras.at(-1).fin} s`);
