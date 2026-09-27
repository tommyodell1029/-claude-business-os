# Current System Audit

**As of:** 2026-09-27 · **Branch:** `claude/launchpad-takeover-7xy730` · **Spec:** Master Build Specification (§131 inspection list)

Everything below was checked directly, by reading the code, running the tests, or querying the connected accounts. Nothing is assumed.

## Repository

| Item | State |
|---|---|
| Git | Clean tree. 8 commits on the working branch. `pre-takeover` tag exists locally only (the proxy rejects tag pushes). The pre-takeover commit is also preserved on the branch `claude/ai-business-os-wga6sr`. |
| Language / packaging | Python 3.11. `pyproject.toml` pins one dependency (`pyyaml==6.0.3`). No Node project yet. |
| Framework | None yet. Pipecat (voice) and Next.js (site) are planned and not installed. |
| Tests | `python3 -m unittest discover -s tests` passes 41 tests. The legacy app passes its own 57. |
| CI | None. No GitHub Actions workflows. |
| Deployment | None. No Vercel project, no Pipecat Cloud agent, no Dockerfile. |

## Architecture: what exists

| Area | Exists | Evidence |
|---|---|---|
| Shared library | Yes | `lib/lp/`: phone, email and domain normalization, secret redaction, retry with backoff, model config enforcement |
| Model routing | Minimal | `config/models.yaml` plus `lp.config.model(role, component)`. Blocks the audit model outside `/audit`. Single provider (Anthropic). No fallback entry yet. |
| Database schema | Written, **not applied** | `supabase/migrations/20260926000001_launchpad_init.sql`: 8 tables with forced row-level security. Tested on local Postgres 16: re-runs cleanly, the anon role is denied, suppression rows are permanent, and consent is enforced. |
| Authentication | None | No users, roles or login. |
| Agents (runtime) | None | Only build-time Claude Code subagents exist (`.claude/agents/`, all on Haiku). |
| Sales skills | Yes (manual) | 6 adapted `sales-*` skills plus 5 web design skills in `.claude/skills/` |
| Workflows / workers / scheduler | None | |
| Integrations | None in code | Connectors are available to Claude Code sessions only (Supabase, Vercel, ElevenLabs, Gmail, Drive, Calendar, GitHub, Upwork, Notion, n8n). Production code cannot use them. |
| n8n | None for LaunchPad | The account has 6 workflows, none of them LaunchPad's. The only one tied to this repo (an email support-desk demo) is inactive and documented in `legacy/README.md`. |
| Command Center | None | |
| Lead generation | Schema only | `prospects`, `outreach_events` and `suppression` tables are written. Dedupe and normalization helpers are ported. No sourcing code. |
| Outreach | None | |
| Stripe / payments | None | No account connected, no code |
| Security | Partial | `.env` is gitignored, `.env.example` exists, and log output is redacted. No secrets in the code or the full git history (T0 sweep). RLS is designed. No auth, rate limiting or webhook verification yet, because nothing exposes an endpoint. |
| Offer catalog | Draft | `config/offerings.yaml`: voice receptionist (core) and websites (planned). All prices are `{{PRICING}}`. |

## Accounts found (read-only checks)

| Service | State |
|---|---|
| Supabase | 2 projects, both unrelated (`archive-jarvis`, a habit app). The free-tier project limit is reached. **The owner is upgrading around Fri 2026-10-02.** |
| Vercel | 3 projects, all unrelated. No LaunchPad project. |
| ElevenLabs | Connected. No agents. Voices shortlisted: Elise Hart `8fwYhwfiWkLjR4FKLHSQ` (default) and Zach `yG30oCchdy9JCUsKqYfV`. |
| Twilio, Deepgram, Stripe, Google Places, Instantly/Smartlead, Resend | Not connected and no keys provided. |

## What runs / what's broken / what's half-built

- **Runs:** the shared library and its tests; the legacy freelance app.
- **Broken:** nothing.
- **Half-built:** the database (written, not applied) and the offer catalog (no prices).
- **Missing on the revenue path:** demo phone agent, lead sourcing, outreach sending, website, payments and onboarding. See `FIRST_DOLLAR_PLAN.md`.

## Revenue readiness

**First dollar: NOT ACHIEVED. Cash collected: $0. MRR: $0.**
Leads, outreach, replies, meetings, proposals and payments: **DATA UNAVAILABLE**. No pipeline exists yet, so there are no numbers to show.
