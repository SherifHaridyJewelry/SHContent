"""Auto product id and display name helpers."""

from __future__ import annotations

import re
from pathlib import Path

from app.models.schemas import ProductType

TYPE_LABELS: dict[str, str] = {
    ProductType.ring.value: "Ring",
    ProductType.bracelet.value: "Bracelet",
    ProductType.earrings.value: "Earrings",
    ProductType.necklace.value: "Necklace",
    ProductType.half_set.value: "Half set",
    ProductType.full_set.value: "Full set",
    ProductType.general.value: "Product",
}

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def type_id_prefix(product_type: str) -> str:
    return product_type


def type_label(product_type: str) -> str:
    return TYPE_LABELS.get(product_type, product_type.replace("_", " ").title())


def format_product_number(n: int) -> str:
    return f"{n:02d}"


def next_product_id(existing_ids: set[str], product_type: str) -> str:
    """Return next auto id like ring01, ring100 for the given type."""
    prefix = type_id_prefix(product_type)
    pattern = re.compile(rf"^{re.escape(prefix)}(\d+)$")
    nums: list[int] = []
    for pid in existing_ids:
        m = pattern.match(pid)
        if m:
            nums.append(int(m.group(1)))
    n = max(nums, default=0) + 1
    candidate = f"{prefix}{format_product_number(n)}"
    while candidate in existing_ids:
        n += 1
        candidate = f"{prefix}{format_product_number(n)}"
    return candidate


def numeric_suffix_from_id(product_id: str, product_type: str) -> str | None:
    prefix = type_id_prefix(product_type)
    pattern = re.compile(rf"^{re.escape(prefix)}(\d+)$")
    m = pattern.match(product_id)
    return m.group(1) if m else None


def name_from_type_and_id(product_type: str, product_id: str) -> str:
    suffix = numeric_suffix_from_id(product_id, product_type)
    label = type_label(product_type)
    if suffix:
        return f"{label} {suffix}"
    return product_id.replace("_", " ").title()


def _is_generic_camera_filename(cleaned: str) -> bool:
    """True for IMG roll dates, hashes, and other non-descriptive upload names."""
    if not cleaned:
        return True
    if re.fullmatch(r"\d{8}(\s+\d+)?", cleaned):
        return True
    if re.fullmatch(r"file[0-9a-f]+", cleaned, flags=re.IGNORECASE):
        return True
    if re.fullmatch(r"[0-9a-f]{16,}", cleaned, flags=re.IGNORECASE):
        return True
    return False


def name_from_filename(filename: str, fallback: str) -> str:
    stem = Path(filename).stem
    cleaned = re.sub(r"^IMG[_-]?", "", stem, flags=re.IGNORECASE)
    cleaned = re.sub(r"^file[_-]?", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"[_-]+", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if _is_generic_camera_filename(cleaned):
        return fallback
    if len(cleaned) >= 2 and not cleaned.replace(" ", "").isdigit():
        return cleaned.title()
    return fallback


def is_image_file(name: str) -> bool:
    return Path(name).suffix.lower() in IMAGE_EXTENSIONS


def slugify_folder_name(name: str) -> str:
    """Convert folder name to a valid product id slug if user-provided."""
    s = name.strip().lower()
    s = re.sub(r"[^a-z0-9_-]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s or "product"
