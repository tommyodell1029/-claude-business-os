# site

Next.js app for launchpadlocal.org. Marketing site (`/`, `/terms`, `/privacy`), lead intake, Stripe webhook and the Twilio transfer webhook. `/admin` is not built yet.

| Route | What |
|---|---|
| `POST /api/lead` | Contact form intake into Supabase `site_leads` (consent, honeypot, rate limit, hashed IP). |
| `POST /api/twilio/transfer-status` | Twilio `<Dial action>` callback. Rejects requests without a valid `X-Twilio-Signature`. If the transfer was answered it hangs up; otherwise it reconnects the caller to the voice agent in `urgent_message` mode. |

Env (Vercel project settings, never in git): `TWILIO_AUTH_TOKEN`, `TRANSFER_ACTION_URL` (this route's exact public URL), `TRANSFER_STREAM_URL`, `PIPECAT_SERVICE_HOST`.

Env for the site: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `IP_HASH_SALT` (lead form); `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`, `LEAD_ALERT_EMAIL` (owner email on each new lead); `MAILING_ADDRESS` (footer); `SHOW_DEMO_PHONE` + `DEMO_PHONE` (demo block, off by default). Prices come from `config/offerings.yaml` via `npm run build` (copied to `content/offerings.yaml`).

Jarvis (owner-only assistant): `/jarvis` + `/api/jarvis/*`, code in `lib/jarvis/`. Env and setup: `docs/JARVIS_SPEC.md` ("Owner setup for J1"). `postbuild` scans `.next/static` for secret env names.

Checks: `npm ci && npm run lint && npm test && npm run typecheck && npm run build`.
