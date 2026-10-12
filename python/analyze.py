"""Tempo, beat times and a per-bar loudness curve for a track, to find the build and the drop.

Usage: python analyze.py <track.mp3> [out.json]   (default: <track>.beats.json next to it)
Needs librosa (`social-kit voice setup` installs it).
"""
import json, sys
import librosa, numpy as np
path = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else path.rsplit(".", 1)[0] + ".beats.json"
y, sr = librosa.load(path, sr=22050, mono=True)
tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units="time")
tempo = float(np.atleast_1d(tempo)[0])
rms = librosa.feature.rms(y=y)[0]; t = librosa.times_like(rms, sr=sr)
low = librosa.feature.rms(y=librosa.effects.preemphasis(y, coef=-0.97))[0]  # bass-weighted
bar = 4 * 60 / tempo
bars = []
for i in range(int(len(y) / sr / bar)):
    m = (t >= i * bar) & (t < (i + 1) * bar)
    bars.append({"bar": i + 1, "start": round(i * bar, 2), "rms": round(float(rms[m].mean()), 4), "bass": round(float(low[m].mean()), 4)})
json.dump({"tempo": tempo, "beats": [round(float(b), 3) for b in beats], "bars": bars}, open(out, "w"), indent=1)
print(out)
print("tempo", round(tempo, 2), "first beat", round(float(beats[0]), 3), "beats", len(beats))
mx = max(b["rms"] for b in bars)
for b in bars:
    print(f'{b["bar"]:3d} {b["start"]:7.2f}s ' + "#" * int(40 * b["rms"] / mx))
