# Money OS Phase 1: complete

Updated 2026-10-08 for the revised master prompt (§47 Definition of Done, §48 contents). Branch `claude/launchpad-takeover-7xy730`, production at https://www.launchpadlocal.org (Vercel project `launchpad-site`). Plan: `PHASE_1_PLAN.md` (slices 1–7). Delta audit for the revised prompt: `ARCHITECTURE_AUDIT.md`. Build log: `docs/BUILD_STATUS.md` ("Money OS slice 1" to "slice 7").

Phase 2 (StarNet, Ollama, OmniRoute, Ponytail, Caveman, the agent system) has **not** been started. It begins only when the owner has computer access and says so (`PHASE_2_PLAN.md`).

## What was built

| Part | Where |
|---|---|
| Data: opportunities (+ monetization analysis, cheapest validation), evidence, research cache, experiments, AI usage ledger, revenue entries, activity, settings | `supabase/migrations/20261008000001` … `0005` (all applied; RLS forced, no policies, anon revoked) |
| Config: budgets and limits, prices, score weights and labels, Radar categories, cache TTL | `config/money_os.yaml` → `site/lib/os/config.generated.ts` at build |
| AI cost ledger, budgets, emergency stop | `site/lib/os/usage.ts`, `site/lib/os/settings.ts` |
| Deterministic scoring: 15 sub-scores, overall score, confidence, nested labels | `site/lib/os/score.ts`, `opportunities.ts` |
| Research engine + Money Radar: capped web search, grounded evidence, 14-day cache, monetization analysis, cheapest validation | `site/lib/os/research.ts`, `monetization.ts` |
| "What should we do next?" (rules in code) | `site/lib/os/next.ts` |
| Money OS app: Command (next move, highest-potential opportunity, cost, experiments, revenue), Opportunities (search, filter, sort, detail), Experiments, Revenue, AI Cost, Activity, Settings | `/os` (`site/app/os/`, `site/components/os/MoneyOs.tsx`) |
| ULTRON Lite (voice and text): 6 Money OS read tools, 6 confirm-gated Money OS write tools, plus the agency tools | `/jarvis`, `site/lib/jarvis/tools.ts`, `persona.ts` |
| API routes (owner session; writes also check the origin) | `/api/jarvis/os/{[view], radar, research, action, settings}`, `/api/jarvis/{chat, confirm}` |

### Guardrails that hold everywhere
- **No fake state.** Every number on screen or spoken by ULTRON comes from a table and is computed in code; an unreadable source shows `DATA UNAVAILABLE`. Revenue is live Stripe payments plus entries the owner records; the October 4 sandbox payment never counts.
- **Code before AI.** The model never ranks, sorts, filters, does arithmetic or sets statuses. It may only propose sub-scores, revenue-model fits and a validation plan, each checked in code against fixed lists and ranges. These are stored only when the same run produced evidence whose link came back from its own web searches; invented sources are dropped and counted.
- **Cost control.**
  - Order of preference: code, then cache, then the cheapest model.
  - Budgets per ULTRON request, per research run and per day are checked before every call.
  - Every call is logged with tokens, searches and cost; estimates are marked.
  - The emergency stop refuses every model call.
- **Owner approval.** Every ULTRON change is a pending action the owner confirms within two minutes; Radar and research state their maximum cost first. Every change made on `/os` has a confirm dialog. Nothing is deleted (kill = status).
- **Security.**
  - Owner-only sign-in (email + code), `SameSite=Strict` cookies, origin checks on writes.
  - Fixed-shape input validation; the service key is server-side only.
  - Client bundle checked for secret names at every build.

## Definition of Done (§47)

