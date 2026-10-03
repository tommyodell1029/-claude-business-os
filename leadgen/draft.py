"""Draft first-touch cold emails for the top eligible prospects. Drafts only: NEVER sends, never touches Gmail.

Deterministic template; every fact comes from the prospect row (no LLM, so nothing can be invented). No prices, no demo number.
Refuses to draft without MAILING_ADDRESS. Inserts outreach_events rows: drafted / pending / gmail / step 0.
Usage: uv run python -m leadgen.draft [--top N]
"""
from __future__ import annotations

import argparse
import json
import os
import re

from . import ROOT  # noqa: F401
from lp.text import norm_email
from .db import Store
from .research import ROLE_BLOCK
from .source import load_config, log

OPT_OUT = "If you'd rather not hear from me, just reply \"unsubscribe\" and I will not email you again."
_INDUSTRY = {"plumbing": "plumbing", "hvac": "HVAC", "electrical": "electrical", "roofing": "roofing",
             "pest_control": "pest control", "garage_door": "garage door", "locksmith": "locksmith"}


class DraftError(Exception):
    pass


def mailing_address(env) -> str:
    addr = (env.get("MAILING_ADDRESS") or "").strip()
    if not addr or "{{" in addr:
        raise DraftError("MAILING_ADDRESS is not set; refusing to draft (CAN-SPAM)")
    return addr


def _has(p: dict, sig: str) -> bool:
    return bool(((p.get("signals") or {}).get(sig) or {}).get("value"))


def _service_phrase(p: dict) -> str:
    """'24/7 service' or 'emergency service', whichever the evidence on their site actually says."""
    ev = ((p.get("signals") or {}).get("mentions_24_7") or {}).get("evidence") or ""
    if re.search(r"24\s*/\s*7|24[- ]hours?|24\s*hr|around the clock", ev, re.I):
        return "24/7 service"
    return "emergency service"


def compose(p: dict, address: str, sender: str = "Tommy\nLaunchPad Local") -> tuple[str, str]:
    """(subject, body). Uses only facts in the prospect row; 'I called you' only if called_after_hours is true."""
    name = p["name"]
    industry = _INDUSTRY.get(p.get("industry") or "", p.get("industry") or "local service")
    city = p.get("city") or ""
    where = f" in {city}" if city and city.lower() not in name.lower() else ""
    lines = ["Hi there,", ""]
    if p.get("called_after_hours") is True:
        lines += [f"I called {name} after hours recently, and that is why I'm writing.", ""]
    facts = []
    if p.get("rating") is not None and p.get("review_count"):
        facts.append(f"{name} has {p['rating']} stars across {p['review_count']} Google reviews")
    if _has(p, "mentions_24_7"):
        facts.append(f"your website mentions {_service_phrase(p)}")
    if facts:
        lines += [("I noticed that " + " and that ".join(facts) + "."), ""]
    lines += [
        f"I run LaunchPad Local, a Jacksonville company that sets up AI phone receptionists for local {industry} businesses. "
        "The receptionist answers inbound calls, tells the caller it is an AI assistant and that the call may be recorded, "
        "takes their details, and emails you a summary after each call.",
        "",
        f"Would it be useful to see how it could handle calls for {name}{where}? Reply and I will send the details. No obligation.",
        "",
        "Thanks,",
        sender,
        address,
        "",
        OPT_OUT,
    ]
    subject = f"Phone calls at {name}"
    return subject, "\n".join(lines)


def validate(body: str, address: str) -> None:
    if address not in body:
        raise DraftError("draft is missing the mailing address")
    if OPT_OUT not in body:
        raise DraftError("draft is missing the opt-out line")
    if re.search(r"\$\s?\d", body):
        raise DraftError("first-touch draft must not contain prices")


def draft_top(store: Store, env, cfg: dict, top_n: int | None = None) -> list[dict]:
    d = cfg["draft"]
    top_n = d["top_n"] if top_n is None else top_n
    address = mailing_address(env)
    out, used = [], set()
    for p in store.prospects(["researched", "queued"], limit=200):   # ordered by score desc
        if len(out) >= top_n:
            break
        email = norm_email(p.get("email"))
        if not email or email in used or not p.get("email_source_url") or ROLE_BLOCK.match(email.split("@")[0]):
            continue
        if store.is_suppressed(email):
            log(f"draft: skipped suppressed prospect {p['id']}")
            continue
        if store.has_outreach(p["id"], d["step"]):
            continue
        subject, body = compose(p, address, d["sender_name"])
        validate(body, address)
        ev = store.insert_outreach({
            "prospect_id": p["id"], "step": d["step"], "event_type": "drafted", "review_status": "pending",
            "subject": subject, "body": body, "platform": d["platform"],
            "payload": {"to": email, "email_source_url": p["email_source_url"], "business": p["name"], "score": p.get("score")}})
        store.update_prospect(p["id"], {"status": "queued"})
        used.add(email)
        out.append({"event_id": ev.get("id"), "business": p["name"], "subject": subject, "score": p.get("score")})
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int)
    a = ap.parse_args(argv)
    store = Store(os.environ)
    if not store.configured:
        log("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
        return 2
    try:
        res = draft_top(store, os.environ, load_config(), a.top)
    except DraftError as e:
        log(f"BLOCKED: {e}")
        return 3
    print(json.dumps(res, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
