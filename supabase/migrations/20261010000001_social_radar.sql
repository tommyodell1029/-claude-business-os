-- Money OS Phase 2 slice 1: Social Radar (YouTube Data API). One row per sweep; the videos it saw (with the API's
-- own view/like/comment counts) are stored in `signals` so every number shown can be traced to a sweep.
-- Additive only. RLS on, no policies: service role only, like every Money OS table.
create table if not exists public.social_sweeps (
  id            uuid primary key default gen_random_uuid(),
  source        text not null check (source in ('youtube')),
  status        text not null default 'ok' check (status in ('ok','failed','refused')),
  queries       text[] not null default '{}',
  quota_units   integer not null default 0 check (quota_units >= 0),
  video_count   integer not null default 0 check (video_count >= 0),
  signals       jsonb not null default '[]'::jsonb,
  result        jsonb not null default '{}'::jsonb,
  error         text check (error is null or char_length(error) <= 500),
  created_at    timestamptz not null default now()
);
create index if not exists social_sweeps_created_idx on public.social_sweeps (source, created_at desc);

alter table public.social_sweeps enable row level security;
alter table public.social_sweeps force row level security;
revoke all on public.social_sweeps from anon, authenticated;

-- ULTRON may propose a Social Radar sweep (confirm-gated). Keep in sync with the write tools in
-- site/lib/jarvis/tools.ts (enforced by site/lib/os/tools.test.ts).
alter table public.jarvis_actions drop constraint if exists jarvis_actions_tool_check;
alter table public.jarvis_actions add constraint jarvis_actions_tool_check check (tool in (
  'outreach_review', 'memory_add',
  'radar_sweep', 'research_opportunity', 'create_experiment', 'set_experiment_status', 'kill_opportunity', 'record_revenue',
  'social_radar'
));
