# Contributing to Inhouse

Thanks for considering it. This project values small, well-tested changes
over large ambitious ones.

## Getting set up

```bash
make setup    # python venv + npm install
make voice    # download a piper voice for local runs
make test     # 33 backend + 27 frontend tests
make lint     # ruff + tsc --noEmit
```

`python scripts/mock_llm.py` gives you a zero-key LLM for development, and
`scripts/e2e_check.sh` runs the whole pipeline with real STT/TTS.

## What makes a PR easy to merge

- **Tests with the change.** The VAD state machine, sentence assembler, WAV
  plumbing, and adapters are all pure or mockable on purpose — if your change
  is hard to test, that's worth discussing first.
- **Adapters are the favorite contribution.** A new STT/LLM/TTS adapter is
  one file implementing a three-method protocol plus a test with a mocked
  endpoint — see `server/src/inhouse/adapters/` and `docs/providers.md`.
- **Match the surroundings.** Comment density, naming, and structure should
  look like the file you're editing. Run `make lint` before pushing.
- **One thing per PR.** A bugfix and a refactor are two PRs.

## What to discuss before building

Open a Discussion (or issue) first for: new endpoints or protocol changes,
anything touching the security model (auth, binding, retention), UI redesigns,
and new runtime dependencies — the dependency budget is deliberately tight.

## Non-goals

Wake-word daemons, screen-off background listening (PWAs can't), bundling
an LLM, and anything that phones home. Don't be offended if these close —
it's scope, not quality.

## Conduct

Be the kind of person you'd want answering your own issue. Maintainer time
is batched — expect responses in days, not hours.
