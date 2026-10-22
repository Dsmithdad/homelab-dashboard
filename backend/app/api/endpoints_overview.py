"""
Overview + service-launcher endpoints.

/overview  -> one snapshot of everything the dashboard header and gauges need (CPU, RAM, GPU, temps,
              disks, network rate, container counts, Tailscale peers).
/services  -> your running containers turned into launcher tiles (name, group, status, port, latency).

Optional overrides live in  <repo>/data/services.json , keyed by container name, e.g.
  { "big-bear-adguard-home": { "name": "AdGuard", "port": 3000, "scheme": "http", "group": "infra", "hide": false } }
"probe_port" health-checks a different local port than the link uses (e.g. link to a tailscale serve port).
"""
import json
import os
import re
import shutil
import socket
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional

import docker
import psutil
from fastapi import APIRouter

router = APIRouter()

try:
    _docker = docker.from_env()
except Exception as e:  # pragma: no cover
    _docker = None
    print(f"Warning: overview could not connect to Docker: {e}")

OVERRIDES_FILE = Path(os.environ.get("SERVICES_OVERRIDES", Path(__file__).resolve().parents[3] / "data" / "services.json"))
# Containers you stopped on purpose: one name per line, # for comments. Re-read on every request, no restart needed.
IGNORED_FILE = Path(os.environ.get("IGNORED_CONTAINERS", Path(__file__).resolve().parents[3] / "data" / "ignored-containers.txt"))

# ---------------------------------------------------------------- small helpers

_cache = {}


def cached(key: str, ttl: float, fn):
    now = time.time()
    hit = _cache.get(key)
    if hit and now - hit[0] < ttl:
        return hit[1]
    value = fn()
    _cache[key] = (now, value)
    return value


def run(cmd, timeout=3):
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return out.stdout if out.returncode == 0 else None
    except Exception:
        return None


def tcp_latency_ms(host: str, port: int, timeout: float = 0.6) -> Optional[float]:
    start = time.perf_counter()
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return round((time.perf_counter() - start) * 1000, 1)
    except Exception:
        return None


# Prime psutil's CPU counter so the first real reading isn't 0.
psutil.cpu_percent(interval=None)
_last_net = {"t": time.time(), "rx": 0, "tx": 0}
_n = psutil.net_io_counters()
_last_net.update(rx=_n.bytes_recv, tx=_n.bytes_sent)

# ---------------------------------------------------------------- /overview


def _gpu():
    out = run(["nvidia-smi", "--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total,power.draw,fan.speed",
               "--format=csv,noheader,nounits"])
    if not out:
        return None
    try:
        name, util, temp, used, total, power, fan = [x.strip() for x in out.strip().splitlines()[0].split(",")]
        return {
            "name": name.replace("NVIDIA GeForce ", ""),
            "percent": float(util), "temp_c": float(temp),
            "mem_used_mb": float(used), "mem_total_mb": float(total),
            "power_w": float(power) if power not in ("[N/A]", "") else None,
            "fan_percent": float(fan) if fan not in ("[N/A]", "") else None,
        }
    except Exception:
        return None


def _fans():
    """Motherboard fan RPMs. A 0 RPM entry means the header is empty or the fan is stopped."""
    try:
        groups = psutil.sensors_fans()
    except Exception:
        return None
    fans = [{"id": f"{chip}-{e.label or 'fan' + str(i)}", "rpm": int(e.current)}
            for chip, entries in groups.items() for i, e in enumerate(entries, 1)]
    return fans or None


def _cpu_temp():
    try:
        temps = psutil.sensors_temperatures()
    except Exception:
        return None
    for key in ("coretemp", "k10temp", "cpu_thermal"):
        for entry in temps.get(key, []):
            if "package" in (entry.label or "").lower() or entry.label in ("Tctl", "Tdie"):
                return round(entry.current, 1)
        if temps.get(key):
            return round(max(e.current for e in temps[key]), 1)
    return None


def _disks():
    seen, out = set(), []
    for p in psutil.disk_partitions(all=False):
        if p.device in seen or p.fstype not in ("ext4", "xfs", "btrfs", "ntfs", "exfat", "zfs", "f2fs"):
            continue
        if p.mountpoint.startswith(("/boot", "/snap", "/var/lib/docker", "/var/snap")):
            continue
        try:
            u = psutil.disk_usage(p.mountpoint)
        except Exception:
            continue
        seen.add(p.device)
        out.append({"mount": p.mountpoint, "device": p.device, "percent": round(u.percent, 1), "used": u.used, "free": u.free, "total": u.total})
    return out


def _network_rate():
    n = psutil.net_io_counters()
    now = time.time()
    dt = max(now - _last_net["t"], 0.001)
    rate = {"rx_bps": max(0, (n.bytes_recv - _last_net["rx"]) / dt), "tx_bps": max(0, (n.bytes_sent - _last_net["tx"]) / dt)}
    _last_net.update(t=now, rx=n.bytes_recv, tx=n.bytes_sent)
    return rate


