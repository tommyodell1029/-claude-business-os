import { test } from "node:test";
import assert from "node:assert/strict";
import { leadEmail, sendLeadAlert } from "./leadAlert.ts";

const lead = { name: "Pat\nLee", email: "pat@example.com", phone: null, business: "Lee Plumbing", message: "Need a quote" };
const ENV = { RESEND_API_KEY: "re_x", NOTIFY_FROM_EMAIL: "alerts@example.test", LEAD_ALERT_EMAIL: "boss@example.test" };

test("email has the lead details and a one-line subject", () => {
  const m = leadEmail(lead);
  assert.equal(m.subject, "New lead: Pat Lee (Lee Plumbing)");
  assert.match(m.text, /Email: pat@example.com/);
  assert.match(m.text, /Phone: not given/);
  assert.match(m.text, /Need a quote/);
});

test("sends via Resend with an idempotency key tied to the lead id", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => (calls.push({ url, init }), new Response("{}", { status: 200 }))) as unknown as typeof fetch;
  assert.equal(await sendLeadAlert(lead, "abc", ENV, f), "sent");
  const h = calls[0].init.headers as Record<string, string>;
  assert.equal(h["idempotency-key"], "lead-alert-abc");
  assert.deepEqual(JSON.parse(calls[0].init.body as string).to, ["boss@example.test"]);
});

test("skips when env is missing, reports failure on non-2xx or network error, never throws", async () => {
  assert.equal(await sendLeadAlert(lead, "a", { ...ENV, LEAD_ALERT_EMAIL: "" }), "skipped");
  const bad = (async () => new Response("no", { status: 422 })) as unknown as typeof fetch;
  assert.equal(await sendLeadAlert(lead, "a", ENV, bad), "failed");
  const boom = (async () => { throw new Error("net"); }) as unknown as typeof fetch;
  assert.equal(await sendLeadAlert(lead, null, ENV, boom), "failed");
});
