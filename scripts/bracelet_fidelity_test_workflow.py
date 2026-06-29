#!/usr/bin/env python3
"""Bracelet fidelity A/B test — Nano Banana 2 vs GPT Image 2 i2i.

Usage:
  python scripts/bracelet_fidelity_test_workflow.py --round 1
  python scripts/bracelet_fidelity_test_workflow.py --round 2 --variants B,C --narratives N2a,N2b,N2c
  python scripts/bracelet_fidelity_test_workflow.py --round 1 --dry-run
"""

from __future__ import annotations

import argparse
import json
import secrets
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_WORKFLOW = PROJECT_ROOT / "workflows" / "bracelet_fidelity_ab_test.json"
MANIFEST = PROJECT_ROOT / "data" / "bracelet_fidelity_ab_results.md"
TABLE_HEADER = (
    "| round | variant | product | sample | prompt_mode | analyze_mode | model | ar/res | "
    "prompt_path | image_path | link_score | studio_score | notes |"
)
TABLE_SEP = (
    "|-------|---------|---------|--------|-------------|--------------|-------|"
    "--------|-------------|------------|------------|--------------|-------|"
)


def load_workflow(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def upload_image(path: Path, prefix: str) -> str:
    cmd = [
        sys.executable,
        str(PROJECT_ROOT / "scripts" / "r2_upload.py"),
        "upload",
        str(path),
        "--prefix",
        prefix,
        "--json",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=PROJECT_ROOT)
    if result.returncode != 0:
        raise RuntimeError(result.stderr or result.stdout)
    stdout = result.stdout.strip()
    start = stdout.rfind("[")
    end = stdout.rfind("]")
    rows = json.loads(stdout[start : end + 1])
    return rows[0]["url"]


def ensure_manifest_table() -> None:
    if not MANIFEST.exists():
        MANIFEST.write_text(
            "# Bracelet Fidelity A/B Test Results\n\n## Results matrix\n\n"
            f"{TABLE_HEADER}\n{TABLE_SEP}\n",
            encoding="utf-8",
        )
        return
    text = MANIFEST.read_text(encoding="utf-8")
    if TABLE_HEADER not in text:
        with MANIFEST.open("a", encoding="utf-8") as f:
            f.write(f"\n## Results matrix\n\n{TABLE_HEADER}\n{TABLE_SEP}\n")


def append_manifest_row(row: dict) -> None:
    ensure_manifest_table()
    line = (
        f"| {row['round']} | {row['variant']} | {row['product']} | {row['sample']} | "
        f"{row['prompt_mode']} | {row['analyze_mode']} | {row['model']} | {row['ar_res']} | "
        f"`{row['prompt_path']}` | `{row['image_path']}` | | | {row.get('notes', '')} |"
    )
    with MANIFEST.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def run_vision(api_key: str, product_url: str, analyze_mode: str) -> dict | None:
    if analyze_mode == "none":
        return None
    scripts_dir = PROJECT_ROOT / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    from vision_analyze import analyze_product  # noqa: E402

    mode = "chain_structured" if analyze_mode == "chain_structured" else "standard"
    last_err: Exception | None = None
    for attempt in range(1, 4):
        try:
            return analyze_product(api_key, [product_url], analyze_mode=mode)
        except Exception as e:
            last_err = e
            print(f"  Vision attempt {attempt} failed: {e}")
    raise last_err  # type: ignore[misc]


def build_prompt(
    wf: dict,
    template: dict,
    product_url: str,
    *,
    variant_cfg: dict,
    prompt_mode: str,
    analyze_mode: str,
    product_analysis: dict | None,
    scene_ref_url: str | None,
) -> dict:
    scripts_dir = PROJECT_ROOT / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    from prompt_builder import build_prompt_json  # noqa: E402

    extra_refs = [scene_ref_url] if scene_ref_url and variant_cfg.get("scene_ref") else None
    prompt_json = build_prompt_json(
        template,
        [product_url],
        product_analysis,
        generation_urls=[product_url],
        prompt_mode=prompt_mode,
        analyze_mode=analyze_mode,
        extra_reference_urls=extra_refs,
    )
    prompt_json["api_parameters"] = {
        "aspect_ratio": variant_cfg["aspect_ratio"],
        "resolution": variant_cfg["resolution"],
        "output_format": "jpg",
    }
    if variant_cfg["generator"] != "generate_kie.py":
        prompt_json["model"] = variant_cfg["model"]
        urls = list(prompt_json.get("image_input") or [])
        prompt_json["input_urls"] = urls
    return prompt_json


def run_job(
    *,
    wf: dict,
    round_id: str,
    variant_id: str,
    product_id: str,
    sample: int,
    prompt_mode: str,
    analyze_mode: str,
    narrative_id: str | None,
    url_cache: dict[str, str],
    dry_run: bool,
) -> tuple[str, int]:
    scripts_dir = PROJECT_ROOT / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))

    from kie_jobs import create_task, download_image, get_api_key, log_task, poll_task  # noqa: E402
    from prompt_builder import load_json, resolve_template  # noqa: E402

    variant_cfg = wf["variants"][variant_id]
    product_cfg = wf["products"][product_id]
    anchor_path = PROJECT_ROOT / product_cfg["anchor"]
    if not anchor_path.exists():
        raise FileNotFoundError(anchor_path)

    run_id = secrets.token_hex(4)
    narr_suffix = f"_{narrative_id.lower()}" if narrative_id else ""
    base_name = f"abtest_{round_id}_{variant_id}_{product_id}{narr_suffix}_{run_id}"
    prompt_path = PROJECT_ROOT / "prompts" / wf["category"] / f"{base_name}.json"
    image_path = PROJECT_ROOT / "images" / wf["category"] / f"{base_name}.jpg"

    ar_res = f"{variant_cfg['aspect_ratio']}/{variant_cfg['resolution']}"
    row = {
        "round": round_id,
        "variant": variant_id,
        "product": product_id,
        "sample": sample,
        "prompt_mode": prompt_mode,
        "analyze_mode": analyze_mode,
        "model": variant_cfg["model"],
        "ar_res": ar_res,
        "prompt_path": str(prompt_path.relative_to(PROJECT_ROOT)),
        "image_path": str(image_path.relative_to(PROJECT_ROOT)),
        "notes": narrative_id or "",
    }

    if dry_run:
        print(f"  [dry-run] {base_name} -> {variant_cfg['model']} {ar_res}")
        append_manifest_row({**row, "notes": (row["notes"] + " dry-run").strip()})
        return base_name, 0

    cache_key = str(anchor_path.resolve())
    if cache_key not in url_cache:
        url_cache[cache_key] = upload_image(anchor_path, wf.get("r2_prefix", "products"))
    product_url = url_cache[cache_key]

    api_key = get_api_key()
    analysis = None
    if analyze_mode != "none":
        analysis = run_vision(api_key, product_url, analyze_mode)

    template = load_json(resolve_template(wf["template"]))
    scene_ref = wf.get("scene_ref_bracelet") if variant_cfg.get("scene_ref") else None
    prompt_json = build_prompt(
        wf,
        template,
        product_url,
        variant_cfg=variant_cfg,
        prompt_mode=prompt_mode,
        analyze_mode=analyze_mode,
        product_analysis=analysis,
        scene_ref_url=scene_ref,
    )

    prompt_path.parent.mkdir(parents=True, exist_ok=True)
    prompt_path.write_text(json.dumps(prompt_json, indent=2) + "\n", encoding="utf-8")

    append_manifest_row(row)

    generator = variant_cfg["generator"]
    if generator == "generate_kie.py":
        from generate_kie import create_task as nb_create  # noqa: E402

        class MockArgs:
            aspect_ratio = variant_cfg["aspect_ratio"]
            resolution = variant_cfg["resolution"]
            format = "jpg"
            google_search = False

        payload_json = json.loads(json.dumps(prompt_json))
        task_id = nb_create(api_key, payload_json, MockArgs(), exit_on_error=False)
    else:
        from generate_kie_gpt_image import build_payload  # noqa: E402

        class GptArgs:
            model = variant_cfg["model"]
            aspect_ratio = variant_cfg["aspect_ratio"]
            resolution = variant_cfg["resolution"]

        payload = build_payload(prompt_json, GptArgs())
        task_id = create_task(api_key, payload)

    print(f"  Task {task_id}: {base_name}")
    data = poll_task(api_key, task_id)
    image_url = download_image(data, image_path)

    log_task({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "task_id": task_id,
        "model": variant_cfg["model"],
        "prompt_file": str(prompt_path),
        "output_file": str(image_path),
        "aspect_ratio": variant_cfg["aspect_ratio"],
        "resolution": variant_cfg["resolution"],
        "generator": f"bracelet_fidelity_test_workflow.py",
        "state": "success",
        "image_url": image_url,
        "abtest_round": round_id,
        "abtest_variant": variant_id,
        "abtest_product": product_id,
        "prompt_mode": prompt_mode,
        "analyze_mode": analyze_mode,
    })

    append_manifest_row(row)
    return base_name, 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Bracelet fidelity A/B test workflow")
    parser.add_argument("--workflow", "-w", default=str(DEFAULT_WORKFLOW))
    parser.add_argument("--round", type=int, choices=[1, 2], required=True)
    parser.add_argument("--variants", default=None,
                        help="Comma-separated variant IDs (default: all for r1, B,C for r2)")
    parser.add_argument("--narratives", default=None,
                        help="Round 2 only: N2a,N2b,N2c (default: all)")
    parser.add_argument("--products", default=None,
                        help="Comma-separated product IDs (default: all in workflow)")
    parser.add_argument("--samples", type=int, default=None,
                        help="Overrides workflow samples_per_run")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--sequential", action="store_true")
    args = parser.parse_args()

    wf_path = Path(args.workflow)
    if not wf_path.is_absolute():
        wf_path = PROJECT_ROOT / wf_path
    wf = load_workflow(wf_path)

    samples = args.samples or wf.get("samples_per_run", 2)
    round_key = f"r{args.round}"
    product_ids = (
        [p.strip() for p in args.products.split(",")]
        if args.products
        else list(wf["products"].keys())
    )

    if args.round == 1:
        prompt_mode = wf["round1"]["prompt_mode"]
        analyze_mode = wf["round1"]["analyze_mode"]
        variant_ids = (
            [v.strip() for v in args.variants.split(",")]
            if args.variants
            else list(wf["variants"].keys())
        )
        jobs = [
            (vid, pid, sample, prompt_mode, analyze_mode, None)
            for vid in variant_ids
            for pid in product_ids
            for sample in range(1, samples + 1)
        ]
    else:
        variant_ids = (
            [v.strip() for v in args.variants.split(",")]
            if args.variants
            else wf.get("round2_default_variants", ["B", "C"])
        )
        narrative_ids = (
            [n.strip() for n in args.narratives.split(",")]
            if args.narratives
            else list(wf["round2_prompt_modes"].keys())
        )
        jobs = []
        for narr in narrative_ids:
            modes = wf["round2_prompt_modes"][narr]
            for vid in variant_ids:
                for pid in product_ids:
                    for sample in range(1, samples + 1):
                        jobs.append((
                            vid, pid, sample,
                            modes["prompt_mode"],
                            modes["analyze_mode"],
                            narr,
                        ))

    print(f"Bracelet fidelity test — Round {args.round}: {len(jobs)} job(s)")
    url_cache: dict[str, str] = {}
    failures = 0

    def _run(job):
        vid, pid, sample, pm, am, narr = job
        try:
            return run_job(
                wf=wf,
                round_id=round_key,
                variant_id=vid,
                product_id=pid,
                sample=sample,
                prompt_mode=pm,
                analyze_mode=am,
                narrative_id=narr,
                url_cache=url_cache,
                dry_run=args.dry_run,
            )
        except Exception as e:
            print(f"  FAILED {vid}/{pid} sample {sample}: {e}")
            return f"{vid}_{pid}", 1

    if args.sequential or args.dry_run:
        for job in jobs:
            _, code = _run(job)
            failures += code
    else:
        with ThreadPoolExecutor(max_workers=min(4, len(jobs))) as pool:
            futures = [pool.submit(_run, job) for job in jobs]
            for fut in as_completed(futures):
                _, code = fut.result()
                failures += code

    if failures:
        print(f"\n{failures} job(s) failed.")
        sys.exit(1)
    print("\nAll jobs completed. Review outputs and score data/bracelet_fidelity_ab_results.md")


if __name__ == "__main__":
    main()
