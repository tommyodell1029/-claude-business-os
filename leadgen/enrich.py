"""Contact enrichment waterfall: decision-maker -> professional email -> independent verification.

Order (config enrichment.providers): company_site (people + addresses printed on the business's own pages) ->
hunter -> apollo. Hunter/Apollo run over HTTP when HUNTER_API_KEY / APOLLO_API_KEY are set, or from a results file
the session builds with the Hunter / Apollo connectors (`leadgen enrich --results r.json`). Keys go in headers only.

Rules: no address is ever constructed here; a provider's address only counts when Hunter's verifier says it is
deliverable ("verified"). Generic inboxes (info@, office@ ...) and free-mail addresses never qualify as the
decision-maker's email. A failed or missing provider is skipped, never fatal. Credits are spent only on qualified
businesses and only up to enrichment.max_per_run lookups.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from urllib.parse import urlencode

from agents.notify.http import Http, HttpError, call
from lp.text import norm_email, redact
from .contacts import classify_email, is_free_mail, is_generic, matches_person, rank_candidates, split_name

HUNTER = "https://api.hunter.io/v2"
APOLLO = "https://api.apollo.io/api/v1"


class Budget:
    def __init__(self, limit: int):
        self.limit, self.used, self.log = limit, 0, []

    def take(self, what: str) -> bool:
        if self.used >= self.limit:
            return False
        self.used += 1
        self.log.append(what)
        return True


# ---------------------------------------------------------------- providers
class Hunter:
    """Hunter v2 over HTTP (X-API-KEY header). Methods return raw `data` dicts, or None on any failure."""
    name = "hunter"

    def __init__(self, key: str, http: Http):
        self.key, self.http = key, http

    def _get(self, path: str, params: dict) -> dict | None:
        try:
            text = call(self.http, "hunter", "GET", f"{HUNTER}/{path}?{urlencode(params)}", {"X-API-KEY": self.key})
            return (json.loads(text) or {}).get("data")
        except (HttpError, ValueError) as e:
            raise ProviderError(f"hunter {path}: {redact(str(e))[:200]}") from e

    def domain_search(self, domain: str) -> dict | None:
        return self._get("domain-search", {"domain": domain, "limit": 10})

    def email_finder(self, domain: str, first: str, last: str) -> dict | None:
        return self._get("email-finder", {"domain": domain, "first_name": first, "last_name": last})

    def verify(self, email: str) -> dict | None:
        return self._get("email-verifier", {"email": email})


class Apollo:
    """Apollo people match over HTTP (X-Api-Key header). Never asks for personal emails."""
    name = "apollo"

    def __init__(self, key: str, http: Http):
        self.key, self.http = key, http

    def people_match(self, domain: str, first: str, last: str) -> dict | None:
        body = {"first_name": first, "last_name": last, "domain": domain, "reveal_personal_emails": False}
        try:
            text = call(self.http, "apollo", "POST", f"{APOLLO}/people/match", {"X-Api-Key": self.key}, body)
            return (json.loads(text) or {}).get("person")
        except (HttpError, ValueError) as e:
            raise ProviderError(f"apollo people/match: {redact(str(e))[:200]}") from e


class ResultsFile:
    """Provider results gathered in-session with the Hunter / Apollo connectors, keyed by domain:
    {"<domain>": {"hunter_domain_search": <data>, "hunter_finder": {"First Last": <data>},
                  "hunter_verify": {"<email>": <data>}, "apollo_match": {"First Last": <person>}}}"""

    def __init__(self, data: dict):
        self.data = {k.lower(): v for k, v in (data or {}).items()}

    def hunter(self):
        rf = self

        class _H:
            name = "hunter"

            def domain_search(self, domain):
                return (rf.data.get(domain) or {}).get("hunter_domain_search")

            def email_finder(self, domain, first, last):
                return ((rf.data.get(domain) or {}).get("hunter_finder") or {}).get(f"{first} {last}")

            def verify(self, email):
                for v in rf.data.values():
                    hit = (v.get("hunter_verify") or {}).get(email)
                    if hit:
                        return hit
                return None
        return _H()

    def apollo(self):
        rf = self

        class _A:
            name = "apollo"

            def people_match(self, domain, first, last):
                return ((rf.data.get(domain) or {}).get("apollo_match") or {}).get(f"{first} {last}")
        return _A()


class ProviderError(Exception):
    pass


def providers_from_env(env, http: Http, results: dict | None = None) -> dict:
    out = {}
    if (env.get("HUNTER_API_KEY") or "").strip():
        out["hunter"] = Hunter(env["HUNTER_API_KEY"].strip(), http)
    if (env.get("APOLLO_API_KEY") or "").strip():
        out["apollo"] = Apollo(env["APOLLO_API_KEY"].strip(), http)
    if results:
        rf = ResultsFile(results)
        out.setdefault("hunter", rf.hunter())
        out.setdefault("apollo", rf.apollo())
    return out


# ---------------------------------------------------------------- normalizers (raw provider data -> candidates)
def hunter_people(data: dict | None) -> list[dict]:
    out = []
    for e in (data or {}).get("emails") or []:
        first, last = (e.get("first_name") or "").strip(), (e.get("last_name") or "").strip()
        if not first or not last:
            continue
        out.append({"name": f"{first} {last}", "title": e.get("position_raw") or e.get("position") or "", "source": "hunter",
                    "email": norm_email(e.get("value")), "linkedin": e.get("linkedin"),
                    "hunter_status": ((e.get("verification") or {}).get("status")),
                    "confidence": 0.5 + min(0.3, (e.get("confidence") or 0) / 300),
                    "public_sources": len(e.get("sources") or [])})
    return out


def verify_status(verifier, email: str, budget: Budget, usage: list) -> tuple[str, float | None, str]:
    """(email_verification_status, confidence 0-1, note). Uses the independent verifier; no verifier -> 'unknown'."""
    if is_generic(email):
        return "generic", None, "generic inbox"
    if is_free_mail(email):
        return "personal", None, "free-mail address"
    if not verifier:
        return "unknown", None, "no verifier configured"
    if not budget.take(f"hunter verify {email}"):
        return "unknown", None, "enrichment budget spent"
    try:
        r = verifier.verify(email)
    except ProviderError as e:
        return "unknown", None, str(e)
    usage.append({"provider": "hunter", "call": "email-verifier"})
    if not r:
        return "unknown", None, "verifier had no result"
    st = classify_email(email, r.get("status") or r.get("result"))
    score = r.get("score")
    return st, (round(score / 100, 2) if isinstance(score, (int, float)) else None), f"hunter: {r.get('status')}"


# ---------------------------------------------------------------- waterfall
def enrich(p: dict, site_people: list[dict], site_emails: list[tuple[str, str]], providers: dict, budget: Budget,
           cfg: dict) -> dict:
    """Fields to PATCH for one qualified prospect. Never raises on provider failure."""
    order = cfg["enrichment"]["providers"]
    domain = p.get("domain")
    log, usage = [], []
    cands = list(site_people)
    hunter, apollo = providers.get("hunter"), providers.get("apollo")
    if "hunter" in order and hunter and domain and budget.take(f"hunter domain-search {domain}"):
        try:
            data = hunter.domain_search(domain)
            if data is None:             # results file has no lookup for this domain: say so, never imply a search
                log.append("hunter: not looked up for this domain")
            else:
                usage.append({"provider": "hunter", "call": "domain-search"})
                hp = hunter_people(data)
                cands += hp
                log.append(f"hunter domain-search: {len(hp)} named contacts")
        except ProviderError as e:
            log.append(f"hunter failed: {e}")
    # A contact with no title whose full name is the business's name ("Michael Adams" at Michael Adams Plumbing) is
    # treated as the owner; the title says it is inferred, and emails never state a title anyway.
    biz = " ".join((p.get("name") or "").lower().split())
    for c in cands:
        nm = " ".join((c.get("name") or "").lower().split())
        if not (c.get("title") or "").strip() and len(nm.split()) >= 2 and nm in biz:
            c["title"] = "Owner (inferred: business carries their name)"
    ranked = rank_candidates(cands)
    if not ranked:
        return {"enrichment_status": "needs_contact_enrichment", "_log": log + ["no decision-maker identified"],
                "_usage": usage}
    dm = ranked[0]
    first, last = split_name(dm["name"])
    out = {"decision_maker_name": dm["name"], "decision_maker_title": dm["title"],
           "decision_maker_source": "+".join(dm.get("sources") or [dm.get("source", "")]),
           "decision_maker_profile": dm.get("linkedin") or dm.get("profile"),
           "decision_maker_confidence": round(min(0.95, dm["confidence"]), 2)}
    log.append(f"decision-maker: {dm['name']} ({dm['title']}) via {out['decision_maker_source']}")

    # Email candidates for THIS person, best evidence first. Generic and free-mail addresses are recorded, not chosen.
    tried: list[tuple[str, str, str | None]] = []          # (email, source, page it was printed on)
    for e, url in site_emails:
        if matches_person(e, dm["name"]) and not is_generic(e):
            tried.append((e, "company_site", url))
    if dm.get("email") and not is_generic(dm["email"]):
        tried.append((dm["email"], "hunter_domain_search", None))
    if "hunter" in order and hunter and domain and not tried and budget.take(f"hunter email-finder {dm['name']}"):
        try:
            f = hunter.email_finder(domain, first, last)
            usage.append({"provider": "hunter", "call": "email-finder"})
            if f and f.get("email"):
                tried.append((norm_email(f["email"]), "hunter_finder", None))
        except ProviderError as e:
            log.append(f"hunter finder failed: {e}")
    if "apollo" in order and apollo and domain and not tried and budget.take(f"apollo match {dm['name']}"):
        try:
            a = apollo.people_match(domain, first, last)
            usage.append({"provider": "apollo", "call": "people/match"})
            if a and a.get("email"):
                tried.append((norm_email(a["email"]), "apollo", None))
                if a.get("title") and not dm["title"]:
                    out["decision_maker_title"] = a["title"]
        except ProviderError as e:
            log.append(f"apollo failed: {e}")

    best = None
    for email, src, url in tried:
        st, conf, note = verify_status(hunter, email, budget, usage)
        log.append(f"email {email} ({src}): {st} [{note}]")
        if best is None or (st == "verified" and best[1] != "verified"):
            best = (email, st, conf, src, url)
        if st == "verified":
            break
    now = datetime.now(timezone.utc).isoformat()
    if not best:
        return {**out, "enrichment_status": "needs_contact_enrichment", "last_enriched_at": now,
                "_log": log + ["no professional email found for the decision-maker"], "_usage": usage}
    email, st, conf, src, url = best
    if st == "invalid":                  # an undeliverable address is never stored as the lead's email
        return {**out, "enrichment_status": "needs_contact_enrichment", "last_enriched_at": now,
                "_log": log + [f"{email} is undeliverable; decision-maker needs another contact route"], "_usage": usage}
    out.update({"email": email, "email_source": src, "email_verification_status": st, "email_confidence": conf,
                "email_source_url": url or src, "last_enriched_at": now})
    out["enrichment_status"] = "ready_for_approval" if st == "verified" else "needs_contact_enrichment"
    return {**out, "_log": log, "_usage": usage}
