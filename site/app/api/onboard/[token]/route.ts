// Client intake submit. The token (from the one-time link) is checked by sha256 hash; the submit is single-use
// (atomic claim in lib/onboard.ts), rate-limited, and stored with the service role key, which lives only here.
import { clientIp, hashIp, makeLimiter } from "../../../../lib/lead.ts";
import { ONBOARD_CONSENT_TEXT, hashToken, intakesDb, isOpen, isTokenShape, spanishAllowed, validateIntake } from "../../../../lib/onboard.ts";
import { sendIntakeAlert } from "../../../../lib/onboardAlert.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const burst = makeLimiter(5, 60_000); // per IP
const perToken = makeLimiter(10, 600_000); // per token hash, stops hammering one link
const MAX_BODY = 40_000;

const json = (body: unknown, status: number, extra: HeadersInit = {}) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...extra } });
const INVALID = "This link is not valid or has expired. Please contact us and we will send a new one.";

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  const sbUrl = process.env.SUPABASE_URL, sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY, salt = process.env.IP_HASH_SALT;
  if (!sbUrl || !sbKey || !salt) {
    console.error("onboard: missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or IP_HASH_SALT");
    return json({ ok: false, error: "The form is not available right now. Please contact us." }, 503);
  }
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return json({ ok: false, error: "Unsupported request." }, 415);
  const origin = req.headers.get("origin");
  if (origin && new URL(req.url).host !== new URL(origin).host) return json({ ok: false, error: "Forbidden." }, 403);

  const ipHash = hashIp(clientIp(req.headers), salt);
  if (!burst.allow(ipHash)) return json({ ok: false, error: "Too many requests. Please wait a minute and try again." }, 429, { "retry-after": "60" });

  const { token } = await ctx.params;
  if (!isTokenShape(token)) return json({ ok: false, error: INVALID }, 404);
  const tokenHash = hashToken(token);
  if (!perToken.allow(tokenHash)) return json({ ok: false, error: "Too many requests. Please wait a few minutes and try again." }, 429, { "retry-after": "600" });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ ok: false, error: "Request too large." }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "Invalid request." }, 400);
  }

  try {
    const db = intakesDb(sbUrl, sbKey);
    const row = await db.findByHash(tokenHash);
    if (!row || row.status === "revoked" || (row.status === "pending" && !isOpen(row))) return json({ ok: false, error: INVALID }, 404);
    if (row.status !== "pending") return json({ ok: false, error: "We already have your answers. Contact us if something needs to change." }, 409);

    const v = validateIntake(body, { spanishAllowed: spanishAllowed(row) });
    if (!v.ok && v.spam) return json({ ok: true }, 200); // honeypot: look successful, store nothing
    if (!v.ok) return json({ ok: false, errors: v.errors }, 400);

    const claimed = await db.claim(tokenHash, { answers: v.answers, consent_text: ONBOARD_CONSENT_TEXT, ip_hash: ipHash });
    if (!claimed) return json({ ok: false, error: "We already have your answers. Contact us if something needs to change." }, 409); // lost a race or expired
    // Never fails the client's request; the owner can always find the row in client_intakes.
    await sendIntakeAlert({ id: claimed.id, client_slug: claimed.client_slug, tier: claimed.tier, business_name: v.answers.business_name }, process.env);
  } catch (e) {
    console.error(`onboard: ${(e as Error).message}`); // status only, never form data
    return json({ ok: false, error: "Something went wrong. Please try again or contact us." }, 500);
  }
  return json({ ok: true }, 200);
}
