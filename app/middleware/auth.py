"""API key auth middleware for production."""

from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import API_KEY, APP_ENV

EXEMPT_PREFIXES = (
    "/api/health",
    "/docs",
    "/openapi.json",
    "/redoc",
)


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if APP_ENV == "development" or not API_KEY:
            return await call_next(request)

        path = request.url.path
        if any(path == prefix or path.startswith(f"{prefix}/") for prefix in EXEMPT_PREFIXES):
            return await call_next(request)

        if path.startswith("/api/assets/images/"):
            return await call_next(request)

        auth = request.headers.get("Authorization", "")
        if auth == f"Bearer {API_KEY}":
            return await call_next(request)

        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
