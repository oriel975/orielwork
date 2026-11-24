"""Original score generator for the Interplus videos (no samples, no licensing).

    python compose.py <video.json> <out.wav>          # score for one video
    python compose.py --sfx <out_dir>                 # whoosh / impact / riser / tick / shimmer

The score follows the video's scenes: each scene type has an energy level
(0 = pad only ... 3 = full drums), risers lead into big sections and a hit
lands where the outro's logo flashes. Three palettes keyed by `musicStyle`:
  installations  D minor, half-time, wide pads and a steady pluck: confident
  ev             A major, four-on-the-floor, bright arps: modern and light
  enerlec        C minor tension with a ticking clock, released into Eb major
Needs numpy, scipy, soundfile (and pyloudnorm for loudness normalisation).
"""
import json
import math
import sys

import numpy as np
import scipy.signal as sig
import soundfile as sf

SR = 48000
BPM = 120
BEAT = 60 / BPM
BAR = 4 * BEAT
rng = np.random.default_rng(7)


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def lowpass(x, cutoff, order=2):
    b, a = sig.butter(order, min(cutoff, SR / 2 * 0.95) / (SR / 2), "low")
    return sig.lfilter(b, a, x, axis=-1)


def highpass(x, cutoff, order=2):
    b, a = sig.butter(order, cutoff / (SR / 2), "high")
    return sig.lfilter(b, a, x, axis=-1)


def bandpass(x, lo, hi, order=2):
    b, a = sig.butter(order, [lo / (SR / 2), min(hi, SR / 2 * 0.95) / (SR / 2)], "band")
    return sig.lfilter(b, a, x, axis=-1)


def env_adsr(n, a, d, s, r_len, total_len):
    """Attack/decay/sustain then release over r_len seconds, total_len seconds long."""
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-4), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    hold = total_len - r_len
    e = np.where(t > hold, e * np.clip(1 - (t - hold) / max(r_len, 1e-4), 0, 1), e)
    return e


def place(bus, x, start):
    i = int(round(start * SR))
    if i >= bus.shape[-1] or i + x.shape[-1] <= 0:
        return
    j = min(bus.shape[-1], i + x.shape[-1])
    src0 = max(0, -i)
    bus[..., max(i, 0):j] += x[..., src0 : src0 + (j - max(i, 0))]


# ---------------------------------------------------------------- instruments

def supersaw(freq, length, voices=5, detune=0.12, seed=0):
    n = int(length * SR)
    t = np.arange(n) / SR
    out = np.zeros((2, n))
    r = np.random.default_rng(seed)
    for v in range(voices):
        cents = (v - (voices - 1) / 2) / ((voices - 1) / 2 or 1) * detune * 100
        for ch in range(2):
            f = freq * 2 ** ((cents + r.uniform(-3, 3)) / 1200)
            ph = r.uniform(0, 1)
            out[ch] += sig.sawtooth(2 * np.pi * (f * t + ph))
    return out / voices


def pad_chord(notes, length, cutoff, seed=0):
    x = sum(supersaw(hz(m), length + 1.5, seed=seed + k) for k, m in enumerate(notes)) / len(notes)
    x = lowpass(x, cutoff, 2)
    e = env_adsr(x.shape[-1], 0.9, 1.5, 0.85, 1.5, length + 1.5)
    return x * e * 0.5


def pluck(freq, length=0.35, bright=2600, seed=0):
    n = int(length * SR)
    t = np.arange(n) / SR
    r = np.random.default_rng(seed)
    x = sig.square(2 * np.pi * freq * t, 0.35) * 0.6 + sig.sawtooth(2 * np.pi * freq * 1.003 * t + r.uniform(0, 6)) * 0.4
    dark = lowpass(x, bright * 0.35)
    brightx = lowpass(x, bright)
    mix = np.exp(-t / 0.05)
    y = brightx * mix + dark * (1 - mix)
    y *= np.exp(-t / (length * 0.32)) * np.clip(t / 0.003, 0, 1)
    pan = r.uniform(-0.35, 0.35)
    return np.stack([y * (1 - pan), y * (1 + pan)]) * 0.5


