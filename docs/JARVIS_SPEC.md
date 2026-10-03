# Jarvis: owner assistant spec

**Status:** approved by the owner 2026-10-03. Phase J1 built 2026-10-03 (code, tests, migration applied). Not live yet: it needs the Vercel settings and Supabase sign-in settings below, then a redeploy. Web push notifications moved to J2.
**What it is:** a private voice assistant for the LaunchPad Local owner, modeled on J.A.R.V.I.S. from the Iron Man films. It is not client-facing and is separate from the client voice receptionist (`agents/`).
**Not related to** `adewaskar/jarvis` (NO-GO as a base, see `JARVIS_AUDIT.md`). This is our own build on our existing stack. Three security patterns from that audit are reused: an origin allow-list, read-only by default with a write gate, and sanitizing anything displayed.

## Owner decisions (2026-10-03)
| Decision | Choice |
|---|---|
| Computer | Dell all-in-one (Windows), arriving end of October 2026 |
| Autonomy | Reads freely. Anything that sends, spends or changes something asks first ("Shall I send it, sir?") and waits for a spoken or tapped yes. |
| Voice | A newly designed calm, dry, British male butler voice (ElevenLabs Voice Design). Never a clone of a real actor. Owner picked preview 2 on 2026-10-03: saved as "Jarvis (LaunchPad owner assistant)", voice ID `euOF59BzPog7CSdGw7jW` (set as `JARVIS_VOICE_ID`). |
| Timing | Start now on the phone (J1). Add the desktop app with the "Jarvis" wake word when the computer arrives (J2). |

## Movie behaviors and what we build
| In the films | Our version | Phase |
|---|---|---|
| Always listening for "Jarvis" | Wake word on the Dell (open-source wake-word model, gated per `REPOSITORY_ACQUISITION.md` before install). Push-to-talk on the phone. | J2 / J1 |
| Calm, witty British butler who calls Tony "sir" | System persona: concise, dry wit, unflappable, addresses the owner as "sir" (configurable). Never jokes about bad news. | J1 |
| Holographic HUD | Full-screen animated HUD: arc-reactor voice orb that pulses with speech, cyan-on-black panels, live tiles. Respects reduced-motion. A real hologram is not possible; a screen is. | J1 (phone), J2 (desktop full screen) |
| Morning briefing | "Good morning, sir." Calls since yesterday, urgent calls, new leads, outreach replies, drafts waiting, today's calendar, system health. Unknown values are spoken as "data unavailable". | J1 |
| Answers anything about the operation | Questions over our data: calls, leads, prospects, outreach events, clients, payments. Read-only queries through server-side tools. | J1 |
| "Run diagnostics" | Health check: Pipecat agent, demo number routing, Vercel site, Supabase, Resend domain, last call saved. | J1 |
| Does tasks when asked | Approve or skip outreach drafts, create Gmail drafts, run lead research, add notes and reminders, each behind the confirmation gate. All business rules still apply (Tue–Thu, daily caps, suppression, no outbound calls, no DNS changes). | J1 (drafts, notes), J3 (more) |
| Speaks up on its own | Proactive alerts: urgent call, new lead, reply to outreach, system down. Push notification on the phone; spoken on the desktop. | J1 (notifications), J2 (spoken) |
| Controls the house, the suit, the lab | Not possible with our stack. Smart-home control could be added later only if the owner wants it and a platform passes the gate. | — |

## Architecture
- **Where it lives:** `/jarvis` on the existing Next.js site (`site/`), installable as a phone app (PWA). The J2 desktop app is a thin Windows wrapper around the same page, plus a local wake-word helper.
- **Sign-in:** Supabase Auth magic link for the owner only (decision C5). One allow-listed email. Every API route checks the session server-side. The service-role key never reaches the browser.
- **Voice loop:** browser microphone → Deepgram streaming speech-to-text → Claude (`small` role, component `jarvis`, through `lp.config.model`) with tool calls → ElevenLabs text-to-speech in the Jarvis voice. Keys stay server-side; the browser gets short-lived tokens or proxied streams only.
- **Tools:** read tools (query business tables, health checks, calendar) run freely. Write tools return a pending action that runs only after the owner confirms. Every action, confirmed or not, is logged to a new `jarvis_actions` table (additive migration, RLS on, service role only).
- **Memory:** short notes and owner preferences in a `jarvis_memory` table, owner-editable. No call recordings or transcripts are stored by Jarvis.
- **Cost:** speech-to-text, text-to-speech and model usage are billed per use. Real numbers are measured during J1 and recorded here; none are estimated in advance.

## Phases
- **J1 (now, phone):** sign-in, HUD with live tiles, push-to-talk voice, Jarvis persona, morning briefing, read tools, diagnostics, draft approve/skip with confirmation, action log, phone notifications.
- **J2 (when the Dell arrives):** Windows desktop app, "Jarvis" wake word, always-on full-screen HUD option, spoken proactive alerts, startup on boot.
- **J3 (after first revenue):** Gmail reply triage, calendar booking, starting build sessions by voice, weekly business review.

