"""Website lead alerts. The site's /api/lead route emails the owner the moment a lead arrives; this sweep re-sends
any lead the route could not alert (Resend down, env missing, function timeout). Run: `uv run python -m agents.notify.leads`.

Idempotent: it only touches rows with notified_at IS NULL, and uses the same Resend Idempotency-Key as the route
(`lead-alert-<id>`), so a lead is never emailed twice. Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
NOTIFY_FROM_EMAIL, LEAD_ALERT_EMAIL. Logs through lp.text.redact. Never prints lead contents.
"""
from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone

from loguru import logger

from lp.text import norm_email, redact

from .handler import Notifier
from .http import call
from .messages import lead_body, lead_subject

GRACE_MINUTES = 5  # give the site route time to alert and mark the row first


def send_lead_email(n: Notifier, lead: dict) -> str:
    key, sender = n.env.get("RESEND_API_KEY"), n.env.get("NOTIFY_FROM_EMAIL")
    to = norm_email(n.env.get("LEAD_ALERT_EMAIL"))
    if not (key and sender and to):
        logger.info("lead alert skipped: RESEND_API_KEY, NOTIFY_FROM_EMAIL or a valid LEAD_ALERT_EMAIL not set")
        return "skipped"
    payload = {"from": sender, "to": [to], "subject": lead_subject(lead), "text": lead_body(lead)}
    headers = {"Authorization": f"Bearer {key}", "Idempotency-Key": f"lead-alert-{lead['id']}"}
    n._retry("lead-email", lambda: call(n.http, "resend", "POST", "https://api.resend.com/emails", headers, payload))
    return "sent"


def sweep(n: Notifier | None = None, now: datetime | None = None) -> dict:
    n = n or Notifier()
    if not n.db.configured:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
    cutoff = ((now or datetime.now(timezone.utc)) - timedelta(minutes=GRACE_MINUTES)).isoformat()
    leads = n._retry("lead-list", lambda: n.db.unnotified_leads(cutoff))
    out = {"found": len(leads), "sent": 0, "failed": 0, "skipped": 0}
    for lead in leads:
        status = n._step("lead-email", lambda: send_lead_email(n, lead))
        out[status] += 1
        if status == "skipped":
            continue  # nothing was attempted: leave notified_at null so a later run with config sends it
        fields = {"email_status": status, "notified_at": datetime.now(timezone.utc).isoformat() if status == "sent" else None}
        try:
            n._retry("lead-status", lambda: n.db.update_lead(lead["id"], fields))
        except Exception as e:
            logger.error(redact(f"lead status update failed: {e}"))
    logger.info(f"lead sweep: {out}")
    return out


if __name__ == "__main__":
    try:
        result = sweep()
    except Exception as e:
        logger.error(redact(f"lead sweep failed: {e}"))
        sys.exit(1)
    sys.exit(1 if result["failed"] else 0)
