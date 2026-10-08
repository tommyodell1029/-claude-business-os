-- Money OS slice 5: ULTRON's new confirm-gated tools must be storable as pending actions.
-- Widens the allowed tool list only (no rows changed). Keep in sync with the write tools in site/lib/jarvis/tools.ts
-- (enforced by site/lib/os/tools.test.ts).
alter table public.jarvis_actions drop constraint if exists jarvis_actions_tool_check;
alter table public.jarvis_actions add constraint jarvis_actions_tool_check check (tool in (
  'outreach_review', 'memory_add',
  'radar_sweep', 'research_opportunity', 'create_experiment', 'set_experiment_status', 'kill_opportunity', 'record_revenue'
));
