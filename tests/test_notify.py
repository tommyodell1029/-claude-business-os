"""agents/notify + scripts/new_client with fakes: no live Supabase, Resend or Twilio calls."""
import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "lib"))
sys.path.insert(0, str(ROOT / "scripts"))

from agents.notify import Notifier  # noqa: E402
from agents.notify.messages import email_body, email_subject, sms_body  # noqa: E402
import new_client  # noqa: E402

KEY = "sb_secret_FAKEFAKEFAKEFAKEFAKE1234"
ENV = {"SUPABASE_URL": "https://x.supabase.co", "SUPABASE_SERVICE_ROLE_KEY": KEY, "RESEND_API_KEY": "re_FAKEFAKEFAKEFAKEFAKEFAKE1",
       "NOTIFY_FROM_EMAIL": "alerts@example.test", "TWILIO_ACCOUNT_SID": "ACfake", "TWILIO_AUTH_TOKEN": "tokfake123456"}
CFG = SimpleNamespace(slug="demo", business_name="Harborline", timezone="America/New_York", owner_email="boss@example.test",
                      owner_phone="+19045550101", twilio_number="+19045550100", industry="home_services", handoff_number=None,
                      raw={"slug": "demo"})
SECRET_TRANSCRIPT = "Caller: my gate code is 99887"


def record(**kw):
    r = {"client_slug": "demo", "call_sid": "CA123", "caller_name": "Pat", "caller_phone": "+19045550123", "intent": "new_job",
         "summary": "Leaking water heater", "urgency": "normal", "transcript": SECRET_TRANSCRIPT, "duration_sec": 61,
         "est_cost": 0.12, "transferred": False, "end_reason": "completed", "disclosure_spoken": True,
         "details": {"address": "1 Main St", "best_time": None, "preferred_time": None},
         "created_at": datetime(2026, 10, 5, 14, 0, tzinfo=timezone.utc).isoformat()}
    r.update(kw)
    return r


class FakeHttp:
    """Routes by URL substring. A handler returns (status, text) or a list of them (consumed in order)."""

    def __init__(self, **routes):
        self.routes, self.calls = routes, []

    def __call__(self, method, url, headers, body):
        self.calls.append({"method": method, "url": url, "headers": headers, "body": body})
        for frag, resp in self.routes.items():
            if frag in url:
                if isinstance(resp, list):
                    return resp.pop(0) if len(resp) > 1 else resp[0]
                return resp
        return 404, "no route"

    def to(self, frag):
        return [c for c in self.calls if frag in c["url"]]


def notifier(http, **env):
    sleeps = []
    n = Notifier(env={**ENV, **env}, http=http, sleep=sleeps.append)
    n.sleeps = sleeps
    return n


OK_DB = {"/rest/v1/calls": (201, json.dumps([{"id": "row-1"}]))}


