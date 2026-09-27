# Repository / Platform Integration Matrix

**As of:** 2026-09-27. License and last-commit data come from shallow clones of each repo's default branch on that date. The rule applied (spec §130–132): adopt only what shortens the path to revenue or closes a real security or reliability gap. Everything else is deferred with a named trigger for revisiting it.

**Summary:** 4 GO · 7 DEFER · 13 NO-GO. The GO list adds **no new runtime framework**: Supabase and Pipecat were already chosen, Playwright is for testing only, and Dependabot is built into GitHub.

| Component | Purpose | License · last commit | Our existing alternative | Decision | Why | Risk | Revisit when |
|---|---|---|---|---|---|---|---|
| **Pipecat** (+ Flows) | Voice agent engine | BSD-2 · 2026-09-27 | none | **GO** (chosen in T1) | Core of the product | Pipecat Cloud lock-in: mitigated because the code also runs self-hosted | — |
| **Supabase** | Postgres, auth, storage | Apache-2.0 · 2026-09-25 | local Postgres for tests | **GO** (pending paid plan) | One store for data, auth (owner login for the Command Center), files | Vendor: standard Postgres, `pg_dump` exit path | — |
| **Playwright** | Site QA, E2E, client-website checks (§56) | Apache-2.0 · 2026-09-23 | none | **GO** (dev/CI only) | Chromium already in this environment; deterministic tests for `/api/lead`, forms, mobile layouts | None at runtime | — |
| **GitHub Dependabot + secret scanning** (instead of Renovate) | Dependency and security updates, leak prevention | built into GitHub | none | **GO** | Free, zero hosting. Weekly PRs, **no auto-merge** | Noise | Renovate if grouping rules become necessary |
| OpenTelemetry | Vendor-neutral traces, metrics, logs | Apache-2.0 · 2026-09-25 | structured logs + `calls` / `cost_events` tables | **DEFER** | Pipecat can emit OTel spans. Pointless until a backend exists | — | First deployed agent that needs latency traces beyond logs (T4) |
| Sentry | Error tracking | FSL-1.1 (hosted use OK) · 2026-09-25 | logs | **DEFER** | Free tier is useful once the site and agent are live | Sends stack traces; scrub PII | Site or agent in production (T4/T6) |
| Langfuse | LLM traces, evaluations | MIT · 2026-09-26 | weekly `/audit` job + `audits` table | **DEFER** | Transcripts contain caller PII; only if self-hosted or scrubbed | PII exposure | More than 1 paying client, or prompt-tuning becomes a bottleneck |
| PostHog | Product analytics, funnels | MIT · 2026-09-27 | none | **DEFER** | Landing-page funnel only; cookie consent needed | Privacy | Site traffic worth measuring |
| Infisical | Central secrets | MIT · 2026-09-27 | GitHub Actions secrets, Vercel env, Pipecat Cloud secrets | **DEFER** | 3 stores are manageable now | Another service holding every key | Per-client credentials (calendar or CRM OAuth) |
| k6 | Load tests | AGPL-3.0 (internal CLI use OK) · 2026-09-25 | none | **DEFER** | Our load is tiny | — | More than 10 clients live, or webhook volume concerns |
| Cloudflare R2 | Object storage | Apache-2.0 (workerd) · 2026-09-27 | Supabase Storage | **DEFER** | No large media yet | — | Call-recording or media storage costs exceed Supabase's |
| OmniRoute | Multi-provider model gateway | MIT · 2026-09-27 | `config/models.yaml` + direct Anthropic SDK | **NO-GO** | Adds a network hop in the latency-critical voice path. Features like "free providers" and token compression send client data to unknown providers | Privacy, latency, supply chain | We need a second model provider in production |
| Browser Use | LLM-driven browser | MIT · 2026-09-26 | Places API + polite HTTP fetch | **NO-GO** | Lead gen must use official APIs and respect robots.txt. LLM browsing is costly and a terms-of-service risk | ToS, cost | A permitted task that has no API |
| Trigger.dev | Jobs / scheduling | Apache-2.0 · 2026-09-23 | GitHub Actions cron + idempotent jobs + a Postgres job table | **NO-GO** | Our volume doesn't justify a second job platform (§72: one engine) | Overlap | Jobs need sub-minute scheduling or long fan-out |
| Temporal | Durable workflows | MIT · 2026-09-24 | idempotent steps + DB state | **NO-GO** | Heavy to operate. Onboarding is a checklist, not a long-running saga | Ops cost | Multi-day automated fulfillment workflows exist |
| LangGraph | Stateful agent graphs | MIT · 2026-09-23 | Pipecat Flows (calls), linear pipelines (lead gen) | **NO-GO** | A second orchestrator violates §104 | Framework sprawl | — |
| PydanticAI | Typed agents | MIT · 2026-09-27 | Anthropic SDK tool use + pydantic models | **NO-GO** | Pydantic already ships with Pipecat; no extra framework needed | Sprawl | — |
| Mastra | TypeScript agents | Apache-2.0 core, commercial `ee/` · 2026-09-27 | Python agents | **NO-GO** | Different language; duplicate framework | Sprawl, license split | — |
| Cloudflare Workers / Durable Objects | Edge compute, state | Apache-2.0 · 2026-09-27 | Vercel functions, Pipecat Cloud | **NO-GO** | Would be a third hosting platform | Sprawl | — |
| HashiCorp Vault | Secrets | **BUSL-1.1** · 2026-09-25 | platform secret stores | **NO-GO** | License, plus heavy operations for a solo owner | — | — |
| Unleash | Feature flags | **AGPL-3.0** · 2026-09-25 | `config/*.yaml` flags + a `feature_flags` table (Phase 5) | **NO-GO** | Kill switches (`FIRST_DOLLAR_MODE`, `sending_paused`, `review_mode`) are a few booleans | — | Per-client staged rollouts at scale |
| Sigstore / Cosign | Artifact signing | Apache-2.0 · 2026-09-23 | GitHub-built artifacts | **NO-GO** (for now) | We publish no images or packages | — | We ship our own container images |
| Renovate | Dependency PRs | AGPL-3.0 · 2026-09-27 | Dependabot | **NO-GO** | Dependabot is built in | — | See Dependabot row |
| Jarvis | Voice assistant UI | MIT · 2026-08-05 | — | **NO-GO** | See `JARVIS_AUDIT.md` | — | — |

## Interfaces (§105), built only as each is needed
`AIProvider` (in `lp.config` plus a thin client), `EmailProvider` (Instantly or Smartlead), `AlertProvider` (Resend and Twilio SMS), `VoiceProvider` (Pipecat services are already swappable per client), `StorageProvider` (Supabase). Each one starts with a single implementation. A second implementation is added only when a matrix row flips to GO.
