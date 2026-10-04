"""Sequence logic: where each prospect is in the C3 cadence, and the follow-up copy. Pure functions; never sends.

Cadence (decision C3, leadgen/config.yaml `sequence.gaps_days`): day 0, then +3, +7, +30 after the previous ACTUAL send,
so day 0 / 3 / 10 / 40 when every step goes out on time. State comes only from `sent` events, never from plans.
A prospect stops for good on any reply, bounce, unsubscribe or complaint event, on a terminal status, or when the
address is in `suppression`. Follow-ups are fixed templates (no LLM): facts only from the prospect row, plain text,
mailing address + opt-out line, no prices, no phone numbers (the demo line is not public), no text-message promises.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from . import ROOT  # noqa: F401  (sets sys.path)
from lp.text import norm_email
from .draft import _INDUSTRY, OPT_OUT, DraftError

STOP_EVENTS = ("reply", "bounce", "unsubscribe", "complaint")
STOP_STATUSES = ("replied", "interested", "not_now", "not_interested", "unsubscribed", "bounced", "do_not_contact")
OPEN_REVIEW = ("pending", "approved")
MAX_STEP = 3
MAX_WORDS = 140


def parse_ts(v) -> datetime | None:
    """ISO string / datetime -> aware UTC datetime (naive values are taken as UTC)."""
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        dt = v
    else:
        s = str(v).strip().replace(" ", "T", 1) if "T" not in str(v) else str(v).strip()
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        s = re.sub(r"([+-]\d\d)$", r"\1:00", s)          # Postgres '+00' offset
        dt = datetime.fromisoformat(s)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def sent_at(ev: dict) -> datetime | None:
    return parse_ts((ev.get("payload") or {}).get("sent_at")) or parse_ts(ev.get("created_at"))


def local_date(dt: datetime, tz: str) -> date:
    return dt.astimezone(ZoneInfo(tz)).date()


@dataclass
class SeqState:
    prospect_id: str
    email: str | None
    sent_steps: dict[int, datetime] = field(default_factory=dict)
    stopped: str | None = None               # reason, or None while the sequence is live
    next_step: int | None = None             # None: no first touch sent yet, finished, or stopped
    due_at: datetime | None = None
    open_draft: dict | None = None           # a pending/approved draft for next_step that is not sent yet
    first_sent: dict | None = None           # the step-0 sent event (thread id for follow-ups)

    @property
    def last_step(self) -> int | None:
        return max(self.sent_steps) if self.sent_steps else None


def compute_state(p: dict, events: list[dict], suppressed: set[str], cfg: dict) -> SeqState:
    """events: this prospect's outreach_events (any order)."""
    email = norm_email(p.get("email"))
    st = SeqState(p["id"], email)
    for ev in events:
        if ev.get("event_type") == "sent" and ev.get("step") is not None:
            ts = sent_at(ev)
            k = int(ev["step"])
            if k not in st.sent_steps or ts < st.sent_steps[k]:
                st.sent_steps[k] = ts
                if k == 0:
                    st.first_sent = ev
    stop = next((ev["event_type"] for ev in events if ev.get("event_type") in STOP_EVENTS), None)
    if stop:
        st.stopped = stop
    elif p.get("status") in STOP_STATUSES:
        st.stopped = f"status:{p['status']}"
    elif not email:
        st.stopped = "no_email"
    elif email in suppressed:
        st.stopped = "suppressed"
    if st.stopped or st.last_step is None:
        return st
    if st.last_step >= MAX_STEP:
        st.stopped = "finished"
        return st
    nxt = st.last_step + 1
    gaps = cfg["sequence"]["gaps_days"]
    for ev in events:
        if ev.get("event_type") == "drafted" and ev.get("step") == nxt and nxt not in st.sent_steps:
            if ev.get("review_status") in OPEN_REVIEW:
                st.open_draft = ev
            elif ev.get("review_status") == "skipped":
                st.stopped = f"owner_skipped_step_{nxt}"
                return st
    st.next_step = nxt
    st.due_at = st.sent_steps[st.last_step] + timedelta(days=gaps[st.last_step])
    return st


def is_due(st: SeqState, on: date, tz: str) -> bool:
    """A follow-up is due on send day `on` if its due date (local) is on or before it and nothing is drafted for it yet."""
    return (not st.stopped and st.next_step is not None and st.open_draft is None
            and st.due_at is not None and local_date(st.due_at, tz) <= on)


# ------------------------------------------------------------------ follow-up copy
def _industry(p: dict) -> str:
    return _INDUSTRY.get(p.get("industry") or "", p.get("industry") or "local service")


def compose_followup(p: dict, step: int, address: str, signature: str, prior_subject: str | None = None) -> tuple[str, str]:
    """(subject, body) for follow-up `step` (1-3). Only the business name and industry come from the row."""
    name = p["name"]
    industry = _industry(p)
    base = prior_subject or f"Phone calls at {name}"
    subject = base if base.lower().startswith("re:") else f"Re: {base}"
    if step == 1:
        middle = [
            f"I wanted to follow up on my email from a few days ago about phone calls at {name}.",
            "",
            f"In short, LaunchPad Local sets up an AI receptionist that answers inbound calls for local {industry} businesses. "
            "It tells callers it is an AI assistant, takes their details, and emails you a summary after each call.",
            "",
            "If that would be useful, reply and I will send the details. If not, no problem.",
        ]
    elif step == 2:
        middle = [
            f"One more note about my earlier emails on phone calls at {name}.",
            "",
            "If calls sometimes go to voicemail while your team is out on a job, the receptionist can answer them, "
            "collect the caller's name, number and reason for calling, and email that to you.",
            "",
            "Happy to send a short overview if you would like one. Just reply to this email.",
        ]
    elif step == 3:
        middle = [
            f"I have emailed a couple of times about an AI receptionist for {name} and have not heard back, "
            "so this is my last note.",
            "",
            "If the timing is ever better, just reply to this email. Thanks for your time.",
        ]
    else:
        raise DraftError(f"no follow-up template for step {step}")
    lines = ["Hi there,", ""] + middle + ["", "Thanks,", signature, address, "", OPT_OUT]
    return subject, "\n".join(lines)


_PHONE = re.compile(r"\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b|\+1\d{10}")
_TEXT_PROMISE = re.compile(r"\btext(s|ed)?\s+(you|the owner|a summary)\b|\bSMS\b|\btext (message|summary)", re.I)


def validate_followup(body: str, address: str) -> None:
    if address not in body:
        raise DraftError("follow-up is missing the mailing address")
    if OPT_OUT not in body:
        raise DraftError("follow-up is missing the opt-out line")
    if re.search(r"\$\s?\d", body):
        raise DraftError("follow-up must not contain prices")
    if _PHONE.search(body.replace(address, "")):
        raise DraftError("follow-up must not contain a phone number (demo line is not public)")
    if _TEXT_PROMISE.search(body):
        raise DraftError("follow-up must not promise text summaries (SMS is off)")
    if len(body.replace(address, "").replace(OPT_OUT, "").split()) > MAX_WORDS:
        raise DraftError("follow-up is too long")
