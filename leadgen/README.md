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