| Item | Status | How it was verified |
|---|---|---|
| Discover opportunities | ✅ | Live: 4 Radar sweeps (2 through ULTRON with confirmation) found 12 opportunities in 3 categories. Unit tests in `research.test.ts`. |
| Store opportunities | ✅ | Live: 12 opportunities, 142 evidence rows. Dedupe by slug and content hash is tested. |
| Research opportunities | ✅ | Live: all 12 researched on production. Unit: grounding, `pause_turn`, cache, 50 s run deadline. |
| Identify monetization possibilities | ✅ | Built in slice 7: per-model fit from 14 revenue models, "without building software", recurring/affiliate/digital product/SaaS potential, cheapest validation. Tested (`monetization.test.ts`). **Live data:** the 12 existing opportunities were researched before this existed; re-research fills it in. |
| Score opportunities | ✅ | Live: scores 5.68–7.06, confidence 0.53–1.00. `score.test.ts`. |
| Rank opportunities | ✅ | Code ranking (unscored last, killed hidden); sort by score, fastest to first dollar, confidence or newest. |
| Show evidence | ✅ | Detail lists claims with http(s)-only source links and dates. |
| Create experiments | ✅ | `/os` form and ULTRON `create_experiment`; tested. No live experiment yet. |
| Track experiment status | ✅ | Status selector on each experiment and ULTRON `set_experiment_status`; Command shows experiments waiting more than 7 days for a decision. |
| Record revenue | ✅ | `/os` Revenue form and ULTRON `record_revenue` (no future dates, never Stripe by hand); tested. |
| Track AI usage | ✅ | Live: 32 ledger rows, 0 failed. AI Cost tab: today, month, tokens, by task, per opportunity, per experiment. |
| Estimate AI cost | ✅ | Token counts × configured prices + $0.01 per search; rows without provider counts are marked estimated. |
| Enforce AI budgets | ✅ | Pre-call checks tested (refusal before any call, logged `budget_stop`); limits editable within hard bounds; emergency stop tested. |
| Accept ULTRON commands | ✅ | Live on the owner's iPhone: top opportunities answered from data; Radar run through ULTRON after "yes". |
| Display real activity | ✅ | Activity tab reads `activity` rows written by code (sweeps, research, budget stops, settings, experiments, kills, revenue). |
| Work on iPhone | ✅ | Owner used `/os` and ULTRON on iPhone. Playwright 390×844: all screens and forms, no horizontal scroll, tap targets ≥ 44 px, no page errors. |
| Work on iPad | ✅ | Playwright 820×1180 passes the same checks. The owner opened `/os` on the iPad on 2026-10-10 and it loaded. |
| Deploy through Vercel | ✅ | Every slice deployed to production from the branch and checked live. |
| Preserve data | ✅ | Additive migrations only; nothing deleted; agency tables untouched. |
| Pass basic security checks | ✅ | Checkpoint audit (slice 6) plus slice 7 routes: owner session on every route, origin check on every write, input validation, no secrets in the client bundle. |
| Pass core functionality tests | ✅ | Site 137/137, typecheck, lint, production build; Python suite OK. |
| Operate without local StarNet / Ollama / Docker / GPU | ✅ | Runs entirely on Vercel + Supabase + Anthropic API; nothing local. |

## What works today (owner view)
- **`/os` Command:** the next move chosen by rules, the highest-potential opportunity with its revenue models and cheapest test, AI cost today, active experiments and this month's revenue.
- **Opportunities:**
  - Run Money Radar.
  - Search, filter (category, label, money model) and sort.
  - Open one to see scores with reasons, evidence, the Monetization Analysis, Research again, Start an experiment, or Kill.
- **Experiments:** create, change status with a result note.
- **Revenue:** record money received outside Stripe.
- **Settings:** budgets, plus **Stop all AI**.
- **ULTRON**, by voice or text. Changes wait for your "yes".
  - "What should I do next?"
  - "Best opportunities"
  - "Something I can launch fast"
  - "Opportunities with recurring revenue"
  - "How can this make money without building software?"
  - "Cheapest way to validate it?"
  - "Run Radar on affiliate"
  - "Research …"
  - "Start an experiment …"
  - "Kill …"
  - "Record $40 from …"
  - "AI cost per dollar of revenue?"

## What was tested
- **Unit and integration** (`npm test`, 137 tests, fakes for Anthropic and Supabase):
  - scoring math and labels
  - dedupe and normalization
  - grounding
  - budget and stop refusals before any call
  - cache hits cost $0
  - run deadline and mid-flight failure logging
  - monetization validation
  - next-move rules
  - every write tool only proposing until confirmed
  - owner actions limited to four tools
  - revenue excluding test payments
  - `DATA UNAVAILABLE` paths
  - a guard that every write tool is allowed by the database
- **Mobile:** Playwright on the production build at iPhone and iPad sizes (every screen, forms open, signed-out state).
- **Live:**
  - Radar, research and ULTRON on production by the owner.
  - Route checks after each deploy (pages 200; APIs 401 when signed out).
  - Database constraint checks.

