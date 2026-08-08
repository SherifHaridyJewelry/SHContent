"""Template listing and loading."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse

from fastapi import HTTPException

from app.config import PROJECT_ROOT, SCRIPTS_DIR, TEMPLATES_DIR
from app.models.schemas import ProductType, TemplateSummary
from app.services.path_utils import normalize_project_path

if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from r2_upload import get_r2_config, get_s3_client, upload_file_with_key

_CORE_SCENE_TYPES = ("default", "ring", "twin_rings", "bracelet", "earrings", "necklace")


def _count_scene_refs(data: dict) -> int:
    scene_refs = data.get("scene_references") or {}
    if not isinstance(scene_refs, dict):
        return 0
    return sum(len(v) for v in scene_refs.values() if isinstance(v, list))


def _scene_preview_url(data: dict) -> str | None:
    scene_refs = data.get("scene_references") or {}
    if not isinstance(scene_refs, dict):
        return None
    for key in _CORE_SCENE_TYPES:
        urls = scene_refs.get(key) or []
        if isinstance(urls, list) and urls:
            return str(urls[0])
    for urls in scene_refs.values():
        if isinstance(urls, list) and urls:
            return str(urls[0])
    return None


def _scene_type_coverage(data: dict) -> tuple[int, int]:
    scene_refs = data.get("scene_references") or {}
    if not isinstance(scene_refs, dict):
        return 0, len(_CORE_SCENE_TYPES)
    covered = sum(1 for key in _CORE_SCENE_TYPES if scene_refs.get(key))
    return covered, len(_CORE_SCENE_TYPES) - covered


def list_templates() -> list[TemplateSummary]:
    results = []
    if not TEMPLATES_DIR.exists():
        return results
    for path in sorted(TEMPLATES_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        api = data.get("api_parameters", {})
        scene = data.get("scene", {})
        covered, missing = _scene_type_coverage(data)
        results.append(
            TemplateSummary(
                name=path.stem,
                template_name=data.get("template_name", path.stem),
                category=data.get("category", ""),
                product_type=data.get("product_type", ""),
                background=scene.get("background", ""),
                aspect_ratio=api.get("aspect_ratio", "4:5"),
                style_ref_count=len(data.get("style_references", [])),
                scene_ref_count=_count_scene_refs(data),
                preview_url=_scene_preview_url(data),
                types_covered=covered,
                types_missing=missing,
            )
        )
    return results


def resolve_template_path(name: str) -> Path:
    """Resolve template name to file path. Raises ValueError if not found."""
    for candidate in [TEMPLATES_DIR / name, TEMPLATES_DIR / f"{name}.json"]:
        if candidate.exists():
            return candidate
    raise ValueError(f"Template not found: {name}")


def get_template(name: str) -> dict:
    for candidate in [TEMPLATES_DIR / name, TEMPLATES_DIR / f"{name}.json"]:
        if candidate.exists():
            return json.loads(candidate.read_text(encoding="utf-8"))
    raise HTTPException(status_code=404, detail=f"Template not found: {name}")


def load_template_dict(name: str) -> dict:
    return get_template(name)


def _write_template(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _template_path(name: str) -> Path:
    try:
        return resolve_template_path(name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


def _catalog_r2_lookup() -> dict[str, str]:
    from app.db.engine import get_session
    from app.db.repositories.catalog_outputs import CatalogOutputRepository

    lookup: dict[str, str] = {}
    with get_session() as session:
        repo = CatalogOutputRepository(session)
        rows = repo.list_paths_for_export()
        for row in rows:
            if row.output_r2_url:
                lookup[row.output_path] = row.output_r2_url
    return lookup


def _upload_output_reference(template_name: str, output_path: str) -> str:
    normalized = normalize_project_path(output_path, ("images/",))
    if not normalized:
        raise ValueError(f"Unsupported output path: {output_path}")

    existing_url = _catalog_r2_lookup().get(normalized)
    if existing_url:
        return existing_url

    local_path = (PROJECT_ROOT / normalized).resolve()
    root = PROJECT_ROOT.resolve()
    if not str(local_path).startswith(str(root)) or not local_path.is_file():
        raise ValueError(f"Output image not found: {output_path}")

    config = get_r2_config()
    s3_client = get_s3_client(config)
    object_key = f"references/scenes/{template_name}/{local_path.name}"
    url = upload_file_with_key(s3_client, config, local_path, object_key)
    if not url:
        raise ValueError(f"Failed to upload style reference: {output_path}")
    return url


def add_style_references(
    name: str,
    *,
    output_paths: list[str] | None = None,
    urls: list[str] | None = None,
) -> dict:
    """Append output images or public URLs to a template's style_references."""
    path = _template_path(name)
    template = json.loads(path.read_text(encoding="utf-8"))
    refs = list(template.get("style_references", []))

    added: list[str] = []
    skipped: list[str] = []

    for url in urls or []:
        if not url.startswith(("http://", "https://")):
            skipped.append(url)
            continue
        if url in refs:
            skipped.append(url)
            continue
        refs.append(url)
        added.append(url)

    for output_path in output_paths or []:
        try:
            url = _upload_output_reference(path.stem, output_path)
        except ValueError:
            skipped.append(output_path)
            continue
        if url in refs:
            skipped.append(output_path)
            continue
        refs.append(url)
        added.append(url)

    template["style_references"] = refs
    _write_template(path, template)

    return {
        "template": path.stem,
        "added": added,
        "skipped": skipped,
        "style_references": refs,
    }


