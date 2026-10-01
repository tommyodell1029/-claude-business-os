"""Create a Stripe Checkout link for a new receptionist client: setup fee now, monthly from the right date.

  uv run python scripts/new_checkout.py acme-plumbing launch                      # pricing from config phase
  uv run python scripts/new_checkout.py acme-plumbing growth --standard --addons extra_number:2 gbp_setup
  uv run python scripts/new_checkout.py acme-plumbing launch --dry-run            # print the session body only

Founding: first monthly charge on the 1st of the 2nd month after setup (lp.billing.first_recurring_charge).
Standard: first monthly charge one month after setup. Send the printed URL to the client.
"""
import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))

from lp.stripe_billing import (  # noqa: E402
    StripeClient, checkout_params, default_pricing, load_offerings, parse_addons, resolve_line_items,
)

SITE = os.getenv("LP_SITE_URL", "https://launchpad-site-ten.vercel.app").rstrip("/")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("client_slug")
    ap.add_argument("tier")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--founding", dest="pricing", action="store_const", const="founding")
    g.add_argument("--standard", dest="pricing", action="store_const", const="standard")
    ap.add_argument("--addons", nargs="*", default=[], help="add-on keys, optionally name:qty")
    ap.add_argument("--email", help="prefill the client's billing email")
    ap.add_argument("--dry-run", action="store_true", help="print the Checkout Session body, no Stripe calls")
    ap.add_argument("--live", action="store_true", help="allow a live-mode key (go-live only)")
    args = ap.parse_args(argv)

    offerings = load_offerings()
    pricing = args.pricing or default_pricing(offerings)
    body = checkout_params(
        offerings, client_slug=args.client_slug, tier=args.tier, pricing=pricing, today=date.today(),
        addons=parse_addons(args.addons), customer_email=args.email,
        success_url=f"{SITE}/?checkout=success", cancel_url=f"{SITE}/?checkout=cancelled",
    )
    if args.dry_run:
        print(json.dumps(body, indent=2))
        return 0

    client = StripeClient(allow_live=args.live)
    session = client.post("/checkout/sessions", resolve_line_items(client, body))
    print(f"Stripe mode: {client.mode}")
    print(f"pricing: {pricing}  first monthly charge: {body['metadata']['first_recurring_charge']}")
    print(f"session: {session['id']}")
    print(session["url"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
