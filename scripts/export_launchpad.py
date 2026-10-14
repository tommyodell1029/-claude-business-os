"""Export the Launchpad Local business records to one JSON file (for backup, review, or a future StarNet import).

    uv run python scripts/export_launchpad.py [--out exports/launchpad-YYYY-MM-DD.json]

Exports website-offer prospects (with audits and pipeline), their outreach events, client projects and Launchpad
revenue. Business contact data stays out of git: exports/ is gitignored.
"""
import argparse
import datetime as dt
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from leadgen.db import Store  # noqa: E402

SCHEMA_VERSION = "launchpad/1"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=f"exports/launchpad-{dt.date.today()}.json")
    a = ap.parse_args(argv)
    s = Store(os.environ)
    if not s.configured:
        print("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set", file=sys.stderr)
        return 2
    prospects = s._rest("GET", "prospects?offer=eq.website&select=*&limit=10000")
    ids = [p["id"] for p in prospects]
    events = [e for e in s._rest("GET", "outreach_events?select=*&limit=100000") if e.get("prospect_id") in set(ids)]
    data = {
        "schema": SCHEMA_VERSION, "exported_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "prospects": prospects, "outreach_events": events,
        "client_projects": s._rest("GET", "client_projects?select=*&limit=10000"),
        "revenue_entries": s._rest("GET", "revenue_entries?venture=eq.Launchpad%20Local%20websites&select=*&limit=10000"),
    }
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with open(a.out, "w") as f:
        json.dump(data, f, indent=1, default=str)
    print(f"{a.out}: {len(prospects)} prospects, {len(events)} outreach events, {len(data['client_projects'])} projects")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
