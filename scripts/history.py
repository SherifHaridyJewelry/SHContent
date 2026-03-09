#!/usr/bin/env python3
"""View and manage the task history log.

Commands:
    list      Show recent generation tasks
    show      Show full details for a specific task
    retry     Re-run a failed task using its original prompt and settings
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
LOG_FILE = PROJECT_ROOT / "logs" / "history.json"


def load_entries() -> list[dict]:
    if not LOG_FILE.exists():
        return []
    entries = []
    for line in LOG_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return entries


def cmd_list(args):
    """Show recent generation tasks."""
    entries = load_entries()
    if not entries:
        print("No tasks in history.")
        return

    count = args.count or 20
    entries = entries[-count:]

    header = f"{'TASK ID':<28} {'STATE':<10} {'ASPECT':<8} {'RES':<5} {'COST(s)':<8} {'TIMESTAMP':<26} {'OUTPUT'}"
    print(header)
    print("-" * len(header))

    for e in entries:
        task_id = e.get("task_id", "?")
        state = e.get("state", "?")
        ar = e.get("aspect_ratio", "?")
        res = e.get("resolution", "?")
        cost_ms = e.get("cost_time_ms")
        cost_s = f"{cost_ms / 1000:.1f}" if cost_ms else "-"
        ts = e.get("timestamp", "?")[:25]
        output = e.get("output_file", "?")

        print(f"{task_id:<28} {state:<10} {ar:<8} {res:<5} {cost_s:<8} {ts:<26} {output}")

    print(f"\nShowing {len(entries)} of {len(load_entries())} total entries.")


def cmd_show(args):
    """Show full details for a specific task."""
    entries = load_entries()
    matches = [e for e in entries if e.get("task_id") == args.task_id]

    if not matches:
        print(f"No entry found for task ID: {args.task_id}")
        sys.exit(1)

    entry = matches[-1]
    print(json.dumps(entry, indent=2, ensure_ascii=False))


def cmd_retry(args):
    """Re-run a failed task using its original prompt file and settings."""
    entries = load_entries()
    matches = [e for e in entries if e.get("task_id") == args.task_id]

    if not matches:
        print(f"No entry found for task ID: {args.task_id}")
        sys.exit(1)

    entry = matches[-1]
    prompt_file = entry.get("prompt_file")
    output_file = entry.get("output_file")

    if not prompt_file or not output_file:
        print("ERROR: Entry is missing prompt_file or output_file.")
        print(json.dumps(entry, indent=2))
        sys.exit(1)

    if not Path(prompt_file).exists():
        print(f"ERROR: Prompt file no longer exists: {prompt_file}")
        sys.exit(1)

    cmd = [
        sys.executable,
        str(PROJECT_ROOT / "scripts" / "generate_kie.py"),
        prompt_file,
        output_file,
    ]

    ar = entry.get("aspect_ratio")
    if ar and ar != "auto":
        cmd.extend(["--aspect-ratio", ar])

    res = entry.get("resolution")
    if res and res != "1K":
        cmd.extend(["--resolution", res])

    print(f"Retrying task {args.task_id}...")
    print(f"  Prompt: {prompt_file}")
    print(f"  Output: {output_file}")
    print(f"  Command: {' '.join(cmd)}\n")

    result = subprocess.run(cmd)
    sys.exit(result.returncode)


def main():
    parser = argparse.ArgumentParser(description="View and manage KIE task history")
    sub = parser.add_subparsers(dest="command", required=True)

    p_list = sub.add_parser("list", help="Show recent generation tasks")
    p_list.add_argument("--count", "-n", type=int, default=None, help="Number of entries to show (default: 20)")

    p_show = sub.add_parser("show", help="Show full details for a task")
    p_show.add_argument("task_id", help="The task ID to look up")

    p_retry = sub.add_parser("retry", help="Re-run a failed task")
    p_retry.add_argument("task_id", help="The task ID to retry")

    args = parser.parse_args()

    commands = {
        "list": cmd_list,
        "show": cmd_show,
        "retry": cmd_retry,
    }
    commands[args.command](args)


if __name__ == "__main__":
    main()
