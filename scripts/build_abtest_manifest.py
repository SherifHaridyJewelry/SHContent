#!/usr/bin/env python3
"""Build deduplicated JSON manifest for bracelet A/B test picker."""

from __future__ import annotations

import json
import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PROMPTS_DIR = PROJECT_ROOT / "prompts" / "jewelry"
OUT_JSON = PROJECT_ROOT / "data" / "bracelet_fidelity_ab.json"

NAME_RE = re.compile(
    r"^abtest_(r\d)_([A-D])_(bracelet\d+)(?:_(n2[abc]))?_([0-9a-f]+)\.json$"
)

ANCHORS = {
    "bracelet06": "raw/jewelry/bracelet06/IMG_20260629_190436.jpg",
    "bracelet07": "raw/jewelry/bracelet07/IMG_20260629_190105.jpg",
}

VARIANTS = {
    "A": {"model": "nano-banana-2", "ar_res": "4:5/2K"},
    "B": {"model": "gpt-image-2-image-to-image", "ar_res": "4:5/1K"},
    "C": {"model": "gpt-image-2-image-to-image", "ar_res": "3:4/2K"},
    "D": {"model": "gpt-image-2-image-to-image", "ar_res": "3:4/2K"},
}

NARRATIVE_MODES = {
    "n2a": {"prompt_mode": "fidelity", "analyze_mode": "material_only", "label": "N2a"},
    "n2b": {"prompt_mode": "fidelity", "analyze_mode": "none", "label": "N2b"},
    "n2c": {"prompt_mode": "fidelity", "analyze_mode": "chain_structured", "label": "N2c"},
}


def parse_entry(path: Path) -> dict | None:
    m = NAME_RE.match(path.name)
    if not m:
        return None
    round_id, variant, product, narrative, run_id = m.groups()
    image_rel = f"images/jewelry/{path.stem}.jpg"
    image_path = PROJECT_ROOT / image_rel
    if not image_path.is_file():
        return None

    prompt_json = json.loads(path.read_text(encoding="utf-8"))
    settings = prompt_json.get("settings") or {}
    api = prompt_json.get("api_parameters") or {}
    vmeta = VARIANTS.get(variant, {})

    if round_id == "r1":
        prompt_mode = settings.get("prompt_mode", "baseline")
        analyze_mode = settings.get("analyze_mode", "standard")
        narrative_label = ""
    else:
        narr = NARRATIVE_MODES.get(narrative or "", {})
        prompt_mode = settings.get("prompt_mode", narr.get("prompt_mode", "fidelity"))
        analyze_mode = settings.get("analyze_mode", narr.get("analyze_mode", "standard"))
        narrative_label = narr.get("label", narrative or "")

    ar = api.get("aspect_ratio", vmeta.get("ar_res", "").split("/")[0])
    res = api.get("resolution", vmeta.get("ar_res", "").split("/")[-1] if "/" in vmeta.get("ar_res", "") else "2K")
    model = prompt_json.get("model") or vmeta.get("model", "")

    return {
        "id": path.stem,
        "round": round_id,
        "variant": variant,
        "product": product,
        "narrative": narrative_label,
        "prompt_mode": prompt_mode,
        "analyze_mode": analyze_mode,
        "model": model,
        "ar_res": f"{ar}/{res}",
        "prompt_path": str(path.relative_to(PROJECT_ROOT)),
        "image_path": image_rel,
        "run_id": run_id,
        "link_score": None,
        "studio_score": None,
        "notes": "",
        "picked": False,
    }


def assign_samples(entries: list[dict]) -> None:
    groups: dict[tuple, list[dict]] = {}
    for e in entries:
        key = (e["round"], e["variant"], e["product"], e["narrative"])
        groups.setdefault(key, []).append(e)
    for group in groups.values():
        group.sort(key=lambda x: x["id"])
        for i, item in enumerate(group, start=1):
            item["sample"] = i


def load_scores(path: Path) -> dict[str, dict]:
    if not path.is_file():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return {e["id"]: e for e in data.get("entries", [])}


def main() -> None:
    entries: list[dict] = []
    seen: set[str] = set()
    for path in sorted(PROMPTS_DIR.glob("abtest_*.json")):
        entry = parse_entry(path)
        if not entry or entry["id"] in seen:
            continue
        seen.add(entry["id"])
        entries.append(entry)

    assign_samples(entries)
    entries.sort(key=lambda e: (e["round"], e["variant"], e["product"], e.get("sample", 0), e["id"]))

    prior_data = {}
    if OUT_JSON.is_file():
        prior_data = json.loads(OUT_JSON.read_text(encoding="utf-8"))
    prior = {e["id"]: e for e in prior_data.get("entries", [])}
    for e in entries:
        old = prior.get(e["id"])
        if old:
            for key in ("link_score", "studio_score", "notes", "picked"):
                if old.get(key) is not None:
                    e[key] = old[key]

    payload = {
        "anchors": ANCHORS,
        "entries": entries,
        "round1_winners": prior_data.get("round1_winners", ["", ""]),
        "overall_winner": prior_data.get("overall_winner", ""),
    }
    OUT_JSON.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(entries)} entries to {OUT_JSON}")


if __name__ == "__main__":
    main()
