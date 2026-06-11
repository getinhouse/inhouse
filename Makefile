PY := server/.venv/bin/python

.PHONY: setup test lint e2e dev build voice

setup:
	cd server && python3 -m venv .venv && .venv/bin/pip install -e ".[local,dev]"
	cd web && npm install

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