def _normalize_scene_key(product_type: str) -> str:
    valid = {t.value for t in ProductType} | {"default"}
    key = product_type.strip().lower()
    if key not in valid:
        raise ValueError(f"Invalid product_type: {product_type}")
    return key


def _url_basename(url: str) -> str:
    path = unquote(urlparse(url).path)
    return Path(path).stem


def _replace_url_by_basename(refs: list[str], new_url: str, basename: str) -> list[str]:
    """Replace URL with matching basename in place, or append if not found."""
    insert_idx: int | None = None
    kept: list[str] = []
    for i, existing in enumerate(refs):
        if basename in existing or _url_basename(existing) == basename:
            if insert_idx is None:
                insert_idx = i
            continue
        kept.append(existing)
    if insert_idx is not None:
        kept.insert(insert_idx, new_url)
    elif new_url not in kept:
        kept.append(new_url)
    return kept


def add_scene_references(
    name: str,
    *,
    product_type: str = "default",
    output_paths: list[str] | None = None,
    urls: list[str] | None = None,
    replace_basename: str | None = None,
) -> dict:
    """Append product-free scene plates to scene_references for a product type."""
    path = _template_path(name)
    template = json.loads(path.read_text(encoding="utf-8"))
    key = _normalize_scene_key(product_type)

    scene_refs = template.get("scene_references")
    if not isinstance(scene_refs, dict):
        scene_refs = {}
    refs = list(scene_refs.get(key, []))

    added: list[str] = []
    skipped: list[str] = []

    for url in urls or []:
        if not url.startswith(("http://", "https://")):
            skipped.append(url)
            continue
        if replace_basename:
            refs = _replace_url_by_basename(refs, url, replace_basename)
            if url not in added:
                added.append(url)
            continue
        if url in refs:
            skipped.append(url)
            continue
        refs.append(url)
        added.append(url)

    for output_path in output_paths or []:
        try:
            url = _upload_output_reference(path.stem, output_path)
        except ValueError:
            skipped.append(output_path)
            continue
        basename = replace_basename or Path(output_path).stem
        if replace_basename or any(_url_basename(u) == basename for u in refs):
            refs = _replace_url_by_basename(refs, url, basename)
            if url not in added:
                added.append(url)
            continue
        if url in refs:
            skipped.append(output_path)
            continue
        refs.append(url)
        added.append(url)

    scene_refs[key] = refs
    template["scene_references"] = scene_refs
    _write_template(path, template)

    return {
        "template": path.stem,
        "product_type": key,
        "added": added,
        "skipped": skipped,
        "scene_references": scene_refs,
    }


def remove_scene_reference(name: str, *, product_type: str, url: str) -> dict:
    path = _template_path(name)
    template = json.loads(path.read_text(encoding="utf-8"))
    key = _normalize_scene_key(product_type)
    scene_refs = template.get("scene_references")
    if not isinstance(scene_refs, dict):
        scene_refs = {}
    refs = list(scene_refs.get(key, []))
    if url not in refs:
        raise ValueError(f"URL not found in scene_references[{key}]")
    refs.remove(url)
    scene_refs[key] = refs
    template["scene_references"] = scene_refs
    _write_template(path, template)
    return {
        "template": path.stem,
        "product_type": key,
        "added": [],
        "skipped": [],
        "scene_references": scene_refs,
    }


def reorder_scene_reference(
    name: str,
    *,
    product_type: str,
    url: str,
    direction: str,
) -> dict:
    """Move a scene reference up or down within its scene_key list."""
    path = _template_path(name)
    template = json.loads(path.read_text(encoding="utf-8"))
    key = _normalize_scene_key(product_type)
    scene_refs = template.get("scene_references")
    if not isinstance(scene_refs, dict):
        scene_refs = {}
    refs = list(scene_refs.get(key, []))
    if url not in refs:
        raise ValueError(f"URL not found in scene_references[{key}]")
    idx = refs.index(url)
    if direction == "up" and idx > 0:
        refs[idx - 1], refs[idx] = refs[idx], refs[idx - 1]
    elif direction == "down" and idx < len(refs) - 1:
        refs[idx + 1], refs[idx] = refs[idx], refs[idx + 1]
    else:
        raise ValueError(f"Cannot move reference {direction}")
    scene_refs[key] = refs
    template["scene_references"] = scene_refs
    _write_template(path, template)
    return {
        "template": path.stem,
        "product_type": key,
        "added": [],
        "skipped": [],
        "scene_references": scene_refs,
    }
