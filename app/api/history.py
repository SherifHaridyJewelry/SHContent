"""History and retry endpoints."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.config import HISTORY_FILE, PROJECT_ROOT, SCRIPTS_DIR
from app.models.schemas import HistoryEntry, PaginatedResponse
from app.services import review_store
from app.services.path_utils import normalize_project_path

router = APIRouter(prefix="/history", tags=["history"])


def _load_entries() -> list[dict]:
    if not HISTORY_FILE.exists():
        return []
    entries = []
    for line in HISTORY_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return entries


def _entry_to_model(e: dict) -> HistoryEntry:
    known = {
        "task_id", "timestamp", "state", "prompt_file", "output_file",
        "aspect_ratio", "resolution", "template", "pipeline",
        "job_id", "image_url", "product_urls", "output_r2_url", "review_status",
    }
    extra = {k: v for k, v in e.items() if k not in known}
    output_file = e.get("output_file")
    review_status = e.get("review_status")
    if output_file and review_status is None:
        normalized = normalize_project_path(output_file, allowed_prefixes=("images/",))
        if normalized:
            review_status = review_store.get_review_status(normalized)
    return HistoryEntry(
        task_id=e.get("task_id", ""),
        timestamp=e.get("timestamp", ""),
        state=e.get("state", ""),
        prompt_file=e.get("prompt_file"),
        output_file=output_file,
        aspect_ratio=e.get("aspect_ratio"),
        resolution=e.get("resolution"),
        template=e.get("template"),
        pipeline=e.get("pipeline"),
        job_id=e.get("job_id"),
        image_url=e.get("image_url"),
        product_urls=e.get("product_urls") or [],
        output_r2_url=e.get("output_r2_url"),
        review_status=review_status,
        extra=extra,
    )


def _filter_entries(
    entries: list[dict],
    *,
    state: str | None = None,
    template: str | None = None,
    pipeline_only: bool = False,
) -> list[dict]:
    if template:
        entries = [e for e in entries if e.get("template") == template]
    if state:
        entries = [e for e in entries if e.get("state") == state]
    if pipeline_only:
        entries = [e for e in entries if e.get("pipeline")]
    return entries


@router.get("", response_model=PaginatedResponse[HistoryEntry])
def list_history(
    page: int = 1,
    page_size: int = 25,
    state: str | None = None,
    template: str | None = None,
    pipeline_only: bool = False,
) -> PaginatedResponse[HistoryEntry]:
    entries = _filter_entries(
        _load_entries(),
        state=state,
        template=template,
        pipeline_only=pipeline_only,
    )
    entries.reverse()
    total = len(entries)
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    total_pages = max(1, (total + page_size - 1) // page_size) if total else 1
    if page > total_pages:
        page = total_pages
    start = (page - 1) * page_size
    end = start + page_size
    items = [_entry_to_model(e) for e in entries[start:end]]
    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.post("/{task_id}/retry")
def retry_task(task_id: str) -> dict:
    entries = _load_entries()
    matches = [e for e in entries if e.get("task_id") == task_id]
    if not matches:
        raise HTTPException(status_code=404, detail=f"Task not found: {task_id}")

    entry = matches[-1]
    prompt_file = entry.get("prompt_file")
    output_file = entry.get("output_file")
    if not prompt_file or not output_file:
        raise HTTPException(status_code=400, detail="Entry missing prompt or output file")

    if not Path(prompt_file).exists():
        raise HTTPException(status_code=400, detail=f"Prompt file missing: {prompt_file}")

    generator = entry.get("generator", "generate_kie.py")
    if "gpt_image" in str(generator):
        script = SCRIPTS_DIR / "generate_kie_gpt_image.py"
    else:
        script = SCRIPTS_DIR / "generate_kie.py"

    cmd = [sys.executable, str(script), prompt_file, output_file]
    ar = entry.get("aspect_ratio")
    if ar and ar != "auto":
        cmd.extend(["--aspect-ratio", ar])
    res = entry.get("resolution")
    if res and res != "1K":
        cmd.extend(["--resolution", res])

    proc = subprocess.run(cmd, cwd=PROJECT_ROOT, capture_output=True, text=True)
    if proc.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=proc.stderr or proc.stdout or "Retry failed",
        )
    return {"task_id": task_id, "status": "retry_started", "output_file": output_file}
