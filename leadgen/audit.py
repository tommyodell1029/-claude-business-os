"""Website audit for the $499 one-page website offer (owner 2026-10-13).

Fetches a prospect's public homepage through the same robots.txt-respecting, rate-limited Crawler used by research,
and records only problems that can be shown from that page's own HTML. Every finding carries the evidence and the URL
it was read from, so an outreach draft can cite it word for word. Nothing is guessed: a page that could not be read is
marked "not checked", never "broken".

    python -m leadgen audit --industry plumbing --industry hvac --limit 20 [--dry-run]
"""
from __future__ import annotations

import datetime as dt
import html
import json
import re
from urllib.parse import urlparse

from .research import Crawler

# weight = how strongly the finding suggests they'd benefit from the offer (0-100 scale after summing, capped)
FINDINGS = {
    "no_website":          (45, "No website listed", "The Google Business listing has no website."),
    "site_unreachable":    (25, "Website did not load", "The website returned an error or no response when checked."),
    "no_https":            (15, "Not secure (no HTTPS)", "The site only loads over http://, so browsers can show a \"Not secure\" warning."),
    "no_viewport":         (20, "Not set up for phones", "The homepage has no mobile viewport tag, so phones show a shrunken desktop page."),
    "no_click_to_call":    (15, "No tap-to-call link", "The homepage has no tap-to-call (tel:) link."),
    "no_form":             (10, "No contact form", "The homepage has no form or online request option."),
    "missing_title":       (5,  "Missing page title", "The page title is missing or generic."),
    "missing_description": (5,  "No search description", "The page has no meta description, so Google picks its own snippet."),
    "no_h1":               (5,  "No main heading", "The page has no main (H1) heading saying what the business does."),
    "outdated_copyright":  (5,  "Looks out of date", "The footer copyright year is old."),
    "phone_not_on_page":   (10, "Phone number hard to find", "The phone number from the Google listing doesn't appear on the homepage."),
}
_BOOKING = re.compile(r"(calendly|housecallpro|servicetitan|jobber|setmore|acuityscheduling|book(ing)?[-_ ]?(now|online)|schedule[-_ ]?(service|online|now)|request[-_ ]?(service|quote|estimate))", re.I)
_GENERIC_TITLES = {"home", "homepage", "index", "welcome", "untitled", "new page"}


def _plain(page: str) -> str:
    visible = re.sub(r"(?is)<(script|style|noscript)\b.*?</\1\s*>", " ", page)
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html.unescape(visible))).strip()


def _digits(s: str) -> str:
    return re.sub(r"\D", "", s or "")[-10:]


def check_html(page: str, url: str, phone: str | None = None, today: dt.date | None = None) -> list[dict]:
    """Findings for one fetched homepage. Each: {id, title, detail, evidence, url, weight}."""
    today = today or dt.date.today()
    out: list[dict] = []

    def add(fid: str, evidence: str) -> None:
        w, title, detail = FINDINGS[fid]
        out.append({"id": fid, "title": title, "detail": detail, "evidence": evidence[:240], "url": url, "weight": w})

    if urlparse(url).scheme == "http":
        add("no_https", f"The secure (https://) connection failed; the page only loaded at {url}")
    if not re.search(r"<meta[^>]+name=[\"']?viewport", page, re.I):
        add("no_viewport", "No <meta name=\"viewport\"> tag in the homepage HTML")
    if not re.search(r"href=[\"']?tel:", page, re.I):
        add("no_click_to_call", "No link starting with tel: in the homepage HTML")
    if not re.search(r"<form\b", page, re.I) and not _BOOKING.search(page):
        add("no_form", "No <form> element and no online booking or request link on the homepage")
    m = re.search(r"<title[^>]*>(.*?)</title>", page, re.I | re.S)
    title = html.unescape(re.sub(r"\s+", " ", m.group(1))).strip() if m else ""
    if not title or title.lower() in _GENERIC_TITLES or len(title) < 6:
        add("missing_title", f"Page title: \"{title}\"" if title else "No <title> tag")
    if not re.search(r"<meta[^>]+name=[\"']?description[\"']?[^>]+content=[\"'][^\"']{10,}", page, re.I) and \
       not re.search(r"<meta[^>]+content=[\"'][^\"']{10,}[\"'][^>]+name=[\"']?description", page, re.I):
        add("missing_description", "No <meta name=\"description\"> with content")
    if not re.search(r"<h1\b", page, re.I):
        add("no_h1", "No <h1> element on the homepage")
    plain = _plain(page)
    years = [int(y) for y in re.findall(r"(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})", page, re.I)]
    if years and max(years) <= today.year - 3:
        add("outdated_copyright", f"Footer shows © {max(years)}")
    if phone and len(_digits(phone)) == 10:
        d = _digits(phone)
        if d not in re.sub(r"\D", "", plain) and d not in re.sub(r"\D", "", " ".join(re.findall(r"tel:[^\"' >]+", page, re.I))):
            add("phone_not_on_page", f"Listing phone {phone} not found in the homepage text or links")
    return out


def fit_score(findings: list[dict]) -> int:
    return min(100, sum(f["weight"] for f in findings))


