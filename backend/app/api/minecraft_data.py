"""
Read-only facts pulled from the Minecraft server's own files (no game commands, nothing is changed).

activity()     who joined/left and when, advancements, deaths (from latest.log plus the rotated .log.gz files)
server_info()  a few server.properties settings, folder sizes, disk space, ops/bans/whitelist
scan_mods()    every mod jar's name, version, icon and links, read from its fabric.mod.json
mod_icon()     the PNG icon of one mod, read out of its jar

Download links for mods come from two places: links the mod author put in the jar, and Modrinth, which
recognises a jar by the SHA-1 hash of the file. Only those hashes are sent to api.modrinth.com, from a
background thread, and the answers are cached in data/modrinth-cache.json (misses are retried after 7 days).

Settings (environment variables): MC_DIR (the server folder), DASHBOARD_DATA_DIR (where the cache lives).
Log lines only carry a time of day; they are treated as UTC, which is what this server writes.
"""
import glob
import gzip
import hashlib
import json
import os
import re
import shutil
import threading
import time
import zipfile
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

MC_DIR = os.environ.get("MC_DIR", "/path/to/minecraft/server")
DATA_DIR = Path(os.environ.get("DASHBOARD_DATA_DIR", Path(__file__).resolve().parents[3] / "data"))

# ---------------------------------------------------------------- activity (join / leave / advancements / deaths)
_LINE = re.compile(r"^\[(\d\d):(\d\d):(\d\d)\] \[([^/\]]+)/([A-Z]+)\]: ?(.*)$")
_JOIN = re.compile(r"^(\w{1,16}) joined the game$")
_LEAVE = re.compile(r"^(\w{1,16}) left the game$")
_ADVANCEMENT = re.compile(r"^(\w{1,16}) has (?:made the advancement|completed the challenge|reached the goal) \[(.+)\]$")
# Death messages are free text that starts with the player's name, so they are matched by their usual phrases.
_DEATH = re.compile(
    r"was (?:slain|shot|killed|fireballed|pummeled|pricked|squashed|impaled|skewered|stung|obliterated|blown up|"
    r"doomed|struck by lightning|burned|frozen)|fell |hit the ground|drowned|burned to death|burnt to a crisp|"
    r"went up in flames|blew up|starved|suffocated|walked into|tried to swim|died|withered away|froze to death|"
    r"experienced kinetic|didn't want to live|discovered the floor|left the confines"
)
_MAX_ROTATED_LOGS = 8


