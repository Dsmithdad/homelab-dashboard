"""
Minecraft endpoint.

/minecraft -> what the Minecraft card needs: is the server up, how many players, version, MOTD and
              the names of a few players, plus the public join address.

The server is asked the same no-login question a game client asks in its server list (the Java
"status ping"), so no Crafty token is needed. If nothing answers, the endpoint still replies with
{"online": false, ...} so the dashboard can show a calm "offline" state.

The Java process itself is looked up too, for its uptime, memory and CPU. "server" is null if it isn't found.

Settings (environment variables): MC_HOST (default 127.0.0.1), MC_PORT (default 25565),
MC_PUBLIC_ADDRESS (the address friends type in; default is empty),
MC_PROCESS_MATCH (text that identifies the server's java command line; default fabric-server-launch).
"""
import json
import os
import re
import socket
import struct
import time

import psutil
from fastapi import APIRouter, HTTPException, Response

from app.api import minecraft_data
from app.api.endpoints_overview import cached

router = APIRouter()

MC_HOST = os.environ.get("MC_HOST", "127.0.0.1")
MC_PORT = int(os.environ.get("MC_PORT", "25565"))
PUBLIC_ADDRESS = os.environ.get("MC_PUBLIC_ADDRESS", "")
MC_PROCESS_MATCH = os.environ.get("MC_PROCESS_MATCH", "fabric-server-launch")

_proc = None  # kept between requests so psutil can measure CPU over time instead of one instant


def _varint(n: int) -> bytes:
    out = b""
    while True:
        byte = n & 0x7F
        n >>= 7
        out += bytes([byte | (0x80 if n else 0)])
        if not n:
            return out


def _read_varint(sock) -> int:
    n = shift = 0
    while True:
        chunk = sock.recv(1)
        if not chunk:
            raise ConnectionError("server closed the connection")
        n |= (chunk[0] & 0x7F) << shift
        shift += 7
        if not chunk[0] & 0x80:
            return n


def _motd_text(desc) -> str:
    """The MOTD is either a plain string or a nested chat component; flatten it to plain text."""
    if isinstance(desc, str):
        return desc
    if not isinstance(desc, dict):
        return ""
    return (desc.get("text") or "") + "".join(_motd_text(e) for e in desc.get("extra") or [])


def _ping():
    started = time.time()
    with socket.create_connection((MC_HOST, MC_PORT), timeout=1.5) as s:
        s.settimeout(1.5)
        handshake = b"\x00" + _varint(765) + _varint(len(MC_HOST)) + MC_HOST.encode() + struct.pack(">H", MC_PORT) + _varint(1)
        s.sendall(_varint(len(handshake)) + handshake + b"\x01\x00")
        _read_varint(s)  # packet length
        _read_varint(s)  # packet id
        size = _read_varint(s)
        data = b""
        while len(data) < size:
            part = s.recv(size - len(data))
            if not part:
                raise ConnectionError("short status reply")
            data += part
    return json.loads(data), round((time.time() - started) * 1000)


def _server_stats():
    """Uptime, memory and CPU of the server's java process, or None if it can't be found."""
    global _proc
    try:
        if _proc is None or not _proc.is_running():
            _proc = next((p for p in psutil.process_iter(["name", "cmdline"])
                          if p.info["name"] == "java" and MC_PROCESS_MATCH in " ".join(p.info["cmdline"] or [])), None)
        if _proc is None:
            return None
        with _proc.oneshot():
            heap = re.search(r"-Xmx(\d+)([MmGg])", " ".join(_proc.cmdline()))
            return {
                "uptime_s": int(time.time() - _proc.create_time()),
                "memory_mb": round(_proc.memory_info().rss / 1048576),
                "heap_max_mb": int(heap.group(1)) * (1024 if heap.group(2) in "Gg" else 1) if heap else None,
                "cpu_percent": _proc.cpu_percent(),  # reads 0 on the very first request, real after that
            }
    except (psutil.Error, OSError):
        _proc = None
        return None


def _snapshot():
    base = {"address": PUBLIC_ADDRESS, "online": False, "version": None, "motd": "",
            "players": {"online": 0, "max": 0, "names": []}, "latency_ms": None, "server": _server_stats()}
    try:
        reply, latency = _ping()
    except Exception:
        return base
    players = reply.get("players") or {}
    return {
        **base,
        "online": True,
        "version": (reply.get("version") or {}).get("name"),
        "motd": _motd_text(reply.get("description")).strip(),
        "players": {
            "online": players.get("online", 0),
            "max": players.get("max", 0),
            "names": [p.get("name") for p in players.get("sample") or [] if p.get("name")],
        },
        "latency_ms": latency,
    }


LOG_PATH = os.environ.get(
    "MC_LOG_PATH",
    "/path/to/minecraft/server/logs/latest.log",
)
_LOG_LINE = re.compile(r"^\[(\d\d:\d\d:\d\d)\] \[([^/\]]+)/([A-Z]+)\]: ?(.*)$")
_TAIL_BYTES = 512 * 1024  # only the end of the file is read, so a huge log never gets loaded whole


def _read_logs(limit: int):
    """The last `limit` log entries, oldest first. Lines without a [time] prefix (stack traces) join the entry above."""
    try:
        with open(LOG_PATH, "rb") as f:
            f.seek(0, os.SEEK_END)
            size = f.tell()
            f.seek(max(0, size - _TAIL_BYTES))
            raw = f.read().decode("utf-8", errors="replace")
    except OSError:
        return None
    lines = raw.splitlines()
    if size > _TAIL_BYTES:
        lines = lines[1:]  # the first line was probably cut in half
    entries = []
    for line in lines:
        m = _LOG_LINE.match(line)
        if m:
            entries.append({"time": m.group(1), "thread": m.group(2), "level": m.group(3), "message": m.group(4)})
        elif entries and line.strip():
            entries[-1]["message"] += "\n" + line
    return entries[-limit:]


@router.get("/logs")
def minecraft_logs(lines: int = 200):
    entries = _read_logs(max(1, min(lines, 1000)))
    return {"available": entries is not None, "entries": entries or []}


@router.get("/")
def minecraft_status():
    # A short cache keeps several open dashboard tabs from each pinging the game server.
    return cached("minecraft", 3, _snapshot)


@router.get("/activity")
def minecraft_activity():
    """Players (last seen, sessions, playtime) and a feed of joins, leaves, advancements and deaths."""
    data = cached("minecraft-activity", 20, lambda: minecraft_data.activity(os.path.dirname(LOG_PATH)))
    online = set(cached("minecraft", 3, _snapshot)["players"]["names"])
    return {**data, "players": [{**p, "online": p["name"] in online} for p in data["players"]]}


@router.get("/info")
def minecraft_info():
    """Settings, folder sizes, disk space, ops/bans, and how many errors/warnings the current log holds."""
    def build():
        entries = _read_logs(100000) or []
        return {**minecraft_data.server_info(),
                "log_health": {"errors": sum(e["level"] == "ERROR" for e in entries),
                               "warnings": sum(e["level"] == "WARN" for e in entries)}}
    return cached("minecraft-info", 30, build)


@router.get("/mods")
def minecraft_mods():
    """Every mod with its links. "lookup" says how far the background Modrinth hash lookup has got."""
    return minecraft_data.mods_payload()


@router.get("/mods/icon/{mod_id}")
def minecraft_mod_icon(mod_id: str):
    png = minecraft_data.mod_icon(mod_id)
    if png is None:
        raise HTTPException(status_code=404, detail="no icon")
    return Response(png, media_type="image/png", headers={"Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff"})