def audit_prospect(crawler: Crawler, p: dict, today: dt.date | None = None) -> dict:
    """{status: checked|not_checked|no_website, findings, fit, checked_at, url}. Never raises."""
    now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    site = (p.get("website") or "").strip()
    if not site:
        f = [{"id": "no_website", "title": FINDINGS["no_website"][1], "detail": FINDINGS["no_website"][2],
              "evidence": "Google Business listing has no website field", "url": None, "weight": FINDINGS["no_website"][0]}]
        return {"status": "no_website", "findings": f, "fit": fit_score(f), "checked_at": now, "url": None}
    rest = re.sub(r"^https?://", "", site, flags=re.I)
    https_url, http_url = "https://" + rest, "http://" + rest
    host = urlparse(https_url).netloc.lower()
    if not crawler.allowed(https_url):
        return {"status": "not_checked", "reason": "robots.txt disallows or could not be read", "findings": [], "fit": None, "checked_at": now, "url": https_url}
    status, page = crawler._get(https_url, host)
    used, tls_failed = https_url, False
    if status == 599:                       # no secure connection at all (TLS/network): try plain http once
        tls_failed = True
        status, page = crawler._get(http_url, host)
        used = http_url
    if status != 200 or not page:
        if tls_failed and status == 599:
            f = [{"id": "site_unreachable", "title": FINDINGS["site_unreachable"][1], "detail": FINDINGS["site_unreachable"][2],
                  "evidence": f"No response from {https_url} or {http_url}", "url": https_url, "weight": FINDINGS["site_unreachable"][0]}]
            return {"status": "checked", "findings": f, "fit": fit_score(f), "checked_at": now, "url": https_url}
        # 403/5xx/redirect loops are often bot protection: we can't tell, so we don't claim anything
        return {"status": "not_checked", "reason": f"site answered HTTP {status} to our checker", "findings": [], "fit": None, "checked_at": now, "url": used}
    f = check_html(page, used, p.get("phone"), today)
    return {"status": "checked", "findings": f, "fit": fit_score(f), "checked_at": now, "url": used}


QUALIFY_MIN_FIT = 25
_BLOCKED_STATUSES = {"in_sequence", "replied", "interested", "not_now", "not_interested", "unsubscribed", "bounced", "do_not_contact"}


def stage_for(p: dict, a: dict) -> tuple[str, str]:
    """Pipeline stage + one-line qualification note. Prospects already contacted for the receptionist offer, or who
    opted out, are never moved into the website campaign automatically."""
    if p.get("status") in _BLOCKED_STATUSES:
        return p.get("pipeline_stage") or "contacted", "Already in the receptionist outreach or opted out: not re-pitched automatically."
    if a["status"] == "not_checked":
        return "researching", f"Website not checked ({a.get('reason')})."
    top = ", ".join(x["title"].lower() for x in sorted(a["findings"], key=lambda x: -x["weight"])[:3]) or "no problems found"
    if (a["fit"] or 0) >= QUALIFY_MIN_FIT:
        return "audit_prepared", f"Website fit {a['fit']}/100: {top}."
    return "qualified" if (a["fit"] or 0) >= 10 else "lost", f"Website fit {a['fit']}/100: {top}. Below the outreach threshold."


def run(store, crawler: Crawler, industries: list[str], limit: int, dry_run: bool = False, today: dt.date | None = None) -> dict:
    flt = ",".join(industries)
    rows = store._rest("GET", f"prospects?industry=in.({flt})&audit_at=is.null&order=score.desc.nullslast&limit={limit}"
                              "&select=id,name,industry,website,phone,status,pipeline_stage,city")
    out = {"audited": 0, "audit_prepared": 0, "not_checked": 0, "businesses": []}
    for p in rows:
        a = audit_prospect(crawler, p, today)
        stage, note = stage_for(p, a)
        out["audited"] += 1
        out["audit_prepared"] += stage == "audit_prepared"
        out["not_checked"] += a["status"] == "not_checked"
        out["businesses"].append({"name": p["name"], "industry": p["industry"], "fit": a["fit"], "stage": stage,
                                  "findings": [f["title"] for f in a["findings"]]})
        if not dry_run:
            fields = {"website_audit": a, "audit_at": a["checked_at"], "website_fit": a["fit"], "qualification_notes": note}
            if p.get("status") not in _BLOCKED_STATUSES:
                fields["pipeline_stage"] = stage
                fields["offer"] = "website"
                if stage == "lost":
                    fields["outcome"] = "Not a fit for the website offer: the homepage already covers the basics."
            store.update_prospect(p["id"], fields)
    return out


def main_cli(a, store, cfg) -> int:
    from .research import urllib_fetch
    out = run(store, Crawler(urllib_fetch, cfg), a.industry or ["plumbing", "hvac"], a.limit, a.dry_run)
    for b in out["businesses"]:
        print(f"{str(b['fit']):>4}  {b['stage']:15} {b['name'][:40]:40} {', '.join(b['findings'])[:90]}")
    print(json.dumps({k: v for k, v in out.items() if k != "businesses"}))
    return 0
