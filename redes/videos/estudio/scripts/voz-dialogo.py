"""La voz de un video con dos personas, frase por frase.

    python scripts/voz-dialogo.py voz/nexo-un-sabado.json

Cada frase del guion tiene "quien" (santino o tosi), "texto" (lo que se dice,
en inglés), "sub" (el subtítulo en castellano) y, si hace falta, "dicho" (lo
que se le pasa a la voz de guía para que lo pronuncie bien).

Cada frase usa la grabación de verdad si está en public/voz/<nombre>/grabadas/
con su nombre (00-venta.ogg, 01-confirmar.m4a…, cualquier formato), y si no,
la voz de guía de su persona (edge-tts, en guia/). Así se puede mezclar: las
de Santino grabadas y las de Tosi de guía hasta que lleguen. A las grabadas
(notas de voz del celular) se les saca el ruido y los graves y se les acortan
las pausas largas; a todas se les empareja el volumen. Los originales no se
tocan: el resultado va a public/voz/<nombre>/.

Tosi es la voz de Nexo (el asistente): a sus frases se les suma un tratamiento
leve que las hace sonar a asistente digital, para que se distingan de la voz
del dueño. A todas se les saca el silencio de las puntas, y se escribe
src/compositions/voz/<nombre>.json con lo que dura cada una en cuadros (30 fps)
y su volumen cuadro por cuadro, para que la onda se mueva con la voz.
Necesita ffmpeg y ffprobe en el PATH.
"""
import argparse
import array
import json
import math
import subprocess
from pathlib import Path

FPS = 30
MUESTRAS = 16000
VOCES = {"santino": "en-US-ChristopherNeural", "tosi": "en-US-BrianNeural"}
# La voz de Nexo: sin graves ni el aire de arriba, un coro corto que le da
# brillo de voz digital, un eco apenas y comprimida pareja.
NEXO = (
    "highpass=f=220,lowpass=f=6800,"
    "chorus=0.6:0.85:22|34:0.28|0.22:0.3|0.45:1.8|2.4,"
    "aecho=0.85:0.6:28:0.18,"
    "acompressor=threshold=-20dB:ratio=3:attack=5:release=60,volume=1.6"
)
# Las notas de voz del celular: primero sin el zumbido de abajo ni el ruido de
# fondo (si no, el ruido no deja recortar las puntas), y después las pausas de
# más de medio segundo, cortas. Las notas de WhatsApp terminan con el clic de
# soltar el botón: sin las últimas tres décimas, el silencio de atrás se recorta.
SIN_CLIC = "areverse,atrim=start=0.3,areverse"
SIN_RUIDO = "highpass=f=80,afftdn=nf=-25"
PAUSAS = (
    "silenceremove=stop_periods=-1:stop_duration=0.45:stop_threshold=-38dB:stop_silence=0.3,"
    "acompressor=threshold=-22dB:ratio=2.5:attack=8:release=120"
)
VOLUMEN = "loudnorm=I=-16:TP=-1.5:LRA=7"


def recorte(umbral: int) -> str:
    """Sin el silencio de las puntas, con una décima de colchón para no comer sílabas."""
    punta = f"silenceremove=start_periods=1:start_threshold={umbral}dB:start_silence=0.1"
    return f"{punta},areverse,{punta},areverse"


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
    ap.add_argument("--velocidad", default="+0%")
    a = ap.parse_args()

    estudio = Path(__file__).resolve().parent.parent
    guion = Path(a.guion)
    nombre = guion.stem
    carpeta = estudio / "public" / "voz" / nombre
    grabadas = carpeta / "grabadas"
    guia = carpeta / "guia"
    grabadas.mkdir(parents=True, exist_ok=True)
    guia.mkdir(parents=True, exist_ok=True)

    frases = json.loads(guion.read_text(encoding="utf-8"))
    salida = []
    for k, f in enumerate(frases):
        archivo = carpeta / f"{k:02d}-{f['escena']}.mp3"
        grabada = next(iter(sorted(grabadas.glob(f"{archivo.stem}.*"))), None)
        if grabada:
            crudo = grabada
        else:
            crudo = guia / archivo.name
            subprocess.run(
                ["edge-tts", "--voice", VOCES[f["quien"]], f"--rate={a.velocidad}", "--text", f.get("dicho", f["texto"]), "--write-media", str(crudo)],
                check=True,
            )
        limpia = f"{SIN_CLIC},{SIN_RUIDO},{recorte(-38)},{PAUSAS}" if grabada else recorte(-45)
        filtro = limpia + ("," + NEXO if f["quien"] == "tosi" else "") + "," + VOLUMEN
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(crudo), "-af", filtro, "-ar", "48000", str(archivo)], check=True)
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
        print(f"{archivo.name}: {dur:.2f} s ({f['quien']}, {'grabada' if grabada else 'guía'})")

    destino = estudio / "src" / "compositions" / "voz" / f"{nombre}.json"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(salida, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(salida)} frases en {destino.name}")


if __name__ == "__main__":
    main()
