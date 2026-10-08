# Money OS Phase 2: Computer Upgrade (after computer access; do not start yet)

Phase 2 upgrades the Phase 1 system in place. Same database, same `/os` app, same ULTRON. Nothing in Phase 1 is thrown away. Phase 2 starts only when the owner has the computer and says "begin Phase 2", and only after `PHASE_1_COMPLETE.md` is signed off.

## Entry conditions
1. Phase 1 Definition of Done met and verified on iPhone and iPad.
2. At least 30 days of Phase 1 data: opportunities, research runs, `ai_usage` rows. Phase 2 decisions (local vs cloud model, routing) are made from this data, not from guesses.
3. Each new tool passes `docs/REPOSITORY_ACQUISITION.md` and gets a row in `REPOSITORY_INTEGRATION_MATRIX.md`.

## Upgrades, in order
| # | Upgrade | Plugs into | Gate notes |
|---|---|---|---|
| 1 | **Ollama** on the owner's Dell for classification, extraction, summarization, categorization | Phase 1 provider interface (`router.ts`) as a second provider | Measure quality vs `small` on stored Phase 1 tasks before switching any task. A task moves to local only if quality holds and cost drops. The site still works when the computer is off (cloud fallback). |
| 2 | **OmniRoute** as the routing layer (cost, quality, latency, complexity, budget) | Replaces the routing table inside `router.ts`; callers do not change | Full acquisition gate. Must respect the same budgets and write the same `ai_usage` rows. |
| 3 | **StarNet** | Agent orchestration behind ULTRON | Re-run the gate: on 2026-10-02 it was NO-GO as a base (local-first desktop app, fails cloud/mobile). Possible role: an owner-side worker on the Dell that pulls tasks from Supabase and writes results back. Never the system of record. |
| 4 | **Token-optimization tooling** (for example Caveman) | Session/agent prompts | Evaluate savings, context overhead, quality impact, latency, maintenance. Install only with a positive net result. |
| 5 | **Specialized agents** (RADAR, VALIDATOR, CONTENT, AFFILIATE, CFO, KILLER, SCALE …) | Each is a worker with a fixed task schema and the concise result shape below | Add one only when a real workflow needs it. Start with RADAR (scheduled sweeps) and CFO (profit per venture). |

Agent result shape (all agents):
```json
{"status": "success", "confidence": 0.86, "keyFindings": [], "recommendation": "", "nextAction": ""}
```

## Future engines (document only until evidence)
- **Autonomous loop:** discover → research → score → validate → select → build → launch → distribute → monetize → measure → optimize → scale/kill. Each step keeps the owner-approval gate for anything that spends money, publishes, or contacts people.
- **Content engine** (TikTok, Instagram, YouTube, SEO, newsletters): tracked by revenue (clicks → signups → purchases), not views. Posting needs each platform's official API and terms.
- **Digital product engine:** pain → product → MVP → pricing → landing page → payment (existing Stripe) → delivery → analytics.
- **Affiliate engine:** legitimate programs only; track merchant, commission, cookie window, URL, conversions, revenue. FTC disclosure on every page.
- **SaaS engine:** only after evidence of demand, repeat use, willingness to pay and retention.
- **CFO:** revenue, AI cost, infrastructure, acquisition cost, experiment cost, profit, ROI, MRR per venture.
- **Scale/kill:** SCALE / WATCH / OPTIMIZE / KILL from measured revenue, conversion, retention, margins and support load.
- **Portfolio:** separate revenue, cost, users, experiments and analytics per venture (the Phase 1 `venture` field is the start of this).

## What stays the same
Hard rules in `CLAUDE.md` (no secrets in git, no scraping, no outbound calling, no n8n, no fabricated numbers, owner approval for irreversible actions) apply to every Phase 2 agent. The agency's voice, notify, lead gen and outreach systems keep running unchanged.
