"""Onboarding scripts with fakes: intake link tokens, onboard_client (YAML, PII, number buying), usage math. No network."""
import json
import re
import sys
import tempfile
import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "lib"))
sys.path.insert(0, str(ROOT / "scripts"))

import new_intake_link as nil  # noqa: E402
import onboard_client as oc  # noqa: E402
import usage_report as ur  # noqa: E402

KEY = "sb_secret_FAKEFAKEFAKEFAKEFAKE1234"
ENV = {"SUPABASE_URL": "https://x.supabase.co", "SUPABASE_SERVICE_ROLE_KEY": KEY, "TWILIO_ACCOUNT_SID": "ACfake",
       "TWILIO_AUTH_TOKEN": "tokfake123456", "LP_INBOUND_TWIML_URL": "https://handler.twilio.com/twiml/EHabcdef123456"}
PII = ["904-555-0101", "9045550101", "+19045550101", "9045550102", "pat@acme.example", "Pat Lee"]
HOURS = {d: "08:00-17:00" for d in ("mon", "tue", "wed", "thu", "fri")} | {"sat": "closed", "sun": "closed"}
ANSWERS = {
    "business_name": "Acme Plumbing", "industry": "plumbing", "address": "1 Main St, Jacksonville FL", "service_area": ["Jacksonville"],
    "hours": HOURS, "services": ["Drain cleaning"], "faqs": [{"q": "Free estimates?", "a": "Yes."}], "owner_name": "Pat Lee",
    "owner_phone": "+19045550101", "owner_email": "pat@acme.example", "handoff_number": "+19045550102",
    "emergency_keywords": ["burst pipe"], "greeting": "How can I help?", "languages": ["en"], "never_say": ["promise same-day visits"],
}


class FakeHttp:
    """Routes by (method, url substring). Records every call."""

    def __init__(self, routes):
        self.routes, self.calls = routes, []

    def __call__(self, method, url, headers, body):
        self.calls.append((method, url, body.decode() if body else None))
        for (m, frag), (status, text) in self.routes.items():
            if m == method and frag in url:
                return status, text if isinstance(text, str) else json.dumps(text)
        return 404, "no route"

    def hits(self, method, frag):
        return [c for c in self.calls if c[0] == method and frag in c[1]]


def intake_row(**over):
    return {"id": "11111111-1111-1111-1111-111111111111", "client_slug": "acme-plumbing", "tier": "launch", "status": "submitted",
            "answers": ANSWERS, "submitted_at": "2026-10-05T00:00:00Z"} | over


def routes(extra=None, intake=None):
    r = {("GET", "client_intakes?client_slug"): (200, [intake or intake_row()]),
         ("POST", "clients?on_conflict"): (201, ""), ("PATCH", "clients?slug"): (204, ""), ("PATCH", "client_intakes?id"): (204, ""),
         ("GET", "AvailablePhoneNumbers/US/Local.json"): (200, {"available_phone_numbers": [{"phone_number": "+19045550177", "capabilities": {"voice": True}}]}),
         ("GET", "pricing.twilio.com"): (200, {"phone_number_prices": [{"number_type": "mobile", "current_price": "9.99"}, {"number_type": "local", "current_price": "1.15"}]}),
         ("POST", "IncomingPhoneNumbers.json"): (201, {"phone_number": "+19045550177"})}
    return r | (extra or {})


