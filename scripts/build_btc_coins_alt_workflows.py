#!/usr/bin/env python3
"""Build Seedream + Wan workflow JSONs for BTC silver coins (Disney/Marvel safe)."""

import json
import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CATALOG = PROJECT_ROOT / "scraped/bullion-trading-center/silver-coins/products.json"

STYLE_BG = (
    "deep midnight navy blue matte seamless studio backdrop — strong contrast "
    "against cool reflective silver"
)
STYLE_LIGHT = (
    "even balanced studio lighting, large softboxes left and right, catalog clarity"
)
PROMPT_SUFFIX = (
    "Square 1:1 Facebook ad. Preserve every coin relief and engraving exactly from "
    "references. Top margin for Meta copy. No added text overlays or watermarks."
)

COMPOSITION = (
    "Catalog grid on navy: arrange every silver coin from references in neat rows, "
    "scale diameter by weight (8g/10g smallest, 50g largest), each design legible, "
    "no overlapping products"
)

CHARACTER_RE = re.compile(
    r"deadpool|wolverin|thor|hulk|spider|iron.?man|donald|minnie|mickey|daisy|"
    r"scrooge|huey|dewey|louie|duck|stitch|lilo|angel",
    re.I,
)


def weight_key(p: dict) -> tuple:
    name = p.get("name", "")
    m = re.search(r"(\d+(?:\.\d+)?)\s*g", name, re.I)
    return (float(m.group(1)) if m else 0, p["sku"])


def load_coins() -> list[dict]:
    data = json.loads(CATALOG.read_text(encoding="utf-8"))
    return sorted(
        [p for p in data["products"] if not p["sku"].startswith("EWX")],
        key=weight_key,
    )


def is_character(p: dict) -> bool:
    text = f"{p.get('name', '')} {p.get('url_key', '')}"
    return bool(CHARACTER_RE.search(text))


def chunk(items: list, size: int) -> list[list]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def make_variation(vid: str, label: str, skus: list[str], output: str) -> dict:
    return {
        "id": vid,
        "label": label,
        "catalog": "coins",
        "skus": skus,
        "composition": COMPOSITION,
        "output": output,
    }


def seedream_variations(coins: list[dict]) -> list[dict]:
    """Smaller batches for Seedream — licensed characters in groups of 6."""
    religious = [p for p in coins if not is_character(p)]
    character = [p for p in coins if is_character(p)]
    variations = []

    if religious:
        variations.append(make_variation(
            "collection_coins_religious",
            f"Coins — religious/phrases ({len(religious)} coins)",
            [p["sku"] for p in religious],
            "fb_square_collection_coins_religious_seedream.jpg",
        ))

    for i, group in enumerate(chunk(character, 6), 1):
        variations.append(make_variation(
            f"collection_coins_character_{i}",
            f"Coins — character/licensed part {i} ({len(group)} coins)",
            [p["sku"] for p in group],
            f"fb_square_collection_coins_character_{i}_seedream.jpg",
        ))

    return variations


def wan_variations(coins: list[dict]) -> list[dict]:
    variations = []
    for i, group in enumerate(chunk(coins, 9), 1):
        variations.append(make_variation(
            f"collection_coins_{i}",
            f"Coins catalog part {i} ({len(group)} coins)",
            [p["sku"] for p in group],
            f"fb_square_collection_coins_{i}_wan.jpg",
        ))
    return variations


def base_workflow(name: str, model: str, variations: list[dict], images_dir: str, prompts_dir: str) -> dict:
    api_params = {
        "aspect_ratio": "1:1",
        "nsfw_checker": False,
    }
    if model.startswith("seedream"):
        api_params["quality"] = "high"
    else:
        api_params["resolution"] = "2K"
        api_params["n"] = 1
        api_params["watermark"] = False

    return {
        "name": name,
        "description": f"BTC silver coins catalog via {model}",
        "model": model,
        "generator": "generate_kie_market.py",
        "approved_style": {
            "background": "deep midnight navy blue matte seamless studio backdrop",
            "lighting": STYLE_LIGHT,
        },
        "aspect_ratio": "1:1",
        "r2_prefix": "products/btc-silver",
        "prompts_dir": prompts_dir,
        "images_dir": images_dir,
        "api_parameters": api_params,
        "catalogs": {
            "coins": "scraped/bullion-trading-center/silver-coins/products.json",
        },
        "variations": variations,
    }


def main():
    coins = load_coins()
    seedream = base_workflow(
        "btc_coins_seedream",
        "seedream/4.5-edit",
        seedream_variations(coins),
        "images/bullion/catalog-seedream",
        "prompts/bullion/catalog-seedream",
    )
    wan = base_workflow(
        "btc_coins_wan",
        "wan/2-7-image-pro",
        wan_variations(coins),
        "images/bullion/catalog-wan",
        "prompts/bullion/catalog-wan",
    )

    (PROJECT_ROOT / "workflows" / "btc_coins_seedream.json").write_text(
        json.dumps(seedream, indent=2) + "\n", encoding="utf-8"
    )
    (PROJECT_ROOT / "workflows" / "btc_coins_wan.json").write_text(
        json.dumps(wan, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Seedream: {len(seedream['variations'])} jobs")
    for v in seedream["variations"]:
        print(f"  - {v['id']}: {len(v['skus'])} SKUs")
    print(f"Wan: {len(wan['variations'])} jobs")


if __name__ == "__main__":
    main()
