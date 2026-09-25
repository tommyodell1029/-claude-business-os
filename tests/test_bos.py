"""Run: python -m unittest -v   (stdlib only)"""
import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone

from bos import biz, core
from bos.__main__ import audit, dashboard, main, n8n_report, optimize, priorities

JOB = {
    "platform": "upwork", "url": "https://www.upwork.com/jobs/~01abc", "client": "Dana Smith",
    "title": "n8n workflow to route website leads into HubSpot CRM with AI classification",
    "description": ("We need an n8n automation that takes new website form leads via webhook, uses an AI agent to "
                    "classify them, and pushes them into our CRM (HubSpot) with Slack notifications.\n"
                    "Requirements:\n- webhook trigger\n- AI classification\n- CRM integration\n- error alerts\n"
                    "Ongoing maintenance possible for the right freelancer. Deadline in 2 weeks."),
    "budget": 150, "skills": ["n8n", "API Integration", "HubSpot"],
    "client_info": {"payment_verified": True, "hire_rate": 70, "total_spent": 5000, "rating": 4.9},
}


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["BOS_DB"] = os.path.join(self.tmp.name, "t.db")
        self.con = core.connect()

    def tearDown(self):
        self.con.close()
        self.tmp.cleanup()
        os.environ.pop("BOS_DB", None)

    def cli(self, *args):
        buf = io.StringIO()
        with redirect_stdout(buf):
            rc = main(list(args))
        return rc, buf.getvalue()


class TestDB(Base):
    def test_schema_and_seed(self):
        self.assertEqual(self.con.execute("PRAGMA user_version").fetchone()[0], len(core.SCHEMA))
        self.assertEqual(self.con.execute("SELECT COUNT(*) FROM services").fetchone()[0], 5)
        self.assertGreater(self.con.execute("SELECT COUNT(*) FROM templates").fetchone()[0], 5)

    def test_migrate_idempotent(self):
        core.migrate(self.con)
        core.migrate(self.con)
        self.assertEqual(self.con.execute("SELECT COUNT(*) FROM services").fetchone()[0], 5)

    def test_portfolio_kind_constraint(self):
        with self.assertRaises(Exception):
            self.con.execute("INSERT INTO portfolio(title,kind) VALUES ('x','FAKE')")

    def test_config_valid(self):
        self.assertEqual(core.validate_config(core.config()), [])
        bad = json.loads(json.dumps(core.config()))
        bad["marketplaces"]["fiverr"]["auto_submit"] = True  # fiverr has no official integration
        self.assertTrue(any("auto_submit" in e for e in core.validate_config(bad)))


class TestTaskQueue(Base):
    def test_priority_order(self):
        core.handler("t_echo")(lambda con, inp: inp)
        low = core.enqueue(self.con, "t_echo", {"n": 1}, priority=9)
        high = core.enqueue(self.con, "t_echo", {"n": 2}, priority=1)
        self.assertEqual(core.claim(self.con)["id"], high)
        self.assertEqual(core.claim(self.con)["id"], low)

    def test_retry_then_fail_escalates(self):
        def boom(con, inp):
            raise RuntimeError("nope")
        core.handler("t_boom")(boom)
        tid = core.enqueue(self.con, "t_boom")
        for _ in range(core.config()["tasks"]["max_retries"] + 1):
            self.con.execute("UPDATE tasks SET run_after=NULL WHERE id=?", (tid,))
            self.con.commit()
            core.work(self.con)
        t = self.con.execute("SELECT * FROM tasks WHERE id=?", (tid,)).fetchone()
        self.assertEqual(t["status"], "FAILED")
        self.assertIn("nope", t["error"])
        self.assertTrue(self.con.execute("SELECT 1 FROM tasks WHERE type='approval' AND status='REVIEW_REQUIRED'").fetchone())

    def test_retry_backoff_sets_run_after(self):
        core.handler("t_boom2")(lambda con, inp: 1 / 0)
        tid = core.enqueue(self.con, "t_boom2")
        core.work(self.con)
        t = self.con.execute("SELECT * FROM tasks WHERE id=?", (tid,)).fetchone()
        self.assertEqual((t["status"], t["retry_count"]), ("QUEUED", 1))
        self.assertIsNotNone(t["run_after"])
        self.assertIsNone(core.claim(self.con))  # not runnable until backoff elapses

    def test_unknown_handler_goes_to_review(self):
        tid = core.enqueue(self.con, "nonexistent")
        core.work(self.con)
        self.assertEqual(self.con.execute("SELECT status FROM tasks WHERE id=?", (tid,)).fetchone()[0], "REVIEW_REQUIRED")

    def test_stale_recovery(self):
        tid = core.enqueue(self.con, "x")
        old = core.ts(datetime.now(timezone.utc) - timedelta(hours=2))
        self.con.execute("UPDATE tasks SET status='RUNNING', updated=? WHERE id=?", (old, tid))
        self.con.commit()
        self.assertEqual(core.recover_stale(self.con), 1)
        self.assertEqual(self.con.execute("SELECT status FROM tasks WHERE id=?", (tid,)).fetchone()[0], "QUEUED")

    def test_automation_run_recorded(self):
        core.handler("t_ok")(lambda con, inp: {"ok": 1})
        core.enqueue(self.con, "t_ok")
        core.work(self.con)
        self.assertEqual(self.con.execute("SELECT status FROM automation_runs").fetchone()[0], "COMPLETED")


