import httpx
import pytest

from inhouse.adapters.tts import OpenAICompatTTS, TTSError
from inhouse.audio.wav import wav_header
from inhouse.config import TTSSettings


def make_adapter(handler, sample_rate=24000):
    cfg = TTSSettings(provider="openai_compat", base_url="http://tts.test/v1",
                      api_key="k", sample_rate=sample_rate)
    transport = httpx.MockTransport(handler)
    return OpenAICompatTTS(cfg, client=httpx.AsyncClient(transport=transport))


async def test_strips_wav_container():
    pcm = b"\x10\x20" * 256

    def handler(request):
        return httpx.Response(200, content=wav_header(24000) + pcm)

    adapter = make_adapter(handler)
    out = b"".join([c async for c in adapter.synthesize("hello")])
    assert out == pcm


async def test_sample_rate_mismatch_raises():
    def handler(request):
        return httpx.Response(200, content=wav_header(44100) + b"\x00\x00")

    adapter = make_adapter(handler, sample_rate=24000)
    with pytest.raises(TTSError, match="44100"):
        async for _ in adapter.synthesize("hello"):
            pass


async def test_http_error_raises():
    def handler(request):
        return httpx.Response(401, text="bad key")

    adapter = make_adapter(handler)
    with pytest.raises(TTSError, match="401"):
        async for _ in adapter.synthesize("hello"):
            pass
