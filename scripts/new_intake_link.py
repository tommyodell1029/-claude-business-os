"""Create a one-time client intake link for a paid client.

  uv run python scripts/new_intake_link.py acme-plumbing launch --business-name "Acme Plumbing"
  uv run python scripts/new_intake_link.py acme-plumbing scale                      # Scale includes Spanish
  uv run python scripts/new_intake_link.py acme-plumbing growth --spanish           # bought the Spanish add-on
  uv run python scripts/new_intake_link.py acme-plumbing launch --dry-run           # print nothing sensitive, store nothing

The token is 32 random bytes (base64url). Only its sha256 is stored in `client_intakes`; the link is printed once and
cannot be recovered. Valid 14 days, single-use submit. A new link revokes any older pending link for the same client.
Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. LP_SITE_URL overrides the site origin.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import re
import secrets
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "lib"))

from agents.notify.http import urllib_http  # noqa: E402
from agents.notify.supabase_rest import Supabase  # noqa: E402
from lp.text import redact  # noqa: E402

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}$")
TIERS = ("launch", "growth", "scale")
EXPIRY_DAYS = 14
DEFAULT_SITE = "https://launchpad-site-ten.vercel.app"


def make_token() -> str:
    return secrets.token_urlsafe(32)  # 32 random bytes -> 43 base64url chars


def hash_token(token: str) -> str:
    """sha256 hex of the token string. Must match site/lib/onboard.ts hashToken."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def intake_row(slug: str, tier: str, token: str, *, spanish: bool = False, business_name: str | None = None,
               now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    return {"client_slug": slug, "tier": tier, "spanish": spanish, "business_hint": (business_name or "").strip()[:150] or None,
            "token_hash": hash_token(token), "status": "pending",
            "expires_at": (now + timedelta(days=EXPIRY_DAYS)).isoformat()}


def run(slug: str, tier: str, *, spanish: bool = False, business_name: str | None = None, dry_run: bool = False,
        env=None, http=urllib_http, out=print, site: str | None = None) -> int:
    env = os.environ if env is None else env
    if not SLUG_RE.match(slug):
        out("INVALID: slug must be lowercase letters, digits and dashes (2-63 chars)")
        return 2
    if tier not in TIERS:
        out(f"INVALID: tier must be one of {', '.join(TIERS)}")
        return 2
    token = make_token()
    row = intake_row(slug, tier, token, spanish=spanish, business_name=business_name)
    site = (site or env.get("LP_SITE_URL") or DEFAULT_SITE).rstrip("/")
    if dry_run:
        out(f"dry run: would create a {tier} intake link for {slug}, expires {row['expires_at'][:10]}; nothing stored")
        return 0
    db = Supabase(env, http)
    if not db.configured:
        out("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set: no link created")
        return 3
    try:
        db._rest("PATCH", f"client_intakes?client_slug=eq.{slug}&status=eq.pending", "return=minimal", {"status": "revoked"})
        db._rest("POST", "client_intakes", "return=minimal", row)
    except Exception as e:
        out(redact(f"could not store the intake link: {e}"))
        return 3
    out(f"Intake link for {slug} ({tier}{', Spanish' if spanish or tier == 'scale' else ''}), valid {EXPIRY_DAYS} days, one submit.")
    out("Shown once; only its hash is stored. Send it to the client:")
    out(f"{site}/onboard/{token}")
    out(f"\nAfter they submit you get an email. Then: uv run python scripts/onboard_client.py {slug}")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("slug")
    ap.add_argument("tier", choices=TIERS)
    ap.add_argument("--spanish", action="store_true", help="client bought the Spanish add-on (Scale always includes it)")
    ap.add_argument("--business-name", help="shown as a greeting on the form")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    return run(a.slug, a.tier, spanish=a.spanish, business_name=a.business_name, dry_run=a.dry_run)


if __name__ == "__main__":
    sys.exit(main())