class TestHandler(unittest.TestCase):
    def test_happy_path_saves_emails_and_records_status(self):
        http = FakeHttp(**{"/rest/v1/calls?on_conflict": (201, json.dumps([{"id": "row-1"}])),
                           "/rest/v1/calls?id=eq.row-1": (204, ""), "resend.com": (200, "{}")})
        out = notifier(http).handle(record(), CFG)
        self.assertEqual((out["db"], out["email"], out["sms"]), ("saved", "sent", "skipped"))
        insert = http.to("on_conflict=call_sid")[0]
        self.assertEqual(json.loads(insert["body"])["call_sid"], "CA123")
        self.assertIn("resolution=ignore-duplicates", insert["headers"]["Prefer"])
        self.assertNotIn("Authorization", insert["headers"])  # sb_secret_ key goes in apikey only
        self.assertEqual(json.loads(http.to("id=eq.row-1")[0]["body"]), {"email_status": "sent", "sms_status": "skipped"})
        mail = http.to("resend.com")[0]
        self.assertEqual(mail["headers"]["Idempotency-Key"], "call-alert-CA123")
        body = json.loads(mail["body"])
        self.assertEqual((body["from"], body["to"]), ("LaunchPad Local <alerts@example.test>", ["boss@example.test"]))
        self.assertNotIn("99887", body["text"])  # transcript is not emailed

    def test_legacy_jwt_key_also_sent_as_bearer(self):
        http = FakeHttp(**OK_DB)
        n = notifier(http, SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOi.fake.jwt", NOTIFY_FROM_EMAIL="")
        n.handle(record(), CFG)
        self.assertEqual(http.calls[0]["headers"]["Authorization"], "Bearer eyJhbGciOi.fake.jwt")

    def test_each_step_independent_db_down_still_emails(self):
        http = FakeHttp(**{"/rest/v1/": (500, "boom"), "resend.com": (200, "{}")})
        n = notifier(http)
        out = n.handle(record(), CFG)
        self.assertEqual((out["db"], out["email"]), ("failed", "sent"))
        self.assertEqual(len(http.to("on_conflict")), 3)  # retried 3x
        self.assertEqual(n.sleeps, [1, 3])

    def test_email_failure_does_not_block_sms_or_db(self):
        http = FakeHttp(**{"/rest/v1/calls?on_conflict": (201, json.dumps([{"id": "r"}])), "/rest/v1/calls?id": (204, ""),
                           "resend.com": (503, "down"), "api.twilio.com": (201, "{}")})
        out = notifier(http, NOTIFY_SMS_ENABLED="1").handle(record(), CFG)
        self.assertEqual((out["db"], out["email"], out["sms"]), ("saved", "failed", "sent"))
        self.assertEqual(len(http.to("resend.com")), 3)
        patch = json.loads(http.to("id=eq.r")[0]["body"])
        self.assertEqual(patch, {"email_status": "failed", "sms_status": "sent"})

    def test_client_error_is_not_retried(self):
        http = FakeHttp(**{"/rest/v1/calls?on_conflict": (201, json.dumps([{"id": "r"}])), "/rest/v1/calls?id": (204, ""),
                           "resend.com": (422, "bad from")})
        out = notifier(http).handle(record(), CFG)
        self.assertEqual(out["email"], "failed")
        self.assertEqual(len(http.to("resend.com")), 1)

    def test_email_skipped_without_from_address(self):
        http = FakeHttp(**OK_DB)
        out = notifier(http, NOTIFY_FROM_EMAIL="").handle(record(), CFG)
        self.assertEqual(out["email"], "skipped")
        self.assertEqual(http.to("resend.com"), [])

    def test_email_skipped_without_valid_recipient(self):
        http = FakeHttp(**OK_DB)
        out = notifier(http).handle(record(), SimpleNamespace(**{**CFG.__dict__, "owner_email": None}))
        self.assertEqual(out["email"], "skipped")

    def test_sms_off_by_default_and_never_has_transcript(self):
        http = FakeHttp(**OK_DB, **{"resend.com": (200, "{}")})
        self.assertEqual(notifier(http).handle(record(), CFG)["sms"], "skipped")
        self.assertEqual(http.to("twilio.com"), [])
        http = FakeHttp(**{"/rest/v1/": (201, json.dumps([{"id": "r"}])), "api.twilio.com": (201, "{}"), "resend.com": (200, "{}")})
        out = notifier(http, NOTIFY_SMS_ENABLED="true").handle(record(urgency="urgent"), CFG)
        self.assertEqual(out["sms"], "sent")
        form = http.to("twilio.com")[0]["body"].decode()
        self.assertIn("Body=URGENT", form)
        self.assertNotIn("99887", form)
        self.assertNotIn("Leaking", form)  # no free-text call content in SMS at all
        self.assertIn("To=%2B19045550101", form)

    def test_duplicate_call_sid_is_idempotent(self):
        http = FakeHttp(**{"/rest/v1/calls?on_conflict": (201, "[]"), "resend.com": (200, "{}")})
        out = notifier(http).handle(record(), CFG)
        self.assertEqual(out["db"], "duplicate")
        self.assertIsNone(out["call_id"])

    def test_missing_client_row_is_created_then_insert_retried(self):
        http = FakeHttp(**{"/rest/v1/calls?on_conflict": [(409, '{"code":"23503"}'), (201, json.dumps([{"id": "r"}]))],
                           "/rest/v1/clients": (201, ""), "/rest/v1/calls?id": (204, ""), "resend.com": (200, "{}")})
        out = notifier(http).handle(record(), CFG)
        self.assertEqual(out["db"], "saved")
        up = http.to("/rest/v1/clients")[0]
        self.assertIn("ignore-duplicates", up["headers"]["Prefer"])  # never overwrites an existing client
        self.assertEqual(json.loads(up["body"])["slug"], "demo")

    def test_bad_enum_values_are_coerced_not_rejected(self):
        http = FakeHttp(**OK_DB)
        notifier(http, NOTIFY_FROM_EMAIL="").handle(record(intent="weird", end_reason="x", urgency="??"), CFG)
        sent = json.loads(http.calls[0]["body"])
        self.assertEqual((sent["intent"], sent["end_reason"], sent["urgency"]), ("other", "hangup", "normal"))

    def test_unconfigured_supabase_never_raises(self):
        http = FakeHttp(**{"resend.com": (200, "{}")})
        out = notifier(http, SUPABASE_URL="").handle(record(), CFG)
        self.assertEqual((out["db"], out["email"]), ("failed", "sent"))

    def test_secrets_never_logged(self):
        from loguru import logger
        lines = []
        sink = logger.add(lines.append, format="{message}")
        try:
            import os
            os.environ["RESEND_API_KEY"] = ENV["RESEND_API_KEY"]
            http = FakeHttp(**{"/rest/v1/": (500, f"bad key {KEY} {ENV['RESEND_API_KEY']}"), "resend.com": (500, ENV["RESEND_API_KEY"])})
            notifier(http).handle(record(), CFG)
        finally:
            logger.remove(sink)
            os.environ.pop("RESEND_API_KEY", None)
        text = "".join(lines)
        self.assertTrue(text)
        self.assertNotIn(ENV["RESEND_API_KEY"], text)
        self.assertNotIn("99887", text)


class TestMessages(unittest.TestCase):
    def test_urgent_subject_and_body(self):
        r = record(urgency="urgent", transferred=True)
        self.assertTrue(email_subject(r, "Harborline").startswith("URGENT: "))
        body = email_body(r, "Harborline", "America/New_York")
        self.assertIn("transferred to you", body)
        self.assertIn("10:00 AM EDT", body)
        self.assertIn("1 Main St", body)
        self.assertNotIn("caveman", body.lower())

    def test_unknown_caller(self):
        self.assertIn("Unknown caller", sms_body(record(caller_name=None, caller_phone=None), "X"))


INTAKE = {"business_name": "Acme Plumbing", "industry": "home_services", "timezone": "America/New_York",
          "twilio_number": "(904) 555-0142", "owner_phone": "904-555-0101", "owner_email": "Owner@Acme.test",
          "handoff_number": "+19045550101",
          "hours": {d: "08:00-17:00" for d in ("mon", "tue", "wed", "thu", "fri")} | {"sat": "closed", "sun": "closed"},
          "services": ["Drains"], "service_area": ["Jacksonville"], "faqs": [{"q": "Q?", "a": "A."}],
          "emergency_keywords": ["flooding"]}


class TestNewClient(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        (self.tmp / "demo.yaml").write_text((ROOT / "clients" / "demo.yaml").read_text())
        self.out = []

    def intake(self, **over):
        import yaml
        p = self.tmp / "intake.yaml"
        p.write_text(yaml.safe_dump({**INTAKE, **over}))
        return p

    def run_cli(self, p, **kw):
        return new_client.run(p, clients_dir=self.tmp, out=self.out.append, **kw)

    def test_writes_valid_yaml_without_pii_and_upserts_real_values(self):
        http = FakeHttp(**{"/rest/v1/clients": (201, "")})
        self.assertEqual(self.run_cli(self.intake(), env=ENV, http=http), 0)
        text = (self.tmp / "acme-plumbing.yaml").read_text()
        self.assertNotIn("Owner@Acme", text.replace("owner@acme", "Owner@Acme"))
        self.assertNotIn("904-555-0101", text)
        self.assertIn("${ACME_PLUMBING_OWNER_PHONE}", text)
        self.assertIn("+19045550142", text)
        from agents.client_config import load
        cfg = load("acme-plumbing", clients_dir=self.tmp)
        self.assertEqual(cfg.twilio_number, "+19045550142")
        sent = json.loads(http.calls[0]["body"])
        self.assertEqual((sent["owner_phone"], sent["owner_email"]), ("+19045550101", "owner@acme.test"))
        self.assertEqual(sent["config"]["owner_phone"], "${ACME_PLUMBING_OWNER_PHONE}")
        self.assertNotIn("status", sent)  # existing status is never regressed
        self.assertIn("merge-duplicates", http.calls[0]["headers"]["Prefer"])
        self.assertTrue(any("ACME_PLUMBING_OWNER_EMAIL" in l for l in self.out))

    def test_invalid_intake_writes_nothing(self):
        self.assertEqual(self.run_cli(self.intake(timezone="Mars/Base"), skip_db=True), 2)
        self.assertFalse((self.tmp / "acme-plumbing.yaml").exists())
        self.assertEqual(self.run_cli(self.intake(owner_phone="123"), skip_db=True), 2)

    def test_refuses_overwrite_without_force_and_dry_run_writes_nothing(self):
        self.assertEqual(self.run_cli(self.intake(), skip_db=True), 0)
        self.assertEqual(self.run_cli(self.intake(), skip_db=True), 2)
        self.assertEqual(self.run_cli(self.intake(), skip_db=True, force=True), 0)
        (self.tmp / "acme-plumbing.yaml").unlink()
        self.assertEqual(self.run_cli(self.intake(), dry_run=True), 0)
        self.assertFalse((self.tmp / "acme-plumbing.yaml").exists())

    def test_db_not_configured_and_db_error_exit_nonzero(self):
        self.assertEqual(self.run_cli(self.intake(), env={}, http=FakeHttp()), 3)
        self.assertEqual(self.run_cli(self.intake(), env=ENV, http=FakeHttp(**{"/clients": (500, "x")}), force=True), 3)


if __name__ == "__main__":
    unittest.main()


class SenderFieldsTests(unittest.TestCase):
    def test_display_name_and_reply_to(self):
        from agents.notify.handler import sender_fields
        self.assertEqual(sender_fields({}, "calls@notify.example.com"), {"from": "LaunchPad Local <calls@notify.example.com>"})
        self.assertEqual(sender_fields({}, "X <a@b.com>")["from"], "X <a@b.com>")
        self.assertEqual(sender_fields({"NOTIFY_REPLY_TO": "Tommy@Example.com"}, "a@b.com")["reply_to"], "tommy@example.com")
