"""Settings for the Inhouse server.

Everything is configurable via environment variables with the INHOUSE_ prefix,
nested fields use ``__`` as the delimiter (e.g. INHOUSE_LLM__MODEL=llama3.2).
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class STTSettings(BaseModel):
    provider: Literal["faster_whisper", "openai_compat"] = "faster_whisper"
    # faster_whisper
    model: str = "base"
    device: str = "cpu"
    compute_type: str = "int8"
    language: str | None = None
    # openai_compat (e.g. a hosted whisper endpoint)
    base_url: str = "https://api.openai.com/v1"
    api_key: str = ""
    api_model: str = "whisper-1"


class LLMSettings(BaseModel):
    provider: Literal["openai_compat", "anthropic"] = "openai_compat"
    # openai_compat works with OpenAI, Ollama, vLLM, LM Studio, Groq, OpenRouter...
    base_url: str = "http://127.0.0.1:11434/v1"
    api_key: str = ""
    model: str = "llama3.2"
    max_tokens: int = 1024
    system_prompt: str = (
        "You are a helpful voice assistant. You are talking with the user over "
        "audio: keep replies short and conversational, never use markdown, "
        "lists, or code blocks. Spell out anything that is awkward to hear."
    )
    request_timeout_s: float = 120.0


class TTSSettings(BaseModel):
    provider: Literal["piper", "openai_compat"] = "piper"
    # piper
    piper_bin: str = "piper"
    voice_path: str = ""  # path to a .onnx piper voice
    sample_rate: int = 22050
    # openai_compat (/v1/audio/speech)
    base_url: str = "https://api.openai.com/v1"
    api_key: str = ""
    api_model: str = "tts-1"
    api_voice: str = "alloy"


class GateSettings(BaseModel):
    enabled: bool = True
    frame_ms: int = 30
    rms_threshold: float = 0.01
    min_active_s: float = 0.25
    max_duration_s: float = 60.0


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="INHOUSE_", env_nested_delimiter="__", env_file=".env", extra="ignore"
    )

    host: str = "127.0.0.1"
    port: int = 8770
    # Optional bearer token. When set, every /api request must carry
    # ``Authorization: Bearer <token>``.
    api_token: str = ""
    cors_origins: list[str] = Field(default_factory=list)

    runtime_dir: Path = Path(".runtime")
    upload_max_bytes: int = 25 * 1024 * 1024
    # Retention sweeps run opportunistically on session creation.
    upload_retention_s: float = 24 * 3600
    audio_retention_s: float = 7 * 24 * 3600
    session_idle_retention_s: float = 7 * 24 * 3600

    stt: STTSettings = Field(default_factory=STTSettings)
    llm: LLMSettings = Field(default_factory=LLMSettings)
    tts: TTSSettings = Field(default_factory=TTSSettings)
    gate: GateSettings = Field(default_factory=GateSettings)

    @property
    def uploads_dir(self) -> Path:
        return self.runtime_dir / "uploads"

    @property
    def audio_dir(self) -> Path:
        return self.runtime_dir / "audio"

    @property
    def sessions_file(self) -> Path:
        return self.runtime_dir / "sessions.json"
