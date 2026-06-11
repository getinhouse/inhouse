"""Minimal WAV utilities for streaming synthesis.

The server streams one continuous WAV per turn while sentences are still being
synthesized, so the header is written up-front with a placeholder length and
patched in the on-disk copy once the turn completes. Browsers and players
tolerate the oversized declared length on the live stream.
"""

from __future__ import annotations

import struct
from pathlib import Path

HEADER_SIZE = 44
_PLACEHOLDER = 0xFFFFFFF0


def wav_header(sample_rate: int, channels: int = 1, bits: int = 16,
               data_size: int = _PLACEHOLDER) -> bytes:
    byte_rate = sample_rate * channels * bits // 8
    block_align = channels * bits // 8
    riff_size = min(data_size + HEADER_SIZE - 8, 0xFFFFFFFF)
    return struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF", riff_size, b"WAVE",
        b"fmt ", 16, 1, channels, sample_rate, byte_rate, block_align, bits,
        b"data", min(data_size, 0xFFFFFFFF),
    )


def patch_wav_sizes(path: Path) -> None:
    """Fix the RIFF/data chunk sizes of a fully-written streaming WAV file."""
    size = path.stat().st_size
    data_size = max(size - HEADER_SIZE, 0)
    with path.open("r+b") as f:
        f.seek(4)
        f.write(struct.pack("<I", size - 8))
        f.seek(40)
        f.write(struct.pack("<I", data_size))


class WavChunkParser:
    """Strip the container from an incrementally received WAV byte stream.

    Feed arbitrary chunks; once the ``data`` chunk header has been seen, all
    subsequent bytes are emitted as raw PCM. Handles headers split across
    chunk boundaries.
    """

    def __init__(self) -> None:
        self._pre = b""
        self._in_data = False
        self.sample_rate: int | None = None
        self.channels: int | None = None
        self.bits: int | None = None

    def feed(self, chunk: bytes) -> bytes:
        if self._in_data:
            return chunk
        self._pre += chunk
        if len(self._pre) >= 36 and self.sample_rate is None and self._pre[12:16] == b"fmt ":
            _, self.channels, self.sample_rate = struct.unpack("<HHI", self._pre[20:28])
            self.bits = struct.unpack("<H", self._pre[34:36])[0]
        idx = self._pre.find(b"data")
        # 'data' id + 4-byte size must be fully buffered before we can skip them.
        if idx != -1 and len(self._pre) >= idx + 8:
            pcm = self._pre[idx + 8:]
            self._pre = b""
            self._in_data = True
            return pcm
        return b""
