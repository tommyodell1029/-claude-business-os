"""Business engines: opportunities, scoring, proposals, leads, outreach, clients/fulfillment,
portfolio, finance, analytics, research, Fiverr drafting. All local; no paid APIs."""
from __future__ import annotations

import csv
import re
import string
from datetime import datetime, timedelta, timezone

from .core import (config, enqueue, gate, handler, jd, jl, log, now,
                   request_approval, ts)

OPP_STATUSES = ("DISCOVERED", "ANALYZING", "QUALIFIED", "PROPOSAL_DRAFTED", "REVIEW_REQUIRED",
                "APPROVED", "SUBMITTED", "RESPONSE_RECEIVED", "NEGOTIATING", "WON", "LOST", "CANCELLED")
OUTREACH_EVENTS = ("SENT", "OPENED", "REPLIED", "POSITIVE", "NEGATIVE", "BOUNCED", "NO_RESPONSE",
                   "MEETING", "WON", "LOST")
TIERS = ("basic", "standard", "premium")


class _SafeDict(dict):
    def __missing__(self, k):
        return "{" + k + "}"


def render(body: str, **kw) -> str:
    return string.Formatter().vformat(body, (), _SafeDict(kw))


def template(con, name: str) -> str | None:
    r = con.execute("SELECT body FROM templates WHERE name=?", (name,)).fetchone()
    if r:
        with con:
            con.execute("UPDATE templates SET uses=uses+1 WHERE name=?", (name,))
    return r["body"] if r else None


def search_templates(con, q: str) -> list:
    like = f"%{q}%"
    return con.execute("SELECT id,kind,name,tags,uses FROM templates WHERE name LIKE ? OR kind LIKE ? "
                       "OR tags LIKE ? OR body LIKE ? ORDER BY uses DESC", (like,) * 4).fetchall()

# ====================================================================== opportunities

def _text(o) -> str:
    skills = " ".join(jl(o["skills"], []) or [])
    return f"{o['title']} {o['description'] or ''} {skills}".lower()


def add_opportunity(con, d: dict) -> tuple[int, bool]:
    """Insert opportunity; dedupe on url or (platform, external_id). Returns (id, created)."""
    if "data" in d or ("job_type" in d and isinstance(d.get("client"), dict)):
        d = from_upwork(d)  # raw Upwork connector shape
    platform = (d.get("platform") or "").lower()
    if platform not in config()["marketplaces"]:
        raise ValueError(f"unknown platform '{platform}' (add it under [marketplaces] in config.toml)")
    if not d.get("title"):
        raise ValueError("title required")
    url = d.get("url") or None
    ext = d.get("external_id") or None
    row = con.execute("SELECT id FROM marketplace_opportunities WHERE (url IS NOT NULL AND url=?) "
                      "OR (external_id IS NOT NULL AND platform=? AND external_id=?)",
                      (url, platform, ext)).fetchone()
    if row:
        return row["id"], False
    skills = d.get("skills") or []
    if isinstance(skills, str):
        skills = [s.strip() for s in skills.split(",") if s.strip()]
    with con:
        cur = con.execute(
            "INSERT INTO marketplace_opportunities(platform,external_id,url,client,client_info,title,"
            "description,budget_min,budget_max,budget_type,skills,requirements,connects,status,"
            "discovered_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'DISCOVERED',?,?)",
            (platform, ext, url, d.get("client"), jd(d.get("client_info") or {}), d["title"],
             d.get("description", ""), _num(d.get("budget_min")), _num(d.get("budget_max") or d.get("budget")),
             d.get("budget_type", "fixed"), jd(skills), d.get("requirements", ""),
             d.get("connects"), now(), now()))
    log(con, "opportunity_added", "opportunity", cur.lastrowid, {"platform": platform, "title": d["title"]})
    return cur.lastrowid, True


def _num(x):
    if x in (None, ""):
        return None
    if isinstance(x, (int, float)):
        return float(x)
    m = re.search(r"[\d,.]+", str(x))
    return float(m.group().replace(",", "")) if m else None


def set_opp_status(con, oid: int, status: str, **fields) -> None:
    if status not in OPP_STATUSES:
        raise ValueError(f"bad status {status}")
    sets = ", ".join(f"{k}=?" for k in fields)
    with con:
        con.execute(f"UPDATE marketplace_opportunities SET status=?, updated_at=?{', ' + sets if sets else ''} "
                    "WHERE id=?", (status, now(), *fields.values(), oid))
    log(con, f"opp_{status.lower()}", "opportunity", oid, fields)

# ---------------------------------------------------------------------- scoring

COMPLEX_WORDS = ["complex", "enterprise", "scalable", "migration", "full-stack", "full stack",
                 "mobile app", "machine learning", "real-time", "realtime", "blockchain", "saas platform",
                 "multi-tenant", "kubernetes", "hipaa", "from scratch"]
VAGUE_WORDS = ["etc", "tbd", "like uber", "like airbnb", "simple app", "quick job", "easy task"]
# Reputation/ToS risks: never bid regardless of score.
RED_FLAGS = ["unwatermarked", "avoid ai detection", "undetectable ai", "bypass captcha", "fake review",
             "write reviews", "outside upwork", "pay outside", "telegram only", "crypto wallet"]
RECURRING_WORDS = ["ongoing", "maintenance", "long-term", "long term", "monthly", "retainer", "support",
                   "continued", "future projects"]


def match_service(text: str) -> tuple[str, list[str]]:
    best, hits_best = None, []
    for code, s in config()["services"].items():
        hits = [k for k in s["keywords"] if re.search(r"(?<![a-z])" + re.escape(k) + r"(?![a-z])", text)]
        if len(hits) > len(hits_best):
            best, hits_best = code, hits
    return best or "microbuild", hits_best


def price_plan(service: str, budget: float | None) -> tuple[str, float, float]:
    """Pick (tier, price, est_hours) from config pricing and client budget."""
    s = config()["services"][service]
    p, h = s["prices"], s["hours"]
    if budget is None:
        return "standard", float(p[1]), float(h[1])
    if budget > p[2] * 1.25:  # clearly bigger scope than premium: scale hours with price
        return "premium+", float(budget), round(h[2] * budget / p[2], 1)
    i = max([i for i in range(3) if p[i] <= budget] or [0])
    return TIERS[i], float(p[i]), float(h[i])


def platform_cost(platform: str, price: float, connects: int | None) -> float:
    m = config()["marketplaces"][platform]
    cost = price * m.get("fee_pct", 0) / 100
    if platform == "upwork":
        cost += (connects if connects is not None else m.get("default_connects", 0)) * m.get("connect_price", 0)
    return round(cost, 2)


