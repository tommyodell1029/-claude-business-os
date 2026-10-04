// Run: npm test. Twilio inbound + transfer-status webhooks with a fake Pipecat /start (no network).
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  INBOUND_FALLBACK_LINE,
  PIPECAT_PUBLIC_API,
  RECONNECT_FALLBACK_LINE,
  inboundVoiceResponse,
  startWebsocketSession,
  transferStatusResponse,
  type FetchLike,
} from "./pipecat.ts";
import { dialActionTwiml } from "./twilio.ts";

const TOKEN = "test_token_123";
const INBOUND_URL = "https://example.vercel.app/api/twilio/inbound";
const ACTION_URL = "https://example.vercel.app/api/twilio/transfer-status";
const CALL = { CallSid: "CA123", To: "+19045550000", From: "+19045551111", Direction: "inbound" };
const ENV = { TWILIO_AUTH_TOKEN: TOKEN, TWILIO_INBOUND_URL: INBOUND_URL, PIPECAT_PUBLIC_API_KEY: "pk_test" };
const WS = "wss://us-east.api.pipecat.daily.co/ws/generic/lp-receptionist.launchpad-local";
const SESSION_TOKEN = "eyJzaCI6ImxwLXJlY2VwdGlvbmlzdC5sYXVuY2hwYWQtbG9jYWwifQ.c2ln";

function sign(url: string, params: Record<string, string>, token = TOKEN): string {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return createHmac("sha1", token).update(data, "utf8").digest("base64");
}

function twilioPost(url: string, params: Record<string, string>, signature: string | null): Request {
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (signature !== null) headers["X-Twilio-Signature"] = signature;
  return new Request(url, { method: "POST", headers, body: new URLSearchParams(params).toString() });
}

type Call = { url: string; init?: RequestInit };

function fakeFetch(respond: () => Response | Promise<Response>): FetchLike & { calls: Call[] } {
  const calls: Call[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return respond();
  }) as FetchLike & { calls: Call[] };
  f.calls = calls;
  return f;
}

const okStart = () => fakeFetch(() => Response.json({ token: SESSION_TOKEN, wsUrl: WS, sessionId: "s-1" }));

test("inbound: bad or missing signature is 403 and Pipecat is never called", async () => {
  for (const sig of [null, "bogus", sign(INBOUND_URL, CALL, "other_token"), sign(INBOUND_URL + "?x=1", CALL)]) {
    const f = okStart();
    const res = await inboundVoiceResponse(twilioPost(INBOUND_URL, CALL, sig), ENV, f);
    assert.equal(res.status, 403);
    assert.equal(f.calls.length, 0);
  }
  // tampered params
  const f = okStart();
  const res = await inboundVoiceResponse(twilioPost(INBOUND_URL, { ...CALL, From: "+15555550000" }, sign(INBOUND_URL, CALL)), ENV, f);
  assert.equal(res.status, 403);
  assert.equal(f.calls.length, 0);
});

test("inbound: good signature -> /start with the public key -> tokenized <Connect><Stream> TwiML", async () => {
  const f = okStart();
  const res = await inboundVoiceResponse(twilioPost(INBOUND_URL, CALL, sign(INBOUND_URL, CALL)), ENV, f);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/xml");
  assert.equal(
    await res.text(),
    '<?xml version="1.0" encoding="UTF-8"?><Response><Connect>' +
      `<Stream url="${WS}/${SESSION_TOKEN}">` +
      '<Parameter name="to_number" value="+19045550000" />' +
      '<Parameter name="from_number" value="+19045551111" />' +
      "</Stream></Connect></Response>",
  );
  assert.equal(f.calls.length, 1);
  const { url, init } = f.calls[0];
  assert.equal(url, `${PIPECAT_PUBLIC_API}/lp-receptionist/start`);
  assert.equal(init?.method, "POST");
  assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer pk_test");
  assert.deepEqual(JSON.parse(String(init?.body)), { transport: "websocket" });
});

test("inbound: agent name comes from PIPECAT_AGENT_NAME when set", async () => {
  const f = okStart();
  await inboundVoiceResponse(twilioPost(INBOUND_URL, CALL, sign(INBOUND_URL, CALL)), { ...ENV, PIPECAT_AGENT_NAME: "other-agent" }, f);
  assert.equal(f.calls[0].url, `${PIPECAT_PUBLIC_API}/other-agent/start`);
});

test("inbound: any Pipecat failure -> polite spoken fallback, no crash, no stream", async () => {
  const failures: (() => Response | Promise<Response>)[] = [
    () => new Response("unauthorized", { status: 401 }),
    () => new Response("boom", { status: 500 }),
    () => new Response("not json", { status: 200 }),
    () => Response.json({ wsUrl: WS }), // no token
    () => Response.json({ token: SESSION_TOKEN }), // no wsUrl
    () => Response.json({ token: SESSION_TOKEN, wsUrl: "wss://evil.example.com/ws" }),
    () => Response.json({ token: SESSION_TOKEN, wsUrl: "https://us-east.api.pipecat.daily.co/ws/generic/x" }),
    () => Response.json({ token: "a/b", wsUrl: WS }),
    () => Promise.reject(new TypeError("network down")),
  ];
  for (const respond of failures) {
    const res = await inboundVoiceResponse(twilioPost(INBOUND_URL, CALL, sign(INBOUND_URL, CALL)), ENV, fakeFetch(respond));
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /<Say>Sorry, we can't connect your call right now\./);
    assert.ok(body.includes(INBOUND_FALLBACK_LINE));
    assert.match(body, /<Hangup \/><\/Response>$/);
    assert.doesNotMatch(body, /<Stream/);
  }
});

