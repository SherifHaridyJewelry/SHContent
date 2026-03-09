#!/usr/bin/env python3
"""Manage Nano Banana 2 JSON prompt files.

Commands:
    list      List all prompt files in prompts/
    show      Pretty-print a prompt file
    validate  Validate a prompt file against the expected schema
    create    Create a new prompt file interactively
"""

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PROMPTS_DIR = PROJECT_ROOT / "prompts"

VALID_ASPECT_RATIOS = {
    "1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3",
    "4:5", "5:4", "8:1", "9:16", "16:9", "21:9", "auto",
}
VALID_RESOLUTIONS = {"1K", "2K", "4K"}
VALID_FORMATS = {"jpg", "png"}


def cmd_list(args):
    """List all JSON prompt files in the prompts directory."""
    files = sorted(PROMPTS_DIR.glob("**/*.json"))
    if not files:
        print("No prompt files found in prompts/")
        return

    print(f"Found {len(files)} prompt file(s):\n")
    for f in files:
        rel = f.relative_to(PROJECT_ROOT)
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            prompt_preview = data.get("prompt", "")[:80]
            ar = data.get("api_parameters", {}).get("aspect_ratio", "auto")
            print(f"  {rel}")
            print(f"    aspect_ratio: {ar}")
            print(f"    prompt: {prompt_preview}...")
            print()
        except (json.JSONDecodeError, KeyError):
            print(f"  {rel}  [invalid JSON]")
            print()


def cmd_show(args):
    """Pretty-print a prompt file."""
    path = Path(args.file)
    if not path.exists():
        print(f"ERROR: File not found: {path}")
        sys.exit(1)

    data = json.loads(path.read_text(encoding="utf-8"))
    print(json.dumps(data, indent=2, ensure_ascii=False))


def cmd_validate(args):
    """Validate a prompt file against the Dense Narrative schema."""
    path = Path(args.file)
    if not path.exists():
        print(f"ERROR: File not found: {path}")
        sys.exit(1)

    errors = []
    warnings = []

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"FAIL: Invalid JSON - {e}")
        sys.exit(1)

    if not isinstance(data, dict):
        print("FAIL: Top-level value must be a JSON object")
        sys.exit(1)

    if "prompt" not in data:
        errors.append("Missing required field: 'prompt'")
    elif not isinstance(data["prompt"], str):
        errors.append("'prompt' must be a string")
    elif len(data["prompt"]) < 10:
        warnings.append("'prompt' is very short (< 10 chars)")
    elif len(data["prompt"]) > 20000:
        errors.append("'prompt' exceeds 20,000 character limit")

    if "negative_prompt" in data and not isinstance(data["negative_prompt"], str):
        errors.append("'negative_prompt' must be a string")

    if "image_input" in data:
        if not isinstance(data["image_input"], list):
            errors.append("'image_input' must be an array of URL strings")
        elif len(data["image_input"]) > 14:
            errors.append("'image_input' supports a maximum of 14 images")

    if "api_parameters" in data:
        ap = data["api_parameters"]
        if not isinstance(ap, dict):
            errors.append("'api_parameters' must be an object")
        else:
            ar = ap.get("aspect_ratio")
            if ar and ar not in VALID_ASPECT_RATIOS:
                errors.append(f"Invalid aspect_ratio '{ar}'. Valid: {sorted(VALID_ASPECT_RATIOS)}")
            res = ap.get("resolution")
            if res and res not in VALID_RESOLUTIONS:
                errors.append(f"Invalid resolution '{res}'. Valid: {sorted(VALID_RESOLUTIONS)}")
            fmt = ap.get("output_format")
            if fmt and fmt not in VALID_FORMATS:
                errors.append(f"Invalid output_format '{fmt}'. Valid: {sorted(VALID_FORMATS)}")

    if errors:
        print(f"FAIL: {len(errors)} error(s) found:\n")
        for e in errors:
            print(f"  - {e}")
        if warnings:
            print(f"\n{len(warnings)} warning(s):")
            for w in warnings:
                print(f"  - {w}")
        sys.exit(1)

    print("PASS: Prompt file is valid.")
    if warnings:
        print(f"\n{len(warnings)} warning(s):")
        for w in warnings:
            print(f"  - {w}")


def cmd_create(args):
    """Interactively create a new prompt file."""
    print("=== Nano Banana 2 Prompt Builder ===\n")

    prompt = input("Describe the image (prompt text):\n> ").strip()
    if not prompt:
        print("ERROR: Prompt cannot be empty.")
        sys.exit(1)

    negative = input("\nNegative prompt (comma-separated blockers, or press Enter to skip):\n> ").strip()

    print(f"\nAspect ratio options: {', '.join(sorted(VALID_ASPECT_RATIOS))}")
    ar = input("Aspect ratio [auto]: ").strip() or "auto"

    print(f"\nResolution options: {', '.join(sorted(VALID_RESOLUTIONS))}")
    res = input("Resolution [1K]: ").strip() or "1K"

    print(f"\nFormat options: {', '.join(sorted(VALID_FORMATS))}")
    fmt = input("Output format [jpg]: ").strip() or "jpg"

    gs_input = input("\nEnable Google Search grounding? (y/N): ").strip().lower()
    google_search = gs_input in ("y", "yes")

    data = {
        "prompt": prompt,
        "api_parameters": {
            "aspect_ratio": ar,
            "resolution": res,
            "output_format": fmt,
        },
    }
    if negative:
        data["negative_prompt"] = negative
    if google_search:
        data["api_parameters"]["google_search"] = True

    output_name = args.name if args.name else input("\nFilename (without .json): ").strip()
    if not output_name:
        print("ERROR: Filename cannot be empty.")
        sys.exit(1)

    if not output_name.endswith(".json"):
        output_name += ".json"

    output_path = PROMPTS_DIR / output_name
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\nSaved to {output_path.relative_to(PROJECT_ROOT)}")


def main():
    parser = argparse.ArgumentParser(description="Manage Nano Banana 2 prompt files")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("list", help="List all prompt files")

    p_show = sub.add_parser("show", help="Pretty-print a prompt file")
    p_show.add_argument("file", help="Path to the prompt JSON file")

    p_val = sub.add_parser("validate", help="Validate a prompt file")
    p_val.add_argument("file", help="Path to the prompt JSON file")

    p_create = sub.add_parser("create", help="Create a new prompt file interactively")
    p_create.add_argument("--name", "-n", default=None, help="Output filename (without .json)")

    args = parser.parse_args()

    commands = {
        "list": cmd_list,
        "show": cmd_show,
        "validate": cmd_validate,
        "create": cmd_create,
    }
    commands[args.command](args)


if __name__ == "__main__":
    main()
