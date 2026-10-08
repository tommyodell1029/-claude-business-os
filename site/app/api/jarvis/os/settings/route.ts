// Money OS settings. GET = the Settings screen (this static route shadows [view] for "settings").
// POST {budgets: {...}} = owner edits a budget within the config/money_os.yaml limits. Owner session + same origin.
import { makeCtx } from "../../../../../lib/jarvis/context.ts";
import { jsonResponse, readJson, withOwner } from "../../../../../lib/jarvis/http.ts";
import { originAllowed } from "../../../../../lib/jarvis/origin.ts";
import { saveBudgets, validatePatch } from "../../../../../lib/os/settings.ts";
import { loadView } from "../../../../../lib/os/views.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withOwner(async (req, { email }) => {
  const ctx = makeCtx(email);
  const r = await loadView("settings", ctx.db, new URL(req.url).searchParams, ctx.now);
  return jsonResponse(r.body, r.status);
});

export const POST = withOwner(async (req, { email }) => {
  if (!originAllowed(req, process.env)) return jsonResponse({ ok: false, error: "Forbidden." }, 403);
  const body = (await readJson(req, 2000)) as { budgets?: unknown } | undefined;
  const v = validatePatch(body?.budgets);
  if (!v.ok) return jsonResponse({ ok: false, error: v.error }, 400);
  const ctx = makeCtx(email);
  if (!ctx.db) return jsonResponse({ ok: false, error: "database not configured" }, 503);
  try {
    return jsonResponse({ ok: true, budgets: await saveBudgets(ctx.db, email, v.value, ctx.now) });
  } catch (e) {
    console.error(`os settings: ${(e as Error).message}`);
    return jsonResponse({ ok: false, error: "could not save settings" }, 502);
  }
});
