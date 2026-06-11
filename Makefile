PY := server/.venv/bin/python

.PHONY: setup hello test lint e2e dev build voice demo

# First-run setup and first conversation — thin wrappers around the
# canonical cross-platform scripts (Windows: scripts/setup.ps1 + hello.ps1).
setup:
	scripts/setup.sh

hello:
	scripts/hello.sh

voice:
	mkdir -p voices
	$(PY) -m piper.download_voices en_US-lessac-medium --data-dir voices

test:
	cd server && .venv/bin/python -m pytest -q
	cd web && npm run test

lint:
	cd server && .venv/bin/ruff check src tests
	cd web && npx tsc --noEmit

e2e:
	scripts/e2e_check.sh

dev:
	cd server && .venv/bin/python -m inhouse &
	cd web && npm run dev

build:
	cd web && npm run build

# Rebuild the public interface demo (committed static output in site/demo,
# served by Cloudflare Pages at getinhouse.org/demo).
demo:
	cd web && npm run build:demo

# Re-render the demo's spoken replies with the real Piper voice after
# editing web/src/demo/voice-lines.json (then run `make demo`).
demo-voice:
	$(PY) scripts/gen_demo_voice.py
