// Reply text -> Jarvis voice (ElevenLabs, server key). Streams audio/mpeg back to the page.
import { jsonResponse, readJson, withOwner } from "../../../../lib/jarvis/http.ts";
import { speakable, synthesize } from "../../../../lib/jarvis/speech.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const POST = withOwner(async (req) => {
  const text = speakable(((await readJson(req, 8000)) as { text?: unknown } | undefined)?.text);
  if (!text) return jsonResponse({ ok: false, error: "Nothing to say." }, 400);
  try {
    const upstream = await synthesize(text, process.env);
    return new Response(upstream.body, { status: 200, headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
  } catch (e) {
    console.error(`jarvis tts: ${(e as Error).message}`);
    return jsonResponse({ ok: false, error: "Voice is unavailable." }, 502);
  }
});
