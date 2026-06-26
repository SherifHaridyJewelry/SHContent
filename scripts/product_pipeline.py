#!/usr/bin/env python3
"""End-to-end product photography pipeline.

Orchestrates: upload to R2 -> (optional) vision analysis -> prompt build -> image generation.

Supports:
  - Single product (one or more angles)
  - Batch mode (multiple products, same template for brand consistency)
  - Batch-dir mode (subfolder per product, each with multiple angles)
"""

import argparse
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = Path(__file__).resolve().parent

if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from r2_upload import get_r2_config, get_s3_client, upload_file, validate_image, ALLOWED_EXTENSIONS
from prompt_builder import build_prompt_json, resolve_template, load_json
from vision_analyze import analyze_product, get_api_key
from generate_kie import create_task, poll_task, download_image, log_task


def upload_product_images(s3_client, r2_config: dict, image_paths: list[Path]) -> list[str]:
    """Upload a list of product images to R2 and return their public URLs."""
    urls = []
    for p in image_paths:
        url = upload_file(s3_client, r2_config, p, prefix="products")
        if url:
            urls.append(url)
            print(f"  Uploaded: {p.name} -> {url}")
        else:
            print(f"  FAILED: {p.name}")
    return urls


def collect_images_from_path(path: Path) -> list[Path]:
    """Collect all valid image files from a path (file or directory)."""
    if path.is_file():
        if validate_image(path):
            return [path]
        return []
    elif path.is_dir():
        images = []
        for ext in ALLOWED_EXTENSIONS:
            images.extend(path.glob(f"*{ext}"))
            images.extend(path.glob(f"*{ext.upper()}"))
        return sorted(images)
    return []


def process_single_product(
    api_key: str,
    s3_client,
    r2_config: dict,
    template: dict,
    image_paths: list[Path],
    output_name: str,
    category: str,
    analyze: bool = False,
    hint: str | None = None,
) -> dict:
    """Process one product through the full pipeline. Returns a result dict."""
    result = {
        "product": output_name,
        "status": "pending",
        "image_paths": [str(p) for p in image_paths],
    }

    print(f"\n{'='*60}")
    print(f"Product: {output_name}")
    print(f"  Images: {len(image_paths)} file(s)")
    print(f"  Analyze: {'yes' if analyze else 'no'}")
    print(f"{'='*60}")

    # Step 1: Upload to R2
    print("\n[1/4] Uploading to R2...")
    product_urls = upload_product_images(s3_client, r2_config, image_paths)
    if not product_urls:
        result["status"] = "failed"
        result["error"] = "No images uploaded successfully"
        print("ERROR: No images uploaded. Skipping this product.")
        return result
    result["product_urls"] = product_urls

    # Step 2: Vision analysis (optional)
    product_analysis = None
    if analyze:
        print("\n[2/4] Analyzing product via Gemini 3 Flash...")
        try:
            product_analysis = analyze_product(api_key, product_urls, hint)
            print(f"  Product type: {product_analysis.get('product_type', '?')}")
            print(f"  Material: {product_analysis.get('material', '?')}")
            result["analysis"] = product_analysis
        except Exception as e:
            print(f"  WARNING: Vision analysis failed: {e}")
            print("  Continuing without analysis...")
    else:
        print("\n[2/4] Skipping vision analysis (use --analyze to enable)")

    # Step 3: Build prompt
    print("\n[3/4] Building prompt...")
    prompt_json = build_prompt_json(template, product_urls, product_analysis)

    prompt_path = PROJECT_ROOT / "prompts" / category / f"{output_name}.json"
    prompt_path.parent.mkdir(parents=True, exist_ok=True)
    with open(prompt_path, "w", encoding="utf-8") as f:
        json.dump(prompt_json, f, indent=2, ensure_ascii=False)
    print(f"  Saved prompt: {prompt_path}")
    result["prompt_file"] = str(prompt_path)

    # Step 4: Generate image
    print("\n[4/4] Generating image via Nano Banana 2...")
    fmt = prompt_json.get("api_parameters", {}).get("output_format", "jpg")
    image_path = PROJECT_ROOT / "images" / category / f"{output_name}.{fmt}"
    image_path.parent.mkdir(parents=True, exist_ok=True)

    prompt_for_api = json.loads(json.dumps(prompt_json))

    class MockArgs:
        aspect_ratio = None
        resolution = None
        format = None
        google_search = False

    try:
        task_id = create_task(api_key, prompt_for_api, MockArgs())
        print(f"  Task ID: {task_id}")
        result["task_id"] = task_id

        data = poll_task(api_key, task_id)
        image_url = download_image(data, image_path)

        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "task_id": task_id,
            "prompt_file": str(prompt_path),
            "output_file": str(image_path),
            "aspect_ratio": prompt_json.get("api_parameters", {}).get("aspect_ratio", "auto"),
            "resolution": prompt_json.get("api_parameters", {}).get("resolution", "2K"),
            "state": "success",
            "cost_time_ms": data.get("costTime"),
            "image_url": image_url,
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "pipeline": True,
            "template": template.get("template_name", "unknown"),
            "product_urls": product_urls,
        }
        log_task(log_entry)

        result["status"] = "success"
        result["output_image"] = str(image_path)
        result["image_url"] = image_url
        print(f"  Image saved: {image_path}")

    except SystemExit:
        result["status"] = "failed"
        result["error"] = "Image generation failed"
        print("  ERROR: Image generation failed.")
    except Exception as e:
        result["status"] = "failed"
        result["error"] = str(e)
        print(f"  ERROR: {e}")

    return result


