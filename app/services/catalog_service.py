"""Catalog queries backed by catalog_outputs table."""

from __future__ import annotations

import sys
from pathlib import Path

from app.db.engine import get_session
from app.db.repositories.catalog_outputs import CatalogOutputRepository
from app.models.schemas import CatalogItem, CatalogListResponse, CatalogMeta
from app.services import catalog_index
from app.services.path_utils import normalize_project_path

if str(Path(__file__).resolve().parent.parent.parent / "scripts") not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "scripts"))

from naming import format_generation_label  # noqa: E402


def normalize_output_path(path: str | None) -> str | None:
    return normalize_project_path(path, allowed_prefixes=("images/",))


def _row_to_item(row, review_status: str | None, approved_output: str | None) -> CatalogItem:
    output_path = row.output_path
    stem = Path(output_path).stem
    is_canonical = bool(
        approved_output and approved_output == output_path and row.product_id
    )
    output_label = format_generation_label(stem, product_label=row.product_name)
    item_id = f"catalog-{stem}"
    if row.task_id:
        item_id = f"history-{row.task_id}"
    elif row.source == "product":
        item_id = f"product-{row.product_id}-{row.run_id or 'latest'}"

    return CatalogItem(
        id=item_id,
        output_path=output_path,
        product_id=row.product_id,
        product_name=row.product_name,
        product_type=row.product_type,
        collection=row.collection,
        review_status=review_status,
        template=row.template,
        task_id=row.task_id,
        run_id=row.run_id or row.job_id,
        job_id=row.job_id or row.run_id,
        timestamp=row.timestamp,
        source=row.source,
        image_url=row.image_url,
        product_urls=list(row.product_urls or []),
        output_r2_url=row.output_r2_url,
        prompt_path=row.prompt_path,
        is_scene_plate=row.is_scene_plate,
        is_canonical=is_canonical,
        output_label=output_label,
        anchor_path=row.anchor_path,
    )


def list_catalog(
    collection: str | None = None,
    product_type: str | None = None,
    review_status: str | None = None,
    scene_plates_only: bool = False,
    sort: str = "newest",
) -> list[CatalogItem]:
    result = list_catalog_paginated(
        page=1,
        page_size=10_000,
        collection=collection,
        product_type=product_type,
        review_status=review_status,
        scene_plates_only=scene_plates_only,
        sort=sort,
    )
    return result.items


def list_catalog_paginated(
    *,
    page: int = 1,
    page_size: int = 24,
    collection: str | None = None,
    product_type: str | None = None,
    review_status: str | None = None,
    scene_plates_only: bool = False,
    sort: str = "newest",
    include_meta: bool = True,
) -> CatalogListResponse:
    page = max(1, page)
    page_size = max(1, min(page_size, 100))

    cache_key_args = dict(
        page=page,
        page_size=page_size,
        collection=collection or "",
        product_type=product_type or "",
        review_status=review_status or "",
        scene_plates_only=scene_plates_only,
        sort=sort,
        include_meta=include_meta,
    )
    cached = catalog_index.get("catalog_list", **cache_key_args)
    if cached is not None:
        return cached

    with get_session() as session:
        repo = CatalogOutputRepository(session)
        rows, total = repo.list_paginated(
            page=page,
            page_size=page_size,
            collection=collection,
            product_type=product_type,
            review_status=review_status,
            scene_plates_only=scene_plates_only,
            sort=sort,
        )
        meta_dict = repo.meta(
            collection=collection,
            product_type=product_type,
            review_status=review_status,
            scene_plates_only=scene_plates_only,
        ) if include_meta else catalog_meta_from_db(session)
        items = [
            _row_to_item(row, review_status, approved)
            for row, review_status, approved in rows
        ]
    total_pages = max(1, (total + page_size - 1) // page_size) if total else 1
    if page > total_pages:
        page = total_pages

    response = CatalogListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        meta=CatalogMeta(**meta_dict),
    )
    catalog_index.set("catalog_list", response, **cache_key_args)
    return response


def catalog_meta_from_db(session) -> dict:
    return CatalogOutputRepository(session).meta()


def catalog_meta() -> CatalogMeta:
    cached = catalog_index.get("catalog_meta")
    if cached is not None:
        return cached
    with get_session() as session:
        meta = CatalogMeta(**CatalogOutputRepository(session).meta())
    catalog_index.set("catalog_meta", meta)
    return meta


def register_catalog_output(**kwargs) -> None:
    with get_session() as session:
        CatalogOutputRepository(session).register_from_pipeline(**kwargs)
    catalog_index.invalidate()
