"""Per-output catalog review persistence."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from app.config import CATALOG_REVIEWS_FILE, PRODUCTS_FILE
from app.services.path_utils import normalize_project_path

VALID_STATUSES = frozenset({"approved", "rejected"})


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_data_dir() -> None:
    CATALOG_REVIEWS_FILE.parent.mkdir(parents=True, exist_ok=True)


def _load_raw() -> dict[str, dict]:
    _ensure_data_dir()
    if not CATALOG_REVIEWS_FILE.exists():
        return {}
    return json.loads(CATALOG_REVIEWS_FILE.read_text(encoding="utf-8"))


def _save_raw(data: dict[str, dict]) -> None:
    _ensure_data_dir()
    CATALOG_REVIEWS_FILE.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def _normalize_output(output_path: str) -> str | None:
    return normalize_project_path(output_path, allowed_prefixes=("images/",))


def _migrate_from_products(data: dict[str, dict]) -> dict[str, dict]:
    """Seed reviews from legacy product.review_status on last_output only."""
    if not PRODUCTS_FILE.exists():
        return data
    products = json.loads(PRODUCTS_FILE.read_text(encoding="utf-8"))
    changed = False
    products_changed = False
    for p in products:
        status = p.get("review_status")
        if status not in VALID_STATUSES:
            continue
        output = _normalize_output(p.get("last_output"))
        if not output or output in data:
            continue
        data[output] = {
            "status": status,
            "reviewed_at": _utc_now(),
            "product_id": p.get("id"),
            "task_id": None,
        }
        changed = True
        if not p.get("approved_output"):
            p["approved_output"] = output
            products_changed = True
    if changed:
        _save_raw(data)
    if products_changed:
        PRODUCTS_FILE.write_text(
            json.dumps(products, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
    return data


def load_reviews() -> dict[str, dict]:
    data = _load_raw()
    if not data and PRODUCTS_FILE.exists():
        products = json.loads(PRODUCTS_FILE.read_text(encoding="utf-8"))
        if any(p.get("review_status") in VALID_STATUSES for p in products):
            return _migrate_from_products(data)
    return data


def get_review(output_path: str) -> dict | None:
    normalized = _normalize_output(output_path)
    if not normalized:
        return None
    return load_reviews().get(normalized)


def get_review_status(output_path: str) -> str | None:
    review = get_review(output_path)
    if not review:
        return None
    return review.get("status")


def set_review(
    output_path: str,
    status: str,
    *,
    product_id: str | None = None,
    task_id: str | None = None,
) -> dict:
    normalized = _normalize_output(output_path)
    if not normalized:
        raise ValueError(f"Invalid output path: {output_path}")
    if status not in VALID_STATUSES:
        raise ValueError(f"Invalid review status: {status}")

    data = load_reviews()
    entry = {
        "status": status,
        "reviewed_at": _utc_now(),
        "product_id": product_id,
        "task_id": task_id,
    }
    data[normalized] = entry
    _save_raw(data)
    return {"output_path": normalized, **entry}


def clear_review(output_path: str) -> bool:
    normalized = _normalize_output(output_path)
    if not normalized:
        return False
    data = load_reviews()
    if normalized not in data:
        return False
    del data[normalized]
    _save_raw(data)
    return True


def all_reviews() -> dict[str, dict]:
    return load_reviews()
