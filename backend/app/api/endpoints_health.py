"""
Health check endpoints
"""
from fastapi import APIRouter
from app.core.config import settings

router = APIRouter()

@router.get("")
async def health_check():
    return {
        "status": "healthy",
        "project": settings.PROJECT_NAME,
        "version": "0.1.0"
    }

@router.get("/ping")
async def ping():
    return {"message": "pong"}