"""Bracelet fidelity A/B test manifest and results export."""

from __future__ import annotations

import json
from pathlib import Path

from app.config import PROJECT_ROOT

JSON_PATH = PROJECT_ROOT / "data" / "bracelet_fidelity_ab.json"
MD_PATH = PROJECT_ROOT / "data" / "bracelet_fidelity_ab_results.md"


def load_manifest() -> dict:
    if not JSON_PATH.is_file():
        raise FileNotFoundError("Run scripts/build_abtest_manifest.py first")
    return json.loads(JSON_PATH.read_text(encoding="utf-8"))


def save_manifest(data: dict) -> None:
    JSON_PATH.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    write_results_markdown(data)


def write_results_markdown(data: dict) -> None:
    entries = data.get("entries", [])
    w1, w2 = (data.get("round1_winners") or ["", ""])[:2]
    while len(data.get("round1_winners", [])) < 2:
        data.setdefault("round1_winners", []).append("")
    overall = data.get("overall_winner", "")

    picked = [e for e in entries if e.get("picked")]
    r1_picked = [e for e in picked if e.get("round") == "r1"]

    lines = [
        "# Bracelet Fidelity A/B Test Results",
        "",
        "Compare each output against the **full-bracelet raw anchor** (all links + clasp visible).",
        "",
        "## Raw anchors",
        "",
        "| Product | Anchor path |",
        "|---------|-------------|",
        "| bracelet06 | `raw/jewelry/bracelet06/IMG_20260629_190436.jpg` |",
        "| bracelet07 | `raw/jewelry/bracelet07/IMG_20260629_190105.jpg` |",
        "",
        "## Scoring rubric (1–5 each)",
        "",
        "| Criterion | Weight |",
        "|-----------|--------|",
        "| Total link count vs raw | High |",
        "| Figaro pattern cadence | High |",
        "| Clasp type/placement | Medium |",
        "| Professional studio look | High |",
        "| No invented/simplified links | High |",
        "",
        "## Round 1 winners",
        "",
        f"- **Round 1 winner 1:** {w1 or '_not set_'}",
        f"- **Round 1 winner 2:** {w2 or '_not set_'}",
        "",
        "## Overall winner",
        "",
        f"- **Best config:** {overall or '_not set_'}",
        "",
        "## Picked outputs",
        "",
    ]

    if not picked:
        lines.append("_No picks yet — use the A/B picker._")
    else:
        lines.append("| product | round | variant | narrative | image | link | studio |")
        lines.append("|---------|-------|---------|-----------|-------|------|--------|")
        for e in picked:
            lines.append(
                f"| {e['product']} | {e['round']} | {e['variant']} | {e.get('narrative', '')} "
                f"| `{e['image_path']}` | {e.get('link_score', '')} | {e.get('studio_score', '')} |"
            )

    lines.extend([
        "",
        "---",
        "",
        "## Results matrix",
        "",
        "| round | variant | product | sample | prompt_mode | analyze_mode | model | ar/res | "
        "prompt_path | image_path | link_score | studio_score | notes | picked |",
        "|-------|---------|---------|--------|-------------|--------------|-------|"
        "--------|-------------|------------|------------|--------------|-------|--------|",
    ])

    for e in entries:
        lines.append(
            f"| {e['round']} | {e['variant']} | {e['product']} | {e.get('sample', '')} | "
            f"{e.get('prompt_mode', '')} | {e.get('analyze_mode', '')} | {e.get('model', '')} | "
            f"{e.get('ar_res', '')} | `{e.get('prompt_path', '')}` | `{e.get('image_path', '')}` | "
            f"{e.get('link_score') or ''} | {e.get('studio_score') or ''} | {e.get('notes') or ''} | "
            f"{'yes' if e.get('picked') else ''} |"
        )

    lines.extend([
        "",
        "---",
        "",
        "## Phase 6 decision",
        "",
        f"**Overall winner:** {overall or 'Pending review'}",
        "",
        "### Integration options",
        "",
        "| If winner is… | Next step |",
        "|---------------|-----------|",
        "| GPT B or C | Route bracelets to GPT i2i in pipeline |",
        "| Nano A + fidelity narrative | Update prompt_builder for bracelet products |",
        "| None good enough | Batch-generate and manual pick |",
        "",
        "Picker UI: open `/abtest-picker.html` (via API server) while `uvicorn` is running.",
        "",
    ])

    MD_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
