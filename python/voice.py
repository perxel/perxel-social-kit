"""Voice-over lines with Kokoro, one raw WAV (24 kHz) per line.

Usage: python voice.py <job.json>
job.json: {"voice": "am_michael", "lang": "a", "speed": 0.95, "out": "<dir>", "lines": {"<key>": "<text to say>"}}
Needs kokoro 0.9.4 on Python 3.12 (`social-kit voice setup`).
"""
import json, sys
from pathlib import Path
import numpy as np
import soundfile as sf
from kokoro import KPipeline

job = json.load(open(sys.argv[1]))
pipe = KPipeline(lang_code=job.get("lang", "a"))
out = Path(job["out"]); out.mkdir(parents=True, exist_ok=True)
for key, say in job["lines"].items():
    audio = np.concatenate([a for _, _, a in pipe(say, voice=job.get("voice", "am_michael"), speed=job.get("speed", 0.95))])
    sf.write(out / f"{key}.raw.wav", audio, 24000)
    print(key, round(len(audio) / 24000, 2))
