"""Saturday call sheet: one full, personalized script per lead, in calling order (owner 2026-10-14).

Reads ops/launchpad/call_notes.yaml (sourced facts + hook + pain question per lead) and the prospect rows, and writes
ops/launchpad/CALL_SHEET.md. Honest cold-call style: say it's a cold call, ask permission, lead with something real
about their business, ask about their problem, offer a free no-strings preview. No income claims, no fake urgency.
Prices come from config/offerings.yaml.

    python -m leadgen call-sheet
"""
from __future__ import annotations

import os
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
NOTES = ROOT / "ops" / "launchpad" / "call_notes.yaml"
OUT = ROOT / "ops" / "launchpad" / "CALL_SHEET.md"


def _offer() -> dict:
    o = yaml.safe_load((ROOT / "config" / "offerings.yaml").read_text())["services"]["website_starter"]
    return {"price": o["price"]["build"], "care": o["price"]["maintenance_monthly"], "delivery": o["delivery"], "payment": o["payment"]}


def _tel(p: str | None) -> str:
    d = "".join(c for c in (p or "") if c.isdigit())[-10:]
    return f"[({d[:3]}) {d[3:6]}-{d[6:]}](tel:+1{d})" if len(d) == 10 else "no number on file"


def _trade(name: str) -> str:
    n = name.lower()
    return "AC" if any(k in n for k in ("cool", "air", " ac ", "hvac", "heating")) else "plumbing"


