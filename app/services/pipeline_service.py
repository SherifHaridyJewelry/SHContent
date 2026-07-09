"""Wrap product_pipeline for background job execution."""

from __future__ import annotations

import json
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from app.config import DEFAULT_WORKFLOW, MAX_PARALLEL_PRODUCTS, PROJECT_ROOT, SCRIPTS_DIR, WORKFLOWS_DIR
from app.db.engine import get_session
from app.db.repositories.history import HistoryRepository
from app.db.repositories.products import ProductRepository
from app.models.schemas import Job, JobCreate, JobStatus, ProductStatus
from app.services import catalog_service, job_store, product_store
from app.services.path_utils import normalize_project_path
from app.services.template_service import resolve_template_path

if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from naming import build_output_name  # noqa: E402
from product_pipeline import process_single_product  # noqa: E402
from prompt_builder import load_json, collect_selectable_url_set  # noqa: E402
from r2_upload import get_r2_config, get_s3_client  # noqa: E402
from vision_analyze import get_api_key  # noqa: E402
from generate_kie import fetch_task, download_image  # noqa: E402

_running_jobs: set[str] = set()
_running_threads: dict[str, threading.Thread] = {}
_running_lock = threading.Lock()


def _clear_stale_running(job_id: str) -> None:
    """Drop in-memory running markers when the worker thread died (sleep/crash)."""
    with _running_lock:
        thread = _running_threads.get(job_id)
        if thread is not None and thread.is_alive():
            return
        _running_jobs.discard(job_id)
        _running_threads.pop(job_id, None)


def _spawn_job_thread(job_id: str) -> bool:
    """Start _run_job in a background thread if not already running."""
    with _running_lock:
        thread = _running_threads.get(job_id)
        if thread is not None and thread.is_alive():
            return False
        _running_jobs.discard(job_id)
        _running_threads.pop(job_id, None)
        _running_jobs.add(job_id)

    def _wrapper() -> None:
        try:
            _run_job(job_id)
        finally:
            with _running_lock:
                _running_jobs.discard(job_id)
                _running_threads.pop(job_id, None)

    thread = threading.Thread(target=_wrapper, daemon=True)
    with _running_lock:
        _running_threads[job_id] = thread
    thread.start()
    return True


def _load_workflow(path: str | None) -> dict:
    wf_path = Path(path) if path else DEFAULT_WORKFLOW
    if not wf_path.is_absolute():
        wf_path = PROJECT_ROOT / wf_path
    if not wf_path.exists():
        wf_path = WORKFLOWS_DIR / "jewelry_catalog.json"
    return json.loads(wf_path.read_text(encoding="utf-8"))


def _product_output_fields(result: dict) -> dict:
    """Map pipeline result dict to job_store update kwargs."""
    output_image = result.get("output_image")
    prompt_file = result.get("prompt_file")
    return {
        "status": JobStatus.success,
        "task_id": result.get("task_id"),
        "output_image": output_image,
        "output_path": normalize_project_path(output_image),
        "prompt_file": prompt_file,
        "prompt_path": normalize_project_path(prompt_file),
        "image_url": result.get("image_url"),
        "product_urls": result.get("product_urls") or [],
        "output_r2_url": result.get("output_r2_url"),
    }


def _register_pipeline_output(
    *,
    job_id: str,
    product_id: str,
    result: dict,
    template_name: str,
) -> None:
    output_path = normalize_project_path(result.get("output_image"))
    if not output_path:
        return

    product = product_store.get_product(product_id)
    anchor_path = None
    with get_session() as session:
        anchor_path = ProductRepository(session).get_anchor_path(product_id)

    catalog_service.register_catalog_output(
        output_path=output_path,
        product_id=product_id,
        source="history",
        task_id=result.get("task_id"),
        template=template_name,
        timestamp=result.get("completed_at") or result.get("timestamp"),
        image_url=result.get("image_url"),
        product_urls=result.get("product_urls") or [],
        output_r2_url=result.get("output_r2_url"),
        prompt_path=normalize_project_path(result.get("prompt_file")),
        job_id=job_id,
        run_id=job_id,
        product_name=product.name,
        product_type=product.type.value,
        collection=product.collection,
        anchor_path=anchor_path,
    )

    task_id = result.get("task_id")
    if task_id:
        with get_session() as session:
            HistoryRepository(session).upsert(
                {
                    "task_id": task_id,
                    "timestamp": result.get("timestamp") or job_store.get_job(job_id).created_at if job_store.get_job(job_id) else "",
                    "state": "success",
                    "prompt_file": result.get("prompt_file"),
                    "output_file": result.get("output_image"),
                    "template": template_name,
                    "pipeline": True,
                    "job_id": job_id,
                    "image_url": result.get("image_url"),
                    "product_urls": result.get("product_urls") or [],
                    "output_r2_url": result.get("output_r2_url"),
                    "completed_at": result.get("completed_at"),
                }
            )


