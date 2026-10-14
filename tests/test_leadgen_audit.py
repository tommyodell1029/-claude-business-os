import datetime as dt
import unittest

from leadgen.audit import audit_prospect, check_html, fit_score, stage_for

TODAY = dt.date(2026, 10, 13)
GOOD = """<html><head><title>Coastal Plumbing | Jacksonville Plumber</title>
<meta name="viewport" content="width=device-width"><meta name="description" content="Licensed plumbers in Jacksonville, FL.">
</head><body><h1>Jacksonville plumbing</h1><a href="tel:+19045550100">(904) 555-0100</a><form></form>© 2026</body></html>"""
BAD = """<html><head><title>Home</title></head><body><p>Call us 904-555-0199</p><p>Copyright 2019</p></body></html>"""


class FakeCrawler:
    def __init__(self, pages, allowed=True):
        self.pages, self._allowed = pages, allowed

    def allowed(self, url):
        return self._allowed

    def page(self, url):
        return self.pages.get(url)

    def _get(self, url, host):
        v = self.pages.get(url)
        if isinstance(v, int):
            return v, ""
        return (200, v) if v is not None else (599, "")


class AuditTest(unittest.TestCase):
    def test_good_site_has_no_findings(self):
        self.assertEqual(check_html(GOOD, "https://coastal.example/", "(904) 555-0100", TODAY), [])

    def test_bad_site_findings_carry_evidence(self):
        f = {x["id"]: x for x in check_html(BAD, "http://old.example/", "(904) 555-0100", TODAY)}
        for k in ("no_https", "no_viewport", "no_click_to_call", "no_form", "missing_title", "missing_description", "no_h1", "outdated_copyright", "phone_not_on_page"):
            self.assertIn(k, f)
            self.assertTrue(f[k]["evidence"])
        self.assertEqual(f["outdated_copyright"]["evidence"], "Footer shows © 2019")
        self.assertEqual(f["missing_title"]["evidence"], 'Page title: "Home"')

    def test_parked_domain_is_one_finding_only(self):
        f = check_html("<html><title>x.com — Buy this expired domain</title><body>Buy this expired domain $195</body></html>", "https://x.com/", "9045550100", TODAY)
        self.assertEqual([x["id"] for x in f], ["domain_expired"])

    def test_no_website_and_unreachable(self):
        a = audit_prospect(FakeCrawler({}), {"website": None}, TODAY)
        self.assertEqual(a["status"], "no_website")
        self.assertEqual(a["fit"], 45)
        b = audit_prospect(FakeCrawler({}), {"website": "https://down.example/"}, TODAY)
        self.assertEqual([x["id"] for x in b["findings"]], ["site_unreachable"])

    def test_https_falls_back_to_http_and_robots_block_is_not_a_finding(self):
        a = audit_prospect(FakeCrawler({"http://old.example/": BAD}), {"website": "http://old.example/", "phone": "9045550199"}, TODAY)
        self.assertEqual(a["url"], "http://old.example/")
        self.assertIn("no_https", [x["id"] for x in a["findings"]])
        self.assertNotIn("phone_not_on_page", [x["id"] for x in a["findings"]])
        b = audit_prospect(FakeCrawler({}, allowed=False), {"website": "https://x.example/"}, TODAY)
        self.assertEqual((b["status"], b["fit"], b["findings"]), ("not_checked", None, []))
        # listing says http:// but https works: no "not secure" claim
        c = audit_prospect(FakeCrawler({"https://ok.example/": GOOD}), {"website": "http://ok.example/", "phone": "(904) 555-0100"}, TODAY)
        self.assertEqual(c["findings"], [])
        # bot protection (403) is not a finding
        d = audit_prospect(FakeCrawler({"https://guarded.example/": 403}), {"website": "https://guarded.example/"}, TODAY)
        self.assertEqual((d["status"], d["findings"]), ("not_checked", []))

    def test_stage_never_repitches_contacted_or_opted_out(self):
        a = {"status": "checked", "findings": [{"title": "No tap-to-call link", "weight": 15}, {"title": "Not set up for phones", "weight": 20}], "fit": 35}
        self.assertEqual(stage_for({"status": "researched"}, a)[0], "audit_prepared")
        self.assertEqual(stage_for({"status": "in_sequence", "pipeline_stage": "contacted"}, a)[0], "contacted")
        self.assertEqual(stage_for({"status": "do_not_contact", "pipeline_stage": "lost"}, a)[0], "lost")
        self.assertEqual(fit_score([{"weight": 80}, {"weight": 40}]), 100)


if __name__ == "__main__":
    unittest.main()


class WebsiteOutreachTest(unittest.TestCase):
    P = {"id": "x", "name": "Aldridge & Sons Plumbing", "phone": "+19045550100", "email": None,
         "website_audit": {"findings": [{"id": "no_click_to_call", "title": "No tap-to-call link", "evidence": "e", "url": "u", "weight": 15},
                                        {"id": "no_form", "title": "No contact form", "evidence": "e", "url": "u", "weight": 10}]}}

    def test_no_verified_email_means_owner_call_script_only(self):
        from leadgen.website_outreach import packet
        k = packet(self.P, {})
        self.assertEqual(k["channel"], "phone")
        self.assertIn("tap-to-call", k["body"])
        self.assertNotIn("$", k["body"])
        self.assertIn("Never promise", k["body"])

    def test_verified_email_draft_has_address_optout_and_no_price(self):
        from leadgen.website_outreach import packet
        from leadgen.draft import OPT_OUT
        k = packet({**self.P, "email": "owner@aldridge.example", "email_verification_status": "verified"}, {"MAILING_ADDRESS": "123 Main St, Jacksonville, FL"})
        self.assertEqual(k["channel"], "email")
        self.assertIn("123 Main St", k["body"])
        self.assertIn(OPT_OUT, k["body"])
        self.assertNotRegex(k["body"], r"\$\s?\d")

    def test_unverified_email_never_gets_a_first_touch(self):
        from leadgen.website_outreach import packet
        k = packet({**self.P, "email": "info@aldridge.example", "email_verification_status": "likely"}, {})
        self.assertEqual(k["channel"], "phone")