## Results so far (live, 2026-10-08)
- **Opportunities discovered:** 12, all researched, across AI income services, digital products and micro-SaaS. The top 5 by code score:

  | Opportunity | Score | Confidence | Est. days to first $ |
  |---|---|---|---|
  | Canva social media template bundles for small businesses | 7.06 | 0.73 | 21 |
  | AI-Assisted SEO & Content Retainers | 7.00 | 0.93 | 21 |
  | Niche Notion templates for specific professions | 6.79 | 0.73 | 21 |
  | Printable planner templates for niche audiences | 6.67 | 1.00 | 10 |
  | AI prompt packs for specific workflows | 6.66 | 0.87 | 7 |

  Estimated days are model estimates from the evidence.
- **Experiments created:** 0.
- **Revenue generated:** $0.00. No live Stripe payments and no recorded entries.

## AI costs (measured)
| What | Calls | Cost | Each |
|---|---|---|---|
| Research run (5 searches) | 12 | $1.143 | ≈ $0.095 |
| Radar sweep (2 searches) | 4 | $0.198 | ≈ $0.05 |
| ULTRON request | 16 | $0.076 | ≈ $0.005 |
| **Total** | **32** | **$1.42** | |

The default daily budget of $2.00 covers about 20 research runs, 40 Radar sweeps or 400 ULTRON requests a day.

## Infrastructure costs
No new paid services. The site runs on the existing Vercel project (Hobby), the database is the existing Supabase project, and AI goes through the existing Anthropic API key (billed per use, measured above). Web search is billed by Anthropic at $10 per 1,000 searches and is included in the AI costs.

## Known issues and remaining limitations
1. **Monetization data gap:** the 12 existing opportunities have no Monetization Analysis yet, because they were researched before slice 7. "Research again" fills it in at about $0.10 each.
2. **Budget race:** two expensive runs started at the same moment can overshoot the daily budget by up to one run (about $0.25).
3. **Continuation searches:** each `pause_turn` continuation may use its own search allowance. The run cap and the 50 s deadline still stop the run.
4. **Settings scope:** cache TTL, Radar categories and score weights are edited in `config/money_os.yaml`, not on the phone.
5. **Experiment spend:** experiments have no money-spent field. AI cost per experiment is on the AI Cost tab, but spending outside AI isn't tracked.
6. **Competitor research:** there's no Competitor Replication Lab yet. Competitor answers come from each opportunity's competition and pricing evidence.
7. **Separate sign-in on iPhone:** the `/os` and `/jarvis` home-screen apps need separate sign-ins (iOS keeps separate cookies per home-screen app).
8. **Model:** Radar and research use the `small` model with the basic web search tool (no dynamic result filtering).
9. **Estimates:** revenue-model fits, the validation plan and days to first dollar are model estimates from evidence and are labeled as such. Only recorded results count as results.

## What the owner should test
1. Open `/os` on the iPad once. This closes the last Definition of Done item.
2. Tap **Research again** on the top 2 or 3 opportunities to fill in their Monetization Analysis and cheapest validation. Do it after midnight, since today's budget is mostly used.
3. Follow the Command screen's next move: start one real validation experiment and set its target.
4. Try **Stop all AI** and then **Resume** in Settings, and check that Activity logs both.
5. After a few days, compare the AI Cost tab with the Anthropic console bill.

## Phase 2 recommendations (when the computer arrives)
1. **Use Phase 1 data first.** Pick local versus cloud models (Ollama) and routing (OmniRoute) from the measured `ai_usage` rows; research is 80% of today's spend, so it's the first candidate.
2. **Add agents only when needed.** The first two are RADAR (scheduled sweeps within the daily budget) and CFO (profit per venture), and only once there is revenue to analyze.
3. **Competitor Replication Lab:** build it on the same grounded-evidence and budget rules.
4. **Control layer before any autonomy:** approval levels, a wider emergency stop and full observability, before any agent acts on its own.
5. **Measure build tooling:** evaluate Ponytail and Caveman on real build tasks, and keep them only if they are net-positive.
6. **StarNet as a worker:** re-run the acquisition gate. StarNet should be a worker that reads and writes the same Supabase tables, never a second system of record.

## Sign-off
Phase 1 was signed off by the owner on 2026-10-10, after the iPad check passed and the first live Social Radar sweep ran without errors.