def script(n: dict, p: dict, o: dict) -> str:
    name = n["name"]
    short = name.replace(", Inc.", "").replace(" Inc", "").replace(" LLC", "").replace(" Co", "").strip().title() if name.isupper() else name.replace(", Inc.", "").replace(" Inc", "").strip()
    trade = _trade(name)
    has_site = bool(p.get("website"))
    job = "fix a leak" if trade == "plumbing" else "fix an AC"
    expired = "expired" in " ".join(n["facts"]).lower()
    preview = ("a quick example of a new one-page site you could point that Google link to instead" if expired
               else "a quick example of a cleaner, phone-friendly version of your homepage" if has_site
               else "a quick example of what a one-page website for you could look like, using what's already on your Google listing")
    lines = [
        f"## {n['order']}. {name}",
        f"**Call:** {_tel(n.get('phone') or p.get('phone'))} · **Where:** {p.get('city') or 'n/a'} · **Website:** {p.get('website') or 'none on Google listing'}",
        "",
        "**What you know (all verified):**",
        *[f"- {f}" for f in n["facts"]],
        f"- *Why it matters:* {n['why_it_matters']}",
        "",
        "### The call",
        "**1. Open (friendly, honest, 10 seconds)**",
        f"> \"Hi, is this the owner of {short}? … Hey, this is Tommy with LaunchPad Local, here in Jacksonville. I'll be honest, this is a cold call. "
        "Can I have 30 seconds, and if it's not useful you can tell me to get lost?\"",
        "",
        "*If it's someone else answering:* \"No problem. Who's the best person to talk to about the company's website and how customers find you online? "
        "When's a good time to catch them?\" Write the name down and say thanks.",
        "",
        "**2. Why you called (personal, real)**",
        f"> \"{n['hook']}\"",
        "",
        "**3. Ask, then listen**",
        f"> \"{n['pain']}\"",
        "",
        "*Let them talk. Nod along. Repeat back what you hear (\"So most of it's word of mouth, and the rest come off Google?\").*",
        "",
        "**4. What you do (one breath)**",
        f"> \"I build simple one-page websites for {trade} companies: your services, your service area, a big tap-to-call button and a short request form "
        f"that comes straight to your phone or email. It's built for people searching on their phone, and it's done in a few days.\"",
        "",
        "**5. The easy yes**",
        f"> \"Here's what I'd suggest. Let me put together {preview}. No charge, no commitment. I'll text or email it to you, "
        "you look at it when you have a minute, and if you don't like it, just delete it. Fair?\"",
        "",
        "**6. Lock it in**",
        "> \"What's the best number to text it to, or an email if you'd rather?\" … \"Perfect. I'll have it to you by Tuesday. "
        "Mind if I give you a quick call Wednesday to hear what you think?\"",
        "",
        "*Write down: their name, best number or email, the best time to call back, and anything they said about how they get work.*",
        "",
        "### If they say…",
        f"- **\"Not interested.\"** → \"Totally fair. Can I ask, is it that you're already set on getting customers, or just bad timing? "
        "… Got it. If you ever want that free example, I'm in Jacksonville, Tommy, LaunchPad Local. Have a good one.\" *(Mark lost. Never call again.)*",
        f"- **\"How much is it?\"** → \"${o['price']} one time for the website. Half to start, half when you approve it. "
        f"Hosting and small updates are optional at ${o['care']} a month, cancel anytime. But see the example first. If you don't like it, it costs you nothing.\"",
        "- **\"We get enough work from word of mouth.\"** → \"That's the best kind of work, and your reviews show it. The site isn't to replace that. "
        "It's for when somebody hears your name from a neighbor and looks you up. Right now they find the Google listing and that's it. "
        "The site just backs up what people already say about you.\"",
        "- **\"I don't need a website, Google's enough.\"** → \"Google's great, and you're doing well there. A site gives you a place where you control what people see: "
        "your services, your area, your story, and a form for when you're under a sink and can't answer. "
        "Totally your call. The free example will show you the difference in two minutes.\"",
        f"- **\"I'm too busy right now.\"** → \"I get it, you're out doing the work. That's why I'll do the work. Just give me a number to text the example to, "
        "and you look whenever. No call needed unless you want one.\"",
        "- **\"Just send me some info.\"** → \"Happy to. Better than a brochure, I'll send you the actual example built for your business. "
        "What's the best number or email?\"",
        "- **\"How'd you get my number?\" / \"Is this a scam?\"** → \"Fair question. It's your public Google Business listing. I'm a local guy in Jacksonville, LaunchPad Local, "
        "launchpadlocal.org. No payment until you've seen and approved your site, and you can look me up first.\"",
        "- **\"I already pay HomeAdvisor / Angi / Thumbtack.\"** → \"Lots of good plumbers do. This doesn't replace that, it's a one-time cost, not per lead. "
        "Your own site means people who already found you can reach you directly.\"",
        ("- **\"We already have a website / someone handles it.\"** → \"Great. Then this might just be a quick fix for them. "
         + ("Do you know your website link on Google is pointing to an expired domain? I'd pass that along to them today either way. "
            if expired else
            "On a phone your number isn't tap-to-call and there's no request form. That's an easy fix for whoever does it. ")
         + "If you ever want a second option, I'm happy to send an example.\"") if has_site else
        "- **\"My nephew / buddy is going to build us one.\"** → \"Nice, family help is great. If it doesn't end up happening, "
        "the example's yours to keep, no strings. Want me to send it anyway so you've got something to compare?\"",
        "- **\"Call me back later.\"** → \"Sure thing. What day and time is best?\" *(Tell ULTRON: follow up on that date.)*",
        "- **\"My wife / partner handles that.\"** → \"Makes sense. Could I send the example to both of you? What's the best number for them?\"",
        f"- **\"That's too expensive.\"** → \"Understood. For comparison, it's about the cost of one or two service calls, one time, and it's yours. "
        "No pressure at all. Want to see the example before you decide?\"",
        "",
        "**Voicemail (20 seconds):**",
        f"> \"Hi, this is Tommy with LaunchPad Local here in Jacksonville. I was looking at {short} online and had a quick idea about your website. "
        "No sales pitch on voicemail. Give me a call back at [your number] when you have a minute. Thanks!\"",
        "",
        "**After the call, tell ULTRON:**",
        f"- Said yes to the example → \"move {short} to replied, follow up Wednesday\" *(then tell me to build their preview)*",
        f"- Voicemail / no answer → \"move {short} to contacted, follow up Tuesday\"",
        f"- Not interested → \"mark {short} lost: not interested\"",
        "",
        "---",
        "",
    ]
    return "\n".join(lines)


def build(store) -> str:
    notes = sorted(yaml.safe_load(NOTES.read_text())["leads"], key=lambda n: n["order"])
    rows = {r["name"]: r for r in store._rest("GET", "prospects?pipeline_stage=eq.awaiting_approval&select=name,city,phone,website")}
    o = _offer()
    head = [
        "# Saturday call sheet: Oct 18, 9–11am",
        "",
        f"{len(notes)} calls, in order. Scroll down after each one. Every fact under \"What you know\" was checked on the business's Google listing, "
        "website or a public directory, so you can say it with confidence.",
        "",
        "**The goal of every call isn't to sell the website. It's to get a yes to a free example.** The example sells it.",
        "",
        "Rules:",
        "- Never promise more calls, rankings or money.",
        "- Never make up a deadline.",
        "- If they say no, thank them, and never call again.",
        "",
        "---",
        "",
    ]
    missing = [n["name"] for n in notes if n["name"] not in rows]
    if missing:
        raise SystemExit(f"call notes for leads not awaiting approval: {missing}")
    return "\n".join(head) + "".join(script(n, rows[n["name"]], o) for n in notes)


def main_cli(store) -> int:
    OUT.write_text(build(store))
    print(f"wrote {OUT.relative_to(ROOT)}")
    return 0
