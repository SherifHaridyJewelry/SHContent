"""Registered catalog output persistence."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db.models import CatalogOutputRow, CatalogReviewRow, ProductRow
from app.services.path_utils import normalize_project_path


def _is_scene_plate_path(path: str) -> bool:
    stem = Path(path).stem
    return stem.startswith("scene_plate_") or stem.startswith("distilled_")


class CatalogOutputRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, output_path: str) -> CatalogOutputRow | None:
        return self.session.get(CatalogOutputRow, output_path)

    def get_r2_url(self, output_path: str) -> str | None:
        row = self.session.get(CatalogOutputRow, output_path)
        return row.output_r2_url if row else None

    def upsert(self, data: dict) -> CatalogOutputRow:
        output_path = data["output_path"]
        row = self.session.get(CatalogOutputRow, output_path)
        if row is None:
            row = CatalogOutputRow(output_path=output_path)
            self.session.add(row)
        for key, value in data.items():
            if key == "output_path" or not hasattr(CatalogOutputRow, key):
                continue
            setattr(row, key, value)
        self.session.flush()
        return row

    def register_from_pipeline(
        self,
        *,
        output_path: str,
        product_id: str | None,
        source: str,
        task_id: str | None,
        template: str | None,
        timestamp: str | None,
        image_url: str | None,
        product_urls: list[str],
        output_r2_url: str | None,
        prompt_path: str | None,
        job_id: str | None,
        run_id: str | None,
        product_name: str | None = None,
        product_type: str | None = None,
        collection: str | None = None,
        anchor_path: str | None = None,
    ) -> CatalogOutputRow:
        normalized = normalize_project_path(output_path, allowed_prefixes=("images/",))
        if not normalized:
            raise ValueError(f"Invalid output path: {output_path}")
        return self.upsert(
            {
                "output_path": normalized,
                "product_id": product_id,
                "source": source,
                "task_id": task_id,
                "template": template,
                "timestamp": timestamp,
                "image_url": image_url,
                "product_urls": product_urls,
                "output_r2_url": output_r2_url,
                "prompt_path": prompt_path,
                "job_id": job_id,
                "run_id": run_id,
                "product_name": product_name,
                "product_type": product_type,
                "collection": collection,
                "anchor_path": anchor_path,
                "is_scene_plate": _is_scene_plate_path(normalized),
            }
        )

    def _base_query(
        self,
        *,
        collection: str | None = None,
        product_type: str | None = None,
        review_status: str | None = None,
        scene_plates_only: bool = False,
    ):
        query = (
            select(
                CatalogOutputRow,
                CatalogReviewRow.status.label("review_status"),
                ProductRow.approved_output.label("approved_output"),
            )
            .outerjoin(
                CatalogReviewRow,
                CatalogReviewRow.output_path == CatalogOutputRow.output_path,
            )
            .outerjoin(ProductRow, ProductRow.id == CatalogOutputRow.product_id)
        )
        if collection:
            query = query.where(CatalogOutputRow.collection == collection)
        if product_type:
            query = query.where(CatalogOutputRow.product_type == product_type)
        if review_status == "pending":
            query = query.where(
                or_(CatalogReviewRow.status.is_(None), CatalogReviewRow.status == "")
            )
        elif review_status:
            query = query.where(CatalogReviewRow.status == review_status)
        if scene_plates_only:
            query = query.where(CatalogOutputRow.is_scene_plate.is_(True))
        return query

    def list_paginated(
        self,
        *,
        page: int,
        page_size: int,
        collection: str | None = None,
        product_type: str | None = None,
        review_status: str | None = None,
        scene_plates_only: bool = False,
        sort: str = "newest",
    ) -> tuple[list[tuple[CatalogOutputRow, str | None, str | None]], int]:
        query = self._base_query(
            collection=collection,
            product_type=product_type,
            review_status=review_status,
            scene_plates_only=scene_plates_only,
        )
        count_query = select(func.count()).select_from(query.subquery())
        total = self.session.scalar(count_query) or 0

        if sort == "oldest":
            query = query.order_by(
                CatalogOutputRow.timestamp.asc().nulls_last(),
                CatalogOutputRow.output_path.asc(),
            )
        elif sort == "name":
            query = query.order_by(
                func.coalesce(CatalogOutputRow.product_name, CatalogOutputRow.output_path).asc()
            )
        else:
            query = query.order_by(
                CatalogOutputRow.timestamp.desc().nulls_last(),
                CatalogOutputRow.output_path.desc(),
            )

        rows = self.session.execute(
            query.offset((page - 1) * page_size).limit(page_size)
        ).all()
        return [(row[0], row[1], row[2]) for row in rows], total

    def meta(
        self,
        *,
        collection: str | None = None,
        product_type: str | None = None,
        review_status: str | None = None,
        scene_plates_only: bool = False,
    ) -> dict:
        query = self._base_query(
            collection=collection,
            product_type=product_type,
            review_status=review_status,
            scene_plates_only=scene_plates_only,
        )
        subq = query.subquery()
        total = self.session.scalar(select(func.count()).select_from(subq)) or 0

        collections = self.session.scalars(
            select(CatalogOutputRow.collection)
            .where(CatalogOutputRow.collection.is_not(None))
            .distinct()
            .order_by(CatalogOutputRow.collection)
        ).all()
        product_types = self.session.scalars(
            select(CatalogOutputRow.product_type)
            .where(CatalogOutputRow.product_type.is_not(None))
            .distinct()
            .order_by(CatalogOutputRow.product_type)
        ).all()

        scene_plate_count = self.session.scalar(
            select(func.count())
            .select_from(CatalogOutputRow)
            .where(CatalogOutputRow.is_scene_plate.is_(True))
        ) or 0

        canonical_count = self.session.scalar(
            select(func.count())
            .select_from(CatalogOutputRow)
            .join(ProductRow, ProductRow.id == CatalogOutputRow.product_id)
            .where(ProductRow.approved_output == CatalogOutputRow.output_path)
        ) or 0

        review_counts = {"pending": 0, "approved": 0, "rejected": 0}
        all_rows = self.session.execute(
            select(CatalogReviewRow.status, func.count())
            .select_from(CatalogOutputRow)
            .outerjoin(
                CatalogReviewRow,
                CatalogReviewRow.output_path == CatalogOutputRow.output_path,
            )
            .group_by(CatalogReviewRow.status)
        ).all()
        pending = self.session.scalar(
            select(func.count())
            .select_from(CatalogOutputRow)
            .outerjoin(
                CatalogReviewRow,
                CatalogReviewRow.output_path == CatalogOutputRow.output_path,
            )
            .where(or_(CatalogReviewRow.status.is_(None), CatalogReviewRow.status == ""))
        ) or 0
        review_counts["pending"] = pending
        for status, count in all_rows:
            if status:
                review_counts[status] = count

        return {
            "collections": [c for c in collections if c],
            "product_types": [t for t in product_types if t],
            "total": total,
            "scene_plate_count": scene_plate_count,
            "canonical_count": canonical_count,
            "counts_by_review": review_counts,
        }

    def list_paths_for_export(
        self,
        *,
        collection: str | None = None,
        product_type: str | None = None,
        review_status: str | None = None,
        scene_plates_only: bool = False,
        sort: str = "newest",
    ) -> list[CatalogOutputRow]:
        query = self._base_query(
            collection=collection,
            product_type=product_type,
            review_status=review_status,
            scene_plates_only=scene_plates_only,
        )
        if sort == "oldest":
            query = query.order_by(
                CatalogOutputRow.timestamp.asc().nulls_last(),
                CatalogOutputRow.output_path.asc(),
            )
        elif sort == "name":
            query = query.order_by(
                func.coalesce(CatalogOutputRow.product_name, CatalogOutputRow.output_path).asc()
            )
        else:
            query = query.order_by(
                CatalogOutputRow.timestamp.desc().nulls_last(),
                CatalogOutputRow.output_path.desc(),
            )
        rows = self.session.execute(query).all()
        return [row[0] for row in rows]

    def get_by_paths(self, output_paths: list[str]) -> dict[str, CatalogOutputRow]:
        if not output_paths:
            return {}
        rows = self.session.scalars(
            select(CatalogOutputRow).where(CatalogOutputRow.output_path.in_(output_paths))
        ).all()
        return {row.output_path: row for row in rows}
