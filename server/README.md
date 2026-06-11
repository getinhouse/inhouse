# Inhouse Server

FastAPI voice assistant server: pluggable STT / LLM / TTS adapters with
sentence-pipelined streaming turn audio. See the repository root README for
the full project documentation.

```bash
python -m venv .venv && .venv/bin/pip install -e ".[local,dev]"
cp ../.env.example .env   # configure providers
.venv/bin/python -m inhouse
```
