"""
Main API router
"""
from fastapi import APIRouter
from app.api import endpoints_health, endpoints_system, endpoints_containers, endpoints_claude, endpoints_cheatsheets, endpoints_overview, endpoints_ollama, endpoints_minecraft, endpoints_voice, endpoints_logs, endpoints_godseye, endpoints_homeassistant, endpoints_scripts, endpoints_files, endpoints_drives, endpoints_backup

api_router = APIRouter()

# Include routers
api_router.include_router(endpoints_health.router, prefix="/health", tags=["health"])
api_router.include_router(endpoints_system.router, prefix="/system", tags=["system"])
api_router.include_router(endpoints_containers.router, prefix="/containers", tags=["containers"])
api_router.include_router(endpoints_claude.router, prefix="/claude", tags=["claude"])
api_router.include_router(endpoints_cheatsheets.router, prefix="/cheatsheets", tags=["cheatsheets"])
api_router.include_router(endpoints_overview.router, tags=["overview"])
api_router.include_router(endpoints_ollama.router, prefix="/ollama", tags=["ollama"])
api_router.include_router(endpoints_minecraft.router, prefix="/minecraft", tags=["minecraft"])
api_router.include_router(endpoints_voice.router, prefix="/voice", tags=["voice"])
api_router.include_router(endpoints_logs.router, prefix="/logs", tags=["logs"])
api_router.include_router(endpoints_godseye.router, prefix="/godseye", tags=["godseye"])
api_router.include_router(endpoints_homeassistant.router, prefix="/homeassistant", tags=["homeassistant"])
api_router.include_router(endpoints_scripts.router, prefix="/scripts", tags=["scripts"])
api_router.include_router(endpoints_files.router, prefix="/files", tags=["files"])
api_router.include_router(endpoints_drives.router, prefix="/drives", tags=["drives"])
api_router.include_router(endpoints_backup.router, prefix="/backup", tags=["backup"])
