#!/usr/bin/env python3
"""Fetch and download an image for an existing KIE API task.

Supports a single check or polling mode to wait for completion.
"""

import argparse
import json
import sys
import time
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


def fetch_task(api_key: str, task_id: str) -> dict:
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


def download_from_data(data: dict, output_path: Path):
    result_json_str = data.get("resultJson", "{}")
    try:
        result_json = json.loads(result_json_str)
    except json.JSONDecodeError:
        result_json = {}

    urls = result_json.get("resultUrls", [])
    if not urls:
        print("No image URL found in task result.")
        print(json.dumps(data, indent=2))
        sys.exit(1)

    image_url = urls[0]
    print(f"Downloading image from {image_url}")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    resp = requests.get(image_url, timeout=60)
    resp.raise_for_status()
    output_path.write_bytes(resp.content)
    print(f"Saved to {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Fetch an image for an existing KIE API task")
    parser.add_argument("task_id", help="The KIE task ID to fetch")
    parser.add_argument("output_file", help="Path to save the downloaded image")
    parser.add_argument("--poll", "-p", action="store_true", help="Poll until task completes (default: single check)")
    parser.add_argument("--interval", type=int, default=4, help="Polling interval in seconds (default: 4)")
    parser.add_argument("--max-attempts", type=int, default=60, help="Max poll attempts (default: 60)")
    args = parser.parse_args()

    output_path = Path(args.output_file)
    api_key = get_api_key()

    if args.poll:
        for attempt in range(1, args.max_attempts + 1):
            data = fetch_task(api_key, args.task_id)
            state = data.get("state", "")
            print(f"Poll {attempt}: state = {state}")

            if state in ("success", "completed"):
                download_from_data(data, output_path)
                return
            if state in ("failed", "fail", "error"):
                print("Task failed.")
                print(json.dumps(data, indent=2))
                sys.exit(1)

            time.sleep(args.interval)

        print("ERROR: Timed out waiting for task completion.")
        sys.exit(1)
    else:
        data = fetch_task(api_key, args.task_id)
        state = data.get("state", "")
        print(f"Task state: {state}")

        if state in ("success", "completed"):
            download_from_data(data, output_path)
        elif state in ("failed", "fail", "error"):
            print("Task failed.")
            print(json.dumps(data, indent=2))
            sys.exit(1)
        else:
            print(f"Task not yet complete. Use --poll to wait.")
            print(json.dumps(data, indent=2))


if __name__ == "__main__":
    main()
