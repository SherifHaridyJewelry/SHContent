"""Catalog output image endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, RedirectResponse

from app.models.schemas import (
    CatalogExportCreate,
    CatalogExportJob,
    CatalogListResponse,
    CatalogMeta,
    PaginatedResponse,
)
from app.services import catalog_service
from app.services import catalog_export_service

router = APIRouter(prefix="/catalog", tags=["catalog"])


@router.get("/meta", response_model=CatalogMeta)
def get_catalog_meta() -> CatalogMeta:
    return catalog_service.catalog_meta()


@router.get("/download", response_model=None)
def download_catalog_image(output_path: str) -> FileResponse | RedirectResponse:
    return catalog_export_service.download_catalog_image(output_path)


@router.post("/exports", response_model=CatalogExportJob, status_code=201)
def create_catalog_export(data: CatalogExportCreate) -> CatalogExportJob:
    return catalog_export_service.create_export(data)


@router.get("/exports", response_model=PaginatedResponse[CatalogExportJob])
def list_catalog_exports(page: int = 1, page_size: int = 20) -> PaginatedResponse[CatalogExportJob]:
    items, total = catalog_export_service.list_exports(page=page, page_size=page_size)
    total_pages = max(1, (total + page_size - 1) // page_size) if total else 1
    return PaginatedResponse(
        items=items,
        page=page,
        page_size=page_size,
        total=total,
        total_pages=total_pages,
    )


@router.get("/exports/{export_id}", response_model=CatalogExportJob)
def get_catalog_export(export_id: str) -> CatalogExportJob:
    job = catalog_export_service.get_export(export_id)
    if not job:
        raise HTTPException(status_code=404, detail="Export not found")
    return job


@router.get("/exports/{export_id}/download", response_model=None)
def download_catalog_export(export_id: str) -> FileResponse:
    return catalog_export_service.download_export_zip(export_id)


@router.get("", response_model=CatalogListResponse)
def list_catalog(
    page: int = 1,
    page_size: int = 24,
    collection: str | None = None,
    product_type: str | None = None,
    review_status: str | None = None,
    sort: str = "newest",
    scene_plates_only: bool = False,
    exclude_scene_plates: bool = False,
    product_id: str | None = None,
) -> CatalogListResponse:
    return catalog_service.list_catalog_paginated(
        page=page,
        page_size=page_size,
        collection=collection,
        product_type=product_type,
        review_status=review_status,
        sort=sort,
        scene_plates_only=scene_plates_only,
        exclude_scene_plates=exclude_scene_plates,
        product_id=product_id,
    )
