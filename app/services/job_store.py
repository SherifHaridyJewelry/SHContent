"""Job state persistence and in-memory cache."""

from __future__ import annotations

import json
import sys
import threading
import uuid
from datetime import datetime, timezone

from app.config import JOBS_FILE, SCRIPTS_DIR
from app.models.schemas import Job, JobCreate, JobProductResult, JobStatus

if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from naming import build_output_name  # noqa: E402

_lock = threading.Lock()
_jobs: dict[str, Job] = {}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_loaded() -> None:
    global _jobs
    if _jobs:
        return
    JOBS_FILE.parent.mkdir(parents=True, exist_ok=True)
    if JOBS_FILE.exists():
        raw = json.loads(JOBS_FILE.read_text(encoding="utf-8"))
        _jobs = {j["id"]: Job(**j) for j in raw}


def _persist() -> None:
    JOBS_FILE.parent.mkdir(parents=True, exist_ok=True)
    data = [j.model_dump() for j in sorted(_jobs.values(), key=lambda x: x.created_at, reverse=True)]
    JOBS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def create_job(
    data: JobCreate,
    output_prefix: str,
    template_key: str,
    category: str = "jewelry",
) -> Job:
    with _lock:
        _ensure_loaded()
        job_id = str(uuid.uuid4())[:8]
        products = [
            JobProductResult(
                product_id=pid,
                output_name=build_output_name(output_prefix, pid, template_key, job_id),
                run_id=job_id,
                selected_ref_url=(
                    data.product_refs.get(pid)
                    if data.reference_mode == "product"
                    else None
                ),
            )
            for pid in data.product_ids
        ]
        now = _now()
        job = Job(
            id=job_id,
            status=JobStatus.pending,
            template=data.template,
            workflow=data.workflow,
            analyze=data.analyze,
            category=category,
            output_prefix=output_prefix,
            product_ids=data.product_ids,
            products=products,
            reference_mode=data.reference_mode,
            selected_ref_url=data.selected_ref_url,
            created_at=now,
            updated_at=now,
        )
        _jobs[job_id] = job
        _persist()
        return job


def get_job(job_id: str) -> Job | None:
    with _lock:
        _ensure_loaded()
        return _jobs.get(job_id)


def list_jobs(limit: int = 50) -> list[Job]:
    with _lock:
        _ensure_loaded()
        jobs = sorted(_jobs.values(), key=lambda j: j.created_at, reverse=True)
        return jobs[:limit]


def list_jobs_paginated(page: int = 1, page_size: int = 25) -> dict:
    with _lock:
        _ensure_loaded()
        jobs = sorted(_jobs.values(), key=lambda j: j.created_at, reverse=True)
        page_size = max(1, min(page_size, 100))
        total = len(jobs)
        total_pages = max(1, (total + page_size - 1) // page_size) if total else 1
        if page > total_pages:
            page = total_pages
        if page < 1:
            page = 1
        start = (page - 1) * page_size
        end = start + page_size
        return {
            "items": jobs[start:end],
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
        }


def update_job(job: Job) -> Job:
    with _lock:
        _ensure_loaded()
        job.updated_at = _now()
        _jobs[job.id] = job
        _persist()
        return job


def update_job_status(job_id: str, status: JobStatus, error: str | None = None) -> Job | None:
    job = get_job(job_id)
    if not job:
        return None
    job.status = status
    if error:
        job.error = error
    return update_job(job)


def update_product_result(job_id: str, product_id: str, **kwargs) -> Job | None:
    job = get_job(job_id)
    if not job:
        return None
    for p in job.products:
        if p.product_id == product_id:
            for k, v in kwargs.items():
                setattr(p, k, v)
            break
    return update_job(job)
