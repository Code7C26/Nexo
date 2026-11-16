// Nexo — el video en inglés: "un sábado en el local". Guion:
// storyboards/nexo-un-sabado.md. Una historia corta con tarjetas animadas (sin
// la app grabada): el dueño (Santino) le dicta una venta al asistente, el día
// pasa y las ventas entran solas, avisa el stock bajo, pide más y cierra la
// caja. El asistente es Nexo y su voz es la de Tosi, con un tratamiento que la
// distingue de la del dueño (scripts/voz-dialogo.py); lo que dice aparece
// escrito en su tarjeta, como contesta el asistente real, y en azul. Todo atado a la voz
// (voz/nexo-un-sabado.json, scripts/voz-dialogo.py): cambiar las frases
// grabadas reacomoda el video solo. Sin música; subtítulos en castellano.
import React from "react";
import { AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { brand } from "../brand/brand";
import { ease, progress } from "../lib/motion";
import { ACENTO_SUAVE, C, Cursor, entra, Icon, Logo, OK_SUAVE, pesos, sale, TituloFoco } from "../components/nexo/ui";
import { LETRAS } from "./NexoApertura";
import VOZ from "./voz/nexo-un-sabado.json";

// ---------------------------------------------------------------- Tiempos

type Frase = (typeof VOZ)[number] & { desde: number; fin: number };
const F: Record<string, Frase> = {};
const pon = (escena: string, desde: number) => {
  const v = VOZ.find((x) => x.escena === escena);
  if (!v) throw new Error(`Falta la frase "${escena}"`);
  F[escena] = { ...v, desde, fin: desde + v.cuadros };
  return F[escena];
};

// 1. La venta por voz.
pon("venta", 16);
const PROPUESTA = F.venta.fin + 4;
pon("confirmar", F.venta.fin + 12);
const CONFIRMA = F.confirmar.fin + 14;
const EFECTOS = CONFIRMA + 10;
// 2. El día pasa.
const DIA = EFECTOS + 3 * 8 + 40;
const LLEGADAS = [DIA + 16, DIA + 56, DIA + 96];
// 3. El stock bajo y la compra.
const AVISO = DIA + 136;
pon("aviso", AVISO + 12);
const ASISTENTE_COMPRA = F.aviso.fin + 4;
pon("pedido", F.aviso.fin + 22);
const COMPRA = F.pedido.fin + 4;
pon("listo", F.pedido.fin + 12);
const CONFIRMA_COMPRA = F.listo.fin + 12;
// 4. El cierre del día.
const CIERRE = CONFIRMA_COMPRA + 30;
pon("cierre", CIERRE + 18);
const CAJA_OK = F.cierre.desde + Math.round(F.cierre.cuadros * 0.55);
// 5. El lema.
const LEMA = F.cierre.fin + 24;
pon("lema", LEMA + 10);
pon("probar", F.lema.fin + 8);

export const NEXO_UN_SABADO_DURATION = F.probar.fin + 45;

// ---------------------------------------------------------------- Piezas

const FONDO_TARJETA = "#0f0f0f";
const tarjeta: React.CSSProperties = {
  position: "absolute",
  background: FONDO_TARJETA,
  border: `1px solid ${C.border}`,
  borderRadius: 20,
  boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
  fontFamily: brand.fontBody,
  color: C.text,
};

const Fondo: React.FC = () => {
  const frame = useCurrentFrame();
  const x = interpolate(frame, [0, NEXO_UN_SABADO_DURATION], [38, 62]);
  return (
    <AbsoluteFill style={{ background: C.background }}>
      <AbsoluteFill style={{ background: `radial-gradient(45% 55% at ${x}% 45%, rgba(96,165,250,0.12) 0%, transparent 70%)` }} />
      <AbsoluteFill style={{ background: "radial-gradient(120% 100% at 50% 50%, transparent 60%, rgba(0,0,0,0.85) 100%)" }} />
    </AbsoluteFill>
  );
};

/** Un momento de la historia: entra enfocándose y sale desenfocado. */
const Momento: React.FC<{ desde: number; hasta: number; children: React.ReactNode }> = ({ desde, hasta, children }) => {
  const frame = useCurrentFrame();
  if (frame < desde || frame > hasta) return null;
  return <AbsoluteFill style={{ ...entra(progress(frame, desde, 14), 0, 16), ...sale(frame, hasta - 8, 8) }}>{children}</AbsoluteFill>;
};

/** Aparece en `desde` (sube un poco y se enfoca). */
const Aparece: React.FC<{ desde: number; dx?: number; dy?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({
  desde,
  dx = 0,
  dy = 14,
  style,
  children,
}) => {
  const frame = useCurrentFrame();
  if (frame < desde) return null;
  return <div style={{ ...style, ...entra(progress(frame, desde, 14), dx, dy) }}>{children}</div>;
};

const Pastilla: React.FC<{ color: string; fondo: string; punto?: boolean; children: React.ReactNode }> = ({ color, fondo, punto, children }) => {
  const frame = useCurrentFrame();
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px", borderRadius: 99, background: fondo, color, fontSize: 17, fontWeight: 600 }}>
      {punto ? <span style={{ width: 8, height: 8, borderRadius: 9, background: color, opacity: 0.55 + 0.45 * Math.sin(frame * 0.3) }} /> : null}
      {children}
    </span>
  );
};

/** El ícono de Nexo: marca todo lo que dice o hace el asistente. */
const IconoNexo: React.FC<{ tam: number }> = ({ tam }) => <Img src={staticFile("brand/nexo-icono.png")} style={{ width: tam, height: "auto", flexShrink: 0 }} />;

const Encontrado: React.FC = () => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 12, padding: "3px 11px", borderRadius: 99, background: OK_SUAVE, color: C.ok, fontSize: 15 }}>
    <span style={{ width: 7, height: 7, borderRadius: 9, background: C.ok }} />
    found
  </span>
);

