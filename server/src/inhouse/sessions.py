"""Session store with JSON snapshot persistence.

Sessions hold the rolling conversation history sent to the LLM. The store
snapshots to disk on every mutation so a server restart (or crash) loses
nothing; in-flight states normalize back to ``ready`` on load.
"""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path

# Cap the history sent to the LLM; older turns roll off.
MAX_HISTORY_MESSAGES = 24


@dataclass
class Session:
    id: str
    state: str = "ready"  # ready | processing | error
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    turn_count: int = 0
    messages: list[dict[str, str]] = field(default_factory=list)

    def add_exchange(self, user_text: str, assistant_text: str) -> None:
        self.messages.append({"role": "user", "content": user_text})
        self.messages.append({"role": "assistant", "content": assistant_text})
        del self.messages[:-MAX_HISTORY_MESSAGES]

    def next_turn_id(self) -> str:
        self.turn_count += 1
        return f"turn_{self.turn_count:04d}"


class SessionStore:
    def __init__(self, snapshot_path: Path) -> None:
        self._path = snapshot_path
        self._sessions: dict[str, Session] = {}
        self._lock = asyncio.Lock()
        self._load()

    def _load(self) -> None:
        if not self._path.exists():
            return
        try:
            raw = json.loads(self._path.read_text())
        except (OSError, json.JSONDecodeError):
            return
        for item in raw.get("sessions", []):
            session = Session(**item)
            session.state = "ready"  # in-flight work did not survive restart
            self._sessions[session.id] = session

    def _snapshot(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._path.with_suffix(".tmp")
        tmp.write_text(json.dumps(
            {"sessions": [asdict(s) for s in self._sessions.values()]}))
        tmp.replace(self._path)

    async def create(self) -> Session:
        async with self._lock:
            session = Session(id=f"sess_{uuid.uuid4().hex[:12]}")
            self._sessions[session.id] = session
            self._snapshot()
            return session

    def get(self, session_id: str) -> Session | None:
        return self._sessions.get(session_id)

    async def save(self, session: Session) -> None:
        async with self._lock:
            session.updated_at = time.time()
            self._snapshot()

    async def sweep_idle(self, max_idle_s: float) -> int:
        """Drop sessions idle longer than the retention window."""
        async with self._lock:
            cutoff = time.time() - max_idle_s
            stale = [sid for sid, s in self._sessions.items() if s.updated_at < cutoff]
            for sid in stale:
                del self._sessions[sid]
            if stale:
                self._snapshot()
            return len(stale)
