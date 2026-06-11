"""Speech-to-text adapters.

``STTAdapter`` is the boundary: anything with an async ``transcribe(path)``
returning a ``Transcript`` plugs in. Two implementations ship:

- ``FasterWhisperSTT`` — local, private, no API key (CPU-friendly with int8).
- ``OpenAICompatSTT`` — any /v1/audio/transcriptions endpoint.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import httpx

from ..config import STTSettings


@dataclass
class Transcript:
    text: str
    language: str | None = None
    duration_s: float = 0.0
    # Mean whisper no-speech probability across segments; 0 when unknown.
    no_speech_prob: float = 0.0

    def looks_like_hallucination(self) -> bool:
        """Whisper emits short phantom transcripts ("You", "Thanks.") on noise.

        A one-or-two-word transcript with high no-speech probability is far
        more likely noise than speech; treat it as silence."""
        words = self.text.split()
        return len(words) <= 2 and self.no_speech_prob > 0.5


class STTAdapter(Protocol):
    async def transcribe(self, path: Path) -> Transcript: ...


class FasterWhisperSTT:
    def __init__(self, cfg: STTSettings) -> None:
        self._cfg = cfg
        self._model = None
        self._lock = asyncio.Lock()

    async def _ensure_model(self):
        if self._model is None:
            async with self._lock:
                if self._model is None:
                    cfg = self._cfg

                    def load():
                        from faster_whisper import WhisperModel  # lazy heavy import
                        return WhisperModel(cfg.model, device=cfg.device,
                                            compute_type=cfg.compute_type)

                    self._model = await asyncio.to_thread(load)
        return self._model

    async def transcribe(self, path: Path) -> Transcript:
        model = await self._ensure_model()
        cfg = self._cfg

        def run() -> Transcript:
            segments, info = model.transcribe(str(path), language=cfg.language)
            texts, probs = [], []
            for seg in segments:
                texts.append(seg.text.strip())
                probs.append(seg.no_speech_prob)
            return Transcript(
                text=" ".join(t for t in texts if t),
                language=info.language,
                duration_s=info.duration,
                no_speech_prob=sum(probs) / len(probs) if probs else 1.0,
            )

        return await asyncio.to_thread(run)


class OpenAICompatSTT:
    def __init__(self, cfg: STTSettings, client: httpx.AsyncClient | None = None) -> None:
        self._cfg = cfg
        self._client = client or httpx.AsyncClient(timeout=120.0)

    async def transcribe(self, path: Path) -> Transcript:
        cfg = self._cfg
        headers = {"Authorization": f"Bearer {cfg.api_key}"} if cfg.api_key else {}
        data = await asyncio.to_thread(path.read_bytes)
        resp = await self._client.post(
            f"{cfg.base_url.rstrip('/')}/audio/transcriptions",
            headers=headers,
            data={"model": cfg.api_model, "response_format": "json"},
            files={"file": (path.name, data)},
        )
        resp.raise_for_status()
        payload = resp.json()
        return Transcript(text=payload.get("text", "").strip(),
                          language=payload.get("language"))


def build_stt(cfg: STTSettings) -> STTAdapter:
    if cfg.provider == "faster_whisper":
        return FasterWhisperSTT(cfg)
    return OpenAICompatSTT(cfg)
