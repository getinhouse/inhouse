"""In-memory pub/sub for a turn's audio while it is being synthesized.

The producer (TTS pipeline) appends chunks and closes; any number of
subscribers iterate from the first chunk, receiving new chunks as they arrive.
Replies are short, so retaining the full chunk list in memory is fine; a hard
cap guards against runaway synthesis.
"""

from __future__ import annotations

import asyncio
from typing import AsyncIterator

_MAX_BYTES = 64 * 1024 * 1024


class TurnAudioBroker:
    def __init__(self) -> None:
        self._chunks: list[bytes] = []
        self._size = 0
        self._closed = False
        self._cond = asyncio.Condition()

    @property
    def closed(self) -> bool:
        return self._closed

    async def append(self, chunk: bytes) -> None:
        if not chunk:
            return
        async with self._cond:
            if self._closed:
                raise RuntimeError("broker is closed")
            if self._size + len(chunk) > _MAX_BYTES:
                raise RuntimeError("turn audio exceeds size cap")
            self._chunks.append(chunk)
            self._size += len(chunk)
            self._cond.notify_all()

    async def close(self) -> None:
        async with self._cond:
            self._closed = True
            self._cond.notify_all()

    async def stream(self) -> AsyncIterator[bytes]:
        i = 0
        while True:
            async with self._cond:
                while i >= len(self._chunks) and not self._closed:
                    await self._cond.wait()
                if i < len(self._chunks):
                    chunk = self._chunks[i]
                    i += 1
                else:  # closed and drained
                    return
            yield chunk


class TurnAudioRegistry:
    """Maps (session_id, turn_id) → live broker. Entries are removed once the
    turn is complete and its audio is on disk."""

    def __init__(self) -> None:
        self._live: dict[tuple[str, str], TurnAudioBroker] = {}

    def register(self, session_id: str, turn_id: str) -> TurnAudioBroker:
        broker = TurnAudioBroker()
        self._live[(session_id, turn_id)] = broker
        return broker

    def get(self, session_id: str, turn_id: str) -> TurnAudioBroker | None:
        return self._live.get((session_id, turn_id))

    def release(self, session_id: str, turn_id: str) -> None:
        self._live.pop((session_id, turn_id), None)
