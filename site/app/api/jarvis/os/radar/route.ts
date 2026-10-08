// Money Radar: GET lists categories and the sweep's worst-case cost; POST runs ONE category (the /os screen walks
// them one request at a time). Owner session + same-origin required; budgets enforced inside research.ts.
import { makeCtx } from "../../../../../lib/jarvis/context.ts";
import { jsonResponse, readJson, withOwner } from "../../../../../lib/jarvis/http.ts";
import { model } from "../../../../../lib/jarvis/models.ts";
import { originAllowed } from "../../../../../lib/jarvis/origin.ts";
import { OS_CONFIG } from "../../../../../lib/os/config.generated.ts";
import { RADAR_CATEGORIES, radarCategory, worstCase } from "../../../../../lib/os/research.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const R = (OS_CONFIG as unknown as { radar: { role: string; max_searches: number; max_tokens: number } }).radar;

export const GET = withOwner(async () => {
  const cats = RADAR_CATEGORIES();
  const perCategory = worstCase(model(R.role, "os"), R.max_searches, R.max_tokens, 2000);
  return jsonResponse({ ok: true, categories: cats, maxSearches: cats.length * R.max_searches, worstCaseUsd: Math.round(perCategory * cats.length * 100) / 100 });
});

export const POST = withOwner(async (req, { email }) => {
  if (!originAllowed(req, process.env)) return jsonResponse({ ok: false, error: "Forbidden." }, 403);
  const body = (await readJson(req, 2000)) as { category?: unknown; force?: unknown } | undefined;
  const category = typeof body?.category === "string" ? body.category : "";
  if (!RADAR_CATEGORIES().some((c) => c.key === category)) return jsonResponse({ ok: false, error: "unknown category" }, 400);
  const ctx = makeCtx(email);
  if (!ctx.db) return jsonResponse({ ok: false, error: "database not configured" }, 503);
  const r = await radarCategory({ db: ctx.db, env: ctx.env, fetchImpl: ctx.fetchImpl, now: ctx.now }, category, { force: body?.force === true });
  return jsonResponse(r, r.ok ? 200 : 502);
});