def connects_balance(con) -> float | None:
    r = con.execute("SELECT value FROM metrics WHERE platform='upwork' AND metric='connects_balance' "
                    "ORDER BY date DESC, id DESC LIMIT 1").fetchone()
    return r["value"] if r else None


def from_upwork(job: dict) -> dict:
    """Map an Upwork connector job (find_jobs search row or get response) to an opportunity dict."""
    if "data" in job:  # find_jobs action=get
        mp = job["data"]["marketplaceJobPosting"]
        rec = job.get("client_record") or {}
        terms = mp["contractTerms"]
        amt = ((terms.get("fixedPriceContractTerms") or {}).get("amount") or {}).get("rawValue")
        base = {"id": mp["id"], "title": mp["content"]["title"], "description": mp["content"]["description"],
                "url": mp.get("url") or job.get("url"), "budget": amt,
                "job_type": terms["contractType"].lower(), "skills": job.get("skills", []),
                "client": {"verification_status": job.get("client_verification", "VERIFIED"),
                           "rating": rec.get("feedback_score"), "total_spent": rec.get("spend_total"),
                           "country": mp.get("clientCompanyPublic", {}).get("country", {}).get("name")},
                "proposals_tier": job.get("proposals_tier")}
        extra = {"hire_rate": rec.get("hire_rate_percent"),
                 "total_hired": mp.get("activityStat", {}).get("jobActivity", {}).get("totalHired"),
                 "connects": job.get("connects_cost"), "screening_questions": job.get("screening_questions")}
    else:  # search row, optionally enriched with fields from a get call
        base = job
        extra = {"hire_rate": job.get("hire_rate_percent"), "total_hired": job.get("total_hired"),
                 "connects": job.get("connects_cost"), "screening_questions": job.get("screening_questions")}
    c = base.get("client") or {}
    strip = lambda t: re.sub(r"</?untrusted_participant_content>", "", t or "").strip()  # noqa: E731
    # "client" stays None: Upwork rows carry no contact name, and we never guess one
    return {
        "platform": "upwork", "external_id": str(base["id"]), "url": (base.get("url") or "").split("?")[0] or None,
        "client": None, "title": strip(base["title"]), "description": strip(base.get("description")),
        "budget": base.get("budget"), "budget_type": base.get("job_type", "fixed"), "skills": base.get("skills", []),
        "connects": extra.get("connects") or job.get("connects"),
        "client_info": {k: v for k, v in {
            "payment_verified": c.get("verification_status") == "VERIFIED", "rating": c.get("rating"),
            "country": c.get("country"),
            "total_spent": _num(c.get("total_spent")), "hire_rate": extra.get("hire_rate"),
            "proposals_tier": base.get("proposals_tier"), "total_hired": extra.get("total_hired"),
            "screening_questions": [strip(q) for q in extra.get("screening_questions") or []] or None,
        }.items() if v is not None},
    }


def portfolio_for(con, service: str) -> list:
    return con.execute("SELECT * FROM portfolio WHERE service=? ORDER BY CASE kind WHEN 'PAID_CLIENT_WORK' "
                       "THEN 0 WHEN 'CASE_STUDY' THEN 1 ELSE 2 END, id DESC", (service,)).fetchall()


def score(o, con=None) -> dict:
    """Deterministic internal prioritization score 0–100. NOT a prediction of winning."""
    cfg = config()
    w = cfg["scoring"]["weights"]
    text = _text(o)
    service, hits = match_service(text)
    budget = o["budget_max"] or o["budget_min"]
    if budget and o["budget_type"] == "hourly":
        budget = budget * config()["services"][service]["hours"][1]
    tier, price, hours = price_plan(service, budget)
    pcost = platform_cost(o["platform"], price, o["connects"])
    fcost = round(hours * cfg["business"].get("hourly_cost", 0), 2)
    profit = round(price - pcost - fcost, 2)
    desc = o["description"] or ""
    words = len(desc.split())
    ci = jl(o["client_info"], {}) or {}
    s_prices = cfg["services"][service]["prices"]

    f = {}
    f["skill_match"] = min(1.0, len(hits) / 4)
    clarity = 0.4 if 40 <= words <= 600 else (0.2 if words >= 15 else 0.0)
    clarity += 0.3 if re.search(r"(^|\n)\s*([-*•]|\d+[.)])\s", desc) or "deliverable" in text or "requirement" in text else 0
    clarity += 0.3 if not any(v in text for v in VAGUE_WORDS) else 0
    f["scope_clarity"] = min(1.0, clarity)
    if budget is None:
        f["budget"] = 0.5
    elif budget < cfg["scoring"]["min_budget"]:
        f["budget"] = 0.0
    else:
        f["budget"] = min(1.0, budget / s_prices[1])
    f["complexity"] = 1 - min(1.0, sum(c in text for c in COMPLEX_WORDS) / 3)
    f["fulfillment_time"] = 1.0 if hours <= 8 else 0.5 if hours <= 20 else 0.2
    if ci:
        cf = 0.4 * bool(ci.get("payment_verified"))
        cf += 0.2 * ((ci.get("hire_rate") or 0) >= 50)
        cf += 0.2 * ((ci.get("total_spent") or 0) >= 1000)
        cf += 0.2 * ((ci.get("rating") or 0) >= 4.5)
        # crowded postings lower realistic fit (Upwork proposals_tier)
        cf *= {"50+": 0.6, "20 to 50": 0.8, "15 to 20": 0.9}.get(ci.get("proposals_tier"), 1.0)
        f["client_fit"] = cf
    else:
        f["client_fit"] = 0.5
    pf = portfolio_for(con, service) if con is not None else []
    f["portfolio_fit"] = 0.0 if not pf else (1.0 if pf[0]["kind"] != "DEMO" else 0.6)
    eff_rate = profit / hours if hours else 0
    f["profit"] = max(0.0, min(1.0, eff_rate / 40))
    f["recurring"] = 1.0 if any(r in text for r in RECURRING_WORDS) else 0.3
    f["platform_cost"] = max(0.0, 1 - (pcost / price if price else 1) / 0.3)
    total = round(sum(f[k] * w[k] for k in w), 1)
    blockers = [f"red flag: '{r}'" for r in RED_FLAGS if r in text]
    floor = min(cfg["services"][service]["prices"]) * 0.75
    if budget is not None and o["budget_type"] != "hourly" and budget < floor:
        blockers.append(f"budget ${budget:.0f} below service floor ${floor:.0f}")
    if ci.get("total_hired"):
        blockers.append(f"client already hired {ci['total_hired']} for this posting")
    bal = connects_balance(con) if con is not None else None
    need = o["connects"]
    if o["platform"] == "upwork" and bal is not None and need and need > bal:
        blockers.append(f"needs {need} Connects, balance {bal:.0f}")
    return {"score": total, "blockers": blockers, "factors": {k: round(v, 2) for k, v in f.items()}, "service": service,
            "keywords": hits, "tier": tier, "price": price, "hours": hours, "platform_cost": pcost,
            "fulfillment_cost": fcost, "profit": profit,
            "portfolio": [dict(id=p["id"], title=p["title"], kind=p["kind"]) for p in pf[:2]]}


