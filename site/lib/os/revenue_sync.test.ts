import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../jarvis/testkit.ts";
import { experimentChecks, parseTarget, suggest } from "./decide.ts";
import { syncGumroad, toSale } from "./gumroad.ts";

const NOW = Date.parse("2026-10-10T16:00:00Z");
const DAY = 86_400_000;
const sale = (id: string, extra: Record<string, unknown> = {}) => ({ id, product_name: "Etsy Seller AI Prompt Pack", price: 1200, gumroad_fee: 186, currency_symbol: "$", quantity: 1, created_at: "2026-10-09T23:30:00Z", refunded: false, ...extra });

function gumroad(pages: Record<string, unknown>[], seen: { url: string; headers: Record<string, string> }[] = []) {
  let i = 0;
  return (async (u: string, init: RequestInit = {}) => {
    seen.push({ url: String(u), headers: (init.headers ?? {}) as Record<string, string> });
    return Response.json(pages[Math.min(i++, pages.length - 1)]);
  }) as unknown as typeof fetch;
}

test("a sale is read from the API's cents; non-USD or incomplete sales are skipped", () => {
  const s = toSale(sale("abc123=="), "America/New_York");
  assert.ok(s);
  assert.equal(s.amountUsd, 12);
  assert.equal(s.feeUsd, 1.86);
  assert.equal(s.day, "2026-10-09"); // 23:30 UTC is still Oct 9 in Jacksonville
  assert.equal(toSale(sale("abc123==", { currency_symbol: "€" })), null);
  assert.equal(toSale(sale("abc123==", { price: "12.00" })), null);
  assert.equal(toSale({ id: "abc123==" }), null);
  assert.equal(toSale(sale("abc123==", { chargedback: true }))?.refunded, true);
});

test("sync records each sale once, pages through, marks refunds at $0 and keeps the token out of URLs", async () => {
  const fx = fakeDb();
  const seen: { url: string; headers: Record<string, string> }[] = [];
  const env = { GUMROAD_ACCESS_TOKEN: "gm-secret" };
  const first = await syncGumroad(fx.db, env, gumroad([
    { success: true, sales: [sale("s1aaaa"), sale("s2aaaa", { quantity: 2, price: 2400 })], next_page_key: "k2" },
    { success: true, sales: [sale("s3aaaa", { refunded: true }), { id: "bad" }] },
  ], seen), NOW);
  assert.ok(first.ok, first.error);
  assert.deepEqual([first.seen, first.added, first.skipped, first.addedUsd], [4, 3, 1, 36]);
  assert.match(seen[1].url, /page_key=k2/);
  for (const s of seen) assert.doesNotMatch(s.url, /gm-secret/);
  assert.equal(seen[0].headers.authorization, "Bearer gm-secret");
  const rows = fx.tables.revenue_entries;
  assert.equal(rows.length, 3);
  assert.equal(rows.find((r) => r.external_id === "gumroad:s2aaaa")?.units, 2);
  assert.equal(rows.find((r) => r.external_id === "gumroad:s3aaaa")?.amount_usd, 0);
  for (const r of rows) assert.equal(r.experiment_id, "a90685aa-39a7-40fd-8836-c23a9884801c");

  const again = await syncGumroad(fx.db, env, gumroad([{ success: true, sales: [sale("s1aaaa", { refunded: true }), sale("s2aaaa")] }]), NOW);
  assert.deepEqual([again.added, again.alreadyHad, again.refundsMarked], [0, 1, 1]);
  assert.equal(fx.tables.revenue_entries.length, 3);
  assert.equal(fx.tables.revenue_entries.find((r) => r.external_id === "gumroad:s1aaaa")?.amount_usd, 0);
});

test("sync refuses without a token and reports API errors without inventing sales", async () => {
  const fx = fakeDb();
  assert.match(String((await syncGumroad(fx.db, {}, gumroad([]), NOW)).error), /GUMROAD_ACCESS_TOKEN/);
  const bad = (async () => Response.json({ success: false, message: "The access token is invalid" }, { status: 401 })) as unknown as typeof fetch;
  const r = await syncGumroad(fx.db, { GUMROAD_ACCESS_TOKEN: "x" }, bad, NOW);
  assert.equal(r.ok, false);
  assert.match(String(r.error), /401: The access token is invalid/);
  assert.equal(fx.tables.revenue_entries, undefined);
});

test("targets are parsed, never guessed", () => {
  assert.deepEqual(parseTarget("3 sales in 14 days"), { sales: 3, days: 14 });
  assert.deepEqual(parseTarget("At least 10 orders"), { sales: 10, days: null });
  assert.deepEqual(parseTarget("get traction"), { sales: null, days: null });
  assert.deepEqual(parseTarget(null), { sales: null, days: null });
});

test("suggestions follow the Day 14 rules", () => {
  const base = { id: "e", name: "x", status: "validating", target: "3 sales in 14 days", targetSales: 3, windowDays: 14, day: 15, daysLeft: 0, deadline: "2026-10-22", sales: 0, revenueUsd: 0, entries: 0 };
  assert.equal(suggest({ ...base, sales: 3, revenueUsd: 36 }).action, "validated");
  assert.equal(suggest({ ...base, day: 5, daysLeft: 9 }).action, "wait");
  assert.equal(suggest({ ...base, sales: 1, revenueUsd: 12 }).action, "extend");
  const z = suggest(base);
  assert.equal(z.action, "review_traffic");
  assert.match(z.text, /DATA UNAVAILABLE/);
  assert.equal(suggest({ ...base, targetSales: null }).action, "set_target");
  assert.equal(suggest({ ...base, status: "killed" }).action, "closed");
});

test("checks count paid units per experiment and ignore refunds and closed experiments", async () => {
  const fx = fakeDb({
    experiments: [
      { id: "e1", name: "Prompt packs", status: "validating", target: "3 sales in 14 days", started_at: new Date(NOW - 2 * DAY).toISOString() },
      { id: "e2", name: "Old", status: "killed", target: "3 sales", started_at: new Date(NOW - 40 * DAY).toISOString() },
    ],
    revenue_entries: [
      { experiment_id: "e1", units: 2, amount_usd: 24 },
      { experiment_id: "e1", units: 1, amount_usd: 0 },
      { experiment_id: "e2", units: 5, amount_usd: 60 },
    ],
  });
  const [c, ...rest] = await experimentChecks(fx.db, NOW);
  assert.equal(rest.length, 0);
  assert.deepEqual([c.sales, c.revenueUsd, c.day, c.daysLeft, c.deadline], [2, 24, 3, 12, "2026-10-22"]);
  assert.equal(c.suggestion.action, "wait");
});