def run_batch_parallel(
    api_key: str,
    s3_client,
    r2_config: dict,
    template: dict,
    products: list[dict],
    category: str,
    analyze: bool,
    hint: str | None,
    max_workers: int,
) -> list[dict]:
    """Run multiple products through the pipeline. Generation is sequential
    to avoid overwhelming the KIE API, but uploads happen per-product."""
    results = []
    for product in products:
        result = process_single_product(
            api_key=api_key,
            s3_client=s3_client,
            r2_config=r2_config,
            template=json.loads(json.dumps(template)),
            image_paths=product["images"],
            output_name=product["name"],
            category=category,
            analyze=analyze,
            hint=hint,
        )
        results.append(result)

    return results


def main():
    parser = argparse.ArgumentParser(
        description="Product photography pipeline: raw images -> styled output",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Single product, one image
  python scripts/product_pipeline.py --image raw/ring.jpg -t studio_velvet -n gold_ring

  # Single product, multiple angles
  python scripts/product_pipeline.py --image raw/ring_front.jpg raw/ring_side.jpg -t studio_velvet -n gold_ring

  # Single product with vision analysis
  python scripts/product_pipeline.py --image raw/ring.jpg -t studio_velvet -n gold_ring --analyze

  # Batch: each file is a separate product
  python scripts/product_pipeline.py --batch raw/ring.jpg raw/necklace.jpg -t studio_velvet --output-prefix spring

  # Batch from directory: each subfolder is a product with multiple angles
  python scripts/product_pipeline.py --batch-dir raw/spring_collection/ -t studio_velvet --output-prefix spring
        """,
    )

    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--image", nargs="+",
                      help="Single product: one or more image files (multiple = different angles of same product)")
    mode.add_argument("--batch", nargs="+",
                      help="Batch mode: each file is a separate product")
    mode.add_argument("--batch-dir",
                      help="Batch-dir mode: directory where each subfolder is a product")

    parser.add_argument("--template", "-t", required=True,
                        help="Brand template name or path")
    parser.add_argument("--output-name", "-n", default=None,
                        help="Output name for single product mode")
    parser.add_argument("--output-prefix", default=None,
                        help="Output name prefix for batch modes")
    parser.add_argument("--category", "-c", default="jewelry",
                        help="Output category subfolder (default: jewelry)")
    parser.add_argument("--analyze", action="store_true",
                        help="Enable vision analysis via Gemini 3 Flash")
    parser.add_argument("--hint", default=None,
                        help="Context hint for vision analysis (e.g., 'gold ring with diamond')")
    parser.add_argument("--max-workers", type=int, default=3,
                        help="Max parallel workers for batch mode (default: 3)")
    args = parser.parse_args()

    template_path = resolve_template(args.template)
    template = load_json(template_path)
    print(f"Template: {template.get('template_name', template_path.name)}")

    api_key = get_api_key()
    r2_config = get_r2_config()
    s3_client = get_s3_client(r2_config)

    if args.image:
        # Single product mode
        image_paths = []
        for p in args.image:
            collected = collect_images_from_path(Path(p))
            image_paths.extend(collected)

        if not image_paths:
            print("ERROR: No valid images found.")
            sys.exit(1)

        output_name = args.output_name or image_paths[0].stem
        result = process_single_product(
            api_key=api_key,
            s3_client=s3_client,
            r2_config=r2_config,
            template=template,
            image_paths=image_paths,
            output_name=output_name,
            category=args.category,
            analyze=args.analyze,
            hint=args.hint,
        )
        print_summary([result])

    elif args.batch:
        # Batch mode: each file is a separate product
        products = []
        prefix = args.output_prefix or "product"
        for i, p in enumerate(args.batch):
            path = Path(p)
            images = collect_images_from_path(path)
            if images:
                name = f"{prefix}_{path.stem}"
                products.append({"name": name, "images": images})
            else:
                print(f"WARNING: No valid images in {p}, skipping.")

        if not products:
            print("ERROR: No valid products found.")
            sys.exit(1)

        print(f"\nBatch: {len(products)} products")
        results = run_batch_parallel(
            api_key, s3_client, r2_config, template,
            products, args.category, args.analyze, args.hint, args.max_workers,
        )
        print_summary(results)

    elif args.batch_dir:
        # Batch-dir mode: each subfolder is a product
        batch_path = Path(args.batch_dir)
        if not batch_path.is_dir():
            print(f"ERROR: Not a directory: {batch_path}")
            sys.exit(1)

        prefix = args.output_prefix or batch_path.name
        products = []
        for subdir in sorted(batch_path.iterdir()):
            if subdir.is_dir():
                images = collect_images_from_path(subdir)
                if images:
                    name = f"{prefix}_{subdir.name}"
                    products.append({"name": name, "images": images})
            elif subdir.is_file() and subdir.suffix.lower() in ALLOWED_EXTENSIONS:
                images = collect_images_from_path(subdir)
                if images:
                    name = f"{prefix}_{subdir.stem}"
                    products.append({"name": name, "images": images})

        if not products:
            print(f"ERROR: No valid products found in {batch_path}")
            sys.exit(1)

        print(f"\nBatch-dir: {len(products)} products from {batch_path}")
        results = run_batch_parallel(
            api_key, s3_client, r2_config, template,
            products, args.category, args.analyze, args.hint, args.max_workers,
        )
        print_summary(results)


def print_summary(results: list[dict]):
    """Print a summary table of pipeline results."""
    print(f"\n{'='*60}")
    print("PIPELINE SUMMARY")
    print(f"{'='*60}")

    success = sum(1 for r in results if r["status"] == "success")
    failed = sum(1 for r in results if r["status"] == "failed")

    for r in results:
        status = "OK" if r["status"] == "success" else "FAIL"
        print(f"  [{status}] {r['product']}", end="")
        if r["status"] == "success":
            print(f" -> {r.get('output_image', '?')}")
        else:
            print(f" -- {r.get('error', 'unknown error')}")

    print(f"\nTotal: {len(results)} | Success: {success} | Failed: {failed}")


if __name__ == "__main__":
    main()
