"""Deterministic 0-100 prospect score from signals, rating and review count. Formula documented in leadgen/README.md.
Usage: uv run python -m leadgen.score
"""
from __future__ import annotations

import json
import os

from . import ROOT  # noqa: F401
from .db import Store
from .source import load_config, log


def _sig(p: dict, name: str) -> bool:
    return bool(((p.get("signals") or {}).get(name) or {}).get("value"))


def score_prospect(p: dict) -> int:
    s = 0
    if _sig(p, "has_website"):
        s += 10
    if p.get("email"):
        s += 15
    r = p.get("rating")
    if r is not None:
        s += 15 if r >= 4.0 else 8 if r >= 3.5 else 0
    n = p.get("review_count") or 0
    s += 20 if n >= 100 else 15 if n >= 40 else 10 if n >= 15 else 5 if n >= 5 else 0
    sigs = p.get("signals") or {}
    if _sig(p, "mentions_24_7"):
        s += 15
    if "has_online_booking" in sigs and not _sig(p, "has_online_booking"):   # only when the site was actually read
        s += 15
    if _sig(p, "mentions_after_hours_text"):
        s += 10
    return s


def score_all(store: Store, cfg: dict) -> dict:
    threshold = cfg["score"]["threshold"]
    counts = {"scored": 0, "below_threshold": 0, "eligible": 0}
    for p in store.prospects(["researched", "no_email", "below_threshold"], limit=1000):
        sc = score_prospect(p)
        status = p["status"]
        if p.get("email"):
            status = "below_threshold" if sc < threshold else "researched"   # no email stays 'no_email'
        store.update_prospect(p["id"], {"score": sc, "status": status})
        counts["scored"] += 1
        counts["below_threshold"] += status == "below_threshold"
        counts["eligible"] += status == "researched"
    return counts


def main() -> int:
    store = Store(os.environ)
    if not store.configured:
        log("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
        return 2
    print(json.dumps(score_all(store, load_config())))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
