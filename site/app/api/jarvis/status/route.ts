// HUD tiles. Each value is a real count or null ("DATA UNAVAILABLE").
import { makeCtx } from "../../../../lib/jarvis/context.ts";
import { jsonResponse, withOwner } from "../../../../lib/jarvis/http.ts";
import { tiles } from "../../../../lib/jarvis/status.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withOwner(async (_req, { email }) => jsonResponse({ ok: true, tiles: await tiles(makeCtx(email)) }));
