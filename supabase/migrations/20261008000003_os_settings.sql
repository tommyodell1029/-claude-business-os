-- Money OS slice 5: owner-editable budget overrides (config/money_os.yaml `editable_budgets`). Additive only.
-- Code validates each value against the yaml limits on write and again on read; a missing row = the yaml default.
create table if not exists public.os_settings (
  key         text primary key check (key in ('per_day_usd','per_turn_usd','per_research_run_usd')),
  value       numeric(10,2) not null check (value > 0 and value <= 100),
  updated_at  timestamptz not null default now(),
  updated_by  text check (char_length(updated_by) <= 254)
);
alter table public.os_settings enable row level security;
alter table public.os_settings force row level security;
revoke all on public.os_settings from anon, authenticated;