class TestTokens(unittest.TestCase):
    def test_token_is_32_bytes_random_and_unique(self):
        t = nil.make_token()
        self.assertRegex(t, r"^[A-Za-z0-9_-]{43}$")
        self.assertNotEqual(t, nil.make_token())

    def test_hash_matches_site_vector(self):  # site/lib/onboard.test.ts asserts the same sha256("abc")
        self.assertEqual(nil.hash_token("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")

    def test_row_stores_only_hash_and_expires_in_14_days(self):
        t = nil.make_token()
        row = nil.intake_row("acme", "launch", t, now=datetime(2026, 10, 5, tzinfo=timezone.utc))
        self.assertNotIn(t, json.dumps(row))
        self.assertEqual(row["token_hash"], nil.hash_token(t))
        self.assertEqual(row["expires_at"][:10], "2026-10-19")
        self.assertEqual(row["status"], "pending")

    def test_run_revokes_old_links_stores_hash_prints_link_once(self):
        http, out = FakeHttp({("PATCH", "client_intakes"): (204, ""), ("POST", "client_intakes"): (201, "")}), []
        self.assertEqual(nil.run("acme", "scale", business_name="Acme", env=ENV, http=http, out=out.append, site="https://s.test"), 0)
        link = next(l for l in out if l.startswith("https://s.test/onboard/"))
        token = link.rsplit("/", 1)[1]
        posted = json.loads(http.hits("POST", "client_intakes")[0][2])
        self.assertEqual(posted["token_hash"], nil.hash_token(token))
        self.assertNotIn(token, json.dumps(http.calls))
        self.assertTrue(http.hits("PATCH", "status=eq.pending"))

    def test_bad_input_and_dry_run_store_nothing(self):
        http = FakeHttp({})
        self.assertEqual(nil.run("Bad Slug", "launch", env=ENV, http=http, out=lambda *_: None), 2)
        self.assertEqual(nil.run("acme", "gold", env=ENV, http=http, out=lambda *_: None), 2)
        self.assertEqual(nil.run("acme", "launch", dry_run=True, env=ENV, http=http, out=lambda *_: None), 0)
        self.assertEqual(http.calls, [])


class TestOnboardClient(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        (self.tmp / "demo.yaml").write_text((ROOT / "clients" / "demo.yaml").read_text())
        self.out = []

    def run_oc(self, http, **kw):
        kw.setdefault("confirm", lambda p: self.fail("unexpected confirm"))
        return oc.run("acme-plumbing", clients_dir=self.tmp, env=ENV, http=http, out=self.out.append, **kw)

    def test_dry_run_writes_nothing_and_leaks_no_pii(self):
        http = FakeHttp(routes())
        self.assertEqual(self.run_oc(http), 0)
        self.assertFalse((self.tmp / "acme-plumbing.yaml").exists())
        text = "\n".join(self.out)
        self.assertIn("${ACME_PLUMBING_OWNER_PHONE}", text)
        for p in PII:
            self.assertNotIn(p, text)
        self.assertEqual([c for c in http.calls if c[0] != "GET"], [])
        self.assertIn("DRY RUN", text)

    def test_apply_writes_valid_yaml_without_pii_upserts_row_and_marks_applied(self):
        http = FakeHttp(routes())
        self.assertEqual(self.run_oc(http, apply=True), 0)
        text = (self.tmp / "acme-plumbing.yaml").read_text()
        for p in PII:
            self.assertNotIn(p, text)
        data = yaml.safe_load(text)
        self.assertEqual(data["owner_phone"], "${ACME_PLUMBING_OWNER_PHONE}")
        self.assertEqual(data["never_say"], ["promise same-day visits"])
        self.assertEqual(data["address"], "1 Main St, Jacksonville FL")
        self.assertEqual(data["timezone"], "America/New_York")
        from agents.client_config import load
        self.assertEqual(load("acme-plumbing", clients_dir=self.tmp).business_name, "Acme Plumbing")
        row = json.loads(http.hits("POST", "clients?on_conflict")[0][2])
        self.assertEqual(row["owner_phone"], "+19045550101")  # real values only in the service-role row
        self.assertEqual(json.loads(http.hits("PATCH", "clients?slug")[0][2]), {"tier": "launch"})
        self.assertEqual(json.loads(http.hits("PATCH", "client_intakes?id")[0][2])["status"], "applied")
        out = "\n".join(self.out)
        for name in ("ACME_PLUMBING_OWNER_PHONE", "ACME_PLUMBING_OWNER_EMAIL", "ACME_PLUMBING_HANDOFF_NUMBER"):
            self.assertIn(name, out)
        for p in PII:
            self.assertNotIn(p, out)

    def test_refuses_overwrite_without_force_and_missing_intake(self):
        (self.tmp / "acme-plumbing.yaml").write_text("x: 1")
        self.assertEqual(self.run_oc(FakeHttp(routes()), apply=True), 2)
        self.assertEqual(self.run_oc(FakeHttp(routes(intake=None) | {("GET", "client_intakes?client_slug"): (200, [])})), 2)

    def test_invalid_answers_fail_before_anything_is_bought(self):
        bad = intake_row(answers=ANSWERS | {"hours": {"mon": "nope"}})
        http = FakeHttp(routes(intake=bad))
        self.assertEqual(self.run_oc(http, apply=True, buy_number=True, confirm=lambda p: True), 2)
        self.assertEqual(http.hits("POST", "IncomingPhoneNumbers"), [])

    def test_buy_number_dry_run_searches_but_never_buys_or_asks(self):
        http = FakeHttp(routes())
        self.assertEqual(self.run_oc(http, buy_number=True), 0)
        out = "\n".join(self.out)
        self.assertIn("+19045550177", out)
        self.assertIn("$1.15/month", out)
        self.assertEqual(http.hits("POST", "IncomingPhoneNumbers"), [])
        self.assertIn("area code 904", out)

    def test_apply_buy_declined_buys_nothing(self):
        http, asked = FakeHttp(routes()), []
        self.assertEqual(self.run_oc(http, apply=True, buy_number=True, confirm=lambda p: asked.append(p) or False), 0)
        self.assertEqual(http.hits("POST", "IncomingPhoneNumbers"), [])
        self.assertIn("+19045550177", asked[0])
        self.assertIn("$1.15", asked[0])
        self.assertIsNone(yaml.safe_load((self.tmp / "acme-plumbing.yaml").read_text()).get("twilio_number"))

    def test_apply_buy_confirmed_buys_sets_webhook_and_writes_number(self):
        http = FakeHttp(routes())
        self.assertEqual(self.run_oc(http, apply=True, buy_number=True, confirm=lambda p: True), 0)
        buy = http.hits("POST", "IncomingPhoneNumbers.json")
        self.assertEqual(len(buy), 1)
        self.assertIn("VoiceUrl=https%3A%2F%2Fhandler.twilio.com%2Ftwiml%2FEHabcdef123456", buy[0][2])
        self.assertEqual(yaml.safe_load((self.tmp / "acme-plumbing.yaml").read_text())["twilio_number"], "+19045550177")
        self.assertEqual(json.loads(http.hits("POST", "clients?on_conflict")[0][2])["twilio_number"], "+19045550177")

    def test_no_inbound_route_buys_without_webhook_and_prints_manual_step(self):
        env = {k: v for k, v in ENV.items() if k != "LP_INBOUND_TWIML_URL"}
        http = FakeHttp(routes())
        rc = oc.run("acme-plumbing", clients_dir=self.tmp, env=env, http=http, out=self.out.append, apply=True, buy_number=True, confirm=lambda p: True)
        self.assertEqual(rc, 0)
        self.assertNotIn("VoiceUrl", http.hits("POST", "IncomingPhoneNumbers.json")[0][2])
        self.assertIn("'A call comes in'", "\n".join(self.out))

    def test_demo_number_lookup_supplies_route_only_if_twiml_bin(self):
        env = {k: v for k, v in ENV.items() if k != "LP_INBOUND_TWIML_URL"} | {"DEMO_TWILIO_NUMBER": "+19045550100"}
        tw = oc.Twilio(env, FakeHttp({("GET", "IncomingPhoneNumbers.json"): (200, {"incoming_phone_numbers": [{"voice_url": "https://handler.twilio.com/twiml/EH1"}]})}))
        self.assertEqual(oc.inbound_url(env, tw), "https://handler.twilio.com/twiml/EH1")
        tw = oc.Twilio(env, FakeHttp({("GET", "IncomingPhoneNumbers.json"): (200, {"incoming_phone_numbers": [{"voice_url": "https://evil.test/x"}]})}))
        self.assertIsNone(oc.inbound_url(env, tw))

    def test_confirm_refuses_without_a_tty(self):
        self.assertFalse(oc.tty_confirm("buy? "))  # stdin is not a TTY under the test runner

    def test_price_unreadable_means_no_purchase(self):
        http = FakeHttp(routes({("GET", "pricing.twilio.com"): (200, {"phone_number_prices": []})}))
        self.assertEqual(self.run_oc(http, apply=True, buy_number=True, confirm=lambda p: True), 0)
        self.assertEqual(http.hits("POST", "IncomingPhoneNumbers"), [])

    def test_go_live_only_patches_status(self):
        http = FakeHttp({("GET", "clients?slug"): (200, [{"slug": "acme-plumbing"}]), ("PATCH", "clients?slug"): (204, "")})
        self.assertEqual(oc.go_live("acme-plumbing", env=ENV, http=http, out=self.out.append), 0)
        self.assertEqual(json.loads(http.hits("PATCH", "clients?slug")[0][2]), {"status": "live"})
        missing = FakeHttp({("GET", "clients?slug"): (200, [])})
        self.assertEqual(oc.go_live("nobody", env=ENV, http=missing, out=self.out.append), 2)

    def test_area_code_from_owner_phone(self):
        self.assertEqual(oc.area_code("+19045550101"), "904")
        self.assertEqual(oc.area_code(None, "(212) 555-0101"), "212")
        self.assertIsNone(oc.area_code("bad"))


class TestUsage(unittest.TestCase):
    OFFER = yaml.safe_load((ROOT / "config" / "offerings.yaml").read_text())

    def test_minutes_round_up_on_month_total(self):
        self.assertEqual([ur.billable_minutes(s) for s in (0, 1, 60, 61, 3600)], [0, 1, 1, 2, 60])
        self.assertEqual(ur.billable_minutes(None), 0)

    def test_under_included_has_no_overage(self):
        l = ur.usage_line({"client_slug": "a", "billing_month": "2026-10-01", "total_sec": 300 * 60, "tier": "launch", "calls": 40}, self.OFFER)
        self.assertEqual((l["minutes"], l["included"], l["overage_minutes"], l["overage_usd"]), (300, 300, 0, Decimal("0.00")))

    def test_launch_overage_at_025(self):
        l = ur.usage_line({"client_slug": "a", "billing_month": "2026-10-01", "total_sec": 300 * 60 + 61, "tier": "launch"}, self.OFFER)
        self.assertEqual((l["minutes"], l["overage_minutes"], l["overage_usd"]), (302, 2, Decimal("0.50")))

    def test_scale_overage_at_020(self):
        l = ur.usage_line({"client_slug": "a", "billing_month": "2026-10-01", "total_sec": 2100 * 60, "tier": "scale"}, self.OFFER)
        self.assertEqual((l["included"], l["overage_minutes"], l["overage_usd"]), (2000, 100, Decimal("20.00")))

    def test_unknown_tier_is_data_unavailable_not_zero(self):
        l = ur.usage_line({"client_slug": "a", "billing_month": "2026-10-01", "total_sec": 6000, "tier": None}, self.OFFER)
        self.assertIsNone(l["overage_usd"])
        self.assertIn("DATA UNAVAILABLE", ur.format_report([l]))

    def test_month_start(self):
        self.assertEqual(ur.month_start("2026-10"), date(2026, 10, 1))
        self.assertEqual(ur.month_start(None, today=date(2026, 12, 31)), date(2026, 12, 1))

    def test_run_queries_view_and_prints_report_without_billing(self):
        row = {"client_slug": "acme", "billing_month": "2026-10-01", "calls": 3, "total_sec": 18100, "minutes": 302, "tier": "launch"}
        http, out = FakeHttp({("GET", "client_usage_monthly"): (200, [row])}), []
        self.assertEqual(ur.run(month="2026-10", client="acme", env=ENV, http=http, out=out.append), 0)
        self.assertIn("billing_month=eq.2026-10-01", http.calls[0][1])
        self.assertIn("client_slug=eq.acme", http.calls[0][1])
        self.assertRegex(out[0], r"acme\s+2026-10\s+launch\s+3\s+302\s+300\s+2\s+0\.50")
        self.assertEqual([c for c in http.calls if c[0] != "GET"], [])


class TestMigration(unittest.TestCase):
    def test_migration_locks_down_and_is_additive(self):
        sql = (ROOT / "supabase" / "migrations" / "20261005000001_client_onboarding.sql").read_text()
        self.assertIn("force row level security", sql)
        self.assertIn("revoke all on public.client_intakes from anon, authenticated", sql)
        self.assertIn("security_invoker = true", sql)
        self.assertIsNone(re.search(r"(?i)\bdrop\s+(table|column)", sql))
        self.assertNotIn("create policy", sql.lower())


if __name__ == "__main__":
    unittest.main()
