// Pipecat Cloud token flow for Twilio calls (websocket_auth = "token"). Followed exactly:
//   https://docs.pipecat.ai/pipecat-cloud/guides/websocket-authentication
//     POST https://api.pipecat.daily.co/v1/public/{agent}/start, "Authorization: Bearer <public key>",
//     body {"transport":"websocket"} -> {token, wsUrl, sessionId}. Token: 5 min, one use, bound to this agent.
//     Twilio can't send query params or headers, so the token goes in the URL path: `${wsUrl}/${token}`.
//     "Always use this URL rather than constructing one manually."
//   https://docs.pipecat.ai/pipecat-cloud/enterprise/websockets (Telephony providers)
//     Pointing Twilio straight at /ws/twilio + _pipecatCloudServiceHost works ONLY with websocket_auth = "none";
//     the /start + returned wsUrl path works with "token" or "none".
//   https://docs.pipecat.ai/pipecat-cloud/guides/generic-websocket
//     The returned wsUrl is the generic endpoint (/ws/generic/{agent}.{org}); it relays Twilio's messages
//     untouched and the bot's runner parses Twilio's start message itself (to_number/from_number included).
import { hangupTwiml, sayHangupTwiml, streamTwiml, validateTwilioSignature } from "./twilio.ts";

export const PIPECAT_PUBLIC_API = "https://api.pipecat.daily.co/v1/public";
export const DEFAULT_AGENT = "lp-receptionist";
const START_TIMEOUT_MS = 5000; // Twilio waits 15 s for a webhook; leave room for the fallback

export const INBOUND_FALLBACK_LINE =
  "Sorry, we can't connect your call right now. Please try again in a few minutes. Goodbye.";
export const RECONNECT_FALLBACK_LINE =
  "Sorry, no one was available and we can't take a message right now. Please call back in a few minutes. Goodbye.";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class PipecatStartError extends Error {}

export type StartedSession = { wsUrl: string; token: string; sessionId?: string };

