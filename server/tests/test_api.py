import struct

from fastapi.testclient import TestClient

from inhouse.audio.wav import HEADER_SIZE
from inhouse.config import Settings
from inhouse.main import create_app


def _make_session(client):
    resp = client.post("/api/sessions")
    assert resp.status_code == 201
    return resp.json()["session_id"]


def test_health(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert set(body["providers"]) == {"stt", "llm", "tts"}


def test_full_audio_turn_flow(client, fakes):
    sid = _make_session(client)
    resp = client.post(f"/api/sessions/{sid}/turns",
                       files={"audio": ("clip.webm", b"\x00" * 2000, "audio/webm")})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["transcript"] == "hello there"
    assert body["reply_text"] == fakes["llm"].reply
    assert body["timings"]["stt_ms"] is not None

    # The reply audio is a stitched streaming WAV: one header + PCM.
    audio = client.get(body["audio_url"])
    assert audio.status_code == 200
    data = audio.content
    assert data[:4] == b"RIFF"
    assert struct.unpack("<I", data[24:28])[0] == fakes["tts"].sample_rate
    assert len(data) > HEADER_SIZE
    # One TTS call per sentence of the reply.
    assert len(fakes["tts"].sentences) >= 2

    # Second fetch is served from disk with patched sizes.
    audio2 = client.get(body["audio_url"])
    assert audio2.content[:4] == b"RIFF"
    assert struct.unpack("<I", audio2.content[40:44])[0] == len(audio2.content) - HEADER_SIZE


def test_text_turn_and_history(client, fakes):
    sid = _make_session(client)
    r1 = client.post(f"/api/sessions/{sid}/turns/text", json={"text": "first question"})
    assert r1.status_code == 200
    r2 = client.post(f"/api/sessions/{sid}/turns/text", json={"text": "second question"})
    assert r2.status_code == 200
    # The second LLM call must include the first exchange as history.
    roles = [m["role"] for m in fakes["llm"].received_messages]
    assert roles == ["user", "assistant", "user"]
    assert fakes["llm"].received_messages[0]["content"] == "first question"


def test_unknown_session_404(client):
    resp = client.post("/api/sessions/sess_nope/turns/text", json={"text": "hi"})
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "session_not_found"


def test_empty_text_rejected(client):
    sid = _make_session(client)
    resp = client.post(f"/api/sessions/{sid}/turns/text", json={"text": "   "})
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "empty_text"


def test_empty_upload_rejected(client):
    sid = _make_session(client)
    resp = client.post(f"/api/sessions/{sid}/turns",
                       files={"audio": ("a.webm", b"", "audio/webm")})
    assert resp.status_code == 422


def test_auth_token_enforced(tmp_path, fakes):
    settings = Settings(runtime_dir=tmp_path / "rt", api_token="secret",
                        gate={"enabled": False})
    app = create_app(settings, **fakes)
    with TestClient(app) as client:
        assert client.get("/api/health").status_code == 401
        ok = client.get("/api/health", headers={"Authorization": "Bearer secret"})
        assert ok.status_code == 200


def test_audio_not_found(client):
    sid = _make_session(client)
    resp = client.get(f"/api/sessions/{sid}/turns/turn_0099/audio")
    assert resp.status_code == 404
