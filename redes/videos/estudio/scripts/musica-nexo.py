"""Música de fondo de los videos de Nexo, generada acá: sin derechos de nadie.

Un colchón de acordes suaves, un arpegio y un pulso grave a 120 bpm (un pulso
cada 15 cuadros a 30 fps, así los cambios de escena caen en el tiempo).

    python scripts/musica-nexo.py <salida.wav> <segundos> [--pulso-desde S] [--final-en S]

--pulso-desde: cuándo entran el arpegio y el pulso (antes, solo el colchón).
--final-en: desde ahí se cortan el arpegio y el pulso, y queda el último
acorde sonando hasta el final (el momento del logo).
"""
import argparse
import wave

import numpy as np

SR = 44100
BPM = 120
BEAT = 60 / BPM


def nota(n):
    """Frecuencia de una nota MIDI."""
    return 440.0 * 2 ** ((n - 69) / 12)


# La menor 9 → Fa maj7 → Do add9 → Sol 6, dos compases (4 s) cada uno.
ACORDES = [
    [45, 52, 55, 59, 60],
    [41, 48, 52, 57, 60],
    [48, 55, 62, 64, 67],
    [43, 50, 59, 62, 64],
]
COMPAS = 4 * BEAT
DUR_ACORDE = 2 * COMPAS


def pad(t, dur_total):
    out = np.zeros((len(t), 2))
    n_acordes = int(np.ceil(dur_total / DUR_ACORDE)) + 1
    for k in range(n_acordes):
        ini = k * DUR_ACORDE
        notas = ACORDES[k % len(ACORDES)]
        # Envolvente con ataque y caída largos que se pisan con el siguiente.
        env = np.clip((t - ini + 0.6) / 1.2, 0, 1) * np.clip((ini + DUR_ACORDE + 0.6 - t) / 1.2, 0, 1)
        env = env ** 1.5
        if not env.any():
            continue
        for i, n in enumerate(notas):
            f = nota(n)
            for det, pan in ((-0.0018, 0.3), (0.0018, 0.7)):
                ff = f * (1 + det)
                v = np.sin(2 * np.pi * ff * t) + 0.25 * np.sin(2 * np.pi * 2 * ff * t) + 0.08 * np.sin(2 * np.pi * 3 * ff * t)
                g = 0.05 if i else 0.07
                out[:, 0] += v * env * g * (1 - pan)
                out[:, 1] += v * env * g * pan
    return out


