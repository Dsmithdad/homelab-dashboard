"""
Ollama / GPU endpoint.

/ollama      -> what the GPU panel needs: Ollama's version, the models installed, which ones are loaded in
                VRAM right now (and how much of each is on the GPU), plus the live GPU numbers.
/ollama/chat -> POST a conversation, get Ollama's reply streamed back as newline-delimited JSON. The model may
                ask for one of the read-only lookups in assistant_tools.py; this endpoint runs it, hands the
                result back, and keeps streaming. While a lookup runs the stream carries {"tool_call": "<name>"}.

Ollama is reached at OLLAMA_URL (default http://localhost:11434). If it is down the endpoint still
answers with {"available": false, ...} so the dashboard can show a calm "offline" state.
"""
import json
import os
import urllib.error
import urllib.request
from typing import List, Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.api import assistant_tools
from app.api.endpoints_overview import _gpu, cached

router = APIRouter()

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434").rstrip("/")


def _get(path: str, timeout: float = 1.5):
    with urllib.request.urlopen(f"{OLLAMA_URL}{path}", timeout=timeout) as resp:
        return json.load(resp)


def _snapshot():
    gpu = _gpu()
    try:
        version = _get("/api/version").get("version")
        tags = _get("/api/tags").get("models", [])
        running = _get("/api/ps").get("models", [])
    except Exception:
        return {"available": False, "version": None, "models": [], "loaded": [], "gpu": gpu}

    models = []
    for m in tags:
        d = m.get("details") or {}
        models.append({
            "name": m.get("name"),
            "size": m.get("size", 0),
            "family": d.get("family"),
            "params": d.get("parameter_size"),
            "quant": d.get("quantization_level"),
        })
    loaded = []
    for m in running:
        size = m.get("size", 0)
        vram = m.get("size_vram", 0)
        loaded.append({
            "name": m.get("name"),
            "size": size,
            "size_vram": vram,
            # share of the model sitting on the GPU; anything below 100 means part spilled to the CPU
            "gpu_percent": round(100 * vram / size) if size else 0,
            "expires_at": m.get("expires_at"),
            "context_length": m.get("context_length"),
        })
    return {"available": True, "version": version, "models": models, "loaded": loaded, "gpu": gpu}


@router.get("/")
def ollama_status():
    # A short cache keeps several open dashboard tabs from each hammering Ollama and nvidia-smi.
    return cached("ollama", 1.5, _snapshot)


MAX_TOOL_ROUNDS = 4  # how many times the model may ask for lookups before it must just answer


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(max_length=20000)


class ChatRequest(BaseModel):
    model: str = "qwen3:8b"
    messages: List[ChatMessage]
    # qwen3 can "think" out loud before answering; off by default so replies start immediately
    think: bool = False
    tools: bool = True  # let the model use the read-only lookups in assistant_tools.py


def _open_chat(messages: list, model: str, think: bool, tools: bool):
    payload = {"model": model, "messages": messages, "stream": True, "think": think}
    if tools:
        payload["tools"] = assistant_tools.TOOL_SPECS
    request = urllib.request.Request(
        f"{OLLAMA_URL}/api/chat", data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"}
    )
    # The long timeout covers a cold model load into VRAM.
    try:
        return urllib.request.urlopen(request, timeout=300)
    except urllib.error.HTTPError as e:
        raise HTTPException(status_code=e.code, detail=e.read().decode(errors="replace")[:300])
    except Exception:
        raise HTTPException(status_code=503, detail="Ollama is not answering on its port")


def _event(obj: dict) -> bytes:
    return (json.dumps(obj) + "\n").encode()


def _relay(resp, messages: list, model: str, think: bool, tools_on: bool):
    rounds = 0
    try:
        while True:
            content, calls, final_line = "", [], None
            for raw in resp:  # Ollama sends one JSON object per line as tokens are generated
                if not raw.strip():
                    continue
                line = json.loads(raw)
                msg = line.get("message") or {}
                content += msg.get("content") or ""
                calls.extend(msg.get("tool_calls") or [])
                if line.get("done"):
                    final_line = raw  # held back: the browser should only see "done" once we know no lookup is pending
                else:
                    yield raw
            resp.close()
            if not calls or rounds >= MAX_TOOL_ROUNDS:
                if final_line:
                    yield final_line
                return

            rounds += 1
            messages.append({"role": "assistant", "content": content, "tool_calls": calls})
            for call in calls:
                name = (call.get("function") or {}).get("name", "")
                yield _event({"tool_call": name})
                messages.append({"role": "tool", "tool_name": name, "content": json.dumps(assistant_tools.run_tool(name))})
            try:
                # the last allowed round goes out without tools, which forces a plain answer
                resp = _open_chat(messages, model, think, tools_on and rounds < MAX_TOOL_ROUNDS)
            except HTTPException as e:
                yield _event({"error": str(e.detail)})
                return
    finally:
        resp.close()  # also runs when the browser disconnects, which tells Ollama to stop generating


@router.post("/chat")
def ollama_chat(req: ChatRequest):
    if not req.messages or len(req.messages) > 100:
        raise HTTPException(status_code=422, detail="messages must hold between 1 and 100 entries")

    messages = [m.dict() for m in req.messages]
    tools_on = req.tools
    # Open the connection before returning, so "Ollama is down" or "no such model" become a clean HTTP
    # error instead of a stream that dies halfway.
    try:
        resp = _open_chat(messages, req.model, req.think, tools_on)
    except HTTPException as e:
        # a model that can't use tools (some can't) still gets to chat
        if not (tools_on and e.status_code == 400 and "tools" in str(e.detail).lower()):
            raise
        tools_on = False
        resp = _open_chat(messages, req.model, req.think, False)

    return StreamingResponse(_relay(resp, messages, req.model, req.think, tools_on), media_type="application/x-ndjson")