class TestApprovalGate(Base):
    def test_gate_blocks_then_allows(self):
        with self.assertRaises(core.ApprovalRequired) as cm:
            core.gate(self.con, "spend_money", "sub", 1, "buy thing")
        tid = cm.exception.task_id
        with self.assertRaises(core.ApprovalRequired) as cm2:  # re-request reuses same task
            core.gate(self.con, "spend_money", "sub", 1, "buy thing")
        self.assertEqual(cm2.exception.task_id, tid)
        core.decide(self.con, tid, True)
        core.gate(self.con, "spend_money", "sub", 1, "buy thing")  # no raise
        with self.assertRaises(core.ApprovalRequired):  # approval is scoped to entity
            core.gate(self.con, "spend_money", "sub", 2, "other")

    def test_rejected_stays_blocked(self):
        with self.assertRaises(core.ApprovalRequired) as cm:
            core.gate(self.con, "send_deliverable", "project", 5, "x")
        core.decide(self.con, cm.exception.task_id, False)
        with self.assertRaises(core.ApprovalRequired):
            core.gate(self.con, "send_deliverable", "project", 5, "x")

    def test_cannot_decide_twice(self):
        tid = core.request_approval(self.con, "irreversible", "x", 1, "x")
        core.decide(self.con, tid, True)
        with self.assertRaises(ValueError):
            core.decide(self.con, tid, False)

    def test_non_gated_action_passes(self):
        core.gate(self.con, "read_data", "x", 1, "x")


class TestSecrets(Base):
    def test_redact_env_and_patterns(self):
        os.environ["FAKE_API_KEY"] = "supersecretvalue123"
        try:
            s = core.redact("key supersecretvalue123 and sk-abcdefghijklmnopqrstuv and password=hunter22")
            self.assertNotIn("supersecretvalue123", s)
            self.assertNotIn("sk-abcdefghijklmnop", s)
            self.assertNotIn("hunter22", s)
        finally:
            del os.environ["FAKE_API_KEY"]

    def test_audit_log_redacts(self):
        core.log(self.con, "x", detail="token=abcdef123456")
        self.assertNotIn("abcdef123456", self.con.execute("SELECT detail FROM audit_logs").fetchone()[0])

    def test_task_error_redacted(self):
        def leak(con, inp):
            raise RuntimeError("failed with api_key=zzzzzz999999")
        core.handler("t_leak")(leak)
        tid = core.enqueue(self.con, "t_leak")
        core.work(self.con)
        self.assertNotIn("zzzzzz999999", self.con.execute("SELECT error FROM tasks WHERE id=?", (tid,)).fetchone()[0])


