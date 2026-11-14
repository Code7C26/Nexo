"""Copia los íconos y los logos de la app de Nexo al estudio.

    python scripts/iconos-nexo.py "<carpeta del repo de Nexo>"

Escribe src/components/nexo/icons.ts (Lucide, los de frontend/img/iconos.svg)
y src/components/nexo/logos.ts (Tienda Nube, Mercado Libre y Mercado Pago, de
sus sprites en frontend/img), así el video usa los mismos que la app.
"""
import re
import sys
from pathlib import Path

ICONOS = """layout-dashboard sparkles package users truck store file-text shopping-cart globe undo-2
receipt-text shopping-bag package-minus boxes chart-column wallet notebook-tabs hand-coins trash-2
history settings search check circle-check trending-up arrow-up-right tag funnel camera beef carrot
cup-soda briefcase dumbbell sprout message-circle send minus plus chevrons-up-down chevron-down
chevron-left printer file-down bell scan-barcode building-2 calendar-clock clipboard-list repeat
chef-hat percent banknote""".split()

LOGOS = {
    "tiendanube-logo": ("tiendanube", "logo"),
    "tiendanube-nube": ("tiendanube", "nube"),
    "mercadolibre-emblema": ("mercadolibre", "emblema"),
    "mercadolibre-logo": ("mercadolibre", "logo"),
    "mercadopago-emblema": ("mercadopago", "emblema"),
    "mercadopago-logo": ("mercadopago", "logo"),
}


def simbolos(texto):
    return {
        m.group(1): (m.group(2), m.group(3))
        for m in re.finditer(r'<symbol id="([\w-]+)" viewBox="([^"]+)"[^>]*>(.*?)</symbol>', texto, flags=re.S)
    }


def plantilla(cuerpo):
    return "`" + re.sub(r"\s+", " ", cuerpo).strip().replace("\\", "\\\\").replace("`", "\\`") + "`"


def main():
    repo = Path(sys.argv[1])
    img = repo / "frontend" / "img"
    destino = Path(__file__).resolve().parent.parent / "src" / "components" / "nexo"

    iconos = simbolos((img / "iconos.svg").read_text(encoding="utf-8"))
    faltan = [i for i in ICONOS if i not in iconos]
    if faltan:
        sys.exit(f"No están en iconos.svg: {faltan}")
    lineas = [
        "// Íconos de Lucide (lucide-static, licencia ISC), los mismos que usa la app de",
        "// Nexo. Generado por scripts/iconos-nexo.py desde frontend/img/iconos.svg: no editar a mano.",
        "export const ICONS: Record<string, string> = {",
        *[f'  "{i}": {plantilla(iconos[i][1])},' for i in ICONOS],
        "};",
        "",
    ]
    (destino / "icons.ts").write_text("\n".join(lineas), encoding="utf-8", newline="\n")

    lineas = [
        "// Logos de los canales, los mismos de la app (frontend/img: Tienda Nube de su sitio;",
        "// Mercado Libre y Mercado Pago de theSVG, MIT). Generado por scripts/iconos-nexo.py.",
        "export const LOGOS: Record<string, { viewBox: string; svg: string }> = {",
    ]
    for clave, (archivo, simbolo) in LOGOS.items():
        caja, cuerpo = simbolos((img / f"{archivo}.svg").read_text(encoding="utf-8"))[simbolo]
        lineas.append(f'  "{clave}": {{ viewBox: "{caja}", svg: {plantilla(cuerpo)} }},')
    lineas += ["};", ""]
    (destino / "logos.ts").write_text("\n".join(lineas), encoding="utf-8", newline="\n")
    print(f"{len(ICONOS)} íconos y {len(LOGOS)} logos en {destino}")


if __name__ == "__main__":
    main()
