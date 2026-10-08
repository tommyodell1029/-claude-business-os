# Money OS Phase 1: complete

Date: 2026-10-08. Branch `claude/launchpad-takeover-7xy730`, production at https://www.launchpadlocal.org (Vercel project `launchpad-site`).
Plan: `PHASE_1_PLAN.md`. Build log per slice: `docs/BUILD_STATUS.md` ("Money OS slice 1" to "slice 6").

Phase 2 (StarNet, Ollama, OmniRoute, the full agent system) has **not** been started. It begins only when the owner has computer access and says so (`PHASE_2_PLAN.md`).

## What was built

| Part | Where |
|---|---|
| Data: opportunities, evidence, research cache, experiments, AI usage ledger, revenue entries, activity, budget settings | `supabase/migrations/20261008000001_money_os.sql`, `…0002_opportunity_evidence_domains.sql`, `…0003_os_settings.sql`, `…0004_jarvis_actions_money_os_tools.sql` (all applied; RLS forced, no policies, anon revoked) |
| Config: budgets, prices, scoring weights and labels, Radar categories, cache TTL | `config/money_os.yaml` (generated into `site/lib/os/config.generated.ts` at build) |
| AI cost ledger and budgets: every model call logged; budgets checked in code before each call | `site/lib/os/usage.ts`, `site/lib/os/settings.ts` |
| Deterministic scoring: 15 sub-scores, overall score, confidence, nested labels | `site/lib/os/score.ts`, `site/lib/os/opportunities.ts` |
| Research engine and Money Radar: capped web search, grounded evidence, 14-day cache | `site/lib/os/research.ts`, `/api/jarvis/os/radar`, `/api/jarvis/os/research` |
| Money OS screens: Command, Opportunities (+ detail), Experiments, Revenue, AI Cost, Activity, Settings | `/os` (`site/app/os/`, `site/components/os/MoneyOs.tsx`) |
| ULTRON (formerly Jarvis): Money OS read tools and confirm-gated write tools | `/jarvis`, `site/lib/jarvis/tools.ts`, `persona.ts` |

### Guardrails that hold everywhere
- Every number on screen and in ULTRON's answers comes from a table and is computed in code. Unreadable data shows `DATA UNAVAILABLE`.
- The model never ranks, scores or does arithmetic. It may only propose 0–10 sub-scores with reasons; code validates them, and stores them only when the same run produced grounded evidence.
- Evidence is kept only when its link came back from that call's own web searches. Invented sources are dropped and counted.
- Every ULTRON change (Radar, research, experiment, status, kill, revenue, note, outreach review) is a pending action the owner must confirm within two minutes. Radar and research show their maximum cost before confirmation, and the model is called only after it.
- Nothing is deleted: killed opportunities keep their data. Stripe revenue is read from live-mode payments only (the October 4 sandbox payment never counts) and is never typed in.
- Owner-only access (email + code sign-in, `SameSite=Strict` cookies); write routes also check the request origin.

## Definition of Done

| Item | Status | How it was verified |
|---|---|---|
| Discover opportunities | ✅ | Live: 3 Radar sweeps on production (2 from `/os`, 1 through ULTRON with confirmation) stored 8 opportunities. Unit: `research.test.ts`. |
| Store opportunities | ✅ | Live: 8 rows in `opportunities`, 34 in `opportunity_evidence`. Unit: dedupe by slug and content hash (`score.test.ts`, `research.test.ts`). |
| Research opportunities | ✅ | Live: research run on "AI Video Editing & Repurposing Service" saved 11 evidence items from 6 domains. Unit: grounding, `pause_turn` continuation, cache hit costs $0. |
| Score opportunities | ✅ | Live: that opportunity scored 6.46 with confidence 0.80 (12 of 15 dimensions with reasons). Unit: `score.test.ts`. |
| Rank opportunities | ✅ | Code ranking in `listRanked` (unscored last, killed hidden); `top_opportunities` tool test. |
| Display evidence | ✅ | Opportunity detail lists claims with safe (http/https only) source links; Playwright on iPhone and iPad sizes. |
| Create experiments | ✅ | ULTRON `create_experiment` (confirm-gated); test proves nothing is written before confirmation and the opportunity moves to validating. **Not yet done live.** |
| Track experiment status | ✅ | ULTRON `set_experiment_status`; Experiments tab shows counts by status. Test covers killed → `ended_at`. |
| Track AI usage/cost | ✅ | Live: 15 ledger rows, $0.29 total, 0 failed calls; AI Cost tab shows today, month, budget meter, by task, by opportunity. |
| Show revenue | ✅ | Revenue tab and `revenue_summary`: live Stripe payments + recorded entries; currently $0.00 (true: no live revenue yet). Test: sandbox payment excluded. |
| Accept ULTRON commands | ✅ | Live on the owner's iPhone: "What are my top opportunities" answered from data; Radar via ULTRON executed after confirmation. |
| Work on iPhone | ✅ | Owner used `/os` and ULTRON on iPhone (screenshots 2026-10-08). Playwright 390×844: all 8 screens, no horizontal scroll, all tap targets ≥ 44 px, no page errors. |
| Work on iPad | 🟡 | Playwright 820×1180: same checks pass. **Owner still needs to open `/os` on the iPad once.** |
| Deploy through Vercel | ✅ | Every slice deployed to production from the branch (git source); live route checks after each deploy. |
| Preserve data | ✅ | Additive migrations only; no data deleted; kill = status change; agency, lead-gen and outreach tables untouched. |

