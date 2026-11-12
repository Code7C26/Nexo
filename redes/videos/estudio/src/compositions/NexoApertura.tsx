// Nexo — Video 6: la apertura del pitch. Guion: storyboards/nexo-apertura.md.
// Sin voz: música bajita (scripts/musica-nexo.py) y los sonidos de cada toque.
// Los datos son de un negocio de ejemplo, con nombres genéricos.
import React from "react";
import { AbsoluteFill, Audio, Img, interpolate, interpolateColors, random, Sequence, staticFile, useCurrentFrame } from "remotion";
import { brand } from "../brand/brand";
import { ease, progress } from "../lib/motion";
import {
  ACENTO_SUAVE,
  Activo,
  C,
  Cambio,
  Cursor,
  Encabezado,
  Encontrado,
  entra,
  Icon,
  OK_SUAVE,
  pesos,
  sale,
  Tarjeta,
  TituloFoco,
  VentanaNexo,
} from "../components/nexo/ui";

// Escenas: [inicio, duración] en cuadros (30 fps).
const E = {
  gancho: [0, 75],
  resumen: [75, 105],
  mostrador: [180, 120],
  venta: [300, 105],
  asistente: [405, 140],
  funciones: [545, 105],
  rubros: [650, 115],
  logo: [765, 120],
} as const;

export const NEXO_APERTURA_DURATION = E.logo[0] + E.logo[1];

const NEGOCIO = "Indumentaria";
const CLIENTE = "Juan Pérez";

// ---------------------------------------------------------------- Fondo

