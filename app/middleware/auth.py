"""API key auth middleware for production."""

from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import APP_ENV

EXEMPT_PREFIXES = (
    "/api/health",
    "/docs",
    "/openapi.json",
    "/redoc",
)


def _effective_api_key() -> str:
    """Prefer runtime settings override; fall back to process env."""
    try:
        from app.services.settings_service import get_effective

        return (get_effective("API_KEY") or "").strip()
    except Exception:
        import os

        return (os.getenv("API_KEY") or "").strip()


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        api_key = _effective_api_key()
        if APP_ENV == "development" or not api_key:
            return await call_next(request)

        path = request.url.path
        if any(path == prefix or path.startswith(f"{prefix}/") for prefix in EXEMPT_PREFIXES):
            return await call_next(request)

        if path.startswith("/api/assets/images/"):
            return await call_next(request)

        auth = request.headers.get("Authorization", "")
        if auth == f"Bearer {api_key}":
            return await call_next(request)

        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
