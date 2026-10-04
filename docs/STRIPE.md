# Stripe billing

How LaunchPad Local charges receptionist clients. Prices come only from `config/offerings.yaml`; nothing in Stripe is
set by hand. There is deliberately no refund code anywhere: all sales are final (`terms.refunds`).

## Pieces

| Piece | What it does |
|---|---|
| `lib/lp/stripe_billing.py` | Catalog plan, checkout parameters, a small Stripe HTTPS client (no SDK). Refuses live keys unless `--live` is passed. |
| `scripts/stripe_catalog.py` | Creates or updates Products and Prices from the config. Idempotent. |
| `scripts/new_checkout.py` | Makes a Checkout link for one client. |
| `site/app/api/stripe/webhook/route.ts` + `site/lib/stripe.ts` | Verifies the Stripe signature and records payments in Supabase. |
| `supabase/migrations/20261001000001_stripe_billing.sql` | `payments` and `stripe_events` tables (RLS forced, no policies, service role only). |

## Catalog (lookup keys)

Products use fixed ids (`lp_tier_launch`, `lp_addon_gbp_setup`, ...). Prices are found by lookup key:

| Lookup key | Amount |
|---|---|
| `lp_launch_setup` / `lp_growth_setup` / `lp_scale_setup` | tier setup fee, one-time (founding and standard setup are the same today; if they ever differ the keys become `lp_<tier>_<founding|standard>_setup`) |
| `lp_<tier>_founding_monthly`, `lp_<tier>_standard_monthly` | monthly fee |
| `lp_addon_gbp_setup_one_time` | Google Business Profile setup, one-time |
| `lp_addon_extra_number_monthly`, `lp_addon_bilingual_es_monthly` | monthly add-ons |

Only add-ons with `available: true` get prices. If an add-on is switched to `available: false`, the next catalog run
archives its price. If an amount changes in the config, the next run creates a new price, moves the lookup key to it,
and archives the old one (Stripe prices cannot be edited). Existing subscriptions keep the price they were sold at.

```
uv run python scripts/stripe_catalog.py --plan-only   # what the config says, no Stripe calls
uv run python scripts/stripe_catalog.py --dry-run     # diff against Stripe, change nothing
uv run python scripts/stripe_catalog.py               # apply (sandbox key)
```

## Adding a client checkout

```
uv run python scripts/new_checkout.py <client_slug> <launch|growth|scale> [--founding|--standard] \
    [--addons extra_number:2 gbp_setup bilingual_es] [--email owner@business.com]
```

- Without `--founding`/`--standard`, pricing follows `pricing_phase` in the config: founding while
  `founding_clients_signed < founding_client_limit`. Update `founding_clients_signed` after each founding client pays.
- The client pays the setup fee (and any one-time add-ons) at checkout. The monthly price starts on
  `lp.billing.first_recurring_charge()`:
  - founding: the 1st of the second month after setup (setup Oct 1 to Oct 31 means first monthly charge Dec 1);
  - standard: one month after setup, same day of month.
- Mechanism: `subscription_data.trial_end` set to noon Eastern on that date. `billing_cycle_anchor` was ruled out
  because Stripe only allows an anchor within the first billing period, and the founding date is up to two months
  away. Stripe Checkout labels the free stretch as a trial on its page; the terms text under the Pay button states the
  real terms.
- `custom_text` under the Pay button shows: first charge date, month-to-month, all sales final, cancel anytime by
  emailing the cancellation address, billing stops after the paid period.
- Session and subscription metadata: `client_slug`, `tier`, `pricing`, `first_recurring_charge`, `addons`.
- Add-ons that are not sellable, or already included in the tier (Spanish in Scale), are refused.
- `--dry-run` prints the session body without calling Stripe. The script prints the Checkout URL to send the client.

## Webhook

Endpoint: `https://<site>/api/stripe/webhook`. Events: `checkout.session.completed`, `invoice.paid`,
`invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`.

- Bad or missing signature: HTTP 400. Missing env: HTTP 500. Processing error: HTTP 500 so Stripe retries.
- Idempotent on `event.id` (`stripe_events`). `payments` holds one row per invoice per type (`setup`, `monthly`,
  `addon`), upserted, so a failed invoice that is later paid flips from `failed` to `paid`. $0 trial lines are skipped.
- `stripe_events.summary` stores a small summary only (no names, emails, or card data).
- Vercel env (sensitive): `STRIPE_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

Create the sandbox endpoint (dashboard, about 2 minutes): Stripe Dashboard (Sandbox) > Developers > Webhooks >
Add destination > select the five events above > Webhook endpoint > URL
`https://launchpad-site-ten.vercel.app/api/stripe/webhook` > Create. Open it, reveal the Signing secret (`whsec_...`)
and add it to the Vercel project `launchpad-site` as `STRIPE_WEBHOOK_SECRET` (Sensitive), then redeploy.

Check it: `curl -s -o /dev/null -w '%{http_code}' -X POST https://launchpad-site-ten.vercel.app/api/stripe/webhook`
must print `400`.

## Restricted key permissions

The restricted key (`rk_test_...`, later `rk_live_...`) needs Write on Products, Prices, Checkout Sessions and Read on
Customers, Subscriptions, Invoices. Webhook Endpoints Write is only needed if a script creates the endpoint; the
dashboard steps above do not need it. No refund permission.

## Go-live steps (owner)

1. Finish the sandbox end-to-end test below.
2. In Stripe live mode, create a restricted key with the same permissions as the sandbox key (`rk_live_...`).
   Store it as `STRIPE_LIVE_SECRET_KEY` in the session environment. Scripts use it only when `--live` is passed;
   without `--live` they keep using the sandbox `STRIPE_SECRET_KEY`.
3. `uv run python scripts/stripe_catalog.py --live --dry-run`, review, then `uv run python scripts/stripe_catalog.py --live`.
4. In live mode, add the webhook endpoint (same URL and events). Put its new `whsec_...` into Vercel
   `STRIPE_WEBHOOK_SECRET` (Production, Sensitive) and redeploy.
5. Make each real checkout with `scripts/new_checkout.py ... --live`.

## Sandbox end-to-end test

1. `scripts/stripe_catalog.py`, then run it again: the second run must print "nothing to do".
2. `scripts/new_checkout.py test-co launch --founding`, open the URL, pay with card 4242 4242 4242 4242, any future
   expiry, any CVC.
3. Check in Stripe: one paid invoice with the setup fee; subscription status `trialing` with trial end on the
   expected date (founding: the 1st of the second month after today).
4. Check Supabase: a `payments` row (`setup`, `paid`) for `test-co`, and `stripe_events` rows for each event.
5. Optional: use a Stripe test clock to advance past the trial and confirm the first monthly invoice is paid and
   recorded as `monthly`.
