-- Jarvis (owner-only assistant, docs/JARVIS_SPEC.md): action log + owner memory. Additive only.
-- Same access model as the init migration: RLS forced, no policies, anon/authenticated revoked, service role only.

-- ------------------------------------------------------------------ jarvis_actions
-- Every write Jarvis proposes, and what happened to it. Reads are not logged here.
create table if not exists public.jarvis_actions (
  id            uuid primary key default gen_random_uuid(),
  tool          text not null check (tool in ('outreach_review','memory_add')),
  status        text not null default 'proposed'
                  check (status in ('proposed','confirmed','rejected','expired','executed','failed')),
  actor_email   text not null,                      -- the signed-in owner who was asked
  summary       text not null check (char_length(summary) <= 500),  -- what the owner was asked to confirm
  payload       jsonb not null default '{}'::jsonb, -- validated tool input only (ids, decisions, note text); never secrets
  proposed_at   timestamptz not null default now(),
  expires_at    timestamptz not null,
  decided_at    timestamptz,
  decided_via   text check (decided_via in ('voice','tap')),
  executed_at   timestamptz,
  result        text check (char_length(result) <= 500),
  error         text check (char_length(error) <= 500)
);
create index if not exists jarvis_actions_proposed_idx on public.jarvis_actions (proposed_at desc);

-- ------------------------------------------------------------------ jarvis_memory
create table if not exists public.jarvis_memory (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'note' check (kind in ('note','preference')),
  note        text not null check (char_length(note) between 1 and 1000),
  created_by  text not null,
  action_id   uuid references public.jarvis_actions(id),
  created_at  timestamptz not null default now()
);
create index if not exists jarvis_memory_created_idx on public.jarvis_memory (created_at desc);

-- ------------------------------------------------------------------ lock down
do $$
declare t text;
begin
  foreach t in array array['jarvis_actions','jarvis_memory']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
