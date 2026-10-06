"""Research prospects: homepage + at most one contact/about page, robots.txt honored, polite delay, real TLS verification.

Records an email ONLY if the address literally appears on the business's own site (mailto: or visible text), together with
the page it came from. Never guesses or constructs addresses; no obfuscation decoding. No email -> status 'no_email'.
Usage: uv run python -m leadgen.research [--limit N]
"""
from __future__ import annotations

import argparse
import html
import json
import os
import re
import time
from datetime import datetime, timezone
import urllib.error
import urllib.request
import urllib.robotparser
from typing import Callable
from urllib.parse import urljoin, urlparse

from . import ROOT  # noqa: F401
from lp.text import domain_of, norm_email
from .db import Store
from .source import load_config, log

# (url, user_agent, timeout, max_bytes) -> (status, text). Never raises; 599 = no response (network/TLS error).
Fetch = Callable[[str, str, float, int], "tuple[int, str]"]


def urllib_fetch(url: str, user_agent: str, timeout: float, max_bytes: int) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"User-Agent": user_agent, "Accept": "text/html,text/plain;q=0.8"})
    try:  # default opener: TLS certificates and hostnames are verified
        with urllib.request.urlopen(req, timeout=timeout) as r:
            ctype = r.headers.get("Content-Type", "")
            if "html" not in ctype and "text" not in ctype:
                return 415, ""
            return r.status, r.read(max_bytes).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        return 599, ""


class Crawler:
    """Per-host robots.txt cache + polite delay. Every page goes through allowed() first."""

    def __init__(self, fetch: Fetch, cfg: dict, sleep: Callable[[float], None] = time.sleep, clock=time.monotonic):
        self.fetch, self.r, self.sleep, self.clock = fetch, cfg["research"], sleep, clock
        self.robots: dict[str, urllib.robotparser.RobotFileParser | bool] = {}
        self.last: dict[str, float] = {}

    def _wait(self, host: str) -> None:
        gap = self.r["delay_secs"] - (self.clock() - self.last.get(host, -1e9))
        if gap > 0:
            self.sleep(gap)
        self.last[host] = self.clock()

    def _get(self, url: str, host: str) -> tuple[int, str]:
        """One fetch, plus at most one retry when there was no response at all (599: timeout/network)."""
        for attempt in range(1 + int(self.r.get("network_retries", 1))):
            self._wait(host)
            status, text = self.fetch(url, self.r["user_agent"], self.r["timeout_secs"], self.r["max_bytes"])
            if status != 599:
                break
        return status, text

    def allowed(self, url: str) -> bool:
        u = urlparse(url)
        host = u.netloc.lower()
        if host not in self.robots:
            status, text = self._get(f"{u.scheme}://{host}/robots.txt", host)
            if status in (404, 410):
                self.robots[host] = True          # no robots.txt: everything allowed
            elif status == 200:
                rp = urllib.robotparser.RobotFileParser()
                rp.parse(text.splitlines())
                self.robots[host] = rp
            else:
                self.robots[host] = False         # 401/403/5xx/network: cannot tell, so do not crawl
        rp = self.robots[host]
        return rp if isinstance(rp, bool) else rp.can_fetch(self.r["user_agent"], url)

    def page(self, url: str) -> str | None:
        """Page text, or None if robots disallow it or the fetch failed."""
        if not self.allowed(url):
            log(f"research: robots disallow or unavailable: {urlparse(url).netloc}")
            return None
        status, text = self._get(url, urlparse(url).netloc.lower())
        return text if status == 200 else None


_EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}")
_JUNK_TLDS = ("png", "jpg", "jpeg", "gif", "svg", "webp", "css", "js")
_JUNK_DOMAINS = ("example.com", "domain.com", "email.com", "sentry.io", "wixpress.com", "sentry-next.wixpress.com", "godaddy.com", "squarespace.com")
_JUNK_LOCAL = ("your", "name", "email", "user", "username", "test")
# Inboxes that are never a sales contact (hiring, privacy, bounce handlers). Shared with draft.py.
ROLE_BLOCK = re.compile(r"^(jobs?|careers?|hr|resumes?|recruit\w*|hiring|no-?reply|do-?not-?reply|privacy|abuse|webmaster|postmaster|legal|billing|accounts?payable|ap)$")


