# Provider cookbook

All settings go in `server/.env` (see `.env.example`) or environment
variables. Mix and match freely — local STT with a hosted LLM is a popular
combination.

## LLM

### Ollama (fully local — recommended starting point)
```ini
INHOUSE_LLM__PROVIDER=openai_compat
INHOUSE_LLM__BASE_URL=http://127.0.0.1:11434/v1
INHOUSE_LLM__MODEL=llama3.2
```
Latency tip: small models (1–3B) answer fast enough for conversation on
modest CPUs; on a 2-vCPU VPS expect noticeable thinking time with anything
bigger. A GPU box or a hosted provider transforms the experience.

### OpenAI / Groq / OpenRouter / vLLM / LM Studio
```ini
INHOUSE_LLM__PROVIDER=openai_compat
INHOUSE_LLM__BASE_URL=https://api.groq.com/openai/v1   # or any compatible
INHOUSE_LLM__API_KEY=...
INHOUSE_LLM__MODEL=llama-3.3-70b-versatile
```
Groq deserves special mention for voice: extremely fast first token.

### Anthropic (native)
```bash
pip install 'inhouse-server[anthropic]'
```
```ini
INHOUSE_LLM__PROVIDER=anthropic
INHOUSE_LLM__MODEL=claude-opus-4-8
ANTHROPIC_API_KEY=sk-ant-...
```
Uses the official SDK with streaming. `claude-opus-4-8` gives the best
answers; `claude-haiku-4-5` trades some depth for snappier first tokens if
latency matters more to you.

### Voice-shaped prompting
The default `INHOUSE_LLM__SYSTEM_PROMPT` tells the model it is speaking
aloud: short replies, no markdown, no lists. If you override it, keep those
constraints — TTS reading a bullet list is misery.

## STT

### faster-whisper (local, default)
```ini
INHOUSE_STT__PROVIDER=faster_whisper
INHOUSE_STT__MODEL=base        # tiny | base | small | medium | large-v3
```
On CPU: `tiny` ≈ instant but sloppier, `base` is the sweet spot for
short utterances (~2–3 s on 2 vCPU), `small` if you have cores to spare.
First request loads the model (one-time delay).

### Hosted whisper (OpenAI or compatible)
```ini
INHOUSE_STT__PROVIDER=openai_compat
INHOUSE_STT__BASE_URL=https://api.openai.com/v1
INHOUSE_STT__API_KEY=sk-...
INHOUSE_STT__API_MODEL=whisper-1
```

## TTS

### Piper (local, default)
```ini
INHOUSE_TTS__PROVIDER=piper
INHOUSE_TTS__VOICE_PATH=../voices/en_US-lessac-medium.onnx
INHOUSE_TTS__SAMPLE_RATE=22050   # must match the voice's config json
```
Browse voices: https://rhasspy.github.io/piper-samples/ — download with
`python -m piper.download_voices <name> --data-dir voices`. Medium voices
synthesize ~5–10× realtime on CPU.

### Hosted TTS (/v1/audio/speech)
```ini
INHOUSE_TTS__PROVIDER=openai_compat
INHOUSE_TTS__BASE_URL=https://api.openai.com/v1
INHOUSE_TTS__API_KEY=sk-...
INHOUSE_TTS__API_MODEL=tts-1
INHOUSE_TTS__API_VOICE=alloy
INHOUSE_TTS__SAMPLE_RATE=24000   # OpenAI WAV output is 24 kHz
```
The server validates the endpoint's actual sample rate against this setting
and fails loudly on mismatch rather than playing chipmunk audio.

## Writing your own adapter

Implement one of the three protocols in `inhouse/adapters/` and pass an
instance to `create_app(...)`, or add a branch to the relevant `build_*`
factory. The protocols are deliberately tiny — an ElevenLabs TTS adapter or a
Deepgram STT adapter is an afternoon project. PRs welcome.
