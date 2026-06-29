"""Aggregate catalog output images from products, history, and filesystem."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from app.config import HISTORY_FILE, IMAGES_DIR, PRODUCTS_FILE, PROJECT_ROOT, SCRIPTS_DIR
from app.models.schemas import CatalogItem, CatalogMeta, PaginatedResponse
from app.services.path_utils import normalize_project_path
from app.services import review_store

if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from naming import (  # noqa: E402
    format_generation_label,
    parse_product_id_from_output,
    parse_run_id_from_output,
)

JEWELRY_IMAGES_DIR = IMAGES_DIR / "jewelry"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def normalize_output_path(path: str | None) -> str | None:
    """Convert absolute or messy paths to project-relative images/jewelry/..."""
    return normalize_project_path(path, allowed_prefixes=("images/",))


def _load_products() -> list[dict]:
    if not PRODUCTS_FILE.exists():
        return []
    return json.loads(PRODUCTS_FILE.read_text(encoding="utf-8"))


def _load_history() -> list[dict]:
    if not HISTORY_FILE.exists():
        return []
    entries = []
    for line in HISTORY_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return entries


def _history_by_output() -> dict[str, dict]:
    by_output: dict[str, dict] = {}
    for e in _load_history():
        if e.get("state") != "success":
            continue
        output = normalize_output_path(e.get("output_file"))
        if output:
            by_output[output] = e
    return by_output


def _enrich_from_history(item: CatalogItem, history: dict[str, dict]) -> CatalogItem:
    entry = history.get(item.output_path)
    if not entry:
        return item

    updates: dict = {}
    if not item.task_id and entry.get("task_id"):
        updates["task_id"] = entry.get("task_id")
    if not item.template and entry.get("template"):
        updates["template"] = entry.get("template")
    if not item.timestamp:
        updates["timestamp"] = entry.get("completed_at") or entry.get("timestamp")
    if not item.image_url and entry.get("image_url"):
        updates["image_url"] = entry.get("image_url")
    if not item.product_urls and entry.get("product_urls"):
        updates["product_urls"] = entry.get("product_urls")
    if not item.output_r2_url and entry.get("output_r2_url"):
        updates["output_r2_url"] = entry.get("output_r2_url")
    if not item.job_id and entry.get("job_id"):
        updates["job_id"] = entry.get("job_id")
        updates["run_id"] = entry.get("job_id")
    if not item.prompt_path and entry.get("prompt_file"):
        updates["prompt_path"] = normalize_project_path(entry.get("prompt_file"), ("prompts/",))

    if updates:
        return item.model_copy(update=updates)
    return item


def _product_lookup() -> dict[str, dict]:
    return {p["id"]: p for p in _load_products()}


def _is_scene_plate_path(path: str) -> bool:
    stem = Path(path).stem
    return stem.startswith("scene_plate_") or stem.startswith("distilled_")


def _enrich_review(item: CatalogItem, products_by_id: dict[str, dict]) -> CatalogItem:
    status = review_store.get_review_status(item.output_path)
    is_canonical = False
    if item.product_id:
        prod = products_by_id.get(item.product_id)
        if prod:
            approved = normalize_output_path(prod.get("approved_output"))
            if approved and approved == item.output_path:
                is_canonical = True
    return item.model_copy(update={"review_status": status, "is_canonical": is_canonical})


def _generation_label(item: CatalogItem, products_by_id: dict[str, dict]) -> str:
    stem = Path(item.output_path).stem
    product_label = None
    if item.product_id:
        prod = products_by_id.get(item.product_id)
        if prod:
            product_label = prod.get("name")
    return format_generation_label(stem, product_label=product_label)


def _with_output_label(item: CatalogItem, products_by_id: dict[str, dict]) -> CatalogItem:
    return item.model_copy(update={"output_label": _generation_label(item, products_by_id)})


def _tag_scene_plate(item: CatalogItem) -> CatalogItem:
    if item.is_scene_plate:
        return item
    return item.model_copy(update={"is_scene_plate": _is_scene_plate_path(item.output_path)})


def _build_all_catalog_items() -> list[CatalogItem]:
    by_path: dict[str, CatalogItem] = {}
    history = _history_by_output()
    products_by_id = _product_lookup()

    def upsert(item: CatalogItem, prefer: bool = False) -> None:
        existing = by_path.get(item.output_path)
        if existing is None or prefer:
            by_path[item.output_path] = item

    for p in _load_products():
        output = normalize_output_path(p.get("last_output"))
        if not output:
            continue
        stem = Path(output).stem
        run_id = parse_run_id_from_output(stem)
        upsert(
            CatalogItem(
                id=f"product-{p['id']}-{run_id or 'latest'}",
                output_path=output,
                product_id=p["id"],
                product_name=p.get("name"),
                product_type=p.get("type"),
                collection=p.get("collection"),
                review_status=None,
                template=None,
                task_id=None,
                run_id=run_id,
                job_id=run_id,
                timestamp=None,
                source="product",
            ),
            prefer=True,
        )

    for e in _load_history():
        if e.get("state") != "success":
            continue
        output = normalize_output_path(e.get("output_file"))
        if not output or not output.startswith("images/jewelry/"):
            continue
        stem = Path(output).stem
        pid = parse_product_id_from_output(stem)
        prod = products_by_id.get(pid) if pid else None
        run_id = e.get("job_id") or parse_run_id_from_output(stem)
        upsert(
            CatalogItem(
                id=f"history-{e.get('task_id', output)}",
                output_path=output,
                product_id=pid,
                product_name=prod.get("name") if prod else Path(output).stem,
                product_type=prod.get("type") if prod else None,
                collection=prod.get("collection") if prod else None,
                review_status=None,
                template=e.get("template"),
                task_id=e.get("task_id"),
                run_id=run_id,
                job_id=e.get("job_id") or run_id,
                timestamp=e.get("completed_at") or e.get("timestamp"),
                source="history",
                image_url=e.get("image_url"),
                product_urls=e.get("product_urls") or [],
                output_r2_url=e.get("output_r2_url"),
                prompt_path=normalize_project_path(e.get("prompt_file"), ("prompts/",)),
            )
        )

    if JEWELRY_IMAGES_DIR.exists():
        for path in sorted(JEWELRY_IMAGES_DIR.iterdir()):
            if path.suffix.lower() not in IMAGE_EXTENSIONS:
                continue
            rel = str(path.relative_to(PROJECT_ROOT)).replace("\\", "/")
            if rel in by_path:
                continue
            stem = path.stem
            pid = parse_product_id_from_output(stem)
            prod = products_by_id.get(pid) if pid else None
            run_id = parse_run_id_from_output(stem)
            upsert(
                CatalogItem(
                    id=f"file-{path.stem}",
                    output_path=rel,
                    product_name=prod.get("name") if prod else path.stem,
                    product_id=pid,
                    product_type=prod.get("type") if prod else None,
                    collection=prod.get("collection") if prod else None,
                    review_status=None,
                    template=None,
                    task_id=None,
                    run_id=run_id,
                    job_id=run_id,
                    timestamp=None,
                    source="filesystem",
                )
            )

    review_store.load_reviews()
    items = [
        _with_output_label(
            _enrich_review(_enrich_from_history(_tag_scene_plate(item), history), products_by_id),
            products_by_id,
        )
        for item in by_path.values()
    ]
    return items


def _filter_catalog(
    items: list[CatalogItem],
    *,
    collection: str | None = None,
    product_type: str | None = None,
    review_status: str | None = None,
    scene_plates_only: bool = False,
) -> list[CatalogItem]:
    if collection:
        items = [i for i in items if i.collection == collection]
    if product_type:
        items = [i for i in items if i.product_type == product_type]
    if review_status:
        if review_status == "pending":
            items = [i for i in items if not i.review_status]
        else:
            items = [i for i in items if i.review_status == review_status]
    if scene_plates_only:
        items = [i for i in items if i.is_scene_plate]
    return items


def _sort_catalog(items: list[CatalogItem], sort: str) -> list[CatalogItem]:
    if sort == "oldest":
        return sorted(items, key=lambda x: (x.timestamp or "", x.output_path))
    if sort == "name":
        return sorted(
            items,
            key=lambda x: (x.output_label or x.product_name or x.output_path).lower(),
        )
    return sorted(items, key=lambda x: (x.timestamp or "", x.output_path), reverse=True)


def list_catalog(
    collection: str | None = None,
    product_type: str | None = None,
    review_status: str | None = None,
    scene_plates_only: bool = False,
    sort: str = "newest",
) -> list[CatalogItem]:
    items = _build_all_catalog_items()
    items = _filter_catalog(
        items,
        collection=collection,
        product_type=product_type,
        review_status=review_status,
        scene_plates_only=scene_plates_only,
    )
    return _sort_catalog(items, sort)


def list_catalog_paginated(
    *,
    page: int = 1,
    page_size: int = 24,
    collection: str | None = None,
    product_type: str | None = None,
    review_status: str | None = None,
    scene_plates_only: bool = False,
    sort: str = "newest",
) -> PaginatedResponse[CatalogItem]:
    items = list_catalog(
        collection=collection,
        product_type=product_type,
        review_status=review_status,
        scene_plates_only=scene_plates_only,
        sort=sort,
    )
    total = len(items)
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    total_pages = max(1, (total + page_size - 1) // page_size) if total else 1
    if page > total_pages:
        page = total_pages
    start = (page - 1) * page_size
    end = start + page_size
    return PaginatedResponse(
        items=items[start:end],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


def catalog_meta() -> CatalogMeta:
    items = _build_all_catalog_items()
    collections: set[str] = set()
    product_types: set[str] = set()
    counts_by_review: dict[str, int] = {"pending": 0, "approved": 0, "rejected": 0}
    scene_plate_count = 0
    canonical_count = 0
    for item in items:
        if item.collection:
            collections.add(item.collection)
        if item.product_type:
            product_types.add(item.product_type)
        if item.is_scene_plate:
            scene_plate_count += 1
        if item.is_canonical:
            canonical_count += 1
        key = item.review_status or "pending"
        counts_by_review[key] = counts_by_review.get(key, 0) + 1
    return CatalogMeta(
        collections=sorted(collections),
        product_types=sorted(product_types),
        total=len(items),
        scene_plate_count=scene_plate_count,
        canonical_count=canonical_count,
        counts_by_review=counts_by_review,
    )
