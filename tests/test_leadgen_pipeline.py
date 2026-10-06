"""Lead pipeline repair (2026-10-06): Places diagnostics + fallback, discovery, decision-makers, email verification,
opportunity scoring, approval gating. Fakes only: no network."""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "lib"))

from leadgen import contacts, discovery, draft, enrich, pipeline, places_diag, score, source  # noqa: E402
from leadgen.db import SnapshotStore  # noqa: E402
from leadgen.research import Crawler  # noqa: E402

CFG = source.load_config()
KEY = "AIzaSyFAKEFAKEFAKEFAKEFAKEFAKEFAKE12345"


def http_returning(status, body, calls=None):
    def h(method, url, headers, data):
        if calls is not None:
            calls.append((method, url, dict(headers)))
        return status, body if isinstance(body, str) else json.dumps(body)
    return h


def site_fetch(pages: dict):
    """Fake crawler fetch: robots.txt 404 (allowed), pages from the dict, everything else 404."""
    def f(url, ua, t, m):
        if url.endswith("/robots.txt"):
            return 404, ""
        return (200, pages[url]) if url in pages else (404, "")
    return f


def crawler(pages):
    return Crawler(site_fetch(pages), CFG, sleep=lambda s: None, clock=lambda: 0.0)


PLACES_OK = {"places": [{"id": "p1", "displayName": {"text": "Acme Plumbing"}, "formattedAddress": "1 Main St, Jacksonville, FL 32202, USA",
                         "nationalPhoneNumber": "(904) 555-0100", "websiteUri": "https://acmeplumb.test/", "businessStatus": "OPERATIONAL"}]}
GOOGLE_403 = {"error": {"code": 403, "message": "The caller does not have permission", "status": "PERMISSION_DENIED"}}
GOOGLE_400_KEY = {"error": {"code": 400, "message": "API key not valid. Please pass a valid API key.", "status": "INVALID_ARGUMENT",
                            "details": [{"reason": "API_KEY_INVALID"}]}}
GOOGLE_429 = {"error": {"code": 429, "message": "Quota exceeded", "status": "RESOURCE_EXHAUSTED"}}
GOOGLE_DISABLED = {"error": {"code": 403, "message": "Places API (New) has not been used in project 1 before or it is disabled",
                             "status": "PERMISSION_DENIED", "details": [{"reason": "SERVICE_DISABLED"}]}}


class PlacesDiagnosticsTests(unittest.TestCase):
    def test_key_missing(self):
        d = places_diag.diagnose({}, http_returning(200, PLACES_OK), CFG)
        self.assertEqual((d["ok"], d["kind"], d["key_detected"]), (False, "missing_key", False))

    def test_success(self):
        d = places_diag.diagnose({"GOOGLE_PLACES_API_KEY": KEY}, http_returning(200, PLACES_OK), CFG)
        self.assertTrue(d["ok"])
        self.assertEqual(d["results"], 1)
        self.assertIn("Status: READY", places_diag.report(d))

    def test_invalid_key(self):
        d = places_diag.diagnose({"GOOGLE_PLACES_API_KEY": KEY}, http_returning(400, GOOGLE_400_KEY), CFG)
        self.assertEqual((d["kind"], d["authentication"]), ("invalid_key", "FAIL"))

    def test_permission_error_explains_billing(self):
        d = places_diag.diagnose({"GOOGLE_PLACES_API_KEY": KEY}, http_returning(403, GOOGLE_403), CFG)
        self.assertEqual(d["kind"], "permission_denied")
        self.assertIn("billing", places_diag.report(d).lower())

    def test_api_disabled(self):
        d = places_diag.diagnose({"GOOGLE_PLACES_API_KEY": KEY}, http_returning(403, GOOGLE_DISABLED), CFG)
        self.assertEqual(d["kind"], "api_disabled")

    def test_quota_is_not_retried(self):
        calls = []
        cap = source.CallCap(10)
        with self.assertRaises(source.PlacesError) as e:
            source.search_text(http_returning(429, GOOGLE_429, calls), KEY, CFG, "q", cap)
        self.assertEqual(e.exception.kind, "quota")
        self.assertEqual(len(calls), 1)                   # no retry loop on quota

    def test_malformed_response(self):
        with self.assertRaises(source.PlacesError) as e:
            source.search_text(http_returning(200, "<html>oops</html>"), KEY, CFG, "q", source.CallCap(1))
        self.assertEqual(e.exception.kind, "malformed")

    def test_key_never_in_url_report_or_logs(self):
        calls = []
        d = places_diag.diagnose({"GOOGLE_PLACES_API_KEY": KEY}, http_returning(403, GOOGLE_403, calls), CFG)
        self.assertNotIn(KEY, calls[0][1])                # URL
        self.assertEqual(calls[0][2]["X-Goog-Api-Key"], KEY)   # header only
        self.assertNotIn(KEY, places_diag.report(d))
        self.assertNotIn(KEY, json.dumps(d))


class DiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.seed = ROOT / "tests" / "_tmp_seed.json"
        self.seed.write_text(json.dumps({"source": "web_search", "rows": [
            {"name": "Bay Plumbing", "website": "https://bayplumb.test/", "industry": "plumbing", "city": "Jacksonville"},
            {"name": "Old Co", "website": "https://www.existing.test/", "industry": "plumbing", "city": "Jacksonville"},
            {"name": "Yelp listing", "website": "https://www.yelp.com/biz/x", "industry": "plumbing", "city": "Jacksonville"},
            {"name": "Nothing Inc", "industry": "plumbing", "city": "Jacksonville"},
            {"name": "Beach Air", "website": "https://beachair.test/", "industry": "hvac", "city": "Jacksonville Beach"}]}))

    def tearDown(self):
        self.seed.unlink(missing_ok=True)

    def test_fallback_when_places_fails(self):
        res = discovery.discover(CFG, {"GOOGLE_PLACES_API_KEY": KEY}, http_returning(403, GOOGLE_403),
                                 providers=["places", "seed"], seed_paths=[str(self.seed)], limit=10,
                                 existing=[{"domain": "existing.test", "place_id": "web:existing.test"}])
        prov = {p["name"]: p for p in res["providers"]}
        self.assertEqual(prov["places"]["status"], "failed")
        self.assertEqual(prov["seed"]["status"], "ok")
        names = [r["name"] for r in res["rows"]]
        self.assertIn("Bay Plumbing", names)
        self.assertIn("Beach Air", names)                 # "Jacksonville Beach" matches "Jacksonville, FL"
        self.assertNotIn("Old Co", names)                  # duplicate of an existing row
        self.assertNotIn("Yelp listing", names)            # directories are never prospects
        self.assertNotIn("Nothing Inc", names)             # no website and no phone: unusable
        self.assertEqual(res["duplicates"], 1)

    def test_places_rows_and_no_key_skip(self):
        res = discovery.discover(CFG, {}, http_returning(200, PLACES_OK), providers=["places"], limit=5)
        self.assertEqual(res["providers"][0]["status"], "skipped")
        res = discovery.discover(CFG, {"GOOGLE_PLACES_API_KEY": KEY}, http_returning(200, PLACES_OK),
                                 providers=["places"], industries=["plumbing"], locations=["Jacksonville, FL"], limit=5)
        self.assertEqual(res["rows"][0]["domain"], "acmeplumb.test")

    def test_franchise_location_pages_skipped(self):
        self.assertTrue(discovery.franchise_location("https://myvoda.com/jacksonville-st-augustine/?utm_source=google"))
        self.assertTrue(discovery.franchise_location("https://brand.com/locations/fl-32256"))
        self.assertTrue(discovery.franchise_location("https://north-florida.pauldavis.com/?utm_source=gbp"))
        self.assertFalse(discovery.franchise_location("https://www.andersonrestoration.com/"))
        self.assertFalse(discovery.franchise_location("https://acme.test/services/water-damage"))

    def test_duplicate_within_run_by_phone(self):
        d = discovery.Dedupe()
        self.assertTrue(d.add({"place_id": "a", "phone": "+19045550100", "name": "A", "city": "Jax"}))
        self.assertFalse(d.add({"place_id": "b", "phone": "+19045550100", "name": "B", "city": "Jax"}))


