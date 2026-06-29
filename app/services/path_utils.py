"""Path normalization for API responses."""

from __future__ import annotations

from pathlib import Path

from app.config import PROJECT_ROOT


def normalize_project_path(path: str | None, allowed_prefixes: tuple[str, ...] = ("images/", "prompts/", "raw/")) -> str | None:
    """Convert absolute or messy paths to project-relative form."""
    if not path:
        return None
    normalized = path.replace("\\", "/")
    for prefix in allowed_prefixes:
        if normalized.startswith(prefix):
            return normalized
    try:
        rel = Path(path).resolve().relative_to(PROJECT_ROOT.resolve())
        rel_str = str(rel).replace("\\", "/")
        if any(rel_str.startswith(p) for p in allowed_prefixes):
            return rel_str
    except ValueError:
        pass
    for prefix in allowed_prefixes:
        idx = normalized.find(prefix)
        if idx >= 0:
            return normalized[idx:]
    return None


def absolute_project_path(rel_path: str | None) -> str | None:
    if not rel_path:
        return None
    if rel_path.startswith("/"):
        return rel_path
    return str((PROJECT_ROOT / rel_path).resolve())
