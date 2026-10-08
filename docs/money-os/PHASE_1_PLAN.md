# Money OS Phase 1: Phone/iPad MVP (build now)

Goal: a Money OS the owner runs entirely from a phone or iPad browser, on the existing Vercel + Supabase + Jarvis stack. Phase 1 discovers, researches, scores and ranks opportunities, tracks experiments, revenue and AI cost, and answers ULTRON commands. It does not launch or run experiments by itself.

Read first: `ARCHITECTURE_AUDIT.md` (what is reused and why).

## Principles (apply to every slice)
- Code before AI, cache before AI, structured data before long prompts, `small` model before anything bigger.
- AI never does sorting, arithmetic, filtering, timestamps, status changes or known business rules.
- Every number on screen comes from a table. No data → `DATA UNAVAILABLE`.
- Every write from ULTRON goes through the existing propose → confirm gate.
- The receptionist agency, lead gen and outreach code are not modified.

## Where it lives
- UI: `site/app/os/` (behind the Jarvis session). Tabs: **Command · Opportunities · Experiments · Revenue · AI Cost · Activity · Settings**. Command is the existing Jarvis chat and voice (renamed ULTRON in the UI; the code module stays `jarvis` to avoid churn).
- API: `site/app/api/os/*`, each route behind `requireOwner()` + origin check (same as `/api/jarvis/*`).
- Logic: `site/lib/os/` (TypeScript, unit-tested with the existing test runner).
- Config: `config/money_os.yaml` (categories, score weights, budgets, cache TTLs). Generated into the site at build, like `models.generated.ts`.
- Data: one new migration, `supabase/migrations/2026100800000x_money_os.sql`.

## Data model (new tables; RLS on, no policies, service role only)
| Table | Key columns |
|---|---|
| `opportunities` | id, slug (unique, normalized name), name, category, problem, audience, monetization text[], status (`discovered` … `killed`), 15 sub-scores (0–10, null = unknown), overall_score, confidence, validation_difficulty, est_days_to_first_dollar, evidence_count, created_at, updated_at |
| `opportunity_evidence` | id, opportunity_id, kind (demand, trend, competition, pricing, affiliate, other), claim, source_url, source_domain, observed_at, content_hash (unique per opportunity) |
| `research_runs` | id, opportunity_id (nullable for Radar sweeps), query, query_hash, status, result jsonb, ai_usage_id, created_at, expires_at — the cache |
| `experiments` | id, opportunity_id, name, hypothesis, method, success_metric, target, budget_usd, spent_usd, status (`VALIDATING`, `VALIDATED`, `KILLED` …), started_at, ended_at, result_note |
| `ai_usage` | id, at, task, component, provider, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, web_searches, est_cost_usd, estimated bool, duration_ms, ok bool, opportunity_id, experiment_id, session_id |
| `revenue_entries` | id, venture, experiment_id, source (stripe, manual), product, amount_usd, cost_usd, occurred_on, note, stripe_payment_id (unique) |
| `activity` | id, at, actor (owner, ultron, radar), action, subject_type, subject_id, detail |

Agency revenue already in `payments` is shown on the Revenue tab as the venture "LaunchPad Local agency"; it is not copied.

## Scoring (code, `site/lib/os/score.ts`)
- 15 sub-scores from the spec (demand, trend momentum, competition, monetization, recurring revenue, affiliate, content, automation, speed to revenue, startup cost, technical difficulty, acquisition difficulty, retention, market size, defensibility). "Bad" dimensions (competition, cost, difficulty) are inverted.
- `overall_score` = weighted mean of the **known** sub-scores, weights in `config/money_os.yaml`.
- `confidence` (0–1) = coverage (share of sub-scores known) × evidence strength (count, distinct source domains, recency within 90 days).
- Labels, all computed in code:
  - **HIGH SCORE**: overall ≥ 7.0
  - **+ STRONG EVIDENCE**: confidence ≥ 0.6 and ≥ 3 distinct source domains
  - **+ FAST VALIDATION**: validation_difficulty ≤ 3 and est_days_to_first_dollar ≤ 14
- The model's job is only: read gathered evidence → propose sub-scores with one-line reasons, as JSON in a fixed schema. Code validates ranges, stores, and computes everything else. "Why did this score highly?" is answered from the stored reasons and evidence rows, not re-generated.

## Research engine and Money Radar (`site/lib/os/research.ts`, `radar.ts`)
- **Source interface:** `Source.search(query) → {title, url, snippet, observed_at}[]`. Phase 1 source: the Anthropic web search tool, capped per call (`max_uses`). Later sources (Reddit API, YouTube Data API, Google Trends, app stores, affiliate networks) plug into the same interface, each through `docs/REPOSITORY_ACQUISITION.md`. No HTML scraping.
- **Pipeline:** collect → normalize (lowercase, strip tracking params) → dedupe (`content_hash`, known slugs) → filter (directories, duplicates of existing opportunities) → AI extraction → code scoring.
- **Cache:** `research_runs` keyed by `query_hash`; a hit within the TTL (default 14 days) costs nothing and says "cached from <date>".
- **Money Radar sweep:** one button / one ULTRON command. Walks the category list in config (AI tools, affiliate, TikTok commerce, digital products, creator tools, newsletters, micro-SaaS, job/income tools …), a few queries per category, stores new `discovered` opportunities with their evidence. No category is assumed to win; ranking only comes from scores.

