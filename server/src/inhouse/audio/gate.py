"""Pre-STT audio gate: reject uploads that contain no plausible speech.

Decodes the uploaded file (any container/codec ffmpeg understands, via PyAV),
measures per-frame RMS, and requires a minimum total duration of frames above
threshold. This runs in well under 100 ms for typical utterances and saves a
multi-second STT pass on silence, room tone, or accidental taps.

The gate FAILS OPEN: if PyAV is unavailable or decoding errors out, the audio
is passed through to STT, which performs its own decoding and will surface a
real error if the file is junk.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path

from ..config import GateSettings


@dataclass
class GateResult:
    passed: bool
    reason: str
    active_s: float = 0.0
    duration_s: float = 0.0


def _analyze(path: Path, cfg: GateSettings) -> GateResult:
    try:
        import av  # noqa: PLC0415 — optional dependency
        import numpy as np
    except ImportError:
        return GateResult(True, "gate-unavailable")

    try:
        frame_len = None
        buf = np.empty(0, dtype=np.float32)
        active_s = 0.0
        total = 0
        rate = 0
        with av.open(str(path)) as container:
            stream = container.streams.audio[0]
            for frame in container.decode(stream):
                rate = frame.sample_rate or rate
                if frame_len is None:
                    frame_len = max(int(rate * cfg.frame_ms / 1000), 1)
                samples = frame.to_ndarray()
                if samples.dtype.kind == "i":
                    samples = samples.astype(np.float32) / np.iinfo(samples.dtype).max
                else:
                    samples = samples.astype(np.float32)
                if samples.ndim > 1:  # average channels
                    samples = samples.mean(axis=0)
                buf = np.concatenate([buf, samples])
                total += len(samples)
                while len(buf) >= frame_len:
                    window, buf = buf[:frame_len], buf[frame_len:]
                    rms = float(np.sqrt(np.mean(window**2)))
                    if rms >= cfg.rms_threshold:
                        active_s += cfg.frame_ms / 1000
                if rate and total / rate > cfg.max_duration_s:
                    break
        duration_s = total / rate if rate else 0.0
    except Exception:  # decode failure → fail open
        return GateResult(True, "decode-error")

    if duration_s > cfg.max_duration_s:
        return GateResult(False, "too-long", active_s, duration_s)
    if active_s < cfg.min_active_s:
        return GateResult(False, "no-speech-energy", active_s, duration_s)
    return GateResult(True, "ok", active_s, duration_s)


async def check_audio(path: Path, cfg: GateSettings) -> GateResult:
    if not cfg.enabled:
        return GateResult(True, "disabled")
    return await asyncio.to_thread(_analyze, path, cfg)
