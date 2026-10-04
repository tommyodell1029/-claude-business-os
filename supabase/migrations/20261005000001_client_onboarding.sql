-- Client onboarding + minute tracking. Additive only; never drops.
-- client_intakes: one-time intake links (token stored as sha256 only) and the answers a client submits.
-- Access model as in the init migration: RLS forced, no policies, anon/authenticated revoked, service role only.

-- ------------------------------------------------------------------ clients.tier (for overage math)
alter table public.clients add column if not exists tier text check (tier in ('launch','growth','scale'));

-- ------------------------------------------------------------------ client_intakes
create table if not exists public.client_intakes (
  id             uuid primary key default gen_random_uuid(),
  client_slug    text not null check (client_slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  tier           text not null check (tier in ('launch','growth','scale')),
  spanish        boolean not null default false,          -- bought the Spanish add-on (Scale always allows it)
  business_hint  text,                                    -- greeting on the form only; the answers are authoritative
  token_hash     text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),   -- sha256 hex of the link token
  status         text not null default 'pending' check (status in ('pending','submitted','applied','revoked')),
  expires_at     timestamptz not null,
  answers        jsonb,                                   -- validated submission; holds owner contact details (PII)
  consent_text   text,
  ip_hash        text,                                    -- sha256(ip + salt), never the raw IP
  submitted_at   timestamptz,
  applied_at     timestamptz,
  created_at     timestamptz not null default now(),
  check (status <> 'submitted' or (answers is not null and consent_text is not null and submitted_at is not null))
);
create index if not exists client_intakes_slug_idx on public.client_intakes (client_slug, created_at desc);

alter table public.client_intakes enable row level security;
alter table public.client_intakes force row level security;
revoke all on public.client_intakes from anon, authenticated;

-- ------------------------------------------------------------------ minute tracking
-- Billable minutes = total call seconds in the billing month rounded UP to a whole minute (not per call).
create or replace function public.lp_billable_minutes(total_sec bigint) returns integer
language sql immutable set search_path = '' as $$
  select ceil(coalesce(total_sec, 0) / 60.0)::integer
$$;

-- One row per client per billing month. The month is the calendar month in the client's timezone
-- (recurring billing runs on the 1st). Included minutes live in config/offerings.yaml; scripts/usage_report.py compares.
create or replace view public.client_usage_monthly with (security_invoker = true) as
select c.client_slug,
       date_trunc('month', c.created_at at time zone cl.timezone)::date as billing_month,
       count(*)::integer                                                as calls,
       coalesce(sum(c.duration_sec), 0)::bigint                         as total_sec,
       public.lp_billable_minutes(coalesce(sum(c.duration_sec), 0))     as minutes,
       cl.tier
from public.calls c
join public.clients cl on cl.slug = c.client_slug
group by c.client_slug, billing_month, cl.tier;

revoke all on public.client_usage_monthly from anon, authenticated;
revoke all on function public.lp_billable_minutes(bigint) from public, anon, authenticated;
