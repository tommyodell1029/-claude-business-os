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
| prospect_id | uuid FK | |
| step | smallint 0–3 | sequence steps on day 0, 3, 7 and 14 |
| event_type | text | `drafted`, `approved`, `edited`, `skipped`, `sent`, `reply`, `bounce`, `unsubscribe`, `complaint` or `paused` |
| review_status | text | `pending`, `approved`, `skipped` or `sent`; drives the `/admin/review` page |
| subject, body | text | |
| scheduled_for | timestamptz | |
| platform | text | `instantly` or `smartlead` |
| platform_message_id | text | unique per (platform, id, event_type), which makes re-runs idempotent |
| classification | text | `interested`, `question`, `not_now`, `not_interested`, `unsubscribe` or `out_of_office` |
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
