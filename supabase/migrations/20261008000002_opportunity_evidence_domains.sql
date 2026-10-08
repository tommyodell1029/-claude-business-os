-- Money OS slice 2: distinct evidence source domains per opportunity, kept by code on every rescore so ranking and
-- the STRONG EVIDENCE label don't need to read all evidence rows. Additive only.
alter table public.opportunities add column if not exists evidence_domains integer not null default 0;
