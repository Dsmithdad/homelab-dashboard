"""
Drive health endpoint (Scrutiny).

/drives -> one row per physical drive for the Drive health tile: model, size, temperature, power-on hours,
           health status, what Scrutiny doesn't like (if anything), where it is mounted, and for the NVMe
           drive its wear and unsafe-shutdown count.

Everything is read from the Scrutiny container on this same machine (SCRUTINY_URL, default
http://127.0.0.1:8085), never from the internet. Results are cached for 60 seconds. If Scrutiny is down the
endpoint still answers with {"online": false, ...} so the dashboard can show a calm "offline" state.

Settings (environment variables): SCRUTINY_URL, SCRUTINY_PUBLIC_PORT (port the browser link uses, default 8085).
"""
import json
import os
import subprocess
import threading
import time
import urllib.request
from pathlib import Path

from fastapi import APIRouter

router = APIRouter()

SCRUTINY_URL = os.environ.get("SCRUTINY_URL", "http://127.0.0.1:8085").rstrip("/")
SCRUTINY_PUBLIC_PORT = int(os.environ.get("SCRUTINY_PUBLIC_PORT", "8085"))
TTL = 60
# readable names for the SMART attribute ids Scrutiny usually flags
ATTR_NAMES = {
    "1": "Read error rate", "3": "Spin-up time", "5": "Reallocated sectors", "7": "Seek error rate",
    "9": "Power-on hours", "10": "Spin retry count", "184": "End-to-end error", "187": "Reported uncorrectable",
    "188": "Command timeout", "189": "High fly writes", "190": "Airflow temperature", "194": "Temperature",
    "195": "ECC recovered", "196": "Reallocation events", "197": "Pending sectors", "198": "Offline uncorrectable",
    "199": "UDMA CRC errors",
}
ERROR_TTL = 15
# acknowledged drives (one WWN per line, # comments): their Scrutiny-only warnings show as healthy
IGNORED_FILE = Path(os.environ.get("IGNORED_DRIVES", Path(__file__).resolve().parents[3] / "data" / "ignored-drives.txt"))

_cache = {"at": 0.0, "ttl": 0.0, "value": None}
_lock = threading.Lock()


def _get_json(path: str, timeout: float = 5):
    with urllib.request.urlopen(f"{SCRUTINY_URL}{path}", timeout=timeout) as resp:
        return json.load(resp)


def _mounts() -> dict:
    """{"sda": "/mnt/x", ...}: first mount point found on each disk or its partitions."""
    out = {}
    try:
        text = subprocess.run(["lsblk", "-nr", "-o", "NAME,PKNAME,MOUNTPOINT"], capture_output=True, text=True, timeout=5).stdout
    except Exception:
        return out
    for line in text.splitlines():
        parts = line.split(" ")
        if len(parts) >= 3 and parts[2].startswith("/") and not parts[2].startswith("/boot"):
            disk = parts[1] or parts[0]
            out.setdefault(disk, parts[2])
    return out


def _ignored() -> set:
    try:
        lines = IGNORED_FILE.read_text().splitlines()
    except OSError:
        return set()
    return {w for w in (line.split("#")[0].strip().lower() for line in lines) if w}


def _mount_for(mounts: dict, name: str):
    # an NVMe controller (nvme0) owns namespaces named nvme0n1, nvme0n2, ...
    return mounts.get(name) or next((m for k, m in mounts.items() if k.startswith(f"{name}n")), None)


def _problems(wwn: str) -> list:
    """Attributes Scrutiny has flagged for one drive (empty if it can't be read)."""
    try:
        attrs = _get_json(f"/api/device/{wwn}/details")["data"]["smart_results"][0]["attrs"]
    except Exception:
        return []
    return [
        {"name": ATTR_NAMES.get(str(a.get("attribute_id", k)), f"attribute {a.get('attribute_id', k)}"), "reason": (a.get("status_reason") or "flagged")[:120]}
        for k, a in attrs.items()
        if a.get("status")
    ]


def _nvme_extra(wwn: str) -> dict:
    try:
        attrs = _get_json(f"/api/device/{wwn}/details")["data"]["smart_results"][0]["attrs"]
    except Exception:
        return {}
    pick = lambda k: (attrs.get(k) or {}).get("value")  # noqa: E731
    return {"wear_pct": pick("percentage_used"), "spare_pct": pick("available_spare"),
            "unsafe_shutdowns": pick("unsafe_shutdowns"), "media_errors": pick("media_errors")}


def _build() -> dict:
    summary = _get_json("/api/summary")["data"]["summary"]
    mounts = _mounts()
    ignored = _ignored()
    drives = []
    for wwn, v in summary.items():
        dev, smart = v["device"], v.get("smart") or {}
        status = dev.get("device_status", 0)
        name = dev.get("device_name", "?")
        muted = wwn.lower() in ignored and status and not status & 1
        if muted:
            status = 0  # known Scrutiny warning; a real SMART failure (bit 1) still shows
        row = {
            "name": name, "model": dev.get("model_name") or "unknown", "capacity": dev.get("capacity"),
            "temp_c": smart.get("temp"), "hours": smart.get("power_on_hours"),
            "protocol": dev.get("device_protocol"), "mount": _mount_for(mounts, name),
            # Scrutiny: 0 passed, 1 SMART failed, 2 Scrutiny thresholds exceeded, 3 both
            "status": "failed" if status & 1 else "warning" if status else "passed",
            "problems": _problems(wwn) if status else [],
            "ignored": bool(muted),
        }
        if dev.get("device_protocol") == "NVMe":
            row["nvme"] = _nvme_extra(wwn)
        drives.append(row)
    drives.sort(key=lambda d: (d["status"] == "passed", d["name"]))
    return {"online": True, "port": SCRUTINY_PUBLIC_PORT, "count": len(drives), "drives": drives}


@router.get("/")
def drives():
    now = time.time()
    with _lock:
        if _cache["value"] is not None and now - _cache["at"] < _cache["ttl"]:
            return _cache["value"]
        try:
            value, ttl = _build(), TTL
        except Exception as e:
            value, ttl = {"online": False, "port": SCRUTINY_PUBLIC_PORT, "error": f"{type(e).__name__}: {e}"[:160]}, ERROR_TTL
        _cache.update(at=now, ttl=ttl, value=value)
        return value
