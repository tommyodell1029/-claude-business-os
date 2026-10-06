"""Opportunity score (0-100), pain points and lead tier. Weights live in leadgen/config.yaml `score.weights`.

The score is about conversion problems LaunchPad Local fixes (missed calls, no after-hours answer, no booking path,
slow follow-up), not website polish: a great site with no after-hours answering still scores high. A signal is scored
only when there is evidence for it (the site was actually read, or Places returned the data); unknown is never scored.
Signals that share a `group` count once (highest weight), so one underlying problem is not double-counted.
Usage: uv run python -m leadgen.score
"""
from __future__ import annotations

import json
import os

from . import ROOT  # noqa: F401
from .db import Store
from .source import load_config, log

SENTENCE = {   # pain point wording, used for personalization ("I noticed ..."). Observations, never accusations.
    "missed_call_risk": "it looks like customers mostly reach you by phone, but I didn't see a way for calls to be answered after hours",
    "no_after_hours_response": "I didn't see an after-hours answering option on the website",
    "no_online_booking": "I didn't see a way to book or request an appointment online",
    "slow_response": "the website says calls or messages are returned later rather than answered live",
    "no_call_text_cta": "I didn't see a tap-to-call or text option on the website",
    "poor_mobile_contact": "the website isn't set up for phones, which makes calling from a mobile harder",
    "no_lead_capture": "I didn't see a contact or request form on the website",
    "multiple_locations": "you serve customers from more than one location",
}


def _v(sigs: dict, name: str):
    """True / False if the signal was measured, None if unknown (never scored)."""
    s = sigs.get(name)
    return None if not isinstance(s, dict) or "value" not in s else bool(s["value"])


def detect(p: dict, cfg: dict) -> dict[str, str]:
    """{signal: evidence} for every opportunity signal with evidence on this prospect."""
    sigs = p.get("signals") or {}
    ind = (cfg.get("industries") or {}).get(p.get("industry") or "", {})
    site = sigs.get("has_website") or {}
    read = site.get("value") is True and site.get("fetched") is not False
    hits: dict[str, str] = {}
    if site.get("value") is False and not p.get("website"):
        hits["no_website"] = "no website listed"
    if read:
        answering = _v(sigs, "after_hours_answering")
        chat = _v(sigs, "has_chat_widget")
        if answering is False and chat is not True:
            hits["no_after_hours_response"] = "no after-hours answering or chat seen on the pages read"
            phone_driven = _v(sigs, "has_tel_link") or bool(p.get("phone"))
            if phone_driven and (_v(sigs, "mentions_24_7") or ind.get("emergency")):
                ev = (sigs.get("mentions_24_7") or {}).get("evidence")
                hits["missed_call_risk"] = f"phone-driven{' and advertises: ' + ev if ev else ' emergency trade'}; no after-hours answering seen"
        if _v(sigs, "has_online_booking") is False:
            hits["no_online_booking"] = "no online booking or appointment request seen"
        if _v(sigs, "slow_response"):
            hits["slow_response"] = sigs["slow_response"].get("evidence") or "slow-response wording on site"
        if _v(sigs, "has_tel_link") is False and _v(sigs, "has_text_option") is False:
            hits["no_call_text_cta"] = "no tap-to-call or text link on the pages read"
        if _v(sigs, "has_mobile_viewport") is False:
            hits["poor_mobile_contact"] = "no mobile viewport tag"
        if _v(sigs, "has_contact_form") is False and _v(sigs, "has_online_booking") is False:
            hits["no_lead_capture"] = "no contact form or booking path seen"
        if _v(sigs, "site_https") is False:
            hits["weak_website"] = "site does not use https"
        if _v(sigs, "multiple_locations"):
            hits["multiple_locations"] = sigs["multiple_locations"].get("evidence") or "multiple locations mentioned"
    if ind.get("high_ticket"):
        hits["high_ticket_service"] = f"{p.get('industry')} is a high-ticket service"
    if (p.get("review_count") or 0) >= cfg["score"].get("review_volume_min", 100):
        hits["high_review_volume"] = f"{p['review_count']} Google reviews"
    return hits


def opportunity(p: dict, cfg: dict) -> tuple[int, list[dict]]:
    """(score 0-100, pain points [{signal, points, evidence, sentence?}]). One count per group."""
    weights = cfg["score"]["weights"]
    best: dict[str, tuple[int, str]] = {}
    hits = detect(p, cfg)
    for sig in hits:
        w = weights.get(sig)
        if not w:
            continue
        g = w.get("group", sig)
        if g not in best or w["points"] > best[g][0]:
            best[g] = (w["points"], sig)
    counted = {sig for _, sig in best.values()}
    pains = [{"signal": s, "points": weights[s]["points"], "evidence": hits[s], **({"sentence": SENTENCE[s]} if s in SENTENCE else {})}
             for s in hits if s in counted]
    pains.sort(key=lambda x: -x["points"])
    return min(100, sum(x["points"] for x in pains)), pains


def tier(p: dict, score: int, cfg: dict) -> str:
    t = cfg["score"]["tiers"]
    if p.get("enrichment_status") == "rejected" or p.get("status") in ("unsubscribed", "bounced", "do_not_contact"):
        return "REJECTED"
    has_dm = bool(p.get("decision_maker_name"))
    if score >= t["hot_min"] and has_dm and p.get("email_verification_status") == "verified":
        return "HOT"
    if score >= t["good_min"] and has_dm:
        return "GOOD"
    return "RESEARCH"


def recommended_offer(pains: list[dict]) -> str:
    sigs = {x["signal"] for x in pains}
    if "multiple_locations" in sigs:
        return "AI Phone Receptionist - Scale (multiple locations)"
    if sigs & {"no_online_booking", "high_review_volume"}:
        return "AI Phone Receptionist - Growth (appointment-time requests)"
    return "AI Phone Receptionist - Launch"


def score_prospect(p: dict, cfg: dict | None = None) -> int:
    return opportunity(p, cfg or load_config())[0]


def score_all(store: Store, cfg: dict) -> dict:
    threshold = cfg["score"]["threshold"]
    counts = {"scored": 0, "below_threshold": 0, "eligible": 0}
    for p in store.prospects(["researched", "no_email", "below_threshold"], limit=1000):
        sc, pains = opportunity(p, cfg)
        status = p["status"]
        if p.get("email"):
            status = "below_threshold" if sc < threshold else "researched"   # no email stays 'no_email'
        store.update_prospect(p["id"], {"score": sc, "status": status, "pain_points": pains,
                                        "lead_tier": tier(p, sc, cfg), "recommended_offer": recommended_offer(pains)})
        counts["scored"] += 1
        counts["below_threshold"] += status == "below_threshold"
        counts["eligible"] += status == "researched"
    return counts


def main() -> int:
    store = Store(os.environ)
    if not store.configured:
        log("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
        return 2
    print(json.dumps(score_all(store, load_config())))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
