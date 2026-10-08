# Money OS: Architecture Audit (2026-10-08)

Scope: what in the existing LaunchPad Local repository the Money OS (Phase 1 phone/iPad MVP) can reuse, and what it must not disturb. Companion docs: `PHASE_1_PLAN.md`, `PHASE_2_PLAN.md`. The older system audit is `docs/CURRENT_SYSTEM_AUDIT.md`; live status is `docs/BUILD_STATUS.md`.

## Summary
LaunchPad Local already runs a cloud stack that works from a phone: a Next.js site on Vercel, a Supabase database, Stripe in live mode, and **Jarvis**, an owner-only assistant at `/jarvis` with sign-in, tool calls, a confirm-before-write gate, and voice. The Money OS should be built **into that stack, not beside it**. ULTRON Lite becomes Jarvis with Money OS tools and screens. No new platform, framework or database is needed for Phase 1.

The receptionist agency (voice agent, notify, lead gen, outreach) is the only part of the business with revenue potential this month. Nothing in Phase 1 may change how it runs.

## Inventory and classification

| Area | What exists | Where | Money OS decision |
|---|---|---|---|
| Frontend | Next.js 16.3.7 / React 19.3.0, App Router; landing, terms, privacy, onboarding form, `/jarvis` | `site/app/` | **KEEP**. Money OS screens are new routes under the same app. |
| Owner auth | Supabase magic link + 6-digit code, allow-list of one email, HttpOnly SameSite=Strict cookies, rate limits, origin allow-list | `site/lib/jarvis/auth.ts`, `origin.ts`, `site/app/api/jarvis/auth/*` | **KEEP** and reuse for every Money OS route. Do not build a second login. |
| Owner assistant | Jarvis: Claude tool loop (5 rounds, 700 tokens/round), validated tool inputs, write tools only *propose* and need `/confirm` within 2 minutes | `site/lib/jarvis/brain.ts`, `tools.ts`, `gate.ts`, `confirm.ts` | **ADAPT** into ULTRON Lite: add Money OS tools; keep the gate for every write. |
| Voice I/O | Deepgram STT, ElevenLabs TTS, server-side keys, size caps | `site/lib/jarvis/speech.ts`, `api/jarvis/stt`, `tts` | **KEEP** (works on iPhone now). |
| Phone UI | HUD + orb components | `site/components/jarvis/` | **ADAPT**: add a plain tabbed layout for data screens; the orb stays on the command screen. |
| Database | Supabase Postgres, RLS on, no policies, service role server-side only; 13 tables (prospects 131 rows, outreach_events 38, calls 4, cost_events 2, payments 1, others small) | `supabase/migrations/` | **KEEP**. Money OS adds new tables by new migration files only. |
| Cost ledger | `cost_events` (category, units, amount_usd, meta); category check now allows `lead_enrichment` | migration `20261007000001` | **ADAPT**: AI token usage needs its own columns, so add `ai_usage`; keep `cost_events` for non-AI costs. |
| Model config | All model IDs in `config/models.yaml`; Python enforces role-per-component (`lp.config.model`); site uses a generated copy | `config/models.yaml`, `lib/lp/config.py`, `site/lib/jarvis/models.generated.ts` | **ADAPT** into the Phase 1 model router (task → role → model) with budgets. Do not hardcode model IDs anywhere. |
| AI cost tracking | **Missing.** Jarvis does not record token usage from the Anthropic response. | `brain.ts` | **BUILD**: log `usage` from every response to `ai_usage`. |
| Payments | Stripe live: catalog, checkout links, webhook writes `payments` / `stripe_events` | `site/app/api/stripe/webhook`, `lib/lp/stripe_billing.py`, `docs/STRIPE.md` | **KEEP**. Revenue screen reads `payments` for the agency venture; other ventures use manual entries. |
| Lead gen + outreach | Places discovery, robots-safe research, scoring, Hunter verification, planner, Gmail drafts | `leadgen/` | **KEEP, do not touch.** Its patterns are reused (see below), its code is not changed. |
| Voice receptionist | Pipecat agent, token-locked phone path live 2026-10-07 | `agents/`, `bot.py`, `pcc-deploy.toml` | **KEEP, out of scope.** |
| Post-call notify | Supabase → Resend (SMS flagged off) | `agents/notify/` | **KEEP, out of scope.** |
| Weekly audit | Placeholder table `audits` (0 rows), T8 not built | `audit/` | **KEEP** (T8 later). |
| Automation tools | n8n MCP is connected to the Claude account | — | **Not used.** CLAUDE.md forbids n8n and third-party automation. |
| `/admin/review` | Listed in CLAUDE.md's layout table but no route exists in `site/app/` | — | **Doc drift.** Outreach review happens in `/outreach-daily` and Jarvis. Fix the table when the Money OS ships. |
| Legacy freelance app | Old Business OS | `legacy/bos-freelance-ops/` | **ARCHIVE** (already). |
| StarNet | Evaluated 2026-10-02: **NO-GO** as a base (local-first desktop app, fails cloud/mobile gate) | `docs/REPOSITORY_ACQUISITION.md` | **Phase 2 only**, and only after a fresh gate review. |