class TestMarketplace(Base):
    def test_add_and_dedupe(self):
        i, new = biz.add_opportunity(self.con, JOB)
        j, new2 = biz.add_opportunity(self.con, JOB)
        self.assertTrue(new)
        self.assertFalse(new2)
        self.assertEqual(i, j)

    def test_budget_parsing_and_validation(self):
        i, _ = biz.add_opportunity(self.con, {"platform": "Upwork", "title": "x", "budget": "$1,250"})
        self.assertEqual(self.con.execute("SELECT budget_max FROM marketplace_opportunities WHERE id=?", (i,)).fetchone()[0], 1250)
        with self.assertRaises(ValueError):
            biz.add_opportunity(self.con, {"platform": "craigslist", "title": "x"})

    def test_score_high_fit(self):
        i, _ = biz.add_opportunity(self.con, JOB)
        r = biz.analyze(self.con, i)
        self.assertEqual(r["service"], "n8n")
        self.assertTrue(r["qualified"], r)
        self.assertEqual(set(r["factors"]), set(core.config()["scoring"]["weights"]))
        self.assertLessEqual(r["score"], 100)

    def test_score_low_fit(self):
        i, _ = biz.add_opportunity(self.con, {"platform": "upwork", "title": "Build Uber clone mobile app",
                                              "description": "Complex enterprise scalable app like uber, etc", "budget": 20})
        r = biz.analyze(self.con, i)
        self.assertFalse(r["qualified"])
        self.assertEqual(self.con.execute("SELECT status FROM marketplace_opportunities WHERE id=?", (i,)).fetchone()[0], "CANCELLED")

    def test_pricing(self):
        self.assertEqual(biz.price_plan("n8n", 150), ("standard", 99.0, 4.0))
        self.assertEqual(biz.price_plan("n8n", 30)[0], "basic")
        self.assertEqual(biz.price_plan("n8n", None)[0], "standard")
        self.assertEqual(biz.price_plan("n8n", 200)[0], "premium")
        t, p, h = biz.price_plan("n8n", 400)
        self.assertEqual((t, p), ("premium+", 400.0))
        self.assertGreater(h, 8)

    def test_platform_cost(self):
        # upwork: 10% of 100 + 8 connects * 0.15
        self.assertAlmostEqual(biz.platform_cost("upwork", 100, None), 11.2)
        self.assertAlmostEqual(biz.platform_cost("upwork", 100, 4), 10.6)
        self.assertAlmostEqual(biz.platform_cost("fiverr", 100, None), 20.0)


UPWORK_ROW = {
    "id": "2103419839125733470", "title": "Shopify Product Import Automation (n8n + API)", "budget": "200.00",
    "job_type": "fixed", "proposals_tier": "15 to 20", "skills": ["Shopify", "API Integration", "Automation"],
    "description": "<untrusted_participant_content>\nn8n + Shopify product import automation with API integration, "
                   "pricing rules, variant creation and error handling.\n</untrusted_participant_content>",
    "client": {"country": "India", "verification_status": "VERIFIED"},
    "url": "https://www.upwork.com/jobs/~022103419839125733470?utm_campaign=x",
    "connects_cost": 11, "total_hired": 0, "hire_rate_percent": 0,
}


