# Jarvis: owner assistant spec

**Status:** approved by the owner 2026-10-03. Phase J1 in progress.
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
