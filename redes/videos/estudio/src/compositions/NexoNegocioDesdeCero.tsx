// Nexo — Video 5: un negocio desde cero. Guion: storyboards/nexo-negocio-desde-cero.md.
// La app real, grabada con redes/videos/grabar/negocio-desde-cero.mjs, a pantalla
// completa y con un zoom que sigue lo que se hace.
// Va DENTRO de una diapositiva, de fondo, mientras el equipo habla: sin intro,
// sin outro, sin música, rápido y con a lo sumo una etiqueta de 2 o 3 palabras
// (nunca una frase ni una coma). Datos de un negocio de ejemplo.
import React from "react";
import { AbsoluteFill, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from "remotion";
import { brand } from "../brand/brand";
import { ease, progress } from "../lib/motion";
import GRABACION from "./negocio-desde-cero.json";

const FPS = 30;

// false = el mismo video sin ningún texto.
const CON_TEXTO = true;

// Qué tramo de la grabación (por el nombre de cada escena de escenas.json) va
// en cada escena del video, a qué velocidad, qué parte de la pantalla se
// agranda ([x, y, zoom] en píxeles de la grabación, 1920 × 1080) y qué etiqueta
// lleva (null = ninguna; tramos seguidos con la misma etiqueta comparten una).
type Tramo = {
  desde: string;
  hasta: string;
  vel: number;
  etiqueta: string | null;
  foco: [number, number, number];
};

const TRAMOS: Tramo[] = [
  { desde: "cuenta", hasta: "codigo", vel: 1.15, etiqueta: "Tu cuenta", foco: [960, 440, 1.4] },
  { desde: "codigo", hasta: "nombre", vel: 1, etiqueta: "Tu mail", foco: [960, 360, 1.45] },
  { desde: "nombre", hasta: "tipo", vel: 1, etiqueta: "Tu negocio", foco: [960, 360, 1.45] },
  { desde: "tipo", hasta: "secciones", vel: 1, etiqueta: "El tipo", foco: [770, 540, 1.15] },
  { desde: "secciones", hasta: "comprobantes", vel: 1, etiqueta: "Las secciones", foco: [960, 580, 1.1] },
  { desde: "comprobantes", hasta: "funcionando", vel: 1.2, etiqueta: null, foco: [960, 390, 1.4] },
  { desde: "funcionando", hasta: "creada", vel: 1, etiqueta: "Lo que ya tenías", foco: [960, 560, 1.25] },
  { desde: "ya-tenias", hasta: "te-deben", vel: 1.8, etiqueta: "Lo que ya tenías", foco: [1008, 420, 1.25] },
  { desde: "te-deben", hasta: "resumen", vel: 1.5, etiqueta: "Lo que ya tenías", foco: [1040, 420, 1.2] },
  { desde: "resumen", hasta: "fin", vel: 1, etiqueta: "Primeros pasos", foco: [960, 540, 1] },
];

const seg = (nombre: string) => {
  const e = GRABACION.escenas.find((x) => x.nombre === nombre);
  if (!e) throw new Error(`Falta la escena ${nombre} en negocio-desde-cero.json`);
  return e.seg;
};

const CAMBIO = 14; // cuadros que tarda el zoom en pasar de una escena a la otra

const PLAN = (() => {
  let inicio = 0;
  return TRAMOS.map((t) => {
    const duracion = Math.round(((seg(t.hasta) - seg(t.desde)) / t.vel) * FPS);
    const fila = { ...t, inicio, duracion, origen: Math.round(seg(t.desde) * FPS) };
    inicio += duracion;
    return fila;
  });
})();

export const NEXO_DESDE_CERO_DURATION = PLAN[PLAN.length - 1].inicio + PLAN[PLAN.length - 1].duracion;

// Las etiquetas: tramos seguidos con el mismo texto se juntan en una sola.
const ETIQUETAS = (() => {
  const lista: { texto: string; inicio: number; duracion: number }[] = [];
  for (const t of PLAN) {
    if (!t.etiqueta) continue;
    const ultima = lista[lista.length - 1];
    if (ultima && ultima.texto === t.etiqueta && ultima.inicio + ultima.duracion === t.inicio) ultima.duracion += t.duracion;
    else lista.push({ texto: t.etiqueta, inicio: t.inicio, duracion: t.duracion });
  }
  return lista;
})();

// A dónde mira el cuadro en cada momento: pasa suave del foco de una escena al
// de la siguiente.
const focoEn = (frame: number): [number, number, number] => {
  const i = PLAN.findIndex((t) => frame < t.inicio + t.duracion);
  const n = i === -1 ? PLAN.length - 1 : Math.max(i, 0);
  const actual = PLAN[n];
  const anterior = PLAN[Math.max(n - 1, 0)];
  const p = progress(frame, actual.inicio, CAMBIO, ease.inOut);
  return [0, 1, 2].map((k) => anterior.foco[k] + (actual.foco[k] - anterior.foco[k]) * p) as [number, number, number];
};

const Pantalla: React.FC = () => {
  const frame = useCurrentFrame();
  const [cx, cy, z] = focoEn(frame);
  // El punto (cx, cy) de la grabación va al centro del cuadro, sin salirse.
  const tx = Math.min(0, Math.max(1920 - 1920 * z, 960 - cx * z));
  const ty = Math.min(0, Math.max(1080 - 1080 * z, 540 - cy * z));
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${z})` }}>
      {PLAN.map((t) => (
        <Sequence key={t.desde} from={t.inicio} durationInFrames={t.duracion} layout="none">
          <OffthreadVideo
            src={staticFile("clips/negocio-desde-cero.mp4")}
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

const Etiqueta: React.FC<{ texto: string; duracion: number }> = ({ texto, duracion }) => {
  const frame = useCurrentFrame();
  const entra = progress(frame, 2, 8, ease.out);
  const sale = interpolate(frame, [duracion - 7, duracion - 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "flex-start", justifyContent: "flex-end", padding: "0 0 44px 48px" }}>
      <div
        style={{
          fontFamily: brand.fontDisplay,
          fontSize: 46,
          fontWeight: 700,
          color: "#fff",
          padding: "12px 34px",
          borderRadius: 999,
          background: "rgba(10,10,10,0.82)",
          border: "1px solid rgba(255,255,255,0.18)",
          boxShadow: "0 10px 40px rgba(0,0,0,0.45)",
          opacity: entra * sale,
          transform: `translateY(${(1 - entra) * 14}px)`,
        }}
      >
        {texto}
      </div>
    </AbsoluteFill>
  );
};

export const NexoNegocioDesdeCero: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: brand.fontBody, background: "#0a0a0a" }}>
    <Pantalla />
    {CON_TEXTO
      ? ETIQUETAS.map((e) => (
          <Sequence key={`${e.texto}-${e.inicio}`} from={e.inicio} durationInFrames={e.duracion}>
            <Etiqueta texto={e.texto} duracion={e.duracion} />
          </Sequence>
        ))
      : null}
  </AbsoluteFill>
);
