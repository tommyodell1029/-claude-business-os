# Demo number cut-over: TwiML Bin → signed webhook + Pipecat token auth

Why: with `websocket_auth = "none"`, anyone who learns the service host can start billed agent sessions. After this cut-over, only a call that Twilio really signed gets a one-time Pipecat session token (5 minutes, single use, bound to `lp-receptionist`).

How it works: Twilio POSTs the call to `https://launchpad-site-ten.vercel.app/api/twilio/inbound`. The site checks `X-Twilio-Signature`, calls Pipecat Cloud `POST /v1/public/lp-receptionist/start` with `{"transport":"websocket"}` and the public API key, and returns `<Connect><Stream url="{wsUrl}/{token}">` with `to_number` / `from_number` parameters. If Pipecat fails, the caller hears "Sorry, we can't connect your call right now. Please try again in a few minutes. Goodbye." The unanswered-transfer reconnect (`/api/twilio/transfer-status`) gets a fresh token the same way.

Docs followed: Pipecat Cloud [WebSocket authentication](https://docs.pipecat.ai/pipecat-cloud/guides/websocket-authentication), [Enterprise WebSockets → Telephony providers](https://docs.pipecat.ai/pipecat-cloud/enterprise/websockets) (pointing Twilio straight at `/ws/twilio` works only with `websocket_auth = "none"`), [Generic WebSocket](https://docs.pipecat.ai/pipecat-cloud/guides/generic-websocket). The stream URL is the `wsUrl` that `/start` returns (the generic endpoint), never built by hand.

**The number change (step 4) and the agent deploy (step 5) must happen back to back. With token auth on, the old TwiML Bin is refused; with the number on the webhook but auth still "none", calls still work.** That is why the number moves first (step 4) and the agent deploy follows right after (step 5): the webhook works with either auth mode, so there is no window where calls fail.

## Steps, in order
1. **Pipecat dashboard:** Settings > API Keys > Public > Create key. Copy it straight into Vercel (step 2); never into chat or git.
2. **Vercel project `launchpad-site`, Production env:** add
   - `PIPECAT_PUBLIC_API_KEY` (sensitive)
   - `TWILIO_INBOUND_URL` = `https://launchpad-site-ten.vercel.app/api/twilio/inbound` (exact; Twilio signs this URL)
   - optional `PIPECAT_AGENT_NAME` (defaults to `lp-receptionist`)
   - keep `TWILIO_AUTH_TOKEN`, `TRANSFER_ACTION_URL`, `TRANSFER_STREAM_URL`, `PIPECAT_SERVICE_HOST` as they are.
3. **Push / redeploy the site** to production. Check: an unsigned `curl -X POST https://launchpad-site-ten.vercel.app/api/twilio/inbound` returns 403.
4. **Point +19044568829** "A call comes in" → Webhook, `https://launchpad-site-ten.vercel.app/api/twilio/inbound`, HTTP POST (instead of TwiML Bin `lp-demo-inbound`). Leave the TwiML Bin itself in place for rollback. Optional but useful: one quick call now. The agent is still on "none", so this proves the webhook + `/start` path on its own.
5. **Deploy the agent with token auth:** `pipecat cloud deploy` from the repo root (`pcc-deploy.toml` now has `websocket_auth = "token"`; it also ships the call-flow fixes).
6. **One test call** (call 1 in `T4_TEST_CALLS.md`): disclosure first, then the greeting. If it fails, read the Twilio debugger and `pipecat cloud agent logs lp-receptionist`, then roll back.
7. Run calls 2–8 in `T4_TEST_CALLS.md`. **Only after 2–8 pass:** set Vercel `SHOW_DEMO_PHONE=true` and redeploy the site to show the demo number.

## Rollback
1. Point +19044568829 "A call comes in" back at TwiML Bin `lp-demo-inbound`.
2. Set `websocket_auth = "none"` in `pcc-deploy.toml` and `pipecat cloud deploy`.

Both together, or calls fail. The site env can stay; `/api/twilio/inbound` also works under "none".
