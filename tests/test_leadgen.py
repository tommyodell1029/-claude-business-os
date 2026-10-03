"""leadgen with fakes: no network, no Supabase. Robots, no email guessing, suppression, address+opt-out, caps."""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "lib"))

from leadgen import draft, research, score, source  # noqa: E402
from leadgen.db import Store  # noqa: E402

CFG = source.load_config()
ADDR = "1 Test Way, Jacksonville, FL 32202"
KEY = "AIzaSyFAKEFAKEFAKEFAKEFAKEFAKEFAKE12345"


class FakeStore:
    """In-memory stand-in for leadgen.db.Store."""

    def __init__(self, rows=None, suppressed=()):
        self.rows = {r["id"]: dict(r) for r in (rows or [])}
        self.suppressed = {e.lower() for e in suppressed}
        self.events = []

    def prospects(self, statuses, *, order="score.desc.nullslast", limit=500):
        rs = [r for r in self.rows.values() if r["status"] in statuses]
        return sorted(rs, key=lambda r: -(r.get("score") or 0))[:limit]

    def update_prospect(self, pid, fields):
        self.rows[pid].update(fields)

    def is_suppressed(self, email):
        return email.lower() in self.suppressed

    def has_outreach(self, pid, step):
        return any(e["prospect_id"] == pid and e["step"] == step for e in self.events)

    def insert_outreach(self, row):
        row = {**row, "id": f"ev{len(self.events)}"}
        self.events.append(row)
        return row

    def upsert_prospects(self, rows):
        for r in rows:
            self.rows[r["place_id"]] = {"id": r["place_id"], "status": "new", **r}
        return rows


def prospect(i, **kw):
    base = {"id": f"p{i}", "name": f"Biz {i}", "industry": "plumbing", "city": "Jacksonville", "status": "researched",
            "email": f"info@biz{i}.test", "email_source_url": f"https://biz{i}.test/contact", "score": 80 - i,
            "rating": 4.8, "review_count": 120, "signals": {}, "called_after_hours": False}
    base.update(kw)
    return base


def place(i, **kw):
    p = {"id": f"pl{i}", "displayName": {"text": f"Plumber {i}"}, "formattedAddress": "5 Main St, Jacksonville, FL 32202, USA",
         "nationalPhoneNumber": f"(904) 555-01{i:02d}", "websiteUri": f"https://p{i}.test", "rating": 4.5, "userRatingCount": 50,
         "businessStatus": "OPERATIONAL"}
    p.update(kw)
    return p


class FakePlaces:
    def __init__(self, pages, status=200):
        self.pages, self.status, self.calls = list(pages), status, []

    def __call__(self, method, url, headers, body):
        self.calls.append((method, url, headers, json.loads(body)))
        if self.status != 200:
            return self.status, json.dumps({"error": {"message": "Places API (New) has not been used in project"}})
        return 200, json.dumps(self.pages.pop(0) if self.pages else {})


