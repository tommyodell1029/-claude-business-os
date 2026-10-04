"""Prospect top-up: import a web-search seed, research the new rows, score them, report counts. Never sends or drafts.

Same rules as the rest of leadgen: seed rows carry only name/website/industry/city from public search results; emails
come only from the business's own site (research.py, robots.txt honored); role inboxes are never eligible.
Usage: uv run python -m leadgen.topup leadgen/seed/web_search_<date>.json [--snapshot snap.json --sql-out w.sql]
"""
from __future__ import annotations

import argparse
import json
import os

from . import ROOT  # noqa: F401
from .db import open_store
from .import_prospects import to_rows
from .plan_day import eligible_new
from .research import Crawler, research, urllib_fetch
from .score import score_all
from .source import load_config, log


def topup(store, seed: dict, cfg: dict, crawler) -> dict:
    known = {r.get("place_id") for r in store.prospects(
        ["new", "researched", "no_email", "below_threshold", "queued", "in_sequence", "replied", "interested", "not_now",
         "not_interested", "unsubscribed", "bounced", "do_not_contact"], limit=100000)}
    rows = [r for r in to_rows(seed) if r["place_id"] not in known]
    store.upsert_prospects(rows)
    researched = research(store, crawler, cfg, limit=len(rows) or 1) if rows else {"researched": 0, "no_email": 0}
    scored = score_all(store, cfg)
    events = store.outreach_events()
    return {"seed_rows": len(seed.get("rows", [])), "new_rows": len(rows), "research": researched,
            "eligible_new_total": len(eligible_new(store, events, store.suppressed_emails(), cfg)), "scored": scored}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("seed")
    ap.add_argument("--snapshot")
    ap.add_argument("--sql-out")
    a = ap.parse_args(argv)
    store = open_store(os.environ, a.snapshot)
    if not store.configured:
        log("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (or pass --snapshot)")
        return 2
    cfg = load_config()
    with open(a.seed) as f:
        res = topup(store, json.load(f), cfg, Crawler(urllib_fetch, cfg))
    if a.snapshot and a.sql_out:
        with open(a.sql_out, "w") as f:
            f.write(store.to_sql())
    print(json.dumps(res, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
