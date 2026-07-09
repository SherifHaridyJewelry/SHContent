"""Job state persistence with in-memory cache and batched DB writes."""

from __future__ import annotations

import sys
import threading
import uuid
from datetime import datetime, timezone

from app.config import SCRIPTS_DIR
from app.db.engine import get_session
from app.db.repositories.jobs import ACTIVE_STATUSES, JobRepository
from app.models.schemas import Job, JobCreate, JobProductResult, JobStatus

if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from naming import build_output_name  # noqa: E402

_lock = threading.Lock()
_jobs: dict[str, Job] = {}
_dirty_jobs: set[str] = set()
_batch_depth: dict[str, int] = {}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_loaded() -> None:
    global _jobs
    if _jobs:
        return
    with get_session() as session:
        for job in JobRepository(session).list_recent(limit=10_000):
            _jobs[job.id] = job


def _persist_job(job_id: str) -> None:
    job = _jobs.get(job_id)
    if not job:
        return
    with get_session() as session:
        JobRepository(session).save(job)
    _dirty_jobs.discard(job_id)


def _mark_dirty(job_id: str) -> None:
    _dirty_jobs.add(job_id)
    if _batch_depth.get(job_id, 0) == 0:
        _persist_job(job_id)


def begin_batch(job_id: str) -> None:
    with _lock:
        _batch_depth[job_id] = _batch_depth.get(job_id, 0) + 1


def end_batch(job_id: str) -> None:
    with _lock:
        depth = _batch_depth.get(job_id, 0)
        if depth <= 1:
            _batch_depth.pop(job_id, None)
            if job_id in _dirty_jobs:
                _persist_job(job_id)
        else:
            _batch_depth[job_id] = depth - 1


def flush(job_id: str) -> None:
    with _lock:
        if job_id in _dirty_jobs:
            _persist_job(job_id)


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
                    data.product_refs.get(pid) if data.reference_mode == "product" else None
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
        _mark_dirty(job_id)
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


def list_active_jobs() -> list[Job]:
    with _lock:
        _ensure_loaded()
        return [j for j in _jobs.values() if j.status in ACTIVE_STATUSES]


def update_job(job: Job) -> Job:
    with _lock:
        _ensure_loaded()
        job.updated_at = _now()
        _jobs[job.id] = job
        _mark_dirty(job.id)
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
