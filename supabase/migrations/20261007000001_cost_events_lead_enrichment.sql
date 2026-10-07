-- Allow Hunter/Apollo enrichment lookups in the cost log (leadgen/pipeline.py logs category 'lead_enrichment').
-- Widens the existing check only; no rows change.
alter table public.cost_events drop constraint cost_events_category_check;
alter table public.cost_events add constraint cost_events_category_check
  check (category = any (array['call','places','email_platform','llm','sms','email_alert','audit','lead_enrichment']));
