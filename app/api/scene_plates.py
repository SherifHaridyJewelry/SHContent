"""Scene plate job endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.schemas import ScenePlateJob
from app.services import scene_plate_service

router = APIRouter(prefix="/scene-plate-jobs", tags=["scene-plates"])


@router.get("", response_model=list[ScenePlateJob])
def list_scene_plate_jobs(limit: int = 50) -> list[ScenePlateJob]:
    return scene_plate_service.list_jobs(limit=limit)


@router.get("/{job_id}", response_model=ScenePlateJob)
def get_scene_plate_job(job_id: str) -> ScenePlateJob:
    job = scene_plate_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
    return job
