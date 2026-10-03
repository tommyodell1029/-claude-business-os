import { AT_COOKIE, authClient, authConfig, clearCookies, isSecure, readCookie } from "../../../../../lib/jarvis/auth.ts";
import { jsonResponse } from "../../../../../lib/jarvis/http.ts";
import { originAllowed } from "../../../../../lib/jarvis/origin.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  if (!originAllowed(req, process.env)) return jsonResponse({ ok: false, error: "Forbidden." }, 403);
  const cfg = authConfig(process.env);
  const at = readCookie(req.headers.get("cookie"), AT_COOKIE);
  if (cfg && at) await authClient(cfg).logout(at);
  return jsonResponse({ ok: true }, 200, clearCookies(isSecure(req)));
}
