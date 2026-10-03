"""Import prospects from a JSON seed (public web-search results or any list you trust) into `prospects`.

Seed: {"source": "web_search", "rows": [{"name", "website", "industry", "city"?, "phone"?, "address"?}]}.
place_id = "web:<domain>" so re-imports are idempotent; status stays 'new' so research.py picks the rows up.
Only the fields given are stored. No emails are accepted here: research.py finds them on the business's own site.
Usage: uv run python -m leadgen.import_prospects leadgen/seed/web_search_2026-10-03.json [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import os
import sys

from . import ROOT  # noqa: F401
from lp.text import domain_of, norm_phone
from .db import Store
from .source import log


def to_rows(seed: dict) -> list[dict]:
    source = seed.get("source") or "web_search"
    out, seen = [], set()
    for r in seed.get("rows", []):
        dom = domain_of(r.get("website"))
        if not dom or not r.get("name") or dom in seen:
            continue
        seen.add(dom)
        row = {"place_id": f"web:{dom}", "name": r["name"], "industry": r.get("industry"), "city": r.get("city"),
               "address": r.get("address"), "phone": norm_phone(r.get("phone")), "website": r["website"], "source": source}
        out.append({k: v for k, v in row.items() if v is not None})
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("seed")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    with open(a.seed) as f:
        rows = to_rows(json.load(f))
    store = Store(os.environ)
    if not a.dry_run:
        if not store.configured:
            log("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
            return 2
        store.upsert_prospects(rows)
    print(json.dumps({"rows": len(rows), "dry_run": a.dry_run}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
