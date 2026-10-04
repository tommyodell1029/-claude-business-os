"""Stripe catalog + checkout planning from config/offerings.yaml. Plain HTTPS, no Stripe SDK.

Pure functions (catalog_plan, checkout_params, ...) are unit-tested offline. StripeClient talks to the API and
refuses live keys unless the caller passes allow_live=True (go-live only; see docs/STRIPE.md).
No refunds functionality lives here on purpose: all sales are final (config terms.refunds).
"""
import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

import yaml

from lp.billing import first_recurring_charge
from lp.text import redact

ROOT = Path(__file__).resolve().parents[2]
OFFERINGS_FILE = ROOT / "config" / "offerings.yaml"
API = "https://api.stripe.com/v1"
BILLING_TZ = ZoneInfo("America/New_York")
CHARGE_HOUR = 12  # first monthly charge at noon ET on the due date, so it lands on that date in any US zone


def load_offerings(path: Path = OFFERINGS_FILE) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def cents(amount) -> int:
    return int(Decimal(str(amount)) * 100)


# ------------------------------------------------------------------ catalog
def setup_lookup_key(offerings: dict, tier: str, pricing: str) -> str:
    t = offerings["tiers"][tier]
    if t["founding"]["setup"] == t["standard"]["setup"]:
        return f"lp_{tier}_setup"
    return f"lp_{tier}_{pricing}_setup"


def monthly_lookup_key(tier: str, pricing: str) -> str:
    return f"lp_{tier}_{pricing}_monthly"


def addon_lookup_key(addon: str, kind: str) -> str:
    return f"lp_addon_{addon}_{kind}"


def catalog_plan(offerings: dict) -> dict:
    """Desired Stripe state: {"products": [...], "prices": [...], "retire": [lookup_keys of unsellable items]}."""
    cur = offerings["currency"].lower()
    products, prices, retire = [], [], []
    for tier, t in offerings["tiers"].items():
        pid = f"lp_tier_{tier}"
        products.append({"id": pid, "name": f"AI Phone Receptionist - {t['name']}",
                         "metadata": {"lp_kind": "tier", "lp_tier": tier}})
        seen = set()
        for pricing in ("founding", "standard"):
            sk = setup_lookup_key(offerings, tier, pricing)
            if sk not in seen:
                seen.add(sk)
                prices.append({"lookup_key": sk, "product": pid, "unit_amount": cents(t[pricing]["setup"]),
                               "currency": cur, "recurring": None,
                               "metadata": {"lp_tier": tier, "lp_type": "setup"}})
            prices.append({"lookup_key": monthly_lookup_key(tier, pricing), "product": pid,
                           "unit_amount": cents(t[pricing]["monthly"]), "currency": cur, "recurring": "month",
                           "metadata": {"lp_tier": tier, "lp_type": "monthly", "lp_pricing": pricing}})
    for name, a in offerings["addons"].items():
        keys = []
        for kind, amount in a["price"].items():
            if kind not in ("one_time", "setup", "monthly"):
                raise ValueError(f"addon {name}: unknown price kind {kind!r}")
            keys.append((addon_lookup_key(name, kind), kind, amount))
        if not a.get("available"):
            retire += [k for k, _, _ in keys]
            continue
        pid = f"lp_addon_{name}"
        products.append({"id": pid, "name": a["name"], "metadata": {"lp_kind": "addon", "lp_addon": name}})
        for key, kind, amount in keys:
            prices.append({"lookup_key": key, "product": pid, "unit_amount": cents(amount), "currency": cur,
                           "recurring": "month" if kind == "monthly" else None,
                           "metadata": {"lp_addon": name, "lp_type": "addon"}})
    return {"products": products, "prices": prices, "retire": retire}


def price_matches(want: dict, have: dict) -> bool:
    rec = (have.get("recurring") or {}).get("interval")
    prod = have.get("product")
    prod = prod.get("id") if isinstance(prod, dict) else prod
    return (have.get("unit_amount") == want["unit_amount"] and have.get("currency") == want["currency"]
            and rec == want["recurring"] and prod == want["product"] and have.get("active", True))


def diff_catalog(plan: dict, products: dict, prices: dict) -> list[tuple]:
    """products: {id: stripe product or None}; prices: {lookup_key: active stripe price or None}.
    Returns ordered actions; empty list means Stripe already matches config."""
    actions = []
    for p in plan["products"]:
        have = products.get(p["id"])
        if have is None:
            actions.append(("create_product", p))
        elif have.get("name") != p["name"] or not have.get("active", True):
            actions.append(("update_product", p))
    for pr in plan["prices"]:
        have = prices.get(pr["lookup_key"])
        if have is None:
            actions.append(("create_price", pr, None))
        elif not price_matches(pr, have):
            actions.append(("create_price", pr, have["id"]))  # Stripe prices are immutable: replace + archive old
    for key in plan["retire"]:
        if prices.get(key) is not None:
            actions.append(("archive_price", key, prices[key]["id"]))
    return actions


