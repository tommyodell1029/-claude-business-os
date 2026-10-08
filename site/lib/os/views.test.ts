import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../jarvis/testkit.ts";
import { OS_CONFIG } from "./config.generated.ts";
import { addEvidence, createOpportunity } from "./opportunities.ts";
import { costView, loadView, revenueView, settingsView } from "./views.ts";

const NOW = Date.parse("2026-10-08T16:00:00Z");
const q = (s = "") => new URLSearchParams(s);

test("revenue counts only LIVE Stripe payments; test-mode payments are excluded and counted", async () => {
  const fx = fakeDb({
    payments: [
      { amount: "497.00", status: "paid", created_at: "2026-10-04T03:25:40Z", stripe_event_id: "evt_test" },
      { amount: "297.00", status: "paid", created_at: "2026-10-06T15:00:00Z", stripe_event_id: "evt_live" },
    ],
    stripe_events: [{ id: "evt_test", livemode: false }, { id: "evt_live", livemode: true }],
    revenue_entries: [{ venture: "AI Resume Toolkit", source: "manual", amount_usd: "40.00", cost_usd: "5.00", occurred_on: "2026-10-07" }],
  });
  const r = await revenueView(fx.db, NOW);
  assert.equal(r.excludedTestPayments, 1);
  assert.deepEqual(r.ventures, [
    { venture: "LaunchPad Local agency", revenue: 297, cost: 0, profit: 297 },
    { venture: "AI Resume Toolkit", revenue: 40, cost: 5, profit: 35 },
  ]);
  assert.equal(r.totals?.revenue, 337);
  assert.equal(r.totals?.profit, 332);
  assert.equal(r.totals?.thisMonth, 337);
});

test("revenue with no data is $0, not invented; an unreadable source is null (DATA UNAVAILABLE)", async () => {
  const empty = await revenueView(fakeDb().db, NOW);
  assert.deepEqual(empty.ventures, []);
  assert.equal(empty.totals?.revenue, 0);
  const fx = fakeDb();
  const broken = { ...fx.db, select: async () => { throw new Error("supabase 500"); } };
  const r = await revenueView(broken as typeof fx.db, NOW);
  assert.equal(r.ventures, null);
  assert.equal(r.totals, null);
});

test("AI cost: today, month, budget meter and per-task / per-opportunity groups from the ledger", async () => {
  const day = "2026-10-08";
  const fx = fakeDb({
    ai_cost_daily: [
      { day, calls: 3, input_tokens: 3000, output_tokens: 300, cost_usd: "0.5", any_estimated: true },
      { day: "2026-10-07", calls: 1, input_tokens: 100, output_tokens: 10, cost_usd: "0.25", any_estimated: false },
      { day: "2026-09-30", calls: 9, input_tokens: 9, output_tokens: 9, cost_usd: "9", any_estimated: false },
    ],
    ai_usage: [
      { at: "2026-10-08T15:00:00Z", task: "jarvis_chat", est_cost_usd: "0.2", opportunity_id: null },
      { at: "2026-10-08T15:01:00Z", task: "research", est_cost_usd: "0.3", opportunity_id: "o1" },
      { at: "2026-09-30T23:00:00Z", task: "research", est_cost_usd: "5", opportunity_id: "o1" },
    ],
  });
  const c = await costView(fx.db, NOW);
  assert.deepEqual(c.today, { costUsd: 0.5, calls: 3, estimated: true });
  assert.equal(c.month?.costUsd, 0.75, "September is not in October");
  const perDay = (OS_CONFIG as unknown as { budgets: { per_day_usd: number } }).budgets.per_day_usd;
  assert.equal(c.budget.pct, Math.round((0.5 / perDay) * 100));
  assert.deepEqual(c.byTask?.map((g) => g.key), ["research", "jarvis_chat"]);
  assert.deepEqual(c.perOpportunity, [{ key: "o1", calls: 1, costUsd: 0.3 }], "only this month's research counts");
});

test("views: unknown view 404, no database 503, settings carry no secrets", async () => {
  assert.equal((await loadView("users", fakeDb().db, q(), NOW)).status, 404);
  assert.equal((await loadView("revenue", null, q(), NOW)).status, 503);
  const s = JSON.stringify(await settingsView()).toLowerCase();
  for (const bad of ["key", "secret", "token", "password", "sk_", "eyj"]) assert.ok(!s.includes(bad), `settings must not contain ${bad}`);
});

test("opportunity detail: bad or unknown id is 404; a stored one returns scores, reasons and evidence", async () => {
  const fx = fakeDb();
  assert.equal((await loadView("opportunity", fx.db, q("id=not-a-uuid"), NOW)).status, 404);
  assert.equal((await loadView("opportunity", fx.db, q("id=11111111-1111-4111-8111-111111111111"), NOW)).status, 404);
  const c = await createOpportunity(fx.db, { name: "Creator invoice tool", category: "micro-saas" });
  const id = ("opportunity" in c ? c.opportunity.id : "") as string;
  await addEvidence(fx.db, id, [{ kind: "demand", claim: "Forum threads asking for it", source_url: "https://forum.example/t/1" }], NOW);
  const r = await loadView("opportunity", fx.db, q(`id=${id}`), NOW);
  assert.equal(r.status, 200);
  const item = (r.body as { item: { scores: unknown[]; evidence: unknown[]; why: { unknown: string[] } } }).item;
  assert.equal(item.scores.length, 15);
  assert.equal(item.evidence.length, 1);
  assert.equal(item.why.unknown.length, 15, "nothing scored yet, so everything is unknown");
  const list = await loadView("opportunities", fx.db, q(), NOW);
  assert.equal((list.body as { items: unknown[] }).items.length, 1);
});
