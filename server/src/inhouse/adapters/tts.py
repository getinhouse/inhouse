"""Text-to-speech adapters.

``TTSAdapter.synthesize(text)`` yields raw PCM (s16le, mono) at
``adapter.sample_rate``. The turn pipeline wraps the combined sentence PCM in
a single streaming WAV.

- ``PiperTTS`` — local neural TTS, no API key, fast on CPU. Spawns the piper
  CLI per sentence with ``--output-raw``; spawn overhead is ~100 ms, which is
  hidden behind LLM streaming in practice.
- ``OpenAICompatTTS`` — any /v1/audio/speech endpoint (request WAV, container
  stripped on the fly).
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import AsyncIterator, Protocol

import httpx

from ..audio.wav import WavChunkParser
from ..config import TTSSettings


class TTSAdapter(Protocol):
    sample_rate: int

    def synthesize(self, text: str) -> AsyncIterator[bytes]: ...


def _resolve_piper(configured: str) -> str:
    """Find the piper executable: explicit path → PATH → alongside the
    running interpreter (the common case when piper-tts is installed into the
    server's virtualenv but the service was started by absolute python path)."""
    import shutil
    import sys
    if "/" in configured:
        return configured
    found = shutil.which(configured)
    if found:
        return found
    sibling = Path(sys.executable).parent / configured
    if sibling.exists():
        return str(sibling)
    raise TTSError(
        f"piper executable {configured!r} not found on PATH or next to the "
        "python interpreter; install with: pip install 'inhouse-server[local]'")


class TTSError(RuntimeError):
    pass


class PiperTTS:
    def __init__(self, cfg: TTSSettings) -> None:
        if not cfg.voice_path:
            raise TTSError("INHOUSE_TTS__VOICE_PATH must point to a piper .onnx voice")
        self._cfg = cfg
        self._bin = _resolve_piper(cfg.piper_bin)
        self.sample_rate = cfg.sample_rate

    async def synthesize(self, text: str) -> AsyncIterator[bytes]:
        cfg = self._cfg
        proc = await asyncio.create_subprocess_exec(
            self._bin, "-m", cfg.voice_path, "--output-raw",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        assert proc.stdin and proc.stdout and proc.stderr
        proc.stdin.write(text.encode() + b"\n")
        await proc.stdin.drain()
        proc.stdin.close()
        try:
            while chunk := await proc.stdout.read(8192):
                yield chunk
        finally:
            stderr = await proc.stderr.read()
            code = await proc.wait()
            if code != 0:
                raise TTSError(f"piper exited {code}: {stderr.decode(errors='replace')[:300]}")


class OpenAICompatTTS:
    def __init__(self, cfg: TTSSettings, client: httpx.AsyncClient | None = None) -> None:
        self._cfg = cfg
        self._client = client or httpx.AsyncClient(timeout=120.0)
        # OpenAI's WAV output is 24 kHz; override via config for other vendors.
        self.sample_rate = cfg.sample_rate

    async def synthesize(self, text: str) -> AsyncIterator[bytes]:
        cfg = self._cfg
        headers = {"Authorization": f"Bearer {cfg.api_key}"} if cfg.api_key else {}
        async with self._client.stream(
            "POST", f"{cfg.base_url.rstrip('/')}/audio/speech",
            headers=headers,
            json={"model": cfg.api_model, "voice": cfg.api_voice,
                  "input": text, "response_format": "wav"},
        ) as resp:
            if resp.status_code >= 400:
                detail = (await resp.aread()).decode(errors="replace")[:500]
                raise TTSError(f"TTS endpoint returned {resp.status_code}: {detail}")
            parser = WavChunkParser()
            async for chunk in resp.aiter_bytes():
                pcm = parser.feed(chunk)
                if pcm:
                    yield pcm
            if parser.sample_rate and parser.sample_rate != self.sample_rate:
                raise TTSError(
                    f"endpoint produced {parser.sample_rate} Hz audio but adapter is "
                    f"configured for {self.sample_rate} Hz — set INHOUSE_TTS__SAMPLE_RATE"
                )


def build_tts(cfg: TTSSettings) -> TTSAdapter:
    if cfg.provider == "piper":
        return PiperTTS(cfg)
    return OpenAICompatTTS(cfg)
