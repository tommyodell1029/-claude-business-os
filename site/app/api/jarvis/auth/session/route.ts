// Magic-link landing: the page posts the tokens from the link's #fragment once; they are checked with Supabase,
// the owner allow-list is applied, and they move into HttpOnly cookies. The page then clears the fragment.
import { authClient, authConfig, isSecure, sessionCookies, userIsOwner } from "../../../../../lib/jarvis/auth.ts";
import { jsonResponse, readJson } from "../../../../../lib/jarvis/http.ts";
import { originAllowed } from "../../../../../lib/jarvis/origin.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  if (!originAllowed(req, process.env)) return jsonResponse({ ok: false, error: "Forbidden." }, 403);
  const cfg = authConfig(process.env);
  if (!cfg) return jsonResponse({ ok: false, error: "Jarvis is not configured." }, 503);
  const b = (await readJson(req, 8000)) as Record<string, unknown> | undefined;
  const at = typeof b?.access_token === "string" ? b.access_token : "";
  const rt = typeof b?.refresh_token === "string" ? b.refresh_token : "";
  if (!at || !rt || at.length > 4000 || rt.length > 500) return jsonResponse({ ok: false, error: "Invalid sign-in link." }, 400);
  const u = await authClient(cfg).getUser(at).catch(() => null);
  if (!userIsOwner(u, process.env)) return jsonResponse({ ok: false, error: "Not authorized." }, u ? 403 : 401);
  const expires = Number(b?.expires_in) || 3600;
  return jsonResponse({ ok: true }, 200, sessionCookies({ access_token: at, refresh_token: rt, expires_in: expires }, isSecure(req)));
}
