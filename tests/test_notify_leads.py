"""agents/notify/leads sweep with fakes: no live Supabase or Resend calls."""
import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "lib"))

from agents.notify import Notifier  # noqa: E402
from agents.notify.leads import sweep  # noqa: E402
from agents.notify.messages import lead_body, lead_subject  # noqa: E402

ENV = {"SUPABASE_URL": "https://x.supabase.co", "SUPABASE_SERVICE_ROLE_KEY": "sb_secret_FAKEFAKEFAKEFAKEFAKE1234",
       "RESEND_API_KEY": "re_FAKEFAKEFAKEFAKEFAKEFAKE1", "NOTIFY_FROM_EMAIL": "alerts@example.test",
       "LEAD_ALERT_EMAIL": "boss@example.test"}
LEAD = {"id": "lead-1", "name": "Pat\nLee", "email": "pat@example.com", "phone": None, "business": "Lee Plumbing",
        "message": "Need a quote", "created_at": "2026-10-05T14:00:00+00:00"}


class Fake:
    def __init__(self, leads, resend=(200, "{}")):
        self.leads, self.resend, self.calls = leads, resend, []

    def __call__(self, method, url, headers, body):
        self.calls.append((method, url, headers, body))
        if "resend.com" in url:
            return self.resend
        if method == "GET" and "site_leads" in url:
            return 200, json.dumps(self.leads)
        return 204, ""

    def to(self, frag):
        return [c for c in self.calls if frag in c[1]]


def run(http, **env):
    n = Notifier(env={**ENV, **env}, http=http, sleep=lambda s: None)
    return sweep(n, now=datetime(2026, 10, 5, 15, 0, tzinfo=timezone.utc))


class TestLeadSweep(unittest.TestCase):
    def test_sends_and_marks_notified(self):
        http = Fake([LEAD])
        self.assertEqual(run(http), {"found": 1, "sent": 1, "failed": 0, "skipped": 0})
        self.assertIn("notified_at=is.null", http.to("site_leads")[0][1])
        mail = http.to("resend.com")[0]
        self.assertEqual(mail[2]["Idempotency-Key"], "lead-alert-lead-1")  # same key as the site route
        body = json.loads(mail[3])
        self.assertEqual((body["to"], body["subject"]), (["boss@example.test"], "New lead: Pat Lee (Lee Plumbing)"))
        patch = http.to("id=eq.lead-1")[0]
        self.assertEqual(patch[0], "PATCH")
        fields = json.loads(patch[3])
        self.assertEqual(fields["email_status"], "sent")
        self.assertTrue(fields["notified_at"])

    def test_failure_leaves_lead_for_next_run(self):
        http = Fake([LEAD], resend=(422, "bad"))
        self.assertEqual(run(http)["failed"], 1)
        fields = json.loads(http.to("id=eq.lead-1")[0][3])
        self.assertEqual(fields, {"email_status": "failed", "notified_at": None})

    def test_skipped_without_recipient_touches_nothing(self):
        http = Fake([LEAD])
        self.assertEqual(run(http, LEAD_ALERT_EMAIL="")["skipped"], 1)
        self.assertEqual(http.to("resend.com"), [])
        self.assertEqual(http.to("id=eq.lead-1"), [])

    def test_nothing_to_do(self):
        self.assertEqual(run(Fake([])), {"found": 0, "sent": 0, "failed": 0, "skipped": 0})

    def test_message_text(self):
        self.assertIn("Message:\nNeed a quote", lead_body(LEAD))
        self.assertEqual(lead_subject({"name": "A"}), "New lead: A")


if __name__ == "__main__":
    unittest.main()
