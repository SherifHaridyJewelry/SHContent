"""Output filename helpers for the product pipeline and web app."""

from __future__ import annotations

import re
from dataclasses import dataclass

PRODUCT_ID_RE = re.compile(
    r"^(?:half_set|full_set|twin_rings|ring|bracelet|earrings|necklace|general)\d{2,}$"
)


@dataclass(frozen=True)
class ParsedOutputName:
    prefix: str
    product_id: str
    template_slug: str
    run_id: str | None


def template_slug(template_key: str) -> str:
    """jewelry_beige_4x5 -> beige_4x5; jewelry_catalog_4x5 -> 4x5 (avoid catalog_catalog)."""
    slug = template_key.removeprefix("jewelry_")
    if slug == "catalog_4x5":
        return "4x5"
    return slug


def build_output_name(
    output_prefix: str,
    product_id: str,
    template_key: str,
    run_id: str,
) -> str:
    """Build a unique output stem: {prefix}_{product_id}_{template_slug}_{run_id}."""
    return f"{output_prefix}_{product_id}_{template_slug(template_key)}_{run_id}"


def parse_run_id_from_output(stem: str) -> str | None:
    """Extract 8-char run id from output stem if present."""
    parts = stem.rsplit("_", 1)
    if len(parts) == 2 and re.fullmatch(r"[a-f0-9]{8}", parts[1]):
        return parts[1]
    return None


def parse_output_name(stem: str) -> ParsedOutputName | None:
    """Parse a catalog/product output stem into structured parts."""
    run_id = parse_run_id_from_output(stem)
    without_run = stem[: -(len(run_id) + 1)] if run_id else stem

    match = re.match(
        r"^(catalog|product)_((?:half_set|full_set|twin_rings|ring|bracelet|earrings|necklace|general)\d{2,})(?:_(.+))?$",
        without_run,
    )
    if match:
        return ParsedOutputName(
            prefix=match.group(1),
            product_id=match.group(2),
            template_slug=match.group(3) or "",
            run_id=run_id,
        )
    return None


def parse_product_id_from_output(stem: str) -> str | None:
    """Extract product_id from a run-id output stem, or None if not matched."""
    parsed = parse_output_name(stem)
    if parsed:
        return parsed.product_id
    parts = stem.split("_")
    if len(parts) >= 2 and parts[0] in ("catalog", "product"):
        return parts[1]
    return None


def format_product_id_label(product_id: str) -> str:
    """ring01 -> Ring 01; half_set03 -> Half set 03; twin_rings01 -> Twin rings 01."""
    for prefix in ("half_set", "full_set", "twin_rings"):
        if product_id.startswith(prefix):
            suffix = product_id[len(prefix) :]
            if suffix.isdigit():
                return f"{prefix.replace('_', ' ').title()} {suffix}"
    match = re.match(r"^([a-z]+)(\d+)$", product_id)
    if match:
        return f"{match.group(1).title()} {match.group(2)}"
    return product_id.replace("_", " ").title()


def format_template_slug_label(slug: str) -> str:
    """eggplant_4x5 -> Eggplant 4:5."""
    if not slug:
        return "Default"
    return slug.replace("_4x5", " 4:5").replace("_", " ").title()


def format_scene_plate_label(stem: str) -> str:
    """scene_plate_eggplant_pillow -> Eggplant pillow."""
    if stem.startswith("scene_plate_"):
        return stem.removeprefix("scene_plate_").replace("_", " ").title()
    return stem.replace("_", " ").title()


def format_generation_label(
    stem: str,
    *,
    product_label: str | None = None,
) -> str:
    """Human-readable label for a generation output stem."""
    if stem.startswith("scene_plate_"):
        return format_scene_plate_label(stem)

    parsed = parse_output_name(stem)
    if parsed:
        name = product_label or format_product_id_label(parsed.product_id)
        template = format_template_slug_label(parsed.template_slug)
        if parsed.run_id:
            return f"{name} · {template} · {parsed.run_id}"
        return f"{name} · {template}"

    return product_label or stem.replace("_", " ")