SERVICE_QUESTIONS = {
    "n8n": ["Which apps/accounts need to connect (and do you already have n8n cloud or self-hosted)?",
            "Roughly how many runs per day/month do you expect?",
            "What should happen when a step fails — email/Slack alert, retry, or both?"],
    "leadgen": ["Which niche, geography and business size should the list target?",
                "Which fields do you need per lead, and where should they land (Sheet, CRM)?",
                "How many leads, and is this one-off or recurring?"],
    "microbuild": ["Where will this run (your machine, a server, a hosted app)?",
                   "Is there existing code or an API I should integrate with?",
                   "What does 'done' look like — can you describe one real input and the expected output?"],
    "sheets": ["Can you share a copy of the sheet with sample (non-sensitive) data?",
               "Google Sheets or Excel — and which version/platform?",
               "Who updates the data, and how often?"],
    "voice": ["What phone system/number do you use today, and your business hours?",
              "Which calendar/booking tool should appointments go into?",
              "Which calls must always go to a human?"],
}


def questions_for(o, service: str) -> list[str]:
    text = _text(o)
    qs = list(SERVICE_QUESTIONS[service][:2])
    if not re.search(r"deadline|by (mon|tue|wed|thu|fri|sat|sun|next|end)|asap|\bdays?\b|\bweeks?\b", text):
        qs.append("Is there a deadline I should plan around?")
    else:
        qs.append(SERVICE_QUESTIONS[service][2])
    return qs[:3]


def analyze(con, oid: int) -> dict:
    o = con.execute("SELECT * FROM marketplace_opportunities WHERE id=?", (oid,)).fetchone()
    if not o:
        raise ValueError(f"opportunity #{oid} not found")
    if o["status"] not in ("DISCOVERED", "ANALYZING", "QUALIFIED", "CANCELLED"):
        raise ValueError(f"opportunity #{oid} is {o['status']}; re-scoring would regress its status")
    set_opp_status(con, oid, "ANALYZING")
    r = score(o, con)
    qualified = r["score"] >= config()["scoring"]["qualify_threshold"] and not r["blockers"]
    fields = dict(match_score=r["score"], score_breakdown=jd(r), recommended_service=r["service"],
                  recommended_tier=r["tier"], recommended_price=r["price"], est_hours=r["hours"],
                  est_platform_cost=r["platform_cost"], est_fulfillment_cost=r["fulfillment_cost"],
                  est_profit=r["profit"], questions=jd(questions_for(o, r["service"])),
                  portfolio_rec=jd(r["portfolio"]))
    if qualified:
        set_opp_status(con, oid, "QUALIFIED", **fields)
    else:
        set_opp_status(con, oid, "CANCELLED", result="; ".join(r["blockers"]) or "low_fit", **fields)
    return r | {"qualified": qualified}


@handler("score_opportunity")
def _h_score(con, inp):
    r = analyze(con, inp["id"])
    if r["qualified"] and inp.get("auto_propose", True):
        enqueue(con, "draft_proposal", {"id": inp["id"]}, priority=3, source="score_opportunity")
    return {"score": r["score"], "qualified": r["qualified"]}

# ---------------------------------------------------------------------- proposals

GENERIC_PHRASES = ["i am excited", "i'm excited", "i have read your job", "dear hiring manager",
                   "i am the perfect", "look no further", "100% satisfaction", "i can do this job",
                   "i am a highly skilled", "as an ai", "i will do my best", "hope you are doing well",
                   "to whom it may concern", "best fit for this job", "i have carefully read"]

PLAN_STEPS = {
    "n8n": ["Map the trigger and each system involved ({kw})", "Build the workflow in n8n with an error branch + alert",
            "Test with your real sample data and edge cases", "Hand off the workflow JSON plus a 1-page runbook"],
    "leadgen": ["Confirm targeting ({kw}) and the exact fields you need", "Collect from permitted public business sources only",
                "Normalize, dedupe and score each record", "Deliver a clean sheet with the method documented"],
    "microbuild": ["Pin down one real input → expected output ({kw})", "Build the smallest version that does exactly that",
                   "Test it against your examples and edge cases", "Package it with setup + usage notes"],
    "sheets": ["Review a copy of your sheet ({kw})", "Build the formulas/script and keep your layout intact",
               "Test edge cases (blanks, bad dates, duplicates)", "Deliver the clean version with a short how-to"],
    "voice": ["Capture your hours, FAQs, booking rules and escalation ({kw})",
              "Configure the AI receptionist and booking/SMS integrations",
              "Run test calls incl. edge cases and hand-off to a human", "Go live with a short tuning pass after week one"],
}


def lint_proposal(body: str, o) -> list[str]:
    issues = []
    low = body.lower()
    for g in GENERIC_PHRASES:
        if g in low:
            issues.append(f"generic phrase: '{g}'")
    n = len(body.split())
    if n < 60:
        issues.append(f"too short ({n} words)")
    if n > 300:
        issues.append(f"too long ({n} words) — keep under 300")
    kws = match_service(_text(o))[1]
    title_words = {w for w in re.findall(r"[a-z]{5,}", (o["title"] or "").lower())}
    specific = [k for k in kws if k in low] + [w for w in title_words if w in low]
    if len(set(specific)) < 2:
        issues.append("not specific enough: mention at least 2 job-specific terms")
    if "$" not in body:
        issues.append("no price stated")
    if "?" not in body:
        issues.append("no questions for the client")
    if re.search(r"\b\d+\s*%\s*(increase|more|growth|boost)", low):
        issues.append("unverified result claim — remove unless it is a real, documented result")
    return issues


