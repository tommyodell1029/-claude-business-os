// Run: npm test. Fixtures were generated with the Python side (twilio RequestValidator and
// agents/transfer.py dial_action_twiml) so both implementations stay byte-for-byte compatible.
import assert from "node:assert/strict";
import { test } from "node:test";
import { dialActionTwiml, hangupTwiml, reconnectTwiml, validateTwilioSignature } from "./twilio.ts";

const URL_ = "https://example.vercel.app/api/twilio/transfer-status";
const PARAMS = { DialCallStatus: "no-answer", Called: "+19045550000", Caller: "+19045551111", CallSid: "CA123" };
const TOKEN = "test_token_123";
const PY_SIGNATURE = "8GG1ENEhk6XkGzSBtQhPXEmMsdo=";
const STREAM = "wss://api.pipecat.daily.co/ws/twilio";

test("accepts the signature Twilio's own validator computes", () => {
  assert.equal(validateTwilioSignature(TOKEN, URL_, PARAMS, PY_SIGNATURE), true);
});

test("rejects missing, wrong, or tampered signatures", () => {
  assert.equal(validateTwilioSignature(TOKEN, URL_, PARAMS, null), false);
  assert.equal(validateTwilioSignature(TOKEN, URL_, PARAMS, "bogus"), false);
  assert.equal(validateTwilioSignature("other_token", URL_, PARAMS, PY_SIGNATURE), false);
  assert.equal(validateTwilioSignature(TOKEN, URL_, { ...PARAMS, DialCallStatus: "completed" }, PY_SIGNATURE), false);
  assert.equal(validateTwilioSignature(TOKEN, URL_ + "?x=1", PARAMS, PY_SIGNATURE), false);
  assert.equal(validateTwilioSignature("", URL_, PARAMS, PY_SIGNATURE), false);
});

test("reconnect TwiML matches agents/transfer.py exactly", () => {
  const py =
    '<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="wss://api.pipecat.daily.co/ws/twilio">' +
    '<Parameter name="_pipecatCloudServiceHost" value="lp-receptionist.lp-org" />' +
    '<Parameter name="mode" value="urgent_message" />' +
    '<Parameter name="to_number" value="+19045550000" />' +
    '<Parameter name="from_number" value="+19045551111" /></Stream></Connect></Response>';
  const opts = { toNumber: "+19045550000", fromNumber: "+19045551111", serviceHost: "lp-receptionist.lp-org" };
  assert.equal(dialActionTwiml("no-answer", STREAM, opts), py);
});

test("answered transfer hangs up; every other status reconnects in urgent mode", () => {
  assert.equal(dialActionTwiml("completed", STREAM), hangupTwiml());
  for (const s of ["no-answer", "busy", "failed", "canceled", ""]) {
    assert.match(dialActionTwiml(s, STREAM), /value="urgent_message"/);
  }
});

test("attribute values are XML-escaped", () => {
  assert.match(reconnectTwiml(STREAM, { fromNumber: '"><Hangup/>' }), /value="&quot;&gt;&lt;Hangup\/&gt;"/);
});
