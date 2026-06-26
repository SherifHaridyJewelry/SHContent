#!/usr/bin/env python3
"""Build workflows/btc_catalog_creatives.json from scraped BTC catalogs."""

import json
import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CHUNK_SIZE = 16  # GPT Image 2 input_urls max


def load_products(catalog_rel: str) -> list[dict]:
    data = json.loads((PROJECT_ROOT / catalog_rel).read_text(encoding="utf-8"))
    return [p for p in data["products"] if not p["sku"].startswith("EWX")]


def weight_sort_key(product: dict) -> tuple:
    sku = product["sku"]
    name = product.get("name", "")
    m = re.search(r"(\d+(?:\.\d+)?)\s*g", name, re.I)
    if m:
        return (0, float(m.group(1)))
    m = re.search(r"(\d+)\s*k", name, re.I)
    if m:
        return (0, float(m.group(1)) * 1000)
    if "5000" in sku or "5k" in name.lower():
        return (0, 5000.0)
    if "1000" in sku or "1kg" in name.lower():
        return (0, 1000.0)
    return (1, name)


def chunk(items: list, size: int) -> list[list]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def main():
    catalogs = {
        "ingots": "scraped/bullion-trading-center/silver-ingots/products.json",
        "coins": "scraped/bullion-trading-center/silver-coins/products.json",
        "bars": "scraped/bullion-trading-center/silver-bars/products.json",
        "wearables": "scraped/bullion-trading-center/silver-wearables/products.json",
    }

    variations = []

    # Bar trio with correct weight scaling
    cast_bars = ["ES999BXSRAR1000", "ES999BXSRARX500", "ES999BXSRARX250"]
    variations.append({
        "id": "bar_trio_1kg_500g_250g",
        "label": "Cast bars 1kg / 500g / 250g — weight-accurate scale",
        "catalog": "bars",
        "skus": cast_bars,
        "composition": (
            "Three cast BTC silver bars in one row on navy, STRICT weight-accurate scaling from "
            "references: 1kg bar length exactly 2.0× the 500g bar, 500g bar length exactly 2.0× "
            "the 250g bar, same height and thickness proportions, aligned on shared baseline, "
            "crisp cast surface detail"
        ),
        "output": "fb_square_bar_trio_scaled_gpt.jpg",
    })

    # All bars category (4 products)
    bar_products = sorted(load_products(catalogs["bars"]), key=weight_sort_key, reverse=True)
    bar_skus = [p["sku"] for p in bar_products]
    variations.append({
        "id": "collection_bars_all",
        "label": "Bars category — full range",
        "catalog": "bars",
        "skus": bar_skus,
        "composition": (
            "Full silver bars catalog on navy: every cast bar from references in one frame, "
            "weight-accurate relative sizing (5kg mega largest, then 1kg, 500g, 250g), "
            "organized left-to-right descending weight, shared baseline"
        ),
        "output": "fb_square_collection_bars_all_gpt.jpg",
    })

    # Wearables — all + solo
    wearables = sorted(load_products(catalogs["wearables"]), key=lambda p: p["name"])
    wear_skus = [p["sku"] for p in wearables]
    variations.append({
        "id": "wearables_all",
        "label": "Wearables — all bangles",
        "catalog": "wearables",
        "skus": wear_skus,
        "composition": (
            "All five silver bangle wearables from references in gentle arc on navy, "
            "each bracelet design distinct and legible, equal studio treatment"
        ),
        "output": "fb_square_wearables_all_gpt.jpg",
    })
    for p in wearables:
        slug = p["sku"].lower().replace("es999", "").replace("iw", "").replace("bw", "")[:12]
        variations.append({
            "id": f"wearable_solo_{slug}",
            "label": f"Wearable solo — {p['name'].strip()}",
            "catalog": "wearables",
            "skus": [p["sku"]],
            "composition": (
                f"Single silver bangle wearable ({p['name'].strip()}) from reference, "
                "centered hero on navy, slight angle showing bracelet depth"
            ),
            "output": f"fb_square_wearable_{p['sku'].lower()}_gpt.jpg",
        })

    # Ingots collection chunks
    ingots = sorted(load_products(catalogs["ingots"]), key=weight_sort_key)
    for i, group in enumerate(chunk(ingots, CHUNK_SIZE), 1):
        skus = [p["sku"] for p in group]
        variations.append({
            "id": f"collection_ingots_{i}",
            "label": f"Ingots catalog grid part {i}/{len(chunk(ingots, CHUNK_SIZE))}",
            "catalog": "ingots",
            "skus": skus,
            "composition": (
                f"Catalog grid on navy: {len(skus)} rectangular silver ingots from references in "
                "neat rows, each engraving legible, scale each ingot by gram weight relative to "
                "others in frame (smallest 5g, largest 100g), no overlapping products"
            ),
            "output": f"fb_square_collection_ingots_{i}_gpt.jpg",
        })

    # Coins collection chunks
    coins = sorted(load_products(catalogs["coins"]), key=weight_sort_key)
    for i, group in enumerate(chunk(coins, CHUNK_SIZE), 1):
        skus = [p["sku"] for p in group]
        variations.append({
            "id": f"collection_coins_{i}",
            "label": f"Coins catalog grid part {i}/{len(chunk(coins, CHUNK_SIZE))}",
            "catalog": "coins",
            "skus": skus,
            "composition": (
                f"Catalog grid on navy: {len(skus)} round silver coins from references in neat "
                "rows, scale diameter by weight (10g smallest, 50g largest), preserve each relief "
                "design exactly"
            ),
            "output": f"fb_square_collection_coins_{i}_gpt.jpg",
        })

    wf = {
        "name": "btc_catalog_creatives",
        "description": "BTC catalog creatives — bars scaled trio, wearables, per-category collections",
        "approved_style": {
            "background": "deep midnight navy blue matte seamless studio backdrop",
            "lighting": "even balanced studio lighting, large softboxes left and right, catalog clarity",
        },
        "model": "gpt-image-2-image-to-image",
        "aspect_ratio": "1:1",
        "resolution": "2K",
        "r2_prefix": "products/btc-silver",
        "prompts_dir": "prompts/bullion/catalog",
        "images_dir": "images/bullion/catalog",
        "catalogs": {
            "ingots": catalogs["ingots"],
            "coins": catalogs["coins"],
            "bars": catalogs["bars"],
            "wearables": catalogs["wearables"],
        },
        "variations": variations,
    }

    out = PROJECT_ROOT / "workflows" / "btc_catalog_creatives.json"
    out.write_text(json.dumps(wf, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(variations)} variations -> {out.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()
