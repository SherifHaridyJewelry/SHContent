"""App configuration and paths."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_ROOT = Path(os.getenv("DATA_ROOT", str(PROJECT_ROOT)))

SCRIPTS_DIR = PROJECT_ROOT / "scripts"
TEMPLATES_DIR = PROJECT_ROOT / "templates"
WORKFLOWS_DIR = PROJECT_ROOT / "workflows"
DATA_DIR = DATA_ROOT / "data"
RAW_JEWELRY_DIR = DATA_ROOT / "raw" / "jewelry"
IMAGES_DIR = DATA_ROOT / "images"
PROMPTS_DIR = DATA_ROOT / "prompts"
LOGS_DIR = DATA_ROOT / "logs"
HISTORY_FILE = LOGS_DIR / "history.json"

PRODUCTS_FILE = DATA_DIR / "jewelry_products.json"
JOBS_FILE = DATA_DIR / "jobs.json"
CATALOG_REVIEWS_FILE = DATA_DIR / "catalog_reviews.json"
CATALOG_EXPORTS_FILE = DATA_DIR / "catalog_exports.json"
EXPORTS_CATALOG_DIR = DATA_ROOT / "exports" / "catalog"

DEFAULT_WORKFLOW = WORKFLOWS_DIR / "jewelry_catalog.json"
MAX_PARALLEL_PRODUCTS = 3

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{(PROJECT_ROOT / 'data' / 'shcontent.db').as_posix()}",
)
APP_ENV = os.getenv("APP_ENV", "development")
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-in-production")
API_KEY = os.getenv("API_KEY", "")

_default_origins = "http://localhost:5173,http://127.0.0.1:5173"
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", _default_origins).split(",")
    if origin.strip()
]
