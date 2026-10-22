"""
Scripts endpoint (read only).

/scripts       -> the scripts that really exist in the scripts folder, with size, last-changed time, whether they
                  are executable and a one-line description (the first comment after the #! line).
/scripts/view  -> one script's text, so you can read what it does.

This dashboard has no login, so nothing here can run, edit, upload or delete a script. The caller never supplies a
path: ?name= must match a file found by listing the folder (plain files only, no symlinks, simple names), and the
text is scrubbed for things that look like secrets before it is returned.

Settings (environment variable): SCRIPTS_DIR (default ~/homelab/scripts).
"""
import os
import re
import stat
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.api.endpoints_logs import _redact

router = APIRouter()

SCRIPTS_DIR = Path(os.environ.get("SCRIPTS_DIR", os.path.expanduser("~/homelab/scripts")))
MAX_VIEW_BYTES = 200_000
_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$")


def _describe(path: Path) -> str:
    """First comment line after the #! line, e.g. '# Mirror Crafty's backups' -> "Mirror Crafty's backups"."""
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            for i, line in enumerate(f):
                if i > 15:
                    break
                text = line.strip()
                if i == 0 and text.startswith("#!"):
                    continue
                if text.startswith("#"):
                    text = text.lstrip("#").strip()
                    if text and not text.startswith(("SPDX", "Copyright")):
                        return _redact(text)[:160]
                elif text:
                    break  # code started without a comment
    except OSError:
        pass
    return ""


def _scripts():
    out = []
    try:
        entries = sorted(SCRIPTS_DIR.iterdir(), key=lambda p: p.name.lower())
    except OSError:
        return None
    for p in entries:
        if not _NAME.match(p.name):
            continue
        try:
            st = p.lstat()  # lstat: a symlink must not pass for a plain file
        except OSError:
            continue
        if not stat.S_ISREG(st.st_mode):
            continue
        out.append({
            "name": p.name,
            "size": st.st_size,
            "modified": st.st_mtime,
            "executable": bool(st.st_mode & stat.S_IXUSR),
            "description": _describe(p),
        })
    return out


@router.get("/")
def scripts():
    found = _scripts()
    if found is None:
        return {"available": False, "dir": str(SCRIPTS_DIR), "scripts": []}
    return {"available": True, "dir": str(SCRIPTS_DIR), "scripts": found}


@router.get("/view")
def view(name: str):
    found = _scripts() or []
    match = next((s for s in found if s["name"] == name), None)
    if not match:
        raise HTTPException(status_code=404, detail="No such script")
    with open(SCRIPTS_DIR / match["name"], "rb") as f:
        raw = f.read(MAX_VIEW_BYTES + 1)
    truncated = len(raw) > MAX_VIEW_BYTES
    text = raw[:MAX_VIEW_BYTES].decode("utf-8", errors="replace")
    text = "\n".join(_redact(line) for line in text.split("\n"))
    return {**match, "path": str(SCRIPTS_DIR / match["name"]), "text": text, "truncated": truncated}
