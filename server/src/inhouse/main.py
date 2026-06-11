"""FastAPI application factory.

``create_app`` accepts adapter overrides so tests (and embedders) can inject
fakes without touching provider config.
"""

from __future__ import annotations

import logging
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import __version__
from .adapters import build_llm, build_stt, build_tts
from .adapters.llm import LLMAdapter
from .adapters.stt import STTAdapter
from .adapters.tts import TTSAdapter
from .audio.broker import TurnAudioBroker, TurnAudioRegistry
from .config import Settings
from .sessions import SessionStore
from .turns import TurnError, TurnPipeline

log = logging.getLogger("inhouse")


class TextTurnRequest(BaseModel):
    text: str


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status,
                        content={"error": {"code": code, "message": message}})


def create_app(settings: Settings | None = None, *,
               stt: STTAdapter | None = None,
               llm: LLMAdapter | None = None,
               tts: TTSAdapter | None = None) -> FastAPI:
    settings = settings or Settings()
    settings.runtime_dir.mkdir(parents=True, exist_ok=True)

    store = SessionStore(settings.sessions_file)
    registry = TurnAudioRegistry()
    pipeline = TurnPipeline(
        settings, store,
        stt=stt or build_stt(settings.stt),
        llm=llm or build_llm(settings.llm),
        tts=tts or build_tts(settings.tts),
        registry=registry,
    )

    app = FastAPI(title="Inhouse", version=__version__, docs_url=None, redoc_url=None)

    if settings.cors_origins:
        app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                           allow_methods=["*"], allow_headers=["*"])

    @app.middleware("http")
    async def auth_middleware(request: Request, call_next):
        if settings.api_token and request.url.path.startswith("/api"):
            header = request.headers.get("authorization", "")
            if header != f"Bearer {settings.api_token}":
                return _error(401, "unauthorized", "Missing or invalid bearer token.")
        return await call_next(request)

    @app.exception_handler(TurnError)
    async def turn_error_handler(_request: Request, exc: TurnError):
        return _error(exc.status, exc.code, exc.message)

    @app.get("/api/health")
    async def health():
        return {
            "status": "ok",
            "version": __version__,
            "providers": {
                "stt": settings.stt.provider,
                "llm": settings.llm.provider,
                "tts": settings.tts.provider,
            },
        }

    @app.post("/api/sessions", status_code=201)
    async def create_session():
        # Opportunistic retention sweep — cheap, and avoids a separate scheduler.
        await store.sweep_idle(settings.session_idle_retention_s)
        _sweep_files(settings.uploads_dir, settings.upload_retention_s)
        _sweep_files(settings.audio_dir, settings.audio_retention_s)
        session = await store.create()
        return {"session_id": session.id, "state": session.state}

    @app.post("/api/sessions/{session_id}/turns")
    async def audio_turn(session_id: str, audio: UploadFile):
        session = store.get(session_id)
        if session is None:
            return _error(404, "session_not_found", "Unknown session.")
        upload_dir = settings.uploads_dir / session_id
        upload_dir.mkdir(parents=True, exist_ok=True)
        suffix = Path(audio.filename or "audio.webm").suffix or ".webm"
        upload_path = upload_dir / f"{int(time.time())}_{uuid.uuid4().hex[:6]}{suffix}"
        size = 0
        with upload_path.open("wb") as f:
            while chunk := await audio.read(1 << 20):
                size += len(chunk)
                if size > settings.upload_max_bytes:
                    upload_path.unlink(missing_ok=True)
                    return _error(413, "too_large", "Audio upload exceeds size limit.")
                f.write(chunk)
        if size == 0:
            upload_path.unlink(missing_ok=True)
            return _error(422, "empty_upload", "Audio upload was empty.")
        result = await pipeline.run_audio_turn(session, upload_path)
        return result.__dict__

    @app.post("/api/sessions/{session_id}/turns/text")
    async def text_turn(session_id: str, body: TextTurnRequest):
        session = store.get(session_id)
        if session is None:
            return _error(404, "session_not_found", "Unknown session.")
        result = await pipeline.run_text_turn(session, body.text)
        return result.__dict__

    @app.get("/api/sessions/{session_id}/turns/{turn_id}/audio")
    async def turn_audio(session_id: str, turn_id: str):
        source = pipeline.audio_source(session_id, turn_id)
        if source is None:
            return _error(404, "audio_not_found", "No audio for this turn.")
        if isinstance(source, TurnAudioBroker):
            return StreamingResponse(source.stream(), media_type="audio/wav")
        return FileResponse(source, media_type="audio/wav")

    # Serve the built PWA when present (single-process deployments).
    web_dist = Path(__file__).resolve().parents[3] / "web" / "dist"
    if web_dist.is_dir():
        app.mount("/", StaticFiles(directory=web_dist, html=True), name="web")

    return app


def _sweep_files(root: Path, max_age_s: float) -> None:
    if not root.is_dir():
        return
    cutoff = time.time() - max_age_s
    for path in root.rglob("*"):
        try:
            if path.is_file() and path.stat().st_mtime < cutoff:
                path.unlink(missing_ok=True)
        except OSError:
            continue


def run() -> None:
    """Console entry point: ``python -m inhouse`` or ``inhouse-server``."""
    import uvicorn
    logging.basicConfig(level=logging.INFO)
    settings = Settings()
    uvicorn.run(create_app(settings), host=settings.host, port=settings.port)