def build_proposal(con, o) -> dict:
    r = jl(o["score_breakdown"]) or score(o, con)
    service = o["recommended_service"] or r["service"]
    generic = {"automation", "workflow", "api", "integration", "tool", "script", "report", "leads", "phone", "call"}
    terms = list(dict.fromkeys([k for k in jl(o["skills"], []) or []] +
                               sorted([k for k in r["keywords"] if k not in generic], key=len, reverse=True)))
    kw = ", ".join(terms[:3]) or ", ".join(r["keywords"][:3]) or (o["title"] or "").lower()
    price = o["recommended_price"] or r["price"]
    days = max(1, round((o["est_hours"] or r["hours"]) / 3 + 0.49))
    need = re.split(r"[.!?\n]", (o["description"] or o["title"]).strip())[0].strip()
    if len(need) > 160:
        need = need[:160].rsplit(" ", 1)[0] + "…"
    opening = f"Hi{(' ' + o['client'].split()[0]) if o['client'] else ''} — {o['title'].rstrip('.')}: this is the kind of {config()['services'][service]['name']} work I focus on."
    understanding = f"From your post, the core need is: \"{need}\". The parts that matter most are {kw}."
    plan = "\n".join(f"{i}. {s.format(kw=kw)}" for i, s in enumerate(PLAN_STEPS[service], 1))
    pf = jl(o["portfolio_rec"], []) or r.get("portfolio", [])
    proof = ""
    if pf:
        p = pf[0]
        label = {"DEMO": "demo I built", "CASE_STUDY": "case study", "PAID_CLIENT_WORK": "client project"}[p["kind"]]
        proof = f"Relevant: {p['title']} ({label}) — happy to walk you through it.\n"
    qs = jl(o["questions"], []) or questions_for(o, service)
    tier = o["recommended_tier"] or r["tier"]
    cta = "If that plan looks right, send the details above and I can start right away."
    body = render(template(con, "proposal_core") or "{opening}\n\n{understanding}\n\n{plan}\n\n{cta}",
                  opening=opening, understanding=understanding, plan=plan, timeline_days=days, price=price,
                  tier=tier, proof=proof, questions="\n".join(f"- {q}" for q in qs), cta=cta)
    body = re.sub(r"\n{3,}", "\n\n", body).strip()
    return {"body": body, "price": price, "timeline_days": days, "questions": qs, "portfolio": pf}


def draft_proposal(con, oid: int) -> int:
    o = con.execute("SELECT * FROM marketplace_opportunities WHERE id=?", (oid,)).fetchone()
    if not o:
        raise ValueError(f"opportunity #{oid} not found")
    if o["status"] in ("DISCOVERED", "ANALYZING"):
        analyze(con, oid)
        o = con.execute("SELECT * FROM marketplace_opportunities WHERE id=?", (oid,)).fetchone()
    p = build_proposal(con, o)
    issues = lint_proposal(p["body"], o)
    with con:
        pid = con.execute("INSERT INTO proposals(opportunity_id,body,price,timeline_days,questions,portfolio,lint,"
                          "status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'REVIEW_REQUIRED',?,?)",
                          (oid, p["body"], p["price"], p["timeline_days"], jd(p["questions"]), jd(p["portfolio"]),
                           jd(issues), now(), now())).lastrowid
    set_opp_status(con, oid, "PROPOSAL_DRAFTED")
    set_opp_status(con, oid, "REVIEW_REQUIRED")
    action = "submit_upwork_proposal" if o["platform"] == "upwork" else "send_external_message"
    request_approval(con, action, "proposal", pid,
                     f"{o['platform']} #{oid} '{o['title'][:60]}' — ${p['price']:.0f}, score {o['match_score']}",
                     {"url": o["url"], "lint": issues})
    return pid


def edit_proposal(con, pid: int, body: str) -> list[str]:
    p = con.execute("SELECT p.*, o.title, o.description, o.skills FROM proposals p JOIN marketplace_opportunities o "
                    "ON o.id=p.opportunity_id WHERE p.id=?", (pid,)).fetchone()
    issues = lint_proposal(body, p)
    with con:
        con.execute("UPDATE proposals SET body=?, lint=?, updated_at=? WHERE id=?", (body, jd(issues), now(), pid))
    log(con, "proposal_edited", "proposal", pid, {"lint": issues})
    return issues


def submit_proposal(con, pid: int) -> dict:
    """Passes the approval gate, then returns instructions. Never submits via unofficial automation."""
    p = con.execute("SELECT p.*, o.platform, o.url, o.id AS oid, o.title FROM proposals p "
                    "JOIN marketplace_opportunities o ON o.id=p.opportunity_id WHERE p.id=?", (pid,)).fetchone()
    action = "submit_upwork_proposal" if p["platform"] == "upwork" else "send_external_message"
    gate(con, action, "proposal", pid, f"Submit proposal #{pid} for '{p['title'][:60]}'")
    set_opp_status(con, p["oid"], "APPROVED")
    with con:
        con.execute("UPDATE proposals SET status='APPROVED', updated_at=? WHERE id=?", (now(), pid))
    m = config()["marketplaces"][p["platform"]]
    if m.get("integration") == "mcp":
        return {"mode": "mcp", "url": p["url"],
                "next": (f"Claude: create proposal preview via Upwork manage_proposals, show it to the user, "
                         f"confirm_preview ONLY on explicit user OK, then: python -m bos opp submitted {p['oid']} --connects N")}
    return {"mode": "manual", "url": p["url"],
            "next": f"Paste proposal #{pid} at {p['url']}, then run: python -m bos opp submitted {p['oid']}"}


@handler("draft_proposal")
def _h_propose(con, inp):
    return {"proposal_id": draft_proposal(con, inp["id"])}

# ====================================================================== leads

def domain_of(url: str | None) -> str | None:
    if not url:
        return None
    d = re.sub(r"^[a-z]+://", "", url.strip().lower()).split("/")[0].split("?")[0]
    d = d[4:] if d.startswith("www.") else d
    return d if "." in d else None


def norm_phone(p: str | None) -> str | None:
    if not p:
        return None
    digits = re.sub(r"\D", "", str(p))
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}" if len(digits) == 10 else None


EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")


def norm_email(e: str | None) -> str | None:
    e = (e or "").strip().lower()
    return e if EMAIL_RE.match(e) else None