/** Las palabras de una frase, a medida que se dicen. */
const dicho = (f: Frase, frame: number) => {
  const palabras = f.texto.split(" ");
  const n = Math.ceil(palabras.length * interpolate(frame, [f.desde, f.desde + f.cuadros * 0.9], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return palabras.slice(0, n).join(" ");
};

/** El volumen de la frase que suena (0 si no habla nadie). */
const volumen = (frases: Frase[], frame: number): [number, string] => {
  const f = frases.find((x) => frame >= x.desde && frame < x.fin + 3);
  if (!f) return [0, ""];
  const k = frame - f.desde;
  const n = f.niveles;
  const leer = (i: number) => n[Math.max(0, Math.min(n.length - 1, i))] ?? 0;
  // Entre palabras la voz baja a cero: un piso y la raíz la mantienen viva.
  return [0.14 + 0.86 * Math.sqrt((leer(k - 1) + leer(k) * 2 + leer(k + 1)) / 4), f.quien];
};

/** La onda de la voz: se mueve con el volumen real de lo que se dice. */
const Onda: React.FC<{ frases: Frase[]; ancho: number; alto: number }> = ({ frases, ancho, alto }) => {
  const frame = useCurrentFrame();
  const [nivel, quien] = volumen(frases, frame);
  const N = 46;
  const color = quien === "tosi" ? C.accent : C.text;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, width: ancho, height: alto }}>
      {Array.from({ length: N }, (_, i) => {
        const forma = 0.3 + 0.7 * Math.abs(Math.sin(i * 1.9 + frame * 0.45) * Math.cos(i * 0.7 - frame * 0.23));
        const centro = 0.5 + 0.5 * Math.sin((Math.PI * i) / (N - 1));
        const h = 4 + (alto - 4) * nivel * forma * centro;
        return <span key={i} style={{ flex: 1, height: h, borderRadius: 9, background: nivel > 0.02 ? color : C.muted, opacity: nivel > 0.02 ? 1 : 0.5 }} />;
      })}
    </div>
  );
};

