#!/usr/bin/env python3
"""Manage brand templates for the product photography pipeline.

Core workflow: feed an inspiration image to Gemini 3 Flash, which analyzes
the photography style and outputs a structured template JSON. Also supports
listing, showing, validating, cloning, and adding style references.
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
TEMPLATES_DIR = PROJECT_ROOT / "templates"

GEMINI_API_BASE = "https://api.kie.ai"
GEMINI_MODEL = "gemini-3-flash"

TEMPLATE_SCHEMA = {
    "required": ["template_name", "category", "product_type", "scene", "camera",
                  "lighting", "style", "style_references", "quality_directives",
                  "negative_prompt", "api_parameters"],
    "scene_fields": ["surface", "background", "props", "arrangement"],
    "camera_fields": ["focal_length", "aperture", "iso", "lens_behavior", "shooting_angle"],
    "lighting_fields": ["setup", "quality"],
    "api_param_options": {
        "aspect_ratio": ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4",
                         "9:16", "16:9", "21:9", "auto"],
        "resolution": ["1K", "2K", "4K"],
        "output_format": ["jpg", "png"],
    },
}

SYSTEM_PROMPT = """You are an expert product photography analyst. You will be shown one or more inspiration images of product photography (jewelry, accessories, etc.).

Analyze the photography style and output a structured JSON template that captures:
- The scene setup (surface material, background, props, product arrangement)
- Camera settings (focal length, aperture, ISO, lens behavior, shooting angle)
- Lighting setup (light positions, modifiers, quality/mood)
- Overall photographic style
- Quality directives for photorealistic output
- A negative prompt listing things to avoid

Focus ONLY on the scene, lighting, camera, and style -- NOT on the specific product shown. The template should be reusable for ANY product of the same type placed in this same setting.

Describe the product_type based on what you see in the image (e.g., "ring", "necklace", "earrings", "bracelet", "brooch", "watch", "pendant", "general_jewelry").

Use photographic language: specify focal lengths in mm, apertures as f-stops, describe light positions relative to camera (camera-left, camera-right, overhead, behind), name modifier types (softbox, reflector, diffuser, snoot).