def bell(freq, length=1.6):
    n = int(length * SR)
    t = np.arange(n) / SR
    y = sum(a * np.sin(2 * np.pi * freq * m * t) * np.exp(-t / (length * d)) for m, a, d in
            [(1, 1.0, 0.5), (2.01, 0.35, 0.25), (3.0, 0.2, 0.15), (4.2, 0.12, 0.1)])
    y *= np.clip(t / 0.002, 0, 1)
    return np.stack([y, y]) * 0.25


def sub_bass(freq, length):
    n = int(length * SR)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * freq * t) + 0.25 * np.sin(2 * np.pi * 2 * freq * t)
    y = np.tanh(1.6 * y) * env_adsr(n, 0.01, 0.4, 0.75, 0.08, length)
    return np.stack([y, y]) * 0.42


def kick(power=1.0):
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    f = 45 + 95 * np.exp(-t / 0.03)
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph) * np.exp(-t / 0.22) + 0.3 * rng.standard_normal(n) * np.exp(-t / 0.003)
    y = np.tanh(1.5 * y)
    return np.stack([y, y]) * 0.62 * power


def clap():
    n = int(0.4 * SR)
    t = np.arange(n) / SR
    noise = bandpass(rng.standard_normal(n), 900, 6000)
    e = np.zeros(n)
    for off in (0, 0.011, 0.023):
        e += np.where(t >= off, np.exp(-(t - off) / 0.012), 0) * 0.5
    e += np.where(t >= 0.03, np.exp(-(t - 0.03) / 0.14), 0)
    y = noise * e + 0.3 * np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05)
    return np.stack([y * 0.9, y]) * 0.28


def hat(open_=False):
    n = int((0.35 if open_ else 0.08) * SR)
    t = np.arange(n) / SR
    y = highpass(rng.standard_normal(n), 7500, 4) * np.exp(-t / (0.12 if open_ else 0.022))
    pan = rng.uniform(-0.3, 0.3)
    return np.stack([y * (1 - pan), y * (1 + pan)]) * 0.13


def tom(freq=95):
    n = int(0.7 * SR)
    t = np.arange(n) / SR
    f = freq * (1 + 0.5 * np.exp(-t / 0.04))
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.28)
    return np.stack([y, y]) * 0.45


def boom(length=3.0):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = 32 + 70 * np.exp(-t / 0.08)
    low = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.9)
    crack = lowpass(rng.standard_normal(n), 3500) * np.exp(-t / 0.12)
    air = highpass(rng.standard_normal(n), 3000) * np.exp(-t / 0.6) * 0.15
    y = np.tanh(1.3 * (low + 0.5 * crack + air))
    return np.stack([y, y * 0.97]) * 0.8


def riser(length=2.0):
    n = int(length * SR)
    t = np.arange(n) / SR
    p = t / length
    noise = rng.standard_normal((2, n))
    segs = 24
    out = np.zeros((2, n))
    for s in range(segs):
        a, b = int(n * s / segs), int(n * (s + 1) / segs)
        c = 300 * (12000 / 300) ** (s / segs)
        out[:, a:b] = bandpass(noise[:, a:b], c * 0.6, c * 1.5)
    f = 180 * (8 ** p)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25
    y = (out + tone) * p ** 2.2
    return y * 0.45


def whoosh(length=0.9):
    n = int(length * SR)
    t = np.arange(n) / SR
    p = t / length
    noise = rng.standard_normal((2, n))
    out = np.zeros((2, n))
    segs = 18
    for s in range(segs):
        a, b = int(n * s / segs), int(n * (s + 1) / segs)
        c = 400 + 5200 * math.sin(math.pi * (s + 0.5) / segs)
        out[:, a:b] = bandpass(noise[:, a:b], c * 0.5, c * 1.4)
    e = np.sin(np.pi * p) ** 1.6
    pan = np.stack([1.2 - p, 0.2 + p])  # right to left, like the sweep
    return out * e * pan * 0.35


