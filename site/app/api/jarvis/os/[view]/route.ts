// Money OS read-only data for the /os screens. Owner session required (same cookies as /api/jarvis/*).
import { makeCtx } from "../../../../../lib/jarvis/context.ts";
import { jsonResponse, withOwner } from "../../../../../lib/jarvis/http.ts";
import { loadView } from "../../../../../lib/os/views.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withOwner(async (req, { email }) => {
  const url = new URL(req.url);
  const view = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const ctx = makeCtx(email);
  const r = await loadView(view, ctx.db, url.searchParams, ctx.now);
  return jsonResponse(r.body, r.status);
});
