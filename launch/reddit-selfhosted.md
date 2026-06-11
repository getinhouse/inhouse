# r/selfhosted

**Title:**

> Inhouse: a self-hosted voice assistant kit — local Whisper STT + Piper TTS, talks to any LLM (Ollama included), phone PWA

**Body:**

I've been running my own voice assistant on a small VPS for a while and
finally cleaned the bones of it into something shareable. Inhouse is an MIT
starter kit: FastAPI server + installable web app, speech recognition and
synthesis fully local, LLM pluggable.

Why you might care, selfhosted edition:

- **Binds loopback by default**, bearer-token auth, and the docs assume
  you'll front it with Tailscale (`tailscale serve` one-liner included)
  rather than open a port. The hardening guide is a first-class doc, not an
  afterthought.
- **`docker compose up`** gets you the fully-local stack with Ollama
  bundled. systemd units with sandboxing if compose isn't your thing.
- Recordings and conversation history live in one directory with automatic
  retention sweeps (24 h uploads / 7 d audio by default).
- 2 vCPU is genuinely enough: whisper-base transcribes a short utterance in
  ~2–3 s and Piper synthesizes ~5–10× realtime, both CPU-only.

The latency trick that makes it feel alive: TTS starts on the first sentence
while the LLM is still writing, and playback starts while TTS is still
running. Hands-free mode supports opt-in barge-in, so you can talk over it
when it rambles.

Honest limitations: no wake word in the PWA itself (push-to-talk or hands-free
with the screen on), English voices are Piper's strong suit, and a 2-vCPU
box wants a smallish local model or a hosted endpoint for the LLM itself.

Repo: https://github.com/getinhouse/inhouse — feedback and adapter PRs very
welcome.
