// Run: npm test. Signature fixtures are computed here the way Stripe documents it (HMAC-SHA256 over "t.body").
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { POST } from "../app/api/stripe/webhook/route.ts";
import { eventRow, handleEvent, invoiceTotals, paymentRows, supabase, verifyStripeSignature } from "./stripe.ts";

const SECRET = "whsec_test_fixture";
const NOW = 1_790_000_000;
const sign = (body: string, t = NOW, secret = SECRET) =>
  `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;

const BODY = JSON.stringify({ id: "evt_1", type: "invoice.paid" });

test("accepts a correctly signed payload", () => {
  assert.equal(verifyStripeSignature(BODY, sign(BODY), SECRET, { nowSec: NOW }), true);
  assert.equal(verifyStripeSignature(BODY, `t=${NOW},v1=${"0".repeat(64)},` + sign(BODY).split(",")[1], SECRET,
    { nowSec: NOW }), true);
});

test("rejects missing, forged, tampered, or stale signatures", () => {
  assert.equal(verifyStripeSignature(BODY, null, SECRET, { nowSec: NOW }), false);
  assert.equal(verifyStripeSignature(BODY, "garbage", SECRET, { nowSec: NOW }), false);
  assert.equal(verifyStripeSignature(BODY, sign(BODY, NOW, "whsec_other"), SECRET, { nowSec: NOW }), false);
  assert.equal(verifyStripeSignature(BODY + " ", sign(BODY), SECRET, { nowSec: NOW }), false);
  assert.equal(verifyStripeSignature(BODY, sign(BODY, NOW - 301), SECRET, { nowSec: NOW }), false);
  assert.equal(verifyStripeSignature(BODY, `t=${NOW},v1=zz`, SECRET, { nowSec: NOW }), false);
  assert.equal(verifyStripeSignature(BODY, sign(BODY), "", { nowSec: NOW }), false);
});

test("route: unsigned or badly signed POST gets 400, never touches Supabase", async () => {
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  process.env.SUPABASE_URL = "http://127.0.0.1:9"; // unreachable on purpose
  process.env.SUPABASE_SERVICE_ROLE_KEY = "unused";
  const url = "http://localhost/api/stripe/webhook";
  assert.equal((await POST(new Request(url, { method: "POST", body: BODY }))).status, 400);
  const bad = new Request(url, { method: "POST", body: BODY, headers: { "stripe-signature": sign(BODY, NOW) } });
  assert.equal((await POST(bad)).status, 400); // stale timestamp vs real clock
});

test("route: not configured -> 500", async () => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
  assert.equal((await POST(new Request("http://x/", { method: "POST", body: BODY }))).status, 500);
});

// First invoice of a founding Launch checkout, basil shape: setup + one-time add-on paid now, $0 trial line.
const FIRST_INVOICE = {
  id: "in_1", customer: "cus_1", currency: "usd", status: "paid",
  parent: { subscription_details: { subscription: "sub_1", metadata: { client_slug: "test-co", tier: "launch" } } },
  lines: { data: [
    { amount: 49700, parent: { type: "invoice_item_details" }, pricing: { price_details: { product: "lp_tier_launch" } } },
    { amount: 19900, parent: { type: "invoice_item_details" }, pricing: { price_details: { product: "lp_addon_gbp_setup" } } },
    { amount: 0, parent: { type: "subscription_item_details" }, pricing: { price_details: { product: "lp_tier_launch" } } },
  ] },
};

// Later monthly invoice, legacy shape.
const MONTHLY_INVOICE = {
  id: "in_2", customer: "cus_1", subscription: "sub_1", currency: "usd",
  subscription_details: { metadata: { client_slug: "test-co" } },
  lines: { data: [
    { amount: 29700, type: "subscription", price: { type: "recurring", product: "lp_tier_launch" } },
    { amount: 9900, type: "subscription", price: { type: "recurring", product: "lp_addon_extra_number" } },
  ] },
};

test("invoice lines classify into setup / addon / monthly; $0 trial lines dropped", () => {
  assert.deepEqual([...invoiceTotals(FIRST_INVOICE)], [["setup", 49700], ["addon", 19900]]);
  assert.deepEqual([...invoiceTotals(MONTHLY_INVOICE)], [["monthly", 29700], ["addon", 9900]]);
});

test("payment rows carry slug, ids, dollars and status", () => {
  const rows = paymentRows({ id: "evt_2", type: "invoice.paid", data: { object: FIRST_INVOICE } });
  assert.deepEqual(rows[0], {
    stripe_invoice_id: "in_1", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", client_slug: "test-co",
    type: "setup", amount: 497, currency: "usd", status: "paid", stripe_event_id: "evt_2",
  });
  const failed = paymentRows({ id: "evt_3", type: "invoice.payment_failed", data: { object: MONTHLY_INVOICE } });
  assert.deepEqual(failed.map((r) => [r.type, r.status, r.stripe_subscription_id]),
    [["monthly", "failed", "sub_1"], ["addon", "failed", "sub_1"]]);
  assert.deepEqual(paymentRows({ id: "e", type: "customer.subscription.updated", data: { object: {} } }), []);
});

test("checkout.session.completed event row keeps metadata, no PII", () => {
  const row = eventRow({ id: "evt_4", type: "checkout.session.completed", livemode: false, data: { object: {
    id: "cs_1", client_reference_id: "test-co", payment_status: "paid", amount_total: 49700, subscription: "sub_1",
    customer: "cus_1", customer_details: { email: "owner@example.com", name: "Pat" },
    metadata: { client_slug: "test-co", tier: "launch", pricing: "founding", first_recurring_charge: "2026-12-01" },
  } } });
  assert.equal(row.client_slug, "test-co");
  assert.equal(row.summary.first_recurring_charge, "2026-12-01");
  assert.doesNotMatch(JSON.stringify(row), /owner@example\.com|Pat/);
});

test("handleEvent is idempotent on event.id and ignores unhandled types", async () => {
  const calls: string[] = [];
  const store = new Set<string>();
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url.split("/rest/v1/")[1]}`);
    if (!init?.method) return new Response(JSON.stringify(store.has("evt_5") ? [{ id: "evt_5" }] : []));
    if (url.includes("stripe_events")) store.add(JSON.parse(String(init.body))[0].id);
    return new Response(null, { status: 201 });
  }) as typeof fetch;
  const db = supabase("https://p.supabase.co/", "k", fakeFetch);
  const ev = { id: "evt_5", type: "invoice.paid", data: { object: FIRST_INVOICE } };
  assert.equal(await handleEvent(ev, db), "ok");
  assert.equal(await handleEvent(ev, db), "duplicate");
  assert.equal(await handleEvent({ id: "evt_6", type: "charge.refunded", data: { object: {} } }, db), "ignored");
  assert.deepEqual(calls, [
    "GET stripe_events?select=id&id=eq.evt_5",
    "POST payments?on_conflict=stripe_invoice_id,type",
    "POST stripe_events?on_conflict=id",
    "GET stripe_events?select=id&id=eq.evt_5",
  ]);
});
