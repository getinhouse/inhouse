"""Turn orchestration: audio/text in → transcript → streamed LLM reply →
sentence-pipelined TTS → live-streamable WAV.

The pipeline is latency-shaped: TTS for the first sentence starts while the
LLM is still writing the rest of the reply, and the client can begin playback
as soon as the first PCM chunk lands in the broker — well before the reply is
fully synthesized.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from pathlib import Path

from .adapters.llm import LLMAdapter
from .adapters.stt import STTAdapter
from .adapters.tts import TTSAdapter
from .audio.broker import TurnAudioBroker, TurnAudioRegistry
from .audio.gate import check_audio
from .config import Settings
from .sentences import SentenceAssembler
from .sessions import Session, SessionStore
from .audio.wav import patch_wav_sizes, wav_header

log = logging.getLogger("inhouse.turns")


class TurnError(Exception):
    def __init__(self, code: str, message: str, status: int = 422) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


@dataclass
class TurnResult:
    turn_id: str
    transcript: str
    reply_text: str
    audio_url: str
    timings: dict[str, float | None]


class TurnPipeline:
    def __init__(self, settings: Settings, store: SessionStore,
                 stt: STTAdapter, llm: LLMAdapter, tts: TTSAdapter,
                 registry: TurnAudioRegistry) -> None:
        self._settings = settings
        self._store = store
        self._stt = stt
        self._llm = llm
        self._tts = tts
        self._registry = registry

    async def run_audio_turn(self, session: Session, upload: Path) -> TurnResult:
        started = time.monotonic()
        gate = await check_audio(upload, self._settings.gate)
        if not gate.passed:
            raise TurnError("no_speech", f"No speech detected ({gate.reason}).")

        transcript = await self._stt.transcribe(upload)
        stt_ms = (time.monotonic() - started) * 1000
        if not transcript.text or transcript.looks_like_hallucination():
            raise TurnError("no_speech", "No speech detected in the audio.")

        return await self._reply(session, transcript.text, started, stt_ms)

    async def run_text_turn(self, session: Session, text: str) -> TurnResult:
        text = text.strip()
        if not text:
            raise TurnError("empty_text", "Text turn must not be empty.")
        return await self._reply(session, text, time.monotonic(), None)

    async def _reply(self, session: Session, user_text: str,
                     started: float, stt_ms: float | None) -> TurnResult:
        turn_id = session.next_turn_id()
        broker = self._registry.register(session.id, turn_id)
        audio_path = self._audio_path(session.id, turn_id)

        sentence_q: asyncio.Queue[str | None] = asyncio.Queue()
        synth_task = asyncio.create_task(
            self._synthesize_worker(session.id, turn_id, broker, audio_path, sentence_q))

        assembler = SentenceAssembler()
        parts: list[str] = []
        llm_started = time.monotonic()
        try:
            messages = [*session.messages, {"role": "user", "content": user_text}]
            async for delta in self._llm.stream(messages):
                parts.append(delta)
                for sentence in assembler.feed(delta):
                    sentence_q.put_nowait(sentence)
            for sentence in assembler.flush():
                sentence_q.put_nowait(sentence)
        except Exception as exc:
            sentence_q.put_nowait(None)
            synth_task.cancel()
            self._registry.release(session.id, turn_id)
            log.exception("LLM stream failed")
            raise TurnError("llm_error", f"Language model request failed: {exc}",
                            status=502) from exc
        finally:
            llm_ms = (time.monotonic() - llm_started) * 1000

        sentence_q.put_nowait(None)
        reply_text = "".join(parts).strip()
        if not reply_text:
            synth_task.cancel()
            self._registry.release(session.id, turn_id)
            raise TurnError("empty_reply", "The language model returned no text.",
                            status=502)

        session.add_exchange(user_text, reply_text)
        await self._store.save(session)

        return TurnResult(
            turn_id=turn_id,
            transcript=user_text,
            reply_text=reply_text,
            audio_url=f"/api/sessions/{session.id}/turns/{turn_id}/audio",
            timings={
                "stt_ms": round(stt_ms, 1) if stt_ms is not None else None,
                "llm_ms": round(llm_ms, 1),
                "total_ms": round((time.monotonic() - started) * 1000, 1),
            },
        )

    async def _synthesize_worker(self, session_id: str, turn_id: str,
                                 broker: TurnAudioBroker, audio_path: Path,
                                 queue: asyncio.Queue[str | None]) -> None:
        """Consume sentences as they complete and stream PCM into the broker
        and the on-disk WAV simultaneously."""
        audio_path.parent.mkdir(parents=True, exist_ok=True)
        header = wav_header(self._tts.sample_rate)
        try:
            with audio_path.open("wb") as f:
                f.write(header)
                await broker.append(header)
                while (sentence := await queue.get()) is not None:
                    async for pcm in self._tts.synthesize(sentence):
                        f.write(pcm)
                        await broker.append(pcm)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("TTS pipeline failed for %s/%s", session_id, turn_id)
        finally:
            await broker.close()
            try:
                patch_wav_sizes(audio_path)
            except OSError:
                pass
            self._registry.release(session_id, turn_id)

    def _audio_path(self, session_id: str, turn_id: str) -> Path:
        return self._settings.audio_dir / session_id / f"{turn_id}.wav"

    def audio_source(self, session_id: str, turn_id: str) -> TurnAudioBroker | Path | None:
        """Live broker while synthesizing, on-disk file afterwards."""
        broker = self._registry.get(session_id, turn_id)
        if broker is not None:
            return broker
        path = self._audio_path(session_id, turn_id)
        return path if path.exists() else None
