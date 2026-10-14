"""First-contact packets for the $499 website offer (owner 2026-10-13). PREPARES ONLY; never sends or calls.

For every `audit_prepared` prospect it writes one packet for the owner to approve:
- the verified website findings (exact evidence + where it was read),
- the channel: a first-touch email only to an address an independent verifier marked deliverable; otherwise a short
  call script for the OWNER to use (lead gen never places calls),
- an `outreach_events` row: drafted / pending, payload.offer = "website", so it shows in the approval queue.
Packets are also saved to ops/launchpad/packets/<slug>.md for reading on the phone.

    python -m leadgen website-drafts [--dry-run]
"""
from __future__ import annotations

import os
import re

from .draft import OPT_OUT, mailing_address, validate

PACKETS = os.path.join(os.path.dirname(__file__), "..", "ops", "launchpad", "packets")


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:60]


def _problems(p: dict) -> list[dict]:
    a = p.get("website_audit") or {}
    return sorted(a.get("findings") or [], key=lambda f: -f.get("weight", 0))


def _plain_problem(f: dict) -> str:
    return {
        "no_website": "I couldn't find a website for you on your Google listing",
        "site_unreachable": "your website didn't load when I tried it",
        "no_https": "your site loads without the padlock, so some browsers show \"Not secure\"",
        "no_viewport": "your homepage isn't set up for phones, so it shows a shrunken desktop page",
        "no_click_to_call": "there's no tap-to-call button on your homepage",
        "no_form": "there's no way to send a request from the homepage",
        "phone_not_on_page": "I had trouble finding your phone number on the homepage",
        "no_h1": "the homepage doesn't say up top what you do",
        "missing_description": "Google has no description to show for your site",
        "missing_title": "your page title is blank or generic",
        "outdated_copyright": "the footer date makes the site look out of date",
    }.get(f["id"], f["title"].lower())


def call_script(p: dict) -> str:
    probs = _problems(p)[:2]
    said = " and ".join(_plain_problem(f) for f in probs) or "your website could be easier to use on a phone"
    return "\n".join([
        f"Hi, is this the owner of {p['name']}? My name's Tommy, I run LaunchPad Local here in Jacksonville. Have you got one minute?",
        "",
        f"I build simple websites for plumbing and HVAC companies. I looked you up and noticed {said}.",
        "",
        "Most of your customers find you on their phone. A clear one-page site with a big call button and a short request form "
        "makes it easy for them to reach you. I can build that in 3 to 5 business days once I have your details.",
        "",
        "Would it help if I sent you a quick example of what yours could look like? No cost to look.",
        "",
        "If not interested: \"No problem at all, thanks for your time.\" Mark the lead lost and never call again.",
        "Never promise more calls, rankings or revenue. Don't quote a price unless they ask.",
    ])


def email_draft(p: dict, address: str) -> tuple[str, str]:
    probs = _problems(p)[:2]
    said = " and ".join(_plain_problem(f) for f in probs)
    body = "\n".join([
        "Hi,", "",
        f"I looked at {p['name']} online and noticed {said}." if said else f"I looked at {p['name']} online.", "",
        "I run LaunchPad Local, a Jacksonville company that builds simple one-page websites for plumbing and HVAC "
        "businesses: your services, a big tap-to-call button and a short request form that comes straight to you.", "",
        f"Would it help if I put together a quick example of what one could look like for {p['name']}? No cost to look.", "",
        "Thanks,", "Tommy", "LaunchPad Local", address, "", OPT_OUT,
    ])
    validate(body, address)   # mailing address + opt-out present, no prices in a first touch
    return f"Website for {p['name']}", body


def packet(p: dict, env) -> dict:
    verified = p.get("email") and p.get("email_verification_status") == "verified"
    probs = _problems(p)
    out = {"prospect_id": p["id"], "name": p["name"], "channel": "email" if verified else "phone",
           "to": p.get("email") if verified else p.get("phone"), "findings": probs}
    if verified:
        out["subject"], out["body"] = email_draft(p, mailing_address(env))
    else:
        out["subject"], out["body"] = f"Call script: {p['name']}", call_script(p)
    return out


def render_md(k: dict, p: dict) -> str:
    ev = "\n".join(f"- **{f['title']}**: {f['evidence']}" + (f" ({f['url']})" if f.get("url") else "") for f in k["findings"]) or "- none"
    return (f"# {k['name']}\n\n- Stage: audit prepared, awaiting your approval\n- Channel: **{k['channel']}** → {k['to'] or 'no contact found'}\n"
            f"- Website: {p.get('website') or 'none listed'}\n- Google rating: {p.get('rating') or 'n/a'} ({p.get('review_count') or 0} reviews)\n"
            f"- Address: {p.get('address') or 'n/a'}\n\n## Verified findings (quote only these)\n{ev}\n\n## {k['subject']}\n\n```\n{k['body']}\n```\n\n"
            "Approve in chat (\"approve <name>\"), or skip. Nothing is sent or called by the system.\n")


def run(store, env, dry_run: bool = False) -> list[dict]:
    rows = store._rest("GET", "prospects?pipeline_stage=eq.audit_prepared&select=*")
    done = []
    os.makedirs(PACKETS, exist_ok=True)
    for p in rows:
        if store._rest("GET", f"outreach_events?prospect_id=eq.{p['id']}&event_type=eq.drafted&payload->>offer=eq.website&select=id"):
            continue   # already has a pending website packet
        k = packet(p, env)
        with open(os.path.join(PACKETS, f"{_slug(p['name'])}.md"), "w") as f:
            f.write(render_md(k, p))
        if not dry_run:
            store.insert_outreach({"prospect_id": p["id"], "step": 0, "event_type": "drafted", "review_status": "pending",
                                   "subject": k["subject"], "body": k["body"], "platform": "gmail" if k["channel"] == "email" else None,
                                   "payload": {"offer": "website", "channel": k["channel"], "to": k["to"],
                                               "finding_ids": [f["id"] for f in k["findings"]]}})
            store.update_prospect(p["id"], {"pipeline_stage": "awaiting_approval"})
        done.append({"name": p["name"], "channel": k["channel"]})
    return done
