// One Jarvis turn: validated text history in, spoken-style reply (+ any pending action awaiting confirmation) out.
import { parseMessages, runTurn } from "../../../../lib/jarvis/brain.ts";
import { makeCtx } from "../../../../lib/jarvis/context.ts";
import { jsonResponse, readJson, withOwner } from "../../../../lib/jarvis/http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = withOwner(async (req, { email }) => {
  const messages = parseMessages(await readJson(req, 64_000));
  if (!messages) return jsonResponse({ ok: false, error: "Invalid request." }, 400);
  try {
    const { reply, pending, tools } = await runTurn(messages, makeCtx(email));
    return jsonResponse({ ok: true, reply, pending, tools });
  } catch (e) {
    console.error(`jarvis chat: ${(e as Error).message}`);
    return jsonResponse({ ok: false, error: "I'm afraid my reasoning systems are unavailable at the moment, sir." }, 502);
  }
});
