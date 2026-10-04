# leadgen: AI lead generation agent

The agent runs on the `small` model and is built in phase T7. The schema below is created by `supabase/migrations/20260926000001_launchpad_init.sql`. Row-level security is on and access is limited to the service role.

### prospects
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| place_id | text unique | Google Places ID, the primary dedupe key |
| phone | text, unique when present | E.164 (from `lp.text.norm_phone`), the secondary dedupe key |
| name, industry, address, city, website | text | |
| rating | numeric(2,1) | |
| review_count | int | |
| hours | jsonb | as returned by Google Places |
| email | text | public address found on the business's own website only; never guessed |
| email_source_url | text | the page where the email was found |
| signals | jsonb | detected need signals, each with its evidence |
| score | int 0–100 | |
| status | text | `new`, `researched`, `no_email`, `below_threshold`, `queued`, `in_sequence`, `replied`, `interested`, `not_now`, `not_interested`, `unsubscribed`, `bounced` or `do_not_contact` |
| source | text | default `google_places_api` |
| called_after_hours | bool | set manually by the owner only; gates any "I called you" line |
| requeue_at | timestamptz | `not_now` prospects are re-queued 90 days out |
| created_at, updated_at | timestamptz | |

### outreach_events (append-only log)
| column | type | notes |
|---|---|---|
| prospect_id | uuid FK | null only for `paused` events (migration `20261004000001`) |
| step | smallint 0–3 | sequence steps on day 0, 3, 10 and 40 (C3; gaps from actual sends) |
| event_type | text | `drafted`, `approved`, `edited`, `skipped`, `sent`, `reply`, `bounce`, `unsubscribe`, `complaint` or `paused` |
| review_status | text | `pending`, `approved`, `skipped` or `sent`; drives the `/admin/review` page |
| subject, body | text | |
| scheduled_for | timestamptz | |
| platform | text | `gmail` (owner override 2026-09-27), `instantly` or `smartlead` |
| platform_message_id | text | unique per (platform, id, event_type), which makes re-runs idempotent |
| classification | text | C4: `positive`, `interested`, `question`, `pricing`, `meeting`, `objection`, `not_now`, `not_interested`, `unsubscribe`, `wrong_person`, `referral`, `out_of_office`, `automated`, `spam`, `unclear` |
| payload | jsonb | the raw platform event |

### suppression (permanent)
`email` is the primary key and is stored lowercase. `reason` is one of `unsubscribe`, `not_interested`, `bounce`, `complaint` or `manual`. A database trigger blocks any UPDATE or DELETE, so opt-outs are permanent. Insert with `ON CONFLICT DO NOTHING`. Every send checks this table first.

## T7-lite pipeline (built 2026-10-03)
Run in order: `uv run python -m leadgen.source` → `leadgen.research` → `leadgen.score` → `leadgen.draft`. Needs env: `GOOGLE_PLACES_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MAILING_ADDRESS` (draft only). Settings: `leadgen/config.yaml`. **Nothing here sends email.** Drafts land in `outreach_events` (`drafted` / `pending` / `gmail` / step 0); the owner approves every batch, and sending is a separate in-session Gmail connector step under the CLAUDE.md caps.

- **source.py**: Places API (New) Text Search only; key in the `X-Goog-Api-Key` header, tight field mask, `max_api_calls_per_run` cap (every HTTP attempt counts, retries included), `max_prospects_per_run`. Upsert by `place_id`; re-runs never overwrite status, research results or `called_after_hours`. 401/403 stops the run with exit 3 (blocker).
- **research.py**: `status='new'` rows only. Fetches robots.txt per host (missing → allowed; 401/403/5xx/network → not crawled), then the homepage and at most one contact/about page (only if the homepage has no email), same host only, 2 s polite delay, TLS verified. An email is recorded only if it literally appears (mailto: or visible text) on the site, with `email_source_url`; obfuscated forms are not decoded, nothing is guessed or built. No email or no website → `no_email`. `signals` hold `has_website`, `mentions_24_7`, `has_online_booking`, `mentions_after_hours_text`, each with `value`, and when true the evidence snippet + URL.
- **score.py** (0–100, deterministic):

