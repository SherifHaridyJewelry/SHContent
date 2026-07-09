"""Single-image download and background ZIP export for catalog images."""

from __future__ import annotations

import json
import re
import threading
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import requests
from fastapi import HTTPException
from fastapi.responses import FileResponse, RedirectResponse

from app.config import EXPORTS_CATALOG_DIR, PROJECT_ROOT
from app.db.engine import get_session
from app.db.repositories.catalog_outputs import CatalogOutputRepository
from app.db.repositories.exports import ExportRepository
from app.models.schemas import (
    CatalogExportCounts,
    CatalogExportCreate,
    CatalogExportFilters,
    CatalogExportJob,
    CatalogExportScope,
    CatalogExportStatus,
    CatalogItem,
)
from app.services.catalog_service import _row_to_item, normalize_output_path

_lock = threading.Lock()
_running_exports: set[str] = set()

SAFE_NAME_RE = re.compile(r"[^\w\s\-().]+", re.UNICODE)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_dirs() -> None:
    EXPORTS_CATALOG_DIR.mkdir(parents=True, exist_ok=True)


def _persist_export(job: CatalogExportJob) -> CatalogExportJob:
    with get_session() as session:
        return ExportRepository(session).save(job)


def list_exports(page: int = 1, page_size: int = 20) -> tuple[list[CatalogExportJob], int]:
    with get_session() as session:
        return ExportRepository(session).list_paginated(page, page_size)


def get_export(export_id: str) -> CatalogExportJob | None:
    with get_session() as session:
        return ExportRepository(session).get(export_id)


def _friendly_filename(item: CatalogItem) -> str:
    base = item.output_label or item.product_name
    if not base:
        base = Path(item.output_path).stem
    cleaned = SAFE_NAME_RE.sub("", base).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    if not cleaned:
        cleaned = Path(item.output_path).stem
    ext = Path(item.output_path).suffix or ".jpg"
    return f"{cleaned}{ext}"


def _zip_entry_path(item: CatalogItem, filename: str) -> str:
    collection = (item.collection or "uncategorized").strip()
    collection = SAFE_NAME_RE.sub("", collection).strip() or "uncategorized"
    status = item.review_status or "pending"
    return f"{collection}/{status}/{filename}"


def _resolve_local_path(output_path: str) -> Path | None:
    normalized = normalize_output_path(output_path)
    if not normalized or not normalized.startswith("images/"):
        return None
    file_path = (PROJECT_ROOT / normalized).resolve()
    root = PROJECT_ROOT.resolve()
    if not str(file_path).startswith(str(root)):
        return None
    if file_path.is_file():
        return file_path
    return None


def _remote_url(item: CatalogItem) -> str | None:
    return item.output_r2_url or item.image_url


def _find_catalog_item(output_path: str) -> CatalogItem | None:
    normalized = normalize_output_path(output_path)
    if not normalized:
        return None
    with get_session() as session:
        row = CatalogOutputRepository(session).get(normalized)
        if not row:
            return None
        return _row_to_item(row, None, None)


def _items_for_export(data: CatalogExportCreate) -> list[CatalogItem]:
    with get_session() as session:
        repo = CatalogOutputRepository(session)
        if data.scope == CatalogExportScope.selected:
            if not data.output_paths:
                raise HTTPException(
                    status_code=400, detail="No output_paths provided for selected scope"
                )
            normalized_paths = [
                normalize_output_path(path)
                for path in data.output_paths
                if normalize_output_path(path)
            ]
            by_path = repo.get_by_paths(normalized_paths)
            return [
                _row_to_item(by_path[path], None, None)
                for path in normalized_paths
                if path in by_path
            ]

        if data.scope == CatalogExportScope.all_catalog:
            rows = repo.list_paths_for_export()
        else:
            filters = data.filters or CatalogExportFilters()
            rows = repo.list_paths_for_export(
                collection=filters.collection,
                product_type=filters.product_type,
                review_status=filters.review_status,
                scene_plates_only=filters.scene_plates_only,
                sort=filters.sort,
            )
        return [_row_to_item(row, None, None) for row in rows]


def download_catalog_image(output_path: str) -> FileResponse | RedirectResponse:
    normalized = normalize_output_path(output_path)
    if not normalized or not normalized.startswith("images/"):
        raise HTTPException(status_code=400, detail="Invalid output path")

    item = _find_catalog_item(normalized)
    filename = _friendly_filename(item) if item else Path(normalized).name

    local = _resolve_local_path(normalized)
    if local:
        return FileResponse(
            local,
            filename=filename,
            media_type="application/octet-stream",
        )

    if item:
        remote = _remote_url(item)
        if remote:
            return RedirectResponse(url=remote)

    raise HTTPException(status_code=404, detail="Image file not found")