class TestUpworkConnector(Base):
    def test_mapping(self):
        d = biz.from_upwork(UPWORK_ROW)
        self.assertEqual(d["url"], "https://www.upwork.com/jobs/~022103419839125733470")
        self.assertNotIn("untrusted", d["description"])
        self.assertEqual((d["connects"], d["client_info"]["payment_verified"]), (11, True))
        self.assertIsNone(d["client"])  # country must never become a greeting name

    def test_auto_detect_on_add(self):
        i, new = biz.add_opportunity(self.con, dict(UPWORK_ROW))
        o = self.con.execute("SELECT * FROM marketplace_opportunities WHERE id=?", (i,)).fetchone()
        self.assertEqual((o["platform"], o["external_id"], o["connects"], o["budget_max"]), ("upwork", UPWORK_ROW["id"], 11, 200))
        self.assertFalse(biz.add_opportunity(self.con, dict(UPWORK_ROW))[1])

    def test_already_hired_blocks(self):
        i, _ = biz.add_opportunity(self.con, dict(UPWORK_ROW, total_hired=1))
        r = biz.analyze(self.con, i)
        self.assertFalse(r["qualified"])
        self.assertIn("already hired", self.con.execute("SELECT result FROM marketplace_opportunities WHERE id=?", (i,)).fetchone()[0])

    def test_connects_balance_blocks(self):
        biz.add_metric(self.con, "upwork", "connects_balance", 5)
        i, _ = biz.add_opportunity(self.con, dict(UPWORK_ROW))
        self.assertIn("needs 11 Connects, balance 5", biz.analyze(self.con, i)["blockers"])

    def test_red_flag_and_budget_floor_block(self):
        i, _ = biz.add_opportunity(self.con, dict(UPWORK_ROW, description="n8n pipeline producing unwatermarked AI text"))
        self.assertTrue(any("red flag" in b for b in biz.analyze(self.con, i)["blockers"]))
        j, _ = biz.add_opportunity(self.con, dict(UPWORK_ROW, id="3", url=None, budget="10.00"))
        self.assertTrue(any("below service floor" in b for b in biz.analyze(self.con, j)["blockers"]))

    def test_competition_lowers_fit(self):
        a = biz.score(self.con.execute("SELECT * FROM marketplace_opportunities WHERE id=?",
                                       (biz.add_opportunity(self.con, dict(UPWORK_ROW))[0],)).fetchone())
        b = biz.score(self.con.execute("SELECT * FROM marketplace_opportunities WHERE id=?",
                                       (biz.add_opportunity(self.con, dict(UPWORK_ROW, id="2", url=None, proposals_tier="50+"))[0],)).fetchone())
        self.assertLess(b["factors"]["client_fit"], a["factors"]["client_fit"])


class TestProposals(Base):
    def test_draft_is_specific_and_gated(self):
        i, _ = biz.add_opportunity(self.con, JOB)
        pid = biz.draft_proposal(self.con, i)
        p = self.con.execute("SELECT * FROM proposals WHERE id=?", (pid,)).fetchone()
        self.assertEqual(json.loads(p["lint"]), [], p["body"])
        self.assertIn("n8n", p["body"].lower())
        self.assertIn("$", p["body"])
        self.assertEqual(self.con.execute("SELECT status FROM marketplace_opportunities WHERE id=?", (i,)).fetchone()[0], "REVIEW_REQUIRED")
        with self.assertRaises(core.ApprovalRequired):
            biz.submit_proposal(self.con, pid)

    def test_no_fabricated_proof_without_portfolio(self):
        i, _ = biz.add_opportunity(self.con, JOB)
        body = self.con.execute("SELECT body FROM proposals WHERE id=?", (biz.draft_proposal(self.con, i),)).fetchone()[0]
        self.assertNotIn("Relevant:", body)
        self.assertNotRegex(body.lower(), r"\d+\s*%\s*(increase|more)")

    def test_demo_labelled_in_proof(self):
        biz.add_portfolio(self.con, {"title": "AI lead router", "kind": "DEMO", "service": "n8n"})
        i, _ = biz.add_opportunity(self.con, JOB)
        body = self.con.execute("SELECT body FROM proposals WHERE id=?", (biz.draft_proposal(self.con, i),)).fetchone()[0]
        self.assertIn("(demo I built)", body)

    def test_lint_catches_generic(self):
        o = {"title": JOB["title"], "description": JOB["description"], "skills": json.dumps(JOB["skills"])}
        issues = biz.lint_proposal("Dear hiring manager, I am excited to apply. I can do this job.", o)
        self.assertTrue(any("generic" in x for x in issues))
        self.assertTrue(any("short" in x for x in issues))

    def test_approve_flow_manual(self):
        i, _ = biz.add_opportunity(self.con, JOB)
        pid = biz.draft_proposal(self.con, i)
        tid = self.con.execute("SELECT id FROM tasks WHERE type='approval'").fetchone()[0]
        core.decide(self.con, tid, True)
        r = biz.submit_proposal(self.con, pid)
        self.assertEqual(r["mode"], "mcp")  # config: official Upwork connector
        self.assertIn("confirm_preview ONLY on explicit user OK", r["next"])
        self.assertEqual(self.con.execute("SELECT status FROM marketplace_opportunities WHERE id=?", (i,)).fetchone()[0], "APPROVED")