def shimmer(length=2.4):
    n = int(length * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for m in (88, 91, 95, 98, 100):
        y += np.sin(2 * np.pi * hz(m) * t + rng.uniform(0, 6)) * np.exp(-t / 0.9)
    y *= np.clip(t / 0.04, 0, 1)
    return np.stack([y, np.roll(y, 300)]) * 0.07


def tick():
    n = int(0.06 * SR)
    t = np.arange(n) / SR
    y = bandpass(rng.standard_normal(n), 2500, 7000) * np.exp(-t / 0.006) + 0.4 * np.sin(2 * np.pi * 1900 * t) * np.exp(-t / 0.01)
    return np.stack([y, y]) * 0.22


# ---------------------------------------------------------------- effects

def reverb_ir(rt60=2.4, length=3.0, damp=6000, seed=3):
    n = int(length * SR)
    t = np.arange(n) / SR
    r = np.random.default_rng(seed)
    ir = r.standard_normal((2, n)) * np.exp(-6.9 * t / rt60)
    ir = lowpass(ir, damp)
    ir[:, : int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
    return ir / np.sqrt(np.sum(ir ** 2, axis=-1, keepdims=True))


def reverb(x, wet=0.25, rt60=2.4):
    ir = reverb_ir(rt60)
    y = np.stack([sig.fftconvolve(x[c], ir[c])[: x.shape[-1]] for c in range(2)])
    return x * (1 - wet) + y * wet


def echo(x, delay, fb=0.35, mix=0.3, taps=4):
    d = int(delay * SR)
    y = x.copy()
    g = 1.0
    for k in range(1, taps + 1):
        g *= fb
        shifted = np.zeros_like(x)
        shifted[:, d * k :] = x[:, : -d * k] if d * k < x.shape[-1] else 0
        if k % 2:
            shifted = shifted[::-1]  # ping-pong
        y += shifted * g * mix / fb
    return y


# ---------------------------------------------------------------- styles

STYLES = {
    "installations": {
        # Dm  Bb  F  C (i VI III VII), two bars each
        "chords": [[50, 57, 62, 65], [46, 53, 62, 65], [45, 53, 57, 60], [48, 55, 60, 64]],
        "roots": [38, 34, 41, 36],
        "arp": [[74, 77, 81, 77], [74, 77, 82, 77], [72, 77, 81, 77], [72, 76, 79, 76]],
        "halftime": True,
        "bright": 2400,
    },
    "ev": {
        # A  E  F#m  D (I V vi IV)
        "chords": [[57, 61, 64, 69], [56, 59, 64, 68], [54, 57, 61, 66], [54, 57, 62, 66]],
        "roots": [45, 40, 42, 38],
        "arp": [[76, 81, 85, 81], [76, 80, 83, 80], [78, 81, 85, 81], [78, 81, 86, 81]],
        "halftime": False,
        "bright": 4200,
    },
    "enerlec": {
        # tension: Cm(add9) over a drone, Ab, Fm, G(b9); release: Eb Bb Cm Ab
        "chords": [[48, 55, 62, 63], [44, 51, 60, 63], [41, 48, 56, 63], [43, 50, 56, 59]],
        "roots": [36, 32, 29, 31],
        "arp": [[72, 75, 79, 75], [72, 75, 80, 75], [72, 77, 80, 77], [71, 74, 77, 74]],
        "release_chords": [[51, 58, 63, 67], [46, 53, 62, 65], [48, 55, 63, 67], [44, 51, 60, 63]],
        "release_roots": [39, 34, 36, 32],
        "release_arp": [[75, 79, 82, 79], [74, 77, 82, 77], [75, 79, 84, 79], [72, 75, 80, 75]],
        "halftime": True,
        "bright": 2000,
    },
}

ENERGY_BY_TYPE = {"title": 1, "logo": 1, "image": 1, "video": 1, "montage": 2, "stat": 2, "projects": 2, "beforeAfter": 2, "outro": 1}


def sections_from_video(video):
    secs, t = [], 0.0
    for i, s in enumerate(video["scenes"]):
        e = s.get("musicEnergy", ENERGY_BY_TYPE.get(s["type"], 1))
        secs.append({"start": t, "end": t + s["duration"], "energy": e, "type": s["type"], "release": s.get("musicRelease", False)})
        t += s["duration"]
    return secs, t


def compose(video, out_path):
    style = STYLES[video.get("musicStyle", video.get("company", "installations"))]
    secs, total = sections_from_video(video)
    n = int((total + 4.0) * SR)
    pad = np.zeros((2, n)); bass = np.zeros((2, n)); arp = np.zeros((2, n))
    drums = np.zeros((2, n)); fx = np.zeros((2, n)); pulse = np.zeros((2, n))
    sidechain = np.ones(n)

    def section_at(t):
        for s in secs:
            if s["start"] <= t < s["end"]:
                return s
        return secs[-1]

    # Released (major) harmony from the first scene marked musicRelease onwards.
    release_at = next((s["start"] for s in secs if s["release"]), None)
    outro = next((s for s in secs if s["type"] == "outro"), None)
    hit_time = outro["start"] + 0.75 if outro else None  # logo flash, ~22 frames into the outro
    end_music = (hit_time + 0.05) if hit_time else total

    chord_len = 2 * BAR
    k = 0
    t = 0.0
    while t < end_music:
        rel = release_at is not None and t >= release_at and "release_chords" in style
        chords = style["release_chords"] if rel else style["chords"]
        roots = style["release_roots"] if rel else style["roots"]
        arps = style["release_arp"] if rel else style["arp"]
        idx = k % 4
        s = section_at(t)
        e = s["energy"]
        cutoff = [700, 1300, 2300, 3600][min(e, 3)]
        length = min(chord_len, end_music - t + 0.01)
        place(pad, pad_chord(chords[idx], length, cutoff, seed=k), t)
        # bass
        if e >= 1:
            step = BEAT * (2 if style["halftime"] and e < 3 else 1)
            bt = t
            while bt < t + length - 1e-6:
                place(bass, sub_bass(hz(roots[idx]), min(step * 0.92, t + length - bt)), bt)
                bt += step
        # pulse plucks (8ths) from energy 1, arp (16ths) from energy 2
        bt = t
        q = 0
        while bt < t + length - 1e-6:
            sec = section_at(bt)
            if sec["energy"] >= 1 and q % 2 == 0:
                place(pulse, pluck(hz(roots[idx] + 24), 0.3, style["bright"] * 0.6, seed=q + 100 * k) * (0.9 if q % 8 == 0 else 0.6), bt)
            if sec["energy"] >= 2:
                note = arps[idx][q % 4] + (12 if sec["energy"] >= 3 and (q // 4) % 2 else 0)
                place(arp, pluck(hz(note), 0.22, style["bright"], seed=q + 7 * k) * 0.55, bt)
            bt += BEAT / 2 if sec["energy"] < 2 else BEAT / 4
            q += 1 if sec["energy"] < 2 else 1
        t += chord_len
        k += 1

    # drums on the beat grid
    b = 0
    tb = 0.0
    while tb < end_music - 1e-6:
        s = section_at(tb)
        e = s["energy"]
        beat_in_bar = b % 4
        if e >= 2:
            if style["halftime"] and e < 3:
                if beat_in_bar == 0:
                    place(drums, kick(), tb)
                    sidechain[int(tb * SR): int(tb * SR) + int(0.25 * SR)] = np.minimum(
                        sidechain[int(tb * SR): int(tb * SR) + int(0.25 * SR)], 0.45 + 0.55 * np.linspace(0, 1, int(0.25 * SR)) ** 0.7)
                if beat_in_bar == 2:
                    place(drums, clap(), tb)
            else:
                place(drums, kick(), tb)
                seg = slice(int(tb * SR), int(tb * SR) + int(0.22 * SR))
                ln = sidechain[seg].shape[0]
                sidechain[seg] = np.minimum(sidechain[seg], 0.4 + 0.6 * np.linspace(0, 1, ln) ** 0.7)
                if beat_in_bar in (1, 3):
                    place(drums, clap(), tb)
            place(drums, hat(), tb + BEAT / 2)
            if e >= 3:
                place(drums, hat(), tb)
                place(drums, hat(open_=True) * 0.6, tb + BEAT / 2)
        b += 1
        tb += BEAT

    # tension clock for enerlec before the release
    if "release_chords" in style:
        tb = 0.0
        while tb < (release_at or end_music):
            place(fx, tick() * (1.0 if int(round(tb / BEAT)) % 2 == 0 else 0.6), tb)
            tb += BEAT / 2

    # risers into higher-energy sections and into the outro; booms on big entries
    for prev, cur in zip(secs, secs[1:]):
        jump = cur["energy"] - prev["energy"]
        if cur["type"] == "outro" and hit_time:
            continue
        if jump >= 1 and prev["end"] - prev["start"] >= 2.5:
            place(fx, riser(2.0) * 0.8, cur["start"] - 2.0)
        if jump >= 1:
            place(fx, boom(2.5) * 0.45, cur["start"])
            place(fx, hat(open_=True) * 2.5, cur["start"])
    if hit_time:
        place(fx, riser(3.0), hit_time - 3.0)
        place(fx, boom(4.0), hit_time)
        place(fx, shimmer(3.0) * 1.2, hit_time + 0.05)
        # Final chord: the tonic held under the logo and tagline.
        last = (style["release_chords"] if release_at is not None and "release_chords" in style else style["chords"])[0]
        tail = total - hit_time + 2.5
        place(pad, pad_chord(last, tail, 2600, seed=99) * 1.1, hit_time)
        place(pad, bell(hz(last[-1] + 12), 3.0) * 1.2, hit_time + 0.02)
        place(bass, sub_bass(hz((style["release_roots"] if release_at is not None and "release_roots" in style else style["roots"])[0]), 2.5), hit_time)

    # mix
    pulse = echo(pulse, BEAT * 0.75, 0.3, 0.35)
    arp = echo(arp, BEAT * 0.75, 0.35, 0.4)
    music = 0.85 * pad * sidechain + 0.9 * bass * sidechain + 0.55 * pulse + 0.5 * arp
    music = reverb(music, wet=0.28, rt60=2.6)
    mix = music + 0.95 * drums + reverb(fx, 0.35, 3.0)
    mix = highpass(mix, 28)
    # fade the tail out by the end of the video
    fade_start = int((total - 1.6) * SR)
    fade = np.ones(n)
    fade[fade_start:] = np.clip(1 - (np.arange(n - fade_start) / (1.6 * SR)), 0, 1)
    mix *= fade
    mix = mix[:, : int(total * SR)]
    mix = np.tanh(mix * 1.1) / np.tanh(1.1)

    try:
        import pyloudnorm as pyln
        meter = pyln.Meter(SR)
        loud = meter.integrated_loudness(mix.T)
        mix = pyln.normalize.loudness(mix.T, loud, -16.0).T
    except Exception as exc:  # pragma: no cover
        print("loudness normalisation skipped:", exc)
    peak = np.max(np.abs(mix))
    if peak > 0.89:
        mix *= 0.89 / peak
    sf.write(out_path, mix.T, SR, subtype="PCM_16")
    print(f"{out_path}: {total:.1f}s, style {video.get('musicStyle', video.get('company'))}, peak {20 * np.log10(np.max(np.abs(mix)) + 1e-9):.1f} dBFS")


def write_sfx(out_dir):
    import os
    os.makedirs(out_dir, exist_ok=True)

    def norm(x, peak=0.8):
        return x / (np.max(np.abs(x)) + 1e-9) * peak

    def tailpad(x, secs):
        return np.concatenate([x, np.zeros((2, int(secs * SR)))], axis=1)

    items = {
        "whoosh": norm(reverb(tailpad(whoosh(0.8), 0.6), 0.25, 1.5), 0.7),
        "impact": norm(reverb(tailpad(boom(3.0), 0.5), 0.3, 2.8), 0.9),
        "riser": norm(riser(2.0), 0.7),
        "shimmer": norm(reverb(tailpad(shimmer(2.0), 1.0), 0.4, 2.5), 0.5),
        "tick": norm(tick(), 0.5),
    }
    for name, x in items.items():
        sf.write(f"{out_dir}/{name}.wav", x.T, SR, subtype="PCM_16")
        print("sfx", name, f"{x.shape[-1] / SR:.2f}s")


if __name__ == "__main__":
    if sys.argv[1] == "--sfx":
        write_sfx(sys.argv[2])
    else:
        compose(json.load(open(sys.argv[1], encoding="utf-8")), sys.argv[2])
