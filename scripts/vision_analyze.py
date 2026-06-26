#!/usr/bin/env python3
"""Analyze product images using KIE Gemini 3 Flash vision.

Sends one or more product image URLs to Gemini 3 Flash and returns a
structured JSON description of the product -- material, type, dimensions,
distinctive features, and a dense photographic-language description
suitable for injection into a Dense Narrative prompt.

This step is optional in the pipeline (disabled by default, enabled with
--analyze). When multiple images of the same product are provided (different
angles), they are all sent in a single request so Gemini can cross-reference
them for a more accurate description.
"""

import argparse
import json
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv
import os

PROJECT_ROOT = Path(__file__).resolve().parent.parent

GEMINI_API_BASE = "https://api.kie.ai"
GEMINI_MODEL = "gemini-3-flash"

SYSTEM_PROMPT = """You are an expert product photographer and jewelry appraiser. You will be shown one or more photographs of the SAME product taken from different angles.

Your task is to produce a detailed, structured description of the product ONLY. Ignore the background, any hands holding it, display stands, or packaging.

Follow these rules strictly:

1. PRODUCT TYPE: Identify the specific type (ring, necklace, chain, pendant, earrings, bracelet, bangle, cuff, brooch, watch, anklet, cufflinks, hair_accessory, or other).

2. MATERIAL: Describe the metal type and finish based on visual cues (e.g., "yellow gold, high-polish finish" or "sterling silver, brushed satin texture"). If uncertain, say "appears to be" rather than stating definitively.

3. DIMENSIONS: Estimate visible dimensions using standard jewelry sizing language (e.g., "approximately 5mm width", "estimated 18-inch length", "medium-sized pendant roughly 2cm diameter").

4. DISTINCTIVE FEATURES: List 3-7 specific visual features -- construction patterns, clasp types, stone settings, engravings, textures, link styles, etc.

5. PRODUCT DESCRIPTION: Write a single dense paragraph (3-6 sentences) describing the product in photographic/editorial language. Focus on:
   - How light interacts with the surfaces (specular highlights, reflections, matte absorption)
   - Physical construction details visible in the images
   - Texture and material qualities
   - How the piece would drape, sit, or present when displayed
   - Use language consistent with luxury product photography copywriting

Do NOT describe how the product should be photographed. Do NOT describe a scene or setting. Only describe the product itself."""

RESPONSE_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "structured_output",
        "strict": True,
        "schema": {
            "type": "object",
            "title": "Product Analysis",
            "description": "Structured product description from vision analysis",
            "properties": {
                "product_type": {
                    "type": "string",
                    "description": "Specific product type (ring, necklace, chain, pendant, earrings, bracelet, bangle, cuff, brooch, watch, anklet, cufflinks, hair_accessory, other)"
                },
                "material": {
                    "type": "string",
                    "description": "Metal/material type and finish (e.g., 'yellow gold, high-polish finish')"
                },
                "dimensions": {
                    "type": "string",
                    "description": "Estimated dimensions in standard jewelry sizing (e.g., 'approximately 5mm width rope chain, estimated 18 inches')"
                },
                "distinctive_features": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "3-7 specific visual features"
                },
                "product_description": {
                    "type": "string",
                    "description": "Dense photographic-language paragraph describing the product (3-6 sentences)"
                }
            },
            "required": ["product_type", "material", "dimensions",
                          "distinctive_features", "product_description"]
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


def analyze_product(api_key: str, image_urls: list[str], hint: str | None = None) -> dict:
    """Send product image(s) to Gemini 3 Flash and return structured description."""
    content = []

    prompt_text = "Analyze the product shown in the provided image(s) and describe it in detail."
    if hint:
        prompt_text += f" Additional context: {hint}"
    if len(image_urls) > 1:
        prompt_text += f" You are seeing {len(image_urls)} images of the SAME product from different angles. Cross-reference all angles for the most accurate description."

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
    print(f"Analyzing {len(image_urls)} product image(s) via Gemini 3 Flash...")

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
        analysis = json.loads(content_str)
    except json.JSONDecodeError:
        print("ERROR: Gemini returned invalid JSON:")
        print(content_str[:500])
        sys.exit(1)

    usage = result.get("usage", {})
    if usage:
        print(f"Tokens used: {usage.get('prompt_tokens', '?')} in / {usage.get('completion_tokens', '?')} out")

    return analysis


def analyze_from_local(api_key: str, image_paths: list[Path], hint: str | None = None) -> dict:
    """Upload local images to R2 first, then analyze."""
    scripts_dir = Path(__file__).resolve().parent
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    from r2_upload import get_r2_config, get_s3_client, upload_file

    config = get_r2_config()
    s3 = get_s3_client(config)

    image_urls = []
    for p in image_paths:
        print(f"Uploading {p.name} to R2...", end=" ")
        url = upload_file(s3, config, p, prefix="products")
        if not url:
            print(f"FAILED")
            sys.exit(1)
        print(f"OK -> {url}")
        image_urls.append(url)

    return analyze_product(api_key, image_urls, hint), image_urls


def main():
    parser = argparse.ArgumentParser(
        description="Analyze product images using Gemini 3 Flash vision"
    )
    parser.add_argument("images", nargs="+",
                        help="Product image files (local paths) or URLs (if --urls flag)")
    parser.add_argument("--urls", action="store_true",
                        help="Treat image arguments as URLs instead of local file paths")
    parser.add_argument("--hint", default=None,
                        help="Optional context hint (e.g., 'this is a pair of hoop earrings')")
    parser.add_argument("--output", "-o", default=None,
                        help="Save analysis JSON to file")
    parser.add_argument("--quiet", "-q", action="store_true",
                        help="Only output the JSON result")
    args = parser.parse_args()

    api_key = get_api_key()

    if args.urls:
        image_urls = args.images
        analysis = analyze_product(api_key, image_urls, args.hint)
        uploaded_urls = image_urls
    else:
        image_paths = [Path(p) for p in args.images]
        for p in image_paths:
            if not p.exists():
                print(f"ERROR: File not found: {p}")
                sys.exit(1)
        analysis, uploaded_urls = analyze_from_local(api_key, image_paths, args.hint)

    analysis["_source_urls"] = uploaded_urls

    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(analysis, f, indent=2, ensure_ascii=False)
        if not args.quiet:
            print(f"\nAnalysis saved to: {output_path}")

    if not args.quiet:
        print("\n--- Product Analysis ---")
    print(json.dumps(analysis, indent=2))


if __name__ == "__main__":
    main()
