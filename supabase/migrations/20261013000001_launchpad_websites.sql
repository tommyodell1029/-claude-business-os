-- Launchpad Local business module (owner 2026-10-13): $499 one-page websites for plumbing/HVAC first.
-- Additive only. Prospects get a sales pipeline stage + an evidence-backed website audit; client delivery gets one
-- table. RLS on, no policies: service role only, like every table here.

alter table public.prospects
  add column if not exists pipeline_stage text not null default 'identified' check (pipeline_stage in (
    'identified','researching','qualified','audit_prepared','awaiting_approval','contacted','replied',
    'quote_prepared','awaiting_payment','won','in_production','delivered','maintenance','lost')),
  add column if not exists website_audit jsonb,
  add column if not exists audit_at timestamptz,
  add column if not exists website_fit integer check (website_fit is null or (website_fit between 0 and 100)),
  add column if not exists qualification_notes text check (qualification_notes is null or char_length(qualification_notes) <= 2000),
  add column if not exists next_follow_up date,
  add column if not exists outcome text check (outcome is null or char_length(outcome) <= 500),
  add column if not exists offer text check (offer is null or offer in ('receptionist','website'));
create index if not exists prospects_pipeline_idx on public.prospects (pipeline_stage, website_fit desc nulls last);

-- Backfill from the existing outreach status (the 9 receptionist prospects emailed Oct 6-7 keep their history).
update public.prospects set pipeline_stage = case
    when status in ('in_sequence') then 'contacted'
    when status in ('replied','interested','not_now') then 'replied'
    when status in ('not_interested','unsubscribed','bounced','do_not_contact') then 'lost'
    when status in ('researched','no_email','below_threshold') then 'researching'
    else 'identified' end,
  offer = case when status in ('in_sequence','replied','interested','not_now','not_interested','unsubscribed','bounced') then 'receptionist' else offer end
where pipeline_stage = 'identified';

create table if not exists public.client_projects (
  id               uuid primary key default gen_random_uuid(),
  prospect_id      uuid references public.prospects(id) on delete set null,
  business         text not null check (char_length(business) between 1 and 200),
  site_slug        text unique check (site_slug is null or site_slug ~ '^[a-z0-9-]{3,60}$'),
  offer            text not null default 'website_starter',
  price_usd        numeric(10,2) not null check (price_usd >= 0),
  scope            jsonb not null default '{}'::jsonb,          -- approved scope (from offerings.yaml + agreed changes)
  status           text not null default 'quote_prepared' check (status in (
                     'quote_prepared','awaiting_payment','in_production','in_review','revisions','approved','live','handoff_done','cancelled')),
  deposit_status   text not null default 'not_requested' check (deposit_status in ('not_requested','requested','paid','refunded')),
  balance_status   text not null default 'not_requested' check (balance_status in ('not_requested','requested','paid','refunded')),
  assets           jsonb not null default '{}'::jsonb,          -- checklist: logo, photos, services, hours, area, domain access
  preview_url      text,
  qa               jsonb not null default '{}'::jsonb,          -- last QA run (checks + results)
  revisions        jsonb not null default '[]'::jsonb,
  approvals        jsonb not null default '[]'::jsonb,          -- [{what, decided_by, at}] client + owner approvals
  deploy_status    text not null default 'not_started' check (deploy_status in ('not_started','preview','approved_for_launch','live')),
  maintenance      boolean not null default false,
  handoff_at       timestamptz,
  notes            text check (notes is null or char_length(notes) <= 4000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.client_projects enable row level security;
alter table public.client_projects force row level security;
revoke all on public.client_projects from anon, authenticated;
