"""
Claude Code status endpoints (reads from the installed `claude` CLI)
"""
import json
import shutil
import subprocess
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class ClaudeStatus(BaseModel):
    installed: bool
    version: Optional[str] = None
    path: Optional[str] = None
    logged_in: bool = False
    auth_method: Optional[str] = None
    email: Optional[str] = None
    org_name: Optional[str] = None
    subscription: Optional[str] = None
    error: Optional[str] = None


def _run(args):
    return subprocess.run(args, capture_output=True, text=True, timeout=15)


@router.get("/status", response_model=ClaudeStatus)
async def get_claude_status():
    """Report whether Claude Code is installed and logged in"""
    path = shutil.which("claude")
    if not path:
        return ClaudeStatus(installed=False, error="claude CLI not found on PATH")

    try:
        version = _run([path, "--version"]).stdout.strip()
        status = ClaudeStatus(installed=True, version=version, path=path)

        # `auth status` exits non-zero when logged out, so don't check returncode
        auth = json.loads(_run([path, "auth", "status"]).stdout or "{}")
        status.logged_in = bool(auth.get("loggedIn"))
        status.auth_method = auth.get("authMethod")
        status.email = auth.get("email")
        status.org_name = auth.get("orgName")
        status.subscription = auth.get("subscriptionType")
        return status
    except (subprocess.TimeoutExpired, json.JSONDecodeError, OSError) as e:
        return ClaudeStatus(installed=True, path=path, error=str(e))


@router.get("/jabs")
def get_recent_jabs(limit: int = 5):
    """The latest playful jabs found in saved chats (loose keyword matching, just for fun)."""
    from app.api import claude_jabs
    from app.api.endpoints_overview import cached
    n = max(1, min(limit, 20))
    return {"jabs": cached(f"claude-jabs-{n}", 30, lambda: claude_jabs.recent_jabs(n))}
