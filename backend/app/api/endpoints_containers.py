"""
Container management endpoints (Docker)
"""
import docker
from fastapi import APIRouter, HTTPException
from typing import List, Optional

router = APIRouter()

# Initialize Docker client
try:
    client = docker.from_env()
except Exception as e:
    client = None
    print(f"Warning: Could not connect to Docker daemon: {e}")

@router.get("")
async def list_containers(all: bool = False):
    """List all containers"""
    if not client:
        raise HTTPException(status_code=503, detail="Docker daemon not available")

    try:
        containers = client.containers.list(all=all)
        return [
            {
                "id": c.id[:12],
                "name": c.name,
                "image": c.image.tags[0] if c.image.tags else c.image.id[:12],
                "status": c.status,
                "ports": c.ports,
                "created": c.attrs["Created"]
            }
            for c in containers
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{container_id}")
async def get_container(container_id: str):
    """Get details for a specific container"""
    if not client:
        raise HTTPException(status_code=503, detail="Docker daemon not available")

    try:
        container = client.containers.get(container_id)
        return {
            "id": container.id,
            "name": container.name,
            "image": container.image.tags[0] if container.image.tags else container.image.id[:12],
            "status": container.status,
            "ports": container.ports,
            "created": container.attrs["Created"],
            "state": container.attrs["State"],
            # Config and NetworkSettings are left out on purpose: Config holds every environment variable (passwords, keys)
        }
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Container not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Read-only on purpose: this dashboard has no login, so start/stop/restart/delete routes were removed.
# Real container control lives in Portainer / the Docker CLI.

# Raw container logs were removed: use the Logs page / /api/v1/logs, which hides secrets.

@router.get("/images")
async def list_images():
    """List Docker images"""
    if not client:
        raise HTTPException(status_code=503, detail="Docker daemon not available")

    try:
        images = client.images.list()
        return [
            {
                "id": img.id[:12],
                "tags": img.tags,
                "size": img.size,
                "created": img.attrs["Created"]
            }
            for img in images
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))