"""Product persistence."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.db.models import ProductImageRow, ProductRow
from app.models.schemas import ImageRole, Product, ProductImage, ProductStatus, ProductType


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_product(row: ProductRow) -> Product:
    return Product(
        id=row.id,
        name=row.name,
        type=ProductType(row.type),
        collection=row.collection,
        status=ProductStatus(row.status),
        images=[
            ProductImage(filename=img.filename, path=img.path, role=ImageRole(img.role))
            for img in row.images
        ],
        last_job_id=row.last_job_id,
        last_output=row.last_output,
        approved_output=row.approved_output,
        review_status=row.review_status,
    )


def _product_query():
    return select(ProductRow).options(selectinload(ProductRow.images))


class ProductRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list_all(self) -> list[Product]:
        rows = self.session.scalars(_product_query().order_by(ProductRow.id)).all()
        return [_row_to_product(row) for row in rows]

    def get(self, product_id: str) -> Product | None:
        row = self.session.scalar(_product_query().where(ProductRow.id == product_id))
        return _row_to_product(row) if row else None

    def save(self, product: Product) -> Product:
        row = self.session.get(ProductRow, product.id)
        now = _utc_now()
        if row is None:
            row = ProductRow(
                id=product.id,
                created_at=now,
            )
            self.session.add(row)

        row.name = product.name
        row.type = product.type.value
        row.collection = product.collection
        row.status = product.status.value
        row.last_job_id = product.last_job_id
        row.last_output = product.last_output
        row.approved_output = product.approved_output
        row.review_status = product.review_status
        row.updated_at = now

        existing = {img.filename: img for img in row.images}
        seen: set[str] = set()
        for img in product.images:
            seen.add(img.filename)
            existing_row = existing.get(img.filename)
            if existing_row:
                existing_row.path = img.path
                existing_row.role = img.role.value
            else:
                row.images.append(
                    ProductImageRow(
                        product_id=product.id,
                        filename=img.filename,
                        path=img.path,
                        role=img.role.value,
                    )
                )
        for filename, img_row in existing.items():
            if filename not in seen:
                self.session.delete(img_row)

        self.session.flush()
        return _row_to_product(row)

    def delete(self, product_id: str) -> bool:
        row = self.session.get(ProductRow, product_id)
        if not row:
            return False
        self.session.delete(row)
        return True

    def list_collections(self) -> list[str]:
        rows = self.session.scalars(
            select(ProductRow.collection)
            .where(ProductRow.collection.is_not(None))
            .distinct()
            .order_by(ProductRow.collection)
        ).all()
        return [c for c in rows if c]

    def count_by_type(self) -> dict[str, int]:
        counts = {t.value: 0 for t in ProductType}
        rows = self.session.execute(
            select(ProductRow.type, func.count()).group_by(ProductRow.type)
        ).all()
        for product_type, count in rows:
            counts[product_type] = count
        return counts

    def count_by_type_for_statuses(self, statuses: set[ProductStatus]) -> dict[str, int]:
        counts = {t.value: 0 for t in ProductType}
        status_values = {s.value for s in statuses}
        rows = self.session.execute(
            select(ProductRow.type, func.count())
            .where(ProductRow.status.in_(status_values))
            .group_by(ProductRow.type)
        ).all()
        for product_type, count in rows:
            counts[product_type] = count
        return counts

    def total_count(self) -> int:
        return self.session.scalar(select(func.count()).select_from(ProductRow)) or 0

    def all_ids(self) -> set[str]:
        rows = self.session.scalars(select(ProductRow.id)).all()
        return set(rows)

    def get_anchor_path(self, product_id: str) -> str | None:
        row = self.session.scalar(
            select(ProductImageRow)
            .where(ProductImageRow.product_id == product_id, ProductImageRow.role == "anchor")
            .limit(1)
        )
        if row:
            return row.path
        row = self.session.scalar(
            select(ProductImageRow)
            .where(ProductImageRow.product_id == product_id)
            .order_by(ProductImageRow.filename)
            .limit(1)
        )
        return row.path if row else None
