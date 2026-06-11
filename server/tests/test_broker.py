import asyncio

import pytest

from inhouse.audio.broker import TurnAudioBroker, TurnAudioRegistry


async def test_subscriber_receives_all_chunks_from_start():
    b = TurnAudioBroker()
    await b.append(b"one")

    async def producer():
        await asyncio.sleep(0.01)
        await b.append(b"two")
        await b.close()

    task = asyncio.create_task(producer())
    chunks = [c async for c in b.stream()]
    await task
    assert chunks == [b"one", b"two"]


async def test_multiple_subscribers():
    b = TurnAudioBroker()
    await b.append(b"x")
    await b.close()
    assert [c async for c in b.stream()] == [b"x"]
    assert [c async for c in b.stream()] == [b"x"]


async def test_append_after_close_raises():
    b = TurnAudioBroker()
    await b.close()
    with pytest.raises(RuntimeError):
        await b.append(b"late")


async def test_registry_lifecycle():
    r = TurnAudioRegistry()
    b = r.register("s", "t1")
    assert r.get("s", "t1") is b
    r.release("s", "t1")
    assert r.get("s", "t1") is None