## Model router + budgets (`site/lib/os/router.ts`)
- `route(task)` → role → model ID from `config/models.yaml` (`small` for chat, extraction and scoring; a stronger role only if a task is added to the `allowed` list on purpose). No model ID appears anywhere else.
- Provider interface: `complete({task, messages, tools, maxTokens}) → {text, toolCalls, usage}`. Anthropic is the Phase 1 provider; Ollama/OmniRoute are Phase 2 implementations of the same interface.
- Every call writes one `ai_usage` row from the provider's `usage` object. If the provider gives no counts, tokens are estimated (≈ characters ÷ 4) and the row says `estimated = true`; the AI Cost tab shows "estimated".
- Prices per model live in config; cost = tokens × price. Prices are checked against Anthropic's published pricing at build time.
- **Budgets** (config, editable in Settings): per task, per ULTRON session, per day, per experiment. Checked in code **before** each call from today's `ai_usage` sum. Over budget → the call is refused, an `activity` row is written, and ULTRON / the dashboard shows the stop. No retries past a budget, and no loops: Radar sweeps have a fixed query count.
- Existing Jarvis calls are switched to this router so their cost appears too.

## ULTRON Lite: commands → tools
New read tools (run freely): `top_opportunities`, `opportunity_detail` (scores, reasons, evidence), `list_experiments`, `revenue_summary`, `ai_cost_summary`, `what_next` (code ranks: active experiments needing a decision, then top labeled opportunities; the model only phrases it).
New write tools (propose → owner confirms): `radar_sweep`, `research_opportunity`, `create_experiment`, `set_experiment_status`, `kill_opportunity`, `record_revenue`.
Existing Jarvis tools (calls, leads, outreach, briefing) stay, so one assistant covers the agency and the Money OS.

## Screens (mobile first)
- One column below 640px; tables become cards; tap targets ≥ 44px; no horizontal scroll; respects `prefers-reduced-motion`; dark mode.
- **Opportunities:** ranked list with label chips, filter by status/category/label, detail page with sub-score bars, reasons, evidence links, "Research" and "Create experiment" buttons.
- **Experiments:** status board, budget vs spent, result note.
- **Revenue:** by venture and month; agency from `payments`, others from `revenue_entries`; profit = revenue − cost − AI cost attributed to that experiment.
- **AI Cost:** today, this month, tokens, cost per opportunity, cost per experiment, budget meters.
- **Activity:** newest-first log.
- **Settings:** budgets, cache TTL, Radar categories (validated and saved to a settings row; secrets are never shown).

## Build slices (each ends tested, committed, deployed)
| # | Slice | Model to run | Needs |
|---|---|---|---|
| 1 | Migration + `config/money_os.yaml` + `ai_usage` logging on existing Jarvis calls + router/budget module | Opus (cost and security logic) | nothing new |
| 2 | Opportunity + evidence storage, deterministic scoring + labels, tests | Opus | — |
| 3 | `/os` shell, tabs, Opportunities/Experiments/Revenue/AI Cost/Activity screens (read-only) | Sonnet | — |
| 4 | Research engine + cache + Money Radar sweep | Opus | Anthropic web search enabled for the org's API key (Console setting) |
| 5 | ULTRON tools + confirm-gated writes; Settings | Opus | — |
| 6 | Mobile pass (Playwright iPhone + iPad viewports), deploy, live smoke test, `PHASE_1_COMPLETE.md` | Opus (checkpoint audit) | owner opens `/os` on iPhone + iPad |

## Tests (definition of done)
Unit: scoring math and labels, dedupe/normalize, budget refusal, cache hits, router never returns an unlisted model, tool input validation, revenue/profit sums, `DATA UNAVAILABLE` rendering.
Integration (fakes for Anthropic and Supabase): Radar sweep stores deduped opportunities with evidence; research uses cache on second run; over-budget call is refused and logged; ULTRON write tools only propose until confirmed.
Mobile: Playwright at 390×844 (iPhone) and 820×1180 (iPad): every tab loads, key actions reachable, no horizontal scroll.
Live: one Radar sweep and one research run on production with the budget at its default; cost appears on the AI Cost tab.

Phase 1 is complete only when every item in the spec's Definition of Done is checked in `PHASE_1_COMPLETE.md` with how it was verified.

## Cost guardrails (defaults, editable)
- Chat: `small` model, existing caps (5 tool rounds, 700 tokens/round).
- Research: max 5 web searches per run, 1 run per opportunity per 14 days unless forced.
- Daily AI budget default **$2.00**; per-experiment research default **$1.00**; Radar sweep capped at 20 searches.
- Exact defaults are set in slice 1 from measured costs of the first runs.

## Out of scope for Phase 1 (see `PHASE_2_PLAN.md`)
StarNet, Ollama, OmniRoute, local models, autonomous experiment execution, content posting, affiliate automation, multi-agent workers, scheduled background sweeps beyond one optional daily Vercel cron.
