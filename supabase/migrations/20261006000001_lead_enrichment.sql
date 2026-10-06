-- Lead enrichment: decision-maker, verified professional email, opportunity scoring, tiers, pipeline trail.
-- Additive only: new nullable/defaulted columns on public.prospects. No drops, no data rewrites.
-- prospects.score stays the opportunity score (0-100); prospects.signals stays the evidence store.

alter table public.prospects add column if not exists domain                    text;          -- registrable host of website, lowercase, no www
alter table public.prospects add column if not exists decision_maker_name       text;
alter table public.prospects add column if not exists decision_maker_title      text;
alter table public.prospects add column if not exists decision_maker_profile    text;          -- public profile/page URL that names the person
alter table public.prospects add column if not exists decision_maker_source     text;          -- company_site | hunter | apollo | manual
alter table public.prospects add column if not exists decision_maker_confidence numeric(3,2) check (decision_maker_confidence between 0 and 1);
alter table public.prospects add column if not exists email_source              text;          -- company_site | hunter_domain_search | hunter_finder | apollo | manual
alter table public.prospects add column if not exists email_verification_status text check (email_verification_status in
                                                        ('verified','likely','unknown','invalid','generic','personal'));
alter table public.prospects add column if not exists email_confidence          numeric(3,2) check (email_confidence between 0 and 1);
alter table public.prospects add column if not exists pain_points               jsonb not null default '[]'::jsonb;
alter table public.prospects add column if not exists lead_tier                 text check (lead_tier in ('HOT','GOOD','RESEARCH','REJECTED'));
alter table public.prospects add column if not exists recommended_offer         text;
alter table public.prospects add column if not exists personalized_angle        text;
alter table public.prospects add column if not exists discovery_sources         jsonb not null default '[]'::jsonb;
alter table public.prospects add column if not exists research_timestamp        timestamptz;
alter table public.prospects add column if not exists last_enriched_at          timestamptz;
alter table public.prospects add column if not exists enrichment_status         text check (enrichment_status in
                                                        ('pending','not_qualified','needs_contact_enrichment','ready_for_approval','rejected'));
alter table public.prospects add column if not exists pipeline_log              jsonb not null default '[]'::jsonb;  -- [{at, step, detail}]

create index if not exists prospects_domain_idx on public.prospects (domain) where domain is not null;
create index if not exists prospects_tier_idx   on public.prospects (lead_tier, score desc);
create index if not exists prospects_enrich_idx on public.prospects (enrichment_status);

-- Backfill domain for existing rows from website (no other data touched).
update public.prospects
   set domain = lower(regexp_replace(regexp_replace(website, '^https?://(www\.)?', ''), '[/:?#].*$', ''))
 where domain is null and website is not null;
