# Deploying Inhouse without exposing yourself

Inhouse is designed to be **private by default**: the server binds to
`127.0.0.1`, and nothing in the stack phones home. Keep it that way.

## The rules

1. **Never bind to `0.0.0.0` on a machine with a public IP.**
   `INHOUSE_HOST` should be loopback or a private/tailnet interface address.
2. **Always set `INHOUSE_API_TOKEN`** the moment more than one person can
   reach the port. Every `/api` request then requires
   `Authorization: Bearer <token>`; the PWA settings panel has a field for it.
3. **Microphones require HTTPS.** Browsers only allow `getUserMedia` in a
   secure context, so any phone access needs TLS in front of the server.

## Recommended topologies (best first)

### 1. Tailscale-only (zero public exposure)
```bash
tailscale serve --bg --https=8443 http://127.0.0.1:8770
# → https://<your-machine>.<tailnet>.ts.net:8443/
```
Valid TLS certificate, reachable only by devices on your tailnet, no open
ports on the public internet. This is the topology we recommend for personal
assistants — your voice traffic never leaves WireGuard.

### 2. LAN with a reverse proxy
Caddy with an internal CA, or your existing Traefik/nginx, terminating TLS on
the LAN. Keep the firewall closed to WAN.

### 3. Public internet (think twice)
If you truly need it: reverse proxy with real TLS, `INHOUSE_API_TOKEN`
mandatory, rate limiting at the proxy, fail2ban watching the access log, and
ideally client certificates or an authenticating proxy (Authelia, oauth2-proxy)
in front. Remember that STT/TTS are CPU-bound: a public endpoint is a
denial-of-service magnet even with auth.

## systemd sandboxing

`deploy/systemd/inhouse.service.example` ships with `NoNewPrivileges`,
`PrivateTmp`, `ProtectSystem=full`, `ProtectHome=read-only` and a single
writable path (`.runtime`). Keep those lines when you adapt it.

## Data at rest

- Uploads (user utterances) are retained 24 h, synthesized audio 7 days, idle
  sessions 7 days — all configurable (`INHOUSE_*_RETENTION_S`), all swept
  automatically.
- `.runtime/` contains voice recordings and conversation history. Treat it
  like a browser profile: exclude from world-readable backups, `chmod 700`.

## Secrets

API keys live in `server/.env` (mode 600, git-ignored) or your secret
manager. They are never logged and never appear in `/api/health`.
