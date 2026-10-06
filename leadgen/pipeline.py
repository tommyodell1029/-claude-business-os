"""Lead pipeline: discover -> research -> qualify -> decision-maker -> email -> verify -> score/tier -> angle.

Ends at enrichment_status 'ready_for_approval' (verified decision-maker email) or 'needs_contact_enrichment'.
It never drafts or sends: the existing planner (leadgen/plan_day.py, /outreach-daily) picks up ready leads and the
owner approves every email. A dry run writes nothing at all.
"""
from __future__ import annotations

from datetime import datetime, timezone

from agents.notify.http import Http
from .contacts import classify_email, is_free_mail, is_generic
from .discovery import discover
from .draft import personal_angle
from .enrich import Budget, enrich, providers_from_env
from .research import Crawler, research_site
from .score import opportunity, recommended_offer, tier

ALL_STATUSES = ["new", "researched", "no_email", "below_threshold", "queued", "in_sequence", "replied", "interested",
                "not_now", "not_interested", "unsubscribed", "bounced", "do_not_contact"]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def process(p: dict, crawler: Crawler, cfg: dict, providers: dict, budget: Budget, suppressed: set[str]) -> dict:
    """One business through every step. Returns the full row (private keys stripped) plus `_trail`."""
    trail = [{"at": _now(), "step": "discovered", "detail": ",".join(p.get("discovery_sources") or [p.get("source", "")])}]
    site = research_site(crawler, p, cfg)
    people, emails = site.pop("_people"), site.pop("_emails")
    row = {**p, **site}
    trail.append({"at": _now(), "step": "researched",
                  "detail": f"{len(people)} named people, {len(emails)} addresses on site" if row.get("website") else "no website"})
    # An address on someone else's domain (web designer, directory) is not the business's; keep only own-domain or
    # free-mail addresses as the lead's email. Off-domain ones stay available for name matching and Hunter checks.
    em, dom = (row.get("email") or ""), (row.get("domain") or "")
    if em and dom and not is_free_mail(em) and not (em.split("@")[-1] == dom or em.split("@")[-1].endswith("." + dom)):
        trail.append({"at": _now(), "step": "researched", "detail": f"ignored off-domain address on site: {em}"})
        row.pop("email", None)
        row.pop("email_source_url", None)
        row["status"] = "no_email"
    sc, pains = opportunity(row, cfg)
    row.update({"score": sc, "pain_points": pains})
    if row.get("email"):
        row["email_verification_status"] = classify_email(row["email"], None)
        row["email_source"] = "company_site"
    if not row.get("website") and not row.get("phone"):
        row.update({"enrichment_status": "rejected", "lead_tier": "REJECTED"})
        trail.append({"at": _now(), "step": "rejected", "detail": "no website and no phone"})
        return {**row, "pipeline_log": trail}
    unread = (row.get("signals") or {}).get("has_website", {}).get("fetched") is False
    if unread:                           # robots unknown / timeout / blocked: no evidence either way, retry later
        row["enrichment_status"] = "pending"
        trail.append({"at": _now(), "step": "pending", "detail": "website could not be read (robots.txt unavailable, "
                                                                  "blocked or timed out); re-run enrich later"})
    elif sc < cfg["enrichment"]["qualify_min"]:
        row["enrichment_status"] = "not_qualified"
        trail.append({"at": _now(), "step": "not_qualified", "detail": f"score {sc} < {cfg['enrichment']['qualify_min']}"})
    else:
        trail.append({"at": _now(), "step": "qualified", "detail": f"score {sc}: " + ", ".join(x["signal"] for x in pains)})
        res = enrich(row, people, emails, providers, budget, cfg)
        for line in res.pop("_log"):
            trail.append({"at": _now(), "step": "enrichment", "detail": line})
        row["_usage"] = res.pop("_usage")
        row.update(res)
    if row.get("email") and row["email"].lower() in suppressed:
        row.update({"enrichment_status": "rejected", "lead_tier": "REJECTED"})
        trail.append({"at": _now(), "step": "rejected", "detail": "address is on the suppression list"})
        return {**row, "pipeline_log": trail}
    # The planner reads status 'researched' rows; a lead with an address on file must carry it.
    if row.get("email") and row.get("status") in (None, "new", "no_email"):
        row["status"] = "researched"
    row["lead_tier"] = tier(row, sc, cfg)
    row["recommended_offer"] = recommended_offer(pains)
    row["personalized_angle"] = personal_angle(row)
    if row.get("enrichment_status") == "ready_for_approval":
        trail.append({"at": _now(), "step": "ready_for_approval", "detail": f"tier {row['lead_tier']}"})
    else:
        trail.append({"at": _now(), "step": "scored", "detail": f"tier {row['lead_tier']}, {row.get('enrichment_status')}"})
    return {**row, "pipeline_log": trail}


