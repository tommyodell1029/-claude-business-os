// Contact form intake. Validates, requires explicit consent, rate-limits, hashes the IP, and inserts into
// Supabase `site_leads` with the service role key. The key lives only in this server route.
import { sendLeadAlert } from "../../../lib/leadAlert.ts";
import { CONSENT_TEXT, DB_HOURLY_LIMIT, clientIp, hashIp, leadsDb, makeLimiter, validateLead } from "../../../lib/lead.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const burst = makeLimiter(3, 60_000);
const MAX_BODY = 16_000;

const json = (body: unknown, status: number, extra: HeadersInit = {}) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...extra } });

export async function POST(req: Request): Promise<Response> {
  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const salt = process.env.IP_HASH_SALT;
  if (!sbUrl || !sbKey || !salt) {
    console.error("lead: missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or IP_HASH_SALT");
    return json({ ok: false, error: "The form is not available right now. Please email us instead." }, 503);
  }

  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return json({ ok: false, error: "Unsupported request." }, 415);
  const origin = req.headers.get("origin");
  if (origin && new URL(req.url).host !== new URL(origin).host) return json({ ok: false, error: "Forbidden." }, 403);

  const ipHash = hashIp(clientIp(req.headers), salt);
  if (!burst.allow(ipHash)) return json({ ok: false, error: "Too many requests. Please wait a minute and try again." }, 429, { "retry-after": "60" });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ ok: false, error: "Request too large." }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "Invalid request." }, 400);
  }

  const v = validateLead(body);
  if (!v.ok && v.spam) return json({ ok: true }, 200); // honeypot: look successful, store nothing
  if (!v.ok) return json({ ok: false, errors: v.errors }, 400);

  try {
    const db = leadsDb(sbUrl, sbKey);
    const since = new Date(Date.now() - 3_600_000).toISOString();
    if ((await db.recentCount(ipHash, since)) >= DB_HOURLY_LIMIT) {
      return json({ ok: false, error: "Too many requests. Please try again later." }, 429, { "retry-after": "3600" });
    }
    const leadId = await db.insert({
      ...v.lead,
      consent: true,
      consent_text: CONSENT_TEXT,
      ip_hash: ipHash,
      user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300) || null,
    });
    // Alert the owner. Never fails the visitor's request; agents/notify/leads.py re-sends anything still un-notified.
    const status = await sendLeadAlert(v.lead, leadId, process.env);
    if (leadId) await db.markNotified(leadId, status).catch((e) => console.error(`lead: ${(e as Error).message}`));
  } catch (e) {
    console.error(`lead: ${(e as Error).message}`); // status only, no form data
    return json({ ok: false, error: "Something went wrong. Please try again or email us." }, 500);
  }
  return json({ ok: true }, 200);
}
