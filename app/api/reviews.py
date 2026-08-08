"""Catalog output review endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from app.models.schemas import CatalogReviewResult, CatalogReviewUpdate, SetCanonicalRequest
from app.services import review_service

router = APIRouter(prefix="/catalog/review", tags=["catalog-review"])


@router.patch("", response_model=CatalogReviewResult)
def update_catalog_review(data: CatalogReviewUpdate) -> CatalogReviewResult:
    return review_service.apply_review(
        data.output_path,
        data.status,
        set_canonical=data.set_canonical,
        product_id=data.product_id,
        task_id=data.task_id,
    )


@router.post("/set-canonical", response_model=CatalogReviewResult)
def set_canonical_output(data: SetCanonicalRequest) -> CatalogReviewResult:
    return review_service.set_canonical(data.product_id, data.output_path)