def _process_job_product(
    *,
    job_id: str,
    prod_result,
    job,
    template: dict,
    template_name: str,
    category: str,
    output_prefix: str,
    max_gen_refs: int,
    analyze: bool,
    api_key: str,
    s3_client,
    r2_config: dict,
) -> tuple[str, dict]:
    """Run pipeline for one product in a job. Returns (product_id, result dict)."""
    product = product_store.get_product(prod_result.product_id)
    paths = product_store.resolve_pipeline_paths(product, max_generation_refs=max_gen_refs)
    output_name = prod_result.output_name or build_output_name(
        output_prefix,
        product.id,
        template_name,
        job_id,
    )

    def on_step(step: str, pid=prod_result.product_id) -> None:
        try:
            status = JobStatus(step)
        except ValueError:
            return
        job_store.begin_batch(job_id)
        try:
            job_store.update_job_status(job_id, status)
            job_store.update_product_result(job_id, pid, status=status)
        finally:
            job_store.end_batch(job_id)

    def on_task_created(task_id: str, pid=prod_result.product_id) -> None:
        job_store.begin_batch(job_id)
        try:
            job_store.update_product_result(job_id, pid, task_id=task_id)
        finally:
            job_store.end_batch(job_id)

    job_store.update_product_result(
        job_id, prod_result.product_id, status=JobStatus.pending
    )

    job_ref_url = job.selected_ref_url if job.reference_mode == "job" else None
    product_ref_url = prod_result.selected_ref_url if job.reference_mode == "product" else None

    result = process_single_product(
        api_key=api_key,
        s3_client=s3_client,
        r2_config=r2_config,
        template=json.loads(json.dumps(template)),
        image_paths=paths["image_paths"],
        output_name=output_name,
        category=category,
        analyze=analyze,
        hint=f"{product.type.value} - {product.name}",
        generation_paths=paths["generation_paths"],
        analysis_paths=paths["analysis_paths"],
        on_step=on_step,
        on_task_created=on_task_created,
        job_id=job_id,
        template_key=template_name,
        product_type=product.type.value,
        job_ref_url=job_ref_url,
        product_ref_url=product_ref_url,
    )
    resolved = result.get("resolved_ref_url")
    if resolved:
        job_store.update_product_result(
            job_id, prod_result.product_id, resolved_ref_url=resolved
        )
    return prod_result.product_id, result


def _run_job(job_id: str) -> None:
    job = job_store.get_job(job_id)
    if not job:
        return

    try:
        wf = _load_workflow(job.workflow)
        template_name = job.template or wf.get("template", "jewelry_catalog_4x5")
        template_path = resolve_template_path(template_name)
        template = load_json(template_path)
        max_gen_refs = wf.get("max_generation_refs", 2)
        category = job.category or wf.get("category", "jewelry")

        api_key = get_api_key()
        r2_config = get_r2_config()
        s3_client = get_s3_client(r2_config)

        job_store.update_job_status(job_id, JobStatus.uploading)

        pending = [p for p in job.products if p.status != JobStatus.success]
        any_failed = False

        with ThreadPoolExecutor(max_workers=MAX_PARALLEL_PRODUCTS) as executor:
            futures = [
                executor.submit(
                    _process_job_product,
                    job_id=job_id,
                    prod_result=prod_result,
                    job=job,
                    template=template,
                    template_name=template_name,
                    category=category,
                    output_prefix=job.output_prefix,
                    max_gen_refs=max_gen_refs,
                    analyze=job.analyze,
                    api_key=api_key,
                    s3_client=s3_client,
                    r2_config=r2_config,
                )
                for prod_result in pending
            ]

            for future in as_completed(futures):
                product_id, result = future.result()
                if result["status"] == "success":
                    job_store.begin_batch(job_id)
                    try:
                        job_store.update_product_result(
                            job_id,
                            product_id,
                            **_product_output_fields(result),
                        )
                    finally:
                        job_store.end_batch(job_id)
                    product_store.set_last_job(
                        product_id,
                        job_id,
                        output=result.get("output_image"),
                    )
                    _register_pipeline_output(
                        job_id=job_id,
                        product_id=product_id,
                        result=result,
                        template_name=template_name,
                    )
                else:
                    any_failed = True
                    job_store.update_product_result(
                        job_id,
                        product_id,
                        status=JobStatus.failed,
                        error=result.get("error", "Generation failed"),
                    )

        final_status = JobStatus.failed if any_failed else JobStatus.success
        refreshed = job_store.get_job(job_id)
        if refreshed and any(p.status == JobStatus.success for p in refreshed.products):
            if any_failed:
                final_status = JobStatus.failed
            elif all(p.status == JobStatus.success for p in refreshed.products):
                final_status = JobStatus.success
        job_store.update_job_status(job_id, final_status)

    except Exception as e:
        job_store.update_job_status(job_id, JobStatus.failed, error=str(e))