def _parse_log(path):
    """[(epoch, thread, level, message)] for one log file, oldest first."""
    opener = gzip.open if path.endswith(".gz") else open
    rows = []
    try:
        anchor = os.path.getmtime(path)  # when the file was last written, so about when its last line happened
        with opener(path, "rt", encoding="utf-8", errors="replace") as f:
            for line in f:
                m = _LINE.match(line)
                if m:
                    rows.append((int(m[1]) * 3600 + int(m[2]) * 60 + int(m[3]), m[4], m[5], m[6]))
    except (OSError, EOFError):
        return []
    # Each line only has a time of day, so walk backwards from the anchor and step back a day whenever a time would be in the future.
    day = datetime.fromtimestamp(anchor, timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    latest_allowed = anchor + 120
    out = []
    for secs, thread, level, msg in reversed(rows):
        ts = day.timestamp() + secs
        while ts > latest_allowed:
            day -= timedelta(days=1)
            ts = day.timestamp() + secs
        latest_allowed = ts
        out.append((ts, thread, level, msg))
    out.reverse()
    return out


def activity(log_dir, limit=150):
    files = sorted(glob.glob(os.path.join(log_dir, "*.log.gz")), key=os.path.getmtime)[-_MAX_ROTATED_LOGS:]
    files.append(os.path.join(log_dir, "latest.log"))
    rows = sorted((r for f in files for r in _parse_log(f)), key=lambda r: r[0])

    events = []
    open_since = {}
    stats = defaultdict(lambda: {"sessions": 0, "playtime_s": 0, "last_seen": None})
    for ts, thread, level, msg in rows:
        if msg.startswith("Loading Minecraft"):
            open_since.clear()  # the server restarted, so nobody was still connected
            continue
        if thread != "Server thread" or level != "INFO":
            continue
        if m := _JOIN.match(msg):
            open_since[m[1]] = ts
            stats[m[1]]["last_seen"] = ts
            events.append({"ts": ts, "kind": "join", "player": m[1], "text": ""})
        elif m := _LEAVE.match(msg):
            start = open_since.pop(m[1], None)
            if start is not None:
                stats[m[1]]["sessions"] += 1
                stats[m[1]]["playtime_s"] += int(ts - start)
            stats[m[1]]["last_seen"] = ts
            events.append({"ts": ts, "kind": "leave", "player": m[1], "text": ""})
        elif m := _ADVANCEMENT.match(msg):
            events.append({"ts": ts, "kind": "advancement", "player": m[1], "text": m[2]})
        else:
            name = msg.split(" ", 1)[0]
            if name in stats and _DEATH.search(msg):
                events.append({"ts": ts, "kind": "death", "player": name, "text": msg[len(name) + 1:]})

    now = time.time()
    players = [{"name": n, "sessions": s["sessions"], "playtime_s": s["playtime_s"] + (int(now - open_since[n]) if n in open_since else 0),
                "last_seen": s["last_seen"], "connected_since": open_since.get(n)} for n, s in stats.items()]
    players.sort(key=lambda p: p["last_seen"] or 0, reverse=True)
    return {"players": players, "events": events[::-1][:limit]}


# ---------------------------------------------------------------- server settings, sizes, lists
_PROPERTY_KEYS = ("motd", "difficulty", "gamemode", "max-players", "view-distance", "simulation-distance", "pvp",
                  "hardcore", "white-list", "online-mode", "spawn-protection", "allow-flight", "enable-command-block")


def _read_properties():
    props = {}
    try:
        with open(os.path.join(MC_DIR, "server.properties"), encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    props[k] = v
    except OSError:
        pass
    return props


def _dir_bytes(path):
    total = 0
    stack = [path]
    while stack:
        try:
            with os.scandir(stack.pop()) as it:
                for e in it:
                    if e.is_dir(follow_symlinks=False):
                        stack.append(e.path)
                    elif e.is_file(follow_symlinks=False):
                        total += e.stat(follow_symlinks=False).st_size
        except OSError:
            continue
    return total


def _json_names(filename, key="name"):
    try:
        with open(os.path.join(MC_DIR, filename), encoding="utf-8") as f:
            return [e[key] for e in json.load(f) if isinstance(e, dict) and key in e]
    except (OSError, ValueError):
        return []


def server_info():
    props = _read_properties()
    disk = shutil.disk_usage(MC_DIR) if os.path.isdir(MC_DIR) else None
    return {
        "settings": {k: props[k] for k in _PROPERTY_KEYS if k in props},
        "sizes": {name: _dir_bytes(os.path.join(MC_DIR, sub)) for name, sub in
                  (("world", props.get("level-name", "world")), ("mods", "mods"), ("logs", "logs"))},
        "disk": {"total": disk.total, "used": disk.used, "free": disk.free} if disk else None,
        "ops": _json_names("ops.json"),
        "whitelist": {"enabled": props.get("white-list") == "true", "names": _json_names("whitelist.json")},
        "banned": {"players": len(_json_names("banned-players.json")), "ips": len(_json_names("banned-ips.json", "ip"))},
    }


# ---------------------------------------------------------------- mods
_jar_cache = {}  # jar path -> ((size, mtime), record); a jar is only re-read when it changes


def _web_url(value):
    """Only http(s) links are passed on; mod metadata is written by strangers."""
    return value if isinstance(value, str) and value.startswith(("http://", "https://")) else None


def _names(value):
    out = []
    for a in value if isinstance(value, list) else []:
        n = a.get("name") if isinstance(a, dict) else a
        if isinstance(n, str):
            out.append(n)
    return out[:6]


def _read_jar(path):
    sha1 = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            sha1.update(chunk)
    rec = {"file": os.path.basename(path), "size": os.path.getsize(path), "sha1": sha1.hexdigest(), "id": None,
           "name": os.path.basename(path), "version": None, "description": "", "authors": [], "license": None,
           "homepage": None, "sources": None, "icon_path": None}
    try:
        with zipfile.ZipFile(path) as z:
            meta = json.loads(z.read("fabric.mod.json").decode("utf-8-sig"), strict=False)
            contact = meta.get("contact") or {}
            icon = meta.get("icon")
            if isinstance(icon, dict) and icon:
                icon = icon[max(icon, key=lambda k: int(k) if str(k).isdigit() else 0)]
            if isinstance(icon, str) and icon not in z.namelist():
                icon = None
            lic = meta.get("license")
            rec.update({
                "id": meta.get("id"), "name": meta.get("name") or meta.get("id") or rec["name"],
                "version": str(meta.get("version")) if meta.get("version") is not None else None,
                "description": (meta.get("description") or "")[:240] if isinstance(meta.get("description"), str) else "",
                "authors": _names(meta.get("authors")),
                "license": ", ".join(lic) if isinstance(lic, list) else lic if isinstance(lic, str) else None,
                "homepage": _web_url(contact.get("homepage")), "sources": _web_url(contact.get("sources")),
                "icon_path": icon if isinstance(icon, str) else None,
            })
    except (OSError, KeyError, ValueError, zipfile.BadZipFile):
        pass
    return rec


def scan_mods():
    mods = []
    for path in sorted(glob.glob(os.path.join(MC_DIR, "mods", "*.jar")), key=str.lower):
        try:
            st = os.stat(path)
        except OSError:
            continue
        sig = (st.st_size, st.st_mtime_ns)
        cached_rec = _jar_cache.get(path)
        if not cached_rec or cached_rec[0] != sig:
            cached_rec = (sig, _read_jar(path))
            _jar_cache[path] = cached_rec
        mods.append(cached_rec[1])
    return mods


def mod_icon(mod_id):
    """PNG bytes of a mod's icon, or None. Only real PNG data is handed back."""
    if not _jar_cache:
        scan_mods()
    for path, (_, rec) in list(_jar_cache.items()):
        if rec["id"] == mod_id and rec["icon_path"]:
            try:
                with zipfile.ZipFile(path) as z:
                    info = z.getinfo(rec["icon_path"])
                    if info.file_size > 512 * 1024:
                        return None
                    data = z.read(info)
            except (OSError, KeyError, zipfile.BadZipFile):
                return None
            return data if data.startswith(b"\x89PNG\r\n\x1a\n") else None
    return None


def disabled_mods():
    return sorted(os.path.basename(p) for p in glob.glob(os.path.join(MC_DIR, "mods-disabled", "*.jar")))


# ---------------------------------------------------------------- Modrinth lookup by file hash
_API = "https://api.modrinth.com/v2"
_HEADERS = {"User-Agent": "homelab-dashboard/1.0 (personal homelab, looks up its own mod files by hash)"}
_CACHE_FILE = DATA_DIR / "modrinth-cache.json"
_MISS_RETRY_S = 7 * 86400
_ATTEMPT_GAP_S = 600
_mr_lock = threading.Lock()
_mr = {"hits": None, "running": False, "last_attempt": 0.0, "error": None}


def _mr_load():  # call with the lock held
    if _mr["hits"] is None:
        try:
            _mr["hits"] = json.loads(_CACHE_FILE.read_text())
        except (OSError, ValueError):
            _mr["hits"] = {}


def _mr_save():  # call with the lock held
    try:
        _CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp = _CACHE_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(_mr["hits"]))
        os.replace(tmp, _CACHE_FILE)
    except OSError:
        pass


def _lookup(hashes):
    try:
        for i in range(0, len(hashes), 100):
            chunk = hashes[i:i + 100]
            r = requests.post(f"{_API}/version_files", json={"hashes": chunk, "algorithm": "sha1"}, headers=_HEADERS, timeout=20)
            r.raise_for_status()
            found = r.json()
            ids = sorted({v["project_id"] for v in found.values()})
            projects = {}
            if ids:
                pr = requests.get(f"{_API}/projects", params={"ids": json.dumps(ids)}, headers=_HEADERS, timeout=20)
                pr.raise_for_status()
                projects = {p["id"]: p for p in pr.json()}
            now = time.time()
            with _mr_lock:
                for h in chunk:
                    v = found.get(h)
                    if not v:
                        _mr["hits"][h] = {"miss": now}
                        continue
                    f = next((x for x in v["files"] if (x.get("hashes") or {}).get("sha1") == h), v["files"][0])
                    p = projects.get(v["project_id"], {})
                    _mr["hits"][h] = {"slug": p.get("slug"), "title": p.get("title"), "version": v.get("version_number"),
                                      "download": f.get("url"), "filename": f.get("filename")}
                _mr["error"] = None
                _mr_save()
    except Exception as e:  # network down, rate limited, unexpected reply: show it, try again later
        with _mr_lock:
            _mr["error"] = f"{type(e).__name__}: {str(e)[:160]}"
    finally:
        with _mr_lock:
            _mr["running"] = False


def _ensure_lookup(hashes):
    with _mr_lock:
        _mr_load()
        now = time.time()
        todo = [h for h in hashes if h not in _mr["hits"] or ("miss" in _mr["hits"][h] and now - _mr["hits"][h]["miss"] > _MISS_RETRY_S)]
        if not todo or _mr["running"] or now - _mr["last_attempt"] < _ATTEMPT_GAP_S:
            return
        _mr["running"] = True
        _mr["last_attempt"] = now
    threading.Thread(target=_lookup, args=(todo,), daemon=True).start()


def mods_payload():
    mods = scan_mods()
    _ensure_lookup([m["sha1"] for m in mods])
    with _mr_lock:
        hits = dict(_mr["hits"] or {})
        running, error = _mr["running"], _mr["error"]
    out, matched, unchecked = [], 0, 0
    for m in mods:
        hit = hits.get(m["sha1"])
        modrinth = None
        if hit is None:
            unchecked += 1
        elif "miss" not in hit:
            matched += 1
            modrinth = {
                "page": f"https://modrinth.com/project/{hit['slug']}" if hit.get("slug") else None,
                "download": hit["download"] if str(hit.get("download", "")).startswith("https://cdn.modrinth.com/") else None,
                "title": hit.get("title"), "version": hit.get("version"),
            }
        out.append({"id": m["id"], "name": m["name"], "version": m["version"], "description": m["description"],
                    "authors": m["authors"], "license": m["license"], "homepage": m["homepage"], "sources": m["sources"],
                    "has_icon": bool(m["icon_path"]), "file": m["file"], "size": m["size"], "modrinth": modrinth})
    state = "running" if running else "error" if error and unchecked else "done"
    return {"mods": out, "disabled": disabled_mods(),
            "lookup": {"state": state, "matched": matched, "total": len(mods), "error": error if state == "error" else None}}
