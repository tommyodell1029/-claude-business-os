"""Supabase REST access for leadgen (service-role key, server-side only). Reuses the notify HTTP helper; tests inject a fake Store."""
from __future__ import annotations

import json
from urllib.parse import quote

from agents.notify.http import Http, call, urllib_http


class Store:
    def __init__(self, env, http: Http = urllib_http):
        self.url = (env.get("SUPABASE_URL") or "").rstrip("/")
        self.key = env.get("SUPABASE_SERVICE_ROLE_KEY") or ""
        self.http = http

    @property
    def configured(self) -> bool:
        return bool(self.url and self.key)

    def _rest(self, method, path, prefer="return=representation", payload=None):
        h = {"apikey": self.key, "Prefer": prefer}
        if self.key.startswith("eyJ"):
            h["Authorization"] = f"Bearer {self.key}"
        text = call(self.http, "supabase", method, f"{self.url}/rest/v1/{path}", h, payload)
        return json.loads(text) if text.strip() else []

    def upsert_prospects(self, rows: list[dict]) -> list[dict]:
        """Upsert by place_id. Only the keys in each row are written, so owner-set fields (called_after_hours) and
        research results are never clobbered by a re-run."""
        if not rows:
            return []
        return self._rest("POST", "prospects?on_conflict=place_id", "resolution=merge-duplicates,return=representation", rows)

    def prospects(self, statuses: list[str], *, order: str = "score.desc.nullslast", limit: int = 500) -> list[dict]:
        s = ",".join(statuses)
        return self._rest("GET", f"prospects?status=in.({s})&order={order}&limit={limit}")

    def update_prospect(self, pid: str, fields: dict) -> None:
        self._rest("PATCH", f"prospects?id=eq.{quote(pid, safe='')}", "return=minimal", fields)

    def is_suppressed(self, email: str) -> bool:
        return bool(self._rest("GET", f"suppression?email=eq.{quote(email.lower(), safe='')}&select=email"))

    def has_outreach(self, pid: str, step: int) -> bool:
        return bool(self._rest("GET", f"outreach_events?prospect_id=eq.{quote(pid, safe='')}&step=eq.{step}&event_type=eq.drafted&select=id"))

    def insert_outreach(self, row: dict) -> dict:
        return self._rest("POST", "outreach_events", "return=representation", row)[0]

    def log_cost(self, category: str, units: float, amount_usd: float, meta: dict) -> None:
        self._rest("POST", "cost_events", "return=minimal", {"category": category, "units": units, "amount_usd": amount_usd, "meta": meta})
