"""A tiny OpenAI-compatible chat-completions mock for offline development.

Lets you run the full Inhouse voice loop with zero API keys and no local
model: it streams a canned-but-context-aware reply over SSE exactly the way a
real /v1/chat/completions endpoint does.

    python scripts/mock_llm.py            # listens on 127.0.0.1:9001

Then point Inhouse at it:

    INHOUSE_LLM__BASE_URL=http://127.0.0.1:9001/v1 INHOUSE_LLM__MODEL=mock
"""

from __future__ import annotations

import argparse
import asyncio
import json
import time

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse

app = FastAPI()


def make_reply(messages: list[dict]) -> str:
    last = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
    return (
        f"You said: {last}. This is the Inhouse mock model speaking. "
        "Point the server at a real provider when you are ready. Everything "
        "in the pipeline you are hearing right now ran locally."
    )


@app.post("/v1/chat/completions")
async def chat(request: Request):
    body = await request.json()
    reply = make_reply(body.get("messages", []))

    async def stream():
        for i in range(0, len(reply), 8):
            chunk = {
                "id": "mock", "object": "chat.completion.chunk",
                "created": int(time.time()), "model": body.get("model", "mock"),
                "choices": [{"index": 0, "delta": {"content": reply[i:i + 8]},
                             "finish_reason": None}],
            }
            yield f"data: {json.dumps(chunk)}\n\n"
            await asyncio.sleep(0.01)  # simulate token cadence
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=9001)
    args = parser.parse_args()
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")
