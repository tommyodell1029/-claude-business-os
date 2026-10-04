-- Outreach engine (T7): a `paused` event belongs to the whole outreach run, not to one prospect.
-- Additive only: relaxes NOT NULL on outreach_events.prospect_id for event_type = 'paused'; every other event
-- type still requires a prospect (enforced by the check constraint). No data changes.
alter table public.outreach_events alter column prospect_id drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'outreach_events_prospect_required') then
    alter table public.outreach_events
      add constraint outreach_events_prospect_required check (prospect_id is not null or event_type = 'paused');
  end if;
end $$;
