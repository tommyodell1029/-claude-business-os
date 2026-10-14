# Launchpad Local business module (inside ULTRON / Money OS)

Started 2026-10-13 by owner ("ULTRON business launch mode"). Goal: the first paying customer for a **$499 one-page website**, testing plumbing and HVAC in Jacksonville first. Price, niche and offer are hypotheses: change `config/offerings.yaml` → `services.website_starter`, never hard-coded copy.

This is a module inside the existing system, not a new platform. It uses the same Supabase project, the same ULTRON tool and confirm gate, the same /os screen, the same lead-gen CLI and the same Next.js site.

## What ULTRON actually is (inspected 2026-10-13)
- **ULTRON** (`/jarvis`, `site/lib/jarvis/*`) is **one** Claude tool-using agent (runtime model: `small`).
  - **Read tools** run immediately.
  - **Write tools** never act directly: they create a `jarvis_actions` row that the owner must confirm within 2 minutes (`gate.ts`). The allowed write tools are also enforced by a database check constraint.
  - There is **no multi-agent runtime**. The "specialist agents" below are code modules that ULTRON (or a Claude Code session) calls. That's the reliable path today.
- **Background jobs:** none run unattended for this business. Lead gen, audits and drafts are run from Claude Code sessions (`python -m leadgen ...`), and the owner triggers ULTRON actions.
- **Interface:** `/os` (Money OS, phone-friendly) and `/jarvis` (ULTRON chat and voice), owner sign-in only.

## Specialist responsibilities → where they live
| Role | Implemented as | Status |
|---|---|---|
| ULTRON (chief operator) | `launchpad_status` (read) + `set_prospect_stage` (write, confirm-gated) tools; persona rules | Implemented, tested (unit). Live once deployed. |
| Research | `leadgen` scout (Google Places API → robots-safe site research) | Existing, live-tested Oct 6 |
| Lead qualification | `leadgen/audit.py` → `website_fit` 0–100 + stage + `qualification_notes` | Implemented, tested, **run on 53 real plumbing/HVAC leads** |
| Website audit | `leadgen/audit.py` (HTML, robots-respecting) + `leadgen/verify_audit.mjs` (real-browser re-check that drops findings the rendered page contradicts) | Implemented, run; 7 false findings removed by the browser pass |
| Sales preparation | `leadgen/website_outreach.py`: per-lead packet (verified findings, owner call script, or email draft only to a verifier-confirmed address) → `outreach_events` drafted/pending + `ops/launchpad/packets/*.md` | Implemented, tested, 3 packets pending approval |
| Website production | `sites/template.mjs` + `sites/build.mjs` (one self-contained HTML file per client from `sites/clients/<slug>.json`) | Implemented; concept site built |
| QA | `sites/qa.mjs` (Playwright: mobile/desktop, overflow, tel links, title/description, H1, alt, viewport, form endpoint, tap targets, console errors) | Implemented; concept passes 14/14 |
| Client operations | `client_projects` table + `ops/launchpad/ONBOARDING.md`, `DELIVERY.md`, `HANDOFF.md` | Table live; no clients yet |
| Finance & cost | `revenue_entries` (venture "Launchpad Local websites"), existing AI cost tracking; quotes in `client_projects` | Existing; Launchpad revenue $0 |

## Finding businesses and decision makers (owner standing workflow, 2026-10-14)
1. **Find the company:** Google Places API only (`python -m leadgen discover` / Places source). Never scrape Maps HTML.
2. **Find the decision maker:** Apollo and Hunter, free plans only, through the connected MCP tools.
   - Hunter Free: 50 searches + 100 verifications per month (resets on the 13th). Use Domain Search when the business has a website; it only spends a credit when emails come back.
   - Apollo Free: organization lookup is free. People search is **not available on the Free plan** (API_INACCESSIBLE, checked 2026-10-14). People match/enrichment and organization search spend credits (180 available on 2026-10-14) and need the owner's OK, with the cost shown first.
   - First run (2026-10-14, current 15 leads): Hunter found nothing for plumbingjacksonville.com (Rolland Reash). For aldridgesonsplumbing.com it found only a generic `admin@` address on an accept-all domain, so deliverability can't be confirmed and it is not a decision maker; Aldridge stays phone-only. Apollo's free lookup had no record of Rooter Express of Jax. Expect one- or two-truck shops without a website to be missing from both tools; the phone call is how we reach the owner.
   - No paid upgrades or extra credits without the owner's OK.
3. **Store:** the decision maker's name, title and source go on the prospect (`decision_maker_*` columns, `qualification_notes`). The call script then says "ask for <name>".
4. **Email rule unchanged:** a provider-found email can be used for a first touch only after an independent verifier marks it deliverable. Never build an address from a name pattern. Unverified or no email → phone only.

