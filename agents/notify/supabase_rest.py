"""Supabase PostgREST access with the service-role key (server-side only). Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY."""
from __future__ import annotations

import json
from urllib.parse import quote

from .http import Http, call


class Supabase:
    def __init__(self, env, http: Http):
        self.url = (env.get("SUPABASE_URL") or "").rstrip("/")
        self.key = env.get("SUPABASE_SERVICE_ROLE_KEY") or ""
        self.http = http

    @property
    def configured(self) -> bool:
        return bool(self.url and self.key)

    def _headers(self, prefer: str) -> dict:
        h = {"apikey": self.key, "Prefer": prefer}
        if self.key.startswith("eyJ"):  # legacy JWT service_role key; new sb_secret_ keys go in apikey only
            h["Authorization"] = f"Bearer {self.key}"
        return h

    def _rest(self, method: str, path: str, prefer: str, payload=None):
        text = call(self.http, "supabase", method, f"{self.url}/rest/v1/{path}", self._headers(prefer), payload)
        return json.loads(text) if text.strip() else []

    def insert_call(self, record: dict) -> str | None:
        """Insert into `calls`. Idempotent on call_sid (a duplicate is ignored). Returns the row id, or None for a duplicate."""
        path = "calls?on_conflict=call_sid" if record.get("call_sid") else "calls"
        rows = self._rest("POST", path, "resolution=ignore-duplicates,return=representation", record)
        return rows[0]["id"] if rows else None

    def update_call(self, call_id: str, fields: dict) -> None:
        self._rest("PATCH", f"calls?id=eq.{quote(call_id, safe='')}", "return=minimal", fields)

    def upsert_client(self, row: dict, *, overwrite: bool) -> None:
        """overwrite=True merges the row into an existing client (onboarding); False leaves an existing row untouched."""
        prefer = "resolution=merge-duplicates,return=minimal" if overwrite else "resolution=ignore-duplicates,return=minimal"
        self._rest("POST", "clients?on_conflict=slug", prefer, row)

    def client_exists(self, slug: str) -> bool:
        return bool(self._rest("GET", f"clients?slug=eq.{quote(slug, safe='')}&select=slug", "return=representation"))
