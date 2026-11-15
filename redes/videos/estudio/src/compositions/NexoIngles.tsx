// Nexo — Video en inglés. Guion: storyboards/nexo-ingles.md.
// La app real en inglés, grabada con redes/videos/grabar/ingles.mjs, con la voz
// de Santino y subtítulos. Va en la presentación: corto y rápido.
//
// Todo está atado a la voz: cada corte arranca en el segundo exacto en que se
// dice su palabra (voz/nexo-ingles.json: { palabras: [{ t, ini, fin }] }, en
// segundos) y la duración del video sale de la voz. Para usar la voz real de
// Santino se genera ese mismo JSON con la transcripción por palabra de su
// audio y se pone GUIA = false (el audio real se mezcla con ffmpeg).
import React from "react";
import { AbsoluteFill, Audio, Img, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from "remotion";
import { brand } from "../brand/brand";
import { ease, progress } from "../lib/motion";
import { C } from "../components/nexo/ui";
import GRABACION from "./ingles.json";
import VOZ from "./voz/nexo-ingles.json";

const FPS = 30;
const GUIA = true;
const f = (s: number) => Math.round(s * FPS);
const ADELANTO = 0.08; // la imagen cambia un pelo antes de la palabra
const COLA = 1.1; // lo que sigue después de la última palabra

type Foco = [number, number, number];
// Cada momento: con qué palabra arranca (una o dos palabras seguidas del guion),
// qué tramo de la grabación se ve (marcas de escenas.json) y a dónde mira el cuadro.
type Momento = { ancla: string; desde: string; hasta: string; foco: Foco };

const MOMENTOS: Momento[] = [
  { ancla: "This", desde: "resumen", hasta: "resumen-b", foco: [960, 540, 1] },
  { ancla: "A management", desde: "resumen-b", hasta: "resumen-fin", foco: [960, 560, 1.06] },
  { ancla: "Stock", desde: "stock", hasta: "ventas", foco: [960, 540, 1] },
  { ancla: "Sales", desde: "ventas", hasta: "caja", foco: [960, 540, 1] },
  { ancla: "Cash", desde: "caja", hasta: "facturas", foco: [960, 540, 1] },
  { ancla: "Invoices", desde: "facturas", hasta: "conectado", foco: [960, 540, 1] },
  { ancla: "All connected", desde: "conectado", hasta: "conectado-fin", foco: [260, 500, 1.5] },
  { ancla: "Every sale", desde: "pos", hasta: "pos-fin", foco: [1200, 540, 1.12] },
  { ancla: "and shows", desde: "ficha", hasta: "ficha-fin", foco: [800, 640, 1.2] },
  { ancla: "It adapts", desde: "tipos", hasta: "tipos-fin", foco: [1000, 520, 1.1] },
  { ancla: "Just say", desde: "asistente", hasta: "escrito", foco: [960, 700, 1.2] },
  { ancla: "Nexo does", desde: "propuesta", hasta: "confirmado", foco: [900, 640, 1.25] },
  { ancla: "Online sales", desde: "online", hasta: "online-fin", foco: [960, 560, 1.05] },
];
const ANCLA_CIERRE = "Try it";

const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
const PALABRAS = VOZ.palabras as { t: string; ini: number; fin: number }[];

// Busca el índice de la palabra que arranca la frase `ancla`, a partir de `desde`.
const buscar = (ancla: string, desde: number) => {
  const partes = ancla.split(" ").map(norm);
  for (let i = desde; i <= PALABRAS.length - partes.length; i++) {
    if (partes.every((p, k) => norm(PALABRAS[i + k].t) === p)) return i;
  }
  throw new Error(`No encuentro "${ancla}" en la voz`);
};

const seg = (nombre: string) => {
  const e = GRABACION.escenas.find((x) => x.nombre === nombre);
  if (!e) throw new Error(`Falta la marca ${nombre} en ingles.json`);
  return e.seg;
};

const FIN_VOZ = PALABRAS[PALABRAS.length - 1].fin;
const DURACION = f(FIN_VOZ + COLA);
export const NEXO_INGLES_DURATION = DURACION;

// La línea de tiempo: cada momento con su inicio (en la voz), su duración y la
// velocidad con que se ve el tramo grabado para que entre justo.
const PLAN = (() => {
  let desdePalabra = 0;
  const inicios = MOMENTOS.map((m, i) => {
    const idx = buscar(m.ancla, desdePalabra);
    desdePalabra = idx + 1;
    return i === 0 ? 0 : f(Math.max(PALABRAS[idx].ini - ADELANTO, 0));
  });
  const idxCierre = buscar(ANCLA_CIERRE, desdePalabra);
  const inicioCierre = f(PALABRAS[idxCierre].ini - ADELANTO);
  return {
    cierre: inicioCierre,
    momentos: MOMENTOS.map((m, i) => {
      const fin = i + 1 < MOMENTOS.length ? inicios[i + 1] : inicioCierre;
      const duracion = fin - inicios[i];
      const crudo = seg(m.hasta) - seg(m.desde);
      // Entre 0,6x y 3x: más lento se vería arrastrado y más rápido no se entiende.
      const vel = Math.min(3, Math.max(0.6, crudo / (duracion / FPS)));
      return { ...m, inicio: inicios[i], duracion, origen: f(seg(m.desde)), vel };
    }),
  };
})();

// Los subtítulos: una frase por vez, de la primera a la última palabra de cada frase.
const SUBS = (() => {
  const frases = VOZ.texto.split(/(?<=[.!?])\s+/);
  let i = 0;
  return frases.map((texto) => {
    const n = texto.split(/\s+/).length;
    const ini = PALABRAS[i].ini;
    const fin = PALABRAS[i + n - 1].fin;
    i += n;
    return { texto, inicio: f(ini - 0.05), duracion: Math.max(f(fin - ini + 0.3), 12) };
  });
})();

const focoEn = (frame: number): Foco => {
  const ms = PLAN.momentos;
  const i = ms.findIndex((t) => frame < t.inicio + t.duracion);
  const n = i === -1 ? ms.length - 1 : Math.max(i, 0);
  const actual = ms[n];
  const anterior = ms[Math.max(n - 1, 0)];
  const p = progress(frame, actual.inicio, 7, ease.inOut);
  // Un empujón lento hacia adentro durante todo el momento: la imagen nunca queda quieta.
  const deriva = 1 + 0.05 * Math.min(Math.max((frame - actual.inicio) / actual.duracion, 0), 1);
  const base = [0, 1, 2].map((k) => anterior.foco[k] + (actual.foco[k] - anterior.foco[k]) * p);
  return [base[0], base[1], base[2] * deriva];
};

const Pantalla: React.FC = () => {
  const frame = useCurrentFrame();
  const [cx, cy, z] = focoEn(frame);
  const tx = Math.min(0, Math.max(1920 - 1920 * z, 960 - cx * z));
  const ty = Math.min(0, Math.max(1080 - 1080 * z, 540 - cy * z));
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${z})` }}>
      {PLAN.momentos.map((t) => (
        <Sequence key={`${t.desde}-${t.inicio}`} from={t.inicio} durationInFrames={t.duracion} layout="none">
          <OffthreadVideo
            src={staticFile("clips/ingles.mp4")}
            startFrom={t.origen}
            playbackRate={t.vel}
            muted
            style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080 }}
          />
        </Sequence>
      ))}
    </div>
  );
};

const Cierre: React.FC = () => {
  const frame = useCurrentFrame();
  const entra = progress(frame, 0, 10, ease.out);
  const qr = progress(frame, 5, 14, ease.out);
  return (
    <AbsoluteFill style={{ background: C.background, opacity: entra }}>
      <AbsoluteFill style={{ background: "radial-gradient(48% 58% at 50% 54%, rgba(96,165,250,0.12) 0%, transparent 70%)" }} />
      <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 120 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <Img src={staticFile("brand/nexo-icono.png")} style={{ width: 120, height: "auto" }} />
          <div style={{ fontFamily: brand.fontDisplay, fontSize: 120, fontWeight: 700, color: C.text, lineHeight: 1 }}>Start for free</div>
          <div style={{ fontFamily: brand.fontBody, fontSize: 44, color: "rgba(255,255,255,0.7)" }}>No sign up needed</div>
        </div>
        <Img
          src={staticFile("qr/probar-codigo.png")}
          style={{ width: 460, height: 460, borderRadius: 30, opacity: qr, transform: `scale(${0.94 + 0.06 * qr})` }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Subtitulo: React.FC<{ texto: string; duracion: number }> = ({ texto, duracion }) => {
  const frame = useCurrentFrame();
  const entra = progress(frame, 0, 5, ease.out);
  const sale = interpolate(frame, [duracion - 4, duracion], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: 56 }}>
      <div
        style={{
          fontFamily: brand.fontDisplay,
          fontSize: 50,
          fontWeight: 600,
          color: "#fff",
          padding: "12px 36px",
          borderRadius: 18,
          background: "rgba(10,10,10,0.86)",
          border: "1px solid rgba(255,255,255,0.16)",
          opacity: entra * sale,
          transform: `translateY(${(1 - entra) * 10}px)`,
        }}
      >
        {texto}
      </div>
    </AbsoluteFill>
  );
};

export const NexoIngles: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: brand.fontBody, background: "#0a0a0a" }}>
    <Pantalla />
    <Sequence from={PLAN.cierre} durationInFrames={DURACION - PLAN.cierre}>
      <Cierre />
    </Sequence>
    {SUBS.map((s) => (
      <Sequence key={s.inicio} from={s.inicio} durationInFrames={s.duracion}>
        <Subtitulo texto={s.texto} duracion={s.duracion} />
      </Sequence>
    ))}
    {GUIA ? <Audio src={staticFile("voz-guia/en-completo.mp3")} /> : null}
  </AbsoluteFill>
);
