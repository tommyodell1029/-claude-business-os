// Speech, server-side only. The browser uploads one push-to-talk clip; this file sends it to Deepgram with the
// server key and returns text. Replies are spoken by ElevenLabs with the server key. No key ever reaches the browser.
import { ttsModel } from "./models.ts";

type Env = Record<string, string | undefined>;

export const MAX_AUDIO_BYTES = 3_000_000; // ~1-3 minutes of compressed speech
export const MAX_TTS_CHARS = 1200;
const AUDIO_TYPES = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav", "audio/x-m4a", "audio/aac"];

/** Accepts only known audio container types (parameters such as ;codecs=opus are allowed). */
export function audioType(header: string | null): string | null {
  const t = (header ?? "").split(";")[0].trim().toLowerCase();
  return AUDIO_TYPES.includes(t) ? t : null;
}

export async function transcribe(audio: ArrayBuffer, contentType: string, env: Env, fetchImpl: typeof fetch = fetch): Promise<string> {
  const key = env.DEEPGRAM_API_KEY;
  if (!key) throw new Error("DEEPGRAM_API_KEY not set");
  const r = await fetchImpl("https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&language=en-US", {
    method: "POST",
    headers: { authorization: `Token ${key}`, "content-type": contentType },
    body: audio,
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`deepgram ${r.status}`);
  const j = (await r.json()) as { results?: { channels?: { alternatives?: { transcript?: string }[] }[] } };
  return (j.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "").trim();
}

// ElevenLabs premade "George" (British male, warm, mature). Used only until the designed Jarvis voice is set.
export const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
let warned = false;

export function voiceId(env: Env): string {
  const v = env.JARVIS_VOICE_ID?.trim();
  if (v && /^[A-Za-z0-9]{10,40}$/.test(v)) return v;
  if (!warned) {
    console.warn(`jarvis tts: JARVIS_VOICE_ID ${v ? "is invalid" : "not set"}; using the default ElevenLabs voice ${DEFAULT_VOICE_ID} (George)`);
    warned = true;
  }
  return DEFAULT_VOICE_ID;
}

/** Cleans text for speech: no markup, bounded length. */
export function speakable(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const t = text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/[*_#`>]/g, "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.slice(0, MAX_TTS_CHARS);
}

export async function synthesize(text: string, env: Env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const key = env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY not set");
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId(env)}/stream?output_format=mp3_44100_128`;
  const r = await fetchImpl(url, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: ttsModel("elevenlabs") ?? "eleven_turbo_v2_5" }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok || !r.body) throw new Error(`elevenlabs ${r.status}`);
  return r;
}
