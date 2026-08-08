"""Path normalization for API responses and DATA_ROOT-aware storage."""

from __future__ import annotations

from pathlib import Path

from app.config import DATA_ROOT, PROJECT_ROOT


def storage_roots() -> tuple[Path, ...]:
    """Prefer DATA_ROOT, then PROJECT_ROOT (legacy / local default)."""
    roots: list[Path] = [DATA_ROOT.resolve()]
    project = PROJECT_ROOT.resolve()
    if project != roots[0]:
        roots.append(project)
    return tuple(roots)


def to_relative_storage_path(path: Path) -> str:
    """Store paths relative to DATA_ROOT (or PROJECT_ROOT fallback)."""
    resolved = path.resolve()
    for root in storage_roots():
        try:
            return str(resolved.relative_to(root)).replace("\\", "/")
        except ValueError:
            continue
    raise ValueError(f"Path outside storage roots: {path}")


def resolve_storage_path(rel_path: str | Path) -> Path:
    """Resolve a stored relative path, preferring an existing file under DATA_ROOT."""
    normalized = str(rel_path).replace("\\", "/").lstrip("/")
    preferred = (DATA_ROOT / normalized).resolve()
    try:
        preferred.relative_to(DATA_ROOT.resolve())
    except ValueError as exc:
        raise ValueError(f"Invalid storage path: {rel_path}") from exc

    for root in storage_roots():
        candidate = (root / normalized).resolve()
        try:
            candidate.relative_to(root)
        except ValueError:
            continue
        if candidate.exists():
            return candidate
    return preferred


def normalize_project_path(
    path: str | None,
    allowed_prefixes: tuple[str, ...] = ("images/", "prompts/", "raw/"),
) -> str | None:
    """Convert absolute or messy paths to project-relative form."""
    if not path:
        return None
    normalized = path.replace("\\", "/")
    for prefix in allowed_prefixes:
        if normalized.startswith(prefix):
            return normalized
    try:
        rel_str = to_relative_storage_path(Path(path))
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
    return str(resolve_storage_path(rel_path))
