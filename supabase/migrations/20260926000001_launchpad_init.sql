-- LaunchPad Local: initial schema. Additive only (CREATE ... IF NOT EXISTS); never drops.
-- Access model: RLS ON everywhere with NO policies -> anon/authenticated get nothing.
-- Server code (agents/notify, leadgen, audit, site API routes) uses the service_role key, which bypasses RLS.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

-- ------------------------------------------------------------------ clients
create table if not exists public.clients (
  slug            text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  business_name   text not null,
  industry        text,
  timezone        text not null default 'America/New_York',
  owner_phone     text,
  owner_email     text,
  handoff_number  text,
  twilio_number   text unique,
  status          text not null default 'onboarding' check (status in ('onboarding','live','paused','ended')),
  config          jsonb not null default '{}'::jsonb,   -- snapshot of clients/<slug>.yaml at deploy
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ------------------------------------------------------------------ calls
create table if not exists public.calls (
  id            uuid primary key default gen_random_uuid(),
  client_slug   text not null references public.clients(slug) on update cascade,
  call_sid      text unique,                              -- Twilio CallSid; makes post-call insert idempotent
  caller_name   text,
  caller_phone  text,
  intent        text check (intent in ('new_job','question','existing_customer','emergency','spam','other')),
  summary       text,
  urgency       text not null default 'normal' check (urgency in ('normal','urgent')),
  transcript    text,
  duration_sec  integer check (duration_sec >= 0),
  est_cost      numeric(10,4),
  transferred   boolean not null default false,
  end_reason    text check (end_reason in ('completed','transferred','spam','abusive','silence','max_duration','hangup')),
  disclosure_spoken boolean not null default false,        -- audit: FL all-party-consent line was played
  details       jsonb not null default '{}'::jsonb,         -- address, best_time, preferred_time
  sms_status    text check (sms_status in ('sent','failed','skipped')),
  email_status  text check (email_status in ('sent','failed','skipped')),
  created_at    timestamptz not null default now()
);
create index if not exists calls_client_created_idx on public.calls (client_slug, created_at desc);

-- ------------------------------------------------------------------ site_leads
create table if not exists public.site_leads (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text,
  phone         text,
  business      text,
  message       text,
  consent       boolean not null check (consent),         -- form cannot be stored without consent
  consent_text  text not null,
  ip_hash       text,                                     -- sha256(ip + salt), never raw IP
  user_agent    text,
  created_at    timestamptz not null default now(),
  check (email is not null or phone is not null)
);

-- ------------------------------------------------------------------ prospects
create table if not exists public.prospects (
  id                  uuid primary key default gen_random_uuid(),
  place_id            text unique,
  name                text not null,
  industry            text,
  address             text,
  city                text,
  phone               text,                               -- E.164
  website             text,
  rating              numeric(2,1),
  review_count        integer,
  hours               jsonb,
  email               text,                               -- only a public address found on the business's own site
  email_source_url    text,                               -- page the email was found on (proof it was not guessed)
  signals             jsonb not null default '{}'::jsonb,
  score               integer check (score between 0 and 100),
  status              text not null default 'new' check (status in
                        ('new','researched','no_email','below_threshold','queued','in_sequence',
                         'replied','interested','not_now','not_interested','unsubscribed','bounced','do_not_contact')),
  source              text not null default 'google_places_api',
  called_after_hours  boolean not null default false,     -- set manually by owner only
  requeue_at          timestamptz,                        -- not_now -> +90 days
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index if not exists prospects_phone_uidx on public.prospects (phone) where phone is not null;
create index if not exists prospects_status_score_idx on public.prospects (status, score desc);

-- ------------------------------------------------------------------ outreach_events
create table if not exists public.outreach_events (
  id                   uuid primary key default gen_random_uuid(),
  prospect_id          uuid not null references public.prospects(id),
  step                 smallint check (step between 0 and 3), -- day 0 / 3 / 10 / 40 (C3)
  event_type           text not null check (event_type in
                         ('drafted','approved','edited','skipped','sent','reply','bounce','unsubscribe','complaint','paused')),
  review_status        text check (review_status in ('pending','approved','skipped','sent')),
  subject              text,
  body                 text,
  scheduled_for        timestamptz,
  platform             text check (platform in ('gmail','instantly','smartlead')),  -- gmail = owner override 2026-09-27
  platform_message_id  text,
  classification       text check (classification in                    -- C4: 14 classes + not_now
                         ('positive','interested','question','pricing','meeting','objection','not_now','not_interested',
                          'unsubscribe','wrong_person','referral','out_of_office','automated','spam','unclear')),
  payload              jsonb,
  created_at           timestamptz not null default now()
);
create index if not exists outreach_prospect_idx on public.outreach_events (prospect_id, created_at);
create index if not exists outreach_review_idx on public.outreach_events (review_status) where review_status = 'pending';
create unique index if not exists outreach_platform_msg_uidx
  on public.outreach_events (platform, platform_message_id, event_type) where platform_message_id is not null;

-- ------------------------------------------------------------------ suppression (permanent)
create table if not exists public.suppression (
  email       text primary key check (email = lower(email)),
  reason      text not null check (reason in ('unsubscribe','not_interested','bounce','complaint','manual')),
  source      text,
  created_at  timestamptz not null default now()
);

create or replace function public.suppression_is_permanent() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'suppression rows are permanent (opt-outs cannot be removed or edited)'; end $$;

drop trigger if exists suppression_no_delete on public.suppression;
create trigger suppression_no_delete before delete or update on public.suppression
  for each row execute function public.suppression_is_permanent();

-- ------------------------------------------------------------------ audits
create table if not exists public.audits (
  id           uuid primary key default gen_random_uuid(),
  week_start   date not null,
  model        text not null,
  calls_sampled   integer not null default 0,
  emails_sampled  integer not null default 0,
  pass_rate    numeric(5,2),
  findings     jsonb not null default '[]'::jsonb,
  costs        jsonb not null default '{}'::jsonb,
  report       text,
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------------ cost_events (Places / email / LLM / telephony spend)
create table if not exists public.cost_events (
  id           uuid primary key default gen_random_uuid(),
  category     text not null check (category in ('call','places','email_platform','llm','sms','email_alert','audit')),
  client_slug  text references public.clients(slug) on update cascade,
  units        numeric,
  amount_usd   numeric(10,4) not null default 0,
  meta         jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists cost_events_cat_created_idx on public.cost_events (category, created_at);

-- ------------------------------------------------------------------ updated_at triggers
drop trigger if exists clients_updated_at on public.clients;
create trigger clients_updated_at before update on public.clients
  for each row execute function public.set_updated_at();
drop trigger if exists prospects_updated_at on public.prospects;
create trigger prospects_updated_at before update on public.prospects
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------ lock down
do $$
declare t text;
begin
  foreach t in array array['clients','calls','site_leads','prospects','outreach_events','suppression','audits','cost_events']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
