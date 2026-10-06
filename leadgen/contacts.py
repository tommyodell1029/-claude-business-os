"""Decision-maker identification and email classification. Pure functions; no network.

People come only from evidence: a name printed next to a title on the business's own pages, or a provider record
(Hunter / Apollo) that names the person. Nothing is invented and no email address is ever constructed here.
"""
from __future__ import annotations

import html
import re

from lp.text import norm_email

# Lower rank = better buyer. Small local service businesses: owner first. Marketing titles are never the buyer.
TITLE_RANKS: list[tuple[str, re.Pattern]] = [
    ("owner",               re.compile(r"\b(co-?)?owner\b|\bproprietor\b", re.I)),
    ("founder",             re.compile(r"\b(co-?)?founder\b", re.I)),
    ("president",           re.compile(r"\bpresident\b(?!\s+of\s+marketing)|\bceo\b|\bchief executive\b", re.I)),
    ("managing_member",     re.compile(r"\bmanaging (member|partner|director)\b|\bprincipal\b", re.I)),
    ("general_manager",     re.compile(r"\bgeneral manager\b|\bgm\b", re.I)),
    ("vp_operations",       re.compile(r"\b(vp|vice president)[, ]+(of )?operations\b|\bcoo\b|\bchief operating\b", re.I)),
    ("director_operations", re.compile(r"\bdirector of operations\b|\boperations director\b", re.I)),
    ("operations_manager",  re.compile(r"\boperations manager\b|\boffice manager\b", re.I)),
    ("service_manager",     re.compile(r"\bservice manager\b", re.I)),
    ("sales_manager",       re.compile(r"\bsales manager\b|\bdirector of sales\b", re.I)),
    ("customer_experience", re.compile(r"\bcustomer (experience|service) (manager|director|lead)\b", re.I)),
]
EXCLUDE_TITLE = re.compile(r"\bmarketing\b|\bseo\b|\bsocial media\b|\bintern\b|\btechnician\b|\binstaller\b|"
                           r"\bapprentice\b|\bassistant\b|\breceptionist\b|\bcsr\b", re.I)

GENERIC_LOCAL = re.compile(r"^(info|service|services|contact|contactus|office|admin|support|hello|hi|sales|team|"
                           r"help|mail|email|inquiries|inquiry|enquiries|booking|bookings|schedule|scheduling|"
                           r"appointments?|customerservice|cs|dispatch|estimates?|quotes?|general|frontdesk|reception|"
                           r"jobs?|careers?|hr|billing|accounts?|noreply|no-?reply|webmaster|marketing)\d*$", re.I)
FREE_MAIL = {"gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com", "me.com", "live.com",
             "msn.com", "comcast.net", "att.net", "bellsouth.net", "verizon.net", "ymail.com", "protonmail.com",
             "proton.me", "mail.com", "gmx.com"}

_NAME = r"([A-Z][a-z]+(?:[-'][A-Z][a-z]+)?(?:[ \t]+[A-Z]\.)?[ \t]+[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?)"
_TITLE_WORDS = (r"(?i:co-?owner|owner|proprietor|co-?founder|founder|president|ceo|chief executive officer|"
                r"managing (?:member|partner|director)|principal|general manager|vice president of operations|"
                r"vp of operations|coo|director of operations|operations manager|office manager|service manager|"
                r"sales manager|director of sales)")
_STOP_FIRST = {"Our", "The", "Meet", "About", "Contact", "Call", "Free", "Your", "We", "Get", "Learn", "Read", "View",
               "Home", "Service", "Services", "Request", "Schedule", "Jacksonville", "North", "South", "East", "West",
               "Florida", "Family", "Owned", "Locally", "Customer", "Best", "Top", "Licensed", "Insured",
               "Independent", "Agent", "Franchise", "Franchisee", "Business", "Company", "Team", "Office", "General",
               "Local", "Owner", "Operator", "Each", "Every", "Proud", "Veteran", "Woman", "Women", "Certified"}
# "John Smith, Owner" / "John Smith - President" / "John Smith | Founder"
_T = "(" + _TITLE_WORDS + ")"
_P1 = re.compile(_NAME + r"[ \t]*(?:,|-|–|—|\||:|\()[ \t]*(?:the[ \t]+)?(?:our[ \t]+)?" + _T + r"\b")
# "Owner: John Smith" / "Owner John Smith" / "founded by John Smith" / "President & CEO John Smith"
_P2 = re.compile(r"\b" + _T + r"(?:[ \t]*(?:&|and)[ \t]*" + _TITLE_WORDS + r")?[ \t]*(?::|-|–|—|,)?[ \t]+" + _NAME)
_P3 = re.compile(r"\b(?:[Ff]ounded|[Ss]tarted|[Oo]wned|[Oo]perated)[ \t]+(?:in[ \t]+\d{4}[ \t]+)?by[ \t]+" + _NAME)


