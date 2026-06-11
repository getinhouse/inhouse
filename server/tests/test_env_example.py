"""The shipped .env.example must produce a sane default config verbatim.

Regression guard for a python-dotenv quirk that bit a real first run: an
inline comment after an EMPTY value is parsed as the value, so
`INHOUSE_API_TOKEN=   # note` silently enabled auth with the comment text
as the token and every fresh install 401'd.
"""

from pathlib import Path

from inhouse.config import Settings

ENV_EXAMPLE = Path(__file__).resolve().parents[2] / ".env.example"


def test_env_example_defaults_are_sane(monkeypatch):
    for var in list(__import__("os").environ):
        if var.startswith("INHOUSE_"):
            monkeypatch.delenv(var)
    settings = Settings(_env_file=ENV_EXAMPLE)

    # The killer: empty values must stay empty, never swallow a comment.
    assert settings.api_token == ""
    assert settings.llm.api_key == ""

    assert settings.host == "127.0.0.1"
    assert settings.port == 8770
    assert settings.stt.provider == "faster_whisper"
    assert settings.llm.provider == "openai_compat"
    assert settings.tts.provider == "piper"


def test_env_example_has_no_inline_comments():
    for line in ENV_EXAMPLE.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        assert "#" not in line, (
            f"inline comment in .env.example: {line!r} — python-dotenv parses "
            "these as part of the value when the value is empty; keep comments "
            "on their own lines"
        )