const Fondo: React.FC = () => {
  const frame = useCurrentFrame();
  const x = interpolate(frame, [55, 95, 525, 565, E.logo[0], E.logo[0] + 30], [50, 70, 70, 50, 50, 38], {
    easing: ease.inOut,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame, [0, NEXO_APERTURA_DURATION], [42, 48]);
  const fuerza = interpolate(frame, [0, 20, E.logo[0], E.logo[0] + 30], [0.05, 0.13, 0.13, 0.2], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: C.background }}>
      <AbsoluteFill style={{ background: `radial-gradient(42% 52% at ${x}% ${y}%, rgba(96,165,250,${fuerza}) 0%, transparent 70%)` }} />
      <AbsoluteFill style={{ background: "radial-gradient(120% 100% at 50% 50%, transparent 60%, rgba(0,0,0,0.85) 100%)" }} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Títulos

const TituloIzquierda: React.FC<{ lineas: string[]; resaltar: string[]; dur: number }> = ({ lineas, resaltar, dur }) => (
  <AbsoluteFill style={{ justifyContent: "center", paddingLeft: 96, width: 620 }}>
    <TituloFoco lineas={lineas} resaltar={resaltar} desde={8} saleEn={dur - 8} tam={68} />
  </AbsoluteFill>
);

// ---------------------------------------------------------------- Resumen

const serie = (semilla: string, n: number, base: number, sube: number) =>
  Array.from({ length: n }, (_, i) => base + sube * (i / (n - 1)) + (random(`${semilla}-${i}`) - 0.5) * 0.45);

/** Puntos [x, y] de una serie dentro de un rectángulo de w × h. */
const puntos = (vals: number[], w: number, h: number) => {
  const max = Math.max(...vals);
  const min = Math.min(...vals) * 0.9;
  return vals.map((v, i) => [(i / (vals.length - 1)) * w, h - ((v - min) / (max - min)) * h] as const);
};

const KPIS = [
  { icono: "shopping-cart", titulo: "Ventas", valor: 5721800, delta: "109,4 %" },
  { icono: "trending-up", titulo: "Ganancia bruta", valor: 3159504, delta: "108,4 %" },
  { icono: "wallet", titulo: "Gastos operativos", valor: 486000, delta: null },
  { icono: "chart-column", titulo: "Resultado", valor: 2673504, delta: "159,6 %", verde: true },
];

const Resumen: React.FC = () => {
  const frame = useCurrentFrame();
  const ventas = serie("ventas", 30, 1, 0.9);
  const ganancia = ventas.map((v, i) => v * 0.55 + (random(`g-${i}`) - 0.5) * 0.1);
  const W = 834;
  const H = 150;
  const dibujo = progress(frame, 28, 44, ease.inOut);
  const max = Math.max(...ventas, ...ganancia);
  const pts = (vals: number[]) => vals.map((v, i) => `${(i / (vals.length - 1)) * W},${H - (v / max) * H * 0.92}`);
  const area = `M0,${H} L${pts(ventas).join(" L")} L${W},${H} Z`;
  return (
    <>
      <Encabezado titulo="Resumen" />
      <div style={{ position: "absolute", left: 28, top: 86, height: 40, display: "flex", padding: 4, gap: 2, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14.5 }}>
        {["Hoy", "7 días", "30 días", "Este mes", "Este año"].map((t) => (
          <span
            key={t}
            style={{
              padding: "0 14px",
              display: "grid",
              placeItems: "center",
              borderRadius: 7,
              color: t === "30 días" ? C.text : C.text2,
              background: t === "30 días" ? "#1c1c1c" : undefined,
              fontWeight: t === "30 días" ? 600 : 400,
            }}
          >
            {t}
          </span>
        ))}
      </div>
      <div style={{ position: "absolute", right: 28, top: 86, height: 40, display: "flex", alignItems: "center", padding: "0 14px", border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14.5, fontWeight: 600 }}>
        vs. período anterior
      </div>
      {KPIS.map((k, i) => {
        const p = progress(frame, 8 + i * 4, 16);
        const cuenta = progress(frame, 14 + i * 4, 26);
        const linea = progress(frame, 18 + i * 4, 30, ease.inOut);
        const sp = puntos(serie(`kpi-${i}`, 16, 1, i === 2 ? 0 : 0.6), 150, 50);
        const ultimo = sp[sp.length - 1];
        return (
          <Tarjeta key={k.titulo} style={{ left: 28 + (i % 2) * 454, top: 146 + Math.floor(i / 2) * 164, width: 440, height: 150, ...entra(p) }}>
            <div style={{ position: "absolute", left: 18, top: 16, display: "flex", alignItems: "center", gap: 10, fontSize: 15, color: C.text2 }}>
              <span style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(255,255,255,0.06)", display: "grid", placeItems: "center" }}>
                <Icon name={k.icono} size={16} color={C.text2} />
              </span>
              {k.titulo}
            </div>
            <div
              style={{
                position: "absolute",
                left: 18,
                top: 52,
                fontFamily: brand.fontDisplay,
                fontWeight: 700,
                fontSize: 40,
                letterSpacing: "-0.02em",
                fontVariantNumeric: "tabular-nums",
                color: k.verde ? C.ok : C.text,
              }}
            >
              {pesos(k.valor * cuenta)}
            </div>
            <div style={{ position: "absolute", left: 18, top: 106, display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: C.text2, opacity: progress(frame, 30 + i * 4, 10) }}>
              {k.delta ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 99, background: OK_SUAVE, color: C.ok, fontWeight: 600 }}>
                  <Icon name="arrow-up-right" size={13} color={C.ok} />
                  {k.delta}
                </span>
              ) : (
                <span style={{ fontWeight: 600 }}>0 %</span>
              )}
              vs. período anterior
            </div>
            <svg width={150} height={50} style={{ position: "absolute", right: 18, bottom: 22, overflow: "visible" }}>
              <polyline
                points={sp.map(([x, y]) => `${x},${y}`).join(" ")}
                fill="none"
                stroke="rgba(255,255,255,0.45)"
                strokeWidth={2}
                strokeLinejoin="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - linea}
              />
              <circle cx={ultimo[0]} cy={ultimo[1]} r={4} fill={C.accent} opacity={progress(frame, 46 + i * 4, 6)} />
            </svg>
          </Tarjeta>
        );
      })}
      <Tarjeta style={{ left: 28, top: 476, width: 894, height: 264, ...entra(progress(frame, 22, 16)) }}>
        <div style={{ position: "absolute", left: 22, top: 18, fontFamily: brand.fontDisplay, fontWeight: 700, fontSize: 19 }}>Ventas y ganancia</div>
        <div style={{ position: "absolute", right: 22, top: 20, display: "flex", gap: 18, fontSize: 14, color: C.text2 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <i style={{ width: 11, height: 11, borderRadius: 3, background: C.accent }} />
            Ventas
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <i style={{ width: 14, height: 3, borderRadius: 2, background: "#d4d4d4" }} />
            Ganancia bruta
          </span>
        </div>
        <svg width={W} height={H} style={{ position: "absolute", left: 30, top: 80, overflow: "visible" }}>
          <defs>
            <linearGradient id="bajo" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={C.accent} stopOpacity={0.32} />
              <stop offset="1" stopColor={C.accent} stopOpacity={0} />
            </linearGradient>
            <clipPath id="dibujo">
              <rect x={-4} y={-10} width={(W + 8) * dibujo} height={H + 20} />
            </clipPath>
          </defs>
          {[0, 0.5, 1].map((g) => (
            <line key={g} x1={0} x2={W} y1={H * g} y2={H * g} stroke="rgba(255,255,255,0.07)" />
          ))}
          <g clipPath="url(#dibujo)">
            <path d={area} fill="url(#bajo)" />
            <polyline points={pts(ventas).join(" ")} fill="none" stroke={C.accent} strokeWidth={2.5} strokeLinejoin="round" />
            <polyline points={pts(ganancia).join(" ")} fill="none" stroke="#d4d4d4" strokeOpacity={0.75} strokeWidth={2} strokeLinejoin="round" />
          </g>
        </svg>
      </Tarjeta>
    </>
  );
};

// ---------------------------------------------------------------- Punto de venta

const PRODUCTOS = [
  { nombre: "Remera básica — Talle: M", sku: "REM-BAS-M · Remeras", precio: 14900, disp: 23, badge: 0 },
  { nombre: "Medias x3", sku: "MED-X3 · Accesorios", precio: 6900, disp: 34, badge: 2 },
  { nombre: "Gorra trucker", sku: "GOR-TRU · Accesorios", precio: 12900, disp: 13, badge: 1 },
  { nombre: "Jean mom — Talle: 40", sku: "JEA-MOM-40 · Pantalones", precio: 42900, disp: 13, badge: 0 },
  { nombre: "Buzo canguro — Talle: M", sku: "BUZ-CAN-M · Buzos", precio: 36900, disp: 15, badge: 0 },
  { nombre: "Jogger frisa", sku: "JOG-FRI · Pantalones", precio: 28900, disp: 19, badge: 0 },
];

const TOQUE_REMERA = 46;