class SourceTests(unittest.TestCase):
    def test_key_only_in_header_and_tight_mask(self):
        http = FakePlaces([{"places": [place(1)]}])
        source.source(http, FakeStore(), KEY, CFG, ["plumbing"])
        _, url, headers, body = http.calls[0]
        self.assertNotIn(KEY, url)
        self.assertNotIn(KEY, json.dumps(body))
        self.assertEqual(headers["X-Goog-Api-Key"], KEY)
        self.assertIn("places.id", headers["X-Goog-FieldMask"])
        self.assertNotIn("*", headers["X-Goog-FieldMask"])
        self.assertEqual(url, "https://places.googleapis.com/v1/places:searchText")

    def test_row_mapping_and_upsert(self):
        store = FakeStore()
        res = source.source(FakePlaces([{"places": [place(1), place(2, nationalPhoneNumber="bad")]}]), store, KEY, CFG, ["plumbing"])
        self.assertEqual(res["found"], 2)
        r = store.rows["pl1"]
        self.assertEqual((r["phone"], r["city"], r["source"], r["industry"]), ("+19045550101", "Jacksonville", "google_places_api", "plumbing"))
        self.assertNotIn("phone", store.rows["pl2"])

    def test_dedupe_by_place_and_phone_and_skip_closed(self):
        pages = [{"places": [place(1), place(1), place(3, nationalPhoneNumber="(904) 555-0101"), place(4, businessStatus="CLOSED_PERMANENTLY")]}]
        res = source.source(FakePlaces(pages), FakeStore(), KEY, CFG, ["plumbing"])
        self.assertEqual(res["found"], 1)

    def test_api_call_cap_counts_pages_and_verticals(self):
        pages = [{"places": [place(i)], "nextPageToken": "t"} for i in range(1, 10)]
        http = FakePlaces(pages)
        res = source.source(http, FakeStore(), KEY, CFG, ["plumbing", "hvac"], max_calls=3)
        self.assertEqual((len(http.calls), res["api_calls"]), (3, 3))

    def test_403_is_a_blocker_not_retried_forever(self):
        http = FakePlaces([], status=403)
        with self.assertRaises(source.PlacesDisabled):
            source.source(http, FakeStore(), KEY, CFG, ["plumbing"])
        self.assertEqual(len(http.calls), 1)

    def test_retry_attempts_count_against_cap(self):
        http = FakePlaces([], status=503)
        from lp import retry as r
        real = r.time.sleep
        r.time.sleep = lambda s: None
        try:
            res = source.source(http, FakeStore(), KEY, CFG, ["plumbing"], max_calls=2)
        finally:
            r.time.sleep = real
        self.assertEqual((len(http.calls), res["found"]), (2, 0))


class FakeSite:
    """fetch(url, ua, timeout, max_bytes) over a dict url -> (status, text); records every request."""

    def __init__(self, pages):
        self.pages, self.requests = pages, []

    def __call__(self, url, ua, timeout, max_bytes):
        self.requests.append(url)
        return self.pages.get(url, (404, ""))


def crawler(site):
    return research.Crawler(site, CFG, sleep=lambda s: None)


class ResearchTests(unittest.TestCase):
    def test_robots_disallow_means_no_page_fetch(self):
        site = FakeSite({"https://a.test/robots.txt": (200, "User-agent: *\nDisallow: /"), "https://a.test": (200, "mail info@a.test")})
        out = research.research_prospect(crawler(site), {"website": "https://a.test"}, CFG)
        self.assertEqual(out["status"], "no_email")
        self.assertNotIn("https://a.test", site.requests)

    def test_robots_unreachable_is_treated_as_disallowed(self):
        site = FakeSite({"https://a.test/robots.txt": (503, ""), "https://a.test": (200, "info@a.test")})
        self.assertEqual(research.research_prospect(crawler(site), {"website": "https://a.test"}, CFG)["status"], "no_email")
        self.assertNotIn("https://a.test", site.requests)

    def test_no_robots_file_allows(self):
        site = FakeSite({"https://a.test": (200, '<a href="mailto:Owner@a.test">email</a>')})
        out = research.research_prospect(crawler(site), {"website": "https://a.test"}, CFG)
        self.assertEqual((out["status"], out["email"], out["email_source_url"]), ("researched", "owner@a.test", "https://a.test"))

    def test_email_only_if_literal_never_guessed(self):
        site = FakeSite({"https://a.test": (200, "<p>Call us at 904-555-0100. Contact form below.</p>")})
        out = research.research_prospect(crawler(site), {"website": "https://a.test", "name": "A Plumbing"}, CFG)
        self.assertEqual(out["status"], "no_email")
        self.assertNotIn("email", out)
        self.assertEqual(research.find_emails("info (at) a.test, sales[at]a.test"), [])

    def test_junk_addresses_ignored(self):
        self.assertEqual(research.find_emails("logo@2x.png you@example.com user@sentry.io real@shop.test"), ["real@shop.test"])

    def test_prefers_own_domain(self):
        self.assertEqual(research.pick_email(["x@gmail.com", "info@a.test"], "https://www.a.test/"), "info@a.test")

    def test_at_most_one_extra_page_and_source_url_recorded(self):
        home = '<a href="/about">About</a><a href="/contact-us">Contact</a><a href="/blog">Blog</a>'
        site = FakeSite({"https://a.test": (200, home), "https://a.test/contact-us": (200, "write to hello@a.test"),
                         "https://a.test/about": (200, "x@a.test")})
        out = research.research_prospect(crawler(site), {"website": "https://a.test"}, CFG)
        self.assertEqual((out["email"], out["email_source_url"]), ("hello@a.test", "https://a.test/contact-us"))
        pages = [u for u in site.requests if not u.endswith("robots.txt")]
        self.assertEqual(len(pages), 2)

    def test_does_not_follow_offsite_links(self):
        site = FakeSite({"https://a.test": (200, '<a href="https://other.test/contact">c</a>')})
        research.research_prospect(crawler(site), {"website": "https://a.test"}, CFG)
        self.assertFalse(any("other.test" in u for u in site.requests))

    def test_polite_delay_between_requests_to_same_host(self):
        sleeps, t = [], [0.0]
        c = research.Crawler(FakeSite({"https://a.test": (200, "<html></html>")}), CFG, sleep=sleeps.append, clock=lambda: t[0])
        c.page("https://a.test")
        self.assertTrue(sleeps and sleeps[-1] > 0)

    def test_no_website(self):
        out = research.research_prospect(crawler(FakeSite({})), {"website": None}, CFG)
        self.assertEqual((out["status"], out["signals"]["has_website"]["value"]), ("no_email", False))

    def test_signals_have_evidence(self):
        s = research.detect_signals("<p>24/7 emergency service. Book online today</p>", "https://a.test")
        self.assertTrue(s["mentions_24_7"]["value"] and s["has_online_booking"]["value"])
        self.assertIn("24/7", s["mentions_24_7"]["evidence"])
        self.assertFalse(s["mentions_after_hours_text"]["value"])

    def test_default_fetch_verifies_tls(self):
        import inspect
        src = inspect.getsource(research.urllib_fetch)
        self.assertNotIn("_create_unverified_context", src)
        self.assertNotIn("CERT_NONE", src)


