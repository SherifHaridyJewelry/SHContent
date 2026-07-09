"""Jewelry Workflow Management App — FastAPI entry point."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.api import abtest, catalog, history, jobs, products, reviews, scene_plates, templates
from app.config import PROJECT_ROOT

app = FastAPI(title="Jewelry Workflow", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r"http://(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}):5173",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(products.router, prefix="/api")
app.include_router(templates.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
app.include_router(history.router, prefix="/api")
app.include_router(catalog.router, prefix="/api")
app.include_router(reviews.router, prefix="/api")
app.include_router(scene_plates.router, prefix="/api")
app.include_router(abtest.router, prefix="/api")


@app.get("/abtest-picker.html")
def abtest_picker_page() -> FileResponse:
    path = PROJECT_ROOT / "web" / "abtest-picker.html"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Picker page not found")
    return FileResponse(path)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/assets/{path:path}")
def serve_asset(path: str) -> FileResponse:
    """Serve files under raw/, images/, or prompts/ by project-relative path."""
    allowed_prefixes = ("raw/", "images/", "prompts/")
    if not any(path.startswith(p) for p in allowed_prefixes):
        raise HTTPException(status_code=404, detail="Path not allowed")
    file_path = (PROJECT_ROOT / path).resolve()
    root = PROJECT_ROOT.resolve()
    if not str(file_path).startswith(str(root)):
        raise HTTPException(status_code=403, detail="Invalid path")
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path)
