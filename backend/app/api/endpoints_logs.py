"""
Read-only log viewer.

Only an allowlist of sources can be read: a few fixed systemd units, the names of containers that really exist, the
Minecraft log and the system's error-level journal. The caller never supplies a file path or a command. Output is
scrubbed for things that look like secrets, because this dashboard has no login.
"""
import json
import re
import subprocess
from datetime import datetime, timezone

import docker
from fastapi import APIRouter, HTTPException

from app.api import endpoints_minecraft

router = APIRouter()

UNITS = {
    "homelab-dashboard-backend": "Dashboard backend",
    "homelab-dashboard-frontend": "Dashboard frontend",
    "playit": "playit tunnel",
    "tailscaled": "Tailscale",
    "docker": "Docker engine",
}

try:
    _client = docker.from_env()
except Exception:  # Docker not reachable: container logs are simply not offered
    _client = None

_SECRET = re.compile(
    r"(?i)((?:token|passw(?:or)?d|secret|api[_-]?key|authkey|authorization|bearer|claim/|tskey-[a-z]+-)[\"'=:/ ]*)([^\s\"',;&]{4,})"
)
_ERR = re.compile(r"(?i)\b(error|fatal|critical|exception|traceback|failed)\b")
_WARN = re.compile(r"(?i)\b(warn|warning)\b")
_DEBUG = re.compile(r"(?i)\b(debug|trace)\b")


def _redact(text: str) -> str:
    return _SECRET.sub(lambda m: m.group(1) + "[hidden]", text)[:4000]


def _level_from_text(text: str) -> str:
    if _ERR.search(text):
        return "error"
    if _WARN.search(text):
        return "warn"
    if _DEBUG.search(text):
        return "debug"
    return "info"


def _clock(dt: datetime) -> str:
    return dt.astimezone().strftime("%m-%d %H:%M:%S")


def _journal(args, n):
    cmd = ["journalctl", "--no-pager", "-o", "json", "-n", str(n)] + args
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.TimeoutExpired):
        raise HTTPException(status_code=503, detail="Can't read the system journal")
    lines = []
    for raw in out.stdout.splitlines():
        try:
            e = json.loads(raw)
        except ValueError:
            continue
        msg = e.get("MESSAGE", "")
        if not isinstance(msg, str):
            msg = "(binary message)"
        prio = int(e.get("PRIORITY", 6))
        level = "error" if prio <= 3 else "warn" if prio == 4 else "debug" if prio >= 7 else "info"
        if level == "info" and _level_from_text(msg) in ("error", "warn"):
            level = _level_from_text(msg)  # many programs log errors at plain "info" priority
        who = e.get("SYSLOG_IDENTIFIER", "")
        ts = datetime.fromtimestamp(int(e["__REALTIME_TIMESTAMP"]) / 1e6, tz=timezone.utc)
        lines.append({"time": _clock(ts), "level": level, "text": _redact(f"{who}: {msg}" if "-p" in args else msg)})
    return lines


def _docker_lines(name, n):
    if not _client:
        raise HTTPException(status_code=503, detail="Docker daemon not available")
    known = {c.name for c in _client.containers.list(all=True)}
    if name not in known:
        raise HTTPException(status_code=404, detail="Unknown container")
    raw = _client.containers.get(name).logs(tail=n, timestamps=True).decode("utf-8", errors="replace")
    lines = []
    for line in raw.splitlines():
        stamp, _, text = line.partition(" ")
        try:
            clock = _clock(datetime.strptime(stamp[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc))
        except ValueError:
            clock, text = "", line
        lines.append({"time": clock, "level": _level_from_text(text), "text": _redact(text)})
    return lines


def _minecraft_lines(n):
    entries = endpoints_minecraft._read_logs(n)
    if entries is None:
        raise HTTPException(status_code=404, detail="Minecraft log not readable")
    level_map = {"ERROR": "error", "FATAL": "error", "WARN": "warn", "DEBUG": "debug", "TRACE": "debug"}
    return [{"time": e["time"], "level": level_map.get(e["level"], "info"), "text": _redact(e["message"])} for e in entries]


@router.get("/sources")
def log_sources():
    sources = [{"id": f"unit:{u}", "label": label, "group": "Services"} for u, label in UNITS.items()]
    sources.append({"id": "minecraft", "label": "Minecraft server", "group": "Services"})
    sources.append({"id": "system-errors", "label": "System errors (whole server)", "group": "Services"})
    if _client:
        try:
            for c in sorted(_client.containers.list(all=True), key=lambda c: c.name):
                sources.append({"id": f"docker:{c.name}", "label": c.name, "group": "Containers"})
        except Exception:
            pass
    return {"sources": sources}


@router.get("/read")
def read_log(source: str, lines: int = 200):
    n = max(1, min(lines, 1000))
    kind, _, name = source.partition(":")
    if kind == "unit" and name in UNITS:
        out = _journal(["-u", name], n)
    elif source == "system-errors":
        out = _journal(["-p", "err"], n)
    elif kind == "docker" and name:
        out = _docker_lines(name, n)
    elif source == "minecraft":
        out = _minecraft_lines(n)
    else:
        raise HTTPException(status_code=404, detail="Unknown log source")
    return {"source": source, "count": len(out), "lines": out}
