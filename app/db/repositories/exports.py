"""Catalog export job persistence."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import CatalogExportRow
from app.models.schemas import (
    CatalogExportCounts,
    CatalogExportFilters,
    CatalogExportJob,
    CatalogExportScope,
    CatalogExportStatus,
)


def _row_to_job(row: CatalogExportRow) -> CatalogExportJob:
    filters = CatalogExportFilters(**row.filters) if row.filters else None
    return CatalogExportJob(
        id=row.id,
        status=CatalogExportStatus(row.status),
        scope=CatalogExportScope(row.scope),
        filters=filters,
        output_paths=list(row.output_paths or []),
        counts=CatalogExportCounts(**(row.counts or {})),
        zip_path=row.zip_path,
        error=row.error,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


class ExportRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, export_id: str) -> CatalogExportJob | None:
        row = self.session.get(CatalogExportRow, export_id)
        return _row_to_job(row) if row else None

    def list_paginated(self, page: int, page_size: int) -> tuple[list[CatalogExportJob], int]:
        total = self.session.scalar(select(func.count()).select_from(CatalogExportRow)) or 0
        rows = self.session.scalars(
            select(CatalogExportRow)
            .order_by(CatalogExportRow.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        return [_row_to_job(row) for row in rows], total

    def save(self, job: CatalogExportJob) -> CatalogExportJob:
        row = self.session.get(CatalogExportRow, job.id)
        if row is None:
            row = CatalogExportRow(id=job.id)
            self.session.add(row)
        row.status = job.status.value
        row.scope = job.scope.value
        row.filters = job.filters.model_dump() if job.filters else None
        row.output_paths = job.output_paths
        row.counts = job.counts.model_dump()
        row.zip_path = job.zip_path
        row.error = job.error
        row.created_at = job.created_at
        row.updated_at = job.updated_at
        self.session.flush()
        return _row_to_job(row)
