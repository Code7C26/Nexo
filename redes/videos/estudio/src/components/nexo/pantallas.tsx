// Las pantallas de Nexo redibujadas para los videos, fieles a la app (mismos
// textos, cifras de los negocios de ejemplo, colores y tipografías). Cada una
// se anima con su propio tiempo (el cuadro 0 es cuando aparece) y exporta los
// cuadros de sus toques, para que el sonido caiga justo.
import React from "react";
import { Freeze, interpolate, interpolateColors, random, useCurrentFrame } from "remotion";
import { brand } from "../../brand/brand";
import { ease, progress } from "../../lib/motion";
import { ACENTO_SUAVE, C, Cursor, Encabezado, Encontrado, entra, Icon, Logo, OK_SUAVE, pesos, Tarjeta } from "./ui";

export const CLIENTE = "Juan Pérez";

// Paleta de series de la app (azul, naranja y aguamarina) y la de los canales.
const SERIE = { azul: "#60a5fa", naranja: "#f97316", agua: "#2dd4bf", gris: "#6b7280", verde: "#10b981" };

// ---------------------------------------------------------------- Comunes

const serie = (semilla: string, n: number, base: number, sube: number) =>
  Array.from({ length: n }, (_, i) => base + sube * (i / (n - 1)) + (random(`${semilla}-${i}`) - 0.5) * 0.45);

const puntos = (vals: number[], w: number, h: number) => {
  const max = Math.max(...vals);
  const min = Math.min(...vals) * 0.9;
  return vals.map((v, i) => [(i / (vals.length - 1)) * w, h - ((v - min) / (max - min)) * h] as const);
};

const Titulo: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ position: "absolute", left: 22, top: 18, fontFamily: brand.fontDisplay, fontWeight: 700, fontSize: 18, ...style }}>{children}</div>
);

/** Dona que se dibuja tramo por tramo. */
const Dona: React.FC<{ cx: number; cy: number; r: number; grosor: number; tramos: { valor: number; color: string }[]; p: number }> = ({ cx, cy, r, grosor, tramos, p }) => {
  const total = tramos.reduce((s, t) => s + t.valor, 0);
  let acum = 0;
  const L = 2 * Math.PI * r;
  return (
    <svg style={{ position: "absolute", left: cx - r - grosor, top: cy - r - grosor, overflow: "visible" }} width={2 * (r + grosor)} height={2 * (r + grosor)}>
      <g transform={`translate(${r + grosor} ${r + grosor}) rotate(-90)`}>
        <circle r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={grosor} />
        {tramos.map((t, k) => {
          const desde = acum / total;
          acum += t.valor;
          const hasta = acum / total;
          const visible = Math.max(0, Math.min(p, hasta) - desde);
          return (
            <circle
              key={k}
              r={r}
              fill="none"
              stroke={t.color}
              strokeWidth={grosor}
              strokeDasharray={`${Math.max(0, visible * L - 3)} ${L}`}
              strokeDashoffset={-desde * L}
            />
          );
        })}
      </g>
    </svg>
  );
};

/** QR dibujado (con sus tres esquinas), para el comprobante y el cobro. */
export const QR: React.FC<{ tam: number; semilla: string; hueco?: boolean }> = ({ tam, semilla, hueco }) => {
  const n = 25;
  const celdas: React.ReactNode[] = [];
  const esquina = (x: number, y: number) => {
    for (const [ox, oy] of [
      [0, 0],
      [n - 7, 0],
      [0, n - 7],
    ]) {
      const i = x - ox;
      const j = y - oy;
      if (i >= -1 && i <= 7 && j >= -1 && j <= 7) {
        if (i < 0 || i > 6 || j < 0 || j > 6) return 0;
        return i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4) ? 1 : 0;
      }
    }
    return -1;
  };
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const e = esquina(x, y);
      let oscuro = e === -1 ? random(`${semilla}-${x}-${y}`) > 0.52 : e === 1;
      if (hueco && x >= 9 && x <= 15 && y >= 9 && y <= 15) oscuro = false;
      if (oscuro) celdas.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} />);
    }
  }
  return (
    <svg width={tam} height={tam} viewBox={`-1 -1 ${n + 2} ${n + 2}`} shapeRendering="crispEdges" style={{ display: "block" }}>
      <rect x={-1} y={-1} width={n + 2} height={n + 2} fill="#fff" />
      <g fill="#000">{celdas}</g>
    </svg>
  );
};

// ---------------------------------------------------------------- Resumen

const KPIS = [
  { icono: "shopping-cart", titulo: "Ventas", valor: 5721800, delta: "109,4 %" },
  { icono: "trending-up", titulo: "Ganancia bruta", valor: 3159504, delta: "108,4 %" },
  { icono: "hand-coins", titulo: "Gastos operativos", valor: 486000, delta: null },
  { icono: "chart-column", titulo: "Resultado", valor: 2673504, delta: "159,6 %", verde: true },
];

const MAS_VENDIDO = [
  { nombre: "Remera básica", u: 64 },
  { nombre: "Jean mom", u: 41 },
  { nombre: "Buzo canguro", u: 33 },
  { nombre: "Medias x3", u: 29 },
  { nombre: "Gorra trucker", u: 22 },
];

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** El toque en "30 días", el recorrido del mouse por el gráfico y cuándo baja la página. */
export const RESUMEN_30_DIAS = 16;
const RECORRE = [64, 108] as const;
export const RESUMEN_BAJA = 114;

// Los 30 días del período: del 13/10 al 11/11 de 2026.
const DIA_SEMANA = ["dom.", "lun.", "mar.", "mié.", "jue.", "vie.", "sáb."];
const fecha = (i: number) => {
  const d = new Date(Date.UTC(2026, 9, 13 + i));
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return { corta: `${dd}/${mm}`, larga: `${DIA_SEMANA[d.getUTCDay()]} ${dd}/${mm}` };
};

