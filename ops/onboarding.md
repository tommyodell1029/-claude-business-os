# Take a paid client live in under 1 hour

Prerequisites: client has paid setup (Stripe Checkout from `scripts/new_checkout.py`), you have their intake answers, and these are available: Twilio console, Pipecat Cloud access (`pipecat` CLI or dashboard), Supabase service key in env, Python via `uv`.
Rule: nothing the caller hears is invented. Hours, services, FAQs and prices come from the owner. The agent never quotes a price unless it is in the client config.

## 1. Intake file (5 min)
1. `cp ops/intake_template.yaml data/intake/<slug>.yaml` (`data/` is gitignored; it holds the owner's phone and email).
2. Fill it in from the client's answers. Leave `twilio_number` for step 2 if you have not bought it yet.

## 2. Buy the number (5 min)
Twilio Console > Phone Numbers > Buy a number: a local 904 number with Voice. Put it in the intake file as `twilio_number`.
Do not set its voice URL yet (step 5).

## 3. Generate and validate the client (5 min)
```
uv run python scripts/new_client.py data/intake/<slug>.yaml --dry-run   # check the YAML
uv run python scripts/new_client.py data/intake/<slug>.yaml             # write clients/<slug>.yaml + upsert clients row
```
The script validates with `agents.client_config`, writes owner phone/email/handoff as `${<SLUG>_OWNER_PHONE}` placeholders (no PII in git), and upserts the Supabase `clients` row with the real values. It prints the secret names to add next. The row starts as `onboarding`.

## 4. Pipecat secrets and redeploy (10 min)
1. In the Pipecat dashboard, open secret set `lp-receptionist-secrets` and add the names the script printed (`<SLUG>_OWNER_PHONE`, `<SLUG>_OWNER_EMAIL`, `<SLUG>_HANDOFF_NUMBER`) with the values from the intake file.
2. Confirm these shared names exist once: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL` (call alert emails are skipped without it).
3. `git add clients/<slug>.yaml && git commit && git push`, then redeploy: `pipecat cloud deploy` (the client YAML is baked into the image, so a new client always needs a redeploy).

## 5. Route the number (5 min)
Twilio Console > TwiML Bins: copy the bin from `ops/twilio/demo-inbound.twiml.xml` (keep the `us-east` stream host and `lp-receptionist.<org>` service host). Set the new number's "A call comes in" to that bin. The bot picks the client from the dialed number (`to_number`).

## 6. Test call (10 min)
Call the new number from your own phone and check each of these:
- The first words are the disclosure ("...I'm their AI assistant. This call may be recorded.").
- It answers hours and service area correctly, and leaves a message.
- Say "burst pipe" to test the emergency path and the transfer to the handoff number.
- After hanging up: a row appears in Supabase `calls` for the client slug (`disclosure_spoken = true`), and the owner email arrives.
Fix the YAML and redeploy if anything is off. Do not go live with a failed check.

## 7. Billing date (5 min)
```
uv run python -c "import sys; sys.path.insert(0,'lib'); from datetime import date; from lp.billing import first_recurring_charge as f; print(f(date.today(), founding=True))"
```
Founding: the month after setup is free and the first monthly charge is the 1st of the second month after setup. Standard: one month after setup (`founding=False`). The Checkout link already carries this date; confirm it matches. Update `founding_clients_signed` in `config/offerings.yaml` for founding clients.

## 8. Go live (2 min)
Set the client row live (Supabase table editor, or `uv run python scripts/new_client.py data/intake/<slug>.yaml --force --status live`). Tell the client the number, what alerts they will receive (email now, SMS only after A2P 10DLC approval), and how to reach you.

## Alerts reference
- Every call is saved to `calls`; if Supabase is down the record is kept on the container disk and logged.
- Email to the client's `owner_email` via Resend (transactional only). SMS is off until `NOTIFY_SMS_ENABLED=1` (needs A2P 10DLC).
- `calls.email_status` / `sms_status` show `sent`, `failed` or `skipped` per call.
