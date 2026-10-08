// Owner taps in /os (behind a confirm dialog there): create experiment, change its status, kill an opportunity,
// record revenue. Owner session + same origin; validation and execution are shared with ULTRON's confirmed actions.
import { makeCtx } from "../../../../../lib/jarvis/context.ts";
import { jsonResponse, readJson, withOwner } from "../../../../../lib/jarvis/http.ts";
import { originAllowed } from "../../../../../lib/jarvis/origin.ts";
import { runOwnerAction } from "../../../../../lib/jarvis/tools.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withOwner(async (req, { email }) => {
  if (!originAllowed(req, process.env)) return jsonResponse({ ok: false, error: "Forbidden." }, 403);
  const body = (await readJson(req, 8000)) as { tool?: unknown; input?: unknown } | undefined;
  if (typeof body?.tool !== "string") return jsonResponse({ ok: false, error: "Invalid request." }, 400);
  try {
    const r = await runOwnerAction(body.tool, body.input ?? {}, makeCtx(email));
    return jsonResponse(r, r.ok ? 200 : 400);
  } catch (e) {
    console.error(`os action: ${(e as Error).message}`);
    return jsonResponse({ ok: false, error: "could not save" }, 502);
  }
});
