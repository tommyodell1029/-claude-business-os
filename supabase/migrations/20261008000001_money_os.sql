-- Money OS Phase 1 (docs/money-os/PHASE_1_PLAN.md): opportunities, evidence, research cache, experiments,
-- AI usage ledger, revenue entries, activity log. Additive only.
-- Same access model as earlier migrations: RLS forced, no policies, anon/authenticated revoked, service role only.

-- ------------------------------------------------------------------ opportunities
create table if not exists public.opportunities (
  id                        uuid primary key default gen_random_uuid(),
  slug                      text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  name                      text not null check (char_length(name) between 1 and 160),
  category                  text not null check (char_length(category) between 1 and 60),
  problem                   text check (char_length(problem) <= 1000),
  audience                  text check (char_length(audience) <= 500),
  monetization              text[] not null default '{}',
  status                    text not null default 'discovered'
                              check (status in ('discovered','researched','validation_ready','validating','validated',
                                                'building','live','growing','killed')),
  -- 15 sub-scores, 0-10; null = unknown (never scored). "Bad" dimensions are stored raw and inverted in code.
  s_demand                  numeric(4,2) check (s_demand between 0 and 10),
  s_trend                   numeric(4,2) check (s_trend between 0 and 10),
  s_competition             numeric(4,2) check (s_competition between 0 and 10),
  s_monetization            numeric(4,2) check (s_monetization between 0 and 10),
  s_recurring               numeric(4,2) check (s_recurring between 0 and 10),
  s_affiliate               numeric(4,2) check (s_affiliate between 0 and 10),
  s_content                 numeric(4,2) check (s_content between 0 and 10),
  s_automation              numeric(4,2) check (s_automation between 0 and 10),
  s_speed                   numeric(4,2) check (s_speed between 0 and 10),
  s_startup_cost            numeric(4,2) check (s_startup_cost between 0 and 10),
  s_tech_difficulty         numeric(4,2) check (s_tech_difficulty between 0 and 10),
  s_acquisition_difficulty  numeric(4,2) check (s_acquisition_difficulty between 0 and 10),
  s_retention               numeric(4,2) check (s_retention between 0 and 10),
  s_market_size             numeric(4,2) check (s_market_size between 0 and 10),
  s_defensibility           numeric(4,2) check (s_defensibility between 0 and 10),
  score_reasons             jsonb not null default '{}'::jsonb,   -- {dimension: one-line reason}, from evidence
  overall_score             numeric(4,2) check (overall_score between 0 and 10),   -- computed in code
  confidence                numeric(3,2) check (confidence between 0 and 1),       -- computed in code
  validation_difficulty     smallint check (validation_difficulty between 1 and 10),
  est_days_to_first_dollar  integer check (est_days_to_first_dollar >= 0),
  evidence_count            integer not null default 0,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index if not exists opportunities_rank_idx on public.opportunities (overall_score desc nulls last);
create index if not exists opportunities_status_idx on public.opportunities (status);

-- ------------------------------------------------------------------ opportunity_evidence
create table if not exists public.opportunity_evidence (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references public.opportunities(id) on delete cascade,
  kind            text not null check (kind in ('demand','trend','competition','pricing','affiliate','audience','other')),
  claim           text not null check (char_length(claim) between 1 and 600),
  source_url      text check (char_length(source_url) <= 2000),
  source_domain   text check (char_length(source_domain) <= 253),
  observed_at     timestamptz not null default now(),
  content_hash    text not null,
  created_at      timestamptz not null default now(),
  unique (opportunity_id, content_hash)
);
create index if not exists opportunity_evidence_opp_idx on public.opportunity_evidence (opportunity_id);

-- ------------------------------------------------------------------ experiments
create table if not exists public.experiments (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid references public.opportunities(id),
  name            text not null check (char_length(name) between 1 and 160),
  hypothesis      text check (char_length(hypothesis) <= 1000),
  method          text check (char_length(method) <= 1000),
  success_metric  text check (char_length(success_metric) <= 300),
  target          text check (char_length(target) <= 300),
  budget_usd      numeric(10,2) not null default 0 check (budget_usd >= 0),
  status          text not null default 'validating'
                    check (status in ('validation_ready','validating','validated','building','live','growing','killed')),
  result_note     text check (char_length(result_note) <= 2000),
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  updated_at      timestamptz not null default now()
);
create index if not exists experiments_status_idx on public.experiments (status);

-- ------------------------------------------------------------------ research_runs (cache)
create table if not exists public.research_runs (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid references public.opportunities(id) on delete set null,
  kind            text not null check (kind in ('radar_sweep','opportunity_research')),
  query           text not null check (char_length(query) <= 500),
  query_hash      text not null,
  status          text not null default 'ok' check (status in ('ok','failed','budget_refused')),
  result          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null
);
create index if not exists research_runs_hash_idx on public.research_runs (query_hash, expires_at desc);

-- ------------------------------------------------------------------ ai_usage (one row per model call)
create table if not exists public.ai_usage (
  id                  uuid primary key default gen_random_uuid(),
  at                  timestamptz not null default now(),
  task                text not null check (char_length(task) <= 60),
  component           text not null check (char_length(component) <= 30),
  provider            text not null default 'anthropic',
  model               text not null,
  input_tokens        integer not null default 0,
  output_tokens       integer not null default 0,
  cache_read_tokens   integer not null default 0,
  cache_write_tokens  integer not null default 0,
  web_searches        integer not null default 0,
  est_cost_usd        numeric(12,6) not null default 0,
  estimated           boolean not null default false,   -- true when counts or prices were not exact
  duration_ms         integer,
  ok                  boolean not null default true,
  opportunity_id      uuid references public.opportunities(id) on delete set null,
  experiment_id       uuid references public.experiments(id) on delete set null,
  session_id          text check (char_length(session_id) <= 80)
);
create index if not exists ai_usage_at_idx on public.ai_usage (at desc);

-- Daily totals in the owner's time zone (budget checks + AI Cost tab). security_invoker so RLS still applies.
create or replace view public.ai_cost_daily with (security_invoker = true) as
  select (at at time zone 'America/New_York')::date as day,
         count(*)::int as calls,
         sum(input_tokens)::bigint as input_tokens,
         sum(output_tokens)::bigint as output_tokens,
         sum(est_cost_usd)::numeric(12,6) as cost_usd,
         bool_or(estimated) as any_estimated
  from public.ai_usage
  group by 1;

-- ------------------------------------------------------------------ revenue_entries
-- Non-Stripe revenue and per-experiment revenue. Agency Stripe revenue stays in public.payments (not copied).
create table if not exists public.revenue_entries (
  id                 uuid primary key default gen_random_uuid(),
  venture            text not null check (char_length(venture) between 1 and 80),
  experiment_id      uuid references public.experiments(id),
  source             text not null check (source in ('stripe','manual','affiliate','marketplace','other')),
  product            text check (char_length(product) <= 160),
  amount_usd         numeric(12,2) not null check (amount_usd >= 0),
  cost_usd           numeric(12,2) not null default 0 check (cost_usd >= 0),
  occurred_on        date not null,
  note               text check (char_length(note) <= 500),
  stripe_payment_id  text unique,
  created_at         timestamptz not null default now()
);
create index if not exists revenue_entries_day_idx on public.revenue_entries (occurred_on desc);

-- ------------------------------------------------------------------ activity
create table if not exists public.activity (
  id            uuid primary key default gen_random_uuid(),
  at            timestamptz not null default now(),
  actor         text not null check (actor in ('owner','ultron','radar','system')),
  action        text not null check (char_length(action) <= 60),
  subject_type  text check (char_length(subject_type) <= 40),
  subject_id    text check (char_length(subject_id) <= 80),
  detail        text check (char_length(detail) <= 1000)
);
create index if not exists activity_at_idx on public.activity (at desc);

-- ------------------------------------------------------------------ lock down
do $$
declare t text;
begin
  foreach t in array array['opportunities','opportunity_evidence','experiments','research_runs','ai_usage',
                           'revenue_entries','activity']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke all on public.ai_cost_daily from anon, authenticated;
