"""Assemble streamed LLM text deltas into sentences for pipelined TTS.

The assembler is deliberately conservative: it only emits on clear sentence
boundaries (or when flushed at end of stream) so the TTS never speaks half a
clause. Abbreviation handling is heuristic — a wrongly split "Dr." costs a
short pause, not correctness.
"""

from __future__ import annotations

import re

_BOUNDARY = re.compile(r"([.!?]+[\"')\]]*)(\s+|$)")
_ABBREVIATIONS = {
    "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc", "e.g", "i.e",
}
_MIN_EMIT_CHARS = 2


class SentenceAssembler:
    def __init__(self) -> None:
        self._buffer = ""

    def feed(self, delta: str) -> list[str]:
        """Add a text delta; return zero or more completed sentences."""
        self._buffer += delta
        out: list[str] = []
        while True:
            match = self._find_boundary()
            if match is None:
                break
            end = match.end(1)
            sentence = self._buffer[:end].strip()
            self._buffer = self._buffer[end:].lstrip()
            if len(sentence) >= _MIN_EMIT_CHARS:
                out.append(sentence)
        return out

    def flush(self) -> list[str]:
        """Return whatever remains (end of stream)."""
        rest = self._buffer.strip()
        self._buffer = ""
        return [rest] if rest else []

    def _find_boundary(self) -> re.Match[str] | None:
        for match in _BOUNDARY.finditer(self._buffer):
            # A boundary at the very end of the buffer might still grow
            # (e.g. "..." continuing); wait for trailing whitespace unless
            # the stream flushes later.
            if match.end() == len(self._buffer) and not match.group(2):
                return None
            word = self._buffer[: match.start(1)].rsplit(None, 1)
            last = word[-1].lower().rstrip(".") if word else ""
            if last in _ABBREVIATIONS:
                continue
            # Skip decimal points like "3.14" (digit on both sides).
            start = match.start(1)
            if (
                match.group(1) == "."
                and start > 0
                and self._buffer[start - 1].isdigit()
                and start + 1 < len(self._buffer)
                and self._buffer[start + 1].isdigit()
            ):
                continue
            return match
        return None
