# Inhouse Pro

Everything in this repository is MIT and complete — Inhouse Pro is not a
license unlock. It is the **production layer**: the documentation and
operator tooling that take you from "works on my machine" to "my family uses
this daily and I never think about it," plus a way to fund the roadmap.

## What you get — $59, one time, all future updates

**The Production Deployment Pack** (private repo, granted via GitHub):

- **VPS + systemd + Tailscale playbook** — the recommended topology, from a
  blank Ubuntu box to the PWA installed on your phone over WireGuard, with
  sandboxed systemd supervision, token auth, update procedure, and realistic
  resource sizing for small instances.
- **Docker + Caddy + public domain playbook** — for when you need real-domain
  HTTPS: compose stack with bundled Ollama, automatic certificates, rate
  limiting, firewalling, backups, and an honest discussion of public-exposure
  tradeoffs.
- **Home server + LAN playbook** — mini-PC / Pi-5-class deployments, the
  HTTPS-for-microphone problem solved with an internal CA, and the
  GPU-in-the-gaming-PC pattern for fast local LLMs.
- **The troubleshooting matrix** — symptom → cause → fix for every failure
  mode we know about, from "mic button does nothing" to sample-rate
  chipmunk audio.
- **Wake-word satellite (openWakeWord)** — "Hey Jarvis" hands-free from
  across the room: a small always-listening client (script + playbook +
  systemd unit) that detects the wake word fully locally on any box with a
  microphone and drives the normal turn API. The server stays untouched and
  nothing leaves the satellite before the wake word.
- **Twilio phone bridge** — call or text your assistant from any phone:
  inbound SMS and voice webhooks routed through the normal turn API, with
  replies as text, Twilio's voice, or your own local TTS voice. Signature
  validation, a default-deny caller allowlist, per-caller conversation
  memory, and a staged playbook from local curl test to production.
- **Multi-user auth gateway** — household/team use without enterprise
  ceremony: per-user tokens (no passwords), per-user conversation
  ownership the API enforces against everyone including the admin roles,
  one-command invite/rotate/revoke, and a threat-model playbook. The core
  server stays untouched behind it.

**Priority issues** — your bug reports and questions get looked at first.

**All future Pro updates included** — whatever ships next lands in the
same private repo at no extra charge. Recently shipped to the open core,
funded by this model: barge-in (interrupt the assistant mid-reply in
hands-free mode).

## How to buy

**[Buy Inhouse Pro on Polar →](https://buy.polar.sh/polar_cl_6jjSshnPGiKpVBok0fIPy6MCf7P5cSiRMLzhi2N6n8K)**

Checkout is handled by [Polar](https://polar.sh) as merchant of record (they
deal with VAT/sales tax and invoices). Access to the private Pro repository
is granted to your GitHub account automatically after purchase.

## Questions

Open a [Discussion](../../discussions) or see the
[SECURITY.md](SECURITY.md) contact for anything sensitive. If Pro doesn't
fit your deployment, the answer might still make it into the public docs —
ask anyway.
