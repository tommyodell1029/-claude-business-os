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
| 5 Database / auth / config | T2 | ⏳ Schema written and tested locally, **not applied** (Supabase upgrade expected ~Fri 2026-10-02). Additions below. |
| — Voice demo agent | T3, T4 | ⬜ Next. The revenue proof asset. |
| 9 CRM / leads / research / scoring | T7a, T7b | ⬜ |
| 10 Outreach / replies | T7c, T7d | ⬜ Gmail-connector sending (owner override); needs full mailing address |
| 8 Command Center (lite, mobile) | T6 + `/admin` | ⬜ |
| 11 Sales / proposals / appointments | sales skills (done) + appointments config | 🟡 Skills exist, no scheduling yet |
| 12 Stripe / payments / onboarding | new + T5 | ⬜ Payment Link first, webhooks after |
| **→ FIRST_DOLLAR_MODE: pursue the first customer** | | |
| 6 Agent registry, 7 Jobs/workflows | — | Deferred. Minimal versions only (agent config in YAML, GitHub Actions cron). |
| 13–24 | T5–T9 + new | After first revenue |

## Phase 5 additions (to the unapplied migration, before it is applied)
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
1. Full CAN-SPAM mailing address (street, city, state, ZIP) or a PO box / virtual mailbox, stored only in the `MAILING_ADDRESS` secret.
2. Twilio account, local number, start A2P 10DLC registration.
3. Stripe account.
4. Package prices and the mailing address for cold email.
5. Keys as environment secrets: `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`; later `GOOGLE_PLACES_API_KEY`, Twilio, Instantly or Smartlead, Resend, Stripe.
6. Supabase paid upgrade (~Fri 2026-10-02).

## Docs from §116 not yet written
Written only when the thing they describe exists, so no empty stubs: ARCHITECTURE, AGENTS, AGENT_EVALUATION, AI_MODEL_ROUTING, AI_SECURITY, OBSERVABILITY, INTEGRATIONS, DATABASE (currently `agents/notify/README.md` and `leadgen/README.md`), SECURITY, DEPLOYMENT, OPERATIONS, OFFER_CATALOG (currently `config/offerings.yaml`), COMPLIANCE, TESTING, DISASTER_RECOVERY, BUSINESS_CONTINUITY, OWNER_GUIDE, REVENUE_ENGINE, INCIDENT_RESPONSE, DATA_RETENTION, DEPENDENCY_MANAGEMENT, LOCAL_NODE.
