"""App configuration and paths."""

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = PROJECT_ROOT / "scripts"
TEMPLATES_DIR = PROJECT_ROOT / "templates"
WORKFLOWS_DIR = PROJECT_ROOT / "workflows"
DATA_DIR = PROJECT_ROOT / "data"
RAW_JEWELRY_DIR = PROJECT_ROOT / "raw" / "jewelry"
IMAGES_DIR = PROJECT_ROOT / "images"
PROMPTS_DIR = PROJECT_ROOT / "prompts"
LOGS_DIR = PROJECT_ROOT / "logs"
HISTORY_FILE = LOGS_DIR / "history.json"

PRODUCTS_FILE = DATA_DIR / "jewelry_products.json"
JOBS_FILE = DATA_DIR / "jobs.json"
CATALOG_REVIEWS_FILE = DATA_DIR / "catalog_reviews.json"
CATALOG_EXPORTS_FILE = DATA_DIR / "catalog_exports.json"
EXPORTS_CATALOG_DIR = PROJECT_ROOT / "exports" / "catalog"

DEFAULT_WORKFLOW = WORKFLOWS_DIR / "jewelry_catalog.json"
MAX_PARALLEL_PRODUCTS = 3