class DecisionMakerTests(unittest.TestCase):
    PAGE = ("<p>Kelly Brown - Marketing Director</p><p>Dave Miller | General Manager</p>"
            "<p>John Smith, Owner</p><p>Call Today, Owner</p>")

    def test_owner_ranked_first_marketing_excluded(self):
        ranked = contacts.rank_candidates(contacts.extract_people(self.PAGE, "https://x.test/about"))
        self.assertEqual([c["name"] for c in ranked], ["John Smith", "Dave Miller"])

    def test_marketing_phrases_are_not_people(self):
        page = "<p>Independent Agent, Owner</p><p>Locally Owned, Owner operated</p><p>Each Franchise Owner</p>"
        self.assertEqual(contacts.extract_people(page, "https://x.test/"), [])

    def test_title_priority(self):
        cands = [{"name": "Ann Ops", "title": "Operations Manager", "confidence": 0.9},
                 {"name": "Bo Pres", "title": "President", "confidence": 0.5},
                 {"name": "Cy Gm", "title": "General Manager", "confidence": 0.9}]
        self.assertEqual([c["name"] for c in contacts.rank_candidates(cands)], ["Bo Pres", "Cy Gm", "Ann Ops"])

    def test_generic_contact_never_a_decision_maker(self):
        hp = enrich.hunter_people({"emails": [{"value": "info@x.test", "type": "generic", "first_name": None, "last_name": None}]})
        self.assertEqual(hp, [])

    def test_corroboration_raises_confidence(self):
        site = {"name": "John Smith", "title": "Owner", "source": "company_site", "confidence": 0.6}
        hun = {"name": "John Smith", "title": "Owner", "source": "hunter", "confidence": 0.7, "email": "john@x.test"}
        best = contacts.rank_candidates([site, hun])[0]
        self.assertGreater(best["confidence"], 0.7)
        self.assertEqual(best["sources"], ["company_site", "hunter"])


class FakeHunter:
    name = "hunter"

    def __init__(self, people=None, finder=None, verify=None, fail=False):
        self.people, self.finder, self.ver, self.fail, self.calls = people, finder, verify or {}, fail, []

    def domain_search(self, domain):
        self.calls.append("domain")
        if self.fail:
            raise enrich.ProviderError("hunter down")
        return {"emails": self.people or []}

    def email_finder(self, domain, first, last):
        self.calls.append("finder")
        return self.finder

    def verify(self, email):
        self.calls.append("verify")
        return self.ver.get(email)


def lead(**kw):
    p = {"id": "L1", "name": "Acme", "domain": "acme.test", "website": "https://acme.test/", "industry": "plumbing"}
    p.update(kw)
    return p


OWNER = [{"value": "john@acme.test", "first_name": "John", "last_name": "Smith", "position": "Owner", "confidence": 90,
          "verification": {"status": "valid"}}]


class EmailTests(unittest.TestCase):
    def run_enrich(self, hunter, site_people=(), site_emails=()):
        return enrich.enrich(lead(), list(site_people), list(site_emails), {"hunter": hunter}, enrich.Budget(10), CFG)

    def test_verified_accepted(self):
        r = self.run_enrich(FakeHunter(OWNER, verify={"john@acme.test": {"status": "valid", "score": 97}}))
        self.assertEqual((r["email"], r["email_verification_status"], r["enrichment_status"]),
                         ("john@acme.test", "verified", "ready_for_approval"))

    def test_invalid_rejected_and_not_stored(self):
        r = self.run_enrich(FakeHunter(OWNER, verify={"john@acme.test": {"status": "invalid"}}))
        self.assertNotIn("email", r)
        self.assertEqual(r["enrichment_status"], "needs_contact_enrichment")

    def test_generic_rejected(self):
        self.assertEqual(contacts.classify_email("info@acme.test", "valid"), "generic")
        people = [{"name": "John Smith", "title": "Owner", "source": "company_site", "confidence": 0.6}]
        r = self.run_enrich(FakeHunter([]), people, [("office@acme.test", "https://acme.test/contact")])
        self.assertNotEqual(r.get("email"), "office@acme.test")
        self.assertEqual(r["enrichment_status"], "needs_contact_enrichment")

    def test_guessed_email_not_verified_without_verifier(self):
        people = [{"name": "John Smith", "title": "Owner", "source": "company_site", "confidence": 0.6}]
        h = FakeHunter([], finder={"email": "john@acme.test", "score": 80}, verify={})   # finder pattern, no verdict
        r = self.run_enrich(h, people)
        self.assertEqual(r["email_verification_status"], "unknown")
        self.assertEqual(r["enrichment_status"], "needs_contact_enrichment")

    def test_free_mail_is_personal(self):
        self.assertEqual(contacts.classify_email("bob@gmail.com", "valid"), "personal")

    def test_provider_failure_does_not_crash(self):
        people = [{"name": "John Smith", "title": "Owner", "source": "company_site", "confidence": 0.6}]
        r = self.run_enrich(FakeHunter(fail=True), people)
        self.assertEqual(r["decision_maker_name"], "John Smith")
        self.assertEqual(r["enrichment_status"], "needs_contact_enrichment")

    def test_budget_caps_provider_calls(self):
        h = FakeHunter(OWNER, verify={"john@acme.test": {"status": "valid"}})
        r = enrich.enrich(lead(), [], [], {"hunter": h}, enrich.Budget(0), CFG)
        self.assertEqual(h.calls, [])
        self.assertEqual(r["enrichment_status"], "needs_contact_enrichment")


