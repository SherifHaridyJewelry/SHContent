#!/usr/bin/env python3
"""Scrape products and images from Bullion Trading Center (Magento GraphQL)."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

import requests

GRAPHQL_URL = "https://magento-1205032-5154147.cloudwaysapps.com/graphql"
DEFAULT_CATEGORY_PATH = "silver/ingots"
PAGE_SIZE = 50

CATEGORY_QUERY = """
query CategoryProducts($urlPath: String!, $pageSize: Int!, $currentPage: Int!) {
  categoryList(filters: { url_path: { eq: $urlPath } }) {
    uid
    name
    url_path
    products(pageSize: $pageSize, currentPage: $currentPage) {
      total_count
      page_info {
        current_page
        page_size
        total_pages
      }
      items {
        sku
        name
        url_key
        image { url label }
        small_image { url }
        thumbnail { url }
        price_range {
          minimum_price {
            final_price { value currency }
            regular_price { value currency }
          }
        }
      }
    }
  }
}
"""


def uncached_image_url(url: str) -> str:
    """Strip Magento cache segment for a higher-resolution original when possible."""
    marker = "/media/catalog/product/cache/"
    if marker not in url:
        return url
    rest = url.split(marker, 1)[1]
    # rest is like: <hash>/<path...>
    parts = rest.split("/", 1)
    if len(parts) == 2:
        return url.split(marker)[0] + "/media/catalog/product/" + parts[1]
    return url


def slugify(text: str) -> str:
    text = text.strip().lower()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[-\s]+", "-", text)
    return text[:120].strip("-") or "product"


def fetch_category_products(
    category_path: str,
    page_size: int = PAGE_SIZE,
) -> tuple[dict, list[dict]]:
    session = requests.Session()
    session.headers.update(
        {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; SHContent-scraper/1.0)",
        }
    )

    all_items: list[dict] = []
    category_meta: dict | None = None
    current_page = 1

    while True:
        payload = {
            "query": CATEGORY_QUERY,
            "variables": {
                "urlPath": category_path,
                "pageSize": page_size,
                "currentPage": current_page,
            },
        }
        resp = session.post(GRAPHQL_URL, json=payload, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        if "errors" in data:
            raise RuntimeError(json.dumps(data["errors"], indent=2))

        categories = data["data"]["categoryList"]
        if not categories:
            raise RuntimeError(f"Category not found: {category_path}")

        cat = categories[0]
        if category_meta is None:
            category_meta = {
                "uid": cat["uid"],
                "name": cat["name"],
                "url_path": cat["url_path"],
                "source_url": f"https://shop.bulliontradingcenter.com/products/{category_path}",
            }

        products = cat["products"]
        items = products["items"] or []
        all_items.extend(items)

        page_info = products["page_info"]
        if current_page >= page_info["total_pages"]:
            break
        current_page += 1

    assert category_meta is not None
    category_meta["total_count"] = len(all_items)
    return category_meta, all_items


def download_image(session: requests.Session, url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        return dest

    for candidate in (uncached_image_url(url), url):
        try:
            r = session.get(candidate, timeout=60)
            if r.status_code == 200 and r.content:
                dest.write_bytes(r.content)
                return dest
        except requests.RequestException:
            continue

    raise RuntimeError(f"Failed to download image: {url}")


def image_extension(url: str) -> str:
    path = urlparse(url).path
    ext = Path(path).suffix.lower()
    return ext if ext in {".jpg", ".jpeg", ".png", ".webp", ".gif"} else ".jpg"


def scrape(
    category_path: str,
    output_dir: Path,
    download_images: bool = True,
) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    images_dir = output_dir / "images"

    print(f"Fetching category: {category_path}")
    category_meta, items = fetch_category_products(category_path)
    print(f"Found {len(items)} products")

    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0 (compatible; SHContent-scraper/1.0)"})

    products_out = []
    for i, item in enumerate(items, 1):
        sku = item["sku"]
        url_key = item.get("url_key") or slugify(item["name"])
        image_url = (item.get("image") or {}).get("url") or ""
        price = item.get("price_range", {}).get("minimum_price", {}).get("final_price", {})

        local_image = None
        if download_images and image_url:
            ext = image_extension(image_url)
            filename = f"{sku}{ext}".replace("/", "-")
            dest = images_dir / filename
            try:
                download_image(session, image_url, dest)
                local_image = str(dest.relative_to(output_dir))
                print(f"  [{i}/{len(items)}] {sku} -> {local_image}")
            except RuntimeError as e:
                print(f"  [{i}/{len(items)}] {sku} image failed: {e}", file=sys.stderr)
        else:
            print(f"  [{i}/{len(items)}] {sku}")

        products_out.append(
            {
                "sku": sku,
                "name": item["name"],
                "url_key": url_key,
                "product_url": f"https://shop.bulliontradingcenter.com/product/{url_key}",
                "price": price,
                "image_url": image_url,
                "image_url_uncached": uncached_image_url(image_url) if image_url else None,
                "local_image": local_image,
                "small_image_url": (item.get("small_image") or {}).get("url"),
                "thumbnail_url": (item.get("thumbnail") or {}).get("url"),
            }
        )

    manifest = {
        "scraped_from": category_meta["source_url"],
        "graphql_endpoint": GRAPHQL_URL,
        "category": category_meta,
        "products": products_out,
    }

    manifest_path = output_dir / "products.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nSaved manifest: {manifest_path}")
    if download_images:
        print(f"Images directory: {images_dir}")
    return manifest_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape BTC shop products via Magento GraphQL")
    parser.add_argument(
        "--category-path",
        default=DEFAULT_CATEGORY_PATH,
        help='Category url_path (default: "silver/ingots")',
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("scraped/bullion-trading-center/silver-ingots"),
        help="Output directory for products.json and images/",
    )
    parser.add_argument(
        "--no-images",
        action="store_true",
        help="Skip downloading product images",
    )
    args = parser.parse_args()

    scrape(
        category_path=args.category_path,
        output_dir=args.output_dir,
        download_images=not args.no_images,
    )


if __name__ == "__main__":
    main()
