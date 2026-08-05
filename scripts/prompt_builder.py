#!/usr/bin/env python3
"""Build Dense Narrative JSON prompts from brand templates + product info.

Merges a brand template (scene, lighting, camera, style) with either:
  - A vision analysis result (detailed product description from Gemini)
  - A generic product reference (when --no-analyze is used)

Composes image_input from explicitly selected style/scene references and
raw product image URLs, respecting the 14-image API limit.

Output is a prompt JSON file ready for scripts/generate_kie.py.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

PROJECT_ROOT = Path(__file__).resolve().parent.parent
TEMPLATES_DIR = PROJECT_ROOT / "templates"

MAX_IMAGE_INPUT = 14

SCALE_GUARD = (
    "Frame the jewelry as a large close-up hero: the product should fill roughly "
    "60–75% of the frame height, tightly cropped with only a modest margin of "
    "background. Camera is close to the subject — not a wide tabletop shot. "
    "Match the scene reference for background color, surface texture, and lighting "
    "only; do not copy a distant or miniature product scale from any reference image."
)

GENERIC_SUBJECT = (
    "The jewelry piece shown in the reference images, placed as a large close-up "
    "hero subject filling most of the frame, with all original details, textures, "
    "and proportions faithfully preserved."
)

FIDELITY_SUBJECT = (
    "Use the bracelet from the reference image as the exact product identity. "
    "You may restage it into a premium catalog setup with better composition, lighting, and angle."
)

FIDELITY_CHAIN_RULES = (
    "Preserve exact link sequence, clasp, chain thickness, material finish, and total link count. "
    "Do not invent, remove, merge, or simplify links. Do not redesign the chain pattern."
)


def build_material_only_description(analysis: dict) -> str:
    """Hero text from material/clasp/dimensions only — no free-form chain prose."""
    parts: list[str] = []
    if analysis.get("material"):
        parts.append(f"Material and finish: {analysis['material']}.")
    clasp = analysis.get("clasp_type")
    if clasp:
        parts.append(f"Clasp: {clasp}.")
    if analysis.get("dimensions"):
        parts.append(analysis["dimensions"].rstrip(".") + ".")
    features = analysis.get("distinctive_features") or []
    if features:
        parts.append("Features: " + "; ".join(features[:3]) + ".")
    return " ".join(parts) if parts else GENERIC_SUBJECT


def build_chain_structured_description(analysis: dict) -> str:
    """Hero text from structured chain analysis fields."""
    parts: list[str] = []
    if analysis.get("material"):
        parts.append(f"This bracelet is {analysis['material'].rstrip('.')}.")
    count = analysis.get("total_link_count")
    if count is not None:
        parts.append(f"The chain has {count} links total.")
    unit = analysis.get("chain_pattern_unit") or []
    if unit:
        unit_str = ", ".join(unit)
        parts.append(f"The pattern repeats exactly as: {unit_str}.")
    if analysis.get("link_separations"):
        parts.append(f"Link connections: {analysis['link_separations'].rstrip('.')}.")
    if analysis.get("clasp_type"):
        parts.append(f"Clasp type: {analysis['clasp_type'].rstrip('.')}.")
    if analysis.get("visibility_note"):
        parts.append(analysis["visibility_note"].rstrip(".") + ".")
    parts.append(
        "Preserve this cadence across the full bracelet. "
        "Do not invent, remove, merge, or simplify links. Match the clasp from the reference."
    )
    return " ".join(parts)


def resolve_product_description(
    product_analysis: dict | None,
    *,
    prompt_mode: str = "baseline",
    analyze_mode: str = "standard",
) -> str | None:
    """Map vision analysis + modes to hero subject text."""
    if not product_analysis:
        if prompt_mode == "fidelity":
            return f"{FIDELITY_SUBJECT} {FIDELITY_CHAIN_RULES}"
        return None

    if analyze_mode == "chain_structured":
        return build_chain_structured_description(product_analysis)

    if analyze_mode == "material_only":
        desc = build_material_only_description(product_analysis)
        if prompt_mode == "fidelity":
            return f"{desc} {FIDELITY_CHAIN_RULES}"
        return desc

    # standard baseline analyze
    desc = product_analysis.get("product_description")
    if prompt_mode == "fidelity" and desc:
        return f"{FIDELITY_SUBJECT} {FIDELITY_CHAIN_RULES}"
    return desc


def load_json(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def url_basename(url: str) -> str:
    path = unquote(urlparse(url).path)
    return Path(path).stem


def _valid_url(url: str) -> bool:
    return isinstance(url, str) and url.startswith(("http://", "https://"))


def collect_selectable_references(template: dict) -> list[dict[str, Any]]:
    """Flatten style_references and scene_references into a selectable list."""
    options: list[dict[str, Any]] = []
    seen: set[str] = set()

    for i, url in enumerate(template.get("style_references") or []):
        if not _valid_url(url) or url in seen:
            continue
        seen.add(url)
        options.append({
            "url": url,
            "source": "style",
            "scene_key": None,
            "label": f"Style reference {i + 1}",
        })

    scene_refs = template.get("scene_references") or {}
    if isinstance(scene_refs, dict):
        for key, urls in scene_refs.items():
            for url in urls or []:
                if not _valid_url(url) or url in seen:
                    continue
                seen.add(url)
                options.append({
                    "url": url,
                    "source": "scene",
                    "scene_key": key,
                    "label": f"Scene ref: {key}",
                })

    return options


def collect_selectable_url_set(template: dict) -> set[str]:
    return {opt["url"] for opt in collect_selectable_references(template)}


def resolve_generation_references(
    *,
    job_ref_url: str | None = None,
    product_ref_url: str | None = None,
) -> list[str]:
    """Return at most one explicitly selected reference URL."""
    if _valid_url(product_ref_url or ""):
        return [product_ref_url]  # type: ignore[list-item]
    if _valid_url(job_ref_url or ""):
        return [job_ref_url]  # type: ignore[list-item]
    return []


def resolve_ref_source(template: dict, ref_url: str | None) -> str | None:
    if not ref_url:
        return None
    for opt in collect_selectable_references(template):
        if opt["url"] == ref_url:
            return opt["source"]
    return None


def compose_image_input(reference_urls: list[str], product_urls: list[str]) -> list[str]:
    """Combine product URLs and reference URLs, respecting the 14-image limit."""
    combined = list(product_urls) + list(reference_urls)
    if len(combined) > MAX_IMAGE_INPUT:
        available = MAX_IMAGE_INPUT - len(reference_urls)
        if available <= 0:
            print(f"WARNING: {len(reference_urls)} references exceed the {MAX_IMAGE_INPUT}-image limit.")
            print("Truncating references to fit at least 1 product image.")
            refs_truncated = reference_urls[:MAX_IMAGE_INPUT - 1]
            combined = product_urls[:1] + refs_truncated
        else:
            print(f"WARNING: {len(combined)} total images exceed the {MAX_IMAGE_INPUT}-image limit.")
            print(f"Keeping references, truncating product images to {available}.")
            combined = product_urls[:available] + list(reference_urls)
    return combined


def build_prompt_text(
    template: dict,
    product_description: str | None = None,
    *,
    has_reference: bool = False,
    prompt_mode: str = "baseline",
) -> str:
    """Weave template fields + product description into a Dense Narrative prompt string."""
    scene = template.get("scene", {})
    camera = template.get("camera", {})
    lighting = template.get("lighting", {})
    style = template.get("style", "")
    quality = template.get("quality_directives", "")

    if product_description:
        subject_block = product_description
    else:
        subject_block = GENERIC_SUBJECT
        if prompt_mode == "fidelity":
            subject_block = f"{FIDELITY_SUBJECT} {FIDELITY_CHAIN_RULES}"

    surface = scene.get("surface", "a neutral display surface")
    background = scene.get("background", "a clean, out-of-focus background")
    props = scene.get("props", "none")
    arrangement = scene.get("arrangement", "single piece, centered")

    focal_length = camera.get("focal_length", "100mm")
    aperture = camera.get("aperture", "f/4.0")
    iso = camera.get("iso", "100")
    lens_behavior = camera.get("lens_behavior", "sharp focus on the product")
    shooting_angle = camera.get("shooting_angle", "slight overhead angle")

    lighting_setup = lighting.get("setup", "soft diffused lighting")
    lighting_quality = lighting.get("quality", "even, controlled")

    parts = [
        f"Product photography in the style of {style}." if style else "Product photography.",
        f"Hero subject: {subject_block}",
        f"The product is placed on {surface}, with {arrangement}.",
        f"Background: {background}.",
    ]

    if props and props.lower() not in ("none", "no props", "n/a", ""):
        parts.append(f"Props: {props}.")

    parts.append(
        f"Shot with a {focal_length} lens, {aperture}, ISO {iso}. "
        f"{lens_behavior.rstrip('.')}. Camera angle: {shooting_angle}."
    )

    parts.append(
        f"Lighting: {lighting_setup}. {lighting_quality.rstrip('.')}."
    )

    if quality:
        parts.append(quality)

    parts.append(
        "Reproduce the product from the reference images with exact fidelity -- "
        "preserve every detail of shape, texture, material finish, and construction. "
        "Do not alter, simplify, or reinterpret the product design."
    )

    parts.append(SCALE_GUARD)

    return " ".join(parts)


def build_prompt_json(
    template: dict,
    product_urls: list[str],
    product_analysis: dict | None = None,
    generation_urls: list[str] | None = None,
    product_type: str | None = None,
    *,
    job_ref_url: str | None = None,
    product_ref_url: str | None = None,
    prompt_mode: str = "baseline",
    analyze_mode: str = "standard",
    extra_reference_urls: list[str] | None = None,
) -> dict:
    """Build a complete Dense Narrative JSON prompt from template + product info."""
    del product_type  # used for UI grouping only, not auto-selection

    product_description = resolve_product_description(
        product_analysis,
        prompt_mode=prompt_mode,
        analyze_mode=analyze_mode,
    )

    ref_urls = list(extra_reference_urls or [])
    selected = resolve_generation_references(
        job_ref_url=job_ref_url,
        product_ref_url=product_ref_url,
    )
    for url in selected:
        if url not in ref_urls:
            ref_urls.append(url)
    resolved_ref_url = ref_urls[0] if ref_urls else None

    prompt_text = build_prompt_text(
        template,
        product_description,
        has_reference=bool(ref_urls),
        prompt_mode=prompt_mode,
    )

    gen_urls = generation_urls if generation_urls is not None else product_urls
    image_input = compose_image_input(ref_urls, gen_urls)

    api_params = template.get("api_parameters", {
        "aspect_ratio": "4:5",
        "resolution": "2K",
        "output_format": "jpg",
    })

    settings = {
        "style": template.get("style", ""),
        "lighting": template.get("lighting", {}).get("setup", ""),
        "camera_angle": template.get("camera", {}).get("shooting_angle", ""),
        "depth_of_field": template.get("camera", {}).get("lens_behavior", ""),
        "quality": template.get("quality_directives", ""),
        "selected_ref_url": resolved_ref_url,
        "selected_ref_source": resolve_ref_source(template, resolved_ref_url),
        "prompt_mode": prompt_mode,
        "analyze_mode": analyze_mode,
    }

    return {
        "prompt": prompt_text,
        "negative_prompt": template.get("negative_prompt", ""),
        "image_input": image_input,
        "api_parameters": api_params,
        "settings": settings,
    }


def resolve_template(name_or_path: str) -> Path:
    path = Path(name_or_path)
    if path.exists():
        return path
    for candidate in [
        TEMPLATES_DIR / name_or_path,
        TEMPLATES_DIR / (name_or_path + ".json"),
    ]:
        if candidate.exists():
            return candidate
    print(f"ERROR: Template not found: {name_or_path}")
    sys.exit(1)


def print_template_refs(template: dict) -> None:
    options = collect_selectable_references(template)
    if not options:
        print("No selectable references.")
        return
    for opt in options:
        print(f"  [{opt['source']}] {opt['label']}")
        print(f"    {opt['url']}")


def main():
    parser = argparse.ArgumentParser(
        description="Build Dense Narrative JSON prompt from template + product"
    )
    parser.add_argument("--template", "-t", required=True,
                        help="Brand template (filename, name, or path)")
    parser.add_argument("--product-urls", nargs="+", default=[],
                        help="R2 URLs of raw product images (included in image_input)")
    parser.add_argument("--analysis", "-a", default=None,
                        help="Path to vision analysis JSON (from vision_analyze.py)")
    parser.add_argument("--output", "-o", default=None,
                        help="Output path for the prompt JSON")
    parser.add_argument("--ref-url", default=None,
                        help="Explicit style/scene reference URL for image_input")
    parser.add_argument("--list-template-refs", action="store_true",
                        help="Print selectable references and exit")
    parser.add_argument("--print", action="store_true",
                        help="Also print the prompt JSON to stdout")
    args = parser.parse_args()

    template_path = resolve_template(args.template)
    template = load_json(template_path)

    if args.list_template_refs:
        print(f"Selectable references for {template_path.name}:")
        print_template_refs(template)
        return

    if not args.output:
        parser.error("--output is required unless --list-template-refs is used")

    product_analysis = None
    if args.analysis:
        analysis_path = Path(args.analysis)
        if not analysis_path.exists():
            print(f"ERROR: Analysis file not found: {analysis_path}")
            sys.exit(1)
        product_analysis = load_json(analysis_path)

    product_urls = args.product_urls
    if product_analysis and "_source_urls" in product_analysis:
        if not product_urls:
            product_urls = product_analysis["_source_urls"]

    prompt_json = build_prompt_json(
        template,
        product_urls,
        product_analysis,
        job_ref_url=args.ref_url,
    )

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(prompt_json, f, indent=2, ensure_ascii=False)

    print(f"Prompt saved to: {output_path}")
    print(f"  Template: {template_path.name}")
    print(f"  Analysis: {'yes' if product_analysis else 'no (generic reference)'}")
    print(f"  image_input: {len(prompt_json['image_input'])} images")
    ref = prompt_json.get("settings", {}).get("selected_ref_url")
    if ref:
        print(f"  selected_ref: {ref}")

    if args.print:
        print("\n" + json.dumps(prompt_json, indent=2))


if __name__ == "__main__":
    main()