def apply_catalog(client: "StripeClient", plan: dict, *, dry_run: bool, log=print) -> list[tuple]:
    products = {p["id"]: client.get_or_none(f"/products/{p['id']}") for p in plan["products"]}
    keys = [p["lookup_key"] for p in plan["prices"]] + plan["retire"]
    prices = {k: None for k in keys}
    for i in range(0, len(keys), 10):  # lookup_keys filter takes at most 10 per request
        res = client.get("/prices", {"lookup_keys": keys[i:i + 10], "active": "true", "limit": 100})
        for pr in res["data"]:
            prices[pr["lookup_key"]] = pr
    actions = diff_catalog(plan, products, prices)
    if not actions:
        log("catalog: Stripe already matches config/offerings.yaml (nothing to do)")
    for a in actions:
        log(("DRY-RUN " if dry_run else "") + describe_action(a))
        if dry_run:
            continue
        if a[0] == "create_product":
            p = a[1]
            client.post("/products", {"id": p["id"], "name": p["name"], "metadata": p["metadata"]})
        elif a[0] == "update_product":
            p = a[1]
            client.post(f"/products/{p['id']}", {"name": p["name"], "active": "true", "metadata": p["metadata"]})
        elif a[0] == "create_price":
            pr, old_id = a[1], a[2]
            body = {"product": pr["product"], "unit_amount": pr["unit_amount"], "currency": pr["currency"],
                    "lookup_key": pr["lookup_key"], "transfer_lookup_key": "true", "metadata": pr["metadata"]}
            if pr["recurring"]:
                body["recurring"] = {"interval": pr["recurring"]}
            client.post("/prices", body)
            if old_id:
                client.post(f"/prices/{old_id}", {"active": "false"})
        elif a[0] == "archive_price":
            client.post(f"/prices/{a[2]}", {"active": "false"})
    return actions


def describe_action(a: tuple) -> str:
    if a[0] in ("create_product", "update_product"):
        return f"{a[0]} {a[1]['id']} ({a[1]['name']})"
    if a[0] == "create_price":
        pr = a[1]
        per = f"/{pr['recurring']}" if pr["recurring"] else " one-time"
        repl = f" replacing {a[2]}" if a[2] else ""
        return f"create_price {pr['lookup_key']} {pr['unit_amount'] / 100:.2f} {pr['currency'].upper()}{per}{repl}"
    return f"archive_price {a[1]} ({a[2]})"


# ------------------------------------------------------------------ checkout
def default_pricing(offerings: dict) -> str:
    ph = offerings["pricing_phase"]
    return "founding" if ph["founding_clients_signed"] < ph["founding_client_limit"] else "standard"


def charge_timestamp(d: date) -> int:
    return int(datetime.combine(d, time(CHARGE_HOUR), BILLING_TZ).timestamp())


def terms_text(offerings: dict, pricing: str, first_charge: date) -> str:
    t = offerings["terms"]
    first = f"{first_charge:%B} {first_charge.day}, {first_charge.year}"
    lines = [
        "Today you pay the one-time setup fee (plus any one-time add-ons).",
        f"Your first monthly charge is on {first}, then monthly after that."
        + (" The month after setup is free (founding client offer)." if pricing == "founding" else ""),
        f"Plan: {t['contract']}.",
        t["refunds"],
        t["cancellation"].format(cancellation_email=t["cancellation_email"]),
    ]
    return " ".join(lines)


def parse_addons(specs: list[str]) -> list[tuple[str, int]]:
    out = []
    for s in specs:
        name, _, qty = s.partition(":")
        out.append((name, int(qty) if qty else 1))
    return out


def checkout_params(offerings: dict, *, client_slug: str, tier: str, pricing: str, today: date,
                    addons: list[tuple[str, int]] = (), success_url: str, cancel_url: str,
                    customer_email: str | None = None) -> dict:
    """Checkout Session (mode=subscription) body. One-time setup + one-time add-ons are on the first invoice,
    paid now; the monthly prices start at first_recurring_charge() via subscription_data.trial_end."""
    if tier not in offerings["tiers"]:
        raise ValueError(f"unknown tier {tier!r}")
    if pricing not in ("founding", "standard"):
        raise ValueError("pricing must be founding or standard")
    if not client_slug or not all(c.isalnum() or c == "-" for c in client_slug) or client_slug != client_slug.lower():
        raise ValueError("client_slug must be lowercase letters, digits and dashes")
    first = first_recurring_charge(today, founding=pricing == "founding")
    items = [{"price": setup_lookup_key(offerings, tier, pricing), "quantity": 1},
             {"price": monthly_lookup_key(tier, pricing), "quantity": 1}]
    included = set(offerings["tiers"][tier]["features"])
    for name, qty in addons:
        a = offerings["addons"].get(name)
        if a is None or not a.get("available"):
            raise ValueError(f"add-on {name!r} is not sellable (available: true required)")
        if name in included:
            raise ValueError(f"add-on {name!r} is already included in {tier}")
        if qty < 1:
            raise ValueError("add-on quantity must be >= 1")
        for kind in a["price"]:
            items.append({"price": addon_lookup_key(name, kind), "quantity": qty})
    meta = {"client_slug": client_slug, "tier": tier, "pricing": pricing,
            "first_recurring_charge": first.isoformat(),
            "addons": ",".join(f"{n}:{q}" for n, q in addons)}
    body = {
        "mode": "subscription",
        "line_items": items,  # lookup keys; resolve_line_items() swaps in price ids before the API call
        "success_url": success_url,
        "cancel_url": cancel_url,
        "client_reference_id": client_slug,
        "payment_method_collection": "always",
        "metadata": meta,
        "subscription_data": {
            "trial_end": charge_timestamp(first),
            "trial_settings": {"end_behavior": {"missing_payment_method": "cancel"}},
            "metadata": meta,
        },
        "custom_text": {"submit": {"message": terms_text(offerings, pricing, first)}},
    }
    if customer_email:
        body["customer_email"] = customer_email
    return body