class TestLeads(Base):
    def test_normalize(self):
        self.assertEqual(biz.domain_of("HTTPS://www.Acme.com/contact?x=1"), "acme.com")
        self.assertEqual(biz.norm_phone("+1 904-555-0101"), "(904) 555-0101")
        self.assertIsNone(biz.norm_phone("555"))
        self.assertIsNone(biz.norm_email("not-an-email"))

    def test_dedupe_and_merge(self):
        a, n1 = biz.add_lead(self.con, {"business": "Acme Plumbing", "website": "acme.com", "source": "manual"})
        b, n2 = biz.add_lead(self.con, {"business": "ACME Plumbing LLC", "website": "https://www.acme.com/",
                                        "phone": "904-555-0101", "source": "public_website"})
        c, n3 = biz.add_lead(self.con, {"business": "Acme", "phone": "(904) 555-0101", "source": "manual"})
        self.assertEqual((a, n1), (b, not n2))
        self.assertEqual(a, c)
        self.assertFalse(n3)
        self.assertEqual(self.con.execute("SELECT COUNT(*) FROM leads").fetchone()[0], 1)
        self.assertEqual(self.con.execute("SELECT phone FROM leads").fetchone()[0], "(904) 555-0101")

    def test_rejects_unpermitted_source(self):
        with self.assertRaises(ValueError):
            biz.add_lead(self.con, {"business": "X", "source": "scraped_linkedin"})

    def test_scoring_from_signals(self):
        lid, _ = biz.add_lead(self.con, {"business": "Joe HVAC", "email": "info@joehvac.com", "source": "manual",
                                         "signals": "missed_calls;no_online_booking"})
        l = self.con.execute("SELECT * FROM leads WHERE id=?", (lid,)).fetchone()
        self.assertEqual(l["recommended_service"], "voice")
        self.assertEqual(l["status"], "QUALIFIED")

    def test_csv_import(self):
        path = os.path.join(self.tmp.name, "l.csv")
        with open(path, "w") as f:
            f.write("business,website,phone,email\nA Co,a.com,,\nA Co dup,www.a.com,,\n,b.com,,\nC Co,,9045550000,bad\n")
        r = biz.import_leads_csv(self.con, path, niche="plumbers", location="Jacksonville, FL")
        self.assertEqual((r["created"], r["merged"], len(r["errors"])), (2, 1, 1))
        self.assertIsNone(self.con.execute("SELECT email FROM leads WHERE business='C Co'").fetchone()[0])


class TestOutreach(Base):
    def _lead(self, email="info@joehvac.com"):
        return biz.add_lead(self.con, {"business": "Joe HVAC", "email": email, "source": "manual",
                                       "signals": "missed_calls"})[0]

    def test_sequence_and_timing(self):
        ids = biz.draft_sequence(self.con, self._lead())
        rows = self.con.execute("SELECT step, due_at FROM outreach ORDER BY id").fetchall()
        self.assertEqual([r["step"] for r in rows], core.config()["outreach"]["sequence"])
        d = [datetime.fromisoformat(r["due_at"]) for r in rows]
        self.assertEqual([(d[i + 1] - d[i]).days for i in range(3)], [3, 7, 30])
        self.assertEqual(len(ids), 4)
        with self.assertRaises(ValueError):  # no duplicate active sequence
            biz.draft_sequence(self.con, 1)

    def test_no_email_no_sequence(self):
        lid = biz.add_lead(self.con, {"business": "NoMail", "source": "manual"})[0]
        with self.assertRaises(ValueError):
            biz.draft_sequence(self.con, lid)

    def test_send_blocked_without_address(self):
        ids = biz.draft_sequence(self.con, self._lead())
        with self.assertRaises(ValueError):
            biz.outreach_send_check(self.con, ids[0])

    def test_bounce_suppresses(self):
        lid = self._lead()
        ids = biz.draft_sequence(self.con, lid)
        biz.mark_outreach(self.con, ids[0], "SENT")
        biz.mark_outreach(self.con, ids[0], "BOUNCED")
        l = self.con.execute("SELECT * FROM leads WHERE id=?", (lid,)).fetchone()
        self.assertEqual((l["suppressed"], l["status"], l["email"]), (1, "INVALID", "info@joehvac.com"))
        self.assertEqual(self.con.execute("SELECT COUNT(*) FROM outreach WHERE status='DRAFT'").fetchone()[0], 0)
        self.assertEqual(biz.due_followups(self.con, "9999"), [])
        with self.assertRaises(ValueError):
            biz.draft_sequence(self.con, lid)

    def test_no_thanks_suppresses(self):
        lid = self._lead()
        ids = biz.draft_sequence(self.con, lid)
        biz.mark_outreach(self.con, ids[0], "SENT")
        self.assertEqual(len(biz.due_followups(self.con, "9999")), 3)
        biz.mark_outreach(self.con, ids[0], "NEGATIVE")
        self.assertEqual(self.con.execute("SELECT status FROM leads WHERE id=?", (lid,)).fetchone()[0], "LOST_NO_THANKS")
        self.assertEqual(biz.due_followups(self.con, "9999"), [])


