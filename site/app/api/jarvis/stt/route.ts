// Push-to-talk clip -> text via Deepgram. The Deepgram key stays here; the browser only uploads audio.
import { jsonResponse, withOwner } from "../../../../lib/jarvis/http.ts";
import { MAX_AUDIO_BYTES, audioType, transcribe } from "../../../../lib/jarvis/speech.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const POST = withOwner(async (req) => {
  const type = audioType(req.headers.get("content-type"));
  if (!type) return jsonResponse({ ok: false, error: "Unsupported audio." }, 415);
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_AUDIO_BYTES) return jsonResponse({ ok: false, error: "Recording too long." }, 413);
  const audio = await req.arrayBuffer();
  if (audio.byteLength === 0 || audio.byteLength > MAX_AUDIO_BYTES) return jsonResponse({ ok: false, error: "Recording empty or too long." }, 413);
  try {
    return jsonResponse({ ok: true, text: await transcribe(audio, type, process.env) });
  } catch (e) {
    console.error(`jarvis stt: ${(e as Error).message}`);
    return jsonResponse({ ok: false, error: "Speech recognition is unavailable." }, 502);
  }
});