COLUMNS = {"place_id", "name", "industry", "address", "city", "phone", "website", "rating", "review_count", "hours",
           "email", "email_source_url", "signals", "score", "status", "source", "domain", "decision_maker_name",
           "decision_maker_title", "decision_maker_profile", "decision_maker_source", "decision_maker_confidence",
           "email_source", "email_verification_status", "email_confidence", "pain_points", "lead_tier",
           "recommended_offer", "personalized_angle", "discovery_sources", "research_timestamp", "last_enriched_at",
           "enrichment_status", "pipeline_log"}


def to_db(row: dict) -> dict:
    return {k: v for k, v in row.items() if k in COLUMNS and v is not None}


def scout(store, cfg: dict, env, http: Http, crawler: Crawler, *, industries=None, locations=None, limit: int = 10,
          dry_run: bool = True, providers=None, seed_paths=None, csv_path=None, results: dict | None = None) -> dict:
    existing = store.prospects(ALL_STATUSES, limit=100000)
    disc = discover(cfg, env, http, industries=industries, locations=locations, limit=limit, providers=providers,
                    seed_paths=seed_paths, csv_path=csv_path, existing=existing)
    budget = Budget(cfg["enrichment"]["max_per_run"])
    provs = providers_from_env(env, http, results)
    suppressed = store.suppressed_emails()
    rows = [process(r, crawler, cfg, provs, budget, suppressed) for r in disc["rows"]]
    usage = [u for r in rows for u in r.pop("_usage", [])]
    written = 0
    if not dry_run and rows:
        written = len(store.upsert_prospects([to_db(r) for r in rows]))
        if usage and hasattr(store, "log_cost"):
            store.log_cost("lead_enrichment", len(usage), 0.0, {"calls": usage})
    return {"discovery": disc["providers"], "duplicates_skipped": disc["duplicates"], "businesses": rows,
            "enrichment_calls": len(usage), "budget_used": budget.used, "written": written, "dry_run": dry_run,
            "providers_available": sorted(provs)}


def enrich_existing(store, cfg: dict, env, http: Http, crawler: Crawler, *, limit: int = 10, dry_run: bool = True,
                    results: dict | None = None, ids: list[str] | None = None) -> dict:
    """Re-run research + enrichment for rows already in the database (legacy rows, or needs_contact_enrichment)."""
    rows = store.prospects_by_ids(ids) if ids else [
        p for p in store.prospects(["researched", "no_email", "below_threshold"], limit=1000)
        if p.get("enrichment_status") in (None, "needs_contact_enrichment", "pending")][:limit]
    budget = Budget(cfg["enrichment"]["max_per_run"])
    provs = providers_from_env(env, http, results)
    suppressed = store.suppressed_emails()
    out = []
    for p in rows:
        r = process(p, crawler, cfg, provs, budget, suppressed)
        r["pipeline_log"] = (p.get("pipeline_log") or []) + r["pipeline_log"][1:]
        r.pop("_usage", None)
        if not dry_run:
            fields = {k: v for k, v in to_db(r).items() if k not in ("place_id", "source", "name")}
            store.update_prospect(p["id"], fields)
        out.append(r)
    return {"businesses": out, "budget_used": budget.used, "dry_run": dry_run, "providers_available": sorted(provs)}


def render(b: dict) -> str:
    """Dry-run view of one business, top to bottom like the pipeline."""
    L = [f"{b.get('name')}  ({b.get('industry') or '?'}, {b.get('city') or '?'})  {b.get('website') or 'no website'}"]
    L.append(f"  Discovery: {', '.join(b.get('discovery_sources') or [b.get('source', '?')])}")
    note = {"not_qualified": " (below enrichment bar, no credits spent)",
            "pending": " (website could not be read this run: retry later, no credits spent)"}.get(b.get("enrichment_status"), "")
    L.append(f"  Qualification: score {b.get('score')}{note}")
    for x in b.get("pain_points") or []:
        L.append(f"    + {x['signal']} ({x['points']}): {x['evidence'][:110]}")
    dm = b.get("decision_maker_name")
    L.append(f"  Decision-maker: {dm + ' - ' + (b.get('decision_maker_title') or '') + ' [' + (b.get('decision_maker_source') or '') + ']' if dm else 'NOT IDENTIFIED'}")
    em = b.get("email")
    L.append(f"  Email: {em or 'none'}" + (f"  ({b.get('email_source')})" if em else ""))
    L.append(f"  Verification: {(b.get('email_verification_status') or 'n/a').upper()}"
             + ("  [generic inbox: not used as the decision-maker's email]" if em and is_generic(em) else ""))
    L.append(f"  Tier: {b.get('lead_tier')}   Offer: {b.get('recommended_offer')}")
    L.append(f"  Angle: {b.get('personalized_angle') or '(neutral: not enough evidence)'}")
    st = b.get("enrichment_status")
    L.append(f"  Status: {'READY_FOR_APPROVAL (would enter the approval queue)' if st == 'ready_for_approval' else (st or 'n/a').upper()}")
    return "\n".join(L)
