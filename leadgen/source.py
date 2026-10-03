"""Source prospects from Google Places API (New) Text Search ONLY. Never scrapes Google Maps HTML.

Key goes in the X-Goog-Api-Key header from GOOGLE_PLACES_API_KEY; never in a URL; every log line goes through redact().
Usage: uv run python -m leadgen.source [--verticals plumbing,hvac] [--max-calls N] [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import yaml

from . import ROOT  # noqa: F401  (sets sys.path)
from agents.notify.http import Http, HttpError, RetryableError, call, urllib_http
from lp.retry import retry
from lp.text import norm_phone, redact
from .db import Store

CONFIG = Path(__file__).with_name("config.yaml")


def load_config(path: Path = CONFIG) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def log(msg: str) -> None:
    print(redact(msg), file=sys.stderr)


class PlacesDisabled(Exception):
    """403 from Places: API not enabled / key not allowed. Caller reports it as a blocker."""


class CapReached(Exception):
    pass


class CallCap:
    """Counts Text Search requests; refuses past the per-run cap."""

    def __init__(self, limit: int):
        self.limit, self.used = limit, 0

    def take(self) -> bool:
        if self.used >= self.limit:
            return False
        self.used += 1
        return True


def search_text(http: Http, api_key: str, cfg: dict, query: str, cap: CallCap, *, page_token: str | None = None) -> dict | None:
    """One Text Search (None if the cap is spent). Every HTTP attempt, retries included, counts against the cap.
    Retries only 5xx/429/network via lp.retry; 401/403 -> PlacesDisabled."""
    p = cfg["places"]
    body = {"textQuery": query, "pageSize": p["page_size"]}
    if page_token:
        body["pageToken"] = page_token
    headers = {"X-Goog-Api-Key": api_key, "X-Goog-FieldMask": p["field_mask"] + ",nextPageToken"}

    def attempt() -> str:
        if not cap.take():
            raise CapReached()
        return call(http, "places", "POST", p["endpoint"], headers, body)

    try:
        text = retry(attempt, exceptions=(RetryableError,),
                     on_error=lambda e, n: log(f"places attempt {n} failed: {e}"))
    except CapReached:
        return None
    except HttpError as e:
        if e.status in (401, 403):
            raise PlacesDisabled(redact(str(e))) from e
        raise
    return json.loads(text)


def city_of(address: str | None) -> str | None:
    """'123 Main St, Jacksonville, FL 32202, USA' -> 'Jacksonville'. Only what the address literally says."""
    parts = [x.strip() for x in (address or "").split(",")]
    return parts[-3] if len(parts) >= 3 else None


def to_row(place: dict, vertical: str) -> dict | None:
    """Places API place -> prospects row (only keys we have data for). None if unusable."""
    pid = place.get("id")
    name = (place.get("displayName") or {}).get("text")
    if not pid or not name or place.get("businessStatus", "OPERATIONAL") != "OPERATIONAL":
        return None
    row = {"place_id": pid, "name": name, "industry": vertical, "address": place.get("formattedAddress"),
           "city": city_of(place.get("formattedAddress")), "phone": norm_phone(place.get("nationalPhoneNumber")),
           "website": place.get("websiteUri"), "rating": place.get("rating"), "review_count": place.get("userRatingCount"),
           "hours": place.get("regularOpeningHours"), "source": "google_places_api"}
    return {k: v for k, v in row.items() if v is not None}


def source(http: Http, store: Store, api_key: str, cfg: dict, verticals: list[str] | None = None,
           max_calls: int | None = None, dry_run: bool = False) -> dict:
    p = cfg["places"]
    cap = CallCap(max_calls if max_calls is not None else p["max_api_calls_per_run"])
    verticals = verticals or list(p["verticals"])
    seen_ids, seen_phones, rows = set(), set(), []
    for v in verticals:
        query = f"{p['verticals'][v]} in {p['location']}"
        token = None
        while len(rows) < p["max_prospects_per_run"]:
            data = search_text(http, api_key, cfg, query, cap, page_token=token)
            if data is None:
                break
            for place in data.get("places", []):
                r = to_row(place, v)
                if not r or r["place_id"] in seen_ids or (r.get("phone") and r["phone"] in seen_phones):
                    continue
                seen_ids.add(r["place_id"])
                if r.get("phone"):
                    seen_phones.add(r["phone"])
                rows.append(r)
            token = data.get("nextPageToken")
            if not token:
                break
        if len(rows) >= p["max_prospects_per_run"]:
            break
    rows = rows[: p["max_prospects_per_run"]]
    stored = 0
    if not dry_run and rows:
        stored = len(_upsert(store, rows))
    return {"api_calls": cap.used, "found": len(rows), "upserted": stored}


def _upsert(store: Store, rows: list[dict]) -> list[dict]:
    """Batch upsert; on a unique-phone conflict with an existing row, retry row by row and drop the phone."""
    try:
        return store.upsert_prospects(rows)
    except HttpError as e:
        if e.status != 409:
            raise
    out = []
    for r in rows:
        try:
            out += store.upsert_prospects([r])
        except HttpError as e:
            if e.status != 409:
                raise
            r2 = {k: v for k, v in r.items() if k != "phone"}
            out += store.upsert_prospects([r2])
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--verticals", help="comma list of config verticals")
    ap.add_argument("--max-calls", type=int)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    key = os.getenv("GOOGLE_PLACES_API_KEY", "").strip()
    if not key:
        log("GOOGLE_PLACES_API_KEY not set")
        return 2
    cfg = load_config()
    store = Store(os.environ)
    if not a.dry_run and not store.configured:
        log("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
        return 2
    try:
        res = source(urllib_http, store, key, cfg, a.verticals.split(",") if a.verticals else None, a.max_calls, a.dry_run)
    except PlacesDisabled as e:
        log(f"BLOCKED: Places API refused the request: {e}")
        return 3
    print(json.dumps(res))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