const Renglon: React.FC<{
  top: number;
  nombre: string;
  oferta?: string;
  antes?: number;
  precio: number;
  cant: number;
  p?: number;
  pOferta?: number;
  pTacha?: number;
}> = ({ top, nombre, oferta, antes, precio, cant, p = 1, pOferta = 1, pTacha = 1 }) => (
  <div style={{ position: "absolute", left: 18, right: 18, top, height: 108, borderTop: `1px solid ${C.border}`, ...entra(p, 0, 16) }}>
    <div style={{ position: "absolute", top: 12, fontSize: 15.5, fontWeight: 600 }}>{nombre}</div>
    <Icon name="trash-2" size={16} color={C.muted} style={{ position: "absolute", right: 0, top: 14 }} />
    {oferta ? <div style={{ position: "absolute", top: 34, fontSize: 13.5, fontWeight: 600, color: C.ok, ...entra(pOferta, 0, 6) }}>{oferta}</div> : null}
    <div style={{ position: "absolute", top: oferta ? 54 : 34, fontSize: 13.5, color: C.text2, display: "flex", gap: 6 }}>
      {antes ? (
        <span style={{ position: "relative" }}>
          {pesos(antes, true)}
          <i style={{ position: "absolute", left: 0, right: 0, top: "52%", height: 1.5, background: C.text2, transform: `scaleX(${pTacha})`, transformOrigin: "left" }} />
        </span>
      ) : null}
      <span style={{ opacity: antes ? pTacha : 1 }}>{pesos(precio, true)} c/u</span>
    </div>
    <div style={{ position: "absolute", top: 76, left: 0, height: 28, display: "flex", border: `1px solid ${C.borderStrong}`, borderRadius: 8, fontSize: 14 }}>
      <span style={{ width: 34, display: "grid", placeItems: "center" }}>
        <Icon name="minus" size={13} color={C.text2} />
      </span>
      <span style={{ width: 40, display: "grid", placeItems: "center", borderLeft: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, fontWeight: 600 }}>{cant}</span>
      <span style={{ width: 34, display: "grid", placeItems: "center" }}>
        <Icon name="plus" size={13} color={C.text2} />
      </span>
    </div>
    <div style={{ position: "absolute", top: 78, right: 0, fontSize: 16, fontWeight: 700, opacity: antes ? pTacha : 1 }}>{pesos(precio * cant, true)}</div>
  </div>
);

const Mostrador: React.FC = () => {
  const frame = useCurrentFrame();
  const t = TOQUE_REMERA;
  const pRenglon = progress(frame, t + 4, 14);
  const pOferta = progress(frame, t + 12, 10);
  const pTacha = progress(frame, t + 18, 8, ease.inOut);
  const total = interpolate(progress(frame, t + 24, 24), [0, 1], [24700, 37365]);
  const destello = interpolate(frame, [t + 24, t + 30, t + 56], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const hundido = interpolate(frame, [t - 3, t, t + 6], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <>
      <Encabezado
        titulo="Punto de venta"
        derecha={
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14.5, color: C.ok, fontWeight: 600 }}>
            <i style={{ width: 8, height: 8, borderRadius: 9, background: C.ok }} />
            Caja abierta <span style={{ color: C.text2, fontWeight: 400 }}>· Efectivo</span>
          </span>
        }
      />
      <div
        style={{
          position: "absolute",
          left: 28,
          top: 86,
          width: 520,
          height: 48,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 16px",
          border: `1px solid ${C.accent}`,
          borderRadius: 12,
          color: C.muted,
          fontSize: 15.5,
        }}
      >
        <Icon name="search" size={18} color={C.text2} />
        Nombre, SKU o código de barras
      </div>
      {PRODUCTOS.map((pr, i) => {
        const p = progress(frame, 6 + i * 3, 14);
        const esRemera = i === 0;
        const badge = esRemera ? (frame >= t + 2 ? 1 : 0) : pr.badge;
        const e = entra(p);
        return (
          <Tarjeta
            key={pr.nombre}
            style={{
              left: 28 + (i % 2) * 266,
              top: 150 + Math.floor(i / 2) * 128,
              width: 254,
              height: 116,
              ...e,
              transform: `${e.transform} scale(${esRemera ? 1 - 0.03 * hundido : 1})`,
              borderColor: esRemera && frame >= t ? "rgba(96,165,250,0.45)" : C.border,
            }}
          >
            <div style={{ position: "absolute", left: 16, right: 16, top: 14, fontSize: 15, fontWeight: 600, lineHeight: 1.25 }}>{pr.nombre}</div>
            <div style={{ position: "absolute", left: 16, top: 58, fontSize: 12.5, color: C.text2 }}>{pr.sku}</div>
            <div style={{ position: "absolute", left: 16, bottom: 12, fontFamily: brand.fontDisplay, fontSize: 19, fontWeight: 700 }}>{pesos(pr.precio, true)}</div>
            <div style={{ position: "absolute", right: 16, bottom: 14, fontSize: 12.5, color: C.text2 }}>{pr.disp} disp.</div>
            {badge ? (
              <span
                style={{
                  position: "absolute",
                  right: -9,
                  top: -9,
                  width: 26,
                  height: 26,
                  borderRadius: 99,
                  background: C.accent,
                  color: "#04101f",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 13,
                  fontWeight: 700,
                  ...(esRemera ? entra(progress(frame, t + 2, 8), 0, 4) : {}),
                }}
              >
                {badge}
              </span>
            ) : null}
          </Tarjeta>
        );
      })}
      <Tarjeta style={{ left: 568, top: 86, width: 354, height: 654, ...entra(progress(frame, 10, 16), 20, 0) }}>
        <div style={{ position: "absolute", left: 18, right: 18, top: 16, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontFamily: brand.fontDisplay, fontWeight: 700, fontSize: 21 }}>Venta</span>
          <span style={{ color: C.accent, fontSize: 14.5, fontWeight: 600 }}>Vaciar</span>
        </div>
        <div style={{ position: "absolute", left: 18, top: 52, fontSize: 13, color: C.text2 }}>Cliente</div>
        <div
          style={{
            position: "absolute",
            left: 18,
            right: 18,
            top: 72,
            height: 38,
            border: `1px solid ${C.borderStrong}`,
            borderRadius: 9,
            display: "flex",
            alignItems: "center",
            paddingLeft: 12,
            fontSize: 14.5,
            color: C.text2,
          }}
        >
          Consumidor final
        </div>
        <Renglon top={124} nombre="Medias x3" oferta="Llevando 2 medias, $5.900 cada una" antes={6900} precio={5900} cant={2} />
        <Renglon top={232} nombre="Gorra trucker" precio={12900} cant={1} />
        {frame >= t + 4 ? (
          <Renglon top={340} nombre="Remera básica — Talle: M" oferta="Semana de remeras: 15 % off" antes={14900} precio={12665} cant={1} p={pRenglon} pOferta={pOferta} pTacha={pTacha} />
        ) : null}
        <div style={{ position: "absolute", left: 18, right: 18, top: 500, paddingTop: 16, borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 17, fontWeight: 600 }}>Total</span>
          <span style={{ fontFamily: brand.fontDisplay, fontWeight: 700, fontSize: 34, fontVariantNumeric: "tabular-nums", color: interpolateColors(destello, [0, 1], [C.text, C.accent]) }}>
            {pesos(total, true)}
          </span>
        </div>
        <div style={{ position: "absolute", left: 18, right: 18, top: 582, height: 48, borderRadius: 11, background: C.accent, color: "#04101f", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 16 }}>
          Cobrar
        </div>
      </Tarjeta>
      <Cursor
        desde={16}
        hasta={104}
        toques={[t]}
        puntos={[
          { f: 16, x: 470, y: 640 },
          { f: t - 4, x: 160, y: 222 },
          { f: t + 30, x: 160, y: 222 },
          { f: t + 54, x: 300, y: 520 },
        ]}
      />
    </>
  );
};

