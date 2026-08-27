"""Settings API — view and update runtime configuration."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import settings_service

router = APIRouter(prefix="/settings", tags=["settings"])


class SettingsUpdate(BaseModel):
    """Partial update. Omit secrets to leave them unchanged; empty string clears."""

    values: dict[str, Any] = Field(default_factory=dict)


class ConnectionTestResult(BaseModel):
    ok: bool
    detail: str


@router.get("")
def get_settings() -> dict[str, Any]:
    return settings_service.get_settings_public()


@router.put("")
def put_settings(body: SettingsUpdate) -> dict[str, Any]:
    try:
        return settings_service.update_settings(body.values)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/test/kie", response_model=ConnectionTestResult)
def test_kie() -> ConnectionTestResult:
    result = settings_service.test_kie_connection()
    return ConnectionTestResult(**result)


@router.post("/test/r2", response_model=ConnectionTestResult)
def test_r2() -> ConnectionTestResult:
    result = settings_service.test_r2_connection()
    return ConnectionTestResult(**result)
