"""Google Places diagnostics: one minimal, real Text Search request, a plain-English verdict, never the key.

Usage: uv run python -m leadgen google-places-test     (also: python -m leadgen.places_diag)
Exit code 0 = READY, 3 = Google refused (see "Recommended action"), 2 = no key configured.
"""
from __future__ import annotations

import os
import sys

from . import ROOT  # noqa: F401
from agents.notify.http import Http, urllib_http
from .source import CallCap, PlacesError, load_config, search_text

KEY_ENV = "GOOGLE_PLACES_API_KEY"

# kind -> (likely cause, what the owner changes in Google Cloud)
ADVICE = {
    "missing_key": ("No key is configured for this process.",
                    f"Add {KEY_ENV}=<key> to the environment variables (never to git or chat), then start a new session."),
    "invalid_key": ("Google does not recognise the key (deleted, mistyped, or from another project).",
                    "Google Cloud Console > APIs & Services > Credentials: copy the key again (or create a new one) and "
                    f"replace {KEY_ENV}."),
    "api_disabled": ("Places API (New) is not enabled on the key's Google Cloud project.",
                     "Google Cloud Console > APIs & Services > Library > 'Places API (New)' > Enable (wait ~5 minutes)."),
    "key_restricted": ("The key's API restrictions or application restrictions block Places API (New).",
                       "Credentials > the key > API restrictions: allow 'Places API (New)'. Application restrictions: "
                       "None (server-side calls from the cloud have no fixed IP or referrer)."),
    "billing": ("Billing is not enabled on the Google Cloud project.",
                "Google Cloud Console > Billing > link a billing account to the key's project. Places API (New) "
                "refuses all requests without one, even inside the free monthly usage."),
    "permission_denied": ("Google returned PERMISSION_DENIED with no specific reason. In practice this is almost "
                          "always billing not enabled on the project (Google's Geocoding API on the same key says so "
                          "explicitly), less often a key restriction.",
                          "1) Billing > link a billing account to the project. 2) Credentials > the key > API "
                          "restrictions include 'Places API (New)'. Then re-run this test."),
    "quota": ("Quota or rate limit reached.",
              "Wait for the quota to reset, or raise the Places API (New) quota in APIs & Services > Quotas. "
              "Discovery falls back to the other sources meanwhile; nothing is retried in a loop."),
    "bad_request": ("Google rejected the request format.",
                    "Code-side: check leadgen/config.yaml places.endpoint and field_mask against the Places API (New) docs."),
    "transient": ("Google or the network failed temporarily (5xx / no response) after bounded retries.",
                  "Re-run later; discovery falls back meanwhile."),
    "malformed": ("Google answered with an unexpected body.", "Re-run; if it persists, report it with the HTTP status."),
}


def diagnose(env, http: Http = urllib_http, cfg: dict | None = None) -> dict:
    cfg = cfg or load_config()
    key = (env.get(KEY_ENV) or "").strip()
    out = {"key_detected": bool(key), "endpoint": cfg["places"]["endpoint"], "api": "Places API (New) v1 searchText",
           "auth": "X-Goog-Api-Key header (server-side only)"}
    if not key:
        return {**out, "ok": False, "kind": "missing_key", "authentication": "NOT TESTED", "request": "NOT SENT"}
    shape = "OK" if key.startswith("AIza") and len(key) >= 30 and not any(c.isspace() for c in key) else "SUSPECT"
    out["key_shape"] = shape
    tiny = {**cfg, "places": {**cfg["places"], "page_size": 1, "field_mask": "places.id,places.displayName"}}
    try:
        data = search_text(http, key, tiny, f"plumber in {cfg['places']['location']}", CallCap(1))
    except PlacesError as e:
        auth = "FAIL" if e.kind in ("invalid_key", "missing_key") else "PASS (key accepted, request refused)"
        return {**out, "ok": False, "kind": e.kind, "authentication": auth, "request": "FAIL", "http_status": e.status,
                "google_reason": e.reason, "google_message": str(e).split(": ", 1)[-1]}
    n = len((data or {}).get("places", []))
    return {**out, "ok": True, "kind": "ready", "authentication": "PASS", "request": "PASS", "http_status": 200,
            "results": n}


def report(d: dict) -> str:
    lines = ["Google Places Diagnostics",
             f"API key detected: {'YES' if d['key_detected'] else 'NO'}"]
    if d.get("key_shape"):
        lines.append(f"Key format: {d['key_shape']}")
    lines += [f"API: {d['api']}", f"Endpoint: {d['endpoint']}", f"Auth method: {d['auth']}",
              f"Authentication: {d['authentication']}", f"Places request: {d['request']}"]
    if d.get("http_status") is not None:
        lines.append(f"HTTP status: {d['http_status']}")
    if d["ok"]:
        lines += [f"Results returned: {d['results']}", "Status: READY"]
        return "\n".join(lines)
    if d.get("google_reason") or d.get("google_message"):
        lines.append(f"Google error: {d.get('google_reason') or '-'} | {d.get('google_message') or '-'}")
    cause, action = ADVICE.get(d["kind"], ("Unknown failure.", "Re-run and report the output."))
    lines += [f"Diagnosis: {d['kind']}", f"Reason: {cause}", f"Recommended action: {action}",
              "Fallback: discovery continues with seed files / CSV (uv run python -m leadgen scout ...).",
              "Status: NOT READY"]
    return "\n".join(lines)


def main(argv=None) -> int:
    d = diagnose(os.environ)
    print(report(d))
    return 0 if d["ok"] else (2 if d["kind"] == "missing_key" else 3)


if __name__ == "__main__":
    sys.exit(main())
