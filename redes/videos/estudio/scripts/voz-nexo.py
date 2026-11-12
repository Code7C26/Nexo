"""La voz de un video, frase por frase, con edge-tts (gratis, sin cuenta).

    python scripts/voz-nexo.py voz/nexo-apertura.json [--voz es-AR-TomasNeural] [--velocidad +6%]

Cada frase del guion tiene "texto" (el subtítulo) y, si hace falta, "dicho"
(lo que se le pasa a la voz para que lo pronuncie bien: "Arca" en vez de
"ARCA", comas para que respire). Escribe un mp3 por frase en
public/voz/<nombre>/ y src/compositions/voz/<nombre>.json con el texto, el
archivo y cuánto dura cada una en cuadros (30 fps), que lee la composición.
Necesita ffprobe en el PATH.
"""
import argparse
import json
import math
import subprocess
from pathlib import Path

FPS = 30


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("guion")
    ap.add_argument("--voz", default="es-AR-TomasNeural")
    ap.add_argument("--velocidad", default="+6%")
    a = ap.parse_args()

    estudio = Path(__file__).resolve().parent.parent
    guion = Path(a.guion)
    nombre = guion.stem
    carpeta = estudio / "public" / "voz" / nombre
    carpeta.mkdir(parents=True, exist_ok=True)

    frases = json.loads(guion.read_text(encoding="utf-8"))
    salida = []
    for k, f in enumerate(frases):
        archivo = carpeta / f"{k:02d}-{f['escena']}.mp3"
        crudo = archivo.with_suffix(".crudo.mp3")
        subprocess.run(
            ["edge-tts", "--voice", a.voz, f"--rate={a.velocidad}", "--text", f.get("dicho", f["texto"]), "--write-media", str(crudo)],
            check=True,
        )
        # Sin el silencio de adelante y de atrás que deja edge-tts: así la
        # frase cae justo donde la pone la composición.
        recorte = "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(crudo), "-af", recorte, str(archivo)], check=True)
        crudo.unlink()
        dur = float(
            subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(archivo)],
                check=True,
                capture_output=True,
                text=True,
            ).stdout
        )
        salida.append(
            {
                "escena": f["escena"],
                "texto": f["texto"],
                "archivo": f"voz/{nombre}/{archivo.name}",
                "cuadros": math.ceil(dur * FPS),
            }
        )
        print(f"{archivo.name}: {dur:.2f} s")

    destino = estudio / "src" / "compositions" / "voz" / f"{nombre}.json"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(salida, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(salida)} frases en {destino.name}")


if __name__ == "__main__":
    main()