// ---------------------------------------------------------------- Cuánto deja cada venta

const TRAMOS = [
  { nombre: "Mercadería", monto: 20250, pct: "45 %", color: "#8a8a8a", peso: 450 },
  { nombre: "Comisión de Mercado Pago", monto: 2880, pct: "6,4 %", color: "#2563eb", peso: 64 },
  { nombre: "Envío", monto: 3500, pct: "7,8 %", color: "#60a5fa", peso: 78 },
  { nombre: "Packaging", monto: 450, pct: "1 %", color: "rgba(96,165,250,0.45)", peso: 10 },
  { nombre: "Te quedó", monto: 17920, pct: "39,8 %", color: "#4ade80", peso: 398 },
];
const INICIO_TRAMO = (k: number) => 12 + k * 9;

const Venta: React.FC = () => {
  const frame = useCurrentFrame();
  const ANCHO = 838;
  const GAP = 4;
  const util = ANCHO - GAP * (TRAMOS.length - 1);
  let x = 0;
  const barras = TRAMOS.map((tr) => {
    const ancho = Math.max((tr.peso / 1000) * util, 5);
    const izq = x;
    x += ancho + GAP;
    return { izq, ancho };
  });
  return (
    <>
      <Encabezado
        titulo="Venta #1284"
        derecha={<span style={{ padding: "4px 12px", borderRadius: 99, background: OK_SUAVE, color: C.ok, fontSize: 14, fontWeight: 600 }}>Cobrada</span>}
      />
      <div style={{ position: "absolute", left: 28, top: 72, fontSize: 15.5, color: C.text2 }}>{CLIENTE} · 11/11/2026 · Mercado Pago</div>
      <Tarjeta style={{ left: 28, top: 118, width: 894, height: 536, ...entra(progress(frame, 4, 16)) }}>
        <div style={{ position: "absolute", left: 28, top: 30, fontFamily: brand.fontDisplay, fontWeight: 700, fontSize: 24 }}>Adónde fue la plata</div>
        <div style={{ position: "absolute", right: 28, top: 18, textAlign: "right" }}>
          <div style={{ fontSize: 13, color: C.text2 }}>Pagó el cliente</div>
          <div style={{ fontFamily: brand.fontDisplay, fontWeight: 700, fontSize: 32 }}>$ 45.000</div>
        </div>
        {TRAMOS.map((tr, k) => (
          <i
            key={tr.nombre}
            style={{
              position: "absolute",
              left: 28 + barras[k].izq,
              top: 96,
              width: barras[k].ancho,
              height: 24,
              borderRadius: 5,
              background: tr.color,
              transform: `scaleX(${progress(frame, INICIO_TRAMO(k), k === 4 ? 20 : 12)})`,
              transformOrigin: "left",
            }}
          />
        ))}
        {TRAMOS.map((tr, k) => {
          const quedo = k === 4;
          const monto = quedo ? tr.monto * progress(frame, INICIO_TRAMO(k), 24) : tr.monto;
          return (
            <div
              key={tr.nombre}
              style={{
                position: "absolute",
                left: 28,
                right: 28,
                top: 150 + k * 72,
                height: 72,
                display: "flex",
                alignItems: "center",
                borderTop: k ? `1px solid ${C.border}` : undefined,
                fontSize: quedo ? 23 : 19,
                fontWeight: quedo ? 700 : 400,
                ...entra(progress(frame, INICIO_TRAMO(k), 14), 0, 10),
              }}
            >
              <i style={{ width: 13, height: 13, borderRadius: 4, background: tr.color, marginRight: 14 }} />
              <span style={{ flex: 1 }}>{tr.nombre}</span>
              <span
                style={{
                  fontWeight: quedo ? 700 : 600,
                  fontVariantNumeric: "tabular-nums",
                  fontFamily: quedo ? brand.fontDisplay : undefined,
                  fontSize: quedo ? 28 : 19,
                  color: quedo ? C.ok : C.text,
                }}
              >
                {pesos(monto)}
              </span>
              <span style={{ width: 92, textAlign: "right", color: C.text2, fontSize: 16, fontWeight: 400 }}>{tr.pct}</span>
            </div>
          );
        })}
      </Tarjeta>
    </>
  );
};

