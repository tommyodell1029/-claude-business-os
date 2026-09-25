"""Orchestrator / command center.  Usage: python -m bos <command> [...]   (python -m bos help)"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import biz
from .core import (ROOT, ApprovalRequired, _SECRET_PATTERNS, config, connect, decide, enqueue, jl, log,
                   now, recover_stale, secret, ts, validate_config, work)

# ------------------------------------------------------------------ output helpers

def out(x) -> None:
    if isinstance(x, (dict, list)):
        print(json.dumps(x, indent=1, default=str))
    else:
        print(x)


def table(rows, cols: list[str], width: int = 48) -> None:
    rows = [dict(r) for r in rows]
    if not rows:
        print("(none)")
        return
    ws = {c: min(width, max(len(c), *(len(str(r.get(c) if r.get(c) is not None else "")) for r in rows))) for c in cols}
    print("  ".join(c.upper().ljust(ws[c]) for c in cols))
    for r in rows:
        print("  ".join(str(r.get(c) if r.get(c) is not None else "")[:ws[c]].ljust(ws[c]) for c in cols))


def _since(days: int) -> str:
    return ts(datetime.now(timezone.utc) - timedelta(days=days))

# ------------------------------------------------------------------ dashboard / daily operator

def dashboard(con) -> dict:
    q = lambda sql, *a: con.execute(sql, a).fetchone()[0]  # noqa: E731
    month = now()[:7]
    fin = biz.finance(con, since=month + "-01")
    d = {
        "REVENUE_MTD": fin["gross_revenue"], "COSTS_MTD": fin["total_cost"], "PROFIT_MTD": fin["net_profit"],
        "MRR": fin["mrr"],
        "NEW_OPPORTUNITIES_7D": q("SELECT COUNT(*) FROM marketplace_opportunities WHERE discovered_at>=?", _since(7)),
        "HIGH_FIT_JOBS": q("SELECT COUNT(*) FROM marketplace_opportunities WHERE status IN ('QUALIFIED','PROPOSAL_DRAFTED','REVIEW_REQUIRED')"),
        "PROPOSALS_READY": q("SELECT COUNT(*) FROM proposals WHERE status='REVIEW_REQUIRED'"),
        "APPROVALS_WAITING": q("SELECT COUNT(*) FROM tasks WHERE status='REVIEW_REQUIRED'"),
        "LEADS": q("SELECT COUNT(*) FROM leads WHERE suppressed=0"),
        "LEADS_QUALIFIED_NO_OUTREACH": q("SELECT COUNT(*) FROM leads WHERE status='QUALIFIED' AND suppressed=0"),
        "FOLLOW_UPS_DUE": len(biz.due_followups(con)),
        "CLIENT_WORK_OPEN": q("SELECT COUNT(*) FROM projects WHERE fulfillment_status!='COMPLETED'"),
        "TASKS_QUEUED": q("SELECT COUNT(*) FROM tasks WHERE status='QUEUED'"),
        "BLOCKERS": blockers(con),
    }
    return d


def blockers(con) -> list[str]:
    b = [f"config: {e}" for e in validate_config(config())]
    n = con.execute("SELECT COUNT(*) FROM tasks WHERE status='FAILED'").fetchone()[0]
    if n:
        b.append(f"{n} failed task(s) — run: tasks FAILED")
    if not config()["business"].get("postal_address"):
        b.append("business.postal_address empty — cold email cannot be sent (CAN-SPAM)")
    for mp, m in config()["marketplaces"].items():
        if m.get("enabled") and m.get("integration") == "manual":
            b.append(f"{mp}: no official connector attached — jobs/metrics must be pasted in (opp add / metric)")
    if n8n_report(con)["exhausted"]:
        b.append("n8n: out of executions — run/test locally or self-hosted; cloud workflows paused until reset/upgrade")
    return b


def priorities(con) -> list[str]:
    p = []
    ap = con.execute("SELECT id, description FROM tasks WHERE status='REVIEW_REQUIRED' ORDER BY priority, id LIMIT 5").fetchall()
    for a in ap:
        p.append(f"APPROVE/REJECT #{a['id']}: {a['description']}")
    for pr in con.execute("SELECT id, service, deadline, playbook_step FROM projects WHERE fulfillment_status!='COMPLETED' "
                          "ORDER BY COALESCE(deadline,'9999') LIMIT 5"):
        p.append(f"FULFILL project #{pr['id']} ({pr['service']}) due {pr['deadline'] or '?'} — step {pr['playbook_step'] + 1}")
    for f in biz.due_followups(con)[:5]:
        p.append(f"SEND follow-up outreach #{f['id']} ({f['step']}) to {f['business']}")
    n = con.execute("SELECT COUNT(*) FROM marketplace_opportunities WHERE status='QUALIFIED'").fetchone()[0]
    if n:
        p.append(f"DRAFT proposals for {n} qualified opportunities: propose qualified")
    n = con.execute("SELECT COUNT(*) FROM marketplace_opportunities WHERE status='DISCOVERED'").fetchone()[0]
    if n:
        p.append(f"SCORE {n} new opportunities: score all")
    n = con.execute("SELECT COUNT(*) FROM leads WHERE status='QUALIFIED' AND suppressed=0 AND email IS NOT NULL").fetchone()[0]
    if n:
        p.append(f"DRAFT outreach for {n} qualified leads with public email")
    if not con.execute("SELECT 1 FROM marketplace_opportunities WHERE discovered_at>=?", (_since(2),)).fetchone():
        p.append("FIND work: pull 10–20 fresh Upwork jobs for your top service and run: opp import <file.json>")
    if not con.execute("SELECT 1 FROM portfolio").fetchone():
        p.append("BUILD first portfolio demo (portfolio add) — proposals score higher with proof")
    return p

# ------------------------------------------------------------------ costs / n8n

def costs(con) -> dict:
    cfg = config()["costs"]
    month = now()[:7]
    rows = con.execute("SELECT kind, SUM(amount) s FROM financial_transactions WHERE kind!='revenue' AND date>=? "
                       "GROUP BY kind", (month + "-01",)).fetchall()
    tracked = {r["kind"]: round(r["s"], 2) for r in rows}
    subs = cfg.get("subscriptions", [])
    sub_total = sum(s.get("monthly", 0) for s in subs)
    flags = [f"subscription '{s['name']}' (${s['monthly']}/mo) marked not needed — cancel?" for s in subs if not s.get("needed", True)]
    total = sum(tracked.values())
    if total + sub_total > cfg["monthly_budget"]:
        flags.append(f"monthly costs ${total + sub_total:.2f} exceed budget ${cfg['monthly_budget']:.2f}")
    api_runs = con.execute("SELECT engine, COUNT(*) n, COALESCE(SUM(cost),0) c FROM automation_runs WHERE started_at>=? "
                           "GROUP BY engine", (month + "-01",)).fetchall()
    return {"month": month, "tracked_costs": tracked, "subscriptions_monthly": sub_total,
            "runs": {r["engine"]: {"runs": r["n"], "cost": round(r["c"], 4)} for r in api_runs}, "flags": flags,
            "rule": "Claude Code → local script → existing integration → n8n → paid service"}


def n8n_report(con) -> dict:
    cfg = config()["n8n"]
    month = now()[:7]
    rows = con.execute("SELECT name, COUNT(*) n, SUM(status='FAILED') f FROM automation_runs WHERE engine='n8n' "
                       "AND started_at>=? GROUP BY name ORDER BY n DESC", (month + "-01",)).fetchall()
    used = sum(r["n"] for r in rows)
    lim = cfg.get("plan_execution_limit") or 0
    pct = round(100 * used / lim, 1) if lim else 0
    plan = []
    for r in rows:
        needs_cloud = re.search(r"webhook|trigger|gmail|drive|form|inbound", r["name"], re.I)
        plan.append({"workflow": r["name"], "runs": r["n"], "failed": r["f"],
                     "recommend": "keep on n8n (external trigger)" if needs_cloud else "MOVE LOCAL: python -m bos task / cron via Claude Code"})
    rem = con.execute("SELECT value FROM metrics WHERE platform='n8n' AND metric='executions_remaining' "
                      "ORDER BY date DESC, id DESC LIMIT 1").fetchone()
    exhausted = rem is not None and rem["value"] <= 0  # reported by user/n8n UI; local runs don't see cloud quota
    return {"executions_this_month": used, "limit": lim or "unlimited", "used_pct": pct,
            "executions_remaining": rem["value"] if rem else "unknown", "exhausted": exhausted,
            "warning": exhausted or pct >= cfg.get("warn_pct", 80), "migration_plan": plan,
            "core_dependency": False, "note": "Business OS core runs without n8n."}

# ------------------------------------------------------------------ audit

EXPECTED_FILES = {"CLAUDE.md", "config.toml", "templates.toml", ".gitignore", "bos/__init__.py", "bos/__main__.py",
                  "bos/core.py", "bos/biz.py", "tests/test_bos.py"}


def audit(con) -> dict:
    findings: list[dict] = []

    def add(sev, area, msg, fix=""):
        findings.append({"sev": sev, "area": area, "issue": msg, "fix": fix})

    for e in validate_config(config()):
        add("HIGH", "config", e, "edit config.toml")
    n = recover_stale(con)
    if n:
        add("MED", "tasks", f"{n} stale RUNNING task(s) re-queued")
    for t in con.execute("SELECT id,type,error FROM tasks WHERE status='FAILED'"):
        add("HIGH", "tasks", f"task #{t['id']} {t['type']} failed: {(t['error'] or '')[:80]}", "inspect, fix, re-enqueue")
    old = con.execute("SELECT COUNT(*) FROM tasks WHERE status='REVIEW_REQUIRED' AND created<?", (_since(3),)).fetchone()[0]
    if old:
        add("MED", "approvals", f"{old} review item(s) older than 3 days", "run: review")
    for col in ("phone", "email", "website"):
        for d in con.execute(f"SELECT {col} v, COUNT(*) n FROM leads WHERE {col} IS NOT NULL GROUP BY {col} HAVING n>1"):
            add("MED", "leads", f"duplicate {col} {d['v']} on {d['n']} leads", "merge manually")
    st = con.execute("SELECT COUNT(*) FROM marketplace_opportunities WHERE status IN ('DISCOVERED','QUALIFIED') "
                     "AND discovered_at<?", (_since(7),)).fetchone()[0]
    if st:
        add("LOW", "opportunities", f"{st} opportunities stale >7d", "cancel or act")
    if not config()["business"].get("postal_address"):
        add("MED", "compliance", "postal_address empty; cold email blocked", "set business.postal_address")
    for v in config()["env"]["optional"]:
        if not secret(v):
            add("INFO", "env", f"{v} not set (optional)")
    gi = (ROOT / ".gitignore").read_text() if (ROOT / ".gitignore").exists() else ""
    for must in ("data/", ".env"):
        if must not in gi:
            add("HIGH", "security", f".gitignore missing {must}", f"add {must}")
    try:
        files = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, timeout=10).stdout.split()
    except Exception:  # noqa: BLE001
        files = []
    for f in files:
        p = ROOT / f
        if p.suffix in (".py", ".toml", ".md", ".json", ".txt", ".csv", ".env", "") and p.is_file():
            txt = p.read_text(errors="ignore")
            for pat in _SECRET_PATTERNS:
                if pat.search(txt) and "_SECRET_PATTERNS" not in txt and f != "tests/test_bos.py":
                    add("HIGH", "security", f"possible secret in tracked file {f}", "remove + rotate key")
                    break
        if p.is_file() and p.stat().st_size == 0:
            add("LOW", "files", f"empty file {f}", "delete if unneeded")
    extra = sorted(set(files) - EXPECTED_FILES)
    if extra:
        add("INFO", "files", f"files beyond core set: {', '.join(extra[:10])}", "confirm each is necessary")
    dbp = Path(os.environ.get("BOS_DB") or ROOT / config()["paths"]["db"])
    if dbp.exists() and dbp.stat().st_mode & 0o004:
        add("MED", "security", "DB is world-readable", f"chmod 600 {dbp}")
    nr = n8n_report(con)
    if nr["warning"]:
        add("MED", "n8n", f"n8n at {nr['used_pct']}% of plan", "see: n8n (migration plan)")
    for mp, m in config()["marketplaces"].items():
        add("INFO", "marketplace", f"{mp}: integration={m.get('integration')} auto_submit={m.get('auto_submit')}")
    for c in costs(con)["flags"]:
        add("MED", "costs", c)
    add("INFO", "deps", "runtime deps: python stdlib only (sqlite3, tomllib)")
    log(con, "audit", "system", None, {"findings": len(findings)})
    order = {"HIGH": 0, "MED": 1, "LOW": 2, "INFO": 3}
    return {"findings": sorted(findings, key=lambda f: order[f["sev"]]), "deleted": "nothing (audit never deletes)"}

# ------------------------------------------------------------------ weekly optimize

def optimize(con, days: int = 7) -> dict:
    since = _since(days)
    fin = biz.finance(con)["by_service"]
    res = {"KEEP": [], "IMPROVE": [], "REMOVE": [], "TEST": []}
    for code in config()["services"]:
        sub = con.execute("SELECT COUNT(*) n, SUM(status='WON') w, AVG(match_score) s FROM marketplace_opportunities "
                          "WHERE recommended_service=? AND submitted_at IS NOT NULL", (code,)).fetchone()
        seen = con.execute("SELECT COUNT(*) FROM marketplace_opportunities WHERE recommended_service=? AND discovered_at>=?",
                           (code, since)).fetchone()[0]
        f = fin.get(code, {})
        n, w = sub["n"] or 0, sub["w"] or 0
        if f.get("revenue") and (f.get("margin_pct") or 0) >= 50:
            res["KEEP"].append(f"{code}: ${f['revenue']:.0f} revenue at {f['margin_pct']}% margin")
        if n >= 5 and w == 0:
            res["IMPROVE"].append(f"{code}: {n} proposals, 0 wins — tighten targeting (min score) and proposal openings")
        if n >= 5 and w / n >= 0.4:
            res["TEST"].append(f"{code}: {w}/{n} win rate — test +20% pricing")
        if seen == 0:
            res["TEST"].append(f"{code}: no opportunities collected in {days}d — search/research this niche or deprioritize")
        if f.get("revenue") and (f.get("margin_pct") or 0) < 20:
            res["IMPROVE"].append(f"{code}: margin {f['margin_pct']}% — raise price or template the fulfillment")
    for s in config()["costs"].get("subscriptions", []):
        if not s.get("needed", True):
            res["REMOVE"].append(f"subscription {s['name']} (${s['monthly']}/mo)")
    top = con.execute("SELECT action, COUNT(*) n FROM audit_logs WHERE ts>=? AND actor='user' GROUP BY action "
                      "ORDER BY n DESC LIMIT 3", (since,)).fetchall()
    for t in top:
        if t["n"] >= 10:
            res["TEST"].append(f"automate '{t['action']}' ({t['n']} manual actions in {days}d)")
    res["note"] = "Recommendations only. No marketplace/account change happens without approval."
    return res

# ------------------------------------------------------------------ natural-language router

ROUTES = [
    (r"upwork|job", "Search Upwork (official connector if attached; otherwise paste listings) → save as JSON list → "
                    "`opp import jobs.json` → `score all` → `propose qualified` → `review`"),
    (r"fiverr|gig", "`fiverr <service>` drafts gig (title/packages/FAQ/tags) → approval task; publish manually after approve"),
    (r"research|demand|requested|trend", "Collect listings (web search / pasted) → `opp import` → `research [service]`"),
    (r"lead|business(es)? that|receptionist|prospect", "Gather businesses from permitted sources → CSV → `leads import f.csv --niche X --location Y` → `leads list` → `outreach draft <lead>`"),
    (r"proposal", "`propose qualified` → `review` → edit with `proposal edit ID FILE` → `approve TASK`"),
    (r"approv|waiting|review", "`review`"),
    (r"demo|portfolio", "Build demo with Claude Code (label DEMO) → `portfolio add '{json}'`"),
    (r"fulfil|client|order", "`intake '{json}'` → `advance PROJECT` through the playbook"),
    (r"today|priorit|work on", "`daily`"),
    (r"money|revenue|profit|made", "`finance --days 7`"),
    (r"automate next|optimi", "`optimize` + `audit`"),
    (r"cost|spend", "`costs`"),
]


def ask(text: str) -> list[str]:
    t = text.lower()
    return [r for pat, r in ROUTES if re.search(pat, t)] or ["No route matched — try: help"]

# ------------------------------------------------------------------ CLI

def _json_arg(s: str):
    if s.startswith("@"):
        return json.loads(Path(s[1:]).read_text())
    return json.loads(s)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="bos", description="AI Business OS command center")
    sp = ap.add_subparsers(dest="cmd")
    for c in ("status", "daily", "review", "costs", "n8n", "audit", "analytics", "help", "init"):
        sp.add_parser(c)
    x = sp.add_parser("tasks"); x.add_argument("status", nargs="?")
    x = sp.add_parser("run"); x.add_argument("--limit", type=int, default=50)
    x = sp.add_parser("approve"); x.add_argument("id", type=int); x.add_argument("note", nargs="?", default="")
    x = sp.add_parser("reject"); x.add_argument("id", type=int); x.add_argument("note", nargs="?", default="")
    x = sp.add_parser("opp"); x.add_argument("action", choices=["add", "import", "list", "show", "submitted", "set"])
    x.add_argument("arg", nargs="?"); x.add_argument("value", nargs="?")
    x.add_argument("--status"); x.add_argument("--connects", type=int); x.add_argument("--response")
    x = sp.add_parser("score"); x.add_argument("target")
    x = sp.add_parser("propose"); x.add_argument("target")
    x = sp.add_parser("proposal"); x.add_argument("action", choices=["show", "edit", "submit"]); x.add_argument("id", type=int)
    x.add_argument("file", nargs="?")
    x = sp.add_parser("leads"); x.add_argument("action", choices=["import", "add", "list", "show"]); x.add_argument("arg", nargs="?")
    x.add_argument("--niche"); x.add_argument("--location"); x.add_argument("--source", default="csv_import")
    x = sp.add_parser("outreach"); x.add_argument("action", choices=["draft", "due", "show", "send", "mark"])
    x.add_argument("id", nargs="?", type=int); x.add_argument("event", nargs="?")
    x = sp.add_parser("intake"); x.add_argument("json")
    x = sp.add_parser("projects")
    x = sp.add_parser("advance"); x.add_argument("id", type=int)
    x = sp.add_parser("portfolio"); x.add_argument("action", choices=["add", "list"]); x.add_argument("json", nargs="?")
    x = sp.add_parser("txn"); x.add_argument("kind"); x.add_argument("amount", type=float)
    x.add_argument("--service"); x.add_argument("--project", type=int); x.add_argument("--platform"); x.add_argument("--memo")
    x.add_argument("--date"); x.add_argument("--no-fee", action="store_true")
    x = sp.add_parser("finance"); x.add_argument("--days", type=int)
    x = sp.add_parser("recurring"); x.add_argument("id", nargs="?", type=int); x.add_argument("status", nargs="?")
    x = sp.add_parser("metric"); x.add_argument("platform"); x.add_argument("name"); x.add_argument("value", type=float)
    x.add_argument("--date")
    x = sp.add_parser("research"); x.add_argument("service", nargs="?")
    x = sp.add_parser("fiverr"); x.add_argument("service")
    x = sp.add_parser("templates"); x.add_argument("q", nargs="?", default="")
    x = sp.add_parser("optimize"); x.add_argument("--days", type=int, default=7)
    x = sp.add_parser("n8n-record"); x.add_argument("workflow"); x.add_argument("--count", type=int, default=1)
    x.add_argument("--failed", action="store_true")
    x = sp.add_parser("ask"); x.add_argument("text", nargs="+")
    a = ap.parse_args(argv)
    if not a.cmd or a.cmd == "help":
        ap.print_help()
        return 0
    con = connect()
    try:
        return _dispatch(con, a)
    except ApprovalRequired as e:
        print(f"BLOCKED: {e}. Approve with: python -m bos approve {e.task_id}")
        return 3
    except (ValueError, KeyError, FileNotFoundError) as e:
        print(f"ERROR: {e}")
        return 2
    finally:
        con.close()


def _dispatch(con, a) -> int:  # noqa: C901 — flat command switch is the clearest form here
    c = a.cmd
    if c == "init":
        out({"db": str(con.execute("PRAGMA database_list").fetchone()["file"]), "schema": con.execute("PRAGMA user_version").fetchone()[0],
             "config_errors": validate_config(config())})
    elif c in ("status", "daily"):
        d = dashboard(con)
        print("== COMMAND CENTER ==")
        for k, v in d.items():
            if k != "BLOCKERS":
                print(f"{k:30} {v}")
        print("BLOCKERS:" + ("".join(f"\n  - {b}" for b in d["BLOCKERS"]) or " none"))
        if c == "daily":
            print("\n== TODAY'S PRIORITIES ==")
            for i, p in enumerate(priorities(con), 1):
                print(f"{i}. {p}")
    elif c == "tasks":
        rows = con.execute("SELECT id,type,priority,status,retry_count,description,error FROM tasks "
                           + ("WHERE status=? " if a.status else "") + "ORDER BY id DESC LIMIT 50",
                           (a.status.upper(),) if a.status else ()).fetchall()
        table(rows, ["id", "type", "priority", "status", "retry_count", "description", "error"], 40)
    elif c == "run":
        out(work(con, a.limit))
    elif c == "review":
        print("== WAITING FOR APPROVAL ==")
        table(con.execute("SELECT id, json_extract(input,'$.action') action, description FROM tasks "
                          "WHERE status='REVIEW_REQUIRED' ORDER BY priority,id").fetchall(), ["id", "action", "description"], 90)
        rows = con.execute("SELECT p.id, p.opportunity_id opp, p.price, o.match_score score, o.est_profit profit, p.lint, o.title "
                           "FROM proposals p JOIN marketplace_opportunities o ON o.id=p.opportunity_id "
                           "WHERE p.status='REVIEW_REQUIRED' ORDER BY o.match_score DESC").fetchall()
        print("\n== PROPOSALS (proposal show ID) ==")
        table(rows, ["id", "opp", "score", "price", "profit", "title", "lint"], 50)
    elif c in ("approve", "reject"):
        inp = decide(con, a.id, c == "approve", a.note)
        if c == "approve" and inp.get("entity") == "proposal":
            out(biz.submit_proposal(con, inp["entity_id"]))
        elif c == "reject" and inp.get("entity") == "proposal":
            with con:
                con.execute("UPDATE proposals SET status='REJECTED' WHERE id=?", (inp["entity_id"],))
            print(f"proposal #{inp['entity_id']} rejected; edit + re-draft if needed")
        else:
            print(f"DONE: task #{a.id} {'approved' if c == 'approve' else 'rejected'}; re-run the blocked command")
        con.execute("UPDATE tasks SET status='QUEUED' WHERE status='WAITING' AND json_extract(output,'$.approval_task')=?", (a.id,))
        con.commit()
    elif c == "opp":
        if a.action == "add":
            oid, new = biz.add_opportunity(con, _json_arg(a.arg))
            enqueue(con, "score_opportunity", {"id": oid}, priority=4) if new else None
            print(f"opportunity #{oid} {'added + queued for scoring' if new else 'already exists'}")
        elif a.action == "import":
            data = _json_arg("@" + a.arg if not a.arg.startswith("@") else a.arg)
            res = {"added": 0, "dupes": 0, "errors": []}
            for i, d in enumerate(data if isinstance(data, list) else [data]):
                try:
                    oid, new = biz.add_opportunity(con, d)
                    res["added" if new else "dupes"] += 1
                    enqueue(con, "score_opportunity", {"id": oid}, priority=4) if new else None
                except ValueError as e:
                    res["errors"].append(f"#{i}: {e}")
            out(res)
        elif a.action == "list":
            rows = con.execute("SELECT id,platform,status,match_score score,recommended_service svc,recommended_price price,"
                               "est_profit profit,title FROM marketplace_opportunities "
                               + ("WHERE status=? " if a.status else "") + "ORDER BY COALESCE(match_score,0) DESC, id DESC LIMIT 50",
                               (a.status.upper(),) if a.status else ()).fetchall()
            table(rows, ["id", "platform", "status", "score", "svc", "price", "profit", "title"], 50)
        elif a.action == "show":
            r = dict(con.execute("SELECT * FROM marketplace_opportunities WHERE id=?", (int(a.arg),)).fetchone())
            r["score_breakdown"] = jl(r["score_breakdown"])
            out(r)
        elif a.action == "submitted":
            oid = int(a.arg)
            o = con.execute("SELECT status, platform FROM marketplace_opportunities WHERE id=?", (oid,)).fetchone()
            if o["status"] != "APPROVED":
                raise ValueError(f"opportunity #{oid} is {o['status']}; only APPROVED proposals can be marked submitted")
            biz.set_opp_status(con, oid, "SUBMITTED", submitted_at=now(),
                               **({"connects": a.connects} if a.connects is not None else {}))
            con.execute("UPDATE proposals SET status='SUBMITTED' WHERE opportunity_id=? AND status='APPROVED'", (oid,))
            con.commit()
            n = a.connects if a.connects is not None else (config()["marketplaces"][o["platform"]].get("default_connects") if o["platform"] == "upwork" else 0)
            if n:
                biz.add_txn(con, "connects", round(n * config()["marketplaces"]["upwork"]["connect_price"], 2),
                            platform="upwork", memo=f"{n} connects opp #{oid}")
            print(f"DONE: #{oid} SUBMITTED")
        elif a.action == "set":
            kw = {"response": a.response} if a.response else {}
            if a.value.upper() in ("WON", "LOST", "CANCELLED"):
                kw["result"] = a.value.upper()
            biz.set_opp_status(con, int(a.arg), a.value.upper(), **kw)
            print("DONE")
    elif c == "score":
        ids = [r["id"] for r in con.execute("SELECT id FROM marketplace_opportunities WHERE status='DISCOVERED'")] \
            if a.target == "all" else [int(a.target)]
        res = [dict(id=i, **{k: v for k, v in biz.analyze(con, i).items() if k in ("score", "qualified", "service", "price", "profit")}) for i in ids]
        con.executemany("UPDATE tasks SET status='CANCELLED', output='\"done inline\"' WHERE type='score_opportunity' "
                        "AND status='QUEUED' AND json_extract(input,'$.id')=?", [(i,) for i in ids])
        con.commit()
        table(res, ["id", "score", "qualified", "service", "price", "profit"])
    elif c == "propose":
        ids = [r["id"] for r in con.execute("SELECT id FROM marketplace_opportunities WHERE status='QUALIFIED' ORDER BY match_score DESC")] \
            if a.target == "qualified" else [int(a.target)]
        for i in ids:
            pid = biz.draft_proposal(con, i)
            lint = jl(con.execute("SELECT lint FROM proposals WHERE id=?", (pid,)).fetchone()["lint"], [])
            print(f"proposal #{pid} for opp #{i} → REVIEW_REQUIRED" + (f"  LINT: {lint}" if lint else ""))
    elif c == "proposal":
        p = con.execute("SELECT p.*, o.title, o.url FROM proposals p JOIN marketplace_opportunities o ON o.id=p.opportunity_id "
                        "WHERE p.id=?", (a.id,)).fetchone()
        if a.action == "show":
            print(f"# proposal {p['id']} [{p['status']}] opp #{p['opportunity_id']} {p['title']}\n{p['url'] or ''}\n")
            print(p["body"])
            print(f"\nLINT: {jl(p['lint'], []) or 'clean'}")
        elif a.action == "edit":
            issues = biz.edit_proposal(con, a.id, Path(a.file).read_text())
            print(f"saved; LINT: {issues or 'clean'}")
        elif a.action == "submit":
            out(biz.submit_proposal(con, a.id))
    elif c == "leads":
        if a.action == "import":
            out(biz.import_leads_csv(con, a.arg, a.source, a.niche, a.location))
        elif a.action == "add":
            lid, new = biz.add_lead(con, _json_arg(a.arg))
            print(f"lead #{lid} {'added' if new else 'merged into existing'}")
        elif a.action == "list":
            table(con.execute("SELECT id,business,score,status,recommended_service svc,email,phone,problem FROM leads "
                              "WHERE suppressed=0 ORDER BY score DESC LIMIT 50").fetchall(),
                  ["id", "business", "score", "status", "svc", "email", "phone", "problem"], 32)
        elif a.action == "show":
            out(dict(con.execute("SELECT * FROM leads WHERE id=?", (int(a.arg),)).fetchone()))
    elif c == "outreach":
        if a.action == "draft":
            print(f"drafted outreach ids {biz.draft_sequence(con, a.id)} (status DRAFT; nothing sent)")
        elif a.action == "due":
            table(biz.due_followups(con), ["id", "lead_id", "business", "step", "due_at", "subject"])
        elif a.action == "show":
            o = con.execute("SELECT * FROM outreach WHERE id=?", (a.id,)).fetchone()
            print(f"[{o['step']} {o['status']} due {o['due_at']}]\nSubject: {o['subject']}\n\n{o['body']}")
        elif a.action == "send":
            m = biz.outreach_send_check(con, a.id)
            out(m | {"next": f"Send (or create Gmail draft), then: outreach mark {a.id} SENT"})
        elif a.action == "mark":
            biz.mark_outreach(con, a.id, a.event)
            print("DONE")
    elif c == "intake":
        d = _json_arg(a.json)
        out(dict(zip(("client_id", "project_id"), biz.intake(con, d["client"], d["project"]))))
    elif c == "projects":
        table(con.execute("SELECT p.id, c.name client, p.service, p.price, p.deadline, p.playbook_step step, "
                          "p.fulfillment_status status, p.payment_status pay FROM projects p JOIN clients c ON c.id=p.client_id "
                          "ORDER BY p.id DESC").fetchall(), ["id", "client", "service", "price", "deadline", "step", "status", "pay"])
    elif c == "advance":
        out(biz.advance(con, a.id))
    elif c == "portfolio":
        if a.action == "add":
            print(f"portfolio #{biz.add_portfolio(con, _json_arg(a.json))}")
        else:
            table(con.execute("SELECT id,kind,service,title,url FROM portfolio ORDER BY id DESC").fetchall(),
                  ["id", "kind", "service", "title", "url"])
    elif c == "txn":
        print(f"txn #{biz.add_txn(con, a.kind, a.amount, a.service, a.project, a.platform, a.memo, a.date, not a.no_fee)}")
    elif c == "finance":
        out(biz.finance(con, since=_since(a.days)[:10] if a.days else None))
    elif c == "recurring":
        if a.id:
            con.execute("UPDATE recurring_revenue SET status=?, started_at=CASE WHEN ?='ACTIVE' THEN ? ELSE started_at END, "
                        "ended_at=CASE WHEN ?='ENDED' THEN ? ELSE ended_at END WHERE id=?",
                        (a.status.upper(), a.status.upper(), now(), a.status.upper(), now(), a.id))
            con.commit()
        table(con.execute("SELECT * FROM recurring_revenue ORDER BY id DESC").fetchall(),
              ["id", "client_id", "service", "description", "monthly_amount", "status"])
    elif c == "metric":
        biz.add_metric(con, a.platform, a.name, a.value, a.date)
        print("DONE")
    elif c == "analytics":
        out(biz.analytics(con))
    elif c == "research":
        out(biz.research_report(con, a.service))
    elif c == "fiverr":
        out(biz.fiverr_gig(con, a.service))
    elif c == "templates":
        table(biz.search_templates(con, a.q), ["id", "kind", "name", "tags", "uses"])
    elif c == "costs":
        out(costs(con))
    elif c == "n8n":
        out(n8n_report(con))
    elif c == "n8n-record":
        with con:
            for _ in range(a.count):
                con.execute("INSERT INTO automation_runs(name,engine,status,started_at,finished_at) VALUES (?,?,?,?,?)",
                            (a.workflow, "n8n", "FAILED" if a.failed else "COMPLETED", now(), now()))
        print("DONE")
    elif c == "audit":
        r = audit(con)
        table(r["findings"], ["sev", "area", "issue", "fix"], 70)
    elif c == "optimize":
        out(optimize(con, a.days))
    elif c == "ask":
        for s in ask(" ".join(a.text)):
            print("- " + s)
    return 0


if __name__ == "__main__":
    sys.exit(main())
