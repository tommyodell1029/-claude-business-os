# LaunchPad Local — operating manual for Claude Code

AI agency, Jacksonville FL (launchpadlocal.org). Core: **inbound** AI phone receptionists for local businesses. Also: websites for local businesses + add-ons. Prices APPROVED 2026-10-01 in `config/offerings.yaml` (founding pricing for first 5 clients, then standard; founding = setup paid, next month free). Only `available: true` items may be sold.
Specs: takeover spec (T0–T9) + Master Build Specification (revenue-first agency OS, 2026-09-27). Status, phase map and open spec conflicts: `docs/BUILD_STATUS.md`. Revenue path: `docs/FIRST_DOLLAR_PLAN.md`. New repos/platforms: `docs/REPOSITORY_ACQUISITION.md` gate first. This file is the short version. Keep it short.

## Output mode
- Chat replies to owner: caveman. `DONE: / WHAT_CHANGED: / TESTS: / BLOCKERS: / NEXT:`. No filler, no recaps.
- NEVER caveman in: website copy, agent prompts/scripts, outreach emails, client-facing text, docs.
- Terse never means skipping tests, security, validation, or compliance.
- Targeted edits only. Never rewrite whole files for small changes.

## Layout
| Path | What |
|---|---|
| `config/offerings.yaml` | tiers, founding/standard prices, add-ons + `available` flags (single source of truth for prices) |
| `.claude/skills/` | sales-* skills (adapted, shared guardrails) + web design skills (motion, modern-web-design, animated components, scroll reveal, lottie). Notices in `THIRD_PARTY_NOTICES.md` |
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

Tests: `uv run python -m unittest discover -s tests` (includes scripted end-to-end calls through the real Pipecat pipeline). Text call sim: `uv run python -m agents.simulate demo "caller line" ...` (needs ANTHROPIC_API_KEY or LP_ANTHROPIC_API_KEY). Python 3.11, deps via uv, exact pins in `pyproject.toml` + `uv.lock`.

## Model strategy
- Build: main session = orchestrator. Opus for architecture, complex logic (auth, security, call flow, compliance), every checkpoint audit. Sonnet for straightforward build phases. Subagents always Haiku.
- At each phase start / before each audit: tell owner which `/model` to run, list needed keys, WAIT.
- Haiku subagent fails same task twice → orchestrator takes over. Always audit subagent diffs.
- Runtime: `small` (Haiku) everywhere. `audit` model ONLY in `/audit` weekly job — never in a live call or per-prospect loop (enforced in `lp.config`).

