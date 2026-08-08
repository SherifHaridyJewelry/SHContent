#!/usr/bin/env python3
"""Clear all product hero / catalog picks (approved_output). Keep/Reject reviews stay."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services import product_store  # noqa: E402


def main() -> None:
    cleared = product_store.clear_all_canonical_outputs()
    print(f"Cleared hero on {cleared} product(s). Kept shortlists unchanged.")


if __name__ == "__main__":
    main()