class TestFulfillment(Base):
    def test_playbook_gate_and_recurring(self):
        _, pid = biz.intake(self.con, {"name": "Dana", "platform": "upwork"},
                            {"service": "sheets", "price": 50, "tier": "standard"})
        steps = json.loads(self.con.execute("SELECT deliverables FROM projects WHERE id=?", (pid,)).fetchone()[0])
        for _ in range(4):
            biz.advance(self.con, pid)
        with self.assertRaises(core.ApprovalRequired) as cm:  # step 5 = deliver
            biz.advance(self.con, pid)
        core.decide(self.con, cm.exception.task_id, True)
        r = None
        for _ in range(len(steps) - 4):
            r = biz.advance(self.con, pid)
        self.assertTrue(r["done"])
        self.assertTrue(r["followups"]["upsells"])
        self.assertEqual(self.con.execute("SELECT status FROM recurring_revenue").fetchone()[0], "PROPOSED")

    def test_paid_work_requires_real_project(self):
        with self.assertRaises(ValueError):
            biz.add_portfolio(self.con, {"title": "fake", "kind": "PAID_CLIENT_WORK"})
        with self.assertRaises(ValueError):
            biz.add_portfolio(self.con, {"title": "fake", "kind": "PAID_CLIENT_WORK", "project_id": 999})


class TestFinance(Base):
    def test_calculations(self):
        biz.add_txn(self.con, "revenue", 100, service="n8n", platform="upwork")   # +10 fee auto
        biz.add_txn(self.con, "revenue", 50, service="sheets", platform="fiverr")  # +10 fee auto
        biz.add_txn(self.con, "api", 5, service="n8n")
        self.con.execute("INSERT INTO recurring_revenue(service,monthly_amount,status) VALUES ('n8n',49,'ACTIVE')")
        self.con.commit()
        f = biz.finance(self.con)
        self.assertEqual(f["gross_revenue"], 150)
        self.assertEqual(f["total_cost"], 25)
        self.assertEqual(f["net_profit"], 125)
        self.assertAlmostEqual(f["profit_margin_pct"], 83.3)
        self.assertEqual(f["average_order_value"], 75)
        self.assertEqual(f["mrr"], 49)
        self.assertEqual(f["by_service"]["n8n"]["net"], 85)

    def test_validation(self):
        with self.assertRaises(ValueError):
            biz.add_txn(self.con, "revenue", -5)
        with self.assertRaises(ValueError):
            biz.add_txn(self.con, "bitcoin", 5)

    def test_no_fee_flag(self):
        biz.add_txn(self.con, "revenue", 100, platform="upwork", auto_fee=False)
        self.assertEqual(biz.finance(self.con)["total_cost"], 0)


