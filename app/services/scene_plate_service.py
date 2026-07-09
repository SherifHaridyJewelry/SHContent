"""Scene plate distillation jobs backed by database."""

from __future__ import annotations

import sys
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.config import PROJECT_ROOT, SCRIPTS_DIR
from app.db.engine import get_session
from app.db.repositories.scene_plates import ACTIVE_STATUSES, ScenePlateRepository
from app.models.schemas import ScenePlateJob, ScenePlateJobStatus
from app.services import catalog_service, template_service

if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from generate_kie import create_task, download_image, get_api_key, poll_task  # noqa: E402
from r2_upload import get_r2_config, get_s3_client, upload_file_with_key  # noqa: E402

_lock = threading.Lock()
_jobs: dict[str, ScenePlateJob] = {}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_loaded() -> None:
    global _jobs
    if _jobs:
        return
    with get_session() as session:
        for job in ScenePlateRepository(session).list_recent(limit=500):
            _jobs[job.id] = job


def _persist_job(job: ScenePlateJob) -> None:
    with get_session() as session:
        ScenePlateRepository(session).save(job)


def get_job(job_id: str) -> ScenePlateJob | None:
    with _lock:
        _ensure_loaded()
        return _jobs.get(job_id)


def list_jobs(limit: int = 50) -> list[ScenePlateJob]:
    with _lock:
        _ensure_loaded()
        jobs = sorted(_jobs.values(), key=lambda j: j.created_at, reverse=True)
        return jobs[:limit]


def list_active_jobs() -> list[ScenePlateJob]:
    with _lock:
        _ensure_loaded()
        return [j for j in _jobs.values() if j.status in ACTIVE_STATUSES]


class _MockArgs:
    aspect_ratio = None
    resolution = None
    format = None
    google_search = False


def _resolve_r2_url(output_path: str, template_name: str) -> tuple[str, str]:
    normalized = output_path.replace("\\", "/")
    local_path = (PROJECT_ROOT / normalized).resolve()
    root = PROJECT_ROOT.resolve()

    if not str(local_path).startswith(str(root)):
        raise ValueError(f"Unsupported output path: {output_path}")

    from r2_upload import get_r2_config, get_s3_client, upload_file_with_key  # noqa: E402

    config = get_r2_config()
    s3_client = get_s3_client(config)

    object_key = f"references/distilled/{template_name}/source_{local_path.stem}{local_path.suffix}"
    r2_url = upload_file_with_key(s3_client, config, local_path, object_key)
    if not r2_url:
        raise ValueError(f"Failed to upload source image to R2: {output_path}")

    return r2_url, str(local_path)


def _distill_one(
    output_path: str,
    template_name: str,
    scene_key: str,
    api_key: str,
) -> dict:
    template = template_service.load_template_dict(template_name)
    r2_source_url, _ = _resolve_r2_url(output_path, template_name)

    prompt_payload = {
        "prompt": (
            f"Remove the {scene_key} jewelry product completely from this photograph. "
            f"Preserve EXACTLY and pixel-perfect: the display surface texture and color, "
            f"background gradient and bokeh blur, lighting direction and shadow placement, "
            f"depth of field, reflections on the surface, and overall color grading. "
            f"Inpaint the area where the product was removed seamlessly — extend the surface "
            f"material and match the lighting so the transition is invisible. The result is a "
            f"clean, product-free studio photography setup showing only the display surface, "
            f"props, and background. Ultra-realistic, same resolution, same aspect ratio. "
            f"Do not change anything except removing the product."
        ),
        "negative_prompt": (
            f"{scene_key}, jewelry, gemstone, diamond, gold, silver, metal, product, "
            f"new product, different background, replaced surface, changed lighting, "
            f"altered shadows, cartoon, illustration, 3D render, CGI"
        ),
        "image_input": [r2_source_url],
        "api_parameters": template.get(
            "api_parameters",
            {"aspect_ratio": "4:5", "resolution": "2K", "output_format": "jpg"},
        ),
    }

    args = _MockArgs()
    api = prompt_payload.get("api_parameters", {})
    args.aspect_ratio = api.get("aspect_ratio", "4:5")
    args.resolution = api.get("resolution", "2K")
    args.format = api.get("output_format", "jpg")

    task_id = create_task(api_key, prompt_payload, args)
    data = poll_task(api_key, task_id)

    source_stem = Path(output_path).stem
    output_name = f"distilled_{source_stem}"
    output_path_local = PROJECT_ROOT / "images" / "jewelry" / f"{output_name}.jpg"
    output_path_local.parent.mkdir(parents=True, exist_ok=True)
    image_url = download_image(data, output_path_local)

    config = get_r2_config()
    s3 = get_s3_client(config)
    object_key = f"references/distilled/{template_name}/{output_path_local.name}"
    r2_url = upload_file_with_key(s3, config, output_path_local, object_key)

    template_service.add_scene_references(
        template_name,
        product_type=scene_key,
        urls=[r2_url] if r2_url else [],
    )

    rel_path = str(output_path_local.relative_to(PROJECT_ROOT)).replace("\\", "/")
    catalog_service.register_catalog_output(
        output_path=rel_path,
        product_id=None,
        source="scene_plate",
        task_id=task_id,
        template=template_name,
        timestamp=_now(),
        image_url=image_url,
        product_urls=[],
        output_r2_url=r2_url,
        prompt_path=None,
        job_id=None,
        run_id=None,
    )

    return {
        "id": f"distill_{scene_key}_{source_stem}",
        "status": "success",
        "output_path": str(output_path_local),
        "output_r2_url": r2_url,
        "image_url": image_url,
    }


def _run_distill_job(
    job_id: str,
    output_path: str,
    template_name: str,
    scene_key: str,
) -> None:
    with _lock:
        _ensure_loaded()
        job = _jobs[job_id]
        job.status = ScenePlateJobStatus.generating
        job.updated_at = _now()
        _persist_job(job)

    plate_results = []
    any_failed = False

    api_key = get_api_key()
    try:
        result = _distill_one(output_path, template_name, scene_key, api_key)
        plate_results.append(result)
    except Exception as e:
        any_failed = True
        plate_results.append(
            {
                "id": f"distill_{scene_key}",
                "status": "failed",
                "error": str(e),
            }
        )

    with _lock:
        _ensure_loaded()
        job = _jobs[job_id]
        job.plates = plate_results
        job.status = ScenePlateJobStatus.failed if any_failed else ScenePlateJobStatus.success
        job.updated_at = _now()
        if any_failed:
            job.error = "Distillation failed"
        _persist_job(job)


def start_distillation(
    template_name: str,
    output_path: str,
    scene_key: str,
) -> ScenePlateJob:
    source_stem = Path(output_path).stem
    job_id = f"distill-{uuid.uuid4().hex[:8]}"
    now = _now()
    job = ScenePlateJob(
        id=job_id,
        template=template_name,
        status=ScenePlateJobStatus.pending,
        plates=[
            {
                "id": f"distill_{scene_key}_{source_stem}",
                "status": "pending",
            }
        ],
        created_at=now,
        updated_at=now,
    )
    with _lock:
        _ensure_loaded()
        _jobs[job_id] = job
        _persist_job(job)

    thread = threading.Thread(
        target=_run_distill_job,
        args=(job_id, output_path, template_name, scene_key),
        daemon=True,
    )
    thread.start()
    return job
