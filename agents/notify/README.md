# agents/notify: post-call handler

This handler runs in-process at the end of every call (`agents/bot.py` calls `notify.handle_async(record, cfg)`). It replaces all n8n logic. Code: `handler.py` (steps), `supabase_rest.py`, `messages.py` (alert text), `http.py` (stdlib HTTP, no extra dependencies).

## Order of operations (each step retries 3x on 5xx/429/network errors; a failure in one never blocks the others)
1. Insert a row into `calls` (env `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). Idempotent on `call_sid`. If the client's row is missing from `clients`, it is created (never overwritten) and the insert retried. If the insert still fails, `bot.py` keeps the record in `data/calls/` on the container disk.
2. Email the client owner through Resend (env `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`, recipient = the client's `owner_email`). Skipped, and logged, when `NOTIFY_FROM_EMAIL` is unset. Resend is for these transactional alerts only, never cold email. Plain text, short, no transcript. The `Idempotency-Key` header prevents a double send on retry.
3. SMS through Twilio, OFF unless `NOTIFY_SMS_ENABLED=1` (A2P 10DLC is not approved yet). Sender is `TWILIO_SMS_FROM`, else the client's Twilio number. Urgent calls start with `URGENT`. SMS never contains the transcript or any call details; it points to the email.
4. Best effort: write the outcomes to `calls.email_status` and `calls.sms_status`.

Every log line goes through `lp.text.redact`. The handler never raises into the call teardown.

## Website lead alerts
The site's `/api/lead` route inserts the lead into `site_leads`, then emails the owner through Resend right away (`site/lib/leadAlert.ts`) and sets `notified_at` / `email_status`. `leads.py` is the safety net: `uv run python -m agents.notify.leads` re-sends any lead older than 5 minutes that still has `notified_at` null (Resend down, env missing). Both use the Resend `Idempotency-Key` `lead-alert-<id>`, so a lead is never emailed twice. Env (Vercel for the route, session or cron for the sweep): `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`, `LEAD_ALERT_EMAIL` (recipient), plus Supabase for the sweep. The alert is a transactional email to the owner, never cold email. No scheduler runs the sweep yet; run it by hand or from a session until one exists.

## Schema
Source of truth: `supabase/migrations/20260926000001_launchpad_init.sql`.
Row-level security is on for every table and there are no policies, so the anon and authenticated roles can read and write nothing. Only server code using the service-role key can access these tables.

### clients
| column | type | notes |
|---|---|---|
| slug | text PK | `^[a-z0-9][a-z0-9-]{1,62}$`; matches `clients/<slug>.yaml` |
| business_name | text | required |
| industry, owner_phone, owner_email, handoff_number | text | |
| timezone | text | default `America/New_York` |
| twilio_number | text unique | inbound number routed to this client |
| status | text | `onboarding`, `live`, `paused` or `ended` |
| config | jsonb | snapshot of the client YAML at deploy time |
| created_at, updated_at | timestamptz | `updated_at` is maintained by a trigger |

### calls
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| client_slug | text FK → clients | |
| call_sid | text unique | Twilio CallSid, used for idempotent inserts |
| caller_name, caller_phone | text | |
| intent | text | `new_job`, `question`, `existing_customer`, `emergency`, `spam` or `other` |
| summary, transcript | text | |
| urgency | text | `normal` or `urgent` |
| duration_sec | int | |
| est_cost | numeric(10,4) | estimated cost of the call in USD |
| transferred | bool | true if the call was handed to `handoff_number` |
| end_reason | text | `completed`, `transferred`, `spam`, `abusive`, `silence`, `max_duration` or `hangup` |
| disclosure_spoken | bool | true once the recording disclosure was played (checked by the weekly audit) |
| details | jsonb | `address`, `best_time`, `preferred_time` |
| sms_status, email_status | text | `sent`, `failed` or `skipped` |
| created_at | timestamptz | |

### cost_events
One row per unit of spend: `category` is one of `call`, `places`, `email_platform`, `llm`, `sms`, `email_alert` or `audit`. Each row has `client_slug` (nullable), `units`, `amount_usd`, `meta` (jsonb) and `created_at`. The weekly audit reads this table.

### site_leads
Written by the website's `/api/lead` route: `name`, `email`, `phone`, `business`, `message`, `consent` (must be true), `consent_text` (the exact checkbox wording), `ip_hash` (a salted SHA-256, never the raw IP), `user_agent`, `notified_at` and `email_status` (set when the owner is alerted) and `created_at`. Each lead needs at least an email or a phone number.

### audits
Written by the weekly audit job: `week_start`, `model`, `calls_sampled`, `emails_sampled`, `pass_rate`, `findings` (jsonb), `costs` (jsonb), `report` and `created_at`.
