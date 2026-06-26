#!/usr/bin/env python3
"""Build Nano Banana 2 workflow for BTC silver coins catalog."""

import json
import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CATALOG = PROJECT_ROOT / "scraped/bullion-trading-center/silver-coins/products.json"
CHUNK_SIZE = 8  # Safer batch size for multi-ref catalog grids


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


def chunk(items: list, size: int) -> list[list]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def main():
    coins = load_coins()
    variations = []
    for i, group in enumerate(chunk(coins, CHUNK_SIZE), 1):
        variations.append({
            "id": f"collection_coins_{i}",
            "label": f"Coins catalog part {i}/{len(chunk(coins, CHUNK_SIZE))} (Nano Banana)",
            "catalog": "coins",
            "skus": [p["sku"] for p in group],
            "composition": (
                f"Catalog grid on navy: {len(group)} round silver coins from references in neat rows, "
                "scale diameter by weight (8g/10g smallest, 50g largest), preserve each relief design exactly"
            ),
            "output": f"fb_square_collection_coins_{i}_nano.jpg",
        })

    wf = {
        "name": "btc_coins_nano",
        "description": "BTC silver coins catalog via Nano Banana 2 (Disney/Marvel OK)",
        "model": "nano-banana-2",
        "generator": "generate_kie.py",
        "approved_style": {
            "background": "deep midnight navy blue matte seamless studio backdrop",
            "lighting": "even balanced studio lighting, catalog clarity",
        },
        "aspect_ratio": "1:1",
        "resolution": "2K",
        "r2_prefix": "products/btc-silver",
        "prompts_dir": "prompts/bullion/catalog-nano",
        "images_dir": "images/bullion/catalog-nano",
        "catalogs": {
            "coins": "scraped/bullion-trading-center/silver-coins/products.json",
        },
        "variations": variations,
    }

    out = PROJECT_ROOT / "workflows" / "btc_coins_nano.json"
    out.write_text(json.dumps(wf, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(variations)} variations -> {out.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()