## Hard limits
- Never sends, spends, deletes or changes anything without the owner's confirmation.
- Never bypasses CLAUDE.md rules: outreach caps and days, suppression, no outbound calls, no DNS changes, no invented numbers.
- Owner only. No client or prospect ever talks to Jarvis.

## J1 as built (2026-10-03)
- **Page:** `/jarvis` (installable on the iPhone home screen). Full-screen HUD: six live tiles (calls today, urgent today, website leads in 7 days, drafts awaiting approval, replies in 7 days, system health), the arc-reactor orb (2D canvas, no WebGL, still under reduced motion), push-to-talk (hold, or tap to start and tap to stop), a typing box, and the transcript of both sides. Any value that cannot be read shows DATA UNAVAILABLE.
- **Sign-in:** the owner enters his email; only `JARVIS_OWNER_EMAIL` is ever passed to Supabase. The email has a link and a 6-digit code. The code works inside the installed app (an iPhone home-screen app cannot receive a link opened in Safari). The session is kept in secure HttpOnly cookies. Every `/api/jarvis/*` route re-checks the session and the owner email on the server, and refuses requests from other sites.
- **Voice:** the phone records one clip per press and sends it to our server, which sends it to Deepgram. Replies are spoken by ElevenLabs through our server. The browser never holds a key. Until `JARVIS_VOICE_ID` is set, Jarvis uses the stock ElevenLabs voice "George" and logs that it is doing so.
- **Brain:** Claude, with the model taken from `config/models.yaml` (role `small`, component `jarvis`). The persona is in `site/lib/jarvis/persona.ts`. Read tools: briefing, calls, website leads, prospects, outreach events, clients, saved notes, diagnostics. Write tools: approve or skip an outreach draft, save a note. A write only creates a pending action; it runs after the owner says "yes" or taps Confirm, for that exact action, within two minutes. Approving a draft does not send it. Every proposed action and its outcome is logged in `jarvis_actions`.
- **Diagnostics:** database, last call saved, website, Resend domains, Pipecat agent and Twilio demo number. A check without its key reports "unavailable". The Pipecat check has not yet been tested against the live account.
- **Not in J1:** web push notifications (moved to J2), calendar (the briefing says "data unavailable"), and Gmail drafts.
- **Measured 2026-10-03 (local server, live APIs):** ElevenLabs sent its first audio after 0.3 s; Deepgram transcribed a test clip word for word in 0.55 s. The Claude step was not run live because this session had no Anthropic key; it is covered by tests with a fake API.

## Owner setup for J1 (on the iPhone, about 15 minutes)
**A. Supabase sign-in settings** (supabase.com, sign in, open project **launchpad-local**)
1. Tap the menu, then **Authentication**, then **URL Configuration**.
2. Set **Site URL** to `https://launchpad-site-ten.vercel.app` (change it to `https://launchpadlocal.org` once the site moves there).
3. Under **Redirect URLs**, tap **Add URL**, enter `https://launchpad-site-ten.vercel.app/jarvis`, and save. Add `https://launchpadlocal.org/jarvis` too when the domain moves.
4. Go to **Authentication**, then **Emails** (email templates), then **Magic Link**. Add this line to the message body: `Your code: {{ .Token }}`. Save.
5. Go to **Project Settings**, then **API Keys**. Copy the **anon** (or **publishable**) key; you need it for step B. Never copy the service_role or secret key into anything new.
6. After you have signed in to Jarvis once, go to **Authentication**, then **Sign In / Providers**, and turn off **Allow new users to sign up**. Jarvis refuses anyone except you either way; this simply stops strangers from creating accounts at all.

**B. Vercel settings** (vercel.com, project **launchpad-site**, **Settings**, then **Environment Variables**; add each one for Production, then redeploy)
- Required, new: `JARVIS_OWNER_EMAIL` (your own email), `SUPABASE_ANON_KEY` (from A5), `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`.
- Required, already set for the site: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Check that they are present.
- Required, new: `JARVIS_VOICE_ID` = `euOF59BzPog7CSdGw7jW` (the designed Jarvis voice; if it is missing, the stock voice is used).
- Optional: `JARVIS_ALLOWED_ORIGINS` (for example `https://launchpad-site-ten.vercel.app,https://launchpadlocal.org`; when unset, only the site's own address is allowed), `JARVIS_ADDRESS` (how Jarvis addresses you; default "sir"), and for diagnostics `TWILIO_ACCOUNT_SID`, `DEMO_TWILIO_NUMBER`, `PIPECAT_API_KEY`. `RESEND_API_KEY` and `TWILIO_AUTH_TOKEN` are already set. If the Resend key can only send, the domain check reports "unavailable".
- Not needed: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The browser never talks to Supabase.

**C. Install on the iPhone**
1. In Safari, open `https://launchpad-site-ten.vercel.app/jarvis`.
2. Tap **Share**, then **Add to Home Screen**, then **Add**.
3. Open **Jarvis** from the home screen. Enter your email, tap **Send sign-in email**, and type the 6-digit code from the email.
4. Hold **Hold to talk** and allow the microphone when asked. Try "Brief me".
