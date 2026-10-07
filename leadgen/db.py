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
        # PostgREST bulk inserts need identical keys in every object: send one request per key set.
        groups: dict[tuple, list[dict]] = {}
        for r in rows:
            groups.setdefault(tuple(sorted(r)), []).append(r)
        out: list[dict] = []
        for batch in groups.values():
            out += self._rest("POST", "prospects?on_conflict=place_id", "resolution=merge-duplicates,return=representation",
                              batch) or []
        return out

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

    # ---- outreach engine (sequence / plan_day / gmail_sync)
    def prospects_by_ids(self, ids: list[str]) -> list[dict]:
        if not ids:
            return []
        return self._rest("GET", f"prospects?id=in.({','.join(quote(i, safe='') for i in ids)})")

    def prospect_by_email(self, email: str) -> dict | None:
        rows = self._rest("GET", f"prospects?email=eq.{quote(email.lower(), safe='')}&limit=1")
        return rows[0] if rows else None

    def outreach_events(self, *, since: str | None = None, limit: int = 5000) -> list[dict]:
        """All outreach events (optionally created at/after an ISO timestamp), oldest first."""
        flt = f"&created_at=gte.{quote(since, safe='')}" if since else ""
        return self._rest("GET", f"outreach_events?order=created_at.asc&limit={limit}{flt}")

    def suppressed_emails(self) -> set[str]:
        return {r["email"] for r in self._rest("GET", "suppression?select=email&limit=100000")}

    def suppress(self, email: str, reason: str, source: str) -> None:
        """Permanent. ON CONFLICT DO NOTHING; the table refuses updates and deletes."""
        self._rest("POST", "suppression?on_conflict=email", "resolution=ignore-duplicates,return=minimal",
                   {"email": email.lower(), "reason": reason, "source": source})

    def has_message(self, platform: str, message_id: str, event_type: str) -> bool:
        q = f"platform=eq.{platform}&platform_message_id=eq.{quote(message_id, safe='')}&event_type=eq.{event_type}&select=id"
        return bool(self._rest("GET", f"outreach_events?{q}"))

    def update_outreach(self, event_id: str, fields: dict) -> None:
        self._rest("PATCH", f"outreach_events?id=eq.{quote(event_id, safe='')}", "return=minimal", fields)

    def log_cost(self, category: str, units: float, amount_usd: float, meta: dict) -> None:
        self._rest("POST", "cost_events", "return=minimal", {"category": category, "units": units, "amount_usd": amount_usd, "meta": meta})


def sql_literal(v) -> str:
    """Postgres literal for the snapshot write-back. Strings are single-quote escaped (standard_conforming_strings);
    dicts/lists become jsonb. Untrusted text (reply bodies) only ever lands inside a quoted literal."""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, (dict, list)):
        return sql_literal(json.dumps(v, default=str)) + "::jsonb"
    s = str(v).replace("\x00", "")
    return "'" + s.replace("'", "''") + "'"


_IDENT = {"prospects", "outreach_events", "suppression"}


