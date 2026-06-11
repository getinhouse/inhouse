#!/usr/bin/env bash
# First conversation, no LLM required (macOS / Linux).
#
# Starts the bundled mock LLM and the Inhouse server wired to it, so the
# full real pipeline runs with zero configuration: your mic → local Whisper
# → mock LLM → local Piper → your speakers. Run scripts/setup.sh first.
# Ctrl+C stops everything.
set -euo pipefail
cd "$(dirname "$0")/.."

say()  { printf '\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

PY=server/.venv/bin/python
[ -x "$PY" ] || fail "server/.venv missing — run scripts/setup.sh first."
[ -d web/dist ] || fail "web/dist missing — run scripts/setup.sh first."
[ -f voices/en_US-lessac-medium.onnx ] || fail "Piper voice missing — run scripts/setup.sh first."
[ -f server/.env ] || cp .env.example server/.env

PORT="${INHOUSE_PORT:-8770}"
MOCK_PORT=9001
if "$PY" - "$PORT" <<'EOF'
import socket, sys
s = socket.socket()
in_use = s.connect_ex(("127.0.0.1", int(sys.argv[1]))) == 0
s.close()
sys.exit(0 if in_use else 1)
EOF
then fail "Port $PORT is already in use — is an Inhouse server already running?"; fi

MOCK_PID=""
cleanup() { [ -n "$MOCK_PID" ] && kill "$MOCK_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

port_in_use() {
  "$PY" -c "
import socket, sys
s = socket.socket()
sys.exit(0 if s.connect_ex(('127.0.0.1', int('$1'))) == 0 else 1)" 2>/dev/null
}
# A real fingerprint: only the mock answers a chat completion on this port.
mock_answers() {
  "$PY" -c "
import json, urllib.request as u
req = u.Request('http://127.0.0.1:$MOCK_PORT/v1/chat/completions',
                data=json.dumps({'model': 'mock', 'stream': True,
                                 'messages': [{'role': 'user', 'content': 'ping'}]}).encode(),
                headers={'Content-Type': 'application/json'})
assert u.urlopen(req, timeout=2).status == 200" 2>/dev/null
}

if port_in_use "$MOCK_PORT"; then
  mock_answers || fail "Port $MOCK_PORT is in use by something that isn't the mock LLM — stop it first."
  say "Reusing the mock LLM already running on :$MOCK_PORT"
else
  say "Starting the mock LLM (an offline stand-in so you can hear the pipeline)"
  "$PY" scripts/mock_llm.py --port "$MOCK_PORT" &
  MOCK_PID=$!
  for _ in $(seq 1 20); do
    port_in_use "$MOCK_PORT" && break
    sleep 0.5
  done
  mock_answers || fail "The mock LLM did not start (output above has the real error)."
fi

say "Starting Inhouse (first question downloads the whisper model, ~75 MB — the first reply is slow once)"
echo
printf '\033[1;32m    Open http://127.0.0.1:%s — hold the mic and talk, or type.\033[0m\n' "$PORT"
printf '\033[1;32m    Ctrl+C here stops everything.\033[0m\n'
echo
cd server && INHOUSE_LLM__PROVIDER=openai_compat \
  INHOUSE_LLM__BASE_URL="http://127.0.0.1:$MOCK_PORT/v1" \
  INHOUSE_LLM__MODEL=mock INHOUSE_LLM__API_KEY= \
  .venv/bin/python -m inhouse
