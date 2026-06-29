"""Orchestrate per-output reviews with product canonical output."""

from __future__ import annotations

from fastapi import HTTPException

from app.models.schemas import CatalogReviewResult, ReviewStatus
from app.services import product_store, review_store
from app.services.path_utils import normalize_project_path


def _normalize_output(output_path: str) -> str:
    normalized = normalize_project_path(output_path, allowed_prefixes=("images/",))
    if not normalized:
        raise HTTPException(status_code=400, detail=f"Invalid output path: {output_path}")
    return normalized


def apply_review(
    output_path: str,
    status: ReviewStatus,
    *,
    set_canonical: bool = True,
    product_id: str | None = None,
    task_id: str | None = None,
) -> CatalogReviewResult:
    normalized = _normalize_output(output_path)

    if status == ReviewStatus.pending:
        review_store.clear_review(normalized)
        product = None
        is_canonical = False
        if product_id:
            product = product_store.get_product(product_id)
            if product.approved_output == normalized:
                product = product_store.set_canonical_output(product_id, None)
            is_canonical = False
        return CatalogReviewResult(
            output_path=normalized,
            status=None,
            product_id=product_id,
            is_canonical=is_canonical,
            product=product,
        )

    review = review_store.set_review(
        normalized,
        status.value,
        product_id=product_id,
        task_id=task_id,
    )

    product = None
    is_canonical = False
    if product_id:
        product = product_store.get_product(product_id)
        if status == ReviewStatus.approved and set_canonical:
            product = product_store.set_canonical_output(product_id, normalized)
            is_canonical = True
        elif status == ReviewStatus.rejected and product.approved_output == normalized:
            product = product_store.set_canonical_output(product_id, None)
        elif product.approved_output == normalized:
            is_canonical = True
        product = product_store.save_product(product)

    return CatalogReviewResult(
        output_path=normalized,
        status=review["status"],
        reviewed_at=review.get("reviewed_at"),
        product_id=product_id,
        is_canonical=is_canonical,
        product=product,
    )


def set_canonical(product_id: str, output_path: str) -> CatalogReviewResult:
    normalized = _normalize_output(output_path)
    review = review_store.get_review(normalized)
    if not review or review.get("status") != "approved":
        raise HTTPException(
            status_code=400,
            detail="Only approved outputs can be set as canonical",
        )

    product = product_store.set_canonical_output(product_id, normalized)
    product = product_store.save_product(product)

    return CatalogReviewResult(
        output_path=normalized,
        status=review.get("status"),
        reviewed_at=review.get("reviewed_at"),
        product_id=product_id,
        is_canonical=True,
        product=product,
    )