export const Resumen: React.FC = () => {
  const frame = useCurrentFrame();
  const baja = 272 * progress(frame, RESUMEN_BAJA, 34, ease.inOut);
  const ventas = serie("ventas", 30, 1, 0.9);
  const ganancia = ventas.map((v, i) => v * 0.55 + (random(`g-${i}`) - 0.5) * 0.1);
  const W = 500;
  const H = 170;
  const max = Math.max(...ventas, ...ganancia);
  const xDe = (i: number) => (i / (ventas.length - 1)) * W;
  const yDe = (v: number) => H - (v / max) * H * 0.92;
  const pts = (vals: number[]) => vals.map((v, i) => `${xDe(i)},${yDe(v)}`);
  const area = `M0,${H} L${pts(ventas).join(" L")} L${W},${H} Z`;
  const dibujo = progress(frame, 24, 36, ease.inOut);
  const treinta = frame >= RESUMEN_30_DIAS;
  // El gráfico: arriba a la izquierda del dibujo, en la página.
  const G = { x: 58, y: 568 };
  const recorre = progress(frame, RECORRE[0], RECORRE[1] - RECORRE[0], ease.inOut);
  const dia = Math.round(3 + recorre * 23);
  const enGrafico = frame >= RECORRE[0] - 4 && frame < RESUMEN_BAJA;
  const sumaV = ventas.reduce((s, v) => s + v, 0);
  const sumaG = ganancia.reduce((s, v) => s + v, 0);
  const cartel = progress(frame, RECORRE[0] - 4, 8);
  const xCartel = xDe(dia) > W - 180 ? xDe(dia) - 176 : xDe(dia) + 14;
  return (
    <div style={{ position: "absolute", inset: 0, transform: `translateY(${-baja}px)` }}>
      <Encabezado titulo="Resumen" />
      <div style={{ position: "absolute", left: 28, top: 86, height: 40, display: "flex", padding: 4, gap: 2, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14.5 }}>
        {["Hoy", "7 días", "30 días", "Este mes", "Este año"].map((t) => {
          const activo = t === (treinta ? "30 días" : "7 días");
          return (
            <span
              key={t}
              style={{
                padding: "0 14px",
                display: "grid",
                placeItems: "center",
                borderRadius: 7,
                color: activo ? C.text : C.text2,
                background: activo ? "#1c1c1c" : undefined,
                fontWeight: activo ? 600 : 400,
              }}
            >
              {t}
            </span>
          );
        })}
      </div>
      <div style={{ position: "absolute", right: 28, top: 86, height: 40, display: "flex", alignItems: "center", padding: "0 14px", border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14.5, fontWeight: 600 }}>
        vs. período anterior
      </div>
      {KPIS.map((k, i) => {
        const cuenta = progress(frame, RESUMEN_30_DIAS + 2 + i * 4, 26);
        const linea = progress(frame, RESUMEN_30_DIAS + 6 + i * 4, 30, ease.inOut);
        const sp = puntos(serie(`kpi-${i}`, 16, 1, i === 2 ? 0 : 0.6), 150, 50);
        const ultimo = sp[sp.length - 1];
        return (
          <Tarjeta key={k.titulo} style={{ left: 28 + (i % 2) * 454, top: 146 + Math.floor(i / 2) * 164, width: 440, height: 150, ...entra(progress(frame, 6 + i * 4, 16)) }}>
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
            <div style={{ position: "absolute", left: 18, top: 106, display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: C.text2, opacity: progress(frame, RESUMEN_30_DIAS + 18 + i * 4, 10) }}>
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
              <circle cx={ultimo[0]} cy={ultimo[1]} r={4} fill={C.accent} opacity={progress(frame, RESUMEN_30_DIAS + 34 + i * 4, 6)} />
            </svg>
          </Tarjeta>
        );
      })}
      <Tarjeta style={{ left: 28, top: 476, width: 560, height: 300, ...entra(progress(frame, 20, 16)) }}>
        <Titulo>Ventas y ganancia</Titulo>
        <div style={{ position: "absolute", right: 22, top: 20, display: "flex", gap: 16, fontSize: 13.5, color: C.text2 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <i style={{ width: 10, height: 10, borderRadius: 3, background: C.accent }} />
            Ventas
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <i style={{ width: 13, height: 3, borderRadius: 2, background: "#d4d4d4" }} />
            Ganancia bruta
          </span>
        </div>
        <svg width={W} height={H} style={{ position: "absolute", left: 30, top: 92, overflow: "visible" }}>
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
          {enGrafico ? (
            <g opacity={cartel}>
              <line x1={xDe(dia)} x2={xDe(dia)} y1={0} y2={H} stroke="rgba(255,255,255,0.35)" strokeDasharray="3 3" />
              <circle cx={xDe(dia)} cy={yDe(ventas[dia])} r={5.5} fill={C.accent} stroke="#0f0f0f" strokeWidth={2} />
              <circle cx={xDe(dia)} cy={yDe(ganancia[dia])} r={5} fill="#d4d4d4" stroke="#0f0f0f" strokeWidth={2} />
            </g>
          ) : null}
        </svg>
        {[0, 7, 14, 21, 29].map((i) => (
          <div key={i} style={{ position: "absolute", left: 30 + xDe(i) - 18, top: 92 + H + 10, width: 36, textAlign: "center", fontSize: 11.5, color: C.muted, opacity: dibujo }}>
            {fecha(i).corta}
          </div>
        ))}
        {enGrafico ? (
          <div
            style={{
              position: "absolute",
              left: 30 + xCartel,
              top: 70,
              width: 168,
              padding: "9px 12px",
              borderRadius: 10,
              background: "#1a1a1a",
              border: `1px solid ${C.borderStrong}`,
              boxShadow: "0 12px 30px rgba(0,0,0,0.5)",
              fontSize: 12.5,
              lineHeight: 1.55,
              opacity: cartel,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13 }}>{fecha(dia).larga}</div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: C.text2 }}>Ventas</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{pesos((ventas[dia] / sumaV) * 5721800)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: C.text2 }}>Ganancia</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{pesos((ganancia[dia] / sumaG) * 3159504)}</span>
            </div>
          </div>
        ) : null}
      </Tarjeta>
      <Tarjeta style={{ left: 600, top: 476, width: 322, height: 300, ...entra(progress(frame, 24, 16)) }}>
        <Titulo>Dónde entró la plata</Titulo>
        <Dona
          cx={98}
          cy={170}
          r={64}
          grosor={22}
          p={progress(frame, 34, 34, ease.inOut)}
          tramos={[
            { valor: 45, color: SERIE.azul },
            { valor: 33, color: SERIE.agua },
            { valor: 22, color: SERIE.naranja },
          ]}
        />
        <div style={{ position: "absolute", left: 50, top: 154, width: 96, textAlign: "center", lineHeight: 1.15 }}>
          <div style={{ fontFamily: brand.fontDisplay, fontWeight: 700, fontSize: 15 }}>$ 5,47 M</div>
          <div style={{ fontSize: 11.5, color: C.text2 }}>cobrado</div>
        </div>
        {[
          ["Mercado Pago", "45 %", SERIE.azul],
          ["Efectivo", "33 %", SERIE.agua],
          ["Banco", "22 %", SERIE.naranja],
        ].map(([n, p, color], k) => (
          <div key={n} style={{ position: "absolute", left: 196, top: 120 + k * 36, fontSize: 13.5, ...entra(progress(frame, 44 + k * 6, 12), 8, 0) }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <i style={{ width: 9, height: 9, borderRadius: 3, background: color }} />
              {n}
            </div>
            <div style={{ color: C.text2, fontSize: 12.5, paddingLeft: 16 }}>{p}</div>
          </div>
        ))}
      </Tarjeta>
      <Tarjeta style={{ left: 28, top: 792, width: 440, height: 270 }}>
        <Titulo>Cuándo se vende</Titulo>
        {DIAS.map((d, f) => (
          <React.Fragment key={d}>
            <div style={{ position: "absolute", left: 22, top: 64 + f * 26, height: 22, display: "flex", alignItems: "center", fontSize: 12, color: C.text2 }}>{d}</div>
            {Array.from({ length: 12 }, (_, h) => {
              const tarde = h >= 7 ? 0.45 : h >= 3 && h <= 5 ? 0.25 : 0;
              const v = Math.min(1, tarde + (f === 5 ? 0.3 : 0) + random(`calor-${f}-${h}`) * 0.4);
              const p = progress(frame, RESUMEN_BAJA + 10 + (h + f) * 1.2, 10);
              return (
                <i
                  key={h}
                  style={{
                    position: "absolute",
                    left: 62 + h * 30,
                    top: 64 + f * 26,
                    width: 26,
                    height: 22,
                    borderRadius: 5,
                    background: `rgba(96,165,250,${0.08 + v * 0.82})`,
                    opacity: p,
                    transform: `scale(${0.85 + 0.15 * p})`,
                  }}
                />
              );
            })}
          </React.Fragment>
        ))}
        {["9 h", "12 h", "15 h", "18 h"].map((t, k) => (
          <div key={t} style={{ position: "absolute", left: 62 + k * 90, top: 248, fontSize: 11.5, color: C.muted }}>
            {t}
          </div>
        ))}
      </Tarjeta>
      <Tarjeta style={{ left: 482, top: 792, width: 440, height: 270 }}>
        <Titulo>Lo más vendido</Titulo>
        {MAS_VENDIDO.map((m, k) => {
          const p = progress(frame, RESUMEN_BAJA + 14 + k * 4, 20);
          return (
            <div key={m.nombre} style={{ position: "absolute", left: 22, right: 22, top: 64 + k * 40 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 6 }}>
                <span>{m.nombre}</span>
                <span style={{ color: C.text2, fontVariantNumeric: "tabular-nums" }}>{Math.round(m.u * p)} u.</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.06)" }}>
                <div style={{ height: 8, borderRadius: 4, width: `${(m.u / 64) * 100 * p}%`, background: k === 0 ? C.accent : "rgba(96,165,250,0.55)" }} />
              </div>
            </div>
          );
        })}
      </Tarjeta>
      <Cursor
        desde={4}
        hasta={RESUMEN_BAJA}
        toques={[RESUMEN_30_DIAS]}
        puntos={[
          { f: 4, x: 520, y: 330 },
          { f: RESUMEN_30_DIAS - 4, x: 206, y: 110 },
          { f: 34, x: 206, y: 110 },
          { f: RECORRE[0], x: G.x + xDe(3), y: G.y + 92 },
          { f: RECORRE[1], x: G.x + xDe(26), y: G.y + 92 },
        ]}
      />
    </div>
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

export const TOQUE_REMERA = 26;

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

export const Mostrador: React.FC = () => {
  const frame = useCurrentFrame();
  const t = TOQUE_REMERA;
  const pRenglon = progress(frame, t + 4, 12);
  const pOferta = progress(frame, t + 10, 10);
  const pTacha = progress(frame, t + 16, 8, ease.inOut);
  const total = interpolate(progress(frame, t + 20, 22), [0, 1], [24700, 37365]);
  const destello = interpolate(frame, [t + 20, t + 26, t + 50], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
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
        const esRemera = i === 0;
        const badge = esRemera ? (frame >= t + 2 ? 1 : 0) : pr.badge;
        const e = entra(progress(frame, 4 + i * 2, 12));
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
      <Tarjeta style={{ left: 568, top: 86, width: 354, height: 654, ...entra(progress(frame, 8, 14), 20, 0) }}>
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
        desde={8}
        hasta={80}
        toques={[t]}
        puntos={[
          { f: 8, x: 470, y: 640 },
          { f: t - 4, x: 160, y: 222 },
          { f: t + 22, x: 160, y: 222 },
          { f: t + 44, x: 300, y: 520 },
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
export const INICIO_TRAMO = (k: number) => 8 + k * 6;

export const Venta: React.FC = () => {
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
      <Tarjeta style={{ left: 28, top: 118, width: 894, height: 536, ...entra(progress(frame, 2, 14)) }}>
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
              transform: `scaleX(${progress(frame, INICIO_TRAMO(k), k === 4 ? 18 : 10)})`,
              transformOrigin: "left",
            }}
          />
        ))}
        {TRAMOS.map((tr, k) => {
          const quedo = k === 4;
          const monto = quedo ? tr.monto * progress(frame, INICIO_TRAMO(k), 22) : tr.monto;
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
                ...entra(progress(frame, INICIO_TRAMO(k), 12), 0, 10),
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

// ---------------------------------------------------------------- Factura

export const TOQUE_PDF = 28;

const Hoja: React.FC<{ children: React.ReactNode; style: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ position: "absolute", background: "#fff", color: "#111", fontFamily: brand.fontBody, boxShadow: "0 30px 80px rgba(0,0,0,0.6)", ...style }}>{children}</div>
);

const Dato: React.FC<{ t: string; v: string }> = ({ t, v }) => (
  <div>
    <b>{t}:</b> {v}
  </div>
);

/** La factura impresa, con el formato de las de ARCA (hist. §116). */
const FacturaImpresa: React.FC = () => (
  <>
    <div style={{ borderBottom: "1.5px solid #111", textAlign: "center", fontWeight: 700, letterSpacing: "0.3em", fontSize: 11, padding: "6px 0" }}>ORIGINAL</div>
    <div style={{ display: "flex", borderBottom: "1.5px solid #111", fontSize: 8.5, lineHeight: 1.45 }}>
      <div style={{ flex: 1, padding: "10px 12px" }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>INDUMENTARIA</div>
        <Dato t="Razón social" v="Indumentaria" />
        <Dato t="Domicilio comercial" v="Belgrano 315 - Córdoba" />
        <Dato t="Condición frente al IVA" v="IVA Responsable Inscripto" />
      </div>
      <div style={{ width: 70, borderLeft: "1.5px solid #111", borderRight: "1.5px solid #111", textAlign: "center" }}>
        <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.2, borderBottom: "1.5px solid #111" }}>B</div>
        <div style={{ fontSize: 7.5, paddingTop: 3 }}>COD. 006</div>
      </div>
      <div style={{ flex: 1, padding: "10px 12px" }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>FACTURA</div>
        <Dato t="Punto de venta" v="00003   Comp. nro: 00000124" />
        <Dato t="Fecha de emisión" v="11/11/2026" />
        <Dato t="CUIT" v="30-71234567-8" />
        <Dato t="Inicio de actividades" v="03/2021" />
      </div>
    </div>
    <div style={{ display: "flex", gap: 18, padding: "8px 12px", borderBottom: "1.5px solid #111", fontSize: 8.5, lineHeight: 1.5 }}>
      <div style={{ flex: 1 }}>
        <Dato t="Condición frente al IVA" v="Consumidor final" />
        <Dato t="Condición de venta" v="Contado" />
      </div>
      <div style={{ flex: 1 }}>
        <Dato t="Apellido y nombre" v={CLIENTE} />
      </div>
    </div>
    <div style={{ display: "flex", background: "#e5e5e5", fontWeight: 700, fontSize: 8, padding: "5px 12px" }}>
      <span style={{ flex: 1 }}>Producto / Servicio</span>
      <span style={{ width: 50, textAlign: "right" }}>Cantidad</span>
      <span style={{ width: 70, textAlign: "right" }}>Precio unit.</span>
      <span style={{ width: 70, textAlign: "right" }}>Subtotal</span>
    </div>
    {[
      ["Remera básica — Talle: M", "1,00", "12.665,00", "12.665,00"],
      ["Medias x3", "2,00", "5.900,00", "11.800,00"],
      ["Gorra trucker", "1,00", "12.900,00", "12.900,00"],
    ].map(([n, c, p, s]) => (
      <div key={n} style={{ display: "flex", fontSize: 8.5, padding: "6px 12px", borderBottom: "1px solid #ddd" }}>
        <span style={{ flex: 1 }}>{n}</span>
        <span style={{ width: 50, textAlign: "right" }}>{c}</span>
        <span style={{ width: 70, textAlign: "right" }}>{p}</span>
        <span style={{ width: 70, textAlign: "right" }}>{s}</span>
      </div>
    ))}
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 112, borderTop: "1.5px solid #111", padding: "10px 12px", display: "flex", justifyContent: "flex-end", fontSize: 9 }}>
      <div style={{ width: 210, lineHeight: 1.7 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <b>Subtotal: $</b>
          <span>37.365,00</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 800, borderTop: "1px solid #111", marginTop: 4, paddingTop: 4 }}>
          <span>Importe total: $</span>
          <span>37.365,00</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", color: "#444" }}>
          <span>IVA contenido: $</span>
          <span>6.484,67</span>
        </div>
      </div>
    </div>
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 18, height: 92, borderTop: "1.5px solid #111", display: "flex", alignItems: "center", gap: 14, padding: "0 12px", fontSize: 8.5 }}>
      <QR tam={72} semilla="factura" />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: 10 }}>Comprobante autorizado</div>
        <div>Esta factura contribuye al financiamiento de los servicios públicos.</div>
      </div>
      <div style={{ lineHeight: 1.6 }}>
        <Dato t="CAE N°" v="76458213904127" />
        <Dato t="Fecha de vto. de CAE" v="21/11/2026" />
      </div>
    </div>
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 4, textAlign: "center", fontSize: 7, color: "#888" }}>Comprobante de prueba – sin validez fiscal</div>
  </>
);

