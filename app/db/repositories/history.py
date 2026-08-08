"""Generation history persistence."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import HistoryEntryRow
from app.models.schemas import HistoryEntry

_KNOWN_FIELDS = {
    "task_id",
    "timestamp",
    "state",
    "prompt_file",
    "output_file",
    "aspect_ratio",
    "resolution",
    "template",
    "pipeline",
    "job_id",
    "image_url",
    "product_urls",
    "output_r2_url",
    "completed_at",
    "review_status",
}


def _row_to_entry(row: HistoryEntryRow, review_status: str | None = None) -> HistoryEntry:
    return HistoryEntry(
        task_id=row.task_id,
        timestamp=row.timestamp,
        state=row.state,
        prompt_file=row.prompt_file,
        output_file=row.output_file,
        aspect_ratio=row.aspect_ratio,
        resolution=row.resolution,
        template=row.template,
        pipeline=row.pipeline,
        job_id=row.job_id,
        image_url=row.image_url,
        product_urls=list(row.product_urls or []),
        output_r2_url=row.output_r2_url,
        review_status=review_status,
        extra=dict(row.metadata_json or {}),
    )


class HistoryRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list_all(self) -> list[HistoryEntryRow]:
        return list(
            self.session.scalars(
                select(HistoryEntryRow).order_by(HistoryEntryRow.timestamp)
            ).all()
        )

    def list_filtered(
        self,
        *,
        state: str | None = None,
        template: str | None = None,
        pipeline_only: bool = False,
    ) -> list[HistoryEntryRow]:
        query = select(HistoryEntryRow)
        if template:
            query = query.where(HistoryEntryRow.template == template)
        if state:
            query = query.where(HistoryEntryRow.state == state)
        if pipeline_only:
            query = query.where(HistoryEntryRow.pipeline.is_(True))
        return list(self.session.scalars(query.order_by(HistoryEntryRow.timestamp)).all())

    def get(self, task_id: str) -> HistoryEntryRow | None:
        return self.session.get(HistoryEntryRow, task_id)

    def has_success_task(self, task_id: str) -> bool:
        row = self.session.get(HistoryEntryRow, task_id)
        return row is not None and row.state == "success"

    def upsert(self, entry: dict) -> HistoryEntryRow:
        task_id = entry.get("task_id", "")
        known = {k: entry.get(k) for k in _KNOWN_FIELDS if k in entry}
        extra = {k: v for k, v in entry.items() if k not in _KNOWN_FIELDS and k != "metadata"}
        row = self.session.get(HistoryEntryRow, task_id)
        if row is None:
            row = HistoryEntryRow(task_id=task_id)
            self.session.add(row)
        row.timestamp = known.get("timestamp") or entry.get("timestamp") or row.timestamp or ""
        row.state = known.get("state") or entry.get("state") or row.state or ""
        row.prompt_file = known.get("prompt_file")
        row.output_file = known.get("output_file")
        row.aspect_ratio = known.get("aspect_ratio")
        row.resolution = known.get("resolution")
        row.template = known.get("template")
        row.pipeline = known.get("pipeline")
        row.job_id = known.get("job_id")
        row.image_url = known.get("image_url")
        row.product_urls = list(known.get("product_urls") or [])
        row.output_r2_url = known.get("output_r2_url")
        row.completed_at = known.get("completed_at")
        row.metadata_json = extra
        self.session.flush()
        return row

    def count(self) -> int:
        return self.session.scalar(select(func.count()).select_from(HistoryEntryRow)) or 0
