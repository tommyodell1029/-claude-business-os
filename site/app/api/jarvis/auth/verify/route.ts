// Step 2 of owner sign-in (works inside the installed iPhone app): the 6-digit code from the email.
import { authClient, authConfig, isOwner, isSecure, normEmail, sessionCookies, userIsOwner } from "../../../../../lib/jarvis/auth.ts";
import { jsonResponse, readJson } from "../../../../../lib/jarvis/http.ts";
import { originAllowed } from "../../../../../lib/jarvis/origin.ts";
import { clientIp, makeLimiter } from "../../../../../lib/lead.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = makeLimiter(5, 10 * 60_000);

export async function POST(req: Request): Promise<Response> {
  if (!originAllowed(req, process.env)) return jsonResponse({ ok: false, error: "Forbidden." }, 403);
  const cfg = authConfig(process.env);
  if (!cfg) return jsonResponse({ ok: false, error: "Jarvis is not configured." }, 503);
  if (!limiter.allow(clientIp(req.headers))) return jsonResponse({ ok: false, error: "Too many attempts. Wait a few minutes." }, 429);
  const body = (await readJson(req, 2000)) as { email?: unknown; code?: unknown } | undefined;
  const email = normEmail(body?.email);
  const code = typeof body?.code === "string" ? body.code.replace(/\s/g, "") : "";
  if (!/^\d{6,10}$/.test(code)) return jsonResponse({ ok: false, error: "Enter the code from the email." }, 400);
  if (!isOwner(email, process.env)) return jsonResponse({ ok: false, error: "Not authorized." }, 403);
  const s = await authClient(cfg).verifyOtp(email, code).catch(() => null);
  if (!s) return jsonResponse({ ok: false, error: "That code didn't work. Request a new one." }, 401);
  if (!userIsOwner(s.user, process.env)) return jsonResponse({ ok: false, error: "Not authorized." }, 403);
  return jsonResponse({ ok: true }, 200, sessionCookies(s, isSecure(req)));
}