## Website builds (ours + client sites)
- Our landing page: max 3 animated effects. Client sites: performance first (mobile Lighthouse ≥ 90 target), respect `prefers-reduced-motion`, no 3D/WebGL unless client asks.
- Pin npm versions; bundle libs — no `unpkg`/`@next`/`@latest` CDN tags in shipped code (design skills show them; don't copy).
- No fake stats, testimonials, logos, or reviews on any site.

## Revenue-first rule
Revenue > fulfillment > repeatability > automation > polish. No new framework/platform unless its matrix row says GO. Never show invented metrics — show `DATA UNAVAILABLE`.

## Hard rules (never)
- Commit secrets. `.env` gitignored; keys only via env vars; log through `lp.text.redact`. Supabase service key server-side only.
- n8n or any third-party automation tool. All post-call logic in `agents/notify/`.
- Outbound calling features. Lead gen never places calls.
- Voice agent: skip disclosure line ("...I'm their AI assistant. This call may be recorded." — FL all-party consent); invent prices, availability, or promises; answer outside client config.
- Scrape Google Maps HTML (Places API only); guess or generate email addresses; ignore robots.txt.
- Cold email via Resend; send without `{{MAILING_ADDRESS}}` + opt-out; send without checking `suppression`; remove an opt-out; exceed the Gmail outreach caps below.
- **Owner override 2026-09-27:** cold email goes out from the launchpadlocal.org Workspace inbox via the Gmail connector (risk to main-domain reputation explained and accepted). Guardrails: start 5/day, ramp to max 20/day/inbox; send Tue–Thu mornings; stop sequence on any reply/bounce/unsubscribe; pause all sending if bounce >3% or any spam complaint; plain text, no tracking pixels; connector works only in-session, so every batch is approved by owner before send.
- State anything not in prospect data. "I called you" only if `called_after_hours = true` (owner sets it).
- Fabricate stats, testimonials, logos, prices not in `config/offerings.yaml`, case studies, or client results.
- Drop tables/columns with data, delete working code (move to `/legacy`), or touch DNS MX/SPF/DKIM/DMARC.
- Merge `takeover` into main or switch voice engines without owner OK.

## Takeover status
- Snapshot: tag `pre-takeover` @ `cd6caf0` (local only — tag push blocked by proxy; same commit preserved on branch `claude/ai-business-os-wga6sr`).
- Working branch: `claude/launchpad-takeover-7xy730` (= `takeover`; session may only push this branch).
- T0 ✅ · T1 ✅ · T2 ✅ — schema applied 2026-09-28 to Supabase project `launchpad-local` (ref arekyykkzlqgphqdegsy, us-east-1). New schema changes = new migration files, never edit applied ones. Old `archive-jarvis` project: Jarvis tables deleted by owner request, project paused, owner deleting it.
- 2026-09-27 scope change (owner): full agency — voice agents + websites + add-ons on our page. Site (T6) gets services + add-ons sections. Client-website delivery workflow = new phase, TBD.
- Added: 6 sales skills (from ai-sales-team-claude, adapted) + 5 web design skills (from claudedesignskills, unmodified).
- T3 ✅ voice agent code (agents/, clients/demo.yaml); live tests need keys.
- T6 🟡 site built 2026-10-03 (landing, /terms, /privacy, /api/lead; prices from offerings.yaml; demo number hidden behind SHOW_DEMO_PHONE); needs Vercel env + redeploy. Details: `docs/BUILD_STATUS.md` T6.
- Stripe 🟡 billing code built + tested offline (`docs/STRIPE.md`); sandbox run, migration apply, webhook secret + Vercel env pending.
- T4 🟡 site on Vercel (`launchpad-site-ten.vercel.app`); transfer route verified live 2026-10-01; 2026-10-02 Pipecat agent `lp-receptionist` deployed + Ready with all secrets, demo number +19044568829 pointed at TwiML Bin `lp-demo-inbound` (verified via API). Pending: 8 live test calls (`ops/twilio/T4_TEST_CALLS.md`) + Opus checkpoint audit. Details: `docs/BUILD_STATUS.md` T4.
- T5 🟡 `agents/notify/` (Supabase + Resend + flagged SMS), `scripts/new_client.py`, `ops/onboarding.md` built + tested offline, Supabase smoke insert OK 2026-10-03; Pipecat secrets + redeploy + live call pending (`docs/BUILD_STATUS.md` T5).
- Jarvis (owner-only voice assistant, `docs/JARVIS_SPEC.md`): J1 ✅ live at `/jarvis`, Opus audit passed 2026-10-04, owner signed in on iPhone 2026-10-04. J2 Windows desktop + wake word + web push when the owner's Dell arrives.
- T7-lite 🟡 `leadgen/` (Places source → robots-safe research → score → 5 drafts, never sends) built + tested offline 2026-10-03; live run status in `docs/BUILD_STATUS.md` T7.

## Merged from old CLAUDE.md (freelance Business OS) — conflicts, target spec won
1. Scope: Fiverr/Upwork freelance ops → LaunchPad Local receptionist agency. Old app moved to `legacy/bos-freelance-ops/`.
2. n8n "optional, for webhooks" → n8n removed entirely.
3. "Python stdlib + SQLite only" → Python (uv, pinned) + Supabase + Next.js.
4. Outreach "send only after approval task" → `review_mode` + `/admin/review` page; auto-send allowed only when `review_mode: false`.
5. Kept unchanged: no fabrication, no secrets, no scraping, CAN-SPAM address + opt-out enforcement, prepare-then-approve for irreversible actions.
