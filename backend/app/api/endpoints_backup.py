"""
Backup status endpoint (nightly Immich backup).

/backup -> what the Backup tile needs: is the backup drive mounted, when the last successful run was and how
           old that is, how many database dumps exist (and the newest one's size), the library size the last
           run reported, free space on the backup drive, and the last result of the 08:00 dead-man check.

Everything is read from files on this machine (the backup log, the dump folder, the mount), nothing is run
and nothing leaves the server. Results are cached for 60 seconds.

Status: "ok" (success within MAX_AGE_H hours, drive mounted, newest dump present), "late" (older than that),
"problem" (drive not mounted, no success ever logged, no dumps, or the last run logged a failure).

Settings (environment variables): BACKUP_LOG, BACKUP_CHECK_LOG, BACKUP_DB_DIR, BACKUP_MOUNT, BACKUP_MAX_AGE_H.
"""
import glob
import os
import re
import shutil
import threading
import time
from datetime import datetime

from fastapi import APIRouter

router = APIRouter()

HOME = os.path.expanduser("~")
LOG = os.environ.get("BACKUP_LOG", f"{HOME}/homelab/logs/immich-backup.log")
CHECK_LOG = os.environ.get("BACKUP_CHECK_LOG", f"{HOME}/homelab/logs/immich-backup-check.log")
DB_DIR = os.environ.get("BACKUP_DB_DIR", "/mnt/backup/immich/db")
MOUNT = os.environ.get("BACKUP_MOUNT", "/mnt/backup")
MAX_AGE_H = float(os.environ.get("BACKUP_MAX_AGE_H", "26"))
TTL = 60

_cache = {"at": 0.0, "value": None}
_lock = threading.Lock()

_OK_RE = re.compile(r"^(\S+) immich backup ok: (\d+) dumps?, (\S+) library")


def _tail_lines(path: str, n: int = 200) -> list:
    try:
        with open(path, "rb") as f:
            f.seek(0, os.SEEK_END)
            f.seek(max(0, f.tell() - 32768))
            return f.read().decode("utf-8", "replace").splitlines()[-n:]
    except OSError:
        return []


def _build() -> dict:
    mounted = os.path.ismount(MOUNT)
    lines = _tail_lines(LOG)

    last_ok = None
    for line in reversed(lines):
        m = _OK_RE.match(line)
        if m:
            last_ok = {"at": m.group(1), "dumps": int(m.group(2)), "library": m.group(3)}
            break
    # anything after the last success that is not itself a success line counts as a failed run
    last_fail = None
    for line in reversed(lines):
        if _OK_RE.match(line):
            break
        if line.strip():
            last_fail = line.strip()[:200]
            break

    age_h = None
    if last_ok:
        try:
            age_h = round((time.time() - datetime.fromisoformat(last_ok["at"]).timestamp()) / 3600, 1)
        except ValueError:
            pass

    dumps = sorted(glob.glob(os.path.join(DB_DIR, "*.sql.gz")), key=os.path.getmtime) if mounted else []
    newest = None
    if dumps:
        st = os.stat(dumps[-1])
        newest = {"name": os.path.basename(dumps[-1]), "bytes": st.st_size, "mtime": st.st_mtime}

    disk = None
    if mounted:
        u = shutil.disk_usage(MOUNT)
        disk = {"total": u.total, "used": u.used, "free": u.free}

    check = (_tail_lines(CHECK_LOG, 1) or [None])[0]

    if not mounted or last_ok is None or not dumps or last_fail:
        status = "problem"
    elif age_h is None or age_h > MAX_AGE_H:
        status = "late"
    else:
        status = "ok"

    return {
        "status": status, "mounted": mounted, "mount": MOUNT, "max_age_h": MAX_AGE_H,
        "last_ok": last_ok, "age_h": age_h, "last_fail": last_fail,
        "dump_count": len(dumps), "newest_dump": newest, "disk": disk, "check": check,
    }


@router.get("/")
def backup():
    now = time.time()
    with _lock:
        if _cache["value"] is not None and now - _cache["at"] < TTL:
            return _cache["value"]
        try:
            value = _build()
        except Exception as e:
            value = {"status": "problem", "error": f"{type(e).__name__}: {e}"[:160]}
        _cache.update(at=now, value=value)
        return value