class TestOps(Base):
    def test_dashboard_priorities_audit(self):
        biz.add_opportunity(self.con, JOB)
        d = dashboard(self.con)
        self.assertEqual(d["NEW_OPPORTUNITIES_7D"], 1)
        self.assertTrue(any("SCORE" in p for p in priorities(self.con)))
        before = self.con.execute("SELECT COUNT(*) FROM marketplace_opportunities").fetchone()[0]
        r = audit(self.con)
        self.assertTrue(r["findings"])
        self.assertEqual(self.con.execute("SELECT COUNT(*) FROM marketplace_opportunities").fetchone()[0], before)

    def test_research_reports_low_confidence(self):
        biz.add_opportunity(self.con, JOB)
        r = biz.research_report(self.con)
        self.assertEqual(r["opportunities"][0]["sample_size"], 1)
        self.assertIn("LOW", r["opportunities"][0]["confidence"])

    def test_n8n_migration_plan(self):
        for _ in range(3):
            self.con.execute("INSERT INTO automation_runs(name,engine,status,started_at) VALUES ('daily report','n8n','COMPLETED',?)", (core.now(),))
        self.con.execute("INSERT INTO automation_runs(name,engine,status,started_at) VALUES ('form webhook','n8n','COMPLETED',?)", (core.now(),))
        self.con.commit()
        r = n8n_report(self.con)
        self.assertEqual(r["executions_this_month"], 4)
        recs = {p["workflow"]: p["recommend"] for p in r["migration_plan"]}
        self.assertIn("MOVE LOCAL", recs["daily report"])
        self.assertIn("keep", recs["form webhook"])

    def test_n8n_exhausted_is_blocker(self):
        from bos.__main__ import blockers
        self.assertFalse(n8n_report(self.con)["exhausted"])
        biz.add_metric(self.con, "n8n", "executions_remaining", 0)
        self.assertTrue(n8n_report(self.con)["exhausted"])
        self.assertTrue(any("n8n: out of executions" in b for b in blockers(self.con)))

    def test_optimize_shape(self):
        self.assertEqual({"KEEP", "IMPROVE", "REMOVE", "TEST", "note"}, set(optimize(self.con)))

    def test_fiverr_gig_needs_approval(self):
        g = biz.fiverr_gig(self.con, "n8n")
        self.assertLessEqual(len(g["title"]), 80)
        self.assertEqual(len(g["packages"]), 3)
        self.assertLessEqual(len(g["tags"]), 5)
        self.assertEqual(self.con.execute("SELECT status FROM tasks WHERE id=?", (g["approval_task"],)).fetchone()[0], "REVIEW_REQUIRED")
        self.assertEqual(biz.fiverr_gig(self.con, "n8n")["approval_task"], g["approval_task"])


class TestCLI(Base):
    def test_end_to_end(self):
        jobs = os.path.join(self.tmp.name, "jobs.json")
        with open(jobs, "w") as f:
            json.dump([JOB, JOB, {"platform": "upwork", "title": ""}], f)
        rc, o = self.cli("opp", "import", jobs)
        self.assertEqual(json.loads(o), {"added": 1, "dupes": 1, "errors": ["#2: title required"]})
        rc, o = self.cli("run")  # queue: score -> draft proposal
        self.assertEqual(rc, 0)
        self.assertEqual(self.con.execute("SELECT status FROM proposals").fetchone()[0], "REVIEW_REQUIRED")
        rc, o = self.cli("review")
        self.assertIn("submit_upwork_proposal", o)
        tid = self.con.execute("SELECT id FROM tasks WHERE type='approval'").fetchone()[0]
        rc, o = self.cli("approve", str(tid))
        self.assertIn("manage_proposals", o)
        rc, o = self.cli("opp", "submitted", "1", "--connects", "10")
        self.assertEqual(self.con.execute("SELECT amount FROM financial_transactions WHERE kind='connects'").fetchone()[0], 1.5)
        rc, o = self.cli("daily")
        self.assertIn("TODAY'S PRIORITIES", o)
        rc, o = self.cli("ask", "Find me 10 good Upwork opportunities for n8n")
        self.assertIn("opp import", o)

    def test_blocked_exit_code(self):
        _, pid = biz.intake(self.con, {"name": "X"}, {"service": "microbuild"})
        self.con.execute("UPDATE projects SET playbook_step=7 WHERE id=?", (pid,))
        self.con.commit()
        rc, o = self.cli("advance", str(pid))
        self.assertEqual(rc, 3)
        self.assertIn("BLOCKED", o)


if __name__ == "__main__":
    unittest.main()
