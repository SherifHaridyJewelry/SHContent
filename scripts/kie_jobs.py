"""Shared helpers for KIE API job create, poll, download, and history logging."""

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
API_BASE = "https://api.kie.ai/api/v1/jobs"


def get_api_key() -> str:
    load_dotenv(PROJECT_ROOT / ".env")
    key = os.getenv("KIE_API_KEY")
    if not key:
        print("ERROR: KIE_API_KEY not set. Add it to .env or export it.")
        sys.exit(1)
    return key


def log_task(entry: dict) -> None:
    log_dir = PROJECT_ROOT / "logs"
    log_dir.mkdir(exist_ok=True)
    log_file = log_dir / "history.json"
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")


def create_task(api_key: str, payload: dict, *, exit_on_error: bool = True) -> str:
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    print(f"Creating task via KIE API (model={payload.get('model')})...")
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


def poll_task(api_key: str, task_id: str, max_attempts: int = 60, interval: int = 4) -> dict:
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
            sys.exit(1)

    print("ERROR: Timed out waiting for job completion.")
    sys.exit(1)


def download_image(data: dict, output_path: Path) -> str:
    result_json_str = data.get("resultJson", "{}")
    try:
        result_json = json.loads(result_json_str)
    except json.JSONDecodeError:
        result_json = {}

    urls = result_json.get("resultUrls", [])
    if not urls:
        print("ERROR: No image URL in resultJson.")
        print(json.dumps(data, indent=2))
        sys.exit(1)

    image_url = urls[0]
    print(f"Downloading image from {image_url}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    resp = requests.get(image_url, timeout=60)
    resp.raise_for_status()
    output_path.write_bytes(resp.content)
    print(f"Saved to {output_path}")
    return image_url