def find_emails(page_html: str) -> list[str]:
    """Addresses literally present in the page (mailto: first, then visible text), normalized, in order, deduped."""
    text = html.unescape(page_html)
    found = [m for m in re.findall(r"mailto:([^\"'?>\s]+)", text, flags=re.I)]
    found += _EMAIL.findall(re.sub(r"<[^>]+>", " ", text))
    out = []
    for raw in found:
        e = norm_email(raw)
        if not e or e in out:
            continue
        local, _, dom = e.partition("@")
        if dom.rsplit(".", 1)[-1] in _JUNK_TLDS or dom in _JUNK_DOMAINS or local in _JUNK_LOCAL or ROLE_BLOCK.match(local):
            continue
        out.append(e)
    return out


def pick_email(emails: list[str], site_url: str) -> str | None:
    """Prefer an address on the business's own domain; otherwise the first literal address on the page."""
    d = domain_of(site_url)
    own = [e for e in emails if d and (e.split("@")[1] == d or e.split("@")[1].endswith("." + d))]
    return (own or emails or [None])[0]


def _link_to(home_html: str, base: str, keywords: list[str]) -> str | None:
    host = urlparse(base).netloc.lower().removeprefix("www.")
    for kw in keywords:
        for href in re.findall(r'href=["\']([^"\'#]+)', home_html, flags=re.I):
            u = urljoin(base, html.unescape(href))
            p = urlparse(u)
            if p.scheme in ("http", "https") and p.netloc.lower().removeprefix("www.") == host and kw in p.path.lower():
                return u
    return None


_SIGNALS = {
    "mentions_24_7": re.compile(r"24\s*/\s*7|(?<!within )(?<!in )24[- ]hours?(?: a day|\s+(?:\w+\s+)?(?:emergency|service|repair))|24\s*hr|around the clock|emergency (?:service|repair|calls?)", re.I),
    "has_online_booking": re.compile(r"book (?:online|now|an appointment|a service)|schedule (?:online|service|an appointment|now)|online (?:booking|scheduling)|request (?:an? )?(?:appointment|service|quote)|calendly\.com|servicetitan|housecallpro|jobber", re.I),
    "mentions_after_hours_text": re.compile(r"after[- ]hours|text us|text (?:message|us at)|sms", re.I),
}


# Page-structure features (raw HTML) and conversion signals (visible text). Each true signal keeps its evidence.
_HTML_FEATURES = {
    "has_tel_link": re.compile(r"href\s*=\s*[\"']tel:", re.I),
    "has_text_option": re.compile(r"href\s*=\s*[\"']sms:", re.I),
    "has_contact_form": re.compile(r"<form\b(?:(?!</form>).)*?(?:type\s*=\s*[\"']?(?:email|tel)\b|<textarea\b)", re.I | re.S),
    "has_mobile_viewport": re.compile(r"<meta[^>]+name\s*=\s*[\"']viewport", re.I),
    "has_chat_widget": re.compile(r"intercom|drift\.com|tidio|livechat|tawk\.to|podium|birdeye|smith\.ai|ruby\.com|"
                                  r"hubspot\.com/conversations|leadconnector|chatwidget|webchat", re.I),
}
_TEXT_SIGNALS = {
    "after_hours_answering": re.compile(r"answering service|live (?:person|operator|agent|answering)|"
                                        r"(?:answer|pick up)\w*\s+(?:\w+\s+){0,4}(?:24/7|24 hours|after[- ]hours|nights|weekends)|"
                                        r"(?:24/7|after[- ]hours)\s+(?:\w+\s+){0,3}(?:dispatch|answer\w*|live)", re.I),
    "slow_response": re.compile(r"(?:respond|return (?:your|all) calls?|get back to you|reply)\s+(?:\w+\s+){0,4}"
                                r"(?:24|48|72|one|two|1|2|3) (?:business )?(?:hours?|days?)|leave (?:us )?a (?:voice ?mail|message)", re.I),
    "multiple_locations": re.compile(r"\b(?:\d+|two|three|four|five|six|multiple) (?:locations|offices|branches|shops)\b", re.I),
    "text_us": re.compile(r"\btext us\b|\btext (?:message )?(?:us )?at\b", re.I),
}


