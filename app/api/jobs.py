"""Generation job endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response

from app.models.schemas import Job, JobCreate, PaginatedResponse
from app.services import job_store, pipeline_service

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/active", response_model=list[Job])
def list_active_jobs() -> list[Job]:
    return job_store.list_active_jobs()


@router.get("", response_model=PaginatedResponse[Job])
def list_jobs(page: int = 1, page_size: int = 25) -> PaginatedResponse[Job]:
    result = job_store.list_jobs_paginated(page=page, page_size=page_size)
    return PaginatedResponse[Job](**result)


@router.get("/{job_id}", response_model=Job)
def get_job(job_id: str) -> Job:
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
    return job


@router.post("", response_model=Job, status_code=201)
def create_job(data: JobCreate) -> Job:
    try:
        return pipeline_service.start_job(data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/{job_id}/recover")
def recover_job(job_id: str, response: Response) -> dict:
    try:
        result, status_code = pipeline_service.recover_job(job_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    response.status_code = status_code
    return result


@router.post("/{job_id}/resume")
def resume_job(job_id: str) -> dict:
    try:
        return pipeline_service.resume_job(job_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