/** Ask Pipecat Cloud for a one-time websocket session token. Throws PipecatStartError on any problem. */
export async function startWebsocketSession(opts: {
  publicKey: string;
  agentName?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): Promise<StartedSession> {
  const agent = opts.agentName || DEFAULT_AGENT;
  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${PIPECAT_PUBLIC_API}/${encodeURIComponent(agent)}/start`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.publicKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ transport: "websocket" }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? START_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    throw new PipecatStartError(`start request failed: ${e instanceof Error ? e.name : "error"}`);
  }
  if (!res.ok) throw new PipecatStartError(`start returned HTTP ${res.status}`);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new PipecatStartError("start returned invalid JSON");
  }
  const { token, wsUrl, sessionId } = (data ?? {}) as Record<string, unknown>;
  if (typeof token !== "string" || !token || /[\s/?#]/.test(token)) {
    throw new PipecatStartError("start returned no usable token");
  }
  if (typeof wsUrl !== "string" || !isPipecatWsUrl(wsUrl)) throw new PipecatStartError("start returned no usable wsUrl");
  return { wsUrl, token, sessionId: typeof sessionId === "string" ? sessionId : undefined };
}

/** Only ever hand Twilio a wss:// URL on Pipecat Cloud's own domain. */
function isPipecatWsUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "wss:" && (u.hostname === "pipecat.daily.co" || u.hostname.endsWith(".pipecat.daily.co"));
  } catch {
    return false;
  }
}

/** Token in the URL path, the method the docs recommend for Twilio. */
export function tokenizedStreamUrl(s: StartedSession): string {
  return `${s.wsUrl.replace(/\/+$/, "")}/${s.token}`;
}

// ------------------------------------------------------------------ webhooks

const xml = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "application/xml" } });

async function formParams(req: Request): Promise<Record<string, string>> {
  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") params[k] = v;
  return params;
}

export type InboundEnv = {
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_INBOUND_URL?: string; // exact URL set as the number's "A call comes in" webhook (Twilio signs it)
  PIPECAT_PUBLIC_API_KEY?: string;
  PIPECAT_AGENT_NAME?: string;
};

/**
 * Twilio "A call comes in" webhook. Signature check first (403), then a fresh Pipecat session token, then
 * <Connect><Stream> to the tokenized URL. Any Pipecat problem -> a polite spoken message, never a crash.
 */
export async function inboundVoiceResponse(req: Request, env: InboundEnv, fetchImpl?: FetchLike): Promise<Response> {
  if (!env.TWILIO_AUTH_TOKEN || !env.TWILIO_INBOUND_URL) {
    console.error("twilio/inbound: missing TWILIO_AUTH_TOKEN or TWILIO_INBOUND_URL");
    return new Response("not configured", { status: 500 });
  }
  const params = await formParams(req);
  if (!validateTwilioSignature(env.TWILIO_AUTH_TOKEN, env.TWILIO_INBOUND_URL, params, req.headers.get("x-twilio-signature"))) {
    return new Response("invalid Twilio signature", { status: 403 });
  }
  if (!env.PIPECAT_PUBLIC_API_KEY) {
    console.error("twilio/inbound: missing PIPECAT_PUBLIC_API_KEY");
    return xml(sayHangupTwiml(INBOUND_FALLBACK_LINE));
  }
  try {
    const session = await startWebsocketSession({
      publicKey: env.PIPECAT_PUBLIC_API_KEY,
      agentName: env.PIPECAT_AGENT_NAME,
      fetchImpl,
    });
    return xml(streamTwiml(tokenizedStreamUrl(session), { toNumber: params.To, fromNumber: params.From }));
  } catch (e) {
    console.error(`twilio/inbound: pipecat ${e instanceof PipecatStartError ? e.message : "unexpected error"}`);
    return xml(sayHangupTwiml(INBOUND_FALLBACK_LINE));
  }
}

export type TransferStatusEnv = {
  TWILIO_AUTH_TOKEN?: string;
  TRANSFER_ACTION_URL?: string;
  TRANSFER_STREAM_URL?: string; // legacy, websocket_auth = "none" only
  PIPECAT_SERVICE_HOST?: string; // legacy, goes with TRANSFER_STREAM_URL
  PIPECAT_PUBLIC_API_KEY?: string;
  PIPECAT_AGENT_NAME?: string;
};

/**
 * Twilio <Dial action> after a live transfer. Answered -> hang up. Otherwise reconnect the caller to the agent
 * in urgent_message mode: through a fresh token when PIPECAT_PUBLIC_API_KEY is set (required once the agent
 * runs websocket_auth = "token"), else the legacy fixed TRANSFER_STREAM_URL.
 */
export async function transferStatusResponse(
  req: Request,
  env: TransferStatusEnv,
  fetchImpl?: FetchLike,
): Promise<Response> {
  if (!env.TWILIO_AUTH_TOKEN || !env.TRANSFER_ACTION_URL || (!env.PIPECAT_PUBLIC_API_KEY && !env.TRANSFER_STREAM_URL)) {
    console.error("transfer-status: missing TWILIO_AUTH_TOKEN, TRANSFER_ACTION_URL, or PIPECAT_PUBLIC_API_KEY/TRANSFER_STREAM_URL");
    return new Response("not configured", { status: 500 });
  }
  const params = await formParams(req);
  if (!validateTwilioSignature(env.TWILIO_AUTH_TOKEN, env.TRANSFER_ACTION_URL, params, req.headers.get("x-twilio-signature"))) {
    return new Response("invalid Twilio signature", { status: 403 });
  }
  if (params.DialCallStatus === "completed") return xml(hangupTwiml());

  const numbers = { toNumber: params.Called, fromNumber: params.Caller, mode: "urgent_message" };
  if (!env.PIPECAT_PUBLIC_API_KEY) {
    return xml(streamTwiml(env.TRANSFER_STREAM_URL!, { ...numbers, serviceHost: env.PIPECAT_SERVICE_HOST }));
  }
  try {
    const session = await startWebsocketSession({
      publicKey: env.PIPECAT_PUBLIC_API_KEY,
      agentName: env.PIPECAT_AGENT_NAME,
      fetchImpl,
    });
    return xml(streamTwiml(tokenizedStreamUrl(session), numbers));
  } catch (e) {
    console.error(`transfer-status: pipecat ${e instanceof PipecatStartError ? e.message : "unexpected error"}`);
    return xml(sayHangupTwiml(RECONNECT_FALLBACK_LINE));
  }
}
