import sys
import unittest
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))

from lp import stripe_billing as sb  # noqa: E402
from lp.billing import first_recurring_charge  # noqa: E402

OFF = sb.load_offerings()
URLS = {"success_url": "https://x/ok", "cancel_url": "https://x/no"}


class FakeStripe:
    """In-memory stand-in for the endpoints apply_catalog uses."""

    def __init__(self):
        self.products, self.prices, self.writes, self.n = {}, {}, [], 0

    def get_or_none(self, path):
        return self.products.get(path.rsplit("/", 1)[1])

    def get(self, path, params=None):
        keys = set(params["lookup_keys"])
        return {"data": [p for p in self.prices.values() if p["active"] and p.get("lookup_key") in keys]}

    def post(self, path, params):
        self.writes.append(path)
        if path == "/products":
            self.products[params["id"]] = {"id": params["id"], "name": params["name"], "active": True}
        elif path.startswith("/products/"):
            self.products[path.rsplit("/", 1)[1]].update(name=params["name"], active=True)
        elif path == "/prices":
            for p in self.prices.values():
                if p.get("lookup_key") == params["lookup_key"]:
                    p["lookup_key"] = None
            self.n += 1
            pid = f"price_{self.n}"
            rec = params.get("recurring")
            self.prices[pid] = {"id": pid, "lookup_key": params["lookup_key"], "product": params["product"],
                                "unit_amount": params["unit_amount"], "currency": params["currency"],
                                "recurring": {"interval": rec["interval"]} if rec else None, "active": True}
        elif path.startswith("/prices/"):
            self.prices[path.rsplit("/", 1)[1]]["active"] = params["active"] == "true"
        return {}


class TestCatalogPlan(unittest.TestCase):
    def test_prices_match_config(self):
        plan = sb.catalog_plan(OFF)
        by = {p["lookup_key"]: p for p in plan["prices"]}
        for tier, t in OFF["tiers"].items():
            for ph in ("founding", "standard"):
                m = by[f"lp_{tier}_{ph}_monthly"]
                self.assertEqual(m["unit_amount"], int(t[ph]["monthly"] * 100))
                self.assertEqual(m["recurring"], "month")
                s = by[sb.setup_lookup_key(OFF, tier, ph)]
                self.assertEqual(s["unit_amount"], int(t[ph]["setup"] * 100))
                self.assertIsNone(s["recurring"])
        self.assertEqual(by["lp_launch_founding_monthly"]["unit_amount"], 29700)
        self.assertEqual(by["lp_launch_setup"]["unit_amount"], 49700)

    def test_only_sellable_addons(self):
        plan = sb.catalog_plan(OFF)
        keys = {p["lookup_key"] for p in plan["prices"]}
        self.assertIn("lp_addon_gbp_setup_one_time", keys)
        self.assertIn("lp_addon_extra_number_monthly", keys)
        self.assertIn("lp_addon_bilingual_es_monthly", keys)
        for name, a in OFF["addons"].items():
            for kind in a["price"]:
                k = sb.addon_lookup_key(name, kind)
                self.assertEqual(k in keys, bool(a["available"]), k)
                self.assertEqual(k in plan["retire"], not a["available"], k)
        self.assertNotIn("website", str(keys))

    def test_lookup_keys_unique(self):
        keys = [p["lookup_key"] for p in sb.catalog_plan(OFF)["prices"]]
        self.assertEqual(len(keys), len(set(keys)))

    def test_apply_is_idempotent_and_replaces_changed_price(self):
        fake, plan = FakeStripe(), sb.catalog_plan(OFF)
        first = sb.apply_catalog(fake, plan, dry_run=False, log=lambda *_: None)
        self.assertEqual(len(first), len(plan["products"]) + len(plan["prices"]))
        writes = len(fake.writes)
        self.assertEqual(sb.apply_catalog(fake, plan, dry_run=False, log=lambda *_: None), [])
        self.assertEqual(len(fake.writes), writes)

        changed = {**OFF, "tiers": {**OFF["tiers"], "launch": {**OFF["tiers"]["launch"],
                                                               "standard": {"setup": 497, "monthly": 547}}}}
        acts = sb.apply_catalog(fake, sb.catalog_plan(changed), dry_run=False, log=lambda *_: None)
        self.assertEqual([a[0] for a in acts], ["create_price"])
        active = [p for p in fake.prices.values() if p["active"] and p["product"] == "lp_tier_launch"
                  and p["unit_amount"] in (49700, 54700) and p["recurring"]]
        self.assertEqual([p["unit_amount"] for p in active], [54700])

    def test_dry_run_writes_nothing(self):
        fake = FakeStripe()
        acts = sb.apply_catalog(fake, sb.catalog_plan(OFF), dry_run=True, log=lambda *_: None)
        self.assertTrue(acts)
        self.assertEqual(fake.writes, [])


