# Lobsters

**Title:**

> Inhouse: a self-hosted voice assistant kit (local Whisper + Piper, any LLM)

**URL:** https://github.com/getinhouse/inhouse

**Tags:** `show`, `ai`, `privacy`, `web`

**Text (show posts allow author text):**

I wanted an Echo-like assistant without the appliance or the cloud: STT
(faster-whisper) and TTS (Piper) run locally on CPU, the LLM is pluggable
(Ollama for fully-local, or any OpenAI-compatible/Anthropic endpoint), and
the client is an installable PWA with hands-free VAD and opt-in barge-in.

The engineering focus was latency: sentence-pipelined synthesis while the
LLM streams, and browser playback that begins while the server is still
synthesizing. The repo includes an end-to-end test that uses Piper to speak
a question *into* the pipeline and asserts on the audio that comes back,
which turned out to be the most useful test I wrote.

MIT, FastAPI + React/TS, ~60 tests. Happy to answer questions about the
streaming-WAV plumbing or the VAD state machine.