def _ignored_containers():
    try:
        lines = IGNORED_FILE.read_text().splitlines()
    except OSError:
        return set()
    return {ln.split("#", 1)[0].strip().lstrip("/") for ln in lines if ln.split("#", 1)[0].strip()}


def _containers_summary():
    if not _docker:
        return {"running": 0, "total": 0, "problems": []}
    try:
        items = _docker.containers.list(all=True)
    except Exception:
        return {"running": 0, "total": 0, "problems": []}
    ignored = _ignored_containers()
    items = [c for c in items if c.name not in ignored]  # ignored ones don't count as problems or in the totals
    problems = []
    for c in items:
        health = (c.attrs.get("State", {}).get("Health") or {}).get("Status")
        if c.status != "running" or health == "unhealthy":
            problems.append({"name": c.name, "status": c.status, "health": health})
    return {"running": sum(1 for c in items if c.status == "running"), "total": len(items), "problems": problems}


def _tailscale():
    out = run(["tailscale", "status", "--json"], timeout=4)
    if not out:
        return {"available": False, "peers": [], "online": 0, "total": 0}
    try:
        data = json.loads(out)
    except Exception:
        return {"available": False, "peers": [], "online": 0, "total": 0}
    peers = []
    for p in (data.get("Peer") or {}).values():
        peers.append({
            "name": p.get("HostName"), "os": p.get("OS"), "online": bool(p.get("Online")),
            "ip": (p.get("TailscaleIPs") or [None])[0], "last_seen": p.get("LastSeen"), "exit_node": bool(p.get("ExitNode")),
        })
    peers.sort(key=lambda x: (not x["online"], (x["name"] or "").lower()))
    me = data.get("Self") or {}
    return {
        "available": True, "self": {"name": me.get("HostName"), "ip": (me.get("TailscaleIPs") or [None])[0]},
        "peers": peers, "online": sum(1 for p in peers if p["online"]), "total": len(peers),
    }


@router.get("/overview")
async def overview():
    mem = psutil.virtual_memory()
    swap = psutil.swap_memory()
    freq = psutil.cpu_freq()
    return {
        "time": time.time(),
        "hostname": socket.gethostname(),
        "uptime_s": int(time.time() - psutil.boot_time()),
        "load": [round(x, 2) for x in os.getloadavg()],
        "cpu": {"percent": psutil.cpu_percent(interval=None), "cores": psutil.cpu_count(),
                "temp_c": cached("cputemp", 2, _cpu_temp), "freq_mhz": round(freq.current) if freq else None},
        "memory": {"percent": mem.percent, "used": mem.used, "total": mem.total, "swap_percent": swap.percent},
        "gpu": cached("gpu", 2, _gpu),
        "fans": cached("fans", 2, _fans),
        "disks": cached("disks", 20, _disks),
        "network": _network_rate(),
        "containers": cached("csum", 4, _containers_summary),
        "tailscale": cached("tailscale", 8, _tailscale),
    }


# ---------------------------------------------------------------- /services

GROUPS = [
    {"id": "ai", "label": "AI"},
    {"id": "infra", "label": "Infrastructure"},
    {"id": "home", "label": "Home"},
    {"id": "files", "label": "Apps & Files"},
    {"id": "games", "label": "Games"},
    {"id": "other", "label": "Other"},
    {"id": "background", "label": "Background services"},
]

# (regex on "name image", display name, group, default ports to probe for host-network containers)
RULES = [
    (r"open-?webui", "Open WebUI", "ai", []),
    (r"ollama", "Ollama", "ai", []),
    (r"portainer", "Portainer", "infra", []),
    (r"cosmos-mongo|mongo", "Cosmos DB", "background", []),
    (r"cosmos", "Cosmos", "infra", [80, 443]),
    (r"adguard", "AdGuard Home", "infra", [3000, 80]),
    (r"beszel-agent", "Beszel Agent", "background", []),
    (r"beszel", "Beszel", "infra", [8090]),
    (r"coolercontrol", "CoolerControl", "infra", []),
    (r"portracker", "Portracker", "infra", []),
    (r"speedtest.*db|speedtest-tracker-db", "Speedtest DB", "background", []),
    (r"speedtest", "Speedtest Tracker", "infra", []),
    (r"nextcloud-db|mariadb|mysql|postgres", "Database", "background", []),
    (r"nextcloud", "Nextcloud", "files", []),
    (r"home-?assistant", "Home Assistant", "home", [8123]),
    (r"homebridge", "Homebridge", "home", [8581]),
    (r"crafty", "Crafty (Minecraft)", "games", []),
    (r"playit", "playit.gg Tunnel", "background", []),
    (r"chromium", "Chromium", "files", []),
    (r"^server_container|ubuntu", "Ubuntu Sandbox", "background", []),
]

