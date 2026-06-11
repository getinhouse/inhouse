import json

import httpx
import pytest

from inhouse.adapters.llm import LLMError, OpenAICompatLLM
from inhouse.config import LLMSettings


def sse(deltas):
    lines = []
    for d in deltas:
        payload = {"choices": [{"delta": {"content": d}}]}
        lines.append(f"data: {json.dumps(payload)}\n\n")
    lines.append("data: [DONE]\n\n")
    return "".join(lines)


def make_adapter(handler):
    cfg = LLMSettings(base_url="http://llm.test/v1", api_key="k", model="m")
    transport = httpx.MockTransport(handler)
    return OpenAICompatLLM(cfg, client=httpx.AsyncClient(transport=transport)), cfg


async def test_streams_deltas_and_sends_system_prompt():
    captured = {}

    def handler(request):
        captured["body"] = json.loads(request.content)
        captured["auth"] = request.headers.get("authorization")
        return httpx.Response(200, text=sse(["Hel", "lo!"]))

    adapter, cfg = make_adapter(handler)
    out = [d async for d in adapter.stream([{"role": "user", "content": "hi"}])]
    assert "".join(out) == "Hello!"
    assert captured["auth"] == "Bearer k"
    body = captured["body"]
    assert body["stream"] is True
    assert body["messages"][0] == {"role": "system", "content": cfg.system_prompt}
    assert body["messages"][1] == {"role": "user", "content": "hi"}


async def test_http_error_raises_llm_error():
    def handler(request):
        return httpx.Response(500, text="boom")

    adapter, _ = make_adapter(handler)
    with pytest.raises(LLMError, match="500"):
        async for _ in adapter.stream([{"role": "user", "content": "hi"}]):
            pass


async def test_malformed_sse_lines_skipped():
    def handler(request):
        return httpx.Response(
            200, text="data: not-json\n\n" + sse(["ok"]) )

    adapter, _ = make_adapter(handler)
    out = [d async for d in adapter.stream([{"role": "user", "content": "hi"}])]
    assert out == ["ok"]
