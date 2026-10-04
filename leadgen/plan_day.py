"""Daily batch planner. Drafts only: writes `drafted` / `pending` outreach_events for the owner to approve. NEVER sends.

Rules (CLAUDE.md Gmail override + leadgen/config.yaml `sending`):
- Only Tue/Wed/Thu (America/New_York), and on the day itself only before the morning window closes.
- Daily cap from the ramp (5/day in week 1, then per config), hard max 20/day/inbox. Today's sent emails and any
  open (pending/approved, not yet sent) drafts count against the cap.
- Pause everything (one `paused` event, nothing drafted) if bounces / sends over the last 30 days is above 3%, or if
  any complaint exists that the owner has not acknowledged in config.
- Follow-ups that are due go first, then new first touches: email found on the business's own site, not a role
  inbox, not suppressed, score >= threshold, no earlier first-touch draft.
Usage: uv run python -m leadgen.plan_day [--date YYYY-MM-DD] [--snapshot snap.json --sql-out writes.sql] [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import os
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from . import ROOT  # noqa: F401
from lp.text import norm_email
from .db import open_store
from .draft import DraftError, compose, mailing_address, validate
from .research import ROLE_BLOCK
from .sequence import (OPEN_REVIEW, STOP_EVENTS, compose_followup, compute_state, is_due, local_date, parse_ts,
                       sent_at, validate_followup)
from .source import load_config, log

DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def _hm(s: str) -> time:
    h, m = str(s).split(":")
    return time(int(h), int(m))


def is_send_day(d: date, cfg: dict) -> bool:
    return DAYS[d.weekday()] in cfg["sending"]["send_days"]


def next_send_days(start: date, n: int, cfg: dict) -> list[date]:
    out, d = [], start
    while len(out) < n:
        if is_send_day(d, cfg):
            out.append(d)
        d += timedelta(days=1)
    return out


def gate(now: datetime, target: date, cfg: dict) -> str | None:
    """Reason the planner must not draft for `target`, or None if it may."""
    s = cfg["sending"]
    local_now = now.astimezone(ZoneInfo(s["timezone"]))
    if not is_send_day(target, cfg):
        return f"{target} is a {DAYS[target.weekday()]}; sends only on {', '.join(s['send_days'])}"
    if target < local_now.date():
        return f"{target} is in the past"
    if target == local_now.date() and local_now.time() >= _hm(s["window_end"]):
        return f"the morning send window closed at {s['window_end']} {s['timezone']}"
    return None


def daily_cap(target: date, cfg: dict) -> int:
    s = cfg["sending"]
    start = s["ramp_start"] if isinstance(s["ramp_start"], date) else date.fromisoformat(str(s["ramp_start"]))
    week = max(0, (target - start).days // 7)
    ramp = s["ramp_per_day"]
    return max(0, min(ramp[min(week, len(ramp) - 1)], s["hard_max_per_day"], 20))


def pause_reason(events: list[dict], now: datetime, cfg: dict) -> str | None:
    s = cfg["sending"]
    acked = set(s.get("complaints_acknowledged") or [])
    complaints = [e for e in events if e.get("event_type") == "complaint" and e.get("id") not in acked]
    if complaints:
        return f"{len(complaints)} spam complaint(s) on record; all sending paused until the owner reviews"
    since = now - timedelta(days=s["bounce_window_days"])
    sends = [e for e in events if e.get("event_type") == "sent" and (sent_at(e) or now) >= since]
    bounces = [e for e in events if e.get("event_type") == "bounce" and (parse_ts(e.get("created_at")) or now) >= since]
    if sends and len(bounces) / len(sends) > s["pause_bounce_rate"]:
        return (f"bounce rate {len(bounces)}/{len(sends)} = {len(bounces) / len(sends):.1%} over the last "
                f"{s['bounce_window_days']} days is above {s['pause_bounce_rate']:.0%}")
    return None


def _by_prospect(events: list[dict]) -> dict[str, list[dict]]:
    m = defaultdict(list)
    for e in events:
        if e.get("prospect_id"):
            m[e["prospect_id"]].append(e)
    return m


def open_drafts(events: list[dict]) -> list[dict]:
    """Drafts (pending/approved) whose (prospect, step) has no sent event yet."""
    sent = {(e["prospect_id"], e.get("step")) for e in events if e.get("event_type") == "sent"}
    return [e for e in events if e.get("event_type") == "drafted" and e.get("review_status") in OPEN_REVIEW
            and (e.get("prospect_id"), e.get("step")) not in sent]


def used_on(target: date, events: list[dict], tz: str) -> int:
    """Today's sends + open drafts scheduled for today or earlier (or unscheduled): they all go out of today's cap."""
    sent_today = sum(1 for e in events if e.get("event_type") == "sent" and sent_at(e) and local_date(sent_at(e), tz) == target)
    queued = 0
    for e in open_drafts(events):
        when = parse_ts(e.get("scheduled_for"))
        if when is None or local_date(when, tz) <= target:
            queued += 1
    return sent_today + queued


def eligible_new(store, events: list[dict], suppressed: set[str], cfg: dict) -> list[dict]:
    """New first-touch candidates, best score first."""
    by_p = _by_prospect(events)
    threshold = cfg["score"]["threshold"]
    redraft_skipped = cfg["sequence"].get("redraft_skipped", False)
    out, used = [], set()
    for p in store.prospects(["researched"], limit=1000):
        email = norm_email(p.get("email"))
        if not email or email in used or not p.get("email_source_url") or ROLE_BLOCK.match(email.split("@")[0]):
            continue
        if (p.get("score") or 0) < threshold or email in suppressed:
            continue
        evs = by_p.get(p["id"], [])
        if any(e.get("event_type") in STOP_EVENTS or e.get("event_type") == "sent" for e in evs):
            continue
        step0 = [e for e in evs if e.get("event_type") == "drafted" and e.get("step") == 0]
        if step0 and not (redraft_skipped and all(e.get("review_status") == "skipped" for e in step0)):
            continue
        used.add(email)
        out.append(p)
    return out


def sequence_states(store, events, suppressed, cfg):
    by_p = _by_prospect(events)
    ids = sorted({e["prospect_id"] for e in events if e.get("event_type") == "sent" and e.get("prospect_id")})
    return [compute_state(p, by_p.get(p["id"], []), suppressed, cfg) for p in store.prospects_by_ids(ids)], \
        {p["id"]: p for p in store.prospects_by_ids(ids)}


def topup_need(target: date, events, states, eligible_count: int, cfg: dict) -> dict:
    """Estimate how many new first touches the next N send days need versus how many eligible prospects exist.
    Follow-ups already in flight take cap first; first touches planned today are assumed to go out today."""
    s = cfg["sending"]
    days = next_send_days(target, s["topup_send_days"], cfg)
    tz = s["timezone"]
    capacity = sum(daily_cap(d, cfg) for d in days) - used_on(target, events, tz)
    followups = sum(1 for st in states if not st.stopped and st.next_step is not None and st.due_at is not None
                    and local_date(st.due_at, tz) <= days[-1])
    needed = max(0, capacity - followups)
    return {"send_days": [str(d) for d in days], "new_needed": needed, "eligible_new": eligible_count,
            "shortfall": max(0, needed - eligible_count)}


def plan(store, env, cfg: dict, *, now: datetime | None = None, target: date | None = None, dry_run: bool = False) -> dict:
    s = cfg["sending"]
    tz = s["timezone"]
    now = now or datetime.now(timezone.utc)
    target = target or now.astimezone(ZoneInfo(tz)).date()
    events = store.outreach_events()
    suppressed = store.suppressed_emails()
    states, rows = sequence_states(store, events, suppressed, cfg)
    elig = eligible_new(store, events, suppressed, cfg)
    report = {"date": str(target), "drafted": [], "topup": topup_need(target, events, states, len(elig), cfg)}

    why = gate(now, target, cfg)
    if why:
        nxt = next_send_days(target + timedelta(days=1), 1, cfg)[0]
        return {**report, "status": "not_send_window", "reason": why, "next_send_day": str(nxt)}

    why = pause_reason(events, now, cfg)
    if why:
        already = any(e.get("event_type") == "paused" and (e.get("payload") or {}).get("date") == str(target) for e in events)
        if not already and not dry_run:
            store.insert_outreach({"prospect_id": None, "event_type": "paused", "platform": cfg["sequence"]["platform"],
                                   "payload": {"date": str(target), "reason": why}})
        return {**report, "status": "paused", "reason": why}

    address = mailing_address(env)
    signature = cfg["draft"]["sender_name"]
    cap = daily_cap(target, cfg)
    used = used_on(target, events, tz)
    remaining = max(0, cap - used)
    report.update({"cap": cap, "already_used": used, "remaining_before": remaining})
    when = datetime.combine(target, _hm(s["send_time"]), ZoneInfo(tz)).isoformat()
    platform = cfg["sequence"]["platform"]

    due = sorted((st for st in states if is_due(st, target, tz)), key=lambda st: st.due_at)
    for st in due:
        if remaining <= 0:
            break
        p = rows[st.prospect_id]
        if store.is_suppressed(st.email):            # fresh check right before drafting
            continue
        first = st.first_sent or {}
        subject, body = compose_followup(p, st.next_step, address, signature, first.get("subject"))
        validate_followup(body, address)
        fp = first.get("payload") or {}
        row = {"prospect_id": p["id"], "step": st.next_step, "event_type": "drafted", "review_status": "pending",
               "subject": subject, "body": body, "platform": platform, "scheduled_for": when,
               "payload": {"to": st.email, "business": p["name"], "kind": "follow_up",
                           "thread_id": fp.get("thread_id"), "reply_to_message_id": first.get("platform_message_id")}}
        ev = row if dry_run else store.insert_outreach(row)
        remaining -= 1
        report["drafted"].append({"event_id": ev.get("id"), "kind": "follow_up", "step": st.next_step, "to": st.email,
                                  "business": p["name"], "subject": subject})

    for p in elig:
        if remaining <= 0:
            break
        email = norm_email(p["email"])
        if store.is_suppressed(email):
            continue
        subject, body = compose(p, address, signature)
        validate(body, address)
        row = {"prospect_id": p["id"], "step": 0, "event_type": "drafted", "review_status": "pending",
               "subject": subject, "body": body, "platform": platform, "scheduled_for": when,
               "payload": {"to": email, "business": p["name"], "kind": "first_touch",
                           "email_source_url": p["email_source_url"], "score": p.get("score")}}
        ev = row if dry_run else store.insert_outreach(row)
        if not dry_run:
            store.update_prospect(p["id"], {"status": "queued"})
        remaining -= 1
        report["drafted"].append({"event_id": ev.get("id"), "kind": "first_touch", "step": 0, "to": email,
                                  "business": p["name"], "subject": subject, "score": p.get("score")})

    report["status"] = "planned"
    report["requeue_due"] = [p["name"] for p in store.prospects(["not_now"], limit=1000)
                             if parse_ts(p.get("requeue_at")) and parse_ts(p["requeue_at"]) <= now]
    return report


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", help="send day to plan (YYYY-MM-DD, default today in America/New_York)")
    ap.add_argument("--snapshot", help="JSON snapshot exported with the Supabase connector (no service key)")
    ap.add_argument("--sql-out", help="with --snapshot: write the resulting SQL here for execute_sql")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    store = open_store(os.environ, a.snapshot)
    if not store.configured:
        log("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (or pass --snapshot)")
        return 2
    try:
        res = plan(store, os.environ, load_config(), target=date.fromisoformat(a.date) if a.date else None, dry_run=a.dry_run)
    except DraftError as e:
        log(f"BLOCKED: {e}")
        return 3
    if a.snapshot and a.sql_out:
        with open(a.sql_out, "w") as f:
            f.write(store.to_sql())
    print(json.dumps(res, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
