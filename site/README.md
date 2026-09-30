# site

Next.js app for launchpadlocal.org. Today it holds only the Twilio transfer webhook (T4); the marketing site, `/api/lead` and `/admin` come in T6.

| Route | What |
|---|---|
| `POST /api/twilio/transfer-status` | Twilio `<Dial action>` callback. Rejects requests without a valid `X-Twilio-Signature`. If the transfer was answered it hangs up; otherwise it reconnects the caller to the voice agent in `urgent_message` mode. |

Env (Vercel project settings, never in git): `TWILIO_AUTH_TOKEN`, `TRANSFER_ACTION_URL` (this route's exact public URL), `TRANSFER_STREAM_URL`, `PIPECAT_SERVICE_HOST`.

Checks: `npm ci && npm test && npm run typecheck && npm run build`.
