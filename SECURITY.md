# Security Policy

Inhouse is software you run on your own hardware, often with a microphone
attached — we take that seriously.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Use GitHub's private vulnerability reporting: **Security → Report a
vulnerability** on this repository — or email
**hello@getinhouse.org** if you prefer (PGP not yet
available; say so in your report if that blocks you and we'll arrange a
channel). You'll get an acknowledgment within a week; fixes for confirmed
issues in the latest release are prioritized ahead of all other work.

In scope: anything in this repository — the server, the web client, the
deployment configurations we ship, and defaults that make a careful reader
deploy something unsafe.

Out of scope: vulnerabilities in the providers you connect (Ollama, OpenAI,
etc.), in dependencies (report upstream — but tell us too if our usage makes
it exploitable), and deployments that ignore
[deploy/HARDENING.md](deploy/HARDENING.md) (e.g. binding to `0.0.0.0` with no
token).

## Supported versions

| Version | Supported |
| --- | --- |
| latest release / `master` | ✅ |
| anything older | ❌ — upgrade first |

## Design notes for reviewers

- The server binds loopback by default and supports bearer-token auth on
  every `/api` route; recordings and history live in `.runtime/` with
  automatic retention sweeps.
- Secrets are read from environment/`.env` only; they are never logged and
  never returned by any endpoint.
- The systemd unit ships with `NoNewPrivileges`, `PrivateTmp`,
  `ProtectSystem=full`, and a single writable path.

If you think the architecture itself has a flawed assumption, we'd genuinely
like to hear it — that's a discussion, and a public issue is fine for it.