class TestCheckoutParams(unittest.TestCase):
    def test_founding_dates_and_items(self):
        today = date(2026, 10, 1)
        b = sb.checkout_params(OFF, client_slug="test-co", tier="launch", pricing="founding", today=today, **URLS)
        self.assertEqual(b["mode"], "subscription")
        self.assertEqual([li["price"] for li in b["line_items"]], ["lp_launch_setup", "lp_launch_founding_monthly"])
        due = datetime.fromtimestamp(b["subscription_data"]["trial_end"], ZoneInfo("America/New_York"))
        self.assertEqual(due.date(), date(2026, 12, 1))
        self.assertEqual(due.date(), first_recurring_charge(today, founding=True))
        self.assertEqual(b["metadata"], b["subscription_data"]["metadata"])
        self.assertEqual(b["metadata"]["client_slug"], "test-co")
        self.assertEqual(b["metadata"]["tier"], "launch")
        self.assertEqual(b["metadata"]["pricing"], "founding")

    def test_standard_dates(self):
        b = sb.checkout_params(OFF, client_slug="t", tier="growth", pricing="standard", today=date(2027, 1, 31),
                               **URLS)
        due = datetime.fromtimestamp(b["subscription_data"]["trial_end"], ZoneInfo("America/New_York"))
        self.assertEqual(due.date(), date(2027, 2, 28))
        self.assertIn("lp_growth_standard_monthly", [li["price"] for li in b["line_items"]])

    def test_terms_on_checkout_page(self):
        b = sb.checkout_params(OFF, client_slug="t", tier="launch", pricing="founding", today=date(2026, 10, 1),
                               **URLS)
        msg = b["custom_text"]["submit"]["message"]
        for s in ("month-to-month", "All sales are final", "tommy@launchpadlocal.org", "December 1, 2026"):
            self.assertIn(s, msg)
        self.assertLessEqual(len(msg), 1200)  # Stripe custom_text limit

    def test_addons(self):
        b = sb.checkout_params(OFF, client_slug="t", tier="launch", pricing="founding", today=date(2026, 10, 1),
                               addons=[("extra_number", 2), ("gbp_setup", 1)], **URLS)
        self.assertIn({"price": "lp_addon_extra_number_monthly", "quantity": 2}, b["line_items"])
        self.assertIn({"price": "lp_addon_gbp_setup_one_time", "quantity": 1}, b["line_items"])
        with self.assertRaises(ValueError):  # not sellable
            sb.checkout_params(OFF, client_slug="t", tier="launch", pricing="founding", today=date(2026, 10, 1),
                               addons=[("chat_widget", 1)], **URLS)
        with self.assertRaises(ValueError):  # included in Scale
            sb.checkout_params(OFF, client_slug="t", tier="scale", pricing="founding", today=date(2026, 10, 1),
                               addons=[("bilingual_es", 1)], **URLS)

    def test_rejects_bad_input(self):
        for kw in ({"tier": "mega"}, {"pricing": "free"}, {"client_slug": "Bad Slug"}):
            args = {"client_slug": "t", "tier": "launch", "pricing": "founding", **kw}
            with self.assertRaises(ValueError):
                sb.checkout_params(OFF, today=date(2026, 10, 1), **args, **URLS)

    def test_default_pricing_from_phase(self):
        self.assertEqual(sb.default_pricing({"pricing_phase": {"founding_client_limit": 5,
                                                               "founding_clients_signed": 4}}), "founding")
        self.assertEqual(sb.default_pricing({"pricing_phase": {"founding_client_limit": 5,
                                                               "founding_clients_signed": 5}}), "standard")


class TestHttpHelpers(unittest.TestCase):
    def test_form_encode(self):
        enc = dict(sb.form_encode({"a": {"b": 1}, "line_items": [{"price": "p", "quantity": 2}],
                                   "lookup_keys": ["x", "y"], "skip": None}))
        self.assertEqual(enc, {"a[b]": "1", "line_items[0][price]": "p", "line_items[0][quantity]": "2",
                               "lookup_keys[0]": "x", "lookup_keys[1]": "y"})

    def test_key_handling_refuses_live(self):
        self.assertEqual(sb.load_key({"STRIPE_SECRET_KEY": "<rk_test_abc>"}), "rk_test_abc")
        self.assertEqual(sb.key_mode("rk_test_abc"), "test")
        with self.assertRaises(RuntimeError):
            sb.StripeClient("rk_live_abc")
        with self.assertRaises(RuntimeError):
            sb.load_key({})


if __name__ == "__main__":
    unittest.main()
