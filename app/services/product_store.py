"""CRUD for jewelry products via PostgreSQL/SQLite."""

from __future__ import annotations

import re
import shutil
from pathlib import Path

from fastapi import HTTPException, UploadFile

from app.config import PROJECT_ROOT, RAW_JEWELRY_DIR
from app.db.engine import get_session
from app.db.repositories.products import ProductRepository
from app.models.schemas import (
    ImageRole,
    ImportFolderInfo,
    Product,
    ProductBatchResult,
    ProductBatchSkipped,
    ProductCreate,
    ProductImage,
    ProductImportResult,
    ProductMeta,
    ProductStatus,
    ProductType,
    ProductUpdate,
)
from app.services import product_naming
from app.services.path_utils import normalize_project_path

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")


def _ensure_data_dir() -> None:
    RAW_JEWELRY_DIR.mkdir(parents=True, exist_ok=True)


def _product_dir(product_id: str) -> Path:
    return RAW_JEWELRY_DIR / product_id


def _validate_id(product_id: str) -> None:
    if not SLUG_RE.match(product_id):
        raise HTTPException(
            status_code=400,
            detail="Product id must be lowercase alphanumeric with underscores/hyphens",
        )


def _compute_status(images: list[ProductImage]) -> ProductStatus:
    anchors = [i for i in images if i.role == ImageRole.anchor]
    active = [i for i in images if i.role != ImageRole.archived]
    if not active:
        return ProductStatus.draft
    if len(anchors) == 1:
        return ProductStatus.ready
    return ProductStatus.draft


def _filter_products(
    collection: str | None = None,
    status: ProductStatus | None = None,
    product_type: ProductType | None = None,
    generatable: bool = False,
) -> list[Product]:
    with get_session() as session:
        products = ProductRepository(session).list_all()
    if collection:
        products = [p for p in products if p.collection == collection]
    if generatable:
        generatable_statuses = {ProductStatus.ready, ProductStatus.generated}
        products = [p for p in products if p.status in generatable_statuses]
    elif status:
        products = [p for p in products if p.status == status]
    if product_type:
        products = [p for p in products if p.type == product_type]
    return products


def list_products(
    collection: str | None = None,
    status: ProductStatus | None = None,
    product_type: ProductType | None = None,
    generatable: bool = False,
) -> list[Product]:
    return _filter_products(collection, status, product_type, generatable)


