"""
God's Eye View endpoint.

/godseye -> what the God's Eye View tile needs: is the app up, how many ships are being tracked worldwide
            and the one nearest home, how many satellite fire detections there are worldwide, how many
            are within 300 km of home, and the strongest one.

Everything is read from the God's Eye View app on this same machine (GEV_URL, default
http://127.0.0.1:4173), never from the internet, so this endpoint adds no outbound traffic of its own.
The fire feed is ~28 MB, so it is fetched at most once every 10 minutes (the app itself caches it for 30)
and only the summary is kept. If the app is down the endpoint still answers with {"online": false, ...}
so the dashboard can show a calm "offline" state.

"Home" is the weather location from assistant_tools (WEATHER_LAT / WEATHER_LON, default Kansas City, Missouri).

Settings (environment variables): GEV_URL, GEV_PUBLIC_PORT (the port the browser link uses, default 4173).
"""
import json
import math
import os
import threading
import time
import urllib.request

from fastapi import APIRouter

router = APIRouter()

GEV_URL = os.environ.get("GEV_URL", "http://127.0.0.1:4173").rstrip("/")
GEV_PUBLIC_PORT = int(os.environ.get("GEV_PUBLIC_PORT", "4173"))
HOME_LAT = float(os.environ.get("WEATHER_LAT", "39.0997"))
HOME_LON = float(os.environ.get("WEATHER_LON", "-94.5786"))
NEAR_KM = 300
STRONG_FRP_MW = float(os.environ.get("GEV_STRONG_FRP_MW", "20"))  # fire radiative power that counts as significant

SHIPS_TTL = 60
FIRES_TTL = 600
ERROR_TTL = 30  # a failed fetch is retried soon instead of being remembered for the full TTL

_cache = {}
_lock = threading.Lock()


def _get_json(path: str, timeout: float):
    with urllib.request.urlopen(f"{GEV_URL}{path}", timeout=timeout) as resp:
        return json.load(resp)


def _km(lat1, lon1, lat2, lon2) -> float:
    """Great-circle distance in km (haversine)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(a))


def _compass(lat1, lon1, lat2, lon2) -> str:
    """Which way point 2 lies from point 1, as N / NE / E / ..."""
    p1, p2, dl = math.radians(lat1), math.radians(lat2), math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    bearing = (math.degrees(math.atan2(y, x)) + 360) % 360
    return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][int((bearing + 22.5) // 45) % 8]


def _remember(key: str, ttl: float, fn):
    """Cache fn() for ttl seconds; if it raises, remember the error briefly and return it as {"error": ...}."""
    now = time.time()
    with _lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < hit[1]:
            return hit[2]
        # one fetch at a time per key: holding the lock also stops a pile-up of 28 MB downloads
        try:
            value, keep = fn(), ttl
        except Exception as e:
            value, keep = {"error": f"{type(e).__name__}: {e}"[:160]}, ERROR_TTL
        _cache[key] = (now, keep, value)
        return value


def _ships():
    data = _get_json("/api/vessels?maxRows=12000", timeout=20)
    rows = data.get("rows") or []
    nearest = None
    for r in rows:
        try:
            d = _km(HOME_LAT, HOME_LON, float(r["lat"]), float(r["lon"]))
        except (KeyError, TypeError, ValueError):
            continue
        if nearest is None or d < nearest[0]:
            nearest = (d, r)
    out = {
        "count": len(rows),
        "capped": len(rows) >= 12000,  # the app was asked for at most 12000 rows
        "feed_status": data.get("status"),
        "newest_position": data.get("newestPositionAt"),
        "nearest": None,
    }
    if nearest:
        d, r = nearest
        out["nearest"] = {"name": (r.get("name") or "").strip() or "unnamed vessel", "km": round(d)}
    return out


def _fires():
    data = _get_json("/api/firms", timeout=60)
    rows = data.get("fires") or []
    near = 0
    nearest_km = None
    strong_nearest = None
    strongest = None
    for r in rows:
        try:
            lat, lon = float(r["lat"]), float(r["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        d = _km(HOME_LAT, HOME_LON, lat, lon)
        if d <= NEAR_KM:
            near += 1
        if nearest_km is None or d < nearest_km:
            nearest_km = d
        frp = r.get("frp")
        # Most detections near home are small farm or brush burns (median ~5 MW), so alerts look only at
        # "significant" ones: strong enough and not flagged low-confidence by the satellite.
        if (isinstance(frp, (int, float)) and frp >= STRONG_FRP_MW and r.get("confidence") != "l"
                and (strong_nearest is None or d < strong_nearest["km"])):
            strong_nearest = {
                "km": round(d), "dir": _compass(HOME_LAT, HOME_LON, lat, lon), "frp_mw": round(frp, 1),
                "lat": round(lat, 2), "lon": round(lon, 2), "date": r.get("acqDate"),
            }
        if isinstance(frp, (int, float)) and (strongest is None or frp > strongest["frp_mw"]):
            strongest = {"frp_mw": round(frp, 1), "lat": round(lat, 2), "lon": round(lon, 2), "date": r.get("acqDate")}
    return {
        "count": len(rows),
        "near_count": near,
        "near_km": NEAR_KM,
        "nearest_km": round(nearest_km) if nearest_km is not None else None,
        "strong_nearest": strong_nearest,
        "strong_min_mw": STRONG_FRP_MW,
        "strongest": strongest,
        "satellites_ok": sum(1 for s in data.get("sources") or [] if s.get("ok")),
        "satellites_total": len(data.get("sources") or []),
        "fetched_at": data.get("fetchedAt"),
        "stale": bool(data.get("stale")),
    }


def _up() -> bool:
    try:
        with urllib.request.urlopen(f"{GEV_URL}/", timeout=1.5) as resp:
            return resp.status == 200
    except Exception:
        return False


@router.get("/")
def godseye():
    online = _up()
    base = {"online": online, "port": GEV_PUBLIC_PORT, "home": {"lat": HOME_LAT, "lon": HOME_LON}}
    if not online:
        return {**base, "ships": None, "fires": None}
    # a plain `def` route runs in a worker thread, so these slow first fetches do not block other requests
    return {
        **base,
        "ships": _remember("ships", SHIPS_TTL, _ships),
        "fires": _remember("fires", FIRES_TTL, _fires),
    }
