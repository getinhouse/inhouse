# r/LocalLLaMA

**Title:**

> Built a fully-local voice loop for your models: Whisper → your LLM → Piper, streaming end to end (MIT)

**Body:**

Inhouse is a voice front-end for whatever model you're already running.
Point it at Ollama / vLLM / LM Studio / llama.cpp server (anything
OpenAI-compatible) and you get a phone-installable PWA you can talk to, with
STT and TTS running locally on CPU.

The interesting engineering is in the seams:

- LLM deltas feed a sentence assembler (abbreviation/decimal aware), each
  completed sentence goes to Piper immediately, and the PCM streams to the
  browser through one continuous WAV — so time-to-first-audio is roughly
  STT + first-sentence latency, not the full generation time.
- Pre-STT RMS gate so silence/accidental taps never hit whisper, plus a
  hallucination guard for the classic "You"-on-noise transcript.
- Hands-free VAD is a pure state machine (actually unit-testable), with
  opt-in barge-in: during playback it keeps listening at a raised threshold
  with echo cancellation, so you can interrupt without it triggering on its
  own voice.
- Adapters are three tiny protocols (STT/LLM/TTS). The Anthropic adapter is
  ~40 lines if you want to see the shape; local-first is the default config.

System prompt ships voice-shaped (short replies, no markdown) — worth
keeping if you override it; TTS reading a bullet list is exactly as bad as
you imagine.

Runs on a 2 vCPU VPS with whisper-base + a small model; obviously better
with your GPU box. MIT: https://github.com/getinhouse/inhouse

What I'd love from this crowd: which local TTS/STT do you actually want
adapters for next?