def list_products_paginated(
    collection: str | None = None,
    status: ProductStatus | None = None,
    product_type: ProductType | None = None,
    generatable: bool = False,
    page: int = 1,
    page_size: int = 24,
) -> dict:
    products = _filter_products(collection, status, product_type, generatable)
    page_size = max(1, min(page_size, 100))
    total = len(products)
    total_pages = max(1, (total + page_size - 1) // page_size) if total else 1
    if page > total_pages:
        page = total_pages
    if page < 1:
        page = 1
    start = (page - 1) * page_size
    end = start + page_size
    return {
        "items": products[start:end],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


def list_collections() -> list[str]:
    with get_session() as session:
        return ProductRepository(session).list_collections()


def count_by_type() -> dict[str, int]:
    with get_session() as session:
        return ProductRepository(session).count_by_type()


def _counts_by_type_for_statuses(statuses: set[ProductStatus]) -> dict[str, int]:
    with get_session() as session:
        return ProductRepository(session).count_by_type_for_statuses(statuses)


def get_product_meta() -> ProductMeta:
    with get_session() as session:
        repo = ProductRepository(session)
        generatable_statuses = {ProductStatus.ready, ProductStatus.generated}
        return ProductMeta(
            collections=repo.list_collections(),
            counts_by_type=repo.count_by_type(),
            counts_by_type_ready=repo.count_by_type_for_statuses({ProductStatus.ready}),
            counts_by_type_generatable=repo.count_by_type_for_statuses(generatable_statuses),
            total=repo.total_count(),
            ids=sorted(repo.all_ids()),
        )


def _all_ids() -> set[str]:
    with get_session() as session:
        return ProductRepository(session).all_ids()


def _persist_product(product: Product) -> Product:
    with get_session() as session:
        return ProductRepository(session).save(product)


def _save_upload_to_product(
    product: Product,
    upload: UploadFile,
    role: ImageRole,
) -> ProductImage:
    product_dir = _product_dir(product.id)
    product_dir.mkdir(parents=True, exist_ok=True)

    filename = Path(upload.filename or "image.jpg").name
    dest = product_dir / filename
    if dest.exists():
        stem = dest.stem
        suffix = dest.suffix
        n = 1
        while dest.exists():
            dest = product_dir / f"{stem}_{n}{suffix}"
            n += 1
        filename = dest.name

    with open(dest, "wb") as f:
        shutil.copyfileobj(upload.file, f)

    rel_path = str(dest.relative_to(PROJECT_ROOT))
    image = ProductImage(filename=filename, path=rel_path, role=role)
    product.images.append(image)
    return image


def get_product(product_id: str) -> Product:
    with get_session() as session:
        product = ProductRepository(session).get(product_id)
    if not product:
        raise HTTPException(status_code=404, detail=f"Product not found: {product_id}")
    return product


def create_product(data: ProductCreate) -> Product:
    _validate_id(data.id)
    _ensure_data_dir()
    with get_session() as session:
        repo = ProductRepository(session)
        if repo.get(data.id):
            raise HTTPException(status_code=409, detail=f"Product already exists: {data.id}")

    product_dir = _product_dir(data.id)
    product_dir.mkdir(parents=True, exist_ok=True)

    product = Product(
        id=data.id,
        name=data.name,
        type=data.type,
        collection=data.collection,
        status=ProductStatus.draft,
        images=[],
    )
    return _persist_product(product)


def update_product(product_id: str, data: ProductUpdate) -> Product:
    product = get_product(product_id)
    if data.name is not None:
        product.name = data.name
    if data.type is not None:
        product.type = data.type
    if data.collection is not None:
        product.collection = data.collection
    if data.status is not None:
        product.status = data.status
    if data.clear_review_status:
        product.review_status = None
    elif data.review_status is not None:
        product.review_status = data.review_status
    if data.status is None:
        product.status = _compute_status(product.images)
    return _persist_product(product)


def delete_product(product_id: str) -> None:
    with get_session() as session:
        deleted = ProductRepository(session).delete(product_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Product not found: {product_id}")


def add_image(
    product_id: str,
    upload: UploadFile,
    role: ImageRole = ImageRole.analysis_only,
) -> Product:
    product = get_product(product_id)
    _save_upload_to_product(product, upload, role)
    product.status = _compute_status(product.images)
    return _persist_product(product)


def delete_image(product_id: str, filename: str) -> Product:
    product = get_product(product_id)
    found_idx = None
    for i, img in enumerate(product.images):
        if img.filename == filename:
            found_idx = i
            break
    if found_idx is None:
        raise HTTPException(status_code=404, detail=f"Image not found: {filename}")

    img = product.images.pop(found_idx)
    file_path = PROJECT_ROOT / img.path
    if file_path.exists() and file_path.is_file():
        file_path.unlink()

    product.status = _compute_status(product.images)
    return _persist_product(product)


def update_image_role(product_id: str, filename: str, role: ImageRole) -> Product:
    product = get_product(product_id)
    found = False
    for img in product.images:
        if img.filename == filename:
            img.role = role
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail=f"Image not found: {filename}")

    if role == ImageRole.anchor:
        for img in product.images:
            if img.filename != filename and img.role == ImageRole.anchor:
                img.role = ImageRole.analysis_only

    product.status = _compute_status(product.images)
    return _persist_product(product)


def set_last_job(product_id: str, job_id: str, output: str | None = None) -> Product:
    product = get_product(product_id)
    product.last_job_id = job_id
    if output:
        normalized = normalize_project_path(output, allowed_prefixes=("images/",)) or output
        prev = (
            normalize_project_path(product.last_output, allowed_prefixes=("images/",))
            if product.last_output
            else None
        )
        if prev != normalized:
            product.review_status = None
        product.last_output = normalized
        product.status = ProductStatus.generated
    return _persist_product(product)


def set_canonical_output(product_id: str, output_path: str | None) -> Product:
    product = get_product(product_id)
    if output_path:
        normalized = normalize_project_path(output_path, allowed_prefixes=("images/",))
        if not normalized:
            raise HTTPException(status_code=400, detail=f"Invalid output path: {output_path}")
        product.approved_output = normalized
    else:
        product.approved_output = None
    return save_product(product)


def clear_all_canonical_outputs() -> int:
    """Clear hero (approved_output) on every product. Keep/Reject reviews stay intact."""
    from app.services import catalog_index

    cleared = 0
    with get_session() as session:
        repo = ProductRepository(session)
        for product in repo.list_all():
            if not product.approved_output and not product.review_status:
                continue
            product.approved_output = None
            product.review_status = None
            repo.save(product)
            cleared += 1
    catalog_index.invalidate()
    return cleared


def sync_review_status_from_canonical(product: Product) -> Product:
    from app.services import review_store

    if not product.approved_output:
        product.review_status = None
    else:
        product.review_status = review_store.get_review_status(product.approved_output)
    return product


def save_product(product: Product) -> Product:
    product = sync_review_status_from_canonical(product)
    return _persist_product(product)


def resolve_pipeline_paths(product: Product, max_generation_refs: int = 2) -> dict:
    active = [img for img in product.images if img.role != ImageRole.archived]
    if not active:
        raise HTTPException(status_code=400, detail=f"No images for product {product.id}")

    all_paths = [PROJECT_ROOT / img.path for img in active]

    gen_images = [img for img in active if img.role in (ImageRole.anchor, ImageRole.detail)]
    gen_images.sort(key=lambda i: 0 if i.role == ImageRole.anchor else 1)
    gen_images = gen_images[:max_generation_refs]
    generation_paths = [PROJECT_ROOT / img.path for img in gen_images]

    analysis_images = [
        img
        for img in active
        if img.role in (ImageRole.anchor, ImageRole.detail, ImageRole.analysis_only)
    ]
    analysis_paths = [PROJECT_ROOT / img.path for img in analysis_images]

    anchors = [img for img in active if img.role == ImageRole.anchor]
    if len(anchors) != 1:
        raise HTTPException(
            status_code=400,
            detail=f"Product {product.id} needs exactly one anchor image (has {len(anchors)})",
        )

    for p in all_paths:
        if not p.exists():
            raise HTTPException(status_code=400, detail=f"Missing image file: {p}")

    return {
        "image_paths": all_paths,
        "generation_paths": generation_paths,
        "analysis_paths": analysis_paths,
    }


def _group_batch_uploads(
    files: list[UploadFile],
    paths: list[str],
    mode: str,
) -> dict[str, list[tuple[UploadFile, str]]]:
    groups: dict[str, list[tuple[UploadFile, str]]] = {}
    for i, upload in enumerate(files):
        path = paths[i] if i < len(paths) else (upload.filename or f"file_{i}")
        path = path.replace("\\", "/")
        if mode == "one_per_folder" and "/" in path:
            key = path.split("/")[0]
        else:
            key = path.split("/")[-1] if path else f"file_{i}"
        if not product_naming.is_image_file(key):
            key = path
        groups.setdefault(key, []).append((upload, path))
    return groups


def batch_create_products(
    product_type: ProductType,
    collection: str | None,
    mode: str,
    files: list[UploadFile],
    paths: list[str],
    assign_anchor: bool = True,
    overrides: list[dict] | None = None,
) -> ProductBatchResult:
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    override_map = {o["key"]: o for o in (overrides or []) if o.get("key")}
    groups = _group_batch_uploads(files, paths, mode)
    existing_ids = _all_ids()
    reserved_ids: set[str] = set(existing_ids)
    created: list[Product] = []
    skipped: list[ProductBatchSkipped] = []
    errors: list[str] = []

    for key, uploads in sorted(groups.items()):
        image_uploads = [
            (u, p) for u, p in uploads if product_naming.is_image_file(u.filename or p)
        ]
        if not image_uploads:
            skipped.append(ProductBatchSkipped(key=key, reason="No image files in group"))
            continue

        ov = override_map.get(key, {})
        product_id = ov.get("id")
        if product_id:
            _validate_id(product_id)
            if product_id in reserved_ids:
                errors.append(f"Duplicate id: {product_id}")
                continue
        else:
            product_id = product_naming.next_product_id(reserved_ids, product_type.value)

        reserved_ids.add(product_id)
        fallback_name = product_naming.name_from_type_and_id(product_type.value, product_id)
        first_filename = image_uploads[0][0].filename or key
        product_name = ov.get("name") or product_naming.name_from_filename(
            first_filename, fallback_name
        )

        try:
            product_dir = _product_dir(product_id)
            product_dir.mkdir(parents=True, exist_ok=True)
            product = Product(
                id=product_id,
                name=product_name,
                type=product_type,
                collection=collection,
                status=ProductStatus.draft,
                images=[],
            )

            for idx, (upload, _) in enumerate(image_uploads):
                role = ImageRole.anchor if (assign_anchor and idx == 0) else ImageRole.analysis_only
                upload.file.seek(0)
                _save_upload_to_product(product, upload, role)

            product.status = _compute_status(product.images)
            _persist_product(product)
            created.append(product)
        except Exception as e:
            errors.append(f"{key}: {e}")

    return ProductBatchResult(created=created, skipped=skipped, errors=errors)


def scan_orphan_folders() -> list[ImportFolderInfo]:
    _ensure_data_dir()
    known = _all_ids()
    orphans: list[ImportFolderInfo] = []
    if not RAW_JEWELRY_DIR.exists():
        return orphans
    for subdir in sorted(RAW_JEWELRY_DIR.iterdir()):
        if not subdir.is_dir() or subdir.name in known:
            continue
        images = [
            p for p in subdir.iterdir() if p.is_file() and product_naming.is_image_file(p.name)
        ]
        if images:
            orphans.append(ImportFolderInfo(folder_id=subdir.name, image_count=len(images)))
    return orphans


def import_orphan_folders(
    folder_ids: list[str],
    product_type: ProductType,
    collection: str | None,
) -> ProductImportResult:
    if not folder_ids:
        raise HTTPException(status_code=400, detail="No folder_ids provided")

    known = _all_ids()
    reserved = set(known)
    created: list[Product] = []
    errors: list[str] = []

    for folder_id in folder_ids:
        folder_path = RAW_JEWELRY_DIR / folder_id
        if not folder_path.is_dir():
            errors.append(f"Folder not found: {folder_id}")
            continue
        if folder_id in known:
            errors.append(f"Already registered: {folder_id}")
            continue

        images = sorted(
            p for p in folder_path.iterdir() if p.is_file() and product_naming.is_image_file(p.name)
        )
        if not images:
            errors.append(f"No images in {folder_id}")
            continue

        product_id = (
            folder_id
            if SLUG_RE.match(folder_id)
            else product_naming.slugify_folder_name(folder_id)
        )
        if product_id in reserved:
            product_id = product_naming.next_product_id(reserved, product_type.value)
        reserved.add(product_id)

        product_name = product_naming.name_from_type_and_id(product_type.value, product_id)
        product = Product(
            id=product_id,
            name=product_name,
            type=product_type,
            collection=collection,
            status=ProductStatus.draft,
            images=[],
        )

        for idx, img_path in enumerate(images):
            role = ImageRole.anchor if idx == 0 else ImageRole.analysis_only
            rel_path = str(img_path.relative_to(PROJECT_ROOT))
            product.images.append(
                ProductImage(filename=img_path.name, path=rel_path, role=role)
            )

        product.status = _compute_status(product.images)
        _persist_product(product)
        created.append(product)

    return ProductImportResult(created=created, errors=errors)
