# Hacker News — Show HN

**Title:**

> Show HN: Inhouse – self-hosted voice assistant (local Whisper + Piper, any LLM)

**URL:** https://github.com/getinhouse/inhouse

**First comment (submit immediately after the post):**

Hi HN — I built Inhouse because I wanted to talk to an LLM the way you talk
to an Echo, without an Echo: no cloud voice APIs, no per-minute pricing, and
no audio leaving hardware I own.

It's a starter kit, not a platform: a small FastAPI server plus an
installable PWA. Speech-to-text is faster-whisper, synthesis is Piper, both
local CPU. The LLM is whatever you point it at — Ollama keeps everything
on-machine; any OpenAI-compatible endpoint or Anthropic works if you want a
smarter brain and accept that one network hop.

The part I spent the most time on is latency shaping. The reply is
synthesized sentence-by-sentence while the LLM is still streaming, and the
browser starts playing the WAV while the server is still synthesizing it —
so you hear the first words of an answer that doesn't fully exist yet. A few
other things mattered more than I expected: an RMS gate that rejects silence
before it wastes an STT pass, a guard for whisper's habit of hallucinating
"You" on room tone, and a pure-function VAD state machine for hands-free
mode (with opt-in barge-in — you can interrupt it mid-reply).

What it isn't: a wake-word appliance (browser PWAs can't listen with the
screen off — push-to-talk or hands-free with the tab open), and it's not
trying to replace Home Assistant's voice pipeline if you live in that
ecosystem.

Stack: Python/FastAPI, React/TS, ~60 tests, an e2e script that speaks a
question into the pipeline with Piper and asserts on the audio that comes
back. MIT. Would love feedback on the adapter boundaries — they're three
small protocols, and the goal is that an ElevenLabs or Deepgram adapter is
an afternoon, not a fork.
