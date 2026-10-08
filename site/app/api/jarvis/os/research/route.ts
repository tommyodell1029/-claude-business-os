// Deep research on one opportunity (owner-triggered). Owner session + same-origin required; cached for
// cache.research_ttl_days unless force; budgets enforced inside research.ts.
import { makeCtx } from "../../../../../lib/jarvis/context.ts";
import { isUuid } from "../../../../../lib/jarvis/gate.ts";
import { jsonResponse, readJson, withOwner } from "../../../../../lib/jarvis/http.ts";
import { originAllowed } from "../../../../../lib/jarvis/origin.ts";
import { researchOpportunity } from "../../../../../lib/os/research.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = withOwner(async (req, { email }) => {
  if (!originAllowed(req, process.env)) return jsonResponse({ ok: false, error: "Forbidden." }, 403);
  const body = (await readJson(req, 2000)) as { id?: unknown; force?: unknown } | undefined;
  const id = typeof body?.id === "string" && isUuid(body.id) ? body.id : null;
  if (!id) return jsonResponse({ ok: false, error: "invalid id" }, 400);
  const ctx = makeCtx(email);
  if (!ctx.db) return jsonResponse({ ok: false, error: "database not configured" }, 503);
  const r = await researchOpportunity({ db: ctx.db, env: ctx.env, fetchImpl: ctx.fetchImpl, now: ctx.now }, id, { force: body?.force === true });
  return jsonResponse(r, r.ok ? 200 : r.error === "not found" ? 404 : 502);
});