## Approval gate (enforced in code, not just prompts)
- **ULTRON can't send anything.** Its tool list has no send, call, DNS, deploy, payment or delete tool (`tools.ts` header). Its only Launchpad write is a confirm-gated stage change, and the database rejects any tool not in the check constraint.
- **Lead gen never sends.** It writes `outreach_events` drafted/pending only. Email sending happens only after the owner approves a draft in a session, via the Gmail connector, under the CLAUDE.md caps, and is reconciled by `gmail_sync`. First touches only go to verifier-confirmed addresses, and every email has the mailing address and opt-out (validated in code). Phone contact is done by the owner. The system never places calls.
- **Deploys:** pushing this branch creates a Vercel *preview* only. A production deploy is a separate, explicit step that needs the owner's OK (see "Awaiting approval" below). Client sites go live only after the client's written approval plus the owner's approval, recorded in `client_projects.approvals`.
- **Money:** no charge, refund, paid API run or new subscription without the owner's OK. Stripe stays as is: live, with receptionist products archived; no website product is created yet.

## Data (stable ids, exportable)
- `prospects` (+ `pipeline_stage` with 14 stages, `website_audit` jsonb, `audit_at`, `website_fit`, `qualification_notes`, `next_follow_up`, `outcome`, `offer`): migration `20261013000001_launchpad_websites.sql`
- `client_projects`: scope, status, deposit/balance, assets, preview, QA, revisions, approvals, deploy, handoff, maintenance
- `outreach_events` (existing): website packets have `payload.offer = "website"` and `payload.channel`
- `revenue_entries` (existing): venture `Launchpad Local websites`
- **Export:** `uv run python scripts/export_launchpad.py` → `exports/launchpad-<date>.json` (schema `launchpad/1`, gitignored)

## Phone-friendly use
`/os` → Launchpad tab:
- objective, status, revenue
- next action and blockers
- pipeline counts (`DATA UNAVAILABLE` when a table can't be read)
- audit-ready leads with tap-to-call, verified findings and contact path
- client projects

Read packets in `ops/launchpad/packets/`. Approve or skip them in chat, or tell ULTRON "move X to contacted, follow up Friday" (confirm needed).
Desktop still needed: nothing for daily use. Running lead gen or audits needs a Claude Code session, which also works from the phone app.

## Run log
- 2026-10-14: owner approved the production deploy (dpl_BhjFkVDw…, commit bb518c6). Live QA on launchpadlocal.org passed (offer, sample and terms pages: 200, no overflow, no console errors).
- 2026-10-14: owner approved discovery. Places Text Search: plumbing + HVAC in Orange Park, Fleming Island and Jacksonville, 9 API calls (cap 12), 120 results upserted (duplicates merged by place_id). 72 newly audited plus the browser re-check. 15 leads are now awaiting approval (12 with no website, 3 with verified site problems). 2 non-targets removed: a realtor whose surname is Plummer, and a handyman. No paid email lookups were run.

## Status (2026-10-14)
- **Implemented and tested:** offer config, offer page and concept site (local build, Playwright QA), audit and verification, packets, overview, ULTRON tools, migrations (applied), export, docs.
- **Deployed:** database migrations, and site + ULTRON + /os Launchpad tab are in production (owner-approved 2026-10-14).
- **Awaiting the owner:**
  1. Approve the production deploy of the new homepage, sample site and /os tab.
  2. Approve or skip the 3 call packets.
  3. Approve new Places API discovery of no-website plumbing/HVAC businesses. It's within the free monthly credit, but it's still paid-API use.
  4. When there's a first "yes", create a Stripe test-mode website product and deposit invoice, then live.
- **Known gaps:**
  - Client-site form endpoint (needed before the first real launch).
  - No unattended scheduler (runs are session-triggered).
  - The ULTRON overview hasn't been exercised against production yet.

## StarNet later (practical plan)
StarNet (androoagi/starnet) was NO-GO as a base (`docs/REPOSITORY_ACQUISITION.md`, 2026-10-02): it's a local desktop app. If the owner adopts it as the orchestration layer:
1. Keep Supabase as the system of record. StarNet agents call the same interfaces instead of their own storage:
   - `python -m leadgen audit|website-drafts`
   - `node sites/build.mjs` and `node sites/qa.mjs`
   - the `/api/jarvis/*` tools
2. Map each specialist row above to one StarNet agent with the same inputs and outputs. Their contracts are the CLI arguments, the JSON results, and the table columns listed here.
3. **The approval gate stays server-side** (`jarvis_actions` + check constraint + no send tools). StarNet gets no credentials that can send, deploy or charge.
4. **Migration:** run `scripts/export_launchpad.py`, import into StarNet only if it needs a local cache, and keep ids unchanged.
