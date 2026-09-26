# agents/notify: post-call handler

This handler runs in-process at the end of every call. It replaces all n8n logic. The handler itself is built in phase T5.

## Order of operations (each step retries; a failure in one never blocks the others)
1. Insert a row into `calls`. This must succeed. It is idempotent on `call_sid`.
2. Send the owner an SMS through Twilio. Urgent calls start with `URGENT`. This step is skipped until A2P 10DLC is approved, and `calls.sms_status` records the result.
3. Send the owner an email through Resend with the full summary and transcript. `calls.email_status` records the result.

Failures are logged with secrets removed by `lp.text.redact`.

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
| sms_status, email_status | text | `sent`, `failed` or `skipped` |
| created_at | timestamptz | |

### cost_events
One row per unit of spend: `category` is one of `call`, `places`, `email_platform`, `llm`, `sms`, `email_alert` or `audit`. Each row has `client_slug` (nullable), `units`, `amount_usd`, `meta` (jsonb) and `created_at`. The weekly audit reads this table.

### site_leads
Written by the website's `/api/lead` route: `name`, `email`, `phone`, `business`, `message`, `consent` (must be true), `consent_text` (the exact checkbox wording), `ip_hash` (a salted SHA-256, never the raw IP), `user_agent` and `created_at`. Each lead needs at least an email or a phone number.

### audits
Written by the weekly audit job: `week_start`, `model`, `calls_sampled`, `emails_sampled`, `pass_rate`, `findings` (jsonb), `costs` (jsonb), `report` and `created_at`.
