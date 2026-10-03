import { jsonResponse, withOwner } from "../../../../lib/jarvis/http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withOwner(async () => jsonResponse({ ok: true }));
