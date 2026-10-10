// Social Radar (YouTube Data API): GET shows the cost, quota and latest videos; POST runs one sweep.
// Owner session + same-origin required; quota, budgets and the emergency stop are enforced inside lib/os/social.ts.
import { makeCtx } from "../../../../../lib/jarvis/context.ts";
import { jsonResponse, readJson, withOwner } from "../../../../../lib/jarvis/http.ts";
import { originAllowed } from "../../../../../lib/jarvis/origin.ts";
import { socialRadar, socialStatus } from "../../../../../lib/os/social.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = withOwner(async (_req, { email }) => {
  const ctx = makeCtx(email);
  if (!ctx.db) return jsonResponse({ ok: false, error: "database not configured" }, 503);
  return jsonResponse({ ok: true, ...(await socialStatus(ctx.db, ctx.env, ctx.now)) });
});

export const POST = withOwner(async (req, { email }) => {
  if (!originAllowed(req, process.env)) return jsonResponse({ ok: false, error: "Forbidden." }, 403);
  const body = (await readJson(req, 500)) as { force?: unknown } | undefined;
  const ctx = makeCtx(email);
  if (!ctx.db) return jsonResponse({ ok: false, error: "database not configured" }, 503);
  const r = await socialRadar({ db: ctx.db, env: ctx.env, fetchImpl: ctx.fetchImpl, now: ctx.now }, { force: body?.force === true });
  return jsonResponse(r, r.ok ? 200 : 502);
});
