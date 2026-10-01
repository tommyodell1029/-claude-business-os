"""Create/update Stripe Products + Prices from config/offerings.yaml. Idempotent: re-running changes nothing
unless the config changed (then the new price takes over the lookup key and the old one is archived).

  uv run python scripts/stripe_catalog.py --dry-run   # print the plan (still reads Stripe to diff)
  uv run python scripts/stripe_catalog.py --plan-only # print the desired catalog, no Stripe calls
  uv run python scripts/stripe_catalog.py             # apply in sandbox (rk_test_/sk_test_ key)
  uv run python scripts/stripe_catalog.py --live      # go-live only, with the rk_live_ key
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))

from lp.stripe_billing import StripeClient, apply_catalog, catalog_plan, load_offerings  # noqa: E402


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="diff against Stripe, change nothing")
    ap.add_argument("--plan-only", action="store_true", help="print the desired catalog without calling Stripe")
    ap.add_argument("--live", action="store_true", help="allow a live-mode key (go-live only)")
    args = ap.parse_args(argv)

    plan = catalog_plan(load_offerings())
    if args.plan_only:
        for p in plan["products"]:
            print(f"product {p['id']}: {p['name']}")
        for pr in plan["prices"]:
            per = f"/{pr['recurring']}" if pr["recurring"] else " one-time"
            print(f"  price {pr['lookup_key']}: {pr['unit_amount'] / 100:.2f} {pr['currency'].upper()}{per}")
        for k in plan["retire"]:
            print(f"  retire (not sellable) {k}")
        return 0

    client = StripeClient(allow_live=args.live)
    print(f"Stripe mode: {client.mode}")
    apply_catalog(client, plan, dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