def _slug(s: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def dedupe_key(lead: dict) -> str:
    if lead.get("website") and domain_of(lead["website"]):
        return "d:" + domain_of(lead["website"])
    if lead.get("phone") and norm_phone(lead["phone"]):
        return "p:" + re.sub(r"\D", "", norm_phone(lead["phone"]))
    return "n:" + _slug(lead.get("business")) + "|" + _slug(lead.get("location"))


LEAD_SIGNALS = {  # signal -> (problem, recommended service, weight)
    "missed_calls": ("Calls go unanswered / to voicemail", "voice", 25),
    "no_online_booking": ("No online booking", "voice", 15),
    "slow_response": ("Slow response to inquiries", "n8n", 20),
    "no_lead_capture": ("Website has no lead capture / follow-up", "n8n", 15),
    "weak_website": ("Website is outdated or weak on mobile", "microbuild", 10),
    "no_website": ("No website found", "microbuild", 10),
    "manual_spreadsheets": ("Runs on manual spreadsheets", "sheets", 10),
    "no_crm": ("No CRM / follow-up system visible", "n8n", 10),
}


def add_lead(con, d: dict) -> tuple[int, bool]:
    """Normalize + dedupe + merge. Never invents contact data: only stores what the source provided."""
    src = d.get("source") or ""
    if src not in config()["leads"]["permitted_sources"]:
        raise ValueError(f"source '{src}' not in permitted_sources")
    if not d.get("business"):
        raise ValueError("business required")
    lead = {
        "business": d["business"].strip(), "niche": d.get("niche"), "location": d.get("location"),
        "website": ("https://" + domain_of(d["website"])) if domain_of(d.get("website")) else None,
        "email": norm_email(d.get("email")), "phone": norm_phone(d.get("phone")),
        "contact_name": d.get("contact_name") or None, "contact_role": d.get("contact_role") or None,
        "source": src, "source_url": d.get("source_url"),
    }
    signals = d.get("signals") or {}
    if isinstance(signals, str):
        signals = {s.strip(): True for s in signals.split(";") if s.strip()}
    key = dedupe_key(lead)
    dom, ph, em = domain_of(lead["website"]), lead["phone"], lead["email"]
    ex = con.execute("SELECT * FROM leads WHERE dedupe_key=? OR (? IS NOT NULL AND phone=?) OR "
                     "(? IS NOT NULL AND email=?) OR (? IS NOT NULL AND website=?)",
                     (key, ph, ph, em, em, dom, lead["website"])).fetchone()
    if ex:  # merge: fill blanks only
        upd = {k: v for k, v in lead.items() if v and not ex[k]}
        merged_sig = (jl(ex["signals"], {}) or {}) | signals
        with con:
            con.execute(f"UPDATE leads SET {''.join(f'{k}=?, ' for k in upd)}signals=?, updated_at=? WHERE id=?",
                        (*upd.values(), jd(merged_sig), now(), ex["id"]))
        _score_lead(con, ex["id"])
        return ex["id"], False
    with con:
        lid = con.execute(
            "INSERT INTO leads(business,niche,location,website,email,phone,contact_name,contact_role,source,"
            "source_url,signals,notes,status,dedupe_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'NEW',?,?,?)",
            (*lead.values(), jd(signals), d.get("notes"), key, now(), now())).lastrowid
    _score_lead(con, lid)
    log(con, "lead_added", "lead", lid, {"source": src})
    return lid, True


def _score_lead(con, lid: int) -> dict:
    l = con.execute("SELECT * FROM leads WHERE id=?", (lid,)).fetchone()
    sig = jl(l["signals"], {}) or {}
    probs, svc_w = [], {}
    sc = 0
    for s, on in sig.items():
        if on and s in LEAD_SIGNALS:
            prob, svc, w = LEAD_SIGNALS[s]
            probs.append(prob)
            svc_w[svc] = svc_w.get(svc, 0) + w
            sc += w
    sc += 10 if l["email"] else 0
    sc += 10 if l["phone"] else 0
    sc += 5 if l["contact_name"] else 0
    svc = max(svc_w, key=svc_w.get) if svc_w else None
    val = config()["services"][svc]["prices"][1] if svc else None
    missing = [f for f in ("website", "email", "phone") if not l[f]]
    notes = (f"Signals: {', '.join(probs) or 'none recorded — research needed'}. "
             f"Missing: {', '.join(missing) or 'nothing'}.")
    with con:
        con.execute("UPDATE leads SET score=?, problem=?, recommended_service=?, est_value=?, opportunity=?, "
                    "notes=COALESCE(notes, ?), status=CASE WHEN status='NEW' AND ?>=40 THEN 'QUALIFIED' ELSE status END, "
                    "updated_at=? WHERE id=?",
                    (min(sc, 100), "; ".join(probs) or None, svc, val,
                     (config()["services"][svc]["name"] if svc else None), notes, sc, now(), lid))
    return {"score": sc, "service": svc}


def import_leads_csv(con, path: str, source: str = "csv_import", niche=None, location=None) -> dict:
    res = {"created": 0, "merged": 0, "errors": []}
    with open(path, newline="", encoding="utf-8-sig") as f:
        for i, row in enumerate(csv.DictReader(f), 2):
            row = {k.strip().lower(): (v or "").strip() for k, v in row.items() if k}
            row.setdefault("source", source)
            row["source"] = row["source"] or source
            row["niche"] = row.get("niche") or niche
            row["location"] = row.get("location") or location
            try:
                _, c = add_lead(con, row)
                res["created" if c else "merged"] += 1
            except ValueError as e:
                res["errors"].append(f"row {i}: {e}")
    return res

# ====================================================================== outreach

def suppressed(con, lead_id: int) -> bool:
    r = con.execute("SELECT suppressed FROM leads WHERE id=?", (lead_id,)).fetchone()
    return bool(r and r["suppressed"])


def draft_sequence(con, lead_id: int, channel: str = "email") -> list[int]:
    l = con.execute("SELECT * FROM leads WHERE id=?", (lead_id,)).fetchone()
    if not l:
        raise ValueError(f"lead #{lead_id} not found")
    if l["suppressed"]:
        raise ValueError(f"lead #{lead_id} is suppressed ({l['suppress_reason']})")
    if channel == "email" and not l["email"]:
        raise ValueError(f"lead #{lead_id} has no public business email — research first; never guess one")
    if con.execute("SELECT 1 FROM outreach WHERE lead_id=? AND status IN ('DRAFT','SCHEDULED','SENT')",
                   (lead_id,)).fetchone():
        raise ValueError(f"lead #{lead_id} already has an active sequence")
    cfg, biz = config()["outreach"], config()["business"]
    svc = l["recommended_service"] or "n8n"
    sname = config()["services"][svc]["name"]
    probs = [p for p in (l["problem"] or "").split("; ") if p]
    problem_short = probs[0].lower() if probs else "manual follow-up work"
    observation = (f"I was looking at {l['business']} and noticed: {problem_short}." if probs
                   else f"I work with {l['niche'] or 'local businesses'} in {l['location'] or 'your area'} on automating repetitive front-office work.")
    days = max(1, round(config()["services"][svc]["hours"][1] / 3))
    kw = dict(subject=f"{l['business']} — {problem_short}", greeting=l["contact_name"] or "there",
              observation=observation,
              offer=f"I set up {sname.lower()} for small businesses — usually live in about {days} days, fixed price, no long contract.",
              offer_short=f"I can set up a {sname.lower()} to fix that.", problem_short=problem_short,
              service_name=sname.lower(), days=days,
              cta="Would a short 2-minute demo video tailored to your business be useful?",
              signature=f"{biz['owner']}\n{biz['name']}",
              footer=(f"{biz['postal_address']}\nNot interested? Reply 'no' and I won't contact you again."
                      if biz.get("postal_address") else "[MISSING postal address — required before sending]"))
    ids, due = [], datetime.now(timezone.utc)
    for step, delay in zip(cfg["sequence"], cfg["delays_days"]):
        due = due + timedelta(days=delay)
        body = render(template(con, f"outreach_{step.lower()}") or "{observation}", **kw)
        subj = body.split("\n", 1)[0].removeprefix("Subject: ")
        with con:
            ids.append(con.execute("INSERT INTO outreach(lead_id,channel,step,subject,body,status,due_at,created_at,updated_at) "
                                   "VALUES (?,?,?,?,?,'DRAFT',?,?,?)",
                                   (lead_id, channel, step, subj, body.split("\n", 2)[-1].strip(), ts(due), now(), now())).lastrowid)
    with con:
        con.execute("UPDATE leads SET status='OUTREACH_DRAFTED', updated_at=? WHERE id=?", (now(), lead_id))
    log(con, "outreach_drafted", "lead", lead_id, {"steps": len(ids)})
    return ids


def outreach_send_check(con, oid: int) -> dict:
    """Gate before any send. Returns the message to send (by user or an approved connector)."""
    o = con.execute("SELECT o.*, l.email, l.suppressed FROM outreach o JOIN leads l ON l.id=o.lead_id WHERE o.id=?",
                    (oid,)).fetchone()
    if o["suppressed"]:
        raise ValueError("lead suppressed — do not contact")
    if "[MISSING postal address" in o["body"]:
        raise ValueError("set business.postal_address in config.toml, then redraft (CAN-SPAM)")
    if o["channel"] not in config()["outreach"]["auto_send_channels"]:
        gate(con, "send_external_message", "outreach", oid, f"Send {o['step']} to {o['email']}: {o['subject']}")
    return {"to": o["email"], "subject": o["subject"], "body": o["body"]}


def mark_outreach(con, oid: int, event: str) -> None:
    event = event.upper()
    if event not in OUTREACH_EVENTS:
        raise ValueError(f"event must be one of {OUTREACH_EVENTS}")
    o = con.execute("SELECT * FROM outreach WHERE id=?", (oid,)).fetchone()
    with con:
        con.execute("UPDATE outreach SET status=?, sent_at=CASE WHEN ?='SENT' THEN ? ELSE sent_at END, updated_at=? "
                    "WHERE id=?", (event, event, now(), now(), oid))
        lead_status = {"REPLIED": "REPLIED", "POSITIVE": "POSITIVE", "MEETING": "MEETING", "WON": "WON",
                       "NEGATIVE": "LOST_NO_THANKS", "LOST": "LOST", "BOUNCED": "INVALID"}.get(event)
        if event in ("BOUNCED", "NEGATIVE", "REPLIED", "POSITIVE", "MEETING", "WON", "LOST"):
            # any reply or terminal event stops the automated sequence
            con.execute("UPDATE outreach SET status='CANCELLED', updated_at=? WHERE lead_id=? AND id!=? AND status='DRAFT'",
                        (now(), o["lead_id"], oid))
        if event == "BOUNCED":  # keep the record + address so it stays suppressed forever
            con.execute("UPDATE leads SET suppressed=1, suppress_reason='bounced' WHERE id=?", (o["lead_id"],))
        if event == "NEGATIVE":
            con.execute("UPDATE leads SET suppressed=1, suppress_reason='no_thanks' WHERE id=?", (o["lead_id"],))
        if lead_status:
            con.execute("UPDATE leads SET status=?, updated_at=? WHERE id=?", (lead_status, now(), o["lead_id"]))
    log(con, f"outreach_{event.lower()}", "outreach", oid)


def due_followups(con, at: str | None = None) -> list:
    return con.execute("SELECT o.*, l.business, l.email FROM outreach o JOIN leads l ON l.id=o.lead_id "
                       "WHERE o.status='DRAFT' AND o.due_at<=? AND l.suppressed=0 AND o.step!='INITIAL' "
                       "AND EXISTS (SELECT 1 FROM outreach p WHERE p.lead_id=o.lead_id AND p.status='SENT') "
                       "ORDER BY o.due_at", (at or now(),)).fetchall()

# ====================================================================== clients / projects / fulfillment

def playbook(con, service: str) -> list[str]:
    body = template(con, f"playbook_{service}") or ""
    return [s.strip() for s in body.splitlines() if s.strip()]


def intake(con, client: dict, project: dict) -> tuple[int, int]:
    with con:
        cid = con.execute("INSERT INTO clients(name,company,platform,contact,notes,created_at) VALUES (?,?,?,?,?,?)",
                          (client["name"], client.get("company"), client.get("platform"), client.get("contact"),
                           client.get("notes"), now())).lastrowid
        pid = con.execute(
            "INSERT INTO projects(client_id,opportunity_id,service,tier,price,scope,requirements,deadline,assets,"
            "deliverables,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (cid, project.get("opportunity_id"), project["service"], project.get("tier"), _num(project.get("price")),
             project.get("scope"), project.get("requirements"), project.get("deadline"), jd(project.get("assets", [])),
             jd(playbook(con, project["service"])), now(), now())).lastrowid
    if project.get("opportunity_id"):
        set_opp_status(con, project["opportunity_id"], "WON")
    log(con, "client_intake", "project", pid, {"client": cid, "service": project["service"]})
    return cid, pid


