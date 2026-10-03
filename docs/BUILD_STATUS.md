# Build Status

**As of:** 2026-09-27. "Done" means verified, per §127. Anything unverified is marked as such.

## Specs in force
1. **Takeover spec** (2026-09-26): phases T0–T9, Pipecat voice, no n8n, lead gen, weekly audit, site.
2. **Master Build Specification** (2026-09-27): the revenue-first autonomous agency OS. **It extends spec 1.** Where the two disagree, the owner decides; each open conflict is listed below with a recommendation.

## Phase map (the two specs merged, in revenue-first order)

| Master phase | Maps to | State |
|---|---|---|
| 0 Revenue strategy | — | ✅ `FIRST_DOLLAR_PLAN.md` |
| 1 Existing system audit | T0 | ✅ `CURRENT_SYSTEM_AUDIT.md` |
| 2 Jarvis audit | — | ✅ `JARVIS_AUDIT.md` (NO-GO, 3 patterns borrowed) |
| 3 External platform audit | — | ✅ `REPOSITORY_INTEGRATION_MATRIX.md` (4 GO, 7 DEFER, 13 NO-GO) |
| 4 Architecture stabilization | T2 | ✅ Layout, shared library, models config, subagents |
| 5 Database / auth / config | T2 | ✅ Schema applied 2026-09-28 to new Supabase project `launchpad-local` (arekyykkzlqgphqdegsy). RLS forced, anon/authenticated denied (verified live). Auth for the Command Center comes in T6. |
| — Voice demo agent | T3, T4 | 🟡 T3 built + tested (88 tests incl. scripted calls). T4 deploy files ready (see T4 section); deploy, number change and 8 live calls wait on owner OK + keys. |
| 9 CRM / leads / research / scoring | T7a, T7b | ⬜ |
| 10 Outreach / replies | T7c, T7d | ⬜ Gmail-connector sending (owner override); needs full mailing address |
| 8 Command Center (lite, mobile) | T6 + `/admin` | ⬜ |
| 11 Sales / proposals / appointments | sales skills (done) + appointments config | 🟡 Skills exist, no scheduling yet |
| 12 Stripe / payments / onboarding | new + T5 | 🟡 2026-10-01 code built + unit-tested (catalog, checkout, webhook, migration). Sandbox run, Supabase apply, webhook endpoint + Vercel env pending. See `docs/STRIPE.md` + Stripe section below. |
| **→ FIRST_DOLLAR_MODE: pursue the first customer** | | |
| 6 Agent registry, 7 Jobs/workflows | — | Deferred. Minimal versions only (agent config in YAML, GitHub Actions cron). |
| 13–24 | T5–T9 + new | After first revenue |