Tests at completion: site 129/129 (`npm test`), typecheck, lint, production build with client-bundle secret check; Python suite OK.

## What works today (owner view)
- `/os` → Opportunities → **Run Money Radar**: searches the web by category and saves opportunities that have real sources.
- Open an opportunity → **Research**: adds evidence and a score you can read the reasons for.
- ULTRON (`/jarvis`), by voice or text:
  - "What should I do next?"
  - "What are my top opportunities?"
  - "Tell me about the video editing one"
  - "Run Money Radar on affiliate"
  - "Research …"
  - "Start an experiment …"
  - "Mark that experiment killed …"
  - "Kill …"
  - "Record $40 from …"
  - "How much have I spent on AI?"
  - "What's my revenue?"

  Changes wait for your "yes".
- `/os` → Settings: change the daily, per-request and per-research budgets within safe limits.

## Current costs (measured on production, 2026-10-08)
| What | Count | Cost | Each |
|---|---|---|---|
| Radar sweep (one category, 2 searches) | 3 | $0.150 | ≈ $0.05 |
| Research run (5 searches) | 1 | $0.091 | ≈ $0.09 |
| ULTRON request | 11 | $0.050 | ≈ $0.0045 |
| **Total to date** | 15 calls | **$0.29** | |

Default daily budget is $2.00: roughly 40 Radar sweeps, or 20 research runs, or several hundred ULTRON requests a day. Hosting (Vercel Hobby, Supabase) adds no new cost.

## Known issues and limits
1. **Budget race:** two expensive runs started at the same moment can each pass the daily check and overshoot the daily budget by up to one run (about $0.25 at default settings).
2. **Long research runs:** each `pause_turn` continuation may use its own search allowance. The per-run cap still stops the run, and the whole run is cut off at 50 seconds. A request that dies mid-flight is logged at an estimated worst case.
3. **Settings:** only the three budgets are editable on the phone. Cache TTL, Radar categories and score weights stay in `config/money_os.yaml` (a code change), although the plan listed them for Settings.
4. **`/os` writes:** `/os` only has Radar, Research and Settings. Experiments, status changes, kills and revenue go through ULTRON; there are no forms for them in `/os`.
5. **Filters:** Opportunities filters by status only; there are no category or label filters yet.
6. **Experiment spend:** there is no `spent_usd` per experiment. AI cost per experiment is on the AI Cost tab, but money spent outside AI isn't tracked.
7. **Separate sign-in on iPhone:** the home-screen apps for `/os` and `/jarvis` each need their own sign-in (iOS keeps separate cookies per home-screen app).
8. **Model support:** Radar and research run on the `small` model (Haiku 4.5) with the basic web search tool. That works, but there's no dynamic result filtering.

## What the owner should test
1. Open `/os` on the iPad once: all tabs, one opportunity, Settings. This closes the last Definition of Done item.
2. In ULTRON: "What should I do next?"
3. Create one real experiment through ULTRON, confirm it, and check the Experiments tab.
4. Change one budget in Settings, then check Activity shows the change.
5. After a few days of use, check AI Cost against the Anthropic console bill (the ledger is an estimate from token counts).

## What waits for Phase 2 (computer access)
- StarNet integration (ULTRON → StarNet → specialized agents), after inspecting the repo through `docs/REPOSITORY_ACQUISITION.md`.
- Ollama local models, OmniRoute model routing, and a token-optimization review (Caveman and similar), each measured for net value first.
- The named agent system (RADAR, SCOUT, VALIDATOR, CFO, KILLER …), introduced one workflow at a time.
- The content, digital product, affiliate and SaaS engines, plus the CFO, scale/kill and multi-venture portfolio views.
- ULTRON moving from `/jarvis` into StarNet; the Windows desktop app and wake word arrive with the owner's Dell.
