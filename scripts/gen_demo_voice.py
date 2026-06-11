#!/usr/bin/env python3
"""Render the interface demo's spoken replies with the product's real voice.

Reads web/src/demo/voice-lines.json (the single catalog driving both the
demo's text bubbles and its audio), synthesizes each line with the same
Piper model the server ships with, and encodes small mono MP3s into
web/demo-voice/ — committed assets that the demo build copies to
site/demo/voice/. Re-run (then `make demo`) whenever the catalog changes.

Usage:
    server/.venv/bin/python scripts/gen_demo_voice.py
Requires: piper in the server venv, a voice in voices/ (make voice), ffmpeg.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "web" / "src" / "demo" / "voice-lines.json"
OUT_DIR = ROOT / "web" / "demo-voice"
VOICE = ROOT / "voices" / "en_US-lessac-medium.onnx"
MP3_BITRATE = "40k"

# Display text → speakable text. The bubbles show the left side; the voice
# says the right side. Keep entries minimal and pronunciation-only.
SPEECH_SUBS = [
    ("git clone github.com/getinhouse/inhouse", "git clone, from the Inhouse repo on GitHub,"),
    ("github.com/getinhouse/inhouse", "the Inhouse repo on GitHub"),
    ("→", ", then "),
    ("*", ""),
    ("$59", "59 dollars"),
    ("us-east-1", "U S east one"),
    ("openWakeWord", "open wake word"),
    ("FastAPI", "Fast A P I"),
    ("faster-whisper", "faster whisper"),
    ("N100", "N one hundred"),
]


def speakable(text: str) -> str:
    for src, dst in SPEECH_SUBS:
        text = text.replace(src, dst)
    return text


def main() -> None:
    if not VOICE.is_file():
        sys.exit(f"voice model missing: {VOICE} — run `make voice` first")
    lines: dict[str, str] = json.loads(CATALOG.read_text())
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # Drop MP3s for lines that no longer exist in the catalog.
    for stale in OUT_DIR.glob("*.mp3"):
        if stale.stem not in lines:
            stale.unlink()
            print(f"removed stale {stale.name}")

    python = ROOT / "server" / ".venv" / "bin" / "python"
    for line_id, text in sorted(lines.items()):
        out = OUT_DIR / f"{line_id}.mp3"
        with tempfile.NamedTemporaryFile(suffix=".wav") as wav:
            subprocess.run(
                [str(python), "-m", "piper", "-m", str(VOICE), "-f", wav.name],
                input=speakable(text).encode(),
                check=True,
                capture_output=True,
            )
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", wav.name,
                 "-ac", "1", "-b:a", MP3_BITRATE, str(out)],
                check=True,
            )
        print(f"{out.name}: {out.stat().st_size // 1024} KB")
    total = sum(f.stat().st_size for f in OUT_DIR.glob("*.mp3"))
    print(f"{len(lines)} lines, {total // 1024} KB total")


if __name__ == "__main__":
    main()
