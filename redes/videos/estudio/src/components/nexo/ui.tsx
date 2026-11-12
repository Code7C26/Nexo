// Piezas de los videos de Nexo: el título que se enfoca palabra por palabra
// (el lenguaje de Studree), el cursor, y la ventana de la app con su menú.
import React from "react";
import { AbsoluteFill, Img, interpolate, interpolateColors, staticFile, useCurrentFrame } from "remotion";
import { brand } from "../../brand/brand";
import { ease, progress } from "../../lib/motion";
import { ICONS } from "./icons";
import { LOGOS } from "./logos";

export const C = brand.colors;
export const ACENTO_SUAVE = "rgba(96, 165, 250, 0.14)";
export const OK_SUAVE = "rgba(74, 222, 128, 0.12)";

/** "$ 5.721.800" o "$ 12.665,00" (como los muestra la app). */
export const pesos = (n: number, decimales = false) => {
  const entero = Math.round(decimales ? Math.floor(n) : n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `$ ${entero}${decimales ? "," + String(Math.round((n % 1) * 100)).padStart(2, "0") : ""}`;
};

export const Icon: React.FC<{ name: string; size?: number; color?: string; stroke?: number; style?: React.CSSProperties }> = ({
  name,
  size = 20,
  color = "currentColor",
  stroke = 2,
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0, ...style }}
    dangerouslySetInnerHTML={{ __html: ICONS[name] ?? "" }}
  />
);

/** Entrada de Studree: aparece, sube unos px y se enfoca. Nunca escala desde 0. */
export const entra = (p: number, dx = 0, dy = 14): React.CSSProperties => ({
  opacity: p,
  transform: `translate(${(1 - p) * dx}px, ${(1 - p) * dy}px)`,
  filter: p < 1 ? `blur(${(1 - p) * 8}px)` : undefined,
});

/** Salida: más corta que la entrada, se desenfoca. */
export const sale = (frame: number, desde: number, dur = 8, dx = 0, dy = -12): React.CSSProperties => {
  const p = progress(frame, desde, dur, ease.in);
  if (p <= 0) return {};
  return {
    opacity: 1 - p,
    transform: `translate(${p * dx}px, ${p * dy}px)`,
    filter: `blur(${p * 8}px)`,
  };
};

/**
 * Título palabra por palabra: cada palabra entra desenfocada y gris y se
 * enfoca a blanco; las de `resaltar` terminan en azul. `saleEn` la hace salir.
 */
