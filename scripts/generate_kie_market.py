#!/usr/bin/env python3
"""Generate images via KIE market models (Seedream 4.5, Wan 2.7, etc.).

Unified prompt JSON:
  {
    "model": "seedream/4.5-edit",
    "prompt": "...",
    "input_urls": ["https://..."],
    "image_urls": ["..."],          // alias
    "api_parameters": {
      "aspect_ratio": "1:1",
      "quality": "high",            // seedream: basic | high
      "resolution": "2K",           // wan: 1K | 2K | 4K
      "n": 1,
      "watermark": false,
      "nsfw_checker": false
    }
  }

Docs:
  - https://docs.kie.ai/market/seedream/4-5-edit
  - https://kie.ai/wan-2-7-image?model=wan%2F2-7-image-pro
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from kie_jobs import PROJECT_ROOT, create_task, download_image, get_api_key, log_task, poll_task

SEEDREAM_MODEL = "seedream/4.5-edit"
WAN_PRO_MODEL = "wan/2-7-image-pro"

SEEDREAM_ASPECT = {"1:1", "4:3", "3:4", "16:9", "9:16", "2:3", "3:2", "21:9"}
WAN_ASPECT = {"1:1", "3:4", "4:3", "1:8", "8:1", "9:16", "16:9", "21:9"}


def resolve_model(name: str | None, prompt_data: dict) -> str:
    if name:
        return name
    model = prompt_data.get("model")
    if model:
        return model
    if prompt_data.get("input_urls") or prompt_data.get("image_urls"):
        return SEEDREAM_MODEL
    return WAN_PRO_MODEL


def get_image_urls(prompt_data: dict) -> list[str]:
    urls = prompt_data.get("image_urls") or prompt_data.get("input_urls") or []
    if not urls:
        print("ERROR: image_urls or input_urls required for market edit models.")
        sys.exit(1)
    return urls


def build_seedream_payload(prompt_data: dict, args) -> dict:
    api = prompt_data.get("api_parameters", {})
    aspect = args.aspect_ratio or api.get("aspect_ratio", "1:1")
    if aspect not in SEEDREAM_ASPECT:
        print(f"ERROR: Invalid aspect_ratio for Seedream: {aspect}")
        sys.exit(1)
    quality = api.get("quality", "high")
    if quality not in ("basic", "high"):
        print(f"ERROR: quality must be basic or high, got {quality}")
        sys.exit(1)

    inp = {
        "prompt": prompt_data.get("prompt", "").strip(),
        "image_urls": get_image_urls(prompt_data),
        "aspect_ratio": aspect,
        "quality": quality,
    }
    if "nsfw_checker" in api:
        inp["nsfw_checker"] = bool(api["nsfw_checker"])
    return {"model": SEEDREAM_MODEL, "input": inp}


def build_wan_payload(prompt_data: dict, args) -> dict:
    api = prompt_data.get("api_parameters", {})
    aspect = args.aspect_ratio or api.get("aspect_ratio", "1:1")
    if aspect not in WAN_ASPECT:
        print(f"ERROR: Invalid aspect_ratio for Wan: {aspect}")
        sys.exit(1)
    resolution = args.resolution or api.get("resolution", "2K")
    if resolution not in ("1K", "2K", "4K"):
        print(f"ERROR: resolution must be 1K, 2K, or 4K, got {resolution}")
        sys.exit(1)

    inp = {
        "prompt": prompt_data.get("prompt", "").strip(),
        "input_urls": get_image_urls(prompt_data),
        "aspect_ratio": aspect,
        "resolution": resolution,
        "n": int(api.get("n", 1)),
    }
    for key in ("watermark", "nsfw_checker", "thinking_mode", "enable_sequential", "seed"):
        if key in api:
            inp[key] = api[key]
    return {"model": WAN_PRO_MODEL, "input": inp}


def build_payload(prompt_data: dict, args) -> dict:
    model = resolve_model(args.model, prompt_data)
    if model == SEEDREAM_MODEL or model.startswith("seedream/"):
        return build_seedream_payload(prompt_data, args)
    if model == WAN_PRO_MODEL or model.startswith("wan/"):
        return build_wan_payload(prompt_data, args)
    print(f"ERROR: Unsupported model: {model}")
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Generate with KIE market models (Seedream, Wan)")
    parser.add_argument("prompt_file")
    parser.add_argument("output_file")
    parser.add_argument("--model", "-m", default=None)
    parser.add_argument("--aspect-ratio", "-ar", default=None)
    parser.add_argument("--resolution", "-r", default=None, help="Wan only: 1K, 2K, 4K")
    args = parser.parse_args()

    prompt_path = Path(args.prompt_file)
    if not prompt_path.is_absolute():
        prompt_path = PROJECT_ROOT / prompt_path
    output_path = Path(args.output_file)
    if not output_path.is_absolute():
        output_path = PROJECT_ROOT / output_path

    if not prompt_path.exists():
        print(f"ERROR: Prompt file not found: {prompt_path}")
        sys.exit(1)

    prompt_data = json.loads(prompt_path.read_text(encoding="utf-8"))
    payload = build_payload(prompt_data, args)
    api_key = get_api_key()
    task_id = create_task(api_key, payload)
    print(f"Task created: {task_id}")

    log_entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "task_id": task_id,
        "model": payload["model"],
        "prompt_file": str(prompt_path),
        "output_file": str(output_path),
        "aspect_ratio": payload["input"].get("aspect_ratio"),
        "resolution": payload["input"].get("resolution") or payload["input"].get("quality"),
        "generator": "generate_kie_market.py",
        "state": "submitted",
    }

    data = poll_task(api_key, task_id, max_attempts=90, interval=5)
    image_url = download_image(data, output_path)

    log_entry.update({
        "state": "success",
        "cost_time_ms": data.get("costTime"),
        "image_url": image_url,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    })
    log_task(log_entry)
    print(f"Task {task_id} logged to logs/history.json")


if __name__ == "__main__":
    main()
