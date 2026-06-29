"""Product CRUD and image upload endpoints."""

from __future__ import annotations

import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.models.schemas import (
    ImageRole,
    ImageRoleUpdate,
    ImportFolderInfo,
    PaginatedResponse,
    Product,
    ProductBatchResult,
    ProductCreate,
    ProductImportRequest,
    ProductImportResult,
    ProductMeta,
    ProductStatus,
    ProductType,
    ProductUpdate,
)
from app.services import product_store

router = APIRouter(prefix="/products", tags=["products"])


@router.get("/meta", response_model=ProductMeta)
def get_product_meta() -> ProductMeta:
    return product_store.get_product_meta()


@router.get("/import/scan", response_model=list[ImportFolderInfo])
def scan_import_folders() -> list[ImportFolderInfo]:
    return product_store.scan_orphan_folders()


@router.post("/import", response_model=ProductImportResult)
def import_folders(data: ProductImportRequest) -> ProductImportResult:
    return product_store.import_orphan_folders(
        data.folder_ids, data.type, data.collection
    )


@router.post("/batch", response_model=ProductBatchResult)
async def batch_create_products(
    type: ProductType = Form(...),
    collection: str = Form(...),
    mode: str = Form("one_per_file"),
    assign_anchor: bool = Form(True),
    overrides: str = Form("[]"),
    files: list[UploadFile] = File(...),
    paths: list[str] = Form(default=[]),
) -> ProductBatchResult:
    if mode not in ("one_per_file", "one_per_folder"):
        raise HTTPException(status_code=400, detail="mode must be one_per_file or one_per_folder")
    try:
        override_list = json.loads(overrides) if overrides else []
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid overrides JSON: {e}") from e
    return product_store.batch_create_products(
        product_type=type,
        collection=collection.strip() or None,
        mode=mode,
        files=files,
        paths=paths,
        assign_anchor=assign_anchor,
        overrides=override_list,
    )


@router.get("", response_model=PaginatedResponse[Product])
def list_products(
    collection: str | None = None,
    status: ProductStatus | None = None,
    type: ProductType | None = None,
    generatable: bool = False,
    page: int = 1,
    page_size: int = 24,
) -> PaginatedResponse[Product]:
    result = product_store.list_products_paginated(
        collection=collection,
        status=status,
        product_type=type,
        generatable=generatable,
        page=page,
        page_size=page_size,
    )
    return PaginatedResponse[Product](**result)


@router.get("/{product_id}", response_model=Product)
def get_product(product_id: str) -> Product:
    return product_store.get_product(product_id)


@router.post("", response_model=Product, status_code=201)
def create_product(data: ProductCreate) -> Product:
    return product_store.create_product(data)


@router.patch("/{product_id}", response_model=Product)
def update_product(product_id: str, data: ProductUpdate) -> Product:
    return product_store.update_product(product_id, data)


@router.delete("/{product_id}", status_code=204)
def delete_product(product_id: str) -> None:
    product_store.delete_product(product_id)


@router.post("/{product_id}/images", response_model=Product)
async def upload_image(
    product_id: str,
    file: UploadFile = File(...),
    role: ImageRole = Form(ImageRole.analysis_only),
) -> Product:
    return product_store.add_image(product_id, file, role=role)


@router.patch("/{product_id}/images/{filename}", response_model=Product)
def patch_image_role(
    product_id: str,
    filename: str,
    data: ImageRoleUpdate,
) -> Product:
    return product_store.update_image_role(product_id, filename, data.role)


@router.delete("/{product_id}/images/{filename}", response_model=Product)
def delete_image(product_id: str, filename: str) -> Product:
    return product_store.delete_image(product_id, filename)