def sigs(**vals):
    s = {"has_website": {"value": True}}
    for k, v in vals.items():
        s[k] = {"value": v, **({"evidence": f"evidence for {k}"} if v else {})}
    return s


class ScoringTests(unittest.TestCase):
    def test_missed_calls_and_no_booking_raise_score(self):
        base = score.score_prospect({"industry": "plumbing", "signals": sigs(after_hours_answering=True, has_online_booking=True)}, CFG)
        missed = score.score_prospect({"industry": "plumbing", "phone": "+19045550100",
                                       "signals": sigs(after_hours_answering=False, has_online_booking=True)}, CFG)
        nobook = score.score_prospect({"industry": "plumbing", "phone": "+19045550100",
                                       "signals": sigs(after_hours_answering=False, has_online_booking=False)}, CFG)
        self.assertGreater(missed, base)
        self.assertGreater(nobook, missed)

    def test_great_website_is_not_disqualified(self):
        good_site = sigs(has_tel_link=True, has_mobile_viewport=True, has_contact_form=True, has_online_booking=True,
                         site_https=True, after_hours_answering=False, has_chat_widget=False, mentions_24_7=True)
        p = {"industry": "hvac", "review_count": 300, "signals": good_site}
        self.assertGreaterEqual(score.score_prospect(p, CFG), CFG["enrichment"]["qualify_min"])

    def test_no_double_count_in_a_group(self):
        _, pains = score.opportunity({"industry": "plumbing", "phone": "+19045550100",
                                      "signals": sigs(after_hours_answering=False, has_online_booking=False, has_contact_form=False)}, CFG)
        groups = [CFG["score"]["weights"][x["signal"]]["group"] for x in pains]
        self.assertEqual(len(groups), len(set(groups)))

    def test_unknown_signals_never_scored(self):
        self.assertEqual(score.score_prospect({"industry": "legal", "signals": {}}, CFG), 10)  # high_ticket only

    def test_24_7_business_angle_never_says_no_after_hours_answer(self):
        plain = {"industry": "plumbing", "phone": "+19045550100", "signals": sigs(after_hours_answering=False)}
        site_247 = {**plain, "signals": {**sigs(after_hours_answering=False),
                                         "mentions_24_7": {"value": True, "evidence": "We Offer 24/7 Emergency Plumbing"}}}
        emergency_only = {**plain, "signals": {**sigs(after_hours_answering=False),
                                               "mentions_24_7": {"value": True, "evidence": "Emergency Repairs Service Areas"}}}
        self.assertNotIn("24/7", draft.personal_angle({"pain_points": score.opportunity(emergency_only, CFG)[1]}))
        google_247 = {**plain, "hours": {"weekdayDescriptions": ["Monday: Open 24 hours"]}}
        self.assertIn("answered after hours", draft.personal_angle({"pain_points": score.opportunity(plain, CFG)[1]}))
        for p in (site_247, google_247):
            sc, pains = score.opportunity(p, CFG)
            angle = draft.personal_angle({"pain_points": pains})
            self.assertIn("advertise 24/7", angle)
            self.assertNotIn("after hours", angle)
            self.assertNotIn("after-hours", angle)
            self.assertEqual(sc, score.opportunity(plain, CFG)[0])     # same points, only the wording changes


