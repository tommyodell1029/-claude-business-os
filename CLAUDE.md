# LaunchPad Local — operating manual for Claude Code

AI receptionist agency, Jacksonville FL (launchpadlocal.org). We sell **inbound** AI phone receptionists to local businesses.
Full target spec lives in the takeover prompt; this file is the short version. Keep it short.

## Output mode
- Chat replies to owner: caveman. `DONE: / WHAT_CHANGED: / TESTS: / BLOCKERS: / NEXT:`. No filler, no recaps.
- NEVER caveman in: website copy, agent prompts/scripts, outreach emails, client-facing text, docs.
- Terse never means skipping tests, security, validation, or compliance.
- Targeted edits only. Never rewrite whole files for small changes.

## Layout
| Path | What |
|---|---|
| `config/models.yaml` | ALL runtime model IDs. Code reads via `lp.config.model(role, component)` |
| `lib/lp/` | shared Python: `text` (norm_phone E.164, norm_email, domain_of, redact), `retry`, `config` |
| `agents/` | Pipecat voice agent — ONE template, config from `clients/<slug>.yaml` |
| `agents/notify/` | post-call handler: Supabase → Twilio SMS → Resend. Schema doc in README |
| `clients/` | one YAML per client; `demo.yaml` powers the website demo number |
| `leadgen/` | Places sourcing → research → score → personalize → send → replies. Schema doc in README |
| `audit/` | weekly quality/compliance audit (only place the `audit` model is allowed) |
| `site/` | Next.js marketing site + `/api/lead` + password-protected `/admin/review` |
| `ops/` | onboarding, client intake, outreach templates |
| `supabase/migrations/` | additive SQL only; RLS on, no policies, service role only |
| `.claude/agents/` | Haiku subagents: builder, tester, docs-writer, researcher |
| `legacy/` | replaced code kept until owner approves removal (see `legacy/README.md`) |

Tests: `python3 -m unittest discover -s tests`. Python 3.11, deps via uv, exact pins in `pyproject.toml`.

## Model strategy
- Build: main session = orchestrator. Opus for architecture, complex logic (auth, security, call flow, compliance), every checkpoint audit. Sonnet for straightforward build phases. Subagents always Haiku.
- At each phase start / before each audit: tell owner which `/model` to run, list needed keys, WAIT.
- Haiku subagent fails same task twice → orchestrator takes over. Always audit subagent diffs.
- Runtime: `small` (Haiku) everywhere. `audit` model ONLY in `/audit` weekly job — never in a live call or per-prospect loop (enforced in `lp.config`).

## Hard rules (never)
- Commit secrets. `.env` gitignored; keys only via env vars; log through `lp.text.redact`. Supabase service key server-side only.
- n8n or any third-party automation tool. All post-call logic in `agents/notify/`.
- Outbound calling features. Lead gen never places calls.
- Voice agent: skip disclosure line ("...I'm their AI assistant. This call may be recorded." — FL all-party consent); invent prices, availability, or promises; answer outside client config.
- Scrape Google Maps HTML (Places API only); guess or generate email addresses; ignore robots.txt.
- Cold email from launchpadlocal.org or via Resend; send without `{{MAILING_ADDRESS}}` + one-click unsubscribe; send without checking `suppression`; remove an opt-out.
- State anything not in prospect data. "I called you" only if `called_after_hours = true` (owner sets it).
- Fabricate stats, testimonials, logos, pricing (use `{{PRICING}}`), case studies, or client results.
- Drop tables/columns with data, delete working code (move to `/legacy`), or touch DNS MX/SPF/DKIM/DMARC.
- Merge `takeover` into main or switch voice engines without owner OK.

## Takeover status
- Snapshot: tag `pre-takeover` @ `cd6caf0` (local only — tag push blocked by proxy; same commit preserved on branch `claude/ai-business-os-wga6sr`).
- Working branch: `claude/launchpad-takeover-7xy730` (= `takeover`; session may only push this branch).
- T0 ✅ audit · T1 ✅ gap report · T2 ⏳ foundation (migrations written + tested on local PG16; not yet applied — Supabase project TBD)
- Next: T3 voice agent (Pipecat + Flows, demo client).

## Merged from old CLAUDE.md (freelance Business OS) — conflicts, target spec won
1. Scope: Fiverr/Upwork freelance ops → LaunchPad Local receptionist agency. Old app moved to `legacy/bos-freelance-ops/`.
2. n8n "optional, for webhooks" → n8n removed entirely.
3. "Python stdlib + SQLite only" → Python (uv, pinned) + Supabase + Next.js.
4. Outreach "send only after approval task" → `review_mode` + `/admin/review` page; auto-send allowed only when `review_mode: false`.
5. Kept unchanged: no fabrication, no secrets, no scraping, CAN-SPAM address + opt-out enforcement, prepare-then-approve for irreversible actions.
