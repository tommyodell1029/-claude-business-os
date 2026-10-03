# Repository Acquisition Process

Every external repository, package or platform goes through this checklist **before** it is added. Record the result as a row in `REPOSITORY_INTEGRATION_MATRIX.md`. A tool is never added because it is popular, free or impressive.

## Gate (all must pass for GO)
1. **Need:** names the revenue, fulfillment, security or reliability problem it solves, and confirms we don't already solve it well enough.
2. **License:** permits our use. MIT, Apache-2.0 and BSD are fine. AGPL, BUSL, FSL and SSPL need a note explaining why our use is allowed (internal tool, or hosted SaaS we only consume).
3. **Activity:** a commit in the last 90 days and a responsive issue tracker.
4. **Security:** known vulnerabilities checked; what data it receives (PII? transcripts? keys?); where that data is stored.
5. **Dependencies:** size of the added dependency tree; whether it conflicts with pinned versions.
6. **Cost:** at our volume now, and at 10× that volume.
7. **Lock-in:** can it sit behind an interface (§105), and what happens if it disappears (§10 of the §130 checklist)?
8. **Cloud and mobile:** runs without the owner's computer.
9. **Sandbox test:** installed on a branch, exercised by a test, then removed cleanly.
10. **Decision:** GO, NO-GO or DEFER, recorded with a named revisit trigger (for DEFER).

## Where things go
- Claude Code skills: `.claude/skills/<name>/`, with a notice in `THIRD_PARTY_NOTICES.md`.
- Code borrowed from another repo: rewritten into our modules. Keep a notice if any code is copied.
- Packages: exact pins in `pyproject.toml` / `package.json`, lockfile committed.
- Anything replaced: moved to `/legacy` with a one-line reason.

## Log of decisions made so far
| Date | Item | Decision |
|---|---|---|
| 2026-09-27 | zubair-trabzada/ai-sales-team-claude | GO (partial): 6 skills adapted. Contact finder, scraping scripts and outreach skill rejected (email guessing, TLS verification off, no robots.txt check). |
| 2026-09-27 | freshtechbro/claudedesignskills | GO (partial): 5 web skills. 3D/WebGL skills rejected (performance on local-business sites). |
| 2026-09-27 | adewaskar/jarvis | NO-GO. 3 patterns borrowed (see `JARVIS_AUDIT.md`). |
| 2026-09-27 | 21 platform candidates (§18) | See `REPOSITORY_INTEGRATION_MATRIX.md` |
| 2026-10-02 | androoagi/starnet (v0.12.5, MIT, single maintainer, 3.3 GB) | NO-GO as a replacement or base. It is a local-first desktop app (Windows/macOS) with a pixel-art UI for running personal AI agent teams; it runs on the owner's computer, has no telephony/voice-receptionist, client hosting, or billing for clients, so it fails cloud-first/mobile-first (§8–9) and would duplicate Claude Code. Revisit only as an optional owner-side assistant after first revenue. |
| 2026-10-03 | Jarvis owner assistant (own build, `docs/JARVIS_SPEC.md`) | GO by owner request. Built on the existing stack (Next.js site, Supabase, Deepgram, ElevenLabs, Claude `small`); no new platform in J1. The J2 wake-word library must pass this gate before install. `adewaskar/jarvis` stays NO-GO as a base. |