def resume_job(job_id: str) -> dict:
    """Restart a stuck or failed pipeline job (before or after KIE task creation)."""
    job = job_store.get_job(job_id)
    if not job:
        raise ValueError(f"Job not found: {job_id}")

    if job.status == JobStatus.success and all(
        p.status == JobStatus.success for p in job.products
    ):
        raise ValueError("Job already completed successfully")

    incomplete = [p for p in job.products if p.status != JobStatus.success]
    if not incomplete:
        raise ValueError("No products to resume")

    _clear_stale_running(job_id)
    if not _spawn_job_thread(job_id):
        raise ValueError("Job is already running")

    return {"job_id": job_id, "action": "resumed", "products": len(incomplete)}


def recover_job(job_id: str) -> tuple[dict, int]:
    """Attempt to recover interrupted generation from KIE task state."""
    job = job_store.get_job(job_id)
    if not job:
        raise ValueError(f"Job not found: {job_id}")

    api_key = get_api_key()
    r2_config = get_r2_config()
    s3_client = get_s3_client(r2_config)
    category = job.category or "jewelry"
    template_name = job.template

    recovered = []
    still_waiting = []

    for prod in job.products:
        if prod.status == JobStatus.success and prod.output_image:
            continue
        if not prod.task_id:
            still_waiting.append({"product_id": prod.product_id, "state": "no_task_id"})
            continue

        output_name = build_output_name(
            job.output_prefix, prod.product_id, template_name, prod.run_id or job.id
        )
        prompt_path = PROJECT_ROOT / "prompts" / category / f"{output_name}.json"
        fmt = "jpg"
        if prompt_path.exists():
            prompt_json = json.loads(prompt_path.read_text(encoding="utf-8"))
            fmt = prompt_json.get("api_parameters", {}).get("output_format", "jpg")
        image_path = PROJECT_ROOT / "images" / category / f"{output_name}.{fmt}"

        data = fetch_task(api_key, prod.task_id)
        state = data.get("state", "")

        if state in ("failed", "fail", "error"):
            job_store.update_product_result(
                job_id,
                prod.product_id,
                status=JobStatus.failed,
                error="KIE task failed",
            )
            recovered.append({"product_id": prod.product_id, "status": "failed"})
            continue

        if state not in ("success", "completed"):
            still_waiting.append({"product_id": prod.product_id, "state": state})
            continue

        image_url = download_image(data, image_path, exit_on_error=False)
        output_r2_url = None
        try:
            from r2_upload import upload_file_with_key  # noqa: E402

            object_key = f"outputs/{category}/{image_path.name}"
            output_r2_url = upload_file_with_key(s3_client, r2_config, image_path, object_key)
        except Exception:
            pass

        if prompt_path.exists() and not _history_has_task(prod.task_id):
            prompt_json = json.loads(prompt_path.read_text(encoding="utf-8"))
            history_entry = {
                "timestamp": job.created_at,
                "task_id": prod.task_id,
                "prompt_file": str(prompt_path),
                "output_file": str(image_path),
                "aspect_ratio": prompt_json.get("api_parameters", {}).get("aspect_ratio", "auto"),
                "resolution": prompt_json.get("api_parameters", {}).get("resolution", "2K"),
                "state": "success",
                "cost_time_ms": data.get("costTime"),
                "image_url": image_url,
                "completed_at": data.get("updateTime") or job.updated_at,
                "pipeline": True,
                "template": template_name,
                "job_id": job_id,
                "product_urls": prod.product_urls or [],
                "output_r2_url": output_r2_url,
            }
            with get_session() as session:
                HistoryRepository(session).upsert(history_entry)

        fields = {
            "status": JobStatus.success,
            "task_id": prod.task_id,
            "output_image": str(image_path),
            "output_path": normalize_project_path(str(image_path)),
            "prompt_file": str(prompt_path) if prompt_path.exists() else prod.prompt_file,
            "prompt_path": normalize_project_path(str(prompt_path)) if prompt_path.exists() else prod.prompt_path,
            "image_url": image_url,
            "output_r2_url": output_r2_url,
            "error": None,
        }
        job_store.update_product_result(job_id, prod.product_id, **fields)
        product_store.set_last_job(prod.product_id, job_id, output=str(image_path))
        _register_pipeline_output(
            job_id=job_id,
            product_id=prod.product_id,
            result={
                "task_id": prod.task_id,
                "output_image": str(image_path),
                "prompt_file": str(prompt_path) if prompt_path.exists() else prod.prompt_file,
                "image_url": image_url,
                "product_urls": prod.product_urls or [],
                "output_r2_url": output_r2_url,
                "completed_at": data.get("updateTime") or job.updated_at,
            },
            template_name=template_name,
        )
        recovered.append({"product_id": prod.product_id, "status": "success", "output": str(image_path)})

    job = job_store.get_job(job_id)
    if still_waiting and not recovered:
        if all(s.get("state") == "no_task_id" for s in still_waiting):
            raise ValueError(
                "No KIE task to recover. Use Resume pipeline to restart this job."
            )
        status_code = 202
        job_store.update_job_status(job_id, JobStatus.generating)
    elif still_waiting:
        status_code = 202
        job_store.update_job_status(job_id, JobStatus.generating)
    elif job and all(p.status == JobStatus.success for p in job.products):
        job_store.update_job_status(job_id, JobStatus.success)
        status_code = 200
    elif job and any(p.status == JobStatus.success for p in job.products):
        job_store.update_job_status(job_id, JobStatus.failed)
        status_code = 200
    else:
        job_store.update_job_status(job_id, JobStatus.failed)
        status_code = 200

    return {
        "job_id": job_id,
        "recovered": recovered,
        "still_waiting": still_waiting,
    }, status_code


