"""Per-client call minutes vs included minutes, with overage. Read-only: it never bills anyone.

  uv run python scripts/usage_report.py                  # current billing month, all clients
  uv run python scripts/usage_report.py --month 2026-10
  uv run python scripts/usage_report.py --client acme-plumbing

Reads the Supabase view `client_usage_monthly` (calendar month in the client's timezone; total call seconds in the month
rounded UP to whole minutes). Included minutes and the overage rate come from config/offerings.yaml for the client's tier
(`clients.tier`). A client with no tier shows DATA UNAVAILABLE. See docs/BUILD_STATUS.md "Onboarding" for how overage would be invoiced.
"""
from __future__ import annotations

import argparse
import math
import os
import sys
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from urllib.parse import quote

import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "lib"))

from agents.notify.http import urllib_http  # noqa: E402
from agents.notify.supabase_rest import Supabase  # noqa: E402
from lp.text import redact  # noqa: E402

OFFERINGS = ROOT / "config" / "offerings.yaml"
UNAVAILABLE = "DATA UNAVAILABLE"


def billable_minutes(total_sec: int) -> int:
    """Same rule as the SQL function lp_billable_minutes: month total rounded up to a whole minute."""
    return math.ceil(max(int(total_sec or 0), 0) / 60)


def usage_line(row: dict, offerings: dict) -> dict:
    """row: a client_usage_monthly row. Returns minutes, included, overage minutes and overage dollars (Decimal), or None if the tier is unknown."""
    minutes = billable_minutes(row.get("total_sec", 0))
    tier = (offerings.get("tiers") or {}).get(row.get("tier") or "")
    out = {"client": row["client_slug"], "month": row["billing_month"], "calls": row.get("calls", 0), "minutes": minutes,
           "tier": row.get("tier"), "included": None, "overage_minutes": None, "overage_usd": None}
    if tier:
        over = max(minutes - int(tier["included_minutes"]), 0)
        out.update(included=int(tier["included_minutes"]), overage_minutes=over,
                   overage_usd=(Decimal(str(tier["overage_per_min"])) * over).quantize(Decimal("0.01"), ROUND_HALF_UP))
    return out


def month_start(text: str | None, today: date | None = None) -> date:
    if text:
        y, m = text.split("-")
        return date(int(y), int(m), 1)
    t = today or date.today()
    return date(t.year, t.month, 1)


def format_report(lines: list[dict]) -> str:
    head = f"{'client':<28}{'month':<9}{'tier':<8}{'calls':>6}{'minutes':>9}{'included':>10}{'over min':>10}{'over $':>9}"
    rows = [head, "-" * len(head)]
    total = Decimal("0")
    for l in lines:
        if l["overage_usd"] is None:
            inc, om, ou = UNAVAILABLE, "", ""
        else:
            inc, om, ou = str(l["included"]), str(l["overage_minutes"]), f"{l['overage_usd']:.2f}"
            total += l["overage_usd"]
        rows.append(f"{l['client']:<28}{str(l['month'])[:7]:<9}{(l['tier'] or '-'):<8}{l['calls']:>6}{l['minutes']:>9}{inc:>10}{om:>10}{ou:>9}")
    rows += ["-" * len(head), f"total overage (clients with a known tier): ${total:.2f}",
             "Report only. Nothing is billed automatically; the owner invoices overage by hand (docs/BUILD_STATUS.md, Onboarding)."]
    return "\n".join(rows)


def run(*, month: str | None = None, client: str | None = None, env=None, http=urllib_http, out=print,
        offerings_path: Path = OFFERINGS, today: date | None = None) -> int:
    env = os.environ if env is None else env
    db = Supabase(env, http)
    if not db.configured:
        out("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
        return 3
    start = month_start(month, today)
    q = f"client_usage_monthly?billing_month=eq.{start.isoformat()}&order=client_slug.asc"
    if client:
        q += f"&client_slug=eq.{quote(client, safe='')}"
    try:
        rows = db._rest("GET", q, "return=representation")
    except Exception as e:
        out(redact(f"usage query failed: {e}"))
        return 3
    offerings = yaml.safe_load(offerings_path.read_text())
    if not rows:
        out(f"No calls recorded for {start:%Y-%m}.")
        return 0
    out(format_report([usage_line(r, offerings) for r in rows]))
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--month", help="YYYY-MM (default: current month)")
    ap.add_argument("--client")
    a = ap.parse_args(argv)
    return run(month=a.month, client=a.client)


if __name__ == "__main__":
    sys.exit(main())
