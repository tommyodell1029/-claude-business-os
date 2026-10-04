# Take a paid client live in under 1 hour

One ordered checklist. Time budget in brackets. Rule: nothing the caller hears is invented. Hours, services, FAQs and prices come from the owner; the agent never quotes a price that is not in the client config.

Have ready: Stripe live key (`STRIPE_LIVE_SECRET_KEY`), Supabase service key (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), Twilio (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`), Pipecat dashboard or CLI, Python via `uv`. `<slug>` is a short lowercase name like `acme-plumbing`.

## 1. Payment link [5 min]
```
uv run python scripts/new_checkout.py <slug> <launch|growth|scale> --founding --email client@example.com --live --dry-run   # check first
uv run python scripts/new_checkout.py <slug> <launch|growth|scale> --founding --email client@example.com --live
```
Use `--standard` after the first 5 founding clients (see `pricing_phase` in `config/offerings.yaml`). Add `--addons bilingual_es extra_number:1` if they bought add-ons. Send the printed URL. Wait until the payment shows in Supabase `payments` (type `setup`, status `paid`) or in the Stripe dashboard; do not continue before they have paid.

## 2. Intake link [2 min]
```
uv run python scripts/new_intake_link.py <slug> <tier> --business-name "Acme Plumbing"      # add --spanish if they bought the Spanish add-on (Scale includes it)
```
Prints a one-time link (valid 14 days, one submit; only its hash is stored, so it is shown once). Send it to the client. A new link revokes any older pending one. They answer in plain English; you get an email when they submit. Nothing sensitive is in that email, the answers stay in Supabase `client_intakes`.

## 3. Preview what the intake produces [3 min]
```
uv run python scripts/onboard_client.py <slug>                    # dry run: YAML preview + checklist, writes nothing
```
Read it. Fix problems with the client, not in the YAML: the client can't resubmit, so change the Supabase row or generate a new intake link. Check the "never say" note (the voice agent does not enforce `never_say` yet: turn each item into an approved FAQ answer or hold go-live) and, for Spanish, the Spanish emergency phrases.

## 4. Number and client files [5 min]
```
uv run python scripts/onboard_client.py <slug> --buy-number       # dry run: finds a local number in their area code, shows the monthly price, buys nothing
uv run python scripts/onboard_client.py <slug> --apply --buy-number
```
`--apply` writes `clients/<slug>.yaml` (owner phone, email and handoff are `${<SLUG>_OWNER_*}` placeholders, never real values in git), upserts the `clients` row (real values, with `tier`), and marks the intake applied. With `--buy-number` it asks `[y/N]` showing the number and monthly price, and buys only on `y`; it then sets the number's voice webhook to the demo's inbound TwiML Bin (`LP_INBOUND_TWIML_URL`, else the voice URL of `DEMO_TWILIO_NUMBER`). If no inbound route resolves, it still buys (after your `y`) but leaves the webhook unset and prints the manual step. Already own a number? Skip `--buy-number` and put it in the YAML as `twilio_number`.

## 5. Pipecat secrets [5 min]
The script printed three names. In the Pipecat dashboard, open secret set `lp-receptionist-secrets` and add `<SLUG>_OWNER_PHONE`, `<SLUG>_OWNER_EMAIL`, `<SLUG>_HANDOFF_NUMBER`. The values are in Supabase `client_intakes.answers` (service role only; do not paste them anywhere else). Confirm the shared names exist once: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`.

## 6. Deploy [5 min]
`git add clients/<slug>.yaml && git commit && git pull --rebase && git push`, then `pipecat cloud deploy` (the client YAML is baked into the image, so every new client needs a redeploy).

## 7. Route the number [2 min]
Skip if step 4 set the webhook. Otherwise: Twilio Console > Phone Numbers > the number > "A call comes in" = TwiML Bin copied from `ops/twilio/demo-inbound.twiml.xml` (keep the `us-east` stream host and the `lp-receptionist.<org>` service host). The bot picks the client from the dialed number.

## 8. Test call [10 min]
Call the new number from your own phone:
- First words are the disclosure ("...I'm their AI assistant. This call may be recorded.").
- It answers hours and service area correctly and leaves a message.
- Say "burst pipe" (or one of their emergency phrases): emergency path and transfer to the handoff number.
- After hanging up: a row appears in Supabase `calls` for the slug (`disclosure_spoken = true`) and the owner email arrives.
Fix the intake data / YAML and redeploy if anything is off. Do not go live with a failed check.

Deliverability: call reports come from `calls@notify.launchpadlocal.org`. During the test call ask the client to find the first report, mark it **Not spam**, and add the sender to their contacts.

## 9. Go live and book-keeping [5 min]
```
uv run python scripts/onboard_client.py <slug> --go-live
uv run python -c "import sys; sys.path.insert(0,'lib'); from datetime import date; from lp.billing import first_recurring_charge as f; print(f(date.today(), founding=True))"
```
- Confirm the date matches the Checkout link (founding: 1st of the second month after setup; standard: one month after).
- **Founding clients: add 1 to `pricing_phase.founding_clients_signed` in `config/offerings.yaml` and commit.** After the 5th, the site and new checkouts switch to standard pricing.
- Tell the client the number, the alerts they get (email now; SMS only after A2P 10DLC approval) and how to reach you.

## Monthly: minutes and overage
```
uv run python scripts/usage_report.py                     # current month, all clients
uv run python scripts/usage_report.py --month 2026-10 --client <slug>
```
Read-only report (Supabase view `client_usage_monthly`): billable minutes = the month's total call seconds rounded up to a whole minute, vs the tier's `included_minutes`, overage at the tier's `overage_per_min`. Nothing is billed automatically. To invoice overage later: on the 1st, run the report for the previous month, then create a one-time Stripe invoice item for each client with overage (`overage_minutes` x rate) on their customer, or add it to their next invoice. A client with no `tier` shows DATA UNAVAILABLE; fix it with `update clients set tier = ...`.

## Alerts reference
- Every call is saved to `calls`; if Supabase is down the record is kept on the container disk and logged.
- Email to the client's `owner_email` via Resend (transactional only). SMS is off until `NOTIFY_SMS_ENABLED=1` (needs A2P 10DLC).
- `calls.email_status` / `sms_status` show `sent`, `failed` or `skipped` per call.
