"""History and retry endpoints."""

from __future__ import annotations

import subprocess
import sys
import threading
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.config import PROJECT_ROOT, SCRIPTS_DIR
from app.db.engine import get_session
from app.db.repositories.history import HistoryRepository
from app.models.schemas import HistoryEntry, PaginatedResponse
from app.services import review_store
from app.services.path_utils import normalize_project_path

router = APIRouter(prefix="/history", tags=["history"])


def _entry_to_model(row, review_status: str | None = None) -> HistoryEntry:
    extra = dict(row.metadata_json or {})
    output_file = row.output_file
    if output_file and review_status is None:
        normalized = normalize_project_path(output_file, allowed_prefixes=("images/",))
        if normalized:
            review_status = review_store.get_review_status(normalized)
    return HistoryEntry(
        task_id=row.task_id,
        timestamp=row.timestamp,
        state=row.state,
        prompt_file=row.prompt_file,
        output_file=output_file,
        aspect_ratio=row.aspect_ratio,
        resolution=row.resolution,
        template=row.template,
        pipeline=row.pipeline,
        job_id=row.job_id,
        image_url=row.image_url,
        product_urls=list(row.product_urls or []),
        output_r2_url=row.output_r2_url,
        review_status=review_status,
        extra=extra,
    )


@router.get("", response_model=PaginatedResponse[HistoryEntry])
def list_history(
    page: int = 1,
    page_size: int = 25,
    state: str | None = None,
    template: str | None = None,
    pipeline_only: bool = False,
) -> PaginatedResponse[HistoryEntry]:
    with get_session() as session:
        rows = HistoryRepository(session).list_filtered(
            state=state,
            template=template,
            pipeline_only=pipeline_only,
        )
    rows = list(reversed(rows))
    total = len(rows)
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    total_pages = max(1, (total + page_size - 1) // page_size) if total else 1
    if page > total_pages:
        page = total_pages
    start = (page - 1) * page_size
    end = start + page_size
    items = [_entry_to_model(row) for row in rows[start:end]]
    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


def _run_retry(cmd: list[str], task_id: str, output_file: str) -> None:
    proc = subprocess.run(cmd, cwd=PROJECT_ROOT, capture_output=True, text=True)
    if proc.returncode != 0:
        return


@router.post("/{task_id}/retry")
def retry_task(task_id: str) -> dict:
    with get_session() as session:
        row = HistoryRepository(session).get(task_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Task not found: {task_id}")

    prompt_file = row.prompt_file
    output_file = row.output_file
    if not prompt_file or not output_file:
        raise HTTPException(status_code=400, detail="Entry missing prompt or output file")

    if not Path(prompt_file).exists():
        raise HTTPException(status_code=400, detail=f"Prompt file missing: {prompt_file}")

    generator = (row.metadata_json or {}).get("generator", "generate_kie.py")
    if "gpt_image" in str(generator):
        script = SCRIPTS_DIR / "generate_kie_gpt_image.py"
    else:
        script = SCRIPTS_DIR / "generate_kie.py"

    cmd = [sys.executable, str(script), prompt_file, output_file]
    if row.aspect_ratio and row.aspect_ratio != "auto":
        cmd.extend(["--aspect-ratio", row.aspect_ratio])
    if row.resolution and row.resolution != "1K":
        cmd.extend(["--resolution", row.resolution])

    thread = threading.Thread(
        target=_run_retry,
        args=(cmd, task_id, output_file or ""),
        daemon=True,
    )
    thread.start()
    return {"task_id": task_id, "status": "retry_started", "output_file": output_file}
