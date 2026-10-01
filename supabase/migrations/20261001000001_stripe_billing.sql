-- Stripe billing (sandbox first). Additive only; written by site/app/api/stripe/webhook (service role).
-- client_slug is plain text (no FK): a client can pay before its public.clients row exists.

-- ------------------------------------------------------------------ stripe_events (idempotency on event.id)
create table if not exists public.stripe_events (
  id                text primary key,                      -- Stripe event id (evt_...)
  type              text not null,
  livemode          boolean not null default false,
  client_slug       text,
  stripe_object_id  text,                                  -- cs_ / in_ / sub_ id the event is about
  summary           jsonb not null default '{}'::jsonb,    -- small non-PII summary, never the raw payload
  received_at       timestamptz not null default now()
);
create index if not exists stripe_events_slug_idx on public.stripe_events (client_slug, received_at desc);

-- ------------------------------------------------------------------ payments (one row per invoice per type)
create table if not exists public.payments (
  id                      uuid primary key default gen_random_uuid(),
  stripe_invoice_id       text not null,
  stripe_customer_id      text,
  stripe_subscription_id  text,
  client_slug             text,
  type                    text not null check (type in ('setup','monthly','addon')),
  amount                  numeric(10,2) not null check (amount >= 0),   -- major units (USD dollars)
  currency                text not null default 'usd',
  status                  text not null check (status in ('paid','failed')),
  stripe_event_id         text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (stripe_invoice_id, type)                       -- webhook upserts on this; failed -> paid on retry
);
create index if not exists payments_slug_created_idx on public.payments (client_slug, created_at desc);

drop trigger if exists payments_updated_at on public.payments;
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------ lock down (RLS forced, no policies)
do $$
declare t text;
begin
  foreach t in array array['stripe_events','payments']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
