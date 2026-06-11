"""LLM adapters.

``LLMAdapter.stream(messages)`` yields text deltas. ``messages`` is a list of
``{"role": "user"|"assistant", "content": str}`` turns (most recent last); the
adapter injects the configured system prompt itself.

- ``OpenAICompatLLM`` — any OpenAI-compatible /v1/chat/completions endpoint:
  OpenAI, Ollama, vLLM, LM Studio, Groq, OpenRouter, llama.cpp server.
- ``AnthropicLLM`` — native Anthropic Messages API via the official SDK.
"""

from __future__ import annotations

import json
from typing import AsyncIterator, Protocol

import httpx

from ..config import LLMSettings

Message = dict[str, str]


class LLMAdapter(Protocol):
    def stream(self, messages: list[Message]) -> AsyncIterator[str]: ...


class OpenAICompatLLM:
    def __init__(self, cfg: LLMSettings, client: httpx.AsyncClient | None = None) -> None:
        self._cfg = cfg
        self._client = client or httpx.AsyncClient(timeout=cfg.request_timeout_s)

    async def stream(self, messages: list[Message]) -> AsyncIterator[str]:
        cfg = self._cfg
        headers = {"Authorization": f"Bearer {cfg.api_key}"} if cfg.api_key else {}
        body = {
            "model": cfg.model,
            "max_tokens": cfg.max_tokens,
            "stream": True,
            "messages": [{"role": "system", "content": cfg.system_prompt}, *messages],
        }
        async with self._client.stream(
            "POST", f"{cfg.base_url.rstrip('/')}/chat/completions",
            headers=headers, json=body,
        ) as resp:
            if resp.status_code >= 400:
                detail = (await resp.aread()).decode(errors="replace")[:500]
                raise LLMError(f"LLM endpoint returned {resp.status_code}: {detail}")
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if payload == "[DONE]":
                    break
                try:
                    delta = json.loads(payload)["choices"][0]["delta"].get("content")
                except (json.JSONDecodeError, LookupError):
                    continue
                if delta:
                    yield delta


class AnthropicLLM:
    def __init__(self, cfg: LLMSettings) -> None:
        from anthropic import AsyncAnthropic  # lazy optional import
        self._cfg = cfg
        # Resolves ANTHROPIC_API_KEY from the environment unless set explicitly.
        self._client = AsyncAnthropic(api_key=cfg.api_key or None)

    async def stream(self, messages: list[Message]) -> AsyncIterator[str]:
        cfg = self._cfg
        async with self._client.messages.stream(
            model=cfg.model,
            max_tokens=cfg.max_tokens,
            system=cfg.system_prompt,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield text


class LLMError(RuntimeError):
    pass


def build_llm(cfg: LLMSettings) -> LLMAdapter:
    if cfg.provider == "anthropic":
        return AnthropicLLM(cfg)
    return OpenAICompatLLM(cfg)