class SnapshotStore:
    """Same interface as Store, over a JSON snapshot exported with the Supabase connector (used when the session has
    no SUPABASE_SERVICE_ROLE_KEY). Reads come from the snapshot; every write is applied in memory AND recorded, and
    `to_sql()` renders the writes for the session to run with the connector's execute_sql. Tests use it as the fake."""

    def __init__(self, snapshot: dict):
        self.rows = {r["id"]: dict(r) for r in (snapshot.get("prospects") or [])}
        self.events = [dict(e) for e in (snapshot.get("outreach_events") or [])]
        self.suppressed = {str(e).lower() for e in (snapshot.get("suppression") or [])}
        self.ops: list[tuple] = []

    configured = True

    # reads
    def prospects(self, statuses, *, order="score.desc.nullslast", limit=500):
        rs = [r for r in self.rows.values() if r.get("status") in statuses]
        return sorted(rs, key=lambda r: -(r.get("score") or 0))[:limit]

    def prospects_by_ids(self, ids):
        return [self.rows[i] for i in ids if i in self.rows]

    def prospect_by_email(self, email):
        e = (email or "").lower()
        return next((r for r in self.rows.values() if (r.get("email") or "").lower() == e), None)

    def outreach_events(self, *, since=None, limit=5000):
        evs = sorted(self.events, key=lambda e: str(e.get("created_at") or ""))
        return [e for e in evs if not since or str(e.get("created_at") or "") >= since][:limit]

    def suppressed_emails(self):
        return set(self.suppressed)

    def is_suppressed(self, email):
        return (email or "").lower() in self.suppressed

    def has_outreach(self, pid, step):
        return any(e.get("prospect_id") == pid and e.get("step") == step and e.get("event_type") == "drafted" for e in self.events)

    def has_message(self, platform, message_id, event_type):
        return any(e.get("platform") == platform and e.get("platform_message_id") == message_id
                   and e.get("event_type") == event_type for e in self.events)

    # writes (recorded)
    def insert_outreach(self, row):
        import uuid
        from datetime import datetime, timezone
        row = {"id": str(uuid.uuid4()), "created_at": datetime.now(timezone.utc).isoformat(), **row}
        self.events.append(row)
        self.ops.append(("insert", "outreach_events", {k: v for k, v in row.items() if k != "created_at"}))
        return row

    def update_outreach(self, event_id, fields):
        for e in self.events:
            if e.get("id") == event_id:
                e.update(fields)
        self.ops.append(("update", "outreach_events", event_id, fields))

    def update_prospect(self, pid, fields):
        if pid in self.rows:
            self.rows[pid].update(fields)
        self.ops.append(("update", "prospects", pid, fields))

    def suppress(self, email, reason, source):
        e = email.lower()
        if e not in self.suppressed:
            self.suppressed.add(e)
            self.ops.append(("suppress", e, reason, source))

    def upsert_prospects(self, rows):
        """New place_ids only (existing rows are never touched); ids are assigned here so later updates match."""
        import uuid
        added = []
        for r in rows:
            if any(x.get("place_id") == r["place_id"] for x in self.rows.values()):
                continue
            r = {"id": str(uuid.uuid4()), **r}
            self.rows[r["id"]] = {"status": "new", **r}
            added.append(r)
        if added:
            self.ops.append(("upsert_prospects", added))
        return added

    def to_sql(self) -> str:
        out = []
        for op in self.ops:
            if op[0] == "insert":
                _, table, row = op
                assert table in _IDENT
                cols = ", ".join(row)
                vals = ", ".join(sql_literal(v) for v in row.values())
                out.append(f"insert into public.{table} ({cols}) values ({vals});")
            elif op[0] == "update":
                _, table, rid, fields = op
                assert table in _IDENT
                sets = ", ".join(f"{k} = {sql_literal(v)}" for k, v in fields.items())
                out.append(f"update public.{table} set {sets} where id = {sql_literal(rid)};")
            elif op[0] == "suppress":
                _, e, reason, source = op
                out.append(f"insert into public.suppression (email, reason, source) values "
                           f"({sql_literal(e)}, {sql_literal(reason)}, {sql_literal(source)}) on conflict (email) do nothing;")
            elif op[0] == "upsert_prospects":
                for r in op[1]:
                    cols = ", ".join(r)
                    vals = ", ".join(sql_literal(v) for v in r.values())
                    out.append(f"insert into public.prospects ({cols}) values ({vals}) on conflict (place_id) do nothing;")
        return "\n".join(out)


def open_store(env, snapshot_path: str | None):
    """Store when the service key is present, else SnapshotStore over an exported snapshot."""
    if snapshot_path:
        with open(snapshot_path) as f:
            return SnapshotStore(json.load(f))
    return Store(env)
