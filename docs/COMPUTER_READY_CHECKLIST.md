# Before the computer: owner checklist

The owner moves Oct 24–25 or Oct 31–Nov 1, 2026, and gets the Dell then. Finish this list before the computer build starts. Tick items off as they're done.

## 1. Before Oct 22 (the experiments end that day)
- [ ] Post the remaining story videos on schedule: P2 Sun, V3 Mon, P1 Tue, V2 Wed, P3 Thu, P5 Fri.
- [ ] Oct 15, Day 7 review: write down Etsy Stats (views, favorites, sales per listing), Gumroad Analytics (views, sales per pack), and TikTok/IG/YouTube views per video.
- [ ] Record every sale in /os → Settings → Record revenue (or tell ULTRON "record $X from Etsy").
- [ ] Oct 22, Day 14 decision for both experiments, using the decision rules in the content-plan PDFs. Mark each one validated or killed in /os → Experiments, with a one-line result note.
- [ ] Run Social Radar at least twice on different days, so there are trends to compare.
- [ ] Tell Claude what you changed in the Etsy listings, so the listing sheets match the live shop.

## 2. Close out Money OS Phase 1
- [ ] Open launchpadlocal.org/os on the iPad once and check that it loads and you can sign in. This is the last Phase 1 check.
- [ ] Sign off `docs/money-os/PHASE_1_COMPLETE.md` by telling Claude "Phase 1 signed off".
- [ ] Keep using ULTRON and /os daily. Phase 2 decisions (for example local vs cloud AI) need about 30 days of data, which runs from Oct 8 to about Nov 7. If the computer arrives earlier, setup and J2 can start right away, and the data-driven decisions wait until Nov 7.

## 3. Accounts and logins (do on the phone now)
Have each of these working, with 2-factor login, in a password manager (Apple Passwords, Bitwarden or 1Password):
- [ ] **Code and hosting:** GitHub, Vercel, Supabase, Anthropic console (API keys and billing).
- [ ] **APIs:** Google Cloud (Places and YouTube keys), Stripe, Twilio, Pipecat Cloud, Resend.
- [ ] **AI tools:** ElevenLabs, Higgsfield.
- [ ] **Shops:** Etsy, Gumroad.
- [ ] **Social:** Pinterest, TikTok, Instagram, YouTube.
- [ ] **Email:** the launchpadlocal.org Google Workspace.
- [ ] Recovery codes for each saved somewhere safe, not in this repo and not in chat.
- [ ] Never paste API keys in chat. They stay in Vercel, or in a local `.env` file on the computer that is never committed.

## 4. Files to save off the phone
Save these to iCloud Drive or Google Drive, so the computer can get them:
- [ ] Etsy upload kit, Gumroad upload kit, Pinterest pins, all video zips (story, UGC, original).
- [ ] The content-plan PDFs and `tiktok-ig-week-1.md`.
- [ ] Everything else is already in GitHub (branch `claude/launchpad-takeover-7xy730`).

## 5. Leftover agency items (only if a prospect says yes)
The receptionist business is wound down (owner decision 2026-10-08). Only these matter, and only if one of the 9 emailed prospects replies positively:
- [ ] Restore the matching Stripe product (`active=true`).
- [ ] Do test calls 2–8 (`ops/twilio/T4_TEST_CALLS.md`) and the T5 live call.
- [ ] Turn on SHOW_DEMO_PHONE.
- [ ] Otherwise nothing to do. Keep checking replies (ULTRON's briefing shows them).

## 6. Decide before the build (Claude needs these answers)
- [ ] **First computer build:** J2 (ULTRON as a Windows desktop app with a "Jarvis"/"ULTRON" wake word and spoken alerts), or Phase 2 slice 2 (a starter-kit offer built from the best Social Radar trend, with Stripe checkout)? Recommended: slice 2 first, because it's revenue, then J2.
- [ ] **Instagram:** add it to Social Radar or not? If yes, link @launchpadlocal to a Facebook Page and create a Meta developer app. Approval can take days.
- [ ] **Budget:** confirm the monthly AI budget and the Higgsfield/ElevenLabs credit plan for videos (about 37.5 Higgsfield credits per story video).

## 7. The day the Dell is set up (about 1 hour, Claude walks you through it)
- [ ] Windows updates, then install: Git, Node.js 22 LTS, Python 3.11, uv, ffmpeg, VS Code (optional).
- [ ] Install Claude Code (desktop app or CLI) and sign in.
- [ ] Clone the repo, check out `claude/launchpad-takeover-7xy730`, and run the tests:
  - `cd site && npm install && npm test`
  - `uv run python -m unittest discover -s tests`
- [ ] Create a local `.env` from `.env.example` (keys copied from each dashboard, never from chat).
- [ ] Tell Claude: "computer is set up, start J2" (or "start slice 2").
