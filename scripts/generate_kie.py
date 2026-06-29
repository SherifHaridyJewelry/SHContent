#!/usr/bin/env python3
"""Generate an image via the KIE API using the Nano Banana 2 model.

Reads a JSON prompt file (Dense Narrative format), submits it to the
KIE createTask endpoint, polls until completion, downloads the result,
and logs the task to logs/history.json.
"""

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv
import os

PROJECT_ROOT = Path(__file__).resolve().parent.parent
API_BASE = "https://api.kie.ai/api/v1/jobs"


def get_api_key():
    load_dotenv(PROJECT_ROOT / ".env")
    key = os.getenv("KIE_API_KEY")
    if not key:
        print("ERROR: KIE_API_KEY not set. Add it to .env or export it.")
        sys.exit(1)
    return key


def log_task(entry: dict):
    """Append a task record to logs/history.json (JSON Lines format)."""
    log_dir = PROJECT_ROOT / "logs"
    log_dir.mkdir(exist_ok=True)
    log_file = log_dir / "history.json"
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")


def create_task(api_key: str, prompt_json: dict, args, *, exit_on_error: bool = True) -> str:
    image_input = prompt_json.pop("image_input", None) or prompt_json.pop("input_urls", None)
    api_parameters = prompt_json.pop("api_parameters", {})
    for key in ("input_urls", "image_urls", "model", "settings"):
        prompt_json.pop(key, None)

    prompt_string = json.dumps(prompt_json)

    payload = {
        "model": "nano-banana-2",
        "input": {
            "prompt": prompt_string,
            "aspect_ratio": args.aspect_ratio or api_parameters.get("aspect_ratio", "auto"),
            "resolution": args.resolution or api_parameters.get("resolution", "1K"),
            "output_format": args.format or api_parameters.get("output_format", "jpg"),
        },
    }

    if args.google_search or api_parameters.get("google_search"):
        payload["input"]["google_search"] = True

    if image_input:
        payload["input"]["image_input"] = image_input

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    print("Creating task via KIE API...")
    try:
        resp = requests.post(f"{API_BASE}/createTask", headers=headers, json=payload, timeout=30)
        resp.raise_for_status()
        result = resp.json()
    except Exception as e:
        print(f"ERROR creating task: {e}")
        if "resp" in locals():
            print(resp.text)
        if exit_on_error:
            sys.exit(1)
        raise RuntimeError(f"KIE createTask failed: {e}") from e

    task_id = result.get("data", {}).get("taskId")
    if not task_id:
        msg = f"No taskId returned: {json.dumps(result, indent=2)}"
        print(f"ERROR: {msg}")
        if exit_on_error:
            sys.exit(1)
        raise RuntimeError(msg)

    return task_id


def fetch_task(api_key: str, task_id: str) -> dict:
    """Fetch current KIE task state (single check, no polling)."""
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    resp = requests.get(
        f"{API_BASE}/recordInfo",
        headers=headers,
        params={"taskId": task_id},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json().get("data", {})


def poll_task(
    api_key: str,
    task_id: str,
    max_attempts: int = 60,
    interval: int = 4,
    *,
    exit_on_error: bool = True,
) -> dict:
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    for attempt in range(1, max_attempts + 1):
        time.sleep(interval)
        try:
            resp = requests.get(
                f"{API_BASE}/recordInfo",
                headers=headers,
                params={"taskId": task_id},
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json().get("data", {})
        except Exception as e:
            print(f"Poll {attempt}: Error - {e}")
            continue

        if not data:
            print(f"Poll {attempt}: Empty data, retrying...")
            continue

        state = data.get("state", "")
        print(f"Poll {attempt}: state = {state}")

        if state in ("success", "completed"):
            return data
        if state in ("failed", "fail", "error"):
            print("ERROR: Task failed on server side.")
            print(json.dumps(data, indent=2))
            if exit_on_error:
                sys.exit(1)
            raise RuntimeError(f"KIE task failed: {data}")

    msg = "Timed out waiting for job completion."
    print(f"ERROR: {msg}")
    if exit_on_error:
        sys.exit(1)
    raise RuntimeError(msg)


def download_image(data: dict, output_path: Path, *, exit_on_error: bool = True) -> str:
    result_json_str = data.get("resultJson", "{}")
    try:
        result_json = json.loads(result_json_str)
    except json.JSONDecodeError:
        result_json = {}

    urls = result_json.get("resultUrls", [])
    if not urls:
        msg = "No image URL in resultJson."
        if exit_on_error:
            print(f"ERROR: {msg}")
            print(json.dumps(data, indent=2))
            sys.exit(1)
        raise ValueError(msg)

    image_url = urls[0]
    print(f"Downloading image from {image_url}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    resp = requests.get(image_url, timeout=60)
    resp.raise_for_status()
    output_path.write_bytes(resp.content)
    print(f"Saved to {output_path}")
    return image_url


def main():
    parser = argparse.ArgumentParser(description="Generate an image with Nano Banana 2 via KIE API")
    parser.add_argument("prompt_file", help="Path to a JSON prompt file (Dense Narrative format)")
    parser.add_argument("output_file", help="Path for the downloaded image")
    parser.add_argument("--aspect-ratio", "-ar", default=None, help="Aspect ratio (e.g. 4:5, 16:9, auto)")
    parser.add_argument("--resolution", "-r", default=None, choices=["1K", "2K", "4K"], help="Output resolution")
    parser.add_argument("--format", "-f", default=None, choices=["jpg", "png"], help="Output image format")
    parser.add_argument("--google-search", "-g", action="store_true", help="Enable Google Search grounding")
    args = parser.parse_args()

    prompt_path = Path(args.prompt_file)
    output_path = Path(args.output_file)

    if not prompt_path.exists():
        print(f"ERROR: Prompt file not found: {prompt_path}")
        sys.exit(1)

    with open(prompt_path, "r", encoding="utf-8") as f:
        prompt_json = json.load(f)

    api_key = get_api_key()
    task_id = create_task(api_key, prompt_json, args)
    print(f"Task created: {task_id}")

    log_entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "task_id": task_id,
        "prompt_file": str(prompt_path),
        "output_file": str(output_path),
        "aspect_ratio": args.aspect_ratio or "auto",
        "resolution": args.resolution or "1K",
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