def arpegio(t, desde, hasta):
    out = np.zeros((len(t), 2))
    paso = BEAT / 2
    k = 0
    tt = desde
    while tt < hasta:
        acorde = ACORDES[int(tt // DUR_ACORDE) % len(ACORDES)]
        n = sorted(acorde)[1:][k % 4] + 12
        f = nota(n)
        i0 = int(tt * SR)
        largo = int(0.9 * SR)
        seg = np.arange(min(largo, len(t) - i0)) / SR
        v = (np.sin(2 * np.pi * f * seg) + 0.3 * np.sin(2 * np.pi * 2 * f * seg)) * np.exp(-seg * 5.5)
        v *= np.clip(seg / 0.004, 0, 1) * 0.06
        pan = 0.35 if k % 2 else 0.65
        out[i0:i0 + len(seg), 0] += v * (1 - pan)
        out[i0:i0 + len(seg), 1] += v * pan
        k += 1
        tt += paso
    return out


def pulso(t, desde, hasta):
    out = np.zeros((len(t), 2))
    rng = np.random.default_rng(7)
    b = 0
    tt = desde
    while tt < hasta:
        i0 = int(tt * SR)
        # Bombo suave en cada tiempo.
        seg = np.arange(min(int(0.35 * SR), len(t) - i0)) / SR
        f = 45 + 70 * np.exp(-seg * 30)
        fase = 2 * np.pi * np.cumsum(f) / SR
        v = np.sin(fase) * np.exp(-seg * 9) * (0.16 if b % 2 == 0 else 0.11)
        out[i0:i0 + len(seg)] += v[:, None]
        # Un shaker muy bajo a contratiempo.
        j0 = int((tt + BEAT / 2) * SR)
        if j0 < len(t):
            s2 = np.arange(min(int(0.06 * SR), len(t) - j0)) / SR
            ruido = rng.standard_normal(len(s2))
            ruido = np.diff(np.concatenate([[0], ruido]))  # más agudo, sin graves
            out[j0:j0 + len(s2)] += (ruido * np.exp(-s2 * 70) * 0.012)[:, None]
        b += 1
        tt += BEAT
    return out


def bajo_y_palmas(t, desde, hasta):
    """Para --estilo movida: un bajo en corcheas, palmas en 2 y 4, y un hi-hat en semicorcheas."""
    out = np.zeros((len(t), 2))
    rng = np.random.default_rng(11)
    paso = BEAT / 4
    k = 0
    tt = desde
    while tt < hasta:
        i0 = int(tt * SR)
        if k % 2 == 0:
            acorde = ACORDES[int(tt // DUR_ACORDE) % len(ACORDES)]
            f = nota(min(acorde) - 12 + (12 if k % 8 == 6 else 0))
            seg = np.arange(min(int(0.22 * SR), len(t) - i0)) / SR
            v = (np.sin(2 * np.pi * f * seg) + 0.35 * np.sin(2 * np.pi * 2 * f * seg)) * np.exp(-seg * 7) * 0.11
            v *= np.clip(seg / 0.006, 0, 1)
            out[i0:i0 + len(seg)] += v[:, None]
        if k % 16 in (4, 12):
            seg = np.arange(min(int(0.18 * SR), len(t) - i0)) / SR
            ruido = np.diff(np.concatenate([[0], rng.standard_normal(len(seg))]))
            v = ruido * np.exp(-seg * 22) * 0.05
            out[i0:i0 + len(seg), 0] += v * 0.9
            out[i0:i0 + len(seg), 1] += v * 1.1
        seg = np.arange(min(int(0.04 * SR), len(t) - i0)) / SR
        ruido = np.diff(np.concatenate([[0], np.diff(np.concatenate([[0], rng.standard_normal(len(seg))]))]))
        acento = 0.012 if k % 2 else 0.006
        out[i0:i0 + len(seg), 1 if k % 2 else 0] += ruido * np.exp(-seg * 90) * acento
        k += 1
        tt += paso
    return out


def suavizar(x, corte):
    """Pasa bajos de un polo, vectorizado por bloques cortos."""
    a = np.exp(-2 * np.pi * corte / SR)
    y = np.empty_like(x)
    prev = np.zeros(x.shape[1])
    bloque = 64
    pot = a ** np.arange(1, bloque + 1)
    for i in range(0, len(x), bloque):
        seg = x[i:i + bloque]
        n = len(seg)
        # y[k] = (1-a) * sum_j a^(k-j) x[j] + a^(k+1) prev
        ker = (1 - a) * a ** np.arange(n)
        conv = np.stack([np.convolve(seg[:, c], ker)[:n] for c in range(x.shape[1])], axis=1)
        y[i:i + n] = conv + pot[:n, None] * prev
        prev = y[i + n - 1]
    return y


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("salida")
    ap.add_argument("segundos", type=float)
    ap.add_argument("--pulso-desde", type=float, default=0)
    ap.add_argument("--final-en", type=float, default=None)
    ap.add_argument("--estilo", choices=["tranquila", "movida"], default="tranquila")
    a = ap.parse_args()

    dur = a.segundos
    final = a.final_en if a.final_en is not None else dur
    t = np.arange(int(dur * SR)) / SR

    mezcla = pad(t, dur)
    mezcla += arpegio(t, a.pulso_desde, final)
    mezcla += pulso(t, a.pulso_desde, final)
    if a.estilo == "movida":
        mezcla += bajo_y_palmas(t, a.pulso_desde, final)
    # En el final, un acorde grave que sostiene.
    if final < dur:
        cola = np.clip((t - final) / 0.05, 0, 1) * np.exp(-np.clip(t - final, 0, None) * 0.9)
        for n in (45, 57, 64):
            mezcla += (np.sin(2 * np.pi * nota(n) * t) * cola * 0.07)[:, None]

    # Un poco de eco cruzado para que respire.
    retardo = int(BEAT * 0.75 * SR)
    eco = np.zeros_like(mezcla)
    eco[retardo:, 0] = mezcla[:-retardo, 1] * 0.22
    eco[retardo:, 1] = mezcla[:-retardo, 0] * 0.22
    mezcla += eco

    mezcla = suavizar(mezcla, 5200)

    # Entrada y salida.
    fade_in = np.clip(t / 1.0, 0, 1)
    fade_out = np.clip((dur - t) / 1.6, 0, 1)
    mezcla *= (fade_in * fade_out)[:, None]

    mezcla /= np.max(np.abs(mezcla)) / 0.7
    datos = (mezcla * 32767).astype(np.int16)
    with wave.open(a.salida, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(datos.tobytes())
    print(f"{a.salida}: {dur:.1f} s")


if __name__ == "__main__":
    main()