export const Factura: React.FC = () => {
  const frame = useCurrentFrame();
  const hundido = interpolate(frame, [TOQUE_PDF - 3, TOQUE_PDF, TOQUE_PDF + 6], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pHoja = progress(frame, TOQUE_PDF + 4, 18);
  const velo = progress(frame, TOQUE_PDF + 2, 10);
  return (
    <>
      <Encabezado titulo="Facturas" />
      <Tarjeta style={{ left: 28, top: 86, width: 894, height: 340, ...entra(progress(frame, 2, 14)) }}>
        <div style={{ position: "absolute", left: 26, top: 24, display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ fontFamily: brand.fontDisplay, fontWeight: 700, fontSize: 28 }}>Factura B</span>
          <span style={{ fontSize: 17, color: C.text2, fontVariantNumeric: "tabular-nums" }}>0003-00000124</span>
        </div>
        <span style={{ position: "absolute", right: 26, top: 26, display: "flex", alignItems: "center", gap: 7, padding: "5px 12px", borderRadius: 99, background: OK_SUAVE, color: C.ok, fontSize: 14, fontWeight: 600 }}>
          <Icon name="circle-check" size={15} color={C.ok} />
          Autorizada por ARCA
        </span>
        {[
          ["Cliente", `${CLIENTE} · Consumidor final`],
          ["Venta", "#1287 · 11/11/2026"],
          ["CAE", "76458213904127 · vence el 21/11/2026"],
        ].map(([t, v], k) => (
          <div key={t} style={{ position: "absolute", left: 26, top: 88 + k * 40, fontSize: 16, display: "flex", gap: 14, ...entra(progress(frame, 6 + k * 3, 12), 0, 8) }}>
            <span style={{ width: 70, color: C.text2 }}>{t}</span>
            <span>{v}</span>
          </div>
        ))}
        <div style={{ position: "absolute", right: 26, top: 92, textAlign: "right" }}>
          <div style={{ fontSize: 13, color: C.text2 }}>Total</div>
          <div style={{ fontFamily: brand.fontDisplay, fontWeight: 700, fontSize: 34 }}>$ 37.365,00</div>
        </div>
        <div style={{ position: "absolute", left: 26, top: 252, display: "flex", gap: 12 }}>
          {[
            ["printer", "Imprimir"],
            ["file-down", "PDF"],
            ["undo-2", "Nota de crédito"],
          ].map(([ic, t]) => (
            <span
              key={t}
              style={{
                height: 46,
                padding: "0 18px",
                display: "flex",
                alignItems: "center",
                gap: 9,
                border: `1px solid ${t === "PDF" && frame >= TOQUE_PDF ? C.accent : C.borderStrong}`,
                borderRadius: 11,
                fontSize: 16,
                fontWeight: 600,
                background: t === "PDF" && frame >= TOQUE_PDF ? ACENTO_SUAVE : undefined,
                transform: `scale(${t === "PDF" ? 1 - 0.05 * hundido : 1})`,
              }}
            >
              <Icon name={ic} size={18} color={C.text2} />
              {t}
            </span>
          ))}
        </div>
      </Tarjeta>
      <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${0.62 * velo})` }} />
      {frame >= TOQUE_PDF + 4 ? (
        <Hoja
          style={{
            left: 215,
            top: 32,
            width: 520,
            height: 735,
            opacity: pHoja,
            transform: `translateY(${(1 - pHoja) * 90}px) scale(${0.92 + 0.08 * pHoja})`,
            transformOrigin: "50% 100%",
          }}
        >
          <FacturaImpresa />
        </Hoja>
      ) : null}
      <Cursor
        desde={8}
        hasta={TOQUE_PDF + 10}
        toques={[TOQUE_PDF]}
        puntos={[
          { f: 8, x: 620, y: 620 },
          { f: TOQUE_PDF - 4, x: 205, y: 365 },
          { f: TOQUE_PDF + 10, x: 205, y: 365 },
        ]}
      />
    </>
  );
};

// ---------------------------------------------------------------- Compra desde la foto

const RENGLONES_COMPRA = [
  { codigo: "REM-BAS-S", papel: "Remera básica algodón - Talle S", nombre: "Remera básica — Talle: S", cant: "10", costo: "6.200", sub: "62.000" },
  { codigo: "REM-BAS-M", papel: "Remera básica algodón - Talle M", nombre: "Remera básica — Talle: M", cant: "15", costo: "6.200", sub: "93.000" },
  { codigo: "REM-BAS-L", papel: "Remera básica algodón - Talle L", nombre: "Remera básica — Talle: L", cant: "10", costo: "6.200", sub: "62.000" },
  { codigo: "BUZ-CAN-M", papel: "Buzo canguro frisa - Talle M", nombre: "Buzo canguro — Talle: M", cant: "8", costo: "17.500", sub: "140.000" },
  { codigo: "BUZ-CAN-L", papel: "Buzo canguro frisa - Talle L", nombre: "Buzo canguro — Talle: L", cant: "6", costo: "17.500", sub: "105.000" },
  { codigo: "JOG-FRI", papel: "Jogger frisa pack x 6", nombre: "Jogger frisa", cant: "12", costo: "13.200", sub: "158.400", pack: true },
];
export const ESCANEO = [6, 34] as const;
export const INICIO_RENGLON = (k: number) => 40 + k * 6;

/** La foto de la factura del proveedor (la de docs/pitch, con el cliente genérico). */
const FotoFactura: React.FC<{ escaneo: number }> = ({ escaneo }) => {
  const H = 470;
  return (
    <Hoja style={{ left: 28, top: 96, width: 330, height: H, transform: "rotate(-2deg)", overflow: "hidden", fontSize: 7.5, lineHeight: 1.45 }}>
      <div style={{ borderBottom: "1px solid #111", textAlign: "center", fontWeight: 700, letterSpacing: "0.3em", fontSize: 8, padding: "4px 0" }}>ORIGINAL</div>
      <div style={{ display: "flex", borderBottom: "1px solid #111" }}>
        <div style={{ flex: 1, padding: "6px 8px" }}>
          <div style={{ fontWeight: 800, fontSize: 10.5 }}>TEXTIL NORTE S.R.L.</div>
          <div>Av. Juan B. Justo 4520 - Córdoba</div>
          <div>IVA Responsable Inscripto</div>
        </div>
        <div style={{ width: 40, borderLeft: "1px solid #111", borderRight: "1px solid #111", textAlign: "center", fontSize: 22, fontWeight: 800 }}>A</div>
        <div style={{ flex: 1, padding: "6px 8px" }}>
          <div style={{ fontWeight: 800, fontSize: 10.5 }}>FACTURA</div>
          <div>Pto. de venta: 00004 Nro: 00012873</div>
          <div>Fecha: 12/11/2026</div>
        </div>
      </div>
      <div style={{ padding: "5px 8px", borderBottom: "1px solid #111" }}>
        <b>Razón social:</b> Indumentaria · <b>Cond. de venta:</b> Cuenta corriente 30 días
      </div>
      <div style={{ display: "flex", background: "#e5e5e5", fontWeight: 700, padding: "3px 8px" }}>
        <span style={{ width: 56 }}>Código</span>
        <span style={{ flex: 1 }}>Producto</span>
        <span style={{ width: 30, textAlign: "right" }}>Cant.</span>
        <span style={{ width: 50, textAlign: "right" }}>Subtotal</span>
      </div>
      {RENGLONES_COMPRA.map((r, k) => {
        const y = 118 + k * 22;
        const leido = escaneo * H > y + 10;
        return (
          <div key={r.codigo} style={{ display: "flex", padding: "4px 8px", borderBottom: "1px solid #ddd", background: leido ? "rgba(96,165,250,0.18)" : undefined }}>
            <span style={{ width: 56 }}>{r.codigo}</span>
            <span style={{ flex: 1 }}>{r.papel}</span>
            <span style={{ width: 30, textAlign: "right" }}>{r.pack ? "2" : r.cant}</span>
            <span style={{ width: 50, textAlign: "right" }}>{r.sub}</span>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 64, borderTop: "1px solid #111", padding: "6px 8px", textAlign: "right" }}>
        <div>Neto gravado: $ 620.400,00 · IVA 21 %: $ 130.284,00</div>
        <div style={{ fontWeight: 800, fontSize: 11 }}>Importe total: $ 750.684,00</div>
      </div>
      <div style={{ position: "absolute", left: 8, bottom: 8, display: "flex", gap: 8, alignItems: "center" }}>
        <QR tam={46} semilla="proveedor" />
        <div>
          <b>CAE N°:</b> 76458213904127
        </div>
      </div>
      {escaneo > 0 && escaneo < 1 ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: escaneo * H - 40,
            height: 44,
            background: "linear-gradient(transparent, rgba(96,165,250,0.35))",
            borderBottom: `2px solid ${C.accent}`,
            boxShadow: "0 6px 18px rgba(96,165,250,0.6)",
          }}
        />
      ) : null}
    </Hoja>
  );
};

export const Compra: React.FC = () => {
  const frame = useCurrentFrame();
  const escaneo = progress(frame, ESCANEO[0], ESCANEO[1] - ESCANEO[0], ease.inOut);
  const X = 392;
  return (
    <>
      <Encabezado
        titulo="Nueva compra"
        derecha={
          <span style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 99, background: ACENTO_SUAVE, color: C.accent, fontSize: 14.5, fontWeight: 600 }}>
            <Icon name="camera" size={16} color={C.accent} />
            Cargada desde la factura
          </span>
        }
      />
      <div style={{ position: "absolute", inset: 0, ...entra(progress(frame, 0, 12), 0, 20) }}>
        <FotoFactura escaneo={escaneo} />
      </div>
      <div style={{ position: "absolute", left: X, top: 92, fontSize: 14, color: C.text2, display: "flex", alignItems: "center", ...entra(progress(frame, 36, 10), 0, 6) }}>
        Proveedor <Encontrado />
      </div>
      <div
        style={{
          position: "absolute",
          left: X,
          right: 28,
          top: 120,
          height: 40,
          border: `1px solid ${C.borderStrong}`,
          borderRadius: 9,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 14px",
          fontSize: 15,
          ...entra(progress(frame, 36, 10), 0, 6),
        }}
      >
        <span>Textil Norte S.R.L.</span>
        <span style={{ color: C.text2, fontSize: 13.5 }}>Factura A · 0004-00012873</span>
      </div>
      {RENGLONES_COMPRA.map((r, k) => {
        const caja = (w: number, t: string, extra?: React.CSSProperties) => (
          <span style={{ width: w, height: 38, border: `1px solid ${C.borderStrong}`, borderRadius: 8, display: "flex", alignItems: "center", padding: "0 10px", fontSize: 14, flexShrink: 0, ...extra }}>{t}</span>
        );
        return (
          <div key={r.codigo} style={{ position: "absolute", left: X, top: 178 + k * 52, display: "flex", alignItems: "center", gap: 8, ...entra(progress(frame, INICIO_RENGLON(k), 12), 16, 0) }}>
            {caja(232, r.nombre)}
            {caja(52, r.cant, { justifyContent: "center" })}
            {caja(82, r.costo)}
            {r.pack ? (
              <span style={{ padding: "3px 9px", borderRadius: 99, background: ACENTO_SUAVE, color: C.accent, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>2 packs × 6</span>
            ) : (
              <Encontrado />
            )}
          </div>
        );
      })}
      <div style={{ position: "absolute", left: X, right: 28, top: 506, paddingTop: 14, borderTop: `1px solid ${C.border}`, ...entra(progress(frame, 80, 12), 0, 8) }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 700 }}>
          <span>Total:</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>$ 750.684,00</span>
        </div>
        <div style={{ fontSize: 13.5, color: C.text2, marginTop: 6 }}>IVA crédito fiscal: $ 130.284,00 · el costo queda sin IVA</div>
      </div>
      <div
        style={{
          position: "absolute",
          left: X,
          width: 230,
          top: 590,
          height: 46,
          borderRadius: 11,
          background: C.accent,
          color: "#04101f",
          display: "grid",
          placeItems: "center",
          fontWeight: 700,
          fontSize: 15.5,
          ...entra(progress(frame, 86, 12), 0, 8),
        }}
      >
        Confirmar compra
      </div>
    </>
  );
};

// ---------------------------------------------------------------- Venta online

const PEDIDOS = [
  { llega: -2, logo: "", icono: "message-circle", canal: "WhatsApp", detalle: "#1037 · Jean mom — Talle: 38", monto: 42900 },
  { llega: -1, logo: "", icono: "globe", canal: "Instagram", detalle: "#1039 · Buzo canguro — Talle: S", monto: 36900 },
  { llega: 30, logo: "tiendanube-nube", icono: "", canal: "Tienda Nube", detalle: "#1043 · 2 productos", monto: 38700 },
  { llega: 48, logo: "mercadolibre-emblema", icono: "", canal: "Mercado Libre", detalle: "Jean mom — Talle: 40", monto: 42900 },
];
export const LLEGADAS_PEDIDOS = PEDIDOS.filter((p) => p.llega > 0).map((p) => p.llega);
const ALTO_PEDIDO = 62;

export const Online: React.FC = () => {
  const frame = useCurrentFrame();
  const kpis = [
    { icono: "globe", t: "Ventas online", v: pesos(3723700 * progress(frame, 6, 22)), s: "65,1 % de lo vendido" },
    { icono: "file-text", t: "Pedidos online", v: String(Math.round(78 * progress(frame, 8, 22))), s: "En 3 canales" },
    { icono: "tag", t: "Ticket promedio", v: pesos(47740 * progress(frame, 10, 22)), s: "En el local, $ 60.128" },
    { icono: "trending-up", t: "Te quedó", v: pesos(2054529 * progress(frame, 12, 22)), s: "Después de comisiones y envíos", verde: true },
  ];
  return (
    <>
      <Encabezado
        titulo="Venta online"
        derecha={
          <span style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 14px", border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14.5, fontWeight: 600 }}>
            <Icon name="settings" size={16} color={C.text2} />
            Tus tiendas
          </span>
        }
      />
      {kpis.map((k, i) => (
        <Tarjeta key={k.t} style={{ left: 28 + i * 227, top: 84, width: 213, height: 118, ...entra(progress(frame, 2 + i * 2, 12)) }}>
          <div style={{ position: "absolute", left: 16, top: 14, display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: C.text2 }}>
            <Icon name={k.icono} size={15} color={C.text2} />
            {k.t}
          </div>
          <div style={{ position: "absolute", left: 16, top: 40, fontFamily: brand.fontDisplay, fontWeight: 700, fontSize: 27, fontVariantNumeric: "tabular-nums", color: k.verde ? C.ok : C.text }}>{k.v}</div>
          <div style={{ position: "absolute", left: 16, right: 12, top: 82, fontSize: 12, color: C.text2 }}>{k.s}</div>
        </Tarjeta>
      ))}
      <Tarjeta style={{ left: 28, top: 218, width: 522, height: 186, ...entra(progress(frame, 8, 12)) }}>
        <Titulo>Tiendas conectadas</Titulo>
        {[
          { logo: "tiendanube-logo", alto: 24, nota: "124 productos publicados" },
          { logo: "mercadolibre-logo", alto: 34, nota: "86 publicaciones vinculadas" },
        ].map((t, k) => (
          <div key={t.logo} style={{ position: "absolute", left: 22, right: 22, top: 60 + k * 60, height: 52, display: "flex", alignItems: "center", gap: 14, borderTop: k ? `1px solid ${C.border}` : undefined }}>
            <span style={{ width: 170 }}>
              <Logo nombre={t.logo} alto={t.alto} />
            </span>
            <span style={{ flex: 1, fontSize: 13.5, color: C.text2 }}>{t.nota}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 99, background: OK_SUAVE, color: C.ok, fontSize: 12.5, fontWeight: 600 }}>
              <i style={{ width: 7, height: 7, borderRadius: 9, background: C.ok }} />
              Conectada
            </span>
          </div>
        ))}
      </Tarjeta>
      <Tarjeta style={{ left: 28, top: 418, width: 522, height: 322, overflow: "hidden", ...entra(progress(frame, 12, 12)) }}>
        <Titulo>Últimos pedidos</Titulo>
        {PEDIDOS.map((p) => {
          const nuevo = p.llega > 0;
          if (nuevo && frame < p.llega) return null;
          const empuje = PEDIDOS.filter((o) => o.llega > p.llega).reduce((s, o) => s + (o.llega > 0 ? ALTO_PEDIDO * progress(frame, o.llega, 12, ease.inOut) : ALTO_PEDIDO), 0);
          const destello = nuevo ? interpolate(frame, [p.llega, p.llega + 6, p.llega + 40], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
          return (
            <div
              key={p.detalle}
              style={{
                position: "absolute",
                left: 14,
                right: 14,
                top: 54 + empuje,
                height: ALTO_PEDIDO - 8,
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "0 10px",
                borderRadius: 10,
                border: `1px solid rgba(96,165,250,${0.6 * destello})`,
                background: `rgba(96,165,250,${0.1 * destello})`,
                ...(nuevo ? entra(progress(frame, p.llega, 12), 0, -14) : {}),
              }}
            >
              <span style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(255,255,255,0.06)", display: "grid", placeItems: "center" }}>
                {p.logo ? <Logo nombre={p.logo} alto={p.logo === "tiendanube-nube" ? 14 : 18} /> : <Icon name={p.icono} size={16} color={C.text2} />}
              </span>
              <div style={{ flex: 1, lineHeight: 1.3 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>{p.canal}</div>
                <div style={{ fontSize: 12.5, color: C.text2 }}>{p.detalle}</div>
              </div>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{pesos(p.monto)}</span>
              <span style={{ padding: "2px 9px", borderRadius: 99, background: OK_SUAVE, color: C.ok, fontSize: 12, fontWeight: 600 }}>Cobrada</span>
            </div>
          );
        })}
      </Tarjeta>
      <Tarjeta style={{ left: 564, top: 218, width: 358, height: 522, ...entra(progress(frame, 10, 12)) }}>
        <Titulo>De dónde vienen</Titulo>
        <Dona
          cx={179}
          cy={170}
          r={86}
          grosor={24}
          p={progress(frame, 16, 34, ease.inOut)}
          tramos={[
            { valor: 28, color: SERIE.naranja },
            { valor: 21, color: SERIE.verde },
            { valor: 16, color: SERIE.azul },
            { valor: 35, color: SERIE.gris },
          ]}
        />
        <div style={{ position: "absolute", left: 109, top: 150, width: 140, textAlign: "center", lineHeight: 1.2 }}>
          <div style={{ fontFamily: brand.fontDisplay, fontWeight: 700, fontSize: 21 }}>$ 5.721.800</div>
          <div style={{ fontSize: 12.5, color: C.text2 }}>vendido</div>
        </div>
        {[
          ["Instagram", "28 %", "$ 1.581.800", SERIE.naranja],
          ["WhatsApp", "21 %", "$ 1.228.400", SERIE.verde],
          ["Tienda Nube", "16 %", "$ 913.500", SERIE.azul],
          ["El resto", "35 %", "$ 1.998.100", SERIE.gris],
        ].map(([n, p, m, color], k) => (
          <div key={n} style={{ position: "absolute", left: 24, right: 24, top: 300 + k * 52, display: "flex", justifyContent: "space-between", fontSize: 14, ...entra(progress(frame, 28 + k * 4, 12), 8, 0) }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <i style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
                {n}
              </div>
              <div style={{ fontSize: 12.5, color: C.text2, paddingLeft: 18 }}>{p}</div>
            </div>
            <span style={{ fontWeight: 600 }}>{m}</span>
          </div>
        ))}
      </Tarjeta>
    </>
  );
};

// ---------------------------------------------------------------- Cobro con Mercado Pago

export const TOQUE_MP = 18;
export const PAGO_APROBADO = 52;

export const Cobro: React.FC = () => {
  const frame = useCurrentFrame();
  const velo = progress(frame, 0, 10);
  const elegido = frame >= TOQUE_MP;
  const aprobado = frame >= PAGO_APROBADO;
  const pOk = progress(frame, PAGO_APROBADO, 12);
  const hundido = interpolate(frame, [TOQUE_MP - 3, TOQUE_MP, TOQUE_MP + 6], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <>
      <Freeze frame={84}>
        <Mostrador />
      </Freeze>
      <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${0.66 * velo})` }} />
      <div
        style={{
          position: "absolute",
          left: 235,
          top: 92,
          width: 480,
          height: 600,
          borderRadius: 16,
          background: "#101010",
          border: `1px solid ${C.borderStrong}`,
          boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
          ...entra(progress(frame, 2, 14), 0, 24),
        }}
      >
        <div style={{ position: "absolute", left: 26, top: 22, fontFamily: brand.fontDisplay, fontWeight: 700, fontSize: 22 }}>Cobrar</div>
        <div style={{ position: "absolute", right: 26, top: 16, fontFamily: brand.fontDisplay, fontWeight: 700, fontSize: 30 }}>$ 37.365,00</div>
        <div style={{ position: "absolute", left: 26, top: 74, fontSize: 13.5, color: C.text2 }}>Cómo paga</div>
        <div style={{ position: "absolute", left: 26, right: 26, top: 98, display: "flex", gap: 10 }}>
          {[
            ["banknote", "Efectivo"],
            ["building-2", "Transferencia"],
            ["mp", "Mercado Pago"],
          ].map(([ic, t]) => {
            const mp = ic === "mp";
            const activo = mp && elegido;
            return (
              <span
                key={t}
                style={{
                  flex: 1,
                  height: 74,
                  borderRadius: 11,
                  border: `1px solid ${activo ? C.accent : C.borderStrong}`,
                  background: activo ? ACENTO_SUAVE : undefined,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                  fontSize: 14,
                  fontWeight: 600,
                  transform: `scale(${mp ? 1 - 0.04 * hundido : 1})`,
                }}
              >
                {mp ? <Logo nombre="mercadopago-emblema" alto={22} /> : <Icon name={ic} size={20} color={C.text2} />}
                {t}
              </span>
            );
          })}
        </div>
        {elegido && !aprobado ? (
          <div style={{ position: "absolute", left: 0, right: 0, top: 196, display: "flex", flexDirection: "column", alignItems: "center", ...entra(progress(frame, TOQUE_MP + 4, 12), 0, 12) }}>
            <div style={{ position: "relative", padding: 10, background: "#fff", borderRadius: 12 }}>
              <QR tam={210} semilla="mercadopago" hueco />
              <span style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", background: "#fff", borderRadius: 8, padding: 4 }}>
                <Logo nombre="mercadopago-emblema" alto={26} />
              </span>
            </div>
            <div style={{ marginTop: 18, fontSize: 15 }}>Escaneá con la app de Mercado Pago</div>
            <div style={{ marginTop: 8, fontSize: 13.5, color: C.text2, display: "flex", gap: 6, alignItems: "center" }}>
              {[0, 1, 2].map((k) => (
                <i key={k} style={{ width: 6, height: 6, borderRadius: 9, background: C.accent, opacity: Math.floor(frame / 5 + k) % 3 === 0 ? 1 : 0.3 }} />
              ))}
              Esperando el pago
            </div>
          </div>
        ) : null}
        {aprobado ? (
          <div style={{ position: "absolute", left: 0, right: 0, top: 230, display: "flex", flexDirection: "column", alignItems: "center", ...entra(pOk, 0, 10) }}>
            <span style={{ width: 110, height: 110, borderRadius: 99, background: C.ok, display: "grid", placeItems: "center", transform: `scale(${0.9 + 0.1 * pOk})` }}>
              <Icon name="check" size={58} color="#03140a" stroke={3} />
            </span>
            <div style={{ marginTop: 22, fontFamily: brand.fontDisplay, fontWeight: 700, fontSize: 26 }}>Pago aprobado</div>
            <div style={{ marginTop: 8, fontSize: 14.5, color: C.text2, textAlign: "center", lineHeight: 1.5 }}>
              Entró a Mercado Pago, y la comisión
              <br />
              queda anotada sola en la venta.
            </div>
          </div>
        ) : null}
      </div>
      <Cursor
        desde={4}
        hasta={TOQUE_MP + 12}
        toques={[TOQUE_MP]}
        puntos={[
          { f: 4, x: 560, y: 520 },
          { f: TOQUE_MP - 4, x: 625, y: 230 },
          { f: TOQUE_MP + 12, x: 625, y: 230 },
        ]}
      />
    </>
  );
};

