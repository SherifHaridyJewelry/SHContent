"""Job persistence."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.db.models import JobProductRow, JobRow
from app.models.schemas import (
    DEFAULT_GENERATION_MODEL,
    GenerationModel,
    Job,
    JobProductResult,
    JobStatus,
)

ACTIVE_STATUSES = {
    JobStatus.pending,
    JobStatus.uploading,
    JobStatus.analyzing,
    JobStatus.generating,
}


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


def _row_model(row: JobRow) -> GenerationModel:
    raw = getattr(row, "model", None) or DEFAULT_GENERATION_MODEL
    if raw in ("nano-banana-2", "gpt-image-2-image-to-image"):
        return raw  # type: ignore[return-value]
    return DEFAULT_GENERATION_MODEL


def _row_to_job(row: JobRow) -> Job:
    return Job(
        id=row.id,
        status=JobStatus(row.status),
        template=row.template,
        workflow=row.workflow,
        analyze=row.analyze,
        model=_row_model(row),
        category=row.category,
        output_prefix=row.output_prefix,
        product_ids=list(row.product_ids or []),
        products=[
            JobProductResult(
                product_id=p.product_id,
                output_name=p.output_name,
                run_id=p.run_id,
                status=JobStatus(p.status),
                error=p.error,
                task_id=p.task_id,
                output_image=p.output_image,
                output_path=p.output_path,
                prompt_file=p.prompt_file,
                prompt_path=p.prompt_path,
                image_url=p.image_url,
                product_urls=list(p.product_urls or []),
                output_r2_url=p.output_r2_url,
                selected_ref_url=p.selected_ref_url,
                resolved_ref_url=p.resolved_ref_url,
            )
            for p in row.products
        ],
        reference_mode=row.reference_mode,  # type: ignore[arg-type]
        selected_ref_url=row.selected_ref_url,
        created_at=row.created_at,
        updated_at=row.updated_at,
        error=row.error,
    )


def _job_query():
    return select(JobRow).options(selectinload(JobRow.products))


class JobRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, job_id: str) -> Job | None:
        row = self.session.scalar(_job_query().where(JobRow.id == job_id))
        return _row_to_job(row) if row else None

    def list_recent(self, limit: int = 50) -> list[Job]:
        rows = self.session.scalars(
            _job_query().order_by(JobRow.created_at.desc()).limit(limit)
        ).all()
        return [_row_to_job(row) for row in rows]

    def list_paginated(self, page: int, page_size: int) -> tuple[list[Job], int]:
        total = self.session.scalar(select(func.count()).select_from(JobRow)) or 0
        rows = self.session.scalars(
            _job_query()
            .order_by(JobRow.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        return [_row_to_job(row) for row in rows], total

    def list_by_statuses(self, statuses: set[JobStatus]) -> list[Job]:
        status_values = {s.value for s in statuses}
        rows = self.session.scalars(
            _job_query()
            .where(JobRow.status.in_(status_values))
            .order_by(JobRow.updated_at.desc())
        ).all()
        return [_row_to_job(row) for row in rows]

    def create(self, job: Job) -> Job:
        row = JobRow(
            id=job.id,
            status=job.status.value,
            template=job.template,
            workflow=job.workflow,
            analyze=job.analyze,
            model=job.model,
            category=job.category,
            output_prefix=job.output_prefix,
            product_ids=job.product_ids,
            reference_mode=job.reference_mode,
            selected_ref_url=job.selected_ref_url,
            created_at=job.created_at,
            updated_at=job.updated_at,
            error=job.error,
        )
        for product in job.products:
            row.products.append(
                JobProductRow(
                    job_id=job.id,
                    product_id=product.product_id,
                    output_name=product.output_name,
                    run_id=product.run_id,
                    status=product.status.value,
                    error=product.error,
                    task_id=product.task_id,
                    output_image=product.output_image,
                    output_path=product.output_path,
                    prompt_file=product.prompt_file,
                    prompt_path=product.prompt_path,
                    image_url=product.image_url,
                    product_urls=product.product_urls,
                    output_r2_url=product.output_r2_url,
                    selected_ref_url=product.selected_ref_url,
                    resolved_ref_url=product.resolved_ref_url,
                )
            )
        self.session.add(row)
        self.session.flush()
        return _row_to_job(row)

    def save(self, job: Job) -> Job:
        row = self.session.scalar(
            _job_query().where(JobRow.id == job.id)
        )
        if row is None:
            return self.create(job)

        row.status = job.status.value
        row.template = job.template
        row.workflow = job.workflow
        row.analyze = job.analyze
        row.model = job.model
        row.category = job.category
        row.output_prefix = job.output_prefix
        row.product_ids = job.product_ids
        row.reference_mode = job.reference_mode
        row.selected_ref_url = job.selected_ref_url
        row.updated_at = job.updated_at
        row.error = job.error

        existing = {p.product_id: p for p in row.products}
        seen: set[str] = set()
        for product in job.products:
            seen.add(product.product_id)
            prod_row = existing.get(product.product_id)
            if prod_row is None:
                row.products.append(
                    JobProductRow(
                        job_id=job.id,
                        product_id=product.product_id,
                        output_name=product.output_name,
                        run_id=product.run_id,
                        status=product.status.value,
                        error=product.error,
                        task_id=product.task_id,
                        output_image=product.output_image,
                        output_path=product.output_path,
                        prompt_file=product.prompt_file,
                        prompt_path=product.prompt_path,
                        image_url=product.image_url,
                        product_urls=product.product_urls,
                        output_r2_url=product.output_r2_url,
                        selected_ref_url=product.selected_ref_url,
                        resolved_ref_url=product.resolved_ref_url,
                    )
                )
            else:
                prod_row.output_name = product.output_name
                prod_row.run_id = product.run_id
                prod_row.status = product.status.value
                prod_row.error = product.error
                prod_row.task_id = product.task_id
                prod_row.output_image = product.output_image
                prod_row.output_path = product.output_path
                prod_row.prompt_file = product.prompt_file
                prod_row.prompt_path = product.prompt_path
                prod_row.image_url = product.image_url
                prod_row.product_urls = product.product_urls
                prod_row.output_r2_url = product.output_r2_url
                prod_row.selected_ref_url = product.selected_ref_url
                prod_row.resolved_ref_url = product.resolved_ref_url

        for product_id, prod_row in existing.items():
            if product_id not in seen:
                self.session.delete(prod_row)

        self.session.flush()
        return _row_to_job(row)