/** La tarjeta de Nexo, el asistente: escucha al dueño y contesta por escrito. */
const TarjetaAsistente: React.FC<{ x: number; y: number; ancho: number; usuario: Frase; respuesta: Frase }> = ({ x, y, ancho, usuario, respuesta }) => {
  const frame = useCurrentFrame();
  const estado =
    frame < usuario.fin ? (
      <Pastilla color={C.accent} fondo={ACENTO_SUAVE} punto>
        Listening
      </Pastilla>
    ) : frame < respuesta.desde ? (
      <Pastilla color={C.text2} fondo="rgba(255,255,255,0.06)" punto>
        Thinking
      </Pastilla>
    ) : (
      <Pastilla color={C.ok} fondo={OK_SUAVE}>
        Ready
      </Pastilla>
    );
  const loQueDice = dicho(usuario, frame);
  const contesta = frame >= respuesta.desde ? dicho(respuesta, frame) : "";
  return (
    <div style={{ ...tarjeta, left: x, top: y, width: ancho, padding: "26px 30px 30px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: brand.fontDisplay, fontWeight: 700, fontSize: 26 }}>
          <IconoNexo tam={30} />
          Nexo
        </span>
        {estado}
      </div>
      <div style={{ marginTop: 22 }}>
        <Onda frases={[usuario, respuesta]} ancho={ancho - 60} alto={64} />
      </div>
      <div style={{ marginTop: 20, minHeight: 64, fontSize: 25, lineHeight: 1.3, color: C.text }}>{loQueDice ? `“${loQueDice}”` : " "}</div>
      <div style={{ marginTop: 12, minHeight: 34, display: "flex", alignItems: "center", gap: 10, fontSize: 24, fontWeight: 600, color: C.accent, opacity: contesta ? 1 : 0 }}>
        <IconoNexo tam={22} />
        {contesta}
      </div>
    </div>
  );
};

const Fila: React.FC<{ etiqueta: string; children: React.ReactNode; style?: React.CSSProperties }> = ({ etiqueta, children, style }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0", borderTop: `1px solid ${C.border}`, ...style }}>
    <span style={{ fontSize: 19, color: C.muted }}>{etiqueta}</span>
    <span style={{ display: "flex", alignItems: "center", fontSize: 22, fontWeight: 600 }}>{children}</span>
  </div>
);

/** La operación que arma el asistente, para confirmar. */
const PROPUESTA_CAJA = { x: 960, y: 200, w: 790, h: 500 };
const BOTON = { x: PROPUESTA_CAJA.x + PROPUESTA_CAJA.w - 30 - 110, y: PROPUESTA_CAJA.y + PROPUESTA_CAJA.h - 30 - 29 };

const TarjetaOperacion: React.FC<{
  titulo: string;
  desde: number;
  confirma: number;
  hecho: string;
  estadoHecho: string;
  filas: [string, React.ReactNode][];
  renglon: [string, string, string];
  total: string;
}> = ({ titulo, desde, confirma, hecho, estadoHecho, filas, renglon, total }) => {
  const frame = useCurrentFrame();
  const listo = frame >= confirma;
  const pBoton = progress(frame, confirma, 10);
  return (
    <Aparece desde={desde} dx={40} dy={0} style={{ ...tarjeta, left: PROPUESTA_CAJA.x, top: PROPUESTA_CAJA.y, width: PROPUESTA_CAJA.w, height: PROPUESTA_CAJA.h, padding: "26px 30px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <span style={{ fontFamily: brand.fontDisplay, fontWeight: 700, fontSize: 30 }}>{titulo}</span>
        {listo ? (
          <Pastilla color={C.ok} fondo={OK_SUAVE}>
            {estadoHecho}
          </Pastilla>
        ) : (
          <Pastilla color={C.accent} fondo={ACENTO_SUAVE}>
            To confirm
          </Pastilla>
        )}
      </div>
      {filas.map(([etiqueta, valor], k) => (
        <Aparece key={etiqueta} desde={desde + 6 + k * 4}>
          <Fila etiqueta={etiqueta}>{valor}</Fila>
        </Aparece>
      ))}
      <Aparece desde={desde + 6 + filas.length * 4}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", margin: "6px 0", borderRadius: 12, background: "rgba(255,255,255,0.04)" }}>
          <span style={{ fontSize: 21, fontWeight: 600 }}>{renglon[0]}</span>
          <span style={{ fontSize: 19, color: C.text2 }}>{renglon[1]}</span>
          <span style={{ fontSize: 21, fontWeight: 600 }}>{renglon[2]}</span>
        </div>
      </Aparece>
      <Aparece desde={desde + 10 + filas.length * 4}>
        <Fila etiqueta="Total" style={{ borderTop: "none" }}>
          <span style={{ fontFamily: brand.fontDisplay, fontSize: 32, fontWeight: 700 }}>{total}</span>
        </Fila>
      </Aparece>
      <div style={{ position: "absolute", right: 30, bottom: 30, display: "flex", gap: 14 }}>
        <span style={{ padding: "14px 26px", borderRadius: 12, border: `1px solid ${C.borderStrong}`, color: C.text2, fontSize: 20, fontWeight: 600, opacity: 1 - pBoton }}>Discard</span>
        <span
          style={{
            width: 220,
            height: 58,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            borderRadius: 12,
            background: listo ? C.ok : C.accent,
            color: "#04101f",
            fontSize: 21,
            fontWeight: 700,
          }}
        >
          {listo ? (
            <>
              <Icon name="check" size={22} color="#04101f" stroke={3} />
              {hecho}
            </>
          ) : (
            "Confirm"
          )}
        </span>
      </div>
    </Aparece>
  );
};

/** El reloj de arriba: el día avanza. */
const HORAS: [number, string][] = [
  [0, "10:02 AM"],
  [LLEGADAS[0], "1:15 PM"],
  [LLEGADAS[1], "4:40 PM"],
  [LLEGADAS[2], "6:30 PM"],
  [AVISO, "6:58 PM"],
  [CIERRE, "8:30 PM"],
];
const horaEn = (frame: number) => {
  let k = 0;
  HORAS.forEach(([f], i) => (frame >= f ? (k = i) : null));
  return k;
};

const Reloj: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame >= LEMA) return null;
  const k = horaEn(frame);
  const p = progress(frame, HORAS[k][0], 10);
  const visible = Math.min(progress(frame, 4, 12), 1 - progress(frame, LEMA - 10, 8, ease.in));
  return (
    <div style={{ position: "absolute", right: 64, top: 48, display: "flex", alignItems: "baseline", gap: 12, fontFamily: brand.fontBody, opacity: visible }}>
      <span style={{ fontSize: 24, color: C.muted }}>Saturday</span>
      <span style={{ fontFamily: brand.fontDisplay, fontWeight: 700, fontSize: 30, color: C.text, ...entra(k === 0 ? 1 : p, 0, 10) }}>{HORAS[k][1]}</span>
    </div>
  );
};

// ---------------------------------------------------------------- 1. La venta por voz

const EFECTOS_LISTA: [string, string, string, string?][] = [
  ["package", "Stock", "12 → 9"],
  ["wallet", "Mercado Pago", "+ $ 38.700", C.ok],
  ["receipt-text", "Invoice B", "Issued"],
  ["trending-up", "Profit", "$ 17.400", C.ok],
];

const LaVenta: React.FC = () => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [PROPUESTA - 6, PROPUESTA + 14], [0, 1], { easing: ease.inOut, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <>
      <TarjetaAsistente x={600 - 430 * p} y={340 - 90 * p} ancho={720} usuario={F.venta} respuesta={F.confirmar} />
      <TarjetaOperacion
        titulo="Sale"
        desde={PROPUESTA}
        confirma={CONFIRMA}
        hecho="Sale #158"
        estadoHecho="Recorded"
        filas={[
          [
            "Customer",
            <>
              Juan Pérez
              <Encontrado />
            </>,
          ],
          ["Payment", <Logo key="mp" nombre="mercadopago-logo" alto={30} />],
        ]}
        renglon={["Black T-shirt · M", "3 × $ 12.900", "$ 38.700"]}
        total="$ 38.700"
      />
      <Cursor
        puntos={[
          { f: CONFIRMA - 28, x: 1500, y: 960 },
          { f: CONFIRMA - 3, x: BOTON.x, y: BOTON.y },
          { f: CONFIRMA + 40, x: BOTON.x + 30, y: BOTON.y + 70 },
        ]}
        toques={[CONFIRMA]}
        desde={CONFIRMA - 28}
        hasta={DIA - 6}
      />
      {EFECTOS_LISTA.map(([icono, etiqueta, valor, color], k) => (
        <Aparece key={etiqueta} desde={EFECTOS + k * 8} style={{ ...tarjeta, left: 170 + k * 400, top: 760, width: 380, height: 104, display: "flex", alignItems: "center", gap: 18, padding: "0 24px" }}>
          <span style={{ width: 52, height: 52, borderRadius: 14, background: ACENTO_SUAVE, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name={icono} size={26} color={C.accent} />
          </span>
          <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 18, color: C.muted }}>{etiqueta}</span>
            <span style={{ fontFamily: brand.fontDisplay, fontSize: 28, fontWeight: 700, color: color ?? C.text }}>{valor}</span>
          </span>
        </Aparece>
      ))}
    </>
  );
};

// ---------------------------------------------------------------- 2. El día pasa

const PEDIDOS: { f: number; marca: React.ReactNode; canal: string; detalle: string; monto: string; hora: string }[] = [
  { f: DIA, marca: <IconoNexo tam={30} />, canal: "Nexo · by voice", detalle: "Juan Pérez · 3 T-shirts", monto: "$ 38.700", hora: "10:02 AM" },
  { f: LLEGADAS[0], marca: <Logo nombre="tiendanube-nube" alto={26} />, canal: "Tienda Nube", detalle: "Order #1043 · 2 T-shirts", monto: "$ 25.800", hora: "1:15 PM" },
  { f: LLEGADAS[1], marca: <Logo nombre="mercadolibre-emblema" alto={30} />, canal: "Mercado Libre", detalle: "3 T-shirts", monto: "$ 38.700", hora: "4:40 PM" },
  { f: LLEGADAS[2], marca: <Icon name="store" size={30} color={C.text} />, canal: "Point of sale", detalle: "2 T-shirts · socks", monto: "$ 32.700", hora: "6:30 PM" },
];
const STOCK: [number, number][] = [
  [DIA, 9],
  [LLEGADAS[0], 7],
  [LLEGADAS[1], 4],
  [LLEGADAS[2], 2],
];
const VENTAS_HOY: [number, number][] = [
  [DIA, 1],
  [LLEGADAS[0], 9],
  [LLEGADAS[1], 16],
  [LLEGADAS[2], 21],
];

/** El último valor de la lista que ya llegó, y su índice. */
const valorEn = (lista: [number, number][], frame: number) => {
  let k = 0;
  lista.forEach(([f], i) => (frame >= f ? (k = i) : null));
  return k;
};

const ElDia: React.FC = () => {
  const frame = useCurrentFrame();
  const ks = valorEn(STOCK, frame);
  const stock = STOCK[ks][1];
  const pStock = ks === 0 ? 1 : progress(frame, STOCK[ks][0], 12);
  const barra = ks === 0 ? stock : interpolate(pStock, [0, 1], [STOCK[ks - 1][1], stock]);
  const ventas = VENTAS_HOY[valorEn(VENTAS_HOY, frame)][1];
  const k = horaEn(frame);
  const pHora = progress(frame, HORAS[k][0], 10);
  const bajo = stock <= 2;
  return (
    <>
      <div style={{ ...tarjeta, left: 170, top: 210, width: 520, height: 560, padding: "28px 32px" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 24, fontWeight: 600 }}>
          <Icon name="package" size={26} color={C.text2} />
          Black T-shirt · M
        </span>
        <div
          style={{
            marginTop: 70,
            fontFamily: brand.fontDisplay,
            fontWeight: 700,
            fontSize: 200,
            lineHeight: 1,
            letterSpacing: "-0.04em",
            color: bajo ? C.bad : C.text,
            ...entra(pStock, 0, 24),
          }}
        >
          {stock}
        </div>
        <div style={{ marginTop: 10, fontSize: 24, color: C.muted }}>in stock</div>
        <div style={{ position: "absolute", left: 32, right: 32, bottom: 40, height: 12, borderRadius: 9, background: "rgba(255,255,255,0.08)" }}>
          <div style={{ width: `${(barra / 12) * 100}%`, height: "100%", borderRadius: 9, background: bajo ? C.bad : C.accent }} />
        </div>
      </div>
      <div style={{ ...tarjeta, left: 730, top: 210, width: 1020, height: 560, padding: "28px 32px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18 }}>
          <span style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
            <span style={{ fontFamily: brand.fontDisplay, fontWeight: 700, fontSize: 54, letterSpacing: "-0.02em", ...entra(k === 0 ? 1 : pHora, 0, 12) }}>{HORAS[k][1]}</span>
            <span style={{ fontSize: 22, color: C.muted }}>Latest sales</span>
          </span>
          <span style={{ fontSize: 22, color: C.text2 }}>
            <b style={{ color: C.text, fontFamily: brand.fontDisplay, fontSize: 30 }}>{ventas}</b> sales today
          </span>
        </div>
        {PEDIDOS.map((p) => (
          <Aparece
            key={p.canal}
            desde={p.f}
            dx={0}
            dy={18}
            style={{ display: "flex", alignItems: "center", gap: 20, height: 92, padding: "0 20px", marginTop: 10, borderRadius: 14, background: frame < p.f + 30 && p.f !== DIA ? ACENTO_SUAVE : "rgba(255,255,255,0.035)" }}
          >
            <span style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>{p.marca}</span>
            <span style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
              <span style={{ fontSize: 23, fontWeight: 600 }}>{p.canal}</span>
              <span style={{ fontSize: 18, color: C.muted }}>{p.detalle}</span>
            </span>
            <span style={{ fontSize: 18, color: C.muted, width: 110, textAlign: "right" }}>{p.hora}</span>
            <span style={{ fontFamily: brand.fontDisplay, fontSize: 28, fontWeight: 700, width: 160, textAlign: "right" }}>{p.monto}</span>
          </Aparece>
        ))}
      </div>
    </>
  );
};

// ---------------------------------------------------------------- 3. El stock bajo y la compra

const ElAviso: React.FC = () => {
  const frame = useCurrentFrame();
  const pAviso = progress(frame, AVISO + 4, 16);
  const arriba = interpolate(frame, [ASISTENTE_COMPRA - 4, ASISTENTE_COMPRA + 14], [380, 90], { easing: ease.inOut, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <>
      <div
        style={{
          ...tarjeta,
          left: 580,
          top: arriba,
          width: 760,
          height: 104,
          display: "flex",
          alignItems: "center",
          gap: 20,
          padding: "0 26px",
          ...entra(pAviso, 0, -30),
        }}
      >
        <span style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(248,113,113,0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="bell" size={28} color={C.bad} />
        </span>
        <span style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
          <span style={{ fontSize: 23, fontWeight: 700 }}>Low stock</span>
          <span style={{ fontSize: 20, color: C.text2 }}>Black T-shirt · M · only 2 left</span>
        </span>
        <span style={{ fontSize: 18, color: C.muted }}>now</span>
      </div>
      <Aparece desde={ASISTENTE_COMPRA} dy={20}>
        <TarjetaAsistente x={170} y={250} ancho={720} usuario={F.pedido} respuesta={F.listo} />
      </Aparece>
      <TarjetaOperacion
        titulo="Purchase"
        desde={COMPRA}
        confirma={CONFIRMA_COMPRA}
        hecho="Purchase #41"
        estadoHecho="Ordered"
        filas={[
          [
            "Supplier",
            <>
              Textil Norte S.R.L.
              <Encontrado />
            </>,
          ],
          ["Arrives", "Tuesday"],
        ]}
        renglon={["Black T-shirt · M", "20 × $ 6.200", "$ 124.000"]}
        total="$ 124.000"
      />
      <Cursor
        puntos={[
          { f: CONFIRMA_COMPRA - 26, x: 1500, y: 960 },
          { f: CONFIRMA_COMPRA - 3, x: BOTON.x, y: BOTON.y },
          { f: CONFIRMA_COMPRA + 30, x: BOTON.x + 30, y: BOTON.y + 70 },
        ]}
        toques={[CONFIRMA_COMPRA]}
        desde={CONFIRMA_COMPRA - 26}
        hasta={CIERRE - 6}
      />
    </>
  );
};

// ---------------------------------------------------------------- 4. El cierre del día

const CIFRAS: [string, number, (n: number) => string, string?][] = [
  ["Sales", 23, (n) => String(n)],
  ["Revenue", 412300, (n) => pesos(n)],
  ["Profit", 186900, (n) => pesos(n), C.ok],
];

const ElCierre: React.FC = () => {
  const frame = useCurrentFrame();
  const pOk = progress(frame, CAJA_OK, 12);
  return (
    <>
      <div style={{ position: "absolute", left: 170, top: 170, display: "flex", alignItems: "baseline", gap: 18 }}>
        <span style={{ fontFamily: brand.fontDisplay, fontWeight: 700, fontSize: 54 }}>Today</span>
        <span style={{ fontSize: 24, color: C.muted }}>Saturday · closing</span>
      </div>
      {CIFRAS.map(([etiqueta, valor, formato, color], k) => {
        const p = progress(frame, CIERRE + 8 + k * 5, 40);
        return (
          <Aparece key={etiqueta} desde={CIERRE + 4 + k * 5} style={{ ...tarjeta, left: 170 + k * 535, top: 270, width: 510, height: 210, padding: "30px 34px" }}>
            <div style={{ fontSize: 22, color: C.muted }}>{etiqueta}</div>
            <div style={{ marginTop: 24, fontFamily: brand.fontDisplay, fontWeight: 700, fontSize: 76, letterSpacing: "-0.03em", color: color ?? C.text }}>{formato(Math.round(valor * p))}</div>
          </Aparece>
        );
      })}
      <Aparece desde={CIERRE + 22} style={{ ...tarjeta, left: 170, top: 520, width: 1580, height: 170, display: "flex", alignItems: "center", gap: 28, padding: "0 34px" }}>
        <span style={{ width: 64, height: 64, borderRadius: 16, background: ACENTO_SUAVE, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="wallet" size={32} color={C.accent} />
        </span>
        <span style={{ display: "flex", flexDirection: "column", gap: 6, width: 300 }}>
          <span style={{ fontSize: 26, fontWeight: 700 }}>Cash count</span>
          <span style={{ fontSize: 19, color: C.muted }}>Closing the register</span>
        </span>
        {[
          ["Expected", "$ 98.500"],
          ["Counted", "$ 98.500"],
          ["Difference", "$ 0"],
        ].map(([e, v]) => (
          <span key={e} style={{ display: "flex", flexDirection: "column", gap: 6, width: 240 }}>
            <span style={{ fontSize: 19, color: C.muted }}>{e}</span>
            <span style={{ fontFamily: brand.fontDisplay, fontSize: 32, fontWeight: 700 }}>{v}</span>
          </span>
        ))}
        <span style={{ marginLeft: "auto", ...entra(pOk, 0, 10) }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "12px 24px", borderRadius: 99, background: OK_SUAVE, color: C.ok, fontSize: 26, fontWeight: 700 }}>
            <Icon name="circle-check" size={28} color={C.ok} />
            OK
          </span>
        </span>
      </Aparece>
    </>
  );
};

// ---------------------------------------------------------------- 5. El lema

const ElLema: React.FC = () => {
  const frame = useCurrentFrame();
  const pIcono = progress(frame, LEMA + 2, 18);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: 120 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 34, marginBottom: 64 }}>
        <Img src={staticFile("brand/nexo-icono.png")} style={{ width: 120, height: "auto", ...entra(pIcono, 0, 10) }} />
        <svg viewBox="0 0 668 106" width={440} height={(440 * 106) / 668} style={{ display: "block", color: C.text, overflow: "visible" }}>
          <g fill="currentColor">
            {LETRAS.map((l, k) => {
              const p = progress(frame, LEMA + 8 + k * 4, 14);
              return (
                <g key={k} style={{ opacity: p, transform: `translateY(${(1 - p) * 14}px)`, filter: p < 1 ? `blur(${(1 - p) * 6}px)` : undefined }}>
                  {l}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <TituloFoco lineas={["Your whole business in one place."]} resaltar={["place"]} desde={F.lema.desde + 14} cada={4} tam={84} alinear="center" />
      <Aparece desde={F.probar.desde} style={{ marginTop: 52 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 14, padding: "16px 34px", borderRadius: 99, background: C.accent, color: "#04101f", fontFamily: brand.fontDisplay, fontWeight: 700, fontSize: 34 }}>
          Try it free · Scan the code
        </span>
      </Aparece>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Subtítulos y sonido

const FRASES = Object.values(F);

/** El subtítulo en castellano de lo que se dice: el dueño en blanco y Nexo en azul, con su ícono. */
const Subtitulos: React.FC = () => {
  const frame = useCurrentFrame();
  const v = FRASES.find((f) => frame >= f.desde - 2 && frame < f.fin + 10);
  if (!v) return null;
  const p = Math.min(progress(frame, v.desde - 2, 6), 1 - progress(frame, v.fin + 4, 6, ease.in));
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          top: 985,
          transform: `translateY(-50%) translateY(${(1 - p) * 8}px)`,
          padding: "10px 22px",
          borderRadius: 12,
          background: "rgba(0,0,0,0.72)",
          fontFamily: brand.fontBody,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontSize: 32,
          color: v.quien === "tosi" ? C.accent : C.text,
          opacity: p,
        }}
      >
        {v.quien === "tosi" ? <IconoNexo tam={30} /> : null}
        {v.sub}
      </div>
    </AbsoluteFill>
  );
};

const Sfx: React.FC<{ en: number; src: string; vol?: number }> = ({ en, src, vol = 0.4 }) => (
  <Sequence from={en} layout="none">
    <Audio src={staticFile(src)} volume={vol} />
  </Sequence>
);

const ENTRA = "sfx/ui/rollover2.ogg";
const CLICK = "sfx/ui/click2.ogg";
const TIC = "sfx/interface/click_005.ogg";
const LISTO = "sfx/interface/bong_001.ogg";

const Sonido: React.FC = () => (
  <>
    {FRASES.map((v) => (
      <Sequence key={v.archivo} from={v.desde} layout="none">
        <Audio src={staticFile(v.archivo)} volume={1} />
      </Sequence>
    ))}
    <Sfx en={2} src={ENTRA} vol={0.25} />
    <Sfx en={PROPUESTA} src={ENTRA} vol={0.25} />
    <Sfx en={CONFIRMA} src={CLICK} vol={0.6} />
    <Sfx en={CONFIRMA + 3} src={LISTO} vol={0.3} />
    {[0, 1, 2, 3].map((k) => (
      <Sfx key={k} en={EFECTOS + k * 8} src={TIC} vol={0.35} />
    ))}
    {LLEGADAS.map((f) => (
      <Sfx key={f} en={f} src={LISTO} vol={0.22} />
    ))}
    <Sfx en={AVISO + 4} src="sfx/interface/select_008.ogg" vol={0.3} />
    <Sfx en={COMPRA} src={ENTRA} vol={0.25} />
    <Sfx en={CONFIRMA_COMPRA} src={CLICK} vol={0.6} />
    <Sfx en={CONFIRMA_COMPRA + 3} src={LISTO} vol={0.3} />
    <Sfx en={CAJA_OK} src={LISTO} vol={0.3} />
    <Sfx en={LEMA + 4} src="sfx/impact/impactSoft_heavy_003.ogg" vol={0.4} />
  </>
);

// ---------------------------------------------------------------- Composición

export const NexoUnSabado: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: brand.fontBody, color: C.text }}>
    <Fondo />
    <Momento desde={0} hasta={DIA + 4}>
      <LaVenta />
    </Momento>
    <Momento desde={DIA} hasta={AVISO + 4}>
      <ElDia />
    </Momento>
    <Momento desde={AVISO} hasta={CIERRE + 4}>
      <ElAviso />
    </Momento>
    <Momento desde={CIERRE} hasta={LEMA + 4}>
      <ElCierre />
    </Momento>
    <Momento desde={LEMA} hasta={NEXO_UN_SABADO_DURATION + 20}>
      <ElLema />
    </Momento>
    <Reloj />
    <Subtitulos />
    <Sonido />
  </AbsoluteFill>
);
