# Jarvis Audit

**Repo:** github.com/adewaskar/jarvis · commit `1c4016a` (2026-08-05) · MIT license · 3.8 MB
**Verdict:** **NO-GO as a dependency or base.** Borrow three patterns (listed below). Copy no code wholesale.

## What it is
A single-user desktop voice assistant with a 3D "Iron Man" heads-up display.
- **Face:** React 19, Vite, Three.js/React Three Fiber with custom GLSL, MediaPipe hand gestures, and wake-word detection (Picovoice Porcupine).
- **Brain:** a local Node "bridge" (`bridge/server.mjs`) that runs the Claude Agent SDK on the user's own Claude Code login and exposes every local MCP server to the voice loop over a WebSocket.
- **Voice:** browser speech or Kokoro by default; ElevenLabs is optional.

## Scorecard

| Area | Finding | Fit for LaunchPad |
|---|---|---|
| Architecture | Local-only. The bridge must run on the owner's computer, and there is no server deployment. | ✗ Breaks cloud-first (§8) and "computer-optional" (§114). |
| Auth / billing | Runs on a personal Claude Code subscription login instead of an API key. | ✗ Not suitable for a production business service. We use API keys under our own account. |
| UI / dashboard | Holographic 3D HUD. WebGL, camera and microphone required. Desktop Chrome only. | ✗ Heavy and not mobile-friendly. The Command Center must work on an iPhone (§9). |
| Command interface | Voice-first, with wake word and interrupts. | ~ Idea only. Our natural-language control (§98) will be text-first on mobile. |
| Agents / orchestration | One Claude Agent SDK session with MCP tools. No agent registry or versioning. | ✗ Nothing reusable for §12–14. |
| Memory | Per-session only | ✗ |
| Integrations | Whatever MCP servers the local Claude Code has configured | ✗ Connectors are not production integrations. |
| Security | **Good, and worth borrowing:** WebSocket origin allow-list, read-only by default with a write gate (`decideTool`), SSRF guard at DNS lookup (`bridge/net.mjs` `vetTarget` plus `guardedLookup`), DOMPurify sanitizing (`src/ui/sanitise.ts`). | ✓ Patterns only |
| Performance | Engineered around latency: turn boundaries, filler words, streaming TTS. | ~ Pipecat already covers this for phone calls. |
| Tests | None found | ✗ |

## Patterns to reuse (rewrite in our stack; do not copy files)
1. **Default-deny tool gate:** read-only tools are always allowed, and any tool whose name reads like an effectful verb (send, pay, delete) needs an explicit grant. This maps to the §42 tool permission firewall. It goes into `lib/lp` when runtime agents get tools.
2. **SSRF guard at DNS resolution:** resolve the hostname, reject private, loopback and link-local addresses, then connect to the checked IP. This is required for the lead-gen website fetcher (T7b), which fetches untrusted prospect URLs.
3. **Origin allow-list on any WebSocket or webhook endpoint:** applies to Pipecat's Twilio WebSocket (T4), alongside Twilio signature verification.

## Not reused
The 3D HUD, gesture control, wake word, Kokoro TTS, the local bridge, and the use of a Claude Code login as a runtime.
