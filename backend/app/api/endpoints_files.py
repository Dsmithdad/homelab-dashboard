"""
Files endpoint (read only, deliberately small).

/files/roots -> the folders that can be browsed.
/files/list  -> what is inside one folder: names, sizes, times.
/files/read  -> the text of one small text file, scrubbed for things that look like secrets.

This dashboard has no login, so the rules are strict:
  * read only: nothing can be uploaded, changed, renamed, deleted or downloaded;
  * only the folders in FILES_ROOTS can be browsed (colon-separated paths; default: ~/homelab and the dashboard's
    own folder). The caller never supplies an absolute path, only a root number plus a path inside that root;
  * every path is resolved and must stay inside its root; symlinks are never followed or listed;
  * anything hidden (names starting with a dot, which covers .env, .git, .ssh) and the usual huge or private
    folders (node_modules, venv, __pycache__, build output) are invisible and unreadable;
  * files whose names suggest secrets (keys, certificates, tokens, passwords, databases, backups) can be listed
    but never read;
  * only small text-like files are previewed, and previews are redacted the same way the Logs page is.
"""
import os
import re
import stat
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.api.endpoints_logs import _redact

router = APIRouter()

_DEFAULT_ROOTS = os.path.expanduser("~/homelab") + ":" + str(Path(__file__).resolve().parents[3])
ROOTS = [Path(p).resolve() for p in os.environ.get("FILES_ROOTS", _DEFAULT_ROOTS).split(":") if p.strip() and Path(p).is_dir()]

HIDDEN_DIRS = {"node_modules", ".venv", "venv", "__pycache__", "build", "dist", "hf-cache", ".git"}
SECRET_NAME = re.compile(r"(?i)(secret|token|passw|credential|private|id_rsa|id_ed25519|\.pem$|\.key$|\.crt$|\.pfx$|\.p12$|\.db$|\.sqlite3?$|\.zip$|\.gz$|\.tar$|\.bak$)")
TEXT_EXT = {".md", ".txt", ".log", ".sh", ".py", ".js", ".json", ".yml", ".yaml", ".toml", ".ini", ".cfg", ".conf", ".css", ".html", ".csv", ".service", ".timer", ".nft", ".jsonl"}
MAX_ENTRIES = 500
MAX_READ_BYTES = 100_000


def _root(root: int) -> Path:
    if root < 0 or root >= len(ROOTS):
        raise HTTPException(status_code=404, detail="No such folder")
    return ROOTS[root]


def _visible(name: str) -> bool:
    return not name.startswith(".") and name not in HIDDEN_DIRS


def _resolve(root: int, rel: str) -> Path:
    """Turn root number + relative path into a real path, or 404. Never trusts the caller's path."""
    base = _root(root)
    parts = [p for p in rel.replace("\\", "/").split("/") if p not in ("", ".")]
    if any(p == ".." or not _visible(p) or "\x00" in p for p in parts):
        raise HTTPException(status_code=404, detail="No such path")
    target = base.joinpath(*parts)
    try:
        real = target.resolve()
    except OSError:
        raise HTTPException(status_code=404, detail="No such path")
    # must stay inside the root and must not have been reached through a symlink
    if real != base and base not in real.parents:
        raise HTTPException(status_code=404, detail="No such path")
    probe = base
    for p in parts:
        probe = probe / p
        if probe.is_symlink():
            raise HTTPException(status_code=404, detail="No such path")
    return real


def _readable(path: Path, size: int) -> bool:
    return path.suffix.lower() in TEXT_EXT and not SECRET_NAME.search(path.name) and size <= MAX_READ_BYTES


@router.get("/roots")
def roots():
    return {"roots": [{"id": i, "label": p.name or str(p), "path": str(p)} for i, p in enumerate(ROOTS)]}


@router.get("/list")
def list_dir(root: int = 0, path: str = ""):
    target = _resolve(root, path)
    if not target.is_dir():
        raise HTTPException(status_code=404, detail="Not a folder")
    entries = []
    truncated = False
    try:
        children = sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
    except OSError:
        raise HTTPException(status_code=403, detail="Can't read this folder")
    for p in children:
        if not _visible(p.name):
            continue
        try:
            st = p.lstat()
        except OSError:
            continue
        if stat.S_ISLNK(st.st_mode):
            continue
        is_dir = stat.S_ISDIR(st.st_mode)
        if not is_dir and not stat.S_ISREG(st.st_mode):
            continue
        if len(entries) >= MAX_ENTRIES:
            truncated = True
            break
        entries.append({"name": p.name, "dir": is_dir, "size": None if is_dir else st.st_size, "modified": st.st_mtime,
                        "readable": False if is_dir else _readable(p, st.st_size)})
    base = _root(root)
    rel = "" if target == base else str(target.relative_to(base))
    return {"root": root, "path": rel, "entries": entries, "truncated": truncated}


@router.get("/read")
def read_file(root: int = 0, path: str = ""):
    target = _resolve(root, path)
    if not target.is_file():
        raise HTTPException(status_code=404, detail="Not a file")
    size = target.stat().st_size
    if not _readable(target, size):
        raise HTTPException(status_code=403, detail="This file can't be previewed here (not a small text file, or its name suggests it holds secrets)")
    text = target.read_bytes().decode("utf-8", errors="replace")
    text = "\n".join(_redact(line) for line in text.split("\n"))
    return {"name": target.name, "size": size, "text": text}