## T4 (Twilio + Pipecat Cloud) — as of 2026-09-30
- Ready in repo: `Dockerfile` (pinned `dailyco/pipecat-base:0.2.0-py3.11`, uv.lock pins), `.dockerignore`, root `bot.py` shim, `pcc-deploy.toml` (agent `lp-receptionist`, us-east, max 2 agents, 15 min session cap), `ops/twilio/demo-inbound.twiml.xml` (TwiML Bin), `ops/twilio/T4_TEST_CALLS.md` (8-call script + results table).
- Verified against Pipecat Cloud docs: the CLI authenticates with `PIPECAT_TOKEN` + `PIPECAT_ORG` (the old `PIPECAT_CLOUD_API_KEY` name was wrong). Twilio streams go to `wss://api.pipecat.daily.co/ws/twilio` and are routed by the `_pipecatCloudServiceHost` stream parameter, so the transfer reconnect TwiML now sends it (`PIPECAT_SERVICE_HOST`). Caller/dialed numbers reach the bot only as `from_number` / `to_number` stream parameters, so the TwiML Bin sets them.
- **Gap confirmed:** Pipecat Cloud runs only `bot()`; custom routes exist only through the per-session Session API (auth required, gone when the session ends). Twilio's `<Dial action>` callback therefore cannot reach `make_transfer_router`. **Resolved 2026-09-30 (owner OK):** `site/app/api/twilio/transfer-status` (Next.js 16, Vercel). Verifies X-Twilio-Signature against `TRANSFER_ACTION_URL`, returns the same TwiML as `agents/transfer.py` (byte-for-byte, tested with Python-generated fixtures). Env on Vercel: `TWILIO_AUTH_TOKEN`, `TRANSFER_ACTION_URL`, `TRANSFER_STREAM_URL`, `PIPECAT_SERVICE_HOST`. Until T6 ships the real homepage, deploy `site/` to its own Vercel project and use the `*.vercel.app` URL so launchpadlocal.org is not replaced.
- Owner OK'd deploy + demo-number switch on 2026-09-30 ("lets do it"); blocked only on the Anthropic key being visible in a fresh session.
- **2026-09-30 progress:** Python 89/89, site 5/5 + build OK. Text sim (`demo`, hours question): disclosure line first, answer matches `demo.yaml`, LLM latency 1.9 s. Vercel project `launchpad-site` (team tommyodell1029) live at `https://launchpad-site-ten.vercel.app`, direct file upload (no git link), Vercel Auth on previews only so Twilio can reach production. Env set: `TRANSFER_ACTION_URL`, `TRANSFER_STREAM_URL`, `PIPECAT_SERVICE_HOST=lp-receptionist.launchpad-local`. Deployed without `package-lock.json` (direct deps pinned exactly; transitive deps float) — redeploy with the lockfile once deploys go through the Vercel CLI or git.
- Vercel ✅ 2026-09-30: `TWILIO_AUTH_TOKEN` added (sensitive), redeployed. Live check: unsigned POST → 403; correctly signed POST → reconnect TwiML with `_pipecatCloudServiceHost`. Env secret brackets fixed by owner.
- **Open (owner):** Pipecat Cloud: `PIPECAT_TOKEN` is an org private key (`sk_`), which only works for the public `/v1/agents` API; the CLI's org endpoints (secrets, builds, deploy) need a user login token, and `pipecat cloud auth login` redirects to `127.0.0.1:8400`, which a cloud session can't receive. Fix (works from iPad): create a Personal Access Token (`pcc_pat_…`) at pipecat.daily.co/account/tokens and store it as env secret `PIPECAT_PAT`; the session maps it to `PIPECAT_TOKEN` for the CLI. Keep the `sk_` private key for REST calls (`/start`) later. PAT set 2026-09-30 and valid, but its Pipecat user (GitHub login) belongs to no organization; `launchpad-local` sits under a different login. Needs a PAT from the account that owns the org (or an invite of the GitHub-login user to the org).
- **2026-10-01 recheck (fresh session): still blocked here.** All other env secrets present and clean; Anthropic key is present as `LP_ANTHROPIC_API_KEY` (code accepts it; it is uploaded to Pipecat as `ANTHROPIC_API_KEY`). Python 98/98. Live check: `TRANSFER_ACTION_URL` = `https://launchpad-site-ten.vercel.app/api/twilio/transfer-status` confirmed exact (correctly signed POST → 200 + reconnect TwiML routed to `lp-receptionist.launchpad-local`; unsigned → 403). But the `PIPECAT_PAT` in this environment is valid and its user still has **zero organizations** (`GET /v1/organizations` → `{"organizations":[]}`; every `/v1/organizations/launchpad-local/*` call → 401). So no secret set and no deploy yet. The earlier "PAT user is a member" note did not hold for the PAT in this environment. Twilio +19044568829 has no voice URL set yet (read back via API); it stays unpointed until the agent is deployed. Text sim (`demo`, hours → area → goodbye): disclosure first, hours and area match `demo.yaml`, LLM latency 1537 / 808 / 858 ms; it also produced one unprompted filler turn and a double goodbye (checkpoint audit item). Text runs of the 8-call script (tester, spot-checked): 1 disclosure OK; 2 hours/area OK; 3 no price given, but it didn't offer to take a message; 4 collects name, number (read back digit by digit), area, urgency, then refuses "tomorrow morning" as a callback time and asks for a specific time (audit item; that run ended when the script ran out of lines, so end=None there is expected); 5/6 emergency → transfer line, urgency=urgent; 8 spam → ended politely, end=spam; 7 silence, and the transfer answer/ring-out legs, need a real phone.
- **2026-10-02: agent deployed.** New `PIPECAT_PAT` sees org `launchpad-local`. Secret set `lp-receptionist-secrets` (us-east) created with DEEPGRAM_API_KEY, ELEVENLABS_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, DEMO_TWILIO_NUMBER, DEMO_HANDOFF_NUMBER, DEMO_OWNER_PHONE, DEMO_OWNER_EMAIL, TRANSFER_ACTION_URL (verified URL). First deploy crash-looped ("pipecatcloud cannot load its session types … No module named 'pipecatcloud'"); fixed by pinning `pipecatcloud==1.3.0` (owner OK). Redeploy: agent `lp-receptionist` Ready, phase Active, min 0 / max 2 agents. **Still missing: `ANTHROPIC_API_KEY` in the secret set.** Neither `LP_ANTHROPIC_API_KEY` nor `ANTHROPIC_API_KEY` is visible in the session, and the bot raises at call start without it. So +19044568829 is still NOT pointed at the agent. Next: add the key (owner adds it in the Pipecat dashboard, or puts `LP_ANTHROPIC_API_KEY` back in the env so a session can upload it), redeploy, then the TwiML Bin + number repoint, then the 8 test calls.
- **2026-10-02: live.** Owner added `ANTHROPIC_API_KEY` to `lp-receptionist-secrets` in the Pipecat dashboard and redeployed (deployment d0efe638; agent Ready, Active; 10 keys in the set). Owner created TwiML Bin `lp-demo-inbound` (same as `ops/twilio/demo-inbound.twiml.xml` with service host `lp-receptionist.launchpad-local`) and set it as +19044568829's "A call comes in" (backup set to the same bin). Read back via the Twilio API: `voice_url` = `https://handler.twilio.com/twiml/EHebf4150e5f6470cd812897da6050fb65`, POST, no app or trunk. A correctly signed POST to the bin returns 200 with the expected `<Connect><Stream>` TwiML, and `{{To}}`/`{{From}}` fill in correctly. No live call placed yet; the 8 calls in `ops/twilio/T4_TEST_CALLS.md` are next (owner places them, results recorded only as reported).
- **2026-10-03:** owner deferred the 8 test calls; build moves on to T5/T6/T7-lite. The calls and the T4 Opus audit must happen before the demo number goes into any outreach email or onto the site.
- Open risk: `websocket_auth = "none"` means anyone who learns the service host can start sessions (cost). Capped by `max_agents = 2` and the session cap. Fix later: the same Vercel webhook answers inbound calls, calls Pipecat `/start`, and returns a tokenized stream URL (`websocket_auth = "token"`).
- Call records are written to the container disk and are lost when the session ends until T5 wires `agents/notify` into `bot.py`.

