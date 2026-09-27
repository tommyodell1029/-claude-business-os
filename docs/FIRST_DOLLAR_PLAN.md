# First-Dollar Plan (Phase 0: Revenue Strategy)

**Goal:** get the first legitimate payment from a local business for an AI phone receptionist, then deliver it well enough to earn a second sale and, with the client's permission, a testimonial.

**Status:** FIRST DOLLAR NOT ACHIEVED · cash $0 · MRR $0 · pipeline DATA UNAVAILABLE.

## Offer for the first sale
- **Product:** AI Phone Receptionist, set up for the client (from `config/offerings.yaml`). Websites and add-ons come later. One offer closes faster.
- **Proof:** a live demo number the prospect calls themselves ({{DEMO_PHONE}}). We have no case studies and will not invent any.
- **Price:** {{PRICING}}, set by the owner. The spec mentions Launch, Growth and Scale packages; their prices and inclusions are still needed.
- **Payment:** a **Stripe Payment Link** the owner creates in the Stripe dashboard. That's zero code on day one. Webhooks and reconciliation (§52–53) follow once money actually moves.

## The critical path, in calendar order
The slowest items are **third-party approvals and the sending ramp**, not code. Start them first.

| # | Step | Who | Lead time | Blocks |
|---|---|---|---|---|
| 1 | Owner override: send from the launchpadlocal.org Workspace inbox via the Gmail connector (no separate domain). Confirm SPF/DKIM/DMARC already pass for Workspace; register the domain in Google Postmaster Tools to watch spam rate | Owner | 1 day | Outreach |
| 2 | Low-volume start: 5 emails/day, ramping to at most 20/day. Each batch is drafted by Claude and approved by the owner before sending | Owner + Claude | ramp over ~2 weeks | Outreach volume |
| 3 | Create a Twilio account, buy 1 local 904 number, and **start A2P 10DLC registration** | Owner | Days to weeks for approval | Owner SMS alerts only. Email alerts work without it. |
| 4 | Create a Stripe account and verify the business | Owner | 1–3 days | Payment |
| 5 | Set package prices and write the mailing address used in cold email | Owner | 1 hour | Proposals, outreach footer |
| 6 | **T3:** Pipecat demo agent (`clients/demo.yaml`) | Claude | this week | Demo number |
| 7 | **T4:** deploy to Pipecat Cloud and point the Twilio number at it, giving a live `{{DEMO_PHONE}}` | Claude + owner keys | after step 3 | Everything sales-facing |
| 8 | **T7b:** Places API sourcing and scoring for the first 50 Jacksonville prospects | Claude | ~2 days | Outreach list |
| 9 | **T7c/d:** personalized emails and the `/admin/review` page (review mode on) | Claude | ~3 days | First send |
| 10 | **T6-lite:** landing page (demo number, offer, contact form with consent, payment link) and the mobile Command Center lite | Claude | ~3 days | Credibility, inbound leads |
| 11 | Replies go to the owner, who sends a drafted answer; demo call using `/sales-prep`; proposal using `/sales-proposal`; payment link | Owner + skills | per lead | **First dollar** |
| 12 | **T5:** notify handler and onboarding script; the client goes live in under 1 hour (`/ops/onboarding.md`) | Claude | before the first close | Fulfillment |

**Estimated earliest first dollar:** about 2–4 weeks from the first batch of 5 emails. This is an estimate, not a promise; the sending ramp and Twilio approval set the floor.

## While the sending ramp runs (legal, manual, no automation)
- The owner shows the demo line to businesses they know and to local networking contacts (Chamber, BNI). These are one-to-one conversations, not bulk messages.
- Manual phone calls by the owner to **business landlines only**. Scrub against the Do Not Call registry. No autodialer, no AI voice, no texts without consent.
- Every contact gets logged as a prospect so the pipeline data is real.

## FIRST_DOLLAR_MODE (built in Phase 5, minimal)
- A flag in `config/launchpad.yaml`. While it is on, `launchpad status` and the Command Center lead with a **bottleneck** line and a **highest-value next action** line.
- Both are computed from real checks, in this order: missing keys or accounts, then demo number live, then prospects count, then sending-ramp status, then drafts pending review, then replies waiting, then proposals out, then payments.
- Missing data is shown as **DATA UNAVAILABLE**. Numbers are never invented.

## Deferred until after the first client
The agent registry and versioning (§13–14), content studio, social, Temporal or Trigger.dev, the observability stack, load testing and disaster-recovery drills. See `REPOSITORY_INTEGRATION_MATRIX.md` for the trigger that reopens each one.