// ---------------------------------------------------------------- Asistente

const FRASE = `Vendí 2 gorras a ${CLIENTE}, me pagó por transferencia`;
const ESCRIBE = [12, 42];
const ENVIA = 50;
const CONFIRMA = 108;

const Campo: React.FC<{ left: number; top: number; width: number; children: React.ReactNode; p: number }> = ({ left, top, width, children, p }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width,
      height: 42,
      border: `1px solid ${C.borderStrong}`,
      borderRadius: 9,
      display: "flex",
      alignItems: "center",
      padding: "0 14px",
      fontSize: 16,
      ...entra(p, 0, 8),
    }}
  >
    {children}
  </div>
);

const Asistente: React.FC = () => {
  const frame = useCurrentFrame();
  const letras = Math.round(interpolate(frame, ESCRIBE, [0, FRASE.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const enviado = frame >= ENVIA + 1;
  const pBurbuja = progress(frame, ENVIA + 2, 14);
  const pCard = progress(frame, 58, 14);
  const f = (k: number) => progress(frame, 62 + k * 5, 12);
  const confirmado = frame >= CONFIRMA + 3;
  const parpadeo = Math.floor(frame / 8) % 2 === 0;
  const hundido = interpolate(frame, [CONFIRMA - 3, CONFIRMA, CONFIRMA + 6], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <>
      <Encabezado titulo="Asistente" />
      <Tarjeta style={{ left: 28, top: 86, width: 894, height: 654, background: "#0d0d0d" }}>
        {enviado ? (
          <div
            style={{
              position: "absolute",
              right: 16,
              top: 18,
              maxWidth: 640,
              padding: "12px 18px",
              borderRadius: 16,
              background: C.accent,
              color: "#04101f",
              fontSize: 17,
              ...entra(pBurbuja, 0, 12),
            }}
          >
            {FRASE}
          </div>
        ) : null}
        {frame >= 58 ? (
          <div style={{ position: "absolute", left: 16, top: 80, width: 640, height: 384, border: `1px solid ${C.border}`, borderRadius: 14, background: "#101010", ...entra(pCard, 0, 14) }}>
            <div style={{ position: "absolute", left: 20, top: 16, fontSize: 17, fontWeight: 700 }}>Venta</div>
            <div style={{ position: "absolute", left: 20, top: 50, fontSize: 15, color: C.text2, display: "flex", alignItems: "center", ...entra(f(0), 0, 6) }}>
              Cliente <Encontrado />
            </div>
            <Campo left={20} top={80} width={600} p={f(0)}>
              {CLIENTE}
            </Campo>
            <Campo left={20} top={134} width={270} p={f(1)}>
              Gorra trucker
            </Campo>
            <Campo left={300} top={134} width={80} p={f(1)}>
              2
            </Campo>
            <Campo left={390} top={134} width={110} p={f(1)}>
              12900
            </Campo>
            <div style={{ position: "absolute", right: 20, top: 145, fontSize: 16, color: C.text2, ...entra(f(1), 0, 6) }}>{pesos(25800, true)}</div>
            <div style={{ position: "absolute", left: 20, right: 20, top: 196, display: "flex", justifyContent: "space-between", fontSize: 16.5, fontWeight: 700, ...entra(f(2), 0, 6) }}>
              <span>Total:</span>
              <span>{pesos(25800, true)}</span>
            </div>
            <div style={{ position: "absolute", left: 20, top: 232, fontSize: 15, color: C.text2, display: "flex", alignItems: "center", ...entra(f(3), 0, 6) }}>
              Cuenta <Encontrado />
            </div>
            <Campo left={20} top={262} width={600} p={f(3)}>
              <span style={{ flex: 1 }}>Banco</span>
              <Icon name="chevron-down" size={16} color={C.text2} />
            </Campo>
            {confirmado ? (
              <div
                style={{
                  position: "absolute",
                  left: 20,
                  top: 326,
                  height: 44,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 17,
                  fontWeight: 600,
                  color: C.ok,
                  ...entra(progress(frame, CONFIRMA + 3, 12), 0, 8),
                }}
              >
                <Icon name="circle-check" size={22} color={C.ok} />
                Venta #1285 registrada.
              </div>
            ) : (
              <div style={{ position: "absolute", left: 20, top: 322, display: "flex", gap: 12, ...entra(f(4), 0, 8) }}>
                <span style={{ height: 44, padding: "0 18px", border: `1px solid ${C.borderStrong}`, borderRadius: 10, display: "grid", placeItems: "center", fontSize: 16 }}>Descartar</span>
                <span
                  style={{
                    height: 44,
                    padding: "0 20px",
                    borderRadius: 10,
                    background: "#f5f5f5",
                    color: "#000",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 16,
                    fontWeight: 600,
                    transform: `scale(${1 - 0.04 * hundido})`,
                  }}
                >
                  Confirmar y registrar
                </span>
              </div>
            )}
          </div>
        ) : null}
        <div
          style={{
            position: "absolute",
            left: 16,
            right: 140,
            bottom: 16,
            height: 54,
            border: `1px solid ${C.accent}`,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            fontSize: 16.5,
          }}
        >
          {!enviado && letras > 0 ? (
            <span>
              {FRASE.slice(0, letras)}
              <i style={{ display: "inline-block", width: 2, height: 20, marginLeft: 2, verticalAlign: "-4px", background: parpadeo || frame < ESCRIBE[1] ? C.text : "transparent" }} />
            </span>
          ) : (
            <span style={{ color: C.muted }}>Contame qué pasó...</span>
          )}
        </div>
        <span style={{ position: "absolute", right: 76, bottom: 16, width: 54, height: 54, borderRadius: 99, border: `1px solid ${C.borderStrong}`, display: "grid", placeItems: "center" }}>
          <Icon name="message-circle" size={20} color={C.text2} />
        </span>
        <span style={{ position: "absolute", right: 16, bottom: 16, width: 54, height: 54, borderRadius: 99, background: C.accent, display: "grid", placeItems: "center" }}>
          <Icon name="send" size={20} color="#04101f" />
        </span>
      </Tarjeta>
      <Cursor
        desde={26}
        hasta={130}
        toques={[ENVIA, CONFIRMA]}
        puntos={[
          { f: 26, x: 640, y: 560 },
          { f: ENVIA - 4, x: 878, y: 698 },
          { f: 84, x: 878, y: 698 },
          { f: CONFIRMA - 4, x: 300, y: 532 },
          { f: 130, x: 300, y: 532 },
        ]}
      />
    </>
  );
};

// ---------------------------------------------------------------- Funciones y rubros

type Item = { icono: string; titulo: string; texto: string };

const FUNCIONES: Item[] = [
  { icono: "boxes", titulo: "Stock por depósito", texto: "Cada movimiento, anotado" },
  { icono: "wallet", titulo: "Caja y cuentas", texto: "Efectivo, banco y Mercado Pago" },
  { icono: "hand-coins", titulo: "Cuentas corrientes", texto: "Quién debe y cuánto" },
  { icono: "receipt-text", titulo: "Factura electrónica", texto: "Con CAE de ARCA" },
  { icono: "camera", titulo: "Compras desde la foto", texto: "La factura del proveedor, leída" },
  { icono: "file-text", titulo: "Presupuestos", texto: "Que pasan a venta" },
  { icono: "tag", titulo: "Listas de precios", texto: "Minorista, mayorista y ofertas" },
  { icono: "funnel", titulo: "CRM", texto: "Consultas y seguimiento" },
  { icono: "globe", titulo: "Venta online", texto: "Tienda Nube y Mercado Libre" },
  { icono: "undo-2", titulo: "Devoluciones", texto: "Con nota de crédito" },
  { icono: "bell", titulo: "Avisos en el celular", texto: "Ventas, pagos y stock bajo" },
  { icono: "history", titulo: "Auditoría", texto: "Cada cambio, con usuario y fecha" },
];

const RUBROS: Item[] = [
  { icono: "store", titulo: "Indumentaria", texto: "Talles y colores de cada producto" },
  { icono: "beef", titulo: "Carnicería", texto: "La etiqueta de la balanza" },
  { icono: "carrot", titulo: "Verdulería", texto: "Por kilo, rápido" },
  { icono: "cup-soda", titulo: "Kiosco y almacén", texto: "El lector de códigos" },
  { icono: "sprout", titulo: "Emprendimiento", texto: "Recetas y costo de producir" },
  { icono: "globe", titulo: "Tienda online", texto: "Un stock para todos los canales" },
  { icono: "briefcase", titulo: "Servicios", texto: "Presupuestos, trabajos y abonos" },
  { icono: "dumbbell", titulo: "Gimnasio", texto: "Socios, cuotas y la entrada" },
];

const Grilla: React.FC<{ items: Item[]; dur: number; top: number; alto: number; cada: number; vertical?: boolean }> = ({ items, dur, top, alto, cada, vertical }) => {
  const frame = useCurrentFrame();
  const ancho = 380;
  const gap = 20;
  const x0 = (1920 - (4 * ancho + 3 * gap)) / 2;
  return (
    <AbsoluteFill style={{ ...sale(frame, dur - 8, 8, 0, -10), fontFamily: brand.fontBody, color: C.text }}>
      {items.map((it, k) => (
        <div
          key={it.titulo}
          style={{
            position: "absolute",
            left: x0 + (k % 4) * (ancho + gap),
            top: top + Math.floor(k / 4) * (alto + gap),
            width: ancho,
            height: alto,
            borderRadius: 16,
            background: "rgba(15,15,15,0.92)",
            border: `1px solid ${C.border}`,
            display: "flex",
            flexDirection: vertical ? "column" : "row",
            alignItems: vertical ? "flex-start" : "center",
            gap: vertical ? 0 : 18,
            padding: vertical ? 26 : "0 22px",
            ...entra(progress(frame, 18 + k * cada, 14), 0, 18),
          }}
        >
          <span
            style={{
              width: vertical ? 54 : 48,
              height: vertical ? 54 : 48,
              flexShrink: 0,
              borderRadius: 13,
              background: ACENTO_SUAVE,
              display: "grid",
              placeItems: "center",
              marginBottom: vertical ? 22 : 0,
            }}
          >
            <Icon name={it.icono} size={vertical ? 26 : 23} color={C.accent} />
          </span>
          <div>
            <div style={{ fontFamily: brand.fontDisplay, fontWeight: 700, fontSize: vertical ? 27 : 21.5, letterSpacing: "-0.015em" }}>{it.titulo}</div>
            <div style={{ fontSize: vertical ? 17.5 : 15.5, color: C.text2, marginTop: 4 }}>{it.texto}</div>
          </div>
        </div>
      ))}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Logo

// El "NΞXO" del logo (frontend/img/marca.svg), una letra por grupo.
const LETRAS = [
  <>
    <rect x="0" y="3" width="13" height="100" />
    <rect x="97" y="3" width="13" height="100" />
    <polygon points="0,3 20,3 110,103 90,103" />
  </>,
  <>
    <rect x="195" y="3" width="103" height="13" />
    <rect x="195" y="47" width="103" height="13" />
    <rect x="195" y="90" width="103" height="13" />
  </>,
  <>
    <polygon points="374,3 394,3 488,103 468,103" />
    <polygon points="468,3 488,3 394,103 374,103" />
  </>,
  <ellipse cx="611.5" cy="52.5" rx="48.5" ry="45.5" fill="none" stroke="currentColor" strokeWidth="14" />,
];

const Logo: React.FC = () => {
  const frame = useCurrentFrame();
  const pIcono = progress(frame, 2, 18);
  const pBajada = progress(frame, 34, 18);
  // Mismo lugar y tamaño que el logo de la diapositiva 1 a 1920 × 1080: el
  // video se funde en ella sin que el logo salte.
  return (
    <AbsoluteFill>
      <Img
        src={staticFile("brand/nexo-icono.png")}
        style={{
          position: "absolute",
          left: 282,
          top: 376,
          width: 230,
          height: "auto",
          opacity: pIcono,
          transform: `scale(${0.96 + 0.04 * pIcono})`,
          filter: pIcono < 1 ? `blur(${(1 - pIcono) * 10}px)` : undefined,
        }}
      />
      <div style={{ position: "absolute", left: 568, top: 395 }}>
        <div>
          <svg viewBox="0 0 668 106" width={680} height={(680 * 106) / 668} style={{ display: "block", color: C.text, overflow: "visible" }}>
            <g fill="currentColor">
              {LETRAS.map((l, k) => {
                const p = progress(frame, 12 + k * 4, 14);
                return (
                  <g key={k} style={{ opacity: p, transform: `translateY(${(1 - p) * 14}px)`, filter: p < 1 ? `blur(${(1 - p) * 6}px)` : undefined }}>
                    {l}
                  </g>
                );
              })}
            </g>
          </svg>
          <div
            style={{
              marginTop: 22,
              lineHeight: 1.45,
              fontFamily: brand.fontDisplay,
              fontWeight: 500,
              fontSize: 19.2,
              textTransform: "uppercase",
              letterSpacing: `${0.18 + (1 - pBajada) * 0.12}em`,
              color: C.text2,
              opacity: pBajada,
            }}
          >
            Sistema de gestión para emprendimientos y pymes
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Sonido

const Sfx: React.FC<{ en: number; src: string; vol?: number }> = ({ en, src, vol = 0.4 }) => (
  <Sequence from={en} layout="none">
    <Audio src={staticFile(src)} volume={vol} />
  </Sequence>
);

const Sonido: React.FC = () => {
  const a = E.asistente[0];
  const teclas: number[] = [];
  for (let f = ESCRIBE[0]; f < ESCRIBE[1]; f += 2) teclas.push(f);
  return (
    <>
      <Audio src={staticFile("music/nexo-apertura.wav")} volume={0.32} />
      <Sfx en={E.resumen[0]} src="sfx/impact/impactSoft_medium_001.ogg" vol={0.35} />
      <Sfx en={E.resumen[0] + 40} src="sfx/interface/select_008.ogg" vol={0.18} />
      <Sfx en={E.mostrador[0]} src="sfx/ui/rollover2.ogg" vol={0.3} />
      <Sfx en={E.mostrador[0] + TOQUE_REMERA} src="sfx/ui/click2.ogg" vol={0.6} />
      <Sfx en={E.mostrador[0] + TOQUE_REMERA + 18} src="sfx/interface/select_008.ogg" vol={0.2} />
      <Sfx en={E.venta[0]} src="sfx/ui/rollover2.ogg" vol={0.3} />
      {[0, 1, 2, 3].map((k) => (
        <Sfx key={k} en={E.venta[0] + INICIO_TRAMO(k)} src="sfx/interface/click_005.ogg" vol={0.4} />
      ))}
      <Sfx en={E.venta[0] + INICIO_TRAMO(4)} src="sfx/interface/bong_001.ogg" vol={0.35} />
      <Sfx en={a} src="sfx/ui/rollover2.ogg" vol={0.3} />
      {teclas.map((f, k) => (
        <Sfx key={f} en={a + f} src={`sfx/keyboard/keypress-${String((k % 16) + 1).padStart(3, "0")}.wav`} vol={0.16} />
      ))}
      <Sfx en={a + ENVIA} src="sfx/ui/click2.ogg" vol={0.6} />
      <Sfx en={a + 58} src="sfx/ui/rollover2.ogg" vol={0.25} />
      <Sfx en={a + CONFIRMA} src="sfx/ui/click2.ogg" vol={0.6} />
      <Sfx en={a + CONFIRMA + 3} src="sfx/interface/bong_001.ogg" vol={0.35} />
      {[0, 4, 8].map((k) => (
        <Sfx key={k} en={E.funciones[0] + 18 + k * 3} src="sfx/ui/rollover2.ogg" vol={0.2} />
      ))}
      {[0, 4].map((k) => (
        <Sfx key={k} en={E.rubros[0] + 18 + k * 4} src="sfx/ui/rollover2.ogg" vol={0.2} />
      ))}
      <Sfx en={E.logo[0] + 2} src="sfx/impact/impactSoft_heavy_003.ogg" vol={0.45} />
    </>
  );
};

// ---------------------------------------------------------------- Composición

const ACTIVO: Activo = [
  { f: E.resumen[0], i: 0 },
  { f: E.mostrador[0], i: 2 },
  { f: E.venta[0], i: 3 },
  { f: E.asistente[0], i: 1 },
];

const PANTALLAS: [readonly [number, number], React.ReactNode][] = [
  [E.resumen, <Resumen key="r" />],
  [E.mostrador, <Mostrador key="m" />],
  [E.venta, <Venta key="v" />],
  [E.asistente, <Asistente key="a" />],
];

const Ventana: React.FC = () => {
  const frame = useCurrentFrame();
  const inicio = E.resumen[0];
  const fin = E.funciones[0];
  if (frame < inicio || frame > fin) return null;
  return (
    <AbsoluteFill style={{ ...entra(progress(frame, inicio, 20), 70, 0), ...sale(frame, fin - 10, 10, 30, 0) }}>
      <VentanaNexo negocio={NEGOCIO} rubro="Comercio general" activo={ACTIVO}>
        {PANTALLAS.map(([[desde, dur], el]) => (
          <Sequence key={desde} from={desde} durationInFrames={dur}>
            <Cambio dur={dur}>{el}</Cambio>
          </Sequence>
        ))}
      </VentanaNexo>
    </AbsoluteFill>
  );
};

const Titulo: React.FC<{ escena: readonly [number, number]; children: React.ReactNode }> = ({ escena, children }) => (
  <Sequence from={escena[0]} durationInFrames={escena[1]}>
    {children}
  </Sequence>
);

export const NexoApertura: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: brand.fontBody }}>
    <Fondo />
    <Titulo escena={E.gancho}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <TituloFoco lineas={["Todo el negocio,", "en un solo lugar."]} resaltar={["lugar"]} desde={6} saleEn={E.gancho[1] - 8} tam={104} alinear="center" />
      </AbsoluteFill>
    </Titulo>
    <Ventana />
    <Titulo escena={E.resumen}>
      <TituloIzquierda lineas={["El mes,", "de un vistazo."]} resaltar={["vistazo"]} dur={E.resumen[1]} />
    </Titulo>
    <Titulo escena={E.mostrador}>
      <TituloIzquierda lineas={["Las ofertas,", "solas."]} resaltar={["solas"]} dur={E.mostrador[1]} />
    </Titulo>
    <Titulo escena={E.venta}>
      <TituloIzquierda lineas={["Cuánto deja", "cada venta."]} resaltar={["venta"]} dur={E.venta[1]} />
    </Titulo>
    <Titulo escena={E.asistente}>
      <TituloIzquierda lineas={["Se dice,", "y Nexo la arma."]} resaltar={["arma"]} dur={E.asistente[1]} />
    </Titulo>
    <Titulo escena={E.funciones}>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 170 }}>
        <TituloFoco lineas={["Y todo lo demás, conectado."]} resaltar={["conectado"]} desde={6} saleEn={E.funciones[1] - 8} tam={64} alinear="center" />
      </AbsoluteFill>
      <Grilla items={FUNCIONES} dur={E.funciones[1]} top={330} alto={118} cada={3} />
    </Titulo>
    <Titulo escena={E.rubros}>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 170 }}>
        <TituloFoco lineas={["Y lo que cada rubro necesita."]} resaltar={["rubro"]} desde={6} saleEn={E.rubros[1] - 8} tam={64} alinear="center" />
      </AbsoluteFill>
      <Grilla items={RUBROS} dur={E.rubros[1]} top={320} alto={210} cada={4} vertical />
    </Titulo>
    <Titulo escena={E.logo}>
      <Logo />
    </Titulo>
    <Sonido />
  </AbsoluteFill>
);