def resolve_line_items(client: "StripeClient", body: dict) -> dict:
    keys = [li["price"] for li in body["line_items"]]
    res = client.get("/prices", {"lookup_keys": keys, "active": "true", "limit": 100})
    by_key = {p["lookup_key"]: p["id"] for p in res["data"]}
    missing = [k for k in keys if k not in by_key]
    if missing:
        raise RuntimeError(f"prices missing in Stripe (run scripts/stripe_catalog.py): {missing}")
    return {**body, "line_items": [{**li, "price": by_key[li["price"]]} for li in body["line_items"]]}


# ------------------------------------------------------------------ HTTP
def form_encode(data: dict, prefix: str = "") -> list[tuple[str, str]]:
    """Stripe's bracket form encoding: a[b]=1, items[0][price]=x, lookup_keys[]=k."""
    out = []
    for k, v in data.items():
        key = f"{prefix}[{k}]" if prefix else str(k)
        if v is None:
            continue
        if isinstance(v, dict):
            out += form_encode(v, key)
        elif isinstance(v, (list, tuple)):
            for i, item in enumerate(v):
                if isinstance(item, dict):
                    out += form_encode(item, f"{key}[{i}]")
                else:
                    out.append((f"{key}[{i}]", str(item)))
        elif isinstance(v, bool):
            out.append((key, "true" if v else "false"))
        else:
            out.append((key, str(v)))
    return out


def load_key(env: dict = os.environ, *, live: bool = False) -> str:
    """Sandbox key from STRIPE_SECRET_KEY. With live=True (--live), STRIPE_LIVE_SECRET_KEY wins when set,
    so the sandbox key can stay in place for day-to-day work."""
    name = "STRIPE_LIVE_SECRET_KEY" if live and env.get("STRIPE_LIVE_SECRET_KEY", "").strip() else "STRIPE_SECRET_KEY"
    raw = env.get(name, "").strip()
    if not raw:
        raise RuntimeError(f"{name} is not set")
    if raw.startswith("<") and raw.endswith(">"):
        print(f"warning: {name} is wrapped in <...>; stripped in-process. Fix the stored value.",
              file=sys.stderr)
        raw = raw[1:-1].strip()
    return raw


def key_mode(key: str) -> str:
    if key.startswith(("sk_test_", "rk_test_")):
        return "test"
    if key.startswith(("sk_live_", "rk_live_")):
        return "live"
    raise RuntimeError("STRIPE_SECRET_KEY is not a Stripe secret or restricted key")


class StripeError(RuntimeError):
    def __init__(self, status: int, message: str):
        super().__init__(f"Stripe API {status}: {message}")
        self.status = status


class StripeClient:
    def __init__(self, key: str | None = None, *, allow_live: bool = False, timeout: float = 30):
        self.key = key or load_key(live=allow_live)
        self.mode = key_mode(self.key)
        if self.mode == "live" and not allow_live:
            raise RuntimeError("live Stripe key refused: pass --live only during go-live (docs/STRIPE.md)")
        self.timeout = timeout

    def _req(self, method: str, path: str, params: dict | None = None) -> dict:
        enc = urllib.parse.urlencode(form_encode(params or {}))
        url = API + path + (f"?{enc}" if method == "GET" and enc else "")
        data = enc.encode() if method == "POST" else None
        auth = base64.b64encode(f"{self.key}:".encode()).decode()
        req = urllib.request.Request(url, data=data, method=method, headers={"Authorization": f"Basic {auth}"})
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            try:
                msg = json.loads(e.read()).get("error", {}).get("message", "")
            except ValueError:
                msg = ""
            raise StripeError(e.code, redact(msg)) from None

    def get(self, path: str, params: dict | None = None) -> dict:
        return self._req("GET", path, params)

    def post(self, path: str, params: dict | None = None) -> dict:
        return self._req("POST", path, params)

    def get_or_none(self, path: str) -> dict | None:
        try:
            return self.get(path)
        except StripeError as e:
            if e.status == 404:
                return None
            raise
