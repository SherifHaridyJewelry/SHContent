#!/usr/bin/env python3
"""Generate product-free scene plates and optionally register them on a template.

Usage:
  python scripts/scene_plate_workflow.py
  python scripts/scene_plate_workflow.py --plate eggplant_cylinder --register
  python scripts/scene_plate_workflow.py --all --register
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = PROJECT_ROOT / "scripts"
WORKFLOW = PROJECT_ROOT / "workflows" / "scene_plate_jewelry.json"

if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from generate_kie import create_task, download_image, get_api_key, log_task, poll_task  # noqa: E402
from r2_upload import get_r2_config, get_s3_client, upload_file_with_key  # noqa: E402


class MockArgs:
    aspect_ratio = None
    resolution = None
    format = None
    google_search = False


def _load_workflow() -> dict:
    return json.loads(WORKFLOW.read_text(encoding="utf-8"))


def _register_scene_ref(template_name: str, scene_key: str, url: str, *, basename: str) -> None:
    sys.path.insert(0, str(PROJECT_ROOT))
    from app.services import template_service  # noqa: E402

    template_service.add_scene_references(
        template_name,
        product_type=scene_key,
        urls=[url],
        replace_basename=basename,
    )
    print(f"  Registered on {template_name} scene_references[{scene_key}]")


def generate_plate(plate: dict, *, register: bool = False) -> dict:
    prompt_path = PROJECT_ROOT / plate["prompt_file"]
    output_path = PROJECT_ROOT / plate["output_file"]
    prompt_json = json.loads(prompt_path.read_text(encoding="utf-8"))

    api_key = get_api_key()
    args = MockArgs()
    api = prompt_json.get("api_parameters", {})
    args.aspect_ratio = api.get("aspect_ratio", "4:5")
    args.resolution = api.get("resolution", "2K")
    args.format = api.get("output_format", "jpg")

    print(f"\nGenerating scene plate: {plate['id']}")
    task_id = create_task(api_key, json.loads(json.dumps(prompt_json)), args)
    data = poll_task(api_key, task_id)
    image_url = download_image(data, output_path)

    r2_url = None
    try:
        config = get_r2_config()
        s3 = get_s3_client(config)
        object_key = f"references/scenes/{plate['template']}/{output_path.name}"
        r2_url = upload_file_with_key(s3, config, output_path, object_key)
    except Exception as e:
        print(f"  WARNING: R2 upload failed: {e}")

    log_task({
        "timestamp": data.get("createTime"),
        "task_id": task_id,
        "prompt_file": str(prompt_path),
        "output_file": str(output_path),
        "aspect_ratio": args.aspect_ratio,
        "resolution": args.resolution,
        "state": "success",
        "image_url": image_url,
        "output_r2_url": r2_url,
        "scene_plate": plate["id"],
    })

    if register and r2_url:
        _register_scene_ref(
            plate["template"],
            plate["scene_key"],
            r2_url,
            basename=output_path.stem,
        )

    return {
        "id": plate["id"],
        "output": str(output_path),
        "image_url": image_url,
        "output_r2_url": r2_url,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate jewelry scene plates")
    parser.add_argument("--plate", help="Plate id from workflow config")
    parser.add_argument("--all", action="store_true", help="Generate all configured plates")
    parser.add_argument("--register", action="store_true", help="Register R2 URLs on template scene_references")
    args = parser.parse_args()

    wf = _load_workflow()
    plates = wf.get("plates", [])
    if args.plate:
        plates = [p for p in plates if p["id"] == args.plate]
    elif not args.all:
        parser.error("Specify --plate <id> or --all")

    if not plates:
        print("No matching plates found.")
        sys.exit(1)

    results = [generate_plate(p, register=args.register) for p in plates]
    print("\nScene plate summary:")
    for r in results:
        print(f"  {r['id']}: {r['output']}")
        if r.get("output_r2_url"):
            print(f"    R2: {r['output_r2_url']}")


if __name__ == "__main__":
    main()
