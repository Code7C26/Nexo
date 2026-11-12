// Nexo — Video 6: la apertura del pitch. Guion: storyboards/nexo-apertura.md.
// Un pantallazo de todo Nexo: lo principal (el Resumen y el asistente) de a
// poco, y lo demás rápido. Sin voz: música bajita (scripts/musica-nexo.py) y
// los sonidos de cada toque. Los datos son de un negocio de ejemplo, con
// nombres genéricos (pedido del usuario).
import React from "react";
import { AbsoluteFill, Audio, getInputProps, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { brand } from "../brand/brand";
import { ease, progress } from "../lib/motion";
import {
  Asistente,
  Cobro,
  Compra,
  CONFIRMA,
  ENVIA,
  ESCANEO,
  ESCRIBE,
  Factura,
  INICIO_RENGLON,
  INICIO_TRAMO,
  LLEGADAS_PEDIDOS,
  Mostrador,
  Online,
  PAGO_APROBADO,
  PROPUESTA,
  Resumen,
  RESUMEN_30_DIAS,
  RESUMEN_BAJA,
  TOQUE_MP,
  TOQUE_PDF,
  TOQUE_REMERA,
  Venta,
} from "../components/nexo/pantallas";
import { ACENTO_SUAVE, Activo, C, Cambio, entra, Icon, item, sale, TituloFoco, VentanaNexo } from "../components/nexo/ui";

// Escenas: [inicio, duración] en cuadros (30 fps).
const E = {
  gancho: [0, 60],
  resumen: [60, 190],
  mostrador: [250, 90],
  venta: [340, 80],
  factura: [420, 100],
  compra: [520, 110],
  online: [630, 90],
  cobro: [720, 90],
  asistente: [810, 130],
  funciones: [940, 90],
  rubros: [1030, 90],
  logo: [1120, 110],
} as const;
type Escena = readonly [number, number];

export const NEXO_APERTURA_DURATION = E.logo[0] + E.logo[1];

// La música se elige al renderizar: --props='{"musica":"music/otra.wav"}'.
const MUSICA = (getInputProps() as { musica?: string }).musica ?? "music/nexo-apertura.wav";

// ---------------------------------------------------------------- Fondo

const Fondo: React.FC = () => {
  const frame = useCurrentFrame();
  const [vi] = E.resumen;
  const [vf] = E.funciones;
  const x = interpolate(frame, [vi - 5, vi + 35, vf - 15, vf + 25, E.logo[0], E.logo[0] + 30], [50, 70, 70, 50, 50, 38], {
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
    <TituloFoco lineas={lineas} resaltar={resaltar} desde={6} cada={4} saleEn={dur - 8} tam={66} />
  </AbsoluteFill>
);

const TITULOS: [Escena, string[], string[]][] = [
  [E.resumen, ["El mes,", "de un vistazo."], ["vistazo"]],
  [E.mostrador, ["Las ofertas,", "solas."], ["solas"]],
  [E.venta, ["Cuánto deja", "cada venta."], ["venta"]],
  [E.factura, ["La factura,", "con CAE de ARCA."], ["ARCA"]],
  [E.compra, ["La compra,", "desde la foto."], ["foto"]],
  [E.online, ["Tienda Nube y", "Mercado Libre,", "conectados."], ["conectados"]],
  [E.cobro, ["Cobros con", "Mercado Pago,", "solos."], ["solos"]],
  [E.asistente, ["Se dice,", "y Nexo la arma."], ["arma"]],
];

// ---------------------------------------------------------------- Funciones y rubros

type Item = { icono: string; titulo: string; texto: string };

const FUNCIONES: Item[] = [
  { icono: "boxes", titulo: "Stock por depósito", texto: "Cada movimiento, anotado" },
  { icono: "wallet", titulo: "Caja y cuentas", texto: "Apertura, cierre y arqueo" },
  { icono: "notebook-tabs", titulo: "Cuentas corrientes", texto: "Quién debe y cuánto" },
  { icono: "file-text", titulo: "Presupuestos", texto: "Que pasan a venta" },
  { icono: "tag", titulo: "Listas de precios", texto: "Minorista, mayorista y ofertas" },
  { icono: "funnel", titulo: "CRM", texto: "Consultas y seguimiento" },
  { icono: "undo-2", titulo: "Devoluciones", texto: "Con nota de crédito" },
  { icono: "hand-coins", titulo: "Gastos", texto: "Y el resultado del mes" },
  { icono: "users", titulo: "Equipo y permisos", texto: "El empleado no ve los costos" },
  { icono: "building-2", titulo: "Varios negocios", texto: "En una misma cuenta" },
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
            ...entra(progress(frame, 12 + k * cada, 12), 0, 18),
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
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Sonido

const Sfx: React.FC<{ en: number; src: string; vol?: number }> = ({ en, src, vol = 0.4 }) => (
  <Sequence from={en} layout="none">
    <Audio src={staticFile(src)} volume={vol} />
  </Sequence>
);

const CAMBIO = "sfx/ui/rollover2.ogg";
const CLICK = "sfx/ui/click2.ogg";
const TIC = "sfx/interface/click_005.ogg";
const LISTO = "sfx/interface/bong_001.ogg";
const HOJA = "sfx/casino/card-slide-1.ogg";

const Sonido: React.FC = () => {
  const a = E.asistente[0];
  const teclas: number[] = [];
  for (let f = ESCRIBE[0]; f < ESCRIBE[1]; f += 2) teclas.push(f);
  return (
    <>
      <Audio src={staticFile(MUSICA)} volume={0.32} />
      <Sfx en={E.resumen[0]} src="sfx/impact/impactSoft_medium_001.ogg" vol={0.35} />
      <Sfx en={E.resumen[0] + RESUMEN_30_DIAS} src={CLICK} vol={0.6} />
      <Sfx en={E.resumen[0] + RESUMEN_30_DIAS + 28} src="sfx/interface/select_008.ogg" vol={0.18} />
      <Sfx en={E.resumen[0] + RESUMEN_BAJA} src={CAMBIO} vol={0.22} />
      <Sfx en={E.mostrador[0]} src={CAMBIO} vol={0.3} />
      <Sfx en={E.mostrador[0] + TOQUE_REMERA} src={CLICK} vol={0.6} />
      <Sfx en={E.mostrador[0] + TOQUE_REMERA + 16} src="sfx/interface/select_008.ogg" vol={0.2} />
      <Sfx en={E.venta[0]} src={CAMBIO} vol={0.3} />
      {[0, 1, 2, 3].map((k) => (
        <Sfx key={k} en={E.venta[0] + INICIO_TRAMO(k)} src={TIC} vol={0.4} />
      ))}
      <Sfx en={E.venta[0] + INICIO_TRAMO(4)} src={LISTO} vol={0.35} />
      <Sfx en={E.factura[0]} src={CAMBIO} vol={0.3} />
      <Sfx en={E.factura[0] + TOQUE_PDF} src={CLICK} vol={0.6} />
      <Sfx en={E.factura[0] + TOQUE_PDF + 4} src={HOJA} vol={0.35} />
      <Sfx en={E.compra[0]} src={HOJA} vol={0.3} />
      <Sfx en={E.compra[0] + ESCANEO[0]} src="sfx/interface/switch_002.ogg" vol={0.25} />
      {[0, 2, 4].map((k) => (
        <Sfx key={k} en={E.compra[0] + INICIO_RENGLON(k)} src={TIC} vol={0.35} />
      ))}
      <Sfx en={E.online[0]} src={CAMBIO} vol={0.3} />
      {LLEGADAS_PEDIDOS.map((f) => (
        <Sfx key={f} en={E.online[0] + f} src={LISTO} vol={0.3} />
      ))}
      <Sfx en={E.cobro[0]} src={CAMBIO} vol={0.3} />
      <Sfx en={E.cobro[0] + TOQUE_MP} src={CLICK} vol={0.6} />
      <Sfx en={E.cobro[0] + PAGO_APROBADO} src="sfx/impact/impactBell_heavy_000.ogg" vol={0.22} />
      <Sfx en={a} src={CAMBIO} vol={0.3} />
      {teclas.map((f, k) => (
        <Sfx key={f} en={a + f} src={`sfx/keyboard/keypress-${String((k % 16) + 1).padStart(3, "0")}.wav`} vol={0.16} />
      ))}
      <Sfx en={a + ENVIA} src={CLICK} vol={0.6} />
      <Sfx en={a + PROPUESTA} src={CAMBIO} vol={0.25} />
      <Sfx en={a + CONFIRMA} src={CLICK} vol={0.6} />
      <Sfx en={a + CONFIRMA + 3} src={LISTO} vol={0.35} />
      {[0, 4, 8].map((k) => (
        <Sfx key={k} en={E.funciones[0] + 12 + k * 2} src={CAMBIO} vol={0.2} />
      ))}
      {[0, 4].map((k) => (
        <Sfx key={k} en={E.rubros[0] + 12 + k * 3} src={CAMBIO} vol={0.2} />
      ))}
      <Sfx en={E.logo[0] + 2} src="sfx/impact/impactSoft_heavy_003.ogg" vol={0.45} />
    </>
  );
};

// ---------------------------------------------------------------- Composición

const PANTALLAS: [Escena, React.ReactNode, string][] = [
  [E.resumen, <Resumen key="r" />, "Resumen"],
  [E.mostrador, <Mostrador key="m" />, "Punto de venta"],
  [E.venta, <Venta key="v" />, "Ventas"],
  [E.factura, <Factura key="f" />, "Facturas"],
  [E.compra, <Compra key="c" />, "Compras"],
  [E.online, <Online key="o" />, "Venta online"],
  [E.cobro, <Cobro key="co" />, "Punto de venta"],
  [E.asistente, <Asistente key="a" />, "Asistente"],
];

const ACTIVO: Activo = PANTALLAS.map(([[f], , texto]) => ({ f, i: item(texto) }));

/** El botón flotante del asistente se esconde donde taparía algo. */
const sinBoton = (frame: number, [desde, dur]: Escena) =>
  interpolate(frame, [desde - 6, desde + 4, desde + dur - 6, desde + dur + 4], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

const Ventana: React.FC = () => {
  const frame = useCurrentFrame();
  const inicio = E.resumen[0];
  const fin = E.funciones[0];
  if (frame < inicio || frame > fin) return null;
  const boton = 1 - Math.max(sinBoton(frame, E.cobro), sinBoton(frame, E.asistente), sinBoton(frame, E.factura));
  return (
    <AbsoluteFill style={{ ...entra(progress(frame, inicio, 20), 70, 0), ...sale(frame, fin - 10, 10, 30, 0) }}>
      <VentanaNexo negocio="Indumentaria" rubro="Comercio general" activo={ACTIVO} boton={boton}>
        {PANTALLAS.map(([[desde, dur], el]) => (
          <Sequence key={desde} from={desde} durationInFrames={dur}>
            <Cambio dur={dur}>{el}</Cambio>
          </Sequence>
        ))}
      </VentanaNexo>
    </AbsoluteFill>
  );
};

const Titulo: React.FC<{ escena: Escena; children: React.ReactNode }> = ({ escena, children }) => (
  <Sequence from={escena[0]} durationInFrames={escena[1]}>
    {children}
  </Sequence>
);

export const NexoApertura: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: brand.fontBody }}>
    <Fondo />
    <Titulo escena={E.gancho}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <TituloFoco lineas={["Todo el negocio,", "en un solo lugar."]} resaltar={["lugar"]} desde={4} cada={4} saleEn={E.gancho[1] - 8} tam={104} alinear="center" />
      </AbsoluteFill>
    </Titulo>
    <Ventana />
    {TITULOS.map(([escena, lineas, resaltar]) => (
      <Titulo key={escena[0]} escena={escena}>
        <TituloIzquierda lineas={lineas} resaltar={resaltar} dur={escena[1]} />
      </Titulo>
    ))}
    <Titulo escena={E.funciones}>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 170 }}>
        <TituloFoco lineas={["Y todo lo demás, conectado."]} resaltar={["conectado"]} desde={4} cada={4} saleEn={E.funciones[1] - 8} tam={64} alinear="center" />
      </AbsoluteFill>
      <Grilla items={FUNCIONES} dur={E.funciones[1]} top={330} alto={118} cada={2} />
    </Titulo>
    <Titulo escena={E.rubros}>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 170 }}>
        <TituloFoco lineas={["Y lo que cada rubro necesita."]} resaltar={["rubro"]} desde={4} cada={4} saleEn={E.rubros[1] - 8} tam={64} alinear="center" />
      </AbsoluteFill>
      <Grilla items={RUBROS} dur={E.rubros[1]} top={320} alto={210} cada={3} vertical />
    </Titulo>
    <Titulo escena={E.logo}>
      <Logo />
    </Titulo>
    <Sonido />
  </AbsoluteFill>
);