def visible_text(page_html: str) -> str:
    """Page text with one line per block element, so a name and a title are only paired inside the same block."""
    t = re.sub(r"(?is)<(script|style|noscript)\b.*?</\1>", " ", page_html or "")
    t = re.sub(r"(?i)<br\s*/?>|</(p|div|li|h[1-6]|td|tr|section|article|header|footer|figcaption|span)>", "\n", t)
    t = html.unescape(re.sub(r"<[^>]+>", " ", t))
    return "\n".join(" ".join(line.split()) for line in t.splitlines() if line.strip())


def title_rank(title: str | None) -> tuple[int, str] | None:
    """(rank, key) for a buyer title; None for excluded or unknown titles."""
    if not title or EXCLUDE_TITLE.search(title):
        return None
    for i, (key, rx) in enumerate(TITLE_RANKS):
        if rx.search(title):
            return i, key
    return None


def _clean_name(raw: str) -> str | None:
    name = " ".join(raw.split())
    parts = name.split()
    if len(parts) < 2 or parts[0] in _STOP_FIRST or parts[-1] in _STOP_FIRST:
        return None
    if any(len(p.rstrip(".")) < 2 and not p.endswith(".") for p in parts):
        return None
    return name


def extract_people(page_html: str, url: str) -> list[dict]:
    """People named next to a buyer title on one page. Each carries the literal evidence and the page URL."""
    text = visible_text(page_html)
    found: dict[str, dict] = {}
    for rx, name_group, title_group in ((_P1, 1, 2), (_P2, 2, 1), (_P3, 1, None)):
        for m in rx.finditer(text):
            name = _clean_name(m.group(name_group))
            title = m.group(title_group) if title_group else "Owner"
            if not name or not title_rank(title):
                continue
            ev = " ".join(text[max(0, m.start() - 30): m.end() + 30].split())
            key = name.lower()
            cand = {"name": name, "title": title.strip().title(), "source": "company_site", "profile": url,
                    "evidence": ev, "confidence": 0.6}
            if key not in found or title_rank(cand["title"])[0] < title_rank(found[key]["title"])[0]:
                found[key] = cand
    return list(found.values())


def rank_candidates(cands: list[dict], *, larger_business: bool = False) -> list[dict]:
    """Best buyer first. Same person from several sources is merged and gains confidence (corroboration)."""
    merged: dict[str, dict] = {}
    for c in cands:
        if not c.get("name") or not title_rank(c.get("title")):
            continue
        k = " ".join(c["name"].lower().split())
        if k in merged:
            m = merged[k]
            srcs = set(m["sources"]) | {c.get("source")}
            m["sources"] = sorted(s for s in srcs if s)
            m["confidence"] = min(0.95, max(m["confidence"], c.get("confidence", 0.5)) + 0.2)
            if title_rank(c["title"])[0] < title_rank(m["title"])[0]:
                m["title"] = c["title"]
            for f in ("email", "linkedin", "profile"):
                m[f] = m.get(f) or c.get(f)
        else:
            merged[k] = {**c, "sources": [c.get("source")] if c.get("source") else []}
    out = list(merged.values())
    out.sort(key=lambda c: (title_rank(c["title"])[0], -c["confidence"]))
    return out


def split_name(name: str) -> tuple[str, str]:
    parts = [p for p in name.split() if not p.endswith(".")]
    return (parts[0], parts[-1]) if len(parts) >= 2 else (name, "")


def is_generic(email: str | None) -> bool:
    e = norm_email(email)
    return bool(e) and bool(GENERIC_LOCAL.match(e.split("@")[0]))


def is_free_mail(email: str | None) -> bool:
    e = norm_email(email)
    return bool(e) and e.split("@")[1] in FREE_MAIL


def matches_person(email: str | None, name: str | None) -> bool:
    """Local part contains the person's first or last name (e.g. john@, jsmith@, john.smith@)."""
    e, n = norm_email(email), (name or "").lower()
    if not e or not n:
        return False
    first, last = (x.lower() for x in split_name(name))
    local = re.sub(r"[^a-z]", "", e.split("@")[0])
    return bool((len(first) >= 3 and first in local) or (len(last) >= 3 and last in local))


def classify_email(email: str | None, verifier_result: str | None, *, domain: str | None = None) -> str:
    """verified | likely | unknown | invalid | generic | personal. Only an independent verifier can say 'verified'."""
    e = norm_email(email)
    if not e:
        return "unknown"
    if is_generic(e):
        return "generic"
    if is_free_mail(e):
        return "personal"
    v = (verifier_result or "").lower()
    if v in ("valid", "verified", "deliverable"):
        return "verified"
    if v in ("invalid", "undeliverable", "disposable", "blocked"):
        return "invalid"
    if v in ("accept_all", "catch_all", "risky", "likely", "likely_to_engage", "guessed"):
        return "likely"
    return "unknown"
