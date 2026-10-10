-- Money OS: Gumroad sales sync + experiment decision helper.
-- Additive only. revenue_entries gets:
--   external_id: the marketplace's own sale id, so a sync can run many times without double-counting;
--   units: how many sales one entry stands for (a manual entry defaults to 1), used to compare against
--          experiment targets like "3 sales in 14 days".
alter table public.revenue_entries add column if not exists external_id text check (external_id is null or char_length(external_id) <= 120);
alter table public.revenue_entries add column if not exists units integer not null default 1 check (units >= 1 and units <= 1000);
create unique index if not exists revenue_entries_source_external_idx on public.revenue_entries (source, external_id) where external_id is not null;

-- ULTRON may propose a Gumroad sync (confirm-gated). Keep in sync with the write tools in site/lib/jarvis/tools.ts
-- (enforced by site/lib/os/tools.test.ts).
alter table public.jarvis_actions drop constraint if exists jarvis_actions_tool_check;
alter table public.jarvis_actions add constraint jarvis_actions_tool_check check (tool in (
  'outreach_review', 'memory_add',
  'radar_sweep', 'research_opportunity', 'create_experiment', 'set_experiment_status', 'kill_opportunity', 'record_revenue',
  'social_radar', 'sync_gumroad_sales'
));
