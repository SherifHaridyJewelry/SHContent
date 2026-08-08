#!/usr/bin/env python3
"""Run the BTC Facebook square ad workflow (GPT Image 2 image-to-image).

Steps:
  1. Load workflow config from workflows/btc_fb_square.json
  2. Resolve product images from scraped catalog
  3. Upload reference images to R2 (unless --skip-upload)
  4. Write prompt with input_urls
  5. Generate via generate_kie_gpt_image.py

Usage:
  python scripts/btc_fb_square_workflow.py
  python scripts/btc_fb_square_workflow.py --workflow workflows/btc_fb_square.json
  python scripts/btc_fb_square_workflow.py --skip-upload   # reuse URLs already in prompt file
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_WORKFLOW = PROJECT_ROOT / "workflows" / "btc_fb_square.json"


def load_workflow(path: Path) -> dict:
    if not path.exists():
        print(f"ERROR: Workflow not found: {path}")
        sys.exit(1)
    return json.loads(path.read_text(encoding="utf-8"))


def resolve_product_images(catalog_path: Path, skus: list[str]) -> dict[str, Path]:
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    base = catalog_path.parent
    by_sku = {p["sku"]: p for p in catalog.get("products", [])}
    images = {}
    for sku in skus:
        product = by_sku.get(sku)
        if not product:
            print(f"ERROR: SKU not in catalog: {sku}")
            sys.exit(1)
        rel = product.get("local_image")
        if not rel:
            print(f"ERROR: No local_image for SKU {sku}")
            sys.exit(1)
        img_path = base / rel
        if not img_path.exists():
            print(f"ERROR: Image missing: {img_path}")
            sys.exit(1)
        images[sku] = img_path
    return images


def upload_images(image_paths: list[Path], prefix: str) -> list[str]:
    cmd = [
        sys.executable,
        str(PROJECT_ROOT / "scripts" / "r2_upload.py"),
        "upload",
        *[str(p) for p in image_paths],
        "--prefix", prefix,
        "--json",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=PROJECT_ROOT)
    if result.returncode != 0:
        print(result.stderr or result.stdout)
        sys.exit(1)

    # Parse JSON array from stdout (last JSON block)
    stdout = result.stdout.strip()
    start = stdout.rfind("[")
    end = stdout.rfind("]")
    if start < 0 or end < start:
        print("ERROR: Could not parse upload JSON output")
        print(stdout)
        sys.exit(1)
    results = json.loads(stdout[start : end + 1])
    return [r["url"] for r in results]


def update_prompt_urls(prompt_path: Path, urls: list[str]) -> None:
    data = json.loads(prompt_path.read_text(encoding="utf-8"))
    data["input_urls"] = urls
    prompt_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {prompt_path.relative_to(PROJECT_ROOT)} with {len(urls)} input_urls")


def main():
    parser = argparse.ArgumentParser(description="BTC Facebook square ad workflow (GPT Image 2)")
    parser.add_argument("--workflow", "-w", default=str(DEFAULT_WORKFLOW), help="Workflow JSON path")
    parser.add_argument("--skip-upload", action="store_true", help="Use input_urls already in prompt file")
    parser.add_argument("--dry-run", action="store_true", help="Prepare prompt only, do not call KIE API")
    args = parser.parse_args()

    workflow_path = Path(args.workflow)
    if not workflow_path.is_absolute():
        workflow_path = PROJECT_ROOT / workflow_path
    wf = load_workflow(workflow_path)

    catalog_path = PROJECT_ROOT / wf["products_catalog"]
    prompt_path = PROJECT_ROOT / wf["prompt_file"]
    output_path = PROJECT_ROOT / wf["output_image"]

    print(f"Workflow: {wf['name']}")
    print(f"Model: {wf['model']}")
    print(f"Output: {output_path.relative_to(PROJECT_ROOT)}")

    if not args.skip_upload:
        images = resolve_product_images(catalog_path, wf["product_skus"])
        paths = [images[sku] for sku in wf["product_skus"]]
        print(f"Uploading {len(paths)} product image(s) to R2...")
        urls = upload_images(paths, wf.get("r2_prefix", "products/btc-silver"))
        update_prompt_urls(prompt_path, urls)
    else:
        data = json.loads(prompt_path.read_text(encoding="utf-8"))
        if not data.get("input_urls"):
            print("ERROR: --skip-upload but prompt has no input_urls")
            sys.exit(1)
        print(f"Using {len(data['input_urls'])} existing input_urls")

    if args.dry_run:
        print("Dry run complete.")
        return

    cmd = [
        sys.executable,
        str(PROJECT_ROOT / "scripts" / "generate_kie_gpt_image.py"),
        str(prompt_path),
        str(output_path),
        "--model", wf["model"],
        "--aspect-ratio", wf["aspect_ratio"],
        "--resolution", wf["resolution"],
    ]
    print(f"\nGenerating: {' '.join(cmd)}\n")
    result = subprocess.run(cmd, cwd=PROJECT_ROOT)
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
