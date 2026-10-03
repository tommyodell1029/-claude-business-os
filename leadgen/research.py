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
        self._wait(host)
        return self.fetch(url, self.r["user_agent"], self.r["timeout_secs"], self.r["max_bytes"])

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
    "mentions_24_7": re.compile(r"24\s*/\s*7|24[- ]hours?|24\s*hr|around the clock|emergency (?:service|repair|calls?)", re.I),
    "has_online_booking": re.compile(r"book (?:online|now|an appointment|a service)|schedule (?:online|service|an appointment|now)|online (?:booking|scheduling)|request (?:an? )?(?:appointment|service|quote)|calendly\.com|servicetitan|housecallpro|jobber", re.I),
    "mentions_after_hours_text": re.compile(r"after[- ]hours|text us|text (?:message|us at)|sms", re.I),
}


def detect_signals(page_text: str, url: str) -> dict:
    """Simple signals, each with the literal evidence snippet and source URL. Only true signals carry evidence."""
    plain = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html.unescape(page_text)))
    sig = {"has_website": {"value": True, "url": url}}
    for name, rx in _SIGNALS.items():
        m = rx.search(plain)
        if m:
            sig[name] = {"value": True, "evidence": plain[max(0, m.start() - 40): m.end() + 40].strip(), "url": url}
        else:
            sig[name] = {"value": False}
    return sig


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