test("inbound: missing public key -> fallback; missing auth token or URL -> 500 (can't verify)", async () => {
  const f = okStart();
  const res = await inboundVoiceResponse(
    twilioPost(INBOUND_URL, CALL, sign(INBOUND_URL, CALL)),
    { ...ENV, PIPECAT_PUBLIC_API_KEY: undefined },
    f,
  );
  assert.ok((await res.text()).includes(INBOUND_FALLBACK_LINE));
  assert.equal(f.calls.length, 0);
  for (const env of [{ ...ENV, TWILIO_AUTH_TOKEN: undefined }, { ...ENV, TWILIO_INBOUND_URL: undefined }]) {
    assert.equal((await inboundVoiceResponse(twilioPost(INBOUND_URL, CALL, sign(INBOUND_URL, CALL)), env, f)).status, 500);
  }
});

test("startWebsocketSession times out instead of hanging the webhook", async () => {
  // AbortSignal.timeout's timer is unref'd; a ref'd keep-alive stops node:test exiting before it fires.
  const hang: FetchLike = (_url, init) =>
    new Promise((_, reject) => {
      const keepAlive = setTimeout(() => reject(new Error("timeout never fired")), 2000);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(keepAlive);
        reject(init.signal?.reason);
      });
    });
  await assert.rejects(startWebsocketSession({ publicKey: "pk", fetchImpl: hang, timeoutMs: 20 }), /start request failed/);
});

// ------------------------------------------------------------------ transfer-status
const DIAL = { DialCallStatus: "no-answer", Called: "+19045550000", Caller: "+19045551111", CallSid: "CA123" };
const TENV = { TWILIO_AUTH_TOKEN: TOKEN, TRANSFER_ACTION_URL: ACTION_URL };

test("transfer-status: bad signature 403", async () => {
  const res = await transferStatusResponse(twilioPost(ACTION_URL, DIAL, "bogus"), { ...TENV, PIPECAT_PUBLIC_API_KEY: "pk" }, okStart());
  assert.equal(res.status, 403);
});

test("transfer-status: legacy stream URL output is unchanged (byte-for-byte with agents/transfer.py)", async () => {
  const env = { ...TENV, TRANSFER_STREAM_URL: "wss://us-east.api.pipecat.daily.co/ws/twilio", PIPECAT_SERVICE_HOST: "lp-receptionist.launchpad-local" };
  const res = await transferStatusResponse(twilioPost(ACTION_URL, DIAL, sign(ACTION_URL, DIAL)), env);
  assert.equal(
    await res.text(),
    dialActionTwiml("no-answer", env.TRANSFER_STREAM_URL, {
      toNumber: DIAL.Called,
      fromNumber: DIAL.Caller,
      serviceHost: env.PIPECAT_SERVICE_HOST,
    }),
  );
});

test("transfer-status: with a public key the reconnect gets a fresh token, urgent_message mode", async () => {
  const f = okStart();
  const res = await transferStatusResponse(twilioPost(ACTION_URL, DIAL, sign(ACTION_URL, DIAL)), { ...TENV, PIPECAT_PUBLIC_API_KEY: "pk" }, f);
  assert.equal(
    await res.text(),
    '<?xml version="1.0" encoding="UTF-8"?><Response><Connect>' +
      `<Stream url="${WS}/${SESSION_TOKEN}">` +
      '<Parameter name="mode" value="urgent_message" />' +
      '<Parameter name="to_number" value="+19045550000" />' +
      '<Parameter name="from_number" value="+19045551111" />' +
      "</Stream></Connect></Response>",
  );
  assert.equal(f.calls.length, 1);
});

test("transfer-status: answered transfer hangs up without a token; Pipecat failure -> spoken fallback", async () => {
  const done = { ...DIAL, DialCallStatus: "completed" };
  const f = okStart();
  const res = await transferStatusResponse(twilioPost(ACTION_URL, done, sign(ACTION_URL, done)), { ...TENV, PIPECAT_PUBLIC_API_KEY: "pk" }, f);
  assert.match(await res.text(), /<Response><Hangup \/><\/Response>/);
  assert.equal(f.calls.length, 0);

  const bad = fakeFetch(() => new Response("x", { status: 503 }));
  const res2 = await transferStatusResponse(twilioPost(ACTION_URL, DIAL, sign(ACTION_URL, DIAL)), { ...TENV, PIPECAT_PUBLIC_API_KEY: "pk" }, bad);
  assert.equal(res2.status, 200);
  assert.ok((await res2.text()).includes(RECONNECT_FALLBACK_LINE));
});

test("transfer-status: no key and no stream URL is a config error", async () => {
  const res = await transferStatusResponse(twilioPost(ACTION_URL, DIAL, sign(ACTION_URL, DIAL)), TENV);
  assert.equal(res.status, 500);
});