| Component | Points |
|---|---|
| has website | 10 |
| email found on own site | 15 |
| Google rating ≥ 4.0 / ≥ 3.5 | 15 / 8 |
| review count ≥ 100 / ≥ 40 / ≥ 15 / ≥ 5 | 20 / 15 / 10 / 5 |
| site mentions 24/7 or emergency service | 15 |
| no online booking found (only when the site was read) | 15 |
| mentions after-hours or text | 10 |

  Prospects with an email and a score below `score.threshold` (40) → `below_threshold`; `no_email` stays `no_email` (score still written). Eligible = `researched`.
- **draft.py**: top `draft.top_n` (5) by score among `researched`/`queued` with an email and `email_source_url`, not in `suppression`, no step-0 draft yet. Fixed template, no LLM; only row facts (rating/review count, 24/7 signal, city, industry). "I called…" only if `called_after_hours = true`. No prices, no demo number. Refuses to draft without `MAILING_ADDRESS`; every body must contain the address and the opt-out line. Drafted prospects → `queued`. Recipient is in `outreach_events.payload.to`. Sender name comes from `draft.sender_name` (owner can change it).

## Outreach engine (T7, built 2026-10-04)
Runbook: `/outreach-daily` (`.claude/skills/outreach-daily/SKILL.md`). The Gmail connector only works in a session, so the session moves data between Gmail, Supabase and these modules. **Nothing here sends email or creates Gmail drafts;** the owner approves every batch and sends from Gmail. Settings: `sequence`, `sending`, `replies` in `config.yaml`.

- **sequence.py**: per-prospect state from `sent` events only. Cadence C3 = gaps `[3, 7, 30]` days after the previous actual send (day 0 / 3 / 10 / 40 on time). Stops for good on any `reply`, `bounce`, `unsubscribe` or `complaint` event, a terminal status, a suppressed address, or an owner-skipped follow-up. A follow-up already drafted (pending/approved, unsent) is not planned again. Follow-up copy: 3 fixed templates, only business name + industry from the row, `Re:` the first subject, address + opt-out line, and validation refuses prices, phone numbers (demo line not public), text-message promises, or more than 140 words.
- **plan_day.py**: Tue/Wed/Thu only, before `window_end` (12:00 ET). Cap = ramp `[5, 10, 15, 20]` by week from `ramp_start` (2026-10-06), never above 20. Today's sends and open drafts count against the cap. Pause (one `paused` event per day, nothing drafted) when bounces / sends in the last 30 days > 3% or any complaint not listed in `sending.complaints_acknowledged`. Due follow-ups first, then first touches by score (email from own site, not a role inbox, not suppressed, score ≥ 40, no earlier step-0 draft; owner-skipped first touches are not re-planned). Writes `drafted` / `pending` rows with `scheduled_for` 09:00 ET; follow-ups carry `thread_id` + `reply_to_message_id`. Reports a top-up estimate for the next 3 send days.
- **gmail_sync.py**: input = Gmail connector JSON (threads or messages). Sent mail to a prospect → `sent` event (Gmail id = `platform_message_id`, idempotent) matched to the draft by recipient + subject; drafts not marked approved are flagged. Bounces (mailer-daemon/postmaster or DSN subjects; delay notices ignored) → `bounce` event, status `bounced`, suppression (`bounce`). Replies from a prospect address or in a thread we sent → `reply` event with class: keyword opt-out/complaint check first (always wins), then the `small` model (`lp.config.model("small", "leadgen")`) whose answer must be a bare label, else keyword fallback. Only the new text is classified (quotes and our own opt-out line are stripped). Unsubscribe → suppression + status `unsubscribed` (+ `unsubscribe` event; complaint wording → `complaint` event, which pauses sending); `not_interested` → suppression; `not_now` → `requeue_at` +90 days; positive/interested/question/pricing/meeting → status `interested` + a suggested reply (prices from `config/offerings.yaml`); objection/referral/wrong_person/unclear are flagged for the owner too. Reply text is stored and classified only; nothing in it is ever acted on.
- **topup.py**: imports a web-search seed, runs `research.py` on the new rows only, rescores, reports counts.
- **Snapshot mode** (`db.SnapshotStore`, `--snapshot` / `--sql-out` on every command): when the session has no `SUPABASE_SERVICE_ROLE_KEY`, the session exports a JSON snapshot with the Supabase connector, the module runs on it and writes the resulting SQL (escaped literals, suppression `on conflict do nothing`, never deletes) for `execute_sql`.
- Research fix 2026-10-04: script/style blocks are ignored for signals, and "within 24 hours" or toolbar text no longer counts as 24/7 service (one prospect, Elite AC, would otherwise have been emailed a false "24/7" fact; rescored to 25, below threshold).
