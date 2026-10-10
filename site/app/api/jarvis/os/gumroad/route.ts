// Gumroad sales sync: GET says whether the token is set (never returns it); POST records new sales.
// Owner session + same-origin required. Read-only on Gumroad; writes revenue_entries keyed by Gumroad's sale id.
import { makeCtx } from "../../../../../lib/jarvis/context.ts";
import { jsonResponse, withOwner } from "../../../../../lib/jarvis/http.ts";
import { originAllowed } from "../../../../../lib/jarvis/origin.ts";
import { syncGumroad } from "../../../../../lib/os/gumroad.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = withOwner(async () => jsonResponse({ ok: true, tokenConfigured: !!process.env.GUMROAD_ACCESS_TOKEN?.trim() }));

export const POST = withOwner(async (req, { email }) => {
  if (!originAllowed(req, process.env)) return jsonResponse({ ok: false, error: "Forbidden." }, 403);
  const ctx = makeCtx(email);
  if (!ctx.db) return jsonResponse({ ok: false, error: "database not configured" }, 503);
  const r = await syncGumroad(ctx.db, ctx.env, ctx.fetchImpl, ctx.now);
  return jsonResponse(r, r.ok ? 200 : 502);
});
