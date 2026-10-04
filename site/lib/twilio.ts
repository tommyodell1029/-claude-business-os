// Twilio helpers for the site's webhooks. Mirrors agents/transfer.py so the voice agent and the
// site answer Twilio the same way. No Twilio SDK: signature check and TwiML are small enough to own.
import { createHmac, timingSafeEqual } from "node:crypto";

/** X-Twilio-Signature check: base64(HMAC-SHA1(authToken, url + sorted POST params as key+value)). */
export function validateTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string | null,
): boolean {
  if (!authToken || !signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = createHmac("sha1", authToken).update(data, "utf8").digest();
  let given: Buffer;
  try {
    given = Buffer.from(signature, "base64");
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function xmlAttr(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>';

export function hangupTwiml(): string {
  return `${XML_HEAD}<Response><Hangup /></Response>`;
}

/** Spoken message then hang up. Used when the voice agent can't be reached, so callers never hit a dead line. */
export function sayHangupTwiml(text: string): string {
  return `${XML_HEAD}<Response><Say>${xmlText(text)}</Say><Hangup /></Response>`;
}

function xmlText(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type StreamOpts = { toNumber?: string; fromNumber?: string; serviceHost?: string; mode?: string };

/** <Connect><Stream> to the voice agent. Parameter names match the TwiML Bin (the bot reads to_number/from_number). */
export function streamTwiml(streamUrl: string, opts: StreamOpts = {}): string {
  const params: [string, string][] = [];
  if (opts.serviceHost) params.push(["_pipecatCloudServiceHost", opts.serviceHost]);
  if (opts.mode) params.push(["mode", opts.mode]);
  if (opts.toNumber) params.push(["to_number", opts.toNumber]);
  if (opts.fromNumber) params.push(["from_number", opts.fromNumber]);
  const inner = params.map(([n, v]) => `<Parameter name="${xmlAttr(n)}" value="${xmlAttr(v)}" />`).join("");
  return `${XML_HEAD}<Response><Connect><Stream url="${xmlAttr(streamUrl)}">${inner}</Stream></Connect></Response>`;
}

/** Reconnect an unanswered transfer to the voice agent's stream in urgent_message mode. */
export function reconnectTwiml(
  streamUrl: string,
  opts: { toNumber?: string; fromNumber?: string; serviceHost?: string } = {},
): string {
  return streamTwiml(streamUrl, { ...opts, mode: "urgent_message" });
}

/** <Dial action> outcome: "completed" means a human answered, so hang up; anything else reconnects. */
export function dialActionTwiml(
  dialCallStatus: string,
  streamUrl: string,
  opts: { toNumber?: string; fromNumber?: string; serviceHost?: string } = {},
): string {
  return dialCallStatus === "completed" ? hangupTwiml() : reconnectTwiml(streamUrl, opts);
}
