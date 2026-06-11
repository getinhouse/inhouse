#!/usr/bin/env bash
# End-to-end smoke test of the full voice loop with REAL local providers:
#   piper TTS synthesizes a spoken question -> uploaded as user audio ->
#   faster-whisper transcribes it -> mock LLM streams a reply ->
#   piper synthesizes the reply -> streamed WAV fetched and validated.
# Requires: server installed with [local] extras, a piper voice, ffmpeg.
set -euo pipefail
cd "$(dirname "$0")/.."

VOICE=${VOICE:-voices/en_US-lessac-medium.onnx}
PY=server/.venv/bin/python
PORT=8771
LLM_PORT=9001
TMP=$(mktemp -d)
trap 'kill $(jobs -p) 2>/dev/null || true; rm -rf "$TMP"' EXIT

echo "[1/5] starting mock LLM + inhouse server"
$PY scripts/mock_llm.py --port $LLM_PORT &
( cd server && INHOUSE_PORT=$PORT \
  INHOUSE_RUNTIME_DIR="$TMP/runtime" \
  INHOUSE_LLM__BASE_URL=http://127.0.0.1:$LLM_PORT/v1 \
  INHOUSE_LLM__MODEL=mock \
  INHOUSE_TTS__VOICE_PATH="$(cd .. && pwd)/$VOICE" \
  INHOUSE_STT__MODEL=base \
  .venv/bin/python -m inhouse ) &

for i in $(seq 1 60); do
  curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break
  sleep 0.5
done
curl -fsS "http://127.0.0.1:$PORT/api/health"; echo

echo "[2/5] synthesizing a spoken question with piper"
echo "What can you actually do for me?" | $PY -m piper -m "$VOICE" -f "$TMP/question.wav"
ls -la "$TMP/question.wav"

echo "[3/5] creating session"
SID=$(curl -fsS -X POST "http://127.0.0.1:$PORT/api/sessions" | $PY -c 'import sys,json;print(json.load(sys.stdin)["session_id"])')
echo "session: $SID"

echo "[4/5] posting spoken turn (whisper STT -> LLM -> piper TTS)"
START=$(date +%s%3N)
RESP=$(curl -fsS -X POST "http://127.0.0.1:$PORT/api/sessions/$SID/turns" \
  -F "audio=@$TMP/question.wav;type=audio/wav")
END=$(date +%s%3N)
echo "$RESP" | $PY -m json.tool
echo "turn wall time: $((END-START)) ms"

AUDIO_URL=$(echo "$RESP" | $PY -c 'import sys,json;print(json.load(sys.stdin)["audio_url"])')

echo "[5/5] fetching streamed reply audio"
curl -fsS "http://127.0.0.1:$PORT$AUDIO_URL" -o "$TMP/reply.wav"
$PY - "$TMP/reply.wav" <<'EOF'
import os, struct, sys
data = open(sys.argv[1], "rb").read()
assert data[:4] == b"RIFF" and data[8:12] == b"WAVE", "not a WAV"
rate = struct.unpack("<I", data[24:28])[0]
# Live streams carry a placeholder header length; measure actual PCM bytes.
secs = (len(data) - 44) / (rate * 2)
print(f"reply audio: {secs:.1f}s of PCM @ {rate} Hz")
assert secs > 3.0, "reply audio suspiciously short"
print("E2E OK")
EOF
