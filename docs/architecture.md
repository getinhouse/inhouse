# Architecture

## The spoken turn pipeline

```
POST /api/sessions/{sid}/turns  (multipart audio from MediaRecorder)
  1. audio gate      — PyAV decode, per-frame RMS; rejects silence/room tone
                       in <100 ms instead of paying a multi-second STT pass.
                       Fails open if decoding fails.
  2. STT             — faster-whisper (thread-pooled) or hosted endpoint.
                       Hallucination guard: 1–2 word transcripts with high
                       no_speech_prob are treated as silence ("You" on noise).
  3. LLM stream      — deltas feed a SentenceAssembler (abbreviation- and
                       decimal-aware) which emits completed sentences.
  4. TTS pipeline    — each sentence is synthesized as it completes, while
                       the LLM is still writing. PCM chunks tee to:
                         • TurnAudioBroker (in-memory pub/sub) → live stream
                         • the on-disk WAV (header patched at completion)
  5. response        — POST returns when the reply TEXT is complete; audio
                       may still be synthesizing. The client GETs audio_url
                       and plays chunks as they arrive.
```

Latency consequence: time-to-first-audio ≈ STT + LLM-first-sentence +
TTS-first-sentence — typically several seconds less than waiting for the full
reply on anything longer than one sentence.

## Adapter boundaries

```python
class STTAdapter(Protocol):
    async def transcribe(self, path: Path) -> Transcript: ...

class LLMAdapter(Protocol):
    def stream(self, messages: list[Message]) -> AsyncIterator[str]: ...

class TTSAdapter(Protocol):
    sample_rate: int
    def synthesize(self, text: str) -> AsyncIterator[bytes]: ...  # PCM s16le mono
```

`create_app(settings, stt=..., llm=..., tts=...)` accepts instances directly,
so custom adapters and tests need no registry or plugin machinery.

## Streaming WAV

One WAV per turn: a header with a placeholder length is emitted first (live
players tolerate it), sentence PCM follows, and the on-disk copy's RIFF/data
sizes are patched when synthesis ends. `WavChunkParser` does the inverse for
hosted TTS endpoints that return WAV — strips the container incrementally,
even when the header is split across network chunks.

## Sessions

In-memory store with a JSON snapshot written on every mutation. A restart (or
`kill -9`) loses nothing: history reloads and in-flight states normalize to
`ready`. Conversation history is capped at 24 messages and rolls off; idle
sessions, uploads, and audio are swept on a retention schedule.

## Client

- `vad.ts` — pure, time-injected voice-activity state machine
  (disarmed → idle → maybe-speech → speech → hangover), unit-tested with no
  browser APIs. Recording starts tentatively at *maybe-speech* so onsets are
  not clipped; an arm delay after playback prevents the assistant from
  hearing itself.
- **Barge-in** (opt-in setting, hands-free mode) — while a reply plays, the
  VAD stays armed in a *strict* mode (2.5× RMS threshold, longer confirmation
  window) so echo-cancelled speaker bleed can't self-trigger. Confirmed
  speech stops playback immediately and the already-captured onset flows
  through the normal utterance path; an unconfirmed blip cancels silently and
  playback continues.
- `streamPlayback.ts` — fetch + ReadableStream, WAV header parse, odd-byte
  carry across chunks, gapless scheduling via AudioBufferSourceNodes, with an
  `<audio>` element fallback.

## Security model

Bind loopback or a tailnet address; optional bearer token on every `/api`
route; secrets only in env/.env; recordings and history under `.runtime/`
with automatic retention. Details: ../deploy/HARDENING.md.
