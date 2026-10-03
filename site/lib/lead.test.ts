import { test } from "node:test";
import assert from "node:assert/strict";
import { hashIp, leadsDb, makeLimiter, validateLead } from "./lead.ts";

const good = { name: "Pat Lee", email: "pat@example.com", phone: "", business: "Lee Plumbing", message: "hi", consent: true, website: "" };

test("valid lead passes and normalizes empties to null", () => {
  const v = validateLead(good);
  assert.ok(v.ok);
  if (v.ok) assert.deepEqual(v.lead, { name: "Pat Lee", email: "pat@example.com", phone: null, business: "Lee Plumbing", message: "hi" });
});

test("consent must be exactly true", () => {
  for (const consent of [false, "true", "on", 1, undefined]) {
    const v = validateLead({ ...good, consent });
    assert.ok(!v.ok && !v.spam && v.errors.consent, String(consent));
  }
});

test("needs email or phone", () => {
  const v = validateLead({ ...good, email: "", phone: "" });
  assert.ok(!v.ok && !v.spam && v.errors.contact);
  assert.ok(validateLead({ ...good, email: "", phone: "(904) 555-0100" }).ok);
});

test("rejects bad email, bad phone, missing name, oversize message", () => {
  const v = validateLead({ ...good, name: "", email: "nope", phone: "12", message: "x".repeat(2001) });
  assert.ok(!v.ok && !v.spam);
  if (!v.ok && !v.spam) for (const k of ["name", "email", "phone", "message"]) assert.ok(v.errors[k], k);
});

test("honeypot is flagged as spam", () => {
  const v = validateLead({ ...good, website: "http://spam.example" });
  assert.deepEqual(v, { ok: false, spam: true });
});

test("non-object bodies are rejected", () => {
  for (const b of [null, "x", [], 5]) assert.ok(!validateLead(b).ok);
});

test("hashIp is salted sha256 hex and never the raw ip", () => {
  const h = hashIp("1.2.3.4", "salt");
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.notEqual(h, hashIp("1.2.3.4", "other"));
  assert.ok(!h.includes("1.2.3.4"));
});

test("limiter blocks after max inside the window and recovers", () => {
  const l = makeLimiter(2, 1000);
  assert.ok(l.allow("a", 0) && l.allow("a", 1));
  assert.ok(!l.allow("a", 2));
  assert.ok(l.allow("b", 2));
  assert.ok(l.allow("a", 1500));
});

test("leadsDb sends service key server-side and parses count", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response('[{"id":"lead-1"}]', { status: 200, headers: { "content-range": "0-0/4" } });
  }) as unknown as typeof fetch;
  const db = leadsDb("https://x.supabase.co/", "KEY", f);
  assert.equal(await db.recentCount("abc", "2026-01-01T00:00:00.000Z"), 4);
  assert.equal(await db.insert({ name: "a" }), "lead-1");
  await db.markNotified("lead-1", "sent");
  assert.match(calls[2].url, /id=eq\.lead-1/);
  assert.match(calls[0].url, /ip_hash=eq\.abc/);
  assert.equal((calls[1].init.headers as Record<string, string>).apikey, "KEY");
});
