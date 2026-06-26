#!/usr/bin/env python3
"""Batch-generate BTC Facebook 1:1 ad variation set (GPT Image 2 i2i).

Loads workflows/btc_fb_square_variations.json, uploads product refs to R2,
writes per-variation prompts, and runs generate_kie_gpt_image.py (parallel by default).

Usage:
  python scripts/btc_fb_variations_workflow.py
  python scripts/btc_fb_variations_workflow.py --variation ingot_solo
  python scripts/btc_fb_variations_workflow.py --dry-run
  python scripts/btc_fb_variations_workflow.py --sequential
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_WORKFLOW = PROJECT_ROOT / "workflows" / "btc_fb_square_variations.json"

STYLE_BG = (
    "deep midnight navy blue matte seamless studio backdrop — strong color contrast "
    "against cool reflective silver so products pop in a Facebook feed thumbnail"
)
STYLE_LIGHT = (
    "even balanced studio lighting with large softboxes camera-left and camera-right, "
    "catalog clarity, accurate metal speculars, soft contact shadows, no harsh vignette"
)
PROMPT_SUFFIX = (
    "Square 1:1 Facebook ad product photo. Preserve every engraving, logo, and product "
    "silhouette exactly from reference images — no redesign. Generous clean margin along "
    "top edge for Meta ad copy. CRITICAL: no text overlays, slogans, watermarks, or "
    "typography except engravings on the metal."
)
NEGATIVE = (
    "text overlays, SALE, watermarks, wrong products, invented engravings, plastic metal, "
    "cartoon render, flat grey background matching silver, low contrast, muddy lighting, "
    "hands, people, cluttered props, gold-only scene, oversharpened halos"
)


def load_workflow(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def load_catalog(catalog_key: str, wf: dict) -> tuple[Path, dict]:
    rel = wf["catalogs"][catalog_key]
    path = PROJECT_ROOT / rel
    data = json.loads(path.read_text(encoding="utf-8"))
    by_sku = {p["sku"]: p for p in data.get("products", [])}
    return path.parent, by_sku


def resolve_image_path(
    sku: str,
    default_catalog: str,
    sku_catalogs: dict | None,
    wf: dict,
) -> Path:
    cat_key = (sku_catalogs or {}).get(sku, default_catalog)
    base, by_sku = load_catalog(cat_key, wf)
    product = by_sku.get(sku)
    if not product:
        raise KeyError(f"SKU {sku} not in catalog {cat_key}")
    rel = product["local_image"]
    path = base / rel
    if not path.exists():
        raise FileNotFoundError(path)
    return path


def upload_images(paths: list[Path], prefix: str) -> list[str]:
    cmd = [
        sys.executable,
        str(PROJECT_ROOT / "scripts" / "r2_upload.py"),
        "upload",
        *[str(p) for p in paths],
        "--prefix",
        prefix,
        "--json",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=PROJECT_ROOT)
    if result.returncode != 0:
        print(result.stderr or result.stdout)
        sys.exit(1)
    stdout = result.stdout.strip()
    start = stdout.rfind("[")
    end = stdout.rfind("]")
    return [r["url"] for r in json.loads(stdout[start : end + 1])]


def build_prompt(variation: dict, wf: dict) -> dict:
    default_cat = variation["catalog"]
    sku_catalogs = variation.get("sku_catalogs")
    paths = [
        resolve_image_path(sku, default_cat, sku_catalogs, wf) for sku in variation["skus"]
    ]
    api_params = dict(wf.get("api_parameters", {}))
    api_params.setdefault("aspect_ratio", wf.get("aspect_ratio", "1:1"))
    if "resolution" in wf and "resolution" not in api_params:
        api_params["resolution"] = wf["resolution"]

    prompt_text = (
        f"{variation['composition']}. Background: {STYLE_BG}. "
        f"Lighting: {STYLE_LIGHT}. {PROMPT_SUFFIX}"
    )
    data = {
        "prompt": prompt_text,
        "negative_prompt": NEGATIVE,
        "input_urls": [],
        "image_urls": [],
        "api_parameters": api_params,
        "settings": {
            "workflow": wf["name"],
            "variation_id": variation["id"],
            "label": variation["label"],
        },
    }
    if wf.get("generator") != "generate_kie.py":
        data["model"] = wf["model"]

    return {"paths": paths, "data": data}


def run_variation(
    variation: dict,
    wf: dict,
    url_cache: dict[str, str],
    prompts_dir: Path,
    images_dir: Path,
    skip_upload: bool,
    dry_run: bool,
) -> tuple[str, int]:
    built = build_prompt(variation, wf)
    paths = built["paths"]
    prompt_data = built["data"]

    prompt_path = prompts_dir / f"{variation['id']}.json"
    urls = []
    if skip_upload and prompt_path.exists():
        existing = json.loads(prompt_path.read_text(encoding="utf-8"))
        urls = existing.get("input_urls") or []
        if len(urls) == len(paths):
            prompt_data["input_urls"] = urls
            prompt_data["image_urls"] = urls
            if wf.get("generator") == "generate_kie.py":
                prompt_data["image_input"] = urls
        else:
            urls = []

    if not urls:
        for p in paths:
            key = str(p.resolve())
            if key not in url_cache:
                if skip_upload:
                    print(f"ERROR: No cached URL for {p.name}; run without --skip-upload first")
                    return variation["id"], 1
                url_cache[key] = upload_images([p], wf["r2_prefix"])[0]
            urls.append(url_cache[key])
        prompt_data["input_urls"] = urls
        prompt_data["image_urls"] = urls
        if wf.get("generator") == "generate_kie.py":
            prompt_data["image_input"] = urls

    prompts_dir.mkdir(parents=True, exist_ok=True)
    images_dir.mkdir(parents=True, exist_ok=True)
    output_path = images_dir / variation["output"]
    prompt_path.write_text(json.dumps(prompt_data, indent=2) + "\n", encoding="utf-8")

    if dry_run:
        print(f"  [dry-run] {variation['id']} -> {output_path.name}")
        return variation["id"], 0

    generator = wf.get("generator", "generate_kie_gpt_image.py")
    cmd = [
        sys.executable,
        str(PROJECT_ROOT / "scripts" / generator),
        str(prompt_path),
        str(output_path),
        "--aspect-ratio",
        wf.get("aspect_ratio", "1:1"),
    ]
    res = wf.get("resolution") or prompt_data.get("api_parameters", {}).get("resolution")
    if res:
        cmd.extend(["--resolution", res])

    if generator != "generate_kie.py":
        cmd.extend(["--model", wf["model"]])

    result = subprocess.run(cmd, cwd=PROJECT_ROOT)
    return variation["id"], result.returncode


def main():
    parser = argparse.ArgumentParser(description="BTC FB square variation batch (GPT Image 2)")
    parser.add_argument("--workflow", "-w", default=str(DEFAULT_WORKFLOW))
    parser.add_argument("--variation", "-v", action="append", help="Run only these variation id(s)")
    parser.add_argument("--skip-upload", action="store_true", help="Require URLs already in prompt JSON")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--sequential", action="store_true", help="One at a time (default: parallel)")
    parser.add_argument(
        "--max-workers", "-j", type=int, default=None,
        help="Max parallel jobs (default: all variations at once)",
    )
    args = parser.parse_args()

    wf_path = Path(args.workflow)
    if not wf_path.is_absolute():
        wf_path = PROJECT_ROOT / wf_path
    wf = load_workflow(wf_path)

    variations = wf["variations"]
    if args.variation:
        ids = set(args.variation)
        variations = [v for v in variations if v["id"] in ids]
        if not variations:
            print(f"ERROR: No matching variations for {ids}")
            sys.exit(1)

    prompts_dir = PROJECT_ROOT / wf["prompts_dir"]
    images_dir = PROJECT_ROOT / wf["images_dir"]
    style = wf["approved_style"]

    print(f"Workflow: {wf['name']}")
    print(f"Style: {style['background']} | {style['lighting']}")
    print(f"Variations: {len(variations)}")
    print(f"Output: {images_dir.relative_to(PROJECT_ROOT)}/\n")

    url_cache: dict[str, str] = {}
    if not args.skip_upload and not args.dry_run:
        all_paths: list[Path] = []
        seen: set[str] = set()
        for v in variations:
            built = build_prompt(v, wf)
            for p in built["paths"]:
                key = str(p.resolve())
                if key not in seen:
                    seen.add(key)
                    all_paths.append(p)
        print(f"Uploading {len(all_paths)} unique product image(s) to R2...")
        batch_urls = upload_images(all_paths, wf["r2_prefix"])
        for p, url in zip(all_paths, batch_urls):
            url_cache[str(p.resolve())] = url
        print()

    failures = []
    if args.sequential or args.dry_run:
        for v in variations:
            vid, code = run_variation(
                v, wf, url_cache, prompts_dir, images_dir, args.skip_upload, args.dry_run
            )
            if code != 0:
                failures.append(vid)
    else:
        workers = args.max_workers or len(variations)
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {
                pool.submit(
                    run_variation,
                    v,
                    wf,
                    url_cache,
                    prompts_dir,
                    images_dir,
                    True,
                    args.dry_run,
                ): v["id"]
                for v in variations
            }
            for fut in as_completed(futures):
                vid, code = fut.result()
                if code != 0:
                    failures.append(vid)

    if failures:
        print(f"\nFailed: {', '.join(failures)}")
        sys.exit(1)
    print(f"\nDone — {len(variations)} variation(s) in {images_dir.relative_to(PROJECT_ROOT)}/")


if __name__ == "__main__":
    main()