def advance(con, pid: int) -> dict:
    p = con.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
    steps = jl(p["deliverables"], []) or []
    i = p["playbook_step"]
    if i >= len(steps):
        return {"done": True}
    step = steps[i]
    m = re.search(r"APPROVAL: (\w+)", step)
    if m:
        gate(con, m.group(1), "project", pid, f"Project #{pid}: {step}")
    i += 1
    status = "COMPLETED" if i >= len(steps) else "IN_PROGRESS"
    with con:
        con.execute("UPDATE projects SET playbook_step=?, fulfillment_status=?, updated_at=? WHERE id=?",
                    (i, status, now(), pid))
    log(con, "project_step", "project", pid, {"step": step})
    out = {"completed_step": step, "next": steps[i] if i < len(steps) else None, "done": i >= len(steps)}
    if out["done"]:
        out["followups"] = post_delivery(con, pid)
    return out


def post_delivery(con, pid: int) -> dict:
    """Identify recurring offer + upsells. Creates PROPOSED recurring record; nothing is sent."""
    p = con.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
    s = config()["services"][p["service"]]
    rec = s.get("recurring")
    if rec and not con.execute("SELECT 1 FROM recurring_revenue WHERE project_id=?", (pid,)).fetchone():
        with con:
            con.execute("INSERT INTO recurring_revenue(client_id,project_id,service,description,monthly_amount,status) "
                        "VALUES (?,?,?,?,?,'PROPOSED')", (p["client_id"], pid, p["service"], rec["name"], rec["monthly"]))
    offer = (f"Optional next steps (no pressure): {', '.join(s['upsells'][:3])}. "
             f"Or keep it running smoothly with {rec['name'].lower()} at ${rec['monthly']}/mo." if rec else "")
    return {"recurring": rec, "upsells": s["upsells"], "offer_draft": offer}