class ScoreTests(unittest.TestCase):
    def test_formula(self):
        sig = {"has_website": {"value": True}, "mentions_24_7": {"value": True}, "has_online_booking": {"value": False},
               "mentions_after_hours_text": {"value": True}}
        p = {"email": "a@b.test", "rating": 4.6, "review_count": 150, "signals": sig}
        self.assertEqual(score.score_prospect(p), 100)
        self.assertEqual(score.score_prospect({"signals": {}}), 0)

    def test_booking_points_only_when_site_was_read(self):
        self.assertEqual(score.score_prospect({"signals": {"has_website": {"value": False}}}), 0)

    def test_statuses(self):
        good = prospect(1, status="researched", signals={"has_website": {"value": True}, "has_online_booking": {"value": False}})
        low = prospect(2, status="researched", rating=3.0, review_count=1, signals={})
        noemail = prospect(3, status="no_email", email=None)
        store = FakeStore([good, low, noemail])
        res = score.score_all(store, CFG)
        self.assertEqual(store.rows["p1"]["status"], "researched")
        self.assertEqual(store.rows["p2"]["status"], "below_threshold")
        self.assertEqual(store.rows["p3"]["status"], "no_email")
        self.assertEqual(res["scored"], 3)


class DraftTests(unittest.TestCase):
    ENV = {"MAILING_ADDRESS": ADDR}

    def test_refuses_without_mailing_address(self):
        store = FakeStore([prospect(1)])
        for env in ({}, {"MAILING_ADDRESS": " "}, {"MAILING_ADDRESS": "{{MAILING_ADDRESS}}"}):
            with self.assertRaises(draft.DraftError):
                draft.draft_top(store, env, CFG)
        self.assertEqual(store.events, [])

    def test_draft_has_address_optout_no_price_no_demo_phone(self):
        store = FakeStore([prospect(1)])
        draft.draft_top(store, self.ENV, CFG)
        ev = store.events[0]
        self.assertIn(ADDR, ev["body"])
        self.assertIn(draft.OPT_OUT, ev["body"])
        self.assertNotIn("$", ev["body"])
        self.assertNotIn("+19044568829", ev["body"])
        self.assertNotIn("904-456-8829", ev["body"])
        self.assertEqual((ev["event_type"], ev["review_status"], ev["platform"], ev["step"]), ("drafted", "pending", "gmail", 0))
        self.assertEqual(ev["payload"]["to"], "info@biz1.test")

    def test_validate_rejects_missing_pieces(self):
        with self.assertRaises(draft.DraftError):
            draft.validate("hello " + draft.OPT_OUT, ADDR)
        with self.assertRaises(draft.DraftError):
            draft.validate("hello " + ADDR, ADDR)
        with self.assertRaises(draft.DraftError):
            draft.validate(f"only $497 {ADDR} {draft.OPT_OUT}", ADDR)

    def test_suppression_enforced(self):
        store = FakeStore([prospect(1), prospect(2)], suppressed=["INFO@biz1.test"])
        out = draft.draft_top(store, self.ENV, CFG)
        self.assertEqual([o["business"] for o in out], ["Biz 2"])

    def test_top_n_by_score_and_only_eligible(self):
        rows = [prospect(i) for i in range(1, 9)]
        rows += [prospect(20, score=99, email=None), prospect(21, score=98, status="below_threshold"),
                 prospect(22, score=97, email_source_url=None)]
        store = FakeStore(rows)
        out = draft.draft_top(store, self.ENV, CFG)
        self.assertEqual([o["business"] for o in out], [f"Biz {i}" for i in range(1, 6)])
        self.assertEqual(store.rows["p1"]["status"], "queued")

    def test_idempotent_rerun(self):
        store = FakeStore([prospect(1), prospect(2)])
        draft.draft_top(store, self.ENV, CFG)
        n = len(store.events)
        draft.draft_top(store, self.ENV, CFG)
        self.assertEqual(len(store.events), 2)
        self.assertEqual(n, 2)

    def test_i_called_you_only_when_flag_true(self):
        _, b0 = draft.compose(prospect(1), ADDR)
        _, b1 = draft.compose(prospect(1, called_after_hours=True), ADDR)
        self.assertNotIn("I called", b0)
        self.assertIn("I called Biz 1", b1)

    def test_only_row_facts(self):
        _, b = draft.compose(prospect(1, rating=None, review_count=None, signals={}), ADDR)
        self.assertNotIn("stars", b)
        self.assertNotIn("24/7", b)
        _, b = draft.compose(prospect(1, signals={"mentions_24_7": {"value": True}}), ADDR)
        self.assertIn("4.8 stars across 120 Google reviews", b)
        self.assertIn("24/7", b)

    def test_no_guaranteed_outcomes(self):
        _, b = draft.compose(prospect(1), ADDR)
        for bad in ("never miss", "guarantee", "increase", "%"):
            self.assertNotIn(bad, b.lower())

    def test_no_email_without_source_url_even_if_email_present(self):
        store = FakeStore([prospect(1, email_source_url=None)])
        self.assertEqual(draft.draft_top(store, self.ENV, CFG), [])


