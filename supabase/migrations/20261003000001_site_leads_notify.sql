-- Lead alerts: record when the owner was emailed about a website lead. Additive only.
-- The site route sets these right after sending; agents/notify/leads.py sweeps any lead still null.
alter table public.site_leads add column if not exists notified_at timestamptz;
alter table public.site_leads add column if not exists email_status text;
create index if not exists site_leads_unnotified_idx on public.site_leads (created_at) where notified_at is null;
