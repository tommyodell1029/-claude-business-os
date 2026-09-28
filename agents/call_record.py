"""Build the post-call record handed to agents/notify (T5). Shape matches the Supabase `calls` table."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from lp.text import norm_phone

from . import ROOT
from .flow import summary_line


def transcript_text(messages: list[dict]) -> str:
    lines = []
    for m in messages:
        role = m.get("role")
        if role not in ("user", "assistant"):
            continue
        content = m.get("content")
        if isinstance(content, list):
            content = " ".join(p.get("text", "") for p in content if isinstance(p, dict) and p.get("type") == "text")
        if isinstance(content, str) and content.strip():
            lines.append(f"{'Caller' if role == 'user' else 'Agent'}: {content.strip()}")
    return "\n".join(lines)


def build(state: dict, *, call_sid: str | None, caller_id: str | None, messages: list[dict],
          duration_sec: float, est_cost: float | None) -> dict:
    c = state.get("caller", {})
    return {
        "client_slug": state["client_slug"],
        "call_sid": call_sid,
        "caller_name": c.get("name"),
        "caller_phone": c.get("callback_number") or norm_phone(caller_id),
        "intent": state.get("intent") or "other",
        "summary": summary_line(state),
        "urgency": state.get("urgency", "normal"),
        "transcript": transcript_text(messages),
        "duration_sec": int(round(duration_sec)),
        "est_cost": est_cost,
        "transferred": bool(state.get("transferred")),
        "end_reason": state.get("end_reason") or "hangup",
        "disclosure_spoken": bool(state.get("disclosure_spoken")),
        "details": {k: c.get(k) for k in ("address", "best_time", "preferred_time")},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def write_local(record: dict, out_dir: Path = ROOT / "data" / "calls") -> Path:
    """T3/T4 sink until agents/notify (T5) exists. data/ is gitignored; file is chmod 600 (contains PII)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    name = (record.get("call_sid") or datetime.now(timezone.utc).strftime("local-%Y%m%dT%H%M%S%f")) + ".json"
    path = out_dir / name
    path.write_text(json.dumps(record, indent=2))
    path.chmod(0o600)
    return path
