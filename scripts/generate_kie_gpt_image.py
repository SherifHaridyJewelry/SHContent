#!/usr/bin/env python3
"""Generate images via KIE GPT Image 2 models.

Supports:
  - gpt-image-2-text-to-image  (prompt only)
  - gpt-image-2-image-to-image (prompt + input_urls)

Prompt JSON schema:
  {
    "model": "gpt-image-2-image-to-image",
    "prompt": "...",
    "negative_prompt": "optional, appended to prompt",
    "input_urls": ["https://..."],   # required for image-to-image
    "image_input": ["..."],          # alias for input_urls (nano-banana compat)
    "api_parameters": {
      "aspect_ratio": "1:1",
      "resolution": "2K"
    }
  }

Docs: https://docs.kie.ai/market/gpt/gpt-image-2-image-to-image
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from kie_jobs import PROJECT_ROOT, create_task, download_image, get_api_key, log_task, poll_task

MODEL_ALIASES = {
    "t2i": "gpt-image-2-text-to-image",
    "i2i": "gpt-image-2-image-to-image",
}
VALID_MODELS = {"gpt-image-2-text-to-image", "gpt-image-2-image-to-image"}

GPT_ASPECT_RATIOS = {
    "auto", "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5",
    "16:9", "9:16", "2:1", "1:2", "3:1", "1:3", "21:9", "9:21",
}
GPT_RESOLUTIONS = {"1K", "2K", "4K"}

# Per KIE OpenAPI: 4:5 and 5:4 only support 1K on GPT i2i.
GPT_1K_ONLY_ASPECT_RATIOS = {"4:5", "5:4"}


def resolve_model(name: str | None, prompt_data: dict) -> str:
    if name:
        return MODEL_ALIASES.get(name, name)
    model = prompt_data.get("model")
    if model in VALID_MODELS:
        return model
    if prompt_data.get("input_urls") or prompt_data.get("image_input"):
        return "gpt-image-2-image-to-image"
    return "gpt-image-2-text-to-image"


def build_prompt_text(prompt_data: dict) -> str:
    prompt = prompt_data.get("prompt", "").strip()
    negative = prompt_data.get("negative_prompt", "").strip()
    if negative:
        prompt = f"{prompt}\n\nAvoid: {negative}"
    return prompt


def build_payload(prompt_data: dict, args) -> dict:
    model = resolve_model(args.model, prompt_data)
    api_params = prompt_data.get("api_parameters", {})
    aspect_ratio = args.aspect_ratio or api_params.get("aspect_ratio", "auto")
    resolution = args.resolution or api_params.get("resolution", "1K")

    if aspect_ratio not in GPT_ASPECT_RATIOS:
        raise ValueError(
            f"Invalid aspect_ratio '{aspect_ratio}'. Use: {', '.join(sorted(GPT_ASPECT_RATIOS))}"
        )
    if resolution not in GPT_RESOLUTIONS:
        raise ValueError(
            f"Invalid resolution '{resolution}'. Use: {', '.join(sorted(GPT_RESOLUTIONS))}"
        )

    if (
        model == "gpt-image-2-image-to-image"
        and aspect_ratio in GPT_1K_ONLY_ASPECT_RATIOS
        and resolution != "1K"
    ):
        print(
            f"WARNING: GPT i2i aspect ratio {aspect_ratio} only supports 1K; "
            f"downgrading resolution from {resolution} to 1K."
        )
        resolution = "1K"

    input_payload = {
        "prompt": build_prompt_text(prompt_data),
        "aspect_ratio": aspect_ratio,
        "resolution": resolution,
    }

    input_urls = prompt_data.get("input_urls") or prompt_data.get("image_input")
    if model == "gpt-image-2-image-to-image":
        if not input_urls:
            raise ValueError(
                "image-to-image requires input_urls (or image_input) in the prompt file."
            )
        input_payload["input_urls"] = input_urls

    return {"model": model, "input": input_payload}


def main():
    parser = argparse.ArgumentParser(description="Generate with GPT Image 2 via KIE API")
    parser.add_argument("prompt_file", help="Path to GPT Image 2 prompt JSON")
    parser.add_argument("output_file", help="Path for the downloaded image")
    parser.add_argument(
        "--model", "-m",
        default=None,
        choices=["gpt-image-2-text-to-image", "gpt-image-2-image-to-image", "t2i", "i2i"],
        help="Override model (default: from prompt file or inferred from input_urls)",
    )
    parser.add_argument("--aspect-ratio", "-ar", default=None, help="Aspect ratio (1:1, 4:3, 9:16, auto, ...)")
    parser.add_argument("--resolution", "-r", default=None, choices=["1K", "2K", "4K"], help="Output resolution")
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

    with open(prompt_path, "r", encoding="utf-8") as f:
        prompt_data = json.load(f)

    try:
        payload = build_payload(prompt_data, args)
    except ValueError as e:
        print(f"ERROR: {e}")
        sys.exit(1)
    api_key = get_api_key()
    task_id = create_task(api_key, payload)
    print(f"Task created: {task_id}")

    log_entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "task_id": task_id,
        "model": payload["model"],
        "prompt_file": str(prompt_path),
        "output_file": str(output_path),
        "aspect_ratio": payload["input"]["aspect_ratio"],
        "resolution": payload["input"]["resolution"],
        "generator": "generate_kie_gpt_image.py",
        "state": "submitted",
    }

    data = poll_task(api_key, task_id)
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