export const TituloFoco: React.FC<{
  lineas: string[];
  resaltar?: string[];
  desde?: number;
  saleEn?: number;
  tam?: number;
  alinear?: "left" | "center";
  cada?: number;
}> = ({ lineas, resaltar = [], desde = 0, saleEn, tam = 72, alinear = "left", cada = 5 }) => {
  const frame = useCurrentFrame();
  let i = 0;
  return (
    <div
      style={{
        fontFamily: brand.fontDisplay,
        fontWeight: 700,
        fontSize: tam,
        lineHeight: 1.08,
        letterSpacing: "-0.03em",
        textAlign: alinear,
        color: C.text,
        ...(saleEn !== undefined ? sale(frame, saleEn, 8) : {}),
      }}
    >
      {lineas.map((linea, li) => (
        <div key={li}>
          {linea.split(" ").map((w, wi, arr) => {
            const p = progress(frame, desde + i++ * cada, 12);
            const limpia = w.replace(/[.,!?¿¡]/g, "");
            const final = resaltar.includes(limpia) ? C.accent : C.text;
            return (
              <React.Fragment key={wi}>
                <span
                  style={{
                    display: "inline-block",
                    opacity: p,
                    color: interpolateColors(p, [0, 0.6, 1], [C.muted, C.muted, final]),
                    transform: `translateY(${(1 - p) * 8}px)`,
                    filter: p < 1 ? `blur(${(1 - p) * 10}px)` : undefined,
                  }}
                >
                  {w}
                </span>
                {wi < arr.length - 1 ? " " : null}
              </React.Fragment>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export type Punto = { f: number; x: number; y: number };

const posicion = (frame: number, puntos: Punto[]) => {
  if (frame <= puntos[0].f) return puntos[0];
  for (let k = 0; k < puntos.length - 1; k++) {
    const a = puntos[k];
    const b = puntos[k + 1];
    if (frame <= b.f) {
      const t = interpolate(frame, [a.f, b.f], [0, 1], { easing: ease.inOut, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      return { f: frame, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  }
  return puntos[puntos.length - 1];
};

/** Cursor que va de punto en punto y "toca" en los cuadros de `toques`. */
export const Cursor: React.FC<{ puntos: Punto[]; toques?: number[]; desde: number; hasta: number }> = ({
  puntos,
  toques = [],
  desde,
  hasta,
}) => {
  const frame = useCurrentFrame();
  if (frame < desde || frame > hasta) return null;
  const { x, y } = posicion(frame, puntos);
  const visible = Math.min(progress(frame, desde, 6), 1 - progress(frame, hasta - 6, 6, ease.in));
  const hundido = toques.reduce(
    (m, t) => Math.max(m, interpolate(frame, [t - 3, t, t + 6], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })),
    0,
  );
  return (
    <>
      {toques.map((t) => {
        const p = progress(frame, t, 16);
        if (frame < t || p >= 1) return null;
        const pt = posicion(t, puntos);
        return (
          <div
            key={t}
            style={{
              position: "absolute",
              left: pt.x - 28,
              top: pt.y - 28,
              width: 56,
              height: 56,
              borderRadius: 99,
              border: `2px solid ${C.accent}`,
              opacity: (1 - p) * 0.8,
              transform: `scale(${0.4 + p * 0.8})`,
            }}
          />
        );
      })}
      <svg
        width={30}
        height={30}
        viewBox="0 0 24 24"
        style={{
          position: "absolute",
          left: x - 5,
          top: y - 3,
          opacity: visible,
          transform: `scale(${1 - 0.16 * hundido})`,
          transformOrigin: "5px 3px",
          filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.6))",
        }}
      >
        <path d="M5 3l14 7.5-6.2 1.6-3 5.9z" fill="#fff" stroke="#000" strokeWidth={1.3} strokeLinejoin="round" />
      </svg>
    </>
  );
};

/** Contenido que entra desde la derecha y sale hacia la izquierda (en su propia Sequence). */
export const Cambio: React.FC<{ dur: number; children: React.ReactNode }> = ({ dur, children }) => {
  const frame = useCurrentFrame();
  const p = progress(frame, 0, 14);
  return <AbsoluteFill style={{ ...entra(p, 32, 0), ...sale(frame, dur - 8, 8, -24, 0) }}>{children}</AbsoluteFill>;
};

// ---- La ventana de Nexo ----

export const VENTANA = { x: 660, y: 105, w: 1180, h: 870, barra: 36, menu: 224 };

// El menú de un comercio, igual que en la app (frontend/index.html, con los
// módulos de su tipo de negocio: backend/perfiles.js).
export const ITEMS: { icono: string; texto: string; grupo?: string }[] = [
  { icono: "layout-dashboard", texto: "Resumen" },
  { icono: "sparkles", texto: "Asistente" },
  { icono: "package", texto: "Productos", grupo: "Maestros" },
  { icono: "users", texto: "CRM" },
  { icono: "truck", texto: "Proveedores" },
  { icono: "store", texto: "Punto de venta", grupo: "Ventas" },
  { icono: "file-text", texto: "Presupuestos" },
  { icono: "shopping-cart", texto: "Ventas" },
  { icono: "globe", texto: "Venta online" },
  { icono: "undo-2", texto: "Devoluciones" },
  { icono: "receipt-text", texto: "Facturas" },
  { icono: "shopping-bag", texto: "Compras", grupo: "Compras" },
  { icono: "package-minus", texto: "Dev. a proveedor" },
  { icono: "boxes", texto: "Stock", grupo: "Stock" },
  { icono: "chart-column", texto: "Reportes de stock" },
  { icono: "wallet", texto: "Caja", grupo: "Finanzas" },
  { icono: "notebook-tabs", texto: "Cuentas corrientes" },
  { icono: "hand-coins", texto: "Gastos" },
  { icono: "trash-2", texto: "Papelera", grupo: "Administración" },
  { icono: "history", texto: "Auditoría" },
  { icono: "settings", texto: "Configuración" },
];

/** Índice de un ítem del menú por su texto. */
export const item = (texto: string) => ITEMS.findIndex((it) => it.texto === texto);

const ALTO_ITEM = 29;
const ALTO_GRUPO = 25;
const yItem = (i: number) => {
  let y = 0;
  for (let k = 0; k < i; k++) y += ALTO_ITEM;
  for (let k = 0; k <= i; k++) if (ITEMS[k].grupo) y += ALTO_GRUPO;
  return y;
};

/** Qué ítem del menú está activo en cada momento: [{ f, i }]. */
export type Activo = { f: number; i: number }[];

const yActivo = (frame: number, activo: Activo) => {
  let y = yItem(activo[0].i);
  for (let k = 1; k < activo.length; k++) {
    const p = progress(frame, activo[k].f, 14, ease.inOut);
    y += (yItem(activo[k].i) - yItem(activo[k - 1].i)) * p;
  }
  return y;
};

const indiceActivo = (frame: number, activo: Activo) => {
  let i = activo[0].i;
  for (const a of activo) if (frame >= a.f + 7) i = a.i;
  return i;
};

/** La ventana con el menú de Nexo; el contenido va en `children`. */
export const VentanaNexo: React.FC<{ negocio: string; rubro: string; activo: Activo; boton?: number; children: React.ReactNode }> = ({
  negocio,
  rubro,
  activo,
  boton = 1,
  children,
}) => {
  const frame = useCurrentFrame();
  const V = VENTANA;
  const yA = yActivo(frame, activo);
  const iA = indiceActivo(frame, activo);
  return (
    <div
      style={{
        position: "absolute",
        left: V.x,
        top: V.y,
        width: V.w,
        height: V.h,
        borderRadius: 18,
        background: "#000",
        border: `1px solid ${C.borderStrong}`,
        boxShadow: "0 40px 120px rgba(0,0,0,0.7), 0 0 80px rgba(96,165,250,0.08)",
        overflow: "hidden",
        fontFamily: brand.fontBody,
        color: C.text,
      }}
    >
      <div style={{ height: V.barra, display: "flex", alignItems: "center", gap: 8, paddingLeft: 16, borderBottom: `1px solid ${C.border}`, background: "#0a0a0a" }}>
        {[0, 1, 2].map((k) => (
          <span key={k} style={{ width: 11, height: 11, borderRadius: 99, background: "rgba(255,255,255,0.18)" }} />
        ))}
      </div>
      <div style={{ position: "absolute", left: 0, top: V.barra, width: V.menu, bottom: 0, padding: "14px 12px", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 6px 12px" }}>
          <Img src={staticFile("brand/nexo-icono.png")} style={{ width: 24, height: "auto" }} />
          <span style={{ flex: 1, fontFamily: brand.fontDisplay, fontWeight: 700, fontSize: 22, letterSpacing: "-0.02em" }}>Nexo</span>
          <span style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.border}`, display: "grid", placeItems: "center" }}>
            <Icon name="chevron-left" size={14} color={C.text2} />
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: 8, border: `1px solid ${C.border}`, borderRadius: 11, marginBottom: 8 }}>
          <span style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.borderStrong}`, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 14 }}>
            {negocio[0]}
          </span>
          <div style={{ flex: 1, lineHeight: 1.25 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{negocio}</div>
            <div style={{ fontSize: 12, color: C.text2 }}>{rubro}</div>
          </div>
          <Icon name="chevrons-up-down" size={14} color={C.muted} />
        </div>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: yA + 1, height: ALTO_ITEM - 2, borderRadius: 9, background: ACENTO_SUAVE }} />
          {ITEMS.map((it, i) => (
            <React.Fragment key={it.texto}>
              {it.grupo ? (
                <div style={{ height: ALTO_GRUPO, display: "flex", alignItems: "flex-end", paddingBottom: 5, paddingLeft: 10, fontSize: 11.5, color: C.muted }}>{it.grupo}</div>
              ) : null}
              <div
                style={{
                  position: "relative",
                  height: ALTO_ITEM,
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  paddingLeft: 10,
                  fontSize: 14,
                  fontWeight: i === iA ? 600 : 400,
                  color: i === iA ? C.text : C.text2,
                }}
              >
                <Icon name={it.icono} size={16} color={i === iA ? C.accent : C.text2} />
                {it.texto}
              </div>
            </React.Fragment>
          ))}
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 60, background: "linear-gradient(transparent, #000)" }} />
      </div>
      <div
        style={{
          position: "absolute",
          left: V.menu,
          top: V.barra + 10,
          right: 10,
          bottom: 10,
          borderRadius: 14,
          background: "#0b0b0b",
          border: `1px solid ${C.border}`,
          overflow: "hidden",
        }}
      >
        {children}
        <span
          style={{
            position: "absolute",
            right: 22,
            bottom: 22,
            width: 54,
            height: 54,
            borderRadius: 99,
            background: C.accent,
            display: "grid",
            placeItems: "center",
            boxShadow: "0 10px 30px rgba(96,165,250,0.35)",
            zIndex: 5,
            opacity: boton,
            transform: `scale(${0.9 + 0.1 * boton})`,
          }}
        >
          <Icon name="sparkles" size={22} color="#04101f" />
        </span>
      </div>
    </div>
  );
};

/** Un logo de la app (Tienda Nube, Mercado Libre, Mercado Pago). */
export const Logo: React.FC<{ nombre: string; alto: number; color?: string; style?: React.CSSProperties }> = ({ nombre, alto, color = C.text, style }) => {
  const l = LOGOS[nombre];
  const [, , w, h] = l.viewBox.split(" ").map(Number);
  return (
    <svg viewBox={l.viewBox} width={(alto * w) / h} height={alto} fill="currentColor" style={{ color, flexShrink: 0, ...style }} dangerouslySetInnerHTML={{ __html: l.svg }} />
  );
};

/** Encabezado de cada pantalla, como en la app. */
export const Encabezado: React.FC<{ titulo: string; derecha?: React.ReactNode }> = ({ titulo, derecha }) => (
  <div style={{ position: "absolute", left: 28, right: 28, top: 24, height: 44, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
    <span style={{ fontFamily: brand.fontDisplay, fontWeight: 700, fontSize: 30, letterSpacing: "-0.02em" }}>{titulo}</span>
    {derecha ?? <span style={{ fontSize: 15, color: C.text2 }}>Miércoles, 11 de noviembre</span>}
  </div>
);

export const Tarjeta: React.FC<{ style?: React.CSSProperties; children: React.ReactNode }> = ({ style, children }) => (
  <div style={{ position: "absolute", background: "#0f0f0f", border: `1px solid ${C.border}`, borderRadius: 14, ...style }}>{children}</div>
);

export const Encontrado: React.FC = () => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 8, padding: "2px 10px", borderRadius: 99, background: OK_SUAVE, color: C.ok, fontSize: 13 }}>
    <span style={{ width: 7, height: 7, borderRadius: 9, background: C.ok }} />
    encontrado
  </span>
);