def _history_has_task(task_id: str) -> bool:
    with get_session() as session:
        return HistoryRepository(session).has_success_task(task_id)


def _validate_job_references(data: JobCreate, template: dict) -> None:
    allowed = collect_selectable_url_set(template)

    if data.reference_mode == "job":
        if not data.selected_ref_url:
            raise ValueError("reference_mode 'job' requires selected_ref_url")
        if data.product_refs:
            raise ValueError("Cannot combine job-level reference with per-product references")
        if data.selected_ref_url not in allowed:
            raise ValueError("selected_ref_url is not a valid template reference")
    elif data.reference_mode == "product":
        if data.selected_ref_url:
            raise ValueError("Cannot combine per-product references with job-level selected_ref_url")
        if not data.product_refs:
            raise ValueError("reference_mode 'product' requires at least one product_refs entry")
        unknown = set(data.product_refs) - set(data.product_ids)
        if unknown:
            raise ValueError(f"Unknown product IDs in product_refs: {', '.join(sorted(unknown))}")
        for pid, url in data.product_refs.items():
            if url not in allowed:
                raise ValueError(f"Invalid reference URL for product {pid}")
    elif data.reference_mode == "none":
        if data.selected_ref_url or data.product_refs:
            raise ValueError("reference_mode 'none' cannot include selected references")
    else:
        raise ValueError(f"Invalid reference_mode: {data.reference_mode}")


def start_job(data: JobCreate) -> Job:
    if not data.product_ids:
        raise ValueError("No products selected")

    wf = _load_workflow(data.workflow)
    output_prefix = data.output_prefix or wf.get("output_prefix", "catalog")
    template_name = data.template or wf.get("template", "jewelry_catalog_4x5")
    category = wf.get("category", "jewelry")

    try:
        template_path = resolve_template_path(template_name)
    except ValueError as e:
        raise ValueError(str(e)) from e

    template = load_json(template_path)
    _validate_job_references(data, template)

    for pid in data.product_ids:
        product = product_store.get_product(pid)
        if product.status not in (ProductStatus.ready, ProductStatus.generated):
            raise ValueError(
                f"Product {pid} is not ready for generation "
                f"(needs exactly one anchor image, status={product.status.value})"
            )

    job = job_store.create_job(
        data,
        output_prefix=output_prefix,
        template_key=template_name,
        category=category,
    )
    if not _spawn_job_thread(job.id):
        raise RuntimeError(f"Failed to start job thread for {job.id}")
    return job
