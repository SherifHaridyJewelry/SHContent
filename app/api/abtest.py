"""Bracelet A/B test picker API."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import abtest_service

router = APIRouter(prefix="/abtest", tags=["abtest"])


class AbtestSavePayload(BaseModel):
    entries: list[dict] = Field(default_factory=list)
    round1_winners: list[str] = Field(default_factory=lambda: ["", ""])
    overall_winner: str = ""


@router.get("/manifest")
def get_manifest() -> dict:
    try:
        return abtest_service.load_manifest()
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.post("/save")
def save_results(payload: AbtestSavePayload) -> dict:
    try:
        anchors = abtest_service.load_manifest().get("anchors", {})
    except FileNotFoundError:
        anchors = {
            "bracelet06": "raw/jewelry/bracelet06/IMG_20260629_190436.jpg",
            "bracelet07": "raw/jewelry/bracelet07/IMG_20260629_190105.jpg",
        }
    data = {
        "anchors": anchors,
        "entries": payload.entries,
        "round1_winners": payload.round1_winners,
        "overall_winner": payload.overall_winner,
    }
    abtest_service.save_manifest(data)
    return {"ok": True, "entries": len(payload.entries)}
