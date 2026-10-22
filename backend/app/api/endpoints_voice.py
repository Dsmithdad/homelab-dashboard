"""
Voice endpoint.

/voice/transcribe -> POST the recorded audio as the raw request body (what the browser's MediaRecorder
                     produces) and get {"text": "..."} back. The audio goes to the local Whisper container
                     (dashboard-whisper, see voice/docker-compose.yml); nothing leaves this machine.

Settings (environment variables): WHISPER_URL (default http://127.0.0.1:8100), WHISPER_MODEL
(default Systran/faster-whisper-small), WHISPER_LANGUAGE (default en; set it empty to auto-detect).
"""
import json
import os
import urllib.error
import urllib.request
import uuid

from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool

router = APIRouter()

WHISPER_URL = os.environ.get("WHISPER_URL", "http://127.0.0.1:8100").rstrip("/")
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "Systran/faster-whisper-small")
WHISPER_LANGUAGE = os.environ.get("WHISPER_LANGUAGE", "en")
MAX_AUDIO_BYTES = 25 * 1024 * 1024


def _extension(content_type: str) -> str:
    """Whisper's decoder goes by the file name, so give it one that matches what the browser recorded."""
    ct = (content_type or "").lower()
    for hint, ext in (("webm", "webm"), ("ogg", "ogg"), ("mp4", "mp4"), ("aac", "mp4"), ("wav", "wav"), ("mpeg", "mp3")):
        if hint in ct:
            return ext
    return "webm"


def _multipart(fields: dict, filename: str, audio: bytes):
    boundary = uuid.uuid4().hex
    body = b""
    for name, value in fields.items():
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
    body += f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode()
    body += b"Content-Type: application/octet-stream\r\n\r\n" + audio + f"\r\n--{boundary}--\r\n".encode()
    return body, f"multipart/form-data; boundary={boundary}"


def _forward(audio: bytes, content_type: str) -> str:
    fields = {"model": WHISPER_MODEL, "response_format": "json"}
    if WHISPER_LANGUAGE:
        fields["language"] = WHISPER_LANGUAGE
    body, ctype = _multipart(fields, f"speech.{_extension(content_type)}", audio)
    request = urllib.request.Request(f"{WHISPER_URL}/v1/audio/transcriptions", data=body, headers={"Content-Type": ctype})
    try:
        # generous timeout: the first request after a quiet spell also loads the model onto the GPU
        with urllib.request.urlopen(request, timeout=60) as resp:
            return (json.load(resp).get("text") or "").strip()
    except urllib.error.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Whisper rejected the audio: {e.read().decode(errors='replace')[:300]}")
    except Exception:
        raise HTTPException(status_code=503, detail="Whisper is not answering. Check the dashboard-whisper container.")


@router.post("/transcribe")
async def transcribe(request: Request):
    audio = await request.body()
    if not audio:
        raise HTTPException(status_code=422, detail="no audio received")
    if len(audio) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="recording is too large")
    text = await run_in_threadpool(_forward, audio, request.headers.get("content-type", ""))
    return {"text": text}
