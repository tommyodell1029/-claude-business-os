// The only way a write runs: the owner's explicit yes/no (spoken or tapped) on one pending action id.
import { handleConfirm } from "../../../../lib/jarvis/confirm.ts";
import { makeCtx } from "../../../../lib/jarvis/context.ts";
import { parseConfirmRequest } from "../../../../lib/jarvis/gate.ts";
import { jsonResponse, readJson, withOwner } from "../../../../lib/jarvis/http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // a confirmed Radar sweep or research run makes a web-search model call

export const POST = withOwner(async (req, { email }) => {
  const r = parseConfirmRequest(await readJson(req, 2000));
  if (!r) return jsonResponse({ ok: false, error: "Invalid request." }, 400);
  try {
    const out = await handleConfirm(r, makeCtx(email));
    return jsonResponse(out, out.ok ? 200 : out.status === "failed" ? 500 : 409);
  } catch (e) {
    console.error(`jarvis confirm: ${(e as Error).message}`);
    return jsonResponse({ ok: false, status: "failed", message: "Data unavailable: I couldn't reach the database, sir." }, 502);
  }
});
