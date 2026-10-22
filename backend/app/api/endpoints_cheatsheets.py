"""
Cheat sheet endpoints: serve markdown files from the cheat sheet folder
"""
import os
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException

router = APIRouter()

CHEATSHEET_DIR = Path(
    os.environ.get("CHEATSHEET_DIR", os.path.expanduser("~/homelab/cheatsheets"))
).resolve()

# Lowercase letters, digits, dashes and underscores only. No dots or slashes.
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")
FRONT_MATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n?", re.DOTALL)


def _split_front_matter(text: str):
    """Return (metadata dict, body) for a markdown file with optional simple front matter."""
    meta = {}
    match = FRONT_MATTER_RE.match(text)
    if match:
        for line in match.group(1).splitlines():
            if ":" in line:
                key, value = line.split(":", 1)
                meta[key.strip().lower()] = value.strip()
        text = text[match.end():]
    return meta, text


def _sheet_files():
    if not CHEATSHEET_DIR.is_dir():
        return []
    return sorted(
        p for p in CHEATSHEET_DIR.glob("*.md")
        if p.is_file() and SLUG_RE.match(p.stem)
    )


@router.get("")
async def list_cheatsheets():
    sheets = []
    for path in _sheet_files():
        meta, _ = _split_front_matter(path.read_text(encoding="utf-8", errors="replace"))
        sheets.append({
            "slug": path.stem,
            "title": meta.get("title") or path.stem.replace("-", " ").title(),
            "service": meta.get("service", ""),
            "summary": meta.get("summary", ""),
            "updated": int(path.stat().st_mtime),
        })
    return {"directory": str(CHEATSHEET_DIR), "sheets": sheets}


@router.get("/{slug}")
async def get_cheatsheet(slug: str):
    if not SLUG_RE.match(slug):
        raise HTTPException(status_code=404, detail="Cheat sheet not found")
    path = (CHEATSHEET_DIR / f"{slug}.md").resolve()
    if path.parent != CHEATSHEET_DIR or not path.is_file():
        raise HTTPException(status_code=404, detail="Cheat sheet not found")
    meta, body = _split_front_matter(path.read_text(encoding="utf-8", errors="replace"))
    return {
        "slug": slug,
        "title": meta.get("title") or slug.replace("-", " ").title(),
        "service": meta.get("service", ""),
        "summary": meta.get("summary", ""),
        "updated": int(path.stat().st_mtime),
        "content": body,
    }