## Stripe billing — as of 2026-10-01
- Built: `scripts/stripe_catalog.py` (idempotent, lookup keys `lp_*`), `scripts/new_checkout.py` (setup now, monthly from `lp.billing.first_recurring_charge` via `subscription_data.trial_end`), webhook `site/app/api/stripe/webhook` (signature check, idempotent on event id), migration `20261001000001_stripe_billing.sql` (tested on local Postgres 16). Details: `docs/STRIPE.md`.
- Not done yet: (a) catalog + checkout never run against the Stripe sandbox (this session's tool policy blocked API calls with the key); (b) ~~migration not applied~~ **applied 2026-10-02** to `launchpad-local` in smaller statements via the connector (the single-batch apply kept timing out); verified: `payments` + `stripe_events` exist, RLS forced, anon/authenticated denied, indexes + updated_at trigger present. Not recorded in Supabase's migration history table because it went through execute_sql; (c) no webhook endpoint or `STRIPE_WEBHOOK_SECRET` yet, Vercel env not set; (d) Checkout behavior (setup charged now, first monthly on the expected date) UNVERIFIED until the sandbox end-to-end test in `docs/STRIPE.md` passes.

## Phase 5 additions (now a NEW migration file; the first one is applied)
Pipeline stages (§50) on `prospects.status`; the expanded reply classes (§49); `payments`, `proposals` and `appointments` tables; SMS consent records (§48); `feature_flags` and `system_events`. The migration has not been applied anywhere, so editing it now is safe.

## Conflicts between spec 1 and spec 2 — RESOLVED 2026-09-27 (owner: "do the recommended path")

| # | Topic | Spec 1 | Spec 2 | Decision (= recommendation) |
|---|---|---|---|---|
| C1 | Outbound voice | Inbound only, no outbound calling | "Inbound, outbound … where legally appropriate" (§57) | **Keep inbound only.** Under the FCC's 2024 ruling, AI-generated voices count as "artificial voice" under the TCPA, so outbound calls need prior express written consent. High legal risk, not needed for the first dollar. |
| C2 | Missed-call text-back (§58) | Not in scope | Required | **Defer to after the first client.** It needs a consent basis per caller, A2P 10DLC approval, and a STOP flow. Offer it later as an add-on. |
| C3 | Cold-email cadence | Day 0, 3, 7, 14 | Day 0, 3, 10 (+7 after follow-up 1), 40 (+30 after follow-up 2) (§46) | **Adopt spec 2** as the newer instruction. It lives in `leadgen/config.yaml`. |
| C4 | Reply classes | 6 classes | 14 classes (§49) | **Adopt spec 2.** Unclear or high-risk replies escalate to the owner. |
| C5 | Admin access | Password-protected `/admin/review` | Mobile Command Center with RBAC (§9–10, §86) | **Supabase Auth (magic link) for the owner** instead of a shared password. Stronger, and just as easy on an iPhone. |
| C6 | Packages | `{{PRICING}}` | Launch, Growth and Scale mentioned (§102 example) | **Owner provides** prices and inclusions. Nothing will be invented. |
| C7 | n8n | Removed | "Preserve stable workflows temporarily" (§70) | No conflict in practice: no LaunchPad n8n workflows exist. |
| C8 | Appointment hours | — | Weekdays 5–6 PM, Saturday 10:30 AM–2:30 PM (§51) | Adopt as configurable defaults. Confirm the weekday window really is 1 hour. |

C6 still needs the owner's package prices. C8 weekday window kept at 5–6 PM as configurable default until the owner changes it.

**Owner override (2026-09-27):** no separate outreach domain. Cold email sends from the launchpadlocal.org Workspace inbox through the Gmail connector, under the caps in CLAUDE.md.

## Owner actions blocking revenue (the critical path)
1. ~~Full CAN-SPAM mailing address.~~ Received 2026-10-03. Not committed: owner adds it as the `MAILING_ADDRESS` environment secret (cloud env + Vercel). A PO box or virtual mailbox can replace it later if the owner prefers not to publish a street address.
2. Twilio account, local number, start A2P 10DLC registration.
3. ~~Stripe account.~~ Sandbox restricted key set. Remaining: see Stripe section below.
4. ~~Package prices and the mailing address for cold email.~~ Both done (prices 2026-10-01, address 2026-10-03).
5. Keys as environment secrets: `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`; later `GOOGLE_PLACES_API_KEY`, Twilio, Instantly or Smartlead, Resend, Stripe.
6. ~~Supabase paid upgrade~~ Not needed: `launchpad-local` created on the free tier after `archive-jarvis` was retired. Owner copies the project's secret (service role) key into `SUPABASE_SERVICE_ROLE_KEY` before T5.

## Docs from §116 not yet written
Written only when the thing they describe exists, so no empty stubs: ARCHITECTURE, AGENTS, AGENT_EVALUATION, AI_MODEL_ROUTING, AI_SECURITY, OBSERVABILITY, INTEGRATIONS, DATABASE (currently `agents/notify/README.md` and `leadgen/README.md`), SECURITY, DEPLOYMENT, OPERATIONS, OFFER_CATALOG (currently `config/offerings.yaml`), COMPLIANCE, TESTING, DISASTER_RECOVERY, BUSINESS_CONTINUITY, OWNER_GUIDE, REVENUE_ENGINE, INCIDENT_RESPONSE, DATA_RETENTION, DEPENDENCY_MANAGEMENT, LOCAL_NODE.
