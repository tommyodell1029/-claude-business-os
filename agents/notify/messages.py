"""Plain, short, client-facing alert text. Polished English. Transcripts never go in SMS, and are left out of email too."""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

_INTENT = {"new_job": "New job request", "question": "Question", "existing_customer": "Existing customer",
           "emergency": "Emergency", "spam": "Spam or sales call", "other": "Call"}


def _when(record: dict, tz: str) -> str:
    try:
        dt = datetime.fromisoformat(record["created_at"]).astimezone(ZoneInfo(tz))
        return dt.strftime("%a %b %-d, %-I:%M %p %Z")
    except (KeyError, ValueError, TypeError):
        return "just now"


def _caller(record: dict) -> str:
    name, phone = record.get("caller_name"), record.get("caller_phone")
    return " ".join(x for x in (name, f"({phone})" if phone else None) if x) or "Unknown caller"


def email_subject(record: dict, business_name: str) -> str:
    urgent = record.get("urgency") == "urgent"
    label = _INTENT.get(record.get("intent") or "other", "Call")
    return f"{'URGENT: ' if urgent else ''}{label} for {business_name}: {_caller(record)}"


def email_body(record: dict, business_name: str, tz: str) -> str:
    d = record.get("details") or {}
    lines = [f"Your AI receptionist took a call for {business_name}.", "",
             f"Caller: {_caller(record)}", f"When: {_when(record, tz)}",
             f"Summary: {record.get('summary') or 'No summary available.'}"]
    if record.get("urgency") == "urgent":
        lines.append("Urgency: URGENT. Please call back as soon as you can.")
    if record.get("transferred"):
        lines.append("This call was transferred to you.")
    for key, label in (("address", "Address"), ("best_time", "Best time to reach them"),
                       ("preferred_time", "Preferred appointment time")):
        if d.get(key):
            lines.append(f"{label}: {d[key]}")
    lines += ["", "Please call back promptly.", "", "LaunchPad Local"]
    return "\n".join(lines)


def sms_body(record: dict, business_name: str) -> str:
    """No transcript and no free-text details: caller, urgency and a pointer to the email only."""
    urgent = record.get("urgency") == "urgent"
    return (f"{'URGENT: ' if urgent else ''}New call for {business_name} from {_caller(record)}. "
            "Details are in your email.")


def _one_line(s: str | None, limit: int) -> str:
    return " ".join((s or "").split())[:limit]


def lead_subject(lead: dict) -> str:
    """Same wording as the site route's alert (site/lib/leadAlert.ts)."""
    biz = _one_line(lead.get("business"), 60)
    return f"New lead: {_one_line(lead.get('name'), 60)}{f' ({biz})' if biz else ''}"


def lead_body(lead: dict) -> str:
    return "\n".join([
        "A new lead came in through the launchpadlocal.org contact form.", "",
        f"Name: {_one_line(lead.get('name'), 100)}",
        f"Business: {_one_line(lead.get('business'), 150) or 'not given'}",
        f"Email: {lead.get('email') or 'not given'}",
        f"Phone: {lead.get('phone') or 'not given'}", "",
        "Message:", lead.get("message") or "(none)", "",
        "They agreed to be contacted about this request. Reply promptly.",
    ])