// ---------------------------------------------------------------- Asistente

const FRASE = `Vendí 2 gorras a ${CLIENTE}, me pagó por transferencia`;
export const ESCRIBE = [10, 36] as const;
export const ENVIA = 42;
export const PROPUESTA = 48;
export const CONFIRMA = 94;

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

export const Asistente: React.FC = () => {
  const frame = useCurrentFrame();
  const letras = Math.round(interpolate(frame, [...ESCRIBE], [0, FRASE.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const enviado = frame >= ENVIA + 1;
  const f = (k: number) => progress(frame, PROPUESTA + 4 + k * 5, 12);
  const confirmado = frame >= CONFIRMA + 3;
  const parpadeo = Math.floor(frame / 8) % 2 === 0;
  const hundido = interpolate(frame, [CONFIRMA - 3, CONFIRMA, CONFIRMA + 6], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <>
      <Encabezado titulo="Asistente" />
      <Tarjeta style={{ left: 28, top: 86, width: 894, height: 700, background: "#0d0d0d" }}>
        {enviado ? (
          <div style={{ position: "absolute", right: 16, top: 18, maxWidth: 640, padding: "12px 18px", borderRadius: 16, background: C.accent, color: "#04101f", fontSize: 17, ...entra(progress(frame, ENVIA + 2, 12), 0, 12) }}>
            {FRASE}
          </div>
        ) : null}
        {frame >= PROPUESTA ? (
          <div style={{ position: "absolute", left: 16, top: 80, width: 640, height: 384, border: `1px solid ${C.border}`, borderRadius: 14, background: "#101010", ...entra(progress(frame, PROPUESTA, 12), 0, 14) }}>
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
              <div style={{ position: "absolute", left: 20, top: 326, height: 44, display: "flex", alignItems: "center", gap: 10, fontSize: 17, fontWeight: 600, color: C.ok, ...entra(progress(frame, CONFIRMA + 3, 12), 0, 8) }}>
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
        <div style={{ position: "absolute", left: 16, right: 140, bottom: 16, height: 54, border: `1px solid ${C.accent}`, borderRadius: 12, display: "flex", alignItems: "center", padding: "0 16px", fontSize: 16.5 }}>
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
        desde={22}
        hasta={122}
        toques={[ENVIA, CONFIRMA]}
        puntos={[
          { f: 22, x: 640, y: 600 },
          { f: ENVIA - 4, x: 878, y: 744 },
          { f: 70, x: 878, y: 744 },
          { f: CONFIRMA - 4, x: 300, y: 532 },
          { f: 122, x: 300, y: 532 },
        ]}
      />
    </>
  );
};
