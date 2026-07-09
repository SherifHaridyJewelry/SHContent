"""Per-output catalog review persistence with in-process cache."""

from __future__ import annotations

import threading

from app.db.engine import get_session
from app.db.repositories.reviews import ReviewRepository
from app.services.path_utils import normalize_project_path

VALID_STATUSES = frozenset({"approved", "rejected"})

_lock = threading.Lock()
_cache: dict[str, dict] | None = None
_cache_valid = False


def _normalize_output(output_path: str) -> str | None:
    return normalize_project_path(output_path, allowed_prefixes=("images/",))


def _invalidate_cache() -> None:
    global _cache_valid
    _cache_valid = False


def load_reviews() -> dict[str, dict]:
    global _cache, _cache_valid
    with _lock:
        if _cache_valid and _cache is not None:
            return dict(_cache)
        with get_session() as session:
            _cache = ReviewRepository(session).all_reviews()
        _cache_valid = True
        return dict(_cache)


def get_review(output_path: str) -> dict | None:
    normalized = _normalize_output(output_path)
    if not normalized:
        return None
    with _lock:
        if _cache_valid and _cache is not None:
            return _cache.get(normalized)
    with get_session() as session:
        return ReviewRepository(session).get(normalized)


def get_review_status(output_path: str) -> str | None:
    normalized = _normalize_output(output_path)
    if not normalized:
        return None
    with _lock:
        if _cache_valid and _cache is not None:
            entry = _cache.get(normalized)
            return entry.get("status") if entry else None
    with get_session() as session:
        return ReviewRepository(session).get_status(normalized)


def set_review(
    output_path: str,
    status: str,
    *,
    product_id: str | None = None,
    task_id: str | None = None,
) -> dict:
    normalized = _normalize_output(output_path)
    if not normalized:
        raise ValueError(f"Invalid output path: {output_path}")
    if status not in VALID_STATUSES:
        raise ValueError(f"Invalid review status: {status}")

    with get_session() as session:
        result = ReviewRepository(session).set_review(
            normalized,
            status,
            product_id=product_id,
            task_id=task_id,
        )
    with _lock:
        if _cache is not None:
            _cache[normalized] = {
                "status": result["status"],
                "reviewed_at": result["reviewed_at"],
                "product_id": product_id,
                "task_id": task_id,
            }
        _cache_valid = True
    from app.services import catalog_index

    catalog_index.invalidate()
    return result


def clear_review(output_path: str) -> bool:
    normalized = _normalize_output(output_path)
    if not normalized:
        return False
    with get_session() as session:
        cleared = ReviewRepository(session).clear(normalized)
    if cleared:
        with _lock:
            if _cache is not None and normalized in _cache:
                del _cache[normalized]
        from app.services import catalog_index

        catalog_index.invalidate()
    return cleared


def all_reviews() -> dict[str, dict]:
    return load_reviews()
