// Step 1 of owner sign-in: email a magic link + one-time code. Only the allow-listed owner address is ever sent
// to Supabase; any other address gets the same neutral reply and nothing happens.
import { authClient, authConfig, isOwner, normEmail, validEmail } from "../../../../../lib/jarvis/auth.ts";
import { jsonResponse, readJson } from "../../../../../lib/jarvis/http.ts";
import { originAllowed } from "../../../../../lib/jarvis/origin.ts";
import { clientIp, makeLimiter } from "../../../../../lib/lead.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = makeLimiter(3, 10 * 60_000);
const NEUTRAL = { ok: true, message: "If that address is allowed, a sign-in email is on its way." };

export async function POST(req: Request): Promise<Response> {
  if (!originAllowed(req, process.env)) return jsonResponse({ ok: false, error: "Forbidden." }, 403);
  const cfg = authConfig(process.env);
  if (!cfg) return jsonResponse({ ok: false, error: "Jarvis is not configured." }, 503);
  if (!limiter.allow(clientIp(req.headers))) return jsonResponse({ ok: false, error: "Too many attempts. Wait a few minutes." }, 429);
  const body = (await readJson(req, 2000)) as { email?: unknown } | undefined;
  const email = normEmail(body?.email);
  if (!validEmail(email)) return jsonResponse({ ok: false, error: "Enter a valid email address." }, 400);
  if (!isOwner(email, process.env)) return jsonResponse(NEUTRAL);
  const redirect = `${new URL(req.url).origin}/jarvis`;
  const sent = await authClient(cfg).sendOtp(email, redirect).catch(() => false);
  if (!sent) console.error("jarvis auth: otp request failed");
  return jsonResponse(NEUTRAL);
}