def page_features(page_html: str, url: str) -> dict:
    """Structure + conversion signals for one page: {name: {value, evidence?, url}}."""
    out = {}
    for name, rx in _HTML_FEATURES.items():
        m = rx.search(page_html or "")
        out[name] = {"value": bool(m), "url": url} if m else {"value": False}
    plain = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html.unescape(re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", page_html or ""))))
    for name, rx in _TEXT_SIGNALS.items():
        m = rx.search(plain)
        out[name] = ({"value": True, "evidence": plain[max(0, m.start() - 40): m.end() + 40].strip(), "url": url}
                     if m else {"value": False})
    if out["text_us"]["value"]:
        out["has_text_option"] = out["text_us"]
    out.pop("text_us")
    return out


def merge_signals(*sigs: dict) -> dict:
    """Signal is true if true on any page read (first evidence kept)."""
    merged: dict = {}
    for sg in sigs:
        for k, v in (sg or {}).items():
            if k not in merged or (v.get("value") and not merged[k].get("value")):
                merged[k] = v
    return merged


def detect_signals(page_text: str, url: str) -> dict:
    """Simple signals, each with the literal evidence snippet and source URL. Only true signals carry evidence."""
    visible = re.sub(r"(?is)<(script|style|noscript)\b.*?</\1\s*>", " ", page_text)   # code is not site copy
    plain = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html.unescape(visible)))
    sig = {"has_website": {"value": True, "url": url}}
    for name, rx in _SIGNALS.items():
        m = rx.search(plain)
        if m:
            sig[name] = {"value": True, "evidence": plain[max(0, m.start() - 40): m.end() + 40].strip(), "url": url}
        else:
            sig[name] = {"value": False}
    return sig


def research_site(crawler: Crawler, p: dict, cfg: dict) -> dict:
    """Full site read for the enrichment pipeline: homepage + at most one contact page + at most one people page
    (robots.txt honored, polite delay). Returns PATCH fields plus private keys `_people` and `_emails`
    ([(email, page_url)]) that the pipeline uses and never writes as columns."""
    from .contacts import extract_people
    now = datetime.now(timezone.utc).isoformat()
    site = p.get("website")
    base = {"research_timestamp": now, "domain": domain_of(site) if site else p.get("domain")}
    if not site or urlparse(site).scheme not in ("http", "https"):
        return {**base, "status": "no_email", "signals": {"has_website": {"value": False}}, "_people": [], "_emails": []}
    home = crawler.page(site)
    if home is None:
        return {**base, "status": "no_email", "signals": {"has_website": {"value": True, "url": site, "fetched": False}},
                "_people": [], "_emails": []}
    pages = [(site, home)]
    contact = _link_to(home, site, cfg["research"]["extra_page_keywords"])
    people_kw = cfg["research"].get("people_page_keywords") or []
    people_pg = _link_to(home, site, people_kw) if people_kw else None
    for extra in dict.fromkeys(u for u in (contact, people_pg) if u and u != site):
        body = crawler.page(extra)
        if body:
            pages.append((extra, body))
    signals = merge_signals(detect_signals(home, site), *[page_features(b, u) for u, b in pages])
    signals["site_https"] = {"value": site.startswith("https://")}
    emails, people = [], []
    for u, b in pages:
        emails += [(e, u) for e in find_emails(b) if e not in {x for x, _ in emails}]
        people += extract_people(b, u)
    site_email = pick_email([e for e, _ in emails], site)
    fields = {**base, "signals": signals, "_people": people, "_emails": emails}
    if site_email:
        src = next(u for e, u in emails if e == site_email)
        return {**fields, "status": "researched", "email": site_email, "email_source_url": src}
    return {**fields, "status": "no_email"}


def research_prospect(crawler: Crawler, p: dict, cfg: dict) -> dict:
    """Returns the fields to PATCH onto the prospect row."""
    site = p.get("website")
    if not site or urlparse(site).scheme not in ("http", "https"):
        return {"status": "no_email", "signals": {"has_website": {"value": False}}}
    home = crawler.page(site)
    if home is None:
        return {"status": "no_email", "signals": {"has_website": {"value": True, "url": site, "fetched": False}}}
    signals = detect_signals(home, site)
    email, src = pick_email(find_emails(home), site), site
    if not email:
        extra = _link_to(home, site, cfg["research"]["extra_page_keywords"])   # at most ONE more page
        page2 = crawler.page(extra) if extra else None
        if page2:
            email, src = pick_email(find_emails(page2), site), extra
    if email:
        return {"status": "researched", "email": email, "email_source_url": src, "signals": signals}
    return {"status": "no_email", "signals": signals}


def research(store: Store, crawler: Crawler, cfg: dict, limit: int = 100) -> dict:
    counts = {"researched": 0, "no_email": 0}
    for p in store.prospects(["new"], order="created_at.asc", limit=limit):
        fields = research_prospect(crawler, p, cfg)
        store.update_prospect(p["id"], fields)
        counts[fields["status"]] += 1
    return counts


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=100)
    a = ap.parse_args(argv)
    store = Store(os.environ)
    if not store.configured:
        log("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
        return 2
    cfg = load_config()
    print(json.dumps(research(store, Crawler(urllib_fetch, cfg), cfg, a.limit)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