Nothing is classified REMOVE.

## Patterns to reuse (code is not shared across languages; the ideas are)
- **Deterministic scoring with grouped weights** (`leadgen/score.py`): the Money OS scores opportunities the same way. The model may propose sub-scores from evidence; code computes the overall score, tiers and ranking.
- **Evidence-or-unknown** (`leadgen/research.py`): a signal without evidence is "unknown" and is never scored. Opportunity scores work the same way, which gives confidence a real meaning.
- **Normalize → dedupe → filter → then spend** (`leadgen/discovery.py` `Dedupe`, enrichment `Budget`): the Money Radar dedupes by normalized name and source URL before any model call.
- **Budget object that refuses past its limit** (`leadgen/enrich.py` `Budget`): carried over to AI budgets per task, session, day and experiment.
- **Propose, then confirm** (`site/lib/jarvis/gate.ts`): every ULTRON write (create experiment, kill opportunity, record revenue) uses the existing two-minute confirm gate.
- **`DATA UNAVAILABLE`, never invented numbers** (CLAUDE.md): every dashboard tile.

## Risks and constraints
1. **Focus risk.** The agency has 0 paying clients; first outreach went out 2026-10-06/07. The Money OS must not take the owner's Tue–Thu outreach mornings or the voice test calls. Phase 1 is built in small slices so the agency keeps moving.
2. **Revenue claims.** The $50,000/month target is a goal, not a forecast. The Money OS shows only measured revenue (Stripe `payments` or entries the owner records).
3. **Research sources.** Reddit, TikTok and YouTube have API terms; no HTML scraping (CLAUDE.md hard rule). Phase 1 research uses the Anthropic web search tool (no new vendor, cloud-only, per-search cost known) plus pages it returns. Other sources come behind the same source interface later, each through the acquisition gate.
4. **Cost.** All Jarvis/ULTRON chat runs on `small` (Haiku), per `config/models.yaml`. Research can use more tokens than chat; it gets its own budget and cache.
5. **Security.** One owner account; every Money OS API route requires the Jarvis session and the origin check; service key stays server-side; tool inputs keep the fixed-shape validation.

## Revised master prompt (2026-10-08): delta audit
The owner re-issued the master prompt with more detail after Phase 1 shipped (slices 1–6). The repository was re-audited against it rather than rebuilt; the existing design already matches its principles: code before AI, cache, budgets, structured state, no fake state, and confirm-gated writes.

| Revised prompt asks for | State before slice 7 | Action |
|---|---|---|
| Monetization Analysis: revenue models, recurring/affiliate/digital product/SaaS potential, speed to first dollar | Sub-scores only (recurring, affiliate, speed); no per-model fit | Built: research proposes fits from a fixed list of 14 models, validated in code, stored only with grounded evidence (`opportunities.monetization_models`) |
| Validator: cheapest realistic experiment | Not stored | Built: `opportunities.cheapest_validation` (method from a fixed list, cost, days) |
| Opportunity database: search, filter, sort by score, category, status, monetization, confidence, speed | Status filter only | Built: in-browser search, filters and sorts over the code-ranked list |
| Dashboard: highest-potential opportunity and recommended next action | Top 3 list only | Built: "Next move" from fixed rules in `lib/os/next.ts` (shared with ULTRON `what_next`) |
| Experiment manager and revenue recording on screen | ULTRON only | Built: `/os` forms behind confirm dialogs, sharing ULTRON's validation (`/api/jarvis/os/action`) |
| "AI cost per dollar of revenue", "launch in 48 hours", "recurring revenue potential" | Not answerable | Built: `ai_cost_summary` ratio (null with no revenue), `top_opportunities` sort `fastest` and `model` filter |
| Emergency stop (§52) | Budgets only | Built early (cheap and protects spend): `os_settings.ai_paused` refuses every model call; Settings switch; logged |
| Approval levels (§51) | Phase 1 is effectively level 3 (every change needs the owner) | Documented for Phase 2 |
| Competitor Replication Lab (§6) | Competition and pricing evidence per opportunity | Documented for Phase 2; ULTRON answers competitor questions from stored evidence meanwhile |
| Ponytail (§31) | Not evaluated | Phase 2, measured like every other tool |
| Multi-venture, CFO, scale/kill, content/affiliate/product/SaaS engines, StarNet visual state | `venture` field on revenue; per-venture revenue/profit | Phase 2 (unchanged) |

Nothing was deleted or replaced. The agency systems (voice agent, notify, lead gen, outreach, Stripe webhook) are untouched.
