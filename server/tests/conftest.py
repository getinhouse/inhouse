import asyncio
import struct
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from inhouse.config import Settings
from inhouse.main import create_app


class FakeSTT:
    def __init__(self, text="hello there"):
        self.text = text

    async def transcribe(self, path: Path):
        from inhouse.adapters.stt import Transcript
        return Transcript(text=self.text, language="en", duration_s=1.0,
                          no_speech_prob=0.05)


class FakeLLM:
    """Streams a fixed reply in small deltas."""

    def __init__(self, reply="Hi! How can I help you today? Ask me anything."):
        self.reply = reply
        self.received_messages = None

    async def stream(self, messages):
        self.received_messages = messages
        for i in range(0, len(self.reply), 5):
            yield self.reply[i:i + 5]
            await asyncio.sleep(0)


class FakeTTS:
    sample_rate = 16000

    def __init__(self):
        self.sentences = []

    async def synthesize(self, text):
        self.sentences.append(text)
        # 100 ms of a quiet ramp per sentence
        samples = b"".join(struct.pack("<h", (i % 64) * 8) for i in range(1600))
        yield samples[:1600]
        await asyncio.sleep(0)
        yield samples[1600:]


@pytest.fixture
def settings(tmp_path):
    return Settings(runtime_dir=tmp_path / "runtime", gate={"enabled": False})


@pytest.fixture
def fakes():
    return {"stt": FakeSTT(), "llm": FakeLLM(), "tts": FakeTTS()}


@pytest.fixture
def client(settings, fakes):
    app = create_app(settings, **fakes)
    with TestClient(app) as c:
        yield c
