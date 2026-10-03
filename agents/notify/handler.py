"""Post-call handler (T5). Called once at the end of every call from agents/bot.py.

Steps run in order and are independent: a failure in one never blocks the next. Each retries via lp.retry and
logs only through lp.text.redact. Never raises.
  a. Insert the call into Supabase `calls` (idempotent on call_sid).
  b. Email the client owner via Resend (transactional alerts only; skipped if NOTIFY_FROM_EMAIL is unset).
  c. SMS via Twilio, OFF unless NOTIFY_SMS_ENABLED=1 (A2P 10DLC not approved yet).
Afterwards the email/SMS outcome is written to calls.email_status / sms_status (best effort).
"""
from __future__ import annotations

import asyncio
import os
import time
from typing import Callable, Mapping

from loguru import logger

from lp.retry import retry
from lp.text import norm_email, redact

from .http import Http, HttpError, RetryableError, call, urllib_http
from .messages import email_body, email_subject, sms_body
from .supabase_rest import Supabase

_INTENTS = {"new_job", "question", "existing_customer", "emergency", "spam", "other"}
_END_REASONS = {"completed", "transferred", "spam", "abusive", "silence", "max_duration", "hangup"}
_TRUTHY = {"1", "true", "yes", "on"}


def _sanitize(record: dict) -> dict:
    """Coerce enum fields so a stray value can never fail the whole insert on a CHECK constraint."""
    r = dict(record)
    if r.get("intent") not in _INTENTS:
        r["intent"] = "other"
    if r.get("end_reason") not in _END_REASONS:
        r["end_reason"] = "hangup"
    if r.get("urgency") not in ("normal", "urgent"):
        r["urgency"] = "normal"
    return r


class Notifier:
    def __init__(self, env: Mapping[str, str] | None = None, http: Http = urllib_http,
                 sleep: Callable[[float], None] = time.sleep):
        self.env = os.environ if env is None else env
        self.http = http
        self.sleep = sleep
        self.db = Supabase(self.env, http)

    def _retry(self, step: str, fn):
        def on_error(e: Exception, attempt: int):
            logger.warning(redact(f"notify {step} attempt {attempt} failed: {e}"))
        return retry(fn, attempts=3, exceptions=(RetryableError,), on_error=on_error, sleep=self.sleep)

    # ---- a. database
    def save_call(self, record: dict, cfg) -> str | None:
        """Returns the new row id (None for a duplicate). Raises if the insert ultimately fails."""
        if not self.db.configured:
            raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
        try:
            return self._retry("db", lambda: self.db.insert_call(record))
        except HttpError as e:
            if "23503" not in e.body:  # FK violation: the client row does not exist yet
                raise
        # calls.client_slug references clients(slug): create the missing client row (never overwrite), then retry once
        logger.info(f"notify: creating missing client row for {cfg.slug}")
        self._retry("db-client", lambda: self.db.upsert_client(client_row(cfg), overwrite=False))
        return self._retry("db", lambda: self.db.insert_call(record))

    # ---- b. email
    def send_email(self, record: dict, cfg) -> str:
        sender = self.env.get("NOTIFY_FROM_EMAIL")
        key = self.env.get("RESEND_API_KEY")
        to = norm_email(cfg.owner_email)
        if not sender:
            logger.info("notify email skipped: NOTIFY_FROM_EMAIL not set")
            return "skipped"
        if not key:
            logger.info("notify email skipped: RESEND_API_KEY not set")
            return "skipped"
        if not to:
            logger.info(f"notify email skipped: no valid owner_email for client {cfg.slug}")
            return "skipped"
        payload = {"from": sender, "to": [to], "subject": email_subject(record, cfg.business_name),
                   "text": email_body(record, cfg.business_name, cfg.timezone)}
        headers = {"Authorization": f"Bearer {key}"}
        if record.get("call_sid"):
            headers["Idempotency-Key"] = f"call-alert-{record['call_sid']}"  # a retry can never double-send
        self._retry("email", lambda: call(self.http, "resend", "POST", "https://api.resend.com/emails", headers, payload))
        return "sent"

    # ---- c. sms
    def send_sms(self, record: dict, cfg) -> str:
        if str(self.env.get("NOTIFY_SMS_ENABLED", "")).lower() not in _TRUTHY:
            return "skipped"
        sid, token = self.env.get("TWILIO_ACCOUNT_SID"), self.env.get("TWILIO_AUTH_TOKEN")
        sender = self.env.get("TWILIO_SMS_FROM") or cfg.twilio_number
        if not (sid and token and sender and cfg.owner_phone):
            logger.info(f"notify sms skipped: missing Twilio creds, sender or owner_phone for {cfg.slug}")
            return "skipped"
        import base64
        auth = base64.b64encode(f"{sid}:{token}".encode()).decode()
        payload = {"To": cfg.owner_phone, "From": sender, "Body": sms_body(record, cfg.business_name)}
        self._retry("sms", lambda: call(self.http, "twilio", "POST",
                                        f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
                                        {"Authorization": f"Basic {auth}"}, payload, form=True))
        return "sent"

    def _step(self, name: str, fn) -> str:
        try:
            return fn()
        except Exception as e:  # independent steps: log and carry on
            logger.error(redact(f"notify {name} failed: {e}"))
            return "failed"

    def handle(self, record: dict, cfg) -> dict:
        record = _sanitize(record)
        call_id: str | None = None
        db_status = "failed"
        try:
            call_id = self.save_call(record, cfg)
            db_status = "saved" if call_id else "duplicate"
        except Exception as e:
            logger.error(redact(f"notify db insert failed: {e}"))
        email = self._step("email", lambda: self.send_email(record, cfg))
        sms = self._step("sms", lambda: self.send_sms(record, cfg))
        if call_id:
            try:
                self._retry("db-status", lambda: self.db.update_call(call_id, {"email_status": email, "sms_status": sms}))
            except Exception as e:
                logger.error(redact(f"notify status update failed: {e}"))
        logger.info(f"notify done client={cfg.slug} db={db_status} email={email} sms={sms}")
        return {"db": db_status, "email": email, "sms": sms, "call_id": call_id}


def client_row(cfg, *, status: str | None = None) -> dict:
    """`clients` table row from a ClientConfig. config = the YAML as written (${VAR} placeholders, no secrets)."""
    row = {"slug": cfg.slug, "business_name": cfg.business_name, "industry": cfg.industry, "timezone": cfg.timezone,
           "owner_phone": cfg.owner_phone, "owner_email": cfg.owner_email, "handoff_number": cfg.handoff_number,
           "twilio_number": cfg.twilio_number, "config": cfg.raw}
    if status:
        row["status"] = status
    return row


def handle(record: dict, cfg, notifier: Notifier | None = None) -> dict:
    return (notifier or Notifier()).handle(record, cfg)


async def handle_async(record: dict, cfg, notifier: Notifier | None = None) -> dict:
    """For the bot's event loop: the blocking retries run in a worker thread."""
    return await asyncio.to_thread(handle, record, cfg, notifier)
