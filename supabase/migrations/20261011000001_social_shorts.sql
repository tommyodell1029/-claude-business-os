-- Social Radar Shorts mode: a sweep can search YouTube Shorts only (videoDuration=short, then <= 3 minutes checked
-- against the API's own duration). Each mode keeps its own 24-hour cache; quota is still counted across both.
-- Additive only: existing rows become mode 'all'.
alter table public.social_sweeps add column if not exists mode text not null default 'all' check (mode in ('all','shorts'));
create index if not exists social_sweeps_mode_idx on public.social_sweeps (source, mode, created_at desc);
