#!/usr/bin/env python3
"""One-shot import from JSON files and filesystem into PostgreSQL/SQLite."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from app.config import (  # noqa: E402
    CATALOG_EXPORTS_FILE,
    CATALOG_REVIEWS_FILE,
    DATA_DIR,
    HISTORY_FILE,
    IMAGES_DIR,
    JOBS_FILE,
    PRODUCTS_FILE,
    PROJECT_ROOT as APP_ROOT,
)
from app.db.engine import engine, get_session
from app.db.models import Base
from app.db.repositories.catalog_outputs import CatalogOutputRepository
from app.db.repositories.exports import ExportRepository
from app.db.repositories.history import HistoryRepository
from app.db.repositories.jobs import JobRepository
from app.db.repositories.products import ProductRepository
from app.db.repositories.reviews import ReviewRepository
from app.db.repositories.scene_plates import ScenePlateRepository
from app.models.schemas import Job, Product, ScenePlateJob
from app.services.path_utils import normalize_project_path

if str(PROJECT_ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from naming import parse_product_id_from_output, parse_run_id_from_output  # noqa: E402

JEWELRY_IMAGES_DIR = IMAGES_DIR / "jewelry"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
SCENE_PLATE_JOBS_FILE = DATA_DIR / "scene_plate_jobs.json"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_scene_plate_path(path: str) -> bool:
    stem = Path(path).stem
    return stem.startswith("scene_plate_") or stem.startswith("distilled_")


def import_products() -> int:
    if not PRODUCTS_FILE.exists():
        return 0
    raw = json.loads(PRODUCTS_FILE.read_text(encoding="utf-8"))
    count = 0
    with get_session() as session:
        repo = ProductRepository(session)
        for item in raw:
            product = Product(**item)
            if product.last_output:
                product.last_output = normalize_project_path(
                    product.last_output, allowed_prefixes=("images/",)
                )
            if product.approved_output:
                product.approved_output = normalize_project_path(
                    product.approved_output, allowed_prefixes=("images/",)
                )
            repo.save(product)
            count += 1
    return count


def import_jobs() -> int:
    if not JOBS_FILE.exists():
        return 0
    raw = json.loads(JOBS_FILE.read_text(encoding="utf-8"))
    count = 0
    with get_session() as session:
        repo = JobRepository(session)
        for item in raw:
            repo.save(Job(**item))
            count += 1
    return count


def import_reviews() -> int:
    if not CATALOG_REVIEWS_FILE.exists():
        return 0
    raw = json.loads(CATALOG_REVIEWS_FILE.read_text(encoding="utf-8"))
    count = 0
    with get_session() as session:
        repo = ReviewRepository(session)
        for output_path, review in raw.items():
            normalized = normalize_project_path(output_path, allowed_prefixes=("images/",))
            if not normalized:
                continue
            repo.set_review(
                normalized,
                review["status"],
                product_id=review.get("product_id"),
                task_id=review.get("task_id"),
            )
            count += 1
    return count


def import_history() -> int:
    if not HISTORY_FILE.exists():
        return 0
    count = 0
    with get_session() as session:
        repo = HistoryRepository(session)
        for line in HISTORY_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            repo.upsert(entry)
            count += 1
    return count


def import_scene_plate_jobs() -> int:
    if not SCENE_PLATE_JOBS_FILE.exists():
        return 0
    raw = json.loads(SCENE_PLATE_JOBS_FILE.read_text(encoding="utf-8"))
    count = 0
    with get_session() as session:
        repo = ScenePlateRepository(session)
        for item in raw:
            repo.save(ScenePlateJob(**item))
            count += 1
    return count


def import_exports() -> int:
    if not CATALOG_EXPORTS_FILE.exists():
        return 0
    raw = json.loads(CATALOG_EXPORTS_FILE.read_text(encoding="utf-8"))
    from app.models.schemas import CatalogExportJob

    count = 0
    with get_session() as session:
        repo = ExportRepository(session)
        for item in raw:
            repo.save(CatalogExportJob(**item))
            count += 1
    return count


def import_catalog_outputs() -> int:
    products_by_id: dict[str, dict] = {}
    if PRODUCTS_FILE.exists():
        products_by_id = {p["id"]: p for p in json.loads(PRODUCTS_FILE.read_text(encoding="utf-8"))}

    history_by_output: dict[str, dict] = {}
    if HISTORY_FILE.exists():
        for line in HISTORY_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            if entry.get("state") != "success":
                continue
            output = normalize_project_path(entry.get("output_file"), allowed_prefixes=("images/",))
            if output:
                history_by_output[output] = entry

    by_path: dict[str, dict] = {}

    def upsert(data: dict, prefer: bool = False) -> None:
        path = data["output_path"]
        if path not in by_path or prefer:
            by_path[path] = data

    for product_id, product in products_by_id.items():
        output = normalize_project_path(product.get("last_output"), allowed_prefixes=("images/",))
        if not output:
            continue
        anchor = None
        for img in product.get("images", []):
            if img.get("role") == "anchor":
                anchor = normalize_project_path(img.get("path"), allowed_prefixes=("raw/", "images/"))
                break
        upsert(
            {
                "output_path": output,
                "product_id": product_id,
                "source": "product",
                "product_name": product.get("name"),
                "product_type": product.get("type"),
                "collection": product.get("collection"),
                "anchor_path": anchor,
                "run_id": parse_run_id_from_output(Path(output).stem),
                "job_id": parse_run_id_from_output(Path(output).stem),
            },
            prefer=True,
        )

    for output, entry in history_by_output.items():
        if not output.startswith("images/jewelry/"):
            continue
        stem = Path(output).stem
        pid = parse_product_id_from_output(stem)
        prod = products_by_id.get(pid) if pid else None
        anchor = None
        if prod:
            for img in prod.get("images", []):
                if img.get("role") == "anchor":
                    anchor = normalize_project_path(img.get("path"), allowed_prefixes=("raw/", "images/"))
                    break
        upsert(
            {
                "output_path": output,
                "product_id": pid,
                "source": "history",
                "task_id": entry.get("task_id"),
                "template": entry.get("template"),
                "timestamp": entry.get("completed_at") or entry.get("timestamp"),
                "image_url": entry.get("image_url"),
                "product_urls": entry.get("product_urls") or [],
                "output_r2_url": entry.get("output_r2_url"),
                "prompt_path": normalize_project_path(entry.get("prompt_file"), ("prompts/",)),
                "job_id": entry.get("job_id") or parse_run_id_from_output(stem),
                "run_id": entry.get("job_id") or parse_run_id_from_output(stem),
                "product_name": prod.get("name") if prod else Path(output).stem,
                "product_type": prod.get("type") if prod else None,
                "collection": prod.get("collection") if prod else None,
                "anchor_path": anchor,
            }
        )

    if JEWELRY_IMAGES_DIR.exists():
        for path in sorted(JEWELRY_IMAGES_DIR.iterdir()):
            if path.suffix.lower() not in IMAGE_EXTENSIONS:
                continue
            rel = str(path.relative_to(APP_ROOT)).replace("\\", "/")
            if rel in by_path:
                continue
            stem = path.stem
            pid = parse_product_id_from_output(stem)
            prod = products_by_id.get(pid) if pid else None
            anchor = None
            if prod:
                for img in prod.get("images", []):
                    if img.get("role") == "anchor":
                        anchor = normalize_project_path(img.get("path"), allowed_prefixes=("raw/", "images/"))
                        break
            upsert(
                {
                    "output_path": rel,
                    "product_id": pid,
                    "source": "filesystem",
                    "product_name": prod.get("name") if prod else path.stem,
                    "product_type": prod.get("type") if prod else None,
                    "collection": prod.get("collection") if prod else None,
                    "anchor_path": anchor,
                    "run_id": parse_run_id_from_output(stem),
                    "job_id": parse_run_id_from_output(stem),
                }
            )

    count = 0
    with get_session() as session:
        repo = CatalogOutputRepository(session)
        for data in by_path.values():
            data["is_scene_plate"] = _is_scene_plate_path(data["output_path"])
            repo.upsert(data)
            count += 1
    return count


def main() -> None:
    print(f"Database: {engine.url}")
    Base.metadata.create_all(bind=engine)
    print("Ensured tables exist")

    stats = {
        "products": import_products(),
        "jobs": import_jobs(),
        "reviews": import_reviews(),
        "history": import_history(),
        "scene_plate_jobs": import_scene_plate_jobs(),
        "exports": import_exports(),
        "catalog_outputs": import_catalog_outputs(),
    }
    print("Import complete:")
    for key, value in stats.items():
        print(f"  {key}: {value}")


if __name__ == "__main__":
    main()