# ====================================================================== portfolio

def add_portfolio(con, d: dict) -> int:
    kind = d.get("kind", "DEMO").upper()
    if kind == "PAID_CLIENT_WORK" and not d.get("project_id"):
        raise ValueError("PAID_CLIENT_WORK must reference a real project_id")
    if kind == "PAID_CLIENT_WORK" and not con.execute("SELECT 1 FROM projects WHERE id=? AND fulfillment_status='COMPLETED'",
                                                      (d["project_id"],)).fetchone():
        raise ValueError("PAID_CLIENT_WORK requires a completed project")
    with con:
        return con.execute("INSERT INTO portfolio(title,kind,service,problem,solution,workflow,technologies,demo_behavior,"
                           "assets,url,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                           (d["title"], kind, d.get("service"), d.get("problem"), d.get("solution"), d.get("workflow"),
                            d.get("technologies"), d.get("demo_behavior"), jd(d.get("assets", [])), d.get("url"),
                            now())).lastrowid

# ====================================================================== finance

COST_KINDS = ("platform_fee", "connects", "software", "api", "automation", "refund", "fulfillment", "other_cost")
TXN_KINDS = ("revenue",) + COST_KINDS


def add_txn(con, kind: str, amount: float, service=None, project_id=None, platform=None, memo=None, date=None,
            auto_fee: bool = True) -> int:
    """Record a transaction. Revenue on a marketplace auto-books the platform fee unless auto_fee=False."""
    if kind not in TXN_KINDS:
        raise ValueError(f"kind must be one of {TXN_KINDS}")
    if amount < 0:
        raise ValueError("amount must be positive; kind decides the sign")
    with con:
        tid = con.execute("INSERT INTO financial_transactions(date,kind,amount,service,project_id,platform,memo,created_at) "
                          "VALUES (?,?,?,?,?,?,?,?)", (date or now()[:10], kind, amount, service, project_id,
                                                       platform, memo, now())).lastrowid
    if auto_fee and kind == "revenue" and platform in config()["marketplaces"]:
        fee = round(amount * config()["marketplaces"][platform].get("fee_pct", 0) / 100, 2)
        if fee:
            with con:
                con.execute("INSERT INTO financial_transactions(date,kind,amount,service,project_id,platform,memo,created_at) "
                            "VALUES (?,?,?,?,?,?,?,?)", (date or now()[:10], "platform_fee", fee, service, project_id,
                                                         platform, f"auto fee for txn {tid}", now()))
    log(con, "txn", "financial_transactions", tid, {"kind": kind, "amount": amount})
    return tid


def finance(con, since: str | None = None, until: str | None = None) -> dict:
    since, until = since or "0000", until or "9999"
    rows = con.execute("SELECT kind, COALESCE(service,'_unassigned') AS service, SUM(amount) s, COUNT(*) n "
                       "FROM financial_transactions WHERE date>=? AND date<=? GROUP BY kind, service",
                       (since, until)).fetchall()
    by: dict = {}
    for r in rows:
        b = by.setdefault(r["service"], {"revenue": 0.0, "cost": 0.0, "orders": 0})
        if r["kind"] == "revenue":
            b["revenue"] += r["s"]
            b["orders"] += r["n"]
        else:
            b["cost"] += r["s"]
    for b in by.values():
        b["net"] = round(b["revenue"] - b["cost"], 2)
        b["margin_pct"] = round(100 * b["net"] / b["revenue"], 1) if b["revenue"] else None
    gross = round(sum(b["revenue"] for b in by.values()), 2)
    cost = round(sum(b["cost"] for b in by.values()), 2)
    orders = sum(b["orders"] for b in by.values())
    mrr = con.execute("SELECT COALESCE(SUM(monthly_amount),0) FROM recurring_revenue WHERE status='ACTIVE'").fetchone()[0]
    return {"gross_revenue": gross, "total_cost": cost, "net_profit": round(gross - cost, 2),
            "profit_margin_pct": round(100 * (gross - cost) / gross, 1) if gross else None,
            "average_order_value": round(gross / orders, 2) if orders else None, "orders": orders,
            "mrr": round(mrr, 2), "by_service": by}

# ====================================================================== analytics / metrics

def add_metric(con, platform: str, metric: str, value: float, date: str | None = None) -> None:
    with con:
        con.execute("INSERT INTO metrics(date,platform,metric,value) VALUES (?,?,?,?) "
                    "ON CONFLICT(date,platform,metric) DO UPDATE SET value=excluded.value",
                    (date or now()[:10], platform, metric, value))