class PipelineTests(unittest.TestCase):
    PAGES = {"https://acme.test/": '<html><meta name="viewport" content="width=device-width"><a href="tel:9045550100">Call</a>'
                                   "<p>24/7 emergency service</p><a href='/about'>About</a></html>",
             "https://acme.test/about": "<p>John Smith, Owner</p>"}

    def test_full_chain_to_ready_and_planner_gate(self):
        h = FakeHunter(OWNER, verify={"john@acme.test": {"status": "valid", "score": 99}})
        row = pipeline.process(lead(phone="+19045550100", discovery_sources=["web_search"]), crawler(self.PAGES), CFG,
                               {"hunter": h}, enrich.Budget(10), set())
        self.assertEqual(row["decision_maker_name"], "John Smith")
        self.assertEqual(row["enrichment_status"], "ready_for_approval")
        self.assertEqual(row["lead_tier"], "HOT")
        self.assertEqual(row["status"], "researched")      # the planner reads researched rows
        steps = [t["step"] for t in row["pipeline_log"]]
        self.assertEqual(steps[0], "discovered")
        self.assertIn("qualified", steps)
        self.assertEqual(steps[-1], "ready_for_approval")
        subject, body = draft.compose(row, "1 Test Way, Jacksonville, FL 32202")
        self.assertTrue(body.startswith("Hi John,"))
        self.assertEqual(body.count("24/7"), 1)             # said once, in the facts line
        self.assertIn("every late-night call has to be picked up", body)
        self.assertNotIn("answered after hours", body)
        self.assertNotIn("text", body.lower().replace("context", ""))

    def test_off_domain_site_email_not_kept(self):
        pages = {"https://acme.test/": "<p>Website by akent@webagency.test</p>"}
        row = pipeline.process(lead(), crawler(pages), CFG, {}, enrich.Budget(0), set())
        self.assertIsNone(row.get("email"))

    def test_suppressed_lead_cannot_reenter(self):
        h = FakeHunter(OWNER, verify={"john@acme.test": {"status": "valid"}})
        row = pipeline.process(lead(phone="+19045550100"), crawler(self.PAGES), CFG, {"hunter": h}, enrich.Budget(10),
                               {"john@acme.test"})
        self.assertEqual((row["enrichment_status"], row["lead_tier"]), ("rejected", "REJECTED"))

    def test_unreadable_site_is_pending_not_rejected(self):
        blocked = Crawler(lambda u, ua, t, m: (202, ""), CFG, sleep=lambda s: None, clock=lambda: 0.0)
        row = pipeline.process(lead(), blocked, CFG, {}, enrich.Budget(10), set())
        self.assertEqual(row["enrichment_status"], "pending")

    def test_dry_run_writes_nothing(self):
        store = SnapshotStore({})
        seed = ROOT / "tests" / "_tmp_seed2.json"
        seed.write_text(json.dumps({"rows": [{"name": "Acme", "website": "https://acme.test/", "industry": "plumbing"}]}))
        try:
            out = pipeline.scout(store, CFG, {}, http_returning(500, "{}"), crawler(self.PAGES), providers=["seed"],
                                 seed_paths=[str(seed)], dry_run=True)
        finally:
            seed.unlink(missing_ok=True)
        self.assertEqual(store.ops, [])
        self.assertEqual(out["written"], 0)
        self.assertEqual(len(out["businesses"]), 1)

    def test_pipeline_never_sends(self):
        src = "".join((ROOT / "leadgen" / f).read_text() for f in ("pipeline.py", "enrich.py", "discovery.py", "contacts.py", "__main__.py"))
        for bad in ("send_message", "smtplib", "api.resend.com", "insert_outreach"):
            self.assertNotIn(bad, src)


if __name__ == "__main__":
    unittest.main()