For the negative_prompt, always include: "cartoon, illustration, 3D render, CGI, plastic look, oversaturated, blurry product, watermark, text overlay" plus anything specific to avoid based on the style."""

RESPONSE_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "structured_output",
        "strict": True,
        "schema": {
            "type": "object",
            "title": "Brand Template",
            "description": "Product photography style template",
            "properties": {
                "template_name": {
                    "type": "string",
                    "description": "Short descriptive name for this template style"
                },
                "category": {
                    "type": "string",
                    "description": "Product category (e.g., jewelry, accessories, watches)"
                },
                "product_type": {
                    "type": "string",
                    "description": "Specific product type detected (e.g., ring, necklace, earrings, bracelet, brooch, watch, pendant, general_jewelry)"
                },
                "scene": {
                    "type": "object",
                    "properties": {
                        "surface": {"type": "string", "description": "What the product is placed on"},
                        "background": {"type": "string", "description": "What is behind/around the product"},
                        "props": {"type": "string", "description": "Any additional objects in the scene (or 'none')"},
                        "arrangement": {"type": "string", "description": "How the product is positioned/arranged"}
                    },
                    "required": ["surface", "background", "props", "arrangement"]
                },
                "camera": {
                    "type": "object",
                    "properties": {
                        "focal_length": {"type": "string", "description": "Lens focal length (e.g., '100mm macro')"},
                        "aperture": {"type": "string", "description": "F-stop (e.g., 'f/4.0')"},
                        "iso": {"type": "string", "description": "ISO sensitivity (e.g., '100')"},
                        "lens_behavior": {"type": "string", "description": "Focus behavior and bokeh characteristics"},
                        "shooting_angle": {"type": "string", "description": "Camera angle relative to subject"}
                    },
                    "required": ["focal_length", "aperture", "iso", "lens_behavior", "shooting_angle"]
                },
                "lighting": {
                    "type": "object",
                    "properties": {
                        "setup": {"type": "string", "description": "Detailed lighting setup (positions, modifiers, ratios)"},
                        "quality": {"type": "string", "description": "Overall light quality and mood"}
                    },
                    "required": ["setup", "quality"]
                },
                "style": {
                    "type": "string",
                    "description": "Overall photographic style (e.g., 'luxury product photography, editorial catalog')"
                },
                "quality_directives": {
                    "type": "string",
                    "description": "Specific quality requirements for photorealistic output"
                },
                "negative_prompt": {
                    "type": "string",
                    "description": "Comma-separated list of things to avoid in generation"
                }
            },
            "required": ["template_name", "category", "product_type", "scene",
                          "camera", "lighting", "style", "quality_directives",
                          "negative_prompt"]
        }
    }
}


def get_api_key():
    load_dotenv(PROJECT_ROOT / ".env")
    key = os.getenv("KIE_API_KEY")
    if not key:
        print("ERROR: KIE_API_KEY not set. Add it to .env or export it.")
        sys.exit(1)
    return key


def upload_to_r2(image_path: Path, prefix: str = "references") -> str:
    """Upload an image to R2 and return its public URL."""
    scripts_dir = Path(__file__).resolve().parent
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    from r2_upload import get_r2_config, get_s3_client, upload_file
    config = get_r2_config()
    s3 = get_s3_client(config)
    url = upload_file(s3, config, image_path, prefix=prefix)
    if not url:
        print(f"ERROR: Failed to upload {image_path} to R2")
        sys.exit(1)
    return url


def analyze_with_gemini(api_key: str, image_urls: list[str], product_type_hint: str | None = None) -> dict:
    """Send inspiration image(s) to Gemini 3 Flash and get a structured template."""
    content = []

    prompt_text = "Analyze the product photography style in the provided image(s) and generate a template."
    if product_type_hint:
        prompt_text += f" The product type is: {product_type_hint}."

    content.append({"type": "text", "text": prompt_text})

    for url in image_urls:
        content.append({
            "type": "image_url",
            "image_url": {"url": url}
        })

    payload = {
        "messages": [
            {"role": "system", "content": [{"type": "text", "text": SYSTEM_PROMPT}]},
            {"role": "user", "content": content},
        ],
        "stream": False,
        "include_thoughts": False,
        "reasoning_effort": "high",
        "response_format": RESPONSE_FORMAT,
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    endpoint = f"{GEMINI_API_BASE}/{GEMINI_MODEL}/v1/chat/completions"
    print(f"Sending {len(image_urls)} image(s) to Gemini 3 Flash for analysis...")

    try:
        resp = requests.post(endpoint, headers=headers, json=payload, timeout=120)
        resp.raise_for_status()
        result = resp.json()
    except requests.exceptions.HTTPError as e:
        print(f"ERROR: Gemini API returned {e.response.status_code}")
        print(e.response.text[:500])
        sys.exit(1)
    except Exception as e:
        print(f"ERROR calling Gemini API: {e}")
        sys.exit(1)

    choices = result.get("choices", [])
    if not choices:
        print("ERROR: No response from Gemini")
        print(json.dumps(result, indent=2))
        sys.exit(1)

    content_str = choices[0].get("message", {}).get("content", "")

    try:
        template = json.loads(content_str)
    except json.JSONDecodeError:
        print("ERROR: Gemini returned invalid JSON:")
        print(content_str[:500])
        sys.exit(1)

    return template


def validate_template(template: dict) -> list[str]:
    """Validate a template against the schema. Returns list of errors."""
    errors = []
    for field in TEMPLATE_SCHEMA["required"]:
        if field not in template:
            errors.append(f"Missing required field: {field}")

    if "scene" in template and isinstance(template["scene"], dict):
        for f in TEMPLATE_SCHEMA["scene_fields"]:
            if f not in template["scene"]:
                errors.append(f"Missing scene.{f}")

    if "camera" in template and isinstance(template["camera"], dict):
        for f in TEMPLATE_SCHEMA["camera_fields"]:
            if f not in template["camera"]:
                errors.append(f"Missing camera.{f}")

    if "lighting" in template and isinstance(template["lighting"], dict):
        for f in TEMPLATE_SCHEMA["lighting_fields"]:
            if f not in template["lighting"]:
                errors.append(f"Missing lighting.{f}")

    if "api_parameters" in template and isinstance(template["api_parameters"], dict):
        ap = template["api_parameters"]
        opts = TEMPLATE_SCHEMA["api_param_options"]
        if "aspect_ratio" in ap and ap["aspect_ratio"] not in opts["aspect_ratio"]:
            errors.append(f"Invalid aspect_ratio: {ap['aspect_ratio']} (valid: {opts['aspect_ratio']})")
        if "resolution" in ap and ap["resolution"] not in opts["resolution"]:
            errors.append(f"Invalid resolution: {ap['resolution']} (valid: {opts['resolution']})")
        if "output_format" in ap and ap["output_format"] not in opts["output_format"]:
            errors.append(f"Invalid output_format: {ap['output_format']} (valid: {opts['output_format']})")

    return errors


def slugify(name: str) -> str:
    return name.lower().replace(" ", "_").replace("-", "_").replace("__", "_").strip("_")


def cmd_generate(args):
    api_key = get_api_key()

    image_paths = [Path(p) for p in args.images]
    for p in image_paths:
        if not p.exists():
            print(f"ERROR: File not found: {p}")
            sys.exit(1)

    print("Uploading inspiration image(s) to R2...")
    image_urls = []
    for p in image_paths:
        url = upload_to_r2(p)
        print(f"  {p.name} -> {url}")
        image_urls.append(url)

    template = analyze_with_gemini(api_key, image_urls, args.product_type)

    template["style_references"] = image_urls
    template["api_parameters"] = template.get("api_parameters", {
        "aspect_ratio": "4:5",
        "resolution": "2K",
        "output_format": "jpg",
    })
    if "api_parameters" not in template or not template["api_parameters"]:
        template["api_parameters"] = {
            "aspect_ratio": "4:5",
            "resolution": "2K",
            "output_format": "jpg",
        }

    if args.name:
        template["template_name"] = args.name

    errors = validate_template(template)
    if errors:
        print("\nWARNING: Template has validation issues:")
        for e in errors:
            print(f"  - {e}")
        print("Template saved anyway -- please review and fix manually.\n")

    TEMPLATES_DIR.mkdir(exist_ok=True)
    filename = slugify(template.get("template_name", "unnamed_template")) + ".json"
    output_path = TEMPLATES_DIR / filename

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(template, f, indent=2, ensure_ascii=False)

    print(f"\nTemplate saved to: {output_path}")
    print("\n" + json.dumps(template, indent=2))
    print("\nReview the template and edit if needed before using it.")


def cmd_list(args):
    if not TEMPLATES_DIR.exists():
        print("No templates directory found.")
        return

    templates = sorted(TEMPLATES_DIR.glob("*.json"))
    if not templates:
        print("No templates found.")
        return

    print(f"{'Template':<40} {'Product Type':<18} {'Style'}")
    print("-" * 90)

    for tpath in templates:
        try:
            with open(tpath, "r", encoding="utf-8") as f:
                t = json.load(f)
            name = t.get("template_name", tpath.stem)
            ptype = t.get("product_type", "?")
            style = t.get("style", "?")[:40]

            if args.product_type and ptype != args.product_type:
                continue

            print(f"{name:<40} {ptype:<18} {style}")
        except (json.JSONDecodeError, KeyError):
            print(f"{tpath.name:<40} {'ERROR':>18} Could not parse")


def cmd_show(args):
    tpath = _resolve_template_path(args.template)
    with open(tpath, "r", encoding="utf-8") as f:
        template = json.load(f)
    print(json.dumps(template, indent=2))


def cmd_validate(args):
    tpath = _resolve_template_path(args.template)
    with open(tpath, "r", encoding="utf-8") as f:
        template = json.load(f)

    errors = validate_template(template)
    if errors:
        print(f"INVALID: {len(errors)} error(s) in {tpath.name}:")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)
    else:
        print(f"VALID: {tpath.name}")


def cmd_clone(args):
    src_path = _resolve_template_path(args.template)
    with open(src_path, "r", encoding="utf-8") as f:
        template = json.load(f)

    template["template_name"] = args.new_name
    filename = slugify(args.new_name) + ".json"
    dest_path = TEMPLATES_DIR / filename

    if dest_path.exists():
        print(f"ERROR: Template already exists: {dest_path}")
        sys.exit(1)

    with open(dest_path, "w", encoding="utf-8") as f:
        json.dump(template, f, indent=2, ensure_ascii=False)

    print(f"Cloned {src_path.name} -> {dest_path.name}")


def cmd_add_reference(args):
    tpath = _resolve_template_path(args.template)
    with open(tpath, "r", encoding="utf-8") as f:
        template = json.load(f)

    image_path = Path(args.image)
    if not image_path.exists():
        print(f"ERROR: File not found: {image_path}")
        sys.exit(1)

    print(f"Uploading {image_path.name} to R2...")
    url = upload_to_r2(image_path)
    print(f"  -> {url}")

    refs = template.get("style_references", [])
    refs.append(url)
    template["style_references"] = refs

    with open(tpath, "w", encoding="utf-8") as f:
        json.dump(template, f, indent=2, ensure_ascii=False)

    print(f"Added reference to {tpath.name} ({len(refs)} total)")


def _resolve_template_path(name_or_path: str) -> Path:
    path = Path(name_or_path)
    if path.exists():
        return path

    candidate = TEMPLATES_DIR / name_or_path
    if candidate.exists():
        return candidate

    candidate = TEMPLATES_DIR / (name_or_path + ".json")
    if candidate.exists():
        return candidate

    candidate = TEMPLATES_DIR / (slugify(name_or_path) + ".json")
    if candidate.exists():
        return candidate

    print(f"ERROR: Template not found: {name_or_path}")
    print(f"Looked in: {TEMPLATES_DIR}")
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Manage brand templates for product photography")
    sub = parser.add_subparsers(dest="command", required=True)

    p_gen = sub.add_parser("generate", help="Generate a template from inspiration image(s)")
    p_gen.add_argument("images", nargs="+", help="Inspiration image file(s)")
    p_gen.add_argument("--name", help="Template name (default: auto-generated by Gemini)")
    p_gen.add_argument("--product-type", help="Override product type detection (e.g., ring, necklace)")

    p_list = sub.add_parser("list", help="List available templates")
    p_list.add_argument("--product-type", help="Filter by product type")

    p_show = sub.add_parser("show", help="Show a template's contents")
    p_show.add_argument("template", help="Template filename or name")

    p_val = sub.add_parser("validate", help="Validate a template")
    p_val.add_argument("template", help="Template filename or name")

    p_clone = sub.add_parser("clone", help="Clone a template with a new name")
    p_clone.add_argument("template", help="Source template filename or name")
    p_clone.add_argument("new_name", help="Name for the cloned template")

    p_ref = sub.add_parser("add-reference", help="Add a style reference image to a template")
    p_ref.add_argument("template", help="Template filename or name")
    p_ref.add_argument("image", help="Inspiration image file to add")

    args = parser.parse_args()

    commands = {
        "generate": cmd_generate,
        "list": cmd_list,
        "show": cmd_show,
        "validate": cmd_validate,
        "clone": cmd_clone,
        "add-reference": cmd_add_reference,
    }
    commands[args.command](args)


if __name__ == "__main__":
    main()
