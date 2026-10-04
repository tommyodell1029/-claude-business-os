import { test } from "node:test";
import assert from "node:assert/strict";
import { ONBOARD_CONSENT_TEXT, hashToken, intakesDb, isOpen, isTokenShape, normPhone, spanishAllowed, validateIntake } from "./onboard.ts";
import { intakeEmail, sendIntakeAlert } from "./onboardAlert.ts";

const hours = { mon: "08:00-17:00", tue: "08:00-17:00", wed: "08:00-17:00", thu: "08:00-17:00", fri: "08:00-17:00", sat: "closed", sun: "closed" };
const good = {
  business_name: "Acme Plumbing", industry: "plumbing", address: "1 Main St, Jacksonville FL", service_area: "Jacksonville\nOrange Park",
  hours, services: "Drain cleaning\nWater heaters", faqs: [{ q: "Free estimates?", a: "Yes." }, { q: "", a: "" }],
  owner_name: "Pat Lee", owner_phone: "(904) 555-0101", owner_email: "Pat@Example.com", handoff_number: "904-555-0102",
  emergency_keywords: "Burst pipe, gas smell", greeting: "How can I help?", languages: ["en"], never_say: "", consent: true, website: "",
};

test("token hash is stable sha256 hex and shape check rejects short/odd tokens", () => {
  assert.equal(hashToken("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.ok(isTokenShape("A".repeat(43)));
  for (const t of ["", "short", "a b".repeat(20), "A".repeat(200), "../../etc"]) assert.ok(!isTokenShape(t), t);
});

test("normPhone mirrors lp.text.norm_phone", () => {
  assert.equal(normPhone("(904) 555-0101"), "+19045550101");
  assert.equal(normPhone("1-904-555-0101"), "+19045550101");
  for (const bad of ["555-0101", "(104) 555-0101", "(904) 155-0101", "abc"]) assert.equal(normPhone(bad), null, bad);
});

test("valid intake normalizes contacts, lists and keywords", () => {
  const v = validateIntake(good, { spanishAllowed: false });
  assert.ok(v.ok);
  if (!v.ok) return;
  assert.equal(v.answers.owner_phone, "+19045550101");
  assert.equal(v.answers.owner_email, "pat@example.com");
  assert.deepEqual(v.answers.service_area, ["Jacksonville", "Orange Park"]);
  assert.deepEqual(v.answers.emergency_keywords, ["burst pipe", "gas smell"]);
  assert.deepEqual(v.answers.faqs, [{ q: "Free estimates?", a: "Yes." }]);
  assert.deepEqual(v.answers.never_say, []);
  assert.deepEqual(v.answers.languages, ["en"]);
});

test("required fields, consent, honeypot", () => {
  const bad = validateIntake({ ...good, business_name: "", owner_email: "nope", handoff_number: "123", consent: "on", services: "" }, { spanishAllowed: false });
  assert.ok(!bad.ok && !bad.spam);
  if (!bad.ok && !bad.spam) for (const k of ["business_name", "owner_email", "handoff_number", "consent", "services"]) assert.ok(bad.errors[k], k);
  assert.deepEqual(validateIntake({ ...good, website: "x" }, { spanishAllowed: false }), { ok: false, spam: true });
  assert.ok(!validateIntake(null, { spanishAllowed: false }).ok);
});

test("hours must be HH:MM-HH:MM with open before close, or closed", () => {
  for (const mon of ["", "9-5", "17:00-08:00", "08:00-08:00", "25:00-26:00"]) {
    const v = validateIntake({ ...good, hours: { ...hours, mon } }, { spanishAllowed: false });
    assert.ok(!v.ok && !v.spam && v.errors.hours_mon, mon);
  }
});

test("faq half-filled and template braces are rejected", () => {
  let v = validateIntake({ ...good, faqs: [{ q: "Only a question", a: "" }] }, { spanishAllowed: false });
  assert.ok(!v.ok && !v.spam && v.errors.faqs);
  v = validateIntake({ ...good, services: "{{secret}}" }, { spanishAllowed: false });
  assert.ok(!v.ok && !v.spam && v.errors.form);
});

test("Spanish only when the plan allows it, and needs a Spanish greeting", () => {
  let v = validateIntake({ ...good, languages: ["en", "es"], greeting_es: "Hola" }, { spanishAllowed: false });
  assert.ok(!v.ok && !v.spam && v.errors.languages);
  v = validateIntake({ ...good, languages: ["en", "es"] }, { spanishAllowed: true });
  assert.ok(!v.ok && !v.spam && v.errors.greeting_es);
  v = validateIntake({ ...good, languages: ["en", "es"], greeting_es: "¿En qué puedo ayudarle?" }, { spanishAllowed: true });
  assert.ok(v.ok && v.answers.languages.join() === "en,es" && v.answers.greeting_es);
  assert.ok(spanishAllowed({ tier: "scale", spanish: false }) && spanishAllowed({ tier: "launch", spanish: true }) && !spanishAllowed({ tier: "growth", spanish: false }));
});

test("expiry and status decide whether a link is open", () => {
  const row = { id: "1", client_slug: "acme", tier: "launch", spanish: false, business_hint: null, status: "pending", expires_at: "2026-10-10T00:00:00Z" } as const;
  assert.ok(isOpen(row, Date.parse("2026-10-09T00:00:00Z")));
  assert.ok(!isOpen(row, Date.parse("2026-10-10T00:00:01Z")));
  assert.ok(!isOpen({ ...row, status: "submitted" }));
});

test("claim is a conditional PATCH on token hash + pending + unexpired; empty result means already used", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(calls.length === 1 ? [{ id: "i1", client_slug: "acme", tier: "launch" }] : []), { status: 200 });
  }) as unknown as typeof fetch;
  const db = intakesDb("https://x.supabase.co/", "svc", fetchImpl);
  const h = hashToken("t");
  const fields = { answers: (validateIntake(good, { spanishAllowed: false }) as unknown as { answers: never }).answers, consent_text: ONBOARD_CONSENT_TEXT, ip_hash: "h" };
  const first = await db.claim(h, fields, "2026-10-05T00:00:00.000Z");
  assert.equal(first?.id, "i1");
  assert.match(calls[0].url, new RegExp(`token_hash=eq.${h}&status=eq.pending&expires_at=gt.`));
  assert.equal(calls[0].init?.method, "PATCH");
  assert.equal(JSON.parse(String(calls[0].init?.body)).status, "submitted");
  assert.equal(await db.claim(h, fields), null);
});

test("intake alert email has no client contact details", () => {
  const { subject, text } = intakeEmail({ client_slug: "acme", tier: "launch", business_name: "Acme Plumbing" });
  assert.match(subject, /Acme Plumbing/);
  assert.match(text, /onboard_client\.py acme/);
  assert.doesNotMatch(text, /@|\+1\d{10}/);
});

test("intake alert skipped without env, sent with idempotency key", async () => {
  const i = { id: "i1", client_slug: "acme", tier: "launch", business_name: "Acme" };
  assert.equal(await sendIntakeAlert(i, {}), "skipped");
  let headers: Record<string, string> = {};
  const f = (async (_u: string, init: RequestInit) => { headers = init.headers as Record<string, string>; return new Response("{}", { status: 200 }); }) as unknown as typeof fetch;
  assert.equal(await sendIntakeAlert(i, { RESEND_API_KEY: "k", NOTIFY_FROM_EMAIL: "a@b.co", LEAD_ALERT_EMAIL: "o@b.co" }, f), "sent");
  assert.equal(headers["idempotency-key"], "intake-alert-i1");
});