# Which published container port is "the web UI"? First match wins.
WEB_PRIORITY = [443, 8443, 9443, 80, 8080, 3000, 3001, 5000, 8000, 8081, 8096, 8123, 8581, 8090, 11987, 4999, 9000]
NOT_WEB = {3306, 5432, 27017, 6379, 19132, 24454, 25565, 25575, 8000 + 0}
HTTPS_PORTS = {443, 8443, 9443}


def _pretty(name: str) -> str:
    name = re.sub(r"^big-bear-", "", name)
    name = re.sub(r"-\d+$", "", name)
    return name.replace("_", " ").replace("-", " ").title()


def _pick_web_port(ports: dict):
    """ports looks like {'8080/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '8080'}], ...}"""
    published = {}
    for cport, maps in (ports or {}).items():
        if not cport.endswith("/tcp") or not maps:
            continue
        try:
            published[int(cport.split("/")[0])] = int(maps[0]["HostPort"])
        except Exception:
            continue
    for cp in WEB_PRIORITY:
        if cp in published:
            return published[cp], "https" if cp in HTTPS_PORTS else "http"
    candidates = sorted(hp for cp, hp in published.items() if cp not in NOT_WEB and not (25500 <= hp <= 25600))
    return (candidates[0], "http") if candidates else (None, "http")


def _load_overrides():
    try:
        return json.loads(OVERRIDES_FILE.read_text())
    except Exception:
        return {}


def _build_service(c, overrides):
    image = c.image.tags[0] if c.image.tags else str(c.attrs.get("Config", {}).get("Image", ""))
    key = f"{c.name} {image}".lower()
    display, group, probes = _pretty(c.name), "other", []
    for pattern, d_name, d_group, d_probes in RULES:
        if re.search(pattern, key):
            display, group, probes = d_name, d_group, d_probes
            break
    port, scheme = _pick_web_port(c.ports)
    host_net = c.attrs.get("HostConfig", {}).get("NetworkMode") == "host"
    if port is None and host_net:
        for p in probes:
            if tcp_latency_ms("127.0.0.1", p, 0.3) is not None:
                port, scheme = p, "https" if p in HTTPS_PORTS and p != 443 else "http"
                break
    ov = overrides.get(c.name, {})
    display = ov.get("name", display)
    group = ov.get("group", group)
    probe_port = ov.get("probe_port", port)
    port = ov.get("port", port)
    scheme = ov.get("scheme", scheme)
    health = (c.attrs.get("State", {}).get("Health") or {}).get("Status")
    return {
        "id": c.id[:12], "container": c.name, "name": display, "group": "background" if ov.get("hide") else group,
        "image": image.split("/")[-1], "status": c.status, "health": health,
        "port": port, "probe_port": probe_port, "scheme": scheme, "path": ov.get("path", ""),
    }


# Apps that run straight on this machine under systemd (not in Docker), so the container scan can't see them.
# They get the same card as a container: green when the unit is active and its port answers.
HOST_APPS = [
    {"id": "gods-eye-view", "unit": "gods-eye-view", "name": "God's Eye View", "group": "files", "port": 4173},
]


def _host_apps():
    out = []
    for app in HOST_APPS:
        active = (run(["systemctl", "is-active", app["unit"]]) or "").strip() == "active"
        out.append({
            "id": app["id"], "container": f'{app["unit"]}.service', "name": app["name"], "group": app["group"],
            "image": "systemd service", "status": "running" if active else "exited", "health": None,
            "port": app["port"], "scheme": "http", "path": "",
        })
    return out


def _services():
    overrides = _load_overrides()
    services = ([_build_service(c, overrides) for c in _docker.containers.list(all=True)] if _docker else []) + _host_apps()
    with ThreadPoolExecutor(max_workers=16) as pool:
        lat = list(pool.map(lambda s: tcp_latency_ms("127.0.0.1", s.get("probe_port") or s["port"]) if (s["port"] and s["status"] == "running") else None, services))
    for s, ms in zip(services, lat):
        s["latency_ms"] = ms
        s["reachable"] = ms is not None
    # Two containers with the same display name (e.g. two Open WebUI copies): tell them apart by port.
    names = [s["name"] for s in services]
    for s in services:
        if names.count(s["name"]) > 1:
            s["name"] = f'{s["name"]} :{s["port"]}' if s["port"] else f'{s["name"]} ({s["container"]})'
    order = {g["id"]: i for i, g in enumerate(GROUPS)}
    services.sort(key=lambda s: (order.get(s["group"], 99), s["name"].lower()))
    return services


@router.get("/services")
async def services():
    return {"generated": time.time(), "groups": GROUPS, "services": cached("services", 5, _services)}