def analytics(con, since: str | None = None) -> dict:
    since = since or "0000"
    q = lambda sql, *a: con.execute(sql, a).fetchone()[0]  # noqa: E731
    up = {
        "jobs_reviewed": q("SELECT COUNT(*) FROM marketplace_opportunities WHERE platform='upwork' AND discovered_at>=?", since),
        "proposals": q("SELECT COUNT(*) FROM marketplace_opportunities WHERE platform='upwork' AND submitted_at>=?", since),
        "connects_spent": q("SELECT COALESCE(SUM(COALESCE(connects,0)),0) FROM marketplace_opportunities WHERE platform='upwork' AND submitted_at>=?", since),
        "replies": q("SELECT COUNT(*) FROM marketplace_opportunities WHERE platform='upwork' AND submitted_at>=? AND status IN ('RESPONSE_RECEIVED','NEGOTIATING','WON','LOST') AND response IS NOT NULL", since),
        "wins": q("SELECT COUNT(*) FROM marketplace_opportunities WHERE platform='upwork' AND status='WON' AND updated_at>=?", since),
        "revenue": q("SELECT COALESCE(SUM(amount),0) FROM financial_transactions WHERE platform='upwork' AND kind='revenue' AND date>=?", since[:10]),
    }
    fv = {r["metric"]: r["v"] for r in con.execute(
        "SELECT metric, SUM(value) v FROM metrics WHERE platform='fiverr' AND date>=? GROUP BY metric", (since[:10],))}
    biz = {
        "leads": q("SELECT COUNT(*) FROM leads WHERE created_at>=?", since),
        "outreach_sent": q("SELECT COUNT(*) FROM outreach WHERE sent_at>=?", since),
        "replies": q("SELECT COUNT(DISTINCT lead_id) FROM outreach WHERE status IN ('REPLIED','POSITIVE','NEGATIVE','MEETING','WON') AND updated_at>=?", since),
        "meetings": q("SELECT COUNT(*) FROM leads WHERE status='MEETING' AND updated_at>=?", since),
        "sales": q("SELECT COUNT(*) FROM financial_transactions WHERE kind='revenue' AND date>=?", since[:10]),
    }
    return {"upwork": up, "fiverr": fv or "no data — add with: metric fiverr <name> <value>", "business": biz}

# ====================================================================== research

def research_report(con, service: str | None = None) -> dict:
    """Pattern extraction over opportunities actually collected. Reports sample size; no invented stats."""
    rows = con.execute("SELECT * FROM marketplace_opportunities").fetchall()
    groups: dict = {}
    for o in rows:
        svc = o["recommended_service"] or match_service(_text(o))[0]
        if service and svc != service:
            continue
        g = groups.setdefault(svc, {"n": 0, "budgets": [], "kw": {}, "skills": {}, "recurring": 0, "complex": 0})
        g["n"] += 1
        t = _text(o)
        b = o["budget_max"] or o["budget_min"]
        if b and o["budget_type"] != "hourly":
            g["budgets"].append(b)
        for k in match_service(t)[1]:
            g["kw"][k] = g["kw"].get(k, 0) + 1
        for s in jl(o["skills"], []) or []:
            g["skills"][s.lower()] = g["skills"].get(s.lower(), 0) + 1
        g["recurring"] += any(r in t for r in RECURRING_WORDS)
        g["complex"] += any(c in t for c in COMPLEX_WORDS)
    out = []
    for svc, g in sorted(groups.items(), key=lambda x: -x[1]["n"]):
        b = sorted(g["budgets"])
        top = lambda d: [k for k, _ in sorted(d.items(), key=lambda x: -x[1])[:6]]  # noqa: E731
        enough = g["n"] >= 5
        out.append({
            "opportunity": config()["services"][svc]["name"], "service": svc, "sample_size": g["n"],
            "evidence": {"top_keywords": top(g["kw"]), "top_skills": top(g["skills"])},
            "price_range": (f"${b[len(b)//4]:.0f}–${b[(3*len(b))//4]:.0f} (IQR of {len(b)} fixed budgets)" if len(b) >= 4
                            else "insufficient budget data"),
            "difficulty": ("high" if g["complex"] / g["n"] > .4 else "medium" if g["complex"] / g["n"] > .15 else "low"),
            "recurring_potential": f"{100*g['recurring']//g['n']}% mention ongoing work",
            "automation_potential": "high" if svc in ("n8n", "leadgen", "sheets") else "medium",
            "confidence": "ok" if enough else "LOW — fewer than 5 samples; collect more before acting",
            "next_action": ("Draft/refresh the matching gig + proposals" if enough else "Collect more listings for this service"),
        })
    return {"generated": now(), "total_samples": len(rows), "opportunities": out,
            "note": "Derived only from opportunities stored in the local DB. Competition level requires manual review."}

# ====================================================================== fiverr

def fiverr_gig(con, service: str) -> dict:
    s = config()["services"][service]
    kws = s["keywords"]
    titles = {
        "n8n": "I will build custom n8n AI automation workflows for your business",
        "leadgen": "I will build an AI lead generation system with qualified business leads",
        "microbuild": "I will build a custom AI tool, script or dashboard with Claude Code",
        "sheets": "I will automate your google sheets or excel with formulas and scripts",
        "voice": "I will set up an AI voice receptionist that answers calls and books appointments",
    }
    hooks = {
        "n8n": "Stop copy-pasting between apps. I build n8n workflows that move data, trigger AI steps and alert you when something needs attention.",
        "leadgen": "Get a clean, deduplicated list of real businesses that match your ideal customer — built from permitted public sources.",
        "microbuild": "Need a small tool that just works? I build focused AI utilities, scripts and dashboards — tested and documented.",
        "sheets": "Turn a messy spreadsheet into one that updates itself: formulas, cleanup, dashboards and automated reports.",
        "voice": "Never miss a lead to voicemail again. An AI receptionist answers, qualifies callers, and books appointments 24/7.",
    }
    names = ["Starter", "Standard", "Pro"]
    pkgs = [{"name": n, "price": p, "delivery_days": max(1, round(h / 3 + 0.49)), "revisions": r,
             "includes": inc} for n, p, h, r, inc in zip(
        names, s["prices"], s["hours"], [1, 2, 3],
        [f"1 simple {s['name'].lower()} deliverable", "Multi-step build + documentation", "Advanced build + testing + handoff call"])]
    body = render(template(con, "fiverr_gig_description") or "{hook}", hook=hooks[service],
                  bullets="\n".join(f"- {u.capitalize()}" for u in ["Working, tested build", "Short usage guide"] + s["upsells"][:2]),
                  tools=", ".join(k for k in kws[:8]))
    gig = {"service": service, "title": titles[service][:80], "tags": [k[:20] for k in kws[:5]], "packages": pkgs,
           "description": body[:1200],
           "faqs": [{"q": "What do you need from me to start?", "a": "Your goal, the tools involved, and sample data or access (never share passwords in chat — I'll guide you through secure access)."},
                    {"q": "Can you do custom work beyond the packages?", "a": "Yes — message me with details and I'll send a custom offer."},
                    {"q": "Do you offer ongoing support?", "a": f"Yes: {s['recurring']['name']} is available monthly."}]}
    tid = request_approval(con, "publish_fiverr", f"fiverr_gig:{service}", None,
                           f"Publish Fiverr gig draft: {gig['title']}", gig)
    return gig | {"approval_task": tid}
