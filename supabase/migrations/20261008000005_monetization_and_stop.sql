-- Money OS slice 7 (revised master prompt, 2026-10-08). Additive only.
-- 1. Monetization analysis per opportunity: which revenue models fit (model-proposed, code-validated against a fixed
--    list, stored only when the same research run produced grounded evidence) and the cheapest validation experiment.
alter table public.opportunities add column if not exists monetization_models jsonb not null default '[]'::jsonb;
alter table public.opportunities add column if not exists cheapest_validation jsonb;
-- 2. Emergency stop: os_settings key ai_paused (1 = every model call refused). Widens the allowed keys only.
alter table public.os_settings drop constraint if exists os_settings_key_check;
alter table public.os_settings add constraint os_settings_key_check
  check (key in ('per_day_usd','per_turn_usd','per_research_run_usd','ai_paused'));
-- ai_paused is stored as 1/0, so values may be 0 (budget values are still checked against their minimums in code).
alter table public.os_settings drop constraint if exists os_settings_value_check;
alter table public.os_settings add constraint os_settings_value_check check (value >= 0 and value <= 100);
