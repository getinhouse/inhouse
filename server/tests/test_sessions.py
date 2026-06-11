import time

from inhouse.sessions import MAX_HISTORY_MESSAGES, Session, SessionStore


async def test_create_and_snapshot_roundtrip(tmp_path):
    path = tmp_path / "sessions.json"
    store = SessionStore(path)
    s = await store.create()
    s.add_exchange("hi", "hello")
    s.state = "processing"
    await store.save(s)

    restored = SessionStore(path).get(s.id)
    assert restored is not None
    assert restored.messages == s.messages
    assert restored.state == "ready"  # in-flight state normalizes


def test_history_cap():
    s = Session(id="x")
    for i in range(40):
        s.add_exchange(f"u{i}", f"a{i}")
    assert len(s.messages) == MAX_HISTORY_MESSAGES
    assert s.messages[-1]["content"] == "a39"


async def test_sweep_idle(tmp_path):
    store = SessionStore(tmp_path / "s.json")
    s = await store.create()
    s.updated_at = time.time() - 1000
    removed = await store.sweep_idle(max_idle_s=10)
    assert removed == 1
    assert store.get(s.id) is None


def test_turn_ids_increment():
    s = Session(id="x")
    assert s.next_turn_id() == "turn_0001"
    assert s.next_turn_id() == "turn_0002"