class NoSendTests(unittest.TestCase):
    def test_leadgen_never_sends_or_uses_audit_model(self):
        for f in (ROOT / "leadgen").glob("*.py"):
            t = f.read_text()
            self.assertNotIn("send_message", t)
            self.assertNotIn("smtplib", t)
            self.assertNotIn("api.resend.com", t)
            self.assertNotIn('model("audit"', t)

    def test_places_only_no_maps_html(self):
        for f in (ROOT / "leadgen").glob("*.py"):
            self.assertNotIn("google.com/maps", f.read_text())


if __name__ == "__main__":
    unittest.main()


class ImportTests(unittest.TestCase):
    def test_rows_dedupe_by_domain_and_never_take_email(self):
        from leadgen import import_prospects as ip
        seed = {"source": "web_search", "rows": [
            {"name": "A", "website": "https://www.a.test/", "industry": "plumbing", "city": "Jacksonville", "email": "x@a.test"},
            {"name": "A again", "website": "https://a.test/about"}, {"name": "No site"}, {"website": "https://b.test"}]}
        rows = ip.to_rows(seed)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["place_id"], "web:a.test")
        self.assertNotIn("email", rows[0])
        self.assertEqual(rows[0]["source"], "web_search")

    def test_seed_file_is_valid(self):
        from leadgen import import_prospects as ip
        seed = json.loads((ROOT / "leadgen/seed/web_search_2026-10-03.json").read_text())
        rows = ip.to_rows(seed)
        self.assertGreaterEqual(len(rows), 50)
        self.assertTrue(all(r["place_id"].startswith("web:") for r in rows))
