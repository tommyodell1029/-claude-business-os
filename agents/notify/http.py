"""Tiny stdlib HTTP helper so the notify handler adds no dependencies. Tests inject a fake `Http`."""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Callable

USER_AGENT = "launchpad-local-notify/1.0"
TIMEOUT_SECS = 8

# (method, url, headers, body bytes or None) -> (status, response text). Never raises on HTTP status.
Http = Callable[[str, str, dict, "bytes | None"], "tuple[int, str]"]


class HttpError(Exception):
    """Non-2xx response. Message carries status and a truncated body; callers log it through redact()."""

    def __init__(self, service: str, status: int, body: str):
        self.status = status
        self.body = body
        super().__init__(f"{service} HTTP {status}: {body[:300]}")


class RetryableError(HttpError):
    """5xx, 429 or a network failure: worth another attempt."""


def urllib_http(method: str, url: str, headers: dict, body: bytes | None) -> tuple[int, str]:
    req = urllib.request.Request(url, data=body, method=method, headers={"User-Agent": USER_AGENT, **headers})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECS) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return 599, f"network error: {type(e).__name__}"  # 599 = ours: no HTTP response at all


def call(http: Http, service: str, method: str, url: str, headers: dict, payload=None, *, form: bool = False) -> str:
    """One request. Returns the body on 2xx; raises RetryableError (5xx/429/network) or HttpError (other 4xx)."""
    body = None
    h = dict(headers)
    if payload is not None:
        if form:
            from urllib.parse import urlencode
            body, h["Content-Type"] = urlencode(payload).encode(), "application/x-www-form-urlencoded"
        else:
            body, h["Content-Type"] = json.dumps(payload).encode(), "application/json"
    status, text = http(method, url, h, body)
    if 200 <= status < 300:
        return text
    cls = RetryableError if status >= 500 or status == 429 else HttpError
    raise cls(service, status, text)
