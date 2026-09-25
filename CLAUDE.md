# AI Business OS — operating manual for Claude Code

Local-first business OS for a freelance AI-automation business (Fiverr + Upwork).
Python stdlib + SQLite only. n8n optional, never core.

## Output mode (compact / "caveman")
Terse. No preamble, no recap. Report phases as:
`DONE: / WHAT_CHANGED: / TESTS: / BLOCKERS: / NEXT:`
Terse never means skipping tests, security, validation, or compliance checks.

## Files (keep it this small — ask "is a new file necessary?" first)
- `config.toml` — ALL config: pricing, scoring weights, approval rules, fees, outreach timing, cost limits.
- `templates.toml` — seed template library (proposals, outreach, playbooks, gig copy). Loaded into DB on first run.
- `bos/core.py` — config, SQLite schema/migrations, audit log, secret redaction, approval gate, task queue + retries.
- `bos/biz.py` — opportunities, scoring, proposals, leads, outreach, fulfillment, portfolio, finance, analytics, research, Fiverr.
- `bos/__main__.py` — orchestrator CLI, dashboard, daily priorities, costs, n8n report, audit, optimize, NL router.
- `tests/test_bos.py` — `python -m unittest tests.test_bos`
- `data/bos.db` — runtime DB (gitignored, chmod 600).

## Commands  (`python -m bos <cmd>`)
| Slash intent | Command |
|---|---|
| /status /daily | `status`, `daily` (command center + today's priorities) |
| /tasks | `tasks [STATUS]`, `run` (process queue by priority) |
| /upwork /proposals | `opp import jobs.json` → `run` (auto score → draft) or `score all` / `propose qualified` → `review` → `proposal show ID` → `proposal edit ID file.txt` → `approve TASK` → submit manually → `opp submitted OPP --connects N` → `opp set OPP RESPONSE_RECEIVED --response "..."` / `WON` / `LOST` |
| /fiverr | `fiverr <service>` (gig draft → approval), `metric fiverr impressions 120` |
| /research | `research [service]` (only from stored listings; reports sample size) |
| /leads | `leads import f.csv --niche X --location Y [--source S]`, `leads add '{json}'`, `leads list/show` |
| /outreach | `outreach draft LEAD`, `outreach due`, `outreach show ID`, `outreach send ID` (gate), `outreach mark ID SENT/REPLIED/BOUNCED/NEGATIVE/...` |
| /clients /fulfill | `intake '{"client":{...},"project":{"service":"n8n","price":99,...}}'`, `projects`, `advance PROJECT` |
| /portfolio | `portfolio add '{"title":..,"kind":"DEMO","service":..}'`, `portfolio list` |
| /finance | `txn revenue 99 --service n8n --platform upwork` (fee auto-booked), `txn api 2.5`, `finance [--days 7]`, `recurring [ID ACTIVE/ENDED]` |
| /analytics | `analytics` |
| /costs /n8n | `costs`, `n8n`, `n8n-record NAME [--count N]` |
| /audit /optimize | `audit` (never deletes), `optimize [--days 7]` |
| /templates | `templates <query>` — search BEFORE building anything new |
| natural language | `ask "..."` prints the command plan; Claude then executes it |
| approvals | `review`, `approve TASK [note]`, `reject TASK [note]` |

Opportunity JSON fields: `platform, url, external_id, client, client_info{payment_verified,hire_rate,total_spent,rating}, title, description, budget|budget_min|budget_max, budget_type(fixed|hourly), skills[], connects`.
Lead signals (`;`-separated in CSV `signals` column): `missed_calls, no_online_booking, slow_response, no_lead_capture, weak_website, no_website, manual_spreadsheets, no_crm`.

## Operating loop (every task)
1. Understand goal → 2. `templates`/DB check for existing work → 3. do it locally (Claude Code / `bos`) →
4. existing permitted connector → 5. n8n only for webhooks/cloud triggers → 6. paid service last →
7. prepare external actions as approval tasks → 8. test → 9. record (`txn`, `opp set`, `outreach mark`) → 10. note cheaper/faster next time.

## Proposals
`propose` builds a structured, job-specific draft + lint. Claude then rewrites it in a specialist voice
(concise, reference client's words + tech, real plan, real price, 2–3 questions), saves via `proposal edit`,
and re-checks lint = clean. Never claim results/case studies that aren't in `portfolio` with the right kind.

## Hard rules (never)
- Send, submit, publish, spend, accept, deploy, delete, or change credentials without an approved `approval` task.
- Scrape Fiverr, automate Fiverr/Upwork via browser bots, bypass CAPTCHA/rate limits/Connects, mass-message.
- Fabricate contacts, metrics, reviews, case studies, or client results. DEMO ≠ CASE_STUDY ≠ PAID_CLIENT_WORK.
- Store passwords; commit or log secrets. Credentials only via env vars / OAuth connectors (`core.secret()`).
- Cold email without `business.postal_address` + opt-out line (enforced).
- Treat the scoring model as a win predictor — it's internal prioritization only.

## Connectors (check availability each session; prefer official)
- Upwork: official connector attached (`integration = "mcp"`, org_uid 1829188020867004498, Freelancer Basic).
  Find: `find_jobs` search/smart_search → `get` top picks (connects_cost, totalHired, client_record) → save raw rows
  (search row + `connects_cost,total_hired,hire_rate_percent,screening_questions`) to JSON → `opp import`.
  Record balance first: `metric upwork connects_balance N`. Skip jobs where applied=true or totalHired>0.
  Submit: `approve` → `manage_proposals` preview → show user → `confirm_preview` only on explicit OK. `auto_submit = false`.
- Fiverr: no seller API → drafting + manual metrics only.
- Gmail MCP: read/categorize, create DRAFTS only. Sending requires `approve`.
- Drive MCP: client assets, deliverables, portfolio.
- n8n MCP: build/test client workflows; log usage with `n8n-record`; `n8n` shows limit + migration plan.
