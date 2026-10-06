"""Lead bot CLI.  uv run python -m leadgen <command> [options]

  google-places-test                       diagnose the Places key/API (never prints the key)
  scout [--city "Jacksonville, FL"] [--industry plumbing] [--limit 10] [--dry-run]
        [--source places,seed,csv] [--seed file.json] [--csv file.csv] [--results r.json]
                                           discover -> research -> qualify -> decision-maker -> email -> verify -> score
  enrich [--limit 10] [--ids id1,id2] [--results r.json] [--dry-run]
                                           re-run research + enrichment on leads already in the database
  leads [--hot | --good | --needs-enrichment | --ready | --research]
                                           list leads by tier / enrichment status

Database: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, or --snapshot snap.json (exported with the Supabase connector)
plus --sql-out writes.sql to apply with execute_sql. Nothing here drafts or sends email; approval stays with the owner.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

from . import ROOT  # noqa: F401
from agents.notify.http import urllib_http
from .db import SnapshotStore, open_store
from .research import Crawler, urllib_fetch
from .source import load_config, log


def _store(a, *, write: bool):
    store = open_store(os.environ, a.snapshot)
    if store.configured and (a.snapshot or getattr(store, "key", "")):
        return store
    if write:
        log("SUPABASE_SERVICE_ROLE_KEY not set: pass --snapshot (and --sql-out) or use --dry-run")
        sys.exit(2)
    log("note: no database access; duplicates are only checked within this run")
    return SnapshotStore({})


def _results(path):
    if not path:
        return None
    with open(path) as f:
        return json.load(f)


def _finish(a, store, out: dict, render_rows: bool = True):
    from .pipeline import render
    if render_rows:
        for b in out.get("businesses", []):
            print(render(b) + "\n")
    summary = {k: v for k, v in out.items() if k != "businesses"}
    summary["tiers"] = {}
    for b in out.get("businesses", []):
        summary["tiers"][b.get("lead_tier")] = summary["tiers"].get(b.get("lead_tier"), 0) + 1
    print(json.dumps(summary, indent=2, default=str))
    if a.snapshot and a.sql_out and not out.get("dry_run"):
        with open(a.sql_out, "w") as f:
            f.write(store.to_sql())
        log(f"writes saved to {a.sql_out}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="python -m leadgen", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("google-places-test")
    for name in ("scout", "enrich", "leads"):
        p = sub.add_parser(name)
        p.add_argument("--snapshot")
        p.add_argument("--sql-out")
        if name in ("scout", "enrich"):
            p.add_argument("--limit", type=int, default=10)
            p.add_argument("--dry-run", action="store_true")
            p.add_argument("--results", help="Hunter/Apollo results gathered with the session connectors")
        if name == "scout":
            p.add_argument("--city", action="append", help="repeatable; default: config discovery.locations")
            p.add_argument("--industry", action="append", help="repeatable; keys of config industries")
            p.add_argument("--source", help="comma list: places,seed,csv")
            p.add_argument("--seed", action="append")
            p.add_argument("--csv")
        if name == "enrich":
            p.add_argument("--ids")
        if name == "leads":
            g = p.add_mutually_exclusive_group()
            for f in ("hot", "good", "research", "needs-enrichment", "ready"):
                g.add_argument(f"--{f}", action="store_true")
    a = ap.parse_args(argv)
    cfg = load_config()

    if a.cmd == "google-places-test":
        from .places_diag import main as diag
        return diag([])

    if a.cmd == "scout":
        from .pipeline import scout
        bad = [i for i in a.industry or [] if i not in cfg["industries"]]
        if bad:
            log(f"unknown industry {bad}; choose from {sorted(cfg['industries'])}")
            return 2
        store = _store(a, write=not a.dry_run)
        out = scout(store, cfg, os.environ, urllib_http, Crawler(urllib_fetch, cfg), industries=a.industry,
                    locations=a.city, limit=a.limit, dry_run=a.dry_run,
                    providers=a.source.split(",") if a.source else None, seed_paths=a.seed, csv_path=a.csv,
                    results=_results(a.results))
        _finish(a, store, out)
        return 0

    if a.cmd == "enrich":
        from .pipeline import enrich_existing
        store = _store(a, write=not a.dry_run)
        out = enrich_existing(store, cfg, os.environ, urllib_http, Crawler(urllib_fetch, cfg), limit=a.limit,
                              dry_run=a.dry_run, results=_results(a.results), ids=a.ids.split(",") if a.ids else None)
        _finish(a, store, out)
        return 0

    if a.cmd == "leads":
        from .pipeline import ALL_STATUSES
        store = _store(a, write=False)
        rows = store.prospects(ALL_STATUSES, limit=100000)
        f = {"hot": lambda r: r.get("lead_tier") == "HOT", "good": lambda r: r.get("lead_tier") == "GOOD",
             "research": lambda r: r.get("lead_tier") == "RESEARCH",
             "needs_enrichment": lambda r: r.get("enrichment_status") == "needs_contact_enrichment",
             "ready": lambda r: r.get("enrichment_status") == "ready_for_approval"}
        pick = next((k for k in f if getattr(a, k)), None)
        rows = [r for r in rows if f[pick](r)] if pick else rows
        for r in rows:
            print(f"{(r.get('lead_tier') or '-'):9} {str(r.get('score') or 0):>3}  {r.get('name')[:40]:40}  "
                  f"{(r.get('decision_maker_name') or '-')[:22]:22} {(r.get('email_verification_status') or '-'):9} "
                  f"{r.get('enrichment_status') or '-'}")
        print(f"{len(rows)} lead(s)")
        return 0
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
