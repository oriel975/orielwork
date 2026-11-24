"""Clean generated voiceover takes and copy them into assets/<company>/vo/.

    python vo_post.py <raw_dir> <assets_dir> report.json [report2.json ...]

Per line: trim silence at both ends, flag takes that are too long for their
text or have long gaps (a sign of babble or dead air), then high-pass, gentle
compression and loudness normalisation to -16 LUFS / -1.5 dBTP, 48 kHz mono.
Prints a table; flagged lines are listed for regeneration and not copied.
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

# Keys checked by hand (e.g. a deliberate pause, or digits in the transcript) that pass anyway.
ACCEPT = set(filter(None, os.environ.get("ACCEPT", "").split(",")))

raw_dir, assets_dir = Path(sys.argv[1]), Path(sys.argv[2])
reports = [json.load(open(p, encoding="utf-8")) for p in sys.argv[3:]]
entries = {}
for rep in reports:
    for e in rep:
        entries[e["out"]] = e  # later reports win


def run(args):
    return subprocess.run(args, capture_output=True, text=True)


def duration(path):
    r = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)])
    return float(r.stdout.strip() or 0)


flagged = []
for out, e in entries.items():
    src = Path(out)
    key = src.relative_to(raw_dir).with_suffix("")
    company = key.parts[0]
    dest = assets_dir / company / "vo" / f"{key.name}.wav"
    trimmed = src.with_name(src.stem + ".trim.wav")
    trim = ("silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,"
            "areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.12,areverse")
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-af", trim, str(trimmed)])
    d = duration(trimmed)
    gaps = [float(g) for g in re.findall(r"silence_duration: ([0-9.]+)",
                                         run(["ffmpeg", "-i", str(trimmed), "-af", "silencedetect=n=-45dB:d=0.9", "-f", "null", "-"]).stderr)]
    letters = len(re.sub(r"[^א-תA-Za-z0-9]", "", e["text"]))
    per_char = d / max(1, letters)
    problem = []
    if per_char > 0.15:
        problem.append(f"slow {per_char:.3f}s/char")
    if gaps and max(gaps) > 1.2:
        problem.append(f"gap {max(gaps):.1f}s")
    if e.get("cer", 0) > 0.3:
        problem.append(f"cer {e['cer']}")
    if problem and str(key) in ACCEPT:
        problem = []
        accepted = True
    else:
        accepted = False
    status = "FLAG " + ", ".join(problem) if problem else ("ok (accepted)" if accepted else "ok")
    print(f"{key}  {d:5.2f}s  {per_char:.3f}s/ch  cer={e.get('cer')}  {status}")
    if problem:
        flagged.append(str(key))
        continue
    dest.parent.mkdir(parents=True, exist_ok=True)
    chain = ("highpass=f=70,acompressor=threshold=-20dB:ratio=3:attack=5:release=80:makeup=2,"
             "loudnorm=I=-16:TP=-1.5:LRA=7,aresample=48000")
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(trimmed), "-af", chain, "-ac", "1", "-c:a", "pcm_s16le", str(dest)])

print("\nflagged:", " ".join(flagged) if flagged else "none")
