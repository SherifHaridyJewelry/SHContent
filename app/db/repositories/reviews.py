"""Catalog review persistence."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import CatalogReviewRow

VALID_STATUSES = frozenset({"approved", "rejected"})


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


class ReviewRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, output_path: str) -> dict | None:
        row = self.session.get(CatalogReviewRow, output_path)
        if not row:
            return None
        return {
            "status": row.status,
            "reviewed_at": row.reviewed_at,
            "product_id": row.product_id,
            "task_id": row.task_id,
        }

    def get_status(self, output_path: str) -> str | None:
        row = self.session.get(CatalogReviewRow, output_path)
        return row.status if row else None

    def get_statuses(self, output_paths: list[str]) -> dict[str, str | None]:
        if not output_paths:
            return {}
        rows = self.session.scalars(
            select(CatalogReviewRow).where(CatalogReviewRow.output_path.in_(output_paths))
        ).all()
        found = {row.output_path: row.status for row in rows}
        return {path: found.get(path) for path in output_paths}

    def set_review(
        self,
        output_path: str,
        status: str,
        *,
        product_id: str | None = None,
        task_id: str | None = None,
    ) -> dict:
        if status not in VALID_STATUSES:
            raise ValueError(f"Invalid review status: {status}")
        reviewed_at = _utc_now()
        row = self.session.get(CatalogReviewRow, output_path)
        if row is None:
            row = CatalogReviewRow(output_path=output_path)
            self.session.add(row)
        row.status = status
        row.reviewed_at = reviewed_at
        row.product_id = product_id
        row.task_id = task_id
        self.session.flush()
        return {
            "output_path": output_path,
            "status": status,
            "reviewed_at": reviewed_at,
            "product_id": product_id,
            "task_id": task_id,
        }

    def clear(self, output_path: str) -> bool:
        row = self.session.get(CatalogReviewRow, output_path)
        if not row:
            return False
        self.session.delete(row)
        return True

    def all_reviews(self) -> dict[str, dict]:
        rows = self.session.scalars(select(CatalogReviewRow)).all()
        return {
            row.output_path: {
                "status": row.status,
                "reviewed_at": row.reviewed_at,
                "product_id": row.product_id,
                "task_id": row.task_id,
            }
            for row in rows
        }

    def counts_by_status(self) -> dict[str, int]:
        rows = self.session.execute(
            select(CatalogReviewRow.status, func.count()).group_by(CatalogReviewRow.status)
        ).all()
        counts = {"approved": 0, "rejected": 0}
        for status, count in rows:
            counts[status] = count
        return counts
