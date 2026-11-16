"""La voz de un video con dos personas, frase por frase.

    python scripts/voz-dialogo.py voz/nexo-un-sabado.json            # voz de guía (edge-tts)
    python scripts/voz-dialogo.py voz/nexo-un-sabado.json --grabadas # las voces de verdad

Cada frase del guion tiene "quien" (santino o tosi), "texto" (lo que se dice,
en inglés), "sub" (el subtítulo en castellano) y, si hace falta, "dicho" (lo
que se le pasa a la voz de guía para que lo pronuncie bien).

Sin --grabadas, cada frase sale de edge-tts con la voz de guía de su persona.
Con --grabadas, usa los audios que ya estén en public/voz/<nombre>/ con el
mismo nombre (00-venta.mp3, 01-confirmar.mp3…): ahí van las frases grabadas
por Santino y Tosi, cortadas una por archivo. En los dos casos les saca el
silencio de las puntas y escribe src/compositions/voz/<nombre>.json con lo que
dura cada una en cuadros (30 fps) y su volumen cuadro por cuadro, para que la
onda del asistente se mueva con la voz. Necesita ffmpeg y ffprobe en el PATH.
"""
import argparse
import array
import json
import math
import shutil
import subprocess
from pathlib import Path

FPS = 30
MUESTRAS = 16000
VOCES = {"santino": "en-US-AndrewNeural", "tosi": "en-US-BrianNeural"}
RECORTE = "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse"


def niveles(archivo: Path) -> list[float]:
    """Volumen de cada cuadro, de 0 a 1 (el más fuerte de la frase es 1)."""
    crudo = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(archivo), "-ac", "1", "-ar", str(MUESTRAS), "-f", "s16le", "-"],
        check=True,
        capture_output=True,
    ).stdout
    m = array.array("h", crudo)
    por_cuadro = MUESTRAS // FPS
    rms = []
    for k in range(0, len(m), por_cuadro):
        tramo = m[k : k + por_cuadro]
        rms.append(math.sqrt(sum(x * x for x in tramo) / max(len(tramo), 1)))
    tope = max(rms) or 1
    return [round(min(1, r / tope), 3) for r in rms]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("guion")
    ap.add_argument("--grabadas", action="store_true")
    ap.add_argument("--velocidad", default="+0%")
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
        if a.grabadas:
            if not archivo.exists():
                raise SystemExit(f"Falta {archivo.name} (la frase de {f['quien']}: \"{f['texto']}\")")
            shutil.copy(archivo, crudo)
        else:
            subprocess.run(
                ["edge-tts", "--voice", VOCES[f["quien"]], f"--rate={a.velocidad}", "--text", f.get("dicho", f["texto"]), "--write-media", str(crudo)],
                check=True,
            )
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(crudo), "-af", RECORTE, str(archivo)], check=True)
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
                "quien": f["quien"],
                "texto": f["texto"],
                "sub": f["sub"],
                "archivo": f"voz/{nombre}/{archivo.name}",
                "cuadros": math.ceil(dur * FPS),
                "niveles": niveles(archivo),
            }
        )
        print(f"{archivo.name}: {dur:.2f} s ({f['quien']})")

    destino = estudio / "src" / "compositions" / "voz" / f"{nombre}.json"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(salida, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(salida)} frases en {destino.name}")


if __name__ == "__main__":
    main()
