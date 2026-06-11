#!/usr/bin/env bash
# Inhouse first-run setup (macOS / Linux).
#
# Idempotent: safe to re-run after a failure or a git pull. It will
#   1. check prerequisites (Python 3.11+, Node 18+)
#   2. create server/.venv and install the server with local STT/TTS
#   3. install web dependencies and build the PWA
#   4. download the Piper voice (~60 MB, once)
#   5. create server/.env from .env.example (never overwrites)
# Then: scripts/hello.sh
set -euo pipefail
cd "$(dirname "$0")/.."

say()  { printf '\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# --- prerequisites -----------------------------------------------------------
PYTHON=""
for cand in python3.13 python3.12 python3.11 python3; do
  if command -v "$cand" >/dev/null 2>&1; then
    if "$cand" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)' 2>/dev/null; then
      PYTHON=$cand
      break
    fi
  fi
done
[ -n "$PYTHON" ] || fail "Python 3.11+ not found. Install it from python.org or your package manager, then re-run."
say "Python: $($PYTHON --version) ($(command -v "$PYTHON"))"

command -v node >/dev/null 2>&1 || fail "Node.js not found. Install Node 18+ from nodejs.org, then re-run."
NODE_MAJOR=$(node -e 'process.stdout.write(String(process.versions.node.split(".")[0]))')
[ "$NODE_MAJOR" -ge 18 ] || fail "Node.js 18+ required (found $(node --version))."
command -v npm >/dev/null 2>&1 || fail "npm not found (it normally ships with Node.js)."
say "Node: $(node --version)"

# --- python env ----------------------------------------------------------------
if [ ! -x server/.venv/bin/python ]; then
  say "Creating server/.venv"
  "$PYTHON" -m venv server/.venv
fi
PY=server/.venv/bin/python
say "Installing server (faster-whisper, Piper, FastAPI — a few minutes first time)"
"$PY" -m pip install -q --upgrade pip
"$PY" -m pip install -q -e "./server[local,dev]" \
  || fail "Python dependency install failed. The output above has the real error.
       Most common cause: a brand-new Python version that piper-tts or
       faster-whisper has no prebuilt wheel for yet — Python 3.11/3.12 are
       the safe choices."

# --- web -----------------------------------------------------------------------
say "Installing web dependencies"
(cd web && npm install --no-fund --no-audit --loglevel=error)
say "Building the PWA"
(cd web && npm run build >/dev/null)

# --- voice ----------------------------------------------------------------------
if [ ! -f voices/en_US-lessac-medium.onnx ]; then
  say "Downloading the Piper voice (~60 MB, one time)"
  mkdir -p voices
  "$PY" -m piper.download_voices en_US-lessac-medium --data-dir voices
else
  say "Piper voice already present"
fi

# --- config ----------------------------------------------------------------------
if [ ! -f server/.env ]; then
  cp .env.example server/.env
  say "Created server/.env (defaults: local whisper + Piper, LLM = Ollama on :11434)"
else
  say "server/.env already exists — leaving it alone"
fi

say "Setup complete. Hear it talk:  scripts/hello.sh"