def create_export(data: CatalogExportCreate) -> CatalogExportJob:
    items = _items_for_export(data)
    if not items:
        raise HTTPException(status_code=400, detail="No images match export scope")

    export_id = str(uuid.uuid4())[:8]
    now = _now()
    job = CatalogExportJob(
        id=export_id,
        status=CatalogExportStatus.pending,
        scope=data.scope,
        filters=data.filters,
        output_paths=data.output_paths,
        counts=CatalogExportCounts(total=len(items)),
        created_at=now,
        updated_at=now,
    )
    _persist_export(job)

    if not _spawn_export_thread(export_id):
        raise HTTPException(status_code=409, detail="Export already running")

    return job


def _spawn_export_thread(export_id: str) -> bool:
    with _lock:
        if export_id in _running_exports:
            return False
        _running_exports.add(export_id)

    def run() -> None:
        try:
            _run_export(export_id)
        finally:
            with _lock:
                _running_exports.discard(export_id)

    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    return True


def _fetch_remote_bytes(url: str) -> bytes | None:
    try:
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()
        return resp.content
    except Exception:
        return None


def _run_export(export_id: str) -> None:
    job = get_export(export_id)
    if not job:
        return

    job.status = CatalogExportStatus.running
    job.updated_at = _now()
    _persist_export(job)

    data = CatalogExportCreate(
        scope=job.scope,
        output_paths=job.output_paths,
        filters=job.filters,
    )
    try:
        items = _items_for_export(data)
    except HTTPException as e:
        job.status = CatalogExportStatus.failed
        job.error = str(e.detail)
        job.updated_at = _now()
        _persist_export(job)
        return

    zip_name = f"catalog-export-{export_id}.zip"
    zip_path = EXPORTS_CATALOG_DIR / zip_name
    used_names: dict[str, int] = {}
    manifest_items: list[dict] = []
    counts = CatalogExportCounts(total=len(items))

    try:
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for item in items:
                filename = _friendly_filename(item)
                if filename in used_names:
                    used_names[filename] += 1
                    stem = Path(filename).stem
                    ext = Path(filename).suffix
                    filename = f"{stem}-{used_names[filename]}{ext}"
                else:
                    used_names[filename] = 1

                entry_path = _zip_entry_path(item, filename)
                local = _resolve_local_path(item.output_path)
                source = "local"
                error = None

                if local:
                    zf.write(local, arcname=entry_path)
                    counts.exported += 1
                else:
                    remote = _remote_url(item)
                    if remote:
                        data_bytes = _fetch_remote_bytes(remote)
                        if data_bytes:
                            zf.writestr(entry_path, data_bytes)
                            counts.exported += 1
                            counts.remote_fetched += 1
                            source = "remote"
                        else:
                            counts.failed += 1
                            error = "remote_fetch_failed"
                    else:
                        counts.skipped += 1
                        error = "no_local_or_remote"

                manifest_items.append(
                    {
                        "output_path": item.output_path,
                        "zip_entry": entry_path if not error else None,
                        "product_id": item.product_id,
                        "product_name": item.product_name,
                        "collection": item.collection,
                        "review_status": item.review_status or "pending",
                        "source": source if not error else None,
                        "error": error,
                    }
                )

            manifest = {
                "scope": job.scope.value,
                "created_at": job.created_at,
                "filters": job.filters.model_dump() if job.filters else {},
                "counts": counts.model_dump(),
                "items": manifest_items,
            }
            zf.writestr("manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False))

        if counts.exported == 0:
            job.status = CatalogExportStatus.failed
            job.error = f"No images exported ({counts.skipped} skipped, {counts.failed} failed)"
            job.zip_path = None
            zip_path.unlink(missing_ok=True)
        else:
            job.status = CatalogExportStatus.success
            job.zip_path = str(zip_path.relative_to(PROJECT_ROOT)).replace("\\", "/")
            job.error = None
        job.counts = counts
    except Exception as e:
        job.status = CatalogExportStatus.failed
        job.error = str(e)
        if zip_path.exists():
            zip_path.unlink(missing_ok=True)

    job.updated_at = _now()
    _persist_export(job)


def download_export_zip(export_id: str) -> FileResponse:
    job = get_export(export_id)
    if not job:
        raise HTTPException(status_code=404, detail="Export not found")
    if job.status != CatalogExportStatus.success or not job.zip_path:
        raise HTTPException(status_code=400, detail="Export not ready")
    file_path = (PROJECT_ROOT / job.zip_path).resolve()
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Export file missing")
    return FileResponse(
        file_path,
        filename=Path(job.zip_path).name,
        media_type="application/zip",
    )


def catalog_download_url(output_path: str) -> str:
    return f"/api/catalog/download?output_path={quote(output_path, safe='')}"
