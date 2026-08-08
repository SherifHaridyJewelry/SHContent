"""Scene plate job persistence."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import ScenePlateJobRow
from app.models.schemas import ScenePlateJob, ScenePlateJobStatus

ACTIVE_STATUSES = {ScenePlateJobStatus.pending, ScenePlateJobStatus.generating}


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


def _row_to_job(row: ScenePlateJobRow) -> ScenePlateJob:
    return ScenePlateJob(
        id=row.id,
        template=row.template,
        status=ScenePlateJobStatus(row.status),
        plates=list(row.plates or []),
        created_at=row.created_at,
        updated_at=row.updated_at,
        error=row.error,
    )


class ScenePlateRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, job_id: str) -> ScenePlateJob | None:
        row = self.session.get(ScenePlateJobRow, job_id)
        return _row_to_job(row) if row else None

    def list_recent(self, limit: int = 50) -> list[ScenePlateJob]:
        rows = self.session.scalars(
            select(ScenePlateJobRow).order_by(ScenePlateJobRow.created_at.desc()).limit(limit)
        ).all()
        return [_row_to_job(row) for row in rows]

    def list_by_statuses(self, statuses: set[ScenePlateJobStatus]) -> list[ScenePlateJob]:
        status_values = {s.value for s in statuses}
        rows = self.session.scalars(
            select(ScenePlateJobRow)
            .where(ScenePlateJobRow.status.in_(status_values))
            .order_by(ScenePlateJobRow.updated_at.desc())
        ).all()
        return [_row_to_job(row) for row in rows]

    def save(self, job: ScenePlateJob) -> ScenePlateJob:
        row = self.session.get(ScenePlateJobRow, job.id)
        if row is None:
            row = ScenePlateJobRow(id=job.id)
            self.session.add(row)
        row.template = job.template
        row.status = job.status.value
        row.plates = job.plates
        row.created_at = job.created_at
        row.updated_at = job.updated_at
        row.error = job.error
        self.session.flush()
        return _row_to_job(row)
