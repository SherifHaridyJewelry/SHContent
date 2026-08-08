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

CHAIN_SYSTEM_PROMPT = """You are an expert jewelry appraiser analyzing a full-layout bracelet or chain photograph.

The image shows the complete bracelet with all links and clasp visible. Your task is precise structural documentation.

Rules:
1. Count every individual link visible in the full layout. Report as total_link_count (integer).
2. Describe one repeating pattern unit as chain_pattern_unit (ordered list of link shapes, e.g. round, elongated_oval).
3. Describe link_separations (how links connect).
4. Identify clasp_type.
5. Note visibility_note only if any links overlap or are partially occluded.
6. Material and finish in material field.
7. product_description: 2-4 sentences on material, finish, and construction only. Do NOT describe drape, wrist fit, or how it sits when worn.
8. Do NOT invent links you cannot see. If uncertain on count, state best estimate and explain in visibility_note."""

CHAIN_RESPONSE_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "chain_analysis",
        "strict": True,
        "schema": {
            "type": "object",
            "title": "Chain Bracelet Analysis",
            "properties": {
                "product_type": {"type": "string"},
                "material": {"type": "string"},
                "dimensions": {"type": "string"},
                "clasp_type": {"type": "string"},
                "chain_pattern_unit": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "One repeat cycle of link shapes in order",
                },
                "total_link_count": {
                    "type": "integer",
                    "description": "Total links visible in the full bracelet layout",
                },
                "link_separations": {"type": "string"},
                "visibility_note": {"type": "string"},
                "distinctive_features": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "product_description": {"type": "string"},
            },
            "required": [
                "product_type", "material", "dimensions", "clasp_type",
                "chain_pattern_unit", "total_link_count", "link_separations",
                "visibility_note", "distinctive_features", "product_description",
            ],
        },
    },
}

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


def analyze_product(
    api_key: str,
    image_urls: list[str],
    hint: str | None = None,
    *,
    analyze_mode: str = "standard",
) -> dict:
    """Send product image(s) to Gemini 3 Flash and return structured description.

    analyze_mode: standard | chain_structured (bracelet/chain structural fields)
    """
    content = []

    if analyze_mode == "chain_structured":
        prompt_text = (
            "Analyze this full-layout bracelet/chain photograph. "
            "Count all visible links and document the repeating pattern unit."
        )
        system_prompt = CHAIN_SYSTEM_PROMPT
        response_format = CHAIN_RESPONSE_FORMAT
    else:
        prompt_text = "Analyze the product shown in the provided image(s) and describe it in detail."
        system_prompt = SYSTEM_PROMPT
        response_format = RESPONSE_FORMAT

    if hint:
        prompt_text += f" Additional context: {hint}"
    if len(image_urls) > 1:
        prompt_text += (
            f" You are seeing {len(image_urls)} images of the SAME product from different angles. "
            "Cross-reference all angles for the most accurate description."
        )

    content.append({"type": "text", "text": prompt_text})

    for url in image_urls:
        content.append({
            "type": "image_url",
            "image_url": {"url": url}
        })

    payload = {
        "messages": [
            {"role": "system", "content": [{"type": "text", "text": system_prompt}]},
            {"role": "user", "content": content},
        ],
        "stream": False,
        "include_thoughts": False,
        "reasoning_effort": "high",
        "response_format": response_format,
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    endpoint = f"{GEMINI_API_BASE}/{GEMINI_MODEL}/v1/chat/completions"
    print(f"Analyzing {len(image_urls)} product image(s) via Gemini 3 Flash...")

    try:
        resp = requests.post(endpoint, headers=headers, json=payload, timeout=180)
        resp.raise_for_status()
        result = resp.json()
    except requests.exceptions.HTTPError as e:
        body = e.response.text[:500] if e.response is not None else ""
        raise RuntimeError(f"Gemini API HTTP {e.response.status_code}: {body}") from e
    except requests.exceptions.Timeout as e:
        raise RuntimeError("Gemini API timed out after 180s") from e
    except Exception as e:
        raise RuntimeError(f"Gemini API error: {e}") from e

    choices = result.get("choices", [])
    if not choices:
        raise RuntimeError(f"No response from Gemini: {json.dumps(result)[:500]}")

    content_str = choices[0].get("message", {}).get("content", "")

    # Gemini occasionally wraps JSON in markdown fences.
    stripped = content_str.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        stripped = "\n".join(lines).strip()

    try:
        analysis = json.loads(stripped)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Gemini returned invalid JSON: {content_str[:500]}") from e

    usage = result.get("usage", {})
    if usage:
        print(f"Tokens used: {usage.get('prompt_tokens', '?')} in / {usage.get('completion_tokens', '?')} out")

    return analysis


def analyze_from_local(
    api_key: str,
    image_paths: list[Path],
    hint: str | None = None,
    *,
    analyze_mode: str = "standard",
) -> tuple[dict, list[str]]:
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

    return analyze_product(api_key, image_urls, hint, analyze_mode=analyze_mode), image_urls


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
    parser.add_argument("--chain-structured", action="store_true",
                        help="Use chain/bracelet structural analysis schema (link count, pattern unit)")
    args = parser.parse_args()

    api_key = get_api_key()
    mode = "chain_structured" if args.chain_structured else "standard"

    if args.urls:
        image_urls = args.images
        analysis = analyze_product(api_key, image_urls, args.hint, analyze_mode=mode)
        uploaded_urls = image_urls
    else:
        image_paths = [Path(p) for p in args.images]
        for p in image_paths:
            if not p.exists():
                print(f"ERROR: File not found: {p}")
                sys.exit(1)
        analysis, uploaded_urls = analyze_from_local(
            api_key, image_paths, args.hint, analyze_mode=mode,
        )

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
