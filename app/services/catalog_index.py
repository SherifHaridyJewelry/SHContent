"""Optional in-memory catalog cache with TTL invalidation."""

from __future__ import annotations

import threading
import time
from typing import Any

_lock = threading.Lock()
_cache: dict[str, tuple[float, Any]] = {}
TTL_SECONDS = 30


def _cache_key(prefix: str, **kwargs: Any) -> str:
    parts = [prefix] + [f"{k}={kwargs[k]}" for k in sorted(kwargs)]
    return "|".join(parts)


def get(prefix: str, **kwargs: Any) -> Any | None:
    key = _cache_key(prefix, **kwargs)
    with _lock:
        entry = _cache.get(key)
        if not entry:
            return None
        expires_at, value = entry
        if time.monotonic() > expires_at:
            del _cache[key]
            return None
        return value


def set(prefix: str, value: Any, **kwargs: Any) -> None:
    key = _cache_key(prefix, **kwargs)
    with _lock:
        _cache[key] = (time.monotonic() + TTL_SECONDS, value)


def invalidate() -> None:
    with _lock:
        _cache.clear()
