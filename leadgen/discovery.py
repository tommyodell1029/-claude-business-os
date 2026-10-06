"""Business discovery across providers, with fallback and de-duplication.

Providers (config discovery.providers, tried in order; one failing never stops the run):
  places - Google Places API (New) Text Search (leadgen/source.py). Needs a working GOOGLE_PLACES_API_KEY.
  seed   - public web-search seeds built in-session (leadgen/seed/*.json: names + websites only, no emails).
  csv    - a CSV you supply (columns: name, website, industry, city, phone, address; header row required).
Rows come out in the prospects-table shape. Duplicates are dropped by place_id, domain, phone, or name+city, both
within the run and against rows already in the database. Directories and marketplaces are never prospects.
"""
from __future__ import annotations

import csv
import glob
import json
import re

from agents.notify.http import Http
from lp.text import domain_of, norm_phone
from .source import CallCap, PlacesError, search_text, to_row

NOT_A_BUSINESS = re.compile(r"(^|\.)(yelp|angi|angieslist|homeadvisor|thumbtack|facebook|instagram|bbb|yellowpages|"
                            r"nextdoor|google|mapquest|porch|houzz|bark|networx|manta|chamberofcommerce|indeed|"
                            r"linkedin|groupon|craigslist|reddit|youtube|tiktok)\.", re.I)


def norm_name(name: str | None) -> str:
    n = re.sub(r"[^a-z0-9 ]", " ", (name or "").lower())
    n = re.sub(r"\b(llc|inc|co|corp|company|the|and|of)\b", " ", n)
    return " ".join(n.split())


def keys_of(r: dict) -> set[str]:
    k = set()
    if r.get("place_id"):
        k.add("pid:" + r["place_id"])
    d = r.get("domain") or domain_of(r.get("website"))
    if d:
        k.add("dom:" + d)
    if r.get("phone"):
        k.add("tel:" + r["phone"])
    if r.get("name") and r.get("city"):
        k.add("nc:" + norm_name(r["name"]) + "|" + r["city"].lower())
    return k


class Dedupe:
    def __init__(self, existing: list[dict] = ()):
        self.seen: set[str] = set()
        for r in existing:
            self.seen |= keys_of(r)

    def add(self, r: dict) -> bool:
        k = keys_of(r)
        if not k or k & self.seen:
            return False
        self.seen |= k
        return True


def _plain_row(r: dict, source: str) -> dict | None:
    site, name = (r.get("website") or "").strip(), (r.get("name") or "").strip()
    dom = domain_of(site) if site else None
    if not name or (dom and NOT_A_BUSINESS.search(dom + ".")):
        return None
    if not dom and not norm_phone(r.get("phone")):
        return None                                   # nothing to research or call: not a usable prospect
    row = {"place_id": f"web:{dom}" if dom else f"tel:{norm_phone(r.get('phone'))}", "name": name,
           "industry": (r.get("industry") or "").strip() or None, "city": (r.get("city") or "").strip() or None,
           "address": (r.get("address") or "").strip() or None, "phone": norm_phone(r.get("phone")),
           "website": site or None, "domain": dom, "source": source, "discovery_sources": [source]}
    return {k: v for k, v in row.items() if v is not None}


def from_places(http: Http, key: str, cfg: dict, industries: list[str], locations: list[str], limit: int) -> list[dict]:
    """Raises PlacesError (caller falls back). Spends at most places.max_api_calls_per_run requests."""
    cap = CallCap(cfg["places"]["max_api_calls_per_run"])
    out = []
    for loc in locations:
        for ind in industries:
            q = f"{cfg['industries'][ind]['query']} in {loc}"
            data = search_text(http, key, cfg, q, cap)
            if data is None:
                return out
            for place in data.get("places", []):
                r = to_row(place, ind)
                if r:
                    r["domain"] = domain_of(r.get("website")) if r.get("website") else None
                    r["discovery_sources"] = ["google_places_api"]
                    out.append({k: v for k, v in r.items() if v is not None})
            if len(out) >= limit:
                return out
    return out


def from_seeds(paths: list[str], industries: list[str] | None, city: str | None) -> list[dict]:
    out = []
    for path in paths:
        with open(path) as f:
            seed = json.load(f)
        src = seed.get("source") or "web_search"
        for r in seed.get("rows", []):
            if industries and r.get("industry") not in industries:
                continue
            if city and r.get("city"):
                want, have = city.split(",")[0].strip().lower(), r["city"].strip().lower()
                if want not in have and have not in want:      # "Jacksonville" matches "Jacksonville Beach"
                    continue
            row = _plain_row(r, src)
            if row:
                out.append(row)
    return out


def from_csv(path: str, industries: list[str] | None) -> list[dict]:
    out = []
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            r = {(k or "").strip().lower(): (v or "").strip() for k, v in r.items()}
            if industries and r.get("industry") and r["industry"] not in industries:
                continue
            row = _plain_row(r, "csv_import")
            if row:
                out.append(row)
    return out


def discover(cfg: dict, env, http: Http, *, industries: list[str] | None = None, locations: list[str] | None = None,
             limit: int = 25, providers: list[str] | None = None, seed_paths: list[str] | None = None,
             csv_path: str | None = None, existing: list[dict] = ()) -> dict:
    """{'rows': [...new, deduped...], 'providers': [{name, status, found, detail}], 'duplicates': n, 'rejected': n}"""
    d = cfg.get("discovery") or {}
    order = providers or d.get("providers") or ["places", "seed", "csv"]
    inds = industries or list(cfg["industries"])
    locs = locations or d.get("locations") or [cfg["places"]["location"]]
    dd, rows, report, dupes = Dedupe(existing), [], [], 0
    for name in order:
        if len(rows) >= limit:
            break
        try:
            if name == "places":
                key = (env.get("GOOGLE_PLACES_API_KEY") or "").strip()
                if not key:
                    report.append({"name": name, "status": "skipped", "found": 0, "detail": "no GOOGLE_PLACES_API_KEY"})
                    continue
                found = from_places(http, key, cfg, inds, locs, limit - len(rows))
            elif name == "seed":
                paths = seed_paths or sorted(glob.glob(d.get("seed_glob") or "leadgen/seed/*.json"))
                found = from_seeds(paths, industries, locs[0] if len(locs) == 1 else None)
            elif name == "csv":
                if not csv_path:
                    report.append({"name": name, "status": "skipped", "found": 0, "detail": "no --csv file given"})
                    continue
                found = from_csv(csv_path, industries)
            else:
                report.append({"name": name, "status": "skipped", "found": 0, "detail": "unknown provider"})
                continue
        except PlacesError as e:
            report.append({"name": name, "status": "failed", "found": 0, "detail": f"{e.kind} (HTTP {e.status})",
                           "kind": e.kind})
            continue
        except (OSError, ValueError) as e:
            report.append({"name": name, "status": "failed", "found": 0, "detail": type(e).__name__})
            continue
        new = 0
        for r in found:
            if len(rows) >= limit:
                break
            if dd.add(r):
                rows.append(r)
                new += 1
            else:
                dupes += 1
        report.append({"name": name, "status": "ok", "found": len(found), "new": new})
    return {"rows": rows, "providers": report, "duplicates": dupes}
