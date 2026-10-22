"""
Home Assistant endpoint (read only).

/homeassistant -> what the Home Assistant page needs: whether it is set up, Home Assistant's version and name, and
                  a plain list of devices and sensors with their current state.

Setup: create a long-lived access token in Home Assistant (your profile -> Security) and put it in this
backend's .env as HOME_ASSISTANT_TOKEN= (HOME_ASSISTANT_URL= is optional, default http://127.0.0.1:8123), then
restart the backend. Until then the endpoint answers {"configured": false} so the page can explain how.

This dashboard has no login, so the view is deliberately limited:
  * read only: nothing here can switch, lock or change anything;
  * only the friendly name, state, unit and device class are passed on, never other attributes;
  * sensitive kinds of entity are left out entirely: door locks, phone / person locations, cameras, alarm
    panels, and anything else listed in HA_HIDDEN_DOMAINS (comma separated, adds to the built-in list).
The token itself is never returned.
"""
import html
import json
import os
import time
import urllib.error
import urllib.request

from fastapi import APIRouter

from app.core.config import settings

router = APIRouter()

HIDDEN_DOMAINS = {"lock", "device_tracker", "person", "camera", "alarm_control_panel"} | {
    d.strip() for d in os.environ.get("HA_HIDDEN_DOMAINS", "").split(",") if d.strip()
}
MAX_ENTITIES = 1000
CACHE_TTL = 5

_cache = {"at": 0.0, "value": None}


def _base_url() -> str:
    return (settings.HOME_ASSISTANT_URL or "http://127.0.0.1:8123").rstrip("/")


def _get(path: str, token: str, timeout: float = 5):
    req = urllib.request.Request(f"{_base_url()}{path}", headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.load(resp)


# Home Assistant's plain state list doesn't say which device an entity belongs to, but its read-only template
# feature can look that up. This fixed text is the only template ever sent (nothing from a caller goes into it).
_DEVICE_TEMPLATE = """{% set ns = namespace(items=[]) %}
{% for s in states %}{% set d = device_id(s.entity_id) %}{% if d %}
{% set ns.items = ns.items + [[s.entity_id, d, device_attr(d,'name_by_user') or device_attr(d,'name') or '', device_attr(d,'manufacturer') or '', device_attr(d,'model') or '']] %}
{% endif %}{% endfor %}{{ ns.items | tojson }}"""


def _device_lookup(token: str) -> dict:
    """entity_id -> {id, name, manufacturer, model}. Empty if the lookup fails: entities just show up ungrouped."""
    try:
        req = urllib.request.Request(
            f"{_base_url()}/api/template",
            data=json.dumps({"template": _DEVICE_TEMPLATE}).encode(),
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            rows = json.loads(resp.read())
    except Exception:
        return {}
    out = {}
    for entity_id, device_id, name, maker, model in rows:
        out[entity_id] = {"id": device_id, "name": html.unescape(name).strip(), "manufacturer": html.unescape(maker).strip(), "model": html.unescape(model).strip()}
    return out


def _snapshot(token: str):
    config = _get("/api/config", token)
    states = _get("/api/states", token, timeout=10)
    lookup = _device_lookup(token)
    entities = []
    hidden = 0
    for s in states:
        entity_id = s.get("entity_id", "")
        domain = entity_id.split(".", 1)[0]
        if domain in HIDDEN_DOMAINS:
            hidden += 1
            continue
        attrs = s.get("attributes") or {}
        entities.append({
            "entity_id": entity_id,
            "domain": domain,
            "name": html.unescape(str(attrs.get("friendly_name") or entity_id)),  # some integrations store "&quot;" literally
            "state": s.get("state"),
            "unit": attrs.get("unit_of_measurement"),
            "device_class": attrs.get("device_class"),
            "changed": s.get("last_changed"),
        })
    entities.sort(key=lambda e: (e["domain"], e["name"].lower()))
    entities = entities[:MAX_ENTITIES]

    # group by device; a device whose entities were all hidden simply never appears
    devices, loose = {}, []
    for e in entities:
        dev = lookup.get(e["entity_id"])
        if not dev:
            loose.append(e)
            continue
        group = devices.setdefault(dev["id"], {
            "id": dev["id"],
            "name": dev["name"] or " ".join(x for x in (dev["manufacturer"], dev["model"]) if x) or "Unnamed device",
            "manufacturer": dev["manufacturer"],
            "model": dev["model"],
            "entities": [],
        })
        group["entities"].append(e)
    device_list = sorted(devices.values(), key=lambda d: d["name"].lower())
    return {
        "configured": True,
        "online": True,
        "version": config.get("version"),
        "name": config.get("location_name"),
        "total": len(states),
        "hidden": hidden,
        "shown": len(entities),
        "truncated": len(states) - hidden > MAX_ENTITIES,
        "devices": device_list,
        "loose": loose,
    }


@router.get("/")
def homeassistant():
    token = settings.HOME_ASSISTANT_TOKEN
    if not token:
        return {"configured": False, "online": False, "url": _base_url()}
    now = time.time()
    if _cache["value"] and now - _cache["at"] < CACHE_TTL:
        return _cache["value"]
    try:
        value = _snapshot(token)
        _cache.update(at=now, value=value)
        return value
    except urllib.error.HTTPError as e:
        why = "Home Assistant rejected the token (401). Create a new one and update .env." if e.code == 401 else f"Home Assistant answered HTTP {e.code}."
    except Exception as e:  # unreachable, timeout, bad JSON...
        why = f"Can't reach Home Assistant at {_base_url()} ({type(e).__name__})."
    return {"configured": True, "online": False, "error": why, "url": _base_url()}
