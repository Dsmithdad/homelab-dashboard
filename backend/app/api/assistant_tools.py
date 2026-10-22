"""
Read-only tools the chat assistant (qwen) may ask for.

Each tool is a plain function with no arguments that returns a small JSON-able dict. TOOL_SPECS is the menu
in the format Ollama expects, and run_tool() is the only way the model's requests reach this code, so the
model can do nothing that isn't listed here. Nothing in this file changes anything on the server.

get_weather is the one tool that contacts the internet: it sends only the coordinates below to Open-Meteo
(no account, no key). Everything else reads data the dashboard already collects.

Settings (environment variables): WEATHER_PLACE, WEATHER_LAT, WEATHER_LON, WEATHER_TZ (default: Kansas City, Missouri (example)).
"""
import json
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime

import psutil

from app.api import endpoints_minecraft
from app.api.endpoints_overview import _containers_summary, _cpu_temp, _disks, _docker, _gpu, _ignored_containers, cached

WEATHER_PLACE = os.environ.get("WEATHER_PLACE", "Kansas City, Missouri")
WEATHER_LAT = os.environ.get("WEATHER_LAT", "39.0997")
WEATHER_LON = os.environ.get("WEATHER_LON", "-94.5786")
WEATHER_TZ = os.environ.get("WEATHER_TZ", "America/Chicago")

# WMO weather codes, as Open-Meteo reports them
WEATHER_CODES = {
    0: "clear sky", 1: "mainly clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 48: "freezing fog",
    51: "light drizzle", 53: "drizzle", 55: "heavy drizzle", 56: "freezing drizzle", 57: "heavy freezing drizzle",
    61: "light rain", 63: "rain", 65: "heavy rain", 66: "freezing rain", 67: "heavy freezing rain",
    71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains",
    80: "light rain showers", 81: "rain showers", 82: "violent rain showers", 85: "snow showers", 86: "heavy snow showers",
    95: "thunderstorm", 96: "thunderstorm with hail", 99: "severe thunderstorm with hail",
}


def get_system_stats():
    mem = psutil.virtual_memory()
    return {
        "cpu_percent": psutil.cpu_percent(interval=None),
        "cpu_cores": psutil.cpu_count(),
        "cpu_temp_c": cached("cputemp", 2, _cpu_temp),
        "load_average": [round(x, 2) for x in os.getloadavg()],
        "memory_percent": mem.percent,
        "memory_used_gb": round(mem.used / 2**30, 1),
        "memory_total_gb": round(mem.total / 2**30, 1),
        "uptime_hours": round((time.time() - psutil.boot_time()) / 3600, 1),
        "disks": [{"mount": d["mount"], "percent_used": d["percent"], "free_gb": round(d["free"] / 2**30)}
                  for d in cached("disks", 20, _disks)],
    }


def get_gpu_stats():
    gpu = cached("gpu", 2, _gpu)
    if not gpu:
        return {"error": "GPU stats are unavailable"}
    return {**gpu, "vram_percent": round(100 * gpu["mem_used_mb"] / gpu["mem_total_mb"])}


def get_container_status():
    summary = cached("csum", 4, _containers_summary)
    names = []
    if _docker:
        try:
            ignored = _ignored_containers()  # containers stopped on purpose are left out, same as the dashboard banner
            names = sorted(c.name for c in _docker.containers.list() if c.name not in ignored)
        except Exception:
            pass
    return {**summary, "running_container_names": names}


def get_minecraft_status():
    s = cached("minecraft", 3, endpoints_minecraft._snapshot)
    server = s.get("server") or {}
    return {
        "online": s["online"], "version": s["version"], "join_address": s["address"],
        "players_online": s["players"]["online"], "players_max": s["players"]["max"], "player_names": s["players"]["names"],
        "server_memory_mb": server.get("memory_mb"),
        "server_uptime_hours": round(server["uptime_s"] / 3600, 1) if server.get("uptime_s") else None,
    }


def get_current_time():
    now = datetime.now().astimezone()
    return {"local_time": now.strftime("%A, %B %d, %Y, %I:%M %p"), "timezone": now.tzname()}


def _fetch_weather():
    query = urllib.parse.urlencode({
        "latitude": WEATHER_LAT, "longitude": WEATHER_LON, "timezone": WEATHER_TZ, "forecast_days": 4,
        "temperature_unit": "fahrenheit", "wind_speed_unit": "mph", "precipitation_unit": "inch",
        "current": "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum",
    })
    with urllib.request.urlopen(f"https://api.open-meteo.com/v1/forecast?{query}", timeout=8) as resp:
        data = json.load(resp)
    cur, day = data["current"], data["daily"]
    return {
        "place": WEATHER_PLACE,
        "now": {
            "conditions": WEATHER_CODES.get(cur["weather_code"], "unknown"),
            "temperature_f": cur["temperature_2m"], "feels_like_f": cur["apparent_temperature"],
            "humidity_percent": cur["relative_humidity_2m"], "wind_mph": cur["wind_speed_10m"], "wind_gusts_mph": cur["wind_gusts_10m"],
            "rain_inches_now": cur["precipitation"],
        },
        "forecast": [
            {"date": day["time"][i], "conditions": WEATHER_CODES.get(day["weather_code"][i], "unknown"),
             "high_f": day["temperature_2m_max"][i], "low_f": day["temperature_2m_min"][i],
             "rain_chance_percent": day["precipitation_probability_max"][i], "rain_inches": day["precipitation_sum"][i]}
            for i in range(len(day["time"]))
        ],
    }


def get_weather():
    return cached("weather", 600, _fetch_weather)  # weather moves slowly, so 10 minutes is plenty


# name -> (function, what the model is told it does). The description is how qwen decides when to use it.
TOOLS = {
    "get_system_stats": (get_system_stats, "Live stats for the homelab server: CPU use and temperature, memory, disk space, load and uptime."),
    "get_gpu_stats": (get_gpu_stats, "Live stats for the server's graphics card (RTX 3080): temperature, utilization, VRAM use, power draw."),
    "get_container_status": (get_container_status, "Which Docker containers are running on the server, and whether any are stopped or unhealthy."),
    "get_minecraft_status": (get_minecraft_status, "Whether the Minecraft server is online, which players are on it, its version and join address."),
    "get_current_time": (get_current_time, "The current local date and time on the server."),
    "get_weather": (get_weather, f"The current weather and a 4-day forecast for {WEATHER_PLACE}, in Fahrenheit and miles per hour."),
}

TOOL_SPECS = [
    {"type": "function", "function": {"name": name, "description": desc, "parameters": {"type": "object", "properties": {}}}}
    for name, (_, desc) in TOOLS.items()
]


def run_tool(name: str):
    entry = TOOLS.get(name)
    if not entry:
        return {"error": f"unknown tool: {name}"}
    try:
        return entry[0]()
    except Exception as e:  # a failed lookup becomes a result the model can explain, not a crashed chat
        return {"error": f"{name} failed: {e}"[:200]}
